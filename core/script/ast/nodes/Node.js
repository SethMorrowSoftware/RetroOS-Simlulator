/**
 * Node - Base classes for AST nodes
 *
 * All AST nodes inherit from these base classes and implement
 * the visitor pattern for clean execution.
 */

/**
 * Base class for all AST nodes
 */
export class Node {
    /**
     * @param {string} type - Node type identifier
     * @param {Object} location - Source location
     * @param {number} location.line - Line number
     * @param {number} location.column - Column number
     */
    constructor(type, location = { line: 0, column: 0 }) {
        this.nodeType = type;
        this.line = location.line;
        this.column = location.column;
    }

    /**
     * Accept a visitor (visitor pattern)
     * @param {Object} visitor - Visitor object
     * @returns {*} Result from visitor
     */
    accept(visitor) {
        throw new Error(`accept() not implemented for ${this.nodeType}`);
    }

    /**
     * Get location info for error messages
     * @returns {Object} Location object
     */
    getLocation() {
        return { line: this.line, column: this.column };
    }
}

/**
 * Base class for statement nodes
 */
export class Statement extends Node {
    constructor(type, location) {
        super(type, location);
    }
}

/**
 * Base class for expression nodes
 */
export class Expression extends Node {
    constructor(type, location) {
        super(type, location);
    }
}

export default { Node, Statement, Expression };
