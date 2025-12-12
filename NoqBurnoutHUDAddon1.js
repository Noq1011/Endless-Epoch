



/*:
 * @plugindesc (MV, ES5) Noq Burnout HUD v2 EN Popup Bridge — use live burnout-scaled MP cost
 * @author Noq
 */
(function(){
'use strict';

// replace only the cost computation inside the HUD’s own updater
if (typeof Sprite_EnPopup !== 'undefined') {
  const _updateForSkillWindow = Sprite_EnPopup.prototype.updateForSkillWindow;
  Sprite_EnPopup.prototype.updateForSkillWindow = function(sw){
    // run HUD’s visibility / fade logic first
    _updateForSkillWindow.call(this, sw);

    // if the HUD didn’t show the window, stop
    if (!this.visible) return;

    const skill = this._currentSkill(sw);
    if (!skill) return;

    // always take the actor bound to this skill window
    const actor = sw && sw._actor ? sw._actor
                  : (BattleManager.actor && BattleManager.actor());
    if (!actor) return;

    try {
      // temporarily disable reservation so skillMpCost() runs full burnout math
      const saved = actor._noqReserve;
      actor._noqReserve = null;
      const en = Math.round(actor.skillMpCost(skill));
      actor._noqReserve = saved;

      const txt = 'EN: ' + en;
      if (this._label.text !== txt) {
        this._label.text = txt;
        if (typeof this._layout === 'function') this._layout();
      }
    } catch(e){ console.warn('[EN-Popup Bridge]', e); }
  };
}
})();
