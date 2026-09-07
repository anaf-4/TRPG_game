// 순수 주사위 엔진 — DOM 의존 없음, Node에서 require()로 바로 테스트 가능.
// 전투에서는 host/solo 쪽만 이 모듈을 호출해서 굴리고, 굴림 숫자 자체를
// 이벤트 payload에 실어 broadcast한다 (전원이 같은 결과를 "보는" DnD식 주사위).

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

// "2d6+3" / "1d6" / "3d8-1" 형태 파싱
function rollDice(expr) {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(String(expr).trim());
  if (!m) throw new Error(`잘못된 주사위 표기: ${expr}`);
  const count = parseInt(m[1], 10);
  const sides = parseInt(m[2], 10);
  const modifier = m[3] ? parseInt(m[3], 10) : 0;
  const rolls = [];
  for (let i = 0; i < count; i++) rolls.push(rollDie(sides));
  const total = rolls.reduce((a, b) => a + b, 0) + modifier;
  return { expr, rolls, modifier, total };
}

// d20 공격 굴림 vs 고정 방어 목표치(AC 개념). 자연 20=치명타, 자연 1=자동 실패.
function rollAttack(atkMod, defValue) {
  const roll = rollDie(20);
  const crit = roll === 20;
  const fumble = roll === 1;
  const total = roll + atkMod;
  const hit = crit || (!fumble && total >= defValue);
  return { roll, atkMod, total, target: defValue, crit, fumble, hit };
}

const Dice = { rollDie, rollDice, rollAttack };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Dice;
} else {
  window.Dice = Dice;
}
