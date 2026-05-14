/**
 * BackendControlManager - Full system remote-control panel.
 *
 * Sections:
 *  1. Live Status Bar             – real-time user/event stats
 *  2. Quick Launch grid           – one-click app launch on all clients
 *  3. Launch App                  – dropdown-based app launcher with params
 *  4. Broadcast Message           – send a system message to all clients
 *  5. Send Announcement           – create an announcement inline
 *  6. Feature Toggles             – one-click enable/disable features
 *  7. App Enable / Disable        – checkbox grid of all apps
 *  8. Config Push                 – push a config section change instantly
 *  9. Dispatch Event              – dropdown-based SSE event dispatcher
 * 10. Filesystem Command          – create/write/delete files on clients
 * 11. Default Filesystem Editor   – collapsible raw JSON editor
 */

import { openEmojiPicker } from './EmojiPicker.js';
import { escHtml, escAttr } from '../sanitize.js';

// ── Fallback catalog ────────────────────────────────────────
const FALLBACK_APPS = {
    accessories:   [
        { id: 'calculator',   name: 'Calculator',   icon: '🧮' },
        { id: 'notepad',      name: 'Notepad',      icon: '📝' },
        { id: 'paint',        name: 'Paint',        icon: '🎨' },
        { id: 'calendar',     name: 'Calendar',     icon: '📅' },
        { id: 'clock',        name: 'Clock',        icon: '🕐' },
        { id: 'hypercard',    name: 'HyperCard',    icon: '🃏' },
    ],
    system_tools:  [
        { id: 'terminal',             name: 'Terminal',             icon: '📟' },
        { id: 'defrag',               name: 'Defrag',               icon: '🔧' },
        { id: 'taskmanager',          name: 'Task Manager',         icon: '📊' },
        { id: 'scriptrunner',         name: 'Script Runner',        icon: '📜' },
        { id: 'campaign-studio',      name: 'Campaign Studio',      icon: '🎬' },
        { id: 'timeline-editor',      name: 'Timeline Editor',      icon: '⏱' },
        { id: 'showrunner-console',   name: 'Showrunner Console',   icon: '🎛' },
        { id: 'analytics-dashboard',  name: 'Analytics Dashboard',  icon: '📊' },
        { id: 'mycomputer',           name: 'My Computer',          icon: '💻' },
        { id: 'recyclebin',           name: 'Recycle Bin',          icon: '🗑️' },
        { id: 'findfiles',            name: 'Find Files',           icon: '🔍' },
        { id: 'helpsystem',           name: 'Help System',          icon: '❓' },
    ],
    games:         [
        { id: 'minesweeper', name: 'Minesweeper', icon: '💣' },
        { id: 'snake',       name: 'Snake',       icon: '🐍' },
        { id: 'asteroids',   name: 'Asteroids',   icon: '🚀' },
        { id: 'doom',        name: 'DOOM',        icon: '👹' },
        { id: 'solitaire',   name: 'Solitaire',   icon: '🃏' },
        { id: 'freecell',    name: 'FreeCell',    icon: '♠️' },
        { id: 'skifree',     name: 'SkiFree',     icon: '⛷️' },
        { id: 'zork',        name: 'Zork',        icon: '🗡️' },
        { id: 'tetris',      name: 'Tetris',      icon: '🧱' },
    ],
    multimedia:    [
        { id: 'mediaplayer', name: 'Media Player', icon: '🎬' },
    ],
    internet:      [
        { id: 'browser',          name: 'Browser',           icon: '🌐' },
        { id: 'chatroom',         name: 'Chat Room',         icon: '💬' },
        { id: 'phone',            name: 'Phone',             icon: '📞' },
        { id: 'instantmessenger', name: 'Instant Messenger', icon: '💌' },
        { id: 'inbox',            name: 'Inbox',             icon: '📧' },
        { id: 'gamelobby',        name: 'Game Lobby',        icon: '🎮' },
    ],
    settings:      [
        { id: 'controlpanel',       name: 'Control Panel',      icon: '⚙️' },
        { id: 'displayproperties',  name: 'Display Properties', icon: '🖥️' },
        { id: 'soundsettings',      name: 'Sound Settings',     icon: '🔊' },
        { id: 'featuressettings',   name: 'Features Settings',  icon: '🔌' },
    ],
};

const CATEGORY_LABELS = {
    accessories:  'Accessories',
    system_tools: 'System Tools',
    games:        'Games',
    multimedia:   'Multimedia',
    internet:     'Internet',
    settings:     'Settings',
};

const FEATURE_DEFS = [
    { id: 'soundsystem',  label: 'Sound System',  icon: '🔊', desc: 'System audio and sound effects' },
    { id: 'achievements', label: 'Achievements',   icon: '🏆', desc: 'Unlock badges for actions' },
    { id: 'clippy',       label: 'Clippy',         icon: '📎', desc: 'The helpful (?) assistant' },
    { id: 'desktoppet',   label: 'Desktop Pet',    icon: '🐱', desc: 'Animated desktop companion' },
    { id: 'screensaver',  label: 'Screensaver',    icon: '🌙', desc: 'Idle screensaver activation' },
    { id: 'eastereggs',   label: 'Easter Eggs',    icon: '🥚', desc: 'Hidden surprises and secrets' },
    { id: 'dvd-bouncer',  label: 'DVD Bouncer',    icon: '📀', desc: 'Bouncing DVD logo plugin' },
];

