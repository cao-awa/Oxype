package com.github.kusa233.oxype.message

import com.github.cao.awa.cason.obj.JSONObject
import com.github.cao.awa.cason.util.bytes.BytesUtil
import com.github.cao.awa.cason.util.math.SkippedBase256
import com.github.kusa233.oxype.element.message.Message
import com.github.kusa233.oxype.element.message.piece.MessagePiece
import com.github.kusa233.oxype.element.message.piece.MessagePieces
import com.github.kusa233.oxype.json.OxypeJsonParser
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.SESSION_MESSAGE_SEQ_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.SESSION_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.SESSION_RECEIVED_MESSAGE_SEQ_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.STORAGE

object MessageManager {
    fun getReceivedMessageSeq(userid: Long, sessionId: Long): Long {
        return STORAGE[createReceivedMessageSeqKey(userid, sessionId), Long::class] ?: 0L
    }

    fun setReceivedMessageSeq(userid: Long, sessionId: Long, seq: Long) {
        STORAGE[createReceivedMessageSeqKey(userid, sessionId)] = seq
    }

    fun maxReceivedMessageSeq(sessionId: Long): Long {
        val key = BytesUtil.concat(SESSION_MESSAGE_SEQ_PREFIX, SkippedBase256.longToBuf(sessionId))

        return STORAGE[key, Long::class] ?: 0L
    }

    fun sendMessage(sessionId: Long, sender: Long, pieces: MessagePieces): Long {
        val messageId = STORAGE.incrementMessageSeq(sessionId)
        val message = Message(messageId, sender, System.currentTimeMillis(), pieces)
        STORAGE[createMessageKey(sessionId, messageId)] = message.encode().toString()
        return messageId
    }

    fun createReceivedMessageSeqKey(userid: Long, sessionId: Long): ByteArray {
        return BytesUtil.concat(
            SESSION_RECEIVED_MESSAGE_SEQ_PREFIX,
            SkippedBase256.longToBuf(userid),
            SkippedBase256.longToBuf(sessionId)
        )
    }

    fun createMessageKey(sessionId: Long, messageId: Long): ByteArray {
        return BytesUtil.concat(
            SESSION_PREFIX,
            SkippedBase256.longToBuf(sessionId),
            SkippedBase256.longToBuf(messageId)
        )
    }

    fun getMessage(sessionId: Long, messageSeq: Long): Message? {
        val source = STORAGE[createMessageKey(sessionId, messageSeq), String::class] ?: return null
        // Read through OxypeJsonParser rather than Cason's own reader. A stored message is
        // JSON written by Cason's (correct) encoder, but any body containing a newline is
        // stored with a `\n` escape, and Cason 1.0.35 hands escaped strings back with a
        // stray leading quote -- which would corrupt every multi-line message as it was
        // read back, and lengthen it on each subsequent round trip.
        val json = OxypeJsonParser.parseObject(source)
        return Message.decode(json)
    }

    fun getMessages(sessionId: Long, start: Long, end: Long): List<Message> {
        val messages = mutableListOf<Message>()
        for (i in start..end) {
            getMessage(sessionId, i)?.let {
                messages.add(it)
            }
        }
        return messages
    }

    fun getLastMessage(sessionId: Long): Message? {
        val maxSeq = maxReceivedMessageSeq(sessionId)
        if (maxSeq <= 0L) {
            return null
        }
        return getMessage(sessionId, maxSeq)
    }
}