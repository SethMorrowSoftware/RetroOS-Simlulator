/**
 * Dashboard Component - System overview and quick stats.
 */
import { escHtml } from '../sanitize.js';

export function renderDashboard(api) {
    return `
        <div class="section-editor">
            <h2>Dashboard</h2>
            <p class="section-desc">System overview and real-time statistics.</p>

            <div class="dashboard-grid">
                <div class="stat-card" id="statUsers">
                    <div class="stat-icon">&#128100;</div>
                    <div class="stat-value" id="statUsersValue">--</div>
                    <div class="stat-label">Total Users</div>
                </div>
                <div class="stat-card" id="statActive">
                    <div class="stat-icon">&#9889;</div>
                    <div class="stat-value" id="statActiveValue">--</div>
                    <div class="stat-label">Active (15min)</div>
                </div>
                <div class="stat-card" id="statEvents">
                    <div class="stat-icon">&#128227;</div>
                    <div class="stat-value" id="statEventsValue">--</div>
                    <div class="stat-label">Events (1hr)</div>
                </div>
                <div class="stat-card" id="statWebhooks">
                    <div class="stat-icon">&#128279;</div>
                    <div class="stat-value" id="statWebhooksValue">--</div>
                    <div class="stat-label">Webhooks</div>
                </div>
            </div>

            <div class="card" id="systemHealth">
                <h3>System Health</h3>
                <div id="healthStatus">Loading...</div>
            </div>

            <div class="card" id="recentAudit">
                <h3>Recent Activity</h3>
                <div id="auditList">Loading...</div>
            </div>
        </div>
    `;
}

export async function initDashboard(api) {
    // Load stats
    try {
        const stats = await api.get('/system/stats');
        document.getElementById('statUsersValue').textContent = stats.users?.total ?? '--';
        document.getElementById('statActiveValue').textContent = stats.users?.active_15min ?? '--';
        document.getElementById('statEventsValue').textContent = stats.events?.total_1hour ?? '--';
        document.getElementById('statWebhooksValue').textContent = stats.webhooks?.total ?? '--';

        document.getElementById('healthStatus').innerHTML = `
            <div class="health-row"><span>Database:</span> <span class="badge badge-success">Connected</span></div>
            <div class="health-row"><span>PHP Version:</span> <span>${escHtml(String(stats.server?.php_version ?? 'N/A'))}</span></div>
            <div class="health-row"><span>Server Uptime:</span> <span>${escHtml(String(stats.server?.uptime ?? 'N/A'))}</span></div>
            <div class="health-row"><span>Registered Users:</span> <span>${parseInt(stats.users?.registered) || 0}</span></div>
            <div class="health-row"><span>Anonymous Visitors:</span> <span>${parseInt(stats.users?.anonymous) || 0}</span></div>
        `;
    } catch (e) {
        document.getElementById('healthStatus').innerHTML =
            '<div class="badge badge-danger">Failed to load stats</div>';
    }

    // Load recent audit entries
    try {
        const audit = await api.get('/audit?limit=10');
        const entries = audit.entries || [];
        if (entries.length === 0) {
            document.getElementById('auditList').innerHTML = '<p class="text-muted">No recent activity</p>';
            return;
        }
        document.getElementById('auditList').innerHTML = entries.map(e => `
            <div class="audit-entry">
                <span class="audit-action">${escHtml(e.action)}</span>
                <span class="audit-user">${escHtml(e.display_name || 'System')}</span>
                <span class="audit-time">${new Date(e.created_at).toLocaleString()}</span>
            </div>
        `).join('');
    } catch (e) {
        document.getElementById('auditList').innerHTML = '<p class="text-muted">Unable to load audit log</p>';
    }
}