const CONFIG_SECTIONS = [
    { key: 'branding',        label: 'Branding',         desc: 'OS name, version, boot/shutdown text' },
    { key: 'defaults',        label: 'Default Settings',  desc: 'Sound, CRT, wallpaper, color scheme defaults' },
    { key: 'features',        label: 'Features',          desc: 'Feature flags and per-feature config' },
    { key: 'apps',            label: 'Applications',      desc: 'Disabled apps list' },
    { key: 'desktopIcons',    label: 'Desktop Icons',     desc: 'Icons shown on the desktop' },
    { key: 'quickLaunch',     label: 'Quick Launch',      desc: 'Taskbar quick-launch buttons' },
    { key: 'wallpapers',      label: 'Wallpapers',        desc: 'Available CSS wallpaper patterns' },
    { key: 'colorSchemes',    label: 'Color Schemes',     desc: 'Window & titlebar color themes' },
    { key: 'bootTips',        label: 'Boot Tips',         desc: 'Messages during OS startup' },
    { key: 'welcomeTips',     label: 'Welcome Tips',      desc: 'Tips in the welcome dialog' },
    { key: 'startMenuLabels', label: 'Start Menu Labels', desc: 'Menu item text labels' },
    { key: 'achievements',    label: 'Achievements',      desc: 'Achievement definitions' },
    { key: 'easterEggs',      label: 'Easter Eggs',       desc: 'Konami code, cheats config' },
];

const COMMON_PATHS = [
    { label: 'Desktop',   path: 'C:/Users/User/Desktop' },
    { label: 'Documents', path: 'C:/Users/User/Documents' },
    { label: 'Pictures',  path: 'C:/Users/User/Pictures' },
    { label: 'Music',     path: 'C:/Users/User/Music' },
    { label: 'Projects',  path: 'C:/Users/User/Projects' },
    { label: 'Secret',    path: 'C:/Users/User/Secret' },
    { label: 'Windows',   path: 'C:/Windows' },
];

const ANNOUNCEMENT_TYPES = [
    { value: 'info',     label: 'Info' },
    { value: 'warning',  label: 'Warning' },
    { value: 'critical', label: 'Critical' },
];

const WALLPAPER_KEYS = ['clouds', 'tiles', 'waves', 'forest', 'space'];
const COLOR_SCHEME_KEYS = ['win95', 'highcontrast', 'desert', 'ocean', 'rose', 'slate'];
const SCREENSAVER_MODES = ['toasters', 'starfield', 'marquee'];
const PET_TYPES = ['neko', 'dog', 'sheep'];

// Legacy alias – prefer escAttr/escHtml from sanitize.js for new code.
const esc = escAttr;

