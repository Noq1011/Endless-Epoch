/*:
 * @plugindesc (MV, ES5) UBS Add-on — Burnout Tiers & Cost Scaling.
 * @author Noq + Tyson
 * @help
 * Load order: BELOW the UBS Core Script.
 */

(function(){
'use strict';

var Tiers = {
    // --- Burnout → EN (MP) scaling tiers ---
    MP: [
		{ rate: 0.00, mult: 0.85 },
        { rate: 0.20, mult: 1.0 },
        { rate: 0.40, mult: 1.20 },
        { rate: 0.60, mult: 1.5 },
        { rate: 0.85, mult: 1.8 }
    ],
    
    // --- Burnout tier → auto states ---
    BO: [
        { rate: 0.00, add: [] },
        { rate: 0.33, add: [] },
        { rate: 0.66, add: [] }
    ],
    
    // Extra states while actually in Burnout state (State 17 usually)
    BO_BURNOUT_EXTRA_STATES: [],
    
    TIER_STATES_ACTOR_ONLY: true
};

function burnoutRateOf(b){ 
    try { 
        var l = b.tpLimit ? Math.max(1, b.tpLimit()) : 100; 
        return Math.max(0, Math.min(1, (b.tp || 0) / l)); 
    } catch(e) { return 0; } 
}

function isEnergySkill(skill){ 
    var n = skill && skill.note || ""; 
    return /<(Energy|Verse)>/i.test(n); 
}

function tierIndexForRate(r){
    var idx = 0;
    for (var i = 0; i < Tiers.BO.length; i++) {
        if (r >= Tiers.BO[i].rate) idx = i;
    }
    return idx;
}

// Applies states efficiently only when triggered by TP changes
function syncTierStates(b){
    if (Tiers.TIER_STATES_ACTOR_ONLY && (!b.isActor || !b.isActor())) return;
    
    var rate = burnoutRateOf(b);
    var idx  = tierIndexForRate(rate);
    var inBo = window.UBS ? b.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID) : false;

    if (b._ubc_boTierIndex === idx && b._ubc_boWasBurnout === inBo) return;

    for (var t = 0; t < Tiers.BO.length; t++){
        var arr = Tiers.BO[t].add || [];
        arr.forEach(function(sid){ if(sid > 0) b.removeState(sid); });
    }
    var addArr = Tiers.BO[idx].add || [];
    addArr.forEach(function(id){ if(id > 0) b.addState(id); });

    if (inBo){
        Tiers.BO_BURNOUT_EXTRA_STATES.forEach(function(ex){ if(ex > 0) b.addState(ex); });
    }

    b._ubc_boTierIndex = idx;
    b._ubc_boWasBurnout = inBo;
}

/* =========================
   Hooks
   ========================= */

// Cost Scaling Hook
var _cost = Game_BattlerBase.prototype.skillMpCost;
Game_BattlerBase.prototype.skillMpCost = function(skill) {
    // Obey the core script's lock if it exists
    if (this._ubc_lockActive && this._ubc_lockedSkillId === (skill && skill.id) && this._ubc_lockedMpCost != null) {
        return this._ubc_lockedMpCost;
    }

    var base = _cost.call(this, skill);
    if (!skill || !isEnergySkill(skill)) return base;

    var br = burnoutRateOf(this);
    var mult = Tiers.MP[0].mult;
    for (var i = 0; i < Tiers.MP.length; i++) {
        if (br >= Tiers.MP[i].rate) mult = Tiers.MP[i].mult;
    }
    
    return Math.round(base * mult);
};

// Sync State Hooks (Much lighter than frame updates)
var _setTp = Game_BattlerBase.prototype.setTp;
Game_BattlerBase.prototype.setTp = function(tp) {
    _setTp.call(this, tp);
    syncTierStates(this);
};

var _gainTp = Game_Battler.prototype.gainTp;
Game_Battler.prototype.gainTp = function(value) {
    _gainTp.call(this, value);
    syncTierStates(this);
};

// Also sync states when recovering from the Burnout State
var _removeState = Game_Battler.prototype.removeState;
Game_Battler.prototype.removeState = function(stateId) {
    _removeState.call(this, stateId);
    if (window.UBS && stateId === UBS.DEFAULT_BURNOUT_STATE_ID) {
        syncTierStates(this);
    }
};

})();