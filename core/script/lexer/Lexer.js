/**
 * Lexer - Tokenizer for RetroScript language
 *
 * Converts source code into a stream of tokens for the parser.
 * Handles string literals, comments, operators, and keywords.
 */

import { Token, TokenType, KEYWORDS } from './Token.js';
import { ParseError } from '../errors/ScriptError.js';

/**
 * Lexer class - converts source code to tokens
 */
export class Lexer {
    /**
     * @param {string} source - Source code to tokenize
     */
    constructor(source) {
        this.source = source;
        this.tokens = [];
        this.start = 0;      // Start of current token
        this.current = 0;    // Current position in source
        this.line = 1;       // Current line number
        this.column = 1;     // Current column number
        this.lineStart = 0;  // Start position of current line
    }

    /**
     * Tokenize the entire source code
     * @returns {Token[]} Array of tokens
     */
    tokenize() {
        while (!this.isAtEnd()) {
            this.start = this.current;
            this.scanToken();
        }

        // Add EOF token
        this.tokens.push(Token.eof(this.line, this.column));
        return this.tokens;
    }

    /**
     * Check if we've reached the end of source
     * @returns {boolean}
     */
    isAtEnd() {
        return this.current >= this.source.length;
    }

    /**
     * Scan a single token
     */
    scanToken() {
        const char = this.advance();

        switch (char) {
            // Single-character tokens
            case '(': this.addToken(TokenType.LPAREN); break;
            case ')': this.addToken(TokenType.RPAREN); break;
            case '{': this.addToken(TokenType.LBRACE); break;
            case '}': this.addToken(TokenType.RBRACE); break;
            case '[': this.addToken(TokenType.LBRACKET); break;
            case ']': this.addToken(TokenType.RBRACKET); break;
            case ',': this.addToken(TokenType.COMMA); break;
            case ':': this.addToken(TokenType.COLON); break;
            case ';': this.addToken(TokenType.SEMICOLON); break;
            case '.': this.addToken(TokenType.DOT); break;
            case '+':
                this.addToken(this.match('=') ? TokenType.PLUS_ASSIGN : TokenType.PLUS);
                break;
            case '-':
                this.addToken(this.match('=') ? TokenType.MINUS_ASSIGN : TokenType.MINUS);
                break;
            case '*':
                this.addToken(this.match('=') ? TokenType.STAR_ASSIGN : TokenType.STAR);
                break;
            case '/':
                this.addToken(this.match('=') ? TokenType.SLASH_ASSIGN : TokenType.SLASH);
                break;
            case '%':
                this.addToken(this.match('=') ? TokenType.PERCENT_ASSIGN : TokenType.PERCENT);
                break;

            // Two-character operators
            case '=':
                if (this.match('=')) {
                    this.addToken(TokenType.EQ);
                } else if (this.match('>')) {
                    this.addToken(TokenType.ARROW);
                } else {
                    this.addToken(TokenType.ASSIGN);
                }
                break;
            case '!':
                this.addToken(this.match('=') ? TokenType.NEQ : TokenType.NOT);
                break;
            case '<':
                this.addToken(this.match('=') ? TokenType.LTE : TokenType.LT);
                break;
            case '>':
                this.addToken(this.match('=') ? TokenType.GTE : TokenType.GT);
                break;
            case '&':
                if (this.match('&')) {
                    this.addToken(TokenType.AND);
                } else {
                    // Single & for text content (e.g., "Time & Date")
                    this.addToken(TokenType.AMPERSAND);
                }
                break;
            case '|':
                if (this.match('|')) {
                    this.addToken(TokenType.OR);
                } else {
                    // Single | for text content
                    this.addToken(TokenType.PIPE);
                }
                break;

            // Comments
            case '#':
                this.scanComment();
                break;

            // Whitespace
            case ' ':
            case '\r':
            case '\t':
                // Ignore whitespace
                break;

            case '\n':
                this.addToken(TokenType.NEWLINE);
                this.newLine();
                break;

            // String literals
            case '"':
            case "'":
                this.scanString(char);
                break;

            // Variable reference
            case '$':
                this.scanVariable();
                break;

            default:
                if (this.isDigit(char)) {
                    this.scanNumber();
                } else if (this.isAlpha(char)) {
                    this.scanIdentifier();
                } else {
                    this.error(`Unexpected character '${char}'`);
                }
                break;
        }
    }

    /**
     * Advance to next character
     * @returns {string} Current character
     */
    advance() {
        const char = this.source[this.current];
        this.current++;
        this.column++;
        return char;
    }

    /**
     * Peek at current character without advancing
     * @returns {string} Current character or empty string if at end
     */
    peek() {
        if (this.isAtEnd()) return '\0';
        return this.source[this.current];
    }

    /**
     * Peek at next character
     * @returns {string} Next character or empty string if at end
     */
    peekNext() {
        if (this.current + 1 >= this.source.length) return '\0';
        return this.source[this.current + 1];
    }

    /**
     * Match and consume expected character
     * @param {string} expected - Expected character
     * @returns {boolean} True if matched
     */
    match(expected) {
        if (this.isAtEnd()) return false;
        if (this.source[this.current] !== expected) return false;
        this.current++;
        this.column++;
        return true;
    }

