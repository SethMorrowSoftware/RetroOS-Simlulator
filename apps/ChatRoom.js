/**
 * Chat Room - 90s AOL/IRC Style Chat Room Simulator
 * Experience the golden age of internet chat!
 *
 * SCRIPTING SUPPORT:
 *   Commands: login, sendMessage, joinRoom, setNick, clear, addBot, removeBot,
 *             injectMessage, injectSystemMessage,
 *             simulateUserJoin, simulateUserLeave, setUserColor,
 *             scheduledMessage, setRoomTopic, lockRoom, unlockRoom,
 *             setBotResponses, reset
 *   Queries:  getStatus, getCurrentRoom, getUsers, getMessages, getRooms,
 *             getConfig, getRoomTopic
 *   Events:   app:chatroom:loggedIn, app:chatroom:messageSent,
 *             app:chatroom:messageReceived, app:chatroom:roomChanged,
 *             app:chatroom:userJoined, app:chatroom:userLeft,
 *             app:chatroom:roomLocked, app:chatroom:roomUnlocked,
 *             app:chatroom:topicChanged
 */

import AppBase from './AppBase.js';
import { escapeHtml, sanitizeCssColor } from '../core/Sanitize.js';
import StorageManager from '../core/StorageManager.js';
import MultiplayerClient from '../core/MultiplayerClient.js';
import PresenceManager from '../core/PresenceManager.js';

const CHATROOM_STORAGE_KEY = 'chatroom:state:v1';

class ChatRoom extends AppBase {
    constructor() {
        super({
            id: 'chatroom',
            name: 'Chat Room',
            icon: '💬',
            width: 760,
            height: 600,
            minWidth: 540,
            minHeight: 460,
            resizable: true,
            singleton: true,
            category: 'internet'
        });

        const saved = StorageManager.get(CHATROOM_STORAGE_KEY, {}) || {};
        this.username = '';
        this._savedUsername = typeof saved.username === 'string' ? saved.username : '';
        this._savedRoom = typeof saved.room === 'string' ? saved.room : 'lobby';
        this.currentRoom = this._savedRoom;
        this.messages = [];
        this.users = [];
        this.chatInterval = null;
        this.typingUsers = [];
        this.isLoggedIn = false;

        // Multiplayer mode (true when WebSocket is connected, false = bot simulation)
        this._multiplayerMode = false;
        this._mpUnsubscribers = [];

        // ARG scripting state
        this._roomLocked = false;
        this._roomTopic = '';
        this._customBotResponses = {};
        this._scheduledMessages = {};
        this._scheduleCounter = 0;

        // Simulated users with 90s-style usernames
        this.botUsers = [
            { name: 'CyberSurfer99', status: 'online', color: '#0000ff' },
            { name: 'xX_DarkAngel_Xx', status: 'online', color: '#800080' },
            { name: 'SkaterBoi2000', status: 'online', color: '#008000' },
            { name: 'PrincessSparkle', status: 'away', color: '#ff69b4' },
            { name: 'HackerMan_1337', status: 'online', color: '#ff0000' },
            { name: 'MoonDreamer', status: 'online', color: '#4169e1' },
            { name: 'RollerGirl88', status: 'online', color: '#ff6347' },
            { name: 'NeoMatrix', status: 'online', color: '#00ff00' },
            { name: 'ButterFly_Kisses', status: 'away', color: '#da70d6' },
            { name: 'GameMaster3000', status: 'online', color: '#ffa500' }
        ];

        // 90s-style chat messages
        this.botMessages = [
            "a/s/l?",
            "lol",
            "brb",
            "gtg mom needs the phone",
            "anyone want to trade pics?",
            "has anyone seen The Matrix? its so cool!",
            "my modem is so slow today :(",
            "LOL!!!",
            "sup everyone",
            "this chatroom is dead",
            "*~*~HeY eVeRyOnE~*~*",
            "does anyone have any good websites?",
            "check out my geocities page!",
            "anyone play Doom?",
            "brb phone",
            "lmao",
            "whos here from california?",
            "any1 wanna cyber? j/k j/k",
            "~*~LoVe AnD pEaCe~*~",
            "GET OFF THE PHONE MOM IM ONLINE",
            "omg that's hilarious",
            "rotfl",
            "hey does anyone have the cheat codes for GTA?",
            "my parents are gonna kill me im supposed to be asleep",
            "ICQ anyone? my number is 12345678",
            "*hugs*",
            "any cute girls here?",
            "lol n00b",
            "BRB gonna grab some pizza rolls",
            "man dial-up sucks",
            "anyone else get disconnected?",
            "I <3 this song on the radio rn",
            ":) :) :)",
            "jk jk",
            "nm u?",
            "www dot whatever dot com",
            "thats so 1337",
            "peace out yall",
            "this place is poppin tonight!"
        ];

        // Rooms
        this.rooms = [
            { name: 'lobby', label: 'Main Lobby', users: 23 },
            { name: 'teens', label: 'Teen Chat', users: 45 },
            { name: 'music', label: 'Music Lovers', users: 18 },
            { name: 'games', label: 'Gamers Zone', users: 31 },
            { name: 'romance', label: 'Romance Connection', users: 52 },
            { name: 'computers', label: 'Tech Talk', users: 12 }
        ];
    }

