package com.github.kusa233.oxype.entrypoint

import io.netty.bootstrap.ServerBootstrap
import io.netty.channel.Channel
import io.netty.channel.ChannelInitializer
import io.netty.channel.ChannelOption
import io.netty.channel.EventLoopGroup
import io.netty.channel.nio.NioEventLoopGroup
import io.netty.channel.socket.SocketChannel
import io.netty.channel.socket.nio.NioServerSocketChannel
import io.netty.handler.codec.http.HttpObjectAggregator
import io.netty.handler.codec.http.HttpServerCodec
import io.netty.handler.codec.http.websocketx.TextWebSocketFrame
import io.netty.handler.codec.http.websocketx.WebSocketServerProtocolHandler
import com.github.cao.awa.cason.obj.JSONObject
import com.github.cao.awa.cason.serialize.parser.JSONParser
import com.github.kusa233.oxype.element.message.Message
import com.github.kusa233.oxype.session.list.SessionListRevisions
import com.github.kusa233.oxype.user.manager.UserManager
import org.apache.logging.log4j.LogManager
import org.apache.logging.log4j.Logger
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Paths
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

/**
 * Oxype's standalone WebSocket endpoint.
 *
 * This intentionally does not use Kalmia's WebSocket service. Clients authenticate with
 * `{type:"auth",userid,token}` and receive `{type:"ready"}`. Authenticated clients are
 * subscribed to all sessions they have joined; they may also send `{type:"subscribe",
 * sessionId}` or `{type:"unsubscribe",sessionId}`. New messages are broadcast as
 * `{type:"message",sessionId,data:<Message JSON>}` to other online users in that session.
 */
object OxypeWebSocketServer {
    private val logger: Logger = LogManager.getLogger("OxypeWebSocketServer")
    private const val CONFIG_PATH = "configs/oxype_websocket.json"
    private const val DEFAULT_HOST = "0.0.0.0"
    private const val DEFAULT_PORT = 12346
    private const val WEBSOCKET_PATH = "/oxype"

    private val channel = AtomicReference<Channel?>()
    private val clients = ConcurrentHashMap.newKeySet<OxypeWebSocketHandler>()
    private var bossGroup: EventLoopGroup? = null
    private var workerGroup: EventLoopGroup? = null

    /**
     * Publishes a persisted message to every subscribed client of the session.
     *
     * The sender's own other clients are included on purpose: one account signed
     * in on a phone and a desktop is two connections, and the message written on
     * the phone still has to appear on the desktop. The client that performed the
     * send de-duplicates by message id, so it ignores the echo of a row it already
     * appended optimistically.
     */
    @JvmStatic
    fun publishMessage(sessionId: Long, message: Message) {
        val payload = JSONObject {
            "type" set "message"
            "sessionId" set sessionId
            "data" set message.encode()
        }.toString()
        clients.forEach { client ->
            if (client.isSubscribed(sessionId)) {
                client.send(payload)
            }
        }
    }

    /**
     * Tells subscribed users that a message body changed.
     *
     * The editor is included as well: it has no local copy of the server's edit
     * stamp, so excluding it would leave the author's own view of their edit stale.
     */
    @JvmStatic
    fun publishMessageEdit(sessionId: Long, message: Message) {
        broadcastToSession(
            sessionId,
            JSONObject {
                "type" set "messageEdited"
                "sessionId" set sessionId
                "data" set message.encode()
            }.toString()
        )
    }

    /**
     * Tells subscribed users that a message is gone.
     *
     * The deleted body is never echoed back; only the identity and the remaining
     * body, so a removed message cannot be recovered from the wire by a client that
     * missed it while offline.
     */
    @JvmStatic
    fun publishMessageDelete(sessionId: Long, messageId: Long) {
        broadcastToSession(
            sessionId,
            JSONObject {
                "type" set "messageDeleted"
                "sessionId" set sessionId
                "messageId" set messageId
            }.toString()
        )
    }

    private fun broadcastToSession(sessionId: Long, payload: String) {
        clients.forEach { client ->
            if (client.isSubscribed(sessionId)) {
                client.send(payload)
            }
        }
    }

    /**
     * Tells one account that its list of conversations changed.
     *
     * A new conversation appears without a message being sent into it: accepting a
     * friend request creates the one-to-one conversation, and the requester -- who
     * performed no action at that moment -- would otherwise keep a sidebar without
     * it until the next reload. Addressed to a user rather than a session because
     * the recipient cannot have subscribed to a conversation they do not yet know
     * about.
     *
     * The payload carries no ids: the client reloads its own list, so the push
     * cannot be used to make a client display a conversation it may not read.
     *
     * The push is also counted, before it is sent, so that any client which does
     * not receive it can later notice. See [SessionListRevisions] for why a lost
     * push needs a number to be detected at all.
     */
    @JvmStatic
    fun publishSessionListChanged(userid: Long) {
        val revision = SessionListRevisions.bump(userid)
        val payload = JSONObject {
            "type" set "sessionsChanged"
            "revision" set revision
        }.toString()
        clients.forEach { client ->
            if (client.userId == userid) {
                client.send(payload)
            }
        }
    }

