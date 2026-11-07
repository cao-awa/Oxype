package com.github.kusa233.oxype.session

data class Session(
    val sessionId: Long,
    var sessionName: String,
    var owner: Long = 0L,
    val admins: MutableList<Long> = mutableListOf(),
    val members: MutableList<Long> = mutableListOf(),
    var description: String = "",
    /**
     * Name of this session's avatar file under `client/avatar`, or null/empty when the
     * session has none and is drawn with its initial.
     *
     * Nullable rather than merely defaulted because sessions are persisted through
     * Cason's reflective decoder, which passes `null` for every key missing from the
     * stored record instead of honouring a Kotlin default; a non-null field would make
     * every session created before this field existed fail to load.
     */
    var avatarFile: String? = null,
    /**
     * True on the one-to-one conversation a friendship owns, absent on every
     * ordinary group conversation.
     *
     * A friend conversation is a real session holding real messages, so it
     * reuses this record, the message store and the whole websocket path
     * instead of growing a parallel copy of them. What makes it a friend
     * conversation is only this flag: the UI hides the group apparatus (owner,
     * members, management, invites) behind it, the API refuses to let anyone
     * else join, and the other participant is read as "the member who is not
     * the viewer" — which is why a flag, and not the peer's id, is what gets
     * stored. A peer id would describe the session from exactly one side of a
     * conversation that has two.
     *
     * Nullable rather than merely defaulted because sessions are persisted
     * through Cason's reflective decoder, which passes `null` for every key
     * missing from the stored record instead of honouring a Kotlin default; a
     * non-null field would make every session created before this field
     * existed fail to load.
     */
    var friendConversation: Boolean? = null
) {
    companion object {
        /** Normalises decoded numbers: JSON round-trips restore small values as Integer. */
        fun toLong(value: Any?): Long? = when (value) {
            is Number -> value.toLong()
            is String -> value.toLongOrNull()
            else -> null
        }
    }

    fun hasMember(userid: Long): Boolean {
        if (owner != 0L && owner == userid) return true
        if (members.any { toLong(it) == userid }) return true
        if (admins.any { toLong(it) == userid }) return true
        return false
    }

    fun isAdmin(userid: Long): Boolean {
        if (owner != 0L && owner == userid) return true
        return admins.any { toLong(it) == userid }
    }

    fun isOwner(userid: Long): Boolean = owner != 0L && owner == userid

    fun addMember(userid: Long) {
        if (members.none { toLong(it) == userid }) {
            members.add(userid)
        }
    }

    fun removeMember(userid: Long) {
        removeIds(members, userid)
        removeIds(admins, userid)
    }

    fun addAdmin(userid: Long) {
        if (admins.none { toLong(it) == userid }) {
            admins.add(userid)
        }
        addMember(userid)
    }

    fun removeAdmin(userid: Long) {
        removeIds(admins, userid)
    }

    /**
     * Drops every stored representation of [userid] from [ids].
     *
     * Written against the erased list on purpose. A `(Long) -> Boolean`
     * predicate makes the JVM insert an implicit `checkcast Long` on each
     * element before the body runs, but a value decoded from JSON is an
     * Integer whenever it fits in 32 bits — the cast threw before [toLong]
     * could normalise anything. Typing the parameter `Any?` removes the cast
     * and lets [toLong] do the comparing.
     */
    private fun removeIds(ids: MutableList<Long>, userid: Long) {
        @Suppress("UNCHECKED_CAST")
        val erased = ids as MutableList<Any?>
        erased.removeAll { toLong(it) == userid }
    }

    /**
     * Rewrites the id lists so they hold real longs.
     *
     * Storage round-trips through JSON, and Cason restores any number that fits
     * in 32 bits as an Integer. Normalising once, at the decode boundary, keeps
     * every later read — `.forEach { add(it) }` into a JSON array, `firstOrNull`,
     * arithmetic — free of that surprise.
     */
    fun normaliseStoredIds() {
        normaliseIds(members)
        normaliseIds(admins)
    }

    private fun normaliseIds(ids: MutableList<Long>) {
        @Suppress("UNCHECKED_CAST")
        val erased = ids as MutableList<Any?>
        if (erased.all { it is Long }) return
        val normalised = erased.mapNotNull { toLong(it) }
        ids.clear()
        ids.addAll(normalised)
    }

    /** Non-null snapshot of the member ids, for encoding and rendering. */
    fun memberIds(): List<Long> = members.toList()

    /** Non-null snapshot of the admin ids, for encoding and rendering. */
    fun adminIds(): List<Long> = admins.toList()

    /** Ensures the owner always appears in the member list. */
    fun ensureOwnerIsMember() {
        if (owner != 0L && !hasMember(owner)) {
            addMember(owner)
        }
    }

    /** Whether this conversation is the private one-to-one of a friendship. */
    fun isFriendConversation(): Boolean = friendConversation == true

    /**
     * The other participant of a friend conversation, as seen by [viewerId].
     *
     * Derived rather than stored, because a stored peer id could only name one
     * side of a conversation that has two. Returns null for a group, and also
     * when the viewer is not one of the two participants — a third party has no
     * "the other one" to be shown.
     */
    fun peerFor(viewerId: Long): Long? {
        if (!isFriendConversation()) return null
        val memberIds = memberIds().mapNotNull { toLong(it) }
        if (memberIds.none { it == viewerId }) return null
        return memberIds.firstOrNull { it != viewerId }
    }
}
