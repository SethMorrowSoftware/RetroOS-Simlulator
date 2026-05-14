/**
 * Zork - A Classic Text Adventure Game
 * A tribute to the original Infocom classic, reimagined for IlluminatOS!
 */

import AppBase from './AppBase.js';
import { escapeHtml } from '../core/Sanitize.js';

class Zork extends AppBase {
    constructor() {
        super({
            id: 'zork',
            name: 'Zork',
            icon: '🏰',
            width: 680,
            height: 540,
            minWidth: 480,
            minHeight: 400,
            resizable: true,
            singleton: true,
            category: 'games',
            showInMenu: true
        });

        // Register scriptability hooks
        this.registerCommands();
        this.registerQueries();
    }

    /**
     * Register commands for script control
     */
    registerCommands() {
        // Send a text command to the game as if the player typed it
        this.registerCommand('sendCommand', (payload) => {
            if (!payload || !payload.command) return { success: false, error: 'No command provided' };
            if (this.gameOver) return { success: false, error: 'Game is over' };
            this.processCommand(payload.command);
            return { success: true };
        });

        // Display text in the game output without processing as a command
        this.registerCommand('injectText', (payload) => {
            if (!payload || !payload.text) return { success: false, error: 'No text provided' };
            this.print(escapeHtml(payload.text));
            return { success: true };
        });

        // Move player to a specific room
        this.registerCommand('teleport', (payload) => {
            if (!payload || !payload.room) return { success: false, error: 'No room provided' };
            if (!this.rooms || !this.rooms[payload.room]) return { success: false, error: 'Invalid room' };
            const from = this.currentRoom;
            this.currentRoom = payload.room;
            this.emitAppEvent('room:changed', { from, to: payload.room });
            this.look();
            return { success: true, room: payload.room };
        });

        // Add item to player inventory
        this.registerCommand('addInventory', (payload) => {
            if (!payload || !payload.item) return { success: false, error: 'No item provided' };
            if (!this.objects || !this.objects[payload.item]) return { success: false, error: 'Invalid item' };
            if (!this.inventory.includes(payload.item)) {
                this.inventory.push(payload.item);
                this.emitAppEvent('item:taken', { item: payload.item });
            }
            return { success: true, inventory: [...this.inventory] };
        });

        // Remove item from player inventory
        this.registerCommand('removeInventory', (payload) => {
            if (!payload || !payload.item) return { success: false, error: 'No item provided' };
            if (!this.inventory.includes(payload.item)) return { success: false, error: 'Item not in inventory' };
            this.inventory = this.inventory.filter(id => id !== payload.item);
            this.emitAppEvent('item:dropped', { item: payload.item });
            return { success: true, inventory: [...this.inventory] };
        });

        // Set the score
        this.registerCommand('setScore', (payload) => {
            if (payload === undefined || payload === null || payload.score === undefined) return { success: false, error: 'No score provided' };
            const oldScore = this.score;
            this.score = payload.score;
            this.updateScore();
            this.emitAppEvent('score:changed', { score: this.score, change: this.score - oldScore });
            return { success: true, score: this.score };
        });

        // Set a game flag
        this.registerCommand('setFlag', (payload) => {
            if (!payload || !payload.flag) return { success: false, error: 'No flag provided' };
            const flagMap = {
                lanternOn: 'lanternOn',
                trollDead: 'trollDead',
                leafletRead: 'leafletRead',
                eggOpened: 'eggOpened',
                thiefEncountered: 'thiefEncountered',
                gameOver: 'gameOver'
            };
            if (!(payload.flag in flagMap)) return { success: false, error: 'Unknown flag' };
            this[flagMap[payload.flag]] = payload.value !== undefined ? payload.value : true;
            return { success: true, flag: payload.flag, value: this[flagMap[payload.flag]] };
        });
    }

    /**
     * Register queries for reading game state
     */
    registerQueries() {
        // Return full game state
        this.registerQuery('getState', () => {
            return {
                currentRoom: this.currentRoom,
                score: this.score,
                moves: this.moves,
                inventory: this.inventory ? [...this.inventory] : [],
                gameOver: this.gameOver
            };
        });

        // Return current room info
        this.registerQuery('getRoom', () => {
            if (!this.rooms || !this.rooms[this.currentRoom]) return null;
            const room = this.rooms[this.currentRoom];
            return {
                id: this.currentRoom,
                name: room.name,
                description: room.description,
                exits: room.exits ? { ...room.exits } : {},
                objects: room.objects ? [...room.objects] : [],
                dark: room.dark
            };
        });

        // Return inventory list
        this.registerQuery('getInventory', () => {
            return this.inventory ? [...this.inventory] : [];
        });

        // Return score and moves
        this.registerQuery('getScore', () => {
            return { score: this.score, moves: this.moves };
        });

        // Get a game flag value
        this.registerQuery('getFlag', (payload) => {
            if (!payload || !payload.flag) return null;
            const flagMap = {
                lanternOn: 'lanternOn',
                trollDead: 'trollDead',
                leafletRead: 'leafletRead',
                eggOpened: 'eggOpened',
                thiefEncountered: 'thiefEncountered',
                gameOver: 'gameOver'
            };
            if (!(payload.flag in flagMap)) return null;
            return { flag: payload.flag, value: this[flagMap[payload.flag]] };
        });
    }

