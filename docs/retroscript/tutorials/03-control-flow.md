# Tutorial 03 — Control Flow and Functions

> **Goal.** Build a scored quiz with reusable helper functions, learning
> `if` / `match` / loops / functions / `try / catch` along the way.

> **Prerequisites.** [Tutorial 02](02-variables-and-data.md) — arrays
> and objects.

---

## Step 1 — The quiz data

We'll start with a small array of question objects:

```retro
set $quiz = [
  { id: "q1", text: "What's 2 + 2?",      answer: "4",   points: 5  },
  { id: "q2", text: "Capital of France?", answer: "paris", points: 10 },
  { id: "q3", text: "True or false: RetroScript uses # for comments.", answer: "true", points: 5 },
]

set $answers = {
  q1: "4",
  q2: "Paris",            # capitalized — we'll normalize before comparing
  q3: "true",
}
```

Notice the answer key for `q2` has a capital "P" but the expected
answer is lowercase. Real users do this all the time — we'll handle it
with `lower` and `trim`.

---

## Step 2 — A helper function

Define a function to check one answer. Functions use `def`:

```retro
def checkAnswer($question, $user) {
  set $expected = call lower (call trim $question.answer)
  set $given    = call lower (call trim $user)

  if $expected == $given {
    return $question.points
  } else {
    return 0
  }
}
```

Two things to notice:

1. `call` arguments are **space-separated**, not parenthesized.
2. `return` exits the function immediately with the given value (or
   `null` if you omit the value).

Test it:

```retro
print "" + (call checkAnswer $quiz[0] "4")     # 5
print "" + (call checkAnswer $quiz[0] "five")  # 0
print "" + (call checkAnswer $quiz[1] "Paris") # 10
```

---

## Step 3 — Scoring all the answers

Now loop through every question:

```retro
set $score = 0
set $total = 0

foreach $q in $quiz {
  set $total = $total + $q.points
  set $given = call get $answers $q.id ""
  set $earned = call checkAnswer $q $given
  set $score = $score + $earned

  print "[" + (call toString $earned) + "/" + (call toString $q.points) + "] " + $q.text
}

print "============================="
print "Final score: " + (call toString $score) + " / " + (call toString $total)
```

Output:

```
[5/5] What's 2 + 2?
[10/10] Capital of France?
[5/5] True or false: RetroScript uses # for comments.
=============================
Final score: 20 / 20
```

Two new builtins:

- `call get $obj $key default` reads a property dynamically (string
  key, returns default if missing).
- `call toString $n` converts numbers to strings for concatenation.

---

## Step 4 — A grade letter with `match`

Add a function that maps a score percentage to a grade. `match` is the
clean way to write multi-branch logic:

```retro
def gradeFor($pct) {
  match $pct {
    100, 99, 98, 97 => { return "A+" }
    default => {}
  }

  if $pct >= 90 { return "A" }
  else if $pct >= 80 { return "B" }
  else if $pct >= 70 { return "C" }
  else if $pct >= 60 { return "D" }
  else { return "F" }
}
```

Now call it:

```retro
set $pct = (100 * $score) / $total
set $grade = call gradeFor $pct
print "Grade: " + $grade + " (" + (call toString $pct) + "%)"
```

> **`match` uses strict equality.** No type coercion. If your `match`
> values are numbers, the expression must evaluate to a number — not
> `"100"`.
>
> Multi-value cases use commas: `1, 2, 3 => { ... }`.

---

## Step 5 — Iterating differently

Three loop kinds, all useful for different shapes of data:

```retro
# Bounded count — $i is auto-set
loop 3 {
  print "iteration " + (call toString $i)
}

# while
set $countdown = 5
while $countdown > 0 {
  print "T-" + (call toString $countdown)
  $countdown -= 1
}

# foreach with index
foreach $i, $q in $quiz {
  print "Question " + (call toString ($i + 1)) + ": " + $q.text
}
```

`break` and `continue` work in all loop forms. To skip questions whose
points are 0:

```retro
foreach $q in $quiz {
  if $q.points == 0 { continue }
  # ...score the question
}
```

To stop early when the user runs out of time (not modeled here):

