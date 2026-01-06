import * as Phaser from 'phaser';
import { Socket } from 'socket.io-client';

// ═══════════════════════════════════════════════════════════
// BATTLE SCENE - BOSS ONLY (UI in React)
// ═══════════════════════════════════════════════════════════
//
// This scene ONLY handles:
// - Boss sprite rendering
// - Tap detection (emits to socket)
// - Floating damage numbers
// - Hit effects (shake, flash)
// - Skill visual effects
//
// ALL UI (bars, buttons, feed) is in React PhaserGame.tsx
// See docs/ARCHITECTURE.md
// ═══════════════════════════════════════════════════════════

export class BattleScene extends Phaser.Scene {
  private socket: Socket | null = null;

  // Boss sprite
  private bossSprite!: Phaser.GameObjects.Sprite;
  private originalBossScale = 1;
  private originalBossX = 0;
  private originalBossY = 0;
  private lastHitTime = 0;

  // Tap batching
  private tapQueue = 0;

  // Event emitter for React communication
  private emitter: Phaser.Events.EventEmitter;

  constructor() {
    super({ key: 'BattleScene' });
    this.emitter = new Phaser.Events.EventEmitter();
  }

  // Get emitter for React to subscribe
  getEmitter(): Phaser.Events.EventEmitter {
    return this.emitter;
  }

  init(data: { socket?: Socket }) {
    if (data.socket) {
      this.socket = data.socket;
      this.setupSocketListeners();
    }
  }

  preload() {
    if (!this.textures.exists('boss')) {
      this.load.image('boss', '/assets/bosses/boss_single.png');
    }
  }

  create() {
    const { width, height } = this.scale;

    // Transparent background (React handles the gradient)
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // Boss sprite (centered)
    this.bossSprite = this.add.sprite(width / 2, height / 2, 'boss');
    this.bossSprite.setInteractive();
    this.originalBossX = width / 2;
    this.originalBossY = height / 2;
    this.updateBossScale();

    // Tap handlers
    this.bossSprite.on('pointerdown', () => this.handleTap());
    this.input.on('pointerdown', () => this.handleTap());

    // Tap flush timer (every 100ms)
    this.time.addEvent({
      delay: 100,
      callback: this.flushTaps,
      callbackScope: this,
      loop: true,
    });

    // Resize handler
    this.scale.on('resize', this.handleResize, this);

    // Delay scale fix
    this.time.delayedCall(100, () => this.updateBossScale());
  }

  // ─────────────────────────────────────────────────────────
  // TAP HANDLING
  // ─────────────────────────────────────────────────────────

  private handleTap() {
    // Queue tap - React will check exhaustion/stamina
    this.tapQueue++;

    // Emit to React for stamina check
    this.emitter.emit('tap');

    // Hit animation
    this.playHitAnimation();
  }

  private flushTaps() {
    if (this.tapQueue > 0 && this.socket) {
      this.socket.emit('tap:batch', { count: this.tapQueue });
      this.tapQueue = 0;
    }
  }

  // Cancel queued taps (called by React when exhausted)
  cancelTaps() {
    this.tapQueue = 0;
  }