    /**
     * Add a token to the list
     * @param {string} type - Token type
     * @param {*} [value] - Token value (defaults to lexeme)
     */
    addToken(type, value = null) {
        const text = this.source.substring(this.start, this.current);
        const tokenValue = value !== null ? value : text;
        const startColumn = this.start - this.lineStart + 1;
        this.tokens.push(new Token(type, tokenValue, this.line, startColumn, text));
    }

    /**
     * Handle newline
     */
    newLine() {
        this.line++;
        this.column = 1;
        this.lineStart = this.current;
    }

    /**
     * Scan a comment (everything after #)
     */
    scanComment() {
        while (this.peek() !== '\n' && !this.isAtEnd()) {
            this.advance();
        }
        // Comments are not added as tokens (could add for syntax highlighting)
    }

    /**
     * Scan a string literal
     * @param {string} quote - Opening quote character
     */
    scanString(quote) {
        const startLine = this.line;
        const startColumn = this.column - 1;

        while (this.peek() !== quote && !this.isAtEnd()) {
            if (this.peek() === '\n') {
                this.newLine();
            }
            // Handle escape sequences
            if (this.peek() === '\\' && this.peekNext() !== '\0') {
                this.advance(); // Skip backslash
            }
            this.advance();
        }

        if (this.isAtEnd()) {
            throw new ParseError(`Unterminated string`, {
                line: startLine,
                column: startColumn,
                hint: `String started with ${quote} but never closed`
            });
        }

        // Consume closing quote
        this.advance();

        // Extract string value (without quotes) and process escapes
        const raw = this.source.substring(this.start + 1, this.current - 1);
        const value = this.processEscapes(raw);
        this.addToken(TokenType.STRING, value);
    }

    /**
     * Process escape sequences in string
     * Uses single-pass replacement to correctly handle sequences like \\n
     * @param {string} str - Raw string
     * @returns {string} Processed string
     */
    processEscapes(str) {
        // Use single-pass replacement to correctly handle escape sequences
        // This ensures \\n becomes \n (literal backslash + n) not a newline
        return str.replace(/\\(.)/g, (match, char) => {
            switch (char) {
                case 'n': return '\n';
                case 't': return '\t';
                case 'r': return '\r';
                case '"': return '"';
                case "'": return "'";
                case '\\': return '\\';
                case '0': return '\0';
                // \$ = literal dollar that must NOT interpolate. U+0001 is a
                // sentinel the interpreter's interpolation pass strips; it
                // cannot appear in source text otherwise.
                case '$': return '\u0001$';
                default: return char; // Unknown escape, just return the character
            }
        });
    }

    /**
     * Scan a variable reference ($varName)
     */
    scanVariable() {
        while (this.isAlphaNumeric(this.peek()) || this.peek() === '.') {
            this.advance();
        }

        // Extract variable name (without $)
        const name = this.source.substring(this.start + 1, this.current);
        if (name.length === 0) {
            this.addToken(TokenType.IDENTIFIER, '$');
            return;
        }
        this.addToken(TokenType.VARIABLE, name);
    }

    /**
     * Scan a number literal
     */
    scanNumber() {
        while (this.isDigit(this.peek())) {
            this.advance();
        }

        // Look for decimal part
        if (this.peek() === '.' && this.isDigit(this.peekNext())) {
            this.advance(); // Consume '.'
            while (this.isDigit(this.peek())) {
                this.advance();
            }
        }

        const value = parseFloat(this.source.substring(this.start, this.current));
        this.addToken(TokenType.NUMBER, value);
    }

    /**
     * Scan an identifier or keyword
     * Note: Colons (:) are NOT included in identifiers to support object literals like {name: value}
     * For namespaced event names like "app:launch", use quotes or separate tokens
     */
    scanIdentifier() {
        while (this.isAlphaNumeric(this.peek()) || this.peek() === '_') {
            this.advance();
        }

        const text = this.source.substring(this.start, this.current);
        const lowerText = text.toLowerCase();

        // Check if it's a keyword
        const type = KEYWORDS[lowerText] ?? TokenType.IDENTIFIER;
        this.addToken(type, text);
    }

    /**
     * Check if character is a digit
     * @param {string} char
     * @returns {boolean}
     */
    isDigit(char) {
        return char >= '0' && char <= '9';
    }

    /**
     * Check if character is alphabetic (includes Unicode letters)
     * @param {string} char
     * @returns {boolean}
     */
    isAlpha(char) {
        // ASCII letters and underscore
        if ((char >= 'a' && char <= 'z') ||
            (char >= 'A' && char <= 'Z') ||
            char === '_') {
            return true;
        }
        // Accept Unicode letters and symbols (code point > 127)
        // This allows box-drawing chars, emojis, accented letters, etc.
        if (char && char.charCodeAt(0) > 127) {
            return true;
        }
        return false;
    }

    /**
     * Check if character is alphanumeric
     * @param {string} char
     * @returns {boolean}
     */
    isAlphaNumeric(char) {
        return this.isAlpha(char) || this.isDigit(char);
    }

    /**
     * Throw a parse error
     * @param {string} message - Error message
     */
    error(message) {
        throw new ParseError(message, {
            line: this.line,
            column: this.column
        });
    }
}

export default Lexer;
