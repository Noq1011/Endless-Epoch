/*:
 * @plugindesc (MV, ES5) Unified Burnout System CORE - Final ATB Sync Build.
 * @author Noq + Tyson
 * @help
 * REPLACES: NoqUnifiedBurnoutSystem.js AND NoqBurnoutBattleLogic.js.
 * Load order: BELOW YEP_CoreEngine, YEP_BattleEngineCore, YEP_X_BattleSysATB.
 */

(function(){
'use strict';

var UBS = window.UBS || (window.UBS = {});

/* =========================
   1. Configuration
   ========================= */
UBS.DEFAULT_BURNOUT_STATE_ID  = 17;
UBS.NATURAL_TP_DECAY_PER_TURN = 1;
UBS.DEBUG = true;

UBS.MP_Tiers = [
  { rate: 0.20, mult: 1.0 },
  { rate: 0.40, mult: 1.25 },
  { rate: 0.60, mult: 1.5 },
  { rate: 0.85, mult: 2.0 }
];
UBS.MP_randomVarianceAbove75 = 0.0;

UBS.BO_Tiers = [
  { rate: 0.00, add: [] },
  { rate: 0.33, add: [] },
  { rate: 0.66, add: [] }
];
UBS.BO_BURNOUT_EXTRA_STATES = [];

UBS.CANCEL_ON_BURNOUT = false;
UBS.SYNTH_FRAMES_MIN   = 45;
UBS.SYNTH_FRAMES_MAX   = 75;
UBS.SYNTH_PER_TICK_CAP = 10;
UBS.APPLY_TO_ENEMIES          = false;
UBS.TIER_STATES_ACTOR_ONLY    = true;

function log(){ if(UBS.DEBUG) console.log.apply(console,arguments); }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }

/* =========================
   2. Helpers & Data Parsing
   ========================= */
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

// Fixed Regex: Forgiving of spaces and properly catches negative numbers
function parseBurnChange(skill){
  if (!skill || !skill.note) return { value: 0, type: "flat" };
  var p = skill.note.match(/<\s*BurnChangeUser\s*:\s*([+-]?\d+)\s*%\s*>/i);
  if (p) return { value: Number(p[1]), type: "percent" };
  var f = skill.note.match(/<\s*BurnChangeUser\s*:\s*([+-]?\d+)\s*>/i);
  if (f) return { value: Number(f[1]), type: "flat" };
  return { value: 0, type: "flat" };
}

function parseInstantBurnChange(skill){
  if (!skill || !skill.note) return 0;
  var m = skill.note.match(/<\s*InstantBurnChange\s*:\s*([+-]?\d+)\s*>/i);
  return m ? Number(m[1]) : 0;
}

var _DM_isDatabaseLoaded = DataManager.isDatabaseLoaded;
DataManager.isDatabaseLoaded = function() {
    if (!_DM_isDatabaseLoaded.call(this)) return false;
    var groups = [$dataActors, $dataEnemies, $dataClasses, $dataStates, $dataWeapons, $dataArmors, $dataSkills];
    groups.forEach(function(group) {
        if (!group) return;
        for (var i = 1; i < group.length; i++) {
            var obj = group[i]; if (!obj) continue;
            var resL = obj.note.match(/<TpLimit:(-?\d+)>/i);
            obj.tpLimit = resL ? Number(resL[1]) : 0;
            var resR = obj.note.match(/<TpRegen:(-?\d+)>/i);
            obj.tpRegen = resR ? Number(resR[1]) : 0;
        }
    });
    return true;
};

/* =========================
   3. Limits, Regen & Decay
   ========================= */
Game_BattlerBase.prototype.tpLimit = function() {
    var limit = 0;
    if (this.isActor()) {
        var a = $dataActors[this.actorId()], c = $dataClasses[this._classId];
        if (a) limit += a.tpLimit || 0;
        if (c) limit += c.tpLimit || 0;
        this.equips().forEach(function(e) { if (e) limit += e.tpLimit || 0; });
    } else {
        var e = $dataEnemies[this.enemyId()];
        limit = e ? (e.tpLimit || 100) : 100;
    }
    this.states().forEach(function(s) { if (s) limit += s.tpLimit || 0; });
    return Math.max(1, limit);
};

Game_BattlerBase.prototype.tpRegenTotal = function() {
    var total = 0;
    this.states().forEach(function(s) { if (s) total += s.tpRegen || 0; });
    if (this.isActor()) {
        this.equips().forEach(function(e) { if (e) total += e.tpRegen || 0; });
        var a = $dataActors[this.actorId()], c = $dataClasses[this._classId];
        if (a) total += a.tpRegen || 0;
        if (c) total += c.tpRegen || 0;
    } else {
        var en = $dataEnemies[this.enemyId()];
        if (en) total += en.tpRegen || 0;
    }
    return total;
};

var _Game_Battler_regenerateAll = Game_Battler.prototype.regenerateAll;
Game_Battler.prototype.regenerateAll = function() {
    _Game_Battler_regenerateAll.call(this);
    var regen = this.tpRegenTotal();
    if (regen !== 0) this.gainTp(regen);
};

// Apply Natural Decay at Turn End (Prevents constant popup numbers)
var _onTurnEnd = Game_Battler.prototype.onTurnEnd;
Game_Battler.prototype.onTurnEnd = function() {
    _onTurnEnd.call(this);
    if (this.isActor && this.isActor() && !this.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)) {
        this.setTp(Math.max(0, (this.tp || 0) - UBS.NATURAL_TP_DECAY_PER_TURN));
    }
    if (this.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID) && !this._inLockedBurnout) {
    var d = this._ubc_burnoutDrainRate || 0;
    if (d > 0) this.setTp(Math.max(0, (this.tp || 0) - d));
}
};

