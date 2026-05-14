/**
 * CommandCenter Component - Advanced command & control hub for campaign admins.
 *
 * Sections:
 *  1. Send Dialog          – alert/confirm/prompt dialogs to all clients
 *  2. Send Notification    – toast notifications with customizable icon, duration, position
 *  3. Play Sound           – trigger system sounds on all clients
 *  4. Narrative Event      – campaign/story triggers with branching
 *  5. Desktop Manipulation – change wallpaper, icons, pet, effects live
 *  6. Scheduled Commands   – queue actions for later execution
 *  7. Command Presets      – saved command templates for quick re-use
 *  8. Batch Operations     – multi-action sequences
 */

import { openEmojiPicker } from './EmojiPicker.js';
import { escHtml, escAttr } from '../sanitize.js';

// ── Constants ───────────────────────────────────────────────

const DIALOG_TYPES = [
    { value: 'alert',   label: 'Alert',   desc: 'Shows a message with an OK button' },
    { value: 'confirm', label: 'Confirm', desc: 'Shows a message with OK and Cancel buttons' },
    { value: 'prompt',  label: 'Prompt',  desc: 'Shows a message with a text input field' },
];

const DIALOG_ICONS = [
    { value: 'info',     label: 'Info',     emoji: 'ℹ️' },
    { value: 'warning',  label: 'Warning',  emoji: '⚠️' },
    { value: 'error',    label: 'Error',    emoji: '❌' },
    { value: 'question', label: 'Question', emoji: '❓' },
    { value: 'success',  label: 'Success',  emoji: '✅' },
    { value: 'custom',   label: 'Custom',   emoji: '🎯' },
];

const NOTIFICATION_POSITIONS = [
    { value: 'top-right',    label: 'Top Right' },
    { value: 'top-left',     label: 'Top Left' },
    { value: 'bottom-right', label: 'Bottom Right' },
    { value: 'bottom-left',  label: 'Bottom Left' },
    { value: 'top-center',   label: 'Top Center' },
    { value: 'bottom-center',label: 'Bottom Center' },
];

const NOTIFICATION_TYPES = [
    { value: 'info',    label: 'Info',    emoji: 'ℹ️' },
    { value: 'success', label: 'Success', emoji: '✅' },
    { value: 'warning', label: 'Warning', emoji: '⚠️' },
    { value: 'error',   label: 'Error',   emoji: '❌' },
    { value: 'achievement', label: 'Achievement', emoji: '🏆' },
];

const SOUND_EFFECTS = [
    { value: 'startup',        label: 'Startup Chime',       emoji: '🔊' },
    { value: 'shutdown',       label: 'Shutdown Sound',      emoji: '🔇' },
    { value: 'error',          label: 'Error Ding',          emoji: '❌' },
    { value: 'notify',         label: 'Notification',        emoji: '🔔' },
    { value: 'click',          label: 'Click',               emoji: '🖱️' },
    { value: 'recycle',        label: 'Recycle Bin',         emoji: '🗑️' },
    { value: 'maximize',       label: 'Maximize',            emoji: '🔲' },
    { value: 'minimize',       label: 'Minimize',            emoji: '🔳' },
    { value: 'menuOpen',       label: 'Menu Open',           emoji: '📂' },
    { value: 'menuClose',      label: 'Menu Close',          emoji: '📁' },
    { value: 'achievement',    label: 'Achievement Unlock',  emoji: '🏆' },
    { value: 'message',        label: 'New Message',         emoji: '💬' },
    { value: 'critical',       label: 'Critical Alert',      emoji: '🚨' },
];

const SOUND_OVERRIDE_TARGETS = SOUND_EFFECTS.map((s) => ({
    value: s.value,
    label: `${s.emoji} ${s.label}`
}));

const NARRATIVE_EVENT_TYPES = [
    { value: 'story.advance',      label: 'Advance Story',         desc: 'Progress the narrative to the next chapter or beat' },
    { value: 'story.branch',       label: 'Branch Story',          desc: 'Create a narrative branch point with choices' },
    { value: 'story.reveal',       label: 'Reveal Secret',         desc: 'Unlock hidden content or lore' },
    { value: 'story.flashback',    label: 'Trigger Flashback',     desc: 'Show a flashback sequence or memory' },
    { value: 'mood.shift',         label: 'Shift Mood',            desc: 'Change the ambient mood/atmosphere' },
    { value: 'mood.glitch',        label: 'Trigger Glitch',        desc: 'Create a visual/audio glitch effect' },
    { value: 'mood.dream',         label: 'Enter Dream State',     desc: 'Transition to a surreal dream sequence' },
    { value: 'character.appear',   label: 'Character Appears',     desc: 'Introduce or show a character' },
    { value: 'character.speak',    label: 'Character Speaks',      desc: 'Have a character say something (via Clippy or dialog)' },
    { value: 'character.leave',    label: 'Character Leaves',      desc: 'Dismiss a character from the scene' },
    { value: 'world.unlock',      label: 'Unlock Area',           desc: 'Make a new area, app, or content accessible' },
    { value: 'world.change',      label: 'World State Change',    desc: 'Alter the state of the virtual world' },
    { value: 'world.timer',       label: 'Start Timer',           desc: 'Begin a countdown or timed event' },
    { value: 'puzzle.hint',       label: 'Give Hint',             desc: 'Provide a hint for the current puzzle' },
    { value: 'puzzle.solve',      label: 'Auto-Solve',            desc: 'Automatically solve the current puzzle' },
    { value: 'puzzle.new',        label: 'New Puzzle',             desc: 'Present a new puzzle or challenge' },
];

const MOOD_TYPES = [
    'calm', 'tense', 'mysterious', 'happy', 'sad', 'horror',
    'nostalgic', 'glitchy', 'dreamy', 'urgent', 'celebratory', 'dark',
];

const DESKTOP_EFFECTS = [
    { value: 'crt_on',          label: 'Enable CRT Effect',      emoji: '📺' },
    { value: 'crt_off',         label: 'Disable CRT Effect',     emoji: '🖥️' },
    { value: 'shake',           label: 'Screen Shake',            emoji: '📳' },
    { value: 'flash',           label: 'Screen Flash',            emoji: '⚡' },
    { value: 'invert',          label: 'Invert Colors',           emoji: '🔄' },
    { value: 'matrix',          label: 'Matrix Rain',             emoji: '🟩' },
    { value: 'scanlines',       label: 'Scanlines',               emoji: '📡' },
    { value: 'vhs',             label: 'VHS Distortion',          emoji: '📼' },
    { value: 'bsod',            label: 'Blue Screen of Death',    emoji: '💀' },
    { value: 'snow',            label: 'Snow/Static',             emoji: '❄️' },
    { value: 'confetti',        label: 'Confetti',                emoji: '🎊' },
    { value: 'fireworks',       label: 'Fireworks',               emoji: '🎆' },
];

