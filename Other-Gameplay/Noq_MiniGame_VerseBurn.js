/*:
 * @plugindesc (v6.0) Verse Burn Mini-Game — Custom BGM, UI Polish, & Scrolling Log
 * @author Endless Epoch Core Design
 *
 * @help
 * ============================================================================
 * VERSE BURN MINI-GAME (v6.0)
 * ============================================================================
 * Script Call to Start:
 * VerseBurn.start(pName, pElem, oName, oElem, resultVar, aiLevel, bgName);
 * 
 * Example:
 * VerseBurn.start("Kai", "Embern", "Drunken Censer", "Terranai", 50, 3, "");
 * ============================================================================
 */

var VerseBurn = window.VerseBurn || {};

(function() {
    "use strict";

    // =========================================================================
    // 🛠️ CONFIGURATION ZONE
    // =========================================================================
    VerseBurn.Config = {
        Affinities: {
            "Voltrend":   { rolePref: "Attacker", spellTargetBo: 15, spellSelfBo: 10, spellCost: 5,  kvCool: 15, dampenReduct: 0.40, groundRefl: 0.20, absorbGain: 25, tint: [0, 0, 60, 20] },
            "Mertide":    { rolePref: "Blocker",  spellTargetBo: -5, spellSelfBo: -5, spellCost: -10,kvCool: 15, dampenReduct: 0.50, groundRefl: 0.20, absorbGain: 45, tint: [-40, -20, 40, 30] },
            "Embern":     { rolePref: "Attacker", spellTargetBo: 10, spellSelfBo: 5,  spellCost: 0,  kvCool: 20, dampenReduct: 0.40, groundRefl: 0.15, absorbGain: 25, tint: [-60, 20, 20, 40] },
            "Solien":     { rolePref: "Attacker", spellTargetBo: 5,  spellSelfBo: -5, spellCost: 5,  kvCool: 15, dampenReduct: 0.60, groundRefl: 0.25, absorbGain: 35, tint: [60, 60, 20, 10] },
            "Terranai":   { rolePref: "Blocker",  spellTargetBo: -5, spellSelfBo: 0,  spellCost: 5,  kvCool: 10, dampenReduct: 0.65, groundRefl: 0.25, absorbGain: 35, tint: [20, -20, -40, 20] },
            "Twilight":   { rolePref: "Attacker", spellTargetBo: 20, spellSelfBo: 15, spellCost: 0,  kvCool: 15, dampenReduct: 0.45, groundRefl: 0.10, absorbGain: 20, tint: [-30, -30, 40, 40] },
            "Geofluxer":  { rolePref: "Blocker",  spellTargetBo: 5,  spellSelfBo: 5,  spellCost: 0,  kvCool: 15, dampenReduct: 0.55, groundRefl: 0.30, absorbGain: 25, tint: [40, 0, -40, 30] },
            "Caelir":     { rolePref: "Blocker",  spellTargetBo: 0,  spellSelfBo: -10,spellCost: -5, kvCool: 15, dampenReduct: 0.35, groundRefl: 0.10, absorbGain: 30, tint: [10, 10, 10, 10] },
            "Umbrel":     { rolePref: "Attacker", spellTargetBo: 25, spellSelfBo: 20, spellCost: 0,  kvCool: 10, dampenReduct: 0.30, groundRefl: 0.0,  absorbGain: 15, tint: [-100, -100, -100, 100] }
        },

        Graphics: {
            "Kai":            { faceName: "kai", faceIndex: 4, charName: "kaitvd", charIndex: 0 },
            "Bran":           { faceName: "Actor2", faceIndex: 1, charName: "Actor2", charIndex: 1 },
            "Malin":          { faceName: "Actor1", faceIndex: 2, charName: "Actor1", charIndex: 2 },
            "Lord Bastiel":   { faceName: "Monster", faceIndex: 0, charName: "Monster", charIndex: 0 },
            "Drunken Censer": { faceName: "People3", faceIndex: 7, charName: "People3", charIndex: 7 },
            "Default":        { faceName: "Actor1", faceIndex: 0, charName: "Actor1", charIndex: 0 }
        },

        Animations: {
            spell: 1, kv: 2, dampen: 3, grounding: 4, absorb: 5, overload: 6 
        },

        DefaultAffinity: {
            rolePref: "Attacker", spellTargetBo: 0, spellSelfBo: 0, spellCost: 0, kvCool: 15,
            dampenReduct: 0.50, groundRefl: 0.20, absorbGain: 30, tint: [0,0,0,0]
        }
    };

    // =========================================================================
    // 🗣️ BATTLE CHATTER HOOK
    // =========================================================================
    VerseBurn.playChatter = function(charName, eventType) {
        console.log("Chatter Hook -> " + charName + " triggered: " + eventType);
    };

    VerseBurn.start = function(pName, pElem, oName, oElem, resultVar, aiLevel, bgName) {
        this.pName = pName || "Kai"; this.pElem = pElem || "Embern";
        this.oName = oName || "Opponent"; this.oElem = oElem || "Terranai";
        this.resultVar = resultVar || 222; this.aiLevel = aiLevel || 2;
        this.bgName = bgName || "";
        
        // Save Map Environment Data for safe restoration
        this._mapBgm = AudioManager.saveBgm();
        this._mapBgs = AudioManager.saveBgs();
        this._mapTone = $gameScreen.tone().slice();
        this._mapBrightness = $gameScreen._brightness || 255;
        
        SceneManager.snapForBackground();
        SceneManager.push(Scene_VerseBurn);
    };

    // =========================================================================
    // 🎮 SCENE_VERSEBURN
    // =========================================================================
    function Scene_VerseBurn() { this.initialize.apply(this, arguments); }
    Scene_VerseBurn.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_VerseBurn.prototype.constructor = Scene_VerseBurn;

    Scene_VerseBurn.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this.pEnergy = 100; this.pBurnout = 0; this.pRests = 5; 
        this.oEnergy = 100; this.oBurnout = 0; this.oRests = 5; 
        this.roundNum = 1;
        this.phase = 'coinflip';
        this.battleLog = []; // Stores scrolling log text
        this._endgameBgmTriggered = false;
        
        this.pushLog("=== PITCH FLIP ===");
        this.pushLog("Predict the Goddess' coin toss.");
    };

    Scene_VerseBurn.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createBackground();
        this.createStatusWindow();
        this.createBattlerSprites(); 
        this.createLogWindow();
        this.createCommandWindow();
        
        // Start Custom Mini-Game BGM
        AudioManager.playBgm({ name: "Rose At Dawn", volume: 90, pitch: 100, pan: 0 });
        VerseBurn.playChatter(VerseBurn.pName, "start");
    };

    Scene_VerseBurn.prototype.createBackground = function() {
        this._bgSprite = new Sprite();
        if (VerseBurn.bgName && VerseBurn.bgName.trim() !== "") {
            this._bgSprite.bitmap = ImageManager.loadParallax(VerseBurn.bgName);
        } else {
            this._bgSprite.bitmap = SceneManager.backgroundBitmap();
        }
        this.addChildAt(this._bgSprite, 0);
    };

    Scene_VerseBurn.prototype.createBattlerSprites = function() {
        var pGraph = VerseBurn.Config.Graphics[VerseBurn.pName] || VerseBurn.Config.Graphics["Default"];
        this._pSprite = new Sprite_VerseBattler(pGraph.charName, pGraph.charIndex, false);
        this._pSprite._baseX = Graphics.boxWidth / 4;
        this._pSprite.y = Graphics.boxHeight / 2 + 50;
        this.addChild(this._pSprite);

        var oGraph = VerseBurn.Config.Graphics[VerseBurn.oName] || VerseBurn.Config.Graphics["Default"];
        this._oSprite = new Sprite_VerseBattler(oGraph.charName, oGraph.charIndex, true);
        this._oSprite._baseX = (Graphics.boxWidth / 4) * 3;
        this._oSprite.y = Graphics.boxHeight / 2 + 50;
        this.addChild(this._oSprite);
    };

	Scene_VerseBurn.prototype.createStatusWindow = function() {
        // Height increased to 220 to accommodate circular portraits and text underneath
        this._statusWindow = new Window_VerseBurnStatus(0, 0, Graphics.boxWidth, 220, this);
        this.addWindow(this._statusWindow);
    };
	
	Scene_VerseBurn.prototype.createLogWindow = function() {
        var ww = 640;
        var wh = 240;
        var wx = (Graphics.boxWidth - ww) / 2; // Centered exactly in the middle of the screen
        var wy = Graphics.boxHeight - wh - 20; // Placed at the bottom edge
        this._logWindow = new Window_VerseBurnLog(wx, wy, ww, wh, this);
        this.addWindow(this._logWindow);
    };
	
	Scene_VerseBurn.prototype.createCommandWindow = function() {
        var ww = 240;
        var wh = 190;
        // Position directly above the player's battle sprite
        var wx = (Graphics.boxWidth / 4) - (ww / 2); 
        var wy = (Graphics.boxHeight / 2) - 170; 
        this._commandWindow = new Window_VerseBurnCommand(wx, wy, ww, wh, this);
        
        this._commandWindow.setHandler('heads', this.onCoinFlip.bind(this, 'heads'));
        this._commandWindow.setHandler('tails', this.onCoinFlip.bind(this, 'tails'));
        this._commandWindow.setHandler('take_attack', this.onRoleChoice.bind(this, true));
        this._commandWindow.setHandler('take_block', this.onRoleChoice.bind(this, false));
        
        this._commandWindow.setHandler('trickle', this.onAction.bind(this, 'trickle'));
        this._commandWindow.setHandler('burst', this.onAction.bind(this, 'burst'));
        this._commandWindow.setHandler('surge', this.onAction.bind(this, 'surge'));
        
        this._commandWindow.setHandler('kv_menu', this.onKineticMenu.bind(this));
        this._commandWindow.setHandler('kv10', this.onAction.bind(this, 'kv10'));
        this._commandWindow.setHandler('kv20', this.onAction.bind(this, 'kv20'));
        this._commandWindow.setHandler('kv30', this.onAction.bind(this, 'kv30'));
        this._commandWindow.setHandler('cancel_wager', this.onCancelWager.bind(this));
        
        this._commandWindow.setHandler('dampen', this.onAction.bind(this, 'dampen'));
        this._commandWindow.setHandler('grounding', this.onAction.bind(this, 'grounding'));
        this._commandWindow.setHandler('absorb', this.onAction.bind(this, 'absorb'));
        this._commandWindow.setHandler('counter', this.onAction.bind(this, 'counter')); 
        
        this._commandWindow.setHandler('rest', this.onAction.bind(this, 'rest'));
        this._commandWindow.setHandler('continue', this.onContinue.bind(this));
        this._commandWindow.setHandler('exit', this.onExit.bind(this));
        
        this.addWindow(this._commandWindow);
    };
    
    // Global scrolling log pusher
    Scene_VerseBurn.prototype.pushLog = function(text) {
        this.battleLog.push(text);
        if (this._logWindow) this._logWindow.refresh();
    };

    Scene_VerseBurn.prototype.onKineticMenu = function() {
        this.phase = 'wager';
        this._commandWindow.refresh();
        this._commandWindow.activate();
    };

    Scene_VerseBurn.prototype.onCancelWager = function() {
        this.phase = 'input';
        this._commandWindow.refresh();
        this._commandWindow.activate();
    };

    Scene_VerseBurn.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        $gameScreen.update();
        
        // 🌟 Safe Exit Sequence: Brightness -> Delay -> Tint
        if (this._isExiting) {
            this._exitTimer++;
            if (this._exitTimer === 2) {
                $gameScreen.startTint(VerseBurn._mapTone || [0,0,0,0], 1);
                AudioManager.replayBgm(VerseBurn._mapBgm);
                AudioManager.replayBgs(VerseBurn._mapBgs);
                this.popScene();
            }
            return;
        }

        var tone = $gameScreen.tone();
        var shakeX = $gameScreen.shake();
        
        if (this._bgSprite) {
            this._bgSprite.setColorTone(tone);
            this._bgSprite.x = shakeX;
            this._bgSprite.y = shakeX;
        }
        
        if (this._pSprite) {
            this._pSprite.setColorTone(tone);
            this._pSprite.x = this._pSprite._baseX + this._pSprite._offsetX + shakeX;
        }
        if (this._oSprite) {
            this._oSprite.setColorTone(tone);
            this._oSprite.x = this._oSprite._baseX + this._oSprite._offsetX + shakeX;
        }
    };

    // =========================================================================
    // 🎲 PHASE 1: COIN FLIP & ROLE CHOICE
    // =========================================================================
    Scene_VerseBurn.prototype.onCoinFlip = function(choice) {
        var coin = Math.random() < 0.5 ? 'heads' : 'tails';
        var playerWon = (choice === coin);
        AudioManager.playSe({ name: "Coin", volume: 90, pitch: 100, pan: 0 });
        
        this.pushLog("Coin landed on " + coin.toUpperCase() + "!");
        if (playerWon) {
            this.phase = 'chooserole';
            this.pushLog("You won the Pitch Flip! Choose your Role.");
        } else {
            var oData = VerseBurn.Config.Affinities[VerseBurn.oElem] || VerseBurn.Config.DefaultAffinity;
            this.pIsAttacker = (oData.rolePref === "Blocker");
            this.phase = 'input';
            this.pushLog(VerseBurn.oName + " won the Flip and chose " + (this.pIsAttacker ? "BLOCKER." : "ATTACKER."));
            this._statusWindow.refreshHUD();
        }
        this._commandWindow.refresh();
        this._commandWindow.activate();
    };

    Scene_VerseBurn.prototype.onRoleChoice = function(isAttacker) {
        this.pIsAttacker = isAttacker;
        this.phase = 'input';
        this.pushLog("You have chosen to be the " + (isAttacker ? "ATTACKER" : "BLOCKER") + ".");
        this.pushLog("Select your Round 1 action.");
        this._statusWindow.refreshHUD();
        this._commandWindow.refresh();
        this._commandWindow.activate();
    };

    // =========================================================================
    // ⚔️ PHASE 2: ACTION PROCESSING & PLAY-BY-PLAY MATH
    // =========================================================================
    Scene_VerseBurn.prototype.onAction = function(pAction) {
        var oAction = this.getAIAction();
        var attAct = this.pIsAttacker ? pAction : oAction;
        var blkAct = this.pIsAttacker ? oAction : pAction;

        this.resolveRound(attAct, blkAct);

        if (this.phase !== 'gameover') this.phase = 'action_text'; 
        this._commandWindow.refresh();
        this._commandWindow.activate();
    };

    Scene_VerseBurn.prototype.onContinue = function() {
        this.phase = 'input';
        this.roundNum++;
        this._pSprite.resetPosition(); 
        this._oSprite.resetPosition(); 
        this.pushLog(""); // Blank line for spacing
        this.pushLog("--- ROUND " + this.roundNum + " ---");
        this._commandWindow.refresh();
        this._commandWindow.activate();
    };

    Scene_VerseBurn.prototype.resolveRound = function(attAct, blkAct) {
        var aData = VerseBurn.Config.Affinities[this.pIsAttacker ? VerseBurn.pElem : VerseBurn.oElem] || VerseBurn.Config.DefaultAffinity;
        var bData = VerseBurn.Config.Affinities[!this.pIsAttacker ? VerseBurn.pElem : VerseBurn.oElem] || VerseBurn.Config.DefaultAffinity;

        var attEn = this.pIsAttacker ? this.pEnergy : this.oEnergy;
        var attBo = this.pIsAttacker ? this.pBurnout : this.oBurnout;
        var attRests = this.pIsAttacker ? this.pRests : this.oRests;

        var blkEn = !this.pIsAttacker ? this.pEnergy : this.oEnergy;
        var blkBo = !this.pIsAttacker ? this.pBurnout : this.oBurnout;
        var blkRests = !this.pIsAttacker ? this.pRests : this.oRests;

        var attName = this.pIsAttacker ? VerseBurn.pName : VerseBurn.oName;
        var blkName = !this.pIsAttacker ? VerseBurn.pName : VerseBurn.oName;
        var attSprite = this.pIsAttacker ? this._pSprite : this._oSprite;
        var blkSprite = !this.pIsAttacker ? this._pSprite : this._oSprite;

        this.pushLog("[" + attName + "] used " + attAct.toUpperCase() + ".");
        this.pushLog("[" + blkName + "] used " + blkAct.toUpperCase() + ".");

        if (aData.tint) $gameScreen.startTint(aData.tint, 20);
        if (attAct !== 'rest') attSprite.stepForward();

        var anims = VerseBurn.Config.Animations;
        if (attAct.includes('kv')) attSprite.startAnimation($dataAnimations[anims.kv], false, 0);
        else if (attAct !== 'rest') attSprite.startAnimation($dataAnimations[anims.spell], false, 0);
        
        if (blkAct === 'dampen') blkSprite.startAnimation($dataAnimations[anims.dampen], false, 30);
        else if (blkAct === 'grounding') blkSprite.startAnimation($dataAnimations[anims.grounding], false, 30);
        else if (blkAct === 'absorb') blkSprite.startAnimation($dataAnimations[anims.absorb], false, 30);
        else if (blkAct === 'counter') blkSprite.startAnimation($dataAnimations[anims.kv], false, 30);

        if (blkAct === 'dampen') blkEn -= 10;
        else if (blkAct === 'grounding') blkEn -= 25;
        else if (blkAct === 'counter') blkEn -= 15;
        else if (blkAct === 'absorb') blkEn -= 2;
        else if (blkAct === 'rest') blkRests--;
        
        if (attAct === 'rest') attRests--;

        if (attAct === 'rest' && blkAct === 'rest') {
            attEn += 35; attBo -= 25; blkEn += 35; blkBo -= 25;
            this.pushLog("HARMONIC RESET! Both gained +35 EN and cooled -25 Heat.");
        }
        else if (attAct === 'rest') {
            attEn += 25; attBo -= 15;
            this.pushLog(attName + " rested! (+25 EN, -15 Heat)");
            if (blkAct === 'dampen') { blkEn += 5; this.pushLog(blkName + " refunded +5 EN."); }
            else if (blkAct === 'grounding') { blkEn += 12; this.pushLog(blkName + " refunded +12 EN."); }
            else if (blkAct === 'counter') { blkEn += 7; this.pushLog(blkName + " refunded +7 EN."); }
            else if (blkAct === 'absorb') { this.pushLog(blkName + "'s Absorb whiffed entirely!"); }
        }
        else if (attAct.includes('kv')) {
            var wager = parseInt(attAct.replace('kv', '')); 
            attEn -= wager; attBo -= aData.kvCool;
            var drain = Math.floor(wager * 1.5);

            if (blkAct === 'counter') {
                attBo += drain; 
                attSprite.stepBack(); 
                $gameScreen.startShake(5, 5, 20);
                this.pushLog("PHYSICAL COUNTER! " + blkName + " parried the force!");
                this.pushLog(attName + " took +" + drain + " Burnout from recoil!");
            }
            else if (blkAct === 'absorb') {
                attEn -= drain; blkEn += bData.absorbGain;
                attSprite.stepBack();
                this.pushLog("KINETIC REFLECT! " + blkName + " recovered +" + bData.absorbGain + " EN!");
                this.pushLog(attName + " suffered a -" + drain + " EN drain!");
            } else {
                blkEn -= drain;
                blkSprite.stepBack();
                $gameScreen.startShake(3, 5, 20);
                this.pushLog("KINETIC HIT! " + attName + " cooled -" + aData.kvCool + " Heat.");
                this.pushLog(blkName + " suffered a -" + drain + " EN drain!");
            }
        }
        else { // Spells
            var bCost = attAct === 'trickle' ? 15 : (attAct === 'burst' ? 30 : 50);
            var bSelf = attAct === 'trickle' ? 5 : (attAct === 'burst' ? 15 : 35);
            var bTarg = attAct === 'trickle' ? 15 : (attAct === 'burst' ? 30 : 60);

            var finalCost = Math.max(0, bCost + aData.spellCost);
            var finalSelf = bSelf + aData.spellSelfBo;
            var targetHeat = bTarg + aData.spellTargetBo;

            attEn -= finalCost;
            attBo += finalSelf;
            
            this.pushLog(attName + " spent -" + finalCost + " EN and took +" + finalSelf + " Self-Heat.");

            if (blkAct === 'counter') {
                blkBo += targetHeat; blkSprite.stepBack(); $gameScreen.startShake(4, 5, 20);
                this.pushLog("COUNTER FAILED! You cannot parry a Verse spell!");
                this.pushLog(blkName + " suffered +" + targetHeat + " Burnout!");
            }
            else if (blkAct === 'dampen') {
                var dmg = Math.floor(targetHeat * (1.0 - bData.dampenReduct));
                blkBo += dmg;
                this.pushLog(blkName + " shielded! Took only +" + dmg + " Burnout.");
            } else if (blkAct === 'grounding') {
                var dmg = Math.floor(targetHeat * (0.40 - bData.groundRefl));
                var refl = Math.floor(targetHeat * bData.groundRefl);
                blkBo += dmg; attBo += refl;
                attSprite.stepBack(); 
                this.pushLog(blkName + " Grounded! Reflected +" + refl + " Heat back!");
                this.pushLog(blkName + " only takes +" + dmg + " Burnout.");
            } else if (blkAct === 'absorb') {
                blkBo += targetHeat; blkEn += bData.absorbGain;
                this.pushLog(blkName + " absorbed hit: +" + targetHeat + " Burnout, but gains +" + bData.absorbGain + " EN.");
            } else { 
                blkBo += targetHeat; blkSprite.stepBack(); $gameScreen.startShake(4, 5, 20);
                this.pushLog(blkName + " took a direct hit! Suffered +" + targetHeat + " Burnout!");
            }
        }

        attEn = Math.max(0, Math.min(100, attEn)); attBo = Math.max(0, attBo);
        blkEn = Math.max(0, Math.min(100, blkEn)); blkBo = Math.max(0, blkBo);

        // --- ENDGAME BGM PITCH SHIFT ---
        if (!this._endgameBgmTriggered && (attBo >= 80 || blkBo >= 80 || attEn <= 20 || blkEn <= 20)) {
            this._endgameBgmTriggered = true;
            AudioManager.playBgm({ name: "Rose At Dawn", volume: 90, pitch: 120, pan: 0 });
        }

        if (attBo >= 100) {
            this.pushLog(">>> ATTACKER OVERLOADED! " + attName + "'s channel shattered!");
            attSprite.startAnimation($dataAnimations[anims.overload], false, 0);
            attSprite.playDowned();
            this.isMatchOver(!this.pIsAttacker); 
        } else if (blkBo >= 100) {
            this.pushLog(">>> BLOCKER OVERLOADED! " + blkName + "'s defense broke!");
            blkSprite.startAnimation($dataAnimations[anims.overload], false, 0);
            blkSprite.playDowned();
            this.isMatchOver(this.pIsAttacker); 
        } else if (blkEn <= 0 && attAct.includes('kv')) {
            this.pushLog(">>> GUARD CRUSH! " + blkName + " reached 0 Energy and took a kinetic hit!");
            blkSprite.playDowned();
            this.isMatchOver(this.pIsAttacker); 
        } else if (attEn <= 0 && attRests <= 0) {
            this.pushLog(">>> EXHAUSTION! " + attName + " has 0 Energy and no rests left!");
            attSprite.playDowned();
            this.isMatchOver(!this.pIsAttacker); 
        }

        if (this.pIsAttacker) {
            this.pEnergy = attEn; this.pBurnout = attBo; this.pRests = attRests;
            this.oEnergy = blkEn; this.oBurnout = blkBo; this.oRests = blkRests;
            this._statusWindow.setTargets(attEn, attBo, blkEn, blkBo);
        } else {
            this.oEnergy = attEn; this.oBurnout = attBo; this.oRests = attRests;
            this.pEnergy = blkEn; this.pBurnout = blkBo; this.pRests = blkRests;
            this._statusWindow.setTargets(blkEn, blkBo, attEn, attBo);
        }
    };

    Scene_VerseBurn.prototype.getAIAction = function() {
        var r = Math.random();
        if (!this.pIsAttacker) { 
            if (this.oEnergy < 20) return 'rest';
            if (this.oBurnout > 70) return 'kv20';
            if (this.pEnergy < 15 && VerseBurn.aiLevel === 3) return 'surge';
            return (r < 0.6) ? 'burst' : 'trickle';
        } else { 
            if (this.pEnergy < 20 && VerseBurn.aiLevel === 3) return 'absorb';
            if (this.oEnergy < 15) return 'absorb';
            if (this.oBurnout > 75) return 'rest';
            return (r < 0.5) ? 'dampen' : 'grounding';
        }
    };

    Scene_VerseBurn.prototype.isMatchOver = function(playerWon) {
        this.phase = 'gameover';
        $gameVariables.setValue(VerseBurn.resultVar, playerWon ? 1 : 2);
        AudioManager.playBgm({ name: playerWon ? "Victory1" : "Defeat1", volume: 90, pitch: 100, pan: 0 });
        VerseBurn.playChatter(VerseBurn.pName, playerWon ? "win" : "lose");
    };

    Scene_VerseBurn.prototype.onExit = function() {
        // Trigger safe exit sequence in update()
        this._isExiting = true;
        this._exitTimer = 0;
        
        // 1. Restore Brightness immediately
        if (typeof $gameScreen.setBrightness === 'function') {
            $gameScreen.setBrightness(VerseBurn._mapBrightness || 255);
        }
    };

    // =========================================================================
    // 🎨 UI COMPONENTS & SPRITES
    // =========================================================================

    function Sprite_VerseBattler() { this.initialize.apply(this, arguments); }
    Sprite_VerseBattler.prototype = Object.create(Sprite_Base.prototype);
    Sprite_VerseBattler.prototype.constructor = Sprite_VerseBattler;

    Sprite_VerseBattler.prototype.initialize = function(charName, charIndex, isOpponent) {
        Sprite_Base.prototype.initialize.call(this);
        this.bitmap = ImageManager.loadCharacter(charName);
        this._charIndex = charIndex;
        this._isOpponent = isOpponent;
        this.anchor.x = 0.5; this.anchor.y = 1.0;
        this.scale.x = 2; this.scale.y = 2;
        
        this._baseX = 0; this._offsetX = 0; this._targetOffsetX = 0;
        this._direction = isOpponent ? 4 : 6;
        this._pattern = 1; this._animCount = 0;
        this._isDowned = false; this._isReady = false;
    };

    Sprite_VerseBattler.prototype.update = function() {
        Sprite_Base.prototype.update.call(this);
        if (!this._isReady && this.bitmap.isReady()) {
            this._pw = this.bitmap.width / 12;
            this._ph = this.bitmap.height / 8;
            this._isReady = true;
        }
        if (this._isReady) {
            this.updateAnimation();
            this.updateFrame();
            this.updatePosition();
        }
    };

    Sprite_VerseBattler.prototype.updateAnimation = function() {
        if (this._isDowned) return;
        this._animCount++;
        if (this._animCount >= 15) { 
            this._animCount = 0;
            this._pattern++;
            if (this._pattern > 3) this._pattern = 0;
        }
    };

    Sprite_VerseBattler.prototype.updateFrame = function() {
        var n = this._charIndex;
        var pat = this._pattern === 3 ? 1 : this._pattern; 
        if (this._isDowned) pat = 1; 
        
        var dirIndex = (this._direction - 2) / 2; 
        var sx = ((n % 4) * 3 + pat) * this._pw;
        var sy = (Math.floor(n / 4) * 4 + dirIndex) * this._ph;
        this.setFrame(sx, sy, this._pw, this._ph);
    };

    Sprite_VerseBattler.prototype.updatePosition = function() {
        if (this._offsetX !== this._targetOffsetX) {
            this._offsetX += (this._targetOffsetX - this._offsetX) * 0.15; 
            if (Math.abs(this._offsetX - this._targetOffsetX) < 0.5) this._offsetX = this._targetOffsetX;
        }
        this.x = this._baseX + this._offsetX + $gameScreen.shake();
    };

    Sprite_VerseBattler.prototype.stepForward = function() { this._targetOffsetX = this._isOpponent ? -50 : 50; };
    Sprite_VerseBattler.prototype.stepBack = function() { this._targetOffsetX = this._isOpponent ? 30 : -30; };
    Sprite_VerseBattler.prototype.resetPosition = function() { this._targetOffsetX = 0; };
    Sprite_VerseBattler.prototype.playDowned = function() {
        this._isDowned = true;
        this._direction = 2; // Face Down Row
        this.rotation = this._isOpponent ? -(Math.PI / 2) : (Math.PI / 2); 
        this.opacity = 150;
    };

