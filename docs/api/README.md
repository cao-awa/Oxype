# API
This document is the API reference for Oxype, covering its HTTP and WebSocket APIs.

[简体中文](README_zh.md) | [English](README.md)

## HTTP

Every request body and response value is JSON, and every response value is wrapped by Kalmia in a ``{"data": ...}`` envelope (the "response example" given for each endpoint below is the content of that ``data`` node).

Conventions:
1. The authentication fields are ``userid`` and ``token``; ``userId`` is accepted as an alias for ``userid``.
2. POST endpoints read the authentication fields from the JSON body; GET endpoints read them from the query string, falling back to the headers ``userid``/``X-User-Id`` and ``token``/``X-Token``.
3. Common errors: 400 when the body is not valid JSON or a required field is missing, 401 when the token is invalid, 403 when the caller is not allowed to do this, and 404 when the target does not exist.

### isAlive

Request type:POST

Endpoint:``/isAlive/{userid}``

Request body:
1. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "token": "ABC"
}
```

Response:
1. ``is_alive``:boolean

Response example:
```json
{
  "is_alive": true
}
```

### register

Request type:POST

Endpoint:``/register``

Request body:
1. ``username``:string (at most 15 characters)
2. ``password``:string (6 to 20 characters)

Request body example:
```json
{
  "username": "cao-awa",
  "password": "123456"
}
```

Response:
1. ``userid``:long
2. ``token``:string

Response example:
```json
{
  "userid": 1,
  "token": "1730000000000:ABC"
}
```

### getUser

Request type:GET

Endpoint:``/getUser/{userid}``

Request body:
1. ``userid``:long (the signed-in user, passed as the ``?userid=`` query parameter or the ``userid`` header)
2. ``token``:string (the token of the signed-in user, passed as the ``?token=`` query parameter or the ``token`` header)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response (fetching yourself):
1. ``id``:long
2. ``username``:string
3. ``hashedPassword``: string
4. ``avatarFile``: string (the stored file name, or ``null`` when the account has no avatar; this is an on-disk name -- ``getAvatar`` reports the URL that a browser can use)
5. ``avatarUrl``: string (the relative URL of the avatar; empty when the account has none)
6. ``chatHtmlSource``: string
7. ``chatCssSource``: string
8. ``chatJsSource``: string
9. ``prefLang``: string
10. ``prefTheme``: string
11. ``prefAccent``: string
12. ``prefInputFormat``: string

Response (fetching someone else):
1. ``id``: long
2. ``username``: string
3. ``hashedPassword``: string

Response example:
```json
{
  "id": 1,
  "username": "cao-awa",
  "hashedPassword": "HIDDEN"
}
```

### getStyleSources

Request type:GET

Endpoint:``/getStyleSources/{userid}``

Request body:
1. ``userid``:long (the signed-in user; you may only query your own custom front-end sources)
2. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``chatHtmlSource``:string (custom chat page; an empty string means the bundled file is used)
2. ``chatCssSource``:string (custom chat stylesheet; an empty string means the bundled file is used)
3. ``chatJsSource``:string (custom chat script; an empty string means the bundled file is used)
4. ``defaultChatHtmlSource``:string (path of the bundled default chat page)
5. ``defaultChatCssSource``:string (path of the bundled default stylesheet)
6. ``defaultChatJsSource``:string (path of the bundled default script)
7. ``maxLength``:int (maximum length of a single custom source)
8. ``httpsPrefix``:string (the absolute URL prefix accepted for a custom source)

Response example:
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

Request type:POST

Endpoint:``/updateStyleSources/{userid}``

Request body:
1. ``userid``:long (the signed-in user; you may only change your own custom front-end sources)
2. ``token``:string (the token of the signed-in user)
3. ``chatHtmlSource``:string (optional; absent or an empty string clears the override and uses the bundled file)
4. ``chatCssSource``:string (optional; same as above)
5. ``chatJsSource``:string (optional; same as above)

A custom source must be an empty string, an absolute URL beginning with ``https://``, or a relative path on this same origin. It must not exceed ``maxLength`` characters, must not be a protocol-relative URL beginning with ``//``, and must not contain ``..``.

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "chatHtmlSource": "https://example.com/chat.html",
  "chatCssSource": "/theme/sakura.css",
  "chatJsSource": ""
}
```

