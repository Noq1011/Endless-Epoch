/*:
 * @target MV
 * @plugindesc UBS Add-on — Resource-Locked Burnout. State persists until TP hits 0. 
 * @author Noq (Fixed by Assistant)
 * @help 
 * Load order:
 * 1. NoqUnifiedBurnoutSystem
 * 2. UBS_Blowback
 * 3. This Plugin
 */

(function() {
    'use strict';

    var CFG = {
        STATE_ID: (window.UBS && UBS.DEFAULT_BURNOUT_STATE_ID) || 17,
        DRAIN_RATE: 5, // How much TP drains per turn/round
        STYPE_MAGIC: [2,3]  // The ID of your "Magic" skill type to seal
    };

    /* ============================================================
     * 1. THE TRIGGER & LOCK LOGIC
     * ============================================================ */
    var _GB_setTp = Game_BattlerBase.prototype.setTp;
    Game_BattlerBase.prototype.setTp = function(tp) {
        var oldTp = this._tp;
        _GB_setTp.call(this, tp);

        // If we hit MAX: Enter Locked Burnout
        if (this._tp >= this.tpLimit() && !this._inLockedBurnout) {
            this._inLockedBurnout = true;
            this.addState(CFG.STATE_ID);
            console.log(this.name() + " entered Locked Burnout.");
        }

        // If we hit ZERO: Release Locked Burnout
        if (this._tp <= 0 && this._inLockedBurnout) {
            this._inLockedBurnout = false;
            this.removeState(CFG.STATE_ID);
            console.log(this.name() + " recovered from Burnout.");
        }
    };

    /* ============================================================
     * 2. PREVENT DOUBLE BLOWBACK
     * ============================================================ */
    var _BM_startBlowback = BattleManager._ubcStartImmediateBlowback;
    BattleManager._ubcStartImmediateBlowback = function(user, overflowRate) {
        // If already in the drain phase, don't explode again
        if (user._inLockedBurnout) {
            console.log("[Blowback Blocked] User is already burned out.");
            return;
        }
        _BM_startBlowback.call(this, user, overflowRate);
    };

    /* ============================================================
     * 3. THE SLOW DRAIN (Turn End)
     * ============================================================ */
    var _GB_onTurnEnd = Game_Battler.prototype.onTurnEnd;
    Game_Battler.prototype.onTurnEnd = function() {
        _GB_onTurnEnd.call(this);
        if (this._inLockedBurnout) {
            this.gainTp(-CFG.DRAIN_RATE);
        }
    };

    /* ============================================================
     * 4. HARD-CODED PENALTIES (MDF 0 & Magic Seal)
     * ============================================================ */
    
    // Force MDF to 0
    var _GB_mdf = Game_BattlerBase.prototype.param;
    Game_BattlerBase.prototype.param = function(paramId) {
        var value = _GB_mdf.call(this, paramId);
        if (paramId === 4 && this._inLockedBurnout) { // 4 is MDF
            return 0;
        }
        return value;
    };

    // Seal Magic Skills
    var _GB_addedSkillTypes = Game_BattlerBase.prototype.addedSkillTypes;
    Game_BattlerBase.prototype.addedSkillTypes = function() {
        var types = _GB_addedSkillTypes.call(this);
        if (this._inLockedBurnout) {
            // Filter out the Magic type (usually 1)
            return types.filter(function(id) { return id !== CFG.STYPE_MAGIC; });
        }
        return types;
    };

    // Prevent usage of Magic Skills even if they appear in lists
    var _GB_canUse = Game_BattlerBase.prototype.canUse;
    Game_BattlerBase.prototype.canUse = function(item) {
        if (this._inLockedBurnout && DataManager.isSkill(item)) {
            if (item.stypeId === CFG.STYPE_MAGIC) return false;
        }
        return _GB_canUse.call(this, item);
    };

    /* ============================================================
     * 5. STATE PERSISTENCE (Override Removal)
     * ============================================================ */
    // Prevent the state from expiring via turns or damage
    var _GB_removeState = Game_Battler.prototype.removeState;
    Game_Battler.prototype.removeState = function(stateId) {
        if (stateId === CFG.STATE_ID && this._inLockedBurnout && this._tp > 0) {
            // Refuse to remove the state if TP > 0
            return;
        }
        _GB_removeState.call(this, stateId);
    };

})();