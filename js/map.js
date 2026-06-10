'use strict';
/* ====== map generation, pathfinding, fog of war ====== */

function setBlocked(tx, ty, w, h, v) {
  for (let y = ty; y < ty + h; y++)
    for (let x = tx; x < tx + w; x++)
      if (inMap(x, y)) G.block[idx(x, y)] = v;
}
function isPassable(tx, ty) { return inMap(tx, ty) && !G.block[idx(tx, ty)]; }

function genMap() {
  G.tiles = new Uint8Array(MAPW * MAPH);
  G.resAmt = new Float32Array(MAPW * MAPH);
  G.block = new Uint8Array(MAPW * MAPH);
  G.explored = new Uint8Array(MAPW * MAPH);
  G.visible = new Uint8Array(MAPW * MAPH);

  const setRes = (tx, ty, t) => {
    if (!inMap(tx, ty)) return;
    const i = idx(tx, ty);
    G.tiles[i] = t; G.resAmt[i] = RES_AMOUNT[t]; G.block[i] = 1;
  };
  const blob = (cx, cy, n, t) => {
    let x = cx, y = cy;
    for (let i = 0; i < n; i++) {
      if (inMap(x, y) && G.tiles[idx(x, y)] === TILE.GRASS) {
        if (t === TILE.WATER) { G.tiles[idx(x, y)] = t; G.block[idx(x, y)] = 1; }
        else setRes(x, y, t);
      }
      x += (Math.random() * 3 | 0) - 1; y += (Math.random() * 3 | 0) - 1;
      x = clamp(x, 1, MAPW - 2); y = clamp(y, 1, MAPH - 2);
    }
  };

  // scattered forests & lakes
  for (let i = 0; i < 30; i++)
    blob(2 + Math.random() * (MAPW - 4) | 0, 2 + Math.random() * (MAPH - 4) | 0, 26 + Math.random() * 40, TILE.FOREST);
  for (let i = 0; i < 4; i++)
    blob(6 + Math.random() * (MAPW - 12) | 0, 6 + Math.random() * (MAPH - 12) | 0, 24 + Math.random() * 24, TILE.WATER);
  // neutral gold in the middle band
  for (let i = 0; i < 3; i++) {
    const gx = MAPW / 2 + (Math.random() * 24 - 12) | 0, gy = MAPH / 2 + (Math.random() * 24 - 12) | 0;
    blob(gx, gy, 5, TILE.GOLD);
  }

  const starts = [{ x: 19, y: MAPH - 21 }, { x: MAPW - 21, y: 19 }];
  for (const s of starts) {
    // clear a starting glade
    for (let y = s.y - 9; y <= s.y + 9; y++)
      for (let x = s.x - 9; x <= s.x + 9; x++) {
        if (!inMap(x, y)) continue;
        if (dist2(x, y, s.x, s.y) <= 81) {
          const i = idx(x, y);
          G.tiles[i] = TILE.GRASS; G.resAmt[i] = 0; G.block[i] = 0;
        }
      }
    // berries one side, gold the other, a guaranteed woodline beyond
    const dir = s.x < MAPW / 2 ? 1 : -1;
    for (let i = 0; i < 6; i++) setRes(s.x + dir * 5 + (i % 3), s.y - 6 + (i / 3 | 0), TILE.BERRY);
    for (let i = 0; i < 5; i++) setRes(s.x - dir * 6 + (i % 3), s.y + 5 + (i / 3 | 0) - dir, TILE.GOLD);
    blob(s.x - dir * 2, s.y + 9 * dir * 0 + 10, 34, TILE.FOREST);
    blob(s.x + dir * 10, s.y + dir * 2 - 10, 30, TILE.FOREST);
  }
  G.startPos = starts;
}

function depleteTile(tx, ty) {
  const i = idx(tx, ty);
  G.tiles[i] = TILE.GRASS; G.resAmt[i] = 0; G.block[i] = 0;
  if (typeof redrawGroundTile === 'function') redrawGroundTile(tx, ty);
}

function nearestPassable(tx, ty, maxR) {
  if (isPassable(tx, ty)) return { x: tx, y: ty };
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isPassable(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
      }
  }
  return null;
}

// passable tile ringing a footprint, nearest to (fx,fy)
function nearestAdjTile(tx, ty, w, h, fx, fy) {
  let best = null, bd = 1e9;
  for (let y = ty - 1; y <= ty + h; y++)
    for (let x = tx - 1; x <= tx + w; x++) {
      if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
      if (!isPassable(x, y)) continue;
      const d = dist2(x + 0.5, y + 0.5, fx, fy);
      if (d < bd) { bd = d; best = { x, y }; }
    }
  return best;
}

function findNearestRes(tileType, cx, cy, maxR) {
  const ctx = clamp(Math.floor(cx), 0, MAPW - 1), cty = clamp(Math.floor(cy), 0, MAPH - 1);
  let best = null, bd = 1e9;
  const R = maxR || 14;
  for (let r = 0; r <= R; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = ctx + dx, y = cty + dy;
        if (!inMap(x, y)) continue;
        const i = idx(x, y);
        if (G.tiles[i] !== tileType || G.resAmt[i] <= 0) continue;
        // must have a free tile beside it to gather from
        if (!nearestAdjTile(x, y, 1, 1, cx, cy)) continue;
        const d = dist2(x + 0.5, y + 0.5, cx, cy);
        if (d < bd) { bd = d; best = { tx: x, ty: y }; }
      }
    if (best && r > Math.sqrt(bd) + 1) break;
  }
  return best;
}

