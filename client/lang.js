/**
 * Oxype Web Client - Internationalization (i18n) Module
 * Provides multi-language dictionaries and dynamic UI translation.
 */

(function (global) {
    'use strict';

    /**
     * Language translation dictionaries
     */
    const translations = {
        'en': {
            // General
            'app.title': 'Oxype',
            'common.loading': 'Loading...',
            'common.error': 'An error occurred',
            'common.networkError': 'Unable to connect to server (Server offline)',
            'common.language': 'Language',
            'common.theme': 'Theme',
            'common.light': 'Light',
            'common.dark': 'Dark',
            'common.save': 'Save',
            'common.cancel': 'Cancel',
            'common.close': 'Close',

            // Auth / Register Page
            'auth.title': 'Welcome to Oxype',
            'auth.tabRegister': 'Register',
            'auth.tabLogin': 'Login',
            'auth.usernameLabel': 'Username',
            'auth.usernamePlaceholder': 'Enter username (1-15 characters)',
            'auth.passwordLabel': 'Password',
            'auth.passwordPlaceholder': 'Enter password (6-20 characters)',
            'auth.confirmPasswordLabel': 'Confirm Password',
            'auth.confirmPasswordPlaceholder': 'Re-enter password',
            'auth.userIdLabel': 'User ID',
            'auth.userIdPlaceholder': 'Enter numeric user ID',
            'auth.registerBtn': 'Create Account',
            'auth.loginBtn': 'Sign In',
            'auth.hasAccount': 'Already have an account? Sign In',
            'auth.noAccount': "Don't have an account? Register",
            'auth.errUsernameLength': 'Username must be between 1 and 15 characters.',
            'auth.errPasswordLength': 'Password must be between 6 and 20 characters.',
            'auth.errPasswordMismatch': 'Passwords do not match.',
            'auth.errUserIdRequired': 'Please enter a valid numeric User ID.',
            'auth.registerSuccess': 'Registration successful! Redirecting...',
            'auth.loginSuccess': 'Login successful! Redirecting...',
            'auth.registeredInfo': 'Account created! Your User ID is: {userId}',

            // Chat Page
            'chat.title': 'Oxype',
            'chat.sessionsTitle': 'Conversations',
            'chat.noSessions': 'No conversations joined yet',
            'chat.noSessionsHint': 'When you join or are added to sessions, they will appear here.',
            'chat.selectSessionHint': 'Select a conversation from the sidebar',
            'chat.inputPlaceholder': 'Type a message...',
            'chat.inputPlaceholderMarkdown': 'Markdown supported: **bold**, `code`, - lists',
            'chat.formatLabel': 'Message format',
            'chat.formatText': 'Plain text',
            'chat.formatMarkdown': 'Markdown',
            'chat.sendBtn': 'Send',
            'chat.logoutBtn': 'Log Out',
            'chat.currentUser': 'Logged in as: {username} (ID: {userId})',
            'chat.sessionInfo': 'Session ID: {sessionId}',
            'chat.members': 'Members',
            'chat.online': 'Online',
            'chat.offline': 'Offline',
            'chat.loadError': 'Failed to load conversations from server',
            'chat.sessionNotFound': 'Session not found',
            'chat.notAuthenticated': 'Not authenticated. Redirecting to registration...',
            'chat.emptyConversation': 'No messages in this conversation yet.',
            'chat.newSession': 'New Conversation',
            'chat.createSessionTitle': 'Create New Conversation',
            'chat.sessionNameLabel': 'Conversation Name',
            'chat.sessionNamePlaceholder': 'Enter conversation name...',
            'chat.createBtn': 'Create',
            'chat.createSessionSuccess': 'Conversation created successfully!',
            'chat.createSessionErrEmpty': 'Please enter a conversation name.',
            'chat.settingsTitle': 'Settings',
            'chat.themeMode': 'Theme',
            'chat.themeColor': 'Color Tone',
            'theme.default': 'Classic Blue',
            'theme.sakura': 'Sakura Pink',
            'theme.grass': 'Meadow Green',
            'chat.settingsBtn': 'Settings',

            // Session Options (create / join)
            'chat.sessionOptionsTitle': 'Conversation Options',
            'chat.sessionOptionsBtn': 'Conversation Options',
            'chat.createSectionTitle': 'Create a New Conversation',
            'chat.joinSectionTitle': 'Join with Invite UUID',
            'chat.joinUuidLabel': 'Invite UUID',
            'chat.joinUuidPlaceholder': 'Paste the invite UUID...',
            'chat.joinBtn': 'Join',
            'chat.joinUuidErrEmpty': 'Please enter an invite UUID.',
            'chat.joinSuccess': 'Joined the conversation!',
            'chat.joinFailed': 'Failed to join: {reason}',
            'chat.sessionDescriptionLabel': 'Description',
            'chat.sessionDescriptionPlaceholder': 'Optional description...',

            // Session settings dialog (top-right)
            'chat.sessionSettingsBtn': 'Conversation Settings',
            'chat.sessionSettingsTitle': 'Conversation Settings',
            'chat.sessionInfoTitle': 'Conversation Info',
            'chat.sessionNameField': 'Name',
            'chat.sessionDescField': 'Description',
            'chat.sessionOwnerField': 'Owner',
            'chat.sessionIdField': 'Conversation ID',
            'chat.noDescription': 'No description',
            'chat.membersTitle': 'Members',
            'chat.memberYou': 'You',
            'chat.memberOwner': 'Owner',
            'chat.memberAdmin': 'Admin',
            'chat.removeMemberBtn': 'Remove',
            'chat.removeMemberConfirm': 'Remove this member from the conversation?',
            'chat.removeMemberSuccess': 'Member removed.',
            'chat.leaveSessionBtn': 'Leave Conversation',
            'chat.leaveConfirm': 'Leave this conversation?',
            'chat.leaveSuccess': 'You left the conversation.',
            'chat.invitesTitle': 'Invite UUIDs',
            'chat.invitesHint': 'Up to {max} invite UUIDs per conversation.',
            'chat.createInviteBtn': 'Generate UUID',
            'chat.revokeInviteBtn': 'Revoke',
            'chat.copyInviteBtn': 'Copy',
            'chat.copied': 'Copied to clipboard',
            'chat.inviteLimitReached': 'This conversation already has the maximum of {max} invite UUIDs.',
            'chat.noInvites': 'No invite UUIDs yet.',
            'chat.saveChangesBtn': 'Save Changes',
            'chat.updateSuccess': 'Conversation updated.',
            'chat.updateFailed': 'Failed to update: {reason}',
            'chat.manageSectionTitle': 'Management',
            'chat.onlyOwnerCanManageInvites': 'Only the owner can manage invite UUIDs.',
            'chat.ownerLabel': 'Owner',
            'chat.loadFailed': 'Failed to load: {reason}',
            'chat.joinErrInvalidUuid': 'This invite UUID is invalid or has expired.',
            'chat.errUnauthorized': 'Your session has expired. Please sign in again.',
            'chat.errForbidden': 'You do not have permission to do that.',
            'chat.styleSourcesTitle': 'Style Source',
            'chat.styleSourcesOpenBtn': 'Configure',
            'chat.styleSourcesHint': 'Point the interface at your own chat.html, chat.css or chat.js. Leave a field empty to use the built-in file. An address is either an https:// link or a path on this site, and may be at most {max} characters.',
            'chat.styleSourcesDefaults': 'Built-in: {html} · {css} · {js}',
            'chat.styleSourcesSaveBtn': 'Save',
            'chat.styleSourcesResetBtn': 'Reset to Default',
            'chat.styleSourcesSaved': 'Style sources updated.',
            'chat.styleSourcesSaveFailed': 'Failed to save: {reason}',
            'chat.styleSourceInvalidScheme': 'An address must start with https:// or be a path on this site, or be left empty.',
            'chat.styleSourceTooLong': 'Each address must be at most {max} characters.',
            'chat.styleSourceLoadFailed': 'The code from source "{url}" could not be loaded, so everything has been rolled back to the defaults.',
            'chat.styleSourcesRiskTitle': 'Security Warning',
            'chat.styleSourcesRiskIntro': 'Only use style sources that you control or fully trust. The files you point to replace this interface and are loaded into your browser.',
            'chat.styleSourcesRiskJs': 'An embedded chat.js runs with your login credentials. If the source is untrusted, an attacker could use it to steal your account, read your conversations, or send messages as you.',
            'chat.styleSourcesRiskAck': 'I have verified that these sources are trustworthy, and I accept the risk.',
            'chat.styleSourcesRiskConfirmBtn': 'Confirm and Save'
        },

        'zh-CN': {
            // General
            'app.title': 'Oxype',
            'common.loading': '加载中...',
            'common.error': '发生错误',
            'common.networkError': '无法连接到服务器（服务器未启动）',
            'common.language': '语言',
            'common.theme': '主题',
            'common.light': '浅色',
            'common.dark': '深色',
            'common.save': '保存',
            'common.cancel': '取消',
            'common.close': '关闭',

            // Auth / Register Page
            'auth.title': '欢迎使用 Oxype',
            'auth.tabRegister': '注册',
            'auth.tabLogin': '登录',
            'auth.usernameLabel': '用户名',
            'auth.usernamePlaceholder': '请输入用户名（1-15位字符）',
            'auth.passwordLabel': '密码',
            'auth.passwordPlaceholder': '请输入密码（6-20位字符）',
            'auth.confirmPasswordLabel': '确认密码',
            'auth.confirmPasswordPlaceholder': '请再次输入密码',
            'auth.userIdLabel': '用户 ID',
            'auth.userIdPlaceholder': '请输入数字用户 ID',
            'auth.registerBtn': '立即注册',
            'auth.loginBtn': '登 录',
            'auth.hasAccount': '已有账号？去登录',
            'auth.noAccount': '还没有账号？去注册',
            'auth.errUsernameLength': '用户名长度必须在 1 到 15 个字符之间。',
            'auth.errPasswordLength': '密码长度必须在 6 到 20 个字符之间。',
            'auth.errPasswordMismatch': '两次输入的密码不一致。',
            'auth.errUserIdRequired': '请输入有效的数字用户 ID。',
            'auth.registerSuccess': '注册成功！正在跳转...',
            'auth.loginSuccess': '登录成功！正在跳转...',
            'auth.registeredInfo': '账号已创建！您的用户 ID 为: {userId}',

            // Chat Page
            'chat.title': 'Oxype',
            'chat.sessionsTitle': '会话列表',
            'chat.noSessions': '暂无可用的会话',
            'chat.noSessionsHint': '当您加入或创建新会话后，会在此处显示。',
            'chat.selectSessionHint': '从左侧列表中选择一个会话',
            'chat.inputPlaceholder': '输入消息...',
            'chat.inputPlaceholderMarkdown': '支持 Markdown：**粗体**、`代码`、- 列表',
            'chat.formatLabel': '消息格式',
            'chat.formatText': '纯文本',
            'chat.formatMarkdown': 'Markdown',
            'chat.sendBtn': '发送',
            'chat.logoutBtn': '退出登录',
            'chat.currentUser': '当前用户: {username} (ID: {userId})',
            'chat.sessionInfo': '会话 ID: {sessionId}',
            'chat.members': '成员',
            'chat.online': '在线',
            'chat.offline': '离线',
            'chat.loadError': '从服务器加载会话失败',
            'chat.sessionNotFound': '未找到会话',
            'chat.notAuthenticated': '尚未登录，正在跳转至注册页面...',
            'chat.emptyConversation': '当前会话暂无消息。',
            'chat.newSession': '新建会话',
            'chat.createSessionTitle': '创建新会话',
            'chat.sessionNameLabel': '会话名称',
            'chat.sessionNamePlaceholder': '请输入会话名称...',
            'chat.createBtn': '创建',
            'chat.createSessionSuccess': '会话创建成功！',
            'chat.createSessionErrEmpty': '会话名称不能为空。',
            'chat.settingsTitle': '设置',
            'chat.themeMode': '主题模式',
            'chat.themeColor': '主题色调',
            'theme.default': '经典蓝',
            'theme.sakura': '樱花粉',
            'theme.grass': '青草绿',
            'chat.settingsBtn': '设置',

            // 会话选项（新建 / 加入）
            'chat.sessionOptionsTitle': '会话选项',
            'chat.sessionOptionsBtn': '会话选项',
            'chat.createSectionTitle': '新建会话',
            'chat.joinSectionTitle': '使用邀请码加入',
            'chat.joinUuidLabel': '邀请 UUID',
            'chat.joinUuidPlaceholder': '粘贴邀请 UUID...',
            'chat.joinBtn': '加入',
            'chat.joinUuidErrEmpty': '请输入邀请 UUID。',
            'chat.joinSuccess': '已加入该会话！',
            'chat.joinFailed': '加入失败：{reason}',
            'chat.sessionDescriptionLabel': '会话描述',
            'chat.sessionDescriptionPlaceholder': '可选的描述...',

            // 会话设置弹窗（右上角）
            'chat.sessionSettingsBtn': '会话设置',
            'chat.sessionSettingsTitle': '会话设置',
            'chat.sessionInfoTitle': '会话信息',
            'chat.sessionNameField': '名称',
            'chat.sessionDescField': '描述',
            'chat.sessionOwnerField': '群主',
            'chat.sessionIdField': '会话 ID',
            'chat.noDescription': '暂无描述',
            'chat.membersTitle': '成员列表',
            'chat.memberYou': '你',
            'chat.memberOwner': '群主',
            'chat.memberAdmin': '管理员',
            'chat.removeMemberBtn': '移除',
            'chat.removeMemberConfirm': '确定要将该成员移出会话吗？',
            'chat.removeMemberSuccess': '已移除成员。',
            'chat.leaveSessionBtn': '退出会话',
            'chat.leaveConfirm': '确定要退出该会话吗？',
            'chat.leaveSuccess': '您已退出该会话。',
            'chat.invitesTitle': '邀请 UUID',
            'chat.invitesHint': '每个会话最多可生成 {max} 个邀请 UUID。',
            'chat.createInviteBtn': '生成 UUID',
            'chat.revokeInviteBtn': '撤销',
            'chat.copyInviteBtn': '复制',
            'chat.copied': '已复制到剪贴板',
            'chat.inviteLimitReached': '该会话已达到 {max} 个邀请 UUID 的上限。',
            'chat.noInvites': '暂无邀请 UUID。',
            'chat.saveChangesBtn': '保存修改',
            'chat.updateSuccess': '会话已更新。',
            'chat.updateFailed': '更新失败：{reason}',
            'chat.manageSectionTitle': '管理',
            'chat.onlyOwnerCanManageInvites': '仅群主可以管理邀请 UUID。',
            'chat.ownerLabel': '群主',
            'chat.loadFailed': '加载失败：{reason}',
            'chat.joinErrInvalidUuid': '邀请 UUID 无效或已过期。',
            'chat.errUnauthorized': '登录状态已失效，请重新登录。',
            'chat.errForbidden': '您没有权限执行该操作。',
            'chat.styleSourcesTitle': '样式来源',
            'chat.styleSourcesOpenBtn': '配置',
            'chat.styleSourcesHint': '可将界面指向您自己的 chat.html、chat.css 或 chat.js。留空则使用内置文件。地址可以是 https:// 链接，也可以是本站路径，且不超过 {max} 个字符。',
            'chat.styleSourcesDefaults': '内置：{html} · {css} · {js}',
            'chat.styleSourcesSaveBtn': '保存',
            'chat.styleSourcesResetBtn': '恢复默认',
            'chat.styleSourcesSaved': '样式来源已更新。',
            'chat.styleSourcesSaveFailed': '保存失败：{reason}',
            'chat.styleSourceInvalidScheme': '地址必须以 https:// 开头，或为本站路径，或留空。',
            'chat.styleSourceTooLong': '每个地址不得超过 {max} 个字符。',
            'chat.styleSourceLoadFailed': '来源“{url}”的代码未能正常加载，已全部回退至默认',
            'chat.styleSourcesRiskTitle': '安全警告',
            'chat.styleSourcesRiskIntro': '请仅使用您自己控制或完全信任的样式来源。您指向的文件会替换当前界面，并加载到您的浏览器中。',
            'chat.styleSourcesRiskJs': '外链的 chat.js 会以您的登录凭证运行。若来源不可信，攻击者可能借此盗取您的账号、读取您的会话内容，或以您的身份发送消息。',
            'chat.styleSourcesRiskAck': '我已确认上述来源可信，并自行承担相应风险。',
            'chat.styleSourcesRiskConfirmBtn': '确认并保存'
        }
    };

    const STORAGE_KEY = 'oxype_lang';
    let currentLang = localStorage.getItem(STORAGE_KEY) || 'en';

    // Fallback if language not found
    if (!translations[currentLang]) {
        currentLang = 'en';
    }

    /**
     * I18n Manager Object
     */
    const I18n = {
        /**
         * Get available languages
         * @returns {Array<{code: string, label: string}>}
         */
        getAvailableLanguages() {
            return [
                { code: 'zh-CN', label: '简体中文' },
                { code: 'en', label: 'English' }
            ];
        },

        /**
         * Get current language code
         * @returns {string}
         */
        getCurrentLanguage() {
            return currentLang;
        },

        /**
         * Switch active language
         * @param {string} langCode 
         */
        setLanguage(langCode) {
            if (!translations[langCode]) {
                console.warn(`[i18n] Language "${langCode}" not supported. Fallback to English.`);
                langCode = 'en';
            }
            currentLang = langCode;
            try {
                localStorage.setItem(STORAGE_KEY, langCode);
            } catch (e) {
                console.error('[i18n] Failed to persist language to localStorage', e);
            }
            this.updateDom();
            window.dispatchEvent(new CustomEvent('oxype:languageChanged', { detail: { lang: langCode } }));
        },

        /**
         * Translate key with optional template parameters
         * @param {string} key 
         * @param {Object} [params] 
         * @returns {string}
         */
        t(key, params = {}) {
            const dict = translations[currentLang] || translations['en'];
            let text = dict[key] || translations['en'][key] || key;

            if (params && typeof params === 'object') {
                Object.keys(params).forEach(placeholder => {
                    text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), params[placeholder]);
                });
            }
            return text;
        },

        /**
         * Scan DOM and update elements with data-i18n and data-i18n-placeholder attributes
         * @param {HTMLElement|Document} [rootNode=document]
         */
        updateDom(rootNode = document) {
            // Update text content
            const elements = rootNode.querySelectorAll('[data-i18n]');
            elements.forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (key) {
                    el.textContent = this.t(key);
                }
            });

            // Update placeholders
            const inputs = rootNode.querySelectorAll('[data-i18n-placeholder]');
            inputs.forEach(input => {
                const key = input.getAttribute('data-i18n-placeholder');
                if (key) {
                    input.setAttribute('placeholder', this.t(key));
                }
            });

            // Update titles
            const titles = rootNode.querySelectorAll('[data-i18n-title]');
            titles.forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                if (key) {
                    el.setAttribute('title', this.t(key));
                }
            });

            // Update document language tag
            document.documentElement.lang = currentLang;
        },

        /**
         * Initialize language selector dropdown if present in DOM
         * @param {string} selector 
         */
        initLanguageSelector(selector = '#languageSelect') {
            const selectEl = document.querySelector(selector);
            if (!selectEl) return;

            selectEl.innerHTML = '';
            this.getAvailableLanguages().forEach(lang => {
                const option = document.createElement('option');
                option.value = lang.code;
                option.textContent = lang.label;
                if (lang.code === currentLang) {
                    option.selected = true;
                }
                selectEl.appendChild(option);
            });

            selectEl.addEventListener('change', (e) => {
                this.setLanguage(e.target.value);
            });
        }
    };

    // Auto-update DOM on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => I18n.updateDom());
    } else {
        I18n.updateDom();
    }

    // Export globally
    global.OxypeI18n = I18n;
})(window);
