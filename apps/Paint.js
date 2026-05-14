/**
 * Paint App (Final Polish)
 * Windows 95 style painting with optimized layout for 800x600
 */

import AppBase from './AppBase.js';
import FileSystemManager from '../core/FileSystemManager.js';
import EventBus from '../core/EventBus.js';
import MultiplayerClient from '../core/MultiplayerClient.js';

class Paint extends AppBase {
    constructor() {
        super({
            id: 'paint',
            name: 'Paint',
            icon: '🖌️',
            width: 760,
            height: 600,
            minWidth: 560,
            minHeight: 460,
            resizable: true,
            singleton: false, // Allow multiple Paint windows for working on multiple images
            category: 'accessories'
        });

        this.ctx = null;
        this.painting = false;
        this.tool = 'brush'; // brush, eraser, bucket
        this.color = '#000000';
        this.lastX = 0;
        this.lastY = 0;
        this.brushSize = 3;
        this.resizeObserver = null;

        // Multiplayer collaborative drawing
        this._mpSession = null;
        this._mpUnsubscribers = [];

        // Register semantic event commands for scriptability
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        // Set drawing tool (payload: { tool: 'brush'|'eraser'|'bucket' })
        this.registerCommand('setTool', (payload = {}) => {
            const tool = payload.tool || payload;
            if (['brush', 'eraser', 'bucket'].includes(tool)) {
                this.tool = tool;
                EventBus.emit('paint:tool:changed', {
                    appId: this.id,
                    windowId: this.windowId,
                    tool,
                    timestamp: Date.now()
                });
                return { success: true, tool };
            }
            return { success: false, error: 'Invalid tool. Use: brush, eraser, or bucket' };
        });

        // Set drawing color (payload: { color: '#RRGGBB' })
        this.registerCommand('setColor', (payload = {}) => {
            const color = payload.color || payload;
            if (typeof color === 'string' && color.match(/^#[0-9A-Fa-f]{6}$/)) {
                this.color = color;
                const display = this.getElement('#currentColorDisplay');
                if (display) display.style.background = color;
                EventBus.emit('paint:color:changed', {
                    appId: this.id,
                    windowId: this.windowId,
                    color,
                    timestamp: Date.now()
                });
                return { success: true, color };
            }
            return { success: false, error: 'Invalid color. Use hex format: #RRGGBB' };
        });

        // Set brush size (payload: { size: number })
        this.registerCommand('setBrushSize', (payload = {}) => {
            const size = payload.size || payload;
            const numSize = parseInt(size);
            if (numSize > 0 && numSize <= 50) {
                this.brushSize = numSize;
                const select = this.getElement('#brushSize');
                if (select) select.value = String(numSize);
                EventBus.emit('paint:brushSize:changed', {
                    appId: this.id,
                    windowId: this.windowId,
                    size: numSize,
                    timestamp: Date.now()
                });
                return { success: true, size: numSize };
            }
            return { success: false, error: 'Invalid size. Use number between 1-50' };
        });

        // Clear canvas
        this.registerCommand('clear', () => {
            const canvas = this.getElement('#paintCanvas');
            if (canvas && this.ctx) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(0, 0, canvas.width, canvas.height);
                EventBus.emit('paint:canvas:cleared', {
                    appId: this.id,
                    windowId: this.windowId,
                    timestamp: Date.now()
                });
                return { success: true };
            }
            return { success: false, error: 'Canvas not available' };
        });

        // Draw line (payload: { x1, y1, x2, y2 })
        this.registerCommand('drawLine', (payload = {}) => {
            if (this.ctx) {
                const { x1, y1, x2, y2 } = payload;
                this.ctx.strokeStyle = this.color;
                this.ctx.lineWidth = this.brushSize;
                this.ctx.lineCap = 'round';
                this.ctx.beginPath();
                this.ctx.moveTo(x1, y1);
                this.ctx.lineTo(x2, y2);
                this.ctx.stroke();
                return { success: true, from: {x: x1, y: y1}, to: {x: x2, y: y2} };
            }
            return { success: false, error: 'Canvas not available' };
        });

        // Fill rectangle (payload: { x, y, width, height })
        this.registerCommand('fillRect', (payload = {}) => {
            if (this.ctx) {
                const { x, y, width, height } = payload;
                this.ctx.fillStyle = this.color;
                this.ctx.fillRect(x, y, width, height);
                return { success: true, x, y, width, height };
            }
            return { success: false, error: 'Canvas not available' };
        });

        // Draw text on canvas - critical for ARG clue delivery
        this.registerCommand('drawText', (payload) => {
            if (!this.ctx) return { success: false, error: 'Canvas not available' };
            if (!payload || !payload.text) return { success: false, error: 'No text provided' };
            const x = payload.x || 10;
            const y = payload.y || 30;
            const font = payload.font || '16px monospace';
            this.ctx.fillStyle = payload.color || this.color;
            this.ctx.font = font;
            this.ctx.fillText(payload.text, x, y);
            this.emitAppEvent('text:drawn', { text: payload.text, x, y });
            return { success: true };
        });

        // Draw circle on canvas
        this.registerCommand('drawCircle', (payload) => {
            if (!this.ctx) return { success: false, error: 'Canvas not available' };
            if (!payload) return { success: false, error: 'No parameters provided' };
            const x = payload.x || 0;
            const y = payload.y || 0;
            const radius = payload.radius || 20;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            if (payload.fill !== false) {
                this.ctx.fillStyle = payload.color || this.color;
                this.ctx.fill();
            }
            this.ctx.strokeStyle = payload.strokeColor || this.color;
            this.ctx.lineWidth = payload.lineWidth || this.brushSize;
            this.ctx.stroke();
            return { success: true };
        });

        // Fill entire canvas with a color
        this.registerCommand('fillCanvas', (payload) => {
            if (!this.ctx) return { success: false, error: 'Canvas not available' };
            const canvas = this.getElement('#paintCanvas');
            if (!canvas) return { success: false, error: 'Canvas not available' };
            this.ctx.fillStyle = (payload && payload.color) || this.color;
            this.ctx.fillRect(0, 0, canvas.width, canvas.height);
            this.emitAppEvent('canvas:filled', { color: (payload && payload.color) || this.color });
            return { success: true };
        });
    }

