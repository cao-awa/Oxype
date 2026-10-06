package com.github.kusa233.oxype.entrypoint

import com.github.cao.awa.cason.array.JSONArray
import com.github.cao.awa.cason.codec.JSONCodec
import com.github.cao.awa.cason.codec.decoder.JSONDecoder
import com.github.cao.awa.cason.codec.encoder.JSONEncoder
import com.github.cao.awa.cason.obj.JSONObject
import com.github.cao.awa.cason.primary.JSONNumber
import com.github.cao.awa.cason.serialize.parser.JSONParser
import com.github.kusa233.kalmia.server.network.KalmiaNetworkConfig
import com.github.kusa233.kalmia.server.network.http.body.json.KalmiaHttpJsonBody
import com.github.kusa233.kalmia.server.network.http.body.text.KalmiaHttpTextBody
import com.github.kusa233.kalmia.server.network.http.builder.http
import com.github.kusa233.kalmia.server.network.http.context.KalmiaHttpContext
import com.github.kusa233.kalmia.server.network.http.entrypoint.service.KalmiaHttpService
import com.github.kusa233.kalmia.server.network.http.placeholder.url.type.placeholder
import com.github.kusa233.oxype.element.message.piece.MessagePieces
import com.github.kusa233.oxype.exception.body.NeedJsonBodyException
import com.github.kusa233.oxype.exception.login.AuthenticationException
import com.github.kusa233.oxype.exception.request.MissingParameterException
import com.github.kusa233.oxype.message.MessageManager
import com.github.kusa233.oxype.session.Session
import com.github.kusa233.oxype.session.manager.SessionManager
import com.github.kusa233.oxype.user.manager.UserManager
import io.netty.handler.codec.http.HttpResponseStatus
import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.Logger

object OxypeHttpServer {
    private val LOGGER: Logger = LogManager.getLogger("OxypeHttpServer")
    private val SENDING_MESSAGE_FAILED_SEQ: JSONObject = JSONObject {
        "seq" set -1L
    }

    fun KalmiaHttpContext.enableCors() {
        responseHeaders().set("Access-Control-Allow-Origin", "*")
        responseHeaders().set("Access-Control-Allow-Headers", "*")
        responseHeaders().set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
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
        val body = body()
        if (body is KalmiaHttpJsonBody) {
            return action(body.json)
        }
        if (body is KalmiaHttpTextBody) {
            try {
                val json = JSONParser.parseObject(body.text)
                return action(json)
            } catch (e: Exception) {
                // fall through
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

    fun <T> KalmiaHttpContext.requireJoinedSession(
        json: JSONObject,
        sessionId: Long,
        defaultValue: T,
        action: () -> T
    ): T {
        val userid = assertLong(json.getLong("userid"), "userid")
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

    @JvmStatic
    fun start() {
        KalmiaHttpService.start(http {
            assets("client")

            route("isAlive/{userid}") {
                val userid by placeholder<Long>("userid")
                post {
                    println("Alive ping")
                    requireJsonBody { json ->
                        val token = assertString(json.getString("token"), "token")

                        val alive = UserManager.verifyToken(userid, token)
                        println(alive)
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
                    enableCors()
                    val user = UserManager.getUser(userid)
                    if (user == null) {
                        abortWith(
                            IllegalArgumentException("User not found"),
                            HttpResponseStatus.NOT_FOUND,
                            this
                        )
                    } else {
                        JSONEncoder.encodeData(user).also {
                            it.put("hashedPassword", "HIDDEN")
                        }
                    }
                }
            }

            route("getJoinedSessions/{userid}") {
                val userid by placeholder<Long>("userid")
                get {
                    enableCors()
                    UserManager.getJoinedSessions(userid)
                }
            }

            route("login/{userid}") {
                val userid by placeholder<Long>("userid")
                post {
                    requireJsonBody { json ->
                        try {
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
                        } catch (e: Exception) {
                            e.printStackTrace()
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
                    try {
                        requireJsonBody { json ->
                            val name = assertString(json.getString("name"), "name")
                            val token = assertString(json.getString("token"), "token")
                            val userid = assertLong(json.getLong("userId"), "userid")

                            val user = UserManager.getUserByToken(token, userid)

                            val session = SessionManager.createSession(name)

                            if (user != null) {
                                UserManager.joinSession(user.id, session.sessionId)
                            }

                            JSONObject {
                                "session_id" set session.sessionId
                            }
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }

            route("getSessions") {
                post {
                    requireJsonBody { json ->
                        val sessions = json.getArray("sessions")
                        println("Getting sessions: $sessions")
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
                    enableCors()
                    val session = SessionManager.getSession(sessionId)
                    if (session == null) {
                        abortWith(
                            IllegalArgumentException("Session not found"),
                            HttpResponseStatus.NOT_FOUND,
                            this
                        )
                    } else {
                        JSONEncoder.encodeData(session)
                    }
                }
            }

            route("sendMessage/{sessionId}") {
                val sessionId by placeholder<Long>("sessionId")
                post {
                    requireJsonBody { json ->
                        requireJoinedSession(json, sessionId, SENDING_MESSAGE_FAILED_SEQ) {
                            val pieces = json.getArray("pieces")!!
                            val sender = assertLong(json.getLong("userid"), "userid")

                            val seq = MessageManager.sendMessage(
                                sessionId,
                                sender,
                                MessagePieces.decode(pieces)
                            )

                            JSONObject {
                                "seq" set seq
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
                        // refuses to serialise a bare primitive such as `Long`, which
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
                            val userid = assertLong(json.getLong("userid"), "userid")
                            val seq = assertLong(json.getLong("seq"), "seq")

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
                            val userid = assertLong(json.getLong("userid"), "userid")
                            val start = assertLong(json.getLong("start"), "start")
                            val end = assertLong(json.getLong("end"), "end")

                            val receivedMessageSeq = MessageManager.getReceivedMessageSeq(userid, sessionId)
                            val maxSeq = MessageManager.maxReceivedMessageSeq(sessionId)

                            if (end in (receivedMessageSeq + 1)..<maxSeq) {
                                MessageManager.setReceivedMessageSeq(userid, sessionId, end)
                            }

                            println("$start:$end - $userid")

                            JSONArray {
                                MessageManager.getMessages(sessionId, start, end).forEach {
                                    add(it.encode())
                                }
                            }
                        }
                    }
                }
            }
        })
    }
}