Response:
1. ``chatHtmlSource``:string
2. ``chatCssSource``:string
3. ``chatJsSource``:string
4. ``defaultChatHtmlSource``:string
5. ``defaultChatCssSource``:string
6. ``defaultChatJsSource``:string
7. ``maxLength``:int
8. ``httpsPrefix``:string

Response example:
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

Request type:GET

Endpoint:``/getSettings/{userid}``

Request body:
1. ``userid``:long (the signed-in user; you may only query your own interface preferences)
2. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``lang``:string (interface language; an empty string means no preference)
2. ``theme``:string (colour scheme; an empty string means follow the operating system)
3. ``accent``:string (colour tone; an empty string means the default tone)
4. ``inputFormat``:string (composer body format; an empty string means plain text)
5. ``languages``:array<string> (the accepted interface languages)
6. ``themes``:array<string> (the accepted colour schemes)
7. ``accents``:array<string> (the accepted colour tones)
8. ``inputFormats``:array<string> (the accepted body formats)
9. ``defaultLang``:string (the language assumed when none is set)
10. ``defaultInputFormat``:string (the format assumed when none is set)
11. ``maxLength``:int (maximum length of a single preference value)

Response example:
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

Request type:POST

Endpoint:``/updateSettings/{userid}``

Request body:
1. ``userid``:long (the signed-in user; you may only change your own interface preferences)
2. ``token``:string (the token of the signed-in user)
3. ``lang``:string (optional; absent keeps the stored value, an empty string clears it)
4. ``theme``:string (optional; same as above)
5. ``accent``:string (optional; same as above)
6. ``inputFormat``:string (optional; same as above)

A non-empty value must appear in the matching accepted list above. The three custom front-end source fields are not touched by this endpoint.

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "lang": "zh-CN",
  "theme": "dark"
}
```

Response:
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

Response example:
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

Request type:POST

Endpoint:``/uploadAvatar/{userid}``

Request body:
1. ``userid``:long (the signed-in user; an account may only upload its own avatar)
2. ``token``:string (the token of the signed-in user)
3. ``image``:string (the picture as base64; the ``data:image/png;base64,`` prefix is optional and is stripped when present)

The image must be a PNG, JPEG, WebP or GIF file, at most 3 MB after decoding and at most 4096 pixels on each side. The format is identified from the leading bytes of the file rather than from the declared MIME type, so a payload that is really an HTML document is refused instead of being stored and later served from this origin.

Uploading for another account returns 403, an unknown ``userid`` returns 404, and a payload that is empty, oversized, not valid base64, not one of the four formats, or larger than 4096 pixels returns 400 with the reason in the message.

Every accepted upload is stored under a name that contains a hash of the bytes, so the ``avatarUrl`` changes whenever the picture changes. A client can therefore cache the picture forever without asking the server whether it is still current.

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
}
```

Response:
1. ``kind``:string (``user`` or ``session``)
2. ``id``:long (the account or session the avatar belongs to)
3. ``name``:string (the display name that goes with the avatar)
4. ``avatarUrl``:string (relative URL of the stored picture; empty when there is none)
5. ``hasAvatar``:boolean
6. ``maxBytes``:int (the largest accepted image, in bytes)
7. ``maxEdge``:int (the largest accepted width or height, in pixels)
8. ``formats``:array<string> (the accepted MIME types)

Response example:
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

Request type:POST

Endpoint:``/removeAvatar/{userid}``

Request body:
1. ``userid``:long (the signed-in user; an account may only remove its own avatar)
2. ``token``:string (the token of the signed-in user)

The stored file is deleted, so the account draws as an initial again. Removing an avatar that does not exist succeeds and reports ``hasAvatar`` as ``false``, which makes the call safe to repeat.

Uploading for another account returns 403, and an unknown ``userid`` returns 404.

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``kind``:string (``user`` or ``session``)
2. ``id``:long
3. ``name``:string
4. ``avatarUrl``:string (always empty after a successful removal)
5. ``hasAvatar``:boolean (always ``false`` after a successful removal)
6. ``maxBytes``:int
7. ``maxEdge``:int
8. ``formats``:array<string>

Response example:
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

Request type:GET

Endpoint:``/getAvatar/{userid}``

