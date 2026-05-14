/**
 * TimelineManager Component — Schedule narrative & system events for live ops.
 *
 * Lets the admin schedule events (mood shifts, NPC messages, custom payloads)
 * to fire either on demand or at a scheduled time. Backs the in-OS Timeline
 * Editor app's server-side counterpart.
 *
 * Endpoints:
 *   GET    /timeline                  list
 *   POST   /timeline                  create
 *   GET    /timeline/:id              fetch
 *   PUT    /timeline/:id              update
 *   DELETE /timeline/:id              delete
 *   POST   /timeline/:id/fire         manually fire
 *   POST   /timeline/run-due          fire all due entries
 */

import { escHtml, escAttr } from '../sanitize.js';

const COMMON_EVENT_TYPES = [
    { value: 'narrative.story.advance',    label: 'Advance Story' },
    { value: 'narrative.story.branch',     label: 'Branch Story' },
    { value: 'narrative.story.reveal',     label: 'Reveal Secret' },
    { value: 'narrative.mood.shift',       label: 'Shift Mood' },
    { value: 'narrative.mood.glitch',      label: 'Trigger Glitch' },
    { value: 'narrative.character.appear', label: 'Character Appears' },
    { value: 'narrative.character.speak',  label: 'Character Speaks' },
    { value: 'narrative.world.unlock',     label: 'Unlock Area' },
    { value: 'narrative.world.timer',      label: 'Start Timer' },
    { value: 'narrative.puzzle.hint',      label: 'Give Hint' },
    { value: 'narrative.puzzle.new',       label: 'New Puzzle' },
    { value: 'system.notification',        label: 'Notification' },
    { value: 'system.dialog',              label: 'Dialog' },
    { value: 'system.effect',              label: 'Visual Effect' },
    { value: 'announcement.created',       label: 'Announcement' },
    { value: 'custom',                     label: 'Custom (type below)' },
];

const STATE_BADGE = {
    scheduled: 'badge-info',
    fired:     'badge-success',
    cancelled: '',
};

export function renderTimelineManager() {
    return `
        <div class="section-editor">
            <h2>Timeline</h2>
            <p class="section-desc">
                Schedule narrative events for live ops. Entries fire at the scheduled time
                (when "Run Due" is invoked, or by a cron job hitting <code>POST /timeline/run-due</code>),
                or on demand via the <em>Fire Now</em> button.
            </p>

            <!-- ─── New / Edit Entry ─────────────────────── -->
            <div class="card">
                <div class="card-header">
                    <h3 id="tlFormTitle">New Timeline Entry</h3>
                    <button class="btn btn-sm btn-secondary" id="btnTlReset">Reset</button>
                </div>

                <input type="hidden" id="tlId" value="">

                <div class="inline-row">
                    <label>Label</label>
                    <input type="text" id="tlLabel" placeholder="e.g. Scene 2 introduction" maxlength="200">
                </div>

                <div class="inline-row">
                    <label>Campaign</label>
                    <select id="tlCampaign">
                        <option value="">— None (global) —</option>
                    </select>
                </div>

                <div class="inline-row">
                    <label>Event Type</label>
                    <select id="tlEventTypePreset">
                        ${COMMON_EVENT_TYPES.map(t => `<option value="${escAttr(t.value)}">${escHtml(t.label)} (${escHtml(t.value)})</option>`).join('')}
                    </select>
                </div>

                <div class="inline-row">
                    <label>Custom Type</label>
                    <input type="text" id="tlEventType" placeholder="e.g. campaign.act.advance" pattern="[a-zA-Z0-9._-]+">
                </div>

                <div class="form-group">
                    <label>Payload (JSON)</label>
                    <textarea id="tlPayload" rows="6" spellcheck="false" class="code-input">{}</textarea>
                    <small class="text-muted">JSON object delivered as the event payload.</small>
                </div>

                <div class="inline-row">
                    <label>Scheduled At</label>
                    <input type="datetime-local" id="tlScheduledAt">
                    <small class="text-muted">Leave blank for manual-only.</small>
                </div>

                <div class="form-actions">
                    <button class="btn btn-success" id="btnTlSave">Save Entry</button>
                    <button class="btn btn-secondary" id="btnTlValidate">Validate JSON</button>
                </div>
                <span id="tlStatus" class="bc-status"></span>
            </div>

            <!-- ─── Entry List ──────────────────────────── -->
            <div class="card">
                <div class="card-header">
                    <h3>Timeline Entries</h3>
                    <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                        <select id="tlFilterCampaign">
                            <option value="">All campaigns</option>
                        </select>
                        <select id="tlFilterState">
                            <option value="">All states</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="fired">Fired</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                        <button class="btn btn-sm btn-success" id="btnTlRunDue">Run Due</button>
                        <button class="btn btn-sm btn-secondary" id="btnTlRefresh">Refresh</button>
                    </div>
                </div>
                <div id="tlList">Loading...</div>
            </div>
        </div>
    `;
}

