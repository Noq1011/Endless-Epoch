/*:
 * @plugindesc v2.5 — Musical Victory Engine (Spoils of War + ATB-Safe Hooks)
 * @author Gemini
 */

var MusicalVictory = MusicalVictory || {};

(function() {
    console.log("--- [Musical Victory Engine v2.5] Initializing... ---");

    var _BManager_setup = BattleManager.setup;
    BattleManager.setup = function(troopId, canEscape, canLose) {
        _BManager_setup.call(this, troopId, canEscape, canLose);
        this.initMusicalTracker();
    };

    BattleManager.initMusicalTracker = function() {
        this._vStats = {
            startTime: Date.now(),
            burnoutTriggers: 0,
            harmonyCombos: 0,
            trueHarmonyBreaks: 0, 
            verseTriggers: 0,
            recoveryActions: 0,
            totalActions: 0     
        };
        
        var pAtk = $gameParty.aliveMembers().reduce((sum, a) => sum + a.atk + a.mat, 0);
        var eRes = $gameTroop.members().reduce((sum, e) => {
            return sum + (e.param(0) / Math.max(1, e.param(3) + e.param(5)));
        }, 0);
        var cpRatio = (pAtk / Math.max(1, eRes)); 
        this._vStats.parTime = Math.max(45, 240 - (cpRatio * 5)); 

        console.log(`[Victory] S-Rank Goal: ${this._vStats.parTime.toFixed(0)}s (CP Ratio: ${cpRatio.toFixed(2)})`);
    };

    var _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        if (this.subject().isActor() && $gameParty.inBattle() && BattleManager._vStats) {
            if (!this._mvTrackedAction) {
                BattleManager._vStats.totalActions++;
                this._mvTrackedAction = true;
                
                var item = this.item();
                if (item && (item.damage.type === 3 || item.damage.type === 4)) {
                    BattleManager._vStats.recoveryActions++;
                }
            }
        }
    };

    var _Game_BattlerBase_addState = Game_BattlerBase.prototype.addState;
    Game_BattlerBase.prototype.addState = function(stateId) {
        _Game_BattlerBase_addState.call(this, stateId);
        if (this.isActor() && $gameParty.inBattle() && BattleManager._vStats) {
            var burnoutStateId = (window.UBS && window.UBS.DEFAULT_BURNOUT_STATE_ID) ? window.UBS.DEFAULT_BURNOUT_STATE_ID : 17;
            if (stateId === burnoutStateId) {
                BattleManager._vStats.burnoutTriggers++;
            }
        }
    };

    var _BManager_processVictory = BattleManager.processVictory;
    BattleManager.processVictory = function() {
        this.calculateFinalMusicalGrade();
        this.displayMusicalGrades();
        _BManager_processVictory.call(this);
    };

    BattleManager.calculateFinalMusicalGrade = function() {
        var v = this._vStats;
        var duration = (Date.now() - v.startTime) / 1000;

        var timeScore = 110 - (duration / v.parTime * 30);
        timeScore = Math.max(0, Math.min(100, timeScore));

        var survScore = 100;
        survScore -= (v.burnoutTriggers * 20); 
        var healRatio = v.recoveryActions / Math.max(1, v.totalActions);
        if (healRatio > 0.20) {
            var excess = (healRatio - 0.20) * 100; 
            survScore -= (excess * 2.5); 
        }
        var avgHp = $gameParty.aliveMembers().reduce((sum, a) => sum + a.hpRate(), 0) / $gameParty.aliveMembers().length;
        survScore = (survScore * 0.7) + (avgHp * 30); 
        survScore = Math.max(0, Math.min(100, survScore));

        var styleScore = 80 + (v.harmonyCombos * 12) + (v.verseTriggers * 8);
        styleScore -= (v.trueHarmonyBreaks * 20);
        styleScore = Math.max(0, Math.min(100, styleScore));

        var finalScore = (timeScore * 0.5) + (survScore * 0.25) + (styleScore * 0.25);
        
        this._musicalGrades = {
            time: this.getGradeLetter(timeScore),
            survivability: this.getGradeLetter(survScore),
            style: this.getGradeLetter(styleScore),
            total: this.getGradeLetter(finalScore),
            healRatio: (healRatio * 100).toFixed(1) + "%",
            rawFinal: finalScore
        };
        console.log(`[Victory Stats] Final Score: ${finalScore.toFixed(1)}`);
    };

    BattleManager.displayMusicalGrades = function() {
        var g = this._musicalGrades;
        $gameMessage.add("\\C[16]Battle Performance:\\C[0]");
        $gameMessage.add("Time: " + g.time + "  |  Style: " + g.style);
        $gameMessage.add("Survivability: " + g.survivability + " (Heal Ratio: " + g.healRatio + ")");
        $gameMessage.add("\\C[14]Final Rank: " + g.total + "\\C[0]");
    };

    BattleManager.getGradeLetter = function(score) {
        if (score >= 90) return 'S'; 
        if (score >= 80) return 'A'; 
        if (score >= 65) return 'B'; 
        if (score >= 45) return 'C'; 
        return 'D';
    };

    // ===================================================================
    // THE SPOILS OF WAR: REWARD MULTIPLIERS
    // ===================================================================

    // 1. Hooking Gold and EXP
    var _BManager_makeRewards = BattleManager.makeRewards;
    BattleManager.makeRewards = function() {
        // Run default generator first
        _BManager_makeRewards.call(this);

        var rank = this._musicalGrades ? this._musicalGrades.total : 'C';
        var expGoldMult = 1.0;

        if (rank === 'S') expGoldMult = 2.0;
        else if (rank === 'A') expGoldMult = 1.5;
        else if (rank === 'B') expGoldMult = 1.2;
        else if (rank === 'D') expGoldMult = 0.5;

        this._rewards.exp = Math.round(this._rewards.exp * expGoldMult);
        this._rewards.gold = Math.round(this._rewards.gold * expGoldMult);
        
        if (expGoldMult !== 1.0) {
            console.log(`[Victory Rewards] Base EXP/Gold multiplied by ${expGoldMult}x (Rank ${rank})`);
        }
    };

    // 2. Hooking Item Drop Probabilities and Quantities
    var _Game_Enemy_makeDropItems = Game_Enemy.prototype.makeDropItems;
    Game_Enemy.prototype.makeDropItems = function() {
        var rank = BattleManager._musicalGrades ? BattleManager._musicalGrades.total : 'C';
        var probMult = 1.0;
        var qtyMult = 1;

        if (rank === 'S') { probMult = 2.0; qtyMult = 2; }
        else if (rank === 'A') { probMult = 1.5; }
        else if (rank === 'B') { probMult = 1.2; }
        else if (rank === 'D') { probMult = 0.5; }

        return this.enemy().dropItems.reduce(function(r, di) {
            if (di.kind > 0) {
                var rate = this.dropItemRate(); // Default MV rate (1x or 2x if party has drop double ability)
                var currentProb = probMult;
                var currentQty = qtyMult;

                // STRICT RULE: If it's a Weapon (2) or Armor (3), ignore the grade boosts.
                if (di.kind === 2 || di.kind === 3) {
                    currentProb = 1.0;
                    currentQty = 1;
                }

                // Apply our probability multiplier to the drop chance
                rate *= currentProb;

                // RNG check against the item's denominator (e.g., a 1/10 drop means denominator is 10)
                if (Math.random() * di.denominator < rate) {
                    var item = this.itemObject(di.kind, di.dataId);
                    
                    // Push the item to the reward array. If S-Rank, loop twice to give double quantity.
                    for (var i = 0; i < currentQty; i++) {
                        r.push(item);
                    }
                    console.log(`[Victory Rewards] Dropped: ${item.name} x${currentQty} (Prob Mult applied: ${currentProb}x)`);
                }
            }
            return r;
        }.bind(this), []);
    };

})();