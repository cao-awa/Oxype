package com.github.kusa233.oxype

import com.github.kusa233.oxype.element.message.Message
import com.github.kusa233.oxype.element.message.piece.MessagePieces
import com.github.kusa233.oxype.message.MessageManager
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * Covers how the conversation preview finds its message after deletions.
 *
 * Deleting a message removes its key rather than writing a tombstone, so the highest
 * sequence number in a conversation says where the newest message *was*, not where it
 * is. The preview has to walk down from there, and the two ways that walk can end
 * without a message — running out of window, and running out of conversation — are
 * exactly what these tests pin down.
 */
class LastMessageLookbackTest {

    private fun message(id: Long) = Message(
        id, sender = 7L, timestamp = 1_000L + id,
        pieces = MessagePieces(arrayListOf())
    )

    /** Stands in for storage, holding only the sequence numbers that were not deleted. */
    private fun storeOf(vararg present: Long): (Long) -> Message? {
        val kept = present.toSet()
        return { seq -> if (seq in kept) message(seq) else null }
    }

    @Test
    fun `newest message is found when nothing was deleted`() {
        val found = MessageManager.findNewestSurviving(10L, 50L, storeOf(10L))

        assertEquals(10L, found?.id)
    }

    @Test
    fun `deleting the newest message falls back to the one before it`() {
        // Sequence 10 is gone; 9 is the newest survivor.
        val found = MessageManager.findNewestSurviving(10L, 50L, storeOf(7L, 8L, 9L))

        assertEquals(9L, found?.id)
    }

    @Test
    fun `a run of deletions is walked past`() {
        val found = MessageManager.findNewestSurviving(10L, 50L, storeOf(3L, 4L))

        assertEquals(4L, found?.id)
    }

    @Test
    fun `a deleted tail leaving nothing in the window yields no preview`() {
        // Everything the window can reach is gone, even though older messages exist.
        val found = MessageManager.findNewestSurviving(100L, 50L, storeOf(1L, 2L, 3L))

        assertNull(found)
    }

    @Test
    fun `the window is exactly as wide as it claims`() {
        // A message 50 numbers back is reachable; one number further back is not.
        assertEquals(51L, MessageManager.findNewestSurviving(100L, 50L, storeOf(51L))?.id)
        assertNull(MessageManager.findNewestSurviving(100L, 50L, storeOf(50L)))
    }

    @Test
    fun `the search never reaches below the first sequence`() {
        val asked = mutableListOf<Long>()
        MessageManager.findNewestSurviving(3L, 50L) { seq ->
            asked.add(seq)
            null
        }

        // Counting down to 0 or below would be a wasted read, and would imply a
        // message numbered 0 that cannot exist.
        assertEquals(listOf(3L, 2L, 1L), asked)
    }

    @Test
    fun `an empty conversation has no preview`() {
        assertNull(MessageManager.findNewestSurviving(0L, 50L) { message(1L) })
    }

    @Test
    fun `the public limit is the documented page of messages`() {
        assertEquals(50L, MessageManager.LOOKBACK_LIMIT)
    }
}
