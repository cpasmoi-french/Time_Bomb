const socket = io();
let currentRoom = '';
let globalPlayers = {};
let totalCablesNeeded = 5;
let currentTurnSid = '';
let previousTurnSid = null;
let hostSid = '';

// --- Formulaire dynamique ---
function autoFillSettings() {
    const j = parseInt(document.getElementById('nbJoueurs').value);
    const gentils = Math.ceil(j / 2) + 1;
    const mechants = Math.floor(j / 2);
    
    document.getElementById('gentils').value = gentils;
    document.getElementById('mechants').value = mechants;
    document.getElementById('interrupteurs').value = j;
    
    document.getElementById('infoGentils').innerText = gentils;
    document.getElementById('infoMechants').innerText = mechants;
    document.getElementById('infoInterrupteurs').innerText = j;
}

// --- Système de Notifications (remplace alert) ---
function showToast(msg) {
    const toast = document.getElementById('toast-msg');
    toast.innerText = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// --- Lancement / Menu ---
function createGame() {
    autoFillSettings(); // Sécurité
    const data = {
        playerName: document.getElementById('playerName').value,
        gentils: document.getElementById('gentils').value,
        mechants: document.getElementById('mechants').value,
        interrupteurs: document.getElementById('interrupteurs').value
    };
    if(data.playerName) socket.emit('create_game', data);
}

function joinGame() {
    const room = document.getElementById('roomCodeInput').value;
    const name = document.getElementById('playerName').value;
    if(name && room) socket.emit('join_game', { room: room, playerName: name });
}

function startGame() { 
    socket.emit('start_game', { room: currentRoom }); 
}

socket.on('game_created', (data) => {
    currentRoom = data.room;
    document.getElementById('creation-form').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('displayRoomCode').innerText = currentRoom;
});

socket.on('joined_success', (data) => {
    currentRoom = data.room;
    document.getElementById('creation-form').style.display = 'none';
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('displayRoomCode').innerText = currentRoom;
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
        document.getElementById('btn-replay').style.display = 'inline-block'; // Bouton fin de jeu
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

// --- Affichage Visuel ---
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
    
    // Mise à jour des points rouges/verts
    for (const sid of Object.keys(globalPlayers)) {
        const dot = document.getElementById(`dot-${sid}`);
        if (!dot) continue;
        
        // Impossible de piocher chez le joueur actuel OU chez le précédent (si > 2 joueurs)
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
    
    // Ajout des cases pour les câbles
    for(let i = 0; i < totalCablesNeeded; i++) {
        let slot = document.createElement('div');
        slot.className = 'mini-slot ' + (i < found ? 'filled-cable' : 'empty-cable');
        if (i < found) slot.innerHTML = '✅';
        container.appendChild(slot);
    }
    
    // Ajout de la case Bombe
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
    // Forcer la maj des couleurs des points
    updateTurnDisplay(currentTurnSid, globalPlayers[currentTurnSid], previousTurnSid);
}

// --- Réceptions d'actions ---
socket.on('card_revealed', (data) => {
    const cardEl = document.getElementById(`card-${data.target_sid}-${data.card_index}`);
    const backEl = document.getElementById(`back-${data.target_sid}-${data.card_index}`);
    
    if(data.card_type === 'Bombe') backEl.innerHTML = '💣<br>BOMBE';
    else if(data.card_type === 'Interrupteur') backEl.innerHTML = '✅<br>OK';
    else backEl.innerHTML = 'Neutre';

    backEl.className = 'card-face card-back ' + data.card_type;
    cardEl.classList.add('flipped');
    
    renderCenterSlots(data.cables_found, data.card_type === 'Bombe');
    updateTurnDisplay(data.next_turn_sid, data.next_turn_name, data.previous_turn);
});

socket.on('new_round_data', (data) => {
    const indicator = document.getElementById('turnIndicator');
    indicator.innerText = "Nouvelle manche !";
    indicator.className = "";
    
    // On efface les points le temps de l'animation
    document.querySelectorAll('.status-dot').forEach(el => el.style.display = 'none');

    setTimeout(() => {
        renderBoard(data.my_cards);
        updateTurnDisplay(data.turn_sid, data.turn_name, data.previous_turn);
    }, 3000);
});

// --- Fin de partie et erreurs ---
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