import * as Phaser from 'phaser';
import { Socket } from 'socket.io-client';

// ═══════════════════════════════════════════════════════════
// BATTLE SCENE - L2-style combat with Phaser
// ═══════════════════════════════════════════════════════════

interface BossState {
  id: string;
  name: string;
  title?: string;
  hp: number;
  maxHp: number;
  defense: number;
  thornsDamage: number;
  ragePhase: number;
  playersOnline: number;
  icon?: string;
}

interface PlayerState {
  stamina: number;
  maxStamina: number;
  staminaRegen: number;  // per second
  mana: number;
  maxMana: number;
  manaRegen: number;  // per second
  exhaustedUntil: number | null;
  sessionDamage: number;
}

interface DamageFeedItem {
  playerName: string;
  damage: number;
  isCrit: boolean;
  timestamp: number;
}

interface Skill {
  id: string;
  name: string;
  icon: string;
  manaCost: number;
  cooldown: number;  // ms
  lastUsed: number;
  color: number;
}

// Storage key for persisting cooldowns across tab switches
const COOLDOWNS_STORAGE_KEY = 'battle_skill_cooldowns';

export class BattleScene extends Phaser.Scene {
  private socket: Socket | null = null;

  // Boss
  private bossSprite!: Phaser.GameObjects.Sprite;
  private bossState: BossState = {
    id: '',
    name: 'Loading...',
    hp: 1_000_000,
    maxHp: 1_000_000,
    defense: 0,
    thornsDamage: 0,
    ragePhase: 0,
    playersOnline: 0,
  };

  // Player
  private playerState: PlayerState = {
    stamina: 100,
    maxStamina: 100,
    staminaRegen: 1,
    mana: 1000,
    maxMana: 1000,
    manaRegen: 5,  // 5 per second default
    exhaustedUntil: null,
    sessionDamage: 0,
  };

  // Regen timers
  private lastStaminaUpdate = 0;
  private lastManaUpdate = 0;

  // Damage feed
  private damageFeed: DamageFeedItem[] = [];
  private damageFeedTexts: Phaser.GameObjects.Text[] = [];

  // Skills
  private skills: Skill[] = [
    { id: 'fireball', name: 'Fireball', icon: '🔥', manaCost: 100, cooldown: 10000, lastUsed: 0, color: 0xff6600 },
    { id: 'iceball', name: 'Ice Ball', icon: '❄️', manaCost: 100, cooldown: 10000, lastUsed: 0, color: 0x00ccff },
    { id: 'lightning', name: 'Lightning', icon: '⚡', manaCost: 100, cooldown: 10000, lastUsed: 0, color: 0xffff00 },
  ];
  private skillButtons: Phaser.GameObjects.Container[] = [];

  // UI elements
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpBarBg!: Phaser.GameObjects.Graphics;
  private staminaBar!: Phaser.GameObjects.Graphics;
  private staminaBarBg!: Phaser.GameObjects.Graphics;
  private manaBar!: Phaser.GameObjects.Graphics;
  private manaBarBg!: Phaser.GameObjects.Graphics;
  private bossNameText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private staminaText!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private exhaustedText!: Phaser.GameObjects.Text;
  private onlineText!: Phaser.GameObjects.Text;

  // Damage numbers pool
  private damageTexts: Phaser.GameObjects.Text[] = [];

  // Tap batching
  private tapQueue = 0;
  private lastTapTime = 0;

