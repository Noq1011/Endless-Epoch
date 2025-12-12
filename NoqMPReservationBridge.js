/*:
 * @target MV
 * @plugindesc (MV, ES5) MP Reservation Bridge v3 — strict actor-only, drains MP only during charge, no TP grant (UBS owns burnout).
 * @author Noq
 * @help
 * Load BELOW YEP_CoreEngine, YEP_BattleEngineCore, YEP_X_BattleSysATB, and BELOW your UBS.
 *
 * What it does:
 *  • Reserves MP ONLY for the current input actor on skill confirm (Verse/Energy).
 *  • Drains MP gradually ONLY while that same actor is actually charging (isATBCharging()).
 *  • Does NOT add TP here (avoid double burnout); UBS handles TP/burnout.
 *  • Skips paySkillCost at resolve to prevent double-charge.
 */

(function(){
'use strict';

/* ----------------- tiny helpers ----------------- */
function isEnergySkill(skill){
  if (!skill) return false;
  if (skill.stypeId === 1) return true;
  var n = String(skill.note||"");
  return /<(Energy|Verse)>/i.test(n);
}
function battlerIsCharging(b){
  try { return !!(b && b.isATBCharging && b.isATBCharging()); } catch(e){ return false; }
}
function battlerChargeRate(b){
  try {
    var r = b && b.atbChargeRate && b.atbChargeRate();
    return Math.max(0, Math.min(0.999, Number(r)||0));
  } catch(e){ return 0; }
}

/* -------------- reserve ONLY on confirm -------------- */
var _SB_onSkillOk = Scene_Battle.prototype.onSkillOk;
Scene_Battle.prototype.onSkillOk = function(){
  var actor = BattleManager.actor && BattleManager.actor();
  var skill = this._skillWindow && this._skillWindow.item && this._skillWindow.item();
  if (actor && actor.isActor && actor.isActor() && skill && isEnergySkill(skill)){
    var cost = Number(skill.mpCost||skill.mp||0);
    try { if (typeof actor.skillMpCost === 'function') cost = Math.max(cost, actor.skillMpCost(skill)|0); } catch(e){}
    actor._noqReserve = {
      owner  : 'noq_mp_bridge_v3',
      skillId: skill.id,
      cost   : Math.max(0, cost|0),
      spent  : 0
    };
  }
  _SB_onSkillOk.call(this);
};

/* -------------- cancel clears -------------- */
var _SB_onSkillCancel = Scene_Battle.prototype.onSkillCancel;
Scene_Battle.prototype.onSkillCancel = function(){
  var a = BattleManager.actor && BattleManager.actor();
  if (a && a._noqReserve && a._noqReserve.owner === 'noq_mp_bridge_v3') a._noqReserve = null;
  _SB_onSkillCancel.call(this);
};

/* -------------- NO double-pay at resolve -------------- */
var _GB_pay = Game_Battler.prototype.paySkillCost;
Game_Battler.prototype.paySkillCost = function(skill){
  var R = this._noqReserve;
  if (R && R.owner === 'noq_mp_bridge_v3' && R.skillId === (skill && skill.id)){
    var rem = Math.max(0, (R.cost|0) - (R.spent|0));
    if (rem > 0) this.gainMp(-rem);
    this._noqReserve = null;
    return;
  }
  _GB_pay.call(this, skill);
};

/* -------------- Gradual drain ONLY for the input actor, ONLY during charge -------------- */
var _SpriteBattler_update = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function(){
  _SpriteBattler_update.call(this);

  var b = this._battler;
  if (!b || !b.isActor || !b.isActor()) return;

  // Only the actor currently taking input / executing that reserved skill can drain
  var cur = BattleManager.actor && BattleManager.actor();
  if (b !== cur) return; // <- hard fence (prevents other party members from draining)

  var R = b._noqReserve;
  if (!R || R.owner !== 'noq_mp_bridge_v3') return;

  // Require the same skill to be actually charging now
  var act = b.currentAction && b.currentAction();
  var skill = act && act.item && act.item();
  if (!skill || skill.id !== R.skillId || !isEnergySkill(skill)) return;

  // Only drain while charging (no “menu preview”)
  if (!battlerIsCharging(b)) return;

  var rate = battlerChargeRate(b); // 0..~0.999
  var desired = Math.floor((R.cost|0) * rate + 0.0001);
  var delta = desired - (R.spent|0);

  if (delta > 0){
    var drain = Math.min(delta, Math.max(0, b.mp|0));
    if (drain > 0) b.gainMp(-drain);
    R.spent += delta;
    if (R.spent > R.cost) R.spent = R.cost;
  }
};

/* -------------- Safety: clear at end of actions -------------- */
var _GB_onAllActionsEnd = Game_Battler.prototype.onAllActionsEnd;
Game_Battler.prototype.onAllActionsEnd = function(){
  _GB_onAllActionsEnd.call(this);
  var R = this._noqReserve;
  if (R && R.owner === 'noq_mp_bridge_v3') this._noqReserve = null;
};

})();
