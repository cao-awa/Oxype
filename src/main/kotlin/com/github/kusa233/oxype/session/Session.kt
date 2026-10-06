package com.github.kusa233.oxype.session

data class Session(
    val sessionId: Long,
    var sessionName: String,
    var owner: Long = 0L,
    val admins: MutableList<Long> = mutableListOf(),
    val members: MutableList<Long> = mutableListOf(),
    var description: String = ""
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
        members.removeAll { toLong(it) == userid }
        admins.removeAll { toLong(it) == userid }
    }

    fun addAdmin(userid: Long) {
        if (admins.none { toLong(it) == userid }) {
            admins.add(userid)
        }
        addMember(userid)
    }

    fun removeAdmin(userid: Long) {
        admins.removeAll { toLong(it) == userid }
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
}
