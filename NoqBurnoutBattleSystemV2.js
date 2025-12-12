/*:
 * @plugindesc (MV, ES5) Unified Burnout System — final full build. Gradual charge burnout, per-turn decay, fractured drain sync, state-resist, enemy var fallback, no double-apply on charge skills, VerseTrigger (equip proc), Living Weapon hooks, MP-cost scaling by burnout, conditional stat/dmg mods, MP-drain HP backlash. Place below ATB/HUD-affecting plugins and TP-limit plugins.
 * @author Noq + Tyson
 *
 * @help
 * === Skill / Item Note Tags ===
 * <BurnChangeUser:X>      // +adds / -removes burnout (TP) to caster
 * <BurnChangeTarget:Y>    // +adds / -removes burnout (TP) to target
 * <BurnBonusTurns:Z>      // extra burnout-state turns when it triggers
 * <BurnoutState:ID>       // optional custom Burnout state id (default 17)
 * <Energy> or <Verse>     // marks skill eligible for MP cost scaling
 *
 * === Equip Note Tags (VerseTrigger) ===
 * <VerseTrigger: Skill Name, CHANCE>
 *   Example: <VerseTrigger: Spark, 8>
 *   Every N turns (see config) the equipped item may auto-cast the skill.
 *   Chance scales up with LUK, scales down with burnout% (thermometer).
 *
 * === States (AfterEval backlash) ===
 * <BurnoutAfterEval: MPDrain>  // user takes HP backlash on using MP skills
 *
 * === Behavior Summary ===
 * - Burnout is TP. Natural decay: -1 TP per turn if not in Burnout state.
 * - During ATB charging, skills with <BurnChangeUser:X> add burnout
 *   gradually, synced to live MP consumption; at action end the same
 *   tag will NOT re-apply (no double-apply).
 * - On hitting burnout limit: add Burnout state (respects state resist),
 *   TP resets to 0, and optional <BurnBonusTurns:Z> adds extra turns.
 * - While in Burnout state: fractured drain — TP drains evenly across the
 *   remaining burnout turns (simple per-turn TP drain rate).
 * - Enemies can use variable-based burnout fallback (var base + enemyId).
 * - Dynamic MP cost scaling: skills with <Energy>/<Verse> cost more MP
 *   at higher burnout (tiers configurable).
 * - Conditional stat/damage modifiers from Burnout (% thresholded).
 * - VerseTrigger: equip-based auto-casts every N turns (queue + safe).
 *
 * This plugin is fully ES5 (no const/let, no =>, no template strings).
 * It avoids redefining the same MV function multiple times.
 *
 * Place this BELOW: YEP_CoreEngine, YEP_BattleEngineCore, YEP_X_BattleSysATB,
 * TP-limit/regen mods, and ABOVE visual-only HUD plugins is fine.
 */

