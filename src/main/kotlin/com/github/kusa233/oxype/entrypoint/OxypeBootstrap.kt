package com.github.kusa233.oxype.entrypoint

object OxypeBootstrap {
    @JvmStatic
    fun bootstrap() {
        OxypeHttpServer.start()
        OxypeWebSocketServer.start()
    }

    @JvmStatic
    fun unload() {
        OxypeWebSocketServer.unload()
    }
}