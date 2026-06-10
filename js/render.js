'use strict';
/* ====== rendering: camera, terrain, scene, fog, minimap ====== */

let canvas, ctx, groundCv, groundCtx;
const GOX = MAPH * HW; // ground canvas x-offset so (x-y) never goes negative
let mmCanvas, mmCtx, mmS, mmOX;

function initRender() {
  canvas = document.getElementById('view');
  ctx = canvas.getContext('2d');
  mmCanvas = document.getElementById('minimap');
  mmCtx = mmCanvas.getContext('2d');
  mmS = mmCanvas.width / (MAPW + MAPH);
  mmOX = MAPH * mmS;
  const fit = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  addEventListener('resize', fit); fit();
  buildGround();
}

/* ---------- terrain pre-render ---------- */
function groundTileFill(c, tx, ty) {
  const t = G.tiles[idx(tx, ty)];
  const p = ws(tx + 0.5, ty + 0.5);
  const sx = p.x + GOX, sy = p.y;
  const h = hash2(tx, ty);
  let col;
  if (t === TILE.WATER) col = h > 0.5 ? '#2b4a6e' : '#2f5278';
  else {
    const g = 0.92 + h * 0.16;
    const base = t === TILE.FOREST ? [62, 84, 38] : [78, 105, 46];
    col = `rgb(${base[0] * g | 0},${base[1] * g | 0},${base[2] * g | 0})`;
  }
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(sx, sy - HH - 0.7);
  c.lineTo(sx + HW + 1.2, sy);
  c.lineTo(sx, sy + HH + 0.7);
  c.lineTo(sx - HW - 1.2, sy);
  c.closePath(); c.fill();
  // sparse texture flecks
  if (t === TILE.GRASS && h > 0.82) {
    c.fillStyle = 'rgba(40,60,20,0.5)';
    c.fillRect(sx + (h - 0.9) * 200, sy - 2, 2, 1.4);
  }
  if (t === TILE.WATER && h > 0.7) {
    c.fillStyle = 'rgba(190,220,240,0.25)';
    c.fillRect(sx - 8 + h * 14, sy, 9, 1);
  }
}
function buildGround() {
  groundCv = document.createElement('canvas');
  groundCv.width = (MAPW + MAPH) * HW;
  groundCv.height = (MAPW + MAPH) * HH;
  groundCtx = groundCv.getContext('2d');
  groundCtx.fillStyle = '#0b0905';
  groundCtx.fillRect(0, 0, groundCv.width, groundCv.height);
  for (let ty = 0; ty < MAPH; ty++)
    for (let tx = 0; tx < MAPW; tx++)
      groundTileFill(groundCtx, tx, ty);
}
function redrawGroundTile(tx, ty) {
  if (groundCtx) groundTileFill(groundCtx, tx, ty);
}

/* ---------- camera ---------- */
function screenToWorld(px, py) {
  const sx = px / G.zoom + G.cam.x, sy = py / G.zoom + G.cam.y;
  return { x: (sx / HW + sy / HH) / 2, y: (sy / HH - sx / HW) / 2 };
}
function worldToScreenPx(x, y) {
  const p = ws(x, y);
  return { x: (p.x - G.cam.x) * G.zoom, y: (p.y - G.cam.y) * G.zoom };
}
function clampCamera() {
  const vw = canvas.width / G.zoom, vh = canvas.height / G.zoom;
  G.cam.x = clamp(G.cam.x, -MAPH * HW - vw * 0.2, MAPW * HW - vw * 0.8);
  G.cam.y = clamp(G.cam.y, -vh * 0.2, (MAPW + MAPH) * HH - vh * 0.7);
}
function centerCamera(x, y) {
  const p = ws(x, y);
  G.cam.x = p.x - canvas.width / (2 * G.zoom);
  G.cam.y = p.y - canvas.height / (2 * G.zoom);
  clampCamera();
}

/* ---------- main scene ---------- */
function visibleTileRange() {
  const corners = [
    screenToWorld(0, -40), screenToWorld(canvas.width, -40),
    screenToWorld(0, canvas.height + 90), screenToWorld(canvas.width, canvas.height + 90),
  ];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const c of corners) {
    x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x);
    y0 = Math.min(y0, c.y); y1 = Math.max(y1, c.y);
  }
  return {
    x0: clamp(Math.floor(x0) - 1, 0, MAPW - 1), x1: clamp(Math.ceil(x1) + 1, 0, MAPW - 1),
    y0: clamp(Math.floor(y0) - 1, 0, MAPH - 1), y1: clamp(Math.ceil(y1) + 1, 0, MAPH - 1),
  };
}

