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
 * This script must stay dependency-free: it is what loads lang.js and style.js, so
 * it cannot assume OxypeI18n, OxypeStyle or OxypeCore exist yet.
 */
(function (global) {
    'use strict';

    /** Bundled defaults, used when the matching override is empty. */
    var DEFAULT_HTML = '/chat.html';
    var DEFAULT_CSS = '/chat.css';
    var DEFAULT_JS = '/chat.js';

    /** Assets that are part of the application itself and cannot be overridden. */
    var BASE_STYLESHEET = '/style.css';
    var BASE_SCRIPTS = ['/lang.js', '/style.js', '/core.js'];

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

    function loadStyleSheetIgnoringFailure(url) {
        return loadStyleSheet(url).catch(function () {
            // Bundled assets carry no user configuration, so a failure here is not a
            // source fallback and must not be reported as one.
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

        return loadStyleSheetIgnoringFailure(BASE_STYLESHEET)
            .then(function () { return loadStyleSheetIgnoringFailure(DEFAULT_CSS); })
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
            .then(function () { return loadStyleSheetIgnoringFailure(BASE_STYLESHEET); })
            .then(function () {
                var cssUrl = sources.css || DEFAULT_CSS;
                return loadStyleSheet(cssUrl).catch(function () {
                    if (sources.css) {
                        return fallbackToDefaults(sources.css).then(function () {
                            throw { handled: true };
                        });
                    }
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

        chain.catch(function (error) {
            // A handled fallback already reported itself; anything else is a bundled
            // asset problem and is left to the console.
            if (!error || !error.handled) {
                console.error('[Bootstrap] Failed to load client assets:', error);
            }
        });
    }

    function boot() {
        // Captured before any custom page can replace it, so recovery is always
        // possible even if the override loads and the stylesheet then fails.
        bundledBodyHtml = document.body.innerHTML;
        bundledTitle = document.title;

        resolveSources().then(start, function () {
            start(NO_SOURCES);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})(window);
