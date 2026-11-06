/*:
 * @plugindesc v1.1 Endless Epoch Custom Stat Distribution & UI with Resonance Integration
 * @author Tyson (Noq)
 *
 * @help
 * ============================================================================
 * ACTOR NOTETAGS (Place these in the Actor's Note Box in the Database)
 * ============================================================================
 * <StatCaps>
 * mhp: 5000
 * mmp: 1000
 * atk: 150
 * def: 120
 * mat: 200
 * mdf: 180
 * agi: 80
 * luk: 150
 * </StatCaps>
 *
 * ============================================================================
 * HOW TO OPEN THE MENU (Option 3 - Campfire / NPC)
 * ============================================================================
 * In your Campfire or NPC Event, use this Script Call:
 * SceneManager.push(Scene_StatDistribution);
 * * ============================================================================
 * RESONANCE BONUSES
 * ============================================================================
 * - Each point in Resonance increases max TP by 1
 * - Every 5 points in Resonance reduces burnout MP cost penalties by 3%
 * (e.g., at 2.0x MP cost with 5 Resonance = 1.97x MP cost)
 * * ============================================================================
 * STAT BONUSES (ATK, DEF, VERSE, VERSE SHIELD, AGI, RESONANCE)
 * ============================================================================
 * - Every 5 points spent in a stat grants +1 bonus point in that stat
 */

