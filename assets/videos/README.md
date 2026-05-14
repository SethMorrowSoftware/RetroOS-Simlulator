# RetrOS Video Assets

Place your video files in this directory for use with the MediaPlayer app and RetroScript `video` command.

## Auto-Discovery

Files in this directory are automatically discovered and added to the virtual filesystem at `C:/Users/User/Videos/`. They appear in:

- **MediaPlayer** - as playlist entries (video + audio support)
- **My Computer** - browsable under `C:/Users/User/Videos/`
- **RetroScript** - accessible via `video` command and `playVideo()` function

## How to Add Videos

### Option 1: Direct file placement + index.json
Place video files here and create an `index.json`:
```json
["intro.mp4", "cutscene.webm"]
```

### Option 2: Media manifest (recommended)
Edit `assets/media-manifest.json`:
```json
{
    "music": [],
    "videos": [
        "intro.mp4",
        { "name": "Opening Cutscene", "src": "assets/videos/intro.mp4" }
    ]
}
```

## Directory Structure

```
assets/videos/
├── README.md
├── index.json          ← list of files for auto-discovery
├── intro.mp4
├── cutscene.webm
└── (your custom videos)
```

## Supported Formats

- MP4 (recommended)
- WebM
- OGG Video (.ogv)
- QuickTime (.mov)

## RetroScript Usage

### Playing Videos with the `video` Command
```retro
# Basic playback
video "assets/videos/intro.mp4"

# With options
video "assets/videos/cutscene.mp4" volume=0.8

# Loop a video
video "assets/videos/ambient.mp4" loop=true

# Using variables
set $cutscene = "assets/videos/ending.mp4"
video $cutscene
```

### Using Built-in Functions
```retro
# Play video using built-in function
playVideo("assets/videos/intro.mp4")
playVideo("C:/Users/User/Videos/intro.mp4")

# List available videos
set $videos = listVideos()
print $videos

# Stop video
stopVideo()
```

### Launching MediaPlayer with `launch`
```retro
# Open MediaPlayer with a specific video
launch mediaplayer with src="assets/videos/movie.mp4"
```

### Event Handling
```retro
# React to video events
on mediaplayer:ended {
    print "Video finished!"
    play achievement
}

on mediaplayer:playing {
    print "Video started playing"
}

on mediaplayer:stop {
    print "Video stopped"
}

# Handle playlist end
on mediaplayer:playlist:ended {
    print "All videos finished"
    emit game:complete
}
```

## Video Events

The MediaPlayer emits these events for script integration:

| Event | Description | Payload |
|-------|-------------|---------|
| `mediaplayer:playing` | Video actively playing | `{ video, index }` |
| `mediaplayer:stop` | Video stopped | `{ }` |
| `mediaplayer:ended` | Video finished | `{ video, index }` |
| `mediaplayer:loaded` | Video metadata loaded | `{ duration }` |
| `mediaplayer:error` | Playback error | `{ error }` |
| `mediaplayer:timeupdate` | Time updated | `{ currentTime, duration }` |
| `mediaplayer:playlist:add` | Video added to playlist | `{ video }` |
| `mediaplayer:playlist:ended` | Playlist finished | `{ }` |

## Video Player Commands (Scripting)

The MediaPlayer registers these commands for direct control:

```retro
# Control playback
exec mediaplayer.play
exec mediaplayer.pause
exec mediaplayer.stop

# Navigate playlist
exec mediaplayer.next
exec mediaplayer.previous

# Volume and seeking
exec mediaplayer.setVolume(80)
exec mediaplayer.seek(30)

# Fullscreen / mute
exec mediaplayer.fullscreen
exec mediaplayer.mute

# Shuffle / repeat
exec mediaplayer.shuffle
exec mediaplayer.repeat

# Load a new video
exec mediaplayer.load("assets/videos/new.mp4", "My Video")
```

## Queries

Get MediaPlayer state in scripts:

```retro
# Get current state
set $state = query mediaplayer.getState
print $state.playing
print $state.currentTime
print $state.duration

# Get playlist
set $playlist = query mediaplayer.getPlaylist
print $playlist

# Get current media info
set $current = query mediaplayer.getCurrentMedia
print $current.video.name
```

## Example: ARG Cutscene Integration

```retro
# EREBUS cutscene example
on puzzle:solved {
    # Play victory cutscene
    video "assets/videos/erebus/victory.mp4" volume=0.7
}

on mediaplayer:ended {
    # After cutscene, progress the story
    set $act = $act + 1
    write "ACT " + $act to "C:/Users/User/Desktop/EREBUS/PROGRESS.txt"
    alert "Act " + $act + " Complete!"
}

# Atmospheric background video
on app:erebus:start {
    video "assets/videos/erebus/static.mp4" loop=true volume=0.2
}
```
