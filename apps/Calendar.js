/**
 * Calendar App
 * Windows 95 style calendar with event management
 * Supports viewing months, adding/editing/deleting events
 */

import AppBase from './AppBase.js';
import StateManager from '../core/StateManager.js';
import EventBus from '../core/EventBus.js';
import { escapeHtml } from '../core/Sanitize.js';

class Calendar extends AppBase {
    constructor() {
        super({
            id: 'calendar',
            name: 'Calendar',
            icon: '📅',
            width: 680,
            height: 600,
            minWidth: 540,
            minHeight: 480,
            resizable: true,
            category: 'accessories',
            singleton: true
        });

        // Register semantic event commands for scriptability
        this.registerCommands();
        this.registerQueries();
    }

    registerCommands() {
        this.registerCommand('addEvent', (payload) => {
            const { title, date, time, color } = payload;
            if (!title || !date) return { success: false, error: 'Title and date are required' };
            const events = this.getInstanceState('events') || [];
            const newEvent = {
                id: Date.now().toString(),
                title,
                date,
                time: time || '',
                color: color || '#4a90d9'
            };
            events.push(newEvent);
            this.setInstanceState('events', events);
            this.saveEvents(events);
            this.renderCalendar?.();
            this.emitAppEvent('event:created', { title, date, time, color });
            return { success: true, eventId: newEvent.id };
        });

        this.registerCommand('removeEvent', (payload) => {
            const { eventId } = payload;
            if (!eventId) return { success: false, error: 'eventId is required' };
            const events = this.getInstanceState('events') || [];
            const filtered = events.filter(e => e.id !== eventId);
            if (filtered.length === events.length) return { success: false, error: 'Event not found' };
            this.setInstanceState('events', filtered);
            this.saveEvents(filtered);
            this.renderCalendar?.();
            this.emitAppEvent('event:deleted', { eventId });
            return { success: true };
        });

        this.registerCommand('goToDate', (payload) => {
            const { date } = payload;
            if (!date) return { success: false, error: 'date is required' };
            const d = new Date(date);
            if (isNaN(d.getTime())) return { success: false, error: 'Invalid date' };
            this.setInstanceState('currentMonth', d.getMonth());
            this.setInstanceState('currentYear', d.getFullYear());
            this.selectDate?.(date);
            this.renderCalendar?.();
            return { success: true };
        });

        this.registerCommand('setMonth', (payload) => {
            const { month, year } = payload;
            if (month !== undefined) this.setInstanceState('currentMonth', month);
            if (year !== undefined) this.setInstanceState('currentYear', year);
            this.renderCalendar?.();
            this.emitAppEvent('month:changed', { month: this.getInstanceState('currentMonth'), year: this.getInstanceState('currentYear') });
            return { success: true };
        });
    }

    registerQueries() {
        this.registerQuery('getEvents', (payload) => {
            const events = this.getInstanceState('events') || [];
            if (payload && payload.date) {
                return events.filter(e => e.date === payload.date);
            }
            return events;
        });

        this.registerQuery('getSelectedDate', () => {
            return this.getInstanceState('selectedDate');
        });

        this.registerQuery('getCurrentMonth', () => {
            return {
                month: this.getInstanceState('currentMonth'),
                year: this.getInstanceState('currentYear')
            };
        });
    }

