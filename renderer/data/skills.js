// 직업 스킬의 "기계적" 데이터 — renderer/data.js의 서사 필드(skillName/skillEffect/flavor)와는
// 분리된 스키마. combat.js의 resolveSkillEvent()가 kind별로 해석해서 실행한다.
//
// 설계 원칙: 전투 UI는 "현재 직업의 스킬 1개"만 버튼으로 노출한다(getSkill(myJob)).
// 그래서 모든 스킬은 자기 완결적이어야 한다 — 예를 들어 "스텔스 상태일 때만 치명타"처럼
// 다른 티어(예: 이전 직업)의 스킬이 걸어준 상태에 의존하는 스킬은 전직 후 그 이전 스킬에
// 더 이상 접근할 수 없어 발동 불가능해진다. 이런 이유로 스텔스/암살자 계열도 매 티어마다
// 독립적으로 완결되게 설계했다.
//
// kind 종류:
//   'attack'                — 명중 판정 후 피해. effects[]로 execute/dot/status(스턴 등)/bonus_vs_tag를 덧붙일 수 있음.
//                             aoe:true면 UI가 생존한 적 전원을 타겟으로 넘긴다.
//   'attack_multi_random'   — 한 대상에게 독립적인 공격 굴림을 hits회 반복 (마법사 오행)
//   'buff_self'              — 자신에게 상태/스탯 효과 부여, 피해 없음
//   'buff_self_then_attack'  — 자버프 적용 후 그 버프가 반영된 공격 1회 (국왕시해자)
//   'summon'                 — 아군 소환
//   'craft' / 'utility'      — 전투 무관. combatExempt:true면 전투 UI에서 사용할 수 없다(스토리 전용).
//
// hitMode: 'roll'(기본 d20 판정) | 'guaranteed'(항상 명중)
// effects[] 항목:
//   {type:'execute', hpThresholdPct, excludeRank}      — 임계치 이하면 즉사, excludeRank는 면역 랭크
//   {type:'dot', status, dice, duration}                — 지속 피해 상태 부여
//   {type:'status', status, duration, excludeRank}      — 즉시효과 없는 상태(스턴 등) 부여, excludeRank는 면역 랭크
//   {type:'bonus_vs_tag', tag, bonus}                   — target.tags에 tag가 있으면 고정 피해 추가