Request body:
1. ``userid``:long (the account whose avatar is wanted; the caller itself is always allowed)
2. ``token``:string (the token of the signed-in user)

An avatar is shown to anyone who can already see that account's name, so a caller is allowed to read it when it is the same account or when the two accounts are in at least one session together. A caller that shares no session with the target returns 403, and an unknown ``userid`` returns 404.

``avatarUrl`` is always present and is empty when the account has no avatar, so a caller never has to tell an absent key apart from "no picture".

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``kind``:string (``user`` or ``session``)
2. ``id``:long
3. ``name``:string
4. ``avatarUrl``:string (relative URL of the stored picture; empty when there is none)
5. ``hasAvatar``:boolean
6. ``maxBytes``:int
7. ``maxEdge``:int
8. ``formats``:array<string>

Response example:
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

Request type:POST

Endpoint:``/uploadSessionAvatar/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be the owner or an admin of this session)
2. ``token``:string (the token of the signed-in user)
3. ``image``:string (the picture as base64; the ``data:`` prefix is optional)

The same image rules as ``uploadAvatar`` apply: PNG, JPEG, WebP or GIF, at most 3 MB and at most 4096 pixels on each side, identified from the leading bytes of the file.

The permission is the same as for the session name and description, so a member cannot repaint a group they merely belong to. A caller who is neither the owner nor an admin returns 403, an unknown session returns 404, and a rejected image returns 400.

Session pictures are stored under their own prefix, so a session avatar and an account avatar with the same id never overwrite each other.

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
}
```

Response:
1. ``kind``:string (``session`` for this endpoint)
2. ``id``:long (the session id)
3. ``name``:string (the session name)
4. ``avatarUrl``:string (relative URL of the stored picture; empty when there is none)
5. ``hasAvatar``:boolean
6. ``maxBytes``:int
7. ``maxEdge``:int
8. ``formats``:array<string>

Response example:
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

Request type:POST

Endpoint:``/removeSessionAvatar/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be the owner or an admin of this session)
2. ``token``:string (the token of the signed-in user)

The stored file is deleted and the session draws as an initial again. Removing a picture that does not exist succeeds, so the call is safe to repeat.

A caller who is neither the owner nor an admin returns 403, and an unknown session returns 404.

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``kind``:string (``session`` for this endpoint)
2. ``id``:long
3. ``name``:string
4. ``avatarUrl``:string (always empty after a successful removal)
5. ``hasAvatar``:boolean (always ``false`` after a successful removal)
6. ``maxBytes``:int
7. ``maxEdge``:int
8. ``formats``:array<string>

Response example:
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

Request type:GET

Endpoint:``/getJoinedSessions/{userid}``

Request body:
1. ``userid``:long (the signed-in user; returns the sessions this user has joined)
2. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``isEmpty``:boolean (whether the user has joined no session at all)
2. ``sessions``:array<long> (ids of the joined sessions)

Response example:
```json
{
  "isEmpty": false,
  "sessions": [1, 2, 3]
}
```

### getHash

Request type:GET

Endpoint:``/getHash?path={path}``

Request body:
1. ``path``:string (a path relative to the ``client`` directory, for example ``avatar/u1-3f9a1c04.png``; sent as a query parameter because it contains slashes)
2. ``userid``:long (the signed-in user)
3. ``token``:string (the token of the signed-in user)

The path is always resolved inside ``client`` and is never rewritten into it, so every request that does not already name a file in that folder is refused rather than reinterpreted. All of the following return 400:

1. a missing ``path``
2. a leading ``/`` or ``\``, a drive letter such as ``C:``, or a UNC prefix (absolute paths are refused, never joined onto the folder)
3. a backslash anywhere in the path (it is a separator on Windows and an ordinary character elsewhere, so one request would have two meanings)
4. ``://`` (a URL is not a path)
5. a control character
6. an empty segment, or a ``.`` or ``..`` segment
7. a symbolic link that resolves outside ``client``
8. a path longer than 256 characters
9. a file that does not exist

The response reports the SHA-256 of the file's bytes. The digest is computed once and remembered against the file's size and modification time, so asking again about an unchanged file costs one stat rather than a full read.

This endpoint grants no access that a plain static GET of the same file would not already give -- the folder is published as assets. It exists so a client that keeps a copy of a file can ask "is this still current?" with a small request instead of downloading the file again, which is what the avatar code does before deciding whether to refetch a picture.

