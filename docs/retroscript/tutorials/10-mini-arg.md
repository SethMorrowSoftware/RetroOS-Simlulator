# Tutorial 10 — Mini ARG Campaign

> **Goal.** Build a complete, end-to-end ARG mini-campaign that exercises
> every major surface: narrative state, multi-app delivery, file drops,
> reactive handlers, multimedia cues, and persistence.
>
> The campaign: "Case File #207". The player wakes the OS to find a
> mysterious case file on the desktop. As they read documents, run
> terminal commands, and reply to emails, the story unfolds across
> three acts and ends with one of two endings.

> **Prerequisites.** Tutorials 01–09. Especially
> [05 (files)](05-files-and-storage.md),
> [07 (events)](07-events-and-reactivity.md), and
> [09 (multimedia)](09-multimedia-and-mood.md).

---

## Design first

We'll structure the campaign around the **narrative APIs**:

- A campaign id: `"case-207"`.
- Three scenes: `"intro"`, `"investigate"`, `"choice"`.
- Three objectives: `"open-the-file"`, `"verify-witness"`,
  `"decide"`.
- Flags for branching: `"player_called_witness"`,
  `"player_used_secret_keyword"`.
- Two endings: `"truth"` and `"cover-up"`.

Files we'll drop on the user:

```
C:/Users/User/Desktop/Case 207.txt        ← the visible case file
C:/Users/User/Documents/.archive/207/     ← hidden evidence folder
  witness.txt
  audio.txt                                ← a "transcript" placeholder
```

Events we'll react to:

- `app:notepad:fileOpened` — the player reads a file
- `app:terminal:command` — the player types something useful
- `inbox:reply:sent` — the player responds to an in-game email

This script lives in `autoexec.retro` (so its `on` handlers survive
boot) or, for development, in a long-`wait` Script Runner session.

---

## Step 1 — Bootstrap and idempotency

```retro
# === Case File #207 — autoexec campaign ===

set $CAMPAIGN_ID = "case-207"

def ensureDir($path) {
  try { mkdir $path } catch {}
}

# 1) Set up directories
call ensureDir "C:/Users/User/Documents/.archive"
call ensureDir "C:/Users/User/Documents/.archive/207"

# 2) Drop files (idempotent — overwrite each boot)
write "CASE FILE #207\nClassification: SENSITIVE\n\nSubject vanished 14 days ago.\nWitness statement attached.\n\nReply to: dispatch@ops.local" to "C:/Users/User/Desktop/Case 207.txt"

write "WITNESS STATEMENT\n\nI saw the subject at 03:47. They were carrying a black case.\nThey said one word before leaving: \"OBLIVION\".\n\n— W. Lemoine" to "C:/Users/User/Documents/.archive/207/witness.txt"

write "AUDIO TRANSCRIPT — call recording, 04:12\n\n(static)\n\"...if anyone hears this, the keyword is OBLIVION. Tell dispatch...\"\n\n(call ends)" to "C:/Users/User/Documents/.archive/207/audio.txt"
```

We `try { mkdir }` around an empty catch because re-running autoexec
would otherwise error on the existing directory. Cheap defensive
recipe.

---

## Step 2 — Start the campaign

```retro
# 3) Initialize narrative state
call story.start $CAMPAIGN_ID
call scene.enter "intro"

call objective.add "open-the-file" "Read the case file on the desktop." {
  priority: "main",
}

# 4) Initial multimedia: calm bed audio + a notification
call audio.play "office-ambience" {
  group: "ambience", volume: 0.3, loop: true, fadeInMs: 1200,
}
call mood.set "neutral"

notify "New case file on your desktop."
```

`story.start` and `scene.enter` emit canonical `story:*` events any
other script can subscribe to — useful for analytics, custom UIs, or
debug overlays.

---

## Step 3 — React to opening the case file

```retro
on app:notepad:fileOpened {
  if $event.path != "C:/Users/User/Desktop/Case 207.txt" { return }
  if call flag.has "seen_case_file" { return }    # idempotent

  call flag.set "seen_case_file" true
  call objective.complete "open-the-file"
  call objective.add "verify-witness" "Cross-check the witness statement in the archive." {
    priority: "main",
  }
  call scene.enter "investigate"

  wait 1500
  call mood.transition "neutral" "tense" 1500
  call inbox.send "dispatch@ops.local" "Re: Case 207" "Acknowledged. Please verify the witness statement in your archive before proceeding.\n\n— Dispatch"
}
```

A few things worth pointing out:

