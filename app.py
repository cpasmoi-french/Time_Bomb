from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, leave_room, emit
import random
import string

# Flask va chercher automatiquement index.html dans "templates" et le reste dans "static"
app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

games = {} # Stocke l'état des parties {room_code: game_data}

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('create_game')
def on_create(data):
    room = generate_room_code()
    games[room] = {
        'players': {}, # {sid: name}
        'settings': data, # gentils, mechants, interrupteurs
        'cards': {}, # {sid: [cartes]}
        'turn': None,
        'state': 'lobby'
    }
    join_room(room)
    games[room]['players'][request.sid] = data['playerName']
    emit('game_created', {'room': room}, to=request.sid)
    emit('update_lobby', {'players': list(games[room]['players'].values())}, to=room)

@socketio.on('join_game')
def on_join(data):
    room = data['room'].upper()
    if room in games and games[room]['state'] == 'lobby':
        if len(games[room]['players']) < 8:
            join_room(room)
            games[room]['players'][request.sid] = data['playerName']
            emit('joined_success', {'room': room}, to=request.sid)
            emit('update_lobby', {'players': list(games[room]['players'].values())}, to=room)
        else:
            emit('error', {'msg': 'La partie est pleine (8 joueurs max).'}, to=request.sid)
    else:
        emit('error', {'msg': 'Code invalide ou partie déjà lancée.'}, to=request.sid)

@socketio.on('start_game')
def on_start(data):
    room = data['room']
    game = games[room]
    game['state'] = 'playing'
    
    players_sids = list(game['players'].keys())
    num_players = len(players_sids)
    
    # Génération des rôles
    roles = ['Gentil'] * int(game['settings']['gentils']) + ['Méchant'] * int(game['settings']['mechants'])
    random.shuffle(roles)
    
    # Génération du deck (1 Bombe, X interrupteurs, le reste neutre)
    num_cables = int(game['settings']['interrupteurs'])
    total_cards = num_players * 5
    deck = ['Bombe'] + ['Interrupteur'] * num_cables + ['Neutre'] * (total_cards - 1 - num_cables)
    random.shuffle(deck)
    
    # Distribution
    game['turn'] = random.choice(players_sids)
    
    for i, sid in enumerate(players_sids):
        player_cards = deck[i*5 : (i+1)*5]
        game['cards'][sid] = [{'type': card, 'revealed': False} for card in player_cards]
        # Envoi individuel du rôle et des cartes à chaque joueur
        emit('game_started', {
            'role': roles[i] if i < len(roles) else 'Spectateur',
            'my_cards': game['cards'][sid],
            'all_players': game['players'],
            'turn': game['players'][game['turn']]
        }, to=sid)

@socketio.on('reveal_card')
def on_reveal(data):
    room = data['room']
    target_sid = data['target_sid']
    card_index = data['card_index']
    
    game = games[room]
    card = game['cards'][target_sid][card_index]
    
    if not card['revealed']:
        card['revealed'] = True
        game['turn'] = target_sid
        
        emit('card_revealed', {
            'target_sid': target_sid,
            'card_index': card_index,
            'card_type': card['type'],
            'next_turn': game['players'][game['turn']]
        }, to=room)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)