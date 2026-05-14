/**
 * SkiFree - Classic Windows skiing game
 * Polished version with improved graphics, controls, and game feel
 */

import AppBase from './AppBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StorageManager from '../core/StorageManager.js';

class SkiFree extends AppBase {
    constructor() {
        super({
            id: 'skifree',
            name: 'SkiFree',
            icon: '⛷️',
            width: 640,
            height: 540,
            minWidth: 480,
            minHeight: 420,
            resizable: true,
            singleton: true,
            category: 'games'
        });

        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        this.lastTime = 0;
        this.deltaTime = 0;

        // Game states
        this.STATE = {
            MENU: 'menu',
            PLAYING: 'playing',
            PAUSED: 'paused',
            CRASHED: 'crashed',
            EATEN: 'eaten',
            GAMEOVER: 'gameover'
        };
        this.state = this.STATE.MENU;

        // Input state
        this.keys = {
            left: false,
            right: false,
            down: false,
            up: false
        };

        this.session = null;

        this.initGameState();

        // Register semantic event commands for scriptability
        this.registerCommands();
        this.registerQueries();
    }

    registerCommands() {
        this.registerCommand('start', () => {
            this.startGame();
            return { success: true };
        });

        this.registerCommand('pause', () => {
            if (this.state === this.STATE.PLAYING) {
                this.togglePause();
            }
            return { success: true, state: this.state };
        });

        this.registerCommand('resume', () => {
            if (this.state === this.STATE.PAUSED) {
                this.togglePause();
            }
            return { success: true, state: this.state };
        });

        this.registerCommand('reset', () => {
            this.initGameState();
            this.state = this.STATE.MENU;
            return { success: true };
        });

        this.registerCommand('triggerYeti', () => {
            if (this.state !== this.STATE.PLAYING) return { success: false, error: 'Game not active' };
            if (this.yeti) {
                this.yeti.active = true;
                this.yeti.x = this.player.x + 50;
                this.yeti.y = this.player.y - 200;
                this.emitAppEvent('yeti:triggered', { distance: Math.floor(this.distance) });
            }
            return { success: true };
        });

        this.registerCommand('setSpeed', (payload) => {
            if (!payload || payload.speed === undefined) return { success: false, error: 'Provide speed value' };
            if (this.player) {
                this.player.speed = Math.max(0, Math.min(this.player.maxSpeed, payload.speed));
            }
            return { success: true, speed: this.player?.speed };
        });
    }

    registerQueries() {
        this.registerQuery('getState', () => {
            return {
                score: this.score,
                highScore: this.highScore,
                distance: Math.floor(this.distance),
                lives: this.lives,
                state: this.state,
                speed: Math.floor(this.player.speed * 10),
                yetiActive: this.yeti.active
            };
        });
    }

    initGameState() {
        // Player
        this.player = {
            x: 320,
            y: 120,
            direction: 0, // -3 to 3 (skiing angles)
            speed: 0,
            baseSpeed: 4,
            maxSpeed: 12,
            jumping: false,
            jumpHeight: 0,
            jumpVelocity: 0,
            invincible: false,
            invincibleTimer: 0
        };

        // World
        this.worldOffset = 0;
        this.distance = 0;
        this.score = 0;
        this.highScore = StorageManager.get('skifree_highscore') || 0;
        this.lives = 3;

        // Obstacles
        this.obstacles = [];
        this.skiTrails = [];
        this.particles = [];

        // Yeti
        this.yeti = {
            x: 0,
            y: 0,
            active: false,
            speed: 5,
            frame: 0,
            targetX: 0,
            eating: false,
            eatTimer: 0
        };
        this.yetiTriggerDistance = 2000;

        // Effects
        this.screenShake = 0;
        this.flashTimer = 0;
        this.crashTimer = 0;
    }

    onOpen() {
        return `
            <style>
                .skifree-container {
                    background: #c0c0c0;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                }
                .skifree-menubar {
                    display: flex;
                    background: #c0c0c0;
                    border-bottom: 1px solid #808080;
                    padding: 2px 0;
                }
                .skifree-menu-item {
                    padding: 2px 10px;
                    font-size: 12px;
                    cursor: pointer;
                }
                .skifree-menu-item:hover {
                    background: #000080;
                    color: white;
                }
                .skifree-header {
                    display: flex;
                    justify-content: space-between;
                    padding: 4px 10px;
                    background: linear-gradient(180deg, #000080 0%, #0000a0 100%);
                    color: white;
                    font-size: 12px;
                    font-family: 'MS Sans Serif', 'Segoe UI', sans-serif;
                    border-bottom: 2px groove #c0c0c0;
                }
                .skifree-stat {
                    background: #000;
                    color: #0f0;
                    padding: 2px 8px;
                    font-family: 'Courier New', monospace;
                    border: 1px inset #808080;
                    min-width: 60px;
                    text-align: right;
                }
                .skifree-canvas-wrapper {
                    flex: 1;
                    position: relative;
                    overflow: hidden;
                    background: #fff;
                }
                .skifree-canvas {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    image-rendering: pixelated;
                    image-rendering: crisp-edges;
                }
                .skifree-footer {
                    padding: 3px 8px;
                    background: #c0c0c0;
                    border-top: 2px groove #c0c0c0;
                    font-size: 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .skifree-controls-hint {
                    color: #444;
                }
            </style>
            <div class="skifree-container">
                <div class="skifree-menubar">
                    <span class="skifree-menu-item" id="menuGame">Game</span>
                    <span class="skifree-menu-item" id="menuHelp">Help</span>
                </div>
                <div class="skifree-header">
                    <span>Lives: <span class="skifree-stat" id="lives" style="color: #f66;">❤❤❤</span></span>
                    <span>Distance: <span class="skifree-stat" id="distance">0</span>m</span>
                    <span>Score: <span class="skifree-stat" id="score">0</span></span>
                    <span>Best: <span class="skifree-stat" id="highscore">${this.highScore}</span></span>
                    <span>Speed: <span class="skifree-stat" id="speed">0</span></span>
                </div>
                <div class="skifree-canvas-wrapper">
                    <canvas class="skifree-canvas" id="gameCanvas"></canvas>
                </div>
                <div class="skifree-footer">
                    <span class="skifree-controls-hint">← → Steer | ↓ Speed up | ↑ Slow down | F Fast | Space Start | P Pause</span>
                    <span id="stateText">Press SPACE to start</span>
                </div>
            </div>
        `;
    }

