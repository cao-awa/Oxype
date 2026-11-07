# Oxype

Oxype 是一个基于 [Kalmia](https://github.com/cao-awa/Kalmia) 的即时通讯平台。

它以 Kalmia 插件的形式发布：单个 JVM 进程通过 HTTP 提供网页客户端，通过自带的 WebSocket 服务推送实时更新，全部数据存放在 RocksDB 中。

[简体中文](README_zh.md) | [English](../README.md)

## 功能

- **群聊会话** —— 会话拥有所有者、管理员与成员；所有者离开时所有权自动移交。
- **好友会话** —— 仅在好友关系存续期间存在的单聊通道。接受请求时立即创建会话；删除好友时会连同其消息历史一并删除。
- **结构化消息** —— 一条消息由若干片段组成：纯文本、Markdown，以及对更早一条消息的引用。引用内容存在回复内部，因此原消息被编辑或删除后，引用仍然显示原本被回复的内容。
- **实时更新** —— 新消息、编辑、删除与权限变化通过 WebSocket 推送；另有按账户计的计数，让客户端能发现自己漏收了一次推送。
- **邀请** —— 可撤销的 UUID 链接，持有者凭此加入会话。
- **头像** —— 账户与会话均可设置，服务端会校验格式与尺寸。
- **两套皮肤** —— 默认皮肤与经典皮肤，都是无需构建步骤的原生 HTML/CSS/JS。
- **按账户定制前端** —— 账户可以替换自己的聊天页源码，因此无需改动服务端也能改造客户端。

## 环境要求

- JDK 21 或更高（构建目标为 21 toolchain）
- 承载本插件的 [Kalmia](https://github.com/cao-awa/Kalmia) 运行时

## 构建

```bash
./gradlew build
```

插件 jar 输出到 `build/libs/`。运行测试：

```bash
./gradlew test
```

## 运行

Oxype 是 Kalmia 插件而不是独立程序：它通过 `src/main/resources/META-INF/plugin.json` 加载，入口为 `OxypeBootstrap#bootstrap`。把 jar 放进宿主机的 `libs` 目录，并以部署根目录作为工作目录启动宿主。该目录需包含：

```
configs/     配置（见下）
client/      网页客户端
databases/   RocksDB 数据，首次运行时创建
libs/        本插件及其依赖
tls/         certificate.pem 与 private.key
logs/        首次运行时创建
```

## 配置

`configs/kalmia_http.json` —— HTTP 服务与静态资源：

| 键 | 含义 |
| --- | --- |
| `server_host`、`server_port` | HTTP 监听地址，默认端口 `12345`。 |
| `tls.enable`、`tls.certificate`、`tls.private_key` | TLS 材料，相对于工作目录。 |
| `asset_manager.asset_path` | 网页客户端的根目录。 |
| `asset_manager.cache` | 是否在内存中缓存资源字节。为 `true` 时，替换客户端文件后需要重启才会提供新内容。 |

`configs/oxype_websocket.json` —— WebSocket 服务。文件不存在时会以默认值创建：

| 键 | 含义 |
| --- | --- |
| `server_host`、`server_port` | WebSocket 监听地址，默认端口 `12346`。 |
| `netty.*` | Netty 套接字选项（`keep_alive`、`tcp_no_delay`、`reuse_address`、缓冲区大小等），嵌套在 `netty` 之下。 |

WebSocket 端点为 `ws://{host}:{port}/oxype`。它与 HTTP 服务是独立的两个服务、独立的端口，连接建立后必须先发送 `auth` 帧。

## 文档

- [API 文档](api/README_zh.md) —— 全部 HTTP 接口与 WebSocket 消息，简体中文。
- [API reference](api/README.md) —— 同一份参考的英文版。

**文档是每次改动的一部分。** 任何改动只要涉及接口、字段、消息形状或客户端可见的行为，就必须在两种语言的文档里都写清楚，才算完成。两个文件的小节顺序完全一致，因此不允许只往其中一个添加小节。

## 许可证

GNU General Public License v3.0 —— 见 [LICENSE](../LICENSE)。
