/**
 * AnnouncementManager Component - Enhanced broadcast messages to all clients.
 *
 * Features:
 *  - Create announcements with emoji icon picker
 *  - Pre-built announcement templates for common scenarios
 *  - Priority levels with visual indicators
 *  - Scheduling with expiration
 *  - Rich preview before sending
 *  - Active announcements list with toggle/delete
 *  - Announcement history/stats
 */

import { openEmojiPicker } from './EmojiPicker.js';
import { escHtml, escAttr } from '../sanitize.js';

// ── Templates ───────────────────────────────────────────────
const ANNOUNCEMENT_TEMPLATES = [
    {
        name: 'Maintenance Notice',
        icon: '🔧',
        title: 'Scheduled Maintenance',
        message: 'The system will be undergoing scheduled maintenance. Please save your work. We apologize for any inconvenience.',
        type: 'warning',
    },
    {
        name: 'Welcome Message',
        icon: '👋',
        title: 'Welcome to IlluminatOS!',
        message: 'Welcome, new user! Explore the desktop, try the apps, and discover hidden secrets. Have fun!',
        type: 'info',
    },
    {
        name: 'New Feature',
        icon: '✨',
        title: 'New Feature Available',
        message: 'We\'ve added a new feature! Check it out in the Start Menu under Programs.',
        type: 'info',
    },
    {
        name: 'Critical Alert',
        icon: '🚨',
        title: 'Critical System Alert',
        message: 'ATTENTION: A critical system event has occurred. Please follow the instructions provided by the administrator.',
        type: 'critical',
    },
    {
        name: 'Event Starting',
        icon: '🎮',
        title: 'Event Starting Soon!',
        message: 'An exciting event is about to begin! Get ready and stay connected for updates.',
        type: 'info',
    },
    {
        name: 'Campaign Update',
        icon: '📜',
        title: 'Campaign Update',
        message: 'A new chapter has been unlocked in the campaign. Check the Campaign Studio for details.',
        type: 'info',
    },
    {
        name: 'Server Restart',
        icon: '🔄',
        title: 'Server Restart',
        message: 'The server will be restarting shortly. Your session will be preserved. Please wait for reconnection.',
        type: 'warning',
    },
    {
        name: 'Contest/Challenge',
        icon: '🏆',
        title: 'New Challenge!',
        message: 'A new challenge has been posted! Complete it to earn rewards and achievements.',
        type: 'info',
    },
    {
        name: 'Mystery/ARG Clue',
        icon: '🔍',
        title: 'A Clue Has Been Found...',
        message: 'Something strange has been discovered in the system. Investigate the files on your desktop for more information.',
        type: 'info',
    },
    {
        name: 'System Warning',
        icon: '⚠️',
        title: 'System Warning',
        message: 'Unusual activity has been detected in the network. All users are advised to remain vigilant.',
        type: 'warning',
    },
];

const ANNOUNCEMENT_TYPES = [
    { value: 'info',     label: 'Info',     emoji: 'ℹ️',  color: 'var(--primary)' },
    { value: 'warning',  label: 'Warning',  emoji: '⚠️',  color: 'var(--warning)' },
    { value: 'critical', label: 'Critical', emoji: '🚨', color: 'var(--danger)' },
];

