/*:
 * @target MV
 * @plugindesc (MV, ES5) Battle Window Cloak — truly hides all default/YEP battle windows without breaking logic; fixes the “ghost” text.
 * @author Noq
 * @help
 * Load order: BELOW all YEP_* (Core/BECore/ATB/etc), ABOVE your radial menu.
 * What it does:
 *  • Adds a WindowLayer render filter: windows tagged __skipRender=true never draw.
 *  • “Cloaks” Actor/Party/Status/Skill/Item/Enemy/Actor/Log/Help windows: keeps logic alive but prevents rendering/input.
 *  • Provides safe stubs (currentSymbol/isOpen/isClosed) some YEP flows call during cancel/back.
 */

(function(){
'use strict';

/* -----------------------
 * 0) Simple config toggles
 * ----------------------- */
var CLOAK = {
  partyCommand : true,   // Fight / Escape
  actorCommand : true,   // Attack / Skill / Guard / Item
  status       : true,   // bottom status HUD
  skill        : true,
  item         : true,
  enemyTarget  : true,
  actorTarget  : true,
  log          : true,
  help         : true
};

/* ---------------------------------------------------
 * 1) WindowLayer render filter (canvas + WebGL)
 *    Any window with __skipRender=true won’t draw.
 * --------------------------------------------------- */
function withHiddenChildren(layer, cb){
  const touched=[];
  for (var i=0;i<layer.children.length;i++){
    var w = layer.children[i];
    if (w && w.__skipRender && w.visible){
      touched.push(w);
      w.__prevVisible = w.visible;
      w.visible = false;  // hide ONLY for this render pass
    }
  }
  try { cb(); } finally {
    for (var j=0;j<touched.length;j++){
      var ww = touched[j];
      ww.visible = ww.__prevVisible;
    }
  }
}

var _renderWebGL  = WindowLayer.prototype._renderWebGL;
WindowLayer.prototype._renderWebGL = function(renderer){
  withHiddenChildren(this, ()=>_renderWebGL.call(this, renderer));
};

var _renderCanvas = WindowLayer.prototype._renderCanvas;
WindowLayer.prototype._renderCanvas = function(renderer){
  withHiddenChildren(this, ()=>_renderCanvas.call(this, renderer));
};

/* ---------------------------------------------------
 * 2) Cloak helper: keep logic, kill visuals & input
 * --------------------------------------------------- */
function cloak(win){
  if (!win || win.__cloaked) return;
  win.__cloaked = true;

  // Never render:
  win.__skipRender = true;

  // Keep logic happy; kill visuals & input
  win.visible = true;             // logic expects it to "exist"
  win.opacity = 0;
  win.contentsOpacity = 0;
  win.backOpacity = 0;
  win.openness = 255;             // keep “open” so no open/close anim flashes
  if (win.deactivate) win.deactivate();

  // Hide internal sprites if any plugin adds them elsewhere
  if (win._windowBackSprite)     win._windowBackSprite.visible = false;
  if (win._windowContentsSprite) win._windowContentsSprite.visible = false;
  if (win._cursorSprite)         win._cursorSprite.visible = false;

  // Defensive stubs some flows read:
  if (!win.currentSymbol) win.currentSymbol = function(){ return 'attack'; };
  if (!win.isOpen)        win.isOpen        = function(){ return false; };
  if (!win.isClosed)      win.isClosed      = function(){ return true;  };
  // Don’t capture input
  win.processHandling = function(){};
  win.processTouch    = function(){};
}

/* ---------------------------------------------------
 * 3) Hook Scene_Battle creation & re-cloak on start
 * --------------------------------------------------- */
const SB = Scene_Battle.prototype;

function applyCloak(scene){
  if (CLOAK.partyCommand && scene._partyCommandWindow) cloak(scene._partyCommandWindow);
  if (CLOAK.actorCommand && scene._actorCommandWindow) cloak(scene._actorCommandWindow);
  if (CLOAK.status && scene._statusWindow)             cloak(scene._statusWindow);
  if (CLOAK.skill && scene._skillWindow)               cloak(scene._skillWindow);
  if (CLOAK.item && scene._itemWindow)                 cloak(scene._itemWindow);
  if (CLOAK.enemyTarget && scene._enemyWindow)         cloak(scene._enemyWindow);
  if (CLOAK.actorTarget && scene._actorWindow)         cloak(scene._actorWindow);
  if (CLOAK.log && scene._logWindow)                   cloak(scene._logWindow);
  if (CLOAK.help && scene._helpWindow)                 cloak(scene._helpWindow);
}

const _createAll = SB.createAllWindows;
SB.createAllWindows = function(){
  _createAll.call(this);
  applyCloak(this);
};

const _start = SB.start;
SB.start = function(){
  _start.call(this);
  applyCloak(this);
};

/* ---------------------------------------------------
 * 4) Paranoia: if a plugin re-opens them mid-battle,
 *    re-apply cloak every few frames.
 * --------------------------------------------------- */
const _update = SB.update;
SB.update = function(){
  _update.call(this);
  if ((Graphics.frameCount % 20) === 0) applyCloak(this);
};

})();

