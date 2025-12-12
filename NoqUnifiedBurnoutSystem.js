/*:
 * @plugindesc (MV, ES5, DEBUG) Unified Burnout System — true charge-phase TP gain, progressive MP drain, tier states, EN scaling, guards.
 * @author Noq + Tyson
 * @help
 * Load order: BELOW YEP_CoreEngine, YEP_BattleEngineCore, YEP_X_BattleSysATB, and your radial wiring.
 *
 * What this does:
 *  - As soon as a Verse/Energy skill is selected AND target is confirmed, burnout (TP) rises GRADUALLY
 *    while the battler is charging (ATB-aware). A smooth synthetic fallback runs if no ATB charge API.
 *  - MP/EN drains PROGRESSIVELY across the charge; at cast time we pay only any small remainder.
 *  - EN/MP cost scales with burnout tiers (up to 2×), same as before.
 *  - Auto-applies DB states when burnout crosses thresholds (configurable per-tier).
 *  - Natural per-turn burnout decay + extra drain while in Burnout state.
 *  - Actor-only by default for charge & tier states; flip flags below if you want enemies included.
 */

(function(){
'use strict';

/* =========================
   Settings
   ========================= */
var UBS = window.UBS || (window.UBS = {});

// --- General ---
UBS.DEFAULT_BURNOUT_STATE_ID  = UBS.DEFAULT_BURNOUT_STATE_ID || 17;
UBS.NATURAL_TP_DECAY_PER_TURN = 1;
UBS.DEBUG = true;

// --- Burnout → EN (MP) scaling tiers (unchanged behavior) ---
UBS.MP_Tiers = [
  { rate: 0.20, mult: 1.0 },
  { rate: 0.40, mult: 1.25 },
  { rate: 0.60, mult: 1.5 },
  { rate: 0.85, mult: 2.0 }
];
UBS.MP_randomVarianceAbove75 = 0.0;

// --- Charge / cancel behavior ---
UBS.CANCEL_ON_BURNOUT = false; // keep false to avoid wholeActions crashes while rewiring

// --- Synthetic timing when no real ATB charge progress is available ---
UBS.SYNTH_FRAMES_MIN   = 45;   // ~0.75s @60fps
UBS.SYNTH_FRAMES_MAX   = 75;   // ~1.25s
UBS.SYNTH_PER_TICK_CAP = 10;   // TP/frame cap to keep smooth

// --- Actor/enemy scope for charge/tier states ---
UBS.APPLY_TO_ENEMIES          = false; // true = enemies also gain during charge + tier states
UBS.TIER_STATES_ACTOR_ONLY    = true;  // true = only actors get tier states (recommended)

// --- Burnout tier → auto states (set your DB state IDs here) ---
// The highest entry whose `rate` <= current burnout% is the active tier.
// Example (uncomment & replace IDs):
// UBS.BO_Tiers = [
//   { rate: 0.00, add: [] },        // baseline
//   { rate: 0.25, add: [41] },      // +10% AGI etc (put traits in state 41)
//   { rate: 0.50, add: [42] },      // mid tier
//   { rate: 0.75, add: [43] }       // high tier
// ];
UBS.BO_Tiers = UBS.BO_Tiers || [
  { rate: 0.00, add: [] },
  { rate: 0.33, add: [] },
  { rate: 0.66, add: [] }
];
// Extra states while actually in Burnout state (optional)
UBS.BO_BURNOUT_EXTRA_STATES = UBS.BO_BURNOUT_EXTRA_STATES || [];

/* =========================
   Helpers
   ========================= */
function tpLimit(b){ try{ return b.tpLimit ? Math.max(1, b.tpLimit()) : 100; }catch(e){ return 100; } }
function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function burnoutRateOf(b){ try{ var l=tpLimit(b); return Math.max(0,Math.min(1,(b.tp||0)/l)); }catch(e){return 0;} }
function isEnergySkill(skill){ var n=skill&&skill.note||""; return /<(Energy|Verse)>/i.test(n); }
function parseBurnChange(skill){
  if (!skill || !skill.note) return 0;
  var m = skill.note.match(/<\s*BurnChangeUser\s*:\s*([+-]?\d+)\s*>/i);
  return m ? Number(m[1]) : 0;
}
function log(){ if(UBS.DEBUG) console.log.apply(console,arguments); }

/* =========================
   Backfire + Burnout trigger (safe)
   ========================= */
function triggerBackfire(battler){
  try{
    if(!battler) return;
    var dmg = Math.floor(battler.mhp * 0.20);
    dmg = Math.min(dmg, Math.max(0, battler.hp - 1));
    if(dmg <= 0){ log("[UBS Backfire] Skipped (would kill)", battler.name()); return; }
    battler.startAnimation(123, false, 0);
    battler.gainHp(-dmg);
    battler.startDamagePopup();
    log("[UBS Backfire]", battler.name(), "took", dmg, "true dmg");
  }catch(e){ console.error("[UBS Backfire error]", e); }
}

function maybeTriggerBurnout(battler, src){
  try{
    if(!battler || !battler.addState) return;
    var lim=tpLimit(battler), tp=battler.tp||0;

    if(tp >= lim && !battler.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)){
      battler.addState(UBS.DEFAULT_BURNOUT_STATE_ID);
      battler.setTp(0);
      var turns=(battler._stateTurns&&battler._stateTurns[UBS.DEFAULT_BURNOUT_STATE_ID])||3;
      battler._ubc_burnoutDrainRate=Math.ceil(lim/Math.max(1,turns));
      log("[UBS Burnout]", battler.name(), "triggered @", tp + "/" + lim, "from", src);

      if (UBS.CANCEL_ON_BURNOUT){
        try{
          if (battler.currentAction){ var ca = battler.currentAction(); if (ca && ca.clear) ca.clear(); }
          if (battler.clearActions) battler.clearActions();
          if (battler.requestMotionRefresh) battler.requestMotionRefresh();
        }catch(e){}
        triggerBackfire(battler);

        battler._ubc_lockActive=false;
        battler._ubc_lockedSkillId=null;
        battler._ubc_lockedMpCost=null;
        battler._ubc_charge=null;
        battler._ubc_paidMpForLocked=false;
        battler._ubc_drainedMp=0;
      }
    }
  }catch(e){}
}

var _setTp=Game_Battler.prototype.setTp;
Game_Battler.prototype.setTp=function(v){ _setTp.call(this,v); maybeTriggerBurnout(this,"setTp"); };
var _gainTp=Game_Battler.prototype.gainTp;
Game_Battler.prototype.gainTp=function(v){ _gainTp.call(this,v); maybeTriggerBurnout(this,"gainTp"); };

/* =========================
   Natural decay + burnout-state drain
   ========================= */
var _onTurnEnd=Game_Battler.prototype.onTurnEnd;
Game_Battler.prototype.onTurnEnd=function(){
  _onTurnEnd.call(this);
  if(this.isActor && this.isActor() && !this.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)){
    this.setTp(Math.max(0,(this.tp||0)-UBS.NATURAL_TP_DECAY_PER_TURN));
  }
  if(this.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)){
    var d=this._ubc_burnoutDrainRate||0;
    if(d>0)this.setTp(Math.max(0,(this.tp||0)-d));
  }
};

