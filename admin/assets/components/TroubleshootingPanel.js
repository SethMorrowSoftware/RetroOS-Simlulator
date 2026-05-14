import { escHtml } from '../sanitize.js';

let bound = false;
let activeApi = null;

export function renderTroubleshootingPanel() {
    return `
        <div class="section-editor">
            <h2>Troubleshooting</h2>
            <p class="section-desc">Run live diagnostics for backend, multiplayer, webhooks, and campaign/script runtime dependencies.</p>

            <div class="toolbar">
                <button class="btn btn-secondary" id="btnRunFullDiagnostics">Run Full Diagnostics</button>
                <button class="btn btn-secondary" id="btnRefreshWebhooks">Refresh Webhook Overview</button>
            </div>

            <div class="card">
                <h3>Service Health</h3>
                <div id="diagHealthStatus" class="text-muted">Not yet checked.</div>
                <div id="diagResults"></div>
            </div>

            <div class="card">
                <h3>Webhook Verification</h3>
                <p class="text-muted">Send test payloads and inspect recent delivery records without leaving admin.</p>
                <div id="webhookDiagSummary" class="text-muted">Loading...</div>
                <div id="webhookDiagList"></div>
            </div>

            <div class="card">
                <h3>What to validate before beta hardening</h3>
                <ul>
                    <li>System health reports <strong>healthy</strong> and database connection is up.</li>
                    <li>At least one active webhook receives <strong>2xx</strong> test deliveries.</li>
                    <li>Realtime stream endpoint and multiplayer websocket endpoint are reachable.</li>
                    <li>Campaign + scripting flows emit expected events visible in Audit Log.</li>
                    <li>Media file catalogs and playback apps can load representative audio/video assets.</li>
                </ul>
            </div>
        </div>
    `;
}

export async function initTroubleshootingPanel(api) {
    activeApi = api;
    bindEvents();
    await runFullDiagnostics();
}

function bindEvents() {
    if (bound) return;
    bound = true;

    document.addEventListener('click', async (event) => {
        const runBtn = event.target.closest('#btnRunFullDiagnostics');
        if (runBtn) {
            runBtn.disabled = true;
            runBtn.textContent = 'Running...';
            try {
                await runFullDiagnostics();
            } finally {
                runBtn.disabled = false;
                runBtn.textContent = 'Run Full Diagnostics';
            }
            return;
        }

        const refreshBtn = event.target.closest('#btnRefreshWebhooks');
        if (refreshBtn) {
            await loadWebhookDiagnostics();
            return;
        }

        const testBtn = event.target.closest('.btn-webhook-diagnostic-test');
        if (testBtn && activeApi) {
            const id = testBtn.dataset.webhookId;
            if (!id) return;
            testBtn.disabled = true;
            const before = testBtn.textContent;
            testBtn.textContent = 'Testing...';
            try {
                const resp = await activeApi.post(`/webhooks/${id}/test`, {});
                alert(`Webhook ${id} test: ${resp.success ? 'success' : 'failed'} (HTTP ${resp.status_code || 'n/a'})`);
                await loadWebhookDiagnostics();
            } catch (err) {
                alert(`Webhook ${id} test failed: ${err.message}`);
            } finally {
                testBtn.disabled = false;
                testBtn.textContent = before;
            }
        }
    });
}

