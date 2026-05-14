/**
 * C64 App - Commodore 64 Emulator for IlluminatOS!
 *
 * Run C64 programs and games in the browser via EmulatorJS (the VICE
 * `x64sc` libretro core compiled to WebAssembly via RetroArch's Emscripten
 * build).
 *
 * Engine + assets are loaded from the official EmulatorJS CDN at
 * `cdn.emulatorjs.org` the first time the app is used in a session. No
 * BIOS is required — VICE bundles the necessary ROMs.
 *
 * EmulatorJS is GPL-3.0. We do not redistribute its code; we link to its
 * CDN at runtime exactly like DOSBox links to v8.js-dos.com. If you ever
 * vendor it locally, surface the GPL accordingly.
 *
 * SCRIPTING SUPPORT
 *   Commands: run, runFile, stop, reset, fullscreen, setVolume
 *   Queries:  getState, getLibrary
 *   Events:   app:c64:started, app:c64:ready, app:c64:stopped, app:c64:error
 *
 * RETROSCRIPT EXAMPLES
 *   command c64:run { url: "https://archive.org/download/.../game.d64" }
 *   command c64:stop
 *   command c64:fullscreen
 *   set $state = query c64:getState
 *
 * SUPPORTED FILE FORMATS
 *   .d64 .g64 .nib .crt .prg .t64 .tap .m3u .zip .7z
 *
 * UX
 *   - Library dropdown grouped by category (curated freeware / public-domain).
 *   - Free-form URL field for direct loads of CORS-friendly hosts (Internet
 *     Archive sends `Access-Control-Allow-Origin: *` for direct file URLs).
 *   - Local file picker — Blob URL load, no CORS dance.
 *
 * Why no iframe: same reason DOSBox doesn't iframe js-dos. EmulatorJS
 * renders into a target `<div>` so it can be styled, scoped, and
 * orchestrated by the host page. Iframes would block the scripting bridge
 * and force their own chrome.
 */

import AppBase from './AppBase.js';
import { escapeHtml } from '../core/Sanitize.js';

/** CDN base for EmulatorJS assets (stable channel). */
const EJS_CDN_BASE = 'https://cdn.emulatorjs.org/stable';
const EJS_DATA_PATH = `${EJS_CDN_BASE}/data/`;
const EJS_LOADER_URL = `${EJS_DATA_PATH}loader.js`;

/** Libretro core selector — VICE's accurate C64 core. */
const C64_CORE = 'c64';

/**
 * Hosts whose responses send permissive CORS to third-party origins.
 * Requests to these hosts go direct from the browser. Everything else
 * (including archive.org subdomains, whose CORS posture has been
 * historically inconsistent for browser embeds) is routed through the
 * IlluminatOS C64 proxy at `api/c64-proxy.php`, same pattern as DOSBox.
 */
const CORS_FRIENDLY_HOSTS = new Set([
    // (intentionally empty — IA is treated as proxy-routed for determinism)
]);

/**
 * Hosts the proxy is configured to fetch from. Used only to decide
 * whether we send a request through the proxy or fall back to a direct
 * fetch with the warning that CORS may fail. Must stay in sync with the
 * `$allowed_hosts` list in api/c64-proxy.php.
 */
const PROXY_HOSTS = new Set([
    'archive.org',
    'csdb.dk',
    'cdn.csdb.dk',
    'raw.githubusercontent.com',
    // ia###.us.archive.org subdomains are matched by suffix below.
]);

/**
 * Curated C64 library — modeled on DOSBox's GAME_LIBRARY in scope and shape.
 *
 * Each entry: { name, icon, category, year, desc, iaItem? | url? }
 *   - `iaItem`: Internet Archive item ID; the actual .d64/.prg/.crt file
 *               is resolved at runtime via `_resolveIAItemToUrl()`. This
 *               avoids hardcoding filenames that change inside an item.
 *   - `url`:    Explicit download URL (used for BASIC's empty sentinel,
 *               and for any non-IA source you might add later).
 *
 * The metadata API at `https://archive.org/metadata/<itemId>` sends
 * permissive CORS headers, so the resolver fetch works straight from the
 * browser with no proxy.
 *
 * URL hygiene
 *   - IA's `archive.org/download/<itemId>/<file>` endpoints send
 *     `Access-Control-Allow-Origin: *` — EmulatorJS can fetch them.
 *   - If a specific item ID is wrong (404 from the metadata API), the
 *     resolver surfaces the error in the status bar so the user knows
 *     to pick another title.
 *   - To add titles: find the item on archive.org, copy the URL segment
 *     after `/details/`, paste it here as `iaItem`. The resolver picks
 *     the most appropriate file (.d64 > .prg > .crt > .t64 > .zip).
 *
 * Legality posture matches the existing DOSBox app: we link to a public
 * preservation archive, we don't redistribute. Demoscene and homebrew
 * entries are explicit freeware; commercial titles fall under the same
 * archive-preservation framing IA uses across its Software Library.
 */
