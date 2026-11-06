//=============================================================================
// Noq_UserATB.js
//=============================================================================
/*:
 * @target MV
 * @plugindesc v1.2 Adds <User ATB>, <User Charge>, and <ChargeSpeed> tags.
 * @author Noq (Assisted by Gemini)
 *
 * @help
 * ============================================================================
 * Overview
 * ============================================================================
 * This plugin adds multiple new ATB-related note tags to skills and items.
 * * --- NEW: CHARGE SPEED MULTIPLIER ---
 * <ChargeSpeed: x%>
 * Alters how fast the ATB Charge gauge fills while casting this specific skill.
 * Example: <ChargeSpeed: 50%> makes it charge at half speed (slower).
 * Example: <ChargeSpeed: 300%> makes it charge 3x faster (near instant).
 * * --- GAUGE REFUNDS / RECOIL (End of Turn) ---
 * <User ATB: +x> or <User ATB: +x%>
 * <User Charge: +x> or <User Charge: +x%>
 * Refunds or penalizes the caster's gauge AFTER the skill finishes executing.
 *=============================================================================
 */

(function() {

    //-----------------------------------------------------------------------------
    // Parse the Note Tags on Database Load
    //-----------------------------------------------------------------------------
    var _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;
        if (!this._noqUserAtbLoaded) {
            this.processNoqUserAtbNotetags($dataSkills);
            this.processNoqUserAtbNotetags($dataItems);
            this._noqUserAtbLoaded = true;
        }
        return true;
    };

    DataManager.processNoqUserAtbNotetags = function(group) {
        var noteAtb = /<(?:USER ATB|USERATB):\s*([\+\-]?\d+)(%?)>/i;
        var noteCharge = /<(?:USER CHARGE|USERCHARGE):\s*([\+\-]?\d+)(%?)>/i;
        var noteChargeSpeed = /<(?:CHARGE SPEED|CHARGESPEED):\s*(\d+)(%?)>/i;

        for (var n = 1; n < group.length; n++) {
            var obj = group[n];
            if (!obj) continue;
            
            var notedata = obj.note.split(/[\r\n]+/);

            obj.userAtbFlat = 0;
            obj.userAtbRate = 0.0;
            obj.userChargeFlat = 0;
            obj.userChargeRate = 0.0;
            obj.chargeSpeedRate = 1.0; 

            for (var i = 0; i < notedata.length; i++) {
                var line = notedata[i];
                if (line.match(noteAtb)) {
                    var val = parseInt(RegExp.$1);
                    var isPct = RegExp.$2 === '%';
                    if (isPct) {
                        obj.userAtbRate += (val / 100);
                    } else {
                        obj.userAtbFlat += val;
                    }
                } else if (line.match(noteCharge)) {
                    var val = parseInt(RegExp.$1);
                    var isPct = RegExp.$2 === '%';
                    if (isPct) {
                        obj.userChargeRate += (val / 100);
                    } else {
                        obj.userChargeFlat += val;
                    }
                } else if (line.match(noteChargeSpeed)) {
                    var val = parseInt(RegExp.$1);
                    obj.chargeSpeedRate = (val / 100); 
                }
            }
        }
    };

    //-----------------------------------------------------------------------------
    // Hook into ATB Update (The Delta Method) - Fix for <ChargeSpeed: x%>
    //-----------------------------------------------------------------------------
    if (typeof Game_Battler.prototype.updateATB !== 'undefined') {
        var _Game_Battler_updateATB = Game_Battler.prototype.updateATB;
        Game_Battler.prototype.updateATB = function() {
            // Record the state BEFORE Yanfly adds the frame tick
            var wasCharging = this.isATBCharging();
            var beforeCharge = this._atbCharge || 0;

            // Run Yanfly's standard ATB frame calculation
            _Game_Battler_updateATB.call(this);

            // If the battler was actively charging a skill...
            if (wasCharging && BattleManager.isATB()) {
                var maxAtb = BattleManager.atbTarget();
                var afterCharge = this._atbCharge || 0;
                var diff = afterCharge - beforeCharge;

                // If the gauge naturally grew, and Yanfly hasn't ALREADY cast it
                if (diff > 0 && afterCharge < maxAtb) {
                    var action = this.currentAction();
                    if (action && action.item()) {
                        var rate = action.item().chargeSpeedRate;
                        
                        if (rate !== undefined && rate !== 1.0) {
                            // Multiply the speed difference
                            var extra = diff * (rate - 1);
                            this._atbCharge += extra;
                            
                            // If our new bonus speed pushes it over the max line this frame,
                            // we manually tell Yanfly to execute the cast!
                            if (this._atbCharge >= maxAtb) {
                                this._atbCharge = maxAtb;
                                if (typeof BattleManager.castAction === 'function') {
                                    BattleManager.castAction(this);
                                }
                            }
                        }
                    }
                }
            }
        };
    }

    //-----------------------------------------------------------------------------
    // Hook into End Action (For User ATB / User Charge Refunds & Recoil)
    //-----------------------------------------------------------------------------
    var _BattleManager_endAction = BattleManager.endAction;
    BattleManager.endAction = function() {
        var subject = this._subject;
        var action = subject ? subject.currentAction() : null;
        var item = action ? action.item() : null;

        _BattleManager_endAction.call(this);

        if (subject && item && BattleManager.isATB()) {
            var maxAtb = BattleManager.atbTarget();

            if (item.userAtbFlat !== 0 || item.userAtbRate !== 0) {
                var atbGain = item.userAtbFlat + (maxAtb * item.userAtbRate);
                subject._atbSpeed += atbGain;
                subject._atbSpeed = subject._atbSpeed.clamp(0, maxAtb); 
            }

            if (item.userChargeFlat !== 0 || item.userChargeRate !== 0) {
                var chargeGain = item.userChargeFlat + (maxAtb * item.userChargeRate);
                subject._atbCharge += chargeGain;
                subject._atbCharge = subject._atbCharge.clamp(0, maxAtb);
            }
        }
    };

})();