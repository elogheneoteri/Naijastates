// Step 4: accounts + saved progress.
// Log in or sign up, walk around with other players, and the gate opens
// only when the server says your progress is "indigene".

// >>> Paste your three values here (see the setup steps). <<<
const SERVER_URL = 'https://naija-server.onrender.com';
const SUPABASE_URL = 'https://imcfgubedcrxmydanabx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dUT0e10wO4IK7t0fzD02Yw_zmuh2ruE';

const WORLD_W = 2400;
const WORLD_H = 900;
const SPEED = 190;
const GATE_X = 1300;
const SEND_EVERY_MS = 66;

const ZONES = [
  { name: 'Arrival Terminal',   x: 80,   y: 330, w: 280, h: 240, color: 0x3d5a73 },
  { name: 'Refugee Camp',       x: 480,  y: 330, w: 300, h: 240, color: 0x6b5b3e },
  { name: 'Immigration Office', x: 900,  y: 330, w: 320, h: 240, color: 0x4a6b4a },
  { name: 'Bank',               x: 1450, y: 150, w: 260, h: 200, color: 0x5a4a73 },
  { name: 'Airport',            x: 1450, y: 550, w: 260, h: 200, color: 0x73504a },
  { name: 'Bus Stop',           x: 1880, y: 350, w: 220, h: 200, color: 0x4a6573 }
];

const LABEL_STYLE = {
  fontFamily: 'Georgia, serif', fontSize: '15px', color: '#ffffff',
  backgroundColor: '#00000099', padding: { x: 5, y: 2 }
};

const HUD_STYLE = {
  fontFamily: 'Georgia, serif', fontSize: '18px', color: '#ffffff',
  backgroundColor: '#00000088', padding: { x: 8, y: 4 }
};

// ---------------- Login screen ----------------

const configured = !SUPABASE_URL.includes('YOUR-') && !SUPABASE_ANON_KEY.includes('YOUR-');
const sb = configured ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const authBox = document.getElementById('auth');
const authMsg = document.getElementById('authMsg');
const authName = document.getElementById('authName');
const authEmail = document.getElementById('authEmail');
const authPass = document.getElementById('authPass');

function say(text) { authMsg.textContent = text; }

let gameStarted = false;
function startGame() {
  if (gameStarted) return;
  gameStarted = true;
  authBox.style.display = 'none';
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#14202b',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    physics: { default: 'arcade', arcade: { debug: false } },
    scene: WorldScene
  });
}

document.getElementById('btnSignup').addEventListener('click', async () => {
  if (!sb) return say('Set SUPABASE_URL and SUPABASE_ANON_KEY at the top of game.js');
  const name = authName.value.trim();
  if (!name) return say('Enter a display name first.');
  say('Creating account...');
  const { data, error } = await sb.auth.signUp({ email: authEmail.value.trim(), password: authPass.value });
  if (error) return say(error.message);
  localStorage.setItem('pendingName', name);
  if (!data.session) return say('Account created. Check your email to confirm, then log in.');
  startGame();
});

document.getElementById('btnLogin').addEventListener('click', async () => {
  if (!sb) return say('Set SUPABASE_URL and SUPABASE_ANON_KEY at the top of game.js');
  say('Logging in...');
  const { error } = await sb.auth.signInWithPassword({ email: authEmail.value.trim(), password: authPass.value });
  if (error) return say(error.message);
  startGame();
});

(async function boot() {
  authBox.style.display = 'flex';
  if (!sb) return say('Set SUPABASE_URL and SUPABASE_ANON_KEY at the top of game.js');
  const { data } = await sb.auth.getSession();
  if (data.session) startGame();
})();

// ---------------- Game ----------------

class WorldScene extends Phaser.Scene {
  constructor() { super('world'); }

  create() {
    this.progress = 'arrived';
    this.devTools = false;
    this.stick = { active: false, startX: 0, startY: 0, x: 0, y: 0 };
    this.others = new Map();
    this.myId = null;
    this.lastSent = 0;

    // Ground and paths
    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x2f4a36);
    this.add.rectangle(WORLD_W / 2, 450, WORLD_W - 100, 70, 0x57504a);

