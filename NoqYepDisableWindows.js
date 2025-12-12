/*:
 * @target MV
 * @plugindesc (MV) Hide Command Windows (no draw) + Radial sync glue
 * @author Noq
 */
(function(){
'use strict';

function cloak(win){
  if (!win) return;
  // Never draw:
  win.__skipRender = true;

  // Keep logic happy:
  win.opacity = 0;
  win.contentsOpacity = 0;
  win.visible = true;     // logic expects it exists; render filter hides it
  win.openness = 0;

  // Don’t show any internal sprites if someone re-adds it elsewhere
  if (win._windowContentsSprite) win._windowContentsSprite.visible = false;
  if (win._windowBackSprite)     win._windowBackSprite.visible     = false;
  if (win._cursorSprite)         win._cursorSprite.visible         = false;

  // Stable helper stubs YEP sometimes calls:
  if (!win.currentSymbol) win.currentSymbol = function(){ return 'attack'; };
  if (!win.isOpen)        win.isOpen        = function(){ return false; };
  if (!win.isClosed)      win.isClosed      = function(){ return true;  };
}

// Hook creation and mark the windows:
const _createParty = Scene_Battle.prototype.createPartyCommandWindow;
Scene_Battle.prototype.createPartyCommandWindow = function(){
  _createParty.call(this);
  cloak(this._partyCommandWindow);
};

const _createActor = Scene_Battle.prototype.createActorCommandWindow;
Scene_Battle.prototype.createActorCommandWindow = function(){
  _createActor.call(this);
  cloak(this._actorCommandWindow);
};

// If any plugin “shows” them later, keep them cloaked:
const _startSel = Scene_Battle.prototype.startActorCommandSelection;
Scene_Battle.prototype.startActorCommandSelection = function(){
  _startSel.call(this);
  cloak(this._actorCommandWindow);
  cloak(this._partyCommandWindow);
};

// ---- Radial sync helpers (expects your Window_CircularCommand exists) ----

// Let radial open/close in lockstep with the inputting actor
const _sbUpdate = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _sbUpdate.call(this);
  const rad = this._noqCircularCmd;
  if (!rad) return;
  const act = BattleManager.actor && BattleManager.actor();
  const want = !!(act && BattleManager.isInputting && BattleManager.isInputting());
  if (want && !rad.visible){
    const s = this._spriteset && this._spriteset.battlerSprites
      ? this._spriteset.battlerSprites().find(b=>b._battler===act)
      : null;
    rad.startOpen(s);
  } else if (!want && rad.visible){
    rad.startClose();
  }
};

// Call the vanilla/YEP handlers from radial
Scene_Battle.prototype.noqRadial_bindHandlers = function(rad){
  rad.setHandler('attack',     this.commandAttack.bind(this));
  rad.setHandler('techniques', this.commandSkill.bind(this)); // open skill list, you can swap stype later
  rad.setHandler('defense',    this.commandGuard ? this.commandGuard.bind(this) : this.commandFight.bind(this));
  rad.setHandler('item',       this.commandItem.bind(this));
  rad.setHandler('verse',      this.commandSkill.bind(this, 1)); // if stypeId 1 = Verse
  rad.setHandler('cancel',     this.selectPreviousCommand.bind(this));
};

// Create radial if not there (or just bind if yours already builds it)
const _createAll = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _createAll.call(this);
  // if your circular plugin already creates _noqCircularCmd, just bind:
  if (this._noqCircularCmd){
    this.noqRadial_bindHandlers(this._noqCircularCmd);
  }
};

})();