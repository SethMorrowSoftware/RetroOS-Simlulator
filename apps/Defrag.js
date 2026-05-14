/**
 * Disk Defragmenter - Classic Windows 95/98 Defrag
 * The satisfying block-moving visualization
 */

import AppBase from './AppBase.js';
import EventBus from '../core/EventBus.js';
import { escapeHtml } from '../core/Sanitize.js';

class Defrag extends AppBase {
    constructor() {
        super({
            id: 'defrag',
            name: 'Disk Defragmenter',
            icon: '💾',
            width: 600,
            height: 520,
            minWidth: 480,
            minHeight: 440,
            resizable: true,
            singleton: true,
            category: 'systemtools'
        });

        this.isRunning = false;
        this.isPaused = false;
        this.blocks = [];
        this.totalBlocks = 0;
        this.processedBlocks = 0;
        this.animationInterval = null;
        this.currentAction = '';
        this.selectedDrive = 'C:';
        this.fragmentedPercent = 0;

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('analyze', () => {
            this.analyze();
            return { success: true };
        });

        this.registerCommand('defragment', () => {
            this.defragment();
            return { success: true };
        });

        this.registerCommand('pause', () => {
            if (this.isRunning && !this.isPaused) {
                this.togglePause();
                return { success: true };
            }
            return { success: false, error: 'Not running or already paused' };
        });

        this.registerCommand('stop', () => {
            this.stop();
            return { success: true };
        });

        this.registerCommand('selectDrive', (payload) => {
            if (!payload || !payload.drive) return { success: false, error: 'No drive provided' };
            this.selectedDrive = payload.drive;
            const driveSelect = this.getElement('#driveSelect');
            if (driveSelect) driveSelect.value = payload.drive;
            this.updateDriveInfo();
            this.generateBlockMap();
            return { success: true, drive: payload.drive };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getState', () => {
            return {
                isRunning: this.isRunning,
                isPaused: this.isPaused,
                selectedDrive: this.selectedDrive,
                fragmentedPercent: this.fragmentedPercent,
                progress: parseInt(this.getElement('#progressText')?.textContent) || 0
            };
        });
    }