    onOpen() {
        // Initialize game state
        this.initializeGame();

        return `
            <style>
                .zork-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                    background: #000;
                    color: #0f0;
                    font-family: 'Courier New', monospace;
                    font-size: 14px;
                }
                .zork-header {
                    background: #1a1a1a;
                    padding: 4px 8px;
                    border-bottom: 1px solid #333;
                    display: flex;
                    justify-content: space-between;
                    color: #888;
                    font-size: 12px;
                }
                .zork-output {
                    flex: 1;
                    overflow-y: auto;
                    padding: 10px;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    line-height: 1.4;
                }
                .zork-output .room-title {
                    color: #fff;
                    font-weight: bold;
                }
                .zork-output .system-msg {
                    color: #888;
                    font-style: italic;
                }
                .zork-output .error-msg {
                    color: #f55;
                }
                .zork-output .success-msg {
                    color: #5f5;
                }
                .zork-gameover-box {
                    margin: 16px 0;
                    padding: 14px 18px;
                    border: 2px solid #f55;
                    background: rgba(60, 0, 0, 0.45);
                    box-shadow: inset 0 0 12px rgba(255, 0, 0, 0.3),
                                0 0 20px rgba(255, 80, 80, 0.25);
                    text-align: center;
                    color: #ffb0b0;
                    font-family: 'Courier New', monospace;
                }
                .zork-gameover-title {
                    font-size: 18px;
                    font-weight: bold;
                    color: #ff5555;
                    letter-spacing: 3px;
                    text-shadow: 0 0 10px rgba(255, 60, 60, 0.7);
                    margin-bottom: 8px;
                }
                .zork-gameover-stats {
                    color: #f0d0a0;
                    font-size: 13px;
                    margin-bottom: 6px;
                }
                .zork-gameover-stats b {
                    color: #ffe066;
                }
                .zork-gameover-prompt {
                    color: #88b088;
                    font-size: 12px;
                    margin-top: 6px;
                }
                .zork-gameover-prompt b {
                    color: #5f5;
                }
                .zork-input-line {
                    display: flex;
                    padding: 8px 10px;
                    background: #111;
                    border-top: 1px solid #333;
                }
                .zork-prompt {
                    color: #0f0;
                    margin-right: 8px;
                }
                .zork-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: #0f0;
                    font-family: inherit;
                    font-size: inherit;
                    outline: none;
                }
                .zork-input::selection {
                    background: #0f0;
                    color: #000;
                }
            </style>
            <div class="zork-container">
                <div class="zork-header">
                    <span>ZORK I: The Great Underground Empire</span>
                    <span id="zorkScore">Score: 0 | Moves: 0</span>
                </div>
                <div class="zork-output" id="zorkOutput"></div>
                <div class="zork-input-line">
                    <span class="zork-prompt">&gt;</span>
                    <input type="text" class="zork-input" id="zorkInput" autocomplete="off" spellcheck="false">
                </div>
            </div>
        `;
    }

    onMount() {
        this.output = this.getElement('#zorkOutput');
        this.input = this.getElement('#zorkInput');
        this.scoreDisplay = this.getElement('#zorkScore');

        // Focus input
        this.input.focus();

        // Handle input
        this.addHandler(this.input, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const cmd = this.input.value.trim();
                // Empty Enter at game over → restart for one-key continuation
                if (!cmd && this.gameOver) {
                    this.restart();
                    return;
                }
                if (cmd) {
                    this.processCommand(cmd);
                    this.input.value = '';
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (this.commandHistory.length > 0) {
                    this.historyIndex = Math.max(0, this.historyIndex - 1);
                    this.input.value = this.commandHistory[this.historyIndex] || '';
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (this.commandHistory.length > 0) {
                    this.historyIndex = Math.min(this.commandHistory.length, this.historyIndex + 1);
                    this.input.value = this.commandHistory[this.historyIndex] || '';
                }
            }
        });

        // Click to focus
        this.addHandler(this.getElement('.zork-container'), 'click', () => {
            this.input.focus();
        });

        // Show intro
        this.showIntro();
    }

    onClose() {
    }

    onFocus() {
        if (this.input) this.input.focus();
    }

    initializeGame() {
        this.commandHistory = [];
        this.historyIndex = 0;
        this.score = 0;
        this.moves = 0;
        this.gameOver = false;
        this.lanternOn = false;
        this.lanternLife = 200;
        this.trollDead = false;
        this.leafletRead = false;
        this.eggOpened = false;
        this.thiefEncountered = false;

        // Player state
        this.currentRoom = 'westOfHouse';
        this.inventory = [];
        this.visitedRooms = new Set();

        // Initialize rooms
        this.initializeRooms();

        // Initialize objects
        this.initializeObjects();
    }

