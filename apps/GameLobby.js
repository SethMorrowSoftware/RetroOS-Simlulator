/**
 * GameLobby - Multiplayer game browser and matchmaking
 *
 * Browse, create, join, and spectate multiplayer game sessions.
 * Battle.net / MSN Gaming Zone aesthetic, fully themed against the IlluminatOS chrome.
 */

import AppBase from './AppBase.js';
import { escapeHtml } from '../core/Sanitize.js';
import StorageManager from '../core/StorageManager.js';
import MultiplayerClient from '../core/MultiplayerClient.js';
import EventBus from '../core/EventBus.js';

const GAMELOBBY_STORAGE_KEY = 'gamelobby:state:v1';

class GameLobby extends AppBase {
    constructor() {
        super({
            id: 'gamelobby',
            name: 'Game Lobby',
            icon: '🎮',
            width: 720,
            height: 520,
            minWidth: 520,
            minHeight: 400,
            resizable: true,
            singleton: true,
            category: 'internet'
        });

        this.sessions = [];
        this.selectedSession = null;
        this.refreshTimer = null;
        this._mpUnsubscribers = [];
        this._connectListenerUnsub = null;
        this._toastTimer = null;
        this._currentFilter = null;

        this.gameTypes = [
            { id: 'minesweeper', name: 'Minesweeper', icon: '💣', modes: ['Co-op', 'Versus'] },
            { id: 'tetris', name: 'Tetris', icon: '🧱', modes: ['Versus'] },
            { id: 'snake', name: 'Snake', icon: '🐍', modes: ['Arena'] },
            { id: 'solitaire', name: 'Solitaire', icon: '🃏', modes: ['Race'] },
            { id: 'freecell', name: 'FreeCell', icon: '♠️', modes: ['Race'] },
            { id: 'asteroids', name: 'Asteroids', icon: '🚀', modes: ['Co-op'] },
            { id: 'skifree', name: 'SkiFree', icon: '⛷️', modes: ['Race'] },
            { id: 'zork', name: 'Zork', icon: '📜', modes: ['Party'] }
        ];

        // Hydrate persisted prefs (preferred game, last create options)
        const saved = StorageManager.get(GAMELOBBY_STORAGE_KEY, null);
        this._savedPrefs = (saved && typeof saved === 'object') ? saved : {};
        this._currentFilter = typeof this._savedPrefs.filter === 'string' ? this._savedPrefs.filter : null;
    }

    _persistPrefs(partial) {
        this._savedPrefs = { ...this._savedPrefs, ...partial };
        StorageManager.set(GAMELOBBY_STORAGE_KEY, this._savedPrefs);
    }

    onOpen() {
        const isConnected = MultiplayerClient.isConnected();
        const statusClass = isConnected ? 'gamelobby-status--online' : 'gamelobby-status--offline';
        return `
            <div class="gamelobby-container">
                <div class="gamelobby-header">
                    <span class="gamelobby-title">🎮 Game Lobby</span>
                    <span id="lobbyStatus" class="gamelobby-status ${statusClass}">
                        ${isConnected ? '● Connected' : '● Offline'}
                    </span>
                </div>

                <div id="lobbyContent">
                    ${isConnected ? this._renderConnectedUI() : this._renderOfflineUI()}
                </div>

                <div id="lobbyToast" class="gamelobby-toast" hidden></div>
            </div>
        `;
    }

    _renderOfflineUI() {
        return `
            <div class="gamelobby-offline">
                <div class="gamelobby-offline-icon">🔌</div>
                <div class="gamelobby-offline-title">Not Connected</div>
                <div class="gamelobby-offline-body">
                    Multiplayer requires a connection to the WebSocket server.
                    Start the server and log in to access online features.
                </div>
                <div class="gamelobby-offline-hint">
                    Start the server: <code>cd websocket &amp;&amp; php server.php</code>
                </div>
                <button id="lobbyRetryBtn" class="gamelobby-btn gamelobby-btn--primary" style="margin-top:14px;">
                    🔄 Retry Connection
                </button>
            </div>
        `;
    }

