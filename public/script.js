/* ========================================
   DOODLESNAP — COMPLETE MULTIPLAYER CLIENT
   ======================================== */

const socket = io();

let currentRoom = null;
let currentUser = null; // { username, userTag, friends: [] }
let isDrawer = false;
let isDrawing = false;
let currentTool = "brush"; // "brush" | "fill" | "eraser"
let currentBrushType = "round"; // "round" | "crayon" | "calligraphy"
let lastX = 0;
let lastY = 0;
let onlineTagsSet = new Set();

// Audio Settings (Persistent via localStorage)
let soundEnabled = localStorage.getItem("doodlesnap_sfx") !== "false";
let musicEnabled = localStorage.getItem("doodlesnap_music") === "true";

// DOM Elements - Screens
const authScreen = document.getElementById("authScreen");
const homeScreen = document.getElementById("homeScreen");
const gameScreen = document.getElementById("gameScreen");

// Auth Elements
const tabLoginBtn = document.getElementById("tabLoginBtn");
const tabRegisterBtn = document.getElementById("tabRegisterBtn");
const authForm = document.getElementById("authForm");
const authUsername = document.getElementById("authUsername");
const authPassword = document.getElementById("authPassword");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authMessage = document.getElementById("authMessage");
let isLoginMode = true;

// Top Nav
const userProfileBadge = document.getElementById("userProfileBadge");
const profileDisplayName = document.getElementById("profileDisplayName");
const profileUserTag = document.getElementById("profileUserTag");
const logoutBtn = document.getElementById("logoutBtn");
const soundToggleBtn = document.getElementById("soundToggleBtn");
const musicToggleBtn = document.getElementById("musicToggleBtn");

// Lobby Elements
const messageEl = document.getElementById("message");
const publicBtn = document.getElementById("publicBtn");
const privateBtn = document.getElementById("privateBtn");
const roomCodeInput = document.getElementById("roomCodeInput");
const joinBtn = document.getElementById("joinBtn");
const savedFriendsList = document.getElementById("savedFriendsList");
const onlineFriendsCount = document.getElementById("onlineFriendsCount");
const addFriendForm = document.getElementById("addFriendForm");
const manualFriendInput = document.getElementById("manualFriendInput");

// Game Room Elements
const leaveBtn = document.getElementById("leaveBtn");
const copyInviteBtn = document.getElementById("copyInviteBtn");
const roomInfo = document.getElementById("roomInfo");
const roundLabel = document.getElementById("roundLabel");
const gameProgressBadge = document.getElementById("gameProgressBadge");
const roleInfo = document.getElementById("roleInfo");
const wordInfo = document.getElementById("wordInfo");
const timerInfo = document.getElementById("timerInfo");
const playerList = document.getElementById("playerList");
const playerCount = document.getElementById("playerCount");
const gameOverPanel = document.getElementById("gameOverPanel");
const gameOverTitle = document.getElementById("gameOverTitle");
const gameOverText = document.getElementById("gameOverText");
const backHomeBtn = document.getElementById("backHomeBtn");

// Invite Modal Elements
const inviteModal = document.getElementById("inviteModal");
const inviterName = document.getElementById("inviterName");
const inviteRoomCode = document.getElementById("inviteRoomCode");
const acceptInviteBtn = document.getElementById("acceptInviteBtn");
const declineInviteBtn = document.getElementById("declineInviteBtn");

// Canvas & Enhanced Toolbar Elements
const canvas = document.getElementById("drawingCanvas");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const toolbar = document.querySelector(".toolbar");
const toolBrushBtn = document.getElementById("toolBrushBtn");
const toolFillBtn = document.getElementById("toolFillBtn");
const eraserBtn = document.getElementById("eraserBtn");
const brushTypeSelect = document.getElementById("brushTypeSelect");
const brushColor = document.getElementById("brushColor");
const brushSize = document.getElementById("brushSize");
const colorSwatches = document.getElementById("colorSwatches");
const clearCanvasBtn = document.getElementById("clearCanvas");