Request body example:
```json
{
  "path": "avatar/u1-3f9a1c04.png",
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``path``:string (the resolved client-relative path, echoed back)
2. ``hash``:string (lowercase hexadecimal SHA-256 of the file's bytes)
3. ``size``:long (the file size in bytes)
4. ``modifiedAt``:long (the file's last modification time, in milliseconds since the epoch)

Response example:
```json
{
  "path": "avatar/u1-3f9a1c04.png",
  "hash": "9f2b1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8",
  "size": 2048,
  "modifiedAt": 1793781199862
}
```

### login

Request type:POST

Endpoint:``/login/{userid}``

Request body:
1. ``password``:string

Request body example:
```json
{
  "password": "123456"
}
```

Response:
1. ``token``:string

Response example:
```json
{
  "token": "1730000000000:ABC"
}
```

### logout

Request type:POST

Endpoint:``/logout/{userid}``

Request body:
1. ``token``:string (the token to revoke)

Request body example:
```json
{
  "token": "ABC"
}
```

Response:
1. ``userid``:long
2. ``loggedOut``:boolean

Response example:
```json
{
  "userid": 1,
  "loggedOut": true
}
```

### createSession

Request type:POST

Endpoint:``/createSession``

Request body:
1. ``name``:string (session name; must not be blank, at most 100 characters)
2. ``description``:string (optional session description, at most 1000 characters)
3. ``userid``:long (the signed-in user, who becomes the session owner)
4. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "name": "Kotlin",
  "description": "Discussion about Kotlin",
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``session_id``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``inviteUuid``:string (one invite UUID generated on creation; empty when generation failed)

Response example:
```json
{
  "session_id": 10,
  "sessionName": "Kotlin",
  "description": "Discussion about Kotlin",
  "owner": 1,
  "inviteUuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f60"
}
```

### getSessions

Request type:POST

Endpoint:``/getSessions``

Request body:
1. ``sessions``:array<long> (ids of the sessions to fetch; ids that do not exist are skipped)

Request body example:
```json
{
  "sessions": [1, 2, 3]
}
```

Response:
1. An array of session objects, each containing:
2. ``sessionId``:long
3. ``sessionName``:string
4. ``owner``:long
5. ``admins``:array<long>
6. ``members``:array<long>
7. ``description``:string
8. ``avatarFile``:string (the stored file name, or ``null`` when the session has no avatar)
9. ``avatarUrl``:string (relative URL of the session's picture; empty when there is none)

Response example:
```json
[
  {
    "sessionId": 1,
    "sessionName": "Kotlin",
    "owner": 1,
    "admins": [],
    "members": [1, 2],
    "description": "Discussion about Kotlin",
    "avatarFile": null,
    "avatarUrl": ""
  }
]
```

### getSession

Request type:GET

Endpoint:``/getSession/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session)
2. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``avatarUrl``:string (relative URL of the session's picture; empty when there is none)
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

Response example:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "Discussion about Kotlin",
  "owner": 1,
  "avatarUrl": "",
  "admins": [2],
  "members": [1, 2, 3],
  "isOwner": true,
  "isAdmin": true
}
```

### sendMessage

Request type:POST

Endpoint:``/sendMessage/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session)
2. ``token``:string (the token of the signed-in user)
3. ``pieces``:array<object> (the message content pieces)

Each element of ``pieces``:
1. ``type``:string (``text`` or ``markdown``)
2. ``text``:string (the piece body)

Request body example:
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

Response:
1. ``seq``:long (the message sequence number; ``-1`` means the caller is not a member of this session and nothing was sent)

Response example:
```json
{
  "seq": 12
}
```

### editMessage

Request type:POST

Endpoint:``/editMessage/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session and the author of this message)
2. ``token``:string (the token of the signed-in user)
3. ``messageId``:long (the sequence number of the message to edit; ``seq`` is accepted as an alias)
4. ``pieces``:array<object> (the new message content pieces)

Each element of ``pieces``:
1. ``type``:string (``text`` or ``markdown``)
2. ``text``:string (the piece body)

Request body example:
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

Response:
1. ``success``:boolean (``false`` means the caller is not a member of this session)
2. ``message``:object (the edited message; an empty object when the operation failed)

