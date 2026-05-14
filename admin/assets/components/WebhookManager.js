/**
 * WebhookManager Component - Manage webhook subscriptions.
 */
import { escHtml, escAttr, escHtmlArray } from '../sanitize.js';

export function renderWebhookManager() {
    return `
        <div class="section-editor">
            <h2>Webhooks</h2>
            <p class="section-desc">Manage webhook subscriptions for external integrations.</p>

            <div class="toolbar">
                <button class="btn btn-secondary" id="btnAddWebhook">+ Add Webhook</button>
            </div>

            <div class="card" id="webhooksList">
                <p>Loading...</p>
            </div>

            <div id="webhookForm" class="card hidden">
                <h3 id="webhookFormTitle">New Webhook</h3>
                <div class="form-group">
                    <label>URL</label>
                    <input type="url" id="webhookUrl" placeholder="https://example.com/webhook">
                </div>
                <div class="form-group">
                    <label>Events (comma-separated)</label>
                    <input type="text" id="webhookEvents" placeholder="config.changed, user.login, *">
                    <small class="text-muted">Use * for all events, or prefix.* for wildcards</small>
                </div>
                <div class="form-actions">
                    <button class="btn btn-success" id="btnSaveWebhook">Save</button>
                    <button class="btn btn-secondary" id="btnCancelWebhook">Cancel</button>
                </div>
            </div>

            <div id="webhookDeliveries" class="card hidden">
                <h3>Delivery History</h3>
                <div id="deliveriesBody"></div>
                <button class="btn btn-secondary btn-sm" id="btnCloseDeliveries">Close</button>
            </div>
        </div>
    `;
}

export async function initWebhookManager(api) {
    await loadWebhooks(api);

    document.getElementById('btnAddWebhook')?.addEventListener('click', () => {
        document.getElementById('webhookForm').classList.remove('hidden');
        document.getElementById('webhookFormTitle').textContent = 'New Webhook';
        document.getElementById('webhookUrl').value = '';
        document.getElementById('webhookEvents').value = '';
    });

    document.getElementById('btnCancelWebhook')?.addEventListener('click', () => {
        document.getElementById('webhookForm').classList.add('hidden');
    });

    document.getElementById('btnSaveWebhook')?.addEventListener('click', async () => {
        const url = document.getElementById('webhookUrl').value.trim();
        const eventsStr = document.getElementById('webhookEvents').value.trim();
        const events = eventsStr.split(',').map(s => s.trim()).filter(Boolean);

        if (!url) { alert('URL is required'); return; }
        if (events.length === 0) { alert('At least one event is required'); return; }

        try {
            const result = await api.post('/webhooks', { url, events });
            if (result.webhook?.secret) {
                alert(`Webhook created! Save this signing secret (shown only once):\n\n${result.webhook.secret}`);
            }
            document.getElementById('webhookForm').classList.add('hidden');
            await loadWebhooks(api);
        } catch (e) {
            alert('Error: ' + e.message);
        }
    });

    document.getElementById('btnCloseDeliveries')?.addEventListener('click', () => {
        document.getElementById('webhookDeliveries').classList.add('hidden');
    });
}

async function loadWebhooks(api) {
    try {
        const data = await api.get('/webhooks');
        const webhooks = data.webhooks || [];

        if (webhooks.length === 0) {
            document.getElementById('webhooksList').innerHTML =
                '<p class="text-muted">No webhook subscriptions yet.</p>';
            return;
        }

        document.getElementById('webhooksList').innerHTML = webhooks.map(wh => `
            <div class="list-item webhook-item" data-id="${escAttr(wh.id)}">
                <div class="item-content" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                    <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
                        <strong style="flex: 1;">${escHtml(wh.url)}</strong>
                        <span class="badge ${wh.is_active ? 'badge-success' : 'badge-danger'}">${wh.is_active ? 'Active' : 'Disabled'}</span>
                    </div>
                    <div class="text-muted" style="font-size: 12px;">
                        Events: ${escHtmlArray(wh.events)} |
                        Last: ${wh.last_triggered ? escHtml(new Date(wh.last_triggered).toLocaleString()) : 'never'} |
                        Status: ${escHtml(String(wh.last_status || '--'))} |
                        Failures: ${parseInt(wh.failure_count) || 0}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-sm btn-test-webhook" data-id="${escAttr(wh.id)}">Test</button>
                    <button class="btn btn-sm btn-deliveries" data-id="${escAttr(wh.id)}">History</button>
                    <button class="btn btn-sm ${wh.is_active ? 'btn-warning' : 'btn-success'} btn-toggle-webhook" data-id="${escAttr(wh.id)}" data-active="${escAttr(String(wh.is_active))}">${wh.is_active ? 'Disable' : 'Enable'}</button>
                    <button class="btn btn-danger btn-sm btn-delete-webhook" data-id="${escAttr(wh.id)}">Delete</button>
                </div>
            </div>
        `).join('');

        // Event handlers
        document.querySelectorAll('.btn-test-webhook').forEach(btn => {
            btn.addEventListener('click', async () => {
                btn.textContent = 'Sending...';
                try {
                    const result = await api.post(`/webhooks/${btn.dataset.id}/test`);
                    alert(`Test result: ${result.success ? 'Success' : 'Failed'} (HTTP ${result.status_code})`);
                } catch (e) { alert('Error: ' + e.message); }
                btn.textContent = 'Test';
            });
        });

        document.querySelectorAll('.btn-toggle-webhook').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newState = btn.dataset.active !== 'true' && btn.dataset.active !== '1';
                try {
                    await api.put(`/webhooks/${btn.dataset.id}`, { is_active: newState });
                    await loadWebhooks(api);
                } catch (e) { alert('Error: ' + e.message); }
            });
        });

        document.querySelectorAll('.btn-delete-webhook').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this webhook?')) return;
                try {
                    await api.delete(`/webhooks/${btn.dataset.id}`);
                    await loadWebhooks(api);
                } catch (e) { alert('Error: ' + e.message); }
            });
        });

        document.querySelectorAll('.btn-deliveries').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    const data = await api.get(`/webhooks/${btn.dataset.id}/deliveries`);
                    const deliveries = data.deliveries || [];
                    const container = document.getElementById('webhookDeliveries');
                    container.classList.remove('hidden');

                    if (deliveries.length === 0) {
                        document.getElementById('deliveriesBody').innerHTML = '<p class="text-muted">No deliveries yet</p>';
                        return;
                    }

                    document.getElementById('deliveriesBody').innerHTML = deliveries.map(d => `
                        <div class="audit-entry">
                            <span class="badge ${parseInt(d.status_code) >= 200 && parseInt(d.status_code) < 300 ? 'badge-success' : 'badge-danger'}">${parseInt(d.status_code) || 0}</span>
                            <span>${escHtml(d.event_type)}</span>
                            <span class="text-muted">#${parseInt(d.attempt) || 0}</span>
                            <span class="audit-time">${escHtml(new Date(d.created_at).toLocaleString())}</span>
                        </div>
                    `).join('');
                } catch (e) { alert('Error: ' + e.message); }
            });
        });
    } catch (e) {
        document.getElementById('webhooksList').innerHTML =
            `<p class="text-muted">Error: ${escHtml(e.message)}</p>`;
    }
}

