/**
 * Browser App - Internet Explorer 4 / Netscape Navigator style
 * A retro web browser using iframes
 *
 * SCRIPTING SUPPORT:
 *   Commands: navigate, back, forward, refresh, stop, home,
 *             setHomepage, addBookmark, removeBookmark,
 *             setStatusText, setAddressBar, reset
 *   Queries:  getCurrentUrl, getHistory, getHomepage,
 *             getBookmarks, getConfig
 *   Events:   browser:navigated,
 *             app:browser:bookmarkAdded, app:browser:bookmarkRemoved,
 *             app:browser:homepageChanged
 */

import AppBase from './AppBase.js';
import EventBus from '../core/EventBus.js';
import StorageManager from '../core/StorageManager.js';
import { escapeHtml, escAttr, isSafeHttpUrl } from '../core/Sanitize.js';

const STORAGE_KEY = 'browser:state:v1';

const DEFAULT_HOMEPAGE = 'https://www.wikipedia.org';
const DEFAULT_BOOKMARKS = [
    { name: 'Wikipedia',        url: 'https://www.wikipedia.org' },
    { name: 'Internet Archive', url: 'https://archive.org' },
    { name: 'Hacker News',      url: 'https://news.ycombinator.com' },
    { name: 'GeoCities Archive', url: 'https://geocities.restorativland.org' },
    { name: 'archive.org/web',  url: 'https://web.archive.org' }
];

class Browser extends AppBase {
    constructor() {
        super({
            id: 'browser',
            name: 'Internet Explorer',
            icon: '🌐',
            width: 860,
            height: 620,
            minWidth: 560,
            minHeight: 420,
            resizable: true,
            singleton: true,
            category: 'internet'
        });

        // In-session navigation history (forward/back)
        this.history = [];
        this.historyIndex = -1;
        this.initialUrl = null;
        this._isLoading = false;

        // Persisted state
        const saved = StorageManager.get(STORAGE_KEY, {}) || {};
        this.homepage = typeof saved.homepage === 'string' && isSafeHttpUrl(saved.homepage)
            ? saved.homepage
            : DEFAULT_HOMEPAGE;
        this.bookmarks = Array.isArray(saved.bookmarks) && saved.bookmarks.length
            ? saved.bookmarks.filter(b => b && typeof b.name === 'string' && isSafeHttpUrl(b.url))
            : [...DEFAULT_BOOKMARKS];
        this.recentUrls = Array.isArray(saved.recentUrls)
            ? saved.recentUrls.filter(u => typeof u === 'string' && isSafeHttpUrl(u)).slice(0, 20)
            : [];

        this.registerCommands();
        this.registerQueries();
    }

    _persist() {
        StorageManager.set(STORAGE_KEY, {
            homepage: this.homepage,
            bookmarks: this.bookmarks,
            recentUrls: this.recentUrls
        });
    }

    registerCommands() {
        this.registerCommand('navigate', (payload) => {
            const url = typeof payload === 'string' ? payload : payload?.url;
            if (!url || typeof url !== 'string') {
                return { success: false, error: 'URL required' };
            }
            try {
                this.navigate(url);
                EventBus.emit('browser:navigated', { appId: this.id, url, timestamp: Date.now() });
                return { success: true, url };
            } catch (error) {
                return { success: false, error: error.message };
            }
        });

        this.registerCommand('back', () => {
            if (this.historyIndex > 0) {
                this.goBack();
                return { success: true, url: this.history[this.historyIndex] };
            }
            return { success: false, error: 'No previous page' };
        });

        this.registerCommand('forward', () => {
            if (this.historyIndex < this.history.length - 1) {
                this.goForward();
                return { success: true, url: this.history[this.historyIndex] };
            }
            return { success: false, error: 'No next page' };
        });

        this.registerCommand('refresh', () => {
            this.refresh();
            return { success: true };
        });

        this.registerCommand('stop', () => {
            this.stop();
            return { success: true };
        });

        this.registerCommand('home', () => {
            this.navigate(this.homepage);
            return { success: true, url: this.homepage };
        });

        this.registerCommand('setHomepage', (payload) => {
            const url = payload.url || payload.value;
            if (!url || !isSafeHttpUrl(url)) return { success: false, error: 'Valid http(s) URL required' };
            this.homepage = url;
            this._persist();
            this.emitAppEvent('homepageChanged', { url });
            return { success: true, homepage: url };
        });

        this.registerCommand('addBookmark', (payload) => {
            const name = payload.name || payload.label;
            const url = payload.url;
            if (!name || !url || !isSafeHttpUrl(url)) return { success: false, error: 'Name and valid URL required' };
            if (this.bookmarks.find(b => b.url === url)) {
                return { success: false, error: 'Bookmark already exists' };
            }
            this.bookmarks.push({ name, url });
            this._persist();
            this._renderBookmarks();
            this.emitAppEvent('bookmarkAdded', { name, url });
            return { success: true, name, url };
        });

        this.registerCommand('removeBookmark', (payload) => {
            const url = payload.url;
            const name = payload.name;
            const idx = this.bookmarks.findIndex(b =>
                (url && b.url === url) || (name && b.name === name)
            );
            if (idx === -1) return { success: false, error: 'Bookmark not found' };
            const removed = this.bookmarks.splice(idx, 1)[0];
            this._persist();
            this._renderBookmarks();
            this.emitAppEvent('bookmarkRemoved', { name: removed.name, url: removed.url });
            return { success: true };
        });

        this.registerCommand('setStatusText', (payload) => {
            this.updateStatus(payload.text || payload.value || '');
            return { success: true };
        });

        this.registerCommand('setAddressBar', (payload) => {
            const text = payload.text || payload.url || '';
            const addressInput = this.getElement('#addressInput');
            if (addressInput) addressInput.value = text;
            return { success: true };
        });

        this.registerCommand('reset', () => {
            this.history = [];
            this.historyIndex = -1;
            this.homepage = DEFAULT_HOMEPAGE;
            this.bookmarks = [...DEFAULT_BOOKMARKS];
            this.recentUrls = [];
            this._persist();
            this._renderBookmarks();
            this.updateStatus('Ready');
            return { success: true };
        });
    }

