/**
 * Asteroids Game - Enhanced Edition
 * Classic arcade space shooter with power-ups, UFOs, and more!
 */

import AppBase from './AppBase.js';
import StateManager from '../core/StateManager.js';
import EventBus from '../core/EventBus.js';

class Asteroids extends AppBase {
    constructor() {
        super({
            id: 'asteroids',
            name: 'Asteroids',
            icon: '🚀',
            width: 720,
            height: 600,
            minWidth: 560,
            minHeight: 480,
            resizable: true,
            singleton: true, // One game at a time
            category: 'games'
        });

        // Game Constants
        this.FPS = 60;
        this.FRICTION = 0.7;
        this.LASER_DIST = 0.6;
        this.LASER_SPD = 500;
        this.LASER_MAX = 10;
        this.ROIDS_NUM = 3;
        this.ROIDS_SIZE = 100;
        this.ROIDS_SPD = 50;
        this.ROIDS_VERT = 10;
        this.SHIP_SIZE = 30;
        this.SHIP_THRUST = 5;
        this.TURN_SPEED = 360;
        this.SHIP_INV_DUR = 3;
        this.SHIP_BLINK_DUR = 0.1;

        // Power-up Constants
        this.POWERUP_CHANCE = 0.15; // 15% chance on asteroid destruction
        this.POWERUP_DURATION = 10; // seconds
        this.POWERUP_TYPES = ['shield', 'triple', 'rapid', 'extralife'];

        // UFO Constants
        this.UFO_SPAWN_INTERVAL = 15; // seconds
        this.UFO_SHOOT_INTERVAL = 2; // seconds
        this.UFO_SPEED = 100;
        this.UFO_SIZE = 25;

        // Combo Constants
        this.COMBO_TIMEOUT = 2; // seconds without kill resets combo

        // Game State
        this.canvas = null;
        this.ctx = null;
        this.gameLoop = null;
        this.level = 0;
        this.lives = 3;
        this.score = 0;
        this.scoreHigh = 0;
        this.ship = null;
        this.roids = [];
        this.text = "";
        this.textAlpha = 0;
        this.particles = [];
        this.powerups = [];
        this.ufos = [];
        this.ufoLasers = [];
        this.activePowerup = null;
        this.powerupTimeLeft = 0;
        this.ufoSpawnTimer = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.multiplier = 1;
        this.isPaused = false;

        this.session = null;

        // Register semantic event commands for scriptability
        this.registerCommands();
        this.registerQueries();
    }

    registerCommands() {
        this.registerCommand('start', () => {
            this.newGame();
            return { success: true };
        });

        this.registerCommand('pause', () => {
            if (!this.isPaused && this.gameLoop) {
                this.isPaused = true;
                clearInterval(this.gameLoop);
                this.gameLoop = null;
            }
            return { success: true, isPaused: this.isPaused };
        });

        this.registerCommand('resume', () => {
            if (this.isPaused) {
                this.isPaused = false;
                this.gameLoop = setInterval(() => this.update(), 1000 / this.FPS);
            }
            return { success: true, isPaused: this.isPaused };
        });

        this.registerCommand('setLevel', (payload) => {
            if (!payload || payload.level === undefined) return { success: false, error: 'Provide level number' };
            this.level = Math.max(0, payload.level - 1); // newLevel increments
            this.roids = [];
            this.ufos = [];
            this.newLevel();
            return { success: true, level: this.level };
        });

        this.registerCommand('setLives', (payload) => {
            if (!payload || payload.lives === undefined) return { success: false, error: 'Provide lives count' };
            this.lives = Math.max(0, payload.lives);
            this.updateHUD();
            this.emitAppEvent('lives:set', { lives: this.lives });
            return { success: true, lives: this.lives };
        });

        this.registerCommand('setScore', (payload) => {
            if (!payload || payload.score === undefined) return { success: false, error: 'Provide score value' };
            this.score = Math.max(0, payload.score);
            this.updateHUD();
            this.emitAppEvent('score:set', { score: this.score });
            return { success: true, score: this.score };
        });
    }

    registerQueries() {
        this.registerQuery('getState', () => {
            return {
                score: this.score,
                lives: this.lives,
                level: this.level,
                highScore: this.scoreHigh,
                isPlaying: !this.ship?.dead && this.gameLoop !== null,
                isPaused: this.isPaused,
                combo: this.combo,
                multiplier: this.multiplier,
                activePowerup: this.activePowerup
            };
        });
    }

