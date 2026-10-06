/**
 * Oxype Web Client - Classic skin logic
 *
 * The behavioural counterpart to the default chat.js, paired with this directory's
 * chat.html and chat.css. Like them it is entirely self-contained: the default
 * interface never loads it, and the only way to reach it is by setting the three
 * "Style Source" fields to /classic/chat.html, /classic/chat.css and /classic/chat.js.
 *
 * It talks to the same backend through the shared window.OxypeCore client and uses
 * window.OxypeI18n / window.OxypeStyle for translation and toasts, so behaviour,
 * permissions and wording stay identical to the default skin -- only the arrangement
 * of the markup differs.
 */

(function () {
    'use strict';

    // ------------------------------------------------------------- state -------

    let currentUser = null;
    let activeSessionId = null;
    const sessionsMap = new Map();

    // Roster of the active conversation, keyed by user id, for sender names
    const activeSessionUsers = new Map();
    let activeSessionInfo = null;

    // Calendar day of the last rendered message, so each date gets one separator
    let lastRenderedDateKey = '';
    let currentSeq = 0;

    // Style source form state, filled from the server on open
    let styleSourceDefaults = { html: '/chat.html', css: '/chat.css', js: '/chat.js' };
    let styleSourceMaxLength = 128;

    // -------------------------------------------------------------- dom --------

    let sessionListEl;
    let emptySessionsPlaceholderEl;
    let userAvatarEl;
    let userDisplayNameEl;
    let userIdBadgeEl;
    let activeSessionNameEl;
    let activeSessionDescriptionEl;
    let messagesContainerEl;
    let chatComposerEl;
    let messageInputEl;
    let sendMessageBtnEl;

    let sessionOptionsBtnEl;
    let sessionOptionsDialogEl;
    let closeSessionOptionsBtnEl;
    let createSessionFormEl;
    let newSessionNameInputEl;
    let newSessionDescInputEl;
    let submitCreateSessionBtnEl;
    let joinSessionFormEl;
    let joinUuidInputEl;
    let joinSessionBtnEl;

    let sessionSettingsBtnEl;
    let sessionSettingsDialogEl;
    let closeSessionSettingsBtnEl;
    let ssSessionIdEl;
    let ssInviteHintEl;
    let ssInviteListEl;
    let ssCreateInviteBtnEl;
    let openMembersBtnEl;
    let ssLeaveBtnEl;

    let membersDialogEl;
    let closeMembersBtnEl;
    let ssMemberListEl;

    let settingsBtnEl;
    let settingsDialogEl;
    let closeSettingsBtnEl;
    let dialogLogoutBtnEl;
    let dialogOverlayEl;

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

    // Validated values awaiting acknowledgement; the save only runs once confirmed
    let pendingStyleSources = null;

    // ------------------------------------------------------------ helpers ------

    /** Localized text, falling back to [fallback] when the dictionary is absent. */
    function getI18nText(key, fallback, params) {
        if (window.OxypeI18n && typeof window.OxypeI18n.t === 'function') {
            return window.OxypeI18n.t(key, params);
        }
        return fallback;
    }

    /** Escapes text before it is placed into markup. */
    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value === null || value === undefined ? '' : String(value);
        return div.innerHTML;
    }

    /** Shows a toast when the style module is available. */
    function toast(message, type) {
        if (window.OxypeStyle && typeof window.OxypeStyle.showToast === 'function') {
            window.OxypeStyle.showToast(message, type || 'info');
        }
    }

    /** Turns a request failure into something worth showing a user. */
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

    /** The stored credentials, or null when signed out. */
    function auth() {
        return window.OxypeCore ? window.OxypeCore.getStoredAuth() : null;
    }

    /** The active user id, preferring the loaded profile over local storage. */
    function currentUserId() {
        if (currentUser && currentUser.id !== null && currentUser.id !== undefined) {
            return currentUser.id;
        }
        const stored = auth();
        return stored ? stored.userId : null;
    }

    /** Formats a millisecond stamp as HH:MM:SS, or '' when unusable. */
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

    /** Formats a millisecond stamp as YYYY/MM/DD, or '' when unusable. */
    function formatDateLabel(timestamp) {
        const ms = Number(timestamp);
        if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
        const d = new Date(ms);
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    }

    /** Identity of the calendar day a timestamp falls on. */
    function dateKeyOf(timestamp) {
        const ms = Number(timestamp);
        if (!ms || !Number.isFinite(ms) || ms <= 0) return '';
        const d = new Date(ms);
        return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    }

    /** Pulls the readable text out of a stored message record. */
    function textOfMessage(msg) {
        if (Array.isArray(msg.pieces)) {
            return msg.pieces
                .filter(p => p && p.type === 'text')
                .map(p => p.text || '')
                .join('');
        }
        if (typeof msg.pieces === 'string') return msg.pieces;
        if (typeof msg.text === 'string') return msg.text;
        return '';
    }

    // --------------------------------------------------------------- init ------

    async function init() {
        sessionListEl = document.getElementById('sessionList');
        emptySessionsPlaceholderEl = document.getElementById('emptySessionsPlaceholder');
        userAvatarEl = document.getElementById('userAvatar');
        userDisplayNameEl = document.getElementById('userDisplayName');
        userIdBadgeEl = document.getElementById('userIdBadge');
        activeSessionNameEl = document.getElementById('activeSessionName');
        activeSessionDescriptionEl = document.getElementById('activeSessionDescription');
        messagesContainerEl = document.getElementById('messagesContainer');
        chatComposerEl = document.getElementById('chatComposer');
        messageInputEl = document.getElementById('messageInput');
        sendMessageBtnEl = document.getElementById('sendMessageBtn');

        sessionOptionsBtnEl = document.getElementById('sessionOptionsBtn');
        sessionOptionsDialogEl = document.getElementById('sessionOptionsDialog');
        closeSessionOptionsBtnEl = document.getElementById('closeSessionOptionsBtn');
        createSessionFormEl = document.getElementById('createSessionForm');
        newSessionNameInputEl = document.getElementById('newSessionNameInput');
        newSessionDescInputEl = document.getElementById('newSessionDescInput');
        submitCreateSessionBtnEl = document.getElementById('submitCreateSessionBtn');
        joinSessionFormEl = document.getElementById('joinSessionForm');
        joinUuidInputEl = document.getElementById('joinUuidInput');
        joinSessionBtnEl = document.getElementById('joinSessionBtn');

        sessionSettingsBtnEl = document.getElementById('sessionSettingsBtn');
        sessionSettingsDialogEl = document.getElementById('sessionSettingsDialog');
        closeSessionSettingsBtnEl = document.getElementById('closeSessionSettingsBtn');
        ssSessionIdEl = document.getElementById('ssSessionId');
        ssInviteHintEl = document.getElementById('ssInviteHint');
        ssInviteListEl = document.getElementById('ssInviteList');
        ssCreateInviteBtnEl = document.getElementById('ssCreateInviteBtn');
        openMembersBtnEl = document.getElementById('openMembersBtn');
        ssLeaveBtnEl = document.getElementById('ssLeaveBtn');

        membersDialogEl = document.getElementById('membersDialog');
        closeMembersBtnEl = document.getElementById('closeMembersBtn');
        ssMemberListEl = document.getElementById('ssMemberList');

        settingsBtnEl = document.getElementById('settingsBtn');
        settingsDialogEl = document.getElementById('settingsDialog');
        closeSettingsBtnEl = document.getElementById('closeSettingsBtn');
        dialogLogoutBtnEl = document.getElementById('dialogLogoutBtn');
        dialogOverlayEl = document.getElementById('dialogOverlay');

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
        // contain markup added here. See buildStyleSourcesRiskDialog().

        // Reuse the shared language / theme / accent selectors.
        if (window.OxypeI18n && typeof window.OxypeI18n.initLanguageSelector === 'function') {
            window.OxypeI18n.initLanguageSelector('#languageSelect');
        }
        if (window.OxypeStyle) {
            if (typeof window.OxypeStyle.initThemeModeSelector === 'function') {
                window.OxypeStyle.initThemeModeSelector('#themeModeSelect');
            }
            if (typeof window.OxypeStyle.initAccentSelector === 'function') {
                window.OxypeStyle.initAccentSelector('#colorThemeSelect');
            }
        }

        const stored = auth();
        if (!stored || !stored.token || !stored.userId) {
            console.warn('[Classic] No valid session found. Redirecting to auth page.');
            window.location.href = '../index.html';
            return;
        }

        currentUser = {
            id: stored.userId,
            username: stored.username || `User #${stored.userId}`
        };
        renderUserProfile();
        bindEvents();

        // Nothing is selected yet, so the transcript shows its prompt.
        setComposerEnabled(false);
        showEmptyConversationHint();

        await loadUserDataAndSessions(stored.userId);

        // Re-apply translations for any node this script built after load.
        window.addEventListener('oxype:languageChanged', () => {
            renderUserProfile();
        });
    }

    /** Wires every control, guarding against markup that was not provided. */
    function bindEvents() {
        if (sessionOptionsBtnEl) sessionOptionsBtnEl.addEventListener('click', openSessionOptionsDialog);
        if (closeSessionOptionsBtnEl) closeSessionOptionsBtnEl.addEventListener('click', closeAllDialogs);
        if (createSessionFormEl) createSessionFormEl.addEventListener('submit', handleCreateSessionSubmit);
        if (joinSessionFormEl) joinSessionFormEl.addEventListener('submit', handleJoinSessionSubmit);

        if (sessionSettingsBtnEl) sessionSettingsBtnEl.addEventListener('click', openSessionSettingsDialog);
        if (closeSessionSettingsBtnEl) closeSessionSettingsBtnEl.addEventListener('click', closeAllDialogs);
        if (ssCreateInviteBtnEl) ssCreateInviteBtnEl.addEventListener('click', handleCreateInvite);
        if (ssLeaveBtnEl) ssLeaveBtnEl.addEventListener('click', handleLeaveSession);
        if (openMembersBtnEl) openMembersBtnEl.addEventListener('click', openMembersDialog);

        if (closeMembersBtnEl) closeMembersBtnEl.addEventListener('click', closeAllDialogs);

        if (settingsBtnEl) settingsBtnEl.addEventListener('click', openSettingsDialog);
        if (closeSettingsBtnEl) closeSettingsBtnEl.addEventListener('click', closeAllDialogs);
        if (dialogLogoutBtnEl) dialogLogoutBtnEl.addEventListener('click', handleLogout);

        if (openStyleSourcesBtnEl) openStyleSourcesBtnEl.addEventListener('click', openStyleSourcesDialog);
        if (closeStyleSourcesBtnEl) closeStyleSourcesBtnEl.addEventListener('click', closeAllDialogs);
        if (styleSourcesSaveBtnEl) styleSourcesSaveBtnEl.addEventListener('click', handleSaveStyleSources);
        if (styleSourcesResetBtnEl) styleSourcesResetBtnEl.addEventListener('click', handleResetStyleSources);

        // The security warning controls are bound when it is built, on first save.

        if (chatComposerEl) chatComposerEl.addEventListener('submit', handleSendMessage);
        if (dialogOverlayEl) dialogOverlayEl.addEventListener('click', closeAllDialogs);

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeAllDialogs();
        });
    }

    // ----------------------------------------------------------- dialogs -------

    /** Closes every dialog and the shared overlay. */
    function closeAllDialogs() {
        [dialogOverlayEl, sessionOptionsDialogEl, sessionSettingsDialogEl, membersDialogEl,
            settingsDialogEl, styleSourcesDialogEl, styleSourcesRiskDialogEl,
            styleSourcesRiskScrimEl].forEach(el => {
            if (el) el.style.display = 'none';
        });

        // Escape or an overlay click abandons a pending acknowledgement, so the
        // confirmed values must not survive to be saved by a later click.
        pendingStyleSources = null;
        if (styleSourcesRiskCheckboxEl) styleSourcesRiskCheckboxEl.checked = false;
        syncStyleSourcesRiskConfirmState();
    }

    function openSessionOptionsDialog() {
        closeAllDialogs();
        if (dialogOverlayEl) dialogOverlayEl.style.display = 'block';
        if (sessionOptionsDialogEl) {
            sessionOptionsDialogEl.style.display = 'block';
            if (newSessionNameInputEl) newSessionNameInputEl.value = '';
            if (newSessionDescInputEl) newSessionDescInputEl.value = '';
            if (joinUuidInputEl) joinUuidInputEl.value = '';
            if (newSessionNameInputEl) setTimeout(() => newSessionNameInputEl.focus(), 50);
        }
    }

    function openSettingsDialog() {
        closeAllDialogs();
        if (dialogOverlayEl) dialogOverlayEl.style.display = 'block';
        if (settingsDialogEl) settingsDialogEl.style.display = 'block';
    }

    /**
     * Opens the style source toast.
     *
     * It is deliberately separate from the settings toast, and only reachable from
     * here -- never from the registration page. The stored values are fetched on
     * every open so the form reflects the account rather than the current page.
     */
    async function openStyleSourcesDialog() {
        closeAllDialogs();
        if (dialogOverlayEl) dialogOverlayEl.style.display = 'block';
        if (styleSourcesDialogEl) styleSourcesDialogEl.style.display = 'block';
        await loadStyleSources();
    }

    // --------------------------------------------------------- style source ----

    /** Loads the caller's three sources into the form. */
    async function loadStyleSources() {
        if (!styleSourceHtmlEl || !styleSourceCssEl || !styleSourceJsEl) return;
        if (!window.OxypeCore) return;

        try {
            const stored = auth();
            const data = await window.OxypeCore.getStyleSources(
                stored ? stored.userId : null,
                stored ? stored.token : null
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
            console.warn('[Classic] Failed to load style sources:', err.message);
            if (styleSourcesHintEl) styleSourcesHintEl.textContent = '';
        }
    }

    /** Shows what an empty field resolves to, using the server's own defaults. */
    function renderStyleSourcesHint() {
        if (!styleSourcesHintEl) return;
        styleSourcesHintEl.textContent = '';

        const explanation = document.createElement('span');
        explanation.textContent = getI18nText(
            'chat.styleSourcesHint',
            'Leave a field empty to use the built-in file. An address is either an https:// link or a path on this site.',
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
     * Validates one source, mirroring the server: empty, an absolute https URL, or a
     * path on this same origin.
     *
     * @returns {string|null} An error message, or null when acceptable
     */
    function validateStyleSource(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed) return null;

        if (trimmed.length > styleSourceMaxLength) {
            return getI18nText('chat.styleSourceTooLong', `Each address must be at most ${styleSourceMaxLength} characters.`, { max: styleSourceMaxLength });
        }
        if (trimmed.toLowerCase().indexOf('https://') === 0) {
            return trimmed.length <= 'https://'.length
                ? getI18nText('chat.styleSourceInvalidScheme', 'An address must start with https:// or be a path on this site, or be left empty.')
                : null;
        }
        if (isSameOriginPath(trimmed)) return null;

        return getI18nText('chat.styleSourceInvalidScheme', 'An address must start with https:// or be a path on this site, or be left empty.');
    }

    /**
     * Reports whether a value is a safe path on this same origin.
     *
     * Kept in step with the server-side check: `//host`, another scheme, and `..`
     * are refused because each resolves off-origin.
     */
    function isSameOriginPath(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed || trimmed.indexOf('//') === 0 || trimmed.indexOf('..') !== -1) return false;
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) return false;
        return /^[A-Za-z0-9._~/%?=&+-]+$/.test(trimmed);
    }

    /** Saves the three sources and reloads so they take effect. */
    /**
     * Validates the three sources and, when acceptable, asks the user to acknowledge
     * the risk. Nothing is written here: the validated values wait in
     * `pendingStyleSources` until the warning is confirmed.
     */
    function handleSaveStyleSources() {
        if (!window.OxypeCore) return;

        const html = styleSourceHtmlEl ? styleSourceHtmlEl.value.trim() : '';
        const css = styleSourceCssEl ? styleSourceCssEl.value.trim() : '';
        const js = styleSourceJsEl ? styleSourceJsEl.value.trim() : '';

        for (const value of [html, css, js]) {
            const problem = validateStyleSource(value);
            if (problem) {
                toast(problem, 'error');
                return;
            }
        }

        // Clearing every field restores the bundled files and introduces no
        // third-party code, so there is nothing to warn about.
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
     * Only built once; the nodes are cached in the module-level references.
     */
    function buildStyleSourcesRiskDialog() {
        if (styleSourcesRiskDialogEl) return styleSourcesRiskDialogEl;

        const dialog = document.createElement('div');
        dialog.id = 'styleSourcesRiskDialog';
        dialog.className = 'interactive-dialog classic-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'dialogStyleSourcesRiskTitle');
        dialog.style.display = 'none';

        // A scrim of our own rather than the page's #dialogOverlay: this warning must
        // stay self-contained so a page or stylesheet we do not control cannot leave it
        // invisible or non-modal.
        const scrim = document.createElement('div');
        scrim.id = 'styleSourcesRiskScrim';
        scrim.style.display = 'none';
        scrim.style.position = 'fixed';
        scrim.style.inset = '0';
        scrim.style.zIndex = '1000';
        scrim.style.backgroundColor = 'rgba(28, 22, 12, 0.42)';

        /*
         * The geometry below is inline because `.interactive-dialog` lives in the
         * overridable chat.css, not in the never-overridable style.css. On a page whose
         * custom stylesheet omits that class the dialog would fall into normal document
         * flow at the end of the body -- off-screen -- turning the "user must confirm"
         * step into a silent no-op.
         *
         * Appearance is expressed through the skin's own --cl-* tokens, each with a
         * plain fallback, so the retro face is kept when the classic skin is loaded and
         * a readable default is used otherwise. var() keeps both themes correct.
         */
        dialog.style.position = 'fixed';
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.transform = 'translate(-50%, -50%)';
        dialog.style.zIndex = '1001';
        dialog.style.boxSizing = 'border-box';
        dialog.style.width = 'min(440px, calc(100vw - 32px))';
        dialog.style.maxHeight = '86vh';
        dialog.style.overflowY = 'auto';
        dialog.style.padding = '14px';
        dialog.style.backgroundColor = 'var(--cl-face, var(--bg-surface, #ffffff))';
        dialog.style.color = 'var(--cl-text, var(--text-primary, #1e293b))';
        dialog.style.border = 'var(--cl-bevel, 1px) solid';
        dialog.style.borderColor = 'var(--cl-edge-light, var(--border-color, #e2e8f0)) ' +
            'var(--cl-edge-darker, var(--border-color, #e2e8f0)) ' +
            'var(--cl-edge-darker, var(--border-color, #e2e8f0)) ' +
            'var(--cl-edge-light, var(--border-color, #e2e8f0))';
        dialog.style.borderRadius = 'var(--cl-radius, 0px)';
        dialog.style.boxShadow = '3px 3px 0 rgba(0, 0, 0, 0.3)';

        const header = document.createElement('header');
        header.className = 'dialog-header';

        const title = document.createElement('h3');
        title.className = 'dialog-title';
        title.id = 'dialogStyleSourcesRiskTitle';
        title.textContent = getI18nText('chat.styleSourcesRiskTitle', 'Security Warning');

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.id = 'closeStyleSourcesRiskBtn';
        closeBtn.className = 'dialog-close-btn';
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
     * The form is hidden meanwhile so only one decision is on screen; cancelling
     * restores it with the typed values untouched.
     */
    function openStyleSourcesRiskDialog(sources) {
        pendingStyleSources = sources;

        // Built lazily so the markup exists even on a page we did not author.
        buildStyleSourcesRiskDialog();

        if (styleSourcesDialogEl) styleSourcesDialogEl.style.display = 'none';
        if (styleSourcesRiskScrimEl) styleSourcesRiskScrimEl.style.display = 'block';
        if (dialogOverlayEl) dialogOverlayEl.style.display = 'none';

        renderStyleSourcesRiskList(sources);

        // A fresh acknowledgement is required for every save, so accepting the risk
        // once cannot silently carry over to a later, different source.
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

    /** Lists the exact values being trusted, so none of them can hide in a summary. */
    function renderStyleSourcesRiskList(sources) {
        if (!styleSourcesRiskListEl) return;
        styleSourcesRiskListEl.textContent = '';

        const entries = [
            { label: 'chat.html', value: sources.html },
            { label: 'chat.css', value: sources.css },
            { label: 'chat.js', value: sources.js }
        ];

        for (const entry of entries) {
            if (!entry.value) continue;

            const item = document.createElement('li');

            const field = document.createElement('span');
            field.className = 'style-sources-risk-field';
            field.textContent = entry.label;

            const value = document.createElement('span');
            value.className = 'style-sources-risk-value';
            // Built with textContent so user input is never parsed as markup inside
            // our own trusted dialog.
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
        styleSourcesRiskConfirmBtnEl.style.opacity = acknowledged ? '' : '0.6';
        styleSourcesRiskConfirmBtnEl.style.cursor = acknowledged ? '' : 'default';
    }

    /**
     * Dismisses the warning without saving and returns to the form, whose contents
     * were never touched, so a value can be corrected rather than retyped.
     */
    function closeStyleSourcesRiskDialog() {
        if (styleSourcesRiskDialogEl) styleSourcesRiskDialogEl.style.display = 'none';
        if (styleSourcesRiskScrimEl) styleSourcesRiskScrimEl.style.display = 'none';
        if (styleSourcesRiskCheckboxEl) styleSourcesRiskCheckboxEl.checked = false;
        syncStyleSourcesRiskConfirmState();

        const hadPending = !!pendingStyleSources;
        pendingStyleSources = null;

        if (hadPending && styleSourcesDialogEl) {
            styleSourcesDialogEl.style.display = 'block';
            if (dialogOverlayEl) dialogOverlayEl.style.display = 'block';
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
     * Writes the three sources and reloads so they apply.
     *
     * @param {{html: string, css: string, js: string}} sources - Already-validated values
     */
    async function persistStyleSources(sources) {
        if (!window.OxypeCore) return;

        const stored = auth();
        if (styleSourcesSaveBtnEl) styleSourcesSaveBtnEl.disabled = true;
        if (styleSourcesRiskConfirmBtnEl) styleSourcesRiskConfirmBtnEl.disabled = true;
        try {
            await window.OxypeCore.updateStyleSources(
                {
                    chatHtmlSource: sources.html,
                    chatCssSource: sources.css,
                    chatJsSource: sources.js
                },
                stored ? stored.userId : null,
                stored ? stored.token : null
            );

            toast(getI18nText('chat.styleSourcesSaved', 'Style sources updated.'), 'success');
            // The page's stylesheet and scripts were chosen at boot, so only a reload
            // can pick up the new sources.
            setTimeout(() => window.location.reload(), 700);
        } catch (err) {
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.styleSourcesSaveFailed', `Failed to save: ${reason}`, { reason: reason }), 'error');
            // The save failed, so the acknowledgement is stale; re-arm it.
            if (styleSourcesRiskCheckboxEl) styleSourcesRiskCheckboxEl.checked = false;
        } finally {
            if (styleSourcesSaveBtnEl) styleSourcesSaveBtnEl.disabled = false;
            syncStyleSourcesRiskConfirmState();
        }
    }

    /** Clears the form; saving afterwards restores the built-in files. */
    function handleResetStyleSources() {
        if (styleSourceHtmlEl) styleSourceHtmlEl.value = '';
        if (styleSourceCssEl) styleSourceCssEl.value = '';
        if (styleSourceJsEl) styleSourceJsEl.value = '';
        renderStyleSourcesHint();
    }

    // -------------------------------------------------------------- profile ----

    function renderUserProfile() {
        if (!currentUser) return;
        const name = currentUser.username || `User #${currentUser.id}`;
        if (userAvatarEl) userAvatarEl.textContent = name.trim().charAt(0).toUpperCase() || 'U';
        if (userDisplayNameEl) userDisplayNameEl.textContent = name;
        if (userIdBadgeEl) userIdBadgeEl.textContent = `ID: ${currentUser.id}`;
    }

    /** Loads the profile and the list of joined conversations. */
    async function loadUserDataAndSessions(userId) {
        try {
            const profile = await window.OxypeCore.getUser(userId);
            if (profile && profile.username) {
                currentUser.username = profile.username;
                renderUserProfile();
            }
        } catch (err) {
            console.warn('[Classic] getUser failed:', err.message);
            if (err.isOffline) {
                toast(getI18nText('common.networkError', 'Unable to connect to server (Server offline)'), 'warning');
            }
        }

        try {
            const rawSessions = await window.OxypeCore.getJoinedSessions(userId);
            if (Array.isArray(rawSessions) && rawSessions.length > 0) {
                try {
                    const objects = await window.OxypeCore.getSessions(rawSessions);
                    if (Array.isArray(objects) && objects.length > 0) {
                        renderSessionList(objects);
                        return;
                    }
                } catch (batchErr) {
                    console.warn('[Classic] Batch getSessions failed:', batchErr.message);
                }
            }
            renderSessionList(rawSessions || []);
        } catch (err) {
            console.warn('[Classic] getJoinedSessions failed:', err.message);
            renderSessionList([]);
        }
    }

    // -------------------------------------------------------------- sidebar ----

    /**
     * Renders the conversation list from server data only.
     * @param {Array<Object|number>} sessions
     */
    function renderSessionList(sessions) {
        if (!sessionListEl) return;

        sessionListEl.querySelectorAll('.session-item').forEach(el => el.remove());

        if (!Array.isArray(sessions) || sessions.length === 0) {
            if (emptySessionsPlaceholderEl) emptySessionsPlaceholderEl.style.display = 'flex';
            return;
        }
        if (emptySessionsPlaceholderEl) emptySessionsPlaceholderEl.style.display = 'none';

        sessions.forEach(session => {
            const isObject = session && typeof session === 'object';
            const sessionId = isObject ? (session.sessionId || session.id) : session;
            if (sessionId === undefined || sessionId === null) return;

            const sessionName = isObject
                ? (session.sessionName || session.name || `Session #${sessionId}`)
                : `Session #${sessionId}`;
            const description = (isObject && session.description) ? session.description : '';

            sessionsMap.set(String(sessionId), { sessionId, sessionName, description });

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'session-item';
            btn.dataset.sessionId = String(sessionId);

            const avatarChar = sessionName.trim().charAt(0).toUpperCase() || '#';
            // The second line carries the latest message preview, filled in below.
            btn.innerHTML = `
                <div class="session-avatar">${escapeHtml(avatarChar)}</div>
                <div class="session-details">
                    <div class="session-name">${escapeHtml(sessionName)}</div>
                    <div class="session-subtext session-last-message"></div>
                </div>
            `;

            btn.addEventListener('click', () => selectSession(sessionId));
            sessionListEl.appendChild(btn);
        });

        // Resolve real names for conversations the batch call could not describe.
        const ids = sessions
            .map(s => (s && typeof s === 'object') ? (s.sessionId || s.id) : s)
            .filter(id => id !== undefined && id !== null);

        if (ids.length > 0) {
            window.OxypeCore.getSessions(ids).then(objects => {
                if (!Array.isArray(objects)) return;
                objects.forEach(obj => {
                    if (!obj) return;
                    const id = String(obj.sessionId || obj.id || obj.session_id);
                    const name = obj.sessionName || obj.name;
                    if (!name) return;

                    sessionsMap.set(id, { sessionId: id, sessionName: name, description: obj.description || '' });

                    const btn = sessionListEl.querySelector(`[data-session-id="${id}"]`);
                    if (btn) {
                        const nameEl = btn.querySelector('.session-name');
                        const avatarEl = btn.querySelector('.session-avatar');
                        if (nameEl) nameEl.textContent = name;
                        if (avatarEl) avatarEl.textContent = name.trim().charAt(0).toUpperCase() || '#';
                    }
                    if (String(activeSessionId) === id) {
                        if (activeSessionInfo) {
                            activeSessionInfo.sessionName = name;
                            activeSessionInfo.description = obj.description || '';
                        }
                        updateActiveSessionHeader();
                    }
                });
            }).catch(err => {
                console.warn('[Classic] Session metadata refresh failed:', err.message);
            });
        }

        // Fill each row's preview line with its most recent message.
        const userId = currentUserId();
        const stored = auth();
        sessions.forEach(session => {
            const sessionId = (session && typeof session === 'object') ? (session.sessionId || session.id) : session;
            if (sessionId === undefined || sessionId === null) return;

            window.OxypeCore.getLastMessage(sessionId, userId, stored ? stored.token : null)
                .then(lastMsg => {
                    const item = sessionListEl.querySelector(`[data-session-id="${String(sessionId)}"]`);
                    const previewEl = item ? item.querySelector('.session-last-message') : null;
                    if (!previewEl) return;
                    if (lastMsg && lastMsg.hasMessage && (lastMsg.content || lastMsg.senderName)) {
                        previewEl.textContent = `${lastMsg.senderName || 'User'}: ${lastMsg.content || ''}`;
                    } else {
                        previewEl.textContent = '';
                    }
                })
                .catch(err => {
                    console.warn(`[Classic] getLastMessage/${sessionId} failed:`, err.message);
                });
        });
    }

    /** Updates the preview line of the active row after sending. */
    function updateActiveSessionPreview(senderName, content) {
        if (!activeSessionId || !sessionListEl) return;
        const item = sessionListEl.querySelector(`[data-session-id="${activeSessionId}"]`);
        const previewEl = item ? item.querySelector('.session-last-message') : null;
        if (previewEl) {
            previewEl.textContent = content ? `${senderName || 'User'}: ${content}` : '';
        }
    }

    // -------------------------------------------------------------- session ----

    /** Loads a conversation's history, roster and metadata, then renders it. */
    async function selectSession(sessionId) {
        activeSessionId = sessionId;

        if (sessionListEl) {
            sessionListEl.querySelectorAll('.session-item').forEach(el => {
                el.classList.toggle('active', el.dataset.sessionId === String(sessionId));
            });
        }

        if (sessionSettingsBtnEl) sessionSettingsBtnEl.style.display = 'grid';
        setComposerEnabled(true);

        const stored = auth();
        const userId = currentUserId();

        // Conversation metadata plus the caller's role in it.
        try {
            const fetched = await window.OxypeCore.getSession(sessionId);
            if (fetched) {
                const entry = sessionsMap.get(String(sessionId)) || {};
                sessionsMap.set(String(sessionId), {
                    sessionId,
                    sessionName: fetched.sessionName || entry.sessionName || `Session #${sessionId}`,
                    description: fetched.description || entry.description || ''
                });
                activeSessionInfo = fetched;
            }
        } catch (err) {
            console.warn(`[Classic] getSession/${sessionId} failed:`, err.message);
            activeSessionInfo = null;
        }

        updateActiveSessionHeader();

        // Rebuild the transcript from scratch, including its date separators.
        if (messagesContainerEl) messagesContainerEl.innerHTML = '';
        lastRenderedDateKey = '';

        // Roster, so sender ids can be resolved to names.
        activeSessionUsers.clear();
        try {
            const memberInfo = await window.OxypeCore.getSessionUsers(sessionId, userId, stored ? stored.token : null);
            if (memberInfo && Array.isArray(memberInfo.users)) {
                memberInfo.users.forEach(u => {
                    if (u && u.userid !== null && u.userid !== undefined) {
                        activeSessionUsers.set(String(u.userid), u.username || `User #${u.userid}`);
                    }
                });
            }
        } catch (err) {
            console.warn(`[Classic] getSessionUsers/${sessionId} skipped:`, err.message);
        }

        // Message history around the last read sequence.
        try {
            const seq = await window.OxypeCore.getReceivedMessageSeq(userId, sessionId, stored ? stored.token : null);
            currentSeq = Number(seq) || 0;

            const start = (currentSeq - 50 > 0) ? (currentSeq - 50) : 0;
            const end = currentSeq + 50;

            const messages = await window.OxypeCore.getMessages(sessionId, start, end, userId, stored ? stored.token : null);

            if (Array.isArray(messages) && messages.length > 0) {
                if (messagesContainerEl) messagesContainerEl.innerHTML = '';
                messages.forEach(msg => {
                    const text = textOfMessage(msg);
                    if (!text) return;

                    const senderId = (msg.sender !== undefined && msg.sender !== null) ? msg.sender : msg.userid;
                    const isSelf = Boolean(userId !== null && userId !== undefined && senderId !== null
                        && senderId !== undefined && String(senderId) === String(userId));
                    const senderName = isSelf
                        ? (currentUser && currentUser.username ? currentUser.username : 'Me')
                        : (activeSessionUsers.get(String(senderId))
                            || (senderId !== null && senderId !== undefined ? `User #${senderId}` : 'User'));

                    const timestampMs = (msg.timestamp !== undefined && msg.timestamp !== null)
                        ? Number(msg.timestamp)
                        : 0;

                    appendMessage({
                        text,
                        sender: senderName,
                        isSelf,
                        timestamp: formatClockTime(timestampMs),
                        timestampMs
                    });
                });
            } else {
                showEmptyConversationHint();
            }
        } catch (err) {
            console.warn('[Classic] Failed to load message history:', err);
            showEmptyConversationHint();
        }

        if (messageInputEl) messageInputEl.focus();
    }

    /** Enables or disables the composer, which is inert until a conversation is picked. */
    function setComposerEnabled(enabled) {
        if (messageInputEl) messageInputEl.disabled = !enabled;
        if (sendMessageBtnEl) sendMessageBtnEl.disabled = !enabled;
    }

    /** Paints the active conversation's title and subtitle. */
    function updateActiveSessionHeader() {
        if (!activeSessionId) return;

        const info = activeSessionInfo || {};
        const entry = sessionsMap.get(String(activeSessionId)) || {};
        const name = info.sessionName || entry.sessionName || `Session #${activeSessionId}`;
        const description = info.description || entry.description || '';

        if (activeSessionNameEl) activeSessionNameEl.textContent = name;
        if (activeSessionDescriptionEl) {
            activeSessionDescriptionEl.textContent = description
                ? description
                : getI18nText('chat.sessionInfo', `Session ID: ${activeSessionId}`, { sessionId: activeSessionId });
        }
    }

    /** Shows the prompt displayed when no conversation is selected or it is empty. */
    function showEmptyConversationHint() {
        if (!messagesContainerEl) return;
        messagesContainerEl.innerHTML = '';

        const splash = document.createElement('div');
        splash.className = 'empty-chat-splash';
        splash.id = 'emptyConversationHint';
        splash.innerHTML = `
            <div class="empty-chat-splash-icon">
                <svg class="icon-svg" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
            </div>
            <div>${escapeHtml(activeSessionId
                ? getI18nText('chat.emptyConversation', 'No messages in this conversation yet.')
                : getI18nText('chat.selectSessionHint', 'Select a conversation from the sidebar to start chatting'))}</div>
        `;
        messagesContainerEl.appendChild(splash);
    }

    /** Appends the date separator for a newly crossed calendar day. */
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
     * Appends one message bubble.
     *
     * The date label above the first message of a new day is taken from that
     * message's own timestamp, so the separator always describes what follows it.
     *
     * @param {{text: string, sender: string, isSelf: boolean, timestamp: string, timestampMs?: number}} msg
     */
    function appendMessage(msg) {
        if (!messagesContainerEl) return;

        const key = dateKeyOf(msg.timestampMs);
        if (key && key !== lastRenderedDateKey) {
            appendDateSeparator(msg.timestampMs);
            lastRenderedDateKey = key;
        }

        const row = document.createElement('div');
        row.className = `message-row ${msg.isSelf ? 'outgoing' : 'incoming'}`;

        const senderName = msg.sender || 'User';
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

    // --------------------------------------------------------------- send ------

    async function handleSendMessage(e) {
        e.preventDefault();
        if (!activeSessionId || !messageInputEl) return;

        const text = messageInputEl.value.trim();
        if (!text) return;

        const stored = auth();
        const userId = currentUserId();

        messageInputEl.value = '';
        messageInputEl.focus();

        const hint = document.getElementById('emptyConversationHint');
        if (hint) hint.remove();

        // Draw the bubble immediately; the server assigns the authoritative stamp.
        const sentAtMs = Date.now();
        const myName = currentUser && currentUser.username ? currentUser.username : 'Me';
        appendMessage({
            text,
            sender: myName,
            isSelf: true,
            timestamp: formatClockTime(sentAtMs),
            timestampMs: sentAtMs
        });
        updateActiveSessionPreview(myName, text);

        try {
            const res = await window.OxypeCore.sendMessage(activeSessionId, text, userId, stored ? stored.token : null);
            if (res && typeof res.seq === 'number' && res.seq > 0) {
                currentSeq = res.seq;
            }
        } catch (err) {
            console.error('[Classic] Failed to send message:', err);
            const message = err.isOffline
                ? getI18nText('common.networkError', 'Unable to connect to server (Server offline)')
                : (err.message || getI18nText('common.error', 'Failed to send message'));
            toast(message, 'error');
        }
    }

    // -------------------------------------------------- create / join ----------

    async function handleCreateSessionSubmit(e) {
        e.preventDefault();

        const name = newSessionNameInputEl ? newSessionNameInputEl.value.trim() : '';
        if (!name) {
            toast(getI18nText('chat.createSessionErrEmpty', 'Please enter a conversation name.'), 'warning');
            if (newSessionNameInputEl) newSessionNameInputEl.focus();
            return;
        }

        const stored = auth();
        const userId = currentUserId();
        const description = newSessionDescInputEl ? newSessionDescInputEl.value.trim() : '';

        if (submitCreateSessionBtnEl) submitCreateSessionBtnEl.disabled = true;
        try {
            const response = await window.OxypeCore.createSession(
                name,
                description,
                stored ? stored.token : null,
                userId
            );
            const sessionId = (response && (response.session_id || response.sessionId || response.id)) || Date.now();

            closeAllDialogs();
            addNewSessionItem({ sessionId, sessionName: name, description });
            selectSession(sessionId);
            toast(getI18nText('chat.createSessionSuccess', 'Conversation created successfully!'), 'success');
        } catch (err) {
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
        } finally {
            if (submitCreateSessionBtnEl) submitCreateSessionBtnEl.disabled = false;
        }
    }

    /** Adds a freshly created conversation to the sidebar without a full refresh. */
    function addNewSessionItem(session) {
        if (!sessionListEl) return;
        if (emptySessionsPlaceholderEl) emptySessionsPlaceholderEl.style.display = 'none';

        const sessionId = String(session.sessionId);
        const sessionName = session.sessionName || `Session #${sessionId}`;
        sessionsMap.set(sessionId, { sessionId, sessionName, description: session.description || '' });

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'session-item';
        btn.dataset.sessionId = sessionId;

        const avatarChar = sessionName.trim().charAt(0).toUpperCase() || '#';
        btn.innerHTML = `
            <div class="session-avatar">${escapeHtml(avatarChar)}</div>
            <div class="session-details">
                <div class="session-name">${escapeHtml(sessionName)}</div>
                <div class="session-subtext session-last-message"></div>
            </div>
        `;
        btn.addEventListener('click', () => selectSession(sessionId));
        sessionListEl.appendChild(btn);
    }

    async function handleJoinSessionSubmit(e) {
        e.preventDefault();

        const uuid = joinUuidInputEl ? joinUuidInputEl.value.trim() : '';
        if (!uuid) {
            toast(getI18nText('chat.joinUuidErrEmpty', 'Please enter an invite UUID.'), 'warning');
            if (joinUuidInputEl) joinUuidInputEl.focus();
            return;
        }

        const stored = auth();
        const userId = currentUserId();

        if (joinSessionBtnEl) joinSessionBtnEl.disabled = true;
        try {
            const joined = await window.OxypeCore.joinSessionByUuid(uuid, userId, stored ? stored.token : null);
            closeAllDialogs();
            toast(getI18nText('chat.joinSuccess', 'Joined the conversation!'), 'success');

            const sessionId = joined && (joined.sessionId || joined.session_id || joined.id);
            if (sessionId !== undefined && sessionId !== null) {
                addNewSessionItem({
                    sessionId,
                    sessionName: joined.sessionName || `Session #${sessionId}`,
                    description: joined.description || ''
                });
                selectSession(sessionId);
            } else {
                await loadUserDataAndSessions(userId);
            }
        } catch (err) {
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.joinFailed', `Failed to join: ${reason}`, { reason: reason }), 'error');
        } finally {
            if (joinSessionBtnEl) joinSessionBtnEl.disabled = false;
        }
    }

    // ------------------------------------------------- conversation info -------

    async function openSessionSettingsDialog() {
        if (!activeSessionId) return;

        closeAllDialogs();
        if (dialogOverlayEl) dialogOverlayEl.style.display = 'block';
        if (sessionSettingsDialogEl) sessionSettingsDialogEl.style.display = 'block';

        await loadSessionSettings();
    }

    /**
     * Loads the active conversation's role and info, then its invite UUIDs.
     *
     * The first screen stays deliberately thin -- id, invites, leave -- with the
     * roster living in its own toast.
     */
    async function loadSessionSettings() {
        if (ssSessionIdEl) ssSessionIdEl.textContent = String(activeSessionId);

        const stored = auth();
        const userId = currentUserId();

        try {
            activeSessionInfo = await window.OxypeCore.getSessionInfo(activeSessionId, userId, stored ? stored.token : null) || null;
        } catch (err) {
            console.warn('[Classic] Failed to load session info:', err.message);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.loadFailed', `Failed to load: ${reason}`, { reason: reason }), 'error');
            return;
        }

        await loadSessionInvites();
    }

    /** Renders the invite UUIDs, which only the owner may see or manage. */
    async function loadSessionInvites() {
        if (!ssInviteListEl) return;

        const info = activeSessionInfo || {};
        if (!info.isOwner) {
            ssInviteListEl.innerHTML = '';
            if (ssCreateInviteBtnEl) ssCreateInviteBtnEl.style.display = 'none';
            if (ssInviteHintEl) ssInviteHintEl.textContent = '';
            return;
        }
        if (ssCreateInviteBtnEl) ssCreateInviteBtnEl.style.display = 'inline-flex';

        const stored = auth();
        const userId = currentUserId();

        let payload;
        try {
            payload = await window.OxypeCore.getSessionInvites(activeSessionId, userId, stored ? stored.token : null);
        } catch (err) {
            console.warn('[Classic] Failed to load invites:', err.message);
            ssInviteListEl.innerHTML = '';
            return;
        }

        const uuids = (payload && Array.isArray(payload.uuids)) ? payload.uuids : [];
        const max = (payload && payload.max) ? payload.max : 10;

        if (ssInviteHintEl) {
            ssInviteHintEl.textContent = getI18nText('chat.invitesHint', `Up to ${max} invite UUIDs per conversation.`, { max });
        }

        ssInviteListEl.innerHTML = '';

        if (uuids.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'invite-empty';
            empty.textContent = getI18nText('chat.noInvites', 'No invite UUIDs yet.');
            ssInviteListEl.appendChild(empty);
            return;
        }

        uuids.forEach(uuid => {
            // Older records stored the UUID wrapped in quotes; strip them for display.
            const cleanUuid = String(uuid || '').replace(/^"|"$/g, '').trim();
            if (!cleanUuid) return;

            const row = document.createElement('div');
            row.className = 'invite-item';

            const code = document.createElement('span');
            code.className = 'invite-code';
            code.textContent = cleanUuid;

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'invite-copy-btn';
            copyBtn.textContent = getI18nText('chat.copyInviteBtn', 'Copy');
            copyBtn.addEventListener('click', () => handleCopyInvite(cleanUuid));

            const revokeBtn = document.createElement('button');
            revokeBtn.type = 'button';
            revokeBtn.className = 'invite-revoke-btn';
            revokeBtn.textContent = getI18nText('chat.revokeInviteBtn', 'Revoke');
            revokeBtn.addEventListener('click', () => handleRevokeInvite(cleanUuid));

            row.appendChild(code);
            row.appendChild(copyBtn);
            row.appendChild(revokeBtn);
            ssInviteListEl.appendChild(row);
        });
    }

    /** Copies an invite UUID to the clipboard. */
    function handleCopyInvite(uuid) {
        const done = () => toast(getI18nText('chat.copied', 'Copied to clipboard'), 'success');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(uuid).then(done).catch(() => { });
        }
    }

    /** Generates a new invite UUID (owner only). */
    async function handleCreateInvite() {
        const stored = auth();
        const userId = currentUserId();

        if (ssCreateInviteBtnEl) ssCreateInviteBtnEl.disabled = true;
        try {
            await window.OxypeCore.createSessionInvite(activeSessionId, userId, stored ? stored.token : null);
            await loadSessionInvites();
        } catch (err) {
            console.error('[Classic] Create invite failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            const message = /maximum|invite uuid/i.test(reason)
                ? getI18nText('chat.inviteLimitReached', 'This conversation already has the maximum invite UUIDs.', { max: 10 })
                : getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason });
            toast(message, 'error');
        } finally {
            if (ssCreateInviteBtnEl) ssCreateInviteBtnEl.disabled = false;
        }
    }

    /** Revokes an invite UUID (owner only). */
    async function handleRevokeInvite(uuid) {
        const cleanUuid = String(uuid || '').replace(/^"|"$/g, '').trim();
        const stored = auth();
        const userId = currentUserId();

        try {
            await window.OxypeCore.revokeSessionInvite(activeSessionId, cleanUuid, userId, stored ? stored.token : null);
            await loadSessionInvites();
        } catch (err) {
            console.error('[Classic] Revoke invite failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
        }
    }

    /** Leaves the active conversation and drops it from the sidebar. */
    async function handleLeaveSession() {
        if (!window.confirm(getI18nText('chat.leaveConfirm', 'Leave this conversation?'))) return;

        const stored = auth();
        const userId = currentUserId();
        const leavingId = activeSessionId;

        try {
            await window.OxypeCore.leaveSession(leavingId, userId, stored ? stored.token : null);
            closeAllDialogs();

            const item = sessionListEl ? sessionListEl.querySelector(`[data-session-id="${leavingId}"]`) : null;
            if (item) item.remove();
            sessionsMap.delete(String(leavingId));

            activeSessionId = null;
            activeSessionInfo = null;
            activeSessionUsers.clear();
            if (sessionSettingsBtnEl) sessionSettingsBtnEl.style.display = 'none';
            if (activeSessionNameEl) activeSessionNameEl.textContent = '--';
            if (activeSessionDescriptionEl) activeSessionDescriptionEl.textContent = '';
            setComposerEnabled(false);
            showEmptyConversationHint();

            if (sessionListEl && sessionListEl.querySelectorAll('.session-item').length === 0
                && emptySessionsPlaceholderEl) {
                emptySessionsPlaceholderEl.style.display = 'flex';
            }

            toast(getI18nText('chat.leaveSuccess', 'You left the conversation.'), 'success');
        } catch (err) {
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
        }
    }

    // ------------------------------------------------------------- members -----

    async function openMembersDialog() {
        if (!activeSessionId) return;

        closeAllDialogs();
        if (dialogOverlayEl) dialogOverlayEl.style.display = 'block';
        if (membersDialogEl) membersDialogEl.style.display = 'block';

        await loadSessionMembers();
    }

    /** Renders the roster, with removal offered only where the server would allow it. */
    async function loadSessionMembers() {
        if (!ssMemberListEl) return;

        const stored = auth();
        const userId = currentUserId();

        let payload;
        try {
            payload = await window.OxypeCore.getSessionUsers(activeSessionId, userId, stored ? stored.token : null);
        } catch (err) {
            console.warn('[Classic] Failed to load members:', err.message);
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
            if (isSelf) {
                const you = getI18nText('chat.memberYou', 'You');
                role = role ? `${role} · ${you}` : you;
            }

            const name = u.username || `User #${memberId}`;
            const row = document.createElement('div');
            row.className = 'member-item';
            row.innerHTML = `
                <div class="member-avatar">${escapeHtml(name.trim().charAt(0).toUpperCase() || '#')}</div>
                <div class="member-meta">
                    <div class="member-name">${escapeHtml(name)}</div>
                    <div class="member-role">${escapeHtml(role)}</div>
                </div>
            `;

            // Mirrors the server rules: never the owner, never yourself, and only the
            // owner may remove a peer administrator.
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

    /** Removes a member from the active conversation. */
    async function handleRemoveMember(targetUserId) {
        if (!window.confirm(getI18nText('chat.removeMemberConfirm', 'Remove this member from the conversation?'))) return;

        const stored = auth();
        const userId = currentUserId();

        try {
            await window.OxypeCore.removeSessionMember(activeSessionId, targetUserId, userId, stored ? stored.token : null);
            await loadSessionMembers();
            toast(getI18nText('chat.removeMemberSuccess', 'Member removed.'), 'success');
        } catch (err) {
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
        }
    }

    // -------------------------------------------------------------- logout -----

    function handleLogout() {
        if (window.OxypeCore) window.OxypeCore.clearAuth();
        // This page lives one level below the client root.
        window.location.href = '../index.html';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