async function runFullDiagnostics() {
    const results = [];

    try {
        const health = await activeApi.get('/system/health');
        const serviceStatus = String(health.status || 'unknown');
        const dbState = String(health.database || 'unknown');
        const dbOk = dbState === 'connected' || serviceStatus === 'healthy';

        results.push({ name: 'v2 /system/health reachable', ok: true, detail: `status=${serviceStatus}` });
        results.push({ name: 'Database connectivity', ok: dbOk, detail: dbState });
    } catch (err) {
        results.push({ name: 'v2 /system/health reachable', ok: false, detail: err.message });
    }

    try {
        const stats = await activeApi.get('/system/stats');
        const events = Number(stats.events?.latest_id || 0);
        const webhooksTotal = Number(stats.webhooks?.total || 0);
        results.push({ name: 'Event pipeline activity', ok: events >= 0, detail: `latest event id=${events}` });
        results.push({ name: 'Webhook subsystem visibility', ok: webhooksTotal >= 0, detail: `configured webhooks=${webhooksTotal}` });
    } catch (err) {
        results.push({ name: 'System stats endpoint', ok: false, detail: err.message });
    }

    try {
        const overview = await activeApi.get('/webhooks');
        const hooks = overview.webhooks || [];
        const activeCount = hooks.filter((h) => h.is_active).length;
        results.push({ name: 'Webhook listing endpoint', ok: true, detail: `${hooks.length} total (${activeCount} active)` });
    } catch (err) {
        results.push({ name: 'Webhook listing endpoint', ok: false, detail: err.message });
    }

    try {
        let liveUsers = null;
        let sourcePath = '';
        const presencePaths = ['/multiplayer/presence', '/presence/online'];
        let lastError = null;
        for (const path of presencePaths) {
            try {
                liveUsers = await activeApi.get(path);
                sourcePath = path;
                break;
            } catch (err) {
                lastError = err;
            }
        }
        if (!liveUsers) throw lastError || new Error('No presence endpoint available');
        const count = Array.isArray(liveUsers.users) ? liveUsers.users.length : 0;
        results.push({ name: 'Live users endpoint', ok: true, detail: `${count} active user(s) via ${sourcePath}` });
    } catch (err) {
        results.push({ name: 'Live users endpoint', ok: false, detail: err.message || 'Not found' });
    }

    renderDiagnostics(results);
    await loadWebhookDiagnostics();
}

function renderDiagnostics(results) {
    const healthEl = document.getElementById('diagHealthStatus');
    const listEl = document.getElementById('diagResults');
    if (!healthEl || !listEl) return;

    const failures = results.filter((r) => !r.ok).length;
    healthEl.textContent = failures === 0
        ? 'All checks passed. Continue with multiplayer/campaign/manual app validation.'
        : `${failures} check(s) need attention before beta hardening.`;

    listEl.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
            ${results.map((r) => `
                <div class="audit-entry" style="display:flex;gap:10px;align-items:center;">
                    <span class="badge ${r.ok ? 'badge-success' : 'badge-danger'}">${r.ok ? 'PASS' : 'FAIL'}</span>
                    <span style="font-weight:600;">${escHtml(r.name)}</span>
                    <span class="text-muted">${escHtml(r.detail || '')}</span>
                </div>
            `).join('')}
        </div>
    `;
}

async function loadWebhookDiagnostics() {
    const summaryEl = document.getElementById('webhookDiagSummary');
    const listEl = document.getElementById('webhookDiagList');
    if (!summaryEl || !listEl || !activeApi) return;

    try {
        const data = await activeApi.get('/webhooks');
        const hooks = data.webhooks || [];
        if (hooks.length === 0) {
            summaryEl.textContent = 'No webhooks configured yet.';
            listEl.innerHTML = '';
            return;
        }

        const activeCount = hooks.filter((h) => h.is_active).length;
        const failingCount = hooks.filter((h) => Number(h.failure_count || 0) > 0).length;
        summaryEl.textContent = `${hooks.length} configured • ${activeCount} active • ${failingCount} with failures`;

        listEl.innerHTML = hooks.map((hook) => `
            <div class="list-item" style="flex-wrap:wrap;align-items:flex-start;">
                <div class="item-content" style="flex-direction:column;align-items:flex-start;gap:2px;">
                    <strong>${escHtml(hook.url || '')}</strong>
                    <span class="text-muted">Events: ${escHtml((hook.events || []).join(', ') || 'none')}</span>
                    <span class="text-muted">Last status: ${escHtml(String(hook.last_status || '--'))} • Failures: ${escHtml(String(hook.failure_count || 0))}</span>
                </div>
                <div class="item-actions">
                    <button class="btn btn-sm btn-webhook-diagnostic-test" data-webhook-id="${escHtml(String(hook.id))}">Send Test</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        summaryEl.textContent = 'Failed to load webhook diagnostics.';
        listEl.innerHTML = `<p class="text-muted">${escHtml(err.message)}</p>`;
    }
}