    _renderConnectedUI() {
        const filter = this._currentFilter;
        return `
            <div class="gamelobby-body">
                <!-- Left: Game types -->
                <div class="gamelobby-sidebar">
                    <div class="gamelobby-sidebar-heading">GAMES</div>
                    <div class="gamelobby-game-type ${!filter ? 'gamelobby-game-type--active' : ''}" data-game="">
                        <span>🌐</span>
                        <span>All Games</span>
                    </div>
                    ${this.gameTypes.map(g => `
                        <div class="gamelobby-game-type ${filter === g.id ? 'gamelobby-game-type--active' : ''}" data-game="${g.id}">
                            <span>${g.icon}</span>
                            <span>${g.name}</span>
                        </div>
                    `).join('')}
                    <div class="gamelobby-sidebar-heading gamelobby-sidebar-heading--spaced">ACTIONS</div>
                    <div id="createGameBtn" class="gamelobby-action gamelobby-action--create">
                        <span>➕</span>
                        <span>Create Game</span>
                    </div>
                    <div id="refreshBtn" class="gamelobby-action gamelobby-action--refresh">
                        <span>🔄</span>
                        <span>Refresh</span>
                    </div>
                </div>

                <!-- Right: Session list -->
                <div class="gamelobby-main">
                    <div class="gamelobby-list-header">
                        <span class="gamelobby-col-game">Game</span>
                        <span class="gamelobby-col-host">Host</span>
                        <span class="gamelobby-col-players">Players</span>
                        <span class="gamelobby-col-status">Status</span>
                    </div>
                    <div id="sessionList" class="gamelobby-list">
                        <div class="gamelobby-list-loading">Loading games...</div>
                    </div>
                    <div id="sessionActions" class="gamelobby-actions" hidden>
                        <button id="joinSessionBtn" class="gamelobby-btn gamelobby-btn--primary">
                            Join Game
                        </button>
                        <button id="spectateBtn" class="gamelobby-btn gamelobby-btn--secondary">
                            Spectate
                        </button>
                    </div>
                </div>
            </div>

            <!-- Create game dialog -->
            <div id="createGameDialog" class="gamelobby-dialog" hidden>
                <div class="gamelobby-dialog-title">Create New Game</div>
                <div class="gamelobby-dialog-body">
                    <div class="gamelobby-dialog-row">
                        <label>Game:</label>
                        <select id="createGameType" class="gamelobby-dialog-input">
                            ${this.gameTypes.map(g => `<option value="${g.id}" ${this._savedPrefs.lastGameType === g.id ? 'selected' : ''}>${g.icon} ${g.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="gamelobby-dialog-row">
                        <label>Max Players:</label>
                        <select id="createMaxPlayers" class="gamelobby-dialog-input">
                            <option value="2" ${this._savedPrefs.lastMaxPlayers === 2 ? 'selected' : ''}>2</option>
                            <option value="4" ${this._savedPrefs.lastMaxPlayers === 4 ? 'selected' : ''}>4</option>
                            <option value="8" ${this._savedPrefs.lastMaxPlayers === 8 ? 'selected' : ''}>8</option>
                        </select>
                    </div>
                    <div class="gamelobby-dialog-row">
                        <label>
                            <input type="checkbox" id="createPrivate" ${this._savedPrefs.lastPrivate ? 'checked' : ''}> Private game
                        </label>
                    </div>
                    <div class="gamelobby-dialog-row gamelobby-dialog-row--actions">
                        <button id="createConfirmBtn" class="gamelobby-dialog-btn">Create</button>
                        <button id="createCancelBtn" class="gamelobby-dialog-btn">Cancel</button>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        // Always listen for connection state changes so an offline lobby can heal itself.
        this._connectListenerUnsub = MultiplayerClient.on('connected', () => {
            this._rerenderContent();
        });

        if (!MultiplayerClient.isConnected()) {
            this._wireOfflineHandlers();
            return;
        }
        this._wireConnectedHandlers();
    }

    _wireOfflineHandlers() {
        this.addHandler(this.getElement('#lobbyRetryBtn'), 'click', () => {
            this.playSound('click');
            this._showToast(MultiplayerClient.isConnected() ? 'Connected!' : 'Still offline — start the WebSocket server.');
            this._rerenderContent();
        });
    }

    _wireConnectedHandlers() {
        this.addHandler(this.getElement('#refreshBtn'), 'click', () => {
            this.playSound('click');
            this._refreshSessions();
            this._showToast('Refreshed.');
        });

        this.addHandler(this.getElement('#createGameBtn'), 'click', () => {
            this.playSound('click');
            this._showCreateDialog();
        });

        this.addHandler(this.getElement('#createConfirmBtn'), 'click', () => this._createGame());
        this.addHandler(this.getElement('#createCancelBtn'), 'click', () => {
            this.playSound('click');
            this._hideCreateDialog();
        });

        this.addHandler(this.getElement('#joinSessionBtn'), 'click', () => this._joinSelected());
        this.addHandler(this.getElement('#spectateBtn'), 'click', () => this._spectateSelected());

        // Game type filters (now includes "All Games")
        this.getElements('.gamelobby-game-type').forEach(el => {
            this.addHandler(el, 'click', () => {
                this.playSound('click');
                this._filterByGame(el.dataset.game || null);
            });
        });

        // Listen for session updates from server
        const unsubSessions = MultiplayerClient.on('game:session_list', (msg) => {
            this.sessions = msg.payload?.sessions || [];
            this._renderSessionList();
        });

        const unsubAvailable = MultiplayerClient.on('game:session_available', () => {
            this._refreshSessions();
        });

        this._mpUnsubscribers.push(unsubSessions, unsubAvailable);

        // Initial refresh
        this._refreshSessions();

        // Auto-refresh every 10 seconds, but only when the window is visible
        this.refreshTimer = setInterval(() => {
            if (!document.hidden) this._refreshSessions();
        }, 10000);
    }

    _rerenderContent() {
        const content = this.getElement('#lobbyContent');
        const statusEl = this.getElement('#lobbyStatus');
        const isConnected = MultiplayerClient.isConnected();
        if (statusEl) {
            statusEl.textContent = isConnected ? '● Connected' : '● Offline';
            statusEl.classList.toggle('gamelobby-status--online', isConnected);
            statusEl.classList.toggle('gamelobby-status--offline', !isConnected);
        }
        if (!content) return;
        // Tear down old subscriptions / timer
        if (this.refreshTimer) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
        for (const unsub of this._mpUnsubscribers) unsub();
        this._mpUnsubscribers = [];
        content.innerHTML = isConnected ? this._renderConnectedUI() : this._renderOfflineUI();
        if (isConnected) this._wireConnectedHandlers();
        else this._wireOfflineHandlers();
    }

    onClose() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        if (this._toastTimer) clearTimeout(this._toastTimer);
        for (const unsub of this._mpUnsubscribers) unsub();
        this._mpUnsubscribers = [];
        if (this._connectListenerUnsub) this._connectListenerUnsub();
        this._connectListenerUnsub = null;
    }

