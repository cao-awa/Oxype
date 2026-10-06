/**
 * Oxype Web Client - Registration and Authentication Page Logic
 * Manages form interactions, validation, API submission, and post-auth redirect.
 */

(function () {
    'use strict';

    // DOM Elements
    let tabRegisterBtn;
    let tabLoginBtn;
    let registerForm;
    let loginForm;
    let errorBanner;
    let infoBanner;
    let switchLink;

    let activeTab = 'register'; // 'register' or 'login'

    /**
     * Initialize auth page logic after DOM is ready
     */
    function init() {
        tabRegisterBtn = document.getElementById('tabRegister');
        tabLoginBtn = document.getElementById('tabLogin');
        registerForm = document.getElementById('registerForm');
        loginForm = document.getElementById('loginForm');
        errorBanner = document.getElementById('authErrorBanner');
        infoBanner = document.getElementById('authInfoBanner');
        switchLink = document.getElementById('authSwitchLink');

        // Check if user already holds stored credentials in localStorage
        if (window.OxypeCore && window.OxypeCore.isAuthenticated()) {
            const auth = window.OxypeCore.getStoredAuth();
            if (auth && auth.userId && auth.token) {
                // Verify token validity via POST /isAlive/{userid}
                window.OxypeCore.isAlive(auth.userId, auth.token).then(isValid => {
                    if (isValid !== false) {
                        // Token is valid, automatically redirect to chat interface
                        redirectToChat();
                    } else {
                        // Token expired or explicitly invalid, clear credentials and remain on auth page
                        console.warn('[Auth] Stored token is invalid, clearing auth.');
                        window.OxypeCore.clearAuth();
                    }
                }).catch(() => {
                    redirectToChat();
                });
            }
        }

        // Initialize i18n language selector
        if (window.OxypeI18n) {
            window.OxypeI18n.initLanguageSelector('#languageSelect');
        }

        // Initialize theme color tone selector
        if (window.OxypeStyle) {
            window.OxypeStyle.initAccentSelector('#colorThemeSelect');
        }

        // Bind events
        bindEvents();
    }

    /**
     * Attach form submission and tab switching handlers
     */
    function bindEvents() {
        // Tab click handlers
        if (tabRegisterBtn) {
            tabRegisterBtn.addEventListener('click', () => switchTab('register'));
        }
        if (tabLoginBtn) {
            tabLoginBtn.addEventListener('click', () => switchTab('login'));
        }
        if (switchLink) {
            switchLink.addEventListener('click', (e) => {
                e.preventDefault();
                switchTab(activeTab === 'register' ? 'login' : 'register');
            });
        }

        // Registration form submission
        if (registerForm) {
            registerForm.addEventListener('submit', handleRegisterSubmit);
        }

        // Login form submission
        if (loginForm) {
            loginForm.addEventListener('submit', handleLoginSubmit);
        }
    }

    /**
     * Switch between Register and Login tabs
     * @param {'register'|'login'} tab 
     */
    function switchTab(tab) {
        activeTab = tab;
        hideBanners();

        if (tab === 'register') {
            tabRegisterBtn.classList.add('active');
            tabLoginBtn.classList.remove('active');
            registerForm.style.display = 'flex';
            loginForm.style.display = 'none';
            if (switchLink) {
                switchLink.setAttribute('data-i18n', 'auth.hasAccount');
            }
        } else {
            tabLoginBtn.classList.add('active');
            tabRegisterBtn.classList.remove('active');
            loginForm.style.display = 'flex';
            registerForm.style.display = 'none';
            if (switchLink) {
                switchLink.setAttribute('data-i18n', 'auth.noAccount');
            }
        }

        if (window.OxypeI18n) {
            window.OxypeI18n.updateDom();
        }
    }

    /**
     * Handle registration form submission
     * @param {Event} e 
     */
    async function handleRegisterSubmit(e) {
        e.preventDefault();
        hideBanners();

        const usernameInput = document.getElementById('regUsername');
        const passwordInput = document.getElementById('regPassword');
        const confirmPasswordInput = document.getElementById('regConfirmPassword');
        const submitBtn = registerForm.querySelector('button[type="submit"]');

        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        // Front-end validation matching Oxype server rules
        if (!username || username.length > 15) {
            showError(getI18nText('auth.errUsernameLength', 'Username must be between 1 and 15 characters.'));
            usernameInput.focus();
            return;
        }

        if (password.length < 6 || password.length > 20) {
            showError(getI18nText('auth.errPasswordLength', 'Password must be between 6 and 20 characters.'));
            passwordInput.focus();
            return;
        }

        if (password !== confirmPassword) {
            showError(getI18nText('auth.errPasswordMismatch', 'Passwords do not match.'));
            confirmPasswordInput.focus();
            return;
        }

        // Disable submit button during request
        setButtonLoading(submitBtn, true);

        try {
            // Send register request to Oxype backend (/register)
            const result = await window.OxypeCore.register(username, password);

            // Successfully registered and received token
            showInfo(getI18nText('auth.registerSuccess', 'Registration successful! Redirecting to chat...'));

            if (window.OxypeStyle) {
                window.OxypeStyle.showToast(
                    getI18nText('auth.registeredInfo', `Account created! User ID: ${result.userid}`, { userId: result.userid }),
                    'success'
                );
            }

            // Redirect automatically to chat page
            setTimeout(() => {
                redirectToChat();
            }, 1200);
        } catch (err) {
            console.error('[Register] Request failed:', err);
            const message = err.isOffline
                ? getI18nText('common.networkError', 'Unable to connect to server (Server offline)')
                : (err.message || getI18nText('common.error', 'An error occurred'));
            showError(message);
        } finally {
            setButtonLoading(submitBtn, false);
        }
    }

    /**
     * Handle login form submission
     * @param {Event} e 
     */
    async function handleLoginSubmit(e) {
        e.preventDefault();
        hideBanners();

        const userIdInput = document.getElementById('loginUserId');
        const passwordInput = document.getElementById('loginPassword');
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        const userId = userIdInput.value.trim();
        const password = passwordInput.value;

        if (!userId || isNaN(userId)) {
            showError(getI18nText('auth.errUserIdRequired', 'Please enter a valid numeric User ID.'));
            userIdInput.focus();
            return;
        }

        if (!password) {
            showError(getI18nText('auth.errPasswordLength', 'Password must be between 6 and 20 characters.'));
            passwordInput.focus();
            return;
        }

        setButtonLoading(submitBtn, true);

        try {
            // Send login request to Oxype backend (/login/{loginUser})
            await window.OxypeCore.login(userId, password);

            showInfo(getI18nText('auth.loginSuccess', 'Login successful! Redirecting to chat...'));

            setTimeout(() => {
                redirectToChat();
            }, 1000);
        } catch (err) {
            console.error('[Login] Request failed:', err);
            const message = err.isOffline
                ? getI18nText('common.networkError', 'Unable to connect to server (Server offline)')
                : (err.message || getI18nText('common.error', 'An error occurred'));
            showError(message);
        } finally {
            setButtonLoading(submitBtn, false);
        }
    }

    /**
     * Redirect to the chat interface
     */
    function redirectToChat() {
        window.location.href = 'chat.html';
    }

    /**
     * Helper to get translated string or fallback
     * @param {string} key 
     * @param {string} fallback 
     * @param {Object} [params] 
     * @returns {string}
     */
    function getI18nText(key, fallback, params) {
        if (window.OxypeI18n) {
            return window.OxypeI18n.t(key, params);
        }
        return fallback;
    }

    /**
     * Toggle button loading state
     * @param {HTMLButtonElement} btn 
     * @param {boolean} isLoading 
     */
    function setButtonLoading(btn, isLoading) {
        if (!btn) return;
        btn.disabled = isLoading;
        if (isLoading) {
            btn.dataset.originalText = btn.textContent;
            btn.textContent = getI18nText('common.loading', 'Loading...');
        } else if (btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
    }

    function showError(message) {
        if (!errorBanner) return;
        errorBanner.textContent = message;
        errorBanner.classList.add('visible');
    }

    function showInfo(message) {
        if (!infoBanner) return;
        infoBanner.textContent = message;
        infoBanner.classList.add('visible');
    }

    function hideBanners() {
        if (errorBanner) errorBanner.classList.remove('visible');
        if (infoBanner) infoBanner.classList.remove('visible');
    }

    // Attach initializer
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
