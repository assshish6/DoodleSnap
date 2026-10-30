const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Deployment ke liye process.env.PORT support
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "database.json");

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// JSON File Database Helper
function loadDatabase() {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({ users: {} }, null, 2));
        }
        const data = fs.readFileSync(DB_FILE, "utf-8");
        return JSON.parse(data);
    } catch (e) {
        return { users: {} };
    }
}

function saveDatabase(db) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error("DB Save Error:", e);
    }
}

function generateRandomTag() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "#";
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

const WORD_BANK = [
    // Animals, Birds & Insects (40)
    "CAT", "DOG", "ELEPHANT", "LION", "TIGER", "MONKEY", "RABBIT", "HORSE",
    "PANDA", "GIRAFFE", "BEAR", "PENGUIN", "KANGAROO", "SNAKE", "FROG", "TURTLE",
    "CROCODILE", "FISH", "SHARK", "WHALE", "DOLPHIN", "OCTOPUS", "CRAB", "BUTTERFLY",
    "BEE", "SPIDER", "ANT", "MOSQUITO", "SNAIL", "DUCK", "OWL", "PARROT",
    "EAGLE", "FLAMINGO", "BAT", "CAMEL", "ZEBRA", "MOUSE", "CHICKEN", "SHEEP",

    // Food, Fruits & Snacks (35)
    "APPLE", "BANANA", "MANGO", "ORANGE", "GRAPES", "WATERMELON", "STRAWBERRY", "PINEAPPLE",
    "CARROT", "POTATO", "TOMATO", "ONION", "CORN", "BURGER", "PIZZA", "SANDWICH",
    "HOTDOG", "FRIES", "ICECREAM", "CAKE", "DONUT", "COOKIE", "CHOCOLATE", "CANDY",
    "POPCORN", "EGG", "BREAD", "CHEESE", "NOODLES", "SOUP", "COFFEE", "TEA",
    "MILK", "JUICE", "LOLLIPOP",

    // Daily Objects & Household Items (40)
    "CLOCK", "WATCH", "BOOK", "PEN", "PENCIL", "SCISSORS", "GLASSES", "UMBRELLA",
    "KEY", "LOCK", "LAMP", "CANDLE", "TORCH", "CHAIR", "TABLE", "BED",
    "SOFA", "DOOR", "WINDOW", "MIRROR", "CUP", "BOTTLE", "PLATE", "SPOON",
    "FORK", "KNIFE", "BUCKET", "BROOM", "SOAP", "TOOTHBRUSH", "PILLOW", "FAN",
    "TELEVISION", "CAMERA", "TELEPHONE", "SMARTPHONE", "LAPTOP", "HEADPHONES", "GUITAR", "BELL",

    // Clothing, Accessories & Wearables (20)
    "SHIRT", "PANTS", "SHOES", "SOCKS", "HAT", "CAP", "CROWN", "RING",
    "NECKLACE", "GLASSES", "SUNGLASSES", "GLOVES", "TIE", "BELT", "MASK", "DRESS",
    "JACKET", "BOOTS", "BAG", "BACKPACK",

    // Nature, Space & Weather (30)
    "SUN", "MOON", "STAR", "CLOUD", "RAIN", "SNOW", "RAINBOW", "LIGHTNING",
    "WIND", "FIRE", "WATER", "MOUNTAIN", "VOLCANO", "TREE", "FLOWER", "LEAF",
    "GRASS", "RIVER", "OCEAN", "ISLAND", "BEACH", "FOREST", "DESERT", "ROCK",
    "EARTH", "PLANET", "ROCKET", "COMET", "TORNADO", "CAVE",

    // Vehicles & Transport (20)
    "CAR", "BUS", "TRUCK", "TRAIN", "AIRPLANE", "HELICOPTER", "BICYCLE", "MOTORCYCLE",
    "SCOOTER", "BOAT", "SHIP", "SUBMARINE", "TRACTOR", "AMBULANCE", "VAN", "TAXI",
    "SKATEBOARD", "PARACHUTE", "BALLOON", "ROCKET",

    // Sports, Fun & Fantasy (15)
    "FOOTBALL", "CRICKET", "BASKETBALL", "TENNIS", "BASEBALL", "SKATEBOARD", "TROPHY", "MEDAL",
    "DRAGON", "GHOST", "ROBOT", "ALIEN", "MONSTER", "SWORD", "SHIELD"
];

const rooms = new Map();
const onlineUsers = new Map();
const socketUserMap = new Map();

function generateRoomCode(length = 5) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < length; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

