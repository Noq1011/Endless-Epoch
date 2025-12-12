/*:
 * @plugindesc (MV, ES5, DEBUG) VerseTrigger Add-On v3 — UBS-compatible auto-casts w/ burnout risk scaling, stat synergy, and log hook.
 * @author Noq + Tyson
 * @help
 * 
 * === Equip Note Tag ===
 * <VerseTrigger: Skill Name, CHANCE>
 * Example: <VerseTrigger: Spark, 8>
 * → Every N turns, the equipped item has a small chance to auto-cast the skill.
 *
 * === Behavior ===
 *  • Damage = 45–60% + (LUK / 300) variance
 *  • Adds HALF of skill's <BurnChangeUser:X> burnout gain
 *  • Never exceeds 99% burnout
 *  • Burnout ≥ 80% adds up to +5% trigger chance
 *  • Luck bonuses from burnout stat modifiers (like +15% LUK) are additive to trigger odds
 *  • Fully compatible with UBS + YEP ATB
 *  • Provides a global hook for battle logs: VerseTriggerLog(actor, skill, chance)
 *
 * === Load Order ===
 * Place BELOW: Unified Burnout System (your stable build)
 */

(function(){
'use strict';

if (!window.UBS) window.UBS = {};

UBS.VERSE_TRIGGER_INTERVAL_TURNS = UBS.VERSE_TRIGGER_INTERVAL_TURNS || 2;
UBS.VT_BASE_SCALE = UBS.VT_BASE_SCALE || 0.005;
UBS.VT_LUK_SCALE = UBS.VT_LUK_SCALE || 0.001;
UBS.VT_BURNOUT_PENALTY = UBS.VT_BURNOUT_PENALTY || 0.03;
UBS.VT_BURNOUT_RISK_BONUS = UBS.VT_BURNOUT_RISK_BONUS || 0.05; // +5% chance bonus near burnout
UBS.DEBUG = UBS.DEBUG !== false;

function tpLimit(b){ try{ return b.tpLimit ? Math.max(1,b.tpLimit()) : 100; }catch(e){ return 100; } }
function burnoutRateOf(b){ try{ var l=tpLimit(b); return Math.max(0,Math.min(1,(b.tp||0)/l)); }catch(e){return 0;} }
function log(){ if(UBS.DEBUG && window.console) console.log.apply(console,arguments); }

// Battle log hook (for later custom UI integration)
if (!window.VerseTriggerLog) {
  window.VerseTriggerLog = function(actor, skill, chance){
    if (UBS.DEBUG) console.log(`[VerseTriggerLog] ${actor.name()} → ${skill.name} (${Math.round(chance*100)}%)`);
  };
}

// ---------------------------------------------------------------------
// VerseTrigger Queue + BattleManager loop
// ---------------------------------------------------------------------
BattleManager._ubc_vtQueue = [];

BattleManager.ubc_queueAction = function(action, targets){
  var safe = [];
  for (var i = 0; i < targets.length; i++){
    var t = targets[i];
    if (t && typeof t.isDead === "function" && !t.isDead()) safe.push(t);
  }
  if (!action || !safe.length) return;
  BattleManager._ubc_vtQueue.push({action: action, targets: safe});
};

var _BM_update = BattleManager.update;
BattleManager.update = function(){
  _BM_update.call(this);
  while (BattleManager._ubc_vtQueue.length > 0){
    var q = BattleManager._ubc_vtQueue.shift();
    if (!q || !q.action || !q.targets.length) continue;
    for (var i = 0; i < q.targets.length; i++){
      var t = q.targets[i];
      try {
        var subj = q.action.subject();
        var skill = q.action.item();

        if (skill && subj){
          // ⚖️ tone down damage and add luck variance
          var luckFactor = 1 + (Math.random() * (subj.luk || 0) / 300);
          var dmgFactor = 0.45 + Math.random() * 0.15;
          q.action._ubc_dmgScale = dmgFactor * luckFactor;
          if (UBS.DEBUG) log("[VerseTrigger] Damage scaled x", (q.action._ubc_dmgScale).toFixed(2));
        }

        q.action.apply(t);
        t._result.success = true;
        if (skill && skill.animationId > 0) t.startAnimation(skill.animationId, false, 0);

        VerseTriggerLog(subj, skill, q.action._ubc_lastChance || 0);
        
        // 🔥 add partial burnout gain
        if (subj && skill && skill.note){
          var match = skill.note.match(/<\s*BurnChangeUser\s*:\s*([+-]?\d+)\s*>/i);
          if (match){
            var gain = Number(match[1]) / 2; // half of original
            var limit = tpLimit(subj);
            var newTp = Math.min(limit * 0.99, subj.tp + gain);
            subj.setTp(newTp);
            log("[VerseTrigger Burnout]", subj.name(), "+", gain, "TP →", Math.round(subj.tp), "/", limit);
          }
        }
      } catch(e){ console.error("[VerseTrigger Error]", e); }
    }
  }
};

// ---------------------------------------------------------------------
// Target scope helper
// ---------------------------------------------------------------------
function vt_targetsForScope(actor, skill){
  var scope = skill ? skill.scope : 7;
  if (scope === 1) return $gameTroop.aliveMembers().slice(0,1);
  if (scope === 2) return $gameTroop.aliveMembers();
  if (scope === 3) return $gameParty.aliveMembers().slice(0,1);
  if (scope === 4) return $gameParty.aliveMembers();
  if (scope === 7) return [actor];
  return [actor];
}

// ---------------------------------------------------------------------
// Core trigger logic w/ burnout risk scaling
// ---------------------------------------------------------------------
function tryVerseTriggerIfDue(actor){
  if (!actor || !actor.isActor || !actor.isActor()) return;
  var c = actor._ubc_turnCounter || 0;
  if (c % UBS.VERSE_TRIGGER_INTERVAL_TURNS !== 0) return;

  var br = burnoutRateOf(actor);
  var eqs = actor.equips ? actor.equips() : [];

  for (var i = 0; i < eqs.length; i++){
    var eq = eqs[i];
    if (!eq || !eq.note) continue;

    var re = /<\s*VerseTrigger\s*:\s*([^,>]+)\s*,\s*([\d.]+)\s*>/gi, m;
    while ((m = re.exec(eq.note.replace(/\r?\n/g, " "))) !== null){
      var skillName = m[1].trim();
      var baseChance = parseFloat(m[2] || "0") || 0;
      var skill = null;
      for (var s = 1; s < $dataSkills.length; s++){
        var ds = $dataSkills[s];
        if (ds && ds.name === skillName){ skill = ds; break; }
      }
      if (!skill) continue;

      var luck = actor.luk || 0;

      // 🔢 additive luck bonus from burnout stat scaling
      var statLuckBonus = 0;
      if (actor.ubc_burnoutBonusData){
        var data = actor.ubc_burnoutBonusData();
        for (var j = 0; j < data.length; j++){
          var b = data[j];
          if (b.type === "LUK"){
            var ok = (b.mode === "above") ? (br >= b.threshold) : (br <= b.threshold);
            if (ok) statLuckBonus += (b.value || 0) * 100; // translate to %
          }
        }
      }

      // 🧠 dynamic burnout risk scaling (e.g., 80–99%)
      var riskBonus = 0;
      if (br >= 0.8){
        var pct = (br - 0.8) / 0.2; // scale 0–1 from 80–100%
        riskBonus = pct * (UBS.VT_BURNOUT_RISK_BONUS * 100); // up to +5%
      }

      // 🎯 compute final chance
      var finalChance = (baseChance * UBS.VT_BASE_SCALE) + 
                        (luck * UBS.VT_LUK_SCALE) -
                        (br * UBS.VT_BURNOUT_PENALTY) +
                        ((statLuckBonus + riskBonus) / 100);
      finalChance = Math.max(0, Math.min(0.99, finalChance)); // never 100%
      if (Math.random() < finalChance){
        var targets = vt_targetsForScope(actor, skill);
        if (!targets.length) continue;

        var act = new Game_Action(actor);
        act.setSkill(skill.id);
        act._ubc_lastChance = finalChance;
        BattleManager.ubc_queueAction(act, targets);

        log("[VerseTrigger]", actor.name(), "→", skill.name, Math.round(finalChance * 100) + "% (burnout:", Math.round(br*100)+"%)");
      }
    }
  }
}

// ---------------------------------------------------------------------
// Hook into onTurnEnd for trigger intervals
// ---------------------------------------------------------------------
var _onTurnEnd = Game_Battler.prototype.onTurnEnd;
Game_Battler.prototype.onTurnEnd = function(){
  _onTurnEnd.call(this);
  if (this.isActor && this.isActor()){
    this._ubc_turnCounter = (this._ubc_turnCounter || 0) + 1;
    tryVerseTriggerIfDue(this);
  }
};

// ---------------------------------------------------------------------
// Damage scaling injection
// ---------------------------------------------------------------------
var _makeDmg = Game_Action.prototype.makeDamageValue;
Game_Action.prototype.makeDamageValue = function(target, critical){
  var value = _makeDmg.call(this, target, critical);
  if (this._ubc_dmgScale){
    value = Math.round(value * this._ubc_dmgScale);
    this._ubc_dmgScale = null;
  }
  return value;
};

// ---------------------------------------------------------------------
// Debug helpers
// ---------------------------------------------------------------------
if (UBS.DEBUG){
  window.tryVerseTriggerIfDue = tryVerseTriggerIfDue;
  window.vt_force = function(actorId){
    var a = $gameActors.actor(actorId);
    if (!a) return console.warn("No actor for ID", actorId);
    console.log("[VerseTrigger Debug] Forcing roll on", a.name());
    tryVerseTriggerIfDue(a);
    console.log("Queue after roll:", BattleManager._ubc_vtQueue);
  };
  console.log("%c[VerseTrigger v3 DEBUG] Risk-based trigger system active.","color:orange");
}
})();