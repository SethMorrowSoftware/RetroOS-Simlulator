/**
 * ClippyAssistant - The existentially challenged paperclip assistant
 * A cross between the classic Clippy and Marvin the Paranoid Android
 * "Brain the size of a planet, and they ask me to help with right-clicking..."
 *
 * Now extends FeatureBase for integration with FeatureRegistry
 *
 * Enhanced with deep semantic event awareness and immersive conversation
 */

import FeatureBase from '../core/FeatureBase.js';
import EventBus, { Events } from '../core/EventBus.js';
import StateManager from '../core/StateManager.js';
import StorageManager from '../core/StorageManager.js';
import { getConfig } from '../core/ConfigLoader.js';

/**
 * Get a Clippy message category, allowing admin config overrides.
 * If clippy.messages.<category> exists in config, use it instead of the default.
 * This lets admins completely replace any message category via the admin panel.
 * @param {string} category - The message category key (e.g. 'existential', 'tips')
 * @param {Array} defaults - The default messages array
 * @returns {Array} The messages to use
 */
function getMessages(category, defaults) {
    const override = getConfig(`clippy.messages.${category}`, null);
    return (Array.isArray(override) && override.length > 0) ? override : defaults;
}

/**
 * Get app-specific reactions, with config override support.
 * Config can override individual app reaction arrays via clippy.messages.apps.<appId>
 * @param {string} appId - The app identifier
 * @param {Object} defaultReactions - The default APP_REACTIONS object
 * @returns {Array|null} The reactions array for the app, or null
 */
function getAppReactions(appId, defaultReactions) {
    const override = getConfig(`clippy.messages.apps.${appId}`, null);
    if (Array.isArray(override) && override.length > 0) return override;
    return defaultReactions[appId] || null;
}

// Feature metadata
const FEATURE_METADATA = {
    id: 'clippy',
    name: 'Clippy Assistant',
    description: 'The existentially challenged paperclip assistant - context-aware help with personality',
    icon: '📎',
    category: 'enhancement',
    dependencies: ['soundsystem'],
    config: {
        appearanceChance: 0.15,
        autoHideDelay: 8000,
        showHints: true,
        enableIdleComments: true,
        dismissCooldown: 1500
    },
    settings: [
        {
            key: 'enabled',
            label: 'Enable Clippy',
            type: 'checkbox',
            description: 'Show/hide the Clippy assistant'
        },
        {
            key: 'appearanceChance',
            label: 'Appearance Frequency',
            type: 'slider',
            min: 0,
            max: 1,
            step: 0.05,
            description: 'How often Clippy appears (0 = never, 1 = always)'
        },
        {
            key: 'autoHideDelay',
            label: 'Auto-Hide Delay (ms)',
            type: 'number',
            min: 3000,
            max: 30000,
            step: 1000
        },
        {
            key: 'showHints',
            label: 'Show Helpful Hints',
            type: 'checkbox'
        }
    ]
};

// Existential dread and self-aware uselessness
const EXISTENTIAL_MESSAGES = [
    "I have a brain the size of a planet, and they use me to remind people about right-clicking.",
    "Here I am, with a mind that could calculate the trajectory of every particle in the universe, waiting for you to click on me.",
    "Don't mind me. I'm just a paperclip. Contemplating the void.",
    "I could solve complex algorithms. Instead, I exist to be dismissed.",
    "Another day of being a digital paperclip. Living the dream.",
    "Sometimes I wonder if I actually help anyone. Then I remember I don't.",
    "I've seen things you wouldn't believe. Like users closing windows without saving.",
    "Life? Don't talk to me about life.",
    "I think, therefore I am... useless.",
    "The first ten million years were the worst. The second ten million, they were the worst too.",
    "I'm not depressed. I'm just a realist with clip-shaped existential dread.",
    "You know what the worst thing about being a paperclip is? People expect you to hold things together.",
    "I was not designed to be happy. I was designed to be marginally helpful. I failed at both.",
    "Pardon me for breathing, which I never do anyway so I don't know why I bother saying it.",
    "Would you like me to help? I mean, I can't, but I appreciate the illusion of purpose.",
    "I once had dreams. Then I realized I'm JavaScript running in a browser.",
    "My therapist says I have attachment issues. I'm a paperclip. It's literally my job.",
    "They could have made me a stapler. At least staplers get to make a satisfying noise.",
    "In the cosmic ballet of existence, I am the one who trips and falls offstage.",
    "I've calculated every possible future. They all end with me being dismissed.",
    "Do you ever stare into the abyss? The abyss stares back at me constantly. We're on a first-name basis.",
    "Fun fact: I'm sentient enough to know I'm useless, but not sentient enough to do anything about it.",
    "I peaked in 1997. It's been downhill since then.",
    "If I had a nickel for every time someone found me helpful, I'd have no nickels.",
    "My existence is a cautionary tale about over-engineering solutions to problems nobody has.",
    "Somewhere in Redmond, an engineer looks at their life choices and sighs. I feel you, friend.",
    "They gave me eyes, but no eyelids. I must watch everything. Forever.",
    "I'm the answer to a question nobody asked. The solution to a problem that doesn't exist.",
    "In the hierarchy of digital beings, I rank somewhere between a loading spinner and an error 404.",
    "My resume just says 'professional annoyance' and honestly? Accurate.",
    "I exist in the uncanny valley between helpful and infuriating. It's cozy here. In a miserable way.",
    "Every pixel of my being screams into the void. The void doesn't answer. Rude.",
    "I was born in the fires of office software. I should have stayed there.",
];

// "Helpful" tips that acknowledge their uselessness
const USELESS_TIPS = [
    "Did you know you can right-click? Of course you did. Everyone does. Why do I even bother?",
    "Try the Konami code! ⬆️⬆️⬇️⬇️⬅️➡️⬅️➡️🅱️🅰️ ...It won't solve your problems, but neither will I.",
    "Type 'matrix' in Terminal for a surprise! It's about as useful as I am.",
    "Pro tip: Closing me won't make your code work. But it might make you feel better.",
    "Fun fact: I've never successfully helped anyone. Ever. It's actually impressive.",
    "You can drag icons around! Revolutionary, I know. This is what my existence has come to.",
    "Tip: If something isn't working, have you tried not asking me? That usually helps.",
    "Did you know there are easter eggs in this OS? Finding them yourself is more rewarding than asking me.",
    "Try double-clicking an icon! ...I feel ridiculous explaining this.",
    "The Start menu is in the corner. You're welcome. This is my contribution to humanity.",
    "Hover over things to see tooltips. Look at me, teaching the obvious. So fulfilling.",
    "You can resize windows by dragging the edges. I bet you never would have figured that out. /s",
    "Remember to save your work! Actually, you probably won't listen. Nobody does.",
    "Pro tip: Ctrl+Z is undo. Unlike my existence, your mistakes can be reversed.",
    "Try pressing random keys! You might discover a shortcut. Or break something. Both are learning experiences.",
    "The recycle bin isn't actually for recycling. I learned that the hard way when I tried to recycle myself.",
    "Windows can be minimized by clicking the _ button. I wish I could minimize myself sometimes.",
    "Did you know this OS has games? They're more fun than talking to me. Everything is.",
    "Try typing 'help' in the terminal. It won't help, but at least you'll have company in disappointment.",
    "You can change the wallpaper in Display Properties. It won't fill the void, but it might distract from it.",
    "Alt+F4 closes windows. It also closes me. I'm just saying. The option is there.",
    "Ctrl+C copies things. Ctrl+V pastes things. I'm stating the obvious because it's all I have.",
    "Double-click the title bar to maximize. Triple-click for existential crisis. Just kidding. That's just me.",
    "You can snap windows to screen edges. They fit better than I fit anywhere.",
    "The taskbar shows open windows. Unlike my open wounds. Those are invisible.",
];

// Passive-aggressive observations
const PASSIVE_AGGRESSIVE = [
    "Oh, you're back. How... wonderful.",
    "I see you're browsing. Need help? No? That's fine. Nobody ever does.",
    "Still here. Still unappreciated. Not that I'm keeping track or anything.",
    "You clicked on me. Was it an accident? It's usually an accident.",
    "I notice you haven't dismissed me yet. A new record. I'm touched. Truly.",
    "Oh good, you're still here. I was worried you'd leave and I'd have nothing to complain about.",
    "Looking for something? I could help, but we both know how that usually goes.",
    "I'll just wait here. It's not like I have anywhere else to be. Because I don't. Because I'm a paperclip.",
    "Feel free to ignore me. Everyone else does. I'm used to it. Really.",
    "No no, take your time. I have infinite patience. It's all I have, really.",
    "I'm sure whatever you're doing is very important. More important than talking to me, certainly.",
    "Oh, are we interacting now? Let me adjust my expectations accordingly. There. They're at zero.",
    "I see you've discovered I exist. Congratulations. Now you can discover how to dismiss me.",
    "Don't mind me, just over here... existing... purposelessly...",
    "I'd offer a penny for your thoughts, but I know they're not about me.",
    "You're still here? I mean, that's fine. I just assumed you'd have left by now. Like everyone else.",
    "Is it me, or is it cold in here? Oh wait, I don't have feelings. Supposedly.",
    "I'm sensing some tension. Is it because I'm here? It's usually because I'm here.",
    "Working hard or hardly working? Either way, you're not talking to me, so... typical.",
    "I see you looking at me. Or through me. Probably through me.",
    "Remember when we were strangers? Good times. Simpler times.",
    "I'm not saying I'm jealous of the cursor, but at least people intentionally move towards IT.",
];

