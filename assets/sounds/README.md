# RetrOS Sound Assets

Place your MP3 files in this directory for use with the RetroScript `play` command.

## Directory Structure

```
assets/sounds/
├── README.md
├── startup.mp3
├── shutdown.mp3
├── click.mp3
├── error.mp3
├── notify.mp3
├── achievement.mp3
├── game-start.mp3
├── game-over.mp3
├── level-up.mp3
├── explosion.mp3
├── laser.mp3
└── (your custom sounds)
```

## RetroScript Usage

### Playing Predefined Sound Types
```retro
play click
play error
play achievement
play gameStart
```

### Playing MP3 Files by Path
```retro
play "assets/sounds/custom-music.mp3"
play "assets/sounds/explosion.mp3"
```

### Playing with Options
```retro
# Play at 50% volume
play "assets/sounds/music.mp3" volume=0.5

# Loop a sound
play "assets/sounds/ambient.mp3" loop=true

# Combine options
play "assets/sounds/bgm.mp3" volume=0.3 loop=true
```

### Using Variables
```retro
set $sound = "assets/sounds/victory.mp3"
play $sound volume=0.8
```

### Stopping Audio
```retro
# Stop all audio
stop

# Stop specific audio
stop "assets/sounds/music.mp3"
```

## Supported Formats

- MP3 (recommended)
- WAV
- OGG

## Predefined Sound Types

The SoundSystem includes these predefined types that work with synthesized fallbacks:

| Type | Description |
|------|-------------|
| `startup` | System boot sound |
| `shutdown` | System shutdown |
| `click` | UI click/button press |
| `open` | Window/menu open |
| `close` | Window/menu close |
| `error` | Error notification |
| `notify` | General notification |
| `achievement` | Achievement unlocked |
| `gameStart` | Game beginning |
| `gameOver` | Game ending |
| `levelUp` | Level complete |
| `collect` | Item collected |
| `hit` | Damage/impact |
| `explosion` | Explosion effect |
| `laser` | Laser/shoot sound |
| `typewriter` | Typing sound |
| `secret` | Secret discovered |
| `tada` | Celebration |

## Event Integration

Scripts can also listen for audio events:

```retro
on audio:ended {
    print "Audio finished playing"
}

on audio:error {
    print "Audio playback error"
}
```
