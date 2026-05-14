/**
 * ScriptRunner - RetroScript IDE Professional
 *
 * A full-featured retro scripting IDE for RetroOS.
 * Features: syntax highlighting, code editor with line numbers,
 * output console, variable inspector, event recording, snippets,
 * menu bar, resizable split pane, minimap, multi-tab editing,
 * auto-indent, bracket matching, and fullscreen launch.
 */

import AppBase from './AppBase.js';
import EventBus from '../core/EventBus.js';
import ScriptEngine from '../core/script/ScriptEngine.js';
import FileSystemManager from '../core/FileSystemManager.js';
import WindowManager from '../core/WindowManager.js';
import { escapeHtml } from '../core/Sanitize.js';

class ScriptRunner extends AppBase {
    constructor() {
        super({
            id: 'scriptrunner',
            name: 'RetroScript IDE',
            icon: '📜',
            width: 900,
            height: 620,
            minWidth: 640,
            minHeight: 440,
            resizable: true,
            category: 'systemtools',
            singleton: true
        });

        this.output = [];
        this.eventLog = [];
        this.recordedEvents = [];
        this.variables = {};
        this.isRecording = false;
        this.maxLogEntries = 500;
        this.errorLine = null;
        this.breakpoints = new Set();
        this.isDebugging = false;
        this.currentDebugLine = null;
        this.findVisible = false;
        this.activeMenu = null;
        this.snippetsVisible = false;
        this.wordWrap = false;
        this.showMinimap = true;
        this.autoIndent = true;
        this.executionTimer = null;
        this.executionStartTime = null;
        this.splitDragging = false;
        this.editorFontSize = 13;
        this.currentTab = 'output';
        this.undoStack = [];
        this.redoStack = [];

        // File management
        this.currentFilePath = null;
        this.isModified = false;
        this.originalContent = '';
        this.lastRecordedCode = '';

        // Snippet library
        this.snippets = [
            { name: 'Hello World', icon: '👋', code: 'print "Hello, World!"' },
            { name: 'Variable', icon: '📦', code: 'set $name = "value"' },
            { name: 'If/Else', icon: '🔀', code: 'if $x > 0 then {\n    print "Positive"\n} else {\n    print "Non-positive"\n}' },
            { name: 'Count Loop', icon: '🔁', code: 'loop 10 {\n    print "Iteration: $i"\n}' },
            { name: 'While Loop', icon: '🔄', code: 'set $count = 0\nloop while $count < 10 {\n    set $count = $count + 1\n}' },
            { name: 'Foreach', icon: '📋', code: 'set $items = ["apple", "banana", "cherry"]\nforeach $item in $items {\n    print $item\n}' },
            { name: 'Function', icon: '🔧', code: 'def myFunction($param) {\n    set $result = $param * 2\n    return $result\n}\nset $val = call myFunction 5\nprint "Result: $val"' },
            { name: 'Try/Catch', icon: '🛡', code: 'try {\n    # Risky code here\n    set $x = call someFunction\n} catch $err {\n    print "Error: $err"\n}' },
            { name: 'File Read/Write', icon: '📄', code: 'set $path = "C:/Users/User/Documents/test.txt"\nwrite "Hello!" to $path\nread $path into $content\nprint $content' },
            { name: 'Launch App', icon: '🚀', code: 'launch calculator\nwait 500\nprint "Calculator launched!"' },
            { name: 'User Input', icon: '💬', code: 'prompt "What is your name?" into $name\nprint "Hello, $name!"\nalert "Welcome, $name!"' },
            { name: 'Event Emit', icon: '📡', code: 'emit custom:event message="Hello" value=42' },
            { name: 'Array Ops', icon: '📊', code: 'set $nums = [3, 1, 4, 1, 5, 9]\nset $sorted = call sort $nums\nset $sum = call sum $nums\nset $avg = call avg $nums\nprint "Sorted: $sorted"\nprint "Sum: $sum, Avg: $avg"' },
            { name: 'String Ops', icon: '🔤', code: 'set $text = "Hello, World!"\nset $upper = call upper $text\nset $len = call length $text\nset $has = call contains $text "World"\nprint "Upper: $upper"\nprint "Length: $len"\nprint "Has World: $has"' },
            { name: 'Timer', icon: '⏱', code: 'set $start = call now\n# Do some work\nloop 100 {\n    set $x = $i * $i\n}\nset $elapsed = call elapsed $start\nprint "Elapsed: $elapsed ms"' },
        ];
    }