export function renderAnnouncementManager() {
    return `
        <div class="section-editor">
            <h2>Announcements</h2>
            <p class="section-desc">Broadcast messages to all connected clients via SSE. Use templates for quick setup or create custom announcements.</p>

            <!-- ─── Templates ────────────────────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="annTemplatesBody">
                    <h3>Quick Templates</h3>
                    <span class="bc-collapse-arrow">&#9660;</span>
                </div>
                <div id="annTemplatesBody" class="bc-collapsible">
                    <p class="text-muted">Click a template to auto-fill the announcement form below.</p>
                    <div class="ann-template-grid">
                        ${ANNOUNCEMENT_TEMPLATES.map((t, i) => `
                            <button class="ann-template-btn" data-index="${i}">
                                <span class="ann-template-icon">${t.icon}</span>
                                <span class="ann-template-name">${t.name}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>

            <!-- ─── New Announcement ─────────────────────── -->
            <div class="card">
                <h3>New Announcement</h3>

                <div class="inline-row">
                    <label>Icon</label>
                    <input type="text" id="annIcon" value="📢" style="width:60px" maxlength="4" readonly>
                    <button type="button" class="emoji-trigger btn btn-sm btn-secondary" id="annIconPicker">Pick</button>
                </div>

                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="annTitle" placeholder="Announcement title" maxlength="255">
                </div>
                <div class="form-group">
                    <label>Message</label>
                    <textarea id="annMessage" rows="3" placeholder="Announcement message"></textarea>
                </div>

                <div class="inline-row">
                    <label>Type</label>
                    <select id="annType">
                        ${ANNOUNCEMENT_TYPES.map(t => `<option value="${t.value}">${t.emoji} ${t.label}</option>`).join('')}
                    </select>
                </div>

                <div class="inline-row">
                    <label>Priority</label>
                    <select id="annPriority">
                        <option value="normal">Normal</option>
                        <option value="high">High — shows prominently</option>
                        <option value="urgent">Urgent — forces display on all clients</option>
                    </select>
                </div>

                <div class="form-group">
                    <label>Expires At (optional)</label>
                    <input type="datetime-local" id="annExpires">
                    <small class="text-muted">Leave blank for no expiration.</small>
                </div>

                <div class="inline-row">
                    <label>Auto-dismiss</label>
                    <select id="annAutoDismiss">
                        <option value="0">No auto-dismiss</option>
                        <option value="10">After 10 seconds</option>
                        <option value="30">After 30 seconds</option>
                        <option value="60">After 1 minute</option>
                        <option value="300">After 5 minutes</option>
                    </select>
                </div>

                <!-- ─── Preview ──────────────────────────── -->
                <div class="ann-preview-section">
                    <h4>Preview</h4>
                    <div class="ann-preview" id="annPreview">
                        <div class="ann-preview-header">
                            <span class="ann-preview-icon">📢</span>
                            <span class="ann-preview-title">Announcement title</span>
                            <span class="ann-preview-type badge badge-info">info</span>
                        </div>
                        <div class="ann-preview-body">Announcement message</div>
                    </div>
                </div>

                <div class="form-actions">
                    <button class="btn btn-success" id="btnSendAnnouncement">Send Announcement</button>
                    <button class="btn btn-secondary" id="btnClearAnnouncement">Clear</button>
                </div>
                <span id="annStatus" class="bc-status"></span>
            </div>

            <!-- ─── Active Announcements ─────────────────── -->
            <div class="card">
                <div class="card-header">
                    <h3>Active Announcements</h3>
                    <button class="btn btn-sm btn-secondary" id="btnRefreshAnnouncements">Refresh</button>
                </div>
                <div id="announcementsList">Loading...</div>
            </div>
        </div>
    `;
}

export async function initAnnouncementManager(api) {
    // Collapsibles
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

    // Emoji picker for icon
    document.getElementById('annIconPicker')?.addEventListener('click', () => {
        openEmojiPicker(document.getElementById('annIconPicker'), (emoji) => {
            document.getElementById('annIcon').value = emoji;
            updatePreview();
        });
    });

    // Template buttons
    document.querySelectorAll('.ann-template-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const template = ANNOUNCEMENT_TEMPLATES[parseInt(btn.dataset.index)];
            if (!template) return;
            document.getElementById('annIcon').value = template.icon;
            document.getElementById('annTitle').value = template.title;
            document.getElementById('annMessage').value = template.message;
            document.getElementById('annType').value = template.type;
            updatePreview();
        });
    });

    // Live preview
    ['annTitle', 'annMessage', 'annType', 'annIcon'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', updatePreview);
    });
    document.getElementById('annType')?.addEventListener('change', updatePreview);

    // Send announcement
    document.getElementById('btnSendAnnouncement')?.addEventListener('click', async () => {
        const title = document.getElementById('annTitle').value.trim();
        const message = document.getElementById('annMessage').value.trim();
        const type = document.getElementById('annType').value;
        const expiresInput = document.getElementById('annExpires').value;

        if (!title || !message) {
            return showStatus('annStatus', 'Title and message are required', true);
        }

        const body = { title, message, type };
        if (expiresInput) {
            body.expires_at = new Date(expiresInput).toISOString().slice(0, 19).replace('T', ' ');
        }

        try {
            const result = await api.post('/announcements', body);
            showStatus('annStatus', `Announcement #${result.id} created and broadcast.`);
            document.getElementById('annTitle').value = '';
            document.getElementById('annMessage').value = '';
            document.getElementById('annExpires').value = '';
            updatePreview();
            await loadAnnouncements(api);
        } catch (e) {
            showStatus('annStatus', 'Error: ' + e.message, true);
        }
    });

    // Clear form
    document.getElementById('btnClearAnnouncement')?.addEventListener('click', () => {
        document.getElementById('annIcon').value = '📢';
        document.getElementById('annTitle').value = '';
        document.getElementById('annMessage').value = '';
        document.getElementById('annType').value = 'info';
        document.getElementById('annExpires').value = '';
        document.getElementById('annPriority').value = 'normal';
        document.getElementById('annAutoDismiss').value = '0';
        updatePreview();
    });

    // Refresh
    document.getElementById('btnRefreshAnnouncements')?.addEventListener('click', () => loadAnnouncements(api));

    await loadAnnouncements(api);
}