const GAME_LIBRARY = [
    // === Arcade Classics (ports of coin-op hits) ============================
    { name: 'Pac-Man',              icon: '🟡', category: 'Arcade',     year: 1983,
      desc: 'Namco\'s maze-chomper port',
      iaItem: 'c64_Pac-Man' },
    { name: 'Ms. Pac-Man',          icon: '🎀', category: 'Arcade',     year: 1984,
      desc: 'Atari\'s arcade follow-up',
      iaItem: 'c64_Ms_Pac-Man' },
    { name: 'Donkey Kong',          icon: '🦍', category: 'Arcade',     year: 1983,
      desc: 'Climb the girders, save the girl',
      iaItem: 'c64_Donkey_Kong' },
    { name: 'Centipede',            icon: '🐛', category: 'Arcade',     year: 1984,
      desc: 'Atari\'s mushroom-field shooter',
      iaItem: 'c64_Centipede' },
    { name: 'Galaga',               icon: '👾', category: 'Arcade',     year: 1985,
      desc: 'Namco\'s vertical insectoid shooter',
      iaItem: 'c64_Galaga' },
    { name: 'Frogger',              icon: '🐸', category: 'Arcade',     year: 1983,
      desc: 'Cross the road, mind the logs',
      iaItem: 'c64_Frogger' },
    { name: 'Q*bert',               icon: '🟧', category: 'Arcade',     year: 1983,
      desc: 'Hop on every cube',
      iaItem: 'c64_Qbert' },
    { name: 'Defender',             icon: '🛸', category: 'Arcade',     year: 1983,
      desc: 'Williams\' side-scrolling rescue shooter',
      iaItem: 'c64_Defender' },
    { name: 'Dig Dug',              icon: '⛏️', category: 'Arcade',     year: 1983,
      desc: 'Inflate Pookas underground',
      iaItem: 'c64_Dig_Dug' },
    { name: 'Joust',                icon: '🪶', category: 'Arcade',     year: 1983,
      desc: 'Flying ostrich lance-duels',
      iaItem: 'c64_Joust' },
    { name: 'Bubble Bobble',        icon: '🫧', category: 'Arcade',     year: 1987,
      desc: 'Taito\'s bubble-blowing dinos',
      iaItem: 'c64_Bubble_Bobble' },
    { name: 'Spy Hunter',           icon: '🚗', category: 'Arcade',     year: 1984,
      desc: 'Midway\'s combat driving',
      iaItem: 'c64_Spy_Hunter' },
    { name: 'BurgerTime',           icon: '🍔', category: 'Arcade',     year: 1984,
      desc: 'Stomp buns, dodge pickles',
      iaItem: 'c64_BurgerTime' },
    { name: 'Mr. Do!',              icon: '🤡', category: 'Arcade',     year: 1983,
      desc: 'Universal\'s dig-and-fruit arcade',
      iaItem: 'c64_Mr_Do' },
    { name: 'Tapper',               icon: '🍺', category: 'Arcade',     year: 1984,
      desc: 'Slide root beers down the bar',
      iaItem: 'c64_Tapper' },

    // === Platformer ===========================================================
    { name: 'Bruce Lee',            icon: '🥋', category: 'Platformer', year: 1984,
      desc: 'Datasoft\'s martial-arts platformer',
      iaItem: 'c64_Bruce_Lee' },
    { name: 'Impossible Mission',   icon: '🤖', category: 'Platformer', year: 1984,
      desc: '"Stay awhile. Stay forever!" — Epyx',
      iaItem: 'impossible_mission_202309' },
    { name: 'Impossible Mission II', icon: '🔓', category: 'Platformer', year: 1988,
      desc: 'The Elvin Atombender revenge',
      iaItem: 'c64_Impossible_Mission_II' },
    { name: 'Jumpman',              icon: '🪜', category: 'Platformer', year: 1983,
      desc: 'Epyx\'s 30-level climber',
      iaItem: 'c64_Jumpman' },
    { name: 'Jumpman Junior',       icon: '🧗', category: 'Platformer', year: 1983,
      desc: 'Cartridge-sized sequel',
      iaItem: 'c64_Jumpman_Junior' },
    { name: 'Pitfall!',             icon: '🐊', category: 'Platformer', year: 1983,
      desc: 'Activision\'s jungle classic',
      iaItem: 'c64_Pitfall' },
    { name: 'Pitfall II: Lost Caverns', icon: '🕳️', category: 'Platformer', year: 1984,
      desc: 'Multi-screen sequel with music',
      iaItem: 'c64_Pitfall_II' },
    { name: 'Mario Bros.',          icon: '👨‍🔧', category: 'Platformer', year: 1984,
      desc: 'Pre-Super arcade port',
      iaItem: 'c64_Mario_Bros' },
    { name: 'Aztec Challenge',      icon: '🐍', category: 'Platformer', year: 1983,
      desc: 'Cosmi\'s seven-level temple gauntlet',
      iaItem: 'c64_Aztec_Challenge' },
    { name: 'Boulder Dash',         icon: '💎', category: 'Platformer', year: 1984,
      desc: 'First Star\'s gem-grabbing dig',
      iaItem: 'c64_Boulder_Dash' },
    { name: 'Boulder Dash II',      icon: '🪨', category: 'Platformer', year: 1985,
      desc: 'Rockford\'s Revenge',
      iaItem: 'c64_Boulder_Dash_II' },
    { name: 'The Goonies',          icon: '👻', category: 'Platformer', year: 1986,
      desc: 'Datasoft\'s movie tie-in',
      iaItem: 'c64_The_Goonies' },
    { name: 'Spelunker',            icon: '🔦', category: 'Platformer', year: 1985,
      desc: 'Broderbund\'s fragile cave-diver',
      iaItem: 'c64_Spelunker' },
    { name: 'Lode Runner',          icon: '🏃', category: 'Platformer', year: 1984,
      desc: 'Dig holes, grab gold — Broderbund',
      iaItem: 'c64_Lode_Runner' },
    { name: 'Wonder Boy',           icon: '🍔', category: 'Platformer', year: 1987,
      desc: 'Sega\'s skateboard platformer',
      iaItem: 'c64_Wonder_Boy' },

    // === Shooter (vertical / horizontal / multi-directional) ================
    { name: 'Uridium',              icon: '🚀', category: 'Shooter',    year: 1986,
      desc: 'Andrew Braybrook\'s super-fast Hewson scroller',
      iaItem: 'c64_Uridium' },
    { name: 'Wizball',              icon: '🧙', category: 'Shooter',    year: 1987,
      desc: 'Sensible Software\'s rolling-wizard shooter',
      iaItem: 'c64_Wizball' },
    { name: 'Delta',                icon: '🔺', category: 'Shooter',    year: 1987,
      desc: 'Stavros Fasoulas\' bullet-hell horizontal scroller',
      iaItem: 'c64_Delta' },
    { name: 'Sanxion',              icon: '🛰️', category: 'Shooter',    year: 1986,
      desc: 'Stavros Fasoulas + Rob Hubbard SID',
      iaItem: 'c64_Sanxion' },
    { name: 'IO',                   icon: '🌀', category: 'Shooter',    year: 1987,
      desc: 'Graftgold\'s multi-stage scroller',
      iaItem: 'c64_IO' },
    { name: 'Armalyte',             icon: '⚔️', category: 'Shooter',    year: 1988,
      desc: 'Cyberdyne\'s R-Type-esque masterpiece',
      iaItem: 'c64_Armalyte' },
    { name: 'Dropzone',             icon: '🪂', category: 'Shooter',    year: 1984,
      desc: 'Archer Maclean\'s Defender-style rescue',
      iaItem: 'c64_Dropzone' },
    { name: 'Hawkeye',              icon: '🦅', category: 'Shooter',    year: 1988,
      desc: 'Boys Without Brains run-and-gun',
      iaItem: 'c64_Hawkeye' },
    { name: 'R-Type',               icon: '🐉', category: 'Shooter',    year: 1989,
      desc: 'Irem\'s scrolling arcade shooter',
      iaItem: 'c64_R-Type' },
    { name: 'Mega Apocalypse',      icon: '☄️', category: 'Shooter',    year: 1987,
      desc: 'Martech\'s Asteroids successor',
      iaItem: 'c64_Mega_Apocalypse' },

    // === Action / Action-Adventure ==========================================
    { name: 'The Last Ninja',       icon: '🥷', category: 'Action',     year: 1987,
      desc: 'System 3\'s isometric ninja saga',
      iaItem: 'c64_The_Last_Ninja' },
    { name: 'The Last Ninja 2',     icon: '🗡️', category: 'Action',     year: 1988,
      desc: 'Back With A Vengeance',
      iaItem: 'c64_The_Last_Ninja_2' },
    { name: 'The Last Ninja 3',     icon: '🐉', category: 'Action',     year: 1991,
      desc: 'Final System 3 entry',
      iaItem: 'c64_The_Last_Ninja_3' },
    { name: 'Paradroid',            icon: '🤖', category: 'Action',     year: 1985,
      desc: 'Andrew Braybrook\'s droid-takeover masterpiece',
      iaItem: 'c64_Paradroid' },
    { name: 'Mayhem in Monsterland', icon: '🐉', category: 'Action',    year: 1993,
      desc: 'Apex\'s late-era miracle scroller',
      iaItem: 'c64_Mayhem_in_Monsterland' },
    { name: 'Turrican',             icon: '💥', category: 'Action',     year: 1990,
      desc: 'Manfred Trenz\'s explosive run-and-gun',
      iaItem: 'c64_Turrican' },
    { name: 'Turrican II',          icon: '⚙️', category: 'Action',     year: 1991,
      desc: 'The Final Fight',
      iaItem: 'c64_Turrican_II' },
    { name: 'Creatures',            icon: '😺', category: 'Action',     year: 1990,
      desc: 'Apex Computer\'s fuzzy-horror romp',
      iaItem: 'c64_Creatures' },
    { name: 'Mayhem',               icon: '💣', category: 'Action',     year: 1985,
      desc: 'Vintage chaos title',
      iaItem: 'c64_Mayhem' },
    { name: 'Saboteur!',            icon: '🕵️', category: 'Action',     year: 1985,
      desc: 'Durell\'s side-scrolling infiltration',
      iaItem: 'c64_Saboteur' },

    // === Adventure (point-and-click / illustrated text) =====================
    { name: 'Maniac Mansion',       icon: '🏚️', category: 'Adventure',  year: 1987,
      desc: 'Lucasfilm\'s first SCUMM adventure',
      iaItem: 'c64_Maniac_Mansion' },
    { name: 'Zak McKracken',        icon: '👽', category: 'Adventure',  year: 1988,
      desc: 'Alien Mindbenders — Lucasfilm',
      iaItem: 'c64_Zak_McKracken_and_the_Alien_Mindbenders' },
    { name: 'The Hobbit',           icon: '💍', category: 'Adventure',  year: 1985,
      desc: 'Melbourne House — Inglish-engine adventure',
      iaItem: 'c64_The_Hobbit' },
    { name: 'Indiana Jones (Temple of Doom)', icon: '🏛️', category: 'Adventure', year: 1987,
      desc: 'Mindscape arcade-adventure port',
      iaItem: 'c64_Indiana_Jones_and_the_Temple_of_Doom' },
    { name: 'Below the Root',       icon: '🌳', category: 'Adventure',  year: 1984,
      desc: 'Windham/CBS Software literary adventure',
      iaItem: 'c64_Below_the_Root' },
    { name: 'Defender of the Crown', icon: '👑', category: 'Adventure', year: 1987,
      desc: 'Cinemaware\'s knights & sieges',
      iaItem: 'c64_Defender_of_the_Crown' },
    { name: 'Sid Meier\'s Pirates!', icon: '🏴‍☠️', category: 'Adventure', year: 1987,
      desc: 'MicroProse\'s Caribbean sandbox',
      iaItem: 'c64_Pirates' },
    { name: 'Where in the World is Carmen Sandiego?', icon: '🌎', category: 'Adventure', year: 1985,
      desc: 'Broderbund\'s edutainment classic',
      iaItem: 'c64_Where_in_the_World_is_Carmen_Sandiego' },
    { name: 'The Pawn',             icon: '♟️', category: 'Adventure',  year: 1986,
      desc: 'Magnetic Scrolls illustrated text adventure',
      iaItem: 'c64_The_Pawn' },
    { name: 'Times of Lore',        icon: '⚔️', category: 'Adventure',  year: 1988,
      desc: 'Origin Systems action-RPG hybrid',
      iaItem: 'c64_Times_of_Lore' },

    // === Text Adventure (Infocom et al.) ====================================
    { name: 'Zork I',               icon: '📜', category: 'Text Adventure', year: 1983,
      desc: 'Infocom\'s Great Underground Empire',
      iaItem: 'c64_Zork_I' },
    { name: 'Hitchhiker\'s Guide',  icon: '🐬', category: 'Text Adventure', year: 1984,
      desc: 'Infocom + Douglas Adams',
      iaItem: 'c64_The_Hitchhikers_Guide_to_the_Galaxy' },

    // === RPG ================================================================
    { name: 'The Bard\'s Tale',     icon: '🎵', category: 'RPG',        year: 1985,
      desc: 'Interplay/EA dungeon-crawler',
      iaItem: 'c64_The_Bards_Tale' },
    { name: 'Ultima IV',            icon: '👑', category: 'RPG',        year: 1985,
      desc: 'Origin\'s Quest of the Avatar',
      iaItem: 'c64_Ultima_IV' },
    { name: 'Ultima V',             icon: '🗡️', category: 'RPG',        year: 1988,
      desc: 'Warriors of Destiny',
      iaItem: 'c64_Ultima_V' },
    { name: 'Wasteland',            icon: '☢️', category: 'RPG',        year: 1988,
      desc: 'Interplay/EA post-apocalyptic RPG',
      iaItem: 'c64_Wasteland' },
    { name: 'Pool of Radiance',     icon: '🐲', category: 'RPG',        year: 1988,
      desc: 'First SSI Gold Box D&D game',
      iaItem: 'c64_Pool_of_Radiance' },

    // === Strategy / Simulation ==============================================
    { name: 'M.U.L.E.',             icon: '🐴', category: 'Strategy',   year: 1983,
      desc: 'Ozark Softscape economic strategy',
      iaItem: 'c64_M_U_L_E' },
    { name: 'Archon: Light & Dark', icon: '♛', category: 'Strategy',    year: 1983,
      desc: 'Free Fall Associates chess-meets-combat',
      iaItem: 'c64_Archon' },
    { name: 'The Seven Cities of Gold', icon: '🌅', category: 'Strategy', year: 1984,
      desc: 'Dani Bunten\'s New World exploration',
      iaItem: 'c64_The_Seven_Cities_of_Gold' },
    { name: 'Reach for the Stars',  icon: '🌌', category: 'Strategy',   year: 1986,
      desc: 'SSG 4X space strategy',
      iaItem: 'c64_Reach_for_the_Stars' },
    { name: 'SimCity',              icon: '🏙️', category: 'Strategy',   year: 1989,
      desc: 'Maxis\' city-builder original',
      iaItem: 'c64_SimCity' },
    { name: 'Little Computer People', icon: '🏠', category: 'Simulation', year: 1985,
      desc: 'Activision\'s ur-Sims experiment',
      iaItem: 'c64_Little_Computer_People' },
    { name: 'Microprose Soccer',    icon: '⚽', category: 'Simulation', year: 1988,
      desc: 'Sensible Software in MicroProse\'s clothes',
      iaItem: 'c64_MicroProse_Soccer' },
    { name: 'F-15 Strike Eagle',    icon: '✈️', category: 'Simulation', year: 1985,
      desc: 'MicroProse fighter-jet sim',
      iaItem: 'c64_F-15_Strike_Eagle' },

    // === Sports =============================================================
    { name: 'California Games',     icon: '🛹', category: 'Sports',     year: 1987,
      desc: 'Epyx\'s six-event west-coast sampler',
      iaItem: 'c64_California_Games' },
    { name: 'Summer Games',         icon: '🏊', category: 'Sports',     year: 1984,
      desc: 'Epyx\'s eight-event Olympic sim',
      iaItem: 'c64_Summer_Games' },
    { name: 'Summer Games II',      icon: '🚴', category: 'Sports',     year: 1985,
      desc: 'Eight more Olympic events',
      iaItem: 'c64_Summer_Games_II' },
    { name: 'Winter Games',         icon: '⛷️', category: 'Sports',     year: 1985,
      desc: 'Epyx\'s ice-and-snow version',
      iaItem: 'c64_Winter_Games' },
    { name: 'World Games',          icon: '🌍', category: 'Sports',     year: 1986,
      desc: 'Caber toss, log roll, sumo',
      iaItem: 'c64_World_Games' },
    { name: 'International Karate', icon: '🥋', category: 'Fighting',   year: 1985,
      desc: 'System 3\'s side-view karate',
      iaItem: 'c64_International_Karate' },
    { name: 'IK+',                  icon: '🥷', category: 'Fighting',   year: 1987,
      desc: 'International Karate Plus — three fighters',
      iaItem: 'c64_International_Karate_Plus' },
    { name: 'Hardball!',            icon: '⚾', category: 'Sports',     year: 1985,
      desc: 'Accolade\'s baseball sim',
      iaItem: 'c64_Hardball' },

    // === Racing =============================================================
    { name: 'Pole Position',        icon: '🏁', category: 'Racing',     year: 1983,
      desc: 'Atarisoft\'s Formula 1 arcade port',
      iaItem: 'c64_Pole_Position' },
    { name: 'Pitstop II',           icon: '🏎️', category: 'Racing',     year: 1984,
      desc: 'Epyx split-screen Grand Prix',
      iaItem: 'c64_Pitstop_II' },
    { name: 'Test Drive',           icon: '🚗', category: 'Racing',     year: 1987,
      desc: 'Accolade\'s supercar driving',
      iaItem: 'c64_Test_Drive' },
    { name: 'Out Run',              icon: '🌴', category: 'Racing',     year: 1988,
      desc: 'Sega arcade convertible cruiser',
      iaItem: 'c64_OutRun' },
    { name: 'Lotus Esprit Turbo Challenge', icon: '🟡', category: 'Racing', year: 1990,
      desc: 'Magnetic Fields/Gremlin racer',
      iaItem: 'c64_Lotus_Esprit_Turbo_Challenge' },

    // === Puzzle =============================================================
    { name: 'Tetris',               icon: '🟦', category: 'Puzzle',     year: 1988,
      desc: 'Mirrorsoft / Spectrum Holobyte port',
      iaItem: 'c64_Tetris' },
    { name: 'Lemmings',             icon: '🐹', category: 'Puzzle',     year: 1991,
      desc: 'DMA Design\'s green-haired suicide squad',
      iaItem: 'c64_Lemmings' },
    { name: 'The Sentinel',         icon: '👁️', category: 'Puzzle',     year: 1987,
      desc: 'Geoff Crammond\'s 3D strategy puzzle',
      iaItem: 'c64_The_Sentinel' },
    { name: 'The Castles of Dr. Creep', icon: '🏰', category: 'Puzzle', year: 1984,
      desc: 'Broderbund trap-laden mansion',
      iaItem: 'c64_The_Castles_of_Dr_Creep' },
    { name: 'Stunt Car Racer',      icon: '🎢', category: 'Puzzle',     year: 1989,
      desc: 'Geoff Crammond rollercoaster racer',
      iaItem: 'c64_Stunt_Car_Racer' },

    // === Demoscene (legally released by the authors) ========================
    { name: 'Booze Design — Edge of Disgrace', icon: '✨', category: 'Demoscene', year: 2008,
      desc: 'One of the most acclaimed C64 demos ever',
      iaItem: 'c64_demo_edge_of_disgrace' },
    { name: 'Crest — Deus Ex Machina', icon: '🌀', category: 'Demoscene', year: 2000,
      desc: 'Classic Crest demoscene release',
      iaItem: 'c64_demo_deus_ex_machina' },
    { name: 'Censor Design — Comaland 100%', icon: '🌈', category: 'Demoscene', year: 2014,
      desc: 'Multi-part demo, Datastorm winner',
      iaItem: 'c64_demo_comaland_100' },
    { name: 'Oxyron — One-der',     icon: '🎇', category: 'Demoscene', year: 2017,
      desc: 'Oxyron raster-bar wizardry',
      iaItem: 'c64_demo_oneder' },
    { name: 'Algotech',             icon: '🧪', category: 'Demoscene', year: 2014,
      desc: 'Algorithm-driven demo techniques',
      iaItem: 'c64_demo_algotech' },

    // === Modern Homebrew (released as freeware by the authors) ==============
    { name: '8-Bit Slicks (Demo)',  icon: '🏎️', category: 'Homebrew',  year: 2018,
      desc: 'Multiplayer top-down racer — RGCD',
      iaItem: 'c64_homebrew_8bit_slicks' },
    { name: 'Aviator Arcade II',    icon: '✈️', category: 'Homebrew',  year: 2020,
      desc: 'Single-screen biplane shooter',
      iaItem: 'c64_homebrew_aviator_arcade_ii' },
    { name: 'Sam\'s Journey (Demo)', icon: '🧢', category: 'Homebrew', year: 2017,
      desc: 'Knights of Bytes platform showcase',
      iaItem: 'c64_homebrew_sams_journey_demo' },
    { name: 'L\'Abbaye des Morts',  icon: '⛪', category: 'Homebrew',  year: 2017,
      desc: 'Locomalito ZX Spectrum port to C64',
      iaItem: 'c64_homebrew_labbaye_des_morts' },
    { name: 'Galencia',             icon: '🛸', category: 'Homebrew',  year: 2017,
      desc: 'Protovision\'s polished Galaga-like',
      iaItem: 'c64_homebrew_galencia' },

    // === Educational ========================================================
    { name: 'Number Munchers',      icon: '🔢', category: 'Educational', year: 1986,
      desc: 'MECC math edutainment',
      iaItem: 'c64_Number_Munchers' },
    { name: 'Word Munchers',        icon: '📚', category: 'Educational', year: 1985,
      desc: 'MECC vocabulary version',
      iaItem: 'c64_Word_Munchers' },
    { name: 'Math Blaster!',        icon: '🧮', category: 'Educational', year: 1987,
      desc: 'Davidson & Associates math drills',
      iaItem: 'c64_Math_Blaster' },

    // === Tools / Productivity ===============================================
    { name: 'Commodore BASIC (built-in)', icon: '⌨️', category: 'Tools', year: 1982,
      desc: 'Boot to the famous "READY." prompt',
      url: '' /* empty URL sentinel = boot machine with no media */ },
    { name: 'GEOS',                 icon: '🖱️', category: 'Tools',     year: 1986,
      desc: 'Berkeley Softworks\' GUI for C64',
      iaItem: 'c64_GEOS' },
    { name: 'Print Shop',           icon: '🖨️', category: 'Tools',     year: 1984,
      desc: 'Broderbund\'s banner/card maker',
      iaItem: 'c64_The_Print_Shop' },
];

