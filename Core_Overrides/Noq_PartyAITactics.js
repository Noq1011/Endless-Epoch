//=============================================================================
// Noq_PartyAITactics.js
// Description: The global combat logic, scoring math, and system hooks.
//=============================================================================

(function() {
    'use strict';
Game_Actor.prototype.scoreTactics = function(skill, context, target) {
    var score = 0;
    var isAlly = target.isActor();
    var isEnemy = target.isEnemy();
    
    // --- LETHAL DAMAGE CALCULATOR ---
    var isLethal = false;
    var estDamage = 0;
    if (isEnemy && skill.damage.type > 0) {
        var tempAction = new Game_Action(this);
        tempAction.setSkill(skill.id);
        estDamage = tempAction.makeDamageValue(target, false);
        if (estDamage >= target.hp) isLethal = true;
    }

    // ==========================================================
    // LAYER 2: BEHAVIOR MODES & EMERGENCY MP CONSERVATION
    // ==========================================================
    var aiMode = $gameVariables.value(150 + this.actorId()) || 0; 
    
    var isEmergency = (context.criticalAllies > 0 || (context.lowestHpAlly && context.lowestHpAlly.hpRate() < 0.35));
    var isDesignatedHealer = (aiMode === 3 || this.actorId() === 4 || this.name() === "Luneyva");

    if (isEmergency && isDesignatedHealer) {
        if (isEnemy && this.skillMpCost(skill) > 0 && !isLethal) score -= 800; 
        if (this.mpRate() < 0.45) {
            if (skill.id === 7 || skill.name === "Wait") score += 800; 
            else if (skill.id === this.guardSkillId() || skill.id === this.attackSkillId()) score += 150; 
        }
    }

    if (aiMode === 3 && isEnemy && !isLethal) score -= 600; 

    // ==========================================================
    // A4. ITEM EVALUATION (Scoring Phase & Tactics)
    // ==========================================================
    if (DataManager.isItem(skill)) {
        var category = skill.meta["AI Category"] ? skill.meta["AI Category"].trim().toUpperCase() : "";
        var itemMode = $gameVariables.value(160 + this.actorId()) || 0;
        
        if (itemMode === 4) score -= 5000; 
        else if (itemMode === 1 && category !== "HP" && category !== "REVIVE") score -= 5000; 
        else if (itemMode === 2 && category !== "MP" && category !== "ENERGY") score -= 5000; 
        else if (itemMode === 3 && category !== "BUFF" && category !== "CLEANSE" && category !== "DEBUFF") score -= 5000; 

        if (score > -4000) {
            switch (category) {
                case "HP":
                    if (target.hpRate() < 0.30) score += 600;
                    else if (target.hpRate() < 0.60) score += 200;
                    else score -= 5000; 
                    break;
                case "MP":
                    if (target.mpRate() < 0.25) score += 400;
                    else score -= 5000; 
                    break;
                case "REVIVE":
                    if (target.isDead()) score += 4000;
                    else score -= 5000; 
                    break;
                case "CLEANSE":
                    var needsCleanse = false;
                    if (typeof UEE !== 'undefined' && UEE.AI && typeof UEE.AI.needsCleanse === 'function') {
                        needsCleanse = UEE.AI.needsCleanse(skill, target);
                    }
                    if (needsCleanse) score += 800; 
                    else score -= 5000; 
                    break;
                case "BUFF":
                    if (target.hpRate() > 0.70 && context.criticalAllies === 0) score += 200;
                    else score -= 700;
                    break;
            }

            if ($gameParty.numItems(skill) <= 1 && BattleManager._itemClaimedId === skill.id) {
                score -= 5000; 
            }
        }
    }

    // ==========================================================
    // A5. THERMAL MANAGEMENT (The "Safe Haven" Fix)
    // ==========================================================
    if (typeof UBS !== 'undefined' && typeof UBS.predictImpact === 'function') {
        var prediction = UBS.predictImpact(this, skill);
        
        // Is this a "Safe Move"? (Basic Attack, Guard, Technique, or most Items)
        var isSafeMove = (!skill.meta.Verse && !skill.meta.BuildsBurnout);

        if (!isSafeMove) {
            // EMERGENCY BYPASS: Let healers risk Blowback if someone is dying!
            var isEmergencyHeal = (skill.damage.type === 3 || skill.meta.Heal) && target.hpRate() < 0.60;
            
            if (prediction.finalRate >= 1.0 && !isLethal && !isEmergencyHeal) {
                score -= 5000; // Safety Valve
            }
        } else {
            score += (context.myBurnoutLevel * 400); 
        }
    }

    // ==========================================================
    // B. CRITICAL HEALING & SHIELDS
    // ==========================================================
    if (skill.damage.type === 3 || skill.meta.Heal) {
        // Floor raised to 98% - Healers will now "top off" the party
        if (target.hpRate() >= 0.98) return -9999; 
        
        score += 300; // Base desire to heal
        // Exponential scaling: As HP drops, the "need" to heal grows massively
        var hpDeficit = 1.0 - target.hpRate();
        score += (hpDeficit * hpDeficit * 2500); 
    }

    if (skill.damage.type === 4) {
        if (target.mpRate() >= 0.60) return -9999; 
        if (target === context.lowestMpAlly && target.mpRate() < 0.30) score += 500;
    }

    if (skill.meta.Regen || skill.meta.HealOverTime) {
        if (context.partyAvgHp > 0.85 && context.criticalAllies === 0) return -9999;
        var regenStateId = skill.meta.RegenState ? Number(skill.meta.RegenState) : 0;
        if (regenStateId === 0) {
            for (var i = 0; i < skill.effects.length; i++) {
                if (skill.effects[i].code === 21 && skill.effects[i].dataId > 0) { regenStateId = skill.effects[i].dataId; break; }
            }
        }
        if (regenStateId > 0 && isAlly) {
            if (target.isStateAffected(regenStateId)) return -9999; 
            else {
                if (target.hpRate() < 0.40) score += 400;
                else if (target.hpRate() < 0.75) score += 250;
            }
        }
    }

    if (skill.meta.Shield || skill.meta.Barrier) {
        var shieldStateId = 0;
        for (var j = 0; j < skill.effects.length; j++) {
            if (skill.effects[j].code === 21 && skill.effects[j].dataId > 0) { shieldStateId = skill.effects[j].dataId; break; }
        }
        if (shieldStateId > 0 && isAlly) {
            if (target.isStateAffected(shieldStateId)) return -9999;
            score += 200; 
            
            var isBeingTargeted = false;
            $gameTroop.aliveMembers().forEach(function(enemy) {
                if (enemy._targetIndex === target.index() || enemy._aiTarget === target) isBeingTargeted = true;
            });

            if (isBeingTargeted) {
                score += 600; 
                if (target.hpRate() < 0.40) score += 400; 
            }
            if (context.isBossFight) score += 300; 
        }
    }

    // ==========================================================
    // C. ELEMENTAL & STATE INTELLIGENCE
    // ==========================================================
    var statesRemovedBySkill = [];
    for (var rs = 0; rs < skill.effects.length; rs++) {
        if (skill.effects[rs].code === 22) statesRemovedBySkill.push(skill.effects[rs].dataId);
    }
    if (skill.meta.cleanse) {
        var cleanseTags = String(skill.meta.cleanse).split(',');
        for (var c = 0; c < cleanseTags.length; c++) statesRemovedBySkill.push(parseInt(cleanseTags[c].trim()));
    }

    for (var r = 0; r < statesRemovedBySkill.length; r++) {
        var stateId = statesRemovedBySkill[r];
        if (target.isStateAffected(stateId)) {
            var stateToRemove = $dataStates[stateId];
            if (stateToRemove) {
                if (isEnemy) {
                    if (stateToRemove.meta.Debuff || stateToRemove.meta.Shock || stateToRemove.meta.Burn || stateToRemove.meta.Soaked) {
                        if (isLethal) score += 300; 
                        else score -= 1000; 
                    }
                    if (stateToRemove.meta.Buff) score += 300; 
                }
                if (isAlly) {
                    if (stateToRemove.meta.Buff) score -= 1000; 
                    if (stateToRemove.meta.Debuff) score += 400; 
                }
            }
        }
    }

    if (skill.meta.Dispel || skill.name.indexOf("Dispel") >= 0) {
        if (isEnemy) {
            if (context.buffedEnemies.indexOf(target) >= 0) score += 250;
            else score -= 5000;
        }
    }
    
    if (skill.meta.Buff || skill.damage.type === 0) {
        var buffStateEffect = null;
        for (var m = 0; m < skill.effects.length; m++) {
            if (skill.effects[m].code === 21) { buffStateEffect = skill.effects[m]; break; }
        }
        if (buffStateEffect && target.isStateAffected(buffStateEffect.dataId)) score -= 300; 
        else if (context.partyAvgHp < 0.40) score -= 150; 
        else score += 80;
    }
    
    if (skill.meta.Debuff) {
        if (isEnemy) {
            var debuffStateEffect = null;
            for (var n = 0; n < skill.effects.length; n++) {
                if (skill.effects[n].code === 21) { debuffStateEffect = skill.effects[n]; break; }
            }
            if (debuffStateEffect && target.isStateAffected(debuffStateEffect.dataId)) score -= 300; 
            else if (target === context.mostDangerousEnemy) score += 180; 
            else score += 80;
        }
    }

// ==========================================================
    // E. STRICT INTERRUPT LOGIC & HARMONY SEQUENCING
    // ==========================================================
    if (skill.meta.Interrupt || skill.name === "Shield Bash" || skill.name === "Power Strike") {
        if (isEnemy) {
            var isStunned = target._aiCannotMove || target.states().some(function(s) { 
                return s.meta.Shock || s.meta.Electrolysis || s.meta.Stun || s.meta.Freeze; 
            });

            if (target._aiIsSilenced || isStunned) {
                score -= 9999; // MATHEMATICAL BLACK HOLE: Do not hit stunned enemies.
            } else {
                var isCharging = target.isCharging ? target.isCharging() : false;
                
                if (!isCharging) {
                    // THE TRUE HARD STOP:
                    // If they are not actively casting, this skill is completely forbidden.
                    score -= 9999; 
                } else {
                    var atbRate = target.atbRate ? target.atbRate() : 0;
                    
                    if (atbRate >= 0.85) { 
                        score -= 9999; // Too late! The spell is basically already cast.
                    } else {
                        var urgency = (atbRate < 0.25) ? 75 : 150;
                        var interruptChance = this.getInterruptChance(skill) || 0; 
                        var speed = this.getSkillSpeed(skill) || 0; 
                        
                        // MASSIVE BOOST: When they ARE charging, she drops everything to stop it.
                        score += (interruptChance * 1.5) + Math.max(0, -speed / 10) + urgency + 2000;

                        if (context.plannedInterrupts[target.index()]) score -= 800; 
                    }
                }
            }
        }
    }

    if (typeof Harmonization !== 'undefined' && isEnemy) {
        var harmonyBonus = Harmonization.getComboPotential(skill.id, target);
        score += harmonyBonus;
        var activeQueue = target._harmonyQueue || [];
        
        if (activeQueue.length > 0 && harmonyBonus === 0) {
            if (skill.meta.HarmonyBreak || skill.id === this.attackSkillId()) score -= 1500; 
            else if (!isLethal) score -= 800; 
        }
        if (skill.meta.HarmonyStarter && activeQueue.length === 0) score += 60;
    }

    if (typeof UEE !== 'undefined' && UEE.AI && typeof UEE.AI.isTriggerDue === 'function' && UEE.AI.isTriggerDue(this)) {
        var myTriggers = typeof UEE.AI.getPendingTriggers === 'function' ? UEE.AI.getPendingTriggers(this) : [];
        for (var t = 0; t < myTriggers.length; t++) {
            var tSkill = myTriggers[t].skill;
            if (tSkill && tSkill.meta.HarmonyStarter && target === this._aiTarget) {
                if (skill.meta.HarmonyBreak) score -= 2000;
            }
        }
    }

    // ==========================================================
    // F. TARGET PRIORITY & LORE AWARENESS
    // ==========================================================
    if ([1, 2, 5, 6].indexOf(skill.damage.type) >= 0 && isEnemy) {
        if (target.hpRate() < 0.25) score += 150;
        if (context.partyAvgHp > 0.70 && context.criticalAllies === 0) score += 120;
        if (target === context.mostDangerousEnemy) score += 100;
        if (context.buffedEnemies.indexOf(target) >= 0) score += 80;
        if (skill.scope === 2 && context.aliveEnemies >= 3) score += (context.aliveEnemies * 40);
        if (context.isBossFight && context.aliveEnemies === 1) score += 60;
        
        // --- DYNAMIC ROLE EXPLOITATION ---
        if (target._aiCachedRole === "Tank") {
            if (skill.meta.Verse || skill.damage.type === 4) score += 300; // Hit tanks with Magic/Verses
            if (skill.hitType === 1 || skill.meta.Technique) score -= 200; // Don't punch the tank
        } else if (target._aiCachedRole === "Mage") {
            if (skill.hitType === 1 || skill.meta.Technique) score += 300; // Punch the squishy mages
            if (skill.meta.Verse) score -= 100; // They have high MDF, avoid magic
        }
        
        // --- VERSE COUNTERING ---
        if (target._aiCachedVerse === "embern" && skill.meta.Mertide) score += 400; // Water beats Fire
        if (target._aiCachedVerse === "mertide" && skill.meta.Voltrend) score += 400; // Lightning beats Water
    }

    if (this._lastExecutedAISkillId === skill.id && !isLethal) {
        var isHarmonyMove = false;
        if (typeof Harmonization !== 'undefined') {
            var tQueue = target._harmonyQueue || []; 
            if (tQueue.length > 0 || skill.meta.HarmonyStarter) isHarmonyMove = true;
        }
        if (!isHarmonyMove) {
            var penalty = (this._aiConsecutiveUses || 0) * 350;
            var currentAiMode = $gameVariables.value(150 + this.actorId()) || 0;
            score -= (currentAiMode === 2) ? penalty / 2 : penalty; 
        }
    }

    if (context.criticalAllies > 0) {
        if (isEnemy && skill.damage.type > 0) score -= 1000; 
    }

    if (isEnemy && skill.damage.type > 0 && !DataManager.isItem(skill)) {
        if (estDamage > target.hp * 1.5 && this.skillMpCost(skill) > 0) score -= 500; 
    }

// ==========================================================
    // G. TEMPO & URGENCY EVALUATION (ATB Speed / Charge)
    // ==========================================================
    var atbSpeed = skill.meta["ATB Speed"] ? parseInt(skill.meta["ATB Speed"]) : 100;
    var atbCharge = skill.meta["ATB Charge"] ? parseInt(skill.meta["ATB Charge"]) : 0;
    
    var isFastMove = (atbSpeed >= 150 || atbCharge >= 50);
    var isSlowMove = (atbSpeed <= 50);

    // Defensive Urgency (Healing / Saving Allies)
    if (!isEnemy && (skill.damage.type === 3 || skill.meta.Heal || DataManager.isItem(skill))) {
        if (target.hpRate() < 0.35 || context.criticalAllies > 0) {
            if (isFastMove) score += 500; 
            if (isSlowMove) score -= 800; 
        } else if (target.hpRate() > 0.70 && isSlowMove) {
            score += 150; 
        }
    }

    // Offensive Urgency (Interrupts / Finishing Blows)
    if (isEnemy) {
        var isTargetCharging = target.isCharging ? target.isCharging() : false;
        if (isTargetCharging || target.hpRate() < 0.20) {
            if (isFastMove) score += 300; 
            if (isSlowMove) score -= 400; 
        }
    }

    // --- THE SABOTAGE PREVENTION (Combo Protection) ---
    if (isEnemy && context.targetedByAllies[target.index()]) {
        var allySkills = context.targetedByAllies[target.index()];
        score += 200; 
        var isComboSetup = false;
        for (var sf = 0; sf < allySkills.length; sf++) {
            if (allySkills[sf].meta.HarmonyStarter) isComboSetup = true; 
        }
        if (isComboSetup) {
            if (skill.meta.HarmonyBreak || skill.id === this.attackSkillId()) score -= 1500; 
            else if (!isLethal) score -= 500; 
        }
    }

    if (isEnemy && target.hpRate() < 0.20 && skill.damage.type > 0) score += 500; 

    return score;
};
})();