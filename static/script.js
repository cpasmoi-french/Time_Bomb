const socket = io();
let currentRoom = '';
let globalPlayers = {};
let totalCablesNeeded = 5;
let currentTurnSid = '';
let previousTurnSid = null;
let hostSid = '';

// --- Navigation du Menu ---
function showSettingsMenu() {
    if(!document.getElementById('playerName').value) return showToast("Mets d'abord un pseudo !");
    document.getElementById('initial-menu').style.display = 'none';
    document.getElementById('creation-settings').style.display = 'block';
    syncFromTotal();
}

function hideSettingsMenu() {
    document.getElementById('creation-settings').style.display = 'none';
    document.getElementById('initial-menu').style.display = 'block';
}

function syncFromTotal() {
    const total = parseInt(document.getElementById('nbJoueurs').value);
    document.getElementById('mechants').value = 1;
    document.getElementById('gentils').value = total - 1;
    document.getElementById('interrupteurs').value = total;
}

function syncFromRoles(changedRole) {
    const total = parseInt(document.getElementById('nbJoueurs').value);
    const g = parseInt(document.getElementById('gentils').value);
    const m = parseInt(document.getElementById('mechants').value);
    if (changedRole === 'gentils') document.getElementById('mechants').value = total - g;
    else if (changedRole === 'mechants') document.getElementById('gentils').value = total - m;
}

