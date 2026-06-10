'use strict';
/* ====== Age of Fables — core data & shared state ====== */

const TILE = { GRASS: 0, FOREST: 1, GOLD: 2, BERRY: 3, WATER: 4 };
const HW = 32, HH = 16;                 // iso tile half-width / half-height (px)
const MAPW = 84, MAPH = 84;
const CARRY_MAX = 10;
const GATHER_RATE = 0.45;               // resource units per second
const RES_AMOUNT = { 1: 125, 2: 750, 3: 175 };          // by TILE id
const RES_TYPE   = { 1: 'wood', 2: 'gold', 3: 'food' }; // by TILE id
const TILE_FOR_RES = { wood: TILE.FOREST, gold: TILE.GOLD, food: TILE.BERRY };

const AGES = ['Dark Age', 'Feudal Age', 'Castle Age'];
const AGE_COST = [null, { food: 500 }, { food: 800, gold: 200 }];
const AGE_TIME = [0, 40, 60];

const TEAM = [
  { name: 'Blue', main: '#3e6fd0', dark: '#26468c', light: '#7da3ec' },
  { name: 'Red',  main: '#c3392e', dark: '#7e221c', light: '#e58379' },
];

const UNIT_DEFS = {
  villager: { name: 'Villager', hp: 25, atk: 3, range: 0.9, rof: 2, speed: 1.05, los: 5, aggro: 0,
    cost: { food: 50 }, time: 16, age: 0, cls: 'civ',
    desc: 'Gathers food, wood and gold; constructs buildings.' },
  militia:  { name: 'Militia', hp: 40, atk: 5, range: 0.9, rof: 2, speed: 0.95, los: 5, aggro: 5,
    cost: { food: 60, gold: 20 }, time: 15, age: 0, cls: 'inf',
    desc: 'Basic swordsman. Cheap and sturdy.' },
  spearman: { name: 'Spearman', hp: 45, atk: 4, bonusVs: 'cav', bonus: 14, range: 0.9, rof: 2.2, speed: 1.0, los: 5, aggro: 5,
    cost: { food: 35, wood: 25 }, time: 15, age: 1, cls: 'inf',
    desc: 'Anti-cavalry infantry. Large bonus versus mounted units.' },
  archer:   { name: 'Archer', hp: 30, atk: 4, range: 4.5, rof: 2, speed: 0.95, los: 7, aggro: 5.5,
    cost: { wood: 25, gold: 45 }, time: 18, age: 1, cls: 'arc', arrow: true,
    desc: 'Ranged unit. Fragile, deadly in numbers.' },
  scout:    { name: 'Scout Cavalry', hp: 45, atk: 4, range: 0.95, rof: 2, speed: 1.6, los: 9, aggro: 5,
    cost: { food: 80 }, time: 20, age: 1, cls: 'cav',
    desc: 'Fast rider with a wide line of sight.' },
  knight:   { name: 'Knight', hp: 100, atk: 10, range: 0.95, rof: 1.8, speed: 1.4, los: 6, aggro: 5,
    cost: { food: 60, gold: 75 }, time: 22, age: 2, cls: 'cav',
    desc: 'Heavy shock cavalry. The hammer of the Castle Age.' },
};

const BUILD_DEFS = {
  towncenter: { name: 'Town Center', hp: 2400, w: 3, h: 3, los: 8, cost: { wood: 300 }, time: 90,
    pop: 5, dropoff: true, trains: ['villager'], atk: 5, range: 6, rof: 2, arrow: true, height: 44,
    desc: 'Heart of your empire. Trains villagers, accepts resources, advances ages.' },
  house:      { name: 'House', hp: 550, w: 2, h: 2, los: 3, cost: { wood: 25 }, time: 15, pop: 5, age: 0, height: 22,
    desc: 'Supports 5 population.' },
  farm:       { name: 'Farm', hp: 120, w: 2, h: 2, los: 2, cost: { wood: 45 }, time: 12, age: 0, height: 5, farm: 0.33,
    desc: 'A tilled field that yields a steady trickle of food while it stands.' },
  barracks:   { name: 'Barracks', hp: 1200, w: 3, h: 3, los: 5, cost: { wood: 175 }, time: 30, age: 0,
    trains: ['militia', 'spearman'], height: 36, desc: 'Trains infantry.' },
  archery:    { name: 'Archery Range', hp: 1050, w: 3, h: 3, los: 5, cost: { wood: 175 }, time: 30, age: 1,
    trains: ['archer'], height: 34, desc: 'Trains archers. Requires Feudal Age.' },
  stable:     { name: 'Stable', hp: 1200, w: 3, h: 3, los: 5, cost: { wood: 175 }, time: 30, age: 1,
    trains: ['scout', 'knight'], height: 34, desc: 'Trains cavalry. Requires Feudal Age.' },
  tower:      { name: 'Watch Tower', hp: 850, w: 1, h: 1, los: 9, cost: { wood: 50, gold: 125 }, time: 30, age: 1,
    atk: 6, range: 7, rof: 2, arrow: true, height: 62, desc: 'Defensive tower. Fires on nearby enemies.' },
};
const BUILD_MENU = ['house', 'farm', 'barracks', 'archery', 'stable', 'tower'];

/* ---- global game state ---- */
const G = {
  tiles: null, resAmt: null, block: null,
  explored: null, visible: null,
  units: [], buildings: [], projectiles: [], fx: [],
  players: [
    { res: { food: 200, wood: 200, gold: 100 }, pop: 0, popCap: 0, age: 0, ageUp: null },
    { res: { food: 200, wood: 200, gold: 100 }, pop: 0, popCap: 0, age: 0, ageUp: null },
  ],
  sel: [], placing: null, attackArm: false, groups: {},
  hover: { x: 0, y: 0 },
  cam: { x: 0, y: 0 }, zoom: 1,
  time: 0, speed: 1, started: false, over: false,
  startPos: null,
  nextId: 1,
};

/* ---- small shared helpers ---- */
function idx(tx, ty) { return ty * MAPW + tx; }
function inMap(tx, ty) { return tx >= 0 && ty >= 0 && tx < MAPW && ty < MAPH; }
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

// world (tile coords) -> world-screen px (camera not applied)
function ws(x, y) { return { x: (x - y) * HW, y: (x + y) * HH }; }

function canAfford(p, cost) {
  for (const k in cost) if (G.players[p].res[k] < cost[k]) return false;
  return true;
}
function payCost(p, cost) { for (const k in cost) G.players[p].res[k] -= cost[k]; }
function refundCost(p, cost) { for (const k in cost) G.players[p].res[k] += cost[k]; }
function costText(cost) {
  return Object.keys(cost).map(k => `${cost[k]} ${k}`).join(' · ');
}
function fmtTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
}