// Chat & Emoji Elements
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const emojiButton = document.getElementById("emojiButton");
const emojiPicker = document.getElementById("emojiPicker");

ctx.lineCap = "round";
ctx.lineJoin = "round";

/* ========================================
   CUSTOM AUDIO FILE BGM SYSTEM (/bgm.mp3)
   ======================================== */
const bgMusic = new Audio("/bgm.mp3");
bgMusic.loop = true;
bgMusic.volume = 0.3;

function startMusic() {
    if (!musicEnabled) return;
    bgMusic.play().catch((err) => {
        console.log("Audio waiting for user click:", err);
    });
}

function stopMusic() {
    bgMusic.pause();
    bgMusic.currentTime = 0;
}

/* ========================================
   WEB AUDIO SOUND EFFECTS ENGINE (SFX)
   ======================================== */
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
    if (!audioCtx && AudioContextClass) audioCtx = new AudioContextClass();
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}

function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (!audioCtx) return;

    const now = audioCtx.currentTime;

    if (type === "tick") {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
    } else if (type === "fill") {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
    } else if (type === "correct") {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.frequency.setValueAtTime(freq, now + idx * 0.08);
            gain.gain.setValueAtTime(0.12, now + idx * 0.08);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + idx * 0.08);
            osc.stop(now + idx * 0.08 + 0.25);
        });
    } else if (type === "invite") {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
    } else if (type === "gameover") {
        [440, 554.37, 659.25, 880].forEach((freq, idx) => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, now + idx * 0.15);
            gain.gain.setValueAtTime(0.2, now + idx * 0.15);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.15 + 0.4);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now + idx * 0.15);
            osc.stop(now + idx * 0.15 + 0.4);
        });
    }
}

// Audio UI Toggles
soundToggleBtn.textContent = soundEnabled ? "🔊 SFX: ON" : "🔇 SFX: OFF";
musicToggleBtn.textContent = musicEnabled ? "🎵 Music: ON" : "🎵 Music: OFF";
musicToggleBtn.classList.toggle("active", musicEnabled);

soundToggleBtn.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem("doodlesnap_sfx", soundEnabled);
    soundToggleBtn.textContent = soundEnabled ? "🔊 SFX: ON" : "🔇 SFX: OFF";
    initAudio();
});

musicToggleBtn.addEventListener("click", () => {
    musicEnabled = !musicEnabled;
    localStorage.setItem("doodlesnap_music", musicEnabled);
    musicToggleBtn.textContent = musicEnabled ? "🎵 Music: ON" : "🎵 Music: OFF";
    musicToggleBtn.classList.toggle("active", musicEnabled);

    if (musicEnabled) {
        startMusic();
    } else {
        stopMusic();
    }
});

/* ========================================
   AUTHENTICATION UI LOGIC
   ======================================== */
tabLoginBtn.addEventListener("click", () => {
    isLoginMode = true;
    tabLoginBtn.classList.add("active");
    tabRegisterBtn.classList.remove("active");
    authSubmitBtn.textContent = "Login";
    authMessage.textContent = "";
});

tabRegisterBtn.addEventListener("click", () => {
    isLoginMode = false;
    tabRegisterBtn.classList.add("active");
    tabLoginBtn.classList.remove("active");
    authSubmitBtn.textContent = "Create Account";
    authMessage.textContent = "";
});

authForm.addEventListener("submit", (e) => {
    e.preventDefault();
    initAudio();
    if (musicEnabled) startMusic();

    const username = authUsername.value.trim();
    const password = authPassword.value.trim();

    if (isLoginMode) {
        socket.emit("auth_login", { username, password });
    } else {
        socket.emit("auth_register", { username, password });
    }
});

socket.on("auth_response", (data) => {
    if (data.success) {
        authMessage.className = "auth-status success";
        authMessage.textContent = data.message;

        currentUser = data.user;
        localStorage.setItem("doodlesnap_session", JSON.stringify(data.user));

        setTimeout(() => setupLoggedInView(currentUser), 500);
    } else {
        authMessage.className = "auth-status error";
        authMessage.textContent = data.message;
    }
});

