/**
 * CampaignManager Component — Server-side campaign registry & lifecycle.
 *
 * Lets the admin upload, edit, publish and activate campaign packages.
 * Pairs with the frontend Campaign Studio app for authoring/playback.
 *
 * Endpoints:
 *   GET    /campaigns                    list
 *   GET    /campaigns/active             active
 *   POST   /campaigns                    create
 *   GET    /campaigns/:id                fetch
 *   PUT    /campaigns/:id                update
 *   DELETE /campaigns/:id                delete
 *   POST   /campaigns/:id/activate       set as live
 *   POST   /campaigns/:id/deactivate     clear active flag
 *   POST   /campaigns/:id/publish        status → published
 */

import { escHtml, escAttr } from '../sanitize.js';

const STATUS_LABEL = {
    draft:     { label: 'Draft',     badge: 'badge-info' },
    published: { label: 'Published', badge: 'badge-success' },
    archived:  { label: 'Archived',  badge: '' },
};

const STARTER_MANIFEST = {
    id: '',
    name: '',
    version: '1.0.0',
    description: '',
    engine: { minVersion: '1.0.0' },
    entryScript: 'autoexec.retro',
    capabilities: { liveOps: true, telemetry: true, highFidelityMedia: false },
    mediaBudgets: { maxConcurrentAudio: 4, maxConcurrentVideo: 1, maxPreloadedAssets: 32, maxPreloadBytes: 16777216 },
    migration: 'fresh',
};

const STARTER_BINDINGS = {
    bindings: [
        { event: 'story:campaign:enable', action: 'runScript', script: 'autoexec.retro' },
    ],
};

export function renderCampaignManager() {
    return `
        <div class="section-editor">
            <h2>Campaigns</h2>
            <p class="section-desc">
                Server-side registry of interactive narrative campaigns. Activate a campaign here
                to have new clients pick it up at boot. Use the in-OS Campaign Studio app for
                authoring scripts, mail, NPCs, and moods inside a campaign package.
            </p>

            <!-- ─── New / Edit Campaign ──────────────────── -->
            <div class="card">
                <div class="card-header">
                    <h3 id="campFormTitle">New Campaign</h3>
                    <button class="btn btn-sm btn-secondary" id="btnCampReset">Reset</button>
                </div>

                <input type="hidden" id="campId" value="">

                <div class="inline-row">
                    <label>Slug</label>
                    <input type="text" id="campSlug" placeholder="my-campaign" pattern="[a-z0-9-]+" maxlength="64">
                    <small class="text-muted">Lowercase, hyphens. Unique.</small>
                </div>
                <div class="inline-row">
                    <label>Name</label>
                    <input type="text" id="campName" placeholder="Display name" maxlength="200">
                </div>
                <div class="inline-row">
                    <label>Version</label>
                    <input type="text" id="campVersion" placeholder="1.0.0" maxlength="40" value="1.0.0">
                </div>
                <div class="form-group">
                    <label>Description</label>
                    <textarea id="campDescription" rows="2" maxlength="2000" placeholder="Short summary"></textarea>
                </div>
                <div class="inline-row">
                    <label>Status</label>
                    <select id="campStatus">
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="archived">Archived</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Manifest (JSON)</label>
                    <textarea id="campManifest" rows="8" spellcheck="false" class="code-input"></textarea>
                    <small class="text-muted">campaign.json content. Must be valid JSON.</small>
                </div>

                <div class="form-group">
                    <label>Bindings (JSON)</label>
                    <textarea id="campBindings" rows="6" spellcheck="false" class="code-input"></textarea>
                    <small class="text-muted">bindings.json content. Event → script wiring.</small>
                </div>

                <div class="form-group">
                    <label>Import from package.json file</label>
                    <input type="file" id="campImportFile" accept=".json,application/json">
                    <small class="text-muted">Drop a campaign.json or bindings.json to auto-fill the field above.</small>
                </div>

                <div class="form-actions">
                    <button class="btn btn-success" id="btnCampSave">Save Campaign</button>
                    <button class="btn btn-secondary" id="btnCampValidate">Validate JSON</button>
                </div>
                <span id="campStatus" class="bc-status"></span>
            </div>

            <!-- ─── Campaign List ────────────────────────── -->
            <div class="card">
                <div class="card-header">
                    <h3>Registered Campaigns</h3>
                    <div style="display:flex;gap:6px;align-items:center">
                        <select id="campFilter">
                            <option value="">All</option>
                            <option value="draft">Draft</option>
                            <option value="published">Published</option>
                            <option value="archived">Archived</option>
                        </select>
                        <button class="btn btn-sm btn-secondary" id="btnCampRefresh">Refresh</button>
                    </div>
                </div>
                <div id="campList">Loading...</div>
            </div>

            <!-- ─── Active Campaign Summary ──────────────── -->
            <div class="card">
                <h3>Live Campaign</h3>
                <div id="campActive">Loading...</div>
            </div>
        </div>
    `;
}

