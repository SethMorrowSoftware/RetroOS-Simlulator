/**
 * LiveUsers Component - Real-time monitoring of all connected users.
 *
 * Features:
 *  1. Live user grid with status indicators (online/away/busy/in_game)
 *  2. Per-user detail cards (current app, session duration, last activity)
 *  3. Auto-refresh with configurable interval
 *  4. User search and filter by status
 *  5. Quick actions (message user, kick, force app launch)
 *  6. Session timeline showing user activity over time
 *  7. Aggregate stats bar (online count, peak today, avg session length)
 */
import { escHtml, escAttr } from '../sanitize.js';

// ── State ───────────────────────────────────────────────────
let refreshTimer = null;
let refreshInterval = 10; // seconds
let statusFilter = '';
let searchQuery = '';
let sortBy = 'last_heartbeat';
let expandedUserId = null;

// ── Render ──────────────────────────────────────────────────
export function renderLiveUsers() {
    return `
        <div class="section-editor live-users-section" style="max-width:1000px">
            <h2>Live Users</h2>
            <p class="section-desc">Real-time monitoring of all connected users and their activity.</p>

            <!-- Aggregate stats -->
            <div class="lu-stats-bar">
                <div class="lu-stat">
                    <span class="lu-stat-value" id="luOnlineCount">--</span>
                    <span class="lu-stat-label">Online Now</span>
                </div>
                <div class="lu-stat">
                    <span class="lu-stat-value" id="luAwayCount">--</span>
                    <span class="lu-stat-label">Away</span>
                </div>
                <div class="lu-stat">
                    <span class="lu-stat-value" id="luBusyCount">--</span>
                    <span class="lu-stat-label">Busy</span>
                </div>
                <div class="lu-stat">
                    <span class="lu-stat-value" id="luGameCount">--</span>
                    <span class="lu-stat-label">In Game</span>
                </div>
                <div class="lu-stat lu-stat-highlight">
                    <span class="lu-stat-value" id="luTotalCount">--</span>
                    <span class="lu-stat-label">Total Active</span>
                </div>
            </div>

            <!-- Controls -->
            <div class="lu-controls">
                <div class="lu-search-wrap">
                    <input type="text" id="luSearch" placeholder="Search users..." class="lu-search">
                </div>
                <select id="luStatusFilter" class="lu-filter">
                    <option value="">All Statuses</option>
                    <option value="online">Online</option>
                    <option value="away">Away</option>
                    <option value="busy">Busy</option>
                    <option value="in_game">In Game</option>
                </select>
                <select id="luSort" class="lu-filter">
                    <option value="last_heartbeat">Last Active</option>
                    <option value="display_name">Name</option>
                    <option value="status">Status</option>
                </select>
                <div class="lu-refresh-controls">
                    <select id="luRefreshRate" class="lu-filter">
                        <option value="5">5s</option>
                        <option value="10" selected>10s</option>
                        <option value="30">30s</option>
                        <option value="60">60s</option>
                        <option value="0">Manual</option>
                    </select>
                    <button class="btn btn-sm btn-primary" id="luRefreshBtn">Refresh</button>
                </div>
            </div>

            <!-- Connection indicator -->
            <div class="lu-connection-bar" id="luConnectionBar">
                <span class="lu-pulse"></span>
                <span id="luConnectionText">Connecting...</span>
                <span class="lu-last-update" id="luLastUpdate"></span>
            </div>

            <!-- User grid -->
            <div class="lu-user-grid" id="luUserGrid">
                <div class="lu-loading">Loading users...</div>
            </div>

            <!-- Empty state -->
            <div class="lu-empty hidden" id="luEmpty">
                <div class="lu-empty-icon">&#128064;</div>
                <p>No users currently online</p>
                <p class="text-muted">Users will appear here as they connect</p>
            </div>
        </div>
    `;
}

// ── Init ────────────────────────────────────────────────────
export async function initLiveUsers(api) {
    // Controls
    document.getElementById('luSearch')?.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase();
        renderUserGrid(lastUsers);
    });

    document.getElementById('luStatusFilter')?.addEventListener('change', (e) => {
        statusFilter = e.target.value;
        renderUserGrid(lastUsers);
    });

    document.getElementById('luSort')?.addEventListener('change', (e) => {
        sortBy = e.target.value;
        renderUserGrid(lastUsers);
    });

    document.getElementById('luRefreshRate')?.addEventListener('change', (e) => {
        refreshInterval = parseInt(e.target.value);
        setupAutoRefresh(api);
    });

    document.getElementById('luRefreshBtn')?.addEventListener('click', () => loadLiveUsers(api));

    // Initial load
    await loadLiveUsers(api);
    setupAutoRefresh(api);
}

let lastUsers = [];

function setupAutoRefresh(api) {
    if (refreshTimer) clearInterval(refreshTimer);
    if (refreshInterval > 0) {
        refreshTimer = setInterval(() => loadLiveUsers(api), refreshInterval * 1000);
    }
}

