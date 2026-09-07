const { WebSocket } = require('ws');

// Talks to the always-on relay server (server/index.js) over a single
// WebSocket connection. Every player - host included - only ever makes an
// outbound connection to that server, so no port forwarding / router
// configuration is needed on anyone's machine to play over the internet.
// Solo play stays fully local and never touches the network.
class NetManager {
  constructor(emit) {
    this.emit = emit; // (channel, payload) => void, forwards to the renderer
    this._resetLocalState();
    this.relayWs = null;
    this.relayUrl = null;
    this.pendingOnce = new Map(); // responseType -> { resolve }
  }

  _resetLocalState() {
    this.role = null; // 'host' | 'client' | 'solo'
    this.roomId = null;
    this.title = null;
    this.localId = null;
    this.players = [];
  }

  _closeRelay() {
    if (this.relayWs) {
      const ws = this.relayWs;
      this.relayWs = null;
      ws.removeAllListeners();
      try { ws.close(); } catch { /* ignore */ }
    }
    for (const { resolve } of this.pendingOnce.values()) resolve({ __timedOut: true });
    this.pendingOnce.clear();
  }

  _handleMessage(msg) {
    const pending = this.pendingOnce.get(msg.type);
    if (pending) {
      this.pendingOnce.delete(msg.type);
      pending.resolve(msg);
      return;
    }
    if (msg.type === 'players') {
      this.players = msg.players;
      this.emit('net:players-update', msg.players);
    } else if (msg.type === 'room_closed') {
      this.emit('net:disconnected', { reason: msg.reason || '방이 종료되었습니다.' });
      // removeAllListeners() 전에 소켓이 이미 닫히는 중이라, 뒤이어 오는 원격 close
      // 이벤트가 위 메시지를 덮어쓰는 일반 "연결 끊김" 알림을 한 번 더 emit하지 않도록 정리한다.
      this._closeRelay();
      this._resetLocalState();
    } else if (msg.type === 'kicked') {
      this.emit('net:disconnected', { reason: msg.reason || '호스트가 당신을 강퇴했습니다.', kicked: true });
      this._closeRelay();
      this._resetLocalState();
    } else if (msg.type === 'room_renamed') {
      this.title = msg.title;
      this.emit('net:game-event', msg);
    } else {
      this.emit('net:game-event', msg);
    }
  }

  async _ensureRelayConnection(url) {
    if (!url) throw new Error('중계 서버 주소를 입력해주세요.');
    if (this.relayWs && this.relayWs.readyState === WebSocket.OPEN && this.relayUrl === url) return;

    this._closeRelay();
    this.relayUrl = url;

    await new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(new Error('중계 서버 주소가 올바르지 않습니다: ' + err.message));
        return;
      }
      this.relayWs = ws;

      // Free-tier hosts (e.g. Render) can take up to ~50s to wake a sleeping
      // instance on its first connection, so this stays generous.
      const openTimeout = setTimeout(() => {
        reject(new Error('중계 서버 연결 시간이 초과되었습니다. (무료 서버는 첫 접속 시 깨어나는 데 시간이 걸릴 수 있어요. 잠시 후 다시 시도해주세요)'));
      }, 45000);

      const onOpenError = (err) => {
        clearTimeout(openTimeout);
        reject(new Error('중계 서버에 연결할 수 없습니다: ' + err.message));
      };

