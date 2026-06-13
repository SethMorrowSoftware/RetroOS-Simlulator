/**
 * Phone - 90s Cordless Phone / Landline Simulator
 * Full-featured, scriptable phone for ARG-style interactive narratives.
 *
 * Features:
 *   - Dial pad with DTMF-style key tones
 *   - Contact management with groups & status indicators
 *   - Call history with caller ID
 *   - Voicemail system with audio playback support
 *   - Answering machine with custom greetings
 *   - Speed dial slots
 *   - Scriptable bot conversations with per-contact response chains
 *   - Incoming call simulation with configurable behavior
 *   - Audio call support (play audio files during calls)
 *   - Call interception for custom scripted outcomes
 *   - Call recording / transcript export
 *   - Scheduled calls and delayed voicemails
 *   - Win95-themed retro UI with proper resize support
 *
 * SCRIPTING SUPPORT:
 *   Commands: dial, hangup, hold, answer, decline,
 *             addContact, removeContact, updateContact,
 *             sendVoicemail, sendAudioVoicemail, deleteVoicemail, clearVoicemails,
 *             simulateIncoming, scheduleCall, cancelScheduledCall,
 *             setText, setLCDStatus,
 *             injectMessage, setResponses, clearResponses,
 *             setCallOutcome, clearCallOutcome,
 *             interceptCall, clearIntercept,
 *             playCallAudio, stopCallAudio,
 *             setSpeedDial, clearSpeedDial,
 *             setGreeting, setView,
 *             clearHistory, clearContacts,
 *             setCallerIdEnabled, setAnsweringMachineEnabled,
 *             reset
 *   Queries:  getStatus, getCurrentCall, getContacts, getCallHistory,
 *             getVoicemails, getSpeedDial, getTranscript, getGreeting,
 *             getConfig, getScheduledCalls
 *   Events:   app:phone:dialed, app:phone:ringing, app:phone:connected,
 *             app:phone:ended, app:phone:incoming, app:phone:answered,
 *             app:phone:declined, app:phone:voicemail, app:phone:voicemailPlayed,
 *             app:phone:contactAdded, app:phone:contactRemoved,
 *             app:phone:contactUpdated, app:phone:messageReceived,
 *             app:phone:messageSent, app:phone:callIntercepted,
 *             app:phone:speedDialUsed, app:phone:dtmf,
 *             app:phone:audioStarted, app:phone:audioEnded,
 *             app:phone:scheduledCallTriggered, app:phone:viewChanged
 */

import AppBase from './AppBase.js';
import { escapeHtml } from '../core/Sanitize.js';
import StorageManager from '../core/StorageManager.js';

const PHONE_STORAGE_KEY = 'phone:state:v1';

// DTMF tone pairs (Hz) by digit — the iconic touch-tone phone sound
const DTMF_FREQS = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
};

class Phone extends AppBase {
    constructor() {
        super({
            id: 'phone',
            name: 'Phone',
            icon: '📞',
            width: 460,
            height: 680,
            minWidth: 380,
            minHeight: 560,
            resizable: true,
            singleton: true,
            category: 'internet'
        });

        // Call state: idle, dialing, ringing, incoming, connected, hold, ended
        this.callState = 'idle';
        this.currentCall = null;
        this.callTimer = null;
        this.callDuration = 0;
        this.dialBuffer = '';
        this.callHistory = [];
        this.voicemails = [];
        this.currentView = 'dialer';
        this._activeCallAudio = null;

        // Config
        this.callerIdEnabled = true;
        this.answeringMachineEnabled = true;
        this.answeringMachineGreeting = 'We\'re not home right now. Leave a message after the beep!';
        this.answeringMachineRings = 4; // rings before answering machine picks up

        // Speed dial (slots 1-9)
        this.speedDial = {
            1: { name: 'Mom', number: '555-0100' },
            2: { name: 'Pizza Hut', number: '555-7482' },
            3: { name: 'Jenny', number: '867-5309' },
        };

        // Call interception map: number -> { outcome, message, responses, audioSrc, voicemail }
        this._callIntercepts = {};

        // Call outcome overrides: number -> 'connect' | 'busy' | 'noAnswer' | 'disconnected' | 'operator'
        this._callOutcomes = {};

        // Custom response overrides: contactName -> string[]
        this._customResponses = {};

        // Scheduled calls: id -> { timeoutId, from, number, delay, responses }
        this._scheduledCalls = {};
        this._scheduleCounter = 0;

        // Ring tracking
        this._ringCount = 0;
        this._ringInterval = null;

        // Bot response timeout
        this._botResponseTimeout = null;

        // Pre-populated 90s phonebook contacts
        this.contacts = [
            { name: 'Mom', number: '555-0100', status: 'available', group: 'Family' },
            { name: 'Dad (Work)', number: '555-0101', status: 'available', group: 'Family' },
            { name: 'Grandma', number: '555-0199', status: 'available', group: 'Family' },
            { name: 'Pizza Hut', number: '555-7482', status: 'available', group: 'Services' },
            { name: 'Blockbuster Video', number: '555-3284', status: 'available', group: 'Services' },
            { name: 'Dominos', number: '555-3030', status: 'available', group: 'Services' },
            { name: 'Moviefone', number: '555-FILM', status: 'available', group: 'Services' },
            { name: 'Time & Weather', number: '555-1212', status: 'available', group: 'Services' },
            { name: 'Radio Station KISS FM', number: '555-KISS', status: 'available', group: 'Services' },
            { name: 'BBS Sysop - Dave', number: '555-1337', status: 'busy', group: 'Friends' },
            { name: 'Jenny', number: '867-5309', status: 'available', group: 'Friends' },
            { name: 'School Friend - Mike', number: '555-0234', status: 'away', group: 'Friends' },
        ];

        // Bot responses per contact for simulated conversations
        this.botResponses = {
            'Mom': [
                "Hello? Oh hi sweetie!",
                "Are you doing your homework?",
                "Dinner's at 6, don't be late!",
                "Get off the computer and come eat!",
                "Is that you? I can barely hear you!",
                "Tell your father dinner is ready.",
                "Don't forget to take out the trash!"
            ],
            'Dad (Work)': [
                "Hi, I'm in a meeting... can I call you back?",
                "Hey champ, what's up?",
                "Ask your mother.",
                "I'll be home around 7.",
                "Did you break something again?"
            ],
            'Pizza Hut': [
                "Thank you for calling Pizza Hut! Can I take your order?",
                "Would you like our new Stuffed Crust pizza?",
                "That'll be about 30 minutes for delivery.",
                "Would you like breadsticks with that?",
                "Your total comes to $12.99."
            ],
            'Blockbuster Video': [
                "Thank you for calling Blockbuster Video!",
                "Yes, we have that movie in stock.",
                "That tape is due back by Thursday.",
                "Your account shows a late fee of $3.50.",
                "Be kind, please rewind!"
            ],
            'BBS Sysop - Dave': [
                "Yo, the BBS is down for maintenance.",
                "New warez uploaded last night, check it out!",
                "Dude, you've been hogging the line for 3 hours!",
                "The new DOOM WAD is up on the board.",
                "Call back on the second line, this one's for data."
            ],
            'Jenny': [
                "Hello?",
                "Who is this?",
                "How did you get this number?!",
                "Stop calling me!",
                "*click*"
            ],
            'Moviefone': [
                "Hello, and welcome to Moviefone!",
                "If you know the name of the movie you'd like to see, press 1.",
                "Coming to a theater near you: Titanic, still playing!",
                "The Matrix is showing at 7:00, 9:30, and midnight.",
                "Thank you for using Moviefone. Goodbye!"
            ],
            'Grandma': [
                "Hello? HELLO? Who is this?",
                "Speak up dear, I can't hear you!",
                "Oh it's you! When are you coming to visit?",
                "I made cookies, come pick some up!",
                "Your grandfather says hello!"
            ],
            'Time & Weather': [
                "At the tone, the time will be... 3:45 PM.",
                "Current temperature: 72 degrees Fahrenheit.",
                "Forecast: Partly cloudy with a chance of rain.",
                "This has been your local time and weather service.",
                "BEEP."
            ],
            'Radio Station KISS FM': [
                "You're caller number 7! Stay on the line!",
                "KISS FM, all the hits! What do you wanna hear?",
                "Sorry, you're not the right caller. Try again!",
                "Playing your request after the break!",
                "KISS FM contest line, we'll call you back!"
            ],
            'Dominos': [
                "Domino's Pizza, how can I help you?",
                "Would you like to try our new cheesy bread?",
                "Delivery or carryout?",
                "That'll be ready in 25 minutes.",
                "Your total is $8.99 with the coupon."
            ],
            '_default': [
                "Hello?",
                "Yeah?",
                "Who's calling?",
                "Uh huh...",
                "Sure thing.",
                "Can I call you back?",
                "Sorry, wrong number."
            ],
            '_operator': [
                "Operator. How may I direct your call?",
                "Please hold while I connect you.",
                "I'm sorry, that number is not in service.",
                "The number you have dialed has been disconnected.",
                "Please check the number and dial again."
            ],
            '_busy': [
                "(BUSY SIGNAL) beep... beep... beep..."
            ],
            '_disconnected': [
                "We're sorry, the number you have dialed is not in service. Please check the number and dial again.",
                "This number has been disconnected."
            ]
        };

        // Pre-loaded voicemails
        this.voicemails = [
            { id: 'vm1', from: 'Mom', number: '555-0100', message: 'Honey, call me back when you get this. Dinner plans changed!', time: '2:30 PM', date: 'Today', heard: false, audioSrc: null, duration: null },
            { id: 'vm2', from: 'Blockbuster', number: '555-3284', message: 'This is Blockbuster Video reminding you that your rental of "The Matrix" is due tomorrow.', time: '11:15 AM', date: 'Today', heard: false, audioSrc: null, duration: null },
            { id: 'vm3', from: 'Unknown', number: '555-0000', message: '*heavy breathing* ...seven days...', time: '3:00 AM', date: 'Yesterday', heard: false, audioSrc: null, duration: null }
        ];
        this._vmIdCounter = 3;

        // Web Audio context (lazy-init on first DTMF press)
        this._audioCtx = null;
        this._dtmfMuted = false;
        this._speakerOn = false;

        // Hydrate persisted state — only data that makes sense to keep:
        // user-added contacts, call history, voicemails, speed dial, toggle prefs.
        this._loadState();
    }