function createRoom(isPrivate = false, existingCode = null) {
    const code = existingCode || generateRoomCode();
    const roomData = {
        code,
        isPrivate,
        players: new Map(),
        currentDrawerIndex: -1,
        currentWord: "",
        
        currentGame: 1,
        totalGames: 3,
        currentRound: 0,
        roundsPerGame: 3,

        timer: null,
        timeLeft: 60,
        gameStarted: false
    };
    rooms.set(code, roomData);
    return roomData;
}

function getMaskedWord(word) {
    return word.replace(/[A-Z0-9]/gi, "_ ");
}

function broadcastOnlineStatus() {
    const onlineTags = Array.from(onlineUsers.keys());
    io.emit("online_tags_update", onlineTags);
}

function broadcastPlayerList(room) {
    const playerArray = Array.from(room.players.values()).map(p => ({
        id: p.id,
        username: p.username,
        userTag: p.userTag,
        score: p.score,
        isDrawing: p.isDrawing
    }));
    io.to(room.code).emit("update_players", {
        players: playerArray,
        count: playerArray.length
    });
}

function startNextTurn(room) {
    if (!rooms.has(room.code)) return;
    const playerIds = Array.from(room.players.keys());

    if (playerIds.length < 2) {
        room.gameStarted = false;
        clearInterval(room.timer);
        io.to(room.code).emit("chat_message", {
            username: "System",
            message: "Waiting for at least 2 players to start...",
            isSystem: true
        });
        return;
    }

    room.currentDrawerIndex = (room.currentDrawerIndex + 1) % playerIds.length;

    if (room.currentDrawerIndex === 0) {
        room.currentRound++;
    }

    if (room.currentRound > room.roundsPerGame) {
        room.currentGame++;
        room.currentRound = 1;
    }

    if (room.currentGame > room.totalGames) {
        endTournament(room);
        return;
    }

    const drawerId = playerIds[room.currentDrawerIndex];
    room.currentWord = WORD_BANK[Math.floor(Math.random() * WORD_BANK.length)];
    room.timeLeft = 60;

    room.players.forEach(p => {
        p.isDrawing = (p.id === drawerId);
        p.hasGuessed = false;
    });

    broadcastPlayerList(room);

    playerIds.forEach(id => {
        const isDrawer = (id === drawerId);
        io.to(id).emit("round_start", {
            game: room.currentGame,
            totalGames: room.totalGames,
            round: room.currentRound,
            roundsPerGame: room.roundsPerGame,
            drawerId: drawerId,
            word: isDrawer ? room.currentWord : getMaskedWord(room.currentWord)
        });
    });

    clearInterval(room.timer);
    room.timer = setInterval(() => {
        room.timeLeft--;
        io.to(room.code).emit("timer_tick", room.timeLeft);

        if (room.timeLeft <= 0) {
            clearInterval(room.timer);
            io.to(room.code).emit("chat_message", {
                username: "System",
                message: `⏰ Time's up! The word was "${room.currentWord}".`,
                isSystem: true
            });
            setTimeout(() => startNextTurn(room), 3000);
        }
    }, 1000);
}

function endTournament(room) {
    clearInterval(room.timer);
    room.gameStarted = false;

    const playersArray = Array.from(room.players.values());
    playersArray.sort((a, b) => b.score - a.score);

    const winner = playersArray[0] || { username: "None", score: 0 };

    io.to(room.code).emit("game_over", {
        winnerName: winner.username,
        winnerScore: winner.score,
        scoreboard: playersArray.map(p => `${p.username}: ${p.score} pts`).join("\n")
    });
}

function removePlayerFromRoom(socket, roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    const leavingPlayer = room.players.get(socket.id);
    room.players.delete(socket.id);
    socket.leave(roomCode);

    if (leavingPlayer) {
        io.to(roomCode).emit("chat_message", {
            username: "System",
            message: `${leavingPlayer.username} left the room.`,
            isSystem: true
        });
    }

    if (room.players.size === 0) {
        clearInterval(room.timer);
        rooms.delete(roomCode);
    } else {
        broadcastPlayerList(room);
        if (leavingPlayer && leavingPlayer.isDrawing) {
            clearInterval(room.timer);
            setTimeout(() => startNextTurn(room), 2000);
        }
    }
}

