package com.github.kusa233.oxype.element.message.piece

import com.github.cao.awa.cason.obj.JSONObject

/**
 * A message body written in Markdown.
 *
 * The raw Markdown source travels between client and server unchanged: the server
 * never renders it, so there is exactly one renderer -- the one that has to be safe
 * in a browser -- and no second implementation to keep in sync. The piece type is
 * what tells the receiving client whether a body is literal text or Markdown, so a
 * plain-text message is never accidentally interpreted as markup.
 */
data class MessageMarkdownPiece(
    val text: String
) : MessagePiece() {
    companion object {
        /** Value of the `type` field identifying this piece. */
        const val TYPE: String = "markdown"

        fun decode(json: JSONObject): MessageMarkdownPiece {
            return MessageMarkdownPiece(json.getString("text") { "" })
        }
    }

    override fun encode(): JSONObject {
        return JSONObject {
            "type" set TYPE
            "text" set text
        }
    }
}
