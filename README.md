# Age of Fables

A medieval real-time strategy game in the spirit of **Age of Empires II**, running entirely
client-side in the browser. No server, no build step, no assets — every sprite, sound and
map is generated procedurally in vanilla JavaScript on a `<canvas>`.

## Run it

Open `index.html` in any modern browser (double-click works — no web server needed).

## How to play

Destroy the enemy **Town Center** before they destroy yours.

- **Economy** — villagers gather food (berries), wood (trees) and gold (mines), and haul
  them to the nearest drop-off: the Town Center takes everything, while the **Mill** (food),
  **Lumber Camp** (wood) and **Mining Camp** (gold) shorten walk times near resource lines.
  Houses raise your population cap. **Farms** are worked by one villager each and never
  run out — right-click a finished farm with a villager to put them to work (the villager
  who builds a farm starts farming it automatically).
- **Ages** — advance Dark → Feudal → Castle at the Town Center to unlock the Archery Range,
  Stable, Watch Tower, and stronger units (archers, scouts, knights).
- **War** — train militia and spearmen at the Barracks. The enemy AI booms, ages up, and
  attacks in escalating waves. Counter cavalry with spearmen; towers and the Town Center
  fire arrows at attackers on their own.

### Controls

| Input | Action |
|---|---|
| Left click / drag | Select unit(s) or building |
| Right click | Context command: move, gather, attack, build, set rally point |
| **A** + click | Attack-move |
| **S** | Stop |
| **Q W E R T Y U I** | Command-card hotkeys |
| **Esc** | Cancel placement / deselect |
| Arrows / WASD / screen edge | Pan camera (WASD only with nothing selected) |
| Mouse wheel | Zoom |
| **Ctrl + 1–5** / **1–5** | Set / recall control group |
| **H** | Jump to Town Center |

## Code layout

| File | Responsibility |
|---|---|
| `js/data.js` | Unit/building stats, ages, costs, shared game state `G` |
| `js/map.js` | Procedural map generation, A* pathfinding, fog of war |
| `js/sprites.js` | All procedural art: terrain, buildings, units, UI icons |
| `js/entities.js` | Unit state machines (gather/build/fight), combat, training |
| `js/ai.js` | Enemy AI: economy ratios, build orders, age-ups, attack waves |
| `js/render.js` | Isometric camera, depth-sorted scene, fog overlay, minimap |
| `js/input.js` | Selection, commands, hotkeys, camera controls |
| `js/ui.js` | HUD, command card, selection panel, tooltips, toasts |
| `js/sfx.js` | Procedural WebAudio sound effects |
| `js/main.js` | Bootstrap, fixed-cadence subsystem timers, win/lose check |
