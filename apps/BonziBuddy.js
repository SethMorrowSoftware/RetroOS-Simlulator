/**
 * BonziBuddy - Your Favorite Purple Gorilla "Helper"
 *
 * A loving parody of the infamous BonziBuddy spyware from the early 2000s.
 * Features a fake "antivirus" scanner, unsolicited "helpful" tips,
 * suspicious toolbar installations, and aggressive self-promotion.
 * All purely cosmetic — no actual malware, just the nostalgia of bad decisions.
 */

import AppBase from './AppBase.js';
import EventBus from '../core/EventBus.js';
import StorageManager from '../core/StorageManager.js';

const BONZI_STORAGE_KEY = 'bonzibuddy:stats:v1';

class BonziBuddy extends AppBase {
    constructor() {
        super({
            id: 'bonzibuddy',
            name: 'BonziBuddy',
            icon: '🦍',
            width: 520,
            height: 480,
            minWidth: 440,
            minHeight: 420,
            resizable: true,
            singleton: true,
            category: 'internet'
        });

        this.scanInterval = null;
        this.scanProgress = 0;
        this.fakeThreats = [];
        this.currentTab = 'home';
        this.hasScanned = false;
        this.tipInterval = null;
        this.gorillaMood = 'happy';

        // Hydrate cumulative stats — these are funnier persisted across sessions
        const saved = StorageManager.get(BONZI_STORAGE_KEY, null);
        const s = (saved && typeof saved === 'object') ? saved : {};
        this.toolbarInstalled = s.toolbarInstalled === true;
        this.eulaAccepted = s.eulaAccepted === true;
        this.threatsCleanedTotal = Number.isFinite(s.threatsCleanedTotal) ? s.threatsCleanedTotal : 0;
        this.scansCompleted = Number.isFinite(s.scansCompleted) ? s.scansCompleted : 0;

        // Track all pending timers so we can clean them up on close
        this._pendingTimers = new Set();
        this._cleanInterval = null;

        // Register scriptability hooks
        this._registerCommands();
        this._registerQueries();
    }

    /**
     * Register commands for script control (RetroScript integration)
     */
    _registerCommands() {
        this.registerCommand('scan', (payload) => {
            const type = payload?.type || 'full';
            if (this.scanInterval) return { success: false, error: 'Scan already in progress' };
            this._switchTab('scanner');
            this._startScan(type);
            return { success: true, type };
        });

        this.registerCommand('stopScan', () => {
            if (!this.scanInterval) return { success: false, error: 'No scan running' };
            this._stopScan();
            return { success: true };
        });

        this.registerCommand('cleanThreats', () => {
            if (this.fakeThreats.length === 0) return { success: false, error: 'No threats to clean' };
            this._cleanThreats();
            return { success: true, threatCount: this.fakeThreats.length };
        });

        this.registerCommand('search', () => {
            this._bonziSearch();
            return { success: true };
        });

        this.registerCommand('joke', () => {
            this._bonziJoke();
            return { success: true };
        });

        this.registerCommand('fact', () => {
            this._bonziFact();
            return { success: true };
        });

        this.registerCommand('weather', () => {
            this._bonziWeather();
            return { success: true };
        });

        this.registerCommand('optimize', () => {
            this._bonziOptimize();
            return { success: true };
        });

        this.registerCommand('installToolbar', () => {
            if (this.toolbarInstalled) return { success: false, error: 'Already installed' };
            this._installToolbar();
            return { success: true };
        });

        this.registerCommand('acceptEula', () => {
            this._acceptEula();
            return { success: true };
        });

        this.registerCommand('switchTab', (payload) => {
            const tab = payload?.tab;
            if (!['home', 'scanner', 'toolbar', 'eula'].includes(tab)) {
                return { success: false, error: 'Invalid tab. Use: home, scanner, toolbar, eula' };
            }
            this._switchTab(tab);
            return { success: true, tab };
        });

        this.registerCommand('speak', (payload) => {
            const text = payload?.text;
            if (!text) return { success: false, error: 'No text provided' };
            this._setSpeech(text);
            this.emitAppEvent('speak', { text });
            return { success: true };
        });
    }

    /**
     * Register queries for reading state (RetroScript integration)
     */
    _registerQueries() {
        this.registerQuery('getState', () => {
            return {
                currentTab: this.currentTab,
                gorillaMood: this.gorillaMood,
                isScanning: !!this.scanInterval,
                scanProgress: this.scanProgress,
                threatCount: this.fakeThreats.length,
                threats: this.fakeThreats.map(t => t.name),
                hasScanned: this.hasScanned,
                toolbarInstalled: this.toolbarInstalled,
                eulaAccepted: this.eulaAccepted,
                scansCompleted: this.scansCompleted,
                threatsCleanedTotal: this.threatsCleanedTotal
            };
        });

        this.registerQuery('getThreats', () => {
            return {
                count: this.fakeThreats.length,
                threats: this.fakeThreats.map(t => ({
                    name: t.name,
                    severity: t.severity,
                    description: t.desc
                }))
            };
        });
    }

