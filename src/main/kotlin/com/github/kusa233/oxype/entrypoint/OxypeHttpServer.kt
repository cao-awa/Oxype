package com.github.kusa233.oxype.entrypoint

import com.github.cao.awa.cason.array.JSONArray
import com.github.cao.awa.cason.codec.JSONCodec
import com.github.cao.awa.cason.codec.decoder.JSONDecoder
import com.github.cao.awa.cason.codec.encoder.JSONEncoder
import com.github.cao.awa.cason.obj.JSONObject
import com.github.cao.awa.cason.primary.JSONNumber
import com.github.cao.awa.cason.serialize.parser.JSONParser
import com.github.kusa233.kalmia.server.network.KalmiaNetworkConfig
import com.github.kusa233.kalmia.server.network.http.builder.http
import com.github.kusa233.kalmia.server.network.http.context.KalmiaHttpContext
import com.github.kusa233.kalmia.server.network.http.entrypoint.service.KalmiaHttpService
import com.github.kusa233.kalmia.server.network.http.placeholder.url.type.placeholder
import com.github.kusa233.oxype.element.message.piece.MessageMarkdownPiece
import com.github.kusa233.oxype.element.message.piece.MessagePiece
import com.github.kusa233.oxype.element.message.piece.MessagePieces
import com.github.kusa233.oxype.entrypoint.OxypeWebSocketServer
import com.github.kusa233.oxype.element.message.piece.MessageTextPiece
import com.github.kusa233.oxype.exception.body.NeedJsonBodyException
import com.github.kusa233.oxype.exception.login.AuthenticationException
import com.github.kusa233.oxype.exception.request.MissingParameterException
import com.github.kusa233.oxype.message.MessageManager
import com.github.kusa233.oxype.session.Session
import com.github.kusa233.oxype.session.manager.SessionManager
import com.github.kusa233.oxype.user.StyleSources
import com.github.kusa233.oxype.user.User
import com.github.kusa233.oxype.user.UserSettings
import com.github.kusa233.oxype.user.accentPref
import com.github.kusa233.oxype.user.cssSource
import com.github.kusa233.oxype.user.htmlSource
import com.github.kusa233.oxype.user.inputFormatPref
import com.github.kusa233.oxype.user.jsSource
import com.github.kusa233.oxype.user.langPref
import com.github.kusa233.oxype.user.themePref
import com.github.kusa233.oxype.user.manager.UserManager
import io.netty.handler.codec.http.HttpResponseStatus
import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.Logger

object OxypeHttpServer {
    private val LOGGER: Logger = LogManager.getLogger("OxypeHttpServer")
    private val SENDING_MESSAGE_FAILED_SEQ: JSONObject = JSONObject {
        "seq" set -1L
    }

    /** Answer for a caller who is not a member: nothing was edited, nothing to report. */
    private val EDIT_MESSAGE_FAILED: JSONObject = JSONObject {
        "success" set false
    }

    /** Answer for a caller who is not a member: nothing was deleted. */
    private val DELETE_MESSAGE_FAILED: JSONObject = JSONObject {
        "success" set false
    }

    fun KalmiaHttpContext.enableCors() {
        responseHeaders().set("Access-Control-Allow-Origin", "*")
        responseHeaders().set("Access-Control-Allow-Headers", "*")
        responseHeaders().set("Access-Control-Allow-Methods", "GET, POST")
    }

    /**
     * Runs [action] with the JSON body of the request and returns whatever the
     * action produces.
     *
     * The return value matters: Kalmia only serialises a route result into the
     * "data" node of the response envelope when the route actually returns it.
     * Declaring this as `Unit` silently turned successful register/login calls
     * into empty responses.
     */
    fun <T> KalmiaHttpContext.requireJsonBody(action: (JSONObject) -> T): T {
        enableCors()

        val raw = stringContent()
        if (raw.isNotEmpty()) {
            val parsed = try {
                JSONParser.parseObject(raw)
            } catch (e: Exception) {
                // Not JSON at all. Fall through to the same 400 a malformed body
                // produced before, rather than turning a client mistake into a 500.
                null
            }
            if (parsed != null) {
                return action(parsed)
            }
        }

        abortWith(
            NeedJsonBodyException.create("Need json body"),
            HttpResponseStatus.BAD_REQUEST,
            this
        )
        // abortWith always throws; this line only satisfies the type checker.
        throw IllegalStateException("Unreachable: the request was aborted")
    }

    fun KalmiaHttpContext.assertString(str: String?, name: String): String {
        if (str == null || str == "") {
            abortWith(
                MissingParameterException("Missing parameter '$name'"),
                HttpResponseStatus.BAD_REQUEST,
                this
            )

            // abortWith always throws; this line only satisfies the type checker.
            throw IllegalStateException("Unreachable: the request was aborted")
        }
        return str
    }

    /**
     * Reads an integer field from a JSON body, accepting the first name that resolves.
     *
     * Numeric ids normally arrive as JSON numbers, but a client that serialises an id
     * straight out of browser storage sends it quoted, and `getLong` refuses those.
     * Accepting the string spelling too means a quoted id can no longer surface as a
     * confusing "missing parameter" 400.
     */
    private fun JSONObject.longValue(vararg names: String): Long? {
        for (name in names) {
            getLong(name)?.let { return it }
        }
        for (name in names) {
            getString(name)?.trim()?.toLongOrNull()?.let { return it }
        }
        return null
    }