      ws.once('open', () => {
        clearTimeout(openTimeout);
        ws.removeListener('error', onOpenError);
        resolve();
      });
      ws.once('error', onOpenError);

      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
        if (!msg || typeof msg.type !== 'string') return;
        this._handleMessage(msg);
      });

      ws.on('close', () => {
        if (this.relayWs === ws) {
          this.relayWs = null;
          if (this.role === 'host' || this.role === 'client') {
            this.emit('net:disconnected', { reason: '중계 서버와의 연결이 끊어졌습니다.' });
          }
        }
      });
      ws.on('error', () => {}); // post-open errors are surfaced via 'close'
    });
  }

  _request(payload, expectedTypes, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
      if (!this.relayWs || this.relayWs.readyState !== WebSocket.OPEN) {
        reject(new Error('중계 서버 연결이 없습니다.'));
        return;
      }
      const entry = {
        resolve: (msg) => {
          clearTimeout(timer);
          expectedTypes.forEach((t) => { if (this.pendingOnce.get(t) === entry) this.pendingOnce.delete(t); });
          if (msg && msg.__timedOut) reject(new Error('중계 서버 연결이 끊어졌습니다.'));
          else resolve(msg);
        },
      };
      expectedTypes.forEach((t) => this.pendingOnce.set(t, entry));
      const timer = setTimeout(() => {
        expectedTypes.forEach((t) => { if (this.pendingOnce.get(t) === entry) this.pendingOnce.delete(t); });
        reject(new Error('서버 응답이 없습니다. 서버 주소/상태를 확인해주세요.'));
      }, timeoutMs);
      this.relayWs.send(JSON.stringify(payload));
    });
  }

  // ---------- room browsing ----------
  async listRooms({ serverUrl }) {
    try {
      await this._ensureRelayConnection(serverUrl);
      const res = await this._request({ type: 'list_rooms' }, ['room_list']);
      return { ok: true, rooms: res.rooms || [] };
    } catch (err) {
      return { ok: false, error: err.message, rooms: [] };
    }
  }

  // ---------- hosting ----------
  async hostRoom({ serverUrl, title, isPrivate, password, hostName }) {
    try {
      await this._ensureRelayConnection(serverUrl);
      const res = await this._request(
        { type: 'create_room', title, isPrivate: !!isPrivate, password, hostName },
        ['room_created']
      );
      this.role = 'host';
      this.roomId = res.roomId;
      this.localId = res.playerId;
      this.title = res.title;
      this.players = res.players;
      return { ok: true, roomId: this.roomId, localId: this.localId, title: this.title, players: this.players };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ---------- joining ----------
  async joinRoom({ serverUrl, roomId, password, playerName }) {
    try {
      await this._ensureRelayConnection(serverUrl);
      const res = await this._request(
        { type: 'join_room', roomId, password: password || '', playerName },
        ['join_ok', 'join_fail']
      );
      if (res.type === 'join_fail') {
        return { ok: false, error: res.reason || '입장에 실패했습니다.' };
      }
      this.role = 'client';
      this.roomId = res.roomId;
      this.localId = res.playerId;
      this.title = res.title;
      this.players = res.players;
      return { ok: true, roomId: this.roomId, localId: this.localId, title: this.title, players: this.players };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // ---------- solo (fully local, no networking) ----------
  async startSolo({ playerName }) {
    this._closeRelay();
    this._resetLocalState();
    this.role = 'solo';
    this.localId = 'solo-' + Date.now();
    this.title = '싱글 플레이';
    this.players = [{ id: this.localId, name: playerName || '모험가', isHost: true, job: null }];
    this.emit('net:players-update', this.players);
    return { ok: true, localId: this.localId, players: this.players };
  }

  // ---------- shared game actions ----------
  async startGame() {
    if (this.role === 'solo') {
      this.emit('net:game-event', { type: 'game_start' });
    } else if (this.relayWs && this.relayWs.readyState === WebSocket.OPEN) {
      this.relayWs.send(JSON.stringify({ type: 'start_game' }));
    }
    return { ok: true };
  }

  async sendAction(action) {
    if (this.role === 'solo') {
      this.emit('net:game-event', { ...action, senderId: this.localId });
    } else if (this.relayWs && this.relayWs.readyState === WebSocket.OPEN) {
      this.relayWs.send(JSON.stringify({ type: 'action', payload: action }));
    }
    return { ok: true };
  }

  async kickPlayer(targetId) {
    if (this.role === 'host' && this.relayWs && this.relayWs.readyState === WebSocket.OPEN) {
      this.relayWs.send(JSON.stringify({ type: 'kick_player', targetId }));
    }
    return { ok: true };
  }

  async renameRoom(title) {
    if (this.role === 'host' && this.relayWs && this.relayWs.readyState === WebSocket.OPEN) {
      this.relayWs.send(JSON.stringify({ type: 'rename_room', title }));
    }
    return { ok: true };
  }

  async leaveRoom() {
    if (this.relayWs && this.relayWs.readyState === WebSocket.OPEN) {
      try { this.relayWs.send(JSON.stringify({ type: 'leave_room' })); } catch { /* ignore */ }
    }
    this._closeRelay();
    this._resetLocalState();
    return { ok: true };
  }

  shutdown() {
    this._closeRelay();
  }
}

module.exports = NetManager;
