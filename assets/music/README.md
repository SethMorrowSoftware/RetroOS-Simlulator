# Music Assets

Place your music files (MP3, WAV, OGG, FLAC, M4A, AAC) in this directory.

## Auto-Discovery

Files in this directory are automatically discovered and added to the virtual filesystem at `C:/Users/User/Music/`. They appear in:

- **Media Player** - as playlist entries (audio + video)
- **My Computer** - browsable under `C:/Users/User/Music/`

## How to Add Music

### Option 1: Direct file placement
Simply place `.mp3`, `.wav`, `.ogg`, or `.flac` files in this directory.

Then create an `index.json` listing them:
```json
["song1.mp3", "song2.mp3", "ambient.ogg"]
```

### Option 2: Media manifest (recommended)
Edit `assets/media-manifest.json` to list all media:
```json
{
    "music": [
        "song1.mp3",
        { "name": "My Cool Song", "src": "assets/music/song1.mp3" },
        "path/to/another.mp3"
    ],
    "videos": []
}
```

### Option 3: Rich metadata
```json
{
    "music": [
        {
            "name": "Epic Background Music",
            "filename": "epic-bg.mp3",
            "src": "assets/music/epic-bg.mp3",
            "mimeType": "audio/mpeg"
        }
    ]
}
```

## RetroScript Usage

```retro
# Play from filesystem path
play "C:/Users/User/Music/song.mp3"

# Play from URL
play "assets/music/song.mp3" volume=0.5 loop=true

# Use built-in functions
playMusic("C:/Users/User/Music/song.mp3")
listMusic()
setVolume(80)
stopMusic()
```

## Supported Formats

| Format | Extension | MIME Type |
|--------|-----------|-----------|
| MP3 | .mp3 | audio/mpeg |
| WAV | .wav | audio/wav |
| OGG | .ogg | audio/ogg |
| FLAC | .flac | audio/flac |
| M4A | .m4a | audio/mp4 |
| AAC | .aac | audio/aac |
