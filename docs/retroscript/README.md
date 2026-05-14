# RetroScript Documentation

Welcome to the **RetroScript** documentation hub.

RetroScript is the scripting language built into IlluminatOS. It is used for
desktop automation, interactive content, autoexec boot routines, ARG/narrative
campaigns, terminal scripting, multimedia cue choreography, and reactive
event-driven scripts that bridge any of the 42 apps, 13 features, and the
plugin system.

This directory holds **fresh, learning-oriented documentation** that
complements (rather than replaces) the dense top-level reference in
[`/SCRIPTING_GUIDE.md`](../../SCRIPTING_GUIDE.md). If you only have time for
one document, pick the one whose shape matches your task:

| You want to… | Read this |
|---|---|
| Learn the language from scratch | [GUIDE.md](GUIDE.md) |
| Look up "what does *X* do?" fast | [DICTIONARY.md](DICTIONARY.md) |
| Follow a hands-on walkthrough | [tutorials/](tutorials/) |
| Find every event/command an app exposes | [`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../RETROSCRIPT_SCRIPTABLE_EVENTS.md) |
| Drive the terminal from a script | [`docs/TERMINAL_SCRIPTING.md`](../TERMINAL_SCRIPTING.md) |
| See a fully scripted ARG demo | [`/autoexec.retro`](../../autoexec.retro) |

---

## What's in this directory

### [GUIDE.md](GUIDE.md) — The Comprehensive Guide

A learning-oriented tour of the language and the runtime. Organized by
**concepts** (variables, control flow, events, the script engine, safety
limits, extensibility) rather than by alphabetical order. Use it the first
time you sit down to write RetroScript, then keep it open as a reference
while you build.

The guide is self-contained: every concept is introduced with a runnable
snippet, then deepened with the corners and gotchas you only discover after
several scripts.

### [DICTIONARY.md](DICTIONARY.md) — The Alphabetical Reference

Every keyword, every statement form, every built-in function, every system
event, every command-bus channel — sorted A-Z with a one-line signature, a
sentence of behavior, and a tiny example. Use this when you already know
roughly what you want and just need the exact name or argument order.

The dictionary is structured for `Ctrl-F`: each entry has a stable anchor
and a code-style header so you can link directly to it from issues, PRs, or
inline comments in your `.retro` files.

### [tutorials/](tutorials/) — Progressive Hands-on Tutorials

Ten step-by-step tutorials, each building on the previous. They start with
"hello world" and end with a working multi-app ARG mini-campaign. Each
tutorial is a self-contained `.md` file with:

- A **goal** (what you'll have running by the end).
- A **prerequisites** note.
- The **script** built up step by step, with each addition explained.
- A **try it** checklist.
- An **exercises** section so you can keep going.

| # | Tutorial | What you'll build |
|---|---|---|
| 01 | [First Steps](tutorials/01-first-steps.md) | Run your first `.retro` file; print, comment, escape strings |
| 02 | [Variables and Data](tutorials/02-variables-and-data.md) | Build a small JSON-backed contact list |
| 03 | [Control Flow and Functions](tutorials/03-control-flow.md) | A scored quiz with reusable helper functions |
| 04 | [User Interaction](tutorials/04-user-interaction.md) | Dialog-driven onboarding wizard |
| 05 | [Files and Storage](tutorials/05-files-and-storage.md) | A persistent score tracker on disk |
| 06 | [Apps and Windows](tutorials/06-apps-and-windows.md) | Launch and control Notepad / Calculator / Browser |
| 07 | [Events and Reactivity](tutorials/07-events-and-reactivity.md) | A reactive desktop guard that watches the filesystem |
| 08 | [Terminal Automation](tutorials/08-terminal-automation.md) | Scripted terminal sessions with output capture |
| 09 | [Multimedia and Mood](tutorials/09-multimedia-and-mood.md) | A cinematic intro: audio + video + subtitle + FX |
| 10 | [Mini ARG Campaign](tutorials/10-mini-arg.md) | End-to-end narrative — story, scenes, clues, multi-app delivery |

---

## How RetroScript fits into IlluminatOS

```
                       ┌─────────────────────┐
                       │   .retro source     │
                       └──────────┬──────────┘
                                  │
                                  ▼
              ┌───────────────────────────────────────┐
              │  ScriptEngine (core/script/...)       │
              │   ┌────────┐ ┌────────┐ ┌──────────┐  │
              │   │ Lexer  │→│ Parser │→│Interpret.│  │
              │   └────────┘ └────────┘ └─────┬────┘  │
              └─────────────────────────────┬─┴───────┘
                                            │
                                            ▼
                ┌───────────────────────────────────────┐
                │             EventBus                  │  ← schema-validated
                │   (SemanticEventBus + Command Bus)    │     pub/sub + commands
                └───┬────────┬───────┬────────┬─────────┘
                    │        │       │        │
                    ▼        ▼       ▼        ▼
                ┌─────┐  ┌──────┐ ┌─────┐  ┌────────┐
                │Apps │  │ FS   │ │Featr│  │Plugins │
                └─────┘  └──────┘ └─────┘  └────────┘
                            │
                            ▼
                      ┌────────────┐
                      │NarrativeSM │   ← story/scene/objective/flag/clue
                      └────────────┘
```

Every statement that "does something" eventually emits an event, dispatches a
command, or asks a builtin to talk to a service from the host's context
(`FileSystemManager`, `WindowManager`, `EventBus`, etc.). That means every
single thing scripts can do is also observable, and every single thing the OS
emits can be subscribed to from a script.

---

## Where scripts can run

- **Script Runner** app — open a file, hit Run.
- **Terminal** — `retro path/to/script.retro`.
- **Double-click** a `.retro` file in My Computer or on the desktop.
- **autoexec** — `autoexec.retro` discovered at boot (10 s timeout vs 30 s
  for normal scripts).
- **Programmatically** — `ScriptEngine.run(source, options)` from any
  feature, app, or plugin.

See [GUIDE.md §1](GUIDE.md#1-running-scripts) for invocation details and
[GUIDE.md §11](GUIDE.md#11-the-script-engine-api) for embedding the engine.

---

## Conventions used in this documentation

- **Code blocks** marked with the `retro` language are RetroScript source.
  They can be copy-pasted into a `.retro` file and run as-is unless the
  surrounding prose explicitly says otherwise.
- **`call X arg1 arg2`** is a function call. Arguments are space-separated,
  not parenthesized. (`call X(arg1, arg2)` is a parse error.)
- **`$name`** is a variable. The `$` is required everywhere the variable
  is used, including the left-hand side of `set`.
- **`event:namespace:action`** in headings refers to an event on the
  EventBus. **`command:namespace:action`** refers to a command on the
  unified command registry. Both can be `emit`-ed from a script; commands
  can additionally be invoked with `call exec "command:name" $payload`.
- Snippets are written against the **current** engine
  (`core/script/`), the same source that
  `bash scripts/test-retroscript.sh` exercises in CI.

---

## Related reference material

Outside this directory:

- [`/SCRIPTING_GUIDE.md`](../../SCRIPTING_GUIDE.md) — the dense reference
  guide that ships at the repo root. Heavier on tables and exhaustive
  per-app surfaces; lighter on tutorials. Both styles are valid; pick
  whichever matches how you read.
- [`/DEVELOPER_GUIDE.md`](../../DEVELOPER_GUIDE.md) — how to add new apps,
  features, and plugins to the OS itself. Scripts can talk to whatever
  you build there.
- [`/CLAUDE.md`](../../CLAUDE.md) — architecture invariants and house
  conventions (events, state, sessions, paths).
- [`docs/RETROSCRIPT_SCRIPTABLE_EVENTS.md`](../RETROSCRIPT_SCRIPTABLE_EVENTS.md)
  — the encyclopedic event/command/query catalog.
- [`docs/TERMINAL_SCRIPTING.md`](../TERMINAL_SCRIPTING.md) — terminal
  built-ins and workflows.

---

## A note on accuracy

Everything here was derived from the actual source under
[`core/script/`](../../core/script/) and the schema files in
[`core/schema/`](../../core/schema/). Where the runtime differs from older
documentation, this directory follows the runtime. Specifically:

- `push` / `unshift` **mutate in place** and return the (modified) array —
  they are not pure.
- `read` defaults to `$result`, `confirm` to `$confirmed`, `prompt` to
  `$input` when no `into $var` clause is given.
- `clue.*` uses `add` / `has` / `get` / `list` / `reveal`. There is no
  `clue.discover` or `clue.examine`.
- `flag.*` uses `set` / `get` / `has` / `delete` / `all`. There is no
  `flag.unset`.
- `play <name>` auto-detects file paths versus predefined sound types by
  inspecting the source string (slash, colon, audio extension, or
  `assets/` / `C:` prefix → treated as a file path).

If a snippet doesn't work, that's a bug in the documentation — open an
issue or send a PR.
