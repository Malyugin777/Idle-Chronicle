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
// - Hit effects (shake, flash, particles)
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

    // Boss sprite - positioned LOWER (55% from top)
    const bossY = height * 0.55;
    this.bossSprite = this.add.sprite(width / 2, bossY, 'boss');
    this.bossSprite.setInteractive();
    this.originalBossX = width / 2;
    this.originalBossY = bossY;
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
  // DAMAGE NUMBERS (floating text with effects)
  // ─────────────────────────────────────────────────────────

  showDamageNumber(damage: number, isCrit: boolean) {
    const { width } = this.scale;
    const x = this.originalBossX + Phaser.Math.Between(-80, 80);
    const y = this.originalBossY + Phaser.Math.Between(-60, 20);

    // Format damage
    const damageText = damage >= 1000
      ? `-${(damage / 1000).toFixed(1)}K`
      : `-${damage}`;

    // Create main text
    const fontSize = isCrit ? 36 : 26;
    const text = this.add.text(x, y, damageText, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: `${fontSize}px`,
      color: isCrit ? '#ff4444' : '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: isCrit ? 5 : 4,
    }).setOrigin(0.5).setScale(0.3);

    // Pop-in scale animation
    this.tweens.add({
      targets: text,
      scale: isCrit ? 1.3 : 1,
      duration: 100,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Float up and fade
        this.tweens.add({
          targets: text,
          y: y - 100,
          alpha: 0,
          scale: isCrit ? 0.8 : 0.6,
          duration: 800,
          ease: 'Cubic.easeOut',
          onComplete: () => text.destroy(),
        });
      }
    });

    // Crit effects
    if (isCrit) {
      // Glow burst
      const glow = this.add.graphics();
      glow.fillStyle(0xff4444, 0.6);
      glow.fillCircle(0, 0, 30);
      glow.setPosition(x, y);

      this.tweens.add({
        targets: glow,
        alpha: 0,
        scale: 2,
        duration: 300,
        onComplete: () => glow.destroy(),
      });

      // Sparkles around crit (diamond shapes)
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const spark = this.add.graphics();
        spark.fillStyle(0xffff00, 1);
        // Diamond shape
        spark.fillTriangle(0, -6, 4, 0, 0, 6);
        spark.fillTriangle(0, -6, -4, 0, 0, 6);
        spark.setPosition(x, y);
        spark.setRotation(angle);

        this.tweens.add({
          targets: spark,
          x: x + Math.cos(angle) * 50,
          y: y + Math.sin(angle) * 50,
          alpha: 0,
          rotation: angle + Math.PI,
          duration: 400,
          onComplete: () => spark.destroy(),
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // HIT EFFECTS (improved visuals)
  // ─────────────────────────────────────────────────────────

  playHitAnimation() {
    const now = Date.now();
    if (now - this.lastHitTime < 100) return;
    this.lastHitTime = now;

    if (!this.bossSprite) return;

    this.tweens.killTweensOf(this.bossSprite);
    this.bossSprite.setPosition(this.originalBossX, this.originalBossY);
    this.bossSprite.setScale(this.originalBossScale);

    // Impact shake - more dynamic
    const shakeX = Phaser.Math.Between(-12, 12);
    const shakeY = Phaser.Math.Between(-8, 8);
    this.tweens.add({
      targets: this.bossSprite,
      x: this.originalBossX + shakeX,
      y: this.originalBossY + shakeY,
      duration: 40,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.bossSprite?.setPosition(this.originalBossX, this.originalBossY);
      }
    });

    // Scale punch - squash and stretch
    this.tweens.add({
      targets: this.bossSprite,
      scaleX: this.originalBossScale * 1.08,
      scaleY: this.originalBossScale * 0.94,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.bossSprite?.setScale(this.originalBossScale);
      }
    });

    // Red flash tint
    this.bossSprite.setTint(0xff6666);
    this.time.delayedCall(60, () => {
      this.bossSprite?.clearTint();
    });

    // Hit sparks particles
    this.createHitSparks();

    // Slash mark effect
    this.createSlashEffect();
  }

  private createHitSparks() {
    const numSparks = 8;
    for (let i = 0; i < numSparks; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 60;
      const size = 3 + Math.random() * 4;

      const spark = this.add.graphics();
      // Random warm colors: yellow, orange, white
      const colors = [0xffff00, 0xff8800, 0xffffff, 0xffcc00];
      spark.fillStyle(colors[Math.floor(Math.random() * colors.length)], 1);
      spark.fillCircle(0, 0, size);
      spark.setPosition(this.originalBossX, this.originalBossY);

      const targetX = this.originalBossX + Math.cos(angle) * speed;
      const targetY = this.originalBossY + Math.sin(angle) * speed;

      this.tweens.add({
        targets: spark,
        x: targetX,
        y: targetY,
        alpha: 0,
        scale: 0.2,
        duration: 250 + Math.random() * 150,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private createSlashEffect() {
    const slash = this.add.graphics();

    // Random slash angle
    const angle = Phaser.Math.Between(-30, 30) * (Math.PI / 180);
    const length = 80;

    slash.lineStyle(4, 0xffffff, 0.9);
    slash.beginPath();
    slash.moveTo(-length/2, 0);
    slash.lineTo(length/2, 0);
    slash.strokePath();

    // Glow line
    slash.lineStyle(12, 0xffff88, 0.3);
    slash.beginPath();
    slash.moveTo(-length/2, 0);
    slash.lineTo(length/2, 0);
    slash.strokePath();

    slash.setPosition(
      this.originalBossX + Phaser.Math.Between(-30, 30),
      this.originalBossY + Phaser.Math.Between(-40, 40)
    );
    slash.setRotation(angle);
    slash.setScale(0.5, 1);

    this.tweens.add({
      targets: slash,
      scaleX: 1.5,
      alpha: 0,
      duration: 200,
      ease: 'Cubic.easeOut',
      onComplete: () => slash.destroy(),
    });
  }

  // ─────────────────────────────────────────────────────────
  // SKILL EFFECTS
  // ─────────────────────────────────────────────────────────

  playSkillEffect(skillId: string) {
    const bossX = this.originalBossX;
    const bossY = this.originalBossY;

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
    // Explosion core
    const core = this.add.graphics();
    core.fillStyle(0xff4400, 1);
    core.fillCircle(0, 0, 40);
    core.setPosition(targetX, targetY);

    this.tweens.add({
      targets: core,
      alpha: 0,
      scale: 3,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy(),
    });

    // Fire particles
    const numParticles = 25;
    for (let i = 0; i < numParticles; i++) {
      const angle = (i / numParticles) * Math.PI * 2 + Math.random() * 0.5;
      const radius = 100 + Math.random() * 80;
      const x = targetX + Math.cos(angle) * radius;
      const y = targetY + Math.sin(angle) * radius;

      const particle = this.add.graphics();
      const fireColors = [0xff6600, 0xff4400, 0xff8800, 0xffaa00];
      particle.fillStyle(fireColors[Math.floor(Math.random() * fireColors.length)], 1);
      particle.fillCircle(0, 0, 6 + Math.random() * 10);
      particle.setPosition(targetX, targetY);

      this.tweens.add({
        targets: particle,
        x, y,
        alpha: 0,
        scale: 0.1,
        duration: 400 + Math.random() * 300,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }

    // Fire tint on boss + screen shake
    this.bossSprite.setTint(0xff6600);
    this.time.delayedCall(200, () => this.bossSprite?.clearTint());
    this.cameras.main.shake(200, 0.015);
  }

  private playIceballEffect(targetX: number, targetY: number) {
    // Frost ring
    const ring = this.add.graphics();
    ring.lineStyle(6, 0x88ddff, 1);
    ring.strokeCircle(0, 0, 30);
    ring.setPosition(targetX, targetY);

    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 3,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });

    // Ice shards
    const numShards = 18;
    for (let i = 0; i < numShards; i++) {
      const angle = (i / numShards) * Math.PI * 2;
      const radius = 100 + Math.random() * 60;
      const x = targetX + Math.cos(angle) * radius;
      const y = targetY + Math.sin(angle) * radius;

      const shard = this.add.graphics();
      shard.fillStyle(0x88ddff, 1);
      // Diamond shape
      shard.fillTriangle(0, -15, 5, 0, 0, 15);
      shard.fillTriangle(0, -15, -5, 0, 0, 15);
      shard.setPosition(targetX, targetY);
      shard.setRotation(angle);

      this.tweens.add({
        targets: shard,
        x, y,
        alpha: 0,
        rotation: angle + Math.PI,
        duration: 500 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy(),
      });
    }

    // Snowflakes (simple cross pattern)
    for (let i = 0; i < 10; i++) {
      const flake = this.add.graphics();
      flake.fillStyle(0xffffff, 0.8);
      // Cross pattern for snowflake
      flake.fillRect(-1, -6, 2, 12);
      flake.fillRect(-6, -1, 12, 2);
      flake.fillCircle(0, 0, 3);
      flake.setPosition(
        targetX + Phaser.Math.Between(-60, 60),
        targetY + Phaser.Math.Between(-60, 60)
      );
      flake.setScale(0.5 + Math.random() * 0.5);

      this.tweens.add({
        targets: flake,
        y: flake.y + 100,
        alpha: 0,
        rotation: Math.PI * 2,
        duration: 1000,
        onComplete: () => flake.destroy(),
      });
    }

    // Ice tint on boss
    this.bossSprite.setTint(0x88ddff);
    this.time.delayedCall(200, () => this.bossSprite?.clearTint());
  }

  private playLightningEffect(targetX: number, targetY: number) {
    // Multiple lightning bolts
    for (let bolt = 0; bolt < 4; bolt++) {
      const offsetX = (bolt - 1.5) * 35;

      this.time.delayedCall(bolt * 60, () => {
        const lightning = this.add.graphics();
        lightning.lineStyle(5, 0xffff44, 1);

        const segments = 10;
        const startY = -50;
        const segmentHeight = (targetY - startY) / segments;

        lightning.beginPath();
        lightning.moveTo(targetX + offsetX + Phaser.Math.Between(-20, 20), startY);

        let currentX = targetX + offsetX;
        for (let i = 1; i <= segments; i++) {
          currentX += Phaser.Math.Between(-25, 25);
          lightning.lineTo(currentX, startY + i * segmentHeight);
        }
        lightning.strokePath();

        // Glow
        const glow = this.add.graphics();
        glow.lineStyle(20, 0xffff88, 0.4);
        glow.beginPath();
        glow.moveTo(targetX + offsetX, startY);
        currentX = targetX + offsetX;
        for (let i = 1; i <= segments; i++) {
          currentX += Phaser.Math.Between(-25, 25);
          glow.lineTo(currentX, startY + i * segmentHeight);
        }
        glow.strokePath();

        this.tweens.add({
          targets: [lightning, glow],
          alpha: 0,
          duration: 150,
          onComplete: () => {
            lightning.destroy();
            glow.destroy();
          },
        });
      });
    }

    // Electric sparks at impact
    for (let i = 0; i < 16; i++) {
      const spark = this.add.graphics();
      spark.fillStyle(0xffff00, 1);
      spark.fillCircle(0, 0, 3 + Math.random() * 4);
      spark.setPosition(targetX, targetY);

      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 80;

      this.tweens.add({
        targets: spark,
        x: targetX + Math.cos(angle) * dist,
        y: targetY + Math.sin(angle) * dist,
        alpha: 0,
        duration: 250 + Math.random() * 150,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }

    // Impact flash
    const flash = this.add.graphics();
    flash.fillStyle(0xffffaa, 0.8);
    flash.fillCircle(0, 0, 50);
    flash.setPosition(targetX, targetY);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      scale: 2.5,
      duration: 200,
      onComplete: () => flash.destroy(),
    });

    // Lightning tint on boss + shake
    this.bossSprite.setTint(0xffff88);
    this.time.delayedCall(150, () => this.bossSprite?.clearTint());
    this.cameras.main.shake(180, 0.02);
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
    // Slightly smaller scale to fit better
    const scaleFit = Math.min((width * 0.55) / imgWidth, (height * 0.40) / imgHeight);
    this.bossSprite.setScale(scaleFit);
    this.originalBossScale = scaleFit;
    this.originalBossX = this.bossSprite.x;
    this.originalBossY = this.bossSprite.y;
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const { width, height } = gameSize;
    // Keep boss at 55% from top
    this.originalBossX = width / 2;
    this.originalBossY = height * 0.55;
    this.bossSprite?.setPosition(this.originalBossX, this.originalBossY);
    this.updateBossScale();
  }

  // ─────────────────────────────────────────────────────────
  // BOSS VISIBILITY
  // ─────────────────────────────────────────────────────────

  setBossVisible(visible: boolean) {
    if (this.bossSprite) {
      this.bossSprite.setVisible(visible);
    }
  }

  update() {
    // No UI updates needed - all handled by React
  }
}
