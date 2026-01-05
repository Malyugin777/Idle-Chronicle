'use strict';

/**
 * Clicker UI - Main game interface
 * Dark Fantasy style matching Pocket Chronicles
 */

class ClickerScene extends Phaser.Scene {
    constructor() {
        super({ key: 'ClickerScene' });
    }

    create() {
        console.log('[ClickerScene] Creating UI...');

        // Background gradient
        this.createBackground();

        // Title
        this.createTitle();

        // Gold display
        this.createGoldDisplay();

        // Main click button
        this.createClickButton();

        // Stats display
        this.createStatsDisplay();

        // Upgrades panel
        this.createUpgradesPanel();

        // Auto-save timer
        this.time.addEvent({
            delay: 30000, // 30 seconds
            callback: () => saveGame(),
            loop: true
        });

        // Passive income tick
        this.time.addEvent({
            delay: 100, // 10 times per second
            callback: () => this.processTick(),
            loop: true
        });

        console.log('[ClickerScene] UI created');
    }

    createBackground() {
        const graphics = this.add.graphics();

        // Gradient background
        const gradientSteps = 20;
        for (let i = 0; i < gradientSteps; i++) {
            const t = i / gradientSteps;
            const color = Phaser.Display.Color.Interpolate.ColorWithColor(
                { r: 42, g: 49, b: 59 },   // Top: 0x2a313b
                { r: 14, g: 20, b: 27 },   // Bottom: 0x0e141b
                gradientSteps, i
            );
            const hexColor = Phaser.Display.Color.GetColor(color.r, color.g, color.b);

            graphics.fillStyle(hexColor);
            graphics.fillRect(0, (BASE_H / gradientSteps) * i, BASE_W, BASE_H / gradientSteps + 1);
        }
    }

    createTitle() {
        this.add.text(BASE_W / 2, 80, 'IDLE CHRONICLE', {
            fontFamily: FONTS.pixel,
            fontSize: '28px',
            color: COLORS.gold,
            stroke: COLORS.textShadow,
            strokeThickness: 4
        }).setOrigin(0.5);
    }

    createGoldDisplay() {
        // Gold icon placeholder (circle for now)
        this.add.circle(BASE_W / 2 - 120, 180, 30, COLORS.goldHex);

        // Gold amount text
        this.goldText = this.add.text(BASE_W / 2, 180, '0', {
            fontFamily: FONTS.pixel,
            fontSize: '36px',
            color: COLORS.gold,
            stroke: COLORS.textShadow,
            strokeThickness: 4
        }).setOrigin(0.5);

        // GPS text
        this.gpsText = this.add.text(BASE_W / 2, 230, '0 / sec', {
            fontFamily: FONTS.readable,
            fontSize: '18px',
            color: COLORS.white
        }).setOrigin(0.5);
    }

    createClickButton() {
        const btnY = 500;

        // Button background
        this.clickBtn = this.add.circle(BASE_W / 2, btnY, 120, COLORS.goldHex)
            .setInteractive({ useHandCursor: true });

        // Button border
        this.add.circle(BASE_W / 2, btnY, 125)
            .setStrokeStyle(4, 0xffffff, 0.5);

        // Button text
        this.clickBtnText = this.add.text(BASE_W / 2, btnY, 'CLICK\n+1', {
            fontFamily: FONTS.pixel,
            fontSize: '24px',
            color: '#000000',
            align: 'center'
        }).setOrigin(0.5);

        // Click handler
        this.clickBtn.on('pointerdown', () => this.onClickButton());

        // Visual feedback
        this.clickBtn.on('pointerover', () => {
            this.clickBtn.setScale(1.05);
        });
        this.clickBtn.on('pointerout', () => {
            this.clickBtn.setScale(1);
        });
    }

    onClickButton() {
        const earned = doClick();

        // Visual feedback - scale bounce
        this.tweens.add({
            targets: this.clickBtn,
            scale: 0.9,
            duration: 50,
            yoyo: true
        });

        // Floating text
        this.showFloatingText(`+${earned}`, BASE_W / 2, 380);

        // Update UI
        this.updateUI();
    }

    showFloatingText(text, x, y) {
        const floatText = this.add.text(x + Phaser.Math.Between(-30, 30), y, text, {
            fontFamily: FONTS.pixel,
            fontSize: '24px',
            color: COLORS.gold,
            stroke: COLORS.textShadow,
            strokeThickness: 3
        }).setOrigin(0.5);

        this.tweens.add({
            targets: floatText,
            y: y - 80,
            alpha: 0,
            duration: 800,
            ease: 'Power2',
            onComplete: () => floatText.destroy()
        });
    }

