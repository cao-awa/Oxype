package com.github.kusa233.oxype.element.message.piece

import com.github.cao.awa.cason.obj.JSONObject

abstract class MessagePiece {
    companion object {
        private val CODECS: MutableMap<String, (JSONObject) -> MessagePiece> = mutableMapOf()

        init {
            registerCodec("text") {
                MessageTextPiece.decode(it)
            }
        }

        fun registerCodec(name: String, decoder: (JSONObject) -> MessagePiece) {
            CODECS[name] = decoder
        }

        fun decode(json: JSONObject): MessagePiece {
            val type = json.getString("type")!!
            val decoder = CODECS[type]!!

            return decoder(json)
        }
    }

    abstract fun encode(): JSONObject
}