/**
 * AuditLogViewer Component - Searchable audit trail.
 */
import { escHtml } from '../sanitize.js';

export function renderAuditLogViewer() {
    return `
        <div class="section-editor">
            <h2>Audit Log</h2>
            <p class="section-desc">Searchable log of all admin and system actions.</p>

            <div class="toolbar">
                <select id="auditActionFilter">
                    <option value="">All Actions</option>
                    <option value="config">Config Changes</option>
                    <option value="user">User Actions</option>
                    <option value="webhook">Webhook Actions</option>
                    <option value="theme">Theme Actions</option>
                    <option value="announcement">Announcements</option>
                    <option value="event">Events</option>
                </select>
                <span id="auditCount" class="text-muted"></span>
            </div>

            <div class="card">
                <div id="auditLogBody">Loading...</div>
            </div>

            <div class="pagination" id="auditPagination"></div>
        </div>
    `;
}

let currentOffset = 0;
const PAGE_SIZE = 30;

export async function initAuditLogViewer(api) {
    currentOffset = 0; // Reset pagination when switching to this section
    await loadAuditLog(api);

    document.getElementById('auditActionFilter')?.addEventListener('change', () => {
        currentOffset = 0;
        loadAuditLog(api);
    });
}

async function loadAuditLog(api) {
    const action = document.getElementById('auditActionFilter')?.value || '';
    const params = `?limit=${PAGE_SIZE}&offset=${currentOffset}${action ? '&action=' + action : ''}`;

    try {
        const data = await api.get('/audit' + params);
        const entries = data.entries || [];
        document.getElementById('auditCount').textContent = `${data.total} entries`;

        if (entries.length === 0) {
            document.getElementById('auditLogBody').innerHTML =
                '<p class="text-muted">No audit entries found.</p>';
            return;
        }

        document.getElementById('auditLogBody').innerHTML = entries.map(e => `
            <div class="audit-entry">
                <span class="audit-action badge">${escHtml(e.action)}</span>
                <span class="audit-user">${escHtml(e.display_name || 'System')}</span>
                ${e.target_type ? `<span class="text-muted">${escHtml(e.target_type)}:${escHtml(e.target_id || '')}</span>` : ''}
                ${e.details ? `<span class="audit-details text-muted">${escHtml(JSON.stringify(e.details).substring(0, 100))}</span>` : ''}
                <span class="audit-time">${new Date(e.created_at).toLocaleString()}</span>
                ${e.ip_address ? `<span class="text-muted" style="font-size:11px">${escHtml(e.ip_address)}</span>` : ''}
            </div>
        `).join('');

        // Pagination
        const totalPages = Math.ceil(data.total / PAGE_SIZE);
        const currentPage = Math.floor(currentOffset / PAGE_SIZE) + 1;
        const pag = document.getElementById('auditPagination');
        pag.innerHTML = totalPages > 1
            ? `Page ${currentPage}/${totalPages}
               ${currentOffset > 0 ? '<button class="btn btn-sm" id="auditPrev">Prev</button>' : ''}
               ${currentOffset + PAGE_SIZE < data.total ? '<button class="btn btn-sm" id="auditNext">Next</button>' : ''}`
            : '';

        document.getElementById('auditPrev')?.addEventListener('click', () => {
            currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
            loadAuditLog(api);
        });
        document.getElementById('auditNext')?.addEventListener('click', () => {
            currentOffset += PAGE_SIZE;
            loadAuditLog(api);
        });
    } catch (e) {
        document.getElementById('auditLogBody').innerHTML =
            `<p class="text-muted">Error: ${escHtml(e.message)}</p>`;
    }
}

