# Local C64 ROMs

Drop Commodore 64 disk images, programs, and cartridges into this directory
and they'll show up automatically in the C64 app's **Disk** dropdown under a
"Local Library" section — no rebuild, no code changes, no restart.

## Supported file extensions

`.d64` `.g64` `.nib` `.crt` `.prg` `.t64` `.tap` `.m3u` `.zip` `.7z`

(Anything else in this directory is ignored.)

## How discovery works

The C64 app calls `api/c64-local.php` on launch. That endpoint scans this
directory, filters by the allowed extensions above, and returns a JSON list.
Files are served from `assets/c64/local/<filename>` — same-origin, no CORS
hop, no proxy round-trip. Loading a local ROM is the fastest path possible.

## Optional metadata sidecars

By default the app derives a display name from the filename (underscores and
hyphens become spaces; a trailing 4-digit year like `myGame_1985.d64` is
parsed out). For more control, drop a JSON sidecar next to the ROM:

```
mygame.d64
mygame.json   ← optional, same basename
```

Sidecar shape — every field is optional:

```json
{
  "name":     "My Custom Game",
  "year":     1986,
  "desc":     "Hand-converted by the host",
  "icon":     "🎮",
  "category": "Adventure"
}
```

If `category` is omitted the entry shows up under "Local Library". Set it to
`Arcade` / `Action` / `Shooter` / `Platformer` / `Puzzle` / `Adventure` /
`Tools` to slot the title into one of the existing dropdown groups.

## Legality

You are responsible for the legal status of files you place here. The
bundled retrobrews homebrew set is explicitly approved for free
distribution; commercial classics are not. If you have personal
preservation backups of titles you legally own, this is the right place
for them.

## Why local + retrobrews + nothing else?

Earlier versions of this app tried to pull commercial classics from
Internet Archive on the fly, but IA's per-item naming wasn't stable
enough to keep the dropdown reliable. The current model is:

1. **Bundled (retrobrews)** — ~48 freeware homebrew titles, served
   from `raw.githubusercontent.com`. Always works.
2. **Local (this directory)** — host-supplied ROMs, served same-origin.
   Always works.
3. **URL bar** — paste any CORS-friendly download URL (e.g. an Internet
   Archive `archive.org/download/...` link).
4. **File…** — pick a `.d64` from your own machine via Blob URL.

Everything else was removed for being unreliable.