    _loadState() {
        const saved = StorageManager.get(PHONE_STORAGE_KEY, null);
        if (!saved || typeof saved !== 'object') return;
        if (Array.isArray(saved.contacts) && saved.contacts.length) {
            this.contacts = saved.contacts;
        }
        if (Array.isArray(saved.callHistory)) {
            this.callHistory = saved.callHistory.slice(0, 100);
        }
        if (Array.isArray(saved.voicemails)) {
            this.voicemails = saved.voicemails;
            const numericIds = this.voicemails
                .map(v => parseInt(String(v.id).replace(/\D/g, ''), 10))
                .filter(n => Number.isFinite(n));
            if (numericIds.length) this._vmIdCounter = Math.max(...numericIds);
        }
        if (saved.speedDial && typeof saved.speedDial === 'object') {
            this.speedDial = saved.speedDial;
        }
        if (typeof saved.callerIdEnabled === 'boolean') {
            this.callerIdEnabled = saved.callerIdEnabled;
        }
        if (typeof saved.answeringMachineEnabled === 'boolean') {
            this.answeringMachineEnabled = saved.answeringMachineEnabled;
        }
        if (typeof saved.answeringMachineGreeting === 'string') {
            this.answeringMachineGreeting = saved.answeringMachineGreeting;
        }
    }

    _saveState() {
        StorageManager.set(PHONE_STORAGE_KEY, {
            contacts: this.contacts,
            callHistory: this.callHistory,
            voicemails: this.voicemails,
            speedDial: this.speedDial,
            callerIdEnabled: this.callerIdEnabled,
            answeringMachineEnabled: this.answeringMachineEnabled,
            answeringMachineGreeting: this.answeringMachineGreeting
        });
    }

    _toggleMute(btn) {
        this._dtmfMuted = !this._dtmfMuted;
        this.playSound('click');
        if (btn) {
            btn.textContent = this._dtmfMuted ? '🔇 Muted' : '🔊 Mute';
            btn.classList.toggle('active', this._dtmfMuted);
        }
    }

    _toggleSpeaker(btn) {
        this._speakerOn = !this._speakerOn;
        this.playSound('click');
        if (btn) {
            btn.textContent = this._speakerOn ? '📣 Spkr ON' : '📣 Spkr';
            btn.classList.toggle('active', this._speakerOn);
        }
        // Cosmetic: pulse LCD if speakerphone is on
        const lcd = this.getElement('#phoneLcd');
        if (lcd) lcd.classList.toggle('phone-lcd-speaker', this._speakerOn);
    }

    _playDtmf(digit) {
        if (this._dtmfMuted) return;
        const pair = DTMF_FREQS[digit];
        if (!pair) return;
        try {
            if (!this._audioCtx) {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                this._audioCtx = new AC();
            }
            const ctx = this._audioCtx;
            if (ctx.state === 'suspended') ctx.resume();
            const now = ctx.currentTime;
            const dur = 0.14;
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
            gain.gain.setValueAtTime(0.08, now + dur - 0.02);
            gain.gain.linearRampToValueAtTime(0, now + dur);
            gain.connect(ctx.destination);
            pair.forEach(freq => {
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = freq;
                osc.connect(gain);
                osc.start(now);
                osc.stop(now + dur);
            });
        } catch (_e) {
            // Audio failures are non-fatal
        }
    }