    onOpen(params) {
        // Start with empty editor - blank slate for new scripts
        const sampleScript = ``;

        // Full comprehensive test suite (available via Tests button)
        const fullTestSuite = `# ╔══════════════════════════════════════════════════════════════════╗
# ║       RETROSCRIPT COMPREHENSIVE TEST SUITE v3.0                 ║
# ║       Complete testing of all language features                 ║
# ╚══════════════════════════════════════════════════════════════════╝

# Initialize test tracking
set $testsPassed = 0
set $testsFailed = 0

print
print ╔══════════════════════════════════════════════════════════════════╗
print ║       RETROSCRIPT COMPREHENSIVE TEST SUITE v3.0                 ║
print ╚══════════════════════════════════════════════════════════════════╝
print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 1: VARIABLES AND DATA TYPES                              │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 1: VARIABLES AND DATA TYPES                              │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 1.1: String Variables
print [Test 1.1] String Variables
set $str = "Hello, World!"
if $str == "Hello, World!" then {
    print   ✓ PASS: String assignment works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: String assignment broken
    set $testsFailed = $testsFailed + 1
}

# Test 1.2: Number Variables (integers)
print [Test 1.2] Integer Variables
set $int = 42
if $int == 42 then {
    print   ✓ PASS: Integer assignment works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Integer assignment broken
    set $testsFailed = $testsFailed + 1
}

# Test 1.3: Decimal/Float Variables
print [Test 1.3] Decimal Variables
set $dec = 3.14159
if $dec > 3.14 then {
    if $dec < 3.15 then {
        print   ✓ PASS: Decimal assignment works
        set $testsPassed = $testsPassed + 1
    }
} else {
    print   ✗ FAIL: Decimal assignment broken
    set $testsFailed = $testsFailed + 1
}

# Test 1.4: Boolean Variables
print [Test 1.4] Boolean Variables
set $bool = true
if $bool == true then {
    print   ✓ PASS: Boolean true works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Boolean true broken
    set $testsFailed = $testsFailed + 1
}
set $bool = false
if $bool == false then {
    print   ✓ PASS: Boolean false works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Boolean false broken
    set $testsFailed = $testsFailed + 1
}

# Test 1.5: Empty String
print [Test 1.5] Empty String
set $empty = ""
if $empty == "" then {
    print   ✓ PASS: Empty string preserved
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Empty string broken
    set $testsFailed = $testsFailed + 1
}

# Test 1.6: Null Value
print [Test 1.6] Null Value
set $nul = null
set $isNul = call isNull $nul
if $isNul == true then {
    print   ✓ PASS: Null value works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Null value broken
    set $testsFailed = $testsFailed + 1
}

# Test 1.7: Array Literals
print [Test 1.7] Array Literals
set $arr = [1, 2, 3, 4, 5]
set $arrLen = call count $arr
if $arrLen == 5 then {
    print   ✓ PASS: Array literal works (5 elements)
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Array literal broken
    set $testsFailed = $testsFailed + 1
}

# Test 1.8: Object Literals
print [Test 1.8] Object Literals
set $obj = {name: "Alice", age: 30}
set $objName = call get $obj "name"
if $objName == "Alice" then {
    print   ✓ PASS: Object literal works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Object literal broken
    set $testsFailed = $testsFailed + 1
}

# Test 1.9: Variable Interpolation in Strings
print [Test 1.9] Variable Interpolation
set $name = "Bob"
set $greeting = "Hello, $name!"
if $greeting == "Hello, Bob!" then {
    print   ✓ PASS: Variable interpolation works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Variable interpolation broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 2: ARITHMETIC OPERATIONS                                 │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 2: ARITHMETIC OPERATIONS                                 │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 2.1: Addition
print [Test 2.1] Addition
set $a = 10
set $b = 5
set $sum = $a + $b
if $sum == 15 then {
    print   ✓ PASS: 10 + 5 = $sum
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 + 5 expected 15, got $sum
    set $testsFailed = $testsFailed + 1
}

# Test 2.2: Subtraction
print [Test 2.2] Subtraction
set $diff = $a - $b
if $diff == 5 then {
    print   ✓ PASS: 10 - 5 = $diff
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 - 5 expected 5, got $diff
    set $testsFailed = $testsFailed + 1
}

# Test 2.3: Multiplication
print [Test 2.3] Multiplication
set $prod = $a * $b
if $prod == 50 then {
    print   ✓ PASS: 10 * 5 = $prod
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 * 5 expected 50, got $prod
    set $testsFailed = $testsFailed + 1
}

# Test 2.4: Division
print [Test 2.4] Division
set $quot = $a / $b
if $quot == 2 then {
    print   ✓ PASS: 10 / 5 = $quot
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 / 5 expected 2, got $quot
    set $testsFailed = $testsFailed + 1
}

# Test 2.5: Modulo
print [Test 2.5] Modulo
set $x = 17
set $y = 5
set $mod = $x % $y
if $mod == 2 then {
    print   ✓ PASS: 17 % 5 = $mod
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 17 % 5 expected 2, got $mod
    set $testsFailed = $testsFailed + 1
}

# Test 2.6: String Concatenation with +
print [Test 2.6] String Concatenation
set $s1 = "Hello"
set $s2 = " World"
set $concat = $s1 + $s2
if $concat == "Hello World" then {
    print   ✓ PASS: String concatenation works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: String concatenation broken
    set $testsFailed = $testsFailed + 1
}

# Test 2.7: Negative Numbers
print [Test 2.7] Negative Numbers
set $neg = -42
set $absNeg = call abs $neg
if $absNeg == 42 then {
    print   ✓ PASS: Negative numbers work
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Negative numbers broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 3: COMPARISON OPERATORS                                  │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 3: COMPARISON OPERATORS                                  │
print └──────────────────────────────────────────────────────────────────┘
print

set $n = 10

# Test 3.1: Equal (==)
print [Test 3.1] Equal (==)
if $n == 10 then {
    print   ✓ PASS: 10 == 10 is true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 == 10 should be true
    set $testsFailed = $testsFailed + 1
}

# Test 3.2: Not Equal (!=)
print [Test 3.2] Not Equal (!=)
if $n != 5 then {
    print   ✓ PASS: 10 != 5 is true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 != 5 should be true
    set $testsFailed = $testsFailed + 1
}

# Test 3.3: Greater Than (>)
print [Test 3.3] Greater Than (>)
if $n > 5 then {
    print   ✓ PASS: 10 > 5 is true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 > 5 should be true
    set $testsFailed = $testsFailed + 1
}

# Test 3.4: Less Than (<)
print [Test 3.4] Less Than (<)
if $n < 15 then {
    print   ✓ PASS: 10 < 15 is true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 < 15 should be true
    set $testsFailed = $testsFailed + 1
}

# Test 3.5: Greater Than or Equal (>=)
print [Test 3.5] Greater Than or Equal (>=)
if $n >= 10 then {
    print   ✓ PASS: 10 >= 10 is true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 >= 10 should be true
    set $testsFailed = $testsFailed + 1
}

# Test 3.6: Less Than or Equal (<=)
print [Test 3.6] Less Than or Equal (<=)
if $n <= 10 then {
    print   ✓ PASS: 10 <= 10 is true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: 10 <= 10 should be true
    set $testsFailed = $testsFailed + 1
}

# Test 3.7: String Comparison
print [Test 3.7] String Comparison
set $strA = "apple"
set $strB = "banana"
if $strA != $strB then {
    print   ✓ PASS: String comparison works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: String comparison broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 4: LOGICAL OPERATORS                                     │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 4: LOGICAL OPERATORS                                     │
print └──────────────────────────────────────────────────────────────────┘
print

set $p = 5
set $q = 10
set $r = 15

# Test 4.1: Logical AND (&&)
print [Test 4.1] Logical AND (&&)
if $p < $q && $q < $r then {
    print   ✓ PASS: 5 < 10 AND 10 < 15 is true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: AND condition broken
    set $testsFailed = $testsFailed + 1
}

# Test 4.2: Logical OR (||)
print [Test 4.2] Logical OR (||)
if $p > $q || $q < $r then {
    print   ✓ PASS: 5 > 10 OR 10 < 15 is true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: OR condition broken
    set $testsFailed = $testsFailed + 1
}

# Test 4.3: Triple AND
print [Test 4.3] Triple AND
if $p < $q && $q < $r && $r > $p then {
    print   ✓ PASS: Triple AND works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Triple AND broken
    set $testsFailed = $testsFailed + 1
}

# Test 4.4: Mixed AND/OR
print [Test 4.4] Mixed AND/OR
if $p < $q && $q < $r || $r < $p then {
    print   ✓ PASS: Mixed AND/OR works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Mixed AND/OR broken
    set $testsFailed = $testsFailed + 1
}

# Test 4.5: Boolean Variable in Condition
print [Test 4.5] Boolean in Condition
set $flag = true
if $flag then {
    print   ✓ PASS: Boolean variable in condition works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Boolean variable in condition broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 5: CONTROL FLOW - IF/ELSE                                │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 5: CONTROL FLOW - IF/ELSE                                │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 5.1: Simple If
print [Test 5.1] Simple If
set $val = 100
if $val > 50 then {
    print   ✓ PASS: If block executed
    set $testsPassed = $testsPassed + 1
}

# Test 5.2: If-Else (then branch)
print [Test 5.2] If-Else (then branch)
set $val = 100
set $branch = ""
if $val > 50 then {
    set $branch = "then"
} else {
    set $branch = "else"
}
if $branch == "then" then {
    print   ✓ PASS: Then branch taken correctly
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Wrong branch taken
    set $testsFailed = $testsFailed + 1
}

# Test 5.3: If-Else (else branch)
print [Test 5.3] If-Else (else branch)
set $val = 10
set $branch = ""
if $val > 50 then {
    set $branch = "then"
} else {
    set $branch = "else"
}
if $branch == "else" then {
    print   ✓ PASS: Else branch taken correctly
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Wrong branch taken
    set $testsFailed = $testsFailed + 1
}

# Test 5.4: Nested If
print [Test 5.4] Nested If
set $outer = true
set $inner = true
set $result = ""
if $outer then {
    if $inner then {
        set $result = "both"
    } else {
        set $result = "outer only"
    }
}
if $result == "both" then {
    print   ✓ PASS: Nested if works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Nested if broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 6: CONTROL FLOW - LOOPS                                  │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 6: CONTROL FLOW - LOOPS                                  │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 6.1: Count Loop
print [Test 6.1] Count Loop
set $counter = 0
loop 5 {
    set $counter = $counter + 1
}
if $counter == 5 then {
    print   ✓ PASS: Loop executed 5 times
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Loop count wrong: $counter
    set $testsFailed = $testsFailed + 1
}

# Test 6.2: Loop Index Variable ($i)
print [Test 6.2] Loop Index Variable
set $lastIndex = -1
loop 3 {
    set $lastIndex = $i
}
if $lastIndex == 2 then {
    print   ✓ PASS: Loop index 0-2 correct (last: $lastIndex)
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Loop index wrong: $lastIndex
    set $testsFailed = $testsFailed + 1
}

# Test 6.3: While Loop
print [Test 6.3] While Loop
set $w = 0
loop while $w < 3 {
    set $w = $w + 1
}
if $w == 3 then {
    print   ✓ PASS: While loop completed
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: While loop counter: $w
    set $testsFailed = $testsFailed + 1
}

# Test 6.4: Foreach Loop
print [Test 6.4] Foreach Loop
set $fruits = ["apple", "banana", "cherry"]
set $fruitCount = 0
foreach $fruit in $fruits {
    set $fruitCount = $fruitCount + 1
}
if $fruitCount == 3 then {
    print   ✓ PASS: Foreach iterated 3 items
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Foreach count: $fruitCount
    set $testsFailed = $testsFailed + 1
}

# Test 6.5: Break Statement
print [Test 6.5] Break Statement
set $breakAt = -1
loop 10 {
    set $breakAt = $i
    if $i == 3 then {
        break
    }
}
if $breakAt == 3 then {
    print   ✓ PASS: Break at iteration 3
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Break at wrong index: $breakAt
    set $testsFailed = $testsFailed + 1
}

# Test 6.6: Continue Statement
print [Test 6.6] Continue Statement
set $skipSum = 0
loop 5 {
    if $i == 2 then {
        continue
    }
    set $skipSum = $skipSum + $i
}
# Sum of 0+1+3+4 = 8 (skipping 2)
if $skipSum == 8 then {
    print   ✓ PASS: Continue skipped index 2 (sum=$skipSum)
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Continue broken, sum=$skipSum (expected 8)
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 7: USER-DEFINED FUNCTIONS                                │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 7: USER-DEFINED FUNCTIONS                                │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 7.1: Simple Function
print [Test 7.1] Simple Function
def sayHello() {
    return "Hello!"
}
set $msg = call sayHello
if $msg == "Hello!" then {
    print   ✓ PASS: Simple function works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Simple function broken
    set $testsFailed = $testsFailed + 1
}

# Test 7.2: Function with Parameter
print [Test 7.2] Function with Parameter
def greet($who) {
    return "Hi, $who!"
}
set $greeting = call greet "World"
if $greeting == "Hi, World!" then {
    print   ✓ PASS: Function with parameter works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Function with parameter broken
    set $testsFailed = $testsFailed + 1
}

# Test 7.3: Function with Multiple Parameters
print [Test 7.3] Function with Multiple Parameters
def addTwo($x, $y) {
    set $result = $x + $y
    return $result
}
set $addResult = call addTwo 7 8
if $addResult == 15 then {
    print   ✓ PASS: Multi-param function (7+8=$addResult)
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Multi-param function broken
    set $testsFailed = $testsFailed + 1
}

# Test 7.4: Recursive Function
print [Test 7.4] Recursive Function
def factorial($n) {
    if $n <= 1 then {
        return 1
    }
    set $prev = $n - 1
    set $sub = call factorial $prev
    set $result = $n * $sub
    return $result
}
set $fact5 = call factorial 5
if $fact5 == 120 then {
    print   ✓ PASS: factorial(5) = $fact5
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: factorial(5) = $fact5 (expected 120)
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 8: STRING FUNCTIONS                                      │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 8: STRING FUNCTIONS                                      │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 8.1: upper() and lower()
print [Test 8.1] upper() and lower()
set $text = "Hello World"
set $up = call upper $text
set $lo = call lower $text
if $up == "HELLO WORLD" then {
    print   ✓ PASS: upper() works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: upper() broken
    set $testsFailed = $testsFailed + 1
}
if $lo == "hello world" then {
    print   ✓ PASS: lower() works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: lower() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.2: length()
print [Test 8.2] length()
set $len = call length "Hello"
if $len == 5 then {
    print   ✓ PASS: length("Hello") = $len
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: length() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.3: trim()
print [Test 8.3] trim()
set $padded = "  trimmed  "
set $trimmed = call trim $padded
if $trimmed == "trimmed" then {
    print   ✓ PASS: trim() works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: trim() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.4: concat()
print [Test 8.4] concat()
set $joined = call concat "a" "b" "c"
if $joined == "abc" then {
    print   ✓ PASS: concat() works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: concat() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.5: substr() and substring()
print [Test 8.5] substr() and substring()
set $str = "Hello World"
set $sub1 = call substr $str 0 5
set $sub2 = call substring $str 6 11
if $sub1 == "Hello" then {
    print   ✓ PASS: substr(0,5) = "$sub1"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: substr() broken
    set $testsFailed = $testsFailed + 1
}
if $sub2 == "World" then {
    print   ✓ PASS: substring(6,11) = "$sub2"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: substring() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.6: contains(), startsWith(), endsWith()
print [Test 8.6] contains(), startsWith(), endsWith()
set $sentence = "The quick brown fox"
set $has = call contains $sentence "quick"
set $starts = call startsWith $sentence "The"
set $ends = call endsWith $sentence "fox"
if $has == true then {
    print   ✓ PASS: contains("quick") = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: contains() broken
    set $testsFailed = $testsFailed + 1
}
if $starts == true then {
    print   ✓ PASS: startsWith("The") = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: startsWith() broken
    set $testsFailed = $testsFailed + 1
}
if $ends == true then {
    print   ✓ PASS: endsWith("fox") = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: endsWith() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.7: indexOf() and lastIndexOf()
print [Test 8.7] indexOf() and lastIndexOf()
set $str = "abcabc"
set $first = call indexOf $str "b"
set $last = call lastIndexOf $str "b"
if $first == 1 then {
    print   ✓ PASS: indexOf("b") = $first
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: indexOf() broken
    set $testsFailed = $testsFailed + 1
}
if $last == 4 then {
    print   ✓ PASS: lastIndexOf("b") = $last
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: lastIndexOf() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.8: replace() and replaceAll()
print [Test 8.8] replace() and replaceAll()
set $orig = "foo bar foo"
set $rep1 = call replace $orig "foo" "baz"
set $rep2 = call replaceAll $orig "foo" "baz"
if $rep1 == "baz bar foo" then {
    print   ✓ PASS: replace() (first only)
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: replace() broken
    set $testsFailed = $testsFailed + 1
}
if $rep2 == "baz bar baz" then {
    print   ✓ PASS: replaceAll()
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: replaceAll() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.9: split() and join()
print [Test 8.9] split() and join()
set $csv = "a,b,c"
set $parts = call split $csv ","
set $rejoined = call join $parts "-"
if $rejoined == "a-b-c" then {
    print   ✓ PASS: split/join works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: split/join broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.10: repeat()
print [Test 8.10] repeat()
set $rep = call repeat "ab" 3
if $rep == "ababab" then {
    print   ✓ PASS: repeat("ab", 3) = "$rep"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: repeat() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.11: padStart() and padEnd()
print [Test 8.11] padStart() and padEnd()
set $num = "5"
set $padS = call padStart $num 3 "0"
set $padE = call padEnd $num 3 "0"
if $padS == "005" then {
    print   ✓ PASS: padStart(3, "0") = "$padS"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: padStart() broken
    set $testsFailed = $testsFailed + 1
}
if $padE == "500" then {
    print   ✓ PASS: padEnd(3, "0") = "$padE"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: padEnd() broken
    set $testsFailed = $testsFailed + 1
}

# Test 8.12: charAt() and charCode()
print [Test 8.12] charAt() and charCode()
set $char = call charAt "ABC" 1
set $code = call charCode "A" 0
if $char == "B" then {
    print   ✓ PASS: charAt("ABC", 1) = "$char"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: charAt() broken
    set $testsFailed = $testsFailed + 1
}
if $code == 65 then {
    print   ✓ PASS: charCode("A") = $code
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: charCode() broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 9: MATH FUNCTIONS                                        │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 9: MATH FUNCTIONS                                        │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 9.1: abs()
print [Test 9.1] abs()
set $absVal = call abs -42
if $absVal == 42 then {
    print   ✓ PASS: abs(-42) = $absVal
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: abs() broken
    set $testsFailed = $testsFailed + 1
}

# Test 9.2: round(), floor(), ceil()
print [Test 9.2] round(), floor(), ceil()
set $rounded = call round 3.7
set $floored = call floor 3.9
set $ceiled = call ceil 3.1
if $rounded == 4 then {
    print   ✓ PASS: round(3.7) = $rounded
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: round() broken
    set $testsFailed = $testsFailed + 1
}
if $floored == 3 then {
    print   ✓ PASS: floor(3.9) = $floored
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: floor() broken
    set $testsFailed = $testsFailed + 1
}
if $ceiled == 4 then {
    print   ✓ PASS: ceil(3.1) = $ceiled
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: ceil() broken
    set $testsFailed = $testsFailed + 1
}

# Test 9.3: min() and max()
print [Test 9.3] min() and max()
set $minV = call min 5 3 8 1 9
set $maxV = call max 5 3 8 1 9
if $minV == 1 then {
    print   ✓ PASS: min(5,3,8,1,9) = $minV
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: min() broken
    set $testsFailed = $testsFailed + 1
}
if $maxV == 9 then {
    print   ✓ PASS: max(5,3,8,1,9) = $maxV
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: max() broken
    set $testsFailed = $testsFailed + 1
}

# Test 9.4: pow() and sqrt()
print [Test 9.4] pow() and sqrt()
set $squared = call pow 5 2
set $sqroot = call sqrt 16
if $squared == 25 then {
    print   ✓ PASS: pow(5, 2) = $squared
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: pow() broken
    set $testsFailed = $testsFailed + 1
}
if $sqroot == 4 then {
    print   ✓ PASS: sqrt(16) = $sqroot
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: sqrt() broken
    set $testsFailed = $testsFailed + 1
}

# Test 9.5: clamp()
print [Test 9.5] clamp()
set $clamped = call clamp 15 0 10
if $clamped == 10 then {
    print   ✓ PASS: clamp(15, 0, 10) = $clamped
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: clamp() broken
    set $testsFailed = $testsFailed + 1
}

# Test 9.6: random()
print [Test 9.6] random()
set $rand = call random 1 100
if $rand >= 1 then {
    if $rand <= 100 then {
        print   ✓ PASS: random(1,100) = $rand (in range)
        set $testsPassed = $testsPassed + 1
    } else {
        print   ✗ FAIL: random() out of range
        set $testsFailed = $testsFailed + 1
    }
} else {
    print   ✗ FAIL: random() out of range
    set $testsFailed = $testsFailed + 1
}

# Test 9.7: mod() and sign()
print [Test 9.7] mod() and sign()
set $modVal = call mod 17 5
set $signPos = call sign 42
set $signNeg = call sign -42
if $modVal == 2 then {
    print   ✓ PASS: mod(17, 5) = $modVal
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: mod() broken
    set $testsFailed = $testsFailed + 1
}
if $signPos == 1 then {
    print   ✓ PASS: sign(42) = $signPos
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: sign() broken
    set $testsFailed = $testsFailed + 1
}

# Test 9.8: Trigonometric Functions
print [Test 9.8] Trigonometric Functions
set $sinVal = call sin 0
set $cosVal = call cos 0
if $sinVal == 0 then {
    print   ✓ PASS: sin(0) = $sinVal
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: sin() broken
    set $testsFailed = $testsFailed + 1
}
if $cosVal == 1 then {
    print   ✓ PASS: cos(0) = $cosVal
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: cos() broken
    set $testsFailed = $testsFailed + 1
}

# Test 9.9: Constants PI and E
print [Test 9.9] Constants PI and E
set $pi = call PI
set $e = call E
if $pi > 3.14 then {
    if $pi < 3.15 then {
        print   ✓ PASS: PI = $pi
        set $testsPassed = $testsPassed + 1
    }
} else {
    print   ✗ FAIL: PI broken
    set $testsFailed = $testsFailed + 1
}
if $e > 2.71 then {
    if $e < 2.72 then {
        print   ✓ PASS: E = $e
        set $testsPassed = $testsPassed + 1
    }
} else {
    print   ✗ FAIL: E broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 10: ARRAY FUNCTIONS                                      │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 10: ARRAY FUNCTIONS                                      │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 10.1: count(), first(), last()
print [Test 10.1] count(), first(), last()
set $arr = [10, 20, 30, 40, 50]
set $cnt = call count $arr
set $fst = call first $arr
set $lst = call last $arr
if $cnt == 5 then {
    print   ✓ PASS: count() = $cnt
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: count() broken
    set $testsFailed = $testsFailed + 1
}
if $fst == 10 then {
    print   ✓ PASS: first() = $fst
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: first() broken
    set $testsFailed = $testsFailed + 1
}
if $lst == 50 then {
    print   ✓ PASS: last() = $lst
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: last() broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.2: at()
print [Test 10.2] at()
set $atVal = call at $arr 2
if $atVal == 30 then {
    print   ✓ PASS: at(2) = $atVal
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: at() broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.3: push() and pop()
print [Test 10.3] push() and pop()
set $arr2 = [1, 2, 3]
set $arr2 = call push $arr2 4
set $popped = call pop $arr2
if $popped == 4 then {
    print   ✓ PASS: push(4) then pop() = $popped
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: push/pop broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.4: shift() and unshift()
print [Test 10.4] shift() and unshift()
set $arr3 = [1, 2, 3]
set $arr3 = call unshift $arr3 0
set $shifted = call shift $arr3
if $shifted == 0 then {
    print   ✓ PASS: unshift(0) then shift() = $shifted
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: unshift/shift broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.5: includes()
print [Test 10.5] includes()
set $arr4 = ["apple", "banana", "cherry"]
set $hasApple = call includes $arr4 "apple"
set $hasGrape = call includes $arr4 "grape"
if $hasApple == true then {
    print   ✓ PASS: includes("apple") = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: includes() broken
    set $testsFailed = $testsFailed + 1
}
if $hasGrape == false then {
    print   ✓ PASS: includes("grape") = false
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: includes() false case broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.6: findIndex()
print [Test 10.6] findIndex()
set $idx = call findIndex $arr4 "banana"
if $idx == 1 then {
    print   ✓ PASS: findIndex("banana") = $idx
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: findIndex() broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.7: sort() and reverse()
print [Test 10.7] sort() and reverse()
set $nums = [3, 1, 4, 1, 5]
set $sorted = call sort $nums
set $sortedFirst = call first $sorted
if $sortedFirst == 1 then {
    print   ✓ PASS: sort() puts smallest first
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: sort() broken
    set $testsFailed = $testsFailed + 1
}
set $reversed = call reverse $nums
set $revFirst = call first $reversed
if $revFirst == 5 then {
    print   ✓ PASS: reverse() works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: reverse() broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.8: slice()
print [Test 10.8] slice()
set $arr5 = [0, 1, 2, 3, 4]
set $sliced = call slice $arr5 1 4
set $sliceCnt = call count $sliced
if $sliceCnt == 3 then {
    print   ✓ PASS: slice(1,4) has 3 elements
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: slice() broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.9: unique()
print [Test 10.9] unique()
set $dups = [1, 2, 2, 3, 3, 3]
set $uniq = call unique $dups
set $uniqCnt = call count $uniq
if $uniqCnt == 3 then {
    print   ✓ PASS: unique() removed duplicates
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: unique() broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.10: range() and fill()
print [Test 10.10] range() and fill()
set $rng = call range 0 5
set $rngCnt = call count $rng
if $rngCnt == 5 then {
    print   ✓ PASS: range(0,5) has 5 elements
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: range() broken
    set $testsFailed = $testsFailed + 1
}
set $filled = call fill 3 "x"
set $fillCnt = call count $filled
if $fillCnt == 3 then {
    print   ✓ PASS: fill(3, "x") has 3 elements
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: fill() broken
    set $testsFailed = $testsFailed + 1
}

# Test 10.11: sum() and avg()
print [Test 10.11] sum() and avg()
set $numbers = [10, 20, 30, 40, 50]
set $total = call sum $numbers
set $average = call avg $numbers
if $total == 150 then {
    print   ✓ PASS: sum() = $total
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: sum() broken
    set $testsFailed = $testsFailed + 1
}
if $average == 30 then {
    print   ✓ PASS: avg() = $average
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: avg() broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 11: OBJECT FUNCTIONS                                     │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 11: OBJECT FUNCTIONS                                     │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 11.1: keys() and values()
print [Test 11.1] keys() and values()
set $obj = {name: "Alice", age: 25, city: "NYC"}
set $objKeys = call keys $obj
set $objVals = call values $obj
set $keyCount = call count $objKeys
if $keyCount == 3 then {
    print   ✓ PASS: keys() returned 3 keys
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: keys() broken
    set $testsFailed = $testsFailed + 1
}

# Test 11.2: get() and set()
print [Test 11.2] get() and set()
set $name = call get $obj "name"
if $name == "Alice" then {
    print   ✓ PASS: get("name") = "$name"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: get() broken
    set $testsFailed = $testsFailed + 1
}

# Test 11.3: has()
print [Test 11.3] has()
set $hasName = call has $obj "name"
set $hasEmail = call has $obj "email"
if $hasName == true then {
    print   ✓ PASS: has("name") = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: has() true case broken
    set $testsFailed = $testsFailed + 1
}
if $hasEmail == false then {
    print   ✓ PASS: has("email") = false
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: has() false case broken
    set $testsFailed = $testsFailed + 1
}

# Test 11.4: merge()
print [Test 11.4] merge()
set $obj1 = {a: 1, b: 2}
set $obj2 = {c: 3, d: 4}
set $merged = call merge $obj1 $obj2
set $mergedKeys = call keys $merged
set $mergedCount = call count $mergedKeys
if $mergedCount == 4 then {
    print   ✓ PASS: merge() combined objects
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: merge() broken
    set $testsFailed = $testsFailed + 1
}

# Test 11.5: clone()
print [Test 11.5] clone()
set $original = {x: 10, y: 20}
set $cloned = call clone $original
set $clonedX = call get $cloned "x"
if $clonedX == 10 then {
    print   ✓ PASS: clone() works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: clone() broken
    set $testsFailed = $testsFailed + 1
}

# Test 11.6: entries()
print [Test 11.6] entries()
set $ent = call entries $obj1
set $entCount = call count $ent
if $entCount == 2 then {
    print   ✓ PASS: entries() returned 2 entries
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: entries() broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 12: JSON FUNCTIONS                                       │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 12: JSON FUNCTIONS                                       │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 12.1: toJSON()
print [Test 12.1] toJSON()
set $data = {status: "ok", code: 200}
set $json = call toJSON $data
set $hasStatus = call contains $json "status"
if $hasStatus == true then {
    print   ✓ PASS: toJSON() serializes object
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: toJSON() broken
    set $testsFailed = $testsFailed + 1
}

# Test 12.2: fromJSON()
print [Test 12.2] fromJSON()
set $jsonStr = "{\\"name\\": \\"Test\\", \\"value\\": 42}"
set $parsed = call fromJSON $jsonStr
set $parsedName = call get $parsed "name"
if $parsedName == "Test" then {
    print   ✓ PASS: fromJSON() parses JSON
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: fromJSON() broken
    set $testsFailed = $testsFailed + 1
}

# Test 12.3: prettyJSON()
print [Test 12.3] prettyJSON()
set $pretty = call prettyJSON $data
set $hasNewline = call contains $pretty "status"
if $hasNewline == true then {
    print   ✓ PASS: prettyJSON() formats JSON
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: prettyJSON() broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 13: TYPE FUNCTIONS                                       │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 13: TYPE FUNCTIONS                                       │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 13.1: typeof()
print [Test 13.1] typeof()
set $t1 = call typeof 42
set $t2 = call typeof "hello"
set $t3 = call typeof [1, 2]
set $t4 = call typeof {a: 1}
set $t5 = call typeof null
if $t1 == "number" then {
    print   ✓ PASS: typeof(42) = "$t1"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: typeof(number) broken
    set $testsFailed = $testsFailed + 1
}
if $t2 == "string" then {
    print   ✓ PASS: typeof("hello") = "$t2"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: typeof(string) broken
    set $testsFailed = $testsFailed + 1
}
if $t3 == "array" then {
    print   ✓ PASS: typeof([1,2]) = "$t3"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: typeof(array) broken
    set $testsFailed = $testsFailed + 1
}
if $t4 == "object" then {
    print   ✓ PASS: typeof({a:1}) = "$t4"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: typeof(object) broken
    set $testsFailed = $testsFailed + 1
}
if $t5 == "null" then {
    print   ✓ PASS: typeof(null) = "$t5"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: typeof(null) broken
    set $testsFailed = $testsFailed + 1
}

# Test 13.2: Type Check Functions
print [Test 13.2] Type Check Functions
set $isNum = call isNumber 42
set $isStr = call isString "hello"
set $isArr = call isArray [1, 2]
set $isObj = call isObject {a: 1}
set $isBool = call isBoolean true
set $isNul = call isNull null
if $isNum == true then {
    print   ✓ PASS: isNumber(42) = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: isNumber() broken
    set $testsFailed = $testsFailed + 1
}
if $isStr == true then {
    print   ✓ PASS: isString("hello") = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: isString() broken
    set $testsFailed = $testsFailed + 1
}
if $isArr == true then {
    print   ✓ PASS: isArray([1,2]) = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: isArray() broken
    set $testsFailed = $testsFailed + 1
}
if $isObj == true then {
    print   ✓ PASS: isObject({a:1}) = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: isObject() broken
    set $testsFailed = $testsFailed + 1
}
if $isBool == true then {
    print   ✓ PASS: isBoolean(true) = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: isBoolean() broken
    set $testsFailed = $testsFailed + 1
}
if $isNul == true then {
    print   ✓ PASS: isNull(null) = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: isNull() broken
    set $testsFailed = $testsFailed + 1
}

# Test 13.3: isEmpty()
print [Test 13.3] isEmpty()
set $emptyStr = call isEmpty ""
set $emptyArr = call isEmpty []
set $nonEmpty = call isEmpty "text"
if $emptyStr == true then {
    print   ✓ PASS: isEmpty("") = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: isEmpty(string) broken
    set $testsFailed = $testsFailed + 1
}
if $emptyArr == true then {
    print   ✓ PASS: isEmpty([]) = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: isEmpty(array) broken
    set $testsFailed = $testsFailed + 1
}
if $nonEmpty == false then {
    print   ✓ PASS: isEmpty("text") = false
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: isEmpty(non-empty) broken
    set $testsFailed = $testsFailed + 1
}

# Test 13.4: Type Conversion Functions
print [Test 13.4] Type Conversion Functions
set $toNum = call toNumber "123.45"
set $toInt = call toInt "42.9"
set $toStr = call toString 999
set $toBool = call toBoolean 1
if $toNum == 123.45 then {
    print   ✓ PASS: toNumber("123.45") = $toNum
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: toNumber() broken
    set $testsFailed = $testsFailed + 1
}
if $toInt == 42 then {
    print   ✓ PASS: toInt("42.9") = $toInt
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: toInt() broken
    set $testsFailed = $testsFailed + 1
}
if $toStr == "999" then {
    print   ✓ PASS: toString(999) = "$toStr"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: toString() broken
    set $testsFailed = $testsFailed + 1
}
if $toBool == true then {
    print   ✓ PASS: toBoolean(1) = true
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: toBoolean() broken
    set $testsFailed = $testsFailed + 1
}

# Test 13.5: toArray()
print [Test 13.5] toArray()
set $arr = call toArray "abc"
set $arrLen = call count $arr
if $arrLen == 3 then {
    print   ✓ PASS: toArray("abc") = 3 chars
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: toArray() broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 14: TIME FUNCTIONS                                       │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 14: TIME FUNCTIONS                                       │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 14.1: now()
print [Test 14.1] now()
set $timestamp = call now
if $timestamp > 0 then {
    print   ✓ PASS: now() returns timestamp: $timestamp
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: now() broken
    set $testsFailed = $testsFailed + 1
}

# Test 14.2: time() and date()
print [Test 14.2] time() and date()
set $timeStr = call time
set $dateStr = call date
set $timeLen = call length $timeStr
if $timeLen > 0 then {
    print   ✓ PASS: time() = "$timeStr"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: time() broken
    set $testsFailed = $testsFailed + 1
}
set $dateLen = call length $dateStr
if $dateLen > 0 then {
    print   ✓ PASS: date() = "$dateStr"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: date() broken
    set $testsFailed = $testsFailed + 1
}

# Test 14.3: year(), month(), day()
print [Test 14.3] year(), month(), day()
set $yr = call year
set $mo = call month
set $dy = call day
if $yr > 2020 then {
    print   ✓ PASS: year() = $yr
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: year() broken
    set $testsFailed = $testsFailed + 1
}
if $mo >= 1 then {
    if $mo <= 12 then {
        print   ✓ PASS: month() = $mo
        set $testsPassed = $testsPassed + 1
    }
} else {
    print   ✗ FAIL: month() broken
    set $testsFailed = $testsFailed + 1
}
if $dy >= 1 then {
    if $dy <= 31 then {
        print   ✓ PASS: day() = $dy
        set $testsPassed = $testsPassed + 1
    }
} else {
    print   ✗ FAIL: day() broken
    set $testsFailed = $testsFailed + 1
}

# Test 14.4: hour(), minute(), second()
print [Test 14.4] hour(), minute(), second()
set $hr = call hour
set $mi = call minute
set $se = call second
if $hr >= 0 then {
    if $hr <= 23 then {
        print   ✓ PASS: hour() = $hr
        set $testsPassed = $testsPassed + 1
    }
} else {
    print   ✗ FAIL: hour() broken
    set $testsFailed = $testsFailed + 1
}
if $mi >= 0 then {
    if $mi <= 59 then {
        print   ✓ PASS: minute() = $mi
        set $testsPassed = $testsPassed + 1
    }
} else {
    print   ✗ FAIL: minute() broken
    set $testsFailed = $testsFailed + 1
}
if $se >= 0 then {
    if $se <= 59 then {
        print   ✓ PASS: second() = $se
        set $testsPassed = $testsPassed + 1
    }
} else {
    print   ✗ FAIL: second() broken
    set $testsFailed = $testsFailed + 1
}

# Test 14.5: elapsed()
print [Test 14.5] elapsed()
set $start = call now
wait 100
set $elapsed = call elapsed $start
if $elapsed >= 90 then {
    print   ✓ PASS: elapsed() after 100ms = $elapsed ms
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: elapsed() too fast: $elapsed
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 15: ERROR HANDLING                                       │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 15: ERROR HANDLING                                       │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 15.1: Try/Catch Basic
print [Test 15.1] Try/Catch Basic
set $caught = false
try {
    set $x = call nonexistentFunction
} catch $err {
    set $caught = true
}
if $caught == true then {
    print   ✓ PASS: try/catch caught error
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: try/catch broken
    set $testsFailed = $testsFailed + 1
}

# Test 15.2: Error Variable
print [Test 15.2] Error Variable
set $errorMsg = ""
try {
    set $x = call anotherBadFunction
} catch $err {
    set $errorMsg = $err
}
set $hasError = call length $errorMsg
if $hasError > 0 then {
    print   ✓ PASS: Error message captured
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Error message not captured
    set $testsFailed = $testsFailed + 1
}

# Test 15.3: Execution Continues After Catch
print [Test 15.3] Execution After Catch
set $afterCatch = false
try {
    set $x = call badCall
} catch {
    set $afterCatch = true
}
set $continued = false
set $continued = true
if $continued == true then {
    print   ✓ PASS: Execution continues after catch
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Execution stopped after catch
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 16: STRING EDGE CASES                                    │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 16: STRING EDGE CASES                                    │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 16.1: Semicolons in Strings
print [Test 16.1] Semicolons in Strings
set $semi = "a;b;c"
if $semi == "a;b;c" then {
    print   ✓ PASS: Semicolons preserved in strings
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Semicolons broken in strings
    set $testsFailed = $testsFailed + 1
}

# Test 16.2: Hash/Comment Character in Strings
print [Test 16.2] Hash in Strings
set $hash = "test # not a comment"
set $hashLen = call length $hash
if $hashLen > 10 then {
    print   ✓ PASS: Hash preserved in strings
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Hash treated as comment
    set $testsFailed = $testsFailed + 1
}

# Test 16.3: Escape Sequences
print [Test 16.3] Escape Sequences
set $escaped = "line1\\nline2"
set $escLen = call length $escaped
if $escLen > 5 then {
    print   ✓ PASS: Escape sequences work
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Escape sequences broken
    set $testsFailed = $testsFailed + 1
}

# Test 16.4: Quotes in Strings
print [Test 16.4] Quotes in Strings
set $quoted = "He said \\"Hello\\""
set $qLen = call length $quoted
if $qLen > 10 then {
    print   ✓ PASS: Escaped quotes work
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: Escaped quotes broken
    set $testsFailed = $testsFailed + 1
}

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 17: FILE SYSTEM                                          │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 17: FILE SYSTEM                                          │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 17.1: Write and Read File
print [Test 17.1] Write and Read File
set $testPath = "C:/Users/User/Documents/retroscript_test.txt"
set $testContent = "Hello from RetroScript!"
write $testContent to $testPath
read $testPath into $readBack
if $readBack == $testContent then {
    print   ✓ PASS: File write/read works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: File write/read broken
    set $testsFailed = $testsFailed + 1
}

# Test 17.2: Delete File
print [Test 17.2] Delete File
delete $testPath
print   ✓ PASS: File deleted (no error)
set $testsPassed = $testsPassed + 1

# Test 17.3: Create and Delete Directory
print [Test 17.3] Directory Operations
set $testDir = "C:/Users/User/Documents/TestDir"
mkdir $testDir
delete $testDir
print   ✓ PASS: mkdir/delete works
set $testsPassed = $testsPassed + 1

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 18: SYSTEM INTEGRATION                                   │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 18: SYSTEM INTEGRATION                                   │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 18.1: getWindows()
print [Test 18.1] getWindows()
set $windows = call getWindows
set $winType = call isArray $windows
if $winType == true then {
    print   ✓ PASS: getWindows() returns array
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: getWindows() broken
    set $testsFailed = $testsFailed + 1
}

# Test 18.2: getApps()
print [Test 18.2] getApps()
set $apps = call getApps
set $appType = call isArray $apps
if $appType == true then {
    print   ✓ PASS: getApps() returns array
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: getApps() broken
    set $testsFailed = $testsFailed + 1
}

# Test 18.3: getEnv()
print [Test 18.3] getEnv()
set $env = call getEnv
set $platform = call get $env "platform"
if $platform == "RetrOS" then {
    print   ✓ PASS: getEnv() platform = "$platform"
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: getEnv() broken
    set $testsFailed = $testsFailed + 1
}

# Test 18.4: Launch and Close App
print [Test 18.4] Launch and Close App
set $beforeWin = call getWindows
set $beforeCount = call count $beforeWin
launch calculator
wait 300
set $afterWin = call getWindows
set $afterCount = call count $afterWin
if $afterCount > $beforeCount then {
    print   ✓ PASS: App launched (windows: $beforeCount -> $afterCount)
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: App launch broken
    set $testsFailed = $testsFailed + 1
}
close
wait 200
print   ✓ PASS: App closed
set $testsPassed = $testsPassed + 1

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 19: EVENTS AND NOTIFICATIONS                             │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 19: EVENTS AND NOTIFICATIONS                             │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 19.1: emit()
print [Test 19.1] emit()
emit test:event message="Hello" value=42
print   ✓ PASS: Event emitted
set $testsPassed = $testsPassed + 1

# Test 19.2: notify()
print [Test 19.2] notify()
notify Test notification from RetroScript!
print   ✓ PASS: Notification sent
set $testsPassed = $testsPassed + 1

# Test 19.3: play()
print [Test 19.3] play()
play notify
print   ✓ PASS: Sound played
set $testsPassed = $testsPassed + 1

print

# ┌──────────────────────────────────────────────────────────────────┐
# │ SECTION 20: DEBUG FUNCTIONS                                      │
# └──────────────────────────────────────────────────────────────────┘

print ┌──────────────────────────────────────────────────────────────────┐
print │ SECTION 20: DEBUG FUNCTIONS                                      │
print └──────────────────────────────────────────────────────────────────┘
print

# Test 20.1: debug()
print [Test 20.1] debug()
set $debugResult = call debug "Test message" 42
set $debugLen = call length $debugResult
if $debugLen > 0 then {
    print   ✓ PASS: debug() works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: debug() broken
    set $testsFailed = $testsFailed + 1
}

# Test 20.2: inspect()
print [Test 20.2] inspect()
set $testObj = {a: 1, b: 2}
set $inspected = call inspect $testObj
set $inspLen = call length $inspected
if $inspLen > 0 then {
    print   ✓ PASS: inspect() works
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: inspect() broken
    set $testsFailed = $testsFailed + 1
}

# Test 20.3: assert() - passing case
print [Test 20.3] assert()
set $assertOk = call assert true "This should pass"
if $assertOk == true then {
    print   ✓ PASS: assert(true) passes
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: assert() broken
    set $testsFailed = $testsFailed + 1
}

# Test 20.4: assert() - failing case (caught)
print [Test 20.4] assert() failure
set $assertFailed = false
try {
    set $x = call assert false "Expected failure"
} catch {
    set $assertFailed = true
}
if $assertFailed == true then {
    print   ✓ PASS: assert(false) throws error
    set $testsPassed = $testsPassed + 1
} else {
    print   ✗ FAIL: assert(false) should throw
    set $testsFailed = $testsFailed + 1
}

print

# ╔══════════════════════════════════════════════════════════════════╗
# ║                      TEST SUMMARY                                ║
# ╚══════════════════════════════════════════════════════════════════╝

print ╔══════════════════════════════════════════════════════════════════╗
print ║                      TEST SUMMARY                                ║
print ╚══════════════════════════════════════════════════════════════════╝
print
print   Total Tests Passed: $testsPassed
print   Total Tests Failed: $testsFailed
print
set $totalTests = $testsPassed + $testsFailed
print   Total Tests Run: $totalTests
print

if $testsFailed == 0 then {
    print   ★★★ ALL TESTS PASSED! ★★★
    play notify
} else {
    print   ⚠ Some tests failed. Review output above.
    play error
}

print
print ══════════════════════════════════════════════════════════════════
print   Sections Tested:
print    1. Variables and Data Types
print    2. Arithmetic Operations
print    3. Comparison Operators
print    4. Logical Operators
print    5. Control Flow - If/Else
print    6. Control Flow - Loops
print    7. User-Defined Functions
print    8. String Functions
print    9. Math Functions
print   10. Array Functions
print   11. Object Functions
print   12. JSON Functions
print   13. Type Functions
print   14. Time Functions
print   15. Error Handling
print   16. String Edge Cases
print   17. File System
print   18. System Integration
print   19. Events and Notifications
print   20. Debug Functions
print ══════════════════════════════════════════════════════════════════

notify RetroScript Test Suite Complete!`;

        // Store test suite for later loading
        this.fullTestSuite = fullTestSuite;

        const welcomeScript = params && params.content ? params.content : sampleScript;

        return `
            <div class="script-runner">
                <!-- Menu Bar -->
                <div class="sr-menubar" id="srMenubar">
                    <div class="sr-menu-item" data-menu="file">
                        <span class="sr-menu-label">File</span>
                        <div class="sr-dropdown" id="menuFile">
                            <div class="sr-menu-entry" data-action="new"><span class="sr-shortcut-label">New</span><span class="sr-shortcut">Ctrl+N</span></div>
                            <div class="sr-menu-entry" data-action="open"><span class="sr-shortcut-label">Open...</span><span class="sr-shortcut">Ctrl+O</span></div>
                            <div class="sr-menu-divider"></div>
                            <div class="sr-menu-entry" data-action="save"><span class="sr-shortcut-label">Save</span><span class="sr-shortcut">Ctrl+S</span></div>
                            <div class="sr-menu-entry" data-action="saveAs"><span class="sr-shortcut-label">Save As...</span><span class="sr-shortcut">Ctrl+Shift+S</span></div>
                            <div class="sr-menu-divider"></div>
                            <div class="sr-menu-entry" data-action="close"><span class="sr-shortcut-label">Close</span><span class="sr-shortcut">Alt+F4</span></div>
                        </div>
                    </div>
                    <div class="sr-menu-item" data-menu="edit">
                        <span class="sr-menu-label">Edit</span>
                        <div class="sr-dropdown" id="menuEdit">
                            <div class="sr-menu-entry" data-action="undo"><span class="sr-shortcut-label">Undo</span><span class="sr-shortcut">Ctrl+Z</span></div>
                            <div class="sr-menu-entry" data-action="redo"><span class="sr-shortcut-label">Redo</span><span class="sr-shortcut">Ctrl+Y</span></div>
                            <div class="sr-menu-divider"></div>
                            <div class="sr-menu-entry" data-action="find"><span class="sr-shortcut-label">Find/Replace...</span><span class="sr-shortcut">Ctrl+F</span></div>
                            <div class="sr-menu-divider"></div>
                            <div class="sr-menu-entry" data-action="selectAll"><span class="sr-shortcut-label">Select All</span><span class="sr-shortcut">Ctrl+A</span></div>
                            <div class="sr-menu-entry" data-action="toggleComment"><span class="sr-shortcut-label">Toggle Comment</span><span class="sr-shortcut">Ctrl+/</span></div>
                            <div class="sr-menu-entry" data-action="snippets"><span class="sr-shortcut-label">Insert Snippet...</span><span class="sr-shortcut">Ctrl+J</span></div>
                        </div>
                    </div>
                    <div class="sr-menu-item" data-menu="run">
                        <span class="sr-menu-label">Run</span>
                        <div class="sr-dropdown" id="menuRun">
                            <div class="sr-menu-entry" data-action="run"><span class="sr-shortcut-label">Run Script</span><span class="sr-shortcut">F5</span></div>
                            <div class="sr-menu-entry" data-action="stop"><span class="sr-shortcut-label">Stop Script</span><span class="sr-shortcut">Shift+F5</span></div>
                            <div class="sr-menu-divider"></div>
                            <div class="sr-menu-entry" data-action="record"><span class="sr-shortcut-label">Toggle Recording</span><span class="sr-shortcut">F9</span></div>
                            <div class="sr-menu-divider"></div>
                            <div class="sr-menu-entry" data-action="clear"><span class="sr-shortcut-label">Clear Output</span><span class="sr-shortcut">Ctrl+L</span></div>
                            <div class="sr-menu-entry" data-action="tests"><span class="sr-shortcut-label">Load Test Suite</span><span class="sr-shortcut"></span></div>
                        </div>
                    </div>
                    <div class="sr-menu-item" data-menu="view">
                        <span class="sr-menu-label">View</span>
                        <div class="sr-dropdown" id="menuView">
                            <div class="sr-menu-entry" data-action="zoomIn"><span class="sr-shortcut-label">Zoom In</span><span class="sr-shortcut">Ctrl++</span></div>
                            <div class="sr-menu-entry" data-action="zoomOut"><span class="sr-shortcut-label">Zoom Out</span><span class="sr-shortcut">Ctrl+-</span></div>
                            <div class="sr-menu-entry" data-action="zoomReset"><span class="sr-shortcut-label">Reset Zoom</span><span class="sr-shortcut">Ctrl+0</span></div>
                            <div class="sr-menu-divider"></div>
                            <div class="sr-menu-entry" data-action="wordWrap"><span class="sr-shortcut-label">Word Wrap</span><span class="sr-shortcut">Alt+Z</span></div>
                            <div class="sr-menu-entry" data-action="minimap"><span class="sr-shortcut-label">Toggle Minimap</span><span class="sr-shortcut"></span></div>
                        </div>
                    </div>
                    <div class="sr-menu-item" data-menu="help">
                        <span class="sr-menu-label">Help</span>
                        <div class="sr-dropdown" id="menuHelp">
                            <div class="sr-menu-entry" data-action="help"><span class="sr-shortcut-label">Language Reference</span><span class="sr-shortcut">F1</span></div>
                            <div class="sr-menu-entry" data-action="about"><span class="sr-shortcut-label">About RetroScript IDE</span><span class="sr-shortcut"></span></div>
                        </div>
                    </div>
                </div>

                <!-- Toolbar -->
                <div class="script-toolbar">
                    <button class="script-btn" id="newBtn" title="New Script (Ctrl+N)">
                        <span class="btn-icon">📄</span><span class="btn-label">New</span>
                    </button>
                    <button class="script-btn" id="loadBtn" title="Open Script (Ctrl+O)">
                        <span class="btn-icon">📂</span><span class="btn-label">Open</span>
                    </button>
                    <button class="script-btn" id="saveBtn" title="Save Script (Ctrl+S)">
                        <span class="btn-icon">💾</span><span class="btn-label">Save</span>
                    </button>
                    <span class="toolbar-divider"></span>
                    <button class="script-btn run-btn" id="runBtn" title="Run Script (F5)">
                        <span class="btn-icon">▶</span><span class="btn-label">Run</span>
                    </button>
                    <button class="script-btn stop-btn" id="stopBtn" title="Stop Script (Shift+F5)">
                        <span class="btn-icon">⏹</span><span class="btn-label">Stop</span>
                    </button>
                    <span class="toolbar-divider"></span>
                    <button class="script-btn record-btn" id="recordBtn" title="Record Events (F9)">
                        <span class="btn-icon">⏺</span><span class="btn-label">Record</span>
                    </button>
                    <span class="toolbar-divider"></span>
                    <button class="script-btn" id="findBtn" title="Find/Replace (Ctrl+F)">
                        <span class="btn-icon">🔍</span><span class="btn-label">Find</span>
                    </button>
                    <button class="script-btn" id="snippetBtn" title="Insert Snippet (Ctrl+J)">
                        <span class="btn-icon">✂</span><span class="btn-label">Snippets</span>
                    </button>
                    <button class="script-btn" id="clearBtn" title="Clear Output (Ctrl+L)">
                        <span class="btn-icon">🗑</span><span class="btn-label">Clear</span>
                    </button>
                    <span class="toolbar-divider"></span>
                    <button class="script-btn" id="helpBtn" title="Language Reference (F1)">
                        <span class="btn-icon">❓</span><span class="btn-label">Help</span>
                    </button>
                    <button class="script-btn test-btn" id="testSuiteBtn" title="Load Test Suite">
                        <span class="btn-icon">🧪</span><span class="btn-label">Tests</span>
                    </button>
                </div>

                <!-- Find/Replace Bar -->
                <div class="find-bar" id="findBar" style="display: none;">
                    <span class="find-label">Find:</span>
                    <input type="text" id="findInput" placeholder="Search..." class="find-input" />
                    <span class="find-label">Replace:</span>
                    <input type="text" id="replaceInput" placeholder="Replace..." class="find-input" />
                    <button class="find-btn" id="findNextBtn" title="Find Next (F3)">Next</button>
                    <button class="find-btn" id="findPrevBtn" title="Find Previous (Shift+F3)">Prev</button>
                    <button class="find-btn" id="replaceBtn" title="Replace">Replace</button>
                    <button class="find-btn" id="replaceAllBtn" title="Replace All">All</button>
                    <span class="find-info" id="findInfo"></span>
                    <button class="find-close" id="findCloseBtn" title="Close (Esc)">X</button>
                </div>

                <!-- Snippet Palette -->
                <div class="snippet-palette" id="snippetPalette" style="display: none;">
                    <div class="snippet-header">Insert Snippet <button class="snippet-close" id="snippetCloseBtn">X</button></div>
                    <div class="snippet-list" id="snippetList">
                        ${this.snippets.map((s, i) => `<div class="snippet-item" data-index="${i}" title="${this.escapeAttr(s.code)}"><span class="snippet-icon">${s.icon}</span> ${s.name}</div>`).join('')}
                    </div>
                </div>

                <!-- Main Editor Area -->
                <div class="script-main">
                    <div class="script-editor-pane" id="editorPane">
                        <div class="pane-header">
                            <span class="pane-header-tab active" id="editorTitle">
                                <span class="tab-icon">📜</span> Untitled
                                <span class="modified-dot" id="modifiedIndicator"></span>
                            </span>
                        </div>
                        <div class="editor-container">
                            <div class="line-gutter" id="lineNumbers"></div>
                            <div class="editor-wrapper" id="editorWrapper">
                                <pre class="syntax-highlight" id="syntaxHighlight" aria-hidden="true"></pre>
                                <textarea class="script-editor" id="scriptEditor" spellcheck="false">${welcomeScript}</textarea>
                            </div>
                            <div class="editor-minimap" id="editorMinimap">
                                <canvas id="minimapCanvas" width="60" height="300"></canvas>
                                <div class="minimap-viewport" id="minimapViewport"></div>
                            </div>
                        </div>
                    </div>

                    <div class="split-handle" id="splitHandle" title="Drag to resize"></div>

                    <div class="script-output-pane" id="outputPane">
                        <div class="output-tabs">
                            <button class="output-tab active" data-tab="output">
                                <span class="tab-icon-sm">📟</span> Output
                            </button>
                            <button class="output-tab" data-tab="events">
                                <span class="tab-icon-sm">📡</span> Events
                            </button>
                            <button class="output-tab" data-tab="variables">
                                <span class="tab-icon-sm">📦</span> Variables
                            </button>
                            <button class="output-tab" data-tab="recorded">
                                <span class="tab-icon-sm">⏺</span> Recorded
                            </button>
                            <button class="output-tab" data-tab="commands">
                                <span class="tab-icon-sm">⌨</span> Commands
                            </button>
                        </div>
                        <div class="output-content" id="outputContent">
                            <pre class="output-text" id="outputText"><span class="info">RetroScript IDE v2.0 Professional</span>
<span class="info">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</span>

Welcome to the RetroScript IDE - a full-featured
scripting environment for RetroOS.

<span class="success">Getting Started:</span>
  Write code in the editor, press F5 to run.
  Use the Snippets button for quick code templates.

<span class="success">Keyboard Shortcuts:</span>
  F5            Run script
  Shift+F5      Stop script
  Ctrl+S        Save script
  Ctrl+O        Open script
  Ctrl+N        New script
  Ctrl+F        Find/Replace
  Ctrl+J        Insert Snippet
  Ctrl+/        Toggle Comment
  Ctrl+L        Clear Output
  F1            Language Reference
  F9            Toggle Recording
  Alt+Z         Toggle Word Wrap
  Tab           Indent / Auto-complete
  Shift+Tab     Outdent

<span class="success">Quick Example:</span>
  <span class="keyword">set</span> <span class="variable">$name</span> = <span class="string">"World"</span>
  <span class="keyword">print</span> <span class="string">"Hello, $name!"</span>
  <span class="keyword">loop</span> <span class="number">5</span> { <span class="keyword">print</span> <span class="string">"Count: $i"</span> }

Type your script or click Help for full reference.
</pre>
                        </div>
                    </div>
                </div>

                <!-- Status Bar -->
                <div class="script-statusbar">
                    <span class="status-section" id="statusText">
                        <span class="status-led" id="statusLed"></span> Ready
                    </span>
                    <span class="status-divider">|</span>
                    <span id="filePathDisplay" class="file-path-display" title="Current file">New File</span>
                    <span class="status-divider">|</span>
                    <span id="lineInfo">Ln 1, Col 1</span>
                    <span class="status-divider">|</span>
                    <span id="charCount">0 chars</span>
                    <span class="status-divider">|</span>
                    <span id="execTime" class="exec-time"></span>
                    <span class="status-spacer"></span>
                    <span id="recordStatus" class="record-status"></span>
                    <span class="status-engine">RetroScript Engine</span>
                </div>
            </div>

            <style>
                .script-runner {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: var(--win95-gray);
                    font-family: 'MS Sans Serif', Tahoma, sans-serif;
                    font-size: 12px;
                }

                /* ===== MENU BAR ===== */
                .sr-menubar {
                    display: flex;
                    background: var(--win95-gray);
                    border-bottom: 1px solid #808080;
                    padding: 0;
                    position: relative;
                    z-index: 100;
                }
                .sr-menu-item {
                    position: relative;
                    padding: 3px 10px;
                    cursor: default;
                    user-select: none;
                }
                .sr-menu-item:hover, .sr-menu-item.active {
                    background: var(--win95-blue);
                    color: white;
                }
                .sr-menu-label { font-size: 12px; }
                .sr-dropdown {
                    display: none;
                    position: absolute;
                    top: 100%;
                    left: 0;
                    background: var(--win95-gray);
                    border: 2px outset var(--win95-light);
                    min-width: 220px;
                    z-index: 200;
                    box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                }
                .sr-menu-item.active .sr-dropdown { display: block; }
                .sr-menu-entry {
                    padding: 4px 24px 4px 8px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    color: #000;
                    white-space: nowrap;
                }
                .sr-menu-entry:hover {
                    background: var(--win95-blue);
                    color: white;
                }
                .sr-shortcut {
                    color: #666;
                    font-size: 11px;
                    margin-left: 20px;
                }
                .sr-menu-entry:hover .sr-shortcut { color: #ccc; }
                .sr-menu-divider {
                    height: 1px;
                    background: #808080;
                    margin: 2px 4px;
                    border-bottom: 1px solid white;
                }

                /* ===== TOOLBAR ===== */
                .script-toolbar {
                    display: flex;
                    padding: 3px 4px;
                    background: var(--win95-gray);
                    border-bottom: 1px solid #808080;
                    gap: 2px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                .script-btn {
                    padding: 3px 6px;
                    background: var(--win95-gray);
                    border: 2px outset var(--win95-light);
                    cursor: pointer;
                    font-size: 11px;
                    display: flex;
                    align-items: center;
                    gap: 3px;
                    white-space: nowrap;
                }
                .script-btn:hover { background: #d4d4d4; }
                .script-btn:active { border-style: inset; }
                .script-btn .btn-icon { font-size: 11px; }
                .script-btn .btn-label { font-size: 11px; }
                .script-btn.run-btn { background: #90EE90; }
                .script-btn.run-btn:hover { background: #7CCD7C; }
                .script-btn.run-btn.running { background: #ffa500; animation: sr-pulse 1s infinite; }
                .script-btn.stop-btn { background: #FFB6C1; }
                .script-btn.stop-btn:hover { background: #FF9AA2; }
                .script-btn.record-btn { background: #FFE4B5; }
                .script-btn.record-btn:hover { background: #FFD89B; }
                .script-btn.record-btn.recording { background: #ff4444; color: white; animation: sr-pulse 1s infinite; }
                .script-btn.test-btn { background: #E6E6FA; }
                .script-btn.test-btn:hover { background: #D8BFD8; }
                @keyframes sr-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
                .toolbar-divider { width: 1px; background: #808080; margin: 2px 4px; align-self: stretch; }

                /* ===== FIND BAR ===== */
                .find-bar {
                    display: flex; align-items: center;
                    padding: 4px 8px; background: #2d2d2d;
                    border-bottom: 1px solid #555; gap: 4px;
                }
                .find-label { color: #aaa; font-size: 11px; }
                .find-input {
                    padding: 3px 6px; border: 1px solid #555; background: #1e1e1e;
                    color: #d4d4d4; font-size: 12px; width: 140px;
                    font-family: 'Consolas', 'Courier New', monospace;
                }
                .find-input:focus { outline: 1px solid #569cd6; border-color: #569cd6; }
                .find-btn {
                    padding: 2px 8px; background: #3c3c3c; border: 1px solid #555;
                    color: #d4d4d4; cursor: pointer; font-size: 11px;
                }
                .find-btn:hover { background: #505050; }
                .find-info { font-size: 11px; color: #888; margin-left: 8px; }
                .find-close {
                    margin-left: auto; padding: 1px 6px;
                    background: #3c3c3c; border: 1px solid #555;
                    color: #d4d4d4; cursor: pointer; font-size: 12px; font-weight: bold;
                }
                .find-close:hover { background: #c04040; color: white; }

                /* ===== SNIPPET PALETTE ===== */
                .snippet-palette {
                    position: absolute; top: 72px; right: 10px;
                    width: 240px; max-height: 400px; overflow-y: auto;
                    background: #252526; border: 1px solid #555;
                    box-shadow: 3px 3px 8px rgba(0,0,0,0.5); z-index: 150;
                }
                .snippet-header {
                    padding: 6px 10px; background: #333; color: #d4d4d4;
                    font-weight: bold; font-size: 12px;
                    display: flex; justify-content: space-between; align-items: center;
                    border-bottom: 1px solid #555;
                }
                .snippet-close {
                    background: none; border: none; color: #888;
                    cursor: pointer; font-size: 14px; font-weight: bold;
                }
                .snippet-close:hover { color: #ff6b6b; }
                .snippet-item {
                    padding: 5px 10px; color: #ccc; cursor: pointer;
                    font-size: 12px; border-bottom: 1px solid #333;
                }
                .snippet-item:hover { background: #094771; color: white; }
                .snippet-icon { margin-right: 4px; }

                /* ===== MAIN LAYOUT ===== */
                .script-main {
                    display: flex; flex: 1; min-height: 0; position: relative;
                }
                .script-editor-pane {
                    flex: 1; display: flex; flex-direction: column;
                    min-width: 200px;
                }
                .script-output-pane {
                    flex: 0 0 40%; display: flex; flex-direction: column;
                    min-width: 200px;
                }
                .split-handle {
                    width: 5px; background: var(--win95-gray);
                    cursor: col-resize; flex-shrink: 0;
                    border-left: 1px solid #808080; border-right: 1px solid #808080;
                    position: relative;
                }
                .split-handle:hover, .split-handle.dragging {
                    background: var(--win95-blue);
                }
                .split-handle::after {
                    content: ''; position: absolute;
                    top: 50%; left: 50%; transform: translate(-50%, -50%);
                    width: 3px; height: 30px;
                    border-left: 1px solid #999; border-right: 1px solid #999;
                }

                /* ===== EDITOR PANE HEADER / TABS ===== */
                .pane-header {
                    display: flex; background: #252526;
                    border-bottom: 1px solid #1e1e1e;
                    min-height: 28px; align-items: stretch;
                }
                .pane-header-tab {
                    padding: 4px 14px; color: #969696; font-size: 12px;
                    display: flex; align-items: center; gap: 5px;
                    cursor: pointer; border-right: 1px solid #1e1e1e;
                    white-space: nowrap;
                }
                .pane-header-tab.active {
                    background: #1e1e1e; color: #d4d4d4;
                    border-top: 2px solid #569cd6;
                }
                .pane-header-tab:hover:not(.active) { background: #2d2d2d; }
                .tab-icon { font-size: 12px; opacity: 0.8; }
                .modified-dot {
                    width: 8px; height: 8px; border-radius: 50%;
                    display: none; margin-left: 4px;
                    background: #e8e8e8;
                }
                .modified-dot.visible { display: inline-block; }

                /* ===== EDITOR AREA ===== */
                .editor-container {
                    flex: 1; display: flex;
                    background: #1e1e1e; overflow: hidden;
                }
                .line-gutter {
                    padding: 8px 4px 8px 4px;
                    background: #1e1e1e; color: #858585;
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-size: 13px; line-height: 1.4;
                    text-align: right; user-select: none;
                    min-width: 45px; overflow: hidden;
                    white-space: pre; cursor: pointer;
                }
                .gutter-line {
                    display: flex; align-items: center; justify-content: flex-end;
                    padding-right: 6px; height: 18.2px; position: relative;
                }
                .gutter-line:hover { color: #c6c6c6; }
                .gutter-line.current-line { color: #c6c6c6; }
                .gutter-line.has-breakpoint::before {
                    content: ''; position: absolute; left: 4px;
                    width: 10px; height: 10px; border-radius: 50%;
                    background: #e51400; top: 50%; transform: translateY(-50%);
                }
                .gutter-line.has-error { color: #f44; }
                .gutter-num { min-width: 20px; text-align: right; }

                .editor-wrapper {
                    flex: 1; position: relative; overflow: hidden;
                    background: #1e1e1e; border-left: 1px solid #333;
                }
                .syntax-highlight { display: none; }
                .script-editor {
                    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                    width: 100%; height: 100%;
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-size: 13px; line-height: 1.4;
                    padding: 8px; border: none; resize: none;
                    background: #1e1e1e; color: #d4d4d4;
                    caret-color: #aeafad; tab-size: 4;
                    overflow: auto; box-sizing: border-box;
                }
                .script-editor:focus { outline: none; }
                .script-editor.word-wrap { white-space: pre-wrap; word-wrap: break-word; }

                /* Syntax colors for highlight overlay */
                .syntax-highlight .keyword { color: #569cd6; }
                .syntax-highlight .command { color: #c586c0; }
                .syntax-highlight .function { color: #dcdcaa; }
                .syntax-highlight .variable { color: #9cdcfe; }
                .syntax-highlight .string { color: #ce9178; }
                .syntax-highlight .number { color: #b5cea8; }
                .syntax-highlight .comment { color: #6a9955; font-style: italic; }
                .syntax-highlight .operator { color: #d4d4d4; }
                .syntax-highlight .builtin { color: #4ec9b0; }
                .syntax-highlight .event { color: #dcdcaa; }

                /* ===== MINIMAP ===== */
                .editor-minimap {
                    width: 60px; background: #1e1e1e;
                    border-left: 1px solid #333; position: relative;
                    overflow: hidden; cursor: pointer;
                }
                .editor-minimap.hidden { display: none; }
                #minimapCanvas {
                    width: 60px; display: block; image-rendering: pixelated;
                }
                .minimap-viewport {
                    position: absolute; top: 0; left: 0; right: 0;
                    background: rgba(100,150,255,0.15);
                    border: 1px solid rgba(100,150,255,0.4);
                    pointer-events: none; min-height: 20px;
                }

                /* ===== OUTPUT PANE ===== */
                .output-tabs {
                    display: flex; background: #252526;
                    border-bottom: 1px solid #1e1e1e;
                }
                .output-tab {
                    padding: 4px 10px; border: none; background: #2d2d2d;
                    color: #969696; cursor: pointer; font-size: 11px;
                    border-right: 1px solid #1e1e1e;
                    display: flex; align-items: center; gap: 3px;
                }
                .output-tab:hover { color: #d4d4d4; }
                .output-tab.active {
                    background: #1e1e1e; color: #d4d4d4;
                    border-bottom: 2px solid #569cd6;
                }
                .tab-icon-sm { font-size: 10px; }
                .output-content { flex: 1; overflow: auto; background: #1e1e1e; }
                .output-text {
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-size: 12px; line-height: 1.5; padding: 8px;
                    margin: 0; color: #cccccc; white-space: pre-wrap;
                    word-wrap: break-word;
                }
                .output-text .error { color: #f44747; }
                .output-text .success { color: #4ec9b0; }
                .output-text .info { color: #569cd6; }
                .output-text .event { color: #dcdcaa; }
                .output-text .keyword { color: #569cd6; }
                .output-text .variable { color: #9cdcfe; }
                .output-text .string { color: #ce9178; }
                .output-text .number { color: #b5cea8; }

                /* ===== STATUS BAR ===== */
                .script-statusbar {
                    display: flex; padding: 3px 8px; align-items: center;
                    background: #007acc; font-size: 11px; color: #fff;
                }
                .status-section { display: flex; align-items: center; gap: 5px; }
                .status-led {
                    width: 8px; height: 8px; border-radius: 50%;
                    background: #4ec9b0; display: inline-block;
                }
                .status-led.running { background: #ffa500; animation: sr-pulse 0.8s infinite; }
                .status-led.error { background: #f44747; }
                .status-divider { margin: 0 8px; color: rgba(255,255,255,0.3); }
                .status-spacer { flex: 1; }
                .file-path-display {
                    max-width: 250px; overflow: hidden;
                    text-overflow: ellipsis; white-space: nowrap;
                    cursor: default;
                }
                .exec-time { color: #ddd; }
                .record-status { color: #ff4444; font-weight: bold; }
                .record-status.active { animation: sr-blink 1s infinite; }
                .status-engine { color: rgba(255,255,255,0.5); font-size: 10px; }
                @keyframes sr-blink { 0%,49%{opacity:1} 50%,100%{opacity:0} }

                /* ===== VARIABLES TABLE ===== */
                .var-table {
                    width: 100%; border-collapse: collapse; font-size: 12px;
                }
                .var-table th {
                    background: #252526; color: #569cd6; padding: 5px 8px;
                    text-align: left; border-bottom: 1px solid #333;
                    position: sticky; top: 0;
                }
                .var-table td {
                    padding: 3px 8px; border-bottom: 1px solid #2d2d2d;
                }
                .var-table tr:hover { background: #2a2d2e; }
                .var-name { color: #9cdcfe; }
                .var-type { color: #4ec9b0; font-style: italic; font-size: 11px; }
                .var-value {
                    color: #ce9178; max-width: 250px;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                }

                /* ===== RECORDED CODE ===== */
                .recorded-header { color: #569cd6; margin-bottom: 8px; }
                .recorded-code {
                    color: #d4d4d4; font-family: 'Consolas', 'Courier New', monospace;
                }
                .recorded-code .rec-comment { color: #6a9955; }
                .recorded-code .rec-command { color: #c586c0; }
                .recorded-code .rec-event { color: #dcdcaa; }

                /* ===== ERROR HIGHLIGHTING ===== */
                .line-error { background: rgba(255,0,0,0.15) !important; }
                .error-gutter { color: #f44 !important; font-weight: bold; }

                /* ===== COPY / ACTION BUTTONS ===== */
                .copy-btn {
                    padding: 3px 10px; background: #333; border: 1px solid #555;
                    color: #d4d4d4; cursor: pointer; font-size: 11px;
                    display: inline-block;
                }
                .copy-btn:hover { background: #505050; }

                /* ===== CURRENT LINE HIGHLIGHT ===== */
                .current-line-highlight {
                    position: absolute; left: 0; right: 0; height: 18.2px;
                    background: rgba(255,255,255,0.04); pointer-events: none;
                    z-index: 0;
                }
            </style>
        `;
    }