    /**
     * Register queries for script inspection
     */
    registerQueries() {
        // Get current tool state
        this.registerQuery('getState', () => {
            return {
                tool: this.tool,
                color: this.color,
                brushSize: this.brushSize,
                currentFile: this.getInstanceState('currentFile'),
                fileName: this.getInstanceState('fileName')
            };
        });

        // Get canvas dimensions
        this.registerQuery('getCanvasDimensions', () => {
            const canvas = this.getElement('#paintCanvas');
            if (canvas) {
                return {
                    width: canvas.width,
                    height: canvas.height
                };
            }
            return { width: 0, height: 0 };
        });
    }

    onOpen(params = {}) {
        // Store file path if opening a specific file
        if (params.filePath) {
            this.setInstanceState('currentFile', params.filePath);
            this.setInstanceState('fileName', params.filePath[params.filePath.length - 1]);
        } else {
            this.setInstanceState('currentFile', null);
            this.setInstanceState('fileName', 'Untitled');
        }

        const colors = [
            '#000000', '#808080', '#800000', '#808000', '#008000', '#008080', '#000080', '#800080',
            '#ffffff', '#c0c0c0', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'
        ];

        // We use flex-col to stack toolbar and canvas
        // The canvas container gets flex-grow to fill the rest of the 600px height
        return `
            <style>
                #window-paint .window-content {
                    padding: 0 !important;
                    overflow: hidden !important;
                }
            </style>
            <div class="paint-container" style="height: 100%; display: flex; flex-direction: column; background: #c0c0c0;">
                
                <div class="paint-toolbar" style="padding: 6px; border-bottom: 2px solid #808080;">
                    
                    <div style="display:flex; gap: 8px; margin-bottom: 6px; align-items: center;">
                        
                        <div class="inset-border" style="background: #c0c0c0; padding: 2px; display: flex; gap: 2px;">
                            <button class="btn btn-sm active-tool" data-tool="brush" title="Brush" style="width: 32px; height: 32px; font-size: 18px;">🖌️</button>
                            <button class="btn btn-sm" data-tool="bucket" title="Fill" style="width: 32px; height: 32px; font-size: 18px;">🪣</button>
                            <button class="btn btn-sm" data-tool="eraser" title="Eraser" style="width: 32px; height: 32px; font-size: 18px;">🧽</button>
                        </div>

                        <div style="width: 2px; height: 30px; background: #808080; border-right: 1px solid #fff;"></div>

                        <div style="display: flex; align-items: center; gap: 5px;">
                            <label style="font-size: 12px;">Size:</label>
                            <select id="brushSize" class="inset-border" style="height: 24px;">
                                <option value="1">1px</option>
                                <option value="3" selected>3px</option>
                                <option value="5">5px</option>
                                <option value="8">8px</option>
                                <option value="12">12px</option>
                            </select>
                        </div>

                        <div style="flex: 1;"></div>

                        <div style="display: flex; gap: 5px;">
                            <button class="btn btn-sm" id="btnClear">New</button>
                            <button class="btn btn-sm" id="btnOpen">📂 Open</button>
                            <button class="btn btn-sm" id="btnImport">📷 Import</button>
                            <button class="btn btn-sm" id="btnSave">💾 Save</button>
                            <button class="btn btn-sm" id="btnSaveAs">💾 Save As</button>
                            <button class="btn btn-sm" id="btnExport">⬇ Export</button>
                            <button class="btn btn-sm" id="btnCollab" style="display:none;">👥 Collaborate</button>
                        </div>
                    </div>

                    <div style="display: flex; gap: 5px; align-items: center;">
                        <div class="inset-border" style="width: 32px; height: 32px; background: #000; border: 2px solid #808080;" id="currentColorDisplay"></div>

                        <div class="inset-border" style="padding: 2px; background: #fff;">
                            <div class="color-picker" style="display: grid; grid-template-columns: repeat(16, 1fr); gap: 1px;">
                                ${colors.map(c => `
                                    <div class="color-option ${c === '#000000' ? 'active' : ''}" 
                                         style="background:${c}; width: 18px; height: 18px; border: 1px solid #808080; cursor: pointer;" 
                                         data-color="${c}"></div>
                                `).join('')}
                            </div>
                        </div>

                        <div style="position: relative; width: 24px; height: 24px;">
                            <span style="font-size: 18px; position: absolute; left: 2px; top: -2px; pointer-events: none;">🌈</span>
                            <input type="color" id="customColor" value="#000000" style="opacity: 0; width: 100%; height: 100%; cursor: pointer;">
                        </div>
                    </div>
                </div>

                <div class="paint-canvas-wrapper inset-border" style="flex: 1; overflow: auto; background: #808080; position: relative; margin: 5px;">
                    <canvas id="paintCanvas" width="770" height="460" style="background: #fff; display: block; cursor: crosshair;"></canvas>
                </div>

                <div style="height: 24px; border-top: 2px solid #fff; background: #c0c0c0; padding: 2px 5px; font-size: 12px; display: flex; align-items: center; gap: 10px;">
                    <span id="toolStatus">Tool: Brush</span>
                    <span style="border-left: 1px solid #808080; border-right: 1px solid #fff; height: 14px;"></span>
                    <span id="coordsStatus">0, 0px</span>
                </div>
            </div>
        `;
    }