(function() {
  'use strict';

  // =========================================================================
  //  CONFIG
  // =========================================================================
  var UBS = window.UBS || (window.UBS = {});
  // Core IDs / defaults
  UBS.DEFAULT_BURNOUT_STATE_ID = 17;

  // Enemy variable fallback base index (real var is base + enemyId)
  UBS.ENEMY_BURN_VAR_BASE = 200;

  // Natural cool-down per turn (when not in burnout state)
  UBS.NATURAL_TP_DECAY_PER_TURN = 1;

  // VerseTrigger config
  UBS.VERSE_TRIGGER_INTERVAL_TURNS = 2; // check every N turns for equips
  // VerseTrigger chance blend: finalChance = base*BASE_SCALE + LUK*LUK_SCALE - burnoutPct*BURNOUT_PENALTY
  UBS.VT_BASE_SCALE = 0.0050;
  UBS.VT_LUK_SCALE = 0.0010;
  UBS.VT_BURNOUT_PENALTY = 0.03;

  // MP cost scaling tiers for <Energy>/<Verse> skills
  UBS.MP_Tiers = [
    { rate: 0.20, mult: 1.0 },
    { rate: 0.40, mult: 1.25 },
    { rate: 0.60, mult: 1.50 },
    { rate: 0.85, mult: 2.00 }
  ];
  UBS.MP_randomVarianceAbove75 = 0.00; // ±20% variance when burnout > 75%

  // AfterEval backlash (state: <BurnoutAfterEval: MPDrain>)
  UBS.HP_BACKLASH_RATE_MIN = 2.0;
  UBS.HP_BACKLASH_RATE_MAX = 3.0;

  // Debug toggle
  UBS.DEBUG = false;

  // =========================================================================
  //  HELPERS
  // =========================================================================
  function getBurnoutStateIdFromNote(note) {
    if (!note) return UBS.DEFAULT_BURNOUT_STATE_ID;
    var m = /<\s*BurnoutState\s*:\s*(\d+)\s*>/i.exec(note);
    return m ? Number(m[1]) : UBS.DEFAULT_BURNOUT_STATE_ID;
  }

  function parseBurnTags(item) {
    if (!item) return null;
    if (item._ubc_parsed) return item._ubc_parsed;
    var res = { userChange: 0, targetChange: 0, bonusTurns: 0 };
    var note = item.note || "";
    var lines = note.split(/[\r\n]+/);
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      var m;
      m = /<\s*BurnChangeUser\s*:\s*([+-]?\d+)\s*>/i.exec(s);
      if (m) res.userChange = Number(m[1]);
      m = /<\s*BurnChangeTarget\s*:\s*([+-]?\d+)\s*>/i.exec(s);
      if (m) res.targetChange = Number(m[1]);
      m = /<\s*BurnBonusTurns\s*:\s*([+-]?\d+)\s*>/i.exec(s);
      if (m) res.bonusTurns = Number(m[1]);
      m = /<\s*BurnChange\s*:\s*([+-]?\d+)\s*>/i.exec(s); // legacy single tag
      if (m && res.userChange === 0) res.userChange = Number(m[1]);
    }
    item._ubc_parsed = res;
    return res;
  }
  window.parseBurnTags = parseBurnTags; // expose for HUD/other modules if needed

  function battlerTpLimit(b) {
    try {
      if (b && typeof b.tpLimit === 'function') {
        var l = b.tpLimit();
        if (typeof l === 'number' && !isNaN(l)) return Math.max(1, l);
      }
    } catch (e) {}
    return 100;
  }

  function clampTpToLimit(b, newTp) {
    var lim = battlerTpLimit(b);
    var v = Math.max(0, Math.min(newTp, lim));
    if (typeof b.setTp === 'function') b.setTp(v);
    return { tp: v, limit: lim };
  }

  function battlerIsResist(b, stateId) {
    try {
      if (typeof b.isStateResist === 'function') return b.isStateResist(stateId);
    } catch (e) {}
    return false;
  }

  function enemyVarIndex(enemy) {
    return UBS.ENEMY_BURN_VAR_BASE + enemy.enemyId();
  }

  function ensureEnemyVarInit(enemy) {
    var idx = enemyVarIndex(enemy);
    if ($gameVariables.value(idx) === 0) {
      $gameVariables.setValue(idx, battlerTpLimit(enemy));
    }
  }

  function addConsole(msg) {
    if (UBS.DEBUG && window.console) console.log(msg);
  }

  function isEnergySkill(skill) {
    var n = (skill && skill.note) ? skill.note : "";
    return /<\s*Energy\s*>/i.test(n) || /<\s*Verse\s*>/i.test(n);
  }

  // =========================================================================
  //  CORE: APPLY BURNOUT CHANGES (actors + enemy fallback)
  // =========================================================================
  function applyBurnChangeToBattler(battler, change, bonusTurns, sourceName, burnoutStateId) {
    if (!battler) return;

    // actors or any battler with TP property
    if (typeof battler.setTp === 'function' && typeof battler.tp === 'number') {
      var out = clampTpToLimit(battler, (battler.tp || 0) + change);
      var newTP = out.tp;
      var limit = out.limit;
      if (change > 0 && newTP >= limit && !battlerIsResist(battler, burnoutStateId)) {
        battler.addState(burnoutStateId);
        battler.setTp(0);
        if (bonusTurns && bonusTurns !== 0) {
          battler._stateTurns[burnoutStateId] = (battler._stateTurns[burnoutStateId] || 0) + bonusTurns;
        }
        $gameMessage.add(battler.name() + " has hit burnout! \uD83D\uDD25");
        addConsole((sourceName ? sourceName + " -> " : "") + battler.name() + " burned out (tp).");
      } else {
        addConsole((sourceName ? sourceName + " -> " : "") + battler.name() + " burnout (TP) now: " + newTP + "/" + limit);
      }
      return;
    }

    // enemies fallback (variable)
    try {
      if (battler.isEnemy && battler.isEnemy()) {
        ensureEnemyVarInit(battler);
        var idx = enemyVarIndex(battler);
        var val = $gameVariables.value(idx) + change;
        val = Math.max(0, val);
        $gameVariables.setValue(idx, val);
        var lim = battlerTpLimit(battler);
        addConsole((sourceName ? sourceName + " -> " : "") + battler.name() + " burnout (var) now: " + val + "/" + lim);

        // Burnout trigger when gauge hits or exceeds full threshold (allow minor overfill)
var burnoutThreshold = Math.max(1, limit * 0.999);
if (change > 0 && newTP >= burnoutThreshold && !battlerIsResist(battler, burnoutStateId)) {
  battler.addState(burnoutStateId);
  battler.setTp(0);
  if (bonusTurns && bonusTurns !== 0) {
    battler._stateTurns[burnoutStateId] = (battler._stateTurns[burnoutStateId] || 0) + bonusTurns;
  }
  $gameMessage.add(battler.name() + " has hit burnout! 🔥");
  addConsole((sourceName ? sourceName + " -> " : "") + battler.name() + " burned out (tp).");
}

      }
    } catch (e) {}
  }

  // =========================================================================
  //  NATURAL DECAY + FRACTURED DRAIN (per turn)
  // =========================================================================
  var _UBS_onTurnEnd = Game_Battler.prototype.onTurnEnd;
  Game_Battler.prototype.onTurnEnd = function() {
    _UBS_onTurnEnd.call(this);

    var burnoutStateId = UBS.DEFAULT_BURNOUT_STATE_ID;

    // natural cool-down when NOT in burnout state (actors only)
    if (this.isActor && this.isActor() && !this.isStateAffected(burnoutStateId)) {
      var dec = UBS.NATURAL_TP_DECAY_PER_TURN;
      if (dec > 0) this.setTp(Math.max(0, (this.tp || 0) - dec));
    }

    // fractured drain while IN burnout state
    if (this.isStateAffected(burnoutStateId)) {
      var drain = this._ubc_burnoutDrainRate || 0;
      if (drain > 0) {
        this.setTp(Math.max(0, (this.tp || 0) - drain));
      }
    }

    // VerseTrigger counter (actors only)
    if (this.isActor && this.isActor()) {
      this._ubc_turnCounter = (this._ubc_turnCounter || 0) + 1;
      tryVerseTriggerIfDue(this);
    }
  };

  // =========================================================================
  //  PREVENT DOUBLE-APPLY ON CHARGE SKILLS (stypeId === 1)
  //  + BURNOUT DURING CHARGE (Scene_Battle.update hook; MP-synced)
  // =========================================================================
  // During charge we:
  //  - detect current action and skill
  //  - if skill has <BurnChangeUser:X>, and we see MP consumption progressing,
  //    we add burnout proportionally and set a "handled this action" flag.
  // At action apply, we skip adding <BurnChangeUser:X> again if flag is set.
  var _UBS_SceneBattle_update = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function() {
    _UBS_SceneBattle_update.call(this);
    try {
      var battlers = [].concat($gameParty.members(), $gameTroop.members());
      for (var i = 0; i < battlers.length; i++) {
        var b = battlers[i];
        if (!b) continue;

        // no active action
        if (!b._actions || !b._actions[0]) {
          b._ubc_charge = null;
          continue;
        }

        // current action + skill
        var action = b._actions[0];
        if (!action || !action.item) { b._ubc_charge = null; continue; }
        var skill = action.item();
        if (!skill) { b._ubc_charge = null; continue; }

        var parsed = parseBurnTags(skill);
        var totalBurnGain = (parsed && parsed.userChange) ? Number(parsed.userChange) : 0;
        if (!totalBurnGain) { b._ubc_charge = null; continue; }

        // require charging state if available (YEP ATB), else still allow MP-synced pathway
        var isCharging = (typeof b.isATBCharging === 'function') ? b.isATBCharging() : true;

        // Init tracking
        if (!b._ubc_charge) {
          var mpCost = 0;
          try {
            mpCost = Math.max(0, typeof b.skillMpCost === 'function' ? b.skillMpCost(skill) : (skill.mpCost || 0));
          } catch (e) { mpCost = (skill.mpCost || 0); }
          b._ubc_charge = {
            skillId: skill.id,
            mpStart: b.mp || 0,
            mpCost: Math.max(1, mpCost),
            applied: 0
          };
        }
		// 🔒 Lock MP cost snapshot to prevent YEP re-check cancel
		if (!b._ubc_lockedMpCost && skill && skill.mpCost > 0) {
			b._ubc_lockedMpCost = b.skillMpCost(skill);
			b._ubc_lockedSkillId = skill.id;
		if (UBS.DEBUG)
			console.log("[UBS] Locked MP cost for", skill.name, "→", b._ubc_lockedMpCost);
		}

        // action changed midstream → reset
        if (b._ubc_charge && b._ubc_charge.skillId !== skill.id) {
          b._ubc_charge = null;
          continue;
        }

        // If we have an ATB charging flag but it's false → stop tracking
        if (typeof b.isATBCharging === 'function' && !isCharging) {
          b._ubc_charge = null;
          continue;
        }

        // consume progress
        var consumed = Math.max(0, (b._ubc_charge.mpStart || 0) - (b.mp || 0));
        var targetBurn = totalBurnGain * Math.min(1, consumed / b._ubc_charge.mpCost);
        var delta = Math.max(0, targetBurn - (b._ubc_charge.applied || 0));
        if (delta > 0) {
          b.gainTp(delta);
          b._ubc_charge.applied += delta;
          b._ubc_burnHandledThisAction = true; // mark to skip end-of-action userChange
          if (UBS.DEBUG) addConsole("[UBS] " + b.name() + " +" + delta.toFixed(2) + " burnout during charge.");
        }

        // finish?
var finishedByMp = (consumed >= b._ubc_charge.mpCost - 0.001);
var chargingStopped = (typeof b.isATBCharging === 'function') ? !isCharging : false;
if (finishedByMp || chargingStopped) {
  // mark the action as fully drained so paySkillCost() won't refund
  b._ubc_burnHandledThisAction = true;
  // snapshot actual final MP (so we don't read stale pre-scaled values)
  b._ubc_finalMpCost = b._ubc_charge.mpCost;
  // clear charge tracker
  b._ubc_charge = null;
}
      }
    } catch(e) {
      addConsole("UBS Scene_Battle.update error: " + e);
    }
  };

  // clear handled flag at the very end of the battler’s action set
  var _UBS_onAllActionsEnd = Game_Battler.prototype.onAllActionsEnd;
  Game_Battler.prototype.onAllActionsEnd = function() {
    _UBS_onAllActionsEnd.call(this);
    this._ubc_burnHandledThisAction = false;
	this._ubc_lockedMpCost = null;
	this._ubc_lockedSkillId = null;
    // also clear any stale charge trackers
    this._ubc_charge = null;
  };

  // =========================================================================
  //  ACTION APPLY: burnout tags, fractured drain rate sync, double-apply guard
  // =========================================================================
  var _UBS_GameAction_apply = Game_Action.prototype.apply;
  Game_Action.prototype.apply = function(target) {
    _UBS_GameAction_apply.call(this, target);
    try {
      if (!this.item) return;
      var item = this.item();
      var parsed = parseBurnTags(item);
      var burnoutStateId = getBurnoutStateIdFromNote(item.note || "");

      // If we already applied <BurnChangeUser:X> during charge, suppress it here for stype 1 skills
      var subj = this.subject();
      var suppressUser = false;
      if (subj && item && item.stypeId === 1 && subj._ubc_burnHandledThisAction) {
        suppressUser = true;
        if (UBS.DEBUG) addConsole("[UBS] Suppressed end-of-action burnout for " + item.name + " (already applied during charge).");
      }

      // Apply to target
      if (parsed && parsed.targetChange && parsed.targetChange !== 0) {
        applyBurnChangeToBattler(target, parsed.targetChange, parsed.bonusTurns, subj ? subj.name() : "", burnoutStateId);
      }

      // Apply to user (unless suppressed)
      if (parsed && parsed.userChange && parsed.userChange !== 0 && subj && !suppressUser) {
        applyBurnChangeToBattler(subj, parsed.userChange, parsed.bonusTurns, subj.name(), burnoutStateId);
      }

      // Fractured drain rate: if the target is in burnout state after this action,
      // compute a per-turn drain so the fractured gauge drains across remaining turns.
      if (target && target.isStateAffected && target.isStateAffected(burnoutStateId)) {
        var turns = (target._stateTurns && target._stateTurns[burnoutStateId]) || 3;
        var limit = battlerTpLimit(target);
        target._ubc_burnoutDrainRate = Math.ceil(limit / Math.max(1, turns));
      }
    } catch(e) {
      addConsole("UBS apply error: " + e);
    }
  };

  // clear drain tracker when burnout state ends
  var _UBS_removeState = Game_Battler.prototype.removeState;
  Game_Battler.prototype.removeState = function(stateId) {
    _UBS_removeState.call(this, stateId);
    if (stateId === UBS.DEFAULT_BURNOUT_STATE_ID) {
      this._ubc_burnoutDrainRate = 0;
    }
  };

  // =========================================================================
//  FIXED: Dynamic MP-cost scaling for <Energy>/<Verse> skills
// =========================================================================
var _UBS_skillMpCost = Game_BattlerBase.prototype.skillMpCost;
Game_BattlerBase.prototype.skillMpCost = function(skill){
  // Use locked cost if in mid-cast
  if (this._ubc_lockedSkillId === (skill && skill.id) && this._ubc_lockedMpCost) {
    return this._ubc_lockedMpCost;
  }
  var base = _UBS_skillMpCost.call(this, skill);
  if (!skill || !skill.note) return base;
  if (!/<\s*(Energy|Verse)\s*>/i.test(skill.note)) return base;

  // in UBS: Game_BattlerBase.prototype.skillMpCost = function(skill) { ... }
var burnout =
  (this._burnoutCache && this._burnoutCache.frozen && typeof this._burnoutCache.burnoutRate === 'number')
    ? this._burnoutCache.burnoutRate
    : (typeof this.burnoutRate === 'function') ? this.burnoutRate()
      : (typeof this.tpRate === 'function') ? this.tpRate() : 0;

  // --- inclusive upper-tier match ---
  var mult = UBS.MP_Tiers[0].mult;
  for (var i = 0; i < UBS.MP_Tiers.length; i++) {
    var tier = UBS.MP_Tiers[i];
    if (burnout >= tier.rate) mult = tier.mult;
  }

  // --- mild clamped variance above 75% ---
  if (burnout > 0.75 && UBS.MP_randomVarianceAbove75 > 0) {
    var v = UBS.MP_randomVarianceAbove75;
    var rand = 1 + (Math.random() * 2 - 1) * v;
    rand = Math.max(1 - v, Math.min(1 + v, rand));
    mult *= rand;
  }

  var finalCost = Math.round(base * mult);
    if (UBS.DEBUG) console.log(
    "[UBS MP Tier]",
    "Burnout:", (burnout * 100).toFixed(1) + "%",
    "Tier Mult:", mult,
    "Base:", base,
    "Final:", finalCost
  );

  
  if (UBS.DEBUG)
    console.log("[UBS MP Scaling]", this.name ? this.name() : "Battler",
      "burnout:", (burnout*100).toFixed(1)+"%", "base:", base, "→", finalCost);	  
	// Remember this for cost reconciliation
		this._ubc_scaledMpCost = finalCost;
  return finalCost;
};

  // =========================================================================
  //  CONDITIONAL STAT / DAMAGE MODIFIERS FROM BURNOUT
  // =========================================================================
  function parseBurnoutBonus(note) {
    // <BurnoutBonus: TYPE, VALUE, Above|Below, THRESH>
    var re = /<\s*BurnoutBonus\s*:\s*(\w+)\s*,\s*([+\-]?\d*\.?\d+)\s*,\s*(Above|Below)\s*,\s*(0?\.\d+|1(?:\.0+)?)\s*>/gi;
    var results = [];
    var m;
    while ((m = re.exec(note)) !== null) {
      results.push({
        type: String(m[1] || "").toUpperCase(),
        value: Number(m[2]),
        mode: String(m[3] || "").toLowerCase(),
        threshold: parseFloat(m[4])
      });
    }
    return results;
  }

  Game_BattlerBase.prototype.ubc_burnoutBonusData = function() {
    var arr = [];
    var equips = this.isActor && this.isActor() ? (this.equips() || []) : [];
    var obj0 = this.actor ? this.actor() : (this.enemy ? this.enemy() : null);
    var list = [].concat([obj0], this.states(), equips);
    for (var i = 0; i < list.length; i++) {
      var obj = list[i];
      if (!obj || !obj.note) continue;
      var sub = parseBurnoutBonus(obj.note);
      if (sub.length) arr = arr.concat(sub);
    }
    return arr;
  };

  var _UBS_paramRate = Game_BattlerBase.prototype.paramRate;
  Game_BattlerBase.prototype.paramRate = function(paramId) {
    var rate = _UBS_paramRate.call(this, paramId);
    var names = ["MHP","MMP","ATK","DEF","MAT","MDF","AGI","LUK"];
    var pname = names[paramId] || "";
    var burnout = (typeof this.burnoutRate === 'function') ? this.burnoutRate() :
                  (typeof this.tpRate === 'function') ? this.tpRate() : 0;
    var bonuses = this.ubc_burnoutBonusData();
    for (var i = 0; i < bonuses.length; i++) {
      var b = bonuses[i];
      if (b.type !== pname) continue;
      var ok = (b.mode === "above") ? (burnout >= b.threshold) : (burnout <= b.threshold);
      if (ok) rate *= (1 + b.value);
    }
    return rate;
  };

  var _UBS_makeDmg = Game_Action.prototype.makeDamageValue;
  Game_Action.prototype.makeDamageValue = function(target, critical) {
    var value = _UBS_makeDmg.call(this, target, critical);
    var subject = this.subject();
    if (!subject) return value;

    var burnout = (typeof subject.burnoutRate === 'function') ? subject.burnoutRate() :
                  (typeof subject.tpRate === 'function') ? subject.tpRate() : 0;
    var bonuses = subject.ubc_burnoutBonusData();
    for (var i = 0; i < bonuses.length; i++) {
      var b = bonuses[i];
      if (b.type !== "DMG") continue;
      var ok = (b.mode === "above") ? (burnout >= b.threshold) : (burnout <= b.threshold);
      if (ok) value *= (1 + b.value);
    }
    if (UBS.DEBUG) addConsole("[UBS Bonus DMG] burnout=" + (burnout*100).toFixed(1) + "% -> " + Math.round(value));
    return value;
  };

  // =========================================================================
  //  AFTEREVAL HP BACKLASH (for states with <BurnoutAfterEval: MPDrain>)
  // =========================================================================
  var _UBS_useItem = Game_BattlerBase.prototype.useItem;
  Game_BattlerBase.prototype.useItem = function(item) {
    _UBS_useItem.call(this, item);
	
	// --- Reconcile scaled MP to prevent refund/cancel inconsistencies ---
  if (this._ubc_scaledMpCost && item && item.stypeId === 1) {
    var diff = (item.mpCost || 0) - this._ubc_scaledMpCost;
    if (diff !== 0) {
      // If scaled cost was higher, ensure no refund is added
      if (diff < 0) this.gainMp(diff); // negative = remove extra refund
      if (UBS.DEBUG) console.log("[UBS] Adjusted MP reconciliation:", diff);
    }
    this._ubc_scaledMpCost = null;
  }
	
    // only skills with MP cost
    if (!item || (item.mpCost || 0) <= 0) return;
	
	 // Prevent MP refund/double-apply for Verse skills handled during charge
  if (this._ubc_burnHandledThisAction && item && item.stypeId === 1) {
    if (UBS.DEBUG) console.log("[UBS] Skipping post-cast MP reconciliation for", item.name);
    return;
  }

    var states = this.states ? this.states() : [];
    for (var i = 0; i < states.length; i++) {
      var st = states[i];
      if (!st || !st.note) continue;
      if (/<\s*BurnoutAfterEval\s*:\s*MPDrain\s*>/i.test(st.note)) {
        var rmin = UBS.HP_BACKLASH_RATE_MIN;
        var rmax = UBS.HP_BACKLASH_RATE_MAX;
        var rate = rmin + Math.random() * (rmax - rmin);
        var dmg = Math.floor((item.mpCost || 0) * rate);
        this.gainHp(-dmg);
        this.startDamagePopup();
        if (this.isActor && this.isActor()) SoundManager.playActorDamage();
        else SoundManager.playEnemyDamage();
        if (UBS.DEBUG) addConsole("[UBS AfterEval] " + this.name() + " lost " + dmg + " HP (MPDrain backlash) using " + item.name);
      }
    }
  };

  // =========================================================================
  //  VERSETRIGGER (Equip-based procs every N turns)
  // =========================================================================
  BattleManager._ubc_vtQueue = [];

  BattleManager.ubc_queueAction = function(action, targets) {
    // safe filter
    var safeTargets = [];
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      if (t && typeof t.isDead === 'function' && !t.isDead()) safeTargets.push(t);
    }
    if (!action || safeTargets.length === 0) return;
    BattleManager._ubc_vtQueue.push({ action: action, targets: safeTargets });
  };

  var _UBS_BM_update = BattleManager.update;
  BattleManager.update = function() {
    _UBS_BM_update.call(this);
    // drain the queue safely
    while (BattleManager._ubc_vtQueue.length > 0) {
      var q = BattleManager._ubc_vtQueue.shift();
      if (!q || !q.action || !q.targets || !q.targets.length) continue;
      for (var i = 0; i < q.targets.length; i++) {
        var t = q.targets[i];
        try {
          q.action.apply(t);
          t._result.success = true;
          var sk = q.action.item();
          if (sk && sk.animationId && sk.animationId > 0) t.startAnimation(sk.animationId, false, 0);
          $gameMessage.add(q.action.subject().name() + "'s " + (sk ? sk.name : "skill") + " triggers!");
          if (t.isDead && t.isDead()) {
            if (!t._noCollapse && t.performCollapse) t.performCollapse();
            if (typeof t.onDeath === 'function') t.onDeath();
          }
        } catch(e) {
          addConsole("[VerseTrigger] error applying queued action: " + e);
        }
      }
    }
  };

  function vt_targetsForScope(actor, skill) {
    var scope = skill ? skill.scope : 7; // default self
    if (scope === 1) return $gameTroop.aliveMembers().slice(0,1);
    if (scope === 2) return $gameTroop.aliveMembers();
    if (scope === 3) return $gameParty.aliveMembers().slice(0,1);
    if (scope === 4) return $gameParty.aliveMembers();
    if (scope === 7) return [actor];
    return [actor];
  }

  function tryVerseTriggerIfDue(actor) {
    if (!actor || !actor.isActor || !actor.isActor()) return;
    var c = actor._ubc_turnCounter || 0;
    if (c % UBS.VERSE_TRIGGER_INTERVAL_TURNS !== 0) return;

    var eqs = actor.equips ? actor.equips() : [];
    for (var i = 0; i < eqs.length; i++) {
      var eq = eqs[i];
      if (!eq || !eq.note) continue;

      // parse all triggers on this equip
      var note = eq.note.replace(/\r?\n/g, ' ');
      var re = /<\s*VerseTrigger\s*:\s*([^,>]+)\s*,\s*([\d.]+)\s*>/gi;
      var m;
      while ((m = re.exec(note)) !== null) {
        var skillName = String(m[1] || "").trim();
        var baseChance = parseFloat(m[2] || "0") || 0;

        var skill = null;
        for (var s = 1; s < $dataSkills.length; s++) {
          var ds = $dataSkills[s];
          if (ds && ds.name === skillName) { skill = ds; break; }
        }
        if (!skill) continue;

        // chance blend
        var luck = actor.luk || 0;
        var br = (actor.tp || 0) / battlerTpLimit(actor);
        var finalChance = (baseChance * UBS.VT_BASE_SCALE) + (luck * UBS.VT_LUK_SCALE) - (br * UBS.VT_BURNOUT_PENALTY);
        finalChance = Math.max(0, Math.min(1, finalChance));

        if (Math.random() < finalChance) {
          var targets = vt_targetsForScope(actor, skill);
          if (!targets || !targets.length) continue;
          var act = new Game_Action(actor);
          act.setSkill(skill.id);
          BattleManager.ubc_queueAction(act, targets);
          addConsole("[VerseTrigger] Queued " + skill.name + " at " + Math.round(finalChance*100) + "%");
        }
      }
    }
  }

  // =========================================================================
  //  API: enemy var helpers (debug/inspect)
  // =========================================================================
  window.UnifiedBurnoutSystem = window.UnifiedBurnoutSystem || {};
  window.UnifiedBurnoutSystem.getEnemyBurnVarIndex = function(enemyId) {
    return UBS.ENEMY_BURN_VAR_BASE + enemyId;
  };
  window.UnifiedBurnoutSystem.getEnemyBurnValue = function(enemyId) {
    return $gameVariables.value(UBS.ENEMY_BURN_VAR_BASE + enemyId);
  };

  addConsole("Unified Burnout System (Full) loaded.");
})();