var _rem=Game_Battler.prototype.removeState;
Game_Battler.prototype.removeState=function(id){
  _rem.call(this,id);
  if(id===UBS.DEFAULT_BURNOUT_STATE_ID)this._ubc_burnoutDrainRate=0;
};

/* =========================
   EN cost scaling tiers (unchanged)
   ========================= */
var _cost=Game_BattlerBase.prototype.skillMpCost;
Game_BattlerBase.prototype.skillMpCost=function(skill){
  if(this._ubc_lockActive && this._ubc_lockedSkillId===(skill&&skill.id) && this._ubc_lockedMpCost!=null)
    return this._ubc_lockedMpCost;

  var base=_cost.call(this,skill);
  if(!skill||!isEnergySkill(skill))return base;

  var br=burnoutRateOf(this);
  var mult=UBS.MP_Tiers[0].mult;
  for(var i=0;i<UBS.MP_Tiers.length;i++){
    if(br>=UBS.MP_Tiers[i].rate)mult=UBS.MP_Tiers[i].mult;
  }
  if(br>0.75&&UBS.MP_randomVarianceAbove75>0){
    var v=UBS.MP_randomVarianceAbove75;
    var r=1+(Math.random()*2-1)*v;
    r=Math.max(1-v,Math.min(1+v,r));
    mult*=r;
  }
  var final=Math.round(base*mult);
  log("[UBS MP Tier]",this.name(), (br*100).toFixed(1)+"%", "base:"+base+"->"+final);
  return final;
};