const CATEGORY_ORDER = [
    'Arcade',
    'Platformer',
    'Shooter',
    'Action',
    'Adventure',
    'Text Adventure',
    'RPG',
    'Strategy',
    'Simulation',
    'Sports',
    'Fighting',
    'Racing',
    'Puzzle',
    'Demoscene',
    'Homebrew',
    'Educational',
    'Tools',
];

/** File extensions the resolver prefers, most specific first. */
const IA_PREFERRED_EXTS = ['.d64', '.prg', '.crt', '.t64', '.tap', '.g64', '.nib', '.zip'];

class C64 extends AppBase {
    constructor() {
        super({
            id: 'c64',
            name: 'Commodore 64',
            icon: '🕹️',
            width: 760,
            height: 600,
            minWidth: 520,
            minHeight: 420,
            resizable: true,
            singleton: true,
            category: 'games'
        });

        this.isRunning = false;
        this.isReady = false;
        this.currentRom = null;
        this.currentRomName = null;
        this.activeBlobUrl = null;
        this._loaderPromise = null;     // CDN preload promise — cached per session
        this._readyWatchdog = null;     // Warns if the emulator never reports ready
        this._configuredScript = null;  // Most recently injected loader script tag
        this._iaUrlCache = new Map();   // IA item ID → resolved file URL
        this._iaResolveInFlight = new Map(); // IA item ID → in-flight Promise (dedupes concurrent resolves)

        this.registerCommands();
        this.registerQueries();
    }

