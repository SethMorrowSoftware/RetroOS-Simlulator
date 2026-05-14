/**
 * ThemeCreator Component - Create and manage custom themes.
 */
import { escHtml, escAttr } from '../sanitize.js';

export function renderThemeCreator() {
    return `
        <div class="section-editor">
            <h2>Themes</h2>
            <p class="section-desc">Create and manage custom wallpapers, color schemes, and full themes.</p>

            <div class="toolbar">
                <button class="btn btn-secondary" id="btnNewTheme">+ New Theme</button>
                <select id="themeTypeFilter">
                    <option value="">All Types</option>
                    <option value="wallpaper">Wallpapers</option>
                    <option value="colorscheme">Color Schemes</option>
                    <option value="full">Full Themes</option>
                </select>
            </div>

            <div id="themeFormCard" class="card hidden">
                <h3>Create Theme</h3>
                <div class="form-group">
                    <label>Name</label>
                    <input type="text" id="themeName" placeholder="My Custom Theme" maxlength="128">
                </div>
                <div class="inline-row">
                    <label>Type</label>
                    <select id="themeType">
                        <option value="wallpaper">Wallpaper</option>
                        <option value="colorscheme">Color Scheme</option>
                        <option value="full">Full Theme</option>
                    </select>
                </div>

                <div id="wallpaperFields">
                    <div class="form-group">
                        <label>CSS Gradient</label>
                        <textarea id="themeCss" rows="3" placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Preview</label>
                        <div id="wallpaperPreview" style="width:200px;height:120px;border:1px solid #999;"></div>
                    </div>
                </div>

                <div id="colorSchemeFields" class="hidden">
                    <div class="inline-row">
                        <label>Window Color</label>
                        <input type="color" id="themeWindowColor" value="#c0c0c0">
                    </div>
                    <div class="inline-row">
                        <label>Titlebar Color</label>
                        <input type="color" id="themeTitlebarColor" value="#000080">
                    </div>
                    <div class="form-group">
                        <label>Label</label>
                        <input type="text" id="themeColorLabel" placeholder="Theme label">
                    </div>
                </div>

                <div class="inline-row">
                    <label>Public</label>
                    <label class="toggle">
                        <input type="checkbox" id="themePublic" checked>
                        <span class="slider"></span>
                    </label>
                </div>
                <div class="form-actions">
                    <button class="btn btn-success" id="btnSaveTheme">Save Theme</button>
                    <button class="btn btn-secondary" id="btnCancelTheme">Cancel</button>
                </div>
            </div>

            <div class="card" id="themesList">
                <p>Loading...</p>
            </div>
        </div>
    `;
}

export async function initThemeCreator(api) {
    await loadThemes(api);

    document.getElementById('btnNewTheme')?.addEventListener('click', () => {
        document.getElementById('themeFormCard').classList.remove('hidden');
    });
    document.getElementById('btnCancelTheme')?.addEventListener('click', () => {
        document.getElementById('themeFormCard').classList.add('hidden');
    });

    // Type toggle
    document.getElementById('themeType')?.addEventListener('change', (e) => {
        const type = e.target.value;
        document.getElementById('wallpaperFields').classList.toggle('hidden', type === 'colorscheme');
        document.getElementById('colorSchemeFields').classList.toggle('hidden', type === 'wallpaper');
    });

    // Live wallpaper preview
    document.getElementById('themeCss')?.addEventListener('input', (e) => {
        const preview = document.getElementById('wallpaperPreview');
        if (preview) preview.style.background = e.target.value;
    });

    // Filter
    document.getElementById('themeTypeFilter')?.addEventListener('change', () => loadThemes(api));

    // Save
    document.getElementById('btnSaveTheme')?.addEventListener('click', async () => {
        const name = document.getElementById('themeName').value.trim();
        const type = document.getElementById('themeType').value;
        const isPublic = document.getElementById('themePublic').checked;

        if (!name) { alert('Name is required'); return; }

        let data = {};
        if (type === 'wallpaper' || type === 'full') {
            data.css = document.getElementById('themeCss').value.trim();
            data.label = name;
        }
        if (type === 'colorscheme' || type === 'full') {
            data.window = document.getElementById('themeWindowColor').value;
            data.titlebar = document.getElementById('themeTitlebarColor').value;
            data.label = document.getElementById('themeColorLabel')?.value || name;
        }
        if (type === 'full') {
            data = {
                wallpaper: { css: data.css, label: name },
                colorScheme: { window: data.window, titlebar: data.titlebar, label: data.label },
            };
        }

        try {
            await api.post('/themes', { name, type, data, is_public: isPublic });
            document.getElementById('themeFormCard').classList.add('hidden');
            await loadThemes(api);
        } catch (e) {
            alert('Error: ' + e.message);
        }
    });
}

async function loadThemes(api) {
    const typeFilter = document.getElementById('themeTypeFilter')?.value || '';
    const params = typeFilter ? `?type=${typeFilter}` : '';

    try {
        const data = await api.get('/themes' + params);
        const themes = data.themes || [];

        if (themes.length === 0) {
            document.getElementById('themesList').innerHTML =
                '<p class="text-muted">No custom themes yet.</p>';
            return;
        }

        document.getElementById('themesList').innerHTML = themes.map(t => `
            <div class="list-item">
                <div class="item-content" style="gap: 12px; align-items: center;">
                    ${t.type === 'wallpaper' || t.type === 'full'
                        ? `<div style="width:60px;height:36px;border:1px solid #999;background:${escAttr(t.data?.css || t.data?.wallpaper?.css || '')}"></div>`
                        : ''}
                    ${t.type === 'colorscheme' || t.type === 'full'
                        ? `<div style="display:flex;gap:4px;">
                            <div style="width:20px;height:20px;border:1px solid #999;background:${escAttr(t.data?.window || t.data?.colorScheme?.window || '#ccc')}"></div>
                            <div style="width:20px;height:20px;border:1px solid #999;background:${escAttr(t.data?.titlebar || t.data?.colorScheme?.titlebar || '#008')}"></div>
                           </div>`
                        : ''}
                    <div>
                        <strong>${escHtml(t.name)}</strong>
                        <div class="text-muted" style="font-size:11px">
                            ${escHtml(t.type)} &bull; ${t.is_public ? 'Public' : 'Private'} &bull;
                            by ${escHtml(t.creator_name || 'Unknown')}
                        </div>
                    </div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-danger btn-sm btn-delete-theme" data-id="${escAttr(t.id)}">Delete</button>
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.btn-delete-theme').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this theme?')) return;
                try {
                    await api.delete(`/themes/${btn.dataset.id}`);
                    await loadThemes(api);
                } catch (e) { alert('Error: ' + e.message); }
            });
        });
    } catch (e) {
        document.getElementById('themesList').innerHTML =
            `<p class="text-muted">Error: ${escHtml(e.message)}</p>`;
    }
}

