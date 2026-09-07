(() => {
  const { JOBS, TOWNS, LOCATION_INFO, findJobById } = window.GAME_DATA;

  // 공용 중계 서버 기본 주소. 사용자가 직접 서버를 배포해 쓰고 싶을 때만
  // 메인 화면의 "중계 서버 설정"에서 바꾸면 된다.
  const DEFAULT_SERVER_URL = 'wss://trpg-game-znj4.onrender.com';

  const state = {
    nickname: '',
    serverUrl: '',
    role: null, // 'host' | 'client' | 'solo'
    localId: null,
    roomTitle: '',
    players: [], // {id, name, isHost} — roster only; server is authoritative and may be wholesale-replaced
    playerProgress: {}, // playerId -> {job, ...} — client-owned per-player state, NEVER wiped by roster updates
    discoveredRooms: [],
    pendingJoinRoom: null,
    selectedLocation: null,
    joinPollTimer: null,
    combat: null, // combat.js의 combatState, 전투 중이 아니면 null
    combatActionPending: false, // 내 행동을 보냈지만 아직 combat_action_resolved가 안 돌아온 상태(중복 클릭 방지)
    combatMeta: null, // {zoneId, townId, isBossZone} — 현재 전투가 어느 마을/구역에서 시작됐는지
    party: { currentTownId: 'townA', flags: new Set() }, // 파티 공용 진행 상태(마을 클리어 플래그 등)
    dialogue: null, // {npc, nodeId} — NPC 대화 세션(로컬 UI 상태, broadcast 안 함)
    tierUpOffer: null, // 나에게 뜬 전직 제안(다음 직업 id) 또는 null
  };

  // 로스터(state.players)는 서버가 join/leave/kick 때마다 통째로 다시 보내주므로
  // 그대로 덮어써도 안전하다. 하지만 직업 같은 클라이언트 전용 진행 상태를
  // 로스터 객체에 얹어두면 그 통짜 교체 때 같이 날아가 버리므로(예: 게임 중 누군가
  // 강퇴/퇴장하면 전원의 직업이 사라짐) 별도 스토어(state.playerProgress)에 id로 보관한다.
  function ensureProgressEntry(playerId) {
    if (!state.playerProgress[playerId]) state.playerProgress[playerId] = { job: null, quests: {} };
    return state.playerProgress[playerId];
  }
  function getJob(playerId) {
    const entry = state.playerProgress[playerId];
    return entry ? entry.job : null;
  }
  function setJob(playerId, jobId) {
    ensureProgressEntry(playerId).job = jobId;
  }
  function getQuestStatus(playerId, questId) {
    const entry = state.playerProgress[playerId];
    return (entry && entry.quests && entry.quests[questId]) || 'not_started';
  }
  function setQuestStatus(playerId, questId, status) {
    ensureProgressEntry(playerId).quests[questId] = status;
  }
  function pruneProgressToRoster() {
    const ids = new Set(state.players.map((p) => p.id));
    Object.keys(state.playerProgress).forEach((id) => {
      if (!ids.has(id)) delete state.playerProgress[id];
    });
  }

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
      'btn-rename-room', 'rename-room-row', 'input-rename-room', 'btn-rename-confirm', 'btn-rename-cancel',
      'job-grid', 'job-wait-text',
      'town-name', 'town-subtitle', 'town-description', 'party-bar', 'location-grid', 'location-detail', 'btn-leave-town',
      'tier-up-banner', 'tier-up-text', 'btn-tier-up-confirm',
      'travel-banner', 'travel-text', 'btn-travel-confirm',
      'modal-dialogue', 'dialogue-npc-name', 'dialogue-text', 'dialogue-options', 'btn-dialogue-close',
      'btn-ending-main-menu',
      'modal-ingame-menu', 'ingame-menu-title', 'btn-ingame-rename', 'ingame-rename-row', 'input-ingame-rename',
      'btn-ingame-rename-confirm', 'btn-ingame-rename-cancel', 'ingame-menu-players',
      'btn-ingame-menu-close', 'btn-ingame-menu-leave',
      'btn-open-ingame-menu-town', 'btn-open-ingame-menu-combat',
      'combat-round', 'combat-enemies', 'combat-allies', 'combat-log', 'combat-turn-banner',
      'combat-target-picker', 'combat-actions', 'btn-combat-attack', 'btn-combat-skill', 'btn-combat-defend',
      'combat-result', 'combat-result-text', 'btn-combat-leave',
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
    const url = els['input-server-url'].value.trim() || DEFAULT_SERVER_URL;
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
    state.playerProgress = {};
    state.selectedLocation = null;
    state.combat = null;
    state.combatActionPending = false;
    state.combatMeta = null;
    state.party = { currentTownId: 'townA', flags: new Set() };
    state.dialogue = null;
    state.tierUpOffer = null;
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
    els['rename-room-row'].classList.add('hidden');
    renderLobby();
  }

  function renderLobby() {
    els['lobby-title'].textContent = state.roomTitle || '방';
    els['lobby-players'].innerHTML = '';
    const isHost = state.role === 'host';

    state.players.forEach((p) => {
      const li = document.createElement('li');
      const crown = p.isHost ? '<span class="crown">♛</span> ' : '';
      const you = p.id === state.localId ? '<span class="you-tag">(나)</span>' : '';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      nameSpan.innerHTML = `${crown}${escapeHtml(p.name)} ${you}`;
      li.appendChild(nameSpan);

      if (isHost && p.id !== state.localId) {
        const kickBtn = document.createElement('button');
        kickBtn.className = 'btn btn-small btn-danger';
        kickBtn.textContent = '강퇴';
        kickBtn.addEventListener('click', () => {
          toast(`${p.name}님을 강퇴했습니다.`);
          window.gameNet.kickPlayer(p.id);
        });
        li.appendChild(kickBtn);
      }

      els['lobby-players'].appendChild(li);
    });

    const isHostLike = isHost || state.role === 'solo';
    els['lobby-host-controls'].classList.toggle('hidden', !isHostLike);
    els['lobby-wait-text'].classList.toggle('hidden', isHostLike);
    els['btn-rename-room'].classList.toggle('hidden', !isHost);
  }

  function initLobby() {
    els['btn-start-game'].addEventListener('click', async () => {
      await window.gameNet.startGame();
    });
    els['btn-leave-lobby'].addEventListener('click', resetToMain);

    els['btn-rename-room'].addEventListener('click', () => {
      els['input-rename-room'].value = state.roomTitle || '';
      els['rename-room-row'].classList.remove('hidden');
      els['input-rename-room'].focus();
    });
    els['btn-rename-cancel'].addEventListener('click', () => {
      els['rename-room-row'].classList.add('hidden');
    });
    els['btn-rename-confirm'].addEventListener('click', () => {
      const title = els['input-rename-room'].value.trim();
      if (!title) return;
      window.gameNet.renameRoom(title);
      els['rename-room-row'].classList.add('hidden');
    });
    els['input-rename-room'].addEventListener('keydown', (e) => {
      if (e.key === 'Enter') els['btn-rename-confirm'].click();
      if (e.key === 'Escape') els['btn-rename-cancel'].click();
    });
  }

  // ---------- job select ----------
  function enterJobSelect() {
    showScreen('screen-job');
    renderJobSelect();
  }

  function renderJobSelect() {
    const grid = els['job-grid'];
    grid.innerHTML = '';
    const myJob = getJob(state.localId);

    JOBS.tier1.forEach((job) => {
      const card = document.createElement('div');
      card.className = 'job-card';
      const takenBy = state.players.find((p) => getJob(p.id) === job.id);
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

    const chosenCount = state.players.filter((p) => getJob(p.id)).length;
    if (myJob) {
      els['job-wait-text'].textContent = `선택 완료! 다른 모험가를 기다리는 중... (${chosenCount}/${state.players.length})`;
    } else {
      els['job-wait-text'].textContent = '직업을 선택해주세요.';
    }
  }

  // ---------- town ----------
  const NEXT_TOWN = { townA: 'townB', townB: 'townC', townC: 'townD', townD: 'townE' }; // townE는 최종 마을

  function enterTown() {
    if (state.party.flags.has('game_cleared')) {
      showEnding();
      return;
    }
    showScreen('screen-town');
    const town = TOWNS.find((t) => t.id === state.party.currentTownId) || TOWNS[0];
    els['town-name'].textContent = town.name;
    els['town-subtitle'].textContent = `${town.subtitle} · 던전: ${town.dungeon}`;
    els['town-description'].textContent = town.description;

    renderPartyBar();
    checkTierUpEligibility();
    renderTravelBanner();

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

    const townStory = StoryEngine.getTownStory(state.party.currentTownId);
    if (!townStory) return;

    const npc = StoryEngine.getNpcAtLocation(townStory, loc);
    if (npc) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.style.marginTop = '12px';
      btn.textContent = `${npc.name}과(와) 대화하기`;
      btn.addEventListener('click', () => openDialogue(npc));
      els['location-detail'].appendChild(btn);
    }

    if (loc.endsWith('의 던전') && townStory.dungeon) {
      const canEnter = state.role === 'host' || state.role === 'solo';
      const wrapper = document.createElement('div');
      wrapper.style.marginTop = '12px';
      townStory.dungeon.zones.forEach((zone) => {
        const btn = document.createElement('button');
        btn.className = 'btn btn-primary';
        btn.style.marginTop = '8px';
        btn.style.display = 'block';
        btn.textContent = canEnter
          ? `${zone.name} 탐험${zone.isBossZone ? ' (보스)' : ''}`
          : `${zone.name} (호스트만 입장 가능)`;
        btn.disabled = !canEnter;
        btn.addEventListener('click', () => startDungeonEncounter(zone.id));
        wrapper.appendChild(btn);
      });
      els['location-detail'].appendChild(wrapper);
    }
  }

  function startDungeonEncounter(zoneId) {
    if (state.role !== 'host' && state.role !== 'solo') return;
    const townStory = StoryEngine.getTownStory(state.party.currentTownId);
    const zone = townStory && StoryEngine.getZone(townStory, zoneId);
    if (!zone) return;

    const playerCombatants = state.players.map((p) => buildPlayerCombatant(p));

    const enemyCombatants = StoryEngine.pickEncounterForZone(zone).map((templateId, idx) => {
      const tmpl = EnemiesData.getEnemyTemplate(templateId);
      return CombatEngine.createCombatant({
        id: `enemy_${templateId}_${idx}_${Date.now()}`,
        name: tmpl.name,
        isEnemy: true,
        hp: tmpl.hp,
        atk: tmpl.atk,
        def: tmpl.def,
        spd: tmpl.spd,
        rank: tmpl.rank,
      });
    });

    const startEvt = CombatEngine.startCombat(`combat_${Date.now()}`, playerCombatants, enemyCombatants);
    startEvt.zoneId = zone.id;
    startEvt.townId = state.party.currentTownId;
    startEvt.isBossZone = !!zone.isBossZone;
    window.gameNet.sendAction(startEvt);
  }

  // ---------- NPC 대화 ----------
  function openDialogue(npc) {
    state.dialogue = { npc, nodeId: 'start' };
    renderDialogue();
    els['modal-dialogue'].classList.remove('hidden');
  }

  function renderDialogue() {
    const { npc, nodeId } = state.dialogue;
    const node = StoryEngine.getDialogueNode(npc, nodeId);
    els['dialogue-npc-name'].textContent = npc.name;
    els['dialogue-text'].textContent = node.text;
    const container = els['dialogue-options'];
    container.innerHTML = '';
    (node.options || []).forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => chooseDialogueOption(opt));
      container.appendChild(btn);
    });
  }

  function chooseDialogueOption(opt) {
    (opt.effects || []).forEach((eff) => {
      if (eff.type === 'accept_quest') {
        window.gameNet.sendAction({ type: 'quest_accepted', questId: eff.questId });
      } else if (eff.type === 'complete_quest') {
        window.gameNet.sendAction({ type: 'quest_completed', questId: eff.questId });
      }
    });
    if (!opt.next) {
      closeDialogue();
      return;
    }
    state.dialogue.nodeId = opt.next;
    renderDialogue();
  }

  function closeDialogue() {
    state.dialogue = null;
    els['modal-dialogue'].classList.add('hidden');
  }

  function initDialogue() {
    els['btn-dialogue-close'].addEventListener('click', closeDialogue);
  }

  // ---------- 전직 ----------
  function checkTierUpEligibility() {
    const myJob = getJob(state.localId);
    if (!myJob) return;
    const entry = state.playerProgress[state.localId];
    const nextJobId = Progression.getTierUpOffer(myJob, state.party.flags, (entry && entry.quests) || {});
    if (!nextJobId) return;
    state.tierUpOffer = nextJobId;
    renderTierUpOffer();
  }

  function renderTierUpOffer() {
    if (!state.tierUpOffer) {
      els['tier-up-banner'].classList.add('hidden');
      return;
    }
    const curJob = findJobById(getJob(state.localId));
    const nextJob = findJobById(state.tierUpOffer);
    els['tier-up-text'].textContent = `전직 가능: ${curJob ? curJob.name : '?'} → ${nextJob ? nextJob.name : '?'}!`;
    els['tier-up-banner'].classList.remove('hidden');
  }

  function renderTravelBanner() {
    const currentTownId = state.party.currentTownId;
    const nextTownId = NEXT_TOWN[currentTownId];
    const cleared = state.party.flags.has(`${currentTownId}_cleared`);
    if (!nextTownId || !cleared) {
      els['travel-banner'].classList.add('hidden');
      return;
    }
    const nextTown = TOWNS.find((t) => t.id === nextTownId);
    const canTravel = state.role === 'host' || state.role === 'solo';
    els['travel-text'].textContent = canTravel
      ? `이 마을을 정리했습니다. 다음 목적지: ${nextTown ? nextTown.name : nextTownId}`
      : `이 마을을 정리했습니다. 호스트가 ${nextTown ? nextTown.name : nextTownId}(으)로 떠날 수 있습니다.`;
    els['btn-travel-confirm'].disabled = !canTravel;
    els['travel-banner'].classList.remove('hidden');
  }

  function showEnding() {
    showScreen('screen-ending');
  }

  function renderPartyBar() {
    const bar = els['party-bar'];
    bar.innerHTML = '';
    state.players.forEach((p) => {
      const job = findJobById(getJob(p.id));
      const chip = document.createElement('div');
      chip.className = 'party-chip';
      chip.textContent = `${p.name}${p.id === state.localId ? '(나)' : ''} · ${job ? job.name : '직업 미정'}`;
      bar.appendChild(chip);
    });
  }

  function initTown() {
    els['btn-leave-town'].addEventListener('click', resetToMain);
    els['btn-tier-up-confirm'].addEventListener('click', () => {
      if (!state.tierUpOffer) return;
      window.gameNet.sendAction({ type: 'job_tier_selected', job: state.tierUpOffer });
    });
    els['btn-travel-confirm'].addEventListener('click', () => {
      if (state.role !== 'host' && state.role !== 'solo') return;
      const nextTownId = NEXT_TOWN[state.party.currentTownId];
      if (!nextTownId) return;
      window.gameNet.sendAction({ type: 'travel_to_town', townId: nextTownId });
    });
  }

  function initEnding() {
    els['btn-ending-main-menu'].addEventListener('click', resetToMain);
  }

  // ---------- 게임 중 메뉴(방 관리: 강퇴/방제목변경/나가기) ----------
  // 로비의 renderLobby()와 같은 강퇴/변경 UI를, 마을/전투 화면에서도 모달로 열 수 있게 한다.
  function openIngameMenu() {
    renderIngameMenu();
    els['ingame-rename-row'].classList.add('hidden');
    els['modal-ingame-menu'].classList.remove('hidden');
  }

  function closeIngameMenu() {
    els['modal-ingame-menu'].classList.add('hidden');
  }

  function renderIngameMenu() {
    const isHost = state.role === 'host';
    els['ingame-menu-title'].textContent = state.roomTitle || '방';
    els['btn-ingame-rename'].classList.toggle('hidden', !isHost);

    els['ingame-menu-players'].innerHTML = '';
    state.players.forEach((p) => {
      const li = document.createElement('li');
      const crown = p.isHost ? '<span class="crown">♛</span> ' : '';
      const you = p.id === state.localId ? '<span class="you-tag">(나)</span>' : '';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'player-name';
      nameSpan.innerHTML = `${crown}${escapeHtml(p.name)} ${you}`;
      li.appendChild(nameSpan);

      if (isHost && p.id !== state.localId) {
        const kickBtn = document.createElement('button');
        kickBtn.className = 'btn btn-small btn-danger';
        kickBtn.textContent = '강퇴';
        kickBtn.addEventListener('click', () => {
          toast(`${p.name}님을 강퇴했습니다.`);
          window.gameNet.kickPlayer(p.id);
        });
        li.appendChild(kickBtn);
      }
      els['ingame-menu-players'].appendChild(li);
    });
  }

  function initIngameMenu() {
    const openHandler = () => openIngameMenu();
    els['btn-open-ingame-menu-town'].addEventListener('click', openHandler);
    els['btn-open-ingame-menu-combat'].addEventListener('click', openHandler);
    els['btn-ingame-menu-close'].addEventListener('click', closeIngameMenu);
    els['btn-ingame-menu-leave'].addEventListener('click', () => {
      closeIngameMenu();
      resetToMain();
    });

    els['btn-ingame-rename'].addEventListener('click', () => {
      els['input-ingame-rename'].value = state.roomTitle || '';
      els['ingame-rename-row'].classList.remove('hidden');
      els['input-ingame-rename'].focus();
    });
    els['btn-ingame-rename-cancel'].addEventListener('click', () => {
      els['ingame-rename-row'].classList.add('hidden');
    });
    els['btn-ingame-rename-confirm'].addEventListener('click', () => {
      const title = els['input-ingame-rename'].value.trim();
      if (!title) return;
      window.gameNet.renameRoom(title);
      els['ingame-rename-row'].classList.add('hidden');
    });
    els['input-ingame-rename'].addEventListener('keydown', (e) => {
      if (e.key === 'Enter') els['btn-ingame-rename-confirm'].click();
      if (e.key === 'Escape') els['btn-ingame-rename-cancel'].click();
    });
  }

  // ---------- combat ----------
  // 1차 직업은 능력치가 아니라 스킬로 구분된다는 설정이라, 시작 스탯은 전원 동일한
  // 기본값으로 둔다 (전직/티어가 오르면 progression.js가 스케일링할 예정).
  const PLAYER_BASE_STATS = { hp: 20, atk: 4, def: 11, spd: 2 };
  const DEFEND_SKILL = { kind: 'buff_self', effects: [{ type: 'stat_mod', stat: 'def', mode: 'add', value: 5, duration: 1 }] };

  // 티어(전직)가 오를수록 progression.js의 배율만큼 기본 스탯을 스케일한다.
  function buildPlayerCombatant(p) {
    const jobId = getJob(p.id);
    const mult = jobId ? Progression.getStatMultiplierForJob(jobId) : 1;
    return CombatEngine.createCombatant({
      id: p.id,
      name: p.name,
      playerId: p.id,
      jobId,
      hp: Math.round(PLAYER_BASE_STATS.hp * mult),
      atk: Math.round(PLAYER_BASE_STATS.atk * mult),
      def: Math.round(PLAYER_BASE_STATS.def * mult),
      spd: PLAYER_BASE_STATS.spd,
    });
  }

  function resolveSkillDefById(skillId) {
    if (skillId === 'basic_attack') return SkillsData.BASIC_ATTACK;
    if (skillId === 'defend') return DEFEND_SKILL;
    return SkillsData.getSkill(skillId);
  }

  function enterCombat(startEvt) {
    state.combat = CombatEngine.applyCombatEvent(null, startEvt);
    state.combatActionPending = false;
    state.combatMeta = { zoneId: startEvt.zoneId, townId: startEvt.townId, isBossZone: !!startEvt.isBossZone };
    showScreen('screen-combat');
    els['combat-result'].classList.add('hidden');
    renderCombat();
    hostDriveCombat();
  }

  function renderCombat() {
    if (!state.combat) return;
    const c = state.combat;
    els['combat-round'].textContent = `${c.round}라운드`;

    const currentActorId = CombatEngine.getCurrentActorId(c);
    renderCombatSide(els['combat-enemies'], Object.values(c.combatants).filter((x) => x.isEnemy), currentActorId);
    renderCombatSide(els['combat-allies'], Object.values(c.combatants).filter((x) => !x.isEnemy), currentActorId);

    els['combat-log'].innerHTML = c.log.slice(-8).map((l) => `<div>${escapeHtml(l.text)}</div>`).join('');
    els['combat-log'].scrollTop = els['combat-log'].scrollHeight;

    if (c.status !== 'active') {
      els['combat-actions'].classList.add('hidden');
      els['combat-target-picker'].classList.add('hidden');
      els['combat-turn-banner'].textContent = '';
      els['combat-result'].classList.remove('hidden');
      els['combat-result-text'].textContent = c.status === 'victory' ? '승리했다!' : '파티가 쓰러졌다...';
      return;
    }

    const currentActor = c.combatants[currentActorId];
    const isMyTurn = !!currentActor && currentActor.hp > 0 && currentActorId === state.localId && !state.combatActionPending;

    els['combat-actions'].classList.toggle('hidden', !isMyTurn);
    if (!isMyTurn) els['combat-target-picker'].classList.add('hidden');

    if (isMyTurn) {
      const myJob = findJobById(getJob(state.localId));
      els['btn-combat-skill'].textContent = myJob ? myJob.skillName : '스킬 사용';
    }

    if (currentActor && currentActor.hp > 0) {
      els['combat-turn-banner'].textContent = isMyTurn ? '당신의 턴입니다!' : `${currentActor.name}의 턴...`;
    } else {
      els['combat-turn-banner'].textContent = '';
    }
  }

  function renderCombatSide(container, combatants, currentActorId) {
    container.innerHTML = '';
    combatants.forEach((cm) => {
      const card = document.createElement('div');
      card.className = 'combatant-card';
      if (cm.id === currentActorId && cm.hp > 0) card.classList.add('current-turn');
      if (cm.hp <= 0) card.classList.add('dead');
      const pct = cm.maxHp > 0 ? Math.max(0, Math.round((cm.hp / cm.maxHp) * 100)) : 0;
      const statuses = cm.statuses.map((s) => `<span class="status-chip">${escapeHtml(s.status || s.stat || s.type)}</span>`).join('');
      card.innerHTML = `
        <div class="combatant-card-top">
          <span>${escapeHtml(cm.name)}${cm.id === state.localId ? ' (나)' : ''}</span>
          <span class="combatant-hp-text">${Math.max(0, cm.hp)}/${cm.maxHp}</span>
        </div>
        <div class="hp-bar"><div class="hp-bar-fill${pct <= 30 ? ' low' : ''}" style="width:${pct}%"></div></div>
        <div class="combatant-statuses">${statuses}</div>
      `;
      container.appendChild(card);
    });
  }

  function requestAction(skillId, targetIds) {
    if (!state.combat) return;
    state.combatActionPending = true;
    renderCombat();
    if (state.role === 'host' || state.role === 'solo') {
      const skillDef = resolveSkillDefById(skillId);
      const evt = CombatEngine.resolveSkillEvent(state.combat, state.localId, skillId, skillDef, targetIds);
      window.gameNet.sendAction(evt);
    } else {
      window.gameNet.sendAction({ type: 'combat_intent', actorId: state.localId, skillId, targetIds });
    }
  }

  function promptTargetThenAct(skillId) {
    const enemies = Object.values(state.combat.combatants).filter((c) => c.isEnemy && c.hp > 0);
    const skillDef = resolveSkillDefById(skillId);

    if (skillDef && skillDef.aoe) {
      requestAction(skillId, enemies.map((e) => e.id));
      return;
    }
    if (enemies.length <= 1) {
      requestAction(skillId, enemies.map((e) => e.id));
      return;
    }
    const picker = els['combat-target-picker'];
    picker.innerHTML = '';
    enemies.forEach((e) => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = `${e.name} (${e.hp}/${e.maxHp})`;
      btn.addEventListener('click', () => {
        picker.classList.add('hidden');
        requestAction(skillId, [e.id]);
      });
      picker.appendChild(btn);
    });
    picker.classList.remove('hidden');
  }

  // 전투 진행(다음 행동 결정)은 host/solo만 담당한다 — 클라이언트는 늘 broadcast된
  // 이벤트를 반영만 한다. 상대(적) 턴 자동 진행과 턴 넘기기/승패 판정이 여기서 일어난다.
  function hostCheckEndOrAdvance() {
    if (state.role !== 'host' && state.role !== 'solo') return;
    if (!state.combat || state.combat.status !== 'active') return;
    const end = CombatEngine.checkCombatEnd(state.combat);
    if (end) {
      window.gameNet.sendAction({ type: 'combat_end', result: end });
      if (end === 'victory' && state.combatMeta && state.combatMeta.isBossZone) {
        window.gameNet.sendAction({ type: 'boss_defeated', townId: state.combatMeta.townId, zoneId: state.combatMeta.zoneId });
      }
    } else {
      window.gameNet.sendAction(CombatEngine.computeTurnAdvance(state.combat));
    }
  }

  function hostDriveCombat() {
    if (state.role !== 'host' && state.role !== 'solo') return;
    if (!state.combat || state.combat.status !== 'active') return;
    const actorId = CombatEngine.getCurrentActorId(state.combat);
    const actor = state.combat.combatants[actorId];
    if (!actor || actor.hp <= 0) {
      window.gameNet.sendAction(CombatEngine.computeTurnAdvance(state.combat));
      return;
    }
    if (actor.isEnemy) {
      setTimeout(() => {
        if (!state.combat || state.combat.status !== 'active') return;
        if (CombatEngine.getCurrentActorId(state.combat) !== actorId) return; // 이미 다른 경로로 진행됨
        window.gameNet.sendAction(CombatEngine.decideEnemyAction(state.combat, actorId));
      }, 900);
    }
  }

  function initCombat() {
    els['btn-combat-attack'].addEventListener('click', () => promptTargetThenAct('basic_attack'));
    els['btn-combat-skill'].addEventListener('click', () => {
      const myJob = getJob(state.localId);
      if (!myJob) return;
      const skillDef = SkillsData.getSkill(myJob);
      if (!skillDef) return;
      if (skillDef.combatExempt) {
        toast('이 스킬은 전투에서 사용할 수 없습니다.');
        return;
      }
      if (skillDef.kind === 'attack' || skillDef.kind === 'attack_multi_random') {
        promptTargetThenAct(myJob);
      } else {
        requestAction(myJob, []);
      }
    });
    els['btn-combat-defend'].addEventListener('click', () => requestAction('defend', []));
    els['btn-combat-leave'].addEventListener('click', () => {
      state.combat = null;
      enterTown();
    });
  }

  // ---------- networking events ----------
  function checkAllJobsChosenAndAdvance() {
    if (state.role !== 'host' && state.role !== 'solo') return;
    if (state.players.length > 0 && state.players.every((p) => getJob(p.id))) {
      window.gameNet.sendAction({ type: 'town_enter' });
    }
  }

  function wireNetworkEvents() {
    window.gameNet.on('net:players-update', (players) => {
      // 로스터 자체(이름/호스트여부/구성원)는 서버가 권위자이므로 통째로 교체해도
      // 안전하다 — 직업 등 클라이언트 소유 상태는 state.playerProgress에 따로 있어
      // 이 교체의 영향을 받지 않는다. 나간 플레이어의 진행 상태만 정리한다.
      state.players = players;
      pruneProgressToRoster();
      if (!q('screen-lobby').classList.contains('hidden')) renderLobby();
      if (!q('screen-job').classList.contains('hidden')) renderJobSelect();
      if (!q('screen-town').classList.contains('hidden')) renderPartyBar();
      if (!els['modal-ingame-menu'].classList.contains('hidden')) renderIngameMenu();
    });

    window.gameNet.on('net:game-event', (evt) => {
      if (evt.type === 'game_start') {
        enterJobSelect();
      } else if (evt.type === 'job_selected') {
        setJob(evt.senderId, evt.job);
        if (!q('screen-job').classList.contains('hidden')) renderJobSelect();
        checkAllJobsChosenAndAdvance();
      } else if (evt.type === 'town_enter') {
        enterTown();
      } else if (evt.type === 'room_renamed') {
        state.roomTitle = evt.title;
        if (!q('screen-lobby').classList.contains('hidden')) renderLobby();
        if (!els['modal-ingame-menu'].classList.contains('hidden')) renderIngameMenu();
      } else if (evt.type === 'combat_start') {
        enterCombat(evt);
      } else if (evt.type === 'combat_action_resolved') {
        state.combat = CombatEngine.applyCombatEvent(state.combat, evt);
        state.combatActionPending = false;
        renderCombat();
        hostCheckEndOrAdvance();
      } else if (evt.type === 'combat_turn_advance') {
        state.combat = CombatEngine.applyCombatEvent(state.combat, evt);
        state.combatActionPending = false;
        renderCombat();
        hostDriveCombat();
      } else if (evt.type === 'combat_end') {
        state.combat = CombatEngine.applyCombatEvent(state.combat, evt);
        renderCombat();
      } else if (evt.type === 'combat_intent') {
        // 호스트/솔로만 실제로 주사위를 굴려서 결과를 확정한다 (권위자 패턴).
        if ((state.role === 'host' || state.role === 'solo') && state.combat && state.combat.status === 'active') {
          const currentActorId = CombatEngine.getCurrentActorId(state.combat);
          if (currentActorId === evt.actorId) {
            const skillDef = resolveSkillDefById(evt.skillId);
            if (skillDef) {
              window.gameNet.sendAction(
                CombatEngine.resolveSkillEvent(state.combat, evt.actorId, evt.skillId, skillDef, evt.targetIds || [])
              );
            }
          }
        }
      } else if (evt.type === 'quest_accepted') {
        setQuestStatus(evt.senderId, evt.questId, 'active');
      } else if (evt.type === 'quest_completed') {
        setQuestStatus(evt.senderId, evt.questId, 'completed');
      } else if (evt.type === 'boss_defeated') {
        const townStory = StoryEngine.getTownStory(evt.townId);
        if (townStory) {
          const flagsToSet = (townStory.dungeon && townStory.dungeon.onBossDefeat && townStory.dungeon.onBossDefeat.flags) || [`${evt.townId}_cleared`];
          flagsToSet.forEach((f) => state.party.flags.add(f));
          townStory.quests.forEach((quest) => {
            state.players.forEach((p) => {
              if (getQuestStatus(p.id, quest.id) === 'active') setQuestStatus(p.id, quest.id, 'completed');
            });
          });
        } else {
          state.party.flags.add(`${evt.townId}_cleared`);
        }
      } else if (evt.type === 'job_tier_selected') {
        setJob(evt.senderId, evt.job);
        if (evt.senderId === state.localId) state.tierUpOffer = null;
        if (!q('screen-town').classList.contains('hidden')) {
          renderPartyBar();
          renderTierUpOffer();
        }
      } else if (evt.type === 'travel_to_town') {
        state.party.currentTownId = evt.townId;
        if (!q('screen-town').classList.contains('hidden')) enterTown();
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
    initCombat();
    initDialogue();
    initEnding();
    initIngameMenu();
    wireNetworkEvents();
    showScreen('screen-main');
  });
})();
