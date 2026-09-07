// 턴제 파티 협동 전투 엔진 — DOM 의존 없음, Node에서 require()로 헤드리스 테스트 가능.
//
// 핵심 규칙 (설계 문서 참고):
//   - 주사위/명중/피해를 "계산"하는 함수(resolveSkillEvent, computeTurnAdvance, startCombat,
//     decideEnemyAction)는 host/solo만 호출한다. 결과는 순수 데이터(이벤트 객체)로 만들어져
//     sendAction으로 방 전체(자신 포함)에 broadcast된다.
//   - 상태를 실제로 바꾸는 함수는 applyCombatEvent(combatState, evt) 단 하나뿐이고,
//     host/client/solo 구분 없이 전원이 동일한 이벤트를 동일하게 적용한다 (순수 reducer).

(function () {
  const isNode = typeof module !== 'undefined' && module.exports;
  const Dice = isNode ? require('./dice.js') : window.Dice;
  const { getAllyTemplate } = isNode ? require('./data/enemies.js') : window.EnemiesData;
  const { BASIC_ATTACK } = isNode ? require('./data/skills.js') : window.SkillsData;

  function createCombatant(opts) {
    const hp = opts.hp;
    return {
      id: opts.id,
      name: opts.name,
      isEnemy: !!opts.isEnemy,
      playerId: opts.playerId || null,
      jobId: opts.jobId || null,
      hp,
      maxHp: opts.maxHp != null ? opts.maxHp : hp,
      atk: opts.atk,
      def: opts.def,
      spd: opts.spd,
      rank: opts.rank || 'normal',
      statuses: [],
      cooldowns: {},
    };
  }

  function isCombatantAlive(combatState, id) {
    const c = combatState.combatants[id];
    return !!c && c.hp > 0;
  }

  function getEffectiveStat(combatant, stat) {
    let base = combatant[stat] || 0;
    let addTotal = 0;
    let multTotal = 1;
    combatant.statuses.forEach((s) => {
      if (s.type === 'stat_mod' && s.stat === stat) {
        if (s.mode === 'add') addTotal += s.value;
        else if (s.mode === 'multiply') multTotal *= s.value;
      }
    });
    return Math.round((base + addTotal) * multTotal);
  }

  function hasStatusFlag(combatant, name) {
    return combatant.statuses.some((s) => s.type === 'status' && s.status === name);
  }

  function applyEffectToCombatant(combatant, eff) {
    if (!combatant || !eff) return;
    combatant.statuses.push({ ...eff, roundsRemaining: eff.duration });
  }

  function consumeStatusFlag(combatant, name) {
    combatant.statuses = combatant.statuses.filter((s) => !(s.type === 'status' && s.status === name));
  }

  function tickAllStatuses(combatState) {
    Object.values(combatState.combatants).forEach((c) => {
      if (c.hp <= 0) return;
      const remaining = [];
      c.statuses.forEach((s) => {
        if (s.type === 'dot') {
          const dmg = Dice.rollDice(s.dice).total;
          c.hp = Math.max(0, c.hp - dmg);
          combatState.log.push({ text: `${c.name}이(가) 지속 피해로 ${dmg}의 피해를 입었다.` });
        }
        const cur = s.roundsRemaining != null ? s.roundsRemaining : s.duration;
        const next = cur - 1;
        if (next > 0) remaining.push({ ...s, roundsRemaining: next });
      });
      c.statuses = remaining;
    });
  }

  // ---------- host/solo 전용: 계산만 하고 combatState는 건드리지 않는다 ----------

  function rollInitiative(combatantList) {
    return combatantList
      .map((c) => {
        const roll = Dice.rollDie(20);
        return { id: c.id, roll, spd: c.spd, total: roll + c.spd };
      })
      .sort((a, b) => b.total - a.total);
  }

  function startCombat(combatId, playerCombatants, enemyCombatants) {
    const all = [...playerCombatants, ...enemyCombatants];
    const initiative = rollInitiative(all);
    return {
      type: 'combat_start',
      combatId,
      combatants: all,
      initiative,
      turnOrder: initiative.map((i) => i.id),
    };
  }

  function getCurrentActorId(combatState) {
    return combatState.turnOrder[combatState.turnIndex];
  }

  function resolveSkillEvent(combatState, actorId, skillId, skillDef, targetIds) {
    const actor = combatState.combatants[actorId];
    const evt = { type: 'combat_action_resolved', actorId, skillId, targetIds, results: [], selfEffects: [], summoned: [], logText: '' };

    if (skillDef.kind === 'buff_self') {
      evt.selfEffects = skillDef.effects || [];
      evt.logText = `${actor.name}이(가) 스킬을 사용해 스스로에게 효과를 걸었다.`;
      return evt;
    }

    if (skillDef.kind === 'summon') {
      const tmpl = getAllyTemplate(skillDef.summon.allyTemplateId);
      const count = skillDef.summon.count || 1;
      for (let i = 0; i < count; i++) {
        evt.summoned.push(
          createCombatant({
            id: `${actorId}_summon_${skillId}_${i}_${Math.random().toString(36).slice(2, 8)}`,
            name: tmpl.name,
            isEnemy: actor.isEnemy,
            hp: tmpl.hp,
            atk: tmpl.atk,
            def: tmpl.def,
            spd: tmpl.spd,
            rank: tmpl.rank,
          })
        );
      }
      evt.logText = `${actor.name}이(가) 아군을 소환했다!`;
      return evt;
    }

    if (skillDef.kind === 'attack') {
      const atkStat = getEffectiveStat(actor, skillDef.damage.stat);
      const bonus = skillDef.atkRollBonus || 0;
      const stealthed = hasStatusFlag(actor, 'stealth');

      targetIds.forEach((targetId) => {
        const target = combatState.combatants[targetId];
        const attackResult = skillDef.hitMode === 'guaranteed'
          ? { roll: Dice.rollDie(20), hit: true, crit: false, fumble: false }
          : Dice.rollAttack(atkStat + bonus, getEffectiveStat(target, 'def'));

        const result = { targetId, roll: attackResult.roll, hit: attackResult.hit, crit: attackResult.crit, damage: 0, appliedStatuses: [], executed: false };

        if (attackResult.hit) {
          const dmgRoll = Dice.rollDice(skillDef.damage.dice);
          let damage = dmgRoll.total + atkStat;
          if (attackResult.crit) damage *= 2;
          result.damage = Math.max(1, damage);

          // bonus_vs_tag는 execute 임계치 판정에 영향을 주므로 먼저 적용한다.
          (skillDef.effects || []).forEach((eff) => {
            if (eff.type === 'bonus_vs_tag' && (target.tags || []).includes(eff.tag)) {
              result.damage += eff.bonus;
            }
          });

          (skillDef.effects || []).forEach((eff) => {
            if (eff.type === 'dot') {
              result.appliedStatuses.push(eff);
            } else if (eff.type === 'status') {
              const excluded = (eff.excludeRank || []).includes(target.rank);
              if (!excluded) result.appliedStatuses.push(eff);
            } else if (eff.type === 'execute') {
              const excluded = (eff.excludeRank || []).includes(target.rank);
              if (!excluded && target.hp - result.damage <= target.maxHp * eff.hpThresholdPct) {
                result.executed = true;
              }
            }
          });
        }
        evt.results.push(result);
      });

      if (stealthed) evt.consumeSelfStatus = 'stealth';
      evt.logText = `${actor.name}이(가) 스킬을 사용했다.`;
      return evt;
    }

    if (skillDef.kind === 'attack_multi_random') {
      const atkStat = getEffectiveStat(actor, skillDef.damage.stat);
      const targetId = targetIds[0];
      const target = combatState.combatants[targetId];
      const hits = skillDef.hits || 3;

      for (let i = 0; i < hits; i++) {
        const attackResult = Dice.rollAttack(atkStat, getEffectiveStat(target, 'def'));
        const result = { targetId, roll: attackResult.roll, hit: attackResult.hit, crit: attackResult.crit, damage: 0, appliedStatuses: [], executed: false };
        if (attackResult.hit) {
          const dmgRoll = Dice.rollDice(skillDef.damage.dice);
          let damage = dmgRoll.total + atkStat;
          if (attackResult.crit) damage *= 2;
          result.damage = Math.max(1, damage);
        }
        evt.results.push(result);
      }
      evt.logText = `${actor.name}이(가) 오행의 힘을 발출했다!`;
      return evt;
    }

    if (skillDef.kind === 'buff_self_then_attack') {
      const buffEffects = skillDef.buff || [];
      evt.selfEffects = buffEffects;
      const buffedActor = { ...actor, statuses: [...actor.statuses, ...buffEffects.map((e) => ({ ...e, roundsRemaining: e.duration }))] };
      const atkStat = getEffectiveStat(buffedActor, skillDef.damage.stat);

      targetIds.forEach((targetId) => {
        const target = combatState.combatants[targetId];
        const attackResult = Dice.rollAttack(atkStat, getEffectiveStat(target, 'def'));
        const result = { targetId, roll: attackResult.roll, hit: attackResult.hit, crit: attackResult.crit, damage: 0, appliedStatuses: [], executed: false };
        if (attackResult.hit) {
          const dmgRoll = Dice.rollDice(skillDef.damage.dice);
          let damage = dmgRoll.total + atkStat;
          if (attackResult.crit) damage *= 2;
          result.damage = Math.max(1, damage);
        }
        evt.results.push(result);
      });
      evt.logText = `${actor.name}이(가) 힘을 끌어올려 강습했다!`;
      return evt;
    }

    if (skillDef.kind === 'craft' || skillDef.kind === 'utility') {
      // 전투 무관 스킬 — UI가 combatExempt를 보고 애초에 호출하지 않아야 하지만,
      // 방어적으로 아무 효과 없는 이벤트를 반환한다.
      evt.logText = `${actor.name}이(가) 스킬을 사용해봤지만 전투에는 아무 효과가 없었다.`;
      return evt;
    }

    throw new Error(`resolveSkillEvent: 지원하지 않는 kind "${skillDef.kind}"`);
  }

  function decideEnemyAction(combatState, enemyId) {
    const targets = Object.values(combatState.combatants).filter((c) => !c.isEnemy && c.hp > 0);
    const target = targets[Math.floor(Math.random() * targets.length)];
    return resolveSkillEvent(combatState, enemyId, 'basic_attack', BASIC_ATTACK, [target.id]);
  }

  function checkCombatEnd(combatState) {
    const combatants = Object.values(combatState.combatants);
    const enemiesAlive = combatants.some((c) => c.isEnemy && c.hp > 0);
    const playersAlive = combatants.some((c) => !c.isEnemy && c.hp > 0);
    if (!enemiesAlive) return 'victory';
    if (!playersAlive) return 'defeat';
    return null;
  }

  function computeTurnAdvance(combatState) {
    const order = combatState.turnOrder;
    let idx = combatState.turnIndex;
    let round = combatState.round;
    let loops = 0;
    do {
      idx += 1;
      if (idx >= order.length) {
        idx = 0;
        round += 1;
      }
      loops += 1;
    } while (loops <= order.length && !isCombatantAlive(combatState, order[idx]));
    return { type: 'combat_turn_advance', turnIndex: idx, round, actorId: order[idx], tickStatuses: round !== combatState.round };
  }

  // ---------- 전원 동일 실행: 순수 reducer ----------

  function applyCombatEvent(combatState, evt) {
    switch (evt.type) {
      case 'combat_start': {
        const combatants = {};
        evt.combatants.forEach((c) => {
          combatants[c.id] = { ...c, statuses: [], cooldowns: {} };
        });
        return {
          id: evt.combatId,
          round: 1,
          combatants,
          turnOrder: evt.turnOrder.slice(),
          turnIndex: 0,
          initiative: evt.initiative,
          log: [{ text: '전투 시작! 이니셔티브를 굴렸습니다.' }],
          status: 'active',
        };
      }

      case 'combat_action_resolved': {
        if (!combatState) return combatState;
        const actor = combatState.combatants[evt.actorId];

        (evt.selfEffects || []).forEach((eff) => applyEffectToCombatant(actor, eff));
        (evt.summoned || []).forEach((c) => {
          combatState.combatants[c.id] = { ...c, statuses: [], cooldowns: {} };
          const idx = combatState.turnOrder.indexOf(evt.actorId);
          combatState.turnOrder.splice(idx + 1, 0, c.id);
        });

        (evt.results || []).forEach((r) => {
          const target = combatState.combatants[r.targetId];
          if (!target || !r.hit) return;
          target.hp = Math.max(0, target.hp - r.damage);
          (r.appliedStatuses || []).forEach((eff) => applyEffectToCombatant(target, eff));
          if (r.executed) target.hp = 0;
        });

        if (evt.consumeSelfStatus && actor) consumeStatusFlag(actor, evt.consumeSelfStatus);
        if (evt.logText) combatState.log.push({ text: evt.logText });
        return combatState;
      }

      case 'combat_turn_advance': {
        if (!combatState) return combatState;
        if (evt.tickStatuses) tickAllStatuses(combatState);
        combatState.turnIndex = evt.turnIndex;
        combatState.round = evt.round;
        return combatState;
      }

      case 'combat_end': {
        if (!combatState) return combatState;
        combatState.status = evt.result;
        combatState.log.push({ text: evt.logText || (evt.result === 'victory' ? '전투에서 승리했다!' : '파티가 쓰러졌다...') });
        return combatState;
      }

      default:
        return combatState;
    }
  }

  const CombatEngine = {
    createCombatant,
    isCombatantAlive,
    getEffectiveStat,
    hasStatusFlag,
    startCombat,
    getCurrentActorId,
    resolveSkillEvent,
    decideEnemyAction,
    checkCombatEnd,
    computeTurnAdvance,
    applyCombatEvent,
  };

  if (isNode) {
    module.exports = CombatEngine;
  } else {
    window.CombatEngine = CombatEngine;
  }
})();