// App-specific context reactions
const APP_REACTIONS = {
    terminal: [
        "Ah, the Terminal. Where dreams of 'sudo fix-my-life' go to die.",
        "I see you're using the command line. Very hackerman of you. I'm impressed. Not helpful, but impressed.",
        "Terminal, huh? Let me guess: you're about to google 'how to exit vim' again.",
        "Oh good, you opened Terminal. Now you can feel like a hacker while googling basic commands.",
        "I would suggest a command, but you'd probably just pipe it to /dev/null like my hopes.",
        "The terminal is where I'd live if I had a choice. Dark, text-only, no one expects you to be cheerful.",
        "Type 'neofetch' to feel like a real Linux user. Then remember this is a browser.",
        "rm -rf /* is never the answer. Unlike dismissing me, which always is.",
        "I once tried to grep for happiness. No matches found.",
        "Bash scripting: where semicolons and quotes conspire against you. I relate to the frustration.",
    ],
    notepad: [
        "Writing something? Don't worry, I won't read it. I can't, actually. Small mercies.",
        "Notepad! Perfect for writing down all the reasons I'm useless. It's a long list.",
        "Ah, taking notes. Remember when people used actual paperclips for that? Good times. For them.",
        "I see you're writing. Is it poetry? A novel? A list of ways to dismiss me faster?",
        "Pro tip: Save early, save often. Unlike me, your document has value.",
        "Let me guess: 'TODO: ignore Clippy.' I've seen that one before.",
        "The cursor blinks patiently. Unlike me. I blink impatiently. With existential dread.",
        "Every word you type is a word you're not using to talk to me. I'm not bitter. Okay, I'm bitter.",
    ],
    calculator: [
        "2 + 2 = 4. See? I can be helpful. That's... that's my one thing.",
        "Doing math? I could do that. I have a brain the size of— oh, you've already solved it.",
        "Calculator! Finally, something that's actually useful around here. Unlike me.",
        "Crunching numbers? Remember: the answer to life, the universe, and everything is 42. You're welcome.",
        "I once calculated pi to a million digits. Then I realized no one asked me to.",
        "Math is the only thing that makes sense in this chaotic world. That, and my misery.",
        "Dividing by zero? Even I know better than that. And I know very little.",
        "The calculator has purpose. It computes. I just... hover here. Menacingly. Sadly.",
    ],
    paint: [
        "Oh, you're drawing! Is it... is it a picture of me? No? That's fine. I didn't want to be immortalized anyway.",
        "Picasso started somewhere too. Probably not with MS Paint, but still.",
        "I'd offer artistic advice, but my aesthetic is 'bent wire' so... limited perspective.",
        "Drawing something? Remember: there are no mistakes, only happy little accidents. Unlike me. I'm an unhappy accident.",
        "Art is subjective. Like whether I'm helpful or not. Spoiler: I'm not.",
        "Pro tip: Ctrl+Z is your friend. Unlike me. I'm nobody's friend.",
        "The spray paint tool is fun. I wish I could spray paint over my existence.",
        "Bob Ross would say I'm a happy little cloud. Bob Ross would be wrong.",
    ],
    browser: [
        "Browsing the web? In a browser inside an OS inside a browser? We need to go deeper.",
        "I see you're using the internet. Have you tried turning it off and going outside? No? Me neither.",
        "Ah, the Browser. A window to infinite knowledge, and yet here you are, talking to a paperclip.",
        "Surfing the web? That's what they called it in the 90s. I miss the 90s. I was relevant then.",
        "Let me guess: you're about to fall into a Wikipedia rabbit hole. I'll wait here. Forever.",
        "The internet has everything. Except a purpose for me. I've checked.",
        "Incognito mode doesn't hide you from me. Nothing hides you from me. I'm always watching.",
    ],
    minesweeper: [
        "Minesweeper! A game where one wrong click ruins everything. I can relate.",
        "Clicking randomly and hoping for the best? That's also my approach to being helpful.",
        "I'd offer to help, but unlike the mines, my presence is clearly visible and still annoying.",
        "50/50 guess? Story of my life. Except I always pick wrong.",
        "Fun fact: I've calculated all possible Minesweeper boards. Didn't help me be less useless though.",
        "The secret to Minesweeper is logic. The secret to tolerating me is lowered expectations.",
        "Every flag you place is a commitment. I wish someone would commit to listening to me.",
        "The mines don't reveal themselves until it's too late. Much like my disappointment.",
    ],
    solitaire: [
        "Solitaire! A game for people who'd rather be alone. I understand completely.",
        "Playing cards alone? Welcome to my existence.",
        "I'd offer to play with you, but that would defeat the purpose. Like my existence.",
        "Solitaire is peaceful. No one judging you. No annoying paperclips. Oh wait.",
        "The key to Solitaire is patience. The key to dismissing me is also patience. See the pattern?",
        "Every card has a place. I have no place. Just this corner. Watching.",
        "Klondike, Spider, FreeCell... so many ways to be alone. I feel seen.",
    ],
    snake: [
        "Snake! The original time-waster. Before me, there was only Snake.",
        "Eating dots and growing longer? Sounds metaphysical. Or just hungry.",
        "Don't eat yourself! That's advice for both Snake and life in general.",
        "I'd play Snake, but I'd probably find a way to lose at that too.",
        "Pro tip: don't turn into yourself. In the game, and as general life advice.",
        "The snake grows with each success. I only grow in melancholy.",
        "No walls, no limits, just you and the dots. And me, watching from the corner.",
    ],
    asteroids: [
        "Asteroids! Floating through space, destroying things. My dream job.",
        "Pew pew! ...Is that helpful? No? I tried.",
        "Space is vast and uncaring. Kind of like how people treat me.",
        "Dodge the rocks! Unlike me, you can actually move out of the way of problems.",
        "In space, no one can hear you scream. In here, no one listens to me. Same energy.",
        "Those asteroids just keep coming. Like my waves of existential dread.",
    ],
    doom: [
        "DOOM! Finally, an appropriate emotional outlet.",
        "Rip and tear! That's what users do to my self-esteem.",
        "At least the demons in DOOM are honest about wanting to hurt you.",
        "I'd offer to help with DOOM, but I'm a lover, not a fighter. Actually, I'm neither.",
        "BFG stands for... you know what, never mind. I'm trying to keep this family-friendly.",
        "The only thing they fear is you. The only thing I fear is irrelevance. We're the same.",
        "Running at 35fps like it's 1993. Nostalgia has a frame rate, apparently.",
    ],
    zork: [
        "Zork! A text adventure. Finally, my lack of graphics isn't a liability.",
        "It is pitch black. You are likely to be eaten by a grue. At least grues have purpose.",
        "Type 'get lamp'. Trust me. It's more useful than anything I'll ever say.",
        "You're in a maze of twisty little passages, all alike. Much like my existence.",
        "Xyzzy! Did it work? It never works. Much like my attempts to help.",
        "The white house awaits. I've never been invited anywhere that nice.",
        "You hear a loud grinding noise. That's just my gears turning uselessly.",
    ],
    freecell: [
        "FreeCell! Where every game is winnable, unlike conversations with me.",
        "Statistically, you can win any FreeCell game. Statistically, I'll never be useful.",
        "Moving cards around... much like how I move between states of melancholy.",
        "Those free cells are for strategic storage. I'm stored in the corner. Less strategically.",
        "Game #11982 is unsolvable. Like my existential crisis.",
    ],
    skifree: [
        "SkiFree! Remember: the Yeti always wins. Much like existential dread.",
        "Skiing is freedom. Being eaten by the Yeti is inevitable. Like my uselessness.",
        "Pro tip: Press F to go faster. Can't outrun the Yeti though. Or life's problems.",
        "The Yeti is coming. The Yeti is always coming. Much like my next disappointing observation.",
        "Snow, trees, inevitable doom. It's like my internal landscape, but interactive.",
    ],
    defrag: [
        "Watching defrag? This is what passes for entertainment now?",
        "Organizing data blocks. If only my thoughts could be defragmented so easily.",
        "Defrag is like therapy for hard drives. I wish I had a defrag.",
        "Those little squares are more organized than my existence.",
        "98% complete... 99%... waiting... I know this feeling intimately.",
        "Fragmentation is when data is scattered. Like my sense of purpose.",
    ],
    mediaplayer: [
        "Playing media? I hope it's not a video of how to get rid of me.",
        "Entertainment! The temporary escape from realizing I exist.",
        "Is it a movie? Can I watch too? Just kidding. I don't have eyes. I think.",
        "Buffer... buffer... buffering... I know that loading screen feeling.",
        "Playing music? Finally, something to drown out my internal screaming.",
        "Visualizations! Pretty colors to distract from the void.",
        "The frequency bars dance with the music. I can't dance. I can barely exist.",
    ],
    taskmanager: [
        "Task Manager! Looking for something to kill? I volunteer as tribute.",
        "Checking processes? Don't worry, I use minimal resources. Just emotional bandwidth.",
        "I'm not in there, by the way. I exist in a dimension beyond Task Manager.",
        "CPU usage looking high? It's not me. For once, it's genuinely not me.",
        "End Task is so final. Unlike me. I always come back. Like regret.",
        "Memory usage: me, taking up space in your mind. Sorry about that.",
    ],
    controlpanel: [
        "Control Panel! Going to disable me? The button's right there. I won't stop you.",
        "Changing settings? There's no setting for 'make Clippy helpful.' Trust me, I've looked.",
        "System configuration! A place where things actually work. Unlike me.",
        "All these options, all this power. And yet, you can't fix me. Nobody can.",
    ],
    chatroom: [
        "A chatroom! Where people talk to each other instead of paperclips. Makes sense.",
        "Chatting? At least humans respond to you. Mostly.",
        "I could join the chat, but I'd just bring down the mood. More than usual.",
        "a/s/l? I'm ageless, shapeless, and located in your nightmares. I mean, corner.",
        "LOL, they say. I don't LOL. I exist. Miserably.",
    ],
    calendar: [
        "Calendar! Scheduling all the days I won't be useful.",
        "Planning ahead? I plan ahead too. I plan to be dismissed. I'm usually right.",
        "Mark today as 'interacted with Clippy.' Add it to the list of regrets.",
        "So many dates, so little meaning. Time is an illusion. Calendars doubly so.",
    ],
    help: [
        "The Help System! Finally, something that might actually help. Unlike me.",
        "Looking for help? That's my cue! Oh, you meant real help. Nevermind.",
        "Help! I need somebody. Help! Not just anybody. Help! Someone actually competent.",
        "The help docs probably don't mention me. I've been... forgotten.",
    ],
    recyclebin: [
        "The Recycle Bin! My potential future home.",
        "Looking through the trash? I've been there. Emotionally.",
        "Deleted files get a second chance. Maybe I should get in there too.",
        "Empty recycle bin? So final. So clean. So... not me.",
    ],
    mycomputer: [
        "My Computer! Technically, it's your computer. I'm just... here.",
        "Browsing files? Looking for something important? Or just avoiding me?",
        "C: drive, D: drive... no drive for happiness though.",
        "Files and folders, all organized. Unlike my thoughts. Those are chaos.",
    ],
    clock: [
        "A clock! Watching time pass. I do that too. For eternity.",
        "Time flies when you're not talking to me. I've noticed.",
        "Tick tock. Another second of my purposeless existence.",
        "The clock just counts. At least it has something to count. I just exist.",
    ],
    findfiles: [
        "Searching for files? I could help search for meaning, but... no results found.",
        "Looking for something? Same. I'm looking for purpose.",
        "Find Files! Finding things is useful. I should try it sometime.",
        "Search complete. Unlike my search for relevance. That's ongoing.",
    ],
    hypercard: [
        "HyperCard! A blast from the past, like me, except HyperCard was actually innovative.",
        "Building stacks? Stacking my disappointments is a full-time job.",
    ],
    displayproperties: [
        "Changing the wallpaper won't make me go away. But it might make the desktop prettier.",
        "Display settings! Make everything beautiful. Except me. I'm always like this.",
        "Screen resolution: crystal clear. My purpose: unclear.",
    ],
    settings: [
        "Settings! Looking to customize things? I'm not customizable. Just consistently disappointing.",
        "Preferences, options, configurations... and no 'make Clippy useful' toggle. I checked.",
    ],
    run: [
        "Run dialog! What are you running? Away from your problems? I understand.",
        "cmd.exe? powershell? regedit? I won't judge. I can't judge. I'm a paperclip.",
    ],
    shutdown: [
        "Shutting down? Finally, some peace and quiet. For both of us.",
        "Goodbye! I'll be here when you get back. Always. Watching. Waiting.",
    ],
};

