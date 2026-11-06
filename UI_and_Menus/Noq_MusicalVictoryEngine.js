/*:
 * @plugindesc v4.7 — Musical Victory Engine (Clean Build - Fixed Drops, Audio, & Yanfly Overrides)
 * @author Gemini + Noq
 * @help
 * Hold OK (Z, Enter, or Left Click) to fast-forward the victory screen.
 *
 * Flow: Grades reveal → Final Grade at frame 210 → Rewards tally →
 * EXP gauges fill → Dialogue banter → Loot window opens.
 *
 * Create "VictoryDialogues.json" in your project's data/ folder.
 * Example:
 * {
 * "rank_S": [
 * {"faceName":"Actor1","faceIndex":0,"speakerName":"Harold","text":"Flawless!"}
 * ],
 * "boss_win_3": [
 * {"faceName":"Actor3","faceIndex":2,"speakerName":"Marsha","text":"The general has fallen!"}
 * ]
 * }
 */

var MusicalVictory = MusicalVictory || {};

var _DataManager_loadDatabase = DataManager.loadDatabase;
DataManager.loadDatabase = function() {
    _DataManager_loadDatabase.call(this);
    this.loadDataFile('$victoryDialogues', 'VictoryDialogues.json');
};

(function() {
    'use strict';

    // ===================================================================
    // PHASE 1: BATTLE MANAGER
    // ===================================================================

    var _BManager_setup = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        _BManager_setup.call(this, troopId, canEscape, canLose);
        this.initMusicalTracker();
    };

    BattleManager.initMusicalTracker = function() {
        this._victoryProcessed = false;
        this._vStats = {
            startTime: Date.now(),
            burnoutTriggers: 0,
            harmonyCombos: 0,
            trueHarmonyBreaks: 0,
            verseTriggers: 0,
            recoveryActions: 0,
            totalActions: 0,
            enemyInterrupts: 0,
            playerInterrupted: 0
        };
        var pAtk = $gameParty.aliveMembers().reduce(function(sum, a) {
            return sum + a.atk + a.mat;
        }, 0);
        var eRes = $gameTroop.members().reduce(function(sum, e) {
            return sum + (e.param(0) / Math.max(1, e.param(3) + e.param(5)));
        }, 0);
        var cpRatio = pAtk / Math.max(1, eRes);
        this._vStats.parTime = Math.max(45, 240 - (cpRatio * 5));
    };

    BattleManager.makeRewards = function() {
        $gameParty.allMembers().forEach(function(actor) {
            actor._preVictoryLevel  = actor._level;
            actor._preVictoryExp    = actor.currentExp();
            actor._preVictorySkills = actor.skills().map(function(s) { return s.id; });
            actor._evolvedSkillsThisBattle = [];
        });

        this._rewards = {};
        this._rewards.gold  = $gameTroop.goldTotal();
        this._rewards.exp   = $gameTroop.expTotal();
        this._rewards.items = $gameTroop.makeDropItems();

        var rank = this._musicalGrades ? this._musicalGrades.total : 'C';
        var mult = rank === 'S' ? 2.0 : rank === 'A' ? 1.5 : rank === 'B' ? 1.3 : rank === 'D' ? 0.5 : 1.0;
        this._rewards.exp  = Math.round(this._rewards.exp  * mult);
        this._rewards.gold = Math.round(this._rewards.gold * mult);

        // --- FIX 1: ACTUALLY DEPOSIT THE REWARDS ---
        $gameParty.gainGold(this._rewards.gold);
        
        this._rewards.items.forEach(function(item) {
            $gameParty.gainItem(item, 1);
        });

        $gameParty.allMembers().forEach(function(actor) {
            actor.changeExp(actor.currentExp() + BattleManager._rewards.exp, false);
        });

        this.sortVictoryLoot();
    };

    BattleManager.sortVictoryLoot = function() {
        if (!this._rewards.items || this._rewards.items.length === 0) return;
        this._rewards.items.sort(function(a, b) {
            var ra = BattleManager.getRarityRank(a);
            var rb = BattleManager.getRarityRank(b);
            if (ra !== rb) return rb - ra;
            var ta = (DataManager.isWeapon(a) || DataManager.isArmor(a)) ? 1 : 0;
            var tb = (DataManager.isWeapon(b) || DataManager.isArmor(b)) ? 1 : 0;
            if (ta !== tb) return tb - ta;
            return b.price - a.price;
        });
    };

    BattleManager.getRarityRank = function(item) {
        if (!item || typeof item.note !== 'string') return 0;
        if (/<mythic>/i.test(item.note))   return 4;
        if (/<rare>/i.test(item.note))     return 3;
        if (/<uncommon>/i.test(item.note)) return 2;
        if (/<common>/i.test(item.note))   return 1;
        return 0;
    };

    BattleManager.calculateFinalMusicalGrade = function() {
        var v = this._vStats;
        var duration = (Date.now() - v.startTime) / 1000;

        var timeScore = Math.max(0, Math.min(100, 110 - (duration / v.parTime * 30)));

        var deadCount = $gameParty.allMembers().filter(function(a) { return a.isDead(); }).length;
        var avgHp = $gameParty.allMembers().reduce(function(sum, a) { return sum + a.hpRate(); }, 0) / $gameParty.allMembers().length;
        var survScore = 100;
        survScore -= (v.burnoutTriggers * 15);
        survScore -= (deadCount * 25);
        if (avgHp < 0.5) survScore -= 20;

        var styleScore = 70;
        styleScore += (v.harmonyCombos    * 10);
        styleScore += (v.enemyInterrupts  * 15);
        styleScore -= (v.trueHarmonyBreaks * 20);
        styleScore -= (v.playerInterrupted * 10);

        var finalScore = (timeScore * 0.4) + (survScore * 0.3) + (styleScore * 0.3);

        this._musicalGrades = {
            time:            this.getGradeLetter(timeScore),
            survivability:   this.getGradeLetter(survScore),
            style:           this.getGradeLetter(styleScore),
            total:           this.getGradeLetter(finalScore),
            rawFinal:        finalScore
        };
    };

    BattleManager.getGradeLetter = function(score) {
        if (score >= 90) return 'S';
        if (score >= 80) return 'A';
        if (score >= 65) return 'B';
        if (score >= 45) return 'C';
        return 'D';
    };

    BattleManager.processVictory = function() {
        if (this._victoryProcessed) return;
        this._victoryProcessed = true;

        AudioManager.stopBgm();
        $gameParty.removeBattleStates();
        $gameParty.performVictory();
        this.calculateFinalMusicalGrade();
        this.makeRewards();
        this.playVictoryMe();

        setTimeout(function() {
            SceneManager.push(Scene_MusicalVictory);
        }, 800);
    };

BattleManager.playVictoryMe = function() {
        // Plays the track as a BGM so it survives the scene transition AND loops perfectly
        var track = { name: 'Crown_of_Sunfire', volume: 90, pitch: 100, pan: 0 };
        AudioManager.playBgm(track);
    };

    // ===================================================================
    // PHASE 2: SCENE
    // ===================================================================

    function Scene_MusicalVictory() { this.initialize.apply(this, arguments); }
    Scene_MusicalVictory.prototype = Object.create(Scene_Base.prototype);
    Scene_MusicalVictory.prototype.constructor = Scene_MusicalVictory;

    Scene_MusicalVictory.prototype.initialize = function() {
        Scene_Base.prototype.initialize.call(this);
        this._revealTimer      = 0;
        this._dialogueQueue    = [];
        this._activeBanter     = null;
        this._banterWait       = 0;
        this._speed            = 1;
        this._fullLootTriggered = false;
    };

    Scene_MusicalVictory.prototype.create = function() {
        Scene_Base.prototype.create.call(this);
        MusicalVictory.rewardsTallyDone = false;
        this.createBackground();
        this.createActorSprites();
        this.createWindowLayer();
        this.createGradeWindow();
        this.createRewardsWindow();
        this.createRankSprite();
        this.createExpGauges();
        this.createFullLootWindow();
        this.setupContextualDialogue();
        this._banterWait = 60;
    };

    Scene_MusicalVictory.prototype.createBackground = function() {
        this._backSprite = new Sprite(SceneManager.backgroundBitmap());
        this.addChild(this._backSprite);
        this._overlay = new ScreenSprite();
        this._overlay.setColor(0, 0, 0);
        this._overlay.opacity = 140;
        this.addChild(this._overlay);
    };

    Scene_MusicalVictory.prototype.createActorSprites = function() {
        this._actorSprites = [];
        var members = $gameParty.battleMembers();
        
        var spacing = 160; 
        var startX = (Graphics.boxWidth / 2) - ((members.length - 1) * spacing / 2);

        for (var i = 0; i < members.length; i++) {
            var sprite = new Sprite_Actor(members[i]);
            sprite.setHome(startX + (i * spacing), Graphics.boxHeight - 150);
            
            // --- FIX 3: OVERRIDE YANFLY'S COMBAT POSITIONING ---
            // This forces the sprites to stay exactly where we placed them in the victory screen.
            sprite.updatePosition = function() {
                this.x = this._homeX;
                this.y = this._homeY;
            };
            
            sprite.x = sprite._homeX;
            sprite.y = sprite._homeY;
            sprite.startMotion('victory');
            this.addChild(sprite);
            this._actorSprites.push(sprite);
        }
    };

    Scene_MusicalVictory.prototype.createExpGauges = function() {
        this._expGauges = [];
        var members = $gameParty.battleMembers();
        for (var i = 0; i < members.length; i++) {
            var gauge = new Sprite_VictoryGauge(members[i], this._actorSprites[i]);
            this.addChild(gauge);
            this._expGauges.push(gauge);
        }
    };

    Scene_MusicalVictory.prototype.createGradeWindow = function() {
        this._gradeWindow = new Window_MusicalGrade(20, 20, 350, 250);
        this._gradeWindow.contentsOpacity = 0;
        this.addWindow(this._gradeWindow);
    };

    Scene_MusicalVictory.prototype.createRewardsWindow = function() {
        this._rewardsWindow = new Window_MusicalRewards(Graphics.boxWidth - 320, 20, 300, 250);
        this._rewardsWindow.contentsOpacity = 0;
        this.addWindow(this._rewardsWindow);
    };

    Scene_MusicalVictory.prototype.createRankSprite = function() {
        this._rankSprite = new Sprite(new Bitmap(100, 100));
        this._rankSprite.x = this._gradeWindow.x + 240;
        this._rankSprite.y = this._gradeWindow.y + 166;
        this._rankSprite.anchor.x = 0.5;
        this._rankSprite.anchor.y = 0.5;
        this._rankSprite.opacity  = 0;
        this.addChild(this._rankSprite);
    };

    Scene_MusicalVictory.prototype.createFullLootWindow = function() {
        var w = 400, h = 300;
        var x = (Graphics.boxWidth  - w) / 2;
        var y = (Graphics.boxHeight - h) / 2 + 50;
        this._lootHelpWindow = new Window_Help();
        this._lootHelpWindow.y = y - this._lootHelpWindow.height;
        this._lootHelpWindow.openness = 0;
        this.addWindow(this._lootHelpWindow);
        this._fullLootWindow = new Window_MusicalLoot(x, y, w, h);
        this._fullLootWindow.setHelpWindow(this._lootHelpWindow);
        this._fullLootWindow.openness = 0;
        this._fullLootWindow.deactivate();
        this.addWindow(this._fullLootWindow);
    };

    Scene_MusicalVictory.prototype.update = function() {
        Scene_Base.prototype.update.call(this);

        this._speed = (Input.isPressed('ok') || TouchInput.isPressed()) ? 4 : 1;

        if (this._fullLootWindow.isOpen() && this._fullLootWindow.active) {
            if (Input.isTriggered('cancel') || Input.isTriggered('ok') || TouchInput.isTriggered()) {
                SoundManager.playOk();
                AudioManager.stopMe(); 
                BattleManager.replayBgmAndBgs();
                SceneManager.goto(Scene_Map);
                BattleManager.endBattle(0);
            }
            return;
        }

        this._revealTimer += this._speed;

        if (this._revealTimer >= 30)  this._gradeWindow.contentsOpacity   = 255;
        if (this._revealTimer >= 210) this._rewardsWindow.contentsOpacity = 255;

        this._gradeWindow.updateReveal(this._revealTimer);

        if (this._revealTimer >= 210) {
            this._rankSprite.opacity = 255;
            var pulse = Math.sin(Graphics.frameCount * 0.1) * 0.1;
            this._rankSprite.scale.set(1.0 + pulse);
        }

        this.updateDialogueLogic();

        var tallyDone     = MusicalVictory.rewardsTallyDone;
        var banterClear   = (!this._dialogueQueue || this._dialogueQueue.length === 0) &&
                            (!this._activeBanter  || !this._activeBanter.parent);
        var gaugesDone    = this._expGauges && this._expGauges.every(function(g) { return g._finished; });

        if (tallyDone && banterClear && gaugesDone && !this._fullLootTriggered) {
            this._fullLootTriggered = true;
            AudioManager.stopSe();
            this._fullLootWindow.refresh();
            this._fullLootWindow.open();
            this._fullLootWindow.activate();
            this._fullLootWindow.select(0);
            this._lootHelpWindow.open();
        }
    };

    // ===================================================================
    // PHASE 2.5: BANTER SPRITE
    // ===================================================================

    function Sprite_VictoryBanter() { this.initialize.apply(this, arguments); }
    Sprite_VictoryBanter.prototype = Object.create(Sprite.prototype);
    Sprite_VictoryBanter.prototype.constructor = Sprite_VictoryBanter;

    Sprite_VictoryBanter.prototype.initialize = function(data) {
        Sprite.prototype.initialize.call(this);
        this.bitmap    = new Bitmap(600, 100);
        this._data     = data;
        this._duration = 180;
        this.opacity   = 0;
        this.anchor.x  = 0.5;
        this.x         = Graphics.boxWidth / 2;
        this.y         = 100;
        this._targetY  = 40;
        this.drawBanter();
    };

    Sprite_VictoryBanter.prototype.drawBanter = function() {
        var b    = this.bitmap;
        var data = this._data;
        b.fillRect(0, 0,   600, 100, 'rgba(0,0,20,0.8)');
        b.fillRect(0, 0,   600,   2, 'rgba(255,215,0,0.9)');
        b.fillRect(0, 98,  600,   2, 'rgba(255,215,0,0.9)');

        var faceName  = data.faceName  || '';
        var faceIndex = (data.faceIndex !== undefined) ? data.faceIndex : 0;
        if (faceName) {
            var fBitmap = ImageManager.loadFace(faceName);
            fBitmap.addLoadListener(function() {
                var sx = (faceIndex % 4) * 144;
                var sy = Math.floor(faceIndex / 4) * 144;
                b.blt(fBitmap, sx, sy, 144, 144, 10, 10, 80, 80);
            });
        }
        b.outlineWidth  = 3;
        b.outlineColor  = 'black';
        if (data.speakerName) {
            b.textColor = '#FFD700';
            b.fontSize  = 20;
            b.drawText(data.speakerName, 100, 10, 480, 30);
        }
        b.textColor = '#FFFFFF';
        b.fontSize  = 22;
        b.drawText(data.text, 100, 40, 480, 40);
    };

    Sprite_VictoryBanter.prototype.update = function() {
        Sprite.prototype.update.call(this);
        var speed = SceneManager._scene._speed || 1;
        this.y += (this._targetY - this.y) * 0.1 * speed;
        if (this._duration > 30) {
            this.opacity = Math.min(255, this.opacity + 15 * speed);
        } else {
            this.opacity = Math.max(0, this.opacity - 10 * speed);
        }
        this._duration -= speed;
        if (this._duration <= 0 && this.parent) this.parent.removeChild(this);
    };

    Scene_MusicalVictory.prototype.setupContextualDialogue = function() {
        if (!window.$victoryDialogues) return;
        var pool     = window.$victoryDialogues;
        var troopId  = $gameTroop._troopId;
        var rank     = BattleManager._musicalGrades ? BattleManager._musicalGrades.total : 'C';
        var keys     = ['boss_win_' + troopId, 'rank_' + rank, 'random'];
        var partyIds = $gameParty.battleMembers().map(function(a) { return a.actorId(); });

        for (var k = 0; k < keys.length; k++) {
            var key = keys[k];
            if (!pool[key]) continue;
            var versions = pool[key];
            if (Array.isArray(versions) && versions[0] && versions[0].requires) {
                for (var v = 0; v < versions.length; v++) {
                    var match = versions[v].requires.every(function(id) { return partyIds.indexOf(id) >= 0; });
                    if (match) {
                        this._dialogueQueue = JSON.parse(JSON.stringify(versions[v].dialogue));
                        return;
                    }
                }
            } else {
                this._dialogueQueue = JSON.parse(JSON.stringify(versions));
                return;
            }
        }
    };

    Scene_MusicalVictory.prototype.updateDialogueLogic = function() {
        if (this._revealTimer < 210) return;
        if (!this._dialogueQueue || this._dialogueQueue.length === 0) return;
        if (this._banterWait > 0) { this._banterWait -= this._speed; return; }

        var msgData = this._dialogueQueue.shift();
        var banter  = new Sprite_VictoryBanter(msgData);
        if (this._activeBanter && this._activeBanter.parent) {
            this._activeBanter._targetY += 110;
        }
        this.addChild(banter);
        this._activeBanter = banter;
        this._banterWait   = 150;
    };

    // ===================================================================
    // PHASE 3: EXP GAUGE
    // ===================================================================

    function Sprite_VictoryGauge() { this.initialize.apply(this, arguments); }
    Sprite_VictoryGauge.prototype = Object.create(Sprite.prototype);
    Sprite_VictoryGauge.prototype.constructor = Sprite_VictoryGauge;

    Sprite_VictoryGauge.prototype.initialize = function(actor, actorSprite) {
        Sprite.prototype.initialize.call(this);
        this.bitmap        = new Bitmap(140, 60);
        this._actor        = actor;
        this._actorSprite  = actorSprite;
        this._visualLevel  = actor._preVictoryLevel  || actor._level;
        this._visualExp    = actor._preVictoryExp    || actor.currentExp();
        this._targetExp    = actor.currentExp();
        this._finished     = false;
        this._popupQueue   = [];
        this._activePopup  = null;
        this._popupTimer   = 0;
        this.opacity       = 255;
        this.refresh();
    };

    Sprite_VictoryGauge.prototype.update = function() {
        Sprite.prototype.update.call(this);
        var speed = SceneManager._scene._speed || 1;
        if (MusicalVictory.rewardsTallyDone && !this._finished) {
            this.updateExpTick(speed);
        }
        this.updatePopups(speed);

        if (this._actorSprite) {
            this.x = this._actorSprite.x - 70; 
            this.y = this._actorSprite.y + 10; 
        }
    };

    Sprite_VictoryGauge.prototype.updateExpTick = function(speed) {
        if (this._visualExp < this._targetExp) {
            var diff = this._targetExp - this._visualExp;
            var step = Math.max(2, Math.floor(diff / 40)) * speed;
            this._visualExp += step;

            if (!this._actor.isMaxLevel()) {
                var nextLevelExp = this._actor.expForLevel(this._visualLevel + 1);
                if (this._visualExp >= nextLevelExp) {
                    this._visualLevel++;
                    this.triggerLevelUp();
                }
            }

            if (this._visualExp >= this._targetExp) {
                this._visualExp = this._targetExp;
                this._finished  = true;
                this.checkNewSkills();
            }
            this.refresh();
        } else {
            if (!this._finished) {
                this._finished = true;
                this.checkNewSkills();
                this.refresh();
            }
        }
    };

    Sprite_VictoryGauge.prototype.triggerLevelUp = function() {
        this._popupQueue.push({ text: 'LEVEL UP!', color: '#FFFF00' });
        if (this._actorSprite) this._actorSprite.startMotion('victory');
        AudioManager.playSe({ name: 'Up4', volume: 90, pitch: 100, pan: 0 });
    };

    Sprite_VictoryGauge.prototype.checkNewSkills = function() {
        var pre  = this._actor._preVictorySkills || [];
        var curr = this._actor.skills().map(function(s) { return s.id; });
        var hasNew = curr.some(function(id) { return pre.indexOf(id) < 0; });
        if (hasNew) this._popupQueue.push({ text: 'NEW SKILL!', color: '#00FF00' });
    };

    Sprite_VictoryGauge.prototype.refresh = function() {
        var b   = this.bitmap;
        b.clear();

        var curExp  = this._actor.expForLevel(this._visualLevel);
        var nextExp = this._actor.expForLevel(this._visualLevel + 1);
        var max     = Math.max(1, nextExp - curExp);
        var rate    = Math.min(1, Math.max(0, (this._visualExp - curExp) / max));
        if (this._actor.isMaxLevel()) rate = 1;

        b.fillRect(0, 35, 140, 8, 'rgba(0,0,0,0.5)');
        b.fillRect(0, 35, Math.floor(140 * rate), 8, '#00f0ff');
        b.fontSize = 14;
        b.drawText('Lv ' + this._visualLevel, 0, 12, 140, 20, 'center');
    };

    Sprite_VictoryGauge.prototype.updatePopups = function(speed) {
        if (this._activePopup) {
            this._popupTimer -= speed;
            this._activePopup.y -= speed;
            if (this._popupTimer < 20) this._activePopup.opacity -= 15 * speed;
            if (this._popupTimer <= 0) {
                SceneManager._scene.removeChild(this._activePopup);
                this._activePopup = null;
            }
        } else if (this._popupQueue.length > 0) {
            var data = this._popupQueue.shift();
            var pop  = new Sprite(new Bitmap(200, 50));
            pop.x    = this.x - 30;
            pop.y    = this.y - 180;
            pop.bitmap.fontSize     = 32;
            pop.bitmap.textColor    = data.color;
            pop.bitmap.outlineWidth = 5;
            pop.bitmap.drawText(data.text, 0, 0, 200, 50, 'center');
            SceneManager._scene.addChild(pop);
            this._activePopup = pop;
            this._popupTimer  = 90;
        }
    };

    // ===================================================================
    // PHASE 4: WINDOWS
    // ===================================================================

    function Window_MusicalGrade() { this.initialize.apply(this, arguments); }
    Window_MusicalGrade.prototype = Object.create(Window_Base.prototype);
    Window_MusicalGrade.prototype.constructor = Window_MusicalGrade;

    Window_MusicalGrade.prototype.initialize = function(x, y, w, h) {
        Window_Base.prototype.initialize.call(this, x, y, w, h);
        this._currentStep = 0;
        this.refresh();
    };

    Window_MusicalGrade.prototype.updateReveal = function(timer) {
        var step = 0;
        if (timer >= 30)  step = 1;
        if (timer >= 50)  step = 2;
        if (timer >= 70)  step = 3;
        if (timer >= 210) step = 4;
        if (step !== this._currentStep) {
            this._currentStep = step;
            this.refresh();
            if (step > 0) SoundManager.playCursor();
        }
    };

    Window_MusicalGrade.prototype.refresh = function() {
        this.contents.clear();
        var g = BattleManager._musicalGrades;
        if (!g) return;

        this.changeTextColor(this.systemColor());
        this.drawText('Performance Report', 0, 0, this.contentsWidth(), 'center');
        this.contents.fillRect(0, 32, this.contentsWidth(), 2, this.normalColor());
        this.resetTextColor();

        if (this._currentStep >= 1) this.drawText('Time: '           + g.time,           10, 35, this.contentsWidth() - 20);
        if (this._currentStep >= 2) this.drawText('Style: '          + g.style,          10, 65, this.contentsWidth() - 20);
        if (this._currentStep >= 3) this.drawText('Survivability: '  + g.survivability,  10, 95, this.contentsWidth() - 20);
        if (this._currentStep >= 4) {
            this.contents.fillRect(0, 130, this.contentsWidth(), 2, this.normalColor());
            this.changeTextColor(this.systemColor());
            this.drawText('Final Grade:', 10, 140, 150);
            this.resetTextColor();
            this.drawRankToSprite(g.total);
        }
    };

    Window_MusicalGrade.prototype.drawRankToSprite = function(rank) {
        var scene = SceneManager._scene;
        if (!scene || !scene._rankSprite) return;
        var b = scene._rankSprite.bitmap;
        b.clear();
        b.fontSize     = 72;
        b.outlineWidth = 6;
        b.textColor    = rank === 'S' ? '#FFD700' : rank === 'A' ? '#FF8C00' : rank === 'B' ? '#FFFFFF' : '#AAAAAA';
        b.drawText(rank, 0, 0, 100, 100, 'center');
        scene._rankSprite.opacity = 255;
    };

    // ---

    function Window_MusicalRewards() { this.initialize.apply(this, arguments); }
    Window_MusicalRewards.prototype = Object.create(Window_Base.prototype);
    Window_MusicalRewards.prototype.constructor = Window_MusicalRewards;

    Window_MusicalRewards.prototype.initialize = function(x, y, w, h) {
        Window_Base.prototype.initialize.call(this, x, y, w, h);
        this._displayExp  = 0;
        this._displayGold = 0;
        this._targetExp   = BattleManager._rewards ? BattleManager._rewards.exp  : 0;
        this._targetGold  = BattleManager._rewards ? BattleManager._rewards.gold : 0;
        this._isTallying  = false;
        this.refresh();
    };

    Window_MusicalRewards.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        var scene = SceneManager._scene;
        if (scene && scene._revealTimer >= 210) this._isTallying = true;
        if (!this._isTallying) return;

        var speed        = scene ? (scene._speed || 1) : 1;
        var stillCounting = false;

        if (this._displayExp < this._targetExp) {
            var expStep = Math.max(1, Math.floor(this._targetExp / 30)) * speed;
            this._displayExp = Math.min(this._targetExp, this._displayExp + expStep);
            stillCounting = true;
        }
        if (this._displayGold < this._targetGold) {
            var goldStep = Math.max(1, Math.floor(this._targetGold / 30)) * speed;
            this._displayGold = Math.min(this._targetGold, this._displayGold + goldStep);
            stillCounting = true;
        }

        if (stillCounting) {
            this.refresh();
        } else if (!MusicalVictory.rewardsTallyDone) {
            MusicalVictory.rewardsTallyDone = true;
        }
    };

    Window_MusicalRewards.prototype.refresh = function() {
        this.contents.clear();
        var r = BattleManager._rewards;
        if (!r) return;
        this.changeTextColor(this.systemColor());
        this.drawText('Spoils', 0, 0, this.contentsWidth(), 'center');
        this.resetTextColor();
        this.drawText('EXP: '  + Math.floor(this._displayExp),  10, 40, this.contentsWidth() - 20);
        this.drawText('Gold: ' + Math.floor(this._displayGold), 10, 80, this.contentsWidth() - 20);
    };

    // ---

    function Window_MusicalLoot() { this.initialize.apply(this, arguments); }
    Window_MusicalLoot.prototype = Object.create(Window_Selectable.prototype);
    Window_MusicalLoot.prototype.constructor = Window_MusicalLoot;

    Window_MusicalLoot.prototype.initialize = function(x, y, w, h) {
        Window_Selectable.prototype.initialize.call(this, x, y, w, h);
        this.refresh();
    };

    Window_MusicalLoot.prototype.maxItems = function() {
        return (BattleManager._rewards && BattleManager._rewards.items) ? BattleManager._rewards.items.length : 0;
    };

    Window_MusicalLoot.prototype.updateHelp = function() {
        if (this._helpWindow && BattleManager._rewards && BattleManager._rewards.items) {
            this._helpWindow.setItem(BattleManager._rewards.items[this.index()]);
        }
    };

    Window_MusicalLoot.prototype.drawItem = function(index) {
        var item = BattleManager._rewards.items[index];
        if (!item) return;
        var rect = this.itemRectForText(index);
        this.drawItemName(item, rect.x, rect.y, rect.width);
    };

})();