Game_BattlerBase.prototype.maxTp = function() {
    return this.tpLimit();
};

/* =========================
   4. Burnout Triggers
   ========================= */
function triggerBackfire(battler){
  try{
    if(!battler) return;
    var dmg = Math.floor(battler.mhp * 0.20);
    dmg = Math.min(dmg, Math.max(0, battler.hp - 1));
    if(dmg <= 0) return; 
    battler.startAnimation(123, false, 0);
    battler.gainHp(-dmg);
    battler.startDamagePopup();
  }catch(e){}
}

function maybeTriggerBurnout(battler, src){
    if(!battler || !battler.addState) return;
    var lim = battler.tpLimit();
    var tp = battler.tp || 0;
    
    // +0.1 prevents rounding math from getting stuck at 99.999/100
    if(tp >= (lim - 0.1) 
   && !battler.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)
   && !battler._inLockedBurnout){
        battler.addState(UBS.DEFAULT_BURNOUT_STATE_ID);

// Enter locked burnout instead of resetting TP
battler._inLockedBurnout = true;

// Set drain rate based on desired duration
var turns = (battler._stateTurns && battler._stateTurns[UBS.DEFAULT_BURNOUT_STATE_ID]) || 3;
battler._ubc_burnoutDrainRate = Math.ceil(lim / Math.max(1, turns));

// Clamp TP to max instead of resetting
battler.setTp(lim);

        if (UBS.CANCEL_ON_BURNOUT){
            if (battler.currentAction){ var ca = battler.currentAction(); if (ca && ca.clear) ca.clear(); }
            if (battler.clearActions) battler.clearActions();
            if (battler.requestMotionRefresh) battler.requestMotionRefresh();
            triggerBackfire(battler);

            battler._ubc_lockActive = false;
            battler._ubc_lockedSkillId = null;
            battler._ubc_lockedMpCost = null;
            battler._ubc_charge = null;
            battler._ubc_paidMpForLocked = false;
            battler._ubc_drainedMp = 0;
        }
    }
}

var _Game_BattlerBase_setTp = Game_BattlerBase.prototype.setTp;
Game_BattlerBase.prototype.setTp = function(tp) {
    var lim = this.tpLimit();
    var val = Math.min(Math.max(tp, 0), lim);
    _Game_BattlerBase_setTp.call(this, val);
    maybeTriggerBurnout(this, "setTp");
};

var _Game_Battler_gainTp = Game_Battler.prototype.gainTp;
Game_Battler.prototype.gainTp = function(value) {
    _Game_Battler_gainTp.call(this, value);

    var lim = this.tpLimit();

    if (this.tp > lim) this.setTp(lim);
    if (this.tp < 0) this.setTp(0);

    //  Restore burnout trigger
    maybeTriggerBurnout(this, "gainTp");
};

var _rem = Game_Battler.prototype.removeState;
Game_Battler.prototype.removeState = function(id) {
    _rem.call(this, id);
    if (id === UBS.DEFAULT_BURNOUT_STATE_ID) this._ubc_burnoutDrainRate = 0;
};

/* =========================
   5. Cost Scaling & Tier States
   ========================= */
