/**
 * Find Files - Windows 95 Style File Search Utility
 * Search for files and folders in the virtual file system
 */

import AppBase from './AppBase.js';
import FileSystemManager from '../core/FileSystemManager.js';
import AppRegistry from './AppRegistry.js';
import EventBus from '../core/EventBus.js';
import { escapeHtml } from '../core/Sanitize.js';

class FindFiles extends AppBase {
    constructor() {
        super({
            id: 'find',
            name: 'Find: All Files',
            icon: '🔍',
            width: 600,
            height: 480,
            minWidth: 480,
            minHeight: 380,
            resizable: true,
            singleton: true,
            category: 'systemtools'
        });

        this.searchResults = [];
        this.isSearching = false;

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('search', (payload) => {
            if (payload) {
                const nameInput = this.getElement('#search-name');
                const contentInput = this.getElement('#search-content');
                const locationSelect = this.getElement('#search-location');
                if (nameInput && payload.name !== undefined) nameInput.value = payload.name;
                if (contentInput && payload.content !== undefined) contentInput.value = payload.content;
                if (locationSelect && payload.location !== undefined) locationSelect.value = payload.location;
            }
            this.startSearch();
            return { success: true };
        });

        this.registerCommand('stopSearch', () => {
            this.stopSearch();
            return { success: true };
        });

        this.registerCommand('clearResults', () => {
            this.newSearch();
            return { success: true };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getResults', () => {
            return this.searchResults.map(r => ({
                name: r.name,
                folder: r.folder,
                size: r.size,
                type: r.type
            }));
        });

        this.registerQuery('getSearchState', () => {
            return {
                isSearching: this.isSearching,
                resultCount: this.searchResults.length
            };
        });
    }