    onOpen() {
        return `
            <div class="asteroids-container">
                <div class="asteroids-hud">
                    <div class="ast-hud-col ast-hud-left">
                        <div>SCORE: <span id="score" class="ast-val ast-val-cyan">0</span></div>
                        <div>HIGH: <span id="highscore" class="ast-val ast-val-yellow">0</span></div>
                    </div>
                    <div class="ast-hud-col ast-hud-center">
                        <div>LEVEL: <span id="level" class="ast-val ast-val-magenta">1</span></div>
                        <div id="comboDisplay" class="ast-combo">COMBO x<span id="combo">1</span></div>
                    </div>
                    <div class="ast-hud-col ast-hud-right">
                        <div>LIVES: <span id="lives" class="ast-val ast-val-red">3</span></div>
                        <div id="powerupDisplay" class="ast-powerup">PWR: <span id="powerup">-</span> <span id="powerupTime">0</span>s</div>
                    </div>
                </div>
                <div class="asteroids-canvas-wrapper">
                    <canvas id="gameCanvas" width="680" height="480"></canvas>
                </div>
                <div class="asteroids-controls">
                    <button type="button" class="ast-btn" id="btnPause">PAUSE</button>
                    <span class="ast-controls-hint">Arrows: Move/Turn &middot; Space: Shoot &middot; P: Pause</span>
                    <button type="button" class="ast-btn" id="btnRestart">NEW GAME</button>
                </div>
            </div>
        `;
    }

    onMount() {
        this.canvas = this.getElement('#gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Use fixed canvas dimensions to ensure consistent game area
        this.canvas.width = 680;
        this.canvas.height = 480;

        // Load high score from state
        const savedHighScore = StateManager.getState('asteroids_highscore');
        if (savedHighScore) {
            this.scoreHigh = savedHighScore;
        }

        // Button listeners
        this.addHandler(this.getElement('#btnPause'), 'click', () => this.togglePause());
        this.addHandler(this.getElement('#btnRestart'), 'click', () => this.newGame());

        // Setup input — gated on focus so arrow keys / spacebar don't
        // control the ship while another window is active.
        this.addHandler(document, 'keydown', (e) => {
            if (!this.isFocused()) return;
            this.keyDown(e);
        });
        this.addHandler(document, 'keyup', (e) => {
            if (!this.isFocused()) return;
            this.keyUp(e);
        });

        this.newGame();
        this.gameLoop = setInterval(() => this.update(), 1000 / this.FPS);
    }

    togglePause() {
        if (!this.gameLoop && !this.isPaused) return; // not in a game
        if (this.isPaused) {
            this.isPaused = false;
            this.gameLoop = setInterval(() => this.update(), 1000 / this.FPS);
        } else {
            this.isPaused = true;
            if (this.gameLoop) {
                clearInterval(this.gameLoop);
                this.gameLoop = null;
            }
        }
        const btn = this.getElement('#btnPause');
        if (btn) btn.innerText = this.isPaused ? 'RESUME' : 'PAUSE';
        this.playSound('click');
        EventBus.emit(this.isPaused ? 'game:pause' : 'game:resume', {
            appId: 'asteroids', score: this.score
        });
    }

    onClose() {
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
        if (this._restartTimer) {
            clearTimeout(this._restartTimer);
            this._restartTimer = null;
        }
    }

    newGame() {
        // Restart the loop if it was cleared (e.g., after game over)
        if (!this.gameLoop) {
            this.gameLoop = setInterval(() => this.update(), 1000 / this.FPS);
        }
        if (this._restartTimer) {
            clearTimeout(this._restartTimer);
            this._restartTimer = null;
        }
        this.level = 0;
        this.lives = 3;
        this.score = 0;
        this.combo = 0;
        this.comboTimer = 0;
        this.multiplier = 1;
        this.particles = [];
        this.powerups = [];
        this.ufos = [];
        this.ufoLasers = [];
        this.activePowerup = null;
        this.powerupTimeLeft = 0;
        this.ufoSpawnTimer = 0;
        this.isPaused = false;
        this.ship = this.newShip();
        this.newLevel();
        this.updateHUD();
        this.playSound('gameStart');

        const btn = this.getElement('#btnPause');
        if (btn) btn.innerText = 'PAUSE';

        this.emitAppEvent('game:start', { lives: this.lives });
        EventBus.emit('game:start', {
            appId: 'asteroids',
            settings: { lives: this.lives }
        });
    }

    newLevel() {
        const previousLevel = this.level;
        this.level++;
        this.text = "LEVEL " + this.level;
        this.textAlpha = 1.0;
        this.createAsteroidBelt();
        this.ufoSpawnTimer = this.UFO_SPAWN_INTERVAL * this.FPS;
        this.updateHUD();
        if (previousLevel > 0) this.playSound('levelUp');

        this.emitAppEvent('level:up', {
            level: this.level,
            previousLevel: previousLevel
        });

        // Emit level change event
        EventBus.emit('game:level', {
            appId: 'asteroids',
            level: this.level,
            previousLevel: previousLevel
        });
    }

    newShip() {
        return {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            a: 90 / 180 * Math.PI,
            r: this.SHIP_SIZE / 2,
            blinkNum: Math.ceil(this.SHIP_INV_DUR / this.SHIP_BLINK_DUR),
            blinkTime: Math.ceil(this.SHIP_BLINK_DUR * this.FPS),
            canShoot: true,
            dead: false,
            lasers: [],
            rot: 0,
            thrusting: false,
            thrust: { x: 0, y: 0 },
            hasShield: false
        };
    }

    createAsteroidBelt() {
        this.roids = [];
        let x, y;
        for (let i = 0; i < this.ROIDS_NUM + this.level; i++) {
            // Random position
            do {
                x = Math.floor(Math.random() * this.canvas.width);
                y = Math.floor(Math.random() * this.canvas.height);
            } while (this.distBetweenPoints(this.ship.x, this.ship.y, x, y) < this.ROIDS_SIZE * 2 + this.ship.r);
            this.roids.push(this.newAsteroid(x, y, Math.ceil(this.ROIDS_SIZE / 2)));
        }
    }

    newAsteroid(x, y, r) {
        let lvlMult = 1 + 0.1 * this.level;
        let roid = {
            x: x,
            y: y,
            xv: Math.random() * this.ROIDS_SPD * lvlMult / this.FPS * (Math.random() < 0.5 ? 1 : -1),
            yv: Math.random() * this.ROIDS_SPD * lvlMult / this.FPS * (Math.random() < 0.5 ? 1 : -1),
            r: r,
            a: Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.02, // rotation speed
            vert: Math.floor(Math.random() * (this.ROIDS_VERT + 1) + this.ROIDS_VERT / 2),
            offs: []
        };

        // Create random vertex offsets
        for (let i = 0; i < roid.vert; i++) {
            roid.offs.push(Math.random() * 0.4 + 0.8);
        }
        return roid;
    }

    distBetweenPoints(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }

    keyDown(e) {
        if (!this.isOpen) return;

        // Prevent scrolling
        if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight", " "].indexOf(e.key) > -1) {
            e.preventDefault();
        }

        // Pause toggle
        if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
            this.togglePause();
            return;
        }

