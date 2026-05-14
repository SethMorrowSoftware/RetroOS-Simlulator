/**
 * MathBuiltins - Mathematical functions for RetroScript
 */

export function registerMathBuiltins(interpreter) {
    // Basic math
    interpreter.registerBuiltin('abs', (x) => Math.abs(Number(x)));
    interpreter.registerBuiltin('round', (x) => Math.round(Number(x)));
    interpreter.registerBuiltin('floor', (x) => Math.floor(Number(x)));
    interpreter.registerBuiltin('ceil', (x) => Math.ceil(Number(x)));
    interpreter.registerBuiltin('sqrt', (x) => Math.sqrt(Number(x)));
    interpreter.registerBuiltin('pow', (x, y) => Math.pow(Number(x), Number(y)));
    interpreter.registerBuiltin('mod', (x, y) => Number(x) % Number(y));
    interpreter.registerBuiltin('sign', (x) => Math.sign(Number(x)));

    // Min/Max/Clamp
    interpreter.registerBuiltin('min', (...args) => {
        const nums = args.flat().map(Number);
        return Math.min(...nums);
    });
    interpreter.registerBuiltin('max', (...args) => {
        const nums = args.flat().map(Number);
        return Math.max(...nums);
    });
    interpreter.registerBuiltin('clamp', (value, min, max) => {
        return Math.min(Math.max(Number(value), Number(min)), Number(max));
    });

    // Random
    interpreter.registerBuiltin('random', (min = 0, max = 1) => {
        const minVal = Math.floor(Number(min));
        const maxVal = Math.floor(Number(max));
        return Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal;
    });

    // Trigonometry
    interpreter.registerBuiltin('sin', (x) => Math.sin(Number(x)));
    interpreter.registerBuiltin('cos', (x) => Math.cos(Number(x)));
    interpreter.registerBuiltin('tan', (x) => Math.tan(Number(x)));
    interpreter.registerBuiltin('asin', (x) => Math.asin(Number(x)));
    interpreter.registerBuiltin('acos', (x) => Math.acos(Number(x)));
    interpreter.registerBuiltin('atan', (x) => Math.atan(Number(x)));
    interpreter.registerBuiltin('atan2', (y, x) => Math.atan2(Number(y), Number(x)));

    // Exponential/Logarithmic
    interpreter.registerBuiltin('exp', (x) => Math.exp(Number(x)));
    interpreter.registerBuiltin('log', (x) => Math.log(Number(x)));
    interpreter.registerBuiltin('log10', (x) => Math.log10(Number(x)));
    interpreter.registerBuiltin('log2', (x) => Math.log2(Number(x)));

    // Constants
    interpreter.registerBuiltin('PI', () => Math.PI);
    interpreter.registerBuiltin('E', () => Math.E);
}

export default registerMathBuiltins;
