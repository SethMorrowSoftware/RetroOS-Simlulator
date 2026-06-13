/**
 * DOSBox App - DOS Emulator for IlluminatOS!
 * Run DOS programs and games in the browser via js-dos v8 (WebAssembly DOSBox / DOSBox-X).
 *
 * Uses js-dos v8 (https://js-dos.com/) loaded from the official CDN at v8.js-dos.com.
 * Supports the bundled game library, arbitrary .jsdos bundle URLs, and local .jsdos files.
 *
 * SETUP:
 *   No installation required — js-dos is loaded automatically from CDN the first time
 *   the app is used in a session. The CDN also serves the WASM/worker assets.
 *
 * SCRIPTING SUPPORT:
 *   Commands: run, runFile, stop, reset, fullscreen, setVolume, pause, resume, save
 *   Queries:  getState, getLibrary, getVersion
 *   Events:   app:dosbox:started, app:dosbox:ready, app:dosbox:stopped, app:dosbox:error
 *
 * RETROSCRIPT EXAMPLES:
 *   command dosbox:run { url: "https://v8.js-dos.com/bundles/digger.jsdos" }
 *   command dosbox:stop
 *   command dosbox:reset
 *   command dosbox:fullscreen
 *   command dosbox:setVolume { volume: 0.5 }
 *   set $state = query dosbox:getState
 *   set $library = query dosbox:getLibrary
 */

import AppBase from './AppBase.js';
import { escapeHtml } from '../core/Sanitize.js';

/** CDN base for js-dos v8 assets (script, css, WASM workers). */
const JSDOS_CDN = 'https://v8.js-dos.com/latest';
const JSDOS_JS_URL = `${JSDOS_CDN}/js-dos.js`;
const JSDOS_CSS_URL = `${JSDOS_CDN}/js-dos.css`;
const EMULATORS_PATH_PREFIX = `${JSDOS_CDN}/emulators/`;

/**
 * Path to the IlluminatOS PHP CORS proxy (api/dosbox-proxy.php). Relative
 * to document.baseURI so it works at any deployment subpath (e.g. /TestOS/).
 *
 * The proxy is REQUIRED for cdn.dos.zone / br.cdn.dos.zone bundles — those
 * CDNs don't send Access-Control-Allow-Origin to arbitrary embedders. The
 * proxy fetches the bundle server-side and streams it back with permissive
 * CORS headers.
 *
 * Hosts that already send proper CORS (v8.js-dos.com, same-origin URLs,
 * blob:/data:/file:) bypass the proxy.
 */
const CORS_FRIENDLY_HOSTS = new Set(['v8.js-dos.com']);
const NEEDS_PROXY_HOSTS = new Set(['cdn.dos.zone', 'br.cdn.dos.zone', 'dos.zone']);

/**
 * Curated game library — verified .jsdos bundles served by the official
 * js-dos CDN (v8.js-dos.com) and the DOS.Zone CDN. Both CDNs set CORS
 * headers for embedding (cdn.dos.zone goes through the local PHP proxy
 * since it doesn't send CORS to third-party origins).
 *
 * URLs intentionally carry no query string: appending `?anonymous=1` (a
 * legacy js-dos v7 quirk) breaks v8's bundle handler.
 *
 * Bundle URLs were sourced from the js-dos/dos.zone.db YAML database
 * (community-maintained, archived Dec 2021). The S3 path
 *   https://doszone-uploads.s3.dualstack.eu-central-1.amazonaws.com/<x>
 * is fronted by
 *   https://cdn.dos.zone/<x>
 * which is what we use here.
 *
 * Each entry: { name, icon, genre, year, desc, url }
 * `genre` is used to group games in the dropdown.
 */
