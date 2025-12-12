/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq Side Column — EN for skills, Item count for items; aligned to mini list rows & scroll.
 * @author Noq
 */
(function(){
'use strict';

// -------- Overlay window (right-side column over the mini list)
function Window_NoQEnOverlay(){ this.initialize.apply(this, arguments); }
Window_NoQEnOverlay.prototype = Object.create(Window_Base.prototype);
Window_NoQEnOverlay.prototype.constructor = Window_NoQEnOverlay;

Window_NoQEnOverlay.prototype.standardPadding = function(){ return 0; };
Window_NoQEnOverlay.prototype.lineHeight      = function(){ return 24; };

Window_NoQEnOverlay.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, 1, 1);
  this.openness = 255;
  this.opacity = 0;             // invisible chrome
  this.backOpacity = 0;
  this.contentsOpacity = 255;
  this.visible = false;

  this._actor   = null;
  this._items   = [];
  this._kind    = 'skill';      // 'skill' | 'item'
  this._topRow  = 0;
  this._rowsVis = 6;
  this._rowH    = 28;
};

function inferKind(list){
  var it = list && list[0];
  if (!it) return 'skill';
  if (it.hasOwnProperty('itypeId')) return 'item';
  if (it.hasOwnProperty('stypeId')) return 'skill';
  // fallback heuristics
  if (it.occasion != null || it.consumable != null) return 'item';
  return 'skill';
}

Window_NoQEnOverlay.prototype.setContext = function(params){
  this._actor   = params.actor   || null;
  this._items   = params.items   || [];
  this._kind    = params.kind    || inferKind(this._items);
  this._topRow  = Math.max(0, params.topRow|0);
  this._rowsVis = Math.max(1, params.rowsVis|0);
  this._rowH    = Math.max(18, params.rowH|0);
  this.refresh();
};

Window_NoQEnOverlay.prototype.refresh = function(){
  if (!this.contents) return;
  this.contents.clear();

  var actor   = this._actor;
  var list    = this._items || [];
  var top     = this._topRow|0;
  var rowsVis = this._rowsVis|0;
  var rowH    = this._rowH|0;

  if (!list.length || !rowsVis) return;

  this.contents.fontSize = 16;

  var first = top;
  var last  = Math.min(list.length, top + rowsVis);
  var y = 6;

  for (var i = first; i < last; i++){
    var it = list[i];
    if (!it){ y += rowH; continue; }

    if (this._kind === 'item' || it.hasOwnProperty('itypeId')){
      // ITEMS: quantity
      var n = ($gameParty && $gameParty.numItems) ? $gameParty.numItems(it) : 0;
      this.changeTextColor('#ffffff');
      this.drawText('x' + n, 0, y, this.contents.width - 4, 'right');
    } else {
      // SKILLS: EN cost
      var raw = 0;
      try { raw = actor && actor.skillMpCost ? actor.skillMpCost(it) : (it.mpCost || it.mp || 0); }
      catch(e){ raw = (it.mpCost || it.mp || 0); }
      var en = Math.round(isFinite(raw) ? raw : ((it.mpCost||it.mp||0) || 0));
      this.changeTextColor('#ffd97a');
      this.drawText('EN ' + en, 0, y, this.contents.width - 4, 'right');
    }

    y += rowH;
  }

  this.resetTextColor();
  this.contents.fontSize = this.standardFontSize();
};

// -------- Scene glue
Scene_Battle.prototype.createNoQEnOverlay = function(){
  this._noqEnOverlay = new Window_NoQEnOverlay();
  // IMPORTANT: add as a **window** so it layers above the mini list
  this.addWindow(this._noqEnOverlay);
  // keep on top of the mini list
  this._noqEnOverlay.z = 9999;
};

Scene_Battle.prototype.showNoQEnOverlay = function(){
  var L = this._noqMiniList;
  var E = this._noqEnOverlay;
  var actor = BattleManager.actor && BattleManager.actor();

  if (!L || !E || !actor || !L.visible){ this.hideNoQEnOverlay(); return; }

  var rowsVis = (typeof L.maxRows === 'function') ? L.maxRows() : 6;
  var rowH    = Math.max(18, Math.floor((L.height - 12) / rowsVis));
  var colW    = 120; // give it a bit more room

  // overlap the right edge of the mini list
  E.move(
    L.x + L.width - colW,
    L.y,
    colW,
    L.height
  );

  // detect item/skill automatically each frame
  var kind = L._kind || inferKind(L._items);

  E.setContext({
    actor:   actor,
    items:   L._items || [],
    kind:    kind,
    topRow:  L._topRow|0,
    rowsVis: rowsVis,
    rowH:    rowH
  });

  E.visible = true;
};

Scene_Battle.prototype.hideNoQEnOverlay = function(){
  if (this._noqEnOverlay) this._noqEnOverlay.visible = false;
};

var _SB_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _SB_createAllWindows.call(this);
  this.createNoQEnOverlay();
};

var _SB_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update.call(this);
  var L = this._noqMiniList;
  if (L && L.visible) this.showNoQEnOverlay();
  else this.hideNoQEnOverlay();
};

})();


