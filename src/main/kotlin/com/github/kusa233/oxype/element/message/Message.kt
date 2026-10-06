package com.github.kusa233.oxype.element.message

import com.github.cao.awa.cason.obj.JSONObject
import com.github.kusa233.oxype.element.message.piece.MessagePieces

data class Message(
    val id: Long,
    val sender: Long,
    val timestamp: Long,
    val pieces: MessagePieces
) {
    companion object {
        fun decode(json: JSONObject): Message {
            val id = json.getLong("id")!!
            val sender = json.getLong("sender")!!
            // Records written before the timestamp field existed have no value; they
            // decode as 0 and the client simply renders no clock time for them.
            val timestamp = json.getLong("timestamp") ?: 0L
            val pieces = MessagePieces.decode(json.getArray("pieces")!!)

            return Message(
                id,
                sender,
                timestamp,
                pieces
            )
        }
    }

    fun encode(): JSONObject {
        return JSONObject {
            "id" set id
            "sender" set sender
            "timestamp" set timestamp
            "pieces" set pieces.encode()
        }
    }
}