export async function initTimelineManager(api) {
    resetForm();

    document.getElementById('btnTlReset')?.addEventListener('click', () => resetForm());
    document.getElementById('btnTlRefresh')?.addEventListener('click', () => reload(api));
    document.getElementById('btnTlValidate')?.addEventListener('click', validatePayload);
    document.getElementById('btnTlSave')?.addEventListener('click', () => saveEntry(api));
    document.getElementById('btnTlRunDue')?.addEventListener('click', () => runDue(api));
    document.getElementById('tlFilterCampaign')?.addEventListener('change', () => reload(api));
    document.getElementById('tlFilterState')?.addEventListener('change', () => reload(api));

    // When the preset changes, populate the custom-type input
    document.getElementById('tlEventTypePreset')?.addEventListener('change', (e) => {
        if (e.target.value && e.target.value !== 'custom') {
            document.getElementById('tlEventType').value = e.target.value;
        } else if (e.target.value === 'custom') {
            document.getElementById('tlEventType').focus();
        }
    });

    await loadCampaigns(api);
    await reload(api);
}

function resetForm() {
    document.getElementById('tlFormTitle').textContent = 'New Timeline Entry';
    document.getElementById('tlId').value = '';
    document.getElementById('tlLabel').value = '';
    document.getElementById('tlCampaign').value = '';
    document.getElementById('tlEventTypePreset').value = COMMON_EVENT_TYPES[0].value;
    document.getElementById('tlEventType').value = COMMON_EVENT_TYPES[0].value;
    document.getElementById('tlPayload').value = '{\n}';
    document.getElementById('tlScheduledAt').value = '';
}

async function loadCampaigns(api) {
    try {
        const data = await api.get('/campaigns?limit=200');
        const items = data.campaigns || [];
        const formSelect = document.getElementById('tlCampaign');
        const filterSelect = document.getElementById('tlFilterCampaign');

        if (formSelect) {
            formSelect.innerHTML = '<option value="">— None (global) —</option>' +
                items.map(c => `<option value="${escAttr(c.id)}">${escHtml(c.name)} (${escHtml(c.slug)})</option>`).join('');
        }
        if (filterSelect) {
            filterSelect.innerHTML = '<option value="">All campaigns</option>' +
                items.map(c => `<option value="${escAttr(c.id)}">${escHtml(c.name)}</option>`).join('');
        }
    } catch (e) {
        // Non-fatal — leave just the "None" option
    }
}

function validatePayload() {
    const text = document.getElementById('tlPayload').value.trim();
    if (!text) return setStatus('Payload is empty.');
    try {
        const parsed = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            return setStatus('Payload must be a JSON object.', true);
        }
        setStatus('Payload JSON is valid.');
    } catch (e) {
        setStatus('Invalid JSON: ' + e.message, true);
    }
}

async function saveEntry(api) {
    const id = document.getElementById('tlId').value;
    const label = document.getElementById('tlLabel').value.trim();
    const campaignId = document.getElementById('tlCampaign').value;
    const eventType = document.getElementById('tlEventType').value.trim();
    const payloadText = document.getElementById('tlPayload').value.trim() || '{}';
    const scheduledRaw = document.getElementById('tlScheduledAt').value;

    if (!eventType || !/^[a-zA-Z0-9._-]+$/.test(eventType)) {
        return setStatus('event_type is required (alphanumeric, dots, dashes).', true);
    }

    let payload;
    try {
        payload = JSON.parse(payloadText);
    } catch (e) {
        return setStatus('Invalid payload JSON: ' + e.message, true);
    }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return setStatus('Payload must be a JSON object.', true);
    }

    const body = {
        label,
        event_type: eventType,
        payload,
        campaign_id: campaignId || null,
    };
    if (scheduledRaw) {
        // Convert datetime-local (browser local) → ISO 8601
        body.scheduled_at = new Date(scheduledRaw).toISOString();
    } else {
        body.scheduled_at = null;
    }

    try {
        if (id) {
            await api.put(`/timeline/${id}`, body);
            setStatus('Entry updated.');
        } else {
            const result = await api.post('/timeline', body);
            setStatus(`Entry #${result.entry?.id || '?'} scheduled.`);
        }
        resetForm();
        await reload(api);
    } catch (e) {
        setStatus('Save failed: ' + e.message, true);
    }
}

async function runDue(api) {
    if (!confirm('Fire all due timeline entries now?')) return;
    try {
        const result = await api.post('/timeline/run-due', {});
        setStatus(`Fired ${result.count || 0} due entries.`);
        await reload(api);
    } catch (e) {
        setStatus('Run-due failed: ' + e.message, true);
    }
}