(function() {
    // ========================================================================
    // 1. CONFIGURATION & TERMINOLOGY
    // ========================================================================
    var STAT_NAMES = ["Max HP", "Energy", "Attack", "Defense", "Verse", "Verse Shield", "Agility", "Resonance"];
    
    var STAT_GAINS = [25, 5, 1, 1, 1, 1, 1, 1]; // How much 1 point actually gives
    
	var STAT_LORE = [
        "Max HP: Increases overall survivability and physical endurance.",
        "Energy: The stamina to channel Verse Arts. Also increases personal equip load limit.",
        "Attack: Raw physical strength. Increases personal equip load and Party Bag capacity.",
        "Defense: Physical resilience against blades and blunt force.",
        "Verse: Amplifies the elemental and base power of offensive magic.",
        "Verse Shield: Mitigates damage taken from hostile Verse Arts.",
        "Agility: Determines turn order, reaction speed, and evasion.",
        "Resonance: Amplifies combo potential and universal Verse power. Each point adds +1 max TP. Every 5 points reduces burnout MP cost penalties by 3%."
    ];
    // ========================================================================
    // 2. BACKEND MATH (Points, Caps, Leveling)
    // ========================================================================
    
    // Safety check to ensure aliases don't run twice if the plugin is duplicated
    if (!Game_Actor.prototype._hasNoqStatDistributionAliased) {
        
        var _Game_Actor_setup = Game_Actor.prototype.setup;
        Game_Actor.prototype.setup = function(actorId) {
            _Game_Actor_setup.call(this, actorId);
            this._unspentSparks = 0; 
            this._allocatedStats = [0, 0, 0, 0, 0, 0, 0, 0]; 
        };

        var _Game_Actor_levelUp = Game_Actor.prototype.levelUp;
        Game_Actor.prototype.levelUp = function() {
            _Game_Actor_levelUp.call(this);
            if (this._level % 5 === 0) {
                this._unspentSparks += 10;
            } else {
                this._unspentSparks += 5;
            }
        };

        var _Game_Actor_paramBase = Game_Actor.prototype.paramBase;
        Game_Actor.prototype.paramBase = function(paramId) {
            var base = _Game_Actor_paramBase.call(this, paramId);
            var allocated = this._allocatedStats ? this._allocatedStats[paramId] : 0;
            
            // Apply bonus for stats 2-7 (every 5 points = +1 bonus)
            if (paramId >= 2 && paramId <= 7) {
                var pointsSpent = Math.floor(allocated / STAT_GAINS[paramId]);
                var bonusPoints = Math.floor(pointsSpent / 5);
                allocated += (bonusPoints * STAT_GAINS[paramId]);
            }
            
            return base + allocated;
        };

        Game_Actor.prototype._hasNoqStatDistributionAliased = true;
    }

    Game_Actor.prototype.getStatCap = function(paramId) {
        var actor = this.actor();
        if (actor.meta.StatCaps) {
            var caps = [9999, 9999, 255, 255, 255, 255, 255, 255]; 
            var notes = actor.note.split(/[\r\n]+/);
            var inTag = false;
            for (var i = 0; i < notes.length; i++) {
                if (notes[i].match(/<StatCaps>/i)) { inTag = true; continue; }
                if (notes[i].match(/<\/StatCaps>/i)) { inTag = false; break; }
                if (inTag) {
                    var match = notes[i].match(/(mhp|mmp|atk|def|mat|mdf|agi|luk):\s*(\d+)/i);
                    if (match) {
                        var stat = match[1].toLowerCase();
                        var val = Number(match[2]);
                        if (stat === 'mhp') caps[0] = val;
                        if (stat === 'mmp') caps[1] = val;
                        if (stat === 'atk') caps[2] = val;
                        if (stat === 'def') caps[3] = val;
                        if (stat === 'mat') caps[4] = val;
                        if (stat === 'mdf') caps[5] = val;
                        if (stat === 'agi') caps[6] = val;
                        if (stat === 'luk') caps[7] = val;
                    }
                }
            }
            return caps[paramId];
        }
        return paramId === 0 || paramId === 1 ? 9999 : 255; 
    };

    // ========================================================================
    // RESONANCE INTEGRATION WITH TP/BURNOUT SYSTEM
    // ========================================================================
    
    Game_Actor.prototype.getResonancePoints = function() {
        if (!this._allocatedStats) return 0;
        return Math.floor(this._allocatedStats[7] / STAT_GAINS[7]);
    };

    if (!Game_BattlerBase.prototype._hasNoqResonanceTPAliased) {
        var _Game_BattlerBase_tpLimit = Game_BattlerBase.prototype.tpLimit;
        Game_BattlerBase.prototype.tpLimit = function() {
            var limit = _Game_BattlerBase_tpLimit.call(this);
            
            if (this.isActor && this.isActor()) {
                var resonancePoints = this.getResonancePoints();
                limit += resonancePoints;
            }
            
            return Math.max(1, limit);
        };

        var _Game_BattlerBase_skillMpCost = Game_BattlerBase.prototype.skillMpCost;
        Game_BattlerBase.prototype.skillMpCost = function(skill) {
            var cost = _Game_BattlerBase_skillMpCost.call(this, skill);
            
            if (!this.isActor || !this.isActor() || !this.getBurnoutPenaltyReduction) {
                return cost;
            }
            
            var baseCost = this._ubc_lockActive && this._ubc_lockedSkillId === (skill && skill.id) && this._ubc_lockedMpCost != null
                ? this._ubc_lockedMpCost
                : cost;
            
            if (!skill || !(skill.note && /<(Energy|Verse)>/i.test(skill.note))) {
                return cost;
            }
            
            if (baseCost === 0) return cost;
            var appliedMultiplier = cost / baseCost;
            
            if (appliedMultiplier <= 1.0) return cost;
            
            var penaltyAmount = appliedMultiplier - 1.0;
            var reduction = this.getBurnoutPenaltyReduction();
            var reducedPenalty = penaltyAmount * (1 - reduction);
            var finalMultiplier = 1.0 + reducedPenalty;
            
            return Math.round(baseCost * finalMultiplier);
        };
        Game_BattlerBase.prototype._hasNoqResonanceTPAliased = true;
    }

    Game_Actor.prototype.getBurnoutPenaltyReduction = function() {
        var resonancePoints = this.getResonancePoints();
        var fivePointBonuses = Math.floor(resonancePoints / 5);
        return fivePointBonuses * 0.03;
    };

    // ========================================================================
    // 3. FRONTEND UI (The Windows)
    // ========================================================================
    
    // --- CONFIRMATION WINDOW ---
    function Window_StatConfirm() { this.initialize.apply(this, arguments); }
    Window_StatConfirm.prototype = Object.create(Window_Command.prototype);
    Window_StatConfirm.prototype.constructor = Window_StatConfirm;

    Window_StatConfirm.prototype.initialize = function() {
        Window_Command.prototype.initialize.call(this, 0, 0);
        this.updatePlacement();
        this.openness = 0;
        this.deactivate();
    };

    Window_StatConfirm.prototype.windowWidth = function() {
        return 400;
    };

    Window_StatConfirm.prototype.updatePlacement = function() {
        this.x = (Graphics.boxWidth - this.width) / 2;
        this.y = (Graphics.boxHeight - this.height) / 2;
    };

    Window_StatConfirm.prototype.makeCommandList = function() {
        this.addCommand('Confirm Allocation', 'confirm');
        this.addCommand('Cancel', 'cancel');
    };
    
    // --- SCENE ---
    function Scene_StatDistribution() { this.initialize.apply(this, arguments); }
    window.Scene_StatDistribution = Scene_StatDistribution;
    Scene_StatDistribution.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_StatDistribution.prototype.constructor = Scene_StatDistribution;

    Scene_StatDistribution.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createHubWindow();
        this.createAllocWindow();
        this.createConfirmWindow();
    };
    
    Scene_StatDistribution.prototype.createConfirmWindow = function() {
        this._confirmWindow = new Window_StatConfirm();
        this._confirmWindow.setHandler('confirm', this.onConfirmOk.bind(this));
        this._confirmWindow.setHandler('cancel', this.onConfirmCancel.bind(this));
        this.addWindow(this._confirmWindow);
    };

    Scene_StatDistribution.prototype.createHelpWindow = function() {
        this._helpWindow = new Window_Help(2);
        this._helpWindow.y = Graphics.boxHeight - this._helpWindow.height;
        this.addWindow(this._helpWindow);
    };

    Scene_StatDistribution.prototype.createHubWindow = function() {
        var wy = 0;
        var ww = 300;
        var wh = Graphics.boxHeight - this._helpWindow.height;
        this._hubWindow = new Window_StatHub(0, wy, ww, wh);
        this.addWindow(this._hubWindow);
    };

    Scene_StatDistribution.prototype.createAllocWindow = function() {
        var wx = this._hubWindow.width;
        var wy = 0;
        var ww = Graphics.boxWidth - wx;
        var wh = Graphics.boxHeight - this._helpWindow.height;
        this._allocWindow = new Window_StatAlloc(wx, wy, ww, wh);
        this._allocWindow.setHelpWindow(this._helpWindow);
        this._allocWindow.setHubWindow(this._hubWindow);
        this._allocWindow.activate();
        this._allocWindow.select(0);
        this._allocWindow.setHandler('ok', this.onAllocOk.bind(this)); 
        this._allocWindow.setHandler('cancel', this.popScene.bind(this));
        this._allocWindow.setHandler('pagedown', this.nextActor.bind(this));
        this._allocWindow.setHandler('pageup',   this.previousActor.bind(this));
        this.addWindow(this._allocWindow);
    };

    Scene_StatDistribution.prototype.onAllocOk = function() {
        var totalSpent = this._allocWindow._tempAlloc.reduce(function(a, b){ return a + b; }, 0);
    
        if (totalSpent > 0) {
            this._allocWindow.deactivate();
            this._confirmWindow.open();
            this._confirmWindow.activate();
            this._confirmWindow.select(0);
        } else {
            SoundManager.playBuzzer();
            this._allocWindow.activate();
        }
    };

    Scene_StatDistribution.prototype.onActorChange = function() {
        this._allocWindow.resetTempAlloc(); // Safely wipe old stats out first
        this._hubWindow.refresh();
        this._allocWindow.refresh();
        this._allocWindow.activate();
    };
    
    Scene_StatDistribution.prototype.onConfirmOk = function() {
        this._allocWindow.confirmAllocation();
        this._confirmWindow.close();
        this._allocWindow.activate();
    };

    Scene_StatDistribution.prototype.onConfirmCancel = function() {
        this._confirmWindow.close();
        this._allocWindow.activate();
    };

    // --- HUB WINDOW ---
    function Window_StatHub() { this.initialize.apply(this, arguments); }
    Window_StatHub.prototype = Object.create(Window_Base.prototype);
    Window_StatHub.prototype.constructor = Window_StatHub;

    Window_StatHub.prototype.initialize = function(x, y, w, h) {
        Window_Base.prototype.initialize.call(this, x, y, w, h);
        this.refresh();
    };

Window_StatHub.prototype.refresh = function() {
        this.contents.clear();
        var actor = $gameParty.menuActor();
        if (!actor) return;
        
        this.drawActorFace(actor, 0, 0, 144, 144);
        this.drawText(actor.name(), 160, 0, 120);
        
        this.changeTextColor(this.systemColor());
        this.drawText("Unspent Beats", 0, 160, this.contentsWidth(), 'center');
        this.resetTextColor();
        
        this.contents.fontSize = 48;
        var sparks = actor._unspentSparks - (this._tempSparksSpent || 0);
        if (sparks > 0) this.changeTextColor(this.powerUpColor());
        this.drawText(sparks, 0, 200, this.contentsWidth(), 'center');
        this.resetTextColor();
        this.contents.fontSize = this.standardFontSize();
        
        // ====================================================================
        // Real-Time Equip & Bag Load Projections
        // ====================================================================
        if (Imported.Noq_InventoryWeight) {
            var tempAlloc = this._tempAlloc || [0,0,0,0,0,0,0,0];
            
            // Math for added stats
            var addedEng = tempAlloc[1] * STAT_GAINS[1];
            var currentAtkPts = Math.floor((actor._allocatedStats[2] || 0) / STAT_GAINS[2]);
            var newAtkPts = currentAtkPts + tempAlloc[2];
            var bonusAtk = Math.floor(newAtkPts / 5) - Math.floor(currentAtkPts / 5);
            var addedAtk = (tempAlloc[2] + bonusAtk) * STAT_GAINS[2];
            
            // --- EQUIP LOAD UI ---
            var deltaLoad = (addedAtk * Noq.Weight.ActorStrMult) + (addedEng * Noq.Weight.ActorEngMult);
            var projectedLoadMax = actor.maxEquipCapacity() + deltaLoad;
            var currentWeight = actor.currentEquipWeight();
            
            var loadY = 270; 
            this.changeTextColor(this.systemColor());
            this.drawText("Equip Load", 0, loadY, this.contentsWidth(), 'center');
            
            this.contents.fontSize = 24;
            var loadText = currentWeight.toFixed(1) + " / " + projectedLoadMax.toFixed(1);
            if (deltaLoad > 0) this.changeTextColor(this.powerUpColor());
            else this.resetTextColor();
            this.drawText(loadText, 0, loadY + 35, this.contentsWidth(), 'center');
            this.resetTextColor();
            
            // --- PARTY BAG UI ---
            var deltaBag = (addedAtk * Noq.Weight.PartyStrMult);
            var projectedBagMax = $gameParty.maxWeightCapacity() + deltaBag;
            var currentBagWeight = $gameParty.currentInventoryWeight();
            
            var bagY = 350; // Placed below Equip Load
            this.changeTextColor(this.systemColor());
            this.contents.fontSize = this.standardFontSize();
            this.drawText("Party Bag", 0, bagY, this.contentsWidth(), 'center');
            
            this.contents.fontSize = 24;
            var bagText = currentBagWeight.toFixed(1) + " / " + projectedBagMax.toFixed(1);
            if (deltaBag > 0) this.changeTextColor(this.powerUpColor());
            else this.resetTextColor();
            this.drawText(bagText, 0, bagY + 35, this.contentsWidth(), 'center');
            this.resetTextColor();
            
            this.contents.fontSize = this.standardFontSize();
        }
        // ====================================================================

        this.drawText("Page↑ Page↓ to Change Character", 0, this.contentsHeight() - 105, this.contentsWidth(), 'center');
        this.drawText("Use ← → to Allocate", 0, this.contentsHeight() - 70, this.contentsWidth(), 'center');
        this.drawText("Press OK to Confirm", 0, this.contentsHeight() - 35, this.contentsWidth(), 'center');
    };

    // --- ALLOCATION WINDOW ---
    function Window_StatAlloc() { this.initialize.apply(this, arguments); }
    Window_StatAlloc.prototype = Object.create(Window_Selectable.prototype);
    Window_StatAlloc.prototype.constructor = Window_StatAlloc;

    Window_StatAlloc.prototype.initialize = function(x, y, w, h) {
        Window_Selectable.prototype.initialize.call(this, x, y, w, h);
        this._tempAlloc = [0,0,0,0,0,0,0,0];
        this.refresh();
    };

    Window_StatAlloc.prototype.setHubWindow = function(hubWindow) {
        this._hubWindow = hubWindow;
    };

    Window_StatAlloc.prototype.maxItems = function() { return 8; };
    
    // Explicitly handles clearing without risking external refresh overrides
    Window_StatAlloc.prototype.resetTempAlloc = function() {
        this._tempAlloc = [0,0,0,0,0,0,0,0];
        this.updateHubSparks();
    };
    
    Window_StatAlloc.prototype.refresh = function() {
        this.updateHubSparks();
        Window_Selectable.prototype.refresh.call(this);
    };

    Window_StatAlloc.prototype.drawItem = function(index) {
        var actor = $gameParty.menuActor();
        if (!actor) return;
        
        if (!actor._allocatedStats) {
            actor._allocatedStats = [0, 0, 0, 0, 0, 0, 0, 0];
        }
        if (actor._unspentSparks === undefined) {
            actor._unspentSparks = 0;
        }
        
        var rect = this.itemRectForText(index);
        var statName = STAT_NAMES[index];
        var baseVal = actor.paramBase(index);
        var cap = actor.getStatCap(index);
        var tempGained = this._tempAlloc[index] * STAT_GAINS[index];
        
        var bonusGained = 0;
        if (index >= 2 && index <= 7) {
            var currentPoints = Math.floor((actor._allocatedStats[index] || 0) / STAT_GAINS[index]);
            var newPoints = currentPoints + this._tempAlloc[index];
            var currentBonus = Math.floor(currentPoints / 5);
            var newBonus = Math.floor(newPoints / 5);
            bonusGained = (newBonus - currentBonus) * STAT_GAINS[index];
        }
        
        var totalGained = tempGained + bonusGained;
        
        var gaugeRate = Math.min((baseVal + totalGained) / cap, 1.0);
        var gaugeW = rect.width - 220;
        this.drawGauge(rect.x + 180, rect.y, gaugeW, gaugeRate, this.hpGaugeColor1(), this.hpGaugeColor2());

        this.changeTextColor(this.systemColor());
        this.drawText(statName, rect.x, rect.y, 160);
        this.resetTextColor();

        var valText = (baseVal + totalGained) + " / " + cap;
        if (totalGained > 0) this.changeTextColor(this.powerUpColor());
        if (bonusGained > 0) valText += " ★";
        this.drawText(valText, rect.x + 180 + gaugeW - 120, rect.y, 120, 'right');
        this.resetTextColor();
    };

    Window_StatAlloc.prototype.cursorRight = function(wrap) {
        var actor = $gameParty.menuActor();
        var index = this.index();
        var totalSparksSpent = this._tempAlloc.reduce(function(a, b){ return a + b; }, 0);
        
        var currentStat = actor.paramBase(index) + (this._tempAlloc[index] * STAT_GAINS[index]);
        
        var bonusIfAdded = 0;
        if (index >= 2 && index <= 7) {
            var currentPoints = Math.floor((actor._allocatedStats[index] || 0) / STAT_GAINS[index]);
            var newPoints = currentPoints + this._tempAlloc[index] + 1;
            var currentBonus = Math.floor(currentPoints / 5);
            var newBonus = Math.floor(newPoints / 5);
            bonusIfAdded = (newBonus - currentBonus) * STAT_GAINS[index];
        }
        
        var cap = actor.getStatCap(index);

        if (actor._unspentSparks > totalSparksSpent && (currentStat + STAT_GAINS[index] + bonusIfAdded) <= cap) {
            SoundManager.playCursor();
            this._tempAlloc[index]++;
            this.redrawItem(index);
            this.updateHubSparks();
        } else {
            SoundManager.playBuzzer();
        }
    };

    Window_StatAlloc.prototype.cursorLeft = function(wrap) {
        var index = this.index();
        if (this._tempAlloc[index] > 0) {
            SoundManager.playCancel();
            this._tempAlloc[index]--;
            this.redrawItem(index);
            this.updateHubSparks();
        }
    };

Window_StatAlloc.prototype.updateHubSparks = function() {
        if (this._hubWindow) {
            var totalSpent = this._tempAlloc.reduce(function(a, b){ return a + b; }, 0);
            this._hubWindow._tempSparksSpent = totalSpent;
            // NEW: Pass the temporary allocation array to the hub window
            this._hubWindow._tempAlloc = this._tempAlloc; 
            this._hubWindow.refresh();
        }
    };

    Window_StatAlloc.prototype.confirmAllocation = function() {
        var actor = $gameParty.menuActor();
        var totalSpent = this._tempAlloc.reduce(function(a, b){ return a + b; }, 0);
        
        if (totalSpent > 0) {
            SoundManager.playEquip(); 
            actor._unspentSparks -= totalSpent;
            for (var i = 0; i < 8; i++) {
                actor._allocatedStats[i] += (this._tempAlloc[i] * STAT_GAINS[i]);
            }
            
            // Hard wipe temp allocation BEFORE drawing the screen again 
            this.resetTempAlloc(); 
            this.refresh(); 
        } else {
            SoundManager.playBuzzer();
        }
    };

    Window_StatAlloc.prototype.updateHelp = function() {
        if (this._helpWindow) {
            this._helpWindow.setText(STAT_LORE[this.index()]);
        }
    };

})();