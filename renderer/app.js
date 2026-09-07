(() => {
  const { JOBS, TOWNS, LOCATION_INFO, findJobById } = window.GAME_DATA;

  const state = {
    nickname: '',
    serverUrl: '',
    role: null, // 'host' | 'client' | 'solo'
    localId: null,
    roomTitle: '',
    players: [], // {id, name, isHost, job}
    discoveredRooms: [],
    pendingJoinRoom: null,
    selectedLocation: null,
    joinPollTimer: null,
  };

  const els = {};
  function q(id) { return document.getElementById(id); }

  function cacheEls() {
    [
      'toast',
      'input-nickname', 'main-error', 'input-server-url',
      'btn-solo', 'btn-goto-create', 'btn-goto-join',
      'input-room-title', 'field-password', 'input-room-password', 'btn-create-room', 'create-error',
      'join-room-list', 'join-list-error',
      'modal-password', 'modal-password-title', 'input-join-password', 'modal-password-error', 'btn-modal-cancel', 'btn-modal-confirm',
      'lobby-title', 'lobby-players', 'lobby-host-controls', 'btn-start-game', 'lobby-wait-text', 'btn-leave-lobby',
      'job-grid', 'job-wait-text',
      'town-name', 'town-subtitle', 'town-description', 'party-bar', 'location-grid', 'location-detail', 'btn-leave-town',
    ].forEach((id) => { els[id] = q(id); });
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    q(id).classList.remove('hidden');
  }

  let toastTimer = null;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 3200);
  }

  function requireNickname() {
    const name = els['input-nickname'].value.trim();
    if (!name) {
      els['main-error'].textContent = '모험가 이름을 입력해주세요.';
      els['main-error'].classList.remove('hidden');
      return null;
    }
    els['main-error'].classList.add('hidden');
    state.nickname = name;
    try { localStorage.setItem('trpg_nickname', name); } catch { /* ignore */ }
    return name;
  }

  function getServerUrl() {
    const url = els['input-server-url'].value.trim() || els['input-server-url'].placeholder;
    state.serverUrl = url;
    try { localStorage.setItem('trpg_server_url', url); } catch { /* ignore */ }
    return url;
  }

  function stopJoinPolling() {
    if (state.joinPollTimer) { clearInterval(state.joinPollTimer); state.joinPollTimer = null; }
  }

  function resetToMain() {
    stopJoinPolling();
    window.gameNet.leaveRoom();
    state.role = null;
    state.localId = null;
    state.players = [];
    state.selectedLocation = null;
    showScreen('screen-main');
  }

  // ---------- main menu ----------
  function initMainMenu() {
    try {
      const saved = localStorage.getItem('trpg_nickname');
      if (saved) els['input-nickname'].value = saved;
      const savedUrl = localStorage.getItem('trpg_server_url');
      if (savedUrl) els['input-server-url'].value = savedUrl;
    } catch { /* ignore */ }

    els['btn-solo'].addEventListener('click', async () => {
      const name = requireNickname();
      if (!name) return;
      const res = await window.gameNet.startSolo({ playerName: name });
      if (res.ok) {
        state.role = 'solo';
        state.localId = res.localId;
        state.players = res.players;
        state.roomTitle = '싱글 플레이';
        enterLobby();
      }
    });

    els['btn-goto-create'].addEventListener('click', () => {
      if (!requireNickname()) return;
      showScreen('screen-create');
    });

    els['btn-goto-join'].addEventListener('click', () => {
      if (!requireNickname()) return;
      getServerUrl();
      showScreen('screen-join');
      startJoinPolling();
    });

    document.querySelectorAll('.back-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        stopJoinPolling();
        showScreen(btn.dataset.back);
      });
    });
  }

  // ---------- create room ----------
  function initCreateRoom() {
    document.querySelectorAll('input[name="visibility"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const isPrivate = document.querySelector('input[name="visibility"]:checked').value === 'private';
        els['field-password'].classList.toggle('hidden', !isPrivate);
      });
    });

    els['btn-create-room'].addEventListener('click', async () => {
      const title = els['input-room-title'].value.trim();
      const isPrivate = document.querySelector('input[name="visibility"]:checked').value === 'private';
      const password = els['input-room-password'].value;

      if (!title) return showCreateError('방 제목을 입력해주세요.');
      if (isPrivate && !password) return showCreateError('비공개방은 비밀번호를 입력해야 합니다.');

      const serverUrl = getServerUrl();
      const originalLabel = els['btn-create-room'].textContent;
      els['btn-create-room'].disabled = true;
      els['btn-create-room'].textContent = '서버에 연결하는 중... (무료 서버는 최초 접속 시 최대 1분 정도 걸릴 수 있어요)';
      const res = await window.gameNet.hostRoom({ serverUrl, title, isPrivate, password, hostName: state.nickname });
      els['btn-create-room'].disabled = false;
      els['btn-create-room'].textContent = originalLabel;

      if (!res.ok) return showCreateError(res.error || '방을 만들지 못했습니다.');

      state.role = 'host';
      state.localId = res.localId;
      state.players = res.players;
      state.roomTitle = title;
      els['input-room-title'].value = '';
      els['input-room-password'].value = '';
      els['create-error'].classList.add('hidden');
      enterLobby();
    });
  }

  function showCreateError(msg) {
    els['create-error'].textContent = msg;
    els['create-error'].classList.remove('hidden');
  }

  // ---------- join room ----------
  function startJoinPolling() {
    stopJoinPolling();
    state.discoveredRooms = [];
    renderJoinList();
    refreshRoomList();
    state.joinPollTimer = setInterval(refreshRoomList, 2000);
  }

  async function refreshRoomList() {
    const res = await window.gameNet.listRooms({ serverUrl: state.serverUrl });
    if (!q('screen-join').classList.contains('hidden')) {
      if (res.ok) {
        els['join-list-error'].classList.add('hidden');
        state.discoveredRooms = res.rooms;
        renderJoinList();
      } else {
        els['join-list-error'].textContent = res.error || '방 목록을 불러오지 못했습니다.';
        els['join-list-error'].classList.remove('hidden');
      }
    }
  }

  function renderJoinList() {
    const container = els['join-room-list'];
    container.innerHTML = '';
    if (state.discoveredRooms.length === 0) {
      const p = document.createElement('p');
      p.className = 'empty-text';
      p.textContent = '검색된 방이 없습니다. 같은 네트워크에서 방이 열리면 자동으로 표시됩니다.';
      container.appendChild(p);
      return;
    }
    state.discoveredRooms
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .forEach((room) => {
        const row = document.createElement('div');
        row.className = 'room-row';

        const info = document.createElement('div');
        info.className = 'room-row-info';
        const titleEl = document.createElement('div');
        titleEl.className = 'room-row-title';
        titleEl.textContent = room.title;
        const meta = document.createElement('div');
        meta.className = 'room-row-meta';
        const badge = room.isPrivate ? '<span class="badge badge-private">비공개</span>' : '<span class="badge badge-public">공개</span>';
        meta.innerHTML = `${badge}호스트: ${escapeHtml(room.hostName || '?')} · 인원 ${room.playerCount}${room.started ? ' · 진행중' : ''}`;
        info.appendChild(titleEl);
        info.appendChild(meta);

        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.textContent = room.started ? '입장 불가' : '입장';
        btn.disabled = !!room.started;
        btn.addEventListener('click', () => attemptJoin(room));

        row.appendChild(info);
        row.appendChild(btn);
        container.appendChild(row);
      });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function attemptJoin(room) {
    if (room.isPrivate) {
      state.pendingJoinRoom = room;
      els['modal-password-title'].textContent = `"${room.title}" 비밀번호 입력`;
      els['input-join-password'].value = '';
      els['modal-password-error'].classList.add('hidden');
      els['modal-password'].classList.remove('hidden');
      els['input-join-password'].focus();
    } else {
      doJoin(room, '');
    }
  }

  async function doJoin(room, password) {
    const res = await window.gameNet.joinRoom({ serverUrl: state.serverUrl, roomId: room.roomId, password, playerName: state.nickname });
    if (!res.ok) {
      if (state.pendingJoinRoom) {
        els['modal-password-error'].textContent = res.error || '입장에 실패했습니다.';
        els['modal-password-error'].classList.remove('hidden');
      } else {
        toast(res.error || '입장에 실패했습니다.');
      }
      return;
    }
    els['modal-password'].classList.add('hidden');
    state.pendingJoinRoom = null;
    stopJoinPolling();
    state.role = 'client';
    state.localId = res.localId;
    state.roomTitle = res.title;
    state.players = res.players;
    enterLobby();
  }

  function initJoinModal() {
    els['btn-modal-cancel'].addEventListener('click', () => {
      els['modal-password'].classList.add('hidden');
      state.pendingJoinRoom = null;
    });
    els['btn-modal-confirm'].addEventListener('click', () => {
      if (!state.pendingJoinRoom) return;
      doJoin(state.pendingJoinRoom, els['input-join-password'].value);
    });
    els['input-join-password'].addEventListener('keydown', (e) => {
      if (e.key === 'Enter') els['btn-modal-confirm'].click();
    });
  }

  // ---------- lobby ----------
  function enterLobby() {
    showScreen('screen-lobby');
    renderLobby();
  }

  function renderLobby() {
    els['lobby-title'].textContent = state.roomTitle || '방';
    els['lobby-players'].innerHTML = '';
    state.players.forEach((p) => {
      const li = document.createElement('li');
      const crown = p.isHost ? '<span class="crown">♛</span> ' : '';
      const you = p.id === state.localId ? '<span class="you-tag">(나)</span>' : '';
      li.innerHTML = `${crown}${escapeHtml(p.name)} ${you}`;
      els['lobby-players'].appendChild(li);
    });

    const isHostLike = state.role === 'host' || state.role === 'solo';
    els['lobby-host-controls'].classList.toggle('hidden', !isHostLike);
    els['lobby-wait-text'].classList.toggle('hidden', isHostLike);
  }

  function initLobby() {
    els['btn-start-game'].addEventListener('click', async () => {
      await window.gameNet.startGame();
    });
    els['btn-leave-lobby'].addEventListener('click', resetToMain);
  }

  // ---------- job select ----------
  function enterJobSelect() {
    showScreen('screen-job');
    renderJobSelect();
  }

  function renderJobSelect() {
    const grid = els['job-grid'];
    grid.innerHTML = '';
    const me = state.players.find((p) => p.id === state.localId);
    const myJob = me ? me.job : null;

    JOBS.tier1.forEach((job) => {
      const card = document.createElement('div');
      card.className = 'job-card';
      const takenBy = state.players.find((p) => p.job === job.id);
      if (myJob === job.id) card.classList.add('selected');
      if (myJob && myJob !== job.id) card.classList.add('disabled');

      card.innerHTML = `
        <div class="job-name">${escapeHtml(job.name)}${job.difficulty ? ` <small style="color:var(--danger)">(${escapeHtml(job.difficulty)})</small>` : ''}</div>
        <div class="job-skill"><strong>${escapeHtml(job.skillName)}</strong> — ${escapeHtml(job.skillEffect)}</div>
        <div class="job-flavor">${escapeHtml(job.flavor)}</div>
        ${takenBy ? `<div class="job-taken-by">${escapeHtml(takenBy.name)}${takenBy.id === state.localId ? ' (나)' : ''} 선택함</div>` : ''}
      `;

      card.addEventListener('click', () => {
        if (myJob) return;
        window.gameNet.sendAction({ type: 'job_selected', job: job.id });
      });

      grid.appendChild(card);
    });

    const chosenCount = state.players.filter((p) => p.job).length;
    if (myJob) {
      els['job-wait-text'].textContent = `선택 완료! 다른 모험가를 기다리는 중... (${chosenCount}/${state.players.length})`;
    } else {
      els['job-wait-text'].textContent = '직업을 선택해주세요.';
    }
  }

  // ---------- town ----------
  function enterTown() {
    showScreen('screen-town');
    const town = TOWNS[0];
    els['town-name'].textContent = town.name;
    els['town-subtitle'].textContent = `${town.subtitle} · 던전: ${town.dungeon}`;
    els['town-description'].textContent = town.description;

    renderPartyBar();

    const grid = els['location-grid'];
    grid.innerHTML = '';
    town.locations.concat([`${town.name}의 던전`]).forEach((loc) => {
      const btn = document.createElement('button');
      btn.className = 'location-btn';
      btn.textContent = loc;
      btn.addEventListener('click', () => selectLocation(loc, btn));
      grid.appendChild(btn);
    });
    els['location-detail'].innerHTML = '<p class="empty-text">장소를 선택해 설명을 확인하세요.</p>';
  }

  function selectLocation(loc, btnEl) {
    document.querySelectorAll('.location-btn').forEach((b) => b.classList.remove('active'));
    btnEl.classList.add('active');
    const info = LOCATION_INFO[loc] || '아직 준비되지 않은 장소입니다.';
    els['location-detail'].innerHTML = `<strong>${escapeHtml(loc)}</strong><p style="margin-top:10px">${escapeHtml(info)}</p>`;
  }

  function renderPartyBar() {
    const bar = els['party-bar'];
    bar.innerHTML = '';
    state.players.forEach((p) => {
      const job = findJobById(p.job);
      const chip = document.createElement('div');
      chip.className = 'party-chip';
      chip.textContent = `${p.name}${p.id === state.localId ? '(나)' : ''} · ${job ? job.name : '직업 미정'}`;
      bar.appendChild(chip);
    });
  }

  function initTown() {
    els['btn-leave-town'].addEventListener('click', resetToMain);
  }

  // ---------- networking events ----------
  function checkAllJobsChosenAndAdvance() {
    if (state.role !== 'host' && state.role !== 'solo') return;
    if (state.players.length > 0 && state.players.every((p) => p.job)) {
      window.gameNet.sendAction({ type: 'town_enter' });
    }
  }

  function wireNetworkEvents() {
    window.gameNet.on('net:players-update', (players) => {
      state.players = players;
      if (!q('screen-lobby').classList.contains('hidden')) renderLobby();
      if (!q('screen-job').classList.contains('hidden')) renderJobSelect();
      if (!q('screen-town').classList.contains('hidden')) renderPartyBar();
    });

    window.gameNet.on('net:game-event', (evt) => {
      if (evt.type === 'game_start') {
        enterJobSelect();
      } else if (evt.type === 'job_selected') {
        const p = state.players.find((pl) => pl.id === evt.senderId);
        if (p) p.job = evt.job;
        if (!q('screen-job').classList.contains('hidden')) renderJobSelect();
        checkAllJobsChosenAndAdvance();
      } else if (evt.type === 'town_enter') {
        enterTown();
      }
    });

    window.gameNet.on('net:disconnected', ({ reason }) => {
      toast(reason || '연결이 끊어졌습니다.');
      resetToMain();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    cacheEls();
    initMainMenu();
    initCreateRoom();
    initJoinModal();
    initLobby();
    initTown();
    wireNetworkEvents();
    showScreen('screen-main');
  });
})();