function showToast(msg) {
    const toast = document.getElementById('toast-msg');
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// --- Serveur ---
function createGame() {
    const data = {
        playerName: document.getElementById('playerName').value,
        gentils: document.getElementById('gentils').value,
        mechants: document.getElementById('mechants').value,
        interrupteurs: document.getElementById('interrupteurs').value
    };
    socket.emit('create_game', data);
}

function joinGame() {
    const room = document.getElementById('roomCodeInput').value;
    const name = document.getElementById('playerName').value;
    if(name && room) socket.emit('join_game', { room: room, playerName: name });
    else showToast("Pseudo et Code requis !");
}

function startGame() { socket.emit('start_game', { room: currentRoom }); }

socket.on('game_created', (data) => {
    currentRoom = data.room;
    document.getElementById('creation-settings').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('displayRoomCode').innerText = currentRoom;
    document.getElementById('chat-widget').style.display = 'block'; // Affiche le bouton chat
});

socket.on('joined_success', (data) => {
    currentRoom = data.room;
    document.getElementById('initial-menu').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('displayRoomCode').innerText = currentRoom;
    document.getElementById('chat-widget').style.display = 'block'; // Affiche le bouton chat
});

socket.on('update_lobby', (data) => {
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    data.players.forEach(p => {
        let li = document.createElement('li');
        li.innerText = p;
        list.appendChild(li);
    });
    
    hostSid = data.host_sid;
    if (socket.id === hostSid) {
        document.getElementById('startBtn').style.display = 'block';
        document.getElementById('waitingMessage').style.display = 'none';
        document.getElementById('btn-replay').style.display = 'inline-block';
    }
});

// --- En Jeu ---
socket.on('game_started', (data) => {
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('game-board').style.display = 'block';
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('explosion-overlay').classList.remove('explode-anim');
    
    totalCablesNeeded = data.cables_needed;
    globalPlayers = data.all_players;
    
    const roleCard = document.getElementById('myRoleCard');
    roleCard.innerText = data.role;
    roleCard.className = 'role-back ' + data.role;

    updateTurnDisplay(data.turn_sid, data.turn_name, data.previous_turn);
    renderCenterSlots(0, false);
    renderBoard(data.my_cards);
});

function updateTurnDisplay(turnSid, turnName, prevSid) {
    currentTurnSid = turnSid;
    previousTurnSid = prevSid;
    const indicator = document.getElementById('turnIndicator');
    if (turnSid === socket.id) {
        indicator.innerText = "C'est à TOI de jouer !";
        indicator.className = "my-turn";
    } else {
        indicator.innerText = "Tour de : " + turnName;
        indicator.className = "";
    }
    
    for (const sid of Object.keys(globalPlayers)) {
        const dot = document.getElementById(`dot-${sid}`);
        if (!dot) continue;
        if (sid === currentTurnSid || (sid === previousTurnSid && Object.keys(globalPlayers).length > 2)) {
            dot.className = "status-dot dot-red";
        } else {
            dot.className = "status-dot dot-green";
        }
    }
}

function renderCenterSlots(found, bombExploded) {
    const container = document.getElementById('slots-container');
    container.innerHTML = '';
    for(let i = 0; i < totalCablesNeeded; i++) {
        let slot = document.createElement('div');
        slot.className = 'mini-slot ' + (i < found ? 'filled-cable' : 'empty-cable');
        if (i < found) slot.innerHTML = '✅';
        container.appendChild(slot);
    }
    let bombSlot = document.createElement('div');
    bombSlot.className = 'mini-slot ' + (bombExploded ? 'filled-bomb' : 'empty-bomb');
    bombSlot.innerHTML = '💣';
    container.appendChild(bombSlot);
}

function renderBoard(myCardsData) {
    const area = document.getElementById('players-area');
    area.innerHTML = '';

    for (const [sid, name] of Object.entries(globalPlayers)) {
        let isMe = (sid === socket.id);
        let mat = document.createElement('div');
        mat.className = 'player-mat';
        mat.innerHTML = `
            <div class="status-dot dot-green" id="dot-${sid}"></div>
            <h3>${name} ${isMe ? '(Toi)' : ''}</h3>
            <div class="cards-container" id="cards-${sid}"></div>
        `;
        area.appendChild(mat);
        
        const cardsContainer = mat.querySelector('.cards-container');
        for (let i = 0; i < myCardsData.length; i++) {
            let wrapper = document.createElement('div');
            wrapper.className = 'card-wrapper';
            wrapper.onclick = () => {
                if (!isMe) socket.emit('reveal_card', { room: currentRoom, target_sid: sid, card_index: i });
            };
            wrapper.innerHTML = `
                <div class="card" id="card-${sid}-${i}">
                    <div class="card-face card-front"></div>
                    <div class="card-face card-back" id="back-${sid}-${i}"></div>
                </div>
            `;
            cardsContainer.appendChild(wrapper);
        }
    }
    updateTurnDisplay(currentTurnSid, globalPlayers[currentTurnSid], previousTurnSid);
}

socket.on('card_revealed', (data) => {
    const cardEl = document.getElementById(`card-${data.target_sid}-${data.card_index}`);
    const backEl = document.getElementById(`back-${data.target_sid}-${data.card_index}`);
    
    if(data.card_type === 'Bombe') {
        backEl.innerHTML = '💣';
    } else if(data.card_type === 'Interrupteur') {
        backEl.innerHTML = `
            <div class="cable-art">
                <div class="cable-line"></div>
                <div class="cable-line green"></div>
                <div class="cable-line"></div>
            </div>`;
        cardEl.classList.add('halo-anim');
    } else {
        backEl.innerHTML = `
            <div class="cable-art">
                <div class="cable-line"></div>
                <div class="cable-line"></div>
                <div class="cable-line"></div>
            </div>`;
    }

    backEl.className = 'card-face card-back ' + data.card_type;
    cardEl.classList.add('flipped');
    
    renderCenterSlots(data.cables_found, data.card_type === 'Bombe');
    updateTurnDisplay(data.next_turn_sid, data.next_turn_name, data.previous_turn);
});

socket.on('new_round_data', (data) => {
    const indicator = document.getElementById('turnIndicator');
    indicator.innerText = "Nouvelle manche !";
    indicator.className = "";
    document.querySelectorAll('.status-dot').forEach(el => el.style.display = 'none');

    setTimeout(() => {
        renderBoard(data.my_cards);
        updateTurnDisplay(data.turn_sid, data.turn_name, data.previous_turn);
    }, 3000);
});

socket.on('game_over', (data) => {
    setTimeout(() => {
        const goScreen = document.getElementById('game-over-screen');
        document.getElementById('go-title').innerText = `Les ${data.winner} gagnent !`;
        document.getElementById('go-title').style.color = data.winner === 'Méchants' ? '#e74c3c' : '#3498db';
        document.getElementById('go-desc').innerText = data.reason;
        
        if (data.winner === 'Méchants' && data.reason.includes('explosé')) {
            document.getElementById('explosion-overlay').classList.add('explode-anim');
            setTimeout(() => goScreen.classList.remove('hidden'), 1000);
        } else {
            confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
            goScreen.classList.remove('hidden');
        }
    }, 1000);
});

socket.on('error', (data) => showToast(data.msg));

// --- Logique du Chat ---
function toggleChat() {
    const chat = document.getElementById('chat-container');
    chat.classList.toggle('hidden');
    if(!chat.classList.contains('hidden')) {
        document.getElementById('chatInput').focus();
        document.getElementById('chat-toggle').style.background = '#3498db'; // Réinitialise la couleur
    }
}

function handleChatEnter(e) {
    if(e.key === 'Enter') sendChatMessage();
}

function sendChatMessage() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if(msg && currentRoom) {
        socket.emit('chat_message', { room: currentRoom, msg: msg });
        input.value = '';
    }
}

socket.on('chat_message', (data) => {
    const msgs = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<strong>${data.sender}:</strong> ${data.msg}`;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight; // Fait défiler vers le bas
    
    // Animation du bouton si le chat est fermé
    const chat = document.getElementById('chat-container');
    if (chat.classList.contains('hidden')) {
        const btn = document.getElementById('chat-toggle');
        btn.style.background = '#e74c3c'; // Devient rouge
        setTimeout(() => btn.style.background = '#3498db', 300);
        setTimeout(() => btn.style.background = '#e74c3c', 600);
    }
});