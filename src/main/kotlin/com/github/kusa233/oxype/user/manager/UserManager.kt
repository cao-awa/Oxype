package com.github.kusa233.oxype.user.manager

import com.github.cao.awa.cason.util.bytes.BytesUtil
import com.github.cao.awa.cason.util.math.SkippedBase256
import com.github.kusa233.oxype.hash.password.PasswordHasher
import com.github.kusa233.oxype.session.list.SessionList
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.STORAGE
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.USER_JOINED_SESSIONS_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.USER_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.USER_TOKEN_PREFIX
import com.github.kusa233.oxype.user.User
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.Random

object UserManager {
    private val RANDOM: Random = Random()
    /**
     * URL-safe alphabet on purpose: tokens travel in the query string for GET
     * routes, and the standard Base64 alphabet contains '+', which query-string
     * decoding rewrites to a space and silently breaks authentication.
     */
    private val BASE64_ENCODER: Base64.Encoder = Base64.getUrlEncoder().withoutPadding()
    private val BASE64_DECODER: Base64.Decoder = Base64.getUrlDecoder()
    private val loggedUsers: MutableMap<String, Long> = mutableMapOf()

    fun getJoinedSessions(userid: Long): SessionList {
        return STORAGE[createJoinedSessionsKey(userid), SessionList::class] ?: SessionList.EMPTY
    }

    fun joinSession(userid: Long, sessionId: Long) {
        val key = createJoinedSessionsKey(userid)
        val sessionList = STORAGE[key, SessionList::class] ?: SessionList(false, mutableListOf())
        sessionList.add(sessionId)
        STORAGE[key] = sessionList
    }

    fun leaveSession(userid: Long, sessionId: Long) {
        val key = createJoinedSessionsKey(userid)
        val sessionList = STORAGE[key, SessionList::class] ?: return
        sessionList.remove(sessionId)
        STORAGE[key] = sessionList
    }

    /** Resolves a logged-in user id from a token, if that token is still active. */
    fun getUserIdByToken(token: String): Long? {
        return this.loggedUsers[token]
    }

    fun register(username: String, password: String): User {
        return register(STORAGE.incrementUserId(), username, password)
    }

    private fun register(userid: Long, username: String, password: String): User {
        val key = createUserKey(userid)
        val hashedPassword = PasswordHasher.hash(password)

        return User(userid, username, hashedPassword).also { user ->
            STORAGE[key] = user
        }
    }

    fun getUser(userid: Long): User? {
        return STORAGE[createUserKey(userid), User::class]
    }

    fun getUserByToken(token: String, userid: Long): User? {
        var user: User? = null
        if (this.loggedUsers[token] == null) {
            val persistingToken = STORAGE.getString(createTokenKey(userid, token))
            if (persistingToken == token) {
                user = getUser(userid)
                this.loggedUsers[token] = userid
            }
        } else {
            user = getUser(userid)
        }
        return user
    }

    fun login(userid: Long): String {
        val timestamp = System.currentTimeMillis()
        val randomData = ByteArray(24)
        RANDOM.nextBytes(randomData)
        val random = BASE64_ENCODER.encodeToString(randomData)
        return login(userid, "$timestamp:$random")
    }

    private fun login(userid: Long, token: String): String {
        STORAGE[createTokenKey(userid, token)] = token
        loggedUsers[token] = userid
        return token
    }

    fun logout(userid: Long, token: String) {
        STORAGE.remove(createTokenKey(userid, token))
        this.loggedUsers.remove(token)
    }

    fun verifyToken(userid: Long, token: String): Boolean {
        return STORAGE.getString(
            createTokenKey(userid, token)
        ) == token || this.loggedUsers[token] == userid
    }

    fun verifyPassword(userid: Long, password: String): Boolean {
        val user = STORAGE[createUserKey(userid), User::class]
        return if (user != null) {
            PasswordHasher.verify(password, user.hashedPassword)
        } else {
            false
        }
    }

    fun verifyAlive(userid: Long, token: String): Boolean {
        if (this.loggedUsers[token] != null) {
            return true
        }
        if (STORAGE[createTokenKey(userid, token), String::class] != null) {
            return true
        }
        return false
    }

    fun createTokenKey(userid: Long, token: String): ByteArray {
        return BytesUtil.concat(
            USER_TOKEN_PREFIX,
            SkippedBase256.longToBuf(userid),
            token.toByteArray(StandardCharsets.UTF_8)
        )
    }

    fun createJoinedSessionsKey(userid: Long): ByteArray {
        return BytesUtil.concat(
            USER_JOINED_SESSIONS_PREFIX,
            SkippedBase256.longToBuf(userid),
        )
    }

    fun createUserKey(userid: Long): ByteArray {
        return BytesUtil.concat(USER_PREFIX, SkippedBase256.longToBuf(userid))
    }
}