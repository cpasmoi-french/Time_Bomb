const socket = io();
let currentRoom = '';
let mySid = '';

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
    socket.emit('join_game', { room: room, playerName: name });
}

function startGame() {
    socket.emit('start_game', { room: currentRoom });
}

// Réceptions Socket.io
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
});

socket.on('game_started', (data) => {
    document.getElementById('menu-container').style.display = 'none';
    document.getElementById('game-board').style.display = 'block';
    
    document.getElementById('myRole').innerText = data.role;
    document.getElementById('turnIndicator').innerText = "C'est au tour de : " + data.turn;

    const area = document.getElementById('players-area');
    area.innerHTML = '';

    // Génération du plateau pour tous les joueurs
    for (const [sid, name] of Object.entries(data.all_players)) {
        let isMe = sid === socket.id; // socket.id contient notre propre identifiant unique
        
        let mat = document.createElement('div');
        mat.className = 'player-mat';
        mat.innerHTML = `<h3>${name}</h3><div class="cards-container" id="cards-${sid}"></div>`;
        area.appendChild(mat);
        
        const cardsContainer = mat.querySelector('.cards-container');
        
        // On dessine 5 cartes par joueur
        for (let i = 0; i < 5; i++) {
            let wrapper = document.createElement('div');
            wrapper.className = 'card-wrapper';
            
            // Si on clique sur une carte qui n'est pas la nôtre
            wrapper.onclick = () => {
                if (!isMe) socket.emit('reveal_card', { room: currentRoom, target_sid: sid, card_index: i });
            };

            wrapper.innerHTML = `
                <div class="card" id="card-${sid}-${i}">
                    <div class="card-face card-front">Time<br>Bomb</div>
                    <div class="card-face card-back" id="back-${sid}-${i}">?</div>
                </div>
            `;
            cardsContainer.appendChild(wrapper);
        }
    }
});

socket.on('card_revealed', (data) => {
    const cardEl = document.getElementById(`card-${data.target_sid}-${data.card_index}`);
    const backEl = document.getElementById(`back-${data.target_sid}-${data.card_index}`);
    
    // Assigne la couleur et le texte en fonction du type
    backEl.innerText = data.card_type;
    backEl.classList.add(data.card_type);
    
    // Déclenche l'animation CSS
    cardEl.classList.add('flipped');
    
    // Mise à jour du tour
    document.getElementById('turnIndicator').innerText = "C'est au tour de : " + data.next_turn;
});

socket.on('error', (data) => { alert(data.msg); });