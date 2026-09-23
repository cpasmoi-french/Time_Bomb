from flask import Flask, render_template, request
from flask_socketio import SocketIO, join_room, emit
import random
import string

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

games = {}

def generate_room_code():
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))

def start_round(room):
    game = games[room]
    deck = []
    
    if game['round'] == 1:
        total_cards = len(game['players']) * 5
        deck = ['Bombe'] + ['Interrupteur'] * game['cables_needed'] + ['Neutre'] * (total_cards - 1 - game['cables_needed'])
    else:
        for sid, p_cards in game['cards'].items():
            deck.extend([c['type'] for c in p_cards if not c['revealed']])
            
    random.shuffle(deck)
    game['cards_revealed_this_round'] = 0
    cards_per_player = 5 - (game['round'] - 1)
    
    # Réinitialisation des bulles d'annonce pour la manche
    game['announcements'] = {}
    
    for i, sid in enumerate(game['players'].keys()):
        player_cards = deck[i*cards_per_player : (i+1)*cards_per_player]
        game['cards'][sid] = [{'type': card, 'revealed': False} for card in player_cards]
    
    # Gestion des annonces
    if game['settings'].get('annonces'):
        game['phase'] = 'announcing'
        players_sids = list(game['players'].keys())
        idx = players_sids.index(game['turn'])
        # L'ordre commence par celui qui joue, puis fait le tour
        game['announce_order'] = players_sids[idx:] + players_sids[:idx]
        game['announce_turn'] = game['announce_order'][0]
    else:
        game['phase'] = 'playing'

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('create_game')
def on_create(data):
    room = generate_room_code()
    games[room] = {
        'host': request.sid,
        'players': {request.sid: data['playerName']},
        'settings': data,
        'cards': {}, 'roles': {}, 'announcements': {},
        'turn': None, 'previous_turn': None,
        'state': 'lobby', 'round': 1, 'phase': 'lobby',
        'cables_found': 0, 'cables_needed': int(data['interrupteurs'])
    }
    join_room(room)
    emit('game_created', {'room': room}, to=request.sid)
    emit('update_lobby', {'players': list(games[room]['players'].values()), 'host_sid': request.sid}, to=room)

@socketio.on('join_game')
def on_join(data):
    room = data['room'].upper()
    if room in games and games[room]['state'] == 'lobby':
        if len(games[room]['players']) < 8:
            join_room(room)
            games[room]['players'][request.sid] = data['playerName']
            emit('joined_success', {'room': room}, to=request.sid)
            emit('update_lobby', {'players': list(games[room]['players'].values()), 'host_sid': games[room]['host']}, to=room)
        else:
            emit('error', {'msg': 'La partie est pleine.'}, to=request.sid)
    else:
        emit('error', {'msg': 'Code invalide.'}, to=request.sid)

@socketio.on('start_game')
def on_start(data):
    room = data['room']
    game = games[room]
    if request.sid != game['host']: return
        
    game['state'] = 'playing'
    game['round'] = 1
    game['cables_found'] = 0
    game['previous_turn'] = None
    
    players_sids = list(game['players'].keys())
    roles_list = ['Gentil'] * int(game['settings']['gentils']) + ['Méchant'] * int(game['settings']['mechants'])
    random.shuffle(roles_list)
    for i, sid in enumerate(players_sids):
        game['roles'][sid] = roles_list[i] if i < len(roles_list) else 'Spectateur'
        
    game['turn'] = random.choice(players_sids)
    start_round(room)
    
    for sid in players_sids:
        emit('game_started', {
            'role': game['roles'][sid],
            'my_cards': game['cards'][sid],
            'all_players': game['players'],
            'phase': game['phase'],
            'announce_turn_sid': game.get('announce_turn'),
            'announce_turn_name': game['players'].get(game.get('announce_turn', '')),
            'turn_name': game['players'][game['turn']],
            'turn_sid': game['turn'],
            'previous_turn': None,
            'cables_needed': game['cables_needed']
        }, to=sid)

@socketio.on('make_announcement')
def on_make_announcement(data):
    room = data['room']
    game = games[room]
    if game['phase'] != 'announcing' or request.sid != game['announce_turn']: return
    
    msg = f"{data['cables']} ✅ | {'💣 Oui' if data['bomb'] else 'Aucune 💣'}"
    game['announcements'][request.sid] = msg
    
    emit('player_announced', {'sid': request.sid, 'msg': msg}, to=room)
    
    game['announce_order'].pop(0)
    if len(game['announce_order']) == 0:
        game['phase'] = 'playing'
        emit('announcements_done', {'turn_sid': game['turn'], 'turn_name': game['players'][game['turn']]}, to=room)
    else:
        game['announce_turn'] = game['announce_order'][0]
        emit('request_announcement', {
            'announce_turn_sid': game['announce_turn'], 
            'announce_turn_name': game['players'][game['announce_turn']]
        }, to=room)

@socketio.on('reveal_card')
def on_reveal(data):
    room = data['room']
    game = games[room]
    if game['phase'] != 'playing': return
    
    target_sid = data['target_sid']
    card_index = data['card_index']
    
    if request.sid != game['turn']: return emit('error', {'msg': "Pas ton tour !"}, to=request.sid)
    if target_sid == request.sid: return emit('error', {'msg': "Pas chez toi-même !"}, to=request.sid)
    if target_sid == game['previous_turn'] and len(game['players']) > 2: return emit('error', {'msg': "Pas chez lui !"}, to=request.sid)

    card = game['cards'][target_sid][card_index]
    if card['revealed']: return
        
    card['revealed'] = True
    game['cards_revealed_this_round'] += 1
    game['previous_turn'] = request.sid
    game['turn'] = target_sid
    
    # On cache la bulle d'annonce de la carte révélée (optionnel)
    
    if card['type'] == 'Interrupteur': game['cables_found'] += 1

    emit('card_revealed', {
        'target_sid': target_sid, 'card_index': card_index, 'card_type': card['type'],
        'next_turn_name': game['players'][game['turn']], 'next_turn_sid': game['turn'],
        'previous_turn': game['previous_turn'], 'cables_found': game['cables_found']
    }, to=room)

    if card['type'] == 'Bombe':
        emit('game_over', {'winner': 'Méchants', 'reason': 'La bombe a explosé !'}, to=room)
        return
    elif game['cables_found'] >= game['cables_needed']:
        emit('game_over', {'winner': 'Gentils', 'reason': 'Tous les interrupteurs ont été trouvés !'}, to=room)
        return

    if game['cards_revealed_this_round'] == len(game['players']):
        game['round'] += 1
        if game['round'] > 4:
            emit('game_over', {'winner': 'Méchants', 'reason': 'Le temps est écoulé !'}, to=room)
        else:
            start_round(room)
            for sid in game['players'].keys():
                emit('new_round_data', {
                    'my_cards': game['cards'][sid], 'round': game['round'], 
                    'phase': game['phase'],
                    'announce_turn_sid': game.get('announce_turn'),
                    'announce_turn_name': game['players'].get(game.get('announce_turn', '')),
                    'turn_name': game['players'][game['turn']], 'turn_sid': game['turn'], 
                    'previous_turn': game['previous_turn']
                }, to=sid)

@socketio.on('chat_message')
def on_chat_message(data):
    room = data['room']
    game = games.get(room)
    if game:
        emit('chat_message', {'sender': game['players'].get(request.sid, "Joueur"), 'msg': data['msg']}, to=room)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)