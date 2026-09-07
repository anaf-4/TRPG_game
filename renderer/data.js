// 게임 데이터: dnd.txt 의 직업 트리 / 마을 정보를 그대로 옮겨온 정적 데이터.
// 1차 직업만 현재 UI(직업 선택 화면)에서 사용되고, 2~4차 직업은 이후
// 전직 시스템을 구현할 때 사용할 수 있도록 미리 옮겨 두었다.

const JOBS = {
  tier1: [
    { id: 'swordsman1', name: '나무 검사', skillName: '베기', skillEffect: '벤다', flavor: '플레이어는 검을 집어들었다', next: ['swordsman2'] },
    { id: 'archer1', name: '나무 궁수', skillName: '발사', skillEffect: '활을 쏜다', flavor: '플레이어는 활을 골랐다', next: ['archer2'] },
    { id: 'assassin1', name: '초보 암살자', skillName: '스텔스', skillEffect: '은신하다', flavor: '플레이어는 단검을 집어들었다', next: ['assassin2'] },
    { id: 'axeman1', name: '미약한 도끼병', skillName: '휘두르기', skillEffect: '휘두른다', flavor: '플레이어에게 도끼는 너무나 무거웠다', next: ['axeman2'] },
    { id: 'spearman1', name: '일개 창병', skillName: '찌르기', skillEffect: '찌른다', flavor: '무수히 많은 창병 중 하나일 뿐이다', next: ['spearman2'] },
    { id: 'monk1', name: '맨손의 달인', skillName: '툭툭 치기', skillEffect: '때린다', flavor: '미련하군!', next: ['monk2'], difficulty: '다소 어려움' },
  ],
  tier2: [
    { id: 'swordsman2', name: '철의 검사', skillName: '후려치기', skillEffect: '목을 노린 것 같다', flavor: '철 검은 조금 더 단단하겠지..', from: 'swordsman1', next: ['swordsman3'] },
    { id: 'archer2', name: '석궁병', skillName: '독화살', skillEffect: '독을 묻혀 도트뎀을 넣는다', flavor: '강한 독과 강한 화살촉..', from: 'archer1', next: ['archer3'] },
    { id: 'assassin2', name: '고급 암살자', skillName: '스텔스 업', skillEffect: '스텔스 상태에서 공격 시 치명타 확정', flavor: '더 빠르고 더 은밀하게!', from: 'assassin1', next: ['assassin3'] },
    { id: 'axeman2', name: '튼튼한 도끼병', skillName: '싹뚝!', skillEffect: '일정 체력 이하의 적은 즉사시킨다 (엘리트 이상 미적용)', flavor: '플레이어는 이제 도끼를 잘 든다죠', from: 'axeman1', next: ['axeman3'] },
    { id: 'spearman2', name: '기마 창병', skillName: '기마술', skillEffect: '빠른 속도로 상대방을 꿰뚫는다', flavor: '말을 타는 창병이 되었다.', from: 'spearman1', next: ['spearman3'] },
    { id: 'monk2', name: '투신', skillName: '강펀치', skillEffect: '적에게 확정으로 적중한다', flavor: '주먹에서 불이 날지도 모른다', from: 'monk1', next: ['mage3', 'demonkin3'] },
  ],
  tier3: [
    { id: 'swordsman3', name: '기사단장', skillName: '집결', skillEffect: '부하를 소환한다', flavor: '플레이어는 이제 기사들의 정점에 서있다.', from: 'swordsman2', next: ['godslayer4', 'paladin4'] },
    { id: 'archer3', name: '마물 사냥꾼', skillName: "사냥꾼의 친구", skillEffect: '늑대들을 소환한다', flavor: '플레이어는 자연에 속하고 있다.', from: 'archer2', next: ['kingslayer4', 'dragonslayer4'] },
    { id: 'assassin3', name: '중급 닌자', skillName: '물려받은 비전', skillEffect: '자신의 유파에서 내려오는 수리검술과 검술을 연마해 전용 무기를 획득한다', flavor: '우연한 계기로 플레이어는 닌자가 되었다.', from: 'assassin2', next: ['shadowlord4', 'ninjahead4'] },
    { id: 'axeman3', name: '불의 도끼병', skillName: '한번에 보내주지', skillEffect: '일정 시간동안 공격에 화염 도트 데미지가 추가된다', flavor: '플레이어의 도끼는 너무나 빨라 불이 붙어버렸다.', from: 'axeman2', next: ['taesan4'] },
    { id: 'spearman3', name: '기마단장', skillName: '용병술', skillEffect: '기마부대가 돌격하여 데미지를 준다', flavor: '이 시대에는 플레이어가 가장 빠를지도 모른다', from: 'spearman2', next: ['dragonmaster4', 'piercer4'] },
    { id: 'mage3', name: '마법사', skillName: '오행', skillEffect: '불, 흙, 물, 쇠, 나무 다섯가지 공격을 랜덤으로 발사한다', flavor: '퀘스트를 클리어한 플레이어는 마법사가 되었다', from: 'monk2', quest: '버려진 마탑 전용 퀘스트 클리어 시', next: ['towerlord4'] },
    { id: 'demonkin3', name: '마족', skillName: '마기', skillEffect: '원거리 공격으로 어둠 도트 데미지가 추가된다', flavor: '그의 주먹에서는 어두운 불길이 나간다.', from: 'monk2', next: ['demonlord4'] },
  ],
  tier4: [
    { id: 'godslayer4', name: '갓 슬레이어', skillName: '권능', skillEffect: '빛의 힘으로 광역 데미지를 발산한다', flavor: '신을 없앤 자리에는 플레이어가 도래하였다.', from: 'swordsman3', quest: '절대적 신앙 전용 퀘스트 클리어 시' },
    { id: 'paladin4', name: '성기사', skillName: '빛의 기사단', skillEffect: '빛을 둘러싼 기사단을 소환한다', flavor: '신의 가호를 받은 플레이어는 천하무적이다!', from: 'swordsman3' },
    { id: 'kingslayer4', name: '국왕 시해자', skillName: '은빛 쐐기', skillEffect: '사용 시 공격력이 크게 상승한다', flavor: '영원히 말라가던 국왕은 시들고 말았다', from: 'archer3', quest: '화산 아래 태양의 왕국 전용 퀘스트 클리어 시' },
    { id: 'dragonslayer4', name: '드래곤 슬레이어', skillName: '용족 혐오', skillEffect: '용족에게 추가 데미지를 입힌다', flavor: '세상을 평화롭게 만들기 위해..', from: 'archer3' },
    { id: 'shadowlord4', name: '그림자의 주인', skillName: '지배', skillEffect: '어둠에 잠식되어 반은 인간, 반은 마물인 주민을 소환한다.', flavor: '새로운 세상의 신이 되리라', from: 'assassin3', quest: '절대적 신앙 전용 퀘스트 클리어 시' },
    { id: 'ninjahead4', name: '닌자 우두머리', skillName: '지도자', skillEffect: '자신의 기술로 새로운 비전을 만들어 [계승의 서]를 1회 제작할 수 있다', flavor: '유파의 주인.', from: 'assassin3' },
    { id: 'taesan4', name: '태산', skillName: '단단묵직', skillEffect: '몸의 근육을 순식간에 강화시켜 받는 데미지를 대폭 감소시키고 공격력을 대폭 상승시킨다', flavor: '그는 가히 태산과 같다고 할 수 있다.', from: 'axeman3' },
    { id: 'dragonmaster4', name: '드래곤 마스터', skillName: '브레스', skillEffect: '드래곤을 소환해 주변 일대를 불태운다', flavor: '용의 주인이 된 그는 하늘을 누비기 시작했다.', from: 'spearman3', quest: '화산 아래 태양의 왕국 전용 퀘스트 클리어 시' },
    { id: 'piercer4', name: '꿰뚫는 자', skillName: '꿰뚫는 창', skillEffect: '대상을 꿰뚫어 출혈 데미지를 주고 행동 불능 상태로 만든다 (엘리트 이상 미적용)', flavor: '이건.. 닭꼬치?', from: 'spearman3' },
    { id: 'towerlord4', name: '마탑의 주인', skillName: '음양의 조화', skillEffect: '오행을 합쳐 빛과 어둠을 전부 다루는 마법으로 일대를 초토화시킨다', flavor: '플레이어는 만물의 순환에 대해 이해하였다', from: 'mage3' },
    { id: 'demonlord4', name: '마왕, 만악의 근원지', skillName: '강림', skillEffect: '지정한 곳을 어둠으로 초토화시킨 뒤 마물들을 소환하여 전투에 참가시킨다', flavor: '마왕과 드래곤 킹은 일생일대의 숙적!', from: 'demonkin3' },
  ],
};

