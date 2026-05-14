/**
 * ContentTemplateManager - Diegetic messaging and content template system
 *
 * Workstream G from the ARG Expansion Master Plan.
 * Provides a tokenized template system for delivering narrative content
 * through diegetic channels: Inbox, IM, Phone/IVR, Browser, and system dialogs.
 *
 * Template model:
 *   - templateId: unique identifier
 *   - channel: target delivery channel (inbox, im, phone, browser, dialog)
 *   - locale: language/locale tag (default: 'en')
 *   - priority: delivery priority (low, normal, high, urgent)
 *   - content: tokenized content with {{var}} substitution
 *   - conditions: optional delivery conditions (flags, scene, time)
 *   - media: optional media attachments with fallback assets
 *
 * All template deliveries emit canonical content:* events.
 * Templates are registered from campaign packages or at runtime.
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus from '../core/EventBus.js';
import StorageManager from '../core/StorageManager.js';

/**
 * Supported delivery channels
 */
const CHANNELS = ['inbox', 'im', 'phone', 'browser', 'dialog'];

/**
 * Priority levels (lower number = higher priority)
 */
const PRIORITY_MAP = {
    urgent: 0,
    high: 1,
    normal: 2,
    low: 3
};

/**
 * Validate a template definition
 * @param {Object} template - Template to validate
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateTemplate(template) {
    const errors = [];

    if (!template || typeof template !== 'object') {
        return { valid: false, errors: ['Template must be an object'] };
    }

    if (!template.templateId || typeof template.templateId !== 'string') {
        errors.push('Missing or invalid templateId');
    }

    if (!template.channel || !CHANNELS.includes(template.channel)) {
        errors.push(`Invalid channel "${template.channel}" — must be one of: ${CHANNELS.join(', ')}`);
    }

    if (!template.content || typeof template.content !== 'object') {
        errors.push('Missing or invalid content object');
    } else {
        // Channel-specific content validation
        switch (template.channel) {
            case 'inbox':
                if (!template.content.subject) errors.push('Inbox template requires content.subject');
                if (!template.content.body) errors.push('Inbox template requires content.body');
                break;
            case 'im':
                if (!template.content.message) errors.push('IM template requires content.message');
                break;
            case 'phone':
                if (!template.content.script && !template.content.voicemail) {
                    errors.push('Phone template requires content.script or content.voicemail');
                }
                break;
            case 'browser':
                if (!template.content.html && !template.content.url) {
                    errors.push('Browser template requires content.html or content.url');
                }
                break;
            case 'dialog':
                if (!template.content.message) errors.push('Dialog template requires content.message');
                break;
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Replace {{token}} placeholders in a string with variable values
 * @param {string} text - Template text with {{token}} placeholders
 * @param {Object} vars - Variable map
 * @returns {string} Resolved text
 */
function resolveTokens(text, vars = {}) {
    if (typeof text !== 'string') return String(text || '');
    return text.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
        // Support dotted paths like {{sender.name}}
        const parts = key.split('.');
        let value = vars;
        for (const part of parts) {
            if (value == null || typeof value !== 'object') return match;
            value = value[part];
        }
        return value != null ? String(value) : match;
    });
}

/**
 * Deep-resolve tokens in an object's string values
 * @param {*} obj - Object to resolve
 * @param {Object} vars - Variable map
 * @returns {*} Resolved object
 */
function resolveContentTokens(obj, vars) {
    if (typeof obj === 'string') return resolveTokens(obj, vars);
    if (Array.isArray(obj)) return obj.map(item => resolveContentTokens(item, vars));
    if (obj && typeof obj === 'object') {
        const resolved = {};
        for (const [key, value] of Object.entries(obj)) {
            resolved[key] = resolveContentTokens(value, vars);
        }
        return resolved;
    }
    return obj;
}


