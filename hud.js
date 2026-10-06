/* NaijaVerse HUD logic. Markup lives in index.html, styling in hud.css.
   From game.js call:  NaijaHUD.set({ cash, health, armor, level, role, avatar, stats:{ social, energy, ... } })
   The HUD fires window events: nv:inventory, nv:phone, nv:settings                                        */
(function () {
  var root = document.getElementById('hud');
  if (!root) return;

  // ---- scale from the 1536x1024 design size ----
  function layout() {
    var w = window.innerWidth, h = window.innerHeight;
    var s = Math.max(0.5, Math.min(1.1, Math.min(w / 1536, h / 1024) * 1.3));
    root.style.setProperty('--s', s.toFixed(3));
    // stats card is 14 + 388 design-px wide; the dock is 330 wide and centred
    root.classList.toggle('stacked', (14 + 388) * s > (w / 2 - 165 * s) - 6);
  }
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  layout();

  // ---- the seven stat rows: [key, label, colour, icon file, column] ----
  var defs = [
    ['social',  'Social',        '#ff3fa4', 'social',  'L'],
    ['energy',  'Energy',        '#ffc61a', 'energy',  'L'],
    ['hunger',  'Hunger',        '#ff8a2a', 'hunger',  'L'],
    ['thirst',  'Thirst',        '#25a8ff', 'thirst',  'R'],
    ['hygiene', 'Hygiene',       '#3ad0ff', 'hygiene', 'R'],
    ['pee',     'Pee',           '#8a5cff', 'pee',     'R'],
    ['stress',  'Mental Stress', '#e04bff', 'stress',  'R']
  ];
  defs.forEach(function (d) {
    document.getElementById('col' + d[4]).insertAdjacentHTML('beforeend',
      '<div class="st"><img class="ico" src="assets/icons/' + d[3] + '.png" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<div><div class="lab"><span>' + d[1] + '</span><b id="st_' + d[0] + 't">100%</b></div>' +
      '<div class="hbar"><i id="st_' + d[0] + '" style="--c:' + d[2] + ';width:100%"></i></div></div></div>');
  });

  function bar(id, txt, v) {
    v = Math.max(0, Math.min(100, Number(v) || 0));
    document.getElementById(id).style.width = v + '%';
    document.getElementById(txt).textContent = Math.round(v) + '%';
  }

  window.NaijaHUD = {
    set: function (o) {
      if (o.cash != null)   document.getElementById('hudCash').textContent = '\u20A6' + Number(o.cash).toLocaleString('en-US');
      if (o.health != null) bar('hudHealth', 'hudHealthTxt', o.health);
      if (o.armor != null)  bar('hudArmor', 'hudArmorTxt', o.armor);
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
  NaijaHUD.set({ cash: 250000, health: 100, armor: 0, level: 12,
    stats: { social: 100, energy: 85, hunger: 70, thirst: 65, hygiene: 80, pee: 60, stress: 20 } });

  [['btnBag', 'nv:inventory'], ['btnPhone', 'nv:phone'], ['btnSettings', 'nv:settings']].forEach(function (b) {
    document.getElementById(b[0]).addEventListener('click', function () { window.dispatchEvent(new CustomEvent(b[1])); });
  });
})();
