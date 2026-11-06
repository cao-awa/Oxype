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
    // One preview re-read per conversation at a time. A delete made here also comes
    // back as a broadcast, and both paths ask the server the same question.
    const previewRefreshes = new Map();

    // Roster of the active conversation, keyed by user id, for sender names
    const activeSessionUsers = new Map();
    let activeSessionInfo = null;

    // Calendar day of the last rendered message, so each date gets one separator
    let lastRenderedDateKey = '';
    let currentSeq = 0;
    let websocketListenerBound = false;
    let historyLoadingSessionId = null;
    const pendingRealtimeMessages = new Map();
    const renderedMessageKeys = new Set();
    // Cache both in-flight and completed profile lookups so one sender is requested once.
    const senderProfilePromises = new Map();

    // Scrollback paging. Older messages are fetched when the reader scrolls all the way
    // up to the oldest loaded message, one page per arrival at that point.
    // One page is deliberately large: the reader scrolls a long way before another
    // request is made, so the transcript never pulls in earlier messages while the
    // ones already on screen are still being read.
    const HISTORY_PAGE_SIZE = 200;
    // A conversation whose messages were deleted in bulk would otherwise turn every
    // upward scroll into an endless chain of requests, so the descent gives up.
    const HISTORY_MAX_EMPTY_PAGES = 10;
    let historyOldestSeq = null;
    let historyReachedTop = false;
    let historyPageInFlight = false;
    let historyEmptyPageStreak = 0;
    let historyCheckScheduled = false;

    // ------------------------------------------------------- calibration -----
    //
    // Live updates arrive as broadcasts, and a broadcast is a promise this client cannot
    // keep: a frame lost while the socket was reconnecting, or while the tab was asleep,
    // is never replayed. Nothing repairs that on its own -- the transcript keeps showing
    // a message that was deleted, hides one that was sent, and keeps the old text of one
    // that was edited, all until the conversation is re-opened.
    //
    // So the view reconciles itself against the server on a timer. It is far too small a
    // budget to load a conversation: one bounded read at the tail for new messages, one
    // sliding window over what is already on screen to find deletions and edits, and a
    // few sidebar previews per pass. Nothing else.
    //
    // It is deliberately invisible. No spinner, no toast, no jump -- a correction the
    // reader did not ask for should not be able to interrupt reading, and the repaired
    // transcript is indistinguishable from one that was never wrong.

    /** How often a pass runs. Long enough to stay out of the server's way, short enough
     *  that a lost broadcast is measured in seconds rather than in a re-open. */
    const CALIBRATION_INTERVAL_MS = 10000;

    /** How many sequences one range read spans. The tail read and the verification
     *  window both cap at this; a gap longer than it is filled over several passes. */
    const CALIBRATION_VERIFY_SPAN = 200;

    /** How close to the newest message still counts as "at the bottom". Inside this the
     *  view follows new arrivals; outside it, the reader's position is preserved. */
    const NEAR_BOTTOM_SLOP_PX = 48;

    /** Sidebar previews re-read per pass, so a long list costs nothing up front. */
    const CALIBRATION_PREVIEWS_PER_PASS = 3;

    /** A single read may not outlive the pass that started it. */
    const CALIBRATION_REQUEST_TIMEOUT_MS = 8000;

    let calibrationTimer = null;
    let calibrationInFlight = false;
    /** Bumped whenever the cycle restarts or is torn down; an older number is a discarded
     *  pass whose response must not be painted anywhere. */
    let calibrationGeneration = 0;
    /** Where the verification window resumes on the next pass, or null to restart from
     *  the oldest rendered message. */
    let calibrationVerifyFrom = null;
    let calibrationVerifySessionId = null;
    /** Sidebar preview walk position, so no conversation is skipped. */
    let calibrationPreviewCursor = 0;

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
    let messageFormatOptionsEl;
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
    let ssSessionNameEl;
    let ssSessionDescEl;
    let ssSessionOwnerEl;
    let ssSessionIdEl;
    let sessionManageSectionEl;
    let ssEditFormEl;
    let ssNameInputEl;
    let ssDescInputEl;
    let ssSaveBtnEl;
    let ssInviteSectionEl;
    let ssInviteHintEl;
    let ssInviteListEl;
    let ssCreateInviteBtnEl;
    let openMembersBtnEl;
    let ssLeaveBtnEl;

    let membersDialogEl;
    let closeMembersBtnEl;
    let ssMemberListEl;

    // Per-member management toast, reached through the "Manage" button on a member row
    let memberManageDialogEl;
    let closeMemberManageBtnEl;
    let mmMemberNameEl;
    let mmMemberRoleEl;
    let mmGrantAdminBtnEl;
    let mmRevokeAdminBtnEl;
    let mmRemoveBtnEl;
    /** The member row the per-member toast is currently acting on, if any. */
    let memberManageTarget = null;

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

    // Avatar toast and the conversation-avatar controls inside Conversation Info.
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
    /** What the server has said about each avatar, keyed "user:7" / "session:22". */
    const avatarUrlCache = new Map();
    let avatarMaxBytes = 3 * 1024 * 1024;
    /** The conversation whose avatar the settings toast is currently editing. */
    let ssAvatarTargetSessionId = null;

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

    // Right-click message actions. One menu element is reused and moved between rows
    // instead of one per message, so the DOM does not grow with the conversation and the
    // row under the pointer is the only state that has to be tracked.
    let messageMenuEl = null;
    let messageMenuTargetRow = null;

    // The row currently being edited in place, if any. A second menu cannot start a
    // second editor, so this also acts as the "one edit at a time" latch.
    let editingRow = null;

    // A touch has no right button, so the same menu is raised by a long press. The
    // pending press is tracked here so movement, a scroll, or lifting the finger can
    // cancel it before it fires.
    let longPressTimer = null;
    let longPressStart = null;
    const LONG_PRESS_MS = 500;
    const LONG_PRESS_SLOP = 10;

    // The message the next send answers, if any. Replying belongs to the composer
    // rather than to a message: it survives editing the draft and is cleared by
    // sending, cancelling, or leaving the conversation. Only the id is authoritative;
    // the name and body are kept so the bar's label can be drawn without asking the
    // server about a message already on screen.
    let replyTarget = null;
    // The strip above the composer announcing the pending reply. Built here rather
    // than read from the page, because a user-supplied chat.html will not contain
    // markup added later.
    let replyBarEl = null;
    // A leftward drag along a row on a touch screen. Kept apart from the long-press
    // state because the two gestures start identically and only separate once the
    // finger has travelled far enough to have a direction.
    let swipeState = null;
    const REPLY_SWIPE_TRIGGER_PX = 64;
    const REPLY_SWIPE_MAX_PX = 96;
    // A swipe has to be decisively sideways before it counts. Anything shallower is a
    // scroll that wobbled, and answering it with a reply would be a false positive.
    const REPLY_SWIPE_AXIS_RATIO = 1.4;
    const REPLY_JUMP_MAX_PAGES = 20;

    // Mobile drawer. On a narrow screen the rail covers the conversation, so it is only
    // on screen when it was asked for. Both the toggle and the scrim are built here
    // rather than read from the page, because a user-supplied chat.html will not contain
    // markup added later. See ensureRailControls().
    let railEl = null;
    let railToggleEl = null;
    let railScrimEl = null;

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

    /**
     * Pulls the readable body out of a stored message record, and says how it is meant
     * to be rendered.
     *
     * A body counts as Markdown only when a piece says so, so a plain-text message is
     * never reinterpreted as markup.
     *
     * @param {Object} msg
     * @returns {{text: string, format: 'text'|'markdown', reply: Object|null}}
     */
    function bodyOfMessage(msg) {
        if (Array.isArray(msg.pieces)) {
            // A Markdown piece wins if a message somehow carries both, so a body can
            // never be silently downgraded to literal text.
            const markdown = msg.pieces.filter(p => p && p.type === 'markdown');
            const source = (markdown.length > 0 ? markdown : msg.pieces.filter(p => p && p.type === 'text'))
                .map(p => (typeof p.text === 'string' ? p.text : ''))
                .join('');
            return {
                text: source,
                format: markdown.length > 0 ? 'markdown' : 'text',
                // The quotation is carried by the message, not derived from it, and it is
                // reported beside the body rather than inside it: it is context for the
                // words, not part of them. Anything that only wants the words (a rail
                // preview, the editor's seed text) therefore gets them alone.
                reply: replyPieceOf(msg.pieces)
            };
        }
        if (typeof msg.pieces === 'string') return { text: msg.pieces, format: 'text', reply: null };
        if (typeof msg.text === 'string') return { text: msg.text, format: 'text', reply: null };
        return { text: '', format: 'text', reply: null };
    }

    /**
     * Reads the quotation out of a reply's pieces.
     *
     * The server fills in the quoted sender and words when the reply is written, so
     * they are already here and no lookup is needed to draw the quotation.
     * @param {Array<Object>} pieces
     * @returns {{messageId: string, sender: string, senderName: string, text: string}|null}
     */
    function replyPieceOf(pieces) {
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
     * How the outgoing body should be interpreted. The value is sent as the message
     * piece type, so it travels with the message rather than being re-decided later.
     */
    const MESSAGE_FORMATS = ['text', 'markdown'];
    const MESSAGE_FORMAT_STORAGE_KEY = 'oxype_message_format';
    /** Tallest the composer textarea may grow before it scrolls, in pixels. */
    const COMPOSER_MAX_HEIGHT = 200;

    /** Reads the remembered body format, falling back to plain text. */
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

    /** The body format currently selected in Settings.
     *
     * The choice lives in storage alone; that also keeps the answer correct when a
     * user-supplied chat.html omits the control.
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
     */
    function applyMessageFormat(format) {
        if (MESSAGE_FORMATS.indexOf(format) === -1) return;
        writeStoredMessageFormat(format);
        paintMessageFormatTrigger();
        updateComposerForFormat();
        toast(formatLongLabel(format), 'success');
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
        // borders keeps the grown box an exact fit instead of 4px short, which would
        // otherwise show a scrollbar and drift against the format selector.
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
     * Renders a message body to HTML.
     *
     * Plain text is escaped and its newlines preserved. Markdown goes through the
     * bundled renderer, which escapes before it parses and only emits whitelisted tags.
     * If the renderer is missing, the source is shown as escaped text rather than
     * trusted.
     */
    function renderMessageBody(text, format) {
        if (format === 'markdown' && window.OxypeMarkdown
            && typeof window.OxypeMarkdown.toHtml === 'function') {
            return window.OxypeMarkdown.toHtml(text);
        }
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    /** A one-line preview of a body for the rail, with its line breaks flattened. */
    function previewOfBody(text) {
        return String(text === null || text === undefined ? '' : text)
            .replace(/[\r\n]+/g, ' ')
            .trim();
    }

    // ------------------------------------------------------------- replies -----

    /**
     * Renders the quotation block above a reply's body.
     *
     * The block is a button, not a div, because its whole purpose is to be pressed:
     * that makes it keyboard-reachable and announces it as something that acts.
     * Absent a quotation (not a reply at all) it emits nothing, so a plain message's
     * markup is unchanged.
     * @param {{messageId: string, senderName: string, text: string}|null} reply
     * @returns {string} HTML, already escaped
     */
    function renderReplyQuote(reply) {
        if (!reply || !reply.messageId) return '';
        const name = reply.senderName || getI18nText('chat.replyQuoteUnknownSender', 'a message');
        const body = previewOfBody(reply.text);
        // The body is clipped by CSS rather than truncated here, so the full text is
        // still in the markup for a screen reader and for find-in-page.
        return `<button type="button" class="message-reply-quote" data-reply-to="${escapeHtml(reply.messageId)}"`
            + ` title="${escapeHtml(getI18nText('chat.replyJumpTitle', 'Jump to the quoted message'))}">`
            + `<span class="message-reply-quote-name">${escapeHtml(name)}</span>`
            + `<span class="message-reply-quote-text">${escapeHtml(body)}</span>`
            + `</button>`;
    }

    /**
     * Scrolls a row into view and flashes it, so the eye can find it.
     *
     * The flash is a class with a CSS animation; it is removed when the animation
     * ends rather than on a timer, so a row re-rendered mid-flash cannot be left
     * permanently highlighted.
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
     * transcript is in the DOM, so a jump that gave up whenever the row was absent
     * would fail for exactly the messages a reply is most likely to quote.
     * @param {string} messageId
     * @returns {Promise<boolean>} whether the row was found and revealed
     */
    async function jumpToMessage(messageId) {
        if (!messageId || !messagesContainerEl) return false;
        const existing = findMessageRow(messageId);
        if (existing) {
            revealMessageRow(existing);
            return true;
        }

        const sessionId = activeSessionId;
        for (let page = 0; page < REPLY_JUMP_MAX_PAGES; page += 1) {
            if (historyReachedTop || historyOldestSeq === null) break;
            // A page already in flight makes loadOlderMessages return at once without
            // loading anything, so wait for it to settle first; otherwise the loop
            // would spend its whole budget on a single real request.
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

    /** Click handler for a quotation block: jumps back to the message it quotes. */
    async function handleReplyQuoteClick(e) {
        const quote = e.target && e.target.closest ? e.target.closest('.message-reply-quote') : null;
        if (!quote || !messagesContainerEl || !messagesContainerEl.contains(quote)) return;
        e.preventDefault();
        e.stopPropagation();
        const messageId = quote.dataset.replyTo;
        if (!messageId) return;
        const found = await jumpToMessage(messageId);
        if (!found) {
            toast(getI18nText('chat.replyJumpFailed', 'That message is no longer reachable.'), 'error');
        }
    }

    /**
     * Builds the strip above the composer that announces the pending reply.
     *
     * One element is reused across replies, styled by the classic sheet, and hidden
     * by default so a page that never replies is laid out exactly as before.
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
        // "Cancel reply" beside every draft would take more room than the draft.
        cancelBtn.textContent = '\u00d7';
        cancelBtn.setAttribute('aria-label', getI18nText('chat.replyBarCancel', 'Cancel reply'));
        cancelBtn.title = getI18nText('chat.replyBarCancel', 'Cancel reply');
        cancelBtn.addEventListener('click', () => clearReplyTarget());

        bar.appendChild(text);
        bar.appendChild(cancelBtn);

        // Placed inside the composer's own stack, directly above the input row: the
        // composer is the element that owns "what the next send will be".
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

    /** Starts replying to a message, i.e. arms the composer with a quotation. */
    function startReplyToMessage(row) {
        if (!row || !row.dataset.messageId) return;
        // What is quoted is the message the reader pointed at: its own words and its
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
        // about to look anyway. Deferred: the bar's layout has just changed and
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

    // ---------------------------------------------------- message actions ------

    /**
     * Whether the current viewer may change or remove this message.
     *
     * The server applies the same rule (the author, or a session administrator, which
     * counts the owner), but the menu is suppressed instead of shown and then refused:
     * offering an action whose only possible outcome is an error is worse than not
     * offering it at all.
     */
    /** Whether the current viewer wrote this message. */
    function isOwnMessage(row) {
        if (!row) return false;
        const myId = currentUserId();
        return myId !== null && myId !== undefined && row.dataset.senderId === String(myId);
    }

    /**
     * Whether the current viewer moderates this session.
     *
     * The server treats the owner as an administrator, so `isOwner` is folded in
     * here rather than tested by each caller.
     */
    function canModerate() {
        const info = activeSessionInfo || {};
        return !!(info.isOwner || info.isAdmin);
    }

    /**
     * Whether the current viewer may rewrite this message. Only its author may:
     * moderation removes messages (see [canDeleteMessage]) rather than putting
     * words in another member's mouth, and the server enforces that split.
     */
    function canEditMessage(row) {
        return isOwnMessage(row);
    }

    /** Whether the current viewer may remove this message: its author, or a moderator. */
    function canDeleteMessage(row) {
        return isOwnMessage(row) || canModerate();
    }

    /**
     * Whether the action menu should open for this row at all. The menu is
     * suppressed instead of shown and then refused: offering an action whose only
     * possible outcome is an error is worse than not offering it at all.
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
     */
    function canReplyToMessage(row) {
        return !!(row && row.dataset.messageId);
    }

    /** Whether the action menu should open for this row at all. */
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
        // has a stable first item instead of starting with whichever action this
        // viewer happens to have on this row.
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

    /** Opens the action menu for a row at the pointer. */
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
        // message gets only the delete entry.
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
     * The desktop counterpart of the touch swipe. It stands down while a row is being
     * edited, where a double click selects a word rather than acting on the message.
     *
     * Note what it does *not* test: whether text is selected. By the time this event
     * arrives the browser has already selected the word under the pointer, so such a
     * test can never pass. Text is selected by dragging, and a drag fires no double
     * click at all, so the two gestures cannot be confused.
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
     * first to pass its threshold claims the gesture: [handleMessageTouchMove]
     * cancels the press the moment the finger travels, and the swipe cancels itself
     * if the finger goes down rather than sideways.
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
     * Tracks finger movement while it is down, and drives the reply swipe.
     *
     * The press is cancelled once the finger travels further than it wobbles on one
     * spot. The same movement may turn the touch into a reply swipe: travelling
     * mostly sideways is a swipe, travelling mostly vertically is a scroll, and the
     * direction is decided once and then held so a gesture cannot flip halfway.
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
                    // The gesture is a swipe now, so the press racing it must not fire.
                    cancelLongPress();
                    swipeState.row.classList.add('is-swipe-armed');
                }
            }
            if (swipeState && swipeState.axis === 'x') {
                // Damped past the trigger point so the row stops following the finger
                // once the gesture has succeeded, which reads as a limit.
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

    /** Ends a swipe: replies if it passed the trigger distance, and resets the row. */
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

    /** Finds the row for a server message id, if it is on screen. */
    function findMessageRow(messageId) {
        if (!messagesContainerEl || messageId === undefined || messageId === null) return null;
        return messagesContainerEl.querySelector(`.message-row[data-message-id="${String(messageId)}"]`);
    }

    /**
     * Gives a server id to the optimistic row that this echo corresponds to.
     *
     * A message sent from another device signed in to the same account arrives
     * here as a broadcast of our own message. The optimistic row on this screen
     * has no id yet —the HTTP response that names it may still be in flight —so
     * id-based de-duplication cannot see it. Matching on the exact body of an
     * unidentified outgoing row is the only thing that ties the two together, and
     * it keeps the transcript free of a duplicate pair.
     *
     * The oldest match wins. Echoes arrive in the order the server numbered the
     * messages, and unidentified rows sit in the order they were typed, so pairing
     * them up in the same order keeps two identical texts ("ok", "ok") from being
     * crossed over onto each other's ids.
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

    /** Paints an "edited" marker after the clock time, keeping the original time. */
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

    /** Repaints a row's body from a message and flags it as edited. */
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
        row.oxypeMessage = { text: body.text, format: body.format === 'markdown' ? 'markdown' : 'text', reply: body.reply || (row.oxypeMessage && row.oxypeMessage.reply) || null };
        markMessageEdited(row);
    }

    /**
     * Replaces a message body with a textarea plus Save and Cancel.
     *
     * The edit happens inside the row rather than in a dialog so the message stays in
     * view and in context while it is being changed.
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
        cancelBtn.className = 'classic-btn message-editor-cancel';
        cancelBtn.textContent = getI18nText('common.cancel', 'Cancel');

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'classic-btn classic-btn-primary message-editor-save';
        saveBtn.textContent = getI18nText('common.save', 'Save');
        // Whitespace-only text is not a message, so nothing can be saved until the
        // content has something in it —the same bar the composer applies on send.
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

    /** Tears down the in-place editor and puts the rendered body back. */
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
        const stored = auth();
        const userId = currentUserId();
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
                activeSessionId, messageId, content, userId, stored ? stored.token : null, format
            );
            const edited = res && res.success === true ? res.message : null;
            if (!edited) {
                throw new Error(getI18nText('chat.messageEditForbidden',
                    'Only the author can edit this message.'));
            }
            endMessageEdit(row);
            applyMessageEdit(row, bodyOfMessage(edited));
            toast(getI18nText('chat.messageEditSaved', 'Message updated.'), 'success');
        } catch (err) {
            console.error('[Classic] Edit message failed:', err);
            // The editor stays open with its text so a failed request does not throw
            // away what the user just typed.
            if (saveBtn) saveBtn.disabled = false;
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.messageEditFailed', `Failed to edit: ${reason}`, { reason: reason }), 'error');
        }
    }

    /**
     * Removes a row and forgets its dedupe key.
     *
     * Dropping the key matters: without it a replayed history window or a late
     * broadcast would render the deleted message again.
     *
     * @param {HTMLElement} row
     * @param {boolean} [deferRegroup] skip the sender regrouping because the caller is
     *        removing several rows and will regroup once when it is done
     */
    function removeMessageRow(row, deferRegroup) {
        if (!row) return;
        if (editingRow === row) editingRow = null;
        const messageId = row.dataset.messageId;
        if (messageId) renderedMessageKeys.delete(String(activeSessionId) + ':' + String(messageId));
        row.remove();
        // The avatar and sender label of the following row depended on this one being
        // part of the group, so the grouping is recomputed -- unless a batch removal is
        // in progress, where regrouping per row would be quadratic and pointless.
        if (deferRegroup === true) return;
        refreshRenderedSenderGroups();
    }

    /**
     * Deletes a message after confirmation, then drops its row.
     *
     * The row goes as soon as the server agrees rather than waiting for the broadcast:
     * the broadcast reaches this client too, but a change the user just asked for
     * should not wait for a round trip to become visible.
     */
    async function handleDeleteMessage(row) {
        if (!row || !activeSessionId) return;
        const messageId = row.dataset.messageId;
        if (!messageId) return;
        const confirmMsg = getI18nText('chat.messageDeleteConfirm',
            'Delete this message? Everyone will lose it, and this cannot be undone.');
        if (!window.confirm(confirmMsg)) return;

        const stored = auth();
        const userId = currentUserId();
        try {
            const res = await window.OxypeCore.deleteMessage(
                activeSessionId, messageId, userId, stored ? stored.token : null
            );
            if (!res || res.success !== true) {
                throw new Error(getI18nText('chat.messageDeleteForbidden',
                    'Only the author or a conversation admin can delete this message.'));
            }
            removeMessageRow(row);
            // The preview may have been this very message, so ask the server which
            // message is newest now rather than leaving a preview for something gone.
            refreshSessionPreview(activeSessionId);
            toast(getI18nText('chat.messageDeleted', 'Message deleted.'), 'success');
        } catch (err) {
            console.error('[Classic] Delete message failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.messageDeleteFailed', `Failed to delete: ${reason}`, { reason: reason }), 'error');
        }
    }

    /**
     * Applies an edit broadcast, whether it came from another member or from this
     * client's own request.
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
        applyMessageEdit(row, bodyOfMessage(msg));
    }

    /**
     * Applies a delete broadcast, whether it came from another member or from this
     * client's own request.
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
        messageFormatOptionsEl = document.getElementById('messageFormatOptions');
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
        ssSessionNameEl = document.getElementById('ssSessionName');
        ssSessionDescEl = document.getElementById('ssSessionDesc');
        ssSessionOwnerEl = document.getElementById('ssSessionOwner');
        ssSessionIdEl = document.getElementById('ssSessionId');
        sessionManageSectionEl = document.getElementById('sessionManageSection');
        ssEditFormEl = document.getElementById('ssEditForm');
        ssNameInputEl = document.getElementById('ssNameInput');
        ssDescInputEl = document.getElementById('ssDescInput');
        ssSaveBtnEl = document.getElementById('ssSaveBtn');
        ssInviteSectionEl = document.getElementById('ssInviteSection');
        ssInviteHintEl = document.getElementById('ssInviteHint');
        ssInviteListEl = document.getElementById('ssInviteList');
        ssCreateInviteBtnEl = document.getElementById('ssCreateInviteBtn');
        openMembersBtnEl = document.getElementById('openMembersBtn');
        ssLeaveBtnEl = document.getElementById('ssLeaveBtn');

        membersDialogEl = document.getElementById('membersDialog');
        closeMembersBtnEl = document.getElementById('closeMembersBtn');
        ssMemberListEl = document.getElementById('ssMemberList');

        memberManageDialogEl = document.getElementById('memberManageDialog');
        closeMemberManageBtnEl = document.getElementById('closeMemberManageBtn');
        mmMemberNameEl = document.getElementById('mmMemberName');
        mmMemberRoleEl = document.getElementById('mmMemberRole');
        mmGrantAdminBtnEl = document.getElementById('mmGrantAdminBtn');
        mmRevokeAdminBtnEl = document.getElementById('mmRevokeAdminBtn');
        mmRemoveBtnEl = document.getElementById('mmRemoveBtn');

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

        // The security warning is built on demand rather than read from the page: a
        // user-supplied chat.html performs the save too, and such a page will not
        // contain markup added here. See buildStyleSourcesRiskDialog().

        // The drawer controls are built for the same reason, on the same page.
        ensureRailControls();

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

        if (window.OxypeWebSocket) {
            bindWebSocketMessages();
            window.OxypeWebSocket.start(stored);
        }
        startCalibration();

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
        if (ssEditFormEl) ssEditFormEl.addEventListener('submit', handleSaveSessionChanges);
        if (openMembersBtnEl) openMembersBtnEl.addEventListener('click', openMembersDialog);

        if (closeMembersBtnEl) closeMembersBtnEl.addEventListener('click', closeAllDialogs);

        // Per-member management toast
        if (closeMemberManageBtnEl) closeMemberManageBtnEl.addEventListener('click', closeAllDialogs);
        if (mmGrantAdminBtnEl) mmGrantAdminBtnEl.addEventListener('click', () => handleSetMemberAdmin(true));
        if (mmRevokeAdminBtnEl) mmRevokeAdminBtnEl.addEventListener('click', () => handleSetMemberAdmin(false));
        if (mmRemoveBtnEl) {
            mmRemoveBtnEl.addEventListener('click', () => {
                const target = memberManageTarget;
                if (!target || !target.user) return;
                const targetUserId = target.user.userid;
                closeAllDialogs();
                handleRemoveMember(targetUserId);
            });
        }

        if (settingsBtnEl) settingsBtnEl.addEventListener('click', openSettingsDialog);
        if (closeSettingsBtnEl) closeSettingsBtnEl.addEventListener('click', closeAllDialogs);
        if (dialogLogoutBtnEl) dialogLogoutBtnEl.addEventListener('click', handleLogout);

        if (openStyleSourcesBtnEl) openStyleSourcesBtnEl.addEventListener('click', openStyleSourcesDialog);
        if (closeStyleSourcesBtnEl) closeStyleSourcesBtnEl.addEventListener('click', closeAllDialogs);
        if (styleSourcesSaveBtnEl) styleSourcesSaveBtnEl.addEventListener('click', handleSaveStyleSources);
        if (styleSourcesResetBtnEl) styleSourcesResetBtnEl.addEventListener('click', handleResetStyleSources);

        if (openAvatarBtnEl) openAvatarBtnEl.addEventListener('click', openAvatarDialog);
        if (closeAvatarBtnEl) closeAvatarBtnEl.addEventListener('click', closeAllDialogs);
        if (avatarChooseBtnEl && avatarFileInputEl) {
            avatarChooseBtnEl.addEventListener('click', () => avatarFileInputEl.click());
        }
        if (avatarFileInputEl) {
            avatarFileInputEl.addEventListener('change', () => {
                const file = avatarFileInputEl.files && avatarFileInputEl.files[0];
                // Cleared so picking the same file twice still raises a change event.
                avatarFileInputEl.value = '';
                handleAvatarFilePicked(file);
            });
        }
        if (avatarRemoveBtnEl) avatarRemoveBtnEl.addEventListener('click', removeAvatar);

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
        if (ssAvatarRemoveBtnEl) ssAvatarRemoveBtnEl.addEventListener('click', removeSessionAvatar);

        // The security warning controls are bound when it is built, on first save.

        if (chatComposerEl) chatComposerEl.addEventListener('submit', handleSendMessage);
        if (dialogOverlayEl) dialogOverlayEl.addEventListener('click', closeAllDialogs);

        // Right-click on a message row offers reply, and edit and delete where the
        // viewer is allowed them
        if (messagesContainerEl) {
            messagesContainerEl.addEventListener('contextmenu', handleMessageContextMenu);
            // A touch screen has no right button, so holding a row raises the same menu,
            // and dragging a row to the left answers it.
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
        // elsewhere, a scroll, or a resize closes it. The menu's own clicks are handled
        // by its own listener and stop here. The format popup is dismissed on the same
        // three signals: it is a transient layer, not a dialog, so it must not survive
        // the gesture that ends the interaction.
        document.addEventListener('click', (e) => {
            if (messageMenuEl && messageMenuEl.style.display !== 'none'
                && !messageMenuEl.contains(e.target)) {
                closeMessageMenu();
            }
        });
        if (messagesContainerEl) {
            messagesContainerEl.addEventListener('scroll', closeMessageMenu);
            // Paging rides on the scroll event rather than an IntersectionObserver: the
            // trigger is a distance from the top of the transcript, not the visibility
            // of any one element, and a spliced page changes that distance by itself.
            messagesContainerEl.addEventListener('scroll', scheduleHistoryCheck);
        }
        window.addEventListener('resize', () => {
            closeMessageMenu();
            // A drawer left open while the window grew would stay in the tree as an
            // off-canvas element covering the two-pane layout, so it is dismissed as
            // soon as the rail can be shown in place.
            if (window.innerWidth > 720) setRailOpen(false);
        });

        if (messageInputEl) {
            // Enter sends and Shift+Enter inserts a newline, matching the usual chat
            // gesture now that the composer is multi-line. A textarea does not submit
            // its form on Enter, so this has to be handled explicitly. The IME guard
            // keeps Enter from sending while a candidate list is open.
            messageInputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
                    && !e.isComposing && e.keyCode !== 229) {
                    e.preventDefault();
                    handleSendMessage(e);
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

            // Neither the option state nor the placeholder can come from data-i18n,
            // since both depend on the selected format, so they are refreshed by hand.
            window.addEventListener('oxype:languageChanged', () => {
                paintMessageFormatTrigger();
                updateComposerForFormat();
            });
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // The open drawer is the outermost layer on a phone, so Escape unwinds
                // one layer at a time: a dialog opened from the drawer closes first and
                // leaves the drawer behind it.
                if (isDialogOpen()) {
                    closeAllDialogs();
                } else {
                    setRailOpen(false);
                }
            }
        });

        // The drawer button is created by this script, so it is relabelled here rather
        // than by data-i18n.
        window.addEventListener('oxype:languageChanged', labelRailToggle);
    }

    /**
     * Build the mobile drawer controls and bind them.
     *
     * The markup is expected to hold the rail, but nothing else: the toggle button
     * belongs in the conversation header and the scrim has to sit next to the rail
     * inside the frameset. Both are created here so a custom chat.html still gets a
     * working drawer instead of a rail that can never be reopened.
     */
    function ensureRailControls() {
        railEl = document.querySelector('.classic-rail');
        if (!railEl) return;

        const frameset = railEl.parentElement;
        if (!frameset) return;

        railToggleEl = document.getElementById('railToggle');
        if (!railToggleEl) {
            const header = document.querySelector('.classic-main-header');
            if (header) {
                railToggleEl = document.createElement('button');
                railToggleEl.type = 'button';
                railToggleEl.id = 'railToggle';
                railToggleEl.className = 'classic-rail-toggle';
                railToggleEl.innerHTML =
                    '<svg class="icon-svg" viewBox="0 0 24 24" width="18" height="18" fill="none"'
                    + ' stroke="currentColor" stroke-width="2" stroke-linecap="round"'
                    + ' stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line>'
                    + '<line x1="3" y1="12" x2="21" y2="12"></line>'
                    + '<line x1="3" y1="18" x2="21" y2="18"></line></svg>';
                // Placed first in the header so it sits at the leading edge, before the
                // conversation title, which is where a drawer button is expected.
                header.insertBefore(railToggleEl, header.firstChild);
            }
        }

        railScrimEl = document.getElementById('railScrim');
        if (!railScrimEl) {
            railScrimEl = document.createElement('div');
            railScrimEl.id = 'railScrim';
            railScrimEl.className = 'classic-rail-scrim';
            frameset.insertBefore(railScrimEl, railEl.nextSibling);
        }

        if (railToggleEl) {
            railToggleEl.addEventListener('click', () => setRailOpen(!isRailOpen()));
        }
        if (railScrimEl) {
            railScrimEl.addEventListener('click', () => setRailOpen(false));
        }

        labelRailToggle();
    }

    /** True while the mobile drawer is on screen. */
    function isRailOpen() {
        return !!railEl && railEl.classList.contains('is-open');
    }

    /**
     * Slides the mobile drawer in or out.
     *
     * Only the state class is tracked here: the tab order and the accessibility tree
     * follow from the `visibility` the stylesheet pairs with it, so the drawer is not
     * focusable while it is off screen. On a wide screen none of that applies and the
     * class is inert.
     */
    function setRailOpen(open) {
        if (!railEl) return;
        railEl.classList.toggle('is-open', open);
        if (railScrimEl) {
            railScrimEl.classList.toggle('is-visible', open);
        }
        if (railToggleEl) {
            railToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
    }

    /** Localized label for the drawer button, refreshed on a language change. */
    function labelRailToggle() {
        if (!railToggleEl) return;
        const label = getI18nText('chat.sessionsTitle', 'Conversations');
        railToggleEl.setAttribute('aria-label', label);
        railToggleEl.setAttribute('title', label);
        railToggleEl.setAttribute('aria-expanded', isRailOpen() ? 'true' : 'false');
    }

    /**
     * True while any toast dialog is on screen.
     *
     * Escape has to unwind one layer at a time: closing everything at once would also
     * dismiss the mobile drawer underneath a dialog that was opened from it.
     */
    function isDialogOpen() {
        const dialogs = [
            sessionOptionsDialogEl, sessionSettingsDialogEl, membersDialogEl,
            memberManageDialogEl, settingsDialogEl, styleSourcesDialogEl,
            styleSourcesRiskDialogEl, avatarDialogEl
        ];
        return dialogs.some((dialog) => dialog && dialog.style.display !== 'none');
    }

    // ----------------------------------------------------------- dialogs -------

    /** Closes every dialog and the shared overlay. */
    function closeAllDialogs() {
        [dialogOverlayEl, sessionOptionsDialogEl, sessionSettingsDialogEl, membersDialogEl,
            memberManageDialogEl,
            settingsDialogEl, styleSourcesDialogEl, styleSourcesRiskDialogEl,
            styleSourcesRiskScrimEl, avatarDialogEl].forEach(el => {
            if (el) el.style.display = 'none';
        });

        // Closing abandons the pending per-member action, so a stale target can never
        // be acted on by a later click.
        memberManageTarget = null;

        // Same for the conversation avatar: an upload that outlives the toast must not
        // be addressed to whichever conversation is opened next.
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
        // Repainted on open so the row shows the format actually in force, even if the
        // account value arrived from another client while this dialog was closed.
        paintMessageFormatTrigger();
    }

    // -------------------------------------------------------------- avatar -----

    /** Cache key for one avatar, kept apart per kind so account 7 != session 7. */
    function avatarCacheKey(kind, id) {
        return `${kind}:${id}`;
    }

    /**
     * The URL known for an avatar, or '' when it has none.
     *
     * `undefined` and `''` are deliberately different: an unknown avatar has simply not
     * been looked up, while an empty string is the server saying there is no picture.
     * Callers may fetch on a miss and must not on an empty answer.
     */
    function cachedAvatarUrl(kind, id) {
        if (id === null || id === undefined || id === '') return '';
        const key = avatarCacheKey(kind, id);
        return avatarUrlCache.has(key) ? avatarUrlCache.get(key) : undefined;
    }

    /**
     * What should actually be put in an <img> for one avatar.
     *
     * The picture kept in local storage is preferred over its URL: it is already here,
     * so drawing it costs nothing. It is only used while it belongs to the same URL,
     * and a replaced avatar is stored under a new file name, so a stale entry can never
     * be painted over its replacement.
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
        // The bytes are brought in step afterwards, so the next paint has them to draw
        // with. Nothing waits for it.
        syncAvatar(kind, id, url || '');
    }

    /**
     * Brings one avatar's stored bytes in step with the file on the server.
     *
     * The hash is asked for before the picture, so an unchanged avatar costs one small
     * request instead of the image again, and a replaced one is noticed even though its
     * URL is the only thing that changed.
     */
    function syncAvatar(kind, id, url) {
        if (!window.OxypeAvatars || !window.OxypeCore) return Promise.resolve();
        if (id === null || id === undefined || id === '') return Promise.resolve();
        return window.OxypeAvatars.sync(kind, id, url).then(result => {
            if (result && result.changed) {
                repaintAvatars(kind, id);
            }
        }).catch(err => {
            console.warn(`[Classic] Avatar sync for ${kind}:${id} skipped:`, err && err.message);
        });
    }

    /**
     * Draws an avatar element in whichever state it should be.
     *
     * The frame stays square in this skin (`--cl-radius: 0`), so the picture is square
     * too: a rounded avatar here would be the only curved corner on the page.
     */
    function paintAvatarElement(el, kind, id, initialChar) {
        if (!el) return;
        const url = cachedAvatarUrl(kind, id);
        const source = url ? avatarSource(kind, id, url) : { src: '', cached: false };
        if (source.src) {
            el.classList.add('has-image');
            const img = el.firstElementChild;
            if (!img || img.tagName !== 'IMG' || img.getAttribute('src') !== source.src) {
                el.innerHTML = `<img src="${escapeHtml(source.src)}" alt="" loading="lazy" decoding="async">`;
            }
        } else {
            el.classList.remove('has-image');
            el.textContent = initialChar;
        }
    }

    /** Repaints every element currently showing one account's or session's avatar. */
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
     * An unknown avatar is marked as "no picture" before the request so a transcript
     * with hundreds of rows from the same person sends one request, not hundreds.
     */
    function requestUserAvatar(id) {
        if (id === null || id === undefined || id === '') return;
        if (cachedAvatarUrl('user', id) !== undefined) return;
        avatarUrlCache.set(avatarCacheKey('user', id), '');
        if (!window.OxypeCore) return;
        window.OxypeCore.getAvatar(id).then(data => {
            if (data && typeof data.avatarUrl === 'string') {
                avatarUrlCache.set(avatarCacheKey('user', id), data.avatarUrl);
                repaintAvatars('user', id);
                syncAvatar('user', id, data.avatarUrl);
            }
        }).catch(err => {
            console.warn(`[Classic] getAvatar/${id} skipped:`, err && err.message);
        });
    }

    /** Same, for a conversation; the list endpoint reports them in bulk. */
    function requestSessionAvatar(id) {
        if (id === null || id === undefined || id === '') return;
        if (cachedAvatarUrl('session', id) !== undefined) return;
        avatarUrlCache.set(avatarCacheKey('session', id), '');
        loadSessionAvatarsFromList();
    }

    /** Fetches the joined sessions and seeds every session avatar they report. */
    let sessionAvatarSweepInFlight = false;
    function loadSessionAvatarsFromList() {
        if (sessionAvatarSweepInFlight) return;
        if (!window.OxypeCore) return;
        const stored = auth();
        if (!stored || !stored.userId) return;
        sessionAvatarSweepInFlight = true;
        // `getJoinedSessions` reports bare ids, so they are resolved through the batch
        // `getSessions` call -- the endpoint that also carries `avatarUrl`. One request
        // for every joined conversation, rather than one per row.
        window.OxypeCore.getJoinedSessions(stored.userId).then(joined => {
            const ids = Array.isArray(joined) ? joined : [];
            if (ids.length === 0) return [];
            return window.OxypeCore.getSessions(ids);
        }).then(list => {
            if (!Array.isArray(list)) return;
            list.forEach(session => {
                if (!session || typeof session !== 'object') return;
                const sid = session.sessionId !== undefined ? session.sessionId : session.id;
                if (sid === undefined || sid === null) return;
                if (typeof session.avatarUrl === 'string') {
                    avatarUrlCache.set(avatarCacheKey('session', sid), session.avatarUrl);
                    repaintAvatars('session', sid);
                    syncAvatar('session', sid, session.avatarUrl);
                }
            });
        }).catch(err => {
            console.warn('[Classic] Session avatar sweep skipped:', err && err.message);
        }).then(() => {
            sessionAvatarSweepInFlight = false;
        });
    }

    /** Opens the avatar toast and paints what the account has now. */
    async function openAvatarDialog() {
        closeAllDialogs();
        if (dialogOverlayEl) dialogOverlayEl.style.display = 'block';
        if (avatarDialogEl) avatarDialogEl.style.display = 'block';
        await loadAvatarState();
    }

    /**
     * Fetches the account's current avatar and paints it into the toast.
     *
     * A failed read is not an error the user needs to see: the toast still works, it
     * just opens with whatever the page already knew.
     */
    async function loadAvatarState() {
        const stored = auth();
        if (!stored || !stored.userId) {
            paintAvatarPreview(currentUser && currentUser.avatarUrl, currentUser && currentUser.username);
            return;
        }
        try {
            const data = await window.OxypeCore.getAvatar(stored.userId, stored.token) || {};
            if (typeof data.avatarUrl === 'string') {
                avatarUrlCache.set(avatarCacheKey('user', stored.userId), data.avatarUrl);
            }
            if (typeof data.maxBytes === 'number' && data.maxBytes > 0) {
                avatarMaxBytes = data.maxBytes;
            }
            paintAvatarPreview(data.avatarUrl, (currentUser && currentUser.username) || '');
            if (typeof data.avatarUrl === 'string' && data.avatarUrl) {
                await syncAvatar('user', stored.userId, data.avatarUrl);
                paintAvatarPreview(data.avatarUrl, (currentUser && currentUser.username) || '');
            }
        } catch (err) {
            console.warn('[Classic] Failed to load the avatar:', err && err.message);
            paintAvatarPreview(currentUser && currentUser.avatarUrl, currentUser && currentUser.username);
        }
    }

    /** Draws an avatar into the toast's preview box, or its initial when it has none. */
    function paintAvatarPreview(url, name) {
        if (!avatarPreviewEl) return;
        const safeName = String(name || '');
        const stored = auth();
        const userId = (currentUser && currentUser.id) || (stored && stored.userId);
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
            avatarHintEl.textContent = getI18nText(key, fallback, {
                max: String(Math.round(avatarMaxBytes / (1024 * 1024)))
            });
        }
        if (avatarRemoveBtnEl) avatarRemoveBtnEl.disabled = !url;
    }

    /**
     * Reads a picked file into a data URL, then uploads it.
     *
     * Type and size are checked here so an obviously unsuitable file produces an
     * immediate message instead of a round trip. The server checks again by magic
     * bytes: the browser's idea of a file's type comes from its name, not its content.
     */
    function handleAvatarFilePicked(file) {
        if (!file) return;
        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (allowed.indexOf(file.type) === -1) {
            toast(getI18nText('chat.avatarWrongType', 'That file is not a PNG, JPEG, WebP or GIF image.'), 'error');
            return;
        }
        if (file.size > avatarMaxBytes) {
            const max = Math.round(avatarMaxBytes / (1024 * 1024));
            toast(getI18nText('chat.avatarTooLarge', 'That image is larger than {max} MB. Please choose a smaller one.', { max: String(max) }), 'error');
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
            toast(getI18nText('chat.avatarReadFailed', 'That image could not be read.'), 'error');
        };
        reader.readAsDataURL(file);
    }

    /** Sends one avatar payload and repaints every surface that shows it. */
    async function uploadAvatarData(dataUrl) {
        const stored = auth();
        if (!stored || !stored.userId) return;
        try {
            const data = await window.OxypeCore.uploadAvatar({ kind: 'user', id: stored.userId, image: dataUrl }) || {};
            applyAvatarUrl('user', stored.userId, data.avatarUrl || '');
            paintAvatarPreview(data.avatarUrl || '', (currentUser && currentUser.username) || '');
            toast(getI18nText('chat.avatarSaved', 'Avatar updated.'), 'success');
        } catch (err) {
            const reason = (err && err.message) || 'unknown error';
            toast(getI18nText('chat.avatarFailed', 'Failed to update the avatar: {reason}', { reason }), 'error');
        }
    }

    /** Removes this account's avatar; every drawn copy falls back to its initial. */
    async function removeAvatar() {
        const stored = auth();
        if (!stored || !stored.userId) return;
        try {
            await window.OxypeCore.removeAvatar({ kind: 'user', id: stored.userId });
            applyAvatarUrl('user', stored.userId, '');
            paintAvatarPreview('', (currentUser && currentUser.username) || '');
            toast(getI18nText('chat.avatarRemoved', 'Avatar removed.'), 'success');
        } catch (err) {
            const reason = (err && err.message) || 'unknown error';
            toast(getI18nText('chat.avatarFailed', 'Failed to update the avatar: {reason}', { reason }), 'error');
        }
    }

    /**
     * Uploads a picked image as the open conversation's avatar.
     *
     * The conversation id is captured up front because the toast can be closed while
     * the upload is still in flight, and it must still address the conversation it was
     * started for.
     */
    function handleSessionAvatarFilePicked(file) {
        if (!file || !ssAvatarTargetSessionId) return;
        const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
        if (allowed.indexOf(file.type) === -1) {
            toast(getI18nText('chat.avatarWrongType', 'That file is not a PNG, JPEG, WebP or GIF image.'), 'error');
            return;
        }
        if (file.size > avatarMaxBytes) {
            const max = Math.round(avatarMaxBytes / (1024 * 1024));
            toast(getI18nText('chat.avatarTooLarge', 'That image is larger than {max} MB. Please choose a smaller one.', { max: String(max) }), 'error');
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
                if (String(activeSessionId) === String(sessionId) && activeSessionInfo) {
                    activeSessionInfo.avatarUrl = data.avatarUrl || '';
                }
                paintSessionAvatarPreview(data.avatarUrl || '');
                toast(getI18nText('chat.sessionAvatarSaved', 'Conversation avatar updated.'), 'success');
            } catch (err) {
                const reason = (err && err.message) || 'unknown error';
                toast(getI18nText('chat.sessionAvatarFailed', 'Failed to update the conversation avatar: {reason}', { reason }), 'error');
            } finally {
                if (ssAvatarPreviewEl) ssAvatarPreviewEl.classList.remove('is-uploading');
            }
        };
        reader.onerror = () => {
            toast(getI18nText('chat.avatarReadFailed', 'That image could not be read.'), 'error');
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
            toast(getI18nText('chat.sessionAvatarRemoved', 'Conversation avatar removed.'), 'success');
        } catch (err) {
            const reason = (err && err.message) || 'unknown error';
            toast(getI18nText('chat.sessionAvatarFailed', 'Failed to update the conversation avatar: {reason}', { reason }), 'error');
        }
    }

    /**
     * Draws the conversation avatar inside Conversation Info.
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
        const initial = name.trim().charAt(0).toUpperCase() || 'U';
        if (userAvatarEl) {
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

            sessionsMap.set(String(sessionId), { sessionId, sessionName, description, lastActivity: (isObject && (session.lastActivity || session.timestamp)) || 0 });

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'session-item';
            btn.dataset.sessionId = String(sessionId);

            const avatarChar = sessionName.trim().charAt(0).toUpperCase() || '#';
            // The second line carries the latest message preview, filled in below.
            btn.innerHTML = `
                <div class="session-avatar" data-avatar-session="${escapeHtml(sessionId)}" data-avatar-initial="${escapeHtml(avatarChar)}">${escapeHtml(avatarChar)}</div>
                <div class="session-details">
                    <div class="session-name">${escapeHtml(sessionName)}</div>
                    <div class="session-subtext session-last-message"></div>
                </div>
            `;

            // Seeded from the conversation record when it already carries a picture, and
            // otherwise left to the bulk sweep that fills in the rest. The bytes are
            // stored as well as drawn, so the next load paints from localStorage instead
            // of fetching the image again.
            if (isObject && typeof session.avatarUrl === 'string') {
                avatarUrlCache.set(avatarCacheKey('session', sessionId), session.avatarUrl);
                paintAvatarElement(btn.querySelector('.session-avatar'), 'session', sessionId, avatarChar);
                syncAvatar('session', sessionId, session.avatarUrl);
            } else {
                requestSessionAvatar(sessionId);
            }

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
                        if (avatarEl) {
                            // Painted, not overwritten: this refresh lands after the
                            // picture was drawn, and assigning textContent would delete
                            // the <img> and drop the row back to a letter.
                            const initial = name.trim().charAt(0).toUpperCase() || '#';
                            avatarEl.dataset.avatarInitial = initial;
                            if (typeof obj.avatarUrl === 'string') {
                                avatarUrlCache.set(avatarCacheKey('session', id), obj.avatarUrl);
                            }
                            paintAvatarElement(avatarEl, 'session', id, initial);
                        }
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
                        moveSessionToTop(sessionId, lastMsg.timestamp);
                    } else {
                        previewEl.textContent = '';
                    }
                })
                .catch(err => {
                    console.warn(`[Classic] getLastMessage/${sessionId} failed:`, err.message);
                });
        });
    }

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

    /** Updates the preview line of the active row after sending. */
    function updateActiveSessionPreview(senderName, content, timestamp) {
        if (!activeSessionId || !sessionListEl) return;
        const item = sessionListEl.querySelector(`[data-session-id="${activeSessionId}"]`);
        const previewEl = item ? item.querySelector('.session-last-message') : null;
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
     * Removing the message a preview was built from leaves the line naming a message
     * that no longer exists, and the replacement cannot be guessed locally: the server
     * knows which message is newest now, including ones that arrived from someone else
     * and were never rendered here. A blank answer is a real one and is written through.
     */
    function refreshSessionPreview(sessionId) {
        if (sessionId === undefined || sessionId === null || !sessionListEl) return;
        const sId = String(sessionId);
        const stored = auth();
        const inFlight = previewRefreshes.get(sId);
        if (inFlight) return inFlight;
        const pending = window.OxypeCore.getLastMessage(sId, currentUserId(), stored ? stored.token : null)
            .then(lastMsg => {
                writePreviewFromLastMessage(sId, lastMsg, true);
            })
            .catch(err => {
                console.warn(`[Classic] refresh preview/${sId} failed:`, err.message);
            })
            .finally(() => {
                // Released so the next delete can ask again; a failed lookup must not
                // freeze the conversation on a preview for a message that is gone.
                previewRefreshes.delete(sId);
            });
        previewRefreshes.set(sId, pending);
        return pending;
    }

    // -------------------------------------------------------- calibration -----

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
            const body = bodyOfMessage(msg);
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
            console.warn(`[Classic] Calibration read ${sessionId} ${start}-${end} returned no message list`);
            return { ok: false, reliable: false, messages: [] };
        } catch (err) {
            console.warn(`[Classic] Calibration could not read ${sessionId} ${start}-${end}:`, err && err.message);
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
        const stored = auth();
        if (!stored) return null;
        const userId = currentUserId();
        const token = stored.token || null;

        let newest = null;
        try {
            newest = await core.getLastMessage(sessionId, userId, token);
        } catch (err) {
            console.warn('[Classic] Calibration could not read the newest message:', err && err.message);
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
                    const body = bodyOfMessage(msg);
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
            console.warn('[Classic] Calibration pass failed:', err && err.message ? err.message : err);
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

    /** Starts the calibration cycle. */
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

    // -------------------------------------------------------------- session ----

    /** Loads a conversation's history, roster and metadata, then renders it. */

    /**
     * Refresh sender labels, initials and contiguous-group metadata after a profile resolves.
     *
     * A run of consecutive rows from one sender carries both of its markers on opposite
     * ends: the name belongs to the run's first row, the avatar to its last one. That
     * cannot be decided in a single forward pass -- when a row is reached, whether it ends
     * its run depends on the row *after* it, which has not been looked at yet. An earlier
     * version drove both markers from "does this row continue the previous one" and so put
     * the avatar on the run's first row as well, leaving the newest message of every run
     * with no face beside it.
     *
     * The keys are therefore computed first and the rows visited second, so each row can
     * be judged against both neighbours.
     */
    function refreshRenderedSenderGroups() {
        if (!messagesContainerEl) return;
        const rows = Array.from(messagesContainerEl.querySelectorAll('.message-row'));
        if (!rows.length) return;

        const keys = rows.map(row => {
            const senderName = row.dataset.senderName || 'User';
            const key = `${row.classList.contains('outgoing') ? 'self' : 'other'}:${senderName}`;
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
                    console.warn(`[Classic] getUser/${senderId} returned no username`, profile);
                    return;
                }
                activeSessionUsers.set(id, username);
                repaintSenderName(id, username);
            })
            .catch(err => console.warn(`[Classic] getUser/${senderId} skipped:`, err && err.message))
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
        // The rail preview is plain text ("Name: excerpt"), so the stale name has to be
        // swapped out there too or the list keeps showing the placeholder.
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
            const body = bodyOfMessage(msg);
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
            updateActiveSessionPreview(sender, previewOfBody(body.text), stamp);
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
        setRailOpen(false);
        renderedMessageKeys.clear();
        activeSessionId = sessionId;
        historyLoadingSessionId = String(sessionId);

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
        historyOldestSeq = null;
        historyReachedTop = false;
        historyPageInFlight = false;
        historyEmptyPageStreak = 0;

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
                const lastMsg = await window.OxypeCore.getLastMessage(sessionId, userId, stored ? stored.token : null);
                const lastId = (lastMsg && lastMsg.hasMessage) ? Number(lastMsg.id) : 0;
                if (Number.isFinite(lastId) && lastId > newestSeq) {
                    newestSeq = lastId;
                }
            } catch (e) {
                console.warn(`[Classic] lastMessage/${sessionId} skipped while anchoring history:`, e.message);
            }

            const end = newestSeq > 0 ? newestSeq : 0;
            const start = Math.max(0, end - HISTORY_PAGE_SIZE);

            const messages = await window.OxypeCore.getMessages(sessionId, start, end, userId, stored ? stored.token : null);

            if (Array.isArray(messages) && messages.length > 0) {
                if (messagesContainerEl) messagesContainerEl.innerHTML = '';
                appendHistoryBatch(messages);
            } else {
                showEmptyConversationHint();
            }

            // Older pages continue downwards from the lowest sequence asked for, which is
            // the whole span rather than what came back: a deleted stretch returns fewer
            // messages than it covers.
            historyOldestSeq = start;
            historyReachedTop = start <= 1;
            historyEmptyPageStreak = 0;
        } catch (err) {
            console.warn('[Classic] Failed to load message history:', err);
            showEmptyConversationHint();
            historyOldestSeq = null;
        }

        historyLoadingSessionId = null;
        const queued = pendingRealtimeMessages.get(String(activeSessionId)) || [];
        pendingRealtimeMessages.delete(String(activeSessionId));
        queued.forEach(event => window.dispatchEvent(new CustomEvent('oxype:websocket:message', { detail: event })));

        // Anything still showing a numeric placeholder gets one authoritative lookup now
        // that the transcript has stopped growing, so a name missed by the render loop
        // or by a replayed realtime event is corrected instead of being left behind.
        resolveRenderedPlaceholderSenders();

        if (messageInputEl) messageInputEl.focus();
    }

    /** Enables or disables the composer, which is inert until a conversation is picked. */
    function setComposerEnabled(enabled) {
        if (messageInputEl) messageInputEl.disabled = !enabled;
        if (sendMessageBtnEl) sendMessageBtnEl.disabled = !enabled;
        // The body format now lives in Settings as an account preference, so it is
        // deliberately left enabled: it is settable before a conversation is picked.
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

    /**
     * Builds the date separator for one calendar day, without attaching it.
     *
     * Detached so it can be placed beside rows that are themselves not yet in the
     * document — a page of older messages is assembled off-screen and inserted as one.
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

    /** Appends the date separator for a newly crossed calendar day. */
    function appendDateSeparator(timestamp) {
        if (!messagesContainerEl) return;
        messagesContainerEl.appendChild(createDateSeparator(timestamp));
    }

    /**
     * Re-derives every date separator from the rows that are actually present.
     *
     * A page of older messages can begin a day of its own, and it can also continue the
     * day the previously first message began. Because the day of the last rendered
     * message is tracked in one direction only, that boundary cannot be decided by
     * appending — so the separators are rebuilt from each row's own timestamp instead.
     */
    function normalizeDateSeparators() {
        if (!messagesContainerEl) return;
        const children = Array.prototype.slice.call(messagesContainerEl.children);
        children.forEach(child => {
            if (child.classList.contains('message-date-separator')) messagesContainerEl.removeChild(child);
        });

        lastRenderedDateKey = '';
        const items = [];
        let previousKey = '';
        Array.prototype.slice.call(messagesContainerEl.children).forEach(child => {
            if (!child.classList.contains('message-row')) return;
            const timestampMs = Number(child.dataset.timestampMs);
            const key = dateKeyOf(timestampMs);
            if (key && key !== previousKey) items.push({ beforeRow: child, key, timestampMs });
            previousKey = key || previousKey;
        });
        items.forEach(item => {
            messagesContainerEl.insertBefore(createDateSeparator(item.timestampMs), item.beforeRow);
            lastRenderedDateKey = item.key;
        });
    }

    /**
     * Builds one message row, without attaching it.
     *
     * Detached because a page of older messages is assembled in a fragment and inserted
     * in one operation; building it in the document would let the reader see the
     * transcript rebuild row by row.
     *
     * @param {object} msg view model, as documented on appendMessage
     * @param {Element|null} previousElement the element the row will follow, so a
     *        consecutive run by the same sender keeps its avatar on its last row only
     * @returns {HTMLElement}
     */
    function createMessageRow(msg, previousElement) {
        const row = document.createElement('div');
        row.className = `message-row ${msg.isSelf ? 'outgoing' : 'incoming'}`;

        const senderName = msg.sender || 'User';
        const senderKey = `${msg.isSelf ? 'self' : 'other'}:${senderName}`;
        const previousSenderKey = previousElement && previousElement.classList
            && previousElement.classList.contains('message-row')
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
        // The message's own time is what a spliced page is re-grouped by: the date labels
        // are re-derived from it, and it survives any amount of reordering.
        if (msg.timestampMs !== undefined && msg.timestampMs !== null) {
            row.dataset.timestampMs = String(msg.timestampMs);
        }
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
     * Appends one message bubble.
     *
     * The date label above the first message of a new day is taken from that
     * message's own timestamp, so the separator always describes what follows it.
     *
     * @param {{text: string, format?: 'text'|'markdown', sender: string, senderId?: number|string,
     *          isSelf: boolean, timestamp: string, timestampMs?: number, messageId?: number|string,
     *          stickToBottom?: boolean}} msg `stickToBottom` is false when a page of older
     *          messages is being added above the reader, whose position must not move.
     * @returns {HTMLElement|null} the row that was appended, so a caller that only learns
     *          the server id afterwards can still attach it.
     */
    function appendMessage(msg) {
        if (!messagesContainerEl) return null;

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
        if (msg.stickToBottom !== false) messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
        return row;
    }

    // ------------------------------------------------------------ paging -------

    /**
     * Converts a server record into the view model appendMessage expects.
     *
     * @param {object} msg record from getMessages
     * @returns {object|null} null when the message has no renderable body
     */
    function historyMessageToViewModel(msg) {
        if (!msg) return null;
        const body = bodyOfMessage(msg);
        if (!body.text) return null;

        const senderId = msg.sender !== undefined && msg.sender !== null ? msg.sender : msg.userid;
        const isSelf = String(senderId) === String(currentUserId());
        let senderName;
        if (isSelf) {
            senderName = currentUser && currentUser.username ? currentUser.username : 'Me';
        } else {
            const known = activeSessionUsers.get(String(senderId));
            senderName = known || `User #${senderId}`;
        }
        const timestampMs = Number(msg.timestamp) || 0;
        return {
            text: body.text,
            format: body.format,
            sender: senderName,
            senderId,
            isSelf,
            timestamp: timestampMs ? formatClockTime(timestampMs) : '',
            timestampMs,
            messageId: (msg.id !== undefined && msg.id !== null) ? msg.id : msg.seq,
            editedAt: Number(msg.editedAt) || 0,
            reply: body.reply,
            stickToBottom: false
        };
    }

    /** Builds detached rows for a page, skipping anything already on screen. */
    function buildHistoryRows(messages) {
        const rows = [];
        const sessionKey = String(activeSessionId);
        messages.forEach(msg => {
            const view = historyMessageToViewModel(msg);
            if (!view) return;
            const dedupeKey = `${sessionKey}:${String(view.messageId)}`;
            if (renderedMessageKeys.has(dedupeKey)) return;
            renderedMessageKeys.add(dedupeKey);
            const row = createMessageRow(view, null);
            // A record that carries an edit stamp was edited before it was ever drawn
            // here, so the marker belongs on the row as it is built.
            if (view.editedAt) markMessageEdited(row);
            rows.push(row);
        });
        return rows;
    }

    /** Appends a whole page below what is already there, then settles the layout. */
    function appendHistoryBatch(messages) {
        if (!messagesContainerEl) return;
        const rows = buildHistoryRows(messages);
        if (!rows.length) return;
        const fragment = document.createDocumentFragment();
        rows.forEach(row => fragment.appendChild(row));
        messagesContainerEl.appendChild(fragment);
        normalizeDateSeparators();
        refreshRenderedSenderGroups();
        messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
    }

    /**
     * Inserts a page above what is already there, holding the reader's place.
     *
     * Adding rows above the viewport pushes everything down, so a reader sitting on the
     * top of the loaded transcript would jump by the height of the new page. The scroll
     * offset is advanced by the same amount, measured against a row that was already
     * there rather than against the scroll height.
     *
     * @param {HTMLElement[]} rows detached rows in ascending order
     */
    function prependHistoryRows(rows) {
        if (!messagesContainerEl || rows.length === 0) return;
        // A surviving row measures the shift far more exactly than the scroll height: the
        // height is rounded to whole pixels, and one page of this skin's rows rarely adds
        // up to a round number, so deriving the shift from it leaves the reader up to a
        // pixel and a half off. A row's own offset is not rounded.
        //
        // The shift is applied as a residual rather than as a single guess, because the
        // browser keeps a scroll anchor of its own and may move the offset while the rows
        // are being inserted: what is left to correct can be smaller than the height that
        // was added, and applying the full height on top of the browser's own correction
        // would overshoot. Re-measuring after each pass converges on the right position.
        //
        // This has to happen here and not after the sender regrouping that follows: that
        // regrouping hides avatars and names, and re-measuring after it double-counts the
        // browser's own asynchronous adjustment. Deferring it was measured to leave the
        // reader a whole row (-19px) adrift instead of a sub-pixel residue.
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
     * Runs the paging check once per frame at most.
     *
     * A scroll gesture fires many events and each one is a chance to start a page. The
     * in-flight flag makes a second request harmless, but coalescing keeps the work off
     * the scroll handler itself.
     */
    function scheduleHistoryCheck() {
        if (historyCheckScheduled) return;
        if (historyReachedTop || historyPageInFlight || historyOldestSeq === null) return;
        historyCheckScheduled = true;
        const run = () => {
            historyCheckScheduled = false;
            if (historyReachedTop || historyPageInFlight || historyOldestSeq === null) return;
            if (!hasReachedHistoryTop()) return;
            loadOlderMessages();
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 16);
    }

    /**
     * Fetches the page above the oldest loaded message and splices it in.
     *
     * Pages step down from the oldest sequence that was asked for, not from the oldest
     * row that came back: a deleted range returns fewer messages than it spans, and
     * stepping by "what came back" would ask for the same empty range forever. The
     * descent therefore always terminates.
     */
    async function loadOlderMessages() {
        if (!activeSessionId || !messagesContainerEl) return;
        if (historyPageInFlight || historyReachedTop) return;
        if (historyOldestSeq === null) return;

        const stored = auth();
        const userId = currentUserId();
        const sessionId = String(activeSessionId);

        historyPageInFlight = true;
        let inserted = 0;
        try {
            while (!historyReachedTop) {
                const end = Math.floor(historyOldestSeq) - 1;
                if (end < 1) {
                    historyReachedTop = true;
                    break;
                }
                const start = Math.max(0, end - (HISTORY_PAGE_SIZE - 1));
                const messages = await window.OxypeCore.getMessages(sessionId, start, end, userId, stored ? stored.token : null);
                // A different conversation was opened while the request was in flight.
                if (String(activeSessionId) !== sessionId) return;

                historyOldestSeq = start;
                if (start <= 1) historyReachedTop = true;

                const rows = buildHistoryRows(Array.isArray(messages) ? messages : []);
                if (rows.length > 0) {
                    prependHistoryRows(rows);
                    inserted += rows.length;
                    historyEmptyPageStreak = 0;
                    break;
                }

                // Every message in that range was deleted. Keep descending, but only
                // while the reader is still waiting at the top.
                historyEmptyPageStreak += 1;
                if (historyEmptyPageStreak >= HISTORY_MAX_EMPTY_PAGES) {
                    historyReachedTop = true;
                    break;
                }
                if (!hasReachedHistoryTop()) break;
            }
        } catch (err) {
            console.warn('[Classic] Failed to load older messages:', err);
        } finally {
            historyPageInFlight = false;
        }

        if (inserted > 0) {
            // The splice can put two runs of the same sender side by side, so grouping and
            // missing names are resolved across the whole transcript rather than only the
            // rows that were just added.
            refreshRenderedSenderGroups();
            resolveRenderedPlaceholderSenders();
        }
    }


    // --------------------------------------------------------------- send ------

    async function handleSendMessage(e) {
        e.preventDefault();
        if (!activeSessionId || !messageInputEl) return;

        // The raw value is sent, not a trimmed copy: leading spaces make a Markdown
        // code block and trailing spaces are a Markdown hard line break. Emptiness is
        // still judged on the trimmed text so whitespace alone cannot be sent.
        const text = messageInputEl.value;
        if (!text.trim()) return;

        const format = getSelectedMessageFormat();
        // Read before the draft is cleared, and dropped immediately: the reply belongs
        // to this one send, and a failure below must not silently re-arm it.
        const pendingReply = replyTarget;

        const stored = auth();
        const userId = currentUserId();

        messageInputEl.value = '';
        autoGrowComposer();
        messageInputEl.focus();
        clearReplyTarget();

        const hint = document.getElementById('emptyConversationHint');
        if (hint) hint.remove();
        const sentAtMs = Date.now();
        const myName = currentUser && currentUser.username ? currentUser.username : 'Me';
        const sentRow = appendMessage({ text, format, sender: myName, senderId: userId, isSelf: true,
            timestamp: formatClockTime(sentAtMs), timestampMs: sentAtMs, reply: pendingReply });
        updateActiveSessionPreview(myName, previewOfBody(text), sentAtMs);

        // The quotation goes first and the body follows it, which is the shape the
        // server requires: it fills in the quoted sender and words from the stored
        // message, so only the id is sent from here.
        const content = pendingReply
            ? [{ type: 'reply', messageId: pendingReply.messageId }, { type: format, text: text }]
            : text;

        try {
            const res = await window.OxypeCore.sendMessage(
                activeSessionId, content, userId, stored ? stored.token : null, format
            );
            if (res && typeof res.seq === 'number' && res.seq > 0) {
                currentSeq = res.seq;
                // The row was painted before the server had given the message an id, so
                // the id is attached after the fact. Without it the message could not be
                // edited or deleted until the conversation was reloaded, and it would be
                // rendered a second time when its own broadcast arrived.
                if (sentRow && !sentRow.dataset.messageId) {
                    sentRow.dataset.messageId = String(res.seq);
                    renderedMessageKeys.add(String(activeSessionId) + ':' + String(res.seq));
                }
            }
        } catch (err) {
            console.error('[Classic] Failed to send message:', err);
            // A reply whose target was deleted while it was being written is the one
            // failure worth naming precisely: the draft is fine, the thing it answers
            // is not, and re-sending it as a plain message is the way out.
            if (pendingReply && err && err.status === 404) {
                toast(getI18nText('chat.replyMissingTarget',
                    'The message you replied to has been deleted.'), 'error');
                return;
            }
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
            <div class="session-avatar" data-avatar-session="${escapeHtml(sessionId)}" data-avatar-initial="${escapeHtml(avatarChar)}">${escapeHtml(avatarChar)}</div>
            <div class="session-details">
                <div class="session-name">${escapeHtml(sessionName)}</div>
                <div class="session-subtext session-last-message"></div>
            </div>
        `;
        // A brand-new conversation has no picture yet, so it is asked for like any other.
        const knownNewSessionAvatar = cachedAvatarUrl('session', sessionId);
        if (knownNewSessionAvatar === undefined) {
            requestSessionAvatar(sessionId);
        } else {
            paintAvatarElement(btn.querySelector('.session-avatar'), 'session', sessionId, avatarChar);
        }
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
     * Loads the active conversation's info and role, paints the info rows, then
     * resolves the invite UUIDs the caller is allowed to see.
     *
     * The info rows (name, description, owner, id) are readable by every member,
     * including plain members; the invite block is owner/admin only.
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

        renderSessionSettings();
        await loadSessionInvites();
    }

    /**
     * Paints the conversation info rows from [activeSessionInfo].
     *
     * Every member may read these; no role check guards them, so a plain member sees
     * the same details as an owner, just without any of the management controls.
     */
    function renderSessionSettings() {
        const info = activeSessionInfo || {};

        if (ssSessionNameEl) ssSessionNameEl.textContent = info.sessionName || '-';
        if (ssSessionDescEl) {
            ssSessionDescEl.textContent = info.description || getI18nText('chat.noDescription', 'No description');
        }
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
        if (ssSessionIdEl) ssSessionIdEl.textContent = String(activeSessionId);
        const canManage = Boolean(info.isOwner || info.isAdmin);
        if (sessionManageSectionEl) sessionManageSectionEl.style.display = canManage ? 'block' : 'none';
        if (ssNameInputEl) ssNameInputEl.value = info.sessionName || '';
        if (ssDescInputEl) ssDescInputEl.value = info.description || '';

        // The conversation avatar lives in this toast too, so the target id is set here
        // rather than only on open: an upload must address the conversation the toast is
        // showing even if it was opened by another route.
        ssAvatarTargetSessionId = activeSessionId;
        const knownSessionAvatar = cachedAvatarUrl('session', activeSessionId);
        if (knownSessionAvatar === undefined) {
            requestSessionAvatar(activeSessionId);
        } else {
            syncAvatar('session', activeSessionId, knownSessionAvatar);
        }
        paintSessionAvatarPreview(knownSessionAvatar || '');
    }

    /** Saves the conversation name/description (owner or admin). */
    async function handleSaveSessionChanges(e) {
        e.preventDefault();
        if (!activeSessionId) return;
        const stored = auth();
        const changes = {
            name: ssNameInputEl ? ssNameInputEl.value.trim() : '',
            description: ssDescInputEl ? ssDescInputEl.value.trim() : ''
        };
        if (!changes.name) {
            toast(getI18nText('chat.createSessionErrEmpty', 'Please enter a conversation name.'), 'warning');
            if (ssNameInputEl) ssNameInputEl.focus();
            return;
        }
        if (ssSaveBtnEl) ssSaveBtnEl.disabled = true;
        try {
            activeSessionInfo = await window.OxypeCore.updateSession(activeSessionId, changes, currentUserId(), stored ? stored.token : null) || activeSessionInfo;
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
            toast(getI18nText('chat.updateSuccess', 'Conversation updated.'), 'success');
        } catch (err) {
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason }), 'error');
        } finally {
            if (ssSaveBtnEl) ssSaveBtnEl.disabled = false;
        }
    }

    /** Renders the invite UUIDs, which only the owner or an admin may see or manage. */
    async function loadSessionInvites() {
        if (!ssInviteListEl) return;

        const info = activeSessionInfo || {};
        if (!info.isOwner && !info.isAdmin) {
            // Hide the whole block, not just the list: the heading row and the
            // generator button would otherwise stay on screen for a plain member,
            // which is exactly the leak this guards against.
            if (ssInviteSectionEl) ssInviteSectionEl.style.display = 'none';
            ssInviteListEl.innerHTML = '';
            if (ssCreateInviteBtnEl) ssCreateInviteBtnEl.style.display = 'none';
            if (ssInviteHintEl) ssInviteHintEl.textContent = '';
            return;
        }
        if (ssInviteSectionEl) ssInviteSectionEl.style.display = 'block';
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

            const details = document.createElement('div');
            details.className = 'invite-details';

            const code = document.createElement('span');
            code.className = 'invite-code';
            code.textContent = cleanUuid;
            details.appendChild(code);
            const time = document.createElement('span');
            time.className = 'invite-time';
            time.textContent = formatInviteUuidTime(cleanUuid);
            details.appendChild(time);

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

            row.appendChild(details);
            row.appendChild(copyBtn);
            row.appendChild(revokeBtn);
            ssInviteListEl.appendChild(row);
        });
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
    function handleCopyInvite(uuid) {
        const cleanUuid = String(uuid || '').replace(/^"|"$/g, '').trim();
        const done = () => toast(getI18nText('chat.copied', 'Copied to clipboard'), 'success');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(cleanUuid).then(done).catch(() => copyInviteFallback(cleanUuid, done));
        } else copyInviteFallback(cleanUuid, done);
    }

    function copyInviteFallback(text, done) {
        const input = document.createElement('textarea');
        input.value = text;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.focus();
        input.select();
        try { if (document.execCommand('copy')) done(); } finally { input.remove(); }
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

            // No conversation is open, so there is nothing for the transcript half of the
            // cycle to reconcile; a pass still in flight for the conversation that was
            // just left must not paint into the emptied pane.
            stopCalibration();
            startCalibration();

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
            const memberAvatarChar = name.trim().charAt(0).toUpperCase() || '#';
            const row = document.createElement('div');
            row.className = 'member-item';
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
     * Opens the per-member management dialog.
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
                if (mmRevokeAdminBtnEl) mmRevokeAdminBtnEl.style.display = 'inline-block';
            } else {
                if (mmGrantAdminBtnEl) mmGrantAdminBtnEl.style.display = 'inline-block';
                if (mmRevokeAdminBtnEl) mmRevokeAdminBtnEl.style.display = 'none';
            }
        } else {
            if (mmGrantAdminBtnEl) mmGrantAdminBtnEl.style.display = 'none';
            if (mmRevokeAdminBtnEl) mmRevokeAdminBtnEl.style.display = 'none';
        }

        // Both owner and admin can remove (subject to permission rules)
        const canRemove = perms.isOwner || (perms.isAdmin && !perms.memberIsAdmin && !perms.memberIsOwner);
        if (mmRemoveBtnEl) mmRemoveBtnEl.style.display = canRemove ? 'inline-block' : 'none';

        if (dialogOverlayEl) dialogOverlayEl.style.display = 'block';
        if (memberManageDialogEl) memberManageDialogEl.style.display = 'block';
    }

    /** Promotes or demotes a member to/from session administrator (owner only). */
    async function handleSetMemberAdmin(makeAdmin) {
        if (!memberManageTarget || !memberManageTarget.user) return;
        const targetUserId = memberManageTarget.user.userid;
        const confirmMsg = makeAdmin
            ? getI18nText('chat.memberGrantAdminConfirm', 'Promote this member to administrator?')
            : getI18nText('chat.memberRevokeAdminConfirm', 'Revoke administrator rights for this member?');

        if (!window.confirm(confirmMsg)) return;

        const stored = auth();
        const userId = currentUserId();

        try {
            await window.OxypeCore.setSessionAdmin(activeSessionId, targetUserId, makeAdmin, userId, stored ? stored.token : null);
            closeAllDialogs();
            toast(makeAdmin
                ? getI18nText('chat.memberGrantAdminSuccess', 'Member promoted to administrator.')
                : getI18nText('chat.memberRevokeAdminSuccess', 'Administrator rights revoked.'),
                'success'
            );
            await loadSessionSettings();
            await openMembersDialog();
        } catch (err) {
            console.error('[Classic] Set member admin failed:', err);
            const reason = describeRequestError(err, getI18nText('common.error', 'An error occurred'));
            toast(getI18nText('chat.updateFailed', `Failed to update: ${reason}`, { reason: reason }), 'error');
        }
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
        stopCalibration();
        if (window.OxypeWebSocket) {
            window.OxypeWebSocket.stop();
        }
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