class ContentTemplateManager extends FeatureBase {
    constructor() {
        super({
            id: 'content-template-manager',
            name: 'Content Template Manager',
            description: 'Manages diegetic messaging templates for narrative content delivery',
            icon: '📝',
            category: 'core',
            dependencies: [],
            config: {
                deliveryDelayMs: 500,
                maxQueueSize: 100
            },
            settings: [
                { key: 'deliveryDelayMs', label: 'Delivery delay (ms)', type: 'number' }
            ]
        });

        // Template registry: templateId -> template definition
        this._templates = new Map();

        // Delivery queue for scheduled/delayed messages
        this._deliveryQueue = [];

        // Delivery history for telemetry
        this._deliveryLog = [];

        // Active delivery timers
        this._timers = new Map();
    }

    async initialize() {
        // Load saved templates from storage
        const saved = StorageManager.get('contentTemplates');
        if (saved && typeof saved === 'object') {
            for (const [id, template] of Object.entries(saved)) {
                this._templates.set(id, template);
            }
        }

        // Listen for campaign template registration
        this.subscribe('story:campaign:enable', (payload) => {
            this._loadCampaignTemplates(payload.campaignId);
        });

        this.subscribe('story:campaign:disable', (payload) => {
            this._unloadCampaignTemplates(payload.campaignId);
        });

        // Listen for content delivery commands
        this.subscribe('command:content:deliver', (payload) => {
            this._handleDeliverCommand(payload);
        });

        this.subscribe('command:content:register', (payload) => {
            this._handleRegisterCommand(payload);
        });

        this.subscribe('command:content:schedule', (payload) => {
            this._handleScheduleCommand(payload);
        });

        // Query handlers
        this.subscribe('query:content:template', (payload) => {
            const template = this.getTemplate(payload.templateId);
            EventBus.emit('query:content:template:response', {
                requestId: payload.requestId,
                template
            });
        });

        this.subscribe('query:content:list', (payload) => {
            const templates = this.listTemplates(payload.channel);
            EventBus.emit('query:content:list:response', {
                requestId: payload.requestId,
                templates
            });
        });

        this.subscribe('query:content:history', (payload) => {
            EventBus.emit('query:content:history:response', {
                requestId: payload.requestId,
                history: [...this._deliveryLog]
            });
        });

        this.log('Initialized with', this._templates.size, 'templates');
    }

    // ==========================================
    // PUBLIC API
    // ==========================================

    /**
     * Register a content template
     * @param {Object} template - Template definition
     * @returns {{success: boolean, errors?: string[]}}
     */
    registerTemplate(template) {
        const validation = validateTemplate(template);
        if (!validation.valid) {
            return { success: false, errors: validation.errors };
        }

        this._templates.set(template.templateId, {
            ...template,
            registeredAt: Date.now()
        });

        this._saveTemplates();

        EventBus.emit('content:template:register', {
            templateId: template.templateId,
            channel: template.channel,
            timestamp: Date.now()
        });

        return { success: true };
    }

    /**
     * Register multiple templates at once (from campaign packages)
     * @param {string} campaignId - Source campaign ID
     * @param {Object[]} templates - Array of template definitions
     * @returns {{registered: number, errors: string[]}}
     */
    registerBulk(campaignId, templates) {
        const errors = [];
        let registered = 0;

        if (!Array.isArray(templates)) {
            return { registered: 0, errors: ['Templates must be an array'] };
        }

        for (const template of templates) {
            // Tag with campaign source
            template._campaignId = campaignId;
            const result = this.registerTemplate(template);
            if (result.success) {
                registered++;
            } else {
                errors.push(`${template.templateId || 'unknown'}: ${result.errors.join(', ')}`);
            }
        }

        return { registered, errors };
    }

    /**
     * Unregister a template
     * @param {string} templateId - Template ID
     * @returns {boolean}
     */
    unregisterTemplate(templateId) {
        const existed = this._templates.delete(templateId);
        if (existed) this._saveTemplates();
        return existed;
    }

    /**
     * Get a template by ID
     * @param {string} templateId - Template ID
     * @returns {Object|null}
     */
    getTemplate(templateId) {
        return this._templates.get(templateId) || null;
    }

    /**
     * List all templates, optionally filtered by channel
     * @param {string} [channel] - Optional channel filter
     * @returns {Object[]}
     */
    listTemplates(channel) {
        const list = [];
        for (const [id, template] of this._templates) {
            if (!channel || template.channel === channel) {
                list.push({ templateId: id, ...template });
            }
        }
        return list;
    }

