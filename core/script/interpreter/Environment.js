/**
 * Environment - Lexical scope chain for variables
 *
 * Provides proper scoping for variables with parent chain lookup.
 * Supports nested scopes for functions, loops, and blocks.
 */

/**
 * Properties that must never be traversed via dot-notation to prevent
 * prototype pollution and sandbox escape.
 */
const FORBIDDEN_PROPS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Environment class - manages variable scope
 */
export class Environment {
    /**
     * @param {Environment|null} parent - Parent environment for scope chain
     */
    constructor(parent = null) {
        this.parent = parent;
        this.vars = new Map();
    }

    /**
     * Get variable value from current or parent scope
     * Supports dot notation for nested properties (e.g., 'event.appId')
     * @param {string} name - Variable name
     * @returns {*} Variable value or undefined
     */
    get(name) {
        // Handle dot notation for nested property access
        if (name.includes('.')) {
            const parts = name.split('.');
            const rootName = parts[0];
            let value = this.vars.has(rootName)
                ? this.vars.get(rootName)
                : (this.parent ? this.parent.get(rootName) : undefined);

            // Traverse the property path (block dangerous property names)
            for (let i = 1; i < parts.length && value != null; i++) {
                if (FORBIDDEN_PROPS.has(parts[i])) return undefined;
                value = value[parts[i]];
            }
            return value;
        }

        // Simple variable lookup
        if (this.vars.has(name)) {
            return this.vars.get(name);
        }
        if (this.parent) {
            return this.parent.get(name);
        }
        return undefined;
    }

    /**
     * Set variable in current scope
     * @param {string} name - Variable name
     * @param {*} value - Variable value
     */
    set(name, value) {
        this.vars.set(name, value);
    }

    /**
     * Update variable in nearest scope that has it, or create in current scope
     * This is used for variable assignment to ensure proper scoping
     * @param {string} name - Variable name
     * @param {*} value - Variable value
     */
    update(name, value) {
        // Handle dot notation for nested property assignment
        if (name.includes('.')) {
            const parts = name.split('.');
            const rootName = parts[0];
            let obj = this.vars.has(rootName)
                ? this.vars.get(rootName)
                : (this.parent ? this.parent.get(rootName) : undefined);

            if (obj != null && typeof obj === 'object') {
                let current = obj;
                for (let i = 1; i < parts.length - 1; i++) {
                    if (FORBIDDEN_PROPS.has(parts[i])) return;
                    if (current[parts[i]] == null || typeof current[parts[i]] !== 'object') {
                        current[parts[i]] = {};
                    }
                    current = current[parts[i]];
                }
                const lastProp = parts[parts.length - 1];
                if (FORBIDDEN_PROPS.has(lastProp)) return;
                current[lastProp] = value;
                return;
            }
            // If root doesn't exist, create as nested object
            const newObj = {};
            let current = newObj;
            for (let i = 1; i < parts.length - 1; i++) {
                if (FORBIDDEN_PROPS.has(parts[i])) return;
                current[parts[i]] = {};
                current = current[parts[i]];
            }
            const lastProp = parts[parts.length - 1];
            if (FORBIDDEN_PROPS.has(lastProp)) return;
            current[lastProp] = value;
            this.vars.set(rootName, newObj);
            return;
        }

        if (this.vars.has(name)) {
            this.vars.set(name, value);
        } else if (this.parent && this.parent.has(name)) {
            this.parent.update(name, value);
        } else {
            // Variable doesn't exist anywhere, create in current scope
            this.vars.set(name, value);
        }
    }

    /**
     * Check if variable exists in current or parent scope
     * @param {string} name - Variable name
     * @returns {boolean} True if variable exists
     */
    has(name) {
        // Handle dot notation
        if (name.includes('.')) {
            const rootName = name.split('.')[0];
            return this.vars.has(rootName) || (this.parent ? this.parent.has(rootName) : false);
        }
        return this.vars.has(name) || (this.parent ? this.parent.has(name) : false);
    }

    /**
     * Delete variable from current scope
     * @param {string} name - Variable name
     * @returns {boolean} True if variable was deleted
     */
    delete(name) {
        return this.vars.delete(name);
    }

    /**
     * Create child environment with this as parent
     * @returns {Environment} New child environment
     */
    extend() {
        return new Environment(this);
    }

    /**
     * Get all variables in current scope only
     * @returns {Object} Variables object
     */
    getLocal() {
        const vars = {};
        for (const [key, value] of this.vars) {
            vars[key] = value;
        }
        return vars;
    }

    /**
     * Get all variables in current and parent scopes
     * Parent variables are overwritten by child variables with same name
     * @returns {Object} All variables object
     */
    getAll() {
        const vars = this.parent ? this.parent.getAll() : {};
        for (const [key, value] of this.vars) {
            vars[key] = value;
        }
        return vars;
    }

    /**
     * Get number of variables in current scope
     * @returns {number} Variable count
     */
    size() {
        return this.vars.size;
    }

    /**
     * Clear all variables in current scope
     */
    clear() {
        this.vars.clear();
    }

    /**
     * Get the depth of this environment in the scope chain
     * @returns {number} Depth (0 = global)
     */
    depth() {
        let d = 0;
        let env = this.parent;
        while (env) {
            d++;
            env = env.parent;
        }
        return d;
    }

    /**
     * Get the global (root) environment
     * @returns {Environment} Global environment
     */
    global() {
        let env = this;
        while (env.parent) {
            env = env.parent;
        }
        return env;
    }

    /**
     * Create an iterator over variable entries
     * @returns {Iterator} Variable entries iterator
     */
    [Symbol.iterator]() {
        return this.vars.entries();
    }
}

export default Environment;