    onOpen() {
        return `
            <style>
                .defrag-container {
                    background: #c0c0c0;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                    font-size: 12px;
                }
                .defrag-header {
                    padding: 10px;
                    border-bottom: 2px groove #fff;
                }
                .defrag-drive-select {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                }
                .defrag-drive-select select {
                    padding: 3px;
                    border: 2px inset #fff;
                    min-width: 200px;
                }
                .defrag-info {
                    background: white;
                    border: 2px inset #fff;
                    padding: 8px;
                    margin-bottom: 10px;
                }
                .defrag-info-row {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 3px;
                }
                .defrag-map-container {
                    flex: 1;
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                }
                .defrag-map-label {
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                .defrag-map {
                    flex: 1;
                    background: #000;
                    border: 2px inset #fff;
                    display: grid;
                    grid-template-columns: repeat(40, 1fr);
                    gap: 1px;
                    padding: 5px;
                    overflow: hidden;
                }
                .defrag-block {
                    aspect-ratio: 1;
                    min-height: 8px;
                    transition: background-color 0.1s;
                }
                .defrag-block.empty { background: #000; }
                .defrag-block.used { background: #00f; }
                .defrag-block.fragmented { background: #f00; }
                .defrag-block.optimized { background: #0f0; }
                .defrag-block.moving { background: #ff0; }
                .defrag-block.system { background: #808080; }
                .defrag-block.reading { background: #0ff; }
                .defrag-block.writing { background: #f0f; }
                .defrag-legend {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 15px;
                    padding: 10px;
                    border-top: 2px groove #fff;
                    background: #c0c0c0;
                }
                .defrag-legend-item {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 12px;
                }
                .defrag-legend-color {
                    width: 12px;
                    height: 12px;
                    border: 1px solid #000;
                }
                .defrag-progress {
                    padding: 10px;
                    border-top: 2px groove #fff;
                }
                .defrag-progress-bar {
                    height: 20px;
                    background: white;
                    border: 2px inset #fff;
                    position: relative;
                    overflow: hidden;
                }
                .defrag-progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #000080 0%, #0000ff 100%);
                    transition: width 0.3s;
                }
                .defrag-progress-text {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    font-size: 12px;
                    font-weight: bold;
                    color: #000;
                    mix-blend-mode: difference;
                }
                .defrag-status {
                    padding: 5px 10px;
                    font-size: 12px;
                    color: #000;
                }
                .defrag-controls {
                    padding: 10px;
                    display: flex;
                    gap: 10px;
                    border-top: 2px groove #fff;
                }
                .defrag-btn {
                    padding: 5px 20px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    font-weight: bold;
                    min-width: 80px;
                }
                .defrag-btn:active:not(:disabled) {
                    border-style: inset;
                }
                .defrag-btn:disabled {
                    color: #808080;
                    cursor: not-allowed;
                }
            </style>
            <div class="defrag-container">
                <div class="defrag-header">
                    <div class="defrag-drive-select">
                        <label><strong>Select Drive:</strong></label>
                        <select id="driveSelect">
                            <option value="C:">Local Disk (C:) - 10.0 GB</option>
                            <option value="D:">CD-ROM (D:) - 650 MB</option>
                            <option value="A:">Floppy (A:) - 1.44 MB</option>
                        </select>
                    </div>
                    <div class="defrag-info">
                        <div class="defrag-info-row">
                            <span>Drive <span id="driveLetter">C:</span></span>
                            <span>FAT32</span>
                        </div>
                        <div class="defrag-info-row">
                            <span>Total Size: <span id="totalSize">10.0 GB</span></span>
                            <span>Free Space: <span id="freeSpace">4.2 GB</span></span>
                        </div>
                        <div class="defrag-info-row">
                            <span>Fragmentation: <span id="fragPercent">23%</span></span>
                            <span id="recommendation">Defragmentation recommended</span>
                        </div>
                    </div>
                </div>

                <div class="defrag-map-container">
                    <div class="defrag-map-label">Drive Map:</div>
                    <div class="defrag-map" id="blockMap">
                        <!-- Blocks will be generated here -->
                    </div>
                </div>

                <div class="defrag-legend">
                    <div class="defrag-legend-item">
                        <div class="defrag-legend-color" style="background: #00f;"></div>
                        <span>Used</span>
                    </div>
                    <div class="defrag-legend-item">
                        <div class="defrag-legend-color" style="background: #f00;"></div>
                        <span>Fragmented</span>
                    </div>
                    <div class="defrag-legend-item">
                        <div class="defrag-legend-color" style="background: #0f0;"></div>
                        <span>Optimized</span>
                    </div>
                    <div class="defrag-legend-item">
                        <div class="defrag-legend-color" style="background: #ff0;"></div>
                        <span>Moving</span>
                    </div>
                    <div class="defrag-legend-item">
                        <div class="defrag-legend-color" style="background: #808080;"></div>
                        <span>System</span>
                    </div>
                    <div class="defrag-legend-item">
                        <div class="defrag-legend-color" style="background: #000;"></div>
                        <span>Free</span>
                    </div>
                </div>

                <div class="defrag-progress">
                    <div class="defrag-progress-bar">
                        <div class="defrag-progress-fill" id="progressFill" style="width: 0%;"></div>
                        <div class="defrag-progress-text" id="progressText">0%</div>
                    </div>
                </div>

                <div class="defrag-status" id="statusText">
                    Ready. Click "Analyze" to check fragmentation or "Defragment" to begin.
                </div>

                <div class="defrag-controls">
                    <button class="defrag-btn" id="btnAnalyze">Analyze</button>
                    <button class="defrag-btn" id="btnDefrag">Defragment</button>
                    <button class="defrag-btn" id="btnPause" disabled>Pause</button>
                    <button class="defrag-btn" id="btnStop" disabled>Stop</button>
                    <div style="flex: 1;"></div>
                    <button class="defrag-btn" id="btnClose">Close</button>
                </div>
            </div>
        `;
    }

    onMount() {
        // Generate initial block map
        this.generateBlockMap();

        // Button handlers
        this.addHandler(this.getElement('#btnAnalyze'), 'click', () => this.analyze());
        this.addHandler(this.getElement('#btnDefrag'), 'click', () => this.defragment());
        this.addHandler(this.getElement('#btnPause'), 'click', () => this.togglePause());
        this.addHandler(this.getElement('#btnStop'), 'click', () => this.stop());
        this.addHandler(this.getElement('#btnClose'), 'click', () => this.close());

        // Drive select
        this.addHandler(this.getElement('#driveSelect'), 'change', (e) => {
            this.selectedDrive = e.target.value;
            this.updateDriveInfo();
            this.generateBlockMap();
        });
    }

