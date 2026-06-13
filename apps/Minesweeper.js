/**
 * Minesweeper Game (Final)
 * Classic Windows 95 implementation.
 * Features: First-click safety, Chording, Accurate Timer, Win95 Visuals.
 */

import AppBase from './AppBase.js';
import StateManager from '../core/StateManager.js';
import StorageManager from '../core/StorageManager.js';
import { escapeHtml } from '../core/Sanitize.js';
import EventBus from '../core/EventBus.js';

const DIFFICULTIES = {
    beginner:     { rows: 9,  cols: 9,  mines: 10, label: 'Beginner' },
    intermediate: { rows: 16, cols: 16, mines: 40, label: 'Intermediate' },
    expert:       { rows: 16, cols: 30, mines: 99, label: 'Expert' },
};

class Minesweeper extends AppBase {
    constructor() {
        super({
            id: 'minesweeper',
            name: 'Minesweeper',
            icon: '💣',
            width: 260,
            height: 360,
            minWidth: 240,
            minHeight: 320,
            resizable: true,
            singleton: true,
            category: 'games'
        });

        // Difficulty state
        const savedDiff = StorageManager.get('minesweeperDifficulty') || 'beginner';
        this.difficulty = DIFFICULTIES[savedDiff] ? savedDiff : 'beginner';
        const cfg = DIFFICULTIES[this.difficulty];
        this.rows = cfg.rows;
        this.cols = cfg.cols;
        this.mines = cfg.mines;

        // Game state
        this.grid = [];
        this.gameOver = false;
        this.gameWon = false;
        this.timer = null;
        this.time = 0;
        this.isFirstClick = true;
        this.bestTimes = this._loadBestTimes();

        // Register semantic event commands for scriptability
        this.registerCommands();
        this.registerQueries();
    }

    _loadBestTimes() {
        return {
            beginner:     StorageManager.get('minesweeperBest_beginner')     || null,
            intermediate: StorageManager.get('minesweeperBest_intermediate') || null,
            expert:       StorageManager.get('minesweeperBest_expert')       || null,
        };
    }

    registerCommands() {
        this.registerCommand('newGame', () => {
            this.initGame();
            return { success: true };
        });

        this.registerCommand('reveal', (payload) => {
            if (!payload || payload.row === undefined || payload.col === undefined) {
                return { success: false, error: 'Provide row and col' };
            }
            const r = payload.row, c = payload.col;
            if (!this.isValid(r, c)) return { success: false, error: 'Invalid cell position' };
            if (this.gameOver) return { success: false, error: 'Game is over' };
            this.reveal(r, c);
            return { success: true, row: r, col: c, gameOver: this.gameOver };
        });

        this.registerCommand('flag', (payload) => {
            if (!payload || payload.row === undefined || payload.col === undefined) {
                return { success: false, error: 'Provide row and col' };
            }
            const r = payload.row, c = payload.col;
            if (!this.isValid(r, c)) return { success: false, error: 'Invalid cell position' };
            if (this.gameOver) return { success: false, error: 'Game is over' };
            this.toggleFlag(r, c);
            return { success: true, row: r, col: c, flagged: this.grid[r]?.[c]?.flagged };
        });

        this.registerCommand('setDifficulty', (payload) => {
            if (!payload) return { success: false, error: 'Payload required' };
            if (payload.level && DIFFICULTIES[payload.level]) {
                this.setDifficulty(payload.level);
            } else if (payload.rows && payload.cols && payload.mines) {
                this.difficulty = 'custom';
                this.rows = payload.rows;
                this.cols = payload.cols;
                this.mines = payload.mines;
                this.initGame();
            } else {
                return { success: false, error: 'Provide level or { rows, cols, mines }' };
            }
            return { success: true, rows: this.rows, cols: this.cols, mines: this.mines, difficulty: this.difficulty };
        });
    }