- The `if … return` guard at the top short-circuits handlers that
  aren't about *our* file. Handlers fire for every Notepad open
  globally — they have to filter themselves.
- `flag.has` lets us make the handler idempotent. The player can
  re-open the case file all they want; the chain only progresses
  once.
- `call inbox.send` delivers an email *from* dispatch. The player can
  read it in the in-OS Inbox app.

---

## Step 4 — React to the player reading the witness statement

```retro
on app:notepad:fileOpened {
  if $event.path != "C:/Users/User/Documents/.archive/207/witness.txt" { return }
  if call flag.has "read_witness" { return }

  call flag.set "read_witness" true
  call clue.add "keyword-oblivion" ["witness", "act-1"]

  # IM nudge from a tipster NPC
  call im.npcTyping "tipster" 2500
  wait 2500
  call im.npcSend "tipster" "Use the keyword. The terminal listens." {
    displayName: "anon@gateway",
  }
}
```

When the player reads the witness file, we register a clue
(`"keyword-oblivion"`) and trigger an in-game instant-messenger
nudge from an NPC named `tipster`. The `im.npcTyping` shows a "is
typing..." indicator first to feel natural.

---

## Step 5 — React to the terminal keyword

```retro
on app:terminal:command {
  if call contains (call lower $event.command) "oblivion" {
    if call flag.has "used_keyword" { return }

    call flag.set "used_keyword" true
    call clue.reveal "keyword-oblivion"
    call objective.complete "verify-witness"
    call objective.add "decide" "Reply to dispatch with your verdict." {
      priority: "main",
    }
    call scene.enter "choice"

    # Cinematic reveal
    call audio.duck "ambience" 0.1 4000
    call audio.play "stinger-reveal" { group: "stinger", volume: 0.9 }
    call subtitle.show "narrator" "The keyword unlocks a hidden line of inquiry." { durationMs: 4000 }
    call fx.apply "glitch" { intensity: 0.4, durationMs: 4000 }

    wait 4000
    call subtitle.clear
    call fx.clear "glitch"
    call audio.restore "ambience"

    call inbox.send "dispatch@ops.local" "Verdict requested" "We need your call. Reply with one of:\n\n  truth       — full disclosure\n  cover-up    — suppress the file\n\nThis is binding."
  }
}
```

Now the player has to type `truth` or `cover-up` as a terminal
command — that's the climax of Act 2.

---

## Step 6 — Branch on the player's reply

The Inbox emits `app:inbox:reply:sent` when the player sends an
email reply. We listen for it:

```retro
on app:inbox:reply:sent {
  if call lower $event.body == "truth" {
    call flag.set "player_choice" "truth"
    call story.end $CAMPAIGN_ID "truth"
    call ending_truth
  } else if call lower $event.body == "cover-up" {
    call flag.set "player_choice" "cover-up"
    call story.end $CAMPAIGN_ID "cover-up"
    call ending_coverup
  } else {
    # Player wrote something else
    call inbox.send "dispatch@ops.local" "Re: Verdict requested" "We need a single word: 'truth' or 'cover-up'. Try again."
  }
}
```

---

## Step 7 — The endings

```retro
def ending_truth() {
  call mood.set "resolved"
  notify "Case 207 — verdict accepted: TRUTH."
  call subtitle.show "narrator" "You chose the harder road. Dispatch promotes you to senior investigator." { durationMs: 6000 }
  call audio.play "ending-bright" { group: "vox", volume: 0.9 }
  wait 6500
  call subtitle.clear

  call inbox.send "dispatch@ops.local" "Promotion" "Effective immediately, you are promoted to Senior Investigator. Well done."
}

def ending_coverup() {
  call mood.set "ominous"
  notify "Case 207 — verdict accepted: COVER-UP."
  call subtitle.show "narrator" "The truth is gone. Someone, somewhere, owes you a favor." { durationMs: 6000 }
  call audio.play "ending-dark" { group: "vox", volume: 0.9 }
  wait 6500
  call subtitle.clear

  call inbox.send "dispatch@ops.local" "Discretion" "Your service is appreciated. Forget this case ever existed."

  # A faint hint that the consequences linger
  call fx.apply "vignette" { intensity: 0.6 }
}
```

---

## Step 8 — Telemetry

For real campaigns, you want analytics on every decision so you can
tune pacing later:

```retro
on story:scene:enter   { call telemetry.checkpoint $event.sceneId { time: call now } }
on story:objective:complete { call telemetry.checkpoint ("objective:" + $event.id) { time: call now } }
on story:end {
  call telemetry.checkpoint "campaign:end" {
    campaignId: $event.campaignId,
    endingId: $event.endingId,
  }
}
```

