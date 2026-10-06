package com.github.kusa233.oxype.element.message.piece

import com.github.cao.awa.cason.array.JSONArray
import com.github.cao.awa.cason.obj.JSONObject
import java.util.LinkedList

data class MessagePieces(
    val pieces: List<MessagePiece>
) {
    companion object {
        fun decode(json: JSONArray): MessagePieces {
            val pieces = LinkedList<MessagePiece>()
            json.forEach {
                val json = it as JSONObject
                pieces.add(MessagePiece.decode(json))
            }
            return MessagePieces(pieces)
        }
    }

    fun encode(): JSONArray {
        return JSONArray {
            pieces.forEach { piece ->
                add(piece.encode())
            }
        }
    }
}