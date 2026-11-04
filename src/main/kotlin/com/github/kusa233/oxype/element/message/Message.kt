package com.github.kusa233.oxype.element.message

import com.github.cao.awa.cason.obj.JSONObject
import com.github.kusa233.oxype.element.message.piece.MessagePieces

data class Message(
    val id: Long,
    val sender: Long,
    val timestamp: Long,
    val pieces: MessagePieces,
    /**
     * When the body was last changed, or 0 for a message nobody has edited.
     *
     * A zero is the "never edited" marker rather than a separate boolean, so the
     * client can say *when* it changed without another round trip, and records
     * written before this field existed decode as an unedited message.
     */
    val editedAt: Long = 0L
) {
    companion object {
        fun decode(json: JSONObject): Message {
            val id = json.getLong("id")!!
            val sender = json.getLong("sender")!!
            // Records written before the timestamp field existed have no value; they
            // decode as 0 and the client simply renders no clock time for them.
            val timestamp = json.getLong("timestamp") ?: 0L
            // Same tolerance as timestamp: older records carry no edit marker at all.
            val editedAt = json.getLong("editedAt") ?: 0L
            val pieces = MessagePieces.decode(json.getArray("pieces")!!)

            return Message(
                id,
                sender,
                timestamp,
                pieces,
                editedAt
            )
        }
    }

    fun encode(): JSONObject {
        return JSONObject {
            "id" set id
            "sender" set sender
            "timestamp" set timestamp
            "editedAt" set editedAt
            "pieces" set pieces.encode()
        }
    }
}
