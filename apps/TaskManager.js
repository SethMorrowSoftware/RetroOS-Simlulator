/**
 * Task Manager - Windows 95 Style Process Manager
 * Monitor running processes, system performance, and end tasks
 *
 * Uses semantic events and StateManager for accurate window tracking
 */

import AppBase from './AppBase.js';
import WindowManager from '../core/WindowManager.js';
import StateManager from '../core/StateManager.js';
import EventBus, { Events } from '../core/EventBus.js';
import AppRegistry from './AppRegistry.js';
import { escapeHtml } from '../core/Sanitize.js';

class TaskManager extends AppBase {
    constructor() {
        super({
            id: 'taskmgr',
            name: 'Task Manager',
            icon: '📊',
            width: 560,
            height: 500,
            minWidth: 440,
            minHeight: 360,
            resizable: true,
            singleton: true,
            category: 'systemtools'
        });

        this.updateInterval = null;
        this.cpuHistory = [];
        this.memHistory = [];
        this.maxHistoryPoints = 60;
        this.currentTab = 'applications';

        // Store consistent memory values per window to avoid jitter
        this.windowMemory = new Map();

        // PID counter for processes
        this.nextPid = 3000;
        this.windowPids = new Map();

        // Event unsubscribers
        this.eventUnsubscribers = [];

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('endTask', (payload) => {
            if (!payload || !payload.windowId) return { success: false, error: 'No windowId provided' };
            WindowManager.close(payload.windowId);
            this.windowMemory.delete(payload.windowId);
            this.windowPids.delete(payload.windowId);
            this.emitAppEvent('task:ended', { windowId: payload.windowId });
            return { success: true };
        });

        this.registerCommand('switchTo', (payload) => {
            if (!payload || !payload.windowId) return { success: false, error: 'No windowId provided' };
            this.switchToWindow(payload.windowId);
            this.emitAppEvent('task:switched', { windowId: payload.windowId });
            return { success: true };
        });

        this.registerCommand('refreshView', () => {
            this.update();
            return { success: true };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getApplications', () => {
            const windows = StateManager.getState('windows') || [];
            return windows.filter(win => win.id !== 'taskmgr').map(win => ({
                windowId: win.id,
                title: win.title || win.id,
                minimized: win.minimized || false,
                memory: this.getWindowMemory(win.id)
            }));
        });

        this.registerQuery('getProcesses', () => {
            const windows = StateManager.getState('windows') || [];
            const systemProcesses = [
                { name: 'System', pid: 4 },
                { name: 'smss.exe', pid: 156 },
                { name: 'csrss.exe', pid: 184 },
                { name: 'winlogon.exe', pid: 208 },
                { name: 'services.exe', pid: 252 },
                { name: 'lsass.exe', pid: 264 },
                { name: 'explorer.exe', pid: 1024 },
                { name: 'taskmgr.exe', pid: 2048 }
            ];
            const appProcesses = windows
                .filter(win => win.id !== 'taskmgr')
                .map(win => ({
                    name: (win.title || win.id).replace(/^[\p{Emoji}\s]+/u, '').trim().split(' ')[0].toLowerCase() + '.exe',
                    pid: this.getWindowPid(win.id),
                    windowId: win.id
                }));
            return [...systemProcesses, ...appProcesses];
        });

        this.registerQuery('getPerformance', () => {
            const cpu = this.cpuHistory.length > 0 ? this.cpuHistory[this.cpuHistory.length - 1] : 0;
            const mem = this.memHistory.length > 0 ? this.memHistory[this.memHistory.length - 1] : 0;
            return { cpu, memory: mem };
        });

        this.registerQuery('getProcessCount', () => {
            const windows = StateManager.getState('windows') || [];
            return { count: windows.length + 8 };
        });
    }

    onOpen() {
        return `
            <style>
                .taskmgr-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #c0c0c0;
                    font-size: 12px;
                }
                .taskmgr-tabs {
                    display: flex;
                    padding: 2px 4px 0 4px;
                    background: #c0c0c0;
                }
                .taskmgr-tab {
                    padding: 4px 12px;
                    background: #c0c0c0;
                    border: 2px solid;
                    border-color: #fff #808080 #c0c0c0 #fff;
                    cursor: pointer;
                    margin-right: 2px;
                    font-size: 12px;
                }
                .taskmgr-tab.active {
                    background: #c0c0c0;
                    border-bottom-color: #c0c0c0;
                    position: relative;
                    z-index: 1;
                    margin-bottom: -2px;
                    padding-bottom: 6px;
                }
                .taskmgr-tab:hover:not(.active) {
                    background: #d4d4d4;
                }
                .taskmgr-content {
                    flex: 1;
                    border: 2px solid;
                    border-color: #fff #808080 #808080 #fff;
                    background: #c0c0c0;
                    margin: 0 4px;
                    padding: 8px;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .taskmgr-panel {
                    display: none;
                    flex-direction: column;
                    height: 100%;
                }
                .taskmgr-panel.active {
                    display: flex;
                }
                .taskmgr-list {
                    flex: 1;
                    background: white;
                    border: 2px inset #fff;
                    overflow-y: auto;
                }
                .taskmgr-list-header {
                    display: grid;
                    grid-template-columns: 2fr 1fr 1fr;
                    background: #c0c0c0;
                    border-bottom: 2px solid #808080;
                    font-weight: bold;
                    padding: 3px 0;
                    position: sticky;
                    top: 0;
                }
                .taskmgr-list-header div {
                    padding: 2px 8px;
                    border-right: 1px solid #808080;
                }
                .taskmgr-list-item {
                    display: grid;
                    grid-template-columns: 2fr 1fr 1fr;
                    padding: 2px 0;
                    cursor: pointer;
                    border-bottom: 1px solid #e0e0e0;
                }
                .taskmgr-list-item:hover {
                    background: #e0e0ff;
                }
                .taskmgr-list-item.selected {
                    background: #000080;
                    color: white;
                }
                .taskmgr-list-item div {
                    padding: 2px 8px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .taskmgr-footer {
                    padding: 8px 4px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .taskmgr-btn {
                    padding: 4px 16px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    font-size: 12px;
                }
                .taskmgr-btn:active:not(:disabled) {
                    border-style: inset;
                }
                .taskmgr-btn:disabled {
                    color: #808080;
                    cursor: not-allowed;
                }
                .taskmgr-status {
                    display: flex;
                    gap: 20px;
                    font-size: 12px;
                }
                .taskmgr-status-item {
                    display: flex;
                    gap: 5px;
                }
                .perf-container {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    height: 100%;
                }
                .perf-box {
                    background: white;
                    border: 2px inset #fff;
                    padding: 8px;
                    display: flex;
                    flex-direction: column;
                }
                .perf-title {
                    font-weight: bold;
                    margin-bottom: 5px;
                    color: #000080;
                }
                .perf-graph {
                    flex: 1;
                    background: #000;
                    border: 1px solid #808080;
                    position: relative;
                    min-height: 80px;
                }
                .perf-graph canvas {
                    width: 100%;
                    height: 100%;
                }
                .perf-value {
                    margin-top: 5px;
                    font-size: 12px;
                    font-weight: bold;
                }
                .perf-details {
                    margin-top: 8px;
                    font-size: 12px;
                    color: #444;
                }
                .proc-list-header {
                    grid-template-columns: 2fr 1fr 1fr 1fr;
                }
                .proc-list-item {
                    grid-template-columns: 2fr 1fr 1fr 1fr;
                }
                .status-running {
                    color: #008000;
                }
                .status-minimized {
                    color: #808080;
                }
            </style>

            <div class="taskmgr-container">
                <div class="taskmgr-tabs">
                    <div class="taskmgr-tab active" data-tab="applications">Applications</div>
                    <div class="taskmgr-tab" data-tab="processes">Processes</div>
                    <div class="taskmgr-tab" data-tab="performance">Performance</div>
                </div>

                <div class="taskmgr-content">
                    <!-- Applications Tab -->
                    <div class="taskmgr-panel active" id="panel-applications">
                        <div class="taskmgr-list" id="app-list">
                            <div class="taskmgr-list-header">
                                <div>Task</div>
                                <div>Status</div>
                                <div>Memory</div>
                            </div>
                            <div id="app-list-body"></div>
                        </div>
                        <div style="margin-top: 8px; display: flex; gap: 8px;">
                            <button class="taskmgr-btn" id="btn-end-task" disabled>End Task</button>
                            <button class="taskmgr-btn" id="btn-switch-to" disabled>Switch To</button>
                            <button class="taskmgr-btn" id="btn-new-task">New Task...</button>
                        </div>
                    </div>

                    <!-- Processes Tab -->
                    <div class="taskmgr-panel" id="panel-processes">
                        <div class="taskmgr-list" id="proc-list">
                            <div class="taskmgr-list-header proc-list-header">
                                <div>Image Name</div>
                                <div>PID</div>
                                <div>CPU</div>
                                <div>Memory</div>
                            </div>
                            <div id="proc-list-body"></div>
                        </div>
                        <div style="margin-top: 8px; display: flex; gap: 8px;">
                            <button class="taskmgr-btn" id="btn-end-process" disabled>End Process</button>
                            <label style="margin-left: auto; display: flex; align-items: center; gap: 5px;">
                                <input type="checkbox" id="show-all-proc" checked> Show processes from all users
                            </label>
                        </div>
                    </div>

                    <!-- Performance Tab -->
                    <div class="taskmgr-panel" id="panel-performance">
                        <div class="perf-container">
                            <div class="perf-box">
                                <div class="perf-title">CPU Usage</div>
                                <div class="perf-graph">
                                    <canvas id="cpu-graph"></canvas>
                                </div>
                                <div class="perf-value" id="cpu-value">0%</div>
                            </div>
                            <div class="perf-box">
                                <div class="perf-title">Memory Usage</div>
                                <div class="perf-graph">
                                    <canvas id="mem-graph"></canvas>
                                </div>
                                <div class="perf-value" id="mem-value">0 MB / 640 KB</div>
                            </div>
                        </div>
                        <div class="perf-details" id="perf-details">
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                                <div>
                                    <strong>Totals:</strong><br>
                                    Handles: <span id="stat-handles">0</span><br>
                                    Threads: <span id="stat-threads">0</span><br>
                                    Processes: <span id="stat-processes">0</span>
                                </div>
                                <div>
                                    <strong>Physical Memory (K):</strong><br>
                                    Total: <span id="stat-total-mem">655360</span><br>
                                    Available: <span id="stat-avail-mem">0</span><br>
                                    System Cache: <span id="stat-cache">0</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="taskmgr-footer">
                    <div class="taskmgr-status">
                        <div class="taskmgr-status-item">
                            <span>Processes:</span>
                            <span id="footer-processes">0</span>
                        </div>
                        <div class="taskmgr-status-item">
                            <span>CPU Usage:</span>
                            <span id="footer-cpu">0%</span>
                        </div>
                        <div class="taskmgr-status-item">
                            <span>Memory:</span>
                            <span id="footer-mem">0K</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        // Tab switching
        const tabs = this.getElements('.taskmgr-tab');
        tabs.forEach(tab => {
            this.addHandler(tab, 'click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.currentTab = tab.dataset.tab;

                const panels = this.getElements('.taskmgr-panel');
                panels.forEach(p => p.classList.remove('active'));
                const targetPanel = this.getElement(`#panel-${tab.dataset.tab}`);
                if (targetPanel) targetPanel.classList.add('active');

                if (tab.dataset.tab === 'performance') {
                    this.initGraphs();
                }
            });
        });

        // Button handlers
        this.addHandler(this.getElement('#btn-end-task'), 'click', () => this.endSelectedTask());
        this.addHandler(this.getElement('#btn-switch-to'), 'click', () => this.switchToSelected());
        this.addHandler(this.getElement('#btn-new-task'), 'click', () => this.newTask());
        this.addHandler(this.getElement('#btn-end-process'), 'click', () => this.endSelectedProcess());

        // Subscribe to window events for real-time updates
        this.subscribeToEvents();

        // Start update loop
        this.updateInterval = setInterval(() => this.update(), 1000);
        this.update();
    }

    subscribeToEvents() {
        // Subscribe to window open/close events for immediate updates
        const onWindowOpen = () => {
            this.update();
        };

        const onWindowClose = () => {
            // Clear selection when a window closes
            const btnEndTask = this.getElement('#btn-end-task');
            const btnSwitchTo = this.getElement('#btn-switch-to');
            const btnEndProcess = this.getElement('#btn-end-process');
            if (btnEndTask) btnEndTask.disabled = true;
            if (btnSwitchTo) btnSwitchTo.disabled = true;
            if (btnEndProcess) btnEndProcess.disabled = true;
            this.update();
        };

        const onWindowFocus = () => {
            this.update();
        };

        const onWindowMinimize = () => {
            this.update();
        };

        const onWindowRestore = () => {
            this.update();
        };

        EventBus.on(Events.WINDOW_OPEN, onWindowOpen);
        EventBus.on(Events.WINDOW_CLOSE, onWindowClose);
        EventBus.on(Events.WINDOW_FOCUS, onWindowFocus);
        EventBus.on(Events.WINDOW_MINIMIZE, onWindowMinimize);
        EventBus.on(Events.WINDOW_RESTORE, onWindowRestore);

        // Store unsubscribers
        this.eventUnsubscribers.push(
            () => EventBus.off(Events.WINDOW_OPEN, onWindowOpen),
            () => EventBus.off(Events.WINDOW_CLOSE, onWindowClose),
            () => EventBus.off(Events.WINDOW_FOCUS, onWindowFocus),
            () => EventBus.off(Events.WINDOW_MINIMIZE, onWindowMinimize),
            () => EventBus.off(Events.WINDOW_RESTORE, onWindowRestore)
        );
    }

    onClose() {
        // Clear update interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        // Unsubscribe from events
        this.eventUnsubscribers.forEach(unsub => unsub());
        this.eventUnsubscribers = [];
    }

    update() {
        this.updateApplicationsList();
        this.updateProcessesList();
        this.updatePerformance();
        this.updateFooter();
    }

    /**
     * Get consistent memory value for a window
     */
    getWindowMemory(windowId) {
        if (!this.windowMemory.has(windowId)) {
            // Generate a stable memory value based on window ID hash
            let hash = 0;
            for (let i = 0; i < windowId.length; i++) {
                hash = ((hash << 5) - hash) + windowId.charCodeAt(i);
                hash = hash & hash;
            }
            // Base memory between 500K and 6000K
            const baseMem = 500 + Math.abs(hash % 5500);
            this.windowMemory.set(windowId, baseMem);
        }
        return this.windowMemory.get(windowId);
    }

    /**
     * Get or create PID for a window
     */
    getWindowPid(windowId) {
        if (!this.windowPids.has(windowId)) {
            this.windowPids.set(windowId, this.nextPid++);
        }
        return this.windowPids.get(windowId);
    }

    updateApplicationsList() {
        const listBody = this.getElement('#app-list-body');
        if (!listBody) return;

        // Get windows from StateManager (the source of truth)
        const windows = StateManager.getState('windows') || [];

        listBody.innerHTML = '';

        // Filter out Task Manager itself
        const filteredWindows = windows.filter(win => win.id !== 'taskmgr');

        if (filteredWindows.length === 0) {
            listBody.innerHTML = '<div style="padding: 10px; color: #666; text-align: center;">No running applications</div>';
            return;
        }

        // Get direct references to buttons (since we're in the right context during update)
        const btnEndTask = this.getElement('#btn-end-task');
        const btnSwitchTo = this.getElement('#btn-switch-to');

        filteredWindows.forEach(win => {
            const isMinimized = win.minimized;
            const status = isMinimized ? 'Minimized' : 'Running';
            const statusClass = isMinimized ? 'status-minimized' : 'status-running';
            const memUsage = this.getWindowMemory(win.id);

            // Extract title without icon
            let displayTitle = win.title || win.id;
            // Remove emoji prefix if present (icon is usually first character(s))
            displayTitle = displayTitle.replace(/^[\p{Emoji}\s]+/u, '').trim() || displayTitle;

            const item = document.createElement('div');
            item.className = 'taskmgr-list-item';
            item.dataset.windowId = win.id;
            item.innerHTML = `
                <div>📄 ${escapeHtml(displayTitle)}</div>
                <div class="${statusClass}">${escapeHtml(status)}</div>
                <div>${escapeHtml(memUsage.toLocaleString())} K</div>
            `;

            // Use direct DOM references captured in this scope
            item.addEventListener('click', () => {
                listBody.querySelectorAll('.taskmgr-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                if (btnEndTask) btnEndTask.disabled = false;
                if (btnSwitchTo) btnSwitchTo.disabled = false;
            });

            item.addEventListener('dblclick', () => {
                const winId = item.dataset.windowId;
                const winData = StateManager.getWindow(winId);
                if (winData && winData.minimized) {
                    WindowManager.restore(winId);
                } else {
                    WindowManager.focus(winId);
                }
            });

            listBody.appendChild(item);
        });
    }

    updateProcessesList() {
        const listBody = this.getElement('#proc-list-body');
        if (!listBody) return;

        // System processes (always present)
        const systemProcesses = [
            { name: 'System', pid: 4, cpu: '0', mem: 24, isSystem: true },
            { name: 'smss.exe', pid: 156, cpu: '0', mem: 160, isSystem: true },
            { name: 'csrss.exe', pid: 184, cpu: '1', mem: 1240, isSystem: true },
            { name: 'winlogon.exe', pid: 208, cpu: '0', mem: 2100, isSystem: true },
            { name: 'services.exe', pid: 252, cpu: '0', mem: 1800, isSystem: true },
            { name: 'lsass.exe', pid: 264, cpu: '0', mem: 1400, isSystem: true },
            { name: 'explorer.exe', pid: 1024, cpu: String(Math.floor(Math.random() * 5)), mem: 8420, isSystem: true },
            { name: 'taskmgr.exe', pid: 2048, cpu: String(Math.floor(Math.random() * 3)), mem: 2840, isSystem: true }
        ];

        // Add running windows as processes
        const windows = StateManager.getState('windows') || [];
        const appProcesses = windows
            .filter(win => win.id !== 'taskmgr') // Exclude task manager
            .map(win => {
                // Get app name from title or window ID
                let appName = win.title || win.id;
                // Clean up and create process name
                appName = appName.replace(/^[\p{Emoji}\s]+/u, '').trim().split(' ')[0].toLowerCase();
                if (!appName) appName = win.id;

                return {
                    name: `${appName}.exe`,
                    pid: this.getWindowPid(win.id),
                    cpu: String(Math.floor(Math.random() * 10)),
                    mem: this.getWindowMemory(win.id),
                    isSystem: false,
                    windowId: win.id
                };
            });

        const allProcesses = [...systemProcesses, ...appProcesses];

        listBody.innerHTML = '';

        // Get direct reference to button
        const btnEndProcess = this.getElement('#btn-end-process');

        allProcesses.forEach(proc => {
            const item = document.createElement('div');
            item.className = 'taskmgr-list-item proc-list-item';
            item.dataset.processName = proc.name;
            item.dataset.isSystem = proc.isSystem;
            if (proc.windowId) {
                item.dataset.windowId = proc.windowId;
            }
            item.innerHTML = `
                <div>${escapeHtml(proc.name)}</div>
                <div>${escapeHtml(String(proc.pid))}</div>
                <div>${escapeHtml(String(proc.cpu))}%</div>
                <div>${escapeHtml(proc.mem.toLocaleString())} K</div>
            `;

            item.addEventListener('click', () => {
                listBody.querySelectorAll('.taskmgr-list-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
                if (btnEndProcess) btnEndProcess.disabled = false;
            });

            listBody.appendChild(item);
        });

        // Update stats
        const statProcesses = this.getElement('#stat-processes');
        if (statProcesses) statProcesses.textContent = allProcesses.length;
    }

    updatePerformance() {
        // Calculate CPU based on number of windows (simulated load)
        const windows = StateManager.getState('windows') || [];
        const baseLoad = 5 + windows.length * 3;
        const cpuUsage = Math.min(95, baseLoad + Math.floor(Math.random() * 10));

        // Calculate memory based on window count
        const baseMemPercent = 20 + windows.length * 5;
        const memUsage = Math.min(90, baseMemPercent + Math.floor(Math.random() * 5));

        // Update history
        this.cpuHistory.push(cpuUsage);
        this.memHistory.push(memUsage);

        if (this.cpuHistory.length > this.maxHistoryPoints) {
            this.cpuHistory.shift();
            this.memHistory.shift();
        }

        // Update values
        const cpuValue = this.getElement('#cpu-value');
        const memValue = this.getElement('#mem-value');

        if (cpuValue) cpuValue.textContent = `${cpuUsage}%`;
        if (memValue) memValue.textContent = `${Math.floor(640 * memUsage / 100)} KB / 640 KB`;

        // Update stats
        const handles = this.getElement('#stat-handles');
        const threads = this.getElement('#stat-threads');
        const availMem = this.getElement('#stat-avail-mem');
        const cache = this.getElement('#stat-cache');

        const handleCount = 500 + windows.length * 50 + Math.floor(Math.random() * 100);
        const threadCount = 50 + windows.length * 5 + Math.floor(Math.random() * 10);

        if (handles) handles.textContent = handleCount;
        if (threads) threads.textContent = threadCount;
        if (availMem) availMem.textContent = Math.floor(655360 * (100 - memUsage) / 100);
        if (cache) cache.textContent = Math.floor(50000 + Math.random() * 50000);

        // Draw graphs if performance tab is active
        if (this.currentTab === 'performance') {
            this.drawGraph('cpu-graph', this.cpuHistory, '#00ff00');
            this.drawGraph('mem-graph', this.memHistory, '#ffff00');
        }
    }

    initGraphs() {
        this.drawGraph('cpu-graph', this.cpuHistory, '#00ff00');
        this.drawGraph('mem-graph', this.memHistory, '#ffff00');
    }

    drawGraph(canvasId, data, color) {
        const canvas = this.getElement(`#${canvasId}`);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const rect = canvas.parentElement.getBoundingClientRect();

        canvas.width = rect.width - 2;
        canvas.height = rect.height - 2;

        const width = canvas.width;
        const height = canvas.height;

        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        // Draw grid
        ctx.strokeStyle = '#003300';
        ctx.lineWidth = 1;

        for (let i = 0; i < 10; i++) {
            const y = (height / 10) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        for (let i = 0; i < 12; i++) {
            const x = (width / 12) * i;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }

        // Draw data line
        if (data.length > 1) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();

            const step = width / (this.maxHistoryPoints - 1);
            const startX = width - (data.length - 1) * step;

            for (let i = 0; i < data.length; i++) {
                const x = startX + i * step;
                const y = height - (data[i] / 100) * height;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();

            // Fill under the line
            ctx.lineTo(startX + (data.length - 1) * step, height);
            ctx.lineTo(startX, height);
            ctx.closePath();
            ctx.fillStyle = color.replace('#', '#') + '33';
            ctx.fill();
        }
    }

    updateFooter() {
        const windows = StateManager.getState('windows') || [];
        const processes = windows.length + 8; // +8 for system processes
        const cpu = this.cpuHistory.length > 0 ? this.cpuHistory[this.cpuHistory.length - 1] : 0;
        const mem = this.memHistory.length > 0 ? this.memHistory[this.memHistory.length - 1] : 0;

        const footerProcesses = this.getElement('#footer-processes');
        const footerCpu = this.getElement('#footer-cpu');
        const footerMem = this.getElement('#footer-mem');

        if (footerProcesses) footerProcesses.textContent = processes;
        if (footerCpu) footerCpu.textContent = `${cpu}%`;
        if (footerMem) footerMem.textContent = `${Math.floor(640 * mem / 100)}K / 640K`;
    }

    endSelectedTask() {
        const selected = this.getElement('#app-list-body .taskmgr-list-item.selected');
        if (!selected) return;

        const windowId = selected.dataset.windowId;
        if (windowId) {
            // Use WindowManager to properly close the window
            WindowManager.close(windowId);
            this.playSound('close');

            // Clean up our tracking
            this.windowMemory.delete(windowId);
            this.windowPids.delete(windowId);

            // Disable buttons
            this.getElement('#btn-end-task').disabled = true;
            this.getElement('#btn-switch-to').disabled = true;
        }
    }

    switchToSelected() {
        const selected = this.getElement('#app-list-body .taskmgr-list-item.selected');
        if (!selected) return;

        const windowId = selected.dataset.windowId;
        if (windowId) {
            this.switchToWindow(windowId);
        }
    }

    switchToWindow(windowId) {
        const win = StateManager.getWindow(windowId);
        if (win && win.minimized) {
            // Restore if minimized
            WindowManager.restore(windowId);
        } else {
            // Just focus
            WindowManager.focus(windowId);
        }
    }

    newTask() {
        // Launch the Run dialog if available, otherwise show a file browser
        const runApp = AppRegistry.get('run');
        if (runApp) {
            AppRegistry.launch('run');
        } else {
            // Fallback: show file browser
            const myComputerApp = AppRegistry.get('mycomputer');
            if (myComputerApp) {
                AppRegistry.launch('mycomputer');
            } else {
                EventBus.emit(Events.DIALOG_ALERT, {
                    message: 'Run dialog is not available.',
                    title: 'Task Manager'
                });
            }
        }
    }

    endSelectedProcess() {
        const selected = this.getElement('#proc-list-body .taskmgr-list-item.selected');
        if (!selected) return;

        const processName = selected.dataset.processName;
        const isSystem = selected.dataset.isSystem === 'true';
        const windowId = selected.dataset.windowId;

        // Check for system processes
        if (isSystem) {
            EventBus.emit(Events.DIALOG_ALERT, {
                message: `Unable to terminate process "${processName}".\n\nThis is a critical system process. Terminating this process would make the system unstable.`,
                title: 'Task Manager Warning'
            });
            return;
        }

        // For app processes, close the associated window
        if (windowId) {
            WindowManager.close(windowId);

            // Clean up tracking
            this.windowMemory.delete(windowId);
            this.windowPids.delete(windowId);

            EventBus.emit(Events.DIALOG_ALERT, {
                message: `Process "${processName}" has been terminated.`,
                title: 'Task Manager'
            });
        }

        this.getElement('#btn-end-process').disabled = true;
    }
}

export default TaskManager;
