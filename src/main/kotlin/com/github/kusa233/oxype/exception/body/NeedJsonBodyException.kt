package com.github.kusa233.oxype.exception.body

import com.github.kusa233.kalmia.server.network.http.error.KalmiaHttpErrors

class NeedJsonBodyException(msg: String): Exception(msg) {
    companion object {
        fun create(msg: String): NeedJsonBodyException {
            return NeedJsonBodyException(msg)
        }
    }
}