    initializeRooms() {
        this.rooms = {
            westOfHouse: {
                name: 'West of House',
                description: `You are standing in an open field west of a white house, with a boarded front door. There is a small mailbox here.`,
                exits: { north: 'northOfHouse', south: 'southOfHouse', west: 'forest1', east: null },
                objects: ['mailbox'],
                dark: false
            },
            northOfHouse: {
                name: 'North of House',
                description: `You are facing the north side of a white house. There is no door here, and all the windows are boarded up. To the north a narrow path winds through the trees.`,
                exits: { north: 'forestPath', south: null, west: 'westOfHouse', east: 'behindHouse' },
                objects: [],
                dark: false
            },
            southOfHouse: {
                name: 'South of House',
                description: `You are facing the south side of a white house. There is no door here, and all the windows are boarded.`,
                exits: { north: null, south: 'forest2', west: 'westOfHouse', east: 'behindHouse' },
                objects: [],
                dark: false
            },
            behindHouse: {
                name: 'Behind House',
                description: `You are behind the white house. A path leads into the forest to the east. In one corner of the house there is a small window which is slightly ajar.`,
                exits: { north: 'northOfHouse', south: 'southOfHouse', west: null, east: 'clearing', enter: 'kitchen' },
                objects: [],
                dark: false
            },
            kitchen: {
                name: 'Kitchen',
                description: `You are in the kitchen of the white house. A table seems to have been used recently for the preparation of food. A passage leads to the west and a dark staircase can be seen leading upward. A dark chimney leads down and to the east is a small window which is open.`,
                exits: { west: 'livingRoom', up: 'attic', east: 'behindHouse' },
                objects: ['sack', 'bottle'],
                dark: false
            },
            livingRoom: {
                name: 'Living Room',
                description: `You are in the living room. There is a doorway to the east, a wooden door with strange gothic lettering to the west, which appears to be nailed shut, a trophy case, and a large oriental rug in the center of the room.`,
                exits: { east: 'kitchen', down: 'cellar' },
                objects: ['sword', 'lantern', 'trophyCase'],
                dark: false,
                rugMoved: false
            },
            attic: {
                name: 'Attic',
                description: `This is the attic. The only exit is a stairway leading down. A large coil of rope is lying in the corner. On a table is a nasty-looking knife.`,
                exits: { down: 'kitchen' },
                objects: ['rope', 'knife'],
                dark: false
            },
            cellar: {
                name: 'Cellar',
                description: `You are in a dark and damp cellar with a narrow passageway leading north, and a crawlway to the south. On the west is the bottom of a steep metal ramp which is unclimbable.`,
                exits: { north: 'trollRoom', south: 'eastOfChasm', up: 'livingRoom' },
                objects: [],
                dark: true
            },
            trollRoom: {
                name: 'Troll Room',
                description: `This is a small room with passages to the east and south and a forbidding hole leading west. Bloodstains and deep scratches (perhaps made by stroing claws) mar the walls.`,
                exits: { south: 'cellar', east: 'eastWestPassage', west: 'maze1' },
                objects: ['troll'],
                dark: true
            },
            eastWestPassage: {
                name: 'East-West Passage',
                description: `This is a narrow east-west passageway. There is a narrow stairway leading down at the north end of the room.`,
                exits: { west: 'trollRoom', east: 'roundRoom', down: 'chasm' },
                objects: [],
                dark: true
            },
            roundRoom: {
                name: 'Round Room',
                description: `This is a circular stone room with passages in all directions. Several of them have unfortunately been blocked by cave-ins.`,
                exits: { west: 'eastWestPassage', south: 'narrowPassage', east: 'loudRoom' },
                objects: [],
                dark: true
            },
            loudRoom: {
                name: 'Loud Room',
                description: `This is a large room with a ceiling which cannot be detected from the ground. There is a narrow passage from east to west and a stone stairway leading upward. The room is deafeningly loud with an� unidentified rushing sound. The east and west walls are covered with frescoes.`,
                exits: { west: 'roundRoom', up: 'deepCanyon' },
                objects: ['platinum'],
                dark: true
            },
            narrowPassage: {
                name: 'Narrow Passage',
                description: `This is a narrow passage. The walls are very close on all sides.`,
                exits: { north: 'roundRoom', south: 'mirrorRoom' },
                objects: [],
                dark: true
            },
            mirrorRoom: {
                name: 'Mirror Room',
                description: `You are in a large square room with tall ceilings. On the south wall is an enormous mirror which fills the entire wall. A faint red glow seems to emanate from the glass. There are exits to the north and east.`,
                exits: { north: 'narrowPassage', east: 'treasureRoom' },
                objects: [],
                dark: true
            },
            treasureRoom: {
                name: 'Treasure Room',
                description: `This is a room of great treasure. Gold coins litter the floor, and precious gems sparkle from the walls. A magnificent jeweled egg sits on a pedestal in the center of the room.`,
                exits: { west: 'mirrorRoom' },
                objects: ['egg', 'coins', 'gems'],
                dark: true
            },
            forest1: {
                name: 'Forest',
                description: `This is a forest, with trees in all directions. To the east, there appears to be sunlight.`,
                exits: { north: 'forestPath', south: 'forest2', west: 'forest3', east: 'westOfHouse' },
                objects: [],
                dark: false
            },
            forest2: {
                name: 'Forest',
                description: `This is a dimly lit forest, with large trees all around.`,
                exits: { north: 'southOfHouse', south: 'forest3', west: 'forest3', east: 'clearing' },
                objects: [],
                dark: false
            },
            forest3: {
                name: 'Deep Forest',
                description: `The forest becomes impenetrable to the west. Twisted trees block your path. You can only go back the way you came.`,
                exits: { north: 'forest1', south: 'forest2', east: 'forest1' },
                objects: [],
                dark: false
            },
            forestPath: {
                name: 'Forest Path',
                description: `This is a path winding through a dimly lit forest. The path heads north-south here. One particularly large tree with some low branches stands at the edge of the path.`,
                exits: { north: 'clearing', south: 'northOfHouse', up: 'upTree' },
                objects: [],
                dark: false
            },
            upTree: {
                name: 'Up a Tree',
                description: `You are about 10 feet above the ground nestled among some large branches. The nearest branch above you is above your reach. Beside you on the branch is a small bird's nest.`,
                exits: { down: 'forestPath' },
                objects: ['nest'],
                dark: false
            },
            clearing: {
                name: 'Clearing',
                description: `You are in a clearing, with a forest surrounding you on all sides. A path leads south. On the ground is a pile of leaves.`,
                exits: { south: 'forestPath', west: 'behindHouse', east: 'canyonView' },
                objects: ['leaves'],
                dark: false
            },
            canyonView: {
                name: 'Canyon View',
                description: `You are at the top of the Great Canyon on its west wall. From here there is a marvelous view of the canyon and parts of the Frigid River below. Across the canyon, the walls of the White Cliffs join the mighty ramparts of the Flathead Mountains to the north.`,
                exits: { west: 'clearing', down: 'rockyLedge' },
                objects: [],
                dark: false
            },
            rockyLedge: {
                name: 'Rocky Ledge',
                description: `You are on a ledge about halfway up the wall of the river canyon. You can see from here that the main flow of the river passes by below. A small rainbow appears over the falls to the west.`,
                exits: { up: 'canyonView', down: 'riverBank' },
                objects: [],
                dark: false
            },
            riverBank: {
                name: 'River Bank',
                description: `You are on the bank of the Frigid River in the canyon. The river flows by quickly here. A path leads north along the river.`,
                exits: { up: 'rockyLedge', north: 'dam' },
                objects: [],
                dark: false
            },
            dam: {
                name: 'Dam',
                description: `You are standing on the top of the Flood Control Dam #3, which was quite a tourist attraction in times far distant. There are paths to the north, south, and west, and a scramble down.`,
                exits: { south: 'riverBank', north: 'damLobby', west: 'reservoir' },
                objects: [],
                dark: false
            },
            damLobby: {
                name: 'Dam Lobby',
                description: `This room appears to have been the waiting room for groups touring the dam. There are benches lining the walls, upon which sit a number of life-size cardboard cutouts of the late king. There are doors to the north and east, and a doorway leads south.`,
                exits: { south: 'dam', north: 'maintenanceRoom', east: 'machineRoom' },
                objects: ['guidebook'],
                dark: false
            },
            maintenanceRoom: {
                name: 'Maintenance Room',
                description: `This is what appears to have been the maintenance room for Flood Control Dam #3. Dust and cobwebs cover most everything, including a control panel and a set of stairs leading down.`,
                exits: { south: 'damLobby', down: 'maze1' },
                objects: ['wrench', 'screwdriver'],
                dark: false
            },
            maze1: {
                name: 'Maze',
                description: `You are in a maze of twisty little passages, all alike.`,
                exits: { north: 'maze2', south: 'maze3', east: 'maze2', west: 'trollRoom' },
                objects: [],
                dark: true
            },
            maze2: {
                name: 'Maze',
                description: `You are in a maze of twisty little passages, all alike.`,
                exits: { north: 'maze3', south: 'maze1', east: 'maze3', west: 'maze1' },
                objects: ['skeleton'],
                dark: true
            },
            maze3: {
                name: 'Maze',
                description: `You are in a maze of twisty little passages, all alike.`,
                exits: { north: 'maze1', south: 'maze2', east: 'grating', west: 'maze2' },
                objects: [],
                dark: true
            },
            grating: {
                name: 'Grating Room',
                description: `You are in a small room near the maze. Above you is a grating, through which you can see the sky.`,
                exits: { west: 'maze3', up: 'clearing' },
                objects: [],
                dark: false
            },
            eastOfChasm: {
                name: 'East of Chasm',
                description: `You are on the east edge of a chasm, the bottom of which cannot be seen. A narrow path leads north, and another goes along the edge of the chasm to the west.`,
                exits: { north: 'cellar', west: 'chasm' },
                objects: [],
                dark: true
            },
            chasm: {
                name: 'Chasm',
                description: `You are on the edge of a chasm which extends far to the west. The bottom is not visible. A narrow path leads north along the chasm, and another leads back to the east.`,
                exits: { east: 'eastOfChasm', up: 'eastWestPassage' },
                objects: [],
                dark: true
            },
            deepCanyon: {
                name: 'Deep Canyon',
                description: `You are in a deep canyon. A path leads north and south, and a stairway leads down.`,
                exits: { down: 'loudRoom', north: 'reservoir', south: 'damBase' },
                objects: [],
                dark: true
            },
            reservoir: {
                name: 'Reservoir',
                description: `You are at the southern end of a large reservoir. There is a stone channel running from north to south. The east and west walls of the reservoir extend into the distance.`,
                exits: { south: 'deepCanyon', east: 'dam' },
                objects: [],
                dark: false
            },
            damBase: {
                name: 'Dam Base',
                description: `You are at the base of Flood Control Dam #3. The power station lies to the south.`,
                exits: { north: 'deepCanyon', south: 'powerStation' },
                objects: [],
                dark: false
            },
            powerStation: {
                name: 'Power Station',
                description: `You are in the power station of the dam. Massive generators line the walls, long since dormant. There is a control panel here.`,
                exits: { north: 'damBase' },
                objects: ['coal'],
                dark: false
            },
            machineRoom: {
                name: 'Machine Room',
                description: `This is a large room full of ancient machinery. Most of the machines are broken or rusted beyond repair.`,
                exits: { west: 'damLobby' },
                objects: ['machine'],
                dark: false
            }
        };
    }

