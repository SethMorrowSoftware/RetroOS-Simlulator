/**
 * Instant Messenger - Late 90s AIM/ICQ/MSN Messenger Hybrid
 * Sign on, manage your buddy list, and chat with your friends!
 *
 * SCRIPTING SUPPORT:
 *   Commands: signOn, signOff, sendMessage, setAway, addBuddy, removeBuddy,
 *             openConversation, closeConversation, setStatus, warnBuddy,
 *             simulateMessage, setBuddyStatus,
 *             setBuddyResponses, clearBuddyResponses,
 *             simulateBuddyTyping, setConversation, clearConversation,
 *             clearAllConversations, scheduledMessage, setBuddyProfile, reset
 *   Queries:  getStatus, getBuddyList, getConversation, getAwayMessage,
 *             getOnlineBuddies, getWarningLevel, getAllConversations, getConfig
 *   Events:   app:instantmessenger:signedOn, app:instantmessenger:signedOff,
 *             app:instantmessenger:messageReceived, app:instantmessenger:messageSent,
 *             app:instantmessenger:buddyOnline, app:instantmessenger:buddyOffline,
 *             app:instantmessenger:awayChanged,
 *             app:instantmessenger:conversationOpened,
 *             app:instantmessenger:conversationClosed,
 *             app:instantmessenger:buddyStatusChanged
 */

import AppBase from './AppBase.js';
import { escapeHtml } from '../core/Sanitize.js';
import StorageManager from '../core/StorageManager.js';
import MultiplayerClient from '../core/MultiplayerClient.js';
import PresenceManager from '../core/PresenceManager.js';

const IM_STORAGE_KEY = 'im:state:v1';

class InstantMessenger extends AppBase {
    constructor() {
        super({
            id: 'instantmessenger',
            name: 'Instant Messenger',
            icon: '💬',
            width: 760,
            height: 600,
            minWidth: 540,
            minHeight: 480,
            resizable: true,
            singleton: true,
            category: 'internet'
        });

        this.isSignedOn = false;
        this.username = '';
        this.awayMessage = '';
        this.status = 'offline'; // online, away, idle, offline
        this.activeBuddy = null; // currently open conversation
        this.conversations = {}; // screenName -> [{ from, text, time }]
        this.warningLevels = {}; // screenName -> number

        // Buddy list with groups
        this.buddyGroups = {
            'Buddies': [
                { screenName: 'SmarterChild', status: 'online', idleMin: 0, profile: 'I\'m a robot! Ask me anything!', awayMsg: '', warningLevel: 0 },
                { screenName: 'xX_ShadowKnight_Xx', status: 'online', idleMin: 0, profile: 'I walk alone in darkness...', awayMsg: '', warningLevel: 0 },
                { screenName: 'sk8erBoi2001', status: 'online', idleMin: 0, profile: 'He was a skater boi, she said see ya later boi', awayMsg: '', warningLevel: 5 },
                { screenName: 'SuNsHiNe_GrL', status: 'away', idleMin: 15, profile: '~*~LoVe LiFe LaUgH~*~', awayMsg: 'BRB getting pizza rolls!!', warningLevel: 0 },
                { screenName: 'LiNkInPaRkFaN', status: 'online', idleMin: 0, profile: 'In the end, it doesn\'t even matter', awayMsg: '', warningLevel: 10 },
            ],
            'Family': [
                { screenName: 'CoolMom56', status: 'online', idleMin: 45, profile: 'Proud mom of 3! Love my kids!', awayMsg: '', warningLevel: 0 },
                { screenName: 'DadJokes4Ever', status: 'offline', idleMin: 0, profile: 'Why don\'t scientists trust atoms? Because they make up everything!', awayMsg: 'At work. Back after 5.', warningLevel: 0 },
            ],
            'Co-Workers': [
                { screenName: 'CubicleKing99', status: 'away', idleMin: 30, profile: 'Living the dream... in a 6x6 cubicle', awayMsg: 'In a meeting. TPS reports due Friday.', warningLevel: 0 },
                { screenName: 'IT_Guy_Dave', status: 'online', idleMin: 5, profile: 'Have you tried turning it off and on again?', awayMsg: '', warningLevel: 0 },
            ]
        };

        // SmarterChild bot responses
        this.smarterChildResponses = {
            greetings: ["Hey there! What can I do for you?", "Yo! What's up?", "Hi! Ask me anything!", "Hello! I'm SmarterChild. How can I help?"],
            jokes: [
                "Why did the scarecrow win an award? He was outstanding in his field! 😂",
                "What do you call a fake noodle? An impasta! 🍝",
                "Why don't eggs tell jokes? They'd crack each other up! 🥚",
                "What did the ocean say to the shore? Nothing, it just waved! 🌊",
                "I told my computer I needed a break... now it won't stop sending me Kit Kat ads."
            ],
            horoscope: [
                "Your horoscope: The stars say you should probably get off the computer and go outside. 🌟",
                "Your horoscope: A mysterious stranger will message you today. It's me. I'm the stranger. ✨",
                "Your horoscope: Today is a great day to download more RAM. 🐏",
                "Your horoscope: Mercury is in retrograde, which means your modem will disconnect at least 3 times. 💫"
            ],
            '8ball': [
                "🎱 Signs point to yes!",
                "🎱 Don't count on it.",
                "🎱 It is decidedly so.",
                "🎱 Ask again later... I'm busy.",
                "🎱 My sources say no.",
                "🎱 Without a doubt!",
                "🎱 Better not tell you now. 😏",
                "🎱 Outlook not so good."
            ],
            unknown: [
                "Hmm, I don't really know about that. Try asking me for a joke, horoscope, or 8ball!",
                "I'm just a bot from 1999, I don't know everything! Try: joke, horoscope, 8ball",
                "That's above my pay grade. Want a joke instead?",
                "ERROR 404: Answer not found. JK! Try asking me something else.",
                "Interesting... but I'd rather tell you a joke. Type 'joke'!"
            ]
        };

        // Generic buddy bot responses
        this.genericResponses = [
            "lol", "haha", "yeah totally", "brb", "omg", "no way!", "that's so cool",
            "haha nice", "for real?", "same", "idk", "lmao", "ok", "sure",
            "gtg soon", "nm u?", "lol whatever", "that's hilarious", "yeah",
            "oh cool", "haha yeah", "true true", "nah", "maybe", "I guess",
            "rofl", "sup", "hey", "yo", "k", "lol ok", "haha right",
            ":)", ":P", "XD", ";)", ":-)", "=)", ">.<",
            "have you heard that new song??", "check your email i sent you something",
            "my parents are SO annoying rn", "this song is stuck in my head",
            "downloading this takes FOREVER on 56k", "anyone else's AIM keep crashing??"
        ];

        // Away message presets
        this.awayPresets = [
            'BRB', 'Shower', 'zZzZz', 'Eating', 'On the phone',
            'Away from my computer', 'I\'m not here right now... leave a message!',
            'Do not disturb!', '~*~Gone~*~', 'Out to lunch'
        ];

        this._botTimers = [];

        // Custom buddy responses (for ARG scripting)
        this._customBuddyResponses = {};

        // Scheduled message timers
        this._scheduledMessages = {};
        this._scheduleCounter = 0;

        // Hydrate persisted state
        this._loadPersistedState();
    }

