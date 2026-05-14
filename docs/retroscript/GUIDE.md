# RetroScript: The Comprehensive Guide

A learning-oriented guide to RetroScript, the scripting language built into
IlluminatOS. Read top-to-bottom on first acquaintance; come back to any
section in isolation later.

> **Need a different shape?** For an alphabetical reference, see
> [DICTIONARY.md](DICTIONARY.md). For step-by-step walkthroughs, see
> [tutorials/](tutorials/). For the encyclopedia of per-app events,
> see [`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../RETROSCRIPT_SCRIPTABLE_EVENTS.md).

---

## Contents

1. [Running scripts](#1-running-scripts)
2. [The mental model](#2-the-mental-model)
3. [Syntax basics: variables, types, expressions](#3-syntax-basics-variables-types-expressions)
4. [Control flow](#4-control-flow)
5. [Functions](#5-functions)
6. [Strings and `print`'s two modes](#6-strings-and-prints-two-modes)
7. [Collections — arrays and objects](#7-collections--arrays-and-objects)
8. [Errors and `try / catch`](#8-errors-and-try--catch)
9. [Events and the EventBus](#9-events-and-the-eventbus)
10. [The command bus](#10-the-command-bus)
11. [The script engine API](#11-the-script-engine-api)
12. [Filesystem and paths](#12-filesystem-and-paths)
13. [Dialogs and notifications](#13-dialogs-and-notifications)
14. [Apps and windows](#14-apps-and-windows)
15. [Terminal scripting](#15-terminal-scripting)
16. [Sound, video, and multimedia cues](#16-sound-video-and-multimedia-cues)
17. [Narrative APIs](#17-narrative-apis)
18. [Messaging — Inbox, IM, Phone, Browser](#18-messaging--inbox-im-phone-browser)
19. [Telemetry, analytics, replay](#19-telemetry-analytics-replay)
20. [Safety limits and resource budgets](#20-safety-limits-and-resource-budgets)
21. [Autoexec — the boot-time script](#21-autoexec--the-boot-time-script)
22. [Plugins, features, and custom builtins](#22-plugins-features-and-custom-builtins)
23. [Design patterns for real scripts](#23-design-patterns-for-real-scripts)
24. [Debugging and observability](#24-debugging-and-observability)
25. [Gotchas — the short list of things that will bite you](#25-gotchas--the-short-list-of-things-that-will-bite-you)

---

## 1) Running scripts

A RetroScript program is a plain text file with a `.retro` extension. The
language is interpreted — there is no build step, no bytecode, no
compilation. Source goes in, results come out.

### Four ways to run a script

1. **Script Runner** (`launch scriptrunner`) — open a `.retro` file in the
   GUI, hit Run. Best for iterating.
2. **Terminal** — `retro path/to/script.retro` from inside the in-OS
   terminal. Best for chaining with other shell commands.
3. **Double-click** — `.retro` files in My Computer or on the Desktop run
   when opened.
4. **Autoexec** — `autoexec.retro` is discovered and run automatically at
   boot. See [§21](#21-autoexec--the-boot-time-script).

### Programmatic invocation

From JavaScript (any feature, app, or plugin can do this):

```javascript
import ScriptEngine from './core/script/ScriptEngine.js';

const result = await ScriptEngine.run(source, {
    timeout: 5000,            // override default 30 000 ms
    variables: { $score: 0 }, // seed initial variables
    onOutput: msg => console.log('[script]', msg),
    onError: err => console.error('[script]', err),
});
```

`result` is `{ success: true, result, variables }` on success or
`{ success: false, error, variables }` on failure. See
[§11](#11-the-script-engine-api) for the full embedding surface.

### Persistent vs. one-shot

`ScriptEngine.run(source)` tears the interpreter down when the last
top-level statement finishes. `on` handlers registered inside are
unsubscribed before the function resolves.

`ScriptEngine.runPersistent(source)` keeps event handlers alive after the
top level completes. Use it when your script is "register a bunch of
reactions and let them fire over time". `autoexec` uses this mode
implicitly.

```javascript
const { sessionId } = await ScriptEngine.runPersistent(autoexecSource);
// later
ScriptEngine.stopPersistent(sessionId);
```

---

## 2) The mental model

RetroScript has three "shapes" of work, all of which compose freely:

1. **Imperative statements** that change the world right now —
   `set $x = 1`, `write "hello" to "C:/file.txt"`, `launch notepad`.
2. **Function calls** to builtins or user functions —
   `set $hash = call upper $name`, `set $sum = call sum [1, 2, 3]`.
3. **Reactive event handlers** — `on app:notepad:saved { ... }` — code
   that runs *whenever* something happens, independent of the linear
   flow of the script.

Under the hood, **every** "doing thing" eventually goes through one of
two single-purpose lanes:

- **The EventBus** for fan-out notifications (`window:open`,
  `app:launch`, `fs:file:create`, `story:scene:enter`, etc.). You
  subscribe with `on`, fire with `emit`.
- **The unified command registry** for request-style actions
  (`command:fs:read`, `command:terminal:execute`, `command:notepad:setText`).
  You invoke with `emit command:foo:bar` (fire-and-forget) or
  `call exec "command:foo:bar" $payload` (with a return value).

Many statement keywords (`launch`, `close`, `read`, `write`, `play`,
`alert`, `notify`) are sugar over these lanes — they dispatch a command
or emit an event under the hood. That's why everything a script does is
also observable from another script.

The third "shape" is critical: a RetroScript program is not a closed
sequence of side effects. It's a *participating actor* in a live
event-driven OS. A script can plant a handler at boot that fires hours
later when a player opens a particular folder.

---

## 3) Syntax basics: variables, types, expressions

### Variables

```retro
set $name = "Alice"
set $count = 42
$score = 100         # bare assignment — same as 'set'
$score += 1          # compound — same as set $score = $score + 1
```

- All variables are prefixed with `$`. The `$` is required everywhere the
  variable is referenced.
- Names may include letters, digits, underscores, and dots (`$user.age`
  is a *single* variable token — the dot is part of the name).
- A bare `$` with no name is treated as a literal dollar sign.
- Assignment looks for the nearest enclosing scope that already has the
  variable and updates it there; if nothing exists yet, it creates the
  variable in the current scope. This is how you can `set $x` outside a
  block and then reassign it from inside `if`.

### Scope

Every `if`, `loop`, `while`, `foreach`, `def`, `on`, `try`, `catch` body
opens a new child scope. Child scopes **read and write** parent
variables, but variables created in a child scope do not leak.

```retro
set $x = 1
if true {
  set $x = 2        # updates the outer $x
  set $y = 99       # local to the if block
}
print "" + $x       # 2
# $y is not visible here
```

### Types

| Type | Literal | Notes |
|---|---|---|
| Number | `42`, `3.14`, `-7` | No scientific notation. No negative literal — `-7` is unary minus applied to `7`. |
| String | `"hi"`, `'hi'`, `"line one\nline two"` | Multi-line allowed. See [§6](#6-strings-and-prints-two-modes). |
| Boolean | `true`, `false` | |
| Null | `null` | |
| Array | `[1, 2, 3]`, `[]`, `[[1,2], [3,4]]` | Trailing commas OK; newlines OK. |
| Object | `{name: "A", age: 30}` | Keys are identifiers or strings. |

### Truthiness

Falsy: `null`, `undefined`, `false`, `0`, `""`, `[]`. Everything else
truthy — including `{}`, `"0"`, `" "`, and the strings `"false"` /
`"null"`.

### Equality

`==` is strict — no type coercion:

```retro
print "" + (0 == false)   # false
print "" + ("1" == 1)     # false
print "" + (null == 0)    # false
```

If you need cross-type compare, convert first: `call toNumber $x`.

### Operators

Arithmetic (`+ - * / %`), comparison (`== != < > <= >=`), logical
(`&& || !`), compound assignment (`+= -= *= /= %=`).

Precedence high → low: call → unary → `* / %` → `+ -` → `< > <= >=` →
`== !=` → `&&` → `||`. All binary operators are left-associative.

Two non-obvious things:

- `+` concatenates if **either** operand is a string. So `"3" + 4` is
  `"34"`, not `7`. Convert deliberately.
- `&&` and `||` return the actual operand they short-circuit on, not a
  coerced boolean. So `null || "default"` is the string `"default"` and
  `false && anything` is `false`. This is how you do "default values"
  cheaply: `set $name = $maybeName || "anonymous"`.

### Dot access

Member access uses `.` and works for both reading and writing:

```retro
set $user = { profile: { name: "Alice", age: 30 } }
print $user.profile.name
set $user.profile.age = 31
```

Dots inside a variable reference (`$user.profile.age`) are part of the
variable token. Dots applied to a non-variable expression
(`(call getUser).name`) go through the member-access expression node —
both compile down to the same lookup logic.

For dynamic keys, use the `get` / `set` / `getPath` / `setPath`
builtins:

```retro
set $key = "name"
set $val = call get $user.profile $key
set $val = call getPath $user "profile.name" "anonymous"   # default
```

### Variable name discipline

A keyword like `repeat` cannot be a bare variable, but `$repeat` is
fine. Keywords *can* appear as `emit` payload keys (`emit timer:set
repeat=true` is valid) and as object literal keys (`{repeat: true}`).

---

## 4) Control flow

### Conditional

```retro
if $score >= 90 {
  print "A"
} else if $score >= 80 {
  print "B"
} else {
  print "lower than B"
}
```

The optional `then` keyword (`if cond then { ... }`) is purely cosmetic.
Braces are **required** even around a single statement.

### Match

A multi-way branch on strict equality. Cases may be a single value, a
comma-separated list of values, or `default`.

```retro
match $phase {
  1 => { call introScene }
  2, 3 => { call exposition }
  default => { print "unknown phase" }
}
```

### Loops

| Form | When |
|---|---|
| `loop N { ... }` | A bounded count. `$i` runs 0…N-1. |
| `while cond { ... }` | Pre-test. Iteration cap is 100 000. |
| `loop while cond { ... }` | Sugar for `while`. |
| `foreach $x in $coll { ... }` | Iterate array values or object keys. `$i` is the index. |
| `foreach $k, $v in $coll { ... }` | For objects, gives key + value. For arrays, gives index + value. |

```retro
loop 5 { print "" + $i }                # 0..4
while $count > 0 { $count -= 1 }
foreach $name in ["Alice", "Bob"] { print $name }
foreach $k, $v in { name: "Alice", age: 30 } {
  print $k + ": " + $v
}
```

> **`$i` gotcha.** The interpreter clobbers `$i` at the top of every
> loop iteration. Don't name your `foreach` variable `$i` — it gets
> overwritten with the index, not the value.

### `break` and `continue`

Standard meaning. They affect the innermost loop only.

```retro
loop 10 {
  if $i == 5 { break }
  if $i % 2 == 0 { continue }
  print "" + $i           # 1, 3
}
```

### `return`

Exits a function. Outside a function it's a parse-time error in some
positions; inside, it returns immediately with the given value (or
`null` if omitted).

---

## 5) Functions

Defined with `def`, `func`, or `function` (all synonyms). Called as
statements (`call name args`) or in expressions
(`set $r = call name args`).

```retro
def greet($who) {
  print "Hello, " + $who + "!"
}

def square($n) {
  return $n * $n
}

call greet "world"
set $s = call square 9
print "" + $s              # 81
```

### Arguments and closures

- Arguments are **space-separated**, not parenthesized. `call pow 2 3` ✅
  — `call pow(2, 3)` ❌ (parse error).
- Functions capture the environment they were defined in, so a
  `def`-ed function inside `if` can still read outer variables when
  called later.
- Recursion works (max depth 1 000). The interpreter tracks call stack
  size and raises `RecursionError` past the cap. `RecursionError` is
  **not** catchable.

### Builtin functions

The standard library lives under `core/script/builtins/`. Hundreds of
builtins, organized into modules: `Math`, `String`, `Array`, `Object`,
`Type`, `Time`, `JSON`, `System`, `Dialog`, `Debug`, `Terminal`,
`Media`, `Multimedia`, `Narrative`, `Messaging`, `Telemetry`. They are
called identically to user functions — there's no syntactic difference
between `call mySum [1, 2]` and `call sum [1, 2]`.

See [DICTIONARY.md → Built-in Functions](DICTIONARY.md#built-in-functions)
for the catalog.

### Return values from `call` statements

When `call` is used as a **statement**, the return value is discarded:

```retro
call notify "Hello"             # return value (null) discarded
```

When `call` is used in an **expression** (right of `=`, inside another
expression, as a function argument), the return value is consumed:

```retro
set $score = call sum $values
print "" + (call avg $scores)
```

---

## 6) Strings and `print`'s two modes

### Escape sequences

| Escape | Result |
|---|---|
| `\n` `\t` `\r` | Newline, tab, carriage return |
| `\\` | Backslash |
| `\"` `\'` | Quote |
| `\0` | Null character |
| `\X` (other) | The literal character `X` |

### Interpolation

Inside double- or single-quoted strings, `$variableName` is replaced
with the variable's value. Undefined variables are left as the literal
`$variableName` text — there's no error.

```retro
set $name = "Alice"
print "Hello, $name!"           # Hello, Alice!
print "Unknown: $missing"       # Unknown: $missing
```

### The two modes of `print`

`print` (and its alias `log`) parse differently depending on the first
token after them:

| First token after `print` | Mode | Behavior |
|---|---|---|
| A quoted string | **Expression mode** | Rest of the line is parsed as an expression. `+` concatenates / adds. |
| Anything else (`123`, `call`, bare identifier, `$var`) | **Unquoted text mode** | Rest of the line is read as literal text with `$var` interpolation. `+` is treated as a literal `+`. |

Both are useful — the text mode is convenient for simple status lines,
the expression mode for anything that needs arithmetic or concatenation
of non-strings:

```retro
# Expression mode — quoted string first
print "Score: " + $score + " / " + $max

# Unquoted text mode — interpolation only
print Welcome, $username. You have $count messages.
```

If you need expression behavior on a non-string value, prefix with `""`
or assign first:

```retro
print "" + (2 + 3 * 4)          # "14"
set $r = 2 + 3 * 4
print "" + $r                   # "14"
```

### Multi-line strings

String literals can span lines:

```retro
set $banner = "
============
 SYSTEM READY
============
"
```

The string contains the leading and trailing newlines as written.

---

## 7) Collections — arrays and objects

### Array literals and indexing

```retro
set $colors = ["red", "green", "blue"]
print $colors[0]                # "red"
print $colors[-1]               # not supported — use 'last'
print call last $colors         # "blue"
```

Negative indexing is **not** supported by `[ ]`. Use `last` /
`slice` / `at` (with a non-negative index) — or compute the index:

```retro
print $colors[call count $colors - 1]
```

### Array operations cheat-sheet

| Want to… | Use |
|---|---|
| Read first / last / index N | `first`, `last`, `at` |
| Add to the end | `push` (mutates) |
| Add to the start | `unshift` (mutates) |
| Remove from the end | `pop` (mutates, returns removed) |
| Remove from the start | `shift` (mutates, returns removed) |
| Filter by value | `filter` (new array) |
| Filter by object property | `filterBy` |
| Map to property | `mapBy` |
| Sort by value or property | `sort` / `sortDesc` / `sortBy` / `sortByDesc` |
| De-duplicate | `unique` |
| Flatten nested arrays | `flatten` |
| Build a numeric range | `range start end [step]` |
| Sum / average / product | `sum`, `avg`, `product` |
| Group by property | `groupBy` |

> **Mutation surprise.** `push`, `pop`, `shift`, `unshift` mutate in
> place and also return the array (or the removed element). The other
> array builtins return new collections.

### Object literals

```retro
set $user = {
  name: "Alice",
  age: 30,
  tags: ["admin", "scripter"],
  address: { city: "Geneva" },
}
```

Keys may be bare identifiers or quoted strings. Access with dot
notation for static keys, `get` / `getPath` for dynamic ones, and the
`set` / `setPath` builtins for dynamic writes.

`Object.*` builtins (note the lowercase / dotted spelling in source —
`call keys $obj`, not `Object.keys`):

| | |
|---|---|
| `keys` | own keys |
| `values` | own values |
| `entries` | `[[k, v], ...]` |
| `has` | key existence |
| `merge` | shallow merge into new object |
| `clone` | deep clone via JSON |
| `freeze` | `Object.freeze` and return |
| `getPath` / `setPath` | dotted-path read / write |

### Iterating

```retro
foreach $color in $colors {
  print $color
}

foreach $key, $value in $user {
  print $key + ": " + (call toString $value)
}
```

`foreach` makes a defensive copy of arrays before iterating, so mutating
the source array inside the loop is safe (the loop continues on the
snapshot). For objects, iteration order is insertion order (JavaScript
object semantics).

### JSON for serialization

```retro
set $obj = { name: "Alice", scores: [10, 20, 30] }
set $text = call toJSON $obj
write $text to "C:/Users/User/Documents/alice.json"

read "C:/Users/User/Documents/alice.json" into $raw
set $loaded = call fromJSON $raw
print "" + $loaded.name        # "Alice"
```

`toJSON` returns `null` on cyclic / invalid input. `fromJSON` returns
`null` on parse failure. Use `isValidJSON` if you want a boolean check
before parsing.

---

## 8) Errors and `try / catch`

```retro
try {
  read "C:/Users/User/Documents/maybe.txt" into $data
  print $data
} catch $err {
  print "Could not read file: " + $err
}
```

The variable name in `catch` is optional — if you write `catch { … }`
without a variable, the error message binds to `$error`.

### What can be caught

- All `ScriptError` subclasses raised at runtime: division-by-zero,
  type errors, reference errors, builtin failures.
- Errors thrown from `call` (builtin or user-defined).

### What cannot

- `TimeoutError` (script exceeded its execution budget).
- `RecursionError` (call stack too deep).
- `ParseError` (raised at lex/parse time, before execution begins).

These bubble all the way out of the script.

### Defensive idiom

`autoexec.retro` uses this pattern liberally:

```retro
try { mkdir "C:/Users/User/Documents/.archive" } catch {}
try { mkdir "C:/Users/User/Documents/.archive/fragments" } catch {}
```

`mkdir` on an existing directory throws — the empty `catch` swallows
that so the boot script proceeds.

### Asserting in tests

For test-style scripts (`scripts/test-retroscript.sh` smoke tests):

```retro
call assertEqual (call sum [1,2,3]) 6 "sum of [1,2,3] should be 6"
call assertType $name "string" "name should be a string"
call assert ($score > 0) "score must be positive"
```

All three throw a `RuntimeError` (catchable) on failure.

---

## 9) Events and the EventBus

The EventBus is the central nervous system of IlluminatOS. Apps, features,
plugins, and scripts all communicate by emitting events and subscribing to
them.

### Subscribing — `on`

```retro
on app:notepad:saved {
  print "Saved file: " + $event.path
}

on window:close {
  print "Window " + $event.id + " closed"
}
```

Inside an `on` body, `$event` is automatically bound to the event
payload (the object emitted alongside the event name).

### Emitting — `emit`

```retro
emit my:custom:signal value=42 source="script"

# Equivalent — the system event for unlocking achievements
emit command:achievement:unlock achievementId="first_script"
```

Payload entries are key=value pairs separated by spaces; values are
expressions, so you can compute them:

```retro
emit timer:set interval=(5 * 1000) repeat=true event="heartbeat"
```

### Wildcards

Subscribe to a namespace with `*`:

```retro
on window:* {
  print "Window event: " + $event   # $event is the full payload
}
```

### Handler isolation

An `on` handler runs in **isolated** interpreter state. The current
call stack, local variables, and control-flow signals are saved before
the handler runs and restored after. This means:

- `break` / `continue` / `return` inside a handler don't affect the
  outer script.
- Variables you assign inside a handler **don't propagate back out**.

To pass state out of a handler, use one of:

- `setStorage("key", value)` for cross-script persistence,
- a file via `write` for cross-tab persistence,
- a script-level event the outer script subscribes to,
- the narrative APIs (`flag.set`, `objective.complete`, …).

### Handler lifetime

In `ScriptEngine.run`, every `on` handler is unsubscribed when the
top-level finishes. Persistent sessions (`runPersistent`, used by
autoexec) keep them alive until the session is stopped.

### Useful event families

See [DICTIONARY.md → System Events](DICTIONARY.md#system-events) for the
full table. The high-leverage ones:

| Family | What you can react to |
|---|---|
| `window:*` | open/close/focus/minimize/maximize/resize/move |
| `app:*` | launch/ready/close/focus/blur/state-change/error |
| `fs:*` | file create/read/update/delete/rename/move/copy |
| `keyboard:*` `mouse:*` | input |
| `system:idle` / `system:active` | activity |
| `notification:*` | toasts |
| `script:*` | other scripts' lifecycle |
| `story:*` | narrative state changes |
| `media:*` | audio/video/image cue events |
| `feature:*` | feature lifecycle |

The full encyclopedic catalog (with payloads) lives in
[`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../RETROSCRIPT_SCRIPTABLE_EVENTS.md).

---

## 10) The command bus

Where the EventBus is for *notifications*, the command bus is for
*requests* — actions you ask the system to perform that have a return
value. Both share `EventBus`'s underlying registry; the command bus is
just the subset where handlers return a value.

### Two ways to invoke

```retro
# Fire-and-forget (return value lost)
emit command:fs:read path="C:/Users/User/Desktop/note.txt"

# Capture the return value (await it)
set $r = call exec "command:fs:read" { path: "C:/Users/User/Desktop/note.txt" }
print $r.content
```

The second form goes through the `exec` builtin, which is a thin wrapper
around `EventBus.executeCommand(command, payload)`. Most useful for
commands that return data — file reads, terminal output, queries.

### High-leverage command families

| Family | Examples |
|---|---|
| `command:app:*` | `app:launch`, `app:close` |
| `command:window:*` | `window:focus`, `window:close`, `window:maximize` |
| `command:fs:*` | `fs:read`, `fs:write`, `fs:mkdir`, `fs:move`, `fs:copy` |
| `command:terminal:*` | 21 commands — see [DICTIONARY.md](DICTIONARY.md#terminal) |
| `command:dialog:*` | `dialog:show`, `notification:show` |
| `command:<appId>:core.*` | The baseline scriptable surface every app has |
| `command:<appId>:<action>` | App-specific (e.g. `command:notepad:setText`) |

See [DICTIONARY.md → Command Bus Channels](DICTIONARY.md#command-bus-channels).

### Sugar statements that dispatch commands

Several keywords are shortcuts:

| You write | It dispatches |
|---|---|
| `launch notepad` | `command:app:launch` |
| `close $wid` | `command:app:close` (or `window:close`) |
| `focus $wid` / `minimize $wid` / `maximize $wid` | `command:window:*` |
| `read path into $var` | `command:fs:read` |
| `write c to path` | `command:fs:write` |
| `mkdir path` | `command:fs:mkdir` |
| `delete path` / `rm path` | `command:fs:delete` |
| `alert msg` / `notify msg` | `dialog:alert` / `notification:show` |
| `play sound` | `sound:play` / `audio:play` |

If a sugar form has the options you need, prefer it for readability. If
you need to compute the command name dynamically, fall back to
`emit command:foo:bar` or `call exec "command:foo:bar" $payload`.

### Queries

Queries are a third pattern — read-only state requests. The `query`
builtin routes through the `QueryHandler` service:

```retro
set $wins = call query "windows"            # array of open windows
set $apps = call query "apps"               # registered apps
set $tree = call query "fs:tree"            # full virtual filesystem tree
set $exists = call query "fs:exists" "C:/Users/User/Desktop/note.txt"
```

Per-app queries follow `query:<appId>:<key>` and are handled by the app
itself. See per-app docs in
[`/SCRIPTING_GUIDE.md`](../../SCRIPTING_GUIDE.md) §21–27.

---

## 11) The script engine API

The script engine is implemented in `core/script/ScriptEngine.js`. You
embed it from JavaScript like this:

```javascript
import ScriptEngine from './core/script/ScriptEngine.js';

// One-time setup at boot (already done by index.js, but in tests or
// embedded contexts you may need to do this yourself)
ScriptEngine.initialize({
    EventBus,
    FileSystemManager,
    StateManager,                  // optional
    WindowManager,                 // optional
    StorageManager,                // optional
    AppRegistry,                   // optional
    FeatureRegistry,               // optional
    TelemetryCollector,            // optional
    ReplayEngine,                  // optional
    NarrativeStateManager,         // optional
    MediaAssetManager,             // optional
});
```

`EventBus` and `FileSystemManager` are required. Everything else is
optional — the corresponding builtins return `false` / `null` when the
service isn't available rather than throwing. This is why
`story.start("foo")` silently no-ops if you run a narrative script in
a plain Script Runner without a campaign manager.

### `run(source, options)`

```javascript
const result = await ScriptEngine.run(source, {
    timeout: 30_000,
    variables: { $name: 'Alice', $score: 0 },
    onOutput: msg => terminalAppend(msg),
    onError: err => console.error(err),
    onVariables: vars => persist(vars),   // called once at the end
});
// result = { success: true, result: any, variables: {...} }
//   or    = { success: false, error: {...}, variables: {...} }
```

### `runFile(path, options)`

Same as `run`, but the source is read from a virtual filesystem path
first.

### `runPersistent(source, options)`

Like `run`, but `on` handlers survive after the top level finishes. The
return value includes a `sessionId` you can later pass to
`stopPersistent(sessionId)` or `stopAllPersistent()`.

### `defineFunction(name, fn)` / `registerGlobalBuiltin(name, fn)`

Add a custom builtin so every script can `call myThing`. The function
can be sync or async (will be awaited):

```javascript
ScriptEngine.defineFunction('uppercase', (s) => String(s).toUpperCase());
ScriptEngine.registerGlobalBuiltin('fetchJSON', async (url) => {
    const r = await fetch(url);
    return await r.json();
});
```

These are global — every subsequent script can use them.

---

## 12) Filesystem and paths

The OS has a virtual filesystem (`core/FileSystemManager.js`) with
Windows-style paths.

### Reading and writing

```retro
write "Hello, world" to "C:/Users/User/Documents/hello.txt"
read "C:/Users/User/Documents/hello.txt" into $content
print $content
```

If `read` has no `into` clause, the contents land in `$result`.

### Directories

```retro
mkdir "C:/Users/User/Documents/Project A"
delete "C:/Users/User/Documents/Project A/old.txt"
rm "C:/Users/User/Documents/Project A"           # rm is an alias for delete
```

`mkdir` throws if the directory already exists — wrap in `try / catch`
when bootstrapping.

### Allowed paths

The script engine validates every path through
`core/script/utils/PathValidation.js`. Only these prefixes are allowed:

```
C:/Users/User/Desktop/        C:/Users/User/Documents/
C:/Users/User/Pictures/       C:/Users/User/Music/
C:/Users/User/Videos/         C:/Users/User/Projects/
C:/Users/User/Secret/         C:/Windows/
C:/Windows/System32/          C:/server/    (also /C/server/)
C:/shared/    (also /C/shared/)              C:/public/    (also /C/public/)
```

Additionally:

- Paths containing `..` are rejected (no traversal).
- Paths with control characters (`0x00`–`0x1F`) are rejected.
- The path must be a non-empty string.

`RuntimeError` with a `line` field tells you which line of your script
tripped the validator.

### Path conventions

- Use forward slashes (`C:/Users/User/...`). Backslashes work but read
  awkwardly because they look like escape sequences in string literals
  (`"C:\\Users\\User\\..."`).
- Paths are case-insensitive on the virtual FS but **case-preserving**
  — write with the same case you intend to read.

### Filesystem events

Every successful FS operation emits a `fs:*` event. Subscribe in another
script to react:

```retro
on fs:file:create {
  if call startsWith $event.path "C:/Users/User/Desktop/" {
    notify "New desktop file: " + $event.path
  }
}
```

---

## 13) Dialogs and notifications

Four primitives, two blocking and two non-blocking:

| Statement | Blocking? | Default variable |
|---|---|---|
| `alert msg` | Non-blocking | — |
| `confirm msg [into $var]` | **Blocking** | `$confirmed` (boolean) |
| `prompt msg [default val] [into $var]` | **Blocking** | `$input` (string) |
| `notify msg` | Non-blocking | — |

```retro
alert "Backup complete."

confirm "Delete the recycle bin?" into $sure
if $sure {
  emit command:recyclebin:empty
}

prompt "Your name?" default "Guest" into $name
notify "Hello, $name!"
```

In `autoexec` (headless boot context), `confirm` auto-resolves to `true`
and `prompt` auto-uses the default. This way an autoexec doesn't
indefinitely block boot waiting for user input that may never come.

For richer dialog flows (custom buttons, validation, modal stacking) use
the `command:dialog:show` channel directly — see
[`/SCRIPTING_GUIDE.md` §12](../../SCRIPTING_GUIDE.md#12-dialogs-and-notifications).

---

## 14) Apps and windows

### Launching

```retro
launch notepad
launch browser with url="https://example.com"
launch terminal with initialCommand="dir C:/"
```

`launch` (and its alias `open`) creates a new window for that app. The
`with` clause is a payload of key=value pairs delivered to the app's
`onOpen` lifecycle method.

After `launch`, the new window receives `app:launch`, then `app:open`,
then `app:ready` events in sequence. The `windowId` is in each payload —
keep it around if you'll address that specific window later.

### Singletons

Some apps are deliberately singleton (`mycomputer`, `controlpanel`,
`adminpanel`). A second `launch` of a singleton focuses the existing
window instead of creating a new one and fires the app's `onRelaunch`
lifecycle with the new params.

### Window control

```retro
focus $windowId
minimize $windowId
maximize $windowId
close $windowId

# Close active window if no target
close
```

Or via the command bus (handy when you have the window id in a
variable):

```retro
emit command:window:focus windowId=$winId
emit command:window:close windowId=$winId
```

### Reading current window state

```retro
set $focused = call getFocusedWindow
# { id, title, minimized, maximized } or null

set $windows = call getWindows
# array of { id, appId, title, minimized, maximized }
```

### App-specific commands and queries

Every app extends `AppBase` and inherits a baseline scripting surface:

```retro
emit command:notepad:core.focus
emit command:notepad:core.maximize
emit command:notepad:core.setState windowId="notepad-1" key="dirty" value=true
emit command:notepad:core.emitCue windowId="notepad-1" cue="open-file" data={path: "..."}

set $win = call query "notepad:core.window"
set $state = call query "notepad:core.state"
```

Beyond the baseline, each app exposes its own commands and queries —
`command:notepad:setText`, `command:calculator:setExpression`, etc. The
per-app catalogs live in `/SCRIPTING_GUIDE.md` §21–27 and the master
list in [`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../RETROSCRIPT_SCRIPTABLE_EVENTS.md).

### Observing apps

The app lifecycle fires events you can react to:

```retro
on app:launch  { print "launched: "    + $event.appId }
on app:ready   { print "ready: "       + $event.appId }
on app:focus   { print "focused: "     + $event.appId }
on app:blur    { print "blurred: "     + $event.appId }
on app:close   { print "closed: "      + $event.appId }
on app:state:change {
  print $event.appId + " state " + $event.key + " = " + (call toString $event.value)
}
on app:error   { print "error in "     + $event.appId + ": " + $event.error }
```

---

## 15) Terminal scripting

The terminal app is a full multi-instance shell with its own command
language. Scripts drive it through `terminal*` builtins.

```retro
# Make sure terminal is open
call terminalOpen

# Run a single command
call terminalExecute "ver"

# Run a sequence (each command waits for the previous)
call terminalExecuteSequence [
  "cd C:/Users/User",
  "mkdir Projects",
  "cd Projects",
  "touch readme.txt",
]

# Read what came out
set $out = call terminalGetOutput
print $out
```

Other useful builtins (see [DICTIONARY.md → Terminal](DICTIONARY.md#terminal)
for the full list):

| Reading state | Writing state |
|---|---|
| `terminalGetPath` | `terminalCd path` |
| `terminalGetHistory` | `terminalAlias name cmd` |
| `terminalGetEnvVars` | `terminalSetEnvVar name val` |
| `terminalGetAliases` | `terminalWriteFile path content` |
| `terminalDir [path]` | `terminalClear` |
| `terminalGetState` | `terminalPrint text [color]` / `terminalPrintHtml html` |

### Two important properties

- **Multi-instance.** Opening two terminal windows gives them fully
  independent history, cwd, env vars, and aliases. The terminal
  builtins act on the most recently focused terminal; pass `windowId`
  via the underlying command bus when you need to target a specific
  instance.
- **Same path allowlist.** Terminal file ops resolve relative paths
  against the terminal cwd, then validate against the same path
  allowlist as the rest of the script engine. Operations outside the
  allowed prefixes still throw `RuntimeError`.

For a deeper terminal-specific walk-through see
[`docs/TERMINAL_SCRIPTING.md`](../TERMINAL_SCRIPTING.md) and
[tutorials/08-terminal-automation.md](tutorials/08-terminal-automation.md).

---

## 16) Sound, video, and multimedia cues

There are two layers of media in RetroScript: the simple statement-based
sound/video API, and the **Phase 2 cue system** that gives you grouping,
ducking, cross-fades, layered images, subtitles, and visual FX.

### Simple sound

```retro
play click                              # named sound effect
play notify
play error

play "C:/Users/User/Music/song.mp3" volume=0.5 loop=true
stop                                    # stop all
stop "C:/Users/User/Music/song.mp3"     # stop one
```

`play` decides between "named sound" and "file path" by inspecting the
source string: it's a path if it contains `/`, `\`, a common audio
extension (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.aac`), or starts
with `assets/`, `C:`, or `c:`. Otherwise it's a predefined sound type
routed to the sound system.

### Simple video

```retro
video "C:/Users/User/Videos/intro.mp4" volume=0.8 fullscreen=true
```

Same source-resolution heuristic as `play`.

### The Phase 2 cue system

When you need real choreography, use the `audio.*` / `video.*` /
`image.*` / `subtitle.*` / `fx.*` / `media.*` namespaces. They return
**cue IDs** you can later target, support concurrency budgets,
grouping, ducking, transitions, and layered visuals.

```retro
# Layered ambience
set $ambience = call audio.play "forest-loop" {
  group: "ambience", volume: 0.4, loop: true, fadeInMs: 800
}

# A one-shot stinger that ducks the ambience while it plays
call audio.duck "ambience" 0.15 4000
call audio.play "thunder" { group: "stinger", volume: 0.9 }
wait 4000
call audio.restore "ambience"

# Subtitle + screen shake at the climax
call subtitle.show "narrator" "Something approached." { durationMs: 3000 }
call fx.apply "screen-shake" { intensity: 0.6, durationMs: 500 }
wait 3000
call subtitle.clear "narrator"
call fx.clear "screen-shake"

# Done — stop the ambience
call audio.stop $ambience
```

FX presets: `screen-shake`, `glitch`, `flash`, `vignette`, `scanlines`,
`static`, `chromatic`. Each accepts options like `intensity`,
`durationMs`, `color`.

For combined "set the scene" patterns and a budget reference see
[tutorials/09-multimedia-and-mood.md](tutorials/09-multimedia-and-mood.md).

---

## 17) Narrative APIs

`story.*` / `scene.*` / `objective.*` / `flag.*` / `clue.*` / `mood.*` /
`npc.*` together form the narrative subsystem. They route through
`NarrativeStateManager` and emit canonical `story:*` events.

```retro
# Start a campaign
call story.start "case-7"

# Enter the opening scene
call scene.enter "intro"
call scene.complete "intro"

# Add an objective
call objective.add "find-key" "Find the key to the archive."

# Player picks up the key — set a flag, mark complete
call flag.set "has_key" true
call objective.complete "find-key"

# A clue is discovered
call clue.add "blueprint" ["evidence", "archive"]

# Shift the mood
call mood.transition "calm" "tense" 2000

# Update NPC state
call npc.setState "marcus" "trust" 75
```

Every mutating call emits an event another script can listen to:

```retro
on story:scene:enter   { print "entered: " + $event.sceneId }
on story:objective:complete { print "done: " + $event.id }
on story:clue:add      { print "found: " + $event.id }
on story:mood:set      { print "mood: "  + $event.presetId }
```

If no `NarrativeStateManager` is attached to the engine, every narrative
builtin returns `false` / `null` quietly — your script won't crash, it
just won't have narrative state. This is intentional so scripts that
*sometimes* run in a campaign and *sometimes* don't degrade gracefully.

See [tutorials/10-mini-arg.md](tutorials/10-mini-arg.md) for a full
end-to-end ARG example.

---

## 18) Messaging — Inbox, IM, Phone, Browser

The messaging builtins are how scripts deliver "in-world" content to
the player through diegetic channels — the email inbox, the instant
messenger, the phone, and the in-OS browser.

### Email (inbox)

```retro
call inbox.send "command@ops.local" "Day 1 briefing" "Welcome to the desk.\n\nLog in to begin."

# With attachments and priority
call inbox.send "anon@gateway.io" "Look at this" "Open the attachment." {
  attachments: [{ name: "evidence.txt", path: "C:/Users/User/Documents/.archive/e1.txt" }],
  priority: "high"
}

# Or use a registered template
call inbox.sendTemplate "intro-template" { player: $name }
```

### Instant messenger

```retro
call im.npcTyping "marcus" 2000        # show "Marcus is typing…"
wait 2000
call im.npcSend "marcus" "Are you there?" { displayName: "M. Webb", avatar: "/assets/marcus.png" }
```

### Phone

```retro
call phone.callScript "dispatch-route" "Dispatch HQ" [
  "Agent. This is dispatch.",
  "There's been a breach in Sector 7.",
  "Awaiting your move.",
]

call phone.voicemail "Unknown" "I shouldn't be calling you, but —" "/assets/voicemail-1.mp3"
```

### Browser

```retro
call browser.inject "case-files" "frag-1" "<h2>Case #7341</h2><p>Status: open.</p>"
call browser.navigate "https://archive.local/case-7341"
```

### Templates

For richer reuse, register templates with `content.register`,
`content.deliver`, and `content.schedule`. Useful when the same NPC
sends the same kind of message with different variables, or when you
want to queue a delivery for later.

See [tutorials/10-mini-arg.md](tutorials/10-mini-arg.md) for the templates
in action.

---

## 19) Telemetry, analytics, replay

Production campaigns benefit from telemetry — what scenes did players
engage with, which puzzles got stuck on, where did they drop off. The
`telemetry.*` and `analytics.*` builtins emit and aggregate events for
exactly that.

### Recording

```retro
call telemetry.checkpoint "act-1-end" { time: call elapsed $start }
call telemetry.puzzleAttempt "safe-combo" true false      # success, no hint
call telemetry.puzzleAttempt "safe-combo" false true      # fail, hint used
call telemetry.dropoff "act-2 cliffhanger"
call telemetry.setSampling "scene-dwell" 0.5              # half the events
```

### Reading

```retro
set $dwell    = call analytics.sceneDwellTimes
set $funnel   = call analytics.sceneFunnel
set $puzzles  = call analytics.puzzleAttempts
set $media    = call analytics.mediaEngagement
set $snapshot = call analytics.exportSnapshot
```

### Replay

For QA and showrunner debugging, you can replay a recorded snapshot:

```retro
call replay.load $snapshot
call replay.setExpectedBranch ["intro", "explore", "confrontation"]
call replay.play 2.0           # 2x speed
# ... later
set $divs = call replay.divergences
```

---

## 20) Safety limits and resource budgets

RetroScript enforces hard caps to keep a runaway script from locking
the page. See `core/script/utils/SafetyLimits.js`.

| Limit | Default | Notes |
|---|---|---|
| Execution time | 30 000 ms (10 000 for autoexec) | Per `run()`. `TimeoutError` not catchable. |
| `while` iterations | 100 000 | Per loop. Catchable. |
| `loop N` count | Clamped silently | The script doesn't error; iterations are capped. |
| Recursion depth | 1 000 | `RecursionError` not catchable. |
| Event handlers per script | 1 000 | Adding the 1001st throws. |
| String length | 1 000 000 chars | `concat`, `repeat`, `padStart/End` cap output. |
| Array length | 100 000 | `push`/`unshift`/`range`/`fill` cap. |
| Object keys | 10 000 | Builder-cap. |
| `wait` / `sleep` ms | 30 000 | Larger values get clamped, then awaited. |

### Implication: long-running campaigns

A *persistent* script (autoexec) doesn't restart its 30 s clock —
the timeout applies only to the initial top-level run. Once the top
level finishes successfully, `on` handlers run on their own clocks (with
their own 30 s budget per handler invocation).

So the recipe for a long-lived script is:

1. Register all your handlers and helpers in the first 10 s of
   top-level work.
2. Let `runPersistent` keep them alive.
3. React to events as they happen.

---

## 21) Autoexec — the boot-time script

`autoexec.retro` is the OS's "init" script. The loader
(`core/script/AutoexecLoader.js`) searches:

1. `./autoexec.retro` (HTTP fetch from the served root, with a 1500 ms
   probe timeout to skip SPA 404 fallbacks).
2. `C:/Windows/autoexec.retro`
3. `C:/Scripts/autoexec.retro`
4. `C:/Users/User/autoexec.retro`

First hit wins. It runs through `runPersistent` so event handlers
survive boot.

### What autoexecs are good for

- Deploying initial files (campaign data, NPC personas, encrypted
  evidence, README on the desktop).
- Registering the global event handlers your campaign relies on.
- Setting up timer-driven content drops
  (`content.schedule(templateId, vars, { delayMs: 60000 })`).
- Configuring system settings (theme, sounds, screensaver) before the
  user sees the desktop.

### Special context

- `$AUTOEXEC` is truthy. Detect it to branch into a "real boot" path
  versus a "preview from Script Runner" path:
  ```retro
  set $is_autoexec = 0
  try {
    if $AUTOEXEC then { set $is_autoexec = 1 }
  } catch {}
  ```
- `confirm` resolves to `true`, `prompt` to its default. Never block boot
  on user input.
- Timeout is 10 s, not 30 s. Anything longer must be deferred to a
  scheduled callback or an event handler.

### Lifecycle events

Subscribe from any other script:

```retro
on autoexec:start    { print "boot script starting" }
on autoexec:complete { print "boot script done" }
on autoexec:error    { print "boot failed: " + $event.error }
```

`/autoexec.retro` at the repo root is a 1146-line showcase that
exercises virtually every extensibility surface — files, inbox,
messenger, phone, terminal, narrative state, games, achievements,
multimedia cues, mood, screensaver. Treat it as a worked example for
"how does X feel in practice".

---

## 22) Plugins, features, and custom builtins

### Apps

Every app is a class extending `AppBase`. Apps register
`command:<appId>:*` and `query:<appId>:*` handlers, and emit
`app:<appId>:<event>` events. From a script you talk to any app via
those three channels — no special integration needed.

### Features

Features extend `FeatureBase` and run as background services
(notifications, mood orchestrator, achievement system, etc.). Their
lifecycle is observable:

```retro
on feature:enabled  { print $event.featureId + " enabled" }
on feature:disabled { print $event.featureId + " disabled" }
on feature:config:change { print "config changed: " + $event.featureId }
```

Features that need to expose commands register them on the EventBus
just like apps do. There's no separate API.

### Plugins

A plugin is a manifest module that ships features and/or apps:

```javascript
export default {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    features: [new MyFeature()],
    apps: [],
    onLoad:   () => { /* ... */ },
    onUnload: () => { /* ... */ },
};
```

Once loaded, the plugin's features and apps are indistinguishable from
core ones to your scripts — same command/event surface.

### Custom script builtins

If you want every script to be able to do something your codebase can
do, register a new builtin:

```javascript
ScriptEngine.defineFunction('lyrics', async (song) => {
    return await fetchLyrics(song);
});
```

Now `set $lyrics = call lyrics "Blue Monday"` works in every script
loaded after that registration. The function can be async (will be
awaited) and can throw — exceptions become catchable `RuntimeError`s in
the script.

---

## 23) Design patterns for real scripts

### Pattern: the bootstrap

```retro
def ensureDir($path) {
  try { mkdir $path } catch {}
}

call ensureDir "C:/Users/User/Documents/MyApp"
call ensureDir "C:/Users/User/Documents/MyApp/data"

try {
  read "C:/Users/User/Documents/MyApp/data/state.json" into $raw
  set $state = call fromJSON $raw
} catch {
  set $state = { runs: 0, lastSeen: null }
}

set $state.runs = $state.runs + 1
set $state.lastSeen = call now
write call toJSON $state to "C:/Users/User/Documents/MyApp/data/state.json"
```

### Pattern: register a debounced reaction

```retro
set $pending = 0

on fs:file:create {
  set $pending = $pending + 1
  set $id = $pending
  wait 500
  if $id == $pending {
    notify "Stable filesystem: " + (call count (call query "fs:list" "C:/Users/User/Documents/"))
  }
}
```

### Pattern: phased scenes

```retro
set $phase = 1
call story.start "case-7"

on app:notepad:saved {
  if $event.path == "C:/Users/User/Documents/notes.txt" {
    if $phase == 1 {
      set $phase = 2
      call scene.enter "act-2"
      call inbox.send "M.Webb@ops.local" "Phase 2" "Good. You noticed."
    }
  }
}
```

### Pattern: cross-script communication

Because `on` handlers run in isolated state, the easiest way for two
scripts to talk is via custom events or shared storage:

```retro
# Script A
emit my-app:progress phase=2 score=140

# Script B
on my-app:progress {
  print "phase " + $event.phase + ": " + $event.score
}
```

Or via storage:

```retro
# Script A
call setStorage "my-app:phase" 2

# Script B
set $phase = call getStorage "my-app:phase"
```

### Pattern: defensive launches

```retro
# Is the app already open?
set $windows = call query "windows"
set $existing = call filterBy $windows "appId" "notepad"

if (call count $existing) > 0 {
  focus $existing[0].id
} else {
  launch notepad
}
```

### Pattern: timed delivery

```retro
def schedule($delay, $event) {
  emit timer:set interval=$delay event=$event repeat=false
}

call schedule 60_000 "case-7:hint-1"
call schedule 180_000 "case-7:hint-2"

on case-7:hint-1 { call inbox.send "ally@op" "Hint" "Check the recycle bin." }
on case-7:hint-2 { call inbox.send "ally@op" "Hint 2" "Look harder." }
```

(`60_000` doesn't work — there's no `_` in number literals — use
`60000` or `60 * 1000`. Mentally noted, deliberately demonstrated.)

---

## 24) Debugging and observability

### Logging

`debug`, `trace`, and `inspect` log to the browser console without
touching the user-facing output:

```retro
call debug "checkpoint A"
call trace "user state:" $userState
print "" + (call inspect $obj)
```

### Asserting

```retro
call assert ($count > 0) "expected at least one"
call assertEqual $a $b "should match"
call assertType $name "string"
```

All three throw catchable `RuntimeError`s on failure.

### Timing

```retro
call timeStart "render"
call render
call timeEnd "render"    # logs the elapsed ms
```

### Introspection

```retro
set $stack = call getCallStack    # array of function names
set $vars  = call dumpVars        # current variable bindings
print call inspect $vars
```

### System-wide health

From JavaScript, inspect `window.__OS_HEALTH` for a live snapshot:

```js
console.log(window.__OS_HEALTH)
```

It exposes subscription accounting, storage telemetry, event-bus stats,
feature posture, realtime state, recent faults, and a `degraded` field
that names the reasons (boot, validationErrors, failedFeatures, faults,
subscriptionLeak).

### Watching what fires

The cheapest way to learn the system is `on every:thing`:

```retro
on app:*      { print "[app] "      + $event }
on window:*   { print "[window] "   + $event }
on fs:*       { print "[fs] "       + $event }
on story:*    { print "[story] "    + $event }
```

Use sparingly — the noise is real. But for an hour of "what fires when
I click X?", nothing's better.

---

## 25) Gotchas — the short list of things that will bite you

The complete catalog is in [`/SCRIPTING_GUIDE.md`§19](../../SCRIPTING_GUIDE.md#19-gotchas-and-common-mistakes).
These are the ones I keep tripping over:

1. **`#` is a comment. `;` is a statement separator.** Don't write
   `; comment` — it's a parse error.
2. **Keywords are case-insensitive, identifiers are case-sensitive.**
   `Set $X = 1` is the same as `set $X = 1`, but `$X` and `$x` are
   different variables.
3. **`==` is strict.** `0 == false` is `false`. Convert if you need a
   loose compare.
4. **`+` with strings concatenates.** `"3" + 4` is `"34"`. Pre-coerce
   with `toNumber` if you want arithmetic.
5. **`print` has two modes.** Quoted-string-first → expression; else
   unquoted-text. Prefix with `"" +` for arithmetic on non-string
   first values.
6. **`$i` is magic.** It's reset by every loop. Don't reuse it as a
   `foreach` variable.
7. **`push` mutates.** And so do `pop`, `shift`, `unshift`. The other
   array builtins return new arrays.
8. **`read` defaults to `$result`. `confirm` to `$confirmed`. `prompt`
   to `$input`.** When you omit the `into` clause, these are the
   variables that get written.
9. **Function call arguments are space-separated, not parenthesized.**
   `call pow 2 3` ✅, `call pow(2, 3)` ❌.
10. **Blocks always need braces.** `if cond stmt` is a parse error.
    Write `if cond { stmt }`.
11. **`on` handlers are isolated.** State changes inside don't leak
    out. Use storage, events, or files to communicate back.
12. **Path validation is real.** `read "/etc/passwd"` will throw. Only
    the allowlisted prefixes work.
13. **`TimeoutError` and `RecursionError` are not catchable.** They
    bubble straight out of the script.
14. **`mkdir` throws on existing directories.** Wrap in `try` if you
    want idempotent.
15. **Division by zero throws.** Including modulo.

---

## Where to go next

- [DICTIONARY.md](DICTIONARY.md) — alphabetical lookup of every name in
  the language.
- [tutorials/](tutorials/) — hands-on exercises that build up to a
  full ARG mini-campaign.
- [`/autoexec.retro`](../../autoexec.retro) — the production showcase.
  1146 lines of "how do real campaigns look".
- [`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../RETROSCRIPT_SCRIPTABLE_EVENTS.md) —
  the encyclopedia of every per-app event/command/query.
- [`docs/TERMINAL_SCRIPTING.md`](../TERMINAL_SCRIPTING.md) — terminal
  automation in detail.
- [`/CLAUDE.md`](../../CLAUDE.md) — the architecture invariants that
  shape why the language works this way.
