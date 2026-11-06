//=============================================================================
// Noq_PartyAIPersonality.js
// Description: Character-specific lore, tactics, and behavioral overrides.
//=============================================================================

(function() {
    'use strict';
//=============================================================================
// Noq_PartyAIPersonality.js
// Description: Character-specific lore, tactics, and behavioral overrides.
//=============================================================================

Game_Actor.prototype.scorePersonality = function(skill, context, target) {
    var score = 0;
    var isAlly = target.isActor();
    var isEnemy = target.isEnemy();
    var aiMode = $gameVariables.value(150 + this.actorId()) || 0;

    var isLethal = false;
    var estDamage = 0;
    if (isEnemy && skill.damage.type > 0) {
        var tempAction = new Game_Action(this);
        tempAction.setSkill(skill.id);
        estDamage = tempAction.makeDamageValue(target, false);
        if (estDamage >= target.hp) isLethal = true;
    }

    switch(this.actorId()) {
        
        // =====================================================================
        // ACTOR 1: KAI (Voltrend Subverser - Speed Controller)
        // =====================================================================
        case 1:
            if (isEnemy && (skill.meta.Shock || skill.name.indexOf("Shock") >= 0)) {
                score += 400; 
                // Assuming Shock states are 14 and 15
                if (!target.isStateAffected(14) && !target.isStateAffected(15)) {
                    score += 200; // They are clean, shock them!
                }
            }
            
            if (skill.name === "Charge" || skill.meta.ChargeMove) {
                var physicalAllies = $gameParty.aliveMembers().filter(function(m) {
                    return [3, 5, 6].indexOf(m.actorId()) >= 0; 
                });
                if (physicalAllies.length >= 2 && context.partyAvgHp > 0.60) {
                    score += 350; 
                }
            }
            
            if (skill.meta.ExtendShock && (target.isStateAffected(14) || target.isStateAffected(15))) {
                score += 500; 
            }
            
            if (skill.id === this.attackSkillId()) score += 150; 
            if (skill.meta.Interrupt && !skill.meta.Shock) score -= 200; 
            if (DataManager.isItem(skill)) score -= 600; 
            break;
    
        // =====================================================================
        // ACTOR 2: LUNEYVA (Mertide - Strategic Support/Control)
        // =====================================================================
        case 2:
            // --- 1. DYNAMIC ROLE ASSESSMENT (Isahn Check) ---
            var isahnAlive = $gameParty.aliveMembers().some(function(actor) { 
                return actor.actorId() === 4; 
            });

            if (!isahnAlive) {
                // ==========================================
                // PRIMARY HEALER MODE (Isahn is dead/absent)
                // ==========================================
if (target.hpRate() < 0.85 && (target === this || (isAlly && target.actorId() === 1))) {
    var isHealItem = DataManager.isItem(skill) && skill.meta["AI Category"] && skill.meta["AI Category"].trim().toUpperCase() === "HP";
    if (skill.damage.type === 3 || skill.meta.Heal || isHealItem) score += 2000;
    if (isEnemy) score -= 1500; // Stop attacking in a panic!
}

                if (skill.damage.type === 3 || skill.meta.Heal || skill.meta.Regen || skill.name === "Lustral Tide") {
                    if (isAlly && target.hpRate() < 0.75) score += 600; 
                    if (context.criticalAllies > 0) score += 900; 
                }
            } else {
                // ==========================================
                // BACKUP HEALER MODE (Isahn is handling it)
                // ==========================================
                if (skill.damage.type === 3 || skill.meta.Heal || skill.meta.Regen || skill.name === "Lustral Tide") {
                    if (isAlly && target.hpRate() < 0.75) score += 200; // Let Isahn do the heavy lifting
                    
                    // Step in if things are slipping or Isahn is overwhelmed
                    if (context.criticalAllies > 1 || context.partyAvgHp < 0.65) score += 400; 
                }
            }

            // --- 2. AQUAPHOR & COOLING TARGETING ---
            if (skill.name === "Aquaphor" || skill.meta.CoolsBurnout) {
                if (isAlly) {
                    var bRate = target.burnoutRate ? target.burnoutRate() : 0;
                    if (bRate < 0.30) return -9999; 

                    if (target.actorId() === 4 || target.actorId() === 6) score += 600;
                    if (target === this) score -= 300; 
                }
            }

            // --- 3. THERMAL PIVOT ---
            if (context.myBurnoutLevel > 0.65) {
                if (skill.id === this.attackSkillId() || skill.meta.Technique) score += 600;
                if (skill.meta.Verse) score -= 400;
            } else if (context.myBurnoutLevel < 0.40) {
                if (skill.meta.Verse || skill.meta.Energy) score += 350; 
            }
            
            // --- 4. SYNERGY & STATES ---
            if (skill.meta.Soaked || skill.name.indexOf("Soaked") >= 0) {
                score += 300; 
                var kai = $gameParty.members().find(function(m) { return m.actorId() === 1; });
                if (kai && kai.isAlive()) score += 250; 
            }
            
            if (skill.meta.BubbleShield || skill.name === "Bubble Shield") {
                score += 600; 
                if (context.isBossFight || context.isEnemyCasting) score += 400; 
            }
            
            // --- 5. HARMONY SPECIALIST ---
            if (typeof Harmonization !== 'undefined' && isEnemy) {
                var harmonyBonus = Harmonization.getComboPotential(skill.id, target);
                if (harmonyBonus > 0) {
                    score += harmonyBonus * 2; // Double the base harmony bonus!
                }

                var kaiInParty = $gameParty.members().find(function(m) { return m.actorId() === 1; });
                if (kaiInParty && kaiInParty._aiTarget === target && kaiInParty._aiSkillIdIntent) {
                    var kaiSkill = $dataSkills[kaiInParty._aiSkillIdIntent];
                    if (kaiSkill && kaiSkill.meta.HarmonyStarter) {
                        if (skill.name === "Electrolysis" || Harmonization.getComboPotential(skill.id, target) > 0) {
                            score += 1500; 
                        }
                    }
                }
            }
            
            // --- 6. UTILITY ---
            if (skill.meta.Cleanse) {
                if (isAlly && target.states().some(function(s) { return s.meta.Debuff || s.iconIndex >= 16; })) {
                    score += 800; 
                }
            }
            break;
    
        // =====================================================================
        // ACTOR 3: MALIN (Embern - Risk-Taking Fire/Physical Hybrid)
        // =====================================================================
        case 3:
            // --- LINEAR AGGRESSION ---
            var heatDrive = 200 + (context.myBurnoutLevel * 600); 
            if (skill.meta.BuildsBurnout || skill.meta.Verse) {
                score += heatDrive;
            }

            // --- THERMAL PIVOT ---
            if (context.myBurnoutLevel > 0.70) {
                if (skill.id === this.attackSkillId() || skill.meta.Technique) score += 900;
                if (skill.meta.Verse) score -= 600; 
            }

            // --- BURNOUT MANAGEMENT ---
            if (context.myBurnoutLevel > 0.70) {
                if (skill.meta.EatBurnout) score += 800; 
            }
            
            // --- COMBAT FLOW (Burn -> Punch) ---
            if (isEnemy) {
                // Assuming Burn states are 20 and 21
                var isBurned = (target.isStateAffected(20) || target.isStateAffected(21));
                
                if (!isBurned && (skill.meta.Burn || skill.name.indexOf("Burn") >= 0 || skill.name.indexOf("Fire") >= 0)) {
                    score += 500; 
                }
                if (isBurned && (skill.id === this.attackSkillId() || skill.meta.Technique || skill.hitType === 1)) {
                    score += 450; 
                }
            }
            
            // --- MP CONSERVATION OVERRIDE ---
            if (context.myBurnoutLevel > 0.65 && this.mpRate() < 0.35) {
                if (skill.id === this.attackSkillId() || skill.hitType === 1) score += 700; 
                if (this.skillMpCost(skill) > 0) score -= 500; 
            }
            
            // --- EMBERN SYNERGY ---
            var burnedCount = 0;
            if (isEnemy) {
                var enemies = $gameTroop.aliveMembers();
                for (var b = 0; b < enemies.length; b++) {
                    if (enemies[b].isStateAffected(20) || enemies[b].isStateAffected(21)) burnedCount++;
                }
            }
            if (burnedCount >= 2 && (skill.meta.Verse || skill.meta.Embern)) {
                score += burnedCount * 200; 
            }
            
            if (skill.meta.Burn || skill.name.indexOf("Fire") >= 0 || skill.name.indexOf("Burn") >= 0) score += 150; 
            if (DataManager.isItem(skill)) score -= 600; 
            
            if (typeof UBS !== 'undefined' && isLethal) {
                var prediction = UBS.predictImpact(this, skill);
                if (prediction.finalRate >= 1.0) score += 800;
            }
            break;
    
		// =====================================================================
        // ACTOR 4: ISAHN (Solien - Tactical Healer/Buffer)
        // =====================================================================
        case 4:
            // --- 1. SURVIVAL PANIC OVERRIDE ---
            // If his own health or Kai's health is dropping below 85%, he drops everything to heal.
            if (target.hpRate() < 0.85 && (target === this || isAlly && target.actorId() === 1)) {
                var isHealItem = DataManager.isItem(skill) && skill.meta["AI Category"] && skill.meta["AI Category"].trim().toUpperCase() === "HP";
                
                if (skill.damage.type === 3 || skill.meta.Heal || isHealItem) score += 2000;
                
                if (isEnemy) score -= 1500; // Force him to stop attacking
                if (skill.meta.Buff || skill.name === "Lingering Light") score -= 1500; // Stop buffing!
            }

            // --- 2. STANDARD HEALING ---
            if (skill.damage.type === 3 || skill.meta.Heal) {
                score += 500; 
                if (context.criticalAllies > 0) score += 800; 
            }
            
            if (skill.name === "Healing Light") score += 300; 
            
            // --- 3. UTILITY & BUFFS ---
            if (skill.meta.Cleanse) {
                var debuffedCount = context.debuffedAllies.length;
                if (debuffedCount > 0) score += 400 * debuffedCount; 
            }
            
            if (skill.meta.CureCorruption) {
                if (isAlly && (target.states().some(function(s) { return s.meta.Corruption; }))) {
                    score += 1000; 
                }
            }
            
            if (skill.name === "Lingering Light" || skill.meta.ExtendBuffs) {
                var buffedAllies = $gameParty.aliveMembers().filter(function(m) {
                    return m.states().some(function(s) { return s.meta.Buff; });
                });
                if (buffedAllies.length >= 2) score += 600; 
            }
            
            if (skill.meta.Reflect || skill.meta.Barrier) {
                if (context.isBossFight || context.isEnemyCasting) score += 450; 
            }
            
            // --- 4. PACIFISM & AGGRESSION ---
            if (isEnemy && skill.damage.type > 0) {
                score -= 600; 
                if (context.partyAvgHp < 0.75) score -= 800; 
                if (context.partyAvgHp > 0.85 && context.criticalAllies === 0) score += 400; 
            }
            
            if (skill.meta.Interrupt) {
                if (context.partyAvgHp > 0.70) score += 300; 
                else score -= 400; 
            }
            
            if (isEnemy && this.skillMpCost(skill) > 0) {
                if (isLethal && estDamage > target.hp * 1.5) score -= 300; 
            }
            
            if (skill.meta.Verse && skill.damage.type > 0 && context.partyAvgHp > 0.80) {
                score += 200; 
            }

            // --- 5. MP, THERMAL & BURNOUT ITEM JUGGLING ---
            var isBurnedOutStatus = this.states().some(function(s) { 
                return s.name.indexOf("Burnout") >= 0 || s.meta.Burnout || s.meta.Fracture; 
            });

            if (context.myBurnoutLevel > 0.70 || isBurnedOutStatus) {
                // Base desire to clear the state or cool off
                if (skill.id === this.guardSkillId() || skill.name === "Wait" || skill.meta.CoolsBurnout) {
                    score += 1500; 
                }
                
                if (isBurnedOutStatus) {
                    // Forbid desperate physical attacks
                    if (isEnemy && (skill.id === this.attackSkillId() || skill.meta.Technique || skill.meta.Interrupt)) {
                        score -= 3000; 
                    }
                    
                    // THE JUGGLE: Allow Items, but ONLY for emergencies!
                    if (DataManager.isItem(skill)) {
                        var itemCat = skill.meta["AI Category"] ? skill.meta["AI Category"].trim().toUpperCase() : "";
                        
                        if (itemCat === "HP" || itemCat === "REVIVE") {
                            if (target.hpRate() < 0.40 || target.isDead()) {
                                score += 2000; // Outbids the +1500 Guard score! Drops everything to save them.
                            } else {
                                score -= 1000; // They are fine. Cure the burnout instead.
                            }
                        } else {
                            score -= 1000; // Don't waste time on MP or utility items while magic is sealed.
                        }
                    }
                }
            } else {
                // Normal behavior: Only Guard/Wait if MP is truly bottomed out (< 15%)
                if (skill.id === this.guardSkillId() || skill.name === "Wait") {
                    score += (this.mpRate() < 0.15) ? 600 : -1000;
                }
            }
            break;
    
        // =====================================================================
        // ACTOR 5: SYFER REGALD (Twilight - Debuff/Buff Finisher)
        // =====================================================================
        case 5:
            if (skill.meta.Debuff && isEnemy) {
                score += 400;
                if (target === context.mostDangerousEnemy) score += 300; 
            }
            
            if (skill.meta.Buff && isAlly) {
                if ([1, 3, 6].indexOf(target.actorId()) >= 0) score += 350;
            }
            
            if (skill.damage.type === 3 && context.partyAvgHp < 0.60) score += 250; 
            
            if (isEnemy && skill.damage.type > 0) {
                if (target.states().some(function(s) { return s.meta.Debuff; })) score += 400; 
            }
            
            if (isLethal) score += 600; 
            break;
    
        // =====================================================================
        // ACTOR 6: BRAN (Terranai - Tank/Protector)
        // =====================================================================
        case 6:
            if (skill.meta.Taunt || skill.name.indexOf("Taunt") >= 0) {
                score += 500; 
                if (context.partyAvgHp < 0.60) score += 400; 
            }
            
            if (skill.meta.Buff && target === this && skill.name.indexOf("Defense") >= 0) {
                score += 450; 
            }
            
            if (context.criticalAllies > 0) {
                if (skill.meta.Shield || skill.meta.Barrier || skill.meta.Taunt) score += 800; 
            }
            
            if (skill.hitType === 1 || skill.meta.Technique) score += 250; 
            
            if (skill.meta.Verse || skill.meta.Energy) {
                score -= 200; 
                if (isLethal) score += 700; 
                
                var targetingBran = 0;
                if (isEnemy) {
                    var enemies = $gameTroop.aliveMembers();
                    for (var t = 0; t < enemies.length; t++) {
                        if (enemies[t]._targetIndex === this.index()) targetingBran++;
                    }
                }
                if (targetingBran >= 2) score += 500; 
            }
            
            if (context.criticalAllies > 0 && skill.meta.BuildsBurnout) score += 400; 
            if (DataManager.isItem(skill)) score -= 400; 
            break;
    
        // =====================================================================
        // ACTOR 7: VRELL (Geofluxer - Item Specialist)
        // =====================================================================
        case 7:
            if (DataManager.isItem(skill)) {
                score += 500; 
                if (aiMode === 2) score += 200; 
                else {
                    if (this._lastExecutedAISkillId === skill.id) score -= 600; 
                }
                
                var itemCount = $gameParty.numItems(skill);
                if (itemCount <= 2) score -= 400; 
                else if (itemCount <= 5) score -= 150; 
            }
            
            if (skill.meta.VerseStone) {
                score += 400; 
                if (isEnemy && context.aliveEnemies >= 3) score += 300; 
            }
            
            if (aiMode === 0) { 
                var lastWasItem = this._lastExecutedAISkillId && DataManager.isItem($dataItems[this._lastExecutedAISkillId]);
                if (lastWasItem && DataManager.isItem(skill)) score -= 300; 
                else if (!lastWasItem && skill.id === this.attackSkillId()) score += 200; 
            }
            break;
    
        // =====================================================================
        // DEFAULT: Fallback Lore
        // =====================================================================
        default:
            var noteMatch = this.actor().note.match(/Verse:\s*(.+)/i);
            var myVerse = noteMatch ? noteMatch[1].trim().toLowerCase() : "";
            
            if (myVerse === "embern") {
                if (isEnemy && skill.damage.type === 1) score += 30;
            } else if (myVerse === "mertide") {
                if (skill.id === this.guardSkillId() && context.myBurnoutLevel > 0.5) score += 60;
                if (skill.damage.type === 3) score += 80;
            } else if (myVerse === "terranai") {
                if (skill.meta.Interrupt || skill.meta.Debuff) score += 40;
            }
            break;
    }

    return score;
};
})();