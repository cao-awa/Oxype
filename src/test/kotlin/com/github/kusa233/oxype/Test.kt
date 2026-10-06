package com.github.kusa233.oxype

import com.github.kusa233.kalmia.server.network.KalmiaNetworkConfig
import com.github.kusa233.oxype.entrypoint.OxypeHttpServer

object Test {
    @JvmStatic
    fun main() {
        KalmiaNetworkConfig.responseFillStacktrace = true
        OxypeHttpServer.start()

        Thread.sleep(10000000000L)
    }
}

fun main() {
    Test.main()
}