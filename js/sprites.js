'use strict';
/* ====== procedural sprites — every pixel drawn by hand, no assets ====== */

function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }

function diamond(c, sx, sy, s) {
  s = s || 1;
  c.beginPath();
  c.moveTo(sx, sy - HH * s);
  c.lineTo(sx + HW * s, sy);
  c.lineTo(sx, sy + HH * s);
  c.lineTo(sx - HW * s, sy);
  c.closePath();
}

/* ---------- terrain doodads (drawn at world-screen coords) ---------- */
function drawTree(c, tx, ty) {
  const p = ws(tx + 0.5, ty + 0.5);
  const h = hash2(tx, ty);
  const lean = (h - 0.5) * 6, tall = 16 + h * 10;
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath(); c.ellipse(p.x, p.y + 2, 11, 5, 0, 0, 7); c.fill();
  c.strokeStyle = '#4a3520'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(p.x, p.y + 2); c.lineTo(p.x + lean, p.y - tall); c.stroke();
  const g1 = h > 0.5 ? '#27551f' : '#2e6023', g2 = h > 0.5 ? '#1b3d16' : '#214a19';
  c.fillStyle = g2;
  c.beginPath(); c.ellipse(p.x + lean, p.y - tall - 4, 12 + h * 4, 13 + h * 4, 0, 0, 7); c.fill();
  c.fillStyle = g1;
  c.beginPath(); c.ellipse(p.x + lean - 3, p.y - tall - 8, 8 + h * 3, 8 + h * 3, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,230,0.12)';
  c.beginPath(); c.ellipse(p.x + lean - 5, p.y - tall - 11, 4, 3.5, 0, 0, 7); c.fill();
}
function drawGold(c, tx, ty) {
  const p = ws(tx + 0.5, ty + 0.5);
  const h = hash2(tx, ty);
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.ellipse(p.x, p.y + 3, 16, 7, 0, 0, 7); c.fill();
  const rocks = [[-8, 0, 9], [6, 1, 8], [-1, -5, 10], [10, -3, 6]];
  for (let i = 0; i < rocks.length; i++) {
    const [rx, ry, rs] = rocks[i];
    const v = hash2(tx + i, ty - i);
    c.fillStyle = i % 2 ? '#a8842c' : '#c9a23a';
    c.beginPath();
    c.moveTo(p.x + rx - rs, p.y + ry + 2);
    c.lineTo(p.x + rx - rs * 0.4, p.y + ry - rs * 0.8 - v * 3);
    c.lineTo(p.x + rx + rs * 0.5, p.y + ry - rs * 0.6);
    c.lineTo(p.x + rx + rs, p.y + ry + 3);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,240,170,0.5)';
    c.fillRect(p.x + rx - 1, p.y + ry - rs * 0.6, 2.5, 2.5);
  }
}
function drawBerry(c, tx, ty) {
  const p = ws(tx + 0.5, ty + 0.5);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.beginPath(); c.ellipse(p.x, p.y + 2, 12, 5, 0, 0, 7); c.fill();
  c.fillStyle = '#33611f';
  c.beginPath(); c.ellipse(p.x, p.y - 4, 12, 8, 0, 0, 7); c.fill();
  c.fillStyle = '#477c2b';
  c.beginPath(); c.ellipse(p.x - 3, p.y - 7, 8, 5, 0, 0, 7); c.fill();
  c.fillStyle = '#b8323d';
  for (let i = 0; i < 7; i++) {
    const a = hash2(tx * 3 + i, ty + i) * 6.28;
    c.beginPath(); c.arc(p.x + Math.cos(a) * 7, p.y - 5 + Math.sin(a) * 4, 1.6, 0, 7); c.fill();
  }
}
function drawTileDoodad(c, t, tx, ty) {
  if (t === TILE.FOREST) drawTree(c, tx, ty);
  else if (t === TILE.GOLD) drawGold(c, tx, ty);
  else if (t === TILE.BERRY) drawBerry(c, tx, ty);
}