    registerQueries() {
        this.registerQuery('getState', () => {
            const totalFlagged = this.grid.length > 0
                ? this.grid.flat().filter(c => c.flagged).length
                : 0;
            const totalRevealed = this.grid.length > 0
                ? this.grid.flat().filter(c => c.revealed).length
                : 0;
            return {
                gameOver: this.gameOver,
                time: this.time,
                mines: this.mines,
                rows: this.rows,
                cols: this.cols,
                flagsPlaced: totalFlagged,
                cellsRevealed: totalRevealed,
                isFirstClick: this.isFirstClick
            };
        });

        this.registerQuery('getBoard', () => {
            if (this.grid.length === 0) return { board: [] };
            return {
                board: this.grid.map(row => row.map(cell => ({
                    row: cell.r,
                    col: cell.c,
                    revealed: cell.revealed,
                    flagged: cell.flagged,
                    mine: cell.revealed ? cell.mine : undefined,
                    count: cell.revealed ? cell.count : undefined
                })))
            };
        });
    }

    onOpen() {
        const diffBtn = (key) => {
            const isActive = this.difficulty === key ? 'active' : '';
            return `<button type="button" class="ms-diff-btn ${isActive}" data-diff="${key}">${DIFFICULTIES[key].label}</button>`;
        };
        return `
            <div class="minesweeper-window">
                <div class="ms-menu-bar">
                    ${diffBtn('beginner')}
                    ${diffBtn('intermediate')}
                    ${diffBtn('expert')}
                </div>
                <div class="ms-header-inset">
                    <div class="mine-info">
                        <div class="digital-display inset-border" id="mineCount">010</div>
                        <button class="mine-face-btn" id="mineFace" aria-label="New game">
                            <span class="face-icon">😀</span>
                        </button>
                        <div class="digital-display inset-border" id="mineTimer">000</div>
                    </div>
                </div>
                <div class="mine-grid-wrapper inset-border">
                    <div class="mine-grid" id="mineGrid"></div>
                </div>
                <div class="ms-banner hidden" id="msBanner">
                    <div class="ms-banner-icon" id="msBannerIcon">🏆</div>
                    <div class="ms-banner-body">
                        <div class="ms-banner-title" id="msBannerTitle">YOU WIN!</div>
                        <div class="ms-banner-sub" id="msBannerSub">Time: 0s</div>
                    </div>
                    <div class="ms-banner-record hidden" id="msBannerRecord">NEW RECORD</div>
                </div>
            </div>
        `;
    }

    onMount() {
        const faceBtn = this.getElement('#mineFace');
        if (faceBtn) this.addHandler(faceBtn, 'click', () => this.initGame());

        // Difficulty buttons
        for (const btn of this.getElements('.ms-diff-btn')) {
            this.addHandler(btn, 'click', () => {
                const diff = btn.getAttribute('data-diff');
                if (DIFFICULTIES[diff]) this.setDifficulty(diff);
            });
        }

        // Single document-level mouseup handler for face reset (instead of per-cell)
        this.addHandler(document, 'mouseup', () => {
            if (!this.gameOver) this.updateFace('😀');
        });

        this._fitWindowToBoard();
        this.initGame();
    }

    onClose() {
        this.stopTimer();
    }

    setDifficulty(diff) {
        if (!DIFFICULTIES[diff]) return;
        this.difficulty = diff;
        const cfg = DIFFICULTIES[diff];
        this.rows = cfg.rows;
        this.cols = cfg.cols;
        this.mines = cfg.mines;
        StorageManager.set('minesweeperDifficulty', diff);
        // Update active button styling
        for (const btn of this.getElements('.ms-diff-btn')) {
            btn.classList.toggle('active', btn.getAttribute('data-diff') === diff);
        }
        this._fitWindowToBoard();
        this.initGame();
    }