export async function initCampaignManager(api) {
    resetForm();

    document.getElementById('btnCampReset')?.addEventListener('click', () => resetForm());
    document.getElementById('btnCampRefresh')?.addEventListener('click', () => reload(api));
    document.getElementById('campFilter')?.addEventListener('change', () => reload(api));
    document.getElementById('btnCampValidate')?.addEventListener('click', validateJsonFields);
    document.getElementById('btnCampSave')?.addEventListener('click', () => saveCampaign(api));

    document.getElementById('campImportFile')?.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            // Heuristic: detect manifest vs bindings shape
            if (Array.isArray(data?.bindings)) {
                document.getElementById('campBindings').value = JSON.stringify(data, null, 2);
                setStatus('Loaded as bindings.json');
            } else {
                document.getElementById('campManifest').value = JSON.stringify(data, null, 2);
                if (data.id && !document.getElementById('campSlug').value) {
                    document.getElementById('campSlug').value = data.id;
                }
                if (data.name && !document.getElementById('campName').value) {
                    document.getElementById('campName').value = data.name;
                }
                if (data.version) {
                    document.getElementById('campVersion').value = data.version;
                }
                if (data.description) {
                    document.getElementById('campDescription').value = data.description;
                }
                setStatus('Loaded as campaign.json');
            }
        } catch (err) {
            setStatus('Could not parse file: ' + err.message, true);
        }
        // Allow re-upload of the same file
        e.target.value = '';
    });

    await reload(api);
}

function resetForm() {
    document.getElementById('campFormTitle').textContent = 'New Campaign';
    document.getElementById('campId').value = '';
    document.getElementById('campSlug').value = '';
    document.getElementById('campName').value = '';
    document.getElementById('campVersion').value = '1.0.0';
    document.getElementById('campDescription').value = '';
    document.getElementById('campStatus').value = 'draft';
    document.getElementById('campManifest').value = JSON.stringify(STARTER_MANIFEST, null, 2);
    document.getElementById('campBindings').value = JSON.stringify(STARTER_BINDINGS, null, 2);
}

function validateJsonFields() {
    const fields = ['campManifest', 'campBindings'];
    const errors = [];
    for (const id of fields) {
        const text = document.getElementById(id).value.trim();
        if (!text) continue;
        try {
            JSON.parse(text);
        } catch (e) {
            errors.push(`${id}: ${e.message}`);
        }
    }
    if (errors.length === 0) {
        setStatus('JSON is valid.');
    } else {
        setStatus('Invalid JSON: ' + errors.join('; '), true);
    }
}

async function saveCampaign(api) {
    const id = document.getElementById('campId').value;
    const slug = document.getElementById('campSlug').value.trim();
    const name = document.getElementById('campName').value.trim();
    const version = document.getElementById('campVersion').value.trim();
    const description = document.getElementById('campDescription').value.trim();
    const status = document.getElementById('campStatus').value;
    const manifestText = document.getElementById('campManifest').value.trim();
    const bindingsText = document.getElementById('campBindings').value.trim();

    if (!slug || !name) {
        setStatus('Slug and name are required.', true);
        return;
    }

    let manifest = {};
    let bindings = {};
    try {
        if (manifestText) manifest = JSON.parse(manifestText);
        if (bindingsText) bindings = JSON.parse(bindingsText);
    } catch (e) {
        setStatus('Invalid JSON: ' + e.message, true);
        return;
    }

    const body = { slug, name, version, description, status, manifest, bindings };

    try {
        if (id) {
            await api.put(`/campaigns/${id}`, body);
            setStatus(`Campaign "${slug}" updated.`);
        } else {
            const result = await api.post('/campaigns', body);
            setStatus(`Campaign "${slug}" created (id #${result.campaign?.id || '?'}).`);
        }
        resetForm();
        await reload(api);
    } catch (e) {
        setStatus('Save failed: ' + e.message, true);
    }
}

async function reload(api) {
    const listEl = document.getElementById('campList');
    const activeEl = document.getElementById('campActive');
    const filter = document.getElementById('campFilter')?.value || '';

    try {
        const [listData, activeData] = await Promise.all([
            api.get('/campaigns' + (filter ? `?status=${encodeURIComponent(filter)}` : '')),
            api.get('/campaigns/active'),
        ]);

        const items = listData.campaigns || [];
        if (items.length === 0) {
            listEl.innerHTML = '<p class="text-muted">No campaigns registered yet. Create one with the form above.</p>';
        } else {
            listEl.innerHTML = items.map(renderRow).join('');
            wireRowHandlers(api);
        }

        const active = activeData?.campaign;
        if (active) {
            activeEl.innerHTML = `
                <div class="list-item">
                    <div class="item-content" style="flex-direction:column;align-items:flex-start;gap:2px">
                        <strong>${escHtml(active.name)}</strong>
                        <span class="text-muted" style="font-size:12px">${escHtml(active.slug)} &middot; v${escHtml(active.version)} &middot; ${escHtml(active.status)}</span>
                        ${active.description ? `<span style="font-size:12px">${escHtml(active.description)}</span>` : ''}
                    </div>
                </div>
            `;
        } else {
            activeEl.innerHTML = '<p class="text-muted">No campaign is currently active. Activate one above to make it live for new clients.</p>';
        }
    } catch (e) {
        listEl.innerHTML = `<p class="text-muted">Error loading campaigns: ${escHtml(e.message)}</p>`;
        activeEl.innerHTML = '';
    }
}