/* =========================
   Tier states (auto-apply on thresholds)
   ========================= */
function tierIndexForRate(r){
  var idx=0;
  for (var i=0;i<UBS.BO_Tiers.length;i++) if (r >= UBS.BO_Tiers[i].rate) idx=i;
  return idx;
}
function syncTierStates(b){
  if (UBS.TIER_STATES_ACTOR_ONLY && (!b.isActor || !b.isActor())) return;
  var rate = burnoutRateOf(b);
  var idx  = tierIndexForRate(rate);
  var inBo = b.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID);

  if (b._ubc_boTierIndex === idx && b._ubc_boWasBurnout === inBo) return;

  // remove all known tier states
  for (var t=0;t<UBS.BO_Tiers.length;t++){
    var arr = UBS.BO_Tiers[t].add||[];
    for (var k=0;k<arr.length;k++){ var sid=arr[k]|0; if (sid>0 && b.isStateAffected(sid)) b.removeState(sid); }
  }
  // add current tier states
  var addArr = UBS.BO_Tiers[idx].add||[];
  for (var m=0;m<addArr.length;m++){ var id=addArr[m]|0; if (id>0) b.addState(id); }

  // optional: extra states while burning out
  if (inBo){
    for (var n=0;n<UBS.BO_BURNOUT_EXTRA_STATES.length;n++){ var ex=UBS.BO_BURNOUT_EXTRA_STATES[n]|0; if (ex>0) b.addState(ex); }
  }

  b._ubc_boTierIndex = idx;
  b._ubc_boWasBurnout = inBo;
}

/* =========================
   Charge-phase TP gain + progressive MP drain (core)
   ========================= */
