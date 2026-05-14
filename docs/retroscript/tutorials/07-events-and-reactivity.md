# Tutorial 07 — Events and Reactivity

> **Goal.** Build a "desktop guard" — a long-lived reactive script that
> watches the filesystem, the focused app, and key input, then reacts:
> notify on new desktop files, log focus changes, and run a custom
> command on a keyboard combo.

> **Prerequisites.** [Tutorial 06](06-apps-and-windows.md).

---

## Step 1 — The shape of an `on` handler

```retro
on event:name {
  # $event is the payload, automatically bound
  print "got " + $event.someField
}
```

`on` registers a *persistent* handler. As soon as the matching event is
emitted anywhere in the system (other scripts, apps, features, the
OS itself), the handler body runs in an isolated interpreter state.

> **Isolated state.** Variables changed inside the handler don't
> propagate back to the outer script. `break` / `continue` / `return`
> inside a handler don't affect the outer script either. If you need
> to communicate from a handler to the rest of the world, use
> `setStorage`, a file, or `emit` a custom event.

---

## Step 2 — Subscribing to one event

Let's start small. Run this:

```retro
on fs:file:create {
  notify "New file: " + $event.path
}
```

Now in Script Runner, after the script finishes, open Notepad and save
a new file to `C:/Users/User/Documents/test.txt`. Did the toast fire?

**Probably not.** And here's why.

---

## Step 3 — The persistence problem

By default, `ScriptEngine.run` tears down all `on` handlers when the
top-level script finishes. So your handler exists only for the half a
second between the script start and end — there's no chance to catch a
later filesystem event.

There are two ways to keep handlers alive:

1. **Autoexec** — `autoexec.retro` is invoked through
   `runPersistent`, so its `on` handlers survive boot. We'll get to
   this.
2. **Block the script** — keep the top level alive with a long `wait`
   or a `while true { wait 1000 }` loop. Crude but useful in Script
   Runner for testing.

For interactive learning, choice 2 is fine. Script Runner has a
**Stop** button to cancel a hung script.

Rewrite:

```retro
on fs:file:create {
  notify "New file: " + $event.path
}

print "Desktop guard active. Save a file in My Computer to test."
wait 30000     # keep the script alive for 30 seconds
print "Desktop guard shutting down."
```

Now run the script. While it's running, save a file via Notepad or
create one via the script:

```retro
write "test" to "C:/Users/User/Desktop/guard-test.txt"
```

The toast should fire.

> **Why 30 000 and not more?** That's the engine's hard execution
> timeout. For longer scripts you need `runPersistent` (see
> [Tutorial 10](10-mini-arg.md)).

---

## Step 4 — Filtering events

You don't want to react to *every* `fs:file:create` — just the ones
under specific directories. Filter inside the handler:

```retro
on fs:file:create {
  if call startsWith $event.path "C:/Users/User/Desktop/" {
    notify "Desktop file added: " + $event.path
  }
}
```

Or by file extension:

```retro
on fs:file:create {
  if call endsWith $event.path ".retro" {
    notify "New script: " + $event.path
  }
}
```

---

## Step 5 — Wildcard subscriptions

Subscribe to a whole namespace with `*`:

```retro
on window:* {
  print "[window] " + call inspect $event
}
```

Useful for exploration. Run this and click around the desktop —
you'll see every `window:open`, `window:close`, `window:focus`,
`window:minimize`, `window:maximize`, `window:resize`, `window:move`,
etc. with their payloads.

Same trick for apps and the filesystem:

```retro
on app:*       { print "[app] "       + call inspect $event }
on fs:*        { print "[fs] "        + call inspect $event }
on keyboard:*  { print "[keyboard] "  + call inspect $event }
```

Don't subscribe to all four at once unless you have a strong tolerance
for output noise.

---

## Step 6 — Tracking focused window

```retro
on app:focus {
  print "Focused: " + $event.appId + " (window " + $event.windowId + ")"
}
on app:blur {
  print "Blurred: " + $event.appId
}
```

Use this to know which app the user is in. Now suppose you want to
play a "ding" sound every time the user switches between Notepad and
Calculator:

```retro
set $last_app = ""

on app:focus {
  if ($event.appId == "notepad" || $event.appId == "calculator") && $event.appId != $last_app {
    play notify
    set $last_app = $event.appId
  }
}
```

Wait — `$last_app` is updated *inside the handler*. Doesn't handler
isolation prevent that?

It does. The assignment is "successful" inside the handler's scope,
but it's discarded when the handler returns. Each time the handler
fires, it starts fresh with `$last_app == ""` from the outer script.

To work around it, use `setStorage`:

```retro
on app:focus {
  set $last = call default (call getStorage "guard:lastApp") ""
  if ($event.appId == "notepad" || $event.appId == "calculator") && $event.appId != $last {
    play notify
    call setStorage "guard:lastApp" $event.appId
  }
}
```