    onOpen() {
        const unheardCount = this.voicemails.filter(vm => !vm.heard).length;
        const speedDialHtml = this._renderSpeedDialBar();

        return `
            <div class="phone-container">
                <!-- Status Bar -->
                <div class="phone-status-bar">
                    <div class="phone-status-bar-left">
                        <div class="phone-signal-bars">
                            <div class="phone-signal-bar active"></div>
                            <div class="phone-signal-bar active"></div>
                            <div class="phone-signal-bar active"></div>
                            <div class="phone-signal-bar active"></div>
                        </div>
                        <span id="phoneStatusText">Ready</span>
                    </div>
                    <div class="phone-status-bar-right">
                        <div class="phone-battery">
                            <div class="phone-battery-icon">
                                <div class="phone-battery-segment"></div>
                                <div class="phone-battery-segment"></div>
                                <div class="phone-battery-segment"></div>
                            </div>
                        </div>
                        <span id="phoneClockDisplay"></span>
                    </div>
                </div>

                <!-- Caller ID Bar -->
                <div class="phone-caller-id" id="callerIdBar" style="display:none;">
                    <span class="phone-caller-id-label">CALLER ID:</span>
                    <span class="phone-caller-id-value" id="callerIdValue">---</span>
                </div>

                <!-- Tab Bar -->
                <div class="phone-tab-bar">
                    <div class="phone-tab active" data-tab="dialer">
                        <span class="phone-tab-label">Dial</span>
                    </div>
                    <div class="phone-tab" data-tab="contacts">
                        <span class="phone-tab-label">Contacts</span>
                    </div>
                    <div class="phone-tab" data-tab="history">
                        <span class="phone-tab-label">History</span>
                    </div>
                    <div class="phone-tab" data-tab="voicemail">
                        <span class="phone-tab-label">VM ${unheardCount > 0 ? `<span class="phone-vm-badge" id="vmBadge">${unheardCount}</span>` : `<span class="phone-vm-badge" id="vmBadge" style="display:none">0</span>`}</span>
                    </div>
                </div>

                <!-- DIALER VIEW -->
                <div id="view-dialer" class="phone-view active">
                    <div class="phone-lcd" id="phoneLcd">
                        <div class="phone-lcd-number" id="lcdNumber">&nbsp;</div>
                        <div class="phone-lcd-caller" id="lcdCaller">&nbsp;</div>
                        <div class="phone-lcd-status" id="lcdStatus">Ready</div>
                    </div>
                    ${speedDialHtml}
                    <div class="phone-dialpad">
                        <div class="phone-key" data-digit="1">1<span class="phone-key-sub">&nbsp;</span></div>
                        <div class="phone-key" data-digit="2">2<span class="phone-key-sub">ABC</span></div>
                        <div class="phone-key" data-digit="3">3<span class="phone-key-sub">DEF</span></div>
                        <div class="phone-key" data-digit="4">4<span class="phone-key-sub">GHI</span></div>
                        <div class="phone-key" data-digit="5">5<span class="phone-key-sub">JKL</span></div>
                        <div class="phone-key" data-digit="6">6<span class="phone-key-sub">MNO</span></div>
                        <div class="phone-key" data-digit="7">7<span class="phone-key-sub">PQRS</span></div>
                        <div class="phone-key" data-digit="8">8<span class="phone-key-sub">TUV</span></div>
                        <div class="phone-key" data-digit="9">9<span class="phone-key-sub">WXYZ</span></div>
                        <div class="phone-key" data-digit="*">*<span class="phone-key-sub">&nbsp;</span></div>
                        <div class="phone-key" data-digit="0">0<span class="phone-key-sub">+</span></div>
                        <div class="phone-key" data-digit="#">#<span class="phone-key-sub">&nbsp;</span></div>
                    </div>
                    <div class="phone-actions">
                        <div class="phone-action-btn phone-call-btn" id="btnCall">Call</div>
                        <div class="phone-action-btn phone-clear-btn" id="btnClear">Clear</div>
                        <div class="phone-action-btn phone-hangup-btn" id="btnHangup" style="display:none;">End</div>
                        <div class="phone-action-btn phone-hold-btn" id="btnHold" style="display:none;">Hold</div>
                    </div>
                </div>

                <!-- CONTACTS VIEW -->
                <div id="view-contacts" class="phone-view">
                    <div class="phone-toolbar">
                        <div class="phone-toolbar-btn" id="btnAddContact">Add</div>
                        <div class="phone-toolbar-btn" id="btnSortContacts">Sort</div>
                    </div>
                    <div class="phone-list-view" id="contactsList"></div>
                </div>

                <!-- HISTORY VIEW -->
                <div id="view-history" class="phone-view">
                    <div class="phone-toolbar">
                        <div class="phone-toolbar-btn" id="btnClearHistory">Clear All</div>
                    </div>
                    <div class="phone-list-view" id="historyList"></div>
                </div>

                <!-- VOICEMAIL VIEW -->
                <div id="view-voicemail" class="phone-view">
                    <div class="phone-answering-machine">
                        <div class="phone-am-display" id="amDisplay">
                            ANSWERING MACHINE - ${this.voicemails.length} message(s)
                        </div>
                    </div>
                    <div class="phone-list-view" id="voicemailList"></div>
                </div>

                <!-- ACTIVE CALL SCREEN -->
                <div id="view-call" class="phone-view">
                    <div class="phone-call-screen">
                        <div class="phone-call-avatar" id="callAvatar">?</div>
                        <div class="phone-call-name" id="callName">Unknown</div>
                        <div class="phone-call-number" id="callNumber"></div>
                        <div class="phone-call-status" id="callStatus">Dialing...</div>
                        <div class="phone-call-timer" id="callTimerDisplay">00:00</div>
                        <div class="phone-call-conversation" id="callConversation"></div>
                        <div class="phone-call-actions">
                            <div class="phone-action-btn phone-call-toggle-btn" id="btnCallMute" title="Mute / Unmute DTMF">🔊 Mute</div>
                            <div class="phone-action-btn phone-call-toggle-btn" id="btnCallSpeaker" title="Toggle Speakerphone">📣 Spkr</div>
                            <div class="phone-action-btn phone-hold-btn" id="btnCallHold">Hold</div>
                            <div class="phone-action-btn phone-hangup-btn" id="btnCallEnd">End Call</div>
                        </div>
                    </div>
                </div>

                <!-- VOICEMAIL DETAIL VIEW -->
                <div id="view-vmDetail" class="phone-view">
                    <div class="phone-vm-player" id="vmPlayer">
                        <div class="phone-vm-player-header">
                            <span id="vmDetailFrom">From: ---</span>
                            <span id="vmDetailTime">---</span>
                        </div>
                        <div class="phone-vm-player-message" id="vmDetailMessage"></div>
                        <div class="phone-vm-progress" id="vmProgressBar">
                            <div class="phone-vm-progress-fill" id="vmProgressFill"></div>
                        </div>
                        <div class="phone-vm-player-controls">
                            <div class="phone-vm-control-btn" id="btnVmPlay">Play</div>
                            <div class="phone-vm-control-btn" id="btnVmStop">Stop</div>
                            <div class="phone-vm-control-btn" id="btnVmDelete">Delete</div>
                            <div class="phone-vm-control-btn" id="btnVmBack">Back</div>
                        </div>
                        <div id="vmCallbackBar" style="display:flex; gap:4px; justify-content:center; margin-top:4px;">
                            <div class="phone-action-btn phone-call-btn" id="btnVmCallback" style="font-size:12px; padding:3px 10px;">Call Back</div>
                        </div>
                    </div>
                </div>

                <!-- INCOMING CALL OVERLAY -->
                <div id="incomingOverlay" class="phone-incoming-overlay">
                    <div class="phone-incoming-icon phone-ringing">📞</div>
                    <div class="phone-incoming-name" id="incomingName">Incoming Call</div>
                    <div class="phone-incoming-number" id="incomingNumber">555-0000</div>
                    <div class="phone-incoming-ring">RING RING!</div>
                    <div class="phone-incoming-actions">
                        <div class="phone-action-btn phone-answer-btn" id="btnAnswer">Answer</div>
                        <div class="phone-action-btn phone-decline-btn" id="btnDecline">Decline</div>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        // Tab navigation
        this.getElements('.phone-tab').forEach(tab => {
            this.addHandler(tab, 'click', () => {
                if (this.callState === 'connected' || this.callState === 'hold') return;
                this.switchView(tab.dataset.tab);
            });
        });

        // Dialpad keys
        this.getElements('.phone-key').forEach(key => {
            this.addHandler(key, 'click', () => {
                this.pressKey(key.dataset.digit);
            });
        });

        // Speed dial buttons
        this.getElements('.phone-speed-dial-btn').forEach(btn => {
            this.addHandler(btn, 'click', () => {
                const slot = parseInt(btn.dataset.slot);
                this._useSpeedDial(slot);
            });
        });

        // Action buttons
        this.addHandler(this.getElement('#btnCall'), 'click', () => this.dialNumber());
        this.addHandler(this.getElement('#btnClear'), 'click', () => this.clearDial());
        this.addHandler(this.getElement('#btnHangup'), 'click', () => this.hangUp());
        this.addHandler(this.getElement('#btnHold'), 'click', () => this.toggleHold());
        this.addHandler(this.getElement('#btnCallEnd'), 'click', () => this.hangUp());
        this.addHandler(this.getElement('#btnCallHold'), 'click', () => this.toggleHold());
        this.addHandler(this.getElement('#btnAnswer'), 'click', () => this.answerCall());
        this.addHandler(this.getElement('#btnDecline'), 'click', () => this.declineCall());
        this.addHandler(this.getElement('#btnCallMute'), 'click', (e) => this._toggleMute(e.currentTarget));
        this.addHandler(this.getElement('#btnCallSpeaker'), 'click', (e) => this._toggleSpeaker(e.currentTarget));

        // Contact toolbar
        this.addHandler(this.getElement('#btnAddContact'), 'click', () => this._promptAddContact());
        this.addHandler(this.getElement('#btnSortContacts'), 'click', () => this._sortContacts());

        // History toolbar
        this.addHandler(this.getElement('#btnClearHistory'), 'click', async () => {
            if (this.callHistory.length === 0) {
                this.playSound('click');
                return;
            }
            const ok = await this.confirm('Clear all call history?', 'Phone');
            if (!ok) return;
            this.callHistory = [];
            this.renderHistory();
            this._saveState();
            this.playSound('click');
        });

        // Voicemail detail buttons
        this.addHandler(this.getElement('#btnVmPlay'), 'click', () => this._playCurrentVoicemail());
        this.addHandler(this.getElement('#btnVmStop'), 'click', () => this._stopVoicemailPlayback());
        this.addHandler(this.getElement('#btnVmDelete'), 'click', () => this._deleteCurrentVoicemail());
        this.addHandler(this.getElement('#btnVmBack'), 'click', () => this.switchView('voicemail'));
        this.addHandler(this.getElement('#btnVmCallback'), 'click', () => this._callbackFromVoicemail());

        // Render initial views
        this.renderContacts();
        this.renderHistory();
        this.renderVoicemails();
        this.updateVmBadge();

        // Clock update
        this._updateClock();
        this._clockInterval = setInterval(() => this._updateClock(), 30000);

        // Register scripting commands
        this._registerScriptingCommands();
    }

    onClose() {
        if (this.callTimer) clearInterval(this.callTimer);
        this.callTimer = null;
        if (this._ringInterval) clearInterval(this._ringInterval);
        if (this._botResponseTimeout) clearTimeout(this._botResponseTimeout);
        if (this._clockInterval) clearInterval(this._clockInterval);
        if (this._vmPlaybackTimeout) clearTimeout(this._vmPlaybackTimeout);
        this._stopCallAudio();

        // Reset call state — the dial/ring setTimeout chain guards on
        // callState, so without this a close mid-dial let connectCall()
        // run after the window was gone, arming a call timer nothing
        // would ever clear and blocking tab navigation on reopen.
        this.callState = 'idle';

        // Clear scheduled calls
        for (const id of Object.keys(this._scheduledCalls)) {
            clearTimeout(this._scheduledCalls[id].timeoutId);
        }
        this._scheduledCalls = {};
    }

    onResize() {
        // Views adapt via flex layout, no special handling needed
    }

    // ===== CLOCK =====

    _updateClock() {
        const el = this.getElement('#phoneClockDisplay');
        if (el) {
            el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }

    // ===== VIEW MANAGEMENT =====

    switchView(viewName) {
        const prevView = this.currentView;
        this.currentView = viewName;

        ['dialer', 'contacts', 'history', 'voicemail', 'call', 'vmDetail'].forEach(v => {
            const el = this.getElement(`#view-${v}`);
            if (el) {
                el.classList.toggle('active', v === viewName);
            }
        });

        // Update tab highlight (don't highlight call/vmDetail as tabs)
        const tabName = (viewName === 'call' || viewName === 'vmDetail') ? null : viewName;
        this.getElements('.phone-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        if (viewName === 'contacts') this.renderContacts();
        if (viewName === 'history') this.renderHistory();
        if (viewName === 'voicemail') this.renderVoicemails();

        if (viewName !== prevView) {
            this.emitAppEvent('viewChanged', { view: viewName, previousView: prevView });
        }
    }

    // ===== DIALER =====

    pressKey(digit) {
        // Allow DTMF during a connected call too (for menus / Moviefone bits)
        // but only buffer dial digits when idle.
        this._playDtmf(digit);
        this.emitAppEvent('dtmf', { digit });
        if (this.callState !== 'idle') return;
        this.dialBuffer += digit;
        this._setLCDBacklit(true);
        this.updateLCD();
    }

    clearDial() {
        if (this.dialBuffer.length > 0) {
            this.dialBuffer = this.dialBuffer.slice(0, -1);
        }
        if (this.dialBuffer.length === 0) {
            this._setLCDBacklit(false);
        }
        this.updateLCD();
    }

    updateLCD() {
        const lcdNum = this.getElement('#lcdNumber');
        const lcdCaller = this.getElement('#lcdCaller');
        if (lcdNum) lcdNum.textContent = this.dialBuffer || '\u00A0';

        // Look up contact
        if (lcdCaller) {
            const contact = this.findContactByNumber(this.dialBuffer);
            lcdCaller.textContent = contact ? contact.name : '\u00A0';
        }
    }

    setLCDStatus(text) {
        const el = this.getElement('#lcdStatus');
        if (el) el.textContent = text;
    }

    _setLCDBacklit(on) {
        const lcd = this.getElement('#phoneLcd');
        if (lcd) lcd.classList.toggle('backlit', on);
    }

    _setStatusText(text) {
        const el = this.getElement('#phoneStatusText');
        if (el) el.textContent = text;
    }

    findContactByNumber(number) {
        const clean = String(number).replace(/\D/g, '');
        return this.contacts.find(c => c.number.replace(/\D/g, '') === clean);
    }

    findContactByName(name) {
        return this.contacts.find(c => c.name.toLowerCase() === String(name).toLowerCase());
    }

    // ===== SPEED DIAL =====

    _renderSpeedDialBar() {
        const entries = Object.entries(this.speedDial).sort((a, b) => a[0] - b[0]);
        if (entries.length === 0) return '';
        const buttons = entries.map(([slot, { name }]) =>
            `<div class="phone-speed-dial-btn" data-slot="${slot}" title="${this._esc(name)}">${slot}:${this._esc(name)}</div>`
        ).join('');
        return `<div class="phone-speed-dial-bar">${buttons}</div>`;
    }

    _useSpeedDial(slot) {
        const entry = this.speedDial[slot];
        if (!entry || this.callState !== 'idle') return;
        this.emitAppEvent('speedDialUsed', { slot, name: entry.name, number: entry.number });
        this.dialBuffer = entry.number;
        this.updateLCD();
        this.dialNumber();
    }

    // ===== CALLER ID =====

    _showCallerId(name, number) {
        if (!this.callerIdEnabled) return;
        const bar = this.getElement('#callerIdBar');
        const val = this.getElement('#callerIdValue');
        if (bar) bar.style.display = 'flex';
        if (val) val.textContent = name ? `${name} - ${number}` : number;
    }

    _hideCallerId() {
        const bar = this.getElement('#callerIdBar');
        if (bar) bar.style.display = 'none';
    }

    // ===== CALL MANAGEMENT =====

    dialNumber(numberOverride) {
        const number = numberOverride || this.dialBuffer;
        if (!number || this.callState !== 'idle') return;

        const contact = this.findContactByNumber(number);
        const name = contact ? contact.name : 'Unknown';

        // Check for call interception
        const intercept = this._callIntercepts[number] || this._callIntercepts[name];
        if (intercept) {
            this._handleInterceptedCall(number, name, intercept);
            return;
        }

        // Check for outcome override
        const outcome = this._callOutcomes[number] || this._callOutcomes[name];

        this.callState = 'dialing';
        this.currentCall = {
            number, name, direction: 'outgoing', startTime: null, messages: [],
            audioSrc: null
        };
        this.callDuration = 0;
        this.dialBuffer = '';

        this.emitAppEvent('dialed', { number, name });
        this._setLCDBacklit(true);
        this._setStatusText('Dialing...');
        this._showCallerId(name, number);

        // Show call screen
        this.showCallScreen(name, number, 'Dialing...');
        this.playSound('click');

        // Simulate ringing then outcome
        setTimeout(() => {
            if (this.callState !== 'dialing') return;

            // Forced outcomes
            if (outcome === 'busy') {
                this.addCallMessage('system', '(Busy signal)');
                this.playSound('error');
                this.endCall('Busy');
                return;
            }
            if (outcome === 'disconnected') {
                const msgs = this.botResponses['_disconnected'];
                this.addCallMessage('system', msgs[Math.floor(Math.random() * msgs.length)]);
                this.playSound('error');
                this.endCall('Disconnected');
                return;
            }
            if (outcome === 'operator') {
                this.addCallMessage('system', 'Connecting to operator...');
                const msgs = this.botResponses['_operator'];
                setTimeout(() => {
                    if (this.callState === 'dialing' || this.callState === 'ringing') {
                        this.addCallMessage('them', msgs[Math.floor(Math.random() * msgs.length)]);
                        this.endCall('Operator');
                    }
                }, 1500);
                return;
            }

            this.callState = 'ringing';
            this.updateCallStatus('Ringing...');
            this.emitAppEvent('ringing', { number, name });
            this._setStatusText('Ringing');

            setTimeout(() => {
                if (this.callState !== 'ringing') return;

                if (outcome === 'noAnswer') {
                    this.addCallMessage('system', '(No answer)');
                    this.playSound('error');
                    this.endCall('No Answer');
                    return;
                }

                // Default: 90% chance of answering, or 100% if forced
                if (outcome === 'connect' || Math.random() < 0.9) {
                    this.connectCall();
                } else {
                    this.addCallMessage('system', '(No answer)');
                    this.playSound('error');
                    this.endCall('No Answer');
                }
            }, 2000 + Math.random() * 2000);
        }, 1500);
    }

    _handleInterceptedCall(number, name, intercept) {
        this.emitAppEvent('callIntercepted', { number, name, intercept: { ...intercept, responses: undefined } });
        this.dialBuffer = '';

        if (intercept.outcome === 'busy') {
            this.callState = 'dialing';
            this.currentCall = { number, name, direction: 'outgoing', startTime: null, messages: [] };
            this.showCallScreen(name, number, 'Dialing...');
            setTimeout(() => {
                this.addCallMessage('system', intercept.message || '(Busy signal)');
                this.endCall('Busy');
            }, 1500);
            return;
        }

        if (intercept.outcome === 'voicemail' && intercept.voicemail) {
            this._setStatusText('Calling...');
            this.callState = 'dialing';
            this.currentCall = { number, name, direction: 'outgoing', startTime: null, messages: [] };
            this.showCallScreen(name, number, 'Dialing...');
            setTimeout(() => {
                this.addCallMessage('system', '(Went to voicemail)');
                this.endCall('Voicemail');
                this.voicemails.unshift({
                    id: 'vm' + (++this._vmIdCounter),
                    from: intercept.voicemail.from || name,
                    number: number,
                    message: intercept.voicemail.message || '',
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    date: 'Today',
                    heard: false,
                    audioSrc: intercept.voicemail.audioSrc || null,
                    duration: intercept.voicemail.duration || null
                });
                this.updateVmBadge();
                this.renderVoicemails();
                this._saveState();
                this.playSound('notify');
                this.emitAppEvent('voicemail', { from: name, number });
            }, 2500);
            return;
        }

        // Default intercept: connect with custom responses
        this.callState = 'dialing';
        this.currentCall = {
            number, name, direction: 'outgoing', startTime: null, messages: [],
            audioSrc: intercept.audioSrc || null
        };
        this.showCallScreen(name, number, 'Dialing...');

        if (intercept.responses) {
            this._customResponses[name] = intercept.responses;
        }

        setTimeout(() => {
            if (this.callState !== 'dialing') return;
            this.callState = 'ringing';
            this.updateCallStatus('Ringing...');
            setTimeout(() => {
                if (this.callState !== 'ringing') return;
                this.connectCall();
                if (intercept.audioSrc) {
                    this._playCallAudio(intercept.audioSrc);
                }
            }, 1500 + Math.random() * 1000);
        }, 1000);
    }

    connectCall() {
        this.callState = 'connected';
        this.currentCall.startTime = Date.now();
        this.updateCallStatus('Connected');
        this._setStatusText('In Call');

        this.emitAppEvent('connected', {
            number: this.currentCall.number,
            name: this.currentCall.name
        });

        // Start call timer
        this.callTimer = setInterval(() => {
            this.callDuration++;
            this.updateCallTimerDisplay();
        }, 1000);

        // If the call has audio, play it
        if (this.currentCall.audioSrc) {
            this._playCallAudio(this.currentCall.audioSrc);
        }

        // Bot sends first message
        this.scheduleBotResponse(800);
    }

    hangUp() {
        if (this.callState === 'idle') return;
        this.playSound('click');
        this.endCall('Call Ended');
    }

    endCall(reason) {
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
        if (this._botResponseTimeout) {
            clearTimeout(this._botResponseTimeout);
            this._botResponseTimeout = null;
        }
        this._stopCallAudio();

        // Add to history
        if (this.currentCall) {
            this.callHistory.unshift({
                name: this.currentCall.name,
                number: this.currentCall.number,
                direction: this.currentCall.direction,
                duration: this.callDuration,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: new Date().toLocaleDateString(),
                reason
            });
            if (this.callHistory.length > 100) this.callHistory.pop();
            this._saveState();
        }

        this.emitAppEvent('ended', {
            number: this.currentCall?.number,
            name: this.currentCall?.name,
            duration: this.callDuration,
            reason,
            transcript: this.currentCall?.messages || []
        });

        this.updateCallStatus(reason || 'Call Ended');
        this.callState = 'idle';
        this._setStatusText(reason || 'Call Ended');

        // Return to dialer after a moment
        setTimeout(() => {
            // Clean up custom responses set by intercept
            if (this.currentCall) {
                const name = this.currentCall.name;
                if (this._callIntercepts[this.currentCall.number]?.responses ||
                    this._callIntercepts[name]?.responses) {
                    delete this._customResponses[name];
                }
            }
            this.currentCall = null;
            this.callDuration = 0;
            this.switchView('dialer');
            this.setLCDStatus('Ready');
            this._setStatusText('Ready');
            this._setLCDBacklit(false);
            this._hideCallerId();
            this.updateLCD();
            // Show normal buttons
            const btnCall = this.getElement('#btnCall');
            const btnClear = this.getElement('#btnClear');
            const btnHangup = this.getElement('#btnHangup');
            const btnHold = this.getElement('#btnHold');
            if (btnCall) btnCall.style.display = '';
            if (btnClear) btnClear.style.display = '';
            if (btnHangup) btnHangup.style.display = 'none';
            if (btnHold) btnHold.style.display = 'none';
        }, 2000);
    }

    toggleHold() {
        if (this.callState === 'connected') {
            this.callState = 'hold';
            this.updateCallStatus('ON HOLD');
            this._setStatusText('On Hold');
            if (this.callTimer) clearInterval(this.callTimer);
            this._stopCallAudio();
        } else if (this.callState === 'hold') {
            this.callState = 'connected';
            this.updateCallStatus('Connected');
            this._setStatusText('In Call');
            this.callTimer = setInterval(() => {
                this.callDuration++;
                this.updateCallTimerDisplay();
            }, 1000);
            // Resume audio if it was playing
            if (this.currentCall?.audioSrc) {
                this._playCallAudio(this.currentCall.audioSrc);
            }
        }
    }

    simulateIncoming(fromName, fromNumber, options = {}) {
        if (this.callState !== 'idle') return;

        const name = fromName || 'Unknown Caller';
        const number = fromNumber || '555-' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');

        this.callState = 'incoming';
        this.currentCall = {
            number, name, direction: 'incoming', startTime: null, messages: [],
            audioSrc: options.audioSrc || null,
            _incomingResponses: options.responses || null
        };
        this._ringCount = 0;

        // Show caller ID
        this._showCallerId(name, number);

        // Show incoming overlay
        const overlay = this.getElement('#incomingOverlay');
        const inName = this.getElement('#incomingName');
        const inNum = this.getElement('#incomingNumber');
        if (overlay) overlay.classList.add('visible');
        if (inName) inName.textContent = name;
        if (inNum) inNum.textContent = number;

        this._setStatusText('Incoming Call');
        this._setLCDBacklit(true);

        this.emitAppEvent('incoming', { number, name });
        this.playSound('notify');

        // Ring counter for answering machine
        this._ringInterval = setInterval(() => {
            this._ringCount++;
            this.playSound('notify');

            if (this.answeringMachineEnabled && this._ringCount >= this.answeringMachineRings) {
                if (this.callState === 'incoming') {
                    clearInterval(this._ringInterval);
                    this._ringInterval = null;
                    this._answeringMachinePickup();
                }
            }
        }, 3000);
    }

    _answeringMachinePickup() {
        // Auto-decline and leave voicemail
        const overlay = this.getElement('#incomingOverlay');
        if (overlay) overlay.classList.remove('visible');

        const responses = this.currentCall._incomingResponses ||
            this.botResponses[this.currentCall.name] ||
            this.botResponses['_default'];
        const msg = responses[Math.floor(Math.random() * responses.length)];

        this.voicemails.unshift({
            id: 'vm' + (++this._vmIdCounter),
            from: this.currentCall.name,
            number: this.currentCall.number,
            message: msg,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: 'Today',
            heard: false,
            audioSrc: null,
            duration: null
        });
        this.updateVmBadge();
        this.renderVoicemails();
        this._saveState();
        this.playSound('notify');
        this.emitAppEvent('voicemail', { from: this.currentCall.name, number: this.currentCall.number, message: msg });

        this.callState = 'idle';
        this.currentCall = null;
        this._setStatusText('New Voicemail');
        this._setLCDBacklit(false);
        this._hideCallerId();

        // Update AM display
        const amDisplay = this.getElement('#amDisplay');
        if (amDisplay) {
            amDisplay.textContent = `ANSWERING MACHINE - ${this.voicemails.length} message(s)`;
            amDisplay.classList.add('backlit');
            setTimeout(() => amDisplay.classList.remove('backlit'), 3000);
        }
    }

    answerCall() {
        if (this.callState !== 'incoming') return;

        // Stop ringing
        if (this._ringInterval) {
            clearInterval(this._ringInterval);
            this._ringInterval = null;
        }

        // Hide incoming overlay
        const overlay = this.getElement('#incomingOverlay');
        if (overlay) overlay.classList.remove('visible');

        // Set up custom responses if provided
        if (this.currentCall._incomingResponses) {
            this._customResponses[this.currentCall.name] = this.currentCall._incomingResponses;
        }

        this.showCallScreen(this.currentCall.name, this.currentCall.number, 'Connecting...');
        this.emitAppEvent('answered', { number: this.currentCall.number, name: this.currentCall.name });

        setTimeout(() => {
            this.connectCall();
        }, 500);
    }

    declineCall() {
        if (this.callState !== 'incoming') return;

        // Stop ringing
        if (this._ringInterval) {
            clearInterval(this._ringInterval);
            this._ringInterval = null;
        }

        const overlay = this.getElement('#incomingOverlay');
        if (overlay) overlay.classList.remove('visible');

        // Declined calls might leave voicemail
        if (this.currentCall) {
            const responses = this.currentCall._incomingResponses ||
                this.botResponses[this.currentCall.name] ||
                this.botResponses['_default'];

            if (Math.random() < 0.5) {
                this.voicemails.unshift({
                    id: 'vm' + (++this._vmIdCounter),
                    from: this.currentCall.name,
                    number: this.currentCall.number,
                    message: responses[Math.floor(Math.random() * responses.length)],
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    date: 'Today',
                    heard: false,
                    audioSrc: null,
                    duration: null
                });
                this.updateVmBadge();
                this.renderVoicemails();
                this.emitAppEvent('voicemail', {
                    from: this.currentCall.name,
                    number: this.currentCall.number
                });
            }
        }

        this.emitAppEvent('declined', {
            number: this.currentCall?.number,
            name: this.currentCall?.name
        });

        this.callState = 'idle';
        this.currentCall = null;
        this._setStatusText('Ready');
        this._setLCDBacklit(false);
        this._hideCallerId();
    }

    // ===== CALL AUDIO =====

    _playCallAudio(src) {
        this._stopCallAudio();
        this._activeCallAudio = src;
        this.playAudio(src, { volume: 0.7, loop: false });
        this.emitAppEvent('audioStarted', { src });
    }

    _stopCallAudio() {
        if (this._activeCallAudio) {
            this.stopAudio(this._activeCallAudio);
            this.emitAppEvent('audioEnded', { src: this._activeCallAudio });
            this._activeCallAudio = null;
        }
    }

    // ===== CALL SCREEN =====

    showCallScreen(name, number, status) {
        this.switchView('call');
        const callName = this.getElement('#callName');
        const callNumber = this.getElement('#callNumber');
        const callStatus = this.getElement('#callStatus');
        const callConvo = this.getElement('#callConversation');
        const callTimer = this.getElement('#callTimerDisplay');
        const callAvatar = this.getElement('#callAvatar');

        if (callName) callName.textContent = name;
        if (callNumber) callNumber.textContent = number;
        if (callStatus) callStatus.textContent = status;
        if (callConvo) callConvo.innerHTML = '';
        if (callTimer) callTimer.textContent = '00:00';
        if (callAvatar) callAvatar.textContent = name.charAt(0).toUpperCase();
    }

    updateCallStatus(text) {
        const el = this.getElement('#callStatus');
        if (el) el.textContent = text;
    }

    updateCallTimerDisplay() {
        const el = this.getElement('#callTimerDisplay');
        if (el) {
            const min = String(Math.floor(this.callDuration / 60)).padStart(2, '0');
            const sec = String(this.callDuration % 60).padStart(2, '0');
            el.textContent = `${min}:${sec}`;
        }
    }

    addCallMessage(who, text) {
        if (this.currentCall) {
            const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            this.currentCall.messages.push({ who, text, timestamp });
        }
        const convo = this.getElement('#callConversation');
        if (convo) {
            const div = document.createElement('div');
            div.className = `phone-call-msg ${who}`;
            if (who === 'them') {
                div.textContent = `\u260E ${text}`;
            } else if (who === 'you') {
                div.textContent = `\u{1F5E3} ${text}`;
            } else {
                div.textContent = text;
            }
            convo.appendChild(div);
            convo.scrollTop = convo.scrollHeight;
        }

        if (who === 'them') {
            this.emitAppEvent('messageReceived', {
                from: this.currentCall?.name,
                text,
                number: this.currentCall?.number
            });
        } else if (who === 'you') {
            this.emitAppEvent('messageSent', { text });
        }
    }

    scheduleBotResponse(delay) {
        if (this._botResponseTimeout) clearTimeout(this._botResponseTimeout);
        this._botResponseTimeout = setTimeout(() => {
            if (this.callState !== 'connected') return;
            const name = this.currentCall?.name;

            // Check for custom responses first, then default bot responses
            const responses = this._customResponses[name] ||
                this.botResponses[name] ||
                this.botResponses['_default'];
            const msg = responses[Math.floor(Math.random() * responses.length)];
            this.addCallMessage('them', msg);

            // Maybe schedule another response
            if (Math.random() < 0.4) {
                this.scheduleBotResponse(3000 + Math.random() * 5000);
            }
        }, delay || (2000 + Math.random() * 4000));
    }

    // ===== CONTACTS VIEW =====

    renderContacts() {
        const list = this.getElement('#contactsList');
        if (!list) return;

        if (this.contacts.length === 0) {
            list.innerHTML = '<div class="phone-list-empty">No contacts. Click Add to create one.</div>';
            return;
        }

        // Group contacts
        const groups = {};
        this.contacts.forEach((c, i) => {
            const g = c.group || 'Other';
            if (!groups[g]) groups[g] = [];
            groups[g].push({ ...c, _idx: i });
        });

        let html = '';
        for (const [groupName, members] of Object.entries(groups)) {
            html += `<div class="phone-group-header">${this._esc(groupName)} (${members.length})</div>`;
            html += members.map(c => `
                <div class="phone-list-item" data-contact-idx="${c._idx}">
                    <div class="phone-contact-status ${c.status || 'available'}"></div>
                    <div class="phone-list-info">
                        <div class="phone-list-name">${this._esc(c.name)}</div>
                        <div class="phone-list-number">${this._esc(c.number)}</div>
                    </div>
                    <div class="phone-list-meta">${this._statusLabel(c.status)}</div>
                </div>
            `).join('');
        }

        list.innerHTML = html;

        // Click to call
        this.getElements('.phone-list-item[data-contact-idx]').forEach(item => {
            this.addHandler(item, 'click', () => {
                const idx = parseInt(item.dataset.contactIdx);
                const contact = this.contacts[idx];
                if (contact) {
                    this.dialBuffer = contact.number;
                    this.switchView('dialer');
                    this.updateLCD();
                    this.dialNumber();
                }
            });
        });
    }

    _statusLabel(status) {
        switch (status) {
            case 'busy': return 'Busy';
            case 'away': return 'Away';
            case 'offline': return 'Offline';
            default: return '';
        }
    }

    _promptAddContact() {
        this.playSound('click');
        this.prompt('Enter contact name:', '', 'Add Contact').then(name => {
            if (!name) return;
            this.prompt('Enter phone number:', '', 'Add Contact').then(number => {
                if (!number) return;
                this.contacts.push({ name, number, status: 'available', group: 'Other' });
                this.renderContacts();
                this._saveState();
                this.playSound('notify');
                this.emitAppEvent('contactAdded', { name, number });
            });
        });
    }

    _sortContacts() {
        this.playSound('click');
        this.contacts.sort((a, b) => a.name.localeCompare(b.name));
        this.renderContacts();
        this._saveState();
    }

    // ===== HISTORY VIEW =====

    renderHistory() {
        const list = this.getElement('#historyList');
        if (!list) return;

        if (this.callHistory.length === 0) {
            list.innerHTML = '<div class="phone-list-empty">No call history yet.</div>';
            return;
        }

        list.innerHTML = this.callHistory.map((h, i) => {
            const icon = h.direction === 'outgoing' ? '\u{1F4E4}' :
                         h.reason === 'No Answer' || h.reason === 'Busy' ? '\u{1F4F5}' : '\u{1F4E5}';
            return `
                <div class="phone-list-item" data-history-idx="${i}">
                    <div class="phone-list-icon">${icon}</div>
                    <div class="phone-list-info">
                        <div class="phone-list-name">${this._esc(h.name)}</div>
                        <div class="phone-list-number">${this._esc(h.number)}${h.reason && h.reason !== 'Call Ended' ? ` - ${this._esc(h.reason)}` : ''}</div>
                    </div>
                    <div class="phone-list-meta">
                        ${this._esc(h.time)}<br>
                        ${this._formatDuration(h.duration)}
                    </div>
                </div>
            `;
        }).join('');

        // Click to redial
        this.getElements('.phone-list-item[data-history-idx]').forEach(item => {
            this.addHandler(item, 'click', () => {
                const idx = parseInt(item.dataset.historyIdx);
                const entry = this.callHistory[idx];
                if (entry) {
                    this.dialBuffer = entry.number;
                    this.switchView('dialer');
                    this.updateLCD();
                    this.dialNumber();
                }
            });
        });
    }

    // ===== VOICEMAIL VIEW =====

    renderVoicemails() {
        const list = this.getElement('#voicemailList');
        if (!list) return;

        // Update AM display
        const amDisplay = this.getElement('#amDisplay');
        if (amDisplay) {
            const unheard = this.voicemails.filter(vm => !vm.heard).length;
            amDisplay.textContent = unheard > 0
                ? `ANSWERING MACHINE - ${unheard} NEW message(s)`
                : `ANSWERING MACHINE - ${this.voicemails.length} message(s)`;
        }

        if (this.voicemails.length === 0) {
            list.innerHTML = '<div class="phone-list-empty">No voicemails.</div>';
            return;
        }

        list.innerHTML = this.voicemails.map((vm, i) => `
            <div class="phone-list-item phone-vm-row ${vm.heard ? 'is-heard' : 'is-unheard'}" data-vm-idx="${i}">
                <div class="phone-list-icon">${vm.heard ? '\u{1F4ED}' : '\u{1F4EC}'}</div>
                <div class="phone-list-info">
                    <div class="phone-list-name ${vm.heard ? 'phone-vm-heard' : 'phone-vm-unheard'}">${vm.heard ? '' : '<span class="phone-vm-new">NEW</span>'}${this._esc(vm.from)}</div>
                    <div class="phone-list-msg-preview">${this._esc(vm.message.substring(0, 60))}${vm.message.length > 60 ? '...' : ''}</div>
                </div>
                <div class="phone-list-meta">
                    ${this._esc(vm.time)}<br>${this._esc(vm.date || '')}
                    ${vm.audioSrc ? '<br>🔊' : ''}
                </div>
            </div>
        `).join('');

        // Click to open voicemail detail
        this.getElements('.phone-list-item[data-vm-idx]').forEach(item => {
            this.addHandler(item, 'click', () => {
                const idx = parseInt(item.dataset.vmIdx);
                this._openVoicemailDetail(idx);
            });
        });
    }

    _openVoicemailDetail(idx) {
        const vm = this.voicemails[idx];
        if (!vm) return;

        this._currentVmIdx = idx;
        if (!vm.heard) {
            vm.heard = true;
            this._saveState();
        }
        this.updateVmBadge();
        this.renderVoicemails();
        this.playSound('click');

        const from = this.getElement('#vmDetailFrom');
        const time = this.getElement('#vmDetailTime');
        const msg = this.getElement('#vmDetailMessage');
        const progressFill = this.getElement('#vmProgressFill');

        if (from) from.textContent = `From: ${vm.from} (${vm.number})`;
        if (time) time.textContent = `${vm.time} ${vm.date || ''}`;
        if (msg) msg.textContent = vm.message;
        if (progressFill) progressFill.style.width = '0%';

        this.switchView('vmDetail');
        this.emitAppEvent('voicemailPlayed', { id: vm.id, from: vm.from, number: vm.number });
    }

    _playCurrentVoicemail() {
        const vm = this.voicemails[this._currentVmIdx];
        if (!vm) return;

        if (vm.audioSrc) {
            // Play actual audio file
            this.playAudio(vm.audioSrc, { volume: 0.8 });
            // Animate progress bar over duration
            const dur = (vm.duration || 10) * 1000;
            const fill = this.getElement('#vmProgressFill');
            if (fill) {
                fill.style.transition = `width ${dur}ms linear`;
                fill.style.width = '100%';
            }
            this._vmPlaybackTimeout = setTimeout(() => {
                if (fill) {
                    fill.style.transition = 'none';
                    fill.style.width = '0%';
                }
            }, dur);
        } else {
            // Simulate text-to-speech by scrolling through message
            const fill = this.getElement('#vmProgressFill');
            const words = vm.message.split(' ').length;
            const dur = Math.max(3000, words * 400);
            if (fill) {
                fill.style.transition = `width ${dur}ms linear`;
                fill.style.width = '100%';
            }
            this._vmPlaybackTimeout = setTimeout(() => {
                if (fill) {
                    fill.style.transition = 'none';
                    fill.style.width = '0%';
                }
            }, dur);
        }
    }

    _stopVoicemailPlayback() {
        if (this._vmPlaybackTimeout) {
            clearTimeout(this._vmPlaybackTimeout);
            this._vmPlaybackTimeout = null;
        }
        const vm = this.voicemails[this._currentVmIdx];
        if (vm?.audioSrc) {
            this.stopAudio(vm.audioSrc);
        }
        const fill = this.getElement('#vmProgressFill');
        if (fill) {
            fill.style.transition = 'none';
            fill.style.width = '0%';
        }
    }

    _deleteCurrentVoicemail() {
        if (this._currentVmIdx != null && this._currentVmIdx < this.voicemails.length) {
            this.voicemails.splice(this._currentVmIdx, 1);
            this.updateVmBadge();
            this._saveState();
            this.playSound('click');
            this.switchView('voicemail');
        }
    }

    _callbackFromVoicemail() {
        const vm = this.voicemails[this._currentVmIdx];
        if (!vm) return;
        this.dialBuffer = vm.number;
        this.switchView('dialer');
        this.updateLCD();
        this.dialNumber();
    }

    updateVmBadge() {
        const badge = this.getElement('#vmBadge');
        const unheard = this.voicemails.filter(vm => !vm.heard).length;
        if (badge) {
            badge.style.display = unheard > 0 ? 'inline-flex' : 'none';
            badge.textContent = unheard;
        }
    }

    // ===== UTILITIES =====

    _formatDuration(seconds) {
        if (!seconds) return '0:00';
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    _esc(text) {
        // Quote-encoding included: _esc output is interpolated into
        // attributes (speed-dial title="...") as well as text content; the
        // textContent trick alone leaves quotes intact, enabling
        // attribute breakout.
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    _generateVmId() {
        return 'vm' + (++this._vmIdCounter);
    }

    // ===== SCRIPTING SUPPORT =====

    _registerScriptingCommands() {
        // === CALL COMMANDS ===

        this.registerCommand('dial', (payload) => {
            const number = payload.number || payload.value;
            if (!number) return { success: false, error: 'Number required' };
            if (this.callState !== 'idle') return { success: false, error: 'Phone is busy' };
            this.dialNumber(String(number));
            return { success: true, number, state: this.callState };
        });

        this.registerCommand('hangup', () => {
            if (this.callState === 'idle') return { success: false, error: 'No active call' };
            this.hangUp();
            return { success: true };
        });

        this.registerCommand('hold', () => {
            if (this.callState !== 'connected' && this.callState !== 'hold') {
                return { success: false, error: 'No active call to hold' };
            }
            this.toggleHold();
            return { success: true, state: this.callState };
        });

        this.registerCommand('answer', () => {
            if (this.callState !== 'incoming') return { success: false, error: 'No incoming call' };
            this.answerCall();
            return { success: true };
        });

        this.registerCommand('decline', () => {
            if (this.callState !== 'incoming') return { success: false, error: 'No incoming call' };
            this.declineCall();
            return { success: true };
        });

        // === CONTACT COMMANDS ===

        this.registerCommand('addContact', (payload) => {
            const name = payload.name;
            const number = payload.number;
            if (!name || !number) return { success: false, error: 'Name and number required' };
            if (this.contacts.find(c => c.number === number)) {
                return { success: false, error: 'Number already exists' };
            }
            const contact = {
                name,
                number: String(number),
                status: payload.status || 'available',
                group: payload.group || 'Other'
            };
            this.contacts.push(contact);
            this.renderContacts();
            this.emitAppEvent('contactAdded', { name, number, group: contact.group });
            return { success: true, contact };
        });

        this.registerCommand('removeContact', (payload) => {
            const name = payload.name;
            const number = payload.number;
            const idx = this.contacts.findIndex(c =>
                (name && c.name.toLowerCase() === name.toLowerCase()) ||
                (number && c.number === number)
            );
            if (idx === -1) return { success: false, error: 'Contact not found' };
            const removed = this.contacts.splice(idx, 1)[0];
            this.renderContacts();
            this.emitAppEvent('contactRemoved', { name: removed.name, number: removed.number });
            return { success: true, removed };
        });

        this.registerCommand('updateContact', (payload) => {
            const { name, number, newName, newNumber, newStatus, newGroup } = payload;
            const contact = name ? this.findContactByName(name) : this.findContactByNumber(number);
            if (!contact) return { success: false, error: 'Contact not found' };
            if (newName) contact.name = newName;
            if (newNumber) contact.number = newNumber;
            if (newStatus) contact.status = newStatus;
            if (newGroup) contact.group = newGroup;
            this.renderContacts();
            this.emitAppEvent('contactUpdated', { name: contact.name, number: contact.number });
            return { success: true, contact: { ...contact } };
        });

        this.registerCommand('clearContacts', () => {
            this.contacts = [];
            this.renderContacts();
            return { success: true };
        });

        // === VOICEMAIL COMMANDS ===

        this.registerCommand('sendVoicemail', (payload) => {
            const from = payload.from || 'Unknown';
            const message = payload.message || payload.text;
            if (!message) return { success: false, error: 'Message required' };
            const vm = {
                id: this._generateVmId(),
                from,
                number: payload.number || '555-0000',
                message,
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: 'Today',
                heard: false,
                audioSrc: payload.audioSrc || null,
                duration: payload.duration || null
            };
            this.voicemails.unshift(vm);
            this.updateVmBadge();
            this.renderVoicemails();
            this.emitAppEvent('voicemail', { id: vm.id, from, message, number: vm.number, hasAudio: !!vm.audioSrc });
            return { success: true, id: vm.id };
        });

        this.registerCommand('sendAudioVoicemail', (payload) => {
            const from = payload.from || 'Unknown';
            const audioSrc = payload.audioSrc || payload.src;
            if (!audioSrc) return { success: false, error: 'audioSrc required' };
            const vm = {
                id: this._generateVmId(),
                from,
                number: payload.number || '555-0000',
                message: payload.message || '(Audio message)',
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                date: 'Today',
                heard: false,
                audioSrc,
                duration: payload.duration || 10
            };
            this.voicemails.unshift(vm);
            this.updateVmBadge();
            this.renderVoicemails();
            this.emitAppEvent('voicemail', { id: vm.id, from, number: vm.number, hasAudio: true });
            return { success: true, id: vm.id };
        });

        this.registerCommand('deleteVoicemail', (payload) => {
            const id = payload.id;
            const idx = id ? this.voicemails.findIndex(vm => vm.id === id) :
                        (payload.index != null ? payload.index : -1);
            if (idx === -1 || idx >= this.voicemails.length) return { success: false, error: 'Voicemail not found' };
            this.voicemails.splice(idx, 1);
            this.updateVmBadge();
            this.renderVoicemails();
            return { success: true };
        });

        this.registerCommand('clearVoicemails', () => {
            this.voicemails = [];
            this.updateVmBadge();
            this.renderVoicemails();
            return { success: true };
        });

        // === INCOMING CALL SIMULATION ===

        this.registerCommand('simulateIncoming', (payload) => {
            if (this.callState !== 'idle') return { success: false, error: 'Phone is busy' };
            const from = payload.from || payload.callerName || 'Unknown';
            const number = payload.number || '555-0000';
            this.simulateIncoming(from, number, {
                audioSrc: payload.audioSrc,
                responses: payload.responses
            });
            return { success: true, from, number };
        });

        this.registerCommand('scheduleCall', (payload) => {
            const from = payload.from || 'Unknown';
            const number = payload.number || '555-0000';
            const delay = payload.delay || 5000;
            const id = 'sched_' + (++this._scheduleCounter);

            const timeoutId = setTimeout(() => {
                delete this._scheduledCalls[id];
                if (this.callState === 'idle') {
                    this.emitAppEvent('scheduledCallTriggered', { id, from, number });
                    this.simulateIncoming(from, number, {
                        audioSrc: payload.audioSrc,
                        responses: payload.responses
                    });
                }
            }, delay);

            this._scheduledCalls[id] = { timeoutId, from, number, delay };
            return { success: true, id };
        });

        this.registerCommand('cancelScheduledCall', (payload) => {
            const id = payload.id;
            if (!this._scheduledCalls[id]) return { success: false, error: 'Scheduled call not found' };
            clearTimeout(this._scheduledCalls[id].timeoutId);
            delete this._scheduledCalls[id];
            return { success: true };
        });

        // === CONVERSATION / RESPONSE SCRIPTING ===

        this.registerCommand('injectMessage', (payload) => {
            const who = payload.who || 'them';
            const text = payload.text || payload.message;
            if (!text) return { success: false, error: 'Text required' };
            if (this.callState !== 'connected' && this.callState !== 'hold') {
                return { success: false, error: 'No active call' };
            }
            this.addCallMessage(who, text);
            return { success: true };
        });

        this.registerCommand('setResponses', (payload) => {
            const name = payload.name || payload.contact;
            const responses = payload.responses;
            if (!name || !responses || !Array.isArray(responses)) {
                return { success: false, error: 'Name and responses array required' };
            }
            this._customResponses[name] = responses;
            return { success: true };
        });

        this.registerCommand('clearResponses', (payload) => {
            const name = payload.name || payload.contact;
            if (name) {
                delete this._customResponses[name];
            } else {
                this._customResponses = {};
            }
            return { success: true };
        });

        // === CALL OUTCOME SCRIPTING ===

        this.registerCommand('setCallOutcome', (payload) => {
            const key = payload.number || payload.name;
            const outcome = payload.outcome; // 'connect', 'busy', 'noAnswer', 'disconnected', 'operator'
            if (!key || !outcome) return { success: false, error: 'Number/name and outcome required' };
            this._callOutcomes[key] = outcome;
            return { success: true };
        });

        this.registerCommand('clearCallOutcome', (payload) => {
            const key = payload.number || payload.name;
            if (key) {
                delete this._callOutcomes[key];
            } else {
                this._callOutcomes = {};
            }
            return { success: true };
        });

        // === CALL INTERCEPTION ===

        this.registerCommand('interceptCall', (payload) => {
            const key = payload.number || payload.name;
            if (!key) return { success: false, error: 'Number or name required' };
            this._callIntercepts[key] = {
                outcome: payload.outcome || 'connect',
                message: payload.message,
                responses: payload.responses,
                audioSrc: payload.audioSrc,
                voicemail: payload.voicemail
            };
            return { success: true };
        });

        this.registerCommand('clearIntercept', (payload) => {
            const key = payload.number || payload.name;
            if (key) {
                delete this._callIntercepts[key];
            } else {
                this._callIntercepts = {};
            }
            return { success: true };
        });

        // === AUDIO COMMANDS ===

        this.registerCommand('playCallAudio', (payload) => {
            const src = payload.src || payload.audioSrc;
            if (!src) return { success: false, error: 'Audio source required' };
            if (this.callState !== 'connected') return { success: false, error: 'No active connected call' };
            this.currentCall.audioSrc = src;
            this._playCallAudio(src);
            return { success: true };
        });

        this.registerCommand('stopCallAudio', () => {
            this._stopCallAudio();
            return { success: true };
        });

        // === SPEED DIAL ===

        this.registerCommand('setSpeedDial', (payload) => {
            const slot = parseInt(payload.slot);
            if (!slot || slot < 1 || slot > 9) return { success: false, error: 'Slot must be 1-9' };
            if (!payload.name || !payload.number) return { success: false, error: 'Name and number required' };
            this.speedDial[slot] = { name: payload.name, number: payload.number };
            return { success: true };
        });

        this.registerCommand('clearSpeedDial', (payload) => {
            if (payload.slot) {
                delete this.speedDial[parseInt(payload.slot)];
            } else {
                this.speedDial = {};
            }
            return { success: true };
        });

        // === UI COMMANDS ===

        this.registerCommand('setText', (payload) => {
            const text = payload.text || '';
            const lcdNum = this.getElement('#lcdNumber');
            if (lcdNum) lcdNum.textContent = text;
            this._setLCDBacklit(!!text.trim());
            return { success: true };
        });

        this.registerCommand('setLCDStatus', (payload) => {
            this.setLCDStatus(payload.text || payload.status || '');
            return { success: true };
        });

        this.registerCommand('setView', (payload) => {
            const view = payload.view;
            if (!['dialer', 'contacts', 'history', 'voicemail'].includes(view)) {
                return { success: false, error: 'Invalid view' };
            }
            this.switchView(view);
            return { success: true };
        });

        // === CONFIGURATION ===

        this.registerCommand('setGreeting', (payload) => {
            this.answeringMachineGreeting = payload.greeting || payload.text || '';
            return { success: true };
        });

        this.registerCommand('setCallerIdEnabled', (payload) => {
            this.callerIdEnabled = payload.enabled !== false;
            return { success: true };
        });

        this.registerCommand('setAnsweringMachineEnabled', (payload) => {
            this.answeringMachineEnabled = payload.enabled !== false;
            if (payload.rings) this.answeringMachineRings = parseInt(payload.rings);
            return { success: true };
        });

        // === HISTORY ===

        this.registerCommand('clearHistory', () => {
            this.callHistory = [];
            this.renderHistory();
            return { success: true };
        });

        // === FULL RESET ===

        this.registerCommand('reset', () => {
            this.callHistory = [];
            this.voicemails = [];
            this._callIntercepts = {};
            this._callOutcomes = {};
            this._customResponses = {};
            for (const id of Object.keys(this._scheduledCalls)) {
                clearTimeout(this._scheduledCalls[id].timeoutId);
            }
            this._scheduledCalls = {};
            this.updateVmBadge();
            this.renderContacts();
            this.renderHistory();
            this.renderVoicemails();
            this.switchView('dialer');
            this.setLCDStatus('Ready');
            this._setStatusText('Ready');
            return { success: true };
        });

        // === QUERIES ===

        this.registerQuery('getStatus', () => {
            return {
                state: this.callState,
                view: this.currentView,
                contactCount: this.contacts.length,
                unheardVoicemails: this.voicemails.filter(vm => !vm.heard).length,
                totalVoicemails: this.voicemails.length,
                historyCount: this.callHistory.length,
                callerIdEnabled: this.callerIdEnabled,
                answeringMachineEnabled: this.answeringMachineEnabled,
                scheduledCalls: Object.keys(this._scheduledCalls).length,
                hasActiveAudio: !!this._activeCallAudio
            };
        });

        this.registerQuery('getCurrentCall', () => {
            if (!this.currentCall) return null;
            return {
                number: this.currentCall.number,
                name: this.currentCall.name,
                direction: this.currentCall.direction,
                state: this.callState,
                duration: this.callDuration,
                messages: this.currentCall.messages,
                hasAudio: !!this.currentCall.audioSrc
            };
        });

        this.registerQuery('getContacts', () => {
            return this.contacts.map(c => ({ ...c }));
        });

        this.registerQuery('getCallHistory', () => {
            return this.callHistory.map(h => ({ ...h }));
        });

        this.registerQuery('getVoicemails', () => {
            return this.voicemails.map(vm => ({ ...vm }));
        });

        this.registerQuery('getSpeedDial', () => {
            return { ...this.speedDial };
        });

        this.registerQuery('getTranscript', () => {
            if (!this.currentCall) return [];
            return this.currentCall.messages.map(m => ({ ...m }));
        });

        this.registerQuery('getGreeting', () => {
            return {
                greeting: this.answeringMachineGreeting,
                enabled: this.answeringMachineEnabled,
                rings: this.answeringMachineRings
            };
        });

        this.registerQuery('getConfig', () => {
            return {
                callerIdEnabled: this.callerIdEnabled,
                answeringMachineEnabled: this.answeringMachineEnabled,
                answeringMachineRings: this.answeringMachineRings,
                answeringMachineGreeting: this.answeringMachineGreeting,
                interceptCount: Object.keys(this._callIntercepts).length,
                outcomeOverrides: Object.keys(this._callOutcomes).length,
                customResponseCount: Object.keys(this._customResponses).length
            };
        });

        this.registerQuery('getScheduledCalls', () => {
            return Object.entries(this._scheduledCalls).map(([id, data]) => ({
                id,
                from: data.from,
                number: data.number,
                delay: data.delay
            }));
        });

        // === ARG ENHANCEMENTS ===

        // COMMAND: Set the entire botResponses map for a contact
        this.registerCommand('setBotResponses', (payload) => {
            const name = payload.name || payload.contact;
            const responses = payload.responses;
            if (!name || !responses || !Array.isArray(responses)) {
                return { success: false, error: 'Name and responses array required' };
            }
            this.botResponses[name] = responses;
            return { success: true, name };
        });

        // QUERY: Get current view name
        this.registerQuery('getView', () => {
            return { view: this.currentView || 'dialer' };
        });
    }
}

export default Phone;