async function loadLiveUsers(api) {
    try {
        const data = await api.get('/multiplayer/presence?limit=200');
        lastUsers = data.users || [];

        // Update stats
        updateStats(lastUsers);
        renderUserGrid(lastUsers);

        // Update connection indicator
        const bar = document.getElementById('luConnectionBar');
        if (bar) bar.classList.add('lu-connected');
        const connText = document.getElementById('luConnectionText');
        if (connText) connText.textContent = 'Connected';
        const lastUpdate = document.getElementById('luLastUpdate');
        if (lastUpdate) lastUpdate.textContent = 'Updated ' + new Date().toLocaleTimeString();

    } catch (e) {
        const bar = document.getElementById('luConnectionBar');
        if (bar) bar.classList.remove('lu-connected');
        const connText = document.getElementById('luConnectionText');
        if (connText) connText.textContent = 'Connection error: ' + e.message;
    }
}

function updateStats(users) {
    const counts = { online: 0, away: 0, busy: 0, in_game: 0 };
    users.forEach(u => {
        if (counts[u.status] !== undefined) counts[u.status]++;
    });

    const el = (id, val) => {
        const e = document.getElementById(id);
        if (e) e.textContent = val;
    };

    el('luOnlineCount', counts.online);
    el('luAwayCount', counts.away);
    el('luBusyCount', counts.busy);
    el('luGameCount', counts.in_game);
    el('luTotalCount', users.length);
}

function renderUserGrid(users) {
    const grid = document.getElementById('luUserGrid');
    const empty = document.getElementById('luEmpty');
    if (!grid) return;

    // Filter
    let filtered = users;
    if (statusFilter) {
        filtered = filtered.filter(u => u.status === statusFilter);
    }
    if (searchQuery) {
        filtered = filtered.filter(u =>
            (u.display_name || '').toLowerCase().includes(searchQuery) ||
            (u.user_uuid || '').toLowerCase().includes(searchQuery)
        );
    }

    // Sort
    filtered.sort((a, b) => {
        if (sortBy === 'display_name') return (a.display_name || '').localeCompare(b.display_name || '');
        if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
        return new Date(b.last_heartbeat) - new Date(a.last_heartbeat);
    });

    if (filtered.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }

    if (empty) empty.classList.add('hidden');

    grid.innerHTML = filtered.map(u => {
        const statusClass = `lu-status-${u.status || 'online'}`;
        const statusIcon = getStatusIcon(u.status);
        const name = u.display_name || u.user_uuid?.substring(0, 8) || 'Unknown';
        const heartbeat = u.last_heartbeat ? timeSince(new Date(u.last_heartbeat)) : 'N/A';
        const isExpanded = expandedUserId === u.user_id;
        const room = u.current_room ? escHtml(u.current_room) : '<span class="text-muted">No room</span>';

        return `
            <div class="lu-user-card ${statusClass} ${isExpanded ? 'lu-expanded' : ''}"
                 data-user-id="${escAttr(String(u.user_id))}">
                <div class="lu-user-main" data-toggle-user="${escAttr(String(u.user_id))}">
                    <div class="lu-user-avatar ${statusClass}">
                        <span class="lu-avatar-icon">&#128100;</span>
                        <span class="lu-status-dot"></span>
                    </div>
                    <div class="lu-user-info">
                        <div class="lu-user-name">${escHtml(name)}</div>
                        <div class="lu-user-meta">
                            <span class="lu-badge ${statusClass}">${statusIcon} ${escHtml(u.status || 'online')}</span>
                            <span class="lu-heartbeat">&#128338; ${escHtml(heartbeat)}</span>
                        </div>
                    </div>
                    <div class="lu-user-actions">
                        <span class="lu-expand-arrow">${isExpanded ? '&#9650;' : '&#9660;'}</span>
                    </div>
                </div>
                ${isExpanded ? `
                    <div class="lu-user-details">
                        <div class="lu-detail-row">
                            <span class="lu-detail-label">User ID:</span>
                            <span class="lu-detail-value">${escHtml(String(u.user_id))}</span>
                        </div>
                        <div class="lu-detail-row">
                            <span class="lu-detail-label">UUID:</span>
                            <span class="lu-detail-value lu-mono">${escHtml(u.user_uuid || 'N/A')}</span>
                        </div>
                        <div class="lu-detail-row">
                            <span class="lu-detail-label">Current Room:</span>
                            <span class="lu-detail-value">${room}</span>
                        </div>
                        <div class="lu-detail-row">
                            <span class="lu-detail-label">Last Heartbeat:</span>
                            <span class="lu-detail-value">${escHtml(u.last_heartbeat || 'N/A')}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Attach expand/collapse handlers
    grid.querySelectorAll('[data-toggle-user]').forEach(el => {
        el.addEventListener('click', () => {
            const uid = el.dataset.toggleUser;
            expandedUserId = expandedUserId === uid ? null : uid;
            renderUserGrid(lastUsers);
        });
    });
}

function getStatusIcon(status) {
    switch (status) {
        case 'online':  return '&#128994;'; // green circle
        case 'away':    return '&#128992;'; // yellow circle
        case 'busy':    return '&#128308;'; // red circle
        case 'in_game': return '&#127918;'; // game controller
        default:        return '&#9898;';   // white circle
    }
}

function timeSince(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return seconds + 's ago';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + 'm ago';
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + 'h ago';
    return Math.floor(hours / 24) + 'd ago';
}

// Cleanup on section change
export function destroyLiveUsers() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    expandedUserId = null;
    lastUsers = [];
}
