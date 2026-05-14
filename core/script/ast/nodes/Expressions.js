/**
 * Expression AST Nodes
 *
 * All expression types for the RetroScript language.
 * Expressions evaluate to values, unlike statements.
 */

import { Expression } from './Node.js';

/**
 * Literal expression - constant value
 * 42, "hello", true, false, null
 */
export class LiteralExpression extends Expression {
    constructor(value, location) {
        super('Literal', location);
        this.value = value;
    }

    accept(visitor) {
        return visitor.visitLiteralExpression(this);
    }
}

/**
 * Variable expression - variable reference
 * $varName
 */
export class VariableExpression extends Expression {
    constructor(name, location) {
        super('Variable', location);
        this.name = name;
    }

    accept(visitor) {
        return visitor.visitVariableExpression(this);
    }
}

/**
 * Binary expression - operator with two operands
 * left + right, left == right, left && right
 */
export class BinaryExpression extends Expression {
    constructor(operator, left, right, location) {
        super('Binary', location);
        this.operator = operator;
        this.left = left;
        this.right = right;
    }

    accept(visitor) {
        return visitor.visitBinaryExpression(this);
    }
}

/**
 * Unary expression - operator with one operand
 * !value, -value
 */
export class UnaryExpression extends Expression {
    constructor(operator, operand, location) {
        super('Unary', location);
        this.operator = operator;
        this.operand = operand;
    }

    accept(visitor) {
        return visitor.visitUnaryExpression(this);
    }
}

/**
 * Call expression - function call that returns value
 * call funcName arg1 arg2
 */
export class CallExpression extends Expression {
    constructor(funcName, args, location) {
        super('Call', location);
        this.funcName = funcName;
        this.args = args;
    }

    accept(visitor) {
        return visitor.visitCallExpression(this);
    }
}

/**
 * Array literal expression
 * [1, 2, 3]
 */
export class ArrayExpression extends Expression {
    constructor(elements, location) {
        super('Array', location);
        this.elements = elements;
    }

    accept(visitor) {
        return visitor.visitArrayExpression(this);
    }
}

/**
 * Object literal expression
 * {key: value, key2: value2}
 */
export class ObjectExpression extends Expression {
    constructor(properties, location) {
        super('Object', location);
        this.properties = properties; // Array of {key, value} pairs
    }

    accept(visitor) {
        return visitor.visitObjectExpression(this);
    }
}

/**
 * Member access expression - property access
 * $object.property
 */
export class MemberExpression extends Expression {
    constructor(object, property, location) {
        super('Member', location);
        this.object = object;
        this.property = property;
    }

    accept(visitor) {
        return visitor.visitMemberExpression(this);
    }
}

/**
 * Index expression - array/object index access
 * $array[0], $object["key"]
 */
export class IndexExpression extends Expression {
    constructor(object, index, location) {
        super('Index', location);
        this.object = object;
        this.index = index;
    }

    accept(visitor) {
        return visitor.visitIndexExpression(this);
    }
}

/**
 * Grouping expression - parenthesized expression
 * (expression)
 */
export class GroupingExpression extends Expression {
    constructor(expression, location) {
        super('Grouping', location);
        this.expression = expression;
    }

    accept(visitor) {
        return visitor.visitGroupingExpression(this);
    }
}

/**
 * String interpolation expression
 * "Hello, $name!"
 */
export class InterpolatedStringExpression extends Expression {
    constructor(parts, location) {
        super('InterpolatedString', location);
        this.parts = parts; // Array of string literals and expressions
    }

    accept(visitor) {
        return visitor.visitInterpolatedStringExpression(this);
    }
}

/**
 * Operator precedence levels (higher = binds tighter)
 */
export const PRECEDENCE = {
    OR: 1,          // ||
    AND: 2,         // &&
    EQUALITY: 3,    // == !=
    COMPARISON: 4,  // < > <= >=
    TERM: 5,        // + -
    FACTOR: 6,      // * / %
    UNARY: 7,       // ! -
    CALL: 8         // function()
};

/**
 * Get precedence for an operator
 * @param {string} operator - Operator string
 * @returns {number} Precedence level
 */
export function getOperatorPrecedence(operator) {
    switch (operator) {
        case '||': return PRECEDENCE.OR;
        case '&&': return PRECEDENCE.AND;
        case '==':
        case '!=': return PRECEDENCE.EQUALITY;
        case '<':
        case '>':
        case '<=':
        case '>=': return PRECEDENCE.COMPARISON;
        case '+':
        case '-': return PRECEDENCE.TERM;
        case '*':
        case '/':
        case '%': return PRECEDENCE.FACTOR;
        default: return 0;
    }
}

/**
 * Check if operator is right-associative
 * @param {string} operator - Operator string
 * @returns {boolean} True if right-associative
 */
export function isRightAssociative(operator) {
    // Most operators are left-associative
    // Only assignment-like operators would be right-associative
    return false;
}

export default {
    LiteralExpression,
    VariableExpression,
    BinaryExpression,
    UnaryExpression,
    CallExpression,
    ArrayExpression,
    ObjectExpression,
    MemberExpression,
    IndexExpression,
    GroupingExpression,
    InterpolatedStringExpression,
    PRECEDENCE,
    getOperatorPrecedence,
    isRightAssociative
};
