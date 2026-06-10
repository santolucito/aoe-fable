'use strict';
/* ====== HUD: resources, command card, selection panel, toasts ====== */

const $ = id => document.getElementById(id);
let cardButtons = []; // {el, cmd}
const CARD_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'k'];

function initUI() {
  drawResIcon($('ric-food'), 'food');
  drawResIcon($('ric-wood'), 'wood');
  drawResIcon($('ric-gold'), 'gold');
  drawResIcon($('ric-pop'), 'pop');
  $('btn-mute').addEventListener('click', () => {
    $('btn-mute').classList.toggle('off', toggleMute());
  });
  $('btn-speed').addEventListener('click', () => {
    G.speed = G.speed >= 2 ? 1 : G.speed + 0.5;
    $('btn-speed').textContent = G.speed.toFixed(1) + '×';
  });
  rebuildCard();
}

function refreshHUD() {
  const p = G.players[0];
  $('r-food').textContent = Math.floor(p.res.food);
  $('r-wood').textContent = Math.floor(p.res.wood);
  $('r-gold').textContent = Math.floor(p.res.gold);
  $('r-pop').textContent = `${p.pop}/${p.popCap}`;
  $('clock').textContent = fmtTime(G.time);
  $('agename').textContent = p.ageUp ? `Advancing…` : AGES[p.age];
  $('ageprog-fill').style.width = p.ageUp ? `${(1 - p.ageUp.left / p.ageUp.total) * 100}%` : '0%';
}

/* ---------- toasts ---------- */
function toast(msg, isErr) {
  const d = document.createElement('div');
  d.className = 'toast' + (isErr ? ' err' : '');
  d.textContent = msg;
  $('toasts').appendChild(d);
  setTimeout(() => d.remove(), 2800);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
}

/* ---------- tooltip ---------- */
function showTip(el, html) {
  const t = $('tooltip');
  t.innerHTML = html;
  t.classList.remove('hidden');
  const r = el.getBoundingClientRect();
  t.style.left = clamp(r.left + r.width / 2 - 110, 8, innerWidth - 270) + 'px';
  t.style.bottom = (innerHeight - r.top + 8) + 'px';
  t.style.top = 'auto';
}
function hideTip() { $('tooltip').classList.add('hidden'); }

/* ---------- command card ---------- */
function getCommands() {
  const sel = G.sel.filter(e => !e.dead);
  if (!sel.length || sel[0].owner !== 0) return [];
  const units = sel.filter(e => e.kind === 'unit');
  const cmds = [];
  if (units.length) {
    const hasVill = units.some(u => u.type === 'villager');
    const hasMil = units.some(u => u.def.aggro > 0);
    if (hasVill) {
      for (const bt of BUILD_MENU) {
        const def = BUILD_DEFS[bt];
        cmds.push({
          id: 'build:' + bt, icon: bt, label: def.name.split(' ')[0],
          tip: `<div class="tt-name">${def.name}</div><div class="tt-cost">${costText(def.cost)}</div>${def.desc || ''}` +
               (def.age > G.players[0].age ? `<div class="tt-bad">Requires ${AGES[def.age]}</div>` : ''),
          enabled: () => (def.age || 0) <= G.players[0].age && canAfford(0, def.cost),
          run: () => { G.placing = bt; G.attackArm = false; rebuildCard(); },
          armed: () => G.placing === bt,
        });
      }
    }
    if (hasMil || hasVill) cmds.push({
      id: 'amove', icon: '⚔', glyph: true, label: 'Attack',
      tip: `<div class="tt-name">Attack-Move (A)</div>March to a point, engaging every enemy on the way.`,
      enabled: () => true,
      run: () => { G.attackArm = !G.attackArm; G.placing = null; canvas.style.cursor = G.attackArm ? 'crosshair' : ''; rebuildCard(); },
      armed: () => G.attackArm,
    });
    cmds.push({
      id: 'stop', icon: '✋', glyph: true, label: 'Stop',
      tip: `<div class="tt-name">Stop (S)</div>Halt all orders.`,
      enabled: () => true,
      run: () => { for (const u of ownSelectedUnits()) orderStop(u); },
    });
    return cmds;
  }
  const b = sel[0];
  if (b.kind !== 'bld') return [];
  if (!b.done) return [];
  if (b.def.trains) {
    for (const ut of b.def.trains) {
      const def = UNIT_DEFS[ut];
      cmds.push({
        id: 'train:' + ut, icon: ut, label: def.name.split(' ')[0],
        tip: `<div class="tt-name">${def.name}</div><div class="tt-cost">${costText(def.cost)}</div>${def.desc || ''}` +
             (def.age > G.players[0].age ? `<div class="tt-bad">Requires ${AGES[def.age]}</div>` : ''),
        enabled: () => def.age <= G.players[0].age && canAfford(0, def.cost) && G.players[0].pop < G.players[0].popCap,
        run: () => { trainUnit(b, ut); refreshSelPanel(); },
      });
    }
  }
  if (b.type === 'towncenter' && G.players[0].age < AGES.length - 1) {
    const next = G.players[0].age + 1;
    cmds.push({
      id: 'ageup', icon: '⌛', glyph: true, label: AGES[next].split(' ')[0],
      tip: `<div class="tt-name">Advance to ${AGES[next]}</div><div class="tt-cost">${costText(AGE_COST[next])}</div>Unlocks new buildings and soldiers.`,
      enabled: () => !G.players[0].ageUp && canAfford(0, AGE_COST[next]),
      run: () => { if (startAgeUp(0)) rebuildCard(); },
    });
  }
  return cmds;
}