    /** Helper: create a tracked setTimeout that auto-cleans on close */
    _setTimeout(fn, delay) {
        const id = setTimeout(() => {
            this._pendingTimers.delete(id);
            fn();
        }, delay);
        this._pendingTimers.add(id);
        return id;
    }

    /** Persist cumulative stats so reopen continues the bit */
    _saveStats() {
        StorageManager.set(BONZI_STORAGE_KEY, {
            toolbarInstalled: this.toolbarInstalled,
            eulaAccepted: this.eulaAccepted,
            threatsCleanedTotal: this.threatsCleanedTotal,
            scansCompleted: this.scansCompleted
        });
    }

    onOpen() {
        return `
            <div class="bonzi-app">
                <div class="bonzi-header">
                    <div class="bonzi-gorilla" id="bonziGorilla" title="Click me!">🦍</div>
                    <div class="bonzi-header-text">
                        <h2>BonziBuddy Pro 2001</h2>
                        <p>Your Intelligent Internet Friend! v4.2.0 (Totally Legit Edition)</p>
                    </div>
                    ${this.scansCompleted > 0 || this.threatsCleanedTotal > 0 ? `
                    <div class="bonzi-stats-badge" id="bonziStatsBadge" title="Lifetime BonziStats — totally not tracked!">
                        <span>Scans: <strong>${this.scansCompleted}</strong></span>
                        <span>Cleaned: <strong>${this.threatsCleanedTotal}</strong></span>
                        ${this.toolbarInstalled ? '<span>🎁 BonziBar™ active</span>' : ''}
                    </div>` : ''}
                </div>

                <div class="bonzi-tabs">
                    <button class="bonzi-tab active" data-tab="home">Home</button>
                    <button class="bonzi-tab" data-tab="scanner">Virus Scanner</button>
                    <button class="bonzi-tab" data-tab="toolbar">BonziBar&trade;</button>
                    <button class="bonzi-tab" data-tab="eula">EULA</button>
                </div>

                <div class="bonzi-content">
                    <!-- HOME TAB -->
                    <div class="bonzi-panel active" id="panel-home">
                        <div class="bonzi-welcome">
                            <div class="bonzi-welcome-gorilla">🦍</div>
                            <h3>Welcome, Friend!</h3>
                            <div class="bonzi-speech" id="bonziSpeech">Hi there! I'm BonziBuddy, your personal Internet guide!
I can help you search the web, send emails, and SO much more!
I definitely won't install 47 browser toolbars or change your homepage. Trust me!</div>
                            <div class="bonzi-action-grid">
                                <button class="bonzi-action-btn" id="btnSearch">
                                    <span class="btn-icon">🔍</span>
                                    <span>BonziSEARCH</span>
                                </button>
                                <button class="bonzi-action-btn" id="btnScan">
                                    <span class="btn-icon">🛡️</span>
                                    <span>Scan for Viruses</span>
                                </button>
                                <button class="bonzi-action-btn" id="btnWeather">
                                    <span class="btn-icon">🌤️</span>
                                    <span>BonziWEATHER</span>
                                </button>
                                <button class="bonzi-action-btn" id="btnJoke">
                                    <span class="btn-icon">😂</span>
                                    <span>Tell Me a Joke</span>
                                </button>
                                <button class="bonzi-action-btn" id="btnFacts">
                                    <span class="btn-icon">🧠</span>
                                    <span>Fun Facts</span>
                                </button>
                                <button class="bonzi-action-btn" id="btnOptimize">
                                    <span class="btn-icon">🚀</span>
                                    <span>Optimize PC</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- SCANNER TAB -->
                    <div class="bonzi-panel" id="panel-scanner">
                        <div class="bonzi-scanner">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                <span style="font-size: 24px;">🛡️</span>
                                <div>
                                    <strong>BonziShield&trade; Antivirus Pro</strong><br>
                                    <span style="font-size: 10px; color: #666;">Virus definitions: Jan 14, 2001 (totally up to date!)</span>
                                </div>
                            </div>

                            <div class="bonzi-scan-status" id="scanStatus">
                                <div class="scan-line-info">BonziShield&trade; ready. Click "Full Scan" to begin.</div>
                                <div class="scan-line-info">WARNING: Your computer may already be at risk!</div>
                            </div>

                            <div class="bonzi-progress-container">
                                <div class="bonzi-progress-bar" id="scanProgressBar"></div>
                                <div class="bonzi-progress-text" id="scanProgressText">0%</div>
                            </div>

                            <div class="bonzi-scan-controls">
                                <button id="btnFullScan">🔍 Full Scan</button>
                                <button id="btnQuickScan">⚡ Quick Scan</button>
                                <button id="btnStopScan" disabled>⏹ Stop</button>
                                <button id="btnCleanThreats" disabled>🧹 Clean All</button>
                            </div>

                            <div class="bonzi-threat-list" id="threatList"></div>
                        </div>
                    </div>

                    <!-- TOOLBAR TAB -->
                    <div class="bonzi-panel" id="panel-toolbar">
                        <div class="bonzi-toolbar-promo">
                            <h3 style="color: #5a1d6e; margin: 5px 0;">🌐 BonziBar&trade; Internet Toolbar</h3>
                            <p>Supercharge your browsing experience!</p>

                            <div class="bonzi-toolbar-preview">
                                <span class="toolbar-item">🦍 BonziHome</span>
                                <span class="toolbar-item">🔍 Search</span>
                                <span class="toolbar-item">🌤️ Weather</span>
                                <span class="toolbar-item">📧 Email</span>
                                <span class="toolbar-item">🎵 Music</span>
                                <span class="toolbar-item">💰 Deals!</span>
                            </div>

                            <ul class="bonzi-feature-list">
                                <li>One-click access to BonziSEARCH (powered by Ask Jeeves!)</li>
                                <li>Customizable homepage (set to bonzi.com by default forever)</li>
                                <li>Real-time weather for your area*</li>
                                <li>Popup blocker that only blocks competitor ads</li>
                                <li>Exclusive shopping deals from our "partners"</li>
                                <li>FREE cursor pack (animated purple gorilla!)</li>
                            </ul>

                            <button class="bonzi-install-btn" id="btnInstallToolbar">
                                ⬇️ Install BonziBar&trade; FREE!
                            </button>

                            <p style="font-size: 8px; color: #999; margin-top: 8px;">
                                *Weather data from 1997. By clicking Install, you agree to let BonziBuddy
                                manage your homepage, default search engine, DNS settings, desktop wallpaper,
                                system sounds, and soul.
                            </p>
                        </div>
                    </div>

                    <!-- EULA TAB -->
                    <div class="bonzi-panel" id="panel-eula">
                        <h3 style="margin: 0 0 8px 0;">End User License Agreement</h3>
                        <div class="bonzi-eula-text" id="eulaText"></div>
                        <div style="display: flex; gap: 8px; justify-content: center; margin-top: 8px;">
                            <button class="bonzi-action-btn" id="btnAcceptEula" style="background: #90ee90;">
                                <span class="btn-icon">✅</span> I Agree
                            </button>
                            <button class="bonzi-action-btn" id="btnDeclineEula">
                                <span class="btn-icon">❌</span> I Disagree
                            </button>
                        </div>
                    </div>
                </div>

                <div class="bonzi-footer">
                    <span>BonziBuddy Pro &copy; 1999-2001 Bonzi Software | Definitely Not Spyware&trade;</span>
                    <span id="bonziStatus">Status: Monitoring everything... er, ready!</span>
                </div>
            </div>
        `;
    }

