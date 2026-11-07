package com.github.kusa233.oxype.storage

import com.github.kusa233.oxype.storage.database.OxypeDatabase
import kotlin.reflect.KClass

interface OxypeStorage {
    companion object {
        val STORAGE: OxypeStorage = OxypeDatabase
        val USER_PREFIX: ByteArray = byteArrayOf(0, 0)
        val SESSION_PREFIX: ByteArray = byteArrayOf(0, 1)
        val USER_TOKEN_PREFIX: ByteArray = byteArrayOf(0, 2)
        val USER_JOINED_SESSIONS_PREFIX: ByteArray = byteArrayOf(0, 3)
        val SESSION_MESSAGE_SEQ_PREFIX: ByteArray = byteArrayOf(0, 4)
        val SESSION_RECEIVED_MESSAGE_SEQ_PREFIX: ByteArray = byteArrayOf(0, 5)
        /** Maps an invite UUID to the session id it grants access to. */
        val SESSION_INVITE_UUID_PREFIX: ByteArray = byteArrayOf(0, 6)
        /** Maps a session id to its list of live invite UUIDs. */
        val SESSION_ACTIVE_UUIDS_PREFIX: ByteArray = byteArrayOf(0, 7)

        /**
         * Maps a user id to the ids of the users they are friends with.
         *
         * Friends are stored per side rather than as one shared record, so a
         * lookup only ever reads the row of the user being asked about. The two
         * rows are kept in step by [com.github.kusa233.oxype.friend.manager.FriendManager]
         * and are always written together.
         */
        val FRIEND_PREFIX: ByteArray = byteArrayOf(0, 8)

        /** Maps a user id to the friend requests other users sent to them. */
        val FRIEND_REQUEST_PREFIX: ByteArray = byteArrayOf(0, 9)

        /**
         * Maps a user id to the friend requests they sent and that are still
         * pending.
         *
         * The mirror of [FRIEND_REQUEST_PREFIX]: a request is only ever stored
         * in the recipient's row, so without this the sender could not be told
         * what they have outstanding — finding out would mean scanning every
         * account. Both rows are written and cleared together.
         */
        val FRIEND_OUTGOING_REQUEST_PREFIX: ByteArray = byteArrayOf(0, 11)

        /**
         * Maps an ordered pair of user ids to the id of the one-to-one
         * conversation those two users share.
         *
         * Keyed by the pair rather than by either user so that both sides of a
         * friendship resolve to the same conversation without writing the
         * mapping twice, and so that re-adding a friend who was previously
         * removed can be given a fresh conversation.
         */
        val FRIEND_CONVERSATION_PREFIX: ByteArray = byteArrayOf(0, 10)
    }

    operator fun set(key: ByteArray, value: Any)
    operator fun <T: Any> get(key: ByteArray, type: KClass<T>): T?

    fun getString(key: ByteArray): String?

    fun remove(key: ByteArray)

    fun getBytes(key: ByteArray): ByteArray?

    fun incrementUserId(): Long

    fun incrementSessionId(): Long

    fun incrementMessageSeq(sessionId: Long): Long
}