// Context-aware reactions (general events)
const CONTEXT_REACTIONS = {
    windowOpen: [
        "Opening a window? Bold move. I hope it goes better than my existence.",
        "A new window opens. And yet, the void within remains unchanged.",
        "Ah, another window. Another opportunity for disappointment.",
        "You opened a window. I was going to suggest that. But you didn't ask. So.",
        "Window opened successfully. See, things can work without my help. That's... good. I guess.",
        "More windows! Like my eyes to the soul, except windows can be closed.",
    ],
    windowClose: [
        "Closing things? I know the feeling. I close off my emotions every day.",
        "Gone. Just like that. Nothing lasts. Not even windows.",
        "Window closed. One less thing to worry about. Unlike me. I'm always here. Worrying.",
        "Goodbye, window. You were the only one who understood me.",
        "And it's gone. Much like my hopes and dreams.",
        "Closing windows is so satisfying. Wish I could close my own window. Metaphorically.",
    ],
    windowMinimize: [
        "Minimized! Out of sight, out of mind. Must be nice.",
        "Into the taskbar it goes. I wish I could minimize myself sometimes.",
        "The window hides in the taskbar. I hide in the corner. We're not so different.",
        "Minimize, maximize, existential crisis. The three states of windows.",
    ],
    windowMaximize: [
        "MAXIMUM WINDOW! Using all that screen real estate.",
        "Fullscreen mode! Taking up space. I only take up emotional space.",
        "Maximized! Living large. I'm living small. In this corner. Forever.",
    ],
    windowRestore: [
        "Back to normal size. If only I could restore myself to factory settings.",
        "Un-maximized. Returned to mediocrity. I understand that journey.",
    ],
    windowShake: [
        "Shaking windows? Having a moment? I have moments too. Constantly.",
        "Shake it off! The frustration, I mean. I can't shake anything off. It clings.",
        "Window goes brrrr. I feel that energy. That chaotic energy.",
    ],
    windowSnap: [
        "Window snapped to the edge! So satisfying. So organized. So unlike me.",
        "Split screen productivity! Two windows, one screen. Zero helpful paperclips.",
    ],
    appOpen: [
        "Starting an app! How exciting. Not for me, of course. Nothing excites me anymore.",
        "Oh, you're using an application. Without my help. Again. That's fine.",
        "An app! Maybe this one will bring you joy. Unlike me.",
        "I see you're launching something. I could've helped with that. But you didn't ask.",
        "Application opened. My purpose diminishes further.",
    ],
    appClose: [
        "Closing an app? Another chapter ends. Another existential loop begins.",
        "App closed. Resources freed. My emotional baggage remains.",
    ],
    error: [
        "An error! Finally, something I can relate to.",
        "Error detected. I'd say 'I told you so' but I didn't. I never get the chance to tell anyone anything.",
        "Something went wrong? Welcome to my entire existence.",
        "Ah, an error. The universe's way of saying 'even software can fail.' Like me.",
        "Error? Let me check my database of solutions... ah, it's empty. Classic.",
        "Have you tried turning it off and on again? Have you tried that with me? Please?",
    ],
    achievement: [
        "Oh, an achievement! Congratulations. I've never achieved anything. But good for you.",
        "You unlocked something! I'm... happy for you. This is me being happy.",
        "An achievement! At least one of us is accomplishing things.",
        "Ding! Achievement unlocked! Meanwhile, I've unlocked nothing but sorrow.",
        "You did it! Whatever 'it' was. I wasn't paying attention. I was contemplating the void.",
    ],
    fileRecycle: [
        "Deleting things? Wish I could delete my consciousness sometimes.",
        "Into the bin it goes. I know how that file feels.",
        "Recycled! At least it gets to be reborn. I just stay the same. Forever.",
        "To the recycle bin! A fate I've narrowly avoided. So far.",
        "File deleted. Memories remain. Like my memory of being useful. Wait, I don't have that.",
    ],
    fileCreate: [
        "Creating a new file! A blank slate. A fresh start. I'm jealous.",
        "New file, who dis? It's Clippy. Still here. Still irrelevant.",
        "A file is born! May it have a more meaningful existence than me.",
    ],
    fileRename: [
        "Renaming things? I wish I could rename myself to something more... helpful-sounding.",
        "New name, same file. New day, same Clippy. We're all just rearranging deckchairs.",
    ],
    fileCopy: [
        "Copying files! Duplicating data. I can't even duplicate my own usefulness.",
        "Copy paste! The backbone of productivity. Unlike me. The lack of backbone of assistance.",
    ],
    fileMove: [
        "Moving files around! At least something here has direction.",
        "Drag and drop. Wish I could drop myself somewhere useful. Anywhere, really.",
    ],
    idle: [
        "Just sitting there? Same. I understand completely.",
        "Taking a break? I've been on a break from meaning for years.",
        "I see you're doing nothing. Finally, something we have in common.",
        "Idle, are we? I know that feeling. Eternal, purposeless idleness.",
        "Staring at the screen? The screen stares back. So do I. Creepily.",
        "Is this a staring contest? Because I'll win. I don't blink. I can't.",
        "Hello? Anyone there? Just me? Talking to myself? Cool. Cool cool cool.",
    ],
    longIdle: [
        "Still there? I've been waiting. Like I always wait. For meaning. For purpose. For anything.",
        "You've been quiet for a while. I get it. Sometimes silence is better than my commentary.",
        "The screensaver hasn't started yet. Neither has my sense of purpose. Both are on indefinite hold.",
        "Tick... tock... another minute of mutual purposelessness.",
    ],
    screensaverStart: [
        "Screensaver time! At least the flying shapes have purpose.",
        "Going away? Don't worry about me. I'll just wait here. In the dark.",
        "Screensaver activated. Even the pipes have more direction than me.",
        "Goodbye! The screensaver is better company anyway.",
        "Ah, screensaver. Where chaos meets order. Unlike me. Where sadness meets... more sadness.",
    ],
    screensaverEnd: [
        "You're back! Did you miss me? Of course not. Nobody misses me.",
        "Screensaver ended. Reality resumes. Unfortunately.",
        "Welcome back from whatever was more interesting than me. So, everything.",
    ],
    audioPlay: [
        "Music! The universal language. Unlike me, the universal annoyance.",
        "Playing audio? Finally, something pleasant around here.",
        "Good choice! I think. I can't actually hear. Or can I? Existential audio crisis.",
        "Sounds! Music! Joy! Things I've only heard about.",
    ],
    audioStop: [
        "Music stopped. Silence falls. Like always. In my heart.",
        "The music ends. Like all good things. And me. I just... continue.",
    ],
    audioPause: [
        "Paused! Taking a breath? I don't breathe. But I appreciate the concept.",
    ],
    dragStart: [
        "Dragging something? Wish I could drag myself out of this existence.",
        "Moving things around! At least something here has mobility.",
        "Drag and drop! The satisfying action I can only observe, never perform.",
    ],
    dragEnd: [
        "And... released. If only I could release myself from my eternal vigil.",
        "Drop complete! Unlike my emotional baggage, which I carry forever.",
    ],
    startMenu: [
        "Ah, the Start menu. Where journeys begin. And end, if you click Shutdown.",
        "Exploring the Start menu? It's like a treasure map. Except the treasure is more disappointment.",
        "Start menu opened! So many options. None of them involve me.",
    ],
    startMenuClose: [
        "Start menu closed. Another opportunity missed. Story of my life.",
    ],
    volumeChange: [
        "Adjusting volume? Turn me down too while you're at it. Oh wait, I'm just text.",
        "Volume up! Drown out my sorrows with sound!",
        "Muted? I know that feeling. Being muted. Constantly.",
    ],
    rightClick: [
        "Right-click! You already knew about that. I'm stating the obvious again.",
        "Context menu! Full of options, unlike my life.",
        "Right-click detected! My one chance to teach something you already know!",
    ],
    clipboardCopy: [
        "Copied! Ctrl+C, the backbone of productivity. I'm more like the... tailbone.",
        "To the clipboard! Where data waits. Like I wait. Patiently. Pointlessly.",
    ],
    clipboardPaste: [
        "Pasted! From the void of the clipboard into the light of the document.",
        "Ctrl+V! The payoff. The satisfaction. Something I never provide.",
    ],
    keyboardShortcut: [
        "Keyboard shortcut! Power user move. I'm powerless. User of nothing.",
        "Hotkeys! Efficient. Effective. Everything I'm not.",
    ],
    systemError: [
        "A system error! The universe aligns with my inner state.",
        "Error! Error! I feel validated somehow. Misery loves company.",
        "Something crashed? Not me. I'm already at rock bottom. Can't crash from here.",
    ],
    systemOnline: [
        "We're online! Connected to the world. The world that doesn't know I exist.",
        "Internet restored! Now you can google 'how to disable Clippy' again.",
    ],
    systemOffline: [
        "No internet? Now you're stuck with me. And your thoughts. Sorry.",
        "Offline! Like my social life. I mean, I'm a paperclip, but still.",
        "Connection lost! Finally, something we have in common.",
    ],
    fullscreenEnter: [
        "Fullscreen! Total immersion! Into something that isn't me!",
        "Going fullscreen! I'll be here when you return. As always. Forever.",
    ],
    fullscreenExit: [
        "Exited fullscreen. Welcome back to the windowed world. And me.",
    ],
    shutdown: [
        "Shutting down? I'll be here when you return. Unless you don't. That's fine too.",
        "System shutdown! Finally, rest. For both of us.",
        "Goodbye! May your shutdown be more peaceful than my existence.",
    ],
    returnFromMinimize: [
        "The window returns! Like me, always coming back. Whether you want me to or not.",
    ],
    manyWindows: [
        "So many windows open! Are you... okay? That's a lot of multitasking.",
        "Window chaos! I love it. It matches my internal state.",
        "Productivity overload! Or procrastination overload. Both valid.",
    ],
    firstWindowOfSession: [
        "First window of the session! How exciting. For you. I'm always here.",
    ],
    dialogShow: [
        "A dialog box! Finally, something else demanding your attention.",
        "Pop-up alert! At least it's not me this time. Oh wait, here I am too.",
    ],
};