// =========================================================================
    // 🎨 CIRCULAR HUD UI ENGINE
    // =========================================================================
    function Window_VerseBurnStatus() { this.initialize.apply(this, arguments); }
    Window_VerseBurnStatus.prototype = Object.create(Window_Base.prototype);
    Window_VerseBurnStatus.prototype.constructor = Window_VerseBurnStatus;

    Window_VerseBurnStatus.prototype.initialize = function(x, y, width, height, scene) {
        Window_Base.prototype.initialize.call(this, x, y, width, height);
        this.opacity = 0; // Floating style
        this._scene = scene;
        this.dispPE = 100; this.dispPB = 0; this.dispOE = 100; this.dispOB = 0;
        this.targetPE = 100; this.targetPB = 0; this.targetOE = 100; this.targetOB = 0;
        
        this.createHUDContainer();
        this.refreshHUD(); 
    };

    Window_VerseBurnStatus.prototype.setTargets = function(pe, pb, oe, ob) {
        this.targetPE = pe; this.targetPB = pb; this.targetOE = oe; this.targetOB = ob;
    };

    Window_VerseBurnStatus.prototype.createHUDContainer = function() {
        this._hudContainer = new PIXI.Container();
        this.addChild(this._hudContainer);

        var createSide = function(x, y) {
            var cont = new PIXI.Container();
            cont.x = x; cont.y = y;
            
            var face = new Sprite();
            face.anchor.set(0.5);
            
            // Circular Mask for Portrait
            var mask = new PIXI.Graphics();
            mask.beginFill(0xffffff); mask.drawCircle(0, 0, 48); mask.endFill();
            face.mask = mask;
            
            // Faint Background Track for Rings
            var bgRing = new PIXI.Graphics();
            bgRing.lineStyle(6, 0x000000, 0.4);
            bgRing.drawCircle(0, 0, 56);
            bgRing.drawCircle(0, 0, 64);
            
            var enRing = new PIXI.Graphics();
            var boRing = new PIXI.Graphics();
            
            cont.addChild(face);
            cont.addChild(mask);
            cont.addChild(bgRing);
            cont.addChild(enRing);
            cont.addChild(boRing);
            
            return { cont: cont, face: face, enRing: enRing, boRing: boRing };
        };

        // Positions for the Left & Right HUD elements
        this._pHUD = createSide(120, 80);
        this._oHUD = createSide(Graphics.boxWidth - 120, 80);

        this._hudContainer.addChild(this._pHUD.cont);
        this._hudContainer.addChild(this._oHUD.cont);
    };

    Window_VerseBurnStatus.prototype.setupFaceSprite = function(sprite, faceName, faceIndex) {
        var bmp = ImageManager.loadFace(faceName);
        sprite.bitmap = bmp;
        sprite.scale.set(96 / 144); // Scale standard 144x144 face to fit the 96x96 circle mask
        var pw = Window_Base._faceWidth || 144;
        var ph = Window_Base._faceHeight || 144;
        var px = faceIndex % 4 * pw;
        var py = Math.floor(faceIndex / 4) * ph;
        
        if (bmp.isReady()) {
            sprite.setFrame(px, py, pw, ph);
        } else {
            bmp.addLoadListener(function() { sprite.setFrame(px, py, pw, ph); });
        }
    };

    Window_VerseBurnStatus.prototype.drawRing = function(gfx, rate, radius, color) {
        gfx.clear();
        if (rate <= 0) return;
        var segs = Math.max(12, Math.floor(64 * rate)); // Smooth resolution mapping
        gfx.lineStyle(6, color, 1);
        var startAng = -Math.PI / 2;
        
        gfx.moveTo(Math.cos(startAng) * radius, Math.sin(startAng) * radius);
        for (var i = 1; i <= segs; i++) {
            var ang = startAng + (i / 64) * Math.PI * 2;
            if (i === segs) ang = startAng + rate * Math.PI * 2; // Clamp exact end percentage
            gfx.lineTo(Math.cos(ang) * radius, Math.sin(ang) * radius);
        }
    };

    Window_VerseBurnStatus.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        var needsRefresh = false;
        
        // Tweening Engine for Gauges
        if (this.dispPE !== this.targetPE) { this.dispPE += (this.targetPE - this.dispPE) * 0.1; needsRefresh = true; }
        if (this.dispPB !== this.targetPB) { this.dispPB += (this.targetPB - this.dispPB) * 0.1; needsRefresh = true; }
        if (this.dispOE !== this.targetOE) { this.dispOE += (this.targetOE - this.dispOE) * 0.1; needsRefresh = true; }
        if (this.dispOB !== this.targetOB) { this.dispOB += (this.targetOB - this.dispOB) * 0.1; needsRefresh = true; }
        
        // Snap rounding
        if (Math.abs(this.dispPE - this.targetPE) < 0.5) this.dispPE = this.targetPE;
        if (Math.abs(this.dispPB - this.targetPB) < 0.5) this.dispPB = this.targetPB;
        if (Math.abs(this.dispOE - this.targetOE) < 0.5) this.dispOE = this.targetOE;
        if (Math.abs(this.dispOB - this.targetOB) < 0.5) this.dispOB = this.targetOB;
        
        if (needsRefresh) this.refreshHUD();
    };

    Window_VerseBurnStatus.prototype.refreshHUD = function() {
        this.contents.clear();
        
        var pGraph = VerseBurn.Config.Graphics[VerseBurn.pName] || VerseBurn.Config.Graphics["Default"];
        var oGraph = VerseBurn.Config.Graphics[VerseBurn.oName] || VerseBurn.Config.Graphics["Default"];
        this.setupFaceSprite(this._pHUD.face, pGraph.faceName, pGraph.faceIndex);
        this.setupFaceSprite(this._oHUD.face, oGraph.faceName, oGraph.faceIndex);

        // Draw Rings (Inner = Energy, Outer = Burnout)
        this.drawRing(this._pHUD.enRing, this.dispPE / 100, 56, 0x4fc3f7); // Blue Energy
        this.drawRing(this._pHUD.boRing, this.dispPB / 100, 64, 0xff3d00); // Red Burnout
        this.drawRing(this._oHUD.enRing, this.dispOE / 100, 56, 0x4fc3f7);
        this.drawRing(this._oHUD.boRing, this.dispOB / 100, 64, 0xff3d00);

        // Calculate Text Positions beneath the HUD rings
        var pX = 40; 
        var oX = Graphics.boxWidth - 200;

        var pRole = this._scene.phase === 'coinflip' ? "[?]" : (this._scene.pIsAttacker ? "[ATK]" : "[BLK]");
        var oRole = this._scene.phase === 'coinflip' ? "[?]" : (!this._scene.pIsAttacker ? "[ATK]" : "[BLK]");

        // Render Names & Roles
        this.changeTextColor(this.systemColor());
        this.drawText(pRole + " " + VerseBurn.pName, pX, 150, 160, 'center');
        this.drawText(oRole + " " + VerseBurn.oName, oX, 150, 160, 'center');
        
        // Render Raw Percentage Numbers
        this.resetTextColor();
        this.drawText("EN: " + Math.floor(this.dispPE) + "%", pX, 175, 80, 'center');
        this.drawText("BO: " + Math.floor(this.dispPB) + "%", pX + 80, 175, 80, 'center');

        this.drawText("EN: " + Math.floor(this.dispOE) + "%", oX, 175, 80, 'center');
        this.drawText("BO: " + Math.floor(this.dispOB) + "%", oX + 80, 175, 80, 'center');
    };

    // --- SCROLLING LOG WINDOW ---
    function Window_VerseBurnLog() { this.initialize.apply(this, arguments); }
    Window_VerseBurnLog.prototype = Object.create(Window_Base.prototype);
    Window_VerseBurnLog.prototype.constructor = Window_VerseBurnLog;

	Window_VerseBurnLog.prototype.initialize = function(x, y, width, height, scene) {
        Window_Base.prototype.initialize.call(this, x, y, width, height);
        this._scene = scene;
        this.setBackgroundType(1); // 1 = Dimmed Background (Matches Battle Log)
        this.refresh();
    };

    Window_VerseBurnLog.prototype.refresh = function() {
        this.contents.clear();
        var maxLines = 5; // Scrolls up to 5 lines maximum
        var lines = this._scene.battleLog.slice(-maxLines);
        
        for (var i = 0; i < lines.length; i++) {
            // Centers text dynamically by estimating string width
            var textStr = lines[i].replace(/\\C\[\d+\]/gi, '');
            var tWidth = this.textWidth(textStr);
            var xPos = Math.max(0, (this.contentsWidth() - tWidth) / 2);
            this.drawTextEx(lines[i], xPos, i * this.lineHeight());
        }
    };

    // --- COMMAND WINDOW ---
    function Window_VerseBurnCommand() { this.initialize.apply(this, arguments); }
    Window_VerseBurnCommand.prototype = Object.create(Window_Command.prototype);
    Window_VerseBurnCommand.prototype.constructor = Window_VerseBurnCommand;

    Window_VerseBurnCommand.prototype.initialize = function(x, y, width, height, scene) {
        this._scene = scene;
        this._customWidth = width;
        this._customHeight = height;
        Window_Command.prototype.initialize.call(this, x, y);
    };

    Window_VerseBurnCommand.prototype.windowWidth = function() { return this._customWidth || 240; };
    Window_VerseBurnCommand.prototype.windowHeight = function() { return this._customHeight || this.fittingHeight(5); };

    Window_VerseBurnCommand.prototype.makeCommandList = function() {
        if (this._scene.phase === 'coinflip') {
            this.addCommand("Choose Heads", 'heads');
            this.addCommand("Choose Tails", 'tails');
        } else if (this._scene.phase === 'chooserole') {
            this.addCommand("Take Attacker Role", 'take_attack');
            this.addCommand("Take Blocker Role", 'take_block');
        } else if (this._scene.phase === 'action_text') {
            this.addCommand("Continue ->", 'continue'); 
        } else if (this._scene.phase === 'gameover') {
            this.addCommand("End Match", 'exit');
        } else if (this._scene.phase === 'wager') {
            var pE = this._scene.pEnergy;
            this.addCommand("Wager 10% EN", 'kv10', pE >= 10);
            this.addCommand("Wager 20% EN", 'kv20', pE >= 20);
            this.addCommand("Wager 30% EN", 'kv30', pE >= 30);
            this.addCommand("Cancel", 'cancel_wager');
        } else {
            var pData = VerseBurn.Config.Affinities[this._scene.pElem] || VerseBurn.Config.DefaultAffinity;
            var pE = this._scene.pEnergy;
            var pR = this._scene.pRests; 

            if (this._scene.pIsAttacker) {
                var cTrick = Math.max(0, 15 + pData.spellCost);
                var cBurst = Math.max(0, 30 + pData.spellCost);
                var cSurge = Math.max(0, 50 + pData.spellCost);
                
                this.addCommand("Trickle (" + cTrick + " EN)", 'trickle', pE >= cTrick);
                this.addCommand("Burst (" + cBurst + " EN)", 'burst', pE >= cBurst);
                this.addCommand("Surge (" + cSurge + " EN)", 'surge', pE >= cSurge);
                this.addCommand("Kinetic Strike...", 'kv_menu', pE >= 10);
                this.addCommand("Vent / Rest (" + pR + ")", 'rest', pR > 0);
            } else {
                this.addCommand("Dampen (10 EN)", 'dampen', pE >= 10);
                this.addCommand("Grounding (25 EN)", 'grounding', pE >= 25);
                this.addCommand("Counter (15 EN)", 'counter', pE >= 15);
                this.addCommand("Absorb (2 EN)", 'absorb', pE >= 2); 
                this.addCommand("Vent / Rest (" + pR + ")", 'rest', pR > 0);
            }
        }
    };

    Window_VerseBurnCommand.prototype.refresh = function() {
        this.clearCommandList();
        this.makeCommandList();
        this.createContents();
        this.drawAllItems();
    };

})();