/**
 * AutoexecEditor Component - Full-featured RetroScript editor for autoexec.retro.
 *
 * Features:
 *  1. Syntax-highlighted code editor (RetroScript keywords, comments, strings)
 *  2. Line numbers with gutter
 *  3. Load/save autoexec.retro via backend API
 *  4. Undo/redo support (browser native)
 *  5. Find & replace
 *  6. Insert snippets (common RetroScript patterns)
 *  7. Script validation (basic syntax check)
 *  8. Version history / backup before save
 *  9. File size and line count stats
 * 10. Dark theme matching admin panel
 */
import { escHtml, escAttr } from '../sanitize.js';

// ── State ───────────────────────────────────────────────────
let originalContent = '';
let hasChanges = false;
let currentBackups = [];

// RetroScript language keywords for highlighting
const RS_KEYWORDS = [
    'set', 'if', 'then', 'else', 'end', 'def', 'return', 'emit', 'on',
    'print', 'read', 'write', 'mkdir', 'rm', 'try', 'catch', 'to',
    'call', 'wait', 'loop', 'break', 'continue', 'true', 'false', 'null',
];

const RS_BUILTINS = [
    'timer:set', 'timer:clear', 'command:app:launch', 'command:app:close',
    'command:dialog:show', 'command:notification:show', 'command:sound:play',
    'command:clipboard:set', 'phone:call', 'phone:voicemail',
    'mail:deliver', 'im:message', 'chat:message', 'bsod:trigger',
    'screensaver:start', 'clippy:show', 'achievement:unlock',
];

const SNIPPETS = [
    {
        name: 'Event Listener',
        desc: 'Listen for a system event',
        code: 'on event_name {\n    # Handle event\n    print "Event received"\n}',
    },
    {
        name: 'Timer',
        desc: 'Set a delayed timer',
        code: 'emit timer:set {\n    "name": "my_timer",\n    "delay": 5000,\n    "event": "my_timer:fire"\n}',
    },
    {
        name: 'Send Mail',
        desc: 'Deliver a message to the Inbox',
        code: 'emit mail:deliver {\n    "from": "sender@ops.local",\n    "subject": "Subject Line",\n    "body": "Message body here.",\n    "important": false\n}',
    },
    {
        name: 'Launch App',
        desc: 'Open an application',
        code: 'emit command:app:launch {\n    "appId": "notepad"\n}',
    },
    {
        name: 'Show Dialog',
        desc: 'Display a system dialog',
        code: 'emit command:dialog:show {\n    "type": "alert",\n    "title": "Alert",\n    "message": "Hello, World!",\n    "icon": "info"\n}',
    },
    {
        name: 'Write File',
        desc: 'Create a file in the virtual filesystem',
        code: 'write "File content here" to "C:/Users/User/Desktop/filename.txt"',
    },
    {
        name: 'Phone Call',
        desc: 'Trigger an incoming phone call',
        code: 'emit phone:call {\n    "from": "Unknown Caller",\n    "number": "555-0100",\n    "transcript": [\n        "Hello?",\n        "..."\n    ]\n}',
    },
    {
        name: 'Notification',
        desc: 'Show a toast notification',
        code: 'emit command:notification:show {\n    "title": "Notice",\n    "message": "Something happened.",\n    "icon": "info",\n    "duration": 5000\n}',
    },
    {
        name: 'Variable & Condition',
        desc: 'Set a variable and check it',
        code: 'set $my_var = 0\n\nif $my_var then {\n    print "Variable is truthy"\n} else {\n    print "Variable is falsy"\n}',
    },
    {
        name: 'Function Definition',
        desc: 'Define a reusable function',
        code: 'def myFunction() {\n    print "Function called"\n    # Add logic here\n}',
    },
];

