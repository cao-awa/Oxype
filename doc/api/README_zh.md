# API
本文档为API文档，记录Oxype的HTTP和WebSocket API。

[简体中文](README_zh.md) | [English](README.md)

## HTTP

所有接口的请求体与返回值均为JSON，且返回值由Kalmia包裹在 ``{"data": ...}`` 信封中（下文各接口的“返回值示例”给出的是 ``data`` 节点内的内容）。

约定:
1. 鉴权字段为 ``userid`` 与 ``token``，``userId`` 可作为 ``userid`` 的别名。
2. POST接口从JSON请求体读取鉴权字段；GET接口从查询字符串读取，读取不到时回退到请求头 ``userid``/``X-User-Id`` 与 ``token``/``X-Token``。
3. 通用错误:请求体不是合法JSON或缺少必填字段返回400，token无效返回401，无权访问返回403，目标不存在返回404。

### isAlive

请求类型:POST

接口:``/isAlive/{userid}``

请求体:
1. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "token": "ABC"
}
```

返回值:
1. ``is_alive``:boolean

返回值示例:
```json
{
  "is_alive": true
}
```

### register

请求类型:POST

接口:``/register``

请求体:
1. ``username``:string（最长15个字符）
2. ``password``:string（长度6到20个字符）

请求体示例:
```json
{
  "username": "cao-awa",
  "password": "123456"
}
```

返回值:
1. ``userid``:long
2. ``token``:string

返回值示例:
```json
{
  "userid": 1,
  "token": "1730000000000:ABC"
}
```

### getUser

请求类型:GET

接口:``/getUser/{userid}``

请求体:
1. ``userid``:long（已登录的用户，作为查询参数 ``?userid=`` 或请求头 ``userid`` 传入）
2. ``token``:string（登录用户的token，作为查询参数 ``?token=`` 或请求头 ``token`` 传入）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值（获取自身）:
1. ``id``:long
2. ``username``:string
3. ``hashedPassword``: string
4. ``chatHtmlSource``: string
5. ``chatCssSource``: string
6. ``chatJsSource``: string
7. ``prefLang``: string
8. ``prefTheme``: string
9. ``prefAccent``: string
10. ``prefInputFormat``: string

返回值（获取他人）：
1. ``id``: long
2. ``username``: string
3. ``hashedPassword``: string

返回值示例:
```json
{
  "id": 1,
  "username": "cao-awa",
  "hashedPassword": "HIDDEN"
}
```

### getStyleSources

请求类型:GET

接口:``/getStyleSources/{userid}``

请求体:
1. ``userid``:long（已登录的用户，只能查询自己的自定义前端源）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``chatHtmlSource``:string（自定义聊天页面，空字符串表示使用内置文件）
2. ``chatCssSource``:string（自定义聊天样式表，空字符串表示使用内置文件）
3. ``chatJsSource``:string（自定义聊天脚本，空字符串表示使用内置文件）
4. ``defaultChatHtmlSource``:string（内置默认聊天页面路径）
5. ``defaultChatCssSource``:string（内置默认样式表路径）
6. ``defaultChatJsSource``:string（内置默认脚本路径）
7. ``maxLength``:int（单个自定义源允许的最大长度）
8. ``httpsPrefix``:string（自定义源允许的绝对URL前缀）

返回值示例:
```json
{
  "chatHtmlSource": "",
  "chatCssSource": "",
  "chatJsSource": "",
  "defaultChatHtmlSource": "/chat.html",
  "defaultChatCssSource": "/chat.css",
  "defaultChatJsSource": "/chat.js",
  "maxLength": 128,
  "httpsPrefix": "https://"
}
```

### updateStyleSources

请求类型:POST

接口:``/updateStyleSources/{userid}``

请求体:
1. ``userid``:long（已登录的用户，只能修改自己的自定义前端源）
2. ``token``:string（登录用户的token）
3. ``chatHtmlSource``:string（可选，缺省或空字符串表示清除自定义、使用内置文件）
4. ``chatCssSource``:string（可选，同上）
5. ``chatJsSource``:string（可选，同上）

自定义源必须为空字符串、以 ``https://`` 开头的绝对URL，或本站同源的相对路径；长度不得超过 ``maxLength``，且不能是 ``//`` 开头的协议相对URL，也不能包含 ``..``。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "chatHtmlSource": "https://example.com/chat.html",
  "chatCssSource": "/theme/sakura.css",
  "chatJsSource": ""
}
```