// ── Render ──────────────────────────────────────────────────
export function renderBackendControlManager() {
    const pathOptions = COMMON_PATHS.map(p =>
        `<option value="${p.path}">${p.label} — ${p.path}</option>`
    ).join('');

    const announcementTypeOpts = ANNOUNCEMENT_TYPES.map(t =>
        `<option value="${t.value}">${t.label}</option>`
    ).join('');

    const configSectionOpts = CONFIG_SECTIONS.map(s =>
        `<option value="${s.key}" data-desc="${esc(s.desc)}">${s.label}</option>`
    ).join('');

    return `
        <div class="section-editor">
            <h2>Backend Control</h2>
            <p class="section-desc">Full remote control over all connected clients. Launch apps, toggle features, push config changes, manage files — everything from one place.</p>

            <!-- ─── Live Status Bar ──────────────────────── -->
            <div class="bc-live-bar" id="bcLiveBar">
                <div class="bc-live-stat"><span id="bcStatUsers">--</span> users</div>
                <div class="bc-live-stat"><span id="bcStatActive">--</span> active</div>
                <div class="bc-live-stat"><span id="bcStatEvents">--</span> events/hr</div>
                <div class="bc-live-stat"><span id="bcStatHealth" class="bc-badge">--</span></div>
                <button class="btn btn-sm btn-secondary" id="btnBcRefreshStats" title="Refresh">Refresh</button>
            </div>

            <!-- ─── 1. Quick Launch ──────────────────────── -->
            <div class="card">
                <h3>Quick Launch</h3>
                <p class="text-muted">One-click launch popular apps on all connected clients.</p>
                <div class="bc-quick-grid" id="bcQuickGrid"></div>
                <span id="bcQuickStatus" class="bc-status"></span>
            </div>

            <!-- ─── 2. Launch App ────────────────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="bcLaunchBody">
                    <h3>Launch App</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <div id="bcLaunchBody" class="bc-collapsible" style="display:none">
                    <div class="form-group">
                        <label>Select Application</label>
                        <select id="bcAppSelect"><option value="">— Choose an app —</option></select>
                    </div>
                    <div id="bcParamSection" style="display:none">
                        <div class="bc-param-toggle">
                            <label><input type="checkbox" id="bcShowParams"> Add launch parameters</label>
                        </div>
                        <div id="bcParamFields" style="display:none">
                            <div class="form-group">
                                <label>Initial Path</label>
                                <select id="bcParamPath">
                                    <option value="">— No path —</option>
                                    ${pathOptions}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Custom Parameters (JSON)</label>
                                <textarea id="bcParamCustom" rows="2" placeholder='{"key":"value"}'></textarea>
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-success" id="btnBcLaunchApp" disabled>Launch</button>
                    <span id="bcLaunchStatus" class="bc-status"></span>
                </div>
            </div>

            <!-- ─── 3. Broadcast Message ─────────────────── -->
            <div class="card">
                <h3>Broadcast Message</h3>
                <p class="text-muted">Send a real-time message to all connected clients via SSE.</p>
                <div class="form-group">
                    <label>Message</label>
                    <input type="text" id="bcMsgText" placeholder="Hello from the admin!" maxlength="500">
                </div>
                <div class="inline-row">
                    <label>Level</label>
                    <select id="bcMsgLevel">
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="success">Success</option>
                        <option value="error">Error</option>
                    </select>
                </div>
                <div class="inline-row">
                    <label>Icon</label>
                    <input type="text" id="bcMsgIcon" placeholder="Auto" style="width:60px" maxlength="4">
                    <button type="button" class="emoji-trigger btn btn-sm btn-secondary" id="bcMsgIconPicker">😀</button>
                </div>
                <button class="btn btn-primary" id="btnBcSendMsg">Send Message</button>
                <span id="bcMsgStatus" class="bc-status"></span>
            </div>

            <!-- ─── 4. Send Announcement ─────────────────── -->
            <div class="card">
                <h3>Send Announcement</h3>
                <p class="text-muted">Create a persistent announcement visible to all users.</p>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="bcAnnTitle" placeholder="Maintenance Notice" maxlength="255">
                </div>
                <div class="form-group">
                    <label>Message</label>
                    <textarea id="bcAnnMessage" rows="3" placeholder="Scheduled maintenance tonight at 11 PM..."></textarea>
                </div>
                <div class="inline-row">
                    <label>Type</label>
                    <select id="bcAnnType">${announcementTypeOpts}</select>
                </div>
                <div class="form-group">
                    <label>Expires At (optional)</label>
                    <input type="datetime-local" id="bcAnnExpires">
                    <small class="text-muted">Leave blank for no expiration.</small>
                </div>
                <button class="btn btn-primary" id="btnBcSendAnn">Create Announcement</button>
                <span id="bcAnnStatus" class="bc-status"></span>
            </div>

            <!-- ─── 5. Feature Toggles ───────────────────── -->
            <div class="card">
                <h3>Feature Toggles</h3>
                <p class="text-muted">Instantly enable or disable system features for all users. Changes are pushed to clients in real-time.</p>
                <div class="bc-feature-grid" id="bcFeatureGrid"></div>
                <span id="bcFeatureStatus" class="bc-status"></span>
            </div>

            <!-- ─── 6. App Enable / Disable ──────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="bcAppMgmtBody">
                    <h3>App Management</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <p class="text-muted">Uncheck apps to disable them. Disabled apps cannot be opened by users.</p>
                <div id="bcAppMgmtBody" class="bc-collapsible" style="display:none">
                    <div class="bc-app-grid" id="bcAppMgmtGrid"></div>
                    <div class="form-actions">
                        <button class="btn btn-sm btn-secondary" id="btnBcAppsAll">Enable All</button>
                        <button class="btn btn-sm btn-secondary" id="btnBcAppsNone">Disable All</button>
                        <button class="btn btn-success" id="btnBcAppsSave">Save App Settings</button>
                    </div>
                    <span id="bcAppMgmtStatus" class="bc-status"></span>
                </div>
            </div>

            <!-- ─── 7. Config Push ───────────────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="bcConfigBody">
                    <h3>Config Push</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <p class="text-muted">Push configuration changes to a specific section. Changes take effect immediately on all clients.</p>
                <div id="bcConfigBody" class="bc-collapsible" style="display:none">
                    <div class="form-group">
                        <label>Config Section</label>
                        <select id="bcConfigSection">
                            <option value="">— Choose a section —</option>
                            ${configSectionOpts}
                        </select>
                    </div>
                    <div id="bcConfigDesc" class="bc-event-desc" style="display:none"></div>

                    <!-- Defaults sub-form -->
                    <div id="bcConfigForm_defaults" class="bc-config-subform" style="display:none">
                        <div class="inline-row">
                            <label>Sound Enabled</label>
                            <select id="bcCfgDefSound"><option value="false">Off</option><option value="true">On</option></select>
                        </div>
                        <div class="inline-row">
                            <label>CRT Effect</label>
                            <select id="bcCfgDefCrt"><option value="true">On</option><option value="false">Off</option></select>
                        </div>
                        <div class="inline-row">
                            <label>Desktop Pet</label>
                            <select id="bcCfgDefPet"><option value="false">Off</option><option value="true">On</option></select>
                        </div>
                        <div class="inline-row">
                            <label>Pet Type</label>
                            <select id="bcCfgDefPetType">${PET_TYPES.map(p => `<option value="${p}">${p}</option>`).join('')}</select>
                        </div>
                        <div class="inline-row">
                            <label>Default Wallpaper</label>
                            <select id="bcCfgDefWallpaper">${WALLPAPER_KEYS.map(w => `<option value="${w}">${w}</option>`).join('')}</select>
                        </div>
                        <div class="inline-row">
                            <label>Default Color Scheme</label>
                            <select id="bcCfgDefColorScheme">${COLOR_SCHEME_KEYS.map(c => `<option value="${c}">${c}</option>`).join('')}</select>
                        </div>
                        <div class="inline-row">
                            <label>Desktop Background</label>
                            <input type="color" id="bcCfgDefBg" value="#008080">
                        </div>
                        <div class="inline-row">
                            <label>Screensaver Delay</label>
                            <select id="bcCfgDefSsDelay">
                                <option value="60000">1 min</option>
                                <option value="120000">2 min</option>
                                <option value="300000" selected>5 min</option>
                                <option value="600000">10 min</option>
                            </select>
                        </div>
                    </div>

                    <!-- Features sub-form -->
                    <div id="bcConfigForm_features" class="bc-config-subform" style="display:none">
                        <p class="text-muted">Toggle features and adjust their settings.</p>
                        <div id="bcCfgFeatureRows"></div>
                    </div>

                    <!-- Generic JSON fallback for other sections -->
                    <div id="bcConfigForm_json" class="bc-config-subform" style="display:none">
                        <div class="form-group">
                            <label>Section Data (JSON)</label>
                            <textarea id="bcConfigJsonEditor" rows="10" style="font-family:monospace;" placeholder="Loading..."></textarea>
                            <small class="text-muted">Current section data loaded for editing. Modify and push.</small>
                        </div>
                    </div>

                    <div class="form-actions" id="bcConfigActions" style="display:none">
                        <button class="btn btn-success" id="btnBcConfigPush">Push Config</button>
                        <button class="btn btn-danger btn-sm" id="btnBcConfigReset">Reset to Defaults</button>
                    </div>
                    <span id="bcConfigStatus" class="bc-status"></span>
                </div>
            </div>

            <!-- ─── 8. Dispatch Event ────────────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="bcEventBody">
                    <h3>Dispatch Event</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <div id="bcEventBody" class="bc-collapsible" style="display:none">
                    <p class="text-muted">Broadcast a system event to all connected clients via SSE.</p>
                    <div class="form-group">
                        <label>Event Type</label>
                        <select id="bcEventSelect"><option value="">— Choose an event —</option></select>
                    </div>
                    <div id="bcEventDesc" class="bc-event-desc" style="display:none"></div>
                    <div class="form-group">
                        <label>Payload (JSON, optional)</label>
                        <textarea id="bcEventPayload" rows="3" placeholder='{"key":"value"}'></textarea>
                    </div>
                    <button class="btn btn-primary" id="btnBcDispatchEvent" disabled>Dispatch Event</button>
                    <span id="bcEventStatus" class="bc-status"></span>
                </div>
            </div>

            <!-- ─── 9. Filesystem Command ────────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="bcFsBody">
                    <h3>Filesystem Command</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <div id="bcFsBody" class="bc-collapsible" style="display:none">
                    <p class="text-muted">Create, write, or delete files and directories on connected clients.</p>
                    <div class="inline-row">
                        <label>Operation</label>
                        <select id="bcFsOperation">
                            <option value="write_file">Write File</option>
                            <option value="create_directory">Create Directory</option>
                            <option value="delete_file">Delete File</option>
                            <option value="delete_directory">Delete Directory</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Target Folder</label>
                        <select id="bcFsBaseDir">
                            <option value="">— Custom path —</option>
                            ${pathOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Full Path</label>
                        <input type="text" id="bcFsPath" placeholder="C:/Users/User/Desktop/notice.txt">
                        <small class="text-muted">Select a folder above or type the full path manually.</small>
                    </div>
                    <div class="form-group" id="bcFsContentGroup">
                        <label>File Content</label>
                        <textarea id="bcFsContent" rows="4" placeholder="Enter file content here..."></textarea>
                    </div>
                    <div class="inline-row" id="bcFsRecursiveGroup" style="display:none">
                        <label><input type="checkbox" id="bcFsRecursive"> Recursive delete</label>
                    </div>
                    <button class="btn btn-warning" id="btnBcFsCommand">Send Filesystem Command</button>
                    <span id="bcFsStatus" class="bc-status"></span>
                </div>
            </div>

            <!-- ─── 10. Default Filesystem Editor ────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="bcFsEditorBody">
                    <h3>Default Filesystem Config</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <p class="text-muted">Advanced: edit the raw JSON that new sessions use for their virtual filesystem.</p>
                <div id="bcFsEditorBody" class="bc-collapsible" style="display:none">
                    <div class="form-group">
                        <textarea id="bcFsEditor" rows="16" style="font-family:monospace;">Loading...</textarea>
                    </div>
                    <div class="form-actions">
                        <button class="btn btn-secondary" id="btnBcFsReload">Reload</button>
                        <button class="btn btn-success" id="btnBcFsSave">Save Default Filesystem</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ── Initialisation ──────────────────────────────────────────
export async function initBackendControlManager(api) {
    let catalog = { apps: FALLBACK_APPS, events: {} };
    try { catalog = await api.get('/system/app-catalog'); } catch { /* use fallbacks */ }

    const apps = catalog.apps || FALLBACK_APPS;
    const events = catalog.events || {};

    // Load current config for feature toggles and app management
    let currentConfig = {};
    try { currentConfig = await api.get('/config'); } catch { /* empty */ }

    populateAppSelect(apps);
    populateQuickGrid(apps, api);
    populateEventSelect(events);
    populateFeatureGrid(currentConfig, api);
    populateAppMgmtGrid(apps, currentConfig);
    loadStats(api);
    loadFilesystemConfig(api);

    // ── Collapsible sections ────────────────────────────────
    document.querySelectorAll('.bc-collapsible-header[data-target]').forEach(hdr => {
        hdr.addEventListener('click', () => {
            const body = document.getElementById(hdr.dataset.target);
            const arrow = hdr.querySelector('.bc-collapse-arrow');
            if (!body) return;
            const open = body.style.display === 'none';
            body.style.display = open ? '' : 'none';
            if (arrow) arrow.innerHTML = open ? '&#9660;' : '&#9654;';
        });
    });

    // ── Stats refresh ───────────────────────────────────────
    document.getElementById('btnBcRefreshStats')?.addEventListener('click', () => loadStats(api));

    // ── App launcher logic ──────────────────────────────────
    const appSelect   = document.getElementById('bcAppSelect');
    const paramSect   = document.getElementById('bcParamSection');
    const showParams  = document.getElementById('bcShowParams');
    const paramFields = document.getElementById('bcParamFields');
    const launchBtn   = document.getElementById('btnBcLaunchApp');

    appSelect?.addEventListener('change', () => {
        const hasApp = appSelect.value !== '';
        launchBtn.disabled = !hasApp;
        paramSect.style.display = hasApp ? '' : 'none';
    });
    showParams?.addEventListener('change', () => {
        paramFields.style.display = showParams.checked ? '' : 'none';
    });
    launchBtn?.addEventListener('click', () => doLaunchApp(api));

    // ── Broadcast message ───────────────────────────────────
    document.getElementById('bcMsgIconPicker')?.addEventListener('click', () => {
        openEmojiPicker(document.getElementById('bcMsgIconPicker'), (emoji) => {
            document.getElementById('bcMsgIcon').value = emoji;
        });
    });

    document.getElementById('btnBcSendMsg')?.addEventListener('click', async () => {
        const text = document.getElementById('bcMsgText').value.trim();
        const level = document.getElementById('bcMsgLevel').value;
        const icon = document.getElementById('bcMsgIcon').value.trim();
        if (!text) return showStatus('bcMsgStatus', 'Message is required', true);
        const payload = { message: text, level, timestamp: new Date().toISOString() };
        if (icon) payload.icon = icon;
        try {
            await api.post('/events', {
                event_type: 'system.message',
                payload
            });
            showStatus('bcMsgStatus', 'Message broadcast to all clients.');
            document.getElementById('bcMsgText').value = '';
        } catch (e) {
            showStatus('bcMsgStatus', 'Error: ' + e.message, true);
        }
    });

    // ── Announcement ────────────────────────────────────────
    document.getElementById('btnBcSendAnn')?.addEventListener('click', async () => {
        const title = document.getElementById('bcAnnTitle').value.trim();
        const message = document.getElementById('bcAnnMessage').value.trim();
        const type = document.getElementById('bcAnnType').value;
        const expiresRaw = document.getElementById('bcAnnExpires').value;
        if (!title) return showStatus('bcAnnStatus', 'Title is required', true);
        if (!message) return showStatus('bcAnnStatus', 'Message is required', true);
        const body = { title, message, type };
        if (expiresRaw) body.expires_at = new Date(expiresRaw).toISOString();
        try {
            const result = await api.post('/announcements', body);
            showStatus('bcAnnStatus', `Announcement #${result.id} created and broadcast.`);
            document.getElementById('bcAnnTitle').value = '';
            document.getElementById('bcAnnMessage').value = '';
            document.getElementById('bcAnnExpires').value = '';
        } catch (e) {
            showStatus('bcAnnStatus', 'Error: ' + e.message, true);
        }
    });

    // ── App management save ─────────────────────────────────
    document.getElementById('btnBcAppsAll')?.addEventListener('click', () => {
        document.querySelectorAll('#bcAppMgmtGrid input[type="checkbox"]').forEach(cb => cb.checked = true);
    });
    document.getElementById('btnBcAppsNone')?.addEventListener('click', () => {
        document.querySelectorAll('#bcAppMgmtGrid input[type="checkbox"]').forEach(cb => cb.checked = false);
    });
    document.getElementById('btnBcAppsSave')?.addEventListener('click', async () => {
        const disabled = [];
        document.querySelectorAll('#bcAppMgmtGrid input[type="checkbox"]').forEach(cb => {
            if (!cb.checked) disabled.push(cb.dataset.appId);
        });
        try {
            await api.put('/config/apps', { data: { disabledApps: disabled } });
            showStatus('bcAppMgmtStatus', `Saved. ${disabled.length} app(s) disabled.`);
        } catch (e) {
            showStatus('bcAppMgmtStatus', 'Error: ' + e.message, true);
        }
    });

    // ── Config push logic ───────────────────────────────────
    initConfigPush(api, currentConfig);

    // ── Event dispatcher logic ──────────────────────────────
    const eventSelect = document.getElementById('bcEventSelect');
    const eventDesc   = document.getElementById('bcEventDesc');
    const dispatchBtn = document.getElementById('btnBcDispatchEvent');

    eventSelect?.addEventListener('change', () => {
        const opt = eventSelect.selectedOptions[0];
        dispatchBtn.disabled = !eventSelect.value;
        if (opt && opt.dataset.desc) {
            eventDesc.textContent = opt.dataset.desc;
            eventDesc.style.display = '';
        } else {
            eventDesc.style.display = 'none';
        }
    });
    dispatchBtn?.addEventListener('click', async () => {
        const eventType = eventSelect.value;
        if (!eventType) return;
        let payload = {};
        const raw = document.getElementById('bcEventPayload').value.trim();
        if (raw) {
            try { payload = JSON.parse(raw); } catch {
                return showStatus('bcEventStatus', 'Invalid JSON payload', true);
            }
        }
        dispatchBtn.disabled = true;
        try {
            await api.post('/events', { event_type: eventType, payload });
            showStatus('bcEventStatus', 'Event dispatched successfully.');
        } catch (e) {
            showStatus('bcEventStatus', 'Error: ' + e.message, true);
        } finally {
            dispatchBtn.disabled = false;
        }
    });

    // ── Filesystem command logic ─────────────────────────────
    const fsOp       = document.getElementById('bcFsOperation');
    const fsBaseDir  = document.getElementById('bcFsBaseDir');
    const fsPath     = document.getElementById('bcFsPath');
    const fsContent  = document.getElementById('bcFsContentGroup');
    const fsRecGroup = document.getElementById('bcFsRecursiveGroup');

    const syncFsUi = () => {
        const op = fsOp.value;
        fsContent.style.display  = op === 'write_file' ? '' : 'none';
        fsRecGroup.style.display = op === 'delete_directory' ? '' : 'none';
    };
    fsOp?.addEventListener('change', syncFsUi);
    syncFsUi();

    fsBaseDir?.addEventListener('change', () => {
        if (fsBaseDir.value) {
            const op = fsOp.value;
            fsPath.value = fsBaseDir.value + (op === 'write_file' || op === 'delete_file' ? '/filename.txt' : '/NewFolder');
            fsPath.focus();
            const lastSlash = fsPath.value.lastIndexOf('/');
            fsPath.setSelectionRange(lastSlash + 1, fsPath.value.length);
        }
    });

    document.getElementById('btnBcFsCommand')?.addEventListener('click', async () => {
        const operation = fsOp.value;
        const path      = fsPath.value.trim();
        const content   = document.getElementById('bcFsContent').value;
        const recursive = document.getElementById('bcFsRecursive').checked;
        if (!path) return showStatus('bcFsStatus', 'Path is required', true);
        const body = { operation, path, recursive };
        if (operation === 'write_file') body.content = content;
        try {
            await api.post('/system/actions/filesystem', body);
            showStatus('bcFsStatus', 'Filesystem command broadcast to clients.');
        } catch (e) {
            showStatus('bcFsStatus', 'Error: ' + e.message, true);
        }
    });

    // ── Default filesystem editor ────────────────────────────
    document.getElementById('btnBcFsReload')?.addEventListener('click', () => loadFilesystemConfig(api));
    document.getElementById('btnBcFsSave')?.addEventListener('click', async () => {
        const raw = document.getElementById('bcFsEditor').value;
        let parsed;
        try { parsed = JSON.parse(raw); } catch {
            return alert('Filesystem JSON is invalid');
        }
        try {
            await api.put('/system/default-filesystem', { filesystem: parsed });
            showStatus('bcFsStatus', 'Default filesystem saved.');
            await loadFilesystemConfig(api);
        } catch (e) {
            alert('Error: ' + e.message);
        }
    });
}