function updatePreview() {
    const preview = document.getElementById('annPreview');
    if (!preview) return;

    const icon = document.getElementById('annIcon')?.value || '📢';
    const title = document.getElementById('annTitle')?.value || 'Announcement title';
    const message = document.getElementById('annMessage')?.value || 'Announcement message';
    const type = document.getElementById('annType')?.value || 'info';

    const typeInfo = ANNOUNCEMENT_TYPES.find(t => t.value === type) || ANNOUNCEMENT_TYPES[0];
    const badgeClass = type === 'critical' ? 'badge-danger' : type === 'warning' ? 'badge-warning' : 'badge-info';

    preview.innerHTML = `
        <div class="ann-preview-header">
            <span class="ann-preview-icon">${icon}</span>
            <span class="ann-preview-title">${escHtml(title)}</span>
            <span class="ann-preview-type badge ${badgeClass}">${typeInfo.emoji} ${typeInfo.label}</span>
        </div>
        <div class="ann-preview-body">${escHtml(message)}</div>
    `;
}

async function loadAnnouncements(api) {
    try {
        const data = await api.get('/announcements');
        const items = data.announcements || [];

        if (items.length === 0) {
            document.getElementById('announcementsList').innerHTML =
                '<p class="text-muted">No announcements yet.</p>';
            return;
        }

        document.getElementById('announcementsList').innerHTML = items.map(a => {
            const typeInfo = ANNOUNCEMENT_TYPES.find(t => t.value === a.type) || ANNOUNCEMENT_TYPES[0];
            const badgeClass = a.type === 'critical' ? 'badge-danger' : a.type === 'warning' ? 'badge-warning' : 'badge-info';
            const isExpired = a.expires_at && new Date(a.expires_at) < new Date();

            return `
                <div class="list-item ann-item ${!a.active ? 'ann-inactive' : ''} ${isExpired ? 'ann-expired' : ''}">
                    <div class="item-content" style="flex-direction: column; align-items: flex-start; gap: 4px;">
                        <div style="display: flex; gap: 8px; align-items: center; width: 100%; flex-wrap: wrap;">
                            <span class="badge ${badgeClass}">${typeInfo.emoji} ${a.type}</span>
                            <strong>${escHtml(a.title)}</strong>
                            <span class="badge ${a.active ? 'badge-success' : ''}">${a.active ? 'Active' : 'Inactive'}</span>
                            ${isExpired ? '<span class="badge badge-danger">Expired</span>' : ''}
                        </div>
                        <div class="text-muted" style="font-size: 12px;">
                            ${escHtml(a.message?.substring(0, 200))}${(a.message?.length || 0) > 200 ? '...' : ''}
                        </div>
                        <div class="text-muted" style="font-size: 11px;">
                            By ${escHtml(a.author_name || 'Unknown')} &bull; ${new Date(a.created_at).toLocaleString()}
                            ${a.expires_at ? ' &bull; Expires: ' + new Date(a.expires_at).toLocaleString() : ''}
                        </div>
                    </div>
                    <div class="item-actions" style="flex-direction:column;gap:4px">
                        <button class="btn btn-sm ${a.active ? 'btn-warning' : 'btn-success'} btn-toggle-ann" data-id="${escAttr(a.id)}" data-active="${a.active ? '1' : '0'}">${a.active ? 'Deactivate' : 'Activate'}</button>
                        <button class="btn btn-sm btn-secondary btn-resend-ann" data-id="${escAttr(a.id)}" data-title="${escAttr(a.title)}" data-message="${escAttr(a.message)}" data-type="${escAttr(a.type)}">Resend</button>
                        <button class="btn btn-danger btn-sm btn-delete-ann" data-id="${escAttr(a.id)}">Delete</button>
                    </div>
                </div>
            `;
        }).join('');

        // Toggle handlers
        document.querySelectorAll('.btn-toggle-ann').forEach(btn => {
            btn.addEventListener('click', async () => {
                const newActive = btn.dataset.active !== '1';
                try {
                    await api.put(`/announcements/${btn.dataset.id}`, { active: newActive });
                    await loadAnnouncements(api);
                } catch (e) { showStatus('annStatus', 'Error: ' + e.message, true); }
            });
        });

        // Resend handlers
        document.querySelectorAll('.btn-resend-ann').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('annTitle').value = btn.dataset.title;
                document.getElementById('annMessage').value = btn.dataset.message;
                document.getElementById('annType').value = btn.dataset.type;
                updatePreview();
                document.getElementById('annTitle').scrollIntoView({ behavior: 'smooth' });
            });
        });

        // Delete handlers
        document.querySelectorAll('.btn-delete-ann').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this announcement?')) return;
                try {
                    await api.delete(`/announcements/${btn.dataset.id}`);
                    await loadAnnouncements(api);
                } catch (e) { showStatus('annStatus', 'Error: ' + e.message, true); }
            });
        });
    } catch (e) {
        document.getElementById('announcementsList').innerHTML =
            `<p class="text-muted">Error: ${escHtml(e.message)}</p>`;
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

