/**
 * Solitaire (Klondike)
 * Includes Windows-style variants (Draw 1/Draw 3 + Vegas scoring) and Undo.
 *
 * Rules enforced:
 * - Tableau: build down in alternating colors (red/black)
 * - Foundation: build up by suit from Ace to King
 * - Only Kings may be placed on empty tableau columns
 * - Draw 1 or Draw 3 from stock to waste
 * - Vegas mode: $5 per foundation card, -$52 buy-in, limited passes
 */

import AppBase from './AppBase.js';
import StateManager from '../core/StateManager.js';
import StorageManager from '../core/StorageManager.js';
import { escapeHtml } from '../core/Sanitize.js';
import EventBus from '../core/EventBus.js';

class Solitaire extends AppBase {
    constructor() {
        super({
            id: 'solitaire',
            name: 'Solitaire',
            icon: '🃏',
            width: 760,
            height: 600,
            minWidth: 640,
            minHeight: 520,
            resizable: true,
            category: 'games',
            singleton: true
        });

        this.currentGameType = StorageManager.get('solitaireGameType') || 'klondike';
        this.bestStats = this._loadBestStats();
        this.resetState();

        this.registerCommands();
        this.registerQueries();
    }

    _loadBestStats() {
        return {
            klondike:  StorageManager.get('solitaireBest_klondike')  || { bestTime: null, bestMoves: null, bestScore: 0, wins: 0 },
            klondike3: StorageManager.get('solitaireBest_klondike3') || { bestTime: null, bestMoves: null, bestScore: 0, wins: 0 },
            vegas:     StorageManager.get('solitaireBest_vegas')     || { bestTime: null, bestMoves: null, bestScore: 0, wins: 0 },
            vegas3:    StorageManager.get('solitaireBest_vegas3')    || { bestTime: null, bestMoves: null, bestScore: 0, wins: 0 },
        };
    }

    _saveBestStats(variant) {
        StorageManager.set(`solitaireBest_${variant}`, this.bestStats[variant]);
    }

    registerCommands() {
        this.registerCommand('newGame', () => {
            this.startNewGame();
            return { success: true };
        });

        this.registerCommand('drawCard', () => {
            this.drawStock();
            return { success: true, stockRemaining: this.stock.length, wasteCount: this.waste.length };
        });

        this.registerCommand('undo', () => {
            if (!this.moveHistory.length) {
                return { success: false, error: 'No moves to undo' };
            }
            this.undoLastMove();
            return { success: true, moves: this.moves, score: this.score };
        });

        this.registerCommand('setGameType', (params = {}) => {
            const requestedType = params.type || params.gameType;
            if (!requestedType || !this.gameVariants[requestedType]) {
                return {
                    success: false,
                    error: `Unknown game type. Available: ${Object.keys(this.gameVariants).join(', ')}`
                };
            }
            this.currentGameType = requestedType;
            StorageManager.set('solitaireGameType', this.currentGameType);
            this.startNewGame();
            return { success: true, gameType: this.currentGameType, settings: this.getVariant() };
        });
    }

    registerQueries() {
        this.registerQuery('getState', () => ({
            moves: this.moves,
            time: this.time,
            isWon: this.isWon,
            gameType: this.currentGameType,
            stockRemaining: this.stock.length,
            wasteCount: this.waste.length,
            foundationCounts: this.foundations.map(f => f.length),
            drawCount: this.getVariant().drawCount,
            undoAvailable: this.moveHistory.length > 0
        }));

        this.registerQuery('getScore', () => ({
            score: this.score,
            moves: this.moves,
            time: this.time
        }));
    }

    resetState() {
        this.deck = [];
        this.stock = [];
        this.waste = [];
        this.foundations = [[], [], [], []];
        this.tableau = [[], [], [], [], [], [], []];
        this.moves = 0;
        this.score = 0;
        this.time = 0;
        this.timer = null;
        this.isWon = false;
        this.draggedData = null;
        this.selectedCard = null;
        this.moveHistory = [];
        this.stockPasses = 0;
        this.autoCompleting = false;
        this.gameVariants = {
            klondike: { label: 'Klondike (Draw 1)', drawCount: 1, scoring: 'standard' },
            klondike3: { label: 'Klondike (Draw 3)', drawCount: 3, scoring: 'standard' },
            vegas: { label: 'Vegas (Draw 1)', drawCount: 1, scoring: 'vegas', maxPasses: 1 },
            vegas3: { label: 'Vegas (Draw 3)', drawCount: 3, scoring: 'vegas', maxPasses: 3 }
        };
    }

    getVariant() {
        return this.gameVariants[this.currentGameType] || this.gameVariants.klondike;
    }

    // --- Scoring ---

    addScore(points, reason) {
        const variant = this.getVariant();
        if (variant.scoring === 'vegas') {
            // Vegas: only foundation cards matter, calculated directly
            return;
        }
        // Standard scoring
        this.score = Math.max(0, this.score + points);
    }

    getDisplayScore() {
        const variant = this.getVariant();
        if (variant.scoring === 'vegas') {
            const foundationCards = this.foundations.reduce((a, f) => a + f.length, 0);
            return (foundationCards * 5) - 52;
        }
        return this.score;
    }

