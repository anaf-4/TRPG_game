// TRPG: 용을 쫓는 자들 - 중계 서버
//
// 모든 플레이어(호스트 포함)가 이 서버에 아웃바운드 WebSocket 연결을 맺는다.
// 포트포워딩이나 공유기 설정 없이, 서버 주소 하나만 알면 인터넷 너머
// 다른 네트워크에 있는 친구와도 같은 방에서 게임할 수 있다.
//
// 프로토콜 (모두 JSON 한 줄):
//   클라이언트 -> 서버
//     { type:'list_rooms' }
//     { type:'create_room', title, isPrivate, password, hostName }
//     { type:'join_room', roomId, password, playerName }
//     { type:'start_game' }                      // 방장만 유효
//     { type:'action', payload:{...} }            // 방 전체(자신 포함)로 그대로 릴레이됨
//     { type:'kick_player', targetId }            // 방장만 유효
//     { type:'rename_room', title }               // 방장만 유효
//     { type:'leave_room' }
//   서버 -> 클라이언트
//     { type:'room_list', rooms:[...] }
//     { type:'room_created', roomId, playerId, title, players }
//     { type:'join_ok', roomId, playerId, title, players }
//     { type:'join_fail', reason }
//     { type:'players', players }
//     { type:'room_closed', reason }
//     { type:'kicked', reason }                   // 추방된 본인에게만 전송
//     { type:'room_renamed', title }
//     그 외 action.payload 는 type 그대로 방 전체에 브로드캐스트된다 (예: game_start, job_selected, town_enter)

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;

// roomId -> { id, title, isPrivate, password, hostId, started, players: Map<playerId, {id,name,job,ws}> }
const rooms = new Map();

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`TRPG relay server is running. rooms=${rooms.size}\n`);
});

const wss = new WebSocketServer({ server });

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function publicRoomList() {
  return Array.from(rooms.values()).map((r) => ({
    roomId: r.id,
    title: r.title,
    isPrivate: r.isPrivate,
    started: r.started,
    playerCount: r.players.size,
    hostName: (r.players.get(r.hostId) || {}).name || '',
  }));
}

function playersPublic(room) {
  return Array.from(room.players.values()).map((p) => ({ id: p.id, name: p.name, isHost: p.id === room.hostId, job: p.job }));
}

function broadcastRoom(room, obj) {
  const str = JSON.stringify(obj);
  for (const p of room.players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(str);
  }
}

function broadcastPlayers(room) {
  broadcastRoom(room, { type: 'players', players: playersPublic(room) });
}

function uniqueName(room, base) {
  const trimmed = (base || '').toString().slice(0, 16).trim();
  let name = trimmed || '플레이어';
  const taken = new Set(Array.from(room.players.values()).map((p) => p.name));
  if (!taken.has(name)) return name;
  let i = 2;
  while (taken.has(`${name}(${i})`)) i++;
  return `${name}(${i})`;
}

function removePlayer(room, playerId) {
  if (!room.players.has(playerId)) return;
  room.players.delete(playerId);
  if (playerId === room.hostId || room.players.size === 0) {
    broadcastRoom(room, { type: 'room_closed', reason: '호스트가 방을 나가 방이 종료되었습니다.' });
    rooms.delete(room.id);
    return;
  }
  broadcastPlayers(room);
}

wss.on('connection', (ws) => {
  let roomId = null;
  let playerId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    switch (msg.type) {
      case 'list_rooms': {
        send(ws, { type: 'room_list', rooms: publicRoomList() });
        break;
      }

      case 'create_room': {
        const id = crypto.randomUUID();
        const hostId = crypto.randomUUID();
        const isPrivate = !!msg.isPrivate;
        const room = {
          id,
          title: (msg.title || '이름 없는 방').toString().slice(0, 40),
          isPrivate,
          password: isPrivate ? String(msg.password || '') : null,
          hostId,
          started: false,
          players: new Map(),
        };
        room.players.set(hostId, { id: hostId, name: (msg.hostName || '호스트').toString().slice(0, 16) || '호스트', job: null, ws });
        rooms.set(id, room);
        roomId = id;
        playerId = hostId;
        send(ws, { type: 'room_created', roomId: id, playerId: hostId, title: room.title, players: playersPublic(room) });
        break;
      }

      case 'join_room': {
        const room = rooms.get(msg.roomId);
        if (!room) { send(ws, { type: 'join_fail', reason: '존재하지 않는 방입니다. (호스트가 나갔을 수 있어요)' }); return; }
        if (room.started) { send(ws, { type: 'join_fail', reason: '이미 시작된 게임입니다.' }); return; }
        if (room.isPrivate && msg.password !== room.password) { send(ws, { type: 'join_fail', reason: '비밀번호가 일치하지 않습니다.' }); return; }

        const newId = crypto.randomUUID();
        const name = uniqueName(room, msg.playerName);
        room.players.set(newId, { id: newId, name, job: null, ws });
        roomId = room.id;
        playerId = newId;
        send(ws, { type: 'join_ok', roomId: room.id, playerId: newId, title: room.title, players: playersPublic(room) });
        broadcastPlayers(room);
        break;
      }

      case 'start_game': {
        const room = rooms.get(roomId);
        if (!room || playerId !== room.hostId) return;
        room.started = true;
        broadcastRoom(room, { type: 'game_start' });
        break;
      }

      case 'action': {
        const room = rooms.get(roomId);
        if (!room || !playerId || !msg.payload || typeof msg.payload.type !== 'string') return;
        broadcastRoom(room, { ...msg.payload, senderId: playerId });
        break;
      }

      case 'kick_player': {
        const room = rooms.get(roomId);
        if (!room || playerId !== room.hostId) return;
        const targetId = msg.targetId;
        if (!targetId || targetId === room.hostId) return;
        const target = room.players.get(targetId);
        if (!target) return;
        send(target.ws, { type: 'kicked', reason: '호스트가 당신을 강퇴했습니다.' });
        try { target.ws.close(); } catch { /* ignore */ }
        removePlayer(room, targetId);
        break;
      }

      case 'rename_room': {
        const room = rooms.get(roomId);
        if (!room || playerId !== room.hostId) return;
        const title = (msg.title || '').toString().slice(0, 40).trim();
        if (!title) return;
        room.title = title;
        broadcastRoom(room, { type: 'room_renamed', title: room.title });
        break;
      }

      case 'leave_room': {
        const room = rooms.get(roomId);
        if (room && playerId) removePlayer(room, playerId);
        roomId = null;
        playerId = null;
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    const room = rooms.get(roomId);
    if (room && playerId) removePlayer(room, playerId);
  });
  ws.on('error', () => {});
});

server.listen(PORT, () => {
  console.log(`TRPG relay server listening on port ${PORT}`);
});
