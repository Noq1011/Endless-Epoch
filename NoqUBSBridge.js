/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq Burnout Charge Bridge — Gradual MP drain + TP (burnout) gain during chant, independent of HUD.
 * @author Noq
 * @help
 * Load order: BELOW YEP_CoreEngine, YEP_BattleEngineCore, YEP_X_BattleSysATB, and BELOW your UBS.
 * Works without any HUD. Will use ATB charge if available; otherwise simulates chant.
 *
 * Recognizes Verse/Energy by either stypeId===1 OR <Verse>/<Energy> note tag.
 *
 * Params:
 *   ReservationMode: 'gradual' (default) or 'select'
 */

(function(){
'use strict';

var BR = window.NBQ_BRIDGE || (window.NBQ_BRIDGE = {});
BR.params = BR.params || { mode: 'gradual' };

// --- helpers ---
function isEnergySkill(skill){
  var n = skill && skill.note || "";
  return (skill && skill.stypeId === 1) || /<(Energy|Verse)>/i.test(n);
}
function battlerIsCharging(b){
  try { return !!(b && b.isATBCharging && b.isATBCharging()); } catch(e){ return false; }
}
function battlerChargeRate(b){
  try { var r = b && b.atbChargeRate && b.atbChargeRate(); return Math.max(0, Math.min(1, r||0)); }
  catch(e){ return 0; }
}
function burnTotalFromNote(skill){
  try{
    var m = (skill && skill.note || "").match(/<\s*BurnChangeUser\s*:\s*([+-]?\d+)\s*>/i);
    return m ? Number(m[1]||0) : 0;
  }catch(e){ return 0; }
}
function tpLimit(b){ try{ return b.tpLimit ? Math.max(1, b.tpLimit()) : 100; }catch(e){ return 100; } }

// --- reservation: set when a skill is confirmed ---
function reserveSkill(actor, skill, mode){
  if (!actor || !skill || !isEnergySkill(skill)) return;
  var cost = Math.max(0, skill.mpCost || skill.mp || 0);
  actor._noqReserve = {
    _owner : 'chargeBridge',
    skillId: skill.id,
    cost   : cost,
    spent  : 0,
    mode   : String(mode || BR.params.mode || 'gradual'),
    burn   : burnTotalFromNote(skill),
    // simulation fallback values (filled lazily)
    _simTimer: 0, _simDur: 0
  };
  if (actor._noqReserve.mode === 'select' && cost > 0){
    // pay up-front, immunity later
    actor.gainMp(-cost);
    actor._noqReserve.spent = cost;
  }
}

// 1) Hook the default Scene_Battle skill OK (covers vanilla + many YEP flows)
var _SB_onSkillOk = Scene_Battle.prototype.onSkillOk;
Scene_Battle.prototype.onSkillOk = function(){
  try{
    var skill = this._skillWindow && this._skillWindow.item ? this._skillWindow.item() : null;
    var actor = BattleManager.actor && BattleManager.actor();
    if (skill && actor) reserveSkill(actor, skill, 'gradual');
  }catch(e){}
  _SB_onSkillOk.call(this);
};

// 2) Extra nets to catch custom flows:
//    - last-battle-skill setter
var _GA_setLastSkill = Game_Actor.prototype.setLastBattleSkill;
Game_Actor.prototype.setLastBattleSkill = function(skill){
  if (skill) reserveSkill(this, skill, 'gradual');
  _GA_setLastSkill.call(this, skill);
};
//    - global helper you can call from your radial, if needed
window.NoqReserveSkill = function(skill){
  var a = BattleManager.actor && BattleManager.actor();
  if (a && skill) reserveSkill(a, skill, 'gradual');
};

// 3) Drain driver (frame-based) — attach to Sprite_Battler.update (actor only)
var _SBatt_update = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function(){
  _SBatt_update.call(this);
  var b = this._battler;
  if (!b || !b.isActor || !b.isActor()) return;

  var R = b._noqReserve;
  if (!R || R._owner !== 'chargeBridge') return;

  // if actor changed action/skill, died, or finished → clear reservation
  var act = b.currentAction && b.currentAction();
  var sk  = act && act.item && act.item();
  if (!sk || sk.id !== R.skillId || b.isDead()){
    b._noqReserve = null;
    return;
  }

  // decide charge mode: ATB native or simulated
  var rate;
  if (battlerIsCharging(b)){
    rate = battlerChargeRate(b);                 // 0..1
    // ATB can stutter at 1 just before resolve; clamp slightly
    rate = Math.max(0, Math.min(0.999, rate||0));
  } else {
    // simulate a short chant (0.75s–1.25s @60fps), stable per-reservation
    if (!R._simDur) R._simDur = 45 + Math.floor(Math.random()*30);
    R._simTimer = Math.min(R._simDur, (R._simTimer||0) + 1);
    rate = R._simDur ? (R._simTimer / R._simDur) : 0;
  }

  // desired MP spent according to charge progress
  var desiredSpent = Math.floor(R.cost * rate + 0.0001);
  var delta = desiredSpent - Math.max(0, R.spent|0);
  if (delta > 0){
    // drain actual MP (up to delta), but *count* the whole delta as progress
    var drain = Math.min(delta, Math.max(0, b.mp|0));
    if (drain > 0) b.gainMp(-drain);

    // apply proportional burnout gain from this slice
    if (R.burn){
      var addTp = (R.cost > 0) ? (R.burn * (delta / R.cost)) : 0;
      if (addTp > 0) b.gainTp(addTp);
    }
    R.spent += delta;
    if (R.spent > R.cost) R.spent = R.cost;
  }

  // stop conditions:
  var finished = R.spent >= R.cost - 0.001 || rate >= 0.999;
  if (finished) {
    // (gradual) pay any rounding remainder now so base paySkillCost can no-op
    if (R.mode === 'gradual'){
      var rem = Math.max(0, R.cost - R.spent);
      if (rem > 0) b.gainMp(-rem);
    }
    b._noqReserve = null;
  }

  // If burnout hit the limit, UBS’s gainTp hooks will fire the state; just stop reserving here.
  if ((b.tp||0) >= tpLimit(b)) {
    b._noqReserve = null;
  }
};

// 4) Immunity + prevent double-pay at resolve
var _GBB_canPay = Game_BattlerBase.prototype.canPaySkillCost;
Game_BattlerBase.prototype.canPaySkillCost = function(skill){
  var R = this._noqReserve;
  if (R && R._owner === 'chargeBridge' && R.skillId === (skill && skill.id)) return true;
  return _GBB_canPay.call(this, skill);
};
var _GB_pay = Game_Battler.prototype.paySkillCost;
Game_Battler.prototype.paySkillCost = function(skill){
  var R = this._noqReserve;
  if (R && R._owner === 'chargeBridge' && R.skillId === (skill && skill.id)) {
    // already paid (select) or finished (gradual); clear & skip base to avoid double charge
    this._noqReserve = null;
    return;
  }
  _GB_pay.call(this, skill);
};

// 5) Safety: clear on action end
var _GB_onAllEnd = Game_Battler.prototype.onAllActionsEnd;
Game_Battler.prototype.onAllActionsEnd = function(){
  _GB_onAllEnd.call(this);
  if (this._noqReserve && this._noqReserve._owner === 'chargeBridge') this._noqReserve = null;
};

})();