    // ── Scripting ──────────────────────────────────────────────

    registerCommands() {
        this.registerCommand('run', (payload) => {
            // Accept either { url } / "url" or { iaItem }. iaItem routes
            // through the IA metadata resolver so scripts can reference
            // library items symbolically.
            if (typeof payload === 'object' && payload?.iaItem) {
                this.loadLibraryEntry({ iaItem: payload.iaItem, name: payload.name });
                return { success: true, iaItem: payload.iaItem };
            }
            const url = typeof payload === 'string' ? payload : payload?.url;
            if (url === undefined) {
                return { success: false, error: 'URL or iaItem required (empty url = BASIC only)' };
            }
            this.loadGame(url, this.lookupBundleName(url));
            return { success: true, url };
        });

        this.registerCommand('stop', async () => {
            await this.stopEmulator();
            return { success: true };
        });

        this.registerCommand('reset', async () => {
            const url = this.currentRom;
            const name = this.currentRomName;
            await this.stopEmulator();
            if (url !== null) this.loadGame(url, name);
            return { success: true };
        });

        this.registerCommand('fullscreen', (payload) => {
            const want = payload?.value;
            this.toggleFullscreen(typeof want === 'boolean' ? want : undefined);
            return { success: true };
        });

        this.registerCommand('setVolume', (payload) => {
            const volume = payload?.volume ?? payload?.value;
            if (volume === undefined) return { success: false, error: 'Volume required (0-1)' };
            this.setVolume(Number(volume));
            return { success: true, volume: Number(volume) };
        });
    }