返回值:
1. ``chatHtmlSource``:string
2. ``chatCssSource``:string
3. ``chatJsSource``:string
4. ``defaultChatHtmlSource``:string
5. ``defaultChatCssSource``:string
6. ``defaultChatJsSource``:string
7. ``maxLength``:int
8. ``httpsPrefix``:string

返回值示例:
```json
{
  "chatHtmlSource": "https://example.com/chat.html",
  "chatCssSource": "/theme/sakura.css",
  "chatJsSource": "",
  "defaultChatHtmlSource": "/chat.html",
  "defaultChatCssSource": "/chat.css",
  "defaultChatJsSource": "/chat.js",
  "maxLength": 128,
  "httpsPrefix": "https://"
}
```

### getSettings

请求类型:GET

接口:``/getSettings/{userid}``

请求体:
1. ``userid``:long（已登录的用户，只能查询自己的界面偏好）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``lang``:string（界面语言，空字符串表示无偏好）
2. ``theme``:string（配色方案，空字符串表示跟随系统）
3. ``accent``:string（配色色调，空字符串表示默认色调）
4. ``inputFormat``:string（输入框正文格式，空字符串表示纯文本）
5. ``languages``:array<string>（可选的界面语言）
6. ``themes``:array<string>（可选的配色方案）
7. ``accents``:array<string>（可选的配色色调）
8. ``inputFormats``:array<string>（可选的正文格式）
9. ``defaultLang``:string（未设置语言时的默认值）
10. ``defaultInputFormat``:string（未设置格式时的默认值）
11. ``maxLength``:int（单个偏好值允许的最大长度）

返回值示例:
```json
{
  "lang": "",
  "theme": "",
  "accent": "",
  "inputFormat": "",
  "languages": ["zh-CN", "en"],
  "themes": ["light", "dark"],
  "accents": ["default", "sakura", "grass"],
  "inputFormats": ["text", "markdown"],
  "defaultLang": "en",
  "defaultInputFormat": "text",
  "maxLength": 32
}
```

### updateSettings

请求类型:POST

接口:``/updateSettings/{userid}``

请求体:
1. ``userid``:long（已登录的用户，只能修改自己的界面偏好）
2. ``token``:string（登录用户的token）
3. ``lang``:string（可选，缺省表示保持原值，空字符串表示清除）
4. ``theme``:string（可选，同上）
5. ``accent``:string（可选，同上）
6. ``inputFormat``:string（可选，同上）

