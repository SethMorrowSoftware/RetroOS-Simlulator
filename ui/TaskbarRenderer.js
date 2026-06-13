/**
 * TaskbarRenderer - Renders and manages the taskbar
 * Handles window buttons, system tray, and clock
 */

import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import WindowManager from '../core/WindowManager.js';
import AppRegistry from '../apps/AppRegistry.js';
import { getConfig } from '../core/ConfigLoader.js';
import { isSafeHttpUrl } from '../core/Sanitize.js';

class TaskbarRendererClass {
    constructor() {
        this.taskbarButtons = null;
        this.clockClickCount = 0;
        this.clockIntervalId = null;
        this.initialized = false;
    }

    /**
     * Initialize taskbar
     */
    initialize() {
        // Prevent double initialization
        if (this.initialized) {
            console.warn('[TaskbarRenderer] Already initialized');
            return;
        }

        this.taskbarButtons = document.getElementById('taskbarButtons');
        this._unsubs = [];

        // Subscribe to state changes
        this._unsubs.push(StateManager.subscribe('windows', () => this.renderButtons()));
        this._unsubs.push(StateManager.subscribe('ui.activeWindow', () => this.renderButtons()));

        // Listen for taskbar update events
        this._unsubs.push(EventBus.on('ui:taskbar:update', () => this.renderButtons()));

        // Setup static elements
        this.setupStartButton();
        this.setupQuickLaunch();
        this.setupSystemTray();

        // Initial render
        this.renderButtons();

        this.initialized = true;
        console.log('[TaskbarRenderer] Initialized');
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (!this.initialized) return;

        // Clear clock interval
        if (this.clockIntervalId) {
            clearInterval(this.clockIntervalId);
            this.clockIntervalId = null;
        }

        // Unsubscribe from EventBus and StateManager
        if (this._unsubs) {
            this._unsubs.forEach(unsub => { if (typeof unsub === 'function') unsub(); });
            this._unsubs = [];
        }

        this.initialized = false;
        console.log('[TaskbarRenderer] Destroyed');
    }

    /**
     * Setup start button - note: actual click handling is in StartMenuRenderer
     * This just plays sound when start menu toggles
     */
    setupStartButton() {
        // Start menu toggle handling is done by StartMenuRenderer
        // We just listen for the toggle event to play sound
        this._unsubs.push(EventBus.on(Events.START_MENU_TOGGLE, () => {
            EventBus.emit(Events.SOUND_PLAY, { type: 'click' });
        }));
    }