const GAME_LIBRARY = [
    // === Shooter (FPS / 3D shooters) ===
    { name: 'DOOM',                icon: '👹', genre: 'Shooter',     year: 1993,
      desc: 'id Software\'s legendary FPS',
      url: 'https://v8.js-dos.com/bundles/doom.jsdos' },
    { name: 'DOOM (Deathmatch)',   icon: '☠️', genre: 'Shooter',     year: 1993,
      desc: 'DOOM multiplayer deathmatch build',
      url: 'https://cdn.dos.zone/custom/dos/doom_dm.jsdos' },
    { name: 'DOOM II',             icon: '👺', genre: 'Shooter',     year: 1994,
      desc: 'Hell on Earth — the sequel',
      url: 'https://cdn.dos.zone/original/2X/b/b8e702710afd7ded24f03fd2cf40b3c5e1fb0dbf.jsdos' },
    { name: 'The Ultimate DOOM',   icon: '🔥', genre: 'Shooter',     year: 1995,
      desc: 'DOOM + the Thy Flesh Consumed episode',
      url: 'https://cdn.dos.zone/custom/dos/ultimate-doom.jsdos' },
    { name: 'Wolfenstein 3D',      icon: '🔫', genre: 'Shooter',     year: 1992,
      desc: 'The grand-daddy of 3D shooters',
      url: 'https://cdn.dos.zone/original/2X/a/ac888d1660aa253f0ed53bd6c962c894125aaa19.jsdos' },
    { name: 'Heretic',             icon: '🪄', genre: 'Shooter',     year: 1994,
      desc: 'Raven Software\'s fantasy DOOM',
      url: 'https://cdn.dos.zone/custom/dos/heretic.jsdos' },
    { name: 'Rise of the Triad',   icon: '☢️', genre: 'Shooter',     year: 1994,
      desc: 'Apogee\'s Wolf3D-engine bloodbath',
      url: 'https://cdn.dos.zone/custom/dos/rise-of-the-triad-dark-war.jsdos' },
    { name: 'Catacomb 3-D',        icon: '🕯️', genre: 'Shooter',     year: 1991,
      desc: 'id\'s first first-person 3D shooter',
      url: 'https://cdn.dos.zone/custom/dos/catacomb.jsdos' },
    { name: 'Catacomb Abyss',      icon: '💀', genre: 'Shooter',     year: 1992,
      desc: 'Catacomb 3-D Adventures vol. 1',
      url: 'https://cdn.dos.zone/custom/dos/catacomb-abyss.jsdos' },
    { name: 'Curse of the Catacombs', icon: '🗝️', genre: 'Shooter',  year: 1993,
      desc: 'Catacomb 3-D Adventures vol. 2',
      url: 'https://cdn.dos.zone/custom/dos/curse-of-the-catacombs.jsdos' },
    { name: 'Duke Nukem 3D',       icon: '💪', genre: 'Shooter',     year: 1996,
      desc: '"Hail to the king, baby."',
      url: 'https://cdn.dos.zone/custom/dos/duke3d_ipx.jsdos' },
    { name: 'Blood (low-res)',     icon: '🩸', genre: 'Shooter',     year: 1997,
      desc: 'Monolith\'s pulpy horror FPS',
      url: 'https://cdn.dos.zone/custom/dos/blood-lowres.jsdos' },

    // === Apogee shareware (extra platformers) ===
    { name: 'Duke Nukem II',       icon: '💥', genre: 'Platformer',  year: 1993,
      desc: 'Apogee\'s 2D side-scroller sequel',
      url: 'https://cdn.dos.zone/original/2X/d/d0e7675507a09a26c017996d0994da4ee38c90fe.jsdos' },
    { name: 'Pharaoh\'s Tomb',     icon: '🏺', genre: 'Platformer',  year: 1990,
      desc: 'Apogee early Egyptian platformer',
      url: 'https://cdn.dos.zone/custom/dos/pharaohs-tomb.jsdos' },
    { name: 'Arctic Adventure',    icon: '🐧', genre: 'Platformer',  year: 1991,
      desc: 'Apogee\'s frozen sequel to Pharaoh\'s Tomb',
      url: 'https://cdn.dos.zone/custom/dos/arctic-adventure.jsdos' },
    { name: 'Trek',                icon: '🛰️', genre: 'Platformer',  year: 1985,
      desc: 'Apogee\'s earliest "Kroz" precursor',
      url: 'https://cdn.dos.zone/custom/dos/trek.jsdos' },

    // === Platformer (Apogee/3D Realms & Epic MegaGames shareware) ===
    { name: 'Commander Keen 1-3',  icon: '🚀', genre: 'Platformer',  year: 1990,
      desc: 'Invasion of the Vorticons trilogy (Apogee/id)',
      url: 'https://cdn.dos.zone/custom/dos/commander-keen-1-3.jsdos' },
    { name: 'Commander Keen 6',    icon: '👶', genre: 'Platformer',  year: 1991,
      desc: 'Aliens Ate My Babysitter! — the lost episode',
      url: 'https://cdn.dos.zone/custom/dos/commander-keen-aliens-ate-my-babysitter_.jsdos' },
    { name: 'Bio Menace',          icon: '🧬', genre: 'Platformer',  year: 1993,
      desc: 'Apogee run-and-gun shareware by Tom Hall',
      url: 'https://cdn.dos.zone/custom/dos/bio-menace.jsdos' },
    { name: 'Crystal Caves',       icon: '💎', genre: 'Platformer',  year: 1991,
      desc: 'Apogee\'s gem-grabbing space caves',
      url: 'https://cdn.dos.zone/custom/dos/crystal-caves.jsdos' },
    { name: 'Monster Bash',        icon: '🧟', genre: 'Platformer',  year: 1993,
      desc: 'Apogee horror platformer',
      url: 'https://cdn.dos.zone/custom/dos/monster-bash.jsdos' },
    { name: 'Secret Agent',        icon: '🕵️', genre: 'Platformer',  year: 1992,
      desc: 'Apogee espionage platformer',
      url: 'https://cdn.dos.zone/custom/dos/secret-agent.jsdos' },
    { name: 'Dangerous Dave (Haunted Mansion)', icon: '👻', genre: 'Platformer', year: 1991,
      desc: 'John Romero\'s Dave in the Haunted Mansion',
      url: 'https://cdn.dos.zone/original/2X/6/6a2bfa87c031c2a11ab212758a5d914f7c112eeb.jsdos' },
    { name: 'Dangerous Dave\'s Risky Rescue', icon: '🏃', genre: 'Platformer', year: 1993,
      desc: 'The third Dangerous Dave outing',
      url: 'https://cdn.dos.zone/custom/dos/dangerous-daves-risky-rescue.jsdos' },
    { name: 'Captain Comic',       icon: '🦸', genre: 'Platformer',  year: 1988,
      desc: 'The Adventures of Captain Comic — early DOS platformer',
      url: 'https://cdn.dos.zone/custom/dos/adventures-of-captain-comic.jsdos' },
    { name: 'Electro Man',         icon: '⚡', genre: 'Platformer',  year: 1993,
      desc: 'xLand Polish shareware (a.k.a. Electro Body)',
      url: 'https://cdn.dos.zone/custom/dos/electroman.jsdos' },
    { name: 'Prehistorik',         icon: '🦴', genre: 'Platformer',  year: 1991,
      desc: 'Titus club-swinging caveman action',
      url: 'https://cdn.dos.zone/original/2X/7/73ff69232f4002228e74f73abb7e62299a2a8f3f.jsdos' },
    { name: 'Prehistorik 2',       icon: '🦕', genre: 'Platformer',  year: 1993,
      desc: 'More caveman platforming chaos',
      url: 'https://cdn.dos.zone/original/2X/f/f460331d06f443fc58ad21fc4824a74716270243.jsdos' },
    { name: 'Disney\'s Aladdin',   icon: '🧞', genre: 'Platformer',  year: 1994,
      desc: 'Virgin/Disney\'s cinematic platformer',
      url: 'https://cdn.dos.zone/original/2X/6/64ae157f1baa4317f626ccbc74364d9da87d5558.jsdos' },
    { name: 'The Lion King',       icon: '🦁', genre: 'Platformer',  year: 1994,
      desc: 'Virgin Interactive\'s movie tie-in',
      url: 'https://cdn.dos.zone/custom/dos/lion-king.jsdos' },

    // === Action / Action-Adventure ===
    { name: 'Prince of Persia',    icon: '🗡️', genre: 'Action',      year: 1989,
      desc: 'Jordan Mechner\'s cinematic platformer',
      url: 'https://cdn.dos.zone/original/2X/1/1179a7c9e05b1679333ed6db08e7884f6e86c155.jsdos' },
    { name: 'Prince of Persia 2',  icon: '🏺', genre: 'Action',      year: 1993,
      desc: 'The Shadow & The Flame',
      url: 'https://cdn.dos.zone/original/2X/9/9ce632235395211854a728cf49372bc12b66f628.jsdos' },
    { name: 'Out of This World',   icon: '🛸', genre: 'Action',      year: 1992,
      desc: 'Éric Chahi\'s rotoscoped sci-fi',
      url: 'https://cdn.dos.zone/original/2X/1/1031eb810e8b648fc5f777b3bd9cbc0187927fd4.jsdos' },
    { name: 'The Lost Vikings',    icon: '⚔️', genre: 'Action',      year: 1993,
      desc: 'Blizzard\'s three-viking puzzle-platformer',
      url: 'https://cdn.dos.zone/original/2X/1/1b063b2520052ebb504184667ac95e72423331de.jsdos' },
    { name: 'Beneath a Steel Sky', icon: '🌃', genre: 'Action',      year: 1994,
      desc: 'Revolution\'s dystopian point-and-click',
      url: 'https://cdn.dos.zone/original/2X/9/9392bef006fcb485bd851fe3859bbeec659bbcf0.jsdos' },
    { name: 'GTA (mobile build)',  icon: '🚗', genre: 'Action',      year: 1997,
      desc: 'Original Grand Theft Auto',
      url: 'https://cdn.dos.zone/custom/dos/gta-mobile.jsdos' },

    // === Adventure (Sierra / LucasArts / others) ===
    { name: 'King\'s Quest',       icon: '👑', genre: 'Adventure',   year: 1984,
      desc: 'Sierra\'s Quest for the Crown — AGI engine',
      url: 'https://cdn.dos.zone/custom/dos/kings-quest-quest-for-the-crown.jsdos' },
    { name: 'King\'s Quest II',    icon: '🏰', genre: 'Adventure',   year: 1985,
      desc: 'Romancing the Throne',
      url: 'https://cdn.dos.zone/custom/dos/kings-quest-ii-romancing-the-throne.jsdos' },
    { name: 'Space Quest I',       icon: '🧑‍🚀', genre: 'Adventure', year: 1986,
      desc: 'The Sarien Encounter — Roger Wilco\'s debut',
      url: 'https://cdn.dos.zone/custom/dos/sq1_rus.jsdos' },
    { name: 'Conquests of Camelot', icon: '⚔️', genre: 'Adventure', year: 1990,
      desc: 'Sierra Arthurian Quest for the Grail',
      url: 'https://cdn.dos.zone/custom/dos/conquests-of-camelot-the-search-for-the-grail.jsdos' },
    { name: 'Freddy Pharkas',      icon: '💊', genre: 'Adventure',   year: 1993,
      desc: 'Sierra\'s Frontier Pharmacist parody',
      url: 'https://cdn.dos.zone/custom/dos/freddy-pharkas-frontier-pharmacist.jsdos' },
    { name: 'Monkey Island (Special)', icon: '🐒', genre: 'Adventure', year: 1990,
      desc: 'LucasArts\' The Secret of Monkey Island',
      url: 'https://cdn.dos.zone/custom/dos/monkey-island-special.jsdos' },
    { name: 'Monkey Island 2',     icon: '🏴‍☠️', genre: 'Adventure', year: 1991,
      desc: 'LeChuck\'s Revenge — LucasArts SCUMM',
      url: 'https://cdn.dos.zone/custom/dos/monkey-island-2-lechucks-revenge.jsdos' },
    { name: 'Indiana Jones (Revenge of the Ancients)', icon: '🪖', genre: 'Adventure', year: 1987,
      desc: 'Mindscape Indy text/graphics adventure',
      url: 'https://cdn.dos.zone/custom/dos/indiana-jones-in-revenge-of-the-ancients.jsdos' },
    { name: 'Inca',                icon: '🌞', genre: 'Adventure',   year: 1992,
      desc: 'Coktel Vision Conquistador FMV adventure',
      url: 'https://cdn.dos.zone/custom/dos/inca.jsdos' },

    // === Text Adventure (Infocom & friends) ===
    { name: 'Zork I',              icon: '📜', genre: 'Text Adventure', year: 1980,
      desc: 'The Great Underground Empire',
      url: 'https://cdn.dos.zone/custom/dos/zork-the-great-underground-empire.jsdos' },
    { name: 'Zork II',             icon: '📜', genre: 'Text Adventure', year: 1981,
      desc: 'The Wizard of Frobozz',
      url: 'https://cdn.dos.zone/custom/dos/zork-ii-the-wizard-of-frobozz.jsdos' },
    { name: 'Zork III',            icon: '📜', genre: 'Text Adventure', year: 1982,
      desc: 'The Dungeon Master',
      url: 'https://cdn.dos.zone/custom/dos/zork-iii-the-dungeon-master.jsdos' },
    { name: 'Deadline',            icon: '🕵️', genre: 'Text Adventure', year: 1982,
      desc: 'Infocom\'s first murder mystery',
      url: 'https://cdn.dos.zone/custom/dos/deadline.jsdos' },
    { name: 'Infidel',             icon: '🏜️', genre: 'Text Adventure', year: 1983,
      desc: 'Infocom Egyptian tomb-robbing',
      url: 'https://cdn.dos.zone/custom/dos/infidel.jsdos' },
    { name: 'Planetfall',          icon: '👽', genre: 'Text Adventure', year: 1983,
      desc: 'Steve Meretzky\'s lonely-robot sci-fi',
      url: 'https://cdn.dos.zone/custom/dos/planetfall.jsdos' },
    { name: 'Hitchhiker\'s Guide', icon: '🛸', genre: 'Text Adventure', year: 1984,
      desc: 'Adams + Meretzky — Infocom\'s funniest',
      url: 'https://cdn.dos.zone/custom/dos/hitchhikers-guide-to-the-galaxy.jsdos' },
    { name: 'The Witness',         icon: '🔫', genre: 'Text Adventure', year: 1983,
      desc: 'Infocom 1930s noir mystery',
      url: 'https://cdn.dos.zone/custom/dos/witness.jsdos' },
    { name: 'Suspect',             icon: '🎭', genre: 'Text Adventure', year: 1984,
      desc: 'Infocom whodunit at a costume ball',
      url: 'https://cdn.dos.zone/custom/dos/suspect.jsdos' },
    { name: 'Wishbringer',         icon: '✨', genre: 'Text Adventure', year: 1985,
      desc: 'Infocom intro-level fantasy',
      url: 'https://cdn.dos.zone/custom/dos/wishbringer.jsdos' },
    { name: 'Spellbreaker',        icon: '🧙', genre: 'Text Adventure', year: 1985,
      desc: 'The final Enchanter trilogy chapter',
      url: 'https://cdn.dos.zone/custom/dos/spellbreaker.jsdos' },
    { name: 'Leather Goddesses',   icon: '💋', genre: 'Text Adventure', year: 1986,
      desc: 'Of Phobos — Infocom\'s "tame/lewd" comedy',
      url: 'https://cdn.dos.zone/custom/dos/leather-goddesses-of-phobos.jsdos' },
    { name: 'Moonmist',            icon: '🌙', genre: 'Text Adventure', year: 1986,
      desc: 'Infocom introductory-level mystery',
      url: 'https://cdn.dos.zone/custom/dos/moonmist.jsdos' },
    { name: 'Bureaucracy',         icon: '📋', genre: 'Text Adventure', year: 1987,
      desc: 'Douglas Adams + Infocom red-tape hell',
      url: 'https://cdn.dos.zone/custom/dos/bureaucracy.jsdos' },
    { name: 'The Lurking Horror',  icon: '👁️', genre: 'Text Adventure', year: 1987,
      desc: 'Infocom Lovecraftian campus horror',
      url: 'https://cdn.dos.zone/custom/dos/lurking-horror.jsdos' },

    // === RPG / Dungeon Crawler ===
    { name: 'Ultima IV',           icon: '⚔️', genre: 'RPG',         year: 1985,
      desc: 'Quest of the Avatar — Origin/Garriott',
      url: 'https://cdn.dos.zone/custom/dos/ultima-iv-quest-of-the-avatar.jsdos' },
    { name: 'Ultima V',            icon: '🐉', genre: 'RPG',         year: 1988,
      desc: 'Warriors of Destiny',
      url: 'https://cdn.dos.zone/custom/dos/ultima-v-warriors-of-destiny.jsdos' },
    { name: 'Ultima II',           icon: '🌌', genre: 'RPG',         year: 1982,
      desc: 'The Revenge of the Enchantress',
      url: 'https://cdn.dos.zone/custom/dos/ultima-ii-the-revenge-of-the-enchantress.jsdos' },
    { name: 'Ultima I-VI Series',  icon: '👑', genre: 'RPG',         year: 1981,
      desc: 'The first six Ultima games in one bundle',
      url: 'https://cdn.dos.zone/custom/dos/ultima-i-vi-series.jsdos' },
    { name: 'Ultima Underworld',   icon: '🕯️', genre: 'RPG',         year: 1992,
      desc: 'The Stygian Abyss — first 3D dungeon-crawler',
      url: 'https://cdn.dos.zone/custom/dos/ultima-underworld-the-stygian-abyss.jsdos' },
    { name: 'Ultima Underworld II', icon: '🌀', genre: 'RPG',        year: 1993,
      desc: 'Labyrinth of Worlds',
      url: 'https://cdn.dos.zone/custom/dos/ultima-underworld-ii-labyrinth-of-worlds.jsdos' },
    { name: 'Wizardry: Dark Savant', icon: '🪄', genre: 'RPG',       year: 1992,
      desc: 'Crusaders of the Dark Savant',
      url: 'https://cdn.dos.zone/custom/dos/wizardry-crusaders-of-the-dark-savant.jsdos' },
    { name: 'King\'s Bounty',      icon: '🛡️', genre: 'RPG',         year: 1990,
      desc: 'New World Computing — Heroes of M&M precursor',
      url: 'https://cdn.dos.zone/original/2X/5/52b821234ba1086ce2909fcd9e3ddf02ee93daa4.jsdos' },
    { name: 'The Bard\'s Tale II', icon: '🎵', genre: 'RPG',         year: 1986,
      desc: 'Interplay\'s Destiny Knight',
      url: 'https://cdn.dos.zone/custom/dos/bards-tale-ii-the-destiny-knight.jsdos' },

    // === Strategy ===
    { name: 'SimCity',             icon: '🏙️', genre: 'Strategy',    year: 1989,
      desc: 'The first city-builder',
      url: 'https://cdn.dos.zone/original/2X/7/744842062905f72648a4d492ccc2526d039b3702.jsdos' },
    { name: 'SimCity 2000',        icon: '🌆', genre: 'Strategy',    year: 1993,
      desc: 'Isometric Maxis sequel',
      url: 'https://cdn.dos.zone/original/2X/b/b1ed3b93829bdff0c9062c5642767825dd52baf1.jsdos' },
    { name: 'X-COM: UFO Defense',  icon: '🛸', genre: 'Strategy',    year: 1994,
      desc: 'Mythos/MicroProse alien turn-based tactics',
      url: 'https://cdn.dos.zone/original/2X/5/5a6be24397b9a95ce4447a3d4afd25029d49c50f.jsdos' },
    { name: 'Transport Tycoon Deluxe', icon: '🚂', genre: 'Strategy', year: 1995,
      desc: 'Chris Sawyer\'s logistics empire',
      url: 'https://cdn.dos.zone/original/2X/6/60b165c86771eadf24cb2f81aef4656b85d167a6.jsdos' },
    { name: 'Warcraft II',         icon: '⚔️', genre: 'Strategy',    year: 1995,
      desc: 'Tides of Darkness',
      url: 'https://cdn.dos.zone/custom/dos/war2.jsdos' },
    { name: 'Heroes of M&M II',    icon: '🐉', genre: 'Strategy',    year: 1996,
      desc: 'Heroes of Might and Magic II',
      url: 'https://cdn.dos.zone/custom/dos/homm_2.jsdos' },
    { name: 'Command & Conquer (GDI)', icon: '🪖', genre: 'Strategy', year: 1995,
      desc: 'Westwood RTS — GDI campaign',
      url: 'https://cdn.dos.zone/custom/dos/cc_gdi.jsdos' },
    { name: 'Command & Conquer (Nod)', icon: '☢️', genre: 'Strategy', year: 1995,
      desc: 'Westwood RTS — Brotherhood of Nod campaign',
      url: 'https://cdn.dos.zone/custom/dos/cc_nod.jsdos' },
    { name: 'Caesar',              icon: '🏛️', genre: 'Strategy',    year: 1992,
      desc: 'Impressions/Sierra Roman city-builder',
      url: 'https://cdn.dos.zone/custom/dos/caesar.jsdos' },
    { name: 'A-Train',             icon: '🚆', genre: 'Strategy',    year: 1992,
      desc: 'Maxis/Artdink railway tycoon',
      url: 'https://cdn.dos.zone/custom/dos/a-train.jsdos' },

    // === Puzzle / Roguelike ===
    { name: 'Tetris (1986)',       icon: '🟦', genre: 'Puzzle',      year: 1986,
      desc: 'Pajitnov\'s original — Spectrum HoloByte port',
      url: 'https://cdn.dos.zone/original/2X/3/37ce97891bc876adc2cbb7e44e4018c95644a19c.jsdos' },
    { name: 'Tetris Classic',      icon: '🧱', genre: 'Puzzle',      year: 1992,
      desc: 'Spectrum HoloByte\'s VGA Tetris',
      url: 'https://cdn.dos.zone/custom/dos/tetris-classic.jsdos' },
    { name: 'Lemmings',            icon: '🟢', genre: 'Puzzle',      year: 1991,
      desc: 'DMA Design\'s save-the-rodents puzzler',
      url: 'https://cdn.dos.zone/custom/dos/lemmings.jsdos' },
    { name: 'Oh No! More Lemmings', icon: '🟡', genre: 'Puzzle',     year: 1991,
      desc: '100 brand-new Lemmings levels',
      url: 'https://cdn.dos.zone/custom/dos/oh-no-more-lemmings.jsdos' },
    { name: 'Best of ZZT',         icon: '🅩', genre: 'Puzzle',      year: 1992,
      desc: 'Tim Sweeney\'s ZZT + classic Epic shareware worlds',
      url: 'https://cdn.dos.zone/custom/dos/best-of-zzt.jsdos' },
    { name: 'Paganitzu',           icon: '🐍', genre: 'Puzzle',      year: 1991,
      desc: 'Apogee Mayan-temple puzzler',
      url: 'https://cdn.dos.zone/custom/dos/paganitzu.jsdos' },
    { name: 'NetHack',             icon: '🗡️', genre: 'Puzzle',      year: 1992,
      desc: 'The seminal ASCII roguelike',
      url: 'https://cdn.dos.zone/custom/dos/nethack.jsdos' },
    { name: 'The Incredible Machine', icon: '⚙️', genre: 'Puzzle',  year: 1992,
      desc: 'Dynamix Rube Goldberg contraption puzzler',
      url: 'https://cdn.dos.zone/custom/dos/incredible-machine.jsdos' },
    { name: 'The Incredible Machine 2', icon: '🔧', genre: 'Puzzle', year: 1994,
      desc: 'Bigger gadgets, more contraptions',
      url: 'https://cdn.dos.zone/original/2X/f/fd74b5f9cdc413e64cbc6d4f20d86a8f726f4e17.jsdos' },
    { name: 'Supaplex',            icon: '🔵', genre: 'Puzzle',      year: 1991,
      desc: 'Boulder Dash-style microchip puzzler',
      url: 'https://cdn.dos.zone/original/2X/5/5f080ad8d3d06df0d4a5583a221e36dc79eeddd9.jsdos' },
    { name: 'Lode Runner',         icon: '🪜', genre: 'Puzzle',      year: 1983,
      desc: 'Brøderbund\'s ladder-climbing classic',
      url: 'https://cdn.dos.zone/custom/dos/lode-runner.jsdos' },
    { name: 'Xonix',               icon: '🟧', genre: 'Puzzle',      year: 1984,
      desc: 'Cut-the-screen arcade puzzler',
      url: 'https://cdn.dos.zone/original/2X/5/5231caa9905ebc9da73f6cc1676ea32ecc14060b.jsdos' },
    { name: 'Volfied',             icon: '🟨', genre: 'Puzzle',      year: 1991,
      desc: 'Taito\'s Qix-like territory-claim arcade',
      url: 'https://cdn.dos.zone/original/2X/9/9325b7ea382dbfe7ffbc84dc74fcd98888e6e6ab.jsdos' },
    { name: 'Color Lines',         icon: '🎨', genre: 'Puzzle',      year: 1992,
      desc: 'Russian classic five-in-a-row marble puzzler',
      url: 'https://cdn.dos.zone/original/2X/f/fce2566b9fd55f562dab5127a02804bc15697f53.jsdos' },

    // === Arcade / Shoot-em-up ===
    { name: 'Digger',              icon: '⛏️', genre: 'Arcade',      year: 1983,
      desc: 'Classic arcade dig-em-up',
      url: 'https://v8.js-dos.com/bundles/digger.jsdos' },
    { name: 'Pac-Man',             icon: '👻', genre: 'Arcade',      year: 1982,
      desc: 'Namco\'s arcade icon (DOS port)',
      url: 'https://cdn.dos.zone/original/2X/5/5cdcffbf268b3be0555025902b52a8d21ad595b9.jsdos' },
    { name: 'Arkanoid',            icon: '🟪', genre: 'Arcade',      year: 1988,
      desc: 'Taito\'s block-breaker',
      url: 'https://cdn.dos.zone/original/2X/3/3c2bda09093577bd865efb0b5b5b4fdc69051c54.jsdos' },
    { name: 'Bomberman',           icon: '💣', genre: 'Arcade',      year: 1992,
      desc: 'Hudson Soft\'s explosive maze classic',
      url: 'https://cdn.dos.zone/original/2X/3/320c1d875fba0f53476ae188195d2bec2cefdf8b.jsdos' },
    { name: 'Battle Chess',        icon: '♟️', genre: 'Arcade',      year: 1989,
      desc: 'Interplay\'s animated chess',
      url: 'https://cdn.dos.zone/custom/dos/battle-chess.jsdos' },
    { name: 'Epic Pinball',        icon: '🎱', genre: 'Arcade',      year: 1993,
      desc: 'Epic MegaGames shareware pinball',
      url: 'https://cdn.dos.zone/custom/dos/epic-pinball.jsdos' },
    { name: 'Tubular Worlds',      icon: '🌀', genre: 'Arcade',      year: 1994,
      desc: 'Apogee/CreaTech horizontal shmup',
      url: 'https://cdn.dos.zone/custom/dos/tubular-worlds.jsdos' },
    { name: 'Tyrian 2000',         icon: '🚀', genre: 'Arcade',      year: 1999,
      desc: 'Top-down space shmup',
      url: 'https://cdn.dos.zone/custom/dos/tyrian-2000.jsdos' },
    { name: 'Pitfall!',            icon: '🐊', genre: 'Arcade',      year: 1984,
      desc: 'Activision\'s jungle-vine classic',
      url: 'https://cdn.dos.zone/custom/dos/pitfall_.jsdos' },
    { name: 'Golden Axe',          icon: '🪓', genre: 'Arcade',      year: 1990,
      desc: 'Sega beat-\'em-up — DOS port',
      url: 'https://cdn.dos.zone/original/2X/a/ad3686df58a0bac357d3bb81b3f2536205e9ad76.jsdos' },
    { name: 'Earthworm Jim',       icon: '🪱', genre: 'Arcade',      year: 1995,
      desc: 'Shiny Entertainment\'s wormy hero',
      url: 'https://cdn.dos.zone/original/2X/a/aad1d125300d7d93bc28058fa4d0247a7142510e.jsdos' },
    { name: 'Rampart',             icon: '🏰', genre: 'Arcade',      year: 1992,
      desc: 'Atari castle-siege arcade port',
      url: 'https://cdn.dos.zone/original/2X/2/238b19a1c478435d83e017e03c17e53a1cf56d0e.jsdos' },
    { name: 'Toppler',             icon: '🗼', genre: 'Arcade',      year: 1990,
      desc: 'Climb the rotating tower',
      url: 'https://cdn.dos.zone/original/2X/4/4426757ae08c0e7f21193d04a2ad0982e83c3dbf.jsdos' },
    { name: 'CD-Man',              icon: '🟡', genre: 'Arcade',      year: 1989,
      desc: 'Creative Dimensions Pac-Man clone v2.0',
      url: 'https://cdn.dos.zone/original/2X/3/3d082ee2ea19b168cb93244fc0e771e12af585f3.jsdos' },
    { name: 'Arcade Volleyball',   icon: '🏐', genre: 'Arcade',      year: 1987,
      desc: 'Zorlim\'s ATARI Volleyball-style classic',
      url: 'https://cdn.dos.zone/custom/dos/zorlims-arcade-volleyball.jsdos' },

    // === Fighting ===
    { name: 'Mortal Kombat',       icon: '🥊', genre: 'Fighting',    year: 1993,
      desc: 'Midway\'s arcade fighter — DOS port',
      url: 'https://cdn.dos.zone/original/2X/8/872f3668c36085d0b1ace46872145285364ee628.jsdos' },

    // === Racing / Driving ===
    { name: 'Test Drive',          icon: '🏎️', genre: 'Racing',      year: 1987,
      desc: 'Accolade supercar driving sim',
      url: 'https://cdn.dos.zone/custom/dos/test-drive.jsdos' },
    { name: 'The Need for Speed',  icon: '🚗', genre: 'Racing',      year: 1995,
      desc: 'EA/Pioneer Productions\' racer',
      url: 'https://cdn.dos.zone/custom/dos/nfs.jsdos' },
    { name: 'Indianapolis 500',    icon: '🏁', genre: 'Racing',      year: 1989,
      desc: 'EA / Papyrus pioneering IndyCar sim',
      url: 'https://cdn.dos.zone/original/2X/4/48ab323233babd8c55352031214c06265da2aea0.jsdos' },
    { name: 'Death Rally',         icon: '💀', genre: 'Racing',      year: 1996,
      desc: 'Apogee/Remedy combat racing',
      url: 'https://cdn.dos.zone/custom/dos/death-rally.jsdos' },

    // === Simulation ===
    { name: 'Microsoft Flight Sim 3', icon: '✈️', genre: 'Simulation', year: 1988,
      desc: 'Microsoft Flight Simulator v3.0',
      url: 'https://cdn.dos.zone/custom/dos/microsoft-flight-simulator-v30.jsdos' },
    { name: 'Comanche CD',         icon: '🚁', genre: 'Simulation',  year: 1994,
      desc: 'NovaLogic voxel-engine helicopter sim',
      url: 'https://cdn.dos.zone/custom/dos/comanche-cd.jsdos' },
    { name: 'Silent Service',      icon: '🚢', genre: 'Simulation',  year: 1985,
      desc: 'MicroProse WWII submarine sim',
      url: 'https://cdn.dos.zone/custom/dos/silent-service.jsdos' },
    { name: 'F-15 Strike Eagle II', icon: '✈️', genre: 'Simulation', year: 1989,
      desc: 'MicroProse fighter jet sim',
      url: 'https://cdn.dos.zone/custom/dos/f-15-strike-eagle-ii.jsdos' },

    // === Educational ===
    { name: 'Oregon Trail Deluxe', icon: '🐎', genre: 'Educational', year: 1992,
      desc: 'MECC\'s wagon-pioneer classic',
      url: 'https://cdn.dos.zone/original/2X/5/53e616496b4da1d95136e235ad90c9cc3f3f760d.jsdos' },
    { name: 'Math Rescue',         icon: '➗', genre: 'Educational', year: 1992,
      desc: 'Apogee math edutainment (shareware)',
      url: 'https://cdn.dos.zone/custom/dos/math-rescue.jsdos' },
    { name: 'Math Blaster Plus!',  icon: '🧮', genre: 'Educational', year: 1987,
      desc: 'Davidson & Associates math drill classic',
      url: 'https://cdn.dos.zone/custom/dos/math-blaster-plus.jsdos' },
    { name: 'Reader Rabbit 3',     icon: '🐰', genre: 'Educational', year: 1993,
      desc: 'The Learning Company reading edutainment',
      url: 'https://cdn.dos.zone/custom/dos/reader-rabbit-3.jsdos' },

    // === Tools / Software ===
    { name: 'MS Windows 3.0',      icon: '🪟', genre: 'Tools',       year: 1990,
      desc: 'Microsoft Windows 3.0 + bundled mini-games',
      url: 'https://cdn.dos.zone/custom/dos/microsoft-windows-version-30-included-games.jsdos' },
    { name: 'QBasic 4.5',          icon: '⌨️', genre: 'Tools',       year: 1988,
      desc: 'Microsoft QuickBASIC 4.5',
      url: 'https://cdn.dos.zone/custom/dos/QB45.jsdos' },
    { name: 'Dhrystone Bench',     icon: '📊', genre: 'Tools',       year: 1988,
      desc: 'Dhrystone 2.1 CPU benchmark',
      url: 'https://v8.js-dos.com/bundles/dhry2.jsdos' },
];

