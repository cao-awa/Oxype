/**
 * Oxype Web Client - Page Logic
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
    let messageFormatOptionsEl;
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
    // Rows a friend conversation hides or relabels: it has no own name, no owner,
    // no roster, no invite UUIDs and no conversation avatar, and leaving it deletes
    // the friend rather than leaving a group.
    let ssNameRowEl;
    let ssOwnerRowEl;
    let ssAvatarSectionEl;
    let ssNavSectionEl;
    let ssLeaveLabelEl;
    let ssLeaveBtnLabelEl;
    // Members / management toasts and their entry buttons
    let membersDialog;
    let closeMembersBtnEl;
    let openMembersBtnEl;
    let manageDialog;
    let closeManageBtnEl;
    let openManageBtnEl;
    // Per-member management toast, reached through the "Manage" button on a member row
    let memberManageDialog;
    let closeMemberManageBtnEl;
    let mmMemberNameEl;
    let mmMemberRoleEl;
    let mmGrantAdminBtnEl;
    let mmRevokeAdminBtnEl;
    let mmRemoveBtnEl;
    /** The member row the per-member toast is currently acting on, if any. */
    let memberManageTarget = null;

    // Style source inputs (chat.html / chat.css / chat.js overrides) and their toast
    let styleSourcesDialogEl;
    let openStyleSourcesBtnEl;
    let closeStyleSourcesBtnEl;
    let styleSourceHtmlEl;
    let styleSourceCssEl;
    let styleSourceJsEl;
    let styleSourcesHintEl;
    let styleSourcesSaveBtnEl;
    let styleSourcesResetBtnEl;

    // Style source security warning, built on first use (see the builder function)
    let styleSourcesRiskDialogEl;
    let styleSourcesRiskScrimEl;
    let closeStyleSourcesRiskBtnEl;
    let styleSourcesRiskListEl;
    let styleSourcesRiskCheckboxEl;
    let styleSourcesRiskCancelBtnEl;
    let styleSourcesRiskConfirmBtnEl;

    // The validated values the warning is currently asking the user to accept. The
    // save only proceeds once the user confirms, so they are held here meanwhile.
    let pendingStyleSources = null;

    // Bundled defaults and limits reported by the server for the style sources
    let styleSourceDefaults = { html: '/chat.html', css: '/chat.css', js: '/chat.js' };
    let styleSourceMaxLength = 128;

    // Avatar toast (the caller's own picture) and the conversation avatar controls
    let avatarDialogEl;
    let openAvatarBtnEl;
    let closeAvatarBtnEl;
    let avatarPreviewEl;
    let avatarHintEl;
    let avatarFileInputEl;
    let avatarChooseBtnEl;
    let avatarRemoveBtnEl;
    let ssAvatarPreviewEl;
    let ssAvatarHintEl;
    let ssAvatarFileInputEl;
    let ssAvatarChooseBtnEl;
    let ssAvatarRemoveBtnEl;

    // Every avatar URL learned so far, keyed by `user:<id>` / `session:<id>`.
    //
    // A transcript can show the same person on hundreds of rows, and the roster and
    // session list ask for the same picture again, so the URL is remembered here and
    // every surface reads from it. An entry is written whenever the server reports one,
    // and an empty string is a real answer ("this one has no picture"), not a miss.
    const avatarUrlCache = new Map();
    /** Largest image the server will accept, refreshed from its own report. */
    let avatarMaxBytes = 3 * 1024 * 1024;
    /** The conversation id the currently open settings toast belongs to, if any. */
    let ssAvatarTargetSessionId = null;

    // Friends toast: search field, the two request lists, and the profile toast that
    // shows the account a search found. The account shown is held here rather than in
    // the DOM so the add button knows whose id to send.
    let openFriendsBtnEl;
    let friendsDialogEl;
    let closeFriendsBtnEl;
    let friendSearchInputEl;
    let friendSearchBtnEl;
    let friendSearchHintEl;
    let friendIncomingListEl;
    let friendIncomingEmptyEl;
    let friendOutgoingListEl;
    let friendOutgoingEmptyEl;
    let friendUserDialogEl;
    let closeFriendUserBtnEl;
    let friendUserAvatarEl;
    let friendUserNameEl;
    let friendUserIdEl;
    let friendUserStatusEl;
    let friendUserAddBtnEl;
    /** The account the profile toast is currently showing, or null when it is closed. */
    let friendUserTarget = null;
    /** Guards against two searches overlapping and drawing the older answer last. */
    let friendSearchSeq = 0;

    // How the outgoing message body should be interpreted. 'text' renders literally,
    // 'markdown' runs through the bundled renderer. The value is sent as the message
    // piece type, so it travels with the message rather than being re-decided later.
    const MESSAGE_FORMATS = ['text', 'markdown'];    const MESSAGE_FORMAT_STORAGE_KEY = 'oxype_message_format';
    /** Tallest the composer textarea may grow before it scrolls, in pixels. */
    const COMPOSER_MAX_HEIGHT = 200;

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
    let websocketListenerBound = false;
    let sessionLoadToken = 0;
    let historyLoadingSessionId = null;
    const pendingRealtimeMessages = new Map();
    const renderedMessageKeys = new Set();

    // Scrollback paging. The transcript is loaded as one window ending at the newest
    // message, so anything older has to be fetched on demand. `historyOldestSeq`
    // remembers the lowest sequence ever asked for, which is what the next request
    // counts back from; it moves down in PAGE_SIZE steps and therefore always
    // terminates, even across stretches of deleted (and thus unreadable) messages.
    // One page is deliberately large: the reader scrolls a long way before another
    // request is made, so the transcript never pulls in earlier messages while they
    // are still reading the ones already on screen.
    const HISTORY_PAGE_SIZE = 200;
    // A range whose messages were all deleted returns nothing, and asking again for
    // the range below it is progress rather than a failure. This caps how far that
    // can run before paging gives up, so a conversation emptied in bulk cannot turn
    // every upward scroll into a long chain of requests.
    const HISTORY_MAX_EMPTY_PAGES = 10;
    let historyOldestSeq = null;
    let historyReachedTop = false;
    let historyPageInFlight = false;
    let historyEmptyPageStreak = 0;
    // Scroll fires in bursts, and each check reads layout, so the work is coalesced
    // into one pass per frame.
    let historyCheckScheduled = false;
    // Cache both in-flight and completed profile lookups so one sender is requested once.
    const senderProfilePromises = new Map();
    // One preview re-read per conversation at a time. A delete made here also arrives
    // back as a broadcast, and both paths ask for the same answer.
    const previewRefreshes = new Map();

    // Periodic calibration. Broadcasts are the fast path, but they are also the only
    // path: one frame lost to a reconnect, a suspended tab, or a socket that died
    // mid-handshake leaves the transcript wrong with nothing to correct it, and it
    // stays wrong until the conversation is opened again. This cycle re-reads what the
    // server considers current and reconciles against it. It is deliberately invisible:
    // no spinner, no toast, no jump -- a correction the reader did not ask for should
    // not move their scroll position or their attention.
    const CALIBRATION_INTERVAL_MS = 10000;
    // How much of the transcript is checked against the server in one pass. The window
    // walks from the oldest rendered message upwards, so a long transcript is verified
    // over several passes instead of re-fetching all of it every ten seconds.
    const CALIBRATION_VERIFY_SPAN = 200;
    // Appending content must not drag a reader who scrolled back into the history down
    // to the bottom, so a live-follow only happens within this many pixels of the end.
    const NEAR_BOTTOM_SLOP_PX = 48;
    // The sidebar is re-read a few conversations per pass instead of all of them, so a
    // long list does not turn each cycle into a burst of requests. Every conversation is
    // still reached, just over several passes.
    const CALIBRATION_PREVIEWS_PER_PASS = 3;
    // A calibration request that outlives the cycle that issued it is worthless, but it
    // still holds the in-flight guard and blocks every later pass. The read is given
    // longer than a keystroke-driven request needs, and less than two cycles, so a dead
    // connection costs one skipped pass rather than the whole mechanism.
    const CALIBRATION_REQUEST_TIMEOUT_MS = 8000;
    let calibrationTimer = null;
    let calibrationInFlight = false;
    // Bumped whenever the cycle is torn down. A pass that was already awaiting a
    // response when that happened compares its captured copy and abandons its work
    // instead of painting into a conversation the reader has since left.
    let calibrationGeneration = 0;
    // First sequence of the next verification window, or null to restart from the
    // oldest rendered message. Paired with the conversation it belongs to, because the
    // same numbers mean different messages in a different conversation.
    let calibrationVerifyFrom = null;
    let calibrationVerifySessionId = null;
    // Walks the sidebar so every conversation's preview is re-read eventually without
    // asking the server about all of them on every pass.
    let calibrationPreviewCursor = 0;

    // Right-click message actions. One menu element is reused and moved between rows
    // instead of one per message, so the DOM does not grow with the conversation and the
    // row under the pointer is the only state that has to be tracked.
    let messageMenuEl = null;
    let messageMenuTargetRow = null;
    // The row currently being edited in place, if any. A second menu cannot start a
    // second editor, so this also acts as the "one edit at a time" latch.
    let editingRow = null;

    // The message the next send answers, if any. Replying is a property of the
    // composer rather than of a message: it survives switching the draft's text and
    // is cleared by sending, cancelling, or leaving the conversation. Only the id is
    // authoritative — the name and body are kept for the bar's label so it can be
    // shown without asking the server about a message that is already on screen.
    let replyTarget = null;
    // The bar announcing the pending reply. Built in JS rather than read from the
    // page, because a user-supplied chat.html will not contain markup added later.
    let replyBarEl = null;
    // A leftward drag along a row on a touch screen. Held separately from the
    // long-press state because the two gestures start identically and only separate
    // once the finger has travelled far enough to have a direction.
    let swipeState = null;
    const REPLY_SWIPE_TRIGGER_PX = 64;
    const REPLY_SWIPE_MAX_PX = 96;
    // A swipe has to be decisively sideways before it counts. Anything shallower is a
    // scroll that wobbled, and answering it with a reply would be a false positive.
    const REPLY_SWIPE_AXIS_RATIO = 1.4;
    const REPLY_JUMP_MAX_PAGES = 20;

    // A touch has no right button, so the same menu is raised by a long press. The
    // pending press is tracked here so movement, a scroll, or lifting the finger can
    // cancel it before it fires.
    let longPressTimer = null;
    let longPressStart = null;
    const LONG_PRESS_MS = 500;
    const LONG_PRESS_SLOP = 10;

    // Mobile drawer. On a narrow screen the sidebar covers the conversation, so it is
    // only on screen when it was asked for. The toggle and the scrim are built here
    // rather than read from the page, because a user-supplied chat.html will not contain
    // markup added later. See ensureSidebarControls().
    let sidebarEl = null;
    let sidebarToggleEl = null;
    let sidebarScrimEl = null;

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
        messageFormatOptionsEl = document.getElementById('messageFormatOptions');
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
        ssNameRowEl = document.getElementById('ssNameRow');
        ssOwnerRowEl = document.getElementById('ssOwnerRow');
        ssAvatarSectionEl = document.getElementById('ssAvatarSection');
        ssNavSectionEl = document.getElementById('ssNavSection');
        ssLeaveLabelEl = document.getElementById('ssLeaveLabel');
        ssLeaveBtnLabelEl = document.getElementById('ssLeaveBtnLabel');

        // Members / management toasts
        membersDialog = document.getElementById('membersDialog');
        closeMembersBtnEl = document.getElementById('closeMembersBtn');
        openMembersBtnEl = document.getElementById('openMembersBtn');
        manageDialog = document.getElementById('manageDialog');
        closeManageBtnEl = document.getElementById('closeManageBtn');
        openManageBtnEl = document.getElementById('openManageBtn');

        // Per-member management toast
        memberManageDialog = document.getElementById('memberManageDialog');
        closeMemberManageBtnEl = document.getElementById('closeMemberManageBtn');
        mmMemberNameEl = document.getElementById('mmMemberName');
        mmMemberRoleEl = document.getElementById('mmMemberRole');
        mmGrantAdminBtnEl = document.getElementById('mmGrantAdminBtn');
        mmRevokeAdminBtnEl = document.getElementById('mmRevokeAdminBtn');
        mmRemoveBtnEl = document.getElementById('mmRemoveBtn');

        // Settings references
        settingsBtn = document.getElementById('settingsBtn');
        settingsDialog = document.getElementById('settingsDialog');
        closeSettingsBtn = document.getElementById('closeSettingsBtn');
        dialogLogoutBtn = document.getElementById('dialogLogoutBtn');
        dialogOverlay = document.getElementById('dialogOverlay');

        // Style source (chat.html / chat.css / chat.js) references, in their own toast
        styleSourcesDialogEl = document.getElementById('styleSourcesDialog');
        openStyleSourcesBtnEl = document.getElementById('openStyleSourcesBtn');
        closeStyleSourcesBtnEl = document.getElementById('closeStyleSourcesBtn');
        styleSourceHtmlEl = document.getElementById('styleSourceHtml');
        styleSourceCssEl = document.getElementById('styleSourceCss');
        styleSourceJsEl = document.getElementById('styleSourceJs');
        styleSourcesHintEl = document.getElementById('styleSourcesHint');
        styleSourcesSaveBtnEl = document.getElementById('styleSourcesSaveBtn');
        styleSourcesResetBtnEl = document.getElementById('styleSourcesResetBtn');

        // Avatar toast, and the conversation avatar controls inside the session toast
        avatarDialogEl = document.getElementById('avatarDialog');
        openAvatarBtnEl = document.getElementById('openAvatarBtn');
        closeAvatarBtnEl = document.getElementById('closeAvatarBtn');
        avatarPreviewEl = document.getElementById('avatarPreview');
        avatarHintEl = document.getElementById('avatarHint');
        avatarFileInputEl = document.getElementById('avatarFileInput');
        avatarChooseBtnEl = document.getElementById('avatarChooseBtn');
        avatarRemoveBtnEl = document.getElementById('avatarRemoveBtn');
        ssAvatarPreviewEl = document.getElementById('ssAvatarPreview');
        ssAvatarHintEl = document.getElementById('ssAvatarHint');
        ssAvatarFileInputEl = document.getElementById('ssAvatarFileInput');
        ssAvatarChooseBtnEl = document.getElementById('ssAvatarChooseBtn');
        ssAvatarRemoveBtnEl = document.getElementById('ssAvatarRemoveBtn');

        // Friends toast, and the profile toast that a search opens on top of it
        openFriendsBtnEl = document.getElementById('openFriendsBtn');
        friendsDialogEl = document.getElementById('friendsDialog');
        closeFriendsBtnEl = document.getElementById('closeFriendsBtn');
        friendSearchInputEl = document.getElementById('friendSearchInput');
        friendSearchBtnEl = document.getElementById('friendSearchBtn');
        friendSearchHintEl = document.getElementById('friendSearchHint');
        friendIncomingListEl = document.getElementById('friendIncomingList');
        friendIncomingEmptyEl = document.getElementById('friendIncomingEmpty');
        friendOutgoingListEl = document.getElementById('friendOutgoingList');
        friendOutgoingEmptyEl = document.getElementById('friendOutgoingEmpty');
        friendUserDialogEl = document.getElementById('friendUserDialog');
        closeFriendUserBtnEl = document.getElementById('closeFriendUserBtn');
        friendUserAvatarEl = document.getElementById('friendUserAvatar');
        friendUserNameEl = document.getElementById('friendUserName');
        friendUserIdEl = document.getElementById('friendUserId');
        friendUserStatusEl = document.getElementById('friendUserStatus');
        friendUserAddBtnEl = document.getElementById('friendUserAddBtn');

        // The security warning is built on demand rather than read from the page: a
        // user-supplied chat.html performs the save too, and such a page will not
        // contain markup added here. Building it keeps the warning present whatever
        // page is loaded. See buildStyleSourcesRiskDialog().
        // The drawer controls are built for the same reason, on the same page.
        ensureSidebarControls();

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

        // Start the shared realtime transport after authentication succeeds.
        if (window.OxypeWebSocket) {
            bindWebSocketMessages();
            window.OxypeWebSocket.start(auth);
        }

        // The periodic reconciliation starts with the transport, because it exists to
        // cover the frames the transport can lose. It runs from here rather than from a
        // session being opened so the sidebar previews are corrected even while no
        // conversation is.
        startCalibration();

        // Nothing is selected yet, so the transcript pane shows its prompt rather than
        // staying blank until the first conversation is opened.
        showEmptyConversationHint();

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
                // Enter sends and Shift+Enter inserts a newline, matching the usual
                // chat gesture now that the composer is multi-line. The IME guard keeps
                // Enter from sending while a candidate list is open.
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
                    && !e.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    handleSendMessage();
                }
            });

            // Grow with the content, up to a ceiling after which it scrolls.
            messageInputEl.addEventListener('input', () => autoGrowComposer());
        }

        if (messageFormatOptionsEl) {
            // One delegated listener on the group rather than one per button, so a
            // settings row that is rewritten by a future skin still works.
            messageFormatOptionsEl.addEventListener('click', (e) => {
                const option = e.target && e.target.closest ? e.target.closest('.segmented-option') : null;
                if (!option) return;
                applyMessageFormat(option.dataset.format);
            });
            // The selected option and the placeholder both derive from the stored
            // preference, so one repaint covers them.
            paintMessageFormatTrigger();
            updateComposerForFormat();

            // Neither the option state nor the placeholder can come from data-i18n, since
            // both depend on the selected format, so they are refreshed by hand.
            window.addEventListener('oxype:languageChanged', () => {
                paintMessageFormatTrigger();
                updateComposerForFormat();
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

        // Per-member management toast
        if (closeMemberManageBtnEl) {
            closeMemberManageBtnEl.addEventListener('click', closeAllDialogs);
        }
        if (mmGrantAdminBtnEl) {
            mmGrantAdminBtnEl.addEventListener('click', () => handleSetMemberAdmin(true));
        }
        if (mmRevokeAdminBtnEl) {
            mmRevokeAdminBtnEl.addEventListener('click', () => handleSetMemberAdmin(false));
        }
        if (mmRemoveBtnEl) {
            mmRemoveBtnEl.addEventListener('click', () => {
                const target = memberManageTarget;
                if (target == null) return;
                closeAllDialogs();
                handleRemoveMember(target);
            });
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

        // Style source toast controls
        if (openStyleSourcesBtnEl) {
            openStyleSourcesBtnEl.addEventListener('click', openStyleSourcesDialog);
        }

        if (closeStyleSourcesBtnEl) {
            closeStyleSourcesBtnEl.addEventListener('click', closeAllDialogs);
        }

        if (styleSourcesSaveBtnEl) {
            styleSourcesSaveBtnEl.addEventListener('click', handleSaveStyleSources);
        }

        if (styleSourcesResetBtnEl) {
            styleSourcesResetBtnEl.addEventListener('click', handleResetStyleSources);
        }

        // Style source security warning controls are bound when the dialog is built,
        // since it does not exist until a save is attempted.

        // Avatar toast controls. The visible button drives the hidden file input, which
        // is the only way to open the operating system's picker from a click.
        if (openAvatarBtnEl) {
            openAvatarBtnEl.addEventListener('click', openAvatarDialog);
        }

        if (closeAvatarBtnEl) {
            closeAvatarBtnEl.addEventListener('click', closeAllDialogs);
        }

        if (avatarChooseBtnEl && avatarFileInputEl) {
            avatarChooseBtnEl.addEventListener('click', () => avatarFileInputEl.click());
        }

        if (avatarFileInputEl) {
            avatarFileInputEl.addEventListener('change', () => {
                const file = avatarFileInputEl.files && avatarFileInputEl.files[0];
                // Cleared before use so re-picking the same file still fires `change`.
                avatarFileInputEl.value = '';
                handleAvatarFilePicked(file);
            });
        }

        if (avatarRemoveBtnEl) {
            avatarRemoveBtnEl.addEventListener('click', removeAvatar);
        }

        // Conversation avatar controls, inside the session settings toast
        if (ssAvatarChooseBtnEl && ssAvatarFileInputEl) {
            ssAvatarChooseBtnEl.addEventListener('click', () => ssAvatarFileInputEl.click());
        }

        if (ssAvatarFileInputEl) {
            ssAvatarFileInputEl.addEventListener('change', () => {
                const file = ssAvatarFileInputEl.files && ssAvatarFileInputEl.files[0];
                ssAvatarFileInputEl.value = '';
                handleSessionAvatarFilePicked(file);
            });
        }

        if (ssAvatarRemoveBtnEl) {
            ssAvatarRemoveBtnEl.addEventListener('click', removeSessionAvatar);
        }

        // Friends toast controls
        if (openFriendsBtnEl) {
            openFriendsBtnEl.addEventListener('click', openFriendsDialog);
        }

        if (closeFriendsBtnEl) {
            closeFriendsBtnEl.addEventListener('click', closeAllDialogs);
        }

        if (friendSearchBtnEl) {
            friendSearchBtnEl.addEventListener('click', handleFriendSearch);
        }

        if (friendSearchInputEl) {
            // The backend can only look an account up by its numeric id, so anything
            // that is not a digit is dropped as it is typed instead of being sent and
            // rejected. Pasting an id with stray characters therefore still works.
            friendSearchInputEl.addEventListener('input', () => {
                const digits = friendSearchInputEl.value.replace(/\D+/g, '');
                if (digits !== friendSearchInputEl.value) friendSearchInputEl.value = digits;
            });
            friendSearchInputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFriendSearch();
                }
            });
        }

        // The profile toast's close button closes only itself: it is layered over the
        // friends toast, which must still be there when the user dismisses the result.
        if (closeFriendUserBtnEl) {
            closeFriendUserBtnEl.addEventListener('click', closeFriendUserDialog);
        }

        if (friendUserAddBtnEl) {
            friendUserAddBtnEl.addEventListener('click', handleFriendAdd);
        }

        // Dialog overlay click to dismiss
        if (dialogOverlay) {
            dialogOverlay.addEventListener('click', () => {
                // The profile toast is stacked over the friends toast, so a click in the
                // dimmed area dismisses the layer it landed around rather than the whole
                // stack: the search box and the request lists stay where they were.
                if (friendUserDialogEl && friendUserDialogEl.style.display !== 'none') {
                    closeFriendUserDialog();
                    return;
                }
                closeAllDialogs();
            });
        }

        // Right-click on a message row offers reply, and edit and delete where the
        // viewer is allowed them
        if (messagesContainerEl) {
            messagesContainerEl.addEventListener('contextmenu', handleMessageContextMenu);
            // A touch screen has no right button, so holding a row raises the same menu.
            messagesContainerEl.addEventListener('touchstart', handleMessageTouchStart, { passive: true });
            messagesContainerEl.addEventListener('touchmove', handleMessageTouchMove, { passive: true });
            messagesContainerEl.addEventListener('touchend', handleMessageTouchEnd);
            messagesContainerEl.addEventListener('touchcancel', cancelReplySwipe);
            // The desktop counterpart of the touch swipe.
            messagesContainerEl.addEventListener('dblclick', handleMessageDoubleClick);
            // A quoted message is jumped back to by pressing its quotation.
            messagesContainerEl.addEventListener('click', handleReplyQuoteClick);
        }

        // A menu that outlived its right-click would act on the wrong row, so any click
        // elsewhere or a scroll closes it. The menu's own clicks are handled by its own
        // listener and stop here.
        document.addEventListener('click', (e) => {
            if (messageMenuEl && messageMenuEl.style.display !== 'none'
                && !messageMenuEl.contains(e.target)) {
                closeMessageMenu();
            }
        });
        if (messagesContainerEl) {
            messagesContainerEl.addEventListener('scroll', closeMessageMenu);
            // Reaching the top of the loaded transcript pulls in the page before it, so
            // the list keeps going instead of dead-ending.
            messagesContainerEl.addEventListener('scroll', scheduleHistoryCheck);
        }
        window.addEventListener('resize', () => {
            closeMessageMenu();
            // A drawer left open while the window grew would stay in the tree as an
            // off-canvas element covering the two-pane layout, so it is dismissed as
            // soon as the sidebar can be shown in place.
            if (window.innerWidth > 768) setSidebarOpen(false);
        });

        // The drawer button is created by this script, so it is relabelled here rather
        // than by data-i18n.
        window.addEventListener('oxype:languageChanged', labelSidebarToggle);

        // Keyboard escape key to dismiss dialogs
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // The profile toast sits on top of the friends toast, so Escape unwinds
                // the stack one layer at a time -- it dismisses the account being looked
                // at and leaves the search and the request lists underneath.
                if (friendUserDialogEl && friendUserDialogEl.style.display !== 'none') {
                    closeFriendUserDialog();
                    return;
                }
                // The open drawer is the outermost layer on a phone, so Escape unwinds
                // one layer at a time: a dialog opened from the drawer closes first and
                // leaves the drawer behind it.
                if (isDialogOpen()) {
                    closeAllDialogs();
                } else {
                    setSidebarOpen(false);
                }
            }
        });
    }

    /**
     * Build the mobile drawer controls and bind them.
     *
     * The markup is expected to hold the sidebar, but nothing else: the toggle button
     * belongs in the conversation header and the scrim has to sit next to the sidebar
     * inside the layout. Both are created here so a custom chat.html still gets a
     * working drawer instead of a sidebar that can never be reopened.
     */
    function ensureSidebarControls() {
        sidebarEl = document.getElementById('chatSidebar');
        if (!sidebarEl) return;

        const layout = sidebarEl.parentElement;
        if (!layout) return;

        sidebarToggleEl = document.getElementById('chatSidebarToggle');
        if (!sidebarToggleEl) {
            sidebarToggleEl = document.createElement('button');
            sidebarToggleEl.type = 'button';
            sidebarToggleEl.id = 'chatSidebarToggle';
            sidebarToggleEl.className = 'chat-sidebar-toggle';
            sidebarToggleEl.innerHTML =
                '<svg class="icon-svg" viewBox="0 0 24 24" width="22" height="22" fill="none"'
                + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
                + ' stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line>'
                + '<line x1="3" y1="12" x2="21" y2="12"></line>'
                + '<line x1="3" y1="18" x2="21" y2="18"></line></svg>';
            // Placed first in the header so it sits at the leading edge, before the
            // conversation title, which is where a drawer button is expected.
            const header = chatHeaderEl || document.getElementById('chatHeader');
            if (header) {
                header.insertBefore(sidebarToggleEl, header.firstChild);
            } else {
                sidebarToggleEl = null;
            }
        }

        sidebarScrimEl = document.getElementById('chatSidebarScrim');
        if (!sidebarScrimEl) {
            sidebarScrimEl = document.createElement('div');
            sidebarScrimEl.id = 'chatSidebarScrim';
            sidebarScrimEl.className = 'chat-sidebar-scrim';
            layout.insertBefore(sidebarScrimEl, sidebarEl.nextSibling);
        }

        if (sidebarToggleEl) {
            sidebarToggleEl.addEventListener('click', () => {
                setSidebarOpen(!isSidebarOpen());
            });
        }
        if (sidebarScrimEl) {
            sidebarScrimEl.addEventListener('click', () => setSidebarOpen(false));
        }

        labelSidebarToggle();
    }

    /** True while the mobile drawer is on screen. */
    function isSidebarOpen() {
        return !!sidebarEl && sidebarEl.classList.contains('is-open');
    }

    /**
     * Slides the mobile drawer in or out.
     *
     * Only the state class is tracked here: the tab order and the accessibility tree
     * follow from the `visibility` the stylesheet pairs with it, so the drawer is not
     * focusable while it is off screen. On a wide screen none of that applies and the
     * class is inert.
     */
    function setSidebarOpen(open) {
        if (!sidebarEl) return;
        sidebarEl.classList.toggle('is-open', open);
        if (sidebarScrimEl) {
            sidebarScrimEl.classList.toggle('is-visible', open);
        }
        if (sidebarToggleEl) {
            sidebarToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
    }

    /** Localized label for the drawer button, refreshed on a language change. */
    function labelSidebarToggle() {
        if (!sidebarToggleEl) return;
        const label = getI18nText('chat.sessionsTitle', 'Conversations');
        sidebarToggleEl.setAttribute('aria-label', label);
        sidebarToggleEl.setAttribute('title', label);
        sidebarToggleEl.setAttribute('aria-expanded', isSidebarOpen() ? 'true' : 'false');
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
        // Repainted on open so the row shows the format actually in force, even if the
        // account value arrived from another client while this dialog was closed.
        paintMessageFormatTrigger();
    }

    /**
     * Open the Avatar toast, which lives apart from the Settings toast.
     *
     * The avatar shown is the one the server reports, not the one this page happened to
     * boot with, so opening the toast after a change made on another device shows that
     * change.
     */
    async function openAvatarDialog() {
        closeAllDialogs();
        if (dialogOverlay) dialogOverlay.style.display = 'block';
        if (avatarDialogEl) {
            avatarDialogEl.style.display = 'block';
        }
        await loadAvatarState();
    }

    /**
     * Fetch the account's current avatar and paint it into the toast.
     *
     * A failed read is not an error the user needs to see: the toast still works, it
     * just opens with whatever the page already knew.
     */
    async function loadAvatarState() {
        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        if (!auth || !auth.userId) {
            paintAvatarPreview(currentUser && currentUser.avatarUrl, currentUser && currentUser.username);
            return;
        }
        try {
            const data = await window.OxypeCore.getAvatar(auth.userId, auth.token) || {};
            if (typeof data.avatarUrl === 'string') {
                avatarUrlCache.set(avatarCacheKey('user', auth.userId), data.avatarUrl);
            }
            if (typeof data.maxBytes === 'number' && data.maxBytes > 0) {
                avatarMaxBytes = data.maxBytes;
            }
            paintAvatarPreview(data.avatarUrl, (currentUser && currentUser.username) || '');
            // The toast is the one place where the stored bytes are worth waiting for:
            // it is opened deliberately, and showing the initial for a moment first
            // would look like the avatar had been lost.
            if (typeof data.avatarUrl === 'string' && data.avatarUrl) {
                await syncAvatar('user', auth.userId, data.avatarUrl);
                paintAvatarPreview(data.avatarUrl, (currentUser && currentUser.username) || '');
            }
        } catch (err) {
            console.warn('[Chat] Failed to load the avatar:', err && err.message);
            paintAvatarPreview(currentUser && currentUser.avatarUrl, currentUser && currentUser.username);
        }
    }

    /**
     * Draws an avatar into the toast's preview box.
     *
     * An empty URL leaves the box showing the initial of [name], which is the same
     * fallback every other avatar in the app uses.
     */
    function paintAvatarPreview(url, name) {
        if (!avatarPreviewEl) return;
        const safeName = String(name || '');
        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = (currentUser && currentUser.id) || (auth && auth.userId);
        const source = url ? avatarSource('user', userId, url) : { src: '' };
        if (source.src) {
            avatarPreviewEl.classList.add('has-image');
            avatarPreviewEl.innerHTML = `<img src="${escapeHtml(source.src)}" alt="" decoding="async">`;
        } else {
            avatarPreviewEl.classList.remove('has-image');
            avatarPreviewEl.textContent = safeName.trim().charAt(0).toUpperCase() || '?';
        }
        if (avatarHintEl) {
            const key = url ? 'chat.avatarHint' : 'chat.avatarHintNone';
            const fallback = url
                ? 'Pick an image up to {max} MB. PNG, JPEG, WebP and GIF are accepted, and it will be cropped to a square.'
                : 'No avatar yet. Pick an image up to {max} MB (PNG, JPEG, WebP or GIF).';
            avatarHintEl.textContent = getI18nText(key, fallback, { max: String(Math.round(avatarMaxBytes / (1024 * 1024))) });
        }
        if (avatarRemoveBtnEl) {
            // Nothing to remove when the account draws as an initial.
            avatarRemoveBtnEl.disabled = !url;
        }
    }

    /**
     * Reads a picked file into a data URL, then uploads it.
     *
     * The type and size are checked here before a byte is sent, so an obviously
     * unsuitable file produces an immediate message instead of a round trip. The server
     * checks again by magic bytes: the browser's idea of a file's type comes from its
     * name, which is not evidence.
     */
    function handleAvatarFilePicked(file) {
        if (!file) return;
        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (allowed.indexOf(file.type) === -1) {
            window.OxypeStyle.showToast(getI18nText('chat.avatarWrongType', 'That file is not a PNG, JPEG, WebP or GIF image.'), 'error');
            return;
        }
        if (file.size > avatarMaxBytes) {
            const max = Math.round(avatarMaxBytes / (1024 * 1024));
            window.OxypeStyle.showToast(
                getI18nText('chat.avatarTooLarge', 'That image is larger than {max} MB. Please choose a smaller one.', { max: String(max) }),
                'error'
            );
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            if (avatarPreviewEl) avatarPreviewEl.classList.add('is-uploading');
            if (avatarHintEl) avatarHintEl.textContent = getI18nText('chat.avatarHintUploading', 'Uploading…');
            try {
                await uploadAvatarData(String(reader.result || ''));
            } finally {
                if (avatarPreviewEl) avatarPreviewEl.classList.remove('is-uploading');
            }
        };
        reader.onerror = () => {
            window.OxypeStyle.showToast(getI18nText('chat.avatarReadFailed', 'That image could not be read.'), 'error');
        };
        reader.readAsDataURL(file);
    }

    /** Sends one avatar payload and repaints every surface that shows it. */
    async function uploadAvatarData(dataUrl) {
        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        if (!auth || !auth.userId) return;
        try {
            const data = await window.OxypeCore.uploadAvatar({ kind: 'user', id: auth.userId, image: dataUrl }) || {};
            applyUserAvatar(auth.userId, data.avatarUrl || '');
            paintAvatarPreview(data.avatarUrl || '', (currentUser && currentUser.username) || '');
            window.OxypeStyle.showToast(getI18nText('chat.avatarSaved', 'Avatar updated.'), 'success');
        } catch (err) {
            const reason = (err && err.message) || 'unknown error';
            window.OxypeStyle.showToast(
                getI18nText('chat.avatarFailed', 'Failed to update the avatar: {reason}', { reason }),
                'error'
            );
        }
    }

    /** Removes this account's avatar; every drawn copy falls back to its initial. */
    async function removeAvatar() {
        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        if (!auth || !auth.userId) return;
        try {
            await window.OxypeCore.removeAvatar({ kind: 'user', id: auth.userId });
            applyUserAvatar(auth.userId, '');
            paintAvatarPreview('', (currentUser && currentUser.username) || '');
            window.OxypeStyle.showToast(getI18nText('chat.avatarRemoved', 'Avatar removed.'), 'success');
        } catch (err) {
            const reason = (err && err.message) || 'unknown error';
            window.OxypeStyle.showToast(
                getI18nText('chat.avatarFailed', 'Failed to update the avatar: {reason}', { reason }),
                'error'
            );
        }
    }

    // -----------------------------------------------------------------------
    // Avatar drawing
    //
    // Every avatar in the page is the same element in two states: an initial, or a
    // picture. The rules below are the only place that decides which, so a picture
    // put on an account reaches the transcript, the roster, the session list and the
    // footer without each of them growing its own copy of the logic.
    // -----------------------------------------------------------------------

    /** Cache key for one avatar, kept apart per kind so account 7 != session 7. */
    function avatarCacheKey(kind, id) {
        return `${kind}:${id}`;
    }

    /**
     * The URL known for an avatar, or '' when it has none.
     *
     * `undefined` and `''` are deliberately different: an unknown avatar has simply
     * not been looked up, while an empty string is the server saying there is no
     * picture. Callers may fetch on a miss and must not on an empty answer.
     */
    function cachedAvatarUrl(kind, id) {
        if (id === null || id === undefined || id === '') return '';
        const key = avatarCacheKey(kind, id);
        return avatarUrlCache.has(key) ? avatarUrlCache.get(key) : undefined;
    }

    /**
     * What should actually be put in an <img> for one avatar.
     *
     * A picture kept in local storage is preferred over its URL, because it is already
     * here: drawing it costs nothing and shows instantly. The stored copy is only used
     * while it belongs to the same URL -- a replaced avatar has a new file name, so a
     * stale entry can never be painted over its replacement. When the stored entry
     * matches, the returned flag says so, and the caller skips all further work.
     */
    function avatarSource(kind, id, url) {
        const stored = window.OxypeAvatars ? window.OxypeAvatars.get(kind, id) : null;
        if (stored && stored.url === url) {
            return { src: stored.dataUrl, cached: true };
        }
        return { src: url || '', cached: false };
    }

    /** Records what the server said about one avatar and repaints its copies. */
    function applyAvatarUrl(kind, id, url) {
        if (id === null || id === undefined || id === '') return;
        avatarUrlCache.set(avatarCacheKey(kind, id), url || '');
        repaintAvatars(kind, id);
        // The bytes are brought in step afterwards, so the next paint of this page --
        // or the next page load -- has them to draw with. Nothing waits for it.
        syncAvatar(kind, id, url || '');
    }

    /** Convenience wrapper for the account case, whose repaint also touches rows. */
    function applyUserAvatar(id, url) {
        applyAvatarUrl('user', id, url);
    }

    /**
     * Brings one avatar's stored bytes in step with the file on the server.
     *
     * The hash is asked for before the picture, so an unchanged avatar costs one small
     * request instead of the image again, and a replaced one is noticed even though its
     * URL is the only thing that changed. A repaint happens only when the stored bytes
     * actually differ, so this never redraws what is already correct.
     */
    function syncAvatar(kind, id, url) {
        if (!window.OxypeAvatars || !window.OxypeCore) return Promise.resolve();
        if (id === null || id === undefined || id === '') return Promise.resolve();
        return window.OxypeAvatars.sync(kind, id, url).then(result => {
            if (result && result.changed) {
                repaintAvatars(kind, id);
            }
        }).catch(err => {
            console.warn(`[Chat] Avatar sync for ${kind}:${id} skipped:`, err && err.message);
        });
    }

    /**
     * Draws an avatar element in whichever state it should be.
     *
     * The <img> is built rather than interpolated at each call site so the markup is
     * identical everywhere, and the `has-image` class is what the stylesheets hook to
     * swap the frame's background for the picture.
     */
    function paintAvatarElement(el, kind, id, initialChar) {
        if (!el) return;
        const url = cachedAvatarUrl(kind, id);
        const source = url ? avatarSource(kind, id, url) : { src: '', cached: false };
        if (source.src) {
            el.classList.add('has-image');
            // Only rewritten when it would change: replacing identical markup on every
            // repaint would restart the image's own load for no reason.
            const img = el.firstElementChild;
            if (!img || img.tagName !== 'IMG' || img.getAttribute('src') !== source.src) {
                el.innerHTML = `<img src="${escapeHtml(source.src)}" alt="" loading="lazy" decoding="async">`;
            }
        } else {
            el.classList.remove('has-image');
            el.textContent = initialChar;
        }
    }

    /**
     * Repaints every element currently showing one account's or session's avatar.
     *
     * The elements are found by the data attribute each render site stamps, so a
     * picture uploaded in this tab updates rows that were drawn before it arrived --
     * including rows far up the transcript that were never re-rendered.
     */
    function repaintAvatars(kind, id) {
        if (cachedAvatarUrl(kind, id) === undefined) return;
        const attr = kind === 'user' ? 'data-avatar-user' : 'data-avatar-session';
        const selector = `[${attr}="${String(id).replace(/"/g, '\\"')}"]`;
        const nodes = document.querySelectorAll(selector);
        for (let i = 0; i < nodes.length; i++) {
            paintAvatarElement(nodes[i], kind, id, nodes[i].dataset.avatarInitial || '?');
        }
    }

    /**
     * Asks the server for one account's avatar, once.
     *
     * A row that names a sender this page has no picture for calls this after it is
     * drawn; the answer arrives later and repaints whatever is already on screen.
     * Only an unknown avatar is fetched -- an empty one is a real answer and is not
     * asked for again.
     */
    function requestUserAvatar(id) {
        if (id === null || id === undefined || id === '') return;
        if (cachedAvatarUrl('user', id) !== undefined) return;
        // Marked as "no picture" before the request so a transcript with hundreds of
        // rows from the same person sends one request rather than hundreds.
        avatarUrlCache.set(avatarCacheKey('user', id), '');
        if (!window.OxypeCore) return;
        window.OxypeCore.getAvatar(id).then(data => {
            if (data && typeof data.avatarUrl === 'string') {
                avatarUrlCache.set(avatarCacheKey('user', id), data.avatarUrl);
                repaintAvatars('user', id);
                syncAvatar('user', id, data.avatarUrl);
            }
        }).catch(err => {
            console.warn(`[Chat] getAvatar/${id} skipped:`, err && err.message);
        });
    }

    /** Same, for a conversation. */
    function requestSessionAvatar(id) {
        if (id === null || id === undefined || id === '') return;
        if (cachedAvatarUrl('session', id) !== undefined) return;
        avatarUrlCache.set(avatarCacheKey('session', id), '');
        if (!window.OxypeCore) return;
        const auth = window.OxypeCore.getStoredAuth();
        if (!auth || !auth.userId) return;
        // The conversation list is the only endpoint that reports session avatars in
        // bulk, so one call fills in every conversation on screen rather than one
        // request per row.
        loadSessionAvatarsFromList();
    }

    /** Fetches the joined sessions and seeds every session avatar they report. */
    let sessionAvatarSweepInFlight = false;
    function loadSessionAvatarsFromList() {
        if (sessionAvatarSweepInFlight) return;
        if (!window.OxypeCore) return;
        const auth = window.OxypeCore.getStoredAuth();
        if (!auth || !auth.userId) return;
        sessionAvatarSweepInFlight = true;
        // `getJoinedSessions` reports bare ids, so the ids have to be resolved through
        // the batch `getSessions` call -- the endpoint that also carries `avatarUrl`.
        // Asking it for every joined session at once is still one request, not one per
        // row, which is the point of the sweep.
        window.OxypeCore.getJoinedSessions(auth.userId).then(joined => {
            const ids = Array.isArray(joined) ? joined : [];
            if (ids.length === 0) return [];
            return window.OxypeCore.getSessions(ids);
        }).then(list => {
            if (!Array.isArray(list)) return;
            list.forEach(session => {
                if (!session || typeof session !== 'object') return;
                const sid = session.sessionId !== undefined ? session.sessionId : session.id;
                if (sid === undefined || sid === null) return;
                // A friend conversation reports the other person's picture, which belongs
                // to that account; caching it as the conversation's own would leave the
                // row showing a stale face after the friendship is deleted.
                if (session.isFriend) {
                    const peer = session.peerUserId;
                    if (peer !== undefined && peer !== null && typeof session.avatarUrl === 'string') {
                        avatarUrlCache.set(avatarCacheKey('user', peer), session.avatarUrl);
                        repaintAvatars('user', peer);
                        syncAvatar('user', peer, session.avatarUrl);
                    }
                    return;
                }
                if (typeof session.avatarUrl === 'string') {
                    avatarUrlCache.set(avatarCacheKey('session', sid), session.avatarUrl);
                    repaintAvatars('session', sid);
                    syncAvatar('session', sid, session.avatarUrl);
                }
            });
        }).catch(err => {
            console.warn('[Chat] Session avatar sweep skipped:', err && err.message);
        }).then(() => {
            sessionAvatarSweepInFlight = false;
        });
    }

    /**
     * Opens the conversation avatar picker, or says why it cannot be changed.
     *
     * The conversation id is captured here because the settings toast can be closed
     * while an upload is still in flight, and the upload must still address the
     * conversation it was started for.
     */
    function handleSessionAvatarFilePicked(file) {
        if (!file) return;
        if (!ssAvatarTargetSessionId) return;

        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (allowed.indexOf(file.type) === -1) {
            window.OxypeStyle.showToast(getI18nText('chat.avatarWrongType', 'That file is not a PNG, JPEG, WebP or GIF image.'), 'error');
            return;
        }
        if (file.size > avatarMaxBytes) {
            const max = Math.round(avatarMaxBytes / (1024 * 1024));
            window.OxypeStyle.showToast(
                getI18nText('chat.avatarTooLarge', 'That image is larger than {max} MB. Please choose a smaller one.', { max: String(max) }),
                'error'
            );
            return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
            const sessionId = ssAvatarTargetSessionId;
            if (ssAvatarPreviewEl) ssAvatarPreviewEl.classList.add('is-uploading');
            if (ssAvatarHintEl) ssAvatarHintEl.textContent = getI18nText('chat.avatarHintUploading', 'Uploading…');
            try {
                const data = await window.OxypeCore.uploadAvatar({
                    kind: 'session', id: sessionId, image: String(reader.result || '')
                }) || {};
                applyAvatarUrl('session', sessionId, data.avatarUrl || '');
                if (String(activeSessionId) === String(sessionId)) {
                    if (activeSessionInfo) activeSessionInfo.avatarUrl = data.avatarUrl || '';
                }
                paintSessionAvatarPreview(data.avatarUrl || '');
                window.OxypeStyle.showToast(getI18nText('chat.sessionAvatarSaved', 'Conversation avatar updated.'), 'success');
            } catch (err) {
                const reason = (err && err.message) || 'unknown error';
                window.OxypeStyle.showToast(
                    getI18nText('chat.sessionAvatarFailed', 'Failed to update the conversation avatar: {reason}', { reason }),
                    'error'
                );
            } finally {
                if (ssAvatarPreviewEl) ssAvatarPreviewEl.classList.remove('is-uploading');
            }
        };
        reader.onerror = () => {
            window.OxypeStyle.showToast(getI18nText('chat.avatarReadFailed', 'That image could not be read.'), 'error');
        };
        reader.readAsDataURL(file);
    }

    /** Removes the open conversation's avatar. */
    async function removeSessionAvatar() {
        if (!ssAvatarTargetSessionId) return;
        const sessionId = ssAvatarTargetSessionId;
        try {
            await window.OxypeCore.removeAvatar({ kind: 'session', id: sessionId });
            applyAvatarUrl('session', sessionId, '');
            if (String(activeSessionId) === String(sessionId) && activeSessionInfo) {
                activeSessionInfo.avatarUrl = '';
            }
            paintSessionAvatarPreview('');
            window.OxypeStyle.showToast(getI18nText('chat.sessionAvatarRemoved', 'Conversation avatar removed.'), 'success');
        } catch (err) {
            const reason = (err && err.message) || 'unknown error';
            window.OxypeStyle.showToast(
                getI18nText('chat.sessionAvatarFailed', 'Failed to update the conversation avatar: {reason}', { reason }),
                'error'
            );
        }
    }

    /**
     * Draws the conversation avatar inside the settings toast.
     *
     * Only an owner or admin may change it, so for everyone else the controls are
     * hidden rather than shown and refused -- the server refuses them too.
     */
    function paintSessionAvatarPreview(url) {
        const name = (activeSessionInfo && activeSessionInfo.sessionName) || '';
        if (ssAvatarPreviewEl) {
            const source = url ? avatarSource('session', ssAvatarTargetSessionId, url) : { src: '' };
            if (source.src) {
                ssAvatarPreviewEl.classList.add('has-image');
                ssAvatarPreviewEl.innerHTML = `<img src="${escapeHtml(source.src)}" alt="" decoding="async">`;
            } else {
                ssAvatarPreviewEl.classList.remove('has-image');
                ssAvatarPreviewEl.textContent = name.trim().charAt(0).toUpperCase() || '#';
            }
        }
        if (ssAvatarHintEl) {
            const key = url ? 'chat.sessionAvatarHint' : 'chat.sessionAvatarHintNone';
            const fallback = url
                ? 'Pick an image up to {max} MB. PNG, JPEG, WebP and GIF are accepted, and it will be cropped to a square.'
                : 'This conversation has no avatar yet. Pick an image up to {max} MB.';
            ssAvatarHintEl.textContent = getI18nText(key, fallback, {
                max: String(Math.round(avatarMaxBytes / (1024 * 1024)))
            });
        }
        if (ssAvatarRemoveBtnEl) ssAvatarRemoveBtnEl.disabled = !url;

        const mayEdit = Boolean(canModerate());
        if (ssAvatarChooseBtnEl) ssAvatarChooseBtnEl.style.display = mayEdit ? '' : 'none';
        if (ssAvatarRemoveBtnEl) ssAvatarRemoveBtnEl.style.display = mayEdit ? '' : 'none';
        if (ssAvatarHintEl && !mayEdit) {
            ssAvatarHintEl.textContent = getI18nText(
                'chat.sessionAvatarAdminOnly',
                'Only the conversation owner or an admin can change its avatar.'
            );
        }
    }

    /**
     * Open the Style Source toast, which lives apart from the Settings toast.
     *
     * The three sources are fetched on every open so the form shows what is stored
     * rather than what the page was booted with.
     */
    async function openStyleSourcesDialog() {
        closeAllDialogs();
        if (dialogOverlay) dialogOverlay.style.display = 'block';
        if (styleSourcesDialogEl) {
            styleSourcesDialogEl.style.display = 'block';
        }
        await loadStyleSources();
    }

    /**
     * Loads the caller's custom front-end sources into the settings form.
     *
     * The server also reports the bundled defaults, so the hint can show what an
     * empty field will resolve to without hardcoding those paths here.
     */
    async function loadStyleSources() {
        if (!styleSourceHtmlEl || !styleSourceCssEl || !styleSourceJsEl) return;
        if (!window.OxypeCore) return;

        try {
            const auth = window.OxypeCore.getStoredAuth();
            const data = await window.OxypeCore.getStyleSources(
                auth ? auth.userId : null,
                auth ? auth.token : null
            ) || {};

            styleSourceHtmlEl.value = data.chatHtmlSource || '';
            styleSourceCssEl.value = data.chatCssSource || '';
            styleSourceJsEl.value = data.chatJsSource || '';

            styleSourceDefaults = {
                html: data.defaultChatHtmlSource || '/chat.html',
                css: data.defaultChatCssSource || '/chat.css',
                js: data.defaultChatJsSource || '/chat.js'
            };
            if (typeof data.maxLength === 'number' && data.maxLength > 0) {
                styleSourceMaxLength = data.maxLength;
            }

            renderStyleSourcesHint();
        } catch (err) {
            console.warn('[Chat] Failed to load style sources:', err.message);
            if (styleSourcesHintEl) {
                styleSourcesHintEl.textContent = '';
            }
        }
    }

    /**
     * Shows what each empty field will fall back to.
     *
     * The defaults come from the server rather than being hardcoded here, so the two
     * cannot drift apart.
     */
    function renderStyleSourcesHint() {
        if (!styleSourcesHintEl) return;
        styleSourcesHintEl.textContent = '';

        const explanation = document.createElement('span');
        explanation.textContent = getI18nText(
            'chat.styleSourcesHint',
            'Point the interface at your own chat.html, chat.css or chat.js. Leave a field empty to use the built-in file. Each address must start with https:// and be at most {max} characters.',
            { max: styleSourceMaxLength }
        );
        styleSourcesHintEl.appendChild(explanation);

        const defaults = document.createElement('span');
        defaults.className = 'style-sources-defaults';
        defaults.textContent = getI18nText(
            'chat.styleSourcesDefaults',
            'Built-in: {html} · {css} · {js}',
            {
                html: styleSourceDefaults.html,
                css: styleSourceDefaults.css,
                js: styleSourceDefaults.js
            }
        );
        styleSourcesHintEl.appendChild(defaults);
    }

    /**
     * Validates one source input.
     *
     * Mirrors the server rule so an obviously bad value is caught without a round
     * trip: empty (use the bundled file), an absolute https URL, or a path on this
     * same origin.
     *
     * @returns {string|null} An error message, or null when the value is acceptable
     */
    function validateStyleSource(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed) {
            // Empty means "use the bundled default" and is always allowed.
            return null;
        }
        if (trimmed.length > styleSourceMaxLength) {
            return getI18nText('chat.styleSourceTooLong', `Each address must be at most ${styleSourceMaxLength} characters.`, { max: styleSourceMaxLength });
        }
        if (trimmed.toLowerCase().indexOf('https://') === 0) {
            // Reject a bare scheme, which points at no page at all.
            if (trimmed.length <= 'https://'.length) {
                return getI18nText('chat.styleSourceInvalidScheme', 'Each address must start with https://, or be a path on this site, or be left empty.');
            }
            return null;
        }
        if (isSameOriginPath(trimmed)) {
            return null;
        }
        return getI18nText('chat.styleSourceInvalidScheme', 'Each address must start with https://, or be a path on this site, or be left empty.');
    }

    /**
     * Reports whether a value is a safe path on this same origin.
     *
     * Kept in step with the server-side check: a protocol-relative `//host`, any
     * other scheme, and `..` are all refused because they resolve off-origin.
     *
     * @param {string} value
     * @returns {boolean}
     */
    function isSameOriginPath(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed) return false;
        if (trimmed.indexOf('//') === 0) return false;
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) return false;
        if (trimmed.indexOf('..') !== -1) return false;
        return /^[A-Za-z0-9._~/%?=&+-]+$/.test(trimmed);
    }

    /**
     * Validates the three sources and, when they are acceptable, asks the user to
     * acknowledge the risk before anything is written.
     *
     * Nothing is saved here: the validated values are held in `pendingStyleSources`
     * until the user confirms in the warning dialog.
     */
    function handleSaveStyleSources() {
        if (!window.OxypeCore) return;

        const html = styleSourceHtmlEl ? styleSourceHtmlEl.value.trim() : '';
        const css = styleSourceCssEl ? styleSourceCssEl.value.trim() : '';
        const js = styleSourceJsEl ? styleSourceJsEl.value.trim() : '';

        for (const value of [html, css, js]) {
            const problem = validateStyleSource(value);
            if (problem) {
                if (window.OxypeStyle) {
                    window.OxypeStyle.showToast(problem, 'error');
                }
                return;
            }
        }

        // Clearing every field means "go back to the bundled files", which introduces
        // no third-party code at all, so no warning is warranted for that case.
        if (!html && !css && !js) {
            persistStyleSources({ html: '', css: '', js: '' });
            return;
        }

        openStyleSourcesRiskDialog({ html: html, css: css, js: js });
    }

    /**
     * Builds the security warning dialog and appends it to the document.
     *
     * Constructed in script rather than declared in chat.html on purpose. A
     * user-supplied chat.html is exactly the case this warning exists for, and such a
     * page will not carry markup added to our own file -- a declared dialog would be
     * missing there and the save would silently do nothing. Building it guarantees the
     * warning appears whichever page performed the save.
     *
     * Only built once; the built nodes are cached in the module-level references.
     */
    function buildStyleSourcesRiskDialog() {
        if (styleSourcesRiskDialogEl) return styleSourcesRiskDialogEl;

        const dialog = document.createElement('div');
        dialog.id = 'styleSourcesRiskDialog';
        dialog.className = 'interactive-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'dialogStyleSourcesRiskTitle');
        dialog.style.display = 'none';

        // A scrim of our own rather than the page's #dialogOverlay, for the same reason
        // as the inline styles below: this warning must be self-contained so it cannot
        // be left invisible or non-modal by a stylesheet or page we do not control.
        const scrim = document.createElement('div');
        scrim.id = 'styleSourcesRiskScrim';
        scrim.style.display = 'none';
        scrim.style.position = 'fixed';
        scrim.style.inset = '0';
        scrim.style.zIndex = '1000';
        scrim.style.backgroundColor = 'rgba(0, 0, 0, 0.45)';

        // The positioning and legibility below are set inline on purpose. `.interactive-dialog`
        // is defined in the overridable chat.css, not in the never-overridable style.css,
        // so on a page carrying a custom stylesheet that omits it the dialog would fall
        // into normal document flow at the end of the body -- off-screen, which would
        // turn the "user must confirm" step into a silent no-op. Inline styles cannot be
        // lost that way, guaranteeing the warning stays visible and usable.
        dialog.style.position = 'fixed';
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.transform = 'translate(-50%, -50%)';
        dialog.style.zIndex = '1001';
        dialog.style.boxSizing = 'border-box';
        dialog.style.width = 'min(440px, calc(100vw - 32px))';
        dialog.style.maxHeight = '86vh';
        dialog.style.overflowY = 'auto';
        dialog.style.padding = '20px';
        dialog.style.backgroundColor = 'var(--bg-surface, #ffffff)';
        dialog.style.color = 'var(--text-primary, #1e293b)';
        dialog.style.border = '1px solid var(--border-color, #e2e8f0)';
        dialog.style.borderRadius = 'var(--radius-lg, 16px)';
        dialog.style.boxShadow = 'var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1))';

        // Caption bar, matching the other toasts
        const header = document.createElement('header');
        header.className = 'dialog-header';

        const title = document.createElement('h3');
        title.id = 'dialogStyleSourcesRiskTitle';
        title.className = 'dialog-title';
        title.textContent = getI18nText('chat.styleSourcesRiskTitle', 'Security Warning');

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'dialog-close-btn';
        closeBtn.id = 'closeStyleSourcesRiskBtn';
        closeBtn.setAttribute('aria-label', getI18nText('common.close', 'Close'));
        // A plain glyph rather than the inline SVG: this dialog must render on a page
        // whose markup and icon styling we do not control.
        closeBtn.textContent = '\u00d7';

        header.appendChild(title);
        header.appendChild(closeBtn);

        const body = document.createElement('div');
        body.className = 'dialog-body settings-dialog-body';

        const intro = document.createElement('p');
        intro.className = 'style-sources-risk-text';
        intro.textContent = getI18nText(
            'chat.styleSourcesRiskIntro',
            'Only use style sources that you control or fully trust. The files you point to replace this interface and are loaded into your browser.'
        );

        const jsWarning = document.createElement('p');
        jsWarning.className = 'style-sources-risk-text style-sources-risk-js';
        jsWarning.textContent = getI18nText(
            'chat.styleSourcesRiskJs',
            'An embedded chat.js runs with your login credentials. If the source is untrusted, an attacker could use it to steal your account, read your conversations, or send messages as you.'
        );

        // The exact values being trusted. Filled in per save.
        const list = document.createElement('ul');
        list.className = 'style-sources-risk-list';
        list.id = 'styleSourcesRiskList';

        const ackLabel = document.createElement('label');
        ackLabel.className = 'style-sources-risk-ack';
        ackLabel.setAttribute('for', 'styleSourcesRiskCheckbox');

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = 'styleSourcesRiskCheckbox';

        const ackText = document.createElement('span');
        ackText.textContent = getI18nText(
            'chat.styleSourcesRiskAck',
            'I have verified that these sources are trustworthy, and I accept the risk.'
        );

        ackLabel.appendChild(checkbox);
        ackLabel.appendChild(ackText);

        const actions = document.createElement('div');
        actions.className = 'dialog-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'styleSourcesRiskCancelBtn';
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = getI18nText('common.cancel', 'Cancel');

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.id = 'styleSourcesRiskConfirmBtn';
        confirmBtn.className = 'btn-danger';
        confirmBtn.disabled = true;
        confirmBtn.textContent = getI18nText('chat.styleSourcesRiskConfirmBtn', 'Confirm and Save');

        actions.appendChild(cancelBtn);
        actions.appendChild(confirmBtn);

        body.appendChild(intro);
        body.appendChild(jsWarning);
        body.appendChild(list);
        body.appendChild(ackLabel);
        body.appendChild(actions);

        dialog.appendChild(header);
        dialog.appendChild(body);
        document.body.appendChild(scrim);
        document.body.appendChild(dialog);

        // Cache the nodes and bind their behaviour now, since the dialog bypasses the
        // usual bindEvents() pass.
        styleSourcesRiskDialogEl = dialog;
        styleSourcesRiskScrimEl = scrim;
        closeStyleSourcesRiskBtnEl = closeBtn;
        styleSourcesRiskListEl = list;
        styleSourcesRiskCheckboxEl = checkbox;
        styleSourcesRiskCancelBtnEl = cancelBtn;
        styleSourcesRiskConfirmBtnEl = confirmBtn;

        closeBtn.addEventListener('click', closeStyleSourcesRiskDialog);
        cancelBtn.addEventListener('click', closeStyleSourcesRiskDialog);
        // Clicking the scrim cancels, matching the other dialogs' overlay behaviour.
        scrim.addEventListener('click', closeStyleSourcesRiskDialog);
        // The confirm button stays disabled until the box is ticked, so the warning
        // cannot be dismissed by reflex.
        checkbox.addEventListener('change', syncStyleSourcesRiskConfirmState);
        confirmBtn.addEventListener('click', handleConfirmStyleSources);

        // Keep the wording in step when the language changes while it is open.
        window.addEventListener('oxype:languageChanged', () => {
            title.textContent = getI18nText('chat.styleSourcesRiskTitle', 'Security Warning');
            intro.textContent = getI18nText('chat.styleSourcesRiskIntro', intro.textContent);
            jsWarning.textContent = getI18nText('chat.styleSourcesRiskJs', jsWarning.textContent);
            ackText.textContent = getI18nText('chat.styleSourcesRiskAck', ackText.textContent);
            cancelBtn.textContent = getI18nText('common.cancel', 'Cancel');
            confirmBtn.textContent = getI18nText('chat.styleSourcesRiskConfirmBtn', 'Confirm and Save');
            closeBtn.setAttribute('aria-label', getI18nText('common.close', 'Close'));
        });

        return dialog;
    }

    /**
     * Shows the security warning for the values about to be trusted.
     *
     * The style source form is hidden meanwhile so only one decision is on screen; it
     * is restored if the user cancels, with the typed values untouched.
     *
     * @param {{html: string, css: string, js: string}} sources - Already-validated values
     */
    function openStyleSourcesRiskDialog(sources) {
        pendingStyleSources = sources;

        // Built lazily so the markup exists even on a page we did not author.
        buildStyleSourcesRiskDialog();

        if (styleSourcesDialogEl) styleSourcesDialogEl.style.display = 'none';
        if (styleSourcesRiskScrimEl) styleSourcesRiskScrimEl.style.display = 'block';
        if (dialogOverlay) dialogOverlay.style.display = 'none';

        renderStyleSourcesRiskList(sources);

        // A fresh acknowledgement is required for every save, so that accepting the
        // risk once cannot silently carry over to a later, different source.
        if (styleSourcesRiskCheckboxEl) styleSourcesRiskCheckboxEl.checked = false;
        syncStyleSourcesRiskConfirmState();

        if (styleSourcesRiskDialogEl) {
            styleSourcesRiskDialogEl.style.display = 'block';
            // Focus the safest control rather than the destructive one.
            if (styleSourcesRiskCancelBtnEl) {
                setTimeout(() => styleSourcesRiskCancelBtnEl.focus(), 50);
            }
        }
    }

    /**
     * Lists the exact values being trusted, so the user sees the real targets rather
     * than a summary that could conceal one of them.
     *
     * @param {{html: string, css: string, js: string}} sources
     */
    function renderStyleSourcesRiskList(sources) {
        if (!styleSourcesRiskListEl) return;
        styleSourcesRiskListEl.textContent = '';

        const entries = [
            { label: 'chat.html', value: sources.html, key: 'html' },
            { label: 'chat.css', value: sources.css, key: 'css' },
            { label: 'chat.js', value: sources.js, key: 'js' }
        ];

        for (const entry of entries) {
            if (!entry.value) continue;

            const item = document.createElement('li');

            const field = document.createElement('span');
            field.className = 'style-sources-risk-field';
            field.textContent = entry.label;

            const value = document.createElement('span');
            value.className = 'style-sources-risk-value';
            // textContent, not innerHTML: the value is user input and must never be
            // parsed as markup inside our own trusted dialog.
            value.textContent = entry.value;

            item.appendChild(field);
            item.appendChild(value);
            styleSourcesRiskListEl.appendChild(item);
        }
    }

    /** Keeps the confirm button disabled until the risk has been acknowledged. */
    function syncStyleSourcesRiskConfirmState() {
        if (!styleSourcesRiskConfirmBtnEl) return;
        const acknowledged = !!(styleSourcesRiskCheckboxEl && styleSourcesRiskCheckboxEl.checked);
        styleSourcesRiskConfirmBtnEl.disabled = !acknowledged;

        // Applied inline as well as in chat.css: the disabled look is the main signal
        // that the checkbox must be ticked, and a custom stylesheet may not define the
        // rule that dims it.
        styleSourcesRiskConfirmBtnEl.style.opacity = acknowledged ? '' : '0.55';
        styleSourcesRiskConfirmBtnEl.style.cursor = acknowledged ? '' : 'not-allowed';
    }

    /**
     * Dismisses the warning without saving and returns to the form, whose contents
     * were never touched, so the user can correct a value instead of retyping it.
     */
    function closeStyleSourcesRiskDialog() {
        if (styleSourcesRiskDialogEl) styleSourcesRiskDialogEl.style.display = 'none';
        if (styleSourcesRiskScrimEl) styleSourcesRiskScrimEl.style.display = 'none';
        if (styleSourcesRiskCheckboxEl) styleSourcesRiskCheckboxEl.checked = false;
        syncStyleSourcesRiskConfirmState();

        const hadPending = !!pendingStyleSources;
        pendingStyleSources = null;

        // Only restore the form if the warning was reached from it. Closing via the
        // overlay from somewhere else must not pop the form open.
        if (hadPending && styleSourcesDialogEl) {
            styleSourcesDialogEl.style.display = 'block';
            if (dialogOverlay) dialogOverlay.style.display = 'block';
        }
    }

    /** Saves the acknowledged sources, then reloads so they take effect. */
    async function handleConfirmStyleSources() {
        // Guard as well as disable: a disabled attribute is a UI affordance, not a
        // security boundary, so the state is re-checked before acting on it.
        if (!styleSourcesRiskCheckboxEl || !styleSourcesRiskCheckboxEl.checked) return;
        if (!pendingStyleSources) return;

        const sources = pendingStyleSources;
        pendingStyleSources = null;

        if (styleSourcesRiskDialogEl) styleSourcesRiskDialogEl.style.display = 'none';
        if (styleSourcesRiskScrimEl) styleSourcesRiskScrimEl.style.display = 'none';
        await persistStyleSources(sources);
    }

    /**
     * Validates and saves the three style sources, then reloads so they apply.
     *
     * @param {{html: string, css: string, js: string}} sources - Already-validated values
     */
    async function persistStyleSources(sources) {
        if (!window.OxypeCore) return;

        const auth = window.OxypeCore.getStoredAuth();

        if (styleSourcesSaveBtnEl) styleSourcesSaveBtnEl.disabled = true;
        if (styleSourcesRiskConfirmBtnEl) styleSourcesRiskConfirmBtnEl.disabled = true;
        try {
            await window.OxypeCore.updateStyleSources(
                {
                    chatHtmlSource: sources.html,
                    chatCssSource: sources.css,
                    chatJsSource: sources.js
                },
                auth ? auth.userId : null,
                auth ? auth.token : null
            );

            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.styleSourcesSaved', 'Style sources updated.'), 'success');
            }

            // A reload is the only way the new sources can take effect, since the
            // page's stylesheet and script were chosen during bootstrap.
            setTimeout(() => window.location.reload(), 700);
        } catch (err) {
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(
                    getI18nText('chat.styleSourcesSaveFailed', `Failed to save: ${reason}`, { reason: reason }),
                    'error'
                );
            }
            // The save failed, so the acknowledged values are no longer pending.
            // Re-arm the checkbox rather than leaving a stale acknowledgement around.
            if (styleSourcesRiskCheckboxEl) styleSourcesRiskCheckboxEl.checked = false;
        } finally {
            if (styleSourcesSaveBtnEl) styleSourcesSaveBtnEl.disabled = false;
            syncStyleSourcesRiskConfirmState();
        }
    }

    /** Clears all three inputs locally; saving then stores the defaults. */
    function handleResetStyleSources() {
        if (styleSourceHtmlEl) styleSourceHtmlEl.value = '';
        if (styleSourceCssEl) styleSourceCssEl.value = '';
        if (styleSourceJsEl) styleSourceJsEl.value = '';
        renderStyleSourcesHint();
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
     * True while any toast dialog is on screen.
     *
     * Escape has to unwind one layer at a time: closing everything at once would also
     * dismiss the mobile drawer underneath a dialog that was opened from it.
     */
    function isDialogOpen() {
        const dialogs = [
            sessionOptionsDialog, sessionSettingsDialog, membersDialog, manageDialog,
            memberManageDialog, settingsDialog, styleSourcesDialogEl, styleSourcesRiskDialogEl,
            avatarDialogEl, friendsDialogEl, friendUserDialogEl
        ];
        return dialogs.some((dialog) => dialog && dialog.style.display !== 'none');
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
        if (memberManageDialog) memberManageDialog.style.display = 'none';
        // Closing abandons the pending per-member action, so a stale target can never
        // be acted on by a later click.
        memberManageTarget = null;
        if (settingsDialog) settingsDialog.style.display = 'none';
        if (styleSourcesDialogEl) styleSourcesDialogEl.style.display = 'none';
        if (styleSourcesRiskDialogEl) styleSourcesRiskDialogEl.style.display = 'none';
        if (styleSourcesRiskScrimEl) styleSourcesRiskScrimEl.style.display = 'none';
        if (avatarDialogEl) avatarDialogEl.style.display = 'none';
        if (friendsDialogEl) friendsDialogEl.style.display = 'none';
        if (friendUserDialogEl) friendUserDialogEl.style.display = 'none';
        // Closing abandons the account the profile toast was showing, so a later click
        // on Add cannot act on somebody the user is no longer looking at.
        friendUserTarget = null;
        // Closing abandons any pending conversation-avatar upload, so a later pick
        // cannot be applied to a conversation the user is no longer looking at.
        ssAvatarTargetSessionId = null;

        // Escape or an overlay click abandons a pending acknowledgement, so the
        // confirmed values must not survive to be saved by a later click.
        pendingStyleSources = null;
        if (styleSourcesRiskCheckboxEl) styleSourcesRiskCheckboxEl.checked = false;
        syncStyleSourcesRiskConfirmState();

        // Escape and overlay clicks are also what dismisses the message menu, so the
        // editor it may have opened goes with it rather than being left orphaned.
        closeMessageMenu();
        if (editingRow) endMessageEdit(editingRow);
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
            // The info payload carries the conversation's avatar, so the settings toast
            // and the session list are seeded from it before anything is drawn.
            if (activeSessionInfo && typeof activeSessionInfo.avatarUrl === 'string') {
                avatarUrlCache.set(avatarCacheKey('session', activeSessionId), activeSessionInfo.avatarUrl);
            }
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
        // A friend conversation is just the two of you: it has no name of its own, no
        // owner, no roster, no invites and no picture of its own -- it wears the other
        // person's. Everything that only makes sense for a group is hidden here, and
        // the leave row becomes the way to end the friendship.
        const isFriend = Boolean(info.isFriend);

        if (ssSessionNameEl) ssSessionNameEl.textContent = info.sessionName || '-';
        if (ssSessionDescEl) ssSessionDescEl.textContent = info.description || getI18nText('chat.noDescription', 'No description');
        if (ssSessionOwnerEl) {
            const ownerId = info.owner;
            ssSessionOwnerEl.textContent = ownerId ? `#${ownerId}` : '-';
            if (ownerId) {
                window.OxypeCore.getUser(ownerId)
                    .then(user => {
                        if (ssSessionOwnerEl && String((activeSessionInfo || {}).owner) === String(ownerId)
                            && user && user.username) {
                            ssSessionOwnerEl.textContent = user.username;
                        }
                    })
                    .catch(() => {
                        // Keep the owner id visible when the profile request fails.
                    });
            }
        }

        // Management lives in its own toast, reachable through this entry button.
        if (openManageBtnEl) openManageBtnEl.style.display = (!isFriend && (isOwner || isAdmin)) ? 'inline-flex' : 'none';
        // Invite UUID management is owner or admin only.
        if (ssInviteSectionEl) ssInviteSectionEl.style.display = (!isFriend && (isOwner || isAdmin)) ? 'block' : 'none';

        // A friend conversation has none of the group's identity fields, so the rows
        // and the entry points to the roster/management toasts go away entirely. Only
        // the conversation id is left, which is what the remaining rows can honestly
        // report.
        if (ssNameRowEl) ssNameRowEl.style.display = isFriend ? 'none' : 'flex';
        if (ssOwnerRowEl) ssOwnerRowEl.style.display = isFriend ? 'none' : 'flex';
        if (ssAvatarSectionEl) ssAvatarSectionEl.style.display = isFriend ? 'none' : 'block';
        if (ssNavSectionEl) ssNavSectionEl.style.display = isFriend ? 'none' : 'block';

        // Leaving a group keeps you reachable; deleting a friend does not, and this row
        // is the only way to do it, so it is relabelled rather than duplicated.
        const leaveLabel = isFriend
            ? getI18nText('chat.friendDeleteBtn', 'Delete Friend')
            : getI18nText('chat.leaveSessionBtn', 'Leave Conversation');
        if (ssLeaveLabelEl) ssLeaveLabelEl.textContent = leaveLabel;
        if (ssLeaveBtnLabelEl) ssLeaveBtnLabelEl.textContent = leaveLabel;

        if (ssNameInputEl) ssNameInputEl.value = info.sessionName || '';
        if (ssDescInputEl) ssDescInputEl.value = info.description || '';

        // The conversation avatar lives in this toast too, so the target id is set here
        // as well rather than only on open: an upload must address the conversation the
        // toast is currently showing even if it was opened by another route. A friend
        // conversation has no picture of its own to change, so it is left unset.
        ssAvatarTargetSessionId = isFriend ? null : activeSessionId;
        if (isFriend) return;

        const knownSessionAvatar = cachedAvatarUrl('session', activeSessionId);
        if (knownSessionAvatar === undefined) {
            requestSessionAvatar(activeSessionId);
        } else {
            syncAvatar('session', activeSessionId, knownSessionAvatar);
        }
        paintSessionAvatarPreview(knownSessionAvatar || '');
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
            const memberAvatarChar = name.trim().charAt(0).toUpperCase() || '#';
            row.innerHTML = `
                <div class="member-avatar" data-avatar-user="${escapeHtml(memberId)}" data-avatar-initial="${escapeHtml(memberAvatarChar)}">${escapeHtml(memberAvatarChar)}</div>
                <div class="member-meta">
                    <div class="member-name">${escapeHtml(name)}</div>
                    <div class="member-role">${escapeHtml(role)}</div>
                </div>
            `;

            const knownMemberAvatar = cachedAvatarUrl('user', memberId);
            if (knownMemberAvatar === undefined) {
                requestUserAvatar(memberId);
            } else {
                paintAvatarElement(row.querySelector('.member-avatar'), 'user', memberId, memberAvatarChar);
            }

            // Owner and admins may manage members, but non-admin users cannot.
            // Owner can manage anyone except themselves; admin can only manage non-owner, non-admin members.
            const canManage = (isOwner && !isSelf) || (isAdmin && !memberIsOwner && !memberIsAdmin && !isSelf);
            if (canManage) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'member-manage-btn';
                btn.textContent = getI18nText('chat.manageMemberBtn', 'Manage');
                btn.addEventListener('click', () => openMemberManageDialog(u, { isOwner, isAdmin, memberIsOwner, memberIsAdmin }));
                row.appendChild(btn);
            }

            ssMemberListEl.appendChild(row);
        });
    }

    /**
     * Opens the per-member management toast.
     * Owner can grant/revoke admin rights or remove; admin can only remove ("admin只能移除").
     */
    function openMemberManageDialog(targetUser, perms) {
        if (!targetUser) return;
        closeAllDialogs();

        memberManageTarget = {
            user: targetUser,
            perms: perms
        };

        const name = targetUser.username || `User #${targetUser.userid}`;
        if (mmMemberNameEl) mmMemberNameEl.textContent = name;

        let roleText = '';
        if (perms.memberIsOwner) {
            roleText = getI18nText('chat.memberOwner', 'Owner');
        } else if (perms.memberIsAdmin) {
            roleText = getI18nText('chat.memberAdmin', 'Admin');
        }
        if (mmMemberRoleEl) mmMemberRoleEl.textContent = roleText || '-';

        // Owner can promote/demote admin; admin cannot promote/demote ("admin只能移除")
        if (perms.isOwner && !perms.memberIsOwner) {
            if (perms.memberIsAdmin) {
                if (mmGrantAdminBtnEl) mmGrantAdminBtnEl.style.display = 'none';
                if (mmRevokeAdminBtnEl) mmRevokeAdminBtnEl.style.display = 'inline-flex';
            } else {
                if (mmGrantAdminBtnEl) mmGrantAdminBtnEl.style.display = 'inline-flex';
                if (mmRevokeAdminBtnEl) mmRevokeAdminBtnEl.style.display = 'none';
            }
        } else {
            if (mmGrantAdminBtnEl) mmGrantAdminBtnEl.style.display = 'none';
            if (mmRevokeAdminBtnEl) mmRevokeAdminBtnEl.style.display = 'none';
        }

        // Both owner and admin can remove (subject to permission rules)
        const canRemove = perms.isOwner || (perms.isAdmin && !perms.memberIsAdmin && !perms.memberIsOwner);
        if (mmRemoveBtnEl) mmRemoveBtnEl.style.display = canRemove ? 'inline-flex' : 'none';

        if (dialogOverlay) dialogOverlay.style.display = 'block';
        if (memberManageDialog) memberManageDialog.style.display = 'block';
    }

    /** Promotes or demotes a member to/from session administrator (owner only). */
    async function handleSetMemberAdmin(makeAdmin) {
        if (!memberManageTarget || !memberManageTarget.user) return;
        const targetUserId = memberManageTarget.user.userid;
        const confirmMsg = makeAdmin
            ? getI18nText('chat.memberGrantAdminConfirm', 'Promote this member to administrator?')
            : getI18nText('chat.memberRevokeAdminConfirm', 'Revoke administrator rights for this member?');

        if (!window.confirm(confirmMsg)) return;

        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);

        try {
            await window.OxypeCore.setSessionAdmin(activeSessionId, targetUserId, makeAdmin, userId, auth ? auth.token : null);
            closeAllDialogs();
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(makeAdmin
                    ? getI18nText('chat.memberGrantAdminSuccess', 'Member promoted to administrator.')
                    : getI18nText('chat.memberRevokeAdminSuccess', 'Administrator rights revoked.'),
                    'success'
                );
            }
            await loadSessionSettings();
            await openMembersDialog();
        } catch (err) {
            console.error('[Chat] Set member admin failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
            }
        }
    }

    /** Renders the invite UUID list (owner or admin). */
    async function loadSessionInvites() {
        if (!ssInviteListEl) return;

        const info = activeSessionInfo || {};
        if (!info.isOwner && !info.isAdmin) {
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

                const details = document.createElement('div');
                details.className = 'invite-details';

                const code = document.createElement('span');
                code.className = 'invite-code';
                code.textContent = uuid;
                details.appendChild(code);

                const time = document.createElement('span');
                time.className = 'invite-time';
                time.textContent = formatInviteUuidTime(uuid);
                details.appendChild(time);

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

                row.appendChild(details);
                row.appendChild(copyBtn);
                row.appendChild(revokeBtn);
                ssInviteListEl.appendChild(row);
            });
        }
    }

    /** Formats the UUID v7 Unix-millisecond timestamp as yyyy:mm:dd:HH:mm:ss. */
    function formatInviteUuidTime(uuid) {
        const hex = String(uuid || '').replace(/[^0-9a-f]/gi, '');
        if (hex.length < 12 || hex.charAt(12).toLowerCase() !== '7') return '';
        const milliseconds = parseInt(hex.slice(0, 12), 16);
        if (!Number.isFinite(milliseconds)) return '';
        const date = new Date(milliseconds);
        if (Number.isNaN(date.getTime())) return '';
        const pad = value => String(value).padStart(2, '0');
        return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())}:${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    /** Copies an invite UUID to the clipboard, including insecure-context fallback. */
    function copyInviteUuid(uuid) {
        const cleanUuid = String(uuid || '').replace(/^"|"$/g, '').trim();
        const done = () => {
            if (window.OxypeStyle) window.OxypeStyle.showToast(getI18nText('chat.copied', 'Copied to clipboard'), 'success');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cleanUuid).then(done).catch(() => copyInviteUuidFallback(cleanUuid, done));
        } else copyInviteUuidFallback(cleanUuid, done);
    }

    function copyInviteUuidFallback(text, done) {
        const input = document.createElement('textarea');
        input.value = text;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.focus();
        input.select();
        try { if (document.execCommand('copy')) done(); } finally { input.remove(); }
    }

    /** Saves the conversation name/description (owner or admin). */
    async function handleSaveSessionChanges(e) {
        e.preventDefault();

        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);
        const info = activeSessionInfo || {};
        if (!activeSessionId || (!info.isOwner && !info.isAdmin) || (ssSaveBtnEl && ssSaveBtnEl.disabled)) return;
        const sessionKey = String(activeSessionId);
        const changes = { name: ssNameInputEl ? ssNameInputEl.value.trim() : '' };
        if (!changes.name) {
            if (window.OxypeStyle) window.OxypeStyle.showToast(getI18nText('chat.createSessionErrEmpty', 'Please enter a conversation name.'), 'warning');
            if (ssNameInputEl) ssNameInputEl.focus();
            return;
        }
        if (ssDescInputEl) {
            changes.description = ssDescInputEl.value.trim();
        }

        if (ssSaveBtnEl) ssSaveBtnEl.disabled = true;
        try {
            const updated = await window.OxypeCore.updateSession(activeSessionId, changes, userId, auth ? auth.token : null);
            activeSessionInfo = updated || activeSessionInfo;
            const sessionKey = String(activeSessionId);
            const cached = sessionsMap.get(sessionKey) || { sessionId: activeSessionId };
            cached.sessionName = activeSessionInfo.sessionName || changes.name;
            cached.description = activeSessionInfo.description || changes.description || '';
            sessionsMap.set(sessionKey, cached);
            const sessionItem = sessionListEl ? sessionListEl.querySelector(`[data-session-id="${sessionKey}"]`) : null;
            if (sessionItem) {
                const nameEl = sessionItem.querySelector('.session-name');
                const avatarEl = sessionItem.querySelector('.session-avatar');
                const sessionName = cached.sessionName || `Session #${activeSessionId}`;
                if (nameEl) nameEl.textContent = sessionName;
                if (avatarEl) {
                    // A rename changes the fallback letter but must not discard the
                    // picture, so the avatar is repainted through the shared rule.
                    const initial = sessionName.trim().charAt(0).toUpperCase() || '#';
                    avatarEl.dataset.avatarInitial = initial;
                    paintAvatarElement(avatarEl, 'session', sessionKey, initial);
                }
            }
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

    /**
     * Ends the active conversation: leaves a group, or deletes a friend.
     *
     * Both cases go through the same endpoint -- the server decides from the session
     * record whether this is a departure or the end of a friendship -- so the wording
     * is the only thing that changes here.
     */
    async function handleLeaveSession() {
        // Read before the request, because the record is gone by the time it returns.
        const isFriend = Boolean((activeSessionInfo || {}).isFriend);

        const confirmText = isFriend
            ? getI18nText('chat.deleteFriendConfirm', 'Delete this friend? The conversation is removed for both of you.')
            : getI18nText('chat.leaveConfirm', 'Leave this conversation?');
        if (!window.confirm(confirmText)) {
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

            // No conversation is open, so there is nothing for the transcript half of the
            // cycle to reconcile; a pass still in flight for the conversation that was
            // just left must not paint into the emptied pane.
            stopCalibration();
            startCalibration();

            const remaining = sessionListEl ? sessionListEl.querySelectorAll('.session-item').length : 0;
            if (remaining === 0 && emptySessionsPlaceholder) {
                emptySessionsPlaceholder.style.display = 'flex';
            }

            if (window.OxypeStyle) {
                const doneText = isFriend
                    ? getI18nText('chat.deleteFriendSuccess', 'Friend deleted.')
                    : getI18nText('chat.leaveSuccess', 'You left the conversation.');
                window.OxypeStyle.showToast(doneText, 'success');
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
     * Shows the friends toast: the id search box and the two pending-request lists.
     *
     * The lists are re-read on every open rather than cached, because a request can
     * arrive or be answered from another client and a stale panel would offer to
     * accept something already accepted.
     */
    async function openFriendsDialog() {
        if (!friendsDialogEl) return;

        closeAllDialogs();
        if (friendSearchHintEl) friendSearchHintEl.textContent = '';
        if (friendSearchInputEl) friendSearchInputEl.value = '';
        // Empty the lists before the request goes out, so a slow answer never shows
        // the previous visit's rows under the new visit's heading.
        renderFriendRequests({ incoming: [], outgoing: [] }, { pending: true });

        if (dialogOverlay) dialogOverlay.style.display = 'block';
        friendsDialogEl.style.display = 'block';

        await loadFriendRequests();
    }

    /**
     * Re-reads the pending friend requests and paints them.
     *
     * Only requests are fetched here, not the friend list: the sidebar already renders
     * the conversations a friendship creates, so a separate friend list would be a
     * second, differently-styled view of the same people.
     */
    async function loadFriendRequests() {
        if (!window.OxypeCore) return;
        const auth = window.OxypeCore.getStoredAuth();
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);

        let payload;
        try {
            payload = await window.OxypeCore.getFriendRequests(userId, auth ? auth.token : null);
        } catch (err) {
            console.warn('[Chat] Failed to load friend requests:', err.message);
            renderFriendRequests({ incoming: [], outgoing: [] });
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(
                    getI18nText('chat.loadFailed', `Failed to load: ${reason}`, { reason: reason }),
                    'error'
                );
            }
            return;
        }

        renderFriendRequests(payload || {});
    }

    /**
     * Paints both request lists.
     *
     * @param {{incoming?: Array<object>, outgoing?: Array<object>}} payload
     * @param {{pending?: boolean}} [options] `pending` suppresses the empty-state text
     *        while the request is still out, so "no requests" is never claimed early.
     */
    function renderFriendRequests(payload, options) {
        const pending = Boolean(options && options.pending);
        const incoming = (payload && Array.isArray(payload.incoming)) ? payload.incoming : [];
        const outgoing = (payload && Array.isArray(payload.outgoing)) ? payload.outgoing : [];

        renderFriendRequestList(friendIncomingListEl, friendIncomingEmptyEl, incoming, 'incoming', pending);
        renderFriendRequestList(friendOutgoingListEl, friendOutgoingEmptyEl, outgoing, 'outgoing', pending);
    }

    /**
     * Draws one request list: incoming rows offer accept/decline, outgoing rows a
     * withdraw. Both directions are the same shape otherwise, which is why they share
     * this function instead of each having its own.
     *
     * @param {HTMLElement|null} listEl
     * @param {HTMLElement|null} emptyEl
     * @param {Array<object>} rows
     * @param {'incoming'|'outgoing'} direction
     * @param {boolean} pending
     */
    function renderFriendRequestList(listEl, emptyEl, rows, direction, pending) {
        if (!listEl) return;
        listEl.innerHTML = '';

        if (rows.length === 0) {
            if (emptyEl) emptyEl.style.display = pending ? 'none' : 'block';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        rows.forEach(entry => {
            if (!entry) return;
            const otherId = entry.userid !== undefined ? entry.userid : entry.userId;
            if (otherId === undefined || otherId === null) return;
            const name = entry.username || `User #${otherId}`;
            const initial = name.trim().charAt(0).toUpperCase() || '#';

            const row = document.createElement('li');
            row.className = 'friend-request-item';
            row.dataset.friendUserId = String(otherId);
            row.innerHTML = `
                <div class="friend-request-avatar" data-avatar-user="${escapeHtml(otherId)}" data-avatar-initial="${escapeHtml(initial)}">${escapeHtml(initial)}</div>
                <div class="friend-request-meta">
                    <div class="friend-request-name">${escapeHtml(name)}</div>
                    <div class="friend-request-id">ID: ${escapeHtml(otherId)}</div>
                </div>
                <div class="friend-request-actions"></div>
            `;

            // The payload already carries each account's picture, so the row is drawn
            // from it directly instead of asking per person.
            if (typeof entry.avatarUrl === 'string') {
                avatarUrlCache.set(avatarCacheKey('user', otherId), entry.avatarUrl);
                paintAvatarElement(row.querySelector('.friend-request-avatar'), 'user', otherId, initial);
            } else {
                requestUserAvatar(otherId);
            }

            const actions = row.querySelector('.friend-request-actions');
            if (direction === 'incoming') {
                actions.appendChild(buildFriendRowButton(
                    getI18nText('chat.friendAcceptBtn', 'Accept'),
                    'btn-primary',
                    () => handleFriendRequestAnswer(otherId, true)
                ));
                actions.appendChild(buildFriendRowButton(
                    getI18nText('chat.friendDeclineBtn', 'Decline'),
                    'btn-secondary',
                    () => handleFriendRequestAnswer(otherId, false)
                ));
            } else {
                actions.appendChild(buildFriendRowButton(
                    getI18nText('chat.friendWithdrawBtn', 'Withdraw'),
                    'btn-secondary',
                    () => handleFriendRequestAnswer(otherId, false)
                ));
            }

            listEl.appendChild(row);
        });
    }

    /** One small button for a request row. */
    function buildFriendRowButton(label, modifier, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn-sm ${modifier} friend-request-btn`;
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        return btn;
    }

    /**
     * Accepts or withdraws/declines one request.
     *
     * A failed attempt leaves the row in place: the request is still pending on the
     * server, so removing it would tell the user something that is not true.
     *
     * @param {string|number} otherId
     * @param {boolean} accept
     */
    async function handleFriendRequestAnswer(otherId, accept) {
        if (!window.OxypeCore) return;
        const auth = window.OxypeCore.getStoredAuth();
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);
        const token = auth ? auth.token : null;

        try {
            if (accept) {
                const result = await window.OxypeCore.acceptFriendRequest(otherId, userId, token);
                await loadFriendRequests();
                // Acceptance creates the one-to-one conversation, so the sidebar has to
                // be told about it: the row is added here rather than waiting for a
                // reload, and the conversation opens straight away.
                const sessionId = result && (result.sessionId !== undefined ? result.sessionId : result.session_id);
                closeAllDialogs();
                if (sessionId !== undefined && sessionId !== null) {
                    addFriendSessionToList(sessionId, otherId, getUserNameById(otherId));
                    await selectSession(sessionId);
                } else {
                    await reloadSessionsFromServer();
                }
                if (window.OxypeStyle) {
                    window.OxypeStyle.showToast(
                        getI18nText('chat.friendAccepted', 'Friend request accepted.'),
                        'success'
                    );
                }
            } else {
                await window.OxypeCore.declineFriendRequest(otherId, userId, token);
                await loadFriendRequests();
                if (window.OxypeStyle) {
                    window.OxypeStyle.showToast(
                        getI18nText('chat.friendDeclined', 'Friend request removed.'),
                        'success'
                    );
                }
            }
        } catch (err) {
            console.error('[Chat] Friend request answer failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(
                    getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }),
                    'error'
                );
            }
        }
    }

    /**
     * Looks an account up by id and shows it in the profile toast.
     *
     * An id nobody owns is answered with a line under the search box rather than a
     * toast of its own: the user is mid-search and a second dialog to dismiss would
     * only get in the way.
     */
    async function handleFriendSearch() {
        if (!friendSearchInputEl || !window.OxypeCore) return;

        const raw = friendSearchInputEl.value.replace(/\D+/g, '');
        if (raw.length === 0) {
            if (friendSearchHintEl) {
                friendSearchHintEl.textContent = getI18nText('chat.friendSearchEmpty', 'Enter a numeric user ID.');
            }
            return;
        }

        // A stale answer must not overwrite a newer one when two searches overlap.
        friendSearchSeq += 1;
        const seq = friendSearchSeq;
        if (friendSearchHintEl) friendSearchHintEl.textContent = '';

        const auth = window.OxypeCore.getStoredAuth();
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);
        const token = auth ? auth.token : null;

        try {
            const result = await window.OxypeCore.findUser(raw, userId, token);
            if (seq !== friendSearchSeq) return;

            if (!result || !result.found) {
                // A refusal also covers looking up yourself, which the server reports
                // as "not found" because there is nothing to befriend.
                if (friendSearchHintEl) {
                    friendSearchHintEl.textContent = String(raw) === String(userId)
                        ? getI18nText('chat.friendSearchSelf', 'That is your own ID.')
                        : getI18nText('chat.friendSearchNotFound', 'No account with that ID.');
                }
                return;
            }

            openFriendUserDialog({
                userid: result.userid,
                username: result.username,
                avatarUrl: result.avatarUrl,
                isFriend: Boolean(result.isFriend),
                requestPending: Boolean(result.requestPending),
                requestIncoming: Boolean(result.requestIncoming)
            });
        } catch (err) {
            if (seq !== friendSearchSeq) return;
            console.warn('[Chat] Friend lookup failed:', err.message);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (friendSearchHintEl) {
                friendSearchHintEl.textContent = getI18nText('chat.friendSearchFailed', `Search failed: ${reason}`, { reason: reason });
            }
        }
    }

    /**
     * Shows the found account, with its picture on top and a button whose meaning
     * follows the relationship: add, accept, or nothing to do.
     *
     * @param {{userid: *, username?: string, avatarUrl?: string, isFriend?: boolean, requestPending?: boolean, requestIncoming?: boolean}} user
     */
    function openFriendUserDialog(user) {
        if (!friendUserDialogEl || !user) return;

        friendUserTarget = {
            userid: user.userid,
            username: user.username || `User #${user.userid}`,
            avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : ''
        };

        const name = friendUserTarget.username;
        if (friendUserNameEl) friendUserNameEl.textContent = name;
        if (friendUserIdEl) friendUserIdEl.textContent = `ID: ${user.userid}`;

        if (friendUserAvatarEl) {
            const initial = name.trim().charAt(0).toUpperCase() || '#';
            friendUserAvatarEl.dataset.avatarUser = String(user.userid);
            friendUserAvatarEl.dataset.avatarInitial = initial;
            // The search result already carries this account's picture, and an empty
            // one is a real answer rather than a missing one. Caching the answer even
            // when it is empty is what stops a second request for it: `getAvatar` is
            // only open to accounts you share a conversation with, so asking here
            // would fail for exactly the strangers this dialog exists to find.
            if (typeof user.avatarUrl === 'string') {
                avatarUrlCache.set(avatarCacheKey('user', user.userid), user.avatarUrl);
            }
            paintAvatarElement(friendUserAvatarEl, 'user', user.userid, initial);
        }

        // The button says what clicking it will do, and is withdrawn when there is
        // nothing left to do -- an existing friend has no pending action here.
        let label = '';
        let disabled = false;
        let status = '';
        if (user.isFriend) {
            label = getI18nText('chat.friendAlreadyFriend', 'Already friends');
            disabled = true;
            status = getI18nText('chat.friendStatusFriend', 'You are friends.');
        } else if (user.requestIncoming) {
            // They asked first, so this button accepts rather than sends a second
            // request that would only be collapsed into the same acceptance.
            label = getI18nText('chat.friendAcceptBtn', 'Accept');
            status = getI18nText('chat.friendStatusIncoming', 'This person has sent you a friend request.');
        } else if (user.requestPending) {
            label = getI18nText('chat.friendRequestedBtn', 'Request Sent');
            disabled = true;
            status = getI18nText('chat.friendStatusPending', 'A friend request is waiting for an answer.');
        } else {
            label = getI18nText('chat.friendAddBtn', 'Add Friend');
        }

        if (friendUserAddBtnEl) {
            friendUserAddBtnEl.textContent = label;
            friendUserAddBtnEl.disabled = disabled;
            friendUserAddBtnEl.style.display = label ? 'inline-flex' : 'none';
        }
        if (friendUserStatusEl) {
            friendUserStatusEl.textContent = status;
            friendUserStatusEl.style.display = status ? 'block' : 'none';
        }

        if (dialogOverlay) dialogOverlay.style.display = 'block';
        friendUserDialogEl.style.display = 'block';
    }

    /** Closes only the profile toast, leaving the friends toast underneath it. */
    function closeFriendUserDialog() {
        if (friendUserDialogEl) friendUserDialogEl.style.display = 'none';
        friendUserTarget = null;
        if (friendUserDialogEl && friendsDialogEl && friendsDialogEl.style.display !== 'none') {
            if (dialogOverlay) dialogOverlay.style.display = 'block';
        }
    }

    /**
     * Sends a friend request for the account currently in the profile toast, or
     * accepts theirs when one is already waiting.
     *
     * The outcome is always re-read from the server rather than guessed: a mutual
     * request is accepted immediately on the server, so the reply may say the
     * friendship already exists and carry the conversation with it.
     */
    async function handleFriendAdd() {
        if (!friendUserTarget || !window.OxypeCore) return;
        const targetId = friendUserTarget.userid;
        const auth = window.OxypeCore.getStoredAuth();
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);
        const token = auth ? auth.token : null;

        if (friendUserAddBtnEl) friendUserAddBtnEl.disabled = true;

        try {
            const result = await window.OxypeCore.sendFriendRequest(targetId, userId, token);
            const status = result ? String(result.status || '') : '';
            const sessionId = result ? (result.sessionId !== undefined ? result.sessionId : result.session_id) : undefined;

            closeFriendUserDialog();

            if (status === 'accepted') {
                addFriendSessionToList(sessionId, targetId, getUserNameById(targetId));
                if (window.OxypeStyle) {
                    window.OxypeStyle.showToast(
                        getI18nText('chat.friendAccepted', 'Friend request accepted.'),
                        'success'
                    );
                }
                await selectSession(sessionId);
            } else {
                if (window.OxypeStyle) {
                    window.OxypeStyle.showToast(
                        getI18nText('chat.friendRequestSent', 'Friend request sent.'),
                        'success'
                    );
                }
            }

            if (friendsDialogEl && friendsDialogEl.style.display !== 'none') {
                await loadFriendRequests();
            }
        } catch (err) {
            console.error('[Chat] Send friend request failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            const message = /already friends/i.test(reason)
                ? getI18nText('chat.friendAlreadyFriend', 'Already friends')
                : getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason });
            if (window.OxypeStyle) window.OxypeStyle.showToast(message, 'error');
        } finally {
            if (friendUserAddBtnEl) friendUserAddBtnEl.disabled = false;
        }
    }

    /** Best-known display name for an account, for naming a row being added. */
    function getUserNameById(userId) {
        const id = String(userId);
        if (activeSessionUsers.has(id)) return activeSessionUsers.get(id);
        if (friendUserTarget && String(friendUserTarget.userid) === id) return friendUserTarget.username;
        if (currentUser && String(currentUser.id) === id) return currentUser.username;
        return `User #${id}`;
    }

    /**
     * Adds (or refreshes) the sidebar row for a friend conversation.
     *
     * The row is created from the account rather than from a session request because
     * the server names a friend conversation after the other person: asking for the
     * session would return the same two fields, one round trip later.
     *
     * @param {string|number} sessionId
     * @param {string|number} peerUserId
     * @param {string} peerName
     */
    function addFriendSessionToList(sessionId, peerUserId, peerName) {
        if (!sessionListEl || sessionId === undefined || sessionId === null) return;
        const sId = String(sessionId);
        const name = peerName || `User #${peerUserId}`;
        sessionsMap.set(sId, { sessionId: sId, sessionName: name, description: '', isFriend: true, peerUserId: peerUserId, lastActivity: Date.now() });

        // An existing row is used as-is: the buddy may have been added by a websocket
        // session update first, and a second row for one conversation would show the
        // same messages twice in the sidebar.
        const existing = sessionListEl.querySelector(`[data-session-id="${sId}"]`);
        if (existing) {
            const nameEl = existing.querySelector('.session-name');
            if (nameEl) nameEl.textContent = name;
            return;
        }

        if (emptySessionsPlaceholder) emptySessionsPlaceholder.style.display = 'none';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'session-item';
        btn.dataset.sessionId = sId;
        const initial = name.trim().charAt(0).toUpperCase() || '#';
        btn.innerHTML = `
            <div class="session-avatar" data-avatar-user="${escapeHtml(peerUserId)}" data-avatar-initial="${escapeHtml(initial)}">${escapeHtml(initial)}</div>
            <div class="session-details">
                <div class="session-name">${escapeHtml(name)}</div>
                <div class="session-subtext session-last-message"></div>
            </div>
        `;
        // A friend conversation's picture is the other person's, which the avatar
        // machinery already knows how to paint by account id.
        const avatarEl = btn.querySelector('.session-avatar');
        if (avatarEl) {
            const known = cachedAvatarUrl('user', peerUserId);
            if (known === undefined) requestUserAvatar(peerUserId);
            else paintAvatarElement(avatarEl, 'user', peerUserId, initial);
        }

        btn.addEventListener('click', () => selectSession(sId));
        sessionListEl.insertBefore(btn, sessionListEl.firstChild);
    }

    /**
     * Rebuilds the sidebar from the server, for the paths whose new conversation is
     * not described by the answer (a friendship accepted on the other side).
     */
    async function reloadSessionsFromServer() {
        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);
        if (!userId) return;
        await loadUserDataAndSessions(userId);
    }

    /**
     * Handles the push that says the caller's conversation list changed.
     *
     * The server sends this when something happens to the account rather than to a
     * conversation -- a friend request arriving, a request being accepted and so
     * creating the one-to-one conversation. None of those are a message in a
     * subscribed session, so nothing else would tell an already-open client.
     *
     * The list is reloaded rather than patched from the payload: the push
     * deliberately carries no ids, so the client asks for its own list and renders
     * whatever the server says it may see. The friends dialog is refreshed too, so
     * an arriving request appears without reopening it.
     */
    let sessionsChangedTimer = null;
    function handleSessionsChanged() {
        // Several pushes can arrive within a moment of each other (a request sent
        // and accepted); one reload covers them all.
        if (sessionsChangedTimer) clearTimeout(sessionsChangedTimer);
        sessionsChangedTimer = setTimeout(async () => {
            sessionsChangedTimer = null;
            try {
                await reloadSessionsFromServer();
                if (friendsDialogEl && friendsDialogEl.style.display !== 'none') {
                    await loadFriendRequests();
                }
            } catch (err) {
                console.warn('[Chat] Refreshing after a session change failed:', err.message);
            }
        }, 150);
    }

    /**
     * The server's revision for the list currently on screen.
     *
     * A push is delivered once, to whatever connection is open at that moment, and
     * nothing is queued for one that is not. A tab that was disconnected when a
     * friend request arrived therefore never hears about it, and would show
     * yesterday's sidebar until the page was reloaded by hand. Re-reading on every
     * reconnect covers that but cannot distinguish "nothing happened" from "the push
     * was lost", so every reconnect would pay for a full reload.
     *
     * The server counts the changes it announces and the membership writes that
     * silently change the list, and reports that number in the answer it gives when
     * the list is read, in the `ready` frame after a reconnect, and on every
     * heartbeat `pong`. Storing the number alongside the rendered list turns a
     * reconnect into a comparison: equal means nothing can have been missed, and
     * different means the list is re-read.
     *
     * `null` means no revision has been recorded yet (first load still in flight, or
     * a server too old to report one), and every caller treats it as "unknown",
     * which reloads. Guessing "current" there would risk sitting on a stale list.
     */
    let lastSeenSessionsRevision = null;

    /**
     * Compares a revision reported by the server against the one the rendered list
     * was read at, reloading the list when they differ.
     *
     * Only a mismatch triggers work, so the heartbeat can carry this every twenty
     * seconds for free, and a reconnect where nothing happened costs nothing. A
     * reload in flight already sets a timer, so repeated mismatches before it lands
     * collapse into the single reload it is about to do.
     *
     * @param {number|null} revision The revision the server just reported.
     */
    function noteSessionsRevision(revision) {
        if (typeof revision !== 'number' || !isFinite(revision)) return;
        if (lastSeenSessionsRevision !== null && revision === lastSeenSessionsRevision) return;
        // The value is deliberately *not* adopted here: it only becomes the recorded
        // revision once a list read succeeds and records it. Adopting it up front would
        // mean that a reload which failed left the sidebar stale but the number
        // current, so every later heartbeat would match and the tab would never catch
        // up. Leaving it behind costs at most one extra reload, because a mismatch
        // repeats until a read lands.
        //
        // With nothing recorded yet there is no list to compare against -- the first
        // load is still in flight, or it failed and left the sidebar empty -- so this
        // reloads rather than trusting a number it has not yet been able to tie to
        // anything. That is also what the caller did before revisions existed, so a
        // boot-time read that failed still recovers here.
        handleSessionsChanged();
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
            <div class="session-avatar" data-avatar-session="${escapeHtml(sessionId)}" data-avatar-initial="${escapeHtml(avatarChar)}">${escapeHtml(avatarChar)}</div>
            <div class="session-details">
                <div class="session-name">${escapeHtml(sessionName)}</div>
                <div class="session-subtext">ID: ${escapeHtml(sessionId)}</div>
            </div>
        `;

        // The conversation's picture is known only after the list request, so the row
        // asks for it here and is repainted when the answer arrives.
        const knownSessionAvatar = cachedAvatarUrl('session', sessionId);
        if (knownSessionAvatar === undefined) {
            requestSessionAvatar(sessionId);
        } else {
            paintAvatarElement(sessionBtn.querySelector('.session-avatar'), 'session', sessionId, avatarChar);
        }

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
            userAvatarEl.dataset.avatarUser = String(currentUser.id);
            userAvatarEl.dataset.avatarInitial = initial;
            const known = cachedAvatarUrl('user', currentUser.id);
            if (known === undefined) {
                userAvatarEl.textContent = initial;
                requestUserAvatar(currentUser.id);
            } else {
                paintAvatarElement(userAvatarEl, 'user', currentUser.id, initial);
            }
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
                // The profile carries the caller's own avatar, which spares the page a
                // separate getAvatar call for the footer.
                if (typeof userProfile.avatarUrl === 'string') {
                    avatarUrlCache.set(avatarCacheKey('user', userId), userProfile.avatarUrl);
                    syncAvatar('user', userId, userProfile.avatarUrl);
                }
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
            const envelope = await window.OxypeCore.getJoinedSessionsEnvelope(userId);
            const rawSessionIds = envelope ? envelope.sessions : null;
            if (Array.isArray(rawSessionIds) && rawSessionIds.length > 0) {
                // Batch query session objects from /getSessions to resolve real session names immediately
                try {
                    const sessionObjects = await window.OxypeCore.getSessions(rawSessionIds);
                    if (sessionObjects && Array.isArray(sessionObjects) && sessionObjects.length > 0) {
                        renderSessionList(sessionObjects, envelope ? envelope.revision : null);
                        return;
                    }
                } catch (batchErr) {
                    console.warn('[Chat] Batch getSessions failed, rendering raw list:', batchErr.message);
                }
            }
            renderSessionList(rawSessionIds || [], envelope ? envelope.revision : null);
        } catch (err) {
            console.warn('[Chat] getJoinedSessions request completed with status:', err.message);
            // Render clean empty state. The revision is left untouched: a failed read
            // proves nothing about the list, so claiming the last-seen value is still
            // current would suppress the very reload that is needed.
            renderSessionList([]);
        }
    }

    /**
     * Updates the latest message preview of the active session in the sidebar list.
     * @param {string} senderName
     * @param {string} content
     */
    function moveSessionToTop(sessionId, timestamp) {
        if (!sessionListEl || sessionId === undefined || sessionId === null) return;
        const id = String(sessionId);
        const item = sessionListEl.querySelector(`[data-session-id="${id}"]`);
        if (!item) return;
        const entry = sessionsMap.get(id) || { sessionId: id };
        const parsed = Number(timestamp);
        const activity = Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
        if (Number(entry.lastActivity || 0) > activity) return;
        entry.lastActivity = activity;
        sessionsMap.set(id, entry);
        const first = sessionListEl.querySelector('.session-item');
        if (first !== item) sessionListEl.insertBefore(item, first || null);
    }

    function updateActiveSessionLastMessage(senderName, content, timestamp) {
        if (!activeSessionId || !sessionListEl) return;
        const item = sessionListEl.querySelector(`[data-session-id="${activeSessionId}"]`);
        if (!item) return;
        const previewEl = item.querySelector('.session-last-message');
        if (previewEl) previewEl.textContent = content ? `${senderName || 'User'}: ${content}` : '';
        moveSessionToTop(activeSessionId, timestamp);
    }

    /**
     * Writes a conversation's sidebar preview from a `lastMessage` answer.
     *
     * Shared by the delete path and the calibration cycle so the two cannot disagree
     * about what an empty answer means: for the delete path blank is a real outcome and
     * is written through. The cycle only writes an answer that names a message, because
     * `lastMessage` looks back a bounded number of sequences and reporting nothing may
     * simply mean the newest survivor is older than that -- a stale preview is a smaller
     * lie than a blanked one.
     *
     * @param {string} sId
     * @param {object|null} lastMsg
     * @param {boolean} [blankWhenEmpty]
     */
    function writePreviewFromLastMessage(sId, lastMsg, blankWhenEmpty) {
        if (!sessionListEl) return;
        const item = sessionListEl.querySelector(`[data-session-id="${sId}"]`);
        const previewEl = item ? item.querySelector('.session-last-message') : null;
        if (!previewEl) return;
        if (lastMsg && lastMsg.hasMessage && (lastMsg.content || lastMsg.senderName)) {
            previewEl.textContent = `${lastMsg.senderName || 'User'}: ${lastMsg.content || ''}`;
            return;
        }
        if (blankWhenEmpty) previewEl.textContent = '';
    }

    /**
     * Re-reads a conversation's preview from the server.
     *
     * Deleting the message that a preview was built from leaves the row stale, and a
     * local guess cannot stand in for the answer: the server decides what the newest
     * surviving message is, possibly one that arrived from someone else and was never
     * rendered here. Blank is a real outcome too — the conversation may have no
     * messages left within reach — so an empty answer is written through.
     *
     * @param {string|number} sessionId
     */
    function refreshSessionPreview(sessionId) {
        if (sessionId === undefined || sessionId === null || !sessionListEl) return;
        const sId = String(sessionId);
        const auth = window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
        const userId = currentUser ? currentUser.id : (auth ? auth.userId : null);
        const inFlight = previewRefreshes.get(sId);
        if (inFlight) return inFlight;
        const pending = window.OxypeCore.getLastMessage(sId, userId, auth ? auth.token : null)
            .then(lastMsg => {
                writePreviewFromLastMessage(sId, lastMsg, true);
            })
            .catch(err => {
                console.warn(`[Chat] Failed to refresh lastMessage/${sId}:`, err.message);
            })
            .finally(() => {
                // Released so a later delete can look again; a failure must not pin the
                // conversation to a stale preview for the rest of the session.
                previewRefreshes.delete(sId);
            });
        previewRefreshes.set(sId, pending);
        return pending;
    }

    /**
     * Whether the transcript is scrolled close enough to its newest message that
     * incoming content may carry the view with it.
     * @returns {boolean}
     */
    function isNearBottom() {
        if (!messagesContainerEl) return true;
        const distance = messagesContainerEl.scrollHeight
            - messagesContainerEl.scrollTop
            - messagesContainerEl.clientHeight;
        // A container that has not been laid out reports zeros, and there is nothing to
        // preserve in that case either.
        if (!Number.isFinite(distance)) return true;
        return distance <= NEAR_BOTTOM_SLOP_PX;
    }

    /**
     * Records which row sits at the top of the visible transcript.
     *
     * A correction may insert or drop rows above the viewport, which would move the
     * text under the reader without changing `scrollTop`. Remembering the row and its
     * offset is what lets the repair put that same text back where it was.
     *
     * @returns {{row: HTMLElement, offset: number}|null}
     */
    function captureScrollAnchor() {
        if (!messagesContainerEl) return null;
        const containerTop = messagesContainerEl.getBoundingClientRect().top;
        const rows = messagesContainerEl.querySelectorAll('.message-row');
        for (let i = 0; i < rows.length; i++) {
            const rect = rows[i].getBoundingClientRect();
            // The first row still reaching below the top edge is the one being read.
            if (rect.bottom > containerTop + 1) {
                return { row: rows[i], offset: rect.top - containerTop };
            }
        }
        return null;
    }

    /**
     * Puts the recorded row back at the offset it had before the transcript changed.
     * @param {{row: HTMLElement, offset: number}|null} anchor
     */
    function restoreScrollAnchor(anchor) {
        if (!messagesContainerEl || !anchor || !anchor.row || !anchor.row.isConnected) return;
        const containerTop = messagesContainerEl.getBoundingClientRect().top;
        const drift = (anchor.row.getBoundingClientRect().top - containerTop) - anchor.offset;
        if (Math.abs(drift) > 0.5) messagesContainerEl.scrollTop += drift;
    }

    /**
     * The rows that carry a server id, in document order.
     *
     * Rows still waiting for the send response have no id and are left out on purpose:
     * they are not part of what the server knows, so they cannot be compared against it.
     *
     * @returns {Array<{seq: number, row: HTMLElement}>}
     */
    function collectRenderedSeqs() {
        const found = [];
        if (!messagesContainerEl) return found;
        const rows = messagesContainerEl.querySelectorAll('.message-row');
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row.dataset.messageId === undefined) continue;
            const seq = Number(row.dataset.messageId);
            if (Number.isFinite(seq)) found.push({ seq: seq, row: row });
        }
        return found;
    }

    /**
     * Server sequence of a message record, whichever field carries it.
     * @param {object} msg
     * @returns {number|null}
     */
    function messageSeqOf(msg) {
        if (!msg) return null;
        const raw = (msg.id !== undefined && msg.id !== null) ? msg.id : msg.seq;
        const seq = Number(raw);
        return Number.isFinite(seq) && seq > 0 ? seq : null;
    }

    /**
     * Places a row at the position its sequence number belongs to.
     *
     * The transcript is ordered by sequence, and a message recovered long after it was
     * written belongs where it was written, not at the bottom. A row with no id yet is
     * a send still in flight and by definition newer than anything numbered, so it moves
     * the insertion point to keep the pending message last.
     *
     * @param {HTMLElement} row
     * @param {number} seq
     */
    function insertRowInSequenceOrder(row, seq) {
        if (!messagesContainerEl || !row) return;
        const rendered = messagesContainerEl.querySelectorAll('.message-row');
        let anchor = null;
        for (let i = 0; i < rendered.length; i++) {
            const candidate = rendered[i];
            if (candidate === row) continue;
            const raw = candidate.dataset.messageId;
            if (raw === undefined) {
                anchor = candidate;
                break;
            }
            const other = Number(raw);
            if (Number.isFinite(other) && other > seq) {
                anchor = candidate;
                break;
            }
        }
        // Date separators are rebuilt from scratch after any repair, so a row landing on
        // the wrong side of one of them for a moment is never painted.
        messagesContainerEl.insertBefore(row, anchor);
    }

    /**
     * Renders the records that the transcript does not have yet.
     *
     * De-duplication is left to `buildHistoryRows`, which owns the rendered-key set, so a
     * record recovered here and the same record arriving through a broadcast cannot
     * become two rows. A row of this client's own that is still waiting for its send
     * response is paired up by body first, exactly as the broadcast path does.
     *
     * @param {Array<object>} messages records in ascending order
     * @param {string} sessionId
     * @returns {number} how many rows were added
     */
    function renderMissingMessages(messages, sessionId) {
        const missing = [];
        (messages || []).forEach(msg => {
            const seq = messageSeqOf(msg);
            if (seq === null) return;
            if (renderedMessageKeys.has(String(sessionId) + ':' + String(seq))) return;
            if (findMessageRow(seq)) return;
            const body = readMessageBody(msg);
            if (!body || !body.text) return;
            if (adoptOptimisticRow(body.text, seq)) return;
            missing.push(msg);
        });
        if (missing.length === 0) return 0;
        // Built detached and inserted afterwards: appending one at a time would re-run the
        // sticky-bottom scroll for every message of the batch.
        const rows = buildHistoryRows(missing);
        rows.forEach(row => {
            insertRowInSequenceOrder(row, Number(row.dataset.messageId));
        });
        return rows.length;
    }

    /**
     * Fetches a range of messages, keeping "the server said there is nothing" apart from
     * "the server could not be asked".
     *
     * `OxypeCore.getMessages` folds a failed request into an empty array, which is fine
     * for opening a conversation but not here: this cycle also decides that a row has
     * been deleted, and a network hiccup must never be read as "everything is gone".
     * The underlying transport is therefore called directly so failures stay visible.
     *
     * @param {string} sessionId
     * @param {number} start inclusive
     * @param {number} end inclusive
     * @param {string|number} userId
     * @param {string|null} token
     * @returns {Promise<{ok: boolean, reliable: boolean, messages: Array<object>}>}
     */
    async function fetchMessageRangeReliably(sessionId, start, end, userId, token) {
        const core = window.OxypeCore;
        const request = core && typeof core.request === 'function' ? core.request.bind(core) : null;
        if (!request) {
            const messages = await core.getMessages(sessionId, start, end, userId, token);
            return { ok: true, reliable: false, messages: messages || [] };
        }
        try {
            const body = typeof core.authBody === 'function'
                ? core.authBody(userId, token, { start: Number(start), end: Number(end) })
                : { userid: userId, token: token || '', start: Number(start), end: Number(end) };
            const response = await request(`/getMessages/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: body,
                timeout: CALIBRATION_REQUEST_TIMEOUT_MS
            });
            // `request` strips the outer Kalmia envelope but not the service payload's own
            // shape, and `getMessages` answers `{"list": [...]}` rather than a bare array.
            // Every shape `/getMessages` is known to use is accepted here; anything else is
            // a body this cycle cannot reason about, and must not be mistaken for an empty
            // conversation -- that mistake would delete every row on screen.
            const list = Array.isArray(response) ? response
                : (response && Array.isArray(response.list)) ? response.list
                    : (response && Array.isArray(response.data)) ? response.data
                        : (response && Array.isArray(response.messages)) ? response.messages
                            : null;
            if (list) {
                return { ok: true, reliable: true, messages: list };
            }
            console.warn(`[Chat] Calibration read ${sessionId} ${start}-${end} returned no message list`);
            return { ok: false, reliable: false, messages: [] };
        } catch (err) {
            console.warn(`[Chat] Calibration could not read ${sessionId} ${start}-${end}:`, err && err.message);
            return { ok: false, reliable: false, messages: [] };
        }
    }

    /**
     * True when a pass has been overtaken and must stop painting.
     * @param {number} generation
     * @param {string|number} sessionId
     * @returns {boolean}
     */
    function calibrationAbandoned(generation, sessionId) {
        return generation !== calibrationGeneration
            || String(activeSessionId) !== String(sessionId);
    }

    /**
     * Reconciles the open conversation against what the server currently holds.
     *
     * Two things are checked, and they answer different questions. The newest surviving
     * sequence from `lastMessage` says how far the conversation now reaches, which makes
     * everything past the last row on screen missing outright — that is the case a lost
     * broadcast leaves behind. The verification window then walks the rendered range
     * once per pass asking the server what it actually holds there, which is the only way
     * to tell a deleted message from one that simply was not fetched: a range fetch
     * returns survivors, and a hole is therefore proof of a deletion.
     *
     * @param {number} generation
     * @returns {Promise<object|null>} the `lastMessage` answer this pass already paid for,
     *          or null when it never got one; the sidebar reuses it instead of asking
     *          the same question twice about the open conversation
     */
    async function calibrateActiveSession(generation) {
        const sessionId = activeSessionId;
        if (!sessionId) return null;
        const core = window.OxypeCore;
        if (!core) return null;
        const auth = typeof core.getStoredAuth === 'function' ? core.getStoredAuth() : null;
        if (!auth) return null;
        const userId = currentUser && currentUser.id !== undefined && currentUser.id !== null
            ? currentUser.id
            : auth.userId;
        const token = auth.token || null;

        let newest = null;
        try {
            newest = await core.getLastMessage(sessionId, userId, token);
        } catch (err) {
            console.warn('[Chat] Calibration could not read the newest message:', err && err.message);
            return null;
        }
        if (calibrationAbandoned(generation, sessionId)) return null;
        // `lastMessage` looks back only a bounded number of sequences, so when it reports
        // nothing it may mean an empty conversation *or* one whose newest survivor is
        // older than that lookback. It therefore only ever supplies an upper bound; it is
        // never taken as proof that the transcript on screen is stale.
        const newestSeq = (newest && newest.hasMessage === true)
            ? messageSeqOf({ id: newest.id })
            : null;
        if (newest && newest.hasMessage === true && newestSeq === null) return newest;
        if (newestSeq !== null) currentSeq = Math.max(currentSeq, newestSeq);

        const rendered = collectRenderedSeqs();
        const wasNearBottom = isNearBottom();
        const anchor = wasNearBottom ? null : captureScrollAnchor();
        let changed = false;

        // Anything past the newest surviving sequence cannot exist on the server: those
        // rows were deleted while this client was not listening.
        if (newestSeq !== null) {
            rendered.forEach(item => {
                if (item.seq <= newestSeq) return;
                if (item.row === editingRow) return;
                removeMessageRow(item.row, true);
                changed = true;
            });
        }

        // Recomputed from the live transcript, because the rows just dropped must not
        // influence where the tail fetch or the verification window begin.
        const live = collectRenderedSeqs();
        let localMax = 0;
        live.forEach(item => {
            if (item.seq > localMax) localMax = item.seq;
        });

        // The tail first: a reader looking at the newest message should see the newest
        // message, even when the gap is longer than one window. Successive passes keep
        // filling the same gap without ever rendering a record out of order.
        if (newestSeq !== null && newestSeq > localMax) {
            const tailStart = localMax + 1;
            const tailEnd = Math.min(newestSeq, tailStart + CALIBRATION_VERIFY_SPAN - 1);
            const tail = await fetchMessageRangeReliably(sessionId, tailStart, tailEnd, userId, token);
            if (calibrationAbandoned(generation, sessionId)) return null;
            if (tail.ok && renderMissingMessages(tail.messages, sessionId) > 0) changed = true;
        }

        // The verification window. It remembers where it stopped so a long transcript is
        // covered over several passes, and restarts from the oldest row once it has
        // walked the whole range. Without an anchor from the server the rendered range
        // itself is the only bound available, which is what lets a conversation whose
        // messages were all deleted empty itself out here.
        if (calibrationVerifySessionId !== String(sessionId)) {
            calibrationVerifySessionId = String(sessionId);
            calibrationVerifyFrom = null;
        }
        const spanEnd = newestSeq !== null ? newestSeq : localMax;
        const oldestRendered = live.length > 0 ? live[0].seq : 1;
        let windowStart = calibrationVerifyFrom === null ? oldestRendered : Number(calibrationVerifyFrom);
        if (!Number.isFinite(windowStart) || windowStart < 1) windowStart = 1;
        const windowEnd = Math.min(spanEnd, windowStart + CALIBRATION_VERIFY_SPAN - 1);
        if (windowStart <= windowEnd) {
            const verified = await fetchMessageRangeReliably(sessionId, windowStart, windowEnd, userId, token);
            if (calibrationAbandoned(generation, sessionId)) return null;
            if (verified.ok) {
                const surviving = new Map();
                verified.messages.forEach(msg => {
                    const seq = messageSeqOf(msg);
                    if (seq !== null) surviving.set(seq, msg);
                });
                if (verified.reliable) {
                    // A row inside the window that the server no longer returns was deleted
                    // somewhere this client never heard about.
                    live.forEach(item => {
                        if (item.seq < windowStart || item.seq > windowEnd) return;
                        if (surviving.has(item.seq)) return;
                        if (item.row === editingRow || !item.row.isConnected) return;
                        removeMessageRow(item.row, true);
                        changed = true;
                    });
                }
                // The server also decides what a message says, so a body that differs is a
                // change whose broadcast was missed. A row being edited is never touched.
                surviving.forEach((msg, seq) => {
                    const row = findMessageRow(seq);
                    if (!row || row === editingRow) return;
                    const body = readMessageBody(msg);
                    if (!body || !body.text) return;
                    const known = row.oxypeMessage || {};
                    const knownFormat = known.format === 'markdown' ? 'markdown' : 'text';
                    const nextFormat = body.format === 'markdown' ? 'markdown' : 'text';
                    if (known.text !== body.text || knownFormat !== nextFormat) {
                        applyMessageEdit(row, body);
                        changed = true;
                        return;
                    }
                    if (msg.editedAt && !row.querySelector('.message-edited-mark')) {
                        markMessageEdited(row);
                        changed = true;
                    }
                });
                if (renderMissingMessages(verified.messages, sessionId) > 0) changed = true;
            }
            // Advanced even on a failed read: the window would otherwise be pinned to a
            // range that cannot be answered, while a later pass retries it on the next lap.
            calibrationVerifyFrom = windowEnd >= newestSeq ? null : windowEnd + 1;
        } else {
            calibrationVerifyFrom = null;
        }

        if (!changed) return newest;
        if (calibrationAbandoned(generation, sessionId)) return null;
        normalizeDateSeparators();
        refreshRenderedSenderGroups();
        if (anchor) {
            restoreScrollAnchor(anchor);
        } else if (wasNearBottom && messagesContainerEl) {
            // Following the newest message is only the right move for a reader who was
            // already there; anyone scrolled back keeps their place.
            messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
        }
        // A sender first seen this way has no name yet, so the placeholders the new rows
        // were built with are resolved now rather than on the next conversation open.
        resolveRenderedPlaceholderSenders();
        return newest;
    }

    /**
     * Re-reads the sidebar previews, a few conversations per pass.
     *
     * The preview names the newest message of its conversation, so it drifts for the same
     * reasons the transcript does. It is never allowed to reorder the list: sorting is
     * driven by activity the user witnessed, and a background correction that moved rows
     * under the pointer would be worse than a stale preview. The open conversation is
     * always included, everything else is walked so no entry is skipped.
     *
     * @param {object|null} [activeLastMessage] the `lastMessage` answer the transcript half
     *        of this pass already fetched for the open conversation, so it is not fetched
     *        a second time
     */
    function calibrateSidebarPreviews(activeLastMessage) {
        if (!sessionListEl) return;
        if (activeSessionId) {
            if (activeLastMessage) {
                writePreviewFromLastMessage(String(activeSessionId), activeLastMessage, false);
            } else {
                refreshSessionPreview(activeSessionId);
            }
        }
        const items = sessionListEl.querySelectorAll('.session-item');
        if (items.length === 0) return;
        if (calibrationPreviewCursor >= items.length || calibrationPreviewCursor < 0) {
            calibrationPreviewCursor = 0;
        }
        const budget = Math.min(CALIBRATION_PREVIEWS_PER_PASS, items.length);
        let index = calibrationPreviewCursor;
        for (let checked = 0; checked < budget; checked++) {
            const item = items[index % items.length];
            index++;
            const sid = item ? item.dataset.sessionId : null;
            if (!sid) continue;
            if (String(sid) === String(activeSessionId)) continue;
            refreshSessionPreview(sid);
        }
        calibrationPreviewCursor = items.length > 0 ? index % items.length : 0;
    }

    /**
     * One calibration pass.
     *
     * Runs on a timer, so it must be cheap and must never overlap itself: a pass still
     * waiting on the server is a pass whose work the next tick has no reason to repeat.
     * It also stands down whenever the view is not showing something it could correct —
     * a hidden tab, or a conversation whose history is still being loaded.
     */
    async function runCalibrationPass() {
        if (calibrationInFlight) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        if (historyLoadingSessionId) return;
        if (historyPageInFlight) return;
        calibrationInFlight = true;
        const generation = calibrationGeneration;
        try {
            const activeLastMessage = await calibrateActiveSession(generation);
            if (generation !== calibrationGeneration) return;
            calibrateSidebarPreviews(activeLastMessage);
        } catch (err) {
            console.warn('[Chat] Calibration pass failed:', err && err.message ? err.message : err);
        } finally {
            calibrationInFlight = false;
        }
    }

    /**
     * A tab that has just become visible is the textbook stale transcript, so it gets a
     * pass immediately instead of waiting for the rest of the interval.
     */
    function handleCalibrationVisibilityChange() {
        if (!document || document.hidden) return;
        runCalibrationPass();
    }

    /**
     * Starts the calibration cycle.
     */
    function startCalibration() {
        stopCalibration();
        calibrationTimer = setInterval(runCalibrationPass, CALIBRATION_INTERVAL_MS);
        if (typeof document !== 'undefined' && document.addEventListener) {
            document.addEventListener('visibilitychange', handleCalibrationVisibilityChange);
        }
    }

    /**
     * Stops the calibration cycle and discards any pass still in flight.
     *
     * The generation bump is what makes the discard safe: a response that arrives after
     * this point carries an older number and is dropped instead of being painted into a
     * conversation the reader has left, or into a page that is being torn down.
     */
    function stopCalibration() {
        calibrationGeneration++;
        if (calibrationTimer !== null) {
            clearInterval(calibrationTimer);
            calibrationTimer = null;
        }
        if (typeof document !== 'undefined' && document.removeEventListener) {
            document.removeEventListener('visibilitychange', handleCalibrationVisibilityChange);
        }
        calibrationInFlight = false;
        calibrationVerifyFrom = null;
        calibrationVerifySessionId = null;
        calibrationPreviewCursor = 0;
    }

    /**
     * Render the session list strictly from real data.
     * No fake or mock session templates are introduced.
     * @param {Array<Object|number>} sessions 
     * @param {number|null} [revision] The server's revision for exactly this list.
     *   Recorded whenever one is supplied, so that a later comparison can tell a
     *   reconnect where nothing happened from one where a push was lost.
     */
    function renderSessionList(sessions, revision) {
        if (typeof revision === 'number' && isFinite(revision)) {
            lastSeenSessionsRevision = revision;
        }
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
            // A friend conversation has no picture of its own: the server already
            // answered with the other person's name and image, so the row is drawn
            // against that account rather than against the conversation id.
            const isFriend = Boolean(typeof session === 'object' && session.isFriend);
            const peerUserId = typeof session === 'object' ? session.peerUserId : undefined;

            sessionsMap.set(String(sessionId), { sessionId, sessionName, description: sessionDesc, lastActivity: (typeof session === 'object' && (session.lastActivity || session.timestamp)) || 0, isFriend: isFriend, peerUserId: peerUserId });

            const sessionBtn = document.createElement('button');
            sessionBtn.className = 'session-item';
            sessionBtn.type = 'button';
            sessionBtn.dataset.sessionId = String(sessionId);

            const avatarChar = sessionName.trim().charAt(0).toUpperCase() || '#';
            const avatarAttr = (isFriend && peerUserId !== undefined && peerUserId !== null)
                ? `data-avatar-user="${escapeHtml(peerUserId)}"`
                : `data-avatar-session="${escapeHtml(sessionId)}"`;

            // The sidebar subtitle displays the latest message preview ("sender: message content"), blank when empty.
            sessionBtn.innerHTML = `
                <div class="session-avatar" ${avatarAttr} data-avatar-initial="${escapeHtml(avatarChar)}">${escapeHtml(avatarChar)}</div>
                <div class="session-details">
                    <div class="session-name">${escapeHtml(sessionName)}</div>
                    <div class="session-subtext session-last-message"></div>
                </div>
            `;

            // Seeded from the conversation record when it already carries a picture, and
            // otherwise left to the bulk sweep that follows this loop. The bytes are
            // stored too, not just drawn: a row that only ever painted from the URL would
            // refetch the image on every load, which is what the hash exists to avoid.
            if (isFriend && peerUserId !== undefined && peerUserId !== null) {
                const avatarEl = sessionBtn.querySelector('.session-avatar');
                if (typeof session.avatarUrl === 'string') {
                    avatarUrlCache.set(avatarCacheKey('user', peerUserId), session.avatarUrl);
                    paintAvatarElement(avatarEl, 'user', peerUserId, avatarChar);
                    syncAvatar('user', peerUserId, session.avatarUrl);
                } else if (cachedAvatarUrl('user', peerUserId) !== undefined) {
                    paintAvatarElement(avatarEl, 'user', peerUserId, avatarChar);
                } else {
                    requestUserAvatar(peerUserId);
                }
            } else if (typeof session.avatarUrl === 'string') {
                avatarUrlCache.set(avatarCacheKey('session', sessionId), session.avatarUrl);
                paintAvatarElement(sessionBtn.querySelector('.session-avatar'), 'session', sessionId, avatarChar);
                syncAvatar('session', sessionId, session.avatarUrl);
            } else {
                requestSessionAvatar(sessionId);
            }

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
                            moveSessionToTop(sId, lastMsg.timestamp);
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
                            const isFriend = Boolean(sessionObj.isFriend);
                            const peerUserId = sessionObj.peerUserId;
                            sessionsMap.set(sId, { sessionId: sId, sessionName: sName, description: sDesc, isFriend: isFriend, peerUserId: peerUserId });

                            // Update corresponding sidebar element display name and avatar
                            const sessionBtn = sessionListEl.querySelector(`[data-session-id="${sId}"]`);
                            if (sessionBtn) {
                                const nameEl = sessionBtn.querySelector('.session-name');
                                const avatarEl = sessionBtn.querySelector('.session-avatar');
                                if (nameEl) nameEl.textContent = sName;
                                if (avatarEl) {
                                    // Painted, not overwritten: this refresh arrives after
                                    // the picture was drawn, and assigning textContent
                                    // would delete the <img> and fall back to a letter.
                                    const initial = sName.trim().charAt(0).toUpperCase() || '#';
                                    avatarEl.dataset.avatarInitial = initial;
                                    // A friend conversation is drawn against the other
                                    // account, so the key and the attribute both have to
                                    // switch -- otherwise the refresh would overwrite a
                                    // correct face with the conversation's empty one.
                                    const kind = (isFriend && peerUserId !== undefined && peerUserId !== null) ? 'user' : 'session';
                                    const key = kind === 'user' ? peerUserId : sId;
                                    if (kind === 'user') {
                                        avatarEl.dataset.avatarUser = String(peerUserId);
                                        delete avatarEl.dataset.avatarSession;
                                    } else {
                                        avatarEl.dataset.avatarSession = String(sId);
                                        delete avatarEl.dataset.avatarUser;
                                    }
                                    if (typeof sessionObj.avatarUrl === 'string') {
                                        avatarUrlCache.set(avatarCacheKey(kind, key), sessionObj.avatarUrl);
                                    }
                                    paintAvatarElement(avatarEl, kind, key, initial);
                                }
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

        // The rows above are newly built, so the highlighted one is re-marked here.
        // The list is redrawn whenever the roster changes -- including after a
        // reconnect -- and marking the open conversation is otherwise something only
        // selectSession does, which a redraw does not go through. Without this the
        // reader's own conversation would silently stop looking selected.
        if (activeSessionId) {
            sessionListEl.querySelectorAll('.session-item').forEach(item => {
                item.classList.toggle('active', item.dataset.sessionId === String(activeSessionId));
            });
        }
    }

    /**
     * Select and open a session, fetching its details via GET /getSession/{sessionId}
     * @param {number|string} sessionId 
     */

    /**
     * Refresh sender labels, initials and contiguous-group metadata after a profile resolves.
     *
     * Two passes, because the two decorations belong to opposite ends of a run: the sender
     * label sits on the *first* row (it introduces the group) while the avatar sits on the
     * *last* one, next to the newest message the sender actually wrote. A single forward
     * pass cannot place the avatar, because it does not yet know whether the row below
     * continues the group, so the keys are resolved first and the decorations painted
     * afterwards.
     */
    function refreshRenderedSenderGroups() {
        if (!messagesContainerEl) return;
        const rows = Array.from(messagesContainerEl.querySelectorAll('.message-row'));
        if (!rows.length) return;

        const keys = rows.map(row => {
            const senderName = row.dataset.senderName || 'User';
            const key = `${row.classList.contains('outgoing') ? 'self' : 'other'}:${senderName}`;
            // Persisted so the incremental path in createMessageRow can group against it.
            row.dataset.senderKey = key;
            return key;
        });

        rows.forEach((row, i) => {
            const senderName = row.dataset.senderName || 'User';
            const continuesPrevious = i > 0 && keys[i - 1] === keys[i];
            const continuesNext = i + 1 < rows.length && keys[i + 1] === keys[i];

            const label = row.querySelector('.message-sender');
            if (label) {
                label.textContent = senderName;
                label.classList.toggle('is-hidden', continuesPrevious);
            }
            const avatar = row.querySelector('.message-avatar');
            if (avatar) {
                // Repainted rather than overwritten: this runs after history is inserted
                // and after a sender's name resolves, and assigning textContent here would
                // replace the <img> a picture had already drawn. Re-deriving the letter
                // too keeps the fallback correct when a sender was renamed.
                const initial = senderName.trim().charAt(0).toUpperCase() || '?';
                avatar.dataset.avatarInitial = initial;
                const owner = row.dataset.senderId;
                if (owner !== undefined && cachedAvatarUrl('user', owner) !== undefined) {
                    paintAvatarElement(avatar, 'user', owner, initial);
                } else {
                    avatar.textContent = initial;
                }
                // Hidden on every row but the last of the run. The stylesheet keeps the
                // element occupying its column while hidden, so the bubbles stay aligned.
                avatar.classList.toggle('is-hidden', continuesNext);
            }
        });
    }

    /**
     * Obtain a real username for a sender currently shown as `User #<id>`.
     *
     * A sender can be missing from `activeSessionUsers` for a reason that has nothing
     * to do with the server: the roster is fetched once, when the conversation is
     * selected, so anyone who joined afterwards is unknown until the page is reloaded.
     * The profile route is therefore consulted here rather than the roster.
     *
     * The outcome is deliberately *not* cached when the request fails. A sender that
     * could not be named must stay retryable, otherwise one dropped request would pin
     * that person to their numeric placeholder for the rest of the page's lifetime.
     * Only a successful lookup is remembered, both to avoid repeat traffic and because
     * a resolved name never needs asking for again.
     */
    function resolveFallbackSender(senderId, options) {
        if (senderId === null || senderId === undefined || senderId === ''
            || !window.OxypeCore || typeof window.OxypeCore.getUser !== 'function') return;
        const id = String(senderId);
        // One in-flight request per id is enough; concurrent rows share its result.
        // Callers that are sweeping for placeholders pass `force` so that a sender whose
        // earlier lookup already came back empty is asked for again.
        if (!(options && options.force) && senderProfilePromises.has(id)) return;
        const promise = Promise.resolve()
            .then(() => window.OxypeCore.getUser(senderId))
            .then(profile => {
                const username = profile && (profile.username || profile.name);
                if (!username) {
                    console.warn(`[Chat] getUser/${senderId} returned no username`, profile);
                    return;
                }
                activeSessionUsers.set(id, username);
                repaintSenderName(id, username);
            })
            .catch(err => console.warn(`[Chat] getUser/${senderId} skipped:`, err && err.message))
            .finally(() => {
                // Only drop the entry this promise owns, so a forced retry is not
                // cancelled by the completion of the request it replaced.
                if (senderProfilePromises.get(id) === promise) senderProfilePromises.delete(id);
            });
        senderProfilePromises.set(id, promise);
    }

    /**
     * Ask for a username for every row currently showing a `User #<id>` placeholder.
     *
     * Rows can end up unnamed without their render path ever calling the resolver — a
     * message can arrive while the roster is still loading, or a lookup can fail once
     * and be forgotten. Sweeping the DOM is cheap and makes the placeholder state
     * self-healing rather than depending on each call site being reached exactly once.
     */
    function resolveRenderedPlaceholderSenders(options) {
        if (!messagesContainerEl) return;
        const ids = new Set();
        messagesContainerEl.querySelectorAll('.message-row').forEach(row => {
            const name = row.dataset.senderName || '';
            const id = row.dataset.senderId;
            if (id && /^User #\d+$/.test(name)) ids.add(id);
        });
        ids.forEach(id => resolveFallbackSender(id, options));
    }

    /**
     * Rewrite every row already on screen that belongs to one sender.
     *
     * Rows are patched in place rather than re-rendered so the transcript keeps its
     * scroll position, and any message being edited keeps its editor open.
     */
    function repaintSenderName(senderId, username) {
        const id = String(senderId);
        if (!username || !messagesContainerEl) return;
        messagesContainerEl.querySelectorAll('.message-row').forEach(row => {
            if (row.dataset.senderId === id) row.dataset.senderName = username;
        });
        refreshRenderedSenderGroups();
        // The sidebar preview is plain text ("Name: excerpt"), so the stale name has
        // to be swapped out there too or the list keeps showing the placeholder.
        if (sessionListEl) {
            const item = sessionListEl.querySelector(`[data-session-id="${activeSessionId}"]`);
            const previewEl = item ? item.querySelector('.session-last-message') : null;
            if (previewEl) {
                const stale = `User #${id}: `;
                if (previewEl.textContent.startsWith(stale)) {
                    previewEl.textContent = username + ': ' + previewEl.textContent.slice(stale.length);
                }
            }
        }
    }

    function bindWebSocketMessages() {
        if (websocketListenerBound) return;
        websocketListenerBound = true;
        window.addEventListener('oxype:websocket:message', event => {
            let payload = event && event.detail ? event.detail.data : null;
            if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (e) { return; } }
            if (!payload) return;
            // Edits and deletes are checked before the "message" guard below: they carry
            // their own types and would otherwise be dropped as unrelated traffic.
            if (payload.type === 'messageEdited') {
                handleIncomingMessageEdit(payload);
                return;
            }
            if (payload.type === 'messageDeleted') {
                handleIncomingMessageDelete(payload);
                return;
            }
            if (payload.type === 'sessionsChanged') {
                handleSessionsChanged();
                return;
            }
            if (payload.type !== 'message') return;
            const sid = payload.sessionId !== undefined ? payload.sessionId : payload.session_id;
            if (sid == null || activeSessionId == null || String(sid) !== String(activeSessionId)) return;
            if (historyLoadingSessionId === String(sid)) {
                const queued = pendingRealtimeMessages.get(String(sid)) || [];
                queued.push(payload);
                pendingRealtimeMessages.set(String(sid), queued);
                return;
            }
            const msg = payload.data || payload.message || {};
            const id = msg.id !== undefined ? msg.id : msg.seq;
            const key = String(sid) + ':' + (id !== undefined ? String(id) : JSON.stringify(msg));
            if (renderedMessageKeys.has(key)) return;
            const body = readMessageBody(msg);
            if (!body.text) return;
            const senderId = msg.sender !== undefined ? msg.sender : msg.userid;
            const uid = currentUser ? currentUser.id : null;
            const self = uid != null && senderId != null && String(uid) === String(senderId);
            // This same account signed in on another device receives the echo of a
            // message that device sent. If that row is already on screen as an
            // optimistic send still waiting to be named, the echo *is* the naming:
            // adopt it instead of appending the message a second time.
            if (self && id !== undefined && adoptOptimisticRow(body.text, id)) return;
            renderedMessageKeys.add(key);
            const sender = self ? ((currentUser && currentUser.username) || 'Me') : (activeSessionUsers.get(String(senderId)) || ('User #' + senderId));
            const stamp = Number(msg.timestamp) || Date.now();
            const hint = document.getElementById('emptyConversationHint'); if (hint) hint.remove();
            appendMessage({ text: body.text, format: body.format, sender: sender, senderId: senderId, isSelf: self, timestamp: formatClockTime(stamp), timestampMs: stamp, messageId: id, editedAt: msg.editedAt ? Number(msg.editedAt) : 0, reply: body.reply });
            if (!self && /^User #\d+$/.test(sender)) resolveFallbackSender(senderId);
            updateActiveSessionLastMessage(sender, previewOfBody(body.text), stamp);
        });

        // A push is delivered once, to whatever connection is open at that moment. Any
        // change that happens while this tab is disconnected -- a dropped network, a
        // sleeping laptop, or a server restart, which ends every open socket -- is
        // therefore lost outright, and the sidebar keeps showing yesterday's list until
        // the page is reloaded by hand. The server reports the revision of this
        // account's list in the `ready` frame, so the reconnect itself says whether
        // anything happened in the gap: same revision means no reload, a different one
        // means something was missed. Only the roster is refreshed, so a reconnect does
        // not yank the reader out of the transcript they were reading.
        window.addEventListener('oxype:websocket:ready', (event) => {
            const message = event && event.detail ? event.detail.message : null;
            const revision = message && typeof message === 'object' ? message.revision : null;
            if (revision === null || revision === undefined) {
                // A server that predates the field cannot say, so the reload happens
                // unconditionally as it always did.
                handleSessionsChanged();
                return;
            }
            noteSessionsRevision(revision);
        });

        // The heartbeat already makes a round trip every twenty seconds, and the pong
        // carries the same revision, so a connection that stayed open the whole time
        // also catches a push it missed -- send() is a no-op while the socket is
        // authenticating again after a token refresh, and there is a window during the
        // handshake when the user id is not set yet, so checking only on reconnect
        // would leave those tabs stale until the page was reloaded.
        window.addEventListener('oxype:websocket:revision', (event) => {
            const detail = event ? event.detail : null;
            if (!detail) return;
            noteSessionsRevision(detail.revision);
        });
    }

    async function selectSession(sessionId) {
        if (window.OxypeWebSocket && window.OxypeWebSocket.subscribe) window.OxypeWebSocket.subscribe(sessionId);
        // The menu and any open editor belong to the conversation being left, so they
        // are dropped before the message list is rebuilt.
        closeMessageMenu();
        if (editingRow) endMessageEdit(editingRow);
        // A reply quotes a message of the conversation being left, so it cannot
        // survive into the next one.
        clearReplyTarget();
        cancelReplySwipe();
        // Choosing a conversation is the navigation that ends a visit to the list, so
        // the mobile drawer closes behind it and reveals the transcript.
        setSidebarOpen(false);
        renderedMessageKeys.clear();
        activeSessionId = String(sessionId);
        historyLoadingSessionId = activeSessionId;

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
        // Paging restarts with the conversation. Nothing older has been asked for, and
        // the window fetched below is the only part of this transcript that is known to
        // exist on screen, so the cursor is deliberately left empty until it arrives.
        historyOldestSeq = null;
        historyReachedTop = false;
        historyPageInFlight = false;
        historyEmptyPageStreak = 0;

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

            // The transcript opens on the *newest* messages, not on the read marker.
            //
            // Anchoring the window on the marker hid two separate things behind one
            // symptom. A reader with unread messages never saw them, because the window
            // stopped at the marker; and once the marker was low enough the window's
            // start collapsed onto sequence 0, which made `historyReachedTop` true on
            // first render, so scrolling up could never page anything in. The marker is
            // still read (and still advances server-side), but it no longer decides what
            // the first window contains.
            //
            // `lastMessage` reports the newest *surviving* sequence, which is what the
            // transcript's bottom edge should be; it walks backwards past any deleted
            // tail rather than trusting the high-water mark.
            let newestSeq = currentSeq;
            try {
                const lastMsg = await window.OxypeCore.getLastMessage(sessionId, userId);
                const lastId = (lastMsg && lastMsg.hasMessage) ? Number(lastMsg.id) : 0;
                if (Number.isFinite(lastId) && lastId > newestSeq) {
                    newestSeq = lastId;
                }
            } catch (e) {
                console.warn(`[Chat] lastMessage/${sessionId} skipped while anchoring history:`, e.message);
            }

            // A page's worth of history ending at the newest message. Anything older is
            // fetched by `loadOlderMessages` once the reader scrolls to the oldest row.
            const end = newestSeq > 0 ? newestSeq : 0;
            const start = Math.max(0, end - HISTORY_PAGE_SIZE);

            const messages = await window.OxypeCore.getMessages(sessionId, start, end, userId);

            if (Array.isArray(messages) && messages.length > 0) {
                messagesContainerEl.innerHTML = '';
                lastRenderedDateKey = '';
                appendHistoryBatch(messages);
            } else {
                showEmptyConversationHint();
            }

            // Paging counts back from the oldest sequence ever *requested*, not from the
            // oldest message drawn: records carry no sequence of their own and a range
            // can be partly deleted, so the request boundary is the only reliable mark.
            historyOldestSeq = start;
            historyReachedTop = start <= 1;
            historyEmptyPageStreak = 0;
        } catch (err) {
            console.warn('[Chat] Failed to load messages history:', err);
            showEmptyConversationHint();
        }

        historyLoadingSessionId = null;
        const queued = pendingRealtimeMessages.get(activeSessionId) || [];
        pendingRealtimeMessages.delete(activeSessionId);
        queued.forEach(event => window.dispatchEvent(new CustomEvent('oxype:websocket:message', { detail: event })));

        // Anything still showing a numeric placeholder gets one authoritative lookup now
        // that the transcript has stopped growing, so a name missed by the render loop
        // or by a replayed realtime event is corrected instead of being left behind.
        resolveRenderedPlaceholderSenders();

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
        // Two different situations share this splash: no conversation has been
        // chosen yet, and a chosen conversation has nothing in it. Telling them apart
        // matters because only the first is something the user can act on.
        emptyHint.innerHTML = `
            <div class="empty-chat-splash-icon">
                <svg class="icon-svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            <div class="empty-chat-splash-desc">${escapeHtml(activeSessionId
                ? getI18nText('chat.emptyConversation', 'No messages in this conversation yet.')
                : getI18nText('chat.selectSessionHint', 'Select a conversation from the sidebar'))}</div>
        `;
        messagesContainerEl.appendChild(emptyHint);
    }

    /**
     * Reads the remembered body format, falling back to plain text.
     * @returns {'text'|'markdown'}
     */
    function readStoredMessageFormat() {
        try {
            const stored = window.localStorage ? window.localStorage.getItem(MESSAGE_FORMAT_STORAGE_KEY) : null;
            if (stored && MESSAGE_FORMATS.indexOf(stored) !== -1) {
                return stored;
            }
        } catch (e) {
            // Storage can be unavailable; plain text is a safe default.
        }
        return 'text';
    }

    /**
     * Remembers the chosen body format for the next visit.
     *
     * The local copy is written first so a switch is instant; the account is updated
     * afterwards and a failure there does not undo what the user asked for.
     * @param {string} format
     */
    function writeStoredMessageFormat(format) {
        try {
            if (window.localStorage && MESSAGE_FORMATS.indexOf(format) !== -1) {
                window.localStorage.setItem(MESSAGE_FORMAT_STORAGE_KEY, format);
            }
        } catch (e) {
            // Persisting the preference is a convenience, never a hard requirement.
        }
        if (window.OxypeSettings && MESSAGE_FORMATS.indexOf(format) !== -1) {
            window.OxypeSettings.push({ inputFormat: format });
        }
    }

    /**
     * The body format currently selected in Settings.
     *
     * The choice lives in storage alone; that also keeps the answer correct when a
     * user-supplied chat.html omits the control.
     * @returns {'text'|'markdown'}
     */
    function getSelectedMessageFormat() {
        return readStoredMessageFormat();
    }

    /** The short label for a format, shown on its option button. */
    function formatShortLabel(format) {
        return format === 'markdown'
            ? getI18nText('chat.formatMarkdown', 'M')
            : getI18nText('chat.formatText', 'T');
    }

    /** The full name for a format, used in the accessible names and the toast. */
    function formatLongLabel(format) {
        return format === 'markdown'
            ? getI18nText('chat.formatMarkdownLong', 'Markdown')
            : getI18nText('chat.formatTextLong', 'Plain text');
    }

    /**
     * Repaints the two option buttons from the stored format.
     *
     * The letters are written here rather than by data-i18n, and the buttons
     * deliberately carry no data-i18n attribute on their label: OxypeI18n.updateDom
     * overwrites the text of any such node with the dictionary value, which would pin
     * it to one letter. The group is a radio group, so the state lives in aria-checked
     * and the highlight is styled from it, keeping one source of truth.
     */
    function paintMessageFormatTrigger() {
        if (!messageFormatOptionsEl) return;
        const selected = getSelectedMessageFormat();
        Array.prototype.forEach.call(
            messageFormatOptionsEl.querySelectorAll('.segmented-option'),
            (option) => {
                const format = option.dataset.format;
                option.textContent = formatShortLabel(format);
                option.setAttribute('aria-checked', format === selected ? 'true' : 'false');
            }
        );
        // The group's own name says what the choice means, so it is refreshed with the
        // labels; the per-option names come from data-i18n-title.
        const label = getI18nText('chat.formatLabelLong', 'Message format (T = plain text, M = Markdown)');
        messageFormatOptionsEl.setAttribute('aria-label', label);
        messageFormatOptionsEl.setAttribute('title', label);
    }

    /**
     * Adopts a body format for the next message.
     *
     * The toast names the format in full, because the option button it was chosen from
     * shows only a letter, and the confirmation is the one place the choice is spelled
     * out.
     * @param {string} format
     */
    function applyMessageFormat(format) {
        if (MESSAGE_FORMATS.indexOf(format) === -1) return;
        writeStoredMessageFormat(format);
        paintMessageFormatTrigger();
        updateComposerForFormat();
        if (window.OxypeStyle && typeof window.OxypeStyle.showToast === 'function') {
            window.OxypeStyle.showToast(formatLongLabel(format), 'success');
        }
    }

    /**
     * Reflects the selected format in the composer placeholder.
     *
     * The placeholder no longer advertises Markdown syntax, so it is the same in
     * both modes; only the styling hook still depends on the format.
     */
    function updateComposerForFormat() {
        if (!messageInputEl) return;
        const isMarkdown = getSelectedMessageFormat() === 'markdown';
        messageInputEl.setAttribute('placeholder', getI18nText('chat.inputPlaceholder', 'Type a message...'));
        messageInputEl.classList.toggle('composer-input-markdown', isMarkdown);
    }

    /**
     * Sizes the composer textarea to its content.
     *
     * The height is reset first so the box shrinks when text is removed; measuring the
     * content directly would leave it stuck at the tallest value it ever held.
     */
    function autoGrowComposer() {
        if (!messageInputEl || messageInputEl.tagName !== 'TEXTAREA') return;

        // Read the resting row height the stylesheet asks for, then let the box shrink
        // to its content so scrollHeight reports the text rather than the box.
        messageInputEl.style.height = '';
        const rest = messageInputEl.getBoundingClientRect().height;
        messageInputEl.style.height = 'auto';

        // scrollHeight covers the content plus padding but never the border, while
        // box-sizing: border-box makes the height include it. Adding the vertical
        // borders keeps the grown box an exact fit instead of 2px short, which would
        // otherwise show a scrollbar and make the box drift off its resting height.
        const content = messageInputEl.scrollHeight + composerBorders(messageInputEl);
        // scrollHeight is rounded to whole pixels, so allow a little slack before
        // deciding the text needs more room than one row. Within one row the resting
        // height is kept exactly, which is what keeps the two controls aligned.
        const next = content <= rest + 1 ? rest : Math.min(content, COMPOSER_MAX_HEIGHT);

        messageInputEl.style.height = `${next}px`;
        messageInputEl.style.overflowY = content > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden';
    }

    /** Sum of an element's vertical border widths, in pixels. */
    function composerBorders(el) {
        const style = window.getComputedStyle(el);
        return (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    }

    /**
     * Turns a message's pieces into what should be displayed.
     *
     * A body is Markdown only when the message says so, so a plain-text message is
     * never reinterpreted as markup. The raw source is returned alongside the render
     * mode because the caller needs `text` for the sidebar preview and plain-text
     * bodies regardless of how they will be drawn.
     *
     * @param {Object} msg - message as returned by the server
     * @returns {{text: string, format: 'text'|'markdown', reply: Object|null}}
     */
    function readMessageBody(msg) {
        const pieces = Array.isArray(msg && msg.pieces) ? msg.pieces : null;
        if (pieces) {
            // A markdown piece wins if a message somehow carries both, so a body can
            // never be silently downgraded to literal text.
            const markdown = pieces.filter(p => p && p.type === 'markdown');
            const source = (markdown.length > 0 ? markdown : pieces.filter(p => p && p.type === 'text'))
                .map(p => (typeof p.text === 'string' ? p.text : ''))
                .join('');
            return {
                text: source,
                format: markdown.length > 0 ? 'markdown' : 'text',
                // The quotation is carried by the message, not derived from it, and it is
                // reported beside the body rather than inside it: it is context for the
                // words, not part of them. Anything that only wants the words (a sidebar
                // preview, the in-place editor's seed text) therefore gets them alone.
                reply: readReplyPiece(pieces)
            };
        }
        if (typeof msg.pieces === 'string') {
            return { text: msg.pieces, format: 'text', reply: null };
        }
        if (typeof msg.text === 'string') {
            return { text: msg.text, format: 'text', reply: null };
        }
        return { text: '', format: 'text', reply: null };
    }

    /**
     * Reads the quotation out of a reply's pieces.
     *
     * The server fills in the quoted sender and text when the reply is written, so
     * they are already here and no lookup is needed to draw the quotation. A reply
     * whose quotation is missing is treated as no quotation rather than as an error:
     * the body still says something worth showing.
     *
     * @param {Array<Object>} pieces
     * @returns {{messageId: string, sender: string, senderName: string, text: string}|null}
     */
    function readReplyPiece(pieces) {
        const piece = pieces.find(p => p && p.type === 'reply');
        if (!piece) return null;
        const quotedId = piece.messageId !== undefined && piece.messageId !== null ? String(piece.messageId) : '';
        if (!quotedId) return null;
        return {
            messageId: quotedId,
            sender: piece.sender !== undefined && piece.sender !== null ? String(piece.sender) : '',
            senderName: typeof piece.senderName === 'string' && piece.senderName ? piece.senderName : '',
            text: typeof piece.text === 'string' ? piece.text : ''
        };
    }

    /**
     * Renders a message body to HTML.
     *
     * Plain text is escaped and its newlines preserved. Markdown goes through the
     * bundled renderer, which escapes before it parses and only emits whitelisted
     * tags. If the renderer is missing, the source is shown as escaped text rather
     * than trusted.
     *
     * @param {string} text
     * @param {'text'|'markdown'} format
     * @returns {string}
     */
    function renderMessageBody(text, format) {
        if (format === 'markdown' && window.OxypeMarkdown
            && typeof window.OxypeMarkdown.toHtml === 'function') {
            return window.OxypeMarkdown.toHtml(text);
        }
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    /**
     * A one-line preview of a body for the sidebar, with its markup flattened.
     * @param {string} text
     * @returns {string}
     */
    function previewOfBody(text) {
        return String(text === null || text === undefined ? '' : text)
            .replace(/[\r\n]+/g, ' ')
            .trim();
    }

    /* --------------------------------------------------------------- *
     * Replying: quoting a message, and jumping back to it.            *
     * --------------------------------------------------------------- */

    /**
     * Renders the quotation block above a reply's body.
     *
     * The block is a button, not a div, because its whole purpose is to be pressed:
     * that makes it keyboard-reachable and announces it as something that acts.
     * Absent a quotation (not a reply at all) it emits nothing, so a plain message's
     * markup is unchanged.
     *
     * @param {{messageId: string, senderName: string, text: string}|null} reply
     * @returns {string} HTML, already escaped
     */
    function renderReplyQuote(reply) {
        if (!reply || !reply.messageId) return '';
        const name = reply.senderName || getI18nText('chat.replyQuoteUnknownSender', 'a message');
        const body = previewOfBody(reply.text);
        // The body is clipped by CSS rather than truncated here, so the full text is
        // still in the markup for a screen reader and for a future expand-on-click.
        return `<button type="button" class="message-reply-quote" data-reply-to="${escapeHtml(reply.messageId)}"`
            + ` title="${escapeHtml(getI18nText('chat.replyJumpTitle', 'Jump to the quoted message'))}">`
            + `<span class="message-reply-quote-name">${escapeHtml(name)}</span>`
            + `<span class="message-reply-quote-text">${escapeHtml(body)}</span>`
            + `</button>`;
    }

    /**
     * Whether the transcript currently holds the row for a message id.
     * @param {string} messageId
     * @returns {boolean}
     */
    function hasMessageRow(messageId) {
        return findMessageRow(messageId) !== null;
    }

    /**
     * Scrolls a row into view and flashes it, so the eye can find it.
     *
     * The flash is a class with a CSS animation; it is removed when the animation
     * ends rather than on a timer, so a row that is re-rendered mid-flash cannot be
     * left permanently highlighted.
     * @param {HTMLElement} row
     */
    function revealMessageRow(row) {
        if (!row) return;
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        row.classList.remove('is-reply-target');
        // Reading offsetWidth forces a style recalculation, which restarts the
        // animation when the same row is jumped to twice in a row.
        void row.offsetWidth;
        row.classList.add('is-reply-target');
        const clear = () => {
            row.classList.remove('is-reply-target');
            row.removeEventListener('animationend', clear);
        };
        row.addEventListener('animationend', clear);
    }

    /**
     * Brings the quoted message on screen, paging history in if it is not loaded yet.
     *
     * A quotation can point arbitrarily far back, and only the newest window of the
     * transcript is in the DOM, so a jump that simply gave up when the row was absent
     * would fail for exactly the messages a reply is most likely to quote. Paging is
     * driven by the same loop the scroll handler uses, and stops as soon as the row
     * appears or the top of the conversation is reached.
     *
     * @param {string} messageId
     * @returns {Promise<boolean>} whether the row was found and revealed
     */
    async function jumpToMessage(messageId) {
        if (!messageId) return false;
        const existing = findMessageRow(messageId);
        if (existing) {
            revealMessageRow(existing);
            return true;
        }

        const sessionId = activeSessionId;
        for (let page = 0; page < REPLY_JUMP_MAX_PAGES; page += 1) {
            if (historyReachedTop || historyOldestSeq === null) break;
            // A page already in flight would make loadOlderMessages return at once
            // without loading anything, so wait for it to settle first; otherwise the
            // loop would spend its whole budget on a single real request.
            if (historyPageInFlight) {
                await new Promise(resolve => window.setTimeout(resolve, 50));
                if (activeSessionId !== sessionId) return false;
                page -= 1;
                continue;
            }
            await loadOlderMessages();
            // The conversation can be switched from under the jump.
            if (activeSessionId !== sessionId) return false;
            const found = findMessageRow(messageId);
            if (found) {
                // The page lands above the viewport, so the jump is what makes it
                // visible; without this the reader would be left where they were.
                revealMessageRow(found);
                return true;
            }
        }
        return false;
    }

    /**
     * Handles a click on a quotation block.
     * @param {MouseEvent} e
     */
    async function handleReplyQuoteClick(e) {
        const quote = e.target && e.target.closest ? e.target.closest('.message-reply-quote') : null;
        if (!quote || !messagesContainerEl || !messagesContainerEl.contains(quote)) return;
        e.preventDefault();
        e.stopPropagation();
        const messageId = quote.dataset.replyTo;
        if (!messageId) return;
        const found = await jumpToMessage(messageId);
        if (!found && window.OxypeStyle) {
            window.OxypeStyle.showToast(
                getI18nText('chat.replyJumpFailed', 'That message is no longer reachable.'),
                'error'
            );
        }
    }

    /**
     * Builds the bar above the composer that announces the pending reply.
     *
     * It is one element reused across replies, styled by both skins, and hidden by
     * default so a page that never replies is laid out exactly as before.
     * @returns {HTMLElement}
     */
    function ensureReplyBar() {
        if (replyBarEl) return replyBarEl;

        const bar = document.createElement('div');
        bar.className = 'reply-bar';
        bar.style.display = 'none';

        const text = document.createElement('div');
        text.className = 'reply-bar-text';

        const label = document.createElement('span');
        label.className = 'reply-bar-label';

        const preview = document.createElement('span');
        preview.className = 'reply-bar-preview';

        text.appendChild(label);
        text.appendChild(preview);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'reply-bar-cancel';
        // A glyph rather than a word: the bar sits above the composer and a translated
        // "Cancel reply" next to every draft would take more room than the draft.
        cancelBtn.textContent = '\u00d7';
        cancelBtn.setAttribute('aria-label', getI18nText('chat.replyBarCancel', 'Cancel reply'));
        cancelBtn.title = getI18nText('chat.replyBarCancel', 'Cancel reply');
        cancelBtn.addEventListener('click', () => clearReplyTarget());

        bar.appendChild(text);
        bar.appendChild(cancelBtn);

        // Placed inside the composer's own stack, directly above the input row. The
        // composer is the element that owns "what the next send will be", so the bar
        // belongs to it rather than floating over the transcript.
        const composer = document.getElementById('chatComposer');
        const anchor = composer || (messageInputEl ? messageInputEl.parentNode : null);
        if (anchor && anchor.parentNode) {
            anchor.parentNode.insertBefore(bar, anchor);
        } else {
            document.body.appendChild(bar);
        }

        replyBarEl = bar;
        return bar;
    }

    /**
     * Starts replying to a message, i.e. arms the composer with a quotation.
     * @param {HTMLElement} row
     */
    function startReplyToMessage(row) {
        if (!row || !row.dataset.messageId) return;
        // What is quoted is the message the reader pointed at — its own words, and its
        // own author. Replying to a reply therefore quotes that reply, not the message
        // it in turn quoted; the nested quotation is context for a different claim.
        const body = row.oxypeMessage && typeof row.oxypeMessage.text === 'string'
            ? row.oxypeMessage.text
            : '';
        replyTarget = {
            messageId: String(row.dataset.messageId),
            senderName: row.dataset.senderName || '',
            text: body
        };

        const bar = ensureReplyBar();
        const labelEl = bar.querySelector('.reply-bar-label');
        const previewEl = bar.querySelector('.reply-bar-preview');
        const name = replyTarget.senderName || getI18nText('chat.replyQuoteUnknownSender', 'a message');
        if (labelEl) {
            labelEl.textContent = getI18nText('chat.replyBarLabel', `Replying to ${name}`, { name: name });
        }
        if (previewEl) {
            previewEl.textContent = previewOfBody(body).slice(0, 140);
        }
        bar.style.display = '';
        // The next thing the user does is type, so the caret goes where they were
        // about to look anyway. Deferred: the bar's own layout has just changed and
        // focusing mid-frame would scroll the new element into view instead.
        if (messageInputEl) {
            window.requestAnimationFrame(() => {
                messageInputEl.focus();
                autoGrowComposer();
            });
        }
    }

    /** Drops the pending reply and hides the bar, leaving the typed draft alone. */
    function clearReplyTarget() {
        replyTarget = null;
        if (replyBarEl) replyBarEl.style.display = 'none';
    }

    /* --------------------------------------------------------------- *
     * Message actions: right-click menu, in-place editing, deletion.  *
     * --------------------------------------------------------------- */

    /**
     * Whether the current viewer wrote this message.
     * @param {HTMLElement} row
     * @returns {boolean}
     */
    function isOwnMessage(row) {
        if (!row) return false;
        const myId = currentUser && currentUser.id !== undefined && currentUser.id !== null
            ? String(currentUser.id)
            : null;
        return myId !== null && row.dataset.senderId === myId;
    }

    /**
     * Whether the current viewer moderates this session.
     *
     * The server treats the owner as an administrator, so `isOwner` is folded in
     * here rather than tested by each caller.
     * @returns {boolean}
     */
    function canModerate() {
        const info = activeSessionInfo || {};
        return !!(info.isOwner || info.isAdmin);
    }

    /**
     * Whether the current viewer may rewrite this message.
     *
     * Only its author may. Moderation removes messages (see [canDeleteMessage])
     * rather than putting words in another member's mouth, and the server enforces
     * exactly that split.
     * @param {HTMLElement} row
     * @returns {boolean}
     */
    function canEditMessage(row) {
        return isOwnMessage(row);
    }

    /**
     * Whether the current viewer may remove this message.
     *
     * The author may retract their own, and a moderator may remove anyone's.
     * The menu is suppressed instead of shown and then refused: offering an
     * action whose only possible outcome is an error is worse than not offering
     * it at all.
     * @param {HTMLElement} row
     * @returns {boolean}
     */
    function canDeleteMessage(row) {
        return isOwnMessage(row) || canModerate();
    }

    /**
     * Whether the viewer may act on this message at all, i.e. edit or delete it.
     * @param {HTMLElement} row
     * @returns {boolean}
     */
    function canModifyMessage(row) {
        return canEditMessage(row) || canDeleteMessage(row);
    }

    /**
     * Whether this row is something the viewer can reply to.
     *
     * Nearly every message is: the only requirement is a server id to quote. Replying
     * is deliberately not tied to authorship or moderation — it is how a conversation
     * is conducted, not an action taken on someone's message.
     * @param {HTMLElement} row
     * @returns {boolean}
     */
    function canReplyToMessage(row) {
        return !!(row && row.dataset.messageId);
    }

    /**
     * Whether the action menu should open for this row at all.
     * @param {HTMLElement} row
     * @returns {boolean}
     */
    function canOpenMessageMenu(row) {
        return canModifyMessage(row) || canReplyToMessage(row);
    }

    /** Builds the shared menu once; later right-clicks only relabel it and move it. */
    function ensureMessageMenu() {
        if (messageMenuEl) return messageMenuEl;

        const menu = document.createElement('div');
        menu.className = 'message-menu';
        menu.setAttribute('role', 'menu');
        menu.style.display = 'none';

        const replyBtn = document.createElement('button');
        replyBtn.type = 'button';
        replyBtn.className = 'message-menu-item';
        replyBtn.dataset.action = 'reply';
        replyBtn.setAttribute('role', 'menuitem');

        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'message-menu-item';
        editBtn.dataset.action = 'edit';
        editBtn.setAttribute('role', 'menuitem');

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'message-menu-item message-menu-danger';
        deleteBtn.dataset.action = 'delete';
        deleteBtn.setAttribute('role', 'menuitem');

        // Reply leads: it is the only entry available on every message, so the menu
        // has a stable first item instead of the list starting with whichever action
        // this viewer happens to have on this row.
        menu.appendChild(replyBtn);
        menu.appendChild(editBtn);
        menu.appendChild(deleteBtn);
        // A click inside the menu acts on the row it was opened for. The document-level
        // dismisser below ignores clicks that land in here, so this is the only path.
        menu.addEventListener('click', (e) => {
            const item = e.target && e.target.closest ? e.target.closest('.message-menu-item') : null;
            if (!item) return;
            const row = messageMenuTargetRow;
            closeMessageMenu();
            if (!row) return;
            if (item.dataset.action === 'reply') startReplyToMessage(row);
            else if (item.dataset.action === 'edit') startMessageEdit(row);
            else if (item.dataset.action === 'delete') handleDeleteMessage(row);
        });

        document.body.appendChild(menu);
        messageMenuEl = menu;
        return menu;
    }

    /**
     * Opens the action menu for a row at the pointer.
     * @param {HTMLElement} row
     * @param {number} x viewport coordinate of the right-click
     * @param {number} y viewport coordinate of the right-click
     */
    function openMessageMenu(row, x, y) {
        const menu = ensureMessageMenu();
        messageMenuTargetRow = row;

        // Labels are looked up on every open, so a language change made while the menu
        // was closed is reflected the next time it appears.
        const replyBtn = menu.querySelector('[data-action="reply"]');
        const editBtn = menu.querySelector('[data-action="edit"]');
        const deleteBtn = menu.querySelector('[data-action="delete"]');
        if (replyBtn) replyBtn.textContent = getI18nText('chat.replyBtn', 'Reply');
        if (editBtn) editBtn.textContent = getI18nText('chat.messageEditBtn', 'Edit');
        if (deleteBtn) deleteBtn.textContent = getI18nText('chat.messageDeleteBtn', 'Delete');

        // Reply is offered on every message, including one this viewer may neither
        // rewrite nor retract, so it is shown on its own terms rather than as part of
        // the moderation split below.
        if (replyBtn) replyBtn.style.display = canReplyToMessage(row) ? '' : 'none';
        // Editing is the author's alone, so a moderator looking at someone else's
        // message gets only the delete entry. A menu of one entry still opens: the
        // empty menu is never shown for a row this viewer may not touch at all,
        // because the callers gate on canOpenMessageMenu first.
        if (editBtn) editBtn.style.display = canEditMessage(row) ? '' : 'none';
        if (deleteBtn) deleteBtn.style.display = canDeleteMessage(row) ? '' : 'none';

        // Shown before measuring: a hidden element reports a zero rect, and the clamp
        // below needs the real size to keep the menu inside the viewport.
        menu.style.display = 'block';
        menu.style.left = '0px';
        menu.style.top = '0px';
        const rect = menu.getBoundingClientRect();
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
        menu.style.left = `${Math.min(Math.max(margin, x), maxLeft)}px`;
        menu.style.top = `${Math.min(Math.max(margin, y), maxTop)}px`;
    }

    /** Hides the menu and forgets the row it pointed at. */
    function closeMessageMenu() {
        if (messageMenuEl) messageMenuEl.style.display = 'none';
        messageMenuTargetRow = null;
    }

    /**
     * Right-click handler for the message list.
     *
     * The row carries the server id only once it is known (history and inbound messages
     * always, the sender's own message after the send is acknowledged), so a row without
     * one has nothing to address and the browser's own menu is left alone.
     * @param {MouseEvent} e
     */
    function handleMessageContextMenu(e) {
        if (!messagesContainerEl) return;
        const row = e.target && e.target.closest ? e.target.closest('.message-row') : null;
        if (!row || !messagesContainerEl.contains(row)) return;
        if (!row.dataset.messageId) return;
        // Replying is open to every message, so the menu is no longer limited to rows
        // this viewer may edit or delete; those entries hide themselves instead.
        if (!canOpenMessageMenu(row)) return;
        e.preventDefault();
        if (editingRow === row) return;
        // Chrome on Android already reports a long press as a context menu, so the
        // touch timer that mirrors it on iOS has to stand down or the menu is opened
        // twice for one press.
        cancelLongPress();
        cancelReplySwipe();
        openMessageMenu(row, e.clientX, e.clientY);
    }

    /**
     * Double-click handler for the message list: replies to the row under the pointer.
     *
     * The desktop counterpart of the touch swipe. It is gated on the row being one
     * that can be replied to, and it stands down while a row is being edited, where a
     * double click is a word selection.
     *
     * Note what it does *not* test: whether text is selected. By the time this event
     * arrives the browser has already selected the word under the pointer, so such a
     * test can never pass. Text is selected by dragging, and a drag fires no double
     * click at all, so the two gestures cannot be confused.
     * @param {MouseEvent} e
     */
    function handleMessageDoubleClick(e) {
        if (!messagesContainerEl) return;
        const row = e.target && e.target.closest ? e.target.closest('.message-row') : null;
        if (!row || !messagesContainerEl.contains(row)) return;
        if (editingRow === row) return;
        // A double click on the quotation is a jump, not a reply: the quote's own
        // click handler has already claimed it.
        if (e.target && e.target.closest && e.target.closest('.message-reply-quote')) return;
        if (!canReplyToMessage(row)) return;
        // A double click always ends with the word under the pointer selected, and
        // that selection is committed during the second press -- before this event
        // fires. Testing the selection here would therefore always see text and
        // always stand down, which is what kept the gesture from ever working.
        // Dragging is the deliberate way to select text, and a drag never produces a
        // double click, so nothing is lost by taking the event at face value.
        e.preventDefault();
        // The reply bar is what the gesture is meant to show, so the word the browser
        // just picked out is cleared rather than left highlighted behind it.
        const selection = window.getSelection ? window.getSelection() : null;
        if (selection && !selection.isCollapsed && typeof selection.removeAllRanges === 'function') {
            selection.removeAllRanges();
        }
        startReplyToMessage(row);
    }

    /**
     * Starts the long-press timer on a message row, and arms the reply swipe.
     *
     * A touch screen has no right button, so the same menu is raised by holding a
     * finger down. The press only counts if the finger stays roughly still: a scroll
     * begins with a touch too, and opening a menu in the middle of one would be wrong.
     *
     * The same touch may instead become a leftward swipe, and which one it is cannot
     * be known until the finger has moved. Both are therefore armed here and the
     * first one to pass its threshold claims the gesture: [handleMessageTouchMove]
     * cancels the press the moment the finger travels, and the swipe cancels itself
     * if the finger goes down rather than sideways.
     * @param {TouchEvent} e
     */
    function handleMessageTouchStart(e) {
        if (!messagesContainerEl) return;
        if (!e.touches || e.touches.length !== 1) return;
        const row = e.target && e.target.closest ? e.target.closest('.message-row') : null;
        if (!row || !messagesContainerEl.contains(row)) return;
        cancelLongPress();
        cancelReplySwipe();
        const touch = e.touches[0];
        longPressStart = { x: touch.clientX, y: touch.clientY, row, x2: touch.clientX };
        longPressTimer = window.setTimeout(() => {
            longPressTimer = null;
            const start = longPressStart;
            longPressStart = null;
            if (!start) return;
            // The guards are re-checked here because the row may have been re-rendered
            // or had its id removed during the press.
            if (!start.row.isConnected || !start.row.dataset.messageId) return;
            if (!canOpenMessageMenu(start.row)) return;
            if (editingRow === start.row) return;
            // A press that has become a swipe has already been claimed by it.
            if (swipeState) return;
            openMessageMenu(start.row, start.x2, start.y);
        }, LONG_PRESS_MS);

        if (row.dataset.messageId) {
            swipeState = {
                row,
                startX: touch.clientX,
                startY: touch.clientY,
                axis: null,
                offset: 0
            };
        }
    }

    /** Abandons a pending long press, e.g. because the finger moved or lifted. */
    function cancelLongPress() {
        if (longPressTimer !== null) {
            window.clearTimeout(longPressTimer);
            longPressTimer = null;
        }
        longPressStart = null;
    }

    /**
     * Tracks finger movement while it is down, and cancels the press once it travels
     * further than a finger wobbles on the same spot.
     *
     * The same movement is what may turn the touch into a reply swipe: travelling
     * mostly sideways is a swipe, travelling mostly vertically is a scroll, and the
     * direction is decided once and then held so a gesture cannot flip between the
     * two halfway through.
     * @param {TouchEvent} e
     */
    function handleMessageTouchMove(e) {
        if (!e.touches || e.touches.length !== 1) {
            cancelLongPress();
            cancelReplySwipe();
            return;
        }
        const touch = e.touches[0];

        if (swipeState) {
            const dx = touch.clientX - swipeState.startX;
            const dy = touch.clientY - swipeState.startY;
            if (swipeState.axis === null) {
                if (Math.abs(dx) < LONG_PRESS_SLOP && Math.abs(dy) < LONG_PRESS_SLOP) return;
                const horizontal = Math.abs(dx) > Math.abs(dy) * REPLY_SWIPE_AXIS_RATIO;
                // A swipe only ever pulls to the left, so rightward travel is a scroll
                // in disguise and is left to the transcript.
                swipeState.axis = (horizontal && dx < 0) ? 'x' : 'y';
                if (swipeState.axis === 'y') {
                    cancelReplySwipe();
                } else {
                    // The gesture is a swipe now, so the press that was racing it
                    // must not also fire.
                    cancelLongPress();
                    swipeState.row.classList.add('is-swipe-armed');
                }
            }
            if (swipeState && swipeState.axis === 'x') {
                // Damped past the trigger point so the row stops following the finger
                // once the gesture has already succeeded, which reads as a limit.
                const pulled = Math.min(Math.abs(dx), REPLY_SWIPE_MAX_PX);
                swipeState.offset = pulled;
                swipeState.row.style.setProperty('--reply-swipe-offset', `${pulled}px`);
                swipeState.row.classList.toggle('is-swipe-ready', pulled >= REPLY_SWIPE_TRIGGER_PX);
            }
            return;
        }

        if (!longPressStart) return;
        // Remember where the finger is, so a menu that fires later still appears under
        // it rather than where the press began.
        longPressStart.x2 = touch.clientX;
        const dx = touch.clientX - longPressStart.x;
        const dy = touch.clientY - longPressStart.y;
        if (Math.hypot(dx, dy) > LONG_PRESS_SLOP) cancelLongPress();
    }

    /**
     * Ends a swipe: replies if it passed the trigger distance, and resets the row.
     * @param {TouchEvent} [e]
     */
    function handleMessageTouchEnd(e) {
        cancelLongPress();
        const state = swipeState;
        if (!state) return;
        const pulled = state.offset;
        const armed = state.axis === 'x' && pulled >= REPLY_SWIPE_TRIGGER_PX;
        cancelReplySwipe();
        if (!armed) return;
        if (editingRow === state.row) return;
        if (!canReplyToMessage(state.row)) return;
        // The swipe is answered with haptics where they exist, so the gesture is
        // confirmed without the screen having to be looked at.
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        startReplyToMessage(state.row);
    }

    /** Drops any swipe in progress and puts the row back where it belongs. */
    function cancelReplySwipe() {
        const state = swipeState;
        swipeState = null;
        if (!state || !state.row) return;
        state.row.classList.remove('is-swipe-armed', 'is-swipe-ready');
        state.row.style.removeProperty('--reply-swipe-offset');
    }

    /**
     * Finds the row for a server message id, if it is on screen.
     * @param {number|string} messageId
     * @returns {HTMLElement|null}
     */
    function findMessageRow(messageId) {
        if (!messagesContainerEl || messageId === undefined || messageId === null) return null;
        return messagesContainerEl.querySelector(`.message-row[data-message-id="${String(messageId)}"]`);
    }

    /**
     * Gives a server id to the optimistic row that this echo corresponds to.
     *
     * A message sent from another device signed in to the same account arrives
     * here as a broadcast of our own message. The optimistic row on this screen
     * has no id yet — the HTTP response that names it may still be in flight — so
     * id-based de-duplication cannot see it. Matching on the exact body of an
     * unidentified outgoing row is the only thing that ties the two together, and
     * it keeps the transcript free of a duplicate pair.
     *
     * The oldest match wins. Echoes arrive in the order the server numbered the
     * messages, and unidentified rows sit in the order they were typed, so pairing
     * them up in the same order keeps two identical texts ("ok", "ok") from being
     * crossed over onto each other's ids.
     *
     * @param {string} text raw message source
     * @param {number|string} messageId server id carried by the broadcast
     * @returns {boolean} true when a row was adopted, i.e. nothing must be appended
     */
    function adoptOptimisticRow(text, messageId) {
        if (!messagesContainerEl) return false;
        const rows = messagesContainerEl.querySelectorAll('.message-row.outgoing:not([data-message-id])');
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (!row.oxypeMessage || row.oxypeMessage.text !== text) continue;
            row.dataset.messageId = String(messageId);
            renderedMessageKeys.add(String(activeSessionId) + ':' + String(messageId));
            return true;
        }
        return false;
    }

    /**
     * Paints an "edited" marker after the clock time, keeping the original time.
     * @param {HTMLElement} row
     */
    function markMessageEdited(row) {
        const stampEl = row ? row.querySelector('.message-timestamp') : null;
        if (!stampEl) return;
        // The clean clock text is remembered on the row so re-marking an already marked
        // message cannot end up with "12:00:05 edited edited".
        const clock = row.dataset.clockTime !== undefined ? row.dataset.clockTime : (stampEl.textContent || '');
        row.dataset.clockTime = clock;
        stampEl.innerHTML = '';
        if (clock) stampEl.appendChild(document.createTextNode(`${clock} `));
        const mark = document.createElement('span');
        mark.className = 'message-edited-mark';
        mark.textContent = getI18nText('chat.messageEditedMark', 'edited');
        stampEl.appendChild(mark);
    }

    /**
     * Repaints a row's body from a message and flags it as edited.
     * @param {HTMLElement} row
     * @param {{text: string, format: 'text'|'markdown'}} body
     */
    function applyMessageEdit(row, body) {
        if (!row || !body) return;
        const contentEl = row.querySelector('.message-content');
        if (contentEl) {
            contentEl.innerHTML = renderMessageBody(body.text, body.format);
            contentEl.classList.toggle('message-content-markdown', body.format === 'markdown');
        }
        // An edit rewrites the words, not what they answer. The quotation is left as
        // it is when the payload does not carry one, which is the case for an edit
        // that only revised the body.
        const bubble = row.querySelector('.message-bubble');
        const existingQuote = row.querySelector('.message-reply-quote');
        if (bubble && body.reply && existingQuote) {
            existingQuote.outerHTML = renderReplyQuote(body.reply);
        }
        row.oxypeMessage = { text: body.text, format: body.format === 'markdown' ? 'markdown' : 'text' };
        markMessageEdited(row);
    }

    /**
     * Replaces a message body with a textarea plus Save and Cancel.
     *
     * The edit happens inside the row rather than in a dialog so the message stays in
     * view and in context while it is being changed.
     * @param {HTMLElement} row
     */
    function startMessageEdit(row) {
        if (!row || !row.oxypeMessage || !row.dataset.messageId) return;
        if (editingRow === row) return;
        // One editor at a time: a second would leave the first textarea on screen with
        // no way to reach its Save button.
        if (editingRow) endMessageEdit(editingRow);

        const contentEl = row.querySelector('.message-content');
        if (!contentEl) return;

        editingRow = row;
        row.classList.add('is-editing');
        contentEl.style.display = 'none';

        const editor = document.createElement('div');
        editor.className = 'message-editor';

        const textarea = document.createElement('textarea');
        textarea.className = 'message-editor-input';
        textarea.rows = 2;
        textarea.value = row.oxypeMessage.text === null || row.oxypeMessage.text === undefined
            ? ''
            : String(row.oxypeMessage.text);

        const actions = document.createElement('div');
        actions.className = 'message-editor-actions';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn-secondary message-editor-cancel';
        cancelBtn.textContent = getI18nText('common.cancel', 'Cancel');

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn-primary message-editor-save';
        saveBtn.textContent = getI18nText('common.save', 'Save');
        // Whitespace-only text is not a message, so nothing can be saved until the
        // content has something in it — the same bar the composer applies on send.
        saveBtn.disabled = !textarea.value.trim();

        actions.appendChild(cancelBtn);
        actions.appendChild(saveBtn);
        editor.appendChild(textarea);
        editor.appendChild(actions);
        contentEl.parentNode.insertBefore(editor, contentEl.nextSibling);

        textarea.addEventListener('input', () => {
            saveBtn.disabled = !textarea.value.trim();
        });
        textarea.addEventListener('keydown', (e) => {
            // Escape has to stop here: the window-level handler would otherwise close
            // the dialogs around the editor as well as the editor itself.
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                endMessageEdit(row);
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                // Plain Enter stays a newline, since a message may be several lines.
                e.preventDefault();
                saveMessageEdit(row);
            }
        });
        cancelBtn.addEventListener('click', () => endMessageEdit(row));
        saveBtn.addEventListener('click', () => saveMessageEdit(row));

        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }

    /**
     * Tears down the in-place editor and puts the rendered body back.
     * @param {HTMLElement} row
     */
    function endMessageEdit(row) {
        if (!row) {
            editingRow = null;
            return;
        }
        const editor = row.querySelector('.message-editor');
        if (editor) editor.remove();
        const contentEl = row.querySelector('.message-content');
        if (contentEl) contentEl.style.display = '';
        row.classList.remove('is-editing');
        if (editingRow === row) editingRow = null;
    }

    /**
     * Saves an in-place edit through the server, then repaints the row from the reply.
     *
     * The response body is what gets rendered, not the textarea's text: the server is
     * the only source of truth for the edited stamp, and an administrator is allowed to
     * rewrite a message they did not write.
     * @param {HTMLElement} row
     */
    async function saveMessageEdit(row) {
        if (!row || editingRow !== row) return;
        const textarea = row.querySelector('.message-editor-input');
        const saveBtn = row.querySelector('.message-editor-save');
        const messageId = row.dataset.messageId;
        if (!textarea || !messageId || !activeSessionId) return;

        const text = textarea.value;
        if (!text.trim()) return;
        const format = row.oxypeMessage && row.oxypeMessage.format === 'markdown' ? 'markdown' : 'text';
        const senderId = currentUser ? currentUser.id : null;
        // A reply stays a reply: the edit replaces the words and keeps the quotation,
        // so revising a sentence cannot silently detach it from what it answered. The
        // server re-derives the quoted text from storage, so only the id is resent.
        const reply = row.oxypeMessage && row.oxypeMessage.reply ? row.oxypeMessage.reply : null;
        const content = reply
            ? [{ type: 'reply', messageId: reply.messageId }, { type: format, text: text }]
            : text;

        if (saveBtn) saveBtn.disabled = true;
        try {
            const res = await window.OxypeCore.editMessage(
                activeSessionId, messageId, content, senderId, null, format
            );
            const edited = res && res.success === true ? res.message : null;
            if (!edited) {
                throw new Error(getI18nText('chat.messageEditForbidden',
                    'Only the author can edit this message.'));
            }
            const body = readMessageBody(edited);
            endMessageEdit(row);
            applyMessageEdit(row, body);
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.messageEditSaved', 'Message updated.'), 'success');
            }
        } catch (err) {
            console.error('[Chat] Edit message failed:', err);
            // The editor stays open with its text so a failed request does not throw
            // away what the user just typed.
            if (saveBtn) saveBtn.disabled = false;
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(
                    getI18nText('chat.messageEditFailed', `Failed to edit: ${reason}`, { reason: reason }),
                    'error'
                );
            }
        }
    }

    /**
     * Removes a row and forgets its dedupe key.
     *
     * Dropping the key matters: without it a replayed history window or a late
     * broadcast would render the deleted message again.
     * @param {HTMLElement} row
     * @param {boolean} [deferRegroup] skip the regrouping pass; the caller recomputes it
     */
    function removeMessageRow(row, deferRegroup) {
        if (!row) return;
        if (editingRow === row) editingRow = null;
        const messageId = row.dataset.messageId;
        if (messageId) renderedMessageKeys.delete(String(activeSessionId) + ':' + String(messageId));
        row.remove();
        // The avatar and sender label of the following row depended on this one being
        // part of the group, so the grouping is recomputed. A caller dropping several
        // rows in one go asks for that once at the end instead of once per row.
        if (!deferRegroup) refreshRenderedSenderGroups();
    }

    /**
     * Deletes a message after confirmation, then drops its row.
     *
     * The row goes as soon as the server agrees rather than waiting for the broadcast:
     * the broadcast reaches this client too, but a change the user just asked for
     * should not wait for a round trip to become visible.
     * @param {HTMLElement} row
     */
    async function handleDeleteMessage(row) {
        if (!row || !activeSessionId) return;
        const messageId = row.dataset.messageId;
        if (!messageId) return;
        const confirmMsg = getI18nText('chat.messageDeleteConfirm',
            'Delete this message? Everyone will lose it, and this cannot be undone.');
        if (!window.confirm(confirmMsg)) return;

        const senderId = currentUser ? currentUser.id : null;
        try {
            const res = await window.OxypeCore.deleteMessage(activeSessionId, messageId, senderId);
            if (!res || res.success !== true) {
                throw new Error(getI18nText('chat.messageDeleteForbidden',
                    'Only the author or a conversation admin can delete this message.'));
            }
            removeMessageRow(row);
            // The preview may have been this very message, so ask the server which
            // message is newest now rather than leaving a preview for something gone.
            refreshSessionPreview(activeSessionId);
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(getI18nText('chat.messageDeleted', 'Message deleted.'), 'success');
            }
        } catch (err) {
            console.error('[Chat] Delete message failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(
                    getI18nText('chat.messageDeleteFailed', `Failed to delete: ${reason}`, { reason: reason }),
                    'error'
                );
            }
        }
    }

    /**
     * Applies an edit broadcast, whether it came from another member or from this
     * client's own request.
     * @param {Object} payload
     */
    function handleIncomingMessageEdit(payload) {
        const sid = payload ? payload.sessionId : null;
        if (sid === undefined || sid === null || String(sid) !== String(activeSessionId)) return;
        const msg = payload.data || payload.message || {};
        const messageId = msg.id !== undefined ? msg.id : msg.seq;
        const row = findMessageRow(messageId);
        if (!row) return;
        // A row being edited here is left alone: what is in the textarea is newer than
        // the broadcast and would otherwise be overwritten under the cursor.
        if (editingRow === row) return;
        applyMessageEdit(row, readMessageBody(msg));
    }

    /**
     * Applies a delete broadcast, whether it came from another member or from this
     * client's own request.
     * @param {Object} payload
     */
    function handleIncomingMessageDelete(payload) {
        const sid = payload ? payload.sessionId : null;
        if (sid === undefined || sid === null || String(sid) !== String(activeSessionId)) return;
        const messageId = payload.messageId !== undefined ? payload.messageId : payload.id;
        const row = findMessageRow(messageId);
        if (row) removeMessageRow(row);
        // Another member's delete changes the preview just as much as one made here,
        // and the row that vanished is not necessarily the one the preview named.
        refreshSessionPreview(sid);
    }

    /**
     * Handle sending a message in the active session
     */
    async function handleSendMessage() {
        if (!messageInputEl || !activeSessionId) return;

        // The raw value is sent, not a trimmed copy: leading spaces make a Markdown
        // code block and trailing spaces are a Markdown hard line break. Emptiness is
        // still judged on the trimmed text so whitespace alone cannot be sent.
        const text = messageInputEl.value;
        if (!text.trim()) return;

        const format = getSelectedMessageFormat();
        // Read before the draft is cleared, and dropped immediately: the reply belongs
        // to this one send, and a failure below must not silently re-arm it.
        const pendingReply = replyTarget;

        // Clear input immediately and maintain focus
        messageInputEl.value = '';
        autoGrowComposer();
        messageInputEl.focus();
        clearReplyTarget();

        // Remove empty conversation hint if present
        const hint = document.getElementById('emptyConversationHint');
        if (hint) hint.remove();
        const sentAtMs = Date.now();
        const myName = currentUser && currentUser.username ? currentUser.username : 'Me';
        const senderId = currentUser ? currentUser.id : null;
        const sentRow = appendMessage({ text: text, format: format, sender: myName, senderId: senderId, isSelf: true,
            timestamp: formatClockTime(sentAtMs), timestampMs: sentAtMs, reply: pendingReply });
        updateActiveSessionLastMessage(myName, previewOfBody(text), sentAtMs);

        // The quotation goes first and the body follows it, which is the shape the
        // server requires: it fills in the quoted sender and words from the stored
        // message, so only the id is sent from here.
        const content = pendingReply
            ? [{ type: 'reply', messageId: pendingReply.messageId }, { type: format, text: text }]
            : text;

        try {
            const res = await window.OxypeCore.sendMessage(
                activeSessionId, content, senderId, null, format
            );
            if (res && typeof res.seq === 'number' && res.seq > 0) {
                currentSeq = res.seq;
                // The optimistic row was rendered before the server named it. Attaching
                // the sequence now is what makes the message editable or deletable
                // without reloading the conversation. It is also registered as rendered
                // so the sender's own broadcast copy of this message cannot double it.
                if (sentRow && !sentRow.dataset.messageId) {
                    sentRow.dataset.messageId = String(res.seq);
                    renderedMessageKeys.add(String(activeSessionId) + ':' + String(res.seq));
                }
            }
        } catch (err) {
            console.error('[Chat] Failed to send message:', err);
            if (window.OxypeStyle) {
                // A reply whose target was deleted while it was being written is the
                // one failure worth naming precisely: the draft is fine, the thing it
                // answers is not, and re-sending it as a plain message is the way out.
                if (pendingReply && err && err.status === 404) {
                    window.OxypeStyle.showToast(
                        getI18nText('chat.replyMissingTarget', 'The message you replied to has been deleted.'),
                        'error'
                    );
                    return;
                }
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
    function createDateSeparator(timestamp) {
        const row = document.createElement('div');
        row.className = 'message-date-separator';

        const label = document.createElement('span');
        label.className = 'message-date-label';
        label.textContent = formatDateLabel(timestamp);

        const line = document.createElement('span');
        line.className = 'message-date-line';

        row.appendChild(label);
        row.appendChild(line);
        return row;
    }

    function appendDateSeparator(timestamp) {
        if (!messagesContainerEl) return;
        messagesContainerEl.appendChild(createDateSeparator(timestamp));
    }

    /**
     * Rebuild the date separators so exactly one sits above the first message of each
     * day.
     *
     * While messages only arrive at the bottom, `lastRenderedDateKey` alone is enough:
     * a separator is emitted the moment the day changes. Splicing a page in above the
     * viewport breaks that assumption, because the boundary between the new page and
     * what was the first message moves. The separator state is a single running value,
     * so it is cheaper to rebuild it from the rows that are actually on screen than to
     * reason about the one boundary that moved.
     */
    function normalizeDateSeparators() {
        if (!messagesContainerEl) return;
        const children = Array.from(messagesContainerEl.children);
        const planned = [];
        let previousDay = '';
        children.forEach(child => {
            if (!child.classList.contains('message-row')) return;
            const day = dateKeyOf(child.dataset.timestampMs);
            if (day && day !== previousDay) {
                planned.push({ beforeRow: child, timestamp: Number(child.dataset.timestampMs) });
                previousDay = day;
            }
        });
        // Rows are only ever read here; the separators are the only nodes rewritten.
        children.forEach(child => {
            if (child.classList.contains('message-date-separator')) child.remove();
        });
        planned.forEach(item => {
            messagesContainerEl.insertBefore(createDateSeparator(item.timestamp), item.beforeRow);
        });
        // The next message appended at the bottom continues from the last day on
        // screen, otherwise it would label a day that is already labelled.
        lastRenderedDateKey = previousDay;
    }

    /**
     * Build one message row without putting it anywhere in the document.
     *
     * Rows are built detached so a batch of older messages can be spliced in at the
     * top in one go; appending each one separately would re-run the sticky-bottom
     * scroll on every message and make the transcript jump while the reader is
     * looking at old content.
     *
     * @param {object} msg see `appendMessage`
     * @param {Element|null} previousElement the row this one follows, used to decide
     * whether it continues a sender group (null when the caller will fix grouping
     * afterwards, as the paging path does)
     * @returns {HTMLElement}
     */
    function createMessageRow(msg, previousElement) {
        const row = document.createElement('div');
        row.className = `message-row ${msg.isSelf ? 'outgoing' : 'incoming'}`;

        const senderName = msg.sender || (msg.isSelf ? (currentUser && currentUser.username ? currentUser.username : 'Me') : 'User');
        const senderKey = `${msg.isSelf ? 'self' : 'other'}:${senderName}`;
        const previousSenderKey = previousElement && previousElement.classList.contains('message-row')
            ? previousElement.dataset.senderKey
            : null;
        const continuesGroup = previousSenderKey === senderKey;
        const avatarChar = senderName.trim().charAt(0).toUpperCase() || '?';

        // Keep the avatar on the last row of a consecutive sender group. When a new
        // message extends the group, the previous row is no longer its visual end.
        if (continuesGroup) {
            const previousAvatar = previousElement.querySelector('.message-avatar');
            if (previousAvatar) previousAvatar.classList.add('is-hidden');
        }
        row.dataset.senderKey = senderKey;
        if (msg.senderId !== undefined && msg.senderId !== null) row.dataset.senderId = String(msg.senderId);
        row.dataset.senderName = senderName;
        // The server id is what edit and delete address, so it lives on the row rather
        // than in a side table that would have to be kept in step with the DOM.
        if (msg.messageId !== undefined && msg.messageId !== null) row.dataset.messageId = String(msg.messageId);
        // Kept so a date separator spliced in above can tell which day the row above
        // it belonged to, which is the only way to know if it is still needed.
        const stampMs = Number(msg.timestampMs);
        if (Number.isFinite(stampMs) && stampMs > 0) row.dataset.timestampMs = String(stampMs);
        // The raw source of a message is not recoverable from its rendered bubble (a
        // markdown body is already HTML by the time it lands), so the editor seeds its
        // textarea from this copy instead of parsing the DOM back into text. The
        // quotation rides along so an edit can re-send it: replacing the pieces without
        // it would quietly turn a reply into a message that answers nothing.
        row.oxypeMessage = { text: msg.text, format: msg.format === 'markdown' ? 'markdown' : 'text', reply: msg.reply || null };
        // The sender id is stamped on the avatar itself so a picture arriving later can
        // find every row this account wrote, including ones drawn long before it.
        const avatarOwnerAttr = msg.senderId !== undefined && msg.senderId !== null
            ? ` data-avatar-user="${escapeHtml(msg.senderId)}"`
            : '';
        row.innerHTML = `
            <div class="message-avatar"${avatarOwnerAttr} data-avatar-initial="${escapeHtml(avatarChar)}" aria-hidden="true">${escapeHtml(avatarChar)}</div>
            <div class="message-bubble">
                <div class="message-sender${continuesGroup ? ' is-hidden' : ''}">${escapeHtml(senderName)}</div>
                ${renderReplyQuote(msg.reply)}
                <div class="message-content${msg.format === 'markdown' ? ' message-content-markdown' : ''}">${renderMessageBody(msg.text, msg.format)}</div>
                <div class="message-timestamp">${escapeHtml(msg.timestamp)}</div>
            </div>
        `;

        if (msg.senderId !== undefined && msg.senderId !== null) {
            const knownSenderAvatar = cachedAvatarUrl('user', msg.senderId);
            if (knownSenderAvatar === undefined) {
                requestUserAvatar(msg.senderId);
            } else {
                paintAvatarElement(row.querySelector('.message-avatar'), 'user', msg.senderId, avatarChar);
            }
        }

        return row;
    }

    /**
     * Append a message bubble to the messages stream.
     * A date separator is inserted ahead of the first message of each new date, so
     * the year/month/day is taken from the first message that crosses into that date.
     * @param {{text: string, format?: 'text'|'markdown', sender: string, isSelf: boolean, timestamp: string, timestampMs?: number, messageId?: number|string}} msg
     * @returns {HTMLElement|null} the row that was appended, so a caller that only learns
     * the server id afterwards can still attach it.
     */
    function appendMessage(msg) {
        if (!messagesContainerEl) return null;

        // Insert the date boundary before the first message belonging to a new day.
        const key = dateKeyOf(msg.timestampMs);
        if (key && key !== lastRenderedDateKey) {
            appendDateSeparator(msg.timestampMs);
            lastRenderedDateKey = key;
        }

        const row = createMessageRow(msg, messagesContainerEl.lastElementChild);
        messagesContainerEl.appendChild(row);
        // History carries the edit stamp, so a message edited before the page was
        // reloaded still says so; without this only live edits were ever marked.
        if (msg.editedAt) markMessageEdited(row);

        // `stickToBottom` is off for messages spliced in above the viewport, where
        // jumping to the newest message is exactly the wrong move.
        if (msg.stickToBottom !== false) {
            messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
        }
        return row;
    }

    /**
     * Id of the account this page is signed in as, or null when that is not known yet.
     * @returns {string|number|null}
     */
    function resolveCurrentUserId() {
        if (currentUser && currentUser.id != null) return currentUser.id;
        const stored = (window.OxypeCore && window.OxypeCore.getStoredAuth)
            ? window.OxypeCore.getStoredAuth()
            : null;
        return stored && stored.userId != null ? stored.userId : null;
    }

    /**
     * Turn one server message record into the shape the row builder expects.
     *
     * History records put the body in whichever piece the message was sent with, carry
     * an optional edit stamp, and name their sender only by id, so every one of those
     * differences is settled here instead of in each caller.
     *
     * @param {object} msg a record from POST /getMessages/{sessionId}
     * @returns {object|null} null when the record has no body to show
     */
    function historyMessageToViewModel(msg) {
        if (!msg) return null;
        const body = readMessageBody(msg);
        if (!body || !body.text) return null;

        const currentUserId = resolveCurrentUserId();
        const senderId = (msg.sender !== undefined && msg.sender !== null) ? msg.sender : msg.userid;
        const isSelf = Boolean(currentUserId != null && senderId != null
            && String(senderId) === String(currentUserId));
        const senderName = isSelf
            ? (currentUser && currentUser.username ? currentUser.username : 'Me')
            : (activeSessionUsers.get(String(senderId)) || (senderId != null ? `User #${senderId}` : 'User'));

        // The server stamps each message in epoch milliseconds; older records predate
        // the field and render without a clock time.
        const timestampMs = (msg.timestamp !== undefined && msg.timestamp !== null)
            ? Number(msg.timestamp)
            : 0;

        return {
            text: body.text,
            format: body.format,
            sender: senderName,
            senderId: senderId,
            isSelf: isSelf,
            timestamp: formatClockTime(timestampMs),
            timestampMs: timestampMs,
            messageId: msg.id !== undefined ? msg.id : msg.seq,
            editedAt: msg.editedAt ? Number(msg.editedAt) : 0,
            reply: body.reply
        };
    }

    /**
     * Build one message row per history record, detached from the document.
     *
     * Rows are returned rather than appended so a page fetched above the viewport can
     * be inserted in one DOM operation; appending one at a time would re-measure and
     * re-scroll the transcript for every message in the page.
     *
     * @param {Array<object>} messages records in ascending order
     * @returns {HTMLElement[]}
     */
    function buildHistoryRows(messages) {
        const rows = [];
        (messages || []).forEach(msg => {
            const model = historyMessageToViewModel(msg);
            if (!model) return;
            if (model.messageId !== undefined && model.messageId !== null) {
                const key = String(activeSessionId) + ':' + String(model.messageId);
                // The same record can arrive twice: a page boundary that shifted after a
                // live message landed, or a re-sent page. Rendering it twice would
                // duplicate the row and its dedupe key.
                if (renderedMessageKeys.has(key)) return;
                renderedMessageKeys.add(key);
            }
            // Grouping is recomputed across the whole transcript after the rows are in
            // place, so no previous sibling is needed to build a single row.
            const row = createMessageRow(model, null);
            if (model.editedAt) markMessageEdited(row);
            rows.push(row);
        });
        return rows;
    }

    /**
     * Render the window loaded when a conversation is opened.
     * @param {Array<object>} messages records in ascending order
     */
    function appendHistoryBatch(messages) {
        if (!messagesContainerEl) return;
        const rows = buildHistoryRows(messages);
        const fragment = document.createDocumentFragment();
        rows.forEach(row => fragment.appendChild(row));
        messagesContainerEl.appendChild(fragment);
        normalizeDateSeparators();
        refreshRenderedSenderGroups();
        // Opening a conversation lands on its newest message, as the live append path
        // would have done message by message.
        messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
    }

    /**
     * Insert a page of older messages above what is already rendered, without moving
     * what the reader is looking at.
     *
     * Prepending content above the viewport does not change `scrollTop`, so the text on
     * screen would jump by the height of the new page. The scroll offset is therefore
     * advanced by the same amount, measured on a row that was already there rather than on
     * the scroll height: the height is rounded to whole pixels, and a page of these rows
     * rarely adds up to a round number.
     *
     * The shift is applied as a residual rather than as one guess, because the browser
     * keeps a scroll anchor of its own and may move the offset while the rows are being
     * inserted: what is left to correct can be smaller than the height that was added, and
     * applying the full height on top of the browser's own correction would overshoot.
     * Re-measuring after each pass converges on the position the anchor really had.
     *
     * This has to finish here, before the sender regrouping that follows. That regrouping
     * hides avatars and names, and re-measuring after it double-counts the browser's own
     * asynchronous adjustment — measured on the classic skin, deferring the correction
     * left the reader a whole row (-19px) adrift instead of a sub-pixel residue.
     *
     * @param {HTMLElement[]} rows detached rows in ascending order
     */
    function prependHistoryRows(rows) {
        if (!messagesContainerEl || rows.length === 0) return;
        const previousHeight = messagesContainerEl.scrollHeight;
        const previousTop = messagesContainerEl.scrollTop;
        const anchor = messagesContainerEl.querySelector('.message-row');
        const anchorTopBefore = anchor ? anchor.getBoundingClientRect().top : 0;
        const fragment = document.createDocumentFragment();
        rows.forEach(row => fragment.appendChild(row));
        messagesContainerEl.insertBefore(fragment, messagesContainerEl.firstChild);
        // The page brings messages of its own days, and it may or may not end the day
        // the previously first message began, so separators are re-derived.
        normalizeDateSeparators();
        if (anchor) {
            // Each pass cancels exactly the displacement that is left. Three passes absorb
            // a re-layout in between; the loop stops early once only sub-pixel noise
            // remains, which this container cannot express anyway — its scrollTop accepts
            // whole numbers only, while its rows are 52.5 and 71.75 tall.
            for (let pass = 0; pass < 3; pass += 1) {
                const drift = anchor.getBoundingClientRect().top - anchorTopBefore;
                if (Math.abs(drift) < 0.5) break;
                messagesContainerEl.scrollTop += drift;
            }
        } else {
            const addedHeight = messagesContainerEl.scrollHeight - previousHeight;
            if (addedHeight > 0) messagesContainerEl.scrollTop = previousTop + addedHeight;
        }
    }

    /**
     * Whether the reader has scrolled all the way up to the oldest message on screen.
     *
     * Paging is triggered only from there, so a page is fetched when the transcript has
     * actually run out rather than partway through it. The previous rule asked one page
     * early, which needed a scroll position to be measured against a message count and
     * silently stopped firing once that arithmetic drifted from the real layout.
     *
     * The oldest row sits below the container's top padding, so its content offset is
     * positive and the comparison uses it directly instead of a pixel constant.
     *
     * @returns {boolean}
     */
    function hasReachedHistoryTop() {
        if (!messagesContainerEl) return false;
        const first = messagesContainerEl.querySelector('.message-row');
        if (!first) return true;
        const containerTop = messagesContainerEl.getBoundingClientRect().top;
        const firstTopInContent = first.getBoundingClientRect().top - containerTop + messagesContainerEl.scrollTop;
        // Browsers clamp scrollTop at 0, so a hard overscroll lands exactly on the oldest
        // row; the slack only absorbs sub-pixel row heights.
        return messagesContainerEl.scrollTop <= firstTopInContent + 1;
    }

    /**
     * Coalesce scroll events into one paging check per frame.
     *
     * A scroll gesture fires far more often than layout changes, and every check reads
     * geometry, so the answer is computed once and dropped if a page is already on its
     * way.
     */
    function scheduleHistoryCheck() {
        if (historyCheckScheduled) return;
        historyCheckScheduled = true;
        const run = () => {
            historyCheckScheduled = false;
            if (historyReachedTop || historyPageInFlight) return;
            if (historyOldestSeq === null) return;
            if (!hasReachedHistoryTop()) return;
            loadOlderMessages();
        };
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(run);
        } else {
            window.setTimeout(run, 16);
        }
    }

    /**
     * Fetch and insert the page of messages immediately below the oldest sequence
     * requested so far.
     *
     * Paging counts back from that sequence in fixed steps, so it always terminates:
     * a range whose messages were all deleted returns nothing, and the next attempt
     * asks for the range below it rather than re-asking for the same one.
     */
    async function loadOlderMessages() {
        if (!messagesContainerEl || historyPageInFlight || historyReachedTop) return;
        if (historyOldestSeq === null || !activeSessionId) return;

        const sessionId = activeSessionId;
        const userId = resolveCurrentUserId();
        historyPageInFlight = true;
        let inserted = 0;
        try {
            // Empty ranges are skipped in the same pass. Nothing was added to the
            // transcript, so no scroll event follows to ask again, yet the top may still
            // be further up.
            while (!historyReachedTop) {
                const end = Math.floor(historyOldestSeq) - 1;
                if (end < 1) {
                    historyReachedTop = true;
                    break;
                }
                const start = Math.max(0, end - (HISTORY_PAGE_SIZE - 1));
                const messages = await window.OxypeCore.getMessages(sessionId, start, end, userId);
                // The conversation can be switched while the request is in flight, and
                // those rows would belong to a transcript that is no longer on screen.
                if (activeSessionId !== sessionId) return;

                historyOldestSeq = start;
                if (start <= 1) historyReachedTop = true;

                const rows = buildHistoryRows(Array.isArray(messages) ? messages : []);
                if (rows.length > 0) {
                    prependHistoryRows(rows);
                    inserted += rows.length;
                    historyEmptyPageStreak = 0;
                    break;
                }
                historyEmptyPageStreak += 1;
                if (historyEmptyPageStreak >= HISTORY_MAX_EMPTY_PAGES) {
                    historyReachedTop = true;
                    break;
                }
                // The reader may have scrolled back down while the page was loading, in
                // which case there is no reason to keep digging.
                if (!hasReachedHistoryTop()) break;
            }
        } catch (err) {
            console.warn('[Chat] Failed to load older messages:', err);
        } finally {
            historyPageInFlight = false;
        }

        if (inserted > 0) {
            // Grouping and missing names are resolved across the whole transcript, so
            // the boundary between the new page and the old first message is fixed
            // along with everything else.
            refreshRenderedSenderGroups();
            resolveRenderedPlaceholderSenders();
        }
    }

    /**
     * Logout handler
     */
    function handleLogout() {
        // Stopped before the page is handed over so no pass fires a request with
        // credentials that are about to be cleared.
        stopCalibration();
        if (window.OxypeWebSocket) {
            window.OxypeWebSocket.stop();
        }
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
