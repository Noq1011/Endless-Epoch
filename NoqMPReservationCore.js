/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq MP Reservation Core — restores gradual MP drain + burnout gain sync with YEP ATB
 * @author Noq
 * @help
 * Drop below YEP_CoreEngine, YEP_BattleEngineCore, YEP_X_BattleSysATB, and Unified Burnout System.
 * Works with any HUD that reads actor MP/TP (e.g. your Canvas Gauge HUD).
 *
 *  • Select a Verse (stype 1) skill → marks it for reservation.
 *  • During ATB charge (gradual mode) drains MP proportionally and adds burnout (TP).
 *  • On cast finish or cancel → cleans reservation and skips double cost.
 */

(function(){
"use strict";

/* --------------------------------------------------------
 * helpers
 * -------------------------------------------------------- */
function battlerIsCharging(b){
  try { return b && b.isATBCharging && b.isATBCharging(); } catch(e){ return false; }
}
function battlerChargeRate(b){
  try { var r=b&&b.atbChargeRate&&b.atbChargeRate(); return Math.max(0,Math.min(1,r||0)); }
  catch(e){ return 0; }
}
function noqCurrentSkill(actor){
  try{
    var a=actor&&actor.currentAction&&actor.currentAction();
    var item=a&&a.item&&a.item();
    return item&&DataManager.isSkill(item)?item:null;
  }catch(e){return null;}
}

/* --------------------------------------------------------
 * mark reservation at skill selection
 * -------------------------------------------------------- */
var _Scene_Battle_onSkillOk=Scene_Battle.prototype.onSkillOk;
Scene_Battle.prototype.onSkillOk=function(){
  var skill=this._skillWindow&&this._skillWindow.item?this._skillWindow.item():null;
  var actor=BattleManager.actor&&BattleManager.actor();
  if(skill&&actor&&skill.stypeId===1){
    actor._noqReserve={
      skillId:skill.id,
      cost:Number(skill.mpCost||skill.mp||0),
      spent:0,
      mode:'gradual'
    };
  }
  _Scene_Battle_onSkillOk.call(this);
};

/* --------------------------------------------------------
 * refund if cancelled
 * -------------------------------------------------------- */
var _Scene_Battle_onSkillCancel=Scene_Battle.prototype.onSkillCancel;
Scene_Battle.prototype.onSkillCancel=function(){
  var actor=BattleManager.actor&&BattleManager.actor();
  if(actor&&actor._noqReserve){ actor._noqReserve=null; }
  _Scene_Battle_onSkillCancel.call(this);
};

/* --------------------------------------------------------
 * pay-skill cost skip (don’t double deduct)
 * -------------------------------------------------------- */
var _Game_Battler_paySkillCost=Game_Battler.prototype.paySkillCost;
Game_Battler.prototype.paySkillCost=function(skill){
  if(this._noqReserve&&this._noqReserve.skillId===(skill&&skill.id)){
    this._noqReserve=null;
    return;
  }
  _Game_Battler_paySkillCost.call(this,skill);
};

/* --------------------------------------------------------
 * per-frame gradual drain while charging (based on YEP ATB rate)
 * -------------------------------------------------------- */
var _Sprite_Battler_update=Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update=function(){
  _Sprite_Battler_update.call(this);
  var b=this._battler;
  if(!b||!b.isActor||!b.isActor())return;
  var res=b._noqReserve;
  if(!res||res.mode!=='gradual')return;

  var sk=noqCurrentSkill(b);
  if(!battlerIsCharging(b)||!sk||sk.id!==res.skillId||sk.stypeId!==1)return;

  var cost=Math.max(0,res.cost|0);
  var rate=battlerChargeRate(b); // 0–1 of ATB charge
  var desired=Math.floor(cost*rate);
  var delta=desired-res.spent;

  if(delta>0){
    var drain=Math.min(delta,Math.max(0,b.mp));
    if(drain>0)b.gainMp(-drain);
    res.spent+=delta;
    if(res.spent>cost)res.spent=cost;

    // live burnout gain (visual only, does not double-apply UBS)
    var boDelta=(delta/cost)*2; // ≈2 TP per MP segment; tweak as needed
    if(boDelta>0)b.gainTp(boDelta);

    if(typeof b._syncUBSState==="function")b._syncUBSState();
  }
};

/* --------------------------------------------------------
 * clear reservation at action end
 * -------------------------------------------------------- */
var _Game_Battler_onAllActionsEnd=Game_Battler.prototype.onAllActionsEnd;
Game_Battler.prototype.onAllActionsEnd=function(){
  _Game_Battler_onAllActionsEnd.call(this);
  if(this._noqReserve)this._noqReserve=null;
};

})();