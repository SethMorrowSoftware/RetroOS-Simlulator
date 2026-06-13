/**
 * Sanitize - Centralized HTML/URL sanitization utilities
 *
 * Prevents DOM XSS by providing safe rendering helpers.
 * All dynamic values rendered into innerHTML must pass through
 * escapeHtml() or use setText()/setAttr() DOM helpers instead.
 */

/**
 * Escape a string for safe interpolation into innerHTML.
 *
 * Encodes quotes as well as &, <, > so the same helper is safe in BOTH
 * text content and quoted-attribute contexts. The previous
 * textContent -> innerHTML trick only encoded &, <, > — every template
 * that interpolated escapeHtml() output into an attribute (title="...",
 * data-x="...") was an attribute-breakout XSS for values containing a
 * double quote. Quote entities render identically in text content, so
 * encoding them unconditionally costs nothing.
 */
export function escapeHtml(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Set an element's text content safely (no HTML interpretation).
 */
export function setText(el, value) {
    el.textContent = value == null ? '' : String(value);
}

/**
 * Set a DOM attribute safely (properly quoted by the browser).
 */
export function setAttr(el, attr, value) {
    el.setAttribute(attr, value == null ? '' : String(value));
}

/**
 * Returns true if the value is a safe HTTP(S) URL.
 * Rejects javascript:, data:, vbscript:, and other dangerous schemes.
 */
export function isSafeHttpUrl(value) {
    try {
        const u = new URL(value, window.location.origin);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Escape a string for safe interpolation into an HTML attribute value.
 * Encodes &, <, >, ", and ' so the value cannot break out of a quoted attribute.
 */
export function escAttr(text) {
    if (text == null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Sanitize a CSS color value for safe use in style attributes.
 * Allows hex colors (#rgb, #rrggbb, #rrggbbaa), named colors,
 * and rgb()/hsl() functions. Rejects anything else to prevent
 * CSS injection (e.g., `red; background: url(...)` or `expression()`).
 * Returns the fallback color if the value doesn't match a safe pattern.
 */
const SAFE_CSS_COLOR = /^(#[0-9a-f]{3,8}|[a-z]{1,25}|rgba?\(\s*[\d.,\s%]+\)|hsla?\(\s*[\d.,\s%deg]+\))$/i;

export function sanitizeCssColor(value, fallback = '#000') {
    if (typeof value !== 'string') return fallback;
    const trimmed = value.trim();
    return SAFE_CSS_COLOR.test(trimmed) ? trimmed : fallback;
}

export default { escapeHtml, escAttr, setText, setAttr, isSafeHttpUrl, sanitizeCssColor };
