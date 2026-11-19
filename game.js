/* ==========================================================================
   COMBAT FIGHTER vs ASTEROIDS - game.js
   - Player is a combat fighter jet (drawn in code, top-down view)
   - Weapons: cannons (Space), scanner (C), missiles (M), and area bombs (B)
   - Friendly tankers answer calls (T) to refuel and resupply the fighter
   - Dodge: barrel roll (Shift) makes the jet untouchable for a moment
   - Pilot levels: Beginner, Senior, Professional (unlocked by win streaks)
   - The jet turns to face any direction; some asteroids spit fireballs and charge
   - ENEMY FIGHTER JETS fly like yours: they turn, lead their shots, fire bursts,
     barrel-roll away from your bullets, launch homing missiles, and cloak/uncloak
   - Full screen / half screen button (and the F key)
   ========================================================================== */

(() => {
  'use strict';


  /* ========================================================================
     0. SELF-CHECK: add the page parts and styles the game needs, so the game
        still looks and works right if index.html or style.css is an older copy
     ======================================================================== */

  (function ensurePage() {
    if (!document.head) return;

    // Styles: side-by-side touch controls, full screen layout, clickable help tiles
    const css = document.createElement('style');
    css.id = 'game-extra-css';
    css.textContent = `
      /* Controls: arrow pad on the LEFT, action buttons on the RIGHT, always visible */
      .controls{display:flex!important;justify-content:space-between;align-items:center;flex-wrap:nowrap;gap:14px;padding:12px 8px 4px}
      .fire-btn.on,.fire-btn:active,.move-pad button.on{filter:brightness(1.3);transform:scale(.97)}
      .help-strip button{padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:#0a0e1b;display:flex;flex-direction:column;gap:5px;text-align:left;touch-action:none;user-select:none}
      .help-strip button:hover,.help-strip button.on{border-color:var(--cyan);background:#0f1730}

      /* Full screen: everything is resized to fit the screen so it is all visible */
      .app.is-full{max-width:none!important;width:100%;height:100vh;height:100dvh;margin:0;padding:8px;display:flex;flex-direction:column;gap:8px;background:#03040a;overflow:hidden}
      body.pseudo-full{overflow:hidden}
      body.pseudo-full .app{position:fixed;inset:0;z-index:9999}
      .app.is-full .topbar{margin:0}
      .app.is-full .game-shell{flex:1;min-height:0;display:flex;flex-direction:column}
      .app.is-full .canvas-wrap{flex:1;min-height:0}
      .app.is-full canvas{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;object-fit:contain}
      .app.is-full .help-strip,.app.is-full footer{display:none}
      .app.is-full .controls{padding:2px 6px}
      .app.is-full .hud{padding:8px 16px}
      @media(max-width:480px){.controls{gap:8px}}
    `;
    document.head.appendChild(css);

    // Full screen button in the top bar (if this page does not have one yet)
    if (!document.getElementById('screenBtn')) {
      const top = document.querySelector('.top-actions');
      if (top) {
        const b = document.createElement('button');
        b.id = 'screenBtn';
        b.type = 'button';
        b.className = 'icon-btn';
        b.textContent = '⛶ Full screen';
        top.insertBefore(b, top.firstChild);
      }
    }
  })();


  /* ========================================================================
     1. SETTINGS YOU CAN TWEAK (change these numbers to test or balance)
     ======================================================================== */

  const MAX_LEVEL = 5;            // sectors before the boss
  const SENIOR_WINS = 10;         // wins in a row (Beginner) to earn Senior
  const PRO_WINS = 15;            // wins in a row (Senior) to earn Professional
                                  // TIP: set both to 1 while testing the promotion prompts

  const ROLL_TIME = 0.5;          // seconds the barrel roll lasts (untouchable)
  const ROLL_COOLDOWN = 2.5;      // seconds before you can roll again
  const MAX_MISSILES = 9;         // most missiles you can carry
  const SCAN_COOLDOWN = 9;        // seconds before the scanner can be used again
  const SCAN_RANGE = 640;         // how far the radar reaches
  const SCAN_SWEEP = 1.6;         // seconds for the radar beam to go all the way round
  const SCAN_LIFE = 9;            // seconds the scan results stay on screen
  const TURN_SPEED = 14;          // how fast the jet turns, in radians per second (about 800 degrees)
  const MAX_FUEL = 100;
  const FUEL_DRAIN = 2.5;
  const MAX_BOMBS = 3;
  const BOMB_RADIUS = 440;
  const TANKER_COOLDOWN = 24;

  // The three pilot levels and how they change the game
  const DIFF = {
    beginner: {
      label: 'Beginner',
      rocks: 0.7,        // fewer rocks
      speed: 0.85,       // slower rocks
      lives: 5,
      missiles: 6,       // starting missiles
      drop: 0.22,        // chance a rock drops a power-up
      hazard: 0,         // no fast / explosive rocks
      bossFire: 1.3,     // boss shoots less often
      score: 1,          // score multiplier
      shooters: 0.35,    // share of big/medium rocks that spit fireballs
      fireEvery: 4.5,    // seconds between fireballs
      fireSpeed: 140,    // fireball speed
      lunge: 0.1,        // share of medium/small rocks that charge at the jet
      lungeSpeed: 170
    },
    senior: {
      label: 'Senior',
      rocks: 1,
      speed: 1,
      lives: 3,
      missiles: 5,
      drop: 0.18,
      hazard: 1,
      bossFire: 1,
      score: 1.5,
      shooters: 0.4,
      fireEvery: 3.2,
      fireSpeed: 180,
      lunge: 0.25,
      lungeSpeed: 240
    },
    professional: {
      label: 'Professional',
      rocks: 1.35,
      speed: 1.2,
      lives: 3,
      missiles: 4,
      drop: 0.14,
      hazard: 1.6,
      bossFire: 0.75,
      score: 2,
      shooters: 0.55,
      fireEvery: 2.4,
      fireSpeed: 210,
      lunge: 0.4,
      lungeSpeed: 300
    }
  };
  const PILOT_ORDER = ['beginner', 'senior', 'professional'];


  /* ========================================================================
     2. SETUP: canvas, HTML elements, controls
     ======================================================================== */

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  // All HTML elements the game needs (these IDs must exist in index.html)
  const ui = {
    overlay:   document.getElementById('overlay'),
    title:     document.getElementById('overlayTitle'),
    body:      document.getElementById('overlayText'),
    actions:   document.getElementById('menuActions'),
    hint:      document.getElementById('overlayHint'),
    level:     document.getElementById('levelLabel'),
    lives:     document.getElementById('livesLabel'),
    score:     document.getElementById('scoreLabel'),
    best:      document.getElementById('bestLabel'),
    status:    document.getElementById('statusLabel'),
    remaining: document.getElementById('remainingLabel'),
    toast:     document.getElementById('toast'),
    play:      document.getElementById('playBtn'),
    how:       document.getElementById('howBtn'),
    scores:    document.getElementById('scoresBtn'),
    settings:  document.getElementById('settingsBtn'),
    pause:     document.getElementById('pauseBtn'),
    sound:     document.getElementById('soundBtn'),
    screen:    document.getElementById('screenBtn')      // full screen / half screen button
  };

  // Which movement/fire controls are currently held down
  const keys = { left: false, right: false, up: false, down: false, fire: false };

  // Mouse position in game coordinates (used to aim the jet), and when it last moved
  const mouse = { x: 0, y: 0, t: -99999 };

  // Keyboard key -> control name (missile and dodge are handled on key press)
  const KEYMAP = {
    ArrowLeft: 'left',  KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up',      KeyW: 'up',
    ArrowDown: 'down',  KeyS: 'down',
    Space: 'fire'
  };


  /* ========================================================================
     3. SAVED DATA (safe: the game still works if the browser blocks storage)
     ======================================================================== */

  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) {
      return fallback;
    }
  }

  function store(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      // Saving is optional, so ignore errors
    }
  }

  // Pilot progress: win streak for each level and which levels are earned
  let progress = {
    streak: { beginner: 0, senior: 0, professional: 0 },
    unlocked: { senior: false, professional: false }
  };

  try {
    const saved = JSON.parse(load('cosmicProgress', 'null'));
    if (saved) {
      Object.assign(progress.streak, saved.streak);
      Object.assign(progress.unlocked, saved.unlocked);
    }
  } catch (e) {
    // Damaged data: keep the defaults
  }

  function saveProgress() {
    store('cosmicProgress', JSON.stringify(progress));
  }

  // Beginner is always open; the others must be earned
  function isUnlocked(key) {
    return key === 'beginner' || progress.unlocked[key] === true;
  }

  // The pilot level currently chosen (falls back to Beginner if invalid/locked)
  let difficulty = load('cosmicDifficulty', 'beginner');
  if (!DIFF[difficulty] || !isUnlocked(difficulty)) difficulty = 'beginner';


  /* ========================================================================
     4. GAME STATE: all the changing values of the game
     ======================================================================== */

  // state is one of: menu | playing | paused | levelup | won | lost
  let state = 'menu';
  let level = 1;
  let lives = 3;
  let score = 0;
  let best = Number(load('cosmicBest', 0));

  // Lists of everything on screen
  let rocks = [];
  let bullets = [];
  let missiles = [];
  let particles = [];
  let shockwaves = [];
  let powerups = [];
  let enemyShots = [];
  let jets = [];                  // enemy fighter jets
  let enemyMissiles = [];         // homing missiles fired by enemy jets
  let tanker = null;
  let stars = [];
  let scorePopups = [];

  // Single objects (they can be null when not present)
  let boss = null;
  let player = null;
  let scan = null;                // the radar scan in progress (or showing its results)
  let scanTargets = [];

  let soundOn = load('cosmicSound', 'on') !== 'off';

  // Timers and misc values
  let last = performance.now();   // time of previous frame
  let levelClock = 0;
  let toastClock = 0;             // how long the toast message stays visible
  let damageFlash = 0;            // red screen flash when hit
  let audio;                      // Web Audio context (created on first sound)

  // Create 150 background stars at random positions
  for (let i = 0; i < 150; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.7 + 0.25,   // size
      s: Math.random() * 25 + 8,       // fall speed
      a: Math.random() * 0.7 + 0.2     // brightness
    });
  }

  // Asteroid picture (if it fails to load, rocks are drawn as shapes instead)
  const asteroidImg = new Image();
  asteroidImg.src = 'assets/asteroid.png';


  /* ========================================================================
     5. HELPERS: sound, messages, HUD
     ======================================================================== */

  // Play a short beep. freq = pitch, dur = length in seconds
  function beep(freq = 440, dur = 0.07, type = 'sine') {
    if (!soundOn) return;

    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();

      const osc = audio.createOscillator();
      const gain = audio.createGain();

      osc.type = type;
      osc.frequency.value = freq;

      // Start quiet and fade out so the beep does not click
      gain.gain.setValueAtTime(0.035, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);

      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start();
      osc.stop(audio.currentTime + dur);
    } catch (e) {
      // Sound is optional, so ignore errors
    }
  }

  // Show a small message at the top of the screen
  function notify(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    toastClock = 1.8;
  }

  // Save the best score
  function saveBest() {
    if (score > best) {
      best = score;
      store('cosmicBest', String(best));
    }
  }

  // Refresh all the labels around the game (level, lives, score, status...)
  function updateHUD() {
    ui.level.textContent = `${Math.min(level, MAX_LEVEL)} / ${MAX_LEVEL}`;
    ui.lives.textContent = lives > 0 ? '♥ '.repeat(lives).trim() : '—';
    ui.score.textContent = String(score).padStart(6, '0');
    ui.best.textContent = String(best).padStart(6, '0');

    // During the boss fight show boss health, otherwise the rock count
    ui.remaining.textContent = boss
      ? `BOSS HULL: ${Math.max(0, Math.ceil(boss.hp))}% · ENEMY JETS: ${jets.length}`
      : `ASTEROIDS: ${rocks.length} · ENEMY JETS: ${jets.length}`;

    const names = {
      menu: 'READY',
      playing: 'IN FLIGHT',
      paused: 'PAUSED',
      levelup: 'SECTOR CLEAR',
      won: 'MISSION COMPLETE',
      lost: 'MISSION FAILED'
    };
    ui.status.textContent = (names[state] || state.toUpperCase()) +
      ' · ' + DIFF[difficulty].label.toUpperCase();

    ui.pause.textContent = state === 'paused' ? '▶ Resume' : 'Ⅱ Pause';
  }


  /* ========================================================================
     6. MENUS AND OVERLAYS
     ======================================================================== */

  // Show the overlay panel with a title, text and a list of buttons
  function showOverlay(title, body, buttons, hint = '') {
    ui.title.innerHTML = title;
    ui.body.textContent = body;
    ui.actions.innerHTML = '';

    // Create one HTML button for each entry in the list
    buttons.forEach(b => {
      const el = document.createElement('button');
      el.className = b.primary ? 'primary-btn' : 'secondary-btn';
      el.textContent = b.label;
      el.addEventListener('click', () => { el.blur(); b.action(); });
      ui.actions.appendChild(el);
    });

    ui.hint.textContent = hint;
    ui.overlay.style.display = '';          // make sure the panel is visible and clickable
    ui.overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    ui.overlay.classList.add('hidden');
    ui.overlay.style.display = 'none';      // a hidden panel must never block clicks on the game
  }

  // Main menu
  function showMenu() {
    state = 'menu';
    updateHUD();

    showOverlay(
      'COMBAT <span>FIGHTER</span>',
      'Fly your fighter jet through the asteroid field. Blast rocks with cannons and missiles, dodge with a barrel roll, and survive five sectors before the final boss.',
      [
        { label: '▶ Start mission', primary: true, action: startGame },
        { label: 'How to play', action: showHow },
        { label: 'High scores', action: showScores },
        { label: 'Pilot level: ' + DIFF[difficulty].label, action: showPilotLevels },
        { label: isFull() ? '🗗 Half screen' : '⛶ Full screen', action: () => { toggleFullscreen(); setTimeout(showMenu, 250); } }
      ],
      'Fly: WASD / arrows · Aim: mouse · Cannon: Space · Scan: C · Missile: M · Bomb: B · Tanker: T · Dodge: Shift'
    );
  }

  // Instructions screen
  function showHow() {
    showOverlay(
      'HOW TO <span>PLAY</span>',
      'Fly with WASD or the arrow keys and aim with the mouse. Hold Space to fire your faster, stronger cannons. Press B to drop a wide-area bomb that destroys nearby fighters and asteroids, clears incoming enemy fire, and damages the boss. Press T to call a friendly tanker, then fly close to its cyan refuel zone to refill fuel and resupply bombs and missiles. Fuel drains while you move; at critical fuel the tanker is called automatically. Scan with C, launch homing missiles with M, and barrel-roll with Shift. Destroy the asteroids and enemy fighters in each sector, collect power-ups, and defeat the boss.',
      [
        { label: 'Back to menu', primary: true, action: showMenu },
        { label: 'Start mission', action: startGame }
      ],
      'Win several missions in a row to earn higher pilot levels.'
    );
  }

  // High score list (top 5 runs, stored in this browser)
  function showScores() {
    let scores = [];

    try {
      scores = JSON.parse(load('cosmicScores', '[]'));
    } catch (e) {
      // If saved data is damaged, just show an empty list
    }

    const list = scores.length
      ? scores.map((x, i) => `${i + 1}. ${x.score} points (${x.mode || 'Beginner'}) — ${x.date}`).join('   ')
      : 'No completed runs yet. Your best score is ' + best + '.';

    showOverlay(
      'HIGH <span>SCORES</span>',
      list,
      [
        { label: 'Back to menu', primary: true, action: showMenu },
        { label: 'Start mission', action: startGame }
      ],
      'Scores are stored locally in this browser.'
    );
  }

  // Save the finished run into the top-5 high score list
  function recordRun() {
    saveBest();

    let arr = [];
    try {
      arr = JSON.parse(load('cosmicScores', '[]'));
    } catch (e) {
      // Ignore damaged data
    }

    arr.push({ score, mode: DIFF[difficulty].label, date: new Date().toLocaleDateString() });
    arr.sort((a, b) => b.score - a.score);
    store('cosmicScores', JSON.stringify(arr.slice(0, 5)));
  }


  /* ========================================================================
     7. PILOT LEVELS: choosing a level and earning promotions
     ======================================================================== */

  // Screen where the player picks Beginner / Senior / Professional at any time
  function showPilotLevels() {
    const buttons = PILOT_ORDER.map(key => {
      const locked = !isUnlocked(key);
      return {
        label: (key === difficulty ? '✔ ' : '') + DIFF[key].label + ' pilot' + (locked ? ' 🔒' : ''),
        primary: key === difficulty,
        action: () => choosePilot(key)
      };
    });
    buttons.push({ label: 'Back to menu', action: showMenu });

    showOverlay(
      'PILOT <span>LEVEL</span>',
      'Beginner: relaxed, 5 lives, a few slow fireballs. Senior: 3 lives, hazard rocks, fireball-spitting and charging rocks, score x1.5. Professional: fast and crowded, many attacking rocks, tough boss, score x2. ' +
      `Win streaks: Beginner ${progress.streak.beginner}/${SENIOR_WINS} · Senior ${progress.streak.senior}/${PRO_WINS}.`,
      buttons,
      `Win ${SENIOR_WINS} games in a row as Beginner to earn Senior, and ${PRO_WINS} in a row as Senior to earn Professional. You can always go back to an easier level.`
    );
  }

  // Pick a pilot level (locked levels cannot be chosen yet)
  function choosePilot(key) {
    if (!isUnlocked(key)) {
      notify(key === 'senior'
        ? `Win ${SENIOR_WINS} games in a row as Beginner to unlock Senior`
        : `Win ${PRO_WINS} games in a row as Senior to unlock Professional`);
      return;
    }

    difficulty = key;
    store('cosmicDifficulty', difficulty);
    showMenu();
    notify('Pilot level: ' + DIFF[key].label.toUpperCase());
  }

  // After a win: did the player earn the next pilot level? If yes, ask them.
  // Returns true when the promotion question is on screen.
  function tryPromotion() {
    let next = null;
    let needed = 0;

    if (difficulty === 'beginner' && !progress.unlocked.senior &&
        progress.streak.beginner >= SENIOR_WINS) {
      next = 'senior';
      needed = SENIOR_WINS;
    } else if (difficulty === 'senior' && !progress.unlocked.professional &&
               progress.streak.senior >= PRO_WINS) {
      next = 'professional';
      needed = PRO_WINS;
    }

    if (!next) return false;

    // The new level is earned for good, whatever the player answers
    progress.unlocked[next] = true;
    saveProgress();

    const nextName = DIFF[next].label;

    showOverlay(
      'PROMOTION <span>EARNED!</span>',
      `You have won ${needed} games in a row. You have earned ${nextName} Pilot mode. Do you want to try ${nextName} Pilot mode?`,
      [
        {
          label: `Yes, try ${nextName} Pilot`,
          primary: true,
          action: () => {              // accepted: switch and start right away
            difficulty = next;
            store('cosmicDifficulty', difficulty);
            startGame();
          }
        },
        {
          label: `No, stay ${DIFF[difficulty].label}`,
          action: () => showEndScreen(true)   // refused: keep playing this level
        }
      ],
      'You can change your pilot level at any time from the menu.'
    );

    return true;
  }


  /* ========================================================================
     8. STARTING THE GAME AND LEVELS
     ======================================================================== */

  // Create the player's fighter jet with starting values
  function newPlayer() {
    return {
      x: W * 0.5,
      y: H * 0.72,
      vx: 0, vy: 0,             // speed in x and y
      angle: -Math.PI / 2,      // direction the jet faces (starts pointing up)
      inv: 2,                   // invulnerable time after respawn (seconds)
      shield: 0,                // power-up timers
      rapid: 0,
      spread: 0,
      fireCD: 0,                // cooldown between cannon shots
      missiles: DIFF[difficulty].missiles,
      missileCD: 0,             // cooldown between missiles
      bombs: 2,
      fuel: MAX_FUEL,
      tankerCD: 0,
      roll: 0,                  // barrel roll time left (untouchable while > 0)
      rollCD: 0,                // barrel roll recharge time left
      scanCD: 0,                // scanner recharge time left
      lastDir: 1,               // last sideways direction (used by the roll)
      bank: 0,                  // how much the jet tilts sideways
      thrust: 0                 // engine flame strength
    };
  }

  // Start a brand new game from level 1 in the chosen pilot level
  function startGame() {
    level = 1;
    lives = DIFF[difficulty].lives;
    score = 0;
    rocks = [];
    bullets = [];
    missiles = [];
    particles = [];
    shockwaves = [];
    scanTargets = [];
    powerups = [];
    enemyShots = [];
    jets = [];
    enemyMissiles = [];
    tanker = null;
    boss = null;
    scan = null;
    scanTargets = [];
    player = newPlayer();

    beginLevel();
    state = 'playing';
    hideOverlay();
    beep(540, 0.15);
    updateHUD();
  }

  // Set up the current level: reset the jet and spawn the rocks
  function beginLevel() {
    rocks = [];
    bullets = [];
    missiles = [];
    enemyShots = [];
    jets = [];
    enemyMissiles = [];
    tanker = null;
    scanTargets = [];     // old radar locks must not carry into a new sector
    powerups = [];
    boss = null;
    scan = null;

    player.x = W * 0.5;
    player.y = H * 0.72;
    player.vx = player.vy = 0;
    player.inv = 2.3;

    // A new sector refills one missile
    if (level > 1) {
      player.missiles = Math.min(MAX_MISSILES, player.missiles + 1);
      player.bombs = Math.min(MAX_BOMBS, player.bombs + 1);
      player.fuel = MAX_FUEL;
    }

    // Number of big rocks depends on level and pilot level
    const count = (4 + level * 2) * DIFF[difficulty].rocks;
    for (let i = 0; i < Math.round(count); i++) spawnRock(3);

    // Make sure at least one rock is armed, so the player always sees rocks fighting back
    if (rocks.length && !rocks.some(r => r.shooter)) {
      rocks[0].shooter = true;
      rocks[0].shootT = DIFF[difficulty].fireEvery * 0.5;
    }

    // Enemy fighter jets: 1 in sectors 1-2, 2 in sectors 3-4, 3 in sector 5 (scaled by pilot level)
    const jetCount = Math.min(1 + Math.floor((level - 1) / 2), 3);
    const jetTotal = Math.min(4, Math.max(1, Math.round(jetCount * DIFF[difficulty].rocks)));
    for (let i = 0; i < jetTotal; i++) spawnJet();

    levelClock = 0;
    notify('SECTOR ' + level + ' · ENEMY FIGHTERS INBOUND!');
  }

  // After the last sector the boss appears
  function nextLevel() {
    if (level >= MAX_LEVEL) {
      boss = { x: W * 0.5, y: 125, r: 62, hp: 100, maxHp: 100, t: 0, fire: 1.4, vx: 95 };
      for (let i = 0; i < 2; i++) spawnJet();     // the boss brings two escort fighters
      notify('BOSS DETECTED — ESCORT FIGHTERS INBOUND!');
      return;
    }

    level++;
    beginLevel();
    updateHUD();
  }


  /* ========================================================================
     9. GAME OBJECTS: rocks, particles, power-ups
     ======================================================================== */

  // Create an asteroid. size: 3 = big, 2 = medium, 1 = small
  function spawnRock(size, x, y) {
    const d = DIFF[difficulty];

    // No position given: pick a random spot away from the player
    if (x == null) {
      let tries = 0;
      do {
        x = Math.random() * W;
        y = Math.random() * H;
        tries++;
      } while (player && Math.hypot(x - player.x, y - player.y) < 180 && tries < 60);
    }

    const angle = Math.random() * Math.PI * 2;

    // Smaller rocks are faster; higher levels and pilot levels are faster too
    const speed = (35 + Math.random() * 45) * (4 - size) * (1 + level * 0.13) * d.speed;

    // From level 3 some rocks are "fast", from level 4 some "explode" (not in Beginner)
    const fastChance = (level >= 3 ? 0.16 : 0) * d.hazard;
    const boomChance = (level >= 4 ? 0.09 : 0) * d.hazard;
    const roll = Math.random();

    rocks.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      r: { 3: 43, 2: 27, 1: 14 }[size],    // radius used for collisions
      rot: Math.random() * 6,
      spin: (Math.random() - 0.5) * 1.4,
      type: roll < fastChance ? 'fast'
          : roll < fastChance + boomChance ? 'explosive'
          : 'normal',

      // Rocks that fight back (from the first sector):
      // big and medium rocks may spit fireballs at the jet ...
      shooter: size >= 2 && Math.random() < d.shooters,
      shootT: d.fireEvery * (0.4 + Math.random() * 0.8),    // countdown to the next fireball

      // Some rocks cloak briefly, then drift exposed before hiding again.
      stealth: size >= 2 && level >= 2 && Math.random() < 0.3,
      hidden: false,
      hideT: 3 + Math.random() * 5,
      hiddenFor: 0,
      revealed: 0,

      // ... and medium and small rocks may charge at the jet
      lunge: size <= 2 && Math.random() < d.lunge,
      lungeT: 3 + Math.random() * 4,                        // countdown to the next charge
      lungeState: 'idle',                                   // idle -> warn -> charge -> idle
      lungeTimer: 0,
      baseSpeed: speed                                      // normal drifting speed
    });
  }

  // Create a burst of small particles (explosions, sparks)
  function burst(x, y, n, color = '#ff875a', speed = 150) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * speed;

      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.35 + Math.random() * 0.7,
        max: 0.8,
        size: Math.random() * 3 + 1,
        color
      });
    }
  }

  // Objects leaving one edge of the screen come back on the opposite side
  function wrap(o) {
    if (o.x < 0) o.x += W;
    if (o.x >= W) o.x -= W;
    if (o.y < 0) o.y += H;
    if (o.y >= H) o.y -= H;
  }

  // A chance that a destroyed rock drops a power-up
  function dropPower(x, y) {
    if (Math.random() < DIFF[difficulty].drop) {
      const types = ['shield', 'rapid', 'spread', 'life', 'ammo'];
      const type = types[Math.floor(Math.random() * types.length)];

      powerups.push({ x, y, type, life: 10, phase: Math.random() * 6 });
    }
  }

  // Give the player the effect of a collected power-up
  function activate(p) {
    if (p.type === 'shield') { player.shield = 6; notify('SHIELD ACTIVE — 6s'); }
    if (p.type === 'rapid')  { player.rapid = 8;  notify('RAPID FIRE — 8s'); }
    if (p.type === 'spread') { player.spread = 8; notify('SPREAD SHOT — 8s'); }

    if (p.type === 'ammo') {
      player.missiles = Math.min(MAX_MISSILES, player.missiles + 2);
      notify('+2 MISSILES');
    }

    if (p.type === 'life') {
      if (lives < 5) lives++;     // max 5 lives, otherwise give bonus points
      else score += 250;
      notify(lives < 5 ? 'EXTRA LIFE!' : 'BONUS +250');
    }

    beep(620, 0.18, 'sine');
  }


  /* ========================================================================
     10. WEAPONS AND DODGING
     ======================================================================== */

  // Twin cannons: one bullet from each wing, in the direction the jet faces
  function shoot() {
    if (player.fireCD > 0) return;   // still cooling down

    const fx = Math.cos(player.angle);        // forward direction
    const fy = Math.sin(player.angle);
    const rx = -fy;                           // sideways direction (towards the right wing)
    const ry = fx;

    [-11, 11].forEach(gunX => {
      bullets.push({
        x: player.x + fx * 14 + rx * gunX,
        y: player.y + fy * 14 + ry * gunX,
        vx: fx * 680 + player.vx * 0.25,
        vy: fy * 680 + player.vy * 0.25,
        life: 1.1
      });
    });

    // Spread shot adds two angled bullets from the nose
    if (player.spread > 0) {
      [-0.25, 0.25].forEach(off => {
        const a = player.angle + off;
        bullets.push({
          x: player.x + fx * 26,
          y: player.y + fy * 26,
          vx: Math.cos(a) * 680,
          vy: Math.sin(a) * 680,
          life: 1.1
        });
      });
    }

    // Rapid fire shortens the cooldown
    player.fireCD = player.rapid > 0 ? 0.07 : 0.12;
    beep(760, 0.035, 'square');
  }

  // Launch a homing missile (limited ammo, press M)
  function launchMissile() {
    if (state !== 'playing' || player.missileCD > 0) return;

    if (player.missiles <= 0) {
      notify('NO MISSILES LEFT');
      return;
    }

    const contactIndex = scanTargets.findIndex(t => !t.used && !t.rock.dead);
    const contact = contactIndex >= 0 ? scanTargets.splice(contactIndex, 1)[0] : null;
    player.missiles--;
    player.missileCD = 0.6;

    // Scanned contacts take priority; otherwise the missile follows the jet's facing.
    const angle = contact
      ? Math.atan2(contact.y - player.y, contact.x - player.x)
      : player.angle;
    missiles.push({
      x: player.x + Math.cos(angle) * 24,
      y: player.y + Math.sin(angle) * 24,
      vx: Math.cos(angle) * 140,
      vy: Math.sin(angle) * 140,
      speed: 140,       // missiles speed up as they fly
      life: 3.5,
      targetContact: contact
    });

    beep(300, 0.2, 'sawtooth');
  }

  function dropBomb() {
    if (state !== 'playing') return;
    if (player.bombs <= 0) {
      notify('NO BOMBS LEFT — RENDEZVOUS WITH A TANKER');
      return;
    }

    player.bombs--;
    player.inv = Math.max(player.inv, 0.6);
    burst(player.x, player.y, 100, '#fff0a0', 420);
    burst(player.x, player.y, 60, '#ff673d', 320);
    shockwaves.push({ x: player.x, y: player.y, life: 0.45, radius: BOMB_RADIUS });
    beep(75, 0.55, 'sawtooth');

    [...rocks].forEach(r => {
      if (!r.dead && Math.hypot(r.x - player.x, r.y - player.y) < BOMB_RADIUS + r.r) {
        r.dead = true;
        destroyRock(r);
      }
    });

    [...jets].forEach(j => {
      if (!j.dead && Math.hypot(j.x - player.x, j.y - player.y) < BOMB_RADIUS + j.r) {
        damageJet(j, j.hp);
      }
    });

    enemyShots.forEach(s => {
      if (Math.hypot(s.x - player.x, s.y - player.y) < BOMB_RADIUS) s.life = 0;
    });
    enemyMissiles.forEach(m => {
      if (Math.hypot(m.x - player.x, m.y - player.y) < BOMB_RADIUS) m.dead = true;
    });
    enemyShots = enemyShots.filter(s => s.life > 0);
    enemyMissiles = enemyMissiles.filter(m => !m.dead);

    if (boss && Math.hypot(boss.x - player.x, boss.y - player.y) < BOMB_RADIUS + boss.r) {
      damageBoss(38);
    }
    notify('BOMB RELEASED — WIDE AREA STRIKE!');
  }

  function callTanker() {
    if (state !== 'playing') return;
    if (tanker) {
      notify('TANKER ALREADY INBOUND — FLY INTO ITS REFUEL ZONE');
      return;
    }
    if (player.tankerCD > 0) {
      notify('TANKER REARMING — ' + Math.ceil(player.tankerCD) + 's');
      return;
    }

    const direction = player.x < W / 2 ? -1 : 1;
    tanker = {
      x: direction < 0 ? W + 50 : -50,
      y: Math.max(55, Math.min(H - 55, player.y)),
      vx: direction * 165,
      angle: direction < 0 ? Math.PI : 0,
      life: 12
    };
    player.tankerCD = TANKER_COOLDOWN;
    notify('TANKER INBOUND — RENDEZVOUS WITH THE CYAN AIRCRAFT');
    beep(620, 0.18, 'triangle');
  }

  function updateTanker(dt) {
    if (!tanker) return;

    tanker.x += tanker.vx * dt;
    tanker.life -= dt;
    if (Math.hypot(tanker.x - player.x, tanker.y - player.y) < 52) {
      player.fuel = MAX_FUEL;
      player.bombs = Math.min(MAX_BOMBS, player.bombs + 1);
      player.missiles = Math.min(MAX_MISSILES, player.missiles + 2);
      burst(tanker.x, tanker.y, 30, '#63f4e4', 190);
      tanker = null;
      notify('REFUELED · +1 BOMB · +2 MISSILES');
      beep(880, 0.25, 'triangle');
      return;
    }
    if (tanker.life <= 0 || tanker.x < -90 || tanker.x > W + 90) {
      tanker = null;
      notify('TANKER HAS PASSED — CALL AGAIN WHEN READY');
    }
  }

  // Reveal and lock nearby cloaked asteroids for a precision missile strike.
  function scanAsteroids() {
    if (state !== 'playing' || player.scanCD > 0) return;

    player.scanCD = SCAN_COOLDOWN;
    scan = { x: player.x, y: player.y, radius: 0, life: SCAN_SWEEP };

    const found = rocks.filter(r =>
      !r.dead && r.hidden && Math.hypot(r.x - player.x, r.y - player.y) <= SCAN_RANGE
    );

    found.forEach(r => {
      r.revealed = SCAN_LIFE;
      if (!scanTargets.some(t => t.rock === r)) {
        scanTargets.push({ rock: r, x: r.x, y: r.y, life: SCAN_LIFE, used: false });
      }
    });

    // Cloaked enemy jets are locked the same way
    jets.filter(j => !j.dead && j.hidden && Math.hypot(j.x - player.x, j.y - player.y) <= SCAN_RANGE).forEach(j => {
      j.revealed = SCAN_LIFE;
      if (!scanTargets.some(t => t.rock === j)) {
        scanTargets.push({ rock: j, x: j.x, y: j.y, life: SCAN_LIFE, used: false });
      }
      found.push(j);
    });

    if (found.length) {
      notify(found.length + ' HIDDEN CONTACT' + (found.length === 1 ? '' : 'S') + ' LOCKED — PRESS M');
      beep(680, 0.12, 'triangle');
    } else {
      notify('SCAN CLEAR — NO HIDDEN CONTACTS IN RANGE');
      beep(420, 0.09, 'sine');
    }
  }

  // Missile explosion: damages every rock close by and hurts the boss
  function explodeMissile(m) {
    burst(m.x, m.y, 34, '#ffd27a', 280);
    burst(m.x, m.y, 16, '#ff6a3d', 200);
    const blastRadius = m.targetContact ? 145 : 80;
    shockwaves.push({ x: m.x, y: m.y, life: 0.45, radius: blastRadius });
    beep(120, 0.3, 'sawtooth');

    // Copy the list because destroying rocks can add smaller rocks to it
    [...rocks].forEach(r => {
      if (!r.dead && Math.hypot(r.x - m.x, r.y - m.y) < blastRadius + r.r) {
        r.dead = true;
        destroyRock(r);
      }
    });

    // Jets take 2 hits of damage from a missile blast (cloaked ones too: that is the scanner payoff)
    jets.forEach(j => {
      if (!j.dead && Math.hypot(j.x - m.x, j.y - m.y) < blastRadius + j.r) damageJet(j, 2);
    });

    if (boss && Math.hypot(boss.x - m.x, boss.y - m.y) < 80 + boss.r) damageBoss(12);
  }

  // Barrel roll: a quick dash during which the jet cannot be hit
  function dodge() {
    if (state !== 'playing' || player.roll > 0 || player.rollCD > 0) return;

    // Dash the way the player is steering; with no keys pressed, dash sideways
    let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);

    if (!dx && !dy) {
      dx = Math.cos(player.angle + Math.PI / 2) * player.lastDir;
      dy = Math.sin(player.angle + Math.PI / 2) * player.lastDir;
    }

    const len = Math.hypot(dx, dy) || 1;

    player.roll = ROLL_TIME;
    player.rollCD = ROLL_COOLDOWN;
    player.vx = dx / len * 520;
    player.vy = dy / len * 520;

    burst(player.x, player.y, 10, '#bfefff', 120);
    beep(500, 0.15, 'triangle');
  }

  // Damage the boss. Returns true if this destroyed it (the player wins).
  function damageBoss(amount) {
    boss.hp -= amount;

    if (boss.hp <= 0) {
      score += Math.round(2000 * DIFF[difficulty].score);
      burst(boss.x, boss.y, 90, '#ff673d', 320);
      boss = null;
      finish(true);
      return true;
    }
    return false;
  }


  /* ========================================================================
     11. GAME EVENTS: destroying rocks, getting hit, ending, pausing
     ======================================================================== */

  // A rock was destroyed: add score, explode, split, maybe drop a power-up
  function destroyRock(r) {
    const base = { 3: 20, 2: 50, 1: 100 }[r.size] * (r.type === 'fast' ? 2 : 1);
    const points = Math.round(base * DIFF[difficulty].score);

    score += points;
    scorePopups.push({ x: r.x, y: r.y, text: '+' + points, life: 0.8 });

    burst(
      r.x, r.y,
      r.type === 'explosive' ? 28 : 14,
      r.type === 'explosive' ? '#ff4d37' : '#ff9860',
      r.type === 'explosive' ? 230 : 160
    );
    beep(170, 0.1, 'sawtooth');

    // Big and medium rocks split into two smaller ones
    if (r.size > 1) {
      spawnRock(r.size - 1, r.x + 5, r.y);
      spawnRock(r.size - 1, r.x - 5, r.y);
    }

    // Explosive rocks destroy nearby rocks and can hurt the player
    if (r.type === 'explosive') {
      [...rocks].forEach(o => {
        if (!o.dead && Math.hypot(o.x - r.x, o.y - r.y) < 85) {
          o.dead = true;
          destroyRock(o);        // neighbours now give score, split and can drop power-ups
        }
      });

      if (player && Math.hypot(player.x - r.x, player.y - r.y) < 75) hitPlayer();
    }

    dropPower(r.x, r.y);
  }

  // The player was hit: lose a life (unless shielded, rolling or just respawned)
  function hitPlayer() {
    if (player.inv > 0 || player.shield > 0 || player.roll > 0) return;

    lives--;
    player.inv = 2.1;
    damageFlash = 0.35;

    burst(player.x, player.y, 24, '#ff5b72', 230);
    beep(90, 0.3, 'sawtooth');

    if (lives <= 0) {
      finish(false);
      return;
    }

    // Respawn at the start position
    player.x = W * 0.5;
    player.y = H * 0.72;
    player.vx = player.vy = 0;
    notify('JET HIT — ' + lives + ' LIFE(S) LEFT');
  }

  // End the game: win = true (boss defeated) or false (no lives left)
  function finish(win) {
    state = win ? 'won' : 'lost';

    // A win adds to the streak in this pilot level; a loss resets it to zero
    progress.streak[difficulty] = win ? progress.streak[difficulty] + 1 : 0;
    saveProgress();

    recordRun();
    updateHUD();
    beep(win ? 980 : 65, 0.5, win ? 'sine' : 'sawtooth');

    // After a win, offer the next pilot level if it was just earned
    if (win && tryPromotion()) return;

    showEndScreen(win);
  }

  // The "mission complete" / "game over" panel
  function showEndScreen(win) {
    const name = DIFF[difficulty].label;
    const streak = progress.streak[difficulty];

    showOverlay(
      win ? 'MISSION <span>COMPLETE!</span>' : 'GAME <span>OVER</span>',
      win
        ? `You defeated the boss and survived all five sectors. Final score: ${score}.`
        : `Your jet was lost in sector ${level}. Final score: ${score}.`,
      [
        { label: 'Play again', primary: true, action: startGame },
        { label: 'Pilot level: ' + name, action: showPilotLevels },
        { label: 'Main menu', action: showMenu }
      ],
      `Best score: ${best} · ${name} win streak: ${streak} · Press R to retry`
    );
  }

  // Pause or resume the game
  function pauseToggle() {
    if (state === 'playing') {
      state = 'paused';

      showOverlay(
        'MISSION <span>PAUSED</span>',
        'Take a breath, pilot. Your mission is waiting.',
        [
          {
            label: '▶ Resume',
            primary: true,
            action: () => { state = 'playing'; hideOverlay(); updateHUD(); }
          },
          { label: 'Restart mission', action: startGame },
          { label: 'Main menu', action: showMenu }
        ],
        'Press P or Escape to resume'
      );
      updateHUD();

    } else if (state === 'paused') {
      state = 'playing';
      hideOverlay();
      updateHUD();
    }
  }


  /* ========================================================================
     11b. ENEMY FIGHTER JETS
          They use the same flight rules as the player's jet: they turn at a
          limited rate, fly with momentum, fire twin cannons forward, barrel-roll
          (untouchable) and carry homing missiles. They also cloak like the
          stealth asteroids, so use Scan (C) then Missile (M) to kill a cloaked one.
     ======================================================================== */

  // Visible (or revealed by the scanner) objects can be hit; cloaked ones cannot
  function isVisible(o) {
    return !o.hidden || o.revealed > 0;
  }

  // Shortest turning difference between two angles (-PI .. +PI)
  function angleDiff(to, from) {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function spawnJet() {
    const d = DIFF[difficulty];
    let x, y, tries = 0;
    do {
      x = Math.random() * W;
      y = Math.random() * H * 0.5;
      tries++;
    } while (player && Math.hypot(x - player.x, y - player.y) < 260 && tries < 40);

    // Share of jets that can dodge your bullets with a barrel roll, per pilot level
    const reflex = { beginner: 0.35, senior: 0.6, professional: 0.85 }[difficulty];
    const missiles = difficulty === 'beginner' ? false : level >= (difficulty === 'professional' ? 2 : 3);

    jets.push({
      x, y, vx: 0, vy: 0,
      angle: Math.PI / 2,               // starts facing down the screen
      r: 20,                            // collision radius
      hp: level >= 4 ? 3 : 2,
      maxHp: level >= 4 ? 3 : 2,
      fireCD: 1.8 + Math.random() * 1.2,
      burst: 0, burstCD: 0,
      strafe: Math.random() < 0.5 ? 1 : -1,
      strafeT: 1.5 + Math.random() * 2,
      cloak: level >= 2,                // jets cloak from sector 2 (like the stealth rocks)
      hidden: false,
      hideT: 4 + Math.random() * 4,
      hiddenFor: 0,
      revealed: 0,
      reflex: Math.random() < reflex,   // can this jet barrel-roll away from bullets?
      roll: 0, rollCD: 0, rollDir: 1,
      missile: missiles,
      missileCD: 5 + Math.random() * 4,
      flash: 0,                         // muzzle flash timer
      hit: 0,                           // hit flash timer
      dead: false
    });
  }

  // Damage a jet (cloaked/rolling jets are protected by the callers)
  function damageJet(j, amount) {
    j.hp -= amount;
    j.hit = 0.12;
    if (j.hp <= 0) killJet(j);
  }

  function killJet(j) {
    if (j.dead) return;
    j.dead = true;

    const pts = Math.round(150 * DIFF[difficulty].score);
    score += pts;
    scorePopups.push({ x: j.x, y: j.y, text: '+' + pts, life: 0.9 });

    burst(j.x, j.y, 44, '#ff8a4d', 270);
    burst(j.x, j.y, 16, '#ffffff', 150);
    shockwaves.push({ x: j.x, y: j.y, life: 0.45, radius: 60 });
    beep(110, 0.3, 'sawtooth');
    dropPower(j.x, j.y);
    dropPower(j.x, j.y);      // jets are valuable: two chances at a power-up
  }

  // A homing missile fired by an enemy jet
  function launchEnemyMissile(j) {
    enemyMissiles.push({
      x: j.x + Math.cos(j.angle) * 22,
      y: j.y + Math.sin(j.angle) * 22,
      vx: Math.cos(j.angle) * 150,
      vy: Math.sin(j.angle) * 150,
      speed: 150,
      life: 5,
      lost: false          // a missile that you barrel-rolled through stops homing
    });
    notify('⚠ MISSILE LAUNCH — SHOOT IT OR DODGE (SHIFT)!');
    beep(900, 0.25, 'square');
  }

  function updateJets(dt) {
    const cfg = DIFF[difficulty];

    jets.forEach(j => {
      if (j.dead) return;

      j.revealed = Math.max(0, j.revealed - dt);
      j.roll = Math.max(0, j.roll - dt);
      j.rollCD = Math.max(0, j.rollCD - dt);
      j.flash = Math.max(0, j.flash - dt);
      j.hit = Math.max(0, j.hit - dt);
      j.missileCD -= dt;

      // ---- Cloak and uncloak (it fires right after reappearing) ----
      if (j.cloak) {
        if (j.hidden) {
          j.hiddenFor -= dt;
          if (j.hiddenFor <= 0) {
            j.hidden = false;
            j.hideT = 4 + Math.random() * 4;
            j.fireCD = Math.min(j.fireCD, 0.4);
            burst(j.x, j.y, 14, '#9fe8ff', 100);
            beep(520, 0.08, 'triangle');
          }
        } else {
          j.hideT -= dt;
          if (j.hideT <= 0) {
            j.hidden = true;
            j.hiddenFor = 2 + Math.random() * 2;
            burst(j.x, j.y, 14, '#9fe8ff', 100);
          }
        }
      }

      // ---- Aim: turn towards where the player WILL be (lead the target) ----
      const dist = Math.hypot(player.x - j.x, player.y - j.y) || 1;
      const shotSpeed = cfg.fireSpeed * 1.25;
      const lead = Math.min(1.2, dist / shotSpeed);
      const want = Math.atan2(player.y + player.vy * lead - j.y, player.x + player.vx * lead - j.x);
      const diff = angleDiff(want, j.angle);
      const maxTurn = (2.6 + level * 0.15) * dt;        // slower than your jet, so you can out-turn it
      j.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));

      // ---- Fly like a fighter: close in, back off, strafe sideways ----
      j.strafeT -= dt;
      if (j.strafeT <= 0) {
        j.strafe *= -1;
        j.strafeT = 1.5 + Math.random() * 2.5;
      }
      const sp = (95 + level * 9) * cfg.speed;
      const fwd = dist > 360 ? 1 : dist < 220 ? -0.7 : 0;
      let tx = Math.cos(j.angle) * fwd * sp - Math.sin(j.angle) * j.strafe * sp * 0.6;
      let ty = Math.sin(j.angle) * fwd * sp + Math.cos(j.angle) * j.strafe * sp * 0.6;

      // ---- Defence: spot a bullet heading for the jet, then roll or sidestep ----
      if (!j.hidden && j.roll <= 0) {
        for (const b of bullets) {
          const bx = j.x - b.x, by = j.y - b.y;
          const closing = bx * b.vx + by * b.vy > 0;                 // bullet flying towards the jet
          if (closing && Math.hypot(bx, by) < 95) {
            if (j.reflex && j.rollCD <= 0) {
              // Barrel roll sideways: untouchable for a moment, just like your dodge
              j.roll = ROLL_TIME;
              j.rollCD = ROLL_COOLDOWN + 1.5;
              j.rollDir = Math.random() < 0.5 ? 1 : -1;
              j.vx = -b.vy / 560 * 480 * j.rollDir;
              j.vy = b.vx / 560 * 480 * j.rollDir;
              burst(j.x, j.y, 8, '#ffd0d8', 100);
            } else {
              tx += -b.vy * 0.45;
              ty += b.vx * 0.45;
            }
            break;
          }
        }
      }

      if (j.roll <= 0) {
        j.vx += (tx - j.vx) * Math.min(1, dt * 2.5);
        j.vy += (ty - j.vy) * Math.min(1, dt * 2.5);
      }
      j.x = Math.max(30, Math.min(W - 30, j.x + j.vx * dt));
      j.y = Math.max(30, Math.min(H - 30, j.y + j.vy * dt));

      // ---- Twin cannons: a short burst, only when the nose points at you ----
      j.fireCD -= dt;
      if (!j.hidden && j.burst <= 0 && j.fireCD <= 0 && Math.abs(diff) < 0.12 && dist < 560) {
        j.burst = 2;
        j.burstCD = 0;
      }
      if (j.burst > 0) {
        j.burstCD -= dt;
        if (j.burstCD <= 0) {
          const fx = Math.cos(j.angle), fy = Math.sin(j.angle);
          [-9, 9].forEach(o => enemyShots.push({
            x: j.x + fx * 16 - fy * o,
            y: j.y + fy * 16 + fx * o,
            vx: fx * shotSpeed,
            vy: fy * shotSpeed,
            life: 3,
            fire: true,        // can be shot down
            tracer: true       // drawn as a red streak
          }));
          j.flash = 0.06;
          beep(300, 0.05, 'square');
          j.burst--;
          j.burstCD = 0.11;
          if (j.burst <= 0) j.fireCD = cfg.fireEvery * (0.8 + Math.random() * 0.4);
        }
      }

      // ---- Homing missile (Senior and Professional) ----
      if (j.missile && !j.hidden && j.missileCD <= 0 && dist > 200 && dist < 640 && Math.abs(diff) < 0.5) {
        launchEnemyMissile(j);
        j.missileCD = 9 + Math.random() * 5;
      }

      // ---- Ramming the player (not while you roll, shield or just respawned) ----
      if (!j.hidden && j.roll <= 0 && dist < j.r + 14 &&
          player.inv <= 0 && player.shield <= 0 && player.roll <= 0) {
        hitPlayer();
        killJet(j);
      }
    });

    // ---- Your cannon bullets hit jets (not while cloaked or rolling) ----
    for (const b of bullets) {
      for (const j of jets) {
        if (b.dead || j.dead || !isVisible(j) || j.roll > 0) continue;
        if (Math.hypot(b.x - j.x, b.y - j.y) < j.r + 4) {
          b.dead = true;
          burst(b.x, b.y, 5, '#ffd27a', 90);
          damageJet(j, 2);
        }
      }
    }
    bullets = bullets.filter(b => !b.dead);
    jets = jets.filter(j => !j.dead);
  }

  function updateEnemyMissiles(dt) {
    enemyMissiles.forEach(m => {
      m.life -= dt;
      m.speed = Math.min(255, m.speed + 120 * dt);

      let ang = Math.atan2(m.vy, m.vx);
      if (!m.lost) {
        const want = Math.atan2(player.y - m.y, player.x - m.x);
        ang += Math.max(-1.8 * dt, Math.min(1.8 * dt, angleDiff(want, ang)));   // limited turn rate: it can be out-flown
      }
      m.vx = Math.cos(ang) * m.speed;
      m.vy = Math.sin(ang) * m.speed;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      particles.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 3, color: '#ff9a9a' });

      // Your cannons can shoot it down
      for (const b of bullets) {
        if (!b.dead && Math.hypot(b.x - m.x, b.y - m.y) < 11) {
          b.dead = true;
          m.dead = true;
          burst(m.x, m.y, 14, '#ffb347', 140);
          beep(200, 0.12, 'sawtooth');
        }
      }
      if (m.dead) return;

      // It reaches you
      if (Math.hypot(player.x - m.x, player.y - m.y) < 16) {
        if (player.roll > 0) {
          m.lost = true;                       // barrel roll: the missile flies straight through and loses its lock
          m.life = Math.min(m.life, 1.2);
        } else {
          m.dead = true;
          burst(m.x, m.y, 22, '#ff6a3d', 200);
          shockwaves.push({ x: m.x, y: m.y, life: 0.45, radius: 50 });
          beep(120, 0.25, 'sawtooth');
          hitPlayer();                         // a shield or respawn protection still absorbs it
        }
      }

      if (m.life <= 0 || m.x < -40 || m.x > W + 40 || m.y < -40 || m.y > H + 40) m.dead = true;
    });
    bullets = bullets.filter(b => !b.dead);
    enemyMissiles = enemyMissiles.filter(m => !m.dead);
  }

  // Draw an enemy fighter (same top-down jet shape as yours, in red and slightly smaller)
  function drawJet(j) {
    const cloaked = j.hidden && j.revealed <= 0;

    // Health pips above the jet (not drawn while it is cloaked)
    if (!cloaked) {
      ctx.save();
      for (let i = 0; i < j.maxHp; i++) {
        ctx.fillStyle = i < j.hp ? '#ff5277' : '#3a2230';
        ctx.fillRect(j.x - j.maxHp * 4 + i * 8, j.y - 38, 6, 3);
      }
      ctx.restore();
    }

    ctx.save();
    ctx.translate(j.x, j.y);
    ctx.rotate(j.angle + Math.PI / 2);
    ctx.scale(0.85, 0.85);
    ctx.globalAlpha = cloaked ? 0.07 : 1;

    // Barrel roll: squash sideways
    if (j.roll > 0) {
      const phase = (1 - j.roll / ROLL_TIME) * Math.PI * 2;
      ctx.scale(Math.max(0.12, Math.abs(Math.cos(phase))), 1);
    }

    // Afterburners
    const fl = 8 + Math.random() * 10;
    ctx.fillStyle = '#ff5a2e';
    [-5, 5].forEach(ex => {
      ctx.beginPath();
      ctx.moveTo(ex - 3, 29);
      ctx.lineTo(ex, 29 + fl);
      ctx.lineTo(ex + 3, 29);
      ctx.fill();
    });

    // Wing-tip missiles
    ctx.fillStyle = '#e8c8cf';
    ctx.fillRect(-29, 6, 3, 11);
    ctx.fillRect(26, 6, 3, 11);

    // Body (same outline as the player's jet)
    ctx.beginPath();
    [[0,-32],[3,-24],[4,-10],[6,-5],[27,12],[27,17],[8,12],[8,20],[15,25],[15,29],[7,27],[0,24],
     [-7,27],[-15,29],[-15,25],[-8,20],[-8,12],[-27,17],[-27,12],[-6,-5],[-4,-10],[-3,-24]]
      .forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fillStyle = j.hit > 0 ? '#ffffff' : '#7a3340';
    ctx.strokeStyle = '#ff5277';
    ctx.lineWidth = 1.8;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ff3b5c';
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Engines and cockpit
    ctx.fillStyle = '#2d1820';
    ctx.fillRect(-8, 12, 6, 15);
    ctx.fillRect(2, 12, 6, 15);
    ctx.beginPath();
    ctx.ellipse(0, -14, 3.2, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffb04d';
    ctx.fill();

    // Muzzle flash on both wings
    if (j.flash > 0) {
      ctx.fillStyle = '#fff1b8';
      ctx.beginPath(); ctx.arc(-9, -30, 5, 0, Math.PI * 2); ctx.arc(9, -30, 5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
  }

  function drawTanker(t) {
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(t.angle);
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#63f4e4';
    ctx.fillStyle = '#b9fff2';
    ctx.strokeStyle = '#63f4e4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    [[30, 0], [10, -5], [-13, -5], [-29, -13], [-25, 0], [-29, 13], [-13, 5], [10, 5]]
      .forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#176f75';
    ctx.fillRect(-18, -3, 32, 6);
    ctx.strokeStyle = '#b9fff2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(-42, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-44, 0, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#b9fff2';
    ctx.font = 'bold 10px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TANKER', 0, -21);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = '#63f4e4';
    ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 120) * 0.15;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x, t.y, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemyMissile(m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 2);

    ctx.fillStyle = '#ff9f43';
    ctx.beginPath();
    ctx.moveTo(-2, 7);
    ctx.lineTo(0, 14 + Math.random() * 4);
    ctx.lineTo(2, 7);
    ctx.fill();

    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff2d55';
    ctx.fillStyle = '#ffd0d8';
    ctx.fillRect(-2.5, -7, 5, 14);
    ctx.fillStyle = '#ff2d55';
    ctx.beginPath();
    ctx.moveTo(-2.5, -7);
    ctx.lineTo(0, -12);
    ctx.lineTo(2.5, -7);
    ctx.fill();
    ctx.restore();

    // Warning ring around a missile that is still tracking you
    if (!m.lost) {
      ctx.save();
      ctx.strokeStyle = Math.floor(performance.now() / 120) % 2 ? '#ff2d55' : '#ffb3c0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }


  /* ========================================================================
     12. UPDATE: runs every frame and moves everything (dt = seconds since last frame)
     ======================================================================== */

  function update(dt) {

    // ---- Things that always move, even in menus ----

    // Stars fall slowly and reappear at the top
    stars.forEach(s => {
      s.y += s.s * dt;
      if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
    });

    // Particles drift, slow down and fade away
    particles.forEach(p => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.life -= dt;
    });
    particles = particles.filter(p => p.life > 0);

    // Explosion rings and floating "+points" texts fade out
    shockwaves.forEach(s => { s.life -= dt; });
    shockwaves = shockwaves.filter(s => s.life > 0);
    if (scan) {
      scan.radius += SCAN_RANGE / SCAN_SWEEP * dt;
      scan.life -= dt;
      if (scan.life <= 0) scan = null;
    }
    scanTargets.forEach(t => {
      t.life -= dt;
      if (!t.rock.dead) { t.x = t.rock.x; t.y = t.rock.y; }
    });
    scanTargets = scanTargets.filter(t => t.life > 0 && !t.rock.dead);

    scorePopups.forEach(p => { p.y -= 28 * dt; p.life -= dt; });
    scorePopups = scorePopups.filter(p => p.life > 0);

    // Hide the toast message when its time is over
    if (toastClock > 0 && (toastClock -= dt) <= 0) ui.toast.classList.remove('show');

    // Red damage flash fades out
    damageFlash = Math.max(0, damageFlash - dt);

    // Everything below only runs while the game is being played
    if (state !== 'playing') return;

    levelClock += dt;

    // ---- Timers count down ----
    player.inv       = Math.max(0, player.inv - dt);
    player.shield    = Math.max(0, player.shield - dt);
    player.rapid     = Math.max(0, player.rapid - dt);
    player.spread    = Math.max(0, player.spread - dt);
    player.roll      = Math.max(0, player.roll - dt);
    player.rollCD    = Math.max(0, player.rollCD - dt);
    player.missileCD = Math.max(0, player.missileCD - dt);
    player.scanCD    = Math.max(0, player.scanCD - dt);
    player.tankerCD  = Math.max(0, player.tankerCD - dt);
    player.fireCD   -= dt;

    // ---- Player movement ----
    // Direction from keys: -1, 0 or 1 on each axis
    let ax = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    let ay = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);

    if (ax) player.lastDir = ax;                // remember for the barrel roll

    // Diagonal movement should not be faster
    if (ax && ay) { ax *= 0.707; ay *= 0.707; }

    if (ax || ay) {
      const previousFuel = player.fuel;
      player.fuel = Math.max(0, player.fuel - FUEL_DRAIN * dt);
      if (previousFuel > 0 && player.fuel === 0) notify('FUEL EMPTY — CALL OR RENDEZVOUS WITH A TANKER');
    }

    if (player.fuel <= 22 && player.tankerCD <= 0 && !tanker) callTanker();

    const fueled = player.fuel > 0;
    const accel = fueled ? 420 : 100;
    const max = player.roll > 0 ? 560 : fueled ? 390 : 130;

    player.vx += ax * accel * dt;
    player.vy += ay * accel * dt;

    // Friction slows the jet when no key is pressed (less friction while rolling)
    const drag = Math.pow(player.roll > 0 ? 0.94 : 0.86, dt * 60);
    player.vx *= drag;
    player.vy *= drag;

    // Limit the speed
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > max) {
      player.vx = player.vx / speed * max;
      player.vy = player.vy / speed * max;
    }

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Keep the jet inside the screen
    player.x = Math.max(28, Math.min(W - 28, player.x));
    player.y = Math.max(34, Math.min(H - 34, player.y));

    // Turning: the jet swings quickly to face ANY direction (a full 360 degrees).
    // It faces the mouse if the mouse moved recently, otherwise the way you are flying.
    let targetAngle = null;

    if (performance.now() - mouse.t < 2500) {
      targetAngle = Math.atan2(mouse.y - player.y, mouse.x - player.x);
    } else if (ax || ay) {
      targetAngle = Math.atan2(ay, ax);
    }

    if (targetAngle !== null) {
      // Shortest way round, between -180 and +180 degrees
      let diff = targetAngle - player.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;

      // Turn at most TURN_SPEED per second, so the swing is fast but still smooth
      const maxTurn = TURN_SPEED * dt;
      player.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    }

    // Engine flame gets longer when a movement key is pressed
    player.thrust = Math.min(1, Math.hypot(ax, ay));

    // Hold Space to shoot
    if (keys.fire) shoot();

    // ---- Cannon bullets ----
    bullets.forEach(b => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      wrap(b);
    });
    bullets = bullets.filter(b => b.life > 0 && !b.dead);

    // ---- Rocks fight back: spit fireballs and charge at the jet ----
    const cfg = DIFF[difficulty];

    rocks.forEach(r => {

      r.revealed = Math.max(0, r.revealed - dt);
      if (r.stealth) {
        if (r.hidden) {
          r.hiddenFor -= dt;
          if (r.hiddenFor <= 0) {
            r.hidden = false;
            r.hideT = 3 + Math.random() * 5;
            r.shootT = Math.min(r.shootT, 0.5);     // fires right after reappearing
            burst(r.x, r.y, 8, '#9fe8ff', 70);
          }
        } else {
          r.hideT -= dt;
          if (r.hideT <= 0) {
            r.hidden = true;
            r.hiddenFor = 2 + Math.random() * 2.5;
          }
        }
      }

      // Fire-spitting rocks: glow orange, then shoot a fireball at the jet
      if (r.shooter && isVisible(r)) {      // cloaked rocks cannot fire
        r.shootT -= dt;

        if (r.shootT <= 0) {
          const dx = player.x - r.x;
          const dy = player.y - r.y;
          const dist = Math.hypot(dx, dy) || 1;

          if (dist > 120) {   // no point-blank shots
            enemyShots.push({
              x: r.x, y: r.y,
              vx: dx / dist * cfg.fireSpeed,
              vy: dy / dist * cfg.fireSpeed,
              life: 4,
              fire: true      // a rock fireball (the boss uses plain red shots)
            });
            burst(r.x, r.y, 8, '#ffb347', 110);     // muzzle flash
            beep(220, 0.12, 'sawtooth');
          }
          r.shootT = cfg.fireEvery * (0.8 + Math.random() * 0.4);
        }
      }

      // Charging rocks: flash red as a warning, then dash straight at the jet
      if (r.lunge) {
        r.lungeT -= dt;

        if (r.lungeState === 'idle' && r.lungeT <= 0) {
          r.lungeState = 'warn';
          r.lungeTimer = 0.7;

        } else if (r.lungeState === 'warn') {
          r.lungeTimer -= dt;
          if (r.lungeTimer <= 0) {
            const dx = player.x - r.x;
            const dy = player.y - r.y;
            const dist = Math.hypot(dx, dy) || 1;
            r.vx = dx / dist * cfg.lungeSpeed;
            r.vy = dy / dist * cfg.lungeSpeed;
            r.lungeState = 'charge';
            r.lungeTimer = 1.1;
            beep(140, 0.2, 'sawtooth');
          }

        } else if (r.lungeState === 'charge') {
          r.lungeTimer -= dt;
          particles.push({ x: r.x, y: r.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 4, color: '#ff6a3d' });

          if (r.lungeTimer <= 0) {
            // Charge over: slow back down to normal drifting speed
            const sp = Math.hypot(r.vx, r.vy) || 1;
            r.vx = r.vx / sp * r.baseSpeed;
            r.vy = r.vy / sp * r.baseSpeed;
            r.lungeState = 'idle';
            r.lungeT = 4 + Math.random() * 4;
          }
        }
      }
    });

    // ---- Rocks move and spin ----
    rocks.forEach(r => {
      r.x += r.vx * dt;
      r.y += r.vy * dt;
      r.rot += r.spin * dt;
      wrap(r);
    });

    // ---- Enemy fighter jets and their missiles ----
    updateJets(dt);
    updateEnemyMissiles(dt);
    if (state !== 'playing') return;
    updateTanker(dt);
    if (state !== 'playing') return;

    // ---- Collision: cannon bullet hits rock ----
    for (const b of bullets) {
      for (const r of rocks) {
        if (!b.dead && !r.dead && isVisible(r) && Math.hypot(b.x - r.x, b.y - r.y) < r.r) {
          b.dead = r.dead = true;
          destroyRock(r);
        }
      }
    }
    // ---- Collision: cannon bullet shoots down a rock fireball ----
    for (const b of bullets) {
      for (const f of enemyShots) {
        if (!b.dead && f.fire && f.life > 0 && Math.hypot(b.x - f.x, b.y - f.y) < 12) {
          b.dead = true;
          f.life = 0;
          burst(f.x, f.y, 8, '#ffb347', 120);
        }
      }
    }
    bullets = bullets.filter(b => !b.dead);

    // ---- Homing missiles ----
    for (const m of missiles) {
      m.life -= dt;

      // Find the nearest target (a rock, or the boss if it is closer)
      let target = null;
      let bestDist = Infinity;

      rocks.forEach(r => {
        const d = Math.hypot(r.x - m.x, r.y - m.y);
        if (!r.dead && (!r.hidden || m.targetContact && m.targetContact.rock === r) && d < bestDist) {
          bestDist = d;
          target = r;
        }
      });
      jets.forEach(j => {
        const d = Math.hypot(j.x - m.x, j.y - m.y);
        if (!j.dead && (isVisible(j) || m.targetContact && m.targetContact.rock === j) && d < bestDist) {
          bestDist = d;
          target = j;
        }
      });
      if (m.targetContact && !m.targetContact.rock.dead) target = m.targetContact.rock;
      if (boss && !m.targetContact) {
        const d = Math.hypot(boss.x - m.x, boss.y - m.y);
        if (d < bestDist) { bestDist = d; target = boss; }
      }

      // Speed up, then turn gently towards the target
      m.speed = Math.min(420, m.speed + 380 * dt);
      let ang = Math.atan2(m.vy, m.vx);

      if (target) {
        const want = Math.atan2(target.y - m.y, target.x - m.x);
        let diff = want - ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ang += Math.max(-5 * dt, Math.min(5 * dt, diff));   // limited turn rate
      } else if (m.targetContact) {
        const want = Math.atan2(m.targetContact.y - m.y, m.targetContact.x - m.x);
        let diff = want - ang;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        ang += Math.max(-5 * dt, Math.min(5 * dt, diff));
      }

      m.vx = Math.cos(ang) * m.speed;
      m.vy = Math.sin(ang) * m.speed;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // Smoke trail behind the missile
      particles.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: 0.3, max: 0.3, size: 3, color: '#ffd9a0' });

      // Explode on touching a rock or the boss, or when time runs out / it leaves the screen
      let hit = m.life <= 0 || m.x < -40 || m.x > W + 40 || m.y < -40 || m.y > H + 40;
      for (const r of rocks) {
        if (!r.dead && (!r.hidden || m.targetContact && m.targetContact.rock === r) &&
          Math.hypot(r.x - m.x, r.y - m.y) < r.r + 6) hit = true;
      }
      for (const j of jets) {
        if (!j.dead && (isVisible(j) || m.targetContact && m.targetContact.rock === j) &&
          Math.hypot(j.x - m.x, j.y - m.y) < j.r + 8) hit = true;
      }
      if (boss && Math.hypot(boss.x - m.x, boss.y - m.y) < boss.r + 6) hit = true;

      if (hit) {
        m.dead = true;
        explodeMissile(m);
        if (state !== 'playing') return;   // the explosion ended the game (boss destroyed)
      }
    }
    missiles = missiles.filter(m => !m.dead);
    rocks = rocks.filter(r => !r.dead);

    // ---- Collision: rock hits the jet ----
    for (const r of rocks) {
      if (isVisible(r) && Math.hypot(player.x - r.x, player.y - r.y) < r.r + 12) hitPlayer();
    }
    if (state !== 'playing') return;

    // ---- Power-ups: float, expire after 10s, collected on touch ----
    powerups.forEach(p => {
      p.life -= dt;
      p.phase += dt * 3;

      if (Math.hypot(player.x - p.x, player.y - p.y) < 26) {
        p.dead = true;
        activate(p);
      }
    });
    powerups = powerups.filter(p => p.life > 0 && !p.dead);

    // ---- Boss fight ----
    if (boss) {
      boss.t += dt;

      // Boss moves sideways and bounces off the screen edges
      boss.x += boss.vx * dt;
      if (boss.x < boss.r + 20 || boss.x > W - boss.r - 20) boss.vx *= -1;

      // Boss fires 3 shots downward at regular intervals
      boss.fire -= dt;
      if (boss.fire <= 0) {
        for (let i = -1; i <= 1; i++) {
          enemyShots.push({ x: boss.x, y: boss.y + boss.r * 0.6, vx: i * 95, vy: 190, life: 4 });
        }
        boss.fire = Math.max(0.65, 1.4 - level * 0.08) * DIFF[difficulty].bossFire;
      }

      // Cannon bullets damage the boss (each bullet 0.5, double with rapid fire)
      for (const b of bullets) {
        if (!b.dead && Math.hypot(b.x - boss.x, b.y - boss.y) < boss.r) {
          b.dead = true;
          burst(b.x, b.y, 3, '#65f4e4', 60);

          if (damageBoss(player.rapid > 0 ? 1 : 0.5)) return;   // boss destroyed
        }
      }
      bullets = bullets.filter(b => !b.dead);

      // Touching the boss hurts the player
      if (boss && Math.hypot(player.x - boss.x, player.y - boss.y) < boss.r + 13) hitPlayer();
      if (state !== 'playing') return;
    }

    // ---- Boss shots move and can hit the jet ----
    enemyShots.forEach(b => {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      // Rock fireballs leave a fiery trail
      if (b.fire) particles.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, max: 0.25, size: 3, color: '#ff8a3d' });
    });
    enemyShots = enemyShots.filter(b => b.life > 0 && b.x > -30 && b.x < W + 30 && b.y > -30 && b.y < H + 30);

    for (const b of enemyShots) {
      if (Math.hypot(player.x - b.x, player.y - b.y) < 15) {
        b.life = 0;
        hitPlayer();
      }
    }
    if (state !== 'playing') return;

    // ---- Level complete: no rocks left (and no boss) ----
    if (!boss && rocks.length === 0 && jets.length === 0) {
      if (level < MAX_LEVEL) {
        state = 'levelup';
        updateHUD();

        showOverlay(
          'SECTOR <span>CLEARED</span>',
          `Sector ${level} cleared! Prepare for a more dangerous asteroid field.`,
          [
            {
              label: 'Next sector ▶',
              primary: true,
              action: () => { level++; beginLevel(); state = 'playing'; hideOverlay(); updateHUD(); }
            },
            { label: 'Main menu', action: showMenu }
          ],
          'Your score, lives and remaining weapons carry forward. Fuel is restored for the next sector.'
        );
        beep(990, 0.35, 'sine');

      } else {
        nextLevel();   // after the last sector the boss appears
      }
    }

    updateHUD();
  }


  /* ========================================================================
     13. DRAWING: the fighter jet, rocks, weapons and the whole scene
     ======================================================================== */

  // Draw the player's COMBAT FIGHTER (top-down view, nose pointing up).
  // Inspired by a twin-engine jet: swept wings, tail wings, two engines
  // with afterburners and a missile on each wing tip.
  function drawShip() {
    if (!player) return;

    ctx.save();
    ctx.translate(player.x, player.y);            // move to the jet position
    ctx.rotate(player.angle + Math.PI / 2);       // turn to face the flying direction

    // Barrel roll: squash the jet sideways so it looks like it is rolling
    if (player.roll > 0) {
      const phase = (1 - player.roll / ROLL_TIME) * Math.PI * 2;
      ctx.scale(Math.max(0.12, Math.abs(Math.cos(phase))), 1);
    }

    // Random value that makes the afterburner flames flicker
    const flicker = 0.7 + Math.random() * 0.6;
    const flameLen = 8 + 14 * player.thrust;

    // ---- Afterburner flames behind both engines ----
    [-5, 5].forEach(ex => {
      // Outer orange flame
      ctx.beginPath();
      ctx.moveTo(ex - 3, 29);
      ctx.lineTo(ex, 29 + flameLen * flicker);
      ctx.lineTo(ex + 3, 29);
      ctx.closePath();
      ctx.fillStyle = '#ff7b35';
      ctx.shadowBlur = 16;
      ctx.shadowColor = '#ff5a2e';
      ctx.fill();
      ctx.shadowBlur = 0;

      // Inner bright flame
      ctx.beginPath();
      ctx.moveTo(ex - 1.5, 29);
      ctx.lineTo(ex, 29 + flameLen * 0.55 * flicker);
      ctx.lineTo(ex + 1.5, 29);
      ctx.fillStyle = '#fff3a6';
      ctx.fill();
    });

    // ---- Missiles hanging on the wing tips ----
    ctx.fillStyle = '#e8ecff';
    ctx.fillRect(-29, 6, 3, 11);
    ctx.fillRect(26, 6, 3, 11);
    ctx.fillStyle = '#ff6a3d';
    ctx.fillRect(-29, 4, 3, 3);
    ctx.fillRect(26, 4, 3, 3);

    // ---- Body: nose, fuselage, swept wings and tail wings ----
    ctx.beginPath();
    ctx.moveTo(0, -32);      // nose
    ctx.lineTo(3, -24);      // right side of the nose
    ctx.lineTo(4, -10);      // right side of the fuselage
    ctx.lineTo(6, -5);       // where the right wing starts
    ctx.lineTo(27, 12);      // right wing tip (front)
    ctx.lineTo(27, 17);      // right wing tip (back)
    ctx.lineTo(8, 12);       // right wing back to the body
    ctx.lineTo(8, 20);       // body towards the tail
    ctx.lineTo(15, 25);      // right tail wing tip (front)
    ctx.lineTo(15, 29);      // right tail wing tip (back)
    ctx.lineTo(7, 27);       // right engine rear
    ctx.lineTo(0, 24);       // tail centre
    ctx.lineTo(-7, 27);      // left engine rear
    ctx.lineTo(-15, 29);     // left tail wing tip (back)
    ctx.lineTo(-15, 25);     // left tail wing tip (front)
    ctx.lineTo(-8, 20);      // body towards the tail (left)
    ctx.lineTo(-8, 12);      // left wing back to the body
    ctx.lineTo(-27, 17);     // left wing tip (back)
    ctx.lineTo(-27, 12);     // left wing tip (front)
    ctx.lineTo(-6, -5);      // where the left wing starts
    ctx.lineTo(-4, -10);     // left side of the fuselage
    ctx.lineTo(-3, -24);     // left side of the nose
    ctx.closePath();

    ctx.fillStyle = '#9fb3c8';
    ctx.strokeStyle = '#5cf4e3';
    ctx.lineWidth = 1.6;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#3ce9e0';
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ---- Twin engines (dark) with lighter nozzle rings ----
    ctx.fillStyle = '#3d4b5c';
    ctx.fillRect(-8, 12, 6, 15);
    ctx.fillRect(2, 12, 6, 15);
    ctx.fillStyle = '#c9d6e4';
    ctx.fillRect(-8, 26, 6, 3);
    ctx.fillRect(2, 26, 6, 3);

    // ---- Panel lines on the wings and the body ----
    ctx.strokeStyle = '#4c5f75';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(10, 2);
    ctx.lineTo(23, 13);
    ctx.moveTo(-10, 2);
    ctx.lineTo(-23, 13);
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 12);
    ctx.stroke();

    // ---- Cockpit canopy ----
    ctx.beginPath();
    ctx.ellipse(0, -14, 3.2, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#4fc3f7';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-1, -16, 1, 3.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d9f4ff';
    ctx.fill();

    // ---- Shield bubble (only while the shield power-up is active) ----
    if (player.shield > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, 34 + Math.sin(performance.now() * 0.012) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = '#63f4e4';
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // The fiery asteroid picture is prepared once: we cut out the rock (dropping the
  // white line at the top of the picture) and fade the edges to black, so that when
  // it is drawn with "lighter" blending the black background simply disappears.
  let rockSprite = null;

  function getRockSprite() {
    if (rockSprite) return rockSprite;
    if (!asteroidImg.complete || !asteroidImg.naturalWidth) return null;   // picture not loaded (yet)

    const iw = asteroidImg.naturalWidth;
    const ih = asteroidImg.naturalHeight;

    // Part of the picture to keep, as fractions of its size (centred on the rock)
    const sx = iw * 0.06, sy = ih * 0.26, sw = iw * 0.80, sh = ih * 0.66;

    const sprite = document.createElement('canvas');
    sprite.width = Math.round(sw);
    sprite.height = Math.round(sh);
    const g2 = sprite.getContext('2d');

    g2.drawImage(asteroidImg, sx, sy, sw, sh, 0, 0, sprite.width, sprite.height);

    // Soft oval fade: clear in the middle, black at the edges
    g2.save();
    g2.translate(sprite.width / 2, sprite.height / 2);
    g2.scale(1, sprite.height / sprite.width);
    const fade = g2.createRadialGradient(0, 0, sprite.width * 0.40, 0, 0, sprite.width * 0.50);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    g2.fillStyle = fade;
    g2.fillRect(-sprite.width, -sprite.width, sprite.width * 2, sprite.width * 2);
    g2.restore();

    rockSprite = sprite;
    return rockSprite;
  }

  // Draw one asteroid (the fiery picture, or a simple rocky shape if the picture is missing)
  function drawRock(r) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(r.rot);

    const concealAlpha = r.hidden && r.revealed <= 0 ? 0.1 : 1;
    const sprite = getRockSprite();

    if (sprite) {
      // Size the picture so the rock itself roughly matches the collision circle
      const dw = r.r * 2.7;
      const dh = dw * sprite.height / sprite.width;

      // "lighter" adds the picture's light to the scene, so black becomes see-through
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (r.type === 'fast' ? 0.85 : 1) * concealAlpha;
      ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = concealAlpha;

      // Fast rocks get a blue ring
      if (r.type === 'fast') {
        ctx.strokeStyle = '#5eeaff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r.r * 0.9, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Explosive rocks get a glowing red ring
      if (r.type === 'explosive') {
        ctx.strokeStyle = '#ff523c';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff321e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r.r * 1.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Attack warnings: fire-spitting rocks have an orange ring that brightens
      // just before they shoot; charging rocks flash red
      if (r.shooter) {
        const aboutToFire = r.shootT < 0.6;
        ctx.strokeStyle = aboutToFire ? '#ffd27a' : 'rgba(255,140,60,0.7)';
        ctx.lineWidth = aboutToFire ? 4 : 2;
        ctx.beginPath();
        ctx.arc(0, 0, r.r * 1.15, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (r.lunge && r.lungeState !== 'idle') {
        const flash = Math.floor(performance.now() / 90) % 2 === 0;
        ctx.strokeStyle = r.lungeState === 'warn' && flash ? '#ff2d55' : '#ff6b81';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, r.r * 1.3, 0, Math.PI * 2);
        ctx.stroke();
      }

    } else {
      // Backup: draw a bumpy 10-sided shape
      ctx.globalAlpha = concealAlpha;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = i * Math.PI / 5;
        const rr = r.r * (0.75 + Math.sin(i * 8 + r.rot) * 0.15);

        if (!i) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fillStyle = '#594c4c';
      ctx.fill();
      ctx.strokeStyle = r.type === 'fast' ? '#5eeaff' : r.type === 'explosive' ? '#ff523c' : '#ff784a';
      ctx.stroke();
    }

    ctx.restore();
  }

  // Draw one homing missile (white body, red nose, flame)
  function drawMissile(m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 2);   // point along the flight direction

    // Flame
    ctx.fillStyle = '#ff9f43';
    ctx.beginPath();
    ctx.moveTo(-2, 7);
    ctx.lineTo(0, 14 + Math.random() * 4);
    ctx.lineTo(2, 7);
    ctx.fill();

    // Body and nose
    ctx.fillStyle = '#f4f7ff';
    ctx.fillRect(-2.5, -7, 5, 14);
    ctx.fillStyle = '#ff4d37';
    ctx.beginPath();
    ctx.moveTo(-2.5, -7);
    ctx.lineTo(0, -12);
    ctx.lineTo(2.5, -7);
    ctx.fill();

    ctx.restore();
  }

  // Small weapon panel at the bottom of the screen: missiles, dodge, pilot level
  function drawWeaponsHUD() {
    if (!player || !['playing', 'paused'].includes(state)) return;

    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 12px Orbitron, sans-serif';

    // Weapons
    ctx.fillStyle = '#ffd27a';
    ctx.fillText('MISSILES ' + player.missiles + '  BOMBS ' + player.bombs, 14, H - 36);

    // Dodge recharge bar
    const ready = 1 - player.rollCD / ROLL_COOLDOWN;
    ctx.fillStyle = ready >= 1 ? '#63f4e4' : '#7f8fa8';
    ctx.fillText(ready >= 1 ? 'DODGE READY' : 'DODGE', 14, H - 16);
    ctx.strokeStyle = '#3d4b5c';
    ctx.strokeRect(124, H - 26, 90, 8);
    ctx.fillStyle = ready >= 1 ? '#63f4e4' : '#7f8fa8';
    ctx.fillRect(124, H - 26, 90 * ready, 8);

    const fuelRatio = player.fuel / MAX_FUEL;
    const fuelX = W / 2 - 78;
    ctx.textAlign = 'center';
    ctx.fillStyle = fuelRatio > 0.25 ? '#b9fff2' : '#ff7777';
    ctx.fillText('FUEL ' + Math.ceil(player.fuel) + '%', W / 2, H - 36);
    ctx.strokeStyle = '#3d4b5c';
    ctx.strokeRect(fuelX, H - 29, 156, 8);
    ctx.fillStyle = fuelRatio > 0.25 ? '#63f4e4' : '#ff5b62';
    ctx.fillRect(fuelX, H - 29, 156 * fuelRatio, 8);
    ctx.fillStyle = tanker ? '#63f4e4' : player.tankerCD <= 0 ? '#b9fff2' : '#7f8fa8';
    ctx.fillText(tanker ? 'TANKER INBOUND' : player.tankerCD <= 0 ? 'TANKER READY [T]' : 'TANKER ' + Math.ceil(player.tankerCD) + 's', W / 2, H - 12);

    // Scanner status
    ctx.textAlign = 'right';
    ctx.fillStyle = player.scanCD <= 0 ? '#63f4e4' : '#7f8fa8';
    ctx.fillText(player.scanCD <= 0 ? 'SCAN READY [C]' : 'SCAN ' + player.scanCD.toFixed(1) + 's', W - 14, H - 36);

    // Pilot level
    ctx.fillStyle = '#bfe9ff';
    ctx.fillText(DIFF[difficulty].label.toUpperCase() + ' PILOT', W - 14, H - 16);

    ctx.restore();
  }

  // Draw the whole scene, back to front
  function draw() {
    ctx.clearRect(0, 0, W, H);

    // ---- Background gradient ----
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#050816');
    bg.addColorStop(1, '#080411');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // ---- Stars ----
    stars.forEach(s => {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#c6e8ff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    });
    ctx.globalAlpha = 1;

    // ---- Faint grid lines ----
    ctx.strokeStyle = '#19294b';
    ctx.globalAlpha = 0.22;
    for (let x = 0; x < W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 80) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // ---- Rocks ----
    rocks.forEach(drawRock);
    jets.forEach(drawJet);
    if (tanker) drawTanker(tanker);
    enemyMissiles.forEach(drawEnemyMissile);

    // ---- Scanner sweep and locked coordinates ----
    if (scan) {
      ctx.globalAlpha = Math.max(0, scan.life / SCAN_SWEEP);
      ctx.strokeStyle = '#63f4e4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(scan.x, scan.y, scan.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    scanTargets.forEach(t => {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.strokeStyle = '#63f4e4';
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#63f4e4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.moveTo(-23, 0); ctx.lineTo(-11, 0);
      ctx.moveTo(11, 0); ctx.lineTo(23, 0);
      ctx.moveTo(0, -23); ctx.lineTo(0, -11);
      ctx.moveTo(0, 11); ctx.lineTo(0, 23);
      ctx.stroke();
      ctx.restore();
    });

    // ---- Cannon bullets (glowing tracers pointing along their flight) ----
    bullets.forEach(b => {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ffb347';
      ctx.fillStyle = '#fff1b8';
      ctx.fillRect(-1.5, -6, 3, 12);
      ctx.restore();
    });

    // ---- Homing missiles ----
    missiles.forEach(drawMissile);

    // ---- Boss shots (red glowing balls) ----
    enemyShots.forEach(b => {
      // Jet cannon tracers are red streaks
      if (b.tracer) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff3b5c';
        ctx.fillStyle = '#ff7a8f';
        ctx.fillRect(-1.5, -7, 3, 14);
        ctx.restore();
        return;
      }
      // Rock fireballs are orange and a bit bigger; boss shots are red
      const col = b.fire ? '#ffa94d' : '#ff5277';
      ctx.fillStyle = col;
      ctx.shadowBlur = 12;
      ctx.shadowColor = col;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.fire ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // ---- Power-ups (spinning square with a letter) ----
    powerups.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.phase);

      ctx.shadowBlur = 18;
      ctx.shadowColor = '#62f4e4';
      ctx.strokeStyle = p.type === 'life' ? '#ff6b91' : p.type === 'ammo' ? '#ffd27a' : '#63f4e4';
      ctx.lineWidth = 2;
      ctx.strokeRect(-10, -10, 20, 20);

      // Keep the letter upright while the square spins
      ctx.rotate(-p.phase);
      ctx.fillStyle = '#efffff';
      ctx.font = 'bold 14px Inter';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(({ shield: 'S', rapid: 'R', spread: '3', life: '+', ammo: 'M' })[p.type], 0, 0);

      ctx.restore();
    });

    // ---- Explosion particles ----
    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / (p.max || 0.8));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1;

    // ---- Missile explosion rings ----
    shockwaves.forEach(s => {
      const t = 1 - s.life / 0.45;
      ctx.globalAlpha = Math.max(0, s.life / 0.45);
      ctx.strokeStyle = '#ffd27a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 10 + t * (s.radius || 80), 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // ---- Floating "+points" texts ----
    scorePopups.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = '#fff1a8';
      ctx.font = 'bold 16px Orbitron';
      ctx.textAlign = 'left';
      ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;

    // ---- The fighter jet (blinks while invulnerable after being hit) ----
    if (player && ['playing', 'paused', 'levelup'].includes(state)) {
      if (player.inv <= 0 || Math.floor(player.inv * 12) % 2 === 0) drawShip();
    }

    // ---- Boss and its health bar ----
    if (boss) {
      ctx.save();
      ctx.translate(boss.x, boss.y);

      // Round body
      ctx.shadowBlur = 25;
      ctx.shadowColor = '#ff442f';
      ctx.fillStyle = '#48222c';
      ctx.strokeStyle = '#ff6b4d';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, boss.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 9 spikes around the body
      for (let i = 0; i < 9; i++) {
        const a = i * Math.PI * 2 / 9;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * boss.r * 0.65, Math.sin(a) * boss.r * 0.65);
        ctx.lineTo(Math.cos(a) * boss.r * 1.2, Math.sin(a) * boss.r * 1.2);
        ctx.stroke();
      }

      // Pulsing core
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffb15c';
      ctx.beginPath();
      ctx.arc(0, 0, 17 + Math.sin(boss.t * 6) * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Health bar at the top of the screen
      ctx.fillStyle = '#31141b';
      ctx.fillRect(W * 0.28, 22, W * 0.44, 10);
      ctx.fillStyle = '#ff594b';
      ctx.fillRect(W * 0.28, 22, W * 0.44 * Math.max(0, boss.hp / 100), 10);
      ctx.strokeStyle = '#ff9a83';
      ctx.strokeRect(W * 0.28, 22, W * 0.44, 10);

      ctx.fillStyle = '#ffb8ad';
      ctx.font = 'bold 10px Orbitron';
      ctx.textAlign = 'center';
      ctx.fillText('ASTEROID OVERLORD', W * 0.5, 16);
    }

    // ---- Weapon panel (missiles, dodge, pilot level) ----
    drawWeaponsHUD();

    // ---- Red flash when the player is hit ----
    if (damageFlash > 0) {
      ctx.fillStyle = `rgba(255,40,70,${damageFlash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }
  }


  /* ========================================================================
     14. MAIN LOOP: update + draw, about 60 times per second
     ======================================================================== */

  function loop(now) {
    // Time since the last frame in seconds (capped so lag does not break physics)
    const dt = Math.min((now - last) / 1000, 0.04);
    last = now;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }


  /* ========================================================================
     15. INPUT: keyboard, touch buttons and menu buttons
     ======================================================================== */

  // Key pressed
  window.addEventListener('keydown', e => {
    if (KEYMAP[e.code]) {
      keys[KEYMAP[e.code]] = true;
      e.preventDefault();   // stop arrows/space from scrolling the page
    }

    // Weapon and support actions fire once per key press
    if (!e.repeat) {
      if (e.code === 'KeyM' || e.code === 'KeyX') launchMissile();
      if (e.code === 'KeyC') scanAsteroids();
      if (e.code === 'KeyB') dropBomb();
      if (e.code === 'KeyT') callTanker();
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyZ') dodge();
    }

    // P or Escape pauses (Escape also leaves the fallback full screen)
    if (e.code === 'Escape' && document.body.classList.contains('pseudo-full')) toggleFullscreen();
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'playing' || state === 'paused') pauseToggle();
    }

    // R restarts
    if (e.code === 'KeyR' && ['lost', 'won', 'playing', 'paused'].includes(state)) startGame();

    // Enter starts from the menu
    if (e.code === 'Enter' && state === 'menu') startGame();

    // F switches between full screen and half screen
    if (e.code === 'KeyF' && !e.repeat) toggleFullscreen();
  });

  // Mouse: moving it over the game makes the jet aim at the pointer.
  // We convert the pointer position to game coordinates (this also works when the
  // game is letterboxed in full screen).
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;

    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const offX = (rect.width - W * scale) / 2;
    const offY = (rect.height - H * scale) / 2;

    mouse.x = (e.clientX - rect.left - offX) / scale;
    mouse.y = (e.clientY - rect.top - offY) / scale;
    mouse.t = performance.now();
  });

  // Key released
  window.addEventListener('keyup', e => {
    if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false;
    if (e.code === 'Space') e.preventDefault();
  });

  // Switching to another window releases all keys and pauses the game
  window.addEventListener('blur', () => {
    Object.keys(keys).forEach(k => keys[k] = false);
    if (state === 'playing') pauseToggle();
  });

  // Make any button work like a game control: it reacts instantly on touch or mouse,
  // keeps working if the finger slides off it, and ignores scrolling/zooming gestures.
  function holdButton(btn, onDown, onUp) {
    btn.style.touchAction = 'none';              // stop the browser stealing the touch to scroll
    btn.style.userSelect = 'none';
    btn.style.webkitUserSelect = 'none';
    btn.addEventListener('contextmenu', e => e.preventDefault());

    const press = e => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* not supported: ignore */ }
      btn.classList.add('on');
      onDown();
    };

    const release = () => {
      btn.classList.remove('on');
      onUp();
      btn.blur();                                // so pressing Space later does not re-click it
    };

    btn.addEventListener('pointerdown', press);
    ['pointerup', 'pointercancel', 'lostpointercapture', 'pointerleave'].forEach(t => {
      btn.addEventListener(t, release);
    });
  }

  // On-screen movement buttons (buttons with a data-k attribute)
  document.querySelectorAll('[data-k]').forEach(btn => {
    const k = btn.dataset.k;
    holdButton(btn, () => { keys[k] = true; }, () => { keys[k] = false; });
  });

  // On-screen cannon (fire) button: fires while held
  const fireTouch = document.getElementById('fireTouch');
  holdButton(fireTouch, () => { keys.fire = true; }, () => { keys.fire = false; });

  // Extra touch buttons, created here so index.html needs no change
  function addTouchButton(id, label, action) {
    const btn = document.createElement('button');
    btn.id = id;
    btn.type = 'button';
    btn.textContent = label;
    btn.className = fireTouch.className + ' extra';   // same look as the fire button, a bit smaller
    (fireTouch.parentNode || document.body).appendChild(btn);

    holdButton(btn, action, () => {});           // one action per tap
  }

  addTouchButton('missileTouch', '🚀 Missile', launchMissile);
  addTouchButton('bombTouch', '💣 Bomb [B]', dropBomb);
  addTouchButton('tankerTouch', '⛽ Tanker [T]', callTanker);
  addTouchButton('scanTouch', '◎ Scan [C]', scanAsteroids);
  addTouchButton('dodgeTouch', '↻ Dodge', dodge);
  addTouchButton('restartTouch', '↺ Restart', () => { if (state !== 'menu') startGame(); });

  // The four tiles under the game (SHOOT, PAUSE, RESTART) are real buttons too
  const helpFire = document.getElementById('helpFire');
  const helpPause = document.getElementById('helpPause');
  const helpRestart = document.getElementById('helpRestart');

  if (helpFire) holdButton(helpFire, () => { keys.fire = true; }, () => { keys.fire = false; });
  if (helpPause) holdButton(helpPause, () => { if (state === 'playing' || state === 'paused') pauseToggle(); }, () => {});
  if (helpRestart) holdButton(helpRestart, () => { startGame(); }, () => {});

  // Never let the small message bubble block clicks
  ui.toast.style.pointerEvents = 'none';

  // Normal buttons lose focus after a click, so the Space bar keeps meaning "fire"
  document.querySelectorAll('button').forEach(b => b.addEventListener('click', () => b.blur()));

  // Buttons around the game
  ui.play.addEventListener('click', startGame);
  ui.how.addEventListener('click', showHow);
  ui.scores.addEventListener('click', showScores);
  ui.settings.addEventListener('click', showPilotLevels);

  ui.pause.addEventListener('click', () => {
    if (state === 'playing' || state === 'paused') pauseToggle();
    else showMenu();
  });

  ui.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    store('cosmicSound', soundOn ? 'on' : 'off');
    ui.sound.textContent = soundOn ? '🔊 Sound' : '🔇 Muted';
    if (soundOn) beep(600, 0.07);
  });

  ui.sound.textContent = soundOn ? '🔊 Sound' : '🔇 Muted';


  /* ========================================================================
     16. FULL SCREEN / HALF SCREEN
     ======================================================================== */

  const appEl = document.querySelector('.app');

  // Are we in full screen? (the real browser full screen, or the fallback used on phones)
  function isFull() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement ||
              document.body.classList.contains('pseudo-full'));
  }

  // Update the button text and the layout class
  function refreshScreenMode() {
    const full = isFull();
    if (appEl) appEl.classList.toggle('is-full', full);
    if (ui.screen) ui.screen.textContent = full ? '🗗 Half screen' : '⛶ Full screen';
  }

  // Switch between full screen (whole screen, everything resized to fit) and half screen (normal page)
  function toggleFullscreen() {
    if (isFull()) {
      document.body.classList.remove('pseudo-full');
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
      refreshScreenMode();
      return;
    }

    // Apply the window-filling layout immediately; native fullscreen is an enhancement.
    document.body.classList.add('pseudo-full');
    refreshScreenMode();

    const request = appEl && (appEl.requestFullscreen || appEl.webkitRequestFullscreen);
    if (request) {
      try {
        const result = request.call(appEl);
        if (result && typeof result.then === 'function') {
          result.then(() => {
            if (document.fullscreenElement || document.webkitFullscreenElement) {
              document.body.classList.remove('pseudo-full');
            }
            refreshScreenMode();
          }).catch(() => {
            document.body.classList.add('pseudo-full');
            refreshScreenMode();
          });
        }
      } catch (err) {
        document.body.classList.add('pseudo-full');
        refreshScreenMode();
      }
    }
  }

  function onFullscreenChange() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      document.body.classList.remove('pseudo-full');
    }
    refreshScreenMode();
  }

  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  if (ui.screen) ui.screen.addEventListener('click', toggleFullscreen);
  refreshScreenMode();


  /* ========================================================================
     17. START: show the menu and begin the loop
     ======================================================================== */

  showMenu();
  updateHUD();
  requestAnimationFrame(loop);

})();
