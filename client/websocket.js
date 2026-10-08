/**
 * Oxype Web Client - Shared WebSocket connection manager.
 * Transport only: sends heartbeat pings and expects pong; message business stays in skins.
 */
(function (global) {
    'use strict';

    var DEFAULT_PORT = '12346';
    var DEFAULT_PATH = '/oxype';
    var CONNECT_TIMEOUT_MS = 10000;
    var HEARTBEAT_INTERVAL_MS = 20000;
    var HEARTBEAT_TIMEOUT_MS = 10000;
    var RECONNECT_BASE_MS = 1000;
    var RECONNECT_MAX_MS = 30000;

    var socket = null;
    var reconnectTimer = null;
    var connectTimer = null;
    var heartbeatTimer = null;
    var heartbeatTimeout = null;
    var stopped = true;
    var suspended = false;
    var retryCount = 0;
    var authState = null;
    var ready = false;
    var subscriptions = new Map();

    function clearTimer(name) {
        if (name) {
            global.clearTimeout(name);
            global.clearInterval(name);
        }
    }

    function clearTimers() {
        clearTimer(reconnectTimer);
        clearTimer(connectTimer);
        clearTimer(heartbeatTimer);
        clearTimer(heartbeatTimeout);
        reconnectTimer = null;
        connectTimer = null;
        heartbeatTimer = null;
        heartbeatTimeout = null;
    }

    function configuredUrl() {
        if (global.OXYPE_CONFIG && typeof global.OXYPE_CONFIG.websocketUrl === 'string'
            && global.OXYPE_CONFIG.websocketUrl.trim()) {
            return global.OXYPE_CONFIG.websocketUrl.trim();
        }

        var base = global.OxypeCore && typeof global.OxypeCore.baseUrl === 'string'
            ? global.OxypeCore.baseUrl.trim() : '';
        var page = global.location || {};
        var protocol = page.protocol === 'https:' ? 'wss:' : 'ws:';
        var host = page.hostname || '127.0.0.1';
        var port = DEFAULT_PORT;

        if (base && /^https?:\/\//i.test(base)) {
            try {
                var parsed = new URL(base, page.href || undefined);
                protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
                host = parsed.hostname || host;
                port = DEFAULT_PORT;
            } catch (e) {
                // Fall back to the page host and the WebSocket server's default port.
            }
        }
        return protocol + '//' + host + ':' + port + DEFAULT_PATH;
    }

    function emit(name, detail) {
        if (typeof global.dispatchEvent !== 'function') return;
        try {
            global.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
        } catch (e) {
            // Custom events are diagnostic only and must never affect the transport.
        }
    }

    function scheduleReconnect() {
        if (stopped || suspended || reconnectTimer || socket) return;
        var delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, retryCount));
        var jitter = Math.floor(Math.random() * Math.min(500, delay / 2));
        retryCount += 1;
        reconnectTimer = global.setTimeout(function () {
            reconnectTimer = null;
            connect();
        }, delay + jitter);
    }

    function failSocket(instance) {
        if (instance !== socket) return;
        clearTimer(connectTimer);
        connectTimer = null;
        clearTimer(heartbeatTimer);
        clearTimer(heartbeatTimeout);
        heartbeatTimer = null;
        heartbeatTimeout = null;
        socket = null;
        ready = false;
        emit('oxype:websocket:closed');
        scheduleReconnect();
    }

    function sendPing(instance) {
        if (instance !== socket || instance.readyState !== 1) return;
        try {
            instance.send(JSON.stringify({ type: 'ping' }));
            clearTimer(heartbeatTimeout);
            heartbeatTimeout = global.setTimeout(function () {
                if (instance === socket) {
                    try { instance.close(); } catch (e) { failSocket(instance); }
                }
            }, HEARTBEAT_TIMEOUT_MS);
        } catch (e) {
            failSocket(instance);
        }
    }

    function startHeartbeat(instance) {
        clearTimer(heartbeatTimer);
        clearTimer(heartbeatTimeout);
        heartbeatTimer = global.setInterval(function () { sendPing(instance); }, HEARTBEAT_INTERVAL_MS);
        sendPing(instance);
    }

    function connect() {
        if (stopped || suspended || socket || reconnectTimer || typeof global.WebSocket !== 'function') return;
        var url = configuredUrl();
        var instance;
        try {
            instance = new global.WebSocket(url);
        } catch (error) {
            emit('oxype:websocket:error', { error: error });
            scheduleReconnect();
            return;
        }
        socket = instance;
        emit('oxype:websocket:connecting', { url: url });
        connectTimer = global.setTimeout(function () {
            if (instance === socket && instance.readyState !== 1) {
                try { instance.close(); } catch (e) { failSocket(instance); }
            }
        }, CONNECT_TIMEOUT_MS);

        instance.onopen = function () {
            if (instance !== socket) return;
            clearTimer(connectTimer);
            connectTimer = null;
            retryCount = 0;
            ready = false;
            if (authState) {
                try {
                    instance.send(JSON.stringify({ type: 'auth', userid: authState.userId, token: authState.token }));
                    subscriptions.forEach(function (sessionId) {
                        instance.send(JSON.stringify({ type: 'subscribe', sessionId: String(sessionId) }));
                    });
                } catch (e) {
                    failSocket(instance);
                    return;
                }
            }
            emit('oxype:websocket:open', { url: url });
            startHeartbeat(instance);
        };
        instance.onmessage = function (event) {
            if (instance !== socket) return;
            var data = event ? event.data : undefined;
            var message = data;
            if (typeof data === 'string') {
                try { message = JSON.parse(data); } catch (e) { }
            }
            if (data === 'pong' || (message && message.type === 'pong')) {
                clearTimer(heartbeatTimeout);
                heartbeatTimeout = null;
            }
            if (data === 'ready' || (message && message.type === 'ready')) {
                ready = true;
                emit('oxype:websocket:ready', { data: data });
            }
            emit('oxype:websocket:message', { data: data });
        };
        instance.onerror = function (error) {
            if (instance === socket) emit('oxype:websocket:error', { error: error });
        };
        instance.onclose = function () { failSocket(instance); };
    }

    function start(auth) {
        if (auth && auth.userId && auth.token) {
            authState = { userId: String(auth.userId), token: String(auth.token) };
        } else if (!authState && global.OxypeCore && typeof global.OxypeCore.getStoredAuth === 'function') {
            authState = global.OxypeCore.getStoredAuth();
        }
        stopped = false;
        suspended = false;
        if (!socket && !reconnectTimer) connect();
    }

    function subscribe(sessionId) {
        if (sessionId === undefined || sessionId === null || String(sessionId) === '') return;
        var key = String(sessionId);
        subscriptions.set(key, key);
        if (socket && socket.readyState === 1 && ready) {
            try { socket.send(JSON.stringify({ type: 'subscribe', session_id: key })); } catch (e) { }
        }
    }

    function unsubscribe(sessionId) {
        if (sessionId === undefined || sessionId === null) return;
        var key = String(sessionId);
        subscriptions.delete(key);
        if (socket && socket.readyState === 1 && ready) {
            try { socket.send(JSON.stringify({ type: 'unsubscribe', session_id: key })); } catch (e) { }
        }
    }

    function stop() {
        stopped = true;
        suspended = false;
        authState = null;
        ready = false;
        clearTimers();
        var instance = socket;
        socket = null;
        if (instance) {
            try { instance.close(1000, 'client stopped'); } catch (e) { }
        }
    }

    function suspend() {
        suspended = true;
        clearTimers();
        var instance = socket;
        socket = null;
        if (instance) {
            try { instance.close(1000, 'page hidden'); } catch (e) { }
        }
    }

    function resume() {
        suspended = false;
        if (!stopped) start();
    }

    global.OxypeWebSocket = {
        start: start,
        stop: stop,
        suspend: suspend,
        resume: resume,
        getUrl: configuredUrl,
        isOpen: function () { return !!socket && socket.readyState === 1; },
        isReady: function () { return ready; },
        subscribe: subscribe,
        unsubscribe: unsubscribe
    };

    global.addEventListener('pagehide', suspend);
    global.addEventListener('pageshow', resume);
})(window);