/* ---------- buildings: generic iso box + per-type dressing ---------- */
function isoFace(c, p1, p2, hgt, col) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y);
  c.lineTo(p2.x, p2.y - hgt); c.lineTo(p1.x, p1.y - hgt);
  c.closePath(); c.fill();
}
function raise(p, h) { return { x: p.x, y: p.y - h }; }
function mid(p, q, t) { return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; }

const BLD_STYLE = {
  farm:       { wallL: '#a98a4a', wallR: '#83692f', roof: '#caa84e', roofD: '#9a7733 ' },
  towncenter: { wallL: '#9a8a72', wallR: '#7d6e58', roof: '#8c3a2c', roofD: '#6b2a20', timber: true, flag: true },
  house:      { wallL: '#b3a285', wallR: '#94846a', roof: '#a98a4a', roofD: '#83692f' },
  barracks:   { wallL: '#8c8278', wallR: '#6e655c', roof: '#5c6a78', roofD: '#46525e', sign: '⚔' },
  archery:    { wallL: '#a08b62', wallR: '#82704d', roof: '#6f7d46', roofD: '#566234' },
  stable:     { wallL: '#a3845c', wallR: '#856a47', roof: '#8a6a3a', roofD: '#6a512b' },
  tower:      { wallL: '#9a948c', wallR: '#7b756d', roof: '#6b655d', roofD: '#504b44', crenel: true, flag: true },
};

