#!/usr/bin/env node
/**
 * Event schema coverage gate.
 *
 * Statically scans every `EventBus.emit('event:name', ...)` (and `.emitAsync`,
 * `Events.X` reference) call site under `core/`, `features/`, `apps/`, `ui/`,
 * and `index.js`, then cross-checks the resulting set of emitted event names
 * against the schemas registered in `core/EventSchema.js`.
 *
 * App-scoped events (`command:<appId>:*`, `app:<appId>:*`, `query:<appId>:*`)
 * are excluded — they are dynamically created per-app and have no static
 * schema by design.
 *
 * Exit codes:
 *   0 — coverage >= COVERAGE_THRESHOLD (default 0.95)
 *   1 — coverage below threshold (prints the unschematized events)
 *
 * Usage:
 *   node scripts/check-event-schema-coverage.mjs
 *   COVERAGE_THRESHOLD=0.9 node scripts/check-event-schema-coverage.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

const COVERAGE_THRESHOLD = Number(process.env.COVERAGE_THRESHOLD || '0.95');
const SCAN_DIRS = ['core', 'features', 'apps', 'ui'];
const SCAN_FILES = ['index.js'];

const APP_SCOPED_NS = new Set(['command', 'app', 'query']);

async function* walkJs(dir) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) {
            // Skip backups / vendor / node_modules / .git
            if (entry.name === 'backups' || entry.name === 'node_modules' || entry.name === '.git') continue;
            yield* walkJs(p);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            yield p;
        }
    }
}

function isAppScoped(name) {
    const [ns, , third] = name.split(':');
    // `command:fs:*` / `command:app:*` / `command:window:*` are not app-scoped —
    // they are core command names. We treat `command:<id>:*` as app-scoped only
    // when the second segment isn't a recognised core sub-namespace.
    if (ns === 'command') {
        const coreSubNs = new Set(['fs', 'window', 'terminal', 'app', 'system', 'media', 'sound', 'desktop']);
        return !coreSubNs.has(name.split(':')[1]);
    }
    if (ns === 'app' || ns === 'query') {
        // `app:launch`, `app:close`, etc. are core. Only `app:<id>:<verb>` with three+ segments is app-scoped.
        return !!third;
    }
    return APP_SCOPED_NS.has(ns) && !!third;
}

// Match: EventBus.emit('foo:bar', ...)  /  .emit("foo:bar"  /  .emitAsync('foo:bar'
const EMIT_RE = /\.emit(?:Async)?\(\s*(['"])([^'"]+)\1/g;

async function scanFile(absPath, emitted) {
    const src = await readFile(absPath, 'utf8');
    let m;
    while ((m = EMIT_RE.exec(src)) !== null) {
        const name = m[2];
        // Skip wildcards / patterns and meta-events we use as alias bridges.
        if (name.includes('*')) continue;
        if (!emitted.has(name)) emitted.set(name, []);
        emitted.get(name).push(relative(REPO_ROOT, absPath));
    }
}

async function main() {
    // Load EventSchema dynamically (it's an ES module re-export).
    const schemaUrl = pathToFileURL(join(REPO_ROOT, 'core/EventSchema.js')).href;
    const { EventSchema } = await import(schemaUrl);
    const schemaKeys = new Set(Object.keys(EventSchema));

    const emitted = new Map(); // name -> [files]
    for (const dir of SCAN_DIRS) {
        for await (const file of walkJs(join(REPO_ROOT, dir))) {
            await scanFile(file, emitted);
        }
    }
    for (const file of SCAN_FILES) {
        await scanFile(join(REPO_ROOT, file), emitted);
    }

    const considered = [...emitted.keys()].filter((n) => !isAppScoped(n));
    const covered = considered.filter((n) => schemaKeys.has(n));
    const missing = considered.filter((n) => !schemaKeys.has(n)).sort();

    const ratio = considered.length === 0 ? 1 : covered.length / considered.length;
    const pct = (ratio * 100).toFixed(1);

    console.log(`Event schema coverage: ${covered.length}/${considered.length} (${pct}%)`);
    console.log(`  app-scoped events skipped: ${emitted.size - considered.length}`);
    console.log(`  threshold: ${(COVERAGE_THRESHOLD * 100).toFixed(0)}%`);

    if (missing.length > 0) {
        console.log('\nMissing schema entries (emitted but not in EventSchema):');
        for (const name of missing) {
            const sample = emitted.get(name)[0];
            console.log(`  ${name}   (e.g. ${sample})`);
        }
    }

    if (ratio + 1e-9 < COVERAGE_THRESHOLD) {
        console.error(`\nFAIL: coverage ${pct}% is below threshold ${(COVERAGE_THRESHOLD * 100).toFixed(0)}%.`);
        process.exit(1);
    }
    console.log('\nOK: coverage meets threshold.');
}

main().catch((err) => {
    console.error('check-event-schema-coverage: unexpected error:', err);
    process.exit(2);
});
