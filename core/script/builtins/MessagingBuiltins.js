/**
 * MessagingBuiltins - Diegetic messaging script helpers for RetroScript
 *
 * Workstream G from the ARG Expansion Master Plan.
 * Provides script-level helpers for delivering content through diegetic channels:
 *
 *   inbox.*   — Send emails via Inbox app
 *   im.*      — Send NPC messages via Instant Messenger
 *   phone.*   — Trigger calls/voicemail via Phone app
 *   browser.* — Inject content into Browser app
 *   content.* — Direct template system access
 *
 * All delivery helpers emit canonical content:* events.
 * Available from Script Runner, Terminal `retro`, and autoexec scripts.
 */

export function registerMessagingBuiltins(interpreter) {

    /**
     * Helper: get ContentTemplateManager from debug context
     */
    function getCTM() {
        return (typeof window !== 'undefined' && window.__RETROS_DEBUG?.contentTemplateManager) || null;
    }

    /**
     * Helper: get EventBus for direct delivery when no template needed
     */
    function getEventBus() {
        return interpreter.context.EventBus || null;
    }

    // ==========================================
    // inbox.* — Inbox / Email delivery
    // ==========================================

    /**
     * inbox.send(from, subject, body, opts?) — Send an email to the player's inbox
     * Emits: command:inbox:receive, content:delivered
     */
    interpreter.registerBuiltin('inbox.send', (from, subject, body, opts) => {
        const eb = getEventBus();
        if (!eb) return false;

        const options = opts && typeof opts === 'object' ? opts : {};

        eb.emit('command:inbox:receive', {
            from: String(from || 'system@illuminatos.local'),
            subject: String(subject || '(no subject)'),
            body: String(body || ''),
            attachments: Array.isArray(options.attachments) ? options.attachments : [],
            priority: options.priority || 'normal',
            timestamp: Date.now()
        });

        eb.emit('content:delivered', {
            channel: 'inbox',
            from: String(from || ''),
            subject: String(subject || ''),
            timestamp: Date.now()
        });

        return true;
    });

    /**
     * inbox.sendTemplate(templateId, vars?) — Send using a registered template
     */
    interpreter.registerBuiltin('inbox.sendTemplate', (templateId, vars) => {
        const ctm = getCTM();
        if (!ctm) return false;

        const result = ctm.deliver(
            String(templateId || ''),
            vars && typeof vars === 'object' ? vars : {}
        );
        return result.success;
    });

    // ==========================================
    // im.* — Instant Messenger delivery
    // ==========================================

    /**
     * im.npcSend(npcId, message, opts?) — Send an IM message from an NPC
     * Emits: command:instant-messenger:receive, content:delivered
     */
    interpreter.registerBuiltin('im.npcSend', (npcId, message, opts) => {
        const eb = getEventBus();
        if (!eb) return false;

        const options = opts && typeof opts === 'object' ? opts : {};

        eb.emit('command:instant-messenger:receive', {
            from: options.displayName || String(npcId || 'unknown'),
            message: String(message || ''),
            npcId: String(npcId || ''),
            avatar: options.avatar || null,
            timestamp: Date.now()
        });

        eb.emit('content:delivered', {
            channel: 'im',
            npcId: String(npcId || ''),
            timestamp: Date.now()
        });

        return true;
    });

    /**
     * im.npcTyping(npcId, durationMs?) — Show typing indicator for an NPC
     */
    interpreter.registerBuiltin('im.npcTyping', (npcId, durationMs) => {
        const eb = getEventBus();
        if (!eb) return false;

        eb.emit('command:instant-messenger:typing', {
            npcId: String(npcId || ''),
            durationMs: Number(durationMs) || 3000
        });

        return true;
    });

    /**
     * im.sendTemplate(templateId, vars?) — Send IM using a registered template
     */
    interpreter.registerBuiltin('im.sendTemplate', (templateId, vars) => {
        const ctm = getCTM();
        if (!ctm) return false;

        const result = ctm.deliver(
            String(templateId || ''),
            vars && typeof vars === 'object' ? vars : {}
        );
        return result.success;
    });

    // ==========================================
    // phone.* — Phone / IVR delivery
    // ==========================================

    /**
     * phone.callScript(routeId, callerId, script?) — Trigger an incoming call
     * Emits: command:phone:incoming
     */
    interpreter.registerBuiltin('phone.callScript', (routeId, callerId, script) => {
        const eb = getEventBus();
        if (!eb) return false;

        eb.emit('command:phone:incoming', {
            callerId: String(callerId || 'Unknown'),
            routeId: String(routeId || ''),
            script: Array.isArray(script) ? script : [],
            timestamp: Date.now()
        });

        eb.emit('content:delivered', {
            channel: 'phone',
            routeId: String(routeId || ''),
            timestamp: Date.now()
        });

        return true;
    });

    /**
     * phone.voicemail(from, message, audioSrc?) — Leave a voicemail
     * Emits: command:phone:voicemail
     */
    interpreter.registerBuiltin('phone.voicemail', (from, message, audioSrc) => {
        const eb = getEventBus();
        if (!eb) return false;

        eb.emit('command:phone:voicemail', {
            from: String(from || 'Unknown'),
            message: String(message || ''),
            audioSrc: audioSrc ? String(audioSrc) : null,
            timestamp: Date.now()
        });

        eb.emit('content:delivered', {
            channel: 'phone',
            type: 'voicemail',
            from: String(from || ''),
            timestamp: Date.now()
        });

        return true;
    });

    // ==========================================
    // browser.* — Browser content injection
    // ==========================================

    /**
     * browser.inject(pageId, fragmentId, html) — Inject HTML fragment into browser
     * Emits: command:browser:inject
     */
    interpreter.registerBuiltin('browser.inject', (pageId, fragmentId, html) => {
        const eb = getEventBus();
        if (!eb) return false;

        eb.emit('command:browser:inject', {
            pageId: String(pageId || 'default'),
            fragmentId: String(fragmentId || `frag-${Date.now()}`),
            html: String(html || ''),
            timestamp: Date.now()
        });

        eb.emit('content:delivered', {
            channel: 'browser',
            pageId: String(pageId || ''),
            timestamp: Date.now()
        });

        return true;
    });

    /**
     * browser.navigate(url) — Navigate browser to a URL
     */
    interpreter.registerBuiltin('browser.navigate', (url) => {
        const eb = getEventBus();
        if (!eb) return false;

        eb.emit('command:browser:navigate', {
            url: String(url || ''),
            timestamp: Date.now()
        });

        return true;
    });

    // ==========================================
    // content.* — Direct template system access
    // ==========================================

    /**
     * content.deliver(templateId, vars?) — Deliver any registered template
     */
    interpreter.registerBuiltin('content.deliver', (templateId, vars) => {
        const ctm = getCTM();
        if (!ctm) return false;

        const result = ctm.deliver(
            String(templateId || ''),
            vars && typeof vars === 'object' ? vars : {}
        );
        return result.success;
    });

    /**
     * content.register(templateDef) — Register a template at runtime
     */
    interpreter.registerBuiltin('content.register', (templateDef) => {
        const ctm = getCTM();
        if (!ctm || !templateDef || typeof templateDef !== 'object') return false;

        const result = ctm.registerTemplate(templateDef);
        return result.success;
    });

    /**
     * content.schedule(templateId, vars, trigger) — Schedule a future delivery
     */
    interpreter.registerBuiltin('content.schedule', (templateId, vars, trigger) => {
        const ctm = getCTM();
        if (!ctm) return false;

        const result = ctm.schedule(
            String(templateId || ''),
            vars && typeof vars === 'object' ? vars : {},
            trigger && typeof trigger === 'object' ? trigger : {}
        );
        return result.success;
    });

    /**
     * content.history(limit?) — Get recent delivery history
     */
    interpreter.registerBuiltin('content.history', (limit) => {
        const ctm = getCTM();
        if (!ctm) return [];
        return ctm.getDeliveryHistory(Number(limit) || 50);
    });

    /**
     * content.list(channel?) — List registered templates
     */
    interpreter.registerBuiltin('content.list', (channel) => {
        const ctm = getCTM();
        if (!ctm) return [];
        return ctm.listTemplates(channel ? String(channel) : undefined);
    });
}

export default registerMessagingBuiltins;
