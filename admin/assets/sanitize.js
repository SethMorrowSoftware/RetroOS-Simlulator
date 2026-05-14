/**
 * Centralized HTML/attribute sanitization for admin UI components.
 *
 * Usage:
 *   import { escHtml, escAttr } from '../sanitize.js';
 *
 *   // For text content inside HTML tags:
 *   `<span>${escHtml(userValue)}</span>`
 *
 *   // For values inside HTML attributes (includes quote escaping):
 *   `<div data-id="${escAttr(id)}">`
 *
 *   // For arrays that will be rendered as text:
 *   `<span>${escHtmlArray(items)}</span>`
 */

const _div = document.createElement('div');

/**
 * Escape a string for safe insertion into HTML text content.
 * Handles &, <, >.
 */
export function escHtml(str) {
    _div.textContent = str ?? '';
    return _div.innerHTML;
}

/**
 * Escape a string for safe insertion into an HTML attribute value.
 * Handles &, <, >, ", and '.
 */
export function escAttr(str) {
    _div.textContent = str ?? '';
    return _div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Escape each element of an array and join with a separator.
 * Useful for rendering lists of API-provided values.
 */
export function escHtmlArray(arr, separator = ', ') {
    return (arr || []).map(item => escHtml(String(item))).join(separator);
}