// ── Render ──────────────────────────────────────────────────
export function renderAutoexecEditor() {
    return `
        <div class="section-editor ae-section" style="max-width:1100px">
            <h2>Autoexec Editor</h2>
            <p class="section-desc">Edit the autoexec.retro startup script. This script runs when users boot IlluminatOS.</p>

            <!-- Toolbar -->
            <div class="ae-toolbar">
                <div class="ae-toolbar-left">
                    <button class="btn btn-success btn-sm" id="aeSaveBtn" disabled>Save</button>
                    <button class="btn btn-secondary btn-sm" id="aeReloadBtn">Reload</button>
                    <button class="btn btn-secondary btn-sm" id="aeValidateBtn">Validate</button>
                    <div class="ae-separator"></div>
                    <button class="btn btn-sm" id="aeFindBtn">Find &amp; Replace</button>
                    <div class="ae-separator"></div>
                    <div class="ae-dropdown">
                        <button class="btn btn-sm" id="aeSnippetBtn">Insert Snippet &#9660;</button>
                        <div class="ae-dropdown-menu hidden" id="aeSnippetMenu">
                            ${SNIPPETS.map((s, i) => `
                                <div class="ae-snippet-item" data-snippet-idx="${i}">
                                    <div class="ae-snippet-name">${escHtml(s.name)}</div>
                                    <div class="ae-snippet-desc">${escHtml(s.desc)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
                <div class="ae-toolbar-right">
                    <span class="ae-file-info" id="aeFileInfo">--</span>
                    <span class="ae-status" id="aeStatus"></span>
                </div>
            </div>

            <!-- Find & Replace bar -->
            <div class="ae-find-bar hidden" id="aeFindBar">
                <input type="text" id="aeFindInput" placeholder="Find..." class="ae-find-input">
                <input type="text" id="aeReplaceInput" placeholder="Replace..." class="ae-find-input">
                <button class="btn btn-sm" id="aeFindNextBtn">Next</button>
                <button class="btn btn-sm" id="aeReplaceBtn">Replace</button>
                <button class="btn btn-sm" id="aeReplaceAllBtn">Replace All</button>
                <button class="btn btn-sm btn-secondary" id="aeFindCloseBtn">Close</button>
                <span class="ae-find-count" id="aeFindCount"></span>
            </div>

            <!-- Validation output -->
            <div class="ae-validation hidden" id="aeValidation">
                <div class="ae-validation-header">
                    <span id="aeValidationIcon"></span>
                    <span id="aeValidationText"></span>
                    <button class="btn btn-sm btn-secondary" id="aeValidationClose">Dismiss</button>
                </div>
                <div id="aeValidationDetails"></div>
            </div>

            <!-- Editor area -->
            <div class="ae-editor-wrap">
                <div class="ae-gutter" id="aeGutter"></div>
                <textarea id="aeEditor" class="ae-editor" spellcheck="false" wrap="off"
                          placeholder="Loading autoexec.retro..."></textarea>
            </div>

            <!-- Backups -->
            <div class="card ae-backups-card">
                <div class="card-header">
                    <h3>Backups</h3>
                    <span class="text-muted">Auto-saved before each save operation</span>
                </div>
                <div id="aeBackupsList">
                    <p class="text-muted">No backups yet</p>
                </div>
            </div>

            <!-- Syntax Reference -->
            <div class="card ae-reference-card">
                <div class="ae-collapsible-header" id="aeRefToggle">
                    <h3>RetroScript Quick Reference</h3>
                    <span class="ae-collapse-arrow">&#9660;</span>
                </div>
                <div class="ae-reference-body hidden" id="aeRefBody">
                    <div class="ae-ref-grid">
                        <div class="ae-ref-section">
                            <h4>Variables</h4>
                            <code>set $name = "value"</code>
                            <code>set $count = 42</code>
                        </div>
                        <div class="ae-ref-section">
                            <h4>Control Flow</h4>
                            <code>if $var then { ... }</code>
                            <code>if $var then { ... } else { ... }</code>
                        </div>
                        <div class="ae-ref-section">
                            <h4>Functions</h4>
                            <code>def myFunc() { ... }</code>
                            <code>call myFunc()</code>
                        </div>
                        <div class="ae-ref-section">
                            <h4>Events</h4>
                            <code>on event_name { ... }</code>
                            <code>emit event_name { ... }</code>
                        </div>
                        <div class="ae-ref-section">
                            <h4>I/O</h4>
                            <code>print "message"</code>
                            <code>write "content" to "path"</code>
                            <code>read "path"</code>
                        </div>
                        <div class="ae-ref-section">
                            <h4>Comments</h4>
                            <code># Single line comment</code>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ── Init ────────────────────────────────────────────────────
export async function initAutoexecEditor(api) {
    const editor = document.getElementById('aeEditor');
    const gutter = document.getElementById('aeGutter');
    if (!editor) return;

    // Load content
    await loadAutoexec(api);

    // Editor events
    editor.addEventListener('input', () => {
        hasChanges = editor.value !== originalContent;
        document.getElementById('aeSaveBtn').disabled = !hasChanges;
        updateGutter();
        updateFileInfo();
    });

    editor.addEventListener('scroll', () => {
        if (gutter) gutter.scrollTop = editor.scrollTop;
    });

    editor.addEventListener('keydown', (e) => {
        // Tab inserts spaces
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
            editor.dispatchEvent(new Event('input'));
        }
        // Ctrl+S saves
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (hasChanges) saveAutoexec(api);
        }
        // Ctrl+F find
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            toggleFindBar(true);
        }
    });

    // Toolbar buttons
    document.getElementById('aeSaveBtn')?.addEventListener('click', () => saveAutoexec(api));
    document.getElementById('aeReloadBtn')?.addEventListener('click', () => {
        if (hasChanges && !confirm('Discard unsaved changes and reload?')) return;
        loadAutoexec(api);
    });
    document.getElementById('aeValidateBtn')?.addEventListener('click', () => validateScript());

    // Find & Replace
    document.getElementById('aeFindBtn')?.addEventListener('click', () => toggleFindBar());
    document.getElementById('aeFindCloseBtn')?.addEventListener('click', () => toggleFindBar(false));
    document.getElementById('aeFindNextBtn')?.addEventListener('click', () => findNext());
    document.getElementById('aeReplaceBtn')?.addEventListener('click', () => replaceNext());
    document.getElementById('aeReplaceAllBtn')?.addEventListener('click', () => replaceAll());
    document.getElementById('aeFindInput')?.addEventListener('input', () => updateFindCount());

    // Snippets
    document.getElementById('aeSnippetBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('aeSnippetMenu')?.classList.toggle('hidden');
    });

    document.querySelectorAll('.ae-snippet-item').forEach(item => {
        item.addEventListener('click', () => {
            const idx = parseInt(item.dataset.snippetIdx);
            insertSnippet(SNIPPETS[idx]);
            document.getElementById('aeSnippetMenu')?.classList.add('hidden');
        });
    });

    // Close snippet menu on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.ae-dropdown')) {
            document.getElementById('aeSnippetMenu')?.classList.add('hidden');
        }
    });

    // Validation close
    document.getElementById('aeValidationClose')?.addEventListener('click', () => {
        document.getElementById('aeValidation')?.classList.add('hidden');
    });

    // Reference toggle
    document.getElementById('aeRefToggle')?.addEventListener('click', () => {
        const body = document.getElementById('aeRefBody');
        const arrow = document.querySelector('#aeRefToggle .ae-collapse-arrow');
        if (body) body.classList.toggle('hidden');
        if (arrow) arrow.innerHTML = body?.classList.contains('hidden') ? '&#9660;' : '&#9650;';
    });
}