    /**
     * Deliver a template with variable substitution
     * @param {string} templateId - Template to deliver
     * @param {Object} vars - Variable values for token substitution
     * @param {Object} [options] - Delivery options
     * @param {string} [options.fromNpcId] - NPC sender ID (for IM/inbox)
     * @param {string} [options.toNpcId] - NPC recipient for phone calls
     * @param {number} [options.delayMs] - Delivery delay override
     * @returns {{success: boolean, error?: string, deliveryId?: string}}
     */
    deliver(templateId, vars = {}, options = {}) {
        const template = this._templates.get(templateId);
        if (!template) {
            return { success: false, error: `Template not found: ${templateId}` };
        }

        // Check delivery conditions if defined
        if (template.conditions && !this._checkConditions(template.conditions)) {
            return { success: false, error: 'Delivery conditions not met' };
        }

        // Resolve content tokens
        const resolvedContent = resolveContentTokens(template.content, vars);

        // Generate delivery ID
        const deliveryId = `delivery-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        const deliveryPayload = {
            deliveryId,
            templateId,
            channel: template.channel,
            content: resolvedContent,
            priority: template.priority || 'normal',
            vars,
            options,
            timestamp: Date.now()
        };

        // Apply delivery delay
        const delayMs = options.delayMs ?? this.getConfig('deliveryDelayMs', 500);
        if (delayMs > 0) {
            const timer = setTimeout(() => {
                this._executeDelivery(deliveryPayload, template, options);
                this._timers.delete(deliveryId);
            }, delayMs);
            this._timers.set(deliveryId, timer);
        } else {
            this._executeDelivery(deliveryPayload, template, options);
        }

        return { success: true, deliveryId };
    }

    /**
     * Schedule a delivery for a future time or event
     * @param {string} templateId - Template to deliver
     * @param {Object} vars - Variable values
     * @param {Object} trigger - Trigger definition { type: 'delay'|'event', delayMs?, event? }
     * @returns {{success: boolean, scheduleId?: string}}
     */
    schedule(templateId, vars = {}, trigger = {}) {
        if (!this._templates.has(templateId)) {
            return { success: false, error: `Template not found: ${templateId}` };
        }

        const scheduleId = `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        if (trigger.type === 'delay' && trigger.delayMs > 0) {
            const timer = setTimeout(() => {
                this.deliver(templateId, vars);
                this._timers.delete(scheduleId);
            }, trigger.delayMs);
            this._timers.set(scheduleId, timer);
        } else if (trigger.type === 'event' && trigger.event) {
            const unsub = EventBus.on(trigger.event, () => {
                this.deliver(templateId, vars);
                unsub();
            });
            this.eventUnsubscribers.push(unsub);
        }

        return { success: true, scheduleId };
    }

    /**
     * Get delivery history
     * @param {number} [limit=50] - Max entries
     * @returns {Object[]}
     */
    getDeliveryHistory(limit = 50) {
        return this._deliveryLog.slice(-limit);
    }

    /**
     * Clear all templates and delivery state
     */
    reset() {
        this._templates.clear();
        this._deliveryQueue = [];
        this._deliveryLog = [];
        for (const timer of this._timers.values()) {
            clearTimeout(timer);
        }
        this._timers.clear();
        this._saveTemplates();
    }

    // ==========================================
    // INTERNAL: DELIVERY EXECUTION
    // ==========================================

