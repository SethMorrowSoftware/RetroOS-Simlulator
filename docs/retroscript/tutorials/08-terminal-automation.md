# Tutorial 08 — Terminal Automation

> **Goal.** Drive the in-OS terminal from a RetroScript — open it, run
> a command sequence, capture the output, parse it, then build an
> interactive challenge that reacts to user commands.

> **Prerequisites.** [Tutorial 06](06-apps-and-windows.md) and a basic
> sense of [Tutorial 07's](07-events-and-reactivity.md) `on`
> handlers.

---

## Step 1 — Open the terminal from a script

```retro
call terminalOpen
```

That ensures a terminal window exists. If one's already open and
focused, it stays; otherwise a new one is created.

To give it an initial command to run on open:

```retro
call terminalOpen "ver"
```

The `ver` command prints the OS version banner. Watch it appear in the
terminal pane.

If you want to focus an existing terminal without launching a fresh
one:

```retro
call terminalFocus
```

And to check whether one's open at all:

```retro
set $open = call isTerminalOpen
print "Terminal open? " + (call toString $open)
```

---

## Step 2 — Run a single command and capture output

```retro
call terminalExecute "dir C:/Users/User"
set $r = call terminalGetOutput
print $r
```

`terminalExecute` returns a `{success, output, path}` object, but it
also updates the terminal's "last output" so `terminalGetOutput` can
read it. Either form works.

Capturing inline:

```retro
set $res = call terminalExecute "echo hello"
if $res.success {
  print "echo said: " + $res.output
}
```

---

## Step 3 — Run a sequence

Pass an array of commands to run in order. The function waits for each
one to finish before the next:

```retro
call terminalExecuteSequence [
  "cd C:/Users/User",
  "mkdir Projects",
  "cd Projects",
  "touch readme.txt",
  "dir",
]

print call terminalGetOutput
```

The return is `{success, outputs[]}` — `outputs` is an array of the
output of each command in order.

---

## Step 4 — Print into the terminal yourself

Sometimes you want to inject your own text — colored, formatted,
HTML — into the terminal pane.

```retro
call terminalPrint "*** SYSTEM MESSAGE ***" "#ff8800"
call terminalPrint "Boot sequence initialized." "lime"
call terminalPrintHtml "<b>HTML works too</b> &mdash; with sanitization."
```

Color can be a CSS color name or a hex code. `terminalPrintHtml` is
sanitized before injection.

---

## Step 5 — Inspect terminal state

```retro
set $state = call terminalGetState
print call prettyJSON $state
```

Sample output:

```json
{
  "currentPath": ["C:", "Users", "User"],
  "godMode": false,
  "hasActiveProcess": false,
  "historyCount": 5,
  "windowId": "terminal-1"
}
```

Individual accessors are also available:

```retro
set $cwd  = call terminalGetPath
set $hist = call terminalGetHistory
set $env  = call terminalGetEnvVars

print "cwd: " + $cwd
print "history: " + (call toString (call count $hist))
print "vars:"
print call prettyJSON $env
```

---

## Step 6 — Environment and aliases

```retro
call terminalSetEnvVar "EDITOR" "notepad"
set $editor = call terminalGetEnvVar "EDITOR"
print "EDITOR=" + $editor

call terminalAlias "ll" "dir"
call terminalAlias "ed" "notepad"
print call prettyJSON (call terminalGetAliases)
```

Now in the terminal pane, typing `ll` runs `dir` and `ed` opens
Notepad.

---

## Step 7 — A scripted onboarding sequence

Let's combine all of this. Run a sequence that *guides the user*
through a series of terminal lessons:

```retro
call terminalOpen
call terminalClear

call terminalPrint "===== Terminal Tour =====" "#88ddff"
call terminalPrint "I'll run a few commands. Watch the output."
wait 1000

call terminalExecuteSequence [
  "ver",
  "whoami",
  "pwd",
  "dir C:/Users/User/Documents",
]

wait 1500
call terminalPrint "" ""
call terminalPrint "Now I'll create a project folder." "lime"

call terminalExecuteSequence [
  "cd C:/Users/User/Projects",
  "mkdir tutorial-output",
  "cd tutorial-output",
  "touch README.txt",
  "dir",
]

call terminalPrint "Done. Project folder is ready." "#88ff88"
```

A few details worth noting:

- `terminalClear` wipes the pane before we start.
- The `wait` calls give the user time to read each block.
- Each `terminalExecuteSequence` is one atomic chunk — the script
  resumes after the *whole* sequence has run.

---

## Step 8 — Reading terminal commands the user types

The terminal emits `app:terminal:command` for every command the user
runs (whether typed or scripted). Subscribe to make a reactive
tutorial:

```retro
call terminalOpen
call terminalPrint "Find the password.txt file under C:/Users/User/Secret/." "#ffff00"

on app:terminal:command {
  set $cmd = $event.command
  if call contains $cmd "password.txt" {
    call terminalPrint "Found it. Now read the file." "#88ff88"
  }
  if call startsWith $cmd "type C:/Users/User/Secret/password.txt" {
    call terminalPrint "Excellent. Mission complete." "lime"
  }
}

# Keep the script alive while the user explores
wait 60000
```

The user types `dir C:/Users/User/Secret`, sees the file, then
`type C:/Users/User/Secret/password.txt` to print its contents — and
your script reacts each step with colored feedback.

---

## Step 9 — Multi-instance gotcha

The terminal is **multi-instance**. Each window has its own:

- command history
- current working directory
- env vars
- aliases
- god-mode state
- last output

The `terminal*` builtins act on the most recently focused terminal. If
you have two open and the user clicks the wrong one, your script might
target the wrong window.

When that matters, target a specific window via the command bus:

```retro
emit command:terminal:execute command="dir" windowId="terminal-1"
```

You can find available terminal windows with:

```retro
set $terms = call filterBy (call query "windows") "appId" "terminal"
foreach $t in $terms {
  print $t.id + " — " + $t.title
}
```

---

## Step 10 — Run a `.retro` file from the terminal

Scripts can chain — one script can run another via the terminal's
`retro` command, or directly via the dedicated builtin:

```retro
call terminalRunScript "C:/Users/User/Documents/setup.retro"
```

Useful for breaking a long onboarding into chapters. Each chapter is
its own `.retro` file; the orchestrator runs them in order.

---

## Try it — checklist

- [ ] The script opens a terminal window and clears it.
- [ ] The "Terminal Tour" prints in cyan, then each command runs and
      produces output.
- [ ] The project folder appears in `C:/Users/User/Projects/`.
- [ ] In the reactive challenge, typing the right command turns the
      hint line green.
- [ ] Closing the terminal *while the script is running* doesn't crash
      the script — subsequent terminal calls become no-ops with safe
      fallbacks.

---

## Exercises

1. Write a script that **diagnoses** the user's setup: print the OS
   version, the contents of `C:/Users/User/Documents`, and the size of
   `C:/Users/User/.retroconfig` (if any). Pretty-print the report into
   the terminal using `terminalPrint` with different colors per
   section.
2. Add a `confirm` before the destructive part of the onboarding
   (folder creation). Skip the writes if the user says no.
3. Build a "tutor" that watches `app:terminal:command` and grades the
   user's session — counts how many commands they ran, how many
   directory changes, how many file ops. Print a summary at the end.
4. Create a global terminal alias `init` that runs a sequence of
   setup commands. Use `terminalAlias` and verify the alias appears in
   `terminalGetAliases`.
5. Combine with [Tutorial 05](05-files-and-storage.md) — log each
   `terminal:command` event to a session log file at
   `C:/Users/User/Documents/terminal-log.json`.

---

## What's next

[Tutorial 09 — Multimedia and Mood](09-multimedia-and-mood.md) leaves
plain text behind. We'll choreograph audio, video, subtitles, and
visual FX for a cinematic intro.
