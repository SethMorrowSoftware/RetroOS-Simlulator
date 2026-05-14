/**
 * Token - Token types and Token class for RetroScript lexer
 *
 * Defines all token types recognized by the lexer and provides
 * a Token class for representing individual tokens with location info.
 */

/**
 * Token type enumeration
 */
export const TokenType = {
    // Keywords - Control Flow
    IF: 'IF',
    THEN: 'THEN',
    ELSE: 'ELSE',
    LOOP: 'LOOP',
    REPEAT: 'REPEAT',
    WHILE: 'WHILE',
    FOREACH: 'FOREACH',
    FOR: 'FOR',
    IN: 'IN',
    BREAK: 'BREAK',
    CONTINUE: 'CONTINUE',
    MATCH: 'MATCH',

    // Keywords - Variables & Functions
    SET: 'SET',
    DEF: 'DEF',
    FUNC: 'FUNC',
    FUNCTION: 'FUNCTION',
    CALL: 'CALL',
    RETURN: 'RETURN',

    // Keywords - Error Handling
    TRY: 'TRY',
    CATCH: 'CATCH',

    // Keywords - Events
    ON: 'ON',
    EMIT: 'EMIT',

    // Keywords - I/O
    PRINT: 'PRINT',
    LOG: 'LOG',
    READ: 'READ',
    WRITE: 'WRITE',
    INTO: 'INTO',
    TO: 'TO',
    WITH: 'WITH',
    DEFAULT: 'DEFAULT',

    // Keywords - System
    LAUNCH: 'LAUNCH',
    OPEN: 'OPEN',
    CLOSE: 'CLOSE',
    WAIT: 'WAIT',
    SLEEP: 'SLEEP',
    FOCUS: 'FOCUS',
    MINIMIZE: 'MINIMIZE',
    MAXIMIZE: 'MAXIMIZE',

    // Keywords - File System
    MKDIR: 'MKDIR',
    DELETE: 'DELETE',
    RM: 'RM',

    // Keywords - Dialogs
    ALERT: 'ALERT',
    CONFIRM: 'CONFIRM',
    PROMPT: 'PROMPT',
    NOTIFY: 'NOTIFY',

    // Keywords - Sound/Media
    PLAY: 'PLAY',
    STOP: 'STOP',
    VIDEO: 'VIDEO',

    // Literals
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    TRUE: 'TRUE',
    FALSE: 'FALSE',
    NULL: 'NULL',

    // Operators - Arithmetic
    PLUS: 'PLUS',           // +
    MINUS: 'MINUS',         // -
    STAR: 'STAR',           // *
    SLASH: 'SLASH',         // /
    PERCENT: 'PERCENT',     // %

    // Operators - Comparison
    EQ: 'EQ',               // ==
    NEQ: 'NEQ',             // !=
    LT: 'LT',               // <
    GT: 'GT',               // >
    LTE: 'LTE',             // <=
    GTE: 'GTE',             // >=

    // Operators - Assignment
    ASSIGN: 'ASSIGN',       // =
    ARROW: 'ARROW',         // =>
    PLUS_ASSIGN: 'PLUS_ASSIGN',     // +=
    MINUS_ASSIGN: 'MINUS_ASSIGN',   // -=
    STAR_ASSIGN: 'STAR_ASSIGN',     // *=
    SLASH_ASSIGN: 'SLASH_ASSIGN',   // /=
    PERCENT_ASSIGN: 'PERCENT_ASSIGN', // %=

    // Operators - Logical
    AND: 'AND',             // &&
    OR: 'OR',               // ||
    NOT: 'NOT',             // !
    AMPERSAND: 'AMPERSAND', // & (single, for text)
    PIPE: 'PIPE',           // | (single, for text)

    // Delimiters
    LBRACE: 'LBRACE',       // {
    RBRACE: 'RBRACE',       // }
    LPAREN: 'LPAREN',       // (
    RPAREN: 'RPAREN',       // )
    LBRACKET: 'LBRACKET',   // [
    RBRACKET: 'RBRACKET',   // ]
    COMMA: 'COMMA',         // ,
    COLON: 'COLON',         // :
    SEMICOLON: 'SEMICOLON', // ;
    DOT: 'DOT',             // .

    // Special
    VARIABLE: 'VARIABLE',   // $varName
    IDENTIFIER: 'IDENTIFIER',
    NEWLINE: 'NEWLINE',
    COMMENT: 'COMMENT',     // # comment
    EOF: 'EOF'
};

