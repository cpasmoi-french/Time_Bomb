const socket = io();
let currentRoom = '';
let globalPlayers = {};
let totalCablesNeeded = 5;
let currentTurnSid = '';
let previousTurnSid = null;
let hostSid = '';
let canPlay = false; // Bloque les clics pendant les animations

// --- Helper pour le design des cartes ---
function getCardHTML(type) {
    if(type === 'Bombe') return '💣';
    if(type === 'Interrupteur') return `<div class="cable-art"><div class="cable-line"></div><div class="cable-line green"></div><div class="cable-line"></div></div>`;
    return `<div class="cable-art"><div class="cable-line"></div><div class="cable-line"></div><div class="cable-line"></div></div>`;
}

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
    document.getElementById('chat-widget').style.display = 'block';
});
socket.on('joined_success', (data) => {
    currentRoom = data.room;
    document.getElementById('initial-menu').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('displayRoomCode').innerText = currentRoom;
    document.getElementById('chat-widget').style.display = 'block';
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
    canPlay = false;
    
    // Prépare la carte rôle (sans la retourner)
    const roleCard = document.getElementById('myRoleCard');
    roleCard.innerText = data.role;
    roleCard.className = 'role-back ' + data.role;

    renderCenterSlots(0, false);
    document.getElementById('players-area').innerHTML = '';
    document.getElementById('turnIndicator').innerText = "Distribution...";

    // 1. Animation du Rôle Géant
    const roleCont = document.getElementById('role-card-container');
    const darkOverlay = document.getElementById('dark-overlay');
    
    roleCont.classList.add('center-reveal');
    darkOverlay.style.display = 'block';
    setTimeout(() => darkOverlay.style.opacity = '1', 10);

    setTimeout(() => {
        roleCont.classList.add('active'); // Retourne la carte
        
        setTimeout(() => {
            roleCont.classList.remove('active'); // Cache la carte
            
            setTimeout(() => {
                roleCont.classList.remove('center-reveal'); // S'envole dans le coin
                darkOverlay.style.opacity = '0';
                
                setTimeout(() => {
                    darkOverlay.style.display = 'none';
                    // 2. Lance la manche
                    startRoundAnimation(data.my_cards, data.turn_sid, data.turn_name, data.previous_turn);
                }, 800); 
            }, 600);
        }, 3000); // 3 sec pour lire son rôle
    }, 500);
});

function startRoundAnimation(myCardsData, turnSid, turnName, prevSid) {
    canPlay = false;
    document.getElementById('turnIndicator').innerText = "Mémorise tes cartes !";
    
    renderBoard(myCardsData, true); // true = Affiche NOS cartes face visible

    // Temps de mémorisation
    setTimeout(() => {
        document.querySelectorAll('.initial-reveal').forEach(c => {
            c.classList.remove('flipped'); // Cache nos cartes
        });
        
        // Autorise à jouer une fois les cartes retournées
        setTimeout(() => {
            canPlay = true;
            updateTurnDisplay(turnSid, turnName, prevSid);
        }, 600);
    }, 4000); // 4 secondes
}

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
        if (i < found) {
            slot.innerHTML = `<div class="cable-art mini-art"><div class="cable-line"></div><div class="cable-line green"></div><div class="cable-line"></div></div>`;
        }
        container.appendChild(slot);
    }
    let bombSlot = document.createElement('div');
    bombSlot.className = 'mini-slot ' + (bombExploded ? 'filled-bomb' : 'empty-bomb');
    bombSlot.innerHTML = '💣';
    container.appendChild(bombSlot);
}

function renderBoard(myCardsData, isInitialReveal = false) {
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
            let cardType = isMe ? myCardsData[i].type : 'Unknown';
            let backContent = isMe ? getCardHTML(cardType) : '';
            let backClass = isMe ? cardType : '';

            let wrapper = document.createElement('div');
            wrapper.className = 'card-wrapper';
            wrapper.onclick = () => {
                if (!canPlay) return;
                if (!isMe) socket.emit('reveal_card', { room: currentRoom, target_sid: sid, card_index: i });
            };
            wrapper.innerHTML = `
                <div class="card ${isMe && isInitialReveal ? 'flipped initial-reveal' : ''}" id="card-${sid}-${i}">
                    <div class="card-face card-front"></div>
                    <div class="card-face card-back ${backClass}" id="back-${sid}-${i}">${backContent}</div>
                </div>
            `;
            cardsContainer.appendChild(wrapper);
        }
    }
    if (!isInitialReveal) {
        updateTurnDisplay(currentTurnSid, globalPlayers[currentTurnSid], previousTurnSid);
    }
}

socket.on('card_revealed', (data) => {
    const cardEl = document.getElementById(`card-${data.target_sid}-${data.card_index}`);
    const backEl = document.getElementById(`back-${data.target_sid}-${data.card_index}`);
    
    backEl.innerHTML = getCardHTML(data.card_type);
    backEl.className = 'card-face card-back ' + data.card_type;
    if(data.card_type === 'Interrupteur') cardEl.classList.add('halo-anim');
    
    cardEl.classList.add('flipped');
    
    renderCenterSlots(data.cables_found, data.card_type === 'Bombe');
    updateTurnDisplay(data.next_turn_sid, data.next_turn_name, data.previous_turn);
});

socket.on('new_round_data', (data) => {
    canPlay = false;
    const indicator = document.getElementById('turnIndicator');
    indicator.innerText = "Nouvelle manche !";
    indicator.className = "";
    document.querySelectorAll('.status-dot').forEach(el => el.style.display = 'none');

    setTimeout(() => {
        startRoundAnimation(data.my_cards, data.turn_sid, data.turn_name, data.previous_turn);
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
        document.getElementById('chat-toggle').style.background = '#3498db';
    }
}
function handleChatEnter(e) { if(e.key === 'Enter') sendChatMessage(); }
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
    msgs.scrollTop = msgs.scrollHeight;
    
    const chat = document.getElementById('chat-container');
    if (chat.classList.contains('hidden')) {
        const btn = document.getElementById('chat-toggle');
        btn.style.background = '#e74c3c';
        setTimeout(() => btn.style.background = '#3498db', 300);
        setTimeout(() => btn.style.background = '#e74c3c', 600);
    }
});