function findJobById(id) {
  if (!id) return null;
  for (const tier of Object.keys(JOBS)) {
    const found = JOBS[tier].find((j) => j.id === id);
    if (found) return found;
  }
  return null;
}

const TOWNS = [
  {
    id: 'townA',
    name: '마을A',
    subtitle: '태초 마을',
    dungeon: '마을A의 던전 (울창한 숲, 어두운 동굴, 과수원)',
    description:
      '말 그대로 여정이 시작되는, 상당히 평화로운 분위기의 마을입니다. 16살이 된 플레이어는 성인식을 치르고 용 토벌에 참가할 자격을 얻었습니다. 일하기 싫었던 플레이어는 용 토벌에 가담해 떵떵거리며 살고자 합니다. 돈을 모아 마을B로 향해야 합니다.',
    locations: ['상점', '촌장의 집', '대장간', '길드', '분수대', '뒷골목'],
  },
  { id: 'townB', name: '마을B', subtitle: '어부들의 촌락', dungeon: '연해안, 심해', description: '두 번째 마을. 본격적인 퀘스트가 시작되고, 바다에서 마물이 된 어류들과 싸웁니다. 마탑으로 향하는 통행증을 구매할 수 있고, 낚시도 가능합니다 (물론 마물도 많이 낚입니다).', locations: ['상점', '촌장의 집', '대장간', '길드', '분수대', '뒷골목', '부두'] },
  { id: 'townC', name: '마을C', subtitle: '버려진 마탑', dungeon: '마탑', description: '마물이 된 고대 비전들과 서적들이 공격해옵니다. 탑 꼭대기에서 마탑의 주인과 조우하게 됩니다.', locations: ['상점', '촌장의 집', '대장간', '길드', '분수대', '뒷골목', '마탑 입구'] },
  { id: 'townD', name: '마을D', subtitle: '절대적 신앙', dungeon: '폐교회, 망가진 마을', description: '신앙심이 가득하던 마을이 욕심을 품은 교주에 의해 모든 주민이 마물이 되어버렸습니다.', locations: ['상점', '촌장의 집', '대장간', '길드', '분수대', '뒷골목', '폐교회'] },
  { id: 'townE', name: '마을E', subtitle: '화산 아래 태양의 왕국', dungeon: '왕국, 화산, 용의 둥지', description: '드래곤 킹의 폭주로 화산 아래 왕국은 한순간에 용암과 잿더미로 뒤덮였습니다. 이곳에서 드래곤과의 최종 결전이 기다리고 있습니다.', locations: ['상점', '촌장의 집', '대장간', '길드', '분수대', '뒷골목', '용의 둥지'] },
];

