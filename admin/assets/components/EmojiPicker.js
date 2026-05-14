/**
 * EmojiPicker Component - Reusable emoji picker with categorized emoji collection.
 *
 * Usage:
 *   import { attachEmojiPicker } from './EmojiPicker.js';
 *   attachEmojiPicker(inputElement, { onSelect(emoji) { ... } });
 *
 * Or standalone:
 *   import { openEmojiPicker } from './EmojiPicker.js';
 *   openEmojiPicker(anchorElement, (emoji) => { ... });
 */

// ── Emoji Database ──────────────────────────────────────────
const EMOJI_CATEGORIES = {
    'Smileys': [
        '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃',
        '😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙',
        '🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🫢',
        '🤫','🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏',
        '😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷',
        '🤒','🤕','🤢','🤮','🥴','😵','🤯','🥳','🥸','😎',
        '🤓','🧐','😕','🫤','😟','🙁','😮','😯','😲','😳',
        '🥺','🥹','😦','😧','😨','😰','😥','😢','😭','😱',
        '😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠',
        '🤬','😈','👿','💀','☠️','💩','🤡','👹','👺','👻',
        '👽','👾','🤖','😺','😸','😹','😻','😼','😽','🙀',
        '😿','😾',
    ],
    'People': [
        '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌',
        '🤌','🤏','✌️','🤞','🫰','🤟','🤘','🤙','👈','👉',
        '👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛',
        '🤜','👏','🙌','🫶','👐','🤲','🤝','🙏','✍️','💅',
        '🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠',
        '🫀','🫁','🦷','🦴','👀','👁️','👅','👄','🫦','👶',
        '🧒','👦','👧','🧑','👱','👨','🧔','👩','🧓','👴',
        '👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦',
        '🤷','👮','🕵️','💂','🥷','👷','🫅','🤴','👸','👳',
        '👲','🧕','🤵','👰','🤰','🫃','🤱','👼','🎅','🤶',
        '🦸','🦹','🧙','🧚','🧛','🧜','🧝','🧞','🧟','🧌',
        '💆','💇','🚶','🧍','🧎','🏃','💃','🕺','🕴️','👯',
        '🧖','🧗','🤸','⛹️','🏋️','🚴','🚵','🤼','🤽','🤾',
        '🤺','⛷️','🏂','🏌️','🏇','🏊','🤹','🛀','🛌',
    ],
    'Animals': [
        '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨',
        '🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊',
        '🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉',
        '🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌',
        '🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷️','🕸️','🦂',
        '🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀',
        '🪸','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅',
        '🐆','🦓','🦍','🦧','🐘','🦛','🦏','🐪','🐫','🦒',
        '🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙',
        '🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓',
        '🦃','🦤','🦚','🦜','🦢','🦩','🕊️','🐇','🦝','🦨',
        '🦡','🦫','🦦','🦥','🐁','🐀','🐿️','🦔',
    ],
    'Nature': [
        '🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘️','🍀',
        '🎍','🪴','🎋','🍃','🍂','🍁','🪺','🪹','🍄','🌾',
        '💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌝',
        '🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓',
        '🌔','🌙','🌎','🌍','🌏','🪐','💫','⭐','🌟','✨',
        '⚡','☄️','💥','🔥','🌪️','🌈','☀️','🌤️','⛅','🌥️',
        '☁️','🌦️','🌧️','⛈️','🌩️','🌨️','❄️','☃️','⛄','🌬️',
        '💨','💧','💦','🫧','☔','☂️','🌊','🌫️',
    ],
    'Food': [
        '🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐',
        '🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑',
        '🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅',
        '🥔','🍠','🫘','🥐','🥯','🍞','🥖','🥨','🧀','🥚',
        '🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭',
        '🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔',
        '🥗','🥘','🫕','🍝','🍜','🍲','🍛','🍣','🍱','🥟',
        '🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡',
        '🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬',
        '🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖',
        '☕','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷',
        '🥃','🍸','🍹','🧉','🍾','🧊',
    ],
    'Activities': [
        '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱',
        '🪀','🏓','🏸','🏒','🏑','🥍','🏏','🪃','🥅','⛳',
        '🪁','🏹','🎣','🤿','🥊','🥋','🎽','🛹','🛼','🛷',
        '⛸️','🥌','🎿','⛷️','🏂','🪂','🏋️','🤸','🤼','🤽',
        '🤾','🤺','⛹️','🧘','🏄','🏊','🚣','🧗','🚵','🚴',
        '🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️','🎫','🎟️',
        '🎪','🤹','🎭','🩰','🎨','🎬','🎤','🎧','🎼','🎹',
        '🥁','🪘','🎷','🎺','🪗','🎸','🪕','🎻','🪈','🎲',
        '♟️','🎯','🎳','🎮','🕹️','🎰',
    ],
    'Travel': [
        '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐',
        '🛻','🚚','🚛','🚜','🏍️','🛵','🦽','🦼','🛺','🚲',
        '🛴','🛹','🛼','🚏','🛣️','🛤️','🛞','⛽','🛞','🚨',
        '🚥','🚦','🛑','🚧','⚓','🛟','⛵','🛶','🚤','🛳️',
        '⛴️','🛥️','🚢','✈️','🛩️','🛫','🛬','🪂','💺','🚁',
        '🚟','🚠','🚡','🛰️','🚀','🛸','🎆','🎇','🎑','🗼',
        '🏰','🏯','🏟️','🎡','🎢','🎠','⛲','⛱️','🏖️','🏝️',
        '🏜️','🌋','⛰️','🏔️','🗻','🏕️','⛺','🛖','🏠','🏡',
        '🏘️','🏚️','🏗️','🏭','🏢','🏬','🏣','🏤','🏥','🏦',
        '🏨','🏪','🏫','🏩','💒','🏛️','⛪','🕌','🕍','🛕',
        '🕋','⛩️','🗾','🎌','🗺️','🧭','🗿',
    ],
    'Objects': [
        '⌚','📱','📲','💻','⌨️','🖥️','🖨️','🖱️','🖲️','🕹️',
        '🗜️','💽','💾','💿','📀','📼','📷','📸','📹','🎥',
        '📽️','🎞️','📞','☎️','📟','📠','📺','📻','🎙️','🎚️',
        '🎛️','🧭','⏱️','⏲️','⏰','🕰️','⌛','⏳','📡','🔋',
        '🪫','🔌','💡','🔦','🕯️','🪔','🧯','🛢️','💸','💵',
        '💴','💶','💷','🪙','💰','💳','💎','⚖️','🪜','🧰',
        '🪛','🔧','🔨','⚒️','🛠️','⛏️','🪚','🔩','⚙️','🪤',
        '🧱','⛓️','🧲','🔫','💣','🪓','🔪','🗡️','⚔️','🛡️',
        '🚬','⚰️','🪦','⚱️','🏺','🔮','📿','🧿','🪬','💈',
        '⚗️','🔭','🔬','🕳️','🩹','🩺','🩻','🩼','💊','💉',
        '🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻',
        '🚽','🚰','🚿','🛁','🛀','🧼','🪥','🪒','🧽','🪣',
        '🧴','🛎️','🔑','🗝️','🚪','🪑','🛋️','🛏️','🛌','🧸',
        '🪆','🖼️','🪞','🪟','🛍️','🛒','🎁','🎈','🎏','🎀',
        '🪄','🎊','🎉','🎎','🏮','🎐','🧧','✉️','📩','📨',
        '📧','💌','📥','📤','📦','🏷️','🪧','📪','📫','📬',
        '📭','📮','📯','📜','📃','📄','📑','🧾','📊','📈',
        '📉','🗒️','🗓️','📆','📅','🗑️','📇','🗃️','🗳️','🗄️',
        '📋','📁','📂','🗂️','🗞️','📰','📓','📔','📒','📕',
        '📗','📘','📙','📚','📖','🔖','🧷','🔗','📎','🖇️',
        '📐','📏','🧮','📌','📍','✂️','🖊️','🖋️','✒️','🖌️',
        '🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓',
    ],
    'Symbols': [
        '❤️','🩷','🧡','💛','💚','💙','🩵','💜','🖤','🩶',
        '🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕','💞','💓','💗',
        '💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️',
        '🔯','🕎','☯️','☦️','🛐','⛎','♈','♉','♊','♋',
        '♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚛️',
        '🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️',
        '✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲',
        '🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔',
        '📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞',
        '📵','🚭','❗','❕','❓','❔','‼️','⁉️','🔅','🔆',
        '〽️','⚠️','🚸','🔱','⚜️','🔰','♻️','✅','🈯','💹',
        '❇️','✳️','❎','🌐','💠','Ⓜ️','🌀','💤','🏧','🚾',
        '♿','🅿️','🛗','🈳','🈂️','🛂','🛃','🛄','🛅',
        '🔣','ℹ️','🔤','🔡','🔠','🆖','🆗','🆙','🆒','🆕',
        '🆓','0️⃣','1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣',
        '9️⃣','🔟','🔢','#️⃣','*️⃣','⏏️','▶️','⏸️','⏯️','⏹️',
        '⏺️','⏭️','⏮️','⏩','⏪','⏫','⏬','◀️','🔼','🔽',
        '➡️','⬅️','⬆️','⬇️','↗️','↘️','↙️','↖️','↕️','↔️',
        '↩️','↪️','⤴️','⤵️','🔀','🔁','🔂','🔄','🔃','🎵',
        '🎶','➕','➖','➗','✖️','🟰','♾️','💲','💱','™️',
        '©️','®️','〰️','➰','➿','🔚','🔙','🔛','🔝','🔜',
        '✔️','☑️','🔘','🔴','🟠','🟡','🟢','🔵','🟣','⚫',
        '⚪','🟤','🔺','🔻','🔸','🔹','🔶','🔷','🔳','🔲',
        '▪️','▫️','◾','◽','◼️','◻️','🟥','🟧','🟨','🟩',
        '🟦','🟪','⬛','⬜','🟫','🔈','🔇','🔉','🔊','🔔',
        '🔕','📣','📢','💬','💭','🗯️','♠️','♣️','♥️','♦️',
        '🃏','🎴','🀄','🕐','🕑','🕒','🕓','🕔','🕕','🕖',
        '🕗','🕘','🕙','🕚','🕛',
    ],
    'Flags': [
        '🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️',
        '🇺🇸','🇬🇧','🇨🇦','🇦🇺','🇩🇪','🇫🇷','🇯🇵','🇰🇷',
        '🇨🇳','🇮🇳','🇧🇷','🇲🇽','🇮🇹','🇪🇸','🇷🇺','🇳🇱',
        '🇸🇪','🇳🇴','🇩🇰','🇫🇮','🇵🇱','🇺🇦','🇹🇷','🇿🇦',
        '🇦🇷','🇨🇱','🇨🇴','🇵🇪','🇪🇬','🇳🇬','🇰🇪','🇮🇱',
        '🇸🇦','🇦🇪','🇹🇭','🇻🇳','🇵🇭','🇮🇩','🇲🇾','🇸🇬',
        '🇳🇿','🇮🇪','🇨🇭','🇦🇹','🇧🇪','🇵🇹','🇬🇷','🇨🇿',
        '🇭🇺','🇷🇴',
    ],
};

