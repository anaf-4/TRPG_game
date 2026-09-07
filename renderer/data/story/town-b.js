// 마을B(어부들의 촌락) 스토리 데이터. town-a.js와 동일한 구조.

const townB = {
  npcs: [
    {
      id: 'harbor_master_b',
      name: '항구지기',
      location: '부두',
      dialogue: {
        start: {
          text: '어서 오게. 요즘 연해안과 심해에 마물이 된 물고기들이 들끓어서 배를 띄우기가 힘들어. 자네가 좀 정리해주면 마탑으로 가는 통행증을 내주지.',
          options: [
            { label: '심해의 지배자에 대해 묻는다', next: 'quest_intro' },
            { label: '나중에 다시 오겠다', next: null },
          ],
        },
        quest_intro: {
          text: '심해 깊은 곳에 그 마물들의 우두머리, "심해의 지배자"가 있어. 그것만 처리하면 이 근해는 다시 조용해질 걸세.',
          options: [
            { label: '수락한다', next: 'quest_accepted', effects: [{ type: 'accept_quest', questId: 'townB_main' }] },
            { label: '아직 준비가 안 됐다', next: null },
          ],
        },
        quest_accepted: {
          text: '고맙네. 조심하게, 심해는 생각보다 깊어.',
          options: [{ label: '알겠다', next: null }],
        },
      },
    },
  ],

  quests: [{ id: 'townB_main', name: '심해의 지배자 토벌', giver: 'harbor_master_b' }],

  dungeon: {
    id: 'townB_dungeon',
    zones: [
      { id: 'coast', name: '연해안', encounters: [['coast_fishman'], ['coast_fishman', 'coast_crab']] },
      { id: 'deep', name: '심해', encounters: [['sea_ruler_boss']], isBossZone: true },
    ],
    onBossDefeat: { flags: ['townB_cleared'] },
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = townB;
} else {
  window.STORY_DATA = window.STORY_DATA || {};
  window.STORY_DATA.townB = townB;
}
