package com.github.kusa233.oxype.friend.list

/**
 * One user's friends, stored under a single key of their own.
 *
 * Modelled exactly like [com.github.kusa233.oxype.session.list.SessionList]: a
 * small record holding a list of ids, with the same `isEmpty` sentinel so an
 * absent row reads as "no friends yet" rather than null. Friends are kept per
 * side rather than as one shared record, so reading one user's friends never
 * has to look at anyone else's row.
 */
data class FriendList(
    val isEmpty: Boolean,
    val friends: MutableList<Long>
) {
    companion object {
        val EMPTY = FriendList(true, mutableListOf())

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
            throw IllegalStateException("Friend list cannot append friend")
        }
        if (!contains(id)) {
            this.friends.add(id)
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
        val erased = this.friends as MutableList<Any?>
        erased.removeAll { toLong(it) == id }
    }

    /** Rewrites the stored ids as real longs; call once, right after decoding. */
    fun normaliseStoredIds() {
        if (this.isEmpty) return
        @Suppress("UNCHECKED_CAST")
        val erased = this.friends as MutableList<Any?>
        if (erased.all { it is Long }) return
        val normalised = erased.mapNotNull { toLong(it) }
        this.friends.clear()
        this.friends.addAll(normalised)
    }

    fun contains(id: Long): Boolean {
        return this.friends.any { toLong(it) == id }
    }

    /** Non-null snapshot of the friend ids, for encoding and rendering. */
    fun ids(): List<Long> = this.friends.toList()
}