    onOpen() {
        return `
            <style>
                .find-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #c0c0c0;
                    font-size: 13px;
                }
                .find-tabs {
                    display: flex;
                    padding: 4px 4px 0 4px;
                }
                .find-tab {
                    padding: 4px 12px;
                    background: #c0c0c0;
                    border: 2px solid;
                    border-color: #fff #808080 #c0c0c0 #fff;
                    cursor: pointer;
                    margin-right: 2px;
                }
                .find-tab.active {
                    border-bottom-color: #c0c0c0;
                    margin-bottom: -2px;
                    padding-bottom: 6px;
                    z-index: 1;
                }
                .find-content {
                    border: 2px solid;
                    border-color: #fff #808080 #808080 #fff;
                    margin: 0 4px;
                    padding: 10px;
                    background: #c0c0c0;
                }
                .find-row {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                }
                .find-row label {
                    min-width: 80px;
                    text-align: right;
                }
                .find-row input[type="text"],
                .find-row select {
                    flex: 1;
                    padding: 3px;
                    border: 2px inset #fff;
                    font-family: inherit;
                    font-size: 13px;
                }
                .find-buttons {
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                    margin-left: 10px;
                }
                .find-btn {
                    padding: 4px 16px;
                    background: #c0c0c0;
                    border: 2px outset #fff;
                    cursor: pointer;
                    min-width: 80px;
                    font-size: 13px;
                }
                .find-btn:active:not(:disabled) {
                    border-style: inset;
                }
                .find-btn:disabled {
                    color: #808080;
                    cursor: not-allowed;
                }
                .find-options {
                    display: flex;
                    gap: 20px;
                    margin: 10px 0;
                }
                .find-check {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .find-results {
                    flex: 1;
                    margin-top: 8px;
                    border: 2px inset #fff;
                    background: white;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }
                .results-header {
                    display: grid;
                    grid-template-columns: 2fr 1fr 100px 80px;
                    background: #c0c0c0;
                    border-bottom: 2px solid #808080;
                    font-weight: bold;
                    position: sticky;
                    top: 0;
                }
                .results-header div {
                    padding: 3px 8px;
                    border-right: 1px solid #808080;
                    cursor: pointer;
                }
                .results-header div:hover {
                    background: #d4d4d4;
                }
                .results-body {
                    flex: 1;
                    overflow-y: auto;
                }
                .result-item {
                    display: grid;
                    grid-template-columns: 2fr 1fr 100px 80px;
                    border-bottom: 1px solid #e0e0e0;
                    cursor: pointer;
                }
                .result-item:hover {
                    background: #e0e0ff;
                }
                .result-item.selected {
                    background: #000080;
                    color: white;
                }
                .result-item div {
                    padding: 3px 8px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .result-icon {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .find-status {
                    padding: 5px;
                    background: #c0c0c0;
                    border-top: 2px groove #fff;
                    font-size: 12px;
                    color: #444;
                }
                .no-results {
                    padding: 20px;
                    text-align: center;
                    color: #666;
                }
                .searching {
                    padding: 20px;
                    text-align: center;
                    color: #000080;
                }
                .searching-animation {
                    display: inline-block;
                    animation: pulse 1s ease-in-out infinite;
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
            </style>

            <div class="find-container">
                <div class="find-tabs">
                    <div class="find-tab active" data-tab="name">Name & Location</div>
                    <div class="find-tab" data-tab="date">Date Modified</div>
                    <div class="find-tab" data-tab="advanced">Advanced</div>
                </div>

                <div class="find-content">
                    <div style="display: flex;">
                        <div style="flex: 1;">
                            <div class="find-row">
                                <label>Named:</label>
                                <input type="text" id="search-name" placeholder="*.txt">
                            </div>
                            <div class="find-row">
                                <label>Containing:</label>
                                <input type="text" id="search-content" placeholder="text to find">
                            </div>
                            <div class="find-row">
                                <label>Look in:</label>
                                <select id="search-location">
                                    <option value="C:">Local Disk (C:)</option>
                                    <option value="C:/Users">My Documents</option>
                                    <option value="C:/Users/User/Desktop">Desktop</option>
                                    <option value="all">All Drives</option>
                                </select>
                            </div>
                            <div class="find-options">
                                <div class="find-check">
                                    <input type="checkbox" id="search-subfolders" checked>
                                    <label for="search-subfolders">Include subfolders</label>
                                </div>
                                <div class="find-check">
                                    <input type="checkbox" id="search-case">
                                    <label for="search-case">Case sensitive</label>
                                </div>
                            </div>
                        </div>
                        <div class="find-buttons">
                            <button class="find-btn" id="btn-find-now">Find Now</button>
                            <button class="find-btn" id="btn-stop" disabled>Stop</button>
                            <button class="find-btn" id="btn-new-search">New Search</button>
                        </div>
                    </div>
                </div>

                <div class="find-results" id="results-container">
                    <div class="results-header">
                        <div data-sort="name">Name</div>
                        <div data-sort="folder">In Folder</div>
                        <div data-sort="size">Size</div>
                        <div data-sort="type">Type</div>
                    </div>
                    <div class="results-body" id="results-body">
                        <div class="no-results">
                            Enter a search term and click "Find Now"
                        </div>
                    </div>
                </div>

                <div class="find-status" id="find-status">
                    Ready
                </div>
            </div>
        `;
    }

    onMount() {
        // Find Now button
        this.addHandler(this.getElement('#btn-find-now'), 'click', () => this.startSearch());

        // Stop button
        this.addHandler(this.getElement('#btn-stop'), 'click', () => this.stopSearch());

        // New Search button
        this.addHandler(this.getElement('#btn-new-search'), 'click', () => this.newSearch());

        // Enter key in search field
        const searchInput = this.getElement('#search-name');
        if (searchInput) {
            this.addHandler(searchInput, 'keydown', (e) => {
                if (e.key === 'Enter') this.startSearch();
            });
        }

        // Sort headers
        const headers = this.getElements('.results-header div');
        headers.forEach(header => {
            this.addHandler(header, 'click', () => {
                this.sortResults(header.dataset.sort);
            });
        });
    }