function setupLoggedInView(user) {
    authScreen.classList.add("hidden");
    homeScreen.classList.remove("hidden");
    userProfileBadge.classList.remove("hidden");

    profileDisplayName.textContent = user.username;
    profileUserTag.textContent = user.userTag;

    socket.emit("user_online_login", { userTag: user.userTag });
    renderFriendsList(user.friends || []);

    if (musicEnabled) {
        startMusic();
    }
}

logoutBtn.addEventListener("click", () => {
    stopMusic();
    localStorage.removeItem("doodlesnap_session");
    window.location.reload();
});

const savedSession = localStorage.getItem("doodlesnap_session");
if (savedSession) {
    try {
        currentUser = JSON.parse(savedSession);
        setupLoggedInView(currentUser);
    } catch (e) {
        localStorage.removeItem("doodlesnap_session");
    }
}

/* ========================================
   FRIEND SYSTEM & ONLINE PRESENCE
   ======================================== */
function renderFriendsList(friends) {
    if (!currentUser) return;
    currentUser.friends = friends;
    savedFriendsList.innerHTML = "";

    if (!friends || friends.length === 0) {
        savedFriendsList.innerHTML = `<li class="empty-notice">No friends added yet. Share your Tag with friends!</li>`;
        onlineFriendsCount.textContent = "0";
        return;
    }

    let onlineCount = 0;

    friends.forEach((friendTag) => {
        const isOnline = onlineTagsSet.has(friendTag.toLowerCase());
        if (isOnline) onlineCount++;

        const li = document.createElement("li");
        li.innerHTML = `
            <div class="friend-item-left">
                <span class="status-indicator ${isOnline ? "online" : "offline"}" title="${isOnline ? "Online" : "Offline"}"></span>
                <span><b>${friendTag}</b> <small style="color:var(--muted)">(${isOnline ? "Online" : "Offline"})</small></span>
            </div>
            <div class="friend-actions">
                ${isOnline ? `<button class="invite-friend-btn" onclick="sendInvite('${friendTag}')">Invite</button>` : ""}
                <button class="remove-friend-btn" title="Remove friend" onclick="removeFriend('${friendTag}')">✕</button>
            </div>
        `;
        savedFriendsList.appendChild(li);
    });

    onlineFriendsCount.textContent = onlineCount;
}

window.sendInvite = function (friendTag) {
    if (!currentRoom) {
        alert("Please create or join a room first, then invite your friends to it!");
        return;
    }
    socket.emit("invite_friend_tag", { friendTag, roomCode: currentRoom });
};

window.removeFriend = function (friendTag) {
    if (confirm(`Remove ${friendTag} from your permanent friends?`)) {
        socket.emit("remove_friend_by_tag", { targetTag: friendTag });
    }
};

window.addPlayerFriend = function (playerTag) {
    socket.emit("add_friend_by_tag", { targetTag: playerTag });
};

addFriendForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const tag = manualFriendInput.value.trim();
    if (tag) {
        socket.emit("add_friend_by_tag", { targetTag: tag });
        manualFriendInput.value = "";
    }
});

socket.on("sync_friends_list", ({ friends }) => {
    renderFriendsList(friends);
});

socket.on("friend_feedback", ({ success, message }) => {
    alert(message);
});

socket.on("online_tags_update", (tags) => {
    onlineTagsSet = new Set(tags.map((t) => t.toLowerCase()));
    if (currentUser && currentUser.friends) {
        renderFriendsList(currentUser.friends);
    }
});

/* ========================================
   INVITES POPUP MODAL
   ======================================== */
let pendingInviteRoom = null;

socket.on("receive_invite", ({ from, roomCode }) => {
    pendingInviteRoom = roomCode;
    inviterName.textContent = from;
    inviteRoomCode.textContent = roomCode;
    inviteModal.classList.remove("hidden");
    playSound("invite");
});

acceptInviteBtn.addEventListener("click", () => {
    inviteModal.classList.add("hidden");
    if (pendingInviteRoom) {
        socket.emit("join_private_room", { roomCode: pendingInviteRoom });
    }
});

