'use strict';
/* ====== enemy AI: booms, builds, ages up, attacks in waves ====== */

const AI = { t: 0, wave: 0, nextAttack: 170, warned: false };

function aiFindBuildSpot(type, cx, cy) {
  const def = BUILD_DEFS[type];
  for (let r = 4; r <= 16; r++) {
    for (let a = 0; a < 20; a++) {
      const ang = (a / 20) * Math.PI * 2 + r * 0.37;
      const tx = Math.round(cx + Math.cos(ang) * r) - (def.w >> 1);
      const ty = Math.round(cy + Math.sin(ang) * r * 0.8) - (def.h >> 1);
      // require a 1-tile clear margin so units can path around it
      let ok = true;
      for (let y = ty - 1; y <= ty + def.h && ok; y++)
        for (let x = tx - 1; x <= tx + def.w && ok; x++)
          if (!inMap(x, y) || G.block[idx(x, y)] || G.tiles[idx(x, y)] !== TILE.GRASS) ok = false;
      if (ok && canPlace(type, tx, ty, 1)) return { tx, ty };
    }
  }
  return null;
}

function aiBuild(type, nearX, nearY, vills) {
  const spot = aiFindBuildSpot(type, nearX, nearY);
  if (!spot) return false;
  const b = placeBuilding(1, type, spot.tx, spot.ty);
  if (!b) return false;
  // send the nearest non-fighting villager
  let best = null, bd = 1e9;
  for (const v of vills) {
    if (v.task.k === 'attack' || v.task.k === 'build') continue;
    const d = dist2(v.x, v.y, b.cx, b.cy);
    if (d < bd) { bd = d; best = v; }
  }
  if (best) orderBuild(best, b);
  return true;
}

function aiPlayerTarget() {
  const tc = G.buildings.find(b => b.owner === 0 && b.type === 'towncenter' && !b.dead);
  if (tc) return { x: tc.cx, y: tc.cy };
  const b = G.buildings.find(b => b.owner === 0 && !b.dead);
  if (b) return { x: b.cx, y: b.cy };
  const u = G.units.find(u => u.owner === 0 && !u.dead);
  return u ? { x: u.x, y: u.y } : null;
}