    onOpen() {
        const savedName = escapeHtml(this._savedUsername || '');
        return `
            <div class="chatroom-container">
                <div class="chatroom-login" id="loginScreen">
                    <div class="chatroom-login-box">
                        <div class="chatroom-login-marquee">
                            <marquee scrollamount="4">~*~ Welcome to IlluminatOS Chat — 56k modems welcome! ~*~ Please don't share your A/S/L with strangers! ~*~</marquee>
                        </div>
                        <div class="chatroom-login-title">Chat Sign-On</div>
                        <div class="chatroom-login-fields">
                            <label class="chatroom-login-field">
                                <span>Screen Name:</span>
                                <input type="text" class="chatroom-login-input" id="usernameInput" placeholder="CoolDude99" maxlength="20" value="${savedName}">
                            </label>
                            <label class="chatroom-login-field">
                                <span>Server:</span>
                                <input type="text" class="chatroom-login-input" value="irc.illuminatos.net" disabled>
                            </label>
                        </div>
                        <div class="chatroom-login-actions">
                            <button class="chatroom-login-btn" id="loginBtn">Enter Chat</button>
                            <button class="chatroom-login-btn chatroom-login-cancel" id="loginCancelBtn">Cancel</button>
                        </div>
                        <div class="chatroom-login-tip">
                            Tip: try <b>xX_Name_Xx</b> or <b>Name2000</b>. Be nice — admin is watching!
                        </div>
                    </div>
                </div>

                <div id="chatScreen" style="display: none; flex: 1; flex-direction: column;">
                    <div class="chatroom-header">
                        <span class="chatroom-header-title">💬 <span id="roomLabel">Main Lobby</span></span>
                        <span class="chatroom-header-marquee"><marquee scrollamount="3">~*~ Welcome to the chat! Be nice! Don't feed the trolls! ~*~</marquee></span>
                    </div>

                    <div class="chatroom-main">
                        <div class="chatroom-sidebar">
                            <div class="chatroom-rooms">
                                <div class="chatroom-rooms-title">📁 Rooms</div>
                                ${this.rooms.map(r => `
                                    <div class="chatroom-room ${r.name === 'lobby' ? 'active' : ''}" data-room="${r.name}">
                                        ${r.label} (${r.users})
                                    </div>
                                `).join('')}
                            </div>
                            <div class="chatroom-users">
                                <div class="chatroom-users-title">👥 Users Online</div>
                                <div id="userList"></div>
                            </div>
                        </div>

                        <div class="chatroom-content">
                            <div class="chatroom-messages" id="messages"></div>
                            <div class="chatroom-typing" id="typingIndicator"></div>
                            <div class="chatroom-emojis">
                                ${['😀', '😂', '😍', '😎', '🤔', '😢', '😡', '👍', '👎', '❤️', '💔', '🎉', '🔥', '💯'].map(e => `
                                    <span class="chatroom-emoji" data-emoji="${e}">${e}</span>
                                `).join('')}
                            </div>
                            <div class="chatroom-input-area">
                                <input type="text" class="chatroom-input" id="messageInput" placeholder="Type a message..." maxlength="200">
                                <button class="chatroom-send" id="sendBtn">Send</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    onMount() {
        // Login handlers
        this.addHandler(this.getElement('#loginBtn'), 'click', () => this.login());
        this.addHandler(this.getElement('#loginCancelBtn'), 'click', () => {
            this.playSound('click');
            const input = this.getElement('#usernameInput');
            if (input) input.value = '';
            input?.focus();
        });
        this.addHandler(this.getElement('#usernameInput'), 'keypress', (e) => {
            if (e.key === 'Enter') this.login();
        });

        // Chat handlers
        this.addHandler(this.getElement('#sendBtn'), 'click', () => this.sendMessage());
        this.addHandler(this.getElement('#messageInput'), 'keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        // Send typing indicator on input (multiplayer)
        this.addHandler(this.getElement('#messageInput'), 'input', () => {
            if (this._multiplayerMode) {
                PresenceManager.sendTyping(`app:chatroom:${this.currentRoom}`);
            }
        });

        // Room selection
        this.getElements('.chatroom-room').forEach(room => {
            this.addHandler(room, 'click', () => this.joinRoom(room.dataset.room));
        });

        // Emoji buttons
        this.getElements('.chatroom-emoji').forEach(emoji => {
            this.addHandler(emoji, 'click', () => {
                const input = this.getElement('#messageInput');
                if (input) {
                    input.value += emoji.dataset.emoji;
                    input.focus();
                }
            });
        });

        // Register scripting commands and queries
        this._registerScriptingCommands();

        // Focus username input
        setTimeout(() => {
            this.getElement('#usernameInput')?.focus();
        }, 100);
    }

    onClose() {
        if (this.chatInterval) {
            clearInterval(this.chatInterval);
        }
        // Clean up any scheduled message timeouts
        for (const id of Object.keys(this._scheduledMessages)) {
            clearTimeout(this._scheduledMessages[id].timeoutId);
        }
        this._scheduledMessages = {};

        // Clean up multiplayer subscriptions
        if (this._multiplayerMode) {
            const roomId = `app:chatroom:${this.currentRoom}`;
            MultiplayerClient.leaveRoom(roomId);
            for (const unsub of this._mpUnsubscribers) {
                unsub();
            }
            this._mpUnsubscribers = [];
            this._multiplayerMode = false;
        }

        this.isLoggedIn = false;
        this.messages = [];
    }

    /**
     * Setup multiplayer chat integration
     * Connects to WebSocket room and listens for real messages
     */
    _setupMultiplayer() {
        const roomId = `app:chatroom:${this.currentRoom}`;

        // Join the chat room on the WebSocket server
        MultiplayerClient.joinRoom(roomId);

        // Listen for real chat messages
        const unsubChat = MultiplayerClient.on('chat', (message) => {
            if (!message.payload || message.payload.roomId !== `app:chatroom:${this.currentRoom}`) return;

            const { displayName, text, messageType, userId } = message.payload;

            // Don't echo our own messages (server already sent them back)
            const myInfo = MultiplayerClient.getUserInfo();
            if (userId === myInfo.userId) return;

            if (messageType === 'action') {
                this.addActionMessage(displayName, text);
            } else {
                this.addMessage(displayName, text, '#0000aa');
            }
            this.emitAppEvent('messageReceived', { from: displayName, message: text, room: this.currentRoom });
        });

        // Listen for room member changes
        const unsubJoin = MultiplayerClient.on('room:member_joined', (message) => {
            if (message.payload?.roomId !== `app:chatroom:${this.currentRoom}`) return;
            const { displayName } = message.payload;
            this.addSystemMessage(`*** ${displayName} has entered the room ***`);
            this._refreshMultiplayerUserList();
        });

        const unsubLeave = MultiplayerClient.on('room:member_left', (message) => {
            if (message.payload?.roomId !== `app:chatroom:${this.currentRoom}`) return;
            const { displayName } = message.payload;
            this.addSystemMessage(`*** ${displayName} has left the room ***`);
            this._refreshMultiplayerUserList();
        });

        // Listen for typing indicators
        const unsubTyping = MultiplayerClient.on('presence:typing', (message) => {
            if (message.payload?.roomId !== `app:chatroom:${this.currentRoom}`) return;
            const { displayName } = message.payload;
            const indicator = this.getElement('#typingIndicator');
            if (indicator) {
                indicator.textContent = `${displayName} is typing...`;
                clearTimeout(this._typingClearTimer);
                this._typingClearTimer = setTimeout(() => {
                    if (indicator) indicator.textContent = '';
                }, 3000);
            }
        });

        this._mpUnsubscribers.push(unsubChat, unsubJoin, unsubLeave, unsubTyping);

        // Also start bots as optional company (fewer, less frequent)
        if (this.users.length <= 1) {
            this.users.push(...this.getRandomUsers(2));
            this.updateUserList();
        }
    }

    /**
     * Refresh user list from multiplayer room members
     */
    _refreshMultiplayerUserList() {
        // Keep the local user + any connected real users
        // The room info will be updated next time we get it from server
        // For now, just request it
        MultiplayerClient.send({
            type: 'room',
            payload: { action: 'info', roomId: `app:chatroom:${this.currentRoom}` }
        });
    }

    login(nameOverride) {
        const input = this.getElement('#usernameInput');
        const name = nameOverride || input?.value.trim();

        if (!name) {
            this.alert('Please enter a screen name!');
            return;
        }

        this.username = name;
        this.isLoggedIn = true;
        this._persistState();
        this.playSound('startup');

        // Hide login, show chat
        const loginScreen = this.getElement('#loginScreen');
        const chatScreen = this.getElement('#chatScreen');

        if (loginScreen) loginScreen.style.display = 'none';
        if (chatScreen) {
            chatScreen.style.display = 'flex';
        }

        // Apply saved room (default lobby)
        if (this._savedRoom && this._savedRoom !== this.currentRoom) {
            this.currentRoom = this._savedRoom;
        }
        // Sync room highlight
        this.getElements('.chatroom-room').forEach(el => {
            el.classList.toggle('active', el.dataset.room === this.currentRoom);
        });
        const room = this.rooms.find(r => r.name === this.currentRoom) || this.rooms[0];
        const label = this.getElement('#roomLabel');
        if (label) label.textContent = room.label;

        // Initialize users
        this.users = [
            { name: this.username, status: 'online', color: '#000', isUser: true },
            ...this.getRandomUsers(5)
        ];

        this.updateUserList();

        // Add welcome messages
        this.addSystemMessage(`*** Welcome to ${room.label}! ***`);
        this.addSystemMessage(`*** ${this.username} has entered the room ***`);

        // Emit login event
        this.emitAppEvent('loggedIn', { username: this.username, room: this.currentRoom });

        // Check if multiplayer is available
        if (MultiplayerClient.isConnected()) {
            this._multiplayerMode = true;
            this._setupMultiplayer();
            this.addSystemMessage('*** Connected to live chat! ***');
        } else {
            // Start bot chat simulation (fallback)
            this._multiplayerMode = false;
            this.startBotChat();
        }
    }

    getRandomUsers(count) {
        const shuffled = [...this.botUsers].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, count);
    }

    startBotChat() {
        // Random bot messages at intervals
        this.chatInterval = setInterval(() => {
            if (Math.random() < 0.4) {
                this.sendBotMessage();
            }

            // Occasionally show typing indicator
            if (Math.random() < 0.2) {
                this.showTypingIndicator();
            }

            // Occasionally have user join/leave
            if (Math.random() < 0.1) {
                this.simulateUserActivity();
            }
        }, 3000);
    }

    sendBotMessage() {
        const onlineUsers = this.users.filter(u => !u.isUser && u.status === 'online');
        if (onlineUsers.length === 0) return;

        const user = onlineUsers[Math.floor(Math.random() * onlineUsers.length)];
        const message = this.botMessages[Math.floor(Math.random() * this.botMessages.length)];

        this.addMessage(user.name, message, user.color);
        this.emitAppEvent('messageReceived', { from: user.name, message, room: this.currentRoom });
    }

    showTypingIndicator() {
        const onlineUsers = this.users.filter(u => !u.isUser && u.status === 'online');
        if (onlineUsers.length === 0) return;

        const user = onlineUsers[Math.floor(Math.random() * onlineUsers.length)];
        const indicator = this.getElement('#typingIndicator');

        if (indicator) {
            indicator.textContent = `${user.name} is typing...`;
            setTimeout(() => {
                indicator.textContent = '';
            }, 2000);
        }
    }

    simulateUserActivity() {
        if (Math.random() < 0.5 && this.users.length > 3) {
            // User leaves
            const botUsers = this.users.filter(u => !u.isUser);
            if (botUsers.length > 2) {
                const leaving = botUsers[Math.floor(Math.random() * botUsers.length)];
                this.users = this.users.filter(u => u.name !== leaving.name);
                this.addSystemMessage(`*** ${leaving.name} has left the room ***`);
                this.updateUserList();
                this.emitAppEvent('userLeft', { username: leaving.name, room: this.currentRoom });
            }
        } else {
            // New user joins
            const availableUsers = this.botUsers.filter(bu =>
                !this.users.find(u => u.name === bu.name)
            );
            if (availableUsers.length > 0) {
                const joining = availableUsers[Math.floor(Math.random() * availableUsers.length)];
                this.users.push({ ...joining });
                this.addSystemMessage(`*** ${joining.name} has entered the room ***`);
                this.updateUserList();
                this.emitAppEvent('userJoined', { username: joining.name, room: this.currentRoom });
            }
        }
    }

    sendMessage(messageOverride) {
        const input = this.getElement('#messageInput');
        const message = messageOverride || input?.value.trim();

        if (!message) return;

        this.playSound('click');

        // Check for action commands
        if (message.startsWith('/me ')) {
            this.addActionMessage(this.username, message.slice(4));
        } else if (message.startsWith('/')) {
            this.handleCommand(message);
        } else {
            this.addMessage(this.username, message, '#000', true);
            this.emitAppEvent('messageSent', { username: this.username, message, room: this.currentRoom });
        }

        if (input) input.value = '';

        // In multiplayer mode, send via WebSocket (messages come back via handler)
        if (this._multiplayerMode) {
            const roomId = `app:chatroom:${this.currentRoom}`;
            MultiplayerClient.sendChat(roomId, message, message.startsWith('/me ') ? 'action' : 'message');
            // Send typing stop
            return;
        }

        // Bot might respond (single-player fallback only)
        if (Math.random() < 0.3) {
            setTimeout(() => {
                this.sendBotResponse(message);
            }, 1500 + Math.random() * 2000);
        }
    }

    handleCommand(message) {
        const [cmd, ...args] = message.slice(1).split(' ');

        switch (cmd.toLowerCase()) {
            case 'help':
                this.addSystemMessage('Commands: /me [action], /nick [name], /clear, /users');
                break;
            case 'nick':
                if (args[0]) {
                    const oldName = this.username;
                    this.username = args.join(' ');
                    const user = this.users.find(u => u.isUser);
                    if (user) user.name = this.username;
                    this.addSystemMessage(`*** ${oldName} is now known as ${this.username} ***`);
                    this.updateUserList();
                }
                break;
            case 'clear':
                const messages = this.getElement('#messages');
                if (messages) messages.innerHTML = '';
                break;
            case 'users':
                this.addSystemMessage(`Users in room: ${this.users.map(u => u.name).join(', ')}`);
                break;
            default:
                this.addSystemMessage(`Unknown command: ${cmd}`);
        }
    }

    sendBotResponse(userMessage) {
        const onlineUsers = this.users.filter(u => !u.isUser && u.status === 'online');
        if (onlineUsers.length === 0) return;

        const user = onlineUsers[Math.floor(Math.random() * onlineUsers.length)];
        const lowerMsg = userMessage.toLowerCase();

        let response;

        // Context-aware responses
        if (lowerMsg.includes('hi') || lowerMsg.includes('hey') || lowerMsg.includes('hello')) {
            response = ['hey!', 'hi there!', 'sup!', `hey ${this.username}!`, 'hello :)'][Math.floor(Math.random() * 5)];
        } else if (lowerMsg.includes('?')) {
            response = ['idk', 'lol dunno', 'maybe?', 'ask someone else', 'good question'][Math.floor(Math.random() * 5)];
        } else if (lowerMsg.includes('lol') || lowerMsg.includes('lmao')) {
            response = ['lol', 'haha', 'rofl', '😂', 'lmao'][Math.floor(Math.random() * 5)];
        } else if (lowerMsg.includes('bye') || lowerMsg.includes('gtg')) {
            response = ['cya!', 'bye!', 'peace out', 'later!', 'ttyl'][Math.floor(Math.random() * 5)];
        } else {
            // Random response
            response = this.botMessages[Math.floor(Math.random() * this.botMessages.length)];
        }

        this.addMessage(user.name, response, user.color);
    }

    addMessage(username, text, color = '#000', isUser = false) {
        const messagesEl = this.getElement('#messages');
        if (!messagesEl) return;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const entry = { type: 'message', username, text, color, time, isUser, timestamp: Date.now() };
        this.messages.push(entry);

        // Highlight mentions of the current user
        const mention = this.username && new RegExp(`\\b${this.username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);

        const div = document.createElement('div');
        div.className = `chatroom-message${isUser ? ' chatroom-message-self' : ''}${mention && !isUser ? ' chatroom-message-mention' : ''}`;
        div.innerHTML = `
            <span class="chatroom-message-time">[${time}]</span>
            <span class="chatroom-message-user" style="color: ${sanitizeCssColor(color)};">${escapeHtml(username)}:</span>
            <span class="chatroom-message-text">${escapeHtml(text)}</span>
        `;

        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        // Subtle notify when a message arrives from someone else; louder for mentions
        if (!isUser) {
            this.playSound(mention ? 'notify' : 'click');
        }
    }

