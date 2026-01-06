import Phaser from 'phaser';
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
  exhaustedUntil: number | null;
  sessionDamage: number;
}

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
    stamina: 30,
    maxStamina: 30,
    staminaRegen: 1,  // 1 per second default
    exhaustedUntil: null,
    sessionDamage: 0,
  };

  // Stamina regen timer
  private lastStaminaUpdate = 0;

  // UI elements
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpBarBg!: Phaser.GameObjects.Graphics;
  private staminaBar!: Phaser.GameObjects.Graphics;
  private staminaBarBg!: Phaser.GameObjects.Graphics;
  private bossNameText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private staminaText!: Phaser.GameObjects.Text;
  private exhaustedText!: Phaser.GameObjects.Text;

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
    // Load boss sprite
    this.load.image('boss', '/assets/bosses/boss_single.png');

    // Load spark/hit effect
    this.load.image('spark', '/assets/effects/spark.png');
  }

  create() {
    const { width, height } = this.scale;

    // Background gradient
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x2a313b, 0x2a313b, 0x0e141b, 0x0e141b, 1);
    bg.fillRect(0, 0, width, height);

    // Boss sprite (centered, scaled to fit screen)
    this.bossSprite = this.add.sprite(width / 2, height / 2, 'boss');
    this.bossSprite.setInteractive();
    this.updateBossScale();

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
    const { width } = this.scale;
    const barWidth = width - 40;
    const barHeight = 16;

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

    // Stamina Bar (bottom)
    const { height } = this.scale;
    const staminaY = height - 60;

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

  private updateHpBar() {
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
    this.hpText.setText(`${this.bossState.hp.toLocaleString()} / ${this.bossState.maxHp.toLocaleString()}`);
  }

  private updateStaminaBar() {
    const { width, height } = this.scale;
    const barWidth = width - 40;
    const barHeight = 16;
    const staminaY = height - 60;
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
      this.bossNameText?.setText(data.name);
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

    // Stamina bar
    const staminaY = height - 60;
    this.staminaBarBg?.clear();
    this.staminaBarBg?.fillStyle(0x000000, 0.5);
    this.staminaBarBg?.fillRoundedRect(20, staminaY, width - 40, 16, 8);

    this.updateStaminaBar();
    this.staminaText?.setPosition(20, staminaY - 20);

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
  }
}
