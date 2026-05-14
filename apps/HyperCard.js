import AppBase from './AppBase.js';

class HyperCard extends AppBase {
    constructor() {
        super({
            id: 'hypercard',
            name: 'HyperCard',
            icon: '📇',
            width: 720,
            height: 540,
            resizable: true,
            category: 'accessories',
            showInMenu: true
        });

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        this.registerCommand('reload', () => {
            this.refresh();
            this.emitAppEvent('reloaded', {});
            return { success: true };
        });

        this.registerCommand('goHome', () => {
            this.goHome();
            this.emitAppEvent('navigated', { destination: 'home' });
            return { success: true };
        });

        this.registerCommand('navigate', (payload) => {
            if (!payload || !payload.url) return { success: false, error: 'No url provided' };
            const frame = this.getElement('#hyperCardFrame');
            if (frame) {
                frame.src = payload.url;
                this.updateStatus('Loading...');
                this.emitAppEvent('navigated', { destination: payload.url });
            }
            return { success: true, url: payload.url };
        });

        this.registerCommand('setStatus', (payload) => {
            if (!payload || !payload.text) return { success: false, error: 'No text provided' };
            this.updateStatus(payload.text);
            return { success: true };
        });
    }

    /**
     * Register queries for reading state
     */
    registerQueries() {
        this.registerQuery('getState', () => {
            const statusBar = this.getElement('#statusBar');
            const frame = this.getElement('#hyperCardFrame');
            return {
                status: statusBar ? statusBar.textContent : 'Unknown',
                currentUrl: frame ? frame.src : null
            };
        });
    }

    onOpen() {
        return `
            <div class="hypercard-app">
                <div class="hypercard-toolbar">
                    <button class="hypercard-btn" id="btnHome" title="Home">🏠</button>
                    <button class="hypercard-btn" id="btnRefresh" title="Refresh">↻</button>
                    <div class="hypercard-info">
                        <span>Classic Macintosh System 7 with HyperCard 2.4</span>
                    </div>
                </div>

                <div class="hypercard-content">
                    <div class="hypercard-loading" id="loadingMsg">Loading Macintosh System 7...</div>
                    <iframe class="hypercard-iframe" id="hyperCardFrame"
                            src="https://archive.org/embed/HyperCardBootSystem7"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                            allowfullscreen webkitallowfullscreen mozallowfullscreen>
                    </iframe>
                </div>

                <div class="hypercard-status" id="statusBar">Ready</div>
            </div>
        `;
    }

    onMount() {
        const frame = this.getElement('#hyperCardFrame');
        const loadingMsg = this.getElement('#loadingMsg');

        // Handle iframe load
        this.addHandler(frame, 'load', () => {
            if (loadingMsg) loadingMsg.style.display = 'none';
            this.updateStatus('Ready');
            this.playSound('notify');
            this.emitAppEvent('loaded', {});
        });

        // Toolbar buttons
        this.addHandler(this.getElement('#btnHome'), 'click', () => {
            this.playSound('click');
            this.goHome();
        });

        this.addHandler(this.getElement('#btnRefresh'), 'click', () => {
            this.playSound('click');
            this.refresh();
        });

        // Update initial status
        this.updateStatus('Loading Macintosh System 7...');
    }

    goHome() {
        const frame = this.getElement('#hyperCardFrame');
        frame.src = 'https://archive.org/embed/HyperCardBootSystem7';
        this.updateStatus('Loading home...');
    }

    refresh() {
        const frame = this.getElement('#hyperCardFrame');
        frame.src = frame.src;
        this.updateStatus('Refreshing...');
    }

    updateStatus(message) {
        const statusBar = this.getElement('#statusBar');
        if (statusBar) {
            statusBar.textContent = message;
        }
    }
}

export default HyperCard;
