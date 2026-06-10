'use strict';
/* ====== units, buildings, combat, economy ====== */

function createUnit(owner, type, x, y) {
  const def = UNIT_DEFS[type];
  const u = {
    id: G.nextId++, kind: 'unit', owner, type, def,
    x, y, hp: def.hp, path: null, task: { k: 'idle' },
    carry: 0, carryType: null, cool: 0, anim: Math.random() * 10,
    dirX: owner === 0 ? 1 : -1, moving: false, swingT: 0, returnTo: null, dead: false,
  };
  G.units.push(u);
  return u;
}

function createBuilding(owner, type, tx, ty, complete) {
  const def = BUILD_DEFS[type];
  const b = {
    id: G.nextId++, kind: 'bld', owner, type, def,
    tx, ty, w: def.w, h: def.h, cx: tx + def.w / 2, cy: ty + def.h / 2,
    hp: complete ? def.hp : Math.max(1, def.hp * 0.1),
    prog: complete ? def.time : 0, done: !!complete,
    queue: [], rally: null, cool: 0, target: null, dead: false,
  };
  if (!def.walkable) setBlocked(tx, ty, def.w, def.h, 1);
  if (b.done && def.pop) G.players[owner].popCap += def.pop;
  G.buildings.push(b);
  return b;
}

function canPlace(type, tx, ty, owner) {
  const def = BUILD_DEFS[type];
  for (let y = ty; y < ty + def.h; y++)
    for (let x = tx; x < tx + def.w; x++) {
      if (!inMap(x, y)) return false;
      const i = idx(x, y);
      if (G.tiles[i] !== TILE.GRASS || G.block[i]) return false;
      if (owner === 0 && !G.explored[i]) return false;
    }
  // walkable buildings (farms) leave tiles unblocked, so check footprints too
  for (const b of G.buildings) {
    if (b.dead) continue;
    if (tx < b.tx + b.w && tx + def.w > b.tx && ty < b.ty + b.h && ty + def.h > b.ty) return false;
  }
  return true;
}

// validates, pays, creates a construction site
function placeBuilding(owner, type, tx, ty) {
  const def = BUILD_DEFS[type];
  if (!canPlace(type, tx, ty, owner)) return null;
  if (!canAfford(owner, def.cost)) return null;
  payCost(owner, def.cost);
  return createBuilding(owner, type, tx, ty, false);
}

function completeBuilding(b) {
  b.done = true; b.prog = b.def.time; b.hp = b.def.hp;
  if (b.def.pop) G.players[b.owner].popCap += b.def.pop;
  if (b.owner === 0) { sfx('built'); }
}

/* ---------- orders ---------- */
function orderStop(u) { u.task = { k: 'idle' }; u.path = null; u.returnTo = null; }
function orderMove(u, x, y) {
  u.returnTo = null;
  u.path = findPath(u.x, u.y, x, y);
  u.task = u.path ? { k: 'move' } : { k: 'idle' };
}
function orderAMove(u, x, y) {
  u.path = findPath(u.x, u.y, x, y);
  u.task = u.path ? { k: 'amove', x, y } : { k: 'idle' };
}
function orderAttack(u, target) {
  u.task = { k: 'attack', target, rp: 0 };
  u.path = null;
}
function orderGather(u, tx, ty) {
  if (u.type !== 'villager') return;
  const tt = G.tiles[idx(tx, ty)];
  if (!RES_TYPE[tt]) return;
  if (u.carryType !== RES_TYPE[tt]) { u.carry = 0; u.carryType = RES_TYPE[tt]; }
  u.task = { k: 'gather', node: { tx, ty, tt } };
  u.path = null; u.returnTo = null;
}
function orderBuild(u, b) {
  if (u.type !== 'villager' || !b || b.done) return;
  u.task = { k: 'build', b };
  u.path = null; u.returnTo = null;
}
// the villager (if any) currently working or hauling for a farm
function farmWorker(b) {
  return G.units.find(u => !u.dead &&
    ((u.task.k === 'farm' && u.task.b === b) || (u.task.k === 'deposit' && u.task.farm === b)));
}
function orderFarm(u, b) {
  if (u.type !== 'villager' || !b || b.dead || !b.done || !b.def.farmPlot) return false;
  const w = farmWorker(b);
  if (w && w !== u) {
    if (u.owner === 0) toast('That farm already has a farmer', true);
    return false;
  }
  if (u.carryType !== 'food') { u.carry = 0; u.carryType = 'food'; }
  u.task = { k: 'farm', b };
  u.path = null; u.returnTo = null;
  return true;
}

