// 마을C(버려진 마탑) 스토리 데이터.
// 투신(monk2) 라인의 분기(마법사 vs 마족)를 결정하는 특별 대화가 여기 있다:
// "처치한다"를 고르면 townC_mage_quest가 completed로 설정되어 마법사(mage3)로,
// 고르지 않으면(정화를 택하거나 아예 대화하지 않으면) 기본값인 마족(demonkin3)으로 전직한다.

const townC = {
  npcs: [
    {
      id: 'tower_lord_c',
      name: '마탑의 주인',
      location: '마탑 입구',
      dialogue: {
        start: {
          text: '...누구냐. 마기가... 나를 잠식하고 있다... 더는 버틸 수가...',
          options: [
            { label: '무슨 일이 있었는지 묻는다', next: 'quest_intro' },
            { label: '일단 물러난다', next: null },
          ],
        },
        quest_intro: {
          text: '마탑 곳곳의 고서와 유물들이 마물이 되어버렸다. 근원을 뽑아내지 않으면 나 역시 완전히 마기에 삼켜질 것이다. 부탁한다, 이 탑을 정리해다오.',
          options: [
            { label: '수락한다', next: 'quest_accepted', effects: [{ type: 'accept_quest', questId: 'townC_main' }] },
            { label: '아직 준비가 안 됐다', next: null },
          ],
        },
        quest_accepted: {
          text: '고맙다... 탑 꼭대기에서 기다리겠다.',
          options: [
            { label: '알겠다', next: null },
            { label: '(투신 계열 전용) 차라리 당신을 처치해 마기를 완전히 끊어내겠다', next: 'special_choice' },
          ],
        },
        special_choice: {
          text: '...그렇게까지 각오했다면, 막지 않겠다. 그것이 네가 새로운 힘을 얻는 길이라면.',
          options: [
            { label: '결심을 굳힌다', next: 'special_confirmed', effects: [{ type: 'complete_quest', questId: 'townC_mage_quest' }] },
            { label: '다시 생각해본다', next: 'quest_accepted' },
          ],
        },
        special_confirmed: {
          text: '탑 꼭대기에서 결판을 내자.',
          options: [{ label: '알겠다', next: null }],
        },
      },
    },
  ],

  quests: [
    { id: 'townC_main', name: '마탑 정화', giver: 'tower_lord_c' },
    { id: 'townC_mage_quest', name: '(투신 전용) 마탑의 주인 처치', giver: 'tower_lord_c', hidden: true },
  ],

  dungeon: {
    id: 'townC_dungeon',
    zones: [
      { id: 'tower_lower', name: '마탑 저층', encounters: [['tome_horror'], ['tome_horror', 'arcane_wisp'], ['relic_guardian']] },
      { id: 'tower_upper', name: '마탑 최상층', encounters: [['tower_lord_boss']], isBossZone: true },
    ],
    onBossDefeat: { flags: ['townC_cleared'] },
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = townC;
} else {
  window.STORY_DATA = window.STORY_DATA || {};
  window.STORY_DATA.townC = townC;
}
