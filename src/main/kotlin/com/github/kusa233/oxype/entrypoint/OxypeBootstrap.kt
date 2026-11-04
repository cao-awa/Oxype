package com.github.kusa233.oxype.entrypoint

import com.github.kusa233.kalmia.server.network.KalmiaNetworkConfig

object OxypeBootstrap {
    @JvmStatic
    fun bootstrap() {
        KalmiaNetworkConfig.responseFillStacktrace = true

        OxypeHttpServer.start()
        OxypeWebSocketServer.start()
    }

    @JvmStatic
    fun unload() {
        OxypeWebSocketServer.unload()
    }
}