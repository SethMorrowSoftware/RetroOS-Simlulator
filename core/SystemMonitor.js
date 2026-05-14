/**
 * SystemMonitor - Monitors system state and emits events
 *
 * Tracks:
 * - User activity (idle/active)
 * - Browser visibility and focus
 * - Network status (online/offline)
 * - Performance (FPS, memory)
 * - Viewport changes
 * - Input events (mouse, keyboard, touch)
 *
 * All activity is emitted as events for scripting and automation.
 */

import EventBus, { Events } from './EventBus.js';

class SystemMonitorClass {
    constructor() {
        // Configuration
        this.config = {
            idleThreshold: 60000,        // 1 minute of inactivity = idle
            idleCheckInterval: 10000,    // Check every 10 seconds
            fpsInterval: 1000,           // FPS update interval
            memoryInterval: 5000,        // Memory check interval
            lowFpsThreshold: 30,         // Warn below this FPS
            memoryWarningPercent: 80,    // Warn at this memory usage
            trackMouseMove: false,       // Emit mouse:move (high frequency)
            throttleMouseMove: 50,       // Throttle mouse move to 50ms
            trackKeyboard: true,         // Emit keyboard events
            trackTouch: true,            // Emit touch events
        };

        // State
        this.state = {
            isIdle: false,
            lastActivity: Date.now(),
            isVisible: !document.hidden,
            hasFocus: document.hasFocus(),
            isOnline: navigator.onLine,
            sessionId: this._generateSessionId(),
            sessionStart: Date.now(),
            fps: 60,
            frameCount: 0,
            lastFpsTime: 0,
            lastMouseX: 0,
            lastMouseY: 0,
            touchStartPos: null,
            longPressTimer: null,
        };

        // Intervals
        this.intervals = {
            idle: null,
            fps: null,
            memory: null,
        };

        // Bound handlers for cleanup
        this._handlers = {};

        // FPS tracking state
        this._fpsRunning = false;
        this._fpsFrameId = null;

        // Gesture detection
        this.gestureState = {
            startX: 0,
            startY: 0,
            startTime: 0,
            touches: [],
            lastTap: 0,
        };
    }

    /**
     * Initialize the system monitor
     */
    initialize() {
        this._setupActivityTracking();
        this._setupVisibilityTracking();
        this._setupNetworkTracking();
        this._setupViewportTracking();
        this._setupInputTracking();
        this._setupPerformanceTracking();
        this._startIdleCheck();

        // Emit session start
        EventBus.emit(Events.SESSION_START, {
            sessionId: this.state.sessionId,
            timestamp: this.state.sessionStart,
        });

        console.log('[SystemMonitor] Initialized');
    }

    /**
     * Cleanup all listeners and intervals
     */
    cleanup() {
        // Stop FPS tracking RAF loop
        this._fpsRunning = false;
        if (this._fpsFrameId) {
            cancelAnimationFrame(this._fpsFrameId);
            this._fpsFrameId = null;
        }

        // Clear intervals
        Object.values(this.intervals).forEach(id => {
            if (id) clearInterval(id);
        });

        // Remove event listeners
        this._removeAllListeners();

        // Emit session end
        EventBus.emit(Events.SESSION_END, {
            sessionId: this.state.sessionId,
            duration: Date.now() - this.state.sessionStart,
            reason: 'cleanup',
        });

        console.log('[SystemMonitor] Cleaned up');
    }

    /**
     * Configure the monitor
     */
    configure(options) {
        Object.assign(this.config, options);
    }

    /**
     * Get current system state
     */
    getState() {
        return { ...this.state };
    }

    // ==========================================
    // ACTIVITY TRACKING
    // ==========================================

    _setupActivityTracking() {
        const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'];

        this._handlers.activity = () => this._onActivity();

        activityEvents.forEach(event => {
            document.addEventListener(event, this._handlers.activity, { passive: true });
        });
    }

    _onActivity() {
        const wasIdle = this.state.isIdle;
        const idleDuration = Date.now() - this.state.lastActivity;
        this.state.lastActivity = Date.now();

        if (wasIdle) {
            this.state.isIdle = false;
            EventBus.emit(Events.SYSTEM_ACTIVE, {
                idleDuration,
            });
        }
    }