var _SB_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update.call(this);

  function targetConfirmed(act){
    if (!act || !act.item) return false;
    if (typeof act.needsSelection === 'function' && !act.needsSelection()) return true;
    if (typeof act.targetIndex === 'function'){
      var idx = act.targetIndex();
      return idx != null && idx >= 0;
    }
    return act._targetIndex != null && act._targetIndex >= 0;
  }

  try {
    var sideA = $gameParty.members();
    var sideB = $gameTroop.members();
    var battlers = UBS.APPLY_TO_ENEMIES ? sideA.concat(sideB) : sideA;

    var scn = SceneManager._scene;
    var targetUIOpen =
      scn &&
      ((scn._enemyWindow && scn._enemyWindow.active) ||
       (scn._actorWindow && scn._actorWindow.active));

    for (var i=0;i<battlers.length;i++){
      var b = battlers[i]; if (!b) continue;

      // keep tier states in sync always
      syncTierStates(b);

      // stop any charge while in Burnout
      if (b.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)){
        b._ubc_charge = null;
        b._ubc_latch  = b._ubc_latch || {done:true, act:null, skillId:null};
        b._ubc_latch.done = true;
        continue;
      }

      // if input/target UI active, don't charge; clear partial lock if backing out
      if (b.isInputting() || targetUIOpen){
        if (b._ubc_charge){
          b._ubc_charge = null;
          // no refund on cancel (intentional)
          b._ubc_lockActive=false; b._ubc_lockedSkillId=null; b._ubc_lockedMpCost=null; b._ubc_paidMpForLocked=false;
          // keep drained amount as-is to preserve anti-refund policy
        }
        continue;
      }

      var act = b._actions && b._actions[0];
      var skill = act && act.item && act.item();
      var burnTot = skill ? parseBurnChange(skill) : 0;
      var isVerse = !!(skill && burnTot !== 0 && isEnergySkill(skill));

      // track action changes so we don't double-run charge across reselects
      if (!b._ubc_latch) b._ubc_latch = {done:false, act:null, skillId:null};
      if (act !== b._ubc_latch.act || (skill && skill.id !== b._ubc_latch.skillId)){
        b._ubc_latch.done   = false;
        b._ubc_latch.act    = act;
        b._ubc_latch.skillId= skill ? skill.id : null;
        b._ubc_charge = null;
        // reset per-action MP meter
        b._ubc_drainedMp = 0;
      }

      // only start after target confirmed
      var ready = isVerse && !b._ubc_latch.done && targetConfirmed(act);
      if (!ready){
        if (!isVerse){
          b._ubc_charge = null;
          b._ubc_lockActive=false; b._ubc_lockedSkillId=null; b._ubc_lockedMpCost=null; b._ubc_paidMpForLocked=false;
        }
        continue;
      }

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
          total   : burnTot,        // total TP to grant during chant
          applied : 0,
          mode    : (hasCharging && hasCR) ? "atb" : "synthetic",
          prevCR  : (hasCharging && hasCR) ? crNow : null,
          // progressive MP drain tracking
          p       : 0,              // 0..1 progress
          drained : 0,              // MP drained so far for this action
          // synthetic timing
          synthT  : 0,
          synthDur: UBS.SYNTH_FRAMES_MIN + Math.floor(Math.random()*(UBS.SYNTH_FRAMES_MAX-UBS.SYNTH_FRAMES_MIN)),
          synthPer: 0
        };
        // per-action total drained mirror (survives when ch=null)
        b._ubc_drainedMp = 0;
        log("[UBS Charge Init]", b.name(), "skill", skill.name, "burnTot:", burnTot, "cost:", cost);
      }

      var ch = b._ubc_charge;
      if (!ch) continue;

      // --- ATB path ---
      if (ch.mode === "atb" && hasCharging && hasCR){
        var now = clamp(b.atbChargeRate()||0, 0, 1);
        if (ch.prevCR == null) ch.prevCR = now;
        var dProg = Math.max(0, now - ch.prevCR);
        ch.prevCR = now;
        if (dProg > 0){
          // TP
          var addTP = Math.min(ch.total - ch.applied, ch.total * dProg);
          if (addTP > 0){ b.gainTp(addTP); ch.applied += addTP; }
          // MP progressive drain
          ch.p = clamp(ch.p + dProg, 0, 1);
          var want = (b._ubc_lockedMpCost||0) * ch.p;
          var delta = Math.max(0, want - ch.drained);
          if (delta > 0){
            b.gainMp(-delta);
            ch.drained += delta;
            b._ubc_drainedMp = ch.drained;
          }
          log("[UBS Δ]", b.name(), "dProg:", dProg.toFixed(3), "TP+= ", addTP.toFixed(2),
              " | MPdrain:", delta.toFixed(2), "(", ch.drained.toFixed(2), "/", (b._ubc_lockedMpCost||0), ")");
        }
        if (now >= 1 || ch.applied >= ch.total - 0.0001){
          b._ubc_latch.done = true;
          b._ubc_charge = null;
          log("[UBS Charge Done]", b.name(), "finalized remainder:", (ch.total - ch.applied).toFixed(3));
        }
      }
      // --- Synthetic path ---
      else {
        if (ch.synthPer === 0) ch.synthPer = (ch.total>0) ? (ch.total / Math.max(1, ch.synthDur)) : 0;
        if (ch.synthT < ch.synthDur && ch.applied < ch.total){
          // TP
          var addS = Math.min(ch.synthPer, ch.total - ch.applied, UBS.SYNTH_PER_TICK_CAP);
          if (addS > 0){ b.gainTp(addS); ch.applied += addS; }
          // MP drain: progress fraction equals TP step / total
          var dProgS = (ch.total>0) ? (addS / ch.total) : 0;
          ch.p = clamp(ch.p + dProgS, 0, 1);
          var wantS = (b._ubc_lockedMpCost||0) * ch.p;
          var dS = Math.max(0, wantS - ch.drained);
          if (dS > 0){ b.gainMp(-dS); ch.drained += dS; b._ubc_drainedMp = ch.drained; }
          ch.synthT++;
          log("[UBS sim]", b.name(), "TP+= ", addS.toFixed(2), " | MPdrain:", dS.toFixed(2));
        }
        if (ch.synthT >= ch.synthDur || ch.applied >= ch.total){
          b._ubc_latch.done = true;
          b._ubc_charge = null;
          log("[UBS Charge Done]", b.name(), "finalized remainder:", (ch.total - ch.applied).toFixed(3));
        }
      }

      // safety
      if (b.isDead() || b.isStateAffected(UBS.DEFAULT_BURNOUT_STATE_ID)){
        b._ubc_charge = null;
        b._ubc_latch.done = true;
      }
    }
  } catch(e){
    console.error("[UBS.update]", e);
  }
};

