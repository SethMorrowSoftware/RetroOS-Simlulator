/**
 * LoginScreen - Windows XP-style login/welcome screen
 *
 * Presents users with three options after boot:
 *   1. Log In   - authenticate with username/password
 *   2. Sign Up  - create a new account
 *   3. Guest    - continue anonymously
 *
 * The screen is shown between the boot sequence and the desktop.
 *
 * When the v2 backend API is available, accounts are created and
 * authenticated server-side (bcrypt, MySQL, proper sessions).
 * When no backend is available (static site mode), a lightweight
 * localStorage-based fallback is used instead.
 */

import StorageManager from './StorageManager.js';
import { getConfig, getApiVersion, getApiBasePath, getSessionToken, getAuthHeaders, setSessionToken } from './ConfigLoader.js';
import { escapeHtml } from './Sanitize.js';

class LoginScreen {
    constructor() {
        this.container = null;
        this.resolve = null;
    }

    /**
     * Show the login screen and wait for user action.
     * @returns {Promise<{mode: string, username: string}>}
     */
    show() {
        this.container = document.getElementById('loginScreen');
        return new Promise((resolve) => {
            this.resolve = resolve;
            this._render();
            this.container.classList.add('active');
        });
    }

    // ── Rendering ───────────────────────────────────────────

