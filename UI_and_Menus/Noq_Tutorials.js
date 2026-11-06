/*:
 * @target MV
 * @plugindesc (v1.0) Visual Slide Tutorial System with Blur & Hold-to-Skip
 * @author Noq
 *
 * @help
 * ============================================================================
 * VISUAL TUTORIAL SYSTEM
 * ============================================================================
 * Place your tutorial images in the 'img/pictures/' folder.
 * 
 * Script Call:
 * Tutorial.start("prefix_", startIndex, endIndex, canSkip);
 * 
 * Example:
 * Tutorial.start("codex_", 0, 5, true);
 * ============================================================================
 */

var Tutorial = Tutorial || {};

(function() {
    "use strict";

    // =========================================================================
    // 🚀 PUBLIC API
    // =========================================================================
    Tutorial.start = function(prefix, startIdx, endIdx, canSkip) {
        this.prefix = prefix || "codex_";
        this.startIdx = startIdx || 0;
        this.endIdx = endIdx || 0;
        this.canSkip = canSkip !== undefined ? canSkip : true;
        
        // Preload the first image immediately to prevent pop-in
        ImageManager.loadPicture(this.prefix + this.startIdx);
        
        SceneManager.push(Scene_Tutorial);
    };

    // =========================================================================
    // 🖼️ SCENE_TUTORIAL
    // =========================================================================
    function Scene_Tutorial() { this.initialize.apply(this, arguments); }
    Scene_Tutorial.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Tutorial.prototype.constructor = Scene_Tutorial;

    Scene_Tutorial.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._currentIndex = Tutorial.startIdx;
        this._skipTimer = 0;
        this._skipThreshold = 60; // 60 frames = 1 second hold
    };

    Scene_Tutorial.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        // Scene_MenuBase automatically snaps and blurs the background in MV!
        
        this.createSlideSprite();
        this.createSkipUI();
        this.preloadNextImages();
    };

    Scene_Tutorial.prototype.createSlideSprite = function() {
        this._slideSprite = new Sprite();
        this._slideSprite.anchor.set(0.5);
        this._slideSprite.x = Graphics.boxWidth / 2;
        this._slideSprite.y = Graphics.boxHeight / 2;
        this.addChild(this._slideSprite);
        this.updateSlideImage();
    };

    Scene_Tutorial.prototype.createSkipUI = function() {
        // Container for the Skip HUD
        this._skipContainer = new PIXI.Container();
        this._skipContainer.x = Graphics.boxWidth - 180;
        this._skipContainer.y = Graphics.boxHeight - 60;
        this.addChild(this._skipContainer);

        // Text Prompt
        this._skipText = new PIXI.Text("Hold Cancel to Skip", {
            fontFamily: "GameFont",
            fontSize: 18,
            fill: "#ffffff",
            dropShadow: true,
            dropShadowAlpha: 0.5,
            dropShadowDistance: 2
        });
        this._skipText.anchor.set(0.5, 1);
        this._skipContainer.addChild(this._skipText);

        // Progress Bar Background
        this._skipBg = new PIXI.Graphics();
        this._skipBg.beginFill(0x000000, 0.5);
        this._skipBg.drawRect(-75, 5, 150, 6);
        this._skipBg.endFill();
        this._skipContainer.addChild(this._skipBg);

        // Progress Bar Fill
        this._skipFill = new PIXI.Graphics();
        this._skipContainer.addChild(this._skipFill);

        // Hide it initially if skipping isn't allowed
        this._skipContainer.visible = Tutorial.canSkip;
        this._skipContainer.alpha = 0.5; // Dimmed until pressed
    };

    Scene_Tutorial.prototype.updateSlideImage = function() {
        var fileName = Tutorial.prefix + this._currentIndex;
        this._slideSprite.bitmap = ImageManager.loadPicture(fileName);
        this._slideSprite.opacity = 0; // Reset for fade-in effect
    };

    Scene_Tutorial.prototype.preloadNextImages = function() {
        for (var i = Tutorial.startIdx; i <= Tutorial.endIdx; i++) {
            ImageManager.loadPicture(Tutorial.prefix + i);
        }
    };

    Scene_Tutorial.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        
        // Simple fade-in for the slide
        if (this._slideSprite.opacity < 255) {
            this._slideSprite.opacity += 15;
        }

        this.updateInput();
        this.updateSkipGauge();
    };

    Scene_Tutorial.prototype.updateInput = function() {
        // Next Slide (Action Button or Right Arrow)
        if (Input.isTriggered('ok') || Input.isTriggered('right')) {
            SoundManager.playCursor();
            if (this._currentIndex < Tutorial.endIdx) {
                this._currentIndex++;
                this.updateSlideImage();
            } else {
                this.endTutorial();
            }
        }
        
        // Previous Slide (Left Arrow)
        if (Input.isTriggered('left')) {
            if (this._currentIndex > Tutorial.startIdx) {
                SoundManager.playCursor();
                this._currentIndex--;
                this.updateSlideImage();
            }
        }

        // Hold to Skip Logic
        if (Tutorial.canSkip) {
            if (Input.isPressed('cancel')) {
                this._skipTimer++;
                this._skipContainer.alpha = 1.0; // Brighten when held
                if (this._skipTimer >= this._skipThreshold) {
                    this.endTutorial();
                }
            } else {
                if (this._skipTimer > 0) this._skipTimer -= 2; // Fast decay when released
                this._skipContainer.alpha = 0.5; // Dim when not held
            }
            this._skipTimer = Math.max(0, this._skipTimer);
        }
    };

    Scene_Tutorial.prototype.updateSkipGauge = function() {
        if (!Tutorial.canSkip) return;
        
        var rate = this._skipTimer / this._skipThreshold;
        this._skipFill.clear();
        if (rate > 0) {
            this._skipFill.beginFill(0xffcc66, 1); // Golden fill color
            this._skipFill.drawRect(-75, 5, 150 * rate, 6);
            this._skipFill.endFill();
        }
    };

    Scene_Tutorial.prototype.endTutorial = function() {
        SoundManager.playOk();
        this.popScene();
    };

})();