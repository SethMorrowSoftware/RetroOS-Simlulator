/**
 * Notifications - Toast notification system for multiplayer events
 *
 * Shows toast notifications for DMs, game invites, friend requests, etc.
 * Integrates with the SoundSystem for audio alerts.
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus from '../core/EventBus.js';
import MultiplayerClient from '../core/MultiplayerClient.js';

class NotificationsFeature extends FeatureBase {
    constructor() {
        super({
            id: 'notifications',
            name: 'Notifications',
            description: 'Toast notifications for multiplayer events',
            enabledByDefault: true
        });

        this.container = null;
        this.queue = [];
        this.maxVisible = 3;
        this.defaultDuration = 5000;
    }

    async initialize() {
        this._createContainer();
        this._eventUnsubscribers = [];

        // DM received
        this._eventUnsubscribers.push(EventBus.on('mp:dm:received', (data) => {
            this.show({
                title: `Message from ${data.senderName}`,
                body: data.text?.substring(0, 80) || 'New message',
                icon: '\u{1F4AC}',
                sound: 'notification',
                onClick: () => {
                    EventBus.emit('command:app:launch', { appId: 'instantmessenger', params: { openChat: data.senderId } });
                }
            });
        }));

        // Game invite
        this._eventUnsubscribers.push(EventBus.on('mp:game:invite', (data) => {
            this.show({
                title: 'Game Invite',
                body: `${data.fromName} invites you to ${data.gameName}`,
                icon: '\u{1F3AE}',
                sound: 'notification',
                duration: 10000,
                actions: [
                    { label: 'Join', onClick: () => EventBus.emit('mp:game:accept_invite', data) },
                    { label: 'Decline', onClick: () => {} }
                ]
            });
        }));

        // Friend request
        this._eventUnsubscribers.push(EventBus.on('mp:friend:request', (data) => {
            this.show({
                title: 'Friend Request',
                body: `${data.fromName} wants to be your friend`,
                icon: '\u{1F465}',
                sound: 'notification'
            });
        }));

        // Player joined your game
        this._eventUnsubscribers.push(EventBus.on('mp:game:player_joined', (data) => {
            this.show({
                title: 'Player Joined',
                body: `${data.displayName} joined the game`,
                icon: '\u{1F3AE}',
                duration: 3000
            });
        }));

        // Your turn - compare against MultiplayerClient's local user ID
        this._eventUnsubscribers.push(EventBus.on('mp:game:turn', (data) => {
            const myInfo = MultiplayerClient.getUserInfo();
            if (data.nextPlayer === myInfo.userId) {
                this.show({
                    title: 'Your Turn!',
                    body: 'It\'s your turn to play',
                    icon: '\u23F0',
                    sound: 'notification',
                    duration: 4000
                });
            }
        }));

        // Campaign events
        this._eventUnsubscribers.push(EventBus.on('mp:campaign:event', (data) => {
            this.show({
                title: data.title || 'Campaign Update',
                body: data.body || 'Something happened in the campaign',
                icon: '\u{1F4DC}',
                duration: 6000
            });
        }));

        // Chat mention
        this._eventUnsubscribers.push(EventBus.on('mp:chat:mention', (data) => {
            this.show({
                title: `${data.senderName} mentioned you`,
                body: data.text?.substring(0, 80) || '',
                icon: '\u{1F4AC}',
                sound: 'notification'
            });
        }));

        // General-purpose notification:show event (used by CommandBus, StorageManager, scripts, etc.)
        this._eventUnsubscribers.push(EventBus.on('notification:show', (data) => {
            this.show({
                title: data.title || 'Notice',
                body: data.message || data.body || '',
                icon: data.icon || 'ℹ️',
                sound: data.sound || null,
                duration: data.duration || this.defaultDuration,
                onClick: data.onClick || null
            });
        }));
    }

    cleanup() {
        // Unsubscribe all event listeners
        if (this._eventUnsubscribers) {
            for (const unsub of this._eventUnsubscribers) {
                if (typeof unsub === 'function') unsub();
            }
            this._eventUnsubscribers = [];
        }
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        super.cleanup();
    }

    /**
     * Show a toast notification
     * @param {Object} options
     * @param {string} options.title - Notification title
     * @param {string} options.body - Notification body
     * @param {string} options.icon - Emoji icon
     * @param {string} options.sound - Sound type to play
     * @param {number} options.duration - Auto-dismiss duration in ms
     * @param {Function} options.onClick - Click handler
     * @param {Array} options.actions - Action buttons [{label, onClick}]
     */
    show(options = {}) {
        const {
            title = '',
            body = '',
            icon = 'ℹ️',
            sound = null,
            duration = this.defaultDuration,
            onClick = null,
            actions = []
        } = options;

        // Play sound
        if (sound) {
            EventBus.emit('sound:play', { type: sound });
        }

        // Create toast element
        const toast = document.createElement('div');
        toast.className = 'mp-toast-notification';
        toast.style.cssText = `
            background: var(--win95-gray, #c0c0c0);
            border: 2px outset #dfdfdf;
            padding: 0;
            margin-bottom: 6px;
            box-shadow: 3px 3px 8px rgba(0,0,0,0.4);
            font-family: 'MS Sans Serif', 'Microsoft Sans Serif', Tahoma, sans-serif;
            font-size: 12px;
            cursor: ${onClick ? 'pointer' : 'default'};
            animation: slideInRight 0.3s ease-out;
            max-width: 320px;
            min-width: 240px;
        `;

        // Build toast DOM safely (avoid innerHTML with user data)
        const headerBar = document.createElement('div');
        headerBar.style.cssText = 'background: var(--win95-blue, #000080); color: white; padding: 3px 8px; display: flex; align-items: center; justify-content: space-between;';
        const titleSpan = document.createElement('span');
        titleSpan.style.cssText = 'font-weight: bold; font-size: 12px;';
        titleSpan.textContent = `${icon} ${title}`;
        const closeSpan = document.createElement('span');
        closeSpan.className = 'mp-toast-close';
        closeSpan.style.cssText = 'cursor: pointer; padding: 0 4px; font-size: 14px;';
        closeSpan.textContent = '\u00d7';
        headerBar.appendChild(titleSpan);
        headerBar.appendChild(closeSpan);

        const bodyDiv = document.createElement('div');
        bodyDiv.style.cssText = 'padding: 8px 10px; line-height: 1.4;';
        bodyDiv.textContent = body;

        toast.appendChild(headerBar);
        toast.appendChild(bodyDiv);

        if (actions.length > 0) {
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'padding: 4px 6px; display: flex; gap: 4px; justify-content: flex-end;';
            actions.forEach((a, i) => {
                const btn = document.createElement('button');
                btn.className = 'mp-toast-action';
                btn.dataset.idx = i;
                btn.style.cssText = 'padding: 2px 8px; border: 2px outset #dfdfdf; background: var(--win95-gray, #c0c0c0); font-size: 11px; cursor: pointer; font-family: inherit;';
                btn.textContent = a.label;
                actionsDiv.appendChild(btn);
            });
            toast.appendChild(actionsDiv);
        }

        // Click handlers
        if (onClick) {
            toast.addEventListener('click', (e) => {
                if (!e.target.closest('.mp-toast-close') && !e.target.closest('.mp-toast-action')) {
                    onClick();
                    this._dismiss(toast);
                }
            });
        }

        closeSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            this._dismiss(toast);
        });

        // Action button handlers
        const actionBtns = toast.querySelectorAll('.mp-toast-action');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                if (actions[idx]?.onClick) actions[idx].onClick();
                this._dismiss(toast);
            });
        });

        // Enforce maxVisible - dismiss oldest if at limit
        while (this.container.children.length >= this.maxVisible) {
            this._dismiss(this.container.firstElementChild);
        }

        this.container.appendChild(toast);

        // Auto-dismiss with cancellation on manual dismiss
        if (duration > 0) {
            const timer = setTimeout(() => this._dismiss(toast), duration);
            toast._dismissTimer = timer;
        }
    }

    _dismiss(toast) {
        if (!toast || !toast.parentNode || toast._dismissed) return;
        toast._dismissed = true;
        if (toast._dismissTimer) {
            clearTimeout(toast._dismissTimer);
        }
        toast.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    _createContainer() {
        this.container = document.createElement('div');
        this.container.id = 'mp-notifications';
        this.container.style.cssText = `
            position: fixed;
            bottom: 40px;
            right: 12px;
            z-index: 100001;
            display: flex;
            flex-direction: column-reverse;
            pointer-events: auto;
        `;
        document.body.appendChild(this.container);

        // Add animation styles (only once)
        if (!document.getElementById('mp-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'mp-notification-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOutRight {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

export default new NotificationsFeature();