    /**
     * Reads a boolean flag, accepting the string spelling as well as a real boolean.
     *
     * `getBoolean` returns null for a value that is not a JSON boolean, and the client
     * has historically serialised other flags as strings, so accepting "true"/"false"
     * keeps a quoted flag from surfacing as a confusing "missing parameter".
     */
    private fun JSONObject.booleanValue(name: String): Boolean? {
        getBoolean(name)?.let { return it }
        return when (getString(name)?.trim()?.lowercase()) {
            "true" -> true
            "false" -> false
            else -> null
        }
    }

    fun <T> KalmiaHttpContext.requireJoinedSession(
        json: JSONObject,
        sessionId: Long,
        defaultValue: T,
        action: () -> T
    ): T {
        val userid = assertLong(json.longValue("userid", "userId"), "userid")
        val token = assertString(json.getString("token"), "token")

        val user = UserManager.getUserByToken(token, userid)
        if (user == null) {
            abortWith(
                IllegalStateException("Unauthorized"),
                HttpResponseStatus.UNAUTHORIZED,
                this
            )
        }
        val joinedSessions = UserManager.getJoinedSessions(userid)

        return if (joinedSessions.contains(sessionId)) {
            action()
        } else {
            defaultValue
        }
    }

    fun KalmiaHttpContext.assertLong(value: Long?, name: String): Long {
        if (value == null) {
            abortWith(
                MissingParameterException("Missing parameter '$name'"),
                HttpResponseStatus.BAD_REQUEST,
                this
            )
            // abortWith always throws; this line only satisfies the type checker.
            throw IllegalStateException("Unreachable: the request was aborted")
        }
        return value
    }

    fun KalmiaHttpContext.assertBoolean(value: Boolean?, name: String): Boolean {
        if (value == null) {
            abortWith(
                MissingParameterException("Missing parameter '$name'"),
                HttpResponseStatus.BAD_REQUEST,
                this
            )
            // abortWith always throws; this line only satisfies the type checker.
            throw IllegalStateException("Unreachable: the request was aborted")
        }
        return value
    }

    /**
     * Requires a JSON array field to be present.
     *
     * `json.getArray(name)!!` used to be how this was written, which turned a body
     * that simply omitted `pieces` into a KotlinNullPointerException and a 500. A
     * missing or non-array value is a client mistake, so it is reported as one.
     */
    fun KalmiaHttpContext.assertJsonArray(value: JSONArray?, name: String): JSONArray {
        if (value == null) {
            abortWith(
                MissingParameterException("Missing parameter '$name'"),
                HttpResponseStatus.BAD_REQUEST,
                this
            )
            // abortWith always throws; this line only satisfies the type checker.
            throw IllegalStateException("Unreachable: the request was aborted")
        }
        return value
    }

    /**
     * Rejects a `pieces` array containing anything [MessagePieces.decode] cannot handle.
     *
     * Every piece is checked before any is decoded: an unknown type would otherwise
     * reach MessagePiece.decode and its `CODECS[type]!!` would surface as a 500
     * instead of a 400 naming the offending type. Shared by send and edit so a body
     * accepted when it was written stays acceptable when it is revised.
     */
    fun KalmiaHttpContext.assertKnownPieceTypes(piecesJson: JSONArray) {
        piecesJson.forEach { element ->
            val piece = element as? JSONObject
            if (piece == null) {
                abortWith(
                    MissingParameterException("Every entry of 'pieces' must be an object"),
                    HttpResponseStatus.BAD_REQUEST,
                    this
                )
                throw IllegalStateException("Unreachable: the request was aborted")
            }
            val type = piece.getString("type")
            if (!MessagePiece.isKnownType(type)) {
                abortWith(
                    MissingParameterException("Unsupported message piece type '${type ?: ""}'"),
                    HttpResponseStatus.BAD_REQUEST,
                    this
                )
                throw IllegalStateException("Unreachable: the request was aborted")
            }
        }
    }

    /**
     * Authenticates a JSON request through the existing [UserManager.getUserByToken]
     * lookup and runs [action] with the resolved user.
     *
     * Every mutating route funnels through here, so a request without a valid
     * `userid`/`token` pair can never reach session logic. `userId` is accepted as
     * an alias because the client has historically sent both spellings.
     */
    fun <T> KalmiaHttpContext.requireUser(json: JSONObject, action: (User) -> T): T {
        val userid = assertLong(json.longValue("userid", "userId"), "userid")
        val token = assertString(json.getString("token"), "token")

        val user = UserManager.getUserByToken(token, userid)
        if (user == null) {
            abortWith(
                AuthenticationException("Unauthorized"),
                HttpResponseStatus.UNAUTHORIZED,
                this
            )
            // abortWith always throws; this keeps `user` non-null for the type checker.
            throw IllegalStateException("Unreachable: the request was aborted")
        }

        return action(user)
    }

    /**
     * Resolves the caller of a GET request.
     *
     * GET requests carry no JSON envelope, so credentials are read from the query
     * string and fall back to headers. The same [UserManager.getUserByToken] check
     * then applies, so both verb families authenticate identically.
     */
    fun KalmiaHttpContext.requireUserFromQuery(action: (User) -> Any): Any {
        enableCors()

        val args = arguments()
        val useridRaw = args.get("userid")
            ?: args.get("userId")
            ?: getRequestHeader("userid")
            ?: getRequestHeader("X-User-Id")
        val token = args.get("token")
            ?: getRequestHeader("token")
            ?: getRequestHeader("X-Token")

        if (useridRaw == null || token == null) {
            abortWith(
                MissingParameterException("Missing parameter 'userid' or 'token'"),
                HttpResponseStatus.BAD_REQUEST,
                this
            )
            throw IllegalStateException("Unreachable: the request was aborted")
        }

        val userid = useridRaw.toLongOrNull()
        if (userid == null) {
            abortWith(
                MissingParameterException("Parameter 'userid' must be a number"),
                HttpResponseStatus.BAD_REQUEST,
                this
            )
            throw IllegalStateException("Unreachable: the request was aborted")
        }

        val user = resolveQueryUser(userid, token)
        if (user == null) {
            abortWith(
                AuthenticationException("Unauthorized"),
                HttpResponseStatus.UNAUTHORIZED,
                this
            )
            throw IllegalStateException("Unreachable: the request was aborted")
        }

        return action(user)
    }

