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

/**
 * Escape a string for safe insertion into HTML text content OR a quoted
 * attribute. Handles &, <, >, ", and ' — quote entities render identically
 * in text content, and encoding them unconditionally means a value that
 * ends up in an attribute by mistake can't break out of it.
 */
export function escHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escape a string for safe insertion into an HTML attribute value.
 * Handles &, <, >, ", and '.
 */
export function escAttr(str) {
    return escHtml(str);
}

/**
 * Escape each element of an array and join with a separator.
 * Useful for rendering lists of API-provided values.
 */
export function escHtmlArray(arr, separator = ', ') {
    return (arr || []).map(item => escHtml(String(item))).join(separator);
}
