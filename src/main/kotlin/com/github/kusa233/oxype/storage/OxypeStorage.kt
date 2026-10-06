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