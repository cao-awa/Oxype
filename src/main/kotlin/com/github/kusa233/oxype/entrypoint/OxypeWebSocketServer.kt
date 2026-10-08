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
import com.github.kusa233.oxype.element.message.Message
import com.github.kusa233.oxype.json.OxypeJsonParser
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

    /** Publishes a persisted message to subscribed users other than [sender]. */
    @JvmStatic
    fun publishMessage(sessionId: Long, sender: Long, message: Message) {
        val payload = JSONObject {
            "type" set "message"
            "sessionId" set sessionId
            "data" set message.encode()
        }.toString()
        clients.forEach { client ->
            if (client.isSubscribed(sessionId) && client.userId != sender) {
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
            val json = runCatching { OxypeJsonParser.parseObject(payload) }.getOrNull()
            val type = json?.getString("type")

            when (type) {
                "auth" -> {
                    val userid = json?.getLong("userid")
                        ?: json?.getString("userid")?.toLongOrNull()
                        ?: json?.getLong("userId")
                        ?: json?.getString("userId")?.toLongOrNull()
                    val token = json?.getString("token")
                    authenticated = userid != null && !token.isNullOrBlank() && UserManager.verifyToken(userid, token)
                    if (authenticated) {
                        userId = userid
                        authToken = token
                        subscriptions.clear()
                        UserManager.getJoinedSessions(userid!!).sessions.forEach { subscriptions.add(it) }
                        ctx.writeAndFlush(TextWebSocketFrame("{\"type\":\"ready\"}"))
                    } else {
                        ctx.writeAndFlush(TextWebSocketFrame("{\"type\":\"error\",\"code\":\"unauthorized\"}"))
                        ctx.close()
                    }
                }
                "ping" -> if (authenticated) ctx.writeAndFlush(TextWebSocketFrame("{\"type\":\"pong\"}"))
                "subscribe", "unsubscribe" -> if (authenticated) {
                    val sessionId = json?.getLong("sessionId")
                        ?: json?.getString("sessionId")?.toLongOrNull()
                        ?: json?.getLong("session_id")
                        ?: json?.getString("session_id")?.toLongOrNull()
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