async function reload(api) {
    const listEl = document.getElementById('tlList');
    const campaignId = document.getElementById('tlFilterCampaign')?.value || '';
    const state = document.getElementById('tlFilterState')?.value || '';

    const qs = [];
    if (campaignId) qs.push('campaign_id=' + encodeURIComponent(campaignId));
    if (state) qs.push('state=' + encodeURIComponent(state));
    const query = qs.length ? '?' + qs.join('&') : '';

    try {
        const data = await api.get('/timeline' + query);
        const entries = data.entries || [];

        if (entries.length === 0) {
            listEl.innerHTML = '<p class="text-muted">No timeline entries match the filter.</p>';
            return;
        }

        listEl.innerHTML = entries.map(renderRow).join('');
        wireRowHandlers(api);
    } catch (e) {
        listEl.innerHTML = `<p class="text-muted">Error loading timeline: ${escHtml(e.message)}</p>`;
    }
}

function renderRow(e) {
    const stateBadge = STATE_BADGE[e.state] || '';
    const isFired = e.state === 'fired';
    const isCancelled = e.state === 'cancelled';
    const scheduled = e.scheduled_at ? new Date(e.scheduled_at).toLocaleString() : '—';
    const fired = e.fired_at ? new Date(e.fired_at).toLocaleString() : null;
    const isOverdue = !isFired && !isCancelled && e.scheduled_at && new Date(e.scheduled_at) < new Date();

    return `
        <div class="list-item">
            <div class="item-content" style="flex-direction:column;align-items:flex-start;gap:4px">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <span class="badge ${stateBadge}">${escHtml(e.state)}</span>
                    <strong>${escHtml(e.label || e.event_type)}</strong>
                    <span class="text-muted" style="font-size:12px">${escHtml(e.event_type)}</span>
                    ${e.campaign_slug ? `<span class="badge badge-info">${escHtml(e.campaign_slug)}</span>` : ''}
                    ${isOverdue ? '<span class="badge badge-warning">Overdue</span>' : ''}
                </div>
                <div class="text-muted" style="font-size:12px">
                    Scheduled: ${escHtml(scheduled)}
                    ${fired ? ' &middot; Fired: ' + escHtml(fired) : ''}
                </div>
                <details style="width:100%;font-size:12px">
                    <summary class="text-muted">Payload</summary>
                    <pre style="margin:4px 0;padding:6px;background:rgba(0,0,0,0.2);border-radius:3px;max-height:200px;overflow:auto">${escHtml(JSON.stringify(e.payload || {}, null, 2))}</pre>
                </details>
            </div>
            <div class="item-actions" style="flex-direction:column;gap:4px">
                ${!isFired && !isCancelled ? `<button class="btn btn-sm btn-success btn-tl-fire" data-id="${escAttr(e.id)}">Fire Now</button>` : ''}
                <button class="btn btn-sm btn-secondary btn-tl-edit" data-id="${escAttr(e.id)}" ${isFired ? 'disabled' : ''}>Edit</button>
                <button class="btn btn-sm btn-danger btn-tl-delete" data-id="${escAttr(e.id)}">Delete</button>
            </div>
        </div>
    `;
}

function wireRowHandlers(api) {
    document.querySelectorAll('.btn-tl-edit').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                const data = await api.get(`/timeline/${btn.dataset.id}`);
                const e = data.entry;
                if (!e) throw new Error('Entry not found');
                document.getElementById('tlFormTitle').textContent = `Edit: ${e.label || e.event_type}`;
                document.getElementById('tlId').value = e.id;
                document.getElementById('tlLabel').value = e.label || '';
                document.getElementById('tlCampaign').value = e.campaign_id || '';
                document.getElementById('tlEventType').value = e.event_type;
                const preset = COMMON_EVENT_TYPES.find(t => t.value === e.event_type);
                document.getElementById('tlEventTypePreset').value = preset ? preset.value : 'custom';
                document.getElementById('tlPayload').value = JSON.stringify(e.payload || {}, null, 2);
                if (e.scheduled_at) {
                    // Convert UTC datetime to local for the datetime-local input
                    const d = new Date(e.scheduled_at);
                    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                    document.getElementById('tlScheduledAt').value = local;
                } else {
                    document.getElementById('tlScheduledAt').value = '';
                }
                document.getElementById('tlFormTitle').scrollIntoView({ behavior: 'smooth' });
            } catch (e) {
                setStatus('Load failed: ' + e.message, true);
            }
        });
    });

    document.querySelectorAll('.btn-tl-fire').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Fire this timeline entry now?')) return;
            try {
                const result = await api.post(`/timeline/${btn.dataset.id}/fire`, {});
                setStatus(`Fired — event #${result.event_id}`);
                await reload(api);
            } catch (e) { setStatus('Fire failed: ' + e.message, true); }
        });
    });

    document.querySelectorAll('.btn-tl-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this entry?')) return;
            try {
                await api.delete(`/timeline/${btn.dataset.id}`);
                setStatus('Entry deleted.');
                await reload(api);
            } catch (e) { setStatus('Delete failed: ' + e.message, true); }
        });
    });
}

function setStatus(message, isError = false) {
    const el = document.getElementById('tlStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'bc-status ' + (isError ? 'bc-status-error' : 'bc-status-ok');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.textContent = ''; el.className = 'bc-status'; }, 5000);
}