非空值必须出现在上表对应的可选列表中；自定义前端源的三个字段不受本接口影响。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "lang": "zh-CN",
  "theme": "dark"
}
```

返回值:
1. ``lang``:string
2. ``theme``:string
3. ``accent``:string
4. ``inputFormat``:string
5. ``languages``:array<string>
6. ``themes``:array<string>
7. ``accents``:array<string>
8. ``inputFormats``:array<string>
9. ``defaultLang``:string
10. ``defaultInputFormat``:string
11. ``maxLength``:int

返回值示例:
```json
{
  "lang": "zh-CN",
  "theme": "dark",
  "accent": "",
  "inputFormat": "",
  "languages": ["zh-CN", "en"],
  "themes": ["light", "dark"],
  "accents": ["default", "sakura", "grass"],
  "inputFormats": ["text", "markdown"],
  "defaultLang": "en",
  "defaultInputFormat": "text",
  "maxLength": 32
}
```

### getJoinedSessions

请求类型:GET

接口:``/getJoinedSessions/{userid}``

请求体:
1. ``userid``:long（已登录的用户，返回该用户已加入的会话）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``isEmpty``:boolean（是否没有任何已加入的会话）
2. ``sessions``:array<long>（已加入的会话ID列表）

返回值示例:
```json
{
  "isEmpty": false,
  "sessions": [1, 2, 3]
}
```

### login

请求类型:POST

接口:``/login/{userid}``

请求体:
1. ``password``:string

请求体示例:
```json
{
  "password": "123456"
}
```

返回值:
1. ``token``:string

返回值示例:
```json
{
  "token": "1730000000000:ABC"
}
```

### logout

请求类型:POST

接口:``/logout/{userid}``

请求体:
1. ``token``:string（要注销的token）

请求体示例:
```json
{
  "token": "ABC"
}
```

返回值:
1. ``userid``:long
2. ``loggedOut``:boolean

返回值示例:
```json
{
  "userid": 1,
  "loggedOut": true
}
```

### createSession

请求类型:POST

接口:``/createSession``

请求体:
1. ``name``:string（会话名称，不能为空白，最长100个字符）
2. ``description``:string（可选，会话描述，最长1000个字符）
3. ``userid``:long（已登录的用户，将作为会话所有者）
4. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "name": "Kotlin",
  "description": "关于Kotlin的讨论",
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``session_id``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``inviteUuid``:string（创建时自动生成的一个邀请UUID，失败时为空字符串）

返回值示例:
```json
{
  "session_id": 10,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "inviteUuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f60"
}
```

### getSessions

请求类型:POST

接口:``/getSessions``

请求体:
1. ``sessions``:array<long>（要查询的会话ID列表，不存在的会话会被跳过）

请求体示例:
```json
{
  "sessions": [1, 2, 3]
}
```

返回值:
1. 会话对象数组，每个元素包含:
2. ``sessionId``:long
3. ``sessionName``:string
4. ``owner``:long
5. ``admins``:array<long>
6. ``members``:array<long>
7. ``description``:string

返回值示例:
```json
[
  {
    "sessionId": 1,
    "sessionName": "Kotlin",
    "owner": 1,
    "admins": [],
    "members": [1, 2],
    "description": "关于Kotlin的讨论"
  }
]
```

### getSession

请求类型:GET

接口:``/getSession/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``admins``:array<long>
6. ``members``:array<long>
7. ``isOwner``:boolean（调用者是否为所有者）
8. ``isAdmin``:boolean（调用者是否为管理员或所有者）

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "admins": [2],
  "members": [1, 2, 3],
  "isOwner": true,
  "isAdmin": true
}
```

### sendMessage

请求类型:POST

接口:``/sendMessage/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员）
2. ``token``:string（登录用户的token）
3. ``pieces``:array<object>（消息内容片段）

``pieces`` 的每个元素:
1. ``type``:string（``text`` 或 ``markdown``）
2. ``text``:string（片段正文）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "pieces": [
    {
      "type": "text",
      "text": "Hello"
    }
  ]
}
```

返回值:
1. ``seq``:long（消息序号，``-1`` 表示调用者不是该会话成员、未发送）

返回值示例:
```json
{
  "seq": 12
}
```

### editMessage

请求类型:POST

接口:``/editMessage/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员且是该消息的作者）
2. ``token``:string（登录用户的token）
3. ``messageId``:long（要修改的消息序号，``seq`` 可作为别名）
4. ``pieces``:array<object>（新的消息内容片段）

``pieces`` 的每个元素:
1. ``type``:string（``text`` 或 ``markdown``）
2. ``text``:string（片段正文）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "messageId": 12,
  "pieces": [
    {
      "type": "markdown",
      "text": "**Hello**"
    }
  ]
}
```

返回值:
1. ``success``:boolean（``false`` 表示调用者不是该会话成员）
2. ``message``:object（修改后的消息，操作失败时为空对象）

``message`` 的字段:
1. ``id``:long
2. ``sender``:long
3. ``timestamp``:long（首次发送时间，不随编辑改变）
4. ``editedAt``:long（最后编辑时间，``0`` 表示从未编辑）
5. ``pieces``:array<object>

返回值示例:
```json
{
  "success": true,
  "message": {
    "id": 12,
    "sender": 1,
    "timestamp": 1730000000000,
    "editedAt": 1730000005000,
    "pieces": [
      {
        "type": "markdown",
        "text": "**Hello**"
      }
    ]
  }
}
```

### deleteMessage

请求类型:POST

