/**
 * UserManager Component - View and manage users.
 */
import { escHtml, escAttr } from '../sanitize.js';

export function renderUserManager() {
    return `
        <div class="section-editor">
            <h2>Users</h2>
            <p class="section-desc">View and manage user accounts.</p>

            <div class="toolbar">
                <select id="userRoleFilter">
                    <option value="">All Roles</option>
                    <option value="visitor">Visitors</option>
                    <option value="user">Users</option>
                    <option value="admin">Admins</option>
                    <option value="superadmin">Superadmins</option>
                </select>
                <span id="userCount" class="text-muted"></span>
            </div>

            <div class="card">
                <table class="data-table" id="usersTable">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Role</th>
                            <th>Type</th>
                            <th>Created</th>
                            <th>Last Seen</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="usersBody">
                        <tr><td colspan="6">Loading...</td></tr>
                    </tbody>
                </table>
            </div>

            <div class="pagination" id="usersPagination"></div>
        </div>
    `;
}

let currentOffset = 0;
const PAGE_SIZE = 25;

export async function initUserManager(api) {
    currentOffset = 0; // Reset pagination when switching to this section
    await loadUsers(api);

    document.getElementById('userRoleFilter')?.addEventListener('change', () => {
        currentOffset = 0;
        loadUsers(api);
    });
}

async function loadUsers(api) {
    const role = document.getElementById('userRoleFilter')?.value || '';
    const params = `?limit=${PAGE_SIZE}&offset=${currentOffset}${role ? '&role=' + role : ''}`;

    try {
        const data = await api.get('/users' + params);
        const users = data.users || [];

        document.getElementById('userCount').textContent = `${data.total} user(s)`;

        if (users.length === 0) {
            document.getElementById('usersBody').innerHTML =
                '<tr><td colspan="6" class="text-muted">No users found</td></tr>';
            return;
        }

        document.getElementById('usersBody').innerHTML = users.map(u => `
            <tr data-user-id="${escAttr(u.id)}">
                <td>${escHtml(u.display_name || u.uuid.substring(0, 8) + '...')}</td>
                <td>
                    <select class="role-select" data-user-id="${escAttr(u.id)}" data-current="${escAttr(u.role)}">
                        <option value="visitor" ${u.role === 'visitor' ? 'selected' : ''}>visitor</option>
                        <option value="user" ${u.role === 'user' ? 'selected' : ''}>user</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
                        <option value="superadmin" ${u.role === 'superadmin' ? 'selected' : ''}>superadmin</option>
                    </select>
                </td>
                <td>${u.is_anonymous ? '<span class="badge">Anonymous</span>' : '<span class="badge badge-success">Registered</span>'}</td>
                <td>${escHtml(new Date(u.created_at).toLocaleDateString())}</td>
                <td>${escHtml(new Date(u.last_seen_at).toLocaleString())}</td>
                <td>
                    <button class="btn btn-danger btn-sm btn-delete-user" data-user-id="${escAttr(u.id)}">Delete</button>
                </td>
            </tr>
        `).join('');

        // Role change handlers
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const userId = e.target.dataset.userId;
                const newRole = e.target.value;
                try {
                    await api.put('/users/' + userId, { role: newRole });
                } catch (err) {
                    alert('Failed: ' + err.message);
                    e.target.value = e.target.dataset.current;
                }
            });
        });

        // Delete handlers
        document.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this user? This cannot be undone.')) return;
                try {
                    await api.delete('/users/' + btn.dataset.userId);
                    loadUsers(api);
                } catch (err) {
                    alert('Failed: ' + err.message);
                }
            });
        });

        // Pagination
        const pag = document.getElementById('usersPagination');
        const totalPages = Math.ceil(data.total / PAGE_SIZE);
        const currentPage = Math.floor(currentOffset / PAGE_SIZE) + 1;
        pag.innerHTML = totalPages > 1
            ? `Page ${currentPage}/${totalPages}
               ${currentOffset > 0 ? '<button class="btn btn-sm" id="prevPage">Prev</button>' : ''}
               ${currentOffset + PAGE_SIZE < data.total ? '<button class="btn btn-sm" id="nextPage">Next</button>' : ''}`
            : '';

        document.getElementById('prevPage')?.addEventListener('click', () => {
            currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
            loadUsers(api);
        });
        document.getElementById('nextPage')?.addEventListener('click', () => {
            currentOffset += PAGE_SIZE;
            loadUsers(api);
        });
    } catch (e) {
        document.getElementById('usersBody').innerHTML =
            `<tr><td colspan="6" class="text-muted">Error: ${escHtml(e.message)}</td></tr>`;
    }
}