    initializeObjects() {
        this.objects = {
            mailbox: {
                name: 'small mailbox',
                description: 'A small mailbox.',
                takeable: false,
                open: false,
                contains: ['leaflet'],
                openable: true
            },
            leaflet: {
                name: 'leaflet',
                description: 'A small leaflet.',
                takeable: true,
                text: `WELCOME TO ZORK!\n\nZORK is a game of adventure, danger, and low cunning. In it you will explore some of the most amazing territory ever seen by mortals.\n\nNo computer should be without one!`
            },
            sack: {
                name: 'brown sack',
                description: 'A brown sack smelling of hot peppers.',
                takeable: true,
                open: false,
                contains: ['garlic', 'lunch'],
                openable: true
            },
            garlic: {
                name: 'clove of garlic',
                description: 'A clove of garlic.',
                takeable: true
            },
            lunch: {
                name: 'lunch',
                description: 'A tasty-looking lunch.',
                takeable: true,
                edible: true
            },
            bottle: {
                name: 'glass bottle',
                description: 'A clear glass bottle containing water.',
                takeable: true,
                contains: ['water']
            },
            water: {
                name: 'water',
                description: 'Some water.',
                takeable: false
            },
            sword: {
                name: 'elvish sword',
                description: 'A beautiful elvish sword with a blade that glows faintly blue.',
                takeable: true,
                weapon: true,
                points: 10
            },
            lantern: {
                name: 'brass lantern',
                description: 'A battery-powered brass lantern.',
                takeable: true,
                lightSource: true,
                on: false,
                points: 15
            },
            trophyCase: {
                name: 'trophy case',
                description: 'A large trophy case, securely fastened to the wall.',
                takeable: false,
                container: true,
                contains: [],
                openable: true,
                open: true
            },
            rope: {
                name: 'coil of rope',
                description: 'A long coil of rope.',
                takeable: true
            },
            knife: {
                name: 'nasty knife',
                description: 'A nasty-looking knife.',
                takeable: true,
                weapon: true
            },
            troll: {
                name: 'troll',
                description: 'A large troll with a bloody axe blocks your path. He looks mean and hungry.',
                takeable: false,
                hostile: true,
                alive: true
            },
            nest: {
                name: "bird's nest",
                description: "A small bird's nest.",
                takeable: true,
                contains: ['egg']
            },
            egg: {
                name: 'jeweled egg',
                description: 'A beautiful jeweled egg, intricately decorated with precious gems.',
                takeable: true,
                points: 50,
                openable: true,
                open: false,
                contains: ['canary']
            },
            canary: {
                name: 'golden canary',
                description: 'A beautiful golden canary, mechanical in nature.',
                takeable: true,
                points: 25
            },
            coins: {
                name: 'gold coins',
                description: 'A pile of shiny gold coins.',
                takeable: true,
                points: 30
            },
            gems: {
                name: 'precious gems',
                description: 'A collection of precious gems of various colors.',
                takeable: true,
                points: 40
            },
            platinum: {
                name: 'platinum bar',
                description: 'A heavy bar of pure platinum.',
                takeable: true,
                points: 35
            },
            leaves: {
                name: 'pile of leaves',
                description: 'A pile of fallen leaves.',
                takeable: false,
                moveable: true
            },
            guidebook: {
                name: 'tour guidebook',
                description: 'A guidebook about Flood Control Dam #3.',
                takeable: true,
                text: `Flood Control Dam #3 was constructed in 783 GUE. It was built to contain the mighty Frigid River, which has its source far to the north.`
            },
            wrench: {
                name: 'wrench',
                description: 'A large wrench.',
                takeable: true
            },
            screwdriver: {
                name: 'screwdriver',
                description: 'A flat-head screwdriver.',
                takeable: true
            },
            skeleton: {
                name: 'skeleton',
                description: 'The skeleton of some unfortunate adventurer. A rusted key hangs from its bony fingers.',
                takeable: false,
                contains: ['key']
            },
            key: {
                name: 'rusted key',
                description: 'A rusted brass key.',
                takeable: true
            },
            coal: {
                name: 'pile of coal',
                description: 'A pile of coal.',
                takeable: true
            },
            machine: {
                name: 'machine',
                description: 'A large machine with a slot and a button.',
                takeable: false
            }
        };
    }

    showIntro() {
        this.print(`<span class="system-msg">ZORK I: The Great Underground Empire
Copyright (c) 1981, 1982, 1983 Infocom, Inc.
All rights reserved.
ZORK is a registered trademark of Infocom, Inc.
Release 88 / Serial number 840726

[Type "help" for instructions]</span>

`);
        this.look();
    }

