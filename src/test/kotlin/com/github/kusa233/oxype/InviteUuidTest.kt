package com.github.kusa233.oxype

import com.github.kusa233.oxype.session.invite.InviteUuid
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class InviteUuidTest {
    @Test
    fun `generated invites use version 7 and RFC variant`() {
        repeat(1000) {
            val uuid = InviteUuid.generate(1_700_000_000_123L)
            assertEquals(7, uuid.version())
            assertEquals(2, uuid.variant())
            assertEquals(1_700_000_000_123L, uuid.mostSignificantBits ushr 16)
            assertEquals(uuid, UUID.fromString(uuid.toString()))
            assertEquals(36, uuid.toString().length)
        }
    }

    @Test
    fun `same millisecond invites retain random uniqueness`() {
        val invites = List(10_000) { InviteUuid.generate(1_700_000_000_123L) }
        assertEquals(invites.size, invites.toSet().size)
    }

    @Test
    fun `timestamp orders textual UUIDs across milliseconds`() {
        val earlier = InviteUuid.generate(1_700_000_000_123L).toString()
        val later = InviteUuid.generate(1_700_000_000_124L).toString()
        assertTrue(earlier < later)
    }

    @Test
    fun `default timestamp is current Unix milliseconds`() {
        val before = System.currentTimeMillis()
        val uuid = InviteUuid.generate()
        val after = System.currentTimeMillis()
        assertTrue((uuid.mostSignificantBits ushr 16) in before..after)
    }
}
