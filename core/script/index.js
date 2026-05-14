/**
 * Script Module Index
 *
 * Main entry point for the modular RetroScript engine.
 * Re-exports all public APIs for convenient importing.
 */

// Main ScriptEngine API
export { default as ScriptEngine, ScriptEngineClass } from './ScriptEngine.js';

// Autoexec functionality
export { runAutoexec, findAutoexec, createSampleAutoexec } from './AutoexecLoader.js';

// Lexer (for syntax highlighting, etc.)
export { Lexer } from './lexer/Lexer.js';
export { Token, TokenType, KEYWORDS } from './lexer/Token.js';

// Parser (for AST generation)
export { Parser } from './parser/Parser.js';

// AST nodes
export * from './ast/index.js';

// Interpreter
export { Interpreter } from './interpreter/Interpreter.js';
export { Environment } from './interpreter/Environment.js';

// Errors
export {
    ScriptError,
    ParseError,
    RuntimeError,
    TimeoutError,
    RecursionError,
    ScriptTypeError,
    ScriptReferenceError
} from './errors/ScriptError.js';

// Utilities
export { SafetyLimits, DEFAULT_LIMITS } from './utils/SafetyLimits.js';

// Builtins (for extending)
export { registerAllBuiltins } from './builtins/index.js';
