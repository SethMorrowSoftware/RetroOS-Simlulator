# RetroScript Dictionary

A flat, alphabetical reference to every RetroScript keyword, statement,
operator, built-in function, system event, and command-bus channel. Each
entry is a single-line signature plus a sentence or two of behavior and a
minimal example. Optimized for `Ctrl-F`.

For tutorials and conceptual explanations, see
[GUIDE.md](GUIDE.md) and [tutorials/](tutorials/).

---

## Contents

1. [Keywords](#keywords)
2. [Operators and Punctuation](#operators-and-punctuation)
3. [Statements](#statements)
4. [Built-in Functions](#built-in-functions)
   - [Math](#math)
   - [String](#string)
   - [Array](#array)
   - [Object](#object)
   - [Type](#type)
   - [Time](#time)
   - [JSON](#json)
   - [System](#system)
   - [Dialog](#dialog)
   - [Debug](#debug)
   - [Terminal](#terminal)
   - [Media](#media)
   - [Multimedia (audio / video / image / subtitle / fx / media)](#multimedia)
   - [Messaging (inbox / im / phone / browser / content)](#messaging)
   - [Narrative (story / scene / objective / flag / clue / mood / npc)](#narrative)
   - [Telemetry and Analytics (telemetry / analytics / replay)](#telemetry-and-analytics)
5. [Magic Variables](#magic-variables)
6. [System Events](#system-events)
7. [Command Bus Channels](#command-bus-channels)
8. [Query Bus Channels](#query-bus-channels)
9. [Safety Limits](#safety-limits)
10. [Error Classes](#error-classes)
11. [App IDs](#app-ids)
12. [Reserved Filesystem Paths](#reserved-filesystem-paths)

---

## Keywords

Reserved words. Keywords are **case-insensitive** (`SET`, `Set`, and `set`
are all the same token). They cannot be used as variable names without the
`$` prefix, but they **can** appear as event-name segments or payload keys.

| Keyword | Used in | Notes |
|---|---|---|
| `alert` | `alert msg` | Non-blocking dialog. |
| `break` | inside loops | Exit nearest enclosing loop. |
| `call` | `call name arg1 arg2` | Invoke a function (builtin or user). |
| `catch` | `try { } catch [$err] { }` | Bind to caught error. Variable optional (`$err` if absent). Cannot catch `TimeoutError` / `RecursionError`. |
| `close` | `close [target]` | Close active window if no target, else by id. |
| `confirm` | `confirm msg [into $var]` | Blocking. Default into `$confirmed`. |
| `continue` | inside loops | Skip to next iteration. |
| `def` | `def name($p1, $p2) { }` | Function definition. `func` and `function` are aliases. |
| `default` | `prompt msg default val into $var` / `match { default => }` | Two uses: default value for `prompt`, default case for `match`. |
| `delete` | `delete path` | Remove a file or directory. `rm` is an alias. |
| `else` | `if … else { }` / `else if` | Chainable. |
| `emit` | `emit eventName key=val key=val` | Fire an event on the EventBus. Payload keys may be keywords. |
| `false` | literal | Boolean `false`. |
| `focus` | `focus target` | Focus a window by id. |
| `for` | `for $item in $collection { }` | Alias for `foreach`. |
| `foreach` | `foreach $item in $arr { }` / `foreach $key, $val in $obj { }` | Iterates arrays or objects. |
| `func` | `func name($p) { }` | Alias for `def`. |
| `function` | `function name($p) { }` | Alias for `def`. |
| `if` | `if cond [then] { } [else { }]` | `then` keyword optional. Braces required. |
| `in` | `foreach $x in $collection { }` | Required between var and collection. |
| `into` | `read path into $var`, `confirm msg into $var`, `prompt msg into $var` | Binds the result to a variable. |
| `launch` | `launch appId [with key=val key=val]` | Launch an app; `open` is an alias. |
| `log` | `log msg` | Alias for `print`. |
| `loop` | `loop count { }` / `loop while cond { }` | Bounded or condition-driven loop; sets `$i`. |
| `match` | `match expr { val => { } default => { } }` | Multi-way branch; strict equality; multi-value cases comma-separated. |
| `maximize` | `maximize target` | Maximize window by id. |
| `minimize` | `minimize target` | Minimize window by id. |
| `mkdir` | `mkdir path` | Create a directory. |
| `notify` | `notify msg` | Non-blocking toast notification. |
| `null` | literal | The null value. |
| `on` | `on event:name { }` | Register an event handler. State is isolated per handler. |
| `open` | `open appId [with ...]` | Alias for `launch`. |
| `play` | `play source [volume=n] [loop=bool]` | Plays audio: source = named sound (`click`, `notify`, ...) or path/URL. Path detection: contains `/`, `\`, common audio extension, `assets/`, or `C:`. |
| `print` | `print expr` / `print unquoted text` | Quoted-string-first → expression mode; else unquoted-text mode with `$var` interpolation. |
| `prompt` | `prompt msg [default val] [into $var]` | Blocking input. Default into `$input`. |
| `read` | `read path [into $var]` | Read a file. Default into `$result`. |
| `repeat` | (reserved; not a statement keyword today) | Reserved for future use. |
| `return` | `return [value]` | Return from a function; value optional. |
| `rm` | `rm path` | Alias for `delete`. |
| `set` | `set $var = expr` | Assignment. Shorthand `$var = expr` is equivalent. |
| `sleep` | `sleep ms` | Alias for `wait`. Capped at 30 000 ms. |
| `stop` | `stop [source]` | Stop a specific audio source, or all audio if omitted. |
| `then` | `if cond then { } else { }` | Optional sugar; same as `if cond { }`. |
| `to` | `write content to path` | Required between content and path. |
| `true` | literal | Boolean `true`. |
| `try` | `try { } catch { }` | Wrap code that may throw. |
| `video` | `video source [volume=n] [loop=bool] [fullscreen=bool]` | Plays a video cue. |
| `wait` | `wait ms` | Pause execution. Capped at 30 000 ms. |
| `while` | `while cond { }` / `loop while cond { }` | Pre-test loop; iteration limit 100 000. |
| `with` | `launch appId with key=val` | Begins a key=value parameter list. |
| `write` | `write content to path` | Write a file. Content is stringified. |

---

## Operators and Punctuation

| Token | Name | Behavior |
|---|---|---|
| `+` | plus | Numeric add; string-concat if either operand is a string. |
| `-` | minus | Binary subtract; unary negate. |
| `*` | star | Multiply. |
| `/` | slash | Divide; throws `RuntimeError` on divide-by-zero. |
| `%` | percent | Modulo; throws on modulo-by-zero. |
| `==` | eq | Strict equality (no type coercion). |
| `!=` | neq | Strict inequality. |
| `<` `>` `<=` `>=` | comparison | Standard numeric/lexicographic compare. |
| `&&` | and | Logical AND, short-circuits, returns the actual operand (not coerced to bool). |
| `\|\|` | or | Logical OR, short-circuits, returns the actual operand. |
| `!` | not | Unary logical NOT. |
| `=` | assign | Used in `set` and `key=val` payloads. |
| `+=` `-=` `*=` `/=` `%=` | compound assign | `$x += y` desugars to `set $x = $x + y`. |
| `=>` | arrow | Separates `match` case from its body. |
| `{ }` | braces | Block delimiters. Required for all `if`/`loop`/`def`/`on` bodies. |
| `( )` | parens | Expression grouping. **Not** used for function calls. |
| `[ ]` | brackets | Array literal and index access (`$arr[0]`). |
| `,` | comma | Separator in arrays, objects, multi-case `match`. |
| `:` | colon | Separator in object literals; segment separator in event names (e.g. `app:launch`). |
| `;` | semicolon | **Statement separator**, not a comment. Use `#` for comments. |
| `.` | dot | Member access (`$obj.prop`); also used inside variable names (`$user.age` is one variable token). |
| `#` | hash | Line comment to end of line. |
| `$` | dollar | Variable prefix. `$name` is a variable; `$` alone is a literal dollar. |

### Precedence (high → low, all left-associative)

1. function calls
2. unary `-`, `!`
3. `*` `/` `%`
4. `+` `-` (binary)
5. `<` `>` `<=` `>=`
6. `==` `!=`
7. `&&`
8. `||`

---

## Statements

| Form | Meaning |
|---|---|
| `set $var = expr` | Assign. Creates the variable in the nearest scope that has it, else the current scope. |
| `$var = expr` | Same as `set`. |
| `$var += expr` (and `-=`, `*=`, `/=`, `%=`) | Compound assignment. |
| `if cond [then] { … } [else if cond { … }] [else { … }]` | Conditional. Braces mandatory. |
| `match expr { val [, val] => { … } [default => { … }] }` | Strict-equality multi-branch. |
| `loop count { … }` | Bounded loop, sets `$i` to 0…count-1. Count clamped to safety limit. |
| `loop while cond { … }` | Pre-test loop. Sugar for `while`. |
| `while cond { … }` | Pre-test loop. Iteration cap 100 000. |
| `foreach $x in $coll { … }` | Iterate array values or object keys. Sets `$i` to iteration index. |
| `foreach $k, $v in $coll { … }` | Iterate `[key, value]` pairs (array: index, value; object: key, value). |
| `for $x in $coll { … }` | Alias for `foreach`. |
| `break` | Exit nearest loop. |
| `continue` | Skip to next iteration of nearest loop. |
| `def name($p1, $p2, ...) { … }` | Define a user function (`func` / `function` are aliases). |
| `return [expr]` | Return from a function. |
| `call name arg1 arg2 …` | Call a function — **as a statement** (return value discarded). |
| `set $r = call name a b` | Call a function — **in an expression**. |
| `try { … } catch [$e] { … }` | Wrap throwing code. `$error` (or your name) bound to caught error message. |
| `on event:name { … }` | Persistent event handler. State is restored between invocations. |
| `emit event:name k1=v1 k2=v2` | Fire an event with payload. Payload values are expressions. |
| `print expr` / `print unquoted text` | Output. First-token rule: starts with quoted string → expression mode; else unquoted text with `$var` interpolation. |
| `log expr` | Alias for `print`. |
| `read path [into $var]` | Read a file into a variable. Default `$result`. |
| `write content to path` | Write a file. Content stringified. |
| `mkdir path` | Create directory. |
| `delete path` / `rm path` | Delete file or directory. |
| `alert msg` | Non-blocking alert dialog. |
| `confirm msg [into $var]` | Blocking. Default `$confirmed`. |
| `prompt msg [default val] [into $var]` | Blocking input. Default `$input`. |
| `notify msg` | Non-blocking toast. |
| `launch appId [with k=v ...]` | Open an app. `open` is an alias. |
| `close [target]` | Close window (active if no target). |
| `focus target` / `minimize target` / `maximize target` | Window controls. |
| `wait ms` / `sleep ms` | Pause execution. Max 30 000 ms. |
| `play source [vol=n] [loop=bool] [force=bool]` | Play named sound or audio file. |
| `stop [source]` | Stop audio. Stops all if no source. |
| `video source [vol=n] [loop=bool] [fullscreen=bool]` | Play video cue. |

### Per-statement notes

- **`print` two-mode parsing.** If the first token after `print` is a
  quoted string, the rest of the line parses as an expression (so `+`
  performs concatenation). Otherwise the rest of the line is read as
  unquoted text with `$variable` interpolation — *no* arithmetic. Force
  expression mode for numeric output with `print "" + $value` or assign
  first.
- **`emit` payload keys.** Keys can be identifiers *or* keywords (so
  `emit timer:set interval=5000 repeat=true` is valid even though `repeat`
  is a reserved keyword).
- **`on` handlers.** Run in isolated interpreter state — `break`,
  `continue`, and `return` inside a handler don't affect the outer
  script, and variables modified inside a handler don't propagate up.
  Use `setStorage` or shared filesystem files if you need to persist.

---

## Built-in Functions

Call with `call <name> arg1 arg2 …` (space-separated, no parentheses).
All builtins are listed below, grouped by source module.

### Math

| Signature | Behavior |
|---|---|
| `abs(x)` | Absolute value. |
| `round(x)` | Round to nearest integer. |
| `floor(x)` | Round toward -∞. |
| `ceil(x)` | Round toward +∞. |
| `sqrt(x)` | Square root. |
| `pow(x, y)` | `x` to the power `y`. |
| `mod(x, y)` | `x % y`. |
| `sign(x)` | -1, 0, or 1. |
| `min(...args)` | Minimum; flattens array args. |
| `max(...args)` | Maximum; flattens array args. |
| `clamp(value, lo, hi)` | Constrain to `[lo, hi]`. |
| `random(lo, hi)` | Integer in `[lo, hi]` inclusive. |
| `sin(x)` `cos(x)` `tan(x)` | Trigonometry (radians). |
| `asin(x)` `acos(x)` `atan(x)` `atan2(y, x)` | Inverse trig. |
| `exp(x)` `log(x)` `log10(x)` `log2(x)` | Exponential / logarithm. |
| `PI()` | `Math.PI`. |
| `E()` | `Math.E`. |

### String

| Signature | Behavior |
|---|---|
| `upper(s)` `lower(s)` | Case conversion. |
| `trim(s)` `trimStart(s)` `trimEnd(s)` | Whitespace trim. |
| `length(s)` | String or array length. (Also see `count`.) |
| `charAt(s, i)` | Character at index. |
| `charCode(s, [i])` | Character code at index (default 0). |
| `fromCharCode(...codes)` | Build a string from codes. |
| `concat(...parts)` | Join strings; capped by string-length safety limit. |
| `substr(s, start, length)` | Substring by length. |
| `substring(s, start, end)` | Substring by indices. |
| `slice(s, start, [end])` | Works on strings and arrays. |
| `indexOf(s, search, [fromIndex])` | First occurrence index or -1. |
| `lastIndexOf(s, search, [fromIndex])` | Last occurrence index or -1. |
| `contains(s, search)` | `true` if found. |
| `startsWith(s, prefix)` `endsWith(s, suffix)` | Boolean. |
| `replace(s, search, replacement)` | First occurrence only. |
| `replaceAll(s, search, replacement)` | All occurrences. |
| `split(s, sep)` | Split into array. |
| `join(arr, sep)` | Join array into string. |
| `padStart(s, len, pad)` `padEnd(s, len, pad)` | Pad to length. |
| `repeat(s, n)` | Repeat. Capped at 10 000 repeats. |
| `reverse(value)` | Reverses strings or arrays. |

### Array

> **Note:** `push`, `pop`, `shift`, `unshift` **mutate the array in place**
> and additionally return it (or, for `pop`/`shift`, the removed element).
> Sort/unique/flatten and the `*By` family return new arrays.

| Signature | Behavior |
|---|---|
| `count(value)` | Length of array / object keys / string. |
| `first(arr)` | First element or `null`. |
| `last(arr)` | Last element or `null`. |
| `at(arr, i)` | Element at index. |
| `push(arr, ...items)` | Mutates `arr`; capped at MAX_ARRAY_LENGTH. |
| `pop(arr)` | Mutates; returns removed last element or `null`. |
| `shift(arr)` | Mutates; returns removed first element or `null`. |
| `unshift(arr, ...items)` | Mutates; capped. |
| `includes(arr, item)` | Equality match. |
| `findIndex(arr, item)` | Index of equality match or -1. |
| `find(arr, value)` | First strict-equal element or `null`. |
| `sort(arr)` | Ascending. Numbers sorted numerically, else string compare. New array. |
| `sortDesc(arr)` | Descending. New array. |
| `unique(arr)` | De-dupe via `Set`. New array. |
| `flatten(arr, [depth=1])` | Depth ≤ 100; result capped. |
| `range(start, end, [step=1])` | `[start, …, end)`; capped. |
| `fill(count, value)` | Array of `value` × `count`; capped. |
| `sum(arr)` `avg(arr)` `product(arr)` | Numeric aggregation. |
| `filter(arr, value)` | New array of elements equal to `value`. |
| `reject(arr, value)` | New array of elements **not** equal. |
| `map(arr, op)` | `op` ∈ `"double" \| "square" \| "string" \| "number" \| "boolean"`. (Simple ops; callback-style mapping requires a regular `foreach`.) |
| `splice(arr, start, deleteCount, ...items)` | New array, immutable copy. |
| `arrayConcat(...arrs)` | Concatenate arrays. |
| `mapBy(arr, path)` | Extract property by dot-path. |
| `filterBy(arr, path, value)` | Keep objects where `obj.path == value`. |
| `sortBy(arr, path)` | Ascending sort by property. |
| `sortByDesc(arr, path)` | Descending sort by property. |
| `findBy(arr, path, value)` | First object whose property equals value. |
| `groupBy(arr, path)` | Object: `{ groupKey: [items] }`. |

### Object

> **Prototype-pollution guard.** `__proto__`, `constructor`, and `prototype`
> are rejected at any depth.

| Signature | Behavior |
|---|---|
| `keys(obj)` | Array of own keys. |
| `values(obj)` | Array of values. |
| `entries(obj)` | `[[key, value], ...]`. |
| `get(obj, key, [default])` | Property value or default. |
| `set(obj, key, value)` | Set property in place. |
| `has(obj, key)` | Existence test. |
| `delete(obj, key)` | Remove property in place. |
| `merge(...objects)` | Shallow merge into new object. |
| `clone(obj)` | Deep clone via JSON round-trip. |
| `freeze(obj)` | `Object.freeze` and return. |
| `getPath(obj, "a.b.c", [default])` | Dotted-path read. |
| `setPath(obj, "a.b.c", value)` | Dotted-path write; returns new object. |

### Type

| Signature | Behavior |
|---|---|
| `typeof(v)` | One of `"number"`, `"string"`, `"boolean"`, `"array"`, `"object"`, `"null"`, `"undefined"`. |
| `isNumber(v)` `isString(v)` `isBoolean(v)` `isArray(v)` `isObject(v)` `isNull(v)` `isUndefined(v)` | Type checks. `isObject` is true only for plain objects (not arrays, not null). |
| `isNaN(v)` `isFinite(v)` `isInteger(v)` | Numeric predicates. |
| `isEmpty(v)` | True for `null`, `undefined`, `""`, `[]`, `{}`. |
| `isNotEmpty(v)` | Logical inverse. |
| `toNumber(v)` `toInt(v)` `toFloat(v)` | NaN-safe (NaN → 0). |
| `toString(v)` | Object → JSON. |
| `toBoolean(v)` | Strings `"true"`, `"1"`, `"yes"` → `true`; others coerce via JS truthiness. |
| `toArray(v)` | String → chars, object → values, other → `[v]`. |
| `toObject(v)` | Array → `{0: …, 1: …}`; other → `{value: v}`. |
| `default(v, fallback)` | `v` unless `v` is null/undefined. |
| `coalesce(...values)` | First non-null/undefined. |

### Time

| Signature | Behavior |
|---|---|
| `now()` | Epoch ms. |
| `timestamp()` | Epoch s. |
| `time()` `date()` `datetime()` | Locale-formatted strings. |
| `year(ts?)` `month(ts?)` `day(ts?)` | 1-based month/day. |
| `weekday(ts?)` | 0=Sun … 6=Sat. |
| `weekdayName(ts?)` | Localized day name. |
| `hour(ts?)` `minute(ts?)` `second(ts?)` `millisecond(ts?)` | Time parts. |
| `elapsed(start)` | Ms since `start`. |
| `addDays(ts, n)` `addHours(ts, n)` `addMinutes(ts, n)` `addSeconds(ts, n)` | Arithmetic. |
| `formatDate(ts, fmt)` | Default `"YYYY-MM-DD"`. Tokens: `YYYY`, `MM`, `DD`. |
| `formatTime(ts, fmt)` | Default `"HH:mm:ss"`. Tokens: `HH`, `mm`, `ss`. |
| `parseDate(str)` | → Epoch ms, or `null`. |
| `toISO(ts)` | ISO-8601. |

### JSON

| Signature | Behavior |
|---|---|
| `toJSON(v)` | `JSON.stringify`; `null` on cyclic / failure. |
| `prettyJSON(v, [indent=2])` | Formatted JSON. |
| `fromJSON(s)` | `JSON.parse`; `null` on failure. |
| `parseJSON(s)` | Alias for `fromJSON`. |
| `isValidJSON(s)` | Boolean. |

### System

| Signature | Behavior |
|---|---|
| `sleep(ms)` `wait(ms)` | Async pause; max 30 000 ms. |
| `getFocusedWindow()` | `{id, title, minimized, maximized}` or `null`. |
| `getWindows()` | Array of `{id, appId, title, minimized, maximized}`. |
| `getApps()` | Array of `{id, name, category}` for registered apps. |
| `getEnv()` | `{platform, version, language, timestamp}`. |
| `emitEvent(name, payload?)` | `EventBus.emit(name, payload)`. |
| `exec(command, payload?)` | `EventBus.executeCommand(command, payload)`. Returns the command's return value or `null`. |
| The `query` statement form (`query <name> ...`) routes through `EventBus.executeCommand` to the `query:*` handlers registered in `core/CommandRegistry.js`. See [Query Bus Channels](#query-bus-channels). |
| `copyToClipboard(text)` | `navigator.clipboard.writeText`; returns boolean. |
| `getStorage(key)` `setStorage(key, value)` | StorageManager passthrough. |

### Dialog

These are **expression-form** builtins, distinct from the `alert` /
`confirm` / `prompt` statements. Use the function form when you need to
inline the result into a larger expression.

| Signature | Behavior |
|---|---|
| `alert(msg)` | Show alert; returns `null`. |
| `confirm(msg)` | Promise resolving to user choice (or `true` in autoexec headless mode). |
| `prompt(msg, [default])` | Promise resolving to input (or default in autoexec). |
| `validateInput(input, type)` | `type` ∈ `"number" \| "email" \| "url" \| "nonempty" \| "text"`. |

### Debug

| Signature | Behavior |
|---|---|
| `debug(...args)` | `console.log` with `[RetroScript Debug]` prefix. |
| `inspect(v)` | Formatted type/representation string. |
| `trace(...args)` | Like `debug` plus ISO timestamp. |
| `assert(cond, [msg])` | Throws `RuntimeError` on falsy. |
| `assertEqual(a, b, [msg])` | Deep equal via JSON. |
| `assertType(v, expectedType, [msg])` | Type guard. |
| `getCallStack()` | Array of current function names. |
| `dumpVars()` | Object of current variable bindings. |
| `timeStart([label])` `timeEnd([label])` | Pair to measure elapsed ms; logs result. |

### Terminal

All require the terminal app to be runnable. Most are no-ops when no
terminal window is open — open it first via `terminalOpen` or `launch
terminal`.

| Signature | Behavior |
|---|---|
| `terminalOpen([initialCommand])` | Open (or focus existing) and optionally run a command. |
| `terminalFocus()` `terminalMinimize()` `terminalClose()` | Window controls. |
| `isTerminalOpen()` | Boolean. |
| `terminalExecute(cmd)` | Returns `{success, output, path}`. |
| `terminalExecuteSequence(cmds[])` | Returns `{success, outputs[]}`. |
| `terminalPrint(text, [color])` | Color is a CSS color or named color. |
| `terminalPrintHtml(html)` | Sanitized HTML output. |
| `terminalClear()` | Clear screen. |
| `terminalCd(path)` | Change directory. Returns `{success, path}`. |
| `terminalGetPath()` | Current working directory string. |
| `terminalDir([path])` | Directory listing. |
| `terminalReadFile(path)` `terminalWriteFile(path, content)` `terminalFileExists(path)` | File ops with terminal-cwd resolution. |
| `terminalGetOutput()` | Last command output. |
| `terminalGetAllOutput()` | Full session output. |
| `terminalGetHistory()` | Command history array. |
| `terminalGetState()` | `{currentPath, godMode, hasActiveProcess, historyCount, windowId}`. |
| `terminalGetEnvVar(name)` `terminalSetEnvVar(name, value)` `terminalGetEnvVars()` | Env vars. |
| `terminalAlias(name, command)` `terminalGetAliases()` | Aliases. |
| `terminalGodMode()` `terminalIsGodMode()` | God mode (Konami-unlocked). |
| `terminalMatrix()` | Matrix-rain effect. |
| `terminalCowsay(msg)` `terminalFortune()` | Toy commands. |
| `terminalRunScript(path)` | Execute a `.retro` file from inside the terminal. |

### Media

| Signature | Behavior |
|---|---|
| `playMusic(source, [opts])` | Opts: `volume`, `loop`. |
| `stopMusic([source])` | Stop one or all. |
| `playVideo(source, [opts])` | Opts: `volume`, `loop`, `fullscreen`. |
| `stopVideo()` | Stop video. |
| `listMusic()` `listVideos()` `listMedia()` | Asset listings. |
| `setVolume(level)` | Master volume `0-100`. |
| `playSound(type, [opts])` | System sounds (`click`, `notify`, `error`, …). |
| `openMediaPlayer()` | Launch the MediaPlayer app. |

### Multimedia

Phase-2 cue system. Returns cue IDs you can later target.

#### `audio.*`

| Signature | Behavior |
|---|---|
| `audio.play(source, [opts])` | Opts: `{cueId?, group?, volume?, loop?, fadeInMs?, priority?}`. Returns cue id (string) or `false`. |
| `audio.stop([cueId])` | Stop one or all. |
| `audio.duck(group, level, durationMs)` | Reduce a group's volume temporarily. |
| `audio.restore(group)` | Cancel an active duck. |
| `audio.isPlaying(cueId)` | Boolean. |
| `audio.activeCues()` | Array of active cue descriptors. |

#### `video.*`

| Signature | Behavior |
|---|---|
| `video.play(source, [opts])` | Returns cue id. Opts: `{cueId, volume, loop, fullscreen}`. |
| `video.stop(cueId)` `video.pause(cueId)` | Control. |
| `video.seek(cueId, positionMs)` | Seek. |

#### `image.*`

| Signature | Behavior |
|---|---|
| `image.show(layerId, source, [opts])` | Opts: `{opacity, fadeInMs, fadeOutMs, blend}`. |
| `image.clear([layerId])` | Clear one or all layers. |

#### `subtitle.*`

| Signature | Behavior |
|---|---|
| `subtitle.show(trackId, text, [opts])` | Opts: `{durationMs, style, position}`. |
| `subtitle.clear([trackId])` | Clear track. |

#### `fx.*`

| Signature | Behavior |
|---|---|
| `fx.apply(presetId, [opts])` | Presets: `screen-shake`, `glitch`, `flash`, `vignette`, `scanlines`, `static`, `chromatic`. |
| `fx.clear([presetId])` | Clear one or all. |

#### `media.*`

| Signature | Behavior |
|---|---|
| `media.preload(assetId, [opts])` | Pre-warm an asset. |
| `media.resolve(assetId)` | Returns the asset definition. |
| `media.budget()` | Current concurrent-cue budget state. |
| `media.stopAll()` | Stop everything. |

### Messaging

| Signature | Behavior |
|---|---|
| `inbox.send(from, subject, body, [opts])` | `opts.attachments[]`, `opts.priority`. Emits `command:inbox:receive`. |
| `inbox.sendTemplate(templateId, [vars])` | Deliver a registered template. |
| `im.npcSend(npcId, message, [opts])` | `opts.displayName`, `opts.avatar`. |
| `im.npcTyping(npcId, [durationMs=3000])` | Show typing indicator. |
| `im.sendTemplate(templateId, [vars])` | Template-driven IM. |
| `phone.callScript(routeId, callerId, [script[]])` | Trigger incoming call with branching script. |
| `phone.voicemail(from, message, [audioSrc])` | Deposit a voicemail. |
| `browser.inject(pageId, fragmentId, html)` | Inject HTML into the in-OS browser. |
| `browser.navigate(url)` | Navigate the in-OS browser. |
| `content.deliver(templateId, [vars])` | Deliver any registered template. |
| `content.register(templateDef)` | Register a new template at runtime. |
| `content.schedule(templateId, [vars], trigger)` | Schedule delivery on a trigger. |
| `content.history([limit=50])` | Recent deliveries. |
| `content.list([channel])` | List templates. |

### Narrative

> All narrative builtins are no-ops returning `false` / `null` if no
> `NarrativeStateManager` is in the engine context (e.g. plain Script
> Runner without campaign setup). All mutating helpers emit `story:*`
> events.

| Signature | Behavior |
|---|---|
| `story.start(campaignId)` | Begin a campaign. |
| `story.end(campaignId, [endingId])` | End a campaign with optional ending tag. |
| `story.current()` | Current campaign id or `null`. |
| `story.reset()` | Wipe all narrative state. |
| `story.snapshot()` | Serializable full state snapshot. |
| `story.import(snapshot)` | Restore a snapshot. |
| `scene.enter(sceneId)` | Enter scene. Emits previous-scene `exit`. |
| `scene.complete(sceneId)` | Mark complete. |
| `scene.canEnter(sceneId)` | Boolean guard check. |
| `scene.block(sceneId, [reason])` | Block entry. |
| `scene.unblock(sceneId)` | Lift block. |
| `scene.current()` | Current scene id or `null`. |
| `scene.get(sceneId)` | Scene state object. |
| `objective.add(id, text, [meta])` | Add objective. |
| `objective.complete(id)` `objective.fail(id)` | Mark state. |
| `objective.get(id)` | State object. |
| `objective.list([status])` | All objectives, optionally filtered. |
| `flag.set(key, value)` | Set arbitrary flag. |
| `flag.get(key, [default])` | Read; default if missing. |
| `flag.has(key)` | Boolean. |
| `flag.delete(key)` | Remove. |
| `flag.all()` | All flags as `{key: value}`. |
| `clue.add(id, [tags])` | Add clue. `tags` is a string or array of strings. |
| `clue.has(id)` | Discovered? |
| `clue.get(id)` | State object. |
| `clue.list([tag])` | All clues, optionally filtered by tag. |
| `clue.reveal(id)` | Mark revealed; emits UI event. |
| `mood.set(presetId)` | Activate a mood preset. |
| `mood.transition(from, to, durationMs)` | Crossfade between presets. |
| `mood.current()` | Active preset or `null`. |
| `npc.setState(npcId, key, value)` | Per-NPC state. |
| `npc.getState(npcId, key, [default])` | Read NPC state value. |
| `npc.get(npcId)` | Full NPC state object. |

### Telemetry and Analytics

| Signature | Behavior |
|---|---|
| `telemetry.checkpoint(id, [meta])` | Record a campaign checkpoint. |
| `telemetry.puzzleAttempt(puzzleId, success, [hintUsed])` | Record attempt. |
| `telemetry.dropoff([reason])` | Player abandoned. |
| `telemetry.setSampling(namespace, rate)` | Rate ∈ `[0, 1]`. |
| `telemetry.reset()` | Wipe telemetry state. |
| `analytics.sceneDwellTimes()` | Per-scene dwell ms. |
| `analytics.sceneFunnel()` | Scene progression funnel. |
| `analytics.objectiveFunnel()` | Objective funnel. |
| `analytics.puzzleAttempts()` | Per-puzzle attempt summaries. |
| `analytics.mediaEngagement()` | Media usage stats. |
| `analytics.checkpoints()` | Checkpoint listing. |
| `analytics.query(filter)` | Filtered query. |
| `analytics.exportSnapshot()` | Full snapshot for offline analysis. |
| `analytics.bufferSize()` | Event-buffer length. |
| `replay.load(snapshot)` | Load a replay. |
| `replay.play([speed=1])` `replay.pause()` `replay.stop()` `replay.step()` | Control. |
| `replay.seek(position)` | Seek to position. |
| `replay.setSpeed(speed)` | Set playback speed. |
| `replay.state()` | Replay state object. |
| `replay.divergences()` | Where the replay diverged from expectation. |
| `replay.setExpectedBranch(scenes[])` | Set the expected scene path. |

---

## Magic Variables

Set automatically by the interpreter; do not assign them yourself unless
you have read the gotcha first.

| Variable | Where it appears | Value |
|---|---|---|
| `$i` | Inside any `loop` / `while` / `foreach` body | Iteration index (0-based). In nested loops the inner `$i` shadows the outer. Do not name a `foreach` loop variable `$i` — it gets clobbered. |
| `$event` | Inside `on …` handlers | The payload of the event being handled. |
| `$result` | After `read path` with no `into` | File contents. |
| `$confirmed` | After `confirm msg` with no `into` | `true` / `false`. |
| `$input` | After `prompt msg` with no `into` | User-entered string. |
| `$AUTOEXEC` | Inside an autoexec context | Truthy when the script is running through the autoexec loader; absent or falsy when run from Script Runner / Terminal. |
| `$error` | Inside a `catch { }` block with no explicit variable | The caught error message. |

---

## System Events

The most useful schema-validated event names you can `on`-subscribe to.
The full encyclopedic catalog (every namespace, every payload field) is
in [`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../RETROSCRIPT_SCRIPTABLE_EVENTS.md);
this list highlights the ones you'll reach for most often.

### Window / app lifecycle

| Event | Payload |
|---|---|
| `window:open` | `{id, title, appId?}` |
| `window:close` | `{id, appId?}` |
| `window:focus` | `{id, previousId?}` |
| `window:minimize` | `{id}` |
| `window:maximize` | `{id, maximized}` |
| `window:resize` | `{id, width, height, isResizing}` |
| `app:launch` | `{appId, params?}` |
| `app:open` | `{appId, windowId}` |
| `app:ready` | `{appId, windowId}` |
| `app:close` | `{appId, windowId}` |
| `app:focus` | `{appId, windowId}` |
| `app:blur` | `{appId, windowId}` |
| `app:error` | `{appId, windowId, error}` |
| `app:state:change` | `{appId, windowId, key, value}` |

### System

| Event | Payload |
|---|---|
| `system:boot` | — |
| `system:ready` | — |
| `system:idle` | — |
| `system:active` | — |
| `system:sleep` | — (tab hidden) |
| `system:wake` | — (tab visible) |
| `system:online` | — |
| `system:offline` | — |
| `bsod:show` | — |

### Filesystem

| Event | Payload |
|---|---|
| `fs:file:create` | `{path}` |
| `fs:file:read` | `{path}` |
| `fs:file:update` | `{path}` |
| `fs:file:delete` | `{path}` |
| `fs:file:rename` | `{path, oldPath, newPath}` |
| `fs:file:move` | `{source, destination}` |
| `fs:file:copy` | `{source, destination}` |
| `fs:directory:create` | `{path}` |
| `fs:directory:delete` | `{path}` |
| `filesystem:changed` | — |

### Script execution

| Event | Payload |
|---|---|
| `script:start` | — |
| `script:complete` | `{success, result}` |
| `script:error` | `{error}` |
| `script:output` | `{message}` |

### Input

| Event | Payload |
|---|---|
| `keyboard:keydown` | `{key, code, ctrlKey, shiftKey, altKey}` |
| `keyboard:combo` | `{combo}` |
| `mouse:click` | `{x, y, button}` |
| `mouse:dblclick` | `{x, y}` |

### UI / desktop

| Event | Payload |
|---|---|
| `ui:menu:start:open` | — |
| `ui:menu:start:close` | — |
| `ui:taskbar:update` | — |
| `desktop:refresh` | — |
| `desktop:bg-change` | — |

### Dialogs / notifications

| Event | Payload |
|---|---|
| `dialog:alert` | `{message}` |
| `dialog:confirm` | `{message, requestId}` |
| `dialog:prompt` | `{message, default, requestId}` |
| `notification:show` | `{message, icon?, timeout?}` |
| `notification:dismiss` | — |

### Sound / audio

| Event | Payload |
|---|---|
| `sound:play` | `{type, volume?, loop?, force?}` |
| `audio:play` | `{src, volume?, loop?, force?}` |
| `audio:pause` | — |
| `audio:stop` | `{src?}` |
| `audio:stopall` | — |
| `audio:ended` | — |

### Features / plugins / achievements

| Event | Payload |
|---|---|
| `feature:registered` | `{featureId, name}` |
| `feature:enabled` | `{featureId}` |
| `feature:disabled` | `{featureId}` |
| `features:initialized` | — |
| `achievement:unlock` | `{id}` |

### Session

| Event | Payload |
|---|---|
| `user:login` | `{user}` |
| `user:logout` | — |
| `user:switch` | `{previous, current}` |
| `auth:expired` | — |

### Narrative

| Event | Payload |
|---|---|
| `story:start` | `{campaignId}` |
| `story:end` | `{campaignId, endingId?}` |
| `story:scene:enter` | `{sceneId, previousSceneId?}` |
| `story:scene:exit` | `{sceneId}` |
| `story:scene:complete` | `{sceneId}` |
| `story:scene:block` | `{sceneId, reason}` |
| `story:objective:add` | `{id, text}` |
| `story:objective:complete` | `{id}` |
| `story:objective:fail` | `{id}` |
| `story:flag:set` | `{key, value}` |
| `story:clue:add` | `{id, tags}` |
| `story:clue:revealed` | `{id}` |
| `story:mood:set` | `{presetId}` |
| `story:mood:transition` | `{fromPreset, toPreset, durationMs}` |
| `story:npc:state:change` | `{npcId, key, value}` |

### Multimedia cues

| Event | Payload |
|---|---|
| `media:audio:play` | `{cueId, src, group, volume, loop}` |
| `media:audio:stop` | `{cueId?}` |
| `media:audio:duck` | `{group, level, durationMs}` |
| `media:video:play` | `{cueId, src, ...}` |
| `media:image:show` | `{layerId, src, opts}` |
| `media:subtitle:show` | `{trackId, text, opts}` |
| `media:fx:apply` | `{presetId, opts}` |
| `media:budget:exceeded` | `{metric, current, limit, rejected}` |

### Autoexec

| Event | Payload |
|---|---|
| `autoexec:start` | — |
| `autoexec:complete` | — |
| `autoexec:error` | `{error}` |

---

## Command Bus Channels

Invoke with either `emit command:foo:bar key=val` (fire-and-forget) or
`call exec "command:foo:bar" $payloadObject` (await the return value).

### App

| Command | Payload |
|---|---|
| `command:app:launch` | `{appId, params?}` |
| `command:app:close` | `{windowId}` |

### Window

| Command | Payload |
|---|---|
| `command:window:focus` | `{windowId}` |
| `command:window:minimize` | `{windowId}` |
| `command:window:maximize` | `{windowId}` |
| `command:window:restore` | `{windowId}` |
| `command:window:close` | `{windowId}` |

### Filesystem

| Command | Payload |
|---|---|
| `command:fs:read` | `{path}` |
| `command:fs:write` | `{path, content}` |
| `command:fs:delete` | `{path}` |
| `command:fs:mkdir` | `{path}` |
| `command:fs:copy` | `{source, destination}` |
| `command:fs:move` | `{source, destination}` |
| `command:fs:reset` | — |

### Dialog / notification

| Command | Payload |
|---|---|
| `command:dialog:show` | `{type, message, title?, options?}` |
| `command:notification:show` | `{message, icon?, timeout?}` |

### Terminal

| Command | Payload |
|---|---|
| `command:terminal:execute` | `{command, windowId?}` |
| `command:terminal:executeSequence` | `{commands[]}` |
| `command:terminal:print` | `{text, color?}` |
| `command:terminal:printHtml` | `{html}` |
| `command:terminal:clear` | — |
| `command:terminal:cd` | `{path}` |
| `command:terminal:getPath` | — |
| `command:terminal:getState` | — |
| `command:terminal:getHistory` | — |
| `command:terminal:getOutput` | — |
| `command:terminal:setEnvVar` | `{name, value}` |
| `command:terminal:getEnvVar` | `{name}` |
| `command:terminal:getEnvVars` | — |
| `command:terminal:createAlias` | `{name, command}` |
| `command:terminal:getAliases` | — |
| `command:terminal:enableGodMode` | — |
| `command:terminal:startMatrix` | — |
| `command:terminal:runScript` | `{scriptPath}` |
| `command:terminal:open` | `{initialCommand?}` |
| `command:terminal:focus` | — |
| `command:terminal:isOpen` | — |

### System / settings / sound / achievements

| Command | Payload |
|---|---|
| `command:sound:play` | `{type, force?}` |
| `command:setting:set` | `{key, value}` |
| `command:desktop:refresh` | — |
| `command:achievement:unlock` | `{achievementId}` |

### Per-app baseline (every app)

Every app registered with `AppBase.registerCoreScriptApi()` auto-exposes:

| Command | Payload |
|---|---|
| `command:<appId>:core.focus` | `{windowId?}` |
| `command:<appId>:core.minimize` | `{windowId?}` |
| `command:<appId>:core.maximize` | `{windowId?}` |
| `command:<appId>:core.restore` | `{windowId?}` |
| `command:<appId>:core.close` | `{windowId?}` |
| `command:<appId>:core.setState` | `{windowId, key, value}` |
| `command:<appId>:core.emitCue` | `{windowId, cue, data}` |

Apps additionally register app-specific commands (`command:notepad:setText`,
`command:calculator:setExpression`, etc.). See the per-app pages of
[`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../RETROSCRIPT_SCRIPTABLE_EVENTS.md)
or section 21–27 of
[`/SCRIPTING_GUIDE.md`](../../SCRIPTING_GUIDE.md).

---

## Query Bus Channels

Use via the `query` builtin: `set $r = call query "name" arg1 arg2`.

| Query | Returns |
|---|---|
| `windows` | Array of open windows. |
| `apps` | Array of registered apps. |
| `fs:list path` | Directory listing. |
| `fs:read path` | File contents. |
| `fs:exists path` | Boolean. |
| `fs:tree` | Full VFS tree. |
| `fs:desktop` | Desktop items. |
| `settings [key]` | Settings (all or by key). |
| `state path` | State value at path. |

Per-app queries follow `query:<appId>:core.window`,
`query:<appId>:core.state`, `query:<appId>:core.capabilities` and
app-specific reads (see app docs).

---

## Safety Limits

Configured in `core/script/utils/SafetyLimits.js`. When exceeded, the
script throws and stops. `TimeoutError` and `RecursionError` **cannot** be
caught by `try / catch`.

| Limit | Default | Scope |
|---|---|---|
| Max execution time | 30 000 ms (10 000 ms for autoexec) | Per `run()` invocation. |
| Max loop iterations (`while`) | 100 000 | Per loop. |
| Max recursion depth | 1 000 | Function nesting. |
| Max call stack size | 100 | For error messages. |
| Max event handlers | 1 000 | Per interpreter. |
| Max string length | 1 000 000 | Concat / pad / repeat clamps. |
| Max array length | 100 000 | Push / unshift / range / fill clamps. |
| Max object keys | 10 000 | Object-builder cap. |
| Max wait duration | 30 000 ms | `wait` / `sleep`. |

---

## Error Classes

```
ScriptError                       common: {message, line, column, source, hint}
├── ParseError                    raised during lexing/parsing
└── RuntimeError                  raised during execution; adds {callStack}
    ├── TimeoutError              {timeout}, NOT catchable
    ├── RecursionError            {maxDepth, functionName}, NOT catchable
    ├── ScriptTypeError           {expected, received}
    └── ScriptReferenceError      {identifier}
```

---

## App IDs

Canonical `<appId>` values for `launch <appId>` and `command:<appId>:*`.
Pulled from each app's `super({id: ...})` declaration; 42 apps total.

```
calculator, notepad, paint, calendar, clock, hypercard,
terminal, defrag, taskmgr, scriptrunner, campaign-studio,
timeline-editor, showrunner-console, analytics-dashboard,
minesweeper, snake, asteroids, doom, solitaire, freecell,
skifree, zork, tetris, dosbox,
mediaplayer,
browser, chatroom, phone, instantmessenger, inbox, gamelobby,
bonzibuddy,
mycomputer, recyclebin, adminpanel,
controlpanel, display, sounds, features-settings,
find, help, run
```

---

## Reserved Filesystem Paths

Validated by `core/script/utils/PathValidation.js` for `read` / `write` /
`mkdir` / `delete` and the `command:fs:*` channel.

### Allowed prefixes

```
C:/Users/User/Desktop/
C:/Users/User/Documents/
C:/Users/User/Pictures/
C:/Users/User/Music/
C:/Users/User/Videos/
C:/Users/User/Projects/
C:/Users/User/Secret/
C:/Windows/
C:/Windows/System32/
C:/server/        (also /C/server/)
C:/shared/        (also /C/shared/)
C:/public/        (also /C/public/)
```

### Forbidden

- Anything outside the allowed prefixes.
- Any path containing `..` segments (no traversal).
- Any path containing control characters (`0x00`–`0x1F`).
- Anything that is not a non-empty string.

Errors thrown from `validateScriptPath` are `RuntimeError`s with a `line`
number from the offending statement.

---

## See also

- [GUIDE.md](GUIDE.md) — concept-first guide
- [tutorials/](tutorials/) — step-by-step walk-throughs
- [`/SCRIPTING_GUIDE.md`](../../SCRIPTING_GUIDE.md) — long-form reference
- [`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../RETROSCRIPT_SCRIPTABLE_EVENTS.md) — exhaustive event/command catalog
- [`docs/TERMINAL_SCRIPTING.md`](../TERMINAL_SCRIPTING.md) — terminal builtins
