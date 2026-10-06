package com.github.kusa233.oxype.element.message

import com.github.cao.awa.cason.obj.JSONObject
import com.github.kusa233.oxype.element.message.piece.MessagePieces

data class Message(
    val id: Long,
    val sender: Long,
    val pieces: MessagePieces
) {
    companion object {
        fun decode(json: JSONObject): Message {
            val id = json.getLong("id")!!
            val sender = json.getLong("sender")!!
            val pieces = MessagePieces.decode(json.getArray("pieces")!!)

            return Message(
                id,
                sender,
                pieces
            )
        }
    }

    fun encode(): JSONObject {
        return JSONObject {
            "id" set id
            "sender" set sender
            "pieces" set pieces.encode()
        }
    }
}