接口:``/deleteMessage/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员且是该消息的作者或会话管理员）
2. ``token``:string（登录用户的token）
3. ``messageId``:long（要删除的消息序号，``seq`` 可作为别名）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "messageId": 12
}
```

返回值:
1. ``success``:boolean（``false`` 表示未删除，如调用者不是该会话成员）
2. ``messageId``:long

返回值示例:
```json
{
  "success": true,
  "messageId": 12
}
```

### receivedMessageSeq

请求类型:POST

接口:``/receivedMessageSeq/{userid}/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``seq``:long（该用户在此会话中已读到的消息序号，``0`` 表示尚无已读消息）

返回值示例:
```json
{
  "seq": 11
}
```

### getMessage

请求类型:POST

接口:``/getMessage/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员）
2. ``token``:string（登录用户的token）
3. ``seq``:long（要获取的消息序号）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "seq": 12
}
```

返回值:
1. 消息对象数组，包含0或1个元素（消息不存在时为空数组）:
2. ``id``:long
3. ``sender``:long
4. ``timestamp``:long
5. ``editedAt``:long（``0`` 表示从未编辑）
6. ``pieces``:array<object>

请求成功时，若 ``seq`` 大于该用户的已读位点且小于最新序号，会一并推进已读位点。调用者不是该会话成员时返回空数组。

返回值示例:
```json
[
  {
    "id": 12,
    "sender": 1,
    "timestamp": 1730000000000,
    "editedAt": 0,
    "pieces": [
      {
        "type": "text",
        "text": "Hello"
      }
    ]
  }
]
```

### getMessages

请求类型:POST

接口:``/getMessages/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员）
2. ``token``:string（登录用户的token）
3. ``start``:long（起始序号，含）
4. ``end``:long（结束序号，含）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "start": 1,
  "end": 50
}
```

返回值:
1. 消息对象数组（范围内不存在的序号会被跳过）:
2. ``id``:long
3. ``sender``:long
4. ``timestamp``:long
5. ``editedAt``:long
6. ``pieces``:array<object>

请求成功时，若 ``end`` 大于该用户的已读位点且小于最新序号，会一并推进已读位点。调用者不是该会话成员时返回空数组。

返回值示例:
```json
[
  {
    "id": 11,
    "sender": 2,
    "timestamp": 1729999990000,
    "editedAt": 0,
    "pieces": [
      {
        "type": "text",
        "text": "Hi"
      }
    ]
  },
  {
    "id": 12,
    "sender": 1,
    "timestamp": 1730000000000,
    "editedAt": 0,
    "pieces": [
      {
        "type": "text",
        "text": "Hello"
      }
    ]
  }
]
```

### lastMessage

请求类型:GET

接口:``/lastMessage/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``hasMessage``:boolean（会话中是否还有消息）
2. ``id``:long（最新消息序号）
3. ``sender``:long（发送者ID）
4. ``senderName``:string（发送者用户名）
5. ``timestamp``:long
6. ``content``:string（最新的、未被删除的那条消息的纯文本预览）

返回值示例:
```json
{
  "hasMessage": true,
  "id": 12,
  "sender": 1,
  "senderName": "cao-awa",
  "timestamp": 1730000000000,
  "content": "Hello"
}
```

无消息时:
```json
{
  "hasMessage": false
}
```

### getSessionUsers

请求类型:GET

接口:``/getSessionUsers/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``isOwner``:boolean
6. ``isAdmin``:boolean
7. ``users``:array<object>（成员列表）

``users`` 的每个元素:
1. ``userid``:long
2. ``username``:string

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "isOwner": true,
  "isAdmin": true,
  "users": [
    {
      "userid": 1,
      "username": "cao-awa"
    },
    {
      "userid": 2,
      "username": "someone"
    }
  ]
}
```

### joinSessionByUuid

请求类型:POST

接口:``/joinSessionByUuid``

请求体:
1. ``uuid``:string（邀请UUID）
2. ``userid``:long（已登录的用户）
3. ``token``:string（登录用户的token）

邀请UUID无效或已失效时返回400。

请求体示例:
```json
{
  "uuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f60",
  "userid": 2,
  "token": "ABC"
}
```