const LOCATION_INFO = {
  '상점': '무기와 방어구, 물약을 구매할 수 있는 상점입니다. (구현 예정)',
  '촌장의 집': '마을의 촌장이 사는 곳. 성인식과 용 토벌 이야기를 들려줍니다. (구현 예정)',
  '대장간': '장비를 제작하고 강화할 수 있는 대장간입니다. (구현 예정)',
  '길드': '길드 퀘스트를 수락할 수 있는 곳입니다. (구현 예정)',
  '분수대': '마을 사람들의 쉼터. 이런저런 소문을 들을 수 있습니다. (구현 예정)',
  '뒷골목': '수상한 인물들이 오가는 뒷골목입니다. (구현 예정)',
  '마을A의 던전': '울창한 숲, 어두운 동굴, 과수원으로 이어지는 던전 입구. 횃불 하나와 직업별 능력을 가지고 여러 갈래의 길과 방을 탐험합니다. (구현 예정)',
  '부두': '배를 타고 심해로 나갈 수 있는 부두입니다. (구현 예정)',
  '마탑 입구': '버려진 마탑으로 들어가는 입구입니다. (구현 예정)',
  '폐교회': '악신의 가호를 받던 교주가 있던 폐교회입니다. (구현 예정)',
  '용의 둥지': '드래곤 킹이 잠들어 있는 최종 결전지입니다. (구현 예정)',
};

window.GAME_DATA = { JOBS, TOWNS, LOCATION_INFO, findJobById };
