/*:
 * @plugindesc Noq UBS Charging Gate — start burnout gain only after real ATB charging begins (blocks early start in Verse menu).
 * @author Noq
 * @help Load this BELOW your Unified Burnout System plugin.
 */
(function(){
'use strict';

// Helper: detect if any selection UI is still up (radial, mini list, skill window, item window)
function uiSelecting(){
  var sc = SceneManager._scene;
  if (!sc) return false;
  // your custom windows
  if (sc._noqCircularCmd && sc._noqCircularCmd.visible) return true;
  if (sc._noqMiniList     && sc._noqMiniList.visible)   return true;
  // vanilla/YEP windows
  if (sc._skillWindow && sc._skillWindow.active) return true;
  if (sc._itemWindow  && sc._itemWindow.active)  return true;
  if (sc._actorCommandWindow && sc._actorCommandWindow.active) return true;
  if (sc._partyCommandWindow && sc._partyCommandWindow.active) return true;
  return false;
}

// Wrap the UBS per-frame loop and delay _ubc_charge init
var _SB_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update.call(this);

  try {
    var list = [].concat($gameParty.members(), $gameTroop.members());
    for (var i=0; i<list.length; i++){
      var b = list[i]; if (!b) continue;

      var act   = b._actions && b._actions[0];
      var skill = act && act.item && act.item();
      var verse = !!(skill && /<(Energy|Verse)>/i.test(skill.note||""));

      // If we’re still in selection UI, do NOT create a charge context yet.
      if (uiSelecting()){
        // allow an already-running charge to continue; just block creation
        if (verse && b._ubc_charge && b._ubc_charge.skillId !== skill.id) {
          b._ubc_charge = null; // stale preview
        }
        continue;
      }

      if (!verse){
        // no verse action queued; clear preview-only contexts
        if (b._ubc_charge && b._ubc_charge.mode !== "synthetic") b._ubc_charge = null;
        continue;
      }

      // Require actual ATB charging to begin before initializing charging context.
      var hasATB = (typeof b.isATBCharging === 'function');
      var isChargingNow = hasATB ? !!b.isATBCharging() : false;

      // If YEP ATB exists: only init when charging has started.
      // If no ATB system at all: allow synthetic fallback (init when needed).
      var mayInit = hasATB ? isChargingNow : true;

      if (mayInit){
        // If UBS already created a context, let it run; otherwise initialize once.
        if (!b._ubc_charge || b._ubc_charge.skillId !== skill.id){
          // Defer to UBS’s own initializer by poking a soft flag it expects.
          // We don’t recreate UBS logic here; we simply clear to let UBS re-init this frame.
          b._ubc_charge = null;
          // Also ensure we only lock cost once charge actually starts:
          b._ubc_lockActive      = false;
          b._ubc_lockedSkillId   = null;
          b._ubc_lockedMpCost    = null;
          b._ubc_paidMpForLocked = false;
        }
      } else {
        // Not charging yet (e.g., just left menu but ATB hasn’t flipped): keep clean state.
        if (b._ubc_charge && b._ubc_charge.skillId !== skill.id) b._ubc_charge = null;
      }
    }
  } catch(e) {
    console.error("[UBS Gate] ", e);
  }
};

})();