# Terminal Scripting Guide (RetroScript)

This guide covers Terminal automation through RetroScript terminal built-ins (`core/script/builtins/TerminalBuiltins.js`).

## What Terminal built-ins enable

From RetroScript, you can:
- Open/focus/minimize/close terminal windows
- Execute commands and command sequences
- Print text/HTML into terminal output
- Read state (cwd, history, output, env vars, aliases)
- Perform file operations with terminal-relative path resolution
- Trigger terminal effects (`matrix`, `god mode`, colors, cowsay/fortune)

---

## Core workflow

```retro
# Ensure terminal exists
call terminalOpen

# Run commands
call terminalExecute "ver"
call terminalExecute "dir"

# Read last output
set $out = call terminalGetOutput
print $out
```

---

## Function reference

### Window/control
- `terminalOpen(initialCommand?)`
- `terminalFocus()`
- `terminalMinimize()`
- `terminalClose()`
- `isTerminalOpen()`

### Command/output
- `terminalExecute(command)`
- `terminalExecuteSequence(commandsArray)`
- `terminalPrint(text, color?)`
- `terminalPrintHtml(html)`
- `terminalClear()`
- `terminalGetOutput()`
- `terminalGetAllOutput()`
- `terminalGetHistory()`
- `terminalGetState()`

### Paths/files
- `terminalCd(path)`
- `terminalGetPath()`
- `terminalDir(path?)`
- `terminalReadFile(path)`
- `terminalWriteFile(path, content)`
- `terminalFileExists(path)`
- `terminalRunScript(path)`

### Environment/aliases
- `terminalSetEnvVar(name, value)`
- `terminalGetEnvVar(name)`
- `terminalGetEnvVars()`
- `terminalAlias(name, command)`
- `terminalGetAliases()`

### Effects/fun
- `terminalGodMode()`
- `terminalIsGodMode()`
- `terminalMatrix()`
- `terminalColor(code)`
- `terminalCowsay(message)`
- `terminalFortune()`

---

## Practical examples

### Automated setup
```retro
call terminalOpen
call terminalExecuteSequence [
  "cd C:/Users/User",
  "mkdir Projects",
  "cd Projects",
  "touch readme.txt"
]
call terminalPrint "Project folder initialized" "#00ff88"
```

### Terminal-guided challenge
```retro
call terminalOpen
call terminalPrint "Find C:/Users/User/Secret/password.txt" "#ffff00"

on app:terminal:command {
  set $cmd = $event.command
  if call contains $cmd "password.txt" then {
    call terminalPrint "Nice. You found the target." "#00ff00"
  }
}
```

---

## Important behavior notes

- Most terminal built-ins require an open terminal instance.
- `terminalOpen` should be used first in automation scripts.
- File built-ins resolve relative paths against terminal cwd when terminal is open.
- State helpers return safe fallbacks (`null`, `{}`, `[]`, `false`) if terminal is unavailable.