    /**
     * Looks up a GET caller, tolerating the query-string damage done to tokens
     * minted before the URL-safe alphabet was introduced.
     *
     * Query decoding rewrites a literal '+' into a space, so a legacy standard-Base64
     * token arrives with spaces where '+' used to be. Retrying with those characters
     * restored keeps already-issued tokens working.
     */
    private fun resolveQueryUser(userid: Long, token: String): User? {
        UserManager.getUserByToken(token, userid)?.let { return it }

        if (token.contains(' ')) {
            UserManager.getUserByToken(token.replace(' ', '+'), userid)?.let { return it }
        }

        return null
    }

    /**
     * Loads a session or aborts with 404.
     *
     * Returning the value keeps callers free of the nullable-then-abort dance that
     * Kotlin cannot smart-cast through, since [abortWith] is declared as `Unit`.
     */
    fun KalmiaHttpContext.requireSession(sessionId: Long): Session {
        val session = SessionManager.getSession(sessionId)
        if (session == null) {
            abortWith(
                IllegalArgumentException("Session not found"),
                HttpResponseStatus.NOT_FOUND,
                this
            )
            throw IllegalStateException("Unreachable: the request was aborted")
        }
        return session
    }

    /** Runs [action] only when [userid] is a member of [session]. */
    fun <T> KalmiaHttpContext.requireSessionMember(session: Session, userid: Long, action: () -> T): T {
        if (!session.hasMember(userid)) {
            abortWith(
                AuthenticationException("You are not a member of this session"),
                HttpResponseStatus.FORBIDDEN,
                this
            )
        }
        return action()
    }

    /** Runs [action] only for the session owner or one of its admins. */
    fun <T> KalmiaHttpContext.requireSessionAdmin(session: Session, userid: Long, action: () -> T): T {
        if (!session.isAdmin(userid)) {
            abortWith(
                AuthenticationException("Only the session owner or an admin can do this"),
                HttpResponseStatus.FORBIDDEN,
                this
            )
        }
        return action()
    }

    /** Runs [action] only for the session owner. */
    fun <T> KalmiaHttpContext.requireSessionOwner(session: Session, userid: Long, action: () -> T): T {
        if (!session.isOwner(userid)) {
            abortWith(
                AuthenticationException("Only the session owner can do this"),
                HttpResponseStatus.FORBIDDEN,
                this
            )
        }
        return action()
    }

    /**
     * Caller-visible view of a session, including the caller's own role flags so
     * the client can decide which management controls to render.
     */
    private fun sessionView(session: Session, viewerId: Long): JSONObject {
        return JSONObject {
            "sessionId" set session.sessionId
            "sessionName" set session.sessionName
            "description" set session.description
            "owner" set session.owner
            "admins" set JSONArray { session.adminIds().forEach { add(it) } }
            "members" set JSONArray { session.memberIds().forEach { add(it) } }
            "isOwner" set session.isOwner(viewerId)
            "isAdmin" set session.isAdmin(viewerId)
        }
    }

    /** Encodes a member entry as `{ userid, username }`. */
    private fun userView(userid: Long): JSONObject {
        val user = UserManager.getUser(userid)
        return JSONObject {
            "userid" set userid
            "username" set (user?.username ?: "User #$userid")
        }
    }

    /**
     * Caller-visible view of a user's custom front-end sources.
     *
     * The stored override and the bundled default are both sent, so the client never
     * hardcodes the default paths and the settings form can show what an empty field
     * resolves to.
     */
    private fun styleSourcesView(user: User): JSONObject {
        return JSONObject {
            "chatHtmlSource" set user.htmlSource
            "chatCssSource" set user.cssSource
            "chatJsSource" set user.jsSource
            "defaultChatHtmlSource" set StyleSources.DEFAULT_HTML
            "defaultChatCssSource" set StyleSources.DEFAULT_CSS
            "defaultChatJsSource" set StyleSources.DEFAULT_JS
            "maxLength" set StyleSources.MAX_LENGTH
            "httpsPrefix" set StyleSources.HTTPS_PREFIX
        }
    }

    /**
     * Rejects an unacceptable source with a 400 naming the offending field.
     *
     * Failing here rather than storing the value keeps the invariant that anything
     * persisted is either empty (use the bundled file), an absolute https URL, or a
     * path on this same origin.
     */
    private fun assertValidStyleSource(field: String, value: String, context: KalmiaHttpContext) {
        if (StyleSources.isValid(value)) {
            return
        }
        val reason = when {
            value.trim().length > StyleSources.MAX_LENGTH ->
                "must be at most ${StyleSources.MAX_LENGTH} characters"

            value.trim().startsWith("//") ->
                "must not be a protocol-relative URL"

            value.trim().contains("..") ->
                "must not contain '..'"

            else ->
                "must be an '${StyleSources.HTTPS_PREFIX}' URL or a path on this site"
        }
        with(context) {
            abortWith(
                IllegalArgumentException("Invalid '$field': $reason"),
                HttpResponseStatus.BAD_REQUEST,
                this
            )
        }
        throw IllegalStateException("Unreachable: the request was aborted")
    }