function updateAI(dt) {
  const P = G.players[1];
  // modest handicap trickle keeps the AI dangerous even if its economy stumbles
  P.res.food += dt * 0.5; P.res.wood += dt * 0.45; P.res.gold += dt * 0.3;

  AI.t -= dt;
  if (AI.t > 0) return;
  AI.t = 1.2;

  const myBlds = G.buildings.filter(b => b.owner === 1 && !b.dead);
  const tc = myBlds.find(b => b.type === 'towncenter' && b.done);
  const vills = G.units.filter(u => u.owner === 1 && !u.dead && u.type === 'villager');
  const army = G.units.filter(u => u.owner === 1 && !u.dead && u.type !== 'villager');
  if (!tc) {
    // last stand: throw everything at the player
    const tgt = aiPlayerTarget();
    if (tgt) for (const u of army) if (u.task.k === 'idle') orderAMove(u, tgt.x, tgt.y);
    return;
  }

  /* --- economy: keep villagers busy on the right resources --- */
  const want = P.age === 0 ? { food: 0.55, wood: 0.45, gold: 0 } : { food: 0.4, wood: 0.32, gold: 0.28 };
  const counts = { food: 0, wood: 0, gold: 0 };
  for (const v of vills) {
    if (v.task.k === 'farm' || (v.task.k === 'deposit' && v.task.farm)) { counts.food++; continue; }
    const node = v.task.node;
    if (node && RES_TYPE[node.tt]) counts[RES_TYPE[node.tt]]++;
  }
  for (const v of vills) {
    if (v.task.k !== 'idle') continue;
    let pick = 'food', deficit = -1e9;
    for (const r of ['food', 'wood', 'gold']) {
      const d = want[r] * vills.length - counts[r];
      if (d > deficit) { deficit = d; pick = r; }
    }
    if (pick === 'food') {
      // berries first, then an untended farm
      const berry = findNearestRes(TILE.BERRY, tc.cx, tc.cy, 26);
      if (berry) { orderGather(v, berry.tx, berry.ty); counts.food++; continue; }
      const freeFarm = myBlds.find(b => b.type === 'farm' && b.done && !farmWorker(b));
      if (freeFarm && orderFarm(v, freeFarm)) { counts.food++; continue; }
      pick = 'wood';
    }
    const node = findNearestRes(TILE_FOR_RES[pick], tc.cx, tc.cy, 26) ||
                 findNearestRes(TILE_FOR_RES[pick === 'gold' ? 'wood' : 'gold'], tc.cx, tc.cy, 26);
    if (node) { orderGather(v, node.tx, node.ty); counts[RES_TYPE[G.tiles[idx(node.tx, node.ty)]]]++; }
  }

  /* --- production --- */
  if (vills.length < 16 && tc.queue.length === 0 && P.pop < P.popCap && canAfford(1, { food: 50 }))
    trainUnit(tc, 'villager');

  const housePending = myBlds.some(b => b.type === 'house' && !b.done);
  if (P.popCap - P.pop <= 3 && P.popCap < 70 && !housePending && canAfford(1, { wood: 25 }))
    aiBuild('house', tc.cx, tc.cy, vills);

  // farms once the local berries thin out (or just to scale food with age)
  const farms = myBlds.filter(b => b.type === 'farm').length;
  const berriesLeft = !!findNearestRes(TILE.BERRY, tc.cx, tc.cy, 14);
  const wantFarms = (berriesLeft ? 2 : 5) + P.age * 3;
  if (vills.length >= 8 && farms < wantFarms && P.res.wood >= 45 + 90 &&
      !myBlds.some(b => b.type === 'farm' && !b.done))
    aiBuild('farm', tc.cx, tc.cy, vills);

  // drop-off camps when a resource line sits far from every accepting dropoff
  for (const [tt, res, camp] of [[TILE.FOREST, 'wood', 'lumber'], [TILE.GOLD, 'gold', 'mining']]) {
    if (myBlds.some(b => b.type === camp)) continue;
    const node = findNearestRes(tt, tc.cx, tc.cy, 30);
    if (!node) continue;
    let dmin = 1e9;
    for (const b of myBlds)
      if (b.done && b.def.dropoff && b.def.dropoff.includes(res))
        dmin = Math.min(dmin, dist2(node.tx + 0.5, node.ty + 0.5, b.cx, b.cy));
    if (dmin > 49 && P.res.wood >= 150) aiBuild(camp, node.tx, node.ty, vills);
  }

  if (vills.length >= 7 && !myBlds.some(b => b.type === 'barracks') && canAfford(1, { wood: 175 }))
    aiBuild('barracks', tc.cx, tc.cy, vills);
  if (P.age >= 1) {
    if (!myBlds.some(b => b.type === 'archery') && canAfford(1, { wood: 200 })) aiBuild('archery', tc.cx, tc.cy, vills);
    else if (!myBlds.some(b => b.type === 'stable') && canAfford(1, { wood: 250 })) aiBuild('stable', tc.cx, tc.cy, vills);
  }

  /* --- rescue orphaned construction sites (builder died or got retasked) --- */
  for (const site of myBlds) {
    if (site.done) continue;
    if (!vills.some(v => v.task.k === 'build' && v.task.b === site)) {
      let best = null, bd = 1e9;
      for (const v of vills) {
        if (v.task.k === 'attack' || v.task.k === 'build') continue;
        const d = dist2(v.x, v.y, site.cx, site.cy);
        if (d < bd) { bd = d; best = v; }
      }
      if (best) orderBuild(best, site);
    }
  }

  /* --- age up --- */
  if (!P.ageUp) {
    if (P.age === 0 && vills.length >= 11 && P.res.food >= 540) startAgeUp(1);
    else if (P.age === 1 && P.res.food >= 840 && P.res.gold >= 220) startAgeUp(1);
  }

  /* --- military training: best unit each building can afford ---
     Once the economy is ready, bank food/gold for the next age instead of
     spending it all on troops — otherwise the AI never advances. */
  let foodReserve = 0, goldReserve = 0;
  if (!P.ageUp) {
    if (P.age === 0 && vills.length >= 11) foodReserve = 560;
    else if (P.age === 1) { foodReserve = 860; goldReserve = 230; }
  }
  // but always keep a defensive core before banking for the next age
  if (army.length < 3 + P.age * 4) { foodReserve = 0; goldReserve = 0; }
  for (const b of myBlds) {
    if (!b.done || !b.def.trains || b.type === 'towncenter' || b.queue.length >= 2) continue;
    const options = [...b.def.trains].reverse();
    for (const t of options) {
      const def = UNIT_DEFS[t];
      if (def.age > P.age) continue;
      if ((def.cost.food || 0) + foodReserve > P.res.food) continue;
      if ((def.cost.gold || 0) + goldReserve > P.res.gold) continue;
      if (!canAfford(1, def.cost) || P.pop >= P.popCap) continue;
      trainUnit(b, t);
      break;
    }
  }

  /* --- defense: rally the army if the base is threatened --- */
  let threat = null;
  for (const u of G.units) {
    if (u.owner !== 0 || u.dead) continue;
    if (dist2(u.x, u.y, tc.cx, tc.cy) < 169) { threat = u; break; }
  }
  if (threat) {
    for (const u of army) if (u.task.k !== 'attack') orderAMove(u, threat.x, threat.y);
    return;
  }

  /* --- offense: attack waves --- */
  if (G.time > AI.nextAttack && army.length >= 5 + AI.wave * 3) {
    AI.wave++;
    AI.nextAttack = G.time + 110;
    const tgt = aiPlayerTarget();
    if (tgt) {
      for (const u of army) orderAMove(u, tgt.x, tgt.y);
      toast('Scouts report an enemy army on the march!', true);
      sfx('alert');
    }
  }
}