    _startIdleCheck() {
        this.intervals.idle = setInterval(() => {
            const idleTime = Date.now() - this.state.lastActivity;

            if (!this.state.isIdle && idleTime >= this.config.idleThreshold) {
                this.state.isIdle = true;
                EventBus.emit(Events.SYSTEM_IDLE, {
                    idleTime,
                    threshold: this.config.idleThreshold,
                });
            }
        }, this.config.idleCheckInterval);
    }

    // ==========================================
    // VISIBILITY TRACKING
    // ==========================================

    _setupVisibilityTracking() {
        // Visibility change (tab switch)
        this._handlers.visibility = () => {
            const visible = !document.hidden;
            const wasVisible = this.state.isVisible;
            this.state.isVisible = visible;

            EventBus.emit(Events.SYSTEM_VISIBILITY_CHANGE, {
                visible,
                state: document.visibilityState,
            });

            // Sleep/wake based on visibility
            if (!visible && wasVisible) {
                EventBus.emit(Events.SYSTEM_SLEEP, { reason: 'tab_hidden' });
            } else if (visible && !wasVisible) {
                EventBus.emit(Events.SYSTEM_WAKE, {});
            }
        };
        document.addEventListener('visibilitychange', this._handlers.visibility);

        // Window focus/blur
        this._handlers.focus = () => {
            this.state.hasFocus = true;
            EventBus.emit(Events.SYSTEM_FOCUS, {});
            this._onActivity();
        };
        this._handlers.blur = () => {
            this.state.hasFocus = false;
            EventBus.emit(Events.SYSTEM_BLUR, {});
        };
        window.addEventListener('focus', this._handlers.focus);
        window.addEventListener('blur', this._handlers.blur);

        // Fullscreen
        this._handlers.fullscreen = () => {
            if (document.fullscreenElement) {
                EventBus.emit(Events.SYSTEM_FULLSCREEN_ENTER, {
                    element: document.fullscreenElement.id || 'unknown',
                });
            } else {
                EventBus.emit(Events.SYSTEM_FULLSCREEN_EXIT, {});
            }
        };
        document.addEventListener('fullscreenchange', this._handlers.fullscreen);
    }

    // ==========================================
    // NETWORK TRACKING
    // ==========================================

    _setupNetworkTracking() {
        this._handlers.online = () => {
            this.state.isOnline = true;
            EventBus.emit(Events.SYSTEM_ONLINE, {});
        };
        this._handlers.offline = () => {
            this.state.isOnline = false;
            EventBus.emit(Events.SYSTEM_OFFLINE, {});
        };

        window.addEventListener('online', this._handlers.online);
        window.addEventListener('offline', this._handlers.offline);
    }

    // ==========================================
    // VIEWPORT TRACKING
    // ==========================================

    _setupViewportTracking() {
        let previousWidth = window.innerWidth;
        let previousHeight = window.innerHeight;

        this._handlers.resize = () => {
            const width = window.innerWidth;
            const height = window.innerHeight;

            EventBus.emit(Events.SYSTEM_RESIZE, {
                width,
                height,
                previousWidth,
                previousHeight,
            });

            previousWidth = width;
            previousHeight = height;
        };

        window.addEventListener('resize', this._handlers.resize);
    }

    // ==========================================
    // INPUT TRACKING
    // ==========================================

    _setupInputTracking() {
        this._setupMouseTracking();
        if (this.config.trackKeyboard) this._setupKeyboardTracking();
        if (this.config.trackTouch) this._setupTouchTracking();
    }

