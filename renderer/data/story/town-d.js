// 마을D(절대적 신앙) 스토리 데이터.
// 기사단장(swordsman3)과 중급 닌자(assassin3) 라인의 4차 분기(퀘스트 완료 시
// 갓슬레이어/그림자의주인, 아니면 기본값인 성기사/닌자우두머리)가 여기서 갈린다.
// 두 라인 모두 같은 townD_special_quest 플래그를 공유한다.

const townD = {
  npcs: [
    {
      id: 'wandering_priest_d',
      name: '떠도는 사제',
      location: '폐교회',
      dialogue: {
        start: {
          text: '이 마을은... 신앙심이 가득했건만, 욕심을 품은 교주가 악신의 가호를 받아 주민들을 전부 마물로 만들어버렸소. 부디 이들을 구원해주시오.',
          options: [
            { label: '교주에 대해 묻는다', next: 'quest_intro' },
            { label: '나중에 다시 오겠다', next: null },
          ],
        },
        quest_intro: {
          text: '망가진 마을을 지나 폐교회 깊은 곳에 교주가 있소. 그를 처리해야 주민들도, 그리고 이 땅도 구원받을 수 있소.',
          options: [
            { label: '수락한다', next: 'quest_accepted', effects: [{ type: 'accept_quest', questId: 'townD_main' }] },
            { label: '아직 준비가 안 됐다', next: null },
          ],
        },
        quest_accepted: {
          text: '부디 조심하시오. 교주의 배후에는 그보다 더 깊은 어둠이 있는 듯하오.',
          options: [
            { label: '알겠다', next: null },
            { label: '그 "더 깊은 어둠"이 무엇인지 캐묻는다', next: 'special_intro' },
          ],
        },
        special_intro: {
          text: '교주는 악신의 힘을 빌린 것뿐... 진짜 배후를 뿌리 뽑으려면 교주를 처단한 뒤 그 힘의 근원까지 파고들어야 하오. 위험한 길이오.',
          options: [
            { label: '그 위험한 길을 가겠다', next: 'special_confirmed', effects: [{ type: 'complete_quest', questId: 'townD_special_quest' }] },
            { label: '일단 교주부터 처리하겠다', next: null },
          ],
        },
        special_confirmed: {
          text: '그 각오, 잊지 않겠소. 교주를 쓰러뜨리고 나면 길이 열릴 것이오.',
          options: [{ label: '알겠다', next: null }],
        },
      },
    },
  ],

  quests: [
    { id: 'townD_main', name: '교주 처단', giver: 'wandering_priest_d' },
    { id: 'townD_special_quest', name: '(전용) 배후를 캐묻다', giver: 'wandering_priest_d', hidden: true },
  ],

  dungeon: {
    id: 'townD_dungeon',
    zones: [
      { id: 'ruined_village', name: '망가진 마을', encounters: [['corrupted_villager'], ['corrupted_villager', 'fanatic_zealot'], ['altar_guardian']] },
      { id: 'chapel', name: '폐교회', encounters: [['cult_leader_boss']], isBossZone: true },
    ],
    onBossDefeat: { flags: ['townD_cleared'] },
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = townD;
} else {
  window.STORY_DATA = window.STORY_DATA || {};
  window.STORY_DATA.townD = townD;
}