    @JvmStatic
    @Synchronized
    fun start() {
        if (channel.get()?.isOpen == true) return

        val config = loadConfig()
        val boss = NioEventLoopGroup(1)
        val workers = NioEventLoopGroup()
        bossGroup = boss
        workerGroup = workers

        try {
            val serverChannel = ServerBootstrap()
                .group(boss, workers)
                .channel(NioServerSocketChannel::class.java)
                .childHandler(object : ChannelInitializer<SocketChannel>() {
                    override fun initChannel(ch: SocketChannel) {
                        ch.pipeline()
                            .addLast(HttpServerCodec())
                            .addLast(HttpObjectAggregator(65536))
                            .addLast(WebSocketServerProtocolHandler(WEBSOCKET_PATH, null, true))
                            .addLast(OxypeWebSocketHandler())
                    }
                })
                .childOption(ChannelOption.TCP_NODELAY, config.tcpNoDelay)
                .childOption(ChannelOption.SO_KEEPALIVE, config.keepAlive)
                .childOption(ChannelOption.SO_REUSEADDR, config.reuseAddress)
                .bind(config.host, config.port)
                .sync()
                .channel()

            channel.set(serverChannel)
            logger.info("Oxype WebSocket server listening on ws://{}:{}{}", config.host, config.port, WEBSOCKET_PATH)
        } catch (error: Throwable) {
            channel.set(null)
            boss.shutdownGracefully()
            workers.shutdownGracefully()
            bossGroup = null
            workerGroup = null
            throw error
        }
    }

    @JvmStatic
    @Synchronized
    fun unload() {
        channel.getAndSet(null)?.close()?.syncUninterruptibly()
        bossGroup?.shutdownGracefully()?.syncUninterruptibly()
        workerGroup?.shutdownGracefully()?.syncUninterruptibly()
        bossGroup = null
        workerGroup = null
    }

    private fun loadConfig(): WebSocketConfig {
        val path = Paths.get(CONFIG_PATH)
        if (!Files.exists(path)) {
            Files.createDirectories(path.parent)
            Files.writeString(path, DEFAULT_CONFIG, StandardCharsets.UTF_8)
            logger.info("Created default WebSocket configuration at {}", path)
        }

        val source = Files.readString(path, StandardCharsets.UTF_8)
        return WebSocketConfig(
            host = jsonString(source, "server_host") ?: DEFAULT_HOST,
            port = jsonInt(source, "server_port") ?: DEFAULT_PORT,
            keepAlive = jsonBoolean(source, "keep_alive") ?: true,
            tcpNoDelay = jsonBoolean(source, "tcp_no_delay") ?: true,
            reuseAddress = jsonBoolean(source, "reuse_address") ?: true
        ).also {
            require(it.port in 1..65535) { "server_port must be between 1 and 65535" }
        }
    }

    private fun jsonString(source: String, key: String): String? =
        Regex("\\\"${Regex.escape(key)}\\\"\\s*:\\s*\\\"([^\\\"]*)\\\"").find(source)?.groupValues?.get(1)

    private fun jsonInt(source: String, key: String): Int? =
        Regex("\\\"${Regex.escape(key)}\\\"\\s*:\\s*(-?\\d+)").find(source)?.groupValues?.get(1)?.toIntOrNull()

    private fun jsonBoolean(source: String, key: String): Boolean? =
        Regex("\\\"${Regex.escape(key)}\\\"\\s*:\\s*(true|false)", RegexOption.IGNORE_CASE)
            .find(source)?.groupValues?.get(1)?.toBooleanStrictOrNull()

    private data class WebSocketConfig(
        val host: String,
        val port: Int,
        val keepAlive: Boolean,
        val tcpNoDelay: Boolean,
        val reuseAddress: Boolean
    )

    private val DEFAULT_CONFIG = """
{
    "server_host": "0.0.0.0",
    "server_port": 12346,
    "netty": {
        "io": "nio",
        "snd_buffer": 65535,
        "reuse_address": true,
        "backlog": 8192,
        "allocator": "default",
        "keep_alive": true,
        "rcv_buffer": 65535,
        "tcp_no_delay": true
    }
}
""".trimIndent()