  // Animation state
  private isHit = false;
  private hitTime = 0;

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: { socket?: Socket }) {
    if (data.socket) {
      this.socket = data.socket;
      this.setupSocketListeners();
    }
  }

  preload() {
    // Load boss sprite (only if not already cached)
    if (!this.textures.exists('boss')) {
      this.load.image('boss', '/assets/bosses/boss_single.png');
    }
  }

  create() {
    const { width, height } = this.scale;

    // Restore skill cooldowns from storage
    this.restoreCooldowns();

    // Background gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a313b, 0x2a313b, 0x0e141b, 0x0e141b, 1);
    bg.fillRect(0, 0, width, height);

    // Boss sprite (centered, scaled to fit screen)
    this.bossSprite = this.add.sprite(width / 2, height / 2, 'boss');
    this.bossSprite.setInteractive();
    this.updateBossScale();

    // Fix: Recalculate boss scale after a short delay to handle race conditions
    this.time.delayedCall(100, () => {
      this.updateBossScale();
    });

    // Tap handler
    this.bossSprite.on('pointerdown', () => {
      this.handleTap();
    });

    // Also handle taps on background
    this.input.on('pointerdown', () => {
      this.handleTap();
    });

    // Create UI
    this.createUI();

    // Tap flush timer (every 100ms)
    this.time.addEvent({
      delay: 100,
      callback: this.flushTaps,
      callbackScope: this,
      loop: true,
    });

    // Resize handler
    this.scale.on('resize', this.handleResize, this);
  }

  private createUI() {
    const { width, height } = this.scale;
    const barWidth = width - 40;
    const barHeight = 16;

    // Online indicator (top right)
    this.onlineText = this.add.text(width - 20, 20, '', {
      fontFamily: 'system-ui',
      fontSize: '12px',
      color: '#9ca3af',
    }).setOrigin(1, 0);
    this.updateOnlineText();

    // HP Bar background
    this.hpBarBg = this.add.graphics();
    this.hpBarBg.fillStyle(0x000000, 0.5);
    this.hpBarBg.fillRoundedRect(20, 80, barWidth, barHeight, 8);

    // HP Bar
    this.hpBar = this.add.graphics();
    this.updateHpBar();

    // Boss name
    this.bossNameText = this.add.text(20, 50, this.bossState.name, {
      fontFamily: 'system-ui',
      fontSize: '18px',
      color: '#d4af37',
      fontStyle: 'bold',
    });

    // HP text
    this.hpText = this.add.text(width - 20, 50, '', {
      fontFamily: 'system-ui',
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(1, 0);
    this.updateHpText();

    // Damage feed (top right, below online)
    this.createDamageFeed();

    // === Bottom UI ===
    const skillBarHeight = 60;
    const manaY = height - 140;
    const staminaY = height - 100;

    // Mana Bar
    this.manaBarBg = this.add.graphics();
    this.manaBarBg.fillStyle(0x000000, 0.5);
    this.manaBarBg.fillRoundedRect(20, manaY, barWidth, barHeight, 8);

    this.manaBar = this.add.graphics();
    this.updateManaBar();

    // Mana text
    this.manaText = this.add.text(20, manaY - 20, '', {
      fontFamily: 'system-ui',
      fontSize: '12px',
      color: '#3b82f6',
    });

    // Stamina Bar
    this.staminaBarBg = this.add.graphics();
    this.staminaBarBg.fillStyle(0x000000, 0.5);
    this.staminaBarBg.fillRoundedRect(20, staminaY, barWidth, barHeight, 8);

    this.staminaBar = this.add.graphics();
    this.updateStaminaBar();

    // Stamina text
    this.staminaText = this.add.text(20, staminaY - 20, 'Stamina', {
      fontFamily: 'system-ui',
      fontSize: '12px',
      color: '#22c55e',
    });

    // Skill buttons
    this.createSkillButtons();

    // Exhausted overlay text (hidden by default)
    this.exhaustedText = this.add.text(width / 2, height / 2 + 150, 'EXHAUSTED!', {
      fontFamily: 'system-ui',
      fontSize: '32px',
      color: '#ef4444',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false);
  }

  private createDamageFeed() {
    const { width } = this.scale;
    // Create 5 text slots for damage feed
    for (let i = 0; i < 5; i++) {
      const text = this.add.text(width - 20, 45 + i * 18, '', {
        fontFamily: 'system-ui',
        fontSize: '11px',
        color: '#9ca3af',
      }).setOrigin(1, 0).setAlpha(1 - i * 0.15);
      this.damageFeedTexts.push(text);
    }
  }

  private updateDamageFeed() {
    if (!this.damageFeedTexts || this.damageFeedTexts.length === 0) return;  // Guard against early calls
    for (let i = 0; i < this.damageFeedTexts.length; i++) {
      const item = this.damageFeed[i];
      if (item) {
        const color = item.isCrit ? '#ef4444' : '#d1d5db';
        this.damageFeedTexts[i].setText(`${item.playerName}: -${item.damage.toLocaleString()}`);
        this.damageFeedTexts[i].setColor(color);
      } else {
        this.damageFeedTexts[i].setText('');
      }
    }
  }

  private createSkillButtons() {
    const { width, height } = this.scale;
    const buttonSize = 50;
    const gap = 15;
    const totalWidth = this.skills.length * buttonSize + (this.skills.length - 1) * gap;
    const startX = (width - totalWidth) / 2;
    const y = height - 45;

    this.skills.forEach((skill, index) => {
      const x = startX + index * (buttonSize + gap) + buttonSize / 2;
      const container = this.add.container(x, y);

      // Background
      const bg = this.add.graphics();
      bg.fillStyle(0x1f2937, 0.9);
      bg.fillRoundedRect(-buttonSize / 2, -buttonSize / 2, buttonSize, buttonSize, 8);
      bg.lineStyle(2, skill.color, 1);
      bg.strokeRoundedRect(-buttonSize / 2, -buttonSize / 2, buttonSize, buttonSize, 8);

      // Icon
      const icon = this.add.text(0, -5, skill.icon, {
        fontSize: '24px',
      }).setOrigin(0.5);

      // Cooldown overlay
      const cooldownOverlay = this.add.graphics();
      cooldownOverlay.setName('cooldown');

      // Cooldown text
      const cooldownText = this.add.text(0, 10, '', {
        fontFamily: 'system-ui',
        fontSize: '10px',
        color: '#ffffff',
      }).setOrigin(0.5).setName('cdText');

      container.add([bg, cooldownOverlay, icon, cooldownText]);
      container.setSize(buttonSize, buttonSize);
      container.setInteractive();

      container.on('pointerdown', () => {
        this.useSkill(skill);
      });

      this.skillButtons.push(container);
    });
  }

  private updateOnlineText() {
    if (!this.onlineText) return;  // Guard against early calls before create()
    const count = this.bossState.playersOnline || 0;
    this.onlineText.setText(`🟢 ${count} online`);
  }

  // Save cooldowns to sessionStorage so they persist across tab switches
  private saveCooldowns() {
    try {
      const cooldowns: Record<string, number> = {};
      this.skills.forEach(skill => {
        cooldowns[skill.id] = skill.lastUsed;
      });
      sessionStorage.setItem(COOLDOWNS_STORAGE_KEY, JSON.stringify(cooldowns));
    } catch (e) {
      // Ignore storage errors
    }
  }

  // Restore cooldowns from sessionStorage
  private restoreCooldowns() {
    try {
      const stored = sessionStorage.getItem(COOLDOWNS_STORAGE_KEY);
      if (stored) {
        const cooldowns = JSON.parse(stored) as Record<string, number>;
        this.skills.forEach(skill => {
          if (cooldowns[skill.id]) {
            skill.lastUsed = cooldowns[skill.id];
          }
        });
      }
    } catch (e) {
      // Ignore storage errors
    }
  }

  private updateManaBar() {
    if (!this.manaBar) return;  // Guard against early calls before create()

    const { width, height } = this.scale;
    const barWidth = width - 40;
    const barHeight = 16;
    const manaY = height - 140;
    const manaPercent = this.playerState.mana / this.playerState.maxMana;

    this.manaBar.clear();
    this.manaBar.fillStyle(0x3b82f6, 1); // Blue
    this.manaBar.fillRoundedRect(20, manaY, barWidth * manaPercent, barHeight, 8);

    // Update mana text
    if (this.manaText) {
      const current = Math.floor(this.playerState.mana);
      const max = this.playerState.maxMana;
      this.manaText.setText(`💧 ${current} / ${max}`);
    }
  }

  private useSkill(skill: Skill) {
    const now = Date.now();

    // Check cooldown
    if (now - skill.lastUsed < skill.cooldown) return;

    // Check mana
    if (this.playerState.mana < skill.manaCost) return;

    // Check boss alive
    if (this.bossState.hp <= 0) return;

    // Use skill
    skill.lastUsed = now;
    this.playerState.mana -= skill.manaCost;
    this.updateManaBar();

    // Save cooldowns to persist across tab switches
    this.saveCooldowns();

    // Emit skill to server
    if (this.socket) {
      this.socket.emit('skill:use', { skillId: skill.id });
    }

    // Play visual effect
    this.playSkillEffect(skill);
  }

  private playSkillEffect(skill: Skill) {
    const { width, height } = this.scale;
    const bossX = width / 2;
    const bossY = height / 2;

    switch (skill.id) {
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

    // Boss hit animation
    this.playHitAnimation();
  }

  private playFireballEffect(targetX: number, targetY: number) {
    // Create fireball particles
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
        x: x,
        y: y,
        alpha: 0,
        scale: 0.2,
        duration: 400 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }

    // Center flash
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

    // Camera shake
    this.cameras.main.shake(200, 0.01);
  }

  private playIceballEffect(targetX: number, targetY: number) {
    // Create ice shards
    const numShards = 15;
    for (let i = 0; i < numShards; i++) {
      const angle = (i / numShards) * Math.PI * 2;
      const radius = 80 + Math.random() * 50;
      const x = targetX + Math.cos(angle) * radius;
      const y = targetY + Math.sin(angle) * radius;

      const shard = this.add.graphics();
      shard.fillStyle(0x00ccff, 1);
      // Diamond shape
      shard.fillTriangle(0, -12, 6, 0, 0, 12);
      shard.fillTriangle(0, -12, -6, 0, 0, 12);
      shard.setPosition(targetX, targetY);
      shard.setRotation(angle);

      this.tweens.add({
        targets: shard,
        x: x,
        y: y,
        alpha: 0,
        duration: 500 + Math.random() * 200,
        ease: 'Power2',
        onComplete: () => shard.destroy(),
      });
    }

    // Center frost
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

    // Blue tint flash
    this.cameras.main.flash(150, 100, 200, 255, false);
  }

  private playLightningEffect(targetX: number, targetY: number) {
    const { height } = this.scale;

    // Multiple lightning bolts
    for (let bolt = 0; bolt < 3; bolt++) {
      const offsetX = (bolt - 1) * 40;
      const lightning = this.add.graphics();
      lightning.lineStyle(4, 0xffff00, 1);

      // Draw jagged lightning from top to boss
      const startY = 0;
      const segments = 8;
      const segmentHeight = targetY / segments;

      lightning.beginPath();
      lightning.moveTo(targetX + offsetX, startY);

      let currentX = targetX + offsetX;
      for (let i = 1; i < segments; i++) {
        currentX += Phaser.Math.Between(-30, 30);
        lightning.lineTo(currentX, i * segmentHeight);
      }
      lightning.lineTo(targetX + offsetX, targetY);
      lightning.strokePath();

      // Glow effect
      const glow = this.add.graphics();
      glow.lineStyle(12, 0xffff88, 0.3);
      glow.beginPath();
      glow.moveTo(targetX + offsetX, startY);
      currentX = targetX + offsetX;
      for (let i = 1; i < segments; i++) {
        currentX += Phaser.Math.Between(-30, 30);
        glow.lineTo(currentX, i * segmentHeight);
      }
      glow.lineTo(targetX + offsetX, targetY);
      glow.strokePath();

      // Fade out
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

    // Impact sparks
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

    // Yellow flash
    this.cameras.main.flash(100, 255, 255, 100, false);
    this.cameras.main.shake(150, 0.015);
  }

  private updateSkillCooldowns() {
    const now = Date.now();

    this.skills.forEach((skill, index) => {
      const button = this.skillButtons[index];
      if (!button) return;

      const cooldownOverlay = button.getByName('cooldown') as Phaser.GameObjects.Graphics;
      const cooldownText = button.getByName('cdText') as Phaser.GameObjects.Text;

      if (!cooldownOverlay || !cooldownText) return;

      const elapsed = now - skill.lastUsed;
      const remaining = skill.cooldown - elapsed;

      if (remaining > 0) {
        // Show cooldown overlay
        const progress = remaining / skill.cooldown;
        cooldownOverlay.clear();
        cooldownOverlay.fillStyle(0x000000, 0.7);
        cooldownOverlay.fillRoundedRect(-25, -25, 50, 50 * progress, 8);

        // Show seconds remaining
        cooldownText.setText(Math.ceil(remaining / 1000).toString());
        cooldownText.setVisible(true);
      } else {
        cooldownOverlay.clear();
        cooldownText.setVisible(false);
      }

      // Check if can use (has mana)
      const canUse = this.playerState.mana >= skill.manaCost && remaining <= 0;
      button.setAlpha(canUse ? 1 : 0.5);
    });
  }

  private updateHpBar() {
    if (!this.hpBar) return;  // Guard against early calls before create()

    const { width } = this.scale;
    const barWidth = width - 40;
    const barHeight = 16;
    const hpPercent = this.bossState.hp / this.bossState.maxHp;

    this.hpBar.clear();

    // Color based on HP
    let color = 0x22c55e; // Green
    if (hpPercent <= 0.25) color = 0xef4444; // Red
    else if (hpPercent <= 0.5) color = 0xf97316; // Orange
    else if (hpPercent <= 0.75) color = 0xeab308; // Yellow

    this.hpBar.fillStyle(color, 1);
    this.hpBar.fillRoundedRect(20, 80, barWidth * hpPercent, barHeight, 8);
  }

  private updateHpText() {
    if (!this.hpText) return;  // Guard against early calls before create()
    this.hpText.setText(`${this.bossState.hp.toLocaleString()} / ${this.bossState.maxHp.toLocaleString()}`);
  }

  private updateStaminaBar() {
    if (!this.staminaBar) return;  // Guard against early calls before create()

    const { width, height } = this.scale;
    const barWidth = width - 40;
    const barHeight = 16;
    const staminaY = height - 100;
    const staminaPercent = this.playerState.stamina / this.playerState.maxStamina;

    this.staminaBar.clear();

    const isExhausted = this.isExhausted();
    let color = isExhausted ? 0xef4444 : 0x22c55e; // Red if exhausted, green otherwise
    if (!isExhausted && staminaPercent <= 0.25) color = 0xf97316; // Orange when low

    this.staminaBar.fillStyle(color, 1);
    this.staminaBar.fillRoundedRect(20, staminaY, barWidth * staminaPercent, barHeight, 8);

    // Update stamina text with current/max values
    if (this.staminaText) {
      const current = Math.floor(this.playerState.stamina);
      const max = this.playerState.maxStamina;
      if (isExhausted) {
        this.staminaText.setText('EXHAUSTED');
        this.staminaText.setColor('#ef4444');
      } else {
        this.staminaText.setText(`⚡ ${current} / ${max}`);
        this.staminaText.setColor('#22c55e');
      }
    }
  }

  private isExhausted(): boolean {
    return this.playerState.exhaustedUntil !== null && Date.now() < this.playerState.exhaustedUntil;
  }

  private handleTap() {
    if (this.bossState.hp <= 0) return;
    if (this.isExhausted()) return;
    if (this.playerState.stamina <= 0) return;

    // Queue tap
    this.tapQueue++;
    this.lastTapTime = Date.now();

    // Optimistic stamina update
    this.playerState.stamina = Math.max(0, this.playerState.stamina - 1);
    this.updateStaminaBar();

    // Hit animation
    this.playHitAnimation();
  }

  private flushTaps() {
    if (this.tapQueue > 0 && this.socket) {
      this.socket.emit('tap:batch', { count: this.tapQueue });
      this.tapQueue = 0;
    }
  }

  private playHitAnimation() {
    // Shake boss
    this.tweens.add({
      targets: this.bossSprite,
      x: this.bossSprite.x + Phaser.Math.Between(-8, 8),
      y: this.bossSprite.y + Phaser.Math.Between(-5, 5),
      duration: 50,
      yoyo: true,
      repeat: 2,
    });

    // Scale punch
    this.tweens.add({
      targets: this.bossSprite,
      scaleX: this.bossSprite.scaleX * 1.05,
      scaleY: this.bossSprite.scaleY * 1.05,
      duration: 100,
      yoyo: true,
    });

    // Flash effect
    this.cameras.main.flash(80, 255, 255, 255, false, (cam: Phaser.Cameras.Scene2D.Camera, progress: number) => {
      cam.setAlpha(1 - progress * 0.3);
    });
  }

  private showDamageNumber(damage: number, isCrit: boolean) {
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

    // Float up and fade
    this.tweens.add({
      targets: text,
      y: y - 80,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => {
        text.destroy();
      },
    });
  }

  private showExhaustedOverlay(show: boolean) {
    this.exhaustedText.setVisible(show);
    if (show) {
      this.tweens.add({
        targets: this.exhaustedText,
        alpha: { from: 1, to: 0.5 },
        duration: 500,
        yoyo: true,
        repeat: -1,
      });
    }
  }

  private setupSocketListeners() {
    if (!this.socket) return;

    this.socket.on('boss:state', (data: BossState) => {
      this.bossState = data;
      this.updateHpBar();
      this.updateHpText();
      this.updateOnlineText();
      this.bossNameText?.setText(data.name);
    });

    // Damage feed from all players
    this.socket.on('damage:feed', (data: { playerName: string; damage: number; isCrit: boolean }) => {
      this.damageFeed.unshift({
        playerName: data.playerName,
        damage: data.damage,
        isCrit: data.isCrit,
        timestamp: Date.now(),
      });
      // Keep only last 5 items
      if (this.damageFeed.length > 5) {
        this.damageFeed.pop();
      }
      this.updateDamageFeed();
    });

    this.socket.on('tap:result', (data: {
      damage: number;
      crits: number;
      stamina?: number;
      maxStamina?: number;
      staminaRegen?: number;
    }) => {
      this.showDamageNumber(data.damage, data.crits > 0);
      if (data.stamina !== undefined) {
        this.playerState.stamina = data.stamina;
        this.lastStaminaUpdate = 0; // Reset regen timer on server update
        this.updateStaminaBar();
      }
      if (data.maxStamina !== undefined) {
        this.playerState.maxStamina = data.maxStamina;
      }
      if (data.staminaRegen !== undefined) {
        this.playerState.staminaRegen = data.staminaRegen;
      }
    });

    this.socket.on('hero:exhausted', (data: { until: number; duration: number }) => {
      this.playerState.exhaustedUntil = data.until;
      this.playerState.stamina = 0;
      this.showExhaustedOverlay(true);
      this.updateStaminaBar();

      // Auto-clear
      this.time.delayedCall(data.duration, () => {
        this.playerState.exhaustedUntil = null;
        this.showExhaustedOverlay(false);
        this.updateStaminaBar();
      });
    });

    this.socket.on('player:state', (data: {
      stamina?: number;
      maxStamina?: number;
      staminaRegen?: number;
      exhaustedUntil?: number | null;
    }) => {
      if (data.stamina !== undefined) {
        this.playerState.stamina = data.stamina;
        this.lastStaminaUpdate = 0; // Reset regen timer
      }
      if (data.maxStamina !== undefined) this.playerState.maxStamina = data.maxStamina;
      if (data.staminaRegen !== undefined) this.playerState.staminaRegen = data.staminaRegen;
      if (data.exhaustedUntil !== undefined) this.playerState.exhaustedUntil = data.exhaustedUntil;
      this.updateStaminaBar();
    });
  }

  private updateBossScale() {
    if (!this.bossSprite) return;
    const { width, height } = this.scale;
    const imgWidth = this.bossSprite.width;
    const imgHeight = this.bossSprite.height;
    // Scale to fit: 62% of width, 50% of height (leave room for UI)
    const scaleFit = Math.min((width * 0.62) / imgWidth, (height * 0.50) / imgHeight);
    this.bossSprite.setScale(scaleFit);
  }

  private handleResize(gameSize: Phaser.Structs.Size) {
    const { width, height } = gameSize;

    // Reposition and rescale boss
    this.bossSprite?.setPosition(width / 2, height / 2);
    this.updateBossScale();

    // Recreate UI elements with new dimensions
    this.hpBarBg?.clear();
    this.hpBarBg?.fillStyle(0x000000, 0.5);
    this.hpBarBg?.fillRoundedRect(20, 80, width - 40, 16, 8);

    this.updateHpBar();
    this.hpText?.setPosition(width - 20, 50);

    // Online indicator
    this.onlineText?.setPosition(width - 20, 20);

    // Damage feed
    this.damageFeedTexts.forEach((text, i) => {
      text.setPosition(width - 20, 45 + i * 18);
    });

    // Mana bar
    const manaY = height - 140;
    this.manaBarBg?.clear();
    this.manaBarBg?.fillStyle(0x000000, 0.5);
    this.manaBarBg?.fillRoundedRect(20, manaY, width - 40, 16, 8);
    this.updateManaBar();
    this.manaText?.setPosition(20, manaY - 20);

    // Stamina bar
    const staminaY = height - 100;
    this.staminaBarBg?.clear();
    this.staminaBarBg?.fillStyle(0x000000, 0.5);
    this.staminaBarBg?.fillRoundedRect(20, staminaY, width - 40, 16, 8);

    this.updateStaminaBar();
    this.staminaText?.setPosition(20, staminaY - 20);

    // Skill buttons
    const buttonSize = 50;
    const gap = 15;
    const totalWidth = this.skills.length * buttonSize + (this.skills.length - 1) * gap;
    const startX = (width - totalWidth) / 2;
    const skillY = height - 45;

    this.skillButtons.forEach((button, index) => {
      const x = startX + index * (buttonSize + gap) + buttonSize / 2;
      button.setPosition(x, skillY);
    });

    // Exhausted text
    this.exhaustedText?.setPosition(width / 2, height / 2 + 150);
  }

  update(time: number, delta: number) {
    // Stamina regen simulation (visual only, server is authoritative)
    const isExhausted = this.playerState.exhaustedUntil !== null &&
                        Date.now() < this.playerState.exhaustedUntil;

    // Only regen if not exhausted and not at max
    if (!isExhausted && this.playerState.stamina < this.playerState.maxStamina) {
      // Accumulate time (delta is in ms)
      this.lastStaminaUpdate += delta;

      // Regen rate per second, so check every 1000ms / regenRate
      const msPerRegen = 1000 / this.playerState.staminaRegen;

      if (this.lastStaminaUpdate >= msPerRegen) {
        // Add stamina (fractional for smooth bar)
        const regenAmount = Math.floor(this.lastStaminaUpdate / msPerRegen);
        this.playerState.stamina = Math.min(
          this.playerState.maxStamina,
          this.playerState.stamina + regenAmount
        );
        this.lastStaminaUpdate = this.lastStaminaUpdate % msPerRegen;
        this.updateStaminaBar();
      }
    }

    // Mana regen simulation (visual only, server is authoritative)
    if (this.playerState.mana < this.playerState.maxMana) {
      this.lastManaUpdate += delta;

      const msPerManaRegen = 1000 / this.playerState.manaRegen;

      if (this.lastManaUpdate >= msPerManaRegen) {
        const regenAmount = Math.floor(this.lastManaUpdate / msPerManaRegen);
        this.playerState.mana = Math.min(
          this.playerState.maxMana,
          this.playerState.mana + regenAmount
        );
        this.lastManaUpdate = this.lastManaUpdate % msPerManaRegen;
        this.updateManaBar();
      }
    }

    // Update skill cooldowns display
    this.updateSkillCooldowns();
  }
}
