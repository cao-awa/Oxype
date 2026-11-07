package com.github.kusa233.oxype.session.list

import java.util.concurrent.ConcurrentHashMap

/**
 * Counts, per account, how many times something happened that the account's
 * client had to be told about.
 *
 * A push is delivered once, to whatever connection happens to be open at that
 * moment, and nothing is queued for a connection that is not. A tab that is
 * disconnected when a friend request arrives, a request is accepted, or a
 * friendship is deleted therefore never hears about it, and would keep showing
 * yesterday's sidebar until the page was reloaded by hand.
 *
 * Re-reading the list on every reconnect covers that, but it cannot tell the
 * difference between a reconnect where nothing happened and one where a push
 * was lost -- so every reconnect pays for a full reload. This counter supplies
 * the missing fact: a client remembers the value it saw when it last read its
 * list, and after reconnecting it compares. Equal means no push can have been
 * missed, and the reload is skipped; different means something happened in the
 * gap and the list is re-read.
 *
 * [bump] is called from two kinds of place, and the union is deliberate. It is
 * called by the publisher of these pushes, so the counter advances for exactly
 * the events a push announces -- which is wider than the joined-session list
 * itself, because a friend request arriving changes nothing about which
 * conversations exist yet still changes what the client has to show. It is also
 * called by the membership writes themselves ([UserManager.joinSession] and
 * [UserManager.leaveSession]), which change the list even on the paths that
 * never push. Together they mean a client that compares an unchanged value can
 * be sure it missed nothing, rather than merely nothing that was announced.
 *
 * The counter lives in memory, so it restarts from zero with the process. That
 * direction is safe: a client that had seen 5 now sees 0, which is a mismatch,
 * so it re-reads -- and a process restart is itself a moment where pushes were
 * very likely lost. It can only cause a redundant reload, never a missing one.
 */
object SessionListRevisions {
    private val versions = ConcurrentHashMap<Long, Long>()

    /** The value an account's clients compare against; zero before the first change. */
    @JvmStatic
    fun current(userid: Long): Long = versions[userid] ?: 0L

    /** Records one pushed change for an account and returns the new value. */
    @JvmStatic
    fun bump(userid: Long): Long = versions.merge(userid, 1L, Long::plus)!!
}
