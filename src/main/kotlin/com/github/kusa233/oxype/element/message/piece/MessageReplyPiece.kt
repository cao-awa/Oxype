package com.github.kusa233.oxype.element.message.piece

import com.github.cao.awa.cason.obj.JSONObject

/**
 * A quotation of an earlier message, carried as the first piece of a reply.
 *
 * The quoted body is stored *inside* the reply rather than looked up when the reply
 * is read. A quotation is part of what the author wrote: if the original is edited
 * afterwards the reply still shows what was actually being answered, and if the
 * original is deleted the reply keeps its context instead of decaying into a
 * dangling pointer. The id is still kept, so a client can offer to jump back to the
 * quoted message when it is still there.
 *
 * [sender], [senderName] and [text] are filled in by the server from the stored
 * message, never taken from the request, so a client cannot fabricate a quotation
 * of words nobody wrote. They decode as empty here, which is what a request that
 * carries only `{"type":"reply","messageId":N}` looks like before enrichment.
 */
data class MessageReplyPiece(
    val messageId: Long,
    val sender: Long = 0L,
    val senderName: String = "",
    val text: String = ""
) : MessagePiece() {
    companion object {
        /** Value of the `type` field identifying this piece. */
        const val TYPE: String = "reply"

        fun decode(json: JSONObject): MessageReplyPiece {
            return MessageReplyPiece(
                json.getLong("messageId") ?: 0L,
                json.getLong("sender") ?: 0L,
                json.getString("senderName") { "" },
                json.getString("text") { "" }
            )
        }
    }

    override fun encode(): JSONObject {
        return JSONObject {
            "type" set TYPE
            "messageId" set messageId
            "sender" set sender
            "senderName" set senderName
            "text" set text
        }
    }
}
