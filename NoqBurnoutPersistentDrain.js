/*:
 * @plugindesc (MV, ES5) Burnout Persistent Drain Patch — keeps TP on trigger and drains by % per turn; blocks Verse/Energy while burned out.
 * @author Noq
 * @help Load this BELOW your Unified Burnout System plugin.
 */
(function(){
'use strict';

var UBS = window.UBS || (window.UBS = {});
// configurable per-turn drain as % of TP limit (e.g., 0.05 = 5% / turn)
if (typeof UBS.PERSISTENT_DRAIN_RATE !== 'number') UBS.PERSISTENT_DRAIN_RATE = 0.05;

function tpLimit(b){ try{ return b.tpLimit ? Math.max(1, b.tpLimit()) : 100; }catch(e){ return 100; } }
function isEnergySkill(skill){ var n = skill && skill.note || ""; return /<(Energy|Verse)>/i.test(n); }

// 1) When the burnout state is ADDED, prepare persistent drain and block the immediate zeroing.
//    UBS calls addState(...), then setTp(0). We intercept the setTp(0) right after the add.
var _GB_addState = Game_Battler.prototype.addState;
Game_Battler.prototype.addState = function(stateId){
  _GB_addState.call(this, stateId);
  if (stateId === UBS.DEFAULT_BURNOUT_STATE_ID){
    this._ubc_inBurnout = true;
    // set persistent drain (by % of limit). Always >= 1 to ensure progress.
    var lim = tpLimit(this);
    this._ubc_burnoutDrainRate = Math.max(1, Math.floor(lim * (UBS.PERSISTENT_DRAIN_RATE || 0.05)));
    // flag to ignore the immediate setTp(0) that UBS does right after addState()
    this._ubc_blockNextZero = true;
  }
};

// 2) Block the single immediate setTp(0) that UBS calls after adding the burnout state.
//    We only skip that one zeroing call; all other setTp(...) behave normally.
var _GB_setTp = Game_Battler.prototype.setTp;
Game_Battler.prototype.setTp = function(value){
  if (this._ubc_blockNextZero && value === 0 && this.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)){
    // skip zeroing the gauge; keep current TP
    this._ubc_blockNextZero = false;
    return;
  }
  _GB_setTp.call(this, value);
};

// 3) Drain TP each turn WHILE in burnout. Remove the state when TP reaches 0.
var _GB_onTurnEnd = Game_Battler.prototype.onTurnEnd;
Game_Battler.prototype.onTurnEnd = function(){
  _GB_onTurnEnd.call(this);

  var sid = UBS.DEFAULT_BURNOUT_STATE_ID;
  if (this.isStateAffected(sid)){
    var d = this._ubc_burnoutDrainRate || Math.max(1, Math.floor(tpLimit(this) * (UBS.PERSISTENT_DRAIN_RATE || 0.05)));
    if (d > 0){
      // use the original setTp so other hooks still run
      _GB_setTp.call(this, Math.max(0, (this.tp || 0) - d));
    }
    if ((this.tp || 0) <= 0){
      this.removeState(sid);
      this._ubc_inBurnout = false;
      this._ubc_burnoutDrainRate = 0;
    }
  }
};

// 4) When the burnout state ends (by any means), clear flags.
var _GB_removeState = Game_Battler.prototype.removeState;
Game_Battler.prototype.removeState = function(stateId){
  _GB_removeState.call(this, stateId);
  if (stateId === UBS.DEFAULT_BURNOUT_STATE_ID){
    this._ubc_inBurnout = false;
    this._ubc_burnoutDrainRate = 0;
    this._ubc_blockNextZero = false;
  }
};

// 5) Block Verse/Energy casting while burned out (so you can’t cast until the gauge drains back to 0).
var _GBB_canPaySkillCost = Game_BattlerBase.prototype.canPaySkillCost;
Game_BattlerBase.prototype.canPaySkillCost = function(skill){
  if (this.isStateAffected && this.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID) && isEnergySkill(skill)) {
    return false;
  }
  return _GBB_canPaySkillCost.call(this, skill);
};

})();