    registerQueries() {
        this.registerQuery('getState', () => ({
            isRunning: this.isRunning,
            isReady: this.isReady,
            currentRom: this.currentRom,
            currentRomName: this.currentRomName
        }));

        this.registerQuery('getLibrary', () =>
            GAME_LIBRARY.map(g => ({
                name: g.name,
                url: g.url,           // present only on entries with an explicit URL
                iaItem: g.iaItem,     // present on entries resolved via Internet Archive
                desc: g.desc,
                icon: g.icon,
                category: g.category,
                year: g.year
            }))
        );
    }

    // ── Lifecycle ──────────────────────────────────────────────

    onOpen() {
        // Index lookup so the change handler can map option `value` back to
        // the library entry (which may carry an `iaItem` rather than a `url`).
        const byCat = new Map();
        GAME_LIBRARY.forEach((game, idx) => {
            if (!byCat.has(game.category)) byCat.set(game.category, []);
            byCat.get(game.category).push({ ...game, _idx: idx });
        });
        const orderedCats = [
            ...CATEGORY_ORDER.filter(c => byCat.has(c)),
            ...[...byCat.keys()].filter(c => !CATEGORY_ORDER.includes(c))
        ];
        const dropdownOptions = orderedCats.map(cat => {
            const items = byCat.get(cat).map(game => {
                const label = `${game.icon} ${game.name} (${game.year}) — ${game.desc}`;
                // Encode the index into the library array as `lib:<i>`. The
                // change handler decodes this and resolves the entry's URL
                // (either directly from `url` or via the IA metadata API
                // when only `iaItem` is set).
                const value = `lib:${game._idx}`;
                return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
            }).join('');
            return `<optgroup label="${escapeHtml(cat)}">${items}</optgroup>`;
        }).join('');

        return `
            <div class="c64-app">
                <div class="c64-toolbar">
                    <div class="c64-bar">
                        <label class="c64-label">Disk:</label>
                        <select class="c64-select" id="c64GameSelect" title="Pick a program">
                            <option value="">— Pick a program —</option>
                            ${dropdownOptions}
                        </select>
                    </div>
                    <div class="c64-buttons">
                        <button class="c64-btn" id="c64StopBtn" title="Stop emulator" disabled>⏹ Stop</button>
                        <button class="c64-btn" id="c64ResetBtn" title="Reload current disk" disabled>🔄 Reset</button>
                        <button class="c64-btn" id="c64FsBtn" title="Toggle fullscreen">⛶ Fullscreen</button>
                    </div>
                </div>
                <div class="c64-toolbar c64-toolbar-sub">
                    <div class="c64-bar">
                        <label class="c64-label">URL:</label>
                        <input type="text" class="c64-input" id="c64UrlInput"
                               placeholder="https://archive.org/download/.../your-game.d64"
                               spellcheck="false" />
                        <button class="c64-btn" id="c64RunBtn" title="Load & run this URL">▶ Run URL</button>
                        <button class="c64-btn" id="c64FileBtn" title="Open a local disk image">📂 File…</button>
                        <input type="file" id="c64FileInput"
                               accept=".d64,.g64,.nib,.crt,.prg,.t64,.tap,.m3u,.zip,.7z"
                               style="display:none;" />
                    </div>
                </div>
                <div class="c64-emulator-area" id="c64EmulatorArea">
                    <div class="c64-splash" id="c64Splash">
                        <div class="c64-splash-screen">
                            <div class="c64-splash-banner">
                                **** COMMODORE 64 BASIC V2 ****<br>
                                64K RAM SYSTEM&nbsp;&nbsp;38911 BASIC BYTES FREE<br>
                                <br>
                                READY.<br>
                                <span class="c64-cursor">█</span>
                            </div>
                        </div>
                        <div class="c64-splash-hint">
                            Pick a disk from the <b>Disk</b> dropdown, paste a <code>.d64</code> /
                            <code>.prg</code> / <code>.crt</code> URL, or click <b>File…</b> to load
                            from your computer.<br>
                            <span class="c64-splash-credit">Powered by <b>EmulatorJS</b> / <b>VICE</b> — WebAssembly.</span>
                        </div>
                    </div>
                    <div class="c64-stage" id="c64Stage" style="display:none;"></div>
                    <div class="c64-loading" id="c64Loading" style="display:none;">
                        <div class="c64-loading-spinner"></div>
                        <div class="c64-loading-text" id="c64LoadingText">Loading VICE…</div>
                    </div>
                    <div class="c64-error" id="c64Error" style="display:none;">
                        <div class="c64-error-icon">⚠️</div>
                        <div class="c64-error-title" id="c64ErrorTitle">Something went wrong</div>
                        <div class="c64-error-body" id="c64ErrorBody"></div>
                        <div class="c64-error-actions">
                            <a class="c64-error-link" id="c64ErrorSearch"
                               href="https://archive.org/search?query=commodore+64"
                               target="_blank" rel="noopener" style="display:none;">
                                🔍 Search Internet Archive
                            </a>
                            <button class="c64-btn" id="c64ErrorDismiss">Back to disk list</button>
                        </div>
                    </div>
                </div>
                <div class="c64-status" id="c64Status">Ready</div>
            </div>
        `;
    }

