/* NaijaVerse HUD logic. Markup lives in index.html, styling in hud.css.
   From game.js call:  NaijaHUD.set({ cash, health, level, role, avatar, stats:{ social, energy, ... } })
   The HUD fires window events: nv:inventory, nv:phone, nv:settings, nv:chat                                        */
(function () {
  var root = document.getElementById('hud');
  if (!root) return;

  // ---- scale from the 1536x1024 design size ----
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    var s = Math.max(0.62, Math.min(1.15, Math.min(w / 1536, h / 1024) * 1.7));
    root.style.setProperty('--s', s.toFixed(3));
    // player card is 18 + 420 design-px wide; the dock is 300 wide and centred
    root.classList.toggle('stacked', (18 + 420) * s > (w / 2 - 150 * s) - 6);
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  layout();

  // ---- the stat rows: [key, label, colour, icon file, column] (column L: first four, column R: last four) ----
  var defs = [
    ['thirst',  'Thirst',        '#4db8ff', 'drop',    'L'],
    ['hygiene', 'Hygiene',       '#5ee0d0', 'bubbles', 'L'],
    ['pee',     'Pee',           '#a78bfa', 'toilet',  'L'],
    ['stress',  'Mental Stress', '#d98bff', 'pulse',   'L'],
    ['social',  'Social',        '#ff7ab8', 'users',   'R'],
    ['energy',  'Energy',        '#ffd24d', 'zap',     'R'],
    ['hunger',  'Hunger',        '#ff9a4d', 'food',    'R'],
    ['health',  'Health',        '#ff5c6c', 'heart',   'R']
  ];
  defs.forEach(function (d) {
    document.getElementById('col' + d[4]).insertAdjacentHTML('beforeend',
      '<div class="st" style="--c:' + d[2] + '"><svg class="ic"><use href="#i-' + d[3] + '"/></svg>' +
      '<div><div class="lab"><span>' + d[1] + '</span><b id="st_' + d[0] + 't">100%</b></div>' +
      '<div class="hbar"><i id="st_' + d[0] + '" style="width:100%"></i></div></div></div>');
  });

  function bar(id, txt, v) {
    var b = document.getElementById(id), t = document.getElementById(txt);
    if (!b || !t) return;
    v = Math.max(0, Math.min(100, Number(v) || 0));
    b.style.width = v + '%';
    t.textContent = Math.round(v) + '%';
  }

  // ---- fold / unfold the Player Card and the Quest card ----
  var stats = document.getElementById('stats'), quest = document.getElementById('quest');
  document.getElementById('statsToggle').addEventListener('click', function () { stats.classList.toggle('off'); });
  document.getElementById('questHead').addEventListener('click', function () { quest.classList.toggle('off'); });
  if (window.innerWidth < 760 || window.innerHeight < 460) { stats.classList.add('off'); quest.classList.add('off'); }

  // ---- quest text follows the game's progress: game.js sets the test button to "Test: reset to arrived" once you are Indigene ----
  var tb = document.getElementById('testButton'), qt = document.getElementById('questTask');
  function syncQuest() { qt.textContent = /reset/i.test(tb.textContent) ? 'TASK: Done. You are Indigene' : 'TASK: Become Indigene'; }
  if (tb) { new MutationObserver(syncQuest).observe(tb, { childList: true, characterData: true, subtree: true }); syncQuest(); }

  window.NaijaHUD = {
    set: function (o) {
      if (o.cash != null)   document.getElementById('hudCash').textContent = '\u20A6' + Number(o.cash).toLocaleString('en-US');
      if (o.health != null) bar('st_health', 'st_healtht', o.health);
      if (o.level != null)  document.getElementById('hudLevel').textContent = 'Lv. ' + o.level;
      if (o.role)           document.getElementById('hudRole').textContent = o.role;
      if (o.avatar) {
        var f = document.getElementById('hudFace');
        f.style.backgroundImage = 'url(' + o.avatar + ')'; f.textContent = '';
      }
      if (o.stats) Object.keys(o.stats).forEach(function (k) {
        if (document.getElementById('st_' + k)) bar('st_' + k, 'st_' + k + 't', o.stats[k]);
      });
    }
  };

  // demo values from the reference: remove once real player data is wired in
  NaijaHUD.set({ cash: 250000, health: 100, level: 12,
    stats: { social: 100, energy: 85, hunger: 70, thirst: 65, hygiene: 80, pee: 60, stress: 20 } });

  [['btnBag', 'nv:inventory'], ['btnPhone', 'nv:phone'], ['btnSettings', 'nv:settings'], ['btnChat', 'nv:chat']].forEach(function (b) {
    document.getElementById(b[0]).addEventListener('click', function () { window.dispatchEvent(new CustomEvent(b[1])); });
  });
})();