const GENRE_ORDER = [
    'Shooter',
    'Platformer',
    'Action',
    'Adventure',
    'Text Adventure',
    'RPG',
    'Strategy',
    'Puzzle',
    'Arcade',
    'Fighting',
    'Racing',
    'Simulation',
    'Educational',
    'Tools',
];

class DOSBox extends AppBase {
    constructor() {
        super({
            id: 'dosbox',
            name: 'DOSBox',
            icon: '💾',
            width: 760,
            height: 600,
            minWidth: 520,
            minHeight: 420,
            resizable: true,
            singleton: true,
            category: 'games'
        });

        this.dosProps = null;            // The DosProps object returned by Dos()
        this.dosRoot = null;             // The fresh <div> we mounted into
        this.isRunning = false;
        this.isReady = false;            // True once js-dos posts 'ci-ready'
        this.currentBundle = null;
        this.currentBundleName = null;
        this.activeBlobUrl = null;       // For local-file loads — revoke when done
        this._jsdosLoadPromise = null;   // Module-level: only fetch CDN once per session
        this._readyWatchdog = null;      // Timer that warns if ci-ready never fires
        this._resizePumpTimers = [];     // Timers that nudge js-dos to re-measure the canvas
        this._canvasHealthTimers = [];   // Timers that force-show the canvas if it stayed 0x0

        this.registerCommands();
        this.registerQueries();
    }