    onMount() {
        const gameSelect = this.getElement('#c64GameSelect');
        const urlInput = this.getElement('#c64UrlInput');
        const runBtn = this.getElement('#c64RunBtn');
        const fileBtn = this.getElement('#c64FileBtn');
        const fileInput = this.getElement('#c64FileInput');
        const stopBtn = this.getElement('#c64StopBtn');
        const resetBtn = this.getElement('#c64ResetBtn');
        const fsBtn = this.getElement('#c64FsBtn');

        this.addHandler(gameSelect, 'change', (e) => {
            const value = e.target.value;
            if (!value) return;
            // Option values are `lib:<index>` — decode and run the entry.
            const m = /^lib:(\d+)$/.exec(value);
            if (!m) return;
            const entry = GAME_LIBRARY[Number(m[1])];
            if (!entry) return;
            // If the entry has an explicit URL (incl. empty for BASIC), put
            // it in the URL field for transparency. iaItem entries leave
            // the URL field unchanged until the resolver runs.
            if (urlInput && typeof entry.url === 'string') urlInput.value = entry.url;
            this.loadLibraryEntry(entry);
        });

        this.addHandler(runBtn, 'click', () => {
            const url = urlInput?.value?.trim() ?? '';
            this.loadGame(url, this.lookupBundleName(url));
        });

        this.addHandler(urlInput, 'keydown', (e) => {
            if (e.key === 'Enter') {
                const url = urlInput.value.trim();
                this.loadGame(url, this.lookupBundleName(url));
            }
        });

        this.addHandler(fileBtn, 'click', () => fileInput?.click());
        this.addHandler(fileInput, 'change', (e) => {
            const file = e.target.files?.[0];
            if (file) this.loadLocalFile(file);
            e.target.value = ''; // allow re-selecting the same file
        });

        this.addHandler(stopBtn, 'click', () => this.stopEmulator());
        this.addHandler(resetBtn, 'click', () => {
            const url = this.currentRom;
            const name = this.currentRomName;
            this.stopEmulator().then(() => { if (url !== null) this.loadGame(url, name); });
        });
        this.addHandler(fsBtn, 'click', () => this.toggleFullscreen());

        const errorDismiss = this.getElement('#c64ErrorDismiss');
        this.addHandler(errorDismiss, 'click', () => {
            // Drop back to the splash so the user can pick something else.
            const splash = this.getElement('#c64Splash');
            const errorOverlay = this.getElement('#c64Error');
            if (errorOverlay) errorOverlay.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            // Reset the dropdown so re-picking the same option still fires.
            if (gameSelect) gameSelect.value = '';
            this.setStatus('Ready');
        });

        // Preload the EmulatorJS loader script in the background so the
        // first user-initiated launch is faster.
        this.ensureLoaderPreloaded().catch((err) => {
            console.warn('[C64] Background loader preload failed:', err);
        });
    }

    onClose() {
        this.stopEmulator();
        if (this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }
    }

    onResize() {
        // EmulatorJS uses ResizeObserver internally — no action needed.
    }

    // ── CDN Loader ─────────────────────────────────────────────

    /**
     * EmulatorJS lazy-loads its assets when `loader.js` first runs in a
     * page that has the `EJS_*` globals set. We can't usefully preload
     * the rest until we know the core (`EJS_core`) — so this "preload"
     * is really just a DNS/handshake warmup hint via a `<link rel=
     * preconnect>` to the CDN. Cheap and safe.
     *
     * The actual `<script src="loader.js">` injection happens per game
     * launch in `_executeLoader()` because EmulatorJS reads the globals
     * at script-execute time.
     */
    ensureLoaderPreloaded() {
        if (this._loaderPromise) return this._loaderPromise;
        this._loaderPromise = new Promise((resolve) => {
            if (!document.querySelector('link[data-c64-preconnect="1"]')) {
                const link = document.createElement('link');
                link.rel = 'preconnect';
                link.href = 'https://cdn.emulatorjs.org';
                link.crossOrigin = 'anonymous';
                link.dataset.c64Preconnect = '1';
                document.head.appendChild(link);
            }
            resolve();
        });
        return this._loaderPromise;
    }

    // ── Core Methods ──────────────────────────────────────────

    /**
     * Load and run a program at a URL. An empty URL boots the machine
     * with no media (you get the BASIC prompt).
     * @param {string} url
     * @param {string} [displayName]
     */
    async loadGame(url, displayName) {
        await this._startEmulatorWith({
            url: url || '',
            displayName: displayName || (url ? this.getBundleName(url) : 'BASIC (no disk)')
        });
    }

    /**
     * Load a local disk image via Blob URL — avoids CORS entirely.
     * @param {File} file
     */
    async loadLocalFile(file) {
        if (!file) return;
        if (this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }
        const blobUrl = URL.createObjectURL(file);
        this.activeBlobUrl = blobUrl;
        await this._startEmulatorWith({ url: blobUrl, displayName: file.name });
    }

    /**
     * Load a curated GAME_LIBRARY entry. Entries may carry either an
     * explicit `url` or an Internet Archive item ID (`iaItem`) that the
     * resolver expands to a direct download URL. The status bar surfaces
     * both phases (resolving → starting) so the user can tell the app
     * isn't hung.
     * @param {object} entry - A GAME_LIBRARY entry
     */
    async loadLibraryEntry(entry) {
        if (!entry) return;
        const displayName = entry.name || this.lookupBundleName(entry.url || '');

        // Explicit URL (incl. empty string for "boot to BASIC") wins.
        if (typeof entry.url === 'string') {
            await this.loadGame(entry.url, displayName);
            return;
        }

        if (!entry.iaItem) {
            this._showError('Library entry "' + displayName + '" has no url and no iaItem.');
            return;
        }

        // Immediately swap to the loading overlay so the user sees visible
        // feedback even before the resolver fetch returns. Without this the
        // splash stays up during the (sometimes slow) metadata round-trip
        // and it looks like the dropdown did nothing.
        this._showLoading('Resolving "' + displayName + '" on Internet Archive…');
        this.setStatus('Resolving: ' + entry.iaItem);

        try {
            const url = await this._resolveIAItemToUrl(entry.iaItem);
            await this.loadGame(url, displayName);
        } catch (err) {
            console.error('[C64] IA resolve failed for', entry.iaItem, '→', err);
            const iaSearch = 'https://archive.org/search?query=' +
                encodeURIComponent(displayName + ' commodore 64');
            this._showError(
                `Couldn't load "${displayName}" from Internet Archive.`,
                [
                    `Reason: ${err?.message || err}`,
                    `The IA item ID "${entry.iaItem}" may have been renamed or removed.`,
                    'Try another title, paste a URL above, or click "File…" to load a local .d64.'
                ],
                { iaSearchUrl: iaSearch }
            );
            this.setStatus('Failed: ' + (err?.message || err));
            this.emitAppEvent('error', {
                error: err?.message || String(err),
                iaItem: entry.iaItem,
                name: displayName
            });
        }
    }

    /**
     * Show the loading overlay with custom text. Hides the splash so
     * something visible always happens when the user picks a game.
     * @private
     */
    _showLoading(text) {
        const splash = this.getElement('#c64Splash');
        const stage = this.getElement('#c64Stage');
        const loading = this.getElement('#c64Loading');
        const loadingText = this.getElement('#c64LoadingText');
        const errorOverlay = this.getElement('#c64Error');
        if (splash) splash.style.display = 'none';
        if (stage) stage.style.display = 'none';
        if (errorOverlay) errorOverlay.style.display = 'none';
        if (loading) loading.style.display = 'flex';
        if (loadingText) loadingText.textContent = text || 'Loading…';
    }

    /**
     * Show a prominent in-window error overlay. Surfaces failures the
     * user would otherwise miss if they're not watching the status bar.
     * @private
     */
    _showError(title, lines = [], opts = {}) {
        const splash = this.getElement('#c64Splash');
        const stage = this.getElement('#c64Stage');
        const loading = this.getElement('#c64Loading');
        const errorOverlay = this.getElement('#c64Error');
        const errorTitle = this.getElement('#c64ErrorTitle');
        const errorBody = this.getElement('#c64ErrorBody');
        const errorSearch = this.getElement('#c64ErrorSearch');

        if (splash) splash.style.display = 'none';
        if (stage) stage.style.display = 'none';
        if (loading) loading.style.display = 'none';
        if (!errorOverlay) return;

        if (errorTitle) errorTitle.textContent = title || 'Something went wrong';
        if (errorBody) {
            errorBody.innerHTML = (lines || []).map(line =>
                `<div class="c64-error-line">${escapeHtml(line)}</div>`
            ).join('');
        }
        if (errorSearch) {
            if (opts.iaSearchUrl) {
                errorSearch.style.display = 'inline-block';
                errorSearch.href = opts.iaSearchUrl;
            } else {
                errorSearch.style.display = 'none';
            }
        }
        errorOverlay.style.display = 'flex';
    }

