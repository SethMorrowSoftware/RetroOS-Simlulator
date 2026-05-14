# RetroScript Scriptable Events Reference

> **Complete reference of every scriptable event, command, query, and built-in function in RetroOS.**
> Every event listed here can be used with RetroScript's `on` and `emit` statements.

---

## Table of Contents

1. [How Scripting Works](#how-scripting-works)
2. [Window Events](#window-events)
3. [App Lifecycle Events](#app-lifecycle-events)
4. [App-Specific Events](#app-specific-events)
   - [Notepad](#notepad)
   - [Calculator](#calculator)
   - [Terminal](#terminal)
   - [Browser](#browser)
   - [Inbox (Email)](#inbox-email)
   - [Phone](#phone)
   - [Instant Messenger](#instant-messenger)
   - [ChatRoom](#chatroom)
   - [Paint](#paint)
   - [Clock](#clock)
   - [Calendar](#calendar)
   - [Media Player](#media-player)
   - [My Computer (File Explorer)](#my-computer-file-explorer)
   - [Recycle Bin](#recycle-bin)
   - [Admin Panel](#admin-panel)
   - [Features Settings](#features-settings)
   - [Defrag](#defrag)
   - [Help System](#help-system)
   - [HyperCard](#hypercard)
   - [Doom](#doom)
   - [ScriptRunner](#scriptrunner)
5. [Game Events](#game-events)
   - [Generic Game Events](#generic-game-events)
   - [Minesweeper](#minesweeper)
   - [Snake](#snake)
   - [Asteroids](#asteroids)
   - [Solitaire](#solitaire)
   - [FreeCell](#freecell)
   - [SkiFree](#skifree)
   - [Zork](#zork)
6. [System Events](#system-events)
7. [UI Events](#ui-events)
8. [Desktop Events](#desktop-events)
9. [Icon Events](#icon-events)
10. [Sound & Audio Events](#sound--audio-events)
11. [Filesystem Events](#filesystem-events)
12. [Dialog Events](#dialog-events)
13. [Notification Events](#notification-events)
14. [Clipboard Events](#clipboard-events)
15. [Keyboard & Input Events](#keyboard--input-events)
16. [Mouse Events](#mouse-events)
17. [Touch & Gesture Events](#touch--gesture-events)
18. [Drag & Drop Events](#drag--drop-events)
19. [Feature & Plugin Events](#feature--plugin-events)
20. [Achievement Events](#achievement-events)
21. [Script & Automation Events](#script--automation-events)
22. [Timer Events](#timer-events)
23. [Macro Events](#macro-events)
24. [State & Settings Events](#state--settings-events)
25. [Theme Events](#theme-events)
26. [Animation Events](#animation-events)
27. [Search Events](#search-events)
28. [Selection Events](#selection-events)
29. [History/Undo Events](#historyundo-events)
30. [Network Events](#network-events)
31. [Performance Events](#performance-events)
32. [Debug Events](#debug-events)
33. [Feedback Events](#feedback-events)
34. [Accessibility Events](#accessibility-events)
35. [Session & User Events](#session--user-events)
36. [Channel Events](#channel-events)
37. [BSOD Events](#bsod-events)
38. [Autoexec Events](#autoexec-events)
39. [DVD Bouncer Plugin Events](#dvd-bouncer-plugin-events)
40. [Command Bus Commands](#command-bus-commands)
41. [Query Bus Queries](#query-bus-queries)
42. [Built-in Functions](#built-in-functions)
43. [Legacy Event Mapping](#legacy-event-mapping)

---

## How Scripting Works

RetroScript uses an event-driven model. Scripts can **listen** for events and **emit** events to control the OS.

### Listening to Events
```retro
on <eventName> {
    # $event contains the payload
    print $event.appId
}
```

### Emitting Events
```retro
emit <eventName> key=value key2=value2
```

### Wildcard Patterns
```retro
on window:* {
    print "A window event occurred"
}
```

### Event Priority Levels
| Priority | Value | Description |
|----------|-------|-------------|
| SYSTEM   | 1000  | Core system handlers |
| HIGH     | 100   | High-priority handlers |
| NORMAL   | 0     | Default for most handlers |
| LOW      | -100  | Low-priority handlers |
| SCRIPT   | -500  | RetroScript `on` handlers |

---

## Window Events

| Event | Description | Payload |
|-------|-------------|---------|
| `window:create` | Window being created | `id`, `title`, `appId`, `width`, `height`, `x?`, `y?`, `resizable?`, `minimizable?`, `maximizable?` |
| `window:open` | Window opened and rendered in DOM | `id`, `appId?`, `element?` |
| `window:close` | Window closing | `id`, `appId?` |
| `window:focus` | Window received focus | `id`, `previousId?` |
| `window:minimize` | Window minimized | `id` |
| `window:maximize` | Window maximized | `id` |
| `window:restore` | Window restored from min/max | `id` |
| `window:resize` | Window resized | `id`, `width`, `height` |
| `window:resize:start` | Window resize started | `id`, `width`, `height`, `handle?` |
| `window:resize:end` | Window resize ended | `id`, `width`, `height` |
| `window:move` | Window position changed | `id`, `x`, `y`, `previousX?`, `previousY?` |
| `window:move:start` | Window drag started | `id`, `x`, `y` |
| `window:move:end` | Window drag ended | `id`, `x`, `y` |
| `window:snap` | Window snapped to edge | `id`, `snapType`, `x`, `y`, `width`, `height` |
| `window:titlebar:click` | Titlebar clicked | `id`, `button?` |
| `window:shake` | Window shake animation | `id`, `reason?` |
| `window:flash` | Window flash for attention | `id`, `count?` |

**Example:**
```retro
on window:open {
    print "Window opened: " + $event.id
}

on window:focus {
    print "Focused: " + $event.id + " (previous: " + $event.previousId + ")"
}
```

---

## App Lifecycle Events

These events fire for **every** application.

| Event | Description | Payload |
|-------|-------------|---------|
| `app:launch` | App launch requested | `appId`, `params?` |
| `app:launched` | App launch completed | `appId`, `windowId?`, `success?` |
| `app:open` | App window opened | `appId`, `windowId`, `instance?` |
| `app:close` | App closed | `appId`, `windowId` |
| `app:registered` | App registered in AppRegistry | `appId`, `name`, `category?` |
| `app:focus` | App window gained focus | `appId`, `windowId`, `previousAppId?` |
| `app:blur` | App window lost focus | `appId`, `windowId` |
| `app:ready` | App mounted and ready | `appId`, `windowId` |
| `app:busy` | App is processing | `appId`, `windowId`, `task?` |
| `app:idle` | App finished processing | `appId`, `windowId` |
| `app:error` | App error occurred | `appId`, `windowId?`, `error`, `stack?` |
| `app:launch:error` | App launch failed | `appId`, `appName?`, `error`, `stack?`, `timestamp?` |
| `app:close:error` | Error while closing app | `appId`, `error` |
| `app:state:change` | App internal state changed | `appId`, `windowId`, `key`, `value`, `oldValue?` |
| `app:message` | Inter-app message | `fromAppId`, `toAppId`, `message`, `messageType?` |
| `app:broadcast` | Broadcast to all apps | `fromAppId`, `message`, `messageType?` |

**Example:**
```retro
on app:launch {
    if $event.appId == "notepad" {
        print "Notepad is launching!"
        emit sound:play type="open"
    }
}

on app:close {
    print $event.appId + " closed (window: " + $event.windowId + ")"
}
```

---

## Universal App Core Commands (All Apps)

Every app window inherits a baseline command/query API from `AppBase` so narrative scripts can control any app even before app-specific handlers are used.

**Commands:**

| Command | Description | Payload |
|---------|-------------|---------|
| `command:<appId>:core.focus` | Focus target app window | `windowId?` |
| `command:<appId>:core.minimize` | Minimize target window | `windowId?` |
| `command:<appId>:core.maximize` | Maximize target window | `windowId?` |
| `command:<appId>:core.restore` | Restore minimized/maximized window | `windowId?` |
| `command:<appId>:core.close` | Close target window | `windowId?` |
| `command:<appId>:core.setState` | Store per-window narrative state | `windowId?`, `key`, `value` |
| `command:<appId>:core.emitCue` | Emit app-scoped narrative cue event | `windowId?`, `cue`, `data?` |

**Queries:**

| Query | Description | Payload |
|-------|-------------|---------|
| `query:<appId>:core.window` | Window status (focus/min/max flags) | `windowId?`, `requestId` |
| `query:<appId>:core.state` | Per-window scripted state object | `windowId?`, `requestId` |
| `query:<appId>:core.capabilities` | Core capability manifest | `windowId?`, `requestId` |

---

## App-Specific Events

### Notepad

| Event | Description | Payload |
|-------|-------------|---------|
| `app:notepad:saved` | Document saved | `appId`, `windowId`, `path`, `filename` |
| `app:notepad:fileOpened` | File opened | `appId`, `windowId`, `path`, `filename` |
| `app:notepad:textChanged` | Text content changed | `appId`, `windowId`, `length` |
| `app:notepad:newDocument` | New document created | `appId`, `windowId` |
| `app:notepad:opened` | Notepad window opened | `appId`, `windowId` |

**Commands:**
| Command | Description | Payload |
|---------|-------------|---------|
| `command:notepad:new` | Create new document | `windowId?` |
| `command:notepad:open` | Open file | `windowId?`, `path` |
| `command:notepad:save` | Save document | `windowId?`, `path?` |
| `command:notepad:setText` | Set text content | `windowId?`, `text` |

**Queries:**
| Query | Description | Payload |
|-------|-------------|---------|
| `query:notepad:getText` | Get current text | `windowId?`, `requestId` |

**Example:**
```retro
on app:notepad:saved {
    emit notification:show title="Saved" message="File saved to " + $event.filename
}
```

---

### Calculator

| Event | Description | Payload |
|-------|-------------|---------|
| `app:calculator:input` | Button pressed | `appId`, `windowId`, `value` |
| `app:calculator:calculated` | Calculation performed | `appId`, `windowId`, `expression`, `result` |
| `app:calculator:cleared` | Calculator cleared | `appId`, `windowId` |
| `app:calculator:result` | Result displayed (alternate) | `appId`, `windowId`, `result` |

**Commands:**
| Command | Description | Payload |
|---------|-------------|---------|
| `command:calculator:clear` | Clear calculator | `windowId?` |
| `command:calculator:input` | Input value/operator | `windowId?`, `value` |

**Queries:**
| Query | Description | Payload |
|-------|-------------|---------|
| `query:calculator:getValue` | Get display value | `windowId?`, `requestId` |

---

### Terminal

| Event | Description | Payload |
|-------|-------------|---------|
| `app:terminal:opened` | Terminal window opened | `appId`, `windowId?`, `currentPath?`, `pathString?`, `timestamp?` |
| `app:terminal:command` | Command processed (full context) | `appId`, `windowId?`, `command`, `cmd?`, `args?`, `output?`, `currentPath?`, `pathString?`, `timestamp?` |
| `app:terminal:closed` | Terminal window closed | `appId`, `windowId?`, `commandHistory?`, `historyCount?`, `timestamp?` |
| `terminal:command` | Command executed | `command`, `args?`, `cwd?` |
| `terminal:output` | Output generated | `text`, `type?` |
| `terminal:error` | Error occurred | `message`, `command?` |
| `terminal:cwd:change` | Directory changed | `cwd`, `previousCwd?` |
| `terminal:matrix` | Matrix screen effect | *(none)* |
| `terminal:command:executed` | Command successfully executed | `appId`, `windowId?`, `command`, `timestamp?` |
| `terminal:command:error` | Command execution error | `appId`, `command`, `error` |
| `terminal:cleared` | Terminal screen cleared | `appId`, `windowId?`, `timestamp?` |
| `terminal:directory:changed` | Working directory changed | `appId`, `path`, `timestamp?` |

**Commands:**
| Command | Description | Payload |
|---------|-------------|---------|
| `command:terminal:execute` | Execute a terminal command | `windowId?`, `command` |

**Example:**
```retro
on app:terminal:command {
    if $event.cmd == "secret" {
        emit notification:show title="Easter Egg" message="You found it!"
    }
}
```

---

### Browser

| Event | Description | Payload |
|-------|-------------|---------|
| `app:browser:navigate` | Navigation event | `appId`, `windowId`, `url` |
| `app:browser:homepageChanged` | Homepage changed | `appId`, `windowId`, `url` |
| `app:browser:bookmarkAdded` | Bookmark added | `appId`, `windowId`, `url`, `title` |
| `app:browser:bookmarkRemoved` | Bookmark removed | `appId`, `windowId`, `url` |
| `browser:navigate` | Navigation started | `url`, `previousUrl?` |
| `browser:navigated` | Finished navigating | `url` |
| `browser:load` | Page loaded | `url`, `title?` |
| `browser:bookmark:add` | Bookmark added | `url`, `title` |

**Commands:**
| Command | Description | Payload |
|---------|-------------|---------|
| `command:browser:navigate` | Navigate to URL | `windowId?`, `url` |

---

### Inbox (Email)

| Event | Description | Payload |
|-------|-------------|---------|
| `app:inbox:messageReadChanged` | Message read state changed | `appId`, `windowId`, `messageId`, `read` |
| `app:inbox:messageSent` | Message sent | `appId`, `windowId`, `to`, `subject` |
| `app:inbox:messageReceived` | New message received | `appId`, `windowId`, `from`, `subject` |
| `app:inbox:messageDeleted` | Message deleted | `appId`, `windowId`, `messageId` |
| `app:inbox:messageRestored` | Message restored | `appId`, `windowId`, `messageId` |
| `app:inbox:messageMoved` | Message moved to folder | `appId`, `windowId`, `messageId`, `folder` |
| `app:inbox:folderChanged` | Active folder changed | `appId`, `windowId`, `folder` |
| `app:inbox:unreadCountChanged` | Unread count changed | `appId`, `windowId`, `count` |
| `app:inbox:notificationStateChanged` | Notification state changed | `appId`, `windowId` |
| `app:inbox:scheduledDelivered` | Scheduled message delivered | `appId`, `windowId` |
| `app:inbox:autoReplySet` | Auto-reply configured | `appId`, `windowId` |

---

### Phone

| Event | Description | Payload |
|-------|-------------|---------|
| `app:phone:ended` | Call ended | `appId`, `windowId` |
| `app:phone:incoming` | Incoming call | `appId`, `windowId`, `number`, `contact` |
| `app:phone:answered` | Call answered | `appId`, `windowId` |
| `app:phone:declined` | Call declined | `appId`, `windowId` |
| `app:phone:ringing` | Phone ringing | `appId`, `windowId` |
| `app:phone:connected` | Call connected | `appId`, `windowId` |
| `app:phone:callIntercepted` | Call intercepted | `appId`, `windowId` |
| `app:phone:dialed` | Number dialed | `appId`, `windowId`, `number` |
| `app:phone:dtmf` | DTMF tone sent | `appId`, `windowId`, `digit` |
| `app:phone:voicemail` | Voicemail received | `appId`, `windowId` |
| `app:phone:voicemailPlayed` | Voicemail played | `appId`, `windowId` |
| `app:phone:speedDialUsed` | Speed dial used | `appId`, `windowId`, `slot` |
| `app:phone:viewChanged` | View changed | `appId`, `windowId`, `view` |
| `app:phone:messageReceived` | SMS received | `appId`, `windowId` |
| `app:phone:messageSent` | SMS sent | `appId`, `windowId` |
| `app:phone:contactAdded` | Contact added | `appId`, `windowId` |
| `app:phone:contactRemoved` | Contact removed | `appId`, `windowId` |
| `app:phone:contactUpdated` | Contact updated | `appId`, `windowId` |
| `app:phone:audioStarted` | Call audio started | `appId`, `windowId` |
| `app:phone:audioEnded` | Call audio ended | `appId`, `windowId` |
| `app:phone:scheduledCallTriggered` | Scheduled call triggered | `appId`, `windowId` |

---

### Instant Messenger

| Event | Description | Payload |
|-------|-------------|---------|
| `app:instantmessenger:signedOn` | Signed on | `appId`, `windowId`, `username` |
| `app:instantmessenger:signedOff` | Signed off | `appId`, `windowId` |
| `app:instantmessenger:conversationOpened` | Conversation opened | `appId`, `windowId`, `buddy` |
| `app:instantmessenger:conversationClosed` | Conversation closed | `appId`, `windowId`, `buddy` |
| `app:instantmessenger:messageSent` | Message sent | `appId`, `windowId`, `buddy`, `message` |
| `app:instantmessenger:messageReceived` | Message received | `appId`, `windowId`, `buddy`, `message` |
| `app:instantmessenger:buddyOnline` | Buddy came online | `appId`, `windowId`, `buddy` |
| `app:instantmessenger:buddyOffline` | Buddy went offline | `appId`, `windowId`, `buddy` |
| `app:instantmessenger:buddyStatusChanged` | Buddy status changed | `appId`, `windowId`, `buddy`, `status` |
| `app:instantmessenger:awayChanged` | Away status changed | `appId`, `windowId`, `away` |
| `app:instantmessenger:scheduledMessageDelivered` | Scheduled message delivered | `appId`, `windowId` |

---

### ChatRoom

| Event | Description | Payload |
|-------|-------------|---------|
| `app:chatroom:loggedIn` | User logged in | `appId`, `windowId`, `username` |
| `app:chatroom:messageReceived` | Message received | `appId`, `windowId`, `username`, `message` |
| `app:chatroom:messageSent` | Message sent | `appId`, `windowId`, `message` |
| `app:chatroom:userJoined` | User joined room | `appId`, `windowId`, `username` |
| `app:chatroom:userLeft` | User left room | `appId`, `windowId`, `username` |
| `app:chatroom:roomChanged` | Room changed | `appId`, `windowId`, `room` |
| `app:chatroom:topicChanged` | Room topic changed | `appId`, `windowId`, `topic` |
| `app:chatroom:roomLocked` | Room locked | `appId`, `windowId` |
| `app:chatroom:roomUnlocked` | Room unlocked | `appId`, `windowId` |

---

### Paint

| Event | Description | Payload |
|-------|-------------|---------|
| `app:paint:opened` | Paint window opened | `appId`, `windowId` |
| `app:paint:saved` | Image saved | `appId`, `windowId` |
| `paint:tool:change` | Tool changed | `tool`, `previousTool?` |
| `paint:tool:changed` | Tool selection changed | `tool` |
| `paint:color:change` | Color changed | `color`, `previousColor?` |
| `paint:color:changed` | Color changed | `color` |
| `paint:brush:size` | Brush size changed | `size`, `previousSize?` |
| `paint:brushSize:changed` | Brush size changed | `size` |
| `paint:stroke:start` | Stroke started | `x`, `y`, `tool` |
| `paint:stroke:end` | Stroke ended | `x`, `y` |
| `paint:canvas:clear` | Canvas cleared | *(none)* |
| `paint:canvas:cleared` | Canvas cleared | *(none)* |
| `paint:file:save` | Image saved | `path`, `filename` |
| `paint:file:open` | Image opened | `path`, `filename` |

---

### Clock

| Event | Description | Payload |
|-------|-------------|---------|
| `app:clock:alarm:set` | Alarm set | `appId`, `windowId`, `time` |
| `app:clock:alarm:triggered` | Alarm triggered | `appId`, `windowId` |
| `app:clock:alarm:dismissed` | Alarm dismissed | `appId`, `windowId` |
| `app:clock:stopwatch:started` | Stopwatch started | `appId`, `windowId` |
| `app:clock:stopwatch:stopped` | Stopwatch stopped | `appId`, `windowId`, `elapsed` |
| `app:clock:stopwatch:lap` | Lap recorded | `appId`, `windowId`, `lap` |
| `app:clock:timer:complete` | Timer completed | `appId`, `windowId` |

---

### Calendar

| Event | Description | Payload |
|-------|-------------|---------|
| `app:calendar:event:created` | Event created | `appId`, `windowId`, `title`, `date` |
| `app:calendar:event:deleted` | Event deleted | `appId`, `windowId`, `eventId` |
| `app:calendar:event:updated` | Event updated | `appId`, `windowId`, `eventId` |
| `app:calendar:date:selected` | Date selected | `appId`, `windowId`, `date` |
| `app:calendar:month:changed` | Month view changed | `appId`, `windowId`, `month`, `year` |

---

### Media Player

Unified audio + video player. All audio and video files route to this app.

| Event | Description | Payload |
|-------|-------------|---------|
| `app:mediaplayer:play` | Playback started | `appId`, `windowId` |
| `app:mediaplayer:pause` | Playback paused | `appId`, `windowId` |
| `app:mediaplayer:stop` | Playback stopped | `appId`, `windowId` |
| `app:mediaplayer:playing` | Currently playing | `appId`, `windowId` |
| `app:mediaplayer:ended` | Playback ended | `appId`, `windowId` |
| `app:mediaplayer:playlist:loaded` | Playlist loaded | `appId`, `windowId` |
| `app:mediaplayer:playlist:ended` | Playlist ended | `appId`, `windowId` |
| `app:mediaplayer:track:changed` | Track changed | `appId`, `windowId` |
| `mediaplayer:playing` | Media playing | `media`, `index`, `isAudio` |
| `mediaplayer:stop` | Media stopped | *(none)* |
| `mediaplayer:loaded` | Metadata loaded | `duration` |
| `mediaplayer:ended` | Track ended | `media`, `index` |
| `mediaplayer:error` | Failed to load | `error` |
| `mediaplayer:timeupdate` | Position updated | `currentTime`, `duration` |
| `mediaplayer:playlist:add` | Added to playlist | `media` |
| `mediaplayer:playlist:ended` | Playlist completed | *(none)* |
| `mediaplayer:requested` | Playback requested externally | `src`, `options` |
| `media:track:change` | Track changed (generic) | `track`, `index`, `duration?` |
| `media:play` | Playback started (generic) | `track`, `position?` |
| `media:pause` | Playback paused (generic) | `track`, `position` |
| `media:stop` | Playback stopped (generic) | `track?` |
| `media:volume` | Volume changed | `volume`, `previousVolume?` |
| `media:position` | Position changed | `position`, `duration` |

---

### My Computer (File Explorer)

| Event | Description | Payload |
|-------|-------------|---------|
| `mycomputer:navigate` | Navigate to path | `path`, `windowId?` |
| `mycomputer:navigated` | Finished navigating | `path`, `windowId?` |
| `mycomputer:deleted` | Item deleted | `path`, `name?` |
| `mycomputer:folder:created` | New folder created | `path`, `name?` |
| `mycomputer:renamed` | Item renamed | `path`, `oldName?`, `newName?` |

---

### Recycle Bin

| Event | Description | Payload |
|-------|-------------|---------|
| `app:recyclebin:item:restored` | Item restored | `appId`, `windowId` |
| `app:recyclebin:item:deleted` | Item permanently deleted | `appId`, `windowId` |
| `app:recyclebin:bin:emptied` | Bin emptied | `appId`, `windowId` |
| `recyclebin:update` | Bin contents changed | `count?` |
| `recyclebin:recycle-file` | File moved to bin | `iconId`, `path?`, `originalPath?` |
| `recyclebin:restore` | File restored from bin | `iconId`, `originalPath` |
| `recyclebin:empty` | Bin emptied | `count?` |

---

### Admin Panel

| Event | Description | Payload |
|-------|-------------|---------|
| `app:adminpanel:icon:added` | Desktop icon added | `appId`, `windowId` |
| `app:adminpanel:icon:removed` | Desktop icon removed | `appId`, `windowId` |
| `app:adminpanel:achievement:unlocked` | Achievement unlocked | `appId`, `windowId` |
| `app:adminpanel:achievements:reset` | Achievements reset | `appId`, `windowId` |

---

### Features Settings

| Event | Description | Payload |
|-------|-------------|---------|
| `app:featuressettings:feature:enabled` | Feature enabled | `appId`, `windowId`, `featureId` |
| `app:featuressettings:feature:disabled` | Feature disabled | `appId`, `windowId`, `featureId` |
| `app:featuressettings:feature:configChanged` | Feature config changed | `appId`, `windowId`, `featureId`, `key`, `value` |

---

### Defrag

| Event | Description | Payload |
|-------|-------------|---------|
| `app:defrag:analysis:complete` | Analysis complete | `appId`, `windowId` |
| `app:defrag:defrag:start` | Defrag started | `appId`, `windowId` |
| `app:defrag:defrag:complete` | Defrag completed | `appId`, `windowId` |
| `app:defrag:defrag:stopped` | Defrag stopped | `appId`, `windowId` |

---

### Help System

| Event | Description | Payload |
|-------|-------------|---------|
| `app:helpsystem:topic:changed` | Help topic changed | `appId`, `windowId`, `topic` |

---

### HyperCard

| Event | Description | Payload |
|-------|-------------|---------|
| `app:hypercard:loaded` | HyperCard loaded | `appId`, `windowId` |

---

### Doom

| Event | Description | Payload |
|-------|-------------|---------|
| `app:doom:game:launched` | Doom game launched | `appId`, `windowId` |
| `app:doom:game:focused` | Doom game focused | `appId`, `windowId` |

---

### ScriptRunner

| Event | Description | Payload |
|-------|-------------|---------|
| `script:execute` | Script execution started | `scriptId`, `params?`, `requestId?` |
| `script:complete` | Script completed | `scriptId`, `requestId?`, `result?`, `error?` |
| `script:error` | Script error | `scriptId`, `requestId?`, `error`, `line?` |
| `script:output` | Script print/log output | `message` |

---

## Game Events

### Generic Game Events

These events work across all games.

| Event | Description | Payload |
|-------|-------------|---------|
| `game:start` | Game started | `appId`, `difficulty?`, `settings?` |
| `game:pause` | Game paused | `appId`, `time?`, `score?` |
| `game:resume` | Game resumed | `appId` |
| `game:over` | Game ended | `appId`, `won`, `score?`, `time?`, `stats?` |
| `game:score` | Score changed | `appId`, `score`, `delta?`, `reason?` |
| `game:highscore` | New high score | `appId`, `score`, `previousScore?` |
| `game:level` | Level changed | `appId`, `level`, `previousLevel?` |
| `game:lives` | Lives changed | `appId`, `lives`, `delta?` |
| `game:state` | Game state changed | `appId`, `state`, `previousState?`, `data?` |

**Example:**
```retro
on game:over {
    if $event.won {
        emit notification:show title="Victory!" message=$event.appId + " - Score: " + $event.score
    }
}
```

---

### Minesweeper

| Event | Description | Payload |
|-------|-------------|---------|
| `app:minesweeper:game:start` | Game started | `appId`, `windowId` |
| `app:minesweeper:game:win` | Game won | `appId`, `windowId` |
| `app:minesweeper:game:lose` | Game lost | `appId`, `windowId` |
| `app:minesweeper:cell:revealed` | Cell revealed | `appId`, `windowId` |
| `app:minesweeper:cell:flagged` | Cell flagged | `appId`, `windowId` |
| `minesweeper:cell:reveal` | Cell revealed (detailed) | `row`, `col`, `value`, `isMine` |
| `minesweeper:cell:flag` | Cell flagged (detailed) | `row`, `col`, `flagged`, `minesRemaining` |
| `minesweeper:mine:hit` | Mine hit - game over | `row`, `col`, `time` |
| `minesweeper:win` | Game won (detailed) | `time`, `difficulty?`, `rows`, `cols`, `mines` |
| `minesweeper:timer` | Timer updated | `time` |

---

### Snake

| Event | Description | Payload |
|-------|-------------|---------|
| `app:snake:game:start` | Game started | `appId`, `windowId` |
| `app:snake:food:eaten` | Food eaten | `appId`, `windowId` |
| `app:snake:score:updated` | Score updated | `appId`, `windowId` |
| `app:snake:game:over` | Game over | `appId`, `windowId` |
| `snake:food:eat` | Food eaten (detailed) | `x`, `y`, `score`, `length` |
| `snake:collision` | Collision detected | `type`, `x`, `y` |
| `snake:direction` | Direction changed | `direction`, `previousDirection?` |
| `snake:speed` | Speed increased | `speed`, `previousSpeed?` |

---

### Asteroids

| Event | Description | Payload |
|-------|-------------|---------|
| `app:asteroids:game:start` | Game started | `appId`, `windowId` |
| `app:asteroids:level:up` | Level up | `appId`, `windowId` |
| `app:asteroids:score:updated` | Score updated | `appId`, `windowId` |
| `app:asteroids:game:over` | Game over | `appId`, `windowId` |
| `app:asteroids:asteroid:destroy` | Asteroid destroyed | `appId`, `windowId` |
| `app:asteroids:ufo:spawn` | UFO spawned | `appId`, `windowId` |
| `app:asteroids:ufo:destroy` | UFO destroyed | `appId`, `windowId` |
| `app:asteroids:powerup:spawn` | Power-up spawned | `appId`, `windowId` |
| `app:asteroids:powerup:collect` | Power-up collected | `appId`, `windowId` |
| `app:asteroids:ship:explode` | Ship exploded | `appId`, `windowId` |
| `app:asteroids:combo` | Combo achieved | `appId`, `windowId` |
| `asteroids:asteroid:destroy` | Asteroid destroyed (detailed) | `size`, `points`, `x`, `y`, `combo?` |
| `asteroids:ufo:spawn` | UFO spawned (detailed) | `type?` |
| `asteroids:ufo:destroy` | UFO destroyed (detailed) | `points` |
| `asteroids:powerup:spawn` | Power-up spawned (detailed) | `type`, `x`, `y` |
| `asteroids:powerup:collect` | Power-up collected (detailed) | `type`, `duration?` |
| `asteroids:powerup:expire` | Power-up expired | `type` |
| `asteroids:ship:explode` | Ship exploded (detailed) | `livesRemaining`, `x`, `y` |
| `asteroids:combo` | Combo updated | `combo`, `multiplier` |

**Example:**
```retro
on asteroids:powerup:collect {
    print "Power-up: " + $event.type + " for " + $event.duration + "ms"
}

on asteroids:combo {
    if $event.combo >= 10 {
        emit notification:show title="MEGA COMBO!" message=$event.combo + "x multiplier!"
    }
}
```

---

### Solitaire

| Event | Description | Payload |
|-------|-------------|---------|
| `app:solitaire:game:start` | Game started | `appId`, `windowId` |
| `app:solitaire:card:moved` | Card moved | `appId`, `windowId` |
| `app:solitaire:game:won` | Game won | `appId`, `windowId` |
| `solitaire:game:type` | Variant selected | `gameType`, `drawCount`, `scoring` |
| `solitaire:card:move` | Card moved (detailed) | `card`, `from`, `to`, `moves` |
| `solitaire:stock:draw` | Card(s) drawn from stock | `cards[]`, `drawCount`, `stockRemaining` |
| `solitaire:stock:recycle` | Waste pile recycled | `cardsRecycled` |
| `solitaire:foundation:add` | Card to foundation | `card`, `foundation`, `count` |
| `solitaire:undo` | Undo performed | `moveType`, `moves`, `score` |
| `solitaire:win` | Game won (detailed) | `moves`, `time`, `gameType?` |
| `solitaire:invalid:move` | Invalid move attempted | `card`, `from`, `to`, `reason?` |

---

### FreeCell

| Event | Description | Payload |
|-------|-------------|---------|
| `freecell:card:move` | Card moved | `card`, `from`, `to`, `moves` |
| `freecell:cell:occupy` | Free cell occupied | `card`, `cell`, `freeCellsRemaining` |
| `freecell:foundation:add` | Card to foundation | `card`, `foundation`, `count` |
| `freecell:undo` | Move undone | `card`, `moves` |
| `freecell:win` | Game won | `moves`, `time` |

---

### SkiFree

| Event | Description | Payload |
|-------|-------------|---------|
| `app:skifree:game:start` | Game started | `appId`, `windowId` |
| `app:skifree:score:updated` | Score updated | `appId`, `windowId` |
| `app:skifree:yeti:appeared` | Yeti appeared | `appId`, `windowId` |
| `app:skifree:game:over` | Game over | `appId`, `windowId` |
| `skifree:distance` | Distance updated | `distance`, `delta?` |
| `skifree:obstacle:hit` | Obstacle collision | `type`, `x`, `y` |
| `skifree:jump` | Player jumped | `x`, `y`, `points?` |
| `skifree:yeti:spawn` | Yeti spawned | `distance` |
| `skifree:yeti:caught` | Player caught by yeti | `distance`, `score` |

---

### Zork

| Event | Description | Payload |
|-------|-------------|---------|
| `app:zork:command:entered` | Command entered | `appId`, `windowId`, `command` |
| `app:zork:room:changed` | Room changed | `appId`, `windowId`, `room` |
| `app:zork:item:taken` | Item taken | `appId`, `windowId`, `item` |
| `app:zork:item:dropped` | Item dropped | `appId`, `windowId`, `item` |
| `app:zork:score:changed` | Score changed | `appId`, `windowId`, `score` |
| `app:zork:game:over` | Game over | `appId`, `windowId` |

---

## System Events

| Event | Description | Payload |
|-------|-------------|---------|
| `system:boot` | Boot sequence started | `timestamp`, `phase?` |
| `system:boot:phase` | Boot phase changed | `phase`, `phaseNumber`, `totalPhases`, `phaseName?` |
| `system:ready` | System fully initialized | `timestamp`, `bootTime?` |
| `system:shutdown` | System shutting down | `reason?` |
| `system:screensaver:start` | Screensaver activated | `mode?` |
| `system:screensaver:end` | Screensaver deactivated | *(none)* |
| `system:idle` | User inactive | `idleTime`, `threshold` |
| `system:active` | User activity detected | `idleDuration` |
| `system:sleep` | System entering sleep | `reason?` |
| `system:wake` | System waking from sleep | `sleepDuration?` |
| `system:error` | System-level error | `error`, `code?`, `source?`, `fatal?`, `stack?` |
| `system:warning` | System warning | `message`, `code?`, `source?` |
| `system:memory:warning` | Memory threshold exceeded | `usage`, `limit`, `percentage` |
| `system:storage:warning` | Storage space low | `used`, `total`, `percentage` |
| `system:storage:full` | Storage is full | `used`, `total` |
| `system:focus` | Browser tab gained focus | *(none)* |
| `system:blur` | Browser tab lost focus | *(none)* |
| `system:visibility:change` | Page visibility changed | `visible`, `state` |
| `system:online` | Network restored | *(none)* |
| `system:offline` | Network lost | *(none)* |
| `system:resize` | Viewport resized | `width`, `height`, `previousWidth?`, `previousHeight?` |
| `system:fullscreen:enter` | Entered fullscreen | `element?` |
| `system:fullscreen:exit` | Exited fullscreen | *(none)* |

**Example:**
```retro
on system:ready {
    print "System booted in " + $event.bootTime + "ms"
    emit notification:show title="Welcome" message="RetroOS is ready!"
}
```

---

## UI Events

| Event | Description | Payload |
|-------|-------------|---------|
| `ui:menu:start:open` | Start menu opened | *(none)* |
| `ui:menu:start:close` | Start menu closed | *(none)* |
| `ui:menu:start:toggle` | Start menu toggled | *(none)* |
| `ui:menu:context:show` | Context menu shown | `x`, `y`, `type`, `icon?`, `windowId?`, `item?`, `currentPath?` |
| `ui:menu:context:hide` | Context menu hidden | *(none)* |
| `ui:menu:action` | Menu action triggered | `action`, `data?` |
| `ui:taskbar:update` | Taskbar update needed | *(none)* |
| `taskbar:update` | Taskbar refresh | *(none)* |

---

## Desktop Events

| Event | Description | Payload |
|-------|-------------|---------|
| `desktop:render` | Desktop needs re-render | *(none)* |
| `desktop:refresh` | Desktop refresh requested | *(none)* |
| `desktop:arrange` | Arrange desktop icons | `mode?` |
| `desktop:bg-change` | Background changed | `color?`, `wallpaper?` |
| `desktop:settings-change` | Desktop settings changed | `bgColor?`, `wallpaper?`, `iconSize?`, `textColor?` |

---

## Icon Events

| Event | Description | Payload |
|-------|-------------|---------|
| `icon:click` | Icon single-clicked | `iconId`, `appId?` |
| `icon:dblclick` | Icon double-clicked | `iconId`, `appId?` |
| `icon:move` | Icon moved on desktop | `iconId`, `x`, `y` |
| `icon:delete` | Icon deleted | `iconId` |

---

## Sound & Audio Events

| Event | Description | Payload |
|-------|-------------|---------|
| `sound:play` | Play system sound | `type`, `volume?` |
| `sound:volume` | Volume changed | `volume` |
| `audio:play` | Start audio playback | `url`, `title?` |
| `audio:pause` | Pause audio | *(none)* |
| `audio:resume` | Resume audio | *(none)* |
| `audio:stop` | Stop audio | *(none)* |
| `audio:stopall` | Stop all audio | *(none)* |
| `audio:ended` | Playback finished | `url?` |
| `audio:error` | Playback error | `error`, `url?` |
| `audio:loaded` | Audio file loaded | `url`, `duration?` |
| `audio:timeupdate` | Playback time update | `currentTime`, `duration` |

**Example:**
```retro
emit sound:play type="notify"
emit sound:play type="error" volume=0.8
```

---

## Filesystem Events

| Event | Description | Payload |
|-------|-------------|---------|
| `fs:file:create` | File created | `path`, `type`, `content?` |
| `fs:file:update` | File updated | `path`, `content` |
| `fs:file:delete` | File deleted | `path` |
| `fs:file:read` | File read | `path`, `size?` |
| `fs:file:rename` | File renamed | `oldPath`, `newPath`, `oldName`, `newName` |
| `fs:file:move` | File moved | `sourcePath`, `destPath`, `fileName` |
| `fs:file:copy` | File copied | `sourcePath`, `destPath`, `fileName` |
| `fs:directory:create` | Directory created | `path` |
| `fs:directory:delete` | Directory deleted | `path`, `recursive?` |
| `fs:directory:rename` | Directory renamed | `oldPath`, `newPath`, `oldName`, `newName` |
| `fs:directory:open` | Directory browsed | `path`, `itemCount?` |
| `fs:directory:move` | Directory moved | `sourcePath`, `destPath`, `fileName`, `itemType` |
| `fs:directory:copy` | Directory copied | `sourcePath`, `destPath`, `fileName`, `itemType` |
| `fs:error` | Filesystem error | `operation`, `path`, `error`, `code?` |
| `fs:permission:denied` | Permission denied | `operation`, `path` |
| `fs:watch:change` | Watched path changed | `path`, `changeType`, `fileName?` |
| `filesystem:changed` | General filesystem change | `path?`, `type?` |
| `filesystem:directory:changed` | Directory contents changed | `path` |
| `filesystem:file:changed` | File content changed | `path` |

---

## Dialog Events

| Event | Description | Payload |
|-------|-------------|---------|
| `dialog:alert` | Show alert dialog | `message`, `title?`, `icon?`, `requestId?` |
| `dialog:alert:response` | Alert dismissed | `requestId`, `acknowledged?` |
| `dialog:confirm` | Show confirmation dialog | `message`, `title?`, `confirmText?`, `cancelText?`, `requestId?` |
| `dialog:confirm:response` | Confirmation answered | `requestId`, `confirmed` |
| `dialog:prompt` | Show input prompt | `message`, `title?`, `defaultValue?`, `placeholder?`, `requestId?` |
| `dialog:prompt:response` | Prompt answered | `requestId`, `value?`, `cancelled` |
| `dialog:file-open` | Show file open dialog | `title?`, `filter?`, `directory?`, `requestId?` |
| `dialog:file-open:response` | File selected | `requestId`, `path?`, `cancelled` |
| `dialog:file-save` | Show save dialog | `title?`, `defaultName?`, `filter?`, `directory?`, `requestId?` |
| `dialog:file-save:response` | Save path selected | `requestId`, `path?`, `cancelled` |

**Example:**
```retro
emit dialog:alert message="Hello World!" title="Greeting"
emit dialog:confirm message="Delete this file?" title="Confirm"
```

---

## Notification Events

| Event | Description | Payload |
|-------|-------------|---------|
| `notification:show` | Show notification toast | `message`, `title?`, `type?`, `duration?`, `icon?` |
| `notification:dismiss` | Dismiss notification | `id?` |

**Example:**
```retro
emit notification:show title="Alert" message="Something happened!" type="warning" duration=5000
```

---

## Clipboard Events

| Event | Description | Payload |
|-------|-------------|---------|
| `clipboard:copy` | Content copied | `content`, `type?` |
| `clipboard:paste` | Paste requested | `target?` |
| `clipboard:changed` | Clipboard changed | `items?`, `source?` |
| `clipboard:cut-state` | Cut state changed | `paths?`, `active?` |

---

## Keyboard & Input Events

| Event | Description | Payload |
|-------|-------------|---------|
| `keyboard:shortcut` | Keyboard shortcut triggered | `key`, `ctrl?`, `alt?`, `shift?`, `meta?` |
| `keyboard:keydown` | Key pressed | `key`, `code`, `ctrl`, `alt`, `shift`, `meta`, `repeat`, `target?` |
| `keyboard:keyup` | Key released | `key`, `code`, `ctrl`, `alt`, `shift`, `meta`, `target?` |
| `keyboard:input` | Text input received | `data`, `inputType?`, `target?` |
| `keyboard:combo` | Key combination pressed | `combo`, `keys`, `handled?` |

---

## Mouse Events

| Event | Description | Payload |
|-------|-------------|---------|
| `mouse:move` | Mouse moved | `x`, `y`, `deltaX?`, `deltaY?`, `target?` |
| `mouse:click` | Mouse clicked | `x`, `y`, `button`, `target?`, `targetType?` |
| `mouse:dblclick` | Mouse double-clicked | `x`, `y`, `button`, `target?` |
| `mouse:down` | Mouse button pressed | `x`, `y`, `button`, `target?` |
| `mouse:up` | Mouse button released | `x`, `y`, `button`, `target?` |
| `mouse:contextmenu` | Right-click | `x`, `y`, `target?`, `targetType?` |
| `mouse:scroll` | Mouse wheel scrolled | `deltaX`, `deltaY`, `deltaZ?`, `x`, `y`, `target?` |
| `mouse:enter` | Mouse entered element | `target`, `targetType?`, `x`, `y` |
| `mouse:leave` | Mouse left element | `target`, `targetType?`, `x`, `y` |

---

## Touch & Gesture Events

### Touch Events

| Event | Description | Payload |
|-------|-------------|---------|
| `touch:start` | Touch started | `touches`, `x`, `y`, `target?` |
| `touch:move` | Touch moved | `touches`, `x`, `y`, `deltaX?`, `deltaY?`, `target?` |
| `touch:end` | Touch ended | `touches`, `x`, `y`, `target?` |
| `touch:cancel` | Touch cancelled | `touches`, `target?` |

### Gesture Events

| Event | Description | Payload |
|-------|-------------|---------|
| `gesture:tap` | Tap detected | `x`, `y`, `target?` |
| `gesture:doubletap` | Double tap | `x`, `y`, `target?` |
| `gesture:longpress` | Long press | `x`, `y`, `duration`, `target?` |
| `gesture:swipe` | Swipe detected | `direction`, `startX`, `startY`, `endX`, `endY`, `velocity`, `target?` |
| `gesture:pinch` | Pinch gesture | `scale`, `centerX`, `centerY`, `target?` |
| `gesture:rotate` | Rotation gesture | `angle`, `centerX`, `centerY`, `target?` |

---

## Drag & Drop Events

| Event | Description | Payload |
|-------|-------------|---------|
| `drag:start` | Drag started | `itemId`, `itemType`, `x`, `y` |
| `drag:move` | Item being dragged | `itemId`, `x`, `y` |
| `drag:end` | Drag ended | `itemId`, `x`, `y`, `target?` |

---

## Feature & Plugin Events

### Feature Lifecycle

| Event | Description | Payload |
|-------|-------------|---------|
| `feature:initialize` | Feature initializing | `featureId`, `config?` |
| `feature:ready` | Feature finished init | `featureId` |
| `feature:enable` | Feature enable requested | `featureId` |
| `feature:enabled` | Feature was enabled | `featureId` |
| `feature:disable` | Feature disable requested | `featureId` |
| `feature:disabled` | Feature was disabled | `featureId` |
| `feature:error` | Feature error | `featureId`, `error`, `fatal?` |
| `feature:config:change` | Config change command | `featureId`, `key`, `value`, `oldValue?` |
| `feature:config-changed` | Config was changed | `featureId`, `key`, `value` |
| `feature:config-reset` | Config reset to defaults | `featureId` |
| `feature:registered` | Feature registered | `featureId`, `name?`, `category?` |
| `feature:unregistered` | Feature removed | `featureId`, `name` |
| `feature:dependency-failed` | Dependency failed | `featureId`, `failedDependencies` |
| `features:initialized` | All features initialized | `count?`, `features?` |
| `feature:pet:toggle` | Desktop pet toggled | *(none)* |
| `feature:pet:change` | Desktop pet changed | `petType` |
| `pet:toggle` | Pet visibility toggled | `visible?` |
| `pet:change` | Pet type changed | `petType?` |

### Plugin Lifecycle

| Event | Description | Payload |
|-------|-------------|---------|
| `plugin:load` | Plugin loading started | `pluginId`, `path?` |
| `plugin:loaded` | Plugin loaded | `pluginId`, `name`, `version?` |
| `plugin:error` | Plugin error | `pluginId`, `error` |
| `plugin:unload` | Plugin unloaded | `pluginId` |
| `plugin:unloaded` | Plugin cleaned up | `id` |
| `plugins:loaded` | All plugins loaded | `count?`, `plugins?` |

### Screensaver Control

| Event | Description | Payload |
|-------|-------------|---------|
| `screensaver:start` | Start screensaver | *(none)* |
| `screensaver:update-delay` | Delay changed | `delay` |
| `screensaver:update-type` | Type changed | `type` |

---

## Achievement Events

| Event | Description | Payload |
|-------|-------------|---------|
| `achievement:unlock` | Achievement unlocked | `achievementId`, `title`, `description?` |
| `achievement:progress` | Progress updated | `achievementId`, `current`, `target`, `percentage?` |
| `achievement:check` | Condition check triggered | `achievementId`, `condition?` |

**Example:**
```retro
on achievement:unlock {
    print "Achievement: " + $event.title
    emit sound:play type="achievement"
}
```

---

## Script & Automation Events

| Event | Description | Payload |
|-------|-------------|---------|
| `script:execute` | Execute a script | `scriptId`, `params?`, `requestId?` |
| `script:start` | Script starting | `scriptId`, `source?`, `params?` |
| `script:complete` | Script completed | `scriptId`, `requestId?`, `result?`, `error?` |
| `script:error` | Script error | `scriptId`, `requestId?`, `error`, `line?` |
| `script:output` | Script output | `message` |
| `script:statement` | Statement executed | `scriptId`, `line`, `statement`, `result?` |
| `script:variable:set` | Variable set | `scriptId`, `name`, `value`, `type?` |
| `script:function:call` | Function called | `scriptId`, `functionName`, `args?`, `result?` |
| `script:event:subscribe` | Subscribed to event | `scriptId`, `eventName` |
| `script:event:emit` | Emitted event | `scriptId`, `eventName`, `payload?` |

---

## Timer Events

| Event | Description | Payload |
|-------|-------------|---------|
| `timer:set` | Set a timer | `timerId`, `delay`, `event`, `payload?`, `repeat?` |
| `timer:clear` | Clear a timer | `timerId` |
| `timer:fired` | Timer has fired | `timerId` |

**Example:**
```retro
# One-shot timer
emit timer:set timerId="my-timer" delay=5000 event="custom:timer-done"
on custom:timer-done {
    print "Timer fired!"
}

# Repeating timer
emit timer:set timerId="heartbeat" delay=1000 event="custom:tick" repeat=true
```

---

## Macro Events

| Event | Description | Payload |
|-------|-------------|---------|
| `macro:record:start` | Start recording | `macroId?` |
| `macro:record:stop` | Stop recording | *(none)* |
| `macro:recording` | Recording state changed | `macroId`, `started` |
| `macro:recorded` | Recording completed | `macroId`, `eventCount` |
| `macro:play` | Play a macro | `macroId`, `speed?` |
| `macro:playing` | Playback started | `macroId`, `eventCount` |
| `macro:complete` | Playback finished | `macroId` |
| `macro:save` | Save a macro | `macroId`, `events` |

**Example:**
```retro
# Record a macro
emit macro:record:start macroId="my-macro"
# ... perform actions ...
emit macro:record:stop

# Play it back at 2x speed
emit macro:play macroId="my-macro" speed=2.0
```

---

## State & Settings Events

| Event | Description | Payload |
|-------|-------------|---------|
| `state:change` | State value changed | `path`, `value`, `oldValue?` |
| `setting:changed` | Setting value changed | `key`, `value`, `oldValue?` |

---

## Theme Events

| Event | Description | Payload |
|-------|-------------|---------|
| `theme:change` | Theme changed | `theme`, `previousTheme?` |
| `theme:color:change` | Theme color changed | `property`, `value`, `oldValue?` |

---

## Animation Events

| Event | Description | Payload |
|-------|-------------|---------|
| `animation:start` | Animation started | `id`, `target`, `name`, `duration?` |
| `animation:end` | Animation ended | `id`, `target`, `name` |
| `animation:cancel` | Animation cancelled | `id`, `target`, `name` |

---

## Search Events

| Event | Description | Payload |
|-------|-------------|---------|
| `search:query` | Search submitted | `query`, `scope?`, `filters?` |
| `search:results` | Results received | `query`, `results`, `count`, `duration?` |
| `search:clear` | Search cleared | *(none)* |

---

## Selection Events

| Event | Description | Payload |
|-------|-------------|---------|
| `selection:change` | Selection changed | `items`, `source?`, `selectionType?` |
| `selection:clear` | Selection cleared | `source?` |
| `selection:all` | Select all triggered | `source`, `count?` |

---

## History/Undo Events

| Event | Description | Payload |
|-------|-------------|---------|
| `history:push` | Action pushed to history | `actionType`, `data`, `description?` |
| `history:undo` | Undo performed | `actionType`, `data` |
| `history:redo` | Redo performed | `actionType`, `data` |
| `history:clear` | History cleared | `scope?` |

---

## Network Events

| Event | Description | Payload |
|-------|-------------|---------|
| `network:request` | Request initiated | `id`, `url`, `method`, `headers?` |
| `network:response` | Response received | `id`, `url`, `status`, `duration`, `size?` |
| `network:error` | Request failed | `id`, `url`, `error`, `status?` |

---

## Performance Events

| Event | Description | Payload |
|-------|-------------|---------|
| `perf:fps` | FPS update | `fps`, `frameTime?` |
| `perf:fps:low` | FPS below threshold | `fps`, `threshold` |
| `perf:memory` | Memory usage update | `usedJSHeapSize`, `totalJSHeapSize`, `jsHeapSizeLimit?` |
| `perf:longtask` | Long task detected | `duration`, `startTime`, `source?` |
| `perf:measure` | Measurement recorded | `name`, `duration`, `startMark?`, `endMark?` |

---

## Debug Events

| Event | Description | Payload |
|-------|-------------|---------|
| `debug:log` | Debug log message | `level`, `message`, `source?`, `data?` |
| `debug:breakpoint` | Script breakpoint hit | `scriptId`, `line`, `variables?` |
| `debug:step` | Script debug step | `scriptId`, `line`, `statement?` |
| `debug:variable:change` | Variable changed (debug) | `scriptId`, `name`, `value`, `oldValue?` |

---

## Feedback Events

| Event | Description | Payload |
|-------|-------------|---------|
| `feedback:toast` | Show toast notification | `message`, `type?`, `duration?`, `position?` |
| `feedback:flash` | Flash screen effect | `color?`, `duration?` |
| `feedback:shake` | Shake effect | `target?`, `intensity?` |
| `feedback:vibrate` | Vibration (mobile) | `pattern?`, `duration?` |
| `feedback:progress:start` | Progress indicator start | `id`, `message?`, `total?` |
| `feedback:progress:update` | Progress update | `id`, `current`, `total?`, `message?` |
| `feedback:progress:end` | Progress end | `id`, `success?`, `message?` |

---

## Accessibility Events

| Event | Description | Payload |
|-------|-------------|---------|
| `a11y:announce` | Screen reader announcement | `message`, `priority?` |
| `a11y:focus:change` | Focus changed | `target`, `label?` |
| `a11y:mode:change` | Accessibility mode changed | `mode`, `enabled` |

---

## Session & User Events

The canonical user-session events. Listen for these to react to login/logout/user-switch without watching individual subsystems. All four are emitted by `core/SessionManager.js` (logout/switch) and by the boot/logoff paths in `index.js` and `features/SystemDialogs.js` (login).

| Event | Description | Payload |
|-------|-------------|---------|
| `user:login` | A user has logged in. Storage is already rescoped and `StateManager.initialize()` has run. | `username`, `mode?` (`'login'` / `'signup'` / `'guest'`) |
| `user:logout` | User session ended. Realtime channels, presence, multiplayer, and the session token have already been torn down. | `reason?` (e.g. `'user_requested'`, `'logoff'`, `'auth_expired'`) |
| `user:switch` | Active user changed. Same teardown as logout has run; storage has been rescoped to the new user. | `previous?`, `next?` |
| `auth:expired` | Server returned 401. The token has been cleared; the user should be prompted to reauthenticate. | `endpoint?` |

### Analytics events (separate from session lifecycle)

| Event | Description | Payload |
|-------|-------------|---------|
| `session:start` | Analytics session started | `sessionId`, `timestamp` |
| `session:end` | Analytics session ended | `sessionId`, `duration`, `reason?` |
| `session:activity` | Activity recorded | `sessionId`, `activity`, `timestamp` |
| `user:action` | User action (analytics) | `actionType`, `target?`, `data?` |
| `user:preference:change` | Preference changed | `key`, `value`, `oldValue?` |

### Example

```retro
on user:login {
  print "Welcome, " + $event.username
  # Fetch user-scoped data, render personalized desktop, etc.
}

on user:logout {
  print "Goodbye"
  # Drop any in-memory caches that belong to the outgoing user
}

on auth:expired {
  alert "Your session has expired. Please log in again."
}
```

---

## Channel Events

Channels provide scoped, isolated communication between components.

| Event | Description | Payload |
|-------|-------------|---------|
| `channel:message` | Message on channel | `channel`, `message`, `sender?` |
| `channel:subscribe` | Subscribed to channel | `channel`, `subscriber` |
| `channel:unsubscribe` | Unsubscribed from channel | `channel`, `subscriber` |

---

## BSOD Events

| Event | Description | Payload |
|-------|-------------|---------|
| `bsod:show` | Show Blue Screen of Death | `error?`, `code?` |
| `bsod:trigger` | Trigger BSOD display | `message?` |

**Example:**
```retro
emit bsod:show error="CRITICAL_PROCESS_DIED" code="0x0000007E"
```

---

## Autoexec Events

| Event | Description | Payload |
|-------|-------------|---------|
| `autoexec:start` | Autoexec execution started | `scriptPath?` |
| `autoexec:complete` | Autoexec completed | `scriptPath?`, `success?` |
| `autoexec:error` | Autoexec failed | `scriptPath?`, `error` |

---

## DVD Bouncer Plugin Events

| Event | Description | Payload |
|-------|-------------|---------|
| `dvd-bouncer:started` | Screensaver started | `timestamp` |
| `dvd-bouncer:stopped` | Screensaver stopped | `cornerHits`, `timestamp` |

---

## Command Bus Commands

Commands execute system actions. Use via `emit command:<name>` or the `exec()` built-in.

### App Commands
| Command | Description | Payload |
|---------|-------------|---------|
| `command:app:launch` | Launch an application | `appId`, `params?` |
| `command:app:close` | Close an application | `windowId` |

### Window Commands
| Command | Description | Payload |
|---------|-------------|---------|
| `command:window:focus` | Focus a window | `windowId` |
| `command:window:minimize` | Minimize a window | `windowId` |
| `command:window:maximize` | Maximize a window | `windowId` |
| `command:window:restore` | Restore a window | `windowId` |
| `command:window:close` | Close a window | `windowId` |

### Filesystem Commands
| Command | Description | Payload |
|---------|-------------|---------|
| `command:fs:read` | Read a file | `path` |
| `command:fs:write` | Write to a file | `path`, `content` |
| `command:fs:delete` | Delete a file/dir | `path` |
| `command:fs:mkdir` | Create a directory | `path` |
| `command:fs:reset` | Reset virtual filesystem to defaults | *(none)* |

### Dialog Commands
| Command | Description | Payload |
|---------|-------------|---------|
| `command:dialog:show` | Show a dialog | `type`, `message`, `title?`, `options?` |
| `command:notification:show` | Show a notification | `message`, `title?`, `type?`, `duration?` |

### System Commands
| Command | Description | Payload |
|---------|-------------|---------|
| `command:sound:play` | Play a sound | `type`, `volume?` |
| `command:setting:set` | Change a setting | `key`, `value` |
| `command:desktop:refresh` | Refresh the desktop | *(none)* |
| `command:achievement:unlock` | Unlock achievement | `achievementId` |

### Terminal Commands
| Command | Description | Payload |
|---------|-------------|---------|
| `terminal:execute` | Execute command | `command`, `windowId?` |
| `terminal:executeSequence` | Execute multiple commands | `commands` |
| `terminal:print` | Print text | `text`, `color?` |
| `terminal:printHtml` | Print HTML | `html` |
| `terminal:clear` | Clear screen | *(none)* |
| `terminal:cd` | Change directory | `path` |
| `terminal:getPath` | Get current path | *(none)* |
| `terminal:getState` | Get terminal state | *(none)* |
| `terminal:getHistory` | Get command history | *(none)* |
| `terminal:getOutput` | Get last output | *(none)* |
| `terminal:setEnvVar` | Set env variable | `name`, `value` |
| `terminal:getEnvVar` | Get env variable | `name` |
| `terminal:getEnvVars` | Get all env vars | *(none)* |
| `terminal:createAlias` | Create alias | `name`, `command` |
| `terminal:getAliases` | Get all aliases | *(none)* |
| `terminal:enableGodMode` | Enable god mode | *(none)* |
| `terminal:startMatrix` | Start matrix effect | *(none)* |
| `terminal:runScript` | Run a script file | `scriptPath` |
| `terminal:open` | Open terminal | `initialCommand?` |
| `terminal:focus` | Focus terminal | *(none)* |
| `terminal:isOpen` | Check if terminal open | *(none)* |

### App-Specific Commands
| Command | Description | Payload |
|---------|-------------|---------|
| `command:notepad:new` | New document | `windowId?` |
| `command:notepad:open` | Open file | `windowId?`, `path` |
| `command:notepad:save` | Save document | `windowId?`, `path?` |
| `command:notepad:setText` | Set text | `windowId?`, `text` |
| `command:calculator:clear` | Clear calculator | `windowId?` |
| `command:calculator:input` | Input to calculator | `windowId?`, `value` |
| `command:terminal:execute` | Run terminal command | `windowId?`, `command` |
| `command:browser:navigate` | Navigate browser | `windowId?`, `url` |

### Action Result
| Event | Description | Payload |
|-------|-------------|---------|
| `action:result` | Command action result | `requestId`, `success`, `data?`, `error?` |

---

## Query Bus Queries

Queries retrieve system state. Emit the query event and listen for the `:response`.

| Query | Response | Description | Payload |
|-------|----------|-------------|---------|
| `query:windows` | `query:windows:response` | Get open windows | `requestId` |
| `query:apps` | `query:apps:response` | Get available apps | `requestId` |
| `query:fs:list` | `query:fs:list:response` | List directory | `path`, `requestId` |
| `query:fs:read` | `query:fs:read:response` | Read file | `path`, `requestId` |
| `query:fs:exists` | `query:fs:exists:response` | Check path exists | `path`, `requestId` |
| `query:fs:tree` | `query:fs:tree:response` | Get full virtual filesystem tree | `requestId` |
| `query:fs:desktop` | `query:fs:desktop:response` | Get desktop-resolved filesystem items | `requestId` |
| `query:settings` | `query:settings:response` | Get settings | `key?`, `requestId` |
| `query:state` | `query:state:response` | Query system state | `path`, `requestId` |
| `query:notepad:getText` | `query:notepad:getText:response` | Get Notepad text | `windowId?`, `requestId` |
| `query:calculator:getValue` | *(via action:result)* | Get Calculator value | `windowId?`, `requestId` |

---

## Built-in Functions

These functions are available in RetroScript via `call functionName(args)`.

### System Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `sleep(ms)` | Pause execution (max 30s) | `ms`: milliseconds |
| `wait(ms)` | Alias for sleep | `ms`: milliseconds |
| `getFocusedWindow()` | Get active window info | *(none)* |
| `emitEvent(name, payload)` | Emit custom event | `name`, `payload` |
| `getWindows()` | List all open windows | *(none)* |
| `getApps()` | List all registered apps | *(none)* |
| `getEnv()` | Get system environment | *(none)* |
| `query(type, ...)` | Query system state | `type`, args... |
| `exec(command, payload)` | Execute a registered command (via `EventBus.executeCommand`) | `command`, `payload` |
| `copyToClipboard(text)` | Copy text to clipboard | `text` |
| `getStorage(key)` | Get from localStorage | `key` |
| `setStorage(key, value)` | Set in localStorage | `key`, `value` |

### Terminal Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `terminalOpen(cmd?)` | Open terminal | `initialCommand?` |
| `terminalFocus()` | Focus terminal | *(none)* |
| `terminalClose()` | Close terminal | *(none)* |
| `terminalExecute(cmd)` | Execute command | `command` |
| `terminalPrint(text, color?)` | Print to terminal | `text`, `color?` |
| `terminalClear()` | Clear terminal | *(none)* |
| `terminalGetOutput()` | Get terminal output | *(none)* |
| `terminalCd(path)` | Change directory | `path` |
| `terminalReadFile(path)` | Read file | `path` |
| `terminalWriteFile(path, content)` | Write file | `path`, `content` |
| `terminalGodMode()` | Enable god mode | *(none)* |
| `terminalMatrix()` | Enable matrix effect | *(none)* |
| `terminalCowsay(msg)` | ASCII art cow | `message` |

### String Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `upper(str)` | Convert to uppercase | `str` |
| `lower(str)` | Convert to lowercase | `str` |
| `trim(str)` | Trim whitespace | `str` |
| `split(str, delim)` | Split string | `str`, `delimiter` |
| `join(arr, sep)` | Join array to string | `array`, `separator` |
| `substring(str, start, len)` | Extract substring | `str`, `start`, `length` |
| `replace(str, find, rep)` | Replace text | `str`, `find`, `replacement` |
| `contains(str, search)` | Check if contains | `str`, `search` |
| `startsWith(str, prefix)` | Check prefix | `str`, `prefix` |
| `endsWith(str, suffix)` | Check suffix | `str`, `suffix` |
| `indexOf(str, search)` | Find index | `str`, `search` |
| `repeat(str, count)` | Repeat string | `str`, `count` |
| `reverse(str)` | Reverse string | `str` |
| `length(str)` | Get string length | `str` |

### Array Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `length(arr)` | Get array length | `array` |
| `push(arr, item)` | Add to end | `array`, `item` |
| `pop(arr)` | Remove from end | `array` |
| `shift(arr)` | Remove from front | `array` |
| `unshift(arr, item)` | Add to front | `array`, `item` |
| `slice(arr, start, end)` | Extract slice | `array`, `start`, `end` |
| `indexOf(arr, item)` | Find index | `array`, `item` |
| `includes(arr, item)` | Check contains | `array`, `item` |
| `reverse(arr)` | Reverse array | `array` |
| `sort(arr)` | Sort array | `array` |
| `unique(arr)` | Remove duplicates | `array` |
| `flatten(arr, depth)` | Flatten nested | `array`, `depth` |
| `join(arr, sep)` | Join elements | `array`, `separator` |
| `range(start, end, step)` | Create number range | `start`, `end`, `step` |
| `repeat(arr, count)` | Repeat array | `array`, `count` |

### Math Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `abs(n)` | Absolute value | `n` |
| `floor(n)` | Round down | `n` |
| `ceil(n)` | Round up | `n` |
| `round(n)` | Round nearest | `n` |
| `min(a, b)` | Minimum | `a`, `b` |
| `max(a, b)` | Maximum | `a`, `b` |
| `sqrt(n)` | Square root | `n` |
| `pow(a, b)` | Power | `a`, `b` |

### Object Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `keys(obj)` | Get object keys | `obj` |
| `values(obj)` | Get object values | `obj` |
| `entries(obj)` | Get key-value pairs | `obj` |
| `hasKey(obj, key)` | Check key exists | `obj`, `key` |
| `get(obj, key)` | Get property | `obj`, `key` |
| `set(obj, key, value)` | Set property | `obj`, `key`, `value` |

### Type Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `type(value)` | Get value type | `value` |
| `isNull(value)` | Check if null | `value` |
| `isUndefined(value)` | Check if undefined | `value` |
| `isNumber(value)` | Check if number | `value` |
| `isString(value)` | Check if string | `value` |
| `isBoolean(value)` | Check if boolean | `value` |
| `isArray(value)` | Check if array | `value` |
| `isObject(value)` | Check if object | `value` |

### Time Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `timestamp()` | Current timestamp (ms) | *(none)* |
| `now()` | Current date/time | *(none)* |
| `formatDate(ts, fmt)` | Format date | `timestamp`, `format` |
| `parseDate(str)` | Parse date string | `dateString` |

### JSON Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `toJSON(value)` | Convert to JSON string | `value` |
| `parseJSON(str)` | Parse JSON string | `jsonString` |

### Dialog Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `alert(title, msg)` | Show alert dialog | `title`, `message` |
| `confirm(title, msg)` | Show confirm dialog | `title`, `message` |
| `prompt(title, msg, default?)` | Show input dialog | `title`, `message`, `defaultValue?` |

### Debug Functions
| Function | Description | Arguments |
|----------|-------------|-----------|
| `log(msg)` | Console log | `message` |
| `logError(msg)` | Console error | `message` |
| `debug(label, value)` | Debug output | `label`, `value` |

---

## Legacy Event Mapping (deprecated)

> ⚠️ **Do not use these names in new scripts.** They are auto-rewritten to the semantic names below for backwards compatibility, but the mapping table is on the roadmap for removal (see `docs/UNIFIED_ROADMAP.md`). Grepping for the new names will not find usages that use the legacy form.

| Legacy Name (avoid) | Use Instead |
|-------------|---------|
| `startmenu:toggle` | `ui:menu:start:toggle` |
| `contextmenu:show` | `ui:menu:context:show` |
| `contextmenu:hide` | `ui:menu:context:hide` |
| `taskbar:update` | `ui:taskbar:update` |
| `menu:action` | `ui:menu:action` |
| `boot:complete` | `system:ready` |
| `screensaver:end` | `system:screensaver:end` |
| `pet:toggle` | `feature:pet:toggle` |
| `pet:change` | `feature:pet:change` |

---

## Safety Limits

RetroScript enforces these limits to prevent runaway scripts:

| Limit | Value |
|-------|-------|
| Maximum loop iterations | 10,000 |
| Maximum event handlers | 1,000 |
| Execution timeout | 30,000ms |
| Call stack depth | 100 levels |
| Sleep/wait maximum | 30,000ms |

---

## Quick Reference: Event Naming Convention

Events follow the pattern: `namespace:action` or `namespace:category:action`

| Pattern | Examples |
|---------|----------|
| `namespace:action` | `window:open`, `sound:play`, `desktop:refresh` |
| `namespace:sub:action` | `window:move:start`, `system:screensaver:end` |
| `app:appId:action` | `app:notepad:saved`, `app:calculator:input` |
| `command:target:action` | `command:app:launch`, `command:fs:write` |
| `query:target:property` | `query:windows`, `query:fs:list` |
| Wildcard | `window:*`, `app:*`, `*` |

---

## Complete App Registry

All 37 scriptable applications:

| App ID | Name | Category |
|--------|------|----------|
| `adminpanel` | Admin Panel | system |
| `asteroids` | Asteroids | games |
| `browser` | Browser | internet |
| `calculator` | Calculator | accessories |
| `calendar` | Calendar | accessories |
| `chatroom` | ChatRoom | internet |
| `clock` | Clock | accessories |
| `controlpanel` | Control Panel | system |
| `defrag` | Defrag | system |
| `displayproperties` | Display Properties | settings |
| `doom` | Doom | games |
| `featuressettings` | Features Settings | settings |
| `findfiles` | Find Files | system |
| `freecell` | FreeCell | games |
| `helpsystem` | Help | system |
| `hypercard` | HyperCard | accessories |
| `inbox` | Inbox | internet |
| `instantmessenger` | Instant Messenger | internet |
| `mediaplayer` | Media Player | multimedia |
| `minesweeper` | Minesweeper | games |
| `mycomputer` | My Computer | system |
| `notepad` | Notepad | accessories |
| `paint` | Paint | accessories |
| `phone` | Phone | internet |
| `recyclebin` | Recycle Bin | system |
| `rundialog` | Run | system |
| `scriptrunner` | Script Runner | system |
| `skifree` | SkiFree | games |
| `snake` | Snake | games |
| `solitaire` | Solitaire | games |
| `soundsettings` | Sound Settings | settings |
| `taskmanager` | Task Manager | system |
| `terminal` | Terminal | system |
| `zork` | Zork | games |

---

## System Features

All 7 system features:

| Feature ID | Name | Description |
|------------|------|-------------|
| `achievements` | Achievement System | Tracks and unlocks achievements |
| `clippy` | Clippy Assistant | Interactive desktop assistant |
| `desktop-pet` | Desktop Pet | Interactive desktop pet |
| `easter-eggs` | Easter Eggs | Hidden features and secrets |
| `screensaver` | Screensaver | Screen saver system |
| `sound-system` | Sound System | System audio and sound effects |
| `system-dialogs` | System Dialogs | Native-style dialog windows |

---

---

## Multimedia Cue Events (Phase 2)

Media cue events for ARG multimedia orchestration. Emitted by `MultimediaBuiltins` and `MediaAssetManager`.

### Audio Cues

| Event | Description | Payload |
|-------|-------------|---------|
| `media:audio:play` | Play an audio cue | `cueId`, `assetId`, `group?`, `volume?`, `loop?`, `fadeInMs?`, `priority?` |
| `media:audio:stop` | Stop an audio cue | `cueId?`, `group?`, `fadeOutMs?` |
| `media:audio:duck` | Duck audio group volume | `group`, `level`, `durationMs` |
| `media:audio:restore` | Restore ducked group | `group` |

### Video Cues

| Event | Description | Payload |
|-------|-------------|---------|
| `media:video:play` | Play a video cue | `cueId`, `assetId`, `volume?`, `loop?`, `fullscreen?` |
| `media:video:pause` | Pause a video cue | `cueId` |
| `media:video:stop` | Stop a video cue | `cueId?` |
| `media:video:seek` | Seek video to position | `cueId`, `positionMs` |

### Image Layers

| Event | Description | Payload |
|-------|-------------|---------|
| `media:image:show` | Show image on layer | `layerId`, `assetId`, `src?`, `opacity?`, `fadeInMs?`, `position?` |
| `media:image:clear` | Clear image layer | `layerId`, `fadeOutMs?` |

### Subtitle Tracks

| Event | Description | Payload |
|-------|-------------|---------|
| `media:subtitle:show` | Show subtitle text | `trackId`, `text`, `durationMs?`, `style?`, `position?` |
| `media:subtitle:clear` | Clear subtitle track | `trackId?` |

### Visual Effects

| Event | Description | Payload |
|-------|-------------|---------|
| `media:fx:apply` | Apply visual effect | `presetId`, `intensity?`, `durationMs?` |
| `media:fx:clear` | Clear visual effect | `presetId?` |

### Cue Lifecycle

| Event | Description | Payload |
|-------|-------------|---------|
| `media:cue:start` | Cue started playback | `cueId`, `type`, `assetId` |
| `media:cue:end` | Cue ended | `cueId`, `type`, `reason?` |
| `media:cue:error` | Cue encountered error | `cueId`, `type`, `error`, `assetId?` |

### Asset Pipeline

| Event | Description | Payload |
|-------|-------------|---------|
| `media:asset:preload` | Preload request | `assetId`, `type`, `src`, `priority?` |
| `media:asset:loaded` | Asset loaded | `assetId`, `type`, `sizeBytes?` |
| `media:asset:error` | Asset load failed | `assetId`, `type`, `error` |
| `media:budget:warning` | Budget threshold hit | `metric`, `current`, `limit` |
| `media:budget:exceeded` | Budget hard limit hit | `metric`, `current`, `limit`, `rejected?` |

---

*This document is auto-generated from the RetroOS source code. Every event listed here is defined in `core/EventSchema.js` and emitted by the corresponding application, feature, or system component.*
