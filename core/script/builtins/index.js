/**
 * Builtins Index - Register all built-in functions
 *
 * Aggregates all builtin modules and provides a single
 * registration function for the interpreter.
 */

import { registerMathBuiltins } from './MathBuiltins.js';
import { registerStringBuiltins } from './StringBuiltins.js';
import { registerArrayBuiltins } from './ArrayBuiltins.js';
import { registerObjectBuiltins } from './ObjectBuiltins.js';
import { registerTypeBuiltins } from './TypeBuiltins.js';
import { registerTimeBuiltins } from './TimeBuiltins.js';
import { registerSystemBuiltins } from './SystemBuiltins.js';
import { registerDialogBuiltins } from './DialogBuiltins.js';
import { registerJsonBuiltins } from './JsonBuiltins.js';
import { registerDebugBuiltins } from './DebugBuiltins.js';
import { registerTerminalBuiltins } from './TerminalBuiltins.js';
import { registerMediaBuiltins } from './MediaBuiltins.js';
import { registerMultimediaBuiltins } from './MultimediaBuiltins.js';
import { registerNarrativeBuiltins } from './NarrativeBuiltins.js';
import { registerMessagingBuiltins } from './MessagingBuiltins.js';
import { registerTelemetryBuiltins } from './TelemetryBuiltins.js';

/**
 * Register all built-in functions with an interpreter
 * @param {Interpreter} interpreter - The interpreter instance
 */
export function registerAllBuiltins(interpreter) {
    registerMathBuiltins(interpreter);
    registerStringBuiltins(interpreter);
    registerArrayBuiltins(interpreter);
    registerObjectBuiltins(interpreter);
    registerTypeBuiltins(interpreter);
    registerTimeBuiltins(interpreter);
    registerSystemBuiltins(interpreter);
    registerDialogBuiltins(interpreter);
    registerJsonBuiltins(interpreter);
    registerDebugBuiltins(interpreter);
    registerTerminalBuiltins(interpreter);
    registerMediaBuiltins(interpreter);
    registerMultimediaBuiltins(interpreter);
    registerNarrativeBuiltins(interpreter);
    registerMessagingBuiltins(interpreter);
    registerTelemetryBuiltins(interpreter);
}

export {
    registerMathBuiltins,
    registerStringBuiltins,
    registerArrayBuiltins,
    registerObjectBuiltins,
    registerTypeBuiltins,
    registerTimeBuiltins,
    registerSystemBuiltins,
    registerDialogBuiltins,
    registerJsonBuiltins,
    registerDebugBuiltins,
    registerTerminalBuiltins,
    registerMediaBuiltins,
    registerMultimediaBuiltins,
    registerNarrativeBuiltins,
    registerMessagingBuiltins,
    registerTelemetryBuiltins
};

export default registerAllBuiltins;
