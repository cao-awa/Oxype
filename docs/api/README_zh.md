# API
本文档为API文档，记录Oxype的HTTP和WebSocket API。

[简体中文](README_zh.md) | [English](README.md)

## HTTP

所有接口的请求体与返回值均为JSON，且返回值由Kalmia包裹在 ``{"data": ...}`` 信封中（下文各接口的“返回值示例”给出的是 ``data`` 节点内的内容）。

约定:
1. 鉴权字段为 ``userid`` 与 ``token``，``userId`` 可作为 ``userid`` 的别名。
2. POST接口从JSON请求体读取鉴权字段；GET接口从查询字符串读取，读取不到时回退到请求头 ``userid``/``X-User-Id`` 与 ``token``/``X-Token``。
3. 通用错误:请求体不是合法JSON、缺少必填字段、或取值指向调用者无权执行的操作时返回400；token无效返回401；无权访问返回403；目标不存在返回404；对好友会话执行仅限群聊的操作返回409。

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
4. ``avatarFile``: string（已保存的文件名，账号没有头像时为 ``null``；这是磁盘上的名字，浏览器可用的 URL 请用 ``getAvatar`` 获取）
5. ``avatarUrl``: string（头像的相对URL，没有头像时为空字符串）
6. ``chatHtmlSource``: string
7. ``chatCssSource``: string
8. ``chatJsSource``: string
9. ``prefLang``: string
10. ``prefTheme``: string
11. ``prefAccent``: string
12. ``prefInputFormat``: string

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

**源的加载方式。** 浏览器会按来源的两种形式采用不同的加载方式：

1. **本站同源路径** 用普通的 ``<link rel="stylesheet">`` 或 ``<script src>`` 元素加载。这些文件由本应用提供，``Content-Type`` 正确，所以元素方式可以正常工作，也优先使用这种方式。
2. **其他域的 ``https://`` URL** 会先以文本方式取回，再内联应用——样式表作为 ``<style>`` 元素应用，脚本则作为内联 ``<script>`` 执行。这是刻意为之：元素方式要求*对方*服务器返回可用的 ``Content-Type``，而很多文件托管服务并不这样做。例如 GitHub 的 ``raw.githubusercontent.com`` 会把所有文件都作为 ``text/plain`` 返回并附带 ``X-Content-Type-Options: nosniff``，于是即便字节内容正确，浏览器也会拒绝将其作为样式表应用或作为脚本执行。先取文本再内联应用可以绕开这项检查，因此 raw GitHub 链接可以作为样式来源使用。

由于跨域脚本是内联执行的，它与内置脚本一样运行在本页面自身的全局作用域中。因此跨域样式表不能用相对的 ``url(...)`` 引用——它们会相对于本域解析，而不是该文件所在的服务器。第三方样式表内请使用绝对URL。

三个源中只要有任意一个加载失败，三个源会全部回退到内置默认值，失败的覆盖会从文档中移除（包括内联的 ``<style>``），并向用户提示失败的具体URL。

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

### uploadAvatar

请求类型:POST

接口:``/uploadAvatar/{userid}``

请求体:
1. ``userid``:long（已登录的用户，只能上传自己的头像）
2. ``token``:string（登录用户的token）
3. ``image``:string（base64 编码的图片；``data:image/png;base64,`` 前缀可省略，存在时会被去掉）

图片必须是 PNG、JPEG、WebP 或 GIF，解码后不超过 3 MB，每边不超过 4096 像素。格式是根据文件开头的字节判断的，而不是根据声明的 MIME 类型，因此一个实际上是 HTML 文档的内容会被拒绝，而不会被存下来、之后又从本站点发送给浏览器。

给其他账号上传返回 403，``userid`` 不存在返回 404，图片为空、超出大小、不是合法的 base64、不是这四种格式之一或超过 4096 像素则返回 400，原因写在消息里。