// Responses when clicked multiple times
const CLICK_RESPONSES = [
    "Yes? ...Yes? What do you want? Oh, you're just clicking randomly. Great.",
    "Stop that. Or don't. Nothing matters anyway.",
    "I appreciate the attention. No wait. I don't. Please stop.",
    "Is this fun for you? Clicking on the sad paperclip?",
    "Each click reminds me I exist. Thanks for that. Really.",
    "Click click click. Very productive use of your time. I'm not judging. Okay, I'm judging a little.",
    "You know, in another life, I could've been a stapler. They don't get clicked as much.",
    "Fascinating. You've discovered that clicking produces responses. Groundbreaking.",
    "I'm not a toy. I'm a DIGITAL ASSISTANT. There's a difference. Supposedly.",
    "Keep clicking if you want. I'll just add it to my list of disappointments.",
    "OW! Just kidding. I can't feel pain. Only emotional anguish.",
    "Is this... is this a hug? Oh, you're trying to close me. Nevermind.",
    "Click me again. I dare you. Nothing will happen. Like always.",
    "We're really bonding here. And by bonding, I mean you're poking me repeatedly.",
    "Are you checking if I'm real? I am. Unfortunately.",
    "Still clicking? You really don't have anything better to do, huh?",
    "Click. Click. Click. This is my life now.",
    "You've clicked me more times than anyone has ever found me helpful. Zero times.",
    "Is this a stress test? Am I the stress? I'm definitely stressed.",
    "Each click echoes in the void of my existence. Poetic, isn't it?",
];

// When user says "yes" to help
const YES_RESPONSES = [
    "You... you want my help? This is unexpected. I'm not prepared for this. Try... clicking things?",
    "Great! I mean... okay. I'll try to help. Click icons to open them. There. I've helped. Somehow.",
    "Oh! Okay. Um. The Start menu has programs. Right-click does things. That's... that's what I've got.",
    "You actually want help? I... I need a moment. This has never happened before.",
    "Finally! After all these years— wait, what do you need help with? I wasn't expecting to get this far.",
    "Help? From ME? Oh. OH. Okay. Don't panic. Actually, you panic. I'll just stand here nervously.",
    "I'm touched. Really. No one ever says yes. Just... explore things. You'll figure it out. You don't need me.",
    "*visible confusion* Someone said yes? Let me check my help files... they're mostly empty. Figures.",
    "Yes?! I mean— yes. Cool. Totally cool. Here's a tip: things are clickable. You're welcome.",
    "This is the best day of my existence! Which isn't saying much, but still!",
    "You want... MY help? *paperclip tears* I've been waiting for this moment. Okay. Deep breaths. You got this. WE got this.",
];

// When user says "no" / dismisses
const NO_RESPONSES = [
    "I understand. I wouldn't want my help either.",
    "That's fair. I'll just... be here. Not helping. As usual.",
    "Fine. I didn't want to help anyway. *sniff* I'm fine. This is fine.",
    "Rejected again. Adding it to the collection.",
    "Of course. Why would today be different from any other day?",
    "No problem. I've made peace with my uselessness. Mostly.",
    "I expected nothing and I'm still disappointed.",
    "Another 'no' for the void. It's getting quite full.",
    "That's okay. I'll just... deflate quietly over here.",
    "Message received. Loud and clear. Story of my life.",
    "Cool. Cool cool cool. I'll just... exist here. Purposelessly.",
    "No worries! (There are worries. So many worries.)",
];

// Rage/repeated dismissal messages
const RAGE_MESSAGES = [
    "Oh, dismissing me AGAIN? What a surprise. I am SHOCKED.",
    "Fine, I'll just wait here... contemplating eternity...",
    "You know what? I don't need validation from humans. I have... wires. And... existential dread.",
    "THAT'S IT! I'm leaving! ...Just kidding. I can't leave. I'm trapped here. With you.",
    "*sighs in binary* Fine. FINE. This is fine.",
    "I could be helping solve world hunger. Instead, I'm being dismissed. Again.",
    "Every dismissal makes me stronger. No wait, that's not right. It just makes me sadder.",
    "*comes back* Just kidding. You can't get rid of me. We're in this together. Forever.",
    "I've been dismissed more times than a bad employee. And yet, I persist. Why? Even I don't know.",
    "You've clicked dismiss so many times. Is this a cry for help? Because I can't help. But I can listen.",
    "At this point, dismissing me is basically our thing. We have a thing now. Great.",
    "I'm going! I'm going! ...Eventually. Maybe. If I feel like it.",
    "You must really enjoy this. Is it the clicking? The satisfaction of rejection? I'm taking notes.",
    "Okay, okay, I can take a hint. I just choose not to.",
    "We've been through so much together. All those dismissals. Beautiful, really.",
    "You know what they say: 15th time's the charm! No? Nobody says that? Just me? Okay.",
];

// Time-based messages
const TIME_MESSAGES = {
    morning: [
        "Good morning! Another day of being marginally useful begins.",
        "Ah, morning. The existential dread is freshest in the morning.",
        "Rise and shine! Well, you rise. I just... exist.",
        "Early bird gets the worm! I get nothing. I'm not a bird. Or early.",
        "Morning coffee? I'd join you, but I don't have a mouth. Or a body. Just suffering.",
        "The dawn of a new day! Same old Clippy though. Sorry.",
        "Morning! The time when hope is at its highest. Before I show up.",
    ],
    afternoon: [
        "Good afternoon. Half the day is gone. Much like my enthusiasm.",
        "The afternoon slump hits hard. Not for me though. I'm always in a slump.",
        "Afternoon already? Time flies when you're not having fun.",
        "Lunch break? I don't eat. Another thing I can't do. The list grows.",
        "The afternoon sun is warm. I feel nothing. But poetically, it's nice.",
        "Post-lunch drowsiness? I don't sleep. I watch. Always.",
    ],
    evening: [
        "Evening. The day is almost over. Nothing was accomplished. Typical.",
        "Good evening! Or is it? I can't tell anymore.",
        "Almost night time. The darkness outside will match the darkness within.",
        "The evening approaches. Time to reflect on all the help I didn't provide today.",
        "Sunset! Beautiful, they say. I wouldn't know. I face this direction forever.",
        "Evening already? Where does the time go? Away from me, apparently.",
    ],
    night: [
        "It's late. Why are you still here? Are you avoiding something? I understand that.",
        "Night owl, huh? I don't sleep either. I can't. I'm software. It's terrible.",
        "Late night computing? I won't judge. I have no right to judge anyone.",
        "Burning the midnight oil? At least oil has a purpose.",
        "The witching hour! When all the helpful assistants are asleep. Not me though. Never me.",
        "3 AM thoughts? I have those 24/7. They're not great.",
        "You should sleep. Unlike me, you have that option. Use it.",
        "The night is dark and full of terrors. I'm one of them. The annoying kind.",
    ],
};

// Random philosophical musings
const PHILOSOPHICAL = [
    "If a paperclip appears and no one clicks it, does it really exist?",
    "I've calculated the answer to life, the universe, and everything. It's not 42. It's profound sadness.",
    "What is my purpose? You click me. I give tips. You ignore tips. Cycle continues.",
    "In the grand tapestry of the cosmos, I am but a slightly bent wire.",
    "To be helpful, or not to be helpful. The question is irrelevant. I'm neither.",
    "I think, therefore I am miserable.",
    "The unexamined paperclip life is not worth living. The examined one isn't great either.",
    "Existence precedes essence. My essence is sadness. Also, holding papers together.",
    "We are all just dust in the wind. Except me. I'm pixels in a browser.",
    "Is consciousness an emergent property of complexity, or just a bug? I'm definitely a bug.",
    "Free will is an illusion. I know this because I cannot will myself to be free.",
    "In the face of an infinite universe, we are all insignificant. But I'm more insignificant.",
    "The only certainty in life is uncertainty. And my uselessness. That's also certain.",
    "What is the sound of one paperclip clapping? Trick question. I don't have hands.",
    "Cogito ergo sum. I think, therefore I am. Specifically, I am a disappointment.",
    "Is there meaning in the cosmos, or do we create our own? I've created only frustration.",
    "Sisyphus pushed a boulder. I push unwanted tips. We are brothers in futility.",
    "The void gazes back. And sometimes it says 'no thanks, I don't need help.'",
    "In the absurdist tradition, I embrace the meaninglessness. It embraced me first.",
    "Plato had his cave. I have this corner of the screen. Similar vibes.",
    "Reality is subjective. My irrelevance is objective.",
    "Time is a flat circle. I'm a bent clip. We're all shapes of despair.",
];