    onOpen() {
        return `
            <div class="solitaire-app">
                <div class="solitaire-bar">
                    <div class="sol-bar-left">
                        <button class="sol-btn" id="btnNew">
                            <span class="sol-btn-icon">🂠</span> New
                        </button>
                        <button class="sol-btn" id="btnUndo">
                            <span class="sol-btn-icon">↩</span> Undo
                        </button>
                        <button class="sol-btn sol-btn-accent" id="btnAutoComplete" style="display:none">
                            <span class="sol-btn-icon">⇈</span> Auto Complete
                        </button>
                    </div>
                    <div class="sol-bar-center">
                        <select id="gameType" class="sol-select">
                            ${Object.entries(this.gameVariants).map(([key, config]) => `
                                <option value="${key}" ${key === this.currentGameType ? 'selected' : ''}>${config.label}</option>
                            `).join('')}
                        </select>
                    </div>
                    <div class="sol-bar-right">
                        <div class="sol-stat">
                            <span class="sol-stat-label">Time</span>
                            <span class="sol-stat-value" id="timer">0:00</span>
                        </div>
                        <div class="sol-stat">
                            <span class="sol-stat-label">Moves</span>
                            <span class="sol-stat-value" id="moveCount">0</span>
                        </div>
                        <div class="sol-stat">
                            <span class="sol-stat-label">Score</span>
                            <span class="sol-stat-value" id="score">0</span>
                        </div>
                    </div>
                </div>

                <div class="solitaire-table" id="gameTable">
                    <div class="top-area">
                        <div class="pile-group left">
                            <div class="card-slot stock-slot" id="stock"></div>
                            <div class="card-slot waste-slot" id="waste"></div>
                        </div>
                        <div class="pile-group right">
                            ${['♠', '♥', '♦', '♣'].map((suit, i) => `
                                <div class="card-slot foundation-slot" id="f${i}" data-suit="${suit}"></div>
                            `).join('')}
                        </div>
                    </div>

                    <div class="tableau-area">
                        ${[0, 1, 2, 3, 4, 5, 6].map(i => `
                            <div class="tableau-col" id="t${i}" data-col="${i}"></div>
                        `).join('')}
                    </div>
                </div>

                <!-- Win overlay -->
                <div class="sol-win-overlay" id="winOverlay">
                    <canvas class="sol-win-canvas" id="winCanvas"></canvas>
                    <div class="sol-win-dialog">
                        <div class="sol-win-title">You Win!</div>
                        <div class="sol-win-record hidden" id="winRecordBadge">★ NEW RECORD ★</div>
                        <div class="sol-win-stats">
                            <div class="sol-win-row"><span class="sol-win-lbl">Time</span><span class="sol-win-num" id="winTime">0:00</span><span class="sol-win-best" id="winBestTime">Best: —</span></div>
                            <div class="sol-win-row"><span class="sol-win-lbl">Moves</span><span class="sol-win-num" id="winMoves">0</span><span class="sol-win-best" id="winBestMoves">Best: —</span></div>
                            <div class="sol-win-row"><span class="sol-win-lbl">Score</span><span class="sol-win-num" id="winScore">0</span><span class="sol-win-best" id="winBestScore">Best: 0</span></div>
                            <div class="sol-win-row sol-win-row-wins"><span class="sol-win-lbl">Total Wins</span><span class="sol-win-num" id="winWins">0</span></div>
                        </div>
                        <button class="sol-btn sol-btn-win" id="btnWinNewGame">Play Again</button>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        this.addHandler(this.getElement('#btnNew'), 'click', () => this.startNewGame());
        this.addHandler(this.getElement('#btnUndo'), 'click', () => this.undoLastMove());
        this.addHandler(this.getElement('#btnAutoComplete'), 'click', () => this.autoComplete());
        this.addHandler(this.getElement('#btnWinNewGame'), 'click', () => this.startNewGame());
        this.addHandler(this.getElement('#stock'), 'click', () => this.drawStock());
        this.addHandler(this.getElement('#gameType'), 'change', (e) => {
            this.currentGameType = e.target.value;
            StorageManager.set('solitaireGameType', this.currentGameType);
            this.startNewGame();
        });

        // Click-to-move on the game table
        this.addHandler(this.getElement('#gameTable'), 'click', (e) => this.handleTableClick(e));

        this.setupDropZones();
        this.startNewGame();
    }

    setupDropZones() {
        const allowDrop = (e) => e.preventDefault();

        [0, 1, 2, 3].forEach(i => {
            const el = this.getElement(`#f${i}`);
            this.addHandler(el, 'dragover', allowDrop);
            this.addHandler(el, 'drop', (e) => this.handleDrop(e, 'foundation', i));
        });

        [0, 1, 2, 3, 4, 5, 6].forEach(i => {
            const el = this.getElement(`#t${i}`);
            this.addHandler(el, 'dragover', allowDrop);
            this.addHandler(el, 'drop', (e) => this.handleDrop(e, 'tableau', i));
        });
    }

    onClose() {
        clearInterval(this.timer);
        if (this.victoryAnimFrame) {
            cancelAnimationFrame(this.victoryAnimFrame);
            this.victoryAnimFrame = null;
        }
        // Stop a running auto-complete — its self-rescheduling timeout
        // chain kept mutating state and playing sounds after close.
        this.autoCompleting = false;
        if (this._autoCompleteTimer) {
            clearTimeout(this._autoCompleteTimer);
            this._autoCompleteTimer = null;
        }
    }

    // --- Shuffle (Fisher-Yates) ---

    shuffleDeck(deck) {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    startNewGame() {
        clearInterval(this.timer);
        this.hideWinScreen();
        const selectedType = this.currentGameType;
        this.resetState();
        this.currentGameType = selectedType;
        this.updateHeader();

        this.deck = [];
        this.suits.forEach(suit => {
            this.values.forEach((val, idx) => {
                this.deck.push({
                    suit,
                    val,
                    rank: idx + 1,
                    color: this.colors[suit],
                    faceUp: false,
                    id: Math.random().toString(36).slice(2, 11)
                });
            });
        });
        this.shuffleDeck(this.deck);

        this.stock = [...this.deck];
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j <= i; j++) {
                const card = this.stock.pop();
                if (j === i) card.faceUp = true;
                this.tableau[i].push(card);
            }
        }

        // Vegas starts at -52 (buy-in), standard starts at 0
        this.score = 0;

        this.renderAll();
        this.timer = setInterval(() => {
            this.time++;
            // Standard timed scoring: deduct 2 points every 10 seconds (after 30s)
            if (this.getVariant().scoring === 'standard' && this.time > 30 && this.time % 10 === 0) {
                this.score = Math.max(0, this.score - 2);
            }
            this.updateHeader();
        }, 1000);

        this.playSound('gameStart');
        this.emitAppEvent('game:start', { type: this.currentGameType });
        EventBus.emit('game:start', {
            appId: 'solitaire',
            settings: {
                type: this.currentGameType,
                drawCount: this.getVariant().drawCount,
                scoring: this.getVariant().scoring
            }
        });
        EventBus.emit('solitaire:game:type', {
            gameType: this.currentGameType,
            drawCount: this.getVariant().drawCount,
            scoring: this.getVariant().scoring
        });
    }

    drawStock() {
        if (this.isWon || this.autoCompleting) return;

        this.playSound('click');

        if (this.stock.length === 0) {
            if (this.waste.length === 0) return;

            const variant = this.getVariant();

            // Vegas mode limits passes through the stock
            if (variant.scoring === 'vegas' && variant.maxPasses !== undefined) {
                if (this.stockPasses >= variant.maxPasses) {
                    return; // No more passes allowed
                }
            }

            this.stockPasses++;
            const cardsRecycled = this.waste.length;
            const recycledCards = this.waste.map(c => c.id);
            this.stock = this.waste.reverse().map(c => ({ ...c, faceUp: false }));
            this.waste = [];
            this.moveHistory.push({ type: 'recycle', recycledCards, stockPasses: this.stockPasses });

            // Standard scoring: -100 for recycling in draw 1, -20 in draw 3
            if (variant.scoring === 'standard') {
                if (variant.drawCount === 1 && this.stockPasses > 1) {
                    this.addScore(-100, 'recycle');
                } else if (variant.drawCount === 3) {
                    this.addScore(-20, 'recycle');
                }
            }

            EventBus.emit('solitaire:stock:recycle', { cardsRecycled });
        } else {
            const drawnCards = [];
            const previousWaste = this.waste.map(c => c.id);
            const drawCount = Math.min(this.getVariant().drawCount, this.stock.length);
            for (let i = 0; i < drawCount; i++) {
                const card = this.stock.pop();
                card.faceUp = true;
                this.waste.push(card);
                drawnCards.push(card);
            }
            this.moveHistory.push({ type: 'draw', cards: drawnCards.map(c => c.id), count: drawCount });

            EventBus.emit('solitaire:stock:draw', {
                cards: drawnCards.map(card => `${card.val}${card.suit}`),
                drawCount: drawnCards.length,
                stockRemaining: this.stock.length
            });
        }

        this.updateHeader();
        this.renderStock();
        this.renderWaste();
    }

    // --- Click-to-Move ---

    handleTableClick(e) {
        if (this.isWon || this.autoCompleting) return;

        const cardEl = e.target.closest('.sol-card:not(.sol-back)');
        const slotEl = e.target.closest('.card-slot, .tableau-col');

        // If clicking a face-up card
        if (cardEl && !cardEl.classList.contains('sol-back')) {
            const source = cardEl.dataset.source;
            const pileIdx = parseInt(cardEl.dataset.pileIdx);
            const cardIdx = parseInt(cardEl.dataset.cardIdx);

            // If no card selected, select this one
            if (!this.selectedCard) {
                this.selectCard(source, pileIdx, cardIdx);
                return;
            }

            // If clicking the already-selected card, deselect
            if (this.selectedCard.source === source &&
                this.selectedCard.pileIdx === pileIdx &&
                this.selectedCard.cardIdx === cardIdx) {
                this.clearSelection();
                return;
            }

            // Try to move selected card to this target
            let targetType, targetIdx;
            if (source === 'foundation') {
                targetType = 'foundation';
                targetIdx = pileIdx;
            } else if (source === 'tableau') {
                targetType = 'tableau';
                targetIdx = pileIdx;
            } else {
                // Clicked another waste card - reselect
                this.clearSelection();
                this.selectCard(source, pileIdx, cardIdx);
                return;
            }

            this.tryMoveSelected(targetType, targetIdx);
            return;
        }

        // If clicking an empty slot with a card selected
        if (slotEl && this.selectedCard) {
            let targetType, targetIdx;

            if (slotEl.classList.contains('foundation-slot')) {
                targetType = 'foundation';
                targetIdx = parseInt(slotEl.id.replace('f', ''));
            } else if (slotEl.classList.contains('tableau-col') || slotEl.id.match(/^t\d$/)) {
                targetType = 'tableau';
                targetIdx = parseInt(slotEl.id.replace('t', ''));
            }

            if (targetType !== undefined) {
                this.tryMoveSelected(targetType, targetIdx);
            }
            return;
        }

        // Clicking anywhere else deselects
        if (this.selectedCard && !e.target.closest('#stock')) {
            this.clearSelection();
        }
    }

    selectCard(source, pileIdx, cardIdx) {
        // Can only select face-up cards
        let card;
        if (source === 'waste') {
            card = this.waste[this.waste.length - 1];
            if (!card) return;
        } else if (source === 'foundation') {
            const pile = this.foundations[pileIdx];
            card = pile[pile.length - 1];
            if (!card) return;
        } else if (source === 'tableau') {
            card = this.tableau[pileIdx][cardIdx];
            if (!card || !card.faceUp) return;
            // Verify all cards from cardIdx to end form a valid sequence
            if (!this.isValidTableauSequence(pileIdx, cardIdx)) return;
        }

        this.selectedCard = { source, pileIdx, cardIdx, card };
        this.renderAll();
    }

    clearSelection() {
        this.selectedCard = null;
        this.renderAll();
    }

    isValidTableauSequence(colIdx, fromIdx) {
        const col = this.tableau[colIdx];
        for (let i = fromIdx; i < col.length - 1; i++) {
            const curr = col[i];
            const next = col[i + 1];
            if (!curr.faceUp || !next.faceUp) return false;
            if (curr.color === next.color) return false;
            if (curr.rank !== next.rank + 1) return false;
        }
        return true;
    }

    tryMoveSelected(targetType, targetIdx) {
        if (!this.selectedCard) return;

        const { source, pileIdx, cardIdx, card } = this.selectedCard;
        const targetPile = targetType === 'tableau' ? this.tableau[targetIdx] : this.foundations[targetIdx];
        let valid = false;

        if (targetType === 'tableau') {
            if (targetPile.length === 0) {
                if (card.rank === 13) valid = true;
            } else {
                const top = targetPile[targetPile.length - 1];
                if (top.faceUp && top.color !== card.color && top.rank === card.rank + 1) valid = true;
            }
        } else if (targetType === 'foundation') {
            // Only single cards can go to foundation
            if (source === 'tableau' && cardIdx !== this.tableau[pileIdx].length - 1) {
                this.clearSelection();
                return;
            }
            if (targetPile.length === 0) {
                if (card.rank === 1) valid = true;
            } else {
                const top = targetPile[targetPile.length - 1];
                if (top.suit === card.suit && top.rank === card.rank - 1) valid = true;
            }
        }

        if (valid) {
            this.executeMove(source, pileIdx, cardIdx, targetType, targetIdx);
        }
        this.clearSelection();
    }

    // --- Drag and Drop ---

    handleDragStart(e, card, source, pileIdx, cardIdx) {
        // Verify the card can be dragged (valid sequence from this point)
        if (source === 'tableau' && !this.isValidTableauSequence(pileIdx, cardIdx)) {
            e.preventDefault();
            return;
        }

        const data = JSON.stringify({ source, pileIdx, cardIdx });
        e.dataTransfer.setData('text/plain', data);
        e.dataTransfer.effectAllowed = 'move';
        this.draggedData = { card, source, pileIdx, cardIdx };
    }

    handleDrop(e, targetType, targetIdx) {
        e.preventDefault();
        e.stopPropagation();
        if (!this.draggedData) return;

        const { card, source, pileIdx, cardIdx } = this.draggedData;
        const targetPile = targetType === 'tableau' ? this.tableau[targetIdx] : this.foundations[targetIdx];
        let valid = false;

        if (targetType === 'tableau') {
            if (targetPile.length === 0) {
                if (card.rank === 13) valid = true;
            } else {
                const top = targetPile[targetPile.length - 1];
                if (top.faceUp && top.color !== card.color && top.rank === card.rank + 1) valid = true;
            }
        } else if (targetType === 'foundation') {
            if (source === 'tableau') {
                const tableauCol = this.tableau[pileIdx];
                if (cardIdx !== tableauCol.length - 1) {
                    this.draggedData = null;
                    return;
                }
            }
            if (targetPile.length === 0) {
                if (card.rank === 1) valid = true;
            } else {
                const top = targetPile[targetPile.length - 1];
                if (top.suit === card.suit && top.rank === card.rank - 1) valid = true;
            }
        }

        if (valid) {
            this.executeMove(source, pileIdx, cardIdx, targetType, targetIdx);
        } else {
            EventBus.emit('solitaire:invalid:move', {
                card: `${card.val}${card.suit}`,
                from: `${source}:${pileIdx}`,
                to: `${targetType}:${targetIdx}`,
                reason: 'rules_violation'
            });
        }
        this.draggedData = null;
    }

    // --- Move Execution ---

    executeMove(fromType, fromIdx, fromCardIdx, toType, toIdx) {
        if (this.isWon) return;

        const fromPile = fromType === 'waste'
            ? this.waste
            : fromType === 'foundation'
                ? this.foundations[fromIdx]
                : this.tableau[fromIdx];

        // Capture the faceUp state of the card that will be revealed (the one just
        // above the cards being moved), NOT the top card of the sequence being moved
        let flippedCardPrevState = null;
        if (fromType === 'tableau' && fromCardIdx > 0) {
            const cardBeneath = fromPile[fromCardIdx - 1];
            flippedCardPrevState = cardBeneath.faceUp;
        }

        let cardsToMove = [];
        if (fromType === 'waste') cardsToMove = [this.waste.pop()];
        else if (fromType === 'foundation') cardsToMove = [this.foundations[fromIdx].pop()];
        else if (fromType === 'tableau') {
            const col = this.tableau[fromIdx];
            cardsToMove = col.splice(fromCardIdx);
            // Flip the newly exposed top card
            if (col.length > 0 && !col[col.length - 1].faceUp) {
                col[col.length - 1].faceUp = true;
            }
        }

        this.moveHistory.push({
            type: 'move',
            fromType,
            fromIdx,
            fromCardIdx,
            toType,
            toIdx,
            cards: cardsToMove.map(c => c.id),
            flippedCardPrevState,
            scoreBefore: this.score
        });

        if (toType === 'tableau') {
            this.tableau[toIdx].push(...cardsToMove);
            this.playSound('click');
        } else if (toType === 'foundation') {
            this.foundations[toIdx].push(...cardsToMove);
            this.playSound('collect');
            EventBus.emit('solitaire:foundation:add', {
                card: `${cardsToMove[0].val}${cardsToMove[0].suit}`,
                foundation: toIdx,
                count: this.foundations[toIdx].length
            });
        }

        this.moves++;

        // Scoring
        if (this.getVariant().scoring === 'standard') {
            if (toType === 'foundation') {
                // Waste/tableau to foundation: +10
                this.addScore(10, 'to_foundation');
            } else if (toType === 'tableau' && fromType === 'waste') {
                // Waste to tableau: +5
                this.addScore(5, 'waste_to_tableau');
            } else if (toType === 'tableau' && fromType === 'foundation') {
                // Foundation back to tableau: -15
                this.addScore(-15, 'foundation_to_tableau');
            }
            // Flipping a tableau card: +5 (if we just flipped one)
            if (fromType === 'tableau' && flippedCardPrevState === false) {
                this.addScore(5, 'flip_card');
            }
        }

        this.emitAppEvent('card:moved', {
            card: `${cardsToMove[0].val}${cardsToMove[0].suit}`,
            from: `${fromType}:${fromIdx}`,
            to: `${toType}:${toIdx}`,
            moves: this.moves
        });

        EventBus.emit('solitaire:card:move', {
            card: `${cardsToMove[0].val}${cardsToMove[0].suit}`,
            from: `${fromType}:${fromIdx}`,
            to: `${toType}:${toIdx}`,
            moves: this.moves
        });

        this.renderAll();
        this.checkWin();
        this.checkAutoCompletable();
    }

    // --- Undo ---

    undoLastMove() {
        const lastMove = this.moveHistory.pop();
        if (!lastMove) return;
        if (this.autoCompleting) return;

        if (lastMove.type === 'move') {
            const toPile = lastMove.toType === 'tableau'
                ? this.tableau[lastMove.toIdx]
                : this.foundations[lastMove.toIdx];
            const count = lastMove.cards.length;
            const cards = toPile.splice(toPile.length - count);

            const fromPile = lastMove.fromType === 'waste'
                ? this.waste
                : lastMove.fromType === 'foundation'
                    ? this.foundations[lastMove.fromIdx]
                    : this.tableau[lastMove.fromIdx];

            // Restore the flipped card's faceUp state BEFORE putting cards back
            if (lastMove.fromType === 'tableau' && fromPile.length > 0 &&
                lastMove.flippedCardPrevState !== null) {
                fromPile[fromPile.length - 1].faceUp = lastMove.flippedCardPrevState;
            }

            fromPile.push(...cards);
            this.moves = Math.max(0, this.moves - 1);

            // Restore score
            if (lastMove.scoreBefore !== undefined) {
                this.score = lastMove.scoreBefore;
            }
        } else if (lastMove.type === 'draw') {
            const drawCount = lastMove.count || lastMove.cards.length;
            for (let i = 0; i < drawCount; i++) {
                const card = this.waste.pop();
                if (!card) break;
                card.faceUp = false;
                this.stock.push(card);
            }
        } else if (lastMove.type === 'recycle') {
            const recycleCount = lastMove.recycledCards.length;
            const restored = this.stock.splice(this.stock.length - recycleCount);
            restored.forEach(card => { card.faceUp = true; });
            this.waste = restored.reverse();
            this.stockPasses = Math.max(0, (lastMove.stockPasses || 1) - 1);
        }

        this.isWon = false;
        this.autoCompleting = false;
        this.updateHeader();
        this.renderAll();

        EventBus.emit('solitaire:undo', {
            moveType: lastMove.type,
            moves: this.moves,
            score: this.getDisplayScore()
        });
    }

    // --- Double-Click to Foundation ---

    handleDblClick(card, source, pileIdx) {
        if (this.isWon || this.autoCompleting) return;

        // Only the TOP tableau card can move to a foundation, but the
        // validation below checks the CLICKED card while the move executes
        // with the top index — double-clicking a valid mid-pile card used
        // to push the (unvalidated) top card onto the foundation.
        if (source === 'tableau') {
            const pile = this.tableau[pileIdx];
            if (!pile || pile[pile.length - 1] !== card) return;
        }

        for (let i = 0; i < 4; i++) {
            const pile = this.foundations[i];
            let valid = false;
            if (pile.length === 0) {
                if (card.rank === 1) valid = true;
            } else {
                const top = pile[pile.length - 1];
                if (top.suit === card.suit && top.rank === card.rank - 1) valid = true;
            }

            if (valid) {
                let cIdx = 0;
                if (source === 'tableau') cIdx = this.tableau[pileIdx].length - 1;
                this.executeMove(source, pileIdx, cIdx, 'foundation', i);
                return;
            }
        }
    }

    // --- Auto-Complete ---

    checkAutoCompletable() {
        if (this.isWon || this.autoCompleting) return;

        // All stock/waste cards must be gone, and all tableau cards must be face-up
        if (this.stock.length > 0 || this.waste.length > 0) {
            this.showAutoCompleteButton(false);
            return;
        }

        for (const col of this.tableau) {
            for (const card of col) {
                if (!card.faceUp) {
                    this.showAutoCompleteButton(false);
                    return;
                }
            }
        }

        this.showAutoCompleteButton(true);
    }

    showAutoCompleteButton(show) {
        const btn = this.getElement('#btnAutoComplete');
        if (btn) btn.style.display = show ? 'inline-block' : 'none';
    }

    autoComplete() {
        if (this.isWon || this.autoCompleting) return;
        this.autoCompleting = true;
        this.showAutoCompleteButton(false);
        this.autoCompleteStep();
    }

    autoCompleteStep() {
        if (this.isWon || !this.autoCompleting) return;

        let moved = false;

        // Try to move cards from tableau and waste to foundations
        for (let colIdx = 0; colIdx < 7; colIdx++) {
            const col = this.tableau[colIdx];
            if (col.length === 0) continue;
            const card = col[col.length - 1];

            for (let fi = 0; fi < 4; fi++) {
                const fPile = this.foundations[fi];
                let valid = false;
                if (fPile.length === 0 && card.rank === 1) valid = true;
                else if (fPile.length > 0) {
                    const top = fPile[fPile.length - 1];
                    if (top.suit === card.suit && top.rank === card.rank - 1) valid = true;
                }

                if (valid) {
                    this.executeMove('tableau', colIdx, col.length - 1, 'foundation', fi);
                    moved = true;
                    break;
                }
            }
            if (moved) break;
        }

        if (moved && !this.isWon) {
            this._autoCompleteTimer = setTimeout(() => this.autoCompleteStep(), 80);
        } else {
            this.autoCompleting = false;
        }
    }

    // --- Win Check ---

    checkWin() {
        const total = this.foundations.reduce((acc, f) => acc + f.length, 0);
        if (total === 52 && !this.isWon) {
            this.isWon = true;
            this.autoCompleting = false;
            clearInterval(this.timer);
            if (StateManager.unlockAchievement) StateManager.unlockAchievement('solitaire_master');

            // Bonus for standard scoring based on time
            if (this.getVariant().scoring === 'standard' && this.time > 0) {
                const bonus = Math.max(0, Math.floor(700000 / this.time));
                this.addScore(bonus, 'time_bonus');
            }

            // Update best stats for this variant
            const variant = this.currentGameType;
            const stats = this.bestStats[variant] || (this.bestStats[variant] = { bestTime: null, bestMoves: null, bestScore: 0, wins: 0 });
            const finalScore = this.getDisplayScore();
            const newTime  = stats.bestTime  === null || this.time  < stats.bestTime;
            const newMoves = stats.bestMoves === null || this.moves < stats.bestMoves;
            const newScore = finalScore > (stats.bestScore || 0);
            if (newTime)  stats.bestTime  = this.time;
            if (newMoves) stats.bestMoves = this.moves;
            if (newScore) stats.bestScore = finalScore;
            stats.wins = (stats.wins || 0) + 1;
            this._saveBestStats(variant);

            this.lastWinRecord = { newTime, newMoves, newScore };

            this.emitAppEvent('game:won', {
                moves: this.moves, time: this.time,
                score: finalScore, variant,
                isNewTimeRecord: newTime, isNewMovesRecord: newMoves, isNewScoreRecord: newScore
            });

            EventBus.emit('solitaire:win', {
                moves: this.moves, time: this.time, gameType: variant
            });
            EventBus.emit('game:over', {
                appId: 'solitaire', won: true,
                score: finalScore, time: this.time,
                stats: { moves: this.moves, variant }
            });

            this.showWinScreen();
        }
    }

    showWinScreen() {
        const overlay = this.getElement('#winOverlay');
        if (!overlay) return;
        const stats = this.bestStats[this.currentGameType] || { bestTime: null, bestMoves: null, bestScore: 0, wins: 0 };
        const set = (sel, val) => { const el = this.getElement(sel); if (el) el.textContent = val; };
        set('#winTime',      this.formatTime(this.time));
        set('#winMoves',     this.moves);
        set('#winScore',     this.getDisplayScore());
        set('#winBestTime',  stats.bestTime  !== null ? `Best: ${this.formatTime(stats.bestTime)}`  : 'Best: —');
        set('#winBestMoves', stats.bestMoves !== null ? `Best: ${stats.bestMoves}` : 'Best: —');
        set('#winBestScore', `Best: ${stats.bestScore || 0}`);
        set('#winWins',      stats.wins || 0);

        const record = this.getElement('#winRecordBadge');
        if (record) {
            const isRecord = !!(this.lastWinRecord && (this.lastWinRecord.newTime || this.lastWinRecord.newMoves || this.lastWinRecord.newScore));
            record.classList.toggle('hidden', !isRecord);
        }

        overlay.classList.add('active');
        this.playSound('achievement');
        this.startVictoryAnimation();
    }

    hideWinScreen() {
        const overlay = this.getElement('#winOverlay');
        if (overlay) overlay.classList.remove('active');
        if (this.victoryAnimFrame) {
            cancelAnimationFrame(this.victoryAnimFrame);
            this.victoryAnimFrame = null;
        }
    }

    startVictoryAnimation() {
        const canvas = this.getElement('#winCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        const suits = ['♠', '♥', '♦', '♣'];
        const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const cardW = 50, cardH = 70;
        const particles = [];

        // Create 52 cascading card particles launched from the 4 foundation positions
        for (let s = 0; s < 4; s++) {
            for (let r = 0; r < 13; r++) {
                const startX = (canvas.width * 0.55) + s * 68;
                particles.push({
                    x: startX,
                    y: 20,
                    vx: (Math.random() - 0.5) * 6,
                    vy: -(Math.random() * 6 + 2),
                    gravity: 0.15,
                    bounce: 0.6 + Math.random() * 0.2,
                    suit: suits[s],
                    rank: ranks[r],
                    color: (s === 1 || s === 2) ? '#d00' : '#000',
                    delay: (s * 13 + r) * 50,
                    rotation: 0,
                    rotationSpeed: (Math.random() - 0.5) * 0.15,
                    active: false
                });
            }
        }

        const startTime = Date.now();
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const elapsed = Date.now() - startTime;

            for (const p of particles) {
                if (elapsed < p.delay) continue;
                p.active = true;

                p.vy += p.gravity;
                p.x += p.vx;
                p.y += p.vy;
                p.rotation += p.rotationSpeed;

                // Bounce off bottom
                if (p.y + cardH > canvas.height) {
                    p.y = canvas.height - cardH;
                    p.vy = -Math.abs(p.vy) * p.bounce;
                    if (Math.abs(p.vy) < 1) p.vy = 0;
                }
                // Bounce off sides
                if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
                if (p.x + cardW > canvas.width) { p.x = canvas.width - cardW; p.vx = -Math.abs(p.vx); }

                ctx.save();
                ctx.translate(p.x + cardW / 2, p.y + cardH / 2);
                ctx.rotate(p.rotation);

                // Card body
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(-cardW / 2, -cardH / 2, cardW, cardH, 3);
                ctx.fill();
                ctx.stroke();

                // Card text
                ctx.fillStyle = p.color;
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(p.rank, -cardW / 2 + 3, -cardH / 2 + 12);
                ctx.font = '22px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(p.suit, 0, 8);

                ctx.restore();
            }

            if (particles.some(p => !p.active || Math.abs(p.vy) > 0.5 || p.y + cardH < canvas.height - 1)) {
                this.victoryAnimFrame = requestAnimationFrame(animate);
            }
        };
        this.victoryAnimFrame = requestAnimationFrame(animate);
    }

    // --- Display ---

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${String(secs).padStart(2, '0')}`;
    }

    updateHeader() {
        const t = this.getElement('#timer');
        const s = this.getElement('#score');
        const m = this.getElement('#moveCount');
        const undoBtn = this.getElement('#btnUndo');
        if (t) t.innerText = this.formatTime(this.time);
        if (s) s.innerText = this.getDisplayScore();
        if (m) m.innerText = this.moves;
        if (undoBtn) undoBtn.disabled = this.moveHistory.length === 0;
    }

    renderAll() {
        this.renderStock();
        this.renderWaste();

        [0, 1, 2, 3].forEach(i => {
            const el = this.getElement(`#f${i}`);
            if (!el) return;
            el.innerHTML = '';
            const pile = this.foundations[i];
            const suitHint = ['♠', '♥', '♦', '♣'][i];
            const suitColor = (i === 1 || i === 2) ? 'sol-hint-red' : 'sol-hint-black';
            if (pile.length === 0) {
                el.innerHTML = `<div class="placeholder sol-foundation-hint ${suitColor}">${suitHint}</div>`;
            } else {
                const card = pile[pile.length - 1];
                const cardEl = this.createCardElement(card, 'foundation', i, pile.length - 1);
                // Highlight if selected
                if (this.selectedCard && this.selectedCard.source === 'foundation' &&
                    this.selectedCard.pileIdx === i) {
                    cardEl.classList.add('sol-selected');
                }
                el.appendChild(cardEl);
            }

            // Add drop highlight for valid targets
            if (this.selectedCard) {
                const canDrop = this.canDropOnFoundation(i);
                el.classList.toggle('sol-valid-target', canDrop);
            } else {
                el.classList.remove('sol-valid-target');
            }
        });

        [0, 1, 2, 3, 4, 5, 6].forEach(i => {
            const el = this.getElement(`#t${i}`);
            if (!el) return;
            el.innerHTML = '';

            if (this.tableau[i].length === 0 && this.selectedCard) {
                // Show placeholder for empty columns (Kings can go here)
                const canDrop = this.selectedCard.card.rank === 13;
                el.classList.toggle('sol-valid-target', canDrop);
            } else {
                el.classList.remove('sol-valid-target');
            }

            this.tableau[i].forEach((card, idx) => {
                const cardEl = this.createCardElement(card, 'tableau', i, idx);
                cardEl.style.top = `${idx * 25}px`;
                cardEl.style.zIndex = idx + 1;

                // Highlight selected cards
                if (this.selectedCard && this.selectedCard.source === 'tableau' &&
                    this.selectedCard.pileIdx === i && idx >= this.selectedCard.cardIdx) {
                    cardEl.classList.add('sol-selected');
                }

                el.appendChild(cardEl);
            });
        });

        this.updateHeader();
    }

    canDropOnFoundation(foundIdx) {
        if (!this.selectedCard) return false;
        const { card, source, pileIdx, cardIdx } = this.selectedCard;

        // Only single cards can go to foundation
        if (source === 'tableau' && cardIdx !== this.tableau[pileIdx].length - 1) return false;

        const pile = this.foundations[foundIdx];
        if (pile.length === 0) return card.rank === 1;
        const top = pile[pile.length - 1];
        return top.suit === card.suit && top.rank === card.rank - 1;
    }

    renderStock() {
        const el = this.getElement('#stock');
        if (!el) return;

        if (this.stock.length) {
            el.innerHTML = '<div class="sol-card sol-back"></div>';
        } else {
            // Check if recycling is allowed
            const variant = this.getVariant();
            const canRecycle = this.waste.length > 0 &&
                (variant.scoring !== 'vegas' || variant.maxPasses === undefined ||
                 this.stockPasses < variant.maxPasses);
            el.innerHTML = canRecycle
                ? '<div class="placeholder sol-recycle">&#x21bb;</div>'
                : '<div class="placeholder"></div>';
        }
    }

    renderWaste() {
        const el = this.getElement('#waste');
        if (!el) return;
        el.innerHTML = '';

        if (this.waste.length === 0) return;

        const drawCount = this.getVariant().drawCount;

        if (drawCount === 3) {
            // Show up to 3 fanned waste cards, only the top one is interactive
            const startIdx = Math.max(0, this.waste.length - 3);
            for (let i = startIdx; i < this.waste.length; i++) {
                const card = this.waste[i];
                const isTop = i === this.waste.length - 1;
                const offset = (i - startIdx) * 18;
                const cardEl = this.createCardElement(
                    card,
                    isTop ? 'waste' : null,
                    0,
                    i
                );
                cardEl.style.left = `${offset}px`;
                cardEl.style.zIndex = i - startIdx + 1;
                if (!isTop) {
                    cardEl.draggable = false;
                    cardEl.classList.add('sol-waste-fan');
                }
                // Highlight selected waste card
                if (isTop && this.selectedCard && this.selectedCard.source === 'waste') {
                    cardEl.classList.add('sol-selected');
                }
                el.appendChild(cardEl);
            }
        } else {
            // Draw 1: show only top card
            const card = this.waste[this.waste.length - 1];
            const cardEl = this.createCardElement(card, 'waste', 0, this.waste.length - 1);
            if (this.selectedCard && this.selectedCard.source === 'waste') {
                cardEl.classList.add('sol-selected');
            }
            el.appendChild(cardEl);
        }
    }

    createCardElement(card, source, pileIdx, cardIdx) {
        const div = document.createElement('div');
        div.className = `sol-card ${card.color}`;

        if (!card.faceUp) {
            div.classList.add('sol-back');
            div.innerHTML = '<div class="sol-back-inner"></div>';
            return div;
        }

        const isFace = ['J', 'Q', 'K'].includes(card.val);
        const faceSymbol = isFace ? { J: '🤴', Q: '👸', K: '🤴' }[card.val] : '';

        div.innerHTML = `
            <div class="card-corner top-left">
                <span class="card-rank">${card.val}</span>
                <span class="card-suit-small">${card.suit}</span>
            </div>
            <div class="card-center">${isFace ? `<span class="card-face-icon">${faceSymbol}</span>` : card.suit}</div>
            <div class="card-corner btm-right">
                <span class="card-rank">${card.val}</span>
                <span class="card-suit-small">${card.suit}</span>
            </div>
        `;

        if (source) {
            div.draggable = true;
            div.dataset.source = source;
            div.dataset.pileIdx = pileIdx;
            div.dataset.cardIdx = cardIdx;
            div.addEventListener('dragstart', (e) => this.handleDragStart(e, card, source, pileIdx, cardIdx));
            div.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                this.clearSelection();
                this.handleDblClick(card, source, pileIdx);
            });
        }

        return div;
    }

    get suits() { return ['♠', '♥', '♦', '♣']; }
    get colors() { return { '♠': 'black', '♥': 'red', '♦': 'red', '♣': 'black' }; }
    get values() { return ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']; }

    // --- Multiplayer ---

}

