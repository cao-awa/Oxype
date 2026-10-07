package com.github.kusa233.oxype

import com.github.kusa233.kalmia.server.network.KalmiaNetworkConfig
import com.github.kusa233.oxype.entrypoint.OxypeHttpServer
import com.github.kusa233.oxype.entrypoint.OxypeWebSocketServer

object Test {
    @JvmStatic
    fun main() {
        KalmiaNetworkConfig.responseFillStacktrace = true
        OxypeHttpServer.start()
        OxypeWebSocketServer.start()

        Thread.sleep(10000000000L)
    }
}

fun main() {
    Test.main()
}