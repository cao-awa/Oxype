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

    // Create Session Elements
    let createSessionBtn;
    let createSessionDialog;
    let createSessionForm;
    let newSessionNameInput;
    let closeCreateSessionBtn;
    let cancelCreateSessionBtn;
    let submitCreateSessionBtn;

    // Settings Elements
    let settingsBtn;
    let settingsDialog;
    let closeSettingsBtn;
    let dialogThemeToggle;
    let dialogLogoutBtn;
    let dialogOverlay;

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

        // Create Session references
        createSessionBtn = document.getElementById('createSessionBtn');
        createSessionDialog = document.getElementById('createSessionDialog');
        createSessionForm = document.getElementById('createSessionForm');
        newSessionNameInput = document.getElementById('newSessionNameInput');
        closeCreateSessionBtn = document.getElementById('closeCreateSessionBtn');
        cancelCreateSessionBtn = document.getElementById('cancelCreateSessionBtn');
        submitCreateSessionBtn = document.getElementById('submitCreateSessionBtn');

        // Settings references
        settingsBtn = document.getElementById('settingsBtn');
        settingsDialog = document.getElementById('settingsDialog');
        closeSettingsBtn = document.getElementById('closeSettingsBtn');
        dialogThemeToggle = document.getElementById('dialogThemeToggle');
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

        // Create Session dialog events
        if (createSessionBtn) {
            createSessionBtn.addEventListener('click', openCreateSessionDialog);
        }

        if (closeCreateSessionBtn) {
            closeCreateSessionBtn.addEventListener('click', closeAllDialogs);
        }

        if (cancelCreateSessionBtn) {
            cancelCreateSessionBtn.addEventListener('click', closeAllDialogs);
        }

        if (createSessionForm) {
            createSessionForm.addEventListener('submit', handleCreateSessionSubmit);
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
     * Open Create Session dialog
     */
    function openCreateSessionDialog() {
        closeAllDialogs();
        if (dialogOverlay) dialogOverlay.style.display = 'block';
        if (createSessionDialog) {
            createSessionDialog.style.display = 'block';
            if (newSessionNameInput) {
                newSessionNameInput.value = '';
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
     * Close all active dialogs
     */
    function closeAllDialogs() {
        if (dialogOverlay) dialogOverlay.style.display = 'none';
        if (createSessionDialog) createSessionDialog.style.display = 'none';
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
            // Send POST /createSession with JSON body { name, token, userid }
            const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
            const currentUserId = currentUser ? currentUser.id : (auth ? auth.userId : null);
            const response = await window.OxypeCore.createSession(
                sessionName,
                auth ? auth.token : null,
                currentUserId
            );
            const sessionId = (response && (response.session_id || response.sessionId || response.id)) || Date.now();

            // Close dialog
            closeAllDialogs();

            // Automatically add newly created session to list and select it
            addNewSessionItem({
                sessionId: sessionId,
                sessionName: sessionName
            });

            // Select newly created conversation
            selectSession(sessionId);

            // Display success toast notification
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.createSessionSuccess', 'Conversation created successfully!'), 'success');
            }
        } catch (err) {
            console.error('[Chat] Create session failed:', err);
            const errorMsg = err.isOffline
                ? getI18nText('common.networkError', 'Unable to connect to server (Server offline)')
                : (err.message || getI18nText('common.error', 'An error occurred'));
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

        sessionsMap.set(sessionId, { sessionId, sessionName });

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

            sessionsMap.set(String(sessionId), { sessionId, sessionName });

            const sessionBtn = document.createElement('button');
            sessionBtn.className = 'session-item';
            sessionBtn.type = 'button';
            sessionBtn.dataset.sessionId = String(sessionId);

            const avatarChar = sessionName.trim().charAt(0).toUpperCase() || '#';

            sessionBtn.innerHTML = `
                <div class="session-avatar">${escapeHtml(avatarChar)}</div>
                <div class="session-details">
                    <div class="session-name">${escapeHtml(sessionName)}</div>
                    <div class="session-subtext">ID: ${escapeHtml(String(sessionId))}</div>
                </div>
            `;

            sessionBtn.addEventListener('click', () => {
                selectSession(sessionId);
            });

            sessionListEl.appendChild(sessionBtn);
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
                        if (sName) {
                            sessionsMap.set(sId, { sessionId: sId, sessionName: sName });

                            // Update corresponding sidebar element display name and avatar
                            const sessionBtn = sessionListEl.querySelector(`[data-session-id="${sId}"]`);
                            if (sessionBtn) {
                                const nameEl = sessionBtn.querySelector('.session-name');
                                const avatarEl = sessionBtn.querySelector('.session-avatar');
                                if (nameEl) nameEl.textContent = sName;
                                if (avatarEl) avatarEl.textContent = sName.trim().charAt(0).toUpperCase() || '#';
                            }

                            // If this session is currently active in main view, update header title
                            if (activeSessionId === sId && currentSessionTitleEl) {
                                currentSessionTitleEl.textContent = sName;
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

        // Query session details via /getSession/{sessionId}
        let sessionData = sessionsMap.get(activeSessionId);
        try {
            const fetched = await window.OxypeCore.getSession(sessionId);
            if (fetched) {
                sessionData = {
                    sessionId: fetched.sessionId || sessionId,
                    sessionName: fetched.sessionName || (sessionData && sessionData.sessionName) || `Session #${sessionId}`
                };
                sessionsMap.set(activeSessionId, sessionData);
            }
        } catch (err) {
            console.warn(`[Chat] getSession/${sessionId} request completed with status:`, err.message);
        }

        // Update header UI
        const displayName = (sessionData && sessionData.sessionName) ? sessionData.sessionName : `Session #${sessionId}`;
        if (currentSessionTitleEl) {
            currentSessionTitleEl.textContent = displayName;
        }
        if (currentSessionIdEl) {
            currentSessionIdEl.style.display = 'block';
            currentSessionIdEl.textContent = getI18nText('chat.sessionInfo', `Session ID: ${sessionId}`, { sessionId: sessionId });
        }

        // Clear messages view for newly selected session
        messagesContainerEl.innerHTML = '';

        // Query received message sequence & message history
        const userId = currentUser ? currentUser.id : null;
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

                        appendMessage({
                            text: text,
                            sender: isSelf ? (currentUser && currentUser.username ? currentUser.username : 'Me') : (senderId != null ? `User #${senderId}` : 'User'),
                            isSelf: isSelf,
                            timestamp: msg.time ? new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
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

        const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Optimistically render outgoing message bubble in the stream
        appendMessage({
            text: text,
            sender: currentUser ? currentUser.username : 'Me',
            isSelf: true,
            timestamp: timestamp
        });

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
     * Append a message bubble to the messages stream
     * @param {{text: string, sender: string, isSelf: boolean, timestamp: string}} msg 
     */
    function appendMessage(msg) {
        if (!messagesContainerEl) return;

        const row = document.createElement('div');
        row.className = `message-row ${msg.isSelf ? 'outgoing' : 'incoming'}`;

        row.innerHTML = `
            <div class="message-bubble">
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