    _fitWindowToBoard() {
        // 24px per cell + header + chrome. Computed conservatively to avoid scrollbars.
        const winEl = this.getWindow();
        if (!winEl) return;
        const cellPx = 24;
        const chromeW = 32; // window borders + inner padding
        const chromeH = 168; // titlebar + menu bar + header + banner space
        const targetW = Math.max(240, this.cols * cellPx + chromeW);
        const targetH = Math.max(320, this.rows * cellPx + chromeH);
        winEl.style.width  = targetW + 'px';
        winEl.style.height = targetH + 'px';
    }

    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    initGame() {
        this.stopTimer();
        this.time = 0;
        this.gameOver = false;
        this.gameWon = false;
        this.isFirstClick = true;
        this.grid = [];

        // Reset UI
        this.updateFace('😀');
        this.updateTimerDisplay();
        this.updateMineCounter(this.mines);

        const banner = this.getElement('#msBanner');
        if (banner) banner.classList.add('hidden');

        this.playSound('gameStart');

        this.emitAppEvent('game:start', {
            rows: this.rows,
            cols: this.cols,
            mines: this.mines
        });

        const gridEl = this.getElement('#mineGrid');
        if (!gridEl) return;

        gridEl.innerHTML = '';
        // 24px is the standard Win95 cell size
        gridEl.style.gridTemplateColumns = `repeat(${this.cols}, 24px)`;

        // Generate Grid
        for (let r = 0; r < this.rows; r++) {
            this.grid[r] = [];
            for (let c = 0; c < this.cols; c++) {
                const cellElement = document.createElement('div');
                cellElement.className = 'mine-cell';
                cellElement.dataset.r = r;
                cellElement.dataset.c = c;

                const cell = {
                    r, c,
                    mine: false,
                    revealed: false,
                    flagged: false,
                    question: false,
                    count: 0,
                    element: cellElement
                };

                this.grid[r][c] = cell;
                gridEl.appendChild(cellElement);
            }
        }

        this.attachGridEvents(gridEl);
    }

    /**
     * One delegated handler set on the grid container instead of three per
     * cell. initGame() runs per game (face click, difficulty switch) and the
     * per-cell addHandler calls retained every detached cell + closure in
     * the AppBase handler map until the window closed — an Expert board
     * leaked ~1,440 entries per game.
     */
    attachGridEvents(gridEl) {
        if (gridEl.dataset.mineHandlersBound) return;
        gridEl.dataset.mineHandlersBound = '1';

        const cellAt = (target) => {
            const el = target.closest('.mine-cell');
            if (!el) return null;
            const r = parseInt(el.dataset.r, 10);
            const c = parseInt(el.dataset.c, 10);
            return this.grid[r]?.[c] ? { r, c } : null;
        };

        // Mouse Down (Face reaction)
        this.addHandler(gridEl, 'mousedown', (e) => {
            const pos = cellAt(e.target);
            if (!pos) return;
            if (this.gameOver || this.grid[pos.r][pos.c].revealed) return;
            if (e.button === 0) this.updateFace('😮');
        });

        // Left Click (Reveal or Chord) — sound is fired here, not inside the
        // recursive reveal() so flood-fill doesn't spam dozens of clicks.
        this.addHandler(gridEl, 'click', (e) => {
            const pos = cellAt(e.target);
            if (!pos || this.gameOver) return;
            if (this.grid[pos.r][pos.c].revealed) {
                this.attemptChord(pos.r, pos.c);
                this.playSound('click');
            } else if (!this.grid[pos.r][pos.c].flagged) {
                this.playSound('click');
                this.reveal(pos.r, pos.c);
            }
        });

        // Right Click (Flag)
        this.addHandler(gridEl, 'contextmenu', (e) => {
            e.preventDefault();
            const pos = cellAt(e.target);
            if (!pos) return;
            this.toggleFlag(pos.r, pos.c);
        });
    }