const WALLPAPER_PRESETS = [
    'clouds', 'tiles', 'waves', 'forest', 'space',
];

const PET_TYPES = ['neko', 'dog', 'sheep'];

const COMMAND_PRESET_KEY = 'adminCommandPresets';

// Legacy alias – prefer escAttr/escHtml from sanitize.js for new code.
const esc = escHtml;

function optionsHtml(items, valueKey = 'value', labelKey = 'label') {
    return items.map(i => `<option value="${i[valueKey]}">${i[labelKey]}</option>`).join('');
}

// ── Render ──────────────────────────────────────────────────
export function renderCommandCenter() {
    return `
        <div class="section-editor">
            <h2>Command Center</h2>
            <p class="section-desc">Advanced command & control hub. Send dialogs, notifications, sound effects, narrative events, visual effects, and more to all connected clients.</p>

            <!-- ─── 1. Send Dialog ───────────────────────── -->
            <div class="card">
                <h3>Send Dialog</h3>
                <p class="text-muted">Display a Windows 95-style dialog box on all connected clients.</p>
                <div class="inline-row">
                    <label>Dialog Type</label>
                    <select id="ccDialogType">
                        ${DIALOG_TYPES.map(t => `<option value="${t.value}">${t.label} — ${t.desc}</option>`).join('')}
                    </select>
                </div>
                <div class="inline-row">
                    <label>Icon</label>
                    <select id="ccDialogIcon">
                        ${DIALOG_ICONS.map(i => `<option value="${i.value}">${i.emoji} ${i.label}</option>`).join('')}
                    </select>
                </div>
                <div id="ccDialogCustomIconRow" class="inline-row" style="display:none">
                    <label>Custom Icon</label>
                    <input type="text" id="ccDialogCustomIcon" placeholder="Enter emoji" style="width:60px" maxlength="4">
                    <button type="button" class="emoji-trigger btn btn-sm btn-secondary" id="ccDialogIconPicker">😀</button>
                </div>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="ccDialogTitle" placeholder="System Message" maxlength="255">
                </div>
                <div class="form-group">
                    <label>Message</label>
                    <textarea id="ccDialogMessage" rows="3" placeholder="Enter the dialog message..."></textarea>
                </div>
                <div id="ccDialogPromptRow" class="form-group" style="display:none">
                    <label>Default Input Value</label>
                    <input type="text" id="ccDialogDefault" placeholder="Pre-filled value for prompt">
                </div>
                <button class="btn btn-primary" id="btnCcSendDialog">Send Dialog</button>
                <span id="ccDialogStatus" class="bc-status"></span>
            </div>

            <!-- ─── 2. Send Notification ─────────────────── -->
            <div class="card">
                <h3>Send Notification</h3>
                <p class="text-muted">Display a toast notification on all connected clients.</p>
                <div class="inline-row">
                    <label>Type</label>
                    <select id="ccNotifType">
                        ${NOTIFICATION_TYPES.map(t => `<option value="${t.value}">${t.emoji} ${t.label}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" id="ccNotifTitle" placeholder="Notification title" maxlength="255">
                </div>
                <div class="form-group">
                    <label>Message</label>
                    <input type="text" id="ccNotifMessage" placeholder="Notification message" maxlength="500">
                </div>
                <div class="inline-row">
                    <label>Icon</label>
                    <input type="text" id="ccNotifIcon" placeholder="Auto" style="width:60px" maxlength="4">
                    <button type="button" class="emoji-trigger btn btn-sm btn-secondary" id="ccNotifIconPicker">😀</button>
                </div>
                <div class="inline-row">
                    <label>Duration (seconds)</label>
                    <select id="ccNotifDuration">
                        <option value="3">3 seconds</option>
                        <option value="5" selected>5 seconds</option>
                        <option value="10">10 seconds</option>
                        <option value="15">15 seconds</option>
                        <option value="30">30 seconds</option>
                        <option value="0">Persistent (manual dismiss)</option>
                    </select>
                </div>
                <div class="inline-row">
                    <label>Position</label>
                    <select id="ccNotifPosition">
                        ${optionsHtml(NOTIFICATION_POSITIONS)}
                    </select>
                </div>
                <button class="btn btn-primary" id="btnCcSendNotif">Send Notification</button>
                <span id="ccNotifStatus" class="bc-status"></span>
            </div>

            <!-- ─── 3. Play Sound ────────────────────────── -->
            <div class="card">
                <h3>Play Sound Effect</h3>
                <p class="text-muted">Trigger a system sound effect on all connected clients.</p>
                <div class="inline-row">
                    <label>Sound</label>
                    <select id="ccSoundSelect">
                        <option value="">— Choose a sound —</option>
                        ${SOUND_EFFECTS.map(s => `<option value="${s.value}">${s.emoji} ${s.label}</option>`).join('')}
                    </select>
                </div>
                <div class="inline-row">
                    <label>Volume</label>
                    <input type="range" id="ccSoundVolume" min="0" max="1" step="0.1" value="0.5" style="width:150px">
                    <span id="ccSoundVolumeLabel">50%</span>
                </div>
                <button class="btn btn-primary" id="btnCcPlaySound" disabled>Play Sound</button>
                <span id="ccSoundStatus" class="bc-status"></span>
            </div>

            <div class="card">
                <h3>Multimedia Library (Upload + Broadcast)</h3>
                <p class="text-muted">Upload custom audio/video/image assets, optionally mirror them to virtual filesystem paths, and broadcast playback/open commands to clients.</p>
                <div class="inline-row">
                    <label>Media Type</label>
                    <select id="ccMediaType">
                        <option value="audio">Audio</option>
                        <option value="video">Video</option>
                        <option value="image">Image</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>File</label>
                    <input type="file" id="ccMediaFile" accept="audio/*,video/*,image/*">
                </div>
                <div class="form-group">
                    <label>Virtual path (optional; makes it visible in filesystem)</label>
                    <input type="text" id="ccMediaVirtualPath" placeholder="C:/Users/&lt;your-user&gt;/Music/my-track.mp3">
                </div>
                <button class="btn btn-primary" id="btnCcUploadMedia">Upload Media</button>
                <button class="btn btn-secondary" id="btnCcRefreshMedia">Refresh Library</button>
                <span id="ccMediaStatus" class="bc-status"></span>
                <div class="form-group" style="margin-top:10px">
                    <label>Uploaded Assets</label>
                    <select id="ccMediaAssetSelect">
                        <option value="">— No media loaded —</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="btnCcBroadcastMedia" disabled>Broadcast Selected Media</button>
                <span id="ccMediaBroadcastStatus" class="bc-status"></span>
                <div class="form-group" style="margin-top:12px">
                    <label>Use selected audio as system sound</label>
                    <div class="inline-row">
                        <select id="ccMediaSoundTarget">
                            <option value="">— Select sound slot —</option>
                            ${SOUND_OVERRIDE_TARGETS.map((t) => `<option value="${t.value}">${escHtml(t.label)}</option>`).join('')}
                        </select>
                        <button class="btn btn-secondary" id="btnCcAssignSound" disabled>Assign Sound</button>
                    </div>
                    <small class="text-muted">This writes an admin config override so future sessions use the uploaded file for that sound event.</small>
                </div>
                <span id="ccMediaAssignStatus" class="bc-status"></span>
            </div>

            <!-- ─── 4. Narrative Event ───────────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="ccNarrativeBody">
                    <h3>Narrative & Campaign Events</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <div id="ccNarrativeBody" class="bc-collapsible" style="display:none">
                    <p class="text-muted">Send story, mood, character, and puzzle events for interactive campaigns.</p>
                    <div class="form-group">
                        <label>Event Type</label>
                        <select id="ccNarrativeType">
                            <option value="">— Choose narrative event —</option>
                            <optgroup label="Story">
                                ${NARRATIVE_EVENT_TYPES.filter(e => e.value.startsWith('story.')).map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Mood & Atmosphere">
                                ${NARRATIVE_EVENT_TYPES.filter(e => e.value.startsWith('mood.')).map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Characters">
                                ${NARRATIVE_EVENT_TYPES.filter(e => e.value.startsWith('character.')).map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
                            </optgroup>
                            <optgroup label="World">
                                ${NARRATIVE_EVENT_TYPES.filter(e => e.value.startsWith('world.')).map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
                            </optgroup>
                            <optgroup label="Puzzles">
                                ${NARRATIVE_EVENT_TYPES.filter(e => e.value.startsWith('puzzle.')).map(e => `<option value="${e.value}">${e.label}</option>`).join('')}
                            </optgroup>
                        </select>
                    </div>
                    <div id="ccNarrativeDesc" class="bc-event-desc" style="display:none"></div>

                    <!-- Dynamic sub-forms based on event type -->
                    <div id="ccNarrativeMoodForm" style="display:none">
                        <div class="inline-row">
                            <label>Mood</label>
                            <select id="ccNarrativeMood">
                                ${MOOD_TYPES.map(m => `<option value="${m}">${m.charAt(0).toUpperCase() + m.slice(1)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="inline-row">
                            <label>Intensity</label>
                            <input type="range" id="ccNarrativeIntensity" min="0" max="1" step="0.1" value="0.7" style="width:150px">
                            <span id="ccNarrativeIntensityLabel">70%</span>
                        </div>
                    </div>

                    <div id="ccNarrativeCharForm" style="display:none">
                        <div class="form-group">
                            <label>Character Name</label>
                            <input type="text" id="ccNarrativeCharName" placeholder="e.g. Clippy, The Oracle, Agent X">
                        </div>
                        <div class="inline-row">
                            <label>Character Icon</label>
                            <input type="text" id="ccNarrativeCharIcon" placeholder="📎" style="width:60px">
                            <button type="button" class="emoji-trigger btn btn-sm btn-secondary" id="ccCharIconPicker">😀</button>
                        </div>
                    </div>

                    <div id="ccNarrativeStoryForm" style="display:none">
                        <div class="form-group">
                            <label>Chapter / Beat ID</label>
                            <input type="text" id="ccNarrativeChapter" placeholder="chapter_2, reveal_3, etc.">
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Title (optional)</label>
                        <input type="text" id="ccNarrativeTitle" placeholder="Event title" maxlength="255">
                    </div>
                    <div class="form-group">
                        <label>Message / Content</label>
                        <textarea id="ccNarrativeMessage" rows="3" placeholder="Event content, dialogue text, hint text, etc."></textarea>
                    </div>
                    <div class="form-group">
                        <label>Extra Payload (JSON, optional)</label>
                        <textarea id="ccNarrativePayload" rows="2" placeholder='{"key":"value"}' style="font-family:monospace"></textarea>
                    </div>
                    <button class="btn btn-primary" id="btnCcNarrative" disabled>Send Narrative Event</button>
                    <span id="ccNarrativeStatus" class="bc-status"></span>
                </div>
            </div>

            <!-- ─── 5. Desktop Effects ───────────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="ccEffectsBody">
                    <h3>Visual Effects & Desktop Control</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <div id="ccEffectsBody" class="bc-collapsible" style="display:none">
                    <p class="text-muted">Trigger visual effects or change desktop settings on all connected clients.</p>

                    <div class="cc-effects-section">
                        <h4>Quick Effects</h4>
                        <div class="bc-quick-grid" id="ccEffectsGrid">
                            ${DESKTOP_EFFECTS.map(e => `
                                <button class="bc-quick-btn cc-effect-btn" data-effect="${e.value}" title="${e.label}">
                                    <span class="bc-quick-icon">${e.emoji}</span>
                                    <span class="bc-quick-label">${e.label}</span>
                                </button>
                            `).join('')}
                        </div>
                        <span id="ccEffectStatus" class="bc-status"></span>
                    </div>

                    <div class="cc-effects-section" style="margin-top:16px">
                        <h4>Change Wallpaper</h4>
                        <div class="inline-row">
                            <label>Wallpaper</label>
                            <select id="ccWallpaper">
                                <option value="">— Current —</option>
                                ${WALLPAPER_PRESETS.map(w => `<option value="${w}">${w}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm btn-primary" id="btnCcWallpaper">Apply</button>
                        </div>
                    </div>

                    <div class="cc-effects-section" style="margin-top:16px">
                        <h4>Change Desktop Background Color</h4>
                        <div class="inline-row">
                            <label>Color</label>
                            <input type="color" id="ccBgColor" value="#008080">
                            <button class="btn btn-sm btn-primary" id="btnCcBgColor">Apply</button>
                        </div>
                    </div>

                    <div class="cc-effects-section" style="margin-top:16px">
                        <h4>Desktop Pet</h4>
                        <div class="inline-row">
                            <label>Pet Type</label>
                            <select id="ccPetType">
                                ${PET_TYPES.map(p => `<option value="${p}">${p}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm btn-success" id="btnCcPetShow">Show Pet</button>
                            <button class="btn btn-sm btn-danger" id="btnCcPetHide">Hide Pet</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ─── 6. Command Presets ───────────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="ccPresetsBody">
                    <h3>Command Presets</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <div id="ccPresetsBody" class="bc-collapsible" style="display:none">
                    <p class="text-muted">Save and recall frequently used command sequences. Presets are stored in your browser.</p>

                    <div class="card" style="margin-top:8px">
                        <h4>Save Current Command</h4>
                        <div class="inline-row">
                            <label>Preset Name</label>
                            <input type="text" id="ccPresetName" placeholder="e.g. Morning Announcement" maxlength="100">
                        </div>
                        <div class="inline-row">
                            <label>Command Type</label>
                            <select id="ccPresetType">
                                <option value="dialog">Dialog</option>
                                <option value="notification">Notification</option>
                                <option value="sound">Sound Effect</option>
                                <option value="effect">Visual Effect</option>
                                <option value="narrative">Narrative Event</option>
                                <option value="message">Broadcast Message</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Command Data (JSON)</label>
                            <textarea id="ccPresetData" rows="4" style="font-family:monospace" placeholder='{"type":"alert","title":"Hello","message":"World"}'></textarea>
                        </div>
                        <button class="btn btn-success btn-sm" id="btnCcPresetSave">Save Preset</button>
                    </div>

                    <div class="card" style="margin-top:8px">
                        <h4>Saved Presets</h4>
                        <div id="ccPresetList">Loading...</div>
                    </div>
                </div>
            </div>

            <!-- ─── 7. Batch Operations ──────────────────── -->
            <div class="card">
                <div class="bc-collapsible-header" data-target="ccBatchBody">
                    <h3>Batch Operations</h3>
                    <span class="bc-collapse-arrow">&#9654;</span>
                </div>
                <div id="ccBatchBody" class="bc-collapsible" style="display:none">
                    <p class="text-muted">Execute multiple commands in sequence with optional delays between them. Great for scripted events and campaign scenes.</p>
                    <div id="ccBatchList"></div>
                    <div class="form-actions">
                        <button class="btn btn-sm btn-secondary" id="btnCcBatchAdd">+ Add Step</button>
                        <button class="btn btn-sm btn-success" id="btnCcBatchRun">Run Sequence</button>
                        <button class="btn btn-sm btn-danger" id="btnCcBatchClear">Clear All</button>
                    </div>
                    <span id="ccBatchStatus" class="bc-status"></span>
                </div>
            </div>
        </div>
    `;
}

// ── Initialization ──────────────────────────────────────────
export async function initCommandCenter(api) {
    // Collapsible sections
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

    initDialogSection(api);
    initNotificationSection(api);
    initSoundSection(api);
    initMediaLibrarySection(api);
    initNarrativeSection(api);
    initEffectsSection(api);
    initPresetsSection(api);
    initBatchSection(api);
}

// ── 1. Dialog Section ───────────────────────────────────────
function initDialogSection(api) {
    const typeSelect = document.getElementById('ccDialogType');
    const iconSelect = document.getElementById('ccDialogIcon');
    const customRow = document.getElementById('ccDialogCustomIconRow');
    const promptRow = document.getElementById('ccDialogPromptRow');
    const customIcon = document.getElementById('ccDialogCustomIcon');

    typeSelect?.addEventListener('change', () => {
        promptRow.style.display = typeSelect.value === 'prompt' ? '' : 'none';
    });

    iconSelect?.addEventListener('change', () => {
        customRow.style.display = iconSelect.value === 'custom' ? '' : 'none';
    });

    // Emoji picker for custom icon
    document.getElementById('ccDialogIconPicker')?.addEventListener('click', () => {
        openEmojiPicker(document.getElementById('ccDialogIconPicker'), (emoji) => {
            customIcon.value = emoji;
        });
    });

    document.getElementById('btnCcSendDialog')?.addEventListener('click', async () => {
        const type = typeSelect.value;
        const iconType = iconSelect.value;
        const title = document.getElementById('ccDialogTitle').value.trim();
        const message = document.getElementById('ccDialogMessage').value.trim();

        if (!message) return showStatus('ccDialogStatus', 'Message is required', true);

        let icon;
        if (iconType === 'custom') {
            icon = customIcon.value || '📋';
        } else {
            icon = DIALOG_ICONS.find(i => i.value === iconType)?.emoji || 'ℹ️';
        }

        const payload = { type, title: title || 'System Message', message, icon };
        if (type === 'prompt') {
            payload.defaultValue = document.getElementById('ccDialogDefault').value;
        }

        try {
            await api.post('/events', {
                event_type: 'system.dialog',
                payload
            });
            showStatus('ccDialogStatus', `${type} dialog sent to all clients.`);
        } catch (e) {
            showStatus('ccDialogStatus', 'Error: ' + e.message, true);
        }
    });
}

// ── 2. Notification Section ─────────────────────────────────
function initNotificationSection(api) {
    // Emoji picker for notification icon
    document.getElementById('ccNotifIconPicker')?.addEventListener('click', () => {
        openEmojiPicker(document.getElementById('ccNotifIconPicker'), (emoji) => {
            document.getElementById('ccNotifIcon').value = emoji;
        });
    });

    document.getElementById('btnCcSendNotif')?.addEventListener('click', async () => {
        const type = document.getElementById('ccNotifType').value;
        const title = document.getElementById('ccNotifTitle').value.trim();
        const message = document.getElementById('ccNotifMessage').value.trim();
        const icon = document.getElementById('ccNotifIcon').value.trim();
        const duration = parseInt(document.getElementById('ccNotifDuration').value, 10);
        const position = document.getElementById('ccNotifPosition').value;

        if (!message && !title) return showStatus('ccNotifStatus', 'Title or message required', true);

        const payload = { type, title, message, duration: duration * 1000, position };
        if (icon) payload.icon = icon;

        try {
            await api.post('/events', {
                event_type: 'system.notification',
                payload
            });
            showStatus('ccNotifStatus', 'Notification sent to all clients.');
        } catch (e) {
            showStatus('ccNotifStatus', 'Error: ' + e.message, true);
        }
    });
}

// ── 3. Sound Section ────────────────────────────────────────
function initSoundSection(api) {
    const soundSelect = document.getElementById('ccSoundSelect');
    const playBtn = document.getElementById('btnCcPlaySound');
    const volumeSlider = document.getElementById('ccSoundVolume');
    const volumeLabel = document.getElementById('ccSoundVolumeLabel');

    soundSelect?.addEventListener('change', () => {
        playBtn.disabled = !soundSelect.value;
    });

    volumeSlider?.addEventListener('input', () => {
        volumeLabel.textContent = Math.round(volumeSlider.value * 100) + '%';
    });

    playBtn?.addEventListener('click', async () => {
        const sound = soundSelect.value;
        if (!sound) return;
        const volume = parseFloat(volumeSlider.value);

        try {
            await api.post('/events', {
                event_type: 'system.sound',
                payload: { sound, volume }
            });
            showStatus('ccSoundStatus', `Playing "${sound}" on all clients.`);
        } catch (e) {
            showStatus('ccSoundStatus', 'Error: ' + e.message, true);
        }
    });
}

export function renderMediaLibraryManager() {
    return `
        <div class="section-editor">
            <h2>Media Library</h2>
            <p class="section-desc">Upload audio/video/image files, mirror them into virtual filesystem paths, and assign audio files as system sounds.</p>
            <div class="card">
                <h3>Multimedia Library (Upload + Broadcast + Sound Mapping)</h3>
                <p class="text-muted">Use this panel to upload custom assets for admin/system use and user-facing virtual filesystem access.</p>
                <div class="inline-row">
                    <label>Media Type</label>
                    <select id="ccMediaType">
                        <option value="audio">Audio</option>
                        <option value="video">Video</option>
                        <option value="image">Image</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>File</label>
                    <input type="file" id="ccMediaFile" accept="audio/*,video/*,image/*">
                </div>
                <div class="form-group">
                    <label>Virtual path (optional; makes it visible in filesystem)</label>
                    <input type="text" id="ccMediaVirtualPath" placeholder="C:/Users/&lt;your-user&gt;/Music/my-track.mp3">
                </div>
                <button class="btn btn-primary" id="btnCcUploadMedia">Upload Media</button>
                <button class="btn btn-secondary" id="btnCcRefreshMedia">Refresh Library</button>
                <span id="ccMediaStatus" class="bc-status"></span>
                <div class="form-group" style="margin-top:10px">
                    <label>Uploaded Assets</label>
                    <select id="ccMediaAssetSelect">
                        <option value="">— No media loaded —</option>
                    </select>
                </div>
                <button class="btn btn-primary" id="btnCcBroadcastMedia" disabled>Broadcast Selected Media</button>
                <span id="ccMediaBroadcastStatus" class="bc-status"></span>
                <div class="form-group" style="margin-top:12px">
                    <label>Use selected audio as system sound</label>
                    <div class="inline-row">
                        <select id="ccMediaSoundTarget">
                            <option value="">— Select sound slot —</option>
                            ${SOUND_OVERRIDE_TARGETS.map((t) => `<option value="${t.value}">${escHtml(t.label)}</option>`).join('')}
                        </select>
                        <button class="btn btn-secondary" id="btnCcAssignSound" disabled>Assign Sound</button>
                    </div>
                </div>
                <span id="ccMediaAssignStatus" class="bc-status"></span>
            </div>
        </div>
    `;
}

function getAuthHeaders() {
    const token = sessionStorage.getItem('v2Token') || '';
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizePath(input) {
    return String(input || '').trim().replace(/\\/g, '/');
}

function resolveVirtualPath(rawInput, username, folder, fileName) {
    const safeUser = (username || 'User').trim() || 'User';
    const normalized = normalizePath(rawInput);
    if (!normalized) {
        return `C:/Users/${safeUser}/${folder}/${fileName}`;
    }

    // Convenience shorthands:
    // - "Desktop/foo.mp3" -> C:/Users/<user>/Desktop/foo.mp3
    // - "/Desktop/foo.mp3" -> C:/Users/<user>/Desktop/foo.mp3
    // - "foo.mp3" -> C:/Users/<user>/<folder>/foo.mp3
    if (/^(desktop|documents|music|videos|pictures|downloads)\//i.test(normalized)) {
        return `C:/Users/${safeUser}/${normalized}`;
    }
    if (/^\/(desktop|documents|music|videos|pictures|downloads)\//i.test(normalized)) {
        return `C:/Users/${safeUser}${normalized}`;
    }
    if (!/^[A-Za-z]:\//.test(normalized)) {
        return `C:/Users/${safeUser}/${folder}/${normalized}`;
    }

    return normalized;
}

function toDownloadUrl(fileId) {
    const base = window.location.pathname.includes('/admin')
        ? window.location.pathname.split('/admin')[0]
        : '';
    return `${base}/api/v2/files/${fileId}/download`;
}

async function listMediaAssets(api) {
    const resp = await api.get('/files?limit=500');
    const files = Array.isArray(resp.files) ? resp.files : [];
    return files.filter((f) => /^audio\/|^video\/|^image\//.test((f.mime_type || '').toLowerCase()));
}

function updateMediaSelect(files) {
    const select = document.getElementById('ccMediaAssetSelect');
    if (!select) return;
    if (!files.length) {
        select.innerHTML = '<option value="">— No media uploaded yet —</option>';
        return;
    }
    select.innerHTML = ['<option value="">— Select uploaded media —</option>']
        .concat(files.map((f) => {
            const mediaType = (f.mime_type || '').split('/')[0] || 'file';
            const label = `${f.original_name || f.virtual_path} [${mediaType}]`;
            return `<option value="${f.id}" data-type="${mediaType}" data-name="${escAttr(f.original_name || 'media')}" data-url="${escAttr(toDownloadUrl(f.id))}">${escHtml(label)}</option>`;
        }))
        .join('');
}

export function initMediaLibrarySection(api) {
    const uploadBtn = document.getElementById('btnCcUploadMedia');
    const refreshBtn = document.getElementById('btnCcRefreshMedia');
    const broadcastBtn = document.getElementById('btnCcBroadcastMedia');
    const assignBtn = document.getElementById('btnCcAssignSound');
    const soundTarget = document.getElementById('ccMediaSoundTarget');
    const select = document.getElementById('ccMediaAssetSelect');
    let currentUsername = 'User';

    const refresh = async () => {
        try {
            const files = await listMediaAssets(api);
            updateMediaSelect(files);
            showStatus('ccMediaStatus', `Loaded ${files.length} media asset(s).`);
        } catch (e) {
            showStatus('ccMediaStatus', 'Error loading media library: ' + e.message, true);
        }
    };

    // The virtual filesystem convention uses C:/Users/User/... across the OS.
    const input = document.getElementById('ccMediaVirtualPath');
    if (input && !input.value.trim()) {
        input.placeholder = `C:/Users/${currentUsername}/Music/my-track.mp3`;
    }

    select?.addEventListener('change', () => {
        broadcastBtn.disabled = !select.value;
        const opt = select.selectedOptions?.[0];
        const isAudio = opt && (opt.dataset.type === 'audio');
        assignBtn.disabled = !select.value || !isAudio || !soundTarget?.value;
    });
    soundTarget?.addEventListener('change', () => {
        const opt = select?.selectedOptions?.[0];
        const isAudio = opt && (opt.dataset.type === 'audio');
        assignBtn.disabled = !soundTarget.value || !select?.value || !isAudio;
    });
    refreshBtn?.addEventListener('click', refresh);

    uploadBtn?.addEventListener('click', async () => {
        const fileInput = document.getElementById('ccMediaFile');
        const type = document.getElementById('ccMediaType').value;
        const virtualPathRaw = (document.getElementById('ccMediaVirtualPath').value || '').trim();
        const file = fileInput?.files?.[0];
        if (!file) return showStatus('ccMediaStatus', 'Choose a file first.', true);

        const folder = type === 'audio' ? 'Music' : (type === 'video' ? 'Videos' : 'Pictures');
        const virtualPath = resolveVirtualPath(virtualPathRaw, currentUsername, folder, file.name);

        try {
            const base = window.location.pathname.includes('/admin')
                ? window.location.pathname.split('/admin')[0]
                : '';
            const form = new FormData();
            form.append('file', file);
            form.append('virtual_path', virtualPath);
            const resp = await fetch(`${base}/api/v2/files/upload`, {
                method: 'POST',
                headers: { 'X-Requested-With': 'XMLHttpRequest', ...getAuthHeaders() },
                body: form
            });
            const data = await resp.json();
            if (!resp.ok) {
                const rawError = data?.error || 'Upload failed';
                const hint = rawError.includes('Invalid virtual_path')
                    ? ` Invalid path. Use C:/Users/User/... (or shortcuts like Desktop/file.mp3).`
                    : '';
                throw new Error(rawError + hint);
            }
            showStatus('ccMediaStatus', `Uploaded ${file.name} to ${virtualPath}`);
            await refresh();
        } catch (e) {
            showStatus('ccMediaStatus', 'Upload error: ' + e.message, true);
        }
    });

    broadcastBtn?.addEventListener('click', async () => {
        const opt = select?.selectedOptions?.[0];
        if (!opt || !opt.value) return;
        try {
            await api.post('/events', {
                event_type: 'system.media',
                payload: {
                    mediaType: opt.dataset.type,
                    src: opt.dataset.url,
                    name: opt.dataset.name || 'media'
                }
            });
            showStatus('ccMediaBroadcastStatus', `Broadcasted ${opt.dataset.name || 'media'}.`);
        } catch (e) {
            showStatus('ccMediaBroadcastStatus', 'Broadcast error: ' + e.message, true);
        }
    });

    assignBtn?.addEventListener('click', async () => {
        const opt = select?.selectedOptions?.[0];
        const target = soundTarget?.value;
        if (!opt || !opt.value || !target) return;
        if (opt.dataset.type !== 'audio') {
            return showStatus('ccMediaAssignStatus', 'Only audio files can be assigned to system sound slots.', true);
        }

        try {
            const merged = await api.get('/config');
            const features = merged.features || {};
            const soundFeature = features.soundsystem || {};
            const soundConfig = soundFeature.config || {};
            const soundOverrides = soundConfig.soundOverrides || {};
            soundOverrides[target] = opt.dataset.url;

            await api.put('/config/features', {
                data: {
                    ...features,
                    soundsystem: {
                        ...soundFeature,
                        config: {
                            ...soundConfig,
                            soundOverrides
                        }
                    }
                }
            });
            showStatus('ccMediaAssignStatus', `Assigned "${opt.dataset.name || 'audio'}" to "${target}".`);
        } catch (e) {
            showStatus('ccMediaAssignStatus', 'Assign error: ' + e.message, true);
        }
    });

    refresh();
}

// ── 4. Narrative Section ────────────────────────────────────
function initNarrativeSection(api) {
    const typeSelect = document.getElementById('ccNarrativeType');
    const descEl = document.getElementById('ccNarrativeDesc');
    const sendBtn = document.getElementById('btnCcNarrative');

    const moodForm = document.getElementById('ccNarrativeMoodForm');
    const charForm = document.getElementById('ccNarrativeCharForm');
    const storyForm = document.getElementById('ccNarrativeStoryForm');
    const intensitySlider = document.getElementById('ccNarrativeIntensity');
    const intensityLabel = document.getElementById('ccNarrativeIntensityLabel');

    typeSelect?.addEventListener('change', () => {
        const val = typeSelect.value;
        sendBtn.disabled = !val;

        const def = NARRATIVE_EVENT_TYPES.find(e => e.value === val);
        if (def) {
            descEl.textContent = def.desc;
            descEl.style.display = '';
        } else {
            descEl.style.display = 'none';
        }

        moodForm.style.display = val.startsWith('mood.') ? '' : 'none';
        charForm.style.display = val.startsWith('character.') ? '' : 'none';
        storyForm.style.display = val.startsWith('story.') || val.startsWith('world.') || val.startsWith('puzzle.') ? '' : 'none';
    });

    intensitySlider?.addEventListener('input', () => {
        intensityLabel.textContent = Math.round(intensitySlider.value * 100) + '%';
    });

    // Emoji picker for character icon
    document.getElementById('ccCharIconPicker')?.addEventListener('click', () => {
        openEmojiPicker(document.getElementById('ccCharIconPicker'), (emoji) => {
            document.getElementById('ccNarrativeCharIcon').value = emoji;
        });
    });

    sendBtn?.addEventListener('click', async () => {
        const eventType = typeSelect.value;
        if (!eventType) return;

        const title = document.getElementById('ccNarrativeTitle').value.trim();
        const message = document.getElementById('ccNarrativeMessage').value.trim();
        const extraRaw = document.getElementById('ccNarrativePayload').value.trim();

        let extra = {};
        if (extraRaw) {
            try { extra = JSON.parse(extraRaw); } catch {
                return showStatus('ccNarrativeStatus', 'Invalid JSON in extra payload', true);
            }
        }

        const payload = { ...extra };
        if (title) payload.title = title;
        if (message) payload.message = message;

        if (eventType.startsWith('mood.')) {
            payload.mood = document.getElementById('ccNarrativeMood').value;
            payload.intensity = parseFloat(intensitySlider.value);
        }
        if (eventType.startsWith('character.')) {
            payload.characterName = document.getElementById('ccNarrativeCharName').value.trim();
            payload.characterIcon = document.getElementById('ccNarrativeCharIcon').value.trim();
        }
        if (eventType.startsWith('story.') || eventType.startsWith('world.') || eventType.startsWith('puzzle.')) {
            const chapter = document.getElementById('ccNarrativeChapter').value.trim();
            if (chapter) payload.chapterId = chapter;
        }

        try {
            await api.post('/events', {
                event_type: `narrative.${eventType}`,
                payload
            });
            showStatus('ccNarrativeStatus', `Narrative event "${eventType}" dispatched.`);
        } catch (e) {
            showStatus('ccNarrativeStatus', 'Error: ' + e.message, true);
        }
    });
}

// ── 5. Effects Section ──────────────────────────────────────
function initEffectsSection(api) {
    // Quick effect buttons
    document.querySelectorAll('.cc-effect-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const effect = btn.dataset.effect;
            btn.disabled = true;
            try {
                await api.post('/events', {
                    event_type: 'system.effect',
                    payload: { effect }
                });
                showStatus('ccEffectStatus', `Effect "${effect}" triggered.`);
            } catch (e) {
                showStatus('ccEffectStatus', 'Error: ' + e.message, true);
            } finally {
                btn.disabled = false;
            }
        });
    });

    // Wallpaper change
    document.getElementById('btnCcWallpaper')?.addEventListener('click', async () => {
        const wp = document.getElementById('ccWallpaper').value;
        if (!wp) return;
        try {
            await api.post('/events', {
                event_type: 'config.changed',
                payload: { section: 'defaults', changes: { wallpaper: wp } }
            });
            showStatus('ccEffectStatus', `Wallpaper changed to "${wp}".`);
        } catch (e) {
            showStatus('ccEffectStatus', 'Error: ' + e.message, true);
        }
    });

    // Background color change
    document.getElementById('btnCcBgColor')?.addEventListener('click', async () => {
        const color = document.getElementById('ccBgColor').value;
        try {
            await api.post('/events', {
                event_type: 'config.changed',
                payload: { section: 'defaults', changes: { desktopBg: color } }
            });
            showStatus('ccEffectStatus', `Background color changed to ${color}.`);
        } catch (e) {
            showStatus('ccEffectStatus', 'Error: ' + e.message, true);
        }
    });

    // Pet controls
    document.getElementById('btnCcPetShow')?.addEventListener('click', async () => {
        const petType = document.getElementById('ccPetType').value;
        try {
            await api.post('/events', {
                event_type: 'config.changed',
                payload: { section: 'defaults', changes: { petEnabled: true, petType } }
            });
            showStatus('ccEffectStatus', `Desktop pet (${petType}) shown.`);
        } catch (e) {
            showStatus('ccEffectStatus', 'Error: ' + e.message, true);
        }
    });

    document.getElementById('btnCcPetHide')?.addEventListener('click', async () => {
        try {
            await api.post('/events', {
                event_type: 'config.changed',
                payload: { section: 'defaults', changes: { petEnabled: false } }
            });
            showStatus('ccEffectStatus', 'Desktop pet hidden.');
        } catch (e) {
            showStatus('ccEffectStatus', 'Error: ' + e.message, true);
        }
    });
}

// ── 6. Presets Section ──────────────────────────────────────
function initPresetsSection(api) {
    loadPresets();

    document.getElementById('btnCcPresetSave')?.addEventListener('click', () => {
        const name = document.getElementById('ccPresetName').value.trim();
        const type = document.getElementById('ccPresetType').value;
        const dataRaw = document.getElementById('ccPresetData').value.trim();

        if (!name) return alert('Preset name is required');
        if (!dataRaw) return alert('Command data is required');

        let data;
        try { data = JSON.parse(dataRaw); } catch {
            return alert('Invalid JSON in command data');
        }

        const presets = getPresets();
        presets.push({ name, type, data, created: new Date().toISOString() });
        savePresets(presets);
        loadPresets();

        document.getElementById('ccPresetName').value = '';
        document.getElementById('ccPresetData').value = '';
    });
}

function getPresets() {
    try { return JSON.parse(localStorage.getItem(COMMAND_PRESET_KEY)) || []; }
    catch { return []; }
}

function savePresets(presets) {
    localStorage.setItem(COMMAND_PRESET_KEY, JSON.stringify(presets));
}

function loadPresets() {
    const container = document.getElementById('ccPresetList');
    if (!container) return;

    const presets = getPresets();
    if (presets.length === 0) {
        container.innerHTML = '<p class="text-muted">No saved presets yet.</p>';
        return;
    }

    container.innerHTML = presets.map((p, i) => `
        <div class="list-item">
            <div class="item-content" style="flex-direction:column;align-items:flex-start;gap:2px">
                <strong>${esc(p.name)}</strong>
                <small class="text-muted">Type: ${esc(p.type)} &bull; Created: ${new Date(p.created).toLocaleString()}</small>
                <code style="font-size:11px;color:var(--text-muted);max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">${esc(JSON.stringify(p.data))}</code>
            </div>
            <div class="item-actions">
                <button class="btn btn-sm btn-primary cc-preset-run" data-index="${i}">Run</button>
                <button class="btn btn-sm btn-secondary cc-preset-load" data-index="${i}">Load</button>
                <button class="btn btn-sm btn-danger cc-preset-delete" data-index="${i}">Delete</button>
            </div>
        </div>
    `).join('');

    // Run preset
    container.querySelectorAll('.cc-preset-run').forEach(btn => {
        btn.addEventListener('click', async () => {
            const preset = presets[parseInt(btn.dataset.index)];
            if (!preset) return;
            await executePreset(preset);
        });
    });

    // Load preset into editor
    container.querySelectorAll('.cc-preset-load').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = presets[parseInt(btn.dataset.index)];
            if (!preset) return;
            document.getElementById('ccPresetName').value = preset.name;
            document.getElementById('ccPresetType').value = preset.type;
            document.getElementById('ccPresetData').value = JSON.stringify(preset.data, null, 2);
        });
    });

    // Delete preset
    container.querySelectorAll('.cc-preset-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!confirm('Delete this preset?')) return;
            const idx = parseInt(btn.dataset.index);
            const p = getPresets();
            p.splice(idx, 1);
            savePresets(p);
            loadPresets();
        });
    });
}