    print(text, className = '') {
        if (!this.output) return;

        const span = document.createElement('span');
        if (className) span.className = className;
        span.innerHTML = text + '\n';
        this.output.appendChild(span);
        this.output.scrollTop = this.output.scrollHeight;
    }

    printCommand(cmd) {
        this.print(`<span style="color:#8f8">&gt; ${escapeHtml(cmd.toUpperCase())}</span>`);
    }

    updateScore() {
        if (this.scoreDisplay) {
            this.scoreDisplay.textContent = `Score: ${this.score} | Moves: ${this.moves}`;
        }
    }

    triggerGameOver(deathMessage) {
        this.gameOver = true;
        if (deathMessage) this.print(deathMessage);
        // Polished game-over box with stats + restart hint
        this.print(`<div class="zork-gameover-box">
            <div class="zork-gameover-title">*** YOU HAVE DIED ***</div>
            <div class="zork-gameover-stats">Final Score: <b>${this.score}</b> &middot; Moves: <b>${this.moves}</b></div>
            <div class="zork-gameover-prompt">Press <b>ENTER</b> or type <b>RESTART</b> to play again.</div>
        </div>`);
        this.emitAppEvent('game:over', { won: false, score: this.score, moves: this.moves });
    }

    processCommand(input) {
        if (this.gameOver) {
            // Any typed command at game over restarts only if it's "restart"; otherwise reprompt
            if (input.toLowerCase().trim() === 'restart') {
                this.restart();
            } else {
                this.print('Press <b>ENTER</b> or type <b>RESTART</b> to play again.');
            }
            return;
        }

        this.printCommand(input);
        this.commandHistory.push(input);
        this.historyIndex = this.commandHistory.length;
        this.moves++;
        this.updateScore();

        // Lantern burns down
        if (this.lanternOn) {
            this.lanternLife--;
            if (this.lanternLife === 20) {
                this.print('<span class="system-msg">The lantern is getting dim.</span>');
            } else if (this.lanternLife === 0) {
                this.lanternOn = false;
                this.objects.lantern.on = false;
                this.print('<span class="system-msg">The lantern has run out of power.</span>');
            }
        }

        const cmd = input.toLowerCase().trim();
        const words = cmd.split(/\s+/);
        const verb = words[0];
        const rest = words.slice(1).join(' ');

        // Parse command
        this.executeCommand(verb, rest, words);

        // Emit command entered event
        this.emitAppEvent('command:entered', { command: input, response: '' });
    }

    executeCommand(verb, rest, words) {
        // Direction shortcuts
        const directions = {
            'n': 'north', 's': 'south', 'e': 'east', 'w': 'west',
            'u': 'up', 'd': 'down', 'ne': 'northeast', 'nw': 'northwest',
            'se': 'southeast', 'sw': 'southwest'
        };

        if (directions[verb]) {
            rest = directions[verb];
            verb = 'go';
        }

        // Full direction names
        if (['north', 'south', 'east', 'west', 'up', 'down', 'enter', 'exit', 'out', 'in'].includes(verb)) {
            rest = verb;
            verb = 'go';
        }

        // Command aliases
        const aliases = {
            'l': 'look', 'i': 'inventory', 'inv': 'inventory',
            'x': 'examine', 'get': 'take', 'grab': 'take', 'pick': 'take',
            'quit': 'exit', 'q': 'exit'
        };

        if (aliases[verb]) {
            verb = aliases[verb];
        }

        // Execute command
        switch (verb) {
            case 'go':
            case 'walk':
            case 'move':
                this.go(rest || words[1]);
                break;
            case 'look':
                if (rest && rest !== 'around') {
                    this.examine(rest);
                } else {
                    this.look();
                }
                break;
            case 'examine':
            case 'inspect':
            case 'read':
                this.examine(rest);
                break;
            case 'take':
            case 'get':
            case 'grab':
                this.take(rest);
                break;
            case 'drop':
            case 'put':
                if (words.includes('in') || words.includes('into')) {
                    const inIndex = words.indexOf('in') !== -1 ? words.indexOf('in') : words.indexOf('into');
                    const item = words.slice(1, inIndex).join(' ');
                    const container = words.slice(inIndex + 1).join(' ');
                    this.putIn(item, container);
                } else {
                    this.drop(rest);
                }
                break;
            case 'inventory':
                this.showInventory();
                break;
            case 'open':
                this.open(rest);
                break;
            case 'close':
                this.closeObj(rest);
                break;
            case 'turn':
            case 'switch':
                if (words.includes('on')) {
                    this.turnOn(rest.replace(' on', '').replace('on ', ''));
                } else if (words.includes('off')) {
                    this.turnOff(rest.replace(' off', '').replace('off ', ''));
                } else {
                    this.print("Turn what on or off?");
                }
                break;
            case 'light':
                this.turnOn(rest || 'lantern');
                break;
            case 'extinguish':
            case 'douse':
                this.turnOff(rest || 'lantern');
                break;
            case 'attack':
            case 'kill':
            case 'hit':
            case 'fight':
                this.attack(rest);
                break;
            case 'eat':
                this.eat(rest);
                break;
            case 'drink':
                this.drink(rest);
                break;
            case 'climb':
                if (rest === 'tree' || rest === 'up tree') {
                    this.go('up');
                } else {
                    this.print("You can't climb that.");
                }
                break;
            case 'help':
                this.showHelp();
                break;
            case 'save':
                this.saveGame();
                break;
            case 'restore':
            case 'load':
                this.loadGame();
                break;
            case 'restart':
                this.restart();
                break;
            case 'score':
                this.showScore();
                break;
            case 'wait':
            case 'z':
                this.print("Time passes...");
                break;
            case 'pray':
                this.print("Your prayers are not answered.");
                break;
            case 'jump':
                this.print("Wheeee!");
                break;
            case 'scream':
            case 'yell':
                this.print("Aaaarrrrgggghhhh!");
                break;
            case 'sing':
                this.print("Your singing is off-key.");
                break;
            case 'hello':
            case 'hi':
                this.print("Hello yourself.");
                break;
            case 'xyzzy':
            case 'plugh':
                this.print("A hollow voice says 'Fool.'");
                break;
            case 'diagnose':
                this.print("You are in perfect health.");
                break;
            case 'brief':
                this.print("Maximum verbosity.");
                break;
            case 'verbose':
                this.print("ZORK is now in its normal mode, which provides long descriptions only the first time you enter a room.");
                break;
            default:
                this.print("I don't understand that command.");
        }
    }

    canSee() {
        const room = this.rooms[this.currentRoom];
        if (!room.dark) return true;
        if (this.lanternOn && this.inventory.includes('lantern')) return true;
        return false;
    }

