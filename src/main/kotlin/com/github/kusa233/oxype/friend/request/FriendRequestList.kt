package com.github.kusa233.oxype.friend.request

/**
 * The friend requests addressed to one user.
 *
 * Held as bare sender ids because a request carries no state of its own: it
 * exists from the moment it is sent until it is accepted, declined or
 * withdrawn, and every fact a view needs about it (name, avatar) is read from
 * the sender's profile at render time rather than copied in and left to go
 * stale.
 */
data class FriendRequestList(
    val isEmpty: Boolean,
    val requests: MutableList<Long>
) {
    companion object {
        val EMPTY = FriendRequestList(true, mutableListOf())

        /**
         * Normalises any stored/decoded numeric representation to [Long].
         *
         * Values round-tripped through JSON arrive as [Integer] rather than
         * [Long] whenever they fit in 32 bits. Comparing those against a `Long`
         * with `equals` silently returns false, so every membership test has to
         * go through this narrowing helper instead.
         */
        private fun toLong(value: Any?): Long? = when (value) {
            is Number -> value.toLong()
            is String -> value.toLongOrNull()
            else -> null
        }
    }

    fun add(id: Long) {
        if (this.isEmpty) {
            throw IllegalStateException("Friend request list cannot append request")
        }
        if (!contains(id)) {
            this.requests.add(id)
        }
    }

    fun remove(id: Long) {
        // EMPTY is a shared sentinel holding a mutable list; removing from it
        // would leak into every other user's view, and it never has entries.
        if (this.isEmpty) return

        // Removing through an erased list is deliberate: a `(Long) -> Boolean`
        // predicate makes the JVM insert an implicit `checkcast Long` per
        // element, but numbers decoded from JSON are Integers whenever they fit
        // in 32 bits, so the cast threw before [toLong] could normalise them.
        @Suppress("UNCHECKED_CAST")
        val erased = this.requests as MutableList<Any?>
        erased.removeAll { toLong(it) == id }
    }

    /** Rewrites the stored ids as real longs; call once, right after decoding. */
    fun normaliseStoredIds() {
        if (this.isEmpty) return
        @Suppress("UNCHECKED_CAST")
        val erased = this.requests as MutableList<Any?>
        if (erased.all { it is Long }) return
        val normalised = erased.mapNotNull { toLong(it) }
        this.requests.clear()
        this.requests.addAll(normalised)
    }

    fun contains(id: Long): Boolean {
        return this.requests.any { toLong(it) == id }
    }

    /** Non-null snapshot of the sender ids, for encoding and rendering. */
    fun ids(): List<Long> = this.requests.toList()
}