    onMount() {
        this.canvas = this.getElement('#gameCanvas');
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this.resizeCanvas();

        // Event handlers
        this.addHandler(window, 'resize', () => this.resizeCanvas());
        this.addHandler(document, 'keydown', (e) => {
            if (!this.isFocused()) return;
            this.handleKeyDown(e);
        });
        this.addHandler(document, 'keyup', (e) => {
            if (!this.isFocused()) return;
            this.handleKeyUp(e);
        });
        this.addHandler(this.getElement('#menuGame'), 'click', () => this.showGameMenu());
        this.addHandler(this.getElement('#menuHelp'), 'click', () => this.showHelp());

        // Draw initial screen
        this.drawMenuScreen();
    }

    onClose() {
        if (this.gameLoop) {
            cancelAnimationFrame(this.gameLoop);
            this.gameLoop = null;
        }
    }

    resizeCanvas() {
        if (!this.canvas) return;
        const wrapper = this.canvas.parentElement;
        this.canvas.width = wrapper.offsetWidth;
        this.canvas.height = wrapper.offsetHeight;

        // Re-draw current state
        if (this.state === this.STATE.MENU) {
            this.drawMenuScreen();
        }
    }

    handleKeyDown(e) {
        if (!this.isFocused()) return;

        switch (e.key) {
            case 'ArrowLeft':
                e.preventDefault();
                this.keys.left = true;
                break;
            case 'ArrowRight':
                e.preventDefault();
                this.keys.right = true;
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.keys.down = true;
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.keys.up = true;
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                if (this.state === this.STATE.PLAYING) {
                    this.player.speed = this.player.maxSpeed;
                }
                break;
            case ' ':
                e.preventDefault();
                if (this.state === this.STATE.MENU ||
                    this.state === this.STATE.GAMEOVER ||
                    this.state === this.STATE.EATEN) {
                    this.startGame();
                }
                break;
            case 'p':
            case 'P':
                e.preventDefault();
                this.togglePause();
                break;
            case 'Escape':
                e.preventDefault();
                if (this.state === this.STATE.PLAYING) {
                    this.togglePause();
                }
                break;
        }
    }

    handleKeyUp(e) {
        switch (e.key) {
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'ArrowDown':
                this.keys.down = false;
                break;
            case 'ArrowUp':
                this.keys.up = false;
                break;
        }
    }

    async showGameMenu() {
        const choice = await this.confirm('Start a new game?', 'New Game');
        if (choice) {
            this.startGame();
        }
    }

    showHelp() {
        this.alert(
            '⛷️ SkiFree Help\n\n' +
            'Controls:\n' +
            '← → : Steer left/right\n' +
            '↓ : Speed up\n' +
            '↑ : Slow down\n' +
            'F : Maximum speed\n' +
            'Space : Start/Restart\n' +
            'P : Pause\n\n' +
            'Tips:\n' +
            '• You have 3 lives - crashes cost 1 life!\n' +
            '• Hit jumps for bonus points!\n' +
            '• Ski through flags for points\n' +
            '• Avoid trees and rocks\n' +
            '• Watch out for the Yeti at 2000m!\n' +
            '• You CAN outrun the Yeti with F key!'
        );
    }

    startGame() {
        this.initGameState();
        this.player.x = this.canvas.width / 2;
        this.player.speed = this.player.baseSpeed;
        this.state = this.STATE.PLAYING;

        // Generate initial obstacles
        this.generateObstacles(25, this.canvas.height, this.canvas.height + 800);

        // Start game loop
        this.lastTime = performance.now();
        this.gameLoop = requestAnimationFrame((t) => this.update(t));
        this.playSound('start');
        this.updateStateText('Skiing!');

        this.emitAppEvent('game:start', { lives: this.lives });

        // Emit game started event
        EventBus.emit('game:start', {
            appId: 'skifree',
            settings: { lives: this.lives }
        });
    }

    togglePause() {
        if (this.state === this.STATE.PLAYING) {
            this.state = this.STATE.PAUSED;
            this.updateStateText('PAUSED - Press P to resume');
            this.drawPauseOverlay();

            // Emit pause event
            EventBus.emit('game:pause', {
                appId: 'skifree',
                score: this.score
            });
        } else if (this.state === this.STATE.PAUSED) {
            this.state = this.STATE.PLAYING;
            this.updateStateText('Skiing!');
            this.lastTime = performance.now();
            this.gameLoop = requestAnimationFrame((t) => this.update(t));

            // Emit resume event
            EventBus.emit('game:resume', { appId: 'skifree' });
        }
    }

    generateObstacles(count, minY, maxY) {
        const types = [
            { type: 'tree', weight: 40 },
            { type: 'smallTree', weight: 25 },
            { type: 'rock', weight: 15 },
            { type: 'jump', weight: 10 },
            { type: 'flag', weight: 8 },
            { type: 'snowman', weight: 2 }
        ];

        const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);

