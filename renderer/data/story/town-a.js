// 마을A(태초 마을) 스토리 데이터 — NPC 대화, 퀘스트, 던전 구역.
// story.js 범용 엔진이 이 데이터를 읽어서 실행한다. 마을B~E는 이 파일과
// 같은 구조로 town-b.js ~ town-e.js를 추가하기만 하면 된다.

const townA = {
  npcs: [
    {
      id: 'chief_a',
      name: '촌장',
      location: '촌장의 집',
      dialogue: {
        start: {
          text: '어서 오게, 젊은이. 성인식을 치렀다고 들었네. 용 토벌에 참가할 자격을 얻었다지?',
          options: [
            { label: '용 토벌에 대해 묻는다', next: 'quest_intro' },
            { label: '나중에 다시 오겠다', next: null },
          ],
        },
        quest_intro: {
          text: '마을 뒤편 던전은 울창한 숲과 어두운 동굴, 그리고 과수원까지 이어져 있네. 그 끝에는 오래도록 마을을 위협해온 "과수원지기"가 있지. 그것부터 처리해야 진짜 용 토벌에 나설 자격이 생길 걸세.',
          options: [
            { label: '수락한다', next: 'quest_accepted', effects: [{ type: 'accept_quest', questId: 'townA_main' }] },
            { label: '아직 준비가 안 됐다', next: null },
          ],
        },
        quest_accepted: {
          text: '좋아, 기대하고 있겠네. 던전은 마을 어귀에 있으니 준비가 되면 향하게. 무운을 비네.',
          options: [{ label: '알겠다', next: null }],
        },
      },
    },
  ],

  quests: [
    { id: 'townA_main', name: '용 토벌 자격', giver: 'chief_a' },
  ],

  dungeon: {
    id: 'townA_dungeon',
    zones: [
      { id: 'forest', name: '울창한 숲', encounters: [['forest_wolf'], ['forest_wolf', 'forest_bandit']] },
      { id: 'cave', name: '어두운 동굴', encounters: [['cave_bat'], ['cave_bat', 'cave_slime']] },
      { id: 'orchard', name: '과수원', encounters: [['orchard_boss']], isBossZone: true },
    ],
    onBossDefeat: { flags: ['townA_cleared'] },
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = townA;
} else {
  window.STORY_DATA = window.STORY_DATA || {};
  window.STORY_DATA.townA = townA;
}
