// 전직(티어업) 규칙 테이블 — 어떤 마을 클리어 플래그가 서면 전직이 제안되는지,
// 그리고 분기가 있는 직업(퀘스트 완료 여부로 갈리는 라인)의 경우 어느 쪽으로
// 가는지를 정의한다. 실제 다음 직업 id는 대부분 renderer/data.js의 JOBS 트리
// (job.next[0])에서 그대로 가져오므로, 여기서는 "언제" + "분기 조건"만 관리한다.

(function () {
  const isNode = typeof module !== 'undefined' && module.exports;
  const GameData = isNode ? require('./data.js') : window.GAME_DATA;

  const RULES = {
    // 1차 -> 2차 (마을A 클리어, 전원 단일 경로)
    swordsman1: { trigger: 'townA_cleared' },
    archer1: { trigger: 'townA_cleared' },
    assassin1: { trigger: 'townA_cleared' },
    axeman1: { trigger: 'townA_cleared' },
    spearman1: { trigger: 'townA_cleared' },
    monk1: { trigger: 'townA_cleared' },

    // 2차 -> 3차 (마을B 클리어, 투신 라인만 예외적으로 마을C에서 분기)
    swordsman2: { trigger: 'townB_cleared' },
    archer2: { trigger: 'townB_cleared' },
    assassin2: { trigger: 'townB_cleared' },
    axeman2: { trigger: 'townB_cleared' },
    spearman2: { trigger: 'townB_cleared' },
    monk2: {
      trigger: 'townC_cleared',
      branch: { questFlag: 'townC_mage_quest', onQuestJob: 'mage3', onDefaultJob: 'demonkin3' },
    },

    // 3차 -> 4차
    swordsman3: {
      trigger: 'townD_cleared',
      branch: { questFlag: 'townD_special_quest', onQuestJob: 'godslayer4', onDefaultJob: 'paladin4' },
    },
    assassin3: {
      trigger: 'townD_cleared',
      branch: { questFlag: 'townD_special_quest', onQuestJob: 'shadowlord4', onDefaultJob: 'ninjahead4' },
    },
    axeman3: { trigger: 'townD_cleared' },

    archer3: {
      trigger: 'townE_cleared',
      branch: { questFlag: 'townE_special_quest', onQuestJob: 'kingslayer4', onDefaultJob: 'dragonslayer4' },
    },
    spearman3: {
      trigger: 'townE_cleared',
      branch: { questFlag: 'townE_special_quest', onQuestJob: 'dragonmaster4', onDefaultJob: 'piercer4' },
    },
    mage3: { trigger: 'townE_cleared' },
    demonkin3: { trigger: 'townE_cleared' },
  };

  // partyFlags: Set<string> (마을 클리어 등 파티 공용 플래그)
  // playerQuests: { [questId]: 'not_started'|'active'|'completed' } (그 플레이어 개인 퀘스트 상태)
  function getTierUpOffer(jobId, partyFlags, playerQuests) {
    const rule = RULES[jobId];
    if (!rule) return null;
    if (!partyFlags.has(rule.trigger)) return null;

    if (rule.branch) {
      const completed = (playerQuests || {})[rule.branch.questFlag] === 'completed';
      return completed ? rule.branch.onQuestJob : rule.branch.onDefaultJob;
    }

    const jobDef = GameData.findJobById(jobId);
    return jobDef && jobDef.next && jobDef.next[0] ? jobDef.next[0] : null;
  }

  // 전직 티어가 오를 때마다 플레이어 기본 스탯이 이 배율만큼 커진다 (전투 균형용).
  const TIER_MULTIPLIER = { tier1: 1, tier2: 1.4, tier3: 1.96, tier4: 2.74 };

  function getStatMultiplierForJob(jobId) {
    const tier = GameData.getJobTier(jobId);
    return TIER_MULTIPLIER[tier] || 1;
  }

  const Progression = { RULES, getTierUpOffer, getStatMultiplierForJob };

  if (isNode) {
    module.exports = Progression;
  } else {
    window.Progression = Progression;
  }
})();