/* ---- A* pathfinding (8-dir, no corner cutting), reusable scratch buffers ---- */
const PF = {
  g: new Float32Array(MAPW * MAPH),
  par: new Int32Array(MAPW * MAPH),
  stamp: new Int32Array(MAPW * MAPH),
  closed: new Uint8Array(MAPW * MAPH),
  gen: 0,
};
const PF_DIRS = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,1.4142],[1,-1,1.4142],[-1,1,1.4142],[-1,-1,1.4142]];

function findPath(sxf, syf, gxf, gyf) {
  const stx = clamp(Math.floor(sxf), 0, MAPW - 1), sty = clamp(Math.floor(syf), 0, MAPH - 1);
  let gtx = clamp(Math.floor(gxf), 0, MAPW - 1), gty = clamp(Math.floor(gyf), 0, MAPH - 1);
  if (!isPassable(gtx, gty)) {
    const n = nearestPassable(gtx, gty, 6);
    if (!n) return null;
    gtx = n.x; gty = n.y;
  }
  if (stx === gtx && sty === gty) return [{ x: gtx + 0.5, y: gty + 0.5 }];

  PF.gen++;
  const gen = PF.gen, gArr = PF.g, par = PF.par, stamp = PF.stamp, closed = PF.closed;
  const goal = idx(gtx, gty);
  const hOf = (x, y) => {
    const dx = Math.abs(x - gtx), dy = Math.abs(y - gty);
    return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
  };
  // binary heap
  const hi = [], hf = [];
  const push = (i, f) => {
    hi.push(i); hf.push(f);
    let c = hi.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (hf[p] <= hf[c]) break;
      [hf[p], hf[c]] = [hf[c], hf[p]]; [hi[p], hi[c]] = [hi[c], hi[p]]; c = p;
    }
  };
  const pop = () => {
    const top = hi[0];
    const li = hi.pop(), lf = hf.pop();
    if (hi.length) {
      hi[0] = li; hf[0] = lf;
      let c = 0;
      for (;;) {
        let m = c; const l = 2 * c + 1, r = l + 1;
        if (l < hi.length && hf[l] < hf[m]) m = l;
        if (r < hi.length && hf[r] < hf[m]) m = r;
        if (m === c) break;
        [hf[m], hf[c]] = [hf[c], hf[m]]; [hi[m], hi[c]] = [hi[c], hi[m]]; c = m;
      }
    }
    return top;
  };

  const start = idx(stx, sty);
  stamp[start] = gen; gArr[start] = 0; par[start] = -1; closed[start] = 0;
  push(start, hOf(stx, sty));
  let bestI = start, bestH = hOf(stx, sty), found = false, expanded = 0;

  while (hi.length && expanded < 9000) {
    const cur = pop();
    if (closed[cur] && stamp[cur] === gen) continue;
    closed[cur] = 1; stamp[cur] = gen; expanded++;
    if (cur === goal) { found = true; break; }
    const cx = cur % MAPW, cy = (cur / MAPW) | 0;
    const ch = hOf(cx, cy);
    if (ch < bestH) { bestH = ch; bestI = cur; }
    for (const [dx, dy, c] of PF_DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!isPassable(nx, ny)) continue;
      if (dx && dy && (!isPassable(cx + dx, cy) || !isPassable(cx, cy + dy))) continue;
      const ni = idx(nx, ny);
      const ng = gArr[cur] + c;
      if (stamp[ni] === gen && (closed[ni] || gArr[ni] <= ng)) continue;
      if (stamp[ni] !== gen) { stamp[ni] = gen; closed[ni] = 0; }
      gArr[ni] = ng; par[ni] = cur;
      push(ni, ng + hOf(nx, ny));
    }
  }

  let end = found ? goal : bestI;
  if (end === start) return null;
  const path = [];
  while (end !== -1 && end !== start) {
    path.push({ x: (end % MAPW) + 0.5, y: ((end / MAPW) | 0) + 0.5 });
    end = (stamp[end] === gen) ? par[end] : -1;
  }
  path.reverse();
  return path.length ? path : null;
}

/* ---- fog of war (player 0 perspective) ---- */
function markLOS(cx, cy, r) {
  const r2 = r * r;
  const x0 = clamp(Math.floor(cx - r), 0, MAPW - 1), x1 = clamp(Math.ceil(cx + r), 0, MAPW - 1);
  const y0 = clamp(Math.floor(cy - r), 0, MAPH - 1), y1 = clamp(Math.ceil(cy + r), 0, MAPH - 1);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++)
      if (dist2(x + 0.5, y + 0.5, cx, cy) <= r2) {
        const i = idx(x, y);
        G.visible[i] = 1; G.explored[i] = 1;
      }
}
function updateFog() {
  G.visible.fill(0);
  for (const u of G.units) if (u.owner === 0 && !u.dead) markLOS(u.x, u.y, u.def.los);
  for (const b of G.buildings) if (b.owner === 0 && !b.dead) markLOS(b.cx, b.cy, b.done ? b.def.los : 4);
}
function tileVisible(tx, ty) { return inMap(tx, ty) && G.visible[idx(tx, ty)] === 1; }
function tileExplored(tx, ty) { return inMap(tx, ty) && G.explored[idx(tx, ty)] === 1; }