    onOpen() {
        const now = new Date();
        this.setInstanceState('currentMonth', now.getMonth());
        this.setInstanceState('currentYear', now.getFullYear());
        this.setInstanceState('selectedDate', null);
        this.setInstanceState('events', this.loadEvents());

        return `
            <div class="calendar-app">
                <div class="calendar-header">
                    <button class="cal-nav-btn" id="prevMonth">◀</button>
                    <div class="cal-month-year" id="monthYear"></div>
                    <button class="cal-nav-btn" id="nextMonth">▶</button>
                    <button class="cal-today-btn" id="todayBtn">Today</button>
                </div>

                <div class="calendar-grid-container">
                    <div class="calendar-weekdays">
                        <div class="cal-weekday">Sun</div>
                        <div class="cal-weekday">Mon</div>
                        <div class="cal-weekday">Tue</div>
                        <div class="cal-weekday">Wed</div>
                        <div class="cal-weekday">Thu</div>
                        <div class="cal-weekday">Fri</div>
                        <div class="cal-weekday">Sat</div>
                    </div>
                    <div class="calendar-days" id="calendarDays"></div>
                </div>

                <div class="calendar-events-panel">
                    <div class="events-header">
                        <span id="eventsTitle">Events</span>
                        <button class="add-event-btn" id="addEventBtn">+ Add Event</button>
                    </div>
                    <div class="events-list" id="eventsList">
                        <div class="no-events">Select a date to view events</div>
                    </div>
                </div>

                <!-- Event Dialog -->
                <div class="event-dialog-overlay" id="eventDialog">
                    <div class="event-dialog">
                        <div class="event-dialog-title">
                            <span id="dialogTitle">Add Event</span>
                            <button class="dialog-close" id="closeDialog">×</button>
                        </div>
                        <div class="event-dialog-body">
                            <div class="event-form-group">
                                <label>Title:</label>
                                <input type="text" id="eventTitle" class="event-input" maxlength="50">
                            </div>
                            <div class="event-form-group">
                                <label>Date:</label>
                                <input type="text" id="eventDate" class="event-input" readonly>
                            </div>
                            <div class="event-form-group">
                                <label>Time:</label>
                                <input type="text" id="eventTime" class="event-input" placeholder="e.g. 2:30 PM">
                            </div>
                            <div class="event-form-group">
                                <label>Description:</label>
                                <textarea id="eventDesc" class="event-textarea" rows="3" maxlength="200"></textarea>
                            </div>
                            <div class="event-form-group">
                                <label>Color:</label>
                                <div class="event-colors" id="eventColors">
                                    <div class="event-color selected" data-color="#0000ff" style="background:#0000ff"></div>
                                    <div class="event-color" data-color="#008000" style="background:#008000"></div>
                                    <div class="event-color" data-color="#ff0000" style="background:#ff0000"></div>
                                    <div class="event-color" data-color="#ff8000" style="background:#ff8000"></div>
                                    <div class="event-color" data-color="#800080" style="background:#800080"></div>
                                    <div class="event-color" data-color="#008080" style="background:#008080"></div>
                                </div>
                            </div>
                        </div>
                        <div class="event-dialog-buttons">
                            <button class="btn" id="saveEvent">Save</button>
                            <button class="btn" id="deleteEvent" style="display:none">Delete</button>
                            <button class="btn" id="cancelEvent">Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        // Navigation buttons
        this.addHandler(this.getElement('#prevMonth'), 'click', () => this.changeMonth(-1));
        this.addHandler(this.getElement('#nextMonth'), 'click', () => this.changeMonth(1));
        this.addHandler(this.getElement('#todayBtn'), 'click', () => this.goToToday());

        // Event dialog
        this.addHandler(this.getElement('#addEventBtn'), 'click', () => this.showEventDialog());
        this.addHandler(this.getElement('#closeDialog'), 'click', () => this.hideEventDialog());
        this.addHandler(this.getElement('#cancelEvent'), 'click', () => this.hideEventDialog());
        this.addHandler(this.getElement('#saveEvent'), 'click', () => this.saveEvent());
        this.addHandler(this.getElement('#deleteEvent'), 'click', () => this.deleteEvent());

        // Color picker
        this.addHandler(this.getElement('#eventColors'), 'click', (e) => {
            const color = e.target.closest('.event-color');
            if (color) {
                this.getElements('.event-color').forEach(c => c.classList.remove('selected'));
                color.classList.add('selected');
            }
        });

        // Calendar day clicks
        this.addHandler(this.getElement('#calendarDays'), 'click', (e) => {
            const day = e.target.closest('.cal-day');
            if (day && !day.classList.contains('other-month')) {
                const date = day.dataset.date;
                this.selectDate(date);
            }
        });

        // Double-click to add event
        this.addHandler(this.getElement('#calendarDays'), 'dblclick', (e) => {
            const day = e.target.closest('.cal-day');
            if (day && !day.classList.contains('other-month')) {
                const date = day.dataset.date;
                this.selectDate(date);
                this.showEventDialog();
            }
        });

        // Keyboard support — only fires while a Calendar window is focused.
        this.addHandler(document, 'keydown', (e) => {
            if (!this.isFocused()) return;

            if (e.key === 'Escape') {
                this.hideEventDialog();
            } else if (e.key === 'Enter' && this.getElement('#eventDialog').classList.contains('active')) {
                e.preventDefault();
                this.saveEvent();
            }
        });

        this.renderCalendar();
    }

    // --- Calendar Rendering ---

    renderCalendar() {
        const month = this.getInstanceState('currentMonth');
        const year = this.getInstanceState('currentYear');
        const events = this.getInstanceState('events');
        const selectedDate = this.getInstanceState('selectedDate');

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];

        this.getElement('#monthYear').textContent = `${monthNames[month]} ${year}`;

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const prevLastDay = new Date(year, month, 0);
        const startingDay = firstDay.getDay();
        const totalDays = lastDay.getDate();
        const prevDays = prevLastDay.getDate();

        const today = new Date();
        const todayStr = this.formatDate(today);

        let html = '';

        // Previous month days
        for (let i = startingDay - 1; i >= 0; i--) {
            const day = prevDays - i;
            const date = this.formatDate(new Date(year, month - 1, day));
            html += `<div class="cal-day other-month" data-date="${date}">${day}</div>`;
        }

        // Current month days
        for (let day = 1; day <= totalDays; day++) {
            const date = this.formatDate(new Date(year, month, day));
            const isToday = date === todayStr;
            const isSelected = date === selectedDate;
            const dayEvents = events.filter(e => e.date === date);

            let classes = 'cal-day';
            if (isToday) classes += ' today';
            if (isSelected) classes += ' selected';
            if (dayEvents.length > 0) classes += ' has-events';

            let eventDots = '';
            if (dayEvents.length > 0) {
                const dots = dayEvents.slice(0, 3).map(e =>
                    `<span class="event-dot" style="background:${e.color || '#0000ff'}"></span>`
                ).join('');
                eventDots = `<div class="event-dots">${dots}</div>`;
            }

            html += `<div class="${classes}" data-date="${date}">
                <span class="day-number">${day}</span>
                ${eventDots}
            </div>`;
        }

        // Next month days
        const totalCells = startingDay + totalDays;
        const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
        for (let day = 1; day <= remaining; day++) {
            const date = this.formatDate(new Date(year, month + 1, day));
            html += `<div class="cal-day other-month" data-date="${date}">${day}</div>`;
        }

        this.getElement('#calendarDays').innerHTML = html;
        this.updateEventsList();
    }

    changeMonth(delta) {
        this.playSound('click');
        let month = this.getInstanceState('currentMonth') + delta;
        let year = this.getInstanceState('currentYear');

        if (month < 0) {
            month = 11;
            year--;
        } else if (month > 11) {
            month = 0;
            year++;
        }

        this.setInstanceState('currentMonth', month);
        this.setInstanceState('currentYear', year);
        this.setInstanceState('selectedDate', null);
        this.renderCalendar();

        // Emit month changed event
        this.emitAppEvent('month:changed', {
            month: month,
            year: year
        });
    }

    goToToday() {
        const now = new Date();
        this.setInstanceState('currentMonth', now.getMonth());
        this.setInstanceState('currentYear', now.getFullYear());
        this.selectDate(this.formatDate(now));
        this.renderCalendar();
    }

    selectDate(date) {
        const previousDate = this.getInstanceState('selectedDate');
        this.setInstanceState('selectedDate', date);

        // Update UI
        this.getElements('.cal-day').forEach(day => {
            day.classList.toggle('selected', day.dataset.date === date);
        });

        this.updateEventsList();

        // Emit date selected event
        this.emitAppEvent('date:selected', {
            date: date,
            previousDate: previousDate
        });
    }

    // --- Events Management ---

    updateEventsList() {
        const selectedDate = this.getInstanceState('selectedDate');
        const events = this.getInstanceState('events');
        const listEl = this.getElement('#eventsList');
        const titleEl = this.getElement('#eventsTitle');

        if (!selectedDate) {
            listEl.innerHTML = '<div class="no-events">Select a date to view events</div>';
            titleEl.textContent = 'Events';
            return;
        }

        const dateObj = new Date(selectedDate + 'T00:00:00');
        const options = { weekday: 'short', month: 'short', day: 'numeric' };
        titleEl.textContent = `Events - ${dateObj.toLocaleDateString('en-US', options)}`;

        const dayEvents = events.filter(e => e.date === selectedDate);

        if (dayEvents.length === 0) {
            listEl.innerHTML = '<div class="no-events">No events for this day</div>';
            return;
        }

        // Sort by time
        dayEvents.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

        listEl.innerHTML = dayEvents.map(event => `
            <div class="event-item" data-id="${event.id}">
                <div class="event-color-bar" style="background:${event.color || '#0000ff'}"></div>
                <div class="event-info">
                    <div class="event-item-title">${escapeHtml(event.title)}</div>
                    ${event.time ? `<div class="event-item-time">🕐 ${escapeHtml(event.time)}</div>` : ''}
                    ${event.description ? `<div class="event-item-desc">${escapeHtml(event.description)}</div>` : ''}
                </div>
                <button class="event-edit-btn" data-id="${event.id}">✏️</button>
            </div>
        `).join('');

        // Add edit handlers
        this.getElements('.event-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editEvent(btn.dataset.id);
            });
        });
    }

    showEventDialog(event = null) {
        const selectedDate = this.getInstanceState('selectedDate');
        if (!selectedDate && !event) {
            this.selectDate(this.formatDate(new Date()));
        }

        const dialog = this.getElement('#eventDialog');
        const titleEl = this.getElement('#dialogTitle');
        const deleteBtn = this.getElement('#deleteEvent');

        if (event) {
            titleEl.textContent = 'Edit Event';
            deleteBtn.style.display = 'inline-block';
            this.setInstanceState('editingEventId', event.id);

            this.getElement('#eventTitle').value = event.title || '';
            this.getElement('#eventDate').value = event.date;
            this.getElement('#eventTime').value = event.time || '';
            this.getElement('#eventDesc').value = event.description || '';

            // Select color
            this.getElements('.event-color').forEach(c => {
                c.classList.toggle('selected', c.dataset.color === (event.color || '#0000ff'));
            });
        } else {
            titleEl.textContent = 'Add Event';
            deleteBtn.style.display = 'none';
            this.setInstanceState('editingEventId', null);

            this.getElement('#eventTitle').value = '';
            this.getElement('#eventDate').value = this.getInstanceState('selectedDate') || this.formatDate(new Date());
            this.getElement('#eventTime').value = '';
            this.getElement('#eventDesc').value = '';

            // Select first color
            this.getElements('.event-color').forEach((c, i) => {
                c.classList.toggle('selected', i === 0);
            });
        }

        dialog.classList.add('active');
        this.getElement('#eventTitle').focus();
    }

    hideEventDialog() {
        this.getElement('#eventDialog').classList.remove('active');
        this.setInstanceState('editingEventId', null);
    }

    editEvent(eventId) {
        const events = this.getInstanceState('events');
        const event = events.find(e => e.id === eventId);
        if (event) {
            this.showEventDialog(event);
        }
    }

    saveEvent() {
        const title = this.getElement('#eventTitle').value.trim();
        const date = this.getElement('#eventDate').value;
        const time = this.getElement('#eventTime').value.trim();
        const description = this.getElement('#eventDesc').value.trim();
        const colorEl = this.getElement('.event-color.selected');
        const color = colorEl ? colorEl.dataset.color : '#0000ff';

        if (!title) {
            this.playSound('error');
            this.getElement('#eventTitle').focus();
            return;
        }

        const events = this.getInstanceState('events');
        const editingId = this.getInstanceState('editingEventId');

        if (editingId) {
            // Update existing event
            const idx = events.findIndex(e => e.id === editingId);
            if (idx !== -1) {
                events[idx] = { ...events[idx], title, date, time, description, color };
            }
        } else {
            // Add new event
            events.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
                title,
                date,
                time,
                description,
                color,
                created: new Date().toISOString()
            });
        }

        this.setInstanceState('events', events);
        this.saveEvents(events);
        this.hideEventDialog();
        this.renderCalendar();
        this.playSound('click');

        // Emit event saved/created event
        if (editingId) {
            this.emitAppEvent('event:updated', { eventId: editingId, title, date, time });
        } else {
            this.emitAppEvent('event:created', { title, date, time, color });
        }
    }

    deleteEvent() {
        const editingId = this.getInstanceState('editingEventId');
        if (!editingId) return;

        let events = this.getInstanceState('events');
        events = events.filter(e => e.id !== editingId);

        this.setInstanceState('events', events);
        this.saveEvents(events);
        this.hideEventDialog();
        this.renderCalendar();
        this.playSound('click');

        // Emit event deleted event
        this.emitAppEvent('event:deleted', { eventId: editingId });
    }

    // --- Storage ---

    loadEvents() {
        try {
            const stored = localStorage.getItem('smos_calendar_events');
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    }

    saveEvents(events) {
        try {
            localStorage.setItem('smos_calendar_events', JSON.stringify(events));
        } catch (e) {
            console.error('Failed to save calendar events:', e);
        }
    }

    // --- Utilities ---

    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

}

export default Calendar;