    _loadPersistedState() {
        const saved = StorageManager.get(IM_STORAGE_KEY, null);
        if (!saved || typeof saved !== 'object') return;
        if (typeof saved.username === 'string') this._savedUsername = saved.username;
        if (typeof saved.awayMessage === 'string') this._savedAwayMessage = saved.awayMessage;
        if (saved.buddyGroups && typeof saved.buddyGroups === 'object') {
            // Trust persisted custom buddies but keep the default buddy groups merged in
            // so users can't accidentally wipe SmarterChild / family / co-workers.
            for (const [group, buddies] of Object.entries(saved.buddyGroups)) {
                if (!Array.isArray(buddies)) continue;
                if (!this.buddyGroups[group]) this.buddyGroups[group] = [];
                for (const b of buddies) {
                    if (!b || typeof b.screenName !== 'string') continue;
                    if (this.buddyGroups[group].find(x => x.screenName === b.screenName)) continue;
                    this.buddyGroups[group].push({
                        screenName: b.screenName,
                        status: b.status || 'online',
                        idleMin: b.idleMin || 0,
                        profile: b.profile || '',
                        awayMsg: b.awayMsg || '',
                        warningLevel: b.warningLevel || 0
                    });
                }
            }
        }
    }

    _persistState() {
        // Only persist user-added buddies (not the hardcoded defaults like SmarterChild)
        // by writing a slim copy of buddyGroups. Multiplayer-injected buddies are skipped
        // because they have _realUserId.
        const defaultNames = new Set([
            'SmarterChild', 'xX_ShadowKnight_Xx', 'sk8erBoi2001', 'SuNsHiNe_GrL', 'LiNkInPaRkFaN',
            'CoolMom56', 'DadJokes4Ever', 'CubicleKing99', 'IT_Guy_Dave'
        ]);
        const slim = {};
        for (const [group, buddies] of Object.entries(this.buddyGroups)) {
            if (group === 'Online Players') continue;
            const custom = buddies
                .filter(b => !b._realUserId && !defaultNames.has(b.screenName))
                .map(b => ({
                    screenName: b.screenName,
                    status: b.status,
                    idleMin: b.idleMin,
                    profile: b.profile,
                    awayMsg: b.awayMsg,
                    warningLevel: b.warningLevel
                }));
            if (custom.length) slim[group] = custom;
        }
        StorageManager.set(IM_STORAGE_KEY, {
            username: this.username || this._savedUsername || '',
            awayMessage: this.awayMessage || '',
            buddyGroups: slim
        });
    }

    onOpen() {
        return `
            <div class="im-container">
                <!-- SIGN-ON SCREEN -->
                <div class="im-signon" id="imSignOn">
                    <div class="im-signon-logo">💬</div>
                    <div class="im-signon-title">Instant Messenger</div>
                    <div class="im-signon-subtitle">Version 5.0 - Free Download at www.aim.com!</div>
                    <div class="im-signon-box">
                        <div class="im-signon-label">Screen Name:</div>
                        <input type="text" class="im-signon-field" id="imUsername" placeholder="YourScreenName" maxlength="20" value="${escapeHtml(this._savedUsername || '')}">
                        <div class="im-signon-label" style="margin-top:8px;">Password:</div>
                        <input type="password" class="im-signon-field" id="imPassword" placeholder="(anything works)" maxlength="20">
                        <label class="im-signon-saveme">
                            <input type="checkbox" id="imSaveScreenName" ${this._savedUsername ? 'checked' : 'checked'}> Save my screen name
                        </label>
                        <button class="im-signon-btn" id="imSignOnBtn">Sign On</button>
                        <div style="text-align:center; margin-top:8px; font-size:12px; color:#666;">
                            New? Just type any screen name!
                        </div>
                    </div>
                </div>

                <!-- MAIN INTERFACE (hidden until sign-on) -->
                <div id="imMain" style="display:none; flex:1; flex-direction:column;">
                    <!-- Away message bar -->
                    <div class="im-away-bar" id="imAwayBar" style="display:none;">
                        🌙 Away: <span id="imAwayText"></span>
                        <button id="imAwayReturn">I'm Back</button>
                    </div>

                    <div class="im-main">
                        <!-- BUDDY LIST -->
                        <div class="im-buddy-panel">
                            <div class="im-buddy-header">
                                <span id="imMyName">ScreenName</span>
                                <span class="im-my-status" id="imMyStatus">🟢 Online</span>
                            </div>
                            <div class="im-buddy-toolbar">
                                <div class="im-toolbar-btn" id="btnSetAway" title="Set Away Message">🌙 Away</div>
                                <div class="im-toolbar-btn" id="btnAddBuddy" title="Add Buddy">➕ Add</div>
                                <div class="im-toolbar-btn" id="btnSignOff" title="Sign Off">🚪 Off</div>
                            </div>
                            <div class="im-buddy-list" id="imBuddyList"></div>
                            <div class="im-online-count" id="imOnlineCount">0 / 0 Buddies Online</div>
                        </div>

                        <!-- CONVERSATION -->
                        <div class="im-convo-panel" id="imConvoPanel">
                            <div class="im-convo-empty" id="imConvoEmpty">
                                <div class="im-convo-empty-logo">💬</div>
                                Double-click a buddy to chat!
                            </div>

                            <div id="imConvoActive" style="display:none; flex:1; flex-direction:column;">
                                <div class="im-convo-header">
                                    <span id="imConvoTitle">Chat</span>
                                    <span class="im-convo-close" id="imConvoClose" title="Close conversation">✕</span>
                                </div>
                                <div id="imConvoWarnBar" class="im-warn-bar" style="display:none;"></div>
                                <div class="im-convo-messages" id="imConvoMessages"></div>
                                <div class="im-typing-indicator" id="imTypingIndicator"></div>
                                <div class="im-convo-toolbar">
                                    <span class="im-convo-tool" title="Bold" id="imBoldBtn">𝐁</span>
                                    <span class="im-convo-tool" title="Italic" id="imItalicBtn">𝐼</span>
                                    <span class="im-convo-tool" title="Insert Emoji" id="imEmojiBtn">😀</span>
                                    <span class="im-convo-tool" title="Buddy Info" id="imBuddyInfoBtn">ℹ️</span>
                                    <span class="im-convo-tool" title="Warn Buddy" id="imWarnBtn">⚠️</span>
                                </div>
                                <div class="im-convo-input-area">
                                    <textarea class="im-convo-input" id="imConvoInput" placeholder="Type a message..."></textarea>
                                    <button class="im-convo-send" id="imConvoSend">Send</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- BUDDY PROFILE POPUP -->
                <div class="im-profile-popup" id="imProfilePopup">
                    <span class="im-profile-close" id="imProfileClose">✕</span>
                    <div class="im-profile-name" id="imProfileName"></div>
                    <div class="im-profile-field"><span class="im-profile-label">Status:</span> <span id="imProfileStatus"></span></div>
                    <div class="im-profile-field"><span class="im-profile-label">Warning:</span> <span id="imProfileWarning"></span></div>
                    <div class="im-profile-field"><span class="im-profile-label">Profile:</span></div>
                    <div id="imProfileText" style="padding:5px; background:#fff; border:1px solid #ddd; margin-top:3px; font-style:italic;"></div>
                    <div class="im-profile-field" style="margin-top:6px;"><span class="im-profile-label">Away Msg:</span></div>
                    <div id="imProfileAway" style="padding:5px; background:#fff; border:1px solid #ddd; margin-top:3px; color:#888;"></div>
                </div>
            </div>
        `;
    }