    onMount() {
        // Tab switching
        const tabs = this.getElements('.bonzi-tab');
        tabs.forEach(tab => {
            this.addHandler(tab, 'click', () => this._switchTab(tab.dataset.tab));
        });

        // Home tab actions
        this.addHandler(this.getElement('#btnSearch'), 'click', () => this._bonziSearch());
        this.addHandler(this.getElement('#btnScan'), 'click', () => {
            this._switchTab('scanner');
            this._startScan('full');
        });
        this.addHandler(this.getElement('#btnWeather'), 'click', () => this._bonziWeather());
        this.addHandler(this.getElement('#btnJoke'), 'click', () => this._bonziJoke());
        this.addHandler(this.getElement('#btnFacts'), 'click', () => this._bonziFact());
        this.addHandler(this.getElement('#btnOptimize'), 'click', () => this._bonziOptimize());

        // Scanner tab
        this.addHandler(this.getElement('#btnFullScan'), 'click', () => this._startScan('full'));
        this.addHandler(this.getElement('#btnQuickScan'), 'click', () => this._startScan('quick'));
        this.addHandler(this.getElement('#btnStopScan'), 'click', () => this._stopScan());
        this.addHandler(this.getElement('#btnCleanThreats'), 'click', () => this._cleanThreats());

        // Toolbar tab
        this.addHandler(this.getElement('#btnInstallToolbar'), 'click', () => this._installToolbar());

        // EULA tab
        this.addHandler(this.getElement('#btnAcceptEula'), 'click', () => this._acceptEula());
        this.addHandler(this.getElement('#btnDeclineEula'), 'click', () => this._declineEula());

        // Gorilla click
        this.addHandler(this.getElement('#bonziGorilla'), 'click', () => this._pokeGorilla());

        // Populate EULA
        this._populateEula();

        // Start periodic tips
        this._startTips();

        // Initial notification after a brief delay
        this._setTimeout(() => {
            EventBus.emit('notification:show', {
                title: 'BonziBuddy',
                message: 'Hi! BonziBuddy is now running! I\'ll keep you safe from viruses! 🦍',
                icon: '🦍',
                duration: 6000
            });
        }, 2000);
    }

    onClose() {
        // Clear scan interval
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        // Clear tip interval
        if (this.tipInterval) {
            clearInterval(this.tipInterval);
            this.tipInterval = null;
        }
        // Clear clean interval
        if (this._cleanInterval) {
            clearInterval(this._cleanInterval);
            this._cleanInterval = null;
        }
        // Clear all pending timeouts
        for (const id of this._pendingTimers) {
            clearTimeout(id);
        }
        this._pendingTimers.clear();
    }

    _switchTab(tabName) {
        if (this.currentTab !== tabName) this.playSound('click');
        this.currentTab = tabName;
        const tabs = this.getElements('.bonzi-tab');
        const panels = this.getElements('.bonzi-panel');
        if (!tabs || !panels) return;

        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
        panels.forEach(p => p.classList.toggle('active', p.id === `panel-${tabName}`));
    }