Or `flag.set` if you have a narrative state manager attached.

> **Mental model.** An `on` handler is a closure over the *initial*
> outer state, run in an *isolated copy* of the interpreter. Anything
> you want to share across invocations must go through a side-channel
> store.

---

## Step 7 — Reacting to keyboard combos

The OS emits `keyboard:combo` for known multi-key shortcuts. You can
also bind to plain `keyboard:keydown`:

```retro
on keyboard:combo {
  if $event.combo == "Ctrl+Shift+G" {
    notify "Guard hotkey hit!"
  }
}
```

Test by pressing Ctrl+Shift+G with the desktop focused.

For raw key events:

```retro
on keyboard:keydown {
  if $event.code == "Escape" {
    notify "Escape pressed"
  }
}
```

---

## Step 8 — Custom events for cross-handler signaling

When one handler needs to talk to another, the cleanest way is a
custom event. Pick a namespace nobody else uses (`my-app:*`) and
emit/subscribe on it:

```retro
on fs:file:create {
  if call endsWith $event.path ".scoreboard.json" {
    emit my-app:scoreboard:changed path=$event.path
  }
}

on my-app:scoreboard:changed {
  notify "Scoreboard updated."
  # The actual reload logic goes here
}
```

Why bother? Because handler isolation means the first handler can't
reach into the second handler's state. Custom events are how
event-driven systems compose without sharing globals.

---

## Step 9 — Unsubscribing

You can't unsubscribe a specific handler from RetroScript — handlers
registered by an `on` statement live for the lifetime of the script.
For a one-shot handler, use a flag:

```retro
set $first_done = false

on app:ready {
  if !$first_done && $event.appId == "notepad" {
    set $first_done = true
    print "First notepad ready — doing one-time setup."
  }
}
```

But remember `$first_done` doesn't carry between invocations inside a
plain `run()`. For one-shot semantics across multiple events, persist
through storage:

```retro
on app:ready {
  if $event.appId == "notepad" && (call getStorage "guard:notepadOnce") != true {
    call setStorage "guard:notepadOnce" true
    print "First Notepad in this session."
  }
}
```

---

## Step 10 — The guard script, assembled

```retro
# === Desktop Guard ===
# A long-lived reactive script that watches the desktop, focused app,
# and key combos.

print "Desktop guard armed."

# 1) Notify on new desktop files.
on fs:file:create {
  if call startsWith $event.path "C:/Users/User/Desktop/" {
    play notify
    notify "New desktop file: " + $event.path
  }
}

# 2) Log every app focus change.
on app:focus {
  print "[focus] " + $event.appId + " (" + $event.windowId + ")"
}

# 3) Run a custom command on Ctrl+Shift+G.
on keyboard:combo {
  if $event.combo == "Ctrl+Shift+G" {
    set $count = call default (call getStorage "guard:hits") 0
    set $count = $count + 1
    call setStorage "guard:hits" $count
    notify "Guard hit #" + (call toString $count)
  }
}

# Keep the top-level alive for 60 seconds while handlers do their work.
print "Listening for 60 seconds..."
wait 60000
print "Desktop guard standing down."
```

Run it, then:

1. Save a new file to the desktop.
2. Click around between several apps.
3. Press Ctrl+Shift+G a few times.

You should see toasts, focus log lines, and the "Guard hit #" counter
incrementing across keypresses.

---

## Try it — checklist

- [ ] New desktop files trigger a toast.
- [ ] Each app you click into prints a `[focus]` log line.
- [ ] Ctrl+Shift+G shows an incrementing counter; restarting the
      script *doesn't* reset the counter (it lives in storage).
- [ ] After 60 seconds the script ends cleanly.

---

## Exercises

1. Add a handler for `fs:file:delete` that warns when a file is
   removed from `C:/Users/User/Secret/` — even if you accept the
   command, the toast records that it happened.
2. Track total time-in-app: on `app:focus`, record the time; on
   `app:blur`, compute elapsed and accumulate it per-app in storage.
   Print a final summary on script exit.
3. Make the keyboard combo configurable — read the combo string from a
   `config.json` file at startup. Default to `Ctrl+Shift+G`.
4. Promote the script to autoexec status: move the body into your
   `autoexec.retro` so it survives boot. (Heads up: the autoexec
   timeout is only 10 seconds for the *top level*. Don't put `wait
   60000` there — register handlers and exit.)
5. Use `flag.set` and `flag.has` to record which special files have
   been seen. Print a one-time greeting when the user creates their
   first `.retro` script in `C:/Users/User/Projects/`.

---

## What's next

[Tutorial 08 — Terminal Automation](08-terminal-automation.md) leaves
GUI-land and drives the in-OS terminal from a RetroScript.
