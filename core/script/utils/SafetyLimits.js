/**
 * SafetyLimits - Configuration for script execution safety limits
 *
 * Provides configurable limits to prevent resource exhaustion,
 * infinite loops, and other potentially dangerous script behaviors.
 */

import { TimeoutError } from '../errors/ScriptError.js';

/**
 * Default safety limit values
 */
export const DEFAULT_LIMITS = {
    /** Maximum function call recursion depth */
    MAX_RECURSION_DEPTH: 1000,

    /** Maximum iterations for any loop construct */
    MAX_LOOP_ITERATIONS: 100000,

    /** Maximum string length (1MB) */
    MAX_STRING_LENGTH: 1000000,

    /** Maximum array length */
    MAX_ARRAY_LENGTH: 100000,

    /** Maximum object keys */
    MAX_OBJECT_KEYS: 10000,

    /** Maximum event handlers that can be registered */
    MAX_EVENT_HANDLERS: 1000,

    /** Default execution timeout in milliseconds (30 seconds) */
    DEFAULT_EXECUTION_TIMEOUT: 30000,

    /** Autoexec script timeout (shorter for boot safety) */
    AUTOEXEC_TIMEOUT: 10000,

    /** Maximum call stack size for error reporting */
    MAX_CALL_STACK_SIZE: 100
};

/**
 * SafetyLimits class - manages execution limits
 */
export class SafetyLimits {
    constructor(customLimits = {}) {
        this.limits = { ...DEFAULT_LIMITS, ...customLimits };
        this.executionStartTime = null;
        this.currentTimeout = this.limits.DEFAULT_EXECUTION_TIMEOUT;
    }

    /**
     * Get a specific limit value
     * @param {string} key - Limit key name
     * @returns {number} Limit value
     */
    get(key) {
        return this.limits[key];
    }

    /**
     * Set a specific limit value
     * @param {string} key - Limit key name
     * @param {number} value - New limit value
     */
    set(key, value) {
        if (typeof value !== 'number' || value < 0) {
            throw new Error(`Invalid limit value for ${key}: must be a non-negative number`);
        }
        this.limits[key] = value;
    }

    /**
     * Set execution timeout for current script
     * @param {number} ms - Timeout in milliseconds (0 = no timeout)
     */
    setTimeout(ms) {
        this.currentTimeout = ms;
    }

    /**
     * Start execution timer
     */
    startExecution() {
        this.executionStartTime = Date.now();
    }

    /**
     * Stop execution timer
     */
    stopExecution() {
        this.executionStartTime = null;
    }

    /**
     * Check if execution has timed out
     * @returns {boolean} True if timed out
     */
    isTimedOut() {
        if (this.currentTimeout <= 0 || !this.executionStartTime) {
            return false;
        }
        return Date.now() - this.executionStartTime > this.currentTimeout;
    }

    /**
     * Get elapsed execution time
     * @returns {number} Elapsed time in milliseconds
     */
    getElapsedTime() {
        if (!this.executionStartTime) {
            return 0;
        }
        return Date.now() - this.executionStartTime;
    }

    /**
     * Check timeout and throw if exceeded
     * @throws {TimeoutError} If execution has timed out
     */
    checkTimeout() {
        if (this.isTimedOut()) {
            throw new TimeoutError(this.currentTimeout);
        }
    }

    /**
     * Validate loop iteration count
     * @param {number} count - Proposed iteration count
     * @returns {number} Clamped iteration count
     */
    clampLoopIterations(count) {
        const max = this.limits.MAX_LOOP_ITERATIONS;
        if (count < 0) return 0;
        if (count > max) {
            console.warn(`[SafetyLimits] Loop count ${count} exceeds maximum (${max}), clamping`);
            return max;
        }
        return count;
    }

    /**
     * Validate string length
     * @param {string} str - String to validate
     * @returns {string} Original string or truncated if too long
     */
    clampStringLength(str) {
        const max = this.limits.MAX_STRING_LENGTH;
        if (str.length > max) {
            console.warn(`[SafetyLimits] String length ${str.length} exceeds maximum (${max}), truncating`);
            return str.substring(0, max);
        }
        return str;
    }

    /**
     * Validate array length
     * @param {number} length - Proposed array length
     * @returns {number} Clamped array length
     */
    clampArrayLength(length) {
        const max = this.limits.MAX_ARRAY_LENGTH;
        if (length > max) {
            console.warn(`[SafetyLimits] Array length ${length} exceeds maximum (${max}), clamping`);
            return max;
        }
        return length;
    }

    /**
     * Check recursion depth
     * @param {number} depth - Current recursion depth
     * @returns {boolean} True if within limits
     */
    checkRecursionDepth(depth) {
        return depth <= this.limits.MAX_RECURSION_DEPTH;
    }

    /**
     * Check event handler count
     * @param {number} count - Current handler count
     * @returns {boolean} True if within limits
     */
    checkEventHandlerCount(count) {
        return count <= this.limits.MAX_EVENT_HANDLERS;
    }

    /**
     * Reset all limits to defaults
     */
    reset() {
        this.limits = { ...DEFAULT_LIMITS };
        this.executionStartTime = null;
        this.currentTimeout = this.limits.DEFAULT_EXECUTION_TIMEOUT;
    }

    /**
     * Get all current limits
     * @returns {Object} Current limit values
     */
    getAll() {
        return { ...this.limits };
    }
}

// Export singleton instance for convenience
export const defaultLimits = new SafetyLimits();

export default SafetyLimits;
