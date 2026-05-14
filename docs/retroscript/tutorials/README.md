# RetroScript Tutorials

Ten progressive walkthroughs, each self-contained and runnable. Start with
01 and work up; later tutorials reference patterns from earlier ones.

| # | Tutorial | What you'll build |
|---|---|---|
| 01 | [First Steps](01-first-steps.md) | Run your first `.retro` file; print, comment, escape strings |
| 02 | [Variables and Data](02-variables-and-data.md) | Build a small JSON-backed contact list |
| 03 | [Control Flow and Functions](03-control-flow.md) | A scored quiz with reusable helper functions |
| 04 | [User Interaction](04-user-interaction.md) | Dialog-driven onboarding wizard |
| 05 | [Files and Storage](05-files-and-storage.md) | A persistent score tracker on disk |
| 06 | [Apps and Windows](06-apps-and-windows.md) | Launch and control Notepad / Calculator / Browser |
| 07 | [Events and Reactivity](07-events-and-reactivity.md) | A reactive desktop guard that watches the filesystem |
| 08 | [Terminal Automation](08-terminal-automation.md) | Scripted terminal sessions with output capture |
| 09 | [Multimedia and Mood](09-multimedia-and-mood.md) | A cinematic intro: audio + video + subtitle + FX |
| 10 | [Mini ARG Campaign](10-mini-arg.md) | End-to-end narrative — story, scenes, clues, multi-app delivery |

## How to use these

Each tutorial has the same shape:

1. **Goal** — a single concrete deliverable.
2. **Prerequisites** — anything you must have set up first.
3. **The script, built up** — the script grows one chunk at a time, with
   the *why* of each addition explained.
4. **Try it** — a checklist for verifying the script worked.
5. **Exercises** — open-ended extensions.

You run a tutorial script the same way you run any RetroScript:

- Save it as `tutorial.retro` somewhere convenient (e.g.
  `C:/Users/User/Documents/tutorial.retro` from inside the OS).
- Open Script Runner and load the file, or run `retro tutorial.retro`
  from the terminal.

## Where to look up things

- Language details: [GUIDE.md](../GUIDE.md).
- Quick "what does X do?" lookup: [DICTIONARY.md](../DICTIONARY.md).
- Per-app event/command catalog:
  [`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../../RETROSCRIPT_SCRIPTABLE_EVENTS.md).
