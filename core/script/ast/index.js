/**
 * AST Module - Abstract Syntax Tree nodes for RetroScript
 *
 * Exports all AST node types for use by parser and interpreter.
 */

// Base node classes
export { Node, Statement, Expression } from './nodes/Node.js';

// Statement nodes
export {
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
} from './nodes/Statements.js';

// Expression nodes
export {
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
} from './nodes/Expressions.js';