The fields of ``message``:
1. ``id``:long
2. ``sender``:long
3. ``timestamp``:long (the time it was first sent; an edit never changes it)
4. ``editedAt``:long (the time it was last edited; ``0`` means never edited)
5. ``pieces``:array<object>

Response example:
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

Request type:POST

Endpoint:``/deleteMessage/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session and either the author of this message or a session admin)
2. ``token``:string (the token of the signed-in user)
3. ``messageId``:long (the sequence number of the message to delete; ``seq`` is accepted as an alias)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "messageId": 12
}
```

Response:
1. ``success``:boolean (``false`` means nothing was deleted, for example because the caller is not a member of this session)
2. ``messageId``:long

Response example:
```json
{
  "success": true,
  "messageId": 12
}
```

### receivedMessageSeq

Request type:POST

Endpoint:``/receivedMessageSeq/{userid}/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session)
2. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``seq``:long (the message sequence number this user has read up to in this session; ``0`` means nothing has been read yet)

Response example:
```json
{
  "seq": 11
}
```

### getMessage

Request type:POST

Endpoint:``/getMessage/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session)
2. ``token``:string (the token of the signed-in user)
3. ``seq``:long (the sequence number of the message to fetch)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "seq": 12
}
```

Response:
1. An array of message objects containing either zero or one element (empty when the message does not exist):
2. ``id``:long
3. ``sender``:long
4. ``timestamp``:long
5. ``editedAt``:long (``0`` means never edited)
6. ``pieces``:array<object>

On success, if ``seq`` is greater than this user's read position and less than the latest sequence number, the read position is advanced as well. The array is empty when the caller is not a member of this session.

Response example:
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

Request type:POST

Endpoint:``/getMessages/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session)
2. ``token``:string (the token of the signed-in user)
3. ``start``:long (the first sequence number, inclusive)
4. ``end``:long (the last sequence number, inclusive)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "start": 1,
  "end": 50
}
```

Response:
1. An array of message objects (sequence numbers that do not exist within the range are skipped):
2. ``id``:long
3. ``sender``:long
4. ``timestamp``:long
5. ``editedAt``:long
6. ``pieces``:array<object>

On success, if ``end`` is greater than this user's read position and less than the latest sequence number, the read position is advanced as well. The array is empty when the caller is not a member of this session.

Response example:
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

Request type:GET

Endpoint:``/lastMessage/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session)
2. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``hasMessage``:boolean (whether the session still has any message)
2. ``id``:long (the sequence number of the latest message)
3. ``sender``:long (the id of the sender)
4. ``senderName``:string (the username of the sender)
5. ``timestamp``:long
6. ``content``:string (a plain-text preview of the newest message that has not been deleted)

Response example:
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

When there is no message:
```json
{
  "hasMessage": false
}
```

### getSessionUsers

Request type:GET

Endpoint:``/getSessionUsers/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session)
2. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``isOwner``:boolean
6. ``isAdmin``:boolean
7. ``users``:array<object> (the member list)

Each element of ``users``:
1. ``userid``:long
2. ``username``:string (falls back to ``User #<userid>`` when the account has no name)
3. ``avatarUrl``:string (relative URL of that account's picture; empty when there is none)

Response example:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "Discussion about Kotlin",
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

Request type:POST

Endpoint:``/joinSessionByUuid``

Request body:
1. ``uuid``:string (the invite UUID)
2. ``userid``:long (the signed-in user)
3. ``token``:string (the token of the signed-in user)

An unknown or expired invite UUID returns 400.

Request body example:
```json
{
  "uuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f60",
  "userid": 2,
  "token": "ABC"
}
```

Response:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``avatarUrl``:string (relative URL of the session's picture; empty when there is none)
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

Response example:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "Discussion about Kotlin",
  "owner": 1,
  "avatarUrl": "",
  "admins": [],
  "members": [1, 2],
  "isOwner": false,
  "isAdmin": false
}
```

### getSessionInfo

Request type:POST

