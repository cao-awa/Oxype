/**
 * Oxype Web Client - Core Network & API Communication Module
 * Handles API requests for authentication, user queries, and session management.
 */

(function (global) {
    'use strict';

    /**
     * Storage keys for session and auth tokens
     */
    const STORAGE_KEY_TOKEN = 'oxype_auth_token';
    const STORAGE_KEY_USERID = 'oxype_user_id';
    const STORAGE_KEY_USERNAME = 'oxype_username';

    /**
     * Core API client implementation
     */
    class OxypeCore {
        constructor() {
            if (global.OXYPE_CONFIG && global.OXYPE_CONFIG.baseUrl) {
                this.baseUrl = global.OXYPE_CONFIG.baseUrl;
            } else if (typeof window !== 'undefined' && window.location) {
                // When served over http/https, use relative paths so any port or hostname works.
                this.baseUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:') ? '' : 'http://127.0.0.1:12345';
            } else {
                this.baseUrl = 'http://127.0.0.1:12345';
            }
        }

        /**
         * Set the base API server URL
         * @param {string} url 
         */
        setBaseUrl(url) {
            this.baseUrl = url.replace(/\/+$/, '');
        }

        /**
         * Coerces a user id into the numeric form the JSON API expects.
         *
         * Ids are read back from localStorage, which only ever stores strings, while
         * the backend parses them from JSON. Sending "12" instead of 12 is what made
         * the session-management routes answer 400 Bad Request.
         *
         * @param {number|string|null} value
         * @returns {number|string|null} A number when the value is numeric, else the original
         */
        toNumericId(value) {
            if (value === null || value === undefined || value === '') {
                return value;
            }
            const numeric = Number(value);
            return Number.isNaN(numeric) ? value : numeric;
        }

        /**
         * Builds the authenticated JSON body shared by the session routes.
         *
         * @param {number|string} [userId]
         * @param {string} [token]
         * @param {Object} [extra] Additional fields to merge into the body
         * @returns {{token: string, userid: number|string|null}}
         */
        authBody(userId = null, token = null, extra = {}) {
            const storedAuth = this.getStoredAuth();
            const rawId = (userId !== null && userId !== undefined && userId !== '')
                ? userId
                : (storedAuth && storedAuth.userId);
            const rawToken = token || (storedAuth && storedAuth.token);

            return {
                token: rawToken || '',
                userid: this.toNumericId(rawId),
                ...extra
            };
        }

        /**
         * Builds the `userid`/`token` query suffix used to authenticate GET requests.
         *
         * The backend authenticates every route through `getUserByToken`, and GET
         * requests carry no JSON body, so the credentials travel in the query string.
         *
         * @param {number|string} [userId]
         * @param {string} [token]
         * @returns {string} Query string beginning with '?' or an empty string
         */
        authQuery(userId = null, token = null) {
            const storedAuth = this.getStoredAuth();
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);
            const currentToken = token || (storedAuth && storedAuth.token);

            const params = new URLSearchParams();
            if (currentUserId !== null && currentUserId !== undefined) {
                params.set('userid', String(currentUserId));
            }
            if (currentToken) {
                params.set('token', String(currentToken));
            }

            const query = params.toString();
            return query ? `?${query}` : '';
        }

        /**
         * Helper to perform fetch requests with JSON headers and response parsing
         * @param {string} endpoint 
         * @param {Object} options 
         * @returns {Promise<any>}
         */
        async request(endpoint, options = {}) {
            const method = (options.method || 'GET').toUpperCase();
            let url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

            // GET requests must still prove identity, so append the credentials the
            // backend's getUserByToken check expects when the caller has not already.
            if (method === 'GET' && !url.includes('token=')) {
                const separator = url.includes('?') ? '&' : '?';
                const auth = this.authQuery().replace(/^\?/, '');
                if (auth) {
                    url += separator + auth;
                }
            }

            const isCrossOrigin = Boolean(this.baseUrl && typeof window !== 'undefined' && window.location && !url.startsWith(window.location.origin));

            const headers = {
                'Accept': 'application/json',
                ...(options.headers || {})
            };

            if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
                // For cross-origin requests, use text/plain to avoid triggering an OPTIONS preflight
                // which backend pipeline cannot route. The backend automatically parses text body as JSON.
                headers['Content-Type'] = isCrossOrigin ? 'text/plain;charset=UTF-8' : 'application/json';
                options.body = JSON.stringify(options.body);
            }

            const controller = new AbortController();
            const timeoutMs = options.timeout || 10000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    headers
                });
                clearTimeout(timeoutId);

                // Parse response body if present
                const contentType = response.headers.get('content-type') || '';
                let data = null;
                if (contentType.includes('application/json')) {
                    data = await response.json();
                } else {
                    const text = await response.text();
                    try {
                        data = JSON.parse(text);
                    } catch (e) {
                        data = text;
                    }
                }

                // If HTTP status is not ok (2xx), throw structured error
                if (!response.ok) {
                    const errorMsg = this.extractErrorMessage(data, response);
                    const error = new Error(errorMsg);
                    error.status = response.status;
                    error.data = data;
                    error.endpoint = endpoint;
                    error.method = method;
                    error.url = url;
                    this.logRequestFailure(method, url, response.status, errorMsg, data);
                    throw error;
                }

                // If response envelope wraps payload in `data` (e.g. Kalmia backend envelope), unwrap it
                if (data && typeof data === 'object' && 'data' in data && data.data !== undefined) {
                    return data.data;
                }

                return data;
            } catch (err) {
                clearTimeout(timeoutId);
                // Handle timeout
                if (err.name === 'AbortError') {
                    const timeoutError = new Error(`Request timed out after ${timeoutMs}ms`);
                    timeoutError.isTimeout = true;
                    timeoutError.isOffline = true;
                    console.error(`[OxypeCore] ${method} ${url} failed -> timed out after ${timeoutMs}ms`);
                    throw timeoutError;
                }
                // Enhance network error description
                if (err.name === 'TypeError' && err.message.includes('fetch')) {
                    const networkError = new Error('Network error: Unable to connect to Oxype server.');
                    networkError.isOffline = true;
                    console.error(`[OxypeCore] ${method} ${url} failed -> network error (server unreachable)`, err);
                    throw networkError;
                }
                throw err;
            }
        }

        /**
         * Extracts the human-readable reason from a failed response.
         *
         * Kalmia reports failures as
         * `{ error_message, error_details_message, error, internal_error_name, ... }`
         * where `error` only carries the generic protocol text
         * ("Server protocol error (Kalmia/1.0.34, HTTP/1.1): Bad Request").
         * Reading `error` before `error_message` is what made every failure -- an
         * expired invite code, a missing field, a permission problem -- surface in
         * the UI as an unhelpful bare "Bad Request".
         *
         * @param {any} data Parsed response body
         * @param {Response} response Fetch response
         * @returns {string} The most specific message available
         */
        extractErrorMessage(data, response) {
            if (data && typeof data === 'object') {
                const candidates = [
                    data.error_message,
                    data.error_details_message,
                    data.message,
                    data.error
                ];
                // Prefer a concrete reason over the generic protocol text.
                for (const candidate of candidates) {
                    if (typeof candidate === 'string' && candidate.trim() && !/^Server protocol error/i.test(candidate.trim())) {
                        return candidate.trim();
                    }
                }
                // Nothing specific: fall back to whatever text exists.
                for (const candidate of candidates) {
                    if (typeof candidate === 'string' && candidate.trim()) {
                        return candidate.trim();
                    }
                }
            }

            if (typeof data === 'string' && data.trim()) {
                return data.trim();
            }

            return `HTTP ${response.status}: ${response.statusText}`;
        }

        /**
         * Prints the full detail of a failed request.
         *
         * Emitted for every non-2xx response so the browser console always shows the
         * server's own reason, the method/path and the raw envelope.
         *
         * @param {string} method
         * @param {string} url
         * @param {number} status
         * @param {string} message
         * @param {any} data Raw parsed body
         */
        logRequestFailure(method, url, status, message, data) {
            console.error(
                `[OxypeCore] ${method} ${url} failed -> HTTP ${status}: ${message}`,
                { status: status, reason: message, response: data }
            );
        }

        /**
         * Register a new user account
         * POST /register with JSON body { username, password }
         * 
         * @param {string} username - User account name (1-15 characters)
         * @param {string} password - User password (6-20 characters)
         * @returns {Promise<{userid: number|string, token: string}>}
         */
        async register(username, password) {
            if (!username || username.trim().length === 0 || username.length > 15) {
                throw new Error('Username must be between 1 and 15 characters');
            }
            if (!password || password.length < 6 || password.length > 20) {
                throw new Error('Password must be between 6 and 20 characters');
            }

            const response = await this.request('/register', {
                method: 'POST',
                body: {
                    username: username.trim(),
                    password: password
                }
            });

            // Automatically persist auth credentials upon successful registration
            if (response && response.token) {
                this.saveAuth(response.userid, response.token, username.trim());
            }

            return response;
        }

        /**
         * Log in an existing user with User ID and password
         * POST /login/{loginUser} with JSON body { password }
         * 
         * @param {number|string} userId 
         * @param {string} password 
         * @returns {Promise<{token: string}>}
         */
        async login(userId, password) {
            if (!userId) {
                throw new Error('User ID is required');
            }
            if (!password) {
                throw new Error('Password is required');
            }

            const response = await this.request(`/login/${encodeURIComponent(userId)}`, {
                method: 'POST',
                body: {
                    password: password
                }
            });

            if (response && response.token) {
                this.saveAuth(userId, response.token);
            }

            return response;
        }

        /**
         * Fetch user information by user ID
         * GET /getUser/{userid}
         * 
         * @param {number|string} userId 
         * @returns {Promise<{id: number, username: string, hashedPassword?: string}>}
         */
        async getUser(userId) {
            if (!userId) {
                throw new Error('User ID is required to fetch user profile');
            }

            return await this.request(`/getUser/${encodeURIComponent(userId)}`, {
                method: 'GET'
            });
        }

        /**
         * Fetch session details by session ID
         * GET /getSession/{sessionId}
         * 
         * @param {number|string} sessionId 
         * @returns {Promise<{sessionId: number, sessionName: string}>}
         */
        async getSession(sessionId) {
            if (!sessionId) {
                throw new Error('Session ID is required to fetch session details');
            }

            return await this.request(`/getSession/${encodeURIComponent(sessionId)}`, {
                method: 'GET'
            });
        }

        /**
         * Create a new session
         * POST /createSession with JSON body { name, description, token, userid }
         * 
         * @param {string} name - Name of the session to create
         * @param {string} [description] - Optional session description
         * @param {string} [token] - Optional explicit auth token; defaults to stored token
         * @param {number|string} [userId] - Optional explicit user ID; defaults to stored userId
         * @returns {Promise<{session_id: number|string, inviteUuid: string}>}
         */
        async createSession(name, description = '', token = null, userId = null) {
            if (!name || !name.trim()) {
                throw new Error('Session name is required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            const body = this.authBody(currentUserId, authToken, {
                name: name.trim(),
                description: (description || '').trim()
            });
            // `userId` is kept as an alias for older backend builds.
            if (body.userid !== null && body.userid !== undefined) {
                body.userId = body.userid;
            }

            return await this.request('/createSession', {
                method: 'POST',
                body: body
            });
        }

        /**
         * Join a session using an invite UUID
         * POST /joinSessionByUuid with JSON body { uuid, token, userid }
         *
         * @param {string} uuid
         * @param {number|string} [userId]
         * @param {string} [token]
         * @returns {Promise<Object>} The joined session view
         */
        async joinSessionByUuid(uuid, userId = null, token = null) {
            const cleanUuid = String(uuid || '').replace(/^"|"$/g, '').trim();
            if (!cleanUuid) {
                throw new Error('Invite UUID is required');
            }

            return await this.request('/joinSessionByUuid', {
                method: 'POST',
                body: this.authBody(userId, token, { uuid: cleanUuid })
            });
        }

        /**
         * List the members of a session
         * GET /getSessionUsers/{sessionId}?userid=..&token=..
         *
         * @param {number|string} sessionId
         * @param {number|string} [userId]
         * @param {string} [token]
         * @returns {Promise<{users: Array<{userid: number, username: string}>, isOwner: boolean, isAdmin: boolean}>}
         */
        async getSessionUsers(sessionId, userId = null, token = null) {
            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            const endpoint = `/getSessionUsers/${encodeURIComponent(sessionId)}${this.authQuery(currentUserId, authToken)}`;
            return await this.request(endpoint, { method: 'GET' });
        }

        /**
         * Read the caller's custom front-end sources
         * GET /getStyleSources/{userid}?userid=..&token=..
         *
         * @param {number|string} [userId]
         * @param {string} [token]
         * @returns {Promise<{chatHtmlSource: string, chatCssSource: string, chatJsSource: string, defaultChatHtmlSource: string, defaultChatCssSource: string, defaultChatJsSource: string, maxLength: number}|null>}
         */
        async getStyleSources(userId = null, token = null) {
            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            if (currentUserId === null || currentUserId === undefined) {
                throw new Error('User ID is required');
            }

            const endpoint = `/getStyleSources/${encodeURIComponent(currentUserId)}${this.authQuery(currentUserId, authToken)}`;
            return await this.request(endpoint, { method: 'GET' });
        }

        /**
         * Store the caller's custom front-end sources
         * POST /updateStyleSources/{userid}
         *
         * An empty string clears that override so the bundled file is used again.
         *
         * @param {{chatHtmlSource?: string, chatCssSource?: string, chatJsSource?: string}} sources
         * @param {number|string} [userId]
         * @param {string} [token]
         */
        async updateStyleSources(sources = {}, userId = null, token = null) {
            const storedAuth = this.getStoredAuth();
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            if (currentUserId === null || currentUserId === undefined) {
                throw new Error('User ID is required');
            }

            return await this.request(`/updateStyleSources/${encodeURIComponent(currentUserId)}`, {
                method: 'POST',
                body: this.authBody(currentUserId, token, {
                    chatHtmlSource: sources.chatHtmlSource || '',
                    chatCssSource: sources.chatCssSource || '',
                    chatJsSource: sources.chatJsSource || ''
                })
            });
        }

        /**
         * Fetch the latest message of a session
         * GET /lastMessage/{sessionId}?userid=..&token=..
         *
         * @param {number|string} sessionId
         * @param {number|string} [userId]
         * @param {string} [token]
         * @returns {Promise<{hasMessage: boolean, id?: number, sender?: number, senderName?: string, content?: string}|null>}
         */
        async getLastMessage(sessionId, userId = null, token = null) {
            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            const endpoint = `/lastMessage/${encodeURIComponent(sessionId)}${this.authQuery(currentUserId, authToken)}`;
            return await this.request(endpoint, { method: 'GET' });
        }

        /**
         * Read a session's metadata together with the caller's role
         * POST /getSessionInfo/{sessionId}
         */
        async getSessionInfo(sessionId, userId = null, token = null) {
            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            return await this.request(`/getSessionInfo/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: this.authBody(userId, token)
            });
        }

        /**
         * Update a session's name and/or description (owner or admin)
         * POST /updateSession/{sessionId}
         */
        async updateSession(sessionId, changes = {}, userId = null, token = null) {
            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const body = this.authBody(userId, token);
            if (typeof changes.name === 'string') {
                body.name = changes.name;
            }
            if (typeof changes.description === 'string') {
                body.description = changes.description;
            }

            return await this.request(`/updateSession/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: body
            });
        }

        /**
         * Remove a member from a session (owner or admin)
         * POST /removeSessionMember/{sessionId}
         */
        async removeSessionMember(sessionId, targetUserId, userId = null, token = null) {
            if (!sessionId || !targetUserId) {
                throw new Error('Session ID and target user ID are required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            return await this.request(`/removeSessionMember/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: this.authBody(userId, token, { targetUserid: this.toNumericId(targetUserId) })
            });
        }

        /**
         * Grant or revoke admin rights for a member (owner only)
         * POST /setSessionAdmin/{sessionId}
         */
        async setSessionAdmin(sessionId, targetUserId, admin, userId = null, token = null) {
            if (!sessionId || !targetUserId) {
                throw new Error('Session ID and target user ID are required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            return await this.request(`/setSessionAdmin/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: this.authBody(userId, token, {
                    targetUserid: this.toNumericId(targetUserId),
                    admin: Boolean(admin)
                })
            });
        }

        /**
         * Leave a session
         * POST /leaveSession/{sessionId}
         */
        async leaveSession(sessionId, userId = null, token = null) {
            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            return await this.request(`/leaveSession/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: this.authBody(userId, token)
            });
        }

        /**
         * List a session's live invite UUIDs (owner only)
         * POST /getSessionInvites/{sessionId}
         */
        async getSessionInvites(sessionId, userId = null, token = null) {
            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            return await this.request(`/getSessionInvites/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: this.authBody(userId, token)
            });
        }

        /**
         * Generate a new invite UUID (owner only, capped per session)
         * POST /createSessionInvite/{sessionId}
         */
        async createSessionInvite(sessionId, userId = null, token = null) {
            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            return await this.request(`/createSessionInvite/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: this.authBody(userId, token)
            });
        }

        /**
         * Revoke an invite UUID (owner only)
         * POST /revokeSessionInvite/{sessionId}
         */
        async revokeSessionInvite(sessionId, uuid, userId = null, token = null) {
            const cleanUuid = String(uuid || '').replace(/^"|"$/g, '').trim();
            if (!sessionId || !cleanUuid) {
                throw new Error('Session ID and UUID are required');
            }

            const storedAuth = this.getStoredAuth();
            const authToken = token || (storedAuth && storedAuth.token);
            const currentUserId = (userId !== null && userId !== undefined) ? userId : (storedAuth && storedAuth.userId);

            return await this.request(`/revokeSessionInvite/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: this.authBody(userId, token, { uuid: cleanUuid })
            });
        }

        /**
         * Fetch the list of sessions joined by the user
         * GET /getJoinedSessions/{userid}
         * Returns sessions array from response envelope (e.g. data.sessions)
         * 
         * @param {number|string} userId 
         * @returns {Promise<Array<number|string|Object>>}
         */
        async getJoinedSessions(userId) {
            if (!userId) {
                throw new Error('User ID is required to fetch joined sessions');
            }

            const response = await this.request(`/getJoinedSessions/${encodeURIComponent(userId)}`, {
                method: 'GET'
            });

            // Handle Kalmia envelope where data has { sessions: [...], isEmpty: false }
            if (response && Array.isArray(response.sessions)) {
                return response.sessions;
            }
            if (response && response.data && Array.isArray(response.data.sessions)) {
                return response.data.sessions;
            }
            if (Array.isArray(response)) {
                return response;
            }

            return [];
        }

        /**
         * Send message to a session
         * POST /sendMessage/{sessionId}
         * Payload: { userid: 1, token: "...", pieces: [{ type: 'text', text: '...' }] }
         *
         * @param {number|string} sessionId - Target session ID
         * @param {string|Array<{type: string, text: string}>} content - Text content or pieces array
         * @param {number|string} [userId] - Optional explicit sender user ID
         * @param {string} [token] - Optional explicit auth token
         * @param {'text'|'markdown'} [messageType='text'] - How the receiving client should
         *        interpret a string [content]. Use 'markdown' to send Markdown source.
         * @returns {Promise<{seq: number}|any>}
         */
        async sendMessage(sessionId, content, userId = null, token = null, messageType = 'text') {
            if (!sessionId) {
                throw new Error('Session ID is required to send message');
            }

            let pieces;
            if (Array.isArray(content)) {
                // An explicit pieces array is forwarded verbatim: a caller that builds
                // its own pieces has already decided each one's type.
                pieces = content;
            } else if (typeof content === 'string') {
                if (!content.trim()) {
                    throw new Error('Message content cannot be empty');
                }
                // The server only decodes piece types it has a codec for, so an
                // unrecognised type is rejected here rather than sent and refused.
                const type = messageType === 'markdown' ? 'markdown' : 'text';
                pieces = [
                    {
                        type: type,
                        // Deliberately not trimmed: leading whitespace makes a fenced
                        // code block, and trailing whitespace is a Markdown line break.
                        text: content
                    }
                ];
            } else {
                throw new Error('Invalid message content');
            }

            const payload = this.authBody(userId, token, {
                pieces: pieces
            });

            return await this.request(`/sendMessage/${encodeURIComponent(sessionId)}`, {
                method: 'POST',
                body: payload
            });
        }

        /**
         * Get the latest received/read message sequence for a user in a session
         * POST /receivedMessageSeq/{userid}/{sessionId}
         * 
         * @param {number|string} userId 
         * @param {number|string} sessionId 
         * @param {string} [token] 
         * @returns {Promise<number>}
         */
        async getReceivedMessageSeq(userId, sessionId, token = null) {
            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const payload = this.authBody(userId, token);
            const pathUserId = encodeURIComponent(payload.userid);

            try {
                const response = await this.request(`/receivedMessageSeq/${pathUserId}/${encodeURIComponent(sessionId)}`, {
                    method: 'POST',
                    body: payload
                });

                if (typeof response === 'number') {
                    return response;
                }
                if (response && typeof response === 'object') {
                    if (typeof response.seq === 'number') return response.seq;
                    if (response.data && typeof response.data.seq === 'number') return response.data.seq;
                    if (typeof response.data === 'number') return response.data;
                }
                return 0;
            } catch (err) {
                console.warn('[OxypeCore] POST /receivedMessageSeq failed:', err.message);
                return 0;
            }
        }

        /**
         * Fetch a range of messages in a session
         * POST /getMessages/{sessionId}
         * 
         * @param {number|string} sessionId 
         * @param {number} start 
         * @param {number} end 
         * @param {number|string} [userId] 
         * @param {string} [token] 
         * @returns {Promise<Array<{id: number, pieces: Array<{type: string, text: string}>}>>}
         */
        async getMessages(sessionId, start, end, userId = null, token = null) {
            if (!sessionId) {
                throw new Error('Session ID is required');
            }

            const payload = this.authBody(userId, token, {
                start: Number(start),
                end: Number(end)
            });

            try {
                const response = await this.request(`/getMessages/${encodeURIComponent(sessionId)}`, {
                    method: 'POST',
                    body: payload
                });

                if (Array.isArray(response)) {
                    return response;
                }
                if (response && Array.isArray(response.data)) {
                    return response.data;
                }
                if (response && Array.isArray(response.list)) {
                    return response.list;
                }
                if (response && Array.isArray(response.messages)) {
                    return response.messages;
                }
                return [];
            } catch (err) {
                console.warn('[OxypeCore] POST /getMessages failed:', err.message);
                return [];
            }
        }

        /**
         * Fetch batch session details for multiple session IDs
         * POST /getSessions with JSON body { sessions: [id1, id2, ...] }
         * 
         * @param {Array<number|string>} sessionIds - List of session IDs
         * @returns {Promise<Array<{sessionId: number, sessionName: string}>>}
         */
        async getSessions(sessionIds) {
            if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
                return [];
            }

            // Convert IDs to numbers if possible to match JSONNumber on backend
            const formattedIds = sessionIds.map(id => {
                const num = Number(id);
                return !isNaN(num) ? num : id;
            });

            try {
                const response = await this.request('/getSessions', {
                    method: 'POST',
                    body: {
                        sessions: formattedIds
                    }
                });

                if (Array.isArray(response)) {
                    return response;
                }
                if (response && Array.isArray(response.list)) {
                    return response.list;
                }
                if (response && response.data && Array.isArray(response.data.list)) {
                    return response.data.list;
                }
                if (response && Array.isArray(response.data)) {
                    return response.data;
                }
                if (response && Array.isArray(response.sessions)) {
                    return response.sessions;
                }
                return [];
            } catch (err) {
                console.warn('[OxypeCore] POST /getSessions failed, attempting individual fallbacks:', err.message);
                // Fallback to querying individual sessions via GET /getSession/{id}
                const fallbackResults = await Promise.allSettled(
                    formattedIds.map(id => this.getSession(id))
                );
                return fallbackResults
                    .filter(res => res.status === 'fulfilled' && res.value)
                    .map(res => res.value);
            }
        }

        /**
         * Verify token validity for the user
         * POST /isAlive/{userid} with JSON body { token }
         * 
         * @param {number|string} userId 
         * @param {string} [token] 
         * @returns {Promise<boolean>}
         */
        async isAlive(userId, token = null) {
            if (!userId) {
                return false;
            }

            const authToken = token || (this.getStoredAuth() && this.getStoredAuth().token);
            if (!authToken) {
                return false;
            }

            try {
                const response = await this.request(`/isAlive/${encodeURIComponent(userId)}`, {
                    method: 'POST',
                    body: {
                        token: authToken
                    }
                });

                // Backend returns boolean (e.g. true / false, or wrapped in object)
                if (typeof response === 'boolean') {
                    return response;
                }
                if (response && typeof response === 'object') {
                    if (typeof response.is_alive === 'boolean') return response.is_alive;
                    if (typeof response.isAlive === 'boolean') return response.isAlive;
                    if (typeof response.alive === 'boolean') return response.alive;
                    if (typeof response.valid === 'boolean') return response.valid;
                    if (response.data && typeof response.data.is_alive === 'boolean') return response.data.is_alive;
                    if (response.data && typeof response.data.isAlive === 'boolean') return response.data.isAlive;
                }
                return true;
            } catch (err) {
                // If response status is 401 Unauthorized or 403 Forbidden, token is explicitly invalid
                if (err.status === 401 || err.status === 403) {
                    return false;
                }
                // Non-auth server issues (e.g. 500 or offline network) should not invalidate login
                console.warn('[OxypeCore] isAlive check encountered non-auth error:', err.message);
                return true;
            }
        }

        /**
         * Save authenticated user credentials to localStorage
         * @param {number|string} userId 
         * @param {string} token 
         * @param {string} [username] 
         */
        saveAuth(userId, token, username = '') {
            try {
                localStorage.setItem(STORAGE_KEY_USERID, String(userId));
                localStorage.setItem(STORAGE_KEY_TOKEN, String(token));
                if (username) {
                    localStorage.setItem(STORAGE_KEY_USERNAME, String(username));
                }
            } catch (e) {
                console.error('[OxypeCore] Failed to save authentication info', e);
            }
        }

        /**
         * Retrieve stored auth credentials
         * @returns {{userId: string|null, token: string|null, username: string|null}}
         */
        getStoredAuth() {
            try {
                return {
                    userId: localStorage.getItem(STORAGE_KEY_USERID),
                    token: localStorage.getItem(STORAGE_KEY_TOKEN),
                    username: localStorage.getItem(STORAGE_KEY_USERNAME)
                };
            } catch (e) {
                return { userId: null, token: null, username: null };
            }
        }

        /**
         * Check if client currently holds an active auth token
         * @returns {boolean}
         */
        isAuthenticated() {
            const auth = this.getStoredAuth();
            return !!(auth.token && auth.userId);
        }

        /**
         * Clear stored auth credentials (logout)
         */
        clearAuth() {
            try {
                localStorage.removeItem(STORAGE_KEY_USERID);
                localStorage.removeItem(STORAGE_KEY_TOKEN);
                localStorage.removeItem(STORAGE_KEY_USERNAME);
            } catch (e) {
                console.error('[OxypeCore] Failed to clear authentication info', e);
            }
        }
    }

    // Export singleton instance
    global.OxypeCore = new OxypeCore();
})(window);