    /**
     * Resolve an Internet Archive item ID to a direct download URL for the
     * best available C64-loadable file. Hits the IA metadata API at
     * `https://archive.org/metadata/<itemId>` (which sends permissive CORS
     * for read-only requests) and picks the most specific file extension
     * available, preferring native disk images over zipped collections.
     *
     * Resolves are cached per-instance and concurrent calls for the same
     * item are deduped so two rapid clicks don't double-fetch.
     *
     * @private
     * @param {string} itemId
     * @returns {Promise<string>}
     */
    _resolveIAItemToUrl(itemId) {
        if (this._iaUrlCache.has(itemId)) {
            return Promise.resolve(this._iaUrlCache.get(itemId));
        }
        if (this._iaResolveInFlight.has(itemId)) {
            return this._iaResolveInFlight.get(itemId);
        }

        // The original IA metadata URL — what we want the upstream to be.
        const directMetaUrl = `https://archive.org/metadata/${encodeURIComponent(itemId)}`;
        // Route through our same-origin proxy so CORS is deterministic.
        const fetchUrl = this.getLoadUrl(directMetaUrl);

        const promise = (async () => {
            const res = await fetch(fetchUrl, { credentials: 'omit' });
            if (!res.ok) {
                throw new Error(`IA metadata HTTP ${res.status} for "${itemId}"`);
            }
            const meta = await res.json();
            const files = Array.isArray(meta?.files) ? meta.files : [];
            if (files.length === 0) {
                throw new Error(`IA item "${itemId}" has no files (renamed or removed?)`);
            }

            // Pick the most specific extension. Within a tier, prefer the
            // shorter filename (usually the un-derived original upload).
            let pick = null;
            for (const ext of IA_PREFERRED_EXTS) {
                const matches = files.filter(f =>
                    typeof f.name === 'string' &&
                    f.name.toLowerCase().endsWith(ext) &&
                    // Skip IA-generated derivative files (e.g. *_archive.zip,
                    // *_files.xml etc.) that aren't actually the game.
                    !/_archive\.zip$/i.test(f.name) &&
                    !/_files\.xml$/i.test(f.name) &&
                    !/_meta\.(xml|sqlite)$/i.test(f.name)
                );
                if (matches.length) {
                    matches.sort((a, b) => a.name.length - b.name.length);
                    pick = matches[0];
                    break;
                }
            }
            if (!pick) {
                throw new Error(`No supported file in IA item "${itemId}" (looked for ${IA_PREFERRED_EXTS.join(', ')})`);
            }

            // Build the original archive.org/download URL. `_startEmulatorWith`
            // will pass it through `getLoadUrl()` again so the actual fetch
            // goes via our proxy.
            const url = `https://archive.org/download/${encodeURIComponent(itemId)}/${encodeURI(pick.name)}`;
            this._iaUrlCache.set(itemId, url);
            return url;
        })().finally(() => {
            this._iaResolveInFlight.delete(itemId);
        });

        this._iaResolveInFlight.set(itemId, promise);
        return promise;
    }

    /**
     * Resolve a user-facing URL into the URL we should actually fetch.
     * Hosts not in `CORS_FRIENDLY_HOSTS` get routed through our local
     * PHP proxy (same pattern as DOSBox.getLoadUrl in apps/DOSBox.js).
     *
     * Deployments can override the proxy URL by setting
     *   window.__C64_PROXY_URL = 'https://example.com/proxy.php';
     * before the C64 app launches.
     *
     * @param {string} originalUrl
     * @returns {string}
     */
    getLoadUrl(originalUrl) {
        if (!originalUrl) return originalUrl;
        try {
            const u = new URL(originalUrl, document.baseURI);
            const host = u.hostname.toLowerCase();

            // Local schemes — never proxy.
            if (u.protocol === 'blob:' || u.protocol === 'data:' || u.protocol === 'file:') {
                return originalUrl;
            }
            // Same-origin — no CORS issue.
            if (host === location.hostname.toLowerCase()) {
                return originalUrl;
            }
            // Explicit CORS-friendly hosts — fetch direct.
            if (CORS_FRIENDLY_HOSTS.has(host)) {
                return originalUrl;
            }

            const isProxyAllowed =
                PROXY_HOSTS.has(host) ||
                /\.us\.archive\.org$/i.test(host) ||
                host.endsWith('.archive.org') ||
                host.endsWith('.csdb.dk');

            if (isProxyAllowed) {
                const customProxy = (typeof window !== 'undefined' && window.__C64_PROXY_URL) || null;
                const proxyBase = customProxy
                    ? customProxy
                    : new URL('api/c64-proxy.php', document.baseURI).toString();
                const sep = proxyBase.includes('?') ? '&' : '?';
                return proxyBase + sep + 'url=' + encodeURIComponent(originalUrl);
            }
            // Unknown host — pass through; CORS may fail with a clear console error.
            return originalUrl;
        } catch {
            return originalUrl;
        }
    }

    /**
     * Stop any running instance, then start a fresh one with the given URL.
     * @private
     */
    async _startEmulatorWith({ url, displayName }) {
        const stage = this.getElement('#c64Stage');
        const splash = this.getElement('#c64Splash');
        const loading = this.getElement('#c64Loading');
        const loadingText = this.getElement('#c64LoadingText');

        if (!stage) return;

        await this.stopEmulator(/* keepSplash= */ false);
        this.playSound('floppy');

        if (splash) splash.style.display = 'none';
        if (stage) stage.style.display = 'block';
        if (loading) loading.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Fetching VICE core…';

        try {
            await this.ensureLoaderPreloaded();

            // Fresh root div per session. EmulatorJS attaches a lot of
            // internal state to its player target; re-using the same div
            // across launches is fragile.
            stage.innerHTML = '';
            const root = document.createElement('div');
            root.className = 'c64-root';
            root.id = `c64-player-${Date.now()}`;
            stage.appendChild(root);

            // Let the browser compute layout so the container has
            // dimensions before EmulatorJS creates its canvas.
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

            this.currentRom = url;
            this.currentRomName = displayName;
            this.isRunning = true;
            this.isReady = false;
            this.updateButtons(true);
            this.setStatus('Starting: ' + displayName);

            if (loadingText) loadingText.textContent = 'Booting C64…';

            // Watchdog — if the emulator never signals ready in 60 s,
            // surface a diagnostic.
            if (this._readyWatchdog) clearTimeout(this._readyWatchdog);
            this._readyWatchdog = setTimeout(() => {
                if (this.isRunning && !this.isReady) {
                    console.warn('[C64] Emulator did not reach ready state in 60s.');
                    this.setStatus('Stuck booting — check the browser console.');
                }
            }, 60000);

            // Configure EmulatorJS via globals + inject loader.js. The
            // loader reads `window.EJS_*` at script-execute time.
            this._configureEmulatorJSGlobals({
                playerSelector: `#${root.id}`,
                gameUrl: url,
                gameName: displayName,
                onReady: () => this._handleEmulatorReady()
            });

            await this._executeLoader();

            if (loading) loading.style.display = 'none';

            this.emitAppEvent('started', { url, name: displayName });
        } catch (err) {
            console.error('[C64] Failed to start emulator:', err);
            this.setStatus('Error: ' + (err?.message || err));
            if (loading) loading.style.display = 'none';
            if (stage) stage.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            this.isRunning = false;
            this.isReady = false;
            this.updateButtons(false);
            this.emitAppEvent('error', { error: err?.message || String(err), url });
        }
    }