    _setupMouseTracking() {
        // Mouse move (throttled, optional)
        if (this.config.trackMouseMove) {
            let lastMoveEmit = 0;
            this._handlers.mousemove = (e) => {
                const now = Date.now();
                if (now - lastMoveEmit >= this.config.throttleMouseMove) {
                    EventBus.emit(Events.MOUSE_MOVE, {
                        x: e.clientX,
                        y: e.clientY,
                        deltaX: e.clientX - this.state.lastMouseX,
                        deltaY: e.clientY - this.state.lastMouseY,
                        target: e.target?.id || e.target?.className || 'unknown',
                    });
                    this.state.lastMouseX = e.clientX;
                    this.state.lastMouseY = e.clientY;
                    lastMoveEmit = now;
                }
            };
            document.addEventListener('mousemove', this._handlers.mousemove, { passive: true });
        }

        // Mouse down
        this._handlers.mousedown = (e) => {
            EventBus.emit(Events.MOUSE_DOWN, {
                x: e.clientX,
                y: e.clientY,
                button: e.button,
                target: this._getTargetId(e.target),
            });
        };
        document.addEventListener('mousedown', this._handlers.mousedown);

        // Mouse up
        this._handlers.mouseup = (e) => {
            EventBus.emit(Events.MOUSE_UP, {
                x: e.clientX,
                y: e.clientY,
                button: e.button,
                target: this._getTargetId(e.target),
            });
        };
        document.addEventListener('mouseup', this._handlers.mouseup);

        // Click
        this._handlers.click = (e) => {
            EventBus.emit(Events.MOUSE_CLICK, {
                x: e.clientX,
                y: e.clientY,
                button: e.button,
                target: this._getTargetId(e.target),
                targetType: this._getTargetType(e.target),
            });
        };
        document.addEventListener('click', this._handlers.click);

        // Double click
        this._handlers.dblclick = (e) => {
            EventBus.emit(Events.MOUSE_DBLCLICK, {
                x: e.clientX,
                y: e.clientY,
                button: e.button,
                target: this._getTargetId(e.target),
            });
        };
        document.addEventListener('dblclick', this._handlers.dblclick);

        // Context menu (right click)
        this._handlers.contextmenu = (e) => {
            EventBus.emit(Events.MOUSE_CONTEXTMENU, {
                x: e.clientX,
                y: e.clientY,
                target: this._getTargetId(e.target),
                targetType: this._getTargetType(e.target),
            });
        };
        document.addEventListener('contextmenu', this._handlers.contextmenu);

        // Scroll
        this._handlers.scroll = (e) => {
            EventBus.emitThrottled(Events.MOUSE_SCROLL, {
                deltaX: e.deltaX || 0,
                deltaY: e.deltaY || 0,
                deltaZ: e.deltaZ || 0,
                x: e.clientX || 0,
                y: e.clientY || 0,
                target: this._getTargetId(e.target),
            }, 100); // Throttle scroll events
        };
        document.addEventListener('wheel', this._handlers.scroll, { passive: true });
    }

    _setupKeyboardTracking() {
        // Key down
        this._handlers.keydown = (e) => {
            EventBus.emit(Events.KEYBOARD_KEYDOWN, {
                key: e.key,
                code: e.code,
                ctrl: e.ctrlKey,
                alt: e.altKey,
                shift: e.shiftKey,
                meta: e.metaKey,
                repeat: e.repeat,
                target: this._getTargetId(e.target),
            });

            // Emit combo for modifier combinations
            if (e.ctrlKey || e.altKey || e.metaKey) {
                const keys = [];
                if (e.ctrlKey) keys.push('Ctrl');
                if (e.altKey) keys.push('Alt');
                if (e.shiftKey) keys.push('Shift');
                if (e.metaKey) keys.push('Meta');
                keys.push(e.key.toUpperCase());

                EventBus.emit(Events.KEYBOARD_COMBO, {
                    combo: keys.join('+'),
                    keys,
                    handled: false,
                });
            }
        };
        document.addEventListener('keydown', this._handlers.keydown);

        // Key up
        this._handlers.keyup = (e) => {
            EventBus.emit(Events.KEYBOARD_KEYUP, {
                key: e.key,
                code: e.code,
                ctrl: e.ctrlKey,
                alt: e.altKey,
                shift: e.shiftKey,
                meta: e.metaKey,
                target: this._getTargetId(e.target),
            });
        };
        document.addEventListener('keyup', this._handlers.keyup);
    }

