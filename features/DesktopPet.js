/**
 * DesktopPet - Animated desktop companion with retro behaviors
 * Inspired by classic 90s desktop pets: Neko (1989), eSheep (1995), Dogz (1995)
 *
 * Features authentic retro behavior patterns:
 * - Neko-style cursor chasing
 * - eSheep-style screen wandering
 * - Dogz/Catz style interactions
 *
 * Now extends FeatureBase for integration with FeatureRegistry
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import { escapeHtml } from '../core/Sanitize.js';

// Feature metadata
const FEATURE_METADATA = {
    id: 'desktoppet',
    name: 'Desktop Pet',
    description: 'Classic 90s desktop pet - Neko, Dogz, or eSheep style companion!',
    icon: ':3',
    category: 'enhancement',
    dependencies: [],
    config: {
        petType: 'neko',
        animationSpeed: 1.0,
        enablePhysics: true,
        enableFortunes: true
    },
    settings: [
        {
            key: 'enabled',
            label: 'Enable Desktop Pet',
            type: 'checkbox'
        },
        {
            key: 'petType',
            label: 'Pet Type',
            type: 'select',
            options: ['neko', 'dog', 'sheep']
        },
        {
            key: 'animationSpeed',
            label: 'Animation Speed',
            type: 'slider',
            min: 0.5,
            max: 2,
            step: 0.1
        },
        {
            key: 'enablePhysics',
            label: 'Enable Physics',
            type: 'checkbox'
        }
    ]
};

// Pet behavior states (inspired by original Neko states)
const STATES = {
    IDLE: 'idle',           // Still, alert
    ALERT: 'alert',         // Just noticed something
    WALKING: 'walking',     // Normal walk
    RUNNING: 'running',     // Fast movement
    SLEEPING: 'sleeping',   // Zzz
    SITTING: 'sitting',     // Resting
    JUMPING: 'jumping',     // In air
    FALLING: 'falling',     // Gravity
    DRAGGING: 'dragging',   // Being held
    SCRATCHING: 'scratching', // Classic Neko wall scratch
    YAWNING: 'yawning',     // Getting sleepy
    PLAYING: 'playing',     // Playful
    CHASING: 'chasing',     // Classic Neko cursor chase!
    GROOMING: 'grooming',   // Cleaning
    SURPRISED: 'surprised', // !
    BORED: 'bored'         // Looking around
};

// Classic 90s retro fortune messages
const FORTUNES = [
    "You will find happiness in a 640x480 resolution.",
    "A mysterious paperclip wishes to assist you.",
    "Your lucky numbers are 95, 98, and 2000.",
    "Today is good for defragmentation.",
    "Beware of the Y2K bug!",
    "Please wait... Your fortune is loading...",
    "The cursor holds secrets unknown to mortals.",
    "Remember to backup your floppies!",
    "A General Protection Fault brings opportunity.",
    "Your dial-up connection will be strong today.",
    "Press any key to continue your destiny.",
    "An unexpected IRQ conflict will bring joy.",
    "You have performed an illegal operation... of the heart.",
    "Insufficient memory for worries. Proceed anyway?",
    "This program has performed an AMAZING operation.",
    "Insert Disk 2 to continue your journey.",
    "Your screensaver holds the key to enlightenment.",
    "The Start menu is just the beginning.",
    "AUTOEXEC.BAT yourself before you wreck yourself.",
    "You've got mail! And it's good news.",
    "Scan complete: No viruses detected in your future.",
    "Please do not turn off your luck."
];

// Pet type configurations
const PET_CONFIGS = {
    neko: {
        name: 'Neko',
        primaryColor: '#F5F5DC',    // Beige/cream
        secondaryColor: '#E8D4A8', // Darker beige
        accentColor: '#FFB6C1',     // Pink
        eyeColor: '#000000',
        chaseSpeed: 3.5,
        walkSpeed: 1.5,
        personality: 'curious'      // More likely to chase cursor
    },
    dog: {
        name: 'Dogz',
        primaryColor: '#8B4513',    // Saddle brown
        secondaryColor: '#A0522D',  // Sienna
        accentColor: '#FFB6C1',     // Pink tongue
        eyeColor: '#000000',
        chaseSpeed: 4,
        walkSpeed: 2,
        personality: 'playful'      // More jumping and playing
    },
    sheep: {
        name: 'eSheep',
        primaryColor: '#F5F5F5',    // White wool
        secondaryColor: '#E0E0E0',  // Gray wool
        accentColor: '#2F2F2F',     // Dark face
        eyeColor: '#000000',
        chaseSpeed: 2,
        walkSpeed: 1,
        personality: 'calm'         // More sleeping and sitting
    }
};

class DesktopPet extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);

        this.canvas = null;
        this.ctx = null;
        this.container = null;

        // Pet type (neko, dog, sheep)
        this.petType = 'neko';
        this.petConfig = PET_CONFIGS.neko;

        // Physics
        this.x = 100;
        this.y = 100;
        this.vx = 0;
        this.vy = 0;
        this.gravity = 0.4;
        this.bounce = 0.25;

        // Animation
        this.state = STATES.IDLE;
        this.previousState = STATES.IDLE;
        this.facing = 1; // 1 = right, -1 = left
        this.frame = 0;
        this.frameTimer = 0;
        this.frameDelay = 8;
        this.blinkTimer = 0;
        this.isBlinking = false;

        // Behavior
        this.stateTimer = 0;
        this.idleTime = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.clickCount = 0;

        // Interaction
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        // Size
        this.width = 32;
        this.height = 32;

        // Activity tracking for Neko-style cursor chasing
        this.lastMouseX = 0;
        this.lastMouseY = 0;
        this.mouseStillTimer = 0;
        this.cursorChaseTimer = 0;
        this.hasReachedCursor = false;

        // Animation loop
        this.animationId = null;
        this.petEnabled = false;
    }

    async initialize() {
        if (!this.isEnabled()) return;

        this.log('Initializing retro desktop pet...');

        // Get container
        this.container = document.getElementById('desktopPet');
        if (!this.container) {
            console.error('[DesktopPet] Container element not found');
            return;
        }

        // Create canvas for sprite rendering
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.imageRendering = 'pixelated';
        this.canvas.style.imageRendering = '-moz-crisp-edges';
        this.canvas.style.imageRendering = 'crisp-edges';
        this.ctx = this.canvas.getContext('2d', { alpha: true });

        // Clear existing content and add canvas
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);

        // Position container with transparent background
        this.container.style.position = 'fixed';
        this.container.style.cursor = 'pointer';
        this.container.style.zIndex = '8999';
        this.container.style.pointerEvents = 'auto';
        this.container.style.background = 'transparent';

        // Load saved state
        const enabled = StateManager.getState('settings.pet.enabled');
        const savedPetType = StateManager.getState('settings.pet.type');
        this.enabled = enabled;

        // Set pet type from saved state
        this.setPetType(savedPetType || 'neko');

        if (enabled) {
            this.show();
        }

        // Set up event listeners
        this.setupEventListeners();

        // Listen for toggle events
        this.subscribe(Events.PET_TOGGLE, ({ enabled }) => {
            this.toggle(enabled);
        });

        // Listen for pet type changes
        this.subscribe('pet:change', ({ type }) => {
            this.setPetType(type);
        });

        console.log(`[DesktopPet] Retro ${this.petConfig.name} initialized! :3`);
    }

    /**
     * Change pet type dynamically
     */
    setPetType(type) {
        if (PET_CONFIGS[type]) {
            this.petType = type;
            this.petConfig = PET_CONFIGS[type];
            this.log(`Pet type changed to ${this.petConfig.name}`);
        } else {
            // Default to neko if unknown type
            this.petType = 'neko';
            this.petConfig = PET_CONFIGS.neko;
        }
    }

    /**
     * Cleanup resources when disabled
     */
    cleanup() {
        // Stop animation loop
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        // Hide the container
        if (this.container) {
            this.container.style.display = 'none';
        }

        this.enabled = false;

        // Call parent cleanup for event handlers
        super.cleanup();
    }

    setupEventListeners() {
        // Mouse tracking for cursor following (use addHandler for auto-cleanup)
        this.addHandler(document, 'mousemove', (e) => {
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            if (this.isDragging) {
                this.updateDrag(e);
            }
        });

        // Click on pet
        this.addHandler(this.container, 'mousedown', (e) => {
            e.preventDefault();
            this.startDrag(e);
        });

        this.addHandler(document, 'mouseup', () => {
            if (this.isDragging) {
                this.endDrag();
            }
        });

        // Double-click for fortune
        this.addHandler(this.container, 'dblclick', () => {
            this.showFortune();
        });
    }

    show() {
        this.enabled = true;
        this.container.style.display = 'block';

        // Start at random position
        this.x = Math.random() * (window.innerWidth - this.width);
        this.y = Math.random() * (window.innerHeight - this.height - 100); // Above taskbar

        this.updatePosition();

        // Start animation loop
        if (!this.animationId) {
            this.animate();
        }
    }

    hide() {
        this.enabled = false;
        this.container.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    toggle(enabled) {
        if (enabled) {
            this.show();
        } else {
            this.hide();
        }
        StateManager.setState('settings.pet.enabled', enabled, true);
    }

    // Dragging
    startDrag(e) {
        this.isDragging = true;
        this.state = STATES.DRAGGING;
        this.dragOffsetX = e.clientX - this.x;
        this.dragOffsetY = e.clientY - this.y;
        this.vx = 0;
        this.vy = 0;
        this.container.style.cursor = 'grabbing';
    }

    updateDrag(e) {
        if (this.isDragging) {
            this.x = e.clientX - this.dragOffsetX;
            this.y = e.clientY - this.dragOffsetY;
            this.updatePosition();
        }
    }

    endDrag() {
        this.isDragging = false;
        this.container.style.cursor = 'pointer';
        this.state = STATES.FALLING;
        this.vy = 2; // Small drop velocity
    }

    // Animation loop
    animate() {
        if (!this.enabled) return;

        this.update();
        this.render();

        this.animationId = requestAnimationFrame(() => this.animate());
    }

    // Update logic
    update() {
        // Update frame animation
        this.frameTimer++;
        if (this.frameTimer >= this.frameDelay) {
            this.frameTimer = 0;
            this.frame++;
        }

        // Update state timer
        this.stateTimer++;

        // Don't update physics or AI while dragging
        if (this.state === STATES.DRAGGING) {
            return;
        }

        // Apply physics
        this.applyPhysics();

        // Update AI behavior
        this.updateBehavior();

        // Keep in bounds
        this.constrainToBounds();

        // Update DOM position
        this.updatePosition();
    }

    applyPhysics() {
        const ground = window.innerHeight - 100 - this.height; // Above taskbar

        // Apply gravity if not on ground
        if (this.y < ground) {
            this.vy += this.gravity;
            if (this.state !== STATES.JUMPING) {
                this.state = STATES.FALLING;
            }
        } else {
            // On ground
            this.y = ground;

            if (this.state === STATES.FALLING || this.state === STATES.JUMPING) {
                // Bounce
                if (Math.abs(this.vy) > 2) {
                    this.vy = -this.vy * this.bounce;
                } else {
                    this.vy = 0;
                    this.state = STATES.IDLE;
                    this.stateTimer = 0;
                }
            }
        }

        // Apply velocity
        this.x += this.vx;
        this.y += this.vy;

        // Friction
        this.vx *= 0.95;
    }

    updateBehavior() {
        const ground = window.innerHeight - 100 - this.height;
        const rand = Math.random();

        // Track mouse stillness for Neko-style behavior
        const dx = this.lastMouseX - (this.x + this.width / 2);
        const dy = this.lastMouseY - (this.y + this.height / 2);
        const distanceToCursor = Math.sqrt(dx * dx + dy * dy);

        // Don't change behavior while in air (except chasing)
        if (this.y < ground - 5 && this.state !== STATES.CHASING) {
            return;
        }

        // Increment idle time when not moving much
        if (Math.abs(this.vx) < 0.5 && this.state === STATES.IDLE) {
            this.idleTime++;
        } else {
            this.idleTime = 0;
        }

        // Handle blinking
        this.blinkTimer++;
        if (this.blinkTimer > 180 && rand < 0.02) {
            this.isBlinking = true;
            this.blinkTimer = 0;
        }
        if (this.isBlinking && this.blinkTimer > 8) {
            this.isBlinking = false;
        }

        switch (this.state) {
            case STATES.IDLE:
                this.vx *= 0.9;
                if (this.stateTimer > 90) {
                    this.chooseNewBehavior();
                }
                // Personality-based cursor attention
                if (this.petConfig.personality === 'curious' && distanceToCursor < 150 && rand < 0.02) {
                    this.state = STATES.ALERT;
                    this.stateTimer = 0;
                    this.facing = dx > 0 ? 1 : -1;
                }
                break;

            case STATES.ALERT:
                // Classic Neko alert pose before chasing
                this.vx = 0;
                if (this.stateTimer > 30) {
                    if (distanceToCursor > 60) {
                        this.state = STATES.CHASING;
                        this.stateTimer = 0;
                    } else {
                        this.state = STATES.IDLE;
                        this.stateTimer = 0;
                    }
                }
                break;

            case STATES.CHASING:
                // Classic Neko cursor chase!
                this.frameDelay = 4;
                if (distanceToCursor > 30) {
                    this.facing = dx > 0 ? 1 : -1;
                    const speed = this.petConfig.chaseSpeed;
                    this.vx = (dx / distanceToCursor) * speed;

                    // Small hop while running
                    if (this.y >= ground - 2 && this.stateTimer % 15 === 0) {
                        this.vy = -3;
                    }
                } else {
                    // Reached cursor - sit and look pleased
                    this.hasReachedCursor = true;
                    this.state = STATES.SITTING;
                    this.stateTimer = 0;
                    this.vx = 0;
                }

                // Give up after a while
                if (this.stateTimer > 300) {
                    this.state = STATES.BORED;
                    this.stateTimer = 0;
                }
                break;

            case STATES.BORED:
                // Look around disappointed
                this.vx = 0;
                if (this.stateTimer % 40 < 20) {
                    this.facing = 1;
                } else {
                    this.facing = -1;
                }
                if (this.stateTimer > 80) {
                    this.chooseNewBehavior();
                }
                break;

            case STATES.WALKING:
                this.vx = this.facing * this.petConfig.walkSpeed;
                this.frame = this.frame % 4;

                if (this.stateTimer > 150 || rand < 0.008) {
                    this.chooseNewBehavior();
                }
                break;

            case STATES.RUNNING:
                this.vx = this.facing * this.petConfig.chaseSpeed;
                this.frame = this.frame % 4;
                this.frameDelay = 4;

                if (this.stateTimer > 100 || rand < 0.015) {
                    this.chooseNewBehavior();
                }
                break;

            case STATES.SITTING:
                this.vx = 0;
                if (this.stateTimer > 180) {
                    this.chooseNewBehavior();
                }
                break;

            case STATES.SLEEPING:
                this.vx = 0;
                if (this.stateTimer > 400 || rand < 0.003) {
                    this.state = STATES.YAWNING;
                    this.stateTimer = 0;
                }
                break;

            case STATES.YAWNING:
                this.vx = 0;
                if (this.stateTimer > 50) {
                    this.state = STATES.IDLE;
                    this.stateTimer = 0;
                }
                break;

            case STATES.SCRATCHING:
                this.vx = 0;
                // Classic Neko wall scratch - stay at edge
                if (this.x < 10) {
                    this.x = 5;
                    this.facing = -1;
                } else if (this.x > window.innerWidth - this.width - 10) {
                    this.x = window.innerWidth - this.width - 5;
                    this.facing = 1;
                }
                if (this.stateTimer > 80) {
                    this.state = STATES.IDLE;
                    this.stateTimer = 0;
                }
                break;

            case STATES.GROOMING:
                this.vx = 0;
                if (this.stateTimer > 100) {
                    this.state = STATES.IDLE;
                    this.stateTimer = 0;
                }
                break;

            case STATES.PLAYING:
                // Playful behavior - personality dependent
                if (this.petConfig.personality === 'playful') {
                    if (this.stateTimer % 25 === 0 && rand < 0.6) {
                        this.vy = -10;
                    }
                } else {
                    if (this.stateTimer % 35 === 0 && rand < 0.4) {
                        this.vy = -7;
                    }
                }
                this.vx = Math.sin(this.stateTimer / 8) * 2.5;

                if (this.stateTimer > 150) {
                    this.state = STATES.IDLE;
                    this.stateTimer = 0;
                }
                break;

            case STATES.SURPRISED:
                // Quick surprised reaction
                this.vx = 0;
                if (this.stateTimer > 30) {
                    this.state = STATES.IDLE;
                    this.stateTimer = 0;
                }
                break;
        }

        // Personality-based random events
        const personality = this.petConfig.personality;

        // Random jump (more likely for playful pets)
        const jumpChance = personality === 'playful' ? 0.002 : 0.0008;
        if (rand < jumpChance && this.state !== STATES.SLEEPING && this.y >= ground - 5) {
            this.previousState = this.state;
            this.state = STATES.JUMPING;
            this.vy = personality === 'playful' ? -11 : -9;
            this.stateTimer = 0;
        }

        // Cursor chase trigger (more likely for curious pets)
        const chaseChance = personality === 'curious' ? 0.003 : 0.001;
        if (rand < chaseChance && distanceToCursor > 80 && distanceToCursor < 300) {
            if (this.state === STATES.IDLE || this.state === STATES.SITTING) {
                this.state = STATES.ALERT;
                this.stateTimer = 0;
                this.facing = dx > 0 ? 1 : -1;
            }
        }

        // Wall scratching when near edges (classic Neko!)
        if (rand < 0.002 && (this.x < 20 || this.x > window.innerWidth - this.width - 20)) {
            if (this.state === STATES.IDLE || this.state === STATES.WALKING) {
                this.state = STATES.SCRATCHING;
                this.stateTimer = 0;
            }
        }
    }

    chooseNewBehavior() {
        const rand = Math.random();
        this.stateTimer = 0;
        this.frameDelay = 8;
        this.previousState = this.state;

        // Behavior probabilities based on personality
        const personality = this.petConfig.personality;

        // Base behavior weights
        let behaviors = {
            walking: 0.18,
            running: 0.10,
            sitting: 0.12,
            sleeping: 0.10,
            scratching: 0.08,
            grooming: 0.10,
            playing: 0.08,
            idle: 0.24
        };

        // Adjust based on personality
        if (personality === 'curious') {
            // Neko - more walking, less sleeping
            behaviors.walking = 0.22;
            behaviors.sleeping = 0.06;
            behaviors.scratching = 0.12;
        } else if (personality === 'playful') {
            // Dogz - more playing and running
            behaviors.playing = 0.18;
            behaviors.running = 0.16;
            behaviors.sleeping = 0.06;
        } else if (personality === 'calm') {
            // eSheep - more sleeping and sitting
            behaviors.sleeping = 0.20;
            behaviors.sitting = 0.18;
            behaviors.running = 0.04;
            behaviors.playing = 0.04;
        }

        // Select behavior based on weighted random
        let cumulative = 0;
        for (const [behavior, weight] of Object.entries(behaviors)) {
            cumulative += weight;
            if (rand < cumulative) {
                switch (behavior) {
                    case 'walking':
                        this.state = STATES.WALKING;
                        this.facing = Math.random() < 0.5 ? 1 : -1;
                        break;
                    case 'running':
                        this.state = STATES.RUNNING;
                        this.facing = Math.random() < 0.5 ? 1 : -1;
                        break;
                    case 'sitting':
                        this.state = STATES.SITTING;
                        break;
                    case 'sleeping':
                        this.state = STATES.YAWNING;
                        break;
                    case 'scratching':
                        this.state = STATES.SCRATCHING;
                        break;
                    case 'grooming':
                        this.state = STATES.GROOMING;
                        break;
                    case 'playing':
                        this.state = STATES.PLAYING;
                        break;
                    default:
                        this.state = STATES.IDLE;
                }
                return;
            }
        }

        this.state = STATES.IDLE;
    }

    constrainToBounds() {
        const margin = 10;

        // Horizontal bounds
        if (this.x < -margin) {
            this.x = -margin;
            this.vx = Math.abs(this.vx);
            this.facing = 1;
        }

        if (this.x > window.innerWidth - this.width + margin) {
            this.x = window.innerWidth - this.width + margin;
            this.vx = -Math.abs(this.vx);
            this.facing = -1;
        }

        // Vertical bounds
        if (this.y < 0) {
            this.y = 0;
            this.vy = 0;
        }

        const ground = window.innerHeight - 100 - this.height;
        if (this.y > ground) {
            this.y = ground;
        }
    }

    updatePosition() {
        this.container.style.left = this.x + 'px';
        this.container.style.top = this.y + 'px';
    }

    // Rendering
    render() {
        if (!this.ctx) return;

        // Clear canvas
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Draw based on state
        this.drawPet();
    }

    drawPet() {
        const ctx = this.ctx;

        // Save context for transformations
        ctx.save();

        // Flip horizontally if facing left
        if (this.facing < 0) {
            ctx.translate(this.width, 0);
            ctx.scale(-1, 1);
        }

        // Dispatch to pet-specific drawing
        switch (this.petType) {
            case 'neko':
                this.drawNeko(ctx);
                break;
            case 'dog':
                this.drawDog(ctx);
                break;
            case 'sheep':
                this.drawSheep(ctx);
                break;
            default:
                this.drawNeko(ctx);
        }

        ctx.restore();
    }

    // ========================================
    // NEKO (Cat) Sprites - Classic 1989 style
    // ========================================
    drawNeko(ctx) {
        switch (this.state) {
            case STATES.IDLE:
            case STATES.BORED:
                this.drawNekoIdle(ctx);
                break;
            case STATES.ALERT:
                this.drawNekoAlert(ctx);
                break;
            case STATES.WALKING:
                this.drawNekoWalk(ctx);
                break;
            case STATES.RUNNING:
            case STATES.CHASING:
                this.drawNekoRun(ctx);
                break;
            case STATES.SITTING:
                this.drawNekoSit(ctx);
                break;
            case STATES.SLEEPING:
                this.drawNekoSleep(ctx);
                break;
            case STATES.JUMPING:
            case STATES.FALLING:
            case STATES.DRAGGING:
                this.drawNekoJump(ctx);
                break;
            case STATES.SCRATCHING:
                this.drawNekoScratch(ctx);
                break;
            case STATES.YAWNING:
                this.drawNekoYawn(ctx);
                break;
            case STATES.GROOMING:
                this.drawNekoGroom(ctx);
                break;
            case STATES.PLAYING:
            case STATES.SURPRISED:
                this.drawNekoPlay(ctx);
                break;
            default:
                this.drawNekoIdle(ctx);
        }
    }

    // ========================================
    // DOG (Dogz) Sprites
    // ========================================
    drawDog(ctx) {
        switch (this.state) {
            case STATES.IDLE:
            case STATES.BORED:
                this.drawDogIdle(ctx);
                break;
            case STATES.ALERT:
                this.drawDogAlert(ctx);
                break;
            case STATES.WALKING:
                this.drawDogWalk(ctx);
                break;
            case STATES.RUNNING:
            case STATES.CHASING:
                this.drawDogRun(ctx);
                break;
            case STATES.SITTING:
                this.drawDogSit(ctx);
                break;
            case STATES.SLEEPING:
                this.drawDogSleep(ctx);
                break;
            case STATES.JUMPING:
            case STATES.FALLING:
            case STATES.DRAGGING:
                this.drawDogJump(ctx);
                break;
            case STATES.SCRATCHING:
                this.drawDogScratch(ctx);
                break;
            case STATES.YAWNING:
                this.drawDogYawn(ctx);
                break;
            case STATES.GROOMING:
                this.drawDogGroom(ctx);
                break;
            case STATES.PLAYING:
            case STATES.SURPRISED:
                this.drawDogPlay(ctx);
                break;
            default:
                this.drawDogIdle(ctx);
        }
    }

    // ========================================
    // SHEEP (eSheep) Sprites
    // ========================================
    drawSheep(ctx) {
        switch (this.state) {
            case STATES.IDLE:
            case STATES.BORED:
            case STATES.ALERT:
                this.drawSheepIdle(ctx);
                break;
            case STATES.WALKING:
                this.drawSheepWalk(ctx);
                break;
            case STATES.RUNNING:
            case STATES.CHASING:
                this.drawSheepRun(ctx);
                break;
            case STATES.SITTING:
                this.drawSheepSit(ctx);
                break;
            case STATES.SLEEPING:
                this.drawSheepSleep(ctx);
                break;
            case STATES.JUMPING:
            case STATES.FALLING:
            case STATES.DRAGGING:
                this.drawSheepJump(ctx);
                break;
            case STATES.SCRATCHING:
            case STATES.GROOMING:
                this.drawSheepGroom(ctx);
                break;
            case STATES.YAWNING:
                this.drawSheepYawn(ctx);
                break;
            case STATES.PLAYING:
            case STATES.SURPRISED:
                this.drawSheepPlay(ctx);
                break;
            default:
                this.drawSheepIdle(ctx);
        }
    }

    // ========================================
    // NEKO SPRITE FUNCTIONS - Classic cat pet
    // ========================================

    drawNekoIdle(ctx) {
        const bob = Math.sin(this.stateTimer / 25) * 0.5;
        const c = this.petConfig;

        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 18 + bob, 16, 10);

        // Head
        ctx.fillRect(16, 10 + bob, 12, 10);

        // Ears (triangular)
        ctx.fillRect(15, 6 + bob, 4, 6);
        ctx.fillRect(23, 6 + bob, 4, 6);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(16, 7 + bob, 2, 3);
        ctx.fillRect(24, 7 + bob, 2, 3);

        // Tail curled
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(4, 20 + bob, 6, 3);
        ctx.fillRect(4, 18 + bob, 3, 3);

        // Legs
        ctx.fillRect(10, 26, 3, 6);
        ctx.fillRect(15, 26, 3, 6);
        ctx.fillRect(18, 26, 3, 6);
        ctx.fillRect(21, 26, 3, 6);

        // Eyes (with blink)
        ctx.fillStyle = c.eyeColor;
        if (this.isBlinking) {
            ctx.fillRect(18, 14 + bob, 3, 1);
            ctx.fillRect(23, 14 + bob, 3, 1);
        } else {
            ctx.fillRect(18, 13 + bob, 3, 3);
            ctx.fillRect(23, 13 + bob, 3, 3);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(19, 13 + bob, 1, 1);
            ctx.fillRect(24, 13 + bob, 1, 1);
        }

        // Nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(21, 17 + bob, 2, 2);

        // Whiskers
        ctx.fillStyle = '#888';
        ctx.fillRect(14, 16 + bob, 4, 1);
        ctx.fillRect(26, 16 + bob, 4, 1);
    }

    drawNekoAlert(ctx) {
        const c = this.petConfig;

        // Body slightly raised
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 16, 16, 10);

        // Head up, alert
        ctx.fillRect(16, 8, 12, 10);

        // Ears straight up
        ctx.fillRect(15, 2, 4, 8);
        ctx.fillRect(23, 2, 4, 8);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(16, 3, 2, 4);
        ctx.fillRect(24, 3, 2, 4);

        // Tail up
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(4, 14, 3, 8);

        // Legs
        ctx.fillRect(10, 24, 3, 8);
        ctx.fillRect(15, 24, 3, 8);
        ctx.fillRect(18, 24, 3, 8);
        ctx.fillRect(21, 24, 3, 8);

        // Wide eyes (alert!)
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(18, 11, 4, 4);
        ctx.fillRect(22, 11, 4, 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(19, 11, 2, 2);
        ctx.fillRect(23, 11, 2, 2);

        // Nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(21, 15, 2, 2);
    }

    drawNekoWalk(ctx) {
        const walkCycle = Math.floor(this.frame) % 4;
        const legOffset = [0, 2, 0, -2][walkCycle];
        const c = this.petConfig;

        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 17, 16, 9);

        // Head
        ctx.fillRect(17, 10, 11, 9);

        // Ears
        ctx.fillRect(16, 6, 4, 6);
        ctx.fillRect(24, 6, 4, 6);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(17, 7, 2, 3);
        ctx.fillRect(25, 7, 2, 3);

        // Animated legs
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 24 + legOffset, 3, 8 - Math.abs(legOffset));
        ctx.fillRect(14, 24 - legOffset, 3, 8 - Math.abs(legOffset));
        ctx.fillRect(18, 24 - legOffset, 3, 8 - Math.abs(legOffset));
        ctx.fillRect(21, 24 + legOffset, 3, 8 - Math.abs(legOffset));

        // Tail wave
        const tailY = Math.sin(this.stateTimer / 6) * 2;
        ctx.fillRect(4, 18 + tailY, 6, 3);

        // Eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(19, 13, 3, 2);
        ctx.fillRect(24, 13, 3, 2);

        // Nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(22, 16, 2, 2);
    }

    drawNekoRun(ctx) {
        const runCycle = Math.floor(this.frame) % 4;
        const stretch = [0, 2, 0, -2][runCycle];
        const c = this.petConfig;

        // Stretched body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6 - stretch, 16, 18 + stretch, 8);

        // Head forward
        ctx.fillRect(20 + stretch / 2, 10, 10, 8);

        // Ears back
        ctx.fillRect(19 + stretch / 2, 8, 4, 5);
        ctx.fillRect(25 + stretch / 2, 8, 4, 5);

        // Running legs
        const frontLeg = runCycle < 2 ? 4 : -2;
        const backLeg = runCycle < 2 ? -2 : 4;
        ctx.fillRect(8, 22 + backLeg, 3, 8);
        ctx.fillRect(12, 22 - backLeg, 3, 8);
        ctx.fillRect(18 + stretch, 22 + frontLeg, 3, 8);
        ctx.fillRect(22 + stretch, 22 - frontLeg, 3, 8);

        // Tail streaming back
        ctx.fillRect(2 - stretch, 14, 6, 3);

        // Eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(23 + stretch / 2, 13, 2, 2);
        ctx.fillRect(27 + stretch / 2, 13, 2, 2);

        // Nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(28 + stretch / 2, 15, 2, 2);
    }

    drawNekoSit(ctx) {
        const c = this.petConfig;

        // Body sitting
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 18, 14, 14);

        // Head
        ctx.fillRect(14, 10, 12, 10);

        // Ears
        ctx.fillRect(13, 6, 4, 6);
        ctx.fillRect(22, 6, 4, 6);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(14, 7, 2, 3);
        ctx.fillRect(23, 7, 2, 3);

        // Front paws
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(12, 28, 4, 4);
        ctx.fillRect(18, 28, 4, 4);

        // Tail wrapped
        ctx.fillRect(22, 26, 8, 3);
        ctx.fillRect(28, 22, 3, 6);

        // Eyes (content)
        ctx.fillStyle = c.eyeColor;
        if (this.hasReachedCursor) {
            // Happy closed eyes
            ctx.fillRect(16, 14, 3, 1);
            ctx.fillRect(21, 14, 3, 1);
        } else {
            ctx.fillRect(16, 13, 3, 3);
            ctx.fillRect(21, 13, 3, 3);
        }

        // Nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(19, 17, 2, 2);
    }

    drawNekoSleep(ctx) {
        const c = this.petConfig;
        const breathe = Math.sin(this.stateTimer / 30) * 0.5;

        // Curled up body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, 22 + breathe, 20, 10);
        ctx.fillRect(8, 20 + breathe, 16, 4);

        // Head tucked
        ctx.fillRect(18, 18 + breathe, 10, 8);

        // Ears flat
        ctx.fillRect(18, 17 + breathe, 4, 3);
        ctx.fillRect(24, 17 + breathe, 4, 3);

        // Tail curled around
        ctx.fillRect(4, 24, 4, 3);
        ctx.fillRect(2, 20, 3, 6);

        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(21, 21 + breathe, 3, 1);
        ctx.fillRect(25, 21 + breathe, 3, 1);

        // Z's
        const zOffset = (this.stateTimer % 60) / 15;
        ctx.fillStyle = '#666';
        ctx.font = '6px monospace';
        ctx.fillText('z', 26, 14 - zOffset);
        ctx.fillText('z', 28, 10 - zOffset);
        ctx.fillText('Z', 26, 6 - zOffset);
    }

    drawNekoJump(ctx) {
        const c = this.petConfig;

        // Body stretched
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 12, 16, 10);

        // Head
        ctx.fillRect(18, 8, 10, 8);

        // Ears up
        ctx.fillRect(17, 4, 4, 6);
        ctx.fillRect(24, 4, 4, 6);

        // Legs extended
        ctx.fillRect(8, 20, 4, 6);
        ctx.fillRect(14, 22, 4, 6);
        ctx.fillRect(18, 22, 4, 6);
        ctx.fillRect(22, 20, 4, 6);

        // Tail up
        ctx.fillRect(4, 8, 6, 3);
        ctx.fillRect(4, 10, 3, 4);

        // Wide eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(20, 10, 3, 3);
        ctx.fillRect(25, 10, 3, 3);

        // Nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(23, 13, 2, 2);
    }

    drawNekoScratch(ctx) {
        const scratchFrame = Math.floor(this.stateTimer / 4) % 2;
        const c = this.petConfig;

        // Body against wall
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, 14, 14, 12);

        // Head looking up at wall
        ctx.fillRect(4, 8, 10, 8);

        // Ears
        ctx.fillRect(3, 4, 4, 6);
        ctx.fillRect(10, 4, 4, 6);

        // Scratching paw
        const pawY = scratchFrame === 0 ? 10 : 14;
        ctx.fillRect(0, pawY, 4, 4);

        // Other legs
        ctx.fillRect(8, 24, 4, 8);
        ctx.fillRect(14, 24, 4, 8);

        // Tail excited
        const tailWag = scratchFrame === 0 ? -2 : 2;
        ctx.fillRect(18, 16 + tailWag, 6, 3);

        // Eyes focused
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(6, 11, 2, 2);
        ctx.fillRect(10, 11, 2, 2);

        // Scratch marks on wall
        ctx.fillStyle = '#666';
        if (scratchFrame === 1) {
            ctx.fillRect(0, 6, 1, 6);
            ctx.fillRect(2, 8, 1, 6);
        }
    }

    drawNekoYawn(ctx) {
        const c = this.petConfig;

        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 18, 16, 10);

        // Head tilted
        ctx.fillRect(16, 10, 12, 10);

        // Ears relaxed
        ctx.fillRect(15, 6, 4, 6);
        ctx.fillRect(24, 6, 4, 6);

        // Legs
        ctx.fillRect(10, 26, 3, 6);
        ctx.fillRect(15, 26, 3, 6);
        ctx.fillRect(18, 26, 3, 6);
        ctx.fillRect(21, 26, 3, 6);

        // Tail
        ctx.fillRect(4, 20, 6, 3);

        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(18, 14, 3, 1);
        ctx.fillRect(23, 14, 3, 1);

        // Open mouth (yawn)
        ctx.fillStyle = '#333';
        ctx.fillRect(19, 16, 4, 4);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(20, 17, 2, 2);
    }

    drawNekoGroom(ctx) {
        const groomFrame = Math.floor(this.stateTimer / 6) % 2;
        const c = this.petConfig;

        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 16, 14, 12);

        // Head bent for grooming
        const headY = groomFrame === 0 ? 14 : 16;
        ctx.fillRect(14, headY, 10, 8);

        // Ears
        ctx.fillRect(13, headY - 4, 4, 5);
        ctx.fillRect(20, headY - 4, 4, 5);

        // Paw raised to face
        ctx.fillRect(22, headY + 2, 4, 4);

        // Other legs
        ctx.fillRect(12, 26, 4, 6);
        ctx.fillRect(18, 26, 4, 6);

        // Tail
        ctx.fillRect(6, 20, 6, 3);

        // Closed eyes while grooming
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(16, headY + 2, 2, 1);
    }

    drawNekoPlay(ctx) {
        const playFrame = Math.floor(this.stateTimer / 5) % 3;
        const bounce = [0, -3, 0][playFrame];
        const c = this.petConfig;

        // Body bouncing
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 16 + bounce, 16, 10);

        // Head
        ctx.fillRect(16, 10 + bounce, 12, 8);

        // Ears perked
        ctx.fillRect(15, 6 + bounce, 4, 6);
        ctx.fillRect(24, 6 + bounce, 4, 6);

        // Paws up
        ctx.fillRect(10, 24 + bounce / 2, 3, 8);
        ctx.fillRect(15, 26 - bounce / 2, 3, 6);
        ctx.fillRect(18, 26 - bounce / 2, 3, 6);
        ctx.fillRect(21, 24 + bounce / 2, 3, 8);

        // Tail up excited
        const tailWag = Math.sin(this.stateTimer / 3) * 3;
        ctx.fillRect(4, 14 + tailWag + bounce, 6, 3);

        // Big excited eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(18, 12 + bounce, 3, 4);
        ctx.fillRect(23, 12 + bounce, 3, 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(19, 12 + bounce, 1, 2);
        ctx.fillRect(24, 12 + bounce, 1, 2);

        // Open happy mouth
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(21, 16 + bounce, 2, 2);
    }

    // ========================================
    // DOG SPRITE FUNCTIONS - Dogz style
    // ========================================

    drawDogIdle(ctx) {
        const bob = Math.sin(this.stateTimer / 20) * 1;
        const c = this.petConfig;

        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 16 + bob, 16, 10);

        // Head
        ctx.fillRect(18, 10 + bob, 10, 10);

        // Floppy ears
        ctx.fillRect(18, 8 + bob, 3, 10);
        ctx.fillRect(25, 8 + bob, 3, 10);

        // Legs
        ctx.fillRect(10, 26, 3, 6);
        ctx.fillRect(15, 26, 3, 6);
        ctx.fillRect(18, 26, 3, 6);
        ctx.fillRect(23, 26, 3, 6);

        // Tail wagging
        const tailWag = Math.sin(this.stateTimer / 8) * 2;
        ctx.fillRect(6, 18 + tailWag + bob, 4, 3);

        // Eyes
        ctx.fillStyle = c.eyeColor;
        if (this.isBlinking) {
            ctx.fillRect(21, 14 + bob, 3, 1);
        } else {
            ctx.fillRect(21, 13 + bob, 3, 3);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(22, 13 + bob, 1, 1);
        }

        // Nose
        ctx.fillStyle = '#000';
        ctx.fillRect(26, 16 + bob, 3, 3);

        // Muzzle highlight
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(19, 15 + bob, 6, 4);
    }

    drawDogAlert(ctx) {
        const c = this.petConfig;

        // Body raised
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 14, 16, 10);

        // Head up
        ctx.fillRect(18, 8, 10, 10);

        // Ears perked up!
        ctx.fillRect(17, 4, 4, 8);
        ctx.fillRect(24, 4, 4, 8);

        // Legs ready
        ctx.fillRect(10, 22, 3, 10);
        ctx.fillRect(15, 22, 3, 10);
        ctx.fillRect(18, 22, 3, 10);
        ctx.fillRect(23, 22, 3, 10);

        // Tail up
        ctx.fillRect(4, 10, 4, 8);

        // Alert eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(20, 11, 4, 4);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(21, 11, 2, 2);

        // Nose
        ctx.fillStyle = '#000';
        ctx.fillRect(26, 14, 3, 3);

        // Muzzle
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(19, 13, 6, 4);
    }

    drawDogWalk(ctx) {
        const walkCycle = Math.floor(this.frame) % 4;
        const legOffset = [0, 2, 0, -2][walkCycle];
        const c = this.petConfig;

        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 16, 16, 10);

        // Head bob
        const headBob = [0, -1, 0, 1][walkCycle];
        ctx.fillRect(18, 10 + headBob, 10, 10);

        // Floppy ears bouncing
        ctx.fillRect(18, 8 + headBob, 3, 10 + Math.abs(headBob));
        ctx.fillRect(25, 8 + headBob, 3, 10 + Math.abs(headBob));

        // Animated legs
        ctx.fillRect(10, 26 + legOffset, 3, 6);
        ctx.fillRect(15, 26 - legOffset, 3, 6);
        ctx.fillRect(18, 26 - legOffset, 3, 6);
        ctx.fillRect(23, 26 + legOffset, 3, 6);

        // Tail wagging
        const tailWag = [0, 3, 0, -3][walkCycle];
        ctx.fillRect(6, 18 + tailWag, 4, 3);

        // Eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(21, 13 + headBob, 3, 2);

        // Nose
        ctx.fillStyle = '#000';
        ctx.fillRect(26, 16 + headBob, 3, 2);

        // Muzzle
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(19, 14 + headBob, 6, 4);

        // Tongue out while walking
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(24, 18 + headBob, 3, 3);
    }

    drawDogRun(ctx) {
        const runCycle = Math.floor(this.frame) % 4;
        const stretch = [0, 2, 0, -2][runCycle];
        const c = this.petConfig;

        // Stretched body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6 - stretch, 15, 18 + stretch, 9);

        // Head forward
        ctx.fillRect(20 + stretch / 2, 10, 10, 9);

        // Ears flying back
        ctx.fillRect(18 + stretch / 2, 10, 3, 8);
        ctx.fillRect(25 + stretch / 2, 10, 3, 8);

        // Running legs
        const frontLeg = runCycle < 2 ? 4 : -2;
        const backLeg = runCycle < 2 ? -2 : 4;
        ctx.fillRect(8, 22 + backLeg, 3, 10);
        ctx.fillRect(13, 22 - backLeg, 3, 10);
        ctx.fillRect(18 + stretch, 22 + frontLeg, 3, 10);
        ctx.fillRect(23 + stretch, 22 - frontLeg, 3, 10);

        // Tail streaming
        ctx.fillRect(2 - stretch, 13, 6, 3);

        // Eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(23 + stretch / 2, 13, 3, 2);

        // Nose
        ctx.fillStyle = '#000';
        ctx.fillRect(28 + stretch / 2, 15, 2, 2);

        // Tongue flying
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(25 + stretch / 2, 17, 5, 2);
    }

    drawDogSit(ctx) {
        const c = this.petConfig;

        // Body sitting
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(12, 18, 12, 14);

        // Head
        ctx.fillRect(16, 10, 10, 10);

        // Floppy ears
        ctx.fillRect(15, 8, 3, 10);
        ctx.fillRect(24, 8, 3, 10);

        // Front legs
        ctx.fillRect(14, 28, 3, 4);
        ctx.fillRect(19, 28, 3, 4);

        // Tail wagging
        const tailWag = Math.sin(this.stateTimer / 6) * 3;
        ctx.fillRect(22, 24 + tailWag, 8, 3);

        // Eyes (happy)
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(18, 13, 3, 3);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(19, 13, 1, 1);

        // Nose
        ctx.fillStyle = '#000';
        ctx.fillRect(24, 16, 3, 2);

        // Muzzle
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(17, 15, 6, 4);

        // Happy panting
        if (this.stateTimer % 30 < 15) {
            ctx.fillStyle = c.accentColor;
            ctx.fillRect(20, 18, 4, 3);
        }
    }

    drawDogSleep(ctx) {
        const c = this.petConfig;
        const breathe = Math.sin(this.stateTimer / 25) * 0.5;

        // Body lying
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, 24 + breathe, 20, 8);

        // Head down
        ctx.fillRect(20, 22 + breathe, 10, 8);

        // Ears flat
        ctx.fillRect(20, 21 + breathe, 3, 3);
        ctx.fillRect(27, 21 + breathe, 3, 3);

        // Tail
        ctx.fillRect(4, 26, 4, 3);

        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(24, 25 + breathe, 3, 1);

        // Z's
        const zOffset = (this.stateTimer % 60) / 15;
        ctx.fillStyle = '#666';
        ctx.fillRect(28, 16 - zOffset, 2, 2);
        ctx.fillRect(26, 12 - zOffset, 3, 3);
        ctx.fillRect(29, 8 - zOffset, 2, 2);

        // Muzzle
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(21, 24 + breathe, 5, 3);
    }

    drawDogJump(ctx) {
        const c = this.petConfig;

        // Body in air
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 14, 14, 10);

        // Head
        ctx.fillRect(18, 10, 10, 8);

        // Ears up
        ctx.fillRect(17, 6, 4, 8);
        ctx.fillRect(24, 6, 4, 8);

        // Legs extended
        ctx.fillRect(10, 22, 4, 6);
        ctx.fillRect(16, 24, 4, 5);
        ctx.fillRect(20, 22, 4, 6);

        // Tail up
        ctx.fillRect(6, 10, 5, 6);

        // Excited eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(21, 12, 3, 3);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(22, 12, 1, 1);

        // Nose
        ctx.fillStyle = '#000';
        ctx.fillRect(26, 14, 2, 2);

        // Muzzle
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(19, 13, 6, 4);

        // Tongue
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(24, 16, 3, 3);
    }

    drawDogScratch(ctx) {
        const scratchFrame = Math.floor(this.stateTimer / 5) % 2;
        const c = this.petConfig;

        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(12, 16, 14, 10);

        // Head tilted
        ctx.fillRect(18, 12, 10, 10);

        // Ears
        ctx.fillRect(17, 10, 3, 8);
        ctx.fillRect(25, 10, 3, 8);

        // Scratching back leg
        const legY = scratchFrame === 0 ? 18 : 22;
        ctx.fillRect(24, legY, 4, 6);

        // Other legs
        ctx.fillRect(14, 24, 3, 8);
        ctx.fillRect(19, 24, 3, 8);

        // Tail
        const tailWag = scratchFrame === 0 ? -2 : 2;
        ctx.fillRect(10, 18 + tailWag, 4, 3);

        // Eyes (relief)
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(21, 16, 3, 1);

        // Nose
        ctx.fillStyle = '#000';
        ctx.fillRect(26, 18, 2, 2);
    }

    drawDogYawn(ctx) {
        const c = this.petConfig;

        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 18, 14, 10);

        // Head back
        ctx.fillRect(18, 10, 10, 12);

        // Ears relaxed
        ctx.fillRect(17, 8, 3, 10);
        ctx.fillRect(25, 8, 3, 10);

        // Legs
        ctx.fillRect(12, 26, 3, 6);
        ctx.fillRect(17, 26, 3, 6);
        ctx.fillRect(20, 26, 3, 6);

        // Tail
        ctx.fillRect(8, 20, 4, 3);

        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(21, 14, 3, 1);

        // Big yawn
        ctx.fillStyle = '#333';
        ctx.fillRect(22, 16, 5, 5);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(23, 17, 3, 3);
    }

    drawDogGroom(ctx) {
        const groomFrame = Math.floor(this.stateTimer / 8) % 2;
        const c = this.petConfig;

        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 18, 16, 10);

        // Head licking
        const headY = groomFrame === 0 ? 20 : 22;
        ctx.fillRect(8, headY, 10, 8);

        // Ears
        ctx.fillRect(7, headY - 2, 3, 6);
        ctx.fillRect(14, headY - 2, 3, 6);

        // Back legs
        ctx.fillRect(18, 26, 4, 6);
        ctx.fillRect(23, 26, 4, 6);

        // Tail
        ctx.fillRect(24, 20, 6, 3);

        // Licking paw
        if (groomFrame === 1) {
            ctx.fillStyle = c.accentColor;
            ctx.fillRect(14, headY + 4, 4, 2);
        }

        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(10, headY + 2, 2, 1);
    }

    drawDogPlay(ctx) {
        const playFrame = Math.floor(this.stateTimer / 6) % 3;
        const bounce = [0, -4, -2][playFrame];
        const c = this.petConfig;

        // Body bouncing
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 16 + bounce, 14, 10);

        // Head
        ctx.fillRect(18, 10 + bounce, 10, 10);

        // Ears flopping
        ctx.fillRect(17, 8 + bounce, 3, 12 - bounce / 2);
        ctx.fillRect(25, 8 + bounce, 3, 12 - bounce / 2);

        // Legs
        ctx.fillRect(12, 24 + bounce / 2, 3, 8);
        ctx.fillRect(17, 26 - bounce / 2, 3, 6);
        ctx.fillRect(20, 26 - bounce / 2, 3, 6);
        ctx.fillRect(23, 24 + bounce / 2, 3, 8);

        // Tail wagging fast
        const tailWag = Math.sin(this.stateTimer / 2) * 4;
        ctx.fillRect(6, 16 + tailWag + bounce, 5, 3);

        // Happy eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(21, 14 + bounce, 3, 3);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(22, 14 + bounce, 1, 1);

        // Nose
        ctx.fillStyle = '#000';
        ctx.fillRect(26, 16 + bounce, 2, 2);

        // Tongue out
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(23, 18 + bounce, 5, 3);
    }

    // ========================================
    // SHEEP SPRITE FUNCTIONS - eSheep style
    // ========================================

    drawSheepIdle(ctx) {
        const bob = Math.sin(this.stateTimer / 30) * 0.5;
        const c = this.petConfig;

        // Fluffy wool body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, 16 + bob, 20, 12);
        ctx.fillRect(4, 18 + bob, 4, 8);
        ctx.fillRect(24, 18 + bob, 4, 8);
        ctx.fillRect(8, 14 + bob, 16, 4);

        // Dark face
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 10 + bob, 10, 10);

        // Ears
        ctx.fillRect(17, 12 + bob, 3, 4);
        ctx.fillRect(26, 12 + bob, 3, 4);

        // Legs
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(10, 26, 3, 6);
        ctx.fillRect(15, 26, 3, 6);
        ctx.fillRect(18, 26, 3, 6);
        ctx.fillRect(23, 26, 3, 6);

        // Eyes
        ctx.fillStyle = c.eyeColor;
        if (this.isBlinking) {
            ctx.fillRect(20, 14 + bob, 2, 1);
            ctx.fillRect(24, 14 + bob, 2, 1);
        } else {
            ctx.fillRect(20, 13 + bob, 2, 3);
            ctx.fillRect(24, 13 + bob, 2, 3);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(20, 13 + bob, 1, 1);
            ctx.fillRect(24, 13 + bob, 1, 1);
        }

        // Fluffy wool on head
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(18, 8 + bob, 10, 4);
    }

    drawSheepWalk(ctx) {
        const walkCycle = Math.floor(this.frame) % 4;
        const legOffset = [0, 1, 0, -1][walkCycle];
        const c = this.petConfig;

        // Wool body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, 16, 20, 12);
        ctx.fillRect(4, 18, 4, 8);
        ctx.fillRect(24, 18, 4, 8);
        ctx.fillRect(8, 14, 16, 4);

        // Face
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 10, 10, 10);

        // Ears
        ctx.fillRect(17, 12, 3, 4);
        ctx.fillRect(26, 12, 3, 4);

        // Animated legs
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(10, 26 + legOffset, 3, 6);
        ctx.fillRect(15, 26 - legOffset, 3, 6);
        ctx.fillRect(18, 26 - legOffset, 3, 6);
        ctx.fillRect(23, 26 + legOffset, 3, 6);

        // Eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(20, 13, 2, 2);
        ctx.fillRect(24, 13, 2, 2);

        // Wool tuft
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(18, 8, 10, 4);
    }

    drawSheepRun(ctx) {
        const runCycle = Math.floor(this.frame) % 4;
        const c = this.petConfig;

        // Wool body stretched
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(4, 16, 22, 10);
        ctx.fillRect(2, 18, 4, 6);
        ctx.fillRect(24, 18, 4, 6);

        // Face
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(20, 12, 10, 8);

        // Ears back
        ctx.fillRect(19, 14, 3, 3);
        ctx.fillRect(27, 14, 3, 3);

        // Running legs
        const frontLeg = runCycle < 2 ? 3 : -1;
        const backLeg = runCycle < 2 ? -1 : 3;
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(8, 24 + backLeg, 3, 8);
        ctx.fillRect(13, 24 - backLeg, 3, 8);
        ctx.fillRect(18, 24 + frontLeg, 3, 8);
        ctx.fillRect(23, 24 - frontLeg, 3, 8);

        // Eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(23, 14, 2, 2);
        ctx.fillRect(27, 14, 2, 2);

        // Wool tuft bouncing
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(20, 10, 8, 4);
    }

    drawSheepSit(ctx) {
        const c = this.petConfig;

        // Wool body sitting
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 18, 18, 14);
        ctx.fillRect(6, 20, 4, 10);
        ctx.fillRect(24, 20, 4, 10);

        // Face
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(16, 10, 10, 10);

        // Ears
        ctx.fillRect(15, 12, 3, 4);
        ctx.fillRect(24, 12, 3, 4);

        // Front legs tucked
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(12, 28, 4, 4);
        ctx.fillRect(18, 28, 4, 4);

        // Eyes (content)
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(18, 14, 2, 2);
        ctx.fillRect(22, 14, 2, 2);

        // Wool tuft
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(16, 8, 10, 4);
    }

    drawSheepSleep(ctx) {
        const c = this.petConfig;
        const breathe = Math.sin(this.stateTimer / 35) * 0.5;

        // Curled wool body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(4, 22 + breathe, 24, 10);
        ctx.fillRect(2, 24 + breathe, 4, 6);
        ctx.fillRect(26, 24 + breathe, 4, 6);
        ctx.fillRect(6, 20 + breathe, 20, 4);

        // Face tucked
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(20, 20 + breathe, 8, 6);

        // Ears
        ctx.fillRect(19, 21 + breathe, 2, 3);
        ctx.fillRect(26, 21 + breathe, 2, 3);

        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(22, 22 + breathe, 2, 1);
        ctx.fillRect(25, 22 + breathe, 2, 1);

        // Z's
        const zOffset = (this.stateTimer % 70) / 18;
        ctx.fillStyle = '#666';
        ctx.fillRect(26, 14 - zOffset, 2, 2);
        ctx.fillRect(28, 10 - zOffset, 2, 2);
        ctx.fillRect(26, 6 - zOffset, 2, 2);

        // Wool on head
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(20, 18 + breathe, 8, 4);
    }

    drawSheepJump(ctx) {
        const c = this.petConfig;

        // Wool body in air
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 12, 18, 12);
        ctx.fillRect(6, 14, 4, 8);
        ctx.fillRect(24, 14, 4, 8);

        // Face
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 8, 10, 8);

        // Ears
        ctx.fillRect(17, 10, 3, 3);
        ctx.fillRect(26, 10, 3, 3);

        // Legs extended
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(10, 22, 3, 6);
        ctx.fillRect(15, 24, 3, 5);
        ctx.fillRect(19, 24, 3, 5);
        ctx.fillRect(23, 22, 3, 6);

        // Surprised eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(20, 10, 3, 3);
        ctx.fillRect(24, 10, 3, 3);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(21, 10, 1, 1);
        ctx.fillRect(25, 10, 1, 1);

        // Wool tuft
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(18, 6, 10, 4);
    }

    drawSheepGroom(ctx) {
        const groomFrame = Math.floor(this.stateTimer / 10) % 2;
        const c = this.petConfig;

        // Wool body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 18, 18, 12);
        ctx.fillRect(6, 20, 4, 8);
        ctx.fillRect(24, 20, 4, 8);

        // Face looking at wool
        ctx.fillStyle = c.accentColor;
        const faceY = groomFrame === 0 ? 14 : 16;
        ctx.fillRect(6, faceY, 10, 8);

        // Ears
        ctx.fillRect(5, faceY + 1, 3, 3);
        ctx.fillRect(13, faceY + 1, 3, 3);

        // Legs
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(12, 28, 3, 4);
        ctx.fillRect(17, 28, 3, 4);
        ctx.fillRect(22, 28, 3, 4);

        // Nibbling wool
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(8, faceY + 3, 2, 1);
        ctx.fillRect(12, faceY + 3, 2, 1);

        // Wool tuft
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, faceY - 2, 10, 3);
    }

    drawSheepYawn(ctx) {
        const c = this.petConfig;

        // Wool body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, 16, 20, 12);
        ctx.fillRect(4, 18, 4, 8);
        ctx.fillRect(24, 18, 4, 8);

        // Face tilted
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 8, 10, 12);

        // Ears
        ctx.fillRect(17, 10, 3, 4);
        ctx.fillRect(26, 10, 3, 4);

        // Legs
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(10, 26, 3, 6);
        ctx.fillRect(15, 26, 3, 6);
        ctx.fillRect(18, 26, 3, 6);
        ctx.fillRect(23, 26, 3, 6);

        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(20, 12, 2, 1);
        ctx.fillRect(24, 12, 2, 1);

        // Open mouth
        ctx.fillStyle = '#FFB6C1';
        ctx.fillRect(21, 15, 4, 3);

        // Wool tuft
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(18, 6, 10, 4);
    }

    drawSheepPlay(ctx) {
        const playFrame = Math.floor(this.stateTimer / 8) % 3;
        const bounce = [0, -2, 0][playFrame];
        const c = this.petConfig;

        // Bouncing wool body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, 16 + bounce, 20, 12);
        ctx.fillRect(4, 18 + bounce, 4, 8);
        ctx.fillRect(24, 18 + bounce, 4, 8);

        // Face
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 10 + bounce, 10, 10);

        // Ears
        ctx.fillRect(17, 12 + bounce, 3, 4);
        ctx.fillRect(26, 12 + bounce, 3, 4);

        // Legs
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(10, 26 + bounce / 2, 3, 6);
        ctx.fillRect(15, 28 - bounce / 2, 3, 4);
        ctx.fillRect(18, 28 - bounce / 2, 3, 4);
        ctx.fillRect(23, 26 + bounce / 2, 3, 6);

        // Happy eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(20, 13 + bounce, 2, 3);
        ctx.fillRect(24, 13 + bounce, 2, 3);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(20, 13 + bounce, 1, 1);
        ctx.fillRect(24, 13 + bounce, 1, 1);

        // Wool tuft bouncing
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(18, 8 + bounce, 10, 4);
    }

    showFortune() {
        const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
        const petName = this.petConfig.name;

        // Create retro-styled alert dialog
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay active';
        overlay.innerHTML = `
            <div class="dialog-box">
                <div class="dialog-icon" style="font-family: monospace; font-size: 28px;">:3</div>
                <div class="dialog-text">
                    <strong>${petName} says:</strong><br><br>
                    "${fortune}"
                </div>
                <div class="dialog-buttons">
                    <button class="btn btn-primary">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('button').onclick = () => overlay.remove();

        StateManager.unlockAchievement('fortune_teller');

        // Pet reacts happily
        this.state = STATES.PLAYING;
        this.stateTimer = 0;
        this.hasReachedCursor = false;
    }

    getAvailablePets() {
        return Object.keys(PET_CONFIGS);
    }
}

// Create and export singleton instance
const DesktopPetInstance = new DesktopPet();
export default DesktopPetInstance;