    _refreshSessions() {
        MultiplayerClient.send({
            type: 'game',
            payload: { action: 'list_sessions' }
        });
    }

    _renderSessionList() {
        const list = this.getElement('#sessionList');
        if (!list) return;

        let sessions = this.sessions;
        if (this._currentFilter) {
            sessions = sessions.filter(s => s.options?.metadata?.gameId === this._currentFilter);
        }

        if (sessions.length === 0) {
            list.innerHTML = `
                <div class="gamelobby-list-empty">
                    <div class="gamelobby-list-empty-icon">🎮</div>
                    No games available. Create one!
                </div>
            `;
            const actions = this.getElement('#sessionActions');
            if (actions) actions.hidden = true;
            this.selectedSession = null;
            return;
        }

        list.innerHTML = sessions.map((s, i) => {
            const meta = s.options?.metadata || {};
            const gameType = this.gameTypes.find(g => g.id === meta.gameId);
            const statusKey = meta.status === 'playing'
                ? 'playing'
                : meta.status === 'ended'
                    ? 'ended'
                    : 'lobby';
            const gameName = escapeHtml(gameType?.name || meta.gameId || 'Unknown');
            const hostName = escapeHtml(s.members?.[0]?.displayName || 'Unknown');
            const statusText = escapeHtml(meta.status || 'open');
            const selected = this.selectedSession === i ? ' gamelobby-session--selected' : '';
            return `
                <div class="gamelobby-session${selected}" data-idx="${i}">
                    <span class="gamelobby-col-game">${gameType?.icon || '🎮'} ${gameName}</span>
                    <span class="gamelobby-col-host gamelobby-session-host">${hostName}</span>
                    <span class="gamelobby-col-players">${s.memberCount || 0}/${s.options?.maxPlayers || '?'}</span>
                    <span class="gamelobby-col-status gamelobby-session-status--${statusKey}">${statusText}</span>
                </div>
            `;
        }).join('');

        // Session click handlers
        list.querySelectorAll('.gamelobby-session').forEach(el => {
            this.addHandler(el, 'click', () => {
                this.playSound('click');
                this.selectedSession = parseInt(el.dataset.idx);
                this._renderSessionList();
                const actions = this.getElement('#sessionActions');
                if (actions) actions.hidden = false;
            });
            this.addHandler(el, 'dblclick', () => this._joinSelected());
        });
    }