/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq MiniList Footer — EN for skills, quantity for items. Docks under mini list.
 * @author Noq
 */
(function(){
'use strict';

var FOOTER_FONT_SIZE = 16;    // text size in the footer
var FOOTER_HEIGHT    = 30;    // inner content height (before padding)
var FOOTER_PAD       = 1;     // Window_Base padding
var FOOTER_BG_ALPHA  = 0.90;  // 0..1 backdrop opacity

// ---------- helpers ----------
function inferKindFrom(item){
  if (!item) return 'skill';
  if (item.hasOwnProperty('itypeId')) return 'item';
  if (item.hasOwnProperty('stypeId')) return 'skill';
  if (item.consumable != null) return 'item';
  return 'skill';
}
function skillEnCost(actor, skill){
  var saved=null, cleared=false, cost=0;
  try{
    if (actor && actor._noqReserve != null){ saved=actor._noqReserve; actor._noqReserve=null; cleared=true; }
    if (actor && typeof actor.skillMpCost === 'function') cost = Math.round(actor.skillMpCost(skill)||0);
    else cost = Math.round((skill && (skill.mpCost||skill.mp)) || 0);
  }catch(e){
    cost = Math.round((skill && (skill.mpCost||skill.mp)) || 0);
  }finally{
    if (cleared) actor._noqReserve = saved;
  }
  return cost;
}

// ---------- footer window ----------
function Window_NoQMiniFooter(){ this.initialize.apply(this, arguments); }
Window_NoQMiniFooter.prototype = Object.create(Window_Base.prototype);
Window_NoQMiniFooter.prototype.constructor = Window_NoQMiniFooter;

Window_NoQMiniFooter.prototype.standardPadding = function(){ return FOOTER_PAD; };

Window_NoQMiniFooter.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, 100, FOOTER_HEIGHT + FOOTER_PAD*2);
  this.opacity = 0;
  this.backOpacity = 0;
  this.contentsOpacity = 255;
  this.visible = false;
  this._trackedList = null;
  this._lastItemId  = -1;
  this._lastIndex   = -1;
  this._lastKind    = '';
  this._actor       = null;
};

Window_NoQMiniFooter.prototype.ensureSize = function(w,h){
  if (this.width !== w || this.height !== h){
    Window.prototype.move.call(this, this.x, this.y, w, h);
    this.createContents(); // IMPORTANT: recreate bitmap when size changes
  }
};

Window_NoQMiniFooter.prototype.setTrackedList = function(list, actor){
  this._trackedList = list || null;
  this._actor = actor || null;
};

Window_NoQMiniFooter.prototype.refresh = function(){
  var cw = this.contentsWidth(), ch = this.contentsHeight();
  this.contents.clear();

  // backdrop
  var ctx = this.contents._context;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,' + FOOTER_BG_ALPHA + ')';
  ctx.fillRect(0, 0, cw, ch);
  ctx.restore();
  this.contents._setDirty();

  if (!this._trackedList) return;

  var it = (typeof this._trackedList.item === 'function') ? this._trackedList.item() : null;
  if (!it) return;

  var kind = this._trackedList._kind || inferKindFrom(it);
  var actor = this._actor || (BattleManager.actor && BattleManager.actor());

  this.contents.fontSize = FOOTER_FONT_SIZE;

  if (kind === 'item' || it.itypeId != null){
    var n = ($gameParty && $gameParty.numItems) ? $gameParty.numItems(it) : 0;
    this.changeTextColor('#ffffff');
    this.drawText('x' + n, 0, 0, cw - 2, 'right');
  } else {
    var en = skillEnCost(actor, it);
    this.changeTextColor('#ffd97a');
    this.drawText('EN ' + en, 0, 0, cw - 2, 'right');
  }

  this.resetTextColor();
  this.contents.fontSize = this.standardFontSize();
};

// ---------- scene glue ----------
Scene_Battle.prototype.createNoQMiniFooter = function(){
  this._noqMiniFooter = new Window_NoQMiniFooter();
  this.addWindow(this._noqMiniFooter);
};

var _SB_createAll = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _SB_createAll.call(this);
  this.createNoQMiniFooter();
};

var _SB_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update.call(this);

  var L = this._noqMiniList;
  var F = this._noqMiniFooter;
  if (!F) return;

  if (L && L.visible){
    // size + position
    var h = FOOTER_HEIGHT + F.standardPadding()*2;
    F.ensureSize(L.width-150, h);
    F.x = L.x +25;
    F.y = L.y - 15 + L.height;

    // keep context
    var actor = (L._actorForCosts) ? L._actorForCosts : (BattleManager.actor && BattleManager.actor());
    F.setTrackedList(L, actor);

    // refresh only when selection/kind changes
    var idx  = L._index|0;
    var it   = (typeof L.item === 'function') ? L.item() : null;
    var itId = it && it.id || -1;
    var kind = L._kind || inferKindFrom(it);
    if (idx !== F._lastIndex || itId !== F._lastItemId || kind !== F._lastKind){
      F._lastIndex = idx; F._lastItemId = itId; F._lastKind = kind;
      F.refresh();
    }

    F.visible = true;
  } else {
    F.visible = false;
  }
};

})();