  // Update boss image dynamically (called by React when boss changes)
  updateBossImage(imageUrl: string) {
    if (!this.bossSprite) return;

    const textureKey = `boss_${imageUrl.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // If texture already loaded, just swap it
    if (this.textures.exists(textureKey)) {
      this.bossSprite.setTexture(textureKey);
      this.updateBossScale();
      return;
    }

    // Load new texture
    this.load.image(textureKey, imageUrl);
    this.load.once('complete', () => {
      if (this.bossSprite && this.textures.exists(textureKey)) {
        this.bossSprite.setTexture(textureKey);
        this.updateBossScale();
      }
    });
    this.load.start();
  }

  // ─────────────────────────────────────────────────────────
  // DAMAGE NUMBERS (floating text)
  // ─────────────────────────────────────────────────────────

  showDamageNumber(damage: number, isCrit: boolean) {
    const { width, height } = this.scale;
    const x = width / 2 + Phaser.Math.Between(-100, 100);
    const y = height / 2 + Phaser.Math.Between(-50, 50);

    const text = this.add.text(x, y, `-${damage.toLocaleString()}`, {
      fontFamily: 'system-ui',
      fontSize: isCrit ? '28px' : '22px',
      color: isCrit ? '#ef4444' : '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      y: y - 80,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  // ─────────────────────────────────────────────────────────
  // HIT EFFECTS
  // ─────────────────────────────────────────────────────────

  playHitAnimation() {
    const now = Date.now();
    if (now - this.lastHitTime < 150) return;
    this.lastHitTime = now;

    this.tweens.killTweensOf(this.bossSprite);
    this.bossSprite.setPosition(this.originalBossX, this.originalBossY);
    this.bossSprite.setScale(this.originalBossScale);

    // Shake
    this.tweens.add({
      targets: this.bossSprite,
      x: this.originalBossX + Phaser.Math.Between(-8, 8),
      y: this.originalBossY + Phaser.Math.Between(-5, 5),
      duration: 50,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.bossSprite?.setPosition(this.originalBossX, this.originalBossY);
      }
    });

    // Scale punch
    this.tweens.add({
      targets: this.bossSprite,
      scaleX: this.originalBossScale * 1.05,
      scaleY: this.originalBossScale * 1.05,
      duration: 100,
      yoyo: true,
      onComplete: () => {
        this.bossSprite?.setScale(this.originalBossScale);
      }
    });

    // Tint flash on boss sprite (instead of full screen flash)
    this.bossSprite.setTint(0xffffff);
    this.time.delayedCall(80, () => {
      this.bossSprite?.clearTint();
    });
  }

  // ─────────────────────────────────────────────────────────
  // SKILL EFFECTS
  // ─────────────────────────────────────────────────────────

  playSkillEffect(skillId: string) {
    const { width, height } = this.scale;
    const bossX = width / 2;
    const bossY = height / 2;

    switch (skillId) {
      case 'fireball':
        this.playFireballEffect(bossX, bossY);
        break;
      case 'iceball':
        this.playIceballEffect(bossX, bossY);
        break;
      case 'lightning':
        this.playLightningEffect(bossX, bossY);
        break;
    }

    this.playHitAnimation();
  }

  private playFireballEffect(targetX: number, targetY: number) {
    const numParticles = 20;
    for (let i = 0; i < numParticles; i++) {
      const angle = (i / numParticles) * Math.PI * 2;
      const radius = 60 + Math.random() * 40;
      const x = targetX + Math.cos(angle) * radius;
      const y = targetY + Math.sin(angle) * radius;

      const particle = this.add.graphics();
      particle.fillStyle(0xff6600 + Math.floor(Math.random() * 0x003300), 1);
      particle.fillCircle(0, 0, 8 + Math.random() * 8);
      particle.setPosition(targetX, targetY);

      this.tweens.add({
        targets: particle,
        x, y,
        alpha: 0,
        scale: 0.2,
        duration: 400 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }

    const flash = this.add.graphics();
    flash.fillStyle(0xff4400, 0.8);
    flash.fillCircle(0, 0, 80);
    flash.setPosition(targetX, targetY);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2,
      duration: 300,
      onComplete: () => flash.destroy(),
    });

    // Fire tint on boss + reduced shake
    this.bossSprite.setTint(0xff6600);
    this.time.delayedCall(150, () => this.bossSprite?.clearTint());
    this.cameras.main.shake(150, 0.008);
  }

  private playIceballEffect(targetX: number, targetY: number) {
    const numShards = 15;
    for (let i = 0; i < numShards; i++) {
      const angle = (i / numShards) * Math.PI * 2;
      const radius = 80 + Math.random() * 50;
      const x = targetX + Math.cos(angle) * radius;
      const y = targetY + Math.sin(angle) * radius;

      const shard = this.add.graphics();
      shard.fillStyle(0x00ccff, 1);
      shard.fillTriangle(0, -12, 6, 0, 0, 12);
      shard.fillTriangle(0, -12, -6, 0, 0, 12);
      shard.setPosition(targetX, targetY);
      shard.setRotation(angle);

      this.tweens.add({
        targets: shard,
        x, y,
        alpha: 0,
        duration: 500 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => shard.destroy(),
      });
    }

    const frost = this.add.graphics();
    frost.fillStyle(0xaaddff, 0.6);
    frost.fillCircle(0, 0, 70);
    frost.setPosition(targetX, targetY);

    this.tweens.add({
      targets: frost,
      alpha: 0,
      scale: 1.8,
      duration: 400,
      onComplete: () => frost.destroy(),
    });

    // Ice tint on boss
    this.bossSprite.setTint(0x88ddff);
    this.time.delayedCall(150, () => this.bossSprite?.clearTint());
  }

  private playLightningEffect(targetX: number, targetY: number) {
    for (let bolt = 0; bolt < 3; bolt++) {
      const offsetX = (bolt - 1) * 40;
      const lightning = this.add.graphics();
      lightning.lineStyle(4, 0xffff00, 1);

      const segments = 8;
      const segmentHeight = targetY / segments;

      lightning.beginPath();
      lightning.moveTo(targetX + offsetX, 0);

      let currentX = targetX + offsetX;
      for (let i = 1; i < segments; i++) {
        currentX += Phaser.Math.Between(-30, 30);
        lightning.lineTo(currentX, i * segmentHeight);
      }
      lightning.lineTo(targetX + offsetX, targetY);
      lightning.strokePath();

      const glow = this.add.graphics();
      glow.lineStyle(12, 0xffff88, 0.3);
      glow.beginPath();
      glow.moveTo(targetX + offsetX, 0);
      currentX = targetX + offsetX;
      for (let i = 1; i < segments; i++) {
        currentX += Phaser.Math.Between(-30, 30);
        glow.lineTo(currentX, i * segmentHeight);
      }
      glow.lineTo(targetX + offsetX, targetY);
      glow.strokePath();

      this.tweens.add({
        targets: [lightning, glow],
        alpha: 0,
        duration: 200 + bolt * 50,
        delay: bolt * 80,
        onComplete: () => {
          lightning.destroy();
          glow.destroy();
        },
      });
    }

    for (let i = 0; i < 12; i++) {
      const spark = this.add.graphics();
      spark.fillStyle(0xffff00, 1);
      spark.fillCircle(0, 0, 4);
      spark.setPosition(targetX, targetY);

      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 60;

      this.tweens.add({
        targets: spark,
        x: targetX + Math.cos(angle) * dist,
        y: targetY + Math.sin(angle) * dist,
        alpha: 0,
        duration: 300,
        onComplete: () => spark.destroy(),
      });
    }

    // Lightning tint on boss + shake
    this.bossSprite.setTint(0xffff88);
    this.time.delayedCall(100, () => this.bossSprite?.clearTint());
    this.cameras.main.shake(150, 0.01);
  }

  // ─────────────────────────────────────────────────────────
  // SOCKET LISTENERS
  // ─────────────────────────────────────────────────────────

  private setupSocketListeners() {
    if (!this.socket) return;

    // Tap result - show damage number
    this.socket.on('tap:result', (data: { damage: number; crits: number }) => {
      this.showDamageNumber(data.damage, data.crits > 0);
    });

    // Auto-attack result
    this.socket.on('autoAttack:result', (data: { damage: number; crits: number; showHitEffect?: boolean }) => {
      if (data.showHitEffect) {
        this.showDamageNumber(data.damage, data.crits > 0);
        this.playHitAnimation();
      }
    });

    // Skill result
    this.socket.on('skill:result', (data: { skillId: string; damage: number }) => {
      this.showDamageNumber(data.damage, true);
    });
  }

  // ─────────────────────────────────────────────────────────
  // SCALING / RESIZE
  // ─────────────────────────────────────────────────────────

  private updateBossScale() {
    if (!this.bossSprite) return;
    const { width, height } = this.scale;
    const imgWidth = this.bossSprite.width;
    const imgHeight = this.bossSprite.height;
    const scaleFit = Math.min((width * 0.62) / imgWidth, (height * 0.50) / imgHeight);
    this.bossSprite.setScale(scaleFit);
    this.originalBossScale = scaleFit;
    this.originalBossX = this.bossSprite.x;
    this.originalBossY = this.bossSprite.y;
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const { width, height } = gameSize;
    this.originalBossX = width / 2;
    this.originalBossY = height / 2;
    this.bossSprite?.setPosition(this.originalBossX, this.originalBossY);
    this.updateBossScale();
  }

  update() {
    // No UI updates needed - all handled by React
  }
}
