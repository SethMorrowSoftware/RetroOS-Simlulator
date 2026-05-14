/**
 * OnlineUsers - System tray presence indicator
 *
 * Shows online user count in the taskbar system tray area.
 * Click to open the online users panel.
 * Integrates with PresenceManager for real-time updates.
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus from '../core/EventBus.js';
import MultiplayerClient from '../core/MultiplayerClient.js';
import PresenceManager from '../core/PresenceManager.js';
import { escapeHtml } from '../core/Sanitize.js';

class OnlineUsersFeature extends FeatureBase {
    constructor() {
        super({
            id: 'onlineUsers',
            name: 'Online Users',
            description: 'System tray indicator showing online multiplayer users',
            enabledByDefault: true
        });

        this.trayElement = null;
        this.panelElement = null;
        this.panelVisible = false;
    }

    async initialize() {
        this._eventUnsubscribers = [];

        // Listen for presence updates
        this._eventUnsubscribers.push(EventBus.on('mp:presence:changed', (data) => {
            this._updateTray(data.onlineCount);
        }));

        this._eventUnsubscribers.push(EventBus.on('mp:state', (data) => {
            if (data.state === 'connected') {
                this._showTray();
            } else if (data.state === 'disconnected') {
                this._updateTray(0);
            }
        }));

        // Create tray element
        this._createTray();
    }

    cleanup() {
        // Unsubscribe all event listeners
        if (this._eventUnsubscribers) {
            for (const unsub of this._eventUnsubscribers) {
                if (typeof unsub === 'function') unsub();
            }
            this._eventUnsubscribers = [];
        }
        if (this.trayElement && this.trayElement.parentNode) {
            this.trayElement.parentNode.removeChild(this.trayElement);
        }
        if (this.panelElement && this.panelElement.parentNode) {
            this.panelElement.parentNode.removeChild(this.panelElement);
        }
        super.cleanup();
    }

    _createTray() {
        const tray = document.querySelector('.system-tray');
        if (!tray) return;

        this.trayElement = document.createElement('div');
        this.trayElement.className = 'tray-online-users';
        this.trayElement.title = 'Online Users';
        this.trayElement.innerHTML = `
            <span class="online-dot"></span>
            <span class="online-count">0</span>
        `;
        this.trayElement.style.cssText = `
            display: none;
            align-items: center;
            gap: 3px;
            cursor: pointer;
            padding: 0 4px;
            font-size: 11px;
            color: white;
        `;

        this.trayElement.addEventListener('click', (e) => {
            e.stopPropagation();
            this._togglePanel();
        });

        tray.insertBefore(this.trayElement, tray.firstChild);
    }

    _showTray() {
        if (this.trayElement) {
            this.trayElement.style.display = 'flex';
        }
    }

    _updateTray(count) {
        if (!this.trayElement) return;
        const countEl = this.trayElement.querySelector('.online-count');
        if (countEl) {
            countEl.textContent = count;
        }
        this.trayElement.title = `${count} user${count !== 1 ? 's' : ''} online`;
    }

    _togglePanel() {
        if (this.panelVisible) {
            this._hidePanel();
        } else {
            this._showPanel();
        }
    }

    _showPanel() {
        if (this.panelElement) {
            this.panelElement.remove();
        }

        const users = PresenceManager.getOnlineUsers();
        const myInfo = MultiplayerClient.getUserInfo();

        this.panelElement = document.createElement('div');
        this.panelElement.className = 'online-users-panel';
        this.panelElement.style.cssText = `
            position: fixed;
            bottom: 32px;
            right: 4px;
            width: 220px;
            max-height: 300px;
            background: var(--win95-gray, #c0c0c0);
            border: 2px outset #dfdfdf;
            box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            z-index: 99999;
            font-family: 'MS Sans Serif', 'Microsoft Sans Serif', Tahoma, sans-serif;
            font-size: 11px;
        `;

        const userListContainer = document.createElement('div');
        for (const user of users) {
            const isMe = user.userId === myInfo.userId;
            const statusDot = user.status === 'away' ? '\u{1F7E1}' :
                user.status === 'busy' ? '\u{1F534}' :
                    user.status === 'in_game' ? '\u{1F3AE}' : '\u{1F7E2}';
            const row = document.createElement('div');
            row.style.cssText = `padding: 3px 6px; display: flex; align-items: center; gap: 4px;${isMe ? ' font-weight: bold;' : ''}`;
            const dot = document.createElement('span');
            dot.style.fontSize = '8px';
            dot.textContent = statusDot;
            const name = document.createElement('span');
            name.textContent = user.displayName + (isMe ? ' (you)' : '');
            row.appendChild(dot);
            row.appendChild(name);
            userListContainer.appendChild(row);
        }

        if (users.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.style.cssText = 'padding: 8px; color: #666; text-align: center;';
            emptyMsg.textContent = 'No users online';
            userListContainer.appendChild(emptyMsg);
        }

        // Build header
        const header = document.createElement('div');
        header.style.cssText = 'background: var(--win95-blue, #000080); color: white; padding: 3px 6px; font-weight: bold; font-size: 11px;';
        header.textContent = `Online Users (${users.length})`;

        const listWrapper = document.createElement('div');
        listWrapper.style.cssText = 'overflow-y: auto; max-height: 260px;';
        listWrapper.appendChild(userListContainer);

        this.panelElement.appendChild(header);
        this.panelElement.appendChild(listWrapper);

        document.body.appendChild(this.panelElement);
        this.panelVisible = true;

        // Close when clicking elsewhere
        this._closeHandler = (e) => {
            if (!this.panelElement?.contains(e.target) && !this.trayElement?.contains(e.target)) {
                this._hidePanel();
            }
        };
        // Defer so the current click event doesn't immediately close the panel
        setTimeout(() => {
            if (this.panelVisible) {
                document.addEventListener('click', this._closeHandler);
            }
        }, 10);
    }

    _hidePanel() {
        if (this._closeHandler) {
            document.removeEventListener('click', this._closeHandler);
            this._closeHandler = null;
        }
        if (this.panelElement) {
            this.panelElement.remove();
            this.panelElement = null;
        }
        this.panelVisible = false;
    }
}

export default new OnlineUsersFeature();