    onClose() {
        this.stop();
    }

    generateBlockMap() {
        const map = this.getElement('#blockMap');
        if (!map) return;

        // Clear existing blocks
        map.innerHTML = '';
        this.blocks = [];

        // Calculate rows based on container height (approximately)
        const rows = 15;
        const cols = 40;
        this.totalBlocks = rows * cols;

        // Generate blocks with random states
        for (let i = 0; i < this.totalBlocks; i++) {
            const block = document.createElement('div');
            block.className = 'defrag-block';
            block.dataset.index = i;

            // Determine block state
            let state;
            const rand = Math.random();

            if (i < 20) {
                // First blocks are system files
                state = 'system';
            } else if (rand < 0.15) {
                state = 'empty';
            } else if (rand < 0.35) {
                state = 'fragmented';
            } else {
                state = 'used';
            }

            block.classList.add(state);
            this.blocks.push({ element: block, state: state, originalState: state });
            map.appendChild(block);
        }

        // Calculate fragmentation percentage
        const fragmented = this.blocks.filter(b => b.state === 'fragmented').length;
        const total = this.blocks.filter(b => b.state !== 'empty' && b.state !== 'system').length;
        this.fragmentedPercent = total > 0 ? Math.round((fragmented / total) * 100) : 0;

        this.updateFragmentationDisplay();
    }

    updateDriveInfo() {
        const driveInfo = {
            'C:': { size: '10.0 GB', free: '4.2 GB', fs: 'FAT32' },
            'D:': { size: '650 MB', free: '0 MB', fs: 'CDFS' },
            'A:': { size: '1.44 MB', free: '1.2 MB', fs: 'FAT' }
        };

        const info = driveInfo[this.selectedDrive];
        const driveLetter = this.getElement('#driveLetter');
        const totalSize = this.getElement('#totalSize');
        const freeSpace = this.getElement('#freeSpace');

        if (driveLetter) driveLetter.textContent = this.selectedDrive;
        if (totalSize) totalSize.textContent = info.size;
        if (freeSpace) freeSpace.textContent = info.free;
    }

    updateFragmentationDisplay() {
        const fragPercent = this.getElement('#fragPercent');
        const recommendation = this.getElement('#recommendation');

        if (fragPercent) {
            fragPercent.textContent = `${this.fragmentedPercent}%`;
        }

        if (recommendation) {
            if (this.fragmentedPercent > 20) {
                recommendation.textContent = 'Defragmentation recommended';
                recommendation.style.color = '#c00';
            } else if (this.fragmentedPercent > 10) {
                recommendation.textContent = 'Defragmentation suggested';
                recommendation.style.color = '#880';
            } else {
                recommendation.textContent = 'No defragmentation needed';
                recommendation.style.color = '#080';
            }
        }
    }

    async analyze() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.updateStatus('Analyzing drive...');
        this.setButtonStates(true);
        this.playSound('floppy');

        // Simulate analysis by scanning blocks
        for (let i = 0; i < this.blocks.length; i++) {
            if (!this.isRunning) break;

            const block = this.blocks[i];
            const originalClass = block.element.className;

            // Show reading animation
            block.element.classList.add('reading');
            await this.sleep(10);
            block.element.className = originalClass;

            // Update progress
            const progress = Math.round((i / this.blocks.length) * 100);
            this.updateProgress(progress);
            this.updateStatus(`Analyzing cluster ${i + 1} of ${this.blocks.length}...`);
        }

        this.isRunning = false;
        this.setButtonStates(false);
        this.updateProgress(100);
        this.updateStatus(`Analysis complete. ${this.fragmentedPercent}% fragmentation found.`);
        this.playSound('notify');

