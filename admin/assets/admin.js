/**
 * IlluminatOS! Admin Panel JavaScript
 * Handles authentication, config loading, section editing, and saving.
 * Enhanced with v2 API support for user management, webhooks, themes, etc.
 */

import { renderDashboard, initDashboard } from './components/Dashboard.js';
import { renderUserManager, initUserManager } from './components/UserManager.js';
import { renderWebhookManager, initWebhookManager } from './components/WebhookManager.js';
import { renderThemeCreator, initThemeCreator } from './components/ThemeCreator.js';
import { renderAnnouncementManager, initAnnouncementManager } from './components/AnnouncementManager.js';
import { renderAuditLogViewer, initAuditLogViewer } from './components/AuditLogViewer.js';
import { renderBackendControlManager, initBackendControlManager } from './components/BackendControlManager.js';
import { renderCommandCenter, initCommandCenter, renderMediaLibraryManager, initMediaLibrarySection } from './components/CommandCenter.js';
import { renderLiveUsers, initLiveUsers, destroyLiveUsers } from './components/LiveUsers.js';
import { renderAnalyticsDashboard, initAnalyticsDashboard, destroyAnalyticsDashboard } from './components/AnalyticsDashboard.js';
import { renderAutoexecEditor, initAutoexecEditor, destroyAutoexecEditor } from './components/AutoexecEditor.js';
import { renderTroubleshootingPanel, initTroubleshootingPanel } from './components/TroubleshootingPanel.js';
import { renderCampaignManager, initCampaignManager } from './components/CampaignManager.js';
import { renderTimelineManager, initTimelineManager } from './components/TimelineManager.js';
import { escHtml } from './sanitize.js';

/**
 * Derive API base path from the current page URL.
 * admin/index.php is always one level below the deployment root,
 * so we strip the '/admin/...' suffix to get the base.
 */
function getAdminApiBasePath() {
    const path = window.location.pathname;
    const adminIdx = path.indexOf('/admin');
    if (adminIdx !== -1) {
        return path.substring(0, adminIdx + 1);
    }
    // Fallback: assume root
    const lastSlash = path.lastIndexOf('/');
    return path.substring(0, lastSlash + 1);
}

const API_BASE = getAdminApiBasePath();
const API = {
    config: `${API_BASE}api/config.php`,
    save: `${API_BASE}api/save.php`,
    auth: `${API_BASE}api/auth.php`
};

// V2 API client for new backend features
let v2Available = false;
let v2Token = sessionStorage.getItem('v2Token') || null;
const V2_BASE = `${API_BASE}api/v2`;

async function requestV2(path, options = {}) {
    const headers = {
        'Accept': 'application/json',
        // CSRF sentinel: required by v2 API on mutating requests.
        // Cross-origin requests cannot set custom headers without preflight,
        // so its presence proves the request originated from same-origin code.
        'X-Requested-With': 'XMLHttpRequest',
        ...(options.headers || {})
    };

    if (v2Token) {
        headers['Authorization'] = `Bearer ${v2Token}`;
    }

    const resp = await fetch(V2_BASE + path, {
        ...options,
        headers
    });

    const contentType = resp.headers.get('content-type') || '';
    const rawBody = await resp.text();
    let data = null;

    if (rawBody) {
        if (contentType.includes('application/json')) {
            try {
                data = JSON.parse(rawBody);
            } catch (err) {
                throw new Error(`Invalid JSON response from ${path} (HTTP ${resp.status})`);
            }
        } else {
            const trimmed = rawBody.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                try {
                    data = JSON.parse(trimmed);
                } catch {
                    data = null;
                }
            }
        }
    }

    if (!resp.ok) {
        const serverError = data?.error;
        if (serverError) {
            throw new Error(serverError);
        }

        const preview = rawBody
            .replace(/\s+/g, ' ')
            .slice(0, 160);
        throw new Error(`HTTP ${resp.status} from ${path}. Non-JSON response: ${preview || '<empty>'}`);
    }

    return data || {};
}

const v2Api = {
    get(path) {
        return requestV2(path);
    },
    post(path, body) {
        return requestV2(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    },
    put(path, body) {
        return requestV2(path, {
            // Some shared hosts/proxies block PUT/DELETE with 403.
            // Tunnel via POST + method override for broad compatibility.
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-HTTP-Method-Override': 'PUT'
            },
            body: JSON.stringify(body)
        });
    },
    delete(path) {
        // Some shared hosts/proxies block PUT/DELETE with 403.
        // Tunnel via POST + method override for broad compatibility.
        return requestV2(path, {
            method: 'POST',
            headers: { 'X-HTTP-Method-Override': 'DELETE' }
        });
    }
};

let config = {};
let csrfToken = '';
let currentSection = 'dashboard';
let hasUnsavedChanges = false;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    // Try to initialize v2 API
    try {
        const health = await fetch(V2_BASE + '/system/health');
        if (health.ok) {
            v2Available = true;
            console.log('[Admin] v2 API available');
        }
    } catch (e) {
        console.log('[Admin] v2 API not available, using legacy mode');
    }

    // Check auth state (legacy v1)
    try {
        const authResp = await apiPost(API.auth, { action: 'check' });
        if (authResp.authenticated) {
            csrfToken = authResp.csrfToken;

            // Verify stored v2 token is still valid
            if (v2Available && v2Token) {
                try {
                    const check = await v2Api.get('/auth/check');
                    if (!check.authenticated) {
                        v2Token = null;
                        sessionStorage.removeItem('v2Token');
                    }
                } catch (e) {
                    v2Token = null;
                    sessionStorage.removeItem('v2Token');
                }
            }

            showDashboard();
            await loadConfig();
        }
    } catch (e) {
        // Not authenticated, show login
    }

    setupLoginForm();
    setupNavigation();
    setupHeaderButtons();
});

