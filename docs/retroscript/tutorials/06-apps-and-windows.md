# Tutorial 06 — Apps and Windows

> **Goal.** Drive the OS's GUI from a script — open Notepad with
> pre-filled text, focus the calculator, open the browser to a URL,
> arrange them on the desktop, then close them all cleanly.

> **Prerequisites.** [Tutorial 05](05-files-and-storage.md).

---

## Step 1 — Launching apps

The simplest form: just name the app.

```retro
launch notepad
```

Open Script Runner and run that one line. A Notepad window should
appear. Now close it (or leave it — we'll close it from a script in a
moment).

For apps that accept launch parameters, pass them with `with`:

```retro
launch browser with url="https://example.com"
launch terminal with initialCommand="dir C:/Users/User"
```

The `with` clause is a payload of `key=value` pairs delivered to the
app's `onOpen` lifecycle method. Each app documents its own launch
params. The full list of app IDs is in
[DICTIONARY → App IDs](../DICTIONARY.md#app-ids).

---

## Step 2 — The launch lifecycle

When you `launch notepad`, the EventBus fires three events in order:

1. `app:launch` `{appId, params?}` — the app is starting.
2. `app:open` `{appId, windowId}` — its window has been added to the
   DOM.
3. `app:ready` `{appId, windowId}` — `onMount` finished. The app is
   safe to interact with.

Subscribe before launching to grab the new window id:

```retro
set $captured_id = ""

on app:ready {
  if $event.appId == "notepad" {
    set $captured_id = $event.windowId
    print "Notepad ready at window id: " + $captured_id
  }
}

launch notepad
wait 500           # give the app time to fire ready
```

You'll need that window id later for focus / close / specific commands.

> **Why the `wait`?** `launch` itself is fire-and-forget. The
> interpreter doesn't pause for the app to finish opening. The handler
> registered above runs *when* `app:ready` fires — possibly after
> later statements have already run. The `wait 500` is a quick way to
> give the asynchronous boot a moment; for production scripts, see
> [Tutorial 07](07-events-and-reactivity.md) for proper coordination.

---

## Step 3 — Window controls

Once you have a window id, you can control it:

```retro
focus $captured_id
maximize $captured_id
minimize $captured_id
close $captured_id
```

Or via the command bus, which works the same:

```retro
emit command:window:focus windowId=$captured_id
emit command:window:maximize windowId=$captured_id
emit command:window:close windowId=$captured_id
```

Bare `close` (with no target) closes the currently focused window:

```retro
close
```

---

## Step 4 — Pushing content into an app

Each app registers its own commands. For Notepad, the key one is
`command:notepad:setText`. Combine with the lifecycle dance:

```retro
set $note_id = ""

on app:ready {
  if $event.appId == "notepad" && $note_id == "" {
    set $note_id = $event.windowId
    emit command:notepad:setText windowId=$note_id text="Hello from a script!\nLine 2."
  }
}

launch notepad
wait 800
```

The "guarded set" (`&& $note_id == ""`) means subsequent Notepad
openings won't re-trigger this code — only the first.

For Calculator:

```retro
launch calculator
wait 500
emit command:calculator:setExpression expression="42 * 3.14"
emit command:calculator:evaluate
```

For Browser:

```retro
launch browser
wait 800
emit command:browser:navigate url="https://example.com"
```

The per-app catalog of commands is in
[`/SCRIPTING_GUIDE.md` §21–27](../../../SCRIPTING_GUIDE.md) — pick the
app you care about and look up its commands there.

---

## Step 5 — Reading app state via queries

Every app inherits a `core.*` query surface:

```retro
set $win   = call query "notepad:core.window"
set $state = call query "notepad:core.state"
set $caps  = call query "notepad:core.capabilities"

print call prettyJSON $win
print call prettyJSON $state
print call prettyJSON $caps
```

Apps may also expose app-specific queries. For Notepad you can read
the current text:

```retro
set $text = call query "notepad:getText"
print "Notepad contains:"
print $text
```

For Calculator:

```retro
set $val = call query "calculator:getDisplay"
print "Calculator shows: " + $val
```

---

## Step 6 — Listing all open windows

You don't always know the window id ahead of time. The `query
"windows"` builtin returns every open window with its app id:

```retro
set $wins = call query "windows"
foreach $w in $wins {
  print $w.id + " — " + $w.appId + " — " + $w.title
}
```

Filter by app to find a specific one:

```retro
set $notepads = call filterBy $wins "appId" "notepad"
if (call count $notepads) > 0 {
  focus $notepads[0].id
} else {
  launch notepad
}
```

This is the canonical "open if not already open, focus otherwise"
pattern.

---

## Step 7 — Coordinated multi-app workflow

Let's open Notepad and Calculator side by side, fill each one, then
close them both:

```retro
# Track ids we open
set $opened_ids = []

on app:ready {
  if $event.appId == "notepad" || $event.appId == "calculator" {
    call push $opened_ids $event.windowId
  }
}

launch notepad
launch calculator
wait 1200

# Fill Notepad
set $nps = call filterBy (call query "windows") "appId" "notepad"
if (call count $nps) > 0 {
  emit command:notepad:setText windowId=$nps[0].id text="42 is the answer."
}

# Fill Calculator
set $calcs = call filterBy (call query "windows") "appId" "calculator"
if (call count $calcs) > 0 {
  emit command:calculator:setExpression windowId=$calcs[0].id expression="6 * 7"
  emit command:calculator:evaluate windowId=$calcs[0].id
}

wait 2000        # let the user see the result

# Close everything we opened
foreach $id in $opened_ids {
  close $id
}
```

This handles the case where the user already had a Notepad open
(`call filterBy` finds it instead of relying on `$opened_ids`).

---

## Step 8 — App-emitted events

Apps emit `app:<appId>:<event>` for state changes. Subscribe to react:

```retro
on app:notepad:saved {
  print "Notepad saved to " + $event.path
}

on app:calculator:calculated {
  print "Calc result: " + (call toString $event.result)
}

on app:browser:navigate {
  print "Browser → " + $event.url
}
```

You'll use these heavily in [Tutorial 07](07-events-and-reactivity.md)
when we build reactive scripts.

---

## Try it — checklist

Run the multi-app workflow:

- [ ] Notepad opens with the text "42 is the answer."
- [ ] Calculator opens and shows the result of `6 * 7` (`42`).
- [ ] After 2 seconds, both windows close.
- [ ] If you ran the script with a Notepad already open, no new Notepad
      window appeared — the existing one was reused.

---

## Exercises

1. Add the Browser to the workflow. Open all three apps, navigate the
   browser to `https://example.com`, and close all three at the end.
2. Use `query "windows"` to print a list of every open window before
   the script starts. Add a `confirm` that asks the user to close them
   first if there are any. (Hint: `emit command:window:close
   windowId=$w.id`.)
3. Make the workflow modular: write helper functions
   `def openOrFocus($appId, $params)` and `def fillNotepad($text)`.
4. Build a "tiling" function that arranges the open windows in a grid
   (use the underlying `command:window:resize` or `window:move`
   commands — see
   [`/SCRIPTING_GUIDE.md`](../../../SCRIPTING_GUIDE.md) for the per-app
   reference).
5. Listen for `app:calculator:calculated` and pipe the result into a
   `notify` toast every time the user hits `=`.

---

## What's next

[Tutorial 07 — Events and Reactivity](07-events-and-reactivity.md)
moves from script-driven to event-driven thinking. We'll build a
desktop guard that reacts to filesystem changes in real time.