    createStatsDisplay() {
        const startY = 700;

        this.add.text(60, startY, 'Click Power:', {
            fontFamily: FONTS.readable,
            fontSize: '16px',
            color: COLORS.white
        });
        this.clickPowerText = this.add.text(250, startY, '1', {
            fontFamily: FONTS.pixel,
            fontSize: '16px',
            color: COLORS.gold
        });

        this.add.text(60, startY + 40, 'Total Clicks:', {
            fontFamily: FONTS.readable,
            fontSize: '16px',
            color: COLORS.white
        });
        this.totalClicksText = this.add.text(250, startY + 40, '0', {
            fontFamily: FONTS.pixel,
            fontSize: '16px',
            color: COLORS.gold
        });

        this.add.text(60, startY + 80, 'Total Earned:', {
            fontFamily: FONTS.readable,
            fontSize: '16px',
            color: COLORS.white
        });
        this.totalEarnedText = this.add.text(250, startY + 80, '0', {
            fontFamily: FONTS.pixel,
            fontSize: '16px',
            color: COLORS.gold
        });
    }

    createUpgradesPanel() {
        const panelY = 950;

        // Panel title
        this.add.text(BASE_W / 2, panelY, 'UPGRADES', {
            fontFamily: FONTS.pixel,
            fontSize: '20px',
            color: COLORS.gold,
            stroke: COLORS.textShadow,
            strokeThickness: 3
        }).setOrigin(0.5);

        // Upgrade buttons
        this.upgradeButtons = {};

        const upgrades = [
            { key: 'clickPower', name: 'Click Power', desc: '+1 per click', y: panelY + 80 },
            { key: 'autoClicker', name: 'Auto Clicker', desc: '+1 gold/sec', y: panelY + 180 },
            { key: 'multiplier', name: 'Multiplier', desc: 'x2 all gold', y: panelY + 280 }
        ];

        upgrades.forEach(upg => {
            this.createUpgradeButton(upg);
        });
    }

    createUpgradeButton(config) {
        const { key, name, desc, y } = config;
        const x = BASE_W / 2;

        // Background
        const bg = this.add.rectangle(x, y, 600, 70, COLORS.bgPanel, 0.9)
            .setInteractive({ useHandCursor: true });

        // Name
        this.add.text(80, y - 15, name, {
            fontFamily: FONTS.pixel,
            fontSize: '14px',
            color: COLORS.white
        });

        // Description
        this.add.text(80, y + 10, desc, {
            fontFamily: FONTS.readable,
            fontSize: '12px',
            color: '#aaaaaa'
        });

        // Level
        const levelText = this.add.text(450, y - 15, 'Lv.0', {
            fontFamily: FONTS.pixel,
            fontSize: '14px',
            color: COLORS.gold
        });

        // Cost
        const costText = this.add.text(450, y + 10, 'Cost: 10', {
            fontFamily: FONTS.readable,
            fontSize: '12px',
            color: COLORS.gold
        });

        // Store references
        this.upgradeButtons[key] = { bg, levelText, costText };

        // Click handler
        bg.on('pointerdown', () => {
            if (buyUpgrade(key)) {
                this.updateUI();
                saveGame();
            }
        });

        bg.on('pointerover', () => bg.setFillStyle(0x3a4a5a, 0.9));
        bg.on('pointerout', () => bg.setFillStyle(COLORS.bgPanel, 0.9));
    }

    processTick() {
        const now = Date.now();
        const deltaMs = now - window.clickerState.lastTickTime;
        processTick(deltaMs);
        this.updateUI();
    }

    updateUI() {
        const state = window.clickerState;

        // Gold display
        this.goldText.setText(this.formatNumber(Math.floor(state.gold)));
        this.gpsText.setText(`${this.formatNumber(state.goldPerSecond)} / sec`);

        // Click button
        this.clickBtnText.setText(`CLICK\n+${this.formatNumber(state.clickPower)}`);

        // Stats
        this.clickPowerText.setText(this.formatNumber(state.clickPower));
        this.totalClicksText.setText(this.formatNumber(state.clickCount));
        this.totalEarnedText.setText(this.formatNumber(Math.floor(state.totalGoldEarned)));

        // Upgrades
        Object.keys(this.upgradeButtons).forEach(key => {
            const btn = this.upgradeButtons[key];
            const level = state.upgrades[key];
            const cost = getUpgradeCost(key);

            btn.levelText.setText(`Lv.${level}`);
            btn.costText.setText(`Cost: ${this.formatNumber(cost)}`);

            // Affordable check
            if (state.gold >= cost) {
                btn.costText.setColor(COLORS.success);
            } else {
                btn.costText.setColor('#888888');
            }
        });
    }

    formatNumber(num) {
        if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
        if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
        return Math.floor(num).toString();
    }
}

console.log('[ClickerUI] Class defined');
