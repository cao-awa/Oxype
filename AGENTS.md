# Oxype — agent notes

Conventions a reader cannot recover from the code alone. Everything discoverable from the tree, `build.gradle.kts`, or `plugin.json` is left to the environment.

## Documentation is part of every change

A change is not finished while the docs still describe the old behaviour. Any edit that touches a route, a field, a response shape, a WebSocket message, a status code, or anything else a client observes needs `docs/api/README.md` and `docs/api/README_zh.md` updated in the same piece of work — before reporting the change as done.

Both files are one document in two languages:

- The same `###` sections, in the same order, with the same field lists. A section is never added, renamed or removed in one without the other.
- Both carry the `[简体中文](…) | [English](…)` switcher line under the title.
- English uses ``double-backtick`` inline code and `:type` annotations. Chinese uses the same, with the labels `请求类型:` / `接口:` / `请求体:` / `请求体示例:` / `返回值:` / `返回值示例:` and WebSocket `方向:` / `消息体:` / `消息体示例:`.
- Every HTTP section has a `Request body` list with an example, and a `Response` list with an example. Annotated variants (`Response example (with credentials):`) are fine where a route answers in more than one shape — those routes need an example per shape.

Explain *why* where a reader would otherwise be tempted to build the obvious wrong thing: the revision counter's read-before-list ordering, friend conversations refusing group routes, the at-most-once push. A field list alone invites a client that misuses the field.

`README.md` and `docs/README_zh.md` cover the project itself — features, requirements, build, deployment layout, configuration. A new configuration key or deployment step belongs in both.

## Verifying frontend work

`client/` in this repo is the source, not what the running server serves. After changing any client file, copy it to the deployment's `client/` directory and compare the bytes the server actually returns against the file on disk (`curl.exe` against the running port) before trusting a browser-level test — the server caches assets in memory, so a stale copy looks exactly like a passing change. With `asset_manager.cache` on, the server must restart before it serves new bytes.

Falsify a check before believing it: strip the fix, watch the check fail, put the fix back.

## Kotlin and the client

Client code is plain JS/CSS with no build step. Two skins live side by side — the default under `client/` and the classic under `client/classic/` — and they share no CSS variables; classic styles from `--cl-*` tokens only. A feature added to one skin is not thereby present in the other.

A new field on a persisted Cason-decoded type must be nullable with an extension-property reader: reflective decoding passes `null` for missing keys and ignores Kotlin defaults, so a non-null field breaks every record already in RocksDB.