    _render() {
        const osName = getConfig('branding.osName', 'IlluminatOS!');
        // Use global storage for login data — must be accessible before user scope is set
        const savedUser = StorageManager.getGlobal('currentUser', null);

        this.container.innerHTML = `
            <div class="login-screen-bg">
                <div class="login-top-bar">
                    <div class="login-top-bar-text">To begin, click your user name</div>
                </div>
                <div class="login-center">
                    <div class="login-left-panel">
                        <div class="login-branding">
                            <div class="login-os-logo">${escapeHtml(osName)}</div>
                        </div>
                    </div>
                    <div class="login-divider"></div>
                    <div class="login-right-panel">
                        <div class="login-user-list" id="loginUserList">
                            ${savedUser ? this._renderSavedUser(savedUser) : ''}
                            <button class="login-user-tile" id="loginTileGuest">
                                <div class="login-user-avatar">
                                    <i class="fa-solid fa-user-astronaut"></i>
                                </div>
                                <div class="login-user-info">
                                    <div class="login-user-name">Guest</div>
                                    <div class="login-user-hint">Continue without an account</div>
                                </div>
                                <div class="login-user-arrow"><i class="fa-solid fa-chevron-right"></i></div>
                            </button>
                            <button class="login-user-tile" id="loginTileLogin">
                                <div class="login-user-avatar login-avatar-login">
                                    <i class="fa-solid fa-right-to-bracket"></i>
                                </div>
                                <div class="login-user-info">
                                    <div class="login-user-name">Log In</div>
                                    <div class="login-user-hint">Sign in with your account</div>
                                </div>
                                <div class="login-user-arrow"><i class="fa-solid fa-chevron-right"></i></div>
                            </button>
                            <button class="login-user-tile" id="loginTileSignup">
                                <div class="login-user-avatar login-avatar-signup">
                                    <i class="fa-solid fa-user-plus"></i>
                                </div>
                                <div class="login-user-info">
                                    <div class="login-user-name">Create Account</div>
                                    <div class="login-user-hint">Set up a new user profile</div>
                                </div>
                                <div class="login-user-arrow"><i class="fa-solid fa-chevron-right"></i></div>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="login-bottom-bar">
                    <div class="login-power-options">
                        <span class="login-power-icon"><i class="fa-solid fa-power-off"></i></span>
                        <span class="login-power-text">Turn off computer</span>
                    </div>
                    <div class="login-bottom-right">
                        After you log on, you can add or change accounts.<br>
                        Just go to Control Panel and click User Accounts.
                    </div>
                </div>
            </div>

            <!-- Login Form (hidden by default) -->
            <div class="login-form-overlay" id="loginFormOverlay">
                <div class="login-form-panel">
                    <div class="login-form-title" id="loginFormTitle">Log In</div>
                    <div class="login-form-body">
                        <div class="login-form-avatar">
                            <i class="fa-solid fa-user-lock" id="loginFormIcon"></i>
                        </div>
                        <div class="login-form-fields">
                            <div class="form-group">
                                <label for="loginUsername">Username</label>
                                <input type="text" id="loginUsername" placeholder="Enter your username" autocomplete="username" maxlength="64" />
                            </div>
                            <div class="form-group" id="loginPasswordGroup">
                                <label for="loginPassword">Password</label>
                                <input type="password" id="loginPassword" placeholder="Enter your password" autocomplete="current-password" maxlength="64" />
                            </div>
                            <div class="form-group" id="loginConfirmGroup" style="display:none;">
                                <label for="loginConfirmPassword">Confirm Password</label>
                                <input type="password" id="loginConfirmPassword" placeholder="Confirm your password" autocomplete="new-password" maxlength="64" />
                            </div>
                            <div class="login-form-error" id="loginFormError"></div>
                            <div class="login-form-actions">
                                <button class="btn btn-primary" id="loginFormSubmit">Log In</button>
                                <button class="btn" id="loginFormCancel">Back</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this._bind();
    }

    _renderSavedUser(user) {
        return `
            <button class="login-user-tile login-user-tile-saved" id="loginTileSaved">
                <div class="login-user-avatar login-avatar-saved">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div class="login-user-info">
                    <div class="login-user-name">${escapeHtml(user.username)}</div>
                    <div class="login-user-hint">Welcome back</div>
                </div>
                <div class="login-user-arrow"><i class="fa-solid fa-chevron-right"></i></div>
            </button>
        `;
    }

    // ── Event Binding ───────────────────────────────────────

    _bind() {
        document.getElementById('loginTileGuest')
            ?.addEventListener('click', () => this._finishAs('guest', 'Guest'));

        document.getElementById('loginTileLogin')
            ?.addEventListener('click', () => this._showForm('login'));

        document.getElementById('loginTileSignup')
            ?.addEventListener('click', () => this._showForm('signup'));

        const savedTile = document.getElementById('loginTileSaved');
        if (savedTile) {
            savedTile.addEventListener('click', () => {
                const savedUser = StorageManager.getGlobal('currentUser', null);
                this._showForm('login', savedUser?.username);
            });
        }

        document.getElementById('loginFormCancel')
            ?.addEventListener('click', () => this._hideForm());

        document.getElementById('loginFormSubmit')
            ?.addEventListener('click', () => this._handleSubmit());

        // Enter key submits
        ['loginUsername', 'loginPassword', 'loginConfirmPassword'].forEach(id => {
            document.getElementById(id)?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._handleSubmit();
            });
        });
    }

    // ── Form Overlay ────────────────────────────────────────

    _showForm(mode, prefillUsername = '') {
        this._formMode = mode;
        const overlay = document.getElementById('loginFormOverlay');
        const title = document.getElementById('loginFormTitle');
        const icon = document.getElementById('loginFormIcon');
        const confirmGroup = document.getElementById('loginConfirmGroup');
        const submitBtn = document.getElementById('loginFormSubmit');
        const usernameInput = document.getElementById('loginUsername');
        const passwordInput = document.getElementById('loginPassword');

        document.getElementById('loginFormError').textContent = '';

        if (mode === 'signup') {
            title.textContent = 'Create Account';
            icon.className = 'fa-solid fa-user-plus';
            confirmGroup.style.display = '';
            submitBtn.textContent = 'Create Account';
            passwordInput.autocomplete = 'new-password';
        } else {
            title.textContent = 'Log In';
            icon.className = 'fa-solid fa-user-lock';
            confirmGroup.style.display = 'none';
            submitBtn.textContent = 'Log In';
            passwordInput.autocomplete = 'current-password';
        }

        usernameInput.value = prefillUsername || '';
        passwordInput.value = '';
        document.getElementById('loginConfirmPassword').value = '';

        overlay.classList.add('active');
        (prefillUsername ? passwordInput : usernameInput).focus();
    }

    _hideForm() {
        document.getElementById('loginFormOverlay').classList.remove('active');
    }

    // ── Validation & Submit ─────────────────────────────────

    _handleSubmit() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const errorEl = document.getElementById('loginFormError');

        errorEl.textContent = '';

        if (!username) { errorEl.textContent = 'Please enter a username.'; return; }
        if (username.length < 2) { errorEl.textContent = 'Username must be at least 2 characters.'; return; }
        if (!password) { errorEl.textContent = 'Please enter a password.'; return; }

        if (this._formMode === 'signup') {
            if (password.length < 8) { errorEl.textContent = 'Password must be at least 8 characters.'; return; }
            if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
                errorEl.textContent = 'Password must contain a lowercase letter, an uppercase letter, and a number.';
                return;
            }
            const confirm = document.getElementById('loginConfirmPassword').value;
            if (password !== confirm) { errorEl.textContent = 'Passwords do not match.'; return; }
            this._doSignup(username, password);
        } else {
            this._doLogin(username, password);
        }
    }

    // ── API Methods ─────────────────────────────────────────

    /**
     * Determine if we should use the server API.
     */
    _hasBackendAuth() {
        return getApiVersion() >= 2;
    }

    /**
     * Log in — server API or localStorage fallback.
     */
    async _doLogin(username, password) {
        const errorEl = document.getElementById('loginFormError');
        const submitBtn = document.getElementById('loginFormSubmit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Logging in...';

        try {
            if (this._hasBackendAuth()) {
                await this._apiLogin(username, password);
            } else {
                this._localLogin(username, password);
            }
        } catch (err) {
            errorEl.textContent = err.message;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Log In';
        }
    }

    /**
     * Sign up — server API or localStorage fallback.
     */
    async _doSignup(username, password) {
        const errorEl = document.getElementById('loginFormError');
        const submitBtn = document.getElementById('loginFormSubmit');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';

        try {
            if (this._hasBackendAuth()) {
                await this._apiRegister(username, password);
            } else {
                this._localSignup(username, password);
            }
        } catch (err) {
            errorEl.textContent = err.message;
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
        }
    }

    // ── Server API (v2) ─────────────────────────────────────

    /**
     * POST /api/v2/auth/login
     */
    async _apiLogin(displayName, password) {
        const basePath = getApiBasePath();
        const resp = await fetch(`${basePath}api/v2/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({ displayName, password }),
        });

        let data;
        try { data = await resp.json(); } catch (_) { data = {}; }

        if (!resp.ok) {
            if (resp.status === 429) {
                throw new Error(`Too many attempts. Try again in ${data.retryAfter || 60} seconds.`);
            }
            throw new Error(data.error || 'Invalid username or password.');
        }

        // Update session token so subsequent API calls use the new identity
        setSessionToken(data.token);

        this._finishAs('login', data.user.display_name || displayName, {
            userUuid: data.user.uuid || null,
        });
    }

    /**
     * POST /api/v2/auth/register
     * Upgrades the current anonymous session into a registered account.
     */
    async _apiRegister(displayName, password) {
        const basePath = getApiBasePath();
        const resp = await fetch(`${basePath}api/v2/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
            },
            body: JSON.stringify({ displayName, password }),
        });

        let data;
        try { data = await resp.json(); } catch (_) { data = {}; }

        if (!resp.ok) {
            throw new Error(data.error || 'Could not create account.');
        }

        this._finishAs('signup', data.user.display_name || displayName, {
            userUuid: data.user.uuid || null,
        });
    }

    // ── localStorage Fallback (no backend) ──────────────────

    _localLogin(username, password) {
        const users = StorageManager.getGlobal('registeredUsers', {});
        const record = users[username.toLowerCase()];

        if (!record) {
            throw new Error('Account not found. Try creating one first.');
        }
        if (record.passwordHash !== this._simpleHash(password)) {
            throw new Error('Incorrect password. Please try again.');
        }

        this._finishAs('login', record.displayName);
    }

    _localSignup(username, password) {
        const users = StorageManager.getGlobal('registeredUsers', {});
        const key = username.toLowerCase();

        if (users[key]) {
            throw new Error('That username is already taken.');
        }

        users[key] = {
            displayName: username,
            passwordHash: this._simpleHash(password),
            createdAt: Date.now(),
        };

        StorageManager.setGlobal('registeredUsers', users);
        this._finishAs('signup', username);
    }

    // ── Completion ──────────────────────────────────────────

    _finishAs(mode, username, options = {}) {
        if (mode !== 'guest') {
            StorageManager.setGlobal('currentUser', {
                username,
                mode,
                userUuid: options.userUuid || null,
                lastLogin: Date.now()
            });
        } else {
            // Don't clear currentUser for guest — leave last logged-in user visible on next boot
        }

        this.container.classList.add('fade-out');
        setTimeout(() => {
            this.container.classList.remove('active', 'fade-out');
            this.container.innerHTML = '';
        }, 500);

        this.resolve({ mode, username, userUuid: options.userUuid || null });
    }

    // ── Utilities ───────────────────────────────────────────

    /**
     * Simple non-cryptographic hash — used only in the localStorage
     * fallback when no backend is available.
     */
    _simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return 'h_' + Math.abs(hash).toString(36);
    }

}

export default new LoginScreen();
