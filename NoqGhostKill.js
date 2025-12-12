/*:
 * @target MV
 * @plugindesc (MV) Ghostbuster — neutralize drawing for default battle windows (Actor/Party/Status/Skill/Item + targets/log/help) while keeping logic. YEP/BEC safe.
 * @author Noq
 * @help Load order: BELOW all YEP_* (Core/BE/ATB), ABOVE your radial.
 */

(function(){
'use strict';

function nullDraw(winProto){
  if (!winProto || winProto.__noqNullDraw) return;
  winProto.__noqNullDraw = true;

  // 1) Never draw contents.
  winProto.refresh = function(){ this.createContents(); /* do not draw */ };
  winProto.drawAllItems = function(){};
  winProto.drawItem = function(){};
  winProto.drawText = function(){};
  winProto.drawItemName = function(){};
  winProto.drawIcon = function(){};
  winProto.drawGauge = function(){};
  winProto.drawActorSimpleStatus = function(){};

  // 2) Kill visual parts.
  winProto._refreshArrows = function(){};
  winProto._refreshPauseSign = function(){};
  winProto._refreshCursor = function(){};
  winProto._updateCursor = function(){ if (this._cursorSprite) this._cursorSprite.alpha = 0; };
  const _open = winProto.open;      winProto.open  = function(){ _open && _open.call(this);  this.opacity=0; this.contentsOpacity=0; this.backOpacity=0; };
  const _show = winProto.show;      winProto.show  = function(){ _show && _show.call(this);  this.opacity=0; this.contentsOpacity=0; this.backOpacity=0; };
  const _activate = winProto.activate; winProto.activate = function(){ _activate && _activate.call(this); if (this._cursorSprite) this._cursorSprite.alpha = 0; };

  // 3) Don’t accept input (logic will still query state).
  winProto.processHandling = function(){};
  winProto.processWheel    = function(){};
  winProto.processTouch    = function(){};

  // 4) Defensive “still valid” stubs some flows read.
  if (!winProto.isOpen)   winProto.isOpen   = function(){ return false; };
  if (!winProto.isClosed) winProto.isClosed = function(){ return true;  };
}

// Apply to all suspects used in battle
if (typeof Window_ActorCommand   !== 'undefined') nullDraw(Window_ActorCommand.prototype);
if (typeof Window_PartyCommand   !== 'undefined') nullDraw(Window_PartyCommand.prototype);
if (typeof Window_BattleStatus   !== 'undefined') nullDraw(Window_BattleStatus.prototype);
if (typeof Window_BattleSkill    !== 'undefined') nullDraw(Window_BattleSkill.prototype);
if (typeof Window_BattleItem     !== 'undefined') nullDraw(Window_BattleItem.prototype);
if (typeof Window_BattleEnemy    !== 'undefined') nullDraw(Window_BattleEnemy.prototype);
if (typeof Window_BattleActor    !== 'undefined') nullDraw(Window_BattleActor.prototype);
if (typeof Window_BattleLog      !== 'undefined') nullDraw(Window_BattleLog.prototype);
if (typeof Window_Help           !== 'undefined') nullDraw(Window_Help.prototype);

// Paranoia: also zero contents sizes so nothing cached can blit.
var _SB_createAll = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _SB_createAll.call(this);
  const kills = [
    this._actorCommandWindow,this._partyCommandWindow,this._statusWindow,
    this._skillWindow,this._itemWindow,this._enemyWindow,this._actorWindow,
    this._logWindow,this._helpWindow
  ];
  kills.forEach(w=>{
    if (!w) return;
    w.opacity=0; w.contentsOpacity=0; w.backOpacity=0;
    if (w.contents) { w.contents.resize(1,1); w.contents.clear(); }
    if (w._windowBackSprite)     w._windowBackSprite.visible = false;
    if (w._windowContentsSprite) w._windowContentsSprite.visible = false;
    if (w._cursorSprite)         w._cursorSprite.alpha = 0;
  });
};

// Optional: F7 to dump every Window on the WindowLayer (helps spot clones)
(function(){
  const keyCode = 118; // F7
  const _onKeyDown = Input._onKeyDown;
  Input._onKeyDown = function(event){
    _onKeyDown.call(this,event);
    if (event.keyCode === keyCode && SceneManager._scene && SceneManager._scene._windowLayer){
      const wl = SceneManager._scene._windowLayer.children;
      console.log("[Ghostbuster] WindowLayer dump:");
      wl.forEach(w=>{
        if (w instanceof Window) {
          const n = w.constructor && w.constructor.name || 'Window?';
          const names = (w._list && w._list.map(e=>e && e.name).filter(Boolean).join(", ")) || "";
          console.log(n,"vis:",w.visible,"op:",w.opacity,"cop:",w.contentsOpacity,"rect:",w.x+","+w.y,w.width+"x"+w.height,"names:",names);
        }
      });
    }
  };
})();
})();