// ===== AUTH =====
function setupLoginForm() {
    const form = document.getElementById('loginForm');
    form?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('loginError');

        try {
            const resp = await apiPost(API.auth, { action: 'login', password });
            if (resp.success) {
                csrfToken = resp.csrfToken;

                // Also authenticate with v2 API as the superadmin
                if (v2Available) {
                    try {
                        // Look up the superadmin's display name from the DB
                        const identity = await apiPost(API.auth, { action: 'admin-identity' });
                        const adminName = identity.displayName || 'admin';
                        const v2Login = await v2Api.post('/auth/login', {
                            displayName: adminName,
                            password: password
                        });
                        v2Token = v2Login.token;
                        sessionStorage.setItem('v2Token', v2Token);
                    } catch (e) {
                        console.warn('[Admin] v2 login failed:', e.message);
                    }
                }

                showDashboard();
                await loadConfig();
                if (resp.forcePasswordChange) {
                    currentSection = 'password';
                    renderSection();
                    setStatus('Please change the default password');
                }
            }
        } catch (err) {
            errorEl.textContent = err.message || 'Login failed';
            errorEl.classList.remove('hidden');
        }
    });
}

function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('dashboard').classList.add('hidden');
}

// ===== CONFIG LOADING =====
async function loadConfig() {
    try {
        // When v2 is available and authenticated, load config from the same
        // backend source used by the main OS to avoid v1/v2 drift.
        if (v2Available && v2Token) {
            config = await v2Api.get('/config');
        } else {
            const resp = await fetch(API.config);
            if (!resp.ok) {
                setStatus('Failed to load config', true);
                return;
            }
            config = await resp.json();
        }

        setStatus('Configuration loaded');
        renderSection();
    } catch (err) {
        setStatus('Error loading config: ' + err.message, true);
    }
}

// ===== NAVIGATION =====
function setupNavigation() {
    document.getElementById('sectionNav')?.addEventListener('click', (e) => {
        const li = e.target.closest('li[data-section]');
        if (!li) return;

        document.querySelectorAll('#sectionNav li').forEach(l => l.classList.remove('active'));
        li.classList.add('active');
        currentSection = li.dataset.section;
        renderSection();
    });
}

function setupHeaderButtons() {
    document.getElementById('btnSaveAll')?.addEventListener('click', saveCurrentSection);
    document.getElementById('btnLogout')?.addEventListener('click', async () => {
        if (v2Available && v2Token) {
            try { await v2Api.post('/auth/logout', {}); } catch (e) { console.error('[Admin] v2 logout failed:', e); }
            v2Token = null;
            sessionStorage.removeItem('v2Token');
        }
        await apiPost(API.auth, { action: 'logout' });
        showLogin();
    });
}

// ===== SECTION RENDERING =====
// v2 sections that use component modules
// Track active section for cleanup
let activeSectionCleanup = null;

const v2Sections = {
    dashboard: { render: renderDashboard, init: initDashboard },
    users: { render: renderUserManager, init: initUserManager },
    webhooks: { render: renderWebhookManager, init: initWebhookManager },
    themes: { render: renderThemeCreator, init: initThemeCreator },
    announcements: { render: renderAnnouncementManager, init: initAnnouncementManager },
    audit: { render: renderAuditLogViewer, init: initAuditLogViewer },
    backendControl: { render: renderBackendControlManager, init: initBackendControlManager },
    mediaLibrary: { render: renderMediaLibraryManager, init: initMediaLibrarySection },
    commandCenter: { render: renderCommandCenter, init: initCommandCenter },
    liveUsers: { render: renderLiveUsers, init: initLiveUsers, destroy: destroyLiveUsers },
    analytics: { render: renderAnalyticsDashboard, init: initAnalyticsDashboard, destroy: destroyAnalyticsDashboard },
    autoexecEditor: { render: renderAutoexecEditor, init: initAutoexecEditor, destroy: destroyAutoexecEditor },
    troubleshooting: { render: renderTroubleshootingPanel, init: initTroubleshootingPanel },
    campaigns: { render: renderCampaignManager, init: initCampaignManager },
    timeline: { render: renderTimelineManager, init: initTimelineManager },
};

