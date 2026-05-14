/**
 * Desktop layout helpers for icon placement.
 * Single source of truth for grid constants and slot logic.
 */

export const GRID = Object.freeze({
    START_X: 12,
    START_Y: 12,
    ROW_HEIGHT: 90,
    COL_WIDTH: 100
});

/**
 * Snap arbitrary pixel coordinates to the nearest grid slot.
 * @param {number} x
 * @param {number} y
 * @returns {{x:number, y:number}}
 */
export function snapToSlot(x, y) {
    const snappedX = GRID.START_X + Math.round((x - GRID.START_X) / GRID.COL_WIDTH) * GRID.COL_WIDTH;
    const snappedY = GRID.START_Y + Math.round((y - GRID.START_Y) / GRID.ROW_HEIGHT) * GRID.ROW_HEIGHT;
    return { x: snappedX, y: snappedY };
}

/**
 * Build a Set of "x,y" strings from an array of position objects.
 * Snaps every position to its grid slot first so comparisons are consistent.
 * @param {Array<{x:number,y:number}>} positions
 * @returns {Set<string>}
 */
export function buildOccupiedSet(positions = []) {
    return new Set(
        positions
            .filter(pos => Number.isFinite(pos?.x) && Number.isFinite(pos?.y))
            .map(pos => snapToSlot(pos.x, pos.y))
            .map(pos => `${pos.x},${pos.y}`)
    );
}

/**
 * Calculate the next logical grid slot for a new desktop item.
 * Scans from top-to-bottom, then left-to-right.
 * @param {Array<{x:number,y:number}>} occupiedPositions
 * @returns {{x:number,y:number}}
 */
export function getNextDesktopSlot(occupiedPositions = []) {
    const maxY = Math.max(GRID.START_Y, (window.innerHeight || 768) - 200);
    const occupied = buildOccupiedSet(occupiedPositions);

    let x = GRID.START_X;
    let y = GRID.START_Y;

    let iterations = 0;
    while (occupied.has(`${x},${y}`) && iterations < 10000) {
        y += GRID.ROW_HEIGHT;
        if (y > maxY) {
            y = GRID.START_Y;
            x += GRID.COL_WIDTH;
        }
        iterations++;
    }

    return { x, y };
}

/**
 * Find a free grid slot as close as possible to the requested position.
 * If the target slot is unoccupied, returns it directly.
 * Otherwise searches outward in a spiral pattern for the nearest free slot.
 *
 * @param {number} targetX - Desired X (will be snapped to grid)
 * @param {number} targetY - Desired Y (will be snapped to grid)
 * @param {Array<{x:number,y:number}>} occupiedPositions - Pre-filtered to exclude the moving icon
 * @returns {{x:number, y:number}}
 */
export function findNearestFreeSlot(targetX, targetY, occupiedPositions = []) {
    const snapped = snapToSlot(targetX, targetY);
    const occupied = buildOccupiedSet(occupiedPositions);

    // Target slot is free — use it
    if (!occupied.has(`${snapped.x},${snapped.y}`)) {
        return snapped;
    }

    // Spiral outward from the target slot
    const maxY = Math.max(GRID.START_Y, (window.innerHeight || 768) - 200);
    const maxRadius = 50; // max rings to search

    for (let r = 1; r <= maxRadius; r++) {
        for (let dx = -r; dx <= r; dx++) {
            for (let dy = -r; dy <= r; dy++) {
                // Only check cells on the perimeter of this ring
                if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

                const cx = snapped.x + dx * GRID.COL_WIDTH;
                const cy = snapped.y + dy * GRID.ROW_HEIGHT;

                // Stay within reasonable bounds
                if (cx < GRID.START_X || cy < GRID.START_Y || cy > maxY) continue;

                if (!occupied.has(`${cx},${cy}`)) {
                    return { x: cx, y: cy };
                }
            }
        }
    }

    // Fallback: find any free slot from the beginning
    return getNextDesktopSlot(occupiedPositions);
}

/**
 * Collect all occupied desktop positions from both StateManager icons
 * and file positions. Accepts the state getters to avoid circular imports.
 *
 * @param {function} getState - StateManager.getState bound function
 * @returns {Array<{x:number,y:number}>}
 */
export function getAllOccupiedPositions(getState) {
    const icons = getState('icons') || [];
    const filePositions = getState('filePositions') || {};
    return [
        ...icons,
        ...Object.values(filePositions)
    ];
}