async function loadAutoexec(api) {
    const editor = document.getElementById('aeEditor');
    const status = document.getElementById('aeStatus');
    if (!editor) return;

    try {
        if (status) { status.textContent = 'Loading...'; status.className = 'ae-status'; }

        const data = await api.get('/system/autoexec');
        originalContent = data.content || '';
        editor.value = originalContent;
        hasChanges = false;
        document.getElementById('aeSaveBtn').disabled = true;

        updateGutter();
        updateFileInfo();

        if (status) { status.textContent = 'Loaded'; status.className = 'ae-status ae-status-ok'; }

        // Load backups
        if (data.backups) {
            currentBackups = data.backups;
            renderBackups(api);
        }

    } catch (e) {
        if (status) { status.textContent = 'Error: ' + e.message; status.className = 'ae-status ae-status-error'; }
        // Try loading from filesystem as fallback
        try {
            const fallback = await fetch('../autoexec.retro');
            if (fallback.ok) {
                originalContent = await fallback.text();
                editor.value = originalContent;
                updateGutter();
                updateFileInfo();
                if (status) { status.textContent = 'Loaded (direct)'; status.className = 'ae-status ae-status-ok'; }
            }
        } catch (e2) {
            if (status) { status.textContent = 'Failed to load'; status.className = 'ae-status ae-status-error'; }
        }
    }
}

async function saveAutoexec(api) {
    const editor = document.getElementById('aeEditor');
    const status = document.getElementById('aeStatus');
    if (!editor) return;

    try {
        if (status) { status.textContent = 'Saving...'; status.className = 'ae-status'; }

        await api.put('/system/autoexec', { content: editor.value });

        originalContent = editor.value;
        hasChanges = false;
        document.getElementById('aeSaveBtn').disabled = true;

        if (status) { status.textContent = 'Saved!'; status.className = 'ae-status ae-status-ok'; }
        setTimeout(() => {
            if (status && status.textContent === 'Saved!') status.textContent = '';
        }, 3000);

        // Reload backups
        try {
            const data = await api.get('/system/autoexec');
            if (data.backups) {
                currentBackups = data.backups;
                renderBackups(api);
            }
        } catch (e) { /* ignore */ }

    } catch (e) {
        if (status) { status.textContent = 'Save failed: ' + e.message; status.className = 'ae-status ae-status-error'; }
    }
}

