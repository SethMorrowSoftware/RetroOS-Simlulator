/**
 * TimeBuiltins - Date and time functions for RetroScript
 */

export function registerTimeBuiltins(interpreter) {
    // Current time
    interpreter.registerBuiltin('now', () => Date.now());
    interpreter.registerBuiltin('timestamp', () => Math.floor(Date.now() / 1000));

    // Formatted time/date
    interpreter.registerBuiltin('time', () => {
        return new Date().toLocaleTimeString();
    });

    interpreter.registerBuiltin('date', () => {
        return new Date().toLocaleDateString();
    });

    interpreter.registerBuiltin('datetime', () => {
        return new Date().toLocaleString();
    });

    // Date components
    interpreter.registerBuiltin('year', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        return date.getFullYear();
    });

    interpreter.registerBuiltin('month', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        return date.getMonth() + 1; // 1-12
    });

    interpreter.registerBuiltin('day', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        return date.getDate();
    });

    interpreter.registerBuiltin('weekday', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        return date.getDay(); // 0-6 (Sunday-Saturday)
    });

    interpreter.registerBuiltin('weekdayName', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[date.getDay()];
    });

    // Time components
    interpreter.registerBuiltin('hour', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        return date.getHours();
    });

    interpreter.registerBuiltin('minute', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        return date.getMinutes();
    });

    interpreter.registerBuiltin('second', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        return date.getSeconds();
    });

    interpreter.registerBuiltin('millisecond', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        return date.getMilliseconds();
    });

    // Time calculations
    interpreter.registerBuiltin('elapsed', (startTime) => {
        return Date.now() - Number(startTime);
    });

    interpreter.registerBuiltin('addDays', (ts, days) => {
        const date = new Date(Number(ts));
        date.setDate(date.getDate() + Number(days));
        return date.getTime();
    });

    interpreter.registerBuiltin('addHours', (ts, hours) => {
        return Number(ts) + (Number(hours) * 60 * 60 * 1000);
    });

    interpreter.registerBuiltin('addMinutes', (ts, minutes) => {
        return Number(ts) + (Number(minutes) * 60 * 1000);
    });

    interpreter.registerBuiltin('addSeconds', (ts, seconds) => {
        return Number(ts) + (Number(seconds) * 1000);
    });

    // Formatting
    interpreter.registerBuiltin('formatDate', (ts, format = 'YYYY-MM-DD') => {
        const date = ts ? new Date(Number(ts)) : new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        return String(format)
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day);
    });

    interpreter.registerBuiltin('formatTime', (ts, format = 'HH:mm:ss') => {
        const date = ts ? new Date(Number(ts)) : new Date();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return String(format)
            .replace('HH', hours)
            .replace('mm', minutes)
            .replace('ss', seconds);
    });

    // Parsing
    interpreter.registerBuiltin('parseDate', (dateStr) => {
        const date = new Date(String(dateStr));
        return isNaN(date.getTime()) ? null : date.getTime();
    });

    // ISO format
    interpreter.registerBuiltin('toISO', (ts) => {
        const date = ts ? new Date(Number(ts)) : new Date();
        return date.toISOString();
    });
}

export default registerTimeBuiltins;
