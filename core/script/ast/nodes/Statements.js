/**
 * Statement AST Nodes
 *
 * All statement types for the RetroScript language.
 * Each statement implements the visitor pattern.
 */

import { Statement } from './Node.js';

/**
 * Block statement - contains multiple statements
 */
export class BlockStatement extends Statement {
    constructor(statements, location) {
        super('Block', location);
        this.statements = statements;
    }

    accept(visitor) {
        return visitor.visitBlockStatement(this);
    }
}

/**
 * Set statement - variable assignment
 * set $varName = value
 */
export class SetStatement extends Statement {
    constructor(varName, value, location) {
        super('Set', location);
        this.varName = varName;
        this.value = value;
    }

    accept(visitor) {
        return visitor.visitSetStatement(this);
    }
}

/**
 * Print statement - output to console
 * print message
 */
export class PrintStatement extends Statement {
    constructor(message, location) {
        super('Print', location);
        this.message = message;
    }

    accept(visitor) {
        return visitor.visitPrintStatement(this);
    }
}

/**
 * If statement - conditional execution
 * if condition then { ... } else { ... }
 */
export class IfStatement extends Statement {
    constructor(condition, thenBody, elseBody, location) {
        super('If', location);
        this.condition = condition;
        this.thenBody = thenBody;
        this.elseBody = elseBody || [];
    }

    accept(visitor) {
        return visitor.visitIfStatement(this);
    }
}

/**
 * Match statement - pattern matching
 * match expr { value => { ... }, default => { ... } }
 */
export class MatchStatement extends Statement {
    constructor(expression, cases, defaultBody, location) {
        super('Match', location);
        this.expression = expression;
        this.cases = cases; // Array of { values: [], body: [] }
        this.defaultBody = defaultBody || [];
    }

    accept(visitor) {
        return visitor.visitMatchStatement(this);
    }
}

/**
 * Loop statement - count-based loop
 * loop N { ... }
 */
export class LoopStatement extends Statement {
    constructor(count, body, location) {
        super('Loop', location);
        this.count = count;
        this.body = body;
    }

    accept(visitor) {
        return visitor.visitLoopStatement(this);
    }
}

/**
 * While statement - condition-based loop
 * loop while condition { ... }
 */
export class WhileStatement extends Statement {
    constructor(condition, body, location) {
        super('While', location);
        this.condition = condition;
        this.body = body;
    }

    accept(visitor) {
        return visitor.visitWhileStatement(this);
    }
}

/**
 * ForEach statement - array/object iteration
 * foreach $item in $array { ... }
 * foreach $key, $value in $object { ... }
 */
export class ForEachStatement extends Statement {
    constructor(varName, array, body, location, valueVarName = null) {
        super('ForEach', location);
        this.varName = varName;
        this.valueVarName = valueVarName;
        this.array = array;
        this.body = body;
    }

    accept(visitor) {
        return visitor.visitForEachStatement(this);
    }
}

/**
 * Break statement - exit loop
 */
export class BreakStatement extends Statement {
    constructor(location) {
        super('Break', location);
    }

    accept(visitor) {
        return visitor.visitBreakStatement(this);
    }
}

/**
 * Continue statement - skip to next iteration
 */
export class ContinueStatement extends Statement {
    constructor(location) {
        super('Continue', location);
    }

    accept(visitor) {
        return visitor.visitContinueStatement(this);
    }
}

/**
 * Return statement - return from function
 * return value
 */
export class ReturnStatement extends Statement {
    constructor(value, location) {
        super('Return', location);
        this.value = value;
    }

    accept(visitor) {
        return visitor.visitReturnStatement(this);
    }
}

/**
 * Function definition statement
 * def funcName($param1, $param2) { ... }
 */
export class FunctionDefStatement extends Statement {
    constructor(name, params, body, location) {
        super('FunctionDef', location);
        this.name = name;
        this.params = params;
        this.body = body;
    }

    accept(visitor) {
        return visitor.visitFunctionDefStatement(this);
    }
}