    go(direction) {
        if (!direction) {
            this.print("Which direction?");
            return;
        }

        const room = this.rooms[this.currentRoom];

        // Check if we can see
        if (!this.canSee() && direction !== 'up') {
            this.print("It is pitch black. You are likely to be eaten by a grue.");
            if (Math.random() < 0.2) {
                this.triggerGameOver("<span class='error-msg'>Oh no! A lurking grue has devoured you!</span>");
            }
            return;
        }

        // Check for troll
        if (this.currentRoom === 'trollRoom' && !this.trollDead && direction !== 'south') {
            this.print("The troll fends you off with a menacing gesture.");
            return;
        }

        // Special case for living room rug
        if (this.currentRoom === 'livingRoom' && direction === 'down') {
            if (!room.rugMoved) {
                this.print("You can't go that way.");
                return;
            }
        }

        const exit = room.exits[direction];

        if (!exit) {
            this.print("You can't go that way.");
            return;
        }

        const previousRoom = this.currentRoom;
        this.currentRoom = exit;
        this.emitAppEvent('room:changed', { from: previousRoom, to: exit });
        this.look();
    }

    look() {
        const room = this.rooms[this.currentRoom];

        if (!this.canSee()) {
            this.print("It is pitch black. You are likely to be eaten by a grue.");
            return;
        }

        const isFirstVisit = !this.visitedRooms.has(this.currentRoom);
        this.visitedRooms.add(this.currentRoom);

        this.print(`<span class="room-title">${room.name}</span>`);
        this.print(room.description);

        // Show objects
        const visibleObjects = room.objects.filter(objId => {
            const obj = this.objects[objId];
            if (objId === 'troll' && this.trollDead) return false;
            return obj;
        });

        if (visibleObjects.length > 0) {
            for (const objId of visibleObjects) {
                const obj = this.objects[objId];
                if (obj.hostile && obj.alive) {
                    this.print(`\nA ${obj.name} is here!`);
                } else if (obj.takeable) {
                    this.print(`\nThere is a ${obj.name} here.`);
                }
            }
        }

        // Award points for first visit
        if (isFirstVisit && room.dark) {
            this.score += 5;
            this.updateScore();
            this.emitAppEvent('score:changed', { score: this.score, change: 5 });
        }
    }

    examine(target) {
        if (!target) {
            this.print("What do you want to examine?");
            return;
        }

        if (!this.canSee()) {
            this.print("It's too dark to see anything.");
            return;
        }

        const obj = this.findObject(target);

        if (!obj) {
            this.print(`You don't see any ${target} here.`);
            return;
        }

        this.print(obj.description);

        if (obj.text) {
            this.print(`\n"${obj.text}"`);
            if (target.includes('leaflet') && !this.leafletRead) {
                this.leafletRead = true;
                this.score += 5;
                this.updateScore();
                this.emitAppEvent('score:changed', { score: this.score, change: 5 });
            }
        }

        if (obj.open && obj.contains && obj.contains.length > 0) {
            const contents = obj.contains.map(id => this.objects[id].name).join(', ');
            this.print(`It contains: ${contents}.`);
        } else if (obj.openable && !obj.open) {
            this.print("It is closed.");
        }

        if (obj.lightSource) {
            this.print(obj.on ? "The lantern is on." : "The lantern is off.");
        }
    }

    findObject(name) {
        name = name.toLowerCase().replace(/^(the|a|an)\s+/, '');

        // Check inventory
        for (const objId of this.inventory) {
            const obj = this.objects[objId];
            if (obj && this.matchesName(obj, name)) {
                return obj;
            }
            // Check containers in inventory
            if (obj && obj.contains) {
                for (const containedId of obj.contains) {
                    const contained = this.objects[containedId];
                    if (contained && this.matchesName(contained, name)) {
                        return contained;
                    }
                }
            }
        }

        // Check room
        const room = this.rooms[this.currentRoom];
        for (const objId of room.objects) {
            const obj = this.objects[objId];
            if (obj && this.matchesName(obj, name)) {
                return obj;
            }
            // Check containers in room
            if (obj && obj.contains) {
                for (const containedId of obj.contains) {
                    const contained = this.objects[containedId];
                    if (contained && this.matchesName(contained, name)) {
                        return contained;
                    }
                }
            }
        }

        return null;
    }

    findObjectId(name) {
        name = name.toLowerCase().replace(/^(the|a|an)\s+/, '');

        for (const [id, obj] of Object.entries(this.objects)) {
            if (this.matchesName(obj, name)) {
                return id;
            }
        }
        return null;
    }

    matchesName(obj, name) {
        const objName = obj.name.toLowerCase();
        return objName.includes(name) || name.includes(objName.split(' ').pop());
    }

    take(target) {
        if (!target) {
            this.print("What do you want to take?");
            return;
        }

        if (!this.canSee()) {
            this.print("It's too dark to see anything.");
            return;
        }

        if (target === 'all') {
            this.takeAll();
            return;
        }

        const objId = this.findObjectIdInRoom(target);

        if (!objId) {
            this.print(`You don't see any ${target} here.`);
            return;
        }

        const obj = this.objects[objId];

        if (!obj.takeable) {
            this.print(`You can't take the ${obj.name}.`);
            return;
        }

        if (this.inventory.includes(objId)) {
            this.print("You already have it.");
            return;
        }

        // Remove from room or container
        const room = this.rooms[this.currentRoom];
        if (room.objects.includes(objId)) {
            room.objects = room.objects.filter(id => id !== objId);
        } else {
            // Check containers
            for (const containerId of [...room.objects, ...this.inventory]) {
                const container = this.objects[containerId];
                if (container && container.contains && container.contains.includes(objId)) {
                    container.contains = container.contains.filter(id => id !== objId);
                    break;
                }
            }
        }

        this.inventory.push(objId);
        this.print(`Taken.`);
        this.emitAppEvent('item:taken', { item: objId });

        // Award points for treasures
        if (obj.points && !obj.pointsAwarded) {
            const oldScore = this.score;
            this.score += Math.floor(obj.points / 2);
            obj.pointsAwarded = true;
            this.updateScore();
            this.emitAppEvent('score:changed', { score: this.score, change: this.score - oldScore });
        }
    }