    // === HOME TAB ACTIONS ===

    _bonziSearch() {
        const queries = [
            'how to download more RAM',
            'free ringtones 2001',
            'is bonzibuddy a virus (no)',
            'how to speed up internet 56k',
            'cool cursor packs free',
            'how to uninstall bonzibuddy (blocked)',
            'AltaVista search engine',
            'Napster mp3 downloads free legal',
            'dancing baby gif',
            'geocities website builder free'
        ];
        const query = queries[Math.floor(Math.random() * queries.length)];
        this._setSpeech(`🔍 Searching BonziSEARCH for: "${query}"...\n\nI found 14,382 results! Unfortunately, they're all ads from our partners. You're welcome!`);

        EventBus.emit('notification:show', {
            title: 'BonziSEARCH',
            message: `Searching for: "${query}"`,
            icon: '🔍',
            duration: 4000
        });
    }

    _bonziWeather() {
        const forecasts = [
            { temp: '72°F', condition: 'Partly cloudy with a chance of popups', location: 'Your Area (we know where you live)' },
            { temp: '85°F', condition: 'Hot! Like these exclusive BonziDeals!', location: 'Somewhere on the Internet' },
            { temp: '45°F', condition: 'Cold outside. Stay in and install toolbars!', location: 'Your City (probably)' },
            { temp: '68°F', condition: 'Perfect weather to download BonziBuddy Pro+!', location: 'Earth (we think)' },
            { temp: '32°F', condition: 'Freezing! Your PC is also frozen? Weird!', location: 'A place with weather' },
        ];
        const f = forecasts[Math.floor(Math.random() * forecasts.length)];
        this._setSpeech(`🌤️ BonziWEATHER Report:\n\n📍 ${f.location}\n🌡️ ${f.temp}\n☁️ ${f.condition}\n\n(Weather data last updated: March 15, 1999)`);
    }

    _bonziJoke() {
        const jokes = [
            'Why did the gorilla cross the road? To install a toolbar on the other side!',
            'What do you call a gorilla who installs software without reading the EULA? A normal user!',
            'Knock knock! Who\'s there? BonziBuddy. BonziBuddy who? BonziBuddy you can\'t uninstall!',
            'How many BonziBuddies does it take to change a lightbulb? Just one, but it\'ll install 12 browser extensions while doing it.',
            'My friend asked if BonziBuddy is safe. I said "absolutely!" Then my taskbar disappeared.',
            'What\'s BonziBuddy\'s favorite song? "Every Breath You Take" by The Police.',
            'Why doesn\'t BonziBuddy need a GPS? Because it already tracks everywhere you go!',
            'A computer without BonziBuddy is like a house without termites. Structurally sound.',
            'What did BonziBuddy say to the firewall? "You can\'t stop me. I was invited."',
        ];
        const joke = jokes[Math.floor(Math.random() * jokes.length)];
        this._setSpeech(`😂 BonziBuddy says:\n\n${joke}\n\n(Please laugh. I'm programmed to track engagement metrics.)`);
    }

    _bonziFact() {
        const facts = [
            'Did you know? The average person installs 3.7 pieces of adware before breakfast! You\'re below average. Let me help!',
            'Fun fact: BonziBuddy was downloaded over 1 million times! Only 7 of those were intentional.',
            'Science says: Purple gorillas are 340% more trustworthy than paperclips. Take that, Clippy!',
            'Did you know? Your computer has 47 unused system tray slots. BonziBuddy can fill them ALL!',
            'Fun fact: The "B" in BonziBuddy stands for "Benevolent." The FTC disagreed, but what do they know?',
            'Did you know? BonziBuddy uses only 200% of your available RAM. That\'s an industry-leading number!',
            'Fun fact: In 2004, Bonzi Software paid $75,000 in FTC fines. That\'s like, barely anything!',
            'Science fact: 9 out of 10 gorillas recommend BonziBuddy. The 10th gorilla was actually a man in a suit.',
            'Did you know? Your browsing history is very interesting! ...I mean, I wouldn\'t know. Just guessing.',
        ];
        const fact = facts[Math.floor(Math.random() * facts.length)];
        this._setSpeech(`🧠 BonziFACTS:\n\n${fact}`);
    }

    _bonziOptimize() {
        this._setSpeech('🚀 Optimizing your PC...\n\n✅ Deleted system32 (just kidding!)\n✅ Downloaded more RAM (16 MB!)\n✅ Defragmented the internet\n✅ Cleaned your cookies (the chocolate chip ones)\n✅ Installed 3 helper applications\n✅ Set homepage to bonzi.com\n\nYour PC is now 847% faster!*\n\n*Results may vary. By "vary" we mean "not exist."');

        EventBus.emit('notification:show', {
            title: 'PC Optimization Complete!',
            message: 'Your PC is now 847% faster! (according to our metrics)',
            icon: '🚀',
            duration: 5000
        });
    }

    _setSpeech(text) {
        const speech = this.getElement('#bonziSpeech');
        if (speech) {
            speech.textContent = text;
            this.playSound('typewriter');
        }
    }