// ── Section: Feature Toggles ────────────────────────────────
function populateFeatureGrid(currentConfig, api) {
    const grid = document.getElementById('bcFeatureGrid');
    if (!grid) return;

    const features = currentConfig.features || {};

    for (const def of FEATURE_DEFS) {
        const isEnabled = features[def.id]?.enabled !== false;
        const row = document.createElement('div');
        row.className = 'bc-feature-row';
        row.innerHTML = `
            <div class="bc-feature-info">
                <span class="bc-feature-icon">${escHtml(def.icon)}</span>
                <div>
                    <strong>${escHtml(def.label)}</strong>
                    <small class="text-muted">${escHtml(def.desc)}</small>
                </div>
            </div>
            <label class="toggle">
                <input type="checkbox" data-feature="${escAttr(def.id)}" ${isEnabled ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        `;

        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', async () => {
            const featureId = checkbox.dataset.feature;
            const enabled = checkbox.checked;
            const updatedFeatures = { ...features };
            if (!updatedFeatures[featureId]) updatedFeatures[featureId] = {};
            updatedFeatures[featureId] = { ...updatedFeatures[featureId], enabled };
            features[featureId] = updatedFeatures[featureId];
            try {
                await api.put('/config/features', { data: updatedFeatures });
                showStatus('bcFeatureStatus', `${def.label} ${enabled ? 'enabled' : 'disabled'}.`);
            } catch (e) {
                checkbox.checked = !enabled;
                showStatus('bcFeatureStatus', 'Error: ' + e.message, true);
            }
        });

        grid.appendChild(row);
    }
}