Endpoint:``/getSessionInfo/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session)
2. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``avatarUrl``:string (relative URL of the session's picture; empty when there is none)
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

Response example:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "Discussion about Kotlin",
  "owner": 1,
  "avatarUrl": "",
  "admins": [2],
  "members": [1, 2, 3],
  "isOwner": true,
  "isAdmin": true
}
```

### updateSession

Request type:POST

Endpoint:``/updateSession/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be the owner or an admin of this session)
2. ``token``:string (the token of the signed-in user)
3. ``name``:string (optional new session name; must not be blank)
4. ``description``:string (optional new session description)

At least one of ``name`` and ``description`` must be provided, otherwise the endpoint returns 400.

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "name": "Kotlin Talk",
  "description": "Discussion about Kotlin"
}
```

Response:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``avatarUrl``:string (relative URL of the session's picture; empty when there is none)
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

Response example:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin Talk",
  "description": "Discussion about Kotlin",
  "owner": 1,
  "avatarUrl": "",
  "admins": [2],
  "members": [1, 2, 3],
  "isOwner": true,
  "isAdmin": true
}
```

### removeSessionMember

Request type:POST

Endpoint:``/removeSessionMember/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be the owner or an admin of this session)
2. ``token``:string (the token of the signed-in user)
3. ``targetUserid``:long (the id of the member to remove; ``targetUserId`` is accepted as an alias)

The session owner cannot be removed, and an admin cannot remove another admin (only the owner can).

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "targetUserid": 3
}
```

Response:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``avatarUrl``:string (relative URL of the session's picture; empty when there is none)
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

Response example:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "Discussion about Kotlin",
  "owner": 1,
  "avatarUrl": "",
  "admins": [2],
  "members": [1, 2],
  "isOwner": true,
  "isAdmin": true
}
```

### setSessionAdmin

Request type:POST

Endpoint:``/setSessionAdmin/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be the owner of this session)
2. ``token``:string (the token of the signed-in user)
3. ``targetUserid``:long (the id of the target member; ``targetUserId`` is accepted as an alias)
4. ``admin``:boolean (``true`` grants admin rights, ``false`` revokes them)

The target must be a member of this session, and the owner itself cannot be granted or stripped of admin rights.

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "targetUserid": 2,
  "admin": true
}
```

Response:
1. ``sessionId``:long
2. ``sessionName``:string
3. ``description``:string
4. ``owner``:long
5. ``avatarUrl``:string (relative URL of the session's picture; empty when there is none)
6. ``admins``:array<long>
7. ``members``:array<long>
8. ``isOwner``:boolean
9. ``isAdmin``:boolean

Response example:
```json
{
  "sessionId": 1,
  "sessionName": "Kotlin",
  "description": "Discussion about Kotlin",
  "owner": 1,
  "avatarUrl": "",
  "admins": [2],
  "members": [1, 2, 3],
  "isOwner": true,
  "isAdmin": true
}
```

### leaveSession

Request type:POST

Endpoint:``/leaveSession/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be a member of this session)
2. ``token``:string (the token of the signed-in user)

When the owner leaves, ownership passes to the first remaining member when there is one.

Request body example:
```json
{
  "userid": 2,
  "token": "ABC"
}
```

Response:
1. ``left``:boolean
2. ``sessionId``:long

Response example:
```json
{
  "left": true,
  "sessionId": 1
}
```

### getSessionInvites

Request type:POST

Endpoint:``/getSessionInvites/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be the owner or an admin of this session)
2. ``token``:string (the token of the signed-in user)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``uuids``:array<string> (the invite UUIDs that are currently live)
2. ``max``:int (the maximum number of invite UUIDs a single session may hold)

Response example:
```json
{
  "uuids": [
    "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f60"
  ],
  "max": 10
}
```

### createSessionInvite

Request type:POST

Endpoint:``/createSessionInvite/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be the owner or an admin of this session)
2. ``token``:string (the token of the signed-in user)

Returns 400 once the number of invite UUIDs has reached the cap.

Request body example:
```json
{
  "userid": 1,
  "token": "ABC"
}
```

Response:
1. ``uuid``:string (the newly generated invite UUID)

Response example:
```json
{
  "uuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f61"
}
```

### revokeSessionInvite

Request type:POST

Endpoint:``/revokeSessionInvite/{sessionId}``

Request body:
1. ``userid``:long (the signed-in user, who must be the owner or an admin of this session)
2. ``token``:string (the token of the signed-in user)
3. ``uuid``:string (the invite UUID to revoke)

