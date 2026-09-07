// 마을E(화산 아래 태양의 왕국) 스토리 데이터 — 최종 마을.
// 마물사냥꾼(archer3)과 기마단장(spearman3) 라인의 4차 분기가 여기서 갈린다:
// 국왕을 "처치"하면 townE_special_quest가 completed되어 국왕시해자/드래곤마스터,
// "성불"시키면(또는 대화하지 않으면) 기본값인 드래곤 슬레이어/꿰뚫는 자가 된다.
// 마지막 던전 구역 "용의 둥지"에서 드래곤 킹과 최종 결전을 벌인다.

const townE = {
  npcs: [
    {
      id: 'the_king_e',
      name: '국왕',
      location: '촌장의 집',
      dialogue: {
        start: {
          text: '...짐은 이 왕국의 마지막 국왕이다. 드래곤 킹의 폭주로 모든 것이 잿더미가 되었지만, 짐은 마기를 받아들여서라도 살아남았다. 이제 와서 무엇을 원하는가.',
          options: [
            { label: '드래곤 킹에 대해 묻는다', next: 'quest_intro' },
            { label: '일단 물러난다', next: null },
          ],
        },
        quest_intro: {
          text: '용의 둥지 깊은 곳에 그가 있다. 놈을 막을 수 있다면... 그리고 짐을 어찌할 것인지도 결정해야 할 것이다.',
          options: [
            { label: '드래곤 킹 토벌을 수락한다', next: 'quest_accepted', effects: [{ type: 'accept_quest', questId: 'townE_main' }] },
            { label: '아직 준비가 안 됐다', next: null },
          ],
        },
        quest_accepted: {
          text: '가라. 그리고 돌아오면, 짐을 어떻게 할지 알려다오.',
          options: [
            { label: '지금 결정한다', next: 'special_choice' },
            { label: '나중에 결정하겠다', next: null },
          ],
        },
        special_choice: {
          text: '짐을 처치해 마기의 근원을 끊겠는가, 아니면 성불시켜 편히 보내주겠는가?',
          options: [
            { label: '처치한다', next: 'special_smite', effects: [{ type: 'complete_quest', questId: 'townE_special_quest' }] },
            { label: '성불시킨다', next: 'special_peace' },
          ],
        },
        special_smite: {
          text: '...그것도 하나의 자비겠지. 마음대로 하라.',
          options: [{ label: '알겠다', next: null }],
        },
        special_peace: {
          text: '...고맙다. 오랜만에 짐다운 얼굴로 눈을 감을 수 있겠군.',
          options: [{ label: '알겠다', next: null }],
        },
      },
    },
  ],

  quests: [
    { id: 'townE_main', name: '드래곤 킹 토벌', giver: 'the_king_e' },
    { id: 'townE_special_quest', name: '(전용) 국왕의 최후', giver: 'the_king_e', hidden: true },
  ],

  dungeon: {
    id: 'townE_dungeon',
    zones: [
      { id: 'kingdom_ruins', name: '왕국', encounters: [['royal_guard'], ['royal_guard', 'fire_elemental']] },
      { id: 'volcano', name: '화산', encounters: [['fire_elemental', 'fire_elemental'], ['magma_golem']] },
      { id: 'dragon_nest', name: '용의 둥지', encounters: [['dragon_king_boss']], isBossZone: true },
    ],
    onBossDefeat: { flags: ['townE_cleared', 'game_cleared'] },
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = townE;
} else {
  window.STORY_DATA = window.STORY_DATA || {};
  window.STORY_DATA.townE = townE;
}