function drawBuilding(c, b) {
  const st = BLD_STYLE[b.type];
  const a = ws(b.tx, b.ty), r = ws(b.tx + b.w, b.ty), btm = ws(b.tx + b.w, b.ty + b.h), l = ws(b.tx, b.ty + b.h);
  const done = b.done;
  const hgt = done ? b.def.height : Math.max(4, b.def.height * (b.prog / b.def.time));
  const team = TEAM[b.owner];

  // ground shadow / footprint
  c.fillStyle = 'rgba(0,0,0,0.22)';
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(r.x, r.y); c.lineTo(btm.x, btm.y); c.lineTo(l.x, l.y); c.closePath(); c.fill();

  if (G.sel.includes(b)) {
    c.strokeStyle = b.owner === 0 ? 'rgba(190,255,170,0.9)' : 'rgba(255,160,150,0.9)';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(r.x, r.y); c.lineTo(btm.x, btm.y); c.lineTo(l.x, l.y); c.closePath(); c.stroke();
  }

  if (b.type === 'farm' && done) {
    // a tilled wheat field with furrows, lying flat on the ground
    c.fillStyle = '#b59343';
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(r.x, r.y); c.lineTo(btm.x, btm.y); c.lineTo(l.x, l.y); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(110,85,35,0.8)'; c.lineWidth = 1.5;
    for (const t of [0.2, 0.4, 0.6, 0.8]) {
      const p1 = mid(a, l, t), p2 = mid(r, btm, t);
      c.beginPath(); c.moveTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.stroke();
    }
    c.fillStyle = 'rgba(235,210,130,0.55)';
    for (let i = 0; i < 7; i++) {
      const v1 = hash2(b.tx * 5 + i, b.ty), v2 = hash2(b.tx, b.ty * 7 + i);
      const p1 = mid(a, btm, 0.15 + v1 * 0.7), p2 = mid(l, r, 0.15 + v2 * 0.7);
      c.fillRect((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, 2, 3);
    }
    // corner posts
    c.fillStyle = '#6b5232';
    for (const p of [a, r, btm, l]) c.fillRect(p.x - 1, p.y - 6, 2.5, 6);
    return;
  }

  if (!done) {
    // construction: rising walls + scaffold poles
    isoFace(c, l, btm, hgt, '#6e5a3a');
    isoFace(c, btm, r, hgt, '#5a4930');
    c.strokeStyle = '#3a2d1a'; c.lineWidth = 2;
    for (const p of [a, r, btm, l]) {
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x, p.y - b.def.height - 6); c.stroke();
    }
    c.fillStyle = 'rgba(233,220,184,0.85)';
    c.font = '700 11px Cinzel, serif'; c.textAlign = 'center';
    c.fillText(Math.floor(b.prog / b.def.time * 100) + '%', btm.x, btm.y - b.def.height - 12);
    return;
  }

  // walls
  isoFace(c, l, btm, hgt, st.wallL);
  isoFace(c, btm, r, hgt, st.wallR);
  // timber framing on TC
  if (st.timber) {
    c.strokeStyle = 'rgba(60,40,20,0.55)'; c.lineWidth = 2;
    for (const t of [0.33, 0.66]) {
      const m1 = mid(l, btm, t), m2 = mid(btm, r, t);
      c.beginPath(); c.moveTo(m1.x, m1.y); c.lineTo(m1.x, m1.y - hgt); c.stroke();
      c.beginPath(); c.moveTo(m2.x, m2.y); c.lineTo(m2.x, m2.y - hgt); c.stroke();
    }
  }
  // door on the left-front face
  const dpos = mid(l, btm, 0.5);
  c.fillStyle = '#241a10';
  c.beginPath();
  c.moveTo(dpos.x - 5, dpos.y - 2); c.lineTo(dpos.x + 5, dpos.y + 1);
  c.lineTo(dpos.x + 5, dpos.y - 13);
  c.lineTo(dpos.x - 5, dpos.y - 16);
  c.closePath(); c.fill();

  // roof (pyramid) or crenellations (tower)
  const A = raise(a, hgt), R = raise(r, hgt), B = raise(btm, hgt), L = raise(l, hgt);
  if (st.crenel) {
    c.fillStyle = st.roof;
    c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(R.x, R.y); c.lineTo(B.x, B.y); c.lineTo(L.x, L.y); c.closePath(); c.fill();
    c.fillStyle = st.wallL;
    for (const t of [0.05, 0.45, 0.85]) {
      const m = mid(L, B, t); c.fillRect(m.x - 2, m.y - 7, 5, 7);
      const m2 = mid(B, R, t); c.fillRect(m2.x - 2, m2.y - 7, 5, 7);
    }
  } else {
    const peak = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 - (10 + b.def.height * 0.45) };
    c.fillStyle = st.roofD;
    c.beginPath(); c.moveTo(L.x, L.y); c.lineTo(B.x, B.y); c.lineTo(peak.x, peak.y); c.closePath(); c.fill();
    c.fillStyle = st.roof;
    c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(R.x, R.y); c.lineTo(peak.x, peak.y); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,240,200,0.18)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(B.x, B.y); c.lineTo(peak.x, peak.y); c.stroke();
  }
  // team banner
  if (st.flag) {
    const top = st.crenel ? { x: B.x, y: B.y - 6 } : { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 - (10 + b.def.height * 0.45) };
    c.strokeStyle = '#3a2d1a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(top.x, top.y); c.lineTo(top.x, top.y - 16); c.stroke();
    c.fillStyle = team.main;
    c.beginPath(); c.moveTo(top.x, top.y - 16); c.lineTo(top.x + 12, top.y - 13); c.lineTo(top.x, top.y - 10); c.closePath(); c.fill();
  }
  // sign glyph for barracks
  if (st.sign) {
    const m = mid(B, R, 0.5);
    c.fillStyle = '#e9dcb8'; c.font = '10px serif'; c.textAlign = 'center';
    c.fillText(st.sign, m.x, m.y - hgt / 2);
  }
}