    addSystemMessage(text) {
        const messagesEl = this.getElement('#messages');
        if (!messagesEl) return;

        const entry = { type: 'system', text, timestamp: Date.now() };
        this.messages.push(entry);

        const div = document.createElement('div');
        div.className = 'chatroom-message chatroom-message-system';
        div.textContent = text;

        messagesEl.appendChild(div);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    addActionMessage(username, action) {
        const messages = this.getElement('#messages');
        if (!messages) return;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const div = document.createElement('div');
        div.className = 'chatroom-message chatroom-message-action';
        div.innerHTML = `
            <span class="chatroom-message-time">[${time}]</span>
            * ${escapeHtml(username)} ${escapeHtml(action)}
        `;

        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    joinRoom(roomName) {
        const room = this.rooms.find(r => r.name === roomName);
        if (!room) return;

        // Check if room switching is locked (ARG confinement)
        if (this._roomLocked && roomName !== this.currentRoom) {
            this.addSystemMessage('*** You cannot leave this room right now ***');
            this.playSound('error');
            return;
        }

        if (roomName === this.currentRoom) {
            this.playSound('click');
            return;
        }

        this.playSound('click');
        const previousRoom = this.currentRoom;

        // In multiplayer mode, leave old room and join new one
        if (this._multiplayerMode) {
            MultiplayerClient.leaveRoom(`app:chatroom:${previousRoom}`);
            MultiplayerClient.joinRoom(`app:chatroom:${roomName}`);
        }

        this.currentRoom = roomName;

        // Update active room style
        this.getElements('.chatroom-room').forEach(el => {
            el.classList.toggle('active', el.dataset.room === roomName);
        });

        // Update header
        const label = this.getElement('#roomLabel');
        if (label) label.textContent = room.label;

        // Clear messages and add join message
        const messagesEl = this.getElement('#messages');
        if (messagesEl) messagesEl.innerHTML = '';
        this.messages = [];

        // Get new random users for this room
        this.users = [
            { name: this.username, status: 'online', color: '#000', isUser: true },
            ...this.getRandomUsers(3 + Math.floor(Math.random() * 5))
        ];

        this.updateUserList();
        this.addSystemMessage(`*** You have joined ${room.label} ***`);
        this.addSystemMessage(`*** ${this.username} has entered the room ***`);

        this._persistState();
        this.emitAppEvent('roomChanged', { room: roomName, previousRoom, label: room.label });
    }

    _persistState() {
        StorageManager.set(CHATROOM_STORAGE_KEY, {
            username: this.username || this._savedUsername || '',
            room: this.currentRoom
        });
    }

    updateUserList() {
        const list = this.getElement('#userList');
        if (!list) return;

        // status feeds a class attribute and is script-settable — allow
        // only known states.
        const safeStatus = (s) => ['online', 'away', 'busy', 'idle', 'offline'].includes(s) ? s : 'online';
        list.innerHTML = this.users.map(u => `
            <div class="chatroom-user">
                <span class="chatroom-user-status ${safeStatus(u.status)}"></span>
                <span style="color: ${sanitizeCssColor(u.color)};">${u.isUser ? `<b>${escapeHtml(u.name)}</b>` : escapeHtml(u.name)}</span>
            </div>
        `).join('');
    }

    // ===== SCRIPTING SUPPORT =====

    _registerScriptingCommands() {
        // COMMAND: Log in with a username
        this.registerCommand('login', (payload) => {
            if (this.isLoggedIn) {
                return { success: false, error: 'Already logged in' };
            }
            const username = payload.username || payload.name;
            if (!username) {
                return { success: false, error: 'Username required' };
            }
            this.login(username);
            return { success: true, username: this.username, room: this.currentRoom };
        });

        // COMMAND: Send a chat message
        this.registerCommand('sendMessage', (payload) => {
            if (!this.isLoggedIn) {
                return { success: false, error: 'Not logged in' };
            }
            const message = payload.message || payload.text;
            if (!message) {
                return { success: false, error: 'Message required' };
            }
            this.sendMessage(message);
            return { success: true, message };
        });

        // COMMAND: Join a room
        this.registerCommand('joinRoom', (payload) => {
            if (!this.isLoggedIn) {
                return { success: false, error: 'Not logged in' };
            }
            const room = payload.room || payload.name;
            if (!room) {
                return { success: false, error: 'Room name required' };
            }
            const roomObj = this.rooms.find(r => r.name === room || r.label === room);
            if (!roomObj) {
                return { success: false, error: `Room not found: ${room}` };
            }
            this.joinRoom(roomObj.name);
            return { success: true, room: roomObj.name, label: roomObj.label };
        });

        // COMMAND: Change nickname
        this.registerCommand('setNick', (payload) => {
            if (!this.isLoggedIn) {
                return { success: false, error: 'Not logged in' };
            }
            const name = payload.name || payload.nick;
            if (!name) {
                return { success: false, error: 'Name required' };
            }
            const oldName = this.username;
            this.username = name;
            const user = this.users.find(u => u.isUser);
            if (user) user.name = this.username;
            this.addSystemMessage(`*** ${oldName} is now known as ${this.username} ***`);
            this.updateUserList();
            return { success: true, oldName, newName: this.username };
        });

        // COMMAND: Clear message history
        this.registerCommand('clear', () => {
            const messagesEl = this.getElement('#messages');
            if (messagesEl) messagesEl.innerHTML = '';
            this.messages = [];
            return { success: true };
        });

        // COMMAND: Add a bot user to the room
        this.registerCommand('addBot', (payload) => {
            const name = payload.name;
            if (!name) {
                return { success: false, error: 'Bot name required' };
            }
            if (this.users.find(u => u.name === name)) {
                return { success: false, error: 'User already in room' };
            }
            const bot = {
                name,
                status: payload.status || 'online',
                color: payload.color || '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
            };
            this.users.push(bot);
            this.addSystemMessage(`*** ${name} has entered the room ***`);
            this.updateUserList();
            this.emitAppEvent('userJoined', { username: name, room: this.currentRoom });
            return { success: true, bot };
        });

        // COMMAND: Remove a bot user from the room
        this.registerCommand('removeBot', (payload) => {
            const name = payload.name;
            if (!name) {
                return { success: false, error: 'Bot name required' };
            }
            const idx = this.users.findIndex(u => u.name === name && !u.isUser);
            if (idx === -1) {
                return { success: false, error: 'Bot not found' };
            }
            this.users.splice(idx, 1);
            this.addSystemMessage(`*** ${name} has left the room ***`);
            this.updateUserList();
            this.emitAppEvent('userLeft', { username: name, room: this.currentRoom });
            return { success: true };
        });

        // COMMAND: Inject a message from any user
        this.registerCommand('injectMessage', (payload) => {
            const from = payload.from || 'Anonymous';
            const message = payload.message || payload.text;
            if (!message) {
                return { success: false, error: 'Message required' };
            }
            const color = payload.color || '#000';
            this.addMessage(from, message, color);
            this.emitAppEvent('messageReceived', { from, message, room: this.currentRoom });
            return { success: true };
        });

        // COMMAND: Inject a system message
        this.registerCommand('injectSystemMessage', (payload) => {
            const message = payload.message || payload.text;
            if (!message) {
                return { success: false, error: 'Message required' };
            }
            this.addSystemMessage(message);
            return { success: true };
        });

        // QUERY: Get current status
        this.registerQuery('getStatus', () => {
            return {
                loggedIn: this.isLoggedIn,
                username: this.username || null,
                room: this.currentRoom,
                userCount: this.users.length
            };
        });

        // QUERY: Get current room info
        this.registerQuery('getCurrentRoom', () => {
            const room = this.rooms.find(r => r.name === this.currentRoom);
            return {
                name: this.currentRoom,
                label: room ? room.label : this.currentRoom,
                userCount: this.users.length
            };
        });

        // QUERY: Get users in current room
        this.registerQuery('getUsers', () => {
            return this.users.map(u => ({
                name: u.name,
                status: u.status,
                isUser: !!u.isUser,
                color: u.color
            }));
        });

        // QUERY: Get recent messages
        this.registerQuery('getMessages', (payload) => {
            const count = (payload && payload.count) || 50;
            return this.messages.slice(-count);
        });

        // QUERY: Get available rooms
        this.registerQuery('getRooms', () => {
            return this.rooms.map(r => ({
                name: r.name,
                label: r.label,
                users: r.users,
                active: r.name === this.currentRoom
            }));
        });

        // ===== ARG SCRIPTING COMMANDS =====

        // COMMAND: Simulate a user joining the room
        this.registerCommand('simulateUserJoin', (payload) => {
            const name = payload.name || payload.username;
            if (!name) return { success: false, error: 'User name required' };
            if (this.users.find(u => u.name === name)) {
                return { success: false, error: 'User already in room' };
            }
            const user = {
                name,
                status: payload.status || 'online',
                color: payload.color || '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
            };
            this.users.push(user);
            this.addSystemMessage(`*** ${name} has entered the room ***`);
            this.updateUserList();
            this.emitAppEvent('userJoined', { username: name, room: this.currentRoom });
            return { success: true, user };
        });

        // COMMAND: Simulate a user leaving the room
        this.registerCommand('simulateUserLeave', (payload) => {
            const name = payload.name || payload.username;
            if (!name) return { success: false, error: 'User name required' };
            const idx = this.users.findIndex(u => u.name === name && !u.isUser);
            if (idx === -1) return { success: false, error: 'User not found or is the player' };
            this.users.splice(idx, 1);
            const leaveMsg = payload.message || `*** ${name} has left the room ***`;
            this.addSystemMessage(leaveMsg);
            this.updateUserList();
            this.emitAppEvent('userLeft', { username: name, room: this.currentRoom });
            return { success: true };
        });

        // COMMAND: Set a user's chat color
        this.registerCommand('setUserColor', (payload) => {
            const name = payload.name || payload.username;
            const color = payload.color;
            if (!name || !color) return { success: false, error: 'Name and color required' };
            const user = this.users.find(u => u.name === name);
            if (!user) return { success: false, error: 'User not found' };
            user.color = color;
            return { success: true, name, color };
        });

        // COMMAND: Schedule a message from a user after a delay
        this.registerCommand('scheduledMessage', (payload) => {
            const from = payload.from || payload.username;
            const message = payload.message || payload.text;
            const delay = payload.delay || 5000;
            if (!from || !message) return { success: false, error: 'From and message required' };

            const id = 'sched_' + (++this._scheduleCounter);
            const color = payload.color || '#000';
            const timeoutId = setTimeout(() => {
                delete this._scheduledMessages[id];
                if (this.isLoggedIn) {
                    this.addMessage(from, message, color);
                    this.emitAppEvent('messageReceived', { from, message, room: this.currentRoom });
                }
            }, delay);
            this._scheduledMessages[id] = { timeoutId, from, message, delay };
            return { success: true, id };
        });

        // COMMAND: Set room topic/header text
        this.registerCommand('setRoomTopic', (payload) => {
            const topic = payload.topic || payload.text || '';
            this._roomTopic = topic;
            // Update topic display if it exists
            const topicEl = this.getElement('#roomTopic');
            if (topicEl) {
                topicEl.textContent = topic;
                topicEl.style.display = topic ? 'block' : 'none';
            }
            this.addSystemMessage(`*** Topic is now: ${topic} ***`);
            this.emitAppEvent('topicChanged', { topic, room: this.currentRoom });
            return { success: true, topic };
        });

        // COMMAND: Lock room - prevent user from switching rooms
        this.registerCommand('lockRoom', () => {
            this._roomLocked = true;
            // Add locked CSS class to room items
            this.getElements('.chatroom-room').forEach(el => {
                if (el.dataset.room !== this.currentRoom) {
                    el.classList.add('locked');
                }
            });
            this.emitAppEvent('roomLocked', { room: this.currentRoom });
            return { success: true, room: this.currentRoom };
        });

        // COMMAND: Unlock room - allow user to switch rooms
        this.registerCommand('unlockRoom', () => {
            this._roomLocked = false;
            this.getElements('.chatroom-room').forEach(el => {
                el.classList.remove('locked');
            });
            this.emitAppEvent('roomUnlocked', { room: this.currentRoom });
            return { success: true };
        });

        // COMMAND: Set custom bot responses for a specific user
        this.registerCommand('setBotResponses', (payload) => {
            const name = payload.name || payload.username;
            const responses = payload.responses;
            if (!name || !responses || !Array.isArray(responses)) {
                return { success: false, error: 'Name and responses array required' };
            }
            this._customBotResponses[name] = responses;
            return { success: true, name };
        });

        // COMMAND: Full state reset
        this.registerCommand('reset', () => {
            // Cancel scheduled messages
            for (const id of Object.keys(this._scheduledMessages)) {
                clearTimeout(this._scheduledMessages[id].timeoutId);
            }
            this._scheduledMessages = {};
            this._customBotResponses = {};
            this._roomLocked = false;
            this._roomTopic = '';
            this.messages = [];
            const messagesEl = this.getElement('#messages');
            if (messagesEl) messagesEl.innerHTML = '';
            return { success: true };
        });

        // QUERY: Get config state
        this.registerQuery('getConfig', () => {
            return {
                loggedIn: this.isLoggedIn,
                username: this.username || null,
                room: this.currentRoom,
                roomLocked: this._roomLocked,
                roomTopic: this._roomTopic,
                userCount: this.users.length,
                messageCount: this.messages.length,
                customBotResponseCount: Object.keys(this._customBotResponses).length,
                scheduledMessages: Object.keys(this._scheduledMessages).length
            };
        });

        // QUERY: Get room topic
        this.registerQuery('getRoomTopic', () => {
            return { topic: this._roomTopic, room: this.currentRoom };
        });
    }
}

export default ChatRoom;
