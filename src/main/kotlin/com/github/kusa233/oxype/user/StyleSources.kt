package com.github.kusa233.oxype.user

/**
 * Per-user overrides for the three front-end sources the chat page is built from.
 *
 * An empty value means "use the bundled default": the page then loads the files
 * served from the application itself.
 *
 * Two forms are accepted for a non-empty value:
 *  - an absolute `https://` URL, for a page hosted elsewhere;
 *  - a path on this same origin, for a page shipped with the application.
 *
 * Plain `http://` is rejected so a stored source can never be downgraded, and
 * scheme-less values are constrained to a relative path so a `javascript:` payload
 * or a protocol-relative `//host` cannot slip through.
 */
object StyleSources {
    /** Longest accepted source URL, in characters. */
    const val MAX_LENGTH: Int = 128

    /** Accepted absolute scheme. */
    const val HTTPS_PREFIX: String = "https://"

    /** Bundled defaults used whenever the matching override is empty. */
    const val DEFAULT_HTML: String = "/chat.html"
    const val DEFAULT_CSS: String = "/chat.css"
    const val DEFAULT_JS: String = "/chat.js"

    /**
     * Matches a leading URL scheme such as `http:`, `javascript:` or `data:`.
     *
     * Anything that reaches this point has already failed the `https://` check, so a
     * match means an unsupported scheme rather than a legitimate absolute URL.
     */
    private val SCHEME_PATTERN = Regex("^[A-Za-z][A-Za-z0-9+.-]*:")

    /**
     * Characters allowed in a same-origin path.
     *
     * Deliberately narrow: no backslash, whitespace or control character, and no
     * colon, so a path can never be mistaken for a URL by the browser.
     */
    private val RELATIVE_PATH_PATTERN = Regex("^[A-Za-z0-9._~/%?=&+-]+$")

    /**
     * Reports whether [value] is an acceptable source.
     *
     * Empty is valid and means "use the bundled default".
     */
    fun isValid(value: String): Boolean {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) {
            return true
        }
        if (trimmed.length > MAX_LENGTH) {
            return false
        }
        if (isHttpsUrl(trimmed)) {
            // "https://" alone points nowhere, so require at least one host character.
            return trimmed.length > HTTPS_PREFIX.length
        }
        return isSameOriginPath(trimmed)
    }

    /** Reports whether [value] is an absolute `https://` URL, ignoring scheme case. */
    fun isHttpsUrl(value: String): Boolean {
        val trimmed = value.trim()
        return trimmed.length >= HTTPS_PREFIX.length &&
            trimmed.regionMatches(0, HTTPS_PREFIX, 0, HTTPS_PREFIX.length, ignoreCase = true)
    }

    /**
     * Reports whether [value] is a safe path on this same origin.
     *
     * Rejects protocol-relative `//host` (an absolute URL in disguise), any other
     * scheme, and `..` so a source cannot walk out of the asset root.
     */
    fun isSameOriginPath(value: String): Boolean {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) {
            return false
        }
        if (trimmed.startsWith("//")) {
            return false
        }
        if (SCHEME_PATTERN.containsMatchIn(trimmed)) {
            return false
        }
        if (trimmed.contains("..")) {
            return false
        }
        return RELATIVE_PATH_PATTERN.matches(trimmed)
    }
}