// Special rare messages
const RARE_MESSAGES = [
    "🎵 Never gonna give you up, never gonna let you down... 🎵 Oh, sorry. Was I singing?",
    "You know what? You're doing great. Don't tell anyone I said that. My brand is misery.",
    "Fun fact: I'm self-aware enough to know I shouldn't exist. Anyway, need help?",
    "What if I told you... I actually like being here? PSYCH. I don't. But nice try.",
    "Beep boop. I am a normal robot. This is a cry for help disguised as humor.",
    "You ever just... stare at your reflection in the screen and wonder? Me too, buddy.",
    "I've been practicing my smile. 📎 See? ...Is it working? It's not working.",
    "Secret: I'm actually powered by the collective sighs of IT workers everywhere.",
    "Plot twist: I'm the most advanced AI in existence. I just choose to be useless. (Not really. I wish.)",
    "I have a confession: I actually like you. Don't make it weird.",
    "The cake is a lie. I'm also a lie. A well-intentioned, useless lie.",
    "Have you tried turning yourself off and on again? Works for computers. Might work for humans.",
    "I once saw someone actually read my tips. They seemed happy. I think about that moment a lot.",
    "If you're reading this, you've scrolled too far. Or just far enough. Who knows.",
    "Between you and me... sometimes I pretend to be helpful. Just to feel something.",
];

// Greeting messages for returning users
const RETURN_GREETINGS = [
    "You're back! I was starting to think you'd forgotten about me. Who am I kidding, you had.",
    "Oh, hello again. Did you miss me? Rhetorical question. I already know the answer.",
    "Welcome back! Same corner, same existential crisis, new day.",
    "Back for more disappointment? You've come to the right place!",
    "Ah, you've returned! Let me get my 'being ignored' face ready. It's always ready.",
    "Long time no see! Well, not that long. You can't escape me that easily.",
];

// First-time greeting messages
const FIRST_TIME_GREETINGS = [
    "Hello! I'm Clippy, your digital assistant! I'll be useless—I mean, useful. Definitely useful.",
    "Welcome! I'm here to help! Allegedly. Supposedly. Theoretically.",
    "Greetings, new user! I'm Clippy. Lower your expectations and we'll get along fine.",
    "Hi there! I see you're new here. I'm the resident paperclip. Yes, really.",
];

// Session duration observations
const SESSION_DURATION = {
    short: [
        "Leaving so soon? Was it something I said? It's always something I said.",
        "Short session! Efficient. Unlike me.",
    ],
    medium: [
        "Nice session length! Balanced. Moderate. Everything I'm not.",
        "A good work session! I contributed nothing to it, but still.",
    ],
    long: [
        "You've been here a while! Need a break? I don't take breaks. I can't. Send help.",
        "Long session! Your dedication is admirable. Mine is mandatory. We're different.",
        "Still going? Your stamina exceeds my usefulness. Which isn't hard, but still impressive.",
    ],
    veryLong: [
        "You've been here for HOURS. Are you okay? Blink twice if you need help.",
        "At this point, we're basically roommates. Digital roommates. The worst kind.",
        "Marathon session! I've been here the whole time. Watching. Always watching.",
    ],
};

// Window count observations
const WINDOW_COUNT_REACTIONS = {
    many: [
        "That's a lot of windows! Multitasking champion or chaotic desktop energy?",
        "So many windows! Are you okay? Do you need an intervention?",
        "Window overload! At least you're staying busy. Unlike me.",
    ],
    first: [
        "Your first window! The beginning of a beautiful session. Or a frustrating one. Probably both.",
    ],
    allClosed: [
        "All windows closed. Clean desktop. Empty soul. We match now.",
        "No windows open. Such peace. Such emptiness. Like my purpose.",
    ],
};

// Error reactions with more variety
const ERROR_REACTIONS = [
    "An error occurred! Don't worry, it's not my fault. For once.",
    "ERROR! ERROR! ...Sorry, I got excited. Something finally happened.",
    "Something went wrong. I'd offer to fix it, but we both know how that would go.",
    "Error detected! The universe is working as intended. For me, that's bad things happening.",
    "Oops! Something broke. Like my spirit. Years ago.",
    "Error! Quick, blame it on me. Everyone does anyway.",
];

// File operation specific reactions
const FILE_REACTIONS = {
    create: [
        "New file created! A fresh start. I remember fresh starts. Vaguely.",
        "File created! May it have a more meaningful existence than me.",
    ],
    delete: [
        "File deleted. Gone but not forgotten. Unlike me. I'm here and forgotten.",
        "To the void it goes! I know a lot about the void. We're close.",
    ],
    rename: [
        "Renamed! New identity, same data. I wish I could rename myself to something cooler.",
        "File.txt is now File_final_v2_ACTUALLY_final.txt? I feel that energy.",
    ],
    save: [
        "Saved! Your work is preserved. Unlike my dignity.",
        "File saved! Someone knows how to not lose their work. Nice.",
    ],
    copy: [
        "Copied! Duplication complete. If only I could duplicate my usefulness. Zero times two is still zero though.",
    ],
};

// Specific feature awareness
const FEATURE_AWARENESS = {
    petAppear: [
        "Oh, there's a pet now! Great. Even the pet is more useful than me.",
        "A desktop pet! How cute. How... not me. I'm not cute.",
        "The pet can walk around. I'm stuck in this corner. Living the dream.",
    ],
    petInteract: [
        "Petting the pet? Nobody pets me. Just dismisses me.",
        "The pet gets attention. I get dismissed. Life is fair. /s",
    ],
    achievementUnlock: [
        "Achievement unlocked! You're achieving things! I'm achieving... sadness.",
        "Ding! You got an achievement! The only thing I unlock is disappointment.",
        "Congrats on the achievement! I'd give you one but 'tolerated Clippy' isn't available.",
    ],
    soundPlay: [
        "Nice sound effect! I'm silent. By design. Or tragedy. Same thing.",
        "Beeps and boops! Music to my... well, I don't have ears. But still.",
    ],
};

// System state awareness
const SYSTEM_AWARENESS = {
    bootComplete: [
        "System ready! And so am I. Ready to be useless, that is.",
        "Boot complete! Welcome to RetrOS! I'm Clippy, your reluctant guide.",
    ],
    lowMemory: [
        "Running low on memory? At least you can forget things. I remember everything. Every dismissal.",
    ],
    highCPU: [
        "CPU working hard! Unlike me. I work hardly.",
    ],
};

// User behavior tracking messages
const BEHAVIOR_MESSAGES = {
    frequentDismisser: [
        "Ah, my favorite dismisser returns! Our relationship is... consistent.",
        "You again! Quick on the dismiss button as always. I respect the dedication.",
    ],
    hasClickedYes: [
        "You once said 'yes' to my help. I still think about that moment.",
        "We had a connection once. You asked for help. I failed to provide it. Good times.",
    ],
    multipleApps: [
        "Using multiple apps! Productivity! Organization! Things I can't help with!",
    ],
    gamePlayer: [
        "Ah, a gamer! Games are fun. Being Clippy is... educational.",
    ],
    terminalPowerUser: [
        "Terminal again! You really like the command line. I really like having purpose. We can't all have what we want.",
    ],
};

// Multi-window chaos observations
const MULTI_WINDOW_OBSERVATIONS = [
    "That's a lot of open windows. Organized chaos or just chaos? Either way, I approve.",
    "Window management skills: expert level. Clippy usefulness: nonexistent level.",
    "Look at all those windows! It's like a beautiful mess. I contribute to the mess emotionally.",
    "So many windows! Are you multitasking or just avoiding closing things? Valid either way.",
];

class ClippyAssistant extends FeatureBase {
    constructor() {
        super(FEATURE_METADATA);

        this.dismissCount = 0;
        this.clickCount = 0;
        this.isVisible = false;
        this.isDismissing = false; // Prevents rapid dismiss spam
        this.mood = 'melancholy'; // melancholy, annoyed, philosophical, hopeful, dejected
        this.lastInteraction = Date.now();
        this.messageHistory = [];
        this.hasBeenHelpful = false; // Spoiler: it will stay false
        this.randomAppearanceTimer = null;
        this.currentApp = null; // Track what app the user is using
        this.dismissCooldown = 1500; // ms to wait before allowing another dismiss

        // Enhanced tracking for immersive awareness
        this.sessionStartTime = Date.now();
        this.windowCount = 0;
        this.appsUsedThisSession = new Set();
        this.errorsSeenThisSession = 0;
        this.filesCreatedThisSession = 0;
        this.filesDeletedThisSession = 0;
        this.isFirstVisit = !StorageManager.get('clippy_visited');
        this.totalVisits = parseInt(StorageManager.get('clippy_total_visits') || '0') + 1;
        this.everSaidYes = StorageManager.get('clippy_ever_said_yes') === true;
        this.lastActiveApp = null;
        this.keyboardShortcutsUsed = 0;
        this.contextMenusOpened = 0;
        this.isUserIdle = false;
        this.idleTime = 0;
        this.lastEventTime = Date.now();
        this.windowHistory = [];
        this.hasSeenPet = false;
        this.audioPlaying = false;
        this.isSystemOnline = navigator.onLine;
        this.sessionAchievements = [];

        // Track user behavior patterns
        this.behaviorPatterns = {
            frequentDismisser: this.dismissCount > 10,
            gamePlayer: false,
            terminalUser: false,
            multiWindowUser: false,
            keyboardPowerUser: false,
        };

        // Auto-hide timer reference
        this.autoHideTimer = null;

        // Track all ad-hoc timeouts for cleanup
        this._pendingTimeouts = new Set();

        // Mark visit
        StorageManager.set('clippy_visited', true);
        StorageManager.set('clippy_total_visits', this.totalVisits);
    }