    /**
     * Set EmulatorJS configuration globals. EmulatorJS reads these from
     * `window` when `loader.js` executes — there is no constructor we can
     * call directly with options.
     * @private
     */
    _configureEmulatorJSGlobals({ playerSelector, gameUrl, gameName, onReady }) {
        // Tear down the previous instance if EmulatorJS hung one on
        // window. `EJS_terminate` is the documented teardown hook; we
        // also blank out the singleton handle just to be safe before
        // the loader re-instantiates.
        try {
            if (typeof window.EJS_terminate === 'function') {
                window.EJS_terminate();
            }
        } catch (e) {
            console.warn('[C64] EJS_terminate threw:', e);
        }
        try { delete window.EJS_emulator; } catch { /* non-configurable, ignore */ }

        window.EJS_player = playerSelector;
        window.EJS_core = C64_CORE;
        window.EJS_pathtodata = EJS_DATA_PATH;
        // Route the ROM through our CORS proxy if the upstream host needs
        // it (matches DOSBox.getLoadUrl in apps/DOSBox.js).
        // When no URL is supplied, clear EJS_gameUrl entirely — setting
        // it to an empty string makes EmulatorJS try to fetch "" and
        // silently fail before anything visible happens. Clearing the
        // global tells EmulatorJS to boot the machine with no media,
        // which on C64 lands at the "READY." BASIC prompt.
        const fetchableUrl = gameUrl ? this.getLoadUrl(gameUrl) : '';
        if (fetchableUrl) {
            window.EJS_gameUrl = fetchableUrl;
        } else {
            try { delete window.EJS_gameUrl; } catch { /* ignore */ }
        }
        window.EJS_gameName = gameName || 'Commodore 64';
        window.EJS_startOnLoaded = true;
        window.EJS_volume = 0.5;
        // Win95-ish accent (a muted navy that sits comfortably with the
        // grey chrome). EmulatorJS uses this for its inner buttons / menus.
        window.EJS_color = '#1084d0';
        // Tell EmulatorJS to stop spamming the console with its boot log
        // unless we're explicitly debugging.
        window.EJS_DEBUG_XX = false;
        // ready callback
        window.EJS_ready = onReady;
        window.EJS_onGameStart = () => this._handleGameStart();
    }

    /**
     * Inject (or re-inject) the loader script. EmulatorJS's loader
     * initialises on script-execute, so swapping games means a fresh
     * script tag with a unique URL suffix to defeat the browser's
     * "already loaded this script" optimisation.
     * @private
     */
    _executeLoader() {
        return new Promise((resolve, reject) => {
            // Remove the previous loader tag if we injected one — keeps
            // the DOM clean and avoids stale handler references.
            if (this._configuredScript && this._configuredScript.parentNode) {
                this._configuredScript.parentNode.removeChild(this._configuredScript);
                this._configuredScript = null;
            }

            const script = document.createElement('script');
            // Cache-bust the URL per launch so the browser actually
            // re-executes loader.js with the new globals. The CDN
            // ignores unknown query params, so we still hit the edge
            // cache for the bytes themselves.
            script.src = `${EJS_LOADER_URL}?_=${Date.now()}`;
            script.async = true;
            script.dataset.c64Loader = '1';
            script.onload = () => resolve();
            script.onerror = () => {
                reject(new Error('Failed to fetch EmulatorJS loader from ' + EJS_LOADER_URL));
            };
            this._configuredScript = script;
            document.head.appendChild(script);
        });
    }

    /** @private */
    _handleEmulatorReady() {
        this.isReady = true;
        if (this._readyWatchdog) {
            clearTimeout(this._readyWatchdog);
            this._readyWatchdog = null;
        }
        this.setStatus('Running: ' + (this.currentRomName || 'C64'));
        this.emitAppEvent('ready', { name: this.currentRomName });
    }

    /** @private */
    _handleGameStart() {
        this.emitAppEvent('play', { name: this.currentRomName });
    }

    /**
     * Stop the running emulator and fully tear down workers, audio, and DOM.
     * @param {boolean} [keepSplash=true] - If false, caller will swap content immediately.
     */
    async stopEmulator(keepSplash = true) {
        const stage = this.getElement('#c64Stage');
        const splash = this.getElement('#c64Splash');

        if (this._readyWatchdog) {
            clearTimeout(this._readyWatchdog);
            this._readyWatchdog = null;
        }

        try {
            if (typeof window.EJS_terminate === 'function') {
                window.EJS_terminate();
            } else if (window.EJS_emulator && typeof window.EJS_emulator.exit === 'function') {
                window.EJS_emulator.exit();
            }
        } catch (e) {
            console.warn('[C64] Error during emulator teardown:', e);
        }
        try { delete window.EJS_emulator; } catch { /* ignore */ }

        // Drop the entire DOM subtree so canvases / audio nodes get GC'd.
        if (stage) stage.innerHTML = '';

        if (this.activeBlobUrl && this.currentRom === this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }

        this.isRunning = false;
        this.isReady = false;
        this.updateButtons(false);

        if (keepSplash) {
            if (stage) stage.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            this.setStatus('Ready');
        }

        this.emitAppEvent('stopped', {});
    }

    /**
     * Toggle fullscreen on the emulator stage.
     * @param {boolean} [want]
     */
    toggleFullscreen(want) {
        const stage = this.getElement('#c64EmulatorArea');
        if (!stage) return;

        const wantFullscreen = typeof want === 'boolean' ? want : !document.fullscreenElement;

        if (!wantFullscreen) {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {});
            }
            return;
        }

        stage.requestFullscreen().catch(err => {
            console.warn('[C64] Fullscreen request failed:', err);
        });
    }

    /**
     * Set audio volume (0-1). EmulatorJS exposes a per-instance volume API.
     * @param {number} volume
     */
    setVolume(volume) {
        const v = Math.max(0, Math.min(1, Number(volume) || 0));
        try {
            if (window.EJS_emulator?.setVolume) {
                window.EJS_emulator.setVolume(v);
            }
        } catch (e) {
            console.warn('[C64] setVolume failed:', e);
        }
    }

    // ── Helpers ────────────────────────────────────────────────

    setStatus(text) {
        const el = this.getElement('#c64Status');
        if (el) el.textContent = text;
    }

    updateButtons(running) {
        const stopBtn = this.getElement('#c64StopBtn');
        const resetBtn = this.getElement('#c64ResetBtn');
        if (stopBtn) stopBtn.disabled = !running;
        if (resetBtn) resetBtn.disabled = !running;
    }

    /**
     * Look up a curated library entry by URL and return its display name,
     * or fall back to a name derived from the URL itself. Checks both
     * explicit `url` entries and any resolved-IA URLs in the cache so a
     * reset after an IA-resolved load still shows the friendly title.
     */
    lookupBundleName(url) {
        if (url === '' || url == null) return 'BASIC (no disk)';
        const directHit = GAME_LIBRARY.find(g => g.url === url);
        if (directHit) return directHit.name;
        // Reverse-lookup the IA cache: any iaItem whose resolved URL matches.
        for (const [iaItem, cachedUrl] of this._iaUrlCache.entries()) {
            if (cachedUrl === url) {
                const hit = GAME_LIBRARY.find(g => g.iaItem === iaItem);
                if (hit) return hit.name;
            }
        }
        return this.getBundleName(url);
    }

    getBundleName(url) {
        if (!url) return 'C64';
        if (url.startsWith('blob:')) return 'local file';
        try {
            const parts = new URL(url).pathname.split('/');
            return parts[parts.length - 1] || url;
        } catch {
            return url;
        }
    }
}

export default C64;
