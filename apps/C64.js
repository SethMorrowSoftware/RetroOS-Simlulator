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
    // GitHub raw content — `Access-Control-Allow-Origin: *` for all
    // public repos. Source for the bulk of our verified library
    // (retrobrews/c64-games — see RETROBREWS_C64_BASE below).
    'raw.githubusercontent.com',
]);

/**
 * The retrobrews homebrew C64 collection. ~48 freeware titles, each
 * vetted by the curator and explicitly approved for free distribution
 * by the original developers ("approved for free distribution on this
 * site/project only" per the repo README — we link, we don't redistribute).
 *
 * raw.githubusercontent.com sends CORS so the browser fetches these
 * directly without going through our proxy.
 *
 * Source repo (canonical):
 *   https://github.com/retrobrews/c64-games
 * Per-title metadata + screenshots:
 *   https://github.com/retrobrews/c64-games/blob/master/gamelist.xml
 */
const RETROBREWS_C64_BASE = 'https://raw.githubusercontent.com/retrobrews/c64-games/master';

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
 * Curated C64 library.
 *
 * The bulk of this list (~48 titles) is sourced from the retrobrews/c64-games
 * GitHub repository (a community-maintained collection of homebrew C64
 * software explicitly approved by each developer for free distribution).
 * Files are served from `raw.githubusercontent.com`, which sends
 * permissive CORS to third-party origins, so the browser fetches them
 * direct without our proxy.
 *
 * Each entry: { name, icon, category, year, desc, url? | iaItem? }
 *   - `url`:    Direct download URL (CORS-friendly hosts only).
 *   - `iaItem`: Internet Archive item ID — resolved at runtime via the
 *               IA metadata API and routed through `api/c64-proxy.php`
 *               for deterministic CORS. Used for the small experimental
 *               demoscene tail; some IDs may need verification by hand.
 *
 * To add titles
 *   - Homebrew: contribute to retrobrews/c64-games then add an entry here.
 *   - Demoscene: find the IA item, paste the ID as `iaItem`. The resolver
 *               picks the best file (.d64 > .prg > .crt > .t64 > .zip).
 *
 * Legality posture: we link to public archives that hold redistribution
 * rights from the original developers. We do not redistribute ROMs.
 * Commercial titles still under copyright (e.g. Pirates!, Maniac Mansion)
 * are deliberately not in this list — load those from your own .d64 file
 * via the File… button.
 */