    /**
     * Execute a template delivery to its target channel
     * @private
     */
    _executeDelivery(deliveryPayload, template, options) {
        const { channel, content } = deliveryPayload;

        try {
            switch (channel) {
                case 'inbox':
                    this._deliverInbox(content, template, options);
                    break;
                case 'im':
                    this._deliverIM(content, template, options);
                    break;
                case 'phone':
                    this._deliverPhone(content, template, options);
                    break;
                case 'browser':
                    this._deliverBrowser(content, template, options);
                    break;
                case 'dialog':
                    this._deliverDialog(content, template, options);
                    break;
            }

            // Log delivery
            this._deliveryLog.push({
                ...deliveryPayload,
                status: 'delivered',
                deliveredAt: Date.now()
            });

            // Emit delivery event
            EventBus.emit('content:delivered', deliveryPayload);

            // Emit telemetry event
            EventBus.emit('story:telemetry:checkpoint', {
                type: 'content_delivery',
                templateId: deliveryPayload.templateId,
                channel,
                timestamp: Date.now()
            });

        } catch (error) {
            this._deliveryLog.push({
                ...deliveryPayload,
                status: 'failed',
                error: error.message,
                failedAt: Date.now()
            });

            EventBus.emit('content:delivery:error', {
                ...deliveryPayload,
                error: error.message
            });

            this.warn(`Delivery failed for ${deliveryPayload.templateId}:`, error.message);
        }
    }

    /**
     * Deliver to Inbox app
     * @private
     */
    _deliverInbox(content, template, options) {
        EventBus.emit('command:inbox:receive', {
            from: content.from || options.fromNpcId || 'system@illuminatos.local',
            subject: content.subject || '(no subject)',
            body: content.body || '',
            attachments: content.attachments || [],
            priority: template.priority || 'normal',
            timestamp: Date.now()
        });
    }

    /**
     * Deliver to Instant Messenger app
     * @private
     */
    _deliverIM(content, template, options) {
        EventBus.emit('command:instant-messenger:receive', {
            from: content.from || options.fromNpcId || 'unknown',
            message: content.message || '',
            npcId: options.fromNpcId || content.npcId,
            avatar: content.avatar || null,
            timestamp: Date.now()
        });
    }