async function executePreset(preset) {
    const typeToEvent = {
        dialog: 'system.dialog',
        notification: 'system.notification',
        sound: 'system.sound',
        effect: 'system.effect',
        narrative: 'narrative.custom',
        message: 'system.message',
    };

    const eventType = typeToEvent[preset.type] || 'system.message';

    // For a preset, we need the api reference from the closure
    // Since presets run in the global scope, use the v2Api from the module
    try {
        const resp = await fetch(getV2Url('/events'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Authorization': `Bearer ${sessionStorage.getItem('v2Token')}`,
            },
            body: JSON.stringify({ event_type: eventType, payload: preset.data })
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        alert(`Preset "${preset.name}" executed successfully.`);
    } catch (e) {
        alert('Error executing preset: ' + e.message);
    }
}

function getV2Url(path) {
    const loc = window.location.pathname;
    const adminIdx = loc.indexOf('/admin');
    const base = adminIdx !== -1 ? loc.substring(0, adminIdx + 1) : '/';
    return base + 'api/v2' + path;
}

// ── 7. Batch Section ────────────────────────────────────────
let batchSteps = [];

function initBatchSection(api) {
    renderBatchList();

    document.getElementById('btnCcBatchAdd')?.addEventListener('click', () => {
        batchSteps.push({
            type: 'dialog',
            event: 'system.dialog',
            payload: { type: 'alert', title: 'Step ' + (batchSteps.length + 1), message: 'Message' },
            delay: 0,
        });
        renderBatchList();
    });

    document.getElementById('btnCcBatchClear')?.addEventListener('click', () => {
        batchSteps = [];
        renderBatchList();
    });

    document.getElementById('btnCcBatchRun')?.addEventListener('click', async () => {
        if (batchSteps.length === 0) return showStatus('ccBatchStatus', 'No steps to run', true);

        showStatus('ccBatchStatus', 'Running batch sequence...');
        for (let i = 0; i < batchSteps.length; i++) {
            const step = batchSteps[i];
            if (step.delay > 0) {
                showStatus('ccBatchStatus', `Waiting ${step.delay}s before step ${i + 1}...`);
                await sleep(step.delay * 1000);
            }
            showStatus('ccBatchStatus', `Executing step ${i + 1}/${batchSteps.length}...`);
            try {
                await api.post('/events', {
                    event_type: step.event,
                    payload: step.payload
                });
            } catch (e) {
                showStatus('ccBatchStatus', `Step ${i + 1} failed: ${e.message}`, true);
                return;
            }
        }
        showStatus('ccBatchStatus', `All ${batchSteps.length} steps completed.`);
    });
}

function renderBatchList() {
    const container = document.getElementById('ccBatchList');
    if (!container) return;

    if (batchSteps.length === 0) {
        container.innerHTML = '<p class="text-muted">No steps added yet. Click "+ Add Step" to begin.</p>';
        return;
    }

    container.innerHTML = batchSteps.map((step, i) => `
        <div class="list-item" style="flex-wrap:wrap">
            <span style="font-weight:600;min-width:30px">#${i + 1}</span>
            <div class="item-content" style="flex-wrap:wrap;gap:4px">
                <select class="batch-event-type" data-index="${i}" style="width:160px">
                    <option value="system.dialog" ${step.event === 'system.dialog' ? 'selected' : ''}>Dialog</option>
                    <option value="system.notification" ${step.event === 'system.notification' ? 'selected' : ''}>Notification</option>
                    <option value="system.sound" ${step.event === 'system.sound' ? 'selected' : ''}>Sound</option>
                    <option value="system.effect" ${step.event === 'system.effect' ? 'selected' : ''}>Effect</option>
                    <option value="system.message" ${step.event === 'system.message' ? 'selected' : ''}>Message</option>
                    <option value="system.app.launch" ${step.event === 'system.app.launch' ? 'selected' : ''}>Launch App</option>
                </select>
                <input type="number" class="batch-delay" data-index="${i}" value="${step.delay}" min="0" max="300" style="width:80px" placeholder="Delay (s)" title="Delay in seconds before this step">
                <span class="text-muted" style="font-size:11px">sec delay</span>
                <textarea class="batch-payload" data-index="${i}" rows="1" style="flex:1;min-width:200px;font-family:monospace;font-size:11px">${esc(JSON.stringify(step.payload))}</textarea>
            </div>
            <div class="item-actions">
                <button class="btn btn-danger btn-sm batch-remove" data-index="${i}">Remove</button>
            </div>
        </div>
    `).join('');

    // Event type change
    container.querySelectorAll('.batch-event-type').forEach(sel => {
        sel.addEventListener('change', () => {
            const idx = parseInt(sel.dataset.index);
            batchSteps[idx].event = sel.value;
        });
    });

    // Delay change
    container.querySelectorAll('.batch-delay').forEach(input => {
        input.addEventListener('change', () => {
            const idx = parseInt(input.dataset.index);
            batchSteps[idx].delay = parseInt(input.value) || 0;
        });
    });

    // Payload change
    container.querySelectorAll('.batch-payload').forEach(ta => {
        ta.addEventListener('change', () => {
            const idx = parseInt(ta.dataset.index);
            try {
                batchSteps[idx].payload = JSON.parse(ta.value);
            } catch {
                ta.style.borderColor = 'var(--danger)';
            }
        });
    });

    // Remove step
    container.querySelectorAll('.batch-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            batchSteps.splice(parseInt(btn.dataset.index), 1);
            renderBatchList();
        });
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Shared helpers ──────────────────────────────────────────
function showStatus(elementId, message, isError = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = 'bc-status ' + (isError ? 'bc-status-error' : 'bc-status-ok');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.textContent = ''; el.className = 'bc-status'; }, 5000);
}