/* ---------- units ---------- */
function drawFootman(c, u, team, stride, bob) {
  const t = u.type;
  // legs
  c.strokeStyle = '#3a2c1c'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-2, -7 + bob); c.lineTo(-2 + stride, 0); c.stroke();
  c.beginPath(); c.moveTo(2, -7 + bob); c.lineTo(2 - stride, 0); c.stroke();
  // torso
  const body = t === 'villager' ? '#8a6f4d' : (t === 'archer' ? team.dark : team.main);
  c.fillStyle = body;
  c.beginPath(); c.roundRect(-4, -15 + bob, 8, 9, 2); c.fill();
  if (t === 'villager') { c.fillStyle = team.main; c.fillRect(-4, -9 + bob, 8, 2); }
  // head
  c.fillStyle = '#e3b287';
  c.beginPath(); c.arc(0, -18 + bob, 3.2, 0, 7); c.fill();
  // headgear
  if (t === 'militia') { c.fillStyle = '#b9bec6'; c.beginPath(); c.arc(0, -19 + bob, 3.2, Math.PI, 0); c.fill(); }
  else if (t === 'spearman') { c.fillStyle = '#8e939b'; c.beginPath(); c.moveTo(-3, -19 + bob); c.lineTo(3, -19 + bob); c.lineTo(0, -24 + bob); c.closePath(); c.fill(); }
  else if (t === 'archer') { c.fillStyle = team.dark; c.beginPath(); c.arc(0, -19 + bob, 3.4, Math.PI * 0.9, Math.PI * 0.1); c.fill(); }
  else { c.fillStyle = '#6b5232'; c.fillRect(-3, -21.5 + bob, 6, 1.8); }
  // weapon / tool (swings while attacking or gathering)
  const sw = u.swingT > 0 ? Math.sin((1 - u.swingT / 0.3) * Math.PI) : 0;
  c.save();
  c.translate(4, -12 + bob);
  c.rotate(-0.5 + sw * 1.1);
  if (t === 'militia') {
    c.strokeStyle = '#d7dde4'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(9, -6); c.stroke();
    c.strokeStyle = '#6b5232'; c.beginPath(); c.moveTo(0, 0); c.lineTo(2.5, -1.6); c.stroke();
  } else if (t === 'spearman') {
    c.strokeStyle = '#6b5232'; c.lineWidth = 2; c.beginPath(); c.moveTo(-3, 4); c.lineTo(11, -9); c.stroke();
    c.fillStyle = '#c8ced6'; c.beginPath(); c.moveTo(11, -9); c.lineTo(14, -12.5); c.lineTo(12.8, -8); c.closePath(); c.fill();
  } else if (t === 'archer') {
    c.strokeStyle = '#6b5232'; c.lineWidth = 1.6;
    c.beginPath(); c.arc(4, -2, 7, -1.9, 1.0); c.stroke();
    c.strokeStyle = 'rgba(230,225,210,0.7)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(4 + Math.cos(-1.9) * 7, -2 + Math.sin(-1.9) * 7); c.lineTo(4 + Math.cos(1.0) * 7, -2 + Math.sin(1.0) * 7); c.stroke();
  } else { // villager tool
    c.strokeStyle = '#6b5232'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(7, -5); c.stroke();
    c.fillStyle = '#9aa1a9'; c.fillRect(5.6, -8.4, 4, 3);
  }
  c.restore();
  // shield for militia
  if (t === 'militia') {
    c.fillStyle = team.dark;
    c.beginPath(); c.arc(-4.5, -11 + bob, 3, 0, 7); c.fill();
    c.strokeStyle = '#caa84e'; c.lineWidth = 0.8; c.beginPath(); c.arc(-4.5, -11 + bob, 3, 0, 7); c.stroke();
  }
}
function drawHorseman(c, u, team, stride, bob) {
  const knight = u.type === 'knight';
  const horse = knight ? '#56575e' : '#7a5230';
  // legs
  c.strokeStyle = horse; c.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const lx = -7 + i * 4.6, ph = Math.sin(u.anim * 9 + i * 1.7) * (u.moving ? 3 : 0);
    c.beginPath(); c.moveTo(lx, -7); c.lineTo(lx + ph * 0.5, 0); c.stroke();
  }
  // body
  c.fillStyle = horse;
  c.beginPath(); c.ellipse(0, -9 + bob * 0.5, 10, 5, 0, 0, 7); c.fill();
  if (knight) { c.fillStyle = team.main; c.fillRect(-8, -11 + bob * 0.5, 16, 4); }
  // neck + head
  c.strokeStyle = horse; c.lineWidth = 4;
  c.beginPath(); c.moveTo(8, -11 + bob * 0.5); c.lineTo(12, -17 + bob * 0.5); c.stroke();
  c.fillStyle = horse;
  c.beginPath(); c.ellipse(13.5, -17.5 + bob * 0.5, 3.4, 2.2, 0.5, 0, 7); c.fill();
  // rider
  c.fillStyle = knight ? '#c8ced6' : team.main;
  c.beginPath(); c.roundRect(-4, -20 + bob * 0.5, 7, 9, 2); c.fill();
  c.fillStyle = knight ? '#aeb6bf' : '#e3b287';
  c.beginPath(); c.arc(-0.5, -22.5 + bob * 0.5, 3, 0, 7); c.fill();
  if (knight) { c.fillStyle = team.main; c.fillRect(-2.2, -27 + bob * 0.5, 1.6, 4); }
  // weapon
  const sw = u.swingT > 0 ? Math.sin((1 - u.swingT / 0.3) * Math.PI) : 0;
  c.save(); c.translate(3, -18 + bob * 0.5); c.rotate(-0.35 + sw * 0.9);
  c.strokeStyle = knight ? '#d7dde4' : '#c8ced6'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, 0); c.lineTo(knight ? 13 : 8, knight ? -4 : -5); c.stroke();
  c.restore();
}

