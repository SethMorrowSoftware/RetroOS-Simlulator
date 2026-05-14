# RetroScript Language Guide

RetroScript is IlluminatOS's built-in scripting language for automation, interactive experiences, and ARG content delivery. Scripts are `.retro` files executed through a pipeline of Lexer, Parser, and Interpreter.

> **Looking for something else?** This file is the dense top-level
> reference. For a learning-oriented tour of the language, the
> alphabetical dictionary, and ten step-by-step tutorials, see
> [`docs/retroscript/`](docs/retroscript/README.md):
> - [`docs/retroscript/GUIDE.md`](docs/retroscript/GUIDE.md) — concept-first comprehensive guide
> - [`docs/retroscript/DICTIONARY.md`](docs/retroscript/DICTIONARY.md) — alphabetical lookup of every name in the language
> - [`docs/retroscript/tutorials/`](docs/retroscript/tutorials/README.md) — ten progressive tutorials, ending in a full mini-ARG campaign

> **Verifying this guide.** The syntax forms shown here are exercised by the `scripts/test-retroscript.sh` harness, which parses and executes a representative sample of every documented feature against the real lexer/parser/interpreter. Run it after any engine change:
> ```bash
> bash scripts/test-retroscript.sh
> ```
> See [§19 Gotchas](#19-gotchas-and-common-mistakes) for the small number of places where the implementation differs from the documented surface.

## Table of Contents

### Part I: RetroScript Language

1. [Running Scripts](#1-running-scripts)
2. [Comments](#2-comments)
3. [Variables](#3-variables)
4. [Data Types](#4-data-types)
5. [Operators](#5-operators)
6. [Control Flow](#6-control-flow)
7. [Functions](#7-functions)
8. [Events](#8-events)
9. [Strings and Text Output](#9-strings-and-text-output)
10. [File System](#10-file-system)
11. [App and Window Control](#11-app-and-window-control)
12. [Dialogs and Notifications](#12-dialogs-and-notifications)
13. [Audio and Video](#13-audio-and-video)
14. [Error Handling](#14-error-handling)
15. [Built-in Function Reference](#15-built-in-function-reference)
16. [Autoexec Scripts](#16-autoexec-scripts)
17. [Terminal Scripting Bridge](#17-terminal-scripting-bridge)
18. [Safety Limits](#18-safety-limits)
19. [Gotchas and Common Mistakes](#19-gotchas-and-common-mistakes)

### Part II: App Scripting System

20. [App Scripting Overview](#20-app-scripting-overview)
21. [Communication Apps](#21-communication-apps) — Inbox, Phone, Instant Messenger, Chat Room
22. [Productivity Apps](#22-productivity-apps) — Browser, Calculator, Notepad, Paint
23. [Media & Entertainment](#23-media--entertainment) — Media Player (audio + video)
24. [Games](#24-games) — Minesweeper, Snake, Solitaire, FreeCell, Asteroids, SkiFree, Zork, Doom
25. [System Utilities](#25-system-utilities) — Terminal, My Computer, Recycle Bin, Task Manager, Find Files, Help, Defrag, Run Dialog
26. [Settings & Configuration](#26-settings--configuration) — Control Panel, Display Properties, Sound Settings, Features Settings
27. [Admin & Special Apps](#27-admin--special-apps) — Admin Panel, Calendar, Clock, HyperCard

### Part III: System Reference

28. [System Events Reference](#28-system-events-reference)
29. [System Commands Reference](#29-system-commands-reference)
30. [ARG Development Patterns](#30-arg-development-patterns)

---

## 1) Running Scripts

Run `.retro` scripts via:

- **Script Runner app** - GUI script loader and executor
- **Terminal** - `retro <path>` command
- **Double-click** - Click `.retro` files in File Explorer or on the Desktop
- **Autoexec** - Automatic execution at boot (see [Section 16](#16-autoexec-scripts))

---

## 2) Comments

Comments start with `#` and run to the end of the line.

```retro
# This is a comment
print "hello" # inline comment
```

**IMPORTANT:** Semicolons (`;`) are **not** comments. The lexer tokenizes `;` as a statement separator. Using `;` as a comment prefix will cause parse errors.

```retro
# Correct comment
; This is NOT a comment - it will cause errors!
```

---

## 3) Variables

Variables are always prefixed with `$`. Assign with `set` or bare assignment:

```retro
set $name = "Alice"
set $count = 42
$score = 100          # shorthand (no 'set' keyword)
```

Variable names can contain letters, digits, underscores, and dots (for nested access). The `$` prefix is required everywhere the variable is used. A bare `$` without a name is treated as a literal dollar sign, not a variable reference.

### Dot-Access in Variables

Variable references support dot notation for reading and writing nested properties:

```retro
set $user = { name: "Alice", age: 30 }
print $user.name     # prints: Alice
set $user.age = 31   # updates the nested property
```

The entire `$user.name` is a single variable token. The dot is part of the variable reference, not a separate operator. Dot-notation works across scopes — assigning to `$user.age` in a child scope correctly updates the parent scope's `$user` object.

### Scope

Variables follow lexical scoping. Each block (`if`, `loop`, `def`, `on`) creates a child scope:

- Child scopes can **read and modify** variables from parent scopes
- Variables created in a child scope do **not** leak into the parent

```retro
set $x = 1
if true {
  set $x = 2      # modifies parent's $x
  set $y = 99      # only exists inside this block
}
print $x           # prints: 2
# $y is not accessible here
```

---

## 4) Data Types

### Numbers

Integer and decimal numbers:

```retro
set $a = 42
set $b = 3.14
set $c = -7
```

### Strings

Delimited by double or single quotes. Strings can span multiple lines.

```retro
set $greeting = "Hello, world!"
set $alt = 'single quotes work too'
set $multi = "line one
line two"
```

#### Escape Sequences

| Escape | Result          |
|--------|-----------------|
| `\n`   | Newline         |
| `\t`   | Tab             |
| `\r`   | Carriage return |
| `\\`   | Backslash       |
| `\"`   | Double quote    |
| `\'`   | Single quote    |
| `\0`   | Null character  |

Unknown escapes like `\x` produce the literal character `x`.

#### String Interpolation

Inside string literals, `$variableName` is replaced with the variable's value at runtime:

```retro
set $name = "Alice"
print "Hello $name!"    # prints: Hello Alice!
```

If the variable is undefined, the `$name` text is left as-is.

### Booleans

```retro
set $active = true
set $done = false
```

### Null

```retro
set $empty = null
```

### Arrays

Square bracket syntax with comma-separated elements:

```retro
set $colors = ["red", "green", "blue"]
set $nums = [1, 2, 3]
set $mixed = [1, "two", true, null]
set $nested = [[1, 2], [3, 4]]
```

Access elements by index:

```retro
set $first = $colors[0]    # "red"
```

### Objects

Curly brace syntax with `key: value` pairs:

```retro
set $user = { name: "Alice", age: 30, active: true }
set $nested = { meta: { version: 1 }, tags: ["a", "b"] }
```

Keys can be identifiers or quoted strings. Access properties with dot notation:

```retro
print $user.name     # "Alice"
```

Or use the `get` built-in for dynamic access:

```retro
set $key = "name"
set $val = call get $user $key    # "Alice"
```

### Truthiness Rules

These values are **falsy**: `null`, `undefined`, `false`, `0`, `""` (empty string), `[]` (empty array).

Everything else is **truthy**, including objects and non-empty strings/arrays.

---

## 5) Operators

### Arithmetic

| Operator | Description    | Example         |
|----------|----------------|-----------------|
| `+`      | Add / concat   | `$a + $b`       |
| `-`      | Subtract       | `$a - $b`       |
| `*`      | Multiply       | `$a * $b`       |
| `/`      | Divide         | `$a / $b`       |
| `%`      | Modulo         | `$a % $b`       |

The `+` operator concatenates if **either** operand is a string:

```retro
print "Score: " + 42    # "Score: 42"
print 3 + 4             # 7
```

Division and modulo by zero throw a `RuntimeError`.

### Compound Assignment

| Operator | Equivalent To      | Example         |
|----------|--------------------|-----------------|
| `+=`     | `set $a = $a + b`  | `$score += 10`  |
| `-=`     | `set $a = $a - b`  | `$count -= 1`   |
| `*=`     | `set $a = $a * b`  | `$score *= 2`   |
| `/=`     | `set $a = $a / b`  | `$half /= 2`    |
| `%=`     | `set $a = $a % b`  | `$rem %= 3`     |

These are syntactic sugar — `$x += 5` is exactly the same as `set $x = $x + 5`.

### Comparison

| Operator | Description          | Example         |
|----------|----------------------|-----------------|
| `==`     | Equal                | `$a == $b`      |
| `!=`     | Not equal            | `$a != $b`      |
| `<`      | Less than            | `$a < $b`       |
| `>`      | Greater than         | `$a > $b`       |
| `<=`     | Less than or equal   | `$a <= $b`      |
| `>=`     | Greater than or equal| `$a >= $b`      |

Equality uses strict comparison (`===` / `!==` under the hood).

### Logical

| Operator | Description | Example           |
|----------|-------------|-------------------|
| `&&`     | Logical AND | `$a && $b`        |
| `\|\|`   | Logical OR  | `$a \|\| $b`      |
| `!`      | Logical NOT | `!$done`          |

**Short-circuit behavior:** `&&` and `||` return the actual value, not just `true`/`false`:

```retro
set $result = null || "default"    # "default"
set $val = "hello" && "world"      # "world"
```

### Unary

| Operator | Description | Example   |
|----------|-------------|-----------|
| `-`      | Negation    | `-$x`    |
| `!`      | Logical NOT | `!$flag` |

### Operator Precedence (lowest to highest)

1. `||` (logical OR)
2. `&&` (logical AND)
3. `==`, `!=` (equality)
4. `<`, `>`, `<=`, `>=` (comparison)
5. `+`, `-` (addition, subtraction)
6. `*`, `/`, `%` (multiplication, division, modulo)
7. `-`, `!` (unary negation, NOT)

Use parentheses to override precedence:

```retro
set $result = (1 + 2) * 3    # 9
```

---

## 6) Control Flow

### if / else / else if

```retro
if $score > 90 {
  print "Excellent!"
} else {
  print "Keep trying."
}
```

Chain conditions with `else if`:

```retro
if $phase == 1 {
  call phase_one
} else if $phase == 2 {
  call phase_two
} else if $phase == 3 {
  call phase_three
} else {
  call default_phase
}
```

The `then` keyword is optional:

```retro
if $score > 90 then {
  print "Excellent!"
}
```

### match

Pattern matching for clean state machines and multi-way branching:

```retro
match $phase {
  1 => {
    call intro_sequence
  }
  2 => {
    call discovery_phase
  }
  3, 4 => {
    call escalation
  }
  default => {
    print "Unknown phase"
  }
}
```

Multiple values can share a case by separating them with commas. The `default` case is optional and runs when no other case matches. Uses strict equality (`===`) for comparisons.

### loop (count-based)

Runs a fixed number of iterations. The variable `$i` is automatically set to the current index (0-based):

```retro
loop 5 {
  print "Iteration " + $i    # 0, 1, 2, 3, 4
}
```

The count can be a variable or expression:

```retro
set $n = 3
loop $n {
  print $i
}
```

### while

Runs while a condition is true:

```retro
set $count = 0
while $count < 10 {
  set $count = $count + 1
}
print $count    # 10
```

`loop while` is an alias:

```retro
loop while $count < 10 {
  set $count = $count + 1
}
```

### foreach / for

Iterates over an array. Both `foreach` and `for` work:

```retro
set $fruits = ["apple", "banana", "cherry"]
foreach $fruit in $fruits {
  print $fruit
}
```

The index variable `$i` is also available:

```retro
for $item in $fruits {
  print $i + ": " + $item    # "0: apple", "1: banana", ...
}
```

#### Iterating over objects

`foreach` also works with objects. With a single variable, it iterates over keys. With two variables (`$key, $value`), it provides both:

```retro
set $npcs = {alice: {trust: 80}, bob: {trust: 30}}

foreach $name, $state in $npcs {
  print $name + " has trust: " + $state.trust
}
```

For arrays, the two-variable form gives index and value:

```retro
foreach $idx, $fruit in $fruits {
  print $idx + ": " + $fruit    # "0: apple", "1: banana", ...
}
```

**Note:** foreach creates a defensive copy of the array, so modifying the original array during iteration is safe.

### break and continue

```retro
loop 10 {
  if $i == 5 {
    break        # exit the loop entirely
  }
  if $i % 2 == 0 {
    continue     # skip to the next iteration
  }
  print $i       # prints 1, 3
}
```

### return

Exits the current function (see [Functions](#7-functions)):

```retro
def findFirst($items, $target) {
  foreach $item in $items {
    if $item == $target {
      return $item
    }
  }
  return null
}
```

---

## 7) Functions

Define with `def`, `func`, or `function`. Call with `call`:

```retro
def greet($name) {
  print "Hello, " + $name + "!"
}

call greet "World"
```

### Parameters

Parameters are `$`-prefixed variables inside parentheses:

```retro
def add($a, $b) {
  return $a + $b
}

set $sum = call add 3 4
print $sum    # 7
```

### Return Values

Use `return` to send a value back. Use `call` in an expression to capture it:

```retro
def double($n) {
  return $n * 2
}

set $result = call double 5
print $result    # 10
```

Functions without `return` return `undefined`.

### Closures

Functions capture the scope where they were defined:

```retro
set $multiplier = 3
def multiply($n) {
  return $n * $multiplier
}
set $result = call multiply 4    # 12
```

### Calling Built-in Functions

Built-in functions are called the same way. Arguments are space-separated:

```retro
set $len = call length "hello"         # 5
set $upper = call upper "hello"        # "HELLO"
set $items = [3, 1, 2]
set $sorted = call sort $items         # [1, 2, 3]
```

### Recursion

RetroScript supports recursion up to 100 call stack depth (configurable):

```retro
def factorial($n) {
  if $n <= 1 {
    return 1
  }
  return $n * call factorial ($n - 1)
}

set $result = call factorial 5    # 120
```

---

## 8) Events

The event system lets scripts react to system events and communicate between scripts/apps.

### Listening with `on`

```retro
on app:launch {
  print "App launched: " + $event.appId
}
```

Inside the handler body, `$event` contains the event payload.

### Event Name Format

Event names support colon-separated namespaces and hyphenated segments:

```retro
on window:open { }
on app:notepad:saved { }
on desktop:bg-change { }
on sound:play { }
```

Valid event name parts include identifiers and keywords, so `on sound:play` works even though `play` is a keyword.

### Emitting Events

```retro
emit quest:phaseChanged phase=2 label="Unlocked"
```

Payload is specified as `key=value` pairs after the event name. Values can be any expression:

```retro
emit mail:deliver from="System" to=["User"] subject="Hello" body="Welcome!"
emit score:updated value=$score timestamp=call now
```

Payload keys can be identifiers or keywords (like `repeat`, `to`, `from`).

**Value types in emit payloads:**

```retro
# Strings
emit test:data name="Alice"

# Numbers
emit test:data count=42

# Booleans
emit test:data active=true

# Arrays
emit test:data tags=["a", "b"]

# Objects
emit test:data meta={"version": "1.0"}

# Variables
emit test:data score=$currentScore
```

### Multiple Handlers

You can register multiple handlers for the same event. All of them will fire:

```retro
on app:launch {
  print "Handler 1"
}

on app:launch {
  print "Handler 2"
}
# Both print when app:launch fires
```

### Handler Isolation

Event handlers save and restore the interpreter's state. A handler cannot accidentally modify outer variables or control flow. Errors inside handlers are caught and reported without crashing the script.

---

## 9) Strings and Text Output

### print

`print` has two modes depending on what follows it:

**Expression mode** (starts with a quoted string):

```retro
print "Hello " + $name + "!"
print "Score: " + ($a + $b)
```

**Unquoted text mode** (starts with anything else):

```retro
print Hello world!
print The value is $count items.
print Loading... please wait
```

In unquoted mode, `$variables` are interpolated and everything else is treated as literal text. Punctuation like `!`, `:`, `.` is attached to the preceding word. Words are separated by single spaces.

**Tip:** Expression mode is more predictable. Use it when mixing variables with text:

```retro
print "Hello " + $name + "! Your score is " + $score + "."
```

### log

Works like `print` — sends output to the script console.

### String Interpolation in Literals

Inside quoted strings, `$varName` patterns are replaced at runtime:

```retro
set $who = "World"
print "Hello $who!"    # Hello World!
```

This happens automatically for all string literals during expression evaluation.

---

## 10) File System

All paths use the IlluminatOS virtual file system (VFS). Paths look like `C:/folder/file.txt`.

### Allowed paths

`write`, `read`, `delete`, and `mkdir` go through an allowlist before reaching the filesystem. Paths must start with one of these prefixes:

| Prefix | What it's for |
|---|---|
| `C:/Users/User/Desktop/` | User desktop |
| `C:/Users/User/Documents/` | User documents |
| `C:/Users/User/Pictures/` | User images |
| `C:/Users/User/Music/` | User audio |
| `C:/Users/User/Videos/` | User video |
| `C:/Users/User/Projects/` | User project folders |
| `C:/Users/User/Secret/` | Hidden user folder |
| `C:/Windows/` and `C:/Windows/System32/` | System data |
| `C:/server/`, `C:/shared/`, `C:/public/` | Server-shared content |

Paths with `..` segments, control characters, or roots outside this list are rejected with a `RuntimeError`. The same allowlist is enforced for SSE-driven remote filesystem ops, so script behavior matches server-pushed behavior.

If you need a new root, add it once in `core/script/utils/PathValidation.js` — there's only one place to edit.

### write

```retro
write "file content here" to "C:/Users/User/Documents/note.txt"
```

The content is stringified — objects and arrays become JSON. Overwrites existing files.

### read

```retro
read "C:/Users/User/Documents/note.txt" into $content
print $content
```

The `into` clause names the variable. If omitted, defaults to `$result`:

```retro
read "C:/Users/User/Documents/config.txt"
print $result
```

### mkdir

```retro
mkdir "C:/Users/User/Documents/MyProject"
```

### delete / rm

```retro
delete "C:/Users/User/Documents/old.txt"
rm "C:/Users/User/Documents/temp"
```

Tries file deletion first, falls back to recursive directory deletion.

### Best Practices

Always wrap file reads in `try/catch` since files may not exist (or the path may be rejected):

```retro
try {
  read "C:/Users/User/Documents/data.txt" into $data
  print "Data: " + $data
} catch $err {
  print "Could not read file: " + $err
}
```

Path-validation errors raise the same `RuntimeError` as a missing-file or permissions error and can be caught the same way.

---

## 11) App and Window Control

### launch

```retro
launch notepad
launch terminal
launch browser
```

With parameters:

```retro
launch notepad with file="C:/readme.txt"
```

### close

```retro
close notepad
close            # closes the currently active window
```

### focus, minimize, maximize

```retro
focus notepad
minimize terminal
maximize browser
```

### wait / sleep

Pause execution for a number of milliseconds:

```retro
launch notepad
wait 500          # wait half a second
focus notepad

sleep 2000        # 'sleep' is an alias for 'wait'
```

### Sequencing UI Operations

Always add `wait` between UI operations. Windows need time to open:

```retro
launch notepad
wait 1000
focus notepad
wait 500
close notepad
```

---

## 12) Dialogs and Notifications

### alert

Non-blocking. Shows an alert dialog:

```retro
alert "Something happened!"
alert Warning: check your files    # unquoted text mode also works
```

### confirm

**Blocking.** Pauses the script until the user clicks OK or Cancel:

```retro
confirm "Delete this file?" into $confirmed
if $confirmed {
  delete "C:/temp.txt"
  print "Deleted."
} else {
  print "Cancelled."
}
```

Defaults variable name to `$confirmed` if `into` is omitted.

### prompt

**Blocking.** Shows a text input dialog:

```retro
prompt "What is your name?" default "User" into $name
print "Hello, " + $name + "!"
```

- `default` sets the pre-filled value (optional)
- `into` names the result variable (defaults to `$input`)

### notify

Non-blocking. Shows a system notification toast:

```retro
notify "Download complete!"
notify Task finished: $taskName
```

---

## 13) Audio and Video

### play

Play a predefined sound type:

```retro
play click
play notify
play error
```

Play an audio file with options:

```retro
play "C:/Music/song.mp3" volume=0.5 loop=true
play "assets/sounds/beep.wav"
```

The interpreter detects file paths by checking for `/`, `\`, `.mp3`, `.wav`, `.ogg`, or `assets/` prefix.

### stop

```retro
stop "C:/Music/song.mp3"    # stop specific audio
stop                         # stop all audio
```

### video

```retro
video "C:/Videos/intro.mp4" volume=0.8 loop=false fullscreen=true
```

This launches the video player app and passes the options.

---

## 14) Error Handling

### try / catch

```retro
try {
  read "C:/nonexistent.txt" into $data
} catch $err {
  print "Error: " + $err
}
```

The error variable name after `catch` is optional (defaults to `$error`):

```retro
try {
  set $result = 10 / 0
} catch {
  print "Something went wrong: " + $error
}
```

### What Can Be Caught

- File system errors (missing files, permission issues)
- Type errors (e.g., `foreach` on a non-array)
- Reference errors (undefined variables in some contexts)
- Runtime errors from built-in functions

### What Cannot Be Caught

- Parse errors (syntax problems prevent execution entirely)
- Timeout errors (the script is forcibly stopped)
- Recursion depth errors

---

## 15) Built-in Function Reference

Call built-in functions with `call`:

```retro
set $result = call functionName arg1 arg2
```

Or as standalone statements:

```retro
call functionName arg1 arg2
```

### Math

| Function | Description | Example |
|----------|-------------|---------|
| `abs` | Absolute value | `call abs -5` → `5` |
| `round` | Round to nearest integer | `call round 3.7` → `4` |
| `floor` | Round down | `call floor 3.9` → `3` |
| `ceil` | Round up | `call ceil 3.1` → `4` |
| `sqrt` | Square root | `call sqrt 16` → `4` |
| `pow` | Power | `call pow 2 3` → `8` |
| `mod` | Modulo | `call mod 10 3` → `1` |
| `sign` | Sign (-1, 0, 1) | `call sign -5` → `-1` |
| `min` | Minimum of two values | `call min 3 7` → `3` |
| `max` | Maximum of two values | `call max 3 7` → `7` |
| `clamp` | Clamp value to range | `call clamp 15 0 10` → `10` |
| `random` | Random integer in range | `call random 1 10` |
| `sin` | Sine (radians) | `call sin 1.57` |
| `cos` | Cosine (radians) | `call cos 0` → `1` |
| `tan` | Tangent (radians) | `call tan 0.785` |
| `asin` | Arc sine | `call asin 1` |
| `acos` | Arc cosine | `call acos 0` |
| `atan` | Arc tangent | `call atan 1` |
| `atan2` | Arc tangent of y/x | `call atan2 1 1` |
| `exp` | e^x | `call exp 1` |
| `log` | Natural logarithm | `call log 2.718` |
| `log10` | Base-10 logarithm | `call log10 100` → `2` |
| `log2` | Base-2 logarithm | `call log2 8` → `3` |
| `PI` | Pi constant | `call PI` → `3.14159...` |
| `E` | Euler's number | `call E` → `2.71828...` |

### String

| Function | Description | Example |
|----------|-------------|---------|
| `upper` | Uppercase | `call upper "hello"` → `"HELLO"` |
| `lower` | Lowercase | `call lower "HELLO"` → `"hello"` |
| `trim` | Trim whitespace | `call trim "  hi  "` → `"hi"` |
| `trimStart` | Trim leading whitespace | `call trimStart "  hi"` → `"hi"` |
| `trimEnd` | Trim trailing whitespace | `call trimEnd "hi  "` → `"hi"` |
| `length` | String length | `call length "hello"` → `5` |
| `charAt` | Character at index | `call charAt "hello" 0` → `"h"` |
| `charCode` | Character code | `call charCode "A"` → `65` |
| `fromCharCode` | Code to character | `call fromCharCode 65` → `"A"` |
| `concat` | Concatenate strings | `call concat "hi" " " "there"` |
| `substr` | Substring (start, length) | `call substr "hello" 1 3` → `"ell"` |
| `substring` | Substring (start, end) | `call substring "hello" 1 3` → `"el"` |
| `slice` | Slice (start, end) | `call slice "hello" -3` → `"llo"` |
| `indexOf` | First index of substring | `call indexOf "hello" "ll"` → `2` |
| `lastIndexOf` | Last index of substring | `call lastIndexOf "hello" "l"` → `3` |
| `contains` | Check if contains | `call contains "hello" "ell"` → `true` |
| `startsWith` | Check prefix | `call startsWith "hello" "he"` → `true` |
| `endsWith` | Check suffix | `call endsWith "hello" "lo"` → `true` |
| `replace` | Replace first occurrence | `call replace "aab" "a" "x"` → `"xab"` |
| `replaceAll` | Replace all occurrences | `call replaceAll "aab" "a" "x"` → `"xxb"` |
| `split` | Split into array | `call split "a,b,c" ","` → `["a","b","c"]` |
| `join` | Join array into string | `call join ["a","b"] ","` → `"a,b"` |
| `padStart` | Pad from start | `call padStart "5" 3 "0"` → `"005"` |
| `padEnd` | Pad from end | `call padEnd "5" 3 "0"` → `"500"` |
| `repeat` | Repeat string | `call repeat "ab" 3` → `"ababab"` |
| `reverse` | Reverse string | `call reverse "hello"` → `"olleh"` |

### Array

| Function | Description | Example |
|----------|-------------|---------|
| `count` | Array length | `call count [1,2,3]` → `3` |
| `first` | First element | `call first [1,2,3]` → `1` |
| `last` | Last element | `call last [1,2,3]` → `3` |
| `at` | Element at index | `call at [1,2,3] 1` → `2` |
| `push` | Add to end (returns new array) | `call push [1,2] 3` → `[1,2,3]` |
| `pop` | Remove from end | `call pop [1,2,3]` → `[1,2]` |
| `shift` | Remove from start | `call shift [1,2,3]` → `[2,3]` |
| `unshift` | Add to start | `call unshift [1,2,3] 0` → `[0,1,2,3]` |
| `includes` | Check if contains | `call includes [1,2,3] 2` → `true` |
| `findIndex` | Index of match | `call findIndex [1,2,3] 2` → `1` |
| `find` | Find element | `call find [1,2,3] 2` → `2` |
| `sort` | Sort ascending | `call sort [3,1,2]` → `[1,2,3]` |
| `sortDesc` | Sort descending | `call sortDesc [3,1,2]` → `[3,2,1]` |
| `unique` | Remove duplicates | `call unique [1,1,2]` → `[1,2]` |
| `flatten` | Flatten nested arrays | `call flatten [[1],[2,3]]` → `[1,2,3]` |
| `range` | Create number range | `call range 1 5` → `[1,2,3,4]` |
| `fill` | Create filled array | `call fill 3 "x"` → `["x","x","x"]` |
| `sum` | Sum of numbers | `call sum [1,2,3]` → `6` |
| `avg` | Average of numbers | `call avg [1,2,3]` → `2` |
| `product` | Product of numbers | `call product [2,3,4]` → `24` |
| `filter` | Filter by value | `call filter [1,2,3] 2` |
| `reject` | Reject by value | `call reject [1,2,3] 2` |
| `map` | Map operation | `call map [1,2,3] "double"` |
| `splice` | Splice array | `call splice [1,2,3,4] 1 2` → `[1,4]` |
| `arrayConcat` | Concatenate arrays | `call arrayConcat [1,2] [3,4]` → `[1,2,3,4]` |
| `mapBy` | Map by property path | `call mapBy $users "name"` → `["Alice","Bob"]` |
| `filterBy` | Filter by property value | `call filterBy $users "active" true` |
| `sortBy` | Sort by property (ascending) | `call sortBy $users "score"` |
| `sortByDesc` | Sort by property (descending) | `call sortByDesc $users "score"` |
| `findBy` | Find first by property value | `call findBy $users "name" "Alice"` |
| `groupBy` | Group by property | `call groupBy $items "category"` |

### Object

| Function | Description | Example |
|----------|-------------|---------|
| `keys` | Get all keys | `call keys $obj` → `["name","age"]` |
| `values` | Get all values | `call values $obj` |
| `entries` | Get key-value pairs | `call entries $obj` |
| `get` | Get property | `call get $obj "name"` |
| `set` | Set property | `call set $obj "name" "Bob"` |
| `has` | Check property exists | `call has $obj "name"` → `true` |
| `delete` | Delete property | `call delete $obj "temp"` |
| `merge` | Merge objects | `call merge $obj1 $obj2` |
| `clone` | Deep clone | `call clone $obj` |
| `freeze` | Freeze object | `call freeze $obj` |
| `getPath` | Get nested property | `call getPath $obj "meta.version" "1.0"` |
| `setPath` | Set nested property | `call setPath $obj "meta.version" "2.0"` |

### Type Checking

| Function | Description | Example |
|----------|-------------|---------|
| `typeof` | Get type name | `call typeof 42` → `"number"` |
| `isNumber` | Is number? | `call isNumber 42` → `true` |
| `isString` | Is string? | `call isString "hi"` → `true` |
| `isBoolean` | Is boolean? | `call isBoolean true` → `true` |
| `isArray` | Is array? | `call isArray [1,2]` → `true` |
| `isObject` | Is object? | `call isObject $obj` → `true` |
| `isNull` | Is null? | `call isNull null` → `true` |
| `isUndefined` | Is undefined? | `call isUndefined $x` |
| `isNaN` | Is NaN? | `call isNaN "abc"` |
| `isFinite` | Is finite? | `call isFinite 42` → `true` |
| `isInteger` | Is integer? | `call isInteger 3.0` → `true` |
| `isEmpty` | Is empty? | `call isEmpty ""` → `true` |
| `isNotEmpty` | Is not empty? | `call isNotEmpty "hi"` → `true` |

### Type Conversion

| Function | Description | Example |
|----------|-------------|---------|
| `toNumber` | Convert to number | `call toNumber "42"` → `42` |
| `toInt` | Convert to integer | `call toInt "3.9"` → `3` |
| `toFloat` | Convert to float | `call toFloat "3.14"` → `3.14` |
| `toString` | Convert to string | `call toString 42` → `"42"` |
| `toBoolean` | Convert to boolean | `call toBoolean 1` → `true` |
| `toArray` | Convert to array | `call toArray "abc"` → `["a","b","c"]` |
| `toObject` | Convert to object | `call toObject [["a",1]]` |
| `default` | Default if null/undefined | `call default $x "fallback"` |
| `coalesce` | First non-null value | `call coalesce null null "found"` → `"found"` |

### Time and Date

| Function | Description | Example |
|----------|-------------|---------|
| `now` | Current timestamp (ms) | `call now` |
| `timestamp` | Current Unix timestamp (s) | `call timestamp` |
| `time` | Formatted time string | `call time` → `"2:30:00 PM"` |
| `date` | Formatted date string | `call date` → `"1/15/1995"` |
| `datetime` | Full date-time string | `call datetime` |
| `year` | Year from timestamp | `call year $ts` |
| `month` | Month (1-12) | `call month $ts` |
| `day` | Day (1-31) | `call day $ts` |
| `weekday` | Weekday (0-6, Sun=0) | `call weekday $ts` |
| `weekdayName` | Weekday name | `call weekdayName $ts` → `"Monday"` |
| `hour` | Hour (0-23) | `call hour $ts` |
| `minute` | Minute (0-59) | `call minute $ts` |
| `second` | Second (0-59) | `call second $ts` |
| `millisecond` | Millisecond (0-999) | `call millisecond $ts` |
| `elapsed` | Ms since timestamp | `call elapsed $startTime` |
| `addDays` | Add days to timestamp | `call addDays $ts 7` |
| `addHours` | Add hours | `call addHours $ts 2` |
| `addMinutes` | Add minutes | `call addMinutes $ts 30` |
| `addSeconds` | Add seconds | `call addSeconds $ts 10` |
| `formatDate` | Custom date format | `call formatDate $ts "YYYY-MM-DD"` |
| `formatTime` | Custom time format | `call formatTime $ts "HH:mm:ss"` |
| `parseDate` | Parse date string | `call parseDate "2024-01-15"` |
| `toISO` | ISO 8601 format | `call toISO $ts` |

### JSON

| Function | Description | Example |
|----------|-------------|---------|
| `toJSON` | Stringify to JSON | `call toJSON $obj` |
| `prettyJSON` | Pretty-print JSON | `call prettyJSON $obj 2` |
| `fromJSON` | Parse JSON string | `call fromJSON '{"a":1}'` |
| `parseJSON` | Alias for fromJSON | `call parseJSON $str` |
| `isValidJSON` | Check if valid JSON | `call isValidJSON $str` → `true`/`false` |

### System

| Function | Description | Example |
|----------|-------------|---------|
| `sleep` | Delay (ms, max 30s) | `call sleep 1000` |
| `wait` | Alias for sleep | `call wait 500` |
| `getFocusedWindow` | Get active window info | `call getFocusedWindow` |
| `getWindows` | List all windows | `call getWindows` |
| `getApps` | List registered apps | `call getApps` |
| `getEnv` | Get environment info | `call getEnv` |
| `emitEvent` | Emit event by name | `call emitEvent "test:fire" $payload` |
| `query` | Query system state | `call query "type" $args` |
| `exec` | Execute command | `call exec "commandName" $payload` |
| `copyToClipboard` | Copy to clipboard | `call copyToClipboard "text"` |
| `getStorage` | Get persisted value | `call getStorage "key"` |
| `setStorage` | Persist value | `call setStorage "key" "value"` |

### Debug

| Function | Description | Example |
|----------|-------------|---------|
| `debug` | Debug output | `call debug "value:" $x` |
| `inspect` | Inspect value details | `call inspect $obj` |
| `trace` | Trace output | `call trace "checkpoint"` |
| `assert` | Assert condition | `call assert ($x > 0) "must be positive"` |
| `assertEqual` | Assert equality | `call assertEqual $a $b "should match"` |
| `assertType` | Assert type | `call assertType $x "number" "expected number"` |
| `timeStart` | Start timer | `call timeStart "myTimer"` |
| `timeEnd` | End timer (prints elapsed) | `call timeEnd "myTimer"` |
| `getCallStack` | Get call stack | `call getCallStack` |
| `dumpVars` | Dump all variables | `call dumpVars` |

---

## 16) Autoexec Scripts

The autoexec system runs a script automatically at boot.

**Loader:** `core/script/AutoexecLoader.js`

**Search order** (first found is executed):

1. `./autoexec.retro` (repo root via fetch)
2. `C:/Windows/autoexec.retro`
3. `C:/Scripts/autoexec.retro`
4. `C:/Users/User/autoexec.retro`

**Autoexec timeout:** 10 seconds (vs 30 seconds for normal scripts).

**Autoexec dialog behavior:** When running without an EventBus (headless/early boot):
- `confirm` automatically resolves to `true`
- `prompt` automatically uses the default value

Use autoexec for:
- Boot customization and theming
- Initial file deployment
- Registering persistent event handlers
- Guided onboarding flows
- ARG content staging

```retro
# Example autoexec.retro
print "System booting..."
mkdir "C:/Users/User/Documents"
write "Welcome to IlluminatOS" to "C:/Users/User/Documents/readme.txt"

on app:launch {
  print "App opened: " + $event.appId
}

notify "System ready!"
```

---

## 17) Terminal Scripting Bridge

Terminal built-ins let scripts automate the terminal. See `docs/TERMINAL_SCRIPTING.md` for full workflows.

### Window Control

```retro
call terminalOpen              # open terminal
call terminalOpen "help"       # open with initial command
call terminalFocus             # bring terminal to front
call terminalMinimize          # minimize
call terminalClose             # close terminal
set $open = call isTerminalOpen
```

### Running Commands

```retro
call terminalExecute "dir C:/"
call terminalExecuteSequence ["cd C:/", "dir", "help"]
```

### Output

```retro
call terminalPrint "Hello from script!"
call terminalPrint "Warning!" "red"      # colored output
call terminalPrintHtml "<b>Bold text</b>"
call terminalClear
set $output = call terminalGetOutput     # last command output
set $all = call terminalGetAllOutput     # full session output
set $hist = call terminalGetHistory      # command history
set $state = call terminalGetState       # terminal state object
```

### File Operations

```retro
call terminalCd "C:/Users/User"
set $path = call terminalGetPath
set $files = call terminalDir "C:/"
set $content = call terminalReadFile "C:/readme.txt"
call terminalWriteFile "C:/test.txt" "hello"
set $exists = call terminalFileExists "C:/test.txt"
call terminalRunScript "C:/Scripts/setup.retro"
```

### Environment and Aliases

```retro
call terminalSetEnvVar "EDITOR" "notepad"
set $editor = call terminalGetEnvVar "EDITOR"
set $vars = call terminalGetEnvVars

call terminalAlias "ll" "dir"
set $aliases = call terminalGetAliases
```

### Effects

```retro
call terminalGodMode          # toggle god mode
call terminalMatrix           # matrix rain effect
call terminalColor "green"    # change color
call terminalCowsay "Moo!"   # ASCII cow
call terminalFortune          # random fortune
```

---

## 18) Safety Limits

RetroScript enforces safety limits to prevent runaway scripts:

| Limit | Default | Description |
|-------|---------|-------------|
| Max execution time | 30,000 ms | Script timeout (10,000 ms for autoexec) |
| Max loop iterations | 100,000 | Per `while` loop |
| Max recursion depth | 1,000 | Function call stack |
| Max call stack | 100 | Nested function calls |
| Max event handlers | 1,000 | Registered `on` handlers |
| Max string length | 1,000,000 | Characters per string |
| Max array length | 100,000 | Elements per array |
| Max object keys | 10,000 | Properties per object |

When a limit is exceeded, the script throws an error and stops. Timeout and recursion errors cannot be caught with `try/catch`.

---

## 19) Gotchas and Common Mistakes

### Comments use `#`, not `;`

```retro
# Correct
; WRONG - semicolons are statement separators, not comments!
```

### Keywords are case-insensitive

`SET`, `Set`, and `set` all work. `TRUE`, `True`, and `true` are all boolean true. Identifiers preserve their case but keywords are matched case-insensitively.

### Keywords can't be used as plain identifiers

These are all reserved keywords: `if`, `then`, `else`, `match`, `loop`, `repeat`, `while`, `foreach`, `for`, `in`, `break`, `continue`, `set`, `def`, `func`, `function`, `call`, `return`, `try`, `catch`, `on`, `emit`, `print`, `log`, `read`, `write`, `into`, `to`, `with`, `default`, `launch`, `open`, `close`, `wait`, `sleep`, `focus`, `minimize`, `maximize`, `mkdir`, `delete`, `rm`, `alert`, `confirm`, `prompt`, `notify`, `play`, `stop`, `video`, `true`, `false`, `null`.

However, keywords **can** be used as emit/launch payload keys and event name parts.

### Division by zero throws an error

```retro
set $result = 10 / 0    # RuntimeError: Division by zero
set $mod = 10 % 0       # RuntimeError: Modulo by zero
```

### `+` with strings always concatenates

```retro
print "3" + 4     # "34" (string), not 7
print 3 + 4       # 7 (number)
```

### `print` has two parsing modes

When the first token after `print` is a quoted string, the rest of the
line is parsed as an **expression** (so `+` performs concatenation /
arithmetic):

```retro
print "Hello " + $name        # expression mode — concatenation
print "" + (2 + 3 * 4)         # expression mode — arithmetic
```

When the first token is anything else (a number, a `call`, a bare
identifier), `print` switches to **unquoted text mode** and treats the
remainder of the line as a literal string with `$variable` interpolation:

```retro
print 2 + 3 * 4                # outputs the literal string "2 + 3 * 4"
print Hello $name              # outputs "Hello <value of $name>"
```

To force expression evaluation for a non-string value, prefix with an
empty string or assign to a variable first:

```retro
set $r = 2 + 3 * 4
print "" + $r                  # outputs "14"
```

### Don't name a `foreach` loop variable `$i`

The interpreter unconditionally sets `$i` to the current loop index on
every `foreach` iteration. If your loop variable is also `$i` it will be
overwritten with the index, not the element value. Use a different name
(`$item`, `$row`, etc.) and read `$i` if you actually want the index.

```retro
foreach $i in [10, 20, 30] { print "" + $i }    # 0, 1, 2 — surprise!
foreach $item in [10, 20, 30] { print "" + $item }   # 10, 20, 30
```

### `==` uses strict equality

```retro
print 0 == false      # false (different types)
print 0 == 0          # true
print "1" == 1        # false (string vs number)
```

### `&&` and `||` return values, not booleans

```retro
set $x = null || "fallback"    # "fallback"
set $y = "hello" && "world"    # "world"
set $z = false && "nope"       # false
```

### `foreach` requires an array or object

```retro
# This throws a RuntimeError:
foreach $item in "not an array" {
  print $item
}

# Convert to array first:
set $chars = call toArray "hello"
foreach $char in $chars {
  print $char
}
```

### `confirm` and `prompt` are blocking

These statements pause script execution and wait for user input. Other statements like `alert` and `notify` are non-blocking.

```retro
# Script pauses here until user clicks OK/Cancel
confirm "Are you sure?" into $yes

# Script pauses here until user types input
prompt "Enter name:" into $name
```

### Variable `$i` in loops

All loop types automatically set `$i` to the current iteration index (0-based). If you nest loops, the inner `$i` shadows the outer one:

```retro
loop 3 {
  set $outer = $i
  loop 2 {
    # $i here is the inner loop's index (0, 1)
    # $outer still holds the outer loop's value
    print $outer + ":" + $i
  }
}
```

### Unquoted text in `print` has limits

Unquoted mode in `print` assembles text from tokens with spacing heuristics. It works well for simple messages but can produce unexpected results with complex expressions:

```retro
# Works well for simple text:
print Hello world!
print The value is $count items.

# Ambiguous - the + is treated as text, not arithmetic:
print The result is $a + $b

# Clear and correct - use quoted expression mode:
print "The result is " + ($a + $b)
```

### Event handlers run in isolation

Handlers save and restore interpreter state. You cannot use `break`, `continue`, or `return` to affect the outer script from inside a handler. Variables modified inside a handler don't propagate to the outer scope.

### File paths use forward slashes

```retro
# Correct
read "C:/Users/User/file.txt" into $data

# Works but less conventional
read "C:\\Users\\User\\file.txt" into $data
```

### Function arguments are space-separated

```retro
# Correct
set $result = call pow 2 3

# Wrong - parentheses not used for call arguments
set $result = call pow(2, 3)
```

### `read` defaults to `$result`, not the path

```retro
read "C:/file.txt"
print $result        # the file content is in $result
```

### Blocks require braces

All control structures require `{ }` braces, even for single statements:

```retro
# Correct
if $x > 0 {
  print "positive"
}

# Wrong - will not parse
if $x > 0
  print "positive"
```

---
---

# Part II: App Scripting System

---

## 20) App Scripting Overview

Every app in IlluminatOS extends `AppBase`, which provides three scriptability mechanisms:

1. **Commands** — Actions you can trigger on an app from a script
2. **Queries** — Read-only state you can request from an app
3. **Events** — Notifications an app emits when something happens

### How Commands Work

Commands are registered by apps and invoked from scripts via `emit`:

```retro
# Launch the app first
launch notepad
wait 500

# Send a command to the app
emit command:notepad:setText text="Hello from script!"
```

The event name follows the pattern `command:<appId>:<action>`. Payload keys become the command's parameters.

### How Queries Work

Queries let you read app state. Emit a query event, then listen for the response:

```retro
# Using the built-in query helper
set $result = call query "notepad:getText"
print $result
```

Or via the event system:

```retro
on query:notepad:getText:response {
  print "Notepad text: " + $event.text
}
emit query:notepad:getText
```

### How Events Work

Apps emit events when their state changes. Subscribe with `on`:

```retro
on app:notepad:saved {
  print "File saved to: " + $event.path
}

on app:minesweeper:game:win {
  notify "You won Minesweeper in " + $event.time + " seconds!"
}
```

App events follow the pattern `app:<appId>:<eventName>`.

### Quick Reference Pattern

For every app documented below, you can use these patterns:

```retro
# Command:  emit command:<appId>:<commandName> key=value
# Query:    set $state = call query "<appId>:<queryName>"
# Event:    on app:<appId>:<eventName> { ... }
```

---

## 21) Communication Apps

### Inbox (`inbox`)

Full email client with folders, auto-reply, scheduled delivery, and bulk operations.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `deliverMessage` | `{from, to, subject, body, folder?, read?, starred?, tags?, attachments?, headers?}` | Deliver a message to the inbox |
| `sendMessage` | `{to, subject, body, from?, folder?, timestamp?, tags?, attachments?}` | Send a message (appears in Sent) |
| `markRead` | `{messageId}` | Mark message as read |
| `markUnread` | `{messageId}` | Mark message as unread |
| `moveMessage` | `{messageId, folder}` | Move message to folder |
| `deleteMessage` | `{messageId, permanent?}` | Delete message (or move to Trash) |
| `restoreMessage` | `{messageId, folder?}` | Restore from Trash |
| `createFolder` | `{name}` | Create custom folder |
| `renameFolder` | `{oldName, newName}` | Rename folder |
| `deleteFolder` | `{name}` | Delete custom folder |
| `setFlag` | `{messageId, flag?, tag?, value?}` | Set flag or tag on message |
| `clearFlag` | `{messageId, flag?, tag?}` | Clear flag or tag |
| `setNotificationState` | `{hasNewMail}` | Set new mail indicator |
| `clearNewIndicator` | — | Clear new mail indicator |
| `scheduledDelivery` | `{delay, from, subject, body, text?, folder?, headers?, attachments?, starred?}` | Schedule message delivery after delay (ms) |
| `setAutoReply` | `{message, subject?, from?}` | Enable auto-reply |
| `clearAutoReply` | — | Disable auto-reply |
| `bulkDeliver` | `{messages: [{from, subject, body, ...}, ...]}` | Deliver multiple messages at once |
| `reset` | — | Full state reset |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getFolders` | — | `{folders: [{name, isDefault, messageCount, unreadCount}]}` |
| `getMessages` | `{folder?, read?, starred?, tag?, from?, search?, sortField?, sortAsc?, offset?, limit?}` | `{messages, total, offset, limit}` |
| `getMessageById` | `{messageId}` | `{message}` |
| `getUnreadCount` | `{folder?}` | `{unreadCount}` |
| `searchMessages` | `{query}` | `{messages, total}` |
| `getStatus` | — | `{activeFolder, activeMessageId, composing, unreadCount, hasNewMail, totalMessages, folders}` |
| `getConfig` | — | `{activeFolder, composing, unreadCount, hasNewMail, totalMessages, folders, autoReply, scheduledDeliveries}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `messageReceived` | `{message}` | New message delivered |
| `messageSent` | `{message}` | Message sent |
| `messageReadChanged` | `{messageId, read}` | Read status changed |
| `messageMoved` | `{messageId, from, to}` | Message moved to folder |
| `messageDeleted` | `{messageId, permanent}` | Message deleted |
| `messageRestored` | `{messageId, folder}` | Message restored from trash |
| `folderChanged` | `{folders}` | Folder structure changed |
| `unreadCountChanged` | `{unreadCount}` | Unread count changed |
| `notificationStateChanged` | `{hasNewMail}` | Notification state changed |
| `scheduledDelivered` | `{id, from, subject}` | Scheduled message delivered |
| `autoReplySet` | `{message}` | Auto-reply enabled/disabled |

#### Example: ARG Email Delivery

```retro
# Deliver a mysterious email after 30 seconds
emit command:inbox:scheduledDelivery delay=30000 from="unknown@darknet.sys" subject="They're watching" body="Check the recycling bin. The files aren't deleted. -X"

# React when the user reads it
on app:inbox:messageReadChanged {
  if $event.read == true {
    wait 5000
    emit command:inbox:deliverMessage from="unknown@darknet.sys" subject="Re: They're watching" body="Good. You're paying attention. Now check the terminal."
  }
}
```

---

### Phone (`phone`)

Full phone system with contacts, voicemail, call simulation, call interception, speed dial, and scripted conversations.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `dial` | `{number}` | Dial a number |
| `hangup` | — | End current call |
| `hold` | — | Put call on hold |
| `answer` | — | Answer incoming call |
| `decline` | — | Decline incoming call |
| `addContact` | `{name, number, group?}` | Add contact |
| `removeContact` | `{name}` | Remove contact |
| `updateContact` | `{name, number, group?}` | Update contact |
| `clearContacts` | — | Clear all contacts |
| `sendVoicemail` | `{from, number?, message, id?}` | Send voicemail |
| `sendAudioVoicemail` | `{from, number, message, audioSrc, duration?}` | Send voicemail with audio |
| `deleteVoicemail` | `{id}` | Delete voicemail |
| `clearVoicemails` | — | Clear all voicemails |
| `simulateIncoming` | `{from, number?, responses?, audioSrc?}` | Simulate incoming call |
| `scheduleCall` | `{from, number, delay, responses?, id?}` | Schedule a future call |
| `cancelScheduledCall` | `{id}` | Cancel scheduled call |
| `injectMessage` | `{text}` | Inject message into active call |
| `setResponses` | `{responses: [...]}` | Set custom call responses |
| `clearResponses` | — | Clear custom responses |
| `setCallOutcome` | `{number, name?, outcome}` | Set outcome override for number |
| `clearCallOutcome` | `{number, name?}` | Clear outcome override |
| `interceptCall` | `{number, name?, outcome?, message?, responses?, audioSrc?, voicemail?, duration?}` | Intercept calls to a number |
| `clearIntercept` | `{number, name?}` | Clear call intercept |
| `playCallAudio` | `{src}` | Play audio during call |
| `stopCallAudio` | — | Stop call audio |
| `setSpeedDial` | `{slot, name, number}` | Set speed dial slot |
| `clearSpeedDial` | `{slot}` | Clear speed dial slot |
| `setText` | `{text}` | Set LCD display text |
| `setLCDStatus` | `{text}` | Set LCD status line |
| `setView` | `{view}` | Change UI view |
| `setGreeting` | `{greeting}` | Set answering machine greeting |
| `setCallerIdEnabled` | `{enabled}` | Toggle caller ID |
| `setAnsweringMachineEnabled` | `{enabled}` | Toggle answering machine |
| `clearHistory` | — | Clear call history |
| `setBotResponses` | `{name, responses: [...]}` | Set contact bot responses |
| `reset` | — | Full state reset |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getStatus` | — | `{callState, currentCall, isRinging, activeCallAudio}` |
| `getCurrentCall` | — | `{call}` |
| `getContacts` | — | `{contacts}` |
| `getCallHistory` | — | `{history}` |
| `getVoicemails` | — | `{voicemails}` |
| `getSpeedDial` | — | `{speedDial}` |
| `getTranscript` | — | `{messages}` |
| `getGreeting` | — | `{greeting}` |
| `getConfig` | — | `{callerIdEnabled, answeringMachineEnabled, answeringMachineGreeting, speedDialCount, scheduledCallCount}` |
| `getScheduledCalls` | — | `{scheduledCalls}` |
| `getView` | — | `{view}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `dialed` | `{number, name}` | Number dialed |
| `ringing` | `{number, name}` | Call ringing |
| `connected` | `{number, name}` | Call connected |
| `ended` | `{number, name, duration, reason, transcript}` | Call ended |
| `incoming` | `{number, name}` | Incoming call received |
| `answered` | `{number, name}` | Incoming call answered |
| `declined` | `{}` | Incoming call declined |
| `voicemail` | `{from, number, message, id?, hasAudio?}` | Voicemail received |
| `voicemailPlayed` | `{id, from, number}` | Voicemail played |
| `contactAdded` | `{name, number, group?}` | Contact added |
| `contactRemoved` | `{name, number}` | Contact removed |
| `contactUpdated` | `{name, number}` | Contact updated |
| `messageReceived` | `{text}` | In-call message received |
| `messageSent` | `{text}` | In-call message sent |
| `callIntercepted` | `{number, name, intercept}` | Call intercepted |
| `speedDialUsed` | `{slot, name, number}` | Speed dial used |
| `dtmf` | `{digit}` | DTMF tone pressed |
| `audioStarted` | `{src}` | Call audio started |
| `audioEnded` | `{src}` | Call audio ended |
| `scheduledCallTriggered` | `{id, from, number}` | Scheduled call triggered |
| `viewChanged` | `{view, previousView}` | UI view changed |

#### Example: Mysterious Incoming Call

```retro
# Set up a contact
emit command:phone:addContact name="??? Unknown" number="555-0000" group="Unknown"

# Schedule a creepy call in 60 seconds
emit command:phone:scheduleCall from="??? Unknown" number="555-0000" delay=60000 responses=["I know where you are.", "The signal is coming from inside the OS.", "Check your inbox. NOW."]

# React when the call ends
on app:phone:ended {
  if $event.number == "555-0000" {
    emit command:inbox:deliverMessage from="SYSTEM" subject="TRACE COMPLETE" body="Call origin: INTERNAL. This should not be possible."
  }
}
```

---

### Instant Messenger (`instantmessenger`)

AIM-style instant messenger with buddy list, conversations, away status, and bot responses.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `signOn` | `{username}` | Sign on with username |
| `signOff` | — | Sign off |
| `sendMessage` | `{buddy, message}` | Send message to buddy |
| `setAway` | `{message}` | Set away status |
| `addBuddy` | `{screenName, group?}` | Add buddy |
| `removeBuddy` | `{screenName}` | Remove buddy |
| `openConversation` | `{buddy}` | Open chat window with buddy |
| `closeConversation` | — | Close active conversation |
| `setStatus` | `{status}` | Set status (online, away, idle) |
| `warnBuddy` | `{screenName}` | Warn a buddy |
| `simulateMessage` | `{from, message}` | Simulate incoming message |
| `setBuddyStatus` | `{screenName, status}` | Set buddy's online status |
| `setBuddyResponses` | `{buddy, responses: [...]}` | Set auto-responses for buddy |
| `clearBuddyResponses` | `{buddy}` | Clear auto-responses |
| `simulateBuddyTyping` | `{buddy}` | Show typing indicator |
| `setConversation` | `{buddy, messages: [...]}` | Set conversation history |
| `clearConversation` | `{buddy}` | Clear conversation |
| `clearAllConversations` | — | Clear all conversations |
| `scheduledMessage` | `{buddy, message, delay?, id?}` | Schedule a future message |
| `setBuddyProfile` | `{screenName, profile, awayMsg?, warningLevel?}` | Set buddy profile |
| `reset` | — | Full state reset |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getStatus` | — | `{isSignedOn, username, status, awayMessage}` |
| `getBuddyList` | — | `{buddyGroups}` |
| `getConversation` | `{buddy}` | `{messages}` |
| `getAwayMessage` | — | `{awayMessage}` |
| `getOnlineBuddies` | — | `{buddies}` |
| `getWarningLevel` | `{screenName}` | `{warningLevel}` |
| `getAllConversations` | — | `{conversations}` |
| `getConfig` | — | `{isSignedOn, username, status, buddyCount, conversationCount, customResponseCount}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `signedOn` | `{username}` | User signed on |
| `signedOff` | `{username}` | User signed off |
| `messageReceived` | `{from, message}` | Message received |
| `messageSent` | `{to, message}` | Message sent |
| `buddyOnline` | `{screenName, group?}` | Buddy came online |
| `buddyOffline` | `{screenName}` | Buddy went offline |
| `awayChanged` | `{away, message}` | Away status changed |
| `conversationOpened` | `{buddy}` | Conversation opened |
| `conversationClosed` | `{buddy}` | Conversation closed |
| `buddyStatusChanged` | `{screenName, oldStatus, newStatus}` | Buddy status changed |

#### Example: Bot Buddy

```retro
launch instantmessenger
wait 1000

# Sign on
emit command:instantmessenger:signOn username="Player1"
wait 500

# Add a mysterious buddy with auto-responses
emit command:instantmessenger:addBuddy screenName="gh0st_in_the_machine" group="Hackers"
emit command:instantmessenger:setBuddyStatus screenName="gh0st_in_the_machine" status="online"
emit command:instantmessenger:setBuddyResponses buddy="gh0st_in_the_machine" responses=["I've been waiting for you.", "The system remembers everything.", "Type 'help' if you want to know the truth."]

# Schedule a message from the buddy
emit command:instantmessenger:scheduledMessage buddy="gh0st_in_the_machine" message="Are you still there? I have something to show you." delay=30000
```

---

### Chat Room (`chatroom`)

IRC-style chat room with rooms, bots, topic control, and room locking.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `login` | `{username}` | Log in to chat |
| `sendMessage` | `{message}` | Send message to room |
| `joinRoom` | `{room}` | Join a room |
| `setNick` | `{name}` | Change nickname |
| `clear` | — | Clear message history |
| `addBot` | `{name, status?, color?}` | Add bot user |
| `removeBot` | `{name}` | Remove bot user |
| `injectMessage` | `{from, message, color?}` | Inject message as any user |
| `injectSystemMessage` | `{message}` | Inject system message |
| `simulateUserJoin` | `{name, status?, color?}` | Simulate user joining |
| `simulateUserLeave` | `{name, message?}` | Simulate user leaving |
| `setUserColor` | `{name, color}` | Set user's chat color |
| `scheduledMessage` | `{from, message, delay?, id?, color?}` | Schedule a message |
| `setRoomTopic` | `{topic}` | Set room topic |
| `lockRoom` | — | Lock the room |
| `unlockRoom` | — | Unlock the room |
| `setBotResponses` | `{name, responses: [...]}` | Set bot auto-responses |
| `reset` | — | Full state reset |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getStatus` | — | `{loggedIn, username, room, userCount}` |
| `getCurrentRoom` | — | `{name, label, userCount}` |
| `getUsers` | — | `[{name, status, isUser, color}]` |
| `getMessages` | `{count?}` | `[messages]` |
| `getRooms` | — | `[{name, label, users, active}]` |
| `getConfig` | — | `{loggedIn, username, room, roomLocked, roomTopic, userCount, messageCount, customBotResponseCount, scheduledMessages}` |
| `getRoomTopic` | — | `{topic, room}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `loggedIn` | `{username, room}` | User logged in |
| `messageSent` | `{username, message, room}` | Message sent |
| `messageReceived` | `{from, message, room}` | Message received |
| `roomChanged` | `{room, previousRoom, label}` | Room changed |
| `userJoined` | `{username, room}` | User joined room |
| `userLeft` | `{username, room}` | User left room |
| `roomLocked` | `{room}` | Room locked |
| `roomUnlocked` | `{room}` | Room unlocked |
| `topicChanged` | `{topic, room}` | Room topic changed |

#### Example: Haunted Chat Room

```retro
launch chatroom
wait 1000
emit command:chatroom:login username="Player"
wait 500

# Set an ominous topic
emit command:chatroom:setRoomTopic topic="DO NOT TRUST THE ADMIN"

# Add ghost users
emit command:chatroom:addBot name="[DELETED_USER]" color="#ff0000"
emit command:chatroom:addBot name="sys_daemon" color="#00ff00"

# Simulate a conversation
emit command:chatroom:scheduledMessage from="[DELETED_USER]" message="Can anyone hear me?" delay=5000 color="#ff0000"
emit command:chatroom:scheduledMessage from="sys_daemon" message="User [DELETED_USER] does not exist in the system." delay=8000 color="#00ff00"
emit command:chatroom:scheduledMessage from="[DELETED_USER]" message="They deleted my account but I'm still here." delay=12000 color="#ff0000"

# Lock the room after the exchange
wait 15000
emit command:chatroom:lockRoom
emit command:chatroom:injectSystemMessage message="Room has been locked by SYSTEM ADMINISTRATOR"
```

---

## 22) Productivity Apps

### Browser (`browser`)

Web browser with navigation, bookmarks, history, and homepage.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `navigate` | `{url}` (or string) | Navigate to URL |
| `back` | — | Go back in history |
| `forward` | — | Go forward in history |
| `refresh` | — | Refresh current page |
| `home` | — | Navigate to homepage |
| `setHomepage` | `{url}` | Set homepage URL |
| `addBookmark` | `{name, url}` | Add bookmark |
| `removeBookmark` | `{url}` | Remove bookmark |
| `setStatusText` | `{text}` | Set status bar text |
| `setAddressBar` | `{url}` | Set address bar text |
| `reset` | — | Reset to defaults |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getCurrentUrl` | — | `{url}` |
| `getHistory` | — | `{history, currentIndex}` |
| `getHomepage` | — | `{homepage}` |
| `getBookmarks` | — | `[{name, url}]` |
| `getConfig` | — | `{homepage, currentUrl, historyLength, bookmarkCount}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `homepageChanged` | `{url}` | Homepage changed |
| `bookmarkAdded` | `{name, url}` | Bookmark added |
| `bookmarkRemoved` | `{name, url}` | Bookmark removed |

```retro
launch browser
wait 1000
emit command:browser:navigate url="https://illuminatos.local/secret"
emit command:browser:setStatusText text="SIGNAL DETECTED..."
```

---

### Calculator (`calculator`)

Basic calculator with expression evaluation.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `input` | `{value}` | Input digit, operator, or decimal |
| `clear` | — | Clear display |
| `calculate` | `{expression}` | Evaluate expression string |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getValue` | — | Current numeric value |
| `getDisplay` | — | Current display string |
| `getOperator` | — | Current operator or null |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `input` | `{value, display}` | Input received |
| `cleared` | `{}` | Calculator cleared |
| `calculated` | `{expression, result}` | Expression evaluated |

```retro
launch calculator
wait 500
emit command:calculator:calculate expression="13 * 37"

on app:calculator:calculated {
  print "Result: " + $event.result
}
```

---

### Notepad (`notepad`)

Text editor with file open/save and text manipulation.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `setText` | `{text}` | Set full text content |
| `appendText` | `{text}` | Append text to end |
| `clear` | — | Clear all text |
| `save` | `{path?}` | Save to file |
| `open` | `{path}` | Open file |
| `new` | — | New blank document |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getText` | — | Text content (string) |
| `getFilePath` | — | Current file path or null |
| `getFileName` | — | Current file name |
| `getLength` | — | Character count |
| `getLineCount` | — | Line count |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `textChanged` | `{text}` | Text content changed |
| `textCleared` | `{}` | Text cleared |
| `saved` | `{path}` | File saved |
| `fileOpened` | `{path, content}` | File opened |
| `newDocument` | `{}` | New document created |

```retro
launch notepad
wait 1000
emit command:notepad:setText text="CLASSIFIED DOCUMENT\n\nOperation: MIDNIGHT SUN\nStatus: ACTIVE\nClearance: LEVEL 5 REQUIRED\n\n[REDACTED]"
wait 500
emit command:notepad:save path="C:/Users/User/Documents/classified.txt"
```

---

### Paint (`paint`)

Bitmap drawing application with tools, colors, and shapes.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `setTool` | tool (string) | Set tool: brush, eraser, bucket |
| `setColor` | color (string) | Set color (#RRGGBB) |
| `setBrushSize` | size (number) | Set brush size (1-50) |
| `clear` | — | Clear canvas |
| `drawLine` | `x1, y1, x2, y2` | Draw a line |
| `fillRect` | `x, y, width, height` | Fill a rectangle |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{tool, color, brushSize, currentFile, fileName}` |
| `getCanvasDimensions` | — | `{width, height}` |

---

## 23) Media & Entertainment

### Media Player (`mediaplayer`)

Unified audio and video player with playlist, fullscreen, shuffle, repeat, and a frequency visualizer for audio playback.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `play` | — | Play current media |
| `pause` | — | Pause playback |
| `stop` | — | Stop playback |
| `load` | `src, name?` | Load media source by URL/path |
| `next` | — | Next track |
| `previous` | — | Previous track |
| `setVolume` | volume (0-100) | Set volume |
| `seek` | position (number, seconds) | Seek to position |
| `fullscreen` | — | Toggle fullscreen (video only) |
| `mute` | — | Toggle mute |
| `shuffle` | — | Toggle shuffle mode |
| `repeat` | — | Toggle repeat mode |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{playing, currentIndex, currentTime, duration, volume, muted, loop, shuffle, isAudio}` |
| `getPlaylist` | — | `{playlist}` |
| `getCurrentMedia` | — | `{index, media}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `mediaplayer:playing` | `{media, index, isAudio}` | Playback started |
| `mediaplayer:stop` | — | Stopped |
| `mediaplayer:loaded` | `{duration}` | Media metadata loaded |
| `mediaplayer:timeupdate` | `{currentTime, duration}` | Position changed |
| `mediaplayer:ended` | `{media, index}` | Track ended |
| `mediaplayer:playlist:ended` | — | Entire playlist finished |
| `mediaplayer:playlist:add` | `{media}` | Track added to playlist |
| `mediaplayer:error` | `{error}` | Failed to load media |

```retro
launch mediaplayer
wait 500
emit command:mediaplayer:load src="assets/music/track.mp3" name="Track 1"
emit command:mediaplayer:setVolume volume=75
emit command:mediaplayer:play
```

---

## 24) Games

### Minesweeper (`minesweeper`)

Classic mine-finding puzzle game.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `newGame` | — | Start new game |
| `setDifficulty` | `{level: 'easy'\|'medium'\|'hard'\|'expert'}` | Change difficulty |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{rows, cols, mines, revealed, flagged, gameStatus, time}` |
| `getBoard` | — | `{board: [{count, flagged, revealed, hasMine}]}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `game:start` | `{rows, cols, mines}` | Game started |
| `cell:revealed` | `{row, col, value}` | Cell revealed |
| `cell:flagged` | `{row, col, flagged}` | Cell flagged/unflagged |
| `game:win` | `{time, rows, cols, mines, moves}` | Game won |
| `game:lose` | `{time, rows, cols, mines, hitMine: {row, col}}` | Game lost (hit mine) |

```retro
# Track Minesweeper performance for an ARG challenge
set $wins = 0
set $totalTime = 0

on app:minesweeper:game:win {
  set $wins = $wins + 1
  set $totalTime = $totalTime + $event.time
  if $wins >= 3 {
    notify "Achievement unlocked: Mine Sweeper"
    emit command:inbox:deliverMessage from="SYSTEM" subject="Clearance Granted" body="Your pattern recognition skills are impressive. Access code: GAMMA-7."
  }
}
```

---

### Snake (`snake`)

Classic snake game with score tracking.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `start` | — | Start new game |
| `pause` | — | Pause game |
| `resume` | — | Resume paused game |
| `reset` | — | Reset to title screen |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{score, highScore, gridSize, tileCount, state, snakeLength}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `game:start` | `{gridSize, tileCount}` | Game started |
| `food:eaten` | `{x, y, score, snakeLength}` | Food eaten |
| `score:updated` | `{score, previousScore, delta}` | Score changed |
| `game:over` | `{score, snakeLength}` | Game over |

---

### Solitaire (`solitaire`)

Klondike solitaire card game.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `newGame` | — | Start new game |
| `undo` | — | Undo last move (returns error - not supported) |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{moves, time, gameWon, gameOver}` |
| `getScore` | — | `{score, moves, time}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `game:start` | `{type: 'klondike'}` | Game started |
| `card:moved` | `{card, from, to, moves}` | Card moved |
| `game:won` | `{moves, time, score}` | Game won |

---

### FreeCell (`freecell`)

FreeCell card game with undo support.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `newGame` | — | Start new game |
| `undo` | — | Undo last move |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{totalInFoundations, freeCellsUsed, cardsMoved, gameWon, gameOver}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `game:start` | `{type: 'freecell'}` | Game started |
| `card:moved` | `{card, from, to, moves}` | Card moved |
| `game:won` | `{moves, time}` | Game won |

---

### Asteroids (`asteroids`)

Arcade-style space shooting game.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `start` | — | Start game |
| `pause` | — | Pause game |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{score, lives, level, gameState}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `game:start` | `{lives}` | Game started |
| `level:up` | `{level, previousLevel}` | Level advanced |
| `score:updated` | `{score, previousScore, delta, reason}` | Score changed |
| `game:over` | `{score, level, highScore}` | Game over |

---

### SkiFree (`skifree`)

Downhill skiing game with yeti chase.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `start` | — | Start game |
| `pause` | — | Pause game |
| `resume` | — | Resume paused game |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{score, highScore, distance, lives, state, yetiAppeared}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `game:start` | `{lives}` | Game started |
| `score:updated` | `{score, distance}` | Score/distance changed |
| `yeti:appeared` | `{distance}` | Yeti appears |
| `game:over` | `{score, distance, byYeti, finalState}` | Game over |

```retro
# React to the yeti
on app:skifree:yeti:appeared {
  notify "HE'S COMING."
  wait 2000
  emit command:chatroom:injectSystemMessage message="WARNING: Entity detected at distance " + $event.distance
}
```

---

### Zork (`zork`)

Text adventure game with rich ARG scripting — teleportation, inventory manipulation, flags, and score control.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `sendCommand` | `{command}` | Send text command to game engine |
| `injectText` | `{text}` | Inject text into output (no processing) |
| `teleport` | `{room}` | Move player to a room directly |
| `addInventory` | `{item}` | Add item to player's inventory |
| `removeInventory` | `{item}` | Remove item from inventory |
| `setScore` | `{score}` | Set player's score |
| `setFlag` | `{flag, value?}` | Set game flag (lanternOn, trollDead, leafletRead, eggOpened, thiefEncountered, gameOver) |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{currentRoom, score, moves, inventory, gameOver}` |
| `getRoom` | — | `{id, name, description, exits, objects, dark}` |
| `getInventory` | — | `[item IDs]` |
| `getScore` | — | `{score, moves}` |
| `getFlag` | `{flag}` | `{flag, value}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `room:changed` | `{from, to}` | Player moved to new room |
| `item:taken` | `{item}` | Item picked up |
| `item:dropped` | `{item}` | Item dropped |
| `score:changed` | `{score, change}` | Score changed |
| `game:over` | `{won, score}` | Game ended |
| `command:entered` | `{command, response}` | Player typed a command |

#### Example: ARG Zork Integration

```retro
launch zork
wait 1000

# Monitor player commands for secret phrases
on app:zork:command:entered {
  if call contains $event.command "xyzzy" {
    emit command:zork:injectText text="\n*** HIDDEN PASSAGE ACTIVATED ***\nA portal shimmers into existence...\n"
    emit command:zork:teleport room="clearing"
    emit command:zork:addInventory item="strange_key"
    emit command:zork:setScore score=100
  }
}

# React to room changes
on app:zork:room:changed {
  if $event.to == "cellar" {
    wait 2000
    emit command:zork:injectText text="\nYou hear a faint transmission from somewhere above...\n'The password is LIGHTHOUSE.'\n"
  }
}
```

---

### Doom (`doom`)

Doom game running in an iframe wrapper.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `reload` | — | Reload the game |
| `focus` | — | Focus the game iframe |
| `fullscreen` | — | Toggle fullscreen |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{isFocused}` |

---

## 25) System Utilities

### Terminal (`terminal`)

Command-line terminal with extensive scripting support.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `execute` | cmd (string) | Execute a terminal command |
| `executeSequence` | commands (string[]) | Execute multiple commands |
| `clear` | — | Clear terminal screen |
| `print` | text, color? | Print text to terminal |
| `printHtml` | html (string) | Print HTML to terminal |
| `cd` | path (string) | Change directory |
| `dir` | path? (string) | List directory |
| `readFile` | filePath (string) | Read file contents |
| `writeFile` | filePath, content, extension? | Write file |
| `setEnvVar` | name, value | Set environment variable |
| `getEnvVar` | name | Get environment variable |
| `createAlias` | name, command | Create command alias |
| `removeAlias` | name | Remove alias |
| `runScript` | scriptPath | Run .retro or .bat script |
| `focus` | — | Focus terminal window |
| `minimize` | — | Minimize terminal |
| `maximize` | — | Maximize terminal |
| `closeTerminal` | — | Close terminal window |
| `showMessage` | message, type? | Show styled message |
| `createFile` | filePath, content? | Create file |
| `deleteFile` | filePath | Delete file |
| `fileExists` | filePath | Check file exists |
| `launchApp` | appId, params? | Launch app from terminal |
| `startMatrix` | — | Start matrix rain effect |
| `stopMatrix` | — | Stop matrix rain |
| `enableGodMode` | — | Enable god mode |
| `updatePrompt` | — | Update terminal prompt |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getCurrentPath` | — | `{path, pathString}` |
| `getHistory` | — | `{history}` |
| `getLastOutput` | — | `{output}` |
| `getEnvVars` | — | `{envVars}` |
| `getAliases` | — | `{aliases}` |
| `getState` | — | `{currentPath, pathString, godMode, hasActiveProcess, historyCount, windowId}` |
| `getWindowInfo` | — | `{windowId, appId, appName}` |
| `getAllOutput` | — | `{outputText, outputHtml}` |
| `isGodMode` | — | `{godMode}` |
| `getBatchState` | — | `{isExecutingBatch, batchCommandCount, currentBatchIndex}` |

---

### My Computer (`mycomputer`)

File explorer with navigation, file operations, and directory browsing.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `navigate` | `{path}` | Navigate to path |
| `createFolder` | `{path, name}` | Create folder |
| `delete` | `{path}` | Delete file or folder |
| `rename` | `{path, newName}` | Rename item |
| `openFile` | `{path}` | Open file with default app |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getCurrentPath` | — | `{path, pathString}` |
| `listDirectory` | path? | `{success, path, items}` |
| `getNodeInfo` | path | `{success, node}` |
| `getSystemFolders` | — | `{folders}` |

---

### Recycle Bin (`recyclebin`)

Deleted file management.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `restoreItem` | `{index}` | Restore item by index |
| `deleteItem` | `{index}` | Permanently delete item |
| `emptyBin` | — | Empty entire recycle bin |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getItems` | — | `[{id, label, type, emoji}]` |
| `getCount` | — | `{count}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `item:restored` | item data | Item restored |
| `item:deleted` | item data | Item permanently deleted |
| `bin:emptied` | — | Bin emptied |

---

### Task Manager (`taskmanager`)

Process and window management.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `endTask` | `{windowId}` | End/close application |
| `switchTo` | `{windowId}` | Switch to window |
| `refreshView` | — | Refresh display |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getApplications` | — | `[{windowId, title, minimized, memory}]` |
| `getProcesses` | — | `[{name, pid, windowId?}]` |
| `getPerformance` | — | `{cpu, memory}` |
| `getProcessCount` | — | `{count}` |

---

### Find Files (`findfiles`)

File search utility.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `search` | `{name?, content?, location?}` | Start search |
| `stopSearch` | — | Stop ongoing search |
| `clearResults` | — | Clear results |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getResults` | — | `[{name, folder, size, type}]` |
| `getSearchState` | — | `{isSearching, resultCount}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `search:complete` | `{query, location, resultsCount}` | Search completed |
| `result:opened` | `{name, path, type}` | Result opened |
| `search:stopped` | `{resultsFound}` | Search stopped |

---

### Help System (`help`)

Help viewer with topic navigation and history.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `navigateTo` | `{topic}` | Navigate to help topic |
| `goBack` | — | Go to previous topic |
| `goForward` | — | Go to next topic |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getCurrentTopic` | — | `{topic}` |
| `getHistory` | — | `{history, historyIndex}` |

---

### Defrag (`defrag`)

Disk defragmentation utility.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `analyze` | — | Analyze disk |
| `defragment` | — | Start defragmentation |
| `pause` | — | Pause operation |
| `stop` | — | Stop operation |
| `selectDrive` | `{drive}` | Select drive |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{isRunning, isPaused, selectedDrive, fragmentedPercent, progress}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `analysis:complete` | analysis data | Analysis finished |
| `defrag:start` | — | Defrag started |
| `defrag:complete` | — | Defrag finished |
| `defrag:stopped` | — | Defrag stopped |

---

### Run Dialog (`run`)

Quick-launch dialog for apps and URLs.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `execute` | `{command}` | Execute app name or URL |

---

## 26) Settings & Configuration

### Control Panel (`controlpanel`)

Central settings hub.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `setSetting` | `{setting, value}` | Set system setting |

Supported settings: `crtEffect`, `sound`, `petEnabled`, `petType`, `screensaverDelay`, `desktopBg`

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getSettings` | — | `{crtEffect, sound, pet, screensaverDelay, desktopBg}` |

```retro
# Toggle CRT effect
emit command:controlpanel:setSetting setting="crtEffect" value=true

# Enable desktop pet
emit command:controlpanel:setSetting setting="petEnabled" value=true
emit command:controlpanel:setSetting setting="petType" value="cat"
```

---

### Display Properties (`displayproperties`)

Wallpaper and color scheme settings.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `setWallpaper` | `{wallpaper}` | Select wallpaper pattern |
| `setColorScheme` | `{scheme}` | Set color scheme: win95, highcontrast, desert, ocean, rose, slate |
| `applySettings` | — | Apply all current settings |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getSettings` | — | `{wallpaper, backgroundColor}` |

---

### Sound Settings (`soundsettings`)

System volume and sound toggle.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `setVolume` | `{volume: 0-100}` | Set master volume |
| `setSoundEnabled` | `{enabled}` | Enable/disable sound |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getVolume` | — | `{volume}` |
| `isSoundEnabled` | — | `{enabled}` |

---

### Features Settings (`featuressettings`)

Toggle and configure system features.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `enableFeature` | `{featureId}` | Enable a feature |
| `disableFeature` | `{featureId}` | Disable a feature |
| `setFeatureConfig` | `{featureId, key, value}` | Set feature config value |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getFeatures` | `{category?}` | Array of features |
| `getFeature` | `{featureId}` | Single feature or null |
| `isFeatureEnabled` | `{featureId}` | Boolean |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `feature:enabled` | `{featureId}` | Feature enabled |
| `feature:disabled` | `{featureId}` | Feature disabled |
| `feature:configChanged` | `{featureId, key, value}` | Feature config changed |

---

## 27) Admin & Special Apps

### Admin Panel (`adminpanel`)

Desktop icon management and achievement system.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `addIcon` | `{emoji, id, label, type?, x?, y?, url?}` | Add desktop icon |
| `removeIcon` | `{index}` | Remove icon by index |
| `unlockAchievement` | `{achievement}` | Unlock an achievement |
| `resetAchievements` | — | Clear all achievements |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getIcons` | — | Array of desktop icons |
| `getAchievements` | — | Array of achievement names |
| `isAdmin` | — | Boolean |
| `getSystemInfo` | — | `{iconCount, openWindows, recycledItems, achievements, sound, crtEffect}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `icon:added` | `{emoji, id, label, type, x, y, url?}` | Icon added to desktop |
| `icon:removed` | icon object | Icon removed |
| `achievement:unlocked` | `{achievement}` | Achievement unlocked |
| `achievements:reset` | — | All achievements cleared |

```retro
# Add a mysterious icon to the desktop
emit command:adminpanel:addIcon emoji="👁️" id="the-eye" label="THE EYE" type="app"

# Unlock achievements based on gameplay
on app:minesweeper:game:win {
  emit command:adminpanel:unlockAchievement achievement="Mine Sweeper"
}
on app:zork:game:over {
  if $event.won == true {
    emit command:adminpanel:unlockAchievement achievement="Adventure Complete"
  }
}
```

---

### Calendar (`calendar`)

Calendar with event management.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `addEvent` | `{title, date, time?, color?}` | Create event |
| `removeEvent` | `{eventId}` | Remove event by ID |
| `goToDate` | `{date}` | Navigate to date |
| `setMonth` | `{month?, year?}` | Change displayed month |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getEvents` | `{date?}` | Array of events |
| `getSelectedDate` | — | Selected date |
| `getCurrentMonth` | — | `{month, year}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `event:created` | `{title, date, time?, color?}` | Event created |
| `event:deleted` | `{eventId}` | Event deleted |
| `event:updated` | `{eventId, title, date, time}` | Event updated |
| `month:changed` | `{month, year}` | Month changed |
| `date:selected` | `{date, previousDate}` | Date selected |

```retro
launch calendar
wait 1000
emit command:calendar:addEvent title="DEADLINE" date="1995-12-31" time="23:59" color="#ff0000"
emit command:calendar:addEvent title="Meeting with X" date="1995-06-15" time="03:00" color="#ffff00"
```

---

### Clock (`clock`)

Multi-function clock with alarm, timer, and stopwatch tabs.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `setAlarm` | `{hour, minute, ampm, label?}` | Set alarm |
| `removeAlarm` | `{alarmId}` | Remove alarm |
| `startTimer` | `{minutes, seconds}` | Start countdown timer |
| `stopTimer` | — | Stop timer |
| `startStopwatch` | — | Start stopwatch |
| `stopStopwatch` | — | Stop stopwatch |
| `resetStopwatch` | — | Reset stopwatch |
| `switchTab` | `{tab: 'clock'\|'alarm'\|'stopwatch'\|'timer'}` | Switch tab |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getCurrentTime` | — | `{hours, minutes, seconds, ampm, time}` |
| `getAlarms` | — | Array of alarms |
| `getTimerState` | — | `{timerTime, timerInitial, timerRunning, timerPercent}` |
| `getStopwatchState` | — | `{time, running, laps, formatted}` |
| `getActiveTab` | — | `{tab}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `alarm:set` | `{alarmId, hour, minute, ampm, label}` | Alarm set |
| `alarm:triggered` | `{alarmId, label, time}` | Alarm triggered |
| `alarm:dismissed` | — | Alarm dismissed |
| `stopwatch:started` | — | Stopwatch started |
| `stopwatch:stopped` | `{time, laps}` | Stopwatch stopped |
| `stopwatch:lap` | `{lapNumber, time, formatted}` | Stopwatch lap |
| `timer:complete` | `{initialTime}` | Timer finished |

```retro
# Set a timed challenge
launch clock
wait 500
emit command:clock:switchTab tab="timer"
emit command:clock:startTimer minutes=5 seconds=0

on app:clock:timer:complete {
  alert "TIME'S UP. Did you find the hidden file?"
}
```

---

### HyperCard (`hypercard`)

HyperCard-style application in an iframe.

#### Commands

| Command | Payload | Description |
|---------|---------|-------------|
| `reload` | — | Reload iframe |
| `goHome` | — | Navigate to home page |

#### Queries

| Query | Payload | Returns |
|-------|---------|---------|
| `getState` | — | `{status}` |

#### Events

| Event | Payload | When |
|-------|---------|------|
| `loaded` | — | Iframe loaded |

---
---

# Part III: System Reference

---

## 28) System Events Reference

IlluminatOS emits system-level events that scripts can subscribe to. These are independent of any specific app.

### Window Events

| Event | Payload | Description |
|-------|---------|-------------|
| `window:open` | `{id, title}` | Window opened |
| `window:close` | `{id}` | Window closed |
| `window:focus` | `{id}` | Window gained focus |
| `window:minimize` | `{id}` | Window minimized |
| `window:maximize` | `{id, maximized}` | Window maximize toggled |
| `window:restore` | `{id}` | Window restored from minimized |
| `window:resize` | `{id, width, height}` | Window resized |
| `window:move` | `{id}` | Window moved |
| `window:snap` | `{id}` | Window snapped to edge |
| `window:shake` | `{id}` | Window shaken |

### App Lifecycle Events

| Event | Payload | Description |
|-------|---------|-------------|
| `app:launch` | `{appId, windowId}` | App launched |
| `app:open` | `{appId}` | App window opened |
| `app:close` | `{appId, windowId}` | App closed |
| `app:focus` | `{appId, windowId}` | App gained focus |
| `app:blur` | `{appId, windowId}` | App lost focus |
| `app:ready` | `{appId, windowId}` | App mounted and ready |
| `app:error` | `{appId, windowId, error}` | App error |
| `app:registered` | `{appId}` | New app registered |

### System Events

| Event | Payload | Description |
|-------|---------|-------------|
| `system:boot` | — | Boot sequence started |
| `system:ready` | — | System fully booted |
| `system:idle` | — | User inactive |
| `system:active` | — | User activity detected |
| `system:sleep` | — | Tab hidden |
| `system:wake` | — | Tab visible again |
| `system:online` | — | Network online |
| `system:offline` | — | Network offline |
| `system:resize` | `{innerWidth, innerHeight}` | Browser resized |
| `system:screensaver:start` | — | Screensaver activated |
| `system:screensaver:end` | — | Screensaver deactivated |
| `bsod:show` | — | Blue screen of death shown |

### Filesystem Events

| Event | Payload | Description |
|-------|---------|-------------|
| `fs:file:create` | `{path}` | File created |
| `fs:file:read` | `{path}` | File read |
| `fs:file:update` | `{path}` | File updated |
| `fs:file:delete` | `{path}` | File deleted |
| `fs:file:rename` | `{path, oldPath, newPath}` | File renamed |
| `fs:file:move` | `{source, destination}` | File moved |
| `fs:file:copy` | `{source, destination}` | File copied |
| `fs:directory:create` | `{path}` | Directory created |
| `fs:directory:delete` | `{path}` | Directory deleted |
| `filesystem:changed` | — | Any filesystem change |

### Script Events

| Event | Payload | Description |
|-------|---------|-------------|
| `script:start` | — | Script execution started |
| `script:complete` | `{success, result}` | Script finished |
| `script:error` | `{error}` | Script error |
| `script:output` | `{message}` | Script print output |

### Terminal Events

| Event | Payload | Description |
|-------|---------|-------------|
| `terminal:command` | `{command}` | Terminal command executed |
| `terminal:output` | `{text}` | Terminal output |
| `terminal:cwd:change` | `{path}` | Working directory changed |
| `app:terminal:command` | `{command}` | Terminal command (app event) |

### Input Events

| Event | Payload | Description |
|-------|---------|-------------|
| `keyboard:keydown` | `{key, code, ctrlKey, shiftKey, altKey}` | Key pressed |
| `keyboard:combo` | `{combo}` | Keyboard shortcut |
| `mouse:click` | `{x, y, button}` | Mouse clicked |
| `mouse:dblclick` | `{x, y}` | Double clicked |

### UI Events

| Event | Payload | Description |
|-------|---------|-------------|
| `ui:menu:start:open` | — | Start menu opened |
| `ui:menu:start:close` | — | Start menu closed |
| `desktop:refresh` | — | Desktop refreshed |
| `desktop:bg-change` | — | Background changed |

### Setting & State Events

| Event | Payload | Description |
|-------|---------|-------------|
| `setting:changed` | `{key, value}` | Setting changed |
| `state:change` | `{path, value, oldValue}` | State changed |

### Feature Events

| Event | Payload | Description |
|-------|---------|-------------|
| `feature:registered` | `{featureId, name}` | Feature registered |
| `feature:enabled` | `{featureId}` | Feature enabled |
| `feature:disabled` | `{featureId}` | Feature disabled |
| `features:initialized` | — | All features ready |

### Achievement Events

| Event | Payload | Description |
|-------|---------|-------------|
| `achievement:unlock` | `{id}` | Achievement unlocked |

### Sound/Audio Events

| Event | Payload | Description |
|-------|---------|-------------|
| `sound:play` | `{type}` | Sound effect played |
| `audio:play` | — | Audio playback started |
| `audio:pause` | — | Audio paused |
| `audio:stop` | — | Audio stopped |
| `audio:ended` | — | Audio finished |

### Notification Events

| Event | Payload | Description |
|-------|---------|-------------|
| `notification:show` | `{message}` | Notification shown |
| `notification:dismiss` | — | Notification dismissed |

### Recycle Bin Events

| Event | Payload | Description |
|-------|---------|-------------|
| `recyclebin:update` | — | Bin contents changed |
| `recyclebin:recycle-file` | `{path}` | File recycled |
| `recyclebin:restore` | `{path}` | File restored |
| `recyclebin:empty` | — | Bin emptied |

---

## 29) System Commands Reference

These are system-level commands registered with the unified command registry (via `EventBus.executeCommand`), usable from RetroScript.

### App & Window Commands

```retro
# Launch app
launch notepad
launch browser with url="https://example.com"

# Window control
focus notepad
minimize terminal
maximize browser
close notepad
```

### Filesystem Commands

```retro
# Read/write files
write "content" to "C:/path/file.txt"
read "C:/path/file.txt" into $data
mkdir "C:/path/folder"
delete "C:/path/file.txt"
```

### Dialog Commands

```retro
alert "Message"
confirm "Are you sure?" into $yes
prompt "Enter name:" default "User" into $name
notify "Toast message"
```

### Sound Commands

```retro
play click
play notify
play error
play "C:/Music/file.mp3" volume=0.5 loop=true
stop
```

### Setting Commands

```retro
# Via Control Panel
emit command:controlpanel:setSetting setting="crtEffect" value=true
emit command:controlpanel:setSetting setting="sound" value=false

# Via Display Properties
emit command:displayproperties:setColorScheme scheme="highcontrast"
emit command:displayproperties:applySettings

# Via Sound Settings
emit command:soundsettings:setVolume volume=50
emit command:soundsettings:setSoundEnabled enabled=true
```

### Timer Commands

```retro
# Set a repeating timer
emit timer:set interval=5000 event="heartbeat" repeat=true

# Clear a timer
emit timer:clear id=$timerId
```

### Query Commands

```retro
# Query system state
set $windows = call query "windows"
set $apps = call query "apps"
set $settings = call query "settings"
```

---

## 30) ARG Development Patterns

This section covers common patterns for building Alternate Reality Game (ARG) experiences using RetroScript and the app scripting system.

### Pattern 1: Multi-App Storytelling

Use multiple apps together to tell a story across the OS:

```retro
# Phase 1: The mysterious email
emit command:inbox:deliverMessage from="admin@illuminatos.sys" subject="System Notice" body="Routine maintenance scheduled. Do not open the Recycle Bin."

# Phase 2: User opens Recycle Bin - react
on app:recyclebin:item:restored {
  wait 2000
  emit command:inbox:deliverMessage from="admin@illuminatos.sys" subject="WARNING" body="We told you not to look. Now they know."
  wait 3000
  emit command:phone:simulateIncoming from="UNKNOWN" number="000-000-0000" responses=["You shouldn't have done that.", "They're watching now.", "Check the terminal."]
}

# Phase 3: Terminal clue
on app:terminal:command {
  if call contains $event.command "secret" {
    emit command:chatroom:injectMessage from="[SYSTEM]" message="ACCESS GRANTED - LEVEL 2"
  }
}
```

### Pattern 2: Progressive Unlocking

Gate content behind achievements and discoveries:

```retro
set $discoveries = 0

on app:zork:room:changed {
  if $event.to == "cellar" {
    set $discoveries = $discoveries + 1
    emit command:adminpanel:unlockAchievement achievement="Deep Explorer"
  }
}

on app:minesweeper:game:win {
  set $discoveries = $discoveries + 1
  emit command:adminpanel:unlockAchievement achievement="Mine Expert"
}

on app:calculator:calculated {
  if $event.result == 42 {
    set $discoveries = $discoveries + 1
    emit command:adminpanel:unlockAchievement achievement="The Answer"
  }
}

# Check for full unlock
on achievement:unlock {
  if $discoveries >= 3 {
    notify "ALL ACCESS GRANTED"
    emit command:adminpanel:addIcon emoji="🔓" id="vault" label="THE VAULT" type="app"
  }
}
```

### Pattern 3: Timed Events

Create time-pressure scenarios:

```retro
# Start a countdown
launch clock
wait 500
emit command:clock:switchTab tab="timer"
emit command:clock:startTimer minutes=10 seconds=0

# Periodic pressure messages
set $count = 0
on app:clock:timer:complete {
  alert "TIME EXPIRED. Connection terminated."
  emit command:chatroom:lockRoom
  emit command:chatroom:injectSystemMessage message="SESSION TERMINATED BY ADMIN"
}

# Drip-feed clues
emit command:inbox:scheduledDelivery delay=60000 from="ally@resistance.net" subject="Hint 1" body="The password is hidden in the Help system."
emit command:inbox:scheduledDelivery delay=180000 from="ally@resistance.net" subject="Hint 2" body="Search for 'about' in the Help topics."
emit command:inbox:scheduledDelivery delay=300000 from="ally@resistance.net" subject="URGENT" body="You're running out of time!"
```

### Pattern 4: Cross-App State Tracking

Track player actions across multiple apps:

```retro
# Initialize state file
write '{"found": [], "phase": 1}' to "C:/Users/User/Documents/.progress"

def updateProgress($action) {
  read "C:/Users/User/Documents/.progress" into $raw
  set $state = call fromJSON $raw
  set $found = call push $state.found $action
  set $state = call set $state "found" $found
  write call toJSON $state to "C:/Users/User/Documents/.progress"
  return call count $found
}

on app:notepad:fileOpened {
  if call contains $event.path "classified" {
    set $total = call updateProgress "read_classified"
  }
}

on app:browser:navigate {
  if call contains $event.url "secret" {
    set $total = call updateProgress "found_secret_page"
  }
}

on app:zork:item:taken {
  set $total = call updateProgress "zork_item_" + $event.item
}
```

### Pattern 5: Environment Manipulation

Change the OS environment to create atmosphere:

```retro
# Glitch effect sequence
emit command:controlpanel:setSetting setting="crtEffect" value=true
emit command:displayproperties:setColorScheme scheme="highcontrast"
emit command:displayproperties:applySettings
play error
wait 2000

# Restore
emit command:displayproperties:setColorScheme scheme="win95"
emit command:displayproperties:applySettings
wait 500
emit command:controlpanel:setSetting setting="crtEffect" value=false
```

### Pattern 6: Autoexec Boot Experience

Use `autoexec.retro` to set up the entire ARG on boot:

```retro
# autoexec.retro - runs automatically at boot
print "Initializing experience..."

# Deploy files
mkdir "C:/Users/User/Documents/Evidence"
write "Case file #4471\nSubject: UNKNOWN\nStatus: OPEN" to "C:/Users/User/Documents/Evidence/case_4471.txt"
write "Exhibit A: Screenshot timestamp 03:14 AM" to "C:/Users/User/Documents/Evidence/exhibit_a.txt"

# Set up contacts
emit command:phone:addContact name="Agent K" number="555-1234" group="Contacts"
emit command:phone:addContact name="??? Unknown" number="555-0000" group="Unknown"

# Set up IM buddies
emit command:instantmessenger:addBuddy screenName="informant_x" group="Contacts"

# Deploy initial email
emit command:inbox:deliverMessage from="dispatch@agency.gov" subject="New Assignment" body="Agent, your new case files are in C:/Users/User/Documents/Evidence. Review immediately.\n\nDO NOT discuss this on unsecured channels."

# Register global event handlers
on app:zork:command:entered {
  if call contains $event.command "xyzzy" {
    emit command:inbox:deliverMessage from="SYSTEM" subject="EASTER EGG FOUND" body="You know the old magic words. Impressive."
  }
}

notify "System ready. Check your inbox."
```

### Complete App ID Reference

Use these IDs in commands, queries, and events. IDs are the canonical
`super({id: ...})` values from each app class — verified against
`apps/AppRegistry.js`. 42 apps total.

| App ID | App Name |
|--------|----------|
| `adminpanel` | Admin Panel |
| `analytics-dashboard` | Analytics Dashboard |
| `asteroids` | Asteroids |
| `bonzibuddy` | BonziBuddy |
| `browser` | Browser |
| `calculator` | Calculator |
| `calendar` | Calendar |
| `campaign-studio` | Campaign Studio |
| `chatroom` | Chat Room |
| `clock` | Clock |
| `controlpanel` | Control Panel |
| `defrag` | Defrag |
| `display` | Display Properties |
| `doom` | Doom |
| `dosbox` | DOSBox |
| `features-settings` | Features Settings |
| `find` | Find Files |
| `freecell` | FreeCell |
| `gamelobby` | Game Lobby |
| `help` | Help System |
| `hypercard` | HyperCard |
| `inbox` | Inbox (Email) |
| `instantmessenger` | Instant Messenger |
| `mediaplayer` | Media Player (audio + video) |
| `minesweeper` | Minesweeper |
| `mycomputer` | My Computer |
| `notepad` | Notepad |
| `paint` | Paint |
| `phone` | Phone |
| `recyclebin` | Recycle Bin |
| `run` | Run Dialog |
| `scriptrunner` | Script Runner |
| `showrunner-console` | Showrunner Console |
| `skifree` | SkiFree |
| `snake` | Snake |
| `solitaire` | Solitaire |
| `sounds` | Sound Settings |
| `taskmgr` | Task Manager |
| `terminal` | Terminal |
| `tetris` | Tetris |
| `timeline-editor` | Timeline Editor |
| `zork` | Zork |

## 31) Multimedia Cue System (Phase 2)

Phase 2 adds full multimedia cue scripting for ARG campaigns. All functions are available in Script Runner, Terminal, and autoexec scripts.

### audio.* — Audio Cue Playback

```retro
# Play an audio cue with channel grouping
set $cue = call audio.play "forest-ambience" { group: "ambience", volume: 0.4, loop: true }

# Play a one-shot stinger
call audio.play "alert-stinger" { group: "stinger", volume: 0.7 }

# Duck ambient audio during voice lines
call audio.duck "ambience" 0.2 5000

# Restore ambient volume
call audio.restore "ambience"

# Stop a specific cue
call audio.stop $cue

# Stop all audio
call audio.stop

# Check active cues
set $active = call audio.activeCues
```

### video.* — Video Cue Playback

```retro
# Play a video cue
set $vid = call video.play "intro-cinematic" { volume: 0.8, fullscreen: true }

# Pause / seek
call video.pause $vid
call video.seek $vid 5000

# Stop video
call video.stop $vid
```

### image.* — Image Overlay Layers

```retro
# Show an image on a named layer
call image.show "overlay-1" "glitch-pattern" { opacity: 0.5, fadeInMs: 500 }

# Clear a specific layer
call image.clear "overlay-1"

# Clear all image layers
call image.clear
```

### subtitle.* — Text Overlays

```retro
# Show a subtitle with auto-clear
call subtitle.show "main" "The signal is getting stronger..." { durationMs: 4000, position: "bottom" }

# Manual clear
call subtitle.clear "main"
```

### fx.* — Visual Effects

```retro
# Apply a screen shake effect
call fx.apply "screen-shake" { intensity: 0.6, durationMs: 500 }

# Apply persistent glitch effect
call fx.apply "glitch" { intensity: 0.3 }

# Clear a specific effect
call fx.clear "glitch"

# Clear all effects
call fx.clear
```

### media.* — Cross-Cutting Helpers

```retro
# Preload assets for faster playback
call media.preload "forest-ambience" { priority: 1 }

# Resolve an asset to see its definition
set $info = call media.resolve "forest-ambience"

# Check current budget state
set $budget = call media.budget

# Emergency stop all media
call media.stopAll
```

### Combined ARG Pattern: Multimedia Scene

```retro
# Set up a tense investigation scene
call story.start "case-file-42"
call scene.enter "interrogation"
call mood.set "tense"

# Layer audio atmosphere
call audio.play "room-tone" { group: "ambience", volume: 0.3, loop: true }
call audio.play "heartbeat" { group: "ambience", volume: 0.2, loop: true }

# Show surveillance overlay
call image.show "overlay" "static-noise" { opacity: 0.1 }

# Deliver story content
call subtitle.show "narrator" "Subject detected in Sector 7..." { durationMs: 5000 }
wait 5000

# Escalate tension
call audio.duck "ambience" 0.1 3000
call audio.play "alert-klaxon" { group: "stinger", volume: 0.8 }
call fx.apply "screen-shake" { intensity: 0.4, durationMs: 300 }
call subtitle.show "narrator" "BREACH DETECTED" { durationMs: 3000 }

# Clean up on scene end
on story:scene:exit {
  call media.stopAll
  call image.clear
  call subtitle.clear
  call fx.clear
}
```