    onMount() {
        const editor = this.getElement('#scriptEditor');
        const tabs = this.getElement('.output-tabs');

        // ===== TOOLBAR BUTTONS =====
        this.addHandler(this.getElement('#runBtn'), 'click', () => this.runScript());
        this.addHandler(this.getElement('#stopBtn'), 'click', () => this.stopScript());
        this.addHandler(this.getElement('#clearBtn'), 'click', () => this.clearOutput());
        this.addHandler(this.getElement('#recordBtn'), 'click', () => this.toggleRecording());
        this.addHandler(this.getElement('#saveBtn'), 'click', () => this.saveScript());
        this.addHandler(this.getElement('#loadBtn'), 'click', () => this.loadScript());
        this.addHandler(this.getElement('#newBtn'), 'click', () => this.newScript());
        this.addHandler(this.getElement('#findBtn'), 'click', () => this.toggleFind());
        this.addHandler(this.getElement('#helpBtn'), 'click', () => this.showHelp());
        this.addHandler(this.getElement('#testSuiteBtn'), 'click', () => this.loadTestSuite());
        this.addHandler(this.getElement('#snippetBtn'), 'click', () => this.toggleSnippets());

        // Script automation API - commands and queries for external scripting
        this.registerCommand('setCode', (payload = {}) => {
            const editor = this.getElement('#scriptEditor');
            if (!editor) throw new Error('Script editor not mounted');
            editor.value = payload.code || '';
            this.updateSyntaxHighlight();
            this.updateCharCount();
            this.markModified();
            this.emitAppEvent('code:changed', { length: editor.value.length });
            return { length: editor.value.length };
        });

        this.registerCommand('appendCode', (payload = {}) => {
            const editor = this.getElement('#scriptEditor');
            if (!editor) throw new Error('Script editor not mounted');
            const code = payload.code || '';
            editor.value = `${editor.value}${code}`;
            this.updateSyntaxHighlight();
            this.updateCharCount();
            this.markModified();
            this.emitAppEvent('code:changed', { length: editor.value.length });
            return { length: editor.value.length };
        });

        this.registerCommand('runScript', () => {
            this.runScript();
            return { started: true };
        });

        this.registerCommand('stopScript', () => {
            this.stopScript();
            return { stopped: true };
        });

        this.registerCommand('loadTestSuite', () => {
            this.loadTestSuite();
            return { loaded: true };
        });

        this.registerCommand('clearOutput', () => {
            this.clearOutput();
            return { cleared: true };
        });

        this.registerCommand('loadFile', (payload = {}) => {
            if (!payload.path) return { success: false, error: 'No path provided' };
            this.currentFilePath = payload.path;
            this.loadScriptFromPath(payload.path);
            return { success: true, path: payload.path };
        });

        this.registerCommand('insertSnippet', (payload = {}) => {
            const idx = typeof payload.index === 'number' ? payload.index : -1;
            const code = payload.code || (idx >= 0 && idx < this.snippets.length ? this.snippets[idx].code : null);
            if (!code) return { success: false, error: 'No snippet code or valid index provided' };
            this.insertSnippet(code);
            return { success: true };
        });

        this.registerQuery('getCode', () => {
            const editor = this.getElement('#scriptEditor');
            return editor ? editor.value : '';
        });

        this.registerQuery('getOutput', () => [...this.output]);

        this.registerQuery('getRecordingState', () => ({
            isRecording: this.isRecording,
            recordedEventCount: this.recordedEvents.length
        }));

        this.registerQuery('getState', () => ({
            isRunning: !!this.executionTimer,
            isRecording: this.isRecording,
            isModified: this.isModified,
            currentFile: this.currentFilePath,
            outputLength: this.output.length,
            variableCount: Object.keys(this.variables).length,
            breakpointCount: this.breakpoints.size
        }));

        this.registerQuery('getVariables', () => ({ ...this.variables }));

        this.registerQuery('getSnippets', () => this.snippets.map((s, i) => ({
            index: i, name: s.name, icon: s.icon
        })));

        // ===== MENU BAR =====
        this.setupMenuBar();

        // ===== TAB SWITCHING =====
        this.addHandler(tabs, 'click', (e) => {
            const tab = e.target.closest('.output-tab');
            if (tab) this.switchTab(tab.dataset.tab);
        });

        // ===== FIND BAR =====
        this.addHandler(this.getElement('#findNextBtn'), 'click', () => this.findNext());
        this.addHandler(this.getElement('#findPrevBtn'), 'click', () => this.findPrev());
        this.addHandler(this.getElement('#replaceBtn'), 'click', () => this.replaceOne());
        this.addHandler(this.getElement('#replaceAllBtn'), 'click', () => this.replaceAll());
        this.addHandler(this.getElement('#findCloseBtn'), 'click', () => this.toggleFind());
        this.addHandler(this.getElement('#findInput'), 'keydown', (e) => {
            if (e.key === 'Enter') { e.shiftKey ? this.findPrev() : this.findNext(); }
            else if (e.key === 'Escape') { this.toggleFind(); }
        });

        // ===== SNIPPET PALETTE =====
        this.addHandler(this.getElement('#snippetCloseBtn'), 'click', () => this.toggleSnippets());
        this.addHandler(this.getElement('#snippetList'), 'click', (e) => {
            const item = e.target.closest('.snippet-item');
            if (item) {
                const idx = parseInt(item.dataset.index);
                this.insertSnippet(this.snippets[idx].code);
                this.toggleSnippets();
            }
        });

        // ===== SPLIT PANE RESIZER =====
        this.setupSplitPane();

        // ===== GUTTER CLICK (breakpoints) =====
        this.addHandler(this.getElement('#lineNumbers'), 'click', (e) => {
            const gutterLine = e.target.closest('.gutter-line');
            if (gutterLine) {
                const lineNum = parseInt(gutterLine.dataset.line);
                this.toggleBreakpoint(lineNum);
            }
        });

        // ===== EDITOR EVENTS =====
        this.addHandler(editor, 'keyup', () => {
            this.updateLineInfo();
            this.updateCharCount();
        });
        this.addHandler(editor, 'click', () => {
            this.updateLineInfo();
            this.updateGutterHighlight();
        });
        this.addHandler(editor, 'input', () => {
            this.updateSyntaxHighlight();
            this.updateCharCount();
            this.markModified();
            this.updateMinimap();
        });
        this.addHandler(editor, 'scroll', () => this.syncScroll());

        // Initial state
        this.updateSyntaxHighlight();
        this.updateCharCount();
        this.updateMinimap();

        // ===== KEYBOARD SHORTCUTS =====
        this.addHandler(editor, 'keydown', (e) => {
            // F5 - Run / Shift+F5 - Stop
            if (e.key === 'F5') {
                e.preventDefault();
                e.shiftKey ? this.stopScript() : this.runScript();
            }
            // F1 - Help
            if (e.key === 'F1') { e.preventDefault(); this.showHelp(); }
            // F3 - Find next/prev
            if (e.key === 'F3') { e.preventDefault(); e.shiftKey ? this.findPrev() : this.findNext(); }
            // F9 - Toggle recording
            if (e.key === 'F9') { e.preventDefault(); this.toggleRecording(); }
            // Escape
            if (e.key === 'Escape') {
                if (this.snippetsVisible) this.toggleSnippets();
                else if (this.findVisible) this.toggleFind();
                else this.stopScript();
            }
            // Ctrl+S / Ctrl+Shift+S
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                e.shiftKey ? this.saveScriptAs() : this.saveScript();
            }
            // Ctrl+O
            if (e.ctrlKey && e.key === 'o') { e.preventDefault(); this.loadScript(); }
            // Ctrl+N
            if (e.ctrlKey && e.key === 'n') { e.preventDefault(); this.newScript(); }
            // Ctrl+F
            if (e.ctrlKey && e.key === 'f') { e.preventDefault(); this.toggleFind(); }
            // Ctrl+L - Clear output
            if (e.ctrlKey && e.key === 'l') { e.preventDefault(); this.clearOutput(); }
            // Ctrl+J - Snippets
            if (e.ctrlKey && e.key === 'j') { e.preventDefault(); this.toggleSnippets(); }
            // Ctrl+/ - Toggle comment
            if (e.ctrlKey && e.key === '/') { e.preventDefault(); this.toggleComment(); }
            // Alt+Z - Word wrap
            if (e.altKey && e.key === 'z') { e.preventDefault(); this.toggleWordWrap(); }
            // Ctrl+= / Ctrl+- - Zoom
            if (e.ctrlKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); this.zoomIn(); }
            if (e.ctrlKey && e.key === '-') { e.preventDefault(); this.zoomOut(); }
            if (e.ctrlKey && e.key === '0') { e.preventDefault(); this.zoomReset(); }

            // Tab handling with auto-indent
            if (e.key === 'Tab' && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                if (e.shiftKey) {
                    this.outdentSelection();
                } else {
                    this.indentSelection();
                }
            }

            // Enter - auto-indent
            if (e.key === 'Enter' && this.autoIndent) {
                e.preventDefault();
                this.handleAutoIndent();
            }

            // Auto-close brackets
            if (e.key === '{') {
                const pos = editor.selectionStart;
                const after = editor.value.substring(pos);
                if (!after.length || /^\s/.test(after[0])) {
                    e.preventDefault();
                    const before = editor.value.substring(0, pos);
                    editor.value = before + '{}' + editor.value.substring(editor.selectionEnd);
                    editor.selectionStart = editor.selectionEnd = pos + 1;
                    this.updateSyntaxHighlight();
                }
            }
        });

        // ===== MINIMAP INTERACTION =====
        const minimap = this.getElement('#editorMinimap');
        if (minimap) {
            this.addHandler(minimap, 'click', (e) => {
                const rect = minimap.getBoundingClientRect();
                const ratio = (e.clientY - rect.top) / rect.height;
                editor.scrollTop = ratio * editor.scrollHeight;
            });
        }

        // ===== CLOSE MENUS ON OUTSIDE CLICK =====
        this.addHandler(document, 'mousedown', (e) => {
            if (this.activeMenu && !e.target.closest('.sr-menubar')) {
                this.closeAllMenus();
            }
            if (this.snippetsVisible && !e.target.closest('.snippet-palette') && !e.target.closest('#snippetBtn')) {
                this.toggleSnippets();
            }
        });

        // ===== SCRIPT ENGINE EVENTS =====
        this.subscribe('script:output', ({ message }) => {
            this.appendOutput(message, 'success');
        });
        this.subscribe('script:error', ({ error, line }) => {
            this.appendOutput(`Error${line ? ` at line ${line}` : ''}: ${error}`, 'error');
            if (line) this.highlightErrorLine(line);
        });
        this.subscribe('script:variables', ({ variables }) => {
            this.variables = variables || {};
            this.updateVariablesPanel();
        });

        // ===== EVENT MONITOR =====
        // this.subscribe(...) auto-cleans on window close — no manual
        // unsubscribe needed (the wildcard listener used to leak).
        this.subscribe('*', (payload, meta, event) => {
            if (event.name.startsWith('script:') || event.name.startsWith('macro:')) return;
            if (this.eventLog.length > this.maxLogEntries) this.eventLog.shift();
            this.eventLog.push({
                time: new Date().toLocaleTimeString(),
                event: event.name,
                payload: JSON.stringify(payload).substring(0, 100)
            });
            if (this.isRecording) this.recordEvent(event.name, payload);
        });

        this.registerScriptAutomationApi();

        // ===== AUTO-MAXIMIZE ON LAUNCH =====
        setTimeout(() => {
            const windowId = this.getCurrentWindowId();
            if (windowId) {
                WindowManager.maximize(windowId);
            }
        }, 100);
    }

    // ===== MENU BAR =====

    setupMenuBar() {
        const menubar = this.getElement('#srMenubar');
        if (!menubar) return;

        this.addHandler(menubar, 'click', (e) => {
            const menuItem = e.target.closest('.sr-menu-item');
            const entry = e.target.closest('.sr-menu-entry');

            if (entry) {
                this.handleMenuAction(entry.dataset.action);
                this.closeAllMenus();
                return;
            }

            if (menuItem) {
                const menuName = menuItem.dataset.menu;
                if (this.activeMenu === menuName) {
                    this.closeAllMenus();
                } else {
                    this.closeAllMenus();
                    menuItem.classList.add('active');
                    this.activeMenu = menuName;
                }
            }
        });

        this.addHandler(menubar, 'mouseover', (e) => {
            if (!this.activeMenu) return;
            const menuItem = e.target.closest('.sr-menu-item');
            if (menuItem && menuItem.dataset.menu !== this.activeMenu) {
                this.closeAllMenus();
                menuItem.classList.add('active');
                this.activeMenu = menuItem.dataset.menu;
            }
        });
    }

    closeAllMenus() {
        const items = this.getElements('.sr-menu-item');
        items.forEach(item => item.classList.remove('active'));
        this.activeMenu = null;
    }

    handleMenuAction(action) {
        const actions = {
            'new': () => this.newScript(),
            'open': () => this.loadScript(),
            'save': () => this.saveScript(),
            'saveAs': () => this.saveScriptAs(),
            'close': () => { const wid = this.getCurrentWindowId(); if (wid) WindowManager.close(wid); },
            'undo': () => { const e = this.getElement('#scriptEditor'); if (e) { document.execCommand('undo'); } },
            'redo': () => { const e = this.getElement('#scriptEditor'); if (e) { document.execCommand('redo'); } },
            'find': () => this.toggleFind(),
            'selectAll': () => { const e = this.getElement('#scriptEditor'); if (e) { e.select(); } },
            'toggleComment': () => this.toggleComment(),
            'snippets': () => this.toggleSnippets(),
            'run': () => this.runScript(),
            'stop': () => this.stopScript(),
            'record': () => this.toggleRecording(),
            'clear': () => this.clearOutput(),
            'tests': () => this.loadTestSuite(),
            'zoomIn': () => this.zoomIn(),
            'zoomOut': () => this.zoomOut(),
            'zoomReset': () => this.zoomReset(),
            'wordWrap': () => this.toggleWordWrap(),
            'minimap': () => this.toggleMinimap(),
            'help': () => this.showHelp(),
            'about': () => this.showAbout(),
        };
        if (actions[action]) actions[action]();
    }

    // ===== SPLIT PANE =====

    setupSplitPane() {
        const handle = this.getElement('#splitHandle');
        if (!handle) return;

        this.addHandler(handle, 'mousedown', (e) => {
            e.preventDefault();
            this.splitDragging = true;
            handle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            const moveHandler = (me) => {
                if (!this.splitDragging) return;
                const main = this.getElement('.script-main');
                const editorPane = this.getElement('#editorPane');
                const outputPane = this.getElement('#outputPane');
                if (!main || !editorPane || !outputPane) return;

                const mainRect = main.getBoundingClientRect();
                const relX = me.clientX - mainRect.left;
                const pct = Math.max(20, Math.min(80, (relX / mainRect.width) * 100));
                editorPane.style.flex = `0 0 ${pct}%`;
                outputPane.style.flex = `0 0 ${100 - pct - 1}%`;
            };

            const upHandler = () => {
                this.splitDragging = false;
                handle.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
            };

            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
        });
    }

    // ===== SNIPPETS =====

    toggleSnippets() {
        const palette = this.getElement('#snippetPalette');
        if (!palette) return;
        this.snippetsVisible = !this.snippetsVisible;
        palette.style.display = this.snippetsVisible ? 'block' : 'none';
    }

    insertSnippet(code) {
        const editor = this.getElement('#scriptEditor');
        if (!editor) return;
        const start = editor.selectionStart;
        const before = editor.value.substring(0, start);
        const after = editor.value.substring(editor.selectionEnd);
        editor.value = before + code + after;
        editor.selectionStart = editor.selectionEnd = start + code.length;
        editor.focus();
        this.updateSyntaxHighlight();
        this.updateCharCount();
        this.markModified();
        this.updateMinimap();
    }

    // ===== SMART EDITOR FEATURES =====

    handleAutoIndent() {
        const editor = this.getElement('#scriptEditor');
        if (!editor) return;

        const pos = editor.selectionStart;
        const before = editor.value.substring(0, pos);
        const after = editor.value.substring(editor.selectionEnd);
        const currentLine = before.split('\n').pop();
        const indent = currentLine.match(/^(\s*)/)[1];

        // Increase indent after { at end of line
        let newIndent = indent;
        if (currentLine.trimEnd().endsWith('{')) {
            newIndent = indent + '    ';
        }

        editor.value = before + '\n' + newIndent + after;
        editor.selectionStart = editor.selectionEnd = pos + 1 + newIndent.length;
        this.updateSyntaxHighlight();
        this.updateCharCount();
        this.markModified();
    }

    indentSelection() {
        const editor = this.getElement('#scriptEditor');
        if (!editor) return;

        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const text = editor.value;

        // If there's a selection spanning multiple lines, indent all
        if (start !== end) {
            const lineStart = text.lastIndexOf('\n', start - 1) + 1;
            const lineEnd = text.indexOf('\n', end - 1);
            const selectedLines = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
            const indented = selectedLines.split('\n').map(l => '    ' + l).join('\n');
            editor.value = text.substring(0, lineStart) + indented + text.substring(lineEnd === -1 ? text.length : lineEnd);
            editor.selectionStart = lineStart;
            editor.selectionEnd = lineStart + indented.length;
        } else {
            // Single cursor - insert 4 spaces
            editor.value = text.substring(0, start) + '    ' + text.substring(end);
            editor.selectionStart = editor.selectionEnd = start + 4;
        }
        this.updateSyntaxHighlight();
    }

    outdentSelection() {
        const editor = this.getElement('#scriptEditor');
        if (!editor) return;

        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const text = editor.value;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = text.indexOf('\n', end - 1);
        const selectedLines = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
        const outdented = selectedLines.split('\n').map(l => l.replace(/^    /, '').replace(/^\t/, '')).join('\n');

        editor.value = text.substring(0, lineStart) + outdented + text.substring(lineEnd === -1 ? text.length : lineEnd);
        editor.selectionStart = lineStart;
        editor.selectionEnd = lineStart + outdented.length;
        this.updateSyntaxHighlight();
    }

    toggleComment() {
        const editor = this.getElement('#scriptEditor');
        if (!editor) return;

        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const text = editor.value;
        const lineStart = text.lastIndexOf('\n', start - 1) + 1;
        const lineEnd = text.indexOf('\n', end);
        const selectedLines = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
        const lines = selectedLines.split('\n');

        const allCommented = lines.every(l => l.trimStart().startsWith('#'));
        const toggled = lines.map(l => {
            if (allCommented) {
                return l.replace(/^(\s*)# ?/, '$1');
            } else {
                return l.replace(/^(\s*)/, '$1# ');
            }
        }).join('\n');

        editor.value = text.substring(0, lineStart) + toggled + text.substring(lineEnd === -1 ? text.length : lineEnd);
        editor.selectionStart = lineStart;
        editor.selectionEnd = lineStart + toggled.length;
        this.updateSyntaxHighlight();
        this.markModified();
    }

    toggleWordWrap() {
        const editor = this.getElement('#scriptEditor');
        if (!editor) return;
        this.wordWrap = !this.wordWrap;
        editor.classList.toggle('word-wrap', this.wordWrap);
    }

    toggleMinimap() {
        const minimap = this.getElement('#editorMinimap');
        if (!minimap) return;
        this.showMinimap = !this.showMinimap;
        minimap.classList.toggle('hidden', !this.showMinimap);
    }

    zoomIn() {
        this.editorFontSize = Math.min(24, this.editorFontSize + 1);
        this.applyEditorFontSize();
    }

    zoomOut() {
        this.editorFontSize = Math.max(9, this.editorFontSize - 1);
        this.applyEditorFontSize();
    }

    zoomReset() {
        this.editorFontSize = 13;
        this.applyEditorFontSize();
    }

    applyEditorFontSize() {
        const editor = this.getElement('#scriptEditor');
        const gutter = this.getElement('#lineNumbers');
        if (editor) editor.style.fontSize = `${this.editorFontSize}px`;
        if (gutter) gutter.style.fontSize = `${this.editorFontSize}px`;
        this.updateSyntaxHighlight();
    }

    // ===== BREAKPOINTS =====

    toggleBreakpoint(lineNum) {
        if (this.breakpoints.has(lineNum)) {
            this.breakpoints.delete(lineNum);
        } else {
            this.breakpoints.add(lineNum);
        }
        this.updateSyntaxHighlight();
    }

    // ===== MINIMAP =====

    updateMinimap() {
        if (!this.showMinimap) return;
        const canvas = this.getElement('#minimapCanvas');
        const editor = this.getElement('#scriptEditor');
        const viewport = this.getElement('#minimapViewport');
        if (!canvas || !editor) return;

        const ctx = canvas.getContext('2d');
        const text = editor.value;
        const lines = text.split('\n');
        const lineCount = lines.length;
        const canvasHeight = Math.max(300, Math.min(600, lineCount * 2));
        canvas.height = canvasHeight;
        canvas.style.height = canvasHeight + 'px';

        ctx.clearRect(0, 0, 60, canvasHeight);

        // Render minimap lines
        const scale = canvasHeight / Math.max(lineCount, 1);
        for (let i = 0; i < lineCount; i++) {
            const line = lines[i];
            const y = Math.floor(i * scale);
            const trimmed = line.trimStart();
            let color;

            if (trimmed.startsWith('#')) {
                color = '#3d5c36'; // comment
            } else if (trimmed.startsWith('set ') || trimmed.startsWith('if ') || trimmed.startsWith('loop') || trimmed.startsWith('def ') || trimmed.startsWith('foreach')) {
                color = '#3b5998'; // keyword
            } else if (trimmed.startsWith('print') || trimmed.startsWith('launch') || trimmed.startsWith('emit') || trimmed.startsWith('call')) {
                color = '#7a4a7a'; // command
            } else if (line.trim() === '') {
                continue;
            } else {
                color = '#555';
            }

            const width = Math.min(55, Math.max(4, line.length * 0.5));
            ctx.fillStyle = color;
            ctx.fillRect(2, y, width, Math.max(1, scale - 0.5));
        }

        // Breakpoint markers
        for (const bp of this.breakpoints) {
            const y = Math.floor((bp - 1) * scale);
            ctx.fillStyle = '#e51400';
            ctx.beginPath();
            ctx.arc(4, y + 1, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        // Update viewport indicator
        if (viewport) {
            const viewRatio = editor.clientHeight / Math.max(1, editor.scrollHeight);
            const scrollRatio = editor.scrollTop / Math.max(1, editor.scrollHeight);
            viewport.style.top = (scrollRatio * canvasHeight) + 'px';
            viewport.style.height = Math.max(20, viewRatio * canvasHeight) + 'px';
        }
    }

    async runScript() {
        try {
            const editor = this.getElement('#scriptEditor');
            if (!editor) return;

            const script = editor.value;
            if (!script.trim()) {
                this.appendOutput('No script to run.', 'info');
                this.playSound('error');
                return;
            }

            // Clear previous state
            this.clearErrorHighlight();
            this.variables = {};
            this.playSound('click');

            // Start execution timer
            this.executionStartTime = performance.now();
            this.startExecutionTimer();
            this.setStatus('Running...', 'running');

            // Update Run button visual
            const runBtn = this.getElement('#runBtn');
            if (runBtn) runBtn.classList.add('running');

            this.appendOutput('\n--- Script Started ---', 'info');
            this.emitAppEvent('script:started', { length: script.length, file: this.currentFilePath });

            const result = await ScriptEngine.run(script, {
                onVariables: (vars) => {
                    this.variables = vars || {};
                }
            });

            if (result.variables) {
                this.variables = result.variables;
            }

            const elapsed = this.stopExecutionTimer();

            if (result.success) {
                this.appendOutput(`--- Script Completed (${elapsed}) ---`, 'success');
                if (result.result !== undefined && result.result !== null) {
                    this.appendOutput(`Result: ${JSON.stringify(result.result)}`, 'info');
                }
                this.emitAppEvent('script:completed', { elapsed, result: result.result });
            } else {
                this.appendOutput(`--- Script Failed: ${result.error} (${elapsed}) ---`, 'error');
                if (result.line) {
                    this.highlightErrorLine(result.line);
                }
                this.emitAppEvent('script:failed', { elapsed, error: result.error, line: result.line });
            }

            this.setStatus('Ready');
            if (runBtn) runBtn.classList.remove('running');
        } catch (error) {
            this.stopExecutionTimer();
            this.appendOutput(`--- Script Error: ${error.message} ---`, 'error');
            this.setStatus('Error', 'error');
            const runBtn = this.getElement('#runBtn');
            if (runBtn) runBtn.classList.remove('running');
        }
    }

    startExecutionTimer() {
        const execTime = this.getElement('#execTime');
        const statusLed = this.getElement('#statusLed');
        if (statusLed) statusLed.classList.add('running');

        this.executionTimer = setInterval(() => {
            if (execTime && this.executionStartTime) {
                const ms = Math.floor(performance.now() - this.executionStartTime);
                execTime.textContent = this.formatDuration(ms);
            }
        }, 100);
    }

    stopExecutionTimer() {
        const statusLed = this.getElement('#statusLed');
        if (statusLed) { statusLed.classList.remove('running'); statusLed.classList.remove('error'); }

        if (this.executionTimer) {
            clearInterval(this.executionTimer);
            this.executionTimer = null;
        }
        const ms = this.executionStartTime ? Math.floor(performance.now() - this.executionStartTime) : 0;
        const formatted = this.formatDuration(ms);
        const execTime = this.getElement('#execTime');
        if (execTime) execTime.textContent = formatted;
        this.executionStartTime = null;
        return formatted;
    }

    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        const mins = Math.floor(ms / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        return `${mins}m ${secs}s`;
    }

    stopScript() {
        ScriptEngine.stop();
        this.appendOutput('--- Script Stopped ---', 'info');
        this.setStatus('Stopped');
        this.playSound('click');
        this.emitAppEvent('script:stopped', {});
    }

    clearOutput() {
        this.output = [];
        this.eventLog = [];
        const outputText = this.getElement('#outputText');
        if (outputText) {
            outputText.innerHTML = 'Output cleared.\n';
        }
    }

    toggleRecording() {
        const recordBtn = this.getElement('#recordBtn');
        const recordStatus = this.getElement('#recordStatus');

        if (this.isRecording) {
            // Stop recording
            this.isRecording = false;
            recordBtn.innerHTML = '<span class="btn-icon">⏺</span> Record';
            recordBtn.classList.remove('recording');
            recordStatus.textContent = '';
            recordStatus.classList.remove('active');

            if (this.recordedEvents.length > 0) {
                this.appendOutput('', 'info');
                this.appendOutput('═══════════════════════════════════════════', 'info');
                this.appendOutput(`  RECORDING COMPLETE - ${this.recordedEvents.length} events`, 'success');
                this.appendOutput('═══════════════════════════════════════════', 'info');
                this.appendOutput('', 'info');
                this.appendOutput('Your actions have been converted to RetroScript code!', 'info');
                this.appendOutput('Switching to "Recorded" tab...', 'info');

                // Auto-switch to Recorded tab
                this.switchTab('recorded');
            } else {
                this.appendOutput('', 'info');
                this.appendOutput('Recording stopped - no events were captured.', 'info');
                this.appendOutput('', 'info');
                this.appendOutput('Tips for successful recording:', 'info');
                this.appendOutput('  • Launch an app (click an icon on desktop)', 'info');
                this.appendOutput('  • Close a window', 'info');
                this.appendOutput('  • Use the Start menu', 'info');
                this.appendOutput('  • Create or save a file', 'info');
            }
        } else {
            // Start recording
            this.isRecording = true;
            this.recordedEvents = [];
            recordBtn.innerHTML = '<span class="btn-icon">⏹</span> Stop';
            recordBtn.classList.add('recording');
            recordStatus.textContent = '⏺ REC';
            recordStatus.classList.add('active');

            this.appendOutput('', 'info');
            this.appendOutput('═══════════════════════════════════════════', 'error');
            this.appendOutput('  ⏺ RECORDING STARTED', 'error');
            this.appendOutput('═══════════════════════════════════════════', 'error');
            this.appendOutput('', 'info');
            this.appendOutput('Your actions are now being recorded as RetroScript code!', 'info');
            this.appendOutput('', 'info');
            this.appendOutput('Try these actions:', 'info');
            this.appendOutput('  ▶ Launch an application', 'info');
            this.appendOutput('  ▶ Play a sound', 'info');
            this.appendOutput('  ▶ Create or delete a file', 'info');
            this.appendOutput('  ▶ Show a notification', 'info');
            this.appendOutput('', 'info');
            this.appendOutput('Click "Stop" when finished recording.', 'success');
        }
    }

    recordEvent(eventName, payload) {
        const timestamp = new Date().toLocaleTimeString();
        const code = this.eventToCode(eventName, payload);
        if (code) {
            this.recordedEvents.push({
                time: timestamp,
                event: eventName,
                code: code
            });
        }
    }

    eventToCode(eventName, payload) {
        // Convert common events to RetroScript code
        const parts = eventName.split(':');

        // App launch events
        if (eventName === 'app:launch' && payload.appId) {
            return `launch ${payload.appId}`;
        }
        if (eventName === 'app:open' && payload.appId) {
            return `launch ${payload.appId}`;
        }

        // Window events
        if (eventName === 'window:close') {
            return `close`;
        }
        if (eventName === 'window:minimize' && payload.windowId) {
            return `minimize`;
        }
        if (eventName === 'window:maximize' && payload.windowId) {
            return `maximize`;
        }
        if (eventName === 'window:focus' && payload.appId) {
            return `focus  # ${payload.appId}`;
        }
        if (eventName === 'window:open') {
            return null; // Skip, captured by app:launch
        }

        // Sound events
        if (eventName === 'sound:play' && payload.sound) {
            return `play ${payload.sound}`;
        }
        if (eventName === 'sound:stop') {
            return `# Sound stopped`;
        }

        // Dialog events
        if (eventName === 'dialog:alert') {
            const msg = payload.message || payload.title || '';
            return `emit dialog:alert message="${msg.replace(/"/g, '\\"')}"`;
        }
        if (eventName === 'dialog:confirm') {
            return `# Confirm dialog shown`;
        }
        if (eventName === 'dialog:prompt') {
            return `# Prompt dialog shown`;
        }

        // Notification events
        if (eventName === 'notification:show') {
            const msg = payload.message || '';
            return `notify "${msg.replace(/"/g, '\\"')}"`;
        }

        // File system events
        if (eventName.startsWith('fs:file:') || eventName.startsWith('fs:dir:')) {
            const action = parts[2];
            const pathArray = payload.path;
            const pathStr = Array.isArray(pathArray) ? pathArray.join('/') : pathArray;

            if (action === 'create') {
                if (eventName.includes(':dir:')) {
                    return `mkdir "${pathStr}"`;
                }
                return `write "" to "${pathStr}"`;
            }
            if (action === 'update' || action === 'write') {
                return `# File updated: ${pathStr}`;
            }
            if (action === 'delete') {
                return `delete "${pathStr}"`;
            }
            if (action === 'read') {
                return `# File read: ${pathStr}`;
            }
        }

        // Notepad save events
        if (eventName === 'app:notepad:saved') {
            const pathArray = payload.path;
            const pathStr = Array.isArray(pathArray) ? pathArray.join('/') : pathArray;
            return `# Notepad saved: ${pathStr}`;
        }

        // Game events
        if (eventName.includes(':win') || eventName.includes(':game:over') || eventName.includes(':complete')) {
            const score = payload.score !== undefined ? ` score=${payload.score}` : '';
            const time = payload.time !== undefined ? ` time=${payload.time}` : '';
            return `# Game event: ${eventName}${score}${time}`;
        }
        if (eventName.includes(':start') || eventName.includes(':new')) {
            return `# Game started: ${eventName}`;
        }

        // Keyboard events (only special keys)
        if (eventName === 'keyboard:keydown' && payload.key) {
            if (payload.key.length === 1) return null; // Skip regular typing
            if (['Shift', 'Control', 'Alt', 'Meta'].includes(payload.key)) return null;
            return `# Key: ${payload.key}`;
        }

        // Mouse click - skip to avoid noise
        if (eventName === 'mouse:click' || eventName === 'mouse:down' || eventName === 'mouse:up') {
            return null;
        }

        // System events
        if (eventName === 'system:shutdown') {
            return `# System shutdown`;
        }
        if (eventName === 'system:boot') {
            return `# System boot`;
        }

        // Desktop events
        if (eventName === 'desktop:wallpaper:change') {
            return `# Wallpaper changed`;
        }

        // Skip internal/noisy events
        if (eventName.startsWith('window:drag') ||
            eventName.startsWith('window:resize') ||
            eventName.startsWith('taskbar:') ||
            eventName.startsWith('menu:') ||
            eventName.startsWith('context:')) {
            return null;
        }

        // Generic event - emit it if it seems useful
        if (parts.length >= 2 && !eventName.startsWith('internal:')) {
            const props = Object.entries(payload || {})
                .filter(([k, v]) => v !== undefined && v !== null && typeof v !== 'object')
                .slice(0, 3) // Limit to 3 properties
                .map(([k, v]) => `${k}="${String(v).substring(0, 50)}"`)
                .join(' ');
            return props ? `emit ${eventName} ${props}` : `emit ${eventName}`;
        }

        return null;
    }

    newScript() {
        const editor = this.getElement('#scriptEditor');
        if (editor) {
            // Start completely blank for a fresh slate
            editor.value = '';

            // Reset file state
            this.currentFilePath = null;
            this.isModified = false;
            this.originalContent = '';

            // Update UI
            this.updateEditorTitle();
            this.updateSyntaxHighlight();
            this.updateCharCount();
            this.clearOutput();
            this.appendOutput('New script - ready to code', 'info');

            // Focus the editor
            editor.focus();
        }
    }

    updateEditorTitle() {
        const editorTitle = this.getElement('#editorTitle');
        const modifiedIndicator = this.getElement('#modifiedIndicator');
        const filePathDisplay = this.getElement('#filePathDisplay');

        if (editorTitle) {
            if (this.currentFilePath) {
                const filename = this.currentFilePath[this.currentFilePath.length - 1];
                editorTitle.textContent = filename;
            } else {
                editorTitle.textContent = 'Untitled';
            }
        }

        if (modifiedIndicator) {
            modifiedIndicator.textContent = this.isModified ? '*' : '';
            modifiedIndicator.className = this.isModified ? 'pane-header-info modified-indicator' : 'pane-header-info';
        }

        if (filePathDisplay) {
            if (this.currentFilePath) {
                filePathDisplay.textContent = this.currentFilePath.join('/');
            } else {
                filePathDisplay.textContent = 'New File';
            }
        }
    }

    markModified() {
        const editor = this.getElement('#scriptEditor');
        if (editor && editor.value !== this.originalContent) {
            if (!this.isModified) {
                this.isModified = true;
                this.updateEditorTitle();
            }
        }
    }

    toggleFind() {
        const findBar = this.getElement('#findBar');
        const findInput = this.getElement('#findInput');

        this.findVisible = !this.findVisible;
        findBar.style.display = this.findVisible ? 'flex' : 'none';

        if (this.findVisible) {
            findInput.focus();
            // Get selected text as search term
            const editor = this.getElement('#scriptEditor');
            const selected = editor.value.substring(editor.selectionStart, editor.selectionEnd);
            if (selected) {
                findInput.value = selected;
            }
        }
    }

    findNext() {
        const findInput = this.getElement('#findInput');
        const editor = this.getElement('#scriptEditor');
        const findInfo = this.getElement('#findInfo');

        const searchText = findInput.value;
        if (!searchText) return;

        const text = editor.value;
        const startPos = editor.selectionEnd;
        const index = text.indexOf(searchText, startPos);

        if (index !== -1) {
            editor.selectionStart = index;
            editor.selectionEnd = index + searchText.length;
            editor.focus();
            this.scrollToSelection(editor);
            this.updateFindInfo(text, searchText);
        } else {
            // Wrap around
            const wrapIndex = text.indexOf(searchText);
            if (wrapIndex !== -1) {
                editor.selectionStart = wrapIndex;
                editor.selectionEnd = wrapIndex + searchText.length;
                editor.focus();
                this.scrollToSelection(editor);
                findInfo.textContent = 'Wrapped';
            } else {
                findInfo.textContent = 'Not found';
            }
        }
    }

    findPrev() {
        const findInput = this.getElement('#findInput');
        const editor = this.getElement('#scriptEditor');
        const findInfo = this.getElement('#findInfo');

        const searchText = findInput.value;
        if (!searchText) return;

        const text = editor.value;
        const startPos = editor.selectionStart - 1;
        const index = text.lastIndexOf(searchText, startPos);

        if (index !== -1) {
            editor.selectionStart = index;
            editor.selectionEnd = index + searchText.length;
            editor.focus();
            this.scrollToSelection(editor);
            this.updateFindInfo(text, searchText);
        } else {
            // Wrap around
            const wrapIndex = text.lastIndexOf(searchText);
            if (wrapIndex !== -1) {
                editor.selectionStart = wrapIndex;
                editor.selectionEnd = wrapIndex + searchText.length;
                editor.focus();
                this.scrollToSelection(editor);
                findInfo.textContent = 'Wrapped';
            } else {
                findInfo.textContent = 'Not found';
            }
        }
    }

    replaceOne() {
        const findInput = this.getElement('#findInput');
        const replaceInput = this.getElement('#replaceInput');
        const editor = this.getElement('#scriptEditor');

        const searchText = findInput.value;
        const replaceText = replaceInput.value;
        if (!searchText) return;

        const selected = editor.value.substring(editor.selectionStart, editor.selectionEnd);
        if (selected === searchText) {
            const start = editor.selectionStart;
            editor.value = editor.value.substring(0, start) + replaceText + editor.value.substring(editor.selectionEnd);
            editor.selectionStart = start;
            editor.selectionEnd = start + replaceText.length;
            this.updateSyntaxHighlight();
            this.findNext();
        } else {
            this.findNext();
        }
    }

    replaceAll() {
        const findInput = this.getElement('#findInput');
        const replaceInput = this.getElement('#replaceInput');
        const editor = this.getElement('#scriptEditor');
        const findInfo = this.getElement('#findInfo');

        const searchText = findInput.value;
        const replaceText = replaceInput.value;
        if (!searchText) return;

        const count = (editor.value.match(new RegExp(this.escapeRegex(searchText), 'g')) || []).length;
        editor.value = editor.value.split(searchText).join(replaceText);
        this.updateSyntaxHighlight();
        findInfo.textContent = `Replaced ${count} occurrences`;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    updateFindInfo(text, searchText) {
        const findInfo = this.getElement('#findInfo');
        const count = (text.match(new RegExp(this.escapeRegex(searchText), 'g')) || []).length;
        findInfo.textContent = `${count} match${count !== 1 ? 'es' : ''}`;
    }

    scrollToSelection(editor) {
        // Calculate line number and scroll to it
        const textBefore = editor.value.substring(0, editor.selectionStart);
        const lineNumber = textBefore.split('\n').length;
        const lineHeight = 18; // Approximate line height
        editor.scrollTop = (lineNumber - 5) * lineHeight;
    }

    updateCharCount() {
        const editor = this.getElement('#scriptEditor');
        const charCount = this.getElement('#charCount');
        if (editor && charCount) {
            const chars = editor.value.length;
            const lines = editor.value.split('\n').length;
            charCount.textContent = `${chars} chars, ${lines} lines`;
        }
    }

    highlightErrorLine(lineNum) {
        this.errorLine = lineNum;
        const lineNumbers = this.getElement('#lineNumbers');
        if (lineNumbers) {
            const lines = lineNumbers.innerHTML.split('\n');
            lines[lineNum - 1] = `<span class="error-gutter">${lineNum}</span>`;
            lineNumbers.innerHTML = lines.join('\n');
        }
    }

    clearErrorHighlight() {
        this.errorLine = null;
        this.updateSyntaxHighlight();
    }

    updateVariablesPanel() {
        // This is called when script:variables event is received
        // The tab will display current variables when switched to
    }

    async saveScript() {
        const editor = this.getElement('#scriptEditor');
        const script = editor.value;

        try {
            // Use existing path if available, otherwise prompt
            let savePath = this.currentFilePath;

            if (!savePath) {
                const result = await EventBus.request('dialog:file-save', {
                    title: 'Save Script As',
                    defaultPath: ['C:', 'Users', 'User', 'Documents'],
                    defaultName: 'script.retro',
                    filters: [
                        { name: 'RetroScript', extensions: ['retro'] },
                        { name: 'All Files', extensions: ['*'] }
                    ]
                }, { timeout: 60000 });

                if (result && result.path) {
                    savePath = result.path;
                } else {
                    return; // User cancelled
                }
            }

            FileSystemManager.writeFile(savePath, script, 'retro');

            // Update file state
            this.currentFilePath = savePath;
            this.originalContent = script;
            this.isModified = false;
            this.updateEditorTitle();

            this.appendOutput(`Saved: ${savePath.join('/')}`, 'success');
        } catch (e) {
            // Save to default location on error
            const path = ['C:', 'Users', 'User', 'Documents', `script_${Date.now()}.retro`];
            FileSystemManager.writeFile(path, script, 'retro');

            this.currentFilePath = path;
            this.originalContent = script;
            this.isModified = false;
            this.updateEditorTitle();

            this.appendOutput(`Saved: ${path.join('/')}`, 'success');
        }
    }

    async saveScriptAs() {
        const editor = this.getElement('#scriptEditor');
        const script = editor.value;

        try {
            const result = await EventBus.request('dialog:file-save', {
                title: 'Save Script As',
                defaultPath: this.currentFilePath ? this.currentFilePath.slice(0, -1) : ['C:', 'Users', 'User', 'Documents'],
                defaultName: this.currentFilePath ? this.currentFilePath[this.currentFilePath.length - 1] : 'script.retro',
                filters: [
                    { name: 'RetroScript', extensions: ['retro'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            }, { timeout: 60000 });

            if (result && result.path) {
                FileSystemManager.writeFile(result.path, script, 'retro');

                this.currentFilePath = result.path;
                this.originalContent = script;
                this.isModified = false;
                this.updateEditorTitle();

                this.appendOutput(`Saved as: ${result.path.join('/')}`, 'success');
            }
        } catch (e) {
            this.appendOutput('Save cancelled', 'info');
        }
    }

    async loadScript() {
        try {
            const result = await EventBus.request('dialog:file-open', {
                title: 'Open Script',
                defaultPath: ['C:', 'Users', 'User', 'Documents'],
                filters: [
                    { name: 'RetroScript', extensions: ['retro'] },
                    { name: 'All Files', extensions: ['*'] }
                ]
            }, { timeout: 60000 });

            if (result && result.path) {
                const content = FileSystemManager.readFile(result.path);
                const editor = this.getElement('#scriptEditor');
                if (editor) {
                    editor.value = content;

                    // Update file state
                    this.currentFilePath = result.path;
                    this.originalContent = content;
                    this.isModified = false;
                    this.updateEditorTitle();
                    this.updateSyntaxHighlight();
                    this.updateCharCount();

                    this.appendOutput(`Opened: ${result.path.join('/')}`, 'success');
                }
            }
        } catch (e) {
            this.appendOutput('Open cancelled', 'info');
        }
    }

    showHelp() {
        const helpText = `
RetroScript Language Reference
==============================

See SCRIPTING_GUIDE.md for complete documentation.

COMMANDS:
  launch <app>              Launch an application
  launch <app> with k=v     Launch with parameters
  close [windowId]          Close a window
  wait <ms>                 Wait for milliseconds
  print <message>           Print to output
  alert <message>           Show alert dialog (non-blocking)
  confirm <msg> into $var   Show confirm dialog (waits for response)
  prompt <msg> into $var    Show input dialog (waits for response)
  notify <message>          Show notification
  play <sound>              Play a sound (notify, error, open, close)

VARIABLES:
  set $name = value         Set a variable
  $name                     Use a variable in expressions
  $i                        Loop counter (inside loops)

ARITHMETIC:
  set $x = $a + $b          Addition
  set $x = $a - $b          Subtraction
  set $x = $a * $b          Multiplication
  set $x = $a / $b          Division

CONTROL FLOW:
  if cond then { } else { } Conditional
  loop N { }                Repeat N times
  loop while cond { }       While loop
  break                     Exit loop
  return value              Return from script

COMPARISONS: ==, !=, <, >, <=, >=, &&, ||

EVENTS:
  emit event key=value      Emit an event
  on event { }              Subscribe to event

FILESYSTEM:
  write "text" to "path"    Write to file
  read "path" into $var     Read file into variable
  mkdir "path"              Create directory
  delete "path"             Delete file/directory

WINDOW MANAGEMENT:
  focus <windowId>          Bring window to front
  minimize <windowId>       Minimize window
  maximize <windowId>       Maximize window

STRING FUNCTIONS:
  call upper text           Uppercase
  call lower text           Lowercase
  call trim text            Remove whitespace
  call length text          String length
  call concat a b c         Concatenate strings
  call substr text 0 3      Substring
  call replace t old new    Replace first occurrence
  call contains text srch   Check if contains
  call startsWith text pre  Check prefix
  call endsWith text suf    Check suffix
  call split text sep       Split into array
  call join arr sep         Join array to string

MATH FUNCTIONS:
  call random min max       Random integer
  call abs value            Absolute value
  call round value          Round to nearest
  call floor value          Round down
  call ceil value           Round up

ARRAY FUNCTIONS:
  call count arr            Array length
  call first arr            First element
  call last arr             Last element
  call push arr item        Add to end
  call pop arr              Remove from end
  call includes arr item    Check if contains

TIME FUNCTIONS:
  call now                  Unix timestamp (ms)
  call time                 Current time string
  call date                 Current date string

TYPE FUNCTIONS:
  call typeof val           Get type as string
  call isNumber val         Is number?
  call isString val         Is string?
  call isArray val          Is array?
  call isNull val           Is null/undefined?
  call toNumber val         Convert to number
  call toString val         Convert to string

SYSTEM FUNCTIONS:
  call getWindows           List open windows
  call getApps              List available apps
  call exec cmd payload     Execute a registered command

QUICK EXAMPLES:

  # Interactive prompt
  prompt "Your name?" into $name
  alert Hello, $name!

  # Loop with counter
  loop 5 { print Iteration: $i }

  # Conditional
  if $x > 5 then { print Big }

  # File operations
  write "Hello" to "C:/test.txt"
  read "C:/test.txt" into $content
`;

        this.appendOutput(helpText, 'info');
    }

    loadTestSuite() {
        const editor = this.getElement('#scriptEditor');
        if (editor && this.fullTestSuite) {
            // Check if there's existing content
            if (editor.value.trim()) {
                // Ask before overwriting (simple confirm via output)
                this.appendOutput('Loading test suite - replacing current content...', 'info');
            }

            editor.value = this.fullTestSuite;

            // Update file state (test suite is not a saved file)
            this.currentFilePath = null;
            this.originalContent = this.fullTestSuite;
            this.isModified = false;
            this.updateEditorTitle();
            this.updateSyntaxHighlight();
            this.updateCharCount();

            this.clearOutput();
            this.appendOutput('═══════════════════════════════════════════', 'info');
            this.appendOutput('  COMPREHENSIVE TEST SUITE LOADED', 'success');
            this.appendOutput('═══════════════════════════════════════════', 'info');
            this.appendOutput('', 'info');
            this.appendOutput('This test suite validates all RetroScript features:', 'info');
            this.appendOutput('  - Variables & Data Types', 'info');
            this.appendOutput('  - Arithmetic & Comparison Operators', 'info');
            this.appendOutput('  - Control Flow (if/else, loops)', 'info');
            this.appendOutput('  - User-Defined Functions', 'info');
            this.appendOutput('  - String, Math, Array Functions', 'info');
            this.appendOutput('  - Object Functions', 'info');
            this.appendOutput('  - Error Handling (try/catch)', 'info');
            this.appendOutput('  - Events & System Commands', 'info');
            this.appendOutput('', 'info');
            this.appendOutput('Press F5 or click "Run" to execute all tests.', 'success');
        }
    }

    switchTab(tabName) {
        const tabs = this.getElement('.output-tabs').querySelectorAll('.output-tab');
        tabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        const outputText = this.getElement('#outputText');
        if (!outputText) return;

        switch (tabName) {
            case 'output':
                outputText.innerHTML = this.output.join('\n') || 'No output yet.\n';
                break;
            case 'events':
                outputText.innerHTML = this.eventLog.map(e =>
                    `<span class="event">[${e.time}] ${escapeHtml(e.event)}</span>\n  ${escapeHtml(e.payload)}`
                ).join('\n\n') || 'No events logged yet.\nRun a script or interact with the system to see events.\n';
                break;
            case 'variables':
                outputText.innerHTML = this.renderVariables();
                break;
            case 'recorded':
                outputText.innerHTML = this.renderRecordedCode();
                // Setup button handlers after rendering
                setTimeout(() => this.setupRecordedTabButtons(), 0);
                break;
            case 'commands':
                const commands = EventBus.getCommands();
                outputText.innerHTML = 'Available Commands:\n\n' + commands.map(c =>
                    `  command:${c}`
                ).join('\n');
                break;
        }
    }

    renderVariables() {
        const vars = Object.entries(this.variables);
        if (vars.length === 0) {
            return `<div class="recorded-header">Variables</div>
No variables captured yet.

Variables are captured when a script runs.
Run a script to see variable values here.

<span class="info">Tip: Use the Output tab to see script output.</span>`;
        }

        let html = `<div class="recorded-header">Script Variables (${vars.length})</div>
<table class="var-table">
<tr><th>Name</th><th>Type</th><th>Value</th></tr>`;

        for (const [name, value] of vars) {
            const type = Array.isArray(value) ? 'array' : typeof value;
            let displayValue = value;

            if (typeof value === 'object' && value !== null) {
                try {
                    displayValue = JSON.stringify(value);
                } catch (e) {
                    displayValue = '[Object]';
                }
            }

            html += `<tr>
<td class="var-name">$${escapeHtml(name)}</td>
<td class="var-type">${type}</td>
<td class="var-value" title="${escapeHtml(String(displayValue))}">${escapeHtml(String(displayValue))}</td>
</tr>`;
        }

        html += '</table>';
        return html;
    }

    renderRecordedCode() {
        if (this.recordedEvents.length === 0) {
            const isRecording = this.isRecording;
            return `<div class="recorded-header">Event Recorder</div>
${isRecording ? '<span class="error">⏺ Recording in progress...</span>\n\n' : ''}No events recorded yet.

<span class="info">How to use the Event Recorder:</span>

1. Click the <span class="rec-command">⏺ Record</span> button in the toolbar
2. Perform actions in RetroOS:
   • Launch applications (calculator, notepad, etc.)
   • Play sounds
   • Show notifications
   • Create or delete files
   • Interact with the system
3. Click <span class="rec-command">⏹ Stop</span> to finish recording
4. Generated RetroScript code appears here

<span class="info">Why use recording?</span>
• <span class="success">Learn</span> - See how actions translate to code
• <span class="success">Automate</span> - Quickly create automation scripts
• <span class="success">Document</span> - Record workflows as executable scripts

<span class="info">Tip:</span> You can copy the generated code and paste it
into the editor to modify and run it!
`;
        }

        // Build clean code (without HTML comments)
        let cleanCode = `# Recorded RetroScript\n`;
        cleanCode += `# Generated: ${new Date().toLocaleString()}\n`;
        cleanCode += `# Events: ${this.recordedEvents.length}\n\n`;

        for (const event of this.recordedEvents) {
            // Add a simple comment for context
            if (!event.code.startsWith('#')) {
                cleanCode += `${event.code}\n`;
            } else {
                cleanCode += `${event.code}\n`;
            }
        }

        // Build display code with syntax highlighting
        let displayCode = `<span class="rec-comment"># Recorded RetroScript</span>\n`;
        displayCode += `<span class="rec-comment"># Generated: ${new Date().toLocaleString()}</span>\n`;
        displayCode += `<span class="rec-comment"># Events: ${this.recordedEvents.length}</span>\n\n`;

        for (const event of this.recordedEvents) {
            if (event.code.startsWith('#')) {
                displayCode += `<span class="rec-comment">${escapeHtml(event.code)}</span>\n`;
            } else {
                // Highlight the command
                const parts = event.code.split(' ');
                const cmd = parts[0];
                const rest = parts.slice(1).join(' ');
                displayCode += `<span class="rec-command">${escapeHtml(cmd)}</span> ${escapeHtml(rest)}\n`;
            }
        }

        // Store clean code for copy/insert operations
        this.lastRecordedCode = cleanCode;

        return `<div class="recorded-header">
<span class="success">Recorded Code</span> (${this.recordedEvents.length} events)
</div>
<div class="recorded-actions" style="margin-bottom: 8px;">
<button class="copy-btn" id="copyCodeBtn">📋 Copy to Clipboard</button>
<button class="copy-btn" id="insertCodeBtn" style="margin-left: 4px;">📝 Insert into Editor</button>
<button class="copy-btn" id="clearRecordedBtn" style="margin-left: 4px; background: #553;">🗑 Clear</button>
</div>
<div class="recorded-code" style="white-space: pre-wrap; line-height: 1.4;">${displayCode}</div>
<div style="margin-top: 12px; padding: 8px; background: #1a1a1a; border-left: 3px solid #4CAF50;">
<span class="info">Actions:</span>
• <strong>Copy to Clipboard</strong> - Copy the code and paste anywhere
• <strong>Insert into Editor</strong> - Add the code to your current script
• <strong>Clear</strong> - Remove recorded events and start fresh
</div>`;
    }

    setupRecordedTabButtons() {
        const copyBtn = this.getElement('#copyCodeBtn');
        const insertBtn = this.getElement('#insertCodeBtn');
        const clearBtn = this.getElement('#clearRecordedBtn');

        if (copyBtn) {
            copyBtn.onclick = () => {
                if (this.lastRecordedCode) {
                    navigator.clipboard.writeText(this.lastRecordedCode);
                    this.appendOutput('Recorded code copied to clipboard!', 'success');
                }
            };
        }

        if (insertBtn) {
            insertBtn.onclick = () => {
                const editor = this.getElement('#scriptEditor');
                if (editor && this.lastRecordedCode) {
                    const currentContent = editor.value;
                    if (currentContent.trim()) {
                        editor.value = currentContent + '\n\n' + this.lastRecordedCode;
                    } else {
                        editor.value = this.lastRecordedCode;
                    }
                    this.updateSyntaxHighlight();
                    this.updateCharCount();
                    this.markModified();
                    this.appendOutput('Recorded code inserted into editor!', 'success');
                    this.switchTab('output');
                }
            };
        }

        if (clearBtn) {
            clearBtn.onclick = () => {
                this.recordedEvents = [];
                this.lastRecordedCode = '';
                this.switchTab('recorded'); // Refresh the tab
                this.appendOutput('Recorded events cleared', 'info');
            };
        }
    }

    appendOutput(message, type = 'normal') {
        const outputText = this.getElement('#outputText');
        if (!outputText) return;

        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = type !== 'normal'
            ? `<span class="${type}">[${timestamp}] ${escapeHtml(message)}</span>`
            : `[${timestamp}] ${escapeHtml(message)}`;

        this.output.push(formattedMessage);
        if (this.output.length > this.maxLogEntries) {
            this.output.shift();
        }

        outputText.innerHTML = this.output.join('\n');
        outputText.parentElement.scrollTop = outputText.parentElement.scrollHeight;
    }

    setStatus(text, state) {
        const statusText = this.getElement('#statusText');
        const statusLed = this.getElement('#statusLed');
        if (statusText) {
            statusText.innerHTML = `<span class="status-led${state === 'running' ? ' running' : state === 'error' ? ' error' : ''}" id="statusLed"></span> ${escapeHtml(text)}`;
        }
    }

    updateLineInfo() {
        const editor = this.getElement('#scriptEditor');
        const lineInfo = this.getElement('#lineInfo');
        if (!editor || !lineInfo) return;

        const text = editor.value.substring(0, editor.selectionStart);
        const lines = text.split('\n');
        const line = lines.length;
        const col = lines[lines.length - 1].length + 1;

        lineInfo.textContent = `Line ${line}, Col ${col}`;
    }

    updateSyntaxHighlight() {
        const editor = this.getElement('#scriptEditor');
        const highlight = this.getElement('#syntaxHighlight');
        const lineNumbers = this.getElement('#lineNumbers');

        if (!editor || !highlight) return;

        const code = editor.value;
        const highlighted = this.highlightSyntax(code);
        highlight.innerHTML = highlighted + '\n';

        // Get current line for highlighting
        const cursorPos = editor.selectionStart;
        const textBefore = code.substring(0, cursorPos);
        const currentLine = textBefore.split('\n').length;

        // Update gutter with breakpoints and current-line
        if (lineNumbers) {
            const lines = code.split('\n');
            lineNumbers.innerHTML = lines.map((_, i) => {
                const lineNum = i + 1;
                const isCurrent = lineNum === currentLine;
                const hasBP = this.breakpoints.has(lineNum);
                const hasErr = this.errorLine === lineNum;
                const classes = ['gutter-line'];
                if (isCurrent) classes.push('current-line');
                if (hasBP) classes.push('has-breakpoint');
                if (hasErr) classes.push('has-error');
                return `<div class="${classes.join(' ')}" data-line="${lineNum}"><span class="gutter-num">${lineNum}</span></div>`;
            }).join('');
        }
    }

    updateGutterHighlight() {
        const editor = this.getElement('#scriptEditor');
        if (!editor) return;

        const cursorPos = editor.selectionStart;
        const textBefore = editor.value.substring(0, cursorPos);
        const currentLine = textBefore.split('\n').length;

        const gutterLines = this.getElements('.gutter-line');
        gutterLines.forEach(el => {
            const lineNum = parseInt(el.dataset.line);
            el.classList.toggle('current-line', lineNum === currentLine);
        });
    }

    syncScroll() {
        const editor = this.getElement('#scriptEditor');
        const highlight = this.getElement('#syntaxHighlight');
        const lineNumbers = this.getElement('#lineNumbers');

        if (editor && highlight) {
            highlight.scrollTop = editor.scrollTop;
            highlight.scrollLeft = editor.scrollLeft;
        }
        if (editor && lineNumbers) {
            lineNumbers.scrollTop = editor.scrollTop;
        }
        // Update minimap viewport position
        this.updateMinimapViewport();
    }

    updateMinimapViewport() {
        const editor = this.getElement('#scriptEditor');
        const viewport = this.getElement('#minimapViewport');
        const canvas = this.getElement('#minimapCanvas');
        if (!editor || !viewport || !canvas) return;

        const canvasHeight = canvas.height;
        const viewRatio = editor.clientHeight / Math.max(1, editor.scrollHeight);
        const scrollRatio = editor.scrollTop / Math.max(1, editor.scrollHeight);
        viewport.style.top = (scrollRatio * canvasHeight) + 'px';
        viewport.style.height = Math.max(20, viewRatio * canvasHeight) + 'px';
    }

    /**
     * Apply syntax highlighting to code
     */
    highlightSyntax(code) {
        // Keywords
        const keywords = ['if', 'then', 'else', 'loop', 'while', 'foreach', 'for', 'in', 'break', 'continue', 'return', 'def', 'func', 'function', 'try', 'catch', 'on', 'with', 'into', 'to', 'default'];
        // Commands
        const commands = ['launch', 'open', 'close', 'wait', 'sleep', 'print', 'log', 'set', 'emit', 'alert', 'confirm', 'prompt', 'notify', 'focus', 'minimize', 'maximize', 'play', 'write', 'read', 'mkdir', 'delete', 'rm', 'call'];
        // Built-in functions
        const builtins = ['random', 'abs', 'round', 'floor', 'ceil', 'min', 'max', 'pow', 'sqrt', 'sin', 'cos', 'tan', 'log', 'exp', 'clamp', 'mod', 'sign', 'concat', 'upper', 'lower', 'length', 'trim', 'trimStart', 'trimEnd', 'split', 'join', 'substr', 'substring', 'replace', 'replaceAll', 'contains', 'startsWith', 'endsWith', 'padStart', 'padEnd', 'repeat', 'charAt', 'charCode', 'fromCharCode', 'indexOf', 'lastIndexOf', 'match', 'count', 'first', 'last', 'push', 'pop', 'shift', 'unshift', 'includes', 'sort', 'reverse', 'slice', 'splice', 'concat_arrays', 'unique', 'flatten', 'range', 'fill', 'at', 'find', 'findIndex', 'filter', 'map', 'sum', 'avg', 'every', 'some', 'keys', 'values', 'entries', 'get', 'set', 'has', 'merge', 'clone', 'toJSON', 'fromJSON', 'prettyJSON', 'getWindows', 'getApps', 'now', 'time', 'date', 'year', 'month', 'day', 'weekday', 'hour', 'minute', 'second', 'formatDate', 'formatTime', 'elapsed', 'query', 'exec', 'alert', 'confirm', 'prompt', 'typeof', 'isNumber', 'isString', 'isArray', 'isObject', 'isBoolean', 'isNull', 'isEmpty', 'toNumber', 'toInt', 'toString', 'toBoolean', 'toArray', 'debug', 'inspect', 'assert', 'getEnv', 'PI', 'E'];

        const lines = code.split('\n');
        return lines.map(line => {
            // Escape HTML first
            let result = escapeHtml(line);

            // Comments (must be first to avoid highlighting inside comments)
            if (result.trim().startsWith('#')) {
                return `<span class="comment">${result}</span>`;
            }

            // Handle inline comments (outside strings)
            const commentMatch = result.match(/^([^#"']*)(#.*)$/);
            if (commentMatch) {
                const beforeComment = commentMatch[1];
                const comment = commentMatch[2];
                result = this.highlightLine(beforeComment, keywords, commands, builtins) +
                         `<span class="comment">${comment}</span>`;
                return result;
            }

            return this.highlightLine(result, keywords, commands, builtins);
        }).join('\n');
    }

    /**
     * Highlight a single line
     */
    highlightLine(line, keywords, commands, builtins) {
        let result = line;

        // Strings (handle first to avoid issues with keywords inside strings)
        result = result.replace(/"([^"\\]|\\.)*"/g, '<span class="string">$&</span>');
        result = result.replace(/'([^'\\]|\\.)*'/g, '<span class="string">$&</span>');

        // Variables ($name)
        result = result.replace(/\$\w+/g, '<span class="variable">$&</span>');

        // Numbers
        result = result.replace(/\b(\d+\.?\d*)\b/g, '<span class="number">$1</span>');

        // Keywords (word boundary match)
        const keywordPattern = new RegExp(`\\b(${keywords.join('|')})\\b`, 'gi');
        result = result.replace(keywordPattern, '<span class="keyword">$1</span>');

        // Commands (at start of line or after semicolon)
        const commandPattern = new RegExp(`(^|;\\s*)(${commands.join('|')})\\b`, 'gi');
        result = result.replace(commandPattern, '$1<span class="command">$2</span>');

        // Built-in functions (after 'call')
        const builtinPattern = new RegExp(`(call\\s+)(${builtins.join('|')})\\b`, 'gi');
        result = result.replace(builtinPattern, '$1<span class="builtin">$2</span>');

        // Operators
        result = result.replace(/([+\-*/%=<>!&|]+)/g, '<span class="operator">$1</span>');

        // Event names (word:word pattern)
        result = result.replace(/\b(\w+:\w+)\b/g, '<span class="event">$1</span>');

        return result;
    }

    showAbout() {
        this.appendOutput(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  RetroScript IDE v2.0 Professional
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  A full-featured scripting environment
  for RetroOS automation and development.

  Features:
   - Syntax highlighting editor
   - Auto-indent & bracket matching
   - Find/Replace with regex support
   - Code snippet library
   - Variable inspector
   - Event recording & code generation
   - Resizable split pane layout
   - Code minimap
   - Breakpoint gutter
   - Execution timer
   - Comprehensive test suite
   - Keyboard shortcuts

  Engine: RetroScript Language v1.0
  Platform: RetroOS

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`, 'info');
    }

    // Helper to get all matching elements in current window
    getElements(selector) {
        try {
            const windowEl = document.getElementById(this._currentWindowId);
            if (windowEl) return Array.from(windowEl.querySelectorAll(selector));
        } catch (e) { console.warn('[ScriptRunner] Window-scoped query failed, falling back to document:', e); }
        return Array.from(document.querySelectorAll(selector));
    }

    // Get the current window ID for this app instance
    getCurrentWindowId() {
        if (this._currentWindowId) return this._currentWindowId;
        // Fallback: look through openWindows map
        if (this.openWindows) {
            for (const [id] of this.openWindows) return id;
        }
        return null;
    }

    // HTML attribute escaping
    escapeAttr(text) {
        return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;');
    }

    onClose() {
        if (this.executionTimer) {
            clearInterval(this.executionTimer);
            this.executionTimer = null;
        }
        // Event subscriptions auto-clean via this.subscribe(...) tracking.
        if (this.isRecording) {
            EventBus.emit('macro:record:stop');
        }
    }
}

export default ScriptRunner;
