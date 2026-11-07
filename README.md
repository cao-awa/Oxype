# Oxype

Oxype is an instant messaging platform built on [Kalmia](https://github.com/cao-awa/Kalmia).

It ships as a Kalmia plugin: one JVM process serves the web client over HTTP, pushes live updates over its own WebSocket server, and keeps everything in RocksDB.

[简体中文](docs/README_zh.md) | [English](README.md)

## Features

- **Group conversations** — sessions with an owner, admins and members; ownership transfers when the owner leaves.
- **Friend conversations** — one-to-one channels that exist only while the friendship does. Accepting a request creates the conversation immediately; removing the friend deletes it along with its history.
- **Messages with structure** — a message is a list of pieces: plain text, Markdown, and quotations of an earlier message. A quotation is stored inside the reply, so it still reads correctly after the original is edited or deleted.
- **Live updates** — new messages, edits, deletions and access changes are pushed over a WebSocket, with a per-account revision counter so a client can detect that it missed a push.
- **Invites** — revocable UUID links that join the holder into a session.
- **Avatars** — for accounts and sessions, validated server-side by format and dimensions.
- **Two skins** — a default skin and a classic one; each is plain HTML/CSS/JS with no build step.
- **Per-account front-end overrides** — an account may replace its own chat page sources, so the client can be reworked without touching the server.

## Requirements

- JDK 21 or newer (the build targets a 21 toolchain)
- The [Kalmia](https://github.com/cao-awa/Kalmia) runtime that hosts the plugin

## Build

```bash
./gradlew build
```

The plugin jar is written to `build/libs/`. Run the tests with:

```bash
./gradlew test
```

## Run

Oxype is a Kalmia plugin, not a standalone program: it is loaded through `src/main/resources/META-INF/plugin.json`, whose entrypoint is `OxypeBootstrap#bootstrap`. Drop the jar into the host's `libs` directory and start the host with the working directory set to the deployment root, which must contain:

```
configs/     configuration (see below)
client/      the web client
databases/   RocksDB data, created on first run
libs/        this plugin and its dependencies
tls/         certificate.pem and private.key
logs/        created on first run
```

## Configuration

`configs/kalmia_http.json` — the HTTP server and static asset serving:

| Key | Meaning |
| --- | --- |
| `server_host`, `server_port` | Where the HTTP server listens. Port `12345` by default. |
| `tls.enable`, `tls.certificate`, `tls.private_key` | TLS material, relative to the working directory. |
| `asset_manager.asset_path` | Folder the web client is served from. |
| `asset_manager.cache` | Whether asset bytes are cached in memory. When `true`, replacing a client file needs a restart before the server serves the new bytes. |

`configs/oxype_websocket.json` — the WebSocket server. Created with defaults if absent:

| Key | Meaning |
| --- | --- |
| `server_host`, `server_port` | Where the WebSocket server listens. Port `12346` by default. |
| `netty.*` | Netty socket options (`keep_alive`, `tcp_no_delay`, `reuse_address`, buffer sizes, and so on), nested under `netty`. |

The WebSocket endpoint is `ws://{host}:{port}/oxype`. It is a separate server from the HTTP one, on its own port, and a connection must send an `auth` frame before anything else.

## Documentation

- [API reference](docs/api/README.md) — every HTTP endpoint and WebSocket message, in English.
- [API 文档](docs/api/README_zh.md) — the same reference in Simplified Chinese.

**These documents are part of every change.** A change that alters an endpoint, a field, a message shape or a behaviour visible to a client is not finished until both language versions describe it. Both files carry the same sections in the same order, so a section is never added to one without the other.

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE).