Request body example:
```json
{
  "userid": 1,
  "token": "ABC",
  "uuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f61"
}
```

Response:
1. ``revoked``:boolean (whether that UUID really was revoked)
2. ``uuid``:string

Response example:
```json
{
  "revoked": true,
  "uuid": "0193a1f2-6f1c-7c3a-9f2b-1b2c3d4e5f61"
}
```

## WebSocket

Endpoint:``ws://{host}:{port}/oxype``

Listens on ``0.0.0.0:12346`` by default and is configurable through ``server_host`` and ``server_port`` in ``configs/oxype_websocket.json``.

A connection must send ``auth`` before anything else. Once authenticated, the server automatically subscribes it to every session the user has joined. Sending any other message while unauthenticated yields an ``error`` and the server closes the connection.

### auth

Direction:client → server

Message body:
1. ``type``:string (always ``auth``)
2. ``userid``:long (``userId`` is accepted as an alias)
3. ``token``:string (the token of the signed-in user)

Message body example:
```json
{
  "type": "auth",
  "userid": 1,
  "token": "ABC"
}
```

Response (success):
1. ``type``:string (``ready``)

Response example:
```json
{
  "type": "ready"
}
```

Response (failure; the connection is then closed):
1. ``type``:string (``error``)
2. ``code``:string (``unauthorized``)

Response example:
```json
{
  "type": "error",
  "code": "unauthorized"
}
```

### ping

Direction:client → server

Message body:
1. ``type``:string (always ``ping``)

Message body example:
```json
{
  "type": "ping"
}
```

Response:
1. ``type``:string (``pong``)

Response example:
```json
{
  "type": "pong"
}
```

### subscribe

Direction:client → server

Subscribes to the pushes of the given session. The user must be a member of that session.

Message body:
1. ``type``:string (always ``subscribe``)
2. ``sessionId``:long (``session_id`` is accepted as an alias)

Message body example:
```json
{
  "type": "subscribe",
  "sessionId": 1
}
```

Response (success):
1. ``type``:string (``subscribed``)
2. ``sessionId``:long
3. ``active``:boolean (the subscription state; ``true`` means subscribed)

Response example:
```json
{
  "type": "subscribed",
  "sessionId": 1,
  "active": true
}
```

Response (failure: not a member, or a missing parameter):
1. ``type``:string (``error``)
2. ``code``:string (``forbidden``)

Response example:
```json
{
  "type": "error",
  "code": "forbidden"
}
```

### unsubscribe

Direction:client → server

Unsubscribes from the pushes of the given session.

Message body:
1. ``type``:string (always ``unsubscribe``)
2. ``sessionId``:long (``session_id`` is accepted as an alias)

Message body example:
```json
{
  "type": "unsubscribe",
  "sessionId": 1
}
```

Response (success):
1. ``type``:string (``subscribed``)
2. ``sessionId``:long
3. ``active``:boolean (the subscription state; ``false`` means unsubscribed)

Response example:
```json
{
  "type": "subscribed",
  "sessionId": 1,
  "active": false
}
```

Response (failure):
1. ``type``:string (``error``)
2. ``code``:string (``forbidden``)

Response example:
```json
{
  "type": "error",
  "code": "forbidden"
}
```

### message

Direction:server → client

Pushed after a new message is written to a session. The sender's own other connections receive it too, so a client should de-duplicate by message id.

Message body:
1. ``type``:string (``message``)
2. ``sessionId``:long
3. ``data``:object (the new message)

The fields of ``data``:
1. ``id``:long
2. ``sender``:long
3. ``timestamp``:long
4. ``editedAt``:long
5. ``pieces``:array<object>

Message body example:
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

Direction:server → client

Pushed after a message body changes, including to the editor's own connection.

Message body:
1. ``type``:string (``messageEdited``)
2. ``sessionId``:long
3. ``data``:object (the edited message, with the same fields as ``data`` in ``message``)

Message body example:
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

Direction:server → client

Pushed after a message is deleted. It carries only the identity of the removed message, never its body.

Message body:
1. ``type``:string (``messageDeleted``)
2. ``sessionId``:long
3. ``messageId``:long

Message body example:
```json
{
  "type": "messageDeleted",
  "sessionId": 1,
  "messageId": 12
}
```