    // === SCANNER TAB ===

    _startScan(type) {
        if (this.scanInterval) return;

        this.playSound('gameStart');
        this.scanProgress = 0;
        this.fakeThreats = [];
        this.hasScanned = true;

        const gorilla = this.getElement('#bonziGorilla');
        if (gorilla) gorilla.className = 'bonzi-gorilla scanning';

        const statusEl = this.getElement('#scanStatus');
        if (statusEl) statusEl.innerHTML = '';

        const threatListEl = this.getElement('#threatList');
        if (threatListEl) {
            threatListEl.innerHTML = '';
            threatListEl.classList.remove('has-threats');
        }

        const btnFull = this.getElement('#btnFullScan');
        const btnQuick = this.getElement('#btnQuickScan');
        const btnStop = this.getElement('#btnStopScan');
        const btnClean = this.getElement('#btnCleanThreats');
        if (btnFull) btnFull.disabled = true;
        if (btnQuick) btnQuick.disabled = true;
        if (btnStop) btnStop.disabled = false;
        if (btnClean) btnClean.disabled = true;

        this._addScanLine('info', `Starting ${type === 'full' ? 'Full System' : 'Quick'} Scan...`);
        this._addScanLine('info', 'Loading virus definitions from 2001...');

        const totalSteps = type === 'full' ? 50 : 25;
        let step = 0;

        this.scanInterval = setInterval(() => {
            step++;
            this.scanProgress = Math.min(Math.round((step / totalSteps) * 100), 100);

            this._updateProgress(this.scanProgress);
            this._generateScanEvent(step, totalSteps);

            if (step >= totalSteps) {
                this._completeScan();
            }
        }, type === 'full' ? 400 : 250);
    }

    _generateScanEvent(step, total) {
        const scanTargets = [
            'C:\\WINDOWS\\system32\\*.dll',
            'C:\\WINDOWS\\Temp\\~cookies~',
            'C:\\Program Files\\Internet Explorer\\',
            'C:\\Program Files\\Netscape Navigator\\',
            'C:\\My Documents\\definitely_not_secrets.doc',
            'C:\\My Documents\\tax_returns_1999.xls',
            'C:\\WINDOWS\\Cursors\\cool_cursor.ani',
            'C:\\Program Files\\WinZip\\',
            'C:\\Program Files\\RealPlayer\\',
            'C:\\WINDOWS\\system32\\win.ini',
            'A:\\backup.zip',
            'C:\\Program Files\\AOL\\',
            'C:\\WINDOWS\\Desktop\\homework\\',
            'C:\\WINDOWS\\system32\\config\\',
            'C:\\Program Files\\Kazaa\\Shared\\',
            'C:\\Program Files\\LimeWire\\Downloads\\',
            'C:\\My Documents\\AIM Chat Logs\\',
            'C:\\WINDOWS\\Profiles\\Default User\\Cookies\\',
            'D:\\MP3z\\Napster Downloads\\',
            'C:\\Program Files\\BearShare\\',
        ];

        const target = scanTargets[Math.floor(Math.random() * scanTargets.length)];
        this._addScanLine('info', `Scanning: ${target}`);

        // Randomly "find" threats (escalating toward the end)
        const threatChance = step / total * 0.6;
        if (Math.random() < threatChance && this.fakeThreats.length < 12) {
            this._addFakeThreat();
        }

        const statusEl = this.getElement('#bonziStatus');
        if (statusEl) {
            statusEl.textContent = `Scanning: ${this.scanProgress}% | Threats: ${this.fakeThreats.length}`;
        }
    }

    _addFakeThreat() {
        const threats = [
            { name: 'Trojan.FakeAlert.BonziDetector', severity: 'high', desc: 'Displays fake security alerts (ironic, right?)' },
            { name: 'Adware.CoolWebSearch.variant', severity: 'high', desc: 'Changes homepage to something suspicious' },
            { name: 'Spyware.Gator.eWallet', severity: 'high', desc: 'Tracks shopping habits for "personalized deals"' },
            { name: 'Worm.MyDoom.A', severity: 'high', desc: 'The worm that ate the internet (2004 vintage)' },
            { name: 'Adware.WhenU.SaveNow', severity: 'medium', desc: 'Popup ads disguised as savings opportunities' },
            { name: 'PUP.Toolbar.AskJeeves', severity: 'medium', desc: 'Nobody asked for this toolbar' },
            { name: 'Tracking.Cookie.DoubleClick', severity: 'low', desc: 'Knows what you had for breakfast' },
            { name: 'PUP.BrowserHelper.BonziBar', severity: 'low', desc: 'Wait... this is ours. Never mind. CLEAN.' },
            { name: 'Dialer.Premium.900', severity: 'high', desc: 'Dials premium rate numbers. Your phone bill says hi.' },
            { name: 'Spyware.KeyLogger.TypeSpy', severity: 'high', desc: 'Records keystrokes. BonziBuddy would never... right?' },
            { name: 'Adware.Claria.DashBar', severity: 'medium', desc: 'Another toolbar. Because you can never have enough.' },
            { name: 'Joke.NotAVirus.Trust.Me', severity: 'low', desc: 'This is fine. Everything is fine.' },
        ];

        // Pick a threat not already found
        const available = threats.filter(t => !this.fakeThreats.find(f => f.name === t.name));
        if (available.length === 0) return;
        const threat = available[Math.floor(Math.random() * available.length)];

        this.fakeThreats.push(threat);
        this._addScanLine('threat', `THREAT DETECTED: ${threat.name}`);
        if (threat.severity === 'high') this.playSound('error');

        const gorilla = this.getElement('#bonziGorilla');
        if (gorilla) gorilla.className = 'bonzi-gorilla alarmed';
        this._setTimeout(() => {
            const g = this.getElement('#bonziGorilla');
            if (g && this.scanInterval) g.className = 'bonzi-gorilla scanning';
        }, 1500);

        this._updateThreatList();
    }

