package com.github.kusa233.oxype.user

/**
 * A registered account.
 *
 * The three source fields let a user point the chat page at their own hosted
 * copies of the page, stylesheet and script. An empty (or absent) value means
 * "use the bundled file"; see [StyleSources] for the accepted values.
 *
 * The `pref*` fields hold the presentation preferences that used to live only in
 * the browser's `localStorage`: interface language, light/dark mode, colour tone,
 * and the composer's body format. They travel with the account so the same person
 * gets the same interface on every device. See [UserSettings] for the accepted
 * values.
 *
 * These fields are nullable rather than merely defaulted on purpose. Accounts are
 * persisted through Cason's reflective data class decoder, which passes `null` for
 * every key missing from the stored record instead of honouring a Kotlin default.
 * A non-null field would therefore make the whole record fail to load for anyone
 * who registered before these fields existed. [UserManager.getUser] normalises
 * `null` to the empty string, so the rest of the server only ever sees a String.
 */
data class User(
    val id: Long,
    val username: String,
    val hashedPassword: String,
    /** Absolute `https://` URL of a custom chat page, or empty for the bundled one. */
    val chatHtmlSource: String? = null,
    /** Absolute `https://` URL of a custom chat stylesheet, or empty for the bundled one. */
    val chatCssSource: String? = null,
    /** Absolute `https://` URL of a custom chat script, or empty for the bundled one. */
    val chatJsSource: String? = null,
    /** Interface language code, or empty to let the browser decide. */
    val prefLang: String? = null,
    /** `light` or `dark`, or empty to follow the operating system. */
    val prefTheme: String? = null,
    /** Colour tone id, or empty for the default tone. */
    val prefAccent: String? = null,
    /** Composer body format: `text` or `markdown`. */
    val prefInputFormat: String? = null,
    /**
     * Name of this account's avatar file under `client/avatar`, or null/empty when the
     * account has none and is drawn with its initial.
     */
    val avatarFile: String? = null
)

/*
 * Null-tolerant readers for the source fields.
 *
 * These are extension properties rather than members on purpose: Cason's data class
 * encoder serialises every getter it finds, so member accessors would show up as
 * duplicate `htmlSource`/`cssSource`/`jsSource` keys in the user JSON.
 */
val User.htmlSource: String get() = chatHtmlSource ?: ""
val User.cssSource: String get() = chatCssSource ?: ""
val User.jsSource: String get() = chatJsSource ?: ""

/*
 * Null-tolerant readers for the preference fields. Same reason as above: extension
 * properties keep Cason from encoding a second, duplicated key for each value.
 *
 * Unlike the source readers these default to a *meaningful* value rather than the
 * empty string, because a preference always has one: an account that never chose a
 * language reads as English, one that never chose a format reads as plain text, and
 * one that never chose a theme or tone reads as empty — meaning "no opinion, follow
 * the browser" — which is exactly what the client did before these fields existed.
 */
val User.langPref: String get() = prefLang ?: ""
val User.themePref: String get() = prefTheme ?: ""
val User.accentPref: String get() = prefAccent ?: ""
val User.inputFormatPref: String get() = prefInputFormat ?: ""

/**
 * Null-tolerant reader for the avatar file name.
 *
 * Empty rather than null so callers can test it without a null check; [AvatarStorage.urlOf]
 * turns the empty string back into "no avatar".
 */
val User.avatarFileName: String get() = avatarFile ?: ""
