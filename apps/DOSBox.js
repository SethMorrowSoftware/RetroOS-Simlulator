/**
 * Game Library — IlluminatOS! PC Software Gallery
 *
 * A curated 90s-styled software launcher that browses and runs a hand-picked
 * library of classic PC shareware and retail titles. Games are streamed
 * from trusted CDNs and run inside an in-browser emulator.
 *
 * Visual theme: 90s multimedia CD-ROM compilation — Win95 chrome, DOS
 * textmode accents, CD jewel-case tile art.
 *
 * The internal app id stays `dosbox` so existing `.retro` scripts keep
 * working — the visible name, icon, and chrome are rebranded.
 *
 * SCRIPTING SUPPORT (unchanged for back-compat):
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

/** CDN base for the embedded emulator engine (loaded lazily). */
const JSDOS_CDN = 'https://v8.js-dos.com/latest';
const JSDOS_JS_URL = `${JSDOS_CDN}/js-dos.js`;
const JSDOS_CSS_URL = `${JSDOS_CDN}/js-dos.css`;
const EMULATORS_PATH_PREFIX = `${JSDOS_CDN}/emulators/`;

/** Hosts that send permissive CORS — fetched directly. */
const CORS_FRIENDLY_HOSTS = new Set(['v8.js-dos.com']);
/** Hosts that don't send CORS — routed through the local PHP proxy. */
const NEEDS_PROXY_HOSTS = new Set(['cdn.dos.zone', 'br.cdn.dos.zone', 'dos.zone']);

/**
 * Curated game library — verified bundles from trusted CDNs. Each entry:
 * { name, icon, genre, year, desc, url }. URLs without query strings —
 * the engine's bundle handler rejects `?anonymous=1` style suffixes.
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
      desc: 'The Adventures of Captain Comic — early platformer',
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
    { name: 'Best of ZZT',         icon: '🎮', genre: 'Puzzle',      year: 1992,
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
      desc: 'Namco\'s arcade icon',
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
      desc: 'Sega beat-\'em-up',
      url: 'https://cdn.dos.zone/original/2X/a/ad3686df58a0bac357d3bb81b3f2536205e9ad76.jsdos' },
    { name: 'Earthworm Jim',       icon: '🪱', genre: 'Arcade',      year: 1995,
      desc: 'Shiny Entertainment\'s wormy hero',
      url: 'https://cdn.dos.zone/original/2X/a/aad1d125300d7d93bc28058fa4d0247a7142510e.jsdos' },
    { name: 'Rampart',             icon: '🏰', genre: 'Arcade',      year: 1992,
      desc: 'Atari castle-siege arcade',
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
      desc: 'Midway\'s arcade fighter',
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
    { name: 'MS Windows 3.0',      icon: '🪟', genre: 'Extras',      year: 1990,
      desc: 'Microsoft Windows 3.0 + bundled mini-games',
      url: 'https://cdn.dos.zone/custom/dos/microsoft-windows-version-30-included-games.jsdos' },
    { name: 'QBasic 4.5',          icon: '⌨️', genre: 'Extras',      year: 1988,
      desc: 'Microsoft QuickBASIC 4.5',
      url: 'https://cdn.dos.zone/custom/dos/QB45.jsdos' },
    { name: 'Dhrystone Bench',     icon: '📊', genre: 'Extras',      year: 1988,
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
    'Extras',
];

/** Pixel-style emoji glyph for each category in the sidebar. */
const GENRE_ICONS = {
    'Shooter':         '🔫',
    'Platformer':      '🏃',
    'Action':          '🗡️',
    'Adventure':       '🧭',
    'Text Adventure':  '📜',
    'RPG':             '🐉',
    'Strategy':        '🏰',
    'Puzzle':          '🧩',
    'Arcade':          '🕹️',
    'Fighting':        '🥊',
    'Racing':          '🏎️',
    'Simulation':      '✈️',
    'Educational':     '🎓',
    'Extras':          '💿',
};

