package com.github.kusa233.oxype.exception.request

class MissingParameterException(msg: String): Exception(msg) {
    companion object {
        fun create(msg: String): MissingParameterException {
            return MissingParameterException(msg)
        }
    }
}