var _cost = Game_BattlerBase.prototype.skillMpCost;
Game_BattlerBase.prototype.skillMpCost = function(skill) {
  if(this._ubc_lockActive && this._ubc_lockedSkillId === (skill && skill.id) && this._ubc_lockedMpCost != null)
    return this._ubc_lockedMpCost;

  var base = _cost.call(this, skill);
  if(!skill || !isEnergySkill(skill)) return base;

  var br = burnoutRateOf(this);
  var mult = UBS.MP_Tiers[0].mult;
  for(var i=0; i < UBS.MP_Tiers.length; i++){
    if(br >= UBS.MP_Tiers[i].rate) mult = UBS.MP_Tiers[i].mult;
  }
  var result = Math.round(base * mult);
//console.log("Burnout Rate:", br, "MP Mult:", mult);
return result;
};

function tierIndexForRate(r){
  var idx = 0;
  for (var i=0; i < UBS.BO_Tiers.length; i++) if (r >= UBS.BO_Tiers[i].rate) idx = i;
  return idx;
}

function syncTierStates(b){
  if (UBS.TIER_STATES_ACTOR_ONLY && (!b.isActor || !b.isActor())) return;
  var rate = burnoutRateOf(b);
  var idx  = tierIndexForRate(rate);
  var inBo = b.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID);

  if (b._ubc_boTierIndex === idx && b._ubc_boWasBurnout === inBo) return;

  for (var t=0; t < UBS.BO_Tiers.length; t++){
    var arr = UBS.BO_Tiers[t].add || [];
    arr.forEach(function(sid){ if(sid > 0) b.removeState(sid); });
  }
  var addArr = UBS.BO_Tiers[idx].add || [];
  addArr.forEach(function(id){ if(id > 0) b.addState(id); });

  if (inBo){
      UBS.BO_BURNOUT_EXTRA_STATES.forEach(function(ex){ if(ex > 0) b.addState(ex); });
  }

  b._ubc_boTierIndex = idx;
  b._ubc_boWasBurnout = inBo;
}

/* =========================
   6. ATB-Synced Battle Engine
   ========================= */
