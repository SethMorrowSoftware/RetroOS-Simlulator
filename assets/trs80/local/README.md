# Local TRS-80 Programs

Drop Tandy/Radio Shack TRS-80 disk images, cassettes, command files, and
BASIC programs into this directory and they'll show up automatically in
the TRS-80 app's **Program** dropdown under a "Local Library" section —
no rebuild, no code changes, no restart.

## Supported file extensions

| Format | Extension | Notes |
|---|---|---|
| Floppy disk image | `.dsk` `.jv1` `.jv3` `.dmk` | Mounted on drive 0; machine reboots into it |
| Command file | `.cmd` | Loaded into memory and executed |
| BASIC program | `.bas` | Tokenised BASIC |
| Raw binary | `.bin` | Raw Z80 image |
| Cassette image | `.cas` `.wav` | (cassette playback wiring is a follow-up) |
| Archive | `.zip` | Auto-unpacked by the engine when supported |

## How discovery works

The TRS-80 app calls `api/trs80-local.php` on launch. That endpoint scans
this directory, filters by the allowed extensions above, and returns a
JSON list. Files are served from `assets/trs80/local/<filename>` —
same-origin, no CORS hop, no proxy round-trip. Loading a local program
is the fastest path possible.

## Optional metadata sidecars

By default the app derives a display name from the filename (underscores
and hyphens become spaces; a trailing 4-digit year like
`mygame_1981.dsk` is parsed out). For more control, drop a JSON sidecar
next to the program:

```
adventure.dsk
adventure.json   ← optional, same basename
```

Sidecar shape — every field is optional:

```json
{
  "name":     "My Adventure",
  "year":     1981,
  "desc":     "Hand-converted from the original tape",
  "icon":     "🗡️",
  "category": "Adventure"
}
```

If `category` is omitted the entry shows up under "Local Library". Set
it to `Adventure` / `Arcade` / `Action` / `Puzzle` / `Tools` to slot
the title into one of the existing dropdown groups.

## Legality

You are responsible for the legal status of files you place here. The
TRS-80 software ecosystem is mostly out of print but copyright on most
commercial titles has not lapsed. If you have personal preservation
backups of titles you legally own, this is the right place for them.
For freely-redistributable programs, the
[TRS-80 Revived archive](https://www.trs-80.com/) and
[Ira Goldklang's TRS-80 archive](https://www.trs-80.com/wordpress/) are
good starting points.

## Why local + URL bar?

Unlike the C64 (where retrobrews maintains a curated GitHub-hosted
freeware collection), the TRS-80 doesn't have a single canonical
CORS-friendly CDN. The app ships with the BASIC "boot to READY" entry
and relies on:

1. **Local (this directory)** — host-supplied programs, served same-origin.
2. **URL bar** — paste any CORS-friendly download URL.
3. **File…** — pick a file from your own machine via Blob URL.

Adding a curated bundled library is a follow-up — please contribute
known-redistributable URLs upstream if you find good ones.
