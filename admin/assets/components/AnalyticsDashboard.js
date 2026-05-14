/**
 * AnalyticsDashboard Component - System analytics, telemetry, and insights.
 *
 * Features:
 *  1. Event volume chart (ASCII bar chart - no external deps)
 *  2. Top events by type breakdown
 *  3. User session analytics (registrations, active users over time)
 *  4. App usage statistics (most launched apps)
 *  5. Error/audit event tracking
 *  6. Real-time event stream viewer
 *  7. Telemetry export (JSON download)
 *  8. Time range selector (1h, 6h, 24h, 7d, 30d)
 */
import { escHtml, escAttr } from '../sanitize.js';

// ── State ───────────────────────────────────────────────────
let currentRange = '24h';
let eventStreamTimer = null;
let analyticsData = null;

const TIME_RANGES = [
    { value: '1h',  label: '1 Hour',   minutes: 60 },
    { value: '6h',  label: '6 Hours',  minutes: 360 },
    { value: '24h', label: '24 Hours', minutes: 1440 },
    { value: '7d',  label: '7 Days',   minutes: 10080 },
    { value: '30d', label: '30 Days',  minutes: 43200 },
];

// ── Render ──────────────────────────────────────────────────
export function renderAnalyticsDashboard() {
    return `
        <div class="section-editor analytics-section" style="max-width:1000px">
            <h2>Analytics &amp; Telemetry</h2>
            <p class="section-desc">System-wide analytics, event telemetry, and usage insights.</p>

            <!-- Time range selector -->
            <div class="an-time-bar">
                ${TIME_RANGES.map(r => `
                    <button class="an-range-btn ${r.value === currentRange ? 'active' : ''}"
                            data-range="${escAttr(r.value)}">${escHtml(r.label)}</button>
                `).join('')}
                <div class="an-time-spacer"></div>
                <button class="btn btn-sm btn-secondary" id="anExportBtn">Export JSON</button>
                <button class="btn btn-sm btn-primary" id="anRefreshBtn">Refresh</button>
            </div>

            <!-- KPI Cards -->
            <div class="an-kpi-grid">
                <div class="an-kpi-card">
                    <div class="an-kpi-icon">&#128202;</div>
                    <div class="an-kpi-value" id="anTotalEvents">--</div>
                    <div class="an-kpi-label">Total Events</div>
                    <div class="an-kpi-trend" id="anEventsTrend"></div>
                </div>
                <div class="an-kpi-card">
                    <div class="an-kpi-icon">&#128100;</div>
                    <div class="an-kpi-value" id="anActiveUsers">--</div>
                    <div class="an-kpi-label">Active Users</div>
                    <div class="an-kpi-trend" id="anUsersTrend"></div>
                </div>
                <div class="an-kpi-card">
                    <div class="an-kpi-icon">&#128187;</div>
                    <div class="an-kpi-value" id="anAppLaunches">--</div>
                    <div class="an-kpi-label">App Launches</div>
                    <div class="an-kpi-trend" id="anLaunchesTrend"></div>
                </div>
                <div class="an-kpi-card">
                    <div class="an-kpi-icon">&#9888;</div>
                    <div class="an-kpi-value" id="anErrorCount">--</div>
                    <div class="an-kpi-label">Errors</div>
                    <div class="an-kpi-trend" id="anErrorsTrend"></div>
                </div>
                <div class="an-kpi-card">
                    <div class="an-kpi-icon">&#128338;</div>
                    <div class="an-kpi-value" id="anAvgSession">--</div>
                    <div class="an-kpi-label">Avg Session</div>
                </div>
                <div class="an-kpi-card">
                    <div class="an-kpi-icon">&#128640;</div>
                    <div class="an-kpi-value" id="anPeakUsers">--</div>
                    <div class="an-kpi-label">Peak Users</div>
                </div>
            </div>

            <!-- Event Volume Chart -->
            <div class="card">
                <div class="card-header">
                    <h3>Event Volume</h3>
                    <span class="text-muted" id="anChartRange"></span>
                </div>
                <div class="an-chart-container" id="anVolumeChart">
                    <div class="lu-loading">Loading chart data...</div>
                </div>
            </div>

            <!-- Two-column layout -->
            <div class="an-two-col">
                <!-- Top Event Types -->
                <div class="card">
                    <h3>Top Event Types</h3>
                    <div id="anEventTypes">
                        <div class="lu-loading">Loading...</div>
                    </div>
                </div>

                <!-- Top Apps -->
                <div class="card">
                    <h3>Most Used Apps</h3>
                    <div id="anTopApps">
                        <div class="lu-loading">Loading...</div>
                    </div>
                </div>
            </div>

            <!-- User Activity Breakdown -->
            <div class="card">
                <div class="card-header">
                    <h3>User Registrations</h3>
                </div>
                <div id="anUserActivity">
                    <div class="lu-loading">Loading...</div>
                </div>
            </div>

            <!-- Recent Audit Trail -->
            <div class="card">
                <div class="card-header">
                    <h3>Recent Audit Trail</h3>
                    <span class="text-muted">Last 50 entries</span>
                </div>
                <div class="an-audit-stream" id="anAuditStream">
                    <div class="lu-loading">Loading...</div>
                </div>
            </div>

            <!-- Live Event Stream -->
            <div class="card">
                <div class="card-header">
                    <h3>Live Event Stream</h3>
                    <div>
                        <button class="btn btn-sm" id="anStreamToggle">Pause</button>
                        <button class="btn btn-sm btn-secondary" id="anStreamClear">Clear</button>
                    </div>
                </div>
                <div class="an-event-stream" id="anEventStream">
                    <div class="an-stream-placeholder text-muted">Waiting for events...</div>
                </div>
            </div>
        </div>
    `;
}

