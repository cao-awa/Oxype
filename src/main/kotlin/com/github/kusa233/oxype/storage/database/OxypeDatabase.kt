package com.github.kusa233.oxype.storage.database

import com.github.benmanes.caffeine.cache.Caffeine
import com.github.cao.awa.cason.util.bytes.BytesUtil
import com.github.cao.awa.cason.util.math.SkippedBase256
import com.github.kusa233.kalmia.rocksdb.db.KalmiaRocksDB
import com.github.kusa233.oxype.storage.OxypeStorage
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.SESSION_MESSAGE_SEQ_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.SESSION_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.USER_PREFIX
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlin.reflect.KClass

object OxypeDatabase : OxypeStorage {
    private val cache = Caffeine.newBuilder().apply {
        maximumSize(20480)
        expireAfterWrite(15, TimeUnit.MINUTES)
    }.build<String, Any>()
    private val db: KalmiaRocksDB = OxypeDatabaseInitializer.init()

    @Suppress("UNCHECKED_CAST")
    override fun <T : Any> get(key: ByteArray, type: KClass<T>): T? {
        val result = this.cache.getIfPresent((key.contentToString()))
        if (result != null) {
            return result as T?
        }
        return this.db[key, type].also {
            if (it != null) {
                this.cache.put(key.contentToString(), it)
            }
        }
    }

    override fun getBytes(key: ByteArray): ByteArray? {
        return this.db[key]
    }

    /**
     * Reads a String value.
     *
     * Values written through [set] are encoded by the underlying store, so the
     * typed getter is the only correct way to read them back.
     */
    override fun getString(key: ByteArray): String? {
        return get(key, String::class)
    }

    /** Drops a key from both the store and the in-memory cache. */
    override fun remove(key: ByteArray) {
        this.db.remove(key)
        this.cache.invalidate(key.contentToString())
    }

    override fun incrementUserId(): Long {
        var result: Long? = this.db[USER_PREFIX]
        if (result == null) {
            result = 1L
        } else {
            result += 1L
        }
        set(
            USER_PREFIX,
            result
        )
        return result
    }

    override fun incrementSessionId(): Long {
        var result: Long? = this.db[SESSION_PREFIX]
        if (result == null) {
            result = 1L
        } else {
            result += 1L
        }
        set(
            SESSION_PREFIX,
            result
        )
        return result
    }

    override fun incrementMessageSeq(sessionId: Long): Long {
        val key = BytesUtil.concat(SESSION_MESSAGE_SEQ_PREFIX, SkippedBase256.longToBuf(sessionId))
        var result: Long? = this.db[key]
        if (result == null) {
            result = 1L
        } else {
            result += 1L
        }
        set(
            key,
            result
        )
        return result
    }

    override fun set(key: ByteArray, value: Any) {
        this.db[key] = value
        this.cache.put(key.contentToString(), value)
    }
}