/*:
 * @target MV
 * @plugindesc (MV, ES5) UBS ↔ YEP ATB Live Sync (Post-ATB Timing)
 * @author Noq
 * @help
 * Re-synchronizes UBS burnout & MP drain AFTER YEP's internal ATB tick.
 * Fixes HUD desync where burnout advanced ahead of official TP gauge.
 */

(function(){
'use strict';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

/* ----------------------------------------------------------------------
 *  Hook BattleManager.updateATB (runs AFTER YEP's per-frame resource tick)
 * ---------------------------------------------------------------------- */
if (BattleManager.updateATB){
  var _YEP_updateATB = BattleManager.updateATB;
  BattleManager.updateATB = function(){
    _YEP_updateATB.apply(this, arguments);

    try{
      var battlers = $gameParty.members();
      for (var i=0;i<battlers.length;i++){
        var b = battlers[i];
        if (!b || !b._actions || !b._actions[0]) continue;

        var a = b._actions[0];
        var skill = a.item ? a.item() : null;
        if (!skill) continue;

        // only skills that have burnout effect and Verse/stype 1
        if (skill.stypeId !== 1) continue;
        var m = /<\s*BurnChangeUser\s*:\s*([+-]?\d+)/i.exec(skill.note||"");
        if (!m) continue;
        var totalGain = Number(m[1]||0);

        // if we're not charging or no mp cost, skip
        var isCharging = (typeof b.isATBCharging === "function") ? b.isATBCharging() : false;
        if (!isCharging) continue;

        // record MP start once
        if (b._ubc_mpStart == null) b._ubc_mpStart = b.mp;
        var cost = Math.max(1, b.skillMpCost ? b.skillMpCost(skill) : skill.mpCost||0);
        var mpUsed = Math.max(0, b._ubc_mpStart - b.mp);
        var ratio  = clamp(mpUsed / cost, 0, 1);

        // target TP delta
        var prevApplied = b._ubc_liveApplied||0;
        var target = totalGain * ratio;
        var delta = target - prevApplied;
        if (delta > 0.0001){
          b.gainTp(delta);
          b._ubc_liveApplied = target;
        }

        // expose live values for HUD
        if (typeof b._syncUBSState === "function") b._syncUBSState();

        // cleanup when finished
        if (ratio >= 1.0){
          delete b._ubc_mpStart;
          delete b._ubc_liveApplied;
        }
      }
    }catch(e){ if(window.console) console.log("UBS LiveSync Error:",e); }
  };
}
})();