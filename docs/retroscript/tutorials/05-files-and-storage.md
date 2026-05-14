# Tutorial 05 — Files and Storage

> **Goal.** Persist quiz scores to a JSON file on disk. Read them back
> on the next run. Learn the difference between the virtual filesystem
> and `StorageManager`-backed key/value storage.

> **Prerequisites.** [Tutorial 04](04-user-interaction.md).

---

## Step 1 — Two persistence layers

| Layer | Best for | Lifetime | Sharing |
|---|---|---|---|
| Filesystem (`read`/`write`/`mkdir`/`delete`) | Documents, transcripts, JSON data, anything the user might inspect | Survives reload, user-switch | Visible in My Computer; can be opened in Notepad |
| `getStorage` / `setStorage` | Tiny opaque settings, last-seen flags, single-key state | Survives reload | Hidden from the user; per-browser-profile |

For a "scores history" feature, the filesystem is the right call:
the user can open it in Notepad and see what they've done.

---

## Step 2 — Writing a file

```retro
write "Hello from RetroScript" to "C:/Users/User/Documents/hello.txt"
```

Then verify:

```retro
read "C:/Users/User/Documents/hello.txt" into $contents
print $contents
```

`read` defaults to `$result` if you omit the `into` clause:

```retro
read "C:/Users/User/Documents/hello.txt"
print $result
```

Both work; the explicit `into` form is clearer once you have more than
one read in a script.

---

## Step 3 — Allowed paths

Scripts cannot write *anywhere*. The path validator
(`core/script/utils/PathValidation.js`) only accepts these prefixes:

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
C:/server/, C:/shared/, C:/public/
```

Plus the slash-prefixed variants (`/C/server/`, etc.). Anything else —
or any path containing `..` — throws `RuntimeError`.

Try writing to a disallowed path:

```retro
try {
  write "x" to "C:/Forbidden/file.txt"
} catch $err {
  print "Blocked: " + $err
}
```

You'll see something like `Blocked: Script path not allowed:
C:/Forbidden/file.txt`.

---

## Step 4 — Directories

Create directories with `mkdir`. Note it errors if the directory
exists, so the idiomatic recipe is:

```retro
def ensureDir($path) {
  try { mkdir $path } catch {}
}

call ensureDir "C:/Users/User/Documents/Quiz"
call ensureDir "C:/Users/User/Documents/Quiz/scores"
```

`delete` (alias `rm`) removes files or directories:

```retro
delete "C:/Users/User/Documents/Quiz/scratch.tmp"
```

---

## Step 5 — A JSON-backed score history

Let's build a small data layer.

```retro
set $SCORES_PATH = "C:/Users/User/Documents/Quiz/scores.json"

def ensureDir($path) {
  try { mkdir $path } catch {}
}

def loadScores() {
  try {
    read $SCORES_PATH into $raw
    set $parsed = call fromJSON $raw
    if call isArray $parsed { return $parsed }
  } catch {}
  return []
}

def saveScores($scores) {
  call ensureDir "C:/Users/User/Documents/Quiz"
  write (call prettyJSON $scores 2) to $SCORES_PATH
}

def addScore($name, $score, $total) {
  set $scores = call loadScores
  call push $scores {
    name: $name,
    score: $score,
    total: $total,
    pct: (100 * $score) / $total,
    when: call now,
  }
  call saveScores $scores
  return $scores
}
```

A few notes:

- `loadScores` is defensive: if the file doesn't exist, if it has
  garbage in it, or if it's not actually an array, fall back to `[]`.
  Defensive parsers age well.
- `saveScores` uses `prettyJSON` so the file is human-readable when
  opened in Notepad.
- `addScore` uses `push` (which mutates) and then writes the array
  back. Cheap and clear.
- `call now` is `Date.now()` — ms since epoch. Good for sorting and
  ordering.

---

## Step 6 — Reading scores back

```retro
set $all = call loadScores
print "Recorded scores: " + (call toString (call count $all))

foreach $s in (call sortByDesc $all "pct") {
  set $when = call formatDate $s.when "YYYY-MM-DD"
  print $when + " — " + $s.name + ": " + (call toString $s.score) + "/" + (call toString $s.total)
}
```

`sortByDesc … "pct"` sorts the array by descending percent — best at
top.

---

## Step 7 — Wiring it into Tutorial 04

Replace the alert at the end of the wizard with:

```retro
call addScore $name $score $total
notify "Saved score for $name."

set $hist = call loadScores
set $best = call last (call sortBy $hist "pct")    # last element of asc sort = highest
print "All-time best: " + $best.name + " — " + (call toString $best.pct) + "%"
```

Now every run appends a new line to
`C:/Users/User/Documents/Quiz/scores.json`. Open the file in Notepad to
see the history grow.

---

## Step 8 — `StorageManager` for tiny opaque state

When you don't need a user-readable file, `getStorage` / `setStorage`
is simpler:

```retro
set $lastName = call getStorage "quiz:lastName"
if call isEmpty $lastName {
  prompt "Your name?" into $name
  call setStorage "quiz:lastName" $name
} else {
  prompt "Welcome back, $lastName. Confirm name?" default $lastName into $name
  if $name != $lastName {
    call setStorage "quiz:lastName" $name
  }
}
```

`setStorage` writes through `StorageManager.set` which:

- Persists across reloads (browser localStorage under the hood).
- Refuses prototype-pollution payloads (`__proto__`, `constructor`,
  `prototype` at any depth).
- Drops UI writes while a remote-snapshot hydration is in progress
  (see [CLAUDE.md](../../../CLAUDE.md) Storage Hardening section).

Don't put *user content* (the scores file) here. Do put preferences,
last-seen markers, opaque IDs.

---

## Step 9 — Filesystem events

Every successful filesystem operation emits an event. Subscribe in
another script:

```retro
on fs:file:create  { print "created: " + $event.path }
on fs:file:update  { print "updated: " + $event.path }
on fs:file:delete  { print "deleted: " + $event.path }
```

Useful for "watch the scores file and notify when it changes":

```retro
on fs:file:update {
  if $event.path == "C:/Users/User/Documents/Quiz/scores.json" {
    notify "Quiz scores updated."
  }
}
```

(We'll lean on this pattern more in [Tutorial 07](07-events-and-reactivity.md).)

---

## Try it — checklist

Run the full integrated script (combine Tutorial 04's wizard with the
data layer from this tutorial), then:

- [ ] The first run creates `C:/Users/User/Documents/Quiz/scores.json`.
- [ ] Subsequent runs append a new entry without clobbering existing
      ones.
- [ ] Opening the file in Notepad shows formatted JSON.
- [ ] Deleting the file by hand (or via `delete`), then running again,
      starts a fresh history without errors.
- [ ] Writing to `C:/Forbidden/file.txt` is caught and printed as
      "Blocked: ...".

---

## Exercises

1. Add a `clearScores` function that deletes the file. Hook it up to a
   `confirm "Erase all scores?"` prompt before the wizard starts.
2. Add a `top5()` function that returns the top 5 scores by percent.
   Use `slice` to limit.
3. Add an `exportCsv()` function that converts the scores array to CSV
   and writes `scores.csv` next to `scores.json`.
4. Store the user's last name in `StorageManager` (not the filesystem)
   so the wizard greets them on the next launch but the file holds the
   detailed log.
5. Move the path constants into a `config.json` you load at startup
   via `read` + `fromJSON`. Default to today's values if the config is
   missing.

---

## What's next

[Tutorial 06 — Apps and Windows](06-apps-and-windows.md) leaves the
data layer behind and shows how to launch and control the OS's apps
from a script.