    onMount() {
        // Sign-on handlers
        this.addHandler(this.getElement('#imSignOnBtn'), 'click', () => this.signOn());
        this.addHandler(this.getElement('#imUsername'), 'keypress', (e) => {
            if (e.key === 'Enter') this.signOn();
        });
        this.addHandler(this.getElement('#imPassword'), 'keypress', (e) => {
            if (e.key === 'Enter') this.signOn();
        });

        // Toolbar buttons
        this.addHandler(this.getElement('#btnSetAway'), 'click', () => this.promptAwayMessage());
        this.addHandler(this.getElement('#btnAddBuddy'), 'click', () => this.promptAddBuddy());
        this.addHandler(this.getElement('#btnSignOff'), 'click', () => this.signOff());

        // Away bar
        this.addHandler(this.getElement('#imAwayReturn'), 'click', () => {
            this.playSound('click');
            this.clearAway();
        });

        // Inline formatting + emoji helpers
        this.addHandler(this.getElement('#imBoldBtn'), 'click', () => this._wrapSelection('**'));
        this.addHandler(this.getElement('#imItalicBtn'), 'click', () => this._wrapSelection('_'));
        this.addHandler(this.getElement('#imEmojiBtn'), 'click', () => this._insertEmoji());

        // Conversation
        this.addHandler(this.getElement('#imConvoSend'), 'click', () => this.sendMessageFromUI());
        this.addHandler(this.getElement('#imConvoInput'), 'keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessageFromUI();
            }
        });
        this.addHandler(this.getElement('#imConvoClose'), 'click', () => this.closeActiveConversation());

        // Buddy info / warn
        this.addHandler(this.getElement('#imBuddyInfoBtn'), 'click', () => this.showBuddyProfile(this.activeBuddy));
        this.addHandler(this.getElement('#imWarnBtn'), 'click', () => this.warnBuddy(this.activeBuddy));
        this.addHandler(this.getElement('#imProfileClose'), 'click', () => {
            const popup = this.getElement('#imProfilePopup');
            if (popup) popup.style.display = 'none';
        });

        // Register scripting commands
        this._registerScriptingCommands();

        // Focus username
        setTimeout(() => this.getElement('#imUsername')?.focus(), 100);
    }

    onClose() {
        this._botTimers.forEach(t => clearTimeout(t));
        this._botTimers = [];
        if (this._buddyActivityInterval) clearInterval(this._buddyActivityInterval);
        // Clean up multiplayer DM subscriptions
        if (this._mpDmUnsub) {
            this._mpDmUnsub();
            this._mpDmUnsub = null;
        }
        this.isSignedOn = false;
    }

    /**
     * Setup multiplayer DM integration
     * Listens for real-time direct messages from other users
     */
    _setupMultiplayerDM() {
        // A previous handler may still be registered (re-signOn) — without
        // releasing it first, every incoming DM rendered once per signOn.
        if (this._mpDmUnsub) {
            this._mpDmUnsub();
            this._mpDmUnsub = null;
        }
        // Listen for incoming DMs
        this._mpDmUnsub = MultiplayerClient.on('dm', (message) => {
            if (message.event !== 'message') return;
            const { senderName, senderId, text } = message.payload || {};
            const myInfo = MultiplayerClient.getUserInfo();
            if (senderId === myInfo.userId) return; // Skip our own messages

            // Receive as IM message
            this.receiveIMMessage(senderName, text);
        });
    }

    // ===== SIGN ON / OFF =====

    signOn(usernameOverride) {
        const input = this.getElement('#imUsername');
        const name = usernameOverride || input?.value.trim();
        if (!name) {
            this.alert('Please enter a Screen Name!');
            this.playSound('error');
            return;
        }

        this.username = name;
        this.isSignedOn = true;
        this.playSound('startup');
        this.status = 'online';

        // Persist screen name if checkbox is checked (default checked)
        const saveCb = this.getElement('#imSaveScreenName');
        if (!saveCb || saveCb.checked) {
            this._savedUsername = name;
            this._persistState();
        }

        // Hide sign-on, show main
        const signOn = this.getElement('#imSignOn');
        const main = this.getElement('#imMain');
        if (signOn) signOn.style.display = 'none';
        if (main) main.style.display = 'flex';

        // Set name in header
        const nameEl = this.getElement('#imMyName');
        if (nameEl) nameEl.textContent = this.username;

        this.renderBuddyList();
        this.playSound('click');

        this.emitAppEvent('signedOn', { username: this.username });

        // Setup multiplayer DMs if connected
        if (MultiplayerClient.isConnected()) {
            this._setupMultiplayerDM();

            // Add real online users as buddies
            const onlineUsers = PresenceManager.getOnlineUsers();
            if (onlineUsers.length > 0) {
                if (!this.buddyGroups['Online Players']) {
                    this.buddyGroups['Online Players'] = [];
                }
                for (const user of onlineUsers) {
                    const myInfo = MultiplayerClient.getUserInfo();
                    if (user.userId === myInfo.userId) continue;
                    // Don't add duplicates
                    if (!this.buddyGroups['Online Players'].find(b => b.screenName === user.displayName)) {
                        this.buddyGroups['Online Players'].push({
                            screenName: user.displayName,
                            status: 'online',
                            idleMin: 0,
                            profile: 'Online player',
                            awayMsg: '',
                            warningLevel: 0,
                            _realUserId: user.userId
                        });
                    }
                }
                this.renderBuddyList();
            }
        }

        // Start buddy simulation
        this._startBuddySimulation();
    }

    signOff() {
        this.isSignedOn = false;
        this.status = 'offline';
        this.activeBuddy = null;
        this.awayMessage = '';
        this._botTimers.forEach(t => clearTimeout(t));
        this._botTimers = [];
        if (this._buddyActivityInterval) clearInterval(this._buddyActivityInterval);
        // Release the multiplayer DM listener — leaving it registered after
        // sign-off kept delivering (and double-rendering after re-signOn)
        // DMs into a signed-off UI.
        if (this._mpDmUnsub) {
            this._mpDmUnsub();
            this._mpDmUnsub = null;
        }

        this.playSound('shutdown');
        this.emitAppEvent('signedOff', { username: this.username });

        // Show sign-on screen again
        const signOn = this.getElement('#imSignOn');
        const main = this.getElement('#imMain');
        if (signOn) signOn.style.display = 'flex';
        if (main) main.style.display = 'none';
    }

    // ===== BUDDY LIST =====

    renderBuddyList() {
        const list = this.getElement('#imBuddyList');
        if (!list) return;

        let html = '';
        let totalOnline = 0;
        let totalBuddies = 0;

        for (const [group, buddies] of Object.entries(this.buddyGroups)) {
            const onlineInGroup = buddies.filter(b => b.status !== 'offline').length;
            totalOnline += onlineInGroup;
            totalBuddies += buddies.length;

            html += `<div class="im-group-header">📁 ${escapeHtml(group)} (${onlineInGroup}/${buddies.length})</div>`;

            // Show online buddies first, then offline
            const sorted = [...buddies].sort((a, b) => {
                if (a.status === 'offline' && b.status !== 'offline') return 1;
                if (a.status !== 'offline' && b.status === 'offline') return -1;
                return 0;
            });

            for (const buddy of sorted) {
                const icon = buddy.status === 'online' ? '🟢' :
                             buddy.status === 'away' ? '🟡' :
                             buddy.status === 'idle' ? '🟠' : '⚫';
                const idle = buddy.idleMin > 0 ? `(${buddy.idleMin}m)` : '';
                const isActive = this.activeBuddy === buddy.screenName ? ' active' : '';
                const opacity = buddy.status === 'offline' ? 'opacity:0.5;' : '';
                const unread = this.conversations[buddy.screenName]?.some(m => m.unread) ? ' 💬' : '';

                const escapedName = escapeHtml(buddy.screenName);
                html += `
                    <div class="im-buddy${isActive}" data-buddy="${escapedName}" style="${opacity}">
                        <span class="im-buddy-icon">${icon}</span>
                        <span class="im-buddy-name">${escapedName}${unread}</span>
                        <span class="im-buddy-idle">${idle}</span>
                    </div>
                `;
            }
        }

        list.innerHTML = html;

        // Update online count
        const countEl = this.getElement('#imOnlineCount');
        if (countEl) countEl.textContent = `${totalOnline} / ${totalBuddies} Buddies Online`;

        // Delegate buddy clicks through the list container, bound ONCE.
        // renderBuddyList runs on every received IM and on a ~5s timer;
        // per-row addHandler calls accumulated detached nodes in the
        // AppBase handler map for the lifetime of the window.
        if (!list.dataset.imHandlersBound) {
            list.dataset.imHandlersBound = '1';
            this.addHandler(list, 'dblclick', (e) => {
                const el = e.target.closest('.im-buddy');
                if (el) this.openConversation(el.dataset.buddy);
            });
            this.addHandler(list, 'click', (e) => {
                const el = e.target.closest('.im-buddy');
                if (!el) return;
                // Single click just highlights
                this.getElements('.im-buddy').forEach(b => b.classList.remove('active'));
                el.classList.add('active');
            });
        }
    }

    getAllBuddies() {
        const all = [];
        for (const buddies of Object.values(this.buddyGroups)) {
            all.push(...buddies);
        }
        return all;
    }

    findBuddy(screenName) {
        for (const buddies of Object.values(this.buddyGroups)) {
            const buddy = buddies.find(b => b.screenName === screenName);
            if (buddy) return buddy;
        }
        return null;
    }

    findBuddyGroup(screenName) {
        for (const [group, buddies] of Object.entries(this.buddyGroups)) {
            if (buddies.find(b => b.screenName === screenName)) return group;
        }
        return null;
    }

    // ===== CONVERSATIONS =====

    openConversation(screenName) {
        if (!screenName) return;
        this.activeBuddy = screenName;

        // Initialize conversation if needed
        if (!this.conversations[screenName]) {
            this.conversations[screenName] = [];
        }

        // Mark messages as read
        this.conversations[screenName].forEach(m => m.unread = false);

        // Show conversation panel
        const empty = this.getElement('#imConvoEmpty');
        const active = this.getElement('#imConvoActive');
        if (empty) empty.style.display = 'none';
        if (active) active.style.display = 'flex';

        // Set title
        const title = this.getElement('#imConvoTitle');
        if (title) title.textContent = `${screenName}`;

        // Update warning bar
        this.updateWarnBar(screenName);

        // Render messages
        this.renderConversation(screenName);
        this.renderBuddyList();

        // Focus input
        setTimeout(() => this.getElement('#imConvoInput')?.focus(), 50);

        this.emitAppEvent('conversationOpened', { buddy: screenName });
    }

    closeActiveConversation() {
        const closedBuddy = this.activeBuddy;
        this.activeBuddy = null;
        const empty = this.getElement('#imConvoEmpty');
        const active = this.getElement('#imConvoActive');
        if (empty) empty.style.display = 'flex';
        if (active) active.style.display = 'none';
        this.renderBuddyList();
        if (closedBuddy) {
            this.emitAppEvent('conversationClosed', { buddy: closedBuddy });
        }
    }

    renderConversation(screenName) {
        const messagesEl = this.getElement('#imConvoMessages');
        if (!messagesEl) return;

        const convo = this.conversations[screenName] || [];
        messagesEl.innerHTML = convo.map(m => {
            if (m.system) {
                return `<div class="im-msg im-msg-system">${escapeHtml(m.text)}</div>`;
            }
            const cls = m.from === this.username ? 'me' : 'them';
            return `
                <div class="im-msg">
                    <span class="im-msg-name ${cls}">${escapeHtml(m.from)}</span>
                    <span class="im-msg-time">(${escapeHtml(m.time)})</span>:
                    <span>${escapeHtml(m.text)}</span>
                </div>
            `;
        }).join('');

        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    sendMessageFromUI() {
        const input = this.getElement('#imConvoInput');
        const text = input?.value.trim();
        if (!text || !this.activeBuddy) return;
        if (input) input.value = '';

        this.playSound('click');
        this.sendIMMessage(this.activeBuddy, text);
    }

    sendIMMessage(buddy, text) {
        if (!buddy || !text) return;

        if (!this.conversations[buddy]) {
            this.conversations[buddy] = [];
        }

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        this.conversations[buddy].push({ from: this.username, text, time, unread: false });

        this.emitAppEvent('messageSent', { to: buddy, message: text });

        if (this.activeBuddy === buddy) {
            this.renderConversation(buddy);
        }

        // Check if this is a real multiplayer user
        const buddyObj = this.findBuddy(buddy);
        if (buddyObj && buddyObj._realUserId && MultiplayerClient.isConnected()) {
            // Send real DM via WebSocket
            MultiplayerClient.sendDM(buddyObj._realUserId, text);
            return;
        }

        // Bot response (single-player fallback)
        if (buddyObj && buddyObj.status !== 'offline') {
            this.scheduleBotIMResponse(buddy, text);
        }
    }

    receiveIMMessage(fromBuddy, text) {
        if (!this.conversations[fromBuddy]) {
            this.conversations[fromBuddy] = [];
        }

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const isActive = this.activeBuddy === fromBuddy;
        this.conversations[fromBuddy].push({ from: fromBuddy, text, time, unread: !isActive });

        this.emitAppEvent('messageReceived', { from: fromBuddy, message: text });

        // The iconic "you've got an IM" door-open ding
        this.playSound(isActive ? 'click' : 'notify');

        if (isActive) {
            this.renderConversation(fromBuddy);
            // Clear typing indicator
            const typing = this.getElement('#imTypingIndicator');
            if (typing) typing.textContent = '';
        }

        this.renderBuddyList();
    }

    scheduleBotIMResponse(buddy, userText) {
        // Show typing indicator
        if (this.activeBuddy === buddy) {
            const typing = this.getElement('#imTypingIndicator');
            if (typing) typing.textContent = `${buddy} is typing...`;
        }

        const delay = 1500 + Math.random() * 3000;
        const timer = setTimeout(() => {
            if (!this.isSignedOn) return;
            const response = this.getBotResponse(buddy, userText);
            this.receiveIMMessage(buddy, response);
        }, delay);
        this._botTimers.push(timer);
    }

    getBotResponse(buddy, userText) {
        // Check for custom scripted responses first (ARG support)
        if (this._customBuddyResponses[buddy] && this._customBuddyResponses[buddy].length > 0) {
            const responses = this._customBuddyResponses[buddy];
            return responses[Math.floor(Math.random() * responses.length)];
        }

        const lower = userText.toLowerCase();

        // SmarterChild has special logic
        if (buddy === 'SmarterChild') {
            return this.getSmarterChildResponse(lower);
        }

        // Generic buddy responses
        if (lower.includes('hi') || lower.includes('hey') || lower.includes('hello')) {
            return ['hey!', 'hi!!', 'sup!', `heyy ${this.username}!`, 'hello :)'][Math.floor(Math.random() * 5)];
        }
        if (lower.includes('?')) {
            return ['idk', 'lol dunno', 'maybe?', 'hmmm', 'good question'][Math.floor(Math.random() * 5)];
        }
        if (lower.includes('lol') || lower.includes('lmao') || lower.includes('haha')) {
            return ['lol', 'haha', 'LMAO', 'rofl', '😂'][Math.floor(Math.random() * 5)];
        }
        if (lower.includes('bye') || lower.includes('gtg') || lower.includes('g2g')) {
            return ['cya!', 'bye!', 'peace ✌️', 'later!', 'ttyl!'][Math.floor(Math.random() * 5)];
        }

        return this.genericResponses[Math.floor(Math.random() * this.genericResponses.length)];
    }

    getSmarterChildResponse(lower) {
        const r = this.smarterChildResponses;

        if (lower.includes('hi') || lower.includes('hey') || lower.includes('hello')) {
            return r.greetings[Math.floor(Math.random() * r.greetings.length)];
        }
        if (lower.includes('joke')) {
            return r.jokes[Math.floor(Math.random() * r.jokes.length)];
        }
        if (lower.includes('horoscope') || lower.includes('zodiac') || lower.includes('star')) {
            return r.horoscope[Math.floor(Math.random() * r.horoscope.length)];
        }
        if (lower.includes('8ball') || lower.includes('8 ball') || lower.includes('magic ball')) {
            return r['8ball'][Math.floor(Math.random() * r['8ball'].length)];
        }
        if (lower.includes('help') || lower.includes('what can you do')) {
            return "I can do lots of things! Try: joke, horoscope, 8ball, or just chat with me!";
        }
        if (lower.includes('time')) {
            return `The time is ${new Date().toLocaleTimeString()}. You're welcome! ⏰`;
        }
        if (lower.includes('name')) {
            return "I'm SmarterChild! Your friendly AIM bot since 2001. 🤖";
        }
        if (lower.includes('love') || lower.includes('like you')) {
            return "Aww! I like you too! But I'm just a bot... 🤖💕";
        }

        return r.unknown[Math.floor(Math.random() * r.unknown.length)];
    }

    _wrapSelection(wrap) {
        const ta = this.getElement('#imConvoInput');
        if (!ta) return;
        this.playSound('click');
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const value = ta.value;
        const selected = value.slice(start, end) || 'text';
        const insert = `${wrap}${selected}${wrap}`;
        ta.value = value.slice(0, start) + insert + value.slice(end);
        ta.focus();
        ta.setSelectionRange(start + wrap.length, start + wrap.length + selected.length);
    }

    _insertEmoji() {
        const ta = this.getElement('#imConvoInput');
        if (!ta) return;
        this.playSound('click');
        const emojis = ['😀', '😂', '😍', '😎', '🤔', '😢', '😡', '👍', '❤️', '🔥', '💯', ':P', ':)', ';)', ':D'];
        const pick = emojis[Math.floor(Math.random() * emojis.length)];
        const start = ta.selectionStart;
        const value = ta.value;
        ta.value = value.slice(0, start) + pick + value.slice(ta.selectionEnd);
        ta.focus();
        ta.setSelectionRange(start + pick.length, start + pick.length);
    }

    // ===== AWAY MESSAGES =====

    async promptAwayMessage() {
        this.playSound('click');
        const presets = this.awayPresets;
        const msg = await this.prompt(
            `Set Away Message:\n\nPresets: ${presets.slice(0, 5).join(' • ')}\n\nOr type your own:`,
            this.awayMessage || presets[0],
            'Set Away Message'
        );
        if (msg !== null) {
            this.setAwayMessage(msg);
        }
    }

    setAwayMessage(message) {
        this.awayMessage = message;
        this.status = message ? 'away' : 'online';

        const bar = this.getElement('#imAwayBar');
        const text = this.getElement('#imAwayText');
        const statusEl = this.getElement('#imMyStatus');

        if (message) {
            if (bar) bar.style.display = 'flex';
            if (text) text.textContent = message;
            if (statusEl) statusEl.textContent = '🟡 Away';
        } else {
            if (bar) bar.style.display = 'none';
            if (statusEl) statusEl.textContent = '🟢 Online';
        }

        this.emitAppEvent('awayChanged', { away: !!message, message: message || null });
    }

    clearAway() {
        this.setAwayMessage('');
    }

    // ===== BUDDY MANAGEMENT =====

    async promptAddBuddy() {
        this.playSound('click');
        const name = await this.prompt('Enter buddy screen name:', '', 'Add Buddy');
        if (!name || !name.trim()) return;
        const result = this.addBuddyToList(name.trim(), 'Buddies');
        if (result && result.success) {
            this.playSound('notify');
            this._persistState();
        } else if (result && !result.success) {
            this.alert(result.error || 'Could not add buddy.');
            this.playSound('error');
        }
    }

    addBuddyToList(screenName, group) {
        if (!group) group = 'Buddies';
        if (!this.buddyGroups[group]) {
            this.buddyGroups[group] = [];
        }

        // Check if already exists
        if (this.findBuddy(screenName)) {
            return { success: false, error: 'Buddy already in list' };
        }

        const buddy = {
            screenName,
            status: 'online',
            idleMin: 0,
            profile: '',
            awayMsg: '',
            warningLevel: 0
        };
        this.buddyGroups[group].push(buddy);
        this.renderBuddyList();
        this.emitAppEvent('buddyOnline', { screenName, group });
        return { success: true, buddy };
    }

    removeBuddyFromList(screenName) {
        for (const [group, buddies] of Object.entries(this.buddyGroups)) {
            const idx = buddies.findIndex(b => b.screenName === screenName);
            if (idx !== -1) {
                buddies.splice(idx, 1);
                if (this.activeBuddy === screenName) {
                    this.closeActiveConversation();
                }
                this.renderBuddyList();
                this._persistState();
                this.emitAppEvent('buddyRemoved', { screenName, group });
                return { success: true };
            }
        }
        return { success: false, error: 'Buddy not found' };
    }

    // ===== WARN BUDDY =====

    warnBuddy(screenName) {
        if (!screenName) {
            this.playSound('error');
            return;
        }
        const buddy = this.findBuddy(screenName);
        if (!buddy) {
            this.playSound('error');
            return;
        }

        buddy.warningLevel = Math.min(100, (buddy.warningLevel || 0) + 5);
        this.updateWarnBar(screenName);
        this.playSound('error');
        this._persistState();

        // Add system message
        if (this.conversations[screenName]) {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.conversations[screenName].push({
                system: true,
                text: `You have warned ${screenName}. Warning level: ${buddy.warningLevel}%`,
                time
            });
            if (this.activeBuddy === screenName) {
                this.renderConversation(screenName);
            }
        }

        this.emitAppEvent('buddyWarned', { screenName, warningLevel: buddy.warningLevel });
    }

    updateWarnBar(screenName) {
        const bar = this.getElement('#imConvoWarnBar');
        if (!bar) return;
        const buddy = this.findBuddy(screenName);
        if (buddy && buddy.warningLevel > 0) {
            bar.style.display = 'block';
            bar.textContent = `⚠️ Warning Level: ${buddy.warningLevel}%`;
        } else {
            bar.style.display = 'none';
        }
    }

    // ===== BUDDY PROFILE =====

    showBuddyProfile(screenName) {
        if (!screenName) return;
        const buddy = this.findBuddy(screenName);
        if (!buddy) return;

        const popup = this.getElement('#imProfilePopup');
        if (!popup) return;

        const name = this.getElement('#imProfileName');
        const status = this.getElement('#imProfileStatus');
        const warning = this.getElement('#imProfileWarning');
        const profile = this.getElement('#imProfileText');
        const away = this.getElement('#imProfileAway');

        if (name) name.textContent = buddy.screenName;
        if (status) {
            const icon = buddy.status === 'online' ? '🟢 Online' :
                         buddy.status === 'away' ? '🟡 Away' :
                         buddy.status === 'idle' ? '🟠 Idle' : '⚫ Offline';
            status.textContent = icon;
        }
        if (warning) warning.textContent = `${buddy.warningLevel || 0}%`;
        if (profile) profile.textContent = buddy.profile || '(No profile set)';
        if (away) away.textContent = buddy.awayMsg || '(No away message)';

        popup.style.display = 'block';
        popup.style.top = '80px';
        popup.style.left = '50px';
    }

    // ===== BUDDY SIMULATION =====

    _startBuddySimulation() {
        // Periodically simulate buddy status changes and random IMs
        this._buddyActivityInterval = setInterval(() => {
            if (!this.isSignedOn) return;

            // Random status changes
            if (Math.random() < 0.15) {
                const all = this.getAllBuddies().filter(b => b.screenName !== 'SmarterChild');
                if (all.length > 0) {
                    const buddy = all[Math.floor(Math.random() * all.length)];
                    const oldStatus = buddy.status;
                    const statuses = ['online', 'away', 'idle', 'offline'];
                    buddy.status = statuses[Math.floor(Math.random() * statuses.length)];

                    if (buddy.status === 'away') {
                        buddy.awayMsg = this.awayPresets[Math.floor(Math.random() * this.awayPresets.length)];
                    }
                    if (buddy.status === 'idle') {
                        buddy.idleMin = Math.floor(Math.random() * 60) + 5;
                    } else {
                        buddy.idleMin = 0;
                    }

                    if (oldStatus === 'offline' && buddy.status !== 'offline') {
                        this.emitAppEvent('buddyOnline', { screenName: buddy.screenName });
                    } else if (oldStatus !== 'offline' && buddy.status === 'offline') {
                        this.emitAppEvent('buddyOffline', { screenName: buddy.screenName });
                    }

                    this.renderBuddyList();
                }
            }

            // Random unsolicited IMs from bots
            if (Math.random() < 0.08) {
                const online = this.getAllBuddies().filter(b => b.status === 'online');
                if (online.length > 0) {
                    const buddy = online[Math.floor(Math.random() * online.length)];
                    const msg = this.genericResponses[Math.floor(Math.random() * this.genericResponses.length)];
                    this.receiveIMMessage(buddy.screenName, msg);
                }
            }
        }, 5000);
    }

    // ===== UTILITY =====

    // ===== SCRIPTING SUPPORT =====

    _registerScriptingCommands() {
        // COMMAND: Sign on
        this.registerCommand('signOn', (payload) => {
            if (this.isSignedOn) return { success: false, error: 'Already signed on' };
            const username = payload.username || payload.name;
            if (!username) return { success: false, error: 'Username required' };
            this.signOn(username);
            return { success: true, username: this.username };
        });

        // COMMAND: Sign off
        this.registerCommand('signOff', () => {
            if (!this.isSignedOn) return { success: false, error: 'Not signed on' };
            this.signOff();
            return { success: true };
        });

        // COMMAND: Send a message to a buddy
        this.registerCommand('sendMessage', (payload) => {
            if (!this.isSignedOn) return { success: false, error: 'Not signed on' };
            const buddy = payload.buddy || payload.to;
            const message = payload.message || payload.text;
            if (!buddy || !message) return { success: false, error: 'Buddy and message required' };
            this.sendIMMessage(buddy, message);
            return { success: true, buddy, message };
        });

        // COMMAND: Set away message
        this.registerCommand('setAway', (payload) => {
            if (!this.isSignedOn) return { success: false, error: 'Not signed on' };
            const message = payload.message || payload.text || '';
            this.setAwayMessage(message);
            return { success: true, away: !!message, message };
        });

        // COMMAND: Add a buddy
        this.registerCommand('addBuddy', (payload) => {
            if (!this.isSignedOn) return { success: false, error: 'Not signed on' };
            const screenName = payload.screenName || payload.name;
            const group = payload.group || 'Buddies';
            if (!screenName) return { success: false, error: 'Screen name required' };
            return this.addBuddyToList(screenName, group);
        });

        // COMMAND: Remove a buddy
        this.registerCommand('removeBuddy', (payload) => {
            if (!this.isSignedOn) return { success: false, error: 'Not signed on' };
            const screenName = payload.screenName || payload.name;
            if (!screenName) return { success: false, error: 'Screen name required' };
            return this.removeBuddyFromList(screenName);
        });

        // COMMAND: Open conversation with a buddy
        this.registerCommand('openConversation', (payload) => {
            if (!this.isSignedOn) return { success: false, error: 'Not signed on' };
            const buddy = payload.buddy || payload.screenName;
            if (!buddy) return { success: false, error: 'Buddy name required' };
            this.openConversation(buddy);
            return { success: true, buddy };
        });

        // COMMAND: Close active conversation
        this.registerCommand('closeConversation', () => {
            this.closeActiveConversation();
            return { success: true };
        });

        // COMMAND: Set user status
        this.registerCommand('setStatus', (payload) => {
            if (!this.isSignedOn) return { success: false, error: 'Not signed on' };
            const status = payload.status;
            if (!['online', 'away', 'idle'].includes(status)) {
                return { success: false, error: 'Invalid status. Use: online, away, idle' };
            }
            this.status = status;
            const statusEl = this.getElement('#imMyStatus');
            if (statusEl) {
                const icon = status === 'online' ? '🟢' : status === 'away' ? '🟡' : '🟠';
                statusEl.textContent = `${icon} ${status.charAt(0).toUpperCase() + status.slice(1)}`;
            }
            return { success: true, status };
        });

        // COMMAND: Warn a buddy
        this.registerCommand('warnBuddy', (payload) => {
            const screenName = payload.screenName || payload.buddy;
            if (!screenName) return { success: false, error: 'Screen name required' };
            const buddy = this.findBuddy(screenName);
            if (!buddy) return { success: false, error: 'Buddy not found' };
            this.warnBuddy(screenName);
            return { success: true, screenName, warningLevel: buddy.warningLevel };
        });

        // COMMAND: Simulate a message from a buddy (script injection)
        this.registerCommand('simulateMessage', (payload) => {
            const from = payload.from || payload.buddy;
            const message = payload.message || payload.text;
            if (!from || !message) return { success: false, error: 'From and message required' };
            this.receiveIMMessage(from, message);
            return { success: true, from, message };
        });

        // COMMAND: Change a buddy's status
        this.registerCommand('setBuddyStatus', (payload) => {
            const screenName = payload.screenName || payload.buddy;
            const status = payload.status;
            if (!screenName || !status) return { success: false, error: 'Screen name and status required' };
            const buddy = this.findBuddy(screenName);
            if (!buddy) return { success: false, error: 'Buddy not found' };
            const oldStatus = buddy.status;
            buddy.status = status;
            if (payload.awayMsg !== undefined) buddy.awayMsg = payload.awayMsg;
            if (payload.idleMin !== undefined) buddy.idleMin = payload.idleMin;
            this.renderBuddyList();
            if (oldStatus === 'offline' && status !== 'offline') {
                this.emitAppEvent('buddyOnline', { screenName });
            } else if (oldStatus !== 'offline' && status === 'offline') {
                this.emitAppEvent('buddyOffline', { screenName });
            }
            if (oldStatus !== status) {
                this.emitAppEvent('buddyStatusChanged', { screenName, oldStatus, newStatus: status });
            }
            return { success: true, screenName, status };
        });

        // QUERY: Get sign-on status
        this.registerQuery('getStatus', () => {
            return {
                signedOn: this.isSignedOn,
                username: this.username || null,
                status: this.status,
                away: !!this.awayMessage,
                awayMessage: this.awayMessage || null,
                activeBuddy: this.activeBuddy
            };
        });

        // QUERY: Get full buddy list
        this.registerQuery('getBuddyList', () => {
            const result = {};
            for (const [group, buddies] of Object.entries(this.buddyGroups)) {
                result[group] = buddies.map(b => ({
                    screenName: b.screenName,
                    status: b.status,
                    idleMin: b.idleMin,
                    warningLevel: b.warningLevel
                }));
            }
            return result;
        });

        // QUERY: Get conversation with a buddy
        this.registerQuery('getConversation', (payload) => {
            const buddy = payload?.buddy || payload?.screenName || this.activeBuddy;
            if (!buddy) return { messages: [] };
            return { buddy, messages: (this.conversations[buddy] || []).map(m => ({ ...m })) };
        });

        // QUERY: Get current away message
        this.registerQuery('getAwayMessage', () => {
            return { away: !!this.awayMessage, message: this.awayMessage || null };
        });

        // QUERY: Get online buddies
        this.registerQuery('getOnlineBuddies', () => {
            return this.getAllBuddies()
                .filter(b => b.status !== 'offline')
                .map(b => ({ screenName: b.screenName, status: b.status, idleMin: b.idleMin }));
        });

        // QUERY: Get warning level for a buddy
        this.registerQuery('getWarningLevel', (payload) => {
            const screenName = payload?.screenName || payload?.buddy;
            if (!screenName) return { error: 'Screen name required' };
            const buddy = this.findBuddy(screenName);
            if (!buddy) return { error: 'Buddy not found' };
            return { screenName, warningLevel: buddy.warningLevel || 0 };
        });

        // ===== ARG SCRIPTING COMMANDS =====

        // COMMAND: Set custom auto-responses for a buddy
        this.registerCommand('setBuddyResponses', (payload) => {
            const screenName = payload.screenName || payload.buddy;
            const responses = payload.responses;
            if (!screenName || !responses || !Array.isArray(responses)) {
                return { success: false, error: 'Screen name and responses array required' };
            }
            this._customBuddyResponses[screenName] = responses;
            return { success: true, screenName };
        });

        // COMMAND: Clear custom responses for a buddy
        this.registerCommand('clearBuddyResponses', (payload) => {
            const screenName = payload?.screenName || payload?.buddy;
            if (screenName) {
                delete this._customBuddyResponses[screenName];
            } else {
                this._customBuddyResponses = {};
            }
            return { success: true };
        });

        // COMMAND: Show typing indicator for a buddy for N ms
        this.registerCommand('simulateBuddyTyping', (payload) => {
            const buddy = payload.buddy || payload.screenName;
            const duration = payload.duration || 3000;
            if (!buddy) return { success: false, error: 'Buddy name required' };
            if (this.activeBuddy === buddy) {
                const typing = this.getElement('#imTypingIndicator');
                if (typing) {
                    typing.textContent = `${buddy} is typing...`;
                    setTimeout(() => {
                        if (typing) typing.textContent = '';
                    }, duration);
                }
            }
            return { success: true, buddy, duration };
        });

        // COMMAND: Set a full conversation history (for staging ARG state)
        this.registerCommand('setConversation', (payload) => {
            const buddy = payload.buddy || payload.screenName;
            const messages = payload.messages;
            if (!buddy || !messages || !Array.isArray(messages)) {
                return { success: false, error: 'Buddy and messages array required' };
            }
            this.conversations[buddy] = messages.map(m => ({
                from: m.from || buddy,
                text: m.text || m.message || '',
                time: m.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                unread: m.unread || false,
                system: m.system || false
            }));
            if (this.activeBuddy === buddy) {
                this.renderConversation(buddy);
            }
            this.renderBuddyList();
            return { success: true, buddy, count: messages.length };
        });

        // COMMAND: Clear conversation with a buddy
        this.registerCommand('clearConversation', (payload) => {
            const buddy = payload.buddy || payload.screenName;
            if (!buddy) return { success: false, error: 'Buddy name required' };
            this.conversations[buddy] = [];
            if (this.activeBuddy === buddy) {
                this.renderConversation(buddy);
            }
            this.renderBuddyList();
            return { success: true, buddy };
        });

        // COMMAND: Clear all conversations
        this.registerCommand('clearAllConversations', () => {
            this.conversations = {};
            if (this.activeBuddy) {
                this.renderConversation(this.activeBuddy);
            }
            this.renderBuddyList();
            return { success: true };
        });

        // COMMAND: Schedule a message from a buddy after a delay
        this.registerCommand('scheduledMessage', (payload) => {
            const from = payload.from || payload.buddy;
            const message = payload.message || payload.text;
            const delay = payload.delay || 5000;
            if (!from || !message) return { success: false, error: 'From and message required' };

            const id = 'sched_' + (++this._scheduleCounter);
            const timeoutId = setTimeout(() => {
                delete this._scheduledMessages[id];
                if (this.isSignedOn) {
                    this.receiveIMMessage(from, message);
                    this.emitAppEvent('scheduledMessageDelivered', { id, from, message });
                }
            }, delay);

            this._scheduledMessages[id] = { timeoutId, from, message, delay };
            return { success: true, id };
        });

        // COMMAND: Set buddy profile text and away message
        this.registerCommand('setBuddyProfile', (payload) => {
            const screenName = payload.screenName || payload.buddy;
            if (!screenName) return { success: false, error: 'Screen name required' };
            const buddy = this.findBuddy(screenName);
            if (!buddy) return { success: false, error: 'Buddy not found' };
            if (payload.profile !== undefined) buddy.profile = payload.profile;
            if (payload.awayMsg !== undefined) buddy.awayMsg = payload.awayMsg;
            return { success: true, screenName };
        });

        // COMMAND: Full state reset (for ARG scene changes)
        this.registerCommand('reset', () => {
            // Cancel scheduled messages
            for (const id of Object.keys(this._scheduledMessages)) {
                clearTimeout(this._scheduledMessages[id].timeoutId);
            }
            this._scheduledMessages = {};
            this._customBuddyResponses = {};
            this._botTimers.forEach(t => clearTimeout(t));
            this._botTimers = [];
            this.conversations = {};
            this.awayMessage = '';
            this.status = 'online';
            this.activeBuddy = null;
            if (this.activeBuddy) {
                this.closeActiveConversation();
            }
            this.renderBuddyList();
            return { success: true };
        });

        // QUERY: Get all conversations
        this.registerQuery('getAllConversations', () => {
            const result = {};
            for (const [buddy, messages] of Object.entries(this.conversations)) {
                result[buddy] = messages.map(m => ({ ...m }));
            }
            return result;
        });

        // QUERY: Get IM config state
        this.registerQuery('getConfig', () => {
            return {
                signedOn: this.isSignedOn,
                username: this.username || null,
                status: this.status,
                away: !!this.awayMessage,
                awayMessage: this.awayMessage || null,
                activeBuddy: this.activeBuddy,
                buddyGroupCount: Object.keys(this.buddyGroups).length,
                totalBuddies: this.getAllBuddies().length,
                onlineBuddies: this.getAllBuddies().filter(b => b.status !== 'offline').length,
                conversationCount: Object.keys(this.conversations).length,
                customResponseCount: Object.keys(this._customBuddyResponses).length,
                scheduledMessages: Object.keys(this._scheduledMessages).length
            };
        });
    }
}

export default InstantMessenger;
