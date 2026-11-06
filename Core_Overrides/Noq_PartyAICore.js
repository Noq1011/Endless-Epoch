//=============================================================================
// Noq_PartyAICore.js
//=============================================================================

/*:
 * @plugindesc The primary engine, context builder, and gatekeeper for Party AI. + Hotkey Swapping
 * @author Your Name
 *
 * @help
 * This plugin replaces RPG Maker MV's default auto-battle logic with a
 * context-aware, priority-based AI system for party members.
 * * Includes hotkey support (Shift or 'T') to swap between Manual and 
 * AI-Tactics control on the fly.
 * * Features:
 * - Hotkey Control Swapping (Instantly turn AI on/off during your turn)
 * - Burnout management (prevents AI from overusing high-cost skills)
 * - Tactical healing & Guarding
 * - Interrupt detection (breaks enemy casting)
 * - Verse Resonance synergy (combos with active resonance)
 * - Personality-based action weighting
 * * Skill Note Tags:
 * <CoolsBurnout>       - This skill reduces Burnout
 * <BuildsBurnout>      - This skill increases Burnout significantly
 * <Heal>               - Forces AI to recognize this as a critical healing skill
 * <Regen>              - Regeneration/Heal-over-Time skill
 * <HealOverTime>       - Alternative tag for regen skills
 * <Shield>             - Shield/Barrier skill
 * <Barrier>            - Alternative tag for shield skills
 * <Guard>              - Defensive stance or shield skill
 * <Buff>               - Buff application skill
 * <Debuff>             - Debuff application skill
 * <Dispel>             - Remove enemy buffs
 * <Cleanse>            - Remove ally debuffs
 * <HarmonyStarter>     - Prioritize when no Verse is active
 * <HarmonyChain>       - Prioritize when a Verse is currently active
 * <Interrupt>          - This skill can interrupt enemy casting
 * <VerseType:X>        - This skill belongs to Verse type X
 * <Passive>            - This skill should not be used by AI
 * <NoAI>               - Excludes skill from the AI pool entirely
 * * ============================================================================
 */