    async startSearch() {
        const searchName = this.getElement('#search-name')?.value?.trim() || '*';
        const searchContent = this.getElement('#search-content')?.value?.trim() || '';
        const location = this.getElement('#search-location')?.value || 'C:';
        const includeSubfolders = this.getElement('#search-subfolders')?.checked ?? true;
        const caseSensitive = this.getElement('#search-case')?.checked ?? false;

        this.isSearching = true;
        this.searchResults = [];
        this.playSound('click');

        // Update UI
        this.getElement('#btn-find-now').disabled = true;
        this.getElement('#btn-stop').disabled = false;
        this.updateStatus('Searching...');

        const resultsBody = this.getElement('#results-body');
        if (resultsBody) {
            resultsBody.innerHTML = '<div class="searching"><span class="searching-animation">🔍</span> Searching...</div>';
        }

        // Convert pattern to regex
        const pattern = this.wildcardToRegex(searchName, caseSensitive);

        // Get starting paths
        const startPaths = location === 'all'
            ? [['C:']]
            : [location.split('/')];

        // Search the virtual file system
        for (const startPath of startPaths) {
            if (!this.isSearching) break;
            await this.searchDirectory(startPath, pattern, searchContent, includeSubfolders, caseSensitive);
        }

        // Display results
        this.displayResults();
        this.isSearching = false;
        this.getElement('#btn-find-now').disabled = false;
        this.getElement('#btn-stop').disabled = true;
        this.playSound(this.searchResults.length > 0 ? 'notify' : 'error');

        // Emit search complete event
        this.emitAppEvent('search:complete', {
            query: searchName,
            location: location,
            resultsCount: this.searchResults.length
        });
    }