// Flatten for search
let _flatEmojis = null;
function getFlatEmojis() {
    if (!_flatEmojis) {
        _flatEmojis = [];
        for (const [cat, emojis] of Object.entries(EMOJI_CATEGORIES)) {
            for (const emoji of emojis) {
                _flatEmojis.push({ emoji, category: cat });
            }
        }
    }
    return _flatEmojis;
}

// ── Frequently Used (persisted in sessionStorage) ───────────
const FREQ_KEY = 'adminEmojiFrequent';
function getFrequent() {
    try {
        return JSON.parse(sessionStorage.getItem(FREQ_KEY)) || [];
    } catch { return []; }
}
function addFrequent(emoji) {
    let freq = getFrequent().filter(e => e !== emoji);
    freq.unshift(emoji);
    if (freq.length > 24) freq = freq.slice(0, 24);
    sessionStorage.setItem(FREQ_KEY, JSON.stringify(freq));
}

// ── Picker state ────────────────────────────────────────────
let activePickerEl = null;

function closePicker() {
    if (activePickerEl) {
        activePickerEl.remove();
        activePickerEl = null;
    }
    document.removeEventListener('mousedown', onOutsideClick);
}

function onOutsideClick(e) {
    if (activePickerEl && !activePickerEl.contains(e.target) && !e.target.closest('.emoji-trigger')) {
        closePicker();
    }
}

