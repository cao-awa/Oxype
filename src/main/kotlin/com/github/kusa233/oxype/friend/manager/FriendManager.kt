package com.github.kusa233.oxype.friend.manager

import com.github.cao.awa.cason.util.bytes.BytesUtil
import com.github.cao.awa.cason.util.math.Base256
import com.github.kusa233.oxype.friend.list.FriendList
import com.github.kusa233.oxype.friend.request.FriendRequestList
import com.github.kusa233.oxype.session.Session
import com.github.kusa233.oxype.session.manager.SessionManager
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.FRIEND_CONVERSATION_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.FRIEND_OUTGOING_REQUEST_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.FRIEND_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.FRIEND_REQUEST_PREFIX
import com.github.kusa233.oxype.storage.OxypeStorage.Companion.STORAGE
import com.github.kusa233.oxype.user.manager.UserManager

/**
 * Friendships and the one-to-one conversations that belong to them.
 *
 * The relationship is symmetric — being someone's friend means they are yours —
 * but it is *stored* per side, as one [FriendList] row for each user, because
 * every read asks "who are this user's friends?" and a shared row keyed on the
 * pair would have to be indexed twice to answer that. Both rows are therefore
 * always written together by the functions here; nothing outside this object
 * touches them.
 *
 * A friend conversation is an ordinary [Session] flagged with
 * [Session.friendConversation], created the moment a request is accepted and
 * torn down when the friendship ends. Reusing sessions means messages, history
 * paging, edits, deletes and live websocket pushes all keep working untouched.
 */
object FriendManager {
    /** Guards against a pair of oversized lists being walked for no reason. */
    const val MAX_FRIENDS: Int = 500

    /** Requests one user may have outstanding towards them at once. */
    const val MAX_INCOMING_REQUESTS: Int = 200

    /**
     * Outcome of asking to be someone's friend.
     *
     * A sealed result rather than exceptions or bare booleans because each case
     * maps to a distinct HTTP status and a distinct sentence in the UI, and the
     * route should not have to re-derive which one happened by re-reading
     * storage.
     */
    sealed interface RequestOutcome {
        /** The request is now waiting for [target] to accept it. */
        data class Sent(val target: Long) : RequestOutcome

        /** They had already asked first, so this is an acceptance. */
        data class AcceptedExisting(val target: Long, val sessionId: Long) : RequestOutcome
    }

    fun createFriendKey(userid: Long): ByteArray {
        return BytesUtil.concat(FRIEND_PREFIX, Base256.longToBuf(userid))
    }

    fun createRequestKey(userid: Long): ByteArray {
        return BytesUtil.concat(FRIEND_REQUEST_PREFIX, Base256.longToBuf(userid))
    }

    fun createOutgoingRequestKey(userid: Long): ByteArray {
        return BytesUtil.concat(FRIEND_OUTGOING_REQUEST_PREFIX, Base256.longToBuf(userid))
    }

    /**
     * Key for the conversation shared by [a] and [b].
     *
     * The pair is ordered before encoding so both sides resolve to the same key;
     * without that, A asking about B and B asking about A would address two
     * different rows.
     */
    fun createConversationKey(a: Long, b: Long): ByteArray {
        val low = minOf(a, b)
        val high = maxOf(a, b)
        return BytesUtil.concat(
            FRIEND_CONVERSATION_PREFIX,
            Base256.longToBuf(low),
            Base256.longToBuf(high)
        )
    }

    fun getFriends(userid: Long): FriendList {
        val list = STORAGE[createFriendKey(userid), FriendList::class] ?: return FriendList.EMPTY
        list.normaliseStoredIds()
        return list
    }

    fun areFriends(a: Long, b: Long): Boolean {
        if (a == b) return false
        return getFriends(a).contains(b)
    }

    fun getIncomingRequests(userid: Long): FriendRequestList {
        val list = STORAGE[createRequestKey(userid), FriendRequestList::class] ?: return FriendRequestList.EMPTY
        list.normaliseStoredIds()
        return list
    }

    /** Whether [sender] already has a request waiting with [target]. */
    fun hasPendingRequest(sender: Long, target: Long): Boolean {
        return getIncomingRequests(target).contains(sender)
    }

