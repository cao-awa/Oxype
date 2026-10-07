package com.github.kusa233.oxype.entrypoint

import com.github.kusa233.kalmia.server.network.websocket.builder.websocket
import com.github.kusa233.kalmia.server.network.websocket.entrypoint.service.KalmiaWebSocketService

object OxypeWebSocketServer {
    @JvmStatic
    fun start() {
        KalmiaWebSocketService.start(websocket {
            route("/initalize") {
                onMessage {

                }
            }
        })
    }
}