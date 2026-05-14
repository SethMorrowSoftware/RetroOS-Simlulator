/**
 * WindowManager - Central window lifecycle management
 * Handles create, focus, minimize, maximize, close, drag, resize
 * All window operations go through this manager
 */

import EventBus, { Events } from './EventBus.js';
import StateManager from './StateManager.js';
import StorageManager from './StorageManager.js';
import { escapeHtml } from './Sanitize.js';

class WindowManagerClass {
    constructor() {
        // Currently dragging window
        this.draggedWindow = null;
        // Currently resizing window
        this.resizingWindow = null;
        // Drag offset
        this.dragOffset = { x: 0, y: 0 };
        // Window counter for z-index
        this.zCounter = 1000;
        // Minimum window dimensions
        this.minWidth = 300;
        this.minHeight = 200;
        // Resize direction for multi-edge resizing
        this.resizeDirection = null;
        // Initial resize state
        this.resizeStart = null;
        // Pre-maximize positions for restore
        this.preMaximizeState = new Map();
        // Snap preview element
        this.snapPreview = null;
        // Modal window stack — topmost modal blocks input to all windows below it
        this._modalStack = [];
        // Per-window modal cleanup callbacks invoked by close()
        this._modalCleanups = new Map();
        // Bound handlers for cleanup
        this.boundDragMove = this.handleDragMove.bind(this);
        this.boundDragEnd = this.handleDragEnd.bind(this);
        this.boundResizeMove = this.handleResizeMove.bind(this);
        this.boundResizeEnd = this.handleResizeEnd.bind(this);
        // Touch handlers
        this.boundTouchDragMove = this.handleTouchDragMove.bind(this);
        this.boundTouchDragEnd = this.handleTouchDragEnd.bind(this);
        this.boundTouchResizeMove = this.handleTouchResizeMove.bind(this);
        this.boundTouchResizeEnd = this.handleTouchResizeEnd.bind(this);
    }

