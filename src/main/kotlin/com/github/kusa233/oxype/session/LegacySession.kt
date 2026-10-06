package com.github.kusa233.oxype.session

/**
 * Shape of a session record written before owner/admins/members/description existed.
 *
 * The JSON decoder refuses to build a [Session] from such a record because the list
 * nodes are absent, so those records are read through this DTO and upgraded once.
 */
data class LegacySession(
    val sessionId: Long,
    val sessionName: String
) {
    fun toSession(): Session = Session(
        sessionId = sessionId,
        sessionName = sessionName,
        owner = 0L,
        admins = mutableListOf(),
        members = mutableListOf(),
        description = ""
    )
}
