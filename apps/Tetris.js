/**
 * Tetris - Classic block-stacking puzzle game
 * Vibrant neon arcade aesthetic with CRT scanlines, scriptable via EventBus commands.
 */

import AppBase from './AppBase.js';
import StorageManager from '../core/StorageManager.js';
import EventBus from '../core/EventBus.js';

// ─── Piece Definitions ───────────────────────────────────────
const PIECES = {
    I: { color: '#00FFFF', blocks: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
    O: { color: '#FFFF00', blocks: [[1,1],[1,1]] },
    T: { color: '#AA00FF', blocks: [[0,1,0],[1,1,1],[0,0,0]] },
    S: { color: '#00FF00', blocks: [[0,1,1],[1,1,0],[0,0,0]] },
    Z: { color: '#FF0000', blocks: [[1,1,0],[0,1,1],[0,0,0]] },
    J: { color: '#0066FF', blocks: [[1,0,0],[1,1,1],[0,0,0]] },
    L: { color: '#FF8800', blocks: [[0,0,1],[1,1,1],[0,0,0]] }
};
const PIECE_NAMES = Object.keys(PIECES);

// ─── Constants ───────────────────────────────────────────────
const GHOST_ALPHA = 0.2;
const COLS = 10;
const ROWS = 20;
const CELL = 20;         // px per cell on the main board
const PREVIEW_CELL = 14; // px per cell in hold/next preview canvases

// Scoring (NES-style with combo bonus)
const LINE_SCORES   = [0, 100, 300, 500, 800];
const SOFT_DROP_PTS  = 1;
const HARD_DROP_PTS  = 2;
const COMBO_BONUS    = 50;  // per combo step

// Lock delay
const LOCK_DELAY_MS     = 500;
const LOCK_RESET_LIMIT  = 15;

// Speed curve (ms per drop, indexed by level-1)
const SPEEDS = [
    800, 720, 630, 550, 470, 380, 300, 220, 140, 100,
     80,  80,  80,  70,  70,  70,  50,  50,  50,  30
];

// ─── Particles ───────────────────────────────────────────────
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = -(Math.random() * 3 + 1);
        this.life = 1;
        this.decay = 0.02 + Math.random() * 0.02;
        this.size = 2 + Math.random() * 3;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.08;
        this.life -= this.decay;
    }
    draw(ctx) {
        ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// ─── Score Pop ───────────────────────────────────────────────
class ScorePop {
    constructor(text, x, y, color = '#FFF', size = 14) {
        this.text = text;
        this.x = x;
        this.y = y;
        this.color = color;
        this.size = size;
        this.life = 1;
        this.decay = 0.016;
        this.scale = 1.3; // starts big, settles to 1
    }
    update() {
        this.y -= 0.8;
        this.life -= this.decay;
        if (this.scale > 1) this.scale *= 0.96;
    }
    draw(ctx) {
        const alpha = Math.max(0, this.life);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8 * alpha;
        const sz = Math.round(this.size * Math.max(this.scale, 1));
        ctx.font = `bold ${sz}px 'Courier New', monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(this.text, this.x, this.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }
}


// ═════════════════════════════════════════════════════════════
class Tetris extends AppBase {
    constructor() {
        super({
            id: 'tetris',
            name: 'Tetris',
            icon: '🧱',
            width: 680,
            height: 620,
            minWidth: 520,
            minHeight: 560,
            resizable: true,
            singleton: true,
            category: 'games'
        });

        // Board
        this.board = [];
        this.currentPiece = null;
        this.nextPieces = [];
        this.holdPiece = null;
        this.holdUsed = false;      // can only hold once per piece
        this.bag = [];              // 7-bag randomizer

        // Score / stats
        this.score = 0;
        this.lines = 0;
        this.level = 1;
        this.startLevel = 1;        // user-selected starting level (persisted)
        this.highScore = 0;
        this.combo = -1;            // -1 = no active combo
        this.backToBack = 0;        // consecutive "difficult" clears (Tetris or T-spin)
        this.lastClearLabel = '';   // label of most recent line clear, for combo panel
        this.stats = { singles: 0, doubles: 0, triples: 0, tetrises: 0, tspins: 0 };

        // T-spin tracking
        this.lastMoveWasRotation = false;

        // Timing
        this.gameLoopId = null;
        this.lastDrop = 0;
        this.isGameRunning = false;
        this.isPaused = false;
        this.isGameOver = false;

        // Lock delay
        this.lockTimer = 0;
        this.lockResets = 0;
        this.isLocking = false;

        // Title screen
        this.blinkInterval = null;
        this.showText = true;
        this.titleAnimFrame = 0;

        // Line clear animation
        this.clearingLines = [];
        this.clearFlashCount = 0;
        this.clearAnimId = null;

        // DAS
        this.dasKeys = {};
        this.dasDelay = 170;
        this.dasRate = 50;

        // Visual effects
        this.particles = [];
        this.scorePops = [];
        this.shakeAmount = 0;
        this.shakeDecay = 0.85;
        this.levelFlash = 0; // white board flash on level-up

        // Scripting
        this.registerCommands();
        this.registerQueries();
    }

    // ═════════════════════════════════════════════════════════
    //  SCRIPTING API
    // ═════════════════════════════════════════════════════════

    registerCommands() {
        this.registerCommand('start', () => {
            // Match the UI buttons: after a game over isGameRunning is
            // still true, so the old condition made restart a silent no-op.
            if (!this.isGameRunning || this.isGameOver) this.startGame();
            return { success: true };
        });
        this.registerCommand('pause', () => {
            if (this.isGameRunning && !this.isPaused && !this.isGameOver) this.togglePause();
            return { success: true, isPaused: this.isPaused };
        });
        this.registerCommand('resume', () => {
            if (this.isGameRunning && this.isPaused) this.togglePause();
            return { success: true, isPaused: this.isPaused };
        });
        this.registerCommand('reset', () => {
            this.resetToTitle();
            return { success: true };
        });
        this.registerCommand('move', (payload) => {
            if (!payload || !payload.direction) return { success: false, error: 'Provide direction: left/right/down' };
            if (!this.isGameRunning || this.isPaused || this.isGameOver) return { success: false, error: 'Game not active' };
            const map = { left: () => this.movePiece(-1, 0), right: () => this.movePiece(1, 0), down: () => this.softDrop() };
            const fn = map[payload.direction.toLowerCase()];
            if (!fn) return { success: false, error: 'Invalid direction' };
            fn();
            return { success: true };
        });
        this.registerCommand('rotate', () => {
            if (!this.isGameRunning || this.isPaused || this.isGameOver) return { success: false, error: 'Game not active' };
            this.rotatePiece();
            return { success: true };
        });
        this.registerCommand('drop', () => {
            if (!this.isGameRunning || this.isPaused || this.isGameOver) return { success: false, error: 'Game not active' };
            this.hardDrop();
            return { success: true };
        });
        this.registerCommand('hold', () => {
            if (!this.isGameRunning || this.isPaused || this.isGameOver) return { success: false, error: 'Game not active' };
            this.holdCurrentPiece();
            return { success: true };
        });
    }

    registerQueries() {
        this.registerQuery('getState', () => ({
            score: this.score,
            lines: this.lines,
            level: this.level,
            highScore: this.highScore,
            combo: this.combo,
            stats: { ...this.stats },
            isGameRunning: this.isGameRunning,
            isPaused: this.isPaused,
            isGameOver: this.isGameOver
        }));
    }

    // ═════════════════════════════════════════════════════════
    //  LIFECYCLE
    // ═════════════════════════════════════════════════════════

    onOpen() {
        this.highScore = StorageManager.get('tetrisHigh') || 0;
        this.startLevel = Math.max(1, Math.min(20, StorageManager.get('tetrisStartLevel') || 1));

        return `
            <div class="tetris-app">
                <div class="tetris-topbar">
                    <div class="tetris-title-block">
                        <div class="tetris-title">TETRIS.EXE</div>
                        <div class="tetris-subtitle">IlluminatOS! Arcade Edition</div>
                    </div>
                    <div class="tetris-toolbar">
                        <div class="tetris-level-select" data-role="level-select">
                            <span class="tetris-toolbar-label">START LV</span>
                            <button type="button" class="tetris-step-btn" data-action="lvl-down" aria-label="Decrease starting level">&lsaquo;</button>
                            <span class="tetris-step-value" id="t-startlvl">${this.startLevel}</span>
                            <button type="button" class="tetris-step-btn" data-action="lvl-up" aria-label="Increase starting level">&rsaquo;</button>
                        </div>
                        <button type="button" class="tetris-action-btn tetris-action-primary" data-action="start" id="btnStart">
                            <span class="tetris-action-icon">&#9654;</span>
                            <span class="tetris-action-text">Start</span>
                        </button>
                        <button type="button" class="tetris-action-btn" data-action="pause" id="btnPause" disabled>
                            <span class="tetris-action-icon">&#10074;&#10074;</span>
                            <span class="tetris-action-text">Pause</span>
                        </button>
                        <button type="button" class="tetris-action-btn" data-action="reset" id="btnReset" disabled>
                            <span class="tetris-action-icon">&#8634;</span>
                            <span class="tetris-action-text">Reset</span>
                        </button>
                    </div>
                </div>

                <div class="tetris-main">
                    <div class="tetris-left">
                        <div class="tetris-board-wrapper">
                            <div class="tetris-bezel">
                                <div class="tetris-viewport">
                                    <canvas id="tetrisCanvas" width="${COLS * CELL}" height="${ROWS * CELL}"></canvas>
                                    <div class="tetris-scanlines"></div>
                                    <div id="tetrisOverlay" class="tetris-overlay hidden">
                                        <div class="tetris-overlay-label" id="t-overlay-label">GAME OVER</div>
                                        <div class="tetris-overlay-hi hidden" id="t-newhi">&#9733; NEW HIGH SCORE &#9733;</div>
                                        <div class="tetris-overlay-finalscore">
                                            <span class="tetris-overlay-finalvalue" id="t-final">0</span>
                                            <span class="tetris-overlay-finallabel">FINAL SCORE</span>
                                        </div>
                                        <div class="tetris-overlay-grid">
                                            <div class="tetris-overlay-stat"><span class="tetris-overlay-statvalue" id="t-end-level">1</span><span class="tetris-overlay-statlabel">Level</span></div>
                                            <div class="tetris-overlay-stat"><span class="tetris-overlay-statvalue" id="t-end-lines">0</span><span class="tetris-overlay-statlabel">Lines</span></div>
                                            <div class="tetris-overlay-stat"><span class="tetris-overlay-statvalue" id="t-end-singles">0</span><span class="tetris-overlay-statlabel">Singles</span></div>
                                            <div class="tetris-overlay-stat"><span class="tetris-overlay-statvalue" id="t-end-doubles">0</span><span class="tetris-overlay-statlabel">Doubles</span></div>
                                            <div class="tetris-overlay-stat"><span class="tetris-overlay-statvalue" id="t-end-triples">0</span><span class="tetris-overlay-statlabel">Triples</span></div>
                                            <div class="tetris-overlay-stat tetris-overlay-stat-hi"><span class="tetris-overlay-statvalue" id="t-end-tetrises">0</span><span class="tetris-overlay-statlabel">Tetrises</span></div>
                                        </div>
                                        <div class="tetris-overlay-actions">
                                            <button type="button" class="tetris-action-btn tetris-action-primary" id="btnRetry">
                                                <span class="tetris-action-icon">&#9654;</span>
                                                <span class="tetris-action-text">Play Again</span>
                                            </button>
                                            <button type="button" class="tetris-action-btn" id="btnTitle">
                                                <span class="tetris-action-icon">&#9664;</span>
                                                <span class="tetris-action-text">Title</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="tetris-sidebar">
                        <div class="tetris-row">
                            <div class="tetris-panel tetris-preview-panel">
                                <span class="tetris-label">HOLD</span>
                                <div class="tetris-preview-bezel">
                                    <canvas id="holdCanvas" width="${4 * PREVIEW_CELL}" height="${3 * PREVIEW_CELL}"></canvas>
                                </div>
                            </div>
                            <div class="tetris-panel tetris-preview-panel">
                                <span class="tetris-label">NEXT</span>
                                <div class="tetris-preview-bezel">
                                    <canvas id="nextCanvas" width="${4 * PREVIEW_CELL}" height="${3 * PREVIEW_CELL}"></canvas>
                                </div>
                            </div>
                        </div>

                        <div class="tetris-panel tetris-info-panel tetris-score-panel">
                            <span class="tetris-label">SCORE</span>
                            <span class="tetris-value tetris-score-value" id="t-score">0</span>
                            <span class="tetris-sublabel">HI &middot; <span id="t-hi">${this.formatNum(this.highScore)}</span></span>
                        </div>

                        <div class="tetris-row">
                            <div class="tetris-panel tetris-info-panel tetris-info-small">
                                <span class="tetris-label">LEVEL</span>
                                <span class="tetris-value" id="t-level">${this.startLevel}</span>
                            </div>
                            <div class="tetris-panel tetris-info-panel tetris-info-small">
                                <span class="tetris-label">LINES</span>
                                <span class="tetris-value" id="t-lines">0</span>
                            </div>
                        </div>

                        <div class="tetris-panel tetris-stats-panel">
                            <span class="tetris-label">STATS</span>
                            <div class="tetris-stats-grid">
                                <div class="tetris-stat-row"><span class="tetris-stat-name">Single</span><span class="tetris-stat-num" id="t-stat-singles">0</span></div>
                                <div class="tetris-stat-row"><span class="tetris-stat-name">Double</span><span class="tetris-stat-num" id="t-stat-doubles">0</span></div>
                                <div class="tetris-stat-row"><span class="tetris-stat-name">Triple</span><span class="tetris-stat-num" id="t-stat-triples">0</span></div>
                                <div class="tetris-stat-row tetris-stat-row-hi"><span class="tetris-stat-name">Tetris</span><span class="tetris-stat-num" id="t-stat-tetrises">0</span></div>
                            </div>
                        </div>

                        <div class="tetris-panel tetris-combo-panel" id="t-combo-panel" data-active="false">
                            <span class="tetris-combo-text" id="t-combo-text">&mdash;</span>
                            <span class="tetris-combo-sub" id="t-combo-sub">No combo</span>
                        </div>

                        <div class="tetris-panel tetris-help-panel">
                            <span class="tetris-label">CONTROLS</span>
                            <div class="tetris-help-list">
                                <span><kbd>&larr;</kbd><kbd>&rarr;</kbd> Move</span>
                                <span><kbd>&uarr;</kbd> Rotate</span>
                                <span><kbd>&darr;</kbd> Soft drop</span>
                                <span><kbd>Space</kbd> Hard drop</span>
                                <span><kbd>C</kbd> Hold</span>
                                <span><kbd>P</kbd>/<kbd>Esc</kbd> Pause</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        this.canvas = this.getElement('#tetrisCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.nextCanvas = this.getElement('#nextCanvas');
        this.nextCtx = this.nextCanvas.getContext('2d');
        this.holdCanvas = this.getElement('#holdCanvas');
        this.holdCtx = this.holdCanvas.getContext('2d');

        // Toolbar buttons
        this.addHandler(this.getElement('#btnStart'), 'click', () => {
            if (!this.isGameRunning || this.isGameOver) this.startGame();
        });
        this.addHandler(this.getElement('#btnPause'), 'click', () => this.togglePause());
        this.addHandler(this.getElement('#btnReset'), 'click', () => this.confirmReset());

        // Level selector
        this.addHandler(this.getElement('[data-action="lvl-down"]'), 'click', () => this.adjustStartLevel(-1));
        this.addHandler(this.getElement('[data-action="lvl-up"]'), 'click', () => this.adjustStartLevel(1));

        // Game-over overlay buttons
        this.addHandler(this.getElement('#btnRetry'), 'click', () => this.startGame());
        this.addHandler(this.getElement('#btnTitle'), 'click', () => this.resetToTitle());

        // Click on the canvas viewport to start from title screen
        this.addHandler(this.getElement('.tetris-viewport'), 'click', () => {
            if (!this.isGameRunning && !this.isGameOver) this.startGame();
        });

        this.addHandler(document, 'keydown', (e) => {
            if (!this.isFocused()) return;
            this.handleKeyDown(e);
        });
        this.addHandler(document, 'keyup', (e) => {
            if (!this.isFocused()) return;
            this.handleKeyUp(e);
        });

        this.resetToTitle();
    }

    onClose() {
        this.stopLoop();
        this.stopDAS();
        if (this.blinkInterval) clearInterval(this.blinkInterval);
        if (this.clearAnimId) clearTimeout(this.clearAnimId);
    }

    onBlur() {
        if (this.isGameRunning && !this.isPaused && !this.isGameOver) {
            this.togglePause();
        }
    }

    // ═════════════════════════════════════════════════════════
    //  7-BAG RANDOMIZER
    // ═════════════════════════════════════════════════════════

    fillBag() {
        const bag = [...PIECE_NAMES];
        // Fisher-Yates shuffle
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        this.bag = bag;
    }

    nextFromBag() {
        if (this.bag.length === 0) this.fillBag();
        const name = this.bag.pop();
        const def = PIECES[name];
        return {
            name,
            color: def.color,
            blocks: def.blocks.map(row => [...row]),
            x: 0,
            y: 0
        };
    }

    // ═════════════════════════════════════════════════════════
    //  GAME STATES
    // ═════════════════════════════════════════════════════════

    resetToTitle() {
        this.stopLoop();
        this.stopDAS();
        if (this.clearAnimId) { clearTimeout(this.clearAnimId); this.clearAnimId = null; }
        this.isGameRunning = false;
        this.isGameOver = false;
        this.isPaused = false;
        this.score = 0;
        this.lines = 0;
        this.level = this.startLevel || 1;
        this.combo = -1;
        this.backToBack = 0;
        this.lastClearLabel = '';
        this.stats = { singles: 0, doubles: 0, triples: 0, tetrises: 0, tspins: 0 };
        this.clearingLines = [];
        this.particles = [];
        this.scorePops = [];
        this.shakeAmount = 0;
        this.levelFlash = 0;
        this.holdPiece = null;
        this.holdUsed = false;
        this.bag = [];
        this.nextPieces = [];
        this.lastMoveWasRotation = false;
        this.updateUI();
        this.updateToolbar();

        const overlay = this.getElement('#tetrisOverlay');
        if (overlay) overlay.classList.add('hidden');

        this.titleAnimFrame = 0;
        if (this.blinkInterval) clearInterval(this.blinkInterval);
        this.blinkInterval = setInterval(() => {
            this.showText = !this.showText;
            this.titleAnimFrame++;
            this.drawTitleScreen();
        }, 500);
        this.drawTitleScreen();
        this.drawHoldPiece();
        this.clearPreviewCanvas(this.nextCtx, this.nextCanvas);
    }

    confirmReset() {
        if (this.isGameRunning && !this.isGameOver) {
            const wasPaused = this.isPaused;
            if (!wasPaused) this.togglePause();
            const ok = window.confirm('Abandon current game and return to title?');
            if (ok) {
                this.resetToTitle();
            } else if (!wasPaused && this.isPaused) {
                this.togglePause();
            }
        } else {
            this.resetToTitle();
        }
    }

    adjustStartLevel(delta) {
        if (this.isGameRunning && !this.isGameOver) return;
        this.startLevel = Math.max(1, Math.min(20, this.startLevel + delta));
        StorageManager.set('tetrisStartLevel', this.startLevel);
        const sel = this.getElement('#t-startlvl');
        if (sel) sel.innerText = this.startLevel;
        this.level = this.startLevel;
        this.updateUI();
        this.playSound('click');
    }

    updateToolbar() {
        const startBtn = this.getElement('#btnStart');
        const pauseBtn = this.getElement('#btnPause');
        const resetBtn = this.getElement('#btnReset');
        const lvlSel   = this.getElement('[data-role="level-select"]');
        if (!startBtn || !pauseBtn || !resetBtn) return;

        const playing = this.isGameRunning && !this.isGameOver;
        startBtn.disabled = playing;
        startBtn.classList.toggle('tetris-action-primary', !playing);
        pauseBtn.disabled = !playing;
        resetBtn.disabled = !this.isGameRunning && !this.isGameOver;

        const pauseIcon = pauseBtn.querySelector('.tetris-action-icon');
        const pauseText = pauseBtn.querySelector('.tetris-action-text');
        if (this.isPaused) {
            if (pauseIcon) pauseIcon.innerText = '▶';   // play triangle
            if (pauseText) pauseText.innerText = 'Resume';
        } else {
            if (pauseIcon) pauseIcon.innerText = '❚❚'; // double pause bars
            if (pauseText) pauseText.innerText = 'Pause';
        }

        if (lvlSel) lvlSel.classList.toggle('tetris-disabled', playing);
    }

    startGame() {
        if (this.blinkInterval) { clearInterval(this.blinkInterval); this.blinkInterval = null; }

        this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        this.score = 0;
        this.lines = 0;
        this.level = this.startLevel || 1;
        this.combo = -1;
        this.backToBack = 0;
        this.lastClearLabel = '';
        this.stats = { singles: 0, doubles: 0, triples: 0, tetrises: 0, tspins: 0 };
        this.isGameRunning = true;
        this.isGameOver = false;
        this.isPaused = false;
        this.clearingLines = [];
        this.particles = [];
        this.scorePops = [];
        this.shakeAmount = 0;
        this.levelFlash = 0;
        this.holdPiece = null;
        this.holdUsed = false;
        this.bag = [];
        this.nextPieces = [];
        this.lastMoveWasRotation = false;

        // Fill preview queue
        for (let i = 0; i < 3; i++) {
            this.nextPieces.push(this.nextFromBag());
        }

        this.spawnPiece();
        this.updateUI();
        this.updateToolbar();
        this.drawNextPieces();
        this.drawHoldPiece();

        const overlay = this.getElement('#tetrisOverlay');
        if (overlay) overlay.classList.add('hidden');

        this.playSound('gameStart');

        this.lastDrop = performance.now();
        this.gameLoop();

        this.emitAppEvent('game:start', { level: this.level });
        EventBus.emit('game:start', { appId: 'tetris', settings: { cols: COLS, rows: ROWS, startLevel: this.startLevel } });
    }

    // ═════════════════════════════════════════════════════════
    //  PIECE MANAGEMENT
    // ═════════════════════════════════════════════════════════

    spawnPiece() {
        this.currentPiece = this.nextPieces.shift();
        this.nextPieces.push(this.nextFromBag());
        this.holdUsed = false;
        this.lastMoveWasRotation = false;

        const piece = this.currentPiece;
        piece.x = Math.floor((COLS - piece.blocks[0].length) / 2);
        piece.y = 0;

        // Reset lock delay state
        this.isLocking = false;
        this.lockTimer = 0;
        this.lockResets = 0;

        if (this.collides(piece.blocks, piece.x, piece.y)) {
            this.gameOverHandler();
        }

        this.drawNextPieces();
    }

    holdCurrentPiece() {
        if (!this.currentPiece || this.holdUsed) return;

        this.holdUsed = true;
        const held = this.holdPiece;
        // Strip position, keep shape
        this.holdPiece = {
            name: this.currentPiece.name,
            color: this.currentPiece.color,
            blocks: PIECES[this.currentPiece.name].blocks.map(r => [...r]),
            x: 0, y: 0
        };

        if (held) {
            this.currentPiece = held;
            this.currentPiece.x = Math.floor((COLS - this.currentPiece.blocks[0].length) / 2);
            this.currentPiece.y = 0;
            this.isLocking = false;
            this.lockTimer = 0;
            this.lockResets = 0;
            // Same top-out rule as spawnPiece(): a swapped-in piece that
            // overlaps locked cells ends the game instead of silently
            // overwriting the board.
            if (this.collides(this.currentPiece.blocks, this.currentPiece.x, this.currentPiece.y)) {
                this.gameOverHandler();
                return;
            }
        } else {
            this.spawnPiece();
        }

        this.lastMoveWasRotation = false;
        this.playSound('click');
        this.drawHoldPiece();
    }

    rotatePiece() {
        if (!this.currentPiece) return;
        const rotated = this.rotateMatrix(this.currentPiece.blocks);

        const kicks = [0, -1, 1, -2, 2];
        for (const kick of kicks) {
            if (!this.collides(rotated, this.currentPiece.x + kick, this.currentPiece.y)) {
                this.currentPiece.blocks = rotated;
                this.currentPiece.x += kick;
                this.lastMoveWasRotation = true;
                this.playSound('click');
                this.resetLockDelay();
                return;
            }
        }
    }

    rotateMatrix(matrix) {
        const size = matrix.length;
        const result = Array.from({ length: size }, () => Array(size).fill(0));
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                result[c][size - 1 - r] = matrix[r][c];
            }
        }
        return result;
    }

    movePiece(dx, dy) {
        if (!this.currentPiece) return false;
        const newX = this.currentPiece.x + dx;
        const newY = this.currentPiece.y + dy;
        if (!this.collides(this.currentPiece.blocks, newX, newY)) {
            this.currentPiece.x = newX;
            this.currentPiece.y = newY;
            this.lastMoveWasRotation = false;
            if (dx !== 0) this.resetLockDelay();
            return true;
        }
        return false;
    }

    softDrop() {
        if (this.movePiece(0, 1)) {
            this.score += SOFT_DROP_PTS;
            this.lastDrop = performance.now();
            return true;
        }
        return false;
    }

    hardDrop() {
        if (!this.currentPiece) return;
        let dropDist = 0;
        while (!this.collides(this.currentPiece.blocks, this.currentPiece.x, this.currentPiece.y + 1)) {
            this.currentPiece.y++;
            dropDist++;
        }
        this.score += dropDist * HARD_DROP_PTS;
        this.shakeAmount = Math.min(dropDist * 0.5, 6);
        this.lastMoveWasRotation = false;
        // lockPiece() will play the 'hit' lock sound
        this.lockPiece();
    }

    getGhostY() {
        if (!this.currentPiece) return 0;
        let ghostY = this.currentPiece.y;
        while (!this.collides(this.currentPiece.blocks, this.currentPiece.x, ghostY + 1)) {
            ghostY++;
        }
        return ghostY;
    }

    // ═════════════════════════════════════════════════════════
    //  LOCK DELAY
    // ═════════════════════════════════════════════════════════

    resetLockDelay() {
        if (this.isLocking && this.lockResets < LOCK_RESET_LIMIT) {
            this.lockTimer = performance.now();
            this.lockResets++;
        }
    }

    checkLock(now) {
        if (!this.currentPiece) return;

        const grounded = this.collides(
            this.currentPiece.blocks,
            this.currentPiece.x,
            this.currentPiece.y + 1
        );

        if (grounded) {
            if (!this.isLocking) {
                this.isLocking = true;
                this.lockTimer = now;
            } else if (now - this.lockTimer >= LOCK_DELAY_MS) {
                this.lockPiece();
            }
        } else {
            this.isLocking = false;
        }
    }

    // ═════════════════════════════════════════════════════════
    //  COLLISION & BOARD
    // ═════════════════════════════════════════════════════════

    collides(blocks, px, py) {
        for (let r = 0; r < blocks.length; r++) {
            for (let c = 0; c < blocks[r].length; c++) {
                if (!blocks[r][c]) continue;
                const bx = px + c;
                const by = py + r;
                if (bx < 0 || bx >= COLS || by >= ROWS) return true;
                if (by < 0) continue;
                if (this.board[by][bx]) return true;
            }
        }
        return false;
    }

    lockPiece() {
        const piece = this.currentPiece;
        if (!piece) return;

        // Detect T-spin BEFORE writing piece to board
        const isTSpin = this.detectTSpin(piece);

        for (let r = 0; r < piece.blocks.length; r++) {
            for (let c = 0; c < piece.blocks[r].length; c++) {
                if (!piece.blocks[r][c]) continue;
                const by = piece.y + r;
                const bx = piece.x + c;
                if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
                    this.board[by][bx] = piece.color;
                }
            }
        }

        // Lock click — quieter, layered sound
        this.playSound('hit');

        // Check completed lines
        const completedRows = [];
        for (let r = 0; r < ROWS; r++) {
            if (this.board[r].every(cell => cell !== 0)) {
                completedRows.push(r);
            }
        }

        if (completedRows.length > 0) {
            this.animateLineClear(completedRows, isTSpin);
        } else if (isTSpin) {
            // T-spin with no lines is still a "difficult" event — small bonus, keep B2B alive
            this.score += 100 * this.level;
            this.stats.tspins++;
            this.scorePops.push(new ScorePop('T-SPIN!', (COLS * CELL) / 2, piece.y * CELL + CELL, '#FF66FF', 14));
            this.lastClearLabel = 'T-Spin';
            this.updateUI();
            this.spawnPiece();
        } else {
            // No lines cleared: break combo
            this.combo = -1;
            this.lastClearLabel = '';
            this.updateUI();
            this.spawnPiece();
        }
    }

    /**
     * Standard 3-corner T-spin detection:
     * - Piece must be a T
     * - Last successful move must have been a rotation
     * - At least 3 of the 4 corners around the T's center cell must be filled
     *   (board cell or wall).
     */
    detectTSpin(piece) {
        if (!piece || piece.name !== 'T') return false;
        if (!this.lastMoveWasRotation) return false;

        // The T piece's 3x3 bounding box has its "center" at offset (1, 1).
        const cx = piece.x + 1;
        const cy = piece.y + 1;
        const corners = [
            [cx - 1, cy - 1],
            [cx + 1, cy - 1],
            [cx - 1, cy + 1],
            [cx + 1, cy + 1],
        ];
        let filled = 0;
        for (const [bx, by] of corners) {
            if (bx < 0 || bx >= COLS || by >= ROWS) { filled++; continue; }
            if (by < 0) continue;
            if (this.board[by][bx]) filled++;
        }
        return filled >= 3;
    }

    animateLineClear(rows, isTSpin = false) {
        this.clearingLines = rows;
        this.clearFlashCount = 0;

        // Spawn particles along the cleared rows
        const particlesPerCell = isTSpin || rows.length >= 4 ? 5 : 3;
        for (const row of rows) {
            for (let c = 0; c < COLS; c++) {
                const color = this.board[row][c] || '#FFF';
                const cx = c * CELL + CELL / 2;
                const cy = row * CELL + CELL / 2;
                for (let i = 0; i < particlesPerCell; i++) {
                    this.particles.push(new Particle(cx, cy, color));
                }
            }
        }

        const flash = () => {
            this.clearFlashCount++;
            this.draw();
            if (this.clearFlashCount < 8) {
                this.clearAnimId = setTimeout(flash, 50);
            } else {
                this.finishLineClear(rows, isTSpin);
            }
        };
        flash();
    }

    finishLineClear(rows, isTSpin = false) {
        this.clearAnimId = null;
        this.clearingLines = [];

        const sorted = [...rows].sort((a, b) => a - b);
        for (const row of sorted) {
            this.board.splice(row, 1);
            this.board.unshift(Array(COLS).fill(0));
        }

        const count = rows.length;
        this.combo++;

        // Determine if this counts as a "difficult" clear (Tetris or T-Spin clear)
        const isDifficult = (count === 4) || isTSpin;

        // T-spin scoring overrides standard line scoring
        const tspinBase = [0, 800, 1200, 1600, 2000];
        const oldScore = this.score;
        let lineScore = isTSpin ? (tspinBase[count] || 0) * this.level
                                : LINE_SCORES[count] * this.level;
        const comboScore = this.combo > 0 ? COMBO_BONUS * this.combo * this.level : 0;

        // Back-to-back: consecutive difficult clears get +50%
        let b2bBonus = 0;
        if (isDifficult && this.backToBack > 0) {
            b2bBonus = Math.floor(lineScore * 0.5);
        }

        // Update B2B counter
        if (isDifficult) this.backToBack++;
        else this.backToBack = 0;

        this.score += lineScore + comboScore + b2bBonus;
        this.lines += count;

        // Stats
        if (count === 1) this.stats.singles++;
        else if (count === 2) this.stats.doubles++;
        else if (count === 3) this.stats.triples++;
        else if (count === 4) this.stats.tetrises++;
        if (isTSpin) this.stats.tspins++;

        // Score pop — label and color reflect type of clear
        const midRow = rows[Math.floor(rows.length / 2)];
        let label, color, size;
        if (isTSpin) {
            const tsLabels = ['', 'T-SPIN SINGLE', 'T-SPIN DOUBLE', 'T-SPIN TRIPLE', 'T-SPIN!!'];
            label = tsLabels[count] || 'T-SPIN';
            color = '#FF66FF';
            size  = 16;
        } else {
            const labels = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
            const colors = ['', '#FFF', '#0FF', '#FF0', '#F0F'];
            const sizes  = [0, 13, 15, 17, 20];
            label = labels[count];
            color = colors[count];
            size  = sizes[count];
        }
        const totalPts = lineScore + comboScore + b2bBonus;
        this.scorePops.push(new ScorePop(
            label + ' +' + totalPts,
            (COLS * CELL) / 2,
            midRow * CELL,
            color,
            size
        ));
        if (b2bBonus > 0) {
            this.scorePops.push(new ScorePop(
                `BACK-TO-BACK x${this.backToBack}`,
                (COLS * CELL) / 2,
                midRow * CELL + 18,
                '#FFD700',
                11
            ));
        }
        if (this.combo > 0) {
            this.scorePops.push(new ScorePop(
                `COMBO x${this.combo}`,
                (COLS * CELL) / 2,
                midRow * CELL + (b2bBonus > 0 ? 32 : 18),
                '#FF8800',
                12
            ));
        }

        this.lastClearLabel = label;

        // Screen shake on multi-line / T-spin clears
        if (count >= 2 || isTSpin) {
            this.shakeAmount = Math.min((count + (isTSpin ? 2 : 0)) * 1.5, 7);
        }

        // Level up: every 10 lines advances one level above the start level
        const advanced = this.startLevel + Math.floor(this.lines / 10);
        if (advanced > this.level) {
            this.level = advanced;
            this.levelFlash = 1;
            this.playSound('levelUp');
            this.emitAppEvent('level:up', { level: this.level });
        }

        this.updateUI();

        // Distinct sound for big clears
        if (count === 4 || isTSpin) {
            this.playSound('collect');
        } else {
            this.playSound('click');
        }

        this.emitAppEvent('lines:cleared', { count, score: this.score, lines: this.lines, tspin: isTSpin });
        EventBus.emit('game:score', {
            appId: 'tetris', score: this.score,
            delta: this.score - oldScore, reason: isTSpin ? 't_spin' : 'lines_cleared'
        });

        this.spawnPiece();
    }

    // ═════════════════════════════════════════════════════════
    //  GAME LOOP
    // ═════════════════════════════════════════════════════════

    getDropInterval() {
        return SPEEDS[Math.min(this.level - 1, SPEEDS.length - 1)];
    }

    gameLoop() {
        if (!this.isGameRunning || this.isGameOver) return;

        if (!this.isPaused && this.clearingLines.length === 0) {
            const now = performance.now();

            // Gravity
            if (now - this.lastDrop >= this.getDropInterval()) {
                this.lastDrop = now;
                if (!this.movePiece(0, 1)) {
                    // Piece grounded — lock delay handles the rest
                }
            }

            // Lock delay check
            this.checkLock(now);

            // Update effects
            this.updateEffects();
            this.draw();
        }

        this.gameLoopId = requestAnimationFrame(() => this.gameLoop());
    }

    stopLoop() {
        if (this.gameLoopId) {
            cancelAnimationFrame(this.gameLoopId);
            this.gameLoopId = null;
        }
    }

    updateEffects() {
        // Particles
        this.particles = this.particles.filter(p => { p.update(); return p.life > 0; });
        // Score pops
        this.scorePops = this.scorePops.filter(s => { s.update(); return s.life > 0; });
        // Screen shake decay
        if (this.shakeAmount > 0.1) {
            this.shakeAmount *= this.shakeDecay;
        } else {
            this.shakeAmount = 0;
        }
        // Level-up flash decay
        if (this.levelFlash > 0) {
            this.levelFlash *= 0.92;
            if (this.levelFlash < 0.01) this.levelFlash = 0;
        }
    }

    // ═════════════════════════════════════════════════════════
    //  INPUT HANDLING (DAS)
    // ═════════════════════════════════════════════════════════

    handleKeyDown(e) {
        if (!this.isOpen) return;

        const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Escape'];
        if (gameKeys.includes(e.key)) e.preventDefault();

        // Game Over → Space/Enter starts a new game; Esc returns to title
        if (this.isGameOver) {
            if (e.key === ' ' || e.key === 'Enter') this.startGame();
            else if (e.key === 'Escape') this.resetToTitle();
            return;
        }

        // Title screen → start
        if (!this.isGameRunning) {
            if (e.key === ' ' || e.key === 'Enter') this.startGame();
            else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') this.adjustStartLevel(1);
            else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') this.adjustStartLevel(-1);
            return;
        }

        // Pause toggle
        if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
            this.togglePause();
            return;
        }

        if (this.isPaused || this.clearingLines.length > 0) return;
        if (this.dasKeys[e.key]) return;

        switch (e.key) {
            case 'ArrowLeft':
            case 'a': case 'A':
                this.movePiece(-1, 0);
                this.startDAS(e.key, () => this.movePiece(-1, 0));
                break;
            case 'ArrowRight':
            case 'd': case 'D':
                this.movePiece(1, 0);
                this.startDAS(e.key, () => this.movePiece(1, 0));
                break;
            case 'ArrowDown':
            case 's': case 'S':
                this.softDrop();
                this.startDAS(e.key, () => this.softDrop());
                break;
            case 'ArrowUp':
            case 'w': case 'W':
                this.rotatePiece();
                break;
            case ' ':
                this.hardDrop();
                break;
            case 'c': case 'C':
                this.holdCurrentPiece();
                break;
        }
    }

    handleKeyUp(e) {
        this.stopDASKey(e.key);
    }

    startDAS(key, action) {
        this.dasKeys[key] = {
            timeout: setTimeout(() => {
                this.dasKeys[key].interval = setInterval(action, this.dasRate);
            }, this.dasDelay)
        };
    }

    stopDASKey(key) {
        const entry = this.dasKeys[key];
        if (entry) {
            if (entry.timeout) clearTimeout(entry.timeout);
            if (entry.interval) clearInterval(entry.interval);
            delete this.dasKeys[key];
        }
    }

    stopDAS() {
        for (const key of Object.keys(this.dasKeys)) {
            this.stopDASKey(key);
        }
    }

    togglePause() {
        if (!this.isGameRunning || this.isGameOver) return;
        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            this.stopDAS();
            this.drawPauseScreen();
        } else {
            this.lastDrop = performance.now();
            if (this.isLocking) this.lockTimer = performance.now();
            this.draw();
        }

        this.playSound('click');
        this.updateToolbar();

        EventBus.emit(this.isPaused ? 'game:pause' : 'game:resume', {
            appId: 'tetris', score: this.score
        });
    }

    // ═════════════════════════════════════════════════════════
    //  GAME OVER
    // ═════════════════════════════════════════════════════════

    gameOverHandler() {
        this.isGameOver = true;
        this.stopLoop();
        this.stopDAS();
        this.playSound('gameOver');

        this.emitAppEvent('game:over', { score: this.score, lines: this.lines, level: this.level });

        const isHighScore = this.score > this.highScore && this.score > 0;
        if (isHighScore) {
            const prev = this.highScore;
            this.highScore = this.score;
            StorageManager.set('tetrisHigh', this.score);
            EventBus.emit('game:highscore', { appId: 'tetris', score: this.score, previousScore: prev });
            this.unlockAchievement && this.unlockAchievement('tetris-highscore');
        }

        EventBus.emit('game:over', {
            appId: 'tetris', won: false, score: this.score,
            stats: { lines: this.lines, level: this.level, isHighScore }
        });

        // Populate overlay
        const set = (sel, val) => {
            const el = this.getElement(sel);
            if (el) el.innerText = val;
        };
        set('#t-final',         this.formatNum(this.score));
        set('#t-end-level',     this.level);
        set('#t-end-lines',     this.lines);
        set('#t-end-singles',   this.stats.singles);
        set('#t-end-doubles',   this.stats.doubles);
        set('#t-end-triples',   this.stats.triples);
        set('#t-end-tetrises',  this.stats.tetrises);

        const label = this.getElement('#t-overlay-label');
        if (label) label.innerText = 'GAME OVER';

        const hiLabel = this.getElement('#t-newhi');
        if (hiLabel) hiLabel.classList.toggle('hidden', !isHighScore);

        const overlay = this.getElement('#tetrisOverlay');
        if (overlay) overlay.classList.remove('hidden');

        this.updateUI();
        this.updateToolbar();
    }

    // ═════════════════════════════════════════════════════════
    //  RENDERING
    // ═════════════════════════════════════════════════════════

    drawTitleScreen() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);

        // Animated falling pieces in background
        const time = this.titleAnimFrame * 0.15;
        const demoColors = Object.values(PIECES).map(p => p.color);
        for (let i = 0; i < 15; i++) {
            const col = (i * 3 + 1) % COLS;
            const row = ((time * 2 + i * 4.3) % (ROWS + 4)) - 2;
            const color = demoColors[i % demoColors.length];
            if (row >= 0 && row < ROWS) {
                this.drawCell(ctx, col, Math.floor(row), color, 0.2);
            }
        }

        // Static pile at bottom
        for (let r = 16; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if ((r + c) % 3 !== 0) {
                    const color = demoColors[(r * COLS + c) % demoColors.length];
                    this.drawCell(ctx, c, r, color, 0.3);
                }
            }
        }

        // Title — each letter in its own piece color
        const letters = 'TETRIS';
        const letterColors = ['#00FFFF', '#FFFF00', '#AA00FF', '#FF0000', '#0066FF', '#00FF00'];
        ctx.textAlign = 'center';
        ctx.font = "bold 38px 'Courier New', monospace";
        const totalW = ctx.measureText(letters.split('').join(' ')).width;
        let lx = (w - totalW) / 2;
        for (let i = 0; i < letters.length; i++) {
            const lc = letterColors[i % letterColors.length];
            ctx.shadowColor = lc;
            ctx.shadowBlur = 16;
            ctx.fillStyle = lc;
            const ch = letters[i];
            const cw2 = ctx.measureText(ch).width;
            ctx.fillText(ch, lx + cw2 / 2, 88);
            lx += cw2 + ctx.measureText(' ').width;
        }
        ctx.shadowBlur = 0;

        // Decorative line
        const grad = ctx.createLinearGradient(20, 0, w - 20, 0);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.15, '#00FFFF');
        grad.addColorStop(0.5, '#AA00FF');
        grad.addColorStop(0.85, '#FF8800');
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(20, 106);
        ctx.lineTo(w - 20, 106);
        ctx.stroke();

        // Subtitle
        ctx.fillStyle = '#7a89c2';
        ctx.font = "11px 'Courier New', monospace";
        ctx.fillText('ARCADE EDITION', w / 2, 126);

        // Start level (lets the title screen reflect the topbar selector)
        ctx.fillStyle = '#9aa3c0';
        ctx.font = "10px 'Courier New', monospace";
        ctx.fillText(`START LEVEL: ${this.startLevel}`, w / 2, 168);

        // High score
        if (this.highScore > 0) {
            ctx.fillStyle = '#FFD700';
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 10;
            ctx.font = "bold 14px 'Courier New', monospace";
            ctx.fillText(`HI-SCORE: ${this.formatNum(this.highScore)}`, w / 2, 200);
            ctx.shadowBlur = 0;
        }

        // Blinking prompt
        if (this.showText) {
            ctx.fillStyle = '#FFF';
            ctx.shadowColor = '#FFF';
            ctx.shadowBlur = 6;
            ctx.font = "bold 14px 'Courier New', monospace";
            ctx.fillText('PRESS SPACE OR CLICK', w / 2, 260);
            ctx.shadowBlur = 0;
        }

        // Subtle hint
        ctx.fillStyle = '#445';
        ctx.font = "9px 'Courier New', monospace";
        ctx.fillText('\u2191\u2193 select level', w / 2, 290);
    }

    drawPauseScreen() {
        this.draw();
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, w, h);

        ctx.textAlign = 'center';
        ctx.shadowColor = '#FFF';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#FFF';
        ctx.font = "bold 32px 'Courier New', monospace";
        ctx.fillText('PAUSED', w / 2, h / 2 - 14);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#888';
        ctx.font = "14px 'Courier New', monospace";
        ctx.fillText('Press ESC to resume', w / 2, h / 2 + 18);
    }

    draw() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        // Screen shake offset
        ctx.save();
        if (this.shakeAmount > 0) {
            const sx = (Math.random() - 0.5) * this.shakeAmount * 2;
            const sy = (Math.random() - 0.5) * this.shakeAmount * 2;
            ctx.translate(sx, sy);
        }

        // Background
        ctx.fillStyle = '#080808';
        ctx.fillRect(-4, -4, w + 8, h + 8);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.025)';
        ctx.lineWidth = 1;
        for (let c = 1; c < COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * CELL, 0);
            ctx.lineTo(c * CELL, h);
            ctx.stroke();
        }
        for (let r = 1; r < ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * CELL);
            ctx.lineTo(w, r * CELL);
            ctx.stroke();
        }

        // Board cells
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if (this.board[r][c]) {
                    if (this.clearingLines.includes(r)) {
                        // Flash effect — alternate white / invisible
                        const phase = this.clearFlashCount % 3;
                        if (phase === 0) {
                            this.drawCell(ctx, c, r, '#FFF', 1);
                        } else if (phase === 1) {
                            this.drawCell(ctx, c, r, this.board[r][c], 0.5);
                        }
                        // phase 2 = invisible (flash off)
                    } else {
                        this.drawCell(ctx, c, r, this.board[r][c], 1);
                    }
                }
            }
        }

        // Ghost piece
        if (this.currentPiece && this.clearingLines.length === 0) {
            const ghostY = this.getGhostY();
            if (ghostY !== this.currentPiece.y) {
                this.drawGhostPiece(ctx, this.currentPiece, this.currentPiece.x, ghostY);
            }
            // Current piece
            this.drawPieceAt(ctx, this.currentPiece, this.currentPiece.x, this.currentPiece.y, 1);
        }

        // Particles
        for (const p of this.particles) p.draw(ctx);
        // Score pops
        for (const s of this.scorePops) s.draw(ctx);

        // Level-up flash overlay
        if (this.levelFlash > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${this.levelFlash * 0.3})`;
            ctx.fillRect(0, 0, w, h);
        }

        ctx.restore();
    }

    drawCell(ctx, col, row, color, alpha) {
        const x = col * CELL;
        const y = row * CELL;
        const s = CELL;

        ctx.globalAlpha = alpha;

        // Outer glow — soft neon bloom around each cell
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;

        // Main fill
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, s - 2, s - 2);

        // Turn off shadow for detail passes
        ctx.shadowBlur = 0;

        // Highlight (top-left bevel)
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(x + 1, y + 1, s - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, s - 2);

        // Shadow (bottom-right bevel)
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 1, y + s - 3, s - 2, 2);
        ctx.fillRect(x + s - 3, y + 1, 2, s - 2);

        // Center shine for glass effect
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(x + 4, y + 4, s - 8, s - 8);

        ctx.globalAlpha = 1;
    }

    drawGhostPiece(ctx, piece, px, py) {
        for (let r = 0; r < piece.blocks.length; r++) {
            for (let c = 0; c < piece.blocks[r].length; c++) {
                if (piece.blocks[r][c]) {
                    const by = py + r;
                    if (by >= 0) {
                        const x = (px + c) * CELL;
                        const y = by * CELL;
                        // Subtle filled tint + border for better visibility
                        ctx.globalAlpha = 0.08;
                        ctx.fillStyle = piece.color;
                        ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
                        ctx.globalAlpha = GHOST_ALPHA;
                        ctx.strokeStyle = piece.color;
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x + 1, y + 1, CELL - 2, CELL - 2);
                        ctx.globalAlpha = 1;
                    }
                }
            }
        }
    }

    drawPieceAt(ctx, piece, px, py, alpha) {
        for (let r = 0; r < piece.blocks.length; r++) {
            for (let c = 0; c < piece.blocks[r].length; c++) {
                if (piece.blocks[r][c]) {
                    const by = py + r;
                    if (by >= 0) {
                        this.drawCell(ctx, px + c, by, piece.color, alpha);
                    }
                }
            }
        }
    }

    // ── Preview / Hold canvases ──────────────────────────────

    drawNextPieces() {
        const ctx = this.nextCtx;
        const cw = this.nextCanvas.width;
        const ch = this.nextCanvas.height;
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, cw, ch);

        if (this.nextPieces.length === 0) return;

        const piece = this.nextPieces[0];
        const blocks = piece.blocks;
        const bw = blocks[0].length;
        const bh = blocks.length;
        const offsetX = (4 - bw) / 2;
        const offsetY = (3 - bh) / 2;

        for (let r = 0; r < bh; r++) {
            for (let c = 0; c < bw; c++) {
                if (blocks[r][c]) {
                    this.drawPreviewCell(ctx, offsetX + c, offsetY + r, piece.color);
                }
            }
        }
    }

    drawHoldPiece() {
        const ctx = this.holdCtx;
        const cw = this.holdCanvas.width;
        const ch = this.holdCanvas.height;
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, cw, ch);

        if (!this.holdPiece) return;

        const blocks = this.holdPiece.blocks;
        const bw = blocks[0].length;
        const bh = blocks.length;
        const offsetX = (4 - bw) / 2;
        const offsetY = (3 - bh) / 2;

        const alpha = this.holdUsed ? 0.4 : 1;
        for (let r = 0; r < bh; r++) {
            for (let c = 0; c < bw; c++) {
                if (blocks[r][c]) {
                    this.drawPreviewCell(ctx, offsetX + c, offsetY + r, this.holdPiece.color, alpha);
                }
            }
        }
    }

    drawPreviewCell(ctx, col, row, color, alpha = 1) {
        const P = PREVIEW_CELL;
        const x = col * P;
        const y = row * P;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, P - 2, P - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x + 1, y + 1, P - 2, 2);
        ctx.fillRect(x + 1, y + 1, 2, P - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x + 1, y + P - 3, P - 2, 2);
        ctx.fillRect(x + P - 3, y + 1, 2, P - 2);
        ctx.globalAlpha = 1;
    }

    clearPreviewCanvas(ctx, canvas) {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // ═════════════════════════════════════════════════════════
    //  UI UPDATES
    // ═════════════════════════════════════════════════════════

    updateUI() {
        const scoreEl = this.getElement('#t-score');
        const linesEl = this.getElement('#t-lines');
        const levelEl = this.getElement('#t-level');
        const hiEl    = this.getElement('#t-hi');

        if (scoreEl) scoreEl.innerText = this.formatNum(this.score);
        if (linesEl) linesEl.innerText = this.lines;
        if (levelEl) levelEl.innerText = this.level;
        if (hiEl)    hiEl.innerText    = this.formatNum(this.highScore);

        // Stats panel
        const sMap = {
            '#t-stat-singles':  this.stats.singles,
            '#t-stat-doubles':  this.stats.doubles,
            '#t-stat-triples':  this.stats.triples,
            '#t-stat-tetrises': this.stats.tetrises,
        };
        for (const [sel, val] of Object.entries(sMap)) {
            const el = this.getElement(sel);
            if (el) el.innerText = val;
        }

        // Combo / B2B panel
        const comboPanel = this.getElement('#t-combo-panel');
        const comboText  = this.getElement('#t-combo-text');
        const comboSub   = this.getElement('#t-combo-sub');
        if (comboPanel && comboText && comboSub) {
            const hasCombo = this.combo > 0;
            const hasB2B   = this.backToBack > 1;
            if (hasCombo || hasB2B) {
                comboPanel.dataset.active = 'true';
                if (hasB2B) {
                    comboText.innerText = `B2B x${this.backToBack - 1}`;
                    comboSub.innerText  = hasCombo ? `Combo x${this.combo}` : (this.lastClearLabel || 'Difficult');
                } else {
                    comboText.innerText = `COMBO x${this.combo}`;
                    comboSub.innerText  = this.lastClearLabel || '';
                }
            } else {
                comboPanel.dataset.active = 'false';
                comboText.innerText = '—';
                comboSub.innerText  = 'No combo';
            }
        }
    }

    formatNum(n) {
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
}

export default Tetris;