    /** The requests [userid] has sent that nobody has answered yet. */
    fun getOutgoingRequests(userid: Long): FriendRequestList {
        val list = STORAGE[createOutgoingRequestKey(userid), FriendRequestList::class]
            ?: return FriendRequestList.EMPTY
        list.normaliseStoredIds()
        return list
    }

    /**
     * Sends a friend request from [sender] to [target].
     *
     * Idempotent in the direction that matters: asking someone who has already
     * asked you completes the friendship instead of leaving two requests
     * pointing at each other, which is both what the user meant and what keeps
     * the accept button from being needed on both sides.
     *
     * @throws IllegalArgumentException when the target does not exist, is the
     * sender, or the two are already friends — all of which are caller errors
     * that the route reports as 400.
     */
    fun sendRequest(sender: Long, target: Long): RequestOutcome {
        require(sender != target) { "Cannot befriend yourself" }
        require(UserManager.getUser(target) != null) { "No such user" }
        require(!areFriends(sender, target)) { "Already friends" }

        // The request that may already be waiting is the *other* direction: if
        // [target] had already asked [sender], this call answers it instead of
        // stacking a second request alongside it. Arguing the arguments the other
        // way round reads as "did I already ask them?", which would never match
        // here and would leave two requests pointing at each other.
        if (hasPendingRequest(target, sender)) {
            // The sender is the one accepting, since the outstanding request is
            // the target's.
            val session = acceptRequest(sender, target)
            return RequestOutcome.AcceptedExisting(target, session.sessionId)
        }

        val list = getIncomingRequests(target)
        val mutable = if (list.isEmpty) FriendRequestList(false, mutableListOf()) else list
        require(mutable.requests.size < MAX_INCOMING_REQUESTS) { "Too many pending requests" }
        mutable.normaliseStoredIds()
        mutable.add(sender)
        STORAGE[createRequestKey(target)] = mutable
        addToOwnRow(sender, target, createOutgoingRequestKey(sender))
        return RequestOutcome.Sent(target)
    }

    private fun addToOwnRow(owner: Long, other: Long, key: ByteArray) {
        val list = STORAGE[key, FriendRequestList::class] ?: FriendRequestList(false, mutableListOf())
        list.normaliseStoredIds()
        list.add(other)
        STORAGE[key] = list
    }

    /**
     * Drops whatever request exists between [a] and [b], in either direction.
     *
     * Declining someone else's request and withdrawing one's own are the same
     * edit to storage seen from two sides, and the caller does not always know
     * which it is holding — a request may have been answered on the other device
     * a moment ago. Clearing both directions in one call removes that guesswork:
     * there is no ordering of the arguments that leaves a stale row behind.
     *
     * @return whether anything was actually pending and has now been removed.
     */
    fun removeRequestBetween(a: Long, b: Long): Boolean {
        val aDeclined = takeRequestsOf(a, b)
        val bDeclined = takeRequestsOf(b, a)
        clearFromOwnRow(a, b, createOutgoingRequestKey(a))
        clearFromOwnRow(b, a, createOutgoingRequestKey(b))
        return aDeclined || bDeclined
    }

    private fun clearFromOwnRow(owner: Long, other: Long, key: ByteArray) {
        val list = STORAGE[key, FriendRequestList::class] ?: return
        list.normaliseStoredIds()
        list.remove(other)
        STORAGE[key] = list
    }

    private fun takeRequestsOf(owner: Long, requester: Long): Boolean {
        val key = createRequestKey(owner)
        val list = STORAGE[key, FriendRequestList::class] ?: return false
        list.normaliseStoredIds()
        if (!list.contains(requester)) return false
        list.remove(requester)
        STORAGE[key] = list
        return true
    }

    /**
     * Accepts the request [requester] sent to [accepter], which makes the two
     * friends and creates the conversation they share.
     *
     * The conversation is created here rather than lazily on first open so that
     * accepting has one visible effect in both sidebars immediately, and so that
     * a conversation's id is stable for as long as the friendship lasts.
     *
     * @throws IllegalArgumentException when there is no such pending request or
     * the two are already friends.
     */
    fun acceptRequest(accepter: Long, requester: Long): Session {
        require(accepter != requester) { "Cannot befriend yourself" }
        require(takeRequestsOf(accepter, requester)) { "No such friend request" }
        clearFromOwnRow(requester, accepter, createOutgoingRequestKey(requester))
        require(UserManager.getUser(requester) != null) { "No such user" }

        addFriend(accepter, requester)
        addFriend(requester, accepter)
        return ensureConversation(accepter, requester)
    }

