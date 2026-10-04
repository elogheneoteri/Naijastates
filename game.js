// Step 4: accounts + saved progress.
// Log in or sign up, walk around with other players, and the gate opens
// only when the server says your progress is "indigene".

// >>> Paste your three values here (see the setup steps). <<<
const SERVER_URL = 'https://naija-server.onrender.com';
const SUPABASE_URL = 'https://imcfgubedcrxmydanabx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_dUT0e10wO4IK7t0fzD02Yw_zmuh2ruE';

const WORLD_W = 3900;
const WORLD_H = 1500;
const SPEED = 190;
const GATE_X = 2000;
const SEND_EVERY_MS = 66;

// Character sprite sheet: hero.png (same folder as index.html)
// 4 columns (walk frames) x 4 rows (down, left, right, up), each frame 128 x 224 px.
// The character's feet sit on the line 93% of the way down each frame (y = 208).
// It is shown at half size (SPR_SCALE) so it stays sharp on phone screens.
// If hero.png is missing, the game falls back to the simple shapes.
const FRAME_W = 128;
const FRAME_H = 224;
const SPR_SCALE = 0.5;
const FEET = 0.93;
const DIRS = ['down', 'left', 'right', 'up'];

const SPAWN_X = 470, SPAWN_Y = 850;      // new players start on the main road, in front of the Arrival Terminal
const ROAD_TOP = 800, ROAD_BOTTOM = 920;   // main road (matches ground_left.jpg / ground_right.jpg)
const BUILDINGS = [
  { key: 'arrival', name: 'Arrival Terminal', cx: 520, w: 600, h: 337, top: 385, depth: 700,
    box: [0.006, 0.0, 0.995, 0.9357], door: [0.4076, 0.9268] },
  { key: 'refugee', name: 'Refugee Camp', cx: 640, w: 640, h: 385, top: 965, depth: 1190,
    box: [0.143, 0.0, 0.8492, 0.5855], door: [0.4917, 0.513] },
  { key: 'immigration', name: 'Immigration Office', cx: 1500, w: 700, h: 544, top: 235, depth: 700,
    box: [0.0082, 0.0, 0.9938, 0.8547], door: [0.4035, 0.8547] },
  { key: 'bank', name: 'Bank', cx: 2420, w: 640, h: 473, top: 287, depth: 700,
    box: [0.0039, 0.0, 0.9951, 0.8724], door: [0.4266, 0.8724] },
  { key: 'airport', name: 'Airport', cx: 3380, w: 900, h: 521, top: 274, depth: 620,
    box: [0.0036, 0.0, 0.9964, 0.6641], door: [0.5018, 0.5948] }
];