        if (this.isPaused) return;

        switch(e.key) {
            case "ArrowLeft": this.ship.rot = this.TURN_SPEED / 180 * Math.PI / this.FPS; break;
            case "ArrowRight": this.ship.rot = -this.TURN_SPEED / 180 * Math.PI / this.FPS; break;
            case "ArrowUp": this.ship.thrusting = true; break;
            case " ": this.shootLaser(); break;
        }
    }

    keyUp(e) {
        if (!this.isOpen) return;
        switch(e.key) {
            case "ArrowLeft": this.ship.rot = 0; break;
            case "ArrowRight": this.ship.rot = 0; break;
            case "ArrowUp": this.ship.thrusting = false; break;
            case " ": this.ship.canShoot = true; break;
        }
    }

    shootLaser() {
        // Create laser object
        const maxLasers = this.activePowerup === 'rapid' ? this.LASER_MAX * 2 : this.LASER_MAX;

        if (this.ship.canShoot && this.ship.lasers.length < maxLasers) {
            if (this.activePowerup === 'triple') {
                // Triple shot - center, left, right
                const angles = [0, -0.2, 0.2];
                angles.forEach(offset => {
                    const angle = this.ship.a + offset;
                    this.ship.lasers.push({
                        x: this.ship.x + 4 / 3 * this.ship.r * Math.cos(angle),
                        y: this.ship.y - 4 / 3 * this.ship.r * Math.sin(angle),
                        xv: this.LASER_SPD * Math.cos(angle) / this.FPS,
                        yv: -this.LASER_SPD * Math.sin(angle) / this.FPS,
                        dist: 0
                    });
                });
            } else {
                // Single shot
                this.ship.lasers.push({
                    x: this.ship.x + 4 / 3 * this.ship.r * Math.cos(this.ship.a),
                    y: this.ship.y - 4 / 3 * this.ship.r * Math.sin(this.ship.a),
                    xv: this.LASER_SPD * Math.cos(this.ship.a) / this.FPS,
                    yv: -this.LASER_SPD * Math.sin(this.ship.a) / this.FPS,
                    dist: 0
                });
            }
            this.playSound('click');
        }

        // Rapid fire allows immediate shooting
        if (this.activePowerup !== 'rapid') {
            this.ship.canShoot = false;
        }
    }

    update() {
        const { width, height } = this.canvas;

        // Draw Space
        this.ctx.fillStyle = "black";
        this.ctx.fillRect(0, 0, width, height);

        // --- COMBO TIMER ---
        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer === 0) {
                this.combo = 0;
                this.multiplier = 1;
                this.updateHUD();
            }
        }

        // --- POWERUP TIMER ---
        if (this.activePowerup && this.powerupTimeLeft > 0) {
            this.powerupTimeLeft--;
            if (this.powerupTimeLeft === 0) {
                this.activePowerup = null;
                this.ship.hasShield = false;
            }
            this.updateHUD();
        }

        // --- UFO SPAWN TIMER ---
        if (!this.ship.dead && this.level > 0) {
            this.ufoSpawnTimer--;
            if (this.ufoSpawnTimer <= 0 && this.ufos.length === 0) {
                this.spawnUFO();
                this.ufoSpawnTimer = this.UFO_SPAWN_INTERVAL * this.FPS;
            }
        }

        // --- PARTICLES ---
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;

            if (p.life <= 0) {
                this.particles.splice(i, 1);
            } else {
                this.ctx.fillStyle = `rgba(${p.color}, ${p.life / p.maxLife})`;
                this.ctx.fillRect(p.x, p.y, p.size, p.size);
            }
        }

        // --- POWER-UPS ---
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const pu = this.powerups[i];
            pu.y += pu.vy;
            pu.life--;

            // Remove if expired
            if (pu.life <= 0) {
                this.powerups.splice(i, 1);
                continue;
            }

            // Draw power-up
            const pulse = 0.8 + 0.2 * Math.sin(pu.life / 10);
            this.ctx.save();
            this.ctx.globalAlpha = pulse;
            this.ctx.fillStyle = pu.color;
            this.ctx.strokeStyle = "white";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(pu.x, pu.y, 10, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.fillStyle = "white";
            this.ctx.font = "bold 16px monospace";
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";
            this.ctx.fillText(pu.symbol, pu.x, pu.y);
            this.ctx.restore();

            // Collision with ship
            if (!this.ship.dead && this.distBetweenPoints(this.ship.x, this.ship.y, pu.x, pu.y) < this.ship.r + 10) {
                this.collectPowerup(pu.type);
                this.powerups.splice(i, 1);
                this.playSound('collect');
            }
        }

        // --- UFOs ---
        for (let i = this.ufos.length - 1; i >= 0; i--) {
            const ufo = this.ufos[i];
            ufo.x += ufo.vx;
            ufo.y += ufo.vy;
            ufo.shootTimer--;

            // Shoot at player
            if (ufo.shootTimer <= 0) {
                const angle = Math.atan2(this.ship.y - ufo.y, this.ship.x - ufo.x);
                const inaccuracy = (Math.random() - 0.5) * 0.5; // Make UFO shots imperfect
                this.ufoLasers.push({
                    x: ufo.x,
                    y: ufo.y,
                    vx: Math.cos(angle + inaccuracy) * 3,
                    vy: Math.sin(angle + inaccuracy) * 3,
                    life: 120
                });
                ufo.shootTimer = this.UFO_SHOOT_INTERVAL * this.FPS;
            }

            // Bounce off edges
            if (ufo.x < ufo.r || ufo.x > width - ufo.r) ufo.vx *= -1;
            if (ufo.y < ufo.r || ufo.y > height - ufo.r) ufo.vy *= -1;

            // Draw UFO
            this.ctx.strokeStyle = "#0f0";
            this.ctx.fillStyle = "#0a0";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(ufo.x, ufo.y, ufo.r, 0, Math.PI, true);
            this.ctx.lineTo(ufo.x + ufo.r * 1.5, ufo.y);
            this.ctx.lineTo(ufo.x - ufo.r * 1.5, ufo.y);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.arc(ufo.x, ufo.y - ufo.r / 2, ufo.r / 2, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        }

        // --- UFO LASERS ---
        for (let i = this.ufoLasers.length - 1; i >= 0; i--) {
            const laser = this.ufoLasers[i];
            laser.x += laser.vx;
            laser.y += laser.vy;
            laser.life--;

            if (laser.life <= 0) {
                this.ufoLasers.splice(i, 1);
                continue;
            }

            // Draw UFO laser
            this.ctx.fillStyle = "#0f0";
            this.ctx.beginPath();
            this.ctx.arc(laser.x, laser.y, 3, 0, Math.PI * 2);
            this.ctx.fill();

            // Hit ship
            if (!this.ship.dead && this.distBetweenPoints(laser.x, laser.y, this.ship.x, this.ship.y) < this.ship.r) {
                this.ufoLasers.splice(i, 1);
                if (this.ship.hasShield) {
                    this.createExplosion(laser.x, laser.y, 5, "0,255,255");
                } else {
                    this.explodeShip();
                }
            }
        }

        // --- SHIP LOGIC ---
        if (!this.ship.dead) {
            // Move ship
            this.ship.x += this.ship.thrust.x;
            this.ship.y += this.ship.thrust.y;

            // Handle thrust
            if (this.ship.thrusting) {
                this.ship.thrust.x += this.SHIP_THRUST * Math.cos(this.ship.a) / this.FPS;
                this.ship.thrust.y -= this.SHIP_THRUST * Math.sin(this.ship.a) / this.FPS;

                // Draw thrust flame with particles
                if (Math.random() < 0.5) {
                    this.particles.push({
                        x: this.ship.x - this.ship.r * Math.cos(this.ship.a),
                        y: this.ship.y + this.ship.r * Math.sin(this.ship.a),
                        vx: (Math.random() - 0.5) * 2,
                        vy: (Math.random() - 0.5) * 2,
                        life: 20,
                        maxLife: 20,
                        size: 2,
                        color: Math.random() < 0.5 ? "255,100,0" : "255,200,0"
                    });
                }

                // Draw thrust flame
                this.ctx.fillStyle = "red";
                this.ctx.strokeStyle = "yellow";
                this.ctx.lineWidth = this.SHIP_SIZE / 10;
                this.ctx.beginPath();
                this.ctx.moveTo(
                    this.ship.x - this.ship.r * (2 / 3 * Math.cos(this.ship.a) + 0.5 * Math.sin(this.ship.a)),
                    this.ship.y + this.ship.r * (2 / 3 * Math.sin(this.ship.a) - 0.5 * Math.cos(this.ship.a))
                );
                this.ctx.lineTo(
                    this.ship.x - this.ship.r * 5 / 3 * Math.cos(this.ship.a),
                    this.ship.y + this.ship.r * 5 / 3 * Math.sin(this.ship.a)
                );
                this.ctx.lineTo(
                    this.ship.x - this.ship.r * (2 / 3 * Math.cos(this.ship.a) - 0.5 * Math.sin(this.ship.a)),
                    this.ship.y + this.ship.r * (2 / 3 * Math.sin(this.ship.a) + 0.5 * Math.cos(this.ship.a))
                );
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.stroke();
            } else {
                // Apply friction
                this.ship.thrust.x -= this.FRICTION * this.ship.thrust.x / this.FPS;
                this.ship.thrust.y -= this.FRICTION * this.ship.thrust.y / this.FPS;
            }

            // Draw shield if active
            if (this.ship.hasShield) {
                const pulse = 0.3 + 0.2 * Math.sin(Date.now() / 100);
                this.ctx.strokeStyle = `rgba(0, 255, 255, ${pulse})`;
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.arc(this.ship.x, this.ship.y, this.ship.r * 2, 0, Math.PI * 2);
                this.ctx.stroke();
            }

            // Handle invulnerability blink
            if (this.ship.blinkNum > 0) {
                this.ship.blinkTime--;
                if (this.ship.blinkTime === 0) {
                    this.ship.blinkTime = Math.ceil(this.SHIP_BLINK_DUR * this.FPS);
                    this.ship.blinkNum--;
                }
            }

            // Draw triangular ship
            if (this.ship.blinkNum === 0 || this.ship.blinkNum % 2 === 0) {
                this.ctx.strokeStyle = this.activePowerup ? this.getPowerupColor() : "white";
                this.ctx.lineWidth = this.SHIP_SIZE / 20;
                this.ctx.beginPath();
                this.ctx.moveTo(
                    this.ship.x + 4 / 3 * this.ship.r * Math.cos(this.ship.a),
                    this.ship.y - 4 / 3 * this.ship.r * Math.sin(this.ship.a)
                );
                this.ctx.lineTo(
                    this.ship.x - this.ship.r * (2 / 3 * Math.cos(this.ship.a) + Math.sin(this.ship.a)),
                    this.ship.y + this.ship.r * (2 / 3 * Math.sin(this.ship.a) - Math.cos(this.ship.a))
                );
                this.ctx.lineTo(
                    this.ship.x - this.ship.r * (2 / 3 * Math.cos(this.ship.a) - Math.sin(this.ship.a)),
                    this.ship.y + this.ship.r * (2 / 3 * Math.sin(this.ship.a) + Math.cos(this.ship.a))
                );
                this.ctx.closePath();
                this.ctx.stroke();
            }

            // Rotate ship
            this.ship.a += this.ship.rot;

            // Screen wrapping - keep within visible bounds
            if (this.ship.x < 0) this.ship.x = width;
            else if (this.ship.x > width) this.ship.x = 0;
            if (this.ship.y < 0) this.ship.y = height;
            else if (this.ship.y > height) this.ship.y = 0;
        }

        // --- ASTEROIDS LOGIC ---
        this.ctx.lineWidth = this.SHIP_SIZE / 20;
        this.ctx.strokeStyle = "slategrey";
        for (let i = 0; i < this.roids.length; i++) {
            const roid = this.roids[i];

            // Draw asteroid
            this.ctx.beginPath();
            for (let j = 0; j < roid.vert; j++) {
                this.ctx.lineTo(
                    roid.x + roid.r * roid.offs[j] * Math.cos(roid.a + j * Math.PI * 2 / roid.vert),
                    roid.y + roid.r * roid.offs[j] * Math.sin(roid.a + j * Math.PI * 2 / roid.vert)
                );
            }
            this.ctx.closePath();
            this.ctx.stroke();

            // Rotate asteroid
            roid.a += roid.rotSpeed;

            // Move asteroid
            roid.x += roid.xv;
            roid.y += roid.yv;

            // Handle edge of screen - keep within visible bounds
            if (roid.x < 0) roid.x = width;
            else if (roid.x > width) roid.x = 0;
            if (roid.y < 0) roid.y = height;
            else if (roid.y > height) roid.y = 0;
        }

        // --- LASER LOGIC ---
        for (let i = this.ship.lasers.length - 1; i >= 0; i--) {
            const laser = this.ship.lasers[i];

            // Draw laser
            this.ctx.fillStyle = this.activePowerup === 'triple' ? "#ff0" : "salmon";
            this.ctx.beginPath();
            this.ctx.arc(laser.x, laser.y, this.SHIP_SIZE / 15, 0, Math.PI * 2, false);
            this.ctx.fill();

            // Move laser
            laser.x += laser.xv;
            laser.y += laser.yv;

            // Handle edge of screen
            if (laser.x < 0) laser.x = width;
            else if (laser.x > width) laser.x = 0;
            if (laser.y < 0) laser.y = height;
            else if (laser.y > height) laser.y = 0;

            // Calculate distance travelled
            laser.dist += Math.sqrt(Math.pow(laser.xv, 2) + Math.pow(laser.yv, 2));

            // Kill laser after distance
            if (laser.dist > width * this.LASER_DIST) {
                this.ship.lasers.splice(i, 1);
                continue;
            }

            // Detect laser hits on asteroids
            let hit = false;
            for (let j = this.roids.length - 1; j >= 0; j--) {
                if (this.distBetweenPoints(laser.x, laser.y, this.roids[j].x, this.roids[j].y) < this.roids[j].r) {
                    this.ship.lasers.splice(i, 1);
                    hit = true;
                    this.destroyAsteroid(j);
                    break;
                }
            }
            if (hit) continue;

            // Detect laser hits on UFOs
            for (let j = this.ufos.length - 1; j >= 0; j--) {
                if (this.distBetweenPoints(laser.x, laser.y, this.ufos[j].x, this.ufos[j].y) < this.ufos[j].r) {
                    this.ship.lasers.splice(i, 1);
                    this.destroyUFO(j);
                    break;
                }
            }
        }

        // --- COLLISION LOGIC (Ship vs Asteroid) ---
        if (!this.ship.dead && this.ship.blinkNum === 0) {
            for (let i = 0; i < this.roids.length; i++) {
                if (this.distBetweenPoints(this.ship.x, this.ship.y, this.roids[i].x, this.roids[i].y) < this.ship.r + this.roids[i].r) {
                    if (this.ship.hasShield) {
                        const roidX = this.roids[i].x;
                        const roidY = this.roids[i].y;
                        this.destroyAsteroid(i);
                        this.createExplosion(roidX, roidY, 20, "0,255,255");
                    } else {
                        this.explodeShip();
                        this.destroyAsteroid(i);
                    }
                    break;
                }
            }

            // Ship vs UFO
            for (let i = 0; i < this.ufos.length; i++) {
                if (this.distBetweenPoints(this.ship.x, this.ship.y, this.ufos[i].x, this.ufos[i].y) < this.ship.r + this.ufos[i].r) {
                    if (this.ship.hasShield) {
                        this.destroyUFO(i);
                    } else {
                        this.explodeShip();
                        this.destroyUFO(i);
                    }
                    break;
                }
            }
        }

        // --- LEVEL LOGIC ---
        if (this.roids.length === 0 && this.ufos.length === 0) {
            this.newLevel();
        }

        // --- TEXT LOGIC ---
        if (this.textAlpha >= 0) {
            this.ctx.fillStyle = `rgba(255, 255, 255, ${this.textAlpha})`;
            this.ctx.font = "small-caps 40px 'VT323'";
            this.ctx.textAlign = "center";
            this.ctx.fillText(this.text, width / 2, height * 0.75);
            this.textAlpha -= 0.01;
        }
    }

    destroyAsteroid(index) {
        const { x, y, r } = this.roids[index];

        // Create explosion
        this.createExplosion(x, y, 15, "150,150,150");

        // Split asteroid in two if necessary
        if (r > Math.ceil(this.ROIDS_SIZE / 8)) {
            this.roids.push(this.newAsteroid(x, y, Math.ceil(r / 2)));
            this.roids.push(this.newAsteroid(x, y, Math.ceil(r / 2)));
        }

        // Remove the original
        this.roids.splice(index, 1);

        // Update combo
        this.combo++;
        this.comboTimer = this.COMBO_TIMEOUT * this.FPS;
        if (this.combo >= 3) {
            this.multiplier = Math.floor(this.combo / 3) + 1;
        }

        // Add score (smaller asteroids = more points)
        const baseScore = r < 20 ? 100 : r < 40 ? 50 : 20;
        const points = baseScore * this.multiplier;
        const oldScore = this.score;
        this.score += points;

        this.emitAppEvent('score:updated', {
            score: this.score,
            previousScore: oldScore,
            delta: points,
            reason: 'asteroid_destroyed'
        });

        // Emit asteroid destroyed event
        const size = r >= 40 ? 'large' : r >= 20 ? 'medium' : 'small';
        EventBus.emit('asteroids:asteroid:destroy', {
            size,
            points,
            x,
            y,
            combo: this.combo
        });

        // Emit score change event
        EventBus.emit('game:score', {
            appId: 'asteroids',
            score: this.score,
            delta: points,
            reason: 'asteroid_destroyed'
        });

        // Emit combo event if active
        if (this.combo >= 3) {
            EventBus.emit('asteroids:combo', {
                combo: this.combo,
                multiplier: this.multiplier
            });
        }

        // Chance to spawn power-up
        if (Math.random() < this.POWERUP_CHANCE && this.powerups.length < 2) {
            this.spawnPowerup(x, y);
        }

        this.updateHUD();
        this.playSound('click');
    }

    destroyUFO(index) {
        const { x, y } = this.ufos[index];
        this.createExplosion(x, y, 20, "0,255,0");
        this.ufos.splice(index, 1);

        // UFO worth lots of points!
        const points = 200 * this.multiplier;
        this.score += points;
        this.combo++;
        this.comboTimer = this.COMBO_TIMEOUT * this.FPS;

        // Emit UFO destroyed event
        EventBus.emit('asteroids:ufo:destroy', { points });
        EventBus.emit('game:score', {
            appId: 'asteroids',
            score: this.score,
            delta: points,
            reason: 'ufo_destroyed'
        });

        this.updateHUD();
        this.playSound('hit');
    }

    explodeShip() {
        this.createExplosion(this.ship.x, this.ship.y, 30, "255,255,255");
        this.lives--;
        this.combo = 0;
        this.multiplier = 1;
        this.activePowerup = null;
        this.powerupTimeLeft = 0;

        // Emit ship explode event
        EventBus.emit('asteroids:ship:explode', {
            livesRemaining: this.lives,
            x: this.ship.x,
            y: this.ship.y
        });

        // Emit lives change event
        EventBus.emit('game:lives', {
            appId: 'asteroids',
            lives: this.lives,
            delta: -1
        });

        this.updateHUD();

        if (this.lives === 0) {
            this.ship.dead = true;
            this.text = "GAME OVER";
            this.textAlpha = 1.0;
            this.playSound('gameOver');

            this.emitAppEvent('game:over', {
                score: this.score,
                level: this.level,
                highScore: this.scoreHigh
            });

            // Save high score
            if (this.score > this.scoreHigh) {
                const previousScore = this.scoreHigh;
                this.scoreHigh = this.score;
                StateManager.setState('asteroids_highscore', this.scoreHigh);
                this.text = "NEW HIGH SCORE!";

                // Emit high score event
                EventBus.emit('game:highscore', {
                    appId: 'asteroids',
                    score: this.score,
                    previousScore
                });
            }

            // Emit game over event
            EventBus.emit('game:over', {
                appId: 'asteroids',
                won: false,
                score: this.score,
                stats: { level: this.level }
            });

            this._restartTimer = setTimeout(() => {
                this._restartTimer = null;
                this.newGame();
            }, 3000);
        } else {
            this.playSound('hit');
            this.ship = this.newShip();
        }
    }

    createExplosion(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 30 + Math.random() * 20,
                maxLife: 50,
                size: Math.random() * 3 + 1,
                color: color
            });
        }
    }

    spawnPowerup(x, y) {
        const type = this.POWERUP_TYPES[Math.floor(Math.random() * this.POWERUP_TYPES.length)];
        const powerupInfo = {
            shield: { symbol: 'S', color: '#0ff' },
            triple: { symbol: '3', color: '#ff0' },
            rapid: { symbol: 'R', color: '#f0f' },
            extralife: { symbol: '+', color: '#0f0' }
        };

        this.powerups.push({
            x: x,
            y: y,
            vy: 0.5,
            type: type,
            symbol: powerupInfo[type].symbol,
            color: powerupInfo[type].color,
            life: 300 // 5 seconds
        });

        // Emit powerup spawn event
        EventBus.emit('asteroids:powerup:spawn', { type, x, y });
    }

    collectPowerup(type) {
        // Emit powerup collected event
        EventBus.emit('asteroids:powerup:collect', {
            type,
            duration: type === 'extralife' ? 0 : this.POWERUP_DURATION * 1000
        });

        if (type === 'extralife') {
            this.lives++;
            EventBus.emit('game:lives', {
                appId: 'asteroids',
                lives: this.lives,
                delta: 1
            });
            this.updateHUD();
        } else {
            this.activePowerup = type;
            this.powerupTimeLeft = this.POWERUP_DURATION * this.FPS;
            if (type === 'shield') {
                this.ship.hasShield = true;
            }
        }
    }

    spawnUFO() {
        const side = Math.random() < 0.5 ? 0 : this.canvas.width;
        const y = Math.random() * this.canvas.height;
        const vx = (side === 0 ? 1 : -1) * (this.UFO_SPEED / this.FPS);
        const vy = (Math.random() - 0.5) * (this.UFO_SPEED / this.FPS);

        this.ufos.push({
            x: side,
            y: y,
            vx: vx,
            vy: vy,
            r: this.UFO_SIZE,
            shootTimer: this.UFO_SHOOT_INTERVAL * this.FPS
        });

        // Emit UFO spawn event
        EventBus.emit('asteroids:ufo:spawn', { type: 'standard' });
    }

    getPowerupColor() {
        const colors = {
            shield: '#0ff',
            triple: '#ff0',
            rapid: '#f0f'
        };
        return colors[this.activePowerup] || 'white';
    }

    updateHUD() {
        const scoreEl = this.getElement('#score');
        const highscoreEl = this.getElement('#highscore');
        const livesEl = this.getElement('#lives');
        const levelEl = this.getElement('#level');
        const comboEl = this.getElement('#combo');
        const comboDisplayEl = this.getElement('#comboDisplay');
        const powerupEl = this.getElement('#powerup');
        const powerupTimeEl = this.getElement('#powerupTime');
        const powerupDisplayEl = this.getElement('#powerupDisplay');

        if (scoreEl) scoreEl.textContent = this.score;
        if (highscoreEl) highscoreEl.textContent = this.scoreHigh;
        if (livesEl) livesEl.textContent = this.lives;
        if (levelEl) levelEl.textContent = this.level;

        if (comboEl && comboDisplayEl) {
            if (this.multiplier > 1) {
                comboEl.textContent = this.multiplier;
                comboDisplayEl.style.display = 'block';
            } else {
                comboDisplayEl.style.display = 'none';
            }
        }

        if (powerupEl && powerupTimeEl && powerupDisplayEl) {
            if (this.activePowerup) {
                const powerupNames = {
                    shield: 'SHIELD',
                    triple: 'TRIPLE',
                    rapid: 'RAPID'
                };
                powerupEl.textContent = powerupNames[this.activePowerup] || this.activePowerup.toUpperCase();
                powerupTimeEl.textContent = Math.ceil(this.powerupTimeLeft / this.FPS);
                powerupDisplayEl.style.display = 'block';
            } else {
                powerupDisplayEl.style.display = 'none';
            }
        }
    }
}

export default Asteroids;