function rebuildCard() {
  const card = $('cmdcard');
  card.innerHTML = '';
  hideTip();
  cardButtons = [];
  const cmds = getCommands();
  cmds.forEach((cmd, i) => {
    const btn = document.createElement('button');
    btn.className = 'cmdbtn';
    const cv = document.createElement('canvas');
    cv.width = 38; cv.height = 38;
    if (cmd.glyph) glyphIcon(cv, cmd.icon, '#e9dcb8');
    else drawPortraitInto(cv, cmd.icon, 0);
    btn.appendChild(cv);
    const key = document.createElement('span');
    key.className = 'key'; key.textContent = CARD_KEYS[i] ? CARD_KEYS[i].toUpperCase() : '';
    btn.appendChild(key);
    const lb = document.createElement('span');
    lb.className = 'blabel'; lb.textContent = cmd.label;
    btn.appendChild(lb);
    btn.addEventListener('click', () => {
      if (!cmd.enabled()) { sfx('error'); return; }
      cmd.run();
    });
    btn.addEventListener('mouseenter', () => showTip(btn, cmd.tip));
    btn.addEventListener('mouseleave', hideTip);
    card.appendChild(btn);
    cardButtons.push({ el: btn, cmd });
  });
  refreshCardStates();
}
function refreshCardStates() {
  for (const { el, cmd } of cardButtons) {
    el.classList.toggle('disabled', !cmd.enabled());
    el.classList.toggle('armed', !!(cmd.armed && cmd.armed()));
  }
}
function cardHotkey(k) {
  const i = CARD_KEYS.indexOf(k);
  if (i < 0 || !cardButtons[i]) return false;
  const { cmd } = cardButtons[i];
  if (!cmd.enabled()) { sfx('error'); return true; }
  cmd.run();
  return true;
}

/* ---------- selection panel ---------- */
function hpBarHTML(hp, max) {
  const r = clamp(hp / max, 0, 1);
  const cl = r > 0.6 ? '' : r > 0.3 ? 'mid' : 'low';
  return `<div class="hpbar"><i class="${cl}" style="width:${r * 100}%"></i></div>`;
}

