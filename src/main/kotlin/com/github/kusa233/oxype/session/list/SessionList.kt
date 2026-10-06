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
        this.sessions.removeAll { toLong(it) == id }
    }

    fun contains(id: Long): Boolean {
        return this.sessions.any { toLong(it) == id }
    }
}