    onMount() {
        const canvas = this.getElement('#paintCanvas');
        if (!canvas) return;

        this.ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Initialize white background explicitly
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, canvas.width, canvas.height);
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Load image if file was specified
        const currentFile = this.getInstanceState('currentFile');
        if (currentFile) {
            this.loadImageFromFile(currentFile);
        }

        // --- Event Listeners ---

        // Drawing
        this.addHandler(canvas, 'mousedown', (e) => this.handleStart(e));
        this.addHandler(canvas, 'mousemove', (e) => this.handleMove(e));
        this.addHandler(canvas, 'mouseup', () => this.stopPaint());
        this.addHandler(canvas, 'mouseleave', () => {
            this.stopPaint();
            this.updateCoords(null);
        });

        // Tools
        this.getElements('[data-tool]').forEach(btn => {
            this.addHandler(btn, 'click', (e) => {
                this.tool = btn.dataset.tool;
                this.getElements('[data-tool]').forEach(b => {
                    b.classList.remove('active-tool');
                    b.style.background = ''; // Reset background
                });
                btn.classList.add('active-tool');
                btn.style.background = '#e0e0e0'; // Active state look

                this.updateCursor(canvas);
                this.updateStatus(`Tool: ${this.tool.charAt(0).toUpperCase() + this.tool.slice(1)}`);
            });
        });