    ZONES.forEach(z => {
      this.add.rectangle(z.x + z.w / 2, z.y + z.h / 2, z.w, z.h, z.color)
        .setStrokeStyle(3, 0xe8e2d0, 0.7);
      this.add.text(z.x + z.w / 2, z.y + 18, z.name, {
        fontFamily: 'Georgia, serif', fontSize: '22px', color: '#f3eedd'
      }).setOrigin(0.5, 0);
    });

    // Gate: stays closed until the server reports progress = indigene
    this.gate = this.add.rectangle(GATE_X, 450, 18, 260, 0xc0392b);
    this.physics.add.existing(this.gate, true);
    this.gateLabel = this.add.text(GATE_X, 300, 'Locked: finish immigration', {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#ffd9d4',
      backgroundColor: '#7a2418', padding: { x: 8, y: 4 }
    }).setOrigin(0.5);

    const makeAvatar = (key, shirt) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xf2c14e, 1).fillCircle(16, 12, 10);
      g.fillStyle(shirt, 1).fillRoundedRect(6, 20, 20, 26, 6);
      g.generateTexture(key, 32, 48);
      g.destroy();
    };
    makeAvatar('avatar', 0x2c6e9b);
    makeAvatar('avatar-other', 0xd9822b);

    this.player = this.physics.add.sprite(200, 450, 'avatar');
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(22, 30).setOffset(5, 16);
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics.add.collider(this.player, this.gate);
    this.myLabel = this.add.text(0, 0, '', LABEL_STYLE).setOrigin(0.5, 1).setDepth(5000);

    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys('W,A,S,D');

    // HUD
    this.zoneText = this.add.text(12, 10, '', { ...HUD_STYLE, fontSize: '20px' })
      .setScrollFactor(0).setDepth(10000);

    this.testButton = this.add.text(12, 50, '', { ...HUD_STYLE, backgroundColor: '#2c6e9b', padding: { x: 10, y: 6 } })
      .setScrollFactor(0).setDepth(10000).setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.testButton.on('pointerdown', () => this.toggleProgressTest());

    this.statusText = this.add.text(12, 96, '', { ...HUD_STYLE, fontSize: '16px', color: '#ffe9a8' })
      .setScrollFactor(0).setDepth(10000);

    this.logoutButton = this.add.text(12, 134, 'Log out', { ...HUD_STYLE, fontSize: '16px', backgroundColor: '#3a566d' })
      .setScrollFactor(0).setDepth(10000).setInteractive({ useHandCursor: true });
    this.logoutButton.on('pointerdown', async () => {
      await sb.auth.signOut();
      location.reload();
    });

    // Touch joystick
    this.stickBase = this.add.circle(0, 0, 55, 0xffffff, 0.15).setScrollFactor(0).setDepth(10000).setVisible(false);
    this.stickKnob = this.add.circle(0, 0, 26, 0xffffff, 0.45).setScrollFactor(0).setDepth(10001).setVisible(false);

    this.input.on('pointerdown', p => {
      if (p.y < 180) return; // keep HUD buttons tappable
      this.stick.active = true;
      this.stick.startX = p.x;
      this.stick.startY = p.y;
      this.stick.x = 0;
      this.stick.y = 0;
      this.stickBase.setPosition(p.x, p.y).setVisible(true);
      this.stickKnob.setPosition(p.x, p.y).setVisible(true);
    });
    this.input.on('pointermove', p => {
      if (!this.stick.active) return;
      let dx = p.x - this.stick.startX;
      let dy = p.y - this.stick.startY;
      const len = Math.hypot(dx, dy);
      const max = 55;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      this.stick.x = dx / max;
      this.stick.y = dy / max;
      this.stickKnob.setPosition(this.stick.startX + dx, this.stick.startY + dy);
    });
    const endStick = () => {
      this.stick.active = false;
      this.stick.x = 0;
      this.stick.y = 0;
      this.stickBase.setVisible(false);
      this.stickKnob.setVisible(false);
    };
    this.input.on('pointerup', endStick);
    this.input.on('pointerupoutside', endStick);

    this.applyGate();
    this.connect();
  }

  // ---------- Multiplayer ----------

  connect() {
    if (SERVER_URL.includes('YOUR-SERVER-NAME')) {
      this.statusText.setText('Set SERVER_URL at the top of game.js');
      return;
    }
    this.statusText.setText('Connecting... the server may take about a minute to wake up.');
    this.socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

    this.socket.on('connect', async () => {
      const { data } = await sb.auth.getSession();
      if (!data.session) { this.statusText.setText('Please log in again.'); return; }
      this.socket.emit('join', {
        token: data.session.access_token,
        name: localStorage.getItem('pendingName') || ''
      });
    });

    this.socket.on('init', data => {
      this.myId = data.you;
      this.progress = data.progress;
      this.devTools = data.devTools;
      this.player.setPosition(data.x, data.y);
      this.myLabel.setText(data.name);
      data.players.forEach(p => { if (p.id !== this.myId) this.addOther(p); });
      this.applyGate();
      this.updateStatus();
    });

    this.socket.on('progress', d => { this.progress = d.progress; this.applyGate(); });
    this.socket.on('joined', p => { this.addOther(p); this.updateStatus(); });
    this.socket.on('left', id => { this.removeOther(id); this.updateStatus(); });

    this.socket.on('moved', d => {
      const o = this.others.get(d.id);
      if (!o) return;
      o.tx = d.x;
      o.ty = d.y;
      o.sprite.setFlipX(d.flip);
    });

    this.socket.on('join_error', async msg => {
      this.statusText.setText(msg);
      if (msg.includes('log in')) { await sb.auth.signOut(); }
    });
    this.socket.on('kicked', () => this.statusText.setText('Logged in somewhere else. Reload to play here.'));
    this.socket.on('full', () => this.statusText.setText('Server is full. Try again later.'));
    this.socket.on('disconnect', () => this.statusText.setText('Disconnected. Reconnecting...'));
    this.socket.on('connect_error', () => this.statusText.setText('Cannot reach the server yet. Retrying...'));
  }

  addOther(p) {
    if (this.others.has(p.id)) return;
    const sprite = this.add.image(p.x, p.y, 'avatar-other').setFlipX(p.flip);
    const label = this.add.text(p.x, p.y - 30, p.name, LABEL_STYLE).setOrigin(0.5, 1);
    this.others.set(p.id, { sprite, label, tx: p.x, ty: p.y });
  }

  removeOther(id) {
    const o = this.others.get(id);
    if (!o) return;
    o.sprite.destroy();
    o.label.destroy();
    this.others.delete(id);
  }

  updateStatus() {
    this.statusText.setText('Online: ' + (this.others.size + 1));
  }

  // ---------- Gate and progress ----------

  applyGate() {
    const open = this.progress === 'indigene';
    this.gate.setVisible(!open);
    this.gateLabel.setVisible(!open);
    this.gate.body.enable = !open;
    this.testButton.setVisible(this.devTools);
    this.testButton.setText(open ? 'Test: reset to arrived' : 'Test: become indigene');
  }

  toggleProgressTest() {
    if (!this.socket) return;
    this.socket.emit('dev_progress', this.progress === 'indigene' ? 'arrived' : 'indigene');
  }

  // ---------- Game loop ----------

  update(time) {
    let vx = 0, vy = 0;
    if (this.cursors.left.isDown || this.keys.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.keys.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.keys.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) vy += 1;
    if (this.stick.active) { vx = this.stick.x; vy = this.stick.y; }

    const len = Math.hypot(vx, vy);
    if (len > 1) { vx /= len; vy /= len; }
    this.player.setVelocity(vx * SPEED, vy * SPEED);
    if (vx !== 0) this.player.setFlipX(vx < 0);

    const px = this.player.x, py = this.player.y;
    this.player.setDepth(py);
    this.myLabel.setPosition(px, py - 30);

    const here = ZONES.find(z => px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h);
    this.zoneText.setText(here ? here.name : 'Walking');

    if (this.socket && this.socket.connected && this.myId && time - this.lastSent > SEND_EVERY_MS) {
      this.lastSent = time;
      this.socket.emit('move', { x: Math.round(px), y: Math.round(py), flip: this.player.flipX });
    }

    this.others.forEach(o => {
      o.sprite.x += (o.tx - o.sprite.x) * 0.25;
      o.sprite.y += (o.ty - o.sprite.y) * 0.25;
      o.sprite.setDepth(o.sprite.y);
      o.label.setPosition(o.sprite.x, o.sprite.y - 30).setDepth(5000);
    });
  }
}