    /**
     * Caller-visible view of a user's interface preferences.
     *
     * The stored values and the accepted alternatives are both sent, so the client
     * neither hardcodes the lists nor has to guess what an empty preference falls
     * back to.
     *
     * The four values are returned exactly as stored, empty included. Empty is a
     * meaningful answer — "this account has no opinion" — and the client must be able
     * to tell it apart from a deliberate choice of the default, because that is what
     * decides whether a browser's existing local preference may be adopted into the
     * account. The defaults are reported separately, so the client does not have to
     * carry its own copy of them.
     */
    private fun settingsView(user: User): JSONObject {
        return JSONObject {
            "lang" set user.langPref
            "theme" set user.themePref
            "accent" set user.accentPref
            "inputFormat" set user.inputFormatPref
            "languages" set JSONArray().apply {
                UserSettings.LANGUAGES.forEach { add(it) }
            }
            "themes" set JSONArray().apply {
                UserSettings.THEMES.forEach { add(it) }
            }
            "accents" set JSONArray().apply {
                UserSettings.ACCENTS.forEach { add(it) }
            }
            "inputFormats" set JSONArray().apply {
                UserSettings.INPUT_FORMATS.forEach { add(it) }
            }
            "defaultLang" set UserSettings.DEFAULT_LANG
            "defaultInputFormat" set UserSettings.DEFAULT_INPUT_FORMAT
            "maxLength" set UserSettings.MAX_LENGTH
        }
    }

    /**
     * Rejects an unacceptable preference with a 400 naming the offending field.
     *
     * Same contract as [assertValidStyleSource]: an invalid value is refused at the
     * request rather than stored and silently ignored on the next read.
     */
    private fun assertValidPreference(field: String, value: String, valid: Boolean, allowed: Collection<String>, context: KalmiaHttpContext) {
        if (valid) {
            return
        }
        val reason = if (value.trim().length > UserSettings.MAX_LENGTH) {
            "must be at most ${UserSettings.MAX_LENGTH} characters"
        } else {
            "must be empty or one of ${allowed.joinToString(", ")}"
        }
        with(context) {
            abortWith(
                IllegalArgumentException("Invalid '$field': $reason"),
                HttpResponseStatus.BAD_REQUEST,
                this
            )
        }
        throw IllegalStateException("Unreachable: the request was aborted")
    }

