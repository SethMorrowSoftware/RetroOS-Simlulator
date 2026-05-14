/**
 * Parser - Recursive descent parser for RetroScript
 *
 * Converts a stream of tokens into an Abstract Syntax Tree (AST).
 * Uses recursive descent with Pratt parsing for expressions.
 */

import { Token, TokenType } from '../lexer/Token.js';
import { ParseError } from '../errors/ScriptError.js';
import * as AST from '../ast/index.js';

/**
 * Parser class - converts tokens to AST
 */
export class Parser {
    /**
     * @param {Token[]} tokens - Array of tokens from lexer
     */
    constructor(tokens) {
        this.tokens = tokens;
        this.current = 0;
    }

    /**
     * Parse all tokens into a list of statements
     * @returns {AST.Statement[]} Array of statement nodes
     */
    parse() {
        const statements = [];

        while (!this.isAtEnd()) {
            // Skip newlines and semicolons between statements
            while (this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON)) {
                this.advance();
            }

            if (!this.isAtEnd()) {
                try {
                    const stmt = this.parseStatement();
                    if (stmt) {
                        statements.push(stmt);
                    }
                } catch (error) {
                    // Add location info if not present
                    if (!error.line && this.current < this.tokens.length) {
                        error.line = this.peek().line;
                        error.column = this.peek().column;
                    }
                    throw error;
                }
            }
        }