/**
 * Map of keyword strings to token types
 */
export const KEYWORDS = {
    // Control Flow
    'if': TokenType.IF,
    'then': TokenType.THEN,
    'else': TokenType.ELSE,
    'loop': TokenType.LOOP,
    'repeat': TokenType.REPEAT,
    'while': TokenType.WHILE,
    'foreach': TokenType.FOREACH,
    'for': TokenType.FOR,
    'in': TokenType.IN,
    'break': TokenType.BREAK,
    'continue': TokenType.CONTINUE,
    'match': TokenType.MATCH,

    // Variables & Functions
    'set': TokenType.SET,
    'def': TokenType.DEF,
    'func': TokenType.FUNC,
    'function': TokenType.FUNCTION,
    'call': TokenType.CALL,
    'return': TokenType.RETURN,

    // Error Handling
    'try': TokenType.TRY,
    'catch': TokenType.CATCH,

    // Events
    'on': TokenType.ON,
    'emit': TokenType.EMIT,

    // I/O
    'print': TokenType.PRINT,
    'log': TokenType.LOG,
    'read': TokenType.READ,
    'write': TokenType.WRITE,
    'into': TokenType.INTO,
    'to': TokenType.TO,
    'with': TokenType.WITH,
    'default': TokenType.DEFAULT,

    // System
    'launch': TokenType.LAUNCH,
    'open': TokenType.OPEN,
    'close': TokenType.CLOSE,
    'wait': TokenType.WAIT,
    'sleep': TokenType.SLEEP,
    'focus': TokenType.FOCUS,
    'minimize': TokenType.MINIMIZE,
    'maximize': TokenType.MAXIMIZE,

    // File System
    'mkdir': TokenType.MKDIR,
    'delete': TokenType.DELETE,
    'rm': TokenType.RM,

    // Dialogs
    'alert': TokenType.ALERT,
    'confirm': TokenType.CONFIRM,
    'prompt': TokenType.PROMPT,
    'notify': TokenType.NOTIFY,

    // Sound/Media
    'play': TokenType.PLAY,
    'stop': TokenType.STOP,
    'video': TokenType.VIDEO,

    // Literals
    'true': TokenType.TRUE,
    'false': TokenType.FALSE,
    'null': TokenType.NULL
};

/**
 * Token class - represents a single token from source code
 */
export class Token {
    /**
     * @param {string} type - Token type from TokenType enum
     * @param {*} value - Token value (literal value for literals, raw text for others)
     * @param {number} line - Source line number (1-based)
     * @param {number} column - Source column number (1-based)
     * @param {string} [raw] - Original raw text from source
     */
    constructor(type, value, line, column, raw = null) {
        this.type = type;
        this.value = value;
        this.line = line;
        this.column = column;
        this.raw = raw ?? String(value);
    }

    /**
     * Check if token is of a specific type
     * @param {...string} types - Token types to check
     * @returns {boolean} True if token matches any of the types
     */
    is(...types) {
        return types.includes(this.type);
    }

    /**
     * Check if token is a keyword
     * @returns {boolean} True if token is a keyword
     */
    isKeyword() {
        return Object.values(KEYWORDS).includes(this.type);
    }

    /**
     * Check if token is a literal (number, string, boolean, null)
     * @returns {boolean} True if token is a literal
     */
    isLiteral() {
        return this.is(
            TokenType.NUMBER,
            TokenType.STRING,
            TokenType.TRUE,
            TokenType.FALSE,
            TokenType.NULL
        );
    }

    /**
     * Check if token is an operator
     * @returns {boolean} True if token is an operator
     */
    isOperator() {
        return this.is(
            TokenType.PLUS, TokenType.MINUS, TokenType.STAR,
            TokenType.SLASH, TokenType.PERCENT,
            TokenType.EQ, TokenType.NEQ,
            TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE,
            TokenType.ASSIGN,
            TokenType.AND, TokenType.OR, TokenType.NOT
        );
    }

    /**
     * Get string representation of token
     * @returns {string} Token string
     */
    toString() {
        return `Token(${this.type}, ${JSON.stringify(this.value)}, L${this.line}:${this.column})`;
    }

    /**
     * Create an EOF token
     * @param {number} line - Line number
     * @param {number} column - Column number
     * @returns {Token} EOF token
     */
    static eof(line, column) {
        return new Token(TokenType.EOF, null, line, column, '');
    }
}

export default { TokenType, KEYWORDS, Token };