    _setupTouchTracking() {
        // Touch start
        this._handlers.touchstart = (e) => {
            const touch = e.touches[0];
            const touches = Array.from(e.touches).map(t => ({
                x: t.clientX,
                y: t.clientY,
                id: t.identifier,
            }));

            this.gestureState.startX = touch.clientX;
            this.gestureState.startY = touch.clientY;
            this.gestureState.startTime = Date.now();
            this.gestureState.touches = touches;

            EventBus.emit(Events.TOUCH_START, {
                touches,
                x: touch.clientX,
                y: touch.clientY,
                target: this._getTargetId(e.target),
            });

            // Start long press detection
            this.state.longPressTimer = setTimeout(() => {
                EventBus.emit(Events.GESTURE_LONGPRESS, {
                    x: touch.clientX,
                    y: touch.clientY,
                    duration: Date.now() - this.gestureState.startTime,
                    target: this._getTargetId(e.target),
                });
            }, 800);
        };
        document.addEventListener('touchstart', this._handlers.touchstart, { passive: true });

        // Touch move
        this._handlers.touchmove = (e) => {
            if (this.state.longPressTimer) {
                clearTimeout(this.state.longPressTimer);
                this.state.longPressTimer = null;
            }

            const touch = e.touches[0];
            const touches = Array.from(e.touches).map(t => ({
                x: t.clientX,
                y: t.clientY,
                id: t.identifier,
            }));

            EventBus.emitThrottled(Events.TOUCH_MOVE, {
                touches,
                x: touch.clientX,
                y: touch.clientY,
                deltaX: touch.clientX - this.gestureState.startX,
                deltaY: touch.clientY - this.gestureState.startY,
                target: this._getTargetId(e.target),
            }, 16); // ~60fps throttle

            // Detect pinch/zoom
            if (e.touches.length === 2) {
                const touch1 = e.touches[0];
                const touch2 = e.touches[1];
                const currentDistance = Math.hypot(
                    touch2.clientX - touch1.clientX,
                    touch2.clientY - touch1.clientY
                );
                const centerX = (touch1.clientX + touch2.clientX) / 2;
                const centerY = (touch1.clientY + touch2.clientY) / 2;

                if (this.gestureState.lastPinchDistance) {
                    const scale = currentDistance / this.gestureState.lastPinchDistance;
                    EventBus.emit(Events.GESTURE_PINCH, {
                        scale,
                        centerX,
                        centerY,
                        target: this._getTargetId(e.target),
                    });
                }
                this.gestureState.lastPinchDistance = currentDistance;
            }
        };
        document.addEventListener('touchmove', this._handlers.touchmove, { passive: true });

        // Touch end
        this._handlers.touchend = (e) => {
            if (this.state.longPressTimer) {
                clearTimeout(this.state.longPressTimer);
                this.state.longPressTimer = null;
            }

            const touches = Array.from(e.touches).map(t => ({
                x: t.clientX,
                y: t.clientY,
                id: t.identifier,
            }));

            const changedTouch = e.changedTouches[0];
            const endX = changedTouch.clientX;
            const endY = changedTouch.clientY;
            const duration = Date.now() - this.gestureState.startTime;

            EventBus.emit(Events.TOUCH_END, {
                touches,
                x: endX,
                y: endY,
                target: this._getTargetId(e.target),
            });

            // Detect gestures
            const deltaX = endX - this.gestureState.startX;
            const deltaY = endY - this.gestureState.startY;
            const distance = Math.hypot(deltaX, deltaY);

            // Tap detection
            if (distance < 10 && duration < 300) {
                const now = Date.now();
                if (now - this.gestureState.lastTap < 300) {
                    EventBus.emit(Events.GESTURE_DOUBLETAP, {
                        x: endX,
                        y: endY,
                        target: this._getTargetId(e.target),
                    });
                } else {
                    EventBus.emit(Events.GESTURE_TAP, {
                        x: endX,
                        y: endY,
                        target: this._getTargetId(e.target),
                    });
                }
                this.gestureState.lastTap = now;
            }

            // Swipe detection
            if (distance > 50 && duration < 500) {
                let direction;
                if (Math.abs(deltaX) > Math.abs(deltaY)) {
                    direction = deltaX > 0 ? 'right' : 'left';
                } else {
                    direction = deltaY > 0 ? 'down' : 'up';
                }

                EventBus.emit(Events.GESTURE_SWIPE, {
                    direction,
                    startX: this.gestureState.startX,
                    startY: this.gestureState.startY,
                    endX,
                    endY,
                    velocity: distance / duration,
                    target: this._getTargetId(e.target),
                });
            }

            // Reset pinch state
            this.gestureState.lastPinchDistance = null;
        };
        document.addEventListener('touchend', this._handlers.touchend, { passive: true });

        // Touch cancel
        this._handlers.touchcancel = (e) => {
            if (this.state.longPressTimer) {
                clearTimeout(this.state.longPressTimer);
                this.state.longPressTimer = null;
            }

            EventBus.emit(Events.TOUCH_CANCEL, {
                touches: [],
                target: this._getTargetId(e.target),
            });
        };
        document.addEventListener('touchcancel', this._handlers.touchcancel, { passive: true });
    }