function render() {
  ctx.fillStyle = '#0b0905';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.setTransform(G.zoom, 0, 0, G.zoom, -G.cam.x * G.zoom, -G.cam.y * G.zoom);
  ctx.drawImage(groundCv, -GOX, 0);

  const r = visibleTileRange();
  const draws = [];

  // terrain doodads
  for (let ty = r.y0; ty <= r.y1; ty++)
    for (let tx = r.x0; tx <= r.x1; tx++) {
      const i = idx(tx, ty);
      const t = G.tiles[i];
      if (t === TILE.GRASS || t === TILE.WATER) continue;
      if (!G.explored[i]) continue;
      draws.push({ d: tx + ty, f: drawTileDoodad, a: [ctx, t, tx, ty] });
    }
  // buildings (visible if explored)
  for (const b of G.buildings) {
    if (b.dead) continue;
    if (b.tx > r.x1 || b.ty > r.y1 || b.tx + b.w < r.x0 || b.ty + b.h < r.y0) continue;
    if (!tileExplored(Math.floor(b.cx), Math.floor(b.cy))) continue;
    draws.push({ d: b.tx + b.ty + b.w + b.h - 2 + 0.1, f: (c, bb) => { drawBuilding(c, bb); drawBuildingHP(c, bb); }, a: [ctx, b] });
  }
  // units (enemy only when in sight)
  for (const u of G.units) {
    if (u.dead) continue;
    if (u.x < r.x0 - 1 || u.x > r.x1 + 1 || u.y < r.y0 - 1 || u.y > r.y1 + 1) continue;
    if (u.owner !== 0 && !tileVisible(Math.floor(u.x), Math.floor(u.y))) continue;
    draws.push({ d: u.x + u.y + 0.2, f: drawUnit, a: [ctx, u] });
  }
  draws.sort((a, b) => a.d - b.d);
  for (const d of draws) d.f(...d.a);

  // projectiles (arcing arrows)
  for (const p of G.projectiles) {
    if (!tileVisible(Math.floor(p.x), Math.floor(p.y)) && !tileVisible(Math.floor(p.ax), Math.floor(p.ay))) continue;
    const sp = ws(p.x, p.y);
    const total = Math.hypot(p.ax - p.sx, p.ay - p.sy) || 1;
    const t = clamp(1 - Math.hypot(p.ax - p.x, p.ay - p.y) / total, 0, 1);
    const arc = Math.sin(t * Math.PI) * Math.min(26, total * 5) + (1 - t) * (p.h0 || 12);
    const dirp = ws(p.ax, p.ay);
    const ang = Math.atan2(dirp.y - sp.y, dirp.x - sp.x);
    ctx.save();
    ctx.translate(sp.x, sp.y - arc);
    ctx.rotate(ang);
    ctx.strokeStyle = '#e6dcc3'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.restore();
  }
  // fx
  for (const f of G.fx) {
    const p = ws(f.x, f.y);
    if (f.kind === 'puff' || f.kind === 'rubble') {
      const a = clamp(f.t / 0.6, 0, 1);
      ctx.fillStyle = f.kind === 'rubble' ? `rgba(120,100,70,${a * 0.7})` : `rgba(220,210,190,${a * 0.6})`;
      const rr = (1 - a) * (f.kind === 'rubble' ? 26 : 12) + 4;
      ctx.beginPath(); ctx.ellipse(p.x, p.y - 4, rr, rr * 0.55, 0, 0, 7); ctx.fill();
    } else if (f.kind === 'hit') {
      ctx.fillStyle = `rgba(255,230,160,${clamp(f.t / 0.25, 0, 1)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y - 6, 2.5, 0, 7); ctx.fill();
    }
  }

  // fog of war — batch each layer into one path so overlapping diamond
  // edges don't double-darken into a grid pattern
  const fogDark = new Path2D(), fogDim = new Path2D();
  for (let ty = r.y0; ty <= r.y1; ty++)
    for (let tx = r.x0; tx <= r.x1; tx++) {
      const i = idx(tx, ty);
      if (G.visible[i]) continue;
      const p = ws(tx + 0.5, ty + 0.5);
      const path = G.explored[i] ? fogDim : fogDark;
      path.moveTo(p.x, p.y - HH - 0.8);
      path.lineTo(p.x + HW + 1.4, p.y);
      path.lineTo(p.x, p.y + HH + 0.8);
      path.lineTo(p.x - HW - 1.4, p.y);
      path.closePath();
    }
  ctx.fillStyle = '#07070c'; ctx.fill(fogDark);
  ctx.fillStyle = 'rgba(8,8,18,0.42)'; ctx.fill(fogDim);

  // rally point of selected building
  for (const e of G.sel) {
    if (e.kind === 'bld' && e.owner === 0 && e.rally) {
      const p = ws(e.rally.x, e.rally.y);
      ctx.strokeStyle = '#caa84e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 16); ctx.stroke();
      ctx.fillStyle = '#caa84e';
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 16); ctx.lineTo(p.x + 10, p.y - 13); ctx.lineTo(p.x, p.y - 10); ctx.closePath(); ctx.fill();
    }
  }

  // building placement ghost
  if (G.placing) {
    const def = BUILD_DEFS[G.placing];
    const tx = Math.round(G.hover.x - def.w / 2), ty = Math.round(G.hover.y - def.h / 2);
    const ok = canPlace(G.placing, tx, ty, 0);
    for (let y = ty; y < ty + def.h; y++)
      for (let x = tx; x < tx + def.w; x++) {
        const p = ws(x + 0.5, y + 0.5);
        ctx.fillStyle = ok ? 'rgba(120,220,110,0.35)' : 'rgba(230,80,60,0.4)';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - HH); ctx.lineTo(p.x + HW, p.y);
        ctx.lineTo(p.x, p.y + HH); ctx.lineTo(p.x - HW, p.y);
        ctx.closePath(); ctx.fill();
      }
    ctx.globalAlpha = 0.55;
    drawBuilding(ctx, { type: G.placing, def, tx, ty, w: def.w, h: def.h, cx: tx + def.w / 2, cy: ty + def.h / 2, done: true, prog: def.time, owner: 0, queue: [] });
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  // selection drag box (screen space)
  if (G.dragBox) {
    ctx.strokeStyle = 'rgba(190,255,170,0.9)'; ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(120,220,110,0.08)';
    const { x0, y0, x1, y1 } = G.dragBox;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
}

/* ---------- minimap ---------- */
const MM_COLS = ['#3f5a23', '#1d4017', '#caa23a', '#9c4a3a', '#274468'];
function renderMinimap() {
  const w = mmCanvas.width, h = mmCanvas.height;
  mmCtx.fillStyle = '#07080a';
  mmCtx.fillRect(0, 0, w, h);
  for (let ty = 0; ty < MAPH; ty++)
    for (let tx = 0; tx < MAPW; tx++) {
      const i = idx(tx, ty);
      if (!G.explored[i]) continue;
      mmCtx.fillStyle = MM_COLS[G.tiles[i]];
      const x = (tx - ty) * mmS + mmOX, y = (tx + ty) * mmS / 2;
      mmCtx.fillRect(x, y, mmS * 1.6, mmS * 0.9);
      if (!G.visible[i]) {
        mmCtx.fillStyle = 'rgba(5,5,12,0.45)';
        mmCtx.fillRect(x, y, mmS * 1.6, mmS * 0.9);
      }
    }
  for (const b of G.buildings) {
    if (b.dead) continue;
    if (b.owner !== 0 && !tileExplored(Math.floor(b.cx), Math.floor(b.cy))) continue;
    mmCtx.fillStyle = TEAM[b.owner].light;
    const x = (b.cx - b.cy) * mmS + mmOX, y = (b.cx + b.cy) * mmS / 2;
    mmCtx.fillRect(x - 2, y - 2, b.type === 'towncenter' ? 5 : 4, b.type === 'towncenter' ? 5 : 4);
  }
  for (const u of G.units) {
    if (u.dead) continue;
    if (u.owner !== 0 && !tileVisible(Math.floor(u.x), Math.floor(u.y))) continue;
    mmCtx.fillStyle = TEAM[u.owner].light;
    const x = (u.x - u.y) * mmS + mmOX, y = (u.x + u.y) * mmS / 2;
    mmCtx.fillRect(x - 1, y - 1, 2.4, 2.4);
  }
  // camera viewport rectangle: world-screen rect maps linearly onto the minimap
  const kx = mmS / HW, ky = mmS / (2 * HH);
  const vx = G.cam.x * kx + mmOX, vy = G.cam.y * ky;
  const vw = canvas.width / G.zoom * kx, vh = canvas.height / G.zoom * ky;
  mmCtx.strokeStyle = 'rgba(233,220,184,0.85)';
  mmCtx.lineWidth = 1;
  mmCtx.strokeRect(vx, vy, vw, vh);
}
function minimapToWorld(mx, my) {
  const sx = (mx - mmOX) * HW / mmS;
  const sy = my * (2 * HH) / mmS;
  return { x: (sx / HW + sy / HH) / 2, y: (sy / HH - sx / HW) / 2 };
}