io.on("connection", (socket) => {
    let currentJoinedRoom = null;

    socket.on("auth_register", ({ username, password }) => {
        const cleanName = (username || "").trim();
        const cleanPass = (password || "").trim();

        if (cleanName.length < 3 || cleanPass.length < 4) {
            socket.emit("auth_response", { success: false, message: "Username (3+ chars) & Password (4+ chars) required!" });
            return;
        }

        const db = loadDatabase();
        const exists = Object.values(db.users).some(u => u.username.toLowerCase() === cleanName.toLowerCase());
        if (exists) {
            socket.emit("auth_response", { success: false, message: "Username already taken! Choose another." });
            return;
        }

        let userTag = "";
        do {
            userTag = `${cleanName}${generateRandomTag()}`;
        } while (db.users[userTag.toLowerCase()]);

        const newUser = {
            username: cleanName,
            userTag: userTag,
            password: cleanPass,
            friends: []
        };

        db.users[userTag.toLowerCase()] = newUser;
        saveDatabase(db);

        socket.emit("auth_response", { 
            success: true, 
            message: `Account created! Your unique ID is ${userTag}`,
            user: { username: newUser.username, userTag: newUser.userTag, friends: newUser.friends }
        });
    });

    socket.on("auth_login", ({ username, password }) => {
        const cleanName = (username || "").trim();
        const cleanPass = (password || "").trim();
        const db = loadDatabase();

        const foundTag = Object.keys(db.users).find(key => {
            const u = db.users[key];
            return (u.username.toLowerCase() === cleanName.toLowerCase() || u.userTag.toLowerCase() === cleanName.toLowerCase()) && u.password === cleanPass;
        });

        if (!foundTag) {
            socket.emit("auth_response", { success: false, message: "Invalid username or password!" });
            return;
        }

        const user = db.users[foundTag];
        socket.emit("auth_response", {
            success: true,
            message: "Login successful!",
            user: { username: user.username, userTag: user.userTag, friends: user.friends || [] }
        });
    });

    socket.on("user_online_login", ({ userTag }) => {
        if (!userTag) return;
        const tagKey = userTag.toLowerCase();
        const db = loadDatabase();
        const user = db.users[tagKey];

        if (!user) return;

        socketUserMap.set(socket.id, { username: user.username, userTag: user.userTag });

        if (!onlineUsers.has(tagKey)) {
            onlineUsers.set(tagKey, new Set());
        }
        onlineUsers.get(tagKey).add(socket.id);

        broadcastOnlineStatus();
        socket.emit("sync_friends_list", { friends: user.friends || [] });
    });

    socket.on("add_friend_by_tag", ({ targetTag }) => {
        const currentUser = socketUserMap.get(socket.id);
        if (!currentUser) return;

        const cleanTarget = (targetTag || "").trim().toLowerCase();
        const db = loadDatabase();

        if (cleanTarget === currentUser.userTag.toLowerCase()) {
            socket.emit("friend_feedback", { success: false, message: "You cannot add yourself!" });
            return;
        }

        const targetAccount = db.users[cleanTarget];
        if (!targetAccount) {
            socket.emit("friend_feedback", { success: false, message: "Player Tag not found! Check exact tag (e.g. Name#A8F2)." });
            return;
        }

        const myAccount = db.users[currentUser.userTag.toLowerCase()];
        if (!myAccount.friends) myAccount.friends = [];

        if (myAccount.friends.includes(targetAccount.userTag)) {
            socket.emit("friend_feedback", { success: false, message: "Already in your friends list!" });
            return;
        }

        myAccount.friends.push(targetAccount.userTag);
        saveDatabase(db);

        socket.emit("sync_friends_list", { friends: myAccount.friends });
        socket.emit("friend_feedback", { success: true, message: `Added ${targetAccount.userTag} to friends!` });
    });

    socket.on("remove_friend_by_tag", ({ targetTag }) => {
        const currentUser = socketUserMap.get(socket.id);
        if (!currentUser) return;

        const db = loadDatabase();
        const myAccount = db.users[currentUser.userTag.toLowerCase()];
        if (myAccount && myAccount.friends) {
            myAccount.friends = myAccount.friends.filter(t => t.toLowerCase() !== targetTag.toLowerCase());
            saveDatabase(db);
            socket.emit("sync_friends_list", { friends: myAccount.friends });
        }
    });

    socket.on("invite_friend_tag", ({ friendTag, roomCode }) => {
        const currentUser = socketUserMap.get(socket.id);
        if (!currentUser || !friendTag || !roomCode) return;

        const tagKey = friendTag.trim().toLowerCase();
        const targetSockets = onlineUsers.get(tagKey);

        if (targetSockets && targetSockets.size > 0) {
            targetSockets.forEach(sockId => {
                io.to(sockId).emit("receive_invite", {
                    from: currentUser.userTag,
                    roomCode: roomCode
                });
            });
            socket.emit("chat_message", {
                username: "System",
                message: `Invite sent to ${friendTag}!`,
                isSystem: true
            });
        } else {
            socket.emit("error_message", `${friendTag} is currently offline.`);
        }
    });

    socket.on("join_public_room", () => {
        const user = socketUserMap.get(socket.id);
        if (!user) return;

        let targetRoom = null;
        for (const room of rooms.values()) {
            if (!room.isPrivate && room.players.size < 8) {
                targetRoom = room;
                break;
            }
        }
        if (!targetRoom) targetRoom = createRoom(false);
        joinUser(socket, targetRoom, user);
    });

    socket.on("create_private_room", () => {
        const user = socketUserMap.get(socket.id);
        if (!user) return;
        const room = createRoom(true);
        joinUser(socket, room, user);
    });

    socket.on("join_private_room", ({ roomCode }) => {
        const user = socketUserMap.get(socket.id);
        if (!user) return;

        const code = (roomCode || "").toUpperCase();
        const room = rooms.get(code);

        if (!room) {
            socket.emit("error_message", "Room code not found!");
            return;
        }
        if (room.players.size >= 8) {
            socket.emit("error_message", "Room is full (Maximum 8 players)!");
            return;
        }
        joinUser(socket, room, user);
    });

    function joinUser(socket, room, user) {
        currentJoinedRoom = room.code;
        socket.join(room.code);

        room.players.set(socket.id, {
            id: socket.id,
            username: user.username,
            userTag: user.userTag,
            score: 0,
            isDrawing: false,
            hasGuessed: false
        });

        socket.emit("room_joined", { roomCode: room.code });
        broadcastPlayerList(room);

        io.to(room.code).emit("chat_message", {
            username: "System",
            message: `👋 ${user.userTag} joined!`,
            isSystem: true
        });

        if (!room.gameStarted && room.players.size >= 2) {
            room.gameStarted = true;
            room.currentGame = 1;
            room.currentRound = 1;
            room.currentDrawerIndex = -1;
            setTimeout(() => startNextTurn(room), 1500);
        }
    }

    socket.on("draw_stroke", (data) => socket.to(data.room).emit("draw_stroke", data));
    socket.on("flood_fill", (data) => socket.to(data.room).emit("flood_fill", data));
    socket.on("clear_canvas", (data) => socket.to(data.room).emit("clear_canvas"));

    socket.on("send_message", ({ room: roomCode, message }) => {
        const room = rooms.get(roomCode);
        if (!room) return;

        const player = room.players.get(socket.id);
        if (!player) return;

        const text = message.trim();
        const isMatch = room.gameStarted && 
                        !player.isDrawing && 
                        !player.hasGuessed && 
                        text.toUpperCase() === room.currentWord;

        if (isMatch) {
            player.hasGuessed = true;
            const points = Math.max(50, room.timeLeft * 10);
            player.score += points;

            const drawerId = Array.from(room.players.keys())[room.currentDrawerIndex];
            const drawer = room.players.get(drawerId);
            if (drawer) drawer.score += 25;

            broadcastPlayerList(room);

            io.to(room.code).emit("chat_message", {
                username: "System",
                message: `🎉 ${player.username} guessed the word correctly! (+${points} pts)`,
                isSystem: false,
                isCorrectGuess: true
            });

            const guessers = Array.from(room.players.values()).filter(p => !p.isDrawing);
            if (guessers.every(p => p.hasGuessed)) {
                clearInterval(room.timer);
                io.to(room.code).emit("chat_message", {
                    username: "System",
                    message: "All players guessed it! Next turn...",
                    isSystem: true
                });
                setTimeout(() => startNextTurn(room), 2500);
            }
        } else {
            io.to(room.code).emit("chat_message", {
                username: player.username,
                message: text,
                senderId: socket.id,
                isSystem: false
            });
        }
    });

    socket.on("leave_room", ({ room }) => {
        removePlayerFromRoom(socket, room);
        currentJoinedRoom = null;
    });

    socket.on("disconnect", () => {
        if (currentJoinedRoom) removePlayerFromRoom(socket, currentJoinedRoom);

        const user = socketUserMap.get(socket.id);
        if (user) {
            const tagKey = user.userTag.toLowerCase();
            const set = onlineUsers.get(tagKey);
            if (set) {
                set.delete(socket.id);
                if (set.size === 0) onlineUsers.delete(tagKey);
            }
            socketUserMap.delete(socket.id);
            broadcastOnlineStatus();
        }
    });
});

server.listen(PORT, () => {
    console.log(`DoodleSnap server running on port ${PORT}`);
});