返回值:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``admins``:array<long>
6. ``members``:array<long>
7. ``isOwner``:boolean
8. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "admins": [],
  "members": [1, 2],
  "isOwner": false,
  "isAdmin": false
}
```

### getSessionInfo

请求类型:POST

接口:``/getSessionInfo/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``admins``:array<long>
6. ``members``:array<long>
7. ``isOwner``:boolean
8. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "admins": [2],
  "members": [1, 2, 3],
  "isOwner": true,
  "isAdmin": true
}
```

### updateSession

请求类型:POST

接口:``/updateSession/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话所有者或管理员）
2. ``token``:string（登录用户的token）
3. ``name``:string（可选，新会话名称，不能为空白）
4. ``description``:string（可选，新会话描述）

``name`` 与 ``description`` 至少要提供一个，否则返回400。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "name": "Kotlin 交流",
  "description": "关于Kotlin的讨论"
}
```

返回值:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``admins``:array<long>
6. ``members``:array<long>
7. ``isOwner``:boolean
8. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin 交流",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "admins": [2],
  "members": [1, 2, 3],
  "isOwner": true,
  "isAdmin": true
}
```

### removeSessionMember

请求类型:POST

接口:``/removeSessionMember/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话所有者或管理员）
2. ``token``:string（登录用户的token）
3. ``targetUserid``:long（要移除的成员ID，``targetUserId`` 可作为别名）

会话所有者不能被移除；管理员不能移除其他管理员（只有所有者可以）。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "targetUserid": 3
}
```

返回值:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``admins``:array<long>
6. ``members``:array<long>
7. ``isOwner``:boolean
8. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "admins": [2],
  "members": [1, 2],
  "isOwner": true,
  "isAdmin": true
}
```

### setSessionAdmin

请求类型:POST

接口:``/setSessionAdmin/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话所有者）
2. ``token``:string（登录用户的token）
3. ``targetUserid``:long（目标成员ID，``targetUserId`` 可作为别名）
4. ``admin``:boolean（``true`` 授予管理员，``false`` 撤销管理员）

目标必须是该会话成员；所有者本身不能被授予或撤销管理员。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "targetUserid": 2,
  "admin": true
}
```

返回值:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``admins``:array<long>
6. ``members``:array<long>
7. ``isOwner``:boolean
8. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "admins": [2],
  "members": [1, 2, 3],
  "isOwner": true,
  "isAdmin": true
}
```

### leaveSession

请求类型:POST

接口:``/leaveSession/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话成员）
2. ``token``:string（登录用户的token）

所有者离开时，所有权会移交给剩余成员中的第一个可用成员。

请求体示例:
```json
{
  "userid": 2,
  "token": "ABC"
}
```

返回值:
1. ``left``:boolean
2. ``sessionId``:long

返回值示例:
```json
{
  "left": true,
  "sessionId": 1
}
```

### getSessionInvites

请求类型:POST

接口:``/getSessionInvites/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话所有者或管理员）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``uuids``:array<string>（当前有效的邀请UUID列表）
2. ``max``:int（单个会话可持有的邀请UUID上限）

返回值示例:
```json
{
  "uuids": [
    "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f60"
  ],
  "max": 10
}
```

### createSessionInvite

请求类型:POST

接口:``/createSessionInvite/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话所有者或管理员）
2. ``token``:string（登录用户的token）

邀请UUID数量达到上限时返回400。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``uuid``:string（新生成的邀请UUID）

返回值示例:
```json
{
  "uuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f61"
}
```

### revokeSessionInvite

请求类型:POST