    private class OxypeWebSocketHandler : io.netty.channel.SimpleChannelInboundHandler<TextWebSocketFrame>() {
        @Volatile private var authenticated = false
        @Volatile internal var userId: Long? = null
        private var authToken: String? = null
        private val subscriptions = ConcurrentHashMap.newKeySet<Long>()

        override fun channelActive(ctx: io.netty.channel.ChannelHandlerContext) {
            clients.add(this)
            super.channelActive(ctx)
        }

        override fun channelInactive(ctx: io.netty.channel.ChannelHandlerContext) {
            clients.remove(this)
            ctxRef = null
            authenticated = false
            userId = null
            subscriptions.clear()
            super.channelInactive(ctx)
        }

        internal fun isSubscribed(sessionId: Long): Boolean = subscriptions.contains(sessionId)

        internal fun send(payload: String) {
            // Channel writes are thread-safe; publication may originate on an HTTP event loop.
            if (authenticated) {
                ctxRef?.channel()?.eventLoop()?.execute {
                    if (authenticated && ctxRef?.channel()?.isActive == true) {
                        ctxRef?.writeAndFlush(TextWebSocketFrame(payload))
                    }
                }
            }
        }

        private var ctxRef: io.netty.channel.ChannelHandlerContext? = null

        override fun channelRead0(ctx: io.netty.channel.ChannelHandlerContext, frame: TextWebSocketFrame) {
            ctxRef = ctx
            val payload = frame.text()
            val json = runCatching { JSONParser.parseObject(payload) }.getOrNull()
            val type = json?.getString("type")

            when (type) {
                "auth" -> {
                    val userid = json.getLong("userid")
                        ?: json.getString("userid")?.toLongOrNull()
                        ?: json.getLong("userId")
                        ?: json.getString("userId")?.toLongOrNull()
                    val token = json.getString("token")
                    authenticated = userid != null && !token.isNullOrBlank() && UserManager.verifyToken(userid, token)
                    if (authenticated) {
                        userId = userid
                        authToken = token
                        // Read before the subscription list, for the same reason the
                        // HTTP route reads it before the sessions: a change landing in
                        // between then leaves the client with a revision that is behind,
                        // which costs a redundant reload -- never with an old list
                        // labelled as current, which would never be corrected. Reporting
                        // it at all is what lets a client tell a reconnect where nothing
                        // happened from one where a push was lost.
                        val revision = SessionListRevisions.current(userid!!)
                        subscriptions.clear()
                        UserManager.getJoinedSessions(userid!!).sessions.forEach { subscriptions.add(it) }
                        ctx.writeAndFlush(TextWebSocketFrame("{\"type\":\"ready\",\"revision\":$revision}"))
                    } else {
                        ctx.writeAndFlush(TextWebSocketFrame("{\"type\":\"error\",\"code\":\"unauthorized\"}"))
                        ctx.close()
                    }
                }
                "ping" -> if (authenticated) {
                    // The heartbeat already goes round every twenty seconds and already
                    // comes back, so the revision rides along for free. A connection
                    // that stayed open the whole time can still have missed a push --
                    // send() is a no-op while a socket is authenticating again after a
                    // token refresh, and there is a window during the handshake when the
                    // user id is not set yet -- so checking only on reconnect would
                    // leave those clients stale until the page was reloaded.
                    val revision = userId?.let { SessionListRevisions.current(it) } ?: 0L
                    ctx.writeAndFlush(TextWebSocketFrame("{\"type\":\"pong\",\"revision\":$revision}"))
                }
                "subscribe", "unsubscribe" -> if (authenticated) {
                    val sessionId = json.getLong("sessionId")
                        ?: json.getString("sessionId")?.toLongOrNull()
                        ?: json.getLong("session_id")
                        ?: json.getString("session_id")?.toLongOrNull()
                    val uid = userId
                    if (sessionId == null || uid == null || !UserManager.getJoinedSessions(uid).contains(sessionId)) {
                        ctx.writeAndFlush(TextWebSocketFrame("{\"type\":\"error\",\"code\":\"forbidden\"}"))
                    } else {
                        if (type == "subscribe") subscriptions.add(sessionId) else subscriptions.remove(sessionId)
                        ctx.writeAndFlush(TextWebSocketFrame("{\"type\":\"subscribed\",\"sessionId\":$sessionId,\"active\":${type == "subscribe"}}"))
                    }
                }
                else -> if (!authenticated) {
                    ctx.writeAndFlush(TextWebSocketFrame("{\"type\":\"error\",\"code\":\"unauthorized\"}"))
                    ctx.close()
                }
            }
        }

        override fun exceptionCaught(ctx: io.netty.channel.ChannelHandlerContext, cause: Throwable) {
            logger.debug("WebSocket connection closed: {}", cause.message)
            ctx.close()
        }
    }
}
