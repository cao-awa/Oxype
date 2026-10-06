package com.github.kusa233.oxype.element.message.piece

import com.github.cao.awa.cason.obj.JSONObject

data class MessageTextPiece(
    val text: String
) : MessagePiece() {
    companion object {
        fun decode(json: JSONObject): MessageTextPiece {
            return MessageTextPiece(json.getString("text") { "" })
        }
    }

    override fun encode(): JSONObject {
        return JSONObject {
            "type" set "text"
            "text" set text
        }
    }
}