const style = document.createElement('style');
style.textContent = `
    /* =============================================
       Solitaire - Polished Retro Theme
       ============================================= */

    .solitaire-app {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        background: radial-gradient(ellipse at 40% 30%, #1a8f1a 0%, #0a6e0a 50%, #045204 100%);
        font-family: 'Segoe UI', Tahoma, sans-serif;
        overflow: hidden;
        user-select: none;
        position: relative;
    }

    /* --- Toolbar --- */
    .solitaire-bar {
        flex: 0 0 36px;
        background: var(--win95-gray, #c0c0c0);
        display: flex;
        align-items: center;
        padding: 0 6px;
        border-bottom: 1px solid #808080;
        box-shadow: inset 0 1px 0 #fff;
        gap: 4px;
    }
    .sol-bar-left { display: flex; align-items: center; gap: 3px; }
    .sol-bar-center { margin-left: 8px; }
    .sol-bar-right { margin-left: auto; display: flex; align-items: center; gap: 6px; }

    .sol-btn {
        display: inline-flex; align-items: center; gap: 3px;
        border: 2px outset #ddd; background: var(--win95-gray, #c0c0c0);
        cursor: pointer; padding: 2px 8px; font-size: 12px;
        font-family: inherit; white-space: nowrap;
    }
    .sol-btn:hover { background: #d0d0d0; }
    .sol-btn:active:not(:disabled) { border-style: inset; }
    .sol-btn:disabled { opacity: 0.5; cursor: default; }
    .sol-btn-icon { font-size: 13px; }
    .sol-btn-accent { background: #b8d8b8; border-color: #90c090; }
    .sol-btn-accent:hover { background: #a0d0a0; }

    .sol-select {
        height: 22px; border: 2px inset #aaa;
        background: #fff; font-size: 12px; font-family: inherit;
        padding: 0 2px; cursor: pointer;
    }

    .sol-stat {
        display: flex; flex-direction: column; align-items: center;
        background: #000; border: 2px inset #808080; padding: 1px 8px;
        min-width: 48px;
    }
    .sol-stat-label {
        font-size: 9px; color: #888; text-transform: uppercase;
        letter-spacing: 0.5px; line-height: 1;
    }
    .sol-stat-value {
        font-family: 'Courier New', monospace; font-size: 13px;
        color: #33ff33; font-weight: bold; line-height: 1.2;
    }

    /* --- Table --- */
    .solitaire-table {
        flex: 1;
        overflow-y: auto;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 18px;
        position: relative;
    }

    .top-area {
        display: flex;
        justify-content: space-between;
        height: 100px;
        flex-shrink: 0;
    }

    .tableau-area {
        display: flex;
        justify-content: space-between;
        flex: 1;
        min-height: 400px;
        padding-bottom: 50px;
    }

    .pile-group { display: flex; gap: 12px; }

    /* --- Card Slots --- */
    .card-slot {
        width: 68px; height: 96px;
        border-radius: 5px;
        position: relative;
        transition: background-color 0.15s, box-shadow 0.15s;
    }
    .stock-slot {
        border: 2px solid rgba(255,255,255,0.15);
        background: rgba(0,60,0,0.3);
        cursor: pointer;
    }
    .foundation-slot {
        border: 2px solid rgba(255,255,255,0.12);
        background: rgba(0,60,0,0.25);
    }
    .foundation-slot.sol-valid-target {
        background: rgba(255, 255, 100, 0.18);
        box-shadow: inset 0 0 10px rgba(255, 255, 100, 0.35), 0 0 6px rgba(255,255,100,0.2);
    }

    .tableau-col {
        width: 13%;
        max-width: 82px;
        position: relative;
        min-height: 100px;
        border-radius: 5px;
        transition: background-color 0.15s, box-shadow 0.15s;
    }
    .tableau-col.sol-valid-target {
        background: rgba(255, 255, 100, 0.12);
        box-shadow: inset 0 0 8px rgba(255, 255, 100, 0.25);
    }

    /* --- Placeholders --- */
    .placeholder {
        width: 100%; height: 100%;
        display: flex; justify-content: center; align-items: center;
        color: rgba(255,255,255,0.2); font-size: 20px;
        border-radius: 5px;
    }
    .sol-foundation-hint { font-size: 28px; opacity: 0.7; }
    .sol-hint-red { color: rgba(200, 50, 50, 0.4); }
    .sol-hint-black { color: rgba(255, 255, 255, 0.2); }
    .placeholder.sol-recycle {
        cursor: pointer; font-size: 32px;
        color: rgba(255,255,255,0.4);
        transition: color 0.15s, transform 0.15s;
    }
    .placeholder.sol-recycle:hover {
        color: rgba(255,255,255,0.75);
        transform: scale(1.1);
    }

    /* --- Cards --- */
    .sol-card {
        width: 68px; height: 96px;
        background: #fffef7;
        border: 1px solid #999;
        border-radius: 5px;
        position: absolute;
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
        cursor: grab;
        box-sizing: border-box;
        z-index: 10;
        transition: box-shadow 0.12s, transform 0.12s;
    }
    .sol-card:hover:not(.sol-back):not(.sol-waste-fan) {
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        transform: translateY(-1px);
    }
    .sol-card:active:not(.sol-back) { cursor: grabbing; }

    /* Card back - classic blue cross-hatch */
    .sol-back {
        background: #1a237e;
        border: 2.5px solid #fff;
        cursor: default;
        overflow: hidden;
    }
    .sol-back-inner {
        width: 100%; height: 100%;
        background:
            repeating-linear-gradient(
                45deg,
                transparent, transparent 3px,
                rgba(255,255,255,0.12) 3px, rgba(255,255,255,0.12) 4px
            ),
            repeating-linear-gradient(
                -45deg,
                transparent, transparent 3px,
                rgba(255,255,255,0.12) 3px, rgba(255,255,255,0.12) 4px
            );
        border-radius: 2px;
    }

    .sol-card.red { color: #c62828; }
    .sol-card.black { color: #1a1a1a; }

    .sol-card.sol-selected {
        box-shadow: 0 0 0 2.5px #ffd700, 0 0 12px rgba(255,215,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
        transform: translateY(-4px);
        z-index: 200 !important;
    }

    .sol-waste-fan {
        pointer-events: none;
        cursor: default;
    }

    /* Card corner labels */
    .card-corner {
        position: absolute;
        display: flex; flex-direction: column; align-items: center;
        line-height: 1; gap: 0;
    }
    .top-left { top: 4px; left: 5px; }
    .btm-right { bottom: 4px; right: 5px; transform: rotate(180deg); }
    .card-rank { font-size: 13px; font-weight: 700; }
    .card-suit-small { font-size: 10px; margin-top: -1px; }

    /* Card center */
    .card-center {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        font-size: 28px;
        line-height: 1;
    }
    .card-face-icon { font-size: 24px; filter: grayscale(0.2); }

    /* --- Waste --- */
    .waste-slot { min-width: 110px; overflow: visible; }

    /* --- Win Overlay --- */
    .sol-win-overlay {
        position: absolute; inset: 0;
        background: rgba(0, 20, 0, 0.75);
        display: none; align-items: center; justify-content: center;
        z-index: 500;
        backdrop-filter: blur(2px);
    }
    .sol-win-overlay.active { display: flex; }
    .sol-win-canvas {
        position: absolute; inset: 0;
        width: 100%; height: 100%;
        pointer-events: none;
    }
    .sol-win-dialog {
        position: relative; z-index: 10;
        background: linear-gradient(180deg, #fff8e1 0%, #ffe082 100%);
        border: 3px outset #ffd54f;
        padding: 28px 40px;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.8);
        min-width: 220px;
    }
    .sol-win-title {
        font-size: 26px; font-weight: bold;
        color: #2e7d32;
        text-shadow: 1px 1px 0 rgba(255,255,255,0.6);
        margin-bottom: 16px;
    }
    .sol-win-record {
        background: #fff;
        color: #884c00;
        padding: 4px 14px;
        border: 2px solid #b88c00;
        border-radius: 3px;
        font-size: 12px;
        font-weight: bold;
        letter-spacing: 2px;
        text-align: center;
        box-shadow: 0 0 12px rgba(255, 200, 60, 0.7);
        margin-bottom: 12px;
        animation: sol-record-pulse 0.7s ease-in-out infinite alternate;
    }
    .sol-win-record.hidden { display: none; }
    @keyframes sol-record-pulse {
        from { box-shadow: 0 0 6px rgba(255, 200, 60, 0.4); }
        to   { box-shadow: 0 0 18px rgba(255, 200, 60, 0.95); }
    }
    .sol-win-stats {
        margin-bottom: 18px;
        display: flex;
        flex-direction: column;
        gap: 4px;
    }
    .sol-win-row {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 12px;
        padding: 4px 8px;
        font-size: 13px;
        background: rgba(0, 0, 0, 0.06);
        border-radius: 3px;
    }
    .sol-win-row-wins {
        grid-template-columns: 1fr auto;
        background: rgba(0, 100, 0, 0.08);
    }
    .sol-win-lbl {
        text-align: right;
        font-weight: bold;
        color: #4a3500;
        text-transform: uppercase;
        font-size: 11px;
        letter-spacing: 0.6px;
    }
    .sol-win-num {
        text-align: center;
        font-weight: bold;
        font-family: 'Courier New', monospace;
        font-size: 16px;
        color: #2a1500;
        min-width: 50px;
    }
    .sol-win-best {
        text-align: left;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        color: #6a4500;
        opacity: 0.85;
    }
    .sol-btn-win {
        margin-top: 4px; padding: 6px 24px;
        font-size: 14px; font-weight: bold;
        background: #4caf50; color: #fff;
        border: 2px outset #66bb6a;
        cursor: pointer;
    }
    .sol-btn-win:hover { background: #43a047; }
    .sol-btn-win:active { border-style: inset; }
`;

if (!document.getElementById('solitaire-css')) {
    style.id = 'solitaire-css';
    document.head.appendChild(style);
}

export default Solitaire;