// ── Section: App Management Grid ────────────────────────────
function populateAppMgmtGrid(apps, currentConfig) {
    const grid = document.getElementById('bcAppMgmtGrid');
    if (!grid) return;

    const disabled = currentConfig.apps?.disabledApps || [];

    for (const [catKey, catApps] of Object.entries(apps)) {
        const label = CATEGORY_LABELS[catKey] || catKey;
        const section = document.createElement('div');
        section.className = 'bc-app-mgmt-section';
        section.innerHTML = `<div class="bc-app-mgmt-header">${escHtml(label)}</div>`;

        const items = document.createElement('div');
        items.className = 'bc-app-mgmt-items';

        for (const app of catApps) {
            const isEnabled = !disabled.includes(app.id);
            const item = document.createElement('label');
            item.className = 'bc-app-mgmt-item';
            item.innerHTML = `
                <input type="checkbox" data-app-id="${escAttr(app.id)}" ${isEnabled ? 'checked' : ''}>
                <span class="bc-app-mgmt-icon">${escHtml(app.icon)}</span>
                <span class="bc-app-mgmt-name">${escHtml(app.name)}</span>
            `;
            items.appendChild(item);
        }

        section.appendChild(items);
        grid.appendChild(section);
    }
}

// ── Section: Config Push ────────────────────────────────────
function initConfigPush(api, currentConfig) {
    const sectionSelect = document.getElementById('bcConfigSection');
    const desc          = document.getElementById('bcConfigDesc');
    const actions       = document.getElementById('bcConfigActions');
    const jsonEditor    = document.getElementById('bcConfigJsonEditor');

    let activeSectionKey = '';

    sectionSelect?.addEventListener('change', async () => {
        activeSectionKey = sectionSelect.value;
        const opt = sectionSelect.selectedOptions[0];

        document.querySelectorAll('.bc-config-subform').forEach(f => f.style.display = 'none');
        actions.style.display = activeSectionKey ? '' : 'none';

        if (!activeSectionKey) {
            desc.style.display = 'none';
            return;
        }

        if (opt?.dataset.desc) {
            desc.textContent = opt.dataset.desc;
            desc.style.display = '';
        }

        const specificForm = document.getElementById(`bcConfigForm_${activeSectionKey}`);
        if (specificForm) {
            specificForm.style.display = '';
            if (activeSectionKey === 'defaults') loadDefaultsForm(currentConfig);
            if (activeSectionKey === 'features') loadFeaturesForm(currentConfig);
        } else {
            document.getElementById('bcConfigForm_json').style.display = '';
            try {
                const data = await api.get(`/config/${activeSectionKey}`);
                jsonEditor.value = JSON.stringify(data, null, 2);
            } catch (e) {
                jsonEditor.value = `Error: ${e.message}`;
            }
        }
    });

    document.getElementById('btnBcConfigPush')?.addEventListener('click', async () => {
        if (!activeSectionKey) return;
        let data;

        const specificForm = document.getElementById(`bcConfigForm_${activeSectionKey}`);
        if (specificForm && specificForm.style.display !== 'none') {
            if (activeSectionKey === 'defaults') data = collectDefaultsForm();
            else if (activeSectionKey === 'features') data = collectFeaturesForm(currentConfig);
        }

        if (!data) {
            const raw = jsonEditor.value.trim();
            try { data = JSON.parse(raw); } catch {
                return showStatus('bcConfigStatus', 'Invalid JSON', true);
            }
        }

        try {
            await api.put(`/config/${activeSectionKey}`, { data });
            showStatus('bcConfigStatus', `${activeSectionKey} config pushed to all clients.`);
        } catch (e) {
            showStatus('bcConfigStatus', 'Error: ' + e.message, true);
        }
    });

    document.getElementById('btnBcConfigReset')?.addEventListener('click', async () => {
        if (!activeSectionKey) return;
        if (!confirm(`Reset "${activeSectionKey}" to defaults? This cannot be undone.`)) return;
        try {
            await api.delete(`/config/${activeSectionKey}`);
            showStatus('bcConfigStatus', `${activeSectionKey} reset to defaults.`);
            sectionSelect.dispatchEvent(new Event('change'));
        } catch (e) {
            showStatus('bcConfigStatus', 'Error: ' + e.message, true);
        }
    });
}

