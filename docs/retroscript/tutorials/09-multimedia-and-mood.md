# Tutorial 09 — Multimedia and Mood

> **Goal.** Choreograph a cinematic intro — layered audio with ducking,
> a subtitle track, a screen-shake at the climax, an image overlay, and
> a transition to a tense mood.

> **Prerequisites.** [Tutorial 07](07-events-and-reactivity.md). Headphones
> recommended.

---

## Step 1 — Two media APIs

RetroScript offers two ways to play sound:

| API | Use when |
|---|---|
| **Statement form** (`play`, `stop`, `video`) | Quick one-shots. No grouping, no concurrency budget, no cue id. |
| **Cue system** (`audio.*`, `video.*`, `image.*`, `subtitle.*`, `fx.*`, `media.*`) | Real choreography. Returns cue IDs. Supports grouping, ducking, fade-ins, layered images, FX. |

Tutorial scripts use the cue system because that's what real campaigns
use. The statement form remains as one-line shortcuts.

---

## Step 2 — One-shot sounds

System-recognized sound types play instantly with no setup:

```retro
play click
play notify
play error
```

These route through the `sound:play` event. They're the "UI feedback"
tier — short, free of grouping.

For an audio file:

```retro
play "C:/Users/User/Music/intro.mp3" volume=0.6
```

The interpreter looks at the source string: slashes, backslashes, an
audio extension (`.mp3`/`.wav`/`.ogg`/`.flac`/`.m4a`/`.aac`), or a
prefix of `assets/` / `C:` / `c:` means "file path"; anything else
is treated as a named sound type.

To stop:

```retro
stop                                # stop everything
stop "C:/Users/User/Music/intro.mp3"   # stop one specific source
```

---

## Step 3 — The cue system

The cue system gives you handles, grouping, and budget controls.

```retro
set $cue = call audio.play "ambience-forest" {
  group: "ambience",
  volume: 0.4,
  loop: true,
  fadeInMs: 800,
}
```

- The first argument is an **asset id** (registered in the
  `MediaAssetManager`) or a path/URL. Asset ids are preferred — they
  give the budget system real metadata.
- The second argument is an options object: `cueId` (your own id),
  `group` (channel name for ducking), `volume`, `loop`, `fadeInMs`,
  `priority`.
- The return is the cue id (a string). Keep it; you'll target the
  cue later to stop, pause, or seek.

To stop one cue:

```retro
call audio.stop $cue
```

To stop *everything*:

```retro
call audio.stop
```

(`call media.stopAll` is the bigger hammer — stops audio, video,
images, subtitles, FX, all of it.)

---

## Step 4 — Ducking

Ducking is "temporarily lower this group's volume while something
else plays". Classic radio mix.

```retro
# Start ambient bed
set $bed = call audio.play "ambience-forest" {
  group: "ambience", volume: 0.5, loop: true,
}

# Some narration kicks in — duck the ambience while it plays
call audio.duck "ambience" 0.15 5000
call audio.play "narration-intro" { group: "vox", volume: 0.9 }

# Wait the duration of the narration, then restore
wait 5000
call audio.restore "ambience"
```

`audio.duck(group, level, durationMs)` smoothly fades the group's
volume to `level` for `durationMs` ms. `audio.restore(group)` cancels
any active duck on that group.

---

## Step 5 — Subtitles

```retro
call subtitle.show "narrator" "Project EREBUS, day 47..." {
  durationMs: 4000,
  position: "bottom",
  style: "monospace",
}
```

`subtitle.show(trackId, text, opts)` displays text on a named track.
Multiple tracks can be active at once.

`durationMs` causes auto-clear. To clear manually:

```retro
call subtitle.clear "narrator"
call subtitle.clear            # clears all tracks
```

---

## Step 6 — Layered images

`image.show(layerId, source, opts)` displays an image on a named layer
above the desktop. Layers stack; opts include `opacity`, `fadeInMs`,
`fadeOutMs`, `blend`.

```retro
call image.show "vignette" "/assets/vignette.png" {
  opacity: 0.6,
  fadeInMs: 1000,
  blend: "multiply",
}

# Later
call image.clear "vignette"
call image.clear              # clears all layers
```

You can stack a noise overlay on a vignette, an ambient frame on
both, etc. Each gets its own `clear`.

---

## Step 7 — Visual FX presets

```retro
call fx.apply "screen-shake" { intensity: 0.6, durationMs: 500 }
call fx.apply "glitch" { intensity: 0.3, durationMs: 2000 }
call fx.apply "flash" { color: "white", durationMs: 100 }
call fx.apply "vignette" { intensity: 0.4 }
call fx.apply "scanlines" {}
call fx.apply "static" { intensity: 0.5 }
call fx.apply "chromatic" { strength: 4 }
```

Each preset has its own option shape. The preset list:
`screen-shake`, `glitch`, `flash`, `vignette`, `scanlines`, `static`,
`chromatic`.

