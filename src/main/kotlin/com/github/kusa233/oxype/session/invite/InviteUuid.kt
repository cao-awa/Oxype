package com.github.kusa233.oxype.session.invite

import java.security.SecureRandom
import java.util.UUID

/**
 * UUID version 7 generator (RFC 9562).
 *
 * The textual representation remains a regular UUID string, so invite keys and
 * the persisted SessionInviteList format stay compatible with older v4 invites.
 */
object InviteUuid {
    private val random = SecureRandom()

    /** Creates a UUIDv7 using the current Unix timestamp in milliseconds. */
    fun generate(nowMillis: Long = System.currentTimeMillis()): UUID {
        val timestamp = nowMillis and 0xffff_ffff_ffffL
        val randomA = random.nextInt() and 0x0fff
        val randomB = random.nextLong() and 0x3fff_ffff_ffff_ffffL

        // 48-bit timestamp | version 7 | 12-bit rand_a
        val mostSignificantBits = (timestamp shl 16) or
            0x7000L or
            randomA.toLong()
        // RFC 9562 variant (binary 10) | 62-bit rand_b
        val leastSignificantBits = Long.MIN_VALUE or randomB
        return UUID(mostSignificantBits, leastSignificantBits)
    }
}