    @JvmStatic
    fun start() {
        KalmiaHttpService.start(http {
            assets("client")

            route("isAlive/{userid}") {
                val userid by placeholder<Long>("userid")
                post {
                    requireJsonBody { json ->
                        val token = assertString(json.getString("token"), "token")

                        val alive = UserManager.verifyToken(userid, token)
                        JSONObject {
                            "is_alive" set alive
                        }
                    }
                }
            }

            route("register") {
                post {
                    requireJsonBody { json ->
                        val username = assertString(json.getString("username"), "username")
                        val password = assertString(json.getString("password"), "password")

                        if (username.length > 15) {
                            abortWith(
                                IllegalArgumentException("Username too long"),
                                HttpResponseStatus.BAD_REQUEST,
                                this
                            )
                        }

                        if (password.length !in 6..20) {
                            abortWith(
                                IllegalArgumentException("Password must size in 6 to 20 characters"),
                                HttpResponseStatus.BAD_REQUEST,
                                this
                            )
                        }

                        val user = UserManager.register(username, password)
                        val token = UserManager.login(user.id)

                        LOGGER.info("Registered user ${user.id}(${user.username})")

                        JSONObject {
                            "userid" set user.id
                            "token" set token
                        }
                    }
                }
            }

            route("getUser/{userid}") {
                val userid by placeholder<Long>("userid")
                get {
                    requireUserFromQuery { caller ->
                        val user = UserManager.getUser(userid)
                        if (user == null) {
                            abortWith(
                                IllegalArgumentException("User not found"),
                                HttpResponseStatus.NOT_FOUND,
                                this
                            )
                        } else if (caller.id == userid) {
                            // The caller's own record: full profile, password redacted.
                            JSONEncoder.encodeData(user).also {
                                it.put("hashedPassword", "HIDDEN")
                            }
                        } else {
                            // Anyone else's record is reduced to the display name.
                            // A chat transcript has to be able to name its senders,
                            // and a client that only ever sees "User #123" has no way
                            // to learn who that is without reloading the page once the
                            // roster is refetched. Only the name is shared: the stored
                            // style sources stay private to their owner, and the
                            // password hash is never copied into this view at all.
                            JSONObject {
                                "id" set user.id
                                "username" set user.username
                                "hashedPassword" set "HIDDEN"
                            }
                        }
                    }
                }
            }

            /**
             * The caller's custom front-end sources.
             *
             * Empty values are returned alongside the bundled defaults so the loader
             * can fall back without hardcoding paths, and so the settings UI can show
             * the user what an empty field will actually resolve to.
             */
            route("getStyleSources/{userid}") {
                val userid by placeholder<Long>("userid")
                get {
                    requireUserFromQuery { caller ->
                        val user = UserManager.getUser(userid)
                        if (user == null || caller.id != userid) {
                            abortWith(
                                IllegalArgumentException("User not found"),
                                HttpResponseStatus.NOT_FOUND,
                                this
                            )
                        } else {
                            styleSourcesView(user)
                        }
                    }
                }
            }

            /**
             * Stores the caller's custom front-end sources.
             *
             * Each field is optional: an absent or empty value clears the override so
             * the bundled file is used. A non-empty value must be an absolute
             * `https://` URL of at most [StyleSources.MAX_LENGTH] characters.
             */
            route("updateStyleSources/{userid}") {
                val userid by placeholder<Long>("userid")
                post {
                    requireJsonBody { json ->
                        requireUser(json) { caller ->
                            if (caller.id != userid) {
                                abortWith(
                                    AuthenticationException("You can only change your own sources"),
                                    HttpResponseStatus.FORBIDDEN,
                                    this
                                )
                            }

                            // An absent field means "no override", which is the same
                            // state as an explicitly cleared one.
                            val html = json.getString("chatHtmlSource") ?: ""
                            val css = json.getString("chatCssSource") ?: ""
                            val js = json.getString("chatJsSource") ?: ""

                            assertValidStyleSource("chatHtmlSource", html, this)
                            assertValidStyleSource("chatCssSource", css, this)
                            assertValidStyleSource("chatJsSource", js, this)

                            val updated = UserManager.updateStyleSources(userid, html, css, js)
                            if (updated == null) {
                                abortWith(
                                    IllegalArgumentException("User not found"),
                                    HttpResponseStatus.NOT_FOUND,
                                    this
                                )
                                // abortWith always throws; this keeps `updated` non-null
                                // for the type checker.
                                throw IllegalStateException("Unreachable: the request was aborted")
                            }
                            styleSourcesView(updated)
                        }
                    }
                }
            }

            /**
             * Returns the caller's interface preferences.
             *
             * Sent with the accepted value lists so the settings UI can be built from
             * the server's own vocabulary instead of a second copy in the client.
             */
            route("getSettings/{userid}") {
                val userid by placeholder<Long>("userid")
                get {
                    requireUserFromQuery { caller ->
                        val user = UserManager.getUser(userid)
                        if (user == null || caller.id != userid) {
                            abortWith(
                                IllegalArgumentException("User not found"),
                                HttpResponseStatus.NOT_FOUND,
                                this
                            )
                        } else {
                            settingsView(user)
                        }
                    }
                }
            }

            /**
             * Stores the caller's interface preferences.
             *
             * Each field is optional and absent means "leave this preference alone", so
             * a client can send only what the user changed. An explicitly empty value
             * clears the preference, which is the state every account is in before it
             * first saves this form. A non-empty value must appear in the matching
             * allow-list in [UserSettings], so anything persisted is always applicable.
             *
             * The style-source fields are untouched here, so saving preferences can
             * never clear a custom front end.
             */
            route("updateSettings/{userid}") {
                val userid by placeholder<Long>("userid")
                post {
                    requireJsonBody { json ->
                        requireUser(json) { caller ->
                            if (caller.id != userid) {
                                abortWith(
                                    AuthenticationException("You can only change your own settings"),
                                    HttpResponseStatus.FORBIDDEN,
                                    this
                                )
                            }

                            // `null` means the key was absent, which is different from
                            // an empty string: the former keeps the stored value, the
                            // latter clears it.
                            val lang = json.getString("lang")
                            val theme = json.getString("theme")
                            val accent = json.getString("accent")
                            val inputFormat = json.getString("inputFormat")

                            if (lang != null) {
                                assertValidPreference(
                                    "lang", lang, UserSettings.isValidLang(lang),
                                    UserSettings.LANGUAGES, this
                                )
                            }
                            if (theme != null) {
                                assertValidPreference(
                                    "theme", theme, UserSettings.isValidTheme(theme),
                                    UserSettings.THEMES, this
                                )
                            }
                            if (accent != null) {
                                assertValidPreference(
                                    "accent", accent, UserSettings.isValidAccent(accent),
                                    UserSettings.ACCENTS, this
                                )
                            }
                            if (inputFormat != null) {
                                assertValidPreference(
                                    "inputFormat", inputFormat, UserSettings.isValidInputFormat(inputFormat),
                                    UserSettings.INPUT_FORMATS, this
                                )
                            }

                            val updated = UserManager.updateSettings(userid, lang, theme, accent, inputFormat)
                            if (updated == null) {
                                abortWith(
                                    IllegalArgumentException("User not found"),
                                    HttpResponseStatus.NOT_FOUND,
                                    this
                                )
                                // abortWith always throws; this keeps `updated` non-null
                                // for the type checker.
                                throw IllegalStateException("Unreachable: the request was aborted")
                            }
                            settingsView(updated)
                        }
                    }
                }
            }

            route("getJoinedSessions/{userid}") {
                get {
                    requireUserFromQuery { caller ->
                        UserManager.getJoinedSessions(caller.id)
                    }
                }
            }

            route("login/{userid}") {
                val userid by placeholder<Long>("userid")
                post {
                    requireJsonBody { json ->
                        val password = assertString(json.getString("password"), "password")

                        if (UserManager.verifyPassword(userid, password)) {
                            val token = UserManager.login(userid)

                            JSONObject {
                                "token" set token
                            }
                        } else {
                            abortWith(
                                AuthenticationException("Failed to login"),
                                HttpResponseStatus.BAD_REQUEST,
                                this
                            )
                        }
                    }
                }
            }

            route("logout/{userid}") {
                val userid by placeholder<Long>("userid")
                post {
                    requireJsonBody { json ->
                        val token = assertString(json.getString("token"), "token")

                        if (UserManager.verifyToken(userid, token)) {
                            UserManager.logout(userid, token)

                            JSONObject {
                                "userid" set userid
                                "loggedOut" set true
                            }
                        } else {
                            abortWith(
                                AuthenticationException("Unauthorized"),
                                HttpResponseStatus.UNAUTHORIZED,
                                this
                            )
                        }
                    }
                }
            }

            route("createSession") {
                post {
                    requireJsonBody { json ->
                        val name = assertString(json.getString("name"), "name")
                        // Description is optional; a missing or blank value stores as empty.
                        val description = json.getString("description") { "" }

                        requireUser(json) { user ->
                            val session = SessionManager.createSession(name, user.id, description)
                            UserManager.joinSession(user.id, session.sessionId)

                            // Give the creator one invite UUID so the session is shareable
                            // immediately. The remaining nine are generated on demand.
                            val inviteUuid = try {
                                SessionManager.createInviteUuid(session.sessionId, user.id)
                            } catch (e: Exception) {
                                null
                            }

                            JSONObject {
                                "session_id" set session.sessionId
                                "sessionName" set session.sessionName
                                "description" set session.description
                                "owner" set session.owner
                                "inviteUuid" set (inviteUuid ?: "")
                            }
                        }
                    }
                }
            }

            route("getSessions") {
                post {
                    requireJsonBody { json ->
                        val sessions = json.getArray("sessions")
                        JSONArray {
                            sessions?.forEach {
                                if (it is JSONNumber) {
                                    val session = SessionManager.getSession(
                                        it.asLong()
                                    )
                                    if (session != null) {
                                        add(
                                            JSONCodec.encode(
                                                session
                                            )
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            route("getSession/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                get {
                    requireUserFromQuery { caller ->
                        val session = requireSession(sessionId)

                        requireSessionMember(session, caller.id) {
                            sessionView(session, caller.id)
                        }
                    }
                }
            }

            route("sendMessage/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireJoinedSession(json, sessionId, SENDING_MESSAGE_FAILED_SEQ) {
                            val sender = assertLong(json.longValue("userid", "userId"), "userid")
                            val piecesJson = assertJsonArray(json.getArray("pieces"), "pieces")

                            assertKnownPieceTypes(piecesJson)

                            val seq = MessageManager.sendMessage(
                                sessionId,
                                sender,
                                MessagePieces.decode(piecesJson)
                            )

                            // Publish only after persistence succeeds, using canonical JSON.
                            MessageManager.getMessage(sessionId, seq)?.let { message ->
                                OxypeWebSocketServer.publishMessage(sessionId, message)
                            }
                            JSONObject {
                                "seq" set seq
                            }
                        }
                    }
                }
            }

            route("editMessage/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireJoinedSession(json, sessionId, EDIT_MESSAGE_FAILED) {
                            val sender = assertLong(json.longValue("userid", "userId"), "userid")
                            val messageId = assertLong(json.longValue("messageId", "seq"), "messageId")
                            val piecesJson = assertJsonArray(json.getArray("pieces"), "pieces")

                            // Share the send path's piece validation so an unknown type is
                            // a 400 naming it rather than a 500 out of MessagePiece.decode.
                            assertKnownPieceTypes(piecesJson)

                            // Membership is already proven, so the session itself is not
                            // needed here any more; the lookup still rejects a session id
                            // whose record is gone with a 404 before anything is written.
                            requireSession(sessionId)
                            val existing = MessageManager.getMessage(sessionId, messageId)
                            if (existing == null) {
                                abortWith(
                                    IllegalArgumentException("Message not found"),
                                    HttpResponseStatus.NOT_FOUND,
                                    this
                                )
                                throw IllegalStateException("Unreachable: the request was aborted")
                            }

                            // Only the author may revise their own words. Deleting is
                            // what moderation uses (author or session admin/owner);
                            // rewriting someone else's message is not moderation.
                            // Membership was already established above.
                            if (existing.sender != sender) {
                                abortWith(
                                    AuthenticationException("Only the author can edit this message"),
                                    HttpResponseStatus.FORBIDDEN,
                                    this
                                )
                                throw IllegalStateException("Unreachable: the request was aborted")
                            }

                            val edited = MessageManager.editMessage(
                                sessionId,
                                messageId,
                                MessagePieces.decode(piecesJson)
                            )

                            // Publish after persistence, from the stored record, so every
                            // member sees the same body and the same edit stamp.
                            edited?.let { OxypeWebSocketServer.publishMessageEdit(sessionId, it) }

                            JSONObject {
                                "success" set (edited != null)
                                "message" set (edited?.encode() ?: JSONObject())
                            }
                        }
                    }
                }
            }

            route("deleteMessage/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireJoinedSession(json, sessionId, DELETE_MESSAGE_FAILED) {
                            val sender = assertLong(json.longValue("userid", "userId"), "userid")
                            val messageId = assertLong(json.longValue("messageId", "seq"), "messageId")

                            val session = requireSession(sessionId)
                            val existing = MessageManager.getMessage(sessionId, messageId)
                            if (existing == null) {
                                abortWith(
                                    IllegalArgumentException("Message not found"),
                                    HttpResponseStatus.NOT_FOUND,
                                    this
                                )
                                throw IllegalStateException("Unreachable: the request was aborted")
                            }

                            if (existing.sender != sender && !session.isAdmin(sender)) {
                                abortWith(
                                    AuthenticationException("Only the author or a session admin can delete this message"),
                                    HttpResponseStatus.FORBIDDEN,
                                    this
                                )
                                throw IllegalStateException("Unreachable: the request was aborted")
                            }

                            val removed = MessageManager.deleteMessage(sessionId, messageId)
                            if (removed) {
                                OxypeWebSocketServer.publishMessageDelete(sessionId, messageId)
                            }

                            JSONObject {
                                "success" set removed
                                "messageId" set messageId
                            }
                        }
                    }
                }
            }

            route("receivedMessageSeq/{userid}/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                val userid by placeholder<Long>("userid")
                post {
                    requireJsonBody { json ->
                        // The sequence has to travel inside an object: Kalmia's encoder
                        // refuses to serialize a bare primitive such as `Long`, which
                        // turned this route into a 500 for every call.
                        requireJoinedSession(json, sessionId, JSONObject { "seq" set 0L }) {
                            JSONObject {
                                "seq" set MessageManager.getReceivedMessageSeq(userid, sessionId)
                            }
                        }
                    }
                }
            }

            route("getMessage/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireJoinedSession(json, sessionId, JSONArray()) {
                            val userid = assertLong(json.longValue("userid", "userId"), "userid")
                            val seq = assertLong(json.longValue("seq"), "seq")

                            val receivedMessageSeq = MessageManager.getReceivedMessageSeq(userid, sessionId)
                            val maxSeq = MessageManager.maxReceivedMessageSeq(sessionId)

                            if (seq in (receivedMessageSeq + 1)..<maxSeq) {
                                MessageManager.setReceivedMessageSeq(userid, sessionId, seq)
                            }

                            JSONArray {
                                MessageManager.getMessage(sessionId, seq)?.let { message ->
                                    add(message.encode())
                                }
                            }
                        }
                    }
                }
            }

            route("getMessages/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireJoinedSession(json, sessionId, JSONArray()) {
                            val userid = assertLong(json.longValue("userid", "userId"), "userid")
                            val start = assertLong(json.longValue("start"), "start")
                            val end = assertLong(json.longValue("end"), "end")

                            val receivedMessageSeq = MessageManager.getReceivedMessageSeq(userid, sessionId)
                            val maxSeq = MessageManager.maxReceivedMessageSeq(sessionId)

                            if (end in (receivedMessageSeq + 1)..<maxSeq) {
                                MessageManager.setReceivedMessageSeq(userid, sessionId, end)
                            }

                            JSONArray {
                                MessageManager.getMessages(sessionId, start, end).forEach {
                                    add(it.encode())
                                }
                            }
                        }
                    }
                }
            }

            /**
             * Returns the latest message of a session, or empty if none.
             *
             * GET /lastMessage/{sessionId}?userid=..&token=..
             */
            route("lastMessage/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                get {
                    requireUserFromQuery { user ->
                        val session = requireSession(sessionId)
                        requireSessionMember(session, user.id) {
                            val lastMsg = MessageManager.getLastMessage(sessionId)
                            if (lastMsg == null) {
                                JSONObject {
                                    "hasMessage" set false
                                }
                            } else {
                                // Both body pieces contribute to the preview. Matching
                                // only on MessageTextPiece left a Markdown-only message
                                // with a blank second line in the conversation list.
                                val text = lastMsg.pieces.pieces
                                    .joinToString("") { piece ->
                                        when (piece) {
                                            is MessageTextPiece -> piece.text
                                            is MessageMarkdownPiece -> piece.text
                                            else -> ""
                                        }
                                    }
                                val senderUser = UserManager.getUser(lastMsg.sender)
                                val senderName = senderUser?.username ?: "User #${lastMsg.sender}"
                                JSONObject {
                                    "hasMessage" set true
                                    "id" set lastMsg.id
                                    "sender" set lastMsg.sender
                                    "senderName" set senderName
                                    "timestamp" set lastMsg.timestamp
                                    "content" set text
                                }
                            }
                        }
                    }
                }
            }

            /**
             * Lists the members of a session.
             *
             * GET /getSessionUsers/{sessionId}?userid=..&token=..
             *
             * The token is validated with the existing [UserManager.getUserByToken]
             * lookup and the caller must already be a member of the session.
             */
            route("getSessionUsers/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                get {
                    requireUserFromQuery { user ->
                        val session = requireSession(sessionId)

                        requireSessionMember(session, user.id) {
                            JSONObject {
                                "sessionId" set session.sessionId
                                "sessionName" set session.sessionName
                                "description" set session.description
                                "owner" set session.owner
                                "isOwner" set session.isOwner(user.id)
                                "isAdmin" set session.isAdmin(user.id)
                                "users" set JSONArray {
                                    session.memberIds().forEach { add(userView(it)) }
                                }
                            }
                        }
                    }
                }
            }

            /** Joins a session using an invite UUID. */
            route("joinSessionByUuid") {
                post {
                    requireJsonBody { json ->
                        val uuid = assertString(json.getString("uuid"), "uuid")

                        requireUser(json) { user ->
                            try {
                                val session = SessionManager.joinByInviteUuid(uuid, user.id)
                                sessionView(session, user.id)
                            } catch (e: IllegalArgumentException) {
                                // An unknown or lapsed invite code is a client mistake,
                                // not a server fault, so it must not surface as a 500.
                                abortWith(e, HttpResponseStatus.BAD_REQUEST, this)
                                throw IllegalStateException("Unreachable: the request was aborted")
                            }
                        }
                    }
                }
            }

            /** Reads a session's own metadata for the settings dialog. */
            route("getSessionInfo/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireUser(json) { user ->
                            val session = requireSession(sessionId)

                            requireSessionMember(session, user.id) {
                                sessionView(session, user.id)
                            }
                        }
                    }
                }
            }

            /** Renames a session and/or updates its description (owner or admin). */
            route("updateSession/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireUser(json) { user ->
                            val session = requireSession(sessionId)

                            requireSessionAdmin(session, user.id) {
                                val name = json.getString("name")
                                val description = json.getString("description")
                                if (name == null && description == null) {
                                    abortWith(
                                        MissingParameterException("At least one of 'name' or 'description' is required"),
                                        HttpResponseStatus.BAD_REQUEST,
                                        this
                                    )
                                }
                                name?.let {
                                    if (it.isBlank()) {
                                        abortWith(
                                            IllegalArgumentException("Session name must not be blank"),
                                            HttpResponseStatus.BAD_REQUEST,
                                            this
                                        )
                                    }
                                    session.sessionName = it.trim()
                                }
                                description?.let { session.description = it.trim() }
                                try {
                                    SessionManager.saveSession(session)
                                } catch (e: IllegalArgumentException) {
                                    abortWith(e, HttpResponseStatus.BAD_REQUEST, this)
                                }
                                sessionView(session, user.id)
                            }
                        }
                    }
                }
            }

            /** Removes a member from a session (owner or admin). */
            route("removeSessionMember/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        val targetId = assertLong(
                            json.longValue("targetUserid", "targetUserId"),
                            "targetUserid"
                        )

                        requireUser(json) { user ->
                            val session = requireSession(sessionId)

                            requireSessionAdmin(session, user.id) {
                                if (session.isOwner(targetId)) {
                                    abortWith(
                                        IllegalStateException("The session owner cannot be removed"),
                                        HttpResponseStatus.FORBIDDEN,
                                        this
                                    )
                                }
                                // An admin may not remove a peer admin unless they own the session.
                                if (!session.isOwner(user.id) && session.isAdmin(targetId)) {
                                    abortWith(
                                        IllegalStateException("Only the owner can remove an admin"),
                                        HttpResponseStatus.FORBIDDEN,
                                        this
                                    )
                                }

                                session.removeMember(targetId)
                                SessionManager.saveSession(session)
                                UserManager.leaveSession(targetId, sessionId)
                                sessionView(session, user.id)
                            }
                        }
                    }
                }
            }

            /**
             * Grants or revokes administrator rights for a member (owner only).
             *
             * Promotion is the owner's prerogative alone: an admin can remove a peer
             * from the session, but must not be able to create another admin, or the
             * owner's authority could be diluted by a co-admin. The owner is never
             * demoted here, because ownership is not an admin flag.
             */
            route("setSessionAdmin/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        val targetId = assertLong(
                            json.longValue("targetUserid", "targetUserId"),
                            "targetUserid"
                        )
                        val makeAdmin = assertBoolean(json.booleanValue("admin"), "admin")

                        requireUser(json) { user ->
                            val session = requireSession(sessionId)

                            requireSessionOwner(session, user.id) {
                                if (session.isOwner(targetId)) {
                                    abortWith(
                                        IllegalStateException("The session owner is always an admin"),
                                        HttpResponseStatus.FORBIDDEN,
                                        this
                                    )
                                }
                                if (!session.hasMember(targetId)) {
                                    abortWith(
                                        IllegalArgumentException("That user is not a member of this session"),
                                        HttpResponseStatus.BAD_REQUEST,
                                        this
                                    )
                                }

                                if (makeAdmin) {
                                    session.addAdmin(targetId)
                                } else {
                                    session.removeAdmin(targetId)
                                }
                                SessionManager.saveSession(session)
                                sessionView(session, user.id)
                            }
                        }
                    }
                }
            }

            /** Leaves a session. Ownership transfers to the next member when possible. */
            route("leaveSession/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireUser(json) { user ->
                            val session = requireSession(sessionId)

                            requireSessionMember(session, user.id) {
                                session.removeMember(user.id)
                                UserManager.leaveSession(user.id, sessionId)

                                if (session.isOwner(user.id)) {
                                    val next = session.memberIds().firstOrNull()
                                    if (next != null) {
                                        session.owner = next
                                        session.addMember(next)
                                    }
                                }

                                SessionManager.saveSession(session)

                                JSONObject {
                                    "left" set true
                                    "sessionId" set sessionId
                                }
                            }
                        }
                    }
                }
            }

            /** Lists the live invite UUIDs of a session (owner or admin). */
            route("getSessionInvites/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireUser(json) { user ->
                            val session = requireSession(sessionId)

                            requireSessionAdmin(session, user.id) {
                                val uuids = SessionManager.getInviteUuids(sessionId, user.id)
                                JSONObject {
                                    "uuids" set JSONArray { uuids.forEach { add(it) } }
                                    "max" set SessionManager.MAX_INVITE_UUIDS
                                }
                            }
                        }
                    }
                }
            }

            /** Generates a new invite UUID (owner or admin, capped per session). */
            route("createSessionInvite/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireUser(json) { user ->
                            val session = requireSession(sessionId)

                            requireSessionAdmin(session, user.id) {
                                try {
                                    val uuid = SessionManager.createInviteUuid(sessionId, user.id)
                                    JSONObject {
                                        "uuid" set uuid
                                    }
                                } catch (e: IllegalStateException) {
                                    abortWith(
                                        e,
                                        HttpResponseStatus.BAD_REQUEST,
                                        this
                                    )
                                }
                            }
                        }
                    }
                }
            }

            /** Revokes an invite UUID (owner or admin). */
            route("revokeSessionInvite/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        val uuid = assertString(json.getString("uuid"), "uuid")

                        requireUser(json) { user ->
                            val session = requireSession(sessionId)

                            requireSessionAdmin(session, user.id) {
                                val removed = SessionManager.revokeInviteUuid(sessionId, user.id, uuid)
                                JSONObject {
                                    "revoked" set removed
                                    "uuid" set uuid
                                }
                            }
                        }
                    }
                }
            }
        })
    }
}
