const socket = io();
let currentRoom = '';
let globalPlayers = {};
let totalCablesNeeded = 5;
let currentTurnSid = '';
let previousTurnSid = null;
let hostSid = '';
let canPlay = false; 
let isBoardLayout = false; // Mode Grille par défaut

// --- Layout Table Dynamique (Géométrie) ---
function toggleLayout() {
    isBoardLayout = !isBoardLayout;
    const btn = document.getElementById('layout-toggle');
    const board = document.getElementById('game-board');
    if(isBoardLayout) {
        btn.innerText = "Mode Grille 📱";
        board.classList.remove('layout-grid');
        board.classList.add('layout-board');
    } else {
        btn.innerText = "Mode Table 🎲";
        board.classList.remove('layout-board');
        board.classList.add('layout-grid');
    }
    updateTableLayout();
}

function updateTableLayout() {
    const oppMats = document.querySelectorAll('#opponents-area .player-mat');
    if(!isBoardLayout) {
        // En mode grille, on enlève le placement forcé
        oppMats.forEach(el => {
            el.style.position = ''; el.style.top = ''; el.style.left = ''; el.style.transform = '';
        });
        return;
    }
    
    const N = oppMats.length;
    if(N === 0) return;
    
    // Rayon du cercle autour de la table (adapté à l'écran)
    const rx = Math.min(window.innerWidth * 0.4, 400); 
    const ry = Math.min(window.innerHeight * 0.35, 300);
    
    let startAngle, endAngle;
    
    // Détermination de l'arc de placement en fonction du nombre d'adversaires
    if (N === 1) { 
        // Total 2 joueurs : Adversaire en face
        startAngle = Math.PI * 1.5; 
        endAngle = Math.PI * 1.5;
    } else if (N === 2) { 
        // Total 3 joueurs : Triangle avec nous (Haut-Gauche, Haut-Droite)
        startAngle = Math.PI * 1.15; 
        endAngle = Math.PI * 1.85; 
    } else if (N === 3) { 
        // Total 4 joueurs : Carré avec nous (Gauche, Haut, Droite)
        startAngle = Math.PI; 
        endAngle = Math.PI * 2; 
    } else { 
        // Total 5+ joueurs : On utilise un arc plus large qui descend sur les côtés
        startAngle = Math.PI * 0.9;
        endAngle = Math.PI * 2.1;
    }

    for (let i = 0; i < N; i++) {
        let f = (N === 1) ? 0 : i / (N - 1);
        let angle = startAngle + f * (endAngle - startAngle);
        
        // Calcul des coordonnées x et y à partir du centre
        let x = Math.cos(angle) * rx;
        let y = Math.sin(angle) * ry;

        let el = oppMats[i];
        el.style.position = 'absolute';
        el.style.left = `calc(50% + ${x}px)`;
        el.style.top = `calc(50% + ${y}px)`; // Centré par rapport au milieu de l'écran
        el.style.transform = 'translate(-50%, -50%)';
    }
}

// Recalcule le layout si la taille de la fenêtre change
window.addEventListener('resize', () => { if(isBoardLayout) updateTableLayout(); });

// --- Helpers ---
function getCardHTML(type) {
    if(type === 'Bombe') return '💣';
    if(type === 'Interrupteur') return `<div class="cable-art"><div class="cable-line"></div><div class="cable-line green"></div><div class="cable-line"></div></div>`;
    return `<div class="cable-art"><div class="cable-line"></div><div class="cable-line"></div><div class="cable-line"></div></div>`;
}

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

function createGame() {
    const data = {
        playerName: document.getElementById('playerName').value,
        gentils: document.getElementById('gentils').value,
        mechants: document.getElementById('mechants').value,
        interrupteurs: document.getElementById('interrupteurs').value,
        annonces: document.getElementById('opt-annonces').checked
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
    
    const roleCard = document.getElementById('myRoleCard');
    roleCard.innerText = data.role;
    roleCard.className = 'role-back ' + data.role;

    renderCenterSlots(0, false);
    document.getElementById('opponents-area').innerHTML = '';
    document.getElementById('my-area').innerHTML = '';
    document.getElementById('turnIndicator').innerText = "Distribution...";

    const roleCont = document.getElementById('role-card-container');
    const darkOverlay = document.getElementById('dark-overlay');
    roleCont.classList.add('center-reveal');
    darkOverlay.style.display = 'block';
    setTimeout(() => darkOverlay.style.opacity = '1', 10);

    setTimeout(() => {
        roleCont.classList.add('active'); 
        setTimeout(() => {
            roleCont.classList.remove('active'); 
            setTimeout(() => {
                roleCont.classList.remove('center-reveal'); 
                darkOverlay.style.opacity = '0';
                setTimeout(() => {
                    darkOverlay.style.display = 'none';
                    startRoundAnimation(data);
                }, 800); 
            }, 600);
        }, 3000); 
    }, 500);
});

