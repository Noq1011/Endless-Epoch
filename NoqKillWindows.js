/*:
 * @target MV
 * @plugindesc (MV) ActorCommand Hard-Hide v3 — remove from WindowLayer, block drawing, stub helpers.
 * @author Noq
 */
(function(){
'use strict';

function hardHideActorCommand(win){
  if (!win) return;

  // 1) yank from the WindowLayer so nothing can render
  try { if (win.parent) win.parent.removeChild(win); } catch(e){}

  // 2) make it inert
  win.visible = false;
  win.active  = false;
  win.openness = 0;
  win.x = -99999; win.y = -99999;

  // 3) clear any already-drawn contents once
  try { if (win.contents) win.contents.clear(); } catch(e){}

  // 4) keep its internal sprites from rendering even if re-added
  if (win._windowContentsSprite) win._windowContentsSprite.visible = false;
  if (win._windowBackSprite)     win._windowBackSprite.visible     = false;
  if (win._cursorSprite)         win._cursorSprite.visible         = false;
  if (win._downArrowSprite)      win._downArrowSprite.visible      = false;
  if (win._upArrowSprite)        win._upArrowSprite.visible        = false;

  // 5) NOP-out methods that YEP/BEC may poke
  const NOP = function(){};
  win.open = win.show = win.close = win.hide =
  win.activate = win.deactivate = win.select =
  win.refresh = win.createContents =
  win.drawAllItems = win.drawItem = win.update = NOP;

  // Some plugins call these; provide stable stubs
  if (!win.currentSymbol) win.currentSymbol = function(){ return 'attack'; };
  if (!win.isOpen)        win.isOpen        = function(){ return false; };
  if (!win.isClosed)      win.isClosed      = function(){ return true;  };
}

const _createACW = Scene_Battle.prototype.createActorCommandWindow;
Scene_Battle.prototype.createActorCommandWindow = function(){
  _createACW.call(this);
  if (this._actorCommandWindow) hardHideActorCommand(this._actorCommandWindow);
};

// If any plugin later tries to "show" it again, keep it dead.
const _startSel = Scene_Battle.prototype.startActorCommandSelection;
Scene_Battle.prototype.startActorCommandSelection = function(){
  _startSel.call(this);
  if (this._actorCommandWindow) hardHideActorCommand(this._actorCommandWindow);
};

})();