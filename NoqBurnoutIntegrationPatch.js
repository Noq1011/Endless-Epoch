/*:
 * @plugindesc (MV, ES5) Integration patch — disables YEP command window, routes Scene_Battle directly to radial menu. No cursor flicker.
 * @author Noq
 * @help
 * Load this BELOW YEP_BattleEngineCore but ABOVE NoqBurnoutCommandWindow.
 */

(function(){
'use strict';

//----------------------------
// Disable YEP’s command window open completely
//----------------------------
if (Window_ActorCommand) {
  Window_ActorCommand.prototype.makeCommandList = function(){ this.clearCommandList(); };
  Window_ActorCommand.prototype.open = function(){ this.hide(); this.deactivate(); };
  Window_ActorCommand.prototype.show = function(){ this.visible = false; };
  Window_ActorCommand.prototype.update = function(){};
}

//----------------------------
// Scene_Battle override (no YEP call)
//----------------------------
Scene_Battle.prototype.startActorCommandSelection = function() {
  // skip YEP _startSel entirely
  const actor = BattleManager.actor();
  if (!actor) return;

  // hide and deactivate default command window immediately
  if (this._actorCommandWindow) {
    this._actorCommandWindow.deactivate();
    this._actorCommandWindow.hide();
    this._actorCommandWindow.visible = false;
    this._actorCommandWindow.openness = 0;
  }

  // open the radial command window directly
  const sprite = this._spriteset.battlerSprites().find(s => s._battler === actor);
  if (this._noqCircularCmd) this._noqCircularCmd.startOpen(sprite);
};

// prevent YEP’s endCommandSelection from reopening it
const _endSel = Scene_Battle.prototype.endCommandSelection;
Scene_Battle.prototype.endCommandSelection = function() {
  _endSel.call(this);
  if (this._actorCommandWindow) this._actorCommandWindow.hide();
};

// fully suppress updates of actor command window
const _Scene_Battle_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function() {
  const win = this._actorCommandWindow;
  if (win && win.visible) win.visible = false;
  _Scene_Battle_update.call(this);
};

})();