const GAME_LIBRARY = [

    // === Arcade (1 titles, retrobrews/c64-games via raw.githubusercontent.com) ===
    { name: 'MArkanoid', icon: '🧱', category: 'Arcade', year: 2003,
      desc: 'Arkanoid clone in MArkanoid style (Ice Team)',
      url: `${RETROBREWS_C64_BASE}/markanoid.prg` },

    // === Action (18 titles, retrobrews/c64-games via raw.githubusercontent.com) ===
    { name: 'Captain Cloudberry', icon: '☁️', category: 'Action', year: 2017,
      desc: 'Pop radioactive weather balloons in your plane (Megastyle)',
      url: `${RETROBREWS_C64_BASE}/captaincloudberry.d64` },
    { name: 'Elav', icon: '🏗️', category: 'Action', year: 2006,
      desc: 'Rampage clone in just 4 KB (Ice Team)',
      url: `${RETROBREWS_C64_BASE}/elav.prg` },
    { name: 'Electric Warrior', icon: '⚡', category: 'Action', year: 2018,
      desc: 'Rabbitfighting cosmic monk on year-9634 Earth (PlayOrbit)',
      url: `${RETROBREWS_C64_BASE}/electricwarrior.d64` },
    { name: 'Exploding Fish', icon: '🐠', category: 'Action', year: 2018,
      desc: 'Diver Dougal defuses reef bombs (Megastyle)',
      url: `${RETROBREWS_C64_BASE}/explodingfish.d64` },
    { name: 'Gruniozerca', icon: '🐹', category: 'Action', year: 2017,
      desc: 'Guinea pig catches falling carrots (6bits (Lukasz Kies))',
      url: `${RETROBREWS_C64_BASE}/gruniozerca.d64` },
    { name: 'Happy Flappy', icon: '🐦', category: 'Action', year: 2018,
      desc: 'Flappy Bird clone, one-button (Roysterini)',
      url: `${RETROBREWS_C64_BASE}/happyflappy.prg` },
    { name: 'Hektic II', icon: '🤯', category: 'Action', year: 2017,
      desc: 'Arcade-platformer chaos sequel (Roysterini)',
      url: `${RETROBREWS_C64_BASE}/hektic2.prg` },
    { name: 'Honey Bee', icon: '🐝', category: 'Action', year: 2016,
      desc: 'Buzzy the clumsy bee collects pollen (Psytronik Software)',
      url: `${RETROBREWS_C64_BASE}/honeybee.d64` },
    { name: 'Humpy64', icon: '💀', category: 'Action', year: 2018,
      desc: 'Dodge the swinging wrecking ball (Roysterini)',
      url: `${RETROBREWS_C64_BASE}/humpy64.prg` },
    { name: 'Lumberjack 4k', icon: '🪓', category: 'Action', year: 2017,
      desc: '4K lumberjack — reveal the red flannel (Megastyle)',
      url: `${RETROBREWS_C64_BASE}/lumberjack.d64` },
    { name: 'Monster Hunt', icon: '👹', category: 'Action', year: 2018,
      desc: 'Chase monsters into the black hole (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/monsterhunt.prg` },
    { name: 'Moon Rock', icon: '🌙', category: 'Action', year: 2018,
      desc: 'Pick your nose for moon rocks (yes really) (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/moonrock.prg` },
    { name: 'Paper Plane', icon: '🛩️', category: 'Action', year: 2017,
      desc: 'Guide a paper plane through hazards (Roysterini)',
      url: `${RETROBREWS_C64_BASE}/paperplane.prg` },
    { name: 'Sentence', icon: '🔫', category: 'Action', year: 2018,
      desc: 'Run-and-gun with dubious combat sections (Roysterini)',
      url: `${RETROBREWS_C64_BASE}/sentence.d64` },
    { name: 'Shinobiden Zero', icon: '🥷', category: 'Action', year: 2018,
      desc: 'Aomaru the ninja-in-training adventure (Tekkamansoul)',
      url: `${RETROBREWS_C64_BASE}/shinobidenzero.prg` },
    { name: 'Snafu', icon: '🐍', category: 'Action', year: 2017,
      desc: 'Classic snake trap — direct without dying (Megastyle)',
      url: `${RETROBREWS_C64_BASE}/snafu.d64` },
    { name: 'Tombstones', icon: '🪦', category: 'Action', year: 2017,
      desc: 'El Gringo guns down 6 outlaws across 3 stages (Megastyle)',
      url: `${RETROBREWS_C64_BASE}/tombstones.d64` },
    { name: 'Trolley Follies', icon: '🚋', category: 'Action', year: 2018,
      desc: 'One or two-player trolley adventure (Blackcastle)',
      url: `${RETROBREWS_C64_BASE}/trolleyfollies.d64` },

    // === Shooter (3 titles, retrobrews/c64-games via raw.githubusercontent.com) ===
    { name: 'Algol', icon: '🛸', category: 'Shooter', year: 2018,
      desc: 'Control the Harvester of Doom over planet Eden (PlayOrbit)',
      url: `${RETROBREWS_C64_BASE}/algol.d64` },
    { name: 'Pulse', icon: '💥', category: 'Shooter', year: 2017,
      desc: 'Smooth horizontal-scrolling shoot-\u2019em-up (East Yorkshire Engineering Software)',
      url: `${RETROBREWS_C64_BASE}/pulse.prg` },
    { name: 'The Vice Squad', icon: '🚓', category: 'Shooter', year: 0,
      desc: 'Multi-level scrolling shooter, multiple weapons (Psytronik Software)',
      url: `${RETROBREWS_C64_BASE}/thevicesquad.d64` },

    // === Platformer (6 titles, retrobrews/c64-games via raw.githubusercontent.com) ===
    { name: 'It\'s Magic', icon: '🧙', category: 'Platformer', year: 2006,
      desc: 'Cute Protovision jump-and-run platformer (Protovision)',
      url: `${RETROBREWS_C64_BASE}/itsmagic.d64` },
    { name: 'Little Sara Sister Trilogy', icon: '👧', category: 'Platformer', year: 2017,
      desc: 'Little Sara Sister trilogy on tape (Ice Team)',
      url: `${RETROBREWS_C64_BASE}/lsstrilogy.tap` },
    { name: 'Nanako in Classic Japanese Monster Castle', icon: '🏯', category: 'Platformer', year: 2010,
      desc: 'Mojon Twins 25-level monster castle (Mojon Twins)',
      url: `${RETROBREWS_C64_BASE}/nanakoincastle.d64` },
    { name: 'Quod Init Exit', icon: '🚪', category: 'Platformer', year: 2018,
      desc: 'Zampo escapes randomly-generated rooms (Retream)',
      url: `${RETROBREWS_C64_BASE}/quodinitexit.d64` },
    { name: 'Sir Ababol', icon: '🌸', category: 'Platformer', year: 2012,
      desc: 'Gather 25 ababol flowers across Monegros (Mojon Twins)',
      url: `${RETROBREWS_C64_BASE}/sirababol.d64` },
    { name: 'Uwol, Quest for Money', icon: '💎', category: 'Platformer', year: 2009,
      desc: 'Steal as many coins as Uwol can carry (Mojon Twins)',
      url: `${RETROBREWS_C64_BASE}/uwolquestformoney.d64` },

    // === Puzzle (18 titles, retrobrews/c64-games via raw.githubusercontent.com) ===
    { name: '$100 Box', icon: '🎲', category: 'Puzzle', year: 2018,
      desc: 'Math game theory puzzle — guess the lucky box (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/100box.prg` },
    { name: 'Bapple-Ships', icon: '🚢', category: 'Puzzle', year: 2018,
      desc: 'Battleship vs. the computer on a 10×10 grid (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/bappleship.prg` },
    { name: 'Find The Pussy', icon: '🐱', category: 'Puzzle', year: 2018,
      desc: 'Logic-deduction game (find the cat in 6 guesses) (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/findthepussy.prg` },
    { name: 'Iceblox Plus', icon: '🐧', category: 'Puzzle', year: 2019,
      desc: 'Pixel Pete the penguin pushes ice blocks (Psytronik Software)',
      url: `${RETROBREWS_C64_BASE}/icebloxplus.d64` },
    { name: 'Lights Off', icon: '💡', category: 'Puzzle', year: 2018,
      desc: 'Turn off all the lights on a 3×3 grid (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/lightsoff.prg` },
    { name: 'Lights On', icon: '🔆', category: 'Puzzle', year: 2018,
      desc: 'Turn on all the lights on a 3×3 grid (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/lightson.prg` },
    { name: 'Magic Squares', icon: '🟥', category: 'Puzzle', year: 2018,
      desc: 'Colour all 3×3 squares except the centre (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/magicsquares.prg` },
    { name: 'Maze of Death', icon: '🌀', category: 'Puzzle', year: 2018,
      desc: 'Navigate a poison-walled maze (Hamrath)',
      url: `${RETROBREWS_C64_BASE}/mazeofdeath.d64` },
    { name: 'NumTrap', icon: '🔢', category: 'Puzzle', year: 2018,
      desc: 'Trap the number — guess high/low (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/numtrap.prg` },
    { name: 'Plunko', icon: '💰', category: 'Puzzle', year: 2018,
      desc: 'Price-is-Right Plinko-style pricing game (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/plunko.prg` },
    { name: 'Roll Roll Roll', icon: '🎲', category: 'Puzzle', year: 2018,
      desc: 'Single six-sided dice strategy game (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/rollrollroll.prg` },
    { name: 'Scissors Paper Rock', icon: '✂️', category: 'Puzzle', year: 2018,
      desc: 'Computerised rock-paper-scissors (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/scissorspaperrock.prg` },
    { name: 'Scissors Paper Rock Lizard Spock', icon: '🖖', category: 'Puzzle', year: 2018,
      desc: 'Extended Big Bang Theory RPSLS version (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/scissorspaperrocklizardspock.prg` },
    { name: 'Simon', icon: '🟢', category: 'Puzzle', year: 2018,
      desc: 'Classic 80s memory game with coloured keys (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/simon.prg` },
    { name: 'The Labyrinth', icon: '🧭', category: 'Puzzle', year: 2018,
      desc: '3D maze with map (VIC-20 port) (Cout Games)',
      url: `${RETROBREWS_C64_BASE}/thelabyrinth.prg` },
    { name: 'Warner Thomas Fahrenheit', icon: '🎱', category: 'Puzzle', year: 2018,
      desc: 'Warner Thomas Fahrenheit — guide the ball (Misfit)',
      url: `${RETROBREWS_C64_BASE}/wtf.prg` },
    { name: 'Winky Blinky', icon: '😉', category: 'Puzzle', year: 2018,
      desc: 'Reaction game — read Ben Turpin\u2019s eyes (Roysterini)',
      url: `${RETROBREWS_C64_BASE}/winkyblinky.prg` },
    { name: 'Zilspleef', icon: '🫧', category: 'Puzzle', year: 2018,
      desc: 'Squeaky bubble through dimensional terror (PlayOrbit)',
      url: `${RETROBREWS_C64_BASE}/zilspleef.d64` },

    // === Adventure (2 titles, retrobrews/c64-games via raw.githubusercontent.com) ===
    { name: 'Atom Heart', icon: '☢️', category: 'Adventure', year: 2018,
      desc: 'Captain the ATOM-X nuclear sci-fi adventure (PlayOrbit)',
      url: `${RETROBREWS_C64_BASE}/atomheart.d64` },
    { name: 'Joe Gunn Gold Edition', icon: '🪙', category: 'Adventure', year: 2018,
      desc: 'Archaeologist Joe Gunn — Gold Edition (Psytronik Software)',
      url: `${RETROBREWS_C64_BASE}/joegunngold.d64` },

    // ── Classics from Internet Archive's C64 preservation collection ──────
    // Each entry uses `iaSearch` (a Lucene query) rather than a hardcoded
    // item ID. The resolver hits IA's advancedsearch.php at runtime, picks
    // the top software-mediatype result, then resolves the file. Search
    // results are cached per session.

    // === Arcade Classics ==================================================
    { name: 'Pac-Man', icon: '🟡', category: 'Arcade', year: 1983,
      desc: 'Maze chase — Atarisoft port',
      iaSearch: 'title:(pac-man OR "pac man") AND collection:softwarelibrary_c64_games' },
    { name: 'Ms. Pac-Man', icon: '🎀', category: 'Arcade', year: 1984,
      desc: 'Maze chase sequel — Atarisoft',
      iaSearch: 'title:("ms pac-man" OR "ms. pac-man") AND collection:softwarelibrary_c64_games' },
    { name: 'Donkey Kong', icon: '🦍', category: 'Arcade', year: 1983,
      desc: 'Climb ladders, dodge barrels — Atarisoft',
      iaSearch: 'title:"donkey kong" AND collection:softwarelibrary_c64_games' },
    { name: 'Donkey Kong Jr.', icon: '🐒', category: 'Arcade', year: 1983,
      desc: 'Rescue Pop — Atarisoft',
      iaSearch: 'title:"donkey kong jr" AND collection:softwarelibrary_c64_games' },
    { name: 'Centipede', icon: '🐛', category: 'Arcade', year: 1984,
      desc: 'Mushroom field shooter — Atarisoft',
      iaSearch: 'title:centipede AND collection:softwarelibrary_c64_games' },
    { name: 'Galaga', icon: '👾', category: 'Arcade', year: 1985,
      desc: 'Vertical-scroll shooter — Atarisoft',
      iaSearch: 'title:galaga AND collection:softwarelibrary_c64_games' },
    { name: 'Frogger', icon: '🐸', category: 'Arcade', year: 1983,
      desc: 'Cross road and river — Sierra',
      iaSearch: 'title:frogger AND collection:softwarelibrary_c64_games' },
    { name: 'Q*bert', icon: '🟧', category: 'Arcade', year: 1983,
      desc: 'Hop the pyramid — Parker Bros.',
      iaSearch: 'title:qbert AND collection:softwarelibrary_c64_games' },
    { name: 'Defender', icon: '🛸', category: 'Arcade', year: 1983,
      desc: 'Side-scrolling rescue shooter — Atarisoft',
      iaSearch: 'title:defender AND collection:softwarelibrary_c64_games' },
    { name: 'Dig Dug', icon: '⛏️', category: 'Arcade', year: 1983,
      desc: 'Underground inflator — Atarisoft',
      iaSearch: 'title:"dig dug" AND collection:softwarelibrary_c64_games' },
    { name: 'Joust', icon: '🪶', category: 'Arcade', year: 1983,
      desc: 'Ostrich lance duels — Atari',
      iaSearch: 'title:joust AND collection:softwarelibrary_c64_games' },
    { name: 'Bubble Bobble', icon: '🫧', category: 'Arcade', year: 1987,
      desc: 'Bubble-blowing dinosaurs — Taito',
      iaSearch: 'title:"bubble bobble" AND collection:softwarelibrary_c64_games' },
    { name: 'Mario Bros.', icon: '👨‍🔧', category: 'Arcade', year: 1984,
      desc: 'Pre-Super plumber arcade — Atari',
      iaSearch: 'title:"mario bros" AND collection:softwarelibrary_c64_games' },
    { name: 'BurgerTime', icon: '🍔', category: 'Arcade', year: 1984,
      desc: 'Stomp the buns — Mattel',
      iaSearch: 'title:burgertime AND collection:softwarelibrary_c64_games' },
    { name: 'Tapper', icon: '🍺', category: 'Arcade', year: 1984,
      desc: 'Slide drinks down the bar — Bally',
      iaSearch: 'title:tapper AND collection:softwarelibrary_c64_games' },
    { name: 'Spy Hunter', icon: '🚗', category: 'Arcade', year: 1984,
      desc: 'Combat driving — Bally Midway',
      iaSearch: 'title:"spy hunter" AND collection:softwarelibrary_c64_games' },

    // === Action / Action-Adventure ========================================
    { name: 'The Last Ninja', icon: '🥷', category: 'Action', year: 1987,
      desc: 'Isometric ninja saga — System 3',
      iaSearch: 'title:"last ninja" AND collection:softwarelibrary_c64_games' },
    { name: 'Last Ninja 2', icon: '🗡️', category: 'Action', year: 1988,
      desc: 'Back With A Vengeance — System 3',
      iaSearch: 'title:"last ninja 2" AND collection:softwarelibrary_c64_games' },
    { name: 'Last Ninja 3', icon: '🐉', category: 'Action', year: 1991,
      desc: 'Third entry — System 3',
      iaSearch: 'title:"last ninja 3" AND collection:softwarelibrary_c64_games' },
    { name: 'Paradroid', icon: '🤖', category: 'Action', year: 1985,
      desc: 'Droid takeover — Andrew Braybrook',
      iaSearch: 'title:paradroid AND collection:softwarelibrary_c64_games' },
    { name: 'Mayhem in Monsterland', icon: '🐉', category: 'Action', year: 1993,
      desc: 'Late-era multi-direction scroller — Apex',
      iaSearch: 'title:"mayhem in monsterland" AND collection:softwarelibrary_c64_games' },
    { name: 'Turrican', icon: '💥', category: 'Action', year: 1990,
      desc: 'Run-and-gun explosion — Manfred Trenz',
      iaSearch: 'title:turrican AND collection:softwarelibrary_c64_games' },
    { name: 'Turrican II', icon: '⚙️', category: 'Action', year: 1991,
      desc: 'The Final Fight',
      iaSearch: 'title:"turrican ii" AND collection:softwarelibrary_c64_games' },
    { name: 'Saboteur!', icon: '🕵️', category: 'Action', year: 1985,
      desc: 'Side-scrolling infiltration — Durell',
      iaSearch: 'title:saboteur AND collection:softwarelibrary_c64_games' },

    // === Platformer ======================================================
    { name: 'Bruce Lee', icon: '🥋', category: 'Platformer', year: 1984,
      desc: 'Martial-arts platformer — Datasoft',
      iaSearch: 'title:"bruce lee" AND collection:softwarelibrary_c64_games' },
    { name: 'Impossible Mission', icon: '🤖', category: 'Platformer', year: 1984,
      desc: 'Elvin Atombender — Epyx',
      iaSearch: 'title:"impossible mission" AND collection:softwarelibrary_c64_games' },
    { name: 'Impossible Mission II', icon: '🔓', category: 'Platformer', year: 1988,
      desc: 'Sequel — Epyx',
      iaSearch: 'title:"impossible mission ii" AND collection:softwarelibrary_c64_games' },
    { name: 'Jumpman', icon: '🪜', category: 'Platformer', year: 1983,
      desc: '30-level climber — Epyx',
      iaSearch: 'title:jumpman AND collection:softwarelibrary_c64_games' },
    { name: 'Jumpman Junior', icon: '🧗', category: 'Platformer', year: 1983,
      desc: 'Cartridge-sized sequel — Epyx',
      iaSearch: 'title:"jumpman junior" AND collection:softwarelibrary_c64_games' },
    { name: 'Pitfall!', icon: '🐊', category: 'Platformer', year: 1983,
      desc: 'Jungle classic — Activision',
      iaSearch: 'title:pitfall AND collection:softwarelibrary_c64_games' },
    { name: 'Pitfall II', icon: '🕳️', category: 'Platformer', year: 1984,
      desc: 'Lost Caverns — Activision',
      iaSearch: 'title:"pitfall ii" AND collection:softwarelibrary_c64_games' },
    { name: 'Aztec Challenge', icon: '🐍', category: 'Platformer', year: 1983,
      desc: 'Seven-level temple gauntlet — Cosmi',
      iaSearch: 'title:"aztec challenge" AND collection:softwarelibrary_c64_games' },
    { name: 'Boulder Dash', icon: '💎', category: 'Platformer', year: 1984,
      desc: 'Gem-grabbing dig — First Star',
      iaSearch: 'title:"boulder dash" AND collection:softwarelibrary_c64_games' },
    { name: 'Boulder Dash II', icon: '🪨', category: 'Platformer', year: 1985,
      desc: "Rockford's Revenge",
      iaSearch: 'title:"boulder dash ii" AND collection:softwarelibrary_c64_games' },
    { name: 'The Goonies', icon: '👻', category: 'Platformer', year: 1986,
      desc: 'Movie tie-in — Datasoft',
      iaSearch: 'title:goonies AND collection:softwarelibrary_c64_games' },
    { name: 'Spelunker', icon: '🔦', category: 'Platformer', year: 1985,
      desc: 'Cave-diver — Broderbund',
      iaSearch: 'title:spelunker AND collection:softwarelibrary_c64_games' },
    { name: 'Lode Runner', icon: '🏃', category: 'Platformer', year: 1984,
      desc: 'Dig and grab gold — Broderbund',
      iaSearch: 'title:"lode runner" AND collection:softwarelibrary_c64_games' },
    { name: 'Wonder Boy', icon: '🍔', category: 'Platformer', year: 1987,
      desc: 'Skateboard platformer — Sega',
      iaSearch: 'title:"wonder boy" AND collection:softwarelibrary_c64_games' },

    // === Shooter =========================================================
    { name: 'Uridium', icon: '🚀', category: 'Shooter', year: 1986,
      desc: 'Super-fast scroller — Andrew Braybrook',
      iaSearch: 'title:uridium AND collection:softwarelibrary_c64_games' },
    { name: 'Wizball', icon: '🧙', category: 'Shooter', year: 1987,
      desc: 'Rolling wizard shooter — Sensible',
      iaSearch: 'title:wizball AND collection:softwarelibrary_c64_games' },
    { name: 'Delta', icon: '🔺', category: 'Shooter', year: 1987,
      desc: 'Bullet-hell horizontal — Stavros Fasoulas',
      iaSearch: 'title:delta AND collection:softwarelibrary_c64_games' },
    { name: 'Sanxion', icon: '🛰️', category: 'Shooter', year: 1986,
      desc: 'Vertical scroller, Rob Hubbard SID',
      iaSearch: 'title:sanxion AND collection:softwarelibrary_c64_games' },
    { name: 'Armalyte', icon: '⚔️', category: 'Shooter', year: 1988,
      desc: 'R-Type-style scroller — Cyberdyne',
      iaSearch: 'title:armalyte AND collection:softwarelibrary_c64_games' },
    { name: 'IO', icon: '🌀', category: 'Shooter', year: 1987,
      desc: 'Multi-stage scroller — Graftgold',
      iaSearch: 'title:io AND collection:softwarelibrary_c64_games' },
    { name: 'Dropzone', icon: '🪂', category: 'Shooter', year: 1984,
      desc: 'Defender-style rescue — Archer Maclean',
      iaSearch: 'title:dropzone AND collection:softwarelibrary_c64_games' },
    { name: 'Hawkeye', icon: '🦅', category: 'Shooter', year: 1988,
      desc: 'Run-and-gun — Boys Without Brains',
      iaSearch: 'title:hawkeye AND collection:softwarelibrary_c64_games' },
    { name: 'R-Type', icon: '🐉', category: 'Shooter', year: 1989,
      desc: 'Scrolling shooter — Irem',
      iaSearch: 'title:"r-type" AND collection:softwarelibrary_c64_games' },

    // === Adventure ========================================================
    { name: 'Maniac Mansion', icon: '🏚️', category: 'Adventure', year: 1987,
      desc: 'First SCUMM adventure — Lucasfilm',
      iaSearch: 'title:"maniac mansion" AND collection:softwarelibrary_c64_games' },
    { name: 'Zak McKracken', icon: '👽', category: 'Adventure', year: 1988,
      desc: 'Alien Mindbenders — Lucasfilm',
      iaSearch: 'title:"zak mckracken" AND collection:softwarelibrary_c64_games' },
    { name: 'Defender of the Crown', icon: '👑', category: 'Adventure', year: 1987,
      desc: 'Knights and sieges — Cinemaware',
      iaSearch: 'title:"defender of the crown" AND collection:softwarelibrary_c64_games' },
    { name: "Sid Meier's Pirates!", icon: '🏴‍☠️', category: 'Adventure', year: 1987,
      desc: 'Caribbean sandbox — MicroProse',
      iaSearch: 'title:pirates AND collection:softwarelibrary_c64_games' },
    { name: 'Carmen Sandiego (World)', icon: '🌎', category: 'Adventure', year: 1985,
      desc: 'Edutainment classic — Broderbund',
      iaSearch: 'title:"carmen sandiego" AND collection:softwarelibrary_c64_games' },
    { name: 'The Hobbit', icon: '💍', category: 'Adventure', year: 1985,
      desc: 'Illustrated text adventure — Melbourne House',
      iaSearch: 'title:hobbit AND collection:softwarelibrary_c64_games' },
    { name: 'Below the Root', icon: '🌳', category: 'Adventure', year: 1984,
      desc: 'Literary adventure — CBS Software',
      iaSearch: 'title:"below the root" AND collection:softwarelibrary_c64_games' },

    // === Text Adventure ===================================================
    { name: 'Zork I', icon: '📜', category: 'Text Adventure', year: 1983,
      desc: 'Great Underground Empire — Infocom',
      iaSearch: 'title:"zork i" AND collection:softwarelibrary_c64_games' },
    { name: "Hitchhiker's Guide", icon: '🐬', category: 'Text Adventure', year: 1984,
      desc: 'Douglas Adams + Infocom',
      iaSearch: 'title:hitchhiker AND collection:softwarelibrary_c64_games' },

    // === RPG ==============================================================
    { name: "The Bard's Tale", icon: '🎵', category: 'RPG', year: 1985,
      desc: 'Dungeon-crawler — Interplay/EA',
      iaSearch: 'title:"bards tale" AND collection:softwarelibrary_c64_games' },
    { name: 'Ultima IV', icon: '👑', category: 'RPG', year: 1985,
      desc: 'Quest of the Avatar — Origin',
      iaSearch: 'title:"ultima iv" AND collection:softwarelibrary_c64_games' },
    { name: 'Ultima V', icon: '🗡️', category: 'RPG', year: 1988,
      desc: 'Warriors of Destiny — Origin',
      iaSearch: 'title:"ultima v" AND collection:softwarelibrary_c64_games' },
    { name: 'Wasteland', icon: '☢️', category: 'RPG', year: 1988,
      desc: 'Post-apocalyptic RPG — Interplay',
      iaSearch: 'title:wasteland AND collection:softwarelibrary_c64_games' },
    { name: 'Pool of Radiance', icon: '🐲', category: 'RPG', year: 1988,
      desc: 'First SSI Gold Box D&D',
      iaSearch: 'title:"pool of radiance" AND collection:softwarelibrary_c64_games' },

    // === Strategy / Simulation ============================================
    { name: 'M.U.L.E.', icon: '🐴', category: 'Strategy', year: 1983,
      desc: 'Economic strategy — Ozark Softscape',
      iaSearch: 'title:mule AND collection:softwarelibrary_c64_games' },
    { name: 'Archon', icon: '♛', category: 'Strategy', year: 1983,
      desc: 'Chess meets combat — Free Fall',
      iaSearch: 'title:archon AND collection:softwarelibrary_c64_games' },
    { name: 'Seven Cities of Gold', icon: '🌅', category: 'Strategy', year: 1984,
      desc: 'New World exploration — Bunten',
      iaSearch: 'title:"seven cities of gold" AND collection:softwarelibrary_c64_games' },
    { name: 'SimCity', icon: '🏙️', category: 'Strategy', year: 1989,
      desc: 'City-builder original — Maxis',
      iaSearch: 'title:simcity AND collection:softwarelibrary_c64_games' },
    { name: 'Little Computer People', icon: '🏠', category: 'Strategy', year: 1985,
      desc: 'Ur-Sims experiment — Activision',
      iaSearch: 'title:"little computer people" AND collection:softwarelibrary_c64_games' },
    { name: 'F-15 Strike Eagle', icon: '✈️', category: 'Strategy', year: 1985,
      desc: 'Fighter-jet sim — MicroProse',
      iaSearch: 'title:"f-15 strike eagle" AND collection:softwarelibrary_c64_games' },

    // === Sports ===========================================================
    { name: 'California Games', icon: '🛹', category: 'Sports', year: 1987,
      desc: 'Six west-coast events — Epyx',
      iaSearch: 'title:"california games" AND collection:softwarelibrary_c64_games' },
    { name: 'Summer Games', icon: '🏊', category: 'Sports', year: 1984,
      desc: 'Eight-event Olympic sim — Epyx',
      iaSearch: 'title:"summer games" AND collection:softwarelibrary_c64_games' },
    { name: 'Summer Games II', icon: '🚴', category: 'Sports', year: 1985,
      desc: 'Eight more events — Epyx',
      iaSearch: 'title:"summer games ii" AND collection:softwarelibrary_c64_games' },
    { name: 'Winter Games', icon: '⛷️', category: 'Sports', year: 1985,
      desc: 'Ice and snow events — Epyx',
      iaSearch: 'title:"winter games" AND collection:softwarelibrary_c64_games' },
    { name: 'World Games', icon: '🌍', category: 'Sports', year: 1986,
      desc: 'Caber toss, sumo, log roll — Epyx',
      iaSearch: 'title:"world games" AND collection:softwarelibrary_c64_games' },
    { name: 'International Karate', icon: '🥋', category: 'Fighting', year: 1985,
      desc: 'Side-view karate — System 3',
      iaSearch: 'title:"international karate" AND collection:softwarelibrary_c64_games' },
    { name: 'IK+', icon: '🥷', category: 'Fighting', year: 1987,
      desc: 'Three-fighter karate sequel',
      iaSearch: 'title:"international karate plus" AND collection:softwarelibrary_c64_games' },
    { name: 'Hardball!', icon: '⚾', category: 'Sports', year: 1985,
      desc: 'Baseball sim — Accolade',
      iaSearch: 'title:hardball AND collection:softwarelibrary_c64_games' },

    // === Racing ===========================================================
    { name: 'Pole Position', icon: '🏁', category: 'Racing', year: 1983,
      desc: 'Formula 1 arcade port — Atarisoft',
      iaSearch: 'title:"pole position" AND collection:softwarelibrary_c64_games' },
    { name: 'Pitstop II', icon: '🏎️', category: 'Racing', year: 1984,
      desc: 'Split-screen Grand Prix — Epyx',
      iaSearch: 'title:"pitstop ii" AND collection:softwarelibrary_c64_games' },
    { name: 'Test Drive', icon: '🚗', category: 'Racing', year: 1987,
      desc: 'Supercar driving — Accolade',
      iaSearch: 'title:"test drive" AND collection:softwarelibrary_c64_games' },
    { name: 'Out Run', icon: '🌴', category: 'Racing', year: 1988,
      desc: 'Convertible cruiser — Sega',
      iaSearch: 'title:outrun AND collection:softwarelibrary_c64_games' },
    { name: 'Lotus Esprit Turbo', icon: '🟡', category: 'Racing', year: 1990,
      desc: 'Racer — Gremlin',
      iaSearch: 'title:"lotus esprit" AND collection:softwarelibrary_c64_games' },

    // === Puzzle ===========================================================
    { name: 'Tetris', icon: '🟦', category: 'Puzzle', year: 1988,
      desc: 'Falling-block classic — Mirrorsoft',
      iaSearch: 'title:tetris AND collection:softwarelibrary_c64_games' },
    { name: 'Lemmings', icon: '🐹', category: 'Puzzle', year: 1991,
      desc: 'Save the suicide squad — DMA Design',
      iaSearch: 'title:lemmings AND collection:softwarelibrary_c64_games' },
    { name: 'The Sentinel', icon: '👁️', category: 'Puzzle', year: 1987,
      desc: '3D strategy puzzle — Geoff Crammond',
      iaSearch: 'title:sentinel AND collection:softwarelibrary_c64_games' },
    { name: 'Stunt Car Racer', icon: '🎢', category: 'Puzzle', year: 1989,
      desc: 'Rollercoaster racer — Crammond',
      iaSearch: 'title:"stunt car racer" AND collection:softwarelibrary_c64_games' },

    // === Demoscene (experimental — proxied through IA, may not resolve) ====
    { name: 'Edge of Disgrace', icon: '✨', category: 'Demoscene', year: 2008,
      desc: 'Booze Design — acclaimed late-era demo',
      iaItem: 'c64_demo_edge_of_disgrace' },
    { name: 'Comaland 100%', icon: '🌈', category: 'Demoscene', year: 2014,
      desc: 'Censor Design — Datastorm winner',
      iaItem: 'c64_demo_comaland_100' },

    // === Tools ===========================================================
    { name: 'Commodore BASIC (no disk)', icon: '⌨️', category: 'Tools', year: 1982,
      desc: 'Boot to the famous "READY." prompt',
      url: '' /* empty URL sentinel = boot machine with no media */ },
];

const CATEGORY_ORDER = [
    'Local Library',  // host-uploaded ROMs from assets/c64/local/, surfaced first
    'Arcade',
    'Action',
    'Shooter',
    'Platformer',
    'Puzzle',
    'Adventure',
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
        this._localLibrary = [];        // host-uploaded ROMs from assets/c64/local/ (loaded on mount)
        this._dropdownEntries = new Map(); // option value → library entry (rebuilt on local-library load)
        this._paused = false;           // user-driven pause state
        this._muted = false;            // user-driven mute state
        this._volumeBeforeMute = 0.5;   // restored when un-muting
        this._recents = [];             // last N played entries (persisted to localStorage)
        this._pagehideHandler = null;   // bound listener so we can remove it on close
        this._loadGeneration = 0;       // monotonically increasing — cancels stale resolves
        this._lastSaveState = null;     // Uint8Array of the most-recent save state (per session)
        this._prefetchBlobUrl = null;   // Blob URL of the most-recent pre-fetched ROM (revoked on stop)

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
        const dropdownOptions = this._buildDropdownOptionsHTML();

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
                        <button class="c64-btn" id="c64PauseBtn" title="Pause / resume (P)" disabled>⏸ Pause</button>
                        <button class="c64-btn" id="c64MuteBtn" title="Mute / unmute (M)">🔊</button>
                        <button class="c64-btn" id="c64SaveStateBtn" title="Save state (Ctrl+S)" disabled>💾 Save</button>
                        <button class="c64-btn" id="c64LoadStateBtn" title="Load state (Ctrl+L)" disabled>📂 Load</button>
                        <button class="c64-btn" id="c64StopBtn" title="Stop emulator (Esc)" disabled>⏹ Stop</button>
                        <button class="c64-btn" id="c64ResetBtn" title="Reload current disk (R)" disabled>🔄 Reset</button>
                        <button class="c64-btn" id="c64FsBtn" title="Toggle fullscreen (F)">⛶ Fullscreen</button>
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
                <div class="c64-recents" id="c64Recents" style="display:none;"></div>
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
                            <b>Disk</b> dropdown picks from 48 freeware homebrew (instant from
                            GitHub), classic titles resolved on demand, and any ROMs the host
                            has dropped into <code>assets/c64/local/</code>. Or paste a
                            <code>.d64</code> / <code>.prg</code> / <code>.crt</code> URL,
                            or click <b>File…</b> for a local file.<br>
                            <span class="c64-splash-keys">Keys: <b>P</b>=pause &middot; <b>M</b>=mute &middot; <b>R</b>=reset &middot; <b>F</b>=fullscreen &middot; <b>Esc</b>=stop &middot; <b>Ctrl+S/L</b>=save&nbsp;state</span><br>
                            <a class="c64-splash-link"
                               href="https://github.com/retrobrews/c64-games" target="_blank"
                               rel="noopener">Browse the full retrobrews homebrew catalog →</a><br>
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
        const pauseBtn = this.getElement('#c64PauseBtn');
        const muteBtn = this.getElement('#c64MuteBtn');
        const saveStateBtn = this.getElement('#c64SaveStateBtn');
        const loadStateBtn = this.getElement('#c64LoadStateBtn');

        this.addHandler(gameSelect, 'change', (e) => {
            const value = e.target.value;
            if (!value) return;
            // Option values are `opt:<n>` keys into `_dropdownEntries`,
            // which is rebuilt whenever the dropdown is re-rendered (e.g.
            // after the local-library fetch lands).
            const entry = this._dropdownEntries.get(value);
            if (!entry) return;
            if (urlInput && typeof entry.url === 'string') urlInput.value = entry.url;
            this.loadLibraryEntry(entry);
        });

        const launchFromUrlBar = () => {
            const url = urlInput?.value?.trim() ?? '';
            if (!url) return;
            const name = this.lookupBundleName(url);
            // URL-pasted entries go into recents too — easy re-launch.
            this._pushRecent({ name, url, icon: '🔗', category: 'Recently pasted' });
            this.loadGame(url, name);
        };
        this.addHandler(runBtn, 'click', launchFromUrlBar);
        this.addHandler(urlInput, 'keydown', (e) => {
            if (e.key === 'Enter') launchFromUrlBar();
        });

        this.addHandler(fileBtn, 'click', () => fileInput?.click());
        this.addHandler(fileInput, 'change', (e) => {
            const file = e.target.files?.[0];
            if (file) this.loadLocalFile(file);
            e.target.value = ''; // allow re-selecting the same file
        });

        this.addHandler(stopBtn, 'click', () => this.stopEmulator());
        this.addHandler(resetBtn, 'click', () => this.resetCurrent());
        this.addHandler(fsBtn, 'click', () => this.toggleFullscreen());
        this.addHandler(pauseBtn, 'click', () => this.togglePause());
        this.addHandler(muteBtn, 'click', () => this.toggleMute());
        this.addHandler(saveStateBtn, 'click', () => this.saveState());
        this.addHandler(loadStateBtn, 'click', () => this.loadState());

        const errorDismiss = this.getElement('#c64ErrorDismiss');
        this.addHandler(errorDismiss, 'click', () => {
            const splash = this.getElement('#c64Splash');
            const errorOverlay = this.getElement('#c64Error');
            if (errorOverlay) errorOverlay.style.display = 'none';
            if (splash) splash.style.display = 'flex';
            if (gameSelect) gameSelect.value = '';
            this.setStatus('Ready');
        });

        // Keyboard shortcuts. Gated on isFocused() so a Tetris piece (or
        // any other app's listener) doesn't trigger when the user is
        // typing in another window. AppBase tracks per-window focus.
        this.addHandler(document, 'keydown', (e) => {
            if (!this.isFocused()) return;
            // Don't hijack typing in the URL input.
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            this._handleShortcut(e);
        });

        // Tab close / page navigate: kill audio cleanly. Without this,
        // closing the browser tab while a game is playing leaves the
        // SID worker running long enough to be audible into the next
        // page load. `pagehide` fires on bfcache freezes too.
        this._pagehideHandler = () => {
            try { this.stopEmulator(); } catch { /* ignore */ }
        };
        window.addEventListener('pagehide', this._pagehideHandler);

        // Render the recent-games chips (loaded from localStorage).
        this._loadRecents();
        this._renderRecents();

        // Preload the EmulatorJS loader script in the background so the
        // first user-initiated launch is faster.
        this.ensureLoaderPreloaded().catch((err) => {
            console.warn('[C64] Background loader preload failed:', err);
        });

        // Pull in any host-uploaded ROMs from `assets/c64/local/` and
        // splice them into the dropdown. Errors are non-fatal.
        this._fetchLocalLibrary();
    }

    onClose() {
        // Aggressive teardown — see stopEmulator() for the full audio-kill
        // chain. We deliberately don't await it: the chain is largely
        // synchronous (mute → close AudioContext → terminate Worker) and
        // the WindowManager doesn't await onClose anyway.
        this.stopEmulator();
        if (this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }
        // Detach the tab-close audio-kill listener.
        if (this._pagehideHandler) {
            try { window.removeEventListener('pagehide', this._pagehideHandler); } catch { /* ignore */ }
            this._pagehideHandler = null;
        }
    }

    onResize() {
        // EmulatorJS uses ResizeObserver internally — no action needed.
    }

    // ── Library / Dropdown Helpers ─────────────────────────────

    /**
     * Build the `<optgroup>`-grouped HTML for the disk-select dropdown.
     * Combines the bundled GAME_LIBRARY with any host-uploaded ROMs that
     * `_fetchLocalLibrary()` has discovered. Also (re)populates
     * `this._dropdownEntries` so the change handler can look entries up
     * by their option value without re-doing the merge.
     *
     * Local-library entries are surfaced first (they're the host's own
     * picks — they should be discoverable, not buried).
     *
     * @returns {string} HTML for `<optgroup>` blocks
     */
    _buildDropdownOptionsHTML() {
        this._dropdownEntries = new Map();
        const byCat = new Map();

        // Local entries first so they get the lowest indexes (and so
        // CATEGORY_ORDER's "Local Library" slot is always populated when
        // the host has dropped any files in).
        const allEntries = [...this._localLibrary, ...GAME_LIBRARY];
        allEntries.forEach((entry, idx) => {
            const key = `opt:${idx}`;
            this._dropdownEntries.set(key, entry);
            const cat = entry.category || 'Misc';
            if (!byCat.has(cat)) byCat.set(cat, []);
            byCat.get(cat).push({ entry, key });
        });

        const orderedCats = [
            ...CATEGORY_ORDER.filter(c => byCat.has(c)),
            ...[...byCat.keys()].filter(c => !CATEGORY_ORDER.includes(c))
        ];

        return orderedCats.map(cat => {
            const items = byCat.get(cat).map(({ entry, key }) => {
                const yearTag = entry.year ? ` (${entry.year})` : '';
                const descTag = entry.desc ? ` — ${entry.desc}` : '';
                const label = `${entry.icon || '💾'} ${entry.name}${yearTag}${descTag}`;
                return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`;
            }).join('');
            return `<optgroup label="${escapeHtml(cat)}">${items}</optgroup>`;
        }).join('');
    }

    /**
     * Fetch host-uploaded ROMs from `api/c64-local.php`. The endpoint
     * scans `assets/c64/local/` and returns a JSON list. We add results
     * to `this._localLibrary` and re-render the dropdown options.
     *
     * Errors are non-fatal — if the endpoint isn't deployed or the
     * directory is empty, we just leave the local library empty and the
     * dropdown carries on with the bundled retrobrews titles only.
     */
    async _fetchLocalLibrary() {
        try {
            const url = new URL('api/c64-local.php', document.baseURI).toString();
            const res = await fetch(url, { credentials: 'omit' });
            if (!res.ok) {
                console.warn('[C64] Local library endpoint returned HTTP', res.status);
                return;
            }
            const data = await res.json();
            const entries = Array.isArray(data?.entries) ? data.entries : [];
            if (entries.length === 0) return;

            // Normalise into the GAME_LIBRARY entry shape so the rest of the
            // app treats them identically to the bundled titles.
            this._localLibrary = entries.map(e => ({
                name:     typeof e.name === 'string' ? e.name : 'Untitled',
                icon:     typeof e.icon === 'string' ? e.icon : '💾',
                category: typeof e.category === 'string' ? e.category : 'Local Library',
                year:     Number.isInteger(e.year) ? e.year : 0,
                desc:     typeof e.desc === 'string' ? e.desc : '',
                url:      typeof e.url === 'string' ? e.url : '',
            })).filter(e => e.url);

            // Re-render the dropdown options so the new entries appear.
            const select = this.getElement('#c64GameSelect');
            if (select) {
                const previousValue = select.value;
                // Preserve the placeholder option, replace the rest.
                const placeholder = '<option value="">— Pick a program —</option>';
                select.innerHTML = placeholder + this._buildDropdownOptionsHTML();
                // Restore the previous selection if it still exists.
                if (previousValue && [...select.options].some(o => o.value === previousValue)) {
                    select.value = previousValue;
                }
            }
            console.log(`[C64] Loaded ${this._localLibrary.length} local ROM(s) from assets/c64/local/`);
        } catch (err) {
            console.warn('[C64] Local library fetch failed (non-fatal):', err);
        }
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
            // Skip recents for the BASIC entry (it's "no media") and for
            // blob URLs (they don't survive a session, so re-loading from
            // recents next time would 404).
            if (entry.url && !entry.url.startsWith('blob:')) {
                this._pushRecent(entry);
            }
            await this.loadGame(entry.url, displayName);
            return;
        }

        if (!entry.iaItem && !entry.iaSearch) {
            this._showError('Library entry "' + displayName + '" has no url, iaItem, or iaSearch.');
            return;
        }

        // Immediately swap to the loading overlay so the user sees visible
        // feedback even before the resolver fetch returns. Without this the
        // splash stays up during the (sometimes slow) metadata round-trip
        // and it looks like the dropdown did nothing.
        const resolveLabel = entry.iaItem
            ? 'Resolving "' + displayName + '" on Internet Archive…'
            : 'Searching Internet Archive for "' + displayName + '"…';
        this._showLoading(resolveLabel);
        this.setStatus(resolveLabel);

        try {
            // If the entry only has a search query, resolve it to a specific
            // item ID first. The search result is cached so re-launching
            // doesn't re-hit the search endpoint.
            let itemId = entry.iaItem;
            if (!itemId) {
                itemId = await this._resolveIASearchToItemId(entry.iaSearch, displayName);
                this._showLoading('Resolving "' + displayName + '" (' + itemId + ')…');
            }
            const url = await this._resolveIAItemToUrl(itemId);
            // Push BEFORE the load — that way if the load itself fails the
            // user still has the recent button as a quick re-try.
            this._pushRecent(entry);
            await this.loadGame(url, displayName);
        } catch (err) {
            console.error('[C64] IA resolve failed for', entry.iaItem || entry.iaSearch, '→', err);
            const iaSearchUrl = 'https://archive.org/search?query=' +
                encodeURIComponent((entry.iaSearch || displayName) + ' commodore 64');
            this._showError(
                `Couldn't load "${displayName}" from Internet Archive.`,
                [
                    `Reason: ${err?.message || err}`,
                    entry.iaItem
                        ? `The IA item ID "${entry.iaItem}" may have been renamed or removed.`
                        : `The IA search for this title returned no matching item.`,
                    'Try another title, paste a URL above, or click "File…" to load a local .d64.'
                ],
                { iaSearchUrl }
            );
            this.setStatus('Failed: ' + (err?.message || err));
            this.emitAppEvent('error', {
                error: err?.message || String(err),
                iaItem: entry.iaItem,
                iaSearch: entry.iaSearch,
                name: displayName
            });
        }
    }

    /**
     * Resolve an Internet Archive search query to a specific item ID.
     * Hits IA's advancedsearch.php endpoint through our proxy (which
     * sidesteps IA's inconsistent CORS posture) and picks the top result.
     *
     * The query is the value of `entry.iaSearch` — typically Lucene-style
     * with `mediatype:software` and a collection filter to keep results
     * narrowed to C64 software:
     *
     *   title:"Boulder Dash" AND collection:softwarelibrary_c64_games
     *
     * Cached per-instance. Concurrent calls for the same query are
     * deduped through `_iaResolveInFlight`.
     *
     * @private
     * @param {string} query
     * @param {string} displayName - for error messages
     * @returns {Promise<string>} the resolved IA item identifier
     */
    _resolveIASearchToItemId(query, displayName) {
        const cacheKey = 'search:' + query;
        if (this._iaUrlCache.has(cacheKey)) {
            return Promise.resolve(this._iaUrlCache.get(cacheKey));
        }
        if (this._iaResolveInFlight.has(cacheKey)) {
            return this._iaResolveInFlight.get(cacheKey);
        }

        const directSearchUrl =
            'https://archive.org/advancedsearch.php' +
            '?q=' + encodeURIComponent(query) +
            '&fl[]=identifier&fl[]=title&fl[]=mediatype' +
            '&rows=5&page=1&output=json';
        const fetchUrl = this.getLoadUrl(directSearchUrl);

        const promise = (async () => {
            const res = await fetch(fetchUrl, { credentials: 'omit' });
            if (!res.ok) {
                throw new Error(`IA search HTTP ${res.status} for "${displayName}"`);
            }
            const data = await res.json();
            const docs = data?.response?.docs;
            if (!Array.isArray(docs) || docs.length === 0) {
                throw new Error(`IA search returned no results for "${displayName}"`);
            }
            // Prefer software-mediatype results, fall back to the top hit.
            const softwareHit = docs.find(d => d.mediatype === 'software');
            const pick = softwareHit || docs[0];
            const itemId = pick?.identifier;
            if (typeof itemId !== 'string' || !itemId) {
                throw new Error(`IA search result missing identifier for "${displayName}"`);
            }
            this._iaUrlCache.set(cacheKey, itemId);
            return itemId;
        })().finally(() => {
            this._iaResolveInFlight.delete(cacheKey);
        });

        this._iaResolveInFlight.set(cacheKey, promise);
        return promise;
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
     * Pre-fetch a ROM URL into a Blob and return a same-origin blob URL, so
     * EmulatorJS / Emscripten doesn't see CORS or HTML error pages.
     *
     * EmulatorJS hands EJS_gameUrl to Emscripten's preloadFile, which fetches
     * via XHR inside the WASM-instantiated worker. If that fetch returns a
     * 4xx with an HTML body — which the IA proxy WILL do when an item ID is
     * stale or the file is missing — the bytes get treated as a ROM and the
     * libretro core aborts with "RuntimeError: Aborted(undefined)", giving
     * the user a black screen and a useless stack.
     *
     * Pre-fetching gives us a chance to sanity-check before the WASM ever
     * sees the bytes: 4xx/5xx becomes a real error message; HTML responses
     * are rejected as not-a-ROM; empty bodies are rejected too. Successful
     * fetches become a blob URL that's same-origin to us, so EmulatorJS
     * loads it without any CORS dance.
     *
     * @private
     * @param {string} originalUrl - The user-facing URL (will be passed through getLoadUrl)
     * @param {string} displayName
     * @param {(text:string)=>void} [onProgress]
     * @returns {Promise<string>} A blob: URL ready to hand to EmulatorJS
     */
    async _prefetchRomToBlob(originalUrl, displayName, onProgress) {
        // Local schemes are already same-origin / in-memory — nothing to do.
        if (originalUrl.startsWith('blob:') || originalUrl.startsWith('data:')) {
            return originalUrl;
        }
        const fetchUrl = this.getLoadUrl(originalUrl);
        onProgress?.(`Downloading "${displayName}"…`);

        let res;
        try {
            res = await fetch(fetchUrl, { credentials: 'omit' });
        } catch (e) {
            throw new Error(`Network error fetching "${displayName}": ${e?.message || e}`);
        }
        if (!res.ok) {
            // Try to read the proxy's text error body for a useful message.
            let detail = '';
            try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
            throw new Error(
                `HTTP ${res.status} ${res.statusText || ''} fetching "${displayName}"` +
                (detail ? ` — ${detail}` : '')
            );
        }
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        // The proxy is supposed to forward the upstream content-type. If it
        // comes back as text/html the upstream sent an error page and the
        // file we wanted isn't there. (Don't bounce on text/plain — GitHub
        // raw serves .prg as text/plain even though the bytes are binary.)
        if (ct.startsWith('text/html')) {
            throw new Error(
                `"${displayName}" upstream returned ${ct} (expected a disk image). ` +
                `The Internet Archive item may have been renamed.`
            );
        }
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 32) {
            throw new Error(`"${displayName}" downloaded ${buf.byteLength} bytes — not a ROM.`);
        }
        const blob = new Blob([buf], { type: ct || 'application/octet-stream' });
        return URL.createObjectURL(blob);
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

            // Pre-fetch the ROM into a same-origin blob URL so EmulatorJS
            // never sees a CORS hop, HTML error page, or 4xx — all of which
            // make the libretro core abort with no useful diagnostic. This
            // is the single biggest reliability win for "Aborted(undefined)"
            // crashes from IA-resolved entries.
            let emulatorUrl = '';
            if (url) {
                if (loadingText) loadingText.textContent = `Downloading "${displayName}"…`;
                emulatorUrl = await this._prefetchRomToBlob(url, displayName, (text) => {
                    if (loadingText) loadingText.textContent = text;
                    this.setStatus(text);
                });
                this._prefetchBlobUrl = emulatorUrl; // tracked for revocation on stop
            }

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
            // loader reads `window.EJS_*` at script-execute time. We hand it
            // the pre-fetched blob URL (or empty for boot-to-BASIC) so its
            // internal fetch is a local Blob read, never a cross-origin one.
            this._configureEmulatorJSGlobals({
                playerSelector: `#${root.id}`,
                gameUrl: emulatorUrl,
                gameName: displayName,
                onReady: () => this._handleEmulatorReady()
            });

            await this._executeLoader();

            if (loading) loading.style.display = 'none';

            this.emitAppEvent('started', { url, name: displayName });
        } catch (err) {
            const reason = err?.message || String(err) || 'Unknown error';
            console.error('[C64] Failed to start emulator:', err);
            this.setStatus('Error: ' + reason);
            if (loading) loading.style.display = 'none';
            this._showError(
                `Couldn't start "${displayName}"`,
                [
                    `Reason: ${reason}`,
                    url
                        ? 'The ROM may be unavailable upstream, or the proxy returned an error page.'
                        : 'EmulatorJS failed to initialise.',
                    'Try another title, paste a URL above, or click "File…" to load a local .d64.',
                ],
                url
                    ? { iaSearchUrl: 'https://archive.org/search?query=' + encodeURIComponent(displayName + ' commodore 64') }
                    : {}
            );
            // Drop the half-attached prefetch blob if we made one.
            if (this._prefetchBlobUrl) {
                try { URL.revokeObjectURL(this._prefetchBlobUrl); } catch { /* ignore */ }
                this._prefetchBlobUrl = null;
            }
            this.isRunning = false;
            this.isReady = false;
            this.updateButtons(false);
            this.emitAppEvent('error', { error: reason, url });
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
        // gameUrl is already a same-origin blob: URL (or '' for boot-to-BASIC)
        // because `_startEmulatorWith` pre-fetches via `_prefetchRomToBlob`.
        // When no URL is supplied, clear EJS_gameUrl entirely — setting it to
        // an empty string makes EmulatorJS try to fetch "" and silently fail
        // before anything visible happens. Clearing the global tells
        // EmulatorJS to boot the machine with no media, which on C64 lands
        // at the "READY." BASIC prompt.
        if (gameUrl) {
            window.EJS_gameUrl = gameUrl;
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
     *
     * EmulatorJS doesn't have a single "kill everything cleanly" call — its
     * different versions expose different teardown hooks, the Emscripten
     * worker keeps pumping audio frames after `EJS_terminate`, and the
     * AudioContext lives on `gameManager.Module` rather than on the
     * `EJS_emulator` root. So this routine is deliberately belt-and-braces:
     *   1. Mute volume to 0 first so nothing is audible during teardown.
     *   2. Try every plausible exit/terminate function in order.
     *   3. Walk a list of known AudioContext locations and call .close().
     *   4. Pause and detach any <audio> elements under the player root.
     *   5. Terminate any Web Workers reachable from the emulator object.
     *   6. Drop the entire DOM subtree so the canvas / WebGL ctx is GC'd.
     *   7. Null all our refs so nothing keeps the worker alive.
     * Without all of this the user closes the C64 window and the SID music
     * plays on forever.
     *
     * @param {boolean} [keepSplash=true] - If false, caller will swap content immediately.
     */
    async stopEmulator(keepSplash = true) {
        const stage = this.getElement('#c64Stage');
        const splash = this.getElement('#c64Splash');

        if (this._readyWatchdog) {
            clearTimeout(this._readyWatchdog);
            this._readyWatchdog = null;
        }

        const emu = window.EJS_emulator;

        // 1. Pre-mute so anything in flight during teardown is silent.
        try { emu?.setVolume?.(0); } catch { /* ignore */ }
        try { emu?.gameManager?.setVolume?.(0); } catch { /* ignore */ }

        // 2. Every documented exit / terminate path. We `await` each in case
        //    the function returns a Promise. Individual failures are
        //    expected (different EmulatorJS versions support different
        //    subsets) — we keep going.
        const exitPaths = [
            () => emu?.callEvent?.('exit'),
            () => emu?.exit?.(),
            () => emu?.gameManager?.exit?.(),
            () => emu?.gameManager?.Module?._exit?.(0),
            () => window.EJS_terminate?.(),
        ];
        for (const fn of exitPaths) {
            try { await Promise.resolve(fn()); } catch { /* ignore */ }
        }

        // 3. Explicitly close any AudioContext we can find. The terminate
        //    hooks above don't always do this — the worker thread can still
        //    keep an open AudioContext that pumps the SID buffer.
        const audioCandidates = [
            emu?.audioCtx,
            emu?.audio?.audioCtx,
            emu?.audio?.context,
            emu?.gameManager?.audio?.audioCtx,
            emu?.gameManager?.audio?.context,
            emu?.gameManager?.Module?.SDL2?.audioContext,
            emu?.gameManager?.Module?.SDL?.audioContext,
            emu?.gameManager?.Module?.audioContext,
        ];
        for (const ctx of audioCandidates) {
            if (ctx && typeof ctx.close === 'function' && ctx.state !== 'closed') {
                try { ctx.close(); } catch { /* ignore */ }
            }
        }

        // 4. Pause and unhook any <audio> elements under the player div.
        if (stage) {
            for (const a of stage.querySelectorAll('audio')) {
                try { a.pause(); } catch { /* ignore */ }
                try { a.removeAttribute('src'); a.load(); } catch { /* ignore */ }
            }
        }

        // 5. Terminate Web Workers we can reach. EmulatorJS spawns one per
        //    instance for the libretro core; if it survives the DOM drop it
        //    can keep nudging the audio output until GC eventually reaps it.
        const workerCandidates = [
            emu?.gameManager?.Module?.worker,
            emu?.gameManager?.worker,
            emu?.worker,
        ];
        for (const w of workerCandidates) {
            if (w && typeof w.terminate === 'function') {
                try { w.terminate(); } catch { /* ignore */ }
            }
        }

        try { delete window.EJS_emulator; } catch { /* non-configurable, ignore */ }

        // 6. Drop the entire DOM subtree so canvases / WebGL ctx / any
        //    surviving audio nodes lose all references and become GC-eligible.
        if (stage) stage.innerHTML = '';

        if (this.activeBlobUrl && this.currentRom === this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }
        // Revoke the pre-fetch blob too — it was bytes we created on this
        // launch, kept alive only so EmulatorJS could read it.
        if (this._prefetchBlobUrl) {
            try { URL.revokeObjectURL(this._prefetchBlobUrl); } catch { /* ignore */ }
            this._prefetchBlobUrl = null;
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

    // ── Toolbar Actions (also bound to keyboard shortcuts) ─────

    /**
     * Toggle pause / resume. Updates the button label so the user can
     * tell at a glance which state they're in.
     */
    togglePause() {
        if (!this.isRunning) return;
        this._paused = !this._paused;
        try {
            window.EJS_emulator?.gameManager?.setPaused?.(this._paused);
            // Older EmulatorJS exposed setPaused on the root; guard for both.
            window.EJS_emulator?.setPaused?.(this._paused);
        } catch (e) {
            console.warn('[C64] togglePause failed:', e);
        }
        const btn = this.getElement('#c64PauseBtn');
        if (btn) btn.innerHTML = this._paused ? '▶ Resume' : '⏸ Pause';
        this.setStatus(this._paused ? 'Paused: ' + (this.currentRomName || '') : 'Running: ' + (this.currentRomName || ''));
        this.emitAppEvent(this._paused ? 'paused' : 'resumed', { name: this.currentRomName });
    }

    /**
     * Toggle mute. Restores the prior volume on un-mute.
     */
    toggleMute() {
        this._muted = !this._muted;
        if (this._muted) {
            // Snapshot current volume before muting if we can read it.
            const cur = window.EJS_emulator?.gameManager?.getVolume?.()
                ?? window.EJS_emulator?.volume
                ?? this._volumeBeforeMute;
            if (typeof cur === 'number') this._volumeBeforeMute = cur;
            this.setVolume(0);
        } else {
            this.setVolume(this._volumeBeforeMute || 0.5);
        }
        const btn = this.getElement('#c64MuteBtn');
        if (btn) btn.innerHTML = this._muted ? '🔇' : '🔊';
        if (btn) btn.title = (this._muted ? 'Unmute (M)' : 'Mute (M)');
    }

    /**
     * Save the current emulator state to an in-memory slot. Per-session
     * only — closing the C64 app discards it. (Persisting save states
     * across sessions would belong in a follow-up wired through
     * StorageManager so the save bytes are scoped to the right user.)
     */
    async saveState() {
        if (!this.isRunning || !this.isReady) return;
        try {
            const gm = window.EJS_emulator?.gameManager;
            if (!gm?.getState) {
                this.setStatus('Save state not supported by this core build');
                return;
            }
            const state = await Promise.resolve(gm.getState());
            if (!state) throw new Error('getState returned empty');
            this._lastSaveState = state;
            const loadBtn = this.getElement('#c64LoadStateBtn');
            if (loadBtn) loadBtn.disabled = false;
            this.setStatus('State saved (in-memory, this session)');
            this.emitAppEvent('stateSaved', { bytes: state?.length || 0 });
        } catch (e) {
            console.warn('[C64] saveState failed:', e);
            this.setStatus('Save state failed: ' + (e?.message || e));
        }
    }

    /**
     * Restore the most-recent saved state. No-op if nothing is saved
     * yet or if the emulator isn't ready.
     */
    async loadState() {
        if (!this.isRunning || !this.isReady) return;
        if (!this._lastSaveState) {
            this.setStatus('No save state in this session yet');
            return;
        }
        try {
            const gm = window.EJS_emulator?.gameManager;
            if (!gm?.loadState) {
                this.setStatus('Load state not supported by this core build');
                return;
            }
            await Promise.resolve(gm.loadState(this._lastSaveState));
            this.setStatus('State restored');
            this.emitAppEvent('stateLoaded', {});
        } catch (e) {
            console.warn('[C64] loadState failed:', e);
            this.setStatus('Load state failed: ' + (e?.message || e));
        }
    }

    /**
     * Reload the currently-running ROM from scratch.
     */
    async resetCurrent() {
        const url = this.currentRom;
        const name = this.currentRomName;
        await this.stopEmulator();
        if (url !== null) await this.loadGame(url, name);
    }

    /**
     * Map a keydown event to a toolbar action. Called from the document
     * keydown listener, which is gated on `isFocused()` so we never
     * eat keys destined for another app.
     * @private
     */
    _handleShortcut(e) {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 's') { e.preventDefault(); this.saveState(); return; }
            if (key === 'l') { e.preventDefault(); this.loadState(); return; }
            return;
        }
        // Plain shortcuts — ignore if any modifier is held to avoid
        // colliding with browser shortcuts.
        if (e.altKey || e.shiftKey) return;
        switch (e.key) {
            case 'Escape':
                if (this.isRunning) { e.preventDefault(); this.stopEmulator(); }
                break;
            case 'p': case 'P':
                if (this.isRunning) { e.preventDefault(); this.togglePause(); }
                break;
            case 'm': case 'M':
                e.preventDefault(); this.toggleMute();
                break;
            case 'r': case 'R':
                if (this.isRunning) { e.preventDefault(); this.resetCurrent(); }
                break;
            case 'f': case 'F':
                e.preventDefault(); this.toggleFullscreen();
                break;
        }
    }

    // ── Recent Games (persisted to localStorage) ───────────────

    /** localStorage key for the recent-games list. */
    static get RECENTS_KEY() { return 'c64.recents.v1'; }
    /** Hard cap on how many recents we keep. */
    static get RECENTS_MAX() { return 6; }

    /** @private */
    _loadRecents() {
        try {
            const raw = localStorage.getItem(C64.RECENTS_KEY);
            const arr = raw ? JSON.parse(raw) : [];
            if (Array.isArray(arr)) {
                this._recents = arr.filter(r =>
                    r && typeof r === 'object' &&
                    typeof r.name === 'string' &&
                    (typeof r.url === 'string' || typeof r.iaItem === 'string' || typeof r.iaSearch === 'string')
                ).slice(0, C64.RECENTS_MAX);
            }
        } catch { /* corrupt or unavailable storage — ignore */ }
    }

    /** @private */
    _saveRecents() {
        try {
            localStorage.setItem(C64.RECENTS_KEY, JSON.stringify(this._recents));
        } catch { /* quota / private mode — ignore */ }
    }

    /**
     * Push an entry onto the recents list (most-recent first, deduped).
     * @private
     */
    _pushRecent(entry) {
        if (!entry || !entry.name) return;
        // Dedup by url|iaItem|iaSearch so the same title coalesces across
        // launches even if the resolved URL differs.
        const key = entry.url || entry.iaItem || entry.iaSearch || entry.name;
        const trimmed = {
            name: entry.name,
            icon: entry.icon || '💾',
            url: entry.url,
            iaItem: entry.iaItem,
            iaSearch: entry.iaSearch,
            category: entry.category,
            year: entry.year,
        };
        const existingIdx = this._recents.findIndex(r =>
            (r.url || r.iaItem || r.iaSearch || r.name) === key);
        if (existingIdx !== -1) this._recents.splice(existingIdx, 1);
        this._recents.unshift(trimmed);
        if (this._recents.length > C64.RECENTS_MAX) this._recents.length = C64.RECENTS_MAX;
        this._saveRecents();
        this._renderRecents();
    }

    /**
     * Render the recents bar. Hidden when empty.
     * @private
     */
    _renderRecents() {
        const bar = this.getElement('#c64Recents');
        if (!bar) return;
        if (this._recents.length === 0) {
            bar.style.display = 'none';
            bar.innerHTML = '';
            return;
        }
        bar.style.display = 'flex';
        const chips = this._recents.map((r, i) => {
            const label = `${r.icon || '💾'} ${r.name}`;
            return `<button class="c64-recent-chip" data-recent-idx="${i}"
                            title="Re-launch ${escapeHtml(r.name)}">${escapeHtml(label)}</button>`;
        }).join('');
        bar.innerHTML = '<span class="c64-recents-label">Recent:</span>' + chips;
        // Wire chip clicks. addHandler binds to the new nodes so the
        // SubscriptionManager cleans them up on app close.
        for (const chip of bar.querySelectorAll('.c64-recent-chip')) {
            this.addHandler(chip, 'click', () => {
                const idx = Number(chip.dataset.recentIdx);
                const entry = this._recents[idx];
                if (entry) this.loadLibraryEntry(entry);
            });
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
        const pauseBtn = this.getElement('#c64PauseBtn');
        const saveStateBtn = this.getElement('#c64SaveStateBtn');
        const loadStateBtn = this.getElement('#c64LoadStateBtn');
        if (stopBtn) stopBtn.disabled = !running;
        if (resetBtn) resetBtn.disabled = !running;
        if (pauseBtn) pauseBtn.disabled = !running;
        if (saveStateBtn) saveStateBtn.disabled = !running;
        // Load state needs both a running emulator AND a saved snapshot.
        if (loadStateBtn) loadStateBtn.disabled = !running || !this._lastSaveState;
        // When the emulator stops, reset paused state so the next launch
        // starts un-paused.
        if (!running) {
            this._paused = false;
            if (pauseBtn) pauseBtn.innerHTML = '⏸ Pause';
        }
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