function renderRow(c) {
    const label = STATUS_LABEL[c.status] || { label: c.status, badge: 'badge-info' };
    return `
        <div class="list-item">
            <div class="item-content" style="flex-direction:column;align-items:flex-start;gap:4px;">
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <strong>${escHtml(c.name)}</strong>
                    <span class="text-muted" style="font-size:12px">${escHtml(c.slug)}</span>
                    <span class="badge ${label.badge}">${escHtml(label.label)}</span>
                    ${c.is_active ? '<span class="badge badge-success">ACTIVE</span>' : ''}
                    <span class="text-muted" style="font-size:11px">v${escHtml(c.version)}</span>
                </div>
                ${c.description ? `<span class="text-muted" style="font-size:12px">${escHtml(c.description.substring(0, 200))}${c.description.length > 200 ? '…' : ''}</span>` : ''}
                <span class="text-muted" style="font-size:11px">
                    by ${escHtml(c.author_name || 'unknown')} &middot;
                    updated ${c.updated_at ? new Date(c.updated_at).toLocaleString() : '—'}
                </span>
            </div>
            <div class="item-actions" style="flex-direction:column;gap:4px">
                <button class="btn btn-sm btn-secondary btn-camp-edit" data-id="${escAttr(c.id)}">Edit</button>
                ${c.is_active
                    ? `<button class="btn btn-sm btn-warning btn-camp-deactivate" data-id="${escAttr(c.id)}">Deactivate</button>`
                    : `<button class="btn btn-sm btn-success btn-camp-activate" data-id="${escAttr(c.id)}">Activate</button>`}
                ${c.status !== 'published'
                    ? `<button class="btn btn-sm btn-secondary btn-camp-publish" data-id="${escAttr(c.id)}">Publish</button>` : ''}
                <button class="btn btn-sm btn-danger btn-camp-delete" data-id="${escAttr(c.id)}">Delete</button>
            </div>
        </div>
    `;
}

function wireRowHandlers(api) {
    document.querySelectorAll('.btn-camp-edit').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                const data = await api.get(`/campaigns/${btn.dataset.id}`);
                const c = data.campaign;
                if (!c) throw new Error('Campaign not found');
                document.getElementById('campFormTitle').textContent = `Edit: ${c.name}`;
                document.getElementById('campId').value = c.id;
                document.getElementById('campSlug').value = c.slug || '';
                document.getElementById('campName').value = c.name || '';
                document.getElementById('campVersion').value = c.version || '1.0.0';
                document.getElementById('campDescription').value = c.description || '';
                document.getElementById('campStatus').value = c.status || 'draft';
                document.getElementById('campManifest').value = JSON.stringify(c.manifest || {}, null, 2);
                document.getElementById('campBindings').value = JSON.stringify(c.bindings || {}, null, 2);
                document.getElementById('campFormTitle').scrollIntoView({ behavior: 'smooth' });
            } catch (e) {
                setStatus('Load failed: ' + e.message, true);
            }
        });
    });

    document.querySelectorAll('.btn-camp-activate').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await api.post(`/campaigns/${btn.dataset.id}/activate`, {});
                setStatus('Campaign activated.');
                await reload(api);
            } catch (e) { setStatus('Activate failed: ' + e.message, true); }
        });
    });

    document.querySelectorAll('.btn-camp-deactivate').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await api.post(`/campaigns/${btn.dataset.id}/deactivate`, {});
                setStatus('Campaign deactivated.');
                await reload(api);
            } catch (e) { setStatus('Deactivate failed: ' + e.message, true); }
        });
    });

    document.querySelectorAll('.btn-camp-publish').forEach(btn => {
        btn.addEventListener('click', async () => {
            try {
                await api.post(`/campaigns/${btn.dataset.id}/publish`, {});
                setStatus('Campaign published.');
                await reload(api);
            } catch (e) { setStatus('Publish failed: ' + e.message, true); }
        });
    });

    document.querySelectorAll('.btn-camp-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Delete this campaign? This cannot be undone.')) return;
            try {
                await api.delete(`/campaigns/${btn.dataset.id}`);
                setStatus('Campaign deleted.');
                await reload(api);
            } catch (e) { setStatus('Delete failed: ' + e.message, true); }
        });
    });
}

function setStatus(message, isError = false) {
    const el = document.getElementById('campStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'bc-status ' + (isError ? 'bc-status-error' : 'bc-status-ok');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.textContent = ''; el.className = 'bc-status'; }, 5000);
}