var _SB_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update.call(this);

  function targetConfirmed(act){
    if (!act || !act.item) return false;
    if (typeof act.needsSelection === 'function' && !act.needsSelection()) return true;
    if (typeof act.targetIndex === 'function') return act.targetIndex() != null && act.targetIndex() >= 0;
    return act._targetIndex != null && act._targetIndex >= 0;
  }

  try {
    var sideA = $gameParty.members();
    var sideB = $gameTroop.members();
    var battlers = UBS.APPLY_TO_ENEMIES ? sideA.concat(sideB) : sideA;

    var scn = SceneManager._scene;
    var targetUIOpen = scn && ((scn._enemyWindow && scn._enemyWindow.active) || (scn._actorWindow && scn._actorWindow.active));

    for (var i=0; i < battlers.length; i++) {
      var b = battlers[i]; if (!b) continue;
      syncTierStates(b);

      if (b.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)){
        b._ubc_charge = null;
        b._ubc_latch  = b._ubc_latch || {done:true, act:null, skillId:null};
        b._ubc_latch.done = true;
        continue;
      }

      if (b.isInputting() || targetUIOpen){
        if (b._ubc_charge){
          b._ubc_charge = null;
          b._ubc_lockActive=false; b._ubc_lockedSkillId=null; b._ubc_lockedMpCost=null; b._ubc_paidMpForLocked=false;
        }
        continue;
      }

      var act = b._actions && b._actions[0];
      var skill = act && act.item && act.item();
      var burnData = skill ? parseBurnChange(skill) : { value: 0, type: "flat" };
      var burnTot = (burnData.type === "percent") ? (burnData.value / 100) * b.tpLimit() : burnData.value;
      var isVerse = !!(skill && burnData.value !== 0 && isEnergySkill(skill));

      if (!b._ubc_latch) b._ubc_latch = {done:false, act:null, skillId:null};
      if (act !== b._ubc_latch.act || (skill && skill.id !== b._ubc_latch.skillId)){
        b._ubc_latch.done   = false;
        b._ubc_latch.act    = act;
        b._ubc_latch.skillId= skill ? skill.id : null;
        b._ubc_charge = null;
        b._ubc_drainedMp = 0;
      }

      var ready = isVerse && !b._ubc_latch.done && targetConfirmed(act);
      if (!ready){
        if (!isVerse){
          b._ubc_charge = null;
          b._ubc_lockActive=false; b._ubc_lockedSkillId=null; b._ubc_lockedMpCost=null; b._ubc_paidMpForLocked=false;
        }
        continue;
      }

      // Read Yanfly ATB hooks
      var hasCharging = (typeof b.isATBCharging === 'function') ? !!b.isATBCharging() : false;
      var hasCR = (typeof b.atbChargeRate === 'function');
      var crNow = hasCR ? clamp(b.atbChargeRate()||0, 0, 1) : null;

      if (!b._ubc_charge){
        var cost = Math.max(0, b.skillMpCost(skill));
        b._ubc_lockActive      = true;
        b._ubc_lockedSkillId   = skill.id;
        b._ubc_lockedMpCost    = cost;
        b._ubc_paidMpForLocked = false;

        b._ubc_charge = {
          skillId : skill.id,
          total   : burnTot,
          applied : 0,
          mode    : (hasCharging && hasCR) ? "atb" : "synthetic",
          prevCR  : (hasCharging && hasCR) ? crNow : null,
          p       : 0,
          drained : 0,
          synthT  : 0,
          synthDur: UBS.SYNTH_FRAMES_MIN + Math.floor(Math.random()*(UBS.SYNTH_FRAMES_MAX-UBS.SYNTH_FRAMES_MIN)),
          synthPer: 0
        };
        b._ubc_drainedMp = 0;
      }

      var ch = b._ubc_charge;
      if (!ch) continue;

      // Yanfly ATB Sync loop
      if (ch.mode === "atb" && hasCharging && hasCR){
        var now = clamp(b.atbChargeRate()||0, 0, 1);
        if (ch.prevCR == null) ch.prevCR = now;
        var dProg = Math.max(0, now - ch.prevCR);
        ch.prevCR = now;

        if (dProg > 0){
          var remaining = ch.total - ch.applied;
          var step = ch.total * dProg;
          
          // Negative Math fix
          var addTP = (ch.total > 0) ? Math.min(remaining, step) : Math.max(remaining, step);
          if (addTP !== 0){ b.gainTp(addTP); syncTierStates(b); ch.applied += addTP; }

          ch.p = clamp(ch.p + Math.abs(dProg), 0, 1);
          var want = (b._ubc_lockedMpCost||0) * ch.p;
          var delta = want - ch.drained;
          if (delta > 0){ b.gainMp(-delta); ch.drained += delta; b._ubc_drainedMp = ch.drained; }
        }
        if (now >= 1 || Math.abs(ch.applied) >= Math.abs(ch.total) - 0.0001){
          b._ubc_latch.done = true;
          b._ubc_charge = null;
        }
      }
      else {
        // Synthetic fallback
        if (ch.synthPer === 0) ch.synthPer = (ch.total !== 0) ? (ch.total / Math.max(1, ch.synthDur)) : 0;
        if (ch.synthT < ch.synthDur && Math.abs(ch.applied) < Math.abs(ch.total)){
          var remainingS = ch.total - ch.applied;
          var stepS = ch.synthPer;
          
          // Negative Math fix
          var addS = (ch.total > 0) 
            ? Math.min(stepS, remainingS, UBS.SYNTH_PER_TICK_CAP) 
            : Math.max(-UBS.SYNTH_PER_TICK_CAP, stepS, remainingS);

          if (addS !== 0){ b.gainTp(addS); syncTierStates(b); ch.applied += addS; }

          var dProgS = (ch.total !== 0) ? (addS / Math.abs(ch.total)) : 0;
          ch.p = clamp(ch.p + dProgS, 0, 1);
          var wantS = (b._ubc_lockedMpCost||0) * ch.p;
          var dS = wantS - ch.drained;

          if (dS > 0){ b.gainMp(-dS); ch.drained += dS; b._ubc_drainedMp = ch.drained; }
          ch.synthT++;
        }
        if (ch.synthT >= ch.synthDur || Math.abs(ch.applied) >= Math.abs(ch.total)){
          b._ubc_latch.done = true;
          b._ubc_charge = null;
        }
      }

      if (b.isDead() || b.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)){
        b._ubc_charge = null;
        b._ubc_latch.done = true;
      }
    }
  } catch(e) { console.error("[UBS.update]", e); }
};

var _UBS_apply = Game_Action.prototype.apply;
Game_Action.prototype.apply = function(target) {
  _UBS_apply.call(this, target);

  var skill = this.item();
  if (!skill) return;

  var val = parseInstantBurnChange(skill);
  if (val === 0) return;

  if (!target || !target.isAlive()) return;

  // Apply instantly
  target.gainTp(val);

  if (UBS.DEBUG){
    console.log("[UBS InstantBurn]", target.name(), val);
  }
};

/* =========================
   7. Reconcile & Cleanup
   ========================= */
var _can = Game_BattlerBase.prototype.canPaySkillCost;
Game_BattlerBase.prototype.canPaySkillCost = function(skill){
  if(this._ubc_lockActive && this._ubc_lockedSkillId === (skill && skill.id)){
    return true; // Stop skills from greying out mid-charge
  }
  return _can.call(this, skill);
};