/* ---------- movement ---------- */
function moveAlong(u, dt) {
  u.moving = false;
  if (!u.path || !u.path.length) return true;
  const wp = u.path[0];
  const dx = wp.x - u.x, dy = wp.y - u.y;
  const d = Math.hypot(dx, dy);
  const step = u.def.speed * dt;
  if (d <= step) {
    u.x = wp.x; u.y = wp.y; u.path.shift();
    return u.path.length === 0;
  }
  u.x += dx / d * step; u.y += dy / d * step;
  const sdx = dx - dy;
  if (Math.abs(sdx) > 0.03) u.dirX = sdx > 0 ? 1 : -1;
  u.moving = true; u.anim += dt;
  return false;
}

// nearest reachable point on an entity, from a unit's position
function closestPoint(ent, from) {
  if (ent.kind === 'unit') return { px: ent.x, py: ent.y, rad: 0.3 };
  return { px: clamp(from.x, ent.tx, ent.tx + ent.w), py: clamp(from.y, ent.ty, ent.ty + ent.h), rad: 0.25 };
}

function nearestDropoff(u) {
  let best = null, bd = 1e9;
  for (const b of G.buildings) {
    if (b.owner !== u.owner || !b.done || b.dead || !b.def.dropoff) continue;
    if (u.carryType && !b.def.dropoff.includes(u.carryType)) continue;
    const d = dist2(b.cx, b.cy, u.x, u.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

/* ---------- combat ---------- */
function meleeDamage(att, tgt) {
  let dmg = att.def.atk;
  if (att.def.bonusVs === 'cav' && tgt.kind === 'unit' && tgt.def.cls === 'cav') dmg += att.def.bonus;
  return dmg;
}
function dealDamage(tgt, amt, attacker) {
  if (tgt.dead) return;
  tgt.hp -= amt;
  // retaliation: idle units fight back, gathering villagers defend themselves
  if (tgt.kind === 'unit' && attacker && attacker.kind === 'unit' && !attacker.dead) {
    const k = tgt.task.k;
    if (k === 'idle' || (tgt.type === 'villager' && (k === 'gather' || k === 'build'))) {
      orderAttack(tgt, attacker);
    }
  }
  if (tgt.hp <= 0) killEntity(tgt);
}
function killEntity(e) {
  e.dead = true;
  if (e.kind === 'unit') {
    G.players[e.owner].pop--;
    G.fx.push({ x: e.x, y: e.y, t: 0.6, kind: 'puff' });
    if (tileVisible(Math.floor(e.x), Math.floor(e.y))) sfx('die');
  } else {
    if (!e.def.walkable) setBlocked(e.tx, e.ty, e.w, e.h, 0);
    if (e.done && e.def.pop) G.players[e.owner].popCap -= e.def.pop;
    for (const q of e.queue) { refundCost(e.owner, UNIT_DEFS[q.type].cost); G.players[e.owner].pop--; }
    e.queue.length = 0;
    G.fx.push({ x: e.cx, y: e.cy, t: 0.9, kind: 'rubble' });
    sfx('die');
  }
  const si = G.sel.indexOf(e);
  if (si >= 0) { G.sel.splice(si, 1); if (typeof selectionChanged === 'function') selectionChanged(); }
}

function spawnArrow(src, tgt) {
  const from = src.kind === 'bld' ? { x: src.cx, y: src.cy } : { x: src.x, y: src.y };
  G.projectiles.push({
    x: from.x, y: from.y, sx: from.x, sy: from.y,
    ax: tgt.kind === 'bld' ? tgt.cx : tgt.x, ay: tgt.kind === 'bld' ? tgt.cy : tgt.y,
    tgt, dmg: src.def.atk, h0: src.kind === 'bld' ? src.def.height : 14,
  });
  if (src.owner === 0 || tileVisible(Math.floor(from.x), Math.floor(from.y))) sfx('arrow');
}

function nearestEnemy(owner, x, y, r, unitsOnly) {
  const r2 = r * r;
  let best = null, bd = 1e9;
  for (const u of G.units) {
    if (u.owner === owner || u.dead) continue;
    const d = dist2(u.x, u.y, x, y);
    if (d <= r2 && d < bd) { bd = d; best = u; }
  }
  if (best || unitsOnly) return best;
  for (const b of G.buildings) {
    if (b.owner === owner || b.dead) continue;
    const px = clamp(x, b.tx, b.tx + b.w), py = clamp(y, b.ty, b.ty + b.h);
    const d = dist2(px, py, x, y);
    if (d <= r2 && d < bd) { bd = d; best = b; }
  }
  return best;
}

// idle / attack-moving military acquires targets
function aggroPass() {
  for (const u of G.units) {
    if (u.dead || u.def.aggro <= 0) continue;
    const k = u.task.k;
    if (k !== 'idle' && k !== 'amove') continue;
    const e = nearestEnemy(u.owner, u.x, u.y, u.def.aggro, false);
    if (e) {
      if (k === 'amove') u.returnTo = { x: u.task.x, y: u.task.y };
      orderAttack(u, e);
    }
  }
  for (const b of G.buildings) {
    if (b.dead || !b.done || !b.def.atk) continue;
    if (b.target && (b.target.dead ||
        dist2(b.target.kind === 'bld' ? b.target.cx : b.target.x, b.target.kind === 'bld' ? b.target.cy : b.target.y, b.cx, b.cy) > b.def.range * b.def.range))
      b.target = null;
    if (!b.target) b.target = nearestEnemy(b.owner, b.cx, b.cy, b.def.range, true);
  }
}

/* ---------- training & ages ---------- */
function spawnPointFor(b) {
  for (let r = 1; r <= 6; r++) {
    let best = null, bd = 1e9;
    for (let y = b.ty - r; y <= b.ty + b.h + r - 1; y++)
      for (let x = b.tx - r; x <= b.tx + b.w + r - 1; x++) {
        if (Math.max(b.tx - x, x - (b.tx + b.w - 1), b.ty - y, y - (b.ty + b.h - 1)) !== r) continue;
        if (!isPassable(x, y)) continue;
        const ref = b.rally || { x: b.cx, y: b.cy + 2 };
        const d = dist2(x + 0.5, y + 0.5, ref.x, ref.y);
        if (d < bd) { bd = d; best = { x: x + 0.5, y: y + 0.5 }; }
      }
    if (best) return best;
  }
  return { x: b.cx, y: b.cy + b.h };
}

function trainUnit(b, type) {
  const def = UNIT_DEFS[type];
  const p = G.players[b.owner];
  if (def.age > p.age) { if (b.owner === 0) toast(`Requires the ${AGES[def.age]}`, true); return false; }
  if (b.queue.length >= 5) { if (b.owner === 0) toast('Queue is full', true); return false; }
  if (p.pop >= p.popCap) { if (b.owner === 0) toast('Build more houses!', true); return false; }
  if (!canAfford(b.owner, def.cost)) {
    if (b.owner === 0) toast(`Not enough ${Object.keys(def.cost).find(k => p.res[k] < def.cost[k])}`, true);
    return false;
  }
  payCost(b.owner, def.cost);
  p.pop++;
  b.queue.push({ type, left: def.time });
  if (b.owner === 0) sfx('click');
  return true;
}
function cancelQueued(b, i) {
  const q = b.queue[i];
  if (!q) return;
  refundCost(b.owner, UNIT_DEFS[q.type].cost);
  G.players[b.owner].pop--;
  b.queue.splice(i, 1);
}
function startAgeUp(owner) {
  const p = G.players[owner];
  if (p.age >= AGES.length - 1 || p.ageUp) return false;
  const cost = AGE_COST[p.age + 1];
  if (!canAfford(owner, cost)) {
    if (owner === 0) toast(`Advancing requires ${costText(cost)}`, true);
    return false;
  }
  payCost(owner, cost);
  p.ageUp = { left: AGE_TIME[p.age + 1], total: AGE_TIME[p.age + 1] };
  if (owner === 0) sfx('click');
  return true;
}

/* ---------- per-frame updates ---------- */
function updateUnit(u, dt) {
  u.cool = Math.max(0, u.cool - dt);
  u.swingT = Math.max(0, u.swingT - dt);
  const t = u.task;

  switch (t.k) {
    case 'idle': u.moving = false; break;

    case 'move':
      if (moveAlong(u, dt)) u.task = { k: 'idle' };
      break;

    case 'amove':
      if (moveAlong(u, dt)) u.task = { k: 'idle' };
      break;

    case 'attack': {
      const tgt = t.target;
      if (!tgt || tgt.dead) {
        if (u.returnTo) { const r = u.returnTo; u.returnTo = null; orderAMove(u, r.x, r.y); }
        else u.task = { k: 'idle' };
        break;
      }
      const { px, py, rad } = closestPoint(tgt, u);
      const d = Math.hypot(px - u.x, py - u.y);
      if (d <= u.def.range + rad) {
        u.path = null; u.moving = false;
        const sdx = (px - u.x) - (py - u.y);
        if (Math.abs(sdx) > 0.01) u.dirX = sdx > 0 ? 1 : -1;
        if (u.cool <= 0) {
          u.cool = u.def.rof; u.swingT = 0.3;
          if (u.def.arrow) spawnArrow(u, tgt);
          else {
            dealDamage(tgt, meleeDamage(u, tgt), u);
            if (u.owner === 0 || tileVisible(Math.floor(u.x), Math.floor(u.y))) sfx('fight');
          }
        }
      } else {
        t.rp = (t.rp || 0) - dt;
        if (!u.path || !u.path.length || t.rp <= 0) {
          t.rp = 0.7;
          u.path = findPath(u.x, u.y, px, py);
          if (!u.path) { u.task = { k: 'idle' }; break; }
        }
        moveAlong(u, dt);
      }
      break;
    }

    case 'gather': {
      if (u.carry >= CARRY_MAX) { u.task = { k: 'deposit', node: t.node }; break; }
      const n = t.node;
      const i = n ? idx(n.tx, n.ty) : -1;
      if (!n || G.tiles[i] !== n.tt || G.resAmt[i] <= 0) {
        const nn = findNearestRes(n ? n.tt : TILE.FOREST, u.x, u.y, 16);
        if (nn) { t.node = { tx: nn.tx, ty: nn.ty, tt: n.tt }; u.path = null; }
        else u.task = u.carry > 0 ? { k: 'deposit', node: null } : { k: 'idle' };
        break;
      }
      const cx = n.tx + 0.5, cy = n.ty + 0.5;
      const d = Math.hypot(cx - u.x, cy - u.y);
      if (d > 1.35) {
        if (!u.path || !u.path.length) {
          u.path = findPath(u.x, u.y, cx, cy);
          if (!u.path) { u.task = { k: 'idle' }; break; }
        }
        moveAlong(u, dt);
      } else {
        u.path = null; u.moving = false; u.anim += dt;
        u.dirX = ((cx - u.x) - (cy - u.y)) >= 0 ? 1 : -1;
        if (u.swingT <= 0) u.swingT = 0.3;
        u.carryType = RES_TYPE[n.tt];
        const take = Math.min(GATHER_RATE * dt, G.resAmt[i], CARRY_MAX - u.carry);
        u.carry += take; G.resAmt[i] -= take;
        if (G.resAmt[i] <= 0) depleteTile(n.tx, n.ty);
      }
      break;
    }

    case 'farm': {
      const b = t.b;
      if (!b || b.dead || !b.done) { u.task = { k: 'idle' }; break; }
      if (u.carry >= CARRY_MAX) { u.task = { k: 'deposit', farm: b }; break; }
      const d = Math.hypot(b.cx - u.x, b.cy - u.y);
      if (d > 0.6) {
        if (!u.path || !u.path.length) {
          u.path = findPath(u.x, u.y, b.cx, b.cy);
          if (!u.path) { u.task = { k: 'idle' }; break; }
        }
        moveAlong(u, dt);
      } else {
        u.path = null; u.moving = false; u.anim += dt;
        if (u.swingT <= 0) u.swingT = 0.3;
        u.carryType = 'food';
        u.carry += GATHER_RATE * dt;
      }
      break;
    }

    case 'deposit': {
      const resume = () => {
        if (t.farm && !t.farm.dead && t.farm.done) return { k: 'farm', b: t.farm };
        if (t.node) return { k: 'gather', node: t.node };
        return { k: 'idle' };
      };
      if (u.carry <= 0.01) {
        u.carry = 0;
        u.task = resume();
        break;
      }
      const dp = nearestDropoff(u);
      if (!dp) { u.task = { k: 'idle' }; break; }
      const { px, py, rad } = closestPoint(dp, u);
      const d = Math.hypot(px - u.x, py - u.y);
      if (d <= 0.85 + rad) {
        G.players[u.owner].res[u.carryType] += u.carry;
        u.carry = 0;
        u.task = resume();
        u.path = null;
      } else {
        if (!u.path || !u.path.length || t.bid !== dp.id) {
          t.bid = dp.id;
          u.path = findPath(u.x, u.y, px, py);
          if (!u.path) { u.task = { k: 'idle' }; break; }
        }
        moveAlong(u, dt);
      }
      break;
    }

    case 'build': {
      const b = t.b;
      if (!b || b.dead || b.done) { u.task = { k: 'idle' }; break; }
      const { px, py, rad } = closestPoint(b, u);
      const d = Math.hypot(px - u.x, py - u.y);
      if (d > 0.9 + rad) {
        if (!u.path || !u.path.length) {
          u.path = findPath(u.x, u.y, px, py);
          if (!u.path) { u.task = { k: 'idle' }; break; }
        }
        moveAlong(u, dt);
      } else {
        u.path = null; u.moving = false; u.anim += dt;
        u.dirX = ((px - u.x) - (py - u.y)) >= 0 ? 1 : -1;
        if (u.swingT <= 0) u.swingT = 0.3;
        b.prog += dt;
        b.hp = Math.min(b.def.hp, b.hp + b.def.hp * dt / b.def.time * 0.9);
        if (b.prog >= b.def.time) {
          completeBuilding(b);
          if (b.def.farmPlot) orderFarm(u, b); // the builder starts farming the field
        }
      }
      break;
    }
  }
}

function updateBuilding(b, dt) {
  if (!b.done) return;
  b.cool = Math.max(0, b.cool - dt);
  // training
  if (b.queue.length) {
    const q = b.queue[0];
    q.left -= dt;
    if (q.left <= 0) {
      const sp = spawnPointFor(b);
      const u = createUnit(b.owner, q.type, sp.x, sp.y);
      b.queue.shift();
      if (b.rally) {
        const rtx = Math.floor(b.rally.x), rty = Math.floor(b.rally.y);
        const rallyFarm = u.type === 'villager' && G.buildings.find(f => !f.dead && f.done &&
          f.owner === b.owner && f.def.farmPlot && rtx >= f.tx && rtx < f.tx + f.w && rty >= f.ty && rty < f.ty + f.h);
        if (rallyFarm && orderFarm(u, rallyFarm)) { /* new villager works the field */ }
        else if (u.type === 'villager' && inMap(rtx, rty) && RES_TYPE[G.tiles[idx(rtx, rty)]] && G.resAmt[idx(rtx, rty)] > 0)
          orderGather(u, rtx, rty);
        else orderMove(u, b.rally.x, b.rally.y);
      }
      if (b.owner === 0) sfx('train');
    }
  }
  // defensive fire
  if (b.def.atk && b.target && !b.target.dead && b.cool <= 0) {
    b.cool = b.def.rof;
    spawnArrow(b, b.target);
  }
}

function updateProjectiles(dt) {
  for (const p of G.projectiles) {
    if (p.tgt && !p.tgt.dead) {
      p.ax = p.tgt.kind === 'bld' ? p.tgt.cx : p.tgt.x;
      p.ay = p.tgt.kind === 'bld' ? p.tgt.cy : p.tgt.y;
    }
    const dx = p.ax - p.x, dy = p.ay - p.y;
    const d = Math.hypot(dx, dy);
    const step = 10 * dt;
    if (d <= step) {
      p.dead = true;
      if (p.tgt && !p.tgt.dead) {
        const { px, py } = closestPoint(p.tgt, p);
        if (dist2(px, py, p.ax, p.ay) < 1.2) dealDamage(p.tgt, p.dmg, null);
      }
      G.fx.push({ x: p.ax, y: p.ay, t: 0.25, kind: 'hit' });
    } else {
      p.x += dx / d * step; p.y += dy / d * step;
    }
  }
  G.projectiles = G.projectiles.filter(p => !p.dead);
}

/* light unit separation so idle troops don't stack */
function separationPass() {
  const bucket = new Map();
  for (const u of G.units) {
    if (u.dead) continue;
    const k = (u.x | 0) + ',' + (u.y | 0);
    if (!bucket.has(k)) bucket.set(k, []);
    bucket.get(k).push(u);
  }
  for (const u of G.units) {
    if (u.dead || u.moving) continue;
    const bx = u.x | 0, by = u.y | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const list = bucket.get((bx + dx) + ',' + (by + dy));
      if (!list) continue;
      for (const v of list) {
        if (v === u || v.dead) continue;
        const d2 = dist2(u.x, u.y, v.x, v.y);
        if (d2 < 0.12 && d2 > 0.000001) {
          const d = Math.sqrt(d2), push = (0.35 - d) * 0.5;
          const nx = u.x + (u.x - v.x) / d * push, ny = u.y + (u.y - v.y) / d * push;
          if (isPassable(Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny; }
        } else if (d2 <= 0.000001) {
          const nx = u.x + (hash2(u.id, v.id) - 0.5) * 0.3, ny = u.y + (hash2(v.id, u.id) - 0.5) * 0.3;
          if (isPassable(Math.floor(nx), Math.floor(ny))) { u.x = nx; u.y = ny; }
        }
      }
    }
  }
}

function updateGame(dt) {
  for (let pi = 0; pi < 2; pi++) {
    const p = G.players[pi];
    if (p.ageUp) {
      p.ageUp.left -= dt;
      if (p.ageUp.left <= 0) {
        p.age++; p.ageUp = null;
        if (pi === 0) { toast(`You have advanced to the ${AGES[p.age]}!`); sfx('age'); }
        else toast(`The enemy has reached the ${AGES[G.players[1].age]}.`, true);
      }
    }
  }
  for (const u of G.units) if (!u.dead) updateUnit(u, dt);
  for (const b of G.buildings) if (!b.dead) updateBuilding(b, dt);
  updateProjectiles(dt);
  for (const f of G.fx) f.t -= dt;
  G.fx = G.fx.filter(f => f.t > 0);
  // sweep the dead
  if (G.units.some(u => u.dead)) G.units = G.units.filter(u => !u.dead);
  if (G.buildings.some(b => b.dead)) G.buildings = G.buildings.filter(b => !b.dead);
}

/* ---------- picking ---------- */
function entAtPoint(wx, wy) {
  // units: screen-space pick, prefer own
  const sp = ws(wx, wy);
  let best = null, bd = 1e9;
  for (const u of G.units) {
    if (u.dead) continue;
    if (u.owner !== 0 && !tileVisible(Math.floor(u.x), Math.floor(u.y))) continue;
    const p = ws(u.x, u.y);
    if (Math.abs(sp.x - p.x) < 14 && sp.y - p.y < 10 && p.y - sp.y < 34) {
      const d = dist2(sp.x, sp.y, p.x, p.y - 12) + (u.owner === 0 ? 0 : 500);
      if (d < bd) { bd = d; best = u; }
    }
  }
  if (best) return best;
  const tx = Math.floor(wx), ty = Math.floor(wy);
  for (const b of G.buildings) {
    if (b.dead) continue;
    if (b.owner !== 0 && !tileExplored(tx, ty)) continue;
    if (tx >= b.tx && tx < b.tx + b.w && ty >= b.ty && ty < b.ty + b.h) return b;
  }
  return null;
}