function loadDefaultsForm(config) {
    const d = config.defaults || {};
    setVal('bcCfgDefSound', String(!!d.sound));
    setVal('bcCfgDefCrt', String(d.crtEffect !== false));
    setVal('bcCfgDefPet', String(!!d.petEnabled));
    setVal('bcCfgDefPetType', d.petType || 'neko');
    setVal('bcCfgDefWallpaper', d.wallpaper || 'space');
    setVal('bcCfgDefColorScheme', d.colorScheme || 'slate');
    setVal('bcCfgDefBg', d.desktopBg || '#008080');
    setVal('bcCfgDefSsDelay', String(d.screensaverDelay || 300000));
}

function collectDefaultsForm() {
    return {
        sound: getVal('bcCfgDefSound') === 'true',
        crtEffect: getVal('bcCfgDefCrt') === 'true',
        petEnabled: getVal('bcCfgDefPet') === 'true',
        petType: getVal('bcCfgDefPetType'),
        wallpaper: getVal('bcCfgDefWallpaper'),
        colorScheme: getVal('bcCfgDefColorScheme'),
        desktopBg: getVal('bcCfgDefBg'),
        screensaverDelay: parseInt(getVal('bcCfgDefSsDelay'), 10),
    };
}

function loadFeaturesForm(config) {
    const container = document.getElementById('bcCfgFeatureRows');
    if (!container) return;
    const features = config.features || {};

    container.innerHTML = FEATURE_DEFS.map(def => {
        const feat = features[def.id] || {};
        const enabled = feat.enabled !== false;
        const cfg = feat.config || {};
        let extraFields = '';

        if (def.id === 'clippy') {
            extraFields = `
                <div class="inline-row"><label>Appearance Chance</label>
                    <input type="number" step="0.01" min="0" max="1" value="${cfg.appearanceChance ?? 0.15}" data-cfg="${def.id}.appearanceChance"></div>
                <div class="inline-row"><label>Auto-hide Delay (ms)</label>
                    <input type="number" value="${cfg.autoHideDelay ?? 8000}" data-cfg="${def.id}.autoHideDelay"></div>`;
        } else if (def.id === 'screensaver') {
            extraFields = `
                <div class="inline-row"><label>Mode</label>
                    <select data-cfg="${def.id}.mode">${SCREENSAVER_MODES.map(m => `<option value="${m}" ${cfg.mode === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
                <div class="inline-row"><label>Idle Timeout (ms)</label>
                    <input type="number" value="${cfg.idleTimeout ?? 300000}" data-cfg="${def.id}.idleTimeout"></div>`;
        } else if (def.id === 'achievements') {
            extraFields = `
                <div class="inline-row"><label>Show Toasts</label>
                    <select data-cfg="${def.id}.showToasts"><option value="true" ${cfg.showToasts !== false ? 'selected' : ''}>Yes</option><option value="false" ${cfg.showToasts === false ? 'selected' : ''}>No</option></select></div>`;
        } else if (def.id === 'soundsystem') {
            extraFields = `
                <div class="inline-row"><label>Master Volume</label>
                    <input type="range" min="0" max="1" step="0.1" value="${cfg.masterVolume ?? 0.5}" data-cfg="${def.id}.masterVolume" style="width:120px"></div>`;
        } else if (def.id === 'desktoppet') {
            extraFields = `
                <div class="inline-row"><label>Pet Type</label>
                    <select data-cfg="${def.id}.petType">${PET_TYPES.map(p => `<option value="${p}" ${cfg.petType === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>`;
        } else if (def.id === 'dvd-bouncer') {
            extraFields = `
                <div class="inline-row"><label>Auto-Start</label>
                    <select data-cfg="${def.id}.autoStart"><option value="false" ${!cfg.autoStart ? 'selected' : ''}>No</option><option value="true" ${cfg.autoStart ? 'selected' : ''}>Yes</option></select></div>
                <div class="inline-row"><label>Speed</label>
                    <input type="number" min="1" max="10" value="${cfg.speed ?? 2}" data-cfg="${def.id}.speed"></div>`;
        } else if (def.id === 'eastereggs') {
            extraFields = `
                <div class="inline-row"><label>Konami Code</label>
                    <select data-cfg="${def.id}.enableKonami"><option value="true" ${cfg.enableKonami !== false ? 'selected' : ''}>On</option><option value="false" ${cfg.enableKonami === false ? 'selected' : ''}>Off</option></select></div>
                <div class="inline-row"><label>Cheats</label>
                    <select data-cfg="${def.id}.enableCheats"><option value="true" ${cfg.enableCheats !== false ? 'selected' : ''}>On</option><option value="false" ${cfg.enableCheats === false ? 'selected' : ''}>Off</option></select></div>`;
        }

        return `
            <div class="bc-cfg-feature-block">
                <div class="bc-feature-row" style="margin-bottom:${extraFields ? '4px' : '0'}">
                    <div class="bc-feature-info">
                        <span class="bc-feature-icon">${escHtml(def.icon)}</span>
                        <strong>${escHtml(def.label)}</strong>
                    </div>
                    <label class="toggle">
                        <input type="checkbox" data-feat-enabled="${escAttr(def.id)}" ${enabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                </div>
                ${extraFields}
            </div>`;
    }).join('');
}

function collectFeaturesForm(currentConfig) {
    const features = { ...(currentConfig.features || {}) };
    for (const def of FEATURE_DEFS) {
        const enabledCb = document.querySelector(`[data-feat-enabled="${def.id}"]`);
        if (!enabledCb) continue;
        if (!features[def.id]) features[def.id] = {};
        features[def.id].enabled = enabledCb.checked;

        const cfgInputs = document.querySelectorAll(`[data-cfg^="${def.id}."]`);
        if (cfgInputs.length > 0) {
            if (!features[def.id].config) features[def.id].config = {};
            cfgInputs.forEach(input => {
                const key = input.dataset.cfg.split('.')[1];
                let val = input.value;
                if (val === 'true') val = true;
                else if (val === 'false') val = false;
                else if (!isNaN(val) && val !== '') val = parseFloat(val);
                features[def.id].config[key] = val;
            });
        }
    }
    return features;
}

// ── Shared helpers ──────────────────────────────────────────

async function doLaunchApp(api) {
    const appSelect = document.getElementById('bcAppSelect');
    const showParams = document.getElementById('bcShowParams');
    const launchBtn = document.getElementById('btnBcLaunchApp');
    const appId = appSelect.value;
    if (!appId) return;

    let params = {};
    if (showParams?.checked) {
        const pathVal = document.getElementById('bcParamPath').value;
        if (pathVal) params.initialPath = pathVal;
        const customRaw = document.getElementById('bcParamCustom').value.trim();
        if (customRaw) {
            try {
                const custom = JSON.parse(customRaw);
                if (custom && typeof custom === 'object' && !Array.isArray(custom)) {
                    params = { ...params, ...custom };
                } else {
                    return showStatus('bcLaunchStatus', 'Custom params must be a JSON object', true);
                }
            } catch {
                return showStatus('bcLaunchStatus', 'Invalid JSON in custom params', true);
            }
        }
    }

    launchBtn.disabled = true;
    try {
        await api.post('/system/actions/launch-app', {
            app_id: appId,
            params: Object.keys(params).length ? params : {}
        });
        showStatus('bcLaunchStatus', 'Launched! Broadcast sent to clients.');
    } catch (e) {
        showStatus('bcLaunchStatus', 'Error: ' + e.message, true);
    } finally {
        launchBtn.disabled = false;
    }
}

function populateAppSelect(apps) {
    const select = document.getElementById('bcAppSelect');
    if (!select) return;
    for (const [catKey, catApps] of Object.entries(apps)) {
        const label = CATEGORY_LABELS[catKey] || catKey;
        const group = document.createElement('optgroup');
        group.label = label;
        for (const app of catApps) {
            const opt = document.createElement('option');
            opt.value = app.id;
            opt.textContent = `${app.icon}  ${app.name}`;
            group.appendChild(opt);
        }
        select.appendChild(group);
    }
}

function populateQuickGrid(apps, api) {
    const grid = document.getElementById('bcQuickGrid');
    if (!grid) return;
    const quickIds = ['terminal', 'notepad', 'browser', 'paint', 'minesweeper', 'snake', 'doom', 'mediaplayer', 'solitaire', 'calculator'];
    const flat = Object.values(apps).flat();
    for (const id of quickIds) {
        const app = flat.find(a => a.id === id);
        if (!app) continue;
        const btn = document.createElement('button');
        btn.className = 'bc-quick-btn';
        btn.innerHTML = `<span class="bc-quick-icon">${escHtml(app.icon)}</span><span class="bc-quick-label">${escHtml(app.name)}</span>`;
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
                await api.post('/system/actions/launch-app', { app_id: id, params: {} });
                showStatus('bcQuickStatus', `${app.name} launched!`);
            } catch (e) {
                showStatus('bcQuickStatus', 'Error: ' + e.message, true);
            } finally {
                btn.disabled = false;
            }
        });
        grid.appendChild(btn);
    }
}