Cleanup:

```retro
call fx.clear "glitch"
call fx.clear            # clear all
```

---

## Step 8 — Mood orchestrator

`mood.*` is a level above raw cues. Setting a mood preset
(`tense`, `calm`, `mystery`, etc. — see the project's
`features/MoodOrchestrator.js`) coordinates color filters, ambient
audio, and FX:

```retro
call mood.set "calm"

# Later, transition smoothly
call mood.transition "calm" "tense" 2000

set $current = call mood.current
print "now: " + $current
```

`mood.transition(from, to, durationMs)` emits a
`story:mood:transition` event and, after the duration, fires
`story:mood:set`.

---

## Step 9 — The intro, choreographed

Let's put it all together. The narrative beat is roughly:

1. Calm forest ambience.
2. A narrator speaks while the ambience ducks.
3. Subtitle on screen.
4. A vignette overlay fades in.
5. Glitch FX hint at something off.
6. Mood transitions from calm to tense.
7. Crash sound + screen-shake at the climax.
8. Everything clears.

```retro
# === Cinematic intro ===

# 1) Ambience
set $bed = call audio.play "ambience-forest" {
  group: "ambience", volume: 0.5, loop: true, fadeInMs: 800,
}

# 2) Vignette
call image.show "vignette" "/assets/vignette.png" {
  opacity: 0.0, fadeInMs: 2000,
}

# Allow the visual to settle
wait 2000

# 3) Subtitle while narration plays
call subtitle.show "narrator" "Project EREBUS — day 47..." {
  durationMs: 5000, position: "bottom",
}

call audio.duck "ambience" 0.15 5000
call audio.play "narration-intro" { group: "vox", volume: 0.9 }

wait 5000
call audio.restore "ambience"

# 4) Mood transition
call mood.transition "calm" "tense" 2000
wait 2000

# 5) Glitch hint
call fx.apply "glitch" { intensity: 0.3, durationMs: 2500 }
wait 2500

# 6) Climax — crash + shake + flash
call audio.play "thunder-crack" { group: "stinger", volume: 1.0 }
call fx.apply "screen-shake" { intensity: 0.8, durationMs: 700 }
call fx.apply "flash" { color: "white", durationMs: 120 }

wait 1500

# 7) Resolution — fade everything out
call audio.stop $bed
call fx.clear
call subtitle.clear
call image.clear

print "Intro complete."
```

That's 25 lines and you've got a multi-channel cinematic intro. Real
campaigns build dozens of these and chain them through the narrative
APIs from [Tutorial 10](10-mini-arg.md).

---

## Step 10 — The budget system

The `MediaAssetManager` caps concurrent cues per type to prevent
audio chaos. If you exceed the budget:

```retro
on media:budget:exceeded {
  print "Dropped cue: " + $event.rejected + " — " + $event.metric + " " + (call toString $event.current) + "/" + (call toString $event.limit)
}
```

Check the current budget:

```retro
set $b = call media.budget
print call prettyJSON $b
```

If you're hitting the limit, group cues sensibly (multiple
ambience tracks → one `ambience` group) and stop them when you're
done.

---

## Try it — checklist

- [ ] The forest ambience starts and stays present.
- [ ] The narration ducks the ambience for 5 seconds.
- [ ] A vignette fades onto the screen.
- [ ] The glitch effect plays for 2.5 seconds.
- [ ] Thunder, shake, and flash all hit roughly simultaneously at
      the climax.
- [ ] Everything cleans up at the end — no lingering ambience,
      vignette, or FX.

(If asset ids like `ambience-forest` aren't registered in your build,
substitute with file paths or available named sounds. See
`features/SoundSystem.js` and `core/MediaAssetManager.js`.)

---

## Exercises

1. Make the climax react to user input — only fire the crash when the
   user presses Spacebar (subscribe to `keyboard:keydown`). Until they
   do, keep the suspenseful FX going.
2. Build a "calm down" sequence that's the mirror of the intro: start
   tense, transition to calm, fade everything out.
3. Add a per-cue volume ramp — every 500 ms during the intro, bump the
   ambience volume up by 0.05 until it reaches a target. (Hint: emit
   another `audio.play` with the same `cueId` and a new `volume`,
   or use the engine's audio bus events directly.)
4. Layer two image overlays — a static noise pattern on top of the
   vignette. Stagger their fade-in by a second so the noise feels like
   it's "arriving".
5. Wrap the intro in `story.start` / `scene.enter` so the narrative
   system records it as a real scene transition. (Preview of
   [Tutorial 10](10-mini-arg.md).)

---

## What's next

[Tutorial 10 — Mini ARG](10-mini-arg.md) is the capstone — a full
multi-act narrative campaign that uses everything you've learned:
files, dialogs, events, apps, terminal, multimedia, narrative APIs,
and messaging. End-to-end.