(function() {
    'use strict';

    // =========================================================================
    // SYSTEM CONFIGURATION & HOTKEYS
    // =========================================================================
    var AI_TACTICS_STATE_ID = 49; // Must match your Auto-Battle State in the database!
    Input.keyMapper[84] = 'tactics'; // Map 'T' key

    Game_Actor.prototype.toggleAIControl = function() {
        if (this.isStateAffected(AI_TACTICS_STATE_ID)) {
            this.removeState(AI_TACTICS_STATE_ID);
            console.log(this.name() + " is now under Manual Control.");
        } else {
            this.addState(AI_TACTICS_STATE_ID);
            console.log(this.name() + " is acting on their own.");
        }
    };

    var _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        _Scene_Battle_update.call(this);
        if (this.isActive() && !this._isBusy) {
            if (Input.isTriggered('tactics') || Input.isTriggered('shift')) {
                this.cycleActiveLeaderForward();
            }
        }
    };

    Scene_Battle.prototype.cycleActiveLeaderForward = function() {
        var members = $gameParty.battleMembers();
        if (members.length <= 1) return;

        var currentIndex = -1;
        for (var i = 0; i < members.length; i++) {
            if (!members[i].isStateAffected(AI_TACTICS_STATE_ID)) {
                currentIndex = i;
                break;
            }
        }
        if (currentIndex === -1) currentIndex = 0;

        var currentLeader = members[currentIndex];
        currentLeader.addState(AI_TACTICS_STATE_ID);

        var nextIndex = currentIndex + 1;
        if (nextIndex >= members.length) nextIndex = 0;

        var nextLeader = members[nextIndex];
        nextLeader.removeState(AI_TACTICS_STATE_ID);

        SoundManager.playEquip();
        if (typeof pushToFeed === "function") {
            pushToFeed("Manual Control: " + nextLeader.name(), "system");
        }

        if (currentLeader === BattleManager.actor() && BattleManager.isInputting()) {
            if (this._noqCircularCmd && this._noqCircularCmd.active) {
                this._noqCircularCmd.deactivate();
                this._noqCircularCmd.visible = false;
            }
            if (this._actorCommandWindow) this._actorCommandWindow.close();
            currentLeader.makeAutoBattleActions();
            BattleManager.selectNextCommand(); 
        }
    };

    // ==========================================================
    // 1. THE CONTEXT BUILDER (The Lag Killer)
    // ==========================================================
    Game_Actor.prototype.buildCombatContext = function() {
        var aliveAllies = $gameParty.aliveMembers();
        var aliveEnemies = $gameTroop.aliveMembers();
        
        var ctx = {
            myBurnoutLevel: typeof this.burnoutRate === 'function' ? this.burnoutRate() : 0,
            myHpRate: this.hpRate(),
            myMpRate: this.mpRate(),
            partyAvgHp: 0,
            lowestHpAlly: aliveAllies[0],
            lowestMpAlly: aliveAllies[0],
            criticalAllies: 0,
            injuredAllies: 0,
            debuffedAllies: [],
            aliveEnemies: aliveEnemies.length,
            mostDangerousEnemy: aliveEnemies[0],
            buffedEnemies: [],
            debuffedEnemies: [],
            isEnemyCasting: false,
            isBossFight: false,
            turnCount: $gameTroop.turnCount(),
            isFirstTurn: $gameTroop.turnCount() <= 1,
            reservedHealTargets: {},
            plannedInterrupts: {},
            targetedByAllies: {}
        };
        
        var totalHp = 0;
        var highestThreat = -1;

        // --- ADVANCED ENEMY SCANNER ---
        for (var j = 0; j < aliveEnemies.length; j++) {
            var enemy = aliveEnemies[j];
            
            // 1. STATIC CACHE (Runs exactly ONCE per enemy, saving massive CPU)
            if (!enemy._aiCachedRole) {
                var note = enemy.enemy().note || "";
                enemy._aiCachedRole = /<verseStat>/i.test(note) ? "Mage" : (/<defenseStat>/i.test(note) ? "Tank" : "Fighter");
                enemy._aiCachedVerse = enemy._verseChoice ? enemy._verseChoice.toLowerCase() : "none";
            }
            
            // 2. DYNAMIC CHECKS (Runs every turn)
            var isSilenced = enemy.states().some(function(s) { return s.meta.Silence || s.meta.Void; }); 
            var cannotMove = enemy.restriction() === 4; // Native MV check for Stun/Sleep/Paralyze
            
            enemy._aiIsSilenced = isSilenced;
            enemy._aiCannotMove = cannotMove;
            
            // 3. Calculate True Threat (Respects scaling and current silence/stun state)
            var threat = enemy.atk;
            if (!isSilenced && !cannotMove) {
                threat += (enemy._aiCachedRole === "Mage") ? (enemy.mat * 1.5) : (enemy.mat * 0.5);
            } else if (cannotMove) {
                threat *= 0.5; // A stunned enemy is a much lower immediate threat!
            }
            
            // 4. Update Global Context
            if (threat > highestThreat) {
                highestThreat = threat;
                ctx.mostDangerousEnemy = enemy;
            }
            if (enemy.states().some(function(s) { return s.meta.Buff; })) ctx.buffedEnemies.push(enemy);
            if (enemy.states().some(function(s) { return s.meta.Debuff; })) ctx.debuffedEnemies.push(enemy);
            if (enemy.isCharging && enemy.isCharging()) ctx.isEnemyCasting = true;
            if (enemy.enemy().meta.Boss) ctx.isBossFight = true;
        }
        
        ctx.partyAvgHp = totalHp / aliveAllies.length;

        for (var j = 0; j < aliveEnemies.length; j++) {
            var enemy = aliveEnemies[j];
            var threat = enemy.atk + (enemy.mat * 0.5);
            if (threat > highestThreat) {
                highestThreat = threat;
                ctx.mostDangerousEnemy = enemy;
            }
            if (enemy.states().some(function(s) { return s.meta.Buff; })) ctx.buffedEnemies.push(enemy);
            if (enemy.states().some(function(s) { return s.meta.Debuff; })) ctx.debuffedEnemies.push(enemy);
            if (enemy.isCharging && enemy.isCharging()) ctx.isEnemyCasting = true;
            if (enemy.enemy().meta.Boss) ctx.isBossFight = true;
        }
        
        return ctx;
    };

    // =========================================================================
    // ENGINE HELPERS & ACTION POOL
    // =========================================================================
    Game_Actor.prototype.getInterruptChance = function(skill) {
        if (!skill || !skill.meta) return 0;
        var raw = skill.meta["ATB Interrupt"];
        return raw ? Number(String(raw).replace('%', '')) || 0 : 0;
    };

    Game_Actor.prototype.getSkillSpeed = function(skill) {
        return skill.speed || 0;
    };

    Game_Actor.prototype.getActionPool = function() {
        var pool = this.skills().filter(function(skill) {
            return skill && this.canUse(skill);
        }, this);

        var attackSkill = $dataSkills[this.attackSkillId()];
        var defendSkill = $dataSkills[this.guardSkillId()];
        if (!pool.contains(attackSkill)) pool.push(attackSkill);
        if (!pool.contains(defendSkill)) pool.push(defendSkill);

        var battleItems = $gameParty.items().filter(function(item) {
            return item && item.meta["AI Use"] && this.canUse(item);
        }, this);
        
        pool = pool.concat(battleItems);
        var filtered = [];
        this._disabledAISkills = this._disabledAISkills || [];

        for (var j = 0; j < pool.length; j++) {
            var actionObj = pool[j];
            if (!actionObj) continue;
            if (DataManager.isSkill(actionObj) && this._disabledAISkills.contains(actionObj.id)) continue;
            if (actionObj.meta.Passive || actionObj.meta.NoAI) continue;
            filtered.push(actionObj);
        }
        return filtered;
    };

    // ==========================================================
    // 2. THE MAIN EVALUATION LOOP
    // ==========================================================
    Game_Actor.prototype.makeAutoBattleActions = function() {
        if (this._aiSkillIdIntent && this._aiTarget) {
            var isItem = this._aiIsItemIntent;
            var lockedObj = isItem ? $dataItems[this._aiSkillIdIntent] : $dataSkills[this._aiSkillIdIntent];
            
            var isRevive = lockedObj.meta.Revive || (lockedObj.meta["AI Category"] && lockedObj.meta["AI Category"].trim().toUpperCase() === "REVIVE");
            var isTargetInvalid = this._aiTarget.isDead() && !isRevive;
            
            if (!this.canUse(lockedObj) || isTargetInvalid) {
                this._aiSkillIdIntent = null; 
                this._aiTarget = null;
            } else {
                for (var i = 0; i < this.numActions(); i++) {
                    var action = new Game_Action(this);
                    if (isItem) action.setItem(lockedObj.id);
                    else action.setSkill(lockedObj.id);
                    action._targetIndex = this._aiTarget.index();
                    this.setAction(i, action);
                }
                this.setActionState('waiting');
                return;
            }
        }

        var context = this.buildCombatContext();
        var pool = this.getActionPool ? this.getActionPool() : [];
        var bestSkill = null;
        var bestTarget = null;
        var bestScore = -Infinity; 

		pool.forEach(function(skill) {
            var targets = [];
            if ([1,2,3,4,5,6].indexOf(skill.scope) >= 0) targets = $gameTroop.aliveMembers();
            else if ([7,8].indexOf(skill.scope) >= 0) targets = $gameParty.aliveMembers();
            else if ([9,10].indexOf(skill.scope) >= 0) targets = $gameParty.deadMembers(); // THE FIX!
            else targets = [this];

            targets.forEach(function(target) {
                if (context.reservedHealTargets[target.index()] && (skill.meta["AI Category"] === "HP" || skill.damage.type === 3)) return;
                var score = this.scoreAction(skill, context, target);
                if (score > bestScore) {
                    bestScore = score;
                    bestSkill = skill;
                    bestTarget = target;
                }
            }, this);
        }, this);

        if (!bestSkill || bestScore <= 0) {
            bestSkill = this.canUse($dataSkills[this.attackSkillId()]) ? 
                        $dataSkills[this.attackSkillId()] : $dataSkills[this.guardSkillId()];
            bestTarget = $gameTroop.aliveMembers()[0] || this;
        }

        this._aiSkillIdIntent = bestSkill.id;
        this._aiIsItemIntent = DataManager.isItem(bestSkill);
        this._aiTarget = bestTarget;
        this._aiTargetIndexIntent = bestTarget.index();
        this._aiSkillName = bestSkill.name;

        for (var k = 0; k < this.numActions(); k++) {
            var action = new Game_Action(this);
            if (this._aiIsItemIntent) action.setItem(bestSkill.id);
            else action.setSkill(bestSkill.id);
            action._targetIndex = this._aiTargetIndexIntent;
            this.setAction(k, action);
        }
        this.setActionState('waiting');
		
// --- VISUAL & ENGINE SYNCHRONIZATION ---
    this.setActionState('waiting'); 
    this.requestMotionRefresh(); // Snap to Chanting pose
    
    // The safe Yanfly ATB handshake
    if (typeof BattleManager.isATB === 'function' && BattleManager.isATB()) {
        BattleManager.selectNextCommand(); 
    }
    };

    // ==========================================================
    // 3. THE SCORING ENGINE (The Bouncer & Modulator)
    // ==========================================================
    Game_Actor.prototype.scoreAction = function(skill, context, target) {
        if (!target || !skill) return -9999;

        var isAlly = target.isActor();
        var isEnemy = target.isEnemy();
        var isConfused = this.isStateAffected(8) || this.isStateAffected(18);

        var targetIsTraitor = false;
        if (isAlly) {
            if (target.isStateAffected(8) || target.isStateAffected(18) || target.states().some(function(s) { return s.meta.Corruption || s.meta.NoHeal; })) {
                targetIsTraitor = true;
            }
        }

        if (!isConfused) {
            if ([1, 2, 5, 6].indexOf(skill.damage.type) >= 0 && isAlly) return -9999;
            var isHealSkill = (skill.damage.type === 3 || skill.damage.type === 4 || skill.meta.Heal || skill.meta.Buff || skill.meta.Regen);
            if (isHealSkill && (isEnemy || targetIsTraitor)) return -9999;
            if (skill.id === this.attackSkillId() && isAlly) return -9999;

            if (DataManager.isItem(skill)) {
                var category = skill.meta["AI Category"] ? skill.meta["AI Category"].trim().toUpperCase() : "";
                if (["HP", "MP", "REVIVE", "BUFF"].indexOf(category) >= 0 && (isEnemy || targetIsTraitor)) return -9999;
                if (category === "DEBUFF" && isAlly) return -9999;
            }
        }

        if (skill.scope === 11 && target !== this) return -9999;
        if ([9, 10].indexOf(skill.scope) >= 0 && target.isAlive()) return -9999;
        if ([7, 8].indexOf(skill.scope) >= 0 && target.isDead()) return -9999;

        var score = 0;
        var isVerse = !!skill.meta.Verse; 
        var isTechnique = !!skill.meta.Technique; 
        
        if (isEnemy && isVerse) score += 800; 
        if (isEnemy && isTechnique) score += 300; 
        
        if (typeof this.scoreTactics === 'function') score += this.scoreTactics(skill, context, target);
        if (typeof this.scorePersonality === 'function') score += this.scorePersonality(skill, context, target);

        score += (Math.random() * 5); 
        return score;
    };

    // =========================================================================
    // UI HOOKS & EXECUTION CLEANUP
    // =========================================================================
    if (typeof Window_NoQTargetStatus !== "undefined") {
        var _Window_NoQTargetStatus_refresh = Window_NoQTargetStatus.prototype.refresh;
        Window_NoQTargetStatus.prototype.refresh = function() {
            _Window_NoQTargetStatus_refresh.call(this);
            var target = window.NoqTargetStatusPanel ? window.NoqTargetStatusPanel.getTarget() : null;
            if (!target) return;

            var targetingAllies = [];
            var members = $gameParty.battleMembers();
            for (var i = 0; i < members.length; i++) {
                if (members[i]._aiTarget === target) targetingAllies.push(members[i]);
            }

            if (targetingAllies.length > 0) {
                this.contents.fontSize = 16;
                var startY = this.contents.height - (targetingAllies.length * 20);
                for (var j = 0; j < targetingAllies.length; j++) {
                    var actor = targetingAllies[j];
                    var text = "► " + actor.name() + " preparing " + actor._aiSkillName;
                    this.changeTextColor(this.textColor(14));
                    this.drawText(text, 0, startY + (j * 20), this.contents.width, 'left');
                }
                this.resetTextColor();
                this.contents.fontSize = this.standardFontSize();
            }
        };
    }

    var _Noq_Game_Actor_performActionEnd = Game_Actor.prototype.performActionEnd;
    Game_Actor.prototype.performActionEnd = function() {
        if (_Noq_Game_Actor_performActionEnd) _Noq_Game_Actor_performActionEnd.call(this);
        if (this._aiSkillIdIntent) {
            if (this._lastExecutedAISkillId === this._aiSkillIdIntent) {
                this._aiConsecutiveUses = (this._aiConsecutiveUses || 0) + 1;
            } else {
                this._lastExecutedAISkillId = this._aiSkillIdIntent;
                this._aiConsecutiveUses = 1;
            }
        }
        this._aiTarget = null;
        this._aiSkillName = null;
        this._aiSkillIdIntent = null;
        this._aiHasBroadcasted = false;
    };

    var _Noq_Game_Actor_removeState = Game_Actor.prototype.removeState;
    Game_Actor.prototype.removeState = function(stateId) {
        _Noq_Game_Actor_removeState.call(this, stateId);
        if (stateId === AI_TACTICS_STATE_ID) {
            this._aiTarget = null;
            this._aiSkillName = null;
            this._aiSkillIdIntent = null;
            this._aiHasBroadcasted = false;
        }
    };

    var _Noq_Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    Game_Action.prototype.makeTargets = function() {
        var battler = this.subject();
        if (battler.isActor() && battler._aiTarget && battler._aiSkillIdIntent === this.item().id) {
            var forcedTarget = battler._aiTarget;
            if (forcedTarget.isAlive()) return [forcedTarget];
        }
        return _Noq_Game_Action_makeTargets.call(this);
    };

    var _BM_startInput = BattleManager.startInput;
    BattleManager.startInput = function() {
        _BM_startInput.call(this);
        $gameParty.members().forEach(function(m) { m._isBeingHealedByAI = false; });
        $gameTroop.members().forEach(function(m) { m._isBeingHealedByAI = false; });
    };

    var _Game_Action_apply_interrupt_check = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        var skill = this.item();
        if (skill && (skill.meta.Interrupt || skill.name === "Shield Bash")) {
            if (target && target.isEnemy && target.isEnemy()) {
                var isStillCharging = target._ubc_lockActive || false; 
                if (!isStillCharging) {
                    var subject = this.subject();
                    this.setSkill(subject.attackSkillId()); 
                    if (typeof BattleFeedPush === "function") {
                        BattleFeedPush({ text: subject.name() + " was too late! Switching to attack.", kind: "system" });
                    }
                }
            }
        }
        _Game_Action_apply_interrupt_check.call(this, target);
    };

    // =========================================================================
    // CONFIG MANAGER & AUTO-START
    // =========================================================================
    ConfigManager.autoBattleParty = true;
    var _ConfigManager_makeData = ConfigManager.makeData;
    ConfigManager.makeData = function() {
        var config = _ConfigManager_makeData.call(this);
        config.autoBattleParty = this.autoBattleParty;
        return config;
    };

    var _ConfigManager_applyData = ConfigManager.applyData;
    ConfigManager.applyData = function(config) {
        _ConfigManager_applyData.call(this, config);
        this.autoBattleParty = this.readFlag(config, 'autoBattleParty', true);
    };

    var _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
    Window_Options.prototype.addGeneralOptions = function() {
        _Window_Options_addGeneralOptions.call(this);
        this.addCommand('Party Auto-Battle', 'autoBattleParty');
    };

    var _Game_Party_onBattleStart = Game_Party.prototype.onBattleStart;
    Game_Party.prototype.onBattleStart = function() {
        _Game_Party_onBattleStart.call(this);
        var members = this.battleMembers();
        for (var i = 0; i < members.length; i++) {
            var actor = members[i];
            if (ConfigManager.autoBattleParty && i > 0) actor.addState(AI_TACTICS_STATE_ID);
            else actor.removeState(AI_TACTICS_STATE_ID);
        }
    };

})();