    placeMines(safeR, safeC) {
        // Cap mines to available cells outside the safe zone to prevent infinite loop
        const totalCells = this.rows * this.cols;
        let safeZoneCount = 0;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (this.isValid(safeR + dr, safeC + dc)) safeZoneCount++;
            }
        }
        const minesToPlace = Math.min(this.mines, totalCells - safeZoneCount);

        let placed = 0;
        while (placed < minesToPlace) {
            const r = Math.floor(Math.random() * this.rows);
            const c = Math.floor(Math.random() * this.cols);

            // Protect first click and its immediate neighbors
            if (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;

            if (!this.grid[r][c].mine) {
                this.grid[r][c].mine = true;
                placed++;
            }
        }

        // Calculate neighbor counts
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                if (!this.grid[r][c].mine) {
                    this.grid[r][c].count = this.countNeighbors(r, c, (cell) => cell.mine);
                }
            }
        }
    }

    countNeighbors(r, c, predicate) {
        let count = 0;
        for (let di = -1; di <= 1; di++) {
            for (let dj = -1; dj <= 1; dj++) {
                if (di === 0 && dj === 0) continue;
                const ni = r + di, nj = c + dj;
                if (this.isValid(ni, nj) && predicate(this.grid[ni][nj])) {
                    count++;
                }
            }
        }
        return count;
    }

    isValid(r, c) {
        return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
    }

    startTimer() {
        if (this.timer) return;
        this.timer = setInterval(() => {
            this.time++;
            if (this.time > 999) this.time = 999;
            this.updateTimerDisplay();

            // Emit timer event every second
            EventBus.emit('minesweeper:timer', { time: this.time });
        }, 1000);
    }

    updateTimerDisplay() {
        const el = this.getElement('#mineTimer');
        if (el) el.textContent = String(this.time).padStart(3, '0');
    }

    reveal(r, c) {
        if (this.gameOver) return;
        
        const cell = this.grid[r][c];
        if (cell.revealed || cell.flagged) return;

        // First click safety
        if (this.isFirstClick) {
            this.isFirstClick = false;
            this.placeMines(r, c);
            this.startTimer();

            // Emit game started event
            EventBus.emit('game:start', {
                appId: 'minesweeper',
                difficulty: this.mines === 10 ? 'beginner' : this.mines === 40 ? 'intermediate' : 'expert',
                settings: { rows: this.rows, cols: this.cols, mines: this.mines }
            });
        }

        cell.revealed = true;
        cell.element.classList.add('revealed');
        this.emitAppEvent('cell:revealed', { row: r, col: c, value: cell.count });

        // Emit cell revealed event
        EventBus.emit('minesweeper:cell:reveal', {
            row: r,
            col: c,
            value: cell.count,
            isMine: cell.mine
        });

        if (cell.mine) {
            // Emit mine hit event
            EventBus.emit('minesweeper:mine:hit', {
                row: r,
                col: c,
                time: this.time
            });
            this.triggerGameOver(false, cell); // Pass the killing cell
            return;
        }

        if (cell.count > 0) {
            cell.element.textContent = cell.count;
            cell.element.classList.add(`val-${cell.count}`);
        } else {
            // Flood fill empty cells
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const ni = r + di, nj = c + dj;
                    if (this.isValid(ni, nj)) {
                        this.reveal(ni, nj);
                    }
                }
            }
        }

        this.checkWinCondition();
    }

    attemptChord(r, c) {
        const cell = this.grid[r][c];
        if (cell.count === 0) return;

        const flagCount = this.countNeighbors(r, c, (n) => n.flagged);
        
        if (flagCount === cell.count) {
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    const ni = r + di, nj = c + dj;
                    if (this.isValid(ni, nj)) {
                        const neighbor = this.grid[ni][nj];
                        if (!neighbor.revealed && !neighbor.flagged) {
                            this.reveal(ni, nj);
                        }
                    }
                }
            }
        }
    }

    toggleFlag(r, c) {
        if (this.gameOver) return;
        const cell = this.grid[r][c];
        if (cell.revealed) return;

        cell.flagged = !cell.flagged;
        cell.element.classList.toggle('flagged', cell.flagged);
        this.playSound('click');

        const totalFlagged = this.grid.flat().filter(c => c.flagged).length;
        this.updateMineCounter(this.mines - totalFlagged);
        this.emitAppEvent('cell:flagged', { row: r, col: c, flagged: cell.flagged });

        // Emit cell flag event
        EventBus.emit('minesweeper:cell:flag', {
            row: r,
            col: c,
            flagged: cell.flagged,
            minesRemaining: this.mines - totalFlagged
        });
    }

    updateMineCounter(count) {
        const el = this.getElement('#mineCount');
        if (!el) return;
        const clamped = Math.max(-99, Math.min(999, count));
        // Negative numbers: show sign + 2 digits (e.g. "-05"); positive: 3 digits (e.g. "010")
        if (clamped < 0) {
            el.textContent = '-' + String(Math.abs(clamped)).padStart(2, '0');
        } else {
            el.textContent = String(clamped).padStart(3, '0');
        }
    }

    triggerGameOver(win, killingCell = null) {
        this.gameOver = true;
        this.gameWon = !!win;
        this.stopTimer();

        if (win) {
            this.updateFace('😎');
            this.flagAllMines();
            StateManager.unlockAchievement('mine_sweeper');
            this.playSound('levelUp');

            // Check for new best time (only for standard difficulties)
            let isNewRecord = false;
            if (DIFFICULTIES[this.difficulty]) {
                const prev = this.bestTimes[this.difficulty];
                if (prev === null || this.time < prev) {
                    this.bestTimes[this.difficulty] = this.time;
                    StorageManager.set(`minesweeperBest_${this.difficulty}`, this.time);
                    isNewRecord = true;
                }
            }

            this._showBanner({
                title: 'YOU WIN!',
                sub: `Time: ${this.time}s` + (this.bestTimes[this.difficulty] != null
                    ? `  · Best: ${this.bestTimes[this.difficulty]}s` : ''),
                icon: '🏆',
                record: isNewRecord
            });

            this.emitAppEvent('game:win', {
                time: this.time, rows: this.rows, cols: this.cols, mines: this.mines,
                difficulty: this.difficulty, isNewRecord
            });
            EventBus.emit('minesweeper:win', {
                time: this.time, difficulty: this.difficulty,
                rows: this.rows, cols: this.cols, mines: this.mines
            });
            EventBus.emit('game:over', {
                appId: 'minesweeper', won: true, time: this.time,
                stats: { rows: this.rows, cols: this.cols, mines: this.mines, difficulty: this.difficulty }
            });
        } else {
            this.updateFace('😵');

            // Highlight ONLY the mine that killed you
            if (killingCell) {
                killingCell.element.classList.add('mine-hit');
            }

            this.revealAllMines();
            this.playSound('gameOver');

            this._showBanner({
                title: 'BOOM!',
                sub: `Time: ${this.time}s`,
                icon: '💥',
                record: false,
                lost: true
            });

            this.emitAppEvent('game:lose', {
                time: this.time, rows: this.rows, cols: this.cols,
                mines: this.mines, difficulty: this.difficulty
            });
            EventBus.emit('game:over', {
                appId: 'minesweeper', won: false, time: this.time,
                stats: { rows: this.rows, cols: this.cols, mines: this.mines, difficulty: this.difficulty }
            });
        }
    }

    _showBanner({ title, sub, icon, record, lost }) {
        const banner = this.getElement('#msBanner');
        if (!banner) return;
        banner.classList.remove('hidden');
        banner.classList.toggle('lost', !!lost);
        const set = (sel, val) => {
            const el = this.getElement(sel);
            if (el) el.innerText = val;
        };
        set('#msBannerIcon',  icon);
        set('#msBannerTitle', title);
        set('#msBannerSub',   sub);
        const rec = this.getElement('#msBannerRecord');
        if (rec) rec.classList.toggle('hidden', !record);
    }

    checkWinCondition() {
        let revealedCount = 0;
        for (let row of this.grid) {
            for (let cell of row) {
                if (cell.revealed) revealedCount++;
            }
        }

        const safeCells = (this.rows * this.cols) - this.mines;
        if (revealedCount === safeCells) {
            this.triggerGameOver(true);
        }
    }

    revealAllMines() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.grid[r][c];
                
                // Show unflagged mines
                if (cell.mine && !cell.flagged) {
                    cell.element.classList.add('revealed', 'mine');
                    cell.element.textContent = '💣';
                }
                
                // Show false flags (crossed out)
                if (!cell.mine && cell.flagged) {
                    cell.element.classList.add('false-flag');
                }
            }
        }
    }

    flagAllMines() {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const cell = this.grid[r][c];
                if (cell.mine && !cell.flagged) {
                    cell.flagged = true;
                    cell.element.classList.add('flagged');
                }
            }
        }
        this.updateMineCounter(0);
    }

    updateFace(face) {
        const el = this.getElement('#mineFace span');
        if (el) el.textContent = face;
    }
}

export default Minesweeper;