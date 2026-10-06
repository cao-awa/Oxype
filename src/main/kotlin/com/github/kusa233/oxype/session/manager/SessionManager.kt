package com.github.kusa233.oxype.session.manager

import com.github.cao.awa.cason.util.bytes.BytesUtil
import com.github.cao.awa.cason.util.math.SkippedBase256
import com.github.kusa233.oxype.session.Session
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.SESSION_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.STORAGE
import com.github.kusa233.oxype.user.manager.UserManager.createUserKey

object SessionManager {
    fun createSession(sessionName: String): Session {
        return createSession(STORAGE.incrementSessionId(), sessionName)
    }

    fun createSession(sessionId: Long, sessionName: String): Session {
        val key = createSessionKey(sessionId)

        return Session(sessionId, sessionName).also { session ->
            STORAGE[key] = session
        }
    }

    fun getSession(sessionId: Long): Session? {
        return STORAGE[createSessionKey(sessionId), Session::class]
    }

    fun createSessionKey(sessionId: Long): ByteArray {
        return BytesUtil.concat(SESSION_PREFIX, SkippedBase256.longToBuf(sessionId))
    }
}