/* =========================
   Pay/lock behavior (reconcile any remaining MP at cast time)
   ========================= */
var _can=Game_BattlerBase.prototype.canPaySkillCost;
Game_BattlerBase.prototype.canPaySkillCost=function(skill){
  if(this._ubc_lockActive&&this._ubc_lockedSkillId===(skill&&skill.id)){
    log("[UBS canPay] locked true for", skill.name);
    return true;
  }
  return _can.call(this,skill);
};

var _pay=Game_Battler.prototype.paySkillCost;
Game_Battler.prototype.paySkillCost=function(skill){
  if(this._ubc_lockActive&&this._ubc_lockedSkillId===(skill&&skill.id)){
    if(!this._ubc_paidMpForLocked){
      var cost=this._ubc_lockedMpCost||0;
      var already = this._ubc_drainedMp||0;
      var rem = Math.max(0, cost - already);
      if(rem>0) this.gainMp(-rem);
      this._ubc_paidMpForLocked=true;
      log("[UBS pay]",this.name(),"paid remainder",rem,"(drained:",already,"/ cost:",cost,") MP left:",this.mp);
    }
    return;
  }
  _pay.call(this,skill);
};

/* =========================
   Cleanup end of action/turn
   ========================= */
var _end=Game_Battler.prototype.onAllActionsEnd;
Game_Battler.prototype.onAllActionsEnd=function(){
  _end.call(this);
  this._ubc_lockActive=false;
  this._ubc_lockedSkillId=null;
  this._ubc_lockedMpCost=null;
  this._ubc_paidMpForLocked=false;
  this._ubc_charge=null;          // per-action tick data
  // keep _ubc_drainedMp only if you want post-cast inspection; otherwise clear:
  this._ubc_drainedMp=0;
};

/* =========================
   Safe burnoutRate helper
   ========================= */
if(!Game_BattlerBase.prototype.burnoutRate){
  Game_BattlerBase.prototype.burnoutRate=function(){
    var lim=tpLimit(this);
    if(lim<=0)return 0;
    return Math.max(0,Math.min(1,(this.tp||0)/lim));
  };
}

log("[UBS DEBUG] Charge-phase TP gain + progressive MP drain + tier states active.");
})();