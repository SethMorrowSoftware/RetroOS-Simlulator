/**
 * JsonBuiltins - JSON serialization functions for RetroScript
 */

export function registerJsonBuiltins(interpreter) {
    // Stringify
    interpreter.registerBuiltin('toJSON', (value) => {
        try {
            return JSON.stringify(value);
        } catch (error) {
            return 'null';
        }
    });

    interpreter.registerBuiltin('prettyJSON', (value, indent = 2) => {
        try {
            return JSON.stringify(value, null, Number(indent));
        } catch (error) {
            return 'null';
        }
    });

    // Parse
    interpreter.registerBuiltin('fromJSON', (str) => {
        try {
            return JSON.parse(String(str));
        } catch (error) {
            return null;
        }
    });

    interpreter.registerBuiltin('parseJSON', (str) => {
        try {
            return JSON.parse(String(str));
        } catch (error) {
            return null;
        }
    });

    // Validation
    interpreter.registerBuiltin('isValidJSON', (str) => {
        try {
            JSON.parse(String(str));
            return true;
        } catch (error) {
            return false;
        }
    });
}

export default registerJsonBuiltins;
