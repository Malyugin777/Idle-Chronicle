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

  // FPS throttle - render only every 33ms (30 FPS)
  private lastRenderTime = 0;
  private readonly TARGET_FRAME_TIME = 1000 / 30; // 33.33ms for 30 FPS

  // Manual loop interval ID (to clean up on destroy)
  private loopIntervalId: ReturnType<typeof setInterval> | null = null;

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

    // ═══════════════════════════════════════════════════════════
    // FPS LIMIT - Step mode для точного контроля
    // ═══════════════════════════════════════════════════════════
    // CLEANUP: Clear any existing interval from previous scene instance
    if (this.loopIntervalId) {
      clearInterval(this.loopIntervalId);
      this.loopIntervalId = null;
    }

    // Отключаем автоматический loop
    this.game.loop.stop();

    // Ручной step каждые 33ms (30 FPS)
    this.loopIntervalId = setInterval(() => {
      if (this.game && this.game.loop) {
        this.game.loop.tick();  // Один тик = один кадр
      }
    }, 1000 / 30);

    // Cleanup on scene shutdown/destroy
    this.events.once('shutdown', () => {
      if (this.loopIntervalId) {
        clearInterval(this.loopIntervalId);
        this.loopIntervalId = null;
      }
    });
    this.events.once('destroy', () => {
      if (this.loopIntervalId) {
        clearInterval(this.loopIntervalId);
        this.loopIntervalId = null;
      }
    });

    // Transparent background (React handles the gradient)
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)');

    // Boss sprite - positioned LOWER (60% from top) - closer to skill bar
    const bossY = height * 0.60;
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
  // HIT EFFECTS (ULTRA REALISTIC)
  // ─────────────────────────────────────────────────────────

  playHitAnimation() {
    const now = Date.now();
    if (now - this.lastHitTime < 80) return;
    this.lastHitTime = now;

    if (!this.bossSprite) return;

    this.tweens.killTweensOf(this.bossSprite);
    this.bossSprite.setPosition(this.originalBossX, this.originalBossY);
    this.bossSprite.setScale(this.originalBossScale);

    // Random hit position offset
    const hitOffsetX = Phaser.Math.Between(-40, 40);
    const hitOffsetY = Phaser.Math.Between(-50, 30);
    const hitX = this.originalBossX + hitOffsetX;
    const hitY = this.originalBossY + hitOffsetY;

    // Impact shake - aggressive
    const shakeIntensity = 15;
    this.tweens.add({
      targets: this.bossSprite,
      x: this.originalBossX + Phaser.Math.Between(-shakeIntensity, shakeIntensity),
      y: this.originalBossY + Phaser.Math.Between(-shakeIntensity/2, shakeIntensity/2),
      duration: 35,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.bossSprite?.setPosition(this.originalBossX, this.originalBossY);
      }
    });

    // Squash and stretch - cartoon impact
    this.tweens.add({
      targets: this.bossSprite,
      scaleX: this.originalBossScale * 1.12,
      scaleY: this.originalBossScale * 0.90,
      duration: 50,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.bossSprite?.setScale(this.originalBossScale);
      }
    });

    // Red damage tint
    this.bossSprite.setTint(0xff4444);
    this.time.delayedCall(50, () => {
      this.bossSprite?.setTint(0xff8888);
      this.time.delayedCall(30, () => {
        this.bossSprite?.clearTint();
      });
    });

    // === IMPACT SHOCKWAVE ===
    this.createShockwave(hitX, hitY);

    // === BLOOD/DAMAGE SPLATTER ===
    this.createBloodSplatter(hitX, hitY);

    // === SPARKS BURST ===
    this.createHitSparks(hitX, hitY);

    // === SLASH MARKS ===
    this.createSlashEffect(hitX, hitY);

    // === IMPACT FLASH ===
    this.createImpactFlash(hitX, hitY);

    // === DEBRIS PARTICLES ===
    this.createDebris(hitX, hitY);
  }

  private createShockwave(x: number, y: number) {
    // Inner ring
    const ring1 = this.add.graphics();
    ring1.lineStyle(3, 0xffffff, 0.8);
    ring1.strokeCircle(0, 0, 10);
    ring1.setPosition(x, y);

    this.tweens.add({
      targets: ring1,
      scale: 4,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => ring1.destroy(),
    });

    // Outer ring (delayed)
    this.time.delayedCall(50, () => {
      const ring2 = this.add.graphics();
      ring2.lineStyle(2, 0xffaa00, 0.5);
      ring2.strokeCircle(0, 0, 15);
      ring2.setPosition(x, y);

      this.tweens.add({
        targets: ring2,
        scale: 3,
        alpha: 0,
        duration: 250,
        ease: 'Cubic.easeOut',
        onComplete: () => ring2.destroy(),
      });
    });
  }

  private createBloodSplatter(x: number, y: number) {
    const numDrops = 6; // Reduced from 12 for GPU optimization
    for (let i = 0; i < numDrops; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 100;
      const size = 2 + Math.random() * 5;

      const drop = this.add.graphics();
      // Blood colors: dark red to bright red
      const bloodColors = [0xcc0000, 0xff0000, 0xaa0000, 0xff2222, 0x880000];
      drop.fillStyle(bloodColors[Math.floor(Math.random() * bloodColors.length)], 1);

      // Elongated drop shape
      drop.fillEllipse(0, 0, size, size * 1.5);
      drop.setPosition(x, y);
      drop.setRotation(angle);

      const targetX = x + Math.cos(angle) * speed;
      const targetY = y + Math.sin(angle) * speed + 20; // Gravity effect

      this.tweens.add({
        targets: drop,
        x: targetX,
        y: targetY,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.1,
        duration: 350 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => drop.destroy(),
      });
    }
  }

  private createHitSparks(x: number, y: number) {
    const numSparks = 8; // Reduced from 15 for GPU optimization
    for (let i = 0; i < numSparks; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 100;
      const size = 2 + Math.random() * 4;

      const spark = this.add.graphics();
      const colors = [0xffff00, 0xff8800, 0xffffff, 0xffcc00, 0xffee88];
      const color = colors[Math.floor(Math.random() * colors.length)];

      // Spark with trail effect
      spark.fillStyle(color, 1);
      spark.fillCircle(0, 0, size);
      spark.fillStyle(color, 0.5);
      spark.fillEllipse(-size, 0, size * 3, size * 0.8);
      spark.setPosition(x, y);
      spark.setRotation(angle);

      const targetX = x + Math.cos(angle) * speed;
      const targetY = y + Math.sin(angle) * speed;

      this.tweens.add({
        targets: spark,
        x: targetX,
        y: targetY,
        alpha: 0,
        scale: 0.1,
        duration: 200 + Math.random() * 150,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }
  }

  private createSlashEffect(x: number, y: number) {
    // Create 2-3 crossing slash marks
    const numSlashes = Phaser.Math.Between(2, 3);

    for (let s = 0; s < numSlashes; s++) {
      const slash = this.add.graphics();
      const angle = Phaser.Math.Between(-60, 60) * (Math.PI / 180);
      const length = 60 + Math.random() * 40;
      const offsetX = Phaser.Math.Between(-20, 20);
      const offsetY = Phaser.Math.Between(-20, 20);

      // Main slash line
      slash.lineStyle(3, 0xffffff, 0.95);
      slash.beginPath();
      slash.moveTo(-length/2, 0);
      slash.lineTo(length/2, 0);
      slash.strokePath();

      // Glow effect
      slash.lineStyle(10, 0xffffaa, 0.4);
      slash.beginPath();
      slash.moveTo(-length/2, 0);
      slash.lineTo(length/2, 0);
      slash.strokePath();

      // Core bright line
      slash.lineStyle(1, 0xffffff, 1);
      slash.beginPath();
      slash.moveTo(-length/2, 0);
      slash.lineTo(length/2, 0);
      slash.strokePath();

      slash.setPosition(x + offsetX, y + offsetY);
      slash.setRotation(angle);
      slash.setScale(0.3, 1);
      slash.setAlpha(0);

      // Animate in then out
      this.tweens.add({
        targets: slash,
        scaleX: 1.2,
        alpha: 1,
        duration: 60,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: slash,
            scaleX: 1.5,
            alpha: 0,
            duration: 150,
            ease: 'Cubic.easeIn',
            onComplete: () => slash.destroy(),
          });
        }
      });
    }
  }

  private createImpactFlash(x: number, y: number) {
    // Bright white flash
    const flash = this.add.graphics();
    flash.fillStyle(0xffffff, 0.9);
    flash.fillCircle(0, 0, 25);
    flash.setPosition(x, y);

    this.tweens.add({
      targets: flash,
      scale: 2.5,
      alpha: 0,
      duration: 120,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    // Orange core
    const core = this.add.graphics();
    core.fillStyle(0xff6600, 0.8);
    core.fillCircle(0, 0, 15);
    core.setPosition(x, y);

    this.tweens.add({
      targets: core,
      scale: 1.8,
      alpha: 0,
      duration: 180,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy(),
    });
  }

  private createDebris(x: number, y: number) {
    const numDebris = 4; // Reduced from 8 for GPU optimization
    for (let i = 0; i < numDebris; i++) {
      const debris = this.add.graphics();
      const size = 2 + Math.random() * 4;

      // Gray/brown debris colors
      const debrisColors = [0x666666, 0x888888, 0x554433, 0x776655, 0x444444];
      debris.fillStyle(debrisColors[Math.floor(Math.random() * debrisColors.length)], 1);

      // Simple triangle debris
      debris.fillTriangle(0, -size, size * 0.7, size * 0.5, -size * 0.7, size * 0.5);
      debris.setPosition(x, y);

      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      const targetX = x + Math.cos(angle) * speed;
      const targetY = y + Math.sin(angle) * speed + 30; // Gravity

      this.tweens.add({
        targets: debris,
        x: targetX,
        y: targetY,
        rotation: Math.random() * Math.PI * 4,
        alpha: 0,
        duration: 400 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => debris.destroy(),
      });
    }
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
    // BIGGER boss: 70% width, 50% height (was 55%, 40%)
    const scaleFit = Math.min((width * 0.70) / imgWidth, (height * 0.50) / imgHeight);
    this.bossSprite.setScale(scaleFit);
    this.originalBossScale = scaleFit;
    this.originalBossX = this.bossSprite.x;
    this.originalBossY = this.bossSprite.y;
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const { width, height } = gameSize;
    // Keep boss at 60% from top (lowered)
    this.originalBossX = width / 2;
    this.originalBossY = height * 0.60;
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

  update(time: number) {
    // ═══════════════════════════════════════════════════════════
    // FPS THROTTLE - Skip frames to limit to ~30 FPS
    // ═══════════════════════════════════════════════════════════
    const elapsed = time - this.lastRenderTime;
    if (elapsed < this.TARGET_FRAME_TIME) {
      // Skip this frame - not enough time passed
      // Pause rendering by making scene invisible temporarily
      return;
    }
    this.lastRenderTime = time;

    // Actual update logic (if any) goes here
  }
}
