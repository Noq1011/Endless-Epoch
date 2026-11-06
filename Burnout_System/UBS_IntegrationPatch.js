/*:
 * @target MV
 * @plugindesc UBS Integration Patch v1.0 - Reconnects all UBS components
 * @author Noq (Fixed by Assistant)
 * @help 
 * Load order:
 * 1. NoqUnifiedBurnoutSystemCore.js
 * 2. Noq_UnifiedRadial.js
 * 3. NoqBurnBlowBack.js
 * 4. NoqBurnoutLockState.js
 * 5. THIS FILE (UBS_IntegrationPatch.js)
 * 
 * This patch ensures all UBS components work together properly.
 */

(function() {
    'use strict';

    var UBS = window.UBS || {};
    var CFG = {
        STATE_ID: UBS.DEFAULT_BURNOUT_STATE_ID || 17,
        VERSE_SKILL_TYPE:1  // The skill type ID for Verse Arts
    };

    /* ============================================================
     * 1. ENSURE UBC FLAGS ARE SET DURING CHARGING
     * This fixes the blowback not triggering issue
     * ============================================================ */
    
    // Hook into skill usage to set the charging flags
    var _Game_Battler_useItem = Game_Battler.prototype.useItem;
    Game_Battler.prototype.useItem = function(item) {
        if (DataManager.isSkill(item)) {
            // Check if this is a TP-charging skill (Verse/Energy skill)
            // Usually these have a TP gain effect
            var hasTPGain = item.effects.some(function(effect) {
                return effect.code === Game_Action.EFFECT_GAIN_TP;
            });
            
            if (hasTPGain) {
                // Set the UBC flags that blowback checks for
                this._ubc_lockActive = true;
                this._ubc_charge = item;
                this._ubc_lockedSkillId = item.id;
                
                console.log("[UBS Patch] Charging started for", this.name(), "with skill", item.name);
            }
        }
        
        _Game_Battler_useItem.call(this, item);
    };

    // Clear the flags when action ends normally (no overflow)
    var _Game_Battler_onAllActionsEnd = Game_Battler.prototype.onAllActionsEnd;
    Game_Battler.prototype.onAllActionsEnd = function() {
        if (this._ubc_lockActive && !this._inLockedBurnout) {
            this._ubc_lockActive = false;
            this._ubc_charge = null;
            console.log("[UBS Patch] Charging ended normally for", this.name());
        }
        _Game_Battler_onAllActionsEnd.call(this);
    };

    /* ============================================================
     * 2. RADIAL MENU INTEGRATION - DISABLE VERSE ARTS IN BURNOUT
     * This fixes the "still can select Verse Arts" issue
     * ============================================================ */
    
    // Hook into skill usability check
    var _Game_BattlerBase_canUse = Game_BattlerBase.prototype.canUse;
    Game_BattlerBase.prototype.canUse = function(item) {
        // Block Verse Arts (skill type 2) if in burnout
        if (DataManager.isSkill(item) && this._inLockedBurnout) {
            if (item.stypeId === CFG.VERSE_SKILL_TYPE) {
                console.log("[UBS Patch] Blocking Verse Art:", item.name, "- Actor in burnout");
                return false;
            }
        }
        return _Game_BattlerBase_canUse.call(this, item);
    };

    // Additional check for skill type filtering (for radial menus)
    var _Game_BattlerBase_addedSkillTypes = Game_BattlerBase.prototype.addedSkillTypes;
    Game_BattlerBase.prototype.addedSkillTypes = function() {
        var types = _Game_BattlerBase_addedSkillTypes.call(this);
        
        if (this._inLockedBurnout) {
            // Remove Verse skill type from available types
            types = types.filter(function(typeId) {
                return typeId !== CFG.VERSE_SKILL_TYPE;
            });
            console.log("[UBS Patch] Filtered skill types for burnout:", types);
        }
        
        return types;
    };

    /* ============================================================
     * 3. ENSURE SINGLE BLOWBACK PER BURNOUT CYCLE
     * Enhanced failsafe
     * ============================================================ */
    
    var _BM_startBlowback = BattleManager._ubcStartImmediateBlowback;
    if (_BM_startBlowback) {
        BattleManager._ubcStartImmediateBlowback = function(user, overflowRate) {
            // Prevent multiple blowbacks
            if (user._inLockedBurnout || user._ubc_hasBlownBack) {
                console.log("[UBS Patch] Blowback blocked - already triggered this cycle");
                return;
            }
            
            // Mark that blowback has occurred
            user._ubc_hasBlownBack = true;
            
            // Call original
            _BM_startBlowback.call(this, user, overflowRate);
        };
    }

    // Reset the blowback flag when burnout ends
    var _Game_BattlerBase_setTp = Game_BattlerBase.prototype.setTp;
    Game_BattlerBase.prototype.setTp = function(tp) {
        var wasInBurnout = this._inLockedBurnout;
        _Game_BattlerBase_setTp.call(this, tp);
        
        // If we just exited burnout, reset the blowback flag
        if (wasInBurnout && !this._inLockedBurnout) {
            this._ubc_hasBlownBack = false;
            console.log("[UBS Patch] Reset blowback flag for", this.name());
        }
    };

    /* ============================================================
     * 4. BURNOUT TIERS SYSTEM (If not in core)
     * This might be what's missing from your system
     * ============================================================ */
    
    // Define damage scaling tiers based on TP overflow
    UBS.TIER_THRESHOLDS = UBS.TIER_THRESHOLDS || [
        { min: 0.00, max: 0.10, scale: 1.0,  name: "Minor" },   // 0-10% overflow
        { min: 0.10, max: 0.25, scale: 1.3,  name: "Moderate" }, // 10-25% overflow
        { min: 0.25, max: 0.50, scale: 1.6,  name: "Severe" },   // 25-50% overflow
        { min: 0.50, max: 999,  scale: 2.0,  name: "Critical" }  // 50%+ overflow
    ];

    // Enhanced damage calculation with tiers
    if (BattleManager._calculateBlowbackDmg) {
        var _BM_calcDmg = BattleManager._calculateBlowbackDmg;
        BattleManager._calculateBlowbackDmg = function(user, skill, overflow) {
            var baseDmg = _BM_calcDmg.call(this, user, skill, overflow);
            
            // Apply tier scaling
            var tier = UBS.TIER_THRESHOLDS.find(function(t) {
                return overflow >= t.min && overflow < t.max;
            }) || UBS.TIER_THRESHOLDS[0];
            
            var finalDmg = Math.floor(baseDmg * tier.scale);
            console.log("[UBS Tiers]", tier.name, "overflow - Base:", baseDmg, "Final:", finalDmg);
            
            return finalDmg;
        };
    }

    /* ============================================================
     * 5. VISUAL FEEDBACK ENHANCEMENTS
     * ============================================================ */
    
    // Add a message when entering burnout
    var _Game_BattlerBase_addState = Game_Battler.prototype.addState;
    Game_Battler.prototype.addState = function(stateId) {
        _Game_BattlerBase_addState.call(this, stateId);
        
        if (stateId === CFG.STATE_ID && this._inLockedBurnout) {
            if ($gameParty.inBattle()) {
                BattleManager._logWindow.addText(this.name() + " suffers BURNOUT!");
            }
        }
    };

    console.log("[UBS Integration Patch] Loaded successfully");

})();