    /**
     * Deliver to Phone app
     * @private
     */
    _deliverPhone(content, template, options) {
        if (content.voicemail) {
            EventBus.emit('command:phone:voicemail', {
                from: content.from || options.fromNpcId || 'Unknown',
                message: content.voicemail,
                audioSrc: content.audioSrc || null,
                timestamp: Date.now()
            });
        } else {
            EventBus.emit('command:phone:incoming', {
                callerId: content.from || options.fromNpcId || 'Unknown',
                script: content.script || [],
                routeId: content.routeId || null,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Deliver to Browser app
     * @private
     */
    _deliverBrowser(content, template, options) {
        if (content.url) {
            EventBus.emit('command:browser:navigate', {
                url: content.url,
                timestamp: Date.now()
            });
        }
        if (content.html) {
            EventBus.emit('command:browser:inject', {
                pageId: content.pageId || 'default',
                fragmentId: content.fragmentId || `frag-${Date.now()}`,
                html: content.html,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Deliver as a system dialog
     * @private
     */
    _deliverDialog(content, template, options) {
        const dialogType = content.type || 'alert';
        switch (dialogType) {
            case 'alert':
                EventBus.emit('dialog:alert', {
                    message: content.message,
                    title: content.title || 'System Message'
                });
                break;
            case 'confirm':
                EventBus.emit('dialog:confirm', {
                    message: content.message,
                    title: content.title || 'Confirm'
                });
                break;
            case 'notification':
                EventBus.emit('notification:show', {
                    title: content.title || 'Notice',
                    message: content.message,
                    icon: content.icon || null,
                    duration: content.duration || 5000
                });
                break;
        }
    }

    // ==========================================
    // INTERNAL: CONDITIONS
    // ==========================================

    /**
     * Check delivery conditions against current narrative state
     * @private
     * @param {Object} conditions - Condition definitions
     * @returns {boolean}
     */
    _checkConditions(conditions) {
        // Flag conditions
        if (conditions.flags) {
            const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
            if (nsm) {
                for (const [key, expected] of Object.entries(conditions.flags)) {
                    const actual = nsm.getFlag(key);
                    if (actual !== expected) return false;
                }
            }
        }

        // Scene conditions
        if (conditions.scene) {
            const nsm = window.__RETROS_DEBUG?.narrativeStateManager;
            if (nsm && nsm.getCurrentScene() !== conditions.scene) {
                return false;
            }
        }

        return true;
    }

    // ==========================================
    // INTERNAL: CAMPAIGN INTEGRATION
    // ==========================================

    /**
     * Load templates from a campaign's content packs
     * @private
     */
    _loadCampaignTemplates(campaignId) {
        const cm = window.__RETROS_DEBUG?.campaignManager;
        if (!cm) return;

        const campaign = cm._campaigns?.get(campaignId);
        if (!campaign) return;

        // Load mail templates as inbox content templates
        if (campaign.mail && typeof campaign.mail === 'object') {
            for (const [id, mailData] of Object.entries(campaign.mail)) {
                this.registerTemplate({
                    templateId: `${campaignId}:mail:${id}`,
                    channel: 'inbox',
                    priority: mailData.priority || 'normal',
                    content: {
                        from: mailData.from || 'campaign@illuminatos.local',
                        subject: mailData.subject || '',
                        body: mailData.body || '',
                        attachments: mailData.attachments || []
                    },
                    conditions: mailData.conditions || {},
                    _campaignId: campaignId
                });
            }
        }

        // Load NPC data as IM templates
        if (campaign.npc && typeof campaign.npc === 'object') {
            for (const [npcId, npcData] of Object.entries(campaign.npc)) {
                if (npcData.messages && Array.isArray(npcData.messages)) {
                    npcData.messages.forEach((msg, i) => {
                        this.registerTemplate({
                            templateId: `${campaignId}:npc:${npcId}:${i}`,
                            channel: 'im',
                            priority: msg.priority || 'normal',
                            content: {
                                from: npcData.name || npcId,
                                npcId,
                                message: msg.text || msg.message || '',
                                avatar: npcData.avatar || null
                            },
                            conditions: msg.conditions || {},
                            _campaignId: campaignId
                        });
                    });
                }
            }
        }

        this.log(`Loaded templates from campaign: ${campaignId}`);
    }

    /**
     * Unload templates from a campaign
     * @private
     */
    _unloadCampaignTemplates(campaignId) {
        const toRemove = [];
        for (const [id, template] of this._templates) {
            if (template._campaignId === campaignId) {
                toRemove.push(id);
            }
        }
        for (const id of toRemove) {
            this._templates.delete(id);
        }
        if (toRemove.length > 0) {
            this._saveTemplates();
            this.log(`Unloaded ${toRemove.length} templates from campaign: ${campaignId}`);
        }
    }

    // ==========================================
    // INTERNAL: COMMAND HANDLERS
    // ==========================================

    /** @private */
    _handleDeliverCommand(payload) {
        payload = payload || {};
        const result = this.deliver(
            payload.templateId,
            payload.vars || {},
            payload.options || {}
        );
        if (payload.requestId) {
            EventBus.emit('action:result', {
                requestId: payload.requestId,
                success: result.success,
                data: result
            });
        }
    }

    /** @private */
    _handleRegisterCommand(payload) {
        payload = payload || {};
        const result = this.registerTemplate(payload.template || payload);
        if (payload.requestId) {
            EventBus.emit('action:result', {
                requestId: payload.requestId,
                success: result.success,
                data: result
            });
        }
    }

    /** @private */
    _handleScheduleCommand(payload) {
        payload = payload || {};
        const result = this.schedule(
            payload.templateId,
            payload.vars || {},
            payload.trigger || {}
        );
        if (payload.requestId) {
            EventBus.emit('action:result', {
                requestId: payload.requestId,
                success: result.success,
                data: result
            });
        }
    }

    // ==========================================
    // PERSISTENCE
    // ==========================================

    /** @private */
    _saveTemplates() {
        const data = {};
        for (const [id, template] of this._templates) {
            data[id] = template;
        }
        StorageManager.set('contentTemplates', data);
    }

    cleanup() {
        for (const timer of this._timers.values()) {
            clearTimeout(timer);
        }
        this._timers.clear();
        super.cleanup();
    }
}

// Export singleton instance
const contentTemplateManager = new ContentTemplateManager();

// Debug access
if (typeof window !== 'undefined') {
    window.__RETROS_DEBUG = window.__RETROS_DEBUG || {};
    window.__RETROS_DEBUG.contentTemplateManager = contentTemplateManager;
}

export default contentTemplateManager;
export { validateTemplate, resolveTokens, CHANNELS, PRIORITY_MAP };