接口:``/revokeSessionInvite/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话所有者或管理员）
2. ``token``:string（登录用户的token）
3. ``uuid``:string（要撤销的邀请UUID）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "uuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f61"
}
```

返回值:
1. ``revoked``:boolean（该UUID是否确实被撤销）
2. ``uuid``:string

返回值示例:
```json
{
  "revoked": true,
  "uuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f61"
}
```

## WebSocket

接口:``ws://{host}:{port}/oxype``

默认监听 ``0.0.0.0:12346``，可在 ``configs/oxype_websocket.json`` 中通过 ``server_host`` 与 ``server_port`` 配置。

连接建立后必须先发送 ``auth`` 完成鉴权；鉴权成功后服务端会自动订阅该用户已加入的全部会话。未鉴权时发送其他消息会收到 ``error`` 并被断开连接。

### auth

方向:客户端 → 服务端

消息体:
1. ``type``:string（固定为 ``auth``）
2. ``userid``:long（``userId`` 可作为别名）
3. ``token``:string（登录用户的token）

消息体示例:
```json
{
  "type": "auth",
  "userid": 1,
  "token": "ABC"
}
```

返回值（成功）:
1. ``type``:string（``ready``）

返回值示例:
```json
{
  "type": "ready"
}
```

返回值（失败，随后断开连接）:
1. ``type``:string（``error``）
2. ``code``:string（``unauthorized``）

返回值示例:
```json
{
  "type": "error",
  "code": "unauthorized"
}
```

### ping

方向:客户端 → 服务端

消息体:
1. ``type``:string（固定为 ``ping``）

消息体示例:
```json
{
  "type": "ping"
}
```

返回值:
1. ``type``:string（``pong``）

返回值示例:
```json
{
  "type": "pong"
}
```

### subscribe

方向:客户端 → 服务端

订阅指定会话的推送。用户必须是该会话的成员。

消息体:
1. ``type``:string（固定为 ``subscribe``）
2. ``sessionId``:long（``session_id`` 可作为别名）

消息体示例:
```json
{
  "type": "subscribe",
  "sessionId": 1
}
```

返回值（成功）:
1. ``type``:string（``subscribed``）
2. ``sessionId``:long
3. ``active``:boolean（订阅状态，``true`` 表示已订阅）

返回值示例:
```json
{
  "type": "subscribed",
  "sessionId": 1,
  "active": true
}
```

返回值（失败，非成员或参数缺失）:
1. ``type``:string（``error``）
2. ``code``:string（``forbidden``）

返回值示例:
```json
{
  "type": "error",
  "code": "forbidden"
}
```

### unsubscribe

方向:客户端 → 服务端

取消订阅指定会话的推送。

消息体:
1. ``type``:string（固定为 ``unsubscribe``）
2. ``sessionId``:long（``session_id`` 可作为别名）

消息体示例:
```json
{
  "type": "unsubscribe",
  "sessionId": 1
}
```

返回值（成功）:
1. ``type``:string（``subscribed``）
2. ``sessionId``:long
3. ``active``:boolean（订阅状态，``false`` 表示已取消订阅）

返回值示例:
```json
{
  "type": "subscribed",
  "sessionId": 1,
  "active": false
}
```

返回值（失败）:
1. ``type``:string（``error``）
2. ``code``:string（``forbidden``）

返回值示例:
```json
{
  "type": "error",
  "code": "forbidden"
}
```

### message

方向:服务端 → 客户端

有新消息写入会话后推送。发送者自己的其他连接也会收到，客户端应按消息ID去重。

消息体:
1. ``type``:string（``message``）
2. ``sessionId``:long
3. ``data``:object（新消息）

``data`` 的字段:
1. ``id``:long
2. ``sender``:long
3. ``timestamp``:long
4. ``editedAt``:long
5. ``pieces``:array<object>

消息体示例:
```json
{
  "type": "message",
  "sessionId": 1,
  "data": {
    "id": 12,
    "sender": 1,
    "timestamp": 1730000000000,
    "editedAt": 0,
    "pieces": [
      {
        "type": "text",
        "text": "Hello"
      }
    ]
  }
}
```

### messageEdited

方向:服务端 → 客户端

消息内容被修改后推送，包含编辑者自己的连接。

消息体:
1. ``type``:string（``messageEdited``）
2. ``sessionId``:long
3. ``data``:object（修改后的消息，字段同 ``message`` 中的 ``data``）

消息体示例:
```json
{
  "type": "messageEdited",
  "sessionId": 1,
  "data": {
    "id": 12,
    "sender": 1,
    "timestamp": 1730000000000,
    "editedAt": 1730000005000,
    "pieces": [
      {
        "type": "markdown",
        "text": "**Hello**"
      }
    ]
  }
}
```

### messageDeleted

方向:服务端 → 客户端

消息被删除后推送，只携带被删除消息的身份，不携带其内容。

消息体:
1. ``type``:string（``messageDeleted``）
2. ``sessionId``:long
3. ``messageId``:long

消息体示例:
```json
{
  "type": "messageDeleted",
  "sessionId": 1,
  "messageId": 12
}
```