function drawUnit(c, u) {
  const p = ws(u.x, u.y);
  const team = TEAM[u.owner];
  const sel = G.sel.includes(u);
  // shadow + selection ring
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath(); c.ellipse(p.x, p.y, u.def.cls === 'cav' ? 11 : 7, u.def.cls === 'cav' ? 5 : 3.5, 0, 0, 7); c.fill();
  if (sel) {
    c.strokeStyle = u.owner === 0 ? 'rgba(190,255,170,0.95)' : 'rgba(255,160,150,0.95)';
    c.lineWidth = 1.4;
    c.beginPath(); c.ellipse(p.x, p.y, u.def.cls === 'cav' ? 13 : 9, u.def.cls === 'cav' ? 6.5 : 4.5, 0, 0, 7); c.stroke();
  }
  const bob = u.moving ? -Math.abs(Math.sin(u.anim * 9)) * 1.6 : 0;
  const stride = u.moving ? Math.sin(u.anim * 9) * 3 : 0;
  c.save();
  c.translate(p.x, p.y);
  c.scale(u.dirX, 1);
  if (u.def.cls === 'cav') drawHorseman(c, u, team, stride, bob);
  else drawFootman(c, u, team, stride, bob);
  c.restore();
  // carried resource
  if (u.carry > 0.5) {
    c.fillStyle = u.carryType === 'gold' ? '#e2b73e' : u.carryType === 'wood' ? '#8a6238' : '#b8323d';
    c.fillRect(p.x - u.dirX * 6 - 1.5, p.y - 14, 3.5, 3.5);
  }
  // hp bar
  if (sel || u.hp < u.def.hp) {
    const w = 18, ratio = clamp(u.hp / u.def.hp, 0, 1);
    const y = p.y - (u.def.cls === 'cav' ? 32 : 28);
    c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 4);
    c.fillStyle = ratio > 0.6 ? '#6fbf4a' : ratio > 0.3 ? '#d4b13e' : '#cf4a3a';
    c.fillRect(p.x - w / 2, y, w * ratio, 2);
  }
}

/* ---------- HP bar for buildings ---------- */
function drawBuildingHP(c, b) {
  if (!G.sel.includes(b) && b.hp >= b.def.hp) return;
  const p = ws(b.cx, b.cy);
  const w = 34, ratio = clamp(b.hp / b.def.hp, 0, 1);
  const y = p.y - b.def.height - 22;
  c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 5);
  c.fillStyle = ratio > 0.6 ? '#6fbf4a' : ratio > 0.3 ? '#d4b13e' : '#cf4a3a';
  c.fillRect(p.x - w / 2, y, w * ratio, 3);
}