    private fun addFriend(owner: Long, friend: Long) {
        val key = createFriendKey(owner)
        val list = STORAGE[key, FriendList::class] ?: FriendList(false, mutableListOf())
        list.normaliseStoredIds()
        list.add(friend)
        STORAGE[key] = list
    }

    private fun removeFriend(owner: Long, friend: Long) {
        val key = createFriendKey(owner)
        val list = STORAGE[key, FriendList::class] ?: return
        list.normaliseStoredIds()
        list.remove(friend)
        STORAGE[key] = list
    }

    /** The id of the conversation [a] and [b] share, or null when they have none. */
    fun getConversationId(a: Long, b: Long): Long? {
        val stored = STORAGE[createConversationKey(a, b), Long::class]
        return Session.toLong(stored)
    }

    /** The conversation [a] and [b] share, or null when they have none. */
    fun getConversation(a: Long, b: Long): Session? {
        val id = getConversationId(a, b) ?: return null
        return SessionManager.getSession(id)
    }

    /**
     * Returns the conversation [a] and [b] share, creating it if they have none.
     *
     * The conversation is named after nothing in particular — both sides see the
     * *other* participant's name, which the view derives from [Session.peerFor]
     * — so the stored name is only a fallback for an API consumer that has no
     * viewer to ask about. It is deliberately not a user-visible title.
     */
    fun ensureConversation(a: Long, b: Long): Session {
        val existing = getConversationId(a, b)?.let { SessionManager.getSession(it) }
        if (existing != null) {
            // Re-assert membership: a conversation recovered after a partial
            // failure could have lost a side, and a friend conversation is
            // defined by having exactly these two people in it.
            ensureParticipants(existing, a, b)
            return existing
        }

        val session = Session(
            sessionId = STORAGE.incrementSessionId(),
            sessionName = "friends-$a-$b",
            owner = 0L,
            admins = mutableListOf(),
            members = mutableListOf(a, b),
            description = "",
            avatarFile = null,
            friendConversation = true
        )
        SessionManager.saveSession(session)
        STORAGE[createConversationKey(a, b)] = session.sessionId
        UserManager.joinSession(a, session.sessionId)
        UserManager.joinSession(b, session.sessionId)
        return session
    }

    private fun ensureParticipants(session: Session, a: Long, b: Long) {
        var changed = false
        if (!session.hasMember(a)) {
            session.addMember(a)
            changed = true
        }
        if (!session.hasMember(b)) {
            session.addMember(b)
            changed = true
        }
        if (changed) {
            SessionManager.saveSession(session)
        }
        UserManager.joinSession(a, session.sessionId)
        UserManager.joinSession(b, session.sessionId)
    }

    /**
     * Ends the friendship between [a] and [b] and destroys their conversation.
     *
     * Both sides are removed from each other's lists, the pair mapping is
     * dropped, and the conversation is deleted outright along with its messages
     * — a removed friend should not leave a readable transcript behind. Returns
     * whether there was a friendship to end, so the route can 404 on a stale
     * request instead of pretending it worked.
     */
    fun removeFriendBothWays(a: Long, b: Long): Boolean {
        val hadFriendship = areFriends(a, b)
        val conversationId = getConversationId(a, b)

        removeFriend(a, b)
        removeFriend(b, a)
        STORAGE.remove(createConversationKey(a, b))

        // Each side may still hold a request towards the other; drop both so a
        // removed friendship does not reappear as a pending request.
        takeRequestsOf(a, b)
        takeRequestsOf(b, a)
        clearFromOwnRow(a, b, createOutgoingRequestKey(a))
        clearFromOwnRow(b, a, createOutgoingRequestKey(b))

        if (conversationId != null) {
            SessionManager.deleteSession(conversationId)
        }
        return hadFriendship || conversationId != null
    }

    /**
     * Whether [viewerId] and [otherId] are linked by a friendship.
     *
     * Used by the profile-visibility checks, which otherwise only allow looking
     * at someone you share a group conversation with. Cheap by design: the
     * caller may run this on every avatar request.
     */
    fun linkedByFriendship(viewerId: Long, otherId: Long): Boolean {
        return areFriends(viewerId, otherId)
    }
}
