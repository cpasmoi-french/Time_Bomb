const socket = io();
let currentRoom = '';
let mySid = '';
let totalCablesNeeded = 5;
let globalPlayers = {};

function createGame() {
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

function startGame() { socket.emit('start_game', { room: currentRoom }); }

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

    // Seul l'hôte voit le bouton lancer
    if (socket.id === data.host_sid) {
        document.getElementById('startBtn').style.display = 'block';
        document.getElementById('waitingMessage').style.display = 'none';
    }
});

socket.on('game_started', (data) => {
    document.getElementById('menu-container').style.display = 'none';
    document.getElementById('game-board').style.display = 'block';
    
    // Configuration de la carte Rôle (Coin de l'écran)
    const roleCard = document.getElementById('myRoleCard');
    roleCard.innerText = data.role;
    roleCard.className = 'role-back ' + data.role; // Applique la couleur CSS

    document.getElementById('turnIndicator').innerText = "Tour : " + data.turn;
    totalCablesNeeded = data.cables_needed;
    document.getElementById('cable-counter').innerText = `0 / ${totalCablesNeeded}`;
    
    globalPlayers = data.all_players;
    renderBoard(data.my_cards);
});

function renderBoard(myCardsData) {
    const area = document.getElementById('players-area');
    area.innerHTML = '';

    for (const [sid, name] of Object.entries(globalPlayers)) {
        let isMe = (sid === socket.id);
        
        let mat = document.createElement('div');
        mat.className = 'player-mat';
        mat.innerHTML = `<h3>${name} ${isMe ? '(Toi)' : ''}</h3><div class="cards-container" id="cards-${sid}"></div>`;
        area.appendChild(mat);
        
        const cardsContainer = mat.querySelector('.cards-container');
        
        // On génère autant de cartes HTML qu'on en a reçues du serveur
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
}

socket.on('card_revealed', (data) => {
    const cardEl = document.getElementById(`card-${data.target_sid}-${data.card_index}`);
    const backEl = document.getElementById(`back-${data.target_sid}-${data.card_index}`);
    
    if(data.card_type === 'Bombe') backEl.innerHTML = '💣<br>BOMBE';
    else if(data.card_type === 'Interrupteur') backEl.innerHTML = '✅<br>OK';
    else backEl.innerHTML = 'Neutre';

    backEl.className = 'card-face card-back ' + data.card_type;
    cardEl.classList.add('flipped');
    
    document.getElementById('turnIndicator').innerText = "Tour : " + data.next_turn;
    document.getElementById('cable-counter').innerText = `${data.cables_found} / ${totalCablesNeeded}`;
});

// Lorsqu'une manche se termine
socket.on('new_round_data', (data) => {
    // On attend 3 secondes pour que tout le monde voie la dernière carte avant de redistribuer
    setTimeout(() => {
        document.getElementById('turnIndicator').innerText = "Nouvelle manche !";
        renderBoard(data.my_cards);
    }, 3000);
});

socket.on('game_over', (data) => {
    setTimeout(() => {
        if (data.winner === 'Méchants') {
            document.getElementById('explosion-overlay').classList.add('explode-anim');
            setTimeout(() => alert(data.reason + " Les Méchants gagnent !"), 500);
        } else {
            confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
            setTimeout(() => alert(data.reason + " Les Gentils gagnent !"), 500);
        }
    }, 1000); // Petit délai pour laisser la carte se retourner
});

socket.on('error', (data) => { alert(data.msg); });