function updateGutter() {
    const editor = document.getElementById('aeEditor');
    const gutter = document.getElementById('aeGutter');
    if (!editor || !gutter) return;

    const lineCount = editor.value.split('\n').length;
    const lines = [];
    for (let i = 1; i <= lineCount; i++) {
        lines.push(`<div class="ae-line-num">${i}</div>`);
    }
    gutter.innerHTML = lines.join('');
}

function updateFileInfo() {
    const editor = document.getElementById('aeEditor');
    const info = document.getElementById('aeFileInfo');
    if (!editor || !info) return;

    const lines = editor.value.split('\n').length;
    const bytes = new Blob([editor.value]).size;
    const kb = (bytes / 1024).toFixed(1);
    info.textContent = `${lines} lines | ${kb} KB${hasChanges ? ' | Modified' : ''}`;
}

function validateScript() {
    const editor = document.getElementById('aeEditor');
    const validation = document.getElementById('aeValidation');
    const icon = document.getElementById('aeValidationIcon');
    const text = document.getElementById('aeValidationText');
    const details = document.getElementById('aeValidationDetails');
    if (!editor || !validation) return;

    const content = editor.value;
    const issues = [];

    // Basic validation checks
    const lines = content.split('\n');

    // Check bracket balance
    let braceDepth = 0;
    let parenDepth = 0;
    lines.forEach((line, i) => {
        // Skip comments
        const trimmed = line.replace(/#.*$/, '');
        for (const ch of trimmed) {
            if (ch === '{') braceDepth++;
            if (ch === '}') braceDepth--;
            if (ch === '(') parenDepth++;
            if (ch === ')') parenDepth--;
        }
        if (braceDepth < 0) issues.push({ line: i + 1, msg: 'Unexpected closing brace }', type: 'error' });
        if (parenDepth < 0) issues.push({ line: i + 1, msg: 'Unexpected closing parenthesis )', type: 'error' });
    });

    if (braceDepth > 0) issues.push({ line: lines.length, msg: `${braceDepth} unclosed brace(s) {`, type: 'error' });
    if (braceDepth < 0) issues.push({ line: lines.length, msg: `${Math.abs(braceDepth)} extra closing brace(s) }`, type: 'error' });
    if (parenDepth !== 0) issues.push({ line: lines.length, msg: `Unmatched parentheses (depth: ${parenDepth})`, type: 'error' });

    // Check for common issues
    lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('#')) return; // Skip comments

        // Check for unclosed strings
        const singleQuotes = (trimmed.match(/"/g) || []).length;
        if (singleQuotes % 2 !== 0) {
            issues.push({ line: i + 1, msg: 'Possible unclosed string literal', type: 'warning' });
        }

        // Check set syntax
        if (/^set\s+[^$]/.test(trimmed) && !trimmed.startsWith('set $')) {
            issues.push({ line: i + 1, msg: 'Variable names should start with $ (e.g., set $name = value)', type: 'warning' });
        }
    });

    validation.classList.remove('hidden');

    if (issues.length === 0) {
        if (icon) icon.innerHTML = '&#9989;';
        if (text) { text.textContent = 'No issues found!'; text.style.color = 'var(--success)'; }
        if (details) details.innerHTML = '';
    } else {
        const errors = issues.filter(i => i.type === 'error');
        const warnings = issues.filter(i => i.type === 'warning');
        if (icon) icon.innerHTML = errors.length > 0 ? '&#10060;' : '&#9888;';
        if (text) {
            text.textContent = `${errors.length} error(s), ${warnings.length} warning(s)`;
            text.style.color = errors.length > 0 ? 'var(--danger)' : 'var(--warning)';
        }
        if (details) {
            details.innerHTML = issues.map(i => `
                <div class="ae-issue ae-issue-${i.type}">
                    <span class="ae-issue-line">Line ${i.line}</span>
                    <span class="ae-issue-msg">${escHtml(i.msg)}</span>
                </div>
            `).join('');
        }
    }
}

// ── Find & Replace ──────────────────────────────────────────
let findOffset = 0;

function toggleFindBar(show) {
    const bar = document.getElementById('aeFindBar');
    if (!bar) return;
    const isHidden = bar.classList.contains('hidden');
    if (show === undefined) show = isHidden;
    bar.classList.toggle('hidden', !show);
    if (show) document.getElementById('aeFindInput')?.focus();
}