/**
 * Call statement - function call (standalone, not expression)
 * call funcName arg1 arg2
 */
export class CallStatement extends Statement {
    constructor(funcName, args, location) {
        super('Call', location);
        this.funcName = funcName;
        this.args = args;
    }

    accept(visitor) {
        return visitor.visitCallStatement(this);
    }
}

/**
 * Try/Catch statement - error handling
 * try { ... } catch $err { ... }
 */
export class TryCatchStatement extends Statement {
    constructor(tryBody, catchBody, errorVar, location) {
        super('TryCatch', location);
        this.tryBody = tryBody;
        this.catchBody = catchBody;
        this.errorVar = errorVar || 'error';
    }

    accept(visitor) {
        return visitor.visitTryCatchStatement(this);
    }
}

/**
 * Event handler statement
 * on eventName { ... }
 */
export class OnStatement extends Statement {
    constructor(eventName, body, location) {
        super('On', location);
        this.eventName = eventName;
        this.body = body;
    }

    accept(visitor) {
        return visitor.visitOnStatement(this);
    }
}

/**
 * Emit statement - fire event
 * emit eventName key1=val1 key2=val2
 */
export class EmitStatement extends Statement {
    constructor(eventName, payload, location) {
        super('Emit', location);
        this.eventName = eventName;
        this.payload = payload;
    }

    accept(visitor) {
        return visitor.visitEmitStatement(this);
    }
}

/**
 * Launch statement - launch application
 * launch appName with key=value
 */
export class LaunchStatement extends Statement {
    constructor(appId, params, location) {
        super('Launch', location);
        this.appId = appId;
        this.params = params || {};
    }

    accept(visitor) {
        return visitor.visitLaunchStatement(this);
    }
}

/**
 * Close statement - close window
 * close [windowId]
 */
export class CloseStatement extends Statement {
    constructor(target, location) {
        super('Close', location);
        this.target = target;
    }

    accept(visitor) {
        return visitor.visitCloseStatement(this);
    }
}

/**
 * Wait statement - delay execution
 * wait 1000
 */
export class WaitStatement extends Statement {
    constructor(duration, location) {
        super('Wait', location);
        this.duration = duration;
    }

    accept(visitor) {
        return visitor.visitWaitStatement(this);
    }
}

/**
 * Focus statement - focus window
 * focus windowId
 */
export class FocusStatement extends Statement {
    constructor(target, location) {
        super('Focus', location);
        this.target = target;
    }

    accept(visitor) {
        return visitor.visitFocusStatement(this);
    }
}

/**
 * Minimize statement
 * minimize windowId
 */
export class MinimizeStatement extends Statement {
    constructor(target, location) {
        super('Minimize', location);
        this.target = target;
    }

    accept(visitor) {
        return visitor.visitMinimizeStatement(this);
    }
}

/**
 * Maximize statement
 * maximize windowId
 */
export class MaximizeStatement extends Statement {
    constructor(target, location) {
        super('Maximize', location);
        this.target = target;
    }

    accept(visitor) {
        return visitor.visitMaximizeStatement(this);
    }
}

/**
 * Write statement - write to file
 * write "content" to "path"
 */
export class WriteStatement extends Statement {
    constructor(content, path, location) {
        super('Write', location);
        this.content = content;
        this.path = path;
    }

    accept(visitor) {
        return visitor.visitWriteStatement(this);
    }
}

/**
 * Read statement - read from file
 * read "path" into $variable
 */
export class ReadStatement extends Statement {
    constructor(path, varName, location) {
        super('Read', location);
        this.path = path;
        this.varName = varName;
    }

    accept(visitor) {
        return visitor.visitReadStatement(this);
    }
}

/**
 * Mkdir statement - create directory
 * mkdir "path"
 */
export class MkdirStatement extends Statement {
    constructor(path, location) {
        super('Mkdir', location);
        this.path = path;
    }

    accept(visitor) {
        return visitor.visitMkdirStatement(this);
    }
}