function startRoundAnimation(data) {
    canPlay = false;
    document.getElementById('turnIndicator').innerText = "Mémorise tes cartes !";
    document.querySelectorAll('.speech-bubble').forEach(b => b.classList.add('hidden'));

    renderBoard(data.my_cards, true); 

    setTimeout(() => {
        document.querySelectorAll('.initial-reveal').forEach(c => c.classList.remove('flipped')); 
        setTimeout(() => {
            if(data.phase === 'announcing') {
                handleAnnounceTurn(data.announce_turn_sid, data.announce_turn_name);
            } else {
                canPlay = true;
                updateTurnDisplay(data.turn_sid, data.turn_name, data.previous_turn);
            }
        }, 600);
    }, 4000);
}

// --- Système d'Annonces ---
function handleAnnounceTurn(sid, name) {
    canPlay = false;
    if (sid === socket.id) {
        document.getElementById('announcement-modal').classList.remove('hidden');
        document.getElementById('turnIndicator').innerText = "À TOI d'annoncer !";
    } else {
        document.getElementById('turnIndicator').innerText = `Annonce de ${name}...`;
    }
}
socket.on('request_announcement', (data) => handleAnnounceTurn(data.announce_turn_sid, data.announce_turn_name));

function submitAnnouncement() {
    const cables = document.getElementById('announce-cables').value;
    const bomb = document.getElementById('announce-bomb').checked;
    socket.emit('make_announcement', { room: currentRoom, cables: cables, bomb: bomb });
    document.getElementById('announcement-modal').classList.add('hidden');
}

socket.on('player_announced', (data) => {
    const bubble = document.getElementById(`bubble-${data.sid}`);
    if(bubble) {
        bubble.innerText = data.msg;
        bubble.classList.remove('hidden');
    }
});
socket.on('announcements_done', (data) => {
    canPlay = true;
    updateTurnDisplay(data.turn_sid, data.turn_name, previousTurnSid);
});

// --- Rendu Visuel ---
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
    const cablesCont = document.getElementById('slots-container');
    const bombCont = document.getElementById('bomb-slot-container');
    cablesCont.innerHTML = '';
    bombCont.innerHTML = '';
    
    let bombSlot = document.createElement('div');
    bombSlot.className = 'mini-slot ' + (bombExploded ? 'filled-bomb' : 'empty-bomb');
    bombSlot.innerHTML = '💣';
    bombCont.appendChild(bombSlot);

    for(let i = 0; i < totalCablesNeeded; i++) {
        let slot = document.createElement('div');
        slot.className = 'mini-slot ' + (i < found ? 'filled-cable' : 'empty-cable');
        if (i < found) slot.innerHTML = `<div class="cable-art mini-art"><div class="cable-line"></div><div class="cable-line green"></div><div class="cable-line"></div></div>`;
        cablesCont.appendChild(slot);
    }
}

function renderBoard(myCardsData, isInitialReveal = false) {
    const oppArea = document.getElementById('opponents-area');
    const myArea = document.getElementById('my-area');
    oppArea.innerHTML = '';
    myArea.innerHTML = '';

    for (const [sid, name] of Object.entries(globalPlayers)) {
        let isMe = (sid === socket.id);
        let mat = document.createElement('div');
        mat.className = 'player-mat' + (isMe ? ' my-mat' : '');
        mat.innerHTML = `
            <div class="speech-bubble hidden" id="bubble-${sid}"></div>
            <div class="status-dot dot-green" id="dot-${sid}"></div>
            <h3>${name} ${isMe ? '(Toi)' : ''}</h3>
            <div class="cards-container" id="cards-${sid}"></div>
        `;
        
        if(isMe) myArea.appendChild(mat);
        else oppArea.appendChild(mat);
        
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
    updateTableLayout();
    if (!isInitialReveal) updateTurnDisplay(currentTurnSid, globalPlayers[currentTurnSid], previousTurnSid);
}

socket.on('card_revealed', (data) => {
    const cardEl = document.getElementById(`card-${data.target_sid}-${data.card_index}`);
    const backEl = document.getElementById(`back-${data.target_sid}-${data.card_index}`);
    
    backEl.innerHTML = getCardHTML(data.card_type);
    backEl.className = 'card-face card-back ' + data.card_type;
    if(data.card_type === 'Interrupteur') cardEl.classList.add('halo-anim');
    cardEl.classList.add('flipped');
    
    const bubble = document.getElementById(`bubble-${data.target_sid}`);
    if (bubble) bubble.classList.add('hidden');
    
    renderCenterSlots(data.cables_found, data.card_type === 'Bombe');
    updateTurnDisplay(data.next_turn_sid, data.next_turn_name, data.previous_turn);
});

socket.on('new_round_data', (data) => {
    canPlay = false;
    const indicator = document.getElementById('turnIndicator');
    indicator.innerText = "Nouvelle manche !";
    indicator.className = "";
    document.querySelectorAll('.status-dot').forEach(el => el.style.display = 'none');

    setTimeout(() => { startRoundAnimation(data); }, 3000);
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

// --- Chat ---
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