After the player finishes you can read the funnel:

```retro
set $funnel = call analytics.sceneFunnel
print call prettyJSON $funnel
```

In production you'd export this snapshot to the
`AnalyticsDashboard` app for a designer to look at.

---

## Step 9 — Persistence between sessions

The narrative state manager already persists campaign state via
`StorageManager`. If you want to also remember the chosen ending in a
human-readable place:

```retro
on story:end {
  set $log = call default (call getStorage "case-207:history") []
  call push $log {
    when: call now,
    endingId: $event.endingId,
    flags: call flag.all,
  }
  call setStorage "case-207:history" $log
}
```

Now successive playthroughs build up a player profile you can read
back at boot:

```retro
set $h = call default (call getStorage "case-207:history") []
if (call count $h) > 0 {
  set $last = call last $h
  notify "Welcome back. Last verdict: " + $last.endingId
}
```

---

## Step 10 — The full campaign script

The complete `autoexec.retro` (or stand-alone campaign script):

```retro
# === Case File #207 ===

set $CAMPAIGN_ID = "case-207"

def ensureDir($p) { try { mkdir $p } catch {} }

call ensureDir "C:/Users/User/Documents/.archive"
call ensureDir "C:/Users/User/Documents/.archive/207"

write "CASE FILE #207\nClassification: SENSITIVE\n\nSubject vanished 14 days ago.\nWitness statement attached.\n\nReply to: dispatch@ops.local" to "C:/Users/User/Desktop/Case 207.txt"
write "WITNESS STATEMENT\n\nI saw the subject at 03:47. They were carrying a black case.\nThey said one word before leaving: \"OBLIVION\".\n\n— W. Lemoine" to "C:/Users/User/Documents/.archive/207/witness.txt"
write "AUDIO TRANSCRIPT — call recording, 04:12\n\n(static)\n\"...if anyone hears this, the keyword is OBLIVION. Tell dispatch...\"\n\n(call ends)" to "C:/Users/User/Documents/.archive/207/audio.txt"

call story.start $CAMPAIGN_ID
call scene.enter "intro"
call objective.add "open-the-file" "Read the case file on the desktop." { priority: "main" }

call audio.play "office-ambience" { group: "ambience", volume: 0.3, loop: true, fadeInMs: 1200 }
call mood.set "neutral"
notify "New case file on your desktop."

# === Handlers ===

on app:notepad:fileOpened {
  if $event.path == "C:/Users/User/Desktop/Case 207.txt" {
    if !(call flag.has "seen_case_file") {
      call flag.set "seen_case_file" true
      call objective.complete "open-the-file"
      call objective.add "verify-witness" "Cross-check the witness statement in the archive." { priority: "main" }
      call scene.enter "investigate"
      wait 1500
      call mood.transition "neutral" "tense" 1500
      call inbox.send "dispatch@ops.local" "Re: Case 207" "Acknowledged. Please verify the witness statement in your archive before proceeding.\n\n— Dispatch"
    }
  }

  if $event.path == "C:/Users/User/Documents/.archive/207/witness.txt" {
    if !(call flag.has "read_witness") {
      call flag.set "read_witness" true
      call clue.add "keyword-oblivion" ["witness", "act-1"]
      call im.npcTyping "tipster" 2500
      wait 2500
      call im.npcSend "tipster" "Use the keyword. The terminal listens." { displayName: "anon@gateway" }
    }
  }
}

on app:terminal:command {
  if call contains (call lower $event.command) "oblivion" {
    if !(call flag.has "used_keyword") {
      call flag.set "used_keyword" true
      call clue.reveal "keyword-oblivion"
      call objective.complete "verify-witness"
      call objective.add "decide" "Reply to dispatch with your verdict." { priority: "main" }
      call scene.enter "choice"

      call audio.duck "ambience" 0.1 4000
      call audio.play "stinger-reveal" { group: "stinger", volume: 0.9 }
      call subtitle.show "narrator" "The keyword unlocks a hidden line of inquiry." { durationMs: 4000 }
      call fx.apply "glitch" { intensity: 0.4, durationMs: 4000 }
      wait 4000
      call subtitle.clear
      call fx.clear "glitch"
      call audio.restore "ambience"

      call inbox.send "dispatch@ops.local" "Verdict requested" "Reply with: truth — or — cover-up. This is binding."
    }
  }
}

on app:inbox:reply:sent {
  set $body = call lower (call trim $event.body)
  if $body == "truth" {
    call flag.set "player_choice" "truth"
    call story.end $CAMPAIGN_ID "truth"
    call ending_truth
  } else if $body == "cover-up" {
    call flag.set "player_choice" "cover-up"
    call story.end $CAMPAIGN_ID "cover-up"
    call ending_coverup
  } else {
    call inbox.send "dispatch@ops.local" "Re: Verdict requested" "We need a single word: 'truth' or 'cover-up'. Try again."
  }
}

def ending_truth() {
  call mood.set "resolved"
  notify "Case 207 — verdict accepted: TRUTH."
  call subtitle.show "narrator" "You chose the harder road. Dispatch promotes you to senior investigator." { durationMs: 6000 }
  call audio.play "ending-bright" { group: "vox", volume: 0.9 }
  wait 6500
  call subtitle.clear
  call inbox.send "dispatch@ops.local" "Promotion" "Effective immediately, you are promoted to Senior Investigator."
}

def ending_coverup() {
  call mood.set "ominous"
  notify "Case 207 — verdict accepted: COVER-UP."
  call subtitle.show "narrator" "The truth is gone." { durationMs: 6000 }
  call audio.play "ending-dark" { group: "vox", volume: 0.9 }
  wait 6500
  call subtitle.clear
  call inbox.send "dispatch@ops.local" "Discretion" "Your service is appreciated."
  call fx.apply "vignette" { intensity: 0.6 }
}

# Telemetry
on story:scene:enter   { call telemetry.checkpoint $event.sceneId }
on story:objective:complete { call telemetry.checkpoint ("objective:" + $event.id) }
on story:end {
  call telemetry.checkpoint "campaign:end" { endingId: $event.endingId }

  # Append to player history
  set $log = call default (call getStorage "case-207:history") []
  call push $log { when: call now, endingId: $event.endingId, flags: call flag.all }
  call setStorage "case-207:history" $log
}

print "Case File 207 loaded."
```