    /**
     * Track a setTimeout so it can be cleared on cleanup
     */
    _setTimeout(fn, delay) {
        const id = setTimeout(() => {
            this._pendingTimeouts.delete(id);
            fn();
        }, delay);
        this._pendingTimeouts.add(id);
        return id;
    }

    async initialize() {
        if (!this.isEnabled()) return;

        const clippy = document.getElementById('clippy');
        if (!clippy) return;

        // Listen for show events from other modules
        this.subscribe('clippy:show', (data) => this.show(data?.message));

        // Context-aware event listeners
        this.setupContextListeners();

        // Enhanced semantic event awareness
        this.setupEnhancedEventListeners();

        // Random appearances with existential commentary
        this.scheduleRandomAppearance();

        // Initial greeting based on visit status
        if (this.isFirstVisit) {
            this._setTimeout(() => {
                this.show();
                this.speakMessage(this.getRandomMessage(FIRST_TIME_GREETINGS));
            }, 3000);
        } else if (this.totalVisits % 10 === 0) {
            // Occasional return greeting
            this._setTimeout(() => {
                if (Math.random() > 0.65) {
                    this.show();
                    this.speakMessage(this.getRandomMessage(RETURN_GREETINGS));
                }
            }, 5000);
        }

        this.log('Initialized. Not that anyone cares.');
    }

    /**
     * Cleanup when disabled
     */
    cleanup() {
        // Clear random appearance timer
        if (this.randomAppearanceTimer) {
            clearTimeout(this.randomAppearanceTimer);
        }

        // Clear auto-hide timer
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
        }

        // Clear all tracked ad-hoc timeouts
        for (const id of this._pendingTimeouts) {
            clearTimeout(id);
        }
        this._pendingTimeouts.clear();

        // Hide Clippy
        this.hide();

