#!/usr/bin/env node
/**
 * RetroScript test harness (Node.js)
 *
 * Verifies that the documented RetroScript surface actually works:
 *   1. Lexer + Parser accept every documented syntax form.
 *   2. Interpreter executes core statements correctly using the
 *      DOM-free subset of builtins (math/string/array/object/type/json/time).
 *   3. try/catch catches and binds runtime errors as documented.
 *   4. `on` event handlers persist after the script finishes and fire
 *      when the interpreter re-emits an event.
 *   5. Every DOM-free builtin module registers a non-zero set of
 *      builtins (none is silently empty after a refactor).
 *
 * Browser-only builtins (Multimedia, Media, Dialog, Terminal, System,
 * Debug, Messaging, Telemetry) depend on core/Sanitize.js which evaluates
 * `document.createElement` at module-load time. We do NOT import them
 * here — `node --check` already covers their syntax, and the boot health
 * checks cover their runtime wiring.
 *
 * Usage:  node scripts/test-retroscript.mjs
 */

import { Lexer } from '../core/script/lexer/Lexer.js';
import { Parser } from '../core/script/parser/Parser.js';
import { Interpreter } from '../core/script/interpreter/Interpreter.js';
import { registerMathBuiltins } from '../core/script/builtins/MathBuiltins.js';
import { registerStringBuiltins } from '../core/script/builtins/StringBuiltins.js';
import { registerArrayBuiltins } from '../core/script/builtins/ArrayBuiltins.js';
import { registerObjectBuiltins } from '../core/script/builtins/ObjectBuiltins.js';
import { registerTypeBuiltins } from '../core/script/builtins/TypeBuiltins.js';
import { registerJsonBuiltins } from '../core/script/builtins/JsonBuiltins.js';
import { registerTimeBuiltins } from '../core/script/builtins/TimeBuiltins.js';

let passed = 0;
let failed = 0;

function record(name, ok, err) {
    if (ok) {
        passed++;
        console.log(`  PASS  ${name}`);
    } else {
        failed++;
        console.log(`  FAIL  ${name}\n        ${err && err.message ? err.message : err}`);
    }
}

function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            return result.then(
                () => record(name, true),
                (err) => record(name, false, err)
            );
        }
        record(name, true);
    } catch (err) {
        record(name, false, err);
    }
}

function assert(cond, msg = 'Expected truthy value') {
    if (!cond) throw new Error(msg);
}

