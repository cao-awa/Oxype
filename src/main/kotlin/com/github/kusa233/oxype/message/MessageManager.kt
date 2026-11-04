package com.github.kusa233.oxype.message

import com.github.cao.awa.cason.serialize.parser.JSONParser
import com.github.cao.awa.cason.util.bytes.BytesUtil
import com.github.cao.awa.cason.util.math.Base256
import com.github.kusa233.oxype.element.message.Message
import com.github.kusa233.oxype.element.message.piece.MessagePieces
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
        val key = BytesUtil.concat(SESSION_MESSAGE_SEQ_PREFIX, Base256.longToBuf(sessionId))

        return STORAGE[key, Long::class] ?: 0L
    }

    fun sendMessage(sessionId: Long, sender: Long, pieces: MessagePieces): Long {
        val messageId = STORAGE.incrementMessageSeq(sessionId)
        val message = Message(messageId, sender, System.currentTimeMillis(), pieces)
        STORAGE[createMessageKey(sessionId, messageId)] = message.encode().toString()
        return messageId
    }

    /**
     * Replaces the body of an existing message and stamps its edit time.
     *
     * The sender and the original timestamp are deliberately left untouched: an edit
     * changes what a message says, never who said it or when it first appeared, so
     * scrollback keeps its order and attribution. Returns the stored message as it
     * now stands, or null when there is nothing to edit.
     */
    fun editMessage(sessionId: Long, messageId: Long, pieces: MessagePieces): Message? {
        val existing = getMessage(sessionId, messageId) ?: return null
        val edited = existing.copy(pieces = pieces, editedAt = System.currentTimeMillis())
        STORAGE[createMessageKey(sessionId, messageId)] = edited.encode().toString()
        return edited
    }

    /**
     * Removes a message outright rather than leaving a tombstone behind.
     *
     * History reads walk a numeric range and skip keys that are absent, so a removed
     * message simply stops being returned; there is no body left on disk to leak.
     * Returns whether anything was actually there to delete.
     */
    fun deleteMessage(sessionId: Long, messageId: Long): Boolean {
        val key = createMessageKey(sessionId, messageId)
        if (STORAGE.getString(key) == null) {
            return false
        }
        STORAGE.remove(key)
        return true
    }

    fun createReceivedMessageSeqKey(userid: Long, sessionId: Long): ByteArray {
        return BytesUtil.concat(
            SESSION_RECEIVED_MESSAGE_SEQ_PREFIX,
            Base256.longToBuf(userid),
            Base256.longToBuf(sessionId)
        )
    }

    fun createMessageKey(sessionId: Long, messageId: Long): ByteArray {
        return BytesUtil.concat(
            SESSION_PREFIX,
            Base256.longToBuf(sessionId),
            Base256.longToBuf(messageId)
        )
    }

    fun getMessage(sessionId: Long, messageSeq: Long): Message? {
        val source = STORAGE[createMessageKey(sessionId, messageSeq), String::class] ?: return null
        val json = JSONParser.parseObject(source)
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

    /**
     * Returns the most recent message that still exists.
     *
     * The highest sequence number is only a hint at where the newest message *was*:
     * deleting a message removes its key outright, so the newest slot can be empty
     * while older messages remain. Scanning downwards from that slot finds the newest
     * survivor, which is what a conversation preview should show.
     *
     * The search is bounded by [LOOKBACK_LIMIT] so a conversation that has had its
     * whole recent tail deleted cannot turn a preview lookup into a full walk of its
     * history. Finding nothing within that window means there is no message worth
     * showing and the caller leaves the preview blank.
     */
    fun getLastMessage(sessionId: Long): Message? {
        val maxSeq = maxReceivedMessageSeq(sessionId)
        if (maxSeq <= 0L) {
            return null
        }
        return findNewestSurviving(maxSeq, LOOKBACK_LIMIT) { getMessage(sessionId, it) }
    }

    /**
     * Walks down from [maxSeq] and returns the first message that is still present.
     *
     * Split out from [getLastMessage] so the window's edges can be exercised without a
     * database: the branches that matter are all about running out of room before
     * finding anything, and about never looking below the first possible sequence.
     *
     * @param maxSeq the highest sequence number the conversation ever reached.
     * @param limit how many sequence numbers may be consulted, counting [maxSeq].
     * @param lookup reads one sequence number, returning null when it is absent.
     */
    internal fun findNewestSurviving(
        maxSeq: Long,
        limit: Long,
        lookup: (Long) -> Message?
    ): Message? {
        if (maxSeq <= 0L || limit <= 0L) {
            return null
        }
        val start = maxOf(1L, maxSeq - limit + 1L)
        for (seq in maxSeq downTo start) {
            lookup(seq)?.let { return it }
        }
        return null
    }

    /**
     * How far back the newest surviving message is looked for.
     *
     * Matches the page size the room history reads use, so a preview never peers
     * further into the past than a member could see in one screen of scrollback.
     */
    const val LOOKBACK_LIMIT = 50L
}
