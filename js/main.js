'use strict';
/* ====== bootstrap & game loop ====== */

function setupMatch() {
  genMap();
  const s0 = G.startPos[0], s1 = G.startPos[1];
  createBuilding(0, 'towncenter', s0.x - 1, s0.y - 1, true);
  createBuilding(1, 'towncenter', s1.x - 1, s1.y - 1, true);
  const offs = [[-3, 2], [3, -3], [3, 3], [-3, -3]];
  for (const [dx, dy] of offs) {
    createUnit(0, 'villager', s0.x + dx + 0.5, s0.y + dy + 0.5);
    createUnit(1, 'villager', s1.x + dx + 0.5, s1.y + dy + 0.5);
  }
  G.players[0].pop = 5; G.players[1].pop = 5;
  createUnit(0, 'scout', s0.x + 4.5, s0.y + 4.5);
  createUnit(1, 'villager', s1.x + 0.5, s1.y + 4.5);
  updateFog();
}

let lastTs = 0;
let fogT = 0, aggroT = 0, mmT = 0, uiT = 0, sepT = 0, endT = 0;

function checkEnd() {
  const enemyTC = G.buildings.some(b => b.owner === 1 && b.type === 'towncenter' && !b.dead);
  const myTC = G.buildings.some(b => b.owner === 0 && b.type === 'towncenter' && !b.dead);
  if (!enemyTC || !myTC) {
    G.over = true;
    showEnd(!enemyTC);
  }
}

function loop(ts) {
  const real = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  const dt = real * G.speed;

  if (G.started && !G.over) {
    G.time += dt;
    updateGame(dt);
    updateAI(dt);

    fogT -= dt; aggroT -= dt; sepT -= dt; endT -= dt;
    if (fogT <= 0) { fogT = 0.25; updateFog(); }
    if (aggroT <= 0) { aggroT = 0.3; aggroPass(); }
    if (sepT <= 0) { sepT = 0.15; separationPass(); }
    if (endT <= 0) { endT = 1; checkEnd(); }
  }
  if (G.started) {
    panCamera(real);
    mmT -= real; uiT -= real;
    if (mmT <= 0) { mmT = 0.25; renderMinimap(); }
    if (uiT <= 0) {
      uiT = 0.25;
      refreshHUD();
      refreshCardStates();
      if (G.sel.length) refreshSelPanel();
    }
  }
  render();
  requestAnimationFrame(loop);
}

function init() {
  setupMatch();
  initRender();
  initInput();
  initUI();
  centerCamera(G.startPos[0].x, G.startPos[0].y);
  renderMinimap();
  refreshHUD();

  document.getElementById('btn-start').addEventListener('click', () => {
    initAudio();
    document.getElementById('startscreen').classList.add('hidden');
    G.started = true;
    toast('Your villagers await orders. Gather food and wood!');
  });
  document.getElementById('btn-again').addEventListener('click', () => location.reload());

  lastTs = performance.now();
  requestAnimationFrame(loop);
}

window.addEventListener('DOMContentLoaded', init);