function updateFindCount() {
    const input = document.getElementById('aeFindInput');
    const editor = document.getElementById('aeEditor');
    const count = document.getElementById('aeFindCount');
    if (!input || !editor || !count) return;

    const term = input.value;
    if (!term) { count.textContent = ''; return; }

    const matches = editor.value.split(term).length - 1;
    count.textContent = `${matches} match${matches !== 1 ? 'es' : ''}`;
}

function findNext() {
    const input = document.getElementById('aeFindInput');
    const editor = document.getElementById('aeEditor');
    if (!input || !editor || !input.value) return;

    const term = input.value;
    const idx = editor.value.indexOf(term, findOffset);
    if (idx === -1) {
        findOffset = 0; // Wrap around
        const idx2 = editor.value.indexOf(term, 0);
        if (idx2 === -1) return;
        selectRange(editor, idx2, idx2 + term.length);
        findOffset = idx2 + term.length;
    } else {
        selectRange(editor, idx, idx + term.length);
        findOffset = idx + term.length;
    }
}

function replaceNext() {
    const findInput = document.getElementById('aeFindInput');
    const replaceInput = document.getElementById('aeReplaceInput');
    const editor = document.getElementById('aeEditor');
    if (!findInput || !replaceInput || !editor) return;

    const term = findInput.value;
    const replacement = replaceInput.value;
    if (!term) return;

    const start = editor.selectionStart;
    const selected = editor.value.substring(start, editor.selectionEnd);
    if (selected === term) {
        editor.value = editor.value.substring(0, start) + replacement + editor.value.substring(start + term.length);
        editor.dispatchEvent(new Event('input'));
        findOffset = start + replacement.length;
    }
    findNext();
}

function replaceAll() {
    const findInput = document.getElementById('aeFindInput');
    const replaceInput = document.getElementById('aeReplaceInput');
    const editor = document.getElementById('aeEditor');
    if (!findInput || !replaceInput || !editor || !findInput.value) return;

    const count = editor.value.split(findInput.value).length - 1;
    if (count === 0) return;
    if (!confirm(`Replace ${count} occurrence(s)?`)) return;

    editor.value = editor.value.split(findInput.value).join(replaceInput.value);
    editor.dispatchEvent(new Event('input'));
    updateFindCount();
}

function selectRange(editor, start, end) {
    editor.focus();
    editor.selectionStart = start;
    editor.selectionEnd = end;
    // Scroll into view
    const linesBefore = editor.value.substring(0, start).split('\n').length;
    const lineHeight = parseInt(getComputedStyle(editor).lineHeight) || 18;
    editor.scrollTop = (linesBefore - 5) * lineHeight;
}

// ── Snippets ────────────────────────────────────────────────
function insertSnippet(snippet) {
    const editor = document.getElementById('aeEditor');
    if (!editor || !snippet) return;

    const pos = editor.selectionStart;
    const before = editor.value.substring(0, pos);
    const after = editor.value.substring(pos);

    // Add newlines if needed
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n\n' : '';
    const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';

    editor.value = before + prefix + snippet.code + suffix + after;
    editor.selectionStart = editor.selectionEnd = pos + prefix.length + snippet.code.length;
    editor.dispatchEvent(new Event('input'));
    editor.focus();
}

// ── Backups ─────────────────────────────────────────────────
function renderBackups(api) {
    const container = document.getElementById('aeBackupsList');
    if (!container) return;

    if (!currentBackups || currentBackups.length === 0) {
        container.innerHTML = '<p class="text-muted">No backups yet. Backups are created automatically before each save.</p>';
        return;
    }

    container.innerHTML = currentBackups.map(b => `
        <div class="ae-backup-item">
            <div class="ae-backup-info">
                <span class="ae-backup-date">${escHtml(new Date(b.created_at).toLocaleString())}</span>
                <span class="ae-backup-size text-muted">${escHtml(b.size || '')}</span>
            </div>
            <div class="ae-backup-actions">
                <button class="btn btn-sm" data-restore-backup="${escAttr(b.id || b.filename)}">Restore</button>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('[data-restore-backup]').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('Restore this backup? Current content will be replaced.')) return;
            try {
                const data = await api.get('/system/autoexec/backup/' + btn.dataset.restoreBackup);
                const editor = document.getElementById('aeEditor');
                if (editor && data.content) {
                    editor.value = data.content;
                    editor.dispatchEvent(new Event('input'));
                }
            } catch (e) {
                alert('Failed to restore backup: ' + e.message);
            }
        });
    });
}

export function destroyAutoexecEditor() {
    hasChanges = false;
    originalContent = '';
    currentBackups = [];
}