var _pay = Game_Battler.prototype.paySkillCost;
Game_Battler.prototype.paySkillCost = function(skill){
  if(this._ubc_lockActive && this._ubc_lockedSkillId === (skill && skill.id)){
    if(!this._ubc_paidMpForLocked){
      var cost = this._ubc_lockedMpCost || 0;
      var already = this._ubc_drainedMp || 0;
      var rem = Math.max(0, cost - already);
      if(rem > 0) this.gainMp(-rem);
      this._ubc_paidMpForLocked = true;
    }
    return;
  }
  _pay.call(this, skill);
};

var _end = Game_Battler.prototype.onAllActionsEnd;
Game_Battler.prototype.onAllActionsEnd = function(){
  _end.call(this);
  this._ubc_lockActive = false;
  this._ubc_lockedSkillId = null;
  this._ubc_lockedMpCost = null;
  this._ubc_paidMpForLocked = false;
  this._ubc_charge = null;
  this._ubc_drainedMp = 0;
};

if(!Game_BattlerBase.prototype.burnoutRate){
  Game_BattlerBase.prototype.burnoutRate = function(){
    var lim = this.tpLimit();
    if(lim <= 0) return 0;
    return Math.max(0, Math.min(1, (this.tp || 0) / lim));
  };
}

// -------------------------
// AI Intelligence Bridge: Burnout Prediction
// -------------------------
UBS.predictImpact = function(battler, skill) {
    if (!battler || !skill) return { rate: 0, locked: false, tierUp: false };
    
    // 1. Calculate current vs future rate
    var currentRate = battler.burnoutRate();
    var burnData = parseBurnChange(skill); // From UBS Core
    var instant = parseInstantBurnChange(skill);
    
	var totalBurn = (burnData.type === "percent") ? (burnData.value / 100) : (burnData.value / battler.tpLimit());
    totalBurn += (instant / battler.tpLimit());

    // NEW: Account for upcoming VerseTriggers (50% burnout gain)
// FIX: Check for BOTH UEE and UEE.AI before calling
    if (typeof UEE !== 'undefined' && UEE.AI && typeof UEE.AI.isTriggerDue === 'function' && UEE.AI.isTriggerDue(battler)) {
        var triggers = UEE.AI.getPotentialTriggers(battler);
        triggers.forEach(function(t) {
            var triggerMatch = t.skill.note.match(/<\s*BurnChangeUser\s*:\s*([+-]?\d+)\s*>/i);
            if (triggerMatch) {
                var triggerGain = (Number(triggerMatch[1]) / 2) / battler.tpLimit();
                totalBurn += triggerGain; 
            }
        });
    }
    
    var finalRate = Math.min(1, currentRate + totalBurn);
    
    // 2. Determine if we cross an MP Cost tier
    var currentTier = 0;
    var finalTier = 0;
    this.MP_Tiers.forEach(function(t, i) {
        if (currentRate >= t.rate) currentTier = i;
        if (finalRate >= t.rate) finalTier = i;
    });

    return {
        finalRate: finalRate,
        triggersLocked: (finalRate >= 0.99 && !battler.isStateAffected(this.DEFAULT_BURNOUT_STATE_ID)),
        tierUp: (finalTier > currentTier)
    };
};

// ============================================================================
// MALIN DYNAMIC STAT OVERRIDES (Embern Scaling - Level 20+)
// ============================================================================
var _Noq_Game_Actor_param = Game_Actor.prototype.param;
Game_Actor.prototype.param = function(paramId) {
    // Get the base stat from the engine first
    var value = _Noq_Game_Actor_param.call(this, paramId);

    // Check if this is Malin AND if she has reached Level 20
    if (this.name() === "Malin" && this.level >= 20) {
        
        var BURN_STATE_ID = 20; // Replace with your actual Burn state applied to enemies
        
        // -------------------------------------------------------------
        // EMBERN HEART (Dynamic MAT Scaling)
        // -------------------------------------------------------------
        // Only scale MAT (Param 4) and only if currently in battle
        if (paramId === 4 && $gameParty.inBattle()) { 
            // Count how many living enemies are currently burned
            var burnedCount = $gameTroop.aliveMembers().filter(function(enemy) {
                return enemy.isStateAffected(BURN_STATE_ID);
            }).length;

            // +15% MAT for every burned enemy
            if (burnedCount > 0) {
                var multiplier = 1 + (burnedCount * 0.15);
                value *= multiplier;
            }
        }
    }

    // Return the final value, ensuring it doesn't drop below 1
    return Math.max(1, Math.floor(value));
};

})();