---

## Running it

For development, put this in `C:/Scripts/case-207.retro` (or somewhere
under the allowed paths) and run it from Script Runner. To make it run
at boot, drop the same content into `autoexec.retro` at the repo root
or `C:/Windows/autoexec.retro` in the virtual filesystem.

Then play it through:

1. The script writes the files and starts ambience. The desktop now
   has `Case 207.txt`.
2. Double-click `Case 207.txt`. Notepad opens; the mood shifts; an
   email arrives from dispatch.
3. Open the inbox, read the email, then explore the file system.
   Eventually you find `witness.txt`. Open it.
4. The tipster pings you in the IM with "Use the keyword. The
   terminal listens."
5. Open the terminal and type *anything* containing `OBLIVION`
   (`echo oblivion` works).
6. The cinematic reveal plays. A new email arrives demanding a
   verdict.
7. Reply with `truth` or `cover-up`. One of two endings plays.

---

## Try it — checklist

- [ ] Booting fresh drops all three files in the right places.
- [ ] Reading the case file fires the dispatch email exactly once.
- [ ] Reading the witness statement triggers a tipster IM exactly once.
- [ ] Typing a command with `oblivion` triggers the cinematic reveal
      exactly once.
- [ ] Sending `truth` or `cover-up` ends the campaign with the
      matching ending and no further events fire.
- [ ] Booting again later greets the player with "last verdict:
      truth/cover-up" notification (via the persisted history).

---

## Where to go from here

You have, in 100 lines of RetroScript, a complete branching
ARG campaign with:

- file drops
- email and IM delivery
- terminal-based puzzle
- narrative state with flags, scenes, objectives, clues
- cinematic multimedia cues
- branching endings
- telemetry checkpoints
- session persistence

The real autoexec in this repo (`autoexec.retro`) is ten times the
length — it's a six-phase, sixty-clue, multi-act campaign called
**Project EREBUS** that uses every single surface in IlluminatOS.
Read it for production-grade pacing, narrative branching, and
event-driven sequencing.

For deeper dives:

- [GUIDE.md §17–18](../GUIDE.md#17-narrative-apis) — narrative and
  messaging in detail.
- [GUIDE.md §19](../GUIDE.md#19-telemetry-analytics-replay) —
  campaign analytics.
- [`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../../RETROSCRIPT_SCRIPTABLE_EVENTS.md)
  — the encyclopedic event/command catalog. When you need an event
  you haven't seen, it's probably in there.
- The `campaigns/demo-vertical-slice` directory in the repo —
  example campaign content packages.

That's a wrap on the tutorial series. Build something weird.