        // Colors
        this.getElements('.color-option').forEach(el => {
            this.addHandler(el, 'click', () => {
                this.setColor(el.dataset.color);
                this.getElements('.color-option').forEach(o => o.style.border = '1px solid #808080'); // Reset borders
                el.style.border = '1px solid #fff'; // Highlight active
                el.style.outline = '1px solid #000';
            });
        });

        // Inputs (use addHandler for proper cleanup on close)
        const colorInput = this.getElement('#customColor');
        if (colorInput) this.addHandler(colorInput, 'input', (e) => this.setColor(e.target.value));
        const sizeInput = this.getElement('#brushSize');
        if (sizeInput) this.addHandler(sizeInput, 'change', (e) => this.brushSize = parseInt(e.target.value));

        // Actions
        const btnClear = this.getElement('#btnClear');
        if (btnClear) this.addHandler(btnClear, 'click', () => this.clearCanvas());
        const btnOpen = this.getElement('#btnOpen');
        if (btnOpen) this.addHandler(btnOpen, 'click', () => this.openImage());
        const btnImport = this.getElement('#btnImport');
        if (btnImport) this.addHandler(btnImport, 'click', () => this.importImage());
        const btnSave = this.getElement('#btnSave');
        if (btnSave) this.addHandler(btnSave, 'click', () => this.saveImage());
        const btnSaveAs = this.getElement('#btnSaveAs');
        if (btnSaveAs) this.addHandler(btnSaveAs, 'click', () => this.saveImageAs());
        const btnExport = this.getElement('#btnExport');
        if (btnExport) this.addHandler(btnExport, 'click', () => this.exportImage());

        // Multiplayer Collaborate button
        const btnCollab = this.getElement('#btnCollab');
        if (btnCollab) this.addHandler(btnCollab, 'click', () => this._mpToggleCollab());
        this._mpUpdateCollabButton();

