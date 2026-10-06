/**
 * Oxype Web Client - Style and Theme Controller Module
 * Controls application styling, theme switching (dark/light), and UI toast notifications.
 */

(function (global) {
    'use strict';

    const STORAGE_KEY_THEME = 'oxype_theme';
    const STORAGE_KEY_ACCENT = 'oxype_accent';

    class StyleController {
        constructor() {
            this.theme = this.getInitialTheme();
            this.accent = this.getInitialAccent();
            this.applyTheme(this.theme);
            this.applyAccent(this.accent);
        }

        /**
         * Determine initial theme preference from localStorage or system OS preference
         * @returns {'light'|'dark'}
         */
        getInitialTheme() {
            const saved = localStorage.getItem(STORAGE_KEY_THEME);
            if (saved === 'dark' || saved === 'light') {
                return saved;
            }
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
            return 'light';
        }

        /**
         * Determine initial accent tone from localStorage
         * @returns {'default'|'sakura'|'grass'}
         */
        getInitialAccent() {
            const saved = localStorage.getItem(STORAGE_KEY_ACCENT);
            if (saved === 'sakura' || saved === 'grass' || saved === 'default') {
                return saved;
            }
            return 'default';
        }

        /**
         * Apply accent tone to root document
         * @param {'default'|'sakura'|'grass'} accent 
         */
        applyAccent(accent) {
            this.accent = accent;
            if (accent === 'default') {
                document.documentElement.removeAttribute('data-accent');
            } else {
                document.documentElement.setAttribute('data-accent', accent);
            }
            try {
                localStorage.setItem(STORAGE_KEY_ACCENT, accent);
            } catch (e) {
                console.error('[StyleController] Failed to persist accent tone preference', e);
            }
            this.syncAccentSelectors();
            window.dispatchEvent(new CustomEvent('oxype:accentChanged', { detail: { accent } }));
        }

        /**
         * Initialize accent tone selector dropdown
         * @param {string} selector 
         */
        initAccentSelector(selector) {
            const el = document.querySelector(selector);
            if (!el) return;

            const accents = [
                { id: 'default', key: 'theme.default', fallback: 'Classic Blue' },
                { id: 'sakura', key: 'theme.sakura', fallback: 'Sakura Pink' },
                { id: 'grass', key: 'theme.grass', fallback: 'Meadow Green' }
            ];

            const populateOptions = () => {
                const current = this.accent;
                el.innerHTML = accents.map(acc => {
                    const label = window.OxypeI18n ? window.OxypeI18n.t(acc.key) : acc.fallback;
                    return `<option value="${acc.id}" ${acc.id === current ? 'selected' : ''}>${label}</option>`;
                }).join('');
            };

            populateOptions();

            el.addEventListener('change', (e) => {
                this.applyAccent(e.target.value);
            });

            // Re-populate when language changes
            window.addEventListener('oxype:languageChanged', () => {
                populateOptions();
            });
        }

        /**
         * Synchronize accent selector dropdowns in DOM
         */
        syncAccentSelectors() {
            const selects = document.querySelectorAll('#colorThemeSelect, .color-theme-select');
            selects.forEach(select => {
                if (select.value !== this.accent) {
                    select.value = this.accent;
                }
            });
        }

        /**
         * Apply theme to root document
         * @param {'light'|'dark'} theme 
         */
        applyTheme(theme) {
            this.theme = theme;
            document.documentElement.setAttribute('data-theme', theme);
            try {
                localStorage.setItem(STORAGE_KEY_THEME, theme);
            } catch (e) {
                console.error('[StyleController] Failed to persist theme preference', e);
            }
            this.updateThemeButtons();
            this.syncThemeModeSelectors();
            window.dispatchEvent(new CustomEvent('oxype:themeChanged', { detail: { theme } }));
        }

        /**
         * Initialize theme mode selector dropdown (Light / Dark)
         * @param {string} selector 
         */
        initThemeModeSelector(selector) {
            const el = document.querySelector(selector);
            if (!el) return;

            const modes = [
                { id: 'light', key: 'common.light', fallback: 'Light' },
                { id: 'dark', key: 'common.dark', fallback: 'Dark' }
            ];

            const populateOptions = () => {
                const current = this.theme;
                el.innerHTML = modes.map(m => {
                    const label = window.OxypeI18n ? window.OxypeI18n.t(m.key) : m.fallback;
                    return `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${label}</option>`;
                }).join('');
            };

            populateOptions();

            el.addEventListener('change', (e) => {
                this.applyTheme(e.target.value);
            });

            // Re-populate text when language changes
            window.addEventListener('oxype:languageChanged', () => {
                populateOptions();
            });
        }

        /**
         * Synchronize theme mode dropdowns across document
         */
        syncThemeModeSelectors() {
            const selects = document.querySelectorAll('#themeModeSelect, .theme-mode-select');
            selects.forEach(select => {
                if (select.value !== this.theme) {
                    select.value = this.theme;
                }
            });
        }

        /**
         * Toggle between dark and light themes
         */
        toggleTheme() {
            const nextTheme = this.theme === 'dark' ? 'light' : 'dark';
            this.applyTheme(nextTheme);
        }

        /**
         * SVG icon definitions for Sun and Moon
         */
        static get SUN_SVG() {
            return `<svg class="icon-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
        }

        static get MOON_SVG() {
            return `<svg class="icon-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
        }

        /**
         * Sync theme button labels/icons
         */
        updateThemeButtons() {
            const buttons = document.querySelectorAll('.theme-toggle-btn');
            const isDark = this.theme === 'dark';
            buttons.forEach(btn => {
                const icon = btn.querySelector('.theme-icon');
                const label = btn.querySelector('.theme-label');
                if (icon) {
                    icon.innerHTML = isDark ? StyleController.SUN_SVG : StyleController.MOON_SVG;
                }
                if (label) {
                    label.textContent = isDark ? (window.OxypeI18n ? window.OxypeI18n.t('common.light') : 'Light') : (window.OxypeI18n ? window.OxypeI18n.t('common.dark') : 'Dark');
                }
            });
        }

        /**
         * Show toast notification on screen
         * @param {string} message 
         * @param {'info'|'success'|'error'|'warning'} [type='info'] 
         * @param {number} [duration=3500] 
         */
        showToast(message, type = 'info', duration = 3500) {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                document.body.appendChild(container);
            }

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;

            container.appendChild(toast);

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, duration);
        }

        /**
         * Bind theme switcher buttons across document
         */
        initThemeToggle() {
            const buttons = document.querySelectorAll('.theme-toggle-btn');
            buttons.forEach(btn => {
                if (btn.dataset.themeBound) return;
                btn.dataset.themeBound = 'true';
                btn.addEventListener('click', () => {
                    this.toggleTheme();
                });
            });
            this.updateThemeButtons();
        }
    }

    // Export singleton
    global.OxypeStyle = new StyleController();

    // Setup listener when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => global.OxypeStyle.initThemeToggle());
    } else {
        global.OxypeStyle.initThemeToggle();
    }
})(window);