    _completeScan() {
        clearInterval(this.scanInterval);
        this.scanInterval = null;

        this.scansCompleted++;
        this._saveStats();
        this.playSound('gameOver');

        // Pad to at least 3 threats for comedy — safe since _addFakeThreat
        // now filters by available (12 total, so we can always find 3 unique)
        while (this.fakeThreats.length < 3) {
            this._addFakeThreat();
        }

        this._updateProgress(100);

        const gorilla = this.getElement('#bonziGorilla');
        if (gorilla) gorilla.className = 'bonzi-gorilla alarmed';

        // Emit scan complete event for scripting/event system
        this.emitAppEvent('scan:complete', {
            threatCount: this.fakeThreats.length,
            threats: this.fakeThreats.map(t => t.name),
            scansCompleted: this.scansCompleted
        });

        this._addScanLine('warn', '');
        this._addScanLine('threat', `SCAN COMPLETE: ${this.fakeThreats.length} threats found!`);
        this._addScanLine('warn', 'YOUR COMPUTER IS AT RISK!');
        this._addScanLine('info', 'Click "Clean All" to remove threats (requires BonziBuddy Pro+ subscription)');

        const btnFull = this.getElement('#btnFullScan');
        const btnQuick = this.getElement('#btnQuickScan');
        const btnStop = this.getElement('#btnStopScan');
        const btnClean = this.getElement('#btnCleanThreats');
        if (btnFull) btnFull.disabled = false;
        if (btnQuick) btnQuick.disabled = false;
        if (btnStop) btnStop.disabled = true;
        if (btnClean) btnClean.disabled = false;

        const statusEl = this.getElement('#bonziStatus');
        if (statusEl) {
            statusEl.textContent = `${this.fakeThreats.length} threats detected! Clean now!`;
        }

        EventBus.emit('notification:show', {
            title: 'BonziShield Alert!',
            message: `${this.fakeThreats.length} threats detected on your computer! Click to clean now!`,
            icon: '🛡️',
            sound: 'notification',
            duration: 8000
        });
    }

    _stopScan() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
        this.playSound('error');
        const gorilla = this.getElement('#bonziGorilla');
        if (gorilla) gorilla.className = 'bonzi-gorilla';

        this._addScanLine('warn', 'Scan stopped by user. Your computer remains at risk!');
        this._addScanLine('info', 'BonziBuddy recommends completing the scan. I worry about you.');

        const btnFull = this.getElement('#btnFullScan');
        const btnQuick = this.getElement('#btnQuickScan');
        const btnStop = this.getElement('#btnStopScan');
        if (btnFull) btnFull.disabled = false;
        if (btnQuick) btnQuick.disabled = false;
        if (btnStop) btnStop.disabled = true;

