package com.github.kusa233.oxype

import com.github.cao.awa.cason.codec.decoder.JSONDecoder
import com.github.cao.awa.cason.codec.encoder.JSONEncoder
import com.github.cao.awa.cason.serialize.parser.JSONParser
import com.github.kusa233.oxype.user.User
import com.github.kusa233.oxype.user.UserSettings
import com.github.kusa233.oxype.user.accentPref
import com.github.kusa233.oxype.user.cssSource
import com.github.kusa233.oxype.user.htmlSource
import com.github.kusa233.oxype.user.inputFormatPref
import com.github.kusa233.oxype.user.jsSource
import com.github.kusa233.oxype.user.langPref
import com.github.kusa233.oxype.user.themePref
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The account record gained four preference fields, and every account registered
 * before them must still load.
 *
 * Cason decodes data classes reflectively and passes `null` for each key that is
 * absent from the stored record — it does not fall back to the Kotlin default, so
 * `val prefLang: String = ""` would have made the whole record fail to decode for
 * those accounts. That is why every added field is `String?` and why `getUser`
 * normalises the nulls. These tests pin that contract down without a database:
 * they replay the storage round trip that Kalmia performs.
 */
class UserSettingsCompatTest {

    /**
     * Mirrors what storage does: encode a data class to JSON text, then parse it
     * back and decode it.
     *
     * The intermediate text matters. Kalmia writes `encodeData(...).toString()` and
     * reads it back through `JSONParser.parseObject`, and the parser is what turns
     * every number that fits in 32 bits into an Integer. Decoding straight from the
     * in-memory object would keep the original Long and hide that.
     */
    private inline fun <reified T : Any> roundTrip(value: T): T {
        val text = JSONEncoder.encodeData(value).toString()
        return JSONDecoder.decodeDataClass(JSONParser.parseObject(text), T::class)
    }

    /** Decodes a data class from hand-written JSON, as an old record would be. */
    private inline fun <reified T : Any> decodeJson(json: String): T =
        JSONDecoder.decodeDataClass(JSONParser.parseObject(json), T::class)

    /** The normalisation `UserManager.getUser` applies after every read. */
    private fun normalised(user: User): User = user.copy(
        chatHtmlSource = user.htmlSource,
        chatCssSource = user.cssSource,
        chatJsSource = user.jsSource,
        prefLang = user.langPref,
        prefTheme = user.themePref,
        prefAccent = user.accentPref,
        prefInputFormat = user.inputFormatPref
    )

    @Test
    fun `a record written before the preference fields decodes with nulls`() {
        // Exactly the four keys such a record holds. No normalisation here: this is
        // the raw decoder output, and it is the reason the fields have to be nullable.
        val old = decodeJson<User>(
            """{"id":7,"username":"legacy","hashedPassword":"hash"}"""
        )

        assertEquals(7L, old.id)
        assertEquals("legacy", old.username)
        assertNull(old.chatHtmlSource)
        assertNull(old.chatCssSource)
        assertNull(old.chatJsSource)
        assertNull(old.prefLang)
        assertNull(old.prefTheme)
        assertNull(old.prefAccent)
        assertNull(old.prefInputFormat)
    }

    @Test
    fun `normalising a legacy record fills every added field`() {
        val old = decodeJson<User>(
            """{"id":7,"username":"legacy","hashedPassword":"hash"}"""
        )

        val user = normalised(old)

        // Non-null, so the rest of the server can treat these as plain Strings.
        assertEquals("", user.htmlSource)
        assertEquals("", user.cssSource)
        assertEquals("", user.jsSource)
        assertEquals("", user.langPref)
        assertEquals("", user.themePref)
        assertEquals("", user.accentPref)
        assertEquals("", user.inputFormatPref)
        // An empty preference means "no opinion", which is what the client did before
        // these fields existed, so a legacy account renders exactly as it used to.
        assertFalse(UserSettings.isValidLang("klingon"))
        assertEquals(UserSettings.DEFAULT_LANG, "en")
        assertEquals(UserSettings.DEFAULT_INPUT_FORMAT, "text")
    }