// ── Open Picker ─────────────────────────────────────────────
export function openEmojiPicker(anchor, onSelect) {
    closePicker();

    const picker = document.createElement('div');
    picker.className = 'emoji-picker';

    const frequent = getFrequent();
    const categoryNames = Object.keys(EMOJI_CATEGORIES);
    const allCategories = frequent.length > 0
        ? ['Frequent', ...categoryNames]
        : categoryNames;

    picker.innerHTML = `
        <div class="emoji-picker-header">
            <input type="text" class="emoji-search" placeholder="Search emojis..." autocomplete="off">
        </div>
        <div class="emoji-picker-tabs">
            ${allCategories.map((cat, i) => `
                <button class="emoji-tab ${i === 0 ? 'active' : ''}" data-cat="${cat}" title="${cat}">
                    ${getCategoryIcon(cat)}
                </button>
            `).join('')}
        </div>
        <div class="emoji-picker-body">
            ${frequent.length > 0 ? `
                <div class="emoji-category" data-cat-section="Frequent">
                    <div class="emoji-cat-label">Frequent</div>
                    <div class="emoji-grid">
                        ${frequent.map(e => `<button class="emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
                    </div>
                </div>
            ` : ''}
            ${categoryNames.map(cat => `
                <div class="emoji-category" data-cat-section="${cat}">
                    <div class="emoji-cat-label">${cat}</div>
                    <div class="emoji-grid">
                        ${EMOJI_CATEGORIES[cat].map(e => `<button class="emoji-btn" data-emoji="${e}">${e}</button>`).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Position near anchor
    const rect = anchor.getBoundingClientRect();
    picker.style.position = 'fixed';
    picker.style.zIndex = '10000';

    // Try to position below, but flip up if not enough space
    const pickerHeight = 360;
    if (rect.bottom + pickerHeight > window.innerHeight) {
        picker.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    } else {
        picker.style.top = (rect.bottom + 4) + 'px';
    }
    picker.style.left = Math.min(rect.left, window.innerWidth - 340) + 'px';

    document.body.appendChild(picker);
    activePickerEl = picker;

    // Focus search
    const searchInput = picker.querySelector('.emoji-search');
    setTimeout(() => searchInput.focus(), 50);

    // ── Event: emoji click ──────────────────────────────────
    picker.addEventListener('click', (e) => {
        const btn = e.target.closest('.emoji-btn');
        if (btn && btn.dataset.emoji) {
            addFrequent(btn.dataset.emoji);
            onSelect(btn.dataset.emoji);
            closePicker();
        }
    });

    // ── Event: tab click ────────────────────────────────────
    picker.querySelectorAll('.emoji-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            picker.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const section = picker.querySelector(`[data-cat-section="${tab.dataset.cat}"]`);
            if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    // ── Event: search ───────────────────────────────────────
    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        const body = picker.querySelector('.emoji-picker-body');

        if (!query) {
            // Restore all categories
            body.querySelectorAll('.emoji-category').forEach(c => c.style.display = '');
            body.querySelectorAll('.emoji-btn').forEach(b => b.style.display = '');
            return;
        }

        // Hide all categories, show matching emojis in a flat view
        const flat = getFlatEmojis();
        const matches = flat.filter(e =>
            e.category.toLowerCase().includes(query) || e.emoji.includes(query)
        ).slice(0, 80);

        body.querySelectorAll('.emoji-category').forEach(c => c.style.display = 'none');

        let searchSection = body.querySelector('[data-cat-section="Search"]');
        if (!searchSection) {
            searchSection = document.createElement('div');
            searchSection.className = 'emoji-category';
            searchSection.dataset.catSection = 'Search';
            body.prepend(searchSection);
        }
        searchSection.style.display = '';
        searchSection.innerHTML = `
            <div class="emoji-cat-label">Results (${matches.length})</div>
            <div class="emoji-grid">
                ${matches.map(e => `<button class="emoji-btn" data-emoji="${e.emoji}">${e.emoji}</button>`).join('')}
            </div>
        `;
    });

    // Close on outside click
    setTimeout(() => document.addEventListener('mousedown', onOutsideClick), 10);
}

// ── Attach to Input ─────────────────────────────────────────
export function attachEmojiPicker(inputEl, options = {}) {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'emoji-trigger btn btn-sm btn-secondary';
    trigger.textContent = '😀';
    trigger.title = 'Pick emoji';

    trigger.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        openEmojiPicker(trigger, (emoji) => {
            if (options.onSelect) {
                options.onSelect(emoji);
            } else {
                // Default: insert into input
                const start = inputEl.selectionStart || inputEl.value.length;
                inputEl.value = inputEl.value.slice(0, start) + emoji + inputEl.value.slice(inputEl.selectionEnd || start);
                inputEl.dispatchEvent(new Event('input', { bubbles: true }));
                inputEl.focus();
            }
        });
    });

    // Insert trigger right after input
    inputEl.parentNode.insertBefore(trigger, inputEl.nextSibling);
    return trigger;
}

// ── Category Icons ──────────────────────────────────────────
function getCategoryIcon(cat) {
    const icons = {
        'Frequent': '🕐',
        'Smileys': '😀',
        'People': '👋',
        'Animals': '🐶',
        'Nature': '🌿',
        'Food': '🍕',
        'Activities': '⚽',
        'Travel': '🚗',
        'Objects': '💡',
        'Symbols': '❤️',
        'Flags': '🏁',
    };
    return icons[cat] || '📋';
}

// ── Export emoji list for dropdowns ──────────────────────────
export { EMOJI_CATEGORIES };