    _filterByGame(gameId) {
        this._currentFilter = gameId || null;
        this._persistPrefs({ filter: this._currentFilter });
        // Update active class without rebuilding the whole sidebar
        this.getElements('.gamelobby-game-type').forEach(el => {
            const matches = (el.dataset.game || null) === this._currentFilter;
            el.classList.toggle('gamelobby-game-type--active', matches);
        });
        this._renderSessionList();
    }

    _showCreateDialog() {
        const dialog = this.getElement('#createGameDialog');
        if (dialog) dialog.hidden = false;
    }

    _hideCreateDialog() {
        const dialog = this.getElement('#createGameDialog');
        if (dialog) dialog.hidden = true;
    }

    _createGame() {
        const gameId = this.getElement('#createGameType')?.value;
        const maxPlayers = parseInt(this.getElement('#createMaxPlayers')?.value || '2');
        const isPrivate = this.getElement('#createPrivate')?.checked || false;

        if (!gameId) {
            this.playSound('error');
            this._showToast('Pick a game first.');
            return;
        }

        const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

        MultiplayerClient.createGameSession(gameId, sessionId, {
            maxPlayers,
            settings: { isPrivate }
        });

        this._persistPrefs({
            lastGameType: gameId,
            lastMaxPlayers: maxPlayers,
            lastPrivate: isPrivate
        });

        this.playSound('notify');
        this._hideCreateDialog();
        this._showToast(`Creating ${gameId} session…`);

        // Launch the game app
        setTimeout(() => {
            EventBus.emit('command:app:launch', { appId: gameId });
        }, 500);
    }

    _joinSelected() {
        if (this.selectedSession === null || !this.sessions[this.selectedSession]) {
            this.playSound('error');
            this._showToast('Pick a game from the list first.');
            return;
        }

        const session = this.sessions[this.selectedSession];
        const meta = session.options?.metadata || {};
        const gameId = meta.gameId;
        const sessionId = meta.sessionId;

        if (!gameId || !sessionId) {
            this.playSound('error');
            this._showToast('Game info missing on this session.');
            return;
        }

        MultiplayerClient.joinGameSession(gameId, sessionId);
        this.playSound('notify');
        this._showToast(`Joining ${gameId}…`);
        EventBus.emit('command:app:launch', { appId: gameId });
    }

    _spectateSelected() {
        if (this.selectedSession === null || !this.sessions[this.selectedSession]) {
            this.playSound('error');
            this._showToast('Pick a game from the list first.');
            return;
        }
        const session = this.sessions[this.selectedSession];
        const meta = session.options?.metadata || {};
        const gameId = meta.gameId;
        const sessionId = meta.sessionId;

        if (!gameId || !sessionId) {
            this.playSound('error');
            return;
        }

        MultiplayerClient.send({
            type: 'game',
            payload: { action: 'spectate', sessionId, gameId }
        });
        this.playSound('notify');
        this._showToast(`Spectating ${gameId}…`);
        EventBus.emit('command:app:launch', { appId: gameId, params: { spectate: true, sessionId } });
    }

    _showToast(text) {
        const toast = this.getElement('#lobbyToast');
        if (!toast) return;
        toast.textContent = text;
        toast.hidden = false;
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.hidden = true;
        }, 2400);
    }

    addSystemMessage(text) {
        this._showToast(text);
    }
}

export default GameLobby;