/*:
 * @plugindesc (MV, ES5) Burnout Rate Binding Fix — ensures all battlers have a proper burnoutRate() for MP scaling
 * @author Noq
 */
(function(){
'use strict';

// If UBS defines a custom tpLimit(), use it; else fall back to 100
function getTpLimit(battler){
  try{
    if (typeof battler.tpLimit === "function") return battler.tpLimit();
    if (window.UBS && typeof window.UBS.tpLimit === "function") return window.UBS.tpLimit.call(battler);
  }catch(e){}
  return 100;
}

// Inject burnoutRate into Game_BattlerBase so all derived classes inherit it (safe + clamped)
Game_BattlerBase.prototype.burnoutRate = function(){
  try {
    var limit = getTpLimit(this);
    if (limit <= 0) return 0;
    var tp = Math.max(0, this.tp || 0);
    var r = tp / limit;
    if (isNaN(r)) r = 0;
    return Math.max(0, Math.min(1, r));
  } catch(e) { return 0; }
};

// Optional: helper alias (in case your UBS references this globally)
if (!window.UBS) window.UBS = {};
window.UBS.burnoutRate = function(){ return this.burnoutRate(); };

Game_BattlerBase.prototype.burnoutRate = function(){
  try {
    var limit = getTpLimit(this);
    if (limit <= 0) return 0;
    var tp = Math.max(0, this.tp || 0);
    var r = tp / limit;
    if (isNaN(r)) r = 0;
    return Math.max(0, Math.min(1, r));
  } catch(e) {
    console.warn("[UBS] burnoutRate() failed:", e);
    return 0;
  }
};
})();