    async searchDirectory(path, pattern, contentSearch, includeSubfolders, caseSensitive) {
        if (!this.isSearching) return;

        try {
            const items = FileSystemManager.listDirectory(path);

            for (const item of items) {
                if (!this.isSearching) break;

                const itemPath = [...path, item.name];

                // Check if name matches pattern
                const nameToMatch = caseSensitive ? item.name : item.name.toLowerCase();
                if (pattern.test(nameToMatch)) {
                    // If content search is specified, check file contents
                    if (contentSearch && item.type === 'file') {
                        try {
                            const content = FileSystemManager.readFile(itemPath);
                            const contentToSearch = caseSensitive ? content : content.toLowerCase();
                            const searchTerm = caseSensitive ? contentSearch : contentSearch.toLowerCase();

                            if (contentToSearch.includes(searchTerm)) {
                                this.addResult(item, path);
                            }
                        } catch (e) {
                            // Can't read file, skip
                        }
                    } else if (!contentSearch) {
                        this.addResult(item, path);
                    }
                }

                // Recurse into directories
                if (item.type === 'directory' && includeSubfolders) {
                    await this.searchDirectory(itemPath, pattern, contentSearch, includeSubfolders, caseSensitive);
                    // Small delay to prevent blocking
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
            }
        } catch (e) {
            // Directory doesn't exist or can't be read
        }
    }

    addResult(item, folder) {
        this.searchResults.push({
            name: item.name,
            folder: folder.join('/'),
            size: item.size || 0,
            type: item.type === 'directory' ? 'Folder' : this.getFileType(item.extension),
            extension: item.extension,
            path: [...folder, item.name],
            isDirectory: item.type === 'directory'
        });

        // Update status
        this.updateStatus(`Found ${this.searchResults.length} item(s)...`);
    }

    wildcardToRegex(pattern, caseSensitive) {
        // Convert * and ? wildcards to regex
        let regex = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
            .replace(/\*/g, '.*')  // * matches anything
            .replace(/\?/g, '.');   // ? matches single char

        const flags = caseSensitive ? '' : 'i';
        return new RegExp(`^${regex}$`, flags);
    }

    getFileType(extension) {
        const types = {
            'txt': 'Text Document',
            'md': 'Markdown Document',
            'png': 'PNG Image',
            'jpg': 'JPEG Image',
            'bmp': 'Bitmap Image',
            'gif': 'GIF Image',
            'exe': 'Application',
            'lnk': 'Shortcut',
            'mp3': 'MP3 Audio',
            'wav': 'Wave Audio',
            'log': 'Log File'
        };
        return types[extension] || 'File';
    }

    getFileIcon(result) {
        if (result.isDirectory) return '📁';

        const icons = {
            'txt': '📝',
            'md': '📝',
            'png': '🖼️',
            'jpg': '🖼️',
            'bmp': '🖼️',
            'gif': '🖼️',
            'exe': '⚙️',
            'lnk': '🔗',
            'mp3': '🎵',
            'wav': '🎵',
            'log': '📋'
        };
        return icons[result.extension] || '📄';
    }

    formatSize(bytes) {
        if (bytes === 0) return '-';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    displayResults() {
        const resultsBody = this.getElement('#results-body');
        if (!resultsBody) return;

        if (this.searchResults.length === 0) {
            resultsBody.innerHTML = '<div class="no-results">No items found matching your search.</div>';
            this.updateStatus('Search complete. 0 items found.');
            return;
        }

        resultsBody.innerHTML = this.searchResults.map((result, index) => `
            <div class="result-item" data-index="${index}">
                <div class="result-icon">
                    <span>${this.getFileIcon(result)}</span>
                    <span>${escapeHtml(result.name)}</span>
                </div>
                <div>${escapeHtml(result.folder)}</div>
                <div>${this.formatSize(result.size)}</div>
                <div>${escapeHtml(result.type)}</div>
            </div>
        `).join('');

        // Add click handlers
        const items = resultsBody.querySelectorAll('.result-item');
        items.forEach(item => {
            item.addEventListener('click', () => {
                items.forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            });

            item.addEventListener('dblclick', () => {
                const index = parseInt(item.dataset.index);
                const result = this.searchResults[index];
                this.openResult(result);
            });
        });

        this.updateStatus(`Search complete. ${this.searchResults.length} item(s) found.`);
    }

    openResult(result) {
        // Emit result opened event
        this.emitAppEvent('result:opened', {
            name: result.name,
            path: result.path.join('/'),
            type: result.type
        });

        if (result.isDirectory) {
            // Open in My Computer
            AppRegistry.launch('mycomputer', { initialPath: result.path });
        } else {
            // Open file based on type
            if (result.extension === 'txt' || result.extension === 'md' || result.extension === 'log') {
                AppRegistry.launch('notepad', { filePath: result.path });
            } else if (['png', 'jpg', 'bmp', 'gif'].includes(result.extension)) {
                AppRegistry.launch('paint', { filePath: result.path });
            } else {
                // Try to open parent folder
                AppRegistry.launch('mycomputer', { initialPath: result.path.slice(0, -1) });
            }
        }
    }

    sortResults(field) {
        this.searchResults.sort((a, b) => {
            if (field === 'size') {
                return a.size - b.size;
            }
            return a[field].localeCompare(b[field]);
        });
        this.displayResults();
    }

    stopSearch() {
        this.isSearching = false;
        this.updateStatus('Search stopped.');

        // Emit search stopped event
        this.emitAppEvent('search:stopped', {
            resultsFound: this.searchResults.length
        });
    }

    newSearch() {
        this.searchResults = [];
        this.getElement('#search-name').value = '';
        this.getElement('#search-content').value = '';

        const resultsBody = this.getElement('#results-body');
        if (resultsBody) {
            resultsBody.innerHTML = '<div class="no-results">Enter a search term and click "Find Now"</div>';
        }

        this.updateStatus('Ready');
    }

    updateStatus(message) {
        const status = this.getElement('#find-status');
        if (status) status.textContent = message;
    }
}

export default FindFiles;
