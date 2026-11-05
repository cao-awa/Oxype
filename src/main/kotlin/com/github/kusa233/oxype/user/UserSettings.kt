package com.github.kusa233.oxype.user

/**
 * Per-user interface preferences, stored with the account rather than in the browser.
 *
 * These four values used to live only in `localStorage` under `oxype_lang`,
 * `oxype_theme`, `oxype_accent` and `oxype_message_format`. Keeping them in the
 * account means the same person gets the same interface on every device, and a
 * browser that has never visited this account inherits the account's choices
 * instead of falling back to the system preferences.
 *
 * Every value is optional. An empty string is always valid and always means "no
 * opinion": the client then falls back to what it did before these fields existed
 * — the browser's language, the operating system's colour scheme, the default
 * tone, and plain text. This keeps an account that predates these fields working
 * exactly as it did.
 *
 * Validation is deliberately by allow-list rather than free-form: these values are
 * echoed back into the page, so an unknown value is rejected at write time instead
 * of being stored and then silently ignored on read.
 */
object UserSettings {

    /**
     * Accepted interface languages, matching the codes `lang.js` ships translations
     * for. Keep this list in step with `I18n.getAvailableLanguages()`.
     */
    val LANGUAGES: Set<String> = setOf("zh-CN", "en")

    /** Accepted colour schemes. Empty means "follow the operating system". */
    val THEMES: Set<String> = setOf("light", "dark")

    /**
     * Accepted colour tones, matching the `data-accent` values in `chat.css`.
     * Empty means the default tone, which is spelled `default` when stored.
     */
    val ACCENTS: Set<String> = setOf("default", "sakura", "grass")

    /** Accepted composer body formats. */
    val INPUT_FORMATS: Set<String> = setOf("text", "markdown")

    /** Longest accepted value, in characters. Every list above is far shorter. */
    const val MAX_LENGTH: Int = 32

    /** The language assumed when the account has no preference. */
    const val DEFAULT_LANG: String = "en"

    /** The body format assumed when the account has no preference. */
    const val DEFAULT_INPUT_FORMAT: String = "text"

    /**
     * Reports whether [value] is acceptable for the language field.
     *
     * Empty is valid and means "no preference".
     */
    fun isValidLang(value: String): Boolean = isValidChoice(value, LANGUAGES)

    /** Reports whether [value] is acceptable for the theme field. */
    fun isValidTheme(value: String): Boolean = isValidChoice(value, THEMES)

    /** Reports whether [value] is acceptable for the colour tone field. */
    fun isValidAccent(value: String): Boolean = isValidChoice(value, ACCENTS)

    /** Reports whether [value] is acceptable for the body format field. */
    fun isValidInputFormat(value: String): Boolean = isValidChoice(value, INPUT_FORMATS)

    /**
     * The shared rule behind the four checks above.
     *
     * An empty (or blank) value is always accepted, because it is how a client
     * clears a preference and how every account that predates these fields reads.
     * A non-empty value must appear in [allowed], so a stored preference is always
     * one the client knows how to apply.
     */
    private fun isValidChoice(value: String, allowed: Set<String>): Boolean {
        val trimmed = value.trim()
        if (trimmed.isEmpty()) {
            return true
        }
        if (trimmed.length > MAX_LENGTH) {
            return false
        }
        return allowed.contains(trimmed)
    }
}