/* ---------- icon / portrait rendering for UI ---------- */
function drawPortraitInto(cv, key, owner) {
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  c.save();
  if (UNIT_DEFS[key]) {
    c.translate(cv.width / 2, cv.height * 0.86);
    const s = cv.width / 34;
    c.scale(s, s);
    const fake = { type: key, def: UNIT_DEFS[key], owner: owner || 0, moving: false, anim: 0, swingT: 0, dirX: 1, carry: 0, hp: 1 };
    const team = TEAM[fake.owner];
    if (fake.def.cls === 'cav') drawHorseman(c, fake, team, 0, 0);
    else drawFootman(c, fake, team, 0, 0);
  } else if (BUILD_DEFS[key]) {
    const d = BUILD_DEFS[key];
    // shape extents around the footprint center, in world-screen px
    const bottom = (d.w + d.h) / 2 * HH;
    const top = -(bottom + d.height * 1.5 + 30);
    const s = Math.min((cv.width - 4) / ((d.w + d.h) * HW), (cv.height - 4) / (bottom - top));
    c.translate(cv.width / 2, cv.height / 2);
    c.scale(s, s);
    c.translate(0, -(top + bottom) / 2);
    const fb = { type: key, def: d, tx: -d.w / 2, ty: -d.h / 2, w: d.w, h: d.h, cx: 0, cy: 0, done: true, prog: d.time, owner: owner || 0, queue: [] };
    drawBuilding(c, fb);
  }
  c.restore();
}
function glyphIcon(cv, glyph, color) {
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  c.fillStyle = color || '#e9dcb8';
  c.font = `${cv.width * 0.62}px serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(glyph, cv.width / 2, cv.height / 2 + 1);
}

/* ---------- topbar resource icons ---------- */
function drawResIcon(cv, type) {
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 20, 20);
  if (type === 'food') {
    c.fillStyle = '#9c4a32';
    c.beginPath(); c.ellipse(8, 11, 6, 4.5, -0.5, 0, 7); c.fill();
    c.strokeStyle = '#e9dcb8'; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(12, 8); c.lineTo(16.5, 4); c.stroke();
    c.fillStyle = '#e9dcb8'; c.beginPath(); c.arc(17, 3.5, 2, 0, 7); c.fill();
  } else if (type === 'wood') {
    c.fillStyle = '#8a6238'; c.beginPath(); c.roundRect(3, 8, 14, 5, 2); c.fill();
    c.fillStyle = '#c9a96f'; c.beginPath(); c.ellipse(3.5, 10.5, 2, 2.5, 0, 0, 7); c.fill();
    c.strokeStyle = '#8a6238'; c.lineWidth = 1; c.beginPath(); c.arc(3.5, 10.5, 1, 0, 7); c.stroke();
    c.fillStyle = '#75512c'; c.beginPath(); c.roundRect(6, 4, 12, 4.5, 2); c.fill();
  } else if (type === 'gold') {
    c.fillStyle = '#9a7320'; c.beginPath(); c.ellipse(10, 12, 6.5, 4, 0, 0, 7); c.fill();
    c.fillStyle = '#e2b73e'; c.beginPath(); c.ellipse(10, 10, 6.5, 4, 0, 0, 7); c.fill();
    c.fillStyle = '#f4d878'; c.beginPath(); c.ellipse(10, 9.4, 4.5, 2.6, 0, 0, 7); c.fill();
  } else { // pop
    c.fillStyle = '#e9dcb8';
    c.beginPath(); c.arc(6.5, 6, 3, 0, 7); c.fill();
    c.beginPath(); c.roundRect(3.5, 10, 6, 7, 2); c.fill();
    c.fillStyle = '#bfae87';
    c.beginPath(); c.arc(13.5, 7.5, 2.6, 0, 7); c.fill();
    c.beginPath(); c.roundRect(11, 11, 5.4, 6, 2); c.fill();
  }
}