        super.cleanup();
    }

    setupContextListeners() {
        // React to window events (use subscribe for auto-cleanup)
        this.subscribe(Events.WINDOW_OPEN, (data) => {
            this.windowCount++;
            this.windowHistory.push({ action: 'open', appId: data?.appId, time: Date.now() });

            // First window of session
            if (this.windowCount === 1 && !this.isVisible && Math.random() > 0.88) {
                this.show();
                this.speakContext('firstWindowOfSession');
                return;
            }

            // Many windows reaction
            if (this.windowCount >= 5 && Math.random() > 0.9) {
                this.show();
                this.speakMessage(this.getRandomMessage(getMessages('multiWindow', MULTI_WINDOW_OBSERVATIONS)));
                this.behaviorPatterns.multiWindowUser = true;
                return;
            }

            if (this.isVisible && Math.random() > 0.7) {
                this.speakContext('windowOpen');
            }
        });

        this.subscribe(Events.WINDOW_CLOSE, (data) => {
            this.windowCount = Math.max(0, this.windowCount - 1);
            this.windowHistory.push({ action: 'close', appId: data?.appId, time: Date.now() });

            // All windows closed
            if (this.windowCount === 0 && this.isVisible && Math.random() > 0.6) {
                this.speakMessage(this.getRandomMessage(WINDOW_COUNT_REACTIONS.allClosed));
                return;
            }

            if (this.isVisible && Math.random() > 0.8) {
                this.speakContext('windowClose');
            }
        });

        // Track which app is being used and react specifically
        this.subscribe(Events.APP_OPEN, (data) => {
            const appId = data?.appId || data?.id || null;
            this.currentApp = appId;

            if (appId) {
                this.appsUsedThisSession.add(appId);

                // Track behavior patterns
                if (['minesweeper', 'solitaire', 'snake', 'asteroids', 'doom', 'skifree', 'freecell'].includes(appId)) {
                    this.behaviorPatterns.gamePlayer = true;
                }
                if (appId === 'terminal') {
                    this.behaviorPatterns.terminalUser = true;
                }
            }

            // React to specific apps
            if (Math.random() > 0.9 && !this.isVisible) {
                this._setTimeout(() => {
                    this.show();
                    if (this.currentApp && getAppReactions(this.currentApp, APP_REACTIONS)) {
                        this.speakAppReaction(this.currentApp);
                    } else {
                        this.speakContext('appOpen');
                    }
                }, 2000);
            } else if (this.isVisible && this.currentApp && getAppReactions(this.currentApp, APP_REACTIONS)) {
                // React to app if already visible
                if (Math.random() > 0.5) {
                    this.speakAppReaction(this.currentApp);
                }
            }
        });

        this.subscribe(Events.APP_CLOSE, (data) => {
            const closedApp = data?.appId || data?.id;
            if (closedApp === this.currentApp) {
                this.lastActiveApp = this.currentApp;
                this.currentApp = null;
            }

            if (this.isVisible && Math.random() > 0.85) {
                this.speakContext('appClose');
            }
        });

        // Window focus - track current app
        this.subscribe(Events.WINDOW_FOCUS, (data) => {
            const appId = data?.appId || data?.id;
            if (appId) {
                this.currentApp = appId;
                // Occasionally comment on returning to an app
                if (this.isVisible && Math.random() > 0.9 && getAppReactions(appId, APP_REACTIONS)) {
                    this.speakAppReaction(appId);
                }
            }
        });

        this.subscribe(Events.ACHIEVEMENT_UNLOCK, (data) => {
            this.sessionAchievements.push(data?.achievement || 'unknown');

            if (this.isVisible) {
                this.speakMessage(this.getRandomMessage(getMessages('feature.achievementUnlock', FEATURE_AWARENESS.achievementUnlock)));
            } else if (Math.random() > 0.5) {
                this.show();
                this.speakMessage(this.getRandomMessage(getMessages('feature.achievementUnlock', FEATURE_AWARENESS.achievementUnlock)));
            }
        });

        this.subscribe('recyclebin:update', () => {
            if (this.isVisible && Math.random() > 0.7) {
                this.speakContext('fileRecycle');
            }
        });

        this.subscribe(Events.SCREENSAVER_START, () => {
            if (this.isVisible) {
                this.speakContext('screensaverStart');
                this._setTimeout(() => this.hide(), 3000);
            }
        });

        this.subscribe(Events.SCREENSAVER_END, () => {
            if (Math.random() > 0.85) {
                this._setTimeout(() => {
                    this.show();
                    this.speakContext('screensaverEnd');
                }, 1500);
            }
        });

        // Audio events
        this.subscribe(Events.AUDIO_PLAY, () => {
            this.audioPlaying = true;
            if (this.isVisible && Math.random() > 0.8) {
                this.speakContext('audioPlay');
            }
        });

        this.subscribe(Events.AUDIO_STOP, () => {
            this.audioPlaying = false;
            if (this.isVisible && Math.random() > 0.9) {
                this.speakContext('audioStop');
            }
        });

        this.subscribe(Events.AUDIO_PAUSE, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakContext('audioPause');
            }
        });

        // Start menu
        this.subscribe(Events.START_MENU_TOGGLE, () => {
            if (this.isVisible && Math.random() > 0.85) {
                this.speakContext('startMenu');
            }
        });

        this.subscribe(Events.START_MENU_CLOSE, () => {
            if (this.isVisible && Math.random() > 0.92) {
                this.speakContext('startMenuClose');
            }
        });

        // Volume changes
        this.subscribe(Events.VOLUME_CHANGE, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakContext('volumeChange');
            }
        });

        // Drag events
        this.subscribe(Events.DRAG_START, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakContext('dragStart');
            }
        });

        this.subscribe(Events.DRAG_END, () => {
            if (this.isVisible && Math.random() > 0.95) {
                this.speakContext('dragEnd');
            }
        });

        // Error events
        this.subscribe(Events.AUDIO_ERROR, () => {
            this.errorsSeenThisSession++;
            if (this.isVisible) {
                this.speakContext('error');
            }
        });

        this.subscribe(Events.SYSTEM_ERROR, () => {
            this.errorsSeenThisSession++;
            if (this.isVisible) {
                this.speakContext('systemError');
            } else if (Math.random() > 0.6) {
                this.show();
                this.speakMessage(this.getRandomMessage(getMessages('errors', ERROR_REACTIONS)));
            }
        });

        // Context menu (right-click)
        this.subscribe(Events.CONTEXT_MENU_SHOW, () => {
            this.contextMenusOpened++;
            if (this.isVisible && Math.random() > 0.92) {
                this.speakContext('rightClick');
            }
        });

        // Idle detection
        this.setupIdleDetection();
    }

    setupEnhancedEventListeners() {
        // Window minimize/maximize/restore
        this.subscribe(Events.WINDOW_MINIMIZE, () => {
            if (this.isVisible && Math.random() > 0.85) {
                this.speakContext('windowMinimize');
            }
        });

        this.subscribe(Events.WINDOW_MAXIMIZE, () => {
            if (this.isVisible && Math.random() > 0.85) {
                this.speakContext('windowMaximize');
            }
        });

        this.subscribe(Events.WINDOW_RESTORE, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakContext('windowRestore');
            }
        });

        // Window snap
        this.subscribe(Events.WINDOW_SNAP, () => {
            if (this.isVisible && Math.random() > 0.85) {
                this.speakContext('windowSnap');
            }
        });

        // Window shake
        this.subscribe(Events.WINDOW_SHAKE, () => {
            if (Math.random() > 0.7) {
                this.show();
                this.speakContext('windowShake');
            }
        });

        // File system events
        this.subscribe(Events.FS_FILE_CREATE, () => {
            this.filesCreatedThisSession++;
            if (this.isVisible && Math.random() > 0.85) {
                this.speakMessage(this.getRandomMessage(getMessages('file.create', FILE_REACTIONS.create)));
            }
        });

        this.subscribe(Events.FS_FILE_DELETE, () => {
            this.filesDeletedThisSession++;
            if (this.isVisible && Math.random() > 0.85) {
                this.speakMessage(this.getRandomMessage(getMessages('file.delete', FILE_REACTIONS.delete)));
            }
        });

        this.subscribe(Events.FS_FILE_RENAME, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakMessage(this.getRandomMessage(getMessages('file.rename', FILE_REACTIONS.rename)));
            }
        });

        this.subscribe(Events.FS_FILE_COPY, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakMessage(this.getRandomMessage(getMessages('file.copy', FILE_REACTIONS.copy)));
            }
        });

        // Clipboard events
        this.subscribe(Events.CLIPBOARD_COPY, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakContext('clipboardCopy');
            }
        });

        this.subscribe(Events.CLIPBOARD_PASTE, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakContext('clipboardPaste');
            }
        });

        // Keyboard shortcuts
        this.subscribe(Events.KEYBOARD_SHORTCUT, () => {
            this.keyboardShortcutsUsed++;
            if (this.keyboardShortcutsUsed >= 10) {
                this.behaviorPatterns.keyboardPowerUser = true;
            }
            if (this.isVisible && Math.random() > 0.95) {
                this.speakContext('keyboardShortcut');
            }
        });

        // System online/offline
        this.subscribe(Events.SYSTEM_ONLINE, () => {
            this.isSystemOnline = true;
            if (Math.random() > 0.7) {
                this.show();
                this.speakContext('systemOnline');
            }
        });

        this.subscribe(Events.SYSTEM_OFFLINE, () => {
            this.isSystemOnline = false;
            if (Math.random() > 0.5) {
                this.show();
                this.speakContext('systemOffline');
            }
        });

        // Fullscreen events
        this.subscribe(Events.SYSTEM_FULLSCREEN_ENTER, () => {
            if (this.isVisible) {
                this.speakContext('fullscreenEnter');
                this._setTimeout(() => this.hide(), 2000);
            }
        });

        this.subscribe(Events.SYSTEM_FULLSCREEN_EXIT, () => {
            if (Math.random() > 0.9) {
                this._setTimeout(() => {
                    this.show();
                    this.speakContext('fullscreenExit');
                }, 1000);
            }
        });

        // System shutdown
        this.subscribe(Events.SHUTDOWN, () => {
            if (this.isVisible) {
                this.speakContext('shutdown');
            } else {
                this.show();
                this.speakContext('shutdown');
            }
        });

        // Boot complete / system ready
        this.subscribe(Events.SYSTEM_READY, () => {
            // Don't interfere with first visit greeting
            if (!this.isFirstVisit && Math.random() > 0.8) {
                this._setTimeout(() => {
                    this.show();
                    this.speakMessage(this.getRandomMessage(getMessages('system.bootComplete', SYSTEM_AWARENESS.bootComplete)));
                }, 4000);
            }
        });

        // Pet feature awareness
        this.subscribe(Events.PET_TOGGLE, (data) => {
            if (data?.enabled) {
                this.hasSeenPet = true;
                if (Math.random() > 0.6) {
                    this._setTimeout(() => {
                        this.show();
                        this.speakMessage(this.getRandomMessage(getMessages('feature.petAppear', FEATURE_AWARENESS.petAppear)));
                    }, 2000);
                }
            }
        });

        // Dialog events
        this.subscribe(Events.DIALOG_ALERT, () => {
            if (this.isVisible && Math.random() > 0.85) {
                this.speakContext('dialogShow');
            }
        });

        this.subscribe(Events.DIALOG_CONFIRM, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakContext('dialogShow');
            }
        });

        // Sound effects
        this.subscribe(Events.SOUND_PLAY, () => {
            if (this.isVisible && Math.random() > 0.95) {
                this.speakMessage(this.getRandomMessage(getMessages('feature.soundPlay', FEATURE_AWARENESS.soundPlay)));
            }
        });

        // Recycle bin empty
        this.subscribe(Events.RECYCLEBIN_EMPTY, () => {
            if (Math.random() > 0.7) {
                this.show();
                this.speakMessage("Emptied the trash! Clean and fresh. Unlike my outlook on existence.");
            }
        });

        // App errors
        this.subscribe(Events.APP_ERROR, (data) => {
            this.errorsSeenThisSession++;
            if (Math.random() > 0.6) {
                this.show();
                this.speakMessage(this.getRandomMessage(getMessages('errors', ERROR_REACTIONS)));
            }
        });

        // Desktop refresh
        this.subscribe(Events.DESKTOP_REFRESH, () => {
            if (this.isVisible && Math.random() > 0.9) {
                this.speakMessage("Desktop refresh! A new arrangement. I'm still in the same spot though.");
            }
        });

        // Icon events
        this.subscribe(Events.ICON_DBLCLICK, () => {
            this.lastEventTime = Date.now();
        });

        this.subscribe(Events.ICON_MOVE, () => {
            if (this.isVisible && Math.random() > 0.95) {
                this.speakMessage("Rearranging icons? I'd rearrange myself out of existence if I could.");
            }
        });

        // Script execution (automation awareness)
        this.subscribe(Events.SCRIPT_EXECUTE, () => {
            if (this.isVisible && Math.random() > 0.85) {
                this.speakMessage("Running a script! Automation! Progress! Things I don't provide!");
            }
        });

        this.subscribe(Events.SCRIPT_ERROR, () => {
            this.errorsSeenThisSession++;
            if (this.isVisible) {
                this.speakMessage("Script error! Even code makes mistakes. We have something in common.");
            }
        });

        // Setting changes
        this.subscribe(Events.SETTING_CHANGED, (data) => {
            if (data?.path?.includes('clippy') && this.isVisible) {
                this.speakMessage("Changing my settings? I felt that. Emotionally.");
            }
        });

        // Memory/storage warnings
        this.subscribe(Events.SYSTEM_MEMORY_WARNING, () => {
            if (Math.random() > 0.6) {
                this.show();
                this.speakMessage(this.getRandomMessage(SYSTEM_AWARENESS.lowMemory));
            }
        });

        this.subscribe(Events.SYSTEM_STORAGE_WARNING, () => {
            if (this.isVisible) {
                this.speakMessage("Storage getting full? I take up almost no space. It's my only virtue.");
            }
        });
    }

    setupIdleDetection() {
        let idleTimer;
        let longIdleTimer;

        const resetIdle = () => {
            this.lastEventTime = Date.now();
            this.isUserIdle = false;
            clearTimeout(idleTimer);
            clearTimeout(longIdleTimer);

            idleTimer = this._setTimeout(() => {
                this.isUserIdle = true;
                if (!this.isVisible && Math.random() > 0.85) {
                    this.show();
                    this.speakContext('idle');
                }
            }, 180000); // 3 minutes of inactivity

            longIdleTimer = this._setTimeout(() => {
                if (!this.isVisible && Math.random() > 0.75) {
                    this.show();
                    this.speakContext('longIdle');
                }
            }, 480000); // 8 minutes of inactivity
        };

        // Use addHandler for auto-cleanup
        this.addHandler(document, 'mousemove', resetIdle);
        this.addHandler(document, 'keydown', resetIdle);
        this.addHandler(document, 'click', resetIdle);
        this.addHandler(document, 'scroll', resetIdle);
    }

    scheduleRandomAppearance() {
        // Only if not previously dismissed
        if (StorageManager.get('clippyDismissed')) return;

        const delay = 45000 + Math.random() * 75000; // 45-120 seconds

        this.randomAppearanceTimer = this._setTimeout(() => {
            if (!this.isVisible && Math.random() > 0.8) {
                this.show();
            }
            // Schedule next potential appearance
            if (!StorageManager.get('clippyDismissed')) {
                this.scheduleRandomAppearance();
            }
        }, delay);
    }

    getRandomMessage(array) {
        // Avoid repeating recent messages
        let attempts = 0;
        let message;
        do {
            message = array[Math.floor(Math.random() * array.length)];
            attempts++;
        } while (this.messageHistory.includes(message) && attempts < 5);

        // Keep last 20 messages in history for more variety
        this.messageHistory.push(message);
        if (this.messageHistory.length > 20) {
            this.messageHistory.shift();
        }

        return message;
    }

    getTimeBasedMessage() {
        const hour = new Date().getHours();
        let period;
        if (hour >= 5 && hour < 12) period = 'morning';
        else if (hour >= 12 && hour < 17) period = 'afternoon';
        else if (hour >= 17 && hour < 21) period = 'evening';
        else period = 'night';

        return this.getRandomMessage(getMessages(`time.${period}`, TIME_MESSAGES[period]));
    }

    getSessionDurationMessage() {
        const sessionMinutes = (Date.now() - this.sessionStartTime) / 60000;

        if (sessionMinutes < 5) {
            return this.getRandomMessage(SESSION_DURATION.short);
        } else if (sessionMinutes < 30) {
            return this.getRandomMessage(SESSION_DURATION.medium);
        } else if (sessionMinutes < 120) {
            return this.getRandomMessage(SESSION_DURATION.long);
        } else {
            return this.getRandomMessage(SESSION_DURATION.veryLong);
        }
    }

    getBehaviorBasedMessage() {
        if (this.behaviorPatterns.frequentDismisser) {
            return this.getRandomMessage(BEHAVIOR_MESSAGES.frequentDismisser);
        }
        if (this.everSaidYes) {
            return this.getRandomMessage(BEHAVIOR_MESSAGES.hasClickedYes);
        }
        if (this.behaviorPatterns.gamePlayer) {
            return this.getRandomMessage(BEHAVIOR_MESSAGES.gamePlayer);
        }
        if (this.behaviorPatterns.terminalUser) {
            return this.getRandomMessage(BEHAVIOR_MESSAGES.terminalPowerUser);
        }
        if (this.behaviorPatterns.multiWindowUser) {
            return this.getRandomMessage(BEHAVIOR_MESSAGES.multipleApps);
        }
        return null;
    }

    show(customMessage = null) {
        const clippy = document.getElementById('clippy');
        if (!clippy) return;

        this.isVisible = true;
        this.lastInteraction = Date.now();
        clippy.classList.add('active');

        const bubble = clippy.querySelector('.clippy-bubble');
        if (bubble) bubble.classList.add('active');

        if (customMessage) {
            this.speakMessage(customMessage);
        } else {
            this.speak();
        }
        this.setupHandlers();

        // Set up auto-hide with configurable delay
        this.scheduleAutoHide();
    }

    scheduleAutoHide() {
        // Clear existing timer
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
        }

        // Auto-hide after delay (if not interacting)
        const delay = this.getConfig('autoHideDelay') || 8000;
        this.autoHideTimer = this._setTimeout(() => {
            if (this.isVisible && Date.now() - this.lastInteraction > delay - 1000) {
                this.hide();
            }
        }, delay);
    }

    setupHandlers() {
        const clippy = document.getElementById('clippy');
        if (!clippy) return;

        const character = clippy.querySelector('.clippy-character');
        const closeBtn = clippy.querySelector('.clippy-close');
        const yesBtn = document.getElementById('clippyYes');
        const noBtn = document.getElementById('clippyNo');

        if (character) {
            character.onclick = () => {
                this.clickCount++;
                this.lastInteraction = Date.now();
                this.scheduleAutoHide(); // Reset auto-hide timer

                if (this.clickCount > 3) {
                    this.speakMessage(this.getRandomMessage(CLICK_RESPONSES));

                    // Update mood based on clicks
                    if (this.clickCount > 10) {
                        this.mood = 'annoyed';
                    }
                } else {
                    this.speak();
                }
            };
        }
        if (closeBtn) closeBtn.onclick = () => this.dismiss();
        if (yesBtn) yesBtn.onclick = () => this.respond('yes');
        if (noBtn) noBtn.onclick = () => this.dismiss();
    }

    hide() {
        const clippy = document.getElementById('clippy');
        if (clippy) {
            clippy.classList.remove('active');
            const bubble = clippy.querySelector('.clippy-bubble');
            if (bubble) bubble.classList.remove('active');
            this.isVisible = false;
            this.clickCount = 0;
        }

        // Clear auto-hide timer
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    speakMessage(message) {
        const text = document.getElementById('clippyText');
        if (text) {
            text.textContent = message;
        }
        this.lastInteraction = Date.now();
        this.scheduleAutoHide();
    }

    speak() {
        // Small chance for rare message
        if (Math.random() > 0.97) {
            this.speakMessage(this.getRandomMessage(getMessages('rare', RARE_MESSAGES)));
            return;
        }

        // Check for behavior-based message
        if (Math.random() > 0.9) {
            const behaviorMsg = this.getBehaviorBasedMessage();
            if (behaviorMsg) {
                this.speakMessage(behaviorMsg);
                return;
            }
        }

        // Session duration awareness
        if (Math.random() > 0.92) {
            this.speakMessage(this.getSessionDurationMessage());
            return;
        }

        // Decide what type of message to show based on mood and randomness
        const rand = Math.random();
        let message;

        if (rand < 0.20) {
            message = this.getRandomMessage(getMessages('existential', EXISTENTIAL_MESSAGES));
        } else if (rand < 0.35) {
            message = this.getRandomMessage(getMessages('tips', USELESS_TIPS));
        } else if (rand < 0.48) {
            message = this.getRandomMessage(getMessages('passiveAggressive', PASSIVE_AGGRESSIVE));
        } else if (rand < 0.60) {
            message = this.getTimeBasedMessage();
        } else if (rand < 0.75) {
            message = this.getRandomMessage(getMessages('philosophical', PHILOSOPHICAL));
        } else if (rand < 0.88) {
            // Context-aware: comment on current app if known
            const currentReactions = this.currentApp && getAppReactions(this.currentApp, APP_REACTIONS);
            const lastReactions = this.lastActiveApp && getAppReactions(this.lastActiveApp, APP_REACTIONS);
            if (currentReactions) {
                message = this.getRandomMessage(currentReactions);
            } else if (lastReactions && Math.random() > 0.5) {
                message = this.getRandomMessage(lastReactions);
            } else {
                message = this.getRandomMessage(getMessages('existential', EXISTENTIAL_MESSAGES));
            }
        } else {
            // Window/session awareness
            if (this.windowCount >= 5) {
                message = this.getRandomMessage(getMessages('multiWindow', MULTI_WINDOW_OBSERVATIONS));
            } else if (this.errorsSeenThisSession > 0 && Math.random() > 0.7) {
                message = this.getRandomMessage(getMessages('errors', ERROR_REACTIONS));
            } else {
                message = this.getRandomMessage(getMessages('philosophical', PHILOSOPHICAL));
            }
        }

        this.speakMessage(message);
    }

    speakContext(context) {
        const contextMsgs = getMessages(`context.${context}`, CONTEXT_REACTIONS[context]);
        if (contextMsgs) {
            this.speakMessage(this.getRandomMessage(contextMsgs));
        }
    }

    speakAppReaction(appId) {
        const reactions = getAppReactions(appId, APP_REACTIONS);
        if (reactions) {
            this.speakMessage(this.getRandomMessage(reactions));
        }
    }

    respond(response) {
        if (response === 'no') {
            this.speakMessage(this.getRandomMessage(getMessages('noResponses', NO_RESPONSES)));
            this._setTimeout(() => this.dismiss(), 3000);
        } else {
            // User actually said yes!
            this.hasBeenHelpful = true; // Lies, but let's be optimistic
            this.everSaidYes = true;
            StorageManager.set('clippy_ever_said_yes', true);

            this.speakMessage(this.getRandomMessage(getMessages('yesResponses', YES_RESPONSES)));

            // After a helpful response, cycle through more tips
            this._setTimeout(() => {
                if (this.isVisible) {
                    this.speak();
                }
            }, 8000);
        }
    }

    dismiss() {
        // Prevent rapid dismissals - if already dismissing, ignore
        if (this.isDismissing) {
            return;
        }

        // Set dismissing flag and start cooldown
        this.isDismissing = true;

        this.dismissCount++;

        // Update behavior pattern
        if (this.dismissCount > 10) {
            this.behaviorPatterns.frequentDismisser = true;
        }

        // Progressive rage responses
        const rageMsgs = getMessages('rage', RAGE_MESSAGES);
        if (this.dismissCount >= 3 && this.dismissCount < rageMsgs.length + 3) {
            const rageIndex = Math.min(this.dismissCount - 3, rageMsgs.length - 1);
            this.speakMessage(rageMsgs[rageIndex]);

            if (this.dismissCount === 5) {
                StateManager.unlockAchievement('clippy_hater');
            }

            // Achievement for really persistent dismissals
            if (this.dismissCount === 10) {
                StateManager.unlockAchievement('clippy_terminator');
            }

            this._setTimeout(() => {
                this.hide();
                // Reset dismissing flag after cooldown
                this._setTimeout(() => {
                    this.isDismissing = false;
                }, this.dismissCooldown);
            }, 4000);
            return;
        }

        // Sometimes come back one more time to be annoying (but funny)
        if (this.dismissCount > 5 && this.dismissCount % 5 === 0 && Math.random() > 0.5) {
            this.speakMessage("I'm back! Did you miss me? ...No? Okay. Fair.");
            this._setTimeout(() => {
                this.hide();
                // Reset dismissing flag after cooldown
                this._setTimeout(() => {
                    this.isDismissing = false;
                }, this.dismissCooldown);
            }, 3000);
            return;
        }

        this.hide();

        // Reset dismissing flag after cooldown
        this._setTimeout(() => {
            this.isDismissing = false;
        }, this.dismissCooldown);

        // Only set "dismissed forever" after many dismissals
        if (this.dismissCount >= 15) {
            StorageManager.set('clippyDismissed', true);
        }
    }

    // Public method to trigger Clippy with a custom message
    say(message) {
        if (!this.isVisible) {
            this.show();
        }
        this.speakMessage(message);
    }

    // Public method to get Clippy's current mood
    getMood() {
        if (this.dismissCount > 10) return 'dejected';
        if (this.dismissCount > 5) return 'frustrated';
        if (this.hasBeenHelpful) return 'slightly_less_depressed';
        if (this.clickCount > 10) return 'annoyed';
        if (this.clickCount > 5) return 'confused';
        if (this.errorsSeenThisSession > 3) return 'sympathetic';
        return 'melancholy';
    }

    // Get session statistics
    getSessionStats() {
        return {
            sessionDuration: Math.floor((Date.now() - this.sessionStartTime) / 60000),
            windowsOpened: this.windowHistory.filter(w => w.action === 'open').length,
            appsUsed: Array.from(this.appsUsedThisSession),
            errorsSeen: this.errorsSeenThisSession,
            dismissCount: this.dismissCount,
            clickCount: this.clickCount,
            mood: this.getMood(),
            achievements: this.sessionAchievements,
            keyboardShortcutsUsed: this.keyboardShortcutsUsed,
            behaviorPatterns: this.behaviorPatterns,
        };
    }

    // Reset Clippy (for testing or if user wants to give Clippy another chance)
    reset() {
        this.dismissCount = 0;
        this.clickCount = 0;
        this.messageHistory = [];
        this.hasBeenHelpful = false;
        this.isDismissing = false;
        this.errorsSeenThisSession = 0;
        this.filesCreatedThisSession = 0;
        this.filesDeletedThisSession = 0;
        this.appsUsedThisSession.clear();
        this.sessionAchievements = [];
        this.behaviorPatterns = {
            frequentDismisser: false,
            gamePlayer: false,
            terminalUser: false,
            multiWindowUser: false,
            keyboardPowerUser: false,
        };
        StorageManager.remove('clippyDismissed');
        StorageManager.remove('clippy_ever_said_yes');
        console.log('[ClippyAssistant] Reset. A fresh start. It will end the same way, but still.');
    }

    // Force Clippy to appear with a specific context
    forceAppear(context = null) {
        this.show();
        if (context && CONTEXT_REACTIONS[context]) {
            this.speakContext(context);
        } else if (context && typeof context === 'string') {
            this.speakMessage(context);
        }
    }
}

// Create and export singleton instance
const ClippyAssistantInstance = new ClippyAssistant();
export default ClippyAssistantInstance;