// Name areas shown in the top-left HUD (a strip in front of each building)
const ZONES = BUILDINGS.map(b => ({ name: b.name, x: b.cx - b.w / 2, y: b.depth - 40, w: b.w, h: 200 }));

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

  preload() {
    this.load.spritesheet('hero', 'hero.png', { frameWidth: FRAME_W, frameHeight: FRAME_H });
    this.load.image('ground_left', 'ground_left.jpg');
    this.load.image('ground_right', 'ground_right.jpg');
    BUILDINGS.forEach(b => this.load.image(b.key, b.key + '.png'));
  }

  create() {
    this.progress = 'arrived';
    this.devTools = false;
    this.stick = { active: false, startX: 0, startY: 0, x: 0, y: 0 };
    this.others = new Map();
    this.myId = null;
    this.lastSent = 0;

    // Ground: roads, paths, border wall and shadows are painted into these two pictures
    this.add.image(0, 0, 'ground_left').setOrigin(0, 0).setDepth(0);
    this.add.image(1950, 0, 'ground_right').setOrigin(0, 0).setDepth(0);

    // Buildings (pictures). Each one blocks walking through its body;
    // the strip in front of it (and its door) stays walkable.
    this.blockerList = [];
    const addBlocker = (x, y, w, h) => {
      const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0);
      this.physics.add.existing(r, true);
      this.blockerList.push(r);
    };
    BUILDINGS.forEach(b => {
      const left = b.cx - b.w / 2;
      this.add.image(b.cx, b.top, b.key).setOrigin(0.5, 0).setDisplaySize(b.w, b.h).setDepth(b.depth);
      addBlocker(left + b.box[0] * b.w, b.top + b.box[1] * b.h,
                 (b.box[2] - b.box[0]) * b.w, (b.box[3] - b.box[1]) * b.h);
      b.doorX = Math.round(left + b.door[0] * b.w);   // for the NPC / Talk button later
      b.doorY = Math.round(b.top + b.door[1] * b.h);
    });

    // Border wall at GATE_X: solid everywhere except the road gap
    addBlocker(GATE_X - 12, 0, 24, ROAD_TOP - 14);
    addBlocker(GATE_X - 12, ROAD_BOTTOM + 16, 24, WORLD_H - ROAD_BOTTOM - 16);

    // Checkpoint gate in the road gap: stays closed until the server reports progress = indigene
    this.gate = this.add.rectangle(GATE_X, (ROAD_TOP + ROAD_BOTTOM) / 2, 24, ROAD_BOTTOM - ROAD_TOP + 32, 0xc0392b, 0);
    this.physics.add.existing(this.gate, true);
    this.gateG = this.add.graphics().setDepth(900);
    this.gateG.fillStyle(0xc0392b, 1).fillRect(GATE_X - 5, ROAD_TOP - 6, 10, ROAD_BOTTOM - ROAD_TOP + 12);
    this.gateG.fillStyle(0xffffff, 1);
    for (let y = ROAD_TOP + 4; y < ROAD_BOTTOM; y += 30) this.gateG.fillRect(GATE_X - 5, y, 10, 14);
    this.gateLabel = this.add.text(GATE_X, ROAD_TOP - 50, 'Locked: finish immigration', {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#ffd9d4',
      backgroundColor: '#7a2418', padding: { x: 8, y: 4 }
    }).setOrigin(0.5).setDepth(901);

    const makeAvatar = (key, shirt) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xf2c14e, 1).fillCircle(16, 12, 10);
      g.fillStyle(shirt, 1).fillRoundedRect(6, 20, 20, 26, 6);
      g.generateTexture(key, 32, 48);
      g.destroy();
    };
    makeAvatar('avatar', 0x2c6e9b);
    makeAvatar('avatar-other', 0xd9822b);

    this.hasHero = this.textures.exists('hero');
    this.labelOffset = this.hasHero ? Math.round(FRAME_H * SPR_SCALE * FEET) : 30;
    this.facing = 'down';
    if (this.hasHero) {
      DIRS.forEach((d, row) => {
        this.anims.create({
          key: 'walk-' + d,
          frames: this.anims.generateFrameNumbers('hero', { start: row * 4, end: row * 4 + 3 }),
          frameRate: 8,
          repeat: -1
        });
      });
    }

    this.player = this.physics.add.sprite(SPAWN_X, SPAWN_Y, this.hasHero ? 'hero' : 'avatar', 0);
    this.player.setCollideWorldBounds(true);
    if (this.hasHero) {
      // The sprite's position is its feet; the collision box is a small patch at the feet.
      this.player.setOrigin(0.5, FEET).setScale(SPR_SCALE);
      this.player.body.setSize(60, 40).setOffset((FRAME_W - 60) / 2, Math.round(FRAME_H * FEET) - 40);
    } else {
      this.player.body.setSize(22, 30).setOffset(5, 16);
    }
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.physics.add.collider(this.player, this.gate);
    this.blockerList.forEach(r => this.physics.add.collider(this.player, r));
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

    // The server refused a move (gate or speed check): snap back to its position
    this.socket.on('correct', d => {
      this.player.setPosition(d.x, d.y);
      this.player.setVelocity(0, 0);
    });
    this.socket.on('joined', p => { this.addOther(p); this.updateStatus(); });
    this.socket.on('left', id => { this.removeOther(id); this.updateStatus(); });

    this.socket.on('moved', d => {
      const o = this.others.get(d.id);
      if (!o) return;
      o.tx = d.x;
      o.ty = d.y;
      if (!this.hasHero) o.sprite.setFlipX(d.flip);
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
    const sprite = this.hasHero
      ? this.add.sprite(p.x, p.y, 'hero', 0).setOrigin(0.5, FEET).setScale(SPR_SCALE)
      : this.add.image(p.x, p.y, 'avatar-other').setFlipX(p.flip);
    const label = this.add.text(p.x, p.y - this.labelOffset, p.name, LABEL_STYLE).setOrigin(0.5, 1);
    this.others.set(p.id, { sprite, label, tx: p.x, ty: p.y, facing: 'down' });
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
    this.gateG.setVisible(!open);
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

  // Plays the right walking animation for the direction, or the standing frame when still.
  // holder is where the facing direction is stored (for the player: this.facing).
  animate(sprite, vx, vy, holder, isRemote) {
    const threshold = isRemote ? 0.6 : 0.01;
    const moving = Math.hypot(vx, vy) > threshold;
    let facing = isRemote ? holder.facing : this.facing;
    if (moving) {
      if (Math.abs(vx) > Math.abs(vy)) facing = vx < 0 ? 'left' : 'right';
      else facing = vy < 0 ? 'up' : 'down';
      if (isRemote) holder.facing = facing; else this.facing = facing;
      sprite.anims.play('walk-' + facing, true);
    } else {
      sprite.anims.stop();
      sprite.setFrame(DIRS.indexOf(facing) * 4);
    }
  }

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
    if (this.hasHero) {
      this.animate(this.player, vx, vy, 'facing');
    } else if (vx !== 0) {
      this.player.setFlipX(vx < 0);
    }

    const px = this.player.x, py = this.player.y;
    this.player.setDepth(py);
    this.myLabel.setPosition(px, py - this.labelOffset);

    const here = ZONES.find(z => px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h);
    this.zoneText.setText(here ? here.name : 'Walking');

    if (this.socket && this.socket.connected && this.myId && time - this.lastSent > SEND_EVERY_MS) {
      this.lastSent = time;
      this.socket.emit('move', { x: Math.round(px), y: Math.round(py), flip: this.player.flipX });
    }

    this.others.forEach(o => {
      const dx = o.tx - o.sprite.x;
      const dy = o.ty - o.sprite.y;
      o.sprite.x += dx * 0.25;
      o.sprite.y += dy * 0.25;
      if (this.hasHero) this.animate(o.sprite, dx, dy, o, true);
      o.sprite.setDepth(o.sprite.y);
      o.label.setPosition(o.sprite.x, o.sprite.y - this.labelOffset).setDepth(5000);
    });
  }
}