    /**
     * Setup quick launch buttons
     */
    setupQuickLaunch() {
        const quickLaunch = document.querySelector('.quick-launch');
        if (!quickLaunch) return;

        // Load quick launch items from config or use inline defaults
        const items = getConfig('quickLaunch', [
            { type: 'app', appId: 'terminal', icon: '\uD83D\uDCBB', title: 'Terminal' },
            { type: 'app', appId: 'notepad', icon: '\uD83D\uDCDD', title: 'Notepad' },
            { type: 'link', url: 'https://sethmorrow.com', icon: '\uD83C\uDF00', title: 'Internet' }
        ]);

        quickLaunch.innerHTML = '';
        items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'quick-launch-btn';
            btn.title = item.title || '';
            btn.textContent = item.icon || '';

            if (item.type === 'app') {
                btn.dataset.app = item.appId || '';
                btn.addEventListener('click', () => {
                    AppRegistry.launch(btn.dataset.app);
                });
            } else if (item.type === 'link') {
                btn.dataset.action = 'web';
                btn.dataset.url = item.url || '';
                btn.addEventListener('click', () => {
                    const url = btn.dataset.url || getConfig('branding.websiteUrl', 'https://sethmorrow.com');
                    if (isSafeHttpUrl(url)) {
                        AppRegistry.launch('browser', { url });
                    }
                });
            }

            quickLaunch.appendChild(btn);
        });
    }

    /**
     * Setup system tray
     */
    setupSystemTray() {
        // Volume icon
        const volumeIcon = document.getElementById('volumeIcon');
        if (volumeIcon) {
            this.updateVolumeIcon();
            volumeIcon.addEventListener('click', () => {
                const newState = StateManager.toggleSetting('sound');
                this.updateVolumeIcon();
                if (newState) {
                    EventBus.emit(Events.SOUND_PLAY, { type: 'click' });
                }
            });
        }

        // Subscribe to sound setting changes
        this._unsubs.push(StateManager.subscribe('settings.sound', () => this.updateVolumeIcon()));

        // Clock
        const clock = document.getElementById('clock');
        if (clock) {
            clock.addEventListener('click', () => this.handleClockClick());
            // Start clock updates - store interval ID for cleanup
            this.updateClock();
            this.clockIntervalId = setInterval(() => this.updateClock(), 1000);
        }
    }

    /**
     * Update clock display
     */
    updateClock() {
        const clock = document.getElementById('clock');
        if (clock) {
            const now = new Date();
            const hours = now.getHours();
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const displayHours = hours % 12 || 12;
            clock.textContent = `${displayHours}:${minutes} ${ampm}`;
        }
    }

    /**
     * Update volume icon state
     */
    updateVolumeIcon() {
        const volumeIcon = document.getElementById('volumeIcon');
        if (volumeIcon) {
            const soundEnabled = StateManager.getState('settings.sound');
            volumeIcon.textContent = soundEnabled ? '\uD83D\uDCCA' : '\uD83D\uDD07';
        }
    }

    /**
     * Handle clock clicks (easter egg)
     */
    handleClockClick() {
        this.clockClickCount++;

        if (this.clockClickCount >= 10) {
            this.clockClickCount = 0;
            document.body.classList.add('disco-mode');
            StateManager.unlockAchievement('disco_fever');
            setTimeout(() => document.body.classList.remove('disco-mode'), 5000);
            return;
        }

        this.showCalendar();
    }

    /**
     * Show calendar popup
     */
    showCalendar() {
        let calendar = document.querySelector('.calendar-popup');

        if (!calendar) {
            calendar = document.createElement('div');
            calendar.className = 'calendar-popup';
            document.body.appendChild(calendar);
        }

        const now = new Date();
        const month = now.toLocaleString('default', { month: 'long' });
        const year = now.getFullYear();
        const today = now.getDate();
        const firstDay = new Date(year, now.getMonth(), 1).getDay();
        const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();

        let html = `<div class="calendar-header"><span>${month} ${year}</span></div>`;
        html += '<div class="calendar-grid">';
        html += ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
            .map(d => `<div class="calendar-day header">${d}</div>`).join('');

        for (let i = 0; i < firstDay; i++) {
            html += '<div class="calendar-day"></div>';
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = day === today ? 'today' : '';
            html += `<div class="calendar-day ${isToday}">${day}</div>`;
        }

        html += '</div>';
        calendar.innerHTML = html;
        calendar.classList.toggle('active');

        // Close on outside click. Remove any previous handler first —
        // rapidly toggling the clock used to stack one document listener
        // per click until an outside click drained them.
        if (this._calendarCloseHandler) {
            document.removeEventListener('click', this._calendarCloseHandler);
            this._calendarCloseHandler = null;
        }
        if (calendar.classList.contains('active')) {
            const closeHandler = (e) => {
                if (!calendar.contains(e.target) && e.target.id !== 'clock') {
                    calendar.classList.remove('active');
                    document.removeEventListener('click', closeHandler);
                    if (this._calendarCloseHandler === closeHandler) {
                        this._calendarCloseHandler = null;
                    }
                }
            };
            this._calendarCloseHandler = closeHandler;
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        }
    }

    /**
     * Render taskbar window buttons
     */
    renderButtons() {
        if (!this.taskbarButtons) return;

        const windows = StateManager.getState('windows') || [];
        const activeWindow = StateManager.getState('ui.activeWindow');

        this.taskbarButtons.innerHTML = '';

        windows.forEach(w => {
            const btn = document.createElement('button');
            const isActive = w.id === activeWindow && !w.minimized;
            btn.className = `taskbar-button${isActive ? ' active' : ''}`;
            const titleSpan = document.createElement('span');
            titleSpan.textContent = w.title;
            btn.appendChild(titleSpan);

            // Click handler
            btn.addEventListener('click', () => {
                WindowManager.toggle(w.id);
            });

            // Right-click context menu
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                EventBus.emit(Events.CONTEXT_MENU_SHOW, {
                    x: e.clientX,
                    y: e.clientY,
                    type: 'taskbar',
                    windowId: w.id
                });
            });

            this.taskbarButtons.appendChild(btn);
        });
    }
}

// Singleton
const TaskbarRenderer = new TaskbarRendererClass();

export default TaskbarRenderer;