    // ── Scripting ──────────────────────────────────────────────

    registerCommands() {
        this.registerCommand('run', (payload) => {
            const url = typeof payload === 'string' ? payload : payload?.url;
            if (!url) return { success: false, error: 'Bundle URL required' };
            this.loadBundle(url);
            return { success: true, url };
        });

        this.registerCommand('stop', async () => {
            await this.stopEmulator();
            return { success: true };
        });

        this.registerCommand('reset', async () => {
            const url = this.currentBundle;
            await this.stopEmulator();
            if (url) this.loadBundle(url);
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

        this.registerCommand('pause', () => {
            if (this.dosProps?.setPaused) this.dosProps.setPaused(true);
            return { success: true };
        });

        this.registerCommand('resume', () => {
            if (this.dosProps?.setPaused) this.dosProps.setPaused(false);
            return { success: true };
        });

        this.registerCommand('save', async () => {
            if (this.dosProps?.save) {
                const ok = await this.dosProps.save();
                return { success: !!ok };
            }
            return { success: false, error: 'No active emulator' };
        });
    }

    registerQueries() {
        this.registerQuery('getState', () => ({
            isRunning: this.isRunning,
            isReady: this.isReady,
            currentBundle: this.currentBundle,
            currentBundleName: this.currentBundleName
        }));

        this.registerQuery('getLibrary', () =>
            GAME_LIBRARY.map(g => ({ name: g.name, url: g.url, desc: g.desc, icon: g.icon }))
        );

        this.registerQuery('getVersion', () => {
            if (this.dosProps?.getVersion) {
                const [jsdos, emu] = this.dosProps.getVersion();
                return { jsdos, emulator: emu };
            }
            return { jsdos: null, emulator: null };
        });
    }

    // ── Lifecycle ──────────────────────────────────────────────

    onOpen() {
        // Build a <select> grouped by genre.
        const byGenre = new Map();
        for (const game of GAME_LIBRARY) {
            if (!byGenre.has(game.genre)) byGenre.set(game.genre, []);
            byGenre.get(game.genre).push(game);
        }
        const orderedGenres = [
            ...GENRE_ORDER.filter(g => byGenre.has(g)),
            ...[...byGenre.keys()].filter(g => !GENRE_ORDER.includes(g))
        ];
        const dropdownOptions = orderedGenres.map(genre => {
            const items = byGenre.get(genre).map(game => {
                const label = `${game.icon} ${game.name} (${game.year}) — ${game.desc}`;
                return `<option value="${escapeHtml(game.url)}">${escapeHtml(label)}</option>`;
            }).join('');
            return `<optgroup label="${escapeHtml(genre)}">${items}</optgroup>`;
        }).join('');

        // Featured row — three highlight buttons for the most popular titles.
        const featured = ['DOOM', 'Prince of Persia', 'SimCity']
            .map(n => GAME_LIBRARY.find(g => g.name === n))
            .filter(Boolean);
        const featuredHtml = featured.map(game => `
            <button class="dosbox-featured-item" data-url="${escapeHtml(game.url)}"
                    title="${escapeHtml(game.desc)}">
                <span class="dosbox-featured-icon">${game.icon}</span>
                <span class="dosbox-featured-name">${escapeHtml(game.name)}</span>
            </button>
        `).join('');

        return `
            <div class="dosbox-app">
                <div class="dosbox-toolbar">
                    <div class="dosbox-url-bar">
                        <label class="dosbox-url-label">Game:</label>
                        <select class="dosbox-game-select" id="dosboxGameSelect" title="Pick a game">
                            <option value="">— Pick a game —</option>
                            ${dropdownOptions}
                        </select>
                    </div>
                    <div class="dosbox-toolbar-buttons">
                        <button class="dosbox-btn" id="dosboxStopBtn" title="Stop emulator" disabled>⏹ Stop</button>
                        <button class="dosbox-btn" id="dosboxResetBtn" title="Reload current bundle" disabled>🔄 Reset</button>
                        <button class="dosbox-btn" id="dosboxFsBtn" title="Toggle fullscreen">⛶ Fullscreen</button>
                    </div>
                </div>
                <div class="dosbox-toolbar dosbox-toolbar-sub">
                    <div class="dosbox-url-bar">
                        <label class="dosbox-url-label">URL:</label>
                        <input type="text" class="dosbox-url-input" id="dosboxUrlInput"
                               placeholder="https://cdn.dos.zone/custom/dos/your-game.jsdos" spellcheck="false" />
                        <button class="dosbox-btn" id="dosboxRunBtn" title="Load & run this URL">▶ Run URL</button>
                        <button class="dosbox-btn" id="dosboxFileBtn" title="Open a local .jsdos file">📂 File…</button>
                        <input type="file" id="dosboxFileInput" accept=".jsdos,application/zip" style="display:none;" />
                    </div>
                </div>
                <div class="dosbox-library" id="dosboxLibrary">
                    <span class="dosbox-library-label">Featured:</span>
                    ${featuredHtml}
                    <span class="dosbox-library-spacer"></span>
                    <a class="dosbox-library-link" href="https://dos.zone/" target="_blank" rel="noopener"
                       title="Browse 1900+ DOS games on DOS.Zone (opens a new tab)">🌐 Browse more on dos.zone</a>
                </div>
                <div class="dosbox-emulator-area" id="dosboxEmulatorArea">
                    <div class="dosbox-splash" id="dosboxSplash">
                        <div class="dosbox-splash-icon">💾</div>
                        <div class="dosbox-splash-title">DOSBox Emulator</div>
                        <div class="dosbox-splash-sub">
                            Pick a title from the <b>Game</b> dropdown, paste a <code>.jsdos</code> bundle URL,<br>
                            or click <b>File…</b> to load a bundle from disk.
                        </div>
                        <div class="dosbox-splash-hint">
                            Browse 1900+ games at <b>dos.zone</b> — copy any game's bundle URL and paste it above.<br>
                            <span style="opacity:.7;">dos.zone bundles are streamed through the local PHP proxy (<code>api/dosbox-proxy.php</code>) to bypass CORS.</span><br>
                            <span style="opacity:.7;">Powered by <b>js-dos v8</b> — DOSBox in WebAssembly.</span>
                        </div>
                    </div>
                    <div class="dosbox-stage" id="dosboxStage" style="display:none;"></div>
                    <div class="dosbox-loading" id="dosboxLoading" style="display:none;">
                        <div class="dosbox-loading-spinner"></div>
                        <div class="dosbox-loading-text" id="dosboxLoadingText">Loading DOSBox…</div>
                    </div>
                </div>
                <div class="dosbox-status" id="dosboxStatus">Ready</div>
            </div>
        `;
    }

    onMount() {
        const gameSelect = this.getElement('#dosboxGameSelect');
        const urlInput = this.getElement('#dosboxUrlInput');
        const runBtn = this.getElement('#dosboxRunBtn');
        const fileBtn = this.getElement('#dosboxFileBtn');
        const fileInput = this.getElement('#dosboxFileInput');
        const stopBtn = this.getElement('#dosboxStopBtn');
        const resetBtn = this.getElement('#dosboxResetBtn');
        const fsBtn = this.getElement('#dosboxFsBtn');

        this.addHandler(gameSelect, 'change', (e) => {
            const url = e.target.value;
            if (!url) return;
            if (urlInput) urlInput.value = url;
            this.loadBundle(url);
        });

        this.addHandler(runBtn, 'click', () => {
            const url = urlInput?.value?.trim();
            if (url) this.loadBundle(url);
        });

        this.addHandler(urlInput, 'keydown', (e) => {
            if (e.key === 'Enter') {
                const url = urlInput.value.trim();
                if (url) this.loadBundle(url);
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
            const url = this.currentBundle;
            this.stopEmulator().then(() => { if (url) this.loadBundle(url); });
        });
        this.addHandler(fsBtn, 'click', () => this.toggleFullscreen());

        // Featured row buttons
        this.getElements('.dosbox-featured-item').forEach(btn => {
            this.addHandler(btn, 'click', () => {
                const url = btn.dataset.url;
                if (urlInput) urlInput.value = url;
                if (gameSelect) gameSelect.value = url;
                this.loadBundle(url);
            });
        });

        // Start prefetching the js-dos script in the background — first launch is faster.
        this.ensureJsDosLoaded().catch((err) => {
            console.warn('[DOSBox] Background js-dos preload failed:', err);
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
        // js-dos uses ResizeObserver internally — no action needed.
    }

    // ── CDN Loader ─────────────────────────────────────────────

    /**
     * Load js-dos CSS and JS from CDN (once per session, idempotent).
     * The returned promise is cached so concurrent callers share it.
     * @returns {Promise<void>}
     */
    ensureJsDosLoaded() {
        if (typeof window.Dos === 'function') return Promise.resolve();
        if (this._jsdosLoadPromise) return this._jsdosLoadPromise;

        this.setStatus('Loading js-dos engine from CDN…');

        this._jsdosLoadPromise = new Promise((resolve, reject) => {
            // CSS (no need to await — it's not gating)
            if (!document.querySelector('link[data-jsdos="1"]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = JSDOS_CSS_URL;
                link.dataset.jsdos = '1';
                document.head.appendChild(link);
            }

            // Script — if already in DOM, wait for the global
            const existing = document.querySelector('script[data-jsdos="1"]');
            const waitForGlobal = (timeoutMs) => {
                const start = Date.now();
                const tick = () => {
                    if (typeof window.Dos === 'function') {
                        resolve();
                    } else if (Date.now() - start > timeoutMs) {
                        reject(new Error('js-dos loaded but window.Dos never appeared'));
                    } else {
                        setTimeout(tick, 50);
                    }
                };
                tick();
            };

            if (existing) {
                waitForGlobal(15000);
                return;
            }

            const script = document.createElement('script');
            script.src = JSDOS_JS_URL;
            script.async = true;
            script.dataset.jsdos = '1';
            script.onload = () => waitForGlobal(15000);
            script.onerror = () => {
                reject(new Error('Failed to fetch js-dos from CDN (' + JSDOS_JS_URL + ')'));
            };
            document.head.appendChild(script);
        });

        // ANY rejection (CDN fetch failure or the waitForGlobal timeout)
        // must clear the cache — caching a rejected promise made every
        // later launch fail instantly for the rest of the session.
        this._jsdosLoadPromise = this._jsdosLoadPromise.catch((err) => {
            this._jsdosLoadPromise = null;
            throw err;
        });

        return this._jsdosLoadPromise;
    }

    // ── Core Methods ──────────────────────────────────────────

    /**
     * Load and run a .jsdos bundle from a URL.
     * @param {string} url - URL to a .jsdos bundle file
     */
    async loadBundle(url) {
        if (!url) return;
        await this._startEmulatorWith({ url, displayName: this.getBundleName(url) });
    }

    /**
     * Load a local .jsdos file via Blob URL — avoids CORS entirely.
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
     * Internal: stop any running instance, then start a fresh one with the given URL.
     * @private
     */
    async _startEmulatorWith({ url, displayName }) {
        const stage = this.getElement('#dosboxStage');
        const splash = this.getElement('#dosboxSplash');
        const loading = this.getElement('#dosboxLoading');
        const loadingText = this.getElement('#dosboxLoadingText');

        if (!stage) return;

        // Tear down any previous instance fully (workers, audio, store).
        await this.stopEmulator(/* keepSplash= */ false);
        this.playSound('floppy');

        // Claim a launch token AFTER the teardown above (stopEmulator bumps
        // the generation). If another launch or a stop/close happens while
        // we're awaiting below, the token goes stale and we abort — the old
        // code booted a full DOSBox (CPU + audio) into a detached div when
        // the window closed mid-load, with no way to stop it.
        const generation = this._launchGeneration;
        const launchStale = () =>
            generation !== this._launchGeneration || !this.getElement('#dosboxStage');

        // Show loading overlay.
        if (splash) splash.style.display = 'none';
        if (stage) stage.style.display = 'block';
        if (loading) loading.style.display = 'flex';
        if (loadingText) loadingText.textContent = 'Loading js-dos engine…';

        try {
            await this.ensureJsDosLoaded();
            if (launchStale()) return;

            if (loadingText) loadingText.textContent = 'Fetching bundle…';

            // Create a fresh root div for js-dos to render into. Re-using an
            // element across Dos() calls is unreliable — Preact may try to
            // reconcile against state that no longer exists.
            stage.innerHTML = '';
            const root = document.createElement('div');
            root.className = 'dosbox-root';
            stage.appendChild(root);
            this.dosRoot = root;

            // Let the browser compute layout so the container has dimensions
            // before js-dos creates its canvas/WebGL context.
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            if (launchStale()) return;

            this.currentBundle = url;
            this.currentBundleName = displayName;
            this.isRunning = true;
            this.isReady = false;
            this.updateButtons(true);
            this.setStatus('Starting: ' + displayName);

            // Some CDNs don't set Access-Control-Allow-Origin for third-party
            // embedders. Route those through our PHP proxy; pass everything
            // else (v8.js-dos.com, same-origin, blob/data/file) straight to
            // js-dos.
            const fetchUrl = this.getLoadUrl(url);
            if (fetchUrl !== url) {
                console.log('[DOSBox] Routing bundle through proxy:', url, '→', fetchUrl);
            }

            // js-dos defaults to worker-thread + offscreenCanvas, which needs
            // SharedArrayBuffer, which needs the page served with COOP/COEP
            // headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-
            // Origin-Embedder-Policy: require-corp`). Most IlluminatOS
            // deployments are served by a plain HTTP server with no such
            // headers, so the worker hangs after boot and ci-ready never
            // fires (the "Booting -> black screen" symptom). Detect cross-
            // origin isolation and pick the safe mode.
            const canUseWorker = (typeof self !== 'undefined') &&
                self.crossOriginIsolated === true &&
                typeof SharedArrayBuffer !== 'undefined';

            if (!canUseWorker) {
                console.warn(
                    '[DOSBox] crossOriginIsolated=false — running js-dos on the main thread. ' +
                    'For better performance, serve IlluminatOS with these response headers:\n' +
                    '  Cross-Origin-Opener-Policy: same-origin\n' +
                    '  Cross-Origin-Embedder-Policy: require-corp'
                );
            }

            // Set up a watchdog: if ci-ready doesn't fire in 45s, surface
            // a diagnostic in the status bar so the user isn't stuck on
            // a silent "Booting...".
            if (this._readyWatchdog) clearTimeout(this._readyWatchdog);
            this._readyWatchdog = setTimeout(() => {
                if (this.isRunning && !this.isReady) {
                    console.warn('[DOSBox] Emulator did not reach ci-ready in 45s — likely stuck in WASM boot.');
                    this.setStatus(
                        'Stuck booting — check the browser console. ' +
                        (canUseWorker ? '' : 'Consider serving with COOP/COEP headers.')
                    );
                }
            }, 45000);

            this.dosProps = window.Dos(root, {
                url: fetchUrl,
                pathPrefix: EMULATORS_PATH_PREFIX,
                backend: 'dosbox',
                autoStart: true,
                fastForwardOnBoot: 5,
                imageRendering: 'pixelated',
                workerThread: canUseWorker,
                offscreenCanvas: canUseWorker,
                // Force the Canvas 2D backend. WebGL works on dos.zone but
                // can silently render to a 0x0 framebuffer when the canvas's
                // parent is briefly 0-sized at init time inside our Win95
                // window flex chain — symptom: emulator runs (audio works)
                // but the screen is solid black. Canvas 2D is slower but
                // resizes correctly via ResizeObserver in every browser.
                renderBackend: 'canvas',
                // Fit fills the available area instead of letterboxing the
                // game inside a black 4:3 box. js-dos's resizeCanvas() bails
                // out early when frameHeight is 0; Fit + the resize-pump
                // below guarantees the canvas reaches a sane size.
                renderAspect: 'Fit',
                // Shrink the sidebar so the game gets most of the window.
                thinSidebar: true,
                onEvent: (event, arg) => {
                    console.log('[DOSBox] js-dos event:', event, arg);
                    this._handleJsDosEvent(event, arg);
                }
            });

            // The js-dos UI shows cloud buttons by default — hide them since
            // we don't ship cloud accounts. Set via the props method (the
            // option key `noCloud` doesn't exist in v8).
            if (typeof this.dosProps.setNoCloud === 'function') {
                this.dosProps.setNoCloud(true);
            }

            // Hide loading overlay; js-dos draws its own splash now.
            if (loading) loading.style.display = 'none';

            // Resize pump. js-dos's renderer measures
            // `canvas.parentElement.getBoundingClientRect()` once at setup
            // and again only when a ResizeObserver fires. If our flex chain
            // is briefly 0-sized at that moment, the canvas gets style.width
            // = 0px and stays invisible. Firing window resize events at
            // several intervals wakes up the observers so the canvas gets a
            // real size before/just-after the first frame arrives.
            if (this._resizePumpTimers) {
                this._resizePumpTimers.forEach(clearTimeout);
            }
            this._resizePumpTimers = [50, 200, 500, 1500, 3000, 6000].map(ms =>
                setTimeout(() => {
                    if (!this.isRunning) return;
                    window.dispatchEvent(new Event('resize'));
                    const r = root.getBoundingClientRect();
                    const c = root.querySelector('canvas');
                    if (!c) {
                        console.log(`[DOSBox] @${ms}ms root: ${r.width.toFixed(0)}x${r.height.toFixed(0)} (no canvas yet)`);
                        return;
                    }
                    const cRect = c.getBoundingClientRect();
                    const pRect = c.parentElement ? c.parentElement.getBoundingClientRect() : null;
                    console.log(
                        `[DOSBox] @${ms}ms root: ${r.width.toFixed(0)}x${r.height.toFixed(0)}, ` +
                        `canvas attr: ${c.width}x${c.height}, ` +
                        `canvas rect: ${cRect.width.toFixed(0)}x${cRect.height.toFixed(0)}, ` +
                        `canvas parent: ${pRect ? pRect.width.toFixed(0) + 'x' + pRect.height.toFixed(0) : 'none'}, ` +
                        `inline: ${c.getAttribute('style') || '(none)'}`
                    );
                }, ms)
            );

            // Canvas health checks. The collapse is usually a parent of
            // the canvas (one of js-dos's internal divs computes to 0px
            // height in our flex chain). Each check walks the parent
            // chain and force-stamps every collapsed link to fill the
            // root box. Schedule several so transient races are caught.
            this._canvasHealthTimers = [500, 1500, 3500, 7000, 12000].map(ms =>
                setTimeout(() => this._healCanvas(root, ms), ms)
            );

            this.emitAppEvent('started', { url, name: displayName, workerThread: canUseWorker });
        } catch (err) {
            console.error('[DOSBox] Failed to load bundle:', err);
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
     * Handle js-dos lifecycle events. js-dos posts "emu-ready" when the
     * emulator is configured, "ci-ready" when the command interface is
     * available (game is interactable), and "fullscreen-change" on entry/exit.
     * @private
     */
    _handleJsDosEvent(event, arg) {
        switch (event) {
            case 'emu-ready':
                this.setStatus('Booting: ' + this.currentBundleName);
                this.emitAppEvent('booting', { name: this.currentBundleName });
                break;
            case 'ci-ready':
                this.isReady = true;
                if (this._readyWatchdog) {
                    clearTimeout(this._readyWatchdog);
                    this._readyWatchdog = null;
                }
                this.setStatus('Running: ' + this.currentBundleName);
                this.emitAppEvent('ready', { name: this.currentBundleName });
                break;
            case 'fullscreen-change':
                this.emitAppEvent('fullscreen', { active: !!arg });
                break;
            case 'open-key':
                // js-dos may emit this when the user needs to enter a key.
                break;
            case 'bnd-play':
                this.emitAppEvent('play', { name: this.currentBundleName });
                break;
            default:
                break;
        }
    }

    /**
     * Stop the running emulator and fully tear down workers, audio, and DOM.
     * @param {boolean} [keepSplash=true] - If false, caller will swap content immediately.
     */
    async stopEmulator(keepSplash = true) {
        // Invalidate any in-flight launch: _startEmulatorWith checks this
        // token after each await, so a stop (or a newer launch, which stops
        // first) cancels the pending boot instead of letting it bring up a
        // zombie DOSBox in a detached subtree.
        this._launchGeneration = (this._launchGeneration || 0) + 1;

        const stage = this.getElement('#dosboxStage');
        const splash = this.getElement('#dosboxSplash');

        if (this._readyWatchdog) {
            clearTimeout(this._readyWatchdog);
            this._readyWatchdog = null;
        }

        if (this._resizePumpTimers && this._resizePumpTimers.length) {
            this._resizePumpTimers.forEach(clearTimeout);
            this._resizePumpTimers = [];
        }

        if (this._canvasHealthTimers && this._canvasHealthTimers.length) {
            this._canvasHealthTimers.forEach(clearTimeout);
            this._canvasHealthTimers = [];
        }

        if (this.dosProps) {
            try {
                // props.stop() hides UI and calls ci.exit() which terminates
                // the worker; it's safe to call even if the emulator never
                // reached "ci-ready".
                if (typeof this.dosProps.stop === 'function') {
                    await this.dosProps.stop();
                }
            } catch (e) {
                console.warn('[DOSBox] Error during props.stop():', e);
            }
            this.dosProps = null;
        }

        // Drop the entire DOM subtree so workers/canvases get GC'd.
        if (stage) stage.innerHTML = '';
        this.dosRoot = null;

        // Revoke any blob URL we created for a local file.
        if (this.activeBlobUrl && this.currentBundle === this.activeBlobUrl) {
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
        if (this.dosProps?.setFullScreen) {
            const next = typeof want === 'boolean'
                ? want
                : !document.fullscreenElement;
            try {
                this.dosProps.setFullScreen(next);
                return;
            } catch (e) {
                console.warn('[DOSBox] setFullScreen failed, falling back to DOM API:', e);
            }
        }

        const stage = this.getElement('#dosboxEmulatorArea');
        if (!stage) return;

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else {
            stage.requestFullscreen().catch(err => {
                console.warn('[DOSBox] Fullscreen error:', err);
            });
        }
    }

    /**
     * Set audio volume (0-1).
     * @param {number} volume
     */
    setVolume(volume) {
        const v = Math.max(0, Math.min(1, Number(volume) || 0));
        if (this.dosProps?.setVolume) {
            this.dosProps.setVolume(v);
        }
    }

    // ── Helpers ────────────────────────────────────────────────

    setStatus(text) {
        const el = this.getElement('#dosboxStatus');
        if (el) el.textContent = text;
    }

    updateButtons(running) {
        const stopBtn = this.getElement('#dosboxStopBtn');
        const resetBtn = this.getElement('#dosboxResetBtn');
        if (stopBtn) stopBtn.disabled = !running;
        if (resetBtn) resetBtn.disabled = !running;
    }

    getBundleName(url) {
        if (!url) return 'unknown';
        const lib = GAME_LIBRARY.find(g => g.url === url);
        if (lib) return lib.name;
        if (url.startsWith('blob:')) return 'local file';
        try {
            const parts = new URL(url).pathname.split('/');
            return parts[parts.length - 1] || url;
        } catch {
            return url;
        }
    }

    /**
     * Canvas health check / diagnostic.
     *
     * Logs the parent chain so future regressions are one-screenshot
     * diagnosable. If the canvas's parent is still 0x0 (the CSS reset
     * for .dosbox-root .window in styles/apps/dosbox.css should prevent
     * this), it nudges js-dos's renderer with a resize event.
     *
     * @private
     * @param {HTMLElement} root - The .dosbox-root element
     * @param {number} elapsedMs - For logging
     */
    _healCanvas(root, elapsedMs) {
        if (!this.isRunning || !root || !root.isConnected) return;
        const canvas = root.querySelector('canvas');
        if (!canvas) {
            console.log(`[DOSBox] healCanvas @${elapsedMs}ms — no canvas in DOM yet`);
            return;
        }

        const cRect = canvas.getBoundingClientRect();
        const parent = canvas.parentElement;
        const pRect = parent ? parent.getBoundingClientRect() : null;

        this._logParentChain(canvas, root, elapsedMs);

        if (cRect.width >= 16 && cRect.height >= 16) {
            console.log(`[DOSBox] healCanvas @${elapsedMs}ms — canvas OK at ${cRect.width.toFixed(0)}x${cRect.height.toFixed(0)}`);
            return;
        }

        console.warn(
            `[DOSBox] healCanvas @${elapsedMs}ms — canvas ${cRect.width.toFixed(0)}x${cRect.height.toFixed(0)} ` +
            `inside parent ${pRect ? pRect.width.toFixed(0) + 'x' + pRect.height.toFixed(0) : 'unknown'}. ` +
            `Nudging js-dos with a resize event.`
        );
        window.dispatchEvent(new Event('resize'));
    }

    /**
     * Walk from the canvas up to the .dosbox-root and log each element's
     * tag, class, and rendered size. The collapsed link in the chain is
     * the first ancestor whose getBoundingClientRect is 0x0.
     * @private
     */
    _logParentChain(canvas, root, elapsedMs) {
        const lines = [];
        let el = canvas;
        let depth = 0;
        while (el && depth < 20) {
            const r = el.getBoundingClientRect();
            const tag = el.tagName.toLowerCase();
            const cls = (el.className && typeof el.className === 'string')
                ? el.className.replace(/\s+/g, ' ').trim().substring(0, 80)
                : '';
            const id = el.id ? `#${el.id}` : '';
            lines.push(`    [${depth}] <${tag}${id}> .${cls || '(none)'} → ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
            if (el === root) break;
            el = el.parentElement;
            depth++;
        }
        console.log(`[DOSBox] parent chain @${elapsedMs}ms:\n${lines.join('\n')}`);
    }

    /**
     * Resolve a user-facing bundle URL into the URL js-dos should actually
     * fetch. Hosts that don't send `Access-Control-Allow-Origin` to third-
     * party origins (the entire cdn.dos.zone family) are routed through the
     * IlluminatOS PHP proxy. Hosts that do send CORS (v8.js-dos.com), same-
     * origin URLs, and local schemes (blob:, data:, file:) are passed
     * through unchanged.
     *
     * Deployments can override the proxy URL by setting
     *   window.__DOSBOX_PROXY_URL = 'https://example.com/proxy.php';
     * before the DOSBox app launches.
     *
     * @param {string} originalUrl
     * @returns {string} URL to pass to Dos({ url })
     */
    getLoadUrl(originalUrl) {
        if (!originalUrl) return originalUrl;
        try {
            const u = new URL(originalUrl, document.baseURI);
            const host = u.hostname.toLowerCase();

            // Local / already-resolved schemes — never proxy
            if (u.protocol === 'blob:' || u.protocol === 'data:' || u.protocol === 'file:') {
                return originalUrl;
            }
            // Same-origin — no CORS issue
            if (host === location.hostname.toLowerCase()) {
                return originalUrl;
            }
            // CORS-friendly upstream — fetch directly
            if (CORS_FRIENDLY_HOSTS.has(host)) {
                return originalUrl;
            }
            // CORS-blocked upstream — route through the IlluminatOS proxy
            if (NEEDS_PROXY_HOSTS.has(host) || host.endsWith('.dos.zone')) {
                const customProxy = (typeof window !== 'undefined' && window.__DOSBOX_PROXY_URL) || null;
                const proxyBase = customProxy
                    ? customProxy
                    : new URL('api/dosbox-proxy.php', document.baseURI).toString();
                const sep = proxyBase.includes('?') ? '&' : '?';
                return proxyBase + sep + 'url=' + encodeURIComponent(originalUrl);
            }
            // Unknown host — try direct first; if it CORS-fails the user
            // gets a clear error in the console.
            return originalUrl;
        } catch {
            return originalUrl;
        }
    }
}

export default DOSBox;
