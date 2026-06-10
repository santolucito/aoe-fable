'use strict';
/* ====== input: selection, commands, camera ====== */

const keys = {};
let mouseX = 0, mouseY = 0, mouseIn = false;
let dragStart = null;

const MOVE_OFFSETS = [[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9], [0.9, 0.9], [-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9],
  [1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8], [1.8, 0.9], [-1.8, 0.9], [1.8, -0.9], [-1.8, -0.9], [0.9, 1.8], [-0.9, 1.8], [0.9, -1.8]];

function setSelection(list) {
  G.sel = list;
  if (list.length && list[0].owner === 0) sfx('select');
  selectionChanged();
}

function ownSelectedUnits() { return G.sel.filter(e => e.kind === 'unit' && e.owner === 0 && !e.dead); }

function tryPlaceAt(wx, wy) {
  const def = BUILD_DEFS[G.placing];
  const tx = Math.round(wx - def.w / 2), ty = Math.round(wy - def.h / 2);
  if (!canPlace(G.placing, tx, ty, 0)) { toast('Cannot build there', true); sfx('error'); return; }
  if (!canAfford(0, def.cost)) { toast(`Requires ${costText(def.cost)}`, true); sfx('error'); return; }
  const b = placeBuilding(0, G.placing, tx, ty);
  if (!b) return;
  sfx('place');
  for (const u of ownSelectedUnits()) if (u.type === 'villager') orderBuild(u, b);
  if (!keys['Shift']) G.placing = null;
  rebuildCard();
}

function issueContextCommand(wx, wy) {
  const own = ownSelectedUnits();
  // building selected -> set rally point
  if (!own.length) {
    const b = G.sel[0];
    if (b && b.kind === 'bld' && b.owner === 0 && b.done && b.def.trains) {
      b.rally = { x: wx, y: wy };
      sfx('click');
    }
    return;
  }
  const ent = entAtPoint(wx, wy);
  const tx = Math.floor(wx), ty = Math.floor(wy);
  const tt = inMap(tx, ty) ? G.tiles[idx(tx, ty)] : TILE.GRASS;

  if (ent && ent.owner !== 0) {
    for (const u of own) orderAttack(u, ent);
    sfx('click');
    return;
  }
  if (ent && ent.kind === 'bld' && ent.owner === 0 && !ent.done) {
    let sent = false;
    for (const u of own) if (u.type === 'villager') { orderBuild(u, ent); sent = true; }
    if (sent) { sfx('click'); return; }
  }
  if (RES_TYPE[tt] && G.resAmt[idx(tx, ty)] > 0 && own.some(u => u.type === 'villager')) {
    for (const u of own) {
      if (u.type === 'villager') orderGather(u, tx, ty);
      else orderMove(u, wx, wy);
    }
    sfx('click');
    return;
  }
  // plain move with light formation spread
  let i = 0;
  for (const u of own) {
    const o = MOVE_OFFSETS[i % MOVE_OFFSETS.length]; i++;
    orderMove(u, wx + o[0], wy + o[1]);
  }
  sfx('click');
}

function issueAttackMove(wx, wy) {
  const own = ownSelectedUnits();
  let i = 0;
  for (const u of own) {
    const o = MOVE_OFFSETS[i % MOVE_OFFSETS.length]; i++;
    orderAMove(u, wx + o[0], wy + o[1]);
  }
  G.attackArm = false;
  canvas.style.cursor = '';
  rebuildCard();
  sfx('click');
}