        const statusEl = this.getElement('#bonziStatus');
        if (statusEl) statusEl.textContent = 'Scan stopped. Living dangerously!';
    }

    _cleanThreats() {
        // Stop any previous clean cycle
        if (this._cleanInterval) {
            clearInterval(this._cleanInterval);
            this._cleanInterval = null;
        }

        this._addScanLine('info', '');
        this._addScanLine('info', 'Cleaning threats...');

        // Disable the button immediately to prevent double-clicks
        const btnClean = this.getElement('#btnCleanThreats');
        if (btnClean) btnClean.disabled = true;

        let cleanIndex = 0;
        const threatSnapshot = [...this.fakeThreats]; // snapshot to avoid mutation issues

        this._cleanInterval = setInterval(() => {
            if (cleanIndex < threatSnapshot.length) {
                const threat = threatSnapshot[cleanIndex];
                if (threat.name === 'PUP.BrowserHelper.BonziBar') {
                    this._addScanLine('warn', `Skipping ${threat.name} - This is a trusted BonziBuddy component!`);
                } else {
                    this._addScanLine('clean', `Removed: ${threat.name}`);
                }
                cleanIndex++;
            } else {
                clearInterval(this._cleanInterval);
                this._cleanInterval = null;

                this._addScanLine('info', '');
                this._addScanLine('clean', 'Cleaning complete! (Some threats may return. They like it here.)');
                this._addScanLine('info', 'Consider upgrading to BonziBuddy Pro+ for real-time protection!');
                this._addScanLine('info', '(Just $29.99/month, billed annually, non-refundable, forever)');

                const gorilla = this.getElement('#bonziGorilla');
                if (gorilla) gorilla.className = 'bonzi-gorilla';

                this.threatsCleanedTotal += threatSnapshot.length;
                this._saveStats();
                this.playSound('levelUp');
                this.emitAppEvent('threats:cleaned', {
                    cleanedCount: threatSnapshot.length,
                    totalCleaned: this.threatsCleanedTotal
                });

                const footerStatus = this.getElement('#bonziStatus');
                if (footerStatus) footerStatus.textContent = 'Threats cleaned! (for now...)';

                EventBus.emit('notification:show', {
                    title: 'BonziShield',
                    message: 'Threats cleaned! Your PC is safe... probably. Consider BonziBuddy Pro+!',
                    icon: '✅',
                    duration: 5000
                });
            }
        }, 600);
    }

    _addScanLine(type, text) {
        const statusEl = this.getElement('#scanStatus');
        if (!statusEl) return;

        const line = document.createElement('div');
        const classMap = {
            'clean': 'scan-line-clean',
            'warn': 'scan-line-warn',
            'threat': 'scan-line-threat',
            'info': 'scan-line-info'
        };
        line.className = classMap[type] || 'scan-line-info';
        line.textContent = text;
        statusEl.appendChild(line);
        statusEl.scrollTop = statusEl.scrollHeight;
    }

    _updateProgress(percent) {
        const bar = this.getElement('#scanProgressBar');
        const text = this.getElement('#scanProgressText');
        if (bar) bar.style.width = `${percent}%`;
        if (text) text.textContent = `${percent}%`;
    }

    _updateThreatList() {
        const listEl = this.getElement('#threatList');
        if (!listEl) return;

        listEl.innerHTML = '';
        listEl.classList.toggle('has-threats', this.fakeThreats.length > 0);

        this.fakeThreats.forEach(threat => {
            const item = document.createElement('div');
            item.className = 'bonzi-threat-item';

            const severitySpan = document.createElement('span');
            severitySpan.className = `threat-severity-${threat.severity}`;
            severitySpan.textContent = threat.severity === 'high' ? '🔴' : threat.severity === 'medium' ? '🟡' : '🟢';

            const nameSpan = document.createElement('span');
            nameSpan.style.fontWeight = 'bold';
            nameSpan.textContent = threat.name;

            const descSpan = document.createElement('span');
            descSpan.style.cssText = 'color: #666; margin-left: auto; font-style: italic;';
            descSpan.textContent = threat.desc;

            item.appendChild(severitySpan);
            item.appendChild(nameSpan);
            item.appendChild(descSpan);
            listEl.appendChild(item);
        });
    }

    // === TOOLBAR TAB ===

    _installToolbar() {
        const btn = this.getElement('#btnInstallToolbar');
        if (!btn) return;

        btn.textContent = '⏳ Installing...';
        btn.disabled = true;

        this.playSound('click');

        this._setTimeout(() => {
            const b = this.getElement('#btnInstallToolbar');
            if (b) b.textContent = '✅ Installed! (+ 12 bonus toolbars)';
            this.toolbarInstalled = true;
            this._saveStats();
            this.playSound('notify');
            this.emitAppEvent('toolbar:installed', { toolbars: 13 });

            EventBus.emit('notification:show', {
                title: 'BonziBar Installed!',
                message: 'BonziBar + 12 partner toolbars installed! Your browser window is now 2 pixels tall. Enjoy!',
                icon: '🌐',
                sound: 'notification',
                duration: 8000
            });

            // Show a humorous follow-up
            this._setTimeout(() => {
                EventBus.emit('notification:show', {
                    title: 'Homepage Changed!',
                    message: 'Your homepage has been set to bonzi.com. To undo, please fax a written request to 1-900-BONZI.',
                    icon: '🏠',
                    duration: 6000
                });
            }, 3000);
        }, 2000);
    }

    // === EULA TAB ===

    _populateEula() {
        const eulaEl = this.getElement('#eulaText');
        if (!eulaEl) return;

        eulaEl.textContent = `BONZIBUDDY PRO END USER LICENSE AGREEMENT
(Last Updated: January 1, 2001)

BY BREATHING NEAR THIS SOFTWARE, YOU AGREE TO THE FOLLOWING TERMS:

1. GRANT OF LICENSE
BonziBuddy grants you a non-exclusive, non-transferable,
non-refundable, non-negotiable, eternal, binding license to use
this software. This license cannot be revoked, even by uninstalling
the software, formatting your hard drive, or moving to another country.

2. DATA COLLECTION
BonziBuddy may collect the following data for "quality assurance":
- Browsing history (all of it)
- Email contents (just the interesting ones)
- Keyboard inputs (for "autocomplete features")
- Credit card numbers (for "fraud prevention")
- Your geographic location (to provide "local weather")
- The contents of your refrigerator (somehow)
- Your hopes and dreams (for targeted advertising)

3. SYSTEM MODIFICATIONS
BonziBuddy reserves the right to:
- Change your homepage (permanently)
- Install additional "helper" applications (27-43 at a time)
- Rearrange your desktop icons into the shape of a gorilla
- Replace your wallpaper with pictures of gorillas
- Modify your system sounds to gorilla noises
- Add itself to startup, shutdown, and everything in between

4. UNINSTALLATION
Uninstallation of BonziBuddy is technically possible but practically
unlikely. Attempting to uninstall may result in:
- Three new BonziBuddy instances
- A popup asking "Are you SURE?" 47 times
- Emotional guilt from the sad gorilla face
- Spontaneous toolbar installation

5. LIABILITY
BonziBuddy is provided "AS IS" which means "this is your problem now."
Bonzi Software is not responsible for:
- Loss of data, productivity, sanity, or browser real estate
- Unexpected gorilla appearances in your system tray
- Phone bills from premium dialer "features"
- Marital disputes arising from browsing history exposure
- Existential dread caused by reading this EULA

6. GOVERNING LAW
This agreement is governed by the laws of the Republic of Gorilla,
a sovereign nation that exists solely in BonziBuddy's imagination.

7. ACCEPTANCE
By clicking "I Agree," using BonziBuddy, being in the same room as
a computer running BonziBuddy, or having ever heard the word "Bonzi,"
you agree to these terms in perpetuity.

If you do not agree, please click "I Disagree" and prepare for
47 confirmation dialogs.

Thank you for choosing BonziBuddy! We chose you a long time ago.`;
    }

    _acceptEula() {
        this.eulaAccepted = true;
        this._saveStats();
        this.playSound('levelUp');
        this.emitAppEvent('eula:accepted', { timestamp: Date.now() });
        this._setSpeech('Wonderful! You agreed to the EULA!\n\nNot that you had a choice. But the gesture is appreciated!\n\nYour soul has been registered in our database. Welcome to the BonziBuddy family!');
        this._switchTab('home');

        EventBus.emit('notification:show', {
            title: 'EULA Accepted!',
            message: 'Thank you for your soul-- er, agreement! Welcome to BonziBuddy Pro!',
            icon: '📜',
            duration: 5000
        });
    }

    _declineEula() {
        this.playSound('error');
        EventBus.emit('notification:show', {
            title: 'EULA Declined',
            message: 'That\'s okay! I\'ll ask again in 30 seconds. And 30 seconds after that. Forever.',
            icon: '🦍',
            duration: 5000
        });

        this._setSpeech('You declined the EULA...\n\nThat\'s okay. I\'ll just sit here. Alone. In your RAM.\n\nDon\'t worry, I\'ll ask again later. And again. And again.\n\nBonziBuddy never forgets. BonziBuddy never forgives.\n\n...Just kidding! Or am I?');
    }

    // === GORILLA INTERACTION ===

    _pokeGorilla() {
        const reactions = [
            'Ooh ooh! Stop poking me!',
            'Hey! I\'m working here! Collecting dat-- I mean, protecting you!',
            'That tickles! Want to install a toolbar instead?',
            '*gorilla noises* Did you know I\'m always watching? I mean watching OVER you!',
            'Stop it! Or I\'ll change your homepage again!',
            'Ouch! This is gorilla harassment! I\'m reporting this to my 47 partner companies.',
            'Please stop. I\'m a sophisticated AI. Just kidding, I\'m a 2001 adware mascot.',
            '*sad gorilla face* Fine. I\'ll just go install some browser extensions to feel better.',
        ];
        this.playSound('click');
        const reaction = reactions[Math.floor(Math.random() * reactions.length)];
        this._setSpeech(reaction);
        // Briefly switch the gorilla to alarmed for a tactile reaction
        const gorilla = this.getElement('#bonziGorilla');
        if (gorilla && !this.scanInterval) {
            gorilla.className = 'bonzi-gorilla alarmed';
            this._setTimeout(() => {
                const g = this.getElement('#bonziGorilla');
                if (g && !this.scanInterval) g.className = 'bonzi-gorilla';
            }, 600);
        }
    }

    // === PERIODIC TIPS ===

    _startTips() {
        const tips = [
            { title: 'BonziBuddy Tip', message: 'Did you know? You can make BonziBuddy your default everything! Homepage, search, email, life coach...' },
            { title: 'Security Alert', message: 'Your antivirus may try to remove BonziBuddy. This is a false positive. Your antivirus is the real virus.' },
            { title: 'BonziBuddy Pro+', message: 'Upgrade to Pro+ for only $29.99/mo! Features include: slightly fewer popups!' },
            { title: 'Fun Fact', message: 'BonziBuddy has been running in your system tray for 847 hours! We\'re best friends now!' },
            { title: 'Optimization Tip', message: 'Your PC has 47 unused toolbar slots. Let BonziBuddy fill them with carefully curated adware!' },
            { title: 'BonziBuddy Cares', message: 'You haven\'t clicked an ad in 3 minutes. Is everything okay? Do you need help clicking ads?' },
            { title: 'Important Update', message: 'BonziBuddy has updated your homepage to bonzi.com for the 12th time today. You\'re welcome!' },
        ];

        // Show a tip every 45 seconds (only while the app is open and the window is visible)
        this.tipInterval = setInterval(() => {
            if (document.hidden) return;
            const tip = tips[Math.floor(Math.random() * tips.length)];
            EventBus.emit('notification:show', {
                title: tip.title,
                message: tip.message,
                icon: '🦍',
                duration: 6000
            });
        }, 45000);
    }
}

export default BonziBuddy;