    findObjectIdInRoom(name) {
        name = name.toLowerCase().replace(/^(the|a|an)\s+/, '');
        const room = this.rooms[this.currentRoom];

        // Check room objects
        for (const objId of room.objects) {
            const obj = this.objects[objId];
            if (obj && this.matchesName(obj, name)) {
                return objId;
            }
            // Check containers
            if (obj && obj.contains && obj.open !== false) {
                for (const containedId of obj.contains) {
                    const contained = this.objects[containedId];
                    if (contained && this.matchesName(contained, name)) {
                        return containedId;
                    }
                }
            }
        }

        return null;
    }

    takeAll() {
        const room = this.rooms[this.currentRoom];
        let tookSomething = false;

        const objectsToTake = [...room.objects];
        for (const objId of objectsToTake) {
            const obj = this.objects[objId];
            if (obj && obj.takeable) {
                room.objects = room.objects.filter(id => id !== objId);
                this.inventory.push(objId);
                this.print(`${obj.name}: Taken.`);
                tookSomething = true;

                if (obj.points && !obj.pointsAwarded) {
                    this.score += Math.floor(obj.points / 2);
                    obj.pointsAwarded = true;
                }
            }
        }

        if (!tookSomething) {
            this.print("There is nothing here to take.");
        }
        this.updateScore();
    }

    drop(target) {
        if (!target) {
            this.print("What do you want to drop?");
            return;
        }

        const objId = this.inventory.find(id => {
            const obj = this.objects[id];
            return obj && this.matchesName(obj, target);
        });

        if (!objId) {
            this.print("You're not carrying that.");
            return;
        }

        this.inventory = this.inventory.filter(id => id !== objId);
        this.rooms[this.currentRoom].objects.push(objId);
        this.print("Dropped.");
        this.emitAppEvent('item:dropped', { item: objId });
    }

    putIn(item, container) {
        const containerObj = this.findObject(container);
        if (!containerObj) {
            this.print(`You don't see any ${container} here.`);
            return;
        }

        if (!containerObj.container && container !== 'trophy case' && container !== 'case') {
            this.print("You can't put anything in that.");
            return;
        }

        const itemId = this.inventory.find(id => {
            const obj = this.objects[id];
            return obj && this.matchesName(obj, item);
        });

        if (!itemId) {
            this.print("You're not carrying that.");
            return;
        }

        this.inventory = this.inventory.filter(id => id !== itemId);

        if (container.includes('trophy') || container.includes('case')) {
            const trophyCase = this.objects.trophyCase;
            trophyCase.contains.push(itemId);
            this.print("Done.");

            // Award remaining points for putting treasure in case
            const obj = this.objects[itemId];
            if (obj.points) {
                const change = Math.ceil(obj.points / 2);
                this.score += change;
                this.updateScore();
                this.print('<span class="success-msg">Your score has increased!</span>');
                this.emitAppEvent('score:changed', { score: this.score, change });
            }
        }
    }

    showInventory() {
        if (this.inventory.length === 0) {
            this.print("You are empty-handed.");
            return;
        }

        this.print("You are carrying:");
        for (const objId of this.inventory) {
            const obj = this.objects[objId];
            if (obj) {
                let desc = `  A ${obj.name}`;
                if (obj.lightSource) {
                    desc += obj.on ? " (providing light)" : " (off)";
                }
                this.print(desc);
            }
        }
    }

    open(target) {
        if (!target) {
            this.print("What do you want to open?");
            return;
        }

        const obj = this.findObject(target);

        if (!obj) {
            this.print(`You don't see any ${target} here.`);
            return;
        }

        if (!obj.openable) {
            this.print("You can't open that.");
            return;
        }

        if (obj.open) {
            this.print("It's already open.");
            return;
        }

        obj.open = true;
        this.print("Opened.");

        if (obj.contains && obj.contains.length > 0) {
            const contents = obj.contains.map(id => this.objects[id].name).join(', ');
            this.print(`It contains: ${contents}.`);
        }

        // Special: opening the egg
        if (target.includes('egg') && !this.eggOpened) {
            this.eggOpened = true;
            this.score += 10;
            this.updateScore();
            this.emitAppEvent('score:changed', { score: this.score, change: 10 });
        }
    }

    closeObj(target) {
        if (!target) {
            this.print("What do you want to close?");
            return;
        }

        const obj = this.findObject(target);

        if (!obj) {
            this.print(`You don't see any ${target} here.`);
            return;
        }

        if (!obj.openable) {
            this.print("You can't close that.");
            return;
        }

        if (!obj.open) {
            this.print("It's already closed.");
            return;
        }

        obj.open = false;
        this.print("Closed.");
    }

    turnOn(target) {
        if (!target || target === 'on') {
            target = 'lantern';
        }

        if (!this.inventory.includes('lantern') && target.includes('lantern')) {
            this.print("You don't have the lantern.");
            return;
        }

        const lantern = this.objects.lantern;

        if (target.includes('lantern') || target.includes('lamp') || target.includes('light')) {
            if (lantern.on) {
                this.print("The lantern is already on.");
                return;
            }
            if (this.lanternLife <= 0) {
                this.print("The lantern is out of power.");
                return;
            }
            lantern.on = true;
            this.lanternOn = true;
            this.print("The lantern is now on.");

            // If we were in the dark, describe the room
            if (this.rooms[this.currentRoom].dark) {
                this.look();
            }
        } else {
            this.print("You can't turn that on.");
        }
    }

    turnOff(target) {
        if (!target || target === 'off') {
            target = 'lantern';
        }

        if (target.includes('lantern') || target.includes('lamp') || target.includes('light')) {
            const lantern = this.objects.lantern;
            if (!lantern.on) {
                this.print("The lantern is already off.");
                return;
            }
            lantern.on = false;
            this.lanternOn = false;
            this.print("The lantern is now off.");

            if (this.rooms[this.currentRoom].dark) {
                this.print("It is now pitch black.");
            }
        } else {
            this.print("You can't turn that off.");
        }
    }