    registerQueries() {
        this.registerQuery('getCurrentUrl', () => ({
            url: this.history[this.historyIndex] || this.homepage
        }));
        this.registerQuery('getHistory', () => ({
            history: [...this.history], currentIndex: this.historyIndex
        }));
        this.registerQuery('getHomepage', () => ({ homepage: this.homepage }));
        this.registerQuery('getBookmarks', () => this.bookmarks.map(b => ({ ...b })));
        this.registerQuery('getConfig', () => ({
            homepage: this.homepage,
            currentUrl: this.history[this.historyIndex] || null,
            historyLength: this.history.length,
            bookmarkCount: this.bookmarks.length
        }));
    }

    setParams(params) {
        if (params && params.url) {
            this.initialUrl = params.url;
        }
    }

    onOpen() {
        const startUrl = this.initialUrl || this.homepage;
        return `
            <div class="browser-app">
                <div class="browser-menubar">
                    <span class="browser-menu" data-menu="file"><u>F</u>ile</span>
                    <span class="browser-menu" data-menu="edit"><u>E</u>dit</span>
                    <span class="browser-menu" data-menu="view"><u>V</u>iew</span>
                    <span class="browser-menu" data-menu="favorites"><u>A</u>vorites</span>
                    <span class="browser-menu" data-menu="help"><u>H</u>elp</span>
                </div>
                <div class="browser-toolbar">
                    <button class="browser-tbtn" id="btnBack" title="Back" disabled>
                        <span class="browser-tbtn-icon">◀</span>
                        <span class="browser-tbtn-label">Back</span>
                    </button>
                    <button class="browser-tbtn" id="btnForward" title="Forward" disabled>
                        <span class="browser-tbtn-icon">▶</span>
                        <span class="browser-tbtn-label">Forward</span>
                    </button>
                    <button class="browser-tbtn" id="btnStop" title="Stop" disabled>
                        <span class="browser-tbtn-icon">✕</span>
                        <span class="browser-tbtn-label">Stop</span>
                    </button>
                    <button class="browser-tbtn" id="btnRefresh" title="Refresh">
                        <span class="browser-tbtn-icon">↻</span>
                        <span class="browser-tbtn-label">Refresh</span>
                    </button>
                    <button class="browser-tbtn" id="btnHome" title="Home">
                        <span class="browser-tbtn-icon">🏠</span>
                        <span class="browser-tbtn-label">Home</span>
                    </button>
                    <span class="browser-tbar-sep"></span>
                    <button class="browser-tbtn" id="btnAddBookmark" title="Add to Favorites">
                        <span class="browser-tbtn-icon">⭐</span>
                        <span class="browser-tbtn-label">Add</span>
                    </button>
                    <div class="browser-spinner" id="globeSpinner" title="Active Channel">
                        <span class="browser-globe">🌐</span>
                    </div>
                </div>
                <div class="browser-addrbar">
                    <span class="browser-addr-label">Address</span>
                    <div class="browser-addr-input-wrap">
                        <input type="text" class="browser-addr-input" id="addressInput"
                            list="browserHistory" autocomplete="off" spellcheck="false"
                            value="${escAttr(startUrl)}">
                        <datalist id="browserHistory">
                            ${this.recentUrls.map(u => `<option value="${escAttr(u)}"></option>`).join('')}
                        </datalist>
                    </div>
                    <button class="browser-go-btn" id="btnGo" title="Go">Go</button>
                </div>
                <div class="browser-favbar">
                    <span class="browser-favbar-label">Links:</span>
                    <div class="browser-favbar-list" id="bookmarksBar"></div>
                </div>
                <div class="browser-content">
                    <div class="browser-loading" id="loadingMsg">
                        <div class="browser-loading-globe">🌐</div>
                        <div>Connecting...</div>
                    </div>
                    <iframe class="browser-iframe" id="browserFrame"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        referrerpolicy="no-referrer"></iframe>
                </div>
                <div class="browser-status">
                    <span class="browser-status-text" id="statusBar">Ready</span>
                    <span class="browser-progress" id="progressBar">
                        <span class="browser-progress-fill" id="progressFill"></span>
                    </span>
                    <span class="browser-zone" title="Internet zone">🌍 Internet</span>
                </div>
            </div>
        `;
    }