function renderSection() {
    const content = document.getElementById('editorContent');
    if (!content) return;

    // Cleanup previous section if it has a destroy handler
    if (activeSectionCleanup) {
        activeSectionCleanup();
        activeSectionCleanup = null;
    }

    // Check if this is a v2 component section
    if (v2Sections[currentSection]) {
        if (!v2Available) {
            content.innerHTML = `
                <div class="section-editor">
                    <h2>${escHtml(currentSection.charAt(0).toUpperCase() + currentSection.slice(1))}</h2>
                    <div class="card">
                        <p class="text-muted">This feature requires the v2 backend API.</p>
                        <p class="text-muted">Set up the MySQL database and configure <code>backend/env.php</code> to enable.</p>
                    </div>
                </div>`;
            return;
        }

        if (!v2Token) {
            content.innerHTML = `
                <div class="section-editor">
                    <h2>${escHtml(currentSection.charAt(0).toUpperCase() + currentSection.slice(1))}</h2>
                    <div class="card">
                        <p class="text-muted">This section requires an authenticated v2 admin session.</p>
                        <p class="text-muted">Legacy admin login succeeded, but v2 login did not. Verify that a v2 superadmin user exists and that credentials match.</p>
                    </div>
                </div>`;
            return;
        }
        const { render, init, destroy } = v2Sections[currentSection];
        content.innerHTML = render(v2Api);
        if (destroy) activeSectionCleanup = destroy;
        if (init) init(v2Api);
        return;
    }

    const renderers = {
        branding: renderBrandingEditor,
        welcomeTips: renderWelcomeTipsEditor,
        startMenuLabels: renderStartMenuLabelsEditor,
        bootTips: renderBootTipsEditor,
        achievements: renderAchievementsEditor,
        easterEggs: renderEasterEggsEditor,
        desktopIcons: renderDesktopIconsEditor,
        defaults: renderDefaultsEditor,
        quickLaunch: renderQuickLaunchEditor,
        wallpapers: renderWallpapersEditor,
        colorSchemes: renderColorSchemesEditor,
        features: renderFeaturesEditor,
        apps: renderAppsEditor,
        password: renderPasswordEditor
    };

    const renderer = renderers[currentSection];
    if (renderer) {
        content.innerHTML = renderer();
        attachSectionHandlers();
    }
}

// ===== BRANDING EDITOR =====
function renderBrandingEditor() {
    const b = config.branding || {};
    return `
        <div class="section-editor">
            <h2>Branding</h2>
            <p class="section-desc">Customize the OS name, version strings, and branding text.</p>
            <div class="card">
                <h3>Core Identity</h3>
                ${field('branding.osName', 'OS Name', b.osName || '')}
                ${field('branding.version', 'Version', b.version || '')}
                ${field('branding.buildNumber', 'Build Number', b.buildNumber || '')}
                ${field('branding.versionString', 'Version String (boot screen)', b.versionString || '')}
                ${field('branding.sidebarText', 'Start Menu Sidebar', b.sidebarText || '')}
                ${field('branding.computerName', 'Computer Name (terminal)', b.computerName || '')}
                ${field('branding.websiteUrl', 'Website URL', b.websiteUrl || '')}
            </div>
            <div class="card">
                <h3>Boot &amp; Shutdown</h3>
                ${field('branding.bootMessage', 'Boot Message', b.bootMessage || '')}
                ${field('branding.biosVersion', 'BIOS Version', b.biosVersion || '')}
                ${field('branding.terminalBanner', 'Terminal Banner', b.terminalBanner || '')}
                ${field('branding.shutdownMessage', 'Shutdown Message', b.shutdownMessage || '')}
                ${field('branding.shutdownDialogTitle', 'Shutdown Dialog Title', b.shutdownDialogTitle || '')}
                ${field('branding.shutdownDialogPrompt', 'Shutdown Dialog Prompt', b.shutdownDialogPrompt || '')}
                ${field('branding.screensaverText', 'Screensaver Text', b.screensaverText || '')}
                ${field('branding.bsodTitle', 'BSOD Title', b.bsodTitle || '')}
            </div>
            <div class="card">
                <h3>About &amp; Credits</h3>
                ${field('branding.aboutText', 'About / Copyright', b.aboutText || '')}
                ${field('branding.aboutSubtitle', 'About Subtitle', b.aboutSubtitle || '')}
                ${field('branding.copyrightText', 'Copyright Line', b.copyrightText || '')}
                ${field('branding.creditsTitle', 'Credits Title', b.creditsTitle || '')}
                ${field('branding.tagline', 'Tagline', b.tagline || '')}
                ${field('branding.welcomeTitle', 'Welcome Dialog Title', b.welcomeTitle || '')}
                ${field('branding.welcomeButtonText', 'Welcome Button Text', b.welcomeButtonText || '')}
                ${field('branding.runDialogPrompt', 'Run Dialog Prompt', b.runDialogPrompt || '')}
                ${field('branding.helpDescription', 'Help Description', b.helpDescription || '')}
            </div>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Branding</button>
        </div>
    `;
}

