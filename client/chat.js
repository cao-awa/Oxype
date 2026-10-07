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
    let messageFormatEl;
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

    // How the outgoing message body should be interpreted. 'text' renders literally,
    // 'markdown' runs through the bundled renderer. The value is sent as the message
    // piece type, so it travels with the message rather than being re-decided later.
    const MESSAGE_FORMATS = ['text', 'markdown'];
    const MESSAGE_FORMAT_STORAGE_KEY = 'oxype_message_format';
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
        messageFormatEl = document.getElementById('messageFormatSelect');
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

        // The security warning is built on demand rather than read from the page: a
        // user-supplied chat.html performs the save too, and such a page will not
        // contain markup added here. Building it keeps the warning present whatever
        // page is loaded. See buildStyleSourcesRiskDialog().

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

        if (messageFormatEl) {
            messageFormatEl.value = readStoredMessageFormat();
            messageFormatEl.addEventListener('change', () => {
                writeStoredMessageFormat(messageFormatEl.value);
                // The placeholder is the only affordance explaining the mode.
                updateComposerForFormat();
            });
            updateComposerForFormat();

            // The placeholder is set from the dictionary rather than by data-i18n, since
            // it depends on which format is selected, so it is refreshed by hand.
            window.addEventListener('oxype:languageChanged', updateComposerForFormat);
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
     * Close all active dialogs
     */
    function closeAllDialogs() {
        if (dialogOverlay) dialogOverlay.style.display = 'none';
        if (sessionOptionsDialog) sessionOptionsDialog.style.display = 'none';
        if (sessionSettingsDialog) sessionSettingsDialog.style.display = 'none';
        if (membersDialog) membersDialog.style.display = 'none';
        if (manageDialog) manageDialog.style.display = 'none';
        if (settingsDialog) settingsDialog.style.display = 'none';
        if (styleSourcesDialogEl) styleSourcesDialogEl.style.display = 'none';
        if (styleSourcesRiskDialogEl) styleSourcesRiskDialogEl.style.display = 'none';
        if (styleSourcesRiskScrimEl) styleSourcesRiskScrimEl.style.display = 'none';

        // Escape or an overlay click abandons a pending acknowledgement, so the
        // confirmed values must not survive to be saved by a later click.
        pendingStyleSources = null;
        if (styleSourcesRiskCheckboxEl) styleSourcesRiskCheckboxEl.checked = false;
        syncStyleSourcesRiskConfirmState();
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
                    const body = readMessageBody(msg);

                    if (body.text) {
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
                            text: body.text,
                            format: body.format,
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
    }

    /**
     * The body format currently selected in the composer.
     * @returns {'text'|'markdown'}
     */
    function getSelectedMessageFormat() {
        if (messageFormatEl && MESSAGE_FORMATS.indexOf(messageFormatEl.value) !== -1) {
            return messageFormatEl.value;
        }
        return 'text';
    }

    /** Reflects the selected format in the composer placeholder. */
    function updateComposerForFormat() {
        if (!messageInputEl) return;
        const isMarkdown = getSelectedMessageFormat() === 'markdown';
        const key = isMarkdown ? 'chat.inputPlaceholderMarkdown' : 'chat.inputPlaceholder';
        const fallback = isMarkdown ? 'Markdown supported...' : 'Type a message...';
        messageInputEl.setAttribute('placeholder', getI18nText(key, fallback));
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
        messageInputEl.style.height = 'auto';
        const next = Math.min(messageInputEl.scrollHeight, COMPOSER_MAX_HEIGHT);
        messageInputEl.style.height = `${next}px`;
        messageInputEl.style.overflowY = messageInputEl.scrollHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden';
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
     * @returns {{text: string, format: 'text'|'markdown'}}
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
            return { text: source, format: markdown.length > 0 ? 'markdown' : 'text' };
        }
        if (typeof msg.pieces === 'string') {
            return { text: msg.pieces, format: 'text' };
        }
        if (typeof msg.text === 'string') {
            return { text: msg.text, format: 'text' };
        }
        return { text: '', format: 'text' };
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

        // Clear input immediately and maintain focus
        messageInputEl.value = '';
        autoGrowComposer();
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
            format: format,
            sender: myName,
            isSelf: true,
            timestamp: timestamp,
            timestampMs: sentAtMs
        });
        updateActiveSessionLastMessage(myName, previewOfBody(text));

        // Send POST to /sendMessage/{sessionId}. The format travels as the piece type
        // so the receiving client renders the body the way the sender intended.
        try {
            const senderId = currentUser ? currentUser.id : null;
            const res = await window.OxypeCore.sendMessage(
                activeSessionId, text, senderId, null, format
            );
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
     * @param {{text: string, format?: 'text'|'markdown', sender: string, isSelf: boolean, timestamp: string, timestampMs?: number}} msg
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
                <div class="message-content${msg.format === 'markdown' ? ' message-content-markdown' : ''}">${renderMessageBody(msg.text, msg.format)}</div>
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
