/*:
 * @plugindesc (MV, ES5) Burnout Sync Cache — freezes burnout MP scaling and stat buffs during player phase, prevents mid-cast MP cancel.
 * @author Noq
 * @help
 * Place below YEP_BattleEngineCore, YEP_X_BattleSysATB, and Unified Burnout System.
 * 
 * Logic:
 *  - When player phase begins (actor gains control), burnout/MP/stat values are cached.
 *  - Skill costs and stat bonuses reference the cached values (frozen snapshot).
 *  - Cache unfreezes automatically after action resolution.
 *  - Prevents skill cancellation during charge/reservation caused by MP drain.
 */

(function(){
"use strict";

// -------------------------------------------------------------
// 🔧 Ensure debug flag and $gameTemp persist
// -------------------------------------------------------------
if (typeof $gameTemp === "undefined" || !$gameTemp) window.$gameTemp = {};
$gameTemp._debugBurnoutSync = true; // toggle to false to disable console logs

// -------------------------------------------------------------
// 🧩 Helper: snapshot actor burnout + stats
// -------------------------------------------------------------
function snapshotBurnoutState(actor){
  if (!actor || !actor.isActor || !actor.isActor()) return;
  actor._burnoutCache = actor._burnoutCache || {};
  var c = actor._burnoutCache;
  c.mp = actor.mp;
  c.tp = actor.tp;
  c.burnoutRate = (actor.burnoutRate && actor.burnoutRate()) || 0;
  c.statRates = [];
  for (var i = 0; i < 8; i++) c.statRates[i] = actor.paramRate(i);
  c.frozen = true;

  if ($gameTemp && $gameTemp._debugBurnoutSync) {
    console.log(
      "[BurnoutSyncCache] Snapshot for " + actor.name() +
      " — MP:", actor.mp,
      "| TP:", actor.tp,
      "| Burnout%:", ((c.burnoutRate || 0) * 100).toFixed(1) + "%"
    );
  }
}

// -------------------------------------------------------------
// 🧊 Unfreeze after action resolution
// -------------------------------------------------------------
function unfreezeBurnoutState(actor){
  if (!actor || !actor.isActor || !actor.isActor()) return;
  actor._burnoutCache = actor._burnoutCache || {};
  var c = actor._burnoutCache;
  c.mp = actor.mp;
  c.tp = actor.tp;
  c.burnoutRate = (actor.burnoutRate && actor.burnoutRate()) || 0;
  for (var i = 0; i < 8; i++) c.statRates[i] = actor.paramRate(i);
  c.frozen = false;

  if ($gameTemp && $gameTemp._debugBurnoutSync) {
    console.log(
      "[BurnoutSyncCache] Unfreeze for " + actor.name() +
      " — MP:", actor.mp,
      "| TP:", actor.tp,
      "| Burnout%:", ((c.burnoutRate || 0) * 100).toFixed(1) + "%"
    );
  }
}

// -------------------------------------------------------------
// 1️⃣  Hook: normal actor command entry
// -------------------------------------------------------------
var _Scene_Battle_startActorCommandSelection = Scene_Battle.prototype.startActorCommandSelection;
Scene_Battle.prototype.startActorCommandSelection = function(){
  _Scene_Battle_startActorCommandSelection.call(this);
  var actor = BattleManager.actor && BattleManager.actor();
  if (actor) snapshotBurnoutState(actor);
};

// -------------------------------------------------------------
// 2️⃣  Hook: when opening skill window
// -------------------------------------------------------------
var _Scene_Battle_commandSkill = Scene_Battle.prototype.commandSkill;
Scene_Battle.prototype.commandSkill = function(){
  var actor = BattleManager.actor && BattleManager.actor();
  if (actor) snapshotBurnoutState(actor);
  _Scene_Battle_commandSkill.call(this);
};

// -------------------------------------------------------------
// 3️⃣  Fallback: any skill confirmed manually
// -------------------------------------------------------------
if (Scene_Battle.prototype.onSkillOk) {
  var _SB_onSkillOk = Scene_Battle.prototype.onSkillOk;
  Scene_Battle.prototype.onSkillOk = function(){
    var actor = BattleManager.actor && BattleManager.actor();
    if (actor) snapshotBurnoutState(actor);
    _SB_onSkillOk.call(this);
  };
}

// -------------------------------------------------------------
// 4️⃣  Deep fallback: YEP_ATB input grant
// -------------------------------------------------------------
var _BM_startActorInput = BattleManager.startActorInput;
BattleManager.startActorInput = function(){
  _BM_startActorInput.call(this);
  var actor = this.actor && this.actor();
  if (actor) {
    snapshotBurnoutState(actor);
    if ($gameTemp && $gameTemp._debugBurnoutSync) {
      console.log(
        "[BurnoutSyncCache] startActorInput snapshot for " + actor.name() +
        " — MP:", actor.mp,
        "| TP:", actor.tp,
        "| Burnout%:", ((actor.burnoutRate && actor.burnoutRate()*100)||0).toFixed(1)+"%"
      );
    }
  }
};

// -------------------------------------------------------------
// 5️⃣  Unfreeze after the actor’s actions complete
// -------------------------------------------------------------
var _Game_Battler_onAllActionsEnd = Game_Battler.prototype.onAllActionsEnd;
Game_Battler.prototype.onAllActionsEnd = function(){
  _Game_Battler_onAllActionsEnd.call(this);
  if (this.isActor && this.isActor()) unfreezeBurnoutState(this);
};

// -------------------------------------------------------------
// 6️⃣  Read cached stat rates while frozen
// -------------------------------------------------------------
var _paramRate = Game_BattlerBase.prototype.paramRate;
Game_BattlerBase.prototype.paramRate = function(paramId){
  if (this._burnoutCache && this._burnoutCache.frozen) {
    var cached = this._burnoutCache.statRates && this._burnoutCache.statRates[paramId];
    if (cached != null) return cached;
  }
  return _paramRate.call(this, paramId);
};

// -------------------------------------------------------------
// 7️⃣  Prevent skill cancel if burnout/MP fluctuate during charge
// -------------------------------------------------------------
var _UBS_canPaySkillCost = Game_BattlerBase.prototype.canPaySkillCost;
Game_BattlerBase.prototype.canPaySkillCost = function(skill){
  try {
    // If skill is reserved or charging, always allow
    if (this._ubc_charge && this._ubc_charge.skillId === (skill && skill.id)) return true;
    if (this._noqReserve && this._noqReserve.skillId === (skill && skill.id)) return true;
  } catch(e) {}
  return _UBS_canPaySkillCost.call(this, skill);
};

})();