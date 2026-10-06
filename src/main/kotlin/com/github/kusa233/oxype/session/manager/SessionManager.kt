package com.github.kusa233.oxype.session.manager

import com.github.cao.awa.cason.util.bytes.BytesUtil
import com.github.cao.awa.cason.util.math.SkippedBase256
import com.github.kusa233.oxype.session.LegacySession
import com.github.kusa233.oxype.session.Session
import com.github.kusa233.oxype.session.invite.SessionInviteList
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.SESSION_ACTIVE_UUIDS_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.SESSION_INVITE_UUID_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.SESSION_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.STORAGE
import com.github.kusa233.oxype.user.manager.UserManager
import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.Logger
import java.nio.charset.StandardCharsets
import java.util.UUID

object SessionManager {
    private val LOGGER: Logger = LogManager.getLogger("SessionManager")

    /** Maximum number of live invite UUIDs a single session may hold. */
    const val MAX_INVITE_UUIDS: Int = 10

    fun createSession(sessionName: String, owner: Long = 0L, description: String = ""): Session {
        return createSession(STORAGE.incrementSessionId(), sessionName, owner, description)
    }

    fun createSession(sessionId: Long, sessionName: String, owner: Long = 0L, description: String = ""): Session {
        val session = Session(
            sessionId = sessionId,
            sessionName = sessionName,
            owner = owner,
            admins = mutableListOf(),
            members = if (owner != 0L) mutableListOf(owner) else mutableListOf(),
            description = description
        )
        saveSession(session)
        return session
    }

    fun saveSession(session: Session) {
        STORAGE[createSessionKey(session.sessionId)] = session
    }

    fun getSession(sessionId: Long): Session? {
        val key = createSessionKey(sessionId)

        val session = try {
            STORAGE[key, Session::class]
        } catch (e: Exception) {
            // Records written before the owner/admins/members/description fields
            // existed cannot be decoded as a Session, because their list nodes are
            // missing. Read them through the legacy shape and upgrade in place.
            upgradeLegacySession(key)
        } ?: return null

        // Older records predate the owner field; keep the owner visible as a member.
        session.ensureOwnerIsMember()
        return session
    }

    /** Reads a pre-owner session record and rewrites it in the current shape. */
    private fun upgradeLegacySession(key: ByteArray): Session? {
        val legacy = try {
            STORAGE[key, LegacySession::class]
        } catch (e: Exception) {
            LOGGER.warn("Unreadable session record, ignoring it: ${e.message}")
            null
        } ?: return null

        val upgraded = legacy.toSession()
        STORAGE[key] = upgraded
        LOGGER.info("Upgraded legacy session ${upgraded.sessionId} to the current schema")
        return upgraded
    }

    fun createSessionKey(sessionId: Long): ByteArray {
        return BytesUtil.concat(SESSION_PREFIX, SkippedBase256.longToBuf(sessionId))
    }

    fun normalizeInviteUuid(uuid: String): String {
        var s = uuid.trim()
        while (s.length >= 2 && s.startsWith("\"") && s.endsWith("\"")) {
            s = s.substring(1, s.length - 1).trim()
        }
        return s
    }

    fun createInviteKey(uuid: String): ByteArray {
        return BytesUtil.concat(
            SESSION_INVITE_UUID_PREFIX,
            normalizeInviteUuid(uuid).toByteArray(StandardCharsets.UTF_8)
        )
    }

    fun createSessionActiveUuidsKey(sessionId: Long): ByteArray {
        return BytesUtil.concat(
            SESSION_ACTIVE_UUIDS_PREFIX,
            SkippedBase256.longToBuf(sessionId)
        )
    }

    fun getInviteList(sessionId: Long): SessionInviteList {
        val inviteList = STORAGE[createSessionActiveUuidsKey(sessionId), SessionInviteList::class]
            ?: return SessionInviteList(mutableListOf())

        var changed = false
        val cleanList = mutableListOf<String>()
        for (raw in inviteList.uuids) {
            val clean = normalizeInviteUuid(raw)
            if (clean != raw) {
                changed = true
            }
            if (!cleanList.contains(clean)) {
                cleanList.add(clean)
            }
        }
        if (changed || cleanList.size != inviteList.uuids.size) {
            inviteList.uuids.clear()
            inviteList.uuids.addAll(cleanList)
            STORAGE[createSessionActiveUuidsKey(sessionId)] = inviteList
        }
        return inviteList
    }

    fun getInviteUuids(sessionId: Long, ownerId: Long): List<String> {
        val session = getSession(sessionId) ?: throw IllegalArgumentException("Session not found")
        requireOwner(session, ownerId)
        return getInviteList(sessionId).uuids.map { normalizeInviteUuid(it) }.distinct()
    }

    /** Generates a fresh invite UUID, enforcing the per-session cap. */
    fun createInviteUuid(sessionId: Long, ownerId: Long): String {
        val session = getSession(sessionId) ?: throw IllegalArgumentException("Session not found")
        requireOwner(session, ownerId)

        val inviteList = getInviteList(sessionId)
        if (inviteList.uuids.size >= MAX_INVITE_UUIDS) {
            throw IllegalStateException("A session can hold at most $MAX_INVITE_UUIDS invite UUIDs")
        }

        val uuid = UUID.randomUUID().toString()
        val cleanUuid = normalizeInviteUuid(uuid)
        inviteList.uuids.add(cleanUuid)
        STORAGE[createSessionActiveUuidsKey(sessionId)] = inviteList
        STORAGE[createInviteKey(cleanUuid)] = sessionId.toString()
        return cleanUuid
    }

    fun revokeInviteUuid(sessionId: Long, ownerId: Long, uuid: String): Boolean {
        val session = getSession(sessionId) ?: throw IllegalArgumentException("Session not found")
        requireOwner(session, ownerId)

        val inviteList = getInviteList(sessionId)
        val clean = normalizeInviteUuid(uuid)
        val removed = inviteList.uuids.removeIf { normalizeInviteUuid(it) == clean }
        if (removed) {
            STORAGE[createSessionActiveUuidsKey(sessionId)] = inviteList
            STORAGE.remove(createInviteKey(clean))
            STORAGE.remove(createInviteKey(uuid))
            STORAGE.remove(createInviteKey("\"$clean\""))
        }
        return removed
    }

    /** Resolves an invite UUID and adds the user to the target session. */
    fun joinByInviteUuid(uuid: String, userid: Long): Session {
        val trimmed = normalizeInviteUuid(uuid)
        if (trimmed.isEmpty()) {
            throw IllegalArgumentException("Invite UUID is required")
        }

        val sessionIdStr = STORAGE.getString(createInviteKey(trimmed))
            ?: STORAGE.getString(createInviteKey(uuid))
            ?: STORAGE.getString(createInviteKey("\"$trimmed\""))
            ?: throw IllegalArgumentException("Invalid or expired invite UUID")
        val sessionId = sessionIdStr.toLongOrNull()
            ?: throw IllegalArgumentException("Invalid invite UUID mapping")

        val session = getSession(sessionId)
            ?: throw IllegalArgumentException("Target session not found")

        session.addMember(userid)
        saveSession(session)
        UserManager.joinSession(userid, sessionId)
        return session
    }

    private fun requireOwner(session: Session, ownerId: Long) {
        if (!session.isOwner(ownerId)) {
            throw IllegalStateException("Only the session owner can manage invite UUIDs")
        }
    }
}
