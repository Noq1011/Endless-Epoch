//=============================================================================
// PartyMemberAI.js
//=============================================================================

/*:
 * @plugindesc Deterministic AI system for Auto-Battle Party Members + Hotkey Swapping
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
    // CONFIGURATION
    // =========================================================================
    var AI_TACTICS_STATE_ID = 49; 

    // Map 'T' key to 'tactics' (Shift is natively mapped)
    Input.keyMapper[84] = 'tactics';

    //=============================================================================
    // Game_Actor - State Toggle
    //=============================================================================
    
    Game_Actor.prototype.toggleAIControl = function() {
        if (this.isStateAffected(AI_TACTICS_STATE_ID)) {
            this.removeState(AI_TACTICS_STATE_ID);
            console.log(this.name() + " is now under Manual Control.");
        } else {
            this.addState(AI_TACTICS_STATE_ID);
            console.log(this.name() + " is acting on their own.");
        }
    };

    //=============================================================================
    // Scene_Battle - Real-Time Single-Key Swapping (Shift / T)
    //=============================================================================

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

    //=============================================================================
    // Enhanced Combat Context Builder
    //=============================================================================
	
	Game_Actor.prototype.getInterruptChance = function(skill) {
    if (!skill || !skill.meta) return 0;

    var raw = skill.meta["ATB Interrupt"];
    if (!raw) return 0;

    return Number(String(raw).replace('%', '')) || 0;
};

Game_Actor.prototype.getSkillSpeed = function(skill) {
    return skill.speed || 0;
};


    //=============================================================================
    // Action Pool Builder
    //=============================================================================

		Game_Actor.prototype.getActionPool = function() {
        // 1. RAW SKILLS: Only use skills the actor has actually learned/assigned
        // This replaces "usableSkills()" to stop Isahn from using Ghost Skills.
        var pool = this.skills().filter(function(skill) {
            return skill && this.canUse(skill);
        }, this);

        // Explicitly add Attack and Guard (in case they aren't in the learned list)
        var attackSkill = $dataSkills[this.attackSkillId()];
        var defendSkill = $dataSkills[this.guardSkillId()];
        if (!pool.contains(attackSkill)) pool.push(attackSkill);
        if (!pool.contains(defendSkill)) pool.push(defendSkill);

        // 2. THE BATTLE BAG: Only inject items tagged with <AI Use>
        // This solves the 200-item inventory flooding issue.
        var battleItems = $gameParty.items().filter(function(item) {
            return item && item.meta["AI Use"] && this.canUse(item);
        }, this);
        
        pool = pool.concat(battleItems);

        // 3. FINAL FILTER: Player Toggles & Safety
        var filtered = [];
        this._disabledAISkills = this._disabledAISkills || [];

        for (var j = 0; j < pool.length; j++) {
            var actionObj = pool[j];
            if (!actionObj) continue;
            
            // Toggle Check: Respect the Tactics Menu [OFF] switches
            if (DataManager.isSkill(actionObj)) {
                if (this._disabledAISkills.contains(actionObj.id)) continue;
            }
            
            // Metadata Filter: Skip passives or things explicitly hidden from AI
            if (actionObj.meta.Passive) continue;
            if (actionObj.meta.NoAI) continue;
            
            filtered.push(actionObj);
        }
        
        return filtered;
    };

    //=============================================================================
    // Enhanced Scoring Engine
    //=============================================================================

    Game_Actor.prototype.scoreAction = function(skill, context, target) {
		
			var score = 0
	

		

        // ==========================================================
        // NEW LAYER 2: BEHAVIOR MODES & ROLES
        // ==========================================================
        var modeVarId = 150 + this.actorId();
        var aiMode = $gameVariables.value(modeVarId); 

        if (aiMode === 1) { // Mode 1: Conserve Energy
            if (skill.meta.BuildsBurnout) score -= 500;
            if (this.mpRate() < 0.5) score -= 200;
        } else if (aiMode === 3 && isEnemy && !isLethal) { // Mode 3: Focus Support
            score -= 600; // Tank offensive scores unless it's a guaranteed kill
        } else if (aiMode === 0) { // Mode 0: Default Lore Behavior
            if (this.actorId() === 4) { // Isahn
                if (skill.id === this.attackSkillId() || skill.hitType === 1) score -= 250;
                if (context.partyAvgHp < 0.75 && isEnemy) score -= 400;
            } else if (this.actorId() === 2) { // Malin
                if (isEnemy) score += 100;
                if (isLethal) score += 500; 
            }
        }
		
		// ==========================================================
        // NEW LAYER: EMERGENCY MP CONSERVATION (Forward-Thinking Healers)
        // ==========================================================
        // Determine if there is an active emergency (someone is near death)
        var isEmergency = (context.criticalAllies > 0 || (context.lowestHpAlly && context.lowestHpAlly.hpRate() < 0.35));
        
        // Identify if this actor is supposed to be looking out for the party
        // (Includes Isahn, Luneyva, or anyone currently set to Mode 3: Support)
        var isDesignatedHealer = (aiMode === 3 || this.actorId() === 4 || this.name() === "Luneyva");

        if (isEmergency && isDesignatedHealer) {
            
            // 1. THE MP LOCK: If the skill is an attack on the enemy that costs MP, 
            // severely penalize it. Save the MP for the heal! (Unless it's a lethal kill shot).
            if (isEnemy && this.skillMpCost(skill) > 0 && !isLethal) {
                score -= 800; 
            }

            // 2. THE RECOVERY PRIORITY: If their MP is low enough that they likely 
            // can't afford the heal, prioritize moves that boost MP regeneration.
            if (this.mpRate() < 0.45) { // Adjust this threshold based on your max MP pools
                if (skill.id === 7 || skill.name === "Wait") {
                    score += 800; // Wait gives 15% (Optimal Recovery)
                } else if (skill.id === this.guardSkillId()) {
                    score += 150; // Guard gives 10% but costs 10 (Safe Recovery)
                } else if (skill.id === this.attackSkillId()) {   
					score += 150; // Basic attacks cost 0 MP (Better than wasting MP) can also add skills that don't waste mp
				}
            }
        }

		
		
        


        // ==========================================================
        // B3. PROACTIVE SHIELDING (Bubble Shield)
        // ==========================================================
        if (skill.meta.Shield || skill.meta.Barrier) {
            var shieldStateId = 0;
            for (var j = 0; j < skill.effects.length; j++) {
                if (skill.effects[j].code === 21 && skill.effects[j].dataId > 0) {
                    shieldStateId = skill.effects[j].dataId; break;
                }
            }
            
            if (shieldStateId > 0 && isAlly) {
                // HARD STOP: Do not stack shields
                if (target.isStateAffected(shieldStateId)) return -9999;
                
                score += 200; // Base shield value
                
                // PREDICTIVE DEFENSE: Is an enemy targeting this ally right now?
                var isBeingTargeted = false;
                $gameTroop.aliveMembers().forEach(function(enemy) {
                    if (enemy._targetIndex === target.index() || enemy._aiTarget === target) {
                        isBeingTargeted = true;
                    }
                });

                if (isBeingTargeted) {
                    score += 600; // Massive boost: Protect them from the incoming hit!
                    if (target.hpRate() < 0.40) score += 400; // Shielding a dying ally being targeted
                }
                
                if (context.isBossFight) score += 300; // Shields are always good in boss fights
            }
        }

        // ==========================================================
        // B4. BURNOUT PREDICTION & COOLING (Aquaphor Logic)
        // ==========================================================

	
		
       

       

        // ==========================================================
        // G. FUZZY TIE-BREAKER
        // ==========================================================
        score += (Math.random() * 5); // Prevents endless loops on identical scores
        


    //=============================================================================
    // ConfigManager - System Options
    //=============================================================================

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

    //=============================================================================
    // Window_Options
    //=============================================================================

    var _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
    Window_Options.prototype.addGeneralOptions = function() {
        _Window_Options_addGeneralOptions.call(this);
        this.addCommand('Party Auto-Battle', 'autoBattleParty');
    };

    //=============================================================================
    // Game_Party - Auto-Start AI
    //=============================================================================
    
    var _Game_Party_onBattleStart = Game_Party.prototype.onBattleStart;
    Game_Party.prototype.onBattleStart = function() {
        _Game_Party_onBattleStart.call(this);
        
        var members = this.battleMembers();
        
        for (var i = 0; i < members.length; i++) {
            var actor = members[i];
            
            if (ConfigManager.autoBattleParty && i > 0) {
                actor.addState(AI_TACTICS_STATE_ID);
            } else {
                actor.removeState(AI_TACTICS_STATE_ID);
            }
        }
    };

    //=============================================================================
    // Debug Logging
    //=============================================================================
    
    Game_Actor.prototype.debugAI = false;

    var _Game_Actor_scoreAction = Game_Actor.prototype.scoreAction;
    Game_Actor.prototype.scoreAction = function(skill, context, target) {
        if (target && skill) {
            var isAlly = target.isActor();
            var isEnemy = target.isEnemy();
            
            if ([1, 2, 3, 4, 5, 6].indexOf(skill.scope) >= 0 && isAlly) return -9999;
            if ([7, 8, 9, 10, 11].indexOf(skill.scope) >= 0 && isEnemy) return -9999;
            if (skill.scope === 11 && target !== this) return -9999;
            if ([9, 10].indexOf(skill.scope) >= 0 && target.isAlive()) return -9999;
            if ([7, 8].indexOf(skill.scope) >= 0 && target.isDead()) return -9999;
            
            if ([1, 2, 5, 6].indexOf(skill.damage.type) >= 0) {
                var elementId = skill.damage.elementId;
                if (elementId < 0) elementId = this.attackElements()[0];
                
                var eleRate = target.elementRate(elementId);
                if (eleRate <= 0) return -9999;
            }
        }

        var score = _Game_Actor_scoreAction.call(this, skill, context, target);
        
        if (skill.name === "Shield Bash" || skill.meta.Interrupt) {
            if (target && target.isEnemy()) {
                var isTargetCharging = target.isCharging ? target.isCharging() : false;

                if (isTargetCharging) {
                    score += 200;
                } else {
                    score -= 50;
                }
            }
        }

        if (this._lastExecutedAISkillId === skill.id) {
            var penalty = (this._aiConsecutiveUses || 0) * 300;
            score -= penalty;
        }
        
        if (this.debugAI) {
            var targetName = target ? target.name() : "Self/None";
            if (score > -5000) {
                console.log("[AI] " + this.name() + ": " + skill.name + " on " + targetName + " scored " + score);
            }
        }
        
        return score;
    };

    //=============================================================================
    // NoqTargetStatus Integration
    //=============================================================================
    
    if (typeof Window_NoQTargetStatus !== "undefined") {
        var _Window_NoQTargetStatus_refresh = Window_NoQTargetStatus.prototype.refresh;
        
        Window_NoQTargetStatus.prototype.refresh = function() {
            _Window_NoQTargetStatus_refresh.call(this);
            
            var target = window.NoqTargetStatusPanel.getTarget();
            if (!target) return;

            var targetingAllies = [];
            var members = $gameParty.battleMembers();
            for (var i = 0; i < members.length; i++) {
                if (members[i]._aiTarget === target) {
                    targetingAllies.push(members[i]);
                }
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

    //=============================================================================
    // Execution Logic & Cleanup
    //=============================================================================
    
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
        
        var tacticId = (typeof AI_TACTICS_STATE_ID !== "undefined") ? AI_TACTICS_STATE_ID : -1;
        if (stateId === tacticId) {
            this._aiTarget = null;
            this._aiSkillName = null;
            this._aiSkillIdIntent = null;
            this._aiHasBroadcasted = false;
        }
    };

    //=============================================================================
    // Target Lock
    //=============================================================================
    
    var _Noq_Game_Action_makeTargets = Game_Action.prototype.makeTargets;
    
    Game_Action.prototype.makeTargets = function() {
        var battler = this.subject();
        
        if (battler.isActor() && battler._aiTarget && battler._aiSkillIdIntent === this.item().id) {
            var forcedTarget = battler._aiTarget;
            
            if (forcedTarget.isAlive()) {
                return [forcedTarget];
            }
        }
        
        return _Noq_Game_Action_makeTargets.call(this);
    };
	
	// --- GLOBAL HOOK: CLEAR CLAIMS AT TURN START ---
var _BM_startInput = BattleManager.startInput;
BattleManager.startInput = function() {
    _BM_startInput.call(this);
    
    // Clear the board for both party and troop so the AI re-evaluates fresh
    $gameParty.members().forEach(function(m) { m._isBeingHealedByAI = false; });
    $gameTroop.members().forEach(function(m) { m._isBeingHealedByAI = false; });
};

var _Game_Action_apply_interrupt_check = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        var skill = this.item();
        if (skill && (skill.meta.Interrupt || skill.name === "Shield Bash")) {
            if (target.isEnemy && target.isEnemy()) {
                var isStillCharging = target._ubc_lockActive || false; // Check UBS charge state
                if (!isStillCharging) {
                    var subject = this.subject();
                    this.setSkill(subject.attackSkillId()); // Switch to punch if too late
                    if (typeof BattleFeedPush === "function") {
                        BattleFeedPush({ text: subject.name() + " was too late! Switching to attack.", kind: "system" });
                    }
                }
            }
        }
        _Game_Action_apply_interrupt_check.call(this, target);
    };

})();
