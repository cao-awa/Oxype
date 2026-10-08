from pathlib import Path
for name,body,preview in [('client/chat.js','readMessageBody','updateActiveSessionLastMessage'),('client/classic/chat.js','bodyOfMessage','updateActiveSessionPreview')]:
 p=Path(name); s=p.read_text(encoding='utf-8')
 if 'let sessionLoadToken' not in s:
  s=s.replace('    let currentSeq = 0;', '    let currentSeq = 0;\n    let websocketListenerBound = false;\n    let sessionLoadToken = 0;\n    const renderedMessageKeys = new Set();')
 s=s.replace('    let sessionLoadToken = 0;', '    let sessionLoadToken = 0;\n    let historyLoading = false;\n    let queuedMessages = [];')
 helper='''    function bindWebSocketMessages() {
        if (websocketListenerBound) return;
        websocketListenerBound = true;
        window.addEventListener('oxype:websocket:message', event => {
            let payload = event && event.detail && event.detail.data;
            if (typeof payload === 'string') {
                try { payload = JSON.parse(payload); } catch (e) { return; }
            }
            if (!payload || payload.type !== 'message') return;
            const sessionId = payload.sessionId !== undefined ? payload.sessionId : payload.session_id;
            if (sessionId == null || activeSessionId == null || String(sessionId) !== String(activeSessionId)) return;
            receiveMessage(payload.message || payload);
        });
    }

    function receiveMessage(msg) {
        if (!msg || typeof msg !== 'object') return;
        if (historyLoading) { queuedMessages.push(msg); return; }
        const id = msg.id !== undefined ? msg.id : msg.seq;
        const key = id != null ? String(id) : null;
        if (key !== null && renderedMessageKeys.has(key)) return;
        const body = BODY(msg);
        if (!body.text) return;
        if (key !== null) renderedMessageKeys.add(key);
        currentSeq = Math.max(currentSeq, Number(id) || 0);
        const senderId = msg.sender !== undefined ? msg.sender : msg.userid;
        const self = currentUser && senderId != null && String(currentUser.id) === String(senderId);
        const sender = self ? (currentUser.username || 'Me')
            : (activeSessionUsers.get(String(senderId)) || `User #${senderId}`);
        const stamp = Number(msg.timestamp) || 0;
        const hint = document.getElementById('emptyConversationHint');
        if (hint) hint.remove();
        appendMessage({ text: body.text, format: body.format, sender, isSelf: !!self,
            timestamp: formatClockTime(stamp), timestampMs: stamp });
        PREVIEW(sender, previewOfBody(body.text));
    }

'''.replace('BODY',body).replace('PREVIEW',preview)
 s=s.replace('    async function selectSession(sessionId) {',helper+'''    async function selectSession(sessionId) {
        const loadToken = ++sessionLoadToken;
        if (window.OxypeWebSocket && activeSessionId != null) window.OxypeWebSocket.unsubscribe(activeSessionId);
        historyLoading = true;
        queuedMessages = [];
        renderedMessageKeys.clear();
        currentSeq = 0;
        activeSessionInfo = null;
        if (messagesContainerEl) messagesContainerEl.innerHTML = '';
        if (window.OxypeWebSocket) window.OxypeWebSocket.subscribe(sessionId);''')
 start=s.index('    async function selectSession(sessionId) {'); end=s.index('\n    }',start)+6
 part=s[start:end]
 lines=part.splitlines(); result=[]
 for line in lines:
  result.append(line)
  if ' = await window.OxypeCore.' in line:
   result.append('            if (loadToken !== sessionLoadToken) return;')
  if '} catch (' in line:
   result.append('            if (loadToken !== sessionLoadToken) return;')
 part='\n'.join(result)
 a=part.index('            if (Array.isArray(messages)'); b=part.index('        } catch (',a)
 part=part[:a]+'''            historyLoading = false;
            if (Array.isArray(messages)) messages.forEach(receiveMessage);
            queuedMessages.forEach(receiveMessage);
            queuedMessages = [];
            if (!renderedMessageKeys.size) showEmptyConversationHint();
'''+part[b:]
 part=part.replace('            showEmptyConversationHint();\n        }','''            historyLoading = false;
            queuedMessages.forEach(receiveMessage);
            queuedMessages = [];
            if (!renderedMessageKeys.size) showEmptyConversationHint();
        }''')
 s=s[:start]+part+s[end:]
 # Use the authoritative HTTP result or pushed message, keyed by sequence, instead of an unidentifiable optimistic row.
 start=s.index('    async function handleSendMessage('); end=s.index('\n    }',start)+6
 part=s[start:end]
 part=part.replace('        e.preventDefault();','        if (e) e.preventDefault();')
 part=part.replace('        const format = getSelectedMessageFormat();','        const format = getSelectedMessageFormat();\n        const sendingSessionId = activeSessionId;\n        const sendingLoadToken = sessionLoadToken;')
 a=part.index('        // Stamp the optimistic') if '        // Stamp the optimistic' in part else part.index('        // Draw the bubble')
 b=part.index('        try {',a)
 part=part[:a]+part[b:]
 part=part.replace('                activeSessionId, text,','                sendingSessionId, text,')
 a=part.index("            if (res && typeof res.seq")
 b=part.index('        } catch (',a)
 part=part[:a]+'''            if (sendingLoadToken === sessionLoadToken && String(sendingSessionId) === String(activeSessionId) && res && res.seq != null) {
                receiveMessage({ id: res.seq, sender: currentUser.id, timestamp: res.timestamp || Date.now(),
                    pieces: [{ type: format, text }] });
            }
'''+part[b:]
 s=s[:start]+part+s[end:]
 if name.endswith('classic/chat.js'):
  s=s.replace('            window.OxypeWebSocket.start(stored);','            bindWebSocketMessages();\n            window.OxypeWebSocket.start(stored);')
 # Any transition to no conversation invalidates outstanding async loads and subscriptions.
 s=s.replace('            activeSessionId = null;', '''            sessionLoadToken += 1;
            if (window.OxypeWebSocket) window.OxypeWebSocket.unsubscribe(activeSessionId);
            historyLoading = false;
            queuedMessages = [];
            activeSessionId = null;''')
 p.write_text(s,encoding='utf-8')