        // Set up ResizeObserver to resize canvas when window is resized
        const canvasWrapper = this.getElement('.paint-canvas-wrapper');
        if (canvasWrapper) {
            this.resizeObserver = new ResizeObserver(() => {
                this.resizeCanvas();
            });
            this.resizeObserver.observe(canvasWrapper);
        }
    }

    resizeCanvas() {
        const canvas = this.getElement('#paintCanvas');
        const wrapper = this.getElement('.paint-canvas-wrapper');
        if (!canvas || !wrapper) return;

        // Save current canvas content
        const imageData = this.ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Calculate new size (leaving some margin)
        const newWidth = Math.max(100, wrapper.clientWidth - 10);
        const newHeight = Math.max(100, wrapper.clientHeight - 10);

        // Only resize if size actually changed
        if (canvas.width !== newWidth || canvas.height !== newHeight) {
            canvas.width = newWidth;
            canvas.height = newHeight;

            // Restore white background
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Restore previous content
            this.ctx.putImageData(imageData, 0, 0);

            // Re-apply context settings
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
        }
    }

    onClose() {
        // Clean up multiplayer
        this._mpStopCollab();

        // Clean up ResizeObserver
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
    }

    setColor(c) {
        this.color = c;
        if (this.tool === 'eraser') this.tool = 'brush'; 
        
        // Update the big preview box
        const preview = this.getElement('#currentColorDisplay');
        if (preview) preview.style.background = c;
    }

    updateCursor(canvas) {
        if (this.tool === 'bucket') canvas.style.cursor = 'cell';
        else if (this.tool === 'eraser') canvas.style.cursor = 'grab'; // Or a custom square cursor
        else canvas.style.cursor = 'crosshair';
    }

    updateStatus(text) {
        const el = this.getElement('#toolStatus');
        if (el) el.textContent = text;
    }

    updateCoords(e) {
        const el = this.getElement('#coordsStatus');
        if (!el) return;
        if (!e) {
            el.textContent = '';
            return;
        }
        const { x, y } = this.getCoords(e);
        el.textContent = `${x}, ${y}px`;
    }

    handleStart(e) {
        const { x, y } = this.getCoords(e);

        if (this.tool === 'bucket') {
            this.floodFill(x, y, this.hexToRgba(this.color));
        } else {
            this.painting = true;
            this.lastX = x;
            this.lastY = y;
            this.draw(x, y); 
        }
    }

    handleMove(e) {
        this.updateCoords(e);
        if (!this.painting) return;
        const { x, y } = this.getCoords(e);
        this.draw(x, y);
        this.lastX = x;
        this.lastY = y;
    }

    getCoords(e) {
        const canvas = this.getElement('#paintCanvas');
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.floor(e.clientX - rect.left),
            y: Math.floor(e.clientY - rect.top)
        };
    }

    draw(x, y) {
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.lineTo(x, y);

        if (this.tool === 'eraser') {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = this.brushSize * 4; // Eraser needs to be bigger
        } else {
            this.ctx.strokeStyle = this.color;
            this.ctx.lineWidth = this.brushSize;
        }

        this.ctx.stroke();
        this.ctx.closePath();

        // Broadcast stroke to multiplayer session
        if (this._mpSession && MultiplayerClient.isConnected()) {
            MultiplayerClient.sendEvent(this._mpSession, 'paint:stroke', {
                fromX: this.lastX, fromY: this.lastY,
                toX: x, toY: y,
                tool: this.tool,
                color: this.color,
                brushSize: this.brushSize,
                _self: true
            });
        }
    }

    stopPaint() {
        this.painting = false;
        this.ctx.beginPath();
    }

    // Stack-based flood fill
    floodFill(startX, startY, fillColor) {
        const canvas = this.getElement('#paintCanvas');
        const w = canvas.width;
        const h = canvas.height;
        const imageData = this.ctx.getImageData(0, 0, w, h);
        const data = imageData.data;

        const startPos = (startY * w + startX) * 4;
        const startR = data[startPos];
        const startG = data[startPos + 1];
        const startB = data[startPos + 2];
        const startA = data[startPos + 3];

        if (startR === fillColor.r && startG === fillColor.g && startB === fillColor.b) return;

        const stack = [[startX, startY]];

        while (stack.length) {
            const [x, y] = stack.pop();
            const pos = (y * w + x) * 4;

            if (x < 0 || x >= w || y < 0 || y >= h) continue;

            if (data[pos] === startR && data[pos+1] === startG && data[pos+2] === startB && data[pos+3] === startA) {
                data[pos] = fillColor.r;
                data[pos+1] = fillColor.g;
                data[pos+2] = fillColor.b;
                data[pos+3] = 255;

                stack.push([x + 1, y]);
                stack.push([x - 1, y]);
                stack.push([x, y + 1]);
                stack.push([x, y - 1]);
            }
        }

        this.ctx.putImageData(imageData, 0, 0);
    }

    hexToRgba(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    clearCanvas() {
        // Reset file state - this is now a NEW untitled document
        this.setInstanceState('currentFile', null);
        this.setInstanceState('fileName', 'Untitled');

        // Update window title
        const window = this.getWindow();
        if (window) {
            const titleBar = window.querySelector('.window-title');
            if (titleBar) {
                titleBar.textContent = 'Untitled - Paint';
            }
        }

        // Clear the canvas
        const canvas = this.getElement('#paintCanvas');
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, canvas.width, canvas.height);
        this.playSound('click');
    }

    loadImageFromFile(filePath) {
        const canvas = this.getElement('#paintCanvas');
        if (!canvas) return;

        const node = FileSystemManager.getNode(filePath);
        if (!node) {
            this.alert('Error loading image: File not found');
            return;
        }

        // Resolve the image source - may be async for server-backed files
        this._resolveImageSource(node, filePath).then(imageSrc => {
            if (!imageSrc) {
                this.alert('Cannot open this file as an image. The file may not contain image data.');
                return;
            }
            this._drawImageFromSrc(imageSrc, canvas);
        }).catch(e => {
            console.error('[Paint] Error loading image:', e);
            this.alert(`Error loading image: ${e.message}`);
        });

        this.updateWindowTitle();
    }

    /**
     * Resolve image source from a filesystem node - handles data URLs, blob URLs, and server files
     */
    async _resolveImageSource(node, filePath) {
        // 1. Data URL content (uploaded images, saved paintings)
        if (node.content && typeof node.content === 'string' && node.content.startsWith('data:')) {
            return node.content;
        }

        // 2. Blob URL or external URL in src property
        if (node.src) {
            return node.src;
        }

        // 3. Server-backed file - download and create blob URL
        if (node.isServerFile && node.serverId) {
            try {
                const url = await FileSystemManager.getServerFileUrl(filePath);
                return url;
            } catch (e) {
                console.error('[Paint] Failed to download server file:', e);
                return null;
            }
        }

        // 4. Fallback: try readFile() in case content is stored differently
        try {
            const content = FileSystemManager.readFile(filePath);
            if (content && typeof content === 'string' && content.startsWith('data:')) {
                return content;
            }
        } catch (e) { /* ignore */ }

        return null;
    }

    /**
     * Draw an image from a source URL onto the canvas
     */
    _drawImageFromSrc(imageSrc, canvas) {
        const img = new Image();
        img.onload = () => {
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, canvas.width, canvas.height);
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
            const drawWidth = img.width * scale;
            const drawHeight = img.height * scale;
            this.ctx.drawImage(img, 0, 0, drawWidth, drawHeight);
        };
        img.onerror = () => {
            this.alert('Failed to load image - the file may be corrupted or in an unsupported format');
        };
        img.src = imageSrc;
    }

    updateWindowTitle() {
        const fileName = this.getInstanceState('fileName') || 'Untitled';
        const window = this.getWindow();
        if (window) {
            const titleBar = window.querySelector('.window-title');
            if (titleBar) {
                titleBar.textContent = `${fileName} - Paint`;
            }
        }
    }

    async openImage() {
        const path = await this.prompt('Enter image file path (e.g., C:/Users/User/Pictures/image.png):', '', 'Open Image');
        if (!path) return;

        try {
            const parsedPath = FileSystemManager.parsePath(path);
            const fileName = parsedPath[parsedPath.length - 1];

            this.setInstanceState('currentFile', parsedPath);
            this.setInstanceState('fileName', fileName);
            this.loadImageFromFile(parsedPath);
            this.updateWindowTitle();
            this.alert('📂 Image opened!');
        } catch (e) {
            this.alert(`Error opening image: ${e.message}`);
        }
    }

    saveImage() {
        const currentFile = this.getInstanceState('currentFile');

        if (currentFile) {
            // Save to existing file
            try {
                const canvas = this.getElement('#paintCanvas');
                const dataURL = canvas.toDataURL('image/png');
                FileSystemManager.writeFile(currentFile, dataURL, 'png');
                this.playSound('floppy');
                this.alert('💾 Image saved!');
            } catch (e) {
                this.playSound('error');
                this.alert(`Error saving image: ${e.message}`);
            }
        } else {
            // No file selected, prompt for Save As
            this.saveImageAs();
        }
    }

    /**
     * Import an image from the user's computer via native file picker
     */
    importImage() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg,image/gif,image/bmp,image/webp,image/svg+xml,image/x-icon,image/tiff,.png,.jpg,.jpeg,.gif,.bmp,.webp,.svg,.ico,.tiff,.tif';

        input.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const canvas = this.getElement('#paintCanvas');
            if (!canvas) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                const dataURL = evt.target.result;
                const img = new Image();
                img.onload = () => {
                    // Clear canvas and draw imported image
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.fillRect(0, 0, canvas.width, canvas.height);

                    // Scale to fit canvas while maintaining aspect ratio
                    const scale = Math.min(canvas.width / img.width, canvas.height / img.height, 1);
                    const drawWidth = img.width * scale;
                    const drawHeight = img.height * scale;
                    this.ctx.drawImage(img, 0, 0, drawWidth, drawHeight);

                    // Save to virtual filesystem
                    const fileName = file.name;
                    const ext = fileName.split('.').pop().toLowerCase();
                    const picturePath = ['C:', 'Users', 'User', 'Pictures', fileName];

                    try {
                        // Ensure Pictures directory exists
                        FileSystemManager.createDirectory(['C:', 'Users', 'User', 'Pictures']);
                    } catch (e) { /* already exists */ }

                    try {
                        FileSystemManager.writeFile(picturePath, dataURL, ext);
                        this.setInstanceState('currentFile', picturePath);
                        this.setInstanceState('fileName', fileName);
                        this.updateWindowTitle();
                        this.alert(`📷 Imported "${fileName}" and saved to Pictures`);
                    } catch (e) {
                        // Still show on canvas even if save fails
                        this.setInstanceState('currentFile', null);
                        this.setInstanceState('fileName', fileName);
                        this.updateWindowTitle();
                    }
                };
                img.onerror = () => {
                    this.alert('Failed to load the selected image file.');
                };
                img.src = dataURL;
            };
            reader.readAsDataURL(file);
        });

        input.click();
    }

    /**
     * Export the canvas as a downloadable image file
     */
    exportImage() {
        const canvas = this.getElement('#paintCanvas');
        if (!canvas) return;

        const fileName = this.getInstanceState('fileName') || 'drawing';
        const baseName = fileName.replace(/\.[^/.]+$/, '');

        const link = document.createElement('a');
        link.download = `${baseName}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    // ===== MULTIPLAYER COLLABORATIVE DRAWING =====

    _mpUpdateCollabButton() {
        const btn = this.getElement('#btnCollab');
        if (!btn) return;
        btn.style.display = MultiplayerClient.isConnected() ? '' : 'none';
        btn.textContent = this._mpSession ? '👥 Stop Collab' : '👥 Collaborate';
    }

    _mpToggleCollab() {
        if (this._mpSession) {
            this._mpStopCollab();
        } else {
            this._mpStartCollab();
        }
    }

    _mpStartCollab() {
        if (!MultiplayerClient.isConnected()) return;

        const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        this._mpSession = `app:paint:${sessionId}`;
        MultiplayerClient.joinRoom(this._mpSession);

        // Listen for incoming strokes
        const unsubStroke = MultiplayerClient.on('event', (msg) => {
            const data = msg.payload || {};
            if (data.channel !== this._mpSession) return;
            if (data.data && data.data._self) return;

            const event = msg.event || data.event;
            if (event === 'paint:stroke') {
                const s = data.data || data;
                this._mpDrawRemoteStroke(s);
            }
        });
        this._mpUnsubscribers.push(unsubStroke);

        this._mpUpdateCollabButton();
    }

    _mpStopCollab() {
        if (this._mpSession) {
            MultiplayerClient.leaveRoom(this._mpSession);
        }
        for (const unsub of this._mpUnsubscribers) {
            if (typeof unsub === 'function') unsub();
        }
        this._mpUnsubscribers = [];
        this._mpSession = null;
        this._mpUpdateCollabButton();
    }

    _mpDrawRemoteStroke(s) {
        if (!this.ctx) return;
        this.ctx.beginPath();
        this.ctx.moveTo(s.fromX, s.fromY);
        this.ctx.lineTo(s.toX, s.toY);
        if (s.tool === 'eraser') {
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = (s.brushSize || 3) * 4;
        } else {
            this.ctx.strokeStyle = s.color || '#000000';
            this.ctx.lineWidth = s.brushSize || 3;
        }
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();
        this.ctx.closePath();
    }

    async saveImageAs() {
        // Generate a default filename with full timestamp (date + time) for unique names
        const now = new Date();
        const timestamp = now.toISOString().slice(0, 19).replace(/[T:]/g, '-');
        const defaultName = `drawing_${timestamp}.png`;
        const defaultPath = `C:/Users/User/Desktop/${defaultName}`;

        const path = await this.prompt(
            'Save image to:\n\nTip: Save to Desktop for easy access!\nOr use Pictures folder: C:/Users/User/Pictures/',
            defaultPath,
            'Save Image As'
        );
        if (!path) return;

        try {
            const parsedPath = FileSystemManager.parsePath(path);
            let fileName = parsedPath[parsedPath.length - 1];

            // Ensure .png extension
            if (!fileName.toLowerCase().endsWith('.png')) {
                fileName += '.png';
                parsedPath[parsedPath.length - 1] = fileName;
            }

            const canvas = this.getElement('#paintCanvas');
            const dataURL = canvas.toDataURL('image/png');
            FileSystemManager.writeFile(parsedPath, dataURL, 'png');

            this.setInstanceState('currentFile', parsedPath);
            this.setInstanceState('fileName', fileName);
            this.updateWindowTitle();
            this.alert('💾 Image saved to ' + parsedPath.join('/'));
        } catch (e) {
            this.alert(`Error saving image: ${e.message}`);
        }
    }
}

export default Paint;