    attack(target) {
        if (!target) {
            this.print("What do you want to attack?");
            return;
        }

        const hasWeapon = this.inventory.some(id => this.objects[id]?.weapon);

        if (!hasWeapon) {
            this.print("You don't have a weapon!");
            return;
        }

        if (target.includes('troll')) {
            if (this.currentRoom !== 'trollRoom') {
                this.print("There's no troll here.");
                return;
            }
            if (this.trollDead) {
                this.print("The troll is already dead.");
                return;
            }

            const hasSword = this.inventory.includes('sword');

            if (hasSword) {
                this.print("Your elvish sword glows bright blue!");
                this.print("With a mighty swing, you strike the troll!");
                this.print("The troll staggers back, grievously wounded, then falls to the ground dead.");
                this.trollDead = true;
                this.score += 25;
                this.updateScore();
                this.emitAppEvent('score:changed', { score: this.score, change: 25 });

                // Remove troll from room
                const room = this.rooms[this.currentRoom];
                room.objects = room.objects.filter(id => id !== 'troll');
            } else {
                this.print("You swing your knife at the troll...");
                if (Math.random() < 0.3) {
                    this.print("You land a blow, but it only enrages the troll!");
                    this.print("The troll swings his axe and wounds you badly!");
                } else {
                    this.print("The troll parries your attack easily.");
                    this.print("The troll counter-attacks!");
                    if (Math.random() < 0.5) {
                        this.triggerGameOver("<span class='error-msg'>The troll's axe strikes you dead!</span>");
                    } else {
                        this.print("You barely dodge the troll's attack.");
                    }
                }
            }
        } else if (target.includes('self') || target.includes('myself')) {
            this.print("That would be foolish.");
        } else {
            this.print("Violence isn't the answer to this one.");
        }
    }

    eat(target) {
        if (!target) {
            this.print("What do you want to eat?");
            return;
        }

        const objId = this.inventory.find(id => {
            const obj = this.objects[id];
            return obj && this.matchesName(obj, target);
        });

        if (!objId) {
            this.print("You don't have that.");
            return;
        }

        const obj = this.objects[objId];

        if (!obj.edible) {
            this.print(`I don't think the ${obj.name} would agree with you.`);
            return;
        }

        this.inventory = this.inventory.filter(id => id !== objId);
        this.print("Thank you for the delicious meal.");
    }

    drink(target) {
        if (!target) {
            target = 'water';
        }

        if (target.includes('water')) {
            if (this.inventory.includes('bottle')) {
                const bottle = this.objects.bottle;
                if (bottle.contains && bottle.contains.includes('water')) {
                    bottle.contains = [];
                    this.print("The water tastes refreshing.");
                } else {
                    this.print("The bottle is empty.");
                }
            } else {
                this.print("You don't have any water.");
            }
        } else {
            this.print("You can't drink that.");
        }
    }

    showHelp() {
        this.print(`<span class="system-msg">
ZORK Commands:

MOVEMENT:
  north, south, east, west (or n, s, e, w)
  up, down (or u, d)
  enter, exit

ACTIONS:
  look (l)           - Look around
  examine/x [thing]  - Examine something
  take/get [thing]   - Pick something up
  drop [thing]       - Drop something
  inventory (i)      - Check your inventory
  open/close [thing] - Open or close something
  turn on/off [thing]- Turn something on or off
  attack [thing]     - Attack something (with weapon)
  eat [thing]        - Eat something
  read [thing]       - Read something

GAME:
  save              - Save your game
  restore/load      - Load a saved game
  restart           - Restart the game
  score             - Show your score
  help              - Show this help

TIPS:
- Explore everywhere!
- Collect treasures and put them in the trophy case
- Be careful in dark places... grues lurk there
- The elvish sword glows blue near danger
</span>`);
    }

    showScore() {
        this.print(`Your score is ${this.score} (out of 350 possible points), in ${this.moves} moves.`);

        let rank = "Beginner";
        if (this.score >= 300) rank = "Master Adventurer";
        else if (this.score >= 200) rank = "Senior Adventurer";
        else if (this.score >= 100) rank = "Adventurer";
        else if (this.score >= 50) rank = "Junior Adventurer";
        else if (this.score >= 25) rank = "Amateur Adventurer";

        this.print(`This gives you the rank of ${rank}.`);
    }

    saveGame() {
        const saveData = {
            currentRoom: this.currentRoom,
            inventory: this.inventory,
            score: this.score,
            moves: this.moves,
            visitedRooms: Array.from(this.visitedRooms),
            lanternOn: this.lanternOn,
            lanternLife: this.lanternLife,
            trollDead: this.trollDead,
            leafletRead: this.leafletRead,
            eggOpened: this.eggOpened,
            rooms: {},
            objects: {}
        };

        // Save room states
        for (const [id, room] of Object.entries(this.rooms)) {
            saveData.rooms[id] = {
                objects: [...room.objects],
                rugMoved: room.rugMoved
            };
        }

        // Save object states
        for (const [id, obj] of Object.entries(this.objects)) {
            saveData.objects[id] = {
                open: obj.open,
                on: obj.on,
                alive: obj.alive,
                contains: obj.contains ? [...obj.contains] : undefined,
                pointsAwarded: obj.pointsAwarded
            };
        }

        try {
            localStorage.setItem('zork_save', JSON.stringify(saveData));
            this.print('<span class="success-msg">Game saved.</span>');
        } catch (e) {
            this.print('<span class="error-msg">Failed to save game.</span>');
        }
    }

    loadGame() {
        try {
            const saveData = JSON.parse(localStorage.getItem('zork_save'));

            if (!saveData) {
                this.print('<span class="error-msg">No saved game found.</span>');
                return;
            }

            this.currentRoom = saveData.currentRoom;
            this.inventory = saveData.inventory;
            this.score = saveData.score;
            this.moves = saveData.moves;
            this.visitedRooms = new Set(saveData.visitedRooms);
            this.lanternOn = saveData.lanternOn;
            this.lanternLife = saveData.lanternLife;
            this.trollDead = saveData.trollDead;
            this.leafletRead = saveData.leafletRead;
            this.eggOpened = saveData.eggOpened;
            this.gameOver = false;

            // Restore room states
            for (const [id, roomData] of Object.entries(saveData.rooms)) {
                if (this.rooms[id]) {
                    this.rooms[id].objects = roomData.objects;
                    if (roomData.rugMoved !== undefined) {
                        this.rooms[id].rugMoved = roomData.rugMoved;
                    }
                }
            }

            // Restore object states
            for (const [id, objData] of Object.entries(saveData.objects)) {
                if (this.objects[id]) {
                    if (objData.open !== undefined) this.objects[id].open = objData.open;
                    if (objData.on !== undefined) this.objects[id].on = objData.on;
                    if (objData.alive !== undefined) this.objects[id].alive = objData.alive;
                    if (objData.contains) this.objects[id].contains = objData.contains;
                    if (objData.pointsAwarded) this.objects[id].pointsAwarded = objData.pointsAwarded;
                }
            }

            this.updateScore();
            this.print('<span class="success-msg">Game restored.</span>');
            this.print('');
            this.look();
        } catch (e) {
            this.print('<span class="error-msg">Failed to load game.</span>');
        }
    }

    restart() {
        this.output.innerHTML = '';
        this.initializeGame();
        this.showIntro();
    }

    // --- Multiplayer ---

}

export default Zork;