function refreshSelPanel() {
  const panel = $('selpanel');
  const sel = G.sel.filter(e => !e.dead);
  if (!sel.length) {
    panel.innerHTML = '<div class="sel-empty">No selection — left-click or drag to select.<br>Right-click to command.</div>';
    return;
  }
  if (sel.length > 1) {
    let html = `<div class="sel-name">${sel.length} units selected</div><div class="multigrid" id="mgrid"></div>`;
    panel.innerHTML = html;
    const grid = $('mgrid');
    sel.slice(0, 21).forEach(u => {
      const btn = document.createElement('button');
      const cv = document.createElement('canvas');
      cv.width = 34; cv.height = 34;
      drawPortraitInto(cv, u.type, u.owner);
      btn.appendChild(cv);
      const hb = document.createElement('span');
      hb.className = 'mh';
      hb.style.width = (clamp(u.hp / u.def.hp, 0, 1) * 30) + 'px';
      btn.appendChild(hb);
      btn.addEventListener('click', () => setSelection([u]));
      grid.appendChild(btn);
    });
    return;
  }
  const e = sel[0];
  const def = e.def;
  const ownCls = e.owner === 0 ? '' : 'enemy';
  const ownTxt = e.owner === 0 ? 'Your forces' : 'Enemy';
  let body = '';
  if (e.kind === 'unit') {
    body = `<div class="sel-stats">⚔ <b>${def.atk}</b> attack &nbsp; ➳ <b>${def.range > 1 ? def.range + ' range' : 'melee'}</b> &nbsp; ♞ <b>${def.speed}</b> speed</div>`;
    if (e.type === 'villager' && e.carry > 0.5)
      body += `<div class="sel-stats">Carrying <b>${Math.floor(e.carry)} ${e.carryType}</b></div>`;
  } else if (!e.done) {
    body = `<div class="sel-stats">Under construction — <b>${Math.floor(e.prog / def.time * 100)}%</b>` +
           ` &nbsp;<span style="color:#7d6d4e">(villagers right-click to help)</span></div>`;
  } else {
    if (def.farmPlot) body += `<div class="sel-stats">${farmWorker(e) ? 'A farmer works this field.' : '<span style="color:#d8a35a">Untended — right-click it with a villager.</span>'}</div>`;
    if (def.trains) body += `<div class="sel-stats" style="color:#7d6d4e">Right-click the map to set a rally point.</div>`;
    if (e.queue.length) {
      body += `<div class="queue" id="qrow"></div>`;
    }
  }
  panel.innerHTML = `
    <div class="sel-head">
      <canvas class="sel-port" id="selport" width="52" height="52"></canvas>
      <div>
        <div class="sel-name">${def.name}</div>
        <div class="sel-own ${ownCls}">${ownTxt}</div>
      </div>
    </div>
    ${hpBarHTML(e.hp, def.hp)}
    <div class="sel-stats"><b>${Math.ceil(e.hp)}</b> / ${def.hp} HP</div>
    ${body}`;
  drawPortraitInto($('selport'), e.type, e.owner);
  if (e.kind === 'bld' && e.done && e.queue.length) {
    const row = $('qrow');
    if (row) e.queue.forEach((q, i) => {
      const slot = document.createElement('button');
      slot.className = 'qslot';
      slot.title = 'Click to cancel';
      const cv = document.createElement('canvas');
      cv.width = 32; cv.height = 32;
      drawPortraitInto(cv, q.type, e.owner);
      slot.appendChild(cv);
      if (i === 0) {
        const pbar = document.createElement('span');
        pbar.className = 'qp';
        pbar.style.width = ((1 - q.left / UNIT_DEFS[q.type].time) * 100) + '%';
        slot.appendChild(pbar);
      }
      slot.addEventListener('click', () => { cancelQueued(e, i); refreshSelPanel(); });
      row.appendChild(slot);
    });
  }
}

function selectionChanged() {
  refreshSelPanel();
  rebuildCard();
}

/* ---------- end screen ---------- */
function showEnd(victory) {
  const el = $('endscreen');
  const h1 = $('end-title');
  h1.textContent = victory ? 'VICTORY' : 'DEFEAT';
  h1.classList.toggle('defeat', !victory);
  $('end-sub').textContent = victory
    ? `The enemy Town Center lies in ruins. Your name echoes through the ages. (${fmtTime(G.time)})`
    : 'Your Town Center has fallen. The chroniclers will be kind; the enemy was not.';
  el.classList.remove('hidden');
  sfx(victory ? 'win' : 'lose');
}