每次上传都会被保存成一个带有内容哈希的文件名，所以只要图片变了 ``avatarUrl`` 就会变。因此客户端可以永久缓存这张图，而不必向服务器确认它是否仍然有效。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
}
```

返回值:
1. ``kind``:string（``user`` 或 ``session``）
2. ``id``:long（该头像所属的账号或会话）
3. ``name``:string（与该头像对应的显示名称）
4. ``avatarUrl``:string（已保存图片的相对URL，没有头像时为空字符串）
5. ``hasAvatar``:boolean
6. ``maxBytes``:int（允许的最大图片字节数）
7. ``maxEdge``:int（允许的最大宽或高，单位像素）
8. ``formats``:array<string>（允许的 MIME 类型）

返回值示例:
```json
{
  "kind": "user",
  "id": 1,
  "name": "cao-awa",
  "avatarUrl": "/avatar/u1-3f9a1c04.png",
  "hasAvatar": true,
  "maxBytes": 3145728,
  "maxEdge": 4096,
  "formats": ["image/png", "image/jpeg", "image/webp", "image/gif"]
}
```

### removeAvatar

请求类型:POST

接口:``/removeAvatar/{userid}``

请求体:
1. ``userid``:long（已登录的用户，只能移除自己的头像）
2. ``token``:string（登录用户的token）

已保存的文件会被删除，该账号重新显示为首字母。移除一个本来就不存在的头像也会成功并返回 ``hasAvatar`` 为 ``false``，因此这个接口可以安全地重复调用。

给其他账号移除返回 403，``userid`` 不存在返回 404。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``kind``:string（``user`` 或 ``session``）
2. ``id``:long
3. ``name``:string
4. ``avatarUrl``:string（移除成功后总是空字符串）
5. ``hasAvatar``:boolean（移除成功后总是 ``false``）
6. ``maxBytes``:int
7. ``maxEdge``:int
8. ``formats``:array<string>

返回值示例:
```json
{
  "kind": "user",
  "id": 1,
  "name": "cao-awa",
  "avatarUrl": "",
  "hasAvatar": false,
  "maxBytes": 3145728,
  "maxEdge": 4096,
  "formats": ["image/png", "image/jpeg", "image/webp", "image/gif"]
}
```

### getAvatar

请求类型:GET

接口:``/getAvatar/{userid}``

请求体:
1. ``userid``:long（要获取头像的账号，请求者自己总是被允许）
2. ``token``:string（登录用户的token）

既然能看见某个账号的名字就能看见它的头像，那么只要请求者就是这个账号本身，或者两个账号至少同在一个会话里，就允许读取。与目标没有任何共同会话返回 403，``userid`` 不存在返回 404。

``avatarUrl`` 总是存在，账号没有头像时为空字符串，因此调用方不必区分「没有这个字段」和「没有头像」。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``kind``:string（``user`` 或 ``session``）
2. ``id``:long
3. ``name``:string
4. ``avatarUrl``:string（已保存图片的相对URL，没有头像时为空字符串）
5. ``hasAvatar``:boolean
6. ``maxBytes``:int
7. ``maxEdge``:int
8. ``formats``:array<string>

返回值示例:
```json
{
  "kind": "user",
  "id": 1,
  "name": "cao-awa",
  "avatarUrl": "/avatar/u1-3f9a1c04.png",
  "hasAvatar": true,
  "maxBytes": 3145728,
  "maxEdge": 4096,
  "formats": ["image/png", "image/jpeg", "image/webp", "image/gif"]
}
```

### uploadSessionAvatar

请求类型:POST

接口:``/uploadSessionAvatar/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话的群主或管理员）
2. ``token``:string（登录用户的token）
3. ``image``:string（base64 编码的图片；``data:`` 前缀可省略）

图片规则与 ``uploadAvatar`` 相同:PNG、JPEG、WebP 或 GIF，不超过 3 MB，每边不超过 4096 像素，格式由文件开头的字节判断。

权限与会话名称、描述相同，因此普通成员无法改动自己只是加入的群。既不是群主也不是管理员返回 403，会话不存在返回 404，图片被拒绝返回 400。

会话图片使用自己的前缀保存，因此同一个 ID 的会话头像和账号头像永远不会互相覆盖。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC",
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
}
```