// ── Init ────────────────────────────────────────────────────
export async function initAnalyticsDashboard(api) {
    // Time range buttons
    document.querySelectorAll('.an-range-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentRange = btn.dataset.range;
            document.querySelectorAll('.an-range-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadAnalytics(api);
        });
    });

    document.getElementById('anRefreshBtn')?.addEventListener('click', () => loadAnalytics(api));

    document.getElementById('anExportBtn')?.addEventListener('click', () => {
        if (!analyticsData) return;
        const blob = new Blob([JSON.stringify(analyticsData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `illuminatos-analytics-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });

    // Event stream controls
    let streamPaused = false;
    document.getElementById('anStreamToggle')?.addEventListener('click', (e) => {
        streamPaused = !streamPaused;
        e.target.textContent = streamPaused ? 'Resume' : 'Pause';
    });

    document.getElementById('anStreamClear')?.addEventListener('click', () => {
        const stream = document.getElementById('anEventStream');
        if (stream) stream.innerHTML = '<div class="an-stream-placeholder text-muted">Waiting for events...</div>';
    });

    // Load data
    await loadAnalytics(api);

    // Start event stream polling
    startEventStream(api, () => streamPaused);
}

async function loadAnalytics(api) {
    const range = TIME_RANGES.find(r => r.value === currentRange);
    const minutes = range?.minutes || 1440;

    try {
        // Load multiple data sources in parallel
        const [stats, audit, events] = await Promise.all([
            api.get('/system/stats'),
            api.get('/audit?limit=50'),
            api.get(`/system/analytics?range=${minutes}`).catch(() => null),
        ]);

        analyticsData = { stats, audit, range: currentRange, exported_at: new Date().toISOString() };

        // Update KPIs
        updateKPIs(stats, events);

        // Render event volume chart
        renderVolumeChart(events);

        // Render event type breakdown
        renderEventTypes(events);

        // Render top apps
        renderTopApps(events);

        // Render user activity
        renderUserActivity(stats, events);

        // Render audit trail
        renderAuditTrail(audit);

        // Chart range label
        const chartRange = document.getElementById('anChartRange');
        if (chartRange) chartRange.textContent = range?.label || '';

    } catch (e) {
        console.error('[Analytics] Load failed:', e);
    }
}

function updateKPIs(stats, events) {
    const el = (id, val) => {
        const e = document.getElementById(id);
        if (e) e.textContent = val;
    };

    el('anTotalEvents', formatNumber(events?.total_events ?? stats?.events?.total_1hour ?? 0));
    el('anActiveUsers', stats?.users?.active_15min ?? '--');
    el('anAppLaunches', formatNumber(events?.app_launches ?? 0));
    el('anErrorCount', formatNumber(events?.error_count ?? 0));
    el('anPeakUsers', events?.peak_users ?? stats?.users?.active_1hour ?? '--');

    // Average session duration
    const avgMs = events?.avg_session_minutes;
    if (avgMs && avgMs > 0) {
        el('anAvgSession', avgMs < 60 ? `${Math.round(avgMs)}m` : `${(avgMs / 60).toFixed(1)}h`);
    } else {
        el('anAvgSession', '--');
    }
}

function renderVolumeChart(events) {
    const container = document.getElementById('anVolumeChart');
    if (!container) return;

    const buckets = events?.volume_buckets || [];
    if (buckets.length === 0) {
        // Generate sample placeholder
        container.innerHTML = '<div class="an-chart-empty text-muted">No event data available for this time range</div>';
        return;
    }

    const maxVal = Math.max(...buckets.map(b => b.count), 1);
    const barWidth = Math.max(100 / buckets.length, 2);

    container.innerHTML = `
        <div class="an-bar-chart">
            <div class="an-bar-y-axis">
                <span>${formatNumber(maxVal)}</span>
                <span>${formatNumber(Math.round(maxVal / 2))}</span>
                <span>0</span>
            </div>
            <div class="an-bar-area">
                ${buckets.map((b, i) => {
                    const pct = Math.round((b.count / maxVal) * 100);
                    const label = b.label || '';
                    return `
                        <div class="an-bar-col" style="width:${barWidth}%" title="${escAttr(label + ': ' + b.count + ' events')}">
                            <div class="an-bar" style="height:${pct}%"></div>
                            ${buckets.length <= 24 ? `<span class="an-bar-label">${escHtml(label)}</span>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderEventTypes(events) {
    const container = document.getElementById('anEventTypes');
    if (!container) return;

    const types = events?.event_types || [];
    if (types.length === 0) {
        container.innerHTML = '<p class="text-muted">No event type data available</p>';
        return;
    }

    const maxCount = Math.max(...types.map(t => t.count), 1);

    container.innerHTML = types.slice(0, 15).map(t => `
        <div class="an-type-row">
            <div class="an-type-info">
                <span class="an-type-name">${escHtml(t.type)}</span>
                <span class="an-type-count">${formatNumber(t.count)}</span>
            </div>
            <div class="an-type-bar-bg">
                <div class="an-type-bar" style="width:${Math.round((t.count / maxCount) * 100)}%"></div>
            </div>
        </div>
    `).join('');
}

function renderTopApps(events) {
    const container = document.getElementById('anTopApps');
    if (!container) return;

    const apps = events?.top_apps || [];
    if (apps.length === 0) {
        container.innerHTML = '<p class="text-muted">No app usage data available</p>';
        return;
    }

    const maxCount = Math.max(...apps.map(a => a.count), 1);

    container.innerHTML = apps.slice(0, 15).map((a, i) => `
        <div class="an-type-row">
            <div class="an-type-info">
                <span class="an-type-rank">#${i + 1}</span>
                <span class="an-type-name">${escHtml(a.app_id || a.name)}</span>
                <span class="an-type-count">${formatNumber(a.count)}</span>
            </div>
            <div class="an-type-bar-bg">
                <div class="an-type-bar an-type-bar-alt" style="width:${Math.round((a.count / maxCount) * 100)}%"></div>
            </div>
        </div>
    `).join('');
}

function renderUserActivity(stats, events) {
    const container = document.getElementById('anUserActivity');
    if (!container) return;

    const regData = events?.registration_timeline || [];
    const totalUsers = stats?.users?.total ?? 0;
    const registered = stats?.users?.registered ?? 0;
    const anonymous = stats?.users?.anonymous ?? 0;

    let html = `
        <div class="an-user-stats-row">
            <div class="an-user-stat">
                <span class="an-user-stat-val">${formatNumber(totalUsers)}</span>
                <span class="an-user-stat-lbl">Total Users</span>
            </div>
            <div class="an-user-stat">
                <span class="an-user-stat-val">${formatNumber(registered)}</span>
                <span class="an-user-stat-lbl">Registered</span>
            </div>
            <div class="an-user-stat">
                <span class="an-user-stat-val">${formatNumber(anonymous)}</span>
                <span class="an-user-stat-lbl">Anonymous</span>
            </div>
        </div>
    `;

    if (regData.length > 0) {
        html += '<div class="an-reg-timeline">';
        const maxReg = Math.max(...regData.map(r => r.count), 1);
        html += regData.map(r => `
            <div class="an-reg-bar-col" title="${escAttr(r.label + ': ' + r.count + ' registrations')}">
                <div class="an-reg-bar" style="height:${Math.round((r.count / maxReg) * 100)}%"></div>
                <span class="an-reg-label">${escHtml(r.label)}</span>
            </div>
        `).join('');
        html += '</div>';
    }

    container.innerHTML = html;
}

function renderAuditTrail(audit) {
    const container = document.getElementById('anAuditStream');
    if (!container) return;

    const entries = audit?.entries || [];
    if (entries.length === 0) {
        container.innerHTML = '<p class="text-muted">No audit entries</p>';
        return;
    }

    container.innerHTML = `
        <div class="an-audit-table">
            ${entries.map(e => {
                const actionClass = e.action?.includes('delete') ? 'an-action-danger'
                    : e.action?.includes('create') ? 'an-action-success'
                    : e.action?.includes('login') ? 'an-action-info'
                    : '';
                return `
                    <div class="an-audit-row ${actionClass}">
                        <span class="an-audit-time">${escHtml(new Date(e.created_at).toLocaleString())}</span>
                        <span class="an-audit-action">${escHtml(e.action)}</span>
                        <span class="an-audit-user">${escHtml(e.display_name || 'System')}</span>
                        <span class="an-audit-target">${escHtml(e.target_id || '')}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

let lastEventId = 0;
let streamActive = true;

function startEventStream(api, isPaused) {
    if (eventStreamTimer) clearInterval(eventStreamTimer);

    eventStreamTimer = setInterval(async () => {
        if (isPaused()) return;

        try {
            const data = await api.get(`/system/event-stream?after=${lastEventId}&limit=20`).catch(() => null);
            if (!data || !data.events || data.events.length === 0) return;

            const stream = document.getElementById('anEventStream');
            if (!stream) return;

            // Remove placeholder
            const placeholder = stream.querySelector('.an-stream-placeholder');
            if (placeholder) placeholder.remove();

            data.events.forEach(evt => {
                if (evt.id > lastEventId) lastEventId = evt.id;

                const entry = document.createElement('div');
                entry.className = 'an-stream-entry an-stream-new';
                entry.innerHTML = `
                    <span class="an-stream-time">${escHtml(new Date(evt.created_at).toLocaleTimeString())}</span>
                    <span class="an-stream-type">${escHtml(evt.event_type)}</span>
                    <span class="an-stream-data">${escHtml(JSON.stringify(evt.payload || {}).substring(0, 120))}</span>
                `;
                stream.prepend(entry);

                // Remove animation class after animation
                setTimeout(() => entry.classList.remove('an-stream-new'), 500);
            });

            // Keep only last 100 entries
            while (stream.children.length > 100) {
                stream.removeChild(stream.lastChild);
            }
        } catch (e) {
            // Silently ignore stream errors
        }
    }, 5000);
}

function formatNumber(n) {
    if (typeof n !== 'number') return String(n);
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return String(n);
}

export function destroyAnalyticsDashboard() {
    if (eventStreamTimer) {
        clearInterval(eventStreamTimer);
        eventStreamTimer = null;
    }
    analyticsData = null;
    lastEventId = 0;
}
