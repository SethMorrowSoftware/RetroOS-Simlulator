/**
 * DesktopPet - Animated desktop companion with retro behaviors
 * Inspired by classic 90s desktop pets: Neko (1989), eSheep (1995), Dogz (1995)
 *
 * Features:
 * - Five pet types (neko, dog, sheep, fox, bunny) each with a full state machine
 * - Stats (happiness/hunger/energy) that drift while the tab is open
 * - Speech bubbles, particle FX (hearts/sparkles/Zzz/?), name tag, right-click menu
 * - Cross-feature reactions: achievements, app/window events, idle, easter eggs
 *
 * Extends FeatureBase for FeatureRegistry integration.
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import StorageManager from '../core/StorageManager.js';
import { escapeHtml } from '../core/Sanitize.js';

// Feature metadata
const FEATURE_METADATA = {
    id: 'desktoppet',
    name: 'Desktop Pet',
    description: 'Classic 90s desktop pet - Neko, Dogz, eSheep, Fox, or Bunny companion!',
    icon: ':3',
    category: 'enhancement',
    dependencies: [],
    config: {
        petType: 'neko',
        petName: '',           // empty = auto-pick from PET_NAMES
        animationSpeed: 1.0,
        enablePhysics: true,
        enableFortunes: true,
        enableStats: true,
        enableSounds: true,
        enableParticles: true,
        enableReactions: true,
        showNameTag: true
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
            options: ['neko', 'dog', 'sheep', 'fox', 'bunny']
        },
        {
            key: 'petName',
            label: 'Pet Name (blank for random)',
            type: 'text'
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
        },
        {
            key: 'enableStats',
            label: 'Track Happiness / Hunger / Energy',
            type: 'checkbox'
        },
        {
            key: 'enableSounds',
            label: 'Pet Sound Effects',
            type: 'checkbox'
        },
        {
            key: 'enableParticles',
            label: 'Particle Effects (hearts / sparkles / Zzz)',
            type: 'checkbox'
        },
        {
            key: 'enableReactions',
            label: 'React to System Events',
            type: 'checkbox'
        },
        {
            key: 'showNameTag',
            label: 'Show Name Tag on Hover',
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
    BORED: 'bored',         // Looking around
    EATING: 'eating',       // Munching food
    PETTED: 'petted',       // Just got petted
    EXCITED: 'excited',     // Achievement / celebration
    CURIOUS: 'curious',     // New window opened
    CONFUSED: 'confused'    // ? bubble
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
        personality: 'curious',     // More likely to chase cursor
        sound: 'meow',
        soundFallbackText: '*meow*'
    },
    dog: {
        name: 'Dogz',
        primaryColor: '#8B4513',    // Saddle brown
        secondaryColor: '#A0522D',  // Sienna
        accentColor: '#FFB6C1',     // Pink tongue
        eyeColor: '#000000',
        chaseSpeed: 4,
        walkSpeed: 2,
        personality: 'playful',     // More jumping and playing
        sound: 'bark',
        soundFallbackText: '*woof*'
    },
    sheep: {
        name: 'eSheep',
        primaryColor: '#F5F5F5',    // White wool
        secondaryColor: '#E0E0E0',  // Gray wool
        accentColor: '#2F2F2F',     // Dark face
        eyeColor: '#000000',
        chaseSpeed: 2,
        walkSpeed: 1,
        personality: 'calm',        // More sleeping and sitting
        sound: 'baa',
        soundFallbackText: '*baa*'
    },
    fox: {
        name: 'Vix',
        primaryColor: '#E07A2B',    // Orange fox
        secondaryColor: '#FFFFFF',  // White belly/face
        accentColor: '#3C2414',     // Dark paws/ears
        eyeColor: '#000000',
        chaseSpeed: 4.2,
        walkSpeed: 1.8,
        personality: 'mischievous', // Sneaky, chases a lot
        sound: 'yip',
        soundFallbackText: '*yip*'
    },
    bunny: {
        name: 'Hoppy',
        primaryColor: '#F0E0D0',    // Soft beige fur
        secondaryColor: '#FFFFFF',  // White belly
        accentColor: '#FFB6C1',     // Pink ears/nose
        eyeColor: '#000000',
        chaseSpeed: 3.0,
        walkSpeed: 1.4,             // Hops, not walks
        personality: 'gentle',      // Sits and grooms a lot
        sound: 'squeak',
        soundFallbackText: '*squeak*'
    }
};

// Random name pool used when the user hasn't named their pet
const PET_NAMES = [
    'Buddy', 'Pixel', 'Bits', 'Cookie', 'Whiskers', 'Spot', 'Daisy', 'Luna',
    'Max', 'Ziggy', 'Pip', 'Mochi', 'Tofu', 'Biscuit', 'Pepper', 'Noodle',
    'Sprout', 'Beans', 'Pickle', 'Goose'
];

// Things the pet says in speech bubbles, organized by trigger.
// Speech bubble text is short, in-character, and varies by personality where useful.
const REACTIONS = {
    petted: ['*purrs*', '<3', 'more!', '*happy*', '*nuzzles*', ':3', '*content*'],
    fed:    ['*nom nom*', 'yummy!', 'thanks!', '*chews*', 'more food?', '<3'],
    achievement: ['Wow!', 'Great job!', 'Yeah!', '*excited*', 'You did it!', 'Cool!'],
    appOpen: ["What's that?", '*curious*', 'Ooh!', 'Interesting...', '?', '*tilts head*'],
    idle: ['*yawns*', 'Zzz...', '*sleepy*', 'Naptime...', 'so tired...'],
    konami: ['🎮', 'Cheat mode!', '*does a flip*', 'Whoa!', '!!!'],
    drag: ['Wheee!', '*flails*', 'Eek!', 'Put me down!', '*dizzy*'],
    click: ['Hi!', '?', 'Yes?', '*looks up*', ':3'],
    sad: ["I'm hungry...", "I'm bored...", '*sigh*', 'Pet me please?'],
    sleep: ['Zzz', 'zzz...', '*snore*', 'mmm...'],
    confused: ['?', '???', '...', '*tilts head*'],
    error: ['*worried*', 'Uh oh', '!!', '*hides*']
};

// Particle types for visual FX (rendered as DOM children of the pet container)
const PARTICLES = {
    HEART: { glyph: '♥', color: '#FF4F8B', life: 1200 },
    SPARKLE: { glyph: '✨', color: '#FFD700', life: 1000 },
    ZZZ: { glyph: 'z', color: '#88AABB', life: 1500 },
    QUESTION: { glyph: '?', color: '#FFFFFF', life: 900 },
    EXCLAIM: { glyph: '!', color: '#FFEE44', life: 700 },
    FOOD: { glyph: '\u{1F36A}', color: '#D4A038', life: 1400 },
    NOTE: { glyph: '♪', color: '#88DDFF', life: 1100 }
};

class DesktopPet extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);

        this.canvas = null;
        this.ctx = null;
        this.container = null;

        // Pet type (neko, dog, sheep, fox, bunny)
        this.petType = 'neko';
        this.petConfig = PET_CONFIGS.neko;
        this.name = 'Buddy';

        // Stats (0-100 each); decay only while tab is open.
        this.stats = { happiness: 80, hunger: 50, energy: 80 };
        this.statsDecayTimer = null;
        this.lowStatNagAt = 0;

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

        // Interaction tracking (used for achievements + nagging)
        this.isDragging = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;
        this.interactionCount = 0;
        this.feedCount = 0;
        this.usedPetTypes = new Set();

        // Size — sprite is 32x32. Particles and speech bubble are sibling
        // elements appended to document.body and follow the pet via JS.
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

        // Overlay DOM (created in _buildDOM)
        this.particleLayer = null;
        this.nameTag = null;
        this.speechBubble = null;
        this.speechTimer = null;
        this.contextMenu = null;
        this._activeParticles = new Set();

        // Idle detection (reacts to user-idle to sleep)
        this._lastUserActivity = Date.now();
        this._wasAsleepFromIdle = false;
    }

    async initialize() {
        // Locate container — required. Bail if missing.
        this.container = document.getElementById('desktopPet');
        if (!this.container) {
            this.warn('Container element #desktopPet not found');
            return;
        }

        this.log('Initializing retro desktop pet...');

        // Load persisted pet state (name, stats, type, counters)
        this._loadPetState();

        // Set pet type from saved config (loadPetState may already have done this,
        // but config takes precedence on a fresh boot)
        const savedType = this.getConfig('petType', 'neko');
        this.setPetType(savedType, /*silent*/ true);

        // Build DOM structure (canvas + overlay layers)
        this._buildDOM();

        // Wire up DOM events
        this.setupEventListeners();

        // Wire up cross-feature reactions (achievements, app events, etc.)
        if (this.getConfig('enableReactions', true)) {
            this._setupReactions();
        }

        // Start stats decay loop
        if (this.getConfig('enableStats', true)) {
            this._startStatsDecay();
        }

        // The FeatureRegistry only calls initialize() when isEnabled() is true,
        // so we are good to show. (The earlier code overwrote this.enabled with
        // an unset StateManager value, which is why the pet never appeared.)
        this.show();

        // Listen for runtime toggles + type changes
        this.subscribe(Events.PET_TOGGLE, ({ enabled }) => {
            this.toggle(enabled);
        });
        this.subscribe(Events.PET_CHANGE, ({ type }) => {
            this.setPetType(type);
            this.spawnParticle('SPARKLE');
            this.say(`I'm a ${this.petConfig.name} now!`);
        });

        this.log(`Initialized: ${this.petConfig.name} named "${this.name}" :3`);
    }

    /**
     * Change pet type dynamically
     * @param {string} type
     * @param {boolean} silent - skip side effects (persist, achievement check, etc.)
     */
    setPetType(type, silent = false) {
        if (PET_CONFIGS[type]) {
            this.petType = type;
            this.petConfig = PET_CONFIGS[type];
        } else {
            // Default to neko if unknown type
            this.petType = 'neko';
            this.petConfig = PET_CONFIGS.neko;
        }
        if (!silent) {
            this.log(`Pet type changed to ${this.petConfig.name}`);
            this.usedPetTypes.add(this.petType);
            this.setConfig('petType', this.petType);
            this._savePetState();
            this._checkPetTypeAchievement();
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

        // Stop stats decay
        if (this.statsDecayTimer) {
            clearInterval(this.statsDecayTimer);
            this.statsDecayTimer = null;
        }

        // Clear pending speech
        if (this.speechTimer) {
            clearTimeout(this.speechTimer);
            this.speechTimer = null;
        }

        // Persist whatever progress we have
        this._savePetState();

        // Remove particles, speech bubble, name tag, context menu DOM
        this._activeParticles.forEach((p) => p.el && p.el.remove());
        this._activeParticles.clear();
        if (this.speechBubble) { this.speechBubble.remove(); this.speechBubble = null; }
        if (this.nameTag) { this.nameTag.remove(); this.nameTag = null; }
        if (this.particleLayer) { this.particleLayer.remove(); this.particleLayer = null; }
        this._hideContextMenu();

        // Hide the container
        if (this.container) {
            this.container.style.display = 'none';
        }

        // Call parent cleanup for event handlers / EventBus subs
        super.cleanup();
    }

    setupEventListeners() {
        // Mouse tracking for cursor following (use addHandler for auto-cleanup)
        this.addHandler(document, 'mousemove', (e) => {
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            this._lastUserActivity = Date.now();
            if (this.isDragging) {
                this.updateDrag(e);
            }
        });

        // Treat keystrokes as activity too (sleeping pet should wake)
        this.addHandler(document, 'keydown', () => {
            this._lastUserActivity = Date.now();
            if (this._wasAsleepFromIdle) this._wakeFromIdle();
        });

        // Left-click on pet — starts drag, but a quick click counts as "petting"
        this.addHandler(this.container, 'mousedown', (e) => {
            if (e.button !== 0) return; // left only — right click handled below
            e.preventDefault();
            this._clickStartedAt = Date.now();
            this._clickStartX = e.clientX;
            this._clickStartY = e.clientY;
            this.startDrag(e);
        });

        this.addHandler(document, 'mouseup', (e) => {
            if (this.isDragging) {
                const wasQuick = this._clickStartedAt
                    && (Date.now() - this._clickStartedAt) < 200
                    && Math.hypot(e.clientX - this._clickStartX, e.clientY - this._clickStartY) < 6;
                this.endDrag();
                if (wasQuick) this.pet();
            }
        });

        // Double-click for fortune
        this.addHandler(this.container, 'dblclick', () => {
            this.showFortune();
        });

        // Right-click for context menu
        this.addHandler(this.container, 'contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e.clientX, e.clientY);
        });

        // Hover shows name tag
        this.addHandler(this.container, 'mouseenter', () => {
            if (this.getConfig('showNameTag', true)) this._showNameTag();
        });
        this.addHandler(this.container, 'mouseleave', () => {
            this._hideNameTag();
        });

        // Close context menu on any outside click
        this.addHandler(document, 'click', () => this._hideContextMenu());

        // Keep within new bounds on resize
        this.addHandler(window, 'resize', () => {
            this.constrainToBounds && this.constrainToBounds();
        });
    }

    show() {
        if (!this.container) return;
        this.enabled = true;
        this.container.style.display = 'block';

        // Start at random position only if we don't already have one
        if (!this.x || !this.y || this.x < 0 || this.y < 0 ||
            this.x > window.innerWidth - this.width ||
            this.y > window.innerHeight - this.height - 100) {
            this.x = Math.random() * Math.max(0, window.innerWidth - this.width);
            this.y = Math.random() * Math.max(0, window.innerHeight - this.height - 100);
        }

        this.updatePosition();

        // Start animation loop
        if (!this.animationId) {
            this.animate();
        }
    }

    hide() {
        this.enabled = false;
        if (this.container) this.container.style.display = 'none';

        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this._hideContextMenu();
    }

    /**
     * Runtime toggle. Goes through FeatureRegistry so dependents/state stay
     * in sync. The handler that called us already updated user preference,
     * but we mirror it via the FeatureBase storage path too.
     */
    async toggle(enabled) {
        const reg = window.__RETROS_DEBUG && window.__RETROS_DEBUG.featureRegistry;
        try {
            if (reg && reg.features && reg.features.has(this.id)) {
                if (enabled) await reg.enable(this.id);
                else await reg.disable(this.id);
            } else if (enabled) {
                this.show();
            } else {
                this.hide();
            }
        } catch (err) {
            this.warn('toggle failed:', err && err.message);
            // Fallback to direct show/hide so user still gets a response
            enabled ? this.show() : this.hide();
        }
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
            // Still update bubble position
            this._updateOverlayPositions();
            return;
        }

        // Apply physics
        this.applyPhysics();

        // Update AI behavior
        this.updateBehavior();

        // Stat-driven mood overlays + idle detection
        this._tickStatBehavior();
        this._tickIdleDetection();

        // Keep in bounds
        this.constrainToBounds();

        // Update DOM position (incl. overlays)
        this.updatePosition();
        this._updateOverlayPositions();
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
            case 'fox':
                this.drawFox(ctx);
                break;
            case 'bunny':
                this.drawBunny(ctx);
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
            case STATES.CURIOUS:
            case STATES.CONFUSED:
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
            case STATES.EATING:
            case STATES.PETTED:
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
            case STATES.EXCITED:
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
            case STATES.CURIOUS:
            case STATES.CONFUSED:
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
            case STATES.EATING:
            case STATES.PETTED:
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
            case STATES.EXCITED:
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
            case STATES.CURIOUS:
            case STATES.CONFUSED:
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
            case STATES.EATING:
            case STATES.PETTED:
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
            case STATES.EXCITED:
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

    // ========================================
    // FOX (Vix) Sprites
    // ========================================
    drawFox(ctx) {
        switch (this.state) {
            case STATES.IDLE:
            case STATES.BORED:
                this.drawFoxIdle(ctx);
                break;
            case STATES.ALERT:
            case STATES.CURIOUS:
            case STATES.CONFUSED:
                this.drawFoxAlert(ctx);
                break;
            case STATES.WALKING:
                this.drawFoxWalk(ctx);
                break;
            case STATES.RUNNING:
            case STATES.CHASING:
                this.drawFoxRun(ctx);
                break;
            case STATES.SITTING:
            case STATES.EATING:
            case STATES.PETTED:
                this.drawFoxSit(ctx);
                break;
            case STATES.SLEEPING:
                this.drawFoxSleep(ctx);
                break;
            case STATES.JUMPING:
            case STATES.FALLING:
            case STATES.DRAGGING:
                this.drawFoxJump(ctx);
                break;
            case STATES.SCRATCHING:
            case STATES.GROOMING:
                this.drawFoxGroom(ctx);
                break;
            case STATES.YAWNING:
                this.drawFoxYawn(ctx);
                break;
            case STATES.PLAYING:
            case STATES.SURPRISED:
            case STATES.EXCITED:
                this.drawFoxPlay(ctx);
                break;
            default:
                this.drawFoxIdle(ctx);
        }
    }

    // Fox shares neko/dog body proportions but has pointier ears,
    // a fluffier tail, and white face/belly markings.
    _drawFoxBase(ctx, opts = {}) {
        const c = this.petConfig;
        const {
            bodyX = 8, bodyY = 17, bodyW = 16, bodyH = 9,
            headX = 17, headY = 10, headW = 11, headH = 9,
            tailY = 18, tailWag = 0
        } = opts;
        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
        // White belly
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(bodyX + 2, bodyY + bodyH - 3, bodyW - 4, 3);
        // Head
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(headX, headY, headW, headH);
        // White muzzle
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(headX + 4, headY + 5, headW - 4, headH - 4);
        // Pointed ears with dark tips
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(headX - 1, headY - 5, 4, 6);
        ctx.fillRect(headX + headW - 3, headY - 5, 4, 6);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(headX, headY - 5, 2, 3);
        ctx.fillRect(headX + headW - 2, headY - 5, 2, 3);
        // Fluffy tail with white tip
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(bodyX - 5, tailY - 1 + tailWag, 7, 5);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(bodyX - 5, tailY - 1 + tailWag, 2, 2);
    }

    drawFoxIdle(ctx) {
        const bob = Math.sin(this.stateTimer / 24) * 0.5;
        const c = this.petConfig;
        this._drawFoxBase(ctx, { bodyY: 18 + bob, headY: 10 + bob, tailWag: bob });
        // Legs
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(10, 26, 3, 6);
        ctx.fillRect(15, 26, 3, 6);
        ctx.fillRect(18, 26, 3, 6);
        ctx.fillRect(21, 26, 3, 6);
        // Eyes
        ctx.fillStyle = c.eyeColor;
        if (this.isBlinking) {
            ctx.fillRect(19, 13 + bob, 3, 1);
            ctx.fillRect(24, 13 + bob, 3, 1);
        } else {
            ctx.fillRect(19, 12 + bob, 3, 3);
            ctx.fillRect(24, 12 + bob, 3, 3);
            ctx.fillStyle = '#FFF';
            ctx.fillRect(20, 12 + bob, 1, 1);
            ctx.fillRect(25, 12 + bob, 1, 1);
        }
        // Nose
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(25, 16 + bob, 2, 2);
    }

    drawFoxAlert(ctx) {
        const c = this.petConfig;
        this._drawFoxBase(ctx, { bodyY: 16, headY: 7 });
        // Ears straight up — already in _drawFoxBase but tall
        // Legs ready
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(10, 24, 3, 8);
        ctx.fillRect(15, 24, 3, 8);
        ctx.fillRect(18, 24, 3, 8);
        ctx.fillRect(21, 24, 3, 8);
        // Wide alert eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(19, 10, 4, 4);
        ctx.fillRect(24, 10, 4, 4);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(20, 10, 2, 2);
        ctx.fillRect(25, 10, 2, 2);
        // Nose
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(25, 14, 2, 2);
    }

    drawFoxWalk(ctx) {
        const walkCycle = Math.floor(this.frame) % 4;
        const legOffset = [0, 2, 0, -2][walkCycle];
        const c = this.petConfig;
        this._drawFoxBase(ctx, { tailWag: Math.sin(this.stateTimer / 5) * 2 });
        // Animated legs
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(10, 24 + legOffset, 3, 8 - Math.abs(legOffset));
        ctx.fillRect(14, 24 - legOffset, 3, 8 - Math.abs(legOffset));
        ctx.fillRect(18, 24 - legOffset, 3, 8 - Math.abs(legOffset));
        ctx.fillRect(21, 24 + legOffset, 3, 8 - Math.abs(legOffset));
        // Eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(20, 13, 2, 2);
        ctx.fillRect(25, 13, 2, 2);
        // Nose
        ctx.fillRect(25, 16, 2, 2);
    }

    drawFoxRun(ctx) {
        const runCycle = Math.floor(this.frame) % 4;
        const stretch = [0, 2, 0, -2][runCycle];
        const c = this.petConfig;
        // Stretched body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6 - stretch, 16, 18 + stretch, 8);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(6 - stretch, 22, 18 + stretch, 2);
        // Head forward
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(20 + stretch / 2, 10, 10, 8);
        // Pointy ears back
        ctx.fillRect(19 + stretch / 2, 7, 4, 5);
        ctx.fillRect(26 + stretch / 2, 7, 4, 5);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(19 + stretch / 2, 7, 2, 3);
        ctx.fillRect(26 + stretch / 2, 7, 2, 3);
        // Running legs
        const frontLeg = runCycle < 2 ? 4 : -2;
        const backLeg = runCycle < 2 ? -2 : 4;
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(8, 22 + backLeg, 3, 8);
        ctx.fillRect(12, 22 - backLeg, 3, 8);
        ctx.fillRect(18 + stretch, 22 + frontLeg, 3, 8);
        ctx.fillRect(22 + stretch, 22 - frontLeg, 3, 8);
        // Fluffy tail streaming
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(2 - stretch, 14, 6, 4);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(2 - stretch, 14, 2, 2);
        // Eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(23 + stretch / 2, 13, 2, 2);
        ctx.fillRect(27 + stretch / 2, 13, 2, 2);
        // Nose
        ctx.fillRect(28 + stretch / 2, 15, 2, 2);
    }

    drawFoxSit(ctx) {
        const c = this.petConfig;
        // Body sitting
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 18, 14, 14);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(12, 26, 10, 6);
        // Head
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(14, 10, 12, 9);
        // Muzzle
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(17, 14, 8, 5);
        // Ears
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(13, 4, 4, 7);
        ctx.fillRect(22, 4, 4, 7);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(14, 4, 2, 4);
        ctx.fillRect(23, 4, 2, 4);
        // Front paws
        ctx.fillRect(12, 28, 4, 4);
        ctx.fillRect(18, 28, 4, 4);
        // Tail wrapped — fluffy around side
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(22, 22, 9, 5);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(29, 22, 2, 2);
        // Eyes
        ctx.fillStyle = c.eyeColor;
        if (this.state === STATES.PETTED || this.hasReachedCursor) {
            ctx.fillRect(16, 14, 3, 1);
            ctx.fillRect(21, 14, 3, 1);
        } else {
            ctx.fillRect(16, 13, 3, 3);
            ctx.fillRect(21, 13, 3, 3);
        }
        // Nose
        ctx.fillRect(20, 17, 2, 2);
    }

    drawFoxSleep(ctx) {
        const c = this.petConfig;
        const breathe = Math.sin(this.stateTimer / 28) * 0.5;
        // Curled body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, 22 + breathe, 20, 10);
        ctx.fillRect(8, 20 + breathe, 16, 4);
        // Head tucked
        ctx.fillRect(18, 18 + breathe, 10, 8);
        // Ears flat
        ctx.fillRect(18, 17 + breathe, 3, 3);
        ctx.fillRect(25, 17 + breathe, 3, 3);
        // Tail curled around (fluffy)
        ctx.fillRect(2, 22, 5, 5);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(2, 22, 2, 2);
        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(21, 21 + breathe, 3, 1);
        ctx.fillRect(25, 21 + breathe, 3, 1);
        // Z's
        const zOffset = (this.stateTimer % 60) / 15;
        ctx.fillStyle = '#666';
        ctx.font = '6px monospace';
        ctx.fillText('z', 26, 14 - zOffset);
        ctx.fillText('Z', 28, 8 - zOffset);
    }

    drawFoxJump(ctx) {
        const c = this.petConfig;
        this._drawFoxBase(ctx, { bodyY: 12, headY: 8 });
        // Legs tucked / extended
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(8, 20, 4, 6);
        ctx.fillRect(14, 22, 4, 6);
        ctx.fillRect(18, 22, 4, 6);
        ctx.fillRect(22, 20, 4, 6);
        // Wide eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(20, 10, 3, 3);
        ctx.fillRect(25, 10, 3, 3);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(20, 10, 1, 1);
        ctx.fillRect(25, 10, 1, 1);
        // Nose
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(25, 14, 2, 2);
    }

    drawFoxGroom(ctx) {
        const groomFrame = Math.floor(this.stateTimer / 6) % 2;
        const c = this.petConfig;
        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 16, 14, 12);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(12, 24, 10, 4);
        // Head bent
        const headY = groomFrame === 0 ? 14 : 16;
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(14, headY, 10, 8);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(15, headY + 3, 8, 4);
        // Ears
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(13, headY - 4, 4, 5);
        ctx.fillRect(20, headY - 4, 4, 5);
        // Paw to face
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(22, headY + 2, 4, 4);
        // Legs
        ctx.fillRect(12, 26, 4, 6);
        ctx.fillRect(18, 26, 4, 6);
        // Tail
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(4, 20, 7, 4);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(4, 20, 2, 2);
        // Eye closed
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(16, headY + 2, 2, 1);
    }

    drawFoxYawn(ctx) {
        const c = this.petConfig;
        this._drawFoxBase(ctx);
        // Legs
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(10, 26, 3, 6);
        ctx.fillRect(15, 26, 3, 6);
        ctx.fillRect(18, 26, 3, 6);
        ctx.fillRect(21, 26, 3, 6);
        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(19, 13, 3, 1);
        ctx.fillRect(24, 13, 3, 1);
        // Open mouth
        ctx.fillStyle = '#333';
        ctx.fillRect(22, 15, 4, 4);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(23, 16, 2, 2);
    }

    drawFoxPlay(ctx) {
        const playFrame = Math.floor(this.stateTimer / 5) % 3;
        const bounce = [0, -3, 0][playFrame];
        const c = this.petConfig;
        // Body bouncing
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 16 + bounce, 16, 10);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(8, 24 + bounce, 16, 2);
        // Head
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(16, 10 + bounce, 12, 8);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(19, 14 + bounce, 9, 4);
        // Ears
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(15, 4 + bounce, 4, 7);
        ctx.fillRect(24, 4 + bounce, 4, 7);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(16, 4 + bounce, 2, 4);
        ctx.fillRect(25, 4 + bounce, 2, 4);
        // Paws
        ctx.fillRect(10, 24 + bounce / 2, 3, 8);
        ctx.fillRect(15, 26 - bounce / 2, 3, 6);
        ctx.fillRect(18, 26 - bounce / 2, 3, 6);
        ctx.fillRect(21, 24 + bounce / 2, 3, 8);
        // Big eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(18, 12 + bounce, 3, 4);
        ctx.fillRect(23, 12 + bounce, 3, 4);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(19, 12 + bounce, 1, 2);
        ctx.fillRect(24, 12 + bounce, 1, 2);
        // Tail wagging
        const tailWag = Math.sin(this.stateTimer / 3) * 3;
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(2, 16 + tailWag + bounce, 7, 4);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(2, 16 + tailWag + bounce, 2, 2);
        // Happy nose
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(25, 16 + bounce, 2, 2);
    }

    // ========================================
    // BUNNY (Hoppy) Sprites
    // Distinctive: very long ears, hops instead of walks, round body
    // ========================================
    drawBunny(ctx) {
        switch (this.state) {
            case STATES.IDLE:
            case STATES.BORED:
                this.drawBunnyIdle(ctx);
                break;
            case STATES.ALERT:
            case STATES.CURIOUS:
            case STATES.CONFUSED:
                this.drawBunnyAlert(ctx);
                break;
            case STATES.WALKING:
            case STATES.RUNNING:
            case STATES.CHASING:
                this.drawBunnyHop(ctx);
                break;
            case STATES.SITTING:
            case STATES.EATING:
            case STATES.PETTED:
                this.drawBunnySit(ctx);
                break;
            case STATES.SLEEPING:
                this.drawBunnySleep(ctx);
                break;
            case STATES.JUMPING:
            case STATES.FALLING:
            case STATES.DRAGGING:
                this.drawBunnyJump(ctx);
                break;
            case STATES.SCRATCHING:
            case STATES.GROOMING:
                this.drawBunnyGroom(ctx);
                break;
            case STATES.YAWNING:
                this.drawBunnyYawn(ctx);
                break;
            case STATES.PLAYING:
            case STATES.SURPRISED:
            case STATES.EXCITED:
                this.drawBunnyPlay(ctx);
                break;
            default:
                this.drawBunnyIdle(ctx);
        }
    }

    drawBunnyIdle(ctx) {
        const bob = Math.sin(this.stateTimer / 28) * 0.4;
        const c = this.petConfig;
        // Round body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 18 + bob, 14, 12);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(12, 24 + bob, 10, 6);
        // Head (rounded)
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(13, 12 + bob, 12, 8);
        // Cheeks (white)
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(13, 16 + bob, 12, 4);
        // Long ears
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(14, 2 + bob, 3, 11);
        ctx.fillRect(21, 2 + bob, 3, 11);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(14, 4 + bob, 2, 7);
        ctx.fillRect(21, 4 + bob, 2, 7);
        // Small front paws
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(11, 28, 3, 4);
        ctx.fillRect(20, 28, 3, 4);
        // Eyes
        ctx.fillStyle = c.eyeColor;
        if (this.isBlinking) {
            ctx.fillRect(15, 15 + bob, 2, 1);
            ctx.fillRect(21, 15 + bob, 2, 1);
        } else {
            ctx.fillRect(15, 14 + bob, 2, 3);
            ctx.fillRect(21, 14 + bob, 2, 3);
            ctx.fillStyle = '#FFF';
            ctx.fillRect(15, 14 + bob, 1, 1);
            ctx.fillRect(21, 14 + bob, 1, 1);
        }
        // Pink nose (Y-shape simplified)
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 17 + bob, 2, 1);
        ctx.fillRect(19, 18 + bob, 1, 1);
        // Tiny round tail (puff)
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(8, 22 + bob, 3, 3);
    }

    drawBunnyAlert(ctx) {
        const c = this.petConfig;
        // Body upright
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 16, 14, 12);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(12, 22, 10, 6);
        // Head up
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(13, 10, 12, 8);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(13, 14, 12, 4);
        // Ears bolt upright
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(14, 0, 3, 12);
        ctx.fillRect(21, 0, 3, 12);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(14, 1, 2, 9);
        ctx.fillRect(21, 1, 2, 9);
        // Legs ready
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 26, 3, 6);
        ctx.fillRect(20, 26, 3, 6);
        // Wide eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(15, 12, 3, 4);
        ctx.fillRect(21, 12, 3, 4);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(15, 12, 1, 1);
        ctx.fillRect(21, 12, 1, 1);
        // Nose twitching (slight position)
        ctx.fillStyle = c.accentColor;
        const wiggle = this.stateTimer % 16 < 8 ? 0 : 1;
        ctx.fillRect(18 + wiggle, 15, 2, 1);
    }

    drawBunnyHop(ctx) {
        // Bunny "walks" by hopping in a 4-frame cycle
        const cycle = Math.floor(this.frame) % 4;
        const lift = [0, -4, -2, 0][cycle];
        const c = this.petConfig;
        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 18 + lift, 14, 12);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(12, 24 + lift, 10, 6);
        // Head
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(13, 12 + lift, 12, 8);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(13, 16 + lift, 12, 4);
        // Ears (slightly back when mid-hop)
        const earBack = cycle === 1 ? 1 : 0;
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(14 - earBack, 4 + lift, 3, 10);
        ctx.fillRect(21 + earBack, 4 + lift, 3, 10);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(14 - earBack, 6 + lift, 2, 6);
        ctx.fillRect(21 + earBack, 6 + lift, 2, 6);
        // Big back legs splay when mid-hop
        ctx.fillStyle = c.primaryColor;
        if (cycle === 1 || cycle === 2) {
            // mid-air, legs tucked
            ctx.fillRect(11, 28, 4, 3);
            ctx.fillRect(19, 28, 4, 3);
        } else {
            // grounded, legs extended
            ctx.fillRect(10, 28, 4, 4);
            ctx.fillRect(20, 28, 4, 4);
        }
        // Eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(15, 14 + lift, 2, 3);
        ctx.fillRect(21, 14 + lift, 2, 3);
        // Nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 17 + lift, 2, 1);
        // Tail puff
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(8, 22 + lift, 3, 3);
    }

    drawBunnySit(ctx) {
        const c = this.petConfig;
        // Body sitting on haunches
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 16, 14, 16);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(12, 24, 10, 8);
        // Head
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(13, 10, 12, 8);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(13, 14, 12, 4);
        // Ears upright (slight droop when content)
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(14, 2, 3, 10);
        ctx.fillRect(21, 2, 3, 10);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(14, 4, 2, 6);
        ctx.fillRect(21, 4, 2, 6);
        // Tucked paws
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(11, 28, 4, 4);
        ctx.fillRect(19, 28, 4, 4);
        // Eyes (closed = happy when petted)
        ctx.fillStyle = c.eyeColor;
        if (this.state === STATES.PETTED) {
            ctx.fillRect(15, 15, 2, 1);
            ctx.fillRect(21, 15, 2, 1);
        } else {
            ctx.fillRect(15, 14, 2, 3);
            ctx.fillRect(21, 14, 2, 3);
        }
        // Nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 17, 2, 1);
        // Tail
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(8, 22, 3, 3);
    }

    drawBunnySleep(ctx) {
        const c = this.petConfig;
        const breathe = Math.sin(this.stateTimer / 30) * 0.5;
        // Loaf shape (sleeping bunny)
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(6, 22 + breathe, 20, 10);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(8, 26 + breathe, 16, 6);
        // Head tucked
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 20 + breathe, 10, 6);
        // Ears flat against back
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 14 + breathe, 3, 8);
        ctx.fillRect(15, 14 + breathe, 3, 8);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(10, 16 + breathe, 2, 5);
        ctx.fillRect(15, 16 + breathe, 2, 5);
        // Closed eye
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(11, 22 + breathe, 2, 1);
        // Z's
        const zOffset = (this.stateTimer % 60) / 15;
        ctx.fillStyle = '#666';
        ctx.font = '6px monospace';
        ctx.fillText('z', 24, 16 - zOffset);
        ctx.fillText('Z', 27, 10 - zOffset);
    }

    drawBunnyJump(ctx) {
        const c = this.petConfig;
        // Stretched mid-air
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 12, 18, 10);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(10, 18, 14, 4);
        // Head
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(20, 8, 10, 8);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(20, 12, 10, 4);
        // Ears trailing
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(18, 4, 3, 8);
        ctx.fillRect(25, 4, 3, 8);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 6, 2, 5);
        ctx.fillRect(25, 6, 2, 5);
        // Legs back / tucked
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(8, 22, 4, 4);
        ctx.fillRect(22, 22, 4, 4);
        // Wide eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(22, 10, 3, 3);
        ctx.fillRect(27, 10, 3, 3);
        // Nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(28, 14, 2, 1);
        // Tail puff
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(5, 14, 3, 3);
    }

    drawBunnyGroom(ctx) {
        const groomFrame = Math.floor(this.stateTimer / 6) % 2;
        const c = this.petConfig;
        // Body
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 16, 14, 14);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(12, 22, 10, 8);
        // Head tilted
        const headY = groomFrame === 0 ? 12 : 13;
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(13, headY, 12, 8);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(13, headY + 4, 12, 4);
        // Ears
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(14, headY - 8, 3, 10);
        ctx.fillRect(21, headY - 8, 3, 10);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(14, headY - 6, 2, 6);
        ctx.fillRect(21, headY - 6, 2, 6);
        // Paws to face
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(17, headY + 5, 4, 4);
        // Closed eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(15, headY + 3, 2, 1);
        ctx.fillRect(21, headY + 3, 2, 1);
        // Tail
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(8, 20, 3, 3);
    }

    drawBunnyYawn(ctx) {
        const c = this.petConfig;
        this.drawBunnyIdle(ctx);
        // Overlay open mouth
        ctx.fillStyle = '#333';
        ctx.fillRect(17, 18, 4, 3);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 19, 2, 2);
    }

    drawBunnyPlay(ctx) {
        const playFrame = Math.floor(this.stateTimer / 5) % 3;
        const bounce = [0, -4, 0][playFrame];
        const c = this.petConfig;
        // Body bouncing
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(10, 18 + bounce, 14, 12);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(12, 24 + bounce, 10, 6);
        // Head
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(13, 12 + bounce, 12, 8);
        ctx.fillStyle = c.secondaryColor;
        ctx.fillRect(13, 16 + bounce, 12, 4);
        // Ears flopping with bounce
        const earTilt = bounce === -4 ? 2 : 0;
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(13 + earTilt, 2 + bounce, 3, 11);
        ctx.fillRect(22 - earTilt, 2 + bounce, 3, 11);
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(13 + earTilt, 4 + bounce, 2, 7);
        ctx.fillRect(22 - earTilt, 4 + bounce, 2, 7);
        // Paws up
        ctx.fillStyle = c.primaryColor;
        ctx.fillRect(11, 28 + bounce / 2, 3, 5);
        ctx.fillRect(20, 28 + bounce / 2, 3, 5);
        // Big eyes
        ctx.fillStyle = c.eyeColor;
        ctx.fillRect(15, 14 + bounce, 3, 4);
        ctx.fillRect(21, 14 + bounce, 3, 4);
        ctx.fillStyle = '#FFF';
        ctx.fillRect(15, 14 + bounce, 1, 2);
        ctx.fillRect(21, 14 + bounce, 1, 2);
        // Smiling nose
        ctx.fillStyle = c.accentColor;
        ctx.fillRect(18, 17 + bounce, 2, 1);
        ctx.fillRect(17, 18 + bounce, 4, 1);
    }

    showFortune() {
        if (!this.getConfig('enableFortunes', true)) {
            this.say(`I don't know any fortunes right now.`);
            return;
        }
        const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
        this.say(fortune, 6000);
        this.spawnParticle('SPARKLE');
        this.spawnParticle('SPARKLE');

        // Pet reacts happily
        this.state = STATES.PLAYING;
        this.stateTimer = 0;
        this.hasReachedCursor = false;
        this.playSound('chime');

        StateManager.unlockAchievement('fortune_teller');
    }

    getAvailablePets() {
        return Object.keys(PET_CONFIGS);
    }

    // ========================================================================
    // PET STATE PERSISTENCE
    // ========================================================================

    _loadPetState() {
        try {
            const saved = StorageManager.get(`feature_${this.id}_petstate`);
            if (saved && typeof saved === 'object') {
                this.name = typeof saved.name === 'string' && saved.name.trim() ? saved.name.slice(0, 32) : this._pickRandomName();
                this.stats = Object.assign({ happiness: 80, hunger: 50, energy: 80 }, saved.stats || {});
                this.interactionCount = Number(saved.interactionCount) || 0;
                this.feedCount = Number(saved.feedCount) || 0;
                this.usedPetTypes = new Set(Array.isArray(saved.usedPetTypes) ? saved.usedPetTypes : []);
            } else {
                this.name = this._pickRandomName();
            }
            // Allow explicit config override (admin Control Panel)
            const configuredName = (this.getConfig('petName', '') || '').trim();
            if (configuredName) this.name = configuredName.slice(0, 32);
        } catch (e) {
            this.warn('Could not load pet state:', e && e.message);
            this.name = this._pickRandomName();
        }
        // Clamp stats
        for (const k of Object.keys(this.stats)) {
            this.stats[k] = Math.max(0, Math.min(100, Number(this.stats[k]) || 0));
        }
    }

    _savePetState() {
        try {
            StorageManager.set(`feature_${this.id}_petstate`, {
                name: this.name,
                stats: this.stats,
                interactionCount: this.interactionCount,
                feedCount: this.feedCount,
                usedPetTypes: Array.from(this.usedPetTypes)
            });
        } catch (e) {
            // Storage might be full or corrupted — non-fatal
        }
    }

    _pickRandomName() {
        return PET_NAMES[Math.floor(Math.random() * PET_NAMES.length)];
    }

    // ========================================================================
    // DOM SETUP & OVERLAYS
    // ========================================================================

    _buildDOM() {
        // Create canvas for sprite rendering
        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.canvas.style.imageRendering = 'pixelated';
        this.canvas.style.imageRendering = '-moz-crisp-edges';
        this.canvas.style.imageRendering = 'crisp-edges';
        this.ctx = this.canvas.getContext('2d', { alpha: true });

        // Clear existing content (the 🐕 emoji placeholder) and add canvas
        this.container.innerHTML = '';
        this.container.appendChild(this.canvas);

        // Style container — sprite size, transparent
        this.container.style.position = 'fixed';
        this.container.style.cursor = 'pointer';
        this.container.style.zIndex = '8999';
        this.container.style.pointerEvents = 'auto';
        this.container.style.background = 'transparent';
        this.container.style.width = this.width + 'px';
        this.container.style.height = this.height + 'px';
        this.container.style.overflow = 'visible';
        this.container.removeAttribute('aria-hidden');
        this.container.setAttribute('role', 'img');
        this.container.setAttribute('aria-label', `Desktop pet: ${this.name}`);

        // Name tag — child of container so it moves with the pet
        this.nameTag = document.createElement('div');
        this.nameTag.className = 'pet-name-tag';
        this.nameTag.textContent = this.name;
        this.nameTag.style.display = 'none';
        this.container.appendChild(this.nameTag);

        // Speech bubble lives in document.body and is positioned each frame.
        this.speechBubble = document.createElement('div');
        this.speechBubble.className = 'pet-speech-bubble';
        this.speechBubble.style.display = 'none';
        document.body.appendChild(this.speechBubble);
    }

    _updateOverlayPositions() {
        // Keep speech bubble anchored above the pet
        if (this.speechBubble && this.speechBubble.style.display !== 'none') {
            const bubbleWidth = this.speechBubble.offsetWidth || 120;
            let left = this.x + this.width / 2 - bubbleWidth / 2;
            left = Math.max(4, Math.min(window.innerWidth - bubbleWidth - 4, left));
            const top = Math.max(4, this.y - this.speechBubble.offsetHeight - 8);
            this.speechBubble.style.left = left + 'px';
            this.speechBubble.style.top = top + 'px';
        }
    }

    _showNameTag() {
        if (!this.nameTag) return;
        this.nameTag.textContent = this.name;
        this.nameTag.style.display = 'block';
    }

    _hideNameTag() {
        if (this.nameTag) this.nameTag.style.display = 'none';
    }

    // ========================================================================
    // SPEECH BUBBLE
    // ========================================================================

    say(text, durationMs = 3000) {
        if (!this.speechBubble || !text) return;
        this.speechBubble.textContent = String(text).slice(0, 120);
        this.speechBubble.style.display = 'block';
        this._updateOverlayPositions();
        if (this.speechTimer) clearTimeout(this.speechTimer);
        this.speechTimer = setTimeout(() => {
            if (this.speechBubble) this.speechBubble.style.display = 'none';
        }, durationMs);
    }

    _randomFrom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    // ========================================================================
    // PARTICLE FX
    // ========================================================================

    spawnParticle(kind = 'HEART', overrides = {}) {
        if (!this.getConfig('enableParticles', true)) return;
        const def = PARTICLES[kind] || PARTICLES.HEART;
        const el = document.createElement('div');
        el.className = 'pet-particle pet-particle-' + kind.toLowerCase();
        el.textContent = overrides.glyph || def.glyph;
        el.style.color = overrides.color || def.color;
        // Spawn from the top-center of the pet
        const startX = this.x + this.width / 2 + (Math.random() * 14 - 7);
        const startY = this.y + this.height / 3;
        el.style.left = startX + 'px';
        el.style.top = startY + 'px';
        document.body.appendChild(el);
        const life = overrides.life || def.life;
        const entry = { el, born: Date.now(), life };
        this._activeParticles.add(entry);
        // CSS handles the animation; we just remove on completion.
        setTimeout(() => {
            if (entry.el) entry.el.remove();
            this._activeParticles.delete(entry);
        }, life + 50);
    }

    // ========================================================================
    // STATS SYSTEM (decay only while tab is open)
    // ========================================================================

    _startStatsDecay() {
        if (this.statsDecayTimer) clearInterval(this.statsDecayTimer);
        // Roughly: a full session of ~20 minutes brings stats from 80 → 0.
        // Tick every 15s; small decrements feel gentle.
        this.statsDecayTimer = setInterval(() => {
            if (!this.enabled) return;
            this.stats.hunger = Math.max(0, this.stats.hunger - 1.2);
            this.stats.energy = Math.max(0, this.stats.energy - 0.6);
            this.stats.happiness = Math.max(0, this.stats.happiness - 0.4);
            this._savePetState();
        }, 15000);
    }

    _tickStatBehavior() {
        if (!this.getConfig('enableStats', true)) return;
        // Nag at most once every 30s with a sad bubble if a stat is low
        const now = Date.now();
        if (now - this.lowStatNagAt < 30000) return;

        if (this.stats.hunger < 15 && this.state === STATES.IDLE) {
            this.say(this._randomFrom(REACTIONS.sad), 2500);
            this.spawnParticle('QUESTION');
            this.lowStatNagAt = now;
        } else if (this.stats.energy < 10 && this.state === STATES.IDLE) {
            this.say('*so tired*', 2500);
            this.state = STATES.SLEEPING;
            this.stateTimer = 0;
            this.spawnParticle('ZZZ');
            this.lowStatNagAt = now;
        } else if (this.stats.happiness < 20 && this.state === STATES.IDLE) {
            this.say('*pet me?*', 2500);
            this.lowStatNagAt = now;
        }
    }

    // ========================================================================
    // IDLE DETECTION — pet sleeps after global user inactivity
    // ========================================================================

    _tickIdleDetection() {
        const idleMs = Date.now() - this._lastUserActivity;
        const IDLE_THRESHOLD = 60_000; // 1 minute
        if (idleMs > IDLE_THRESHOLD && !this._wasAsleepFromIdle && this.state !== STATES.DRAGGING) {
            this._wasAsleepFromIdle = true;
            this.state = STATES.SLEEPING;
            this.stateTimer = 0;
            this.spawnParticle('ZZZ');
            this.say(this._randomFrom(REACTIONS.idle), 2000);
        }
    }

    _wakeFromIdle() {
        this._wasAsleepFromIdle = false;
        if (this.state === STATES.SLEEPING) {
            this.state = STATES.SURPRISED;
            this.stateTimer = 0;
            this.spawnParticle('EXCLAIM');
        }
    }

    // ========================================================================
    // ACTIONS — feed/pet/play/rename
    // ========================================================================

    pet() {
        if (this.state === STATES.DRAGGING) return;
        this.interactionCount++;
        this.stats.happiness = Math.min(100, this.stats.happiness + 8);
        this.stats.energy = Math.max(0, this.stats.energy - 1);
        this.state = STATES.PETTED;
        this.stateTimer = 0;
        this.say(this._randomFrom(REACTIONS.petted), 1500);
        this.spawnParticle('HEART');
        if (Math.random() < 0.4) this.spawnParticle('HEART');
        this.playSound('click');
        this._savePetState();
        this._checkInteractionAchievements();
    }

    feed() {
        this.stats.hunger = Math.min(100, this.stats.hunger + 35);
        this.stats.happiness = Math.min(100, this.stats.happiness + 6);
        this.feedCount++;
        this.state = STATES.EATING;
        this.stateTimer = 0;
        this.say(this._randomFrom(REACTIONS.fed), 2000);
        this.spawnParticle('FOOD');
        this.playSound('beep');
        this._savePetState();
        if (this.feedCount === 1) StateManager.unlockAchievement && StateManager.unlockAchievement('pet_first_meal');
        if (this.feedCount >= 10) StateManager.unlockAchievement && StateManager.unlockAchievement('pet_foodie');
    }

    playWith() {
        this.stats.happiness = Math.min(100, this.stats.happiness + 12);
        this.stats.energy = Math.max(0, this.stats.energy - 8);
        this.state = STATES.PLAYING;
        this.stateTimer = 0;
        this.say('*excited*', 1800);
        this.spawnParticle('SPARKLE');
        this.spawnParticle('NOTE');
        this.playSound('chime');
        this._savePetState();
    }

    putToSleep() {
        this.state = STATES.YAWNING;
        this.stateTimer = 0;
        this.say(this._randomFrom(REACTIONS.sleep), 2000);
        this.spawnParticle('ZZZ');
        setTimeout(() => {
            if (this.state === STATES.YAWNING) {
                this.state = STATES.SLEEPING;
                this.stateTimer = 0;
            }
        }, 1200);
    }

    rename(newName) {
        const trimmed = (newName || '').trim();
        if (!trimmed) return;
        this.name = trimmed.slice(0, 32);
        if (this.nameTag) this.nameTag.textContent = this.name;
        if (this.container) this.container.setAttribute('aria-label', `Desktop pet: ${this.name}`);
        this.setConfig('petName', this.name);
        this._savePetState();
        this.say(`Hi! I'm ${this.name}!`, 3000);
        this.spawnParticle('HEART');
    }

    // ========================================================================
    // RIGHT-CLICK CONTEXT MENU
    // ========================================================================

    showContextMenu(x, y) {
        this._hideContextMenu();
        const menu = document.createElement('div');
        menu.className = 'pet-context-menu';
        const items = [
            { label: `Pet ${escapeHtml(this.name)}`, action: () => this.pet() },
            { label: 'Feed', action: () => this.feed() },
            { label: 'Play', action: () => this.playWith() },
            { label: 'Tell a Fortune', action: () => this.showFortune() },
            { label: 'Take a Nap', action: () => this.putToSleep() },
            { sep: true },
            { label: 'Rename...', action: () => this._promptRename() },
            { label: `Status: ${this._statusEmoji()}`, action: () => this._showStatusBubble() },
            { sep: true },
            { label: `Switch pet type ▸`, submenu: this._buildTypeSubmenu() },
            { sep: true },
            { label: 'Hide pet', action: () => this.toggle(false) }
        ];
        items.forEach((item) => {
            if (item.sep) {
                const sep = document.createElement('div');
                sep.className = 'pet-context-menu-sep';
                menu.appendChild(sep);
                return;
            }
            const el = document.createElement('div');
            el.className = 'pet-context-menu-item';
            el.textContent = item.label;
            if (item.submenu) {
                el.appendChild(item.submenu);
                el.classList.add('has-submenu');
            } else if (typeof item.action === 'function') {
                el.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    this._hideContextMenu();
                    try { item.action(); } catch (e) { this.warn('menu action failed:', e); }
                });
            }
            menu.appendChild(el);
        });
        document.body.appendChild(menu);
        // Clamp to viewport
        const rect = menu.getBoundingClientRect();
        const left = Math.min(x, window.innerWidth - rect.width - 4);
        const top = Math.min(y, window.innerHeight - rect.height - 4);
        menu.style.left = Math.max(4, left) + 'px';
        menu.style.top = Math.max(4, top) + 'px';
        this.contextMenu = menu;
    }

    _hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }

    _buildTypeSubmenu() {
        const sub = document.createElement('div');
        sub.className = 'pet-context-submenu';
        Object.keys(PET_CONFIGS).forEach((type) => {
            const item = document.createElement('div');
            item.className = 'pet-context-menu-item';
            const cfg = PET_CONFIGS[type];
            const marker = type === this.petType ? '✓ ' : '   ';
            item.textContent = marker + cfg.name + ' (' + type + ')';
            item.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this._hideContextMenu();
                this.setPetType(type);
                EventBus.emit(Events.PET_CHANGE, { type });
            });
            sub.appendChild(item);
        });
        return sub;
    }

    _promptRename() {
        const current = this.name;
        // Use a small inline prompt so the input feels in-system.
        const overlay = document.createElement('div');
        overlay.className = 'dialog-overlay active';
        const box = document.createElement('div');
        box.className = 'dialog-box';
        box.innerHTML = `
            <div class="dialog-icon" style="font-family: monospace; font-size: 28px;">:3</div>
            <div class="dialog-text">
                <strong>What's your pet's name?</strong>
                <div style="margin-top:8px;">
                    <input type="text" class="pet-rename-input" maxlength="32" value="${escapeHtml(current)}" style="width:100%; padding:4px; box-sizing:border-box;">
                </div>
            </div>
            <div class="dialog-buttons" style="display:flex; gap:6px; justify-content:flex-end;">
                <button class="btn pet-rename-cancel">Cancel</button>
                <button class="btn btn-primary pet-rename-ok">OK</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        const input = box.querySelector('.pet-rename-input');
        const ok = box.querySelector('.pet-rename-ok');
        const cancel = box.querySelector('.pet-rename-cancel');
        const finish = (apply) => {
            if (apply) this.rename(input.value);
            overlay.remove();
        };
        ok.addEventListener('click', () => finish(true));
        cancel.addEventListener('click', () => finish(false));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finish(true);
            else if (e.key === 'Escape') finish(false);
        });
        setTimeout(() => input.focus(), 0);
        setTimeout(() => input.select(), 0);
    }

    _statusEmoji() {
        const h = this.stats.happiness, hu = this.stats.hunger, e = this.stats.energy;
        if (hu < 20) return 'hungry';
        if (e < 20) return 'sleepy';
        if (h > 80) return 'happy';
        if (h < 25) return 'sad';
        return 'content';
    }

    _showStatusBubble() {
        const s = this.stats;
        const fmt = (v) => Math.round(v) + '%';
        this.say(`H:${fmt(s.happiness)} F:${fmt(s.hunger)} E:${fmt(s.energy)}`, 3500);
    }

    // ========================================================================
    // CROSS-FEATURE REACTIONS
    // ========================================================================

    _setupReactions() {
        // Achievement unlocks → excited celebration
        this.subscribe(Events.ACHIEVEMENT_UNLOCK, () => {
            if (this.state === STATES.DRAGGING) return;
            this.state = STATES.EXCITED;
            this.stateTimer = 0;
            this.say(this._randomFrom(REACTIONS.achievement), 2400);
            this.spawnParticle('SPARKLE');
            this.spawnParticle('SPARKLE');
            setTimeout(() => this.spawnParticle('SPARKLE'), 200);
        });

        // App or window opens → curious head turn
        const onCurious = () => {
            if (Math.random() > 0.6) return; // not every time, to avoid spam
            if (this.state === STATES.DRAGGING || this.state === STATES.SLEEPING) return;
            this.state = STATES.CURIOUS;
            this.stateTimer = 0;
            this.say(this._randomFrom(REACTIONS.appOpen), 1800);
            this.spawnParticle('QUESTION');
        };
        this.subscribe(Events.WINDOW_OPEN, onCurious);
        this.subscribe(Events.APP_OPEN, onCurious);

        // Error sounds → worried bubble
        this.subscribe(Events.SOUND_PLAY, ({ type } = {}) => {
            if (type === 'error' || type === 'bsod') {
                this.say(this._randomFrom(REACTIONS.error), 1800);
                this.spawnParticle('EXCLAIM');
            }
        });

        // System idle → sleep
        this.subscribe(Events.SYSTEM_IDLE, () => {
            if (this.state !== STATES.DRAGGING) {
                this.state = STATES.SLEEPING;
                this.stateTimer = 0;
                this.spawnParticle('ZZZ');
            }
        });

        // Konami / cheat triggers — listen for the generic easter-egg event
        // EasterEggs.js fires a custom event when something fun happens.
        this.subscribe('easteregg:triggered', ({ code } = {}) => {
            this.state = STATES.EXCITED;
            this.stateTimer = 0;
            this.vy = -10;
            this.say(this._randomFrom(REACTIONS.konami), 2200);
            this.spawnParticle('SPARKLE');
            this.spawnParticle('SPARKLE');
            this.spawnParticle('SPARKLE');
            if (code === 'konami') StateManager.unlockAchievement && StateManager.unlockAchievement('pet_codemate');
        });
    }

    // ========================================================================
    // ACHIEVEMENT HELPERS
    // ========================================================================

    _checkInteractionAchievements() {
        const unlock = (id) => {
            try { StateManager.unlockAchievement && StateManager.unlockAchievement(id); } catch (e) { /* ignore */ }
        };
        if (this.interactionCount === 1) unlock('pet_first_friend');
        if (this.interactionCount === 10) unlock('pet_lover');
        if (this.interactionCount === 50) unlock('pet_best_friend');
    }

    _checkPetTypeAchievement() {
        if (this.usedPetTypes.size >= Object.keys(PET_CONFIGS).length) {
            try { StateManager.unlockAchievement && StateManager.unlockAchievement('pet_whisperer'); } catch (e) { /* ignore */ }
        }
    }

    // ========================================================================
    // SOUND
    // ========================================================================

    playSound(soundId) {
        if (!this.getConfig('enableSounds', true)) return;
        try { EventBus.emit(Events.SOUND_PLAY, { type: soundId }); } catch (e) { /* ignore */ }
    }
}

// Create and export singleton instance
const DesktopPetInstance = new DesktopPet();
export default DesktopPetInstance;