function assertEq(actual, expected, msg = '') {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg} expected ${e} got ${a}`);
}

function parse(source) {
    const tokens = new Lexer(source).tokenize();
    return new Parser(tokens).parse();
}

/**
 * Minimal EventBus shim implementing the on/emit surface the interpreter
 * uses. Real production EventBus is browser-bound (window/CustomEvent),
 * but for unit tests a simple Map-of-handlers is sufficient.
 */
function makeEventBusShim() {
    const handlers = new Map();
    return {
        on(eventName, handler) {
            if (!handlers.has(eventName)) handlers.set(eventName, []);
            handlers.get(eventName).push(handler);
            return () => {
                const list = handlers.get(eventName);
                if (!list) return;
                const idx = list.indexOf(handler);
                if (idx !== -1) list.splice(idx, 1);
            };
        },
        emit(eventName, payload) {
            const list = handlers.get(eventName);
            if (!list) return;
            for (const h of list.slice()) {
                try { h(payload); } catch (e) { /* swallow handler errors in test shim */ }
            }
        },
        off(eventName, handler) {
            const list = handlers.get(eventName);
            if (!list) return;
            const idx = list.indexOf(handler);
            if (idx !== -1) list.splice(idx, 1);
        },
    };
}

function makeInterpreter(out, eventBus) {
    const interp = new Interpreter({
        context: {
            EventBus: eventBus,
            CommandBus: null,
        },
        onOutput: (line) => out.push(line),
    });
    registerMathBuiltins(interp);
    registerStringBuiltins(interp);
    registerArrayBuiltins(interp);
    registerObjectBuiltins(interp);
    registerTypeBuiltins(interp);
    registerJsonBuiltins(interp);
    registerTimeBuiltins(interp);
    return interp;
}

async function run(source) {
    const out = [];
    const eventBus = makeEventBusShim();
    const interp = makeInterpreter(out, eventBus);
    const ast = parse(source);
    await interp.execute(ast);
    return { interp, out, eventBus };
}

// ─────────────────────────────────────────────────────────────────────
// Section 1: Lexer + Parser — documented syntax forms
// ─────────────────────────────────────────────────────────────────────
console.log('1. Parser accepts documented syntax');
console.log('-'.repeat(50));

test('variable assignment', () => parse('set $x = 42'));
test('arithmetic + string concat', () => parse('set $y = ($x * 2) + " items"'));
test('if / else / endif', () => parse('if $x > 0 then { print "pos" } else { print "neg" }'));
test('while loop', () => parse('while $x > 0 { set $x = $x - 1 }'));
test('foreach loop', () => parse('foreach $item in $list { print $item }'));
test('repeat N { ... }', () => parse('repeat 3 { print "hi" }'));
test('loop N { ... }', () => parse('loop 5 { print $i }'));
test('match with default branch', () => parse('match $x { 1 => { print "one" } default => { print "other" } }'));
test('match with comma-separated cases', () => parse('match $x { 1, 2, 3 => { print "small" } default => { print "big" } }'));
test('def + call function', () => parse('def greet($name) { return "Hi " + $name }\ncall greet "World"'));
test('try / catch with named error', () => parse('try { read "C:/x" into $d } catch $err { print $err }'));
test('try / catch with default $error', () => parse('try { set $r = 1 / 0 } catch { print $error }'));
test('on namespaced event handler', () => parse('on user:login { print "welcome" }'));
test('on hyphenated event part', () => parse('on desktop:bg-change { print "wallpaper changed" }'));
test('emit event with named args', () => parse('emit score:update points=100 player="alice"'));
test('launch app (unquoted id)', () => parse('launch notepad'));
test('launch app with params', () => parse('launch terminal with cmd="dir"'));
test('alert dialog', () => parse('alert "Hello"'));
test('multi-statement program', () => parse('set $a = 1\nset $b = 2\nprint $a + $b'));

console.log('');

// ─────────────────────────────────────────────────────────────────────
// Section 2: Interpreter — basic execution
// ─────────────────────────────────────────────────────────────────────
console.log('2. Interpreter executes core statements');
console.log('-'.repeat(50));

await test('print emits to capture', async () => {
    const { out } = await run('print "hello world"');
    assertEq(out, ['hello world']);
});

// `print` defaults to "unquoted text mode" unless its first token is a
// quoted string. To force expression evaluation, assign first.
await test('arithmetic precedence (via assignment)', async () => {
    const { out } = await run('set $r = 2 + 3 * 4\nprint "" + $r');
    assertEq(out, ['14']);
});

await test('variables persist across statements', async () => {
    const { out } = await run('set $x = 10\nset $y = $x + 5\nprint "" + $y');
    assertEq(out, ['15']);
});

await test('if / else branching', async () => {
    const { out } = await run('set $x = 5\nif $x > 3 then { print "big" } else { print "small" }');
    assertEq(out, ['big']);
});

// NB: do not name the loop variable `$i` — the interpreter overwrites
// `$i` with the loop index unconditionally (Interpreter.js:313), which
// shadows the user variable. This is a real implementation bug surfaced
// by this test; rename or document.
await test('foreach over array literal binds element to loop var', async () => {
    const { out } = await run('foreach $item in [10, 20, 30] { print "" + $item }');
    assertEq(out, ['10', '20', '30']);
});

await test('while loop counts up', async () => {
    const { out } = await run('set $n = 0\nwhile $n < 5 { print "" + $n\n set $n = $n + 1 }');
    assertEq(out, ['0', '1', '2', '3', '4']);
});

await test('def + call returns value', async () => {
    const { out } = await run('def double($n) { return $n * 2 }\nset $r = call double 7\nprint "" + $r');
    assertEq(out, ['14']);
});

await test('match statement selects correct branch', async () => {
    const { out } = await run('set $x = 2\nmatch $x { 1 => { print "one" } 2 => { print "two" } default => { print "other" } }');
    assertEq(out, ['two']);
});

console.log('');

// ─────────────────────────────────────────────────────────────────────
// Section 3: try / catch — documented error handling
// ─────────────────────────────────────────────────────────────────────
console.log('3. try / catch behavior matches docs');
console.log('-'.repeat(50));

await test('catch binds runtime error to named variable', async () => {
    const { out } = await run(
        `try {
           call notARealBuiltin
         } catch $err {
           print "caught: " + $err
         }`
    );
    assert(out.length === 1, `expected 1 output, got ${out.length}`);
    assert(out[0].startsWith('caught: '), `expected "caught: ..." got "${out[0]}"`);
});

await test('catch with default $error variable', async () => {
    const { out } = await run(
        `try {
           call alsoFake
         } catch {
           print "default: " + $error
         }`
    );
    assert(out.length === 1);
    assert(out[0].startsWith('default: '));
});

await test('try block continues normally on success', async () => {
    const { out } = await run(
        `try {
           print "in-try"
         } catch $err {
           print "in-catch"
         }
         print "after"`
    );
    assertEq(out, ['in-try', 'after']);
});

await test('try / catch nested in if works', async () => {
    const { out } = await run(
        `set $x = 1
         if $x == 1 then {
           try {
             call missing
           } catch $err {
             print "ok"
           }
         }`
    );
    assertEq(out, ['ok']);
});

console.log('');

// ─────────────────────────────────────────────────────────────────────
// Section 4: on event handlers persist + fire on emit
// ─────────────────────────────────────────────────────────────────────
console.log('4. on event handlers persist and fire on emit');
console.log('-'.repeat(50));

await test('handler registered with `on` fires when event is emitted', async () => {
    const { out } = await run(
        `on score:update {
           print "got event"
         }
         emit score:update`
    );
    await new Promise((r) => setTimeout(r, 10));
    assertEq(out, ['got event']);
});

await test('emit-with-args delivers payload to handler', async () => {
    const { out } = await run(
        `on user:login {
           print "user=" + $event.name
         }
         emit user:login name="alice"`
    );
    await new Promise((r) => setTimeout(r, 10));
    assertEq(out, ['user=alice']);
});

await test('multiple on handlers all fire', async () => {
    const { out } = await run(
        `on tick {
           print "a"
         }
         on tick {
           print "b"
         }
         emit tick`
    );
    await new Promise((r) => setTimeout(r, 10));
    assertEq(out.sort(), ['a', 'b']);
});

console.log('');

// ─────────────────────────────────────────────────────────────────────
// Section 5: Builtin coverage — every loaded module has builtins
// ─────────────────────────────────────────────────────────────────────
console.log('5. Builtin module coverage (DOM-free subset)');
console.log('-'.repeat(50));

const moduleSpecs = [
    { name: 'MathBuiltins',     register: registerMathBuiltins,     min: 10 },
    { name: 'StringBuiltins',   register: registerStringBuiltins,   min: 8 },
    { name: 'ArrayBuiltins',    register: registerArrayBuiltins,    min: 8 },
    { name: 'ObjectBuiltins',   register: registerObjectBuiltins,   min: 4 },
    { name: 'TypeBuiltins',     register: registerTypeBuiltins,     min: 4 },
    { name: 'JsonBuiltins',     register: registerJsonBuiltins,     min: 2 },
    { name: 'TimeBuiltins',     register: registerTimeBuiltins,     min: 2 },
];

for (const spec of moduleSpecs) {
    test(`${spec.name} registers >= ${spec.min} builtins`, () => {
        const interp = new Interpreter({ context: {} });
        spec.register(interp);
        assert(
            interp.builtins.size >= spec.min,
            `expected >=${spec.min}, got ${interp.builtins.size}`
        );
    });
}

console.log('');

// ─────────────────────────────────────────────────────────────────────
// Section 6: autoexec.retro must parse cleanly
// ─────────────────────────────────────────────────────────────────────
console.log('6. autoexec.retro parses cleanly');
console.log('-'.repeat(50));

await test('autoexec.retro tokenizes + parses without error', async () => {
    const fs = await import('node:fs/promises');
    const url = new URL('../autoexec.retro', import.meta.url);
    const source = await fs.readFile(url, 'utf8');
    parse(source);
});

console.log('');

// ─────────────────────────────────────────────────────────────────────
console.log('='.repeat(60));
const total = passed + failed;
console.log(`Results: ${passed}/${total} passed${failed ? ` (${failed} failed)` : ''}`);
process.exit(failed > 0 ? 1 : 0);