        return statements;
    }

    /**
     * Parse a single statement
     * @returns {AST.Statement} Statement node
     */
    parseStatement() {
        const token = this.peek();
        const location = { line: token.line, column: token.column };

        // Skip structural tokens
        if (this.check(TokenType.LBRACE) || this.check(TokenType.RBRACE)) {
            this.advance();
            return null;
        }

        switch (token.type) {
            case TokenType.SET:
                return this.parseSetStatement();
            case TokenType.PRINT:
            case TokenType.LOG:
                return this.parsePrintStatement();
            case TokenType.IF:
                return this.parseIfStatement();
            case TokenType.LOOP:
            case TokenType.REPEAT:
                return this.parseLoopStatement();
            case TokenType.WHILE:
                return this.parseWhileStatement();
            case TokenType.MATCH:
                return this.parseMatchStatement();
            case TokenType.FOREACH:
            case TokenType.FOR:
                return this.parseForEachStatement();
            case TokenType.BREAK:
                this.advance();
                return new AST.BreakStatement(location);
            case TokenType.CONTINUE:
                this.advance();
                return new AST.ContinueStatement(location);
            case TokenType.RETURN:
                return this.parseReturnStatement();
            case TokenType.DEF:
            case TokenType.FUNC:
            case TokenType.FUNCTION:
                return this.parseFunctionDef();
            case TokenType.CALL:
                return this.parseCallStatement();
            case TokenType.TRY:
                return this.parseTryCatch();
            case TokenType.ON:
                return this.parseOnStatement();
            case TokenType.EMIT:
                return this.parseEmitStatement();
            case TokenType.LAUNCH:
            case TokenType.OPEN:
                return this.parseLaunchStatement();
            case TokenType.CLOSE:
                return this.parseCloseStatement();
            case TokenType.WAIT:
            case TokenType.SLEEP:
                return this.parseWaitStatement();
            case TokenType.FOCUS:
                return this.parseFocusStatement();
            case TokenType.MINIMIZE:
                return this.parseMinimizeStatement();
            case TokenType.MAXIMIZE:
                return this.parseMaximizeStatement();
            case TokenType.WRITE:
                return this.parseWriteStatement();
            case TokenType.READ:
                return this.parseReadStatement();
            case TokenType.MKDIR:
                return this.parseMkdirStatement();
            case TokenType.DELETE:
            case TokenType.RM:
                return this.parseDeleteStatement();
            case TokenType.ALERT:
                return this.parseAlertStatement();
            case TokenType.CONFIRM:
                return this.parseConfirmStatement();
            case TokenType.PROMPT:
                return this.parsePromptStatement();
            case TokenType.NOTIFY:
                return this.parseNotifyStatement();
            case TokenType.PLAY:
                return this.parsePlayStatement();
            case TokenType.STOP:
                return this.parseStopStatement();
            case TokenType.VIDEO:
                return this.parseVideoStatement();
            case TokenType.VARIABLE:
                // Check for assignment: $var = value
                if (this.checkNext(TokenType.ASSIGN)) {
                    return this.parseAssignment();
                }
                // Check for compound assignment: $var += value, $var -= value, etc.
                if (this.checkNext(TokenType.PLUS_ASSIGN) ||
                    this.checkNext(TokenType.MINUS_ASSIGN) ||
                    this.checkNext(TokenType.STAR_ASSIGN) ||
                    this.checkNext(TokenType.SLASH_ASSIGN) ||
                    this.checkNext(TokenType.PERCENT_ASSIGN)) {
                    return this.parseCompoundAssignment();
                }
                // Fall through to treat as expression/command
                break;
            default:
                break;
        }

        // Try to parse as expression statement or command
        return this.parseExpressionOrCommand();
    }

    /**
     * Parse set statement: set $var = value
     */
    parseSetStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'set'

        // Expect variable
        if (!this.check(TokenType.VARIABLE)) {
            throw this.error('Expected variable name after "set"');
        }
        const varName = this.advance().value;

        // Expect '='
        if (!this.match(TokenType.ASSIGN)) {
            throw this.error('Expected "=" after variable name');
        }

        // Parse value expression
        const value = this.parseExpression();

        return new AST.SetStatement(varName, value, location);
    }

    /**
     * Parse print statement: print message
     * Supports both:
     *   - print "quoted string" + expression (expression mode)
     *   - print unquoted text with $variables (legacy/text mode)
     */
    parsePrintStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'print'

        // Use a conservative heuristic for expression vs unquoted text mode:
        // - Expression mode: Only when starting with STRING (quoted text)
        //   This ensures "Hello" + $name works as expression concatenation
        // - Unquoted text mode: Everything else (including numbers, identifiers)
        //   This provides maximum backwards compatibility with legacy scripts
        //   that use unquoted text like "print 5 == 5: true" or "print Hello World!"
        //
        // Note: Variables like $x are handled in unquoted mode with interpolation

        const nextToken = this.peek();

        // Only use expression mode for quoted strings
        // This allows: print "Hello" + $name
        // All other cases use unquoted text mode with $variable interpolation
        if (nextToken.type === TokenType.STRING) {
            // Standard expression mode starting with quoted string
            const message = this.parseExpression();
            return new AST.PrintStatement(message, location);
        } else {
            // Unquoted text mode - collect remaining line as raw text with interpolation
            const message = this.parseUnquotedText();
            return new AST.PrintStatement(message, location);
        }
    }

    /**
     * Parse unquoted text with $variable interpolation (legacy mode)
     * Collects all tokens until end of statement and creates an InterpolatedStringExpression
     * Example: print Hello $name! Welcome to $place
     * @returns {AST.InterpolatedStringExpression}
     */
    parseUnquotedText() {
        const location = this.getLocation();
        const parts = [];
        let currentText = '';
        let lastWasVariable = false;

        // Punctuation tokens that should NOT have a space before them
        const noSpaceBeforeTokens = new Set([
            TokenType.NOT,        // !
            TokenType.COLON,      // :
            TokenType.DOT,        // .
            TokenType.COMMA,      // ,
            TokenType.SEMICOLON,  // ;
            TokenType.RPAREN,     // )
            TokenType.RBRACKET,   // ]
            TokenType.RBRACE      // }
        ]);

        // Track nesting depth so matched delimiters in text (e.g. typeof({a:1}))
        // don't prematurely end parsing. An unmatched } at depth 0 IS the block end.
        let braceDepth = 0;
        let parenDepth = 0;
        let bracketDepth = 0;

        // Collect tokens until end of line (or unmatched closing delimiter)
        while (!this.isAtEnd() && !this.check(TokenType.NEWLINE) && !this.check(TokenType.SEMICOLON)) {
            const token = this.peek();

            // Track nesting and stop at unmatched closing braces
            if (token.type === TokenType.LBRACE) braceDepth++;
            else if (token.type === TokenType.RBRACE) {
                if (braceDepth === 0) break; // unmatched } = end of containing block
                braceDepth--;
            }
            else if (token.type === TokenType.LPAREN) parenDepth++;
            else if (token.type === TokenType.RPAREN) {
                if (parenDepth === 0) break;
                parenDepth--;
            }
            else if (token.type === TokenType.LBRACKET) bracketDepth++;
            else if (token.type === TokenType.RBRACKET) {
                if (bracketDepth === 0) break;
                bracketDepth--;
            }

            if (token.type === TokenType.VARIABLE) {
                // Save accumulated text as a literal (with trailing space for separation)
                if (currentText.length > 0) {
                    parts.push(new AST.LiteralExpression(currentText, location));
                    currentText = '';
                }

                // Add variable expression
                this.advance();
                parts.push(new AST.VariableExpression(token.value, location));
                lastWasVariable = true;
            } else {
                // Check if this token should NOT have a space before it
                const shouldAddSpace = !noSpaceBeforeTokens.has(token.type);

                // Accumulate text from token
                // Add space before this token if:
                // 1. We already have text accumulated AND this isn't punctuation, OR
                // 2. We just processed a variable AND this isn't punctuation
                if (shouldAddSpace) {
                    if (currentText.length > 0) {
                        currentText += ' ';
                    } else if (lastWasVariable) {
                        currentText = ' ';
                    }
                }

                // Use raw (original text) for accurate representation
                const text = token.raw || token.value || '';
                currentText += text;
                this.advance();
                lastWasVariable = false;
            }
        }

        // Add any remaining text
        if (currentText.length > 0) {
            parts.push(new AST.LiteralExpression(currentText, location));
        }

        // If no parts, return empty string
        if (parts.length === 0) {
            return new AST.LiteralExpression('', location);
        }

        // If only one part and it's a literal, return it directly
        if (parts.length === 1 && parts[0].nodeType === 'Literal') {
            return parts[0];
        }

        // Otherwise return interpolated string
        return new AST.InterpolatedStringExpression(parts, location);
    }

    /**
     * Parse if statement: if condition then { ... } else { ... }
     */
    parseIfStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'if'

        // Parse condition
        const condition = this.parseCondition();

        // Optional 'then' keyword
        this.match(TokenType.THEN);

        // Parse then body
        const thenBody = this.parseBlock();

        // Optional else / else if
        let elseBody = [];
        if (this.match(TokenType.ELSE)) {
            // Check for 'else if' chaining
            if (this.check(TokenType.IF)) {
                // Parse the nested if as a single statement in the else body
                const elseIfStmt = this.parseIfStatement();
                elseBody = [elseIfStmt];
            } else {
                elseBody = this.parseBlock();
            }
        }

        return new AST.IfStatement(condition, thenBody, elseBody, location);
    }

    /**
     * Parse match statement: match expr { value => { ... }, default => { ... } }
     */
    parseMatchStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'match'

        // Parse the expression to match against
        const expression = this.parseExpression();

        // Expect opening brace
        if (!this.match(TokenType.LBRACE)) {
            throw this.error('Expected "{" after match expression');
        }

        // Skip newlines
        while (this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON)) {
            this.advance();
        }

        const cases = [];
        let defaultBody = [];

        // Parse cases until closing brace
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            // Check for default case
            if (this.check(TokenType.DEFAULT)) {
                this.advance(); // consume 'default'
                if (!this.match(TokenType.ARROW)) {
                    throw this.error('Expected "=>" after default');
                }
                defaultBody = this.parseBlock();
            } else {
                // Parse one or more case values separated by commas
                const values = [];
                values.push(this.parseExpression());
                while (this.match(TokenType.COMMA)) {
                    values.push(this.parseExpression());
                }

                if (!this.match(TokenType.ARROW)) {
                    throw this.error('Expected "=>" after match case value');
                }

                const body = this.parseBlock();
                cases.push({ values, body });
            }

            // Skip newlines between cases
            while (this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON)) {
                this.advance();
            }
        }

        // Expect closing brace
        if (!this.match(TokenType.RBRACE)) {
            throw this.error('Expected "}" to close match statement');
        }

        return new AST.MatchStatement(expression, cases, defaultBody, location);
    }

    /**
     * Parse loop statement: loop N { ... }
     */
    parseLoopStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'loop'

        // Check for 'while' keyword - "loop while" is equivalent to "while"
        if (this.check(TokenType.WHILE)) {
            return this.parseWhileStatement(location);
        }

        // Parse count
        const count = this.parseExpression();

        // Parse body
        const body = this.parseBlock();

        return new AST.LoopStatement(count, body, location);
    }

    /**
     * Parse while statement: while condition { ... } or loop while condition { ... }
     * @param {Object} [inheritedLocation] - Location from parseLoopStatement for "loop while" syntax
     */
    parseWhileStatement(inheritedLocation = null) {
        // Use inherited location from "loop while" or get current location for standalone "while"
        const location = inheritedLocation || this.getLocation();

        // consume 'while' if present
        if (this.check(TokenType.WHILE)) {
            this.advance();
        }

        // Parse condition
        const condition = this.parseCondition();

        // Parse body
        const body = this.parseBlock();

        return new AST.WhileStatement(condition, body, location);
    }

    /**
     * Parse foreach statement: foreach $item in $array { ... }
     */
    parseForEachStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'foreach' or 'for'

        // Expect variable
        if (!this.check(TokenType.VARIABLE)) {
            throw this.error('Expected variable name after "foreach"');
        }
        const varName = this.advance().value;

        // Check for optional second variable: foreach $key, $value in $obj
        let valueVarName = null;
        if (this.match(TokenType.COMMA)) {
            if (!this.check(TokenType.VARIABLE)) {
                throw this.error('Expected variable name after "," in foreach');
            }
            valueVarName = this.advance().value;
        }

        // Expect 'in'
        if (!this.match(TokenType.IN)) {
            throw this.error('Expected "in" after variable in foreach');
        }

        // Parse array/object expression
        const array = this.parseExpression();

        // Parse body
        const body = this.parseBlock();

        return new AST.ForEachStatement(varName, array, body, location, valueVarName);
    }

    /**
     * Parse return statement: return value
     */
    parseReturnStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'return'

        let value = null;
        if (!this.isStatementEnd()) {
            value = this.parseExpression();
        }

        return new AST.ReturnStatement(value, location);
    }

    /**
     * Parse function definition: def funcName($param1, $param2) { ... }
     */
    parseFunctionDef() {
        const location = this.getLocation();
        this.advance(); // consume 'def'

        // Expect function name
        if (!this.check(TokenType.IDENTIFIER)) {
            throw this.error('Expected function name after "def"');
        }
        const name = this.advance().value;

        // Parse parameters
        const params = [];
        if (this.match(TokenType.LPAREN)) {
            if (!this.check(TokenType.RPAREN)) {
                do {
                    if (this.check(TokenType.VARIABLE)) {
                        params.push(this.advance().value);
                    }
                } while (this.match(TokenType.COMMA));
            }
            this.expect(TokenType.RPAREN, 'Expected ")" after parameters');
        }

        // Parse body
        const body = this.parseBlock();

        return new AST.FunctionDefStatement(name, params, body, location);
    }

    /**
     * Parse call statement: call funcName arg1 arg2
     */
    parseCallStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'call'

        // Expect function name (can be identifier or keyword like toJSON, fromJSON)
        const token = this.peek();
        if (token.type !== TokenType.IDENTIFIER && !token.isKeyword()) {
            throw this.error('Expected function name after "call"');
        }
        const funcName = this.advance().value;

        // Parse arguments
        const args = [];
        while (!this.isStatementEnd()) {
            args.push(this.parseExpression());
        }

        return new AST.CallStatement(funcName, args, location);
    }

    /**
     * Parse try/catch: try { ... } catch $err { ... }
     */
    parseTryCatch() {
        const location = this.getLocation();
        this.advance(); // consume 'try'

        // Parse try body
        const tryBody = this.parseBlock();

        // Expect 'catch'
        if (!this.match(TokenType.CATCH)) {
            throw this.error('Expected "catch" after try block');
        }

        // Optional error variable
        let errorVar = 'error';
        if (this.check(TokenType.VARIABLE)) {
            errorVar = this.advance().value;
        }

        // Parse catch body
        const catchBody = this.parseBlock();

        return new AST.TryCatchStatement(tryBody, catchBody, errorVar, location);
    }

    /**
     * Parse on statement: on eventName { ... }
     */
    parseOnStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'on'

        // Parse event name (may include colons like "app:launch")
        const eventName = this.parseEventName();

        // Parse body
        const body = this.parseBlock();

        return new AST.OnStatement(eventName, body, location);
    }

    /**
     * Check if token is a valid event name part (identifier or keyword)
     * @returns {boolean}
     */
    isEventNamePart() {
        const t = this.peek();
        return t && (t.type === TokenType.IDENTIFIER || t.isKeyword());
    }

    /**
     * Consume an event name segment which may contain hyphens
     * e.g., "bg-change", "settings-change", "file-open"
     * @returns {string} The segment including any hyphenated parts
     */
    consumeEventSegment() {
        let segment = this.advance().value;
        // Consume hyphen-joined parts: bg-change, settings-change, etc.
        while (this.check(TokenType.MINUS) && this.current + 1 < this.tokens.length) {
            const afterMinus = this.tokens[this.current + 1];
            if (afterMinus && (afterMinus.type === TokenType.IDENTIFIER || afterMinus.isKeyword())) {
                this.advance(); // consume '-'
                segment += '-' + this.advance().value;
            } else {
                break;
            }
        }
        return segment;
    }

    /**
     * Parse event name which may be namespaced like "app:launch"
     * Supports identifiers, keywords, and hyphenated segments as name parts
     * (e.g., "sound:play", "dialog:alert", "desktop:bg-change", "file:read")
     * @returns {string} Event name
     */
    parseEventName() {
        if (!this.isEventNamePart()) {
            throw this.error('Expected event name');
        }
        let eventName = this.consumeEventSegment();

        // Collect any additional namespaced parts (colon followed by name segment)
        while (this.check(TokenType.COLON)) {
            this.advance(); // consume ':'
            if (this.isEventNamePart()) {
                eventName += ':' + this.consumeEventSegment();
            } else {
                // Trailing colon - just include it
                eventName += ':';
                break;
            }
        }

        return eventName;
    }

    /**
     * Parse emit statement: emit eventName key=value
     */
    parseEmitStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'emit'

        // Parse event name (may include colons like "app:launch")
        const eventName = this.parseEventName();

        // Parse payload key=value pairs (keys can be identifiers or keywords like "repeat")
        const payload = {};
        while (!this.isStatementEnd()) {
            const keyToken = this.peek();
            if (keyToken.type === TokenType.IDENTIFIER || keyToken.isKeyword()) {
                const key = this.advance().value;
                if (this.match(TokenType.ASSIGN)) {
                    payload[key] = this.parseExpression();
                }
            } else {
                break;
            }
        }

        return new AST.EmitStatement(eventName, payload, location);
    }

    /**
     * Parse launch statement: launch appId with key=value
     */
    parseLaunchStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'launch'

        // Expect app ID
        if (!this.check(TokenType.IDENTIFIER)) {
            throw this.error('Expected app ID after "launch"');
        }
        const appId = this.advance().value;

        // Parse optional 'with' params
        const params = {};
        if (this.match(TokenType.WITH)) {
            while (!this.isStatementEnd()) {
                if (this.check(TokenType.IDENTIFIER)) {
                    const key = this.advance().value;
                    if (this.match(TokenType.ASSIGN)) {
                        params[key] = this.parseExpression();
                    }
                } else {
                    break;
                }
            }
        }

        return new AST.LaunchStatement(appId, params, location);
    }

    /**
     * Parse close statement: close [target]
     */
    parseCloseStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'close'

        let target = null;
        if (!this.isStatementEnd()) {
            target = this.parseExpression();
        }

        return new AST.CloseStatement(target, location);
    }

    /**
     * Parse wait statement: wait duration
     */
    parseWaitStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'wait'

        const duration = this.parseExpression();
        return new AST.WaitStatement(duration, location);
    }

    /**
     * Parse focus statement: focus target
     */
    parseFocusStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'focus'

        const target = this.parseExpression();
        return new AST.FocusStatement(target, location);
    }

    /**
     * Parse minimize statement: minimize target
     */
    parseMinimizeStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'minimize'

        const target = this.parseExpression();
        return new AST.MinimizeStatement(target, location);
    }

    /**
     * Parse maximize statement: maximize target
     */
    parseMaximizeStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'maximize'

        const target = this.parseExpression();
        return new AST.MaximizeStatement(target, location);
    }

    /**
     * Parse write statement: write content to path
     */
    parseWriteStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'write'

        const content = this.parseExpression();

        if (!this.match(TokenType.TO)) {
            throw this.error('Expected "to" after content in write statement');
        }

        const path = this.parseExpression();

        return new AST.WriteStatement(content, path, location);
    }

    /**
     * Parse read statement: read path into $var
     */
    parseReadStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'read'

        const path = this.parseExpression();

        let varName = 'result';
        if (this.match(TokenType.INTO)) {
            if (!this.check(TokenType.VARIABLE)) {
                throw this.error('Expected variable after "into"');
            }
            varName = this.advance().value;
        }

        return new AST.ReadStatement(path, varName, location);
    }

    /**
     * Parse mkdir statement: mkdir path
     */
    parseMkdirStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'mkdir'

        const path = this.parseExpression();
        return new AST.MkdirStatement(path, location);
    }

    /**
     * Parse delete statement: delete path
     */
    parseDeleteStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'delete'

        const path = this.parseExpression();
        return new AST.DeleteStatement(path, location);
    }

    /**
     * Parse alert statement: alert message
     */
    parseAlertStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'alert'

        // Support both quoted and unquoted messages (like print)
        const nextToken = this.peek();
        let message;
        if (nextToken.type === TokenType.STRING) {
            message = this.parseExpression();
        } else {
            message = this.parseUnquotedText();
        }
        return new AST.AlertStatement(message, location);
    }

    /**
     * Parse confirm statement: confirm message into $var
     */
    parseConfirmStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'confirm'

        const message = this.parseExpression();

        let varName = 'confirmed';
        if (this.match(TokenType.INTO)) {
            if (!this.check(TokenType.VARIABLE)) {
                throw this.error('Expected variable after "into"');
            }
            varName = this.advance().value;
        }

        return new AST.ConfirmStatement(message, varName, location);
    }

    /**
     * Parse prompt statement: prompt message default value into $var
     */
    parsePromptStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'prompt'

        const message = this.parseExpression();

        let defaultValue = null;
        if (this.match(TokenType.DEFAULT)) {
            defaultValue = this.parseExpression();
        }

        let varName = 'input';
        if (this.match(TokenType.INTO)) {
            if (!this.check(TokenType.VARIABLE)) {
                throw this.error('Expected variable after "into"');
            }
            varName = this.advance().value;
        }

        return new AST.PromptStatement(message, defaultValue, varName, location);
    }

    /**
     * Parse notify statement: notify message
     */
    parseNotifyStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'notify'

        // Support both quoted and unquoted messages (like print)
        const nextToken = this.peek();
        let message;
        if (nextToken.type === TokenType.STRING) {
            message = this.parseExpression();
        } else {
            message = this.parseUnquotedText();
        }
        return new AST.NotifyStatement(message, location);
    }

    /**
     * Parse play statement: play sound/file with optional options
     * Syntax:
     *   play click                           - play predefined sound type
     *   play "assets/sounds/music.mp3"       - play MP3 file
     *   play $soundVar                       - play from variable
     *   play "music.mp3" volume=0.5 loop=true - with options
     */
    parsePlayStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'play'

        // Parse source - can be identifier/keyword (sound type), string (path), or variable
        let source;
        const token = this.peek();
        if (token.type === TokenType.IDENTIFIER || token.isKeyword()) {
            // Sound type like: play click, play notify (notify is a keyword but valid sound name)
            source = new AST.LiteralExpression(this.advance().value, location);
        } else if (token.type === TokenType.STRING) {
            // File path like: play "assets/sounds/music.mp3"
            source = new AST.LiteralExpression(this.advance().value, location);
        } else if (token.type === TokenType.VARIABLE) {
            // Variable like: play $soundFile
            source = new AST.VariableExpression(this.advance().value, location);
        } else {
            throw this.error('Expected sound name, file path, or variable after "play"');
        }

        // Parse optional key=value options (volume, loop)
        const options = {};
        while (!this.isStatementEnd()) {
            if (this.check(TokenType.IDENTIFIER)) {
                const key = this.advance().value;
                if (this.match(TokenType.ASSIGN)) {
                    options[key] = this.parseExpression();
                }
            } else {
                break;
            }
        }

        return new AST.PlayStatement(source, options, location);
    }

    /**
     * Parse stop statement: stop audio playback
     * Syntax:
     *   stop                    - stop all audio
     *   stop "music.mp3"        - stop specific audio
     *   stop $audioVar          - stop audio from variable
     */
    parseStopStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'stop'

        // Optional source - if omitted, stops all audio
        let source = null;
        if (!this.isStatementEnd()) {
            if (this.check(TokenType.STRING)) {
                source = new AST.LiteralExpression(this.advance().value, location);
            } else if (this.check(TokenType.VARIABLE)) {
                source = new AST.VariableExpression(this.advance().value, location);
            } else if (this.check(TokenType.IDENTIFIER)) {
                // Allow identifier like: stop music
                source = new AST.LiteralExpression(this.advance().value, location);
            }
        }

        return new AST.StopStatement(source, location);
    }

    /**
     * Parse video statement: play video file
     * Syntax:
     *   video "assets/videos/movie.mp4"       - play video file
     *   video $videoPath                      - play from variable
     *   video "movie.mp4" volume=0.5 loop=true fullscreen=true - with options
     */
    parseVideoStatement() {
        const location = this.getLocation();
        this.advance(); // consume 'video'

        // Parse source - can be string (path) or variable
        let source;
        if (this.check(TokenType.STRING)) {
            source = new AST.LiteralExpression(this.advance().value, location);
        } else if (this.check(TokenType.VARIABLE)) {
            source = new AST.VariableExpression(this.advance().value, location);
        } else {
            throw this.error('Expected video file path or variable after "video"');
        }

        // Parse optional key=value options (volume, loop, fullscreen)
        const options = {};
        while (!this.isStatementEnd()) {
            if (this.check(TokenType.IDENTIFIER)) {
                const key = this.advance().value;
                if (this.match(TokenType.ASSIGN)) {
                    options[key] = this.parseExpression();
                }
            } else {
                break;
            }
        }

        return new AST.VideoStatement(source, options, location);
    }

    /**
     * Parse assignment: $var = value
     */
    parseAssignment() {
        const location = this.getLocation();
        const varName = this.advance().value; // consume variable
        this.advance(); // consume '='

        const value = this.parseExpression();
        return new AST.SetStatement(varName, value, location);
    }

    /**
     * Parse compound assignment: $var += expr, $var -= expr, etc.
     * Desugars to: set $var = $var op expr
     */
    parseCompoundAssignment() {
        const location = this.getLocation();
        const varName = this.advance().value; // consume variable
        const opToken = this.advance(); // consume compound operator

        // Map compound operator token to binary operator
        const operatorMap = {
            [TokenType.PLUS_ASSIGN]: '+',
            [TokenType.MINUS_ASSIGN]: '-',
            [TokenType.STAR_ASSIGN]: '*',
            [TokenType.SLASH_ASSIGN]: '/',
            [TokenType.PERCENT_ASSIGN]: '%'
        };
        const operator = operatorMap[opToken.type];

        const rightExpr = this.parseExpression();

        // Desugar: $var += expr => set $var = $var + expr
        const varExpr = new AST.VariableExpression(varName, location);
        const binaryExpr = new AST.BinaryExpression(operator, varExpr, rightExpr, location);

        return new AST.SetStatement(varName, binaryExpr, location);
    }

    /**
     * Parse expression or command statement
     */
    parseExpressionOrCommand() {
        const location = this.getLocation();

        // Try to parse as identifier (could be command)
        if (this.check(TokenType.IDENTIFIER)) {
            const command = this.advance().value;
            const args = [];

            // Collect remaining tokens on this line as arguments
            while (!this.isStatementEnd()) {
                args.push(this.parseExpression());
            }

            return new AST.CommandStatement(command, args, location);
        }

        // Otherwise parse as expression
        const expr = this.parseExpression();
        return new AST.CommandStatement(null, [expr], location);
    }

    /**
     * Parse a block of statements: { ... }
     */
    parseBlock() {
        const statements = [];

        // Expect opening brace
        if (!this.match(TokenType.LBRACE)) {
            throw this.error('Expected "{" to start block');
        }

        // Skip newlines and semicolons
        while (this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON)) {
            this.advance();
        }

        // Parse statements until closing brace
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            const stmt = this.parseStatement();
            if (stmt) {
                statements.push(stmt);
            }

            // Skip newlines and semicolons (statement separators)
            while (this.check(TokenType.NEWLINE) || this.check(TokenType.SEMICOLON)) {
                this.advance();
            }
        }

        // Expect closing brace
        if (!this.match(TokenType.RBRACE)) {
            throw this.error('Expected "}" to close block');
        }

        return statements;
    }

    /**
     * Parse a condition expression
     */
    parseCondition() {
        return this.parseExpression();
    }

    /**
     * Parse an expression using Pratt parsing
     */
    parseExpression() {
        return this.parseBinaryExpression(0);
    }

    /**
     * Parse binary expression with precedence
     */
    parseBinaryExpression(minPrecedence) {
        let left = this.parseUnaryExpression();

        while (true) {
            const operator = this.getBinaryOperator();
            if (!operator) break;

            const precedence = AST.getOperatorPrecedence(operator);
            if (precedence < minPrecedence) break;

            this.advance(); // consume operator

            const right = this.parseBinaryExpression(precedence + 1);
            const location = left.getLocation();

            left = new AST.BinaryExpression(operator, left, right, location);
        }

        return left;
    }

    /**
     * Get binary operator from current token
     */
    getBinaryOperator() {
        const token = this.peek();
        switch (token.type) {
            case TokenType.PLUS: return '+';
            case TokenType.MINUS: return '-';
            case TokenType.STAR: return '*';
            case TokenType.SLASH: return '/';
            case TokenType.PERCENT: return '%';
            case TokenType.EQ: return '==';
            case TokenType.NEQ: return '!=';
            case TokenType.LT: return '<';
            case TokenType.GT: return '>';
            case TokenType.LTE: return '<=';
            case TokenType.GTE: return '>=';
            case TokenType.AND: return '&&';
            case TokenType.OR: return '||';
            default: return null;
        }
    }

    /**
     * Parse unary expression
     */
    parseUnaryExpression() {
        const location = this.getLocation();

        // Unary minus
        if (this.match(TokenType.MINUS)) {
            const operand = this.parseUnaryExpression();
            return new AST.UnaryExpression('-', operand, location);
        }

        // Logical not
        if (this.match(TokenType.NOT)) {
            const operand = this.parseUnaryExpression();
            return new AST.UnaryExpression('!', operand, location);
        }

        return this.parseCallExpression();
    }

    /**
     * Parse call expression
     */
    parseCallExpression() {
        const location = this.getLocation();

        // Check for 'call' keyword
        if (this.match(TokenType.CALL)) {
            // Function name can be identifier or keyword (like toJSON, fromJSON)
            const token = this.peek();
            if (token.type !== TokenType.IDENTIFIER && !token.isKeyword()) {
                throw this.error('Expected function name after "call"');
            }
            const funcName = this.advance().value;

            // Parse arguments until end of call context.
            // Use parseExpression() for each arg so unary operators (-5, !val) work.
            // parseExpression() naturally stops at non-operator tokens (e.g. the next arg),
            // so `call add 3 4` correctly parses as add(3, 4), not add(3+4).
            const args = [];
            while (!this.isCallArgEnd()) {
                args.push(this.parseExpression());
            }

            return new AST.CallExpression(funcName, args, location);
        }

        return this.parsePrimaryExpression();
    }

    /**
     * Check if at end of call arguments.
     * Similar to isStatementEnd but also stops at RPAREN (for grouped expressions).
     */
    isCallArgEnd() {
        return this.isStatementEnd() ||
               this.check(TokenType.RPAREN);
    }

    /**
     * Parse primary expression (literals, variables, grouping)
     */
    parsePrimaryExpression() {
        const location = this.getLocation();

        // Literals
        if (this.match(TokenType.NUMBER)) {
            return new AST.LiteralExpression(this.previous().value, location);
        }

        if (this.match(TokenType.STRING)) {
            return new AST.LiteralExpression(this.previous().value, location);
        }

        if (this.match(TokenType.TRUE)) {
            return new AST.LiteralExpression(true, location);
        }

        if (this.match(TokenType.FALSE)) {
            return new AST.LiteralExpression(false, location);
        }

        if (this.match(TokenType.NULL)) {
            return new AST.LiteralExpression(null, location);
        }

        // Variable
        if (this.match(TokenType.VARIABLE)) {
            return new AST.VariableExpression(this.previous().value, location);
        }

        // Array literal
        if (this.match(TokenType.LBRACKET)) {
            return this.parseArrayLiteral(location);
        }

        // Object literal - but only if it looks like an object (has :)
        if (this.check(TokenType.LBRACE)) {
            return this.parseObjectLiteral(location);
        }

        // Grouping
        if (this.match(TokenType.LPAREN)) {
            const expr = this.parseExpression();
            this.expect(TokenType.RPAREN, 'Expected ")" after expression');
            return new AST.GroupingExpression(expr, location);
        }

        // Identifier (could be used as literal value)
        if (this.match(TokenType.IDENTIFIER)) {
            return new AST.LiteralExpression(this.previous().value, location);
        }

        throw this.error(`Unexpected token: ${this.peek().type}`);
    }

    /**
     * Parse array literal: [1, 2, 3]
     */
    parseArrayLiteral(location) {
        const elements = [];

        if (!this.check(TokenType.RBRACKET)) {
            do {
                // Skip newlines
                while (this.check(TokenType.NEWLINE)) {
                    this.advance();
                }

                if (!this.check(TokenType.RBRACKET)) {
                    elements.push(this.parseExpression());
                }

                // Skip newlines
                while (this.check(TokenType.NEWLINE)) {
                    this.advance();
                }
            } while (this.match(TokenType.COMMA));
        }

        this.expect(TokenType.RBRACKET, 'Expected "]" after array elements');
        return new AST.ArrayExpression(elements, location);
    }

    /**
     * Parse object literal: {key: value}
     */
    parseObjectLiteral(location) {
        this.advance(); // consume '{'
        const properties = [];

        // Skip newlines
        while (this.check(TokenType.NEWLINE)) {
            this.advance();
        }

        if (!this.check(TokenType.RBRACE)) {
            do {
                // Skip newlines
                while (this.check(TokenType.NEWLINE)) {
                    this.advance();
                }

                if (!this.check(TokenType.RBRACE)) {
                    // Key can be identifier or string
                    let key;
                    if (this.check(TokenType.IDENTIFIER)) {
                        key = this.advance().value;
                    } else if (this.check(TokenType.STRING)) {
                        key = this.advance().value;
                    } else {
                        throw this.error('Expected property name');
                    }

                    // Expect colon
                    this.expect(TokenType.COLON, 'Expected ":" after property name');

                    // Parse value
                    const value = this.parseExpression();
                    properties.push({ key, value });
                }

                // Skip newlines
                while (this.check(TokenType.NEWLINE)) {
                    this.advance();
                }
            } while (this.match(TokenType.COMMA));
        }

        this.expect(TokenType.RBRACE, 'Expected "}" after object properties');
        return new AST.ObjectExpression(properties, location);
    }

    // ==================== UTILITY METHODS ====================

    /**
     * Check if at end of statement
     */
    isStatementEnd() {
        return this.isAtEnd() ||
               this.check(TokenType.NEWLINE) ||
               this.check(TokenType.SEMICOLON) ||
               this.check(TokenType.RBRACE);
    }

    /**
     * Check if at end of expression (more permissive)
     */
    isExpressionEnd() {
        return this.isStatementEnd() ||
               this.getBinaryOperator() !== null;
    }

    /**
     * Check if at end of token stream
     */
    isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }

    /**
     * Get current token
     */
    peek() {
        return this.tokens[this.current];
    }

    /**
     * Get previous token
     */
    previous() {
        return this.tokens[this.current - 1];
    }

    /**
     * Check if current token matches type
     */
    check(type) {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }

    /**
     * Check if next token matches any of the given types
     */
    checkNext(...types) {
        if (this.current + 1 >= this.tokens.length) return false;
        const nextType = this.tokens[this.current + 1].type;
        return types.includes(nextType);
    }

    /**
     * Advance to next token
     */
    advance() {
        if (!this.isAtEnd()) {
            this.current++;
        }
        return this.previous();
    }

    /**
     * Match and consume token if it matches
     */
    match(...types) {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }

    /**
     * Expect a specific token type
     */
    expect(type, message) {
        if (this.check(type)) {
            return this.advance();
        }
        throw this.error(message);
    }

    /**
     * Get current location
     */
    getLocation() {
        const token = this.peek();
        return { line: token.line, column: token.column };
    }

    /**
     * Create parse error
     */
    error(message) {
        const token = this.peek();
        return new ParseError(message, {
            line: token.line,
            column: token.column
        });
    }
}

export default Parser;
