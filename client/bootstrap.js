/**
 * Oxype Web Client - Style Source Bootstrap
 *
 * The chat page no longer references any stylesheet or script directly. It only
 * loads this file, which then loads everything else:
 *
 *   style.css            (base styling, never user-overridable)
 *   language/style/core  (bundled scripts, never user-overridable)
 *   chat.css             (overridable per user)
 *   chat.js              (overridable per user)
 *   chat.html            (overridable per user; replaces this page's body)
 *
 * A user may point the three overridable sources at their own https:// URLs or at a
 * path on this same origin. If ANY of those fails to load, every source falls back to
 * the bundled default and a toast reports the URL that failed.
 *
 * The page is only shown once style.css and chat.css have actually been applied, so a
 * slow or failed stylesheet shows the loading spinner (or, once loading cannot succeed,
 * a reload prompt) rather than this page's own unstyled markup. The pages hide
 * themselves with an inline guard before this file is even requested, because this
 * request can fail too: see STATIC_GUARD_CLASS below.
 *
 * This script must stay dependency-free: it is what loads lang.js and style.js, so
 * it cannot assume OxypeI18n, OxypeStyle or OxypeCore exist yet.
 */
(function (global) {
    'use strict';

    // Read by the page's own inline fallback, which sits right after this script in
    // <head> and is reached immediately after this line when the request succeeded.
    // Its absence therefore means this file never ran: the browser refused to execute
    // it, or the request failed outright.
    global.oxypeBootstrapBooted = true;

    // Keep the document blank until the bundled/custom assets have finished loading.
    // The class comes off in exactly one place, reveal(), and reveal() is only reached
    // once the stylesheets the page is laid out by are in fact applied. A document
    // whose styles did not arrive therefore shows a prompt to reload instead of its
    // own unstyled markup, which is what a slow or failed load used to look like.
    //
    // The spinner below is only for pages that include this file without the inline
    // guard; the bundled pages draw their own from static styles, and adding a second
    // one here would stack two spinners on the same spot.
    var LOADING_CLASS = 'oxype-bootstrap-loading';

    /**
     * The guard the page itself installed before requesting this file.
     *
     * This is the layer that covers this file's own request failing, which nothing
     * inside this file can cover. When it is present the page also draws the spinner
     * from its own inline styles, so no second one is added here; the two layers only
     * have to agree on when the document may be shown.
     */
    var STATIC_GUARD_CLASS = 'oxype-boot-loading';
    var STATIC_FAILED_CLASS = 'oxype-boot-failed';
    var hasStaticGuard = document.documentElement.classList.contains(STATIC_GUARD_CLASS);

    var loadingStyle = document.createElement('style');
    loadingStyle.textContent = [
        'html.' + LOADING_CLASS + ' body { visibility: hidden !important; }',
        // visibility is inherited but overridable, and the app sets visibility:visible
        // on opened drawers, so every descendant is pinned too.
        'html.' + LOADING_CLASS + ' body * { visibility: hidden !important; }',
        // The body keeps its box but is invisible, so the surface behind the spinner is
        // painted on the root element instead; it disappears with the class.
        'html.' + LOADING_CLASS + ' { background-color: #f5f6f8; }',
        '@media (prefers-color-scheme: dark) {',
        '  html.' + LOADING_CLASS + ' { background-color: #15171c; }',
        '}',
        '.oxype-bootstrap-spinner {',
        '  position: fixed;',
        '  top: 50%;',
        '  left: 50%;',
        '  width: 34px;',
        '  height: 34px;',
        '  margin: -17px 0 0 -17px;',
        '  box-sizing: border-box;',
        '  border: 3px solid rgba(127, 127, 127, 0.25);',
        '  border-top-color: #4a6cf7;',
        '  border-radius: 50%;',
        '  animation: oxype-bootstrap-spin 0.8s linear infinite;',
        '  pointer-events: none;',
        '}',
        '@media (prefers-color-scheme: dark) {',
        '  .oxype-bootstrap-spinner { border-top-color: #7b96ff; }',
        '}',
        // A spinner is decorative motion; slowing it keeps the wait readable for
        // anyone who asked their system to reduce animation.
        '@media (prefers-reduced-motion: reduce) {',
        '  .oxype-bootstrap-spinner { animation-duration: 2.4s; }',
        '}',
        '@keyframes oxype-bootstrap-spin { to { transform: rotate(360deg); } }',
        // Shown only when the stylesheets cannot be loaded at all. It is styled from
        // this inline block for the same reason it exists: the page has no styles.
        '.oxype-bootstrap-failure {',
        '  position: fixed;',
        '  top: 50%;',
        '  left: 50%;',
        '  transform: translate(-50%, -50%);',
        '  box-sizing: border-box;',
        '  width: calc(100% - 48px);',
        '  max-width: 340px;',
        '  padding: 20px 24px;',
        '  font: 14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;',
        '  color: #2c2f36;',
        '  text-align: center;',
        '  background-color: #ffffff;',
        '  border: 1px solid rgba(127, 127, 127, 0.25);',
        '  border-radius: 8px;',
        '  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);',
        '}',
        '@media (prefers-color-scheme: dark) {',
        '  .oxype-bootstrap-failure {',
        '    color: #e6e8ef;',
        '    background-color: #22252c;',
        '    border-color: rgba(255, 255, 255, 0.14);',
        '  }',
        '}',
        '.oxype-bootstrap-failure button {',
        '  margin-top: 14px;',
        '  padding: 8px 18px;',
        '  font: inherit;',
        '  color: #ffffff;',
        '  background-color: #4a6cf7;',
        '  border: 0;',
        '  border-radius: 6px;',
        '  cursor: pointer;',
        '}'
    ].join('\n');

    document.documentElement.classList.add(LOADING_CLASS);
    document.head.appendChild(loadingStyle);

    // Appended to the root element, not the body: the body is invisible while this is
    // on screen (and its descendants are pinned invisible too). A node added to <html>
    // by script is not re-parented by the parser, so it survives the rest of the page
    // being parsed.
    var loadingSpinner = null;
    if (!hasStaticGuard) {
        loadingSpinner = document.createElement('div');
        loadingSpinner.className = 'oxype-bootstrap-spinner';
        loadingSpinner.setAttribute('aria-hidden', 'true');
        document.documentElement.appendChild(loadingSpinner);
    }

    /** The prompt shown instead of the page when the styles never arrived. */
    var failureBox = null;

    /** Takes the loading layer down. Only reveal() may call this. */
    function finishLoading() {
        document.documentElement.classList.remove(LOADING_CLASS);
        // The page's own guard comes off here too: this file owns the moment the
        // document may be shown, whichever of the two layers put the spinner up.
        document.documentElement.classList.remove(STATIC_GUARD_CLASS);
        document.documentElement.classList.remove(STATIC_FAILED_CLASS);
        if (loadingStyle.parentNode) loadingStyle.parentNode.removeChild(loadingStyle);
        if (loadingSpinner && loadingSpinner.parentNode) loadingSpinner.parentNode.removeChild(loadingSpinner);
        if (failureBox && failureBox.parentNode) failureBox.parentNode.removeChild(failureBox);
    }

    /**
     * Shows the page, but only once what it is laid out by has actually arrived.
     *
     * Every path out of the loader ends here rather than at finishLoading(), which is
     * the point: a stylesheet that failed, timed out, or was removed before the parser
     * applied it leaves the document hidden and offers a reload instead. Without this
     * the markup was shown bare -- full-width block elements in the system font -- for
     * as long as the missing stylesheet took, which on a slow link is the whole load.
     */
    function reveal() {
        if (!assetsReady()) {
            showFailure();
            return;
        }
        finishLoading();
    }

    /**
     * Keeps the document hidden and swaps the spinner for a reload prompt.
     *
     * Stays inside the loading layer for the same reason the spinner does: the page
     * markup must not be painted without its styles, so the only thing on screen is
     * something this file styled itself.
     */
    function showFailure() {
        if (failureBox) {
            return;
        }
        if (loadingSpinner && loadingSpinner.parentNode) {
            loadingSpinner.parentNode.removeChild(loadingSpinner);
        }
        // Stops the page's own static spinner, which is a pseudo-element and so cannot
        // be removed with it. The class is harmless without the guard in the page.
        document.documentElement.classList.add(STATIC_FAILED_CLASS);

        var box = document.createElement('div');
        box.className = 'oxype-bootstrap-failure';
        box.setAttribute('role', 'alert');

        var message = document.createElement('div');
        message.textContent = translate('chat.styleLoadFailed', failureText('message'));
        box.appendChild(message);

        var reload = document.createElement('button');
        reload.type = 'button';
        reload.textContent = translate('chat.styleLoadReload', failureText('reload'));
        reload.addEventListener('click', function () {
            global.location.reload();
        });
        box.appendChild(reload);

        document.documentElement.appendChild(box);
        failureBox = box;

        if (failedAssets.length) {
            console.error('[Bootstrap] These assets did not load: ' + failedAssets.join(', '));
        }
    }

    /** Looks a message up in the shared table, which may not have loaded yet. */
    function translate(key, fallback) {
        if (global.OxypeI18n && typeof global.OxypeI18n.t === 'function') {
            var localized = global.OxypeI18n.t(key);
            if (localized && localized !== key) {
                return localized;
            }
        }
        return fallback;
    }

    /**
     * The failure prompt's own text, in the user's language.
     *
     * This cannot come from lang.js alone: the prompt exists for the case where the boot
     * never got as far as the bundled scripts, and then OxypeI18n is not there to be
     * asked. The language is therefore read the same way lang.js reads it -- from the
     * value already in local storage, which settings.js puts there before anything else
     * runs -- and the two strings are duplicated here on purpose.
     */
    function failureText(which) {
        var lang = null;
        try {
            lang = global.localStorage.getItem(STORAGE_KEY_LANG);
        } catch (e) {
            // Private mode with storage disabled: fall through to the default below.
        }
        // An unknown or absent value means English, which is what lang.js does too.
        var zh = lang === 'zh-CN';
        if (which === 'reload') {
            return zh ? '重新加载' : 'Reload';
        }
        return zh
            ? '页面样式未能加载，无法正常显示。请检查网络连接后重试。'
            : 'This page could not be loaded because its styles did not arrive.'
                + ' Check your connection and try again.';
    }

    /**
     * Directory of the page being loaded, with a trailing slash.
     *
     * The bundled default for an override is the asset sitting next to the document,
     * not a fixed path: `/classic/chat.html` is served with classic markup, so rolling
     * it back to `/chat.css` would lay that markup out with the default skin's rules
     * and leave the page visibly broken. On `/chat.html` this is `/`, which is exactly
     * the fixed defaults this used to hard-code.
     */
    var PAGE_DIR = (function () {
        var path = (global.location && global.location.pathname) || '/';
        var slash = path.lastIndexOf('/');
        return slash === -1 ? '/' : path.slice(0, slash + 1);
    })();

    /** Bundled defaults, used when the matching override is empty. */
    var DEFAULT_HTML = PAGE_DIR + 'chat.html';
    var DEFAULT_CSS = PAGE_DIR + 'chat.css';
    var DEFAULT_JS = PAGE_DIR + 'chat.js';

    /** Assets that are part of the application itself and cannot be overridden. */
    var BASE_STYLESHEET = '/style.css';
    // settings.js comes first: lang.js and style.js read their preference out of
    // local storage the moment they are evaluated, so the account's stored values
    // have to be in place before either of them runs.
    // markdown.js is bundled rather than overridable: it is the renderer that has to
    // stay safe against another user's message, so it must not be replaceable by a
    // user-configured source. It loads before chat.js, which calls into it.
    var BASE_SCRIPTS = ['/settings.js', '/lang.js', '/style.js', '/core.js', '/websocket.js', '/markdown.js'];

    /** Mirrors the server-side limit so a stored value can never be used unchecked. */
    var MAX_LENGTH = 128;
    var HTTPS_PREFIX = 'https://';

    var STORAGE_KEY_USERID = 'oxype_user_id';
    var STORAGE_KEY_TOKEN = 'oxype_auth_token';
    var STORAGE_KEY_LANG = 'oxype_lang';

    /** How long a single asset may take before it is treated as a failed load. */
    var ASSET_TIMEOUT_MS = 15000;
    var NOTICE_DURATION_MS = 8000;

    var loadedStyleSheets = {};
    var loadedScripts = {};

    /**
     * Stylesheets the page cannot be shown without, in load order.
     *
     * A stylesheet that is merely requested is not enough: the markup only looks like
     * itself once the rules are applied, so these are what reveal() waits for.
     */
    var requiredStyleSheets = [];

    /** Assets that failed to load, reported to the console with the failure prompt. */
    var failedAssets = [];

    /** How many times a missing stylesheet is fetched again before giving up. */
    var MAX_ASSET_RETRIES = 1;
    var RETRY_DELAY_MS = 2500;

    /** Attempts already made per stylesheet, so each one gets its own budget. */
    var assetAttempts = {};

    /** Records that [url] has to be applied before this document may be shown. */
    function requireStyleSheet(url) {
        if (requiredStyleSheets.indexOf(url) === -1) {
            requiredStyleSheets.push(url);
        }
    }

    function recordFailure(url) {
        if (failedAssets.indexOf(url) === -1) {
            failedAssets.push(url);
        }
    }

    /**
     * Reports whether every required stylesheet is applied to this document.
     *
     * The signal is the link's own load event, held in loadedStyleSheets, plus the
     * element still being in the document. A stylesheet that has been requested but
     * not yet arrived is already in document.styleSheets with no rules, so the presence
     * of the entry says nothing; only the load event does. The element check catches a
     * link removed after it resolved, which is how a timeout used to make the page
     * reveal itself with nothing applied.
     */
    function assetsReady() {
        for (var i = 0; i < requiredStyleSheets.length; i++) {
            var link = loadedStyleSheets[requiredStyleSheets[i]];
            if (!link || !link.parentNode) {
                return false;
            }
        }
        return true;
    }

    /**
     * Loads a stylesheet the page is laid out by, trying again after a failure.
     *
     * A dropped request on a slow link is not the same as a stylesheet that is gone,
     * and the two are indistinguishable from here. Retrying costs a few seconds in the
     * second case -- the spinner stays up throughout, and nothing unstyled is ever
     * painted in the meantime -- so the page recovers from the first case instead of
     * giving up on it.
     */
    function loadRequiredStyleSheet(url) {
        requireStyleSheet(url);
        return new Promise(function (resolve, reject) {
            function attempt() {
                loadStyleSheet(url).then(resolve, function (error) {
                    var used = assetAttempts[url] || 0;
                    if (used < MAX_ASSET_RETRIES) {
                        assetAttempts[url] = used + 1;
                        setTimeout(attempt, RETRY_DELAY_MS);
                        return;
                    }
                    recordFailure(url);
                    reject(error);
                });
            }
            attempt();
        });
    }

    /**
     * Drops the overrides from the required list after a rollback.
     *
     * Once a custom stylesheet has failed the page is laid out by the bundled sheets
     * alone, so keeping the failed one required would make assetsReady() fail forever
     * and leave the reload prompt up over a page that is in fact correctly styled.
     */
    function keepOnlyBundledStyleSheets() {
        requiredStyleSheets = requiredStyleSheets.filter(function (url) {
            return url === BASE_STYLESHEET || url === DEFAULT_CSS;
        });
    }

    /** Markup of the bundled page, captured before any custom HTML replaces it. */
    var bundledBodyHtml = null;
    /** Title of the bundled page, restored alongside the markup on a fallback. */
    var bundledTitle = null;
    var htmlApplied = false;

    function readStorage(key) {
        try {
            return global.localStorage ? global.localStorage.getItem(key) : null;
        } catch (e) {
            return null;
        }
    }

    /** Loads a stylesheet, resolving once it is applied. */
    function loadStyleSheet(url) {
        if (loadedStyleSheets[url]) {
            return Promise.resolve(loadedStyleSheets[url]);
        }
        return new Promise(function (resolve, reject) {
            var link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;

            var settled = false;
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                if (link.parentNode) link.parentNode.removeChild(link);
                reject(new Error('Timed out loading stylesheet ' + url));
            }, ASSET_TIMEOUT_MS);

            link.onload = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                loadedStyleSheets[url] = link;
                resolve(link);
            };
            link.onerror = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (link.parentNode) link.parentNode.removeChild(link);
                reject(new Error('Failed to load stylesheet ' + url));
            };

            document.head.appendChild(link);
        });
    }

    /** Loads a script, resolving once it has executed. */
    function loadScript(url) {
        if (loadedScripts[url]) {
            return Promise.resolve(loadedScripts[url]);
        }
        return new Promise(function (resolve, reject) {
            var script = document.createElement('script');
            script.src = url;
            // Preserve execution order, which the client's module layering relies on.
            script.async = false;

            var settled = false;
            var timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                if (script.parentNode) script.parentNode.removeChild(script);
                reject(new Error('Timed out loading script ' + url));
            }, ASSET_TIMEOUT_MS);

            script.onload = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                loadedScripts[url] = script;
                resolve(script);
            };
            script.onerror = function () {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (script.parentNode) script.parentNode.removeChild(script);
                reject(new Error('Failed to load script ' + url));
            };

            document.head.appendChild(script);
        });
    }

    function loadScriptIgnoringFailure(url) {
        return loadScript(url).catch(function () { });
    }

    function loadBaseScripts() {
        return BASE_SCRIPTS.reduce(function (chain, url) {
            return chain.then(function () {
                return loadScriptIgnoringFailure(url);
            });
        }, Promise.resolve());
    }

    /** Fetches a custom page with a timeout so a hanging host cannot block the page. */
    function fetchText(url) {
        return new Promise(function (resolve, reject) {
            var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
            var timer = setTimeout(function () {
                if (controller) {
                    try { controller.abort(); } catch (e) { }
                }
                reject(new Error('Timed out fetching ' + url));
            }, ASSET_TIMEOUT_MS);

            fetch(url, {
                credentials: 'omit',
                signal: controller ? controller.signal : undefined
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ' for ' + url);
                }
                return response.text();
            }).then(function (text) {
                clearTimeout(timer);
                resolve(text);
            }).catch(function (error) {
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    /**
     * Replaces this page's body with the body of a custom chat.html.
     *
     * Only the body's markup is adopted, and the bundled markup is kept in memory so
     * a later failure can restore it. Scripts inside the fetched markup do not run
     * (that is how innerHTML behaves); the custom chat.js is loaded separately.
     */
    function applyCustomHtml(text) {
        var parsed = new DOMParser().parseFromString(text, 'text/html');
        if (!parsed || !parsed.body) {
            throw new Error('Custom page contained no body');
        }
        document.body.innerHTML = parsed.body.innerHTML;
        if (parsed.title) {
            document.title = parsed.title;
        }
        htmlApplied = true;
    }

    /**
     * Returns true only for a value the server would also have accepted: an empty
     * string (no override), an absolute https URL, or a path on this same origin.
     *
     * A relative path is used as-is, so it resolves against the current page and
     * therefore works whatever port or host the application is served from.
     */
    function isUsableSource(value) {
        if (typeof value !== 'string') {
            return false;
        }
        var trimmed = value.trim();
        if (!trimmed || trimmed.length > MAX_LENGTH) {
            return false;
        }
        if (trimmed.indexOf(HTTPS_PREFIX) === 0) {
            // A bare scheme points at no page at all.
            return trimmed.length > HTTPS_PREFIX.length;
        }
        return isSameOriginPath(trimmed);
    }

    /**
     * Reports whether a value is a safe path on this same origin.
     *
     * Kept in step with the server-side check: a protocol-relative `//host`, any
     * other scheme, and `..` are all refused because they resolve off-origin.
     */
    function isSameOriginPath(value) {
        var trimmed = value.trim();
        if (!trimmed || trimmed.indexOf('//') === 0 || trimmed.indexOf('..') !== -1) {
            return false;
        }
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)) {
            return false;
        }
        return /^[A-Za-z0-9._~/%?=&+-]+$/.test(trimmed);
    }

    var NO_SOURCES = { html: '', css: '', js: '' };

    /**
     * Fetches JSON from this application, treating any failure as "nothing to say".
     *
     * The timeout matters more than the error handling: boot waits for this before it
     * loads any client script, so a host that accepts the connection and then never
     * answers would otherwise hold the page on the loading spinner.
     */
    function fetchJson(url) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = setTimeout(function () {
            if (controller) {
                try { controller.abort(); } catch (e) { }
            }
        }, ASSET_TIMEOUT_MS);

        return fetch(url, {
            headers: { 'Accept': 'application/json' },
            credentials: 'omit',
            signal: controller ? controller.signal : undefined
        }).then(function (response) {
            clearTimeout(timer);
            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ' for ' + url);
            }
            return response.json();
        }).catch(function (error) {
            clearTimeout(timer);
            throw error;
        });
    }

    /**
     * Loads the account's saved preferences into local storage before any client
     * script runs.
     *
     * The ordering is the whole point. `lang.js` reads its language and `style.js`
     * reads its theme while they are being evaluated, so a value written after they
     * load is only reflected on the *next* paint — the page would render in one
     * language and then visibly correct itself. Adopting first means the first paint
     * is already the right one.
     *
     * Fields the account has never set are left alone, and the values that only exist
     * in this browser are pushed up afterwards, so an existing user keeps the choices
     * they had before their account started remembering them.
     */
    function resolvePreferences() {
        var userid = readStorage(STORAGE_KEY_USERID);
        var token = readStorage(STORAGE_KEY_TOKEN);
        if (!userid || !token) {
            return Promise.resolve();
        }

        var url = '/getSettings/' + encodeURIComponent(userid)
            + '?userid=' + encodeURIComponent(userid)
            + '&token=' + encodeURIComponent(token);

        return loadScriptIgnoringFailure('/settings.js')
            .then(function () {
                if (!global.OxypeSettings) return null;
                return fetchJson(url).catch(function () {
                    // Unreachable or refused: the local values still stand, so the
                    // page is usable and nothing is reported.
                    return null;
                });
            })
            .then(function (body) {
                if (!body || !global.OxypeSettings) return;
                var data = (body && body.data) ? body.data : body;
                var adoptable = global.OxypeSettings.adopt(data);
                global.OxypeSettings.adoptLocalValues(adoptable);
            });
    }

    /**
     * Reads the signed-in user's custom sources.
     *
     * Resolves to "no overrides" whenever the user is signed out or the lookup
     * fails: this request targets the application itself, so a failure here is not
     * an external source failure and is never reported as one.
     */
    function resolveSources() {
        var userid = readStorage(STORAGE_KEY_USERID);
        var token = readStorage(STORAGE_KEY_TOKEN);
        if (!userid || !token) {
            return Promise.resolve(NO_SOURCES);
        }

        var url = '/getStyleSources/' + encodeURIComponent(userid)
            + '?userid=' + encodeURIComponent(userid)
            + '&token=' + encodeURIComponent(token);

        return fetch(url, { headers: { 'Accept': 'application/json' } })
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status);
                }
                return response.json();
            })
            .then(function (body) {
                var data = (body && body.data) ? body.data : body;
                if (!data) {
                    return NO_SOURCES;
                }
                return {
                    html: isUsableSource(data.chatHtmlSource) ? data.chatHtmlSource.trim() : '',
                    css: isUsableSource(data.chatCssSource) ? data.chatCssSource.trim() : '',
                    js: isUsableSource(data.chatJsSource) ? data.chatJsSource.trim() : ''
                };
            })
            .catch(function () {
                return NO_SOURCES;
            });
    }

    /** Builds the fallback notice, preferring the shared i18n table when loaded. */
    function noticeFor(url) {
        if (global.OxypeI18n && typeof global.OxypeI18n.t === 'function') {
            var localized = global.OxypeI18n.t('chat.styleSourceLoadFailed', { url: url });
            if (localized && localized !== 'chat.styleSourceLoadFailed') {
                return localized;
            }
        }
        // Last resort for the (unlikely) case where the bundled lang.js did not load.
        // Matches the specified wording exactly.
        return '来源“' + url + '”的代码未能正常加载，已全部回退至默认';
    }

    /** Reuses the shared toast markup so the notice looks like every other toast. */
    function showNotice(message) {
        var container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        }

        var toast = document.createElement('div');
        toast.className = 'toast toast-error';
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(function () {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(function () {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, NOTICE_DURATION_MS);
    }

    /**
     * Returns every source to its bundled default after [failedUrl] failed to load.
     *
     * The bundled markup is restored, the custom stylesheet is dropped, and the
     * bundled script is loaded, so the page ends up exactly as if no override had
     * ever been configured.
     */
    function fallbackToDefaults(failedUrl) {
        if (htmlApplied && bundledBodyHtml !== null) {
            document.body.innerHTML = bundledBodyHtml;
            // The custom page may have renamed the tab; put the bundled title back so
            // the rollback is complete.
            if (bundledTitle !== null) {
                document.title = bundledTitle;
            }
            htmlApplied = false;
        }

        return loadRequiredStyleSheet(BASE_STYLESHEET)
            .then(function () { return loadRequiredStyleSheet(DEFAULT_CSS); })
            .then(function () {
                // The page is laid out by the bundled sheets again, so a custom sheet
                // that failed must stop being a precondition for showing it.
                keepOnlyBundledStyleSheets();
            })
            .then(loadBaseScripts)
            .then(function () {
                // The markup was replaced after lang.js first ran, so re-apply the
                // translations and theme bindings to the restored elements.
                if (global.OxypeI18n && typeof global.OxypeI18n.updateDom === 'function') {
                    global.OxypeI18n.updateDom();
                }
                if (global.OxypeStyle && typeof global.OxypeStyle.initThemeToggle === 'function') {
                    global.OxypeStyle.initThemeToggle();
                }
                return loadScriptIgnoringFailure(DEFAULT_JS);
            })
            .then(function () {
                showNotice(noticeFor(failedUrl));
            });
    }

    /** Loads the configured sources, falling back entirely on the first failure. */
    function start(sources) {
        var chain = Promise.resolve();

        // The custom page is adopted first so that every later script sees its markup.
        if (sources.html) {
            chain = chain.then(function () {
                return fetchText(sources.html)
                    .then(applyCustomHtml)
                    .catch(function () {
                        return fallbackToDefaults(sources.html).then(function () {
                            // Signal that recovery already happened.
                            throw { handled: true };
                        });
                    });
            });
        }

        chain = chain
            // A page cannot be shown without its styles, so a sheet that fails here is
            // recorded and the chain continues only so the rest of the boot can finish
            // -- reveal() then keeps the document hidden instead of painting bare markup.
            .then(function () {
                return loadRequiredStyleSheet(BASE_STYLESHEET).catch(function (error) {
                    console.error('[Bootstrap] Base stylesheet unavailable:', error);
                });
            })
            .then(function () {
                var cssUrl = sources.css || DEFAULT_CSS;
                return loadRequiredStyleSheet(cssUrl).catch(function (error) {
                    if (!sources.css) {
                        console.error('[Bootstrap] Bundled stylesheet unavailable:', error);
                        return;
                    }
                    return fallbackToDefaults(sources.css).then(function () {
                        throw { handled: true };
                    });
                });
            })
            .then(loadBaseScripts)
            .then(function () {
                var jsUrl = sources.js || DEFAULT_JS;
                return loadScript(jsUrl).catch(function () {
                    if (sources.js) {
                        return fallbackToDefaults(sources.js).then(function () {
                            throw { handled: true };
                        });
                    }
                });
            });

        chain
            .then(reveal)
            .catch(function (error) {
                // A handled fallback already reported itself; anything else is a bundled
                // asset problem and is left to the console. reveal() is still the way out:
                // it shows the page when the styles arrived and a prompt when they did not.
                if (!error || !error.handled) {
                    console.error('[Bootstrap] Failed to load client assets:', error);
                }
                reveal();
            });
    }

    function boot() {
        // Captured before any custom page can replace it, so recovery is always
        // possible even if the override loads and the stylesheet then fails.
        bundledBodyHtml = document.body.innerHTML;
        bundledTitle = document.title;

        // Preferences are settled first: the client scripts read them as they load,
        // so fetching them in parallel with the sources would race the first paint.
        resolvePreferences().then(function () {
            resolveSources().then(start, function () {
                start(NO_SOURCES);
            });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);