/**
 * Delete statement - delete file/directory
 * delete "path"
 */
export class DeleteStatement extends Statement {
    constructor(path, location) {
        super('Delete', location);
        this.path = path;
    }

    accept(visitor) {
        return visitor.visitDeleteStatement(this);
    }
}

/**
 * Alert statement - show alert dialog
 * alert message
 */
export class AlertStatement extends Statement {
    constructor(message, location) {
        super('Alert', location);
        this.message = message;
    }

    accept(visitor) {
        return visitor.visitAlertStatement(this);
    }
}

/**
 * Confirm statement - show confirm dialog
 * confirm "message" into $variable
 */
export class ConfirmStatement extends Statement {
    constructor(message, varName, location) {
        super('Confirm', location);
        this.message = message;
        this.varName = varName || 'confirmed';
    }

    accept(visitor) {
        return visitor.visitConfirmStatement(this);
    }
}

/**
 * Prompt statement - show input dialog
 * prompt "message" default "value" into $variable
 */
export class PromptStatement extends Statement {
    constructor(message, defaultValue, varName, location) {
        super('Prompt', location);
        this.message = message;
        this.defaultValue = defaultValue || '';
        this.varName = varName || 'input';
    }

    accept(visitor) {
        return visitor.visitPromptStatement(this);
    }
}

/**
 * Notify statement - show notification
 * notify message
 */
export class NotifyStatement extends Statement {
    constructor(message, location) {
        super('Notify', location);
        this.message = message;
    }

    accept(visitor) {
        return visitor.visitNotifyStatement(this);
    }
}

/**
 * Play statement - play sound or audio file
 * play soundName
 * play "path/to/file.mp3"
 * play "music.mp3" volume=0.5 loop=true
 */
export class PlayStatement extends Statement {
    constructor(source, options, location) {
        super('Play', location);
        this.source = source;  // Can be identifier (sound type) or expression (path/variable)
        this.options = options || {};  // { volume, loop }
    }

    accept(visitor) {
        return visitor.visitPlayStatement(this);
    }
}

/**
 * Stop statement - stop audio playback
 * stop           - stops all audio
 * stop "file.mp3" - stops specific audio
 */
export class StopStatement extends Statement {
    constructor(source, location) {
        super('Stop', location);
        this.source = source;  // null for stop all, or expression for specific source
    }

    accept(visitor) {
        return visitor.visitStopStatement(this);
    }
}

/**
 * Video statement - play video file
 * video "path/to/file.mp4"
 * video "movie.mp4" volume=0.5 loop=true fullscreen=true
 */
export class VideoStatement extends Statement {
    constructor(source, options, location) {
        super('Video', location);
        this.source = source;  // Expression for video path/variable
        this.options = options || {};  // { volume, loop, fullscreen }
    }

    accept(visitor) {
        return visitor.visitVideoStatement(this);
    }
}

/**
 * Command statement - generic command execution
 */
export class CommandStatement extends Statement {
    constructor(command, args, location) {
        super('Command', location);
        this.command = command;
        this.args = args;
    }

    accept(visitor) {
        return visitor.visitCommandStatement(this);
    }
}

export default {
    BlockStatement,
    SetStatement,
    PrintStatement,
    IfStatement,
    MatchStatement,
    LoopStatement,
    WhileStatement,
    ForEachStatement,
    BreakStatement,
    ContinueStatement,
    ReturnStatement,
    FunctionDefStatement,
    CallStatement,
    TryCatchStatement,
    OnStatement,
    EmitStatement,
    LaunchStatement,
    CloseStatement,
    WaitStatement,
    FocusStatement,
    MinimizeStatement,
    MaximizeStatement,
    WriteStatement,
    ReadStatement,
    MkdirStatement,
    DeleteStatement,
    AlertStatement,
    ConfirmStatement,
    PromptStatement,
    NotifyStatement,
    PlayStatement,
    StopStatement,
    VideoStatement,
    CommandStatement
};
