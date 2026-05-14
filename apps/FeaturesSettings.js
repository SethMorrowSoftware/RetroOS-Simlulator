/**
 * FeaturesSettings - Settings app for managing system features
 * Allows users to enable/disable features and configure feature settings
 */

import AppBase from './AppBase.js';
import EventBus from '../core/EventBus.js';
import { escapeHtml } from '../core/Sanitize.js';
import FeatureRegistry, { FEATURE_CATEGORIES } from '../core/FeatureRegistry.js';

class FeaturesSettings extends AppBase {
    constructor() {
        super({
            id: 'features-settings',
            name: 'Features',
            icon: '⚙️',
            width: 680,
            height: 540,
            minWidth: 540,
            minHeight: 440,
            resizable: true,
            category: 'settings',
            singleton: true
        });

        // Register semantic event commands for scriptability
        this.registerCommands();
        this.registerQueries();
    }

    registerCommands() {
        this.registerCommand('enableFeature', (payload) => {
            if (!payload || !payload.featureId) return { success: false, error: 'featureId is required' };
            try {
                FeatureRegistry.enable(payload.featureId);
                this.emitAppEvent('feature:enabled', { featureId: payload.featureId });
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        this.registerCommand('disableFeature', (payload) => {
            if (!payload || !payload.featureId) return { success: false, error: 'featureId is required' };
            try {
                FeatureRegistry.disable(payload.featureId);
                this.emitAppEvent('feature:disabled', { featureId: payload.featureId });
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });

        this.registerCommand('setFeatureConfig', (payload) => {
            if (!payload || !payload.featureId || !payload.key) return { success: false, error: 'featureId and key are required' };
            try {
                FeatureRegistry.setFeatureConfig(payload.featureId, payload.key, payload.value);
                this.emitAppEvent('feature:configChanged', { featureId: payload.featureId, key: payload.key, value: payload.value });
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });
    }

    registerQueries() {
        this.registerQuery('getFeatures', (payload) => {
            const features = FeatureRegistry.getAll();
            if (payload && payload.category) {
                return features.filter(f => f.category === payload.category);
            }
            return features;
        });

        this.registerQuery('getFeature', (payload) => {
            if (!payload || !payload.featureId) return null;
            const features = FeatureRegistry.getAll();
            return features.find(f => f.id === payload.featureId) || null;
        });

        this.registerQuery('isFeatureEnabled', (payload) => {
            if (!payload || !payload.featureId) return false;
            const features = FeatureRegistry.getAll();
            const feature = features.find(f => f.id === payload.featureId);
            return feature ? feature.enabled : false;
        });
    }

    onOpen() {
        const features = FeatureRegistry.getAll();
        console.log('[FeaturesSettings] Features from registry:', features);
        console.log('[FeaturesSettings] Feature count:', features.length);

        // Debug: If no features, log additional info
        if (features.length === 0) {
            console.error('[FeaturesSettings] WARNING: No features returned from registry!');
            console.log('[FeaturesSettings] Checking FeatureRegistry state...');
            const debugInfo = FeatureRegistry.getDebugInfo();
            console.log('[FeaturesSettings] Registry debug info:', debugInfo);
        } else {
            console.log('[FeaturesSettings] Features loaded:', features.map(f => `${f.id} (${f.category})`));
        }

        return `
            <div class="features-settings">
                <div class="features-header">
                    <h2>System Features</h2>
                    <p>Enable or disable features and configure their settings.</p>
                </div>
                <div class="features-content">
                    <div class="features-sidebar">
                        <div class="feature-category active" data-category="all">
                            <span class="category-icon">📋</span>
                            All Features
                        </div>
                        <div class="feature-category" data-category="core">
                            <span class="category-icon">⚡</span>
                            Core
                        </div>
                        <div class="feature-category" data-category="enhancement">
                            <span class="category-icon">✨</span>
                            Enhancements
                        </div>
                        <div class="feature-category" data-category="plugin">
                            <span class="category-icon">🔌</span>
                            Plugins
                        </div>
                    </div>
                    <div class="features-list">
                        ${this.renderFeatureList(features)}
                    </div>
                </div>
            </div>
            <style>
                .features-settings {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    font-family: 'MS Sans Serif', Tahoma, sans-serif;
                }
                .features-header {
                    padding: 10px 15px;
                    border-bottom: 1px solid #808080;
                    background: linear-gradient(180deg, #fff 0%, #f0f0f0 100%);
                }
                .features-header h2 {
                    margin: 0 0 5px 0;
                    font-size: 14px;
                    font-weight: bold;
                }
                .features-header p {
                    margin: 0;
                    font-size: 12px;
                    color: #666;
                }
                .features-content {
                    display: flex;
                    flex: 1;
                    overflow: hidden;
                }
                .features-sidebar {
                    width: 140px;
                    background: #f0f0f0;
                    border-right: 1px solid #808080;
                    padding: 10px 0;
                }
                .feature-category {
                    padding: 8px 15px;
                    cursor: pointer;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .feature-category:hover {
                    background: #e0e0e0;
                }
                .feature-category.active {
                    background: #fff;
                    border-left: 3px solid #000080;
                    font-weight: bold;
                }
                .category-icon {
                    font-size: 14px;
                }
                .features-list {
                    flex: 1;
                    overflow-y: auto;
                    padding: 10px;
                    background: #fff;
                }
                .feature-card {
                    border: 1px solid #ccc;
                    margin-bottom: 10px;
                    background: #fff;
                }
                .feature-card.disabled {
                    opacity: 0.6;
                }
                .feature-header {
                    display: flex;
                    align-items: center;
                    padding: 10px;
                    background: linear-gradient(180deg, #f8f8f8 0%, #e8e8e8 100%);
                    border-bottom: 1px solid #ddd;
                }
                .feature-icon {
                    font-size: 24px;
                    margin-right: 10px;
                }
                .feature-info {
                    flex: 1;
                }
                .feature-name {
                    font-weight: bold;
                    font-size: 12px;
                    margin: 0 0 3px 0;
                }
                .feature-desc {
                    font-size: 12px;
                    color: #666;
                    margin: 0;
                }
                .feature-toggle {
                    position: relative;
                }
                .toggle-switch {
                    appearance: none;
                    width: 40px;
                    height: 20px;
                    background: #ccc;
                    border-radius: 10px;
                    position: relative;
                    cursor: pointer;
                    outline: none;
                }
                .toggle-switch:checked {
                    background: #000080;
                }
                .toggle-switch::before {
                    content: '';
                    position: absolute;
                    width: 16px;
                    height: 16px;
                    background: white;
                    border-radius: 50%;
                    top: 2px;
                    left: 2px;
                    transition: transform 0.2s;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
                }
                .toggle-switch:checked::before {
                    transform: translateX(20px);
                }
                .toggle-switch:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .feature-settings {
                    padding: 10px;
                    border-top: 1px solid #eee;
                    display: none;
                }
                .feature-card.expanded .feature-settings {
                    display: block;
                }
                .feature-expand {
                    cursor: pointer;
                    padding: 5px 10px;
                    background: none;
                    border: none;
                    font-size: 12px;
                    color: #666;
                }
                .feature-expand:hover {
                    color: #000;
                }
                .setting-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 8px;
                    gap: 10px;
                }
                .setting-label {
                    flex: 1;
                    font-size: 12px;
                }
                .setting-input {
                    width: 120px;
                }
                .setting-input[type="range"] {
                    width: 100px;
                }
                .setting-value {
                    font-size: 12px;
                    color: #666;
                    width: 40px;
                    text-align: right;
                }
                .category-badge {
                    font-size: 12px;
                    padding: 2px 6px;
                    border-radius: 8px;
                    background: #e0e0e0;
                    color: #666;
                    margin-left: 8px;
                }
                .category-badge.core {
                    background: #d4edda;
                    color: #155724;
                }
                .category-badge.enhancement {
                    background: #cce5ff;
                    color: #004085;
                }
                .category-badge.plugin {
                    background: #fff3cd;
                    color: #856404;
                }
            </style>
        `;
    }

    renderFeatureList(features, filterCategory = 'all') {
        const filtered = filterCategory === 'all'
            ? features
            : features.filter(f => f.category === filterCategory);

        if (filtered.length === 0) {
            return '<div style="padding: 20px; text-align: center; color: #666;">No features in this category</div>';
        }

        return filtered.map(f => this.renderFeatureCard(f)).join('');
    }

    renderFeatureCard(feature) {
        const isCore = feature.category === 'core';
        const hasSettings = feature.settings && feature.settings.length > 0;
        const safeId = escapeHtml(feature.id);
        const safeCat = escapeHtml(feature.category);

        return `
            <div class="feature-card ${feature.enabled ? '' : 'disabled'}" data-feature="${safeId}">
                <div class="feature-header">
                    <span class="feature-icon">${escapeHtml(feature.icon)}</span>
                    <div class="feature-info">
                        <p class="feature-name">
                            ${escapeHtml(feature.name)}
                            <span class="category-badge ${safeCat}">${safeCat}</span>
                        </p>
                        <p class="feature-desc">${escapeHtml(feature.description)}</p>
                    </div>
                    <div class="feature-toggle">
                        <input type="checkbox"
                               class="toggle-switch"
                               ${feature.enabled ? 'checked' : ''}
                               ${isCore ? 'disabled title="Core features cannot be disabled"' : ''}
                               data-feature="${safeId}">
                    </div>
                </div>
                ${hasSettings ? `
                    <button class="feature-expand" data-feature="${safeId}">
                        Settings ▼
                    </button>
                    <div class="feature-settings">
                        ${this.renderSettings(feature)}
                    </div>
                ` : ''}
            </div>
        `;
    }

    renderSettings(feature) {
        if (!feature.settings || feature.settings.length === 0) {
            return '';
        }

        return feature.settings
            .filter(s => s.key !== 'enabled') // Skip the main enable toggle
            .map(setting => this.renderSetting(feature.id, setting, feature.config))
            .join('');
    }

    renderSetting(featureId, setting, config) {
        const currentValue = config[setting.key] ?? setting.default;

        switch (setting.type) {
            case 'checkbox':
                return `
                    <div class="setting-row">
                        <label class="setting-label">${setting.label}</label>
                        <input type="checkbox"
                               ${currentValue ? 'checked' : ''}
                               data-feature="${featureId}"
                               data-key="${setting.key}">
                    </div>
                `;

            case 'slider':
                return `
                    <div class="setting-row">
                        <label class="setting-label">${setting.label}</label>
                        <input type="range"
                               class="setting-input"
                               min="${setting.min}"
                               max="${setting.max}"
                               step="${setting.step}"
                               value="${currentValue}"
                               data-feature="${featureId}"
                               data-key="${setting.key}">
                        <span class="setting-value">${currentValue}</span>
                    </div>
                `;

            case 'number':
                return `
                    <div class="setting-row">
                        <label class="setting-label">${setting.label}</label>
                        <input type="number"
                               class="setting-input"
                               min="${setting.min}"
                               max="${setting.max}"
                               step="${setting.step || 1}"
                               value="${setting.transform === 'milliseconds' ? currentValue / 1000 : currentValue}"
                               data-feature="${featureId}"
                               data-key="${setting.key}"
                               data-transform="${setting.transform || ''}">
                    </div>
                `;

            case 'select':
                return `
                    <div class="setting-row">
                        <label class="setting-label">${setting.label}</label>
                        <select class="setting-input"
                                data-feature="${featureId}"
                                data-key="${setting.key}">
                            ${setting.options.map(opt =>
                                `<option value="${opt}" ${opt === currentValue ? 'selected' : ''}>${opt}</option>`
                            ).join('')}
                        </select>
                    </div>
                `;

            default:
                return '';
        }
    }

    onMount() {
        // Use event delegation on the window content for all handlers
        const content = this.getElement();
        if (!content) return;

        // Single delegated handler for all interactions
        this.addHandler(content, 'change', async (e) => {
            // Handle feature toggle switches
            if (e.target.classList.contains('toggle-switch')) {
                const featureId = e.target.dataset.feature;
                const enabled = e.target.checked;
                this.playSound('click');

                try {
                    if (enabled) {
                        await FeatureRegistry.enable(featureId);
                    } else {
                        await FeatureRegistry.disable(featureId);
                    }

                    // Update card appearance
                    const card = e.target.closest('.feature-card');
                    if (card) {
                        card.classList.toggle('disabled', !enabled);
                    }
                } catch (error) {
                    console.error('Failed to toggle feature:', error);
                    this.playSound('error');
                    // Revert the toggle
                    e.target.checked = !enabled;
                    EventBus.emit('dialog:alert', {
                        title: 'Error',
                        message: error.message,
                        icon: 'error'
                    });
                }
                return;
            }

            // Handle setting checkboxes
            if (e.target.closest('.feature-settings') && e.target.type === 'checkbox') {
                const featureId = e.target.dataset.feature;
                const key = e.target.dataset.key;
                const value = e.target.checked;
                this.updateFeatureSetting(featureId, key, value);
                return;
            }

            // Handle setting number inputs
            if (e.target.closest('.feature-settings') && e.target.type === 'number') {
                const featureId = e.target.dataset.feature;
                const key = e.target.dataset.key;
                const transform = e.target.dataset.transform;
                let value = parseFloat(e.target.value);

                if (transform === 'milliseconds') {
                    value = value * 1000;
                }
                this.updateFeatureSetting(featureId, key, value);
                return;
            }

            // Handle setting selects
            if (e.target.closest('.feature-settings') && e.target.tagName === 'SELECT') {
                const featureId = e.target.dataset.feature;
                const key = e.target.dataset.key;
                const value = e.target.value;
                this.updateFeatureSetting(featureId, key, value);
                return;
            }
        });

        // Handle input events (for range sliders)
        this.addHandler(content, 'input', (e) => {
            if (e.target.closest('.feature-settings') && e.target.type === 'range') {
                const featureId = e.target.dataset.feature;
                const key = e.target.dataset.key;
                const value = parseFloat(e.target.value);

                // Update displayed value
                const valueDisplay = e.target.nextElementSibling;
                if (valueDisplay) {
                    valueDisplay.textContent = value;
                }

                this.updateFeatureSetting(featureId, key, value);
            }
        });

        // Handle click events
        this.addHandler(content, 'click', (e) => {
            // Handle expand/collapse settings
            if (e.target.classList.contains('feature-expand')) {
                const card = e.target.closest('.feature-card');
                if (card) {
                    card.classList.toggle('expanded');
                    e.target.textContent = card.classList.contains('expanded')
                        ? 'Settings ▲'
                        : 'Settings ▼';
                }
                return;
            }

            // Handle category switching
            const categoryEl = e.target.closest('.feature-category');
            if (categoryEl) {
                const category = categoryEl.dataset.category;

                // Update active state
                this.getElement('.feature-category.active')?.classList.remove('active');
                categoryEl.classList.add('active');

                // Re-render feature list
                const features = FeatureRegistry.getAll();
                const listContainer = this.getElement('.features-list');
                if (listContainer) {
                    listContainer.innerHTML = this.renderFeatureList(features, category);
                }
            }
        });
    }

    updateFeatureSetting(featureId, key, value) {
        try {
            FeatureRegistry.setFeatureConfig(featureId, key, value);
        } catch (error) {
            console.error('Failed to update setting:', error);
        }
    }
}

export default FeaturesSettings;