declineInviteBtn.addEventListener("click", () => {
    inviteModal.classList.add("hidden");
    pendingInviteRoom = null;
});

copyInviteBtn.addEventListener("click", () => {
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom).then(() => {
        copyInviteBtn.textContent = "✅ Copied!";
        setTimeout(() => (copyInviteBtn.textContent = "📋 Copy Room Code"), 2000);
    });
});

/* ========================================
   ENHANCED TOOLBAR & BRUSHES UI
   ======================================== */
function selectTool(tool) {
    currentTool = tool;
    toolBrushBtn.classList.toggle("active", tool === "brush");
    toolFillBtn.classList.toggle("active", tool === "fill");
    eraserBtn.classList.toggle("active", tool === "eraser");
    canvas.classList.toggle("fill-mode", tool === "fill");
}

toolBrushBtn.addEventListener("click", () => selectTool("brush"));
toolFillBtn.addEventListener("click", () => selectTool("fill"));
eraserBtn.addEventListener("click", () => selectTool("eraser"));

brushTypeSelect.addEventListener("change", (e) => {
    currentBrushType = e.target.value;
    if (currentTool === "eraser" || currentTool === "fill") {
        selectTool("brush");
    }
});

colorSwatches.querySelectorAll(".swatch").forEach((swatch) => {
    swatch.addEventListener("click", () => {
        colorSwatches.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
        swatch.classList.add("active");
        brushColor.value = swatch.getAttribute("data-color");
        if (currentTool === "eraser") selectTool("brush");
    });
});

brushColor.addEventListener("input", () => {
    colorSwatches.querySelectorAll(".swatch").forEach((s) => s.classList.remove("active"));
    if (currentTool === "eraser") selectTool("brush");
});

/* ========================================
   FLOOD FILL BUCKET ALGORITHM
   ======================================== */
function hexToRgba(hex) {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const num = parseInt(c, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 255];
}

function floodFill(startX, startY, fillColorHex, emit = false) {
    startX = Math.floor(startX);
    startY = Math.floor(startY);

    if (startX < 0 || startX >= canvas.width || startY < 0 || startY >= canvas.height) return;

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const width = canvas.width;
    const height = canvas.height;

    const startPos = (startY * width + startX) * 4;
    const startR = data[startPos];
    const startG = data[startPos + 1];
    const startB = data[startPos + 2];
    const startA = data[startPos + 3];

    const [fillR, fillG, fillB, fillA] = hexToRgba(fillColorHex);

    if (
        Math.abs(startR - fillR) < 5 &&
        Math.abs(startG - fillG) < 5 &&
        Math.abs(startB - fillB) < 5 &&
        Math.abs(startA - fillA) < 5
    ) {
        return;
    }

    function matchStartColor(pos) {
        return (
            Math.abs(data[pos] - startR) < 32 &&
            Math.abs(data[pos + 1] - startG) < 32 &&
            Math.abs(data[pos + 2] - startB) < 32 &&
            Math.abs(data[pos + 3] - startA) < 32
        );
    }

    function colorPixel(pos) {
        data[pos] = fillR;
        data[pos + 1] = fillG;
        data[pos + 2] = fillB;
        data[pos + 3] = fillA;
    }

    const pixelStack = [[startX, startY]];

    while (pixelStack.length > 0) {
        const [currX, currY] = pixelStack.pop();
        let y1 = currY;

        while (y1 >= 0 && matchStartColor((y1 * width + currX) * 4)) {
            y1--;
        }
        y1++;

        let spanLeft = false;
        let spanRight = false;

        while (y1 < height && matchStartColor((y1 * width + currX) * 4)) {
            const pos = (y1 * width + currX) * 4;
            colorPixel(pos);

            if (currX > 0) {
                if (matchStartColor(pos - 4)) {
                    if (!spanLeft) {
                        pixelStack.push([currX - 1, y1]);
                        spanLeft = true;
                    }
                } else if (spanLeft) {
                    spanLeft = false;
                }
            }

            if (currX < width - 1) {
                if (matchStartColor(pos + 4)) {
                    if (!spanRight) {
                        pixelStack.push([currX + 1, y1]);
                        spanRight = true;
                    }
                } else if (spanRight) {
                    spanRight = false;
                }
            }

            y1++;
        }
    }

    ctx.putImageData(imgData, 0, 0);
    playSound("fill");

    if (emit && currentRoom) {
        socket.emit("flood_fill", { room: currentRoom, x: startX, y: startY, color: fillColorHex });
    }
}

