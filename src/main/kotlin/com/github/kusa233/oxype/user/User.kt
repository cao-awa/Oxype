package com.github.kusa233.oxype.user

/**
 * A registered account.
 *
 * The three source fields let a user point the chat page at their own hosted
 * copies of the page, stylesheet and script. An empty (or absent) value means
 * "use the bundled file"; see [StyleSources] for the accepted values.
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
    val chatJsSource: String? = null
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