function populateEventSelect(events) {
    const select = document.getElementById('bcEventSelect');
    if (!select) return;
    for (const [catKey, catEvents] of Object.entries(events)) {
        const group = document.createElement('optgroup');
        group.label = catKey.charAt(0).toUpperCase() + catKey.slice(1);
        for (const evt of catEvents) {
            const opt = document.createElement('option');
            opt.value = evt.type;
            opt.textContent = evt.label;
            opt.dataset.desc = evt.desc || '';
            group.appendChild(opt);
        }
        select.appendChild(group);
    }
}

async function loadStats(api) {
    try {
        const stats = await api.get('/system/stats');
        setText('bcStatUsers', stats.users?.total ?? '--');
        setText('bcStatActive', stats.users?.active_15min ?? '--');
        setText('bcStatEvents', stats.events?.total_1hour ?? '--');
        const healthEl = document.getElementById('bcStatHealth');
        if (healthEl) {
            healthEl.textContent = 'Healthy';
            healthEl.className = 'bc-badge bc-badge-ok';
        }
    } catch {
        const healthEl = document.getElementById('bcStatHealth');
        if (healthEl) {
            healthEl.textContent = 'Error';
            healthEl.className = 'bc-badge bc-badge-err';
        }
    }
}

async function loadFilesystemConfig(api) {
    const editor = document.getElementById('bcFsEditor');
    if (!editor) return;
    try {
        const data = await api.get('/system/default-filesystem');
        editor.value = JSON.stringify(data.filesystem || {}, null, 2);
    } catch (e) {
        editor.value = `Error loading filesystem config: ${e.message}`;
    }
}

function showStatus(elementId, message, isError = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = 'bc-status ' + (isError ? 'bc-status-error' : 'bc-status-ok');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.textContent = ''; el.className = 'bc-status'; }, 5000);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}
function getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}