    onMount() {
        const addressInput = this.getElement('#addressInput');
        const frame = this.getElement('#browserFrame');

        this.addHandler(this.getElement('#btnBack'),    'click', () => this.goBack());
        this.addHandler(this.getElement('#btnForward'), 'click', () => this.goForward());
        this.addHandler(this.getElement('#btnStop'),    'click', () => this.stop());
        this.addHandler(this.getElement('#btnRefresh'), 'click', () => this.refresh());
        this.addHandler(this.getElement('#btnHome'),    'click', () => this.goHome());
        this.addHandler(this.getElement('#btnGo'),      'click', () => this.navigate(addressInput.value));
        this.addHandler(this.getElement('#btnAddBookmark'), 'click', () => this._addCurrentToBookmarks());

        this.addHandler(addressInput, 'keydown', (e) => {
            if (e.key === 'Enter') this.navigate(addressInput.value);
        });
        this.addHandler(addressInput, 'focus', () => addressInput.select());

        // Menu bar (mostly cosmetic, but Favorites lists bookmarks)
        this.getElements('.browser-menu').forEach(m => {
            this.addHandler(m, 'click', () => this._handleMenuClick(m.dataset.menu));
        });

        this._renderBookmarks();

        // Frame load / error events
        this.addHandler(frame, 'load', () => this._onFrameLoad());

        // Navigate to initial URL or homepage
        this.navigate(this.initialUrl || this.homepage);
        this.initialUrl = null;
    }

    async _handleMenuClick(menu) {
        this.playSound('click');
        switch (menu) {
            case 'file': {
                const url = await this.prompt('Open URL:', 'https://', 'File - Open');
                if (url) this.navigate(url);
                break;
            }
            case 'view':
                this.refresh();
                break;
            case 'edit': {
                const input = this.getElement('#addressInput');
                if (input) { input.focus(); input.select(); }
                break;
            }
            case 'favorites':
                this._addCurrentToBookmarks();
                break;
            case 'help':
                this.alert('Internet Explorer for IlluminatOS\n\nType a URL and press Enter, or click a link.\nFavorites are saved between sessions.');
                break;
        }
    }

    async _addCurrentToBookmarks() {
        const url = this.history[this.historyIndex] || (this.getElement('#addressInput')?.value || '');
        if (!url || !isSafeHttpUrl(url)) {
            this.updateStatus('Nothing to bookmark.');
            this.playSound('error');
            return;
        }
        if (this.bookmarks.find(b => b.url === url)) {
            this.updateStatus('Already in Favorites.');
            this.playSound('error');
            return;
        }
        const suggested = this._suggestNameForUrl(url);
        const name = await this.prompt('Name for this favorite:', suggested, 'Add to Favorites');
        if (!name) return;
        this.bookmarks.push({ name, url });
        this._persist();
        this._renderBookmarks();
        this.playSound('notify');
        this.updateStatus(`Added "${name}" to Favorites.`);
        this.emitAppEvent('bookmarkAdded', { name, url });
    }

    _suggestNameForUrl(url) {
        try {
            const host = new URL(url).hostname.replace(/^www\./, '');
            return host || url;
        } catch {
            return url;
        }
    }

    navigate(url) {
        if (!url) return;
        url = String(url).trim();
        if (!url) return;

        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
            url = 'https://' + url;
        }

        if (!isSafeHttpUrl(url)) {
            this.updateStatus('Blocked: unsafe URL scheme');
            this.playSound('error');
            return;
        }

        const frame = this.getElement('#browserFrame');
        const addressInput = this.getElement('#addressInput');

