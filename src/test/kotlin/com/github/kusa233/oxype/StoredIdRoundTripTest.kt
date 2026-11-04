package com.github.kusa233.oxype

import com.github.cao.awa.cason.codec.decoder.JSONDecoder
import com.github.cao.awa.cason.codec.encoder.JSONEncoder
import com.github.cao.awa.cason.serialize.parser.JSONParser
import com.github.kusa233.oxype.session.Session
import com.github.kusa233.oxype.session.list.SessionList
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Sessions and join lists are stored as data classes, so every read decodes them
 * back through Cason. Numbers that fit in 32 bits come back as [Integer], not
 * [Long], and removing a member used to unbox each element into a primitive long
 * before it could be normalised — that is the ClassCastException this pins down.
 */
class StoredIdRoundTripTest {

    /**
     * Mirrors what storage does: encode a data class to JSON text, then parse it
     * back and decode it.
     *
     * The intermediate text is essential. Kalmia writes `encodeData(...).toString()`
     * and reads it back with `JSONParser.parseObject`, and it is the parser that
     * narrows every number that fits in 32 bits to an Integer. Decoding straight
     * from the in-memory JSONObject keeps the original Long and would hide the bug.
     */
    private inline fun <reified T : Any> roundTrip(value: T): T {
        val text = JSONEncoder.encodeData(value).toString()
        return JSONDecoder.decodeDataClass(JSONParser.parseObject(text), T::class)
    }

    /**
     * Reads a list element by its runtime class.
     *
     * A plain `is Int` test is rejected as "always false" because the declared
     * element type is Long — which is precisely the bug: the static type says
     * Long while the decoded object is an Integer. Reading through the star
     * projection erases that static type, so the runtime class can be observed.
     */
    private fun runtimeClassOf(list: List<*>, index: Int): String =
        list[index]!!::class.qualifiedName!!

    /**
     * Compares ids by value.
     *
     * `assertEquals(listOf(0L), ids)` would fail on a list that holds Integers,
     * because `Long(0) != Int(0)` — a detail worth keeping out of the assertions
     * that are about membership rather than storage types.
     */
    private fun ids(list: List<*>): List<Long> = list.map { (it as Number).toLong() }

    @Test
    fun `decoded ids arrive as integers rather than longs`() {
        val session = Session(sessionId = 1L, sessionName = "alpha").apply {
            members.addAll(listOf(0L, 7L))
            admins.add(7L)
        }

        val decoded = roundTrip(session)

        // The hazard itself: the list is declared MutableList<Long>, yet the value
        // that comes back out is an Integer, so unboxing it into a primitive long
        // is what threw.
        assertEquals("kotlin.Int", runtimeClassOf(decoded.members, 0))
    }

    @Test
    fun `removing a member from a decoded session does not throw`() {
        val session = Session(sessionId = 1L, sessionName = "alpha").apply {
            members.addAll(listOf(0L, 7L, 8L))
            admins.add(7L)
            admins.add(8L)
        }

        val decoded = roundTrip(session)
        decoded.removeMember(7L)

        assertEquals(listOf(0L, 8L), ids(decoded.memberIds()))
        assertEquals(listOf(8L), ids(decoded.adminIds()))
        assertEquals(2, decoded.members.size)
        assertFalse(decoded.hasMember(7L))
        assertFalse(decoded.isAdmin(7L))
    }

    @Test
    fun `removing an admin from a decoded session does not throw`() {
        val session = Session(sessionId = 2L, sessionName = "beta").apply {
            owner = 0L
            members.addAll(listOf(0L, 9L))
            admins.add(9L)
            admins.add(0L)
        }

        val decoded = roundTrip(session)
        decoded.removeAdmin(9L)

        assertEquals(listOf(0L), ids(decoded.adminIds()))
        assertTrue(decoded.isAdmin(0L), "the owner still counts as an admin")
    }

    @Test
    fun `normalising a decoded session keeps its contents and their types`() {
        val session = Session(sessionId = 3L, sessionName = "gamma").apply {
            members.addAll(listOf(0L, 4L, 5L))
            admins.add(5L)
        }

        val decoded = roundTrip(session)
        decoded.normaliseStoredIds()

        assertEquals(listOf(0L, 4L, 5L), decoded.memberIds())
        assertEquals(listOf(5L), decoded.adminIds())
        // Real longs, not Integers: memberIds() is handed straight to JSON and to
        // Long-typed unboxing such as `firstOrNull()` when an owner leaves.
        assertEquals("kotlin.Long", runtimeClassOf(decoded.members, 0))
        assertEquals("kotlin.Long", runtimeClassOf(decoded.admins, 0))
    }

    @Test
    fun `leaving a decoded join list does not throw`() {
        val list = SessionList(isEmpty = false, sessions = mutableListOf(1L, 2L, 3L))

        val decoded = roundTrip(list)
        decoded.remove(2L)

        assertEquals(listOf(1L, 3L), ids(decoded.sessions))
        assertTrue(decoded.contains(1L))
        assertFalse(decoded.contains(2L))
    }

    @Test
    fun `the shared empty join list is never mutated`() {
        // SessionList.EMPTY is one instance shared by every caller and its list is
        // mutable, so a removal must not be able to reach into it.
        SessionList.EMPTY.remove(1L)
        SessionList.EMPTY.normaliseStoredIds()

        assertTrue(SessionList.EMPTY.isEmpty)
        assertEquals(emptyList(), SessionList.EMPTY.sessions)
    }
}
