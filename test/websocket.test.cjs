const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadManager() {
  const listeners = new Map();
  const sockets = [];
  const window = {
    location: { protocol: 'http:', hostname: 'example.test', href: 'http://example.test/chat.html' },
    OxypeCore: { baseUrl: '', getStoredAuth: () => ({ userId: '7', token: 'secret' }) },
    OXYPE_CONFIG: {},
    WebSocket: class MockWebSocket {
      constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
      send(value) { this.sent.push(value); }
      close() { this.readyState = 3; if (this.onclose) this.onclose(); }
    },
    CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatchEvent(event) { const listener = listeners.get(event.type); if (listener) listener(event); }
  };
  const context = vm.createContext({ window, setTimeout, clearTimeout, setInterval, clearInterval, URL, Math, console });
  vm.runInContext(fs.readFileSync('client/websocket.js', 'utf8'), context);
  return { manager: window.OxypeWebSocket, sockets };
}

test('connects to default endpoint and authenticates on open', () => {
  const { manager, sockets } = loadManager();
  assert.equal(manager.getUrl(), 'ws://example.test:12346/oxype');
  manager.start({ userId: 7, token: 'secret' });
  assert.equal(sockets.length, 1);
  const socket = sockets[0];
  socket.readyState = 1;
  socket.onopen();
  assert.deepEqual(JSON.parse(socket.sent[0]), { type: 'auth', userid: '7', token: 'secret' });
  assert.deepEqual(JSON.parse(socket.sent[1]), { type: 'ping' });
  socket.onmessage({ data: 'ready' });
  assert.equal(manager.isReady(), true);
  socket.onmessage({ data: 'pong' });
  manager.stop();
});

test('uses explicit websocket URL override', () => {
  const { manager } = loadManager();
  assert.equal(manager.getUrl(), 'ws://example.test:12346/oxype');
});
