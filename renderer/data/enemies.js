// 적/아군 소환체 템플릿. combat.js의 createCombatant()로 실제 전투원 인스턴스를 만든다.
// 마을A -> E로 갈수록, 그리고 일반 구역 -> 보스 구역으로 갈수록 대략적으로 강해지도록
// 스탯을 스케일했다 (플레이어 쪽도 전직 티어마다 강해지므로 맞춰서).

const ENEMY_TEMPLATES = {
  // --- 마을A: 태초마을 (울창한 숲 / 어두운 동굴 / 과수원) ---
  forest_wolf: { name: '숲 늑대', hp: 10, atk: 2, def: 10, spd: 3, rank: 'normal' },
  forest_bandit: { name: '숲의 도적', hp: 14, atk: 3, def: 11, spd: 2, rank: 'normal' },
  cave_bat: { name: '동굴 박쥐', hp: 8, atk: 2, def: 12, spd: 4, rank: 'normal' },
  cave_slime: { name: '동굴 슬라임', hp: 18, atk: 2, def: 8, spd: 1, rank: 'normal' },
  orchard_boss: { name: '과수원지기', hp: 42, atk: 5, def: 13, spd: 2, rank: 'boss' },

  // --- 마을B: 어부들의 촌락 (연해안 / 심해) ---
  coast_fishman: { name: '가시 복어 마물', hp: 16, atk: 4, def: 12, spd: 3, rank: 'normal' },
  coast_crab: { name: '갑각 마물', hp: 22, atk: 3, def: 15, spd: 1, rank: 'normal' },
  deep_eel: { name: '심해 장어', hp: 18, atk: 5, def: 11, spd: 4, rank: 'normal' },
  deep_leviathan_spawn: { name: '심해의 새끼 리바이어던', hp: 26, atk: 5, def: 13, spd: 2, rank: 'elite' },
  sea_ruler_boss: { name: '심해의 지배자', hp: 62, atk: 7, def: 15, spd: 2, rank: 'boss' },

  // --- 마을C: 버려진 마탑 (마탑) ---
  tome_horror: { name: '마물화된 고서', hp: 20, atk: 5, def: 13, spd: 3, rank: 'normal' },
  relic_guardian: { name: '폭주한 유물 수호병', hp: 30, atk: 6, def: 16, spd: 1, rank: 'elite' },
  arcane_wisp: { name: '광기의 마력 정령', hp: 18, atk: 6, def: 10, spd: 5, rank: 'normal' },
  tower_lord_boss: { name: '마탑의 주인 (마기에 잠식됨)', hp: 85, atk: 8, def: 16, spd: 3, rank: 'boss' },

  // --- 마을D: 절대적 신앙 (폐교회 / 망가진 마을) ---
  corrupted_villager: { name: '마물화된 주민', hp: 24, atk: 6, def: 13, spd: 2, rank: 'normal' },
  fanatic_zealot: { name: '광신도', hp: 28, atk: 7, def: 14, spd: 3, rank: 'normal' },
  altar_guardian: { name: '제단의 수호물', hp: 40, atk: 7, def: 18, spd: 1, rank: 'elite' },
  cult_leader_boss: { name: '교주', hp: 110, atk: 9, def: 17, spd: 3, rank: 'boss' },

  // --- 마을E: 화산 아래 태양의 왕국 (왕국 / 화산 / 용의 둥지) ---
  royal_guard: { name: '타락한 근위병', hp: 32, atk: 8, def: 16, spd: 3, rank: 'normal' },
  fire_elemental: { name: '화염 정령', hp: 30, atk: 9, def: 13, spd: 4, rank: 'normal' },
  magma_golem: { name: '마그마 골렘', hp: 55, atk: 8, def: 20, spd: 1, rank: 'elite' },
  dragon_king_boss: { name: '드래곤 킹', hp: 260, atk: 13, def: 20, spd: 4, rank: 'boss', tags: ['dragon'] },
};

// 소환 스킬(기사단장 "집결" 등)이 만들어내는 아군 템플릿
const ALLY_TEMPLATES = {
  knight_ally: { name: '소환된 기사', hp: 14, atk: 3, def: 12, spd: 2, rank: 'normal' },
  wolf_ally: { name: '소환된 늑대', hp: 16, atk: 4, def: 10, spd: 4, rank: 'normal' },
  light_knight_ally: { name: '빛의 기사', hp: 22, atk: 6, def: 15, spd: 2, rank: 'normal' },
  shadow_ally: { name: '그림자 주민', hp: 18, atk: 6, def: 11, spd: 3, rank: 'normal' },
};

function getEnemyTemplate(id) {
  return ENEMY_TEMPLATES[id] || null;
}

function getAllyTemplate(id) {
  return ALLY_TEMPLATES[id] || null;
}

const EnemiesData = { ENEMY_TEMPLATES, ALLY_TEMPLATES, getEnemyTemplate, getAllyTemplate };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EnemiesData;
} else {
  window.EnemiesData = EnemiesData;
}