    // ==========================================
    // PERFORMANCE TRACKING
    // ==========================================

    _setupPerformanceTracking() {
        this._startFPSTracking();
        this._startMemoryTracking();
        this._setupLongTaskTracking();
    }

    _startFPSTracking() {
        let frameCount = 0;
        let lastTime = performance.now();
        this._fpsRunning = true;

        const countFrame = (currentTime) => {
            if (!this._fpsRunning) return;

            frameCount++;

            if (currentTime - lastTime >= this.config.fpsInterval) {
                const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
                this.state.fps = fps;

                EventBus.emit(Events.PERF_FPS, {
                    fps,
                    frameTime: 1000 / fps,
                });

                if (fps < this.config.lowFpsThreshold) {
                    EventBus.emit(Events.PERF_FPS_LOW, {
                        fps,
                        threshold: this.config.lowFpsThreshold,
                    });
                }

                frameCount = 0;
                lastTime = currentTime;
            }

            this._fpsFrameId = requestAnimationFrame(countFrame);
        };

        this._fpsFrameId = requestAnimationFrame(countFrame);
    }

    _startMemoryTracking() {
        if (!performance.memory) return; // Chrome only

        this.intervals.memory = setInterval(() => {
            const memory = performance.memory;
            const usedPercent = (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

            EventBus.emit(Events.PERF_MEMORY, {
                usedJSHeapSize: memory.usedJSHeapSize,
                totalJSHeapSize: memory.totalJSHeapSize,
                jsHeapSizeLimit: memory.jsHeapSizeLimit,
            });

            if (usedPercent > this.config.memoryWarningPercent) {
                EventBus.emit(Events.SYSTEM_MEMORY_WARNING, {
                    usage: memory.usedJSHeapSize,
                    limit: memory.jsHeapSizeLimit,
                    percentage: Math.round(usedPercent),
                });
            }
        }, this.config.memoryInterval);
    }

    _setupLongTaskTracking() {
        if (!window.PerformanceObserver) return;

        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    EventBus.emit(Events.PERF_LONGTASK, {
                        duration: entry.duration,
                        startTime: entry.startTime,
                        source: entry.attribution?.[0]?.name || 'unknown',
                    });
                }
            });

            observer.observe({ entryTypes: ['longtask'] });
        } catch (e) {
            // Long task observation not supported
        }
    }

    // ==========================================
    // HELPER METHODS
    // ==========================================

    _getTargetId(element) {
        if (!element) return 'unknown';
        if (element.id) return element.id;
        if (element.className && typeof element.className === 'string') {
            return element.className.split(' ')[0];
        }
        return element.tagName?.toLowerCase() || 'unknown';
    }

    _getTargetType(element) {
        if (!element) return 'unknown';

        // Check for common target types
        if (element.closest('.desktop-icon')) return 'icon';
        if (element.closest('.window')) return 'window';
        if (element.closest('.taskbar')) return 'taskbar';
        if (element.closest('.start-menu')) return 'start-menu';
        if (element.closest('.context-menu')) return 'context-menu';
        if (element.closest('#desktop')) return 'desktop';

        return 'element';
    }

    _generateSessionId() {
        return 'sess-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
    }

    _removeAllListeners() {
        const events = [
            'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu',
            'keydown', 'keyup',
            'touchstart', 'touchmove', 'touchend', 'touchcancel',
            'wheel', 'scroll',
            'focus', 'blur',
            'visibilitychange', 'fullscreenchange',
            'online', 'offline',
            'resize'
        ];

        // Remove handlers we know about
        Object.keys(this._handlers).forEach(key => {
            const handler = this._handlers[key];
            if (handler) {
                events.forEach(event => {
                    document.removeEventListener(event, handler);
                    window.removeEventListener(event, handler);
                });
            }
        });
    }

    // ==========================================
    // WINDOW RESOURCE TRACKING
    // ==========================================

    /**
     * Get an estimated resource footprint for each open window.
     * Counts DOM nodes, event listeners, and content size to help
     * identify windows that may be consuming excessive resources.
     * @returns {Array<{id: string, title: string, domNodes: number, contentSize: number}>}
     */
    getWindowResourceUsage() {
        const windows = document.querySelectorAll('.window');
        const usage = [];

        for (const windowEl of windows) {
            const id = windowEl.id.replace('window-', '');
            const titleEl = windowEl.querySelector('.title-text');
            const contentEl = windowEl.querySelector('.window-content');

            const domNodes = windowEl.querySelectorAll('*').length;
            const contentSize = contentEl ? contentEl.innerHTML.length : 0;

            usage.push({
                id,
                title: titleEl ? titleEl.textContent.trim() : id,
                domNodes,
                contentSize,
                isMinimized: windowEl.classList.contains('minimized'),
            });
        }

        // Sort by DOM nodes descending (heaviest first)
        usage.sort((a, b) => b.domNodes - a.domNodes);
        return usage;
    }

    /**
     * Emit a resource usage report for all open windows.
     * Useful for debugging memory-heavy windows.
     */
    emitWindowResourceReport() {
        const usage = this.getWindowResourceUsage();
        const totalDomNodes = usage.reduce((sum, w) => sum + w.domNodes, 0);

        EventBus.emit('system:resource:report', {
            windowCount: usage.length,
            totalDomNodes,
            windows: usage,
            timestamp: Date.now(),
        });

        // Warn if any individual window is excessively heavy
        const HEAVY_THRESHOLD = 5000; // DOM nodes
        for (const w of usage) {
            if (w.domNodes > HEAVY_THRESHOLD) {
                EventBus.emit('system:resource:warning', {
                    windowId: w.id,
                    title: w.title,
                    domNodes: w.domNodes,
                    threshold: HEAVY_THRESHOLD,
                    message: `Window "${w.title}" has ${w.domNodes} DOM nodes (threshold: ${HEAVY_THRESHOLD})`,
                });
            }
        }

        return usage;
    }

    // ==========================================
    // PUBLIC UTILITY METHODS
    // ==========================================

    /**
     * Emit a performance measurement
     */
    measure(name, startMark, endMark) {
        try {
            const measure = performance.measure(name, startMark, endMark);
            EventBus.emit(Events.PERF_MEASURE, {
                name,
                duration: measure.duration,
                startMark,
                endMark,
            });
            return measure.duration;
        } catch (e) {
            console.warn('[SystemMonitor] Measure failed:', e);
            return null;
        }
    }

    /**
     * Create a performance mark
     */
    mark(name) {
        performance.mark(name);
    }

    /**
     * Log a debug message as an event
     */
    debug(level, message, source, data) {
        EventBus.emit(Events.DEBUG_LOG, {
            level,
            message,
            source,
            data,
        });
    }

    /**
     * Record user action for analytics
     */
    recordAction(actionType, target, data) {
        EventBus.emit(Events.USER_ACTION, {
            actionType,
            target,
            data,
        });

        EventBus.emit(Events.SESSION_ACTIVITY, {
            sessionId: this.state.sessionId,
            activity: actionType,
            timestamp: Date.now(),
        });
    }
}

// Create singleton instance
const SystemMonitor = new SystemMonitorClass();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => SystemMonitor.initialize());
} else {
    // DOM already loaded, initialize after a tick to allow other modules to load
    setTimeout(() => SystemMonitor.initialize(), 0);
}

export { SystemMonitor };
export default SystemMonitor;