// ===== WELCOME TIPS EDITOR =====
function renderWelcomeTipsEditor() {
    const wt = config.welcomeTips || {};
    const items = wt.items || [];
    return `
        <div class="section-editor">
            <h2>Welcome Tips</h2>
            <p class="section-desc">Tips shown in the Welcome dialog after boot.</p>
            <div class="card">
                <h3>Heading</h3>
                ${field('welcomeTips.heading', 'Heading Text', wt.heading || '')}
                ${field('welcomeTips.headingIcon', 'Heading Icon (emoji)', wt.headingIcon || '')}
            </div>
            <div class="card" id="welcomeTipsList">
                <h3>Tips</h3>
                ${items.map((tip, i) => `
                    <div class="list-item" data-index="${i}">
                        <span class="drag-handle">\u2630</span>
                        <div class="item-content">
                            <input type="text" value="${escHtml(tip)}" data-field="welcomeTips.items[${i}]" class="tip-input">
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-danger btn-sm" onclick="removeWelcomeTip(${i})">Remove</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-secondary" onclick="addWelcomeTip()">+ Add Tip</button>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Welcome Tips</button>
        </div>
    `;
}

// ===== START MENU LABELS EDITOR =====
function renderStartMenuLabelsEditor() {
    const labels = config.startMenuLabels || {};
    const labelKeys = [
        { key: 'programs', label: 'Programs' },
        { key: 'documents', label: 'Documents' },
        { key: 'settings', label: 'Settings' },
        { key: 'find', label: 'Find...' },
        { key: 'help', label: 'Help' },
        { key: 'run', label: 'Run...' },
        { key: 'shutDown', label: 'Shut Down...' },
        { key: 'adminPanel', label: 'Admin Panel' },
        { key: 'adminLogin', label: 'Admin Login' },
        { key: 'internet', label: 'Internet' },
        { key: 'multimedia', label: 'Multimedia' },
        { key: 'accessories', label: 'Accessories' },
        { key: 'systemTools', label: 'System Tools' },
        { key: 'games', label: 'Games' }
    ];
    return `
        <div class="section-editor">
            <h2>Start Menu Labels</h2>
            <p class="section-desc">Customize the text labels in the Start Menu.</p>
            <div class="card">
                <h3>Main Menu</h3>
                ${labelKeys.slice(0, 9).map(({ key, label }) =>
                    field(`startMenuLabels.${key}`, label, labels[key] || '')
                ).join('')}
            </div>
            <div class="card">
                <h3>Program Submenus</h3>
                ${labelKeys.slice(9).map(({ key, label }) =>
                    field(`startMenuLabels.${key}`, label, labels[key] || '')
                ).join('')}
            </div>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Start Menu Labels</button>
        </div>
    `;
}

// ===== ACHIEVEMENTS EDITOR =====
function renderAchievementsEditor() {
    const achievements = config.achievements || [];
    return `
        <div class="section-editor">
            <h2>Achievements</h2>
            <p class="section-desc">Define the achievements users can unlock. Each needs a unique ID, display name, description, and icon emoji.</p>
            <div class="card" id="achievementsList">
                ${achievements.map((a, i) => `
                    <div class="list-item" data-index="${i}" style="flex-wrap: wrap;">
                        <span class="drag-handle">\u2630</span>
                        <div class="item-content" style="flex-wrap: wrap; gap: 4px;">
                            <input type="text" value="${escHtml(a.icon || '')}" style="width:50px" data-field="achievements[${i}].icon" placeholder="Icon">
                            <input type="text" value="${escHtml(a.id || '')}" style="width:130px" data-field="achievements[${i}].id" placeholder="ID (unique)">
                            <input type="text" value="${escHtml(a.name || '')}" style="flex:1;min-width:120px" data-field="achievements[${i}].name" placeholder="Name">
                            <input type="text" value="${escHtml(a.desc || '')}" style="flex:1;min-width:150px" data-field="achievements[${i}].desc" placeholder="Description">
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-danger btn-sm" onclick="removeAchievement(${i})">Remove</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-secondary" onclick="addAchievement()">+ Add Achievement</button>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Achievements</button>
        </div>
    `;
}

// ===== EASTER EGGS EDITOR =====
function renderEasterEggsEditor() {
    const ee = config.easterEggs || {};
    const unlocks = ee.konamiUnlocks || [];
    return `
        <div class="section-editor">
            <h2>Easter Eggs</h2>
            <p class="section-desc">Customize Konami code dialog and other hidden features.</p>
            <div class="card">
                <h3>Konami Code Dialog</h3>
                ${field('easterEggs.konamiTitle', 'Dialog Title', ee.konamiTitle || '')}
                ${field('easterEggs.konamiButtonText', 'Button Text', ee.konamiButtonText || '')}
            </div>
            <div class="card" id="konamiUnlocksList">
                <h3>Konami Unlocks List</h3>
                <p class="section-desc" style="margin-bottom:8px">Items shown in the "You unlocked:" list when the Konami code is entered.</p>
                ${unlocks.map((item, i) => `
                    <div class="list-item" data-index="${i}">
                        <span class="drag-handle">\u2630</span>
                        <div class="item-content">
                            <input type="text" value="${escHtml(item)}" data-field="easterEggs.konamiUnlocks[${i}]" class="tip-input">
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-danger btn-sm" onclick="removeKonamiUnlock(${i})">Remove</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-secondary" onclick="addKonamiUnlock()">+ Add Unlock Item</button>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Easter Eggs</button>
        </div>
    `;
}

// ===== BOOT TIPS EDITOR =====
function renderBootTipsEditor() {
    const tips = config.bootTips || [];
    return `
        <div class="section-editor">
            <h2>Boot Tips</h2>
            <p class="section-desc">Messages shown during the boot loading screen.</p>
            <div class="card" id="bootTipsList">
                ${tips.map((tip, i) => `
                    <div class="list-item" data-index="${i}">
                        <span class="drag-handle">\u2630</span>
                        <div class="item-content">
                            <input type="text" value="${escHtml(tip)}" data-field="bootTips[${i}]" class="tip-input">
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-danger btn-sm" onclick="removeTip(${i})">Remove</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-secondary" onclick="addTip()">+ Add Tip</button>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Boot Tips</button>
        </div>
    `;
}

// ===== DESKTOP ICONS EDITOR =====
function renderDesktopIconsEditor() {
    const icons = config.desktopIcons || [];
    return `
        <div class="section-editor">
            <h2>Desktop Icons</h2>
            <p class="section-desc">Icons displayed on the desktop. App icons launch apps; link icons open URLs.
            <br><strong>Note:</strong> These defaults apply to new users only. Existing users who have already rearranged or modified their desktop icons will keep their saved layout.</p>
            <div class="card" id="iconsList">
                ${icons.map((icon, i) => `
                    <div class="list-item" data-index="${i}">
                        <span class="drag-handle">\u2630</span>
                        <div class="item-content" style="flex-wrap: wrap; gap: 4px;">
                            <input type="text" value="${escHtml(icon.emoji || '')}" style="width:50px" data-field="desktopIcons[${i}].emoji" placeholder="Emoji">
                            <input type="text" value="${escHtml(icon.label || '')}" style="flex:1" data-field="desktopIcons[${i}].label" placeholder="Label">
                            <select data-field="desktopIcons[${i}].type" style="width:80px">
                                <option value="app" ${icon.type === 'app' ? 'selected' : ''}>App</option>
                                <option value="link" ${icon.type === 'link' ? 'selected' : ''}>Link</option>
                            </select>
                            <input type="text" value="${escHtml(icon.id || icon.url || '')}"
                                   style="flex:1" data-field="desktopIcons[${i}].${icon.type === 'link' ? 'url' : 'id'}"
                                   placeholder="${icon.type === 'link' ? 'URL' : 'App ID'}">
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-danger btn-sm" onclick="removeIcon(${i})">Remove</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-secondary" onclick="addIcon()">+ Add Icon</button>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Icons</button>
        </div>
    `;
}

// ===== DEFAULTS EDITOR =====
function renderDefaultsEditor() {
    const d = config.defaults || {};
    return `
        <div class="section-editor">
            <h2>Default Settings</h2>
            <p class="section-desc">Default values for new users (before they change anything).
            <br><strong>Note:</strong> These defaults only apply when a user has no saved preferences in their browser.
            Existing users who have already changed settings will keep their saved values.
            To reset an existing user, they must clear their browser localStorage.</p>
            <div class="card">
                ${toggle('defaults.sound', 'Sound Enabled', d.sound)}
                ${toggle('defaults.crtEffect', 'CRT Effect', d.crtEffect)}
                ${toggle('defaults.petEnabled', 'Desktop Pet', d.petEnabled)}
                ${field('defaults.screensaverDelay', 'Screensaver Delay (ms)', d.screensaverDelay || 300000, 'number')}
                ${field('defaults.desktopBg', 'Desktop Background', d.desktopBg || '#008080', 'color')}
                <div class="inline-row">
                    <label>Default Wallpaper</label>
                    <select data-field="defaults.wallpaper">
                        ${Object.keys(config.wallpapers || {}).map(k =>
                            `<option value="${k}" ${d.wallpaper === k ? 'selected' : ''}>${k}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="inline-row">
                    <label>Default Color Scheme</label>
                    <select data-field="defaults.colorScheme">
                        ${Object.keys(config.colorSchemes || {}).map(k =>
                            `<option value="${k}" ${d.colorScheme === k ? 'selected' : ''}>${k}</option>`
                        ).join('')}
                    </select>
                </div>
            </div>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Defaults</button>
        </div>
    `;
}

// ===== QUICK LAUNCH EDITOR =====
function renderQuickLaunchEditor() {
    const items = config.quickLaunch || [];
    return `
        <div class="section-editor">
            <h2>Quick Launch</h2>
            <p class="section-desc">Buttons in the taskbar quick launch area.</p>
            <div class="card" id="quickLaunchList">
                ${items.map((item, i) => `
                    <div class="list-item" data-index="${i}">
                        <span class="drag-handle">\u2630</span>
                        <div class="item-content">
                            <input type="text" value="${escHtml(item.icon || '')}" style="width:50px" data-field="quickLaunch[${i}].icon" placeholder="Icon">
                            <input type="text" value="${escHtml(item.title || '')}" style="flex:1" data-field="quickLaunch[${i}].title" placeholder="Title">
                            <select data-field="quickLaunch[${i}].type" style="width:80px">
                                <option value="app" ${item.type === 'app' ? 'selected' : ''}>App</option>
                                <option value="link" ${item.type === 'link' ? 'selected' : ''}>Link</option>
                            </select>
                            <input type="text" value="${escHtml(item.appId || item.url || '')}" style="flex:1"
                                   data-field="quickLaunch[${i}].${item.type === 'link' ? 'url' : 'appId'}"
                                   placeholder="${item.type === 'link' ? 'URL' : 'App ID'}">
                        </div>
                        <div class="item-actions">
                            <button class="btn btn-danger btn-sm" onclick="removeQuickLaunch(${i})">Remove</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-secondary" onclick="addQuickLaunch()">+ Add Item</button>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Quick Launch</button>
        </div>
    `;
}

// ===== WALLPAPERS EDITOR =====
function renderWallpapersEditor() {
    const wp = config.wallpapers || {};
    return `
        <div class="section-editor">
            <h2>Wallpapers</h2>
            <p class="section-desc">CSS gradient wallpapers available in Display Properties.</p>
            <div class="card">
                ${Object.entries(wp).map(([key, val]) => `
                    <div class="list-item" style="flex-direction: column; align-items: stretch;">
                        <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                            <strong>${key}</strong>
                            <input type="text" value="${escHtml(val.label || key)}" data-field="wallpapers.${key}.label" placeholder="Label" style="width:150px">
                            <div class="color-preview" style="width:60px;height:30px;background:${val.css || ''}"></div>
                        </div>
                        <textarea data-field="wallpapers.${key}.css" rows="2">${escHtml(val.css || '')}</textarea>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Wallpapers</button>
        </div>
    `;
}

// ===== COLOR SCHEMES EDITOR =====
function renderColorSchemesEditor() {
    const cs = config.colorSchemes || {};
    return `
        <div class="section-editor">
            <h2>Color Schemes</h2>
            <p class="section-desc">Window and titlebar color themes.</p>
            <div class="card">
                ${Object.entries(cs).map(([key, val]) => `
                    <div class="list-item">
                        <div class="item-content">
                            <strong style="min-width:100px">${key}</strong>
                            <input type="text" value="${escHtml(val.label || key)}" data-field="colorSchemes.${key}.label" style="width:150px" placeholder="Label">
                            <label style="font-size:12px;color:var(--text-muted)">Window:</label>
                            <input type="color" value="${val.window || '#c0c0c0'}" data-field="colorSchemes.${key}.window" style="width:50px;padding:2px">
                            <label style="font-size:12px;color:var(--text-muted)">Titlebar:</label>
                            <input type="color" value="${val.titlebar || '#000080'}" data-field="colorSchemes.${key}.titlebar" style="width:50px;padding:2px">
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Color Schemes</button>
        </div>
    `;
}

// ===== FEATURES EDITOR =====
function renderFeaturesEditor() {
    const features = config.features || {};
    return `
        <div class="section-editor">
            <h2>Features</h2>
            <p class="section-desc">Enable or disable system features.</p>
            <div class="card">
                ${Object.entries(features).map(([key, val]) => `
                    <div class="list-item">
                        <div class="item-content" style="justify-content: space-between;">
                            <strong>${key}</strong>
                            ${toggle(`features.${key}.enabled`, '', val.enabled !== false)}
                        </div>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Features</button>
        </div>
    `;
}

// ===== APPS EDITOR =====
function renderAppsEditor() {
    const apps = config.apps || {};
    const disabled = apps.disabledApps || [];
    return `
        <div class="section-editor">
            <h2>Applications</h2>
            <p class="section-desc">Manage which applications are available.</p>
            <div class="card">
                <div class="form-group">
                    <label>Disabled Apps (comma-separated IDs)</label>
                    <textarea data-field="apps.disabledApps" rows="3">${disabled.join(', ')}</textarea>
                </div>
            </div>
            <button class="btn btn-success" onclick="saveCurrentSection()">Save Apps</button>
        </div>
    `;
}

// ===== PASSWORD EDITOR =====
function renderPasswordEditor() {
    return `
        <div class="section-editor">
            <h2>Change Password</h2>
            <p class="section-desc">Update the admin panel password.</p>
            <div class="card">
                ${field('pw.current', 'Current Password', '', 'password')}
                ${field('pw.new', 'New Password', '', 'password')}
                ${field('pw.confirm', 'Confirm Password', '', 'password')}
            </div>
            <button class="btn btn-success" onclick="changePassword()">Change Password</button>
            <div id="pwResult"></div>
        </div>
    `;
}

// ===== HELPERS =====
function field(key, label, value, type = 'text') {
    return `
        <div class="inline-row">
            <label>${label}</label>
            <input type="${type}" value="${escHtml(String(value))}" data-field="${key}">
        </div>
    `;
}

function toggle(key, label, checked) {
    return `
        <div class="inline-row">
            ${label ? `<label>${label}</label>` : ''}
            <label class="toggle">
                <input type="checkbox" data-field="${key}" ${checked ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        </div>
    `;
}

function getFieldValue(key) {
    const el = document.querySelector(`[data-field="${key}"]`);
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') return Number(el.value);
    return el.value;
}

function attachSectionHandlers() {
    // Mark unsaved on any input change
    document.querySelectorAll('[data-field]').forEach(el => {
        el.addEventListener('input', () => {
            hasUnsavedChanges = true;
            setStatus('Unsaved changes');
        });
    });

    // When type select changes on desktop icons or quick launch,
    // collect current values into config and re-render so data-field
    // attributes match the new type.
    if (currentSection === 'desktopIcons' || currentSection === 'quickLaunch') {
        document.querySelectorAll('select[data-field*=".type"]').forEach(sel => {
            sel.addEventListener('change', () => {
                // Collect current values into config before re-render
                if (currentSection === 'desktopIcons') {
                    config.desktopIcons = collectDesktopIcons();
                } else if (currentSection === 'quickLaunch') {
                    config.quickLaunch = collectQuickLaunch();
                }
                hasUnsavedChanges = true;
                renderSection();
            });
        });
    }
}

// ===== SECTION DATA COLLECTION =====
function collectSectionData() {
    switch (currentSection) {
        case 'branding': return collectObject('branding', [
            'osName', 'version', 'buildNumber', 'versionString', 'sidebarText',
            'computerName', 'websiteUrl', 'terminalBanner', 'screensaverText',
            'bootMessage', 'shutdownMessage', 'shutdownDialogTitle', 'shutdownDialogPrompt',
            'aboutText', 'biosVersion', 'bsodTitle', 'aboutSubtitle', 'copyrightText',
            'creditsTitle', 'tagline', 'welcomeTitle', 'welcomeButtonText',
            'runDialogPrompt', 'helpDescription'
        ]);
        case 'welcomeTips': return collectWelcomeTips();
        case 'startMenuLabels': return collectObject('startMenuLabels', [
            'programs', 'documents', 'settings', 'find', 'help', 'run',
            'shutDown', 'adminPanel', 'adminLogin', 'internet', 'multimedia',
            'accessories', 'systemTools', 'games'
        ]);
        case 'achievements': return collectAchievements();
        case 'easterEggs': return collectEasterEggs();
        case 'bootTips': return collectArray('bootTips');
        case 'desktopIcons': return collectDesktopIcons();
        case 'defaults': return collectDefaults();
        case 'quickLaunch': return collectQuickLaunch();
        case 'wallpapers': return collectWallpapers();
        case 'colorSchemes': return collectColorSchemes();
        case 'features': return collectFeatures();
        case 'apps': return collectApps();
        default: return null;
    }
}

function collectObject(prefix, keys) {
    const result = {};
    for (const key of keys) {
        const val = getFieldValue(`${prefix}.${key}`);
        if (val !== undefined && val !== '') result[key] = val;
    }
    return result;
}

function collectArray(prefix) {
    const inputs = document.querySelectorAll(`[data-field^="${prefix}["]`);
    return Array.from(inputs).map(el => el.value).filter(v => v.trim());
}

function collectDesktopIcons() {
    const icons = config.desktopIcons || [];
    return icons.map((icon, i) => {
        const emoji = getFieldValue(`desktopIcons[${i}].emoji`) || icon.emoji;
        const label = getFieldValue(`desktopIcons[${i}].label`) || icon.label;
        const type = getFieldValue(`desktopIcons[${i}].type`) || icon.type;
        // Try both field names since the data-field may still reference the old type
        const idOrUrl = type === 'link'
            ? (getFieldValue(`desktopIcons[${i}].url`) || getFieldValue(`desktopIcons[${i}].id`) || icon.url)
            : (getFieldValue(`desktopIcons[${i}].id`) || getFieldValue(`desktopIcons[${i}].url`) || icon.id);

        const result = { emoji, label, type };
        if (type === 'link') {
            result.url = idOrUrl;
            result.id = icon.id || label.toLowerCase().replace(/\s+/g, '-');
        } else {
            result.id = idOrUrl;
        }
        return result;
    });
}

function collectDefaults() {
    return {
        sound: getFieldValue('defaults.sound'),
        crtEffect: getFieldValue('defaults.crtEffect'),
        petEnabled: getFieldValue('defaults.petEnabled'),
        screensaverDelay: getFieldValue('defaults.screensaverDelay'),
        desktopBg: getFieldValue('defaults.desktopBg'),
        wallpaper: getFieldValue('defaults.wallpaper'),
        colorScheme: getFieldValue('defaults.colorScheme')
    };
}

function collectQuickLaunch() {
    return (config.quickLaunch || []).map((item, i) => {
        const icon = getFieldValue(`quickLaunch[${i}].icon`) || item.icon;
        const title = getFieldValue(`quickLaunch[${i}].title`) || item.title;
        const type = getFieldValue(`quickLaunch[${i}].type`) || item.type;
        const result = { type, icon, title };
        if (type === 'link') {
            // Try both field names in case type was just switched
            result.url = getFieldValue(`quickLaunch[${i}].url`) || getFieldValue(`quickLaunch[${i}].appId`) || item.url;
        } else {
            result.appId = getFieldValue(`quickLaunch[${i}].appId`) || getFieldValue(`quickLaunch[${i}].url`) || item.appId;
        }
        return result;
    });
}

function collectWallpapers() {
    const result = {};
    for (const key of Object.keys(config.wallpapers || {})) {
        result[key] = {
            label: getFieldValue(`wallpapers.${key}.label`) || key,
            css: getFieldValue(`wallpapers.${key}.css`) || ''
        };
    }
    return result;
}

function collectColorSchemes() {
    const result = {};
    for (const key of Object.keys(config.colorSchemes || {})) {
        result[key] = {
            label: getFieldValue(`colorSchemes.${key}.label`) || key,
            window: getFieldValue(`colorSchemes.${key}.window`) || '#c0c0c0',
            titlebar: getFieldValue(`colorSchemes.${key}.titlebar`) || '#000080'
        };
    }
    return result;
}

function collectFeatures() {
    const result = {};
    for (const key of Object.keys(config.features || {})) {
        result[key] = {
            ...config.features[key],
            enabled: getFieldValue(`features.${key}.enabled`)
        };
    }
    return result;
}

function collectApps() {
    const raw = getFieldValue('apps.disabledApps') || '';
    return {
        disabledApps: raw.split(',').map(s => s.trim()).filter(Boolean)
    };
}

function collectEasterEggs() {
    const result = {};
    const konamiTitle = getFieldValue('easterEggs.konamiTitle');
    const konamiButtonText = getFieldValue('easterEggs.konamiButtonText');
    if (konamiTitle) result.konamiTitle = konamiTitle;
    if (konamiButtonText) result.konamiButtonText = konamiButtonText;
    const inputs = document.querySelectorAll('[data-field^="easterEggs.konamiUnlocks["]');
    const konamiUnlocks = Array.from(inputs).map(el => el.value).filter(v => v.trim());
    if (konamiUnlocks.length > 0) result.konamiUnlocks = konamiUnlocks;
    return result;
}

function collectWelcomeTips() {
    const result = {};
    const heading = getFieldValue('welcomeTips.heading');
    const headingIcon = getFieldValue('welcomeTips.headingIcon');
    if (heading) result.heading = heading;
    if (headingIcon) result.headingIcon = headingIcon;
    const inputs = document.querySelectorAll('[data-field^="welcomeTips.items["]');
    const items = Array.from(inputs).map(el => el.value).filter(v => v.trim());
    if (items.length > 0) result.items = items;
    return result;
}

function collectAchievements() {
    const count = (config.achievements || []).length;
    const result = [];
    for (let i = 0; i < count; i++) {
        const id = getFieldValue(`achievements[${i}].id`);
        const name = getFieldValue(`achievements[${i}].name`);
        const desc = getFieldValue(`achievements[${i}].desc`);
        const icon = getFieldValue(`achievements[${i}].icon`);
        if (id && name) {
            result.push({ id, name, desc: desc || '', icon: icon || '' });
        }
    }
    return result;
}

// ===== SAVE =====
window.saveCurrentSection = async function() {
    if (currentSection === 'password') return;

    const data = collectSectionData();
    if (!data) {
        setStatus('Nothing to save', true);
        return;
    }

    try {
        let resp;

        // Prefer v2 backend when available so saved values are reflected in
        // the live app config endpoint (/api/v2/config).
        if (v2Available && v2Token) {
            resp = await v2Api.put(`/config/${currentSection}`, { data });
        } else {
            resp = await apiPost(API.save, {
                action: 'save-section',
                section: currentSection,
                data,
                csrfToken
            });
        }

        if (resp.success) {
            // Update local config
            config[currentSection] = data;
            hasUnsavedChanges = false;
            setStatus(`${currentSection} saved successfully`);
        }
    } catch (err) {
        setStatus('Save failed: ' + err.message, true);
    }
};

// ===== PASSWORD CHANGE =====
function setResultMessage(el, message, isError) {
    el.textContent = '';
    const div = document.createElement('div');
    div.className = isError ? 'error-msg' : 'success-msg';
    div.textContent = message;
    el.appendChild(div);
}

window.changePassword = async function() {
    const current = getFieldValue('pw.current');
    const newPw = getFieldValue('pw.new');
    const confirm = getFieldValue('pw.confirm');
    const resultEl = document.getElementById('pwResult');

    if (newPw !== confirm) {
        setResultMessage(resultEl, 'Passwords do not match', true);
        return;
    }

    try {
        const resp = await apiPost(API.auth, {
            action: 'change-password',
            currentPassword: current,
            newPassword: newPw
        });

        if (resp.success) {
            setResultMessage(resultEl, 'Password changed successfully', false);
        }
    } catch (err) {
        setResultMessage(resultEl, err.message, true);
    }
};

// ===== LIST MANIPULATION =====
window.addTip = function() {
    config.bootTips = config.bootTips || [];
    config.bootTips.push('New tip...');
    renderSection();
};

window.removeTip = function(i) {
    config.bootTips.splice(i, 1);
    renderSection();
};

window.addIcon = function() {
    config.desktopIcons = config.desktopIcons || [];
    config.desktopIcons.push({ id: 'newapp', label: 'New Icon', emoji: '\u2B50', type: 'app' });
    renderSection();
};

window.removeIcon = function(i) {
    config.desktopIcons.splice(i, 1);
    renderSection();
};

window.addQuickLaunch = function() {
    config.quickLaunch = config.quickLaunch || [];
    config.quickLaunch.push({ type: 'app', appId: 'terminal', icon: '\uD83D\uDCBB', title: 'New' });
    renderSection();
};

window.removeQuickLaunch = function(i) {
    config.quickLaunch.splice(i, 1);
    renderSection();
};

window.addKonamiUnlock = function() {
    config.easterEggs = config.easterEggs || { konamiTitle: '', konamiButtonText: '', konamiUnlocks: [] };
    config.easterEggs.konamiUnlocks = config.easterEggs.konamiUnlocks || [];
    config.easterEggs.konamiUnlocks.push('New unlock...');
    renderSection();
};

window.removeKonamiUnlock = function(i) {
    if (config.easterEggs && config.easterEggs.konamiUnlocks) {
        config.easterEggs.konamiUnlocks.splice(i, 1);
        renderSection();
    }
};

window.addWelcomeTip = function() {
    config.welcomeTips = config.welcomeTips || { heading: 'Did you know?', headingIcon: '', items: [] };
    config.welcomeTips.items = config.welcomeTips.items || [];
    config.welcomeTips.items.push('New tip...');
    renderSection();
};

window.removeWelcomeTip = function(i) {
    if (config.welcomeTips && config.welcomeTips.items) {
        config.welcomeTips.items.splice(i, 1);
        renderSection();
    }
};

window.addAchievement = function() {
    config.achievements = config.achievements || [];
    config.achievements.push({ id: 'new_achievement', name: 'New Achievement', desc: 'Description', icon: '\uD83C\uDFC6' });
    renderSection();
};

window.removeAchievement = function(i) {
    if (config.achievements) {
        config.achievements.splice(i, 1);
        renderSection();
    }
};

// ===== STATUS =====
function setStatus(msg, isError = false) {
    const el = document.getElementById('statusText');
    if (el) {
        el.textContent = msg;
        el.style.color = isError ? 'var(--danger)' : 'var(--text-muted)';
    }
}

// ===== API HELPER =====
async function apiPost(url, body) {
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    const data = await resp.json();

    if (!resp.ok) {
        throw new Error(data.error || `HTTP ${resp.status}`);
    }

    return data;
}

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});