    @Test
    fun `a legacy record survives a storage round trip and still loads`() {
        val old = decodeJson<User>(
            """{"id":8,"username":"older","hashedPassword":"hash","chatHtmlSource":""}"""
        )

        // Encoding the normalised record and decoding it again is what happens on the
        // next write: the shape must stay decodable, with no field silently dropped.
        val again = roundTrip(normalised(old))

        assertEquals(8L, again.id)
        assertEquals("older", again.username)
        assertEquals("", again.htmlSource)
        assertEquals("", again.langPref)
        assertEquals("", again.inputFormatPref)
    }

    @Test
    fun `preferences survive a storage round trip`() {
        val user = User(
            id = 9L,
            username = "chosen",
            hashedPassword = "hash",
            chatHtmlSource = "",
            chatCssSource = "",
            chatJsSource = "",
            prefLang = "zh-CN",
            prefTheme = "dark",
            prefAccent = "sakura",
            prefInputFormat = "markdown"
        )

        val decoded = roundTrip(user)

        assertEquals("zh-CN", decoded.langPref)
        assertEquals("dark", decoded.themePref)
        assertEquals("sakura", decoded.accentPref)
        assertEquals("markdown", decoded.inputFormatPref)
        // The id comes back as an Integer here, exactly as in StoredIdRoundTripTest;
        // comparing through toLong() keeps the assertion about the value, not the type.
        assertEquals(9L, (decoded.id as Number).toLong())
    }

    @Test
    fun `encoded user json carries one key per value`() {
        // Cason serialises every getter it finds. The normalising readers are extension
        // properties precisely so that they do not appear here as duplicate keys.
        val user = User(
            id = 10L,
            username = "keys",
            hashedPassword = "hash",
            chatHtmlSource = "",
            chatCssSource = "",
            chatJsSource = "",
            prefLang = "en",
            prefTheme = "light",
            prefAccent = "default",
            prefInputFormat = "text"
        )

        val text = JSONEncoder.encodeData(user).toString()

        listOf(
            "htmlSource", "cssSource", "jsSource",
            "langPref", "themePref", "accentPref", "inputFormatPref"
        ).forEach { derived ->
            assertFalse(text.contains("\"$derived\""), "$derived must not be encoded: $text")
        }
        assertTrue(text.contains("\"prefLang\""), text)
        assertTrue(text.contains("\"prefInputFormat\""), text)
    }

    @Test
    fun `every accepted preference is accepted and everything else is not`() {
        assertTrue(UserSettings.isValidLang("en"))
        assertTrue(UserSettings.isValidLang("zh-CN"))
        assertTrue(UserSettings.isValidTheme("light"))
        assertTrue(UserSettings.isValidTheme("dark"))
        assertTrue(UserSettings.isValidAccent("default"))
        assertTrue(UserSettings.isValidAccent("sakura"))
        assertTrue(UserSettings.isValidAccent("grass"))
        assertTrue(UserSettings.isValidInputFormat("text"))
        assertTrue(UserSettings.isValidInputFormat("markdown"))

        // Empty and blank always pass: that is how a preference is cleared, and how
        // every account that predates these fields reads.
        assertTrue(UserSettings.isValidLang(""))
        assertTrue(UserSettings.isValidLang("   "))
        assertTrue(UserSettings.isValidTheme(""))
        assertTrue(UserSettings.isValidAccent(""))
        assertTrue(UserSettings.isValidInputFormat(""))

        assertFalse(UserSettings.isValidLang("fr"))
        assertFalse(UserSettings.isValidTheme("solarized"))
        assertFalse(UserSettings.isValidAccent("neon"))
        assertFalse(UserSettings.isValidInputFormat("html"))
        // An over-long value is rejected before it can reach storage.
        assertFalse(UserSettings.isValidLang("x".repeat(UserSettings.MAX_LENGTH + 1)))
        // Surrounding whitespace is not a bypass: validation trims first.
        assertTrue(UserSettings.isValidLang("  en  "))
    }

    @Test
    fun `unknown keys in a stored record are ignored rather than fatal`() {
        // A record written by a newer build may carry fields this one does not know.
        // Decoding must still succeed, so a downgrade cannot corrupt an account.
        val decoded = decodeJson<User>(
            """{"id":11,"username":"future","hashedPassword":"hash",""" +
                """"prefLang":"en","prefFontSize":"14","prefLayout":"wide"}"""
        )

        val user = normalised(decoded)

        assertEquals(11L, user.id)
        assertEquals("en", user.langPref)
        assertEquals("", user.themePref)
        // Nothing was invented for the fields this build does not have.
        assertNotNull(user.inputFormatPref)
    }
}