        for (let i = 0; i < count; i++) {
            // Weighted random type selection
            let rand = Math.random() * totalWeight;
            let selectedType = 'tree';
            for (const t of types) {
                rand -= t.weight;
                if (rand <= 0) {
                    selectedType = t.type;
                    break;
                }
            }

            const obs = {
                type: selectedType,
                x: Math.random() * (this.canvas.width - 40) + 20,
                y: minY + Math.random() * (maxY - minY),
                hit: false
            };

            // Set hitbox based on type
            switch (selectedType) {
                case 'tree':
                    obs.width = 20;
                    obs.height = 35;
                    break;
                case 'smallTree':
                    obs.width = 14;
                    obs.height = 24;
                    break;
                case 'rock':
                    obs.width = 18;
                    obs.height = 12;
                    break;
                case 'jump':
                    obs.width = 30;
                    obs.height = 10;
                    break;
                case 'flag':
                    obs.width = 8;
                    obs.height = 30;
                    break;
                case 'snowman':
                    obs.width = 16;
                    obs.height = 28;
                    break;
            }

            this.obstacles.push(obs);
        }
    }

    update(timestamp) {
        // Allow update loop to run during CRASHED state for recovery
        if (this.state !== this.STATE.PLAYING && this.state !== this.STATE.CRASHED) return;

        this.deltaTime = Math.min((timestamp - this.lastTime) / 16.67, 3); // Cap delta
        this.lastTime = timestamp;

        this.updatePlayer();
        this.updateWorld();
        this.updateObstacles();
        this.updateYeti();
        this.updateParticles();
        this.updateEffects();
        this.updateUI();

        this.draw();

        // Continue game loop during PLAYING or CRASHED states
        if (this.state === this.STATE.PLAYING || this.state === this.STATE.CRASHED) {
            this.gameLoop = requestAnimationFrame((t) => this.update(t));
        }
    }

    updatePlayer() {
        const p = this.player;

        // Handle crashed state - use a timer for recovery
        if (this.state === this.STATE.CRASHED) {
            this.crashTimer -= this.deltaTime;
            if (this.crashTimer <= 0) {
                this.state = this.STATE.PLAYING;
                p.speed = p.baseSpeed;
                p.invincible = true;
                p.invincibleTimer = 90;
                this.updateStateText('Skiing!');
            }
            return;
        }

        // Handle invincibility
        if (p.invincible) {
            p.invincibleTimer -= this.deltaTime;
            if (p.invincibleTimer <= 0) {
                p.invincible = false;
            }
        }

        // Handle jumping
        if (p.jumping) {
            p.jumpHeight += p.jumpVelocity * this.deltaTime;
            p.jumpVelocity -= 0.5 * this.deltaTime;
            if (p.jumpHeight <= 0) {
                p.jumping = false;
                p.jumpHeight = 0;
                p.jumpVelocity = 0;
            }
        }

        // Steering
        const steerSpeed = 0.15 * this.deltaTime;
        if (this.keys.left && !p.jumping) {
            p.direction = Math.max(-3, p.direction - steerSpeed);
        } else if (this.keys.right && !p.jumping) {
            p.direction = Math.min(3, p.direction + steerSpeed);
        } else {
            // Return to center gradually
            if (p.direction > 0.1) p.direction -= 0.05 * this.deltaTime;
            else if (p.direction < -0.1) p.direction += 0.05 * this.deltaTime;
            else p.direction = 0;
        }

        // Speed control
        if (this.keys.down) {
            p.speed = Math.min(p.maxSpeed, p.speed + 0.15 * this.deltaTime);
        } else if (this.keys.up) {
            p.speed = Math.max(2, p.speed - 0.2 * this.deltaTime);
        } else {
            // Natural speed based on direction - more sideways = slower
            const targetSpeed = p.baseSpeed + (1 - Math.abs(p.direction) / 3) * 2;
            if (p.speed > targetSpeed) {
                p.speed -= 0.05 * this.deltaTime;
            }
        }

        // Horizontal movement
        p.x += p.direction * p.speed * 0.6 * this.deltaTime;

        // Boundary check with bounce
        const margin = 30;
        if (p.x < margin) {
            p.x = margin;
            p.direction = Math.min(0, p.direction + 0.5);
        } else if (p.x > this.canvas.width - margin) {
            p.x = this.canvas.width - margin;
            p.direction = Math.max(0, p.direction - 0.5);
        }

        // Create ski trails
        if (!p.jumping && Math.random() < 0.6) {
            this.skiTrails.push({
                x: p.x - 4,
                y: p.y + 10,
                age: 0
            });
            this.skiTrails.push({
                x: p.x + 4,
                y: p.y + 10,
                age: 0
            });
        }

        // Spray snow particles when skiing fast
        if (p.speed > 5 && !p.jumping && Math.random() < 0.4) {
            const side = Math.random() < 0.5 ? -1 : 1;
            this.particles.push({
                type: 'snow',
                x: p.x + side * 6,
                y: p.y + 12,
                vx: side * (1 + Math.random() * 2) - p.direction * 0.5,
                vy: -Math.random() * 2,
                life: 15 + Math.random() * 10,
                size: 2 + Math.random() * 2
            });
        }
    }

    updateWorld() {
        // Update distance
        this.distance += this.player.speed * 0.5 * this.deltaTime;
        this.worldOffset += this.player.speed * this.deltaTime;

        // Score from distance
        const newScore = Math.floor(this.distance / 10);
        if (newScore > this.score) {
            const previousScore = this.score;
            this.score = newScore;
            // Emit score:updated every 50 points to avoid excessive events
            if (Math.floor(this.score / 50) > Math.floor(previousScore / 50)) {
                this.emitAppEvent('score:updated', {
                    score: this.score,
                    distance: Math.floor(this.distance)
                });
            }
        }

        // Trigger yeti
        if (this.distance > this.yetiTriggerDistance && !this.yeti.active) {
            this.activateYeti();
        }
    }

    updateObstacles() {
        const p = this.player;
        const speed = p.speed * this.deltaTime;

        // Move obstacles
        for (const obs of this.obstacles) {
            obs.y -= speed;
        }

        // Move ski trails
        for (const trail of this.skiTrails) {
            trail.y -= speed;
            trail.age += this.deltaTime;
        }

        // Remove old trails
        this.skiTrails = this.skiTrails.filter(t => t.age < 60 && t.y > -10);

        // Remove off-screen obstacles
        this.obstacles = this.obstacles.filter(obs => obs.y > -50);

        // Generate new obstacles
        if (this.obstacles.length < 20) {
            this.generateObstacles(10, this.canvas.height + 50, this.canvas.height + 400);
        }

        // Check collisions
        if (!p.invincible && this.state === this.STATE.PLAYING) {
            this.checkCollisions();
        }
    }

    checkCollisions() {
        const p = this.player;

        for (const obs of this.obstacles) {
            if (obs.hit) continue;

            const dx = Math.abs(p.x - obs.x);
            const dy = Math.abs(p.y - obs.y);

            // Adjusted hitboxes
            const hitX = obs.width / 2 + 8;
            const hitY = obs.height / 2 + 5;

            // Skip if jumping high enough over obstacles
            if (p.jumping && p.jumpHeight > 15 && obs.type !== 'flag') continue;

            if (dx < hitX && dy < hitY) {
                obs.hit = true;

                if (obs.type === 'jump') {
                    // Launch into air!
                    if (!p.jumping) {
                        p.jumping = true;
                        p.jumpVelocity = 6 + p.speed * 0.3;
                        p.jumpHeight = 1;
                        this.score += 100;
                        this.createBonusText(obs.x, obs.y, '+100 JUMP!');
                        this.playSound('jump');

                        // Emit jump event
                        EventBus.emit('skifree:jump', {
                            x: obs.x,
                            y: obs.y,
                            points: 100
                        });
                        EventBus.emit('game:score', {
                            appId: 'skifree',
                            score: this.score,
                            delta: 100,
                            reason: 'jump'
                        });
                    }
                } else if (obs.type === 'flag') {
                    this.score += 50;
                    this.createBonusText(obs.x, obs.y, '+50');
                    this.playSound('flag');

                    // Emit score event
                    EventBus.emit('game:score', {
                        appId: 'skifree',
                        score: this.score,
                        delta: 50,
                        reason: 'flag'
                    });
                } else {
                    // Crash! Stop checking after first crash
                    this.crashPlayer(obs);
                    return;
                }
            }
        }
    }

    crashPlayer(obs) {
        this.lives--;
        this.screenShake = 15;
        this.score = Math.max(0, this.score - 25);
        this.playSound('crash');

        // Emit obstacle hit event
        EventBus.emit('skifree:obstacle:hit', {
            type: obs.type,
            x: obs.x,
            y: obs.y
        });

        // Emit lives change event
        EventBus.emit('game:lives', {
            appId: 'skifree',
            lives: this.lives,
            delta: -1
        });

        // Create crash particles
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;
            this.particles.push({
                type: 'crash',
                x: this.player.x,
                y: this.player.y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                life: 20 + Math.random() * 20,
                size: 3 + Math.random() * 3
            });
        }

        // Equipment flying off
        this.particles.push({
            type: 'ski',
            x: this.player.x - 10,
            y: this.player.y,
            vx: -3 - Math.random() * 2,
            vy: -4 - Math.random() * 2,
            rotation: 0,
            rotSpeed: 0.3,
            life: 60
        });
        this.particles.push({
            type: 'ski',
            x: this.player.x + 10,
            y: this.player.y,
            vx: 3 + Math.random() * 2,
            vy: -3 - Math.random() * 2,
            rotation: 0,
            rotSpeed: -0.25,
            life: 60
        });
        this.particles.push({
            type: 'pole',
            x: this.player.x,
            y: this.player.y - 5,
            vx: (Math.random() - 0.5) * 6,
            vy: -5 - Math.random() * 3,
            rotation: Math.random() * Math.PI,
            rotSpeed: 0.2 * (Math.random() < 0.5 ? 1 : -1),
            life: 50
        });

        // Check if out of lives
        if (this.lives <= 0) {
            this.updateStateText('OUT OF LIVES! Press SPACE to restart');
            this.gameOver(false);
        } else {
            this.state = this.STATE.CRASHED;
            this.player.speed = 0;
            this.crashTimer = 60; // ~1 second recovery time
            this.updateStateText(`CRASH! ${this.lives} ${this.lives === 1 ? 'life' : 'lives'} left`);
        }
    }

    activateYeti() {
        this.yeti.active = true;
        this.yeti.x = this.player.x + (Math.random() - 0.5) * 200;
        this.yeti.y = this.canvas.height + 100;
        this.yeti.speed = 5;
        this.playSound('yeti');
        this.updateStateText('⚠️ YETI! RUN! Press F for speed!');
        this.flashTimer = 30;

        this.emitAppEvent('yeti:appeared', {
            distance: this.distance
        });

        // Emit yeti spawn event
        EventBus.emit('skifree:yeti:spawn', {
            distance: this.distance
        });
    }

    updateYeti() {
        if (!this.yeti.active) {
            // Show warning before yeti
            if (this.distance > this.yetiTriggerDistance - 400) {
                const warningPhase = Math.floor((performance.now() / 200) % 2);
                if (warningPhase === 0) {
                    this.updateStateText('⚠️ WARNING: YETI APPROACHING!');
                } else {
                    this.updateStateText('Press F for maximum speed!');
                }
            }
            return;
        }

        if (this.yeti.eating) {
            this.yeti.eatTimer -= this.deltaTime;
            if (this.yeti.eatTimer <= 0) {
                this.gameOver(true);
            }
            return;
        }

        const y = this.yeti;
        const p = this.player;

        // Yeti chases player
        const dx = p.x - y.x;
        const dy = p.y - y.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Yeti speeds up over time
        y.speed = Math.min(10, y.speed + 0.002 * this.deltaTime);

        if (dist > 0) {
            y.x += (dx / dist) * y.speed * this.deltaTime;
            y.y += (dy / dist) * y.speed * this.deltaTime - p.speed * this.deltaTime * 0.7;
        }

        // Animation frame
        y.frame = (y.frame + 0.15 * this.deltaTime) % 4;

        // Check if yeti caught player
        if (dist < 25 && !p.jumping) {
            this.yeti.eating = true;
            this.yeti.eatTimer = 60;
            this.state = this.STATE.EATEN;
            this.screenShake = 30;
            this.playSound('eaten');
            this.updateStateText('🥶 EATEN BY YETI!');

            // Emit yeti caught event
            EventBus.emit('skifree:yeti:caught', {
                distance: this.distance,
                score: this.score
            });
        }

        // Yeti left behind?
        if (y.y > this.canvas.height + 200) {
            y.active = false;
            this.score += 500;
            this.createBonusText(this.canvas.width / 2, 100, '+500 ESCAPED YETI!');
            this.yetiTriggerDistance = this.distance + 1500;
            this.updateStateText('You escaped! +500 points!');
        }
    }

    updateParticles() {
        const speed = this.player.speed * this.deltaTime;

        this.particles = this.particles.filter(p => {
            p.x += p.vx * this.deltaTime;
            p.y += p.vy * this.deltaTime - speed * 0.5;
            p.life -= this.deltaTime;

            if (p.type === 'crash' || p.type === 'snow') {
                p.vy += 0.2 * this.deltaTime; // Gravity
            } else if (p.type === 'ski' || p.type === 'pole') {
                p.vy += 0.15 * this.deltaTime;
                p.rotation += p.rotSpeed * this.deltaTime;
            } else if (p.type === 'text') {
                p.vy -= 0.05 * this.deltaTime; // Float up
            }

            return p.life > 0;
        });
    }

    createBonusText(x, y, text) {
        this.particles.push({
            type: 'text',
            x: x,
            y: y,
            vx: 0,
            vy: -1,
            life: 45,
            text: text
        });
    }

    updateEffects() {
        if (this.screenShake > 0) {
            this.screenShake -= this.deltaTime;
        }
        if (this.flashTimer > 0) {
            this.flashTimer -= this.deltaTime;
        }
    }

    updateUI() {
        const distEl = this.getElement('#distance');
        const scoreEl = this.getElement('#score');
        const speedEl = this.getElement('#speed');
        const highEl = this.getElement('#highscore');
        const livesEl = this.getElement('#lives');

        if (distEl) distEl.textContent = Math.floor(this.distance);
        if (scoreEl) scoreEl.textContent = this.score;
        if (speedEl) speedEl.textContent = Math.floor(this.player.speed * 10);
        if (highEl) highEl.textContent = Math.max(this.highScore, this.score);
        if (livesEl) livesEl.textContent = '❤'.repeat(this.lives) + '♡'.repeat(3 - this.lives);
    }

    updateStateText(text) {
        const el = this.getElement('#stateText');
        if (el) el.textContent = text;
    }

    gameOver(byYeti) {
        this.state = this.STATE.GAMEOVER;

        this.emitAppEvent('game:over', {
            score: this.score,
            distance: Math.floor(this.distance),
            byYeti: byYeti,
            lives: this.lives
        });

        // Update high score
        const isHighScore = this.score > this.highScore;
        if (isHighScore) {
            const previousScore = this.highScore;
            this.highScore = this.score;
            StorageManager.set('skifree_highscore', this.highScore);

            // Emit high score event
            EventBus.emit('game:highscore', {
                appId: 'skifree',
                score: this.score,
                previousScore
            });
        }

        // Emit game over event
        EventBus.emit('game:over', {
            appId: 'skifree',
            won: false,
            score: this.score,
            stats: {
                distance: Math.floor(this.distance),
                byYeti,
                isHighScore
            }
        });

        this.drawGameOverScreen(byYeti);
    }

    // =========== DRAWING ===========

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.save();

        // Screen shake
        if (this.screenShake > 0) {
            const shake = this.screenShake * 0.5;
            ctx.translate(
                (Math.random() - 0.5) * shake,
                (Math.random() - 0.5) * shake
            );
        }

        // Clear - snow background
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);

        // Draw snow texture
        this.drawSnowTexture();

        // Draw ski trails
        this.drawSkiTrails();

        // Draw obstacles (sorted by Y for proper depth)
        const sortedObs = [...this.obstacles].sort((a, b) => a.y - b.y);
        for (const obs of sortedObs) {
            if (obs.y > -50 && obs.y < h + 50) {
                this.drawObstacle(obs);
            }
        }

        // Draw particles behind player
        this.drawParticles(false);

        // Draw player
        this.drawPlayer();

        // Draw particles in front
        this.drawParticles(true);

        // Draw yeti
        if (this.yeti.active) {
            this.drawYeti();
        }

        // Flash effect
        if (this.flashTimer > 0 && Math.floor(this.flashTimer / 3) % 2 === 0) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
            ctx.fillRect(0, 0, w, h);
        }

        ctx.restore();
    }

    drawSnowTexture() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Subtle snow dots
        ctx.fillStyle = '#e8eef5';
        const offset = this.worldOffset * 0.3;
        for (let i = 0; i < 80; i++) {
            const x = ((i * 47 + 13) % w);
            const y = ((i * 31 + offset) % (h + 50)) - 25;
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Occasional larger snow clumps
        ctx.fillStyle = '#dde5ee';
        for (let i = 0; i < 15; i++) {
            const x = ((i * 89 + 7) % w);
            const y = ((i * 67 + offset * 0.5) % (h + 100)) - 50;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawSkiTrails() {
        const ctx = this.ctx;

        for (const trail of this.skiTrails) {
            const alpha = Math.max(0, 1 - trail.age / 60);
            ctx.fillStyle = `rgba(200, 210, 220, ${alpha * 0.6})`;
            ctx.fillRect(trail.x - 1, trail.y, 2, 4);
        }
    }

    drawPlayer() {
        const ctx = this.ctx;
        const p = this.player;

        ctx.save();
        ctx.translate(p.x, p.y - p.jumpHeight);

        // Invincibility flicker
        if (p.invincible && Math.floor(p.invincibleTimer / 3) % 2 === 0) {
            ctx.globalAlpha = 0.5;
        }

        // Jump shadow
        if (p.jumping) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.beginPath();
            ctx.ellipse(0, p.jumpHeight + 5, 10, 4, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        if (this.state === this.STATE.CRASHED || this.state === this.STATE.EATEN) {
            this.drawCrashedSkier();
        } else {
            this.drawSkier();
        }

        ctx.restore();
    }

    drawSkier() {
        const ctx = this.ctx;
        const p = this.player;
        const dir = Math.round(p.direction);

        // Determine skier pose based on direction
        // dir: -3 (hard left) to 3 (hard right), 0 is straight down

        ctx.save();

        // Body (blue jacket)
        ctx.fillStyle = '#2563eb';

        if (dir === 0) {
            // Straight down - back view
            // Head
            ctx.fillStyle = '#fcd34d'; // Yellow helmet
            ctx.beginPath();
            ctx.arc(0, -12, 6, 0, Math.PI * 2);
            ctx.fill();

            // Body
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(-5, -6, 10, 12);

            // Arms
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(-5, -2);
            ctx.lineTo(-10, 4);
            ctx.moveTo(5, -2);
            ctx.lineTo(10, 4);
            ctx.stroke();

            // Skis
            ctx.fillStyle = '#1e40af';
            ctx.fillRect(-7, 6, 4, 14);
            ctx.fillRect(3, 6, 4, 14);

            // Poles
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-10, 4);
            ctx.lineTo(-12, 18);
            ctx.moveTo(10, 4);
            ctx.lineTo(12, 18);
            ctx.stroke();

        } else {
            // Angled view
            const flip = dir < 0 ? -1 : 1;
            ctx.scale(flip, 1);
            const angle = Math.abs(dir);

            // Lean based on angle
            ctx.rotate((angle * 0.15));

            // Head
            ctx.fillStyle = '#fcd34d';
            ctx.beginPath();
            ctx.arc(2, -12, 6, 0, Math.PI * 2);
            ctx.fill();

            // Goggles
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(-1, -13, 6, 3);

            // Body
            ctx.fillStyle = '#2563eb';
            ctx.beginPath();
            ctx.moveTo(-3, -6);
            ctx.lineTo(5, -6);
            ctx.lineTo(6, 6);
            ctx.lineTo(-4, 6);
            ctx.closePath();
            ctx.fill();

            // Legs
            ctx.fillStyle = '#1f2937';
            ctx.fillRect(-3, 6, 4, 6);
            ctx.fillRect(2, 6, 4, 6);

            // Skis (more parallel to direction)
            ctx.fillStyle = '#1e40af';
            ctx.save();
            ctx.rotate(0.2 + angle * 0.1);
            ctx.fillRect(-4, 10, 3, 14);
            ctx.fillRect(2, 11, 3, 14);
            ctx.restore();

            // Poles
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-6, 0);
            ctx.lineTo(-10 - angle * 2, 15);
            ctx.moveTo(8, 0);
            ctx.lineTo(4 + angle * 2, 15);
            ctx.stroke();
        }

        ctx.restore();
    }

    drawCrashedSkier() {
        const ctx = this.ctx;

        // Sprawled body
        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.ellipse(0, 0, 12, 6, Math.PI * 0.2, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = '#fcd34d';
        ctx.beginPath();
        ctx.arc(-8, -4, 5, 0, Math.PI * 2);
        ctx.fill();

        // Dizzy stars
        const starAngle = (performance.now() / 200) % (Math.PI * 2);
        ctx.fillStyle = '#fbbf24';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        for (let i = 0; i < 3; i++) {
            const a = starAngle + (i * Math.PI * 2 / 3);
            const sx = -8 + Math.cos(a) * 12;
            const sy = -10 + Math.sin(a) * 6;
            ctx.fillText('⭐', sx, sy);
        }
    }

    drawObstacle(obs) {
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(obs.x, obs.y);

        // Fade out hit obstacles
        if (obs.hit && (obs.type === 'flag' || obs.type === 'jump')) {
            ctx.globalAlpha = 0.3;
        }

        switch (obs.type) {
            case 'tree':
                this.drawTree(false);
                break;
            case 'smallTree':
                this.drawTree(true);
                break;
            case 'rock':
                this.drawRock();
                break;
            case 'jump':
                this.drawJump();
                break;
            case 'flag':
                this.drawFlag();
                break;
            case 'snowman':
                this.drawSnowman();
                break;
        }

        ctx.restore();
    }

    drawTree(small) {
        const ctx = this.ctx;
        const scale = small ? 0.7 : 1;

        ctx.save();
        ctx.scale(scale, scale);

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(0, 18, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Trunk
        ctx.fillStyle = '#5c4033';
        ctx.fillRect(-3, 8, 6, 12);

        // Tree layers
        const greens = ['#1a5f1a', '#228b22', '#2ca82c'];
        const layers = [
            { y: -25, w: 8 },
            { y: -15, w: 14 },
            { y: -3, w: 18 },
            { y: 10, w: 22 }
        ];

        for (let i = 0; i < layers.length; i++) {
            const l = layers[i];
            ctx.fillStyle = greens[i % greens.length];
            ctx.beginPath();
            ctx.moveTo(0, l.y - 12);
            ctx.lineTo(-l.w / 2, l.y);
            ctx.lineTo(l.w / 2, l.y);
            ctx.closePath();
            ctx.fill();
        }

        // Snow on branches
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(-2, -36);
        ctx.lineTo(0, -38);
        ctx.lineTo(2, -36);
        ctx.lineTo(0, -34);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    drawRock() {
        const ctx = this.ctx;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.ellipse(2, 6, 14, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Main rock body
        ctx.fillStyle = '#6b7280';
        ctx.beginPath();
        ctx.moveTo(-12, 4);
        ctx.quadraticCurveTo(-14, -2, -8, -6);
        ctx.quadraticCurveTo(-2, -10, 6, -6);
        ctx.quadraticCurveTo(14, -2, 12, 4);
        ctx.quadraticCurveTo(8, 8, 0, 8);
        ctx.quadraticCurveTo(-8, 8, -12, 4);
        ctx.fill();

        // Highlight
        ctx.fillStyle = '#9ca3af';
        ctx.beginPath();
        ctx.ellipse(-3, -3, 6, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Snow cap
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.quadraticCurveTo(0, -12, 6, -6);
        ctx.quadraticCurveTo(2, -5, -2, -5);
        ctx.closePath();
        ctx.fill();
    }

    drawJump() {
        const ctx = this.ctx;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.beginPath();
        ctx.ellipse(0, 8, 18, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ramp
        ctx.fillStyle = '#e0e7ef';
        ctx.beginPath();
        ctx.moveTo(-18, 6);
        ctx.lineTo(-10, -4);
        ctx.lineTo(10, -4);
        ctx.lineTo(18, 6);
        ctx.closePath();
        ctx.fill();

        // Ramp edge
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-18, 6);
        ctx.lineTo(-10, -4);
        ctx.lineTo(10, -4);
        ctx.lineTo(18, 6);
        ctx.stroke();

        // Snow sparkle
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(0, -2, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    drawFlag() {
        const ctx = this.ctx;

        // Pole
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 15);
        ctx.lineTo(0, -18);
        ctx.stroke();

        // Flag
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(14, -12);
        ctx.lineTo(0, -6);
        ctx.closePath();
        ctx.fill();

        // Flag pattern
        ctx.fillStyle = '#fef2f2';
        ctx.beginPath();
        ctx.arc(7, -12, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    drawSnowman() {
        const ctx = this.ctx;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.beginPath();
        ctx.ellipse(0, 18, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Bottom ball
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 10, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Middle ball
        ctx.beginPath();
        ctx.arc(0, -2, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Head
        ctx.beginPath();
        ctx.arc(0, -14, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Hat
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(-5, -24, 10, 3);
        ctx.fillRect(-3, -30, 6, 7);

        // Eyes
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(-2, -15, 1.5, 0, Math.PI * 2);
        ctx.arc(2, -15, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Nose (carrot)
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(0, -13);
        ctx.lineTo(6, -12);
        ctx.lineTo(0, -11);
        ctx.closePath();
        ctx.fill();

        // Buttons
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(0, -4, 1.5, 0, Math.PI * 2);
        ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
        ctx.arc(0, 4, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Stick arms
        ctx.strokeStyle = '#5c4033';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, -2);
        ctx.lineTo(-18, -8);
        ctx.moveTo(8, -2);
        ctx.lineTo(18, -8);
        ctx.stroke();
    }

    drawYeti() {
        const ctx = this.ctx;
        const y = this.yeti;

        ctx.save();
        ctx.translate(y.x, y.y);

        // Running animation bounce
        const bounce = Math.sin(y.frame * Math.PI) * 3;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.beginPath();
        ctx.ellipse(0, 25 - bounce / 2, 18, 6, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(0, -bounce);

        // Body (gray-blue fur - visible against snow)
        ctx.fillStyle = '#8b9eb3';
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 5, 18, 22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Fur texture
        ctx.strokeStyle = '#6b7a8a';
        ctx.lineWidth = 2;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI - Math.PI / 2;
            const r1 = 14;
            const r2 = 18;
            ctx.beginPath();
            ctx.moveTo(Math.cos(angle) * r1, 5 + Math.sin(angle) * 16);
            ctx.lineTo(Math.cos(angle) * r2, 5 + Math.sin(angle) * 20);
            ctx.stroke();
        }

        // Arms reaching forward
        const armWave = Math.sin(y.frame * Math.PI * 2) * 0.2;
        ctx.fillStyle = '#8b9eb3';

        // Left arm
        ctx.save();
        ctx.translate(-16, -5);
        ctx.rotate(-0.8 + armWave);
        ctx.fillStyle = '#8b9eb3';
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, -15, 6, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Claws
        ctx.fillStyle = '#1f2937';
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 3, -32);
            ctx.lineTo(i * 4, -38);
            ctx.lineTo(i * 3 + 2, -32);
            ctx.fill();
        }
        ctx.restore();

        // Right arm
        ctx.save();
        ctx.translate(16, -5);
        ctx.rotate(0.8 - armWave);
        ctx.fillStyle = '#8b9eb3';
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, -15, 6, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1f2937';
        for (let i = -1; i <= 1; i++) {
            ctx.beginPath();
            ctx.moveTo(i * 3, -32);
            ctx.lineTo(i * 4, -38);
            ctx.lineTo(i * 3 + 2, -32);
            ctx.fill();
        }
        ctx.restore();

        // Head
        ctx.fillStyle = '#8b9eb3';
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, -22, 14, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Face
        // Eyes (angry, red)
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.ellipse(-6, -24, 4, 3, 0, 0, Math.PI * 2);
        ctx.ellipse(6, -24, 4, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupils
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(-5, -24, 2, 0, Math.PI * 2);
        ctx.arc(7, -24, 2, 0, Math.PI * 2);
        ctx.fill();

        // Angry eyebrows
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-12, -30);
        ctx.lineTo(-3, -27);
        ctx.moveTo(12, -30);
        ctx.lineTo(3, -27);
        ctx.stroke();

        // Mouth (open, scary)
        ctx.fillStyle = '#7f1d1d';
        ctx.beginPath();
        ctx.ellipse(0, -14, 10, 6, 0, 0, Math.PI);
        ctx.fill();

        // Teeth
        ctx.fillStyle = '#fff';
        const teeth = [-7, -3, 1, 5];
        for (const tx of teeth) {
            ctx.beginPath();
            ctx.moveTo(tx, -14);
            ctx.lineTo(tx + 2, -14);
            ctx.lineTo(tx + 1, -10);
            ctx.closePath();
            ctx.fill();
        }

        // Horns/ears
        ctx.fillStyle = '#6b7a8a';
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-10, -32);
        ctx.lineTo(-14, -40);
        ctx.lineTo(-6, -34);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(10, -32);
        ctx.lineTo(14, -40);
        ctx.lineTo(6, -34);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Eating animation
        if (y.eating) {
            ctx.fillStyle = '#dc2626';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('CHOMP!', 0, -50);
        }

        ctx.restore();
    }

    drawParticles(inFront) {
        const ctx = this.ctx;

        for (const p of this.particles) {
            // Text particles always draw in front
            const isFrontParticle = p.type === 'text' || p.type === 'ski' || p.type === 'pole';
            if (inFront !== isFrontParticle) continue;

            ctx.save();
            ctx.translate(p.x, p.y);

            if (p.type === 'snow') {
                ctx.globalAlpha = p.life / 25;
                ctx.fillStyle = '#c7d2de';
                ctx.beginPath();
                ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'crash') {
                ctx.globalAlpha = p.life / 40;
                ctx.fillStyle = '#f8fafc';
                ctx.beginPath();
                ctx.arc(0, 0, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'ski') {
                ctx.globalAlpha = Math.min(1, p.life / 20);
                ctx.rotate(p.rotation);
                ctx.fillStyle = '#1e40af';
                ctx.fillRect(-2, -10, 4, 20);
            } else if (p.type === 'pole') {
                ctx.globalAlpha = Math.min(1, p.life / 20);
                ctx.rotate(p.rotation);
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, -12);
                ctx.lineTo(0, 12);
                ctx.stroke();
                ctx.fillStyle = '#666';
                ctx.beginPath();
                ctx.arc(0, 12, 3, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'text') {
                ctx.globalAlpha = Math.min(1, p.life / 15);
                ctx.fillStyle = '#15803d';
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.font = 'bold 14px Arial';
                ctx.textAlign = 'center';
                ctx.strokeText(p.text, 0, 0);
                ctx.fillText(p.text, 0, 0);
            }

            ctx.restore();
        }
    }

    drawMenuScreen() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Background
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, w, h);

        // Snow texture
        this.drawSnowTexture();

        // Title
        ctx.fillStyle = '#1e40af';
        ctx.font = 'bold 48px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SkiFree', w / 2, h / 3 - 20);

        // Subtitle
        ctx.fillStyle = '#64748b';
        ctx.font = '16px "Segoe UI", sans-serif';
        ctx.fillText('A Windows Classic', w / 2, h / 3 + 15);

        // Draw a skier
        ctx.save();
        ctx.translate(w / 2, h / 2 + 20);
        this.drawSkier();
        ctx.restore();

        // Instructions
        ctx.fillStyle = '#374151';
        ctx.font = '14px "Segoe UI", sans-serif';
        ctx.fillText('← → to steer   |   ↓ to speed up   |   F for maximum speed', w / 2, h / 2 + 80);
        ctx.fillText('You have 3 lives! Collect flags (+50) and hit jumps (+100)', w / 2, h / 2 + 105);

        // Warning
        ctx.fillStyle = '#dc2626';
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.fillText('⚠️ Watch out for the YETI at 2000m! ⚠️', w / 2, h / 2 + 140);

        // Start prompt
        ctx.fillStyle = '#15803d';
        ctx.font = 'bold 18px "Segoe UI", sans-serif';
        const blink = Math.floor(performance.now() / 500) % 2;
        if (blink) {
            ctx.fillText('Press SPACE to Start', w / 2, h - 60);
        }

        // High score
        if (this.highScore > 0) {
            ctx.fillStyle = '#1e40af';
            ctx.font = '14px "Segoe UI", sans-serif';
            ctx.fillText(`High Score: ${this.highScore}`, w / 2, h - 30);
        }

        // Request next frame for blinking
        if (this.state === this.STATE.MENU) {
            requestAnimationFrame(() => {
                if (this.state === this.STATE.MENU) {
                    this.drawMenuScreen();
                }
            });
        }
    }

    drawPauseOverlay() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 36px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', w / 2, h / 2);

        ctx.font = '18px "Segoe UI", sans-serif';
        ctx.fillText('Press P to Resume', w / 2, h / 2 + 40);
    }

    drawGameOverScreen(byYeti) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Keep game state visible, add overlay
        this.draw();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = 'center';

        if (byYeti) {
            // Yeti ate you
            ctx.fillStyle = '#dc2626';
            ctx.font = 'bold 36px "Segoe UI", sans-serif';
            ctx.fillText('🥶 EATEN BY YETI! 🥶', w / 2, h / 3);

            ctx.fillStyle = '#fff';
            ctx.font = '16px "Segoe UI", sans-serif';
            ctx.fillText('The abominable snowman got you...', w / 2, h / 3 + 35);
        } else {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 36px "Segoe UI", sans-serif';
            ctx.fillText('GAME OVER', w / 2, h / 3);

            ctx.fillStyle = '#e2e8f0';
            ctx.font = '16px "Segoe UI", sans-serif';
            ctx.fillText('You ran out of lives!', w / 2, h / 3 + 35);
        }

        // Stats
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '20px "Segoe UI", sans-serif';
        ctx.fillText(`Distance: ${Math.floor(this.distance)}m`, w / 2, h / 2);
        ctx.fillText(`Score: ${this.score}`, w / 2, h / 2 + 35);

        // New high score?
        if (this.score >= this.highScore && this.score > 0) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 18px "Segoe UI", sans-serif';
            ctx.fillText('🏆 NEW HIGH SCORE! 🏆', w / 2, h / 2 + 75);
        }

        // Restart prompt
        ctx.fillStyle = '#22c55e';
        ctx.font = 'bold 16px "Segoe UI", sans-serif';
        ctx.fillText('Press SPACE to Play Again', w / 2, h - 60);
    }

    playSound(type) {
        // Integrate with EventBus sound system
        try {
            EventBus.emit(Events.SOUND_PLAY, { type: type });
        } catch (e) {
            // Sound system may not be available
        }
    }

}

export default SkiFree;