        // Emit analysis complete event
        this.emitAppEvent('analysis:complete', {
            drive: this.selectedDrive,
            fragmentation: this.fragmentedPercent,
            totalBlocks: this.blocks.length
        });
    }

    async defragment() {
        if (this.isRunning) return;

        this.isRunning = true;
        this.isPaused = false;
        this.processedBlocks = 0;
        this.updateStatus('Starting defragmentation...');
        this.setButtonStates(true);
        this.playSound('floppy');

        // Emit defrag started event
        this.emitAppEvent('defrag:start', {
            drive: this.selectedDrive,
            fragmentation: this.fragmentedPercent
        });

        const fragmentedBlocks = this.blocks.filter(b => b.state === 'fragmented');
        const emptyBlocks = this.blocks.filter(b => b.state === 'empty');

        // Phase 1: Move fragmented blocks to consolidate
        this.updateStatus('Phase 1: Moving fragmented files...');

        for (let i = 0; i < fragmentedBlocks.length; i++) {
            while (this.isPaused) {
                await this.sleep(100);
            }
            if (!this.isRunning) break;

            const block = fragmentedBlocks[i];

            // Show moving animation
            block.element.classList.remove('fragmented');
            block.element.classList.add('moving');
            this.updateStatus(`Moving cluster ${i + 1} of ${fragmentedBlocks.length}...`);

            await this.sleep(50);

            // Change to optimized
            block.element.classList.remove('moving');
            block.element.classList.add('optimized');
            block.state = 'optimized';

            this.processedBlocks++;
            const progress = Math.round((this.processedBlocks / fragmentedBlocks.length) * 50);
            this.updateProgress(progress);
        }

        // Phase 2: Optimize remaining blocks
        const usedBlocks = this.blocks.filter(b => b.state === 'used');
        if (this.isRunning) {
            this.updateStatus('Phase 2: Optimizing file placement...');
            for (let i = 0; i < usedBlocks.length; i++) {
                while (this.isPaused) {
                    await this.sleep(100);
                }
                if (!this.isRunning) break;

                const block = usedBlocks[i];

                // Brief moving animation
                block.element.classList.remove('used');
                block.element.classList.add('moving');

                await this.sleep(20);

                block.element.classList.remove('moving');
                block.element.classList.add('optimized');
                block.state = 'optimized';

                const progress = 50 + Math.round((i / usedBlocks.length) * 50);
                this.updateProgress(progress);
                this.updateStatus(`Optimizing cluster ${i + 1} of ${usedBlocks.length}...`);
            }
        }

        if (this.isRunning) {
            this.fragmentedPercent = 0;
            this.updateFragmentationDisplay();
            this.updateStatus('Defragmentation complete! Drive is now optimized.');
            this.updateProgress(100);
            this.playSound('tada');

            // Emit defrag complete event
            this.emitAppEvent('defrag:complete', {
                drive: this.selectedDrive,
                optimizedBlocks: fragmentedBlocks.length + usedBlocks.length
            });
        }

        this.isRunning = false;
        this.setButtonStates(false);
    }

    togglePause() {
        this.isPaused = !this.isPaused;
        const btn = this.getElement('#btnPause');
        if (btn) {
            btn.textContent = this.isPaused ? 'Resume' : 'Pause';
        }
        this.updateStatus(this.isPaused ? 'Paused.' : 'Resuming...');
        this.playSound('click');
    }

    stop() {
        const wasRunning = this.isRunning;
        this.isRunning = false;
        this.isPaused = false;
        this.setButtonStates(false);
        this.updateStatus('Defragmentation stopped.');

        // Emit stop event if it was running
        if (wasRunning) {
            this.emitAppEvent('defrag:stopped', {
                drive: this.selectedDrive,
                progress: parseInt(this.getElement('#progressText')?.textContent) || 0
            });
        }
    }

    setButtonStates(running) {
        const analyze = this.getElement('#btnAnalyze');
        const defrag = this.getElement('#btnDefrag');
        const pause = this.getElement('#btnPause');
        const stop = this.getElement('#btnStop');

        if (analyze) analyze.disabled = running;
        if (defrag) defrag.disabled = running;
        if (pause) {
            pause.disabled = !running;
            pause.textContent = 'Pause';
        }
        if (stop) stop.disabled = !running;
    }

    updateProgress(percent) {
        const fill = this.getElement('#progressFill');
        const text = this.getElement('#progressText');

        if (fill) fill.style.width = `${percent}%`;
        if (text) text.textContent = `${percent}%`;

        // Emit progress event every 10% for script observation
        if (percent % 10 === 0) {
            this.emitAppEvent('defrag:progress', { percent, drive: this.selectedDrive });
        }
    }

    updateStatus(message) {
        const status = this.getElement('#statusText');
        if (status) status.textContent = message;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default Defrag;
