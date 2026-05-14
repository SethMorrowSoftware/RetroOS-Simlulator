import FeatureBase from '../../../core/FeatureBase.js';

/**
 * DVD Bouncer Feature - A nostalgic bouncing DVD logo screensaver
 * The logo changes color when it hits a perfect corner!
 */
class DVDBouncerFeature extends FeatureBase {
    constructor() {
        super({
            id: 'dvd-bouncer',
            name: 'DVD Bouncer',
            description: 'Nostalgic bouncing DVD logo screensaver that celebrates corner hits',
            icon: '📀',
            category: 'plugin',
            config: {
                speed: 2,
                logoSize: 80,
                idleTimeout: 60000, // 1 minute of no activity
                autoStart: false
            },
            settings: [
                {
                    key: 'speed',
                    label: 'Bounce Speed',
                    type: 'number',
                    min: 1,
                    max: 10,
                    step: 1,
                    description: 'How fast the DVD logo bounces (1-10)'
                },
                {
                    key: 'logoSize',
                    label: 'Logo Size',
                    type: 'number',
                    min: 40,
                    max: 200,
                    step: 20,
                    description: 'Size of the DVD logo in pixels'
                },
                {
                    key: 'idleTimeout',
                    label: 'Idle Timeout (seconds)',
                    type: 'number',
                    min: 10,
                    max: 300,
                    step: 10,
                    description: 'Seconds of inactivity before screensaver starts',
                    transform: (value) => value * 1000, // Convert to milliseconds
                    displayTransform: (value) => value / 1000 // Display as seconds
                },
                {
                    key: 'autoStart',
                    label: 'Auto-start on Idle',
                    type: 'checkbox',
                    description: 'Automatically start screensaver after idle timeout'
                }
            ]
        });

        this.logo = null;
        this.container = null;
        this.animationFrame = null;
        this.position = { x: 100, y: 100 };
        this.velocity = { x: 2, y: 2 };
        this.colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
            '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'
        ];
        this.currentColorIndex = 0;
        this.cornerHits = 0;
        this.isActive = false;
        this.idleTimer = null;
        this.lastActivity = Date.now();
    }

    async initialize() {
        this.log('Initializing DVD Bouncer...');

        // Subscribe to activity events to reset idle timer
        this.subscribe('window:open', () => this.resetIdleTimer());
        this.subscribe('window:focus', () => this.resetIdleTimer());

        // Listen for user activity
        this.addHandler(document, 'mousemove', () => this.onUserActivity());
        this.addHandler(document, 'keydown', () => this.onUserActivity());
        this.addHandler(document, 'click', () => this.onUserActivity());

        // Start idle monitoring if auto-start is enabled
        if (this.getConfig('autoStart')) {
            this.startIdleMonitoring();
        }

        this.log('DVD Bouncer initialized! 📀');
    }

    async enable() {
        this.log('DVD Bouncer feature enabled');
    }

    async disable() {
        this.stop();
        this.stopIdleMonitoring();
        this.log('DVD Bouncer feature disabled');
        await super.disable();
    }

    cleanup() {
        this.stop();
        this.stopIdleMonitoring();
        this.log('DVD Bouncer cleaned up');
        super.cleanup();
    }

    /**
     * User activity detection
     */
    onUserActivity() {
        this.lastActivity = Date.now();

        // If screensaver is active, stop it on any activity
        if (this.isActive) {
            this.stop();
        }

        this.resetIdleTimer();
    }

    /**
     * Start monitoring for idle time
     */
    startIdleMonitoring() {
        this.stopIdleMonitoring(); // Clear any existing timer

        const checkIdle = () => {
            const idleTime = Date.now() - this.lastActivity;
            const timeout = this.getConfig('idleTimeout', 60000);

            if (idleTime >= timeout && !this.isActive && this.getConfig('autoStart')) {
                this.start();
            }
        };

        // Check every second
        this.idleTimer = setInterval(checkIdle, 1000);
    }

    /**
     * Stop idle monitoring
     */
    stopIdleMonitoring() {
        if (this.idleTimer) {
            clearInterval(this.idleTimer);
            this.idleTimer = null;
        }
    }

    /**
     * Reset the idle timer
     */
    resetIdleTimer() {
        this.lastActivity = Date.now();
    }

    /**
     * Start the DVD bouncer
     */
    start() {
        if (this.isActive) return;

        this.log('Starting DVD Bouncer... 🎬');
        this.isActive = true;

        this.createBouncerUI();
        this.resetPosition();
        this.animate();

        this.emit('dvd-bouncer:started', {
            timestamp: Date.now()
        });
    }

    /**
     * Stop the DVD bouncer
     */
    stop() {
        if (!this.isActive) return;

        this.log('Stopping DVD Bouncer... ⏹️');
        this.isActive = false;

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }

        this.container = null;
        this.logo = null;

        this.emit('dvd-bouncer:stopped', {
            cornerHits: this.cornerHits,
            timestamp: Date.now()
        });

        if (this.cornerHits > 0) {
            this.log(`Final score: ${this.cornerHits} corner hit${this.cornerHits !== 1 ? 's' : ''}! 🎯`);
        }
    }

    /**
     * Create the bouncer UI elements
     */
    createBouncerUI() {
        // Create container
        this.container = document.createElement('div');
        this.container.id = 'dvd-bouncer-container';
        this.container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 99999;
            background: rgba(0, 0, 0, 0.95);
            cursor: pointer;
            user-select: none;
        `;

        // Create logo
        this.logo = document.createElement('div');
        this.logo.style.cssText = `
            position: absolute;
            width: ${this.getConfig('logoSize', 80)}px;
            height: ${this.getConfig('logoSize', 80)}px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: ${this.getConfig('logoSize', 80) * 0.3}px;
            font-weight: bold;
            font-family: 'Arial Black', sans-serif;
            color: white;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
            transition: none;
            pointer-events: none;
        `;
        this.logo.textContent = 'DVD';
        this.setLogoColor(this.colors[0]);

        // Create info display
        const info = document.createElement('div');
        info.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255, 255, 255, 0.5);
            font-family: 'Press Start 2P', monospace;
            font-size: 12px;
            text-align: center;
            pointer-events: none;
        `;
        info.innerHTML = `
            <div>Corner Hits: <span id="dvd-corner-count">0</span></div>
            <div style="margin-top: 10px; font-size: 12px;">Click anywhere to exit</div>
        `;

        this.container.appendChild(this.logo);
        this.container.appendChild(info);

        // Click to dismiss
        this.container.addEventListener('click', () => {
            this.stop();
        });

        document.body.appendChild(this.container);
    }

    /**
     * Reset position to center with random velocity
     */
    resetPosition() {
        const size = this.getConfig('logoSize', 80);
        this.position.x = window.innerWidth / 2 - size / 2;
        this.position.y = window.innerHeight / 2 - size / 2;

        const speed = this.getConfig('speed', 2);
        this.velocity.x = speed * (Math.random() > 0.5 ? 1 : -1);
        this.velocity.y = speed * (Math.random() > 0.5 ? 1 : -1);

        this.cornerHits = 0;
    }

    /**
     * Change logo color
     */
    setLogoColor(color) {
        if (this.logo) {
            this.logo.style.backgroundColor = color;
            this.logo.style.boxShadow = `0 0 20px ${color}, 0 0 40px ${color}`;
        }
    }

    /**
     * Animation loop
     */
    animate() {
        if (!this.isActive) return;

        const size = this.getConfig('logoSize', 80);
        const speed = this.getConfig('speed', 2);

        // Update position
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;

        let hitCorner = false;
        let hitX = false;
        let hitY = false;

        // Check boundaries and bounce
        if (this.position.x <= 0) {
            this.position.x = 0;
            this.velocity.x = speed;
            hitX = true;
        } else if (this.position.x + size >= window.innerWidth) {
            this.position.x = window.innerWidth - size;
            this.velocity.x = -speed;
            hitX = true;
        }

        if (this.position.y <= 0) {
            this.position.y = 0;
            this.velocity.y = speed;
            hitY = true;
        } else if (this.position.y + size >= window.innerHeight) {
            this.position.y = window.innerHeight - size;
            this.velocity.y = -speed;
            hitY = true;
        }

        // Perfect corner hit!
        if (hitX && hitY) {
            hitCorner = true;
            this.cornerHits++;
            this.onCornerHit();
        } else if (hitX || hitY) {
            // Regular bounce - change color
            this.currentColorIndex = (this.currentColorIndex + 1) % this.colors.length;
            this.setLogoColor(this.colors[this.currentColorIndex]);
        }

        // Update logo position
        if (this.logo) {
            this.logo.style.left = `${this.position.x}px`;
            this.logo.style.top = `${this.position.y}px`;
        }

        // Update counter
        const counter = document.getElementById('dvd-corner-count');
        if (counter) {
            counter.textContent = this.cornerHits;
        }

        this.animationFrame = requestAnimationFrame(() => this.animate());
    }

    /**
     * Handle perfect corner hit
     */
    onCornerHit() {
        this.log(`🎯 CORNER HIT! Total: ${this.cornerHits}`);

        // Flash effect
        this.currentColorIndex = (this.currentColorIndex + 1) % this.colors.length;
        this.setLogoColor(this.colors[this.currentColorIndex]);

        // Emit event for achievements or other features
        this.emit('dvd-bouncer:corner-hit', {
            count: this.cornerHits,
            timestamp: Date.now()
        });

        // Celebration message
        if (this.cornerHits === 1) {
            this.showMessage('🎉 FIRST CORNER HIT! 🎉');
        } else if (this.cornerHits % 5 === 0) {
            this.showMessage(`🌟 ${this.cornerHits} CORNERS! LEGENDARY! 🌟`);
        }
    }

    /**
     * Show temporary message
     */
    showMessage(text) {
        const msg = document.createElement('div');
        msg.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-family: 'Press Start 2P', monospace;
            font-size: 16px;
            text-align: center;
            animation: dvd-bounce-message 2s ease-out;
            pointer-events: none;
            z-index: 100000;
        `;
        msg.textContent = text;

        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes dvd-bounce-message {
                0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
                50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
            }
        `;
        document.head.appendChild(style);

        this.container.appendChild(msg);

        setTimeout(() => {
            if (msg.parentNode) {
                msg.parentNode.removeChild(msg);
            }
            document.head.removeChild(style);
        }, 2000);
    }
}

export default DVDBouncerFeature;
