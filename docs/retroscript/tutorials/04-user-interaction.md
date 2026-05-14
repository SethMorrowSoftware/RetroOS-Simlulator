# Tutorial 04 — User Interaction

> **Goal.** Turn the quiz from Tutorial 03 into an interactive
> onboarding wizard: ask for the user's name, then ask each question
> in turn, then show a notification with the final grade.

> **Prerequisites.** [Tutorial 03](03-control-flow.md).

---

## Step 1 — The four interaction primitives

RetroScript has four interaction primitives:

| Statement | Blocks? | Default var | Used for |
|---|---|---|---|
| `alert msg` | No | — | One-button modal dialog |
| `confirm msg [into $v]` | **Yes** | `$confirmed` | Yes/No question, returns boolean |
| `prompt msg [default v] [into $v]` | **Yes** | `$input` | Free-text input, returns string |
| `notify msg` | No | — | Toast notification (non-modal) |

"Blocking" means the script pauses while the user interacts — script
execution literally awaits the user's click.

Test each one:

```retro
alert "Welcome to the quiz."
confirm "Are you ready?" into $ready
prompt "Your name?" default "Anonymous" into $name
notify "Hello, " + $name + "!"
```

Run it. You should:

1. See an alert dialog. Click OK.
2. See a confirm dialog. Click OK or Cancel.
3. See a prompt dialog. Type a name and click OK (or just press Enter
   to accept the default).
4. See a notification toast in the corner.

---

## Step 2 — Handling the `confirm` result

`confirm` returns a boolean. The `into $var` clause writes it to a
variable; without it, the result lands in `$confirmed`:

```retro
confirm "Continue?"
if $confirmed {
  print "Pressed OK"
} else {
  print "Pressed Cancel"
}
```

Equivalent with an explicit variable:

```retro
confirm "Continue?" into $go
if $go {
  print "Pressed OK"
}
```

When in doubt, name your variables — anonymous defaults read fine in
isolation but get confusing across a long script.

---

## Step 3 — Handling the `prompt` result

`prompt` returns whatever the user typed (always a string). If they
press Cancel, you get the default value:

```retro
prompt "Your age?" default "0" into $ageText
set $age = call toNumber $ageText

if $age >= 18 {
  print "Adult."
} else {
  print "Minor (age $age)."
}
```

> The `default` value also doubles as the "headless" answer when the
> script runs in autoexec mode — see
> [GUIDE.md §21](../GUIDE.md#21-autoexec--the-boot-time-script).

---

## Step 4 — Input validation

Add the `validateInput` builtin to your toolbox:

```retro
prompt "Email?" default "" into $email
set $valid = call validateInput $email "email"
if !$valid {
  alert "That doesn't look like an email."
}
```

Supported types: `"number"`, `"email"`, `"url"`, `"nonempty"`,
`"text"`. The validator returns a boolean.

For a more thorough check, write your own helper:

```retro
def askNonEmpty($msg) {
  prompt $msg into $r
  while call isEmpty (call trim $r) {
    alert "Please type something."
    prompt $msg into $r
  }
  return $r
}

set $name = call askNonEmpty "Your name?"
```

---

## Step 5 — A wizard structure

Let's wire it all together into the quiz onboarding flow:

```retro
set $name = call askNonEmpty "Welcome to the quiz. Your name?"

confirm "Hi, $name. Ready to start?" into $ready
if !$ready {
  notify "Goodbye, $name!"
  return
}

set $quiz = [
  { id: "q1", text: "What's 2 + 2?",      answer: "4",     points: 5  },
  { id: "q2", text: "Capital of France?", answer: "paris", points: 10 },
  { id: "q3", text: "True or false: RetroScript uses # for comments.", answer: "true", points: 5 },
]

set $score = 0
set $total = 0

foreach $q in $quiz {
  prompt $q.text default "" into $given

  set $expected = call lower (call trim $q.answer)
  set $userAns  = call lower (call trim $given)

  set $total = $total + $q.points
  if $expected == $userAns {
    set $score = $score + $q.points
    notify "Correct!"
  } else {
    notify "Wrong. The answer was: " + $q.answer
  }
}

set $pct = (100 * $score) / $total
alert "Final score for $name: $score / $total ($pct%)"
```

Wait — that script has a subtle bug. Spot it before reading on.

---

## Step 6 — The bug: `return` outside a function

`return` at the top level of a script is a no-op (and in some parsers
a hard error). Either way, the script doesn't stop when the user clicks
Cancel.

The fix: structure the wizard as a function and `return` from there.

```retro
def runQuiz() {
  set $name = call askNonEmpty "Welcome to the quiz. Your name?"

  confirm "Hi, $name. Ready to start?" into $ready
  if !$ready {
    notify "Goodbye, $name!"
    return
  }

  set $quiz = [
    { id: "q1", text: "What's 2 + 2?",      answer: "4",     points: 5  },
    { id: "q2", text: "Capital of France?", answer: "paris", points: 10 },
    { id: "q3", text: "True or false: RetroScript uses # for comments.", answer: "true", points: 5 },
  ]

  set $score = 0
  set $total = 0

  foreach $q in $quiz {
    prompt $q.text default "" into $given
    set $expected = call lower (call trim $q.answer)
    set $userAns  = call lower (call trim $given)

    set $total = $total + $q.points
    if $expected == $userAns {
      set $score = $score + $q.points
      notify "Correct!"
    } else {
      notify "Wrong. The answer was: " + $q.answer
    }
  }

  set $pct = (100 * $score) / $total
  alert "Final score for $name: " + (call toString $score) + " / " + (call toString $total) + " (" + (call toString $pct) + "%)"
}

def askNonEmpty($msg) {
  prompt $msg into $r
  while call isEmpty (call trim $r) {
    alert "Please type something."
    prompt $msg into $r
  }
  return $r
}

call runQuiz
```

Now `return` inside `runQuiz` cleanly exits the wizard.

---

## Step 7 — Non-blocking feedback

A nice touch: show a `notify` toast immediately on quiz start and
again on end so the user sees momentum even before the alert:

```retro
notify "Quiz starting for " + $name + "..."
# ...questions...
notify "Quiz complete!"
alert "Final score..."
```

`notify` doesn't block; `alert` does. Use the two together to provide
both incidental status and definitive endpoints.

---

## Try it — checklist

- [ ] The wizard runs end-to-end and shows a final alert with score.
- [ ] Clicking Cancel on "Ready to start?" exits cleanly with a
      goodbye notification.
- [ ] Pressing Enter on a question (empty input) marks that question
      wrong.
- [ ] Pressing Enter on the name prompt is rejected and re-prompts (via
      `askNonEmpty`).

---

## Exercises

1. Add a `confirm` before showing the final alert: *"See your detailed
   results?"* If yes, print each question with the user's answer
   alongside the correct one.
2. Replace `notify "Correct!"` with a sound effect. Use
   `play notify` for correct and `play error` for wrong. (Both are
   predefined sound types — see
   [DICTIONARY → System Events](../DICTIONARY.md#sound--audio).)
3. Use `validateInput` to require numeric answers for question 1
   (re-prompt until the user types a number).
4. Persist the name to storage so the next run greets the user back
   without asking: `call setStorage "quiz:name" $name` /
   `set $name = call getStorage "quiz:name"`. Default if missing.

---

## What's next

[Tutorial 05 — Files and Storage](05-files-and-storage.md) takes the
quiz one step further: persist all attempts to a JSON file so you can
see the user's history across sessions.