function initInput() {
  canvas.addEventListener('mousedown', e => {
    if (!G.started || G.over) return;
    if (e.button === 0) {
      const w = screenToWorld(e.offsetX, e.offsetY);
      if (G.placing) { tryPlaceAt(w.x, w.y); return; }
      if (G.attackArm) { issueAttackMove(w.x, w.y); return; }
      dragStart = { x: e.offsetX, y: e.offsetY };
    }
  });
  canvas.addEventListener('mousemove', e => {
    mouseX = e.offsetX; mouseY = e.offsetY; mouseIn = true;
    const w = screenToWorld(e.offsetX, e.offsetY);
    G.hover.x = w.x; G.hover.y = w.y;
    if (dragStart) {
      const dx = Math.abs(e.offsetX - dragStart.x), dy = Math.abs(e.offsetY - dragStart.y);
      G.dragBox = (dx > 4 || dy > 4) ? {
        x0: Math.min(dragStart.x, e.offsetX), y0: Math.min(dragStart.y, e.offsetY),
        x1: Math.max(dragStart.x, e.offsetX), y1: Math.max(dragStart.y, e.offsetY),
      } : null;
    }
  });
  canvas.addEventListener('mouseleave', () => { mouseIn = false; dragStart = null; G.dragBox = null; });
  canvas.addEventListener('mouseup', e => {
    if (e.button !== 0 || !dragStart) return;
    const box = G.dragBox;
    dragStart = null; G.dragBox = null;
    if (!G.started || G.over) return;
    if (box) {
      const picked = [];
      for (const u of G.units) {
        if (u.dead || u.owner !== 0) continue;
        const p = worldToScreenPx(u.x, u.y);
        if (p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 - 14 && p.y <= box.y1 + 6) picked.push(u);
      }
      if (picked.length) {
        // prefer military if the box contains any
        const mil = picked.filter(u => u.type !== 'villager');
        setSelection(e.shiftKey ? [...new Set([...G.sel.filter(x => x.kind === 'unit'), ...picked])] : (mil.length && mil.length >= picked.length / 2 ? picked : picked));
      } else setSelection([]);
    } else {
      const w = screenToWorld(e.offsetX, e.offsetY);
      const ent = entAtPoint(w.x, w.y);
      if (ent) {
        if (e.shiftKey && ent.kind === 'unit' && ent.owner === 0) {
          const cur = G.sel.filter(x => x.kind === 'unit' && x.owner === 0);
          const i = cur.indexOf(ent);
          if (i >= 0) cur.splice(i, 1); else cur.push(ent);
          setSelection(cur);
        } else setSelection([ent]);
      } else setSelection([]);
    }
  });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!G.started || G.over) return;
    if (G.placing) { G.placing = null; rebuildCard(); return; }
    if (G.attackArm) { G.attackArm = false; canvas.style.cursor = ''; rebuildCard(); return; }
    const w = screenToWorld(e.offsetX, e.offsetY);
    issueContextCommand(w.x, w.y);
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const w0 = screenToWorld(e.offsetX, e.offsetY);
    G.zoom = clamp(G.zoom * (e.deltaY > 0 ? 0.88 : 1.14), 0.55, 1.7);
    // keep the point under the cursor fixed
    const p = ws(w0.x, w0.y);
    G.cam.x = p.x - e.offsetX / G.zoom;
    G.cam.y = p.y - e.offsetY / G.zoom;
    clampCamera();
  }, { passive: false });

  /* minimap navigation */
  let mmDrag = false;
  const mmGo = e => {
    const r = mmCanvas.getBoundingClientRect();
    const w = minimapToWorld((e.clientX - r.left) * (mmCanvas.width / r.width), (e.clientY - r.top) * (mmCanvas.height / r.height));
    return { x: clamp(w.x, 0, MAPW - 1), y: clamp(w.y, 0, MAPH - 1) };
  };
  mmCanvas.addEventListener('mousedown', e => {
    if (e.button === 0) { mmDrag = true; const w = mmGo(e); centerCamera(w.x, w.y); }
  });
  addEventListener('mousemove', e => { if (mmDrag) { const w = mmGo(e); centerCamera(w.x, w.y); } });
  addEventListener('mouseup', () => { mmDrag = false; });
  mmCanvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    if (!G.started || G.over) return;
    const w = mmGo(e);
    issueContextCommand(w.x, w.y);
  });

  /* keyboard */
  addEventListener('keydown', e => {
    keys[e.key] = true;
    if (!G.started || G.over) return;
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (G.placing) { G.placing = null; rebuildCard(); }
      else if (G.attackArm) { G.attackArm = false; canvas.style.cursor = ''; rebuildCard(); }
      else setSelection([]);
      return;
    }
    // control groups
    if (/^[1-5]$/.test(e.key)) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        G.groups[e.key] = ownSelectedUnits().map(u => u.id);
        toast(`Group ${e.key} set`);
      } else {
        const ids = G.groups[e.key];
        if (ids && ids.length) {
          const list = G.units.filter(u => !u.dead && ids.includes(u.id));
          if (list.length) { setSelection(list); centerCamera(list[0].x, list[0].y); }
        }
      }
      return;
    }
    if (k === 'h') {
      const tc = G.buildings.find(b => b.owner === 0 && b.type === 'towncenter' && !b.dead);
      if (tc) { centerCamera(tc.cx, tc.cy); setSelection([tc]); }
      return;
    }
    if (k === 's') { for (const u of ownSelectedUnits()) orderStop(u); return; }
    if (k === 'a' && ownSelectedUnits().some(u => u.def.aggro > 0 || u.type === 'villager')) {
      G.attackArm = true; canvas.style.cursor = 'crosshair'; rebuildCard();
      return;
    }
    // command-card hotkeys
    if (typeof cardHotkey === 'function' && cardHotkey(k)) e.preventDefault();
  });
  addEventListener('keyup', e => { keys[e.key] = false; });
}

/* camera pan — called every frame with real (unscaled) dt */
function panCamera(dt) {
  const sp = 620 * dt / G.zoom;
  let dx = 0, dy = 0;
  if (keys['ArrowLeft']) dx -= 1;
  if (keys['ArrowRight']) dx += 1;
  if (keys['ArrowUp']) dy -= 1;
  if (keys['ArrowDown']) dy += 1;
  // WASD pans only when nothing is selected (A = attack-move, S = stop, QWERTY = card hotkeys)
  if (!G.sel.length) {
    if (keys['a']) dx -= 1;
    if (keys['d']) dx += 1;
    if (keys['w']) dy -= 1;
    if (keys['s']) dy += 1;
  }
  if (mouseIn && !G.dragBox) {
    if (mouseX < 16) dx -= 1;
    if (mouseX > canvas.width - 16) dx += 1;
    if (mouseY < 16) dy -= 1;
    if (mouseY > canvas.height - 16) dy += 1;
  }
  if (dx || dy) {
    G.cam.x += dx * sp; G.cam.y += dy * sp;
    clampCamera();
    const w = screenToWorld(mouseX, mouseY);
    G.hover.x = w.x; G.hover.y = w.y;
  }
}