/* ========================================
   CANVAS DRAWING WITH BRUSH STYLES
   ======================================== */
function getCanvasCoordinates(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

function drawLine(x0, y0, x1, y1, color, size, brushType, isEraserMode, emit = false) {
    ctx.save();
    ctx.strokeStyle = isEraserMode ? "#ffffff" : color;

    if (brushType === "crayon") {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = size * 1.3;
        ctx.globalAlpha = 0.55;
    } else if (brushType === "calligraphy") {
        ctx.lineCap = "square";
        ctx.lineJoin = "miter";
        ctx.lineWidth = size;
        ctx.globalAlpha = 1.0;
    } else {
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = size;
        ctx.globalAlpha = 1.0;
    }

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();

    if (emit && currentRoom) {
        socket.emit("draw_stroke", {
            room: currentRoom,
            x0,
            y0,
            x1,
            y1,
            color,
            size,
            brushType,
            isEraserMode
        });
    }
}

function handlePointerDown(e) {
    if (!isDrawer) return;
    initAudio();
    if (musicEnabled && bgMusic.paused) startMusic();

    const { x, y } = getCanvasCoordinates(e);

    if (currentTool === "fill") {
        floodFill(x, y, brushColor.value, true);
        return;
    }

    isDrawing = true;
    lastX = x;
    lastY = y;

    drawLine(
        x,
        y,
        x + 0.1,
        y + 0.1,
        brushColor.value,
        brushSize.value,
        currentBrushType,
        currentTool === "eraser",
        true
    );
}

function handlePointerMove(e) {
    if (!isDrawing || !isDrawer || currentTool === "fill") return;
    const { x, y } = getCanvasCoordinates(e);
    drawLine(
        lastX,
        lastY,
        x,
        y,
        brushColor.value,
        brushSize.value,
        currentBrushType,
        currentTool === "eraser",
        true
    );
    lastX = x;
    lastY = y;
}

canvas.addEventListener("mousedown", handlePointerDown);
canvas.addEventListener("mousemove", handlePointerMove);
window.addEventListener("mouseup", () => (isDrawing = false));

canvas.addEventListener(
    "touchstart",
    (e) => {
        handlePointerDown(e);
        e.preventDefault();
    },
    { passive: false }
);

canvas.addEventListener(
    "touchmove",
    (e) => {
        handlePointerMove(e);
        e.preventDefault();
    },
    { passive: false }
);

window.addEventListener("touchend", () => (isDrawing = false));

clearCanvasBtn.addEventListener("click", () => {
    if (!isDrawer || !currentRoom) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    socket.emit("clear_canvas", { room: currentRoom });
});

/* ========================================
   CHAT & EMOJI
   ======================================== */
emojiButton.addEventListener("click", (e) => {
    e.stopPropagation();
    emojiPicker.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiButton) {
        emojiPicker.classList.add("hidden");
    }
});

emojiPicker.querySelectorAll(".emoji-option").forEach((btn) => {
    btn.addEventListener("click", () => {
        chatInput.value += btn.textContent;
        chatInput.focus();
    });
});

chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !currentRoom) return;
    socket.emit("send_message", { room: currentRoom, message: text });
    chatInput.value = "";
});