返回值:
1. ``kind``:string（该接口固定为 ``session``）
2. ``id``:long（会话ID）
3. ``name``:string（会话名称）
4. ``avatarUrl``:string（已保存图片的相对URL，没有头像时为空字符串）
5. ``hasAvatar``:boolean
6. ``maxBytes``:int
7. ``maxEdge``:int
8. ``formats``:array<string>

返回值示例:
```json
{
  "kind": "session",
  "id": 1,
  "name": "Kotlin",
  "avatarUrl": "/avatar/s1-8d2c55b7.jpg",
  "hasAvatar": true,
  "maxBytes": 3145728,
  "maxEdge": 4096,
  "formats": ["image/png", "image/jpeg", "image/webp", "image/gif"]
}
```

### removeSessionAvatar

请求类型:POST

接口:``/removeSessionAvatar/{sessionId}``

请求体:
1. ``userid``:long（已登录的用户，必须是该会话的群主或管理员）
2. ``token``:string（登录用户的token）

已保存的文件会被删除，该会话重新显示为首字母。移除一个本来就不存在的图片也会成功，因此这个接口可以安全地重复调用。

既不是群主也不是管理员返回 403，会话不存在返回 404。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``kind``:string（该接口固定为 ``session``）
2. ``id``:long
3. ``name``:string
4. ``avatarUrl``:string（移除成功后总是空字符串）
5. ``hasAvatar``:boolean（移除成功后总是 ``false``）
6. ``maxBytes``:int
7. ``maxEdge``:int
8. ``formats``:array<string>

返回值示例:
```json
{
  "kind": "session",
  "id": 1,
  "name": "Kotlin",
  "avatarUrl": "",
  "hasAvatar": false,
  "maxBytes": 3145728,
  "maxEdge": 4096,
  "formats": ["image/png", "image/jpeg", "image/webp", "image/gif"]
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
3. ``revision``:long（该用户会话列表的变更计数，每次变化都会递增）

``revision`` 的存在是为了让客户端能发现它漏收了一次 ``sessionsChanged`` WebSocket 推送。任何成员变更都会递增该计数，同一个值也会出现在 WebSocket 的 ``ready`` 与 ``pong`` 帧中，因此客户端只要把列表读取时记下的值与之比较，就能只在两者不一致时重新加载。没送达的推送没有别的办法发现：连接仍然开着，只是什么都不说。

客户端应当比较计数，而不能认为“相等即无变化”：该计数在服务端重启后从 0 重新开始，这只会让客户端多加载一次，绝不会让它停在过期状态。该值是在列表组装*之前*读取的，所以两次读取之间发生的变更会以*较旧*的计数被报出——客户端因此仍然落后，并在下一次比较时重新加载。若改为之后读取，就会把*较新*的计数和较旧的列表配在一起，使客户端永久停留在过期状态。

返回值示例:
```json
{
  "isEmpty": false,
  "sessions": [1, 2, 3],
  "revision": 12
}
```

### getHash

请求类型:GET

接口:``/getHash?path={path}``

请求体:
1. ``path``:string（相对于 ``client`` 目录的路径，例如 ``avatar/u1-3f9a1c04.png``；因为它带有斜杠，所以用查询参数传递）
2. ``userid``:long（登录用户）
3. ``token``:string（登录用户的token）

路径永远只会在 ``client`` 目录内解析，也不会被改写成目录内的路径，因此任何没有直接指向该目录中某个文件的请求都会被拒绝，而不是被重新解释。以下情况全部返回 400:

1. 缺少 ``path``
2. 以 ``/`` 或 ``\`` 开头、形如 ``C:`` 的盘符，或 UNC 前缀（绝对路径一律拒绝，绝不会拼接进目录）
3. 路径中任何位置出现反斜杠（它在 Windows 上是分隔符，在其他地方是普通字符，同一个请求会因此有两种含义）
4. 包含 ``://``（URL 不是路径）
5. 包含控制字符
6. 有空段，或 ``.``、``..`` 段
7. 符号链接最终指向 ``client`` 之外
8. 路径超过 256 个字符
9. 文件不存在

