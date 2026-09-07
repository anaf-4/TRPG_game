// 브라우저(및 Capacitor 안드로이드 WebView)에서 window.gameNet을 직접 제공하는 어댑터.
//
// Electron 빌드에서는 preload.js가 contextBridge로 window.gameNet을 이미 주입해두므로
// 이 파일은 아무 일도 하지 않는다(맨 아래 가드 참고) — 즉 렌더러 코드(app.js 등)는
// Electron/모바일 어느 쪽에서 실행되는지 몰라도 되고, index.html 하나로 양쪽을 다 커버한다.
//
// src/net.js(Electron 메인 프로세스용 NetManager)와 로직은 동일하되, Node의 'ws'
// 패키지(EventEmitter 스타일: on/once/removeListener)를 브라우저 네이티브 WebSocket
// (onopen/onmessage/onclose/onerror 프로퍼티 스타일)으로 옮겨쓴 것만 다르다.
// 프로토콜(서버로 보내고 받는 메시지 모양)이 바뀌면 이 파일도 같이 고쳐야 한다.

(function () {
  if (typeof window === 'undefined') return; // Node(헤드리스 테스트 등) 환경에서는 로드하지 않음
  if (window.gameNet) return; // Electron의 preload.js가 이미 정의했으면 건드리지 않음

  class NetManager {
    constructor(emit) {
      this.emit = emit;
      this._resetLocalState();
      this.relayWs = null;
      this.relayUrl = null;
      this.pendingOnce = new Map();
    }

    _resetLocalState() {
      this.role = null;
      this.roomId = null;
      this.title = null;
      this.localId = null;
      this.players = [];
    }

    _closeRelay() {
      if (this.relayWs) {
        const ws = this.relayWs;
        this.relayWs = null;
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
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

    _ensureRelayConnection(url) {
      if (!url) return Promise.reject(new Error('중계 서버 주소를 입력해주세요.'));
      if (this.relayWs && this.relayWs.readyState === WebSocket.OPEN && this.relayUrl === url) return Promise.resolve();

      this._closeRelay();
      this.relayUrl = url;

      return new Promise((resolve, reject) => {
        let ws;
        try {
          ws = new WebSocket(url);
        } catch (err) {
          reject(new Error('중계 서버 주소가 올바르지 않습니다: ' + err.message));
          return;
        }
        this.relayWs = ws;

        // 무료 호스팅은 첫 접속 시 깨어나는 데 시간이 걸릴 수 있어 넉넉하게 잡는다.
        const openTimeout = setTimeout(() => {
          reject(new Error('중계 서버 연결 시간이 초과되었습니다. (무료 서버는 첫 접속 시 깨어나는 데 시간이 걸릴 수 있어요. 잠시 후 다시 시도해주세요)'));
        }, 45000);

        ws.onopen = () => {
          clearTimeout(openTimeout);
          ws.onerror = null; // 연결 이후의 에러는 onclose로 처리
          resolve();
        };
        ws.onerror = () => {
          clearTimeout(openTimeout);
          reject(new Error('중계 서버에 연결할 수 없습니다.'));
        };
        ws.onmessage = (event) => {
          let msg;
          try { msg = JSON.parse(event.data); } catch { return; }
          if (!msg || typeof msg.type !== 'string') return;
          this._handleMessage(msg);
        };
        ws.onclose = () => {
          if (this.relayWs === ws) {
            this.relayWs = null;
            if (this.role === 'host' || this.role === 'client') {
              this.emit('net:disconnected', { reason: '중계 서버와의 연결이 끊어졌습니다.' });
            }
          }
        };
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

    async listRooms({ serverUrl }) {
      try {
        await this._ensureRelayConnection(serverUrl);
        const res = await this._request({ type: 'list_rooms' }, ['room_list']);
        return { ok: true, rooms: res.rooms || [] };
      } catch (err) {
        return { ok: false, error: err.message, rooms: [] };
      }
    }

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

    async joinRoom({ serverUrl, roomId, password, playerName }) {
      try {
        await this._ensureRelayConnection(serverUrl);
        const res = await this._request(
          { type: 'join_room', roomId, password: password || '', playerName },
          ['join_ok', 'join_fail']
        );
        if (res.type === 'join_fail') return { ok: false, error: res.reason || '입장에 실패했습니다.' };
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
  }

  const listeners = { 'net:players-update': [], 'net:game-event': [], 'net:disconnected': [] };
  function emit(channel, payload) {
    (listeners[channel] || []).forEach((cb) => {
      try { cb(payload); } catch (err) { console.error(err); }
    });
  }

  const net = new NetManager(emit);

  window.gameNet = {
    listRooms: (payload) => net.listRooms(payload),
    hostRoom: (payload) => net.hostRoom(payload),
    joinRoom: (payload) => net.joinRoom(payload),
    startSolo: (payload) => net.startSolo(payload),
    sendAction: (payload) => net.sendAction(payload),
    leaveRoom: () => net.leaveRoom(),
    startGame: () => net.startGame(),
    kickPlayer: (targetId) => net.kickPlayer(targetId),
    renameRoom: (title) => net.renameRoom(title),
    on: (channel, callback) => {
      if (!listeners[channel]) return () => {};
      listeners[channel].push(callback);
      return () => {
        listeners[channel] = listeners[channel].filter((cb) => cb !== callback);
      };
    },
  };
})();