function appendMessage({ username, message, isSystem, isCorrectGuess, isMine }) {
    const div = document.createElement("div");
    if (isSystem) {
        div.className = "chat-system-message";
        div.textContent = message;
    } else {
        div.className = `chat-message${isMine ? " mine" : ""}${isCorrectGuess ? " correct-guess" : ""}`;
        div.innerHTML = `<span class="chat-username">${username}</span><span>${message}</span>`;
    }
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ========================================
   ROOM NAVIGATION & SOCKET EVENTS
   ======================================== */
publicBtn.addEventListener("click", () => {
    initAudio();
    if (musicEnabled && bgMusic.paused) startMusic();
    socket.emit("join_public_room");
});

privateBtn.addEventListener("click", () => {
    initAudio();
    if (musicEnabled && bgMusic.paused) startMusic();
    socket.emit("create_private_room");
});

joinBtn.addEventListener("click", () => {
    initAudio();
    if (musicEnabled && bgMusic.paused) startMusic();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (code) socket.emit("join_private_room", { roomCode: code });
});

leaveBtn.addEventListener("click", () => {
    if (currentRoom) socket.emit("leave_room", { room: currentRoom });
    homeScreen.classList.remove("hidden");
    gameScreen.classList.add("hidden");
    currentRoom = null;
});

backHomeBtn.addEventListener("click", () => {
    homeScreen.classList.remove("hidden");
    gameScreen.classList.add("hidden");
});

socket.on("room_joined", (data) => {
    currentRoom = data.roomCode;
    roomInfo.textContent = `Room Code: ${data.roomCode}`;
    homeScreen.classList.add("hidden");
    gameScreen.classList.remove("hidden");
    gameOverPanel.classList.add("hidden");
});

socket.on("error_message", (msg) => alert(msg));

socket.on("update_players", ({ players, count }) => {
    playerCount.textContent = count;
    playerList.innerHTML = "";
    players.forEach((p) => {
        const li = document.createElement("li");
        if (p.isDrawing) li.classList.add("drawing");

        const isMe = p.id === socket.id;
        li.innerHTML = `
            <span>${p.username} <small style="color:var(--cyan)">(${p.userTag})</small> ${isMe ? "(You)" : ""}</span>
            <div style="display:flex; align-items:center; gap:8px;">
                <span class="score">${p.score} pts</span>
                ${!isMe ? `<button class="add-friend-btn" onclick="addPlayerFriend('${p.userTag}')">+ Friend</button>` : ""}
            </div>
        `;
        playerList.appendChild(li);
    });
});

socket.on("round_start", (data) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    gameProgressBadge.textContent = `Match ${data.game}/${data.totalGames}`;
    roundLabel.textContent = `Match ${data.game}/${data.totalGames} — Round ${data.round}/${data.roundsPerGame}`;

    isDrawer = socket.id === data.drawerId;
    if (isDrawer) {
        canvas.classList.remove("locked");
        toolbar.classList.remove("disabled");
        roleInfo.textContent = "🎨 You are drawing!";
        wordInfo.textContent = `Word: ${data.word}`;
        selectTool("brush");
    } else {
        canvas.classList.add("locked");
        toolbar.classList.add("disabled");
        roleInfo.textContent = "🤔 Guess the word!";
        wordInfo.textContent = data.word;
    }
});

socket.on("timer_tick", (time) => {
    timerInfo.textContent = `Time: ${time}`;
    if (time <= 10 && time > 0) {
        timerInfo.classList.add("low");
        playSound("tick");
    } else {
        timerInfo.classList.remove("low");
    }
});

socket.on("draw_stroke", (d) => {
    drawLine(d.x0, d.y0, d.x1, d.y1, d.color, d.size, d.brushType, d.isEraserMode, false);
});

socket.on("flood_fill", (d) => {
    floodFill(d.x, d.y, d.color, false);
});

socket.on("clear_canvas", () => ctx.clearRect(0, 0, canvas.width, canvas.height));

socket.on("chat_message", (p) => {
    appendMessage({ ...p, isMine: p.senderId === socket.id });
    if (p.isCorrectGuess) playSound("correct");
});

socket.on("game_over", (data) => {
    playSound("gameover");
    gameOverTitle.textContent = `🏆 TOURNAMENT WINNER: ${data.winnerName}!`;
    gameOverText.textContent = `Winning Score: ${data.winnerScore} pts\n\nFinal Standings:\n${data.scoreboard}`;
    gameOverPanel.classList.remove("hidden");
    canvas.classList.add("locked");
    toolbar.classList.add("disabled");
});