    /**
     * Initialize window manager
     */
    initialize() {
        // Listen for state changes to update taskbar
        StateManager.subscribe('windows', () => {
            EventBus.emit(Events.TASKBAR_UPDATE);
        });

        // P2.7 — state.ui.activeWindow is the single source of truth for which
        // window has focus. The DOM `.active` class is a derived view: this
        // subscription mirrors the state value onto the DOM so focus() callers
        // never need to touch the class list directly. The dual-write pattern
        // (state + DOM in every focus path) was the audit's CC-2 row 4 drift.
        StateManager.subscribe('ui.activeWindow', (activeId) => {
            this._renderActiveWindow(activeId);
        });

        // Create snap preview element
        this.snapPreview = document.createElement('div');
        this.snapPreview.className = 'snap-preview';
        document.body.appendChild(this.snapPreview);

        // Create modal overlay element (blocks interaction with windows behind a modal)
        this._modalOverlay = document.createElement('div');
        this._modalOverlay.className = 'window-modal-overlay';
        this._modalOverlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;background:rgba(0,0,0,0.25);';
        this._modalOverlay.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            // Flash the modal window to indicate it requires attention
            const topModal = this._modalStack[this._modalStack.length - 1];
            if (topModal) {
                const modalEl = document.getElementById(`window-${topModal}`);
                if (modalEl) {
                    modalEl.classList.add('modal-flash');
                    setTimeout(() => modalEl.classList.remove('modal-flash'), 300);
                    EventBus.emit(Events.SOUND_PLAY, { type: 'error' });
                }
            }
        });
        document.body.appendChild(this._modalOverlay);

        // Keyboard isolation: prevent keyboard events from reaching non-active windows
        document.addEventListener('keydown', (e) => {
            if (this._modalStack.length > 0) {
                const topModal = this._modalStack[this._modalStack.length - 1];
                const activeEl = document.activeElement;
                const modalEl = document.getElementById(`window-${topModal}`);
                // If focus is outside the modal window, redirect it
                if (modalEl && activeEl && !modalEl.contains(activeEl)) {
                    const focusable = modalEl.querySelector('input, textarea, button, select, [tabindex]');
                    if (focusable) focusable.focus();
                    e.stopPropagation();
                }
            }
        }, true);

        // Persist window session state before page unload for session recovery
        window.addEventListener('beforeunload', () => {
            this._persistSession();
        });
    }

    /**
     * Create a new window
     * @param {Object} config - Window configuration
     * @returns {HTMLElement} Window element
     */
    create(config) {
        const {
            id,
            title,
            content,
            width = 500,
            height = 'auto',
            icon = '&#128196;',  // HTML entity for page emoji - safe encoding
            resizable = true,
            onClose = null
        } = config;

        // Check if window already exists
        const existing = document.getElementById(`window-${id}`);
        if (existing) {
            this.focus(id);
            return existing;
        }

        // Play open sound
        EventBus.emit(Events.SOUND_PLAY, { type: 'open' });

        // Create window element
        const windowEl = document.createElement('div');
        windowEl.id = `window-${id}`;
        windowEl.className = 'window open active opening'; // Add 'opening' for animation
        windowEl.style.width = typeof width === 'number' ? `${width}px` : width;
        if (height !== 'auto') {
            windowEl.style.height = typeof height === 'number' ? `${height}px` : height;
        }

        // Calculate position with improved cascade
        const position = this.calculateCascadePosition(width, height);
        windowEl.style.left = `${position.left}px`;
        windowEl.style.top = `${position.top}px`;
        windowEl.style.zIndex = ++this.zCounter;

        // Build window HTML - using ASCII-safe characters for buttons
        windowEl.innerHTML = `
            <div class="title-bar" data-window-id="${id}">
                <span class="title-text">
                    <span style="margin-right: 5px;">${escapeHtml(icon)}</span>
                    ${escapeHtml(title)}
                </span>
            <div class="window-controls">
                    <button class="window-button window-button-minimize" data-action="minimize" title="Minimize" aria-label="Minimize window"><span aria-hidden="true"></span></button>
                    <button class="window-button window-button-maximize" data-action="maximize" title="Maximize" aria-label="Maximize window"><span aria-hidden="true"></span></button>
                    <button class="window-button window-button-close" data-action="close" title="Close" aria-label="Close window"><span aria-hidden="true"></span></button>
                </div>
            </div>
            <div class="window-content">${content}</div>
            ${resizable ? this.createResizeHandles(id) : ''}
        `;

        // Add to DOM
        document.body.appendChild(windowEl);

        // Remove opening animation class after it completes
        setTimeout(() => {
            windowEl.classList.remove('opening');
        }, 150);

        // Setup event listeners
        this.setupWindowEvents(windowEl, id, onClose);

        // Add to state
        StateManager.addWindow({
            id,
            title: `${icon} ${title}`,
            element: windowEl,
            onClose
        });

        // Emit open event
        EventBus.emit(Events.WINDOW_OPEN, { id, title });

        // Check achievement
        if (StateManager.getState('windows').length >= 10) {
            StateManager.unlockAchievement('multitasker');
        }

        return windowEl;
    }

    /**
     * Create resize handles for all 8 directions
     * @param {string} id - Window ID
     * @returns {string} HTML for resize handles
     */
    createResizeHandles(id) {
        const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
        return directions.map(dir =>
            `<div class="resize-handle resize-handle-${dir}" data-window-id="${id}" data-direction="${dir}"></div>`
        ).join('');
    }

    /**
     * Calculate cascade position for new window
     * @param {number} width - Window width
     * @param {number} height - Window height
     * @returns {{left: number, top: number}}
     */
    calculateCascadePosition(width, height) {
        const windowCount = StateManager.getState('windows').length;
        const cascadeOffset = 30;
        const maxCascade = 10; // Reset cascade after 10 windows
        const cascadeIndex = windowCount % maxCascade;

        // Available area = viewport minus the taskbar at the bottom.
        const taskbarEl = document.querySelector('.taskbar');
        const taskbarH = (taskbarEl ? taskbarEl.offsetHeight : null) || 36;
        const availW = window.innerWidth;
        const availH = window.innerHeight - taskbarH;

        const baseWidth  = typeof width  === 'number' ? width  : 500;
        const baseHeight = typeof height === 'number' ? height : 400;

        // Horizontal: center, then cascade right
        const baseLeft = Math.max(10, (availW - baseWidth) / 2);

        // Vertical: if window is taller than available, sit at top; otherwise
        // start ~80px down and cascade
        let baseTop;
        if (baseHeight >= availH - 16) {
            baseTop = 0;
        } else {
            baseTop = Math.max(10, Math.min(80, (availH - baseHeight) / 2 - 60));
        }

        let left = baseLeft + (cascadeIndex * cascadeOffset);
        let top  = baseTop  + (cascadeIndex * cascadeOffset);

        // Clamp so the window is fully on-screen when possible. When the
        // window is larger than the available area, prefer top-left so the
        // title-bar and primary controls remain reachable.
        if (left + baseWidth > availW) {
            left = Math.max(0, availW - baseWidth);
        }
        if (top + baseHeight > availH) {
            top = Math.max(0, availH - baseHeight);
        }

        return { left, top };
    }

    /**
     * Setup event listeners for a window
     * @param {HTMLElement} windowEl - Window element
     * @param {string} id - Window ID
     * @param {Function} onClose - Close callback
     */
    setupWindowEvents(windowEl, id, onClose) {
        const titleBar = windowEl.querySelector('.title-bar');
        const controls = windowEl.querySelector('.window-controls');
        const resizeHandles = windowEl.querySelectorAll('.resize-handle');

        // Title bar drag (mouse)
        titleBar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.window-controls')) return;
            this.startDrag(e, id);
        });

        // Title bar drag (touch)
        titleBar.addEventListener('touchstart', (e) => {
            if (e.target.closest('.window-controls')) return;
            this.startTouchDrag(e, id);
        }, { passive: false });

        // Double-click/tap to maximize (ignore clicks on control buttons)
        titleBar.addEventListener('dblclick', (e) => {
            if (e.target.closest('.window-controls')) return;
            this.maximize(id);
        });

        // Prevent control interactions from bubbling into title-bar drag/maximize
        controls.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });
        controls.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            e.preventDefault();
        });

        // Window controls
        controls.addEventListener('click', (e) => {
            const button = e.target.closest('.window-button');
            if (!button) return;

            e.preventDefault();
            e.stopPropagation();

            const action = button.dataset.action;
            if (action === 'minimize') this.minimize(id);
            else if (action === 'maximize') this.maximize(id);
            else if (action === 'close') this.close(id);
        });

        // Resize handles - all 8 directions (mouse)
        resizeHandles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => {
                const direction = handle.dataset.direction;
                this.startResize(e, id, direction);
            });
            // Touch support for resize
            handle.addEventListener('touchstart', (e) => {
                const direction = handle.dataset.direction;
                this.startTouchResize(e, id, direction);
            }, { passive: false });
        });

        // Click to focus
        windowEl.addEventListener('mousedown', () => this.focus(id));
    }

    /**
     * Focus a window (bring to front)
     * If the window is minimized, it will be restored automatically (Windows 95 behavior)
     * @param {string} id - Window ID
     */
    focus(id) {
        const windowEl = document.getElementById(`window-${id}`);
        if (!windowEl) return;

        // If a modal is active and this window isn't the modal, block the focus
        if (this.isBlockedByModal(id)) {
            // Flash the modal to indicate it needs attention
            const topModal = this._modalStack[this._modalStack.length - 1];
            const modalEl = document.getElementById(`window-${topModal}`);
            if (modalEl) {
                modalEl.classList.add('modal-flash');
                setTimeout(() => modalEl.classList.remove('modal-flash'), 300);
            }
            return;
        }

        // If minimized, restore it first (Windows 95 behavior)
        if (this.isMinimized(id)) {
            this.restore(id);
            return; // restore() already calls focus()
        }

        // Compact z-indices periodically to prevent unbounded growth
        if (this.zCounter > 10000) {
            this.compactZIndices();
        }

        windowEl.style.zIndex = ++this.zCounter;

        // Update state — the `ui.activeWindow` subscription in initialize()
        // mirrors the change onto the DOM `.active` class. Don't write the
        // class here, or focus paths drift from each other.
        StateManager.focusWindow(id);

        // Emit focus event
        EventBus.emit(Events.WINDOW_FOCUS, { id });
    }

    /**
     * Mirror `state.ui.activeWindow` onto the DOM `.active` class. Single
     * writer of the class — every other code path must go through state.
     *
     * @param {string|null} activeId - Window ID that is now active, or null.
     * @private
     */
    _renderActiveWindow(activeId) {
        document.querySelectorAll('.window.active').forEach(w => {
            if (w.id !== `window-${activeId}`) {
                w.classList.remove('active');
            }
        });
        if (activeId) {
            const el = document.getElementById(`window-${activeId}`);
            if (el) el.classList.add('active');
        }
    }

    /**
     * Compact z-indices of all open windows to prevent unbounded growth
     * Renumbers all visible windows starting from the base z-index
     */
    compactZIndices() {
        const windows = document.querySelectorAll('.window:not(.minimized)');
        const sorted = [...windows].sort((a, b) =>
            parseInt(a.style.zIndex || 0) - parseInt(b.style.zIndex || 0)
        );
        this.zCounter = 1000;
        sorted.forEach(w => {
            w.style.zIndex = ++this.zCounter;
        });
    }

    /**
     * Minimize a window
     * @param {string} id - Window ID
     */
    minimize(id) {
        const windowEl = document.getElementById(`window-${id}`);
        if (!windowEl) return;

        windowEl.classList.add('minimizing');

        // If this is the active window, clear state.ui.activeWindow — the
        // subscription will pull the `.active` class off the DOM as part of
        // the next render. Keeps state and DOM in lockstep.
        const wasActive = StateManager.getState('ui.activeWindow') === id;

        setTimeout(() => {
            windowEl.classList.remove('minimizing');
            windowEl.classList.add('minimized'); // Hide the window
            StateManager.updateWindow(id, { minimized: true });
            if (wasActive) {
                StateManager.setState('ui.activeWindow', null);
            }
            EventBus.emit(Events.WINDOW_MINIMIZE, { id });
        }, 200);

        EventBus.emit(Events.SOUND_PLAY, { type: 'click' });
    }

    /**
     * Restore a minimized window
     * @param {string} id - Window ID
     */
    restore(id) {
        const windowEl = document.getElementById(`window-${id}`);
        if (!windowEl) return;

        windowEl.classList.remove('minimized'); // Show the window
        windowEl.classList.add('restoring');

        setTimeout(() => {
            windowEl.classList.remove('restoring');
        }, 200);

        StateManager.updateWindow(id, { minimized: false });
        this.focus(id);

        EventBus.emit(Events.WINDOW_RESTORE, { id });
    }

    /**
     * Toggle maximize state with smooth animation
     * @param {string} id - Window ID
     */
    maximize(id) {
        const windowEl = document.getElementById(`window-${id}`);
        if (!windowEl) return;

        const isMaximized = windowEl.classList.contains('maximized');

        if (!isMaximized) {
            // Store current position and size before maximizing
            this.preMaximizeState.set(id, {
                left: windowEl.style.left,
                top: windowEl.style.top,
                width: windowEl.style.width,
                height: windowEl.style.height
            });

            // Add animation class
            windowEl.classList.add('maximizing');

            // Small delay to ensure transition class is applied
            requestAnimationFrame(() => {
                windowEl.classList.add('maximized');
            });

            // Remove animation class after transition
            setTimeout(() => {
                windowEl.classList.remove('maximizing');
            }, 150);
        } else {
            // Restore previous position and size
            const prevState = this.preMaximizeState.get(id);

            windowEl.classList.add('maximizing');
            windowEl.classList.remove('maximized');

            if (prevState) {
                windowEl.style.left = prevState.left;
                windowEl.style.top = prevState.top;
                windowEl.style.width = prevState.width;
                windowEl.style.height = prevState.height;
            }

            setTimeout(() => {
                windowEl.classList.remove('maximizing');
            }, 150);
        }

        StateManager.updateWindow(id, { maximized: !isMaximized });
        EventBus.emit(Events.WINDOW_MAXIMIZE, { id, maximized: !isMaximized });
    }

    /**
     * Close a window
     * @param {string} id - Window ID
     */
    close(id) {
        const windowEl = document.getElementById(`window-${id}`);
        if (!windowEl || windowEl.dataset.closing) return;
        windowEl.dataset.closing = 'true';

        // Get window data for callback
        const windowData = StateManager.getWindow(id);

        // Modal cleanup is invoked deterministically here (rather than via a
        // WINDOW_CLOSE listener) so two modals closing in rapid succession
        // can't race on a one-shot listener and leave _modalStack out of sync.
        if (this._modalCleanups && this._modalCleanups.has(id)) {
            try {
                this._modalCleanups.get(id)();
            } catch (e) {
                console.error('[WindowManager] Modal cleanup failed:', e);
            }
            this._modalCleanups.delete(id);
        }

        // Play close sound
        EventBus.emit(Events.SOUND_PLAY, { type: 'close' });

        // Animate out
        windowEl.classList.add('minimizing');

        setTimeout(() => {
            // Call onClose callback if provided
            if (windowData && windowData.onClose) {
                windowData.onClose();
            }

            // Remove from DOM
            windowEl.remove();

            // Remove from state
            StateManager.removeWindow(id);

            // Clean up pre-maximize state
            this.preMaximizeState.delete(id);

            // Emit close event
            EventBus.emit(Events.WINDOW_CLOSE, { id });
        }, 200);
    }

    /**
     * Close all windows
     */
    closeAll() {
        const windows = [...StateManager.getState('windows')];
        windows.forEach(w => this.close(w.id));
    }

    // ===== DRAG HANDLING =====

    /**
     * Start dragging a window
     * @param {MouseEvent} e - Mouse event
     * @param {string} id - Window ID
     */
    startDrag(e, id) {
        const windowEl = document.getElementById(`window-${id}`);
        if (!windowEl) return;

        // If maximized, un-maximize first with smart positioning
        if (windowEl.classList.contains('maximized')) {
            const prevState = this.preMaximizeState.get(id);
            windowEl.classList.remove('maximized');

            // Position window so mouse is in the same relative position on the title bar
            if (prevState) {
                const prevWidth = parseInt(prevState.width) || 500;
                const mouseXRatio = e.clientX / window.innerWidth;
                const newLeft = e.clientX - (prevWidth * mouseXRatio);

                windowEl.style.left = `${Math.max(0, newLeft)}px`;
                windowEl.style.top = '0px';
                windowEl.style.width = prevState.width;
                windowEl.style.height = prevState.height;
            }

            StateManager.updateWindow(id, { maximized: false });
        }

        // Prevent concurrent drags — clean up any previous drag first
        if (this.draggedWindow) {
            document.removeEventListener('mousemove', this.boundDragMove);
            document.removeEventListener('mouseup', this.boundDragEnd);
            this.draggedWindow.element.classList.remove('dragging');
        }

        this.draggedWindow = { element: windowEl, id };
        const rect = windowEl.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };

        // Add dragging class and body state
        windowEl.classList.add('dragging');
        document.body.classList.add('window-dragging');

        document.addEventListener('mousemove', this.boundDragMove);
        document.addEventListener('mouseup', this.boundDragEnd);

        EventBus.emit(Events.DRAG_START, {
            itemId: id,
            itemType: 'window',
            x: e.clientX,
            y: e.clientY
        });
    }

    /**
     * Handle window drag movement
     * @param {MouseEvent} e - Mouse event
     */
    handleDragMove(e) {
        if (!this.draggedWindow) return;

        let x = e.clientX - this.dragOffset.x;
        let y = e.clientY - this.dragOffset.y;

        // Keep window accessible - at least 100px visible on each side
        // and title bar must stay within viewport
        const windowEl = this.draggedWindow.element;
        const windowWidth = windowEl.offsetWidth || 300;

        x = Math.max(100 - windowWidth, Math.min(x, window.innerWidth - 100));
        y = Math.max(0, Math.min(y, window.innerHeight - 36));

        windowEl.style.left = `${x}px`;
        windowEl.style.top = `${y}px`;

        // Check for snap zones
        if (e.clientY <= 5) {
            this.showSnapPreview('maximize');
        } else if (e.clientX <= 5) {
            this.showSnapPreview('left');
        } else if (e.clientX >= window.innerWidth - 5) {
            this.showSnapPreview('right');
        } else {
            this.hideSnapPreview();
        }
    }

    /**
     * Show snap preview overlay
     * @param {string} type - Snap type ('maximize', 'left', 'right')
     */
    showSnapPreview(type) {
        if (!this.snapPreview) return;

        this.currentSnapType = type;

        if (type === 'maximize') {
            this.snapPreview.style.top = '0';
            this.snapPreview.style.left = '0';
            this.snapPreview.style.width = '100%';
            this.snapPreview.style.height = 'calc(100vh - 36px)';
        } else if (type === 'left') {
            this.snapPreview.style.top = '0';
            this.snapPreview.style.left = '0';
            this.snapPreview.style.width = '50%';
            this.snapPreview.style.height = 'calc(100vh - 36px)';
        } else if (type === 'right') {
            this.snapPreview.style.top = '0';
            this.snapPreview.style.left = '50%';
            this.snapPreview.style.width = '50%';
            this.snapPreview.style.height = 'calc(100vh - 36px)';
        }

        this.snapPreview.classList.add('active');
    }

    /**
     * Hide snap preview overlay
     */
    hideSnapPreview() {
        if (this.snapPreview) {
            this.snapPreview.classList.remove('active');
        }
        this.currentSnapType = null;
    }

    /**
     * End window drag
     * @param {MouseEvent} e - Mouse event
     */
    handleDragEnd(e) {
        if (this.draggedWindow) {
            const { element, id } = this.draggedWindow;

            // Apply snap if in a snap zone
            if (this.currentSnapType) {
                // Store current position before snapping
                this.preMaximizeState.set(id, {
                    left: element.style.left,
                    top: element.style.top,
                    width: element.style.width,
                    height: element.style.height
                });

                if (this.currentSnapType === 'maximize') {
                    element.classList.add('maximized');
                    StateManager.updateWindow(id, { maximized: true });
                } else if (this.currentSnapType === 'left') {
                    element.classList.remove('maximized');
                    element.style.top = '0px';
                    element.style.left = '0px';
                    element.style.width = '50%';
                    element.style.height = 'calc(100vh - 36px)';
                    StateManager.updateWindow(id, { snapped: 'left' });
                } else if (this.currentSnapType === 'right') {
                    element.classList.remove('maximized');
                    element.style.top = '0px';
                    element.style.left = '50%';
                    element.style.width = '50%';
                    element.style.height = 'calc(100vh - 36px)';
                    StateManager.updateWindow(id, { snapped: 'right' });
                }
            }

            // Remove dragging class
            element.classList.remove('dragging');
            document.body.classList.remove('window-dragging');

            const snapTarget = this.currentSnapType || 'desktop';
            this.hideSnapPreview();
            EventBus.emit(Events.DRAG_END, {
                itemId: id,
                x: e.clientX,
                y: e.clientY,
                target: snapTarget
            });
        }

        this.draggedWindow = null;
        document.removeEventListener('mousemove', this.boundDragMove);
        document.removeEventListener('mouseup', this.boundDragEnd);
    }

    // ===== TOUCH DRAG HANDLING =====

    /**
     * Start touch dragging a window
     * @param {TouchEvent} e - Touch event
     * @param {string} id - Window ID
     */
    startTouchDrag(e, id) {
        if (e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        const windowEl = document.getElementById(`window-${id}`);
        if (!windowEl) return;

        // If maximized, un-maximize first
        if (windowEl.classList.contains('maximized')) {
            const prevState = this.preMaximizeState.get(id);
            windowEl.classList.remove('maximized');

            if (prevState) {
                const prevWidth = parseInt(prevState.width) || 500;
                const touchXRatio = touch.clientX / window.innerWidth;
                const newLeft = touch.clientX - (prevWidth * touchXRatio);

                windowEl.style.left = `${Math.max(0, newLeft)}px`;
                windowEl.style.top = '0px';
                windowEl.style.width = prevState.width;
                windowEl.style.height = prevState.height;
            }

            StateManager.updateWindow(id, { maximized: false });
        }

        this.draggedWindow = { element: windowEl, id };
        const rect = windowEl.getBoundingClientRect();
        this.dragOffset = {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top
        };

        windowEl.classList.add('dragging');
        document.body.classList.add('window-dragging');

        document.addEventListener('touchmove', this.boundTouchDragMove, { passive: false });
        document.addEventListener('touchend', this.boundTouchDragEnd);
        document.addEventListener('touchcancel', this.boundTouchDragEnd);
    }

    /**
     * Handle touch drag movement
     * @param {TouchEvent} e - Touch event
     */
    handleTouchDragMove(e) {
        if (!this.draggedWindow || e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        let x = touch.clientX - this.dragOffset.x;
        let y = touch.clientY - this.dragOffset.y;

        x = Math.max(-50, Math.min(x, window.innerWidth - 100));
        y = Math.max(0, Math.min(y, window.innerHeight - 36));

        this.draggedWindow.element.style.left = `${x}px`;
        this.draggedWindow.element.style.top = `${y}px`;

        // Snap preview for touch
        if (touch.clientY <= 20) {
            this.showSnapPreview('maximize');
        } else {
            this.hideSnapPreview();
        }
    }

    /**
     * End touch drag
     * @param {TouchEvent} e - Touch event
     */
    handleTouchDragEnd(e) {
        if (this.draggedWindow) {
            const { element, id } = this.draggedWindow;

            // Check for snap-to-maximize (finger released near top)
            const touch = e.changedTouches?.[0];
            if (touch && touch.clientY <= 20) {
                this.hideSnapPreview();
                this.preMaximizeState.set(id, {
                    left: element.style.left,
                    top: element.style.top,
                    width: element.style.width,
                    height: element.style.height
                });
                element.classList.add('maximized');
                StateManager.updateWindow(id, { maximized: true });
            }

            element.classList.remove('dragging');
            document.body.classList.remove('window-dragging');
            this.hideSnapPreview();
        }

        this.draggedWindow = null;
        document.removeEventListener('touchmove', this.boundTouchDragMove);
        document.removeEventListener('touchend', this.boundTouchDragEnd);
        document.removeEventListener('touchcancel', this.boundTouchDragEnd);
    }

    // ===== RESIZE HANDLING =====

    /**
     * Start resizing a window
     * @param {MouseEvent} e - Mouse event
     * @param {string} id - Window ID
     * @param {string} direction - Resize direction (n, s, e, w, ne, nw, se, sw)
     */
    startResize(e, id, direction = 'se') {
        e.preventDefault();
        e.stopPropagation();

        const windowEl = document.getElementById(`window-${id}`);
        if (!windowEl) return;

        const rect = windowEl.getBoundingClientRect();

        // Prevent concurrent resizes — clean up any previous resize first
        if (this.resizingWindow) {
            document.removeEventListener('mousemove', this.boundResizeMove);
            document.removeEventListener('mouseup', this.boundResizeEnd);
            this.resizingWindow.element.classList.remove('resizing');
        }

        this.resizingWindow = { element: windowEl, id };
        this.resizeDirection = direction;
        this.resizeStart = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top
        };

        // Add resizing class
        windowEl.classList.add('resizing');
        document.body.classList.add('window-resizing', `window-resizing-${direction}`);

        document.addEventListener('mousemove', this.boundResizeMove);
        document.addEventListener('mouseup', this.boundResizeEnd);
    }

    /**
     * Handle resize movement for all 8 directions
     * @param {MouseEvent} e - Mouse event
     */
    handleResizeMove(e) {
        if (!this.resizingWindow || !this.resizeStart) return;

        const { element } = this.resizingWindow;
        const { mouseX, mouseY, width, height, left, top } = this.resizeStart;
        const dir = this.resizeDirection;

        const deltaX = e.clientX - mouseX;
        const deltaY = e.clientY - mouseY;

        let newWidth = width;
        let newHeight = height;
        let newLeft = left;
        let newTop = top;

        // Handle horizontal resizing
        if (dir.includes('e')) {
            newWidth = Math.max(this.minWidth, width + deltaX);
        }
        if (dir.includes('w')) {
            const potentialWidth = width - deltaX;
            if (potentialWidth >= this.minWidth) {
                newWidth = potentialWidth;
                newLeft = left + deltaX;
            }
        }

        // Handle vertical resizing
        if (dir.includes('s')) {
            newHeight = Math.max(this.minHeight, height + deltaY);
        }
        if (dir.includes('n')) {
            const potentialHeight = height - deltaY;
            if (potentialHeight >= this.minHeight) {
                newHeight = potentialHeight;
                newTop = top + deltaY;
            }
        }

        // Apply changes
        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;

        if (dir.includes('w')) {
            element.style.left = `${newLeft}px`;
        }
        if (dir.includes('n')) {
            element.style.top = `${newTop}px`;
        }

        // Emit resize event for apps to react
        EventBus.emit(Events.WINDOW_RESIZE, {
            id: this.resizingWindow.id,
            width: newWidth,
            height: newHeight,
            isResizing: true
        });
    }

    /**
     * End resize
     */
    handleResizeEnd() {
        if (this.resizingWindow) {
            const { id, element } = this.resizingWindow;
            const rect = element.getBoundingClientRect();

            // Remove resizing classes
            element.classList.remove('resizing');
            document.body.classList.remove('window-resizing');
            document.body.classList.remove(`window-resizing-${this.resizeDirection}`);

            // Emit final resize event
            EventBus.emit(Events.WINDOW_RESIZE, {
                id,
                width: rect.width,
                height: rect.height,
                isResizing: false
            });
        }

        this.resizingWindow = null;
        this.resizeDirection = null;
        this.resizeStart = null;
        document.removeEventListener('mousemove', this.boundResizeMove);
        document.removeEventListener('mouseup', this.boundResizeEnd);
    }

    // ===== TOUCH RESIZE HANDLING =====

    /**
     * Start touch resizing a window
     * @param {TouchEvent} e - Touch event
     * @param {string} id - Window ID
     * @param {string} direction - Resize direction
     */
    startTouchResize(e, id, direction = 'se') {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches[0];
        const windowEl = document.getElementById(`window-${id}`);
        if (!windowEl) return;

        const rect = windowEl.getBoundingClientRect();

        this.resizingWindow = { element: windowEl, id };
        this.resizeDirection = direction;
        this.resizeStart = {
            mouseX: touch.clientX,
            mouseY: touch.clientY,
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top
        };

        windowEl.classList.add('resizing');
        document.body.classList.add('window-resizing', `window-resizing-${direction}`);

        document.addEventListener('touchmove', this.boundTouchResizeMove, { passive: false });
        document.addEventListener('touchend', this.boundTouchResizeEnd);
        document.addEventListener('touchcancel', this.boundTouchResizeEnd);
    }

    /**
     * Handle touch resize movement
     * @param {TouchEvent} e - Touch event
     */
    handleTouchResizeMove(e) {
        if (!this.resizingWindow || !this.resizeStart || e.touches.length !== 1) return;
        e.preventDefault();

        const touch = e.touches[0];
        const { element } = this.resizingWindow;
        const { mouseX, mouseY, width, height, left, top } = this.resizeStart;
        const dir = this.resizeDirection;

        const deltaX = touch.clientX - mouseX;
        const deltaY = touch.clientY - mouseY;

        let newWidth = width;
        let newHeight = height;
        let newLeft = left;
        let newTop = top;

        if (dir.includes('e')) {
            newWidth = Math.max(this.minWidth, width + deltaX);
        }
        if (dir.includes('w')) {
            const potentialWidth = width - deltaX;
            if (potentialWidth >= this.minWidth) {
                newWidth = potentialWidth;
                newLeft = left + deltaX;
            }
        }
        if (dir.includes('s')) {
            newHeight = Math.max(this.minHeight, height + deltaY);
        }
        if (dir.includes('n')) {
            const potentialHeight = height - deltaY;
            if (potentialHeight >= this.minHeight) {
                newHeight = potentialHeight;
                newTop = top + deltaY;
            }
        }

        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;

        if (dir.includes('w')) {
            element.style.left = `${newLeft}px`;
        }
        if (dir.includes('n')) {
            element.style.top = `${newTop}px`;
        }

        EventBus.emit(Events.WINDOW_RESIZE, {
            id: this.resizingWindow.id,
            width: newWidth,
            height: newHeight,
            isResizing: true
        });
    }

    /**
     * End touch resize
     */
    handleTouchResizeEnd() {
        if (this.resizingWindow) {
            const { id, element } = this.resizingWindow;
            const rect = element.getBoundingClientRect();

            element.classList.remove('resizing');
            document.body.classList.remove('window-resizing');
            document.body.classList.remove(`window-resizing-${this.resizeDirection}`);

            EventBus.emit(Events.WINDOW_RESIZE, {
                id,
                width: rect.width,
                height: rect.height,
                isResizing: false
            });
        }

        this.resizingWindow = null;
        this.resizeDirection = null;
        this.resizeStart = null;
        document.removeEventListener('touchmove', this.boundTouchResizeMove);
        document.removeEventListener('touchend', this.boundTouchResizeEnd);
        document.removeEventListener('touchcancel', this.boundTouchResizeEnd);
    }

    // ===== UTILITY METHODS =====

    /**
     * Get window element by ID
     * @param {string} id - Window ID
     * @returns {HTMLElement|null}
     */
    getElement(id) {
        return document.getElementById(`window-${id}`);
    }

    /**
     * Check if window is open
     * @param {string} id - Window ID
     * @returns {boolean}
     */
    isOpen(id) {
        return !!document.getElementById(`window-${id}`);
    }

    /**
     * Check if window is minimized
     * @param {string} id - Window ID
     * @returns {boolean}
     */
    isMinimized(id) {
        const win = StateManager.getWindow(id);
        return win ? win.minimized : false;
    }

    /**
     * Toggle window visibility
     * @param {string} id - Window ID
     */
    toggle(id) {
        if (this.isMinimized(id)) {
            this.restore(id);
        } else if (this.isActive(id)) {
            this.minimize(id);
        } else {
            this.focus(id);
        }
    }

    /**
     * Check if window is active
     * @param {string} id - Window ID
     * @returns {boolean}
     */
    isActive(id) {
        return StateManager.getState('ui.activeWindow') === id;
    }

    /**
     * Get all open windows
     * @returns {Object[]} Array of window state objects
     */
    getWindows() {
        return StateManager.getState('windows') || [];
    }

    /**
     * Get all open window IDs
     * @returns {string[]}
     */
    getOpenIds() {
        return (StateManager.getState('windows') || []).map(w => w.id);
    }

    /**
     * Find all windows for a specific app type
     * @param {string} appId - Base app ID (e.g., 'notepad', 'mycomputer')
     * @returns {Object[]} Array of window state objects
     */
    findWindowsByApp(appId) {
        const windows = StateManager.getState('windows') || [];
        return windows.filter(w => w.id === appId || w.id.startsWith(`${appId}-`));
    }

    /**
     * Find a window for an app and optionally restore/focus it
     * Returns the window ID if found and restored, null otherwise
     * @param {string} appId - Base app ID
     * @param {boolean} restoreIfFound - Whether to restore/focus if found
     * @returns {string|null} Window ID if found
     */
    findAndRestoreApp(appId, restoreIfFound = true) {
        const windows = this.findWindowsByApp(appId);
        if (windows.length > 0) {
            const windowId = windows[0].id;
            if (restoreIfFound) {
                this.focus(windowId); // Will restore if minimized
            }
            return windowId;
        }
        return null;
    }

    // ===== MODAL FOCUS ISOLATION =====

    /**
     * Open a window as a modal dialog.
     * While a modal is open, all input to non-modal windows is blocked.
     * @param {Object} config - Window configuration (same as create())
     * @returns {HTMLElement} Window element
     */
    createModal(config) {
        const windowEl = this.create({ ...config, resizable: false });
        const id = config.id;

        this._modalStack.push(id);
        this._updateModalOverlay();

        StateManager.updateWindow(id, { modal: true });

        // Modal cleanup runs synchronously inside close() (see WindowManager.close).
        // This replaces the previous one-shot WINDOW_CLOSE listener pattern, which
        // could race when two modals closed in the same tick — both listeners would
        // observe each other's emit and pop the wrong id, leaving _modalStack out
        // of sync and the overlay blocking input.
        this._modalCleanups.set(id, () => {
            this._modalStack = this._modalStack.filter(m => m !== id);
            this._updateModalOverlay();
        });

        return windowEl;
    }

    /**
     * Update the modal overlay z-index and visibility.
     * The overlay sits just below the topmost modal window.
     */
    _updateModalOverlay() {
        if (!this._modalOverlay) return;

        if (this._modalStack.length === 0) {
            this._modalOverlay.style.display = 'none';
            return;
        }

        const topModalId = this._modalStack[this._modalStack.length - 1];
        const topModalEl = document.getElementById(`window-${topModalId}`);
        if (topModalEl) {
            const modalZ = parseInt(topModalEl.style.zIndex || 0);
            this._modalOverlay.style.zIndex = String(modalZ - 1);
            this._modalOverlay.style.display = 'block';
        }
    }

    /**
     * Check if a window is currently blocked by a modal.
     * @param {string} id - Window ID to check
     * @returns {boolean} True if the window is blocked by a modal
     */
    isBlockedByModal(id) {
        if (this._modalStack.length === 0) return false;
        // The topmost modal is not blocked; everything else is
        return this._modalStack[this._modalStack.length - 1] !== id;
    }

    // ===== SESSION PERSISTENCE =====

    /**
     * Persist current window layout to storage for session recovery.
     * Stores window IDs, positions, sizes, and states (minimized/maximized).
     */
    _persistSession() {
        const windows = StateManager.getState('windows') || [];
        const sessionData = windows.map(w => {
            const el = document.getElementById(`window-${w.id}`);
            if (!el) return null;
            return {
                id: w.id,
                title: w.title,
                minimized: !!w.minimized,
                maximized: !!w.maximized,
                left: el.style.left,
                top: el.style.top,
                width: el.style.width,
                height: el.style.height,
                zIndex: el.style.zIndex
            };
        }).filter(Boolean);

        StorageManager.set('windowSession', {
            windows: sessionData,
            timestamp: Date.now()
        });
    }

    /**
     * Get the saved session data for window recovery.
     * Returns null if no session exists or if it's older than the max age.
     * @param {number} [maxAgeMs=3600000] - Maximum session age in ms (default: 1 hour)
     * @returns {Object|null} Session data with window positions/states
     */
    getSavedSession(maxAgeMs = 3600000) {
        const session = StorageManager.get('windowSession');
        if (!session || !session.timestamp) return null;
        if (Date.now() - session.timestamp > maxAgeMs) return null;
        return session;
    }

    /**
     * Clear the saved window session.
     */
    clearSavedSession() {
        StorageManager.remove('windowSession');
    }
}

// Singleton instance
const WindowManager = new WindowManagerClass();

export default WindowManager;