```retro
foreach $q in $quiz {
  if call elapsed $start > 60_000 { break }   # but use 60000 — no _ separators
  # ...
}
```

(Yes, `60_000` is a syntax error in RetroScript. Write `60000` or
`60 * 1000`.)

---

## Step 6 — `try / catch` around dicey calls

Suppose part of your scoring relies on user input that could be
malformed JSON. Wrap it:

```retro
set $rawAnswers = '{"q1":"4","q2":"Paris","q3":"true"}'
try {
  set $answers = call fromJSON $rawAnswers
  if (call typeof $answers) != "object" {
    # fromJSON returns null on parse failure; treat that as an error too
    set $msg = "malformed answers payload"
    call assert false $msg
  }
} catch $err {
  print "Falling back to empty answers: " + $err
  set $answers = {}
}
```

Two things to know about `catch`:

- The variable name (`$err`) is optional. `catch { ... }` binds the
  message to `$error` by default.
- Some errors **cannot** be caught: `TimeoutError` (script ran too
  long), `RecursionError` (call stack exhausted), and `ParseError`
  (script wouldn't compile at all). Everything else is fair game.

---

## Step 7 — Putting it together

Final script:

```retro
# A self-contained quiz scorer.

set $quiz = [
  { id: "q1", text: "What's 2 + 2?",      answer: "4",     points: 5  },
  { id: "q2", text: "Capital of France?", answer: "paris", points: 10 },
  { id: "q3", text: "True or false: RetroScript uses # for comments.", answer: "true", points: 5 },
]

set $rawAnswers = '{"q1":"4","q2":"Paris","q3":"true"}'

try {
  set $answers = call fromJSON $rawAnswers
} catch {
  set $answers = {}
}

def checkAnswer($q, $user) {
  set $expected = call lower (call trim $q.answer)
  set $given    = call lower (call trim $user)
  if $expected == $given { return $q.points } else { return 0 }
}

def gradeFor($pct) {
  if $pct >= 90 { return "A" }
  else if $pct >= 80 { return "B" }
  else if $pct >= 70 { return "C" }
  else if $pct >= 60 { return "D" }
  else { return "F" }
}

set $score = 0
set $total = 0
foreach $q in $quiz {
  set $total = $total + $q.points
  set $earned = call checkAnswer $q (call get $answers $q.id "")
  set $score = $score + $earned
  print "[" + (call toString $earned) + "/" + (call toString $q.points) + "] " + $q.text
}

set $pct = (100 * $score) / $total
print "------------------------"
print "Score: " + (call toString $score) + " / " + (call toString $total)
print "Grade: " + (call gradeFor $pct) + " (" + (call toString $pct) + "%)"
```

You should see:

```
[5/5] What's 2 + 2?
[10/10] Capital of France?
[5/5] True or false: RetroScript uses # for comments.
------------------------
Score: 20 / 20
Grade: A (100%)
```

---

## Try it — checklist

- [ ] The script runs without errors.
- [ ] Changing `"Paris"` to `"Lyon"` drops the score to `10 / 20` and
      grade to `F`.
- [ ] Replacing `$rawAnswers` with `"{bad json"` triggers the `catch`
      block — score becomes `0 / 20`.
- [ ] Calling `checkAnswer` with a question whose `answer` is `""` and
      a user input of `""` returns the question's full points (both
      sides trim to empty string and compare equal).

---

## Exercises

1. Add a function `correctRatio($qList, $aMap)` that returns the count
   of correct answers divided by the total. Use it instead of computing
   `$pct` inline.
2. Add a new question type — multiple-choice. Add a `choices` array
   field and verify the user picked the right index instead of a free
   text answer. Branch on `$q.type` with `match`.
3. Use `try / catch` to assert the input answers object is non-empty;
   if it's empty, print a friendly "no answers submitted" line and
   skip scoring.
4. Refactor: turn the scoring loop into a function `score($quiz,
   $answers)` that returns `{score, total, percent, grade}`. Print it
   with `prettyJSON`.

---

## What's next

[Tutorial 04 — User Interaction](04-user-interaction.md) shows how to
collect the answers interactively via `prompt`, `confirm`, and
`notify`.
