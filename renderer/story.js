// 마을별 스토리 데이터를 실행하는 범용 엔진 — 순수 데이터 조회 함수만 제공한다.
// 대화/퀘스트/보스처치 등 "상태를 바꾸는" 이벤트(quest_accepted, boss_defeated,
// job_tier_selected)는 combat.js처럼 별도 reducer로 감싸지 않고 renderer/app.js의
// wireNetworkEvents에서 직접 처리한다 — party.flags/playerProgress.quests는
// combat의 combatants 같은 복잡한 중첩 구조가 아니라 단순 필드라 그 편이 더 단순하다.

(function () {
  const isNode = typeof module !== 'undefined' && module.exports;

  // Node(헤드리스 테스트)에서는 마을 파일을 직접 require.
  const STORY_DATA = isNode
    ? {
        townA: require('./data/story/town-a.js'),
        townB: require('./data/story/town-b.js'),
        townC: require('./data/story/town-c.js'),
        townD: require('./data/story/town-d.js'),
        townE: require('./data/story/town-e.js'),
      }
    : window.STORY_DATA;

  function getTownStory(townId) {
    return (STORY_DATA && STORY_DATA[townId]) || null;
  }

  function getNpc(townStory, npcId) {
    return (townStory.npcs || []).find((n) => n.id === npcId) || null;
  }

  function getNpcAtLocation(townStory, location) {
    return (townStory.npcs || []).find((n) => n.location === location) || null;
  }

  function getDialogueNode(npc, nodeId) {
    return (npc.dialogue && npc.dialogue[nodeId]) || null;
  }

  function getQuest(townStory, questId) {
    return (townStory.quests || []).find((q) => q.id === questId) || null;
  }

  function getZone(townStory, zoneId) {
    return ((townStory.dungeon && townStory.dungeon.zones) || []).find((z) => z.id === zoneId) || null;
  }

  // zone.encounters는 "인카운터 후보들의 배열"이다 (각 후보는 적 템플릿 id 배열).
  function pickEncounterForZone(zone) {
    const options = zone.encounters;
    return options[Math.floor(Math.random() * options.length)];
  }

  const StoryEngine = { getTownStory, getNpc, getNpcAtLocation, getDialogueNode, getQuest, getZone, pickEncounterForZone };

  if (isNode) {
    module.exports = StoryEngine;
  } else {
    window.StoryEngine = StoryEngine;
  }
})();