const SKILLS = {
  // ================= 1차 (마을A) =================
  swordsman1: { kind: 'attack', hitMode: 'roll', damage: { dice: '1d6', stat: 'atk' } }, // 베기
  archer1: { kind: 'attack', hitMode: 'roll', damage: { dice: '1d6', stat: 'atk' } }, // 발사
  assassin1: { kind: 'buff_self', effects: [{ type: 'status', status: 'stealth', duration: 1 }] }, // 스텔스
  axeman1: { kind: 'attack', hitMode: 'roll', damage: { dice: '1d8', stat: 'atk' } }, // 휘두르기
  spearman1: { kind: 'attack', hitMode: 'roll', atkRollBonus: 2, damage: { dice: '1d6', stat: 'atk' } }, // 찌르기
  monk1: { kind: 'attack', hitMode: 'roll', damage: { dice: '1d4', stat: 'atk' } }, // 툭툭 치기

  // ================= 2차 (마을B에서 전직) =================
  swordsman2: { kind: 'attack', hitMode: 'roll', atkRollBonus: 1, damage: { dice: '1d8', stat: 'atk' } }, // 후려치기
  archer2: { kind: 'attack', hitMode: 'roll', damage: { dice: '1d6', stat: 'atk' }, effects: [{ type: 'dot', status: 'poison', dice: '1d4', duration: 3 }] }, // 독화살
  assassin2: { kind: 'attack', hitMode: 'roll', atkRollBonus: 4, damage: { dice: '1d8', stat: 'atk' } }, // 스텔스 업 (더 정교하고 은밀한 일격)
  axeman2: { kind: 'attack', hitMode: 'roll', damage: { dice: '1d8', stat: 'atk' }, effects: [{ type: 'execute', hpThresholdPct: 0.2, excludeRank: ['elite', 'boss'] }] }, // 싹뚝!
  spearman2: { kind: 'attack', hitMode: 'guaranteed', damage: { dice: '1d8', stat: 'atk' } }, // 기마술
  monk2: { kind: 'attack', hitMode: 'guaranteed', damage: { dice: '2d6', stat: 'atk' } }, // 강펀치

  // ================= 3차 (마을C/마을B에서 전직) =================
  swordsman3: { kind: 'summon', summon: { allyTemplateId: 'knight_ally', count: 2 }, cooldown: 99 }, // 집결
  archer3: { kind: 'summon', summon: { allyTemplateId: 'wolf_ally', count: 2 }, cooldown: 99 }, // 사냥꾼의 친구
  assassin3: { kind: 'attack', hitMode: 'roll', atkRollBonus: 3, damage: { dice: '2d6', stat: 'atk' } }, // 물려받은 비전
  axeman3: { kind: 'attack', hitMode: 'roll', damage: { dice: '1d8', stat: 'atk' }, effects: [{ type: 'dot', status: 'burn', dice: '1d6', duration: 3 }] }, // 한번에 보내주지
  spearman3: { kind: 'attack', hitMode: 'roll', aoe: true, damage: { dice: '1d6', stat: 'atk' } }, // 용병술 (기마부대 돌격, 전체공격)
  mage3: { kind: 'attack_multi_random', hits: 3, damage: { dice: '1d6', stat: 'atk' } }, // 오행
  demonkin3: { kind: 'attack', hitMode: 'roll', damage: { dice: '1d8', stat: 'atk' }, effects: [{ type: 'dot', status: 'curse', dice: '1d4', duration: 3 }] }, // 마기

  // ================= 4차 (마을D/마을E에서 전직) =================
  godslayer4: { kind: 'attack', hitMode: 'roll', aoe: true, damage: { dice: '1d10', stat: 'atk' } }, // 권능
  paladin4: { kind: 'summon', summon: { allyTemplateId: 'light_knight_ally', count: 2 }, cooldown: 99 }, // 빛의 기사단
  kingslayer4: { kind: 'buff_self_then_attack', buff: [{ type: 'stat_mod', stat: 'atk', mode: 'add', value: 12, duration: 1 }], damage: { dice: '2d8', stat: 'atk' } }, // 은빛 쐐기
  dragonslayer4: { kind: 'attack', hitMode: 'roll', damage: { dice: '1d10', stat: 'atk' }, effects: [{ type: 'bonus_vs_tag', tag: 'dragon', bonus: 10 }] }, // 용족 혐오
  shadowlord4: { kind: 'summon', summon: { allyTemplateId: 'shadow_ally', count: 2 }, cooldown: 99 }, // 지배
  ninjahead4: { kind: 'craft', combatExempt: true }, // 지도자 ([계승의 서] 제작 — 전투 무관)
  taesan4: { kind: 'buff_self', effects: [{ type: 'stat_mod', stat: 'def', mode: 'add', value: 8, duration: 3 }, { type: 'stat_mod', stat: 'atk', mode: 'multiply', value: 1.5, duration: 3 }] }, // 단단묵직
  dragonmaster4: { kind: 'attack', hitMode: 'roll', aoe: true, damage: { dice: '1d10', stat: 'atk' } }, // 브레스
  piercer4: {
    kind: 'attack',
    hitMode: 'roll',
    damage: { dice: '1d8', stat: 'atk' },
    effects: [
      { type: 'dot', status: 'bleed', dice: '1d4', duration: 2 },
      { type: 'status', status: 'stun', duration: 1, excludeRank: ['elite', 'boss'] },
    ],
  }, // 꿰뚫는 창
  towerlord4: { kind: 'attack', hitMode: 'roll', aoe: true, damage: { dice: '2d8', stat: 'atk' } }, // 음양의 조화
  demonlord4: { kind: 'attack', hitMode: 'roll', aoe: true, damage: { dice: '2d8', stat: 'atk' } }, // 강림
};

// 모든 직업이 기본으로 쓸 수 있는 평타 (쿨다운 없음) — buff/summon/craft 계열 스킬을 가진
// 직업도 이 평타로는 매 턴 피해를 줄 수 있다(자버프 효과도 그대로 반영됨).
const BASIC_ATTACK = { kind: 'attack', hitMode: 'roll', damage: { dice: '1d6', stat: 'atk' } };

function getSkill(jobId) {
  return SKILLS[jobId] || null;
}

const SkillsData = { SKILLS, BASIC_ATTACK, getSkill };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SkillsData;
} else {
  window.SkillsData = SkillsData;
}