/** Hand-picked headliners for the top "HOT PICKS" marquee. */
const HOT_PICKS = [
    'DOOM',
    'Prince of Persia',
    'SimCity 2000',
    'Commander Keen 1-3',
    'The Lion King',
    'Lemmings',
    'Oregon Trail Deluxe',
    'Mortal Kombat',
    'Pac-Man',
    'Tetris (1986)',
];

class DOSBox extends AppBase {
    constructor() {
        super({
            id: 'dosbox',
            name: 'Game Library',
            icon: '📀',
            width: 860,
            height: 620,
            minWidth: 640,
            minHeight: 460,
            resizable: true,
            singleton: true,
            category: 'games'
        });

        this.dosProps = null;
        this.dosRoot = null;
        this.isRunning = false;
        this.isReady = false;
        this.currentBundle = null;
        this.currentBundleName = null;
        this.activeBlobUrl = null;
        this._jsdosLoadPromise = null;
        this._readyWatchdog = null;
        this._resizePumpTimers = [];
        this._canvasHealthTimers = [];

        // UI state — view: 'browse' | 'detail' | 'play'
        this.view = 'browse';
        this.activeCategory = '__hot__';   // '__hot__' = Hot Picks, '__all__' = full library, else genre
        this.searchQuery = '';
        this.selectedGameUrl = null;

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
            currentBundleName: this.currentBundleName,
            view: this.view,
            activeCategory: this.activeCategory
        }));

        this.registerQuery('getLibrary', () =>
            GAME_LIBRARY.map(g => ({
                name: g.name, url: g.url, desc: g.desc,
                icon: g.icon, genre: g.genre, year: g.year
            }))
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
        const sidebar = this._buildSidebarHtml();
        const stats = this._libraryStats();

        return `
            <div class="arcade-app" data-view="browse">
                <!-- ── Title bar header ───────────────── -->
                <div class="arcade-titlebar">
                    <div class="arcade-titlebar-row">
                        <div class="arcade-titlebar-disc" aria-hidden="true">
                            <div class="arcade-titlebar-disc-inner"></div>
                        </div>
                        <div class="arcade-titlebar-text">
                            <div class="arcade-titlebar-title">Game Library</div>
                            <div class="arcade-titlebar-version">v1.0 &nbsp;·&nbsp; CD-ROM Edition</div>
                        </div>
                        <div class="arcade-titlebar-stamp">
                            <div class="arcade-stamp-line">INTERACTIVE</div>
                            <div class="arcade-stamp-line arcade-stamp-line--accent">MULTIMEDIA</div>
                        </div>
                    </div>
                    <div class="arcade-titlebar-stripes" aria-hidden="true"></div>
                </div>

                <!-- ── Browse view (sidebar + grid) ─── -->
                <div class="arcade-browse">
                    <aside class="arcade-sidebar">
                        <div class="arcade-sidebar-title">📁 Categories</div>
                        ${sidebar}
                        <div class="arcade-sidebar-foot">
                            <div class="arcade-sidebar-stat">
                                <span>Titles</span><b>${stats.total}</b>
                            </div>
                            <div class="arcade-sidebar-stat">
                                <span>Years</span><b>${stats.minYear}–${stats.maxYear}</b>
                            </div>
                        </div>
                    </aside>

                    <main class="arcade-main">
                        <div class="arcade-toolbar">
                            <div class="arcade-toolbar-section">
                                <span class="arcade-cat-label" id="arcadeCatLabel">★ Top Titles</span>
                                <span class="arcade-cat-count" id="arcadeCatCount"></span>
                            </div>
                            <div class="arcade-toolbar-search">
                                <span class="arcade-search-icon">🔎</span>
                                <input type="text" class="arcade-search-input" id="arcadeSearch"
                                       placeholder="Search titles…" spellcheck="false" />
                            </div>
                        </div>
                        <div class="arcade-grid" id="arcadeGrid"></div>
                        <div class="arcade-empty" id="arcadeEmpty" hidden>
                            <div class="arcade-empty-icon">💾</div>
                            <div class="arcade-empty-title">NO TITLES FOUND</div>
                            <div class="arcade-empty-sub">Try a different search or category.</div>
                        </div>
                    </main>
                </div>

                <!-- ── Game detail view ──────────────── -->
                <div class="arcade-detail" id="arcadeDetail" hidden></div>

                <!-- ── Play view (emulator) ──────────── -->
                <div class="arcade-play" id="arcadePlay" hidden>
                    <div class="arcade-play-bar">
                        <button class="arcade-pixel-btn" id="arcadeBackToBrowse" title="Close program">◀ Close</button>
                        <div class="arcade-play-title" id="arcadePlayTitle">—</div>
                        <div class="arcade-play-actions">
                            <button class="arcade-pixel-btn" id="arcadeResetBtn"  title="Restart program">↻ Restart</button>
                            <button class="arcade-pixel-btn" id="arcadeFsBtn"     title="Toggle fullscreen">⛶ Fullscreen</button>
                        </div>
                    </div>
                    <div class="arcade-stage-area" id="arcadeStageArea">
                        <div class="arcade-stage" id="arcadeStage"></div>
                        <div class="arcade-loading" id="arcadeLoading" hidden>
                            <div class="arcade-loading-disc" aria-hidden="true">
                                <div class="arcade-loading-disc-inner"></div>
                                <div class="arcade-loading-disc-hole"></div>
                            </div>
                            <div class="arcade-loading-text" id="arcadeLoadingText">Initializing…</div>
                            <div class="arcade-loading-tip" id="arcadeLoadingTip"></div>
                        </div>
                    </div>
                </div>

                <!-- ── Status bar ────────────────────── -->
                <div class="arcade-statusbar">
                    <span class="arcade-status-led" id="arcadeStatusLed"></span>
                    <span class="arcade-status-text" id="arcadeStatus">Ready</span>
                    <span class="arcade-status-spacer"></span>
                    <span class="arcade-status-credit">C:\\GAMES&gt; READY</span>
                </div>
            </div>
        `;
    }

    onMount() {
        // Initial render
        this.renderTiles();

        // Sidebar — category buttons
        this.getElements('.arcade-cat').forEach(btn => {
            this.addHandler(btn, 'click', () => {
                const cat = btn.dataset.cat;
                this.selectCategory(cat);
            });
        });

        // Search
        const search = this.getElement('#arcadeSearch');
        this.addHandler(search, 'input', (e) => {
            this.searchQuery = (e.target.value || '').trim().toLowerCase();
            this.renderTiles();
        });

        // Detail/play action buttons (delegated to outer container so dynamic
        // detail-view content keeps working after re-render).
        const root = this.getElement('.arcade-app');
        this.addHandler(root, 'click', (e) => {
            const playBtn   = e.target.closest('[data-action="play"]');
            const backBtn   = e.target.closest('[data-action="back-to-browse"]');
            const detailBtn = e.target.closest('[data-action="open-detail"]');
            if (playBtn)   this.loadBundle(playBtn.dataset.url);
            if (backBtn)   this.backToBrowse();
            if (detailBtn) this.openDetail(detailBtn.dataset.url);
        });

        // Play-view controls
        this.addHandler(this.getElement('#arcadeBackToBrowse'), 'click', () => this.backToBrowse());
        this.addHandler(this.getElement('#arcadeResetBtn'), 'click', () => {
            const url = this.currentBundle;
            this.stopEmulator(false).then(() => { if (url) this.loadBundle(url); });
        });
        this.addHandler(this.getElement('#arcadeFsBtn'), 'click', () => this.toggleFullscreen());

        // Background-prefetch the engine — first launch feels snappy.
        this.ensureJsDosLoaded().catch((err) => {
            console.warn('[Arcade] Background engine preload failed:', err);
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
        // Embedded engine uses ResizeObserver internally — no action needed.
    }

    // ── View / UI helpers ──────────────────────────────────────

    setView(view) {
        this.view = view;
        const root = this.getElement('.arcade-app');
        if (root) root.dataset.view = view;
    }

    selectCategory(cat) {
        this.activeCategory = cat;
        this.searchQuery = '';
        const search = this.getElement('#arcadeSearch');
        if (search) search.value = '';

        // Highlight active sidebar entry
        this.getElements('.arcade-cat').forEach(b => {
            b.classList.toggle('arcade-cat--active', b.dataset.cat === cat);
        });

        const label = this.getElement('#arcadeCatLabel');
        if (label) label.textContent = this._categoryLabel(cat);

        this.renderTiles();
        this.playSound('click');
    }

    openDetail(url) {
        const game = GAME_LIBRARY.find(g => g.url === url);
        if (!game) return;
        this.selectedGameUrl = url;
        const detail = this.getElement('#arcadeDetail');
        if (detail) {
            detail.innerHTML = this._buildDetailHtml(game);
            detail.hidden = false;
        }
        this.setView('detail');
        this.playSound('click');
    }

    backToBrowse() {
        // If a game is running, stop it first.
        if (this.isRunning) {
            this.stopEmulator();
        }
        const detail = this.getElement('#arcadeDetail');
        const play   = this.getElement('#arcadePlay');
        if (detail) detail.hidden = true;
        if (play)   play.hidden = true;
        this.setView('browse');
    }

    renderTiles() {
        const grid  = this.getElement('#arcadeGrid');
        const empty = this.getElement('#arcadeEmpty');
        const count = this.getElement('#arcadeCatCount');
        if (!grid) return;

        const filtered = this._filterGames();
        if (count) count.textContent = `(${filtered.length})`;

        if (!filtered.length) {
            grid.innerHTML = '';
            grid.hidden = true;
            if (empty) empty.hidden = false;
            return;
        }
        grid.hidden = false;
        if (empty) empty.hidden = true;

        grid.innerHTML = filtered.map((g, i) => `
            <button class="arcade-tile" data-action="open-detail" data-url="${escapeHtml(g.url)}"
                    style="--tile-delay:${(i % 24) * 18}ms" title="${escapeHtml(g.desc)}">
                <div class="arcade-tile-cover">
                    <div class="arcade-tile-banner">${escapeHtml(g.genre)}</div>
                    <div class="arcade-tile-glyph">${escapeHtml(g.icon)}</div>
                    <div class="arcade-tile-spine" aria-hidden="true"></div>
                </div>
                <div class="arcade-tile-plate">
                    <div class="arcade-tile-name">${escapeHtml(g.name)}</div>
                    <div class="arcade-tile-meta">
                        <span class="arcade-tile-year">${g.year}</span>
                        <span class="arcade-tile-genre">${escapeHtml(g.genre)}</span>
                    </div>
                </div>
            </button>
        `).join('');
    }

    /** Render the big detail/launch panel for a single game. */
    _buildDetailHtml(game) {
        return `
            <button class="arcade-pixel-btn arcade-detail-back" data-action="back-to-browse">◀ Back</button>
            <div class="arcade-detail-card">
                <div class="arcade-detail-box">
                    <div class="arcade-detail-box-cover">
                        <div class="arcade-detail-box-banner">${escapeHtml(game.genre)}</div>
                        <div class="arcade-detail-glyph">${escapeHtml(game.icon)}</div>
                        <div class="arcade-detail-box-strip">
                            <span>${escapeHtml(game.name)}</span>
                        </div>
                    </div>
                    <div class="arcade-detail-box-spine" aria-hidden="true"></div>
                </div>
                <div class="arcade-detail-info">
                    <div class="arcade-detail-genre-tag">${escapeHtml(game.genre.toUpperCase())}</div>
                    <h2 class="arcade-detail-title">${escapeHtml(game.name)}</h2>
                    <div class="arcade-detail-year">© ${game.year} &nbsp;·&nbsp; PC SOFTWARE</div>
                    <p class="arcade-detail-desc">${escapeHtml(game.desc)}</p>
                    <div class="arcade-detail-actions">
                        <button class="arcade-coin-btn" data-action="play" data-url="${escapeHtml(game.url)}">
                            <span class="arcade-coin-glyph" aria-hidden="true">▶</span>
                            <span class="arcade-coin-text">RUN PROGRAM</span>
                            <span class="arcade-coin-sub">CLICK TO LAUNCH</span>
                        </button>
                    </div>
                    <div class="arcade-detail-meta-row">
                        <div><span>Year</span><b>${game.year}</b></div>
                        <div><span>Genre</span><b>${escapeHtml(game.genre)}</b></div>
                        <div><span>Format</span><b>CD-ROM</b></div>
                    </div>
                </div>
            </div>
        `;
    }

    /** Returns the visible games for the current category + search. */
    _filterGames() {
        let list = GAME_LIBRARY;
        if (this.activeCategory === '__hot__') {
            list = HOT_PICKS
                .map(name => GAME_LIBRARY.find(g => g.name === name))
                .filter(Boolean);
        } else if (this.activeCategory !== '__all__') {
            list = list.filter(g => g.genre === this.activeCategory);
        }
        if (this.searchQuery) {
            const q = this.searchQuery;
            list = list.filter(g =>
                g.name.toLowerCase().includes(q) ||
                g.desc.toLowerCase().includes(q) ||
                g.genre.toLowerCase().includes(q) ||
                String(g.year).includes(q)
            );
        }
        return list;
    }

    _buildSidebarHtml() {
        const counts = new Map();
        for (const g of GAME_LIBRARY) counts.set(g.genre, (counts.get(g.genre) || 0) + 1);
        const orderedGenres = [
            ...GENRE_ORDER.filter(g => counts.has(g)),
            ...[...counts.keys()].filter(g => !GENRE_ORDER.includes(g))
        ];

        const headers = `
            <button class="arcade-cat arcade-cat--active" data-cat="__hot__">
                <span class="arcade-cat-icon">★</span>
                <span class="arcade-cat-name">Top Titles</span>
                <span class="arcade-cat-tally">${HOT_PICKS.length}</span>
            </button>
            <button class="arcade-cat" data-cat="__all__">
                <span class="arcade-cat-icon">📂</span>
                <span class="arcade-cat-name">All Titles</span>
                <span class="arcade-cat-tally">${GAME_LIBRARY.length}</span>
            </button>
            <div class="arcade-sidebar-divider"></div>
        `;

        const rows = orderedGenres.map(genre => `
            <button class="arcade-cat" data-cat="${escapeHtml(genre)}">
                <span class="arcade-cat-icon">${GENRE_ICONS[genre] || '🎮'}</span>
                <span class="arcade-cat-name">${escapeHtml(genre)}</span>
                <span class="arcade-cat-tally">${counts.get(genre)}</span>
            </button>
        `).join('');

        return headers + rows;
    }

    _categoryLabel(cat) {
        if (cat === '__hot__') return '★ Top Titles';
        if (cat === '__all__') return '📂 All Titles';
        return `${GENRE_ICONS[cat] || '🎮'} ${cat}`;
    }

    _libraryStats() {
        const years = GAME_LIBRARY.map(g => g.year).filter(Number.isFinite);
        return {
            total: GAME_LIBRARY.length,
            minYear: Math.min(...years),
            maxYear: Math.max(...years)
        };
    }

    // ── Engine loader (lazy CDN fetch) ─────────────────────────

    /**
     * Load the embedded emulator's CSS + JS from CDN once per session.
     * The returned promise is cached so concurrent callers share it.
     */
    ensureJsDosLoaded() {
        if (typeof window.Dos === 'function') return Promise.resolve();
        if (this._jsdosLoadPromise) return this._jsdosLoadPromise;

        this.setStatus('CONNECTING TO ARCADE…');

        this._jsdosLoadPromise = new Promise((resolve, reject) => {
            if (!document.querySelector('link[data-jsdos="1"]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = JSDOS_CSS_URL;
                link.dataset.jsdos = '1';
                document.head.appendChild(link);
            }

            const existing = document.querySelector('script[data-jsdos="1"]');
            const waitForGlobal = (timeoutMs) => {
                const start = Date.now();
                const tick = () => {
                    if (typeof window.Dos === 'function') {
                        resolve();
                    } else if (Date.now() - start > timeoutMs) {
                        reject(new Error('Engine loaded but global never appeared'));
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
                this._jsdosLoadPromise = null;
                reject(new Error('Failed to fetch arcade engine from CDN'));
            };
            document.head.appendChild(script);
        });

        return this._jsdosLoadPromise;
    }

    // ── Core: load & play ─────────────────────────────────────

    /**
     * Load and run a bundle from a URL. Switches the UI into "play" mode.
     * @param {string} url
     */
    async loadBundle(url) {
        if (!url) return;
        await this._startEmulatorWith({ url, displayName: this.getBundleName(url) });
    }

    /**
     * Load a local bundle file via Blob URL — avoids CORS entirely.
     * Kept for scripting/back-compat; not exposed in the new UI.
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

    async _startEmulatorWith({ url, displayName }) {
        // Switch to play view
        const detail   = this.getElement('#arcadeDetail');
        const play     = this.getElement('#arcadePlay');
        const stage    = this.getElement('#arcadeStage');
        const loading  = this.getElement('#arcadeLoading');
        const loadTxt  = this.getElement('#arcadeLoadingText');
        const loadTip  = this.getElement('#arcadeLoadingTip');
        const titleEl  = this.getElement('#arcadePlayTitle');

        if (!stage) return;

        await this.stopEmulator(false);
        this.playSound('floppy');

        if (detail) detail.hidden = true;
        if (play)   play.hidden = false;
        if (loading) loading.hidden = false;
        if (loadTxt) loadTxt.textContent = 'Initializing…';
        if (loadTip) loadTip.textContent = this._randomTip();
        if (titleEl) titleEl.textContent = displayName;
        this.setView('play');
        this.setStatusLed('booting');

        try {
            await this.ensureJsDosLoaded();

            if (loadTxt) loadTxt.textContent = 'Loading program…';

            stage.innerHTML = '';
            const root = document.createElement('div');
            root.className = 'arcade-root';
            stage.appendChild(root);
            this.dosRoot = root;

            // Wait for layout so the engine can measure its container.
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

            this.currentBundle = url;
            this.currentBundleName = displayName;
            this.isRunning = true;
            this.isReady = false;
            this.setStatus('Starting · ' + displayName);

            const fetchUrl = this.getLoadUrl(url);
            if (fetchUrl !== url) {
                console.log('[Arcade] Routing bundle through proxy:', url, '→', fetchUrl);
            }

            // Worker mode requires SharedArrayBuffer (COOP/COEP). Most plain
            // HTTP deployments don't have those headers, so the worker hangs
            // silently. Detect cross-origin isolation and pick a safe mode.
            const canUseWorker = (typeof self !== 'undefined') &&
                self.crossOriginIsolated === true &&
                typeof SharedArrayBuffer !== 'undefined';

            if (!canUseWorker) {
                console.warn(
                    '[Arcade] crossOriginIsolated=false — running on the main thread. ' +
                    'For best performance, serve with COOP/COEP headers:\n' +
                    '  Cross-Origin-Opener-Policy: same-origin\n' +
                    '  Cross-Origin-Embedder-Policy: require-corp'
                );
            }

            // Watchdog: warn if ci-ready never fires.
            if (this._readyWatchdog) clearTimeout(this._readyWatchdog);
            this._readyWatchdog = setTimeout(() => {
                if (this.isRunning && !this.isReady) {
                    console.warn('[Arcade] Engine did not reach ready state in 45s.');
                    this.setStatus('Stuck loading — check console');
                    this.setStatusLed('error');
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
                // Canvas 2D — WebGL can render to a 0x0 framebuffer when its
                // parent is briefly 0-sized inside our flex chain.
                renderBackend: 'canvas',
                renderAspect: 'Fit',
                thinSidebar: true,
                onEvent: (event, arg) => {
                    console.log('[Arcade] engine event:', event, arg);
                    this._handleJsDosEvent(event, arg);
                }
            });

            // Hide cloud chrome — we don't ship cloud accounts.
            if (typeof this.dosProps.setNoCloud === 'function') {
                this.dosProps.setNoCloud(true);
            }

            if (loading) loading.hidden = true;

            // Resize pump — wakes the engine's ResizeObserver in case our
            // flex chain is briefly 0-sized at first measurement.
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
                        console.log(`[Arcade] @${ms}ms root: ${r.width.toFixed(0)}x${r.height.toFixed(0)} (no canvas yet)`);
                        return;
                    }
                    const cRect = c.getBoundingClientRect();
                    const pRect = c.parentElement ? c.parentElement.getBoundingClientRect() : null;
                    console.log(
                        `[Arcade] @${ms}ms root: ${r.width.toFixed(0)}x${r.height.toFixed(0)}, ` +
                        `canvas attr: ${c.width}x${c.height}, ` +
                        `canvas rect: ${cRect.width.toFixed(0)}x${cRect.height.toFixed(0)}, ` +
                        `canvas parent: ${pRect ? pRect.width.toFixed(0) + 'x' + pRect.height.toFixed(0) : 'none'}, ` +
                        `inline: ${c.getAttribute('style') || '(none)'}`
                    );
                }, ms)
            );

            // Canvas health checks — a parent-of-canvas may compute to 0px
            // height inside our flex chain. Walk the chain and force-stamp
            // every collapsed link to fill the root box.
            this._canvasHealthTimers = [500, 1500, 3500, 7000, 12000].map(ms =>
                setTimeout(() => this._healCanvas(root, ms), ms)
            );

            this.emitAppEvent('started', { url, name: displayName, workerThread: canUseWorker });
        } catch (err) {
            console.error('[Arcade] Failed to load bundle:', err);
            this.setStatus('Error · ' + (err?.message || err));
            this.setStatusLed('error');
            if (loading) loading.hidden = true;
            this.isRunning = false;
            this.isReady = false;
            this.emitAppEvent('error', { error: err?.message || String(err), url });
            // Send the user back to browse so the game grid is visible.
            const playEl = this.getElement('#arcadePlay');
            if (playEl) playEl.hidden = true;
            this.setView('browse');
        }
    }

    _handleJsDosEvent(event, arg) {
        switch (event) {
            case 'emu-ready':
                this.setStatus('Loading · ' + this.currentBundleName);
                this.setStatusLed('booting');
                this.emitAppEvent('booting', { name: this.currentBundleName });
                break;
            case 'ci-ready':
                this.isReady = true;
                if (this._readyWatchdog) {
                    clearTimeout(this._readyWatchdog);
                    this._readyWatchdog = null;
                }
                this.setStatus('Running · ' + this.currentBundleName);
                this.setStatusLed('playing');
                this.emitAppEvent('ready', { name: this.currentBundleName });
                break;
            case 'fullscreen-change':
                this.emitAppEvent('fullscreen', { active: !!arg });
                break;
            case 'open-key':
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
     * @param {boolean} [returnToBrowse=true] - If true, switch UI back to browse.
     */
    async stopEmulator(returnToBrowse = true) {
        const stage = this.getElement('#arcadeStage');

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
                if (typeof this.dosProps.stop === 'function') {
                    await this.dosProps.stop();
                }
            } catch (e) {
                console.warn('[Arcade] Error during props.stop():', e);
            }
            this.dosProps = null;
        }

        if (stage) stage.innerHTML = '';
        this.dosRoot = null;

        if (this.activeBlobUrl && this.currentBundle === this.activeBlobUrl) {
            URL.revokeObjectURL(this.activeBlobUrl);
            this.activeBlobUrl = null;
        }

        this.isRunning = false;
        this.isReady = false;

        if (returnToBrowse) {
            const play = this.getElement('#arcadePlay');
            if (play) play.hidden = true;
            this.setView('browse');
            this.setStatus('Ready');
            this.setStatusLed('ready');
        }

        this.emitAppEvent('stopped', {});
    }

    toggleFullscreen(want) {
        if (this.dosProps?.setFullScreen) {
            const next = typeof want === 'boolean'
                ? want
                : !document.fullscreenElement;
            try {
                this.dosProps.setFullScreen(next);
                return;
            } catch (e) {
                console.warn('[Arcade] setFullScreen failed, falling back to DOM API:', e);
            }
        }

        const stageArea = this.getElement('#arcadeStageArea');
        if (!stageArea) return;

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        } else {
            stageArea.requestFullscreen().catch(err => {
                console.warn('[Arcade] Fullscreen error:', err);
            });
        }
    }

    setVolume(volume) {
        const v = Math.max(0, Math.min(1, Number(volume) || 0));
        if (this.dosProps?.setVolume) {
            this.dosProps.setVolume(v);
        }
    }

    // ── Helpers ────────────────────────────────────────────────

    setStatus(text) {
        const el = this.getElement('#arcadeStatus');
        if (el) el.textContent = text;
    }

    setStatusLed(state) {
        const led = this.getElement('#arcadeStatusLed');
        if (!led) return;
        led.dataset.state = state || 'ready';
    }

    _randomTip() {
        const tips = [
            'TIP: Press F11 in-game for fullscreen',
            'TIP: Arrow keys move in most titles',
            'TIP: Save your game often',
            'TIP: Right-click the viewport for runtime options',
            'TIP: Check the manual before launching',
            'TIP: Original DOS keyboard layouts are preserved',
            'TIP: Some games need 5–10 seconds to start',
            'TIP: Adjust audio with the volume command',
        ];
        return tips[Math.floor(Math.random() * tips.length)];
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
     * Canvas health check / diagnostic. Logs the parent chain so future
     * regressions are one-screenshot diagnosable. If the canvas's parent
     * is still 0x0, nudge the engine with a resize event.
     * @private
     */
    _healCanvas(root, elapsedMs) {
        if (!this.isRunning || !root || !root.isConnected) return;
        const canvas = root.querySelector('canvas');
        if (!canvas) {
            console.log(`[Arcade] healCanvas @${elapsedMs}ms — no canvas in DOM yet`);
            return;
        }

        const cRect = canvas.getBoundingClientRect();
        const parent = canvas.parentElement;
        const pRect = parent ? parent.getBoundingClientRect() : null;

        this._logParentChain(canvas, root, elapsedMs);

        if (cRect.width >= 16 && cRect.height >= 16) {
            console.log(`[Arcade] healCanvas @${elapsedMs}ms — canvas OK at ${cRect.width.toFixed(0)}x${cRect.height.toFixed(0)}`);
            return;
        }

        console.warn(
            `[Arcade] healCanvas @${elapsedMs}ms — canvas ${cRect.width.toFixed(0)}x${cRect.height.toFixed(0)} ` +
            `inside parent ${pRect ? pRect.width.toFixed(0) + 'x' + pRect.height.toFixed(0) : 'unknown'}. ` +
            `Nudging engine with a resize event.`
        );
        window.dispatchEvent(new Event('resize'));
    }

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
        console.log(`[Arcade] parent chain @${elapsedMs}ms:\n${lines.join('\n')}`);
    }

    /**
     * Resolve a user-facing URL into the URL the engine should fetch. Hosts
     * that don't send CORS to third-party origins are routed through the
     * local PHP proxy. Hosts that do send CORS, same-origin URLs, and
     * blob:/data:/file: are passed through unchanged.
     *
     * Deployments can override the proxy URL via:
     *   window.__DOSBOX_PROXY_URL = 'https://example.com/proxy.php';
     */
    getLoadUrl(originalUrl) {
        if (!originalUrl) return originalUrl;
        try {
            const u = new URL(originalUrl, document.baseURI);
            const host = u.hostname.toLowerCase();

            if (u.protocol === 'blob:' || u.protocol === 'data:' || u.protocol === 'file:') {
                return originalUrl;
            }
            if (host === location.hostname.toLowerCase()) {
                return originalUrl;
            }
            if (CORS_FRIENDLY_HOSTS.has(host)) {
                return originalUrl;
            }
            if (NEEDS_PROXY_HOSTS.has(host) || host.endsWith('.dos.zone')) {
                const customProxy = (typeof window !== 'undefined' && window.__DOSBOX_PROXY_URL) || null;
                const proxyBase = customProxy
                    ? customProxy
                    : new URL('api/dosbox-proxy.php', document.baseURI).toString();
                const sep = proxyBase.includes('?') ? '&' : '?';
                return proxyBase + sep + 'url=' + encodeURIComponent(originalUrl);
            }
            return originalUrl;
        } catch {
            return originalUrl;
        }
    }
}

export default DOSBox;
