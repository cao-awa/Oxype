/**
 * Oxype Web Client - Instant Messaging Chat Page Logic
 * Manages user authentication verification, session listing via getJoinedSessions,
 * session creation via createSession, session details via getSession, user profile via getUser,
 * and settings dialog with language/theme/logout controls.
 */

(function () {
    'use strict';

    // Current State
    let currentUser = null;
    let activeSessionId = null;
    let sessionsMap = new Map();

    // DOM Elements
    let sessionListEl;
    let emptySessionsPlaceholder;
    let userAvatarEl;
    let userDisplayNameEl;
    let userIdBadgeEl;
    let chatHeaderEl;
    let currentSessionTitleEl;
    let currentSessionIdEl;
    let messagesContainerEl;
    let chatComposerEl;
    let messageInputEl;
    let sendBtnEl;

    // Session Options Elements (create / join)
    let sessionOptionsBtn;
    let sessionOptionsDialog;
    let createSessionForm;
    let newSessionNameInput;
    let newSessionDescInput;
    let closeSessionOptionsBtn;
    let submitCreateSessionBtn;
    let joinSessionForm;
    let joinUuidInput;
    let submitJoinSessionBtn;

    // Conversation Settings Elements (top-right button + dialogs)
    let sessionSettingsBtn;
    let sessionSettingsDialog;
    let closeSessionSettingsBtn;
    let ssSessionNameEl;
    let ssSessionDescEl;
    let ssSessionOwnerEl;
    let ssSessionIdEl;
    let ssMemberListEl;
    let ssEditFormEl;
    let ssNameInputEl;
    let ssDescInputEl;
    let ssSaveBtnEl;
    let ssInviteSectionEl;
    let ssInviteListEl;
    let ssInviteHintEl;
    let ssCreateInviteBtnEl;
    let ssLeaveBtnEl;
    // Members / management toasts and their entry buttons
    let membersDialog;
    let closeMembersBtnEl;
    let openMembersBtnEl;
    let manageDialog;
    let closeManageBtnEl;
    let openManageBtnEl;

    // Settings Elements
    let settingsBtn;
    let settingsDialog;
    let closeSettingsBtn;
    let dialogLogoutBtn;
    let dialogOverlay;

    // Role/state of the currently open conversation
    let activeSessionInfo = null;
    let activeSessionUsers = new Map();

    // Calendar day of the last rendered message; drives the per-date separators
    let lastRenderedDateKey = '';

    // Track the final received/read message sequence for active conversation
    let currentSeq = 0;

    /**
     * Entry point on page load
     */
    async function init() {
        // Cache DOM references
        sessionListEl = document.getElementById('sessionList');
        emptySessionsPlaceholder = document.getElementById('emptySessionsPlaceholder');
        userAvatarEl = document.getElementById('userAvatar');
        userDisplayNameEl = document.getElementById('userDisplayName');
        userIdBadgeEl = document.getElementById('userIdBadge');
        chatHeaderEl = document.getElementById('chatHeader');
        currentSessionTitleEl = document.getElementById('currentSessionTitle');
        currentSessionIdEl = document.getElementById('currentSessionId');
        messagesContainerEl = document.getElementById('messagesContainer');
        chatComposerEl = document.getElementById('chatComposer');
        messageInputEl = document.getElementById('messageInput');
        sendBtnEl = document.getElementById('sendBtn');

        // Session Options references
        sessionOptionsBtn = document.getElementById('sessionOptionsBtn');
        sessionOptionsDialog = document.getElementById('sessionOptionsDialog');
        createSessionForm = document.getElementById('createSessionForm');
        newSessionNameInput = document.getElementById('newSessionNameInput');
        newSessionDescInput = document.getElementById('newSessionDescInput');
        closeSessionOptionsBtn = document.getElementById('closeSessionOptionsBtn');
        submitCreateSessionBtn = document.getElementById('submitCreateSessionBtn');
        joinSessionForm = document.getElementById('joinSessionForm');
        joinUuidInput = document.getElementById('joinUuidInput');
        submitJoinSessionBtn = document.getElementById('submitJoinSessionBtn');

        // Conversation Settings references
        sessionSettingsBtn = document.getElementById('sessionSettingsBtn');
        sessionSettingsDialog = document.getElementById('sessionSettingsDialog');
        closeSessionSettingsBtn = document.getElementById('closeSessionSettingsBtn');
        ssSessionNameEl = document.getElementById('ssSessionName');
        ssSessionDescEl = document.getElementById('ssSessionDesc');
        ssSessionOwnerEl = document.getElementById('ssSessionOwner');
        ssSessionIdEl = document.getElementById('ssSessionId');
        ssMemberListEl = document.getElementById('ssMemberList');
        ssEditFormEl = document.getElementById('ssEditForm');
        ssNameInputEl = document.getElementById('ssNameInput');
        ssDescInputEl = document.getElementById('ssDescInput');
        ssSaveBtnEl = document.getElementById('ssSaveBtn');
        ssInviteSectionEl = document.getElementById('ssInviteSection');
        ssInviteListEl = document.getElementById('ssInviteList');
        ssInviteHintEl = document.getElementById('ssInviteHint');
        ssCreateInviteBtnEl = document.getElementById('ssCreateInviteBtn');
        ssLeaveBtnEl = document.getElementById('ssLeaveBtn');

        // Members / management toasts
        membersDialog = document.getElementById('membersDialog');
        closeMembersBtnEl = document.getElementById('closeMembersBtn');
        openMembersBtnEl = document.getElementById('openMembersBtn');
        manageDialog = document.getElementById('manageDialog');
        closeManageBtnEl = document.getElementById('closeManageBtn');
        openManageBtnEl = document.getElementById('openManageBtn');

        // Settings references
        settingsBtn = document.getElementById('settingsBtn');
        settingsDialog = document.getElementById('settingsDialog');
        closeSettingsBtn = document.getElementById('closeSettingsBtn');
        dialogLogoutBtn = document.getElementById('dialogLogoutBtn');
        dialogOverlay = document.getElementById('dialogOverlay');

        // Check authentication status
        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        if (!auth || !auth.token || !auth.userId) {
            console.warn('[Chat] No valid session found. Redirecting to auth page.');
            window.location.href = 'index.html';
            return;
        }

        // Initialize user display immediately from local auth storage (no waiting on network)
        currentUser = {
            id: auth.userId,
            username: auth.username || `User #${auth.userId}`
        };
        renderUserProfile();

        // Initialize i18n language selector inside settings dialog
        if (window.OxypeI18n) {
            window.OxypeI18n.initLanguageSelector('#languageSelect');
        }

        // Initialize dark/light theme mode selector inside settings dialog
        if (window.OxypeStyle) {
            window.OxypeStyle.initThemeModeSelector('#themeModeSelect');
        }

        // Initialize theme color tone selector inside settings dialog
        if (window.OxypeStyle) {
            window.OxypeStyle.initAccentSelector('#colorThemeSelect');
        }

        // Bind interactive events
        bindEvents();

        // Verify token validity via POST /isAlive/{userid} on page load / refresh
        try {
            const isAlive = await window.OxypeCore.isAlive(auth.userId, auth.token);
            if (isAlive === false) {
                console.warn('[Chat] Token expired or invalid. Redirecting to login page.');
                window.OxypeCore.clearAuth();
                window.location.href = 'index.html';
                return;
            }
        } catch (err) {
            console.warn('[Chat] Token validation check encountered error, continuing session:', err);
        }

        // Fetch user profile and joined sessions from server logic
        loadUserDataAndSessions(auth.userId);
    }

    /**
     * Bind DOM interaction listeners
     */
    function bindEvents() {
        // Message sending events
        if (sendBtnEl) {
            sendBtnEl.addEventListener('click', handleSendMessage);
        }

        if (messageInputEl) {
            messageInputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                }
            });
        }

        // Session Options dialog events
        if (sessionOptionsBtn) {
            sessionOptionsBtn.addEventListener('click', openSessionOptionsDialog);
        }

        if (closeSessionOptionsBtn) {
            closeSessionOptionsBtn.addEventListener('click', closeAllDialogs);
        }

        if (createSessionForm) {
            createSessionForm.addEventListener('submit', handleCreateSessionSubmit);
        }

        if (joinSessionForm) {
            joinSessionForm.addEventListener('submit', handleJoinSessionSubmit);
        }

        // Conversation Settings dialog events
        if (sessionSettingsBtn) {
            sessionSettingsBtn.addEventListener('click', openSessionSettingsDialog);
        }

        if (closeSessionSettingsBtn) {
            closeSessionSettingsBtn.addEventListener('click', closeAllDialogs);
        }

        if (ssEditFormEl) {
            ssEditFormEl.addEventListener('submit', handleSaveSessionChanges);
        }

        if (ssCreateInviteBtnEl) {
            ssCreateInviteBtnEl.addEventListener('click', handleCreateInvite);
        }

        if (ssLeaveBtnEl) {
            ssLeaveBtnEl.addEventListener('click', handleLeaveSession);
        }

        // Members / management toast entry points and close buttons
        if (openMembersBtnEl) {
            openMembersBtnEl.addEventListener('click', openMembersDialog);
        }

        if (closeMembersBtnEl) {
            closeMembersBtnEl.addEventListener('click', closeAllDialogs);
        }

        if (openManageBtnEl) {
            openManageBtnEl.addEventListener('click', openManageDialog);
        }

        if (closeManageBtnEl) {
            closeManageBtnEl.addEventListener('click', closeAllDialogs);
        }

        // Settings dialog events
        if (settingsBtn) {
            settingsBtn.addEventListener('click', openSettingsDialog);
        }

        if (closeSettingsBtn) {
            closeSettingsBtn.addEventListener('click', closeAllDialogs);
        }

        if (dialogLogoutBtn) {
            dialogLogoutBtn.addEventListener('click', handleLogout);
        }

        // Dialog overlay click to dismiss
        if (dialogOverlay) {
            dialogOverlay.addEventListener('click', closeAllDialogs);
        }

        // Keyboard escape key to dismiss dialogs
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeAllDialogs();
            }
        });
    }

    /**
     * Open the Session Options dialog (create a conversation, or join one by UUID)
     */
    function openSessionOptionsDialog() {
        closeAllDialogs();
        if (dialogOverlay) dialogOverlay.style.display = 'block';
        if (sessionOptionsDialog) {
            sessionOptionsDialog.style.display = 'block';
            if (newSessionNameInput) {
                newSessionNameInput.value = '';
            }
            if (newSessionDescInput) {
                newSessionDescInput.value = '';
            }
            if (joinUuidInput) {
                joinUuidInput.value = '';
            }
            if (newSessionNameInput) {
                setTimeout(() => newSessionNameInput.focus(), 50);
            }
        }
    }

    /**
     * Open Settings dialog
     */
    function openSettingsDialog() {
        closeAllDialogs();
        if (dialogOverlay) dialogOverlay.style.display = 'block';
        if (settingsDialog) {
            settingsDialog.style.display = 'block';
        }
    }

    /**
     * Open the conversation settings dialog for the active conversation.
     * The first screen shows the conversation info, invite UUIDs and leave action;
     * members and management live in their own toasts.
     */
    async function openSessionSettingsDialog() {
        if (!activeSessionId) return;

        closeAllDialogs();
        if (dialogOverlay) dialogOverlay.style.display = 'block';
        if (sessionSettingsDialog) {
            sessionSettingsDialog.style.display = 'block';
        }

        await loadSessionSettings();
    }

    /**
     * Open the members toast for the active conversation.
     * The member list is fetched on open so it always reflects the current roster.
     */
    async function openMembersDialog() {
        if (!activeSessionId) return;

        closeAllDialogs();
        if (dialogOverlay) dialogOverlay.style.display = 'block';
        if (membersDialog) {
            membersDialog.style.display = 'block';
        }

        await loadSessionMembers();
    }

    /**
     * Open the management toast (rename/description), for owners and admins only.
     */
    function openManageDialog() {
        if (!activeSessionId) return;

        const info = activeSessionInfo || {};
        if (!info.isOwner && !info.isAdmin) return;

        closeAllDialogs();
        if (dialogOverlay) dialogOverlay.style.display = 'block';
        if (manageDialog) {
            manageDialog.style.display = 'block';
        }
    }

    /**
     * Close all active dialogs
     */
    function closeAllDialogs() {
        if (dialogOverlay) dialogOverlay.style.display = 'none';
        if (sessionOptionsDialog) sessionOptionsDialog.style.display = 'none';
        if (sessionSettingsDialog) sessionSettingsDialog.style.display = 'none';
        if (membersDialog) membersDialog.style.display = 'none';
        if (manageDialog) manageDialog.style.display = 'none';
        if (settingsDialog) settingsDialog.style.display = 'none';
    }

    /**
     * Handle Create Session form submission
     * Sends POST /createSession with body { name }, obtains session_id,
     * and automatically adds the session to the session list in UI.
     * @param {Event} e 
     */
    async function handleCreateSessionSubmit(e) {
        e.preventDefault();

        const sessionName = newSessionNameInput ? newSessionNameInput.value.trim() : '';
        if (!sessionName) {
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.createSessionErrEmpty', 'Please enter a conversation name.'), 'warning');
            }
            if (newSessionNameInput) newSessionNameInput.focus();
            return;
        }

        // Disable submit button while request is pending
        if (submitCreateSessionBtn) {
            submitCreateSessionBtn.disabled = true;
        }

        try {
            // Send POST /createSession with JSON body { name, description, token, userid }
            const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
            const currentUserId = currentUser ? currentUser.id : (auth ? auth.userId : null);
            const description = newSessionDescInput ? newSessionDescInput.value.trim() : '';
            const response = await window.OxypeCore.createSession(
                sessionName,
                description,
                auth ? auth.token : null,
                currentUserId
            );
            const sessionId = (response && (response.session_id || response.sessionId || response.id)) || Date.now();

            // Close dialog
            closeAllDialogs();

            // Automatically add newly created session to list and select it
            addNewSessionItem({
                sessionId: sessionId,
                sessionName: sessionName,
                description: description
            });

            // Select newly created conversation
            selectSession(sessionId);

            // Display success toast notification
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.createSessionSuccess', 'Conversation created successfully!'), 'success');
            }
        } catch (err) {
            console.error('[Chat] Create session failed:', err);
            const errorMsg = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(errorMsg, 'error');
            }
        } finally {
            if (submitCreateSessionBtn) {
                submitCreateSessionBtn.disabled = false;
            }
        }
    }

    /**
     * Join an existing conversation using an invite UUID.
     * @param {Event} e
     */
    async function handleJoinSessionSubmit(e) {
        e.preventDefault();

        const uuid = joinUuidInput ? joinUuidInput.value.trim() : '';
        if (!uuid) {
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.joinUuidErrEmpty', 'Please enter an invite UUID.'), 'warning');
            }
            if (joinUuidInput) joinUuidInput.focus();
            return;
        }

        if (submitJoinSessionBtn) {
            submitJoinSessionBtn.disabled = true;
        }

        try {
            const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
            const currentUserId = currentUser ? currentUser.id : (auth ? auth.userId : null);
            const session = await window.OxypeCore.joinSessionByUuid(uuid, currentUserId, auth ? auth.token : null);

            const joinedId = session && (session.sessionId || session.session_id || session.id);
            const joinedName = (session && session.sessionName) || `Session #${joinedId}`;

            closeAllDialogs();

            if (joinedId) {
                addNewSessionItem({ sessionId: joinedId, sessionName: joinedName, description: (session && session.description) || '' });
                selectSession(joinedId);
            } else {
                // Fall back to a full reload when the server omits the session id.
                await loadUserDataAndSessions(currentUserId);
            }

            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.joinSuccess', 'Joined the conversation!'), 'success');
            }
        } catch (err) {
            console.error('[Chat] Join session failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.joinFailed', `Failed to join: ${reason}`, { reason: reason }), 'error');
            }
        } finally {
            if (submitJoinSessionBtn) {
                submitJoinSessionBtn.disabled = false;
            }
        }
    }

    /**
     * Turns a failed request into a localized, user-facing reason.
     *
     * The backend answers with English reason strings, so the common failures are
     * mapped onto translated text while anything unrecognised falls through to the
     * server's own wording. The raw response is always logged by core.js.
     *
     * @param {Error} err
     * @param {string} [fallbackText]
     * @returns {string}
     */
    function describeRequestError(err, fallbackText) {
        if (err && err.isOffline) {
            return getI18nText('common.networkError', 'Unable to connect to server (Server offline)');
        }

        const reason = (err && err.message) ? String(err.message) : '';
        if (/invite uuid/i.test(reason)) {
            return getI18nText('chat.joinErrInvalidUuid', 'This invite UUID is invalid or has expired.');
        }
        if (err && err.status === 401) {
            return getI18nText('chat.errUnauthorized', 'Your session has expired. Please sign in again.');
        }
        if (err && err.status === 403) {
            return getI18nText('chat.errForbidden', 'You do not have permission to do that.');
        }

        return reason || fallbackText || getI18nText('common.error', 'An error occurred');
    }

    /**
     * Load the active conversation's info, members and invite UUIDs, then render
     * the settings dialog according to the caller's role.
     */
    async function loadSessionSettings() {
        if (ssSessionIdEl) {
            ssSessionIdEl.textContent = String(activeSessionId);
        }

        try {
            const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
            const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);
            const info = await window.OxypeCore.getSessionInfo(activeSessionId, userId, auth ? auth.token : null);
            activeSessionInfo = info || null;
        } catch (err) {
            console.warn('[Chat] Failed to load session info:', err.message);
            if (window.OxypeStyle) {
                const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
                window.OxypeStyle.showToast(getI18nText('chat.loadFailed', `Failed to load: ${reason}`, { reason: reason }), 'error');
            }
            return;
        }

        renderSessionSettings();
        await loadSessionInvites();
    }

    /** Paints the info/role sections from [activeSessionInfo]. */
    function renderSessionSettings() {
        const info = activeSessionInfo || {};
        const isOwner = Boolean(info.isOwner);
        const isAdmin = Boolean(info.isAdmin);

        if (ssSessionNameEl) ssSessionNameEl.textContent = info.sessionName || '-';
        if (ssSessionDescEl) ssSessionDescEl.textContent = info.description || getI18nText('chat.noDescription', 'No description');
        if (ssSessionOwnerEl) ssSessionOwnerEl.textContent = info.owner ? `#${info.owner}` : '-';

        // Management lives in its own toast, reachable through this entry button.
        if (openManageBtnEl) openManageBtnEl.style.display = (isOwner || isAdmin) ? 'inline-flex' : 'none';
        // Invite UUID management is owner-only.
        if (ssInviteSectionEl) ssInviteSectionEl.style.display = isOwner ? 'block' : 'none';

        if (ssNameInputEl) ssNameInputEl.value = info.sessionName || '';
        if (ssDescInputEl) ssDescInputEl.value = info.description || '';
    }

    /** Renders the member list with per-member roles and remove buttons. */
    async function loadSessionMembers() {
        if (!ssMemberListEl) return;

        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);

        let payload;
        try {
            payload = await window.OxypeCore.getSessionUsers(activeSessionId, userId, auth ? auth.token : null);
        } catch (err) {
            console.warn('[Chat] Failed to load session users:', err.message);
            ssMemberListEl.innerHTML = '';
            return;
        }

        const users = (payload && Array.isArray(payload.users)) ? payload.users : [];
        const info = activeSessionInfo || {};
        const isOwner = Boolean(info.isOwner);
        const isAdmin = Boolean(info.isAdmin);
        const admins = Array.isArray(info.admins) ? info.admins.map(String) : [];

        ssMemberListEl.innerHTML = '';

        if (users.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'invite-empty';
            empty.textContent = '-';
            ssMemberListEl.appendChild(empty);
            return;
        }

        users.forEach(u => {
            const memberId = String(u.userid);
            const isSelf = String(userId) === memberId;
            const memberIsOwner = String(info.owner) === memberId;
            const memberIsAdmin = admins.includes(memberId);

            let role = '';
            if (memberIsOwner) role = getI18nText('chat.memberOwner', 'Owner');
            else if (memberIsAdmin) role = getI18nText('chat.memberAdmin', 'Admin');
            if (isSelf) role = role ? `${role} · ${getI18nText('chat.memberYou', 'You')}` : getI18nText('chat.memberYou', 'You');

            const row = document.createElement('div');
            row.className = 'member-item';

            const name = u.username || `User #${memberId}`;
            row.innerHTML = `
                <div class="member-avatar">${escapeHtml(name.trim().charAt(0).toUpperCase() || '#')}</div>
                <div class="member-meta">
                    <div class="member-name">${escapeHtml(name)}</div>
                    <div class="member-role">${escapeHtml(role)}</div>
                </div>
            `;

            // Owner and admins may remove members, but never the owner, and only the
            // owner may remove a peer admin. This mirrors the server-side rules.
            const canRemove = (isOwner || isAdmin) && !memberIsOwner && !isSelf && (isOwner || !memberIsAdmin);
            if (canRemove) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'member-remove-btn';
                btn.textContent = getI18nText('chat.removeMemberBtn', 'Remove');
                btn.addEventListener('click', () => handleRemoveMember(u.userid));
                row.appendChild(btn);
            }

            ssMemberListEl.appendChild(row);
        });
    }

    /** Renders the invite UUID list (owner only). */
    async function loadSessionInvites() {
        if (!ssInviteListEl) return;

        const info = activeSessionInfo || {};
        if (!info.isOwner) {
            ssInviteListEl.innerHTML = '';
            return;
        }

        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);

        let payload;
        try {
            payload = await window.OxypeCore.getSessionInvites(activeSessionId, userId, auth ? auth.token : null);
        } catch (err) {
            console.warn('[Chat] Failed to load invites:', err.message);
            ssInviteListEl.innerHTML = '';
            return;
        }

        const uuids = (payload && Array.isArray(payload.uuids)) ? payload.uuids : [];
        const max = (payload && payload.max) || 10;

        if (ssInviteHintEl) {
            ssInviteHintEl.textContent = getI18nText('chat.invitesHint', `Up to ${max} invite UUIDs per conversation.`, { max: max });
        }

        ssInviteListEl.innerHTML = '';

        if (uuids.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'invite-empty';
            empty.textContent = getI18nText('chat.noInvites', 'No invite UUIDs yet.');
            ssInviteListEl.appendChild(empty);
        } else {
            uuids.forEach(rawUuid => {
                const uuid = String(rawUuid || '').replace(/^"|"$/g, '').trim();
                if (!uuid) return;
                const row = document.createElement('div');
                row.className = 'invite-item';

                const code = document.createElement('span');
                code.className = 'invite-code';
                code.textContent = uuid;

                const copyBtn = document.createElement('button');
                copyBtn.type = 'button';
                copyBtn.className = 'btn-secondary btn-sm';
                copyBtn.textContent = getI18nText('chat.copyInviteBtn', 'Copy');
                copyBtn.addEventListener('click', () => copyInviteUuid(uuid));

                const revokeBtn = document.createElement('button');
                revokeBtn.type = 'button';
                revokeBtn.className = 'btn-secondary btn-sm';
                revokeBtn.textContent = getI18nText('chat.revokeInviteBtn', 'Revoke');
                revokeBtn.addEventListener('click', () => handleRevokeInvite(uuid));

                row.appendChild(code);
                row.appendChild(copyBtn);
                row.appendChild(revokeBtn);
                ssInviteListEl.appendChild(row);
            });
        }
    }

    /** Copies an invite UUID to the clipboard. */
    function copyInviteUuid(uuid) {
        const cleanUuid = String(uuid || '').replace(/^"|"$/g, '').trim();
        const done = () => {
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.copied', 'Copied to clipboard'), 'success');
            }
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cleanUuid).then(done).catch(() => {});
        }
    }

    /** Saves the conversation name/description (owner or admin). */
    async function handleSaveSessionChanges(e) {
        e.preventDefault();

        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);
        const changes = {};
        if (ssNameInputEl && ssNameInputEl.value.trim()) {
            changes.name = ssNameInputEl.value.trim();
        }
        if (ssDescInputEl) {
            changes.description = ssDescInputEl.value.trim();
        }

        if (ssSaveBtnEl) ssSaveBtnEl.disabled = true;
        try {
            const updated = await window.OxypeCore.updateSession(activeSessionId, changes, userId, auth ? auth.token : null);
            activeSessionInfo = updated || activeSessionInfo;
            renderSessionSettings();
            updateActiveSessionHeader();
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.updateSuccess', 'Conversation updated.'), 'success');
            }
        } catch (err) {
            console.error('[Chat] Update session failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
            }
        } finally {
            if (ssSaveBtnEl) ssSaveBtnEl.disabled = false;
        }
    }

    /** Removes a member from the active conversation. */
    async function handleRemoveMember(targetUserId) {
        if (!window.confirm(getI18nText('chat.removeMemberConfirm', 'Remove this member from the conversation?'))) {
            return;
        }

        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);

        try {
            const updated = await window.OxypeCore.removeSessionMember(activeSessionId, targetUserId, userId, auth ? auth.token : null);
            if (updated) activeSessionInfo = updated;
            renderSessionSettings();
            await loadSessionMembers();
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.removeMemberSuccess', 'Member removed.'), 'success');
            }
        } catch (err) {
            console.error('[Chat] Remove member failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
            }
        }
    }

    /** Generates a new invite UUID (owner only). */
    async function handleCreateInvite() {
        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);

        if (ssCreateInviteBtnEl) ssCreateInviteBtnEl.disabled = true;
        try {
            await window.OxypeCore.createSessionInvite(activeSessionId, userId, auth ? auth.token : null);
            await loadSessionInvites();
        } catch (err) {
            console.error('[Chat] Create invite failed:', err);
            if (window.OxypeStyle) {
                const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
                const message = /maximum|invite uuid/i.test(reason)
                    ? getI18nText('chat.inviteLimitReached', 'This conversation already has the maximum invite UUIDs.', { max: 10 })
                    : getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason });
                window.OxypeStyle.showToast(message, 'error');
            }
        } finally {
            if (ssCreateInviteBtnEl) ssCreateInviteBtnEl.disabled = false;
        }
    }

    /** Revokes an invite UUID (owner only). */
    async function handleRevokeInvite(uuid) {
        const cleanUuid = String(uuid || '').replace(/^"|"$/g, '').trim();
        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);

        try {
            await window.OxypeCore.revokeSessionInvite(activeSessionId, cleanUuid, userId, auth ? auth.token : null);
            await loadSessionInvites();
        } catch (err) {
            console.error('[Chat] Revoke invite failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
            }
        }
    }

    /** Leaves the active conversation and removes it from the sidebar. */
    async function handleLeaveSession() {
        if (!window.confirm(getI18nText('chat.leaveConfirm', 'Leave this conversation?'))) {
            return;
        }

        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);
        const leavingId = activeSessionId;

        try {
            await window.OxypeCore.leaveSession(leavingId, userId, auth ? auth.token : null);

            closeAllDialogs();

            // Drop the conversation from the sidebar and clear the message view.
            const item = sessionListEl ? sessionListEl.querySelector(`[data-session-id="${leavingId}"]`) : null;
            if (item) item.remove();
            sessionsMap.delete(String(leavingId));

            activeSessionId = null;
            activeSessionInfo = null;
            if (sessionSettingsBtn) sessionSettingsBtn.style.display = 'none';
            if (chatHeaderEl) chatHeaderEl.classList.remove('has-session');
            if (chatComposerEl) chatComposerEl.style.display = 'none';
            if (currentSessionTitleEl) currentSessionTitleEl.textContent = '';
            if (currentSessionIdEl) {
                currentSessionIdEl.textContent = '';
                currentSessionIdEl.style.display = 'none';
            }
            if (messagesContainerEl) messagesContainerEl.innerHTML = '';

            const remaining = sessionListEl ? sessionListEl.querySelectorAll('.session-item').length : 0;
            if (remaining === 0 && emptySessionsPlaceholder) {
                emptySessionsPlaceholder.style.display = 'flex';
            }

            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.leaveSuccess', 'You left the conversation.'), 'success');
            }
        } catch (err) {
            console.error('[Chat] Leave session failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
            }
        }
    }

    /**
     * Refreshes the header title/subtitle for the active conversation.
     *
     * The subtitle shows the conversation description, falling back to the ID
     * when the conversation has no description.
     */
    function updateActiveSessionHeader() {
        if (!activeSessionId) return;

        const info = activeSessionInfo || {};
        const mapEntry = sessionsMap.get(String(activeSessionId)) || {};
        const displayName = info.sessionName || mapEntry.sessionName || `Session #${activeSessionId}`;
        const description = info.description || mapEntry.description || '';

        if (currentSessionTitleEl) {
            currentSessionTitleEl.textContent = displayName;
        }
        if (currentSessionIdEl) {
            currentSessionIdEl.style.display = 'block';
            currentSessionIdEl.textContent = description
                ? description
                : getI18nText('chat.sessionInfo', `Session ID: ${activeSessionId}`, { sessionId: activeSessionId });
        }
    }

    /**
     * Add a newly created session item directly into UI
     * @param {{sessionId: number|string, sessionName: string}} session 
     */
    function addNewSessionItem(session) {
        if (!sessionListEl) return;

        // Hide empty state placeholder if visible
        if (emptySessionsPlaceholder) {
            emptySessionsPlaceholder.style.display = 'none';
        }

        const sessionId = String(session.sessionId);
        const sessionName = session.sessionName || `Session #${sessionId}`;
        const sessionDesc = session.description || '';

        sessionsMap.set(sessionId, { sessionId, sessionName, description: sessionDesc });

        const sessionBtn = document.createElement('button');
        sessionBtn.className = 'session-item';
        sessionBtn.type = 'button';
        sessionBtn.dataset.sessionId = sessionId;

        const avatarChar = sessionName.trim().charAt(0).toUpperCase() || '#';

        sessionBtn.innerHTML = `
            <div class="session-avatar">${escapeHtml(avatarChar)}</div>
            <div class="session-details">
                <div class="session-name">${escapeHtml(sessionName)}</div>
                <div class="session-subtext">ID: ${escapeHtml(sessionId)}</div>
            </div>
        `;

        sessionBtn.addEventListener('click', () => {
            selectSession(sessionId);
        });

        // Insert at the top of the session list
        sessionListEl.insertBefore(sessionBtn, sessionListEl.firstChild);
    }

    /**
     * Render current user details in the sidebar footer
     */
    function renderUserProfile() {
        if (userAvatarEl && currentUser) {
            const initial = (currentUser.username || 'U').trim().charAt(0).toUpperCase();
            userAvatarEl.textContent = initial;
        }
        if (userDisplayNameEl && currentUser) {
            userDisplayNameEl.textContent = currentUser.username;
        }
        if (userIdBadgeEl && currentUser) {
            userIdBadgeEl.textContent = `ID: ${currentUser.id}`;
        }
    }

    /**
     * Fetch user profile (/getUser/{userid}) and joined sessions (/getJoinedSessions/{userid})
     * @param {string|number} userId 
     */
    async function loadUserDataAndSessions(userId) {
        // 1. Fetch user info via GET /getUser/{userid}
        try {
            const userProfile = await window.OxypeCore.getUser(userId);
            if (userProfile && userProfile.username) {
                currentUser.username = userProfile.username;
                renderUserProfile();
            }
        } catch (err) {
            // Note: Since server might not be running, handle offline state gracefully without crashing
            console.warn('[Chat] getUser request completed with offline/mock status:', err.message);
            if (err.isOffline && window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('common.networkError', 'Unable to connect to server (Server offline)'), 'warning');
            }
        }

        // 2. Fetch joined sessions via GET /getJoinedSessions/{userid}
        // Requirement: Do NOT add fake session templates. Only render what comes from the backend.
        try {
            const rawSessionIds = await window.OxypeCore.getJoinedSessions(userId);
            if (Array.isArray(rawSessionIds) && rawSessionIds.length > 0) {
                // Batch query session objects from /getSessions to resolve real session names immediately
                try {
                    const sessionObjects = await window.OxypeCore.getSessions(rawSessionIds);
                    if (sessionObjects && Array.isArray(sessionObjects) && sessionObjects.length > 0) {
                        renderSessionList(sessionObjects);
                        return;
                    }
                } catch (batchErr) {
                    console.warn('[Chat] Batch getSessions failed, rendering raw list:', batchErr.message);
                }
            }
            renderSessionList(rawSessionIds || []);
        } catch (err) {
            console.warn('[Chat] getJoinedSessions request completed with status:', err.message);
            // Render clean empty state
            renderSessionList([]);
        }
    }

    /**
     * Updates the latest message preview of the active session in the sidebar list.
     * @param {string} senderName
     * @param {string} content
     */
    function updateActiveSessionLastMessage(senderName, content) {
        if (!activeSessionId || !sessionListEl) return;
        const item = sessionListEl.querySelector(`[data-session-id="${activeSessionId}"]`);
        if (!item) return;
        const previewEl = item.querySelector('.session-last-message');
        if (previewEl) {
            previewEl.textContent = content ? `${senderName || 'User'}: ${content}` : '';
        }
    }

    /**
     * Render the session list strictly from real data.
     * No fake or mock session templates are introduced.
     * @param {Array<Object|number>} sessions 
     */
    function renderSessionList(sessions) {
        if (!sessionListEl) return;

        // Clear existing session buttons except placeholder
        const existingItems = sessionListEl.querySelectorAll('.session-item');
        existingItems.forEach(el => el.remove());

        if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
            // Display empty state placeholder
            if (emptySessionsPlaceholder) {
                emptySessionsPlaceholder.style.display = 'flex';
            }
            return;
        }

        // Hide empty state placeholder
        if (emptySessionsPlaceholder) {
            emptySessionsPlaceholder.style.display = 'none';
        }

        // Render each session returned by server
        sessions.forEach(session => {
            const sessionId = typeof session === 'object' ? (session.sessionId || session.id) : session;
            let sessionName = typeof session === 'object' ? (session.sessionName || session.name || `Session #${sessionId}`) : `Session #${sessionId}`;
            const sessionDesc = (typeof session === 'object' && session.description) ? session.description : '';

            sessionsMap.set(String(sessionId), { sessionId, sessionName, description: sessionDesc });

            const sessionBtn = document.createElement('button');
            sessionBtn.className = 'session-item';
            sessionBtn.type = 'button';
            sessionBtn.dataset.sessionId = String(sessionId);

            const avatarChar = sessionName.trim().charAt(0).toUpperCase() || '#';

            // The sidebar subtitle displays the latest message preview ("sender: message content"), blank when empty.
            sessionBtn.innerHTML = `
                <div class="session-avatar">${escapeHtml(avatarChar)}</div>
                <div class="session-details">
                    <div class="session-name">${escapeHtml(sessionName)}</div>
                    <div class="session-subtext session-last-message"></div>
                </div>
            `;

            sessionBtn.addEventListener('click', () => {
                selectSession(sessionId);
            });

            sessionListEl.appendChild(sessionBtn);
        });

        // Fetch the latest message preview for each session
        const previewUserId = currentUser ? currentUser.id : null;
        const previewAuth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        sessions.forEach(session => {
            const sessionId = typeof session === 'object' ? (session.sessionId || session.id) : session;
            if (sessionId === undefined || sessionId === null) return;
            window.OxypeCore.getLastMessage(sessionId, previewUserId, previewAuth ? previewAuth.token : null)
                .then(lastMsg => {
                    const sId = String(sessionId);
                    const item = sessionListEl.querySelector(`[data-session-id="${sId}"]`);
                    const previewEl = item ? item.querySelector('.session-last-message') : null;
                    if (previewEl) {
                        if (lastMsg && lastMsg.hasMessage && (lastMsg.content || lastMsg.senderName)) {
                            previewEl.textContent = `${lastMsg.senderName || 'User'}: ${lastMsg.content || ''}`;
                        } else {
                            previewEl.textContent = '';
                        }
                    }
                })
                .catch(err => {
                    console.warn(`[Chat] Failed to load lastMessage/${sessionId}:`, err.message);
                });
        });

        // Batch fetch real session metadata via POST /getSessions with { sessions: [...] }
        const sessionIdsToFetch = sessions
            .map(s => typeof s === 'object' ? (s.sessionId || s.id) : s)
            .filter(id => id !== undefined && id !== null);

        if (sessionIdsToFetch.length > 0) {
            window.OxypeCore.getSessions(sessionIdsToFetch).then(sessionObjects => {
                if (sessionObjects && Array.isArray(sessionObjects)) {
                    sessionObjects.forEach(sessionObj => {
                        if (!sessionObj) return;
                        const sId = String(sessionObj.sessionId || sessionObj.id || sessionObj.session_id);
                        const sName = sessionObj.sessionName || sessionObj.name;
                        const sDesc = sessionObj.description || '';
                        if (sName) {
                            sessionsMap.set(sId, { sessionId: sId, sessionName: sName, description: sDesc });

                            // Update corresponding sidebar element display name and avatar
                            const sessionBtn = sessionListEl.querySelector(`[data-session-id="${sId}"]`);
                            if (sessionBtn) {
                                const nameEl = sessionBtn.querySelector('.session-name');
                                const avatarEl = sessionBtn.querySelector('.session-avatar');
                                if (nameEl) nameEl.textContent = sName;
                                if (avatarEl) avatarEl.textContent = sName.trim().charAt(0).toUpperCase() || '#';
                            }

                            // If this session is currently active in main view, refresh the header
                            if (activeSessionId === sId) {
                                if (activeSessionInfo) {
                                    activeSessionInfo.sessionName = sName;
                                    activeSessionInfo.description = sDesc;
                                }
                                updateActiveSessionHeader();
                            }
                        }
                    });
                }
            }).catch(err => {
                console.warn('[Chat] Failed to batch load session names via /getSessions:', err.message);
            });
        }
    }

    /**
     * Select and open a session, fetching its details via GET /getSession/{sessionId}
     * @param {number|string} sessionId 
     */
    async function selectSession(sessionId) {
        activeSessionId = String(sessionId);

        // Update active class in sidebar list
        const items = sessionListEl.querySelectorAll('.session-item');
        items.forEach(item => {
            if (item.dataset.sessionId === activeSessionId) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Activate header divider line and show composer
        if (chatHeaderEl) chatHeaderEl.classList.add('has-session');
        if (chatComposerEl) chatComposerEl.style.display = 'flex';

        // Reveal the conversation settings button (top-right) for an active chat
        if (sessionSettingsBtn) sessionSettingsBtn.style.display = 'flex';

        // Query session details via /getSession/{sessionId}
        let sessionData = sessionsMap.get(activeSessionId);
        try {
            const fetched = await window.OxypeCore.getSession(sessionId);
            if (fetched) {
                sessionData = {
                    sessionId: fetched.sessionId || sessionId,
                    sessionName: fetched.sessionName || (sessionData && sessionData.sessionName) || `Session #${sessionId}`,
                    description: fetched.description || ''
                };
                sessionsMap.set(activeSessionId, sessionData);
                // Retain role flags so the settings dialog can gate its controls.
                activeSessionInfo = fetched;
            }
        } catch (err) {
            console.warn(`[Chat] getSession/${sessionId} request completed with status:`, err.message);
            activeSessionInfo = null;
        }

        // Header shows the conversation name plus its description (falling back to the ID)
        updateActiveSessionHeader();

        // Clear messages view for newly selected session
        messagesContainerEl.innerHTML = '';
        // Reset the date tracking so the first message of the reloaded history
        // always emits its own date separator.
        lastRenderedDateKey = '';

        // Query received message sequence & message history
        const userId = currentUser ? currentUser.id : null;
        activeSessionUsers.clear();
        try {
            const memberInfo = await window.OxypeCore.getSessionUsers(sessionId, userId);
            if (memberInfo && Array.isArray(memberInfo.users)) {
                memberInfo.users.forEach(u => {
                    if (u && u.userid != null) {
                        activeSessionUsers.set(String(u.userid), u.username || `User #${u.userid}`);
                    }
                });
            }
        } catch (e) {
            console.warn(`[Chat] getSessionUsers/${sessionId} skipped:`, e.message);
        }

        try {
            // Retrieve latest read/received message sequence for this session
            const seq = await window.OxypeCore.getReceivedMessageSeq(userId, sessionId);
            currentSeq = Number(seq) || 0;

            // Range: 50 messages before and 50 messages after (min forward limit is 0)
            const start = (currentSeq - 50 > 0) ? (currentSeq - 50) : 0;
            const end = currentSeq + 50;

            const messages = await window.OxypeCore.getMessages(sessionId, start, end, userId);

            if (Array.isArray(messages) && messages.length > 0) {
                messagesContainerEl.innerHTML = '';
                messages.forEach(msg => {
                    let text = '';
                    if (Array.isArray(msg.pieces)) {
                        text = msg.pieces
                            .filter(p => p && p.type === 'text')
                            .map(p => p.text || '')
                            .join('');
                    } else if (typeof msg.pieces === 'string') {
                        text = msg.pieces;
                    } else if (typeof msg.text === 'string') {
                        text = msg.text;
                    }

                    if (text) {
                        const currentUserId = (currentUser && currentUser.id != null)
                            ? currentUser.id
                            : (window.OxypeCore && window.OxypeCore.getStoredAuth() ? window.OxypeCore.getStoredAuth().userId : null);
                        const senderId = (msg.sender !== undefined && msg.sender !== null) ? msg.sender : msg.userid;
                        const isSelf = Boolean(currentUserId != null && senderId != null && String(senderId) === String(currentUserId));
                        const senderName = isSelf
                            ? (currentUser && currentUser.username ? currentUser.username : 'Me')
                            : (activeSessionUsers.get(String(senderId)) || (senderId != null ? `User #${senderId}` : 'User'));

                        // The server stamps each message in epoch milliseconds; older
                        // records predate the field and render without a clock time.
                        const timestampMs = (msg.timestamp !== undefined && msg.timestamp !== null)
                            ? Number(msg.timestamp)
                            : 0;

                        appendMessage({
                            text: text,
                            sender: senderName,
                            isSelf: isSelf,
                            timestamp: formatClockTime(timestampMs),
                            timestampMs: timestampMs
                        });
                    }
                });
            } else {
                showEmptyConversationHint();
            }
        } catch (err) {
            console.warn('[Chat] Failed to load messages history:', err);
            showEmptyConversationHint();
        }

        if (messageInputEl) {
            messageInputEl.focus();
        }
    }

    /**
     * Display empty conversation placeholder
     */
    function showEmptyConversationHint() {
        if (!messagesContainerEl) return;
        messagesContainerEl.innerHTML = '';
        const emptyHint = document.createElement('div');
        emptyHint.className = 'empty-chat-splash';
        emptyHint.id = 'emptyConversationHint';
        emptyHint.innerHTML = `
            <div class="empty-chat-splash-icon">
                <svg class="icon-svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            <div class="empty-chat-splash-desc">${escapeHtml(getI18nText('chat.emptyConversation', 'No messages in this conversation yet.'))}</div>
        `;
        messagesContainerEl.appendChild(emptyHint);
    }

    /**
     * Handle sending a message in the active session
     */
    async function handleSendMessage() {
        if (!messageInputEl || !activeSessionId) return;

        const text = messageInputEl.value.trim();
        if (!text) return;

        // Clear input immediately and maintain focus
        messageInputEl.value = '';
        messageInputEl.focus();

        // Remove empty conversation hint if present
        const hint = document.getElementById('emptyConversationHint');
        if (hint) hint.remove();

        // Stamp the optimistic bubble locally; the server assigns the authoritative
        // timestamp when the message is stored.
        const sentAtMs = Date.now();
        const timestamp = formatClockTime(sentAtMs);
        const myName = currentUser && currentUser.username ? currentUser.username : 'Me';

        // Optimistically render outgoing message bubble in the stream
        appendMessage({
            text: text,
            sender: myName,
            isSelf: true,
            timestamp: timestamp,
            timestampMs: sentAtMs
        });
        updateActiveSessionLastMessage(myName, text);

        // Send POST to /sendMessage/{sessionId}
        try {
            const senderId = currentUser ? currentUser.id : null;
            const res = await window.OxypeCore.sendMessage(activeSessionId, text, senderId);
            if (res && typeof res.seq === 'number' && res.seq > 0) {
                currentSeq = res.seq;
            }
        } catch (err) {
            console.error('[Chat] Failed to send message:', err);
            if (window.OxypeStyle) {
                const errorMsg = err.isOffline
                    ? getI18nText('common.networkError', 'Unable to connect to server (Server offline)')
                    : (err.message || getI18nText('common.error', 'Failed to send message'));
                window.OxypeStyle.showToast(errorMsg, 'error');
            }
        }
    }

    /**
     * Format a millisecond timestamp as a clock time, precise to hour/minute/second.
     * @param {number|undefined|null} timestamp
     * @returns {string} e.g. "09:07:42", or '' when there is no usable timestamp
     */
    function formatClockTime(timestamp) {
        const ms = Number(timestamp);
        if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
        return new Date(ms).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    /**
     * Format a millisecond timestamp as a year/month/day date label.
     * @param {number|undefined|null} timestamp
     * @returns {string} e.g. "2026/10/06", or '' when there is no usable timestamp
     */
    function formatDateLabel(timestamp) {
        const ms = Number(timestamp);
        if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
        const d = new Date(ms);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
    }

    /**
     * Identity of the calendar day a timestamp falls on, used to detect date changes.
     * @param {number|undefined|null} timestamp
     * @returns {string} e.g. "2026-10-06", or '' when there is no usable timestamp
     */
    function dateKeyOf(timestamp) {
        const ms = Number(timestamp);
        if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
        const d = new Date(ms);
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    /**
     * Append a date separator row: the date sits on the far left and a divider line
     * run alongside it, marking the boundary between messages of different days.
     * @param {number} timestamp Milliseconds of the first message of the new date
     */
    function appendDateSeparator(timestamp) {
        if (!messagesContainerEl) return;

        const row = document.createElement('div');
        row.className = 'message-date-separator';

        const label = document.createElement('span');
        label.className = 'message-date-label';
        label.textContent = formatDateLabel(timestamp);

        const line = document.createElement('span');
        line.className = 'message-date-line';

        row.appendChild(label);
        row.appendChild(line);
        messagesContainerEl.appendChild(row);
    }

    /**
     * Append a message bubble to the messages stream.
     * A date separator is inserted ahead of the first message of each new date, so
     * the year/month/day is taken from the first message that crosses into that date.
     * @param {{text: string, sender: string, isSelf: boolean, timestamp: string, timestampMs?: number}} msg
     */
    function appendMessage(msg) {
        if (!messagesContainerEl) return;

        // Insert the date boundary before the first message belonging to a new day.
        const key = dateKeyOf(msg.timestampMs);
        if (key && key !== lastRenderedDateKey) {
            appendDateSeparator(msg.timestampMs);
            lastRenderedDateKey = key;
        }

        const row = document.createElement('div');
        row.className = `message-row ${msg.isSelf ? 'outgoing' : 'incoming'}`;

        const senderName = msg.sender || (msg.isSelf ? (currentUser && currentUser.username ? currentUser.username : 'Me') : 'User');
        const avatarChar = senderName.trim().charAt(0).toUpperCase() || '?';

        row.innerHTML = `
            <div class="message-avatar" aria-hidden="true">${escapeHtml(avatarChar)}</div>
            <div class="message-bubble">
                <div class="message-sender">${escapeHtml(senderName)}</div>
                <div class="message-content">${escapeHtml(msg.text)}</div>
                <div class="message-timestamp">${escapeHtml(msg.timestamp)}</div>
            </div>
        `;

        messagesContainerEl.appendChild(row);
        messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
    }

    /**
     * Logout handler
     */
    function handleLogout() {
        if (window.OxypeCore) {
            window.OxypeCore.clearAuth();
        }
        window.location.href = 'index.html';
    }

    /**
     * Helper to retrieve localized text
     * @param {string} key 
     * @param {string} fallback 
     * @param {Object} [params] 
     * @returns {string}
     */
    function getI18nText(key, fallback, params) {
        if (window.OxypeI18n) {
            return window.OxypeI18n.t(key, params);
        }
        return fallback;
    }

    /**
     * HTML escape helper
     * @param {string} str 
     * @returns {string}
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Attach initializer
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