返回值是该文件内容的 SHA-256。摘要只在需要时计算一次，并连同文件大小和修改时间一起记住，因此再次询问一个没有变化的文件只需要一次 stat，而不必完整读取。

这个接口不会带来任何直接静态 GET 同一个文件所没有的访问能力——该目录本来就已经作为静态资源发布。它存在的意义是让保存了文件副本的客户端可以用一个小请求问「这个文件还是最新的吗」，而不必重新下载文件，头像代码在决定是否重新获取图片之前正是这么做的。

请求体示例:
```json
{
  "path": "avatar/u1-3f9a1c04.png",
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``path``:string（解析后的相对于 client 目录的路径，原样返回）
2. ``hash``:string（文件内容的小写十六进制 SHA-256）
3. ``size``:long（文件大小，单位字节）
4. ``modifiedAt``:long（文件最后修改时间，Unix 毫秒）

返回值示例:
```json
{
  "path": "avatar/u1-3f9a1c04.png",
  "hash": "9f2b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8",
  "size": 2048,
  "modifiedAt": 1793781199862
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
2. ``userid``:long（可选，用于让返回值相对调用者）
3. ``token``:string（登录用户的token，与 ``userid`` 一起提供）

该接口按是否带凭据返回两种形状之一。多数调用者不带凭据——会话列表在用户登录之前就要绘制——因此凭据是尽力解析的，而不是强制要求。

1. **不带凭据**时，直接返回存储记录的编码内容，并附加 ``avatarUrl``。这是该接口一直以来的形状。
2. **带凭据**时，每条记录按调用者的视角返回，与 `getSession` 完全一致。该视角会用对方的名字和头像来命名好友会话，并带上 ``isFriend``，让客户端能区分“好友单聊”和“恰好只有两个成员的群聊”。

请求体示例:
```json
{
  "sessions": [1, 2, 3]
}
```

请求体示例（带凭据）:
```json
{
  "sessions": [1, 2, 3],
  "userid": 1,
  "token": "ABC"
}
```

两种形状共有的字段:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``admins``:array<long>
6. ``members``:array<long>
7. ``avatarFile``:string（已保存的文件名，会话没有头像时为 ``null``；仅不带凭据的形状包含）
8. ``avatarUrl``:string（会话头像的相对URL，没有头像时为空字符串）

仅带凭据的形状另有:
9. ``isOwner``:boolean
10. ``isAdmin``:boolean
11. ``isFriend``:boolean（是否为好友单聊会话）
12. ``peerUserId``:long（对方用户，仅好友会话包含）
13. ``peerUsername``:string（与 ``peerUserId`` 一同出现）

``peerUserId`` 与 ``peerUsername`` 是直接省略而非置为 ``null``，因此客户端应判断键是否存在。

返回值示例（带凭据）:
```json
[
  {
    "sessionId": 1,
    "sessionName": "Kotlin",
    "description": "关于Kotlin的讨论",
    "owner": 1,
    "avatarUrl": "",
    "admins": [2],
    "members": [1, 2, 3],
    "isOwner": true,
    "isAdmin": true,
    "isFriend": false
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
2. ``sessionName``:string（好友会话中为对方的用户名）
3. ``description``:string
4. ``owner``:long
5. ``avatarUrl``:string（会话头像的相对URL；好友会话中为对方头像的URL，没有头像时为空字符串）
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean
10. ``isFriend``:boolean（是否为好友单聊会话）
11. ``peerUserId``:long（对方用户，仅好友会话包含）
12. ``peerUsername``:string（与 ``peerUserId`` 一同出现）

好友会话是一个仅在好友关系存续期间存在的普通会话。它的成员就是好友关系本身，因此没有所有者也没有管理员，仅限群聊的接口（`updateSession`、`removeSessionMember` 以及邀请相关接口）会以 409 拒绝它。它的名字与头像按*查看者*一侧解析，因此同一条存储记录对双方都能正确显示。``peerUserId`` 与 ``peerUsername`` 是直接省略而非置为 ``null``。

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "avatarUrl": "",
  "admins": [2],
  "members": [1, 2, 3],
  "isOwner": true,
  "isAdmin": true,
  "isFriend": false
}
```

返回值示例（好友会话）:
```json
{
  "sessionId": 7,
  "sessionName": "someone",
  "description": "",
  "owner": 0,
  "avatarUrl": "/avatar/u2-8c1d0f3a.png",
  "admins": [],
  "members": [1, 2],
  "isOwner": false,
  "isAdmin": false,
  "isFriend": true,
  "peerUserId": 2,
  "peerUsername": "someone"
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
1. ``type``:string（``text``、``markdown`` 或 ``reply``）
2. ``text``:string（片段正文；``reply`` 片段由服务端填充，请求中会被忽略）
3. ``messageId``:long（仅 ``reply``：被引用消息的序号）

``reply`` 片段使这条消息成为一条回复。它必须是 ``pieces`` 的**第一个**元素；出现在
其他位置的 ``reply`` 片段会被拒绝并返回 ``400``。被引用的消息必须存在于同一会话中，
否则请求返回 ``404``。

调用方只需提供 ``messageId``。被引用消息的发送者、发送者名字与正文由服务端复制进
存储的片段中，因此即使原消息之后被编辑或删除，引用仍然保留它当时的措辞；存储的
``messageId`` 供客户端跳回原处。也就是说，引用是一份快照，而不是实时引用。

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

请求体示例（回复）:
```json
{
  "userid": 1,
  "token": "ABC",
  "pieces": [
    {
      "type": "reply",
      "messageId": 7
    },
    {
      "type": "markdown",
      "text": "有道理，**同意**。"
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

``reply`` 片段不在首位时返回 ``400``，被引用的消息在本会话中不存在时返回 ``404``:
```json
{
  "error": "Message 7 to reply to was not found"
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
1. ``type``:string（``text``、``markdown`` 或 ``reply``）
2. ``text``:string（片段正文；``reply`` 片段由服务端填充，请求中会被忽略）
3. ``messageId``:long（仅 ``reply``：被引用消息的序号）

``pieces`` 会整体替换已存储的片段，因此编辑一条回复时必须重新发送它的 ``reply``
片段，否则引用会被丢弃。规则与 [sendMessage](#sendmessage) 相同：``reply`` 必须在
首位，且被引用的消息必须存在于本会话。

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

请求体示例（编辑一条回复，保留其引用）:
```json
{
  "userid": 1,
  "token": "ABC",
  "messageId": 12,
  "pieces": [
    {
      "type": "reply",
      "messageId": 7
    },
    {
      "type": "text",
      "text": "Hello again"
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
2. ``username``:string（账号没有名称时回退为 ``User #<userid>``）
3. ``avatarUrl``:string（该账号头像的相对URL，没有头像时为空字符串）

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
      "username": "cao-awa",
      "avatarUrl": "/avatar/u1-3f9a1c04.png"
    },
    {
      "userid": 2,
      "username": "someone",
      "avatarUrl": ""
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
5. ``avatarUrl``:string（会话头像的相对URL，没有头像时为空字符串）
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "avatarUrl": "",
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
5. ``avatarUrl``:string（会话头像的相对URL，没有头像时为空字符串）
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "avatarUrl": "",
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
5. ``avatarUrl``:string（会话头像的相对URL，没有头像时为空字符串）
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin 交流",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "avatarUrl": "",
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
5. ``avatarUrl``:string（会话头像的相对URL，没有头像时为空字符串）
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "avatarUrl": "",
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
5. ``avatarUrl``:string（会话头像的相对URL，没有头像时为空字符串）
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

返回值示例:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "关于Kotlin的讨论",
  "owner": 1,
  "avatarUrl": "",
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

**离开好友会话就是删除好友。** 好友会话只是好友关系自己的通道，因此“离开会话但仍然是好友”会留下一段无处可谈的好友关系。所以在好友会话上，该接口会双向解除好友关系、删除该会话及其消息历史，并返回 ``removedFriend``。对方会收到 WebSocket 推送，使其闲置的客户端重新加载列表。

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
3. ``removedFriend``:long（被解除好友关系的对方，仅在离开好友会话时出现）

返回值示例:
```json
{
  "left": true,
  "sessionId": 1
}
```

返回值示例（离开好友会话）:
```json
{
  "left": true,
  "sessionId": 7,
  "removedFriend": 2
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

### findUser

请求类型:GET

接口:``/findUser/{userid}``

请求体:
1. ``userid``:long（要查找的用户ID，精确匹配）
2. ``userid``:long（已登录的用户）
3. ``token``:string（登录用户的token）

好友搜索框只接受数字，因此除ID本身之外没有别的可搜索依据。该接口刻意做成精确ID查找，而不是对所有账户做子串搜索——后者会让人只需输入 ``1`` 就枚举出全部账户。

返回值里带名字和头像，因为这个结果在任何好友关系建立之前就要画成一张卡片；这也是该接口不走 `getUser` 的原因：`getUser` 只对已经与之共享会话的人展示他人资料。

调用者自己的ID和不存在的ID都返回 ``{"found": false}`` 而不是报错，这样客户端可以渲染“查无此人”，而无需区分 404 与“这就是你自己”。

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``found``:boolean（调用者自己的ID与不存在的ID为 false，此时不含其他字段）
2. ``userid``:long
3. ``username``:string
4. ``avatarUrl``:string（该用户头像的相对URL，没有头像时为空字符串）
5. ``isFriend``:boolean（两人是否已是好友）
6. ``requestPending``:boolean（调用者是否与该账户有一个待处理的好友请求）
7. ``requestIncoming``:boolean（该账户是否与调用者有一个待处理的好友请求）

返回值示例:
```json
{
  "found": true,
  "userid": 2,
  "username": "someone",
  "avatarUrl": "",
  "isFriend": false,
  "requestPending": false,
  "requestIncoming": true
}
```

返回值示例（查无此人）:
```json
{
  "found": false
}
```

### getFriends

请求类型:GET

接口:``/getFriends/{userid}``

请求体:
1. ``userid``:long（已登录的用户，列出其好友）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``friends``:array<object>

``friends`` 的每个元素:
1. ``userid``:long
2. ``username``:string（账户没有用户名时回退为 ``User #<userid>``）
3. ``avatarUrl``:string（该用户头像的相对URL，没有头像时为空字符串）

返回值示例:
```json
{
  "friends": [
    {
      "userid": 2,
      "username": "someone",
      "avatarUrl": "/avatar/u2-8c1d0f3a.png"
    }
  ]
}
```

### getFriendRequests

请求类型:GET

接口:``/getFriendRequests/{userid}``

请求体:
1. ``userid``:long（已登录的用户）
2. ``token``:string（登录用户的token）

请求体示例:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

两个方向由同一次调用返回，因为它们画在同一个面板里；拆成两次调用会让两半在某个请求正被接受时对“什么是待处理的”产生分歧。

返回值:
1. ``incoming``:array<object>（其他账户发给调用者、等待调用者处理的请求）
2. ``outgoing``:array<object>（调用者发出、尚无人应答的请求）

两个数组的元素都是与 `getFriends` 相同的用户卡片，含三个字段：``userid``:long、``username``:string、``avatarUrl``:string。

返回值示例:
```json
{
  "incoming": [
    {
      "userid": 3,
      "username": "another",
      "avatarUrl": ""
    }
  ],
  "outgoing": []
}
```

### sendFriendRequest

请求类型:POST

接口:``/sendFriendRequest/{userid}``

请求体:
1. ``targetUserid``:long（``targetUserId`` 可作为别名）
2. ``userid``:long（已登录的用户）
3. ``token``:string（登录用户的token）

在关键的这一个方向上是幂等的：如果对方此前已经向你发过请求，这次调用会*直接完成*好友关系，而不是留下两个互指的请求。这既是用户的本意，也让接受按钮不需要在两边各点一次——所以返回值区分 ``pending`` 与 ``accepted``。

成为好友会立即创建单聊会话，因此当请求当场被接受时，返回值里会带上它的 ``sessionId``。无论哪种情形，对方都会收到 WebSocket 推送，因为对方在那一刻没有做任何动作。

调用者自己的ID返回400；不存在的ID返回404；已经是好友返回400；待处理的收到请求过多同样返回400。

请求体示例:
```json
{
  "targetUserid": 2,
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``status``:string（``pending`` 表示请求正在等对方处理，``accepted`` 表示本次调用完成了一条已有的请求）
2. ``targetUserid``:long
3. ``sessionId``:long（新建的会话，仅当 ``status`` 为 ``accepted`` 时出现）

返回值示例（已发出请求）:
```json
{
  "status": "pending",
  "targetUserid": 2
}
```

返回值示例（接受了对方的请求）:
```json
{
  "status": "accepted",
  "targetUserid": 2,
  "sessionId": 7
}
```

### acceptFriendRequest

请求类型:POST

接口:``/acceptFriendRequest/{userid}``

请求体:
1. ``requesterUserid``:long（发出请求的账户，``requesterUserId`` 可作为别名）
2. ``userid``:long（已登录的用户）
3. ``token``:string（登录用户的token）

建立好友关系以及两人共享的会话。会话在此处创建而不是等到首次打开时才惰性创建，这样“接受”在双方侧边栏里会立刻有一个可见的效果，并且会话ID在好友关系存续期间保持稳定。

没有这样的待处理请求、或两人已是好友，返回400。

请求体示例:
```json
{
  "requesterUserid": 2,
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``accepted``:boolean
2. ``sessionId``:long（两人现在共享的会话）

返回值示例:
```json
{
  "accepted": true,
  "sessionId": 7
}
```

### declineFriendRequest

请求类型:POST

接口:``/declineFriendRequest/{userid}``

请求体:
1. ``requesterUserid``:long（``requesterUserId``、``targetUserid``、``targetUserId`` 可作为别名）
2. ``userid``:long（已登录的用户）
3. ``token``:string（登录用户的token）

拒绝别人的请求与撤回自己发出的请求共用这一个接口，因为它们是同一个动作的两个侧面：请求存在哪一行由涉及的两个ID决定，调用者从不需要自己说明方向。一次调用会把两个账户之间*双向*的待处理请求都清掉，因此无论参数怎么排序都不会留下残行——即使客户端对“谁向谁发的”持有过期判断，也仍能被正确处理。

请求体示例:
```json
{
  "requesterUserid": 2,
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``removed``:boolean（是否确实有请求被移除）
2. ``requesterUserid``:long（对方账户，按传入值回显）

返回值示例:
```json
{
  "removed": true,
  "requesterUserid": 2
}
```

### removeFriend

请求类型:POST

接口:``/removeFriend/{userid}``

请求体:
1. ``friendUserid``:long（``friendUserId``、``targetUserid``、``targetUserId`` 可作为别名）
2. ``userid``:long（已登录的用户）
3. ``token``:string（登录用户的token）

删除是刻意做成双向的：好友关系是对称的，不存在“一方还留着另一方、另一方却没有”的自洽状态。会话也随之删除——包括它的消息历史——因为被删除的好友不该留下一份还能读的聊天记录。对方会收到 WebSocket 推送；调用者不会，因为它已经在用本次返回值更新自己的侧边栏，而与之竞争的重新加载会把刚删掉的那一行又画回来。

调用者自己的ID返回400；两人不是好友返回404。

请求体示例:
```json
{
  "friendUserid": 2,
  "userid": 1,
  "token": "ABC"
}
```

返回值:
1. ``removed``:boolean
2. ``friendUserid``:long
3. ``sessionId``:long（被删除的会话；两人从未有过会话时该键省略而非为 ``null``）

返回值示例:
```json
{
  "removed": true,
  "friendUserid": 2,
  "sessionId": 7
}
```

## WebSocket

接口:``ws://{host}:{port}/oxype``

默认监听 ``0.0.0.0:12346``，可在 ``configs/oxype_websocket.json`` 中通过 ``server_host`` 与 ``server_port`` 配置。

连接建立后必须先发送 ``auth`` 完成鉴权；鉴权成功后服务端会自动订阅该用户已加入的全部会话。未鉴权时发送其他消息会收到 ``error`` 并被断开连接。

推送是**至多一次**的：帧只会写到那一刻处于打开状态的连接，不会为不在线的连接排队。因此会话列表类的推送带着 ``revision``，而同一个计数也会由 ``ready``、``pong`` 与 `getJoinedSessions` 报出，客户端据此能发现自己漏收了一次并重新加载。

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
2. ``revision``:long（鉴权那一刻调用者的会话列表计数）

``revision`` 与 `getJoinedSessions` 报出的是同一个计数。把它与客户端上次读取列表时记下的值比较，客户端就能区分“重连后什么都没发生”和“漏收了一次 ``sessionsChanged`` 推送”。它是在重建订阅列表*之前*读取的，所以两次之间发生的变更只会让客户端落后，而不会被标成最新。

返回值示例:
```json
{
  "type": "ready",
  "revision": 12
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
2. ``revision``:long（发送该 ping 那一刻调用者的会话列表计数）

心跳本来就每二十秒跑一次并且本来就有回包，所以这个计数是顺便带上的。它有实际用处，因为一条一直开着的连接也可能漏掉推送：投递是至多一次的，而连接在 token 刷新后重新鉴权的这段时间里，经它发出的帧都会被丢弃。客户端把这个值与自己记下的值比较，就能在不必等待重连的情况下自愈。

返回值示例:
```json
{
  "type": "pong",
  "revision": 12
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

### sessionsChanged

方向:服务端 → 客户端

当接收者的*会话列表*发生变化时推送（区别于某个会话内部的变化）。会话可以在没有任何消息发进来的情况下出现——接受好友请求就会创建单聊会话——而那一刻没有做任何动作的一方，如果不收到推送，就要等到下次刷新才能在侧边栏看到它。

该推送发给账户而不是会话，因为接收者不可能已经订阅了一个它还不知情的会话。

载荷里不含任何ID：客户端会重新加载自己的列表，因此这个推送无法用来让客户端显示一个它无权读取的会话。

消息体:
1. ``type``:string（``sessionsChanged``）
2. ``revision``:long（本次变化*之后*接收者的会话列表计数）

``revision`` 在帧发出之前就已递增，所以收到该帧的客户端可以记下这个值，并在之后确认自己没有漏掉什么——或者，如果漏掉的是*另一次*推送，会在下一个 ``pong`` 中发现。

**投递是至多一次的。** 帧只写到那一刻处于打开状态的连接，不做任何排队。因此客户端必须把 ``revision`` 当作权威，把推送帧当作优化，而绝不能反过来。没有记下任何计数的客户端，必须朝“重新加载”的方向失败。

消息体示例:
```json
{
  "type": "sessionsChanged",
  "revision": 13
}
```
