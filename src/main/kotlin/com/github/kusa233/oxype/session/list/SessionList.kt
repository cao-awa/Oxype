package com.github.kusa233.oxype.session.list

data class SessionList(
    val isEmpty: Boolean,
    val sessions: MutableList<Long>
) {
    companion object {
        val EMPTY = SessionList(true, mutableListOf())

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
            throw IllegalStateException("Session list cannot append session")
        }
        if (!contains(id)) {
            this.sessions.add(id)
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
        val erased = this.sessions as MutableList<Any?>
        erased.removeAll { toLong(it) == id }
    }

    /** Rewrites the stored ids as real longs; call once, right after decoding. */
    fun normaliseStoredIds() {
        if (this.isEmpty) return
        @Suppress("UNCHECKED_CAST")
        val erased = this.sessions as MutableList<Any?>
        if (erased.all { it is Long }) return
        val normalised = erased.mapNotNull { toLong(it) }
        this.sessions.clear()
        this.sessions.addAll(normalised)
    }

    fun contains(id: Long): Boolean {
        return this.sessions.any { toLong(it) == id }
    }
}