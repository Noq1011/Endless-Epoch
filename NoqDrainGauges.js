/*:
 * @target MV
 * @plugindesc (MV, ES5) EN (MP) drains during ATB charge; Burnout (TP) changes only for <BurnChangeUser:x>, totaling EXACTLY x. Actor-only, menu-safe.
 * @author Noq
 * @help
 * Load below YEP_CoreEngine, YEP_BattleEngineCore, YEP_X_BattleSysATB, and below your UBS.
 *
 * What this does
 *  • On confirm: create a cast context ONLY for the current actor.
 *  • While that actor is ACTUALLY CHARGING: drain EN proportional to charge %.
 *  • If the skill has <BurnChangeUser:x> then TP changes gradually during charge,
 *    and on finish we apply a small remainder so total TP change is EXACTLY x.
 *    - Use positive x to fill (gain TP/burnout), negative x to drain (reduce TP).
 *  • Never during menus; never enemies; no double-pay at resolve.
 *
 * Radial confirm:
 *  If your radial bypasses Scene_Battle.onSkillOk, call:
 *     NoqConfirmSelectedSkill(skill, actor);
 */

(function(){
'use strict';

/* ---------- helpers ---------- */
function isActor(b){ return b && b.isActor && b.isActor(); }
function isEnergySkill(s){ if (!s) return false; if (s.stypeId === 1) return true; return /<(Energy|Verse)>/i.test(String(s.note||"")); }
function parseBurnChange(s){ var m = String(s && s.note || "").match(/<\s*BurnChangeUser\s*:\s*([+-]?\d+)\s*>/i); return m ? Number(m[1])||0 : 0; }
function isCharging(b){ try{ return !!(b && b.isATBCharging && b.isATBCharging()); }catch(e){ return false; } }
function chargeRate(b){ try{ var r=b && b.atbChargeRate && b.atbChargeRate(); return Math.max(0, Math.min(0.999, Number(r)||0)); }catch(e){ return 0; } }
function currentSkill(b){ try{ var a=b && b.currentAction && b.currentAction(); var it=a && a.item && a.item(); return (it && DataManager.isSkill(it)) ? it : null; }catch(e){return null;} }

/* ---------- context create/clear ---------- */
function createCtx(actor, skill){
  if (!actor || !skill) return;
  var cost = Number(skill.mpCost || skill.mp || 0);
  try{ if (typeof actor.skillMpCost === 'function') cost = Math.max(cost, actor.skillMpCost(skill)|0); }catch(e){}
  actor._noqCastCtx = {
    owner       : 'noq_en_during_charge',
    skillId     : skill.id,
    cost        : Math.max(0, cost|0),
    spent       : 0,
    burnTot     : parseBurnChange(skill), // this is the exact total TP change desired
    burnApplied : 0,                      // how much TP we've actually applied so far
    started     : false,                  // flips true once isATBCharging() becomes true
    lastPct     : 0
  };
}

function clearCtx(actor){
  if (actor && actor._noqCastCtx && actor._noqCastCtx.owner === 'noq_en_during_charge') actor._noqCastCtx = null;
}

/* ---------- hook: default confirm/cancel ---------- */
var _SB_onSkillOk = Scene_Battle.prototype.onSkillOk;
Scene_Battle.prototype.onSkillOk = function(){
  try{
    var a = BattleManager.actor && BattleManager.actor();
    var s = this._skillWindow && this._skillWindow.item && this._skillWindow.item();
    if (isActor(a) && s && isEnergySkill(s)) createCtx(a, s);
  }catch(e){}
  _SB_onSkillOk.call(this);
};

var _SB_onSkillCancel = Scene_Battle.prototype.onSkillCancel;
Scene_Battle.prototype.onSkillCancel = function(){
  try{ clearCtx(BattleManager.actor && BattleManager.actor()); }catch(e){}
  _SB_onSkillCancel.call(this);
};

/* ---------- public helper for radial confirm ---------- */
window.NoqConfirmSelectedSkill = function(skill, actorOpt){
  var a = actorOpt || (BattleManager.actor && BattleManager.actor());
  if (isActor(a) && skill && isEnergySkill(skill)) createCtx(a, skill);
};

/* ---------- gradual EN drain & TP on tag (actor-only, charge-only, exact total) ---------- */
var _SpriteBattler_update = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function(){
  _SpriteBattler_update.call(this);

  var b = this._battler;
  if (!isActor(b)) return;

  var C = b._noqCastCtx;
  if (!C || C.owner !== 'noq_en_during_charge') return;

  // Must be the same skill actually queued
  var sk = currentSkill(b);
  if (!sk || sk.id !== C.skillId || !isEnergySkill(sk)) return;

  // Wait until real charge begins (prevents menu-opening side effects)
  if (!C.started){
    if (!isCharging(b)) return; // still not charging; do nothing yet
    C.started = true;           // arms the ticker once charging starts
    C.lastPct = 0;
  }

  // Only while charging
  if (!isCharging(b)) return;

  var pct  = chargeRate(b); // 0..~0.999 while charging
  var want = Math.floor(C.cost * pct + 0.0001);
  var dEN  = want - C.spent;           // EN (MP) delta to drain this frame

  if (dEN > 0){
    // 1) EN drain
    var drain = Math.min(dEN, Math.max(0, b.mp|0));
    if (drain > 0) b.gainMp(-drain);

    // Always advance spent so we never pay twice at resolve
    C.spent += dEN;
    if (C.spent > C.cost) C.spent = C.cost;

    // 2) Burnout only if the skill has <BurnChangeUser:x>
    if (C.burnTot){
      // Distribute proportionally to EN drained this tick, so total sums to burnTot.
      var addTp = (C.cost > 0) ? (C.burnTot * (dEN / C.cost)) : 0;
      if (addTp) { b.gainTp(addTp); C.burnApplied += addTp; }
    }
  }

  C.lastPct = pct;

  // Finish near full — finalize EN rounding and TP remainder to hit EXACT total
  if (pct >= 0.999 || C.spent >= C.cost){
    // EN remainder (usually 0 or 1)
    var remEN = Math.max(0, C.cost - C.spent);
    if (remEN > 0) b.gainMp(-remEN);

    // TP remainder to guarantee EXACT total = burnTot
    if (C.burnTot){
      var remTP = C.burnTot - (C.burnApplied || 0);
      if (Math.abs(remTP) > 0.0001) b.gainTp(remTP);
    }
    clearCtx(b);
  }
};

/* ---------- prevent double-pay at resolve ---------- */
var _GB_paySkillCost = Game_Battler.prototype.paySkillCost;
Game_Battler.prototype.paySkillCost = function(skill){
  var C = this._noqCastCtx;
  if (C && C.owner === 'noq_en_during_charge' && C.skillId === (skill && skill.id)){
    var rem = Math.max(0, (C.cost|0) - (C.spent|0));
    if (rem > 0) this.gainMp(-rem); // normally 0 or 1 due to rounding
    clearCtx(this);
    return; // skip base to avoid double-pay
  }
  _GB_paySkillCost.call(this, skill);
};

/* ---------- cleanup at end of actions ---------- */
var _GB_onAllActionsEnd = Game_Battler.prototype.onAllActionsEnd;
Game_Battler.prototype.onAllActionsEnd = function(){
  _GB_onAllActionsEnd.call(this);
  clearCtx(this);
};

})();