        if (frame) {
            this._setLoading(true);
            this.updateStatus('Opening page ' + url + '...');
            this.playSound('click');

            if (this.historyIndex < this.history.length - 1) {
                this.history = this.history.slice(0, this.historyIndex + 1);
            }
            this.history.push(url);
            this.historyIndex = this.history.length - 1;

            this._addToRecent(url);
            frame.src = url;
            if (addressInput) addressInput.value = url;
            this.updateNavButtons();
        }
    }

    _addToRecent(url) {
        this.recentUrls = [url, ...this.recentUrls.filter(u => u !== url)].slice(0, 20);
        this._persist();
        const datalist = this.getElement('#browserHistory');
        if (datalist) {
            datalist.innerHTML = this.recentUrls
                .map(u => `<option value="${escAttr(u)}"></option>`)
                .join('');
        }
    }

    goBack() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const url = this.history[this.historyIndex];
            const frame = this.getElement('#browserFrame');
            const addressInput = this.getElement('#addressInput');
            this.playSound('click');
            this._setLoading(true);
            if (frame) frame.src = url;
            if (addressInput) addressInput.value = url;
            this.updateStatus('Opening page ' + url + '...');
            this.updateNavButtons();
        }
    }

    goForward() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const url = this.history[this.historyIndex];
            const frame = this.getElement('#browserFrame');
            const addressInput = this.getElement('#addressInput');
            this.playSound('click');
            this._setLoading(true);
            if (frame) frame.src = url;
            if (addressInput) addressInput.value = url;
            this.updateStatus('Opening page ' + url + '...');
            this.updateNavButtons();
        }
    }

    refresh() {
        const frame = this.getElement('#browserFrame');
        if (frame && frame.src) {
            this.playSound('click');
            this._setLoading(true);
            this.updateStatus('Refreshing...');
            frame.src = frame.src;
        }
    }

    stop() {
        const frame = this.getElement('#browserFrame');
        if (frame && this._isLoading) {
            this.playSound('error');
            try { frame.src = 'about:blank'; } catch { /* ignore */ }
            this._setLoading(false);
            this.updateStatus('Stopped.');
        }
    }

    goHome() {
        this.playSound('click');
        this.navigate(this.homepage);
    }

    _onFrameLoad() {
        this._setLoading(false);
        this.updateStatus('Done');
        this.updateNavButtons();
        this.emitAppEvent('page:loaded', { url: this.history[this.historyIndex] || 'unknown' });
    }

    _setLoading(isLoading) {
        this._isLoading = !!isLoading;
        const loading = this.getElement('#loadingMsg');
        const spinner = this.getElement('#globeSpinner');
        const stopBtn = this.getElement('#btnStop');
        const progress = this.getElement('#progressBar');
        const fill = this.getElement('#progressFill');
        if (loading) loading.style.display = isLoading ? 'flex' : 'none';
        if (spinner) spinner.classList.toggle('spinning', isLoading);
        if (stopBtn) stopBtn.disabled = !isLoading;
        if (progress) progress.classList.toggle('active', isLoading);
        if (fill) fill.style.width = isLoading ? '100%' : '0%';
    }

    updateStatus(text) {
        const status = this.getElement('#statusBar');
        if (status) status.textContent = text;
    }

    updateNavButtons() {
        const btnBack = this.getElement('#btnBack');
        const btnForward = this.getElement('#btnForward');
        if (btnBack) btnBack.disabled = this.historyIndex <= 0;
        if (btnForward) btnForward.disabled = this.historyIndex >= this.history.length - 1;
    }

    _renderBookmarks() {
        const bar = this.getElement('#bookmarksBar');
        if (!bar) return;
        bar.innerHTML = '';
        this.bookmarks.forEach(b => {
            const span = document.createElement('span');
            span.className = 'browser-favbar-item';
            span.title = b.url;
            span.dataset.url = b.url;
            span.innerHTML = `<span class="browser-favbar-icon">📑</span><span class="browser-favbar-name">${escapeHtml(b.name)}</span>`;
            this.addHandler(span, 'click', () => {
                if (isSafeHttpUrl(span.dataset.url)) this.navigate(span.dataset.url);
            });
            this.addHandler(span, 'contextmenu', (e) => {
                e.preventDefault();
                this._removeBookmarkInteractive(b.url);
            });
            bar.appendChild(span);
        });
    }

    async _removeBookmarkInteractive(url) {
        const bm = this.bookmarks.find(b => b.url === url);
        if (!bm) return;
        const ok = await this.confirm(`Remove "${bm.name}" from Favorites?`, 'Remove Favorite');
        if (!ok) return;
        this.bookmarks = this.bookmarks.filter(b => b.url !== url);
        this._persist();
        this._renderBookmarks();
        this.playSound('click');
        this.updateStatus(`Removed "${bm.name}".`);
        this.emitAppEvent('bookmarkRemoved', { name: bm.name, url });
    }
}

export default Browser;
