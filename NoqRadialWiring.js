/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq Radial Wiring v2 — mini list name scrolling, BF+-anchored styled Help + Target Status, Defense => S.Type 4.
 * @author Noq
 */
(function(){
'use strict';

/* ================= CONFIG ================= */
var STYPE_VERSE   = 1;        // Verse Arts
var STYPE_TECHS   = [2,3];    // Techniques
var STYPE_GUARD   = 4;        // "Defense" opens this S.Type mini list
var LIST_ROWS     = 6;
var LIST_WIDTH    = 240;
var LIST_ROW_H    = 30;
var FONT_SIZE     = 16;
var SHOW_ICONS    = false;    // icons inside mini list
var ENEMY_HP_VISIBLE = false; // show enemy HP in target status?
var HELP_MARGIN   = 6;        // px gap above Battle Feed window
var SCROLL_CHAR_TRIGGER = 14; // start scrolling if name length > this
var SCROLL_SPEED  = 1;        // px per frame (when selected & overflowing)
var SCROLL_PAUSE  = 24;       // frames to pause at each end before looping

/* =============== helpers =============== */
function toArr(x){ return Array.isArray(x) ? x : [x]; }
function findActorSprite(actor, sc){
  var set = sc._spriteset;
  var list = set && (set._actorSprites ||
            (set.battlerSprites && set.battlerSprites()) || []);
  for (var i=0;i<list.length;i++) if (list[i] && list[i]._battler === actor) return list[i];
  return null;
}
function findEnemySprite(enemy, sc){
  var set = sc._spriteset, L = set && set._enemySprites || [];
  for (var i=0;i<L.length;i++) if (L[i] && L[i]._battler === enemy) return L[i];
  return null;
}
function hardHideRadial(sc){
  var r = sc._noqCircularCmd; if (!r) return;
  r.deactivate(); r._spinPhase = 0; r.visible = false;
  if (r._container){ r._container.visible = false; r._container.alpha = 0; }
}
function reopenRadial(sc){
  var a = BattleManager.actor && BattleManager.actor();
  if (!sc || !sc._noqCircularCmd || !a) return;
  sc._noqCircularCmd.startOpen(findActorSprite(a, sc), a.actorId());
}

/* =============== Mini List (skills/items) =============== */
function Window_NoQList(){ this.initialize.apply(this, arguments); }
Window_NoQList.prototype = Object.create(Window_Base.prototype);
Window_NoQList.prototype.constructor = Window_NoQList;

Window_NoQList.prototype.initialize = function(){
  var w = LIST_WIDTH, h = (LIST_ROWS*LIST_ROW_H)+12;
  Window_Base.prototype.initialize.call(this, 0, 0, w, h);
  this.opacity = 0; this.backOpacity = 0; this.contentsOpacity = 255;
  this.visible = false; this.active = false;
  this._items = []; this._index = 0; this._topRow = 0;
  this._helpWindow = null;
  this._actorForCosts = null;
  this._kind = 'skill';
  this._rowH = LIST_ROW_H;
  this.contents.fontSize = FONT_SIZE;

  // scrolling state (only for the selected row)
  this._scrollOffset = 0;
  this._scrollDir = 1; // 1 forward
  this._scrollPause = 0;
};

Window_NoQList.prototype.setHelpWindow = function(win){ this._helpWindow = win; };
Window_NoQList.prototype.setActorForCosts = function(actor){ this._actorForCosts = actor||null; };
Window_NoQList.prototype.setKind = function(kind){ this._kind = kind || this._kind; };

Window_NoQList.prototype.start = function(items, anchorX, anchorY, kind){
  this._items = items || []; this._index = 0; this._topRow = 0;
  this._kind = kind || this._kind || 'skill';
  this.x = Math.round(anchorX - this.width/2);
  this.y = Math.round(anchorY - this.height/2);
  this.visible = true; this.active = true;
  this._resetScroll();
  this.refresh(); this._syncHelp();
};
Window_NoQList.prototype.end = function(){
  this.visible = false; this.active = false;
  if (this._helpWindow) this._helpWindow.hide();
};

Window_NoQList.prototype.maxRows = function(){ return LIST_ROWS; };
Window_NoQList.prototype.item   = function(){ return this._items[this._index]; };

Window_NoQList.prototype._resetScroll = function(){ this._scrollOffset=0; this._scrollDir=1; this._scrollPause=SCROLL_PAUSE; };

Window_NoQList.prototype.refresh = function(){
  this.contents.clear();

  // dark backdrop like mini list
  var ctx = this.contents._context;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.90)';
  ctx.fillRect(0, 0, this.contents.width, this.contents.height);
  ctx.restore();
  this.contents._setDirty();

  var rowH = this._rowH;
  for (var r=0;r<this.maxRows();r++){
    var i = this._topRow + r; if (i >= this._items.length) break;
    var it = this._items[i];
    var y  = 6 + r*rowH;

    // highlight
    if (i === this._index){
      var c2 = this.contents._context;
      c2.save(); c2.fillStyle = 'rgba(255,204,102,0.25)';
      c2.fillRect(0, y-2, this.width, rowH);
      c2.restore(); this.contents._setDirty();
    }

    // left icon (optional)
    var nameX = 8;
    if (SHOW_ICONS){
      var iconIndex = (it && it.iconIndex) ? it.iconIndex : 0;
      if (iconIndex > 0){ this.drawIcon(iconIndex, 4, y-2); nameX = 4 + 32 + 6; }
    }

    // right column width (space for EN/qty)
    var rightW = 88;

    // name area (will be clipped; selected row scrolls if long)
    var nameW = this.width - nameX - rightW - 6;

    this.resetTextColor();
    if (i === this._index && it && String(it.name||'').length > SCROLL_CHAR_TRIGGER){
      this._drawScrollingName(String(it.name||''), nameX, y, nameW);
    }else{
      this._drawClippedText(String(it && it.name || ''), nameX, y, nameW);
    }

    // right column: EN (skills) or qty (items)
    var a = this._actorForCosts || (BattleManager.actor && BattleManager.actor());
    if (it && (it.stypeId || it.mpCost != null)){
      var en=0; try{ en = a && a.skillMpCost ? Math.round(a.skillMpCost(it)) : Math.round(it.mpCost||it.mp||0); }
      catch(e){ en = Math.round(it.mpCost||it.mp||0); }
      this.changeTextColor('#ffd97a');
      this.drawText('EN ' + en, this.width - rightW, y, rightW-6, 'right');
    }else if (it){
      var n = ($gameParty && $gameParty.numItems) ? $gameParty.numItems(it) : 0;
      this.changeTextColor('#ffffff');
      this.drawText('x' + n, this.width - rightW, y, rightW-6, 'right');
    }
  }
};

Window_NoQList.prototype._drawClippedText = function(text, x, y, w){
  var ctx = this.contents._context;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y-2, w, this.lineHeight()); ctx.clip();
  this.drawText(text, x, y, w, 'left');
  ctx.restore();
};

Window_NoQList.prototype._drawScrollingName = function(text, x, y, w){
  var ctx = this.contents._context;
  var tw = this.textWidth(text);
  var pad = 32; // gap before loop
  var loopText = text + '   ' + text;

  ctx.save();
  ctx.beginPath(); ctx.rect(x, y-2, w, this.lineHeight()); ctx.clip();

  // draw twice for seamless loop
  this.drawText(loopText, x - this._scrollOffset, y, tw*2 + pad, 'left');

  ctx.restore();
};

Window_NoQList.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  if (!this.visible || !this.active) return;

  var old = this._index;
  if (Input.isRepeated('down')) this._index = Math.min(this._items.length-1, this._index+1);
  if (Input.isRepeated('up'))   this._index = Math.max(0, this._index-1);

  // scrolling step (for selected row if long)
  var it = this.item();
  var needsScroll = it && String(it.name||'').length > SCROLL_CHAR_TRIGGER;
  if (needsScroll){
    if (this._scrollPause > 0){
      this._scrollPause--;
    }else{
      this._scrollOffset += SCROLL_SPEED;
      var tw = this.textWidth(String(it.name||''));
      var nameX = SHOW_ICONS ? 42 : 8;
      var rightW = 88;
      var nameW = this.width - nameX - rightW - 6;
      if (this._scrollOffset > tw + 24){
        this._scrollOffset = 0;
        this._scrollPause = SCROLL_PAUSE;
      }
    }
  }else if (this._scrollOffset !== 0){
    this._resetScroll();
  }

  if (this._index !== old){
    var minRow = this._topRow;
    var maxRow = this._topRow + this.maxRows() - 1;
    if (this._index < minRow) this._topRow = this._index;
    if (this._index > maxRow) this._topRow = this._index - (this.maxRows()-1);
    this._resetScroll();
    this.refresh();
    SoundManager.playCursor();
    this._syncHelp();
  }else if (needsScroll && Graphics.frameCount % 1 === 0){
    // redraw only the selected row region by just calling refresh (tiny list anyway)
    this.refresh();
    this._syncHelp(); // keep help in sync when name scrolls
  }

  if (Input.isTriggered('ok'))     this._onOk();
  if (Input.isTriggered('cancel')) this._onCancel();
};

Window_NoQList.prototype._syncHelp = function(){
  if (!this._helpWindow) return;
  var it = this.item();
  var text = (it && (it.description || (it.meta && it.meta.desc))) || '';
  this._helpWindow.setText(text);
  this._helpWindow.show();
};
Window_NoQList.prototype.setHandlers = function(h){ this._handlers = h||{}; };
Window_NoQList.prototype._onOk = function(){ if (this._handlers && this._handlers.ok) this._handlers.ok(this.item()); };
Window_NoQList.prototype._onCancel = function(){ if (this._handlers && this._handlers.cancel) this._handlers.cancel(); };

/* =============== Styled Help (bottom center, above BF+) =============== */
function Window_NoQHelpMini(){ this.initialize.apply(this, arguments); }
Window_NoQHelpMini.prototype = Object.create(Window_Base.prototype);
Window_NoQHelpMini.prototype.constructor = Window_NoQHelpMini;

Window_NoQHelpMini.prototype.standardPadding = function(){ return 8; };
Window_NoQHelpMini.prototype.initialize = function(lines){
  var h = (lines||2) * (FONT_SIZE+8) + this.standardPadding()*2;
  Window_Base.prototype.initialize.call(this, 0, 0, 100, h);
  this.opacity = 0; this.backOpacity = 0; this.contentsOpacity = 255;
  this._text = '';
  this.hide();
};
Window_NoQHelpMini.prototype.repositionOverBF = function(scene){
  var r = scene.bfPlusRect ? scene.bfPlusRect() : new Rectangle(0, Graphics.height-120, Graphics.width, 120);
  var w = Math.max(220, Math.min(520, Math.floor(r.width * 0.8)));
  var x = Math.floor(r.x + (r.width - w)/2);
  var y = Math.floor(r.y - this.height - HELP_MARGIN);
  this.move(x, y, w, this.height);
};
Window_NoQHelpMini.prototype.setText = function(text){
  text = String(text||'');
  if (text === this._text) return;
  this._text = text;
  this.refresh();
};
Window_NoQHelpMini.prototype.refresh = function(){
  this.createContents();
  var ctx = this.contents._context;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.90)';
  ctx.fillRect(0, 0, this.contents.width, this.contents.height);
  ctx.restore();
  this.contents._setDirty();

  this.resetTextColor();
  this.contents.fontSize = FONT_SIZE;
  this.drawTextEx(this._text, this.textPadding(), 0);
};

/* =============== Styled Target Status (bottom center, above BF+) =============== */
function Window_NoQTargetMini(){ this.initialize.apply(this, arguments); }
Window_NoQTargetMini.prototype = Object.create(Window_Base.prototype);
Window_NoQTargetMini.prototype.constructor = Window_NoQTargetMini;

Window_NoQTargetMini.prototype.standardPadding = function(){ return 8; };
Window_NoQTargetMini.prototype.initialize = function(){
  var h = 3*(FONT_SIZE+8) + this.standardPadding()*2;
  Window_Base.prototype.initialize.call(this, 0, 0, 100, h);
  this.opacity = 0; this.backOpacity = 0; this.contentsOpacity = 255;
  this._battler=null; this._kind='enemy';
  this.hide();
};
Window_NoQTargetMini.prototype.repositionOverBF = function(scene){
  var r = scene.bfPlusRect ? scene.bfPlusRect() : new Rectangle(0, Graphics.height-120, Graphics.width, 120);
  var w = Math.max(260, Math.min(560, Math.floor(r.width * 0.85)));
  var x = Math.floor(r.x + (r.width - w)/2);
  var y = Math.floor(r.y - this.height - HELP_MARGIN);
  this.move(x, y, w, this.height);
};
Window_NoQTargetMini.prototype.setTarget = function(battler, kind){
  this._battler = battler||null; this._kind = kind||'enemy';
  this.refresh();
};
Window_NoQTargetMini.prototype.refresh = function(){
  this.createContents();
  var ctx = this.contents._context;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.90)';
  ctx.fillRect(0, 0, this.contents.width, this.contents.height);
  ctx.restore();
  this.contents._setDirty();

  if (!this._battler) return;
  var b = this._battler, x=8, w=this.contents.width-16, y=0;
  this.contents.fontSize = FONT_SIZE;

  // Line 1: Name + HP (if ally or if config allows for enemy)
  this.changeTextColor(this.systemColor());
  this.drawText(this._kind === 'ally' ? 'Ally' : 'Enemy', x, y, 100, 'left');
  this.resetTextColor();
  this.drawText(b.name(), x+100, y, w-100, 'left');
  y += this.lineHeight();

  if (this._kind === 'ally'){
    this.drawText('HP '+b.hp+'/'+b.mhp, x, y, w, 'left');
  } else {
    if (ENEMY_HP_VISIBLE){
      this.drawText('HP '+b.hp+'/'+(b.mhp||'?'), x, y, w, 'left');
    } else {
      this.changeTextColor('#bbbbbb');
      this.drawText('(Analyze to reveal HP)', x, y, w, 'left');
      this.resetTextColor();
    }
  }
  y += this.lineHeight();

  // Line 2: Buff/Debuff summary + States (names only)
  var bd = _makeBuffSummaryText(b);
  var st = _makeStateNames(b);
  var line = bd + (st ? ('  •  ' + st) : '');
  this.drawTextEx(line, x, y);
};

function _makeBuffSummaryText(b){
  var names = ['Atk','Def','M.Atk','M.Def','Agi','Luck'];
  var params = [2,3,4,5,6,7];
  var out=[];
  try{
    for (var i=0;i<params.length;i++){
      var v = b._buffs[params[i]]||0;
      if (v>0) out.push(names[i]+'↑');
      else if (v<0) out.push(names[i]+'↓');
    }
  }catch(e){}
  return out.length? out.join(', '): 'No Buffs/Debuffs';
}
function _makeStateNames(b){
  try{
    var arr = b.states ? b.states() : (b.allStates ? b.allStates() : []);
    var names = [];
    for (var i=0;i<arr.length;i++){
      var s = arr[i]; if (s && s.name) names.push(s.name);
      if (names.length>=4) break;
    }
    return names.join(', ');
  }catch(e){ return ''; }
}

/* =============== Enemy / Ally Selectors =============== */
function Window_NoQEnemySelect(){ this.initialize.apply(this, arguments); }
Window_NoQEnemySelect.prototype = Object.create(Window_Base.prototype);
Window_NoQEnemySelect.prototype.constructor = Window_NoQEnemySelect;
Window_NoQEnemySelect.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, Graphics.width, Graphics.height);
  this.opacity = this.backOpacity = this.contentsOpacity = 0;
  this.visible = false; this.active = false;
  this._container = new PIXI.Container();
  this._container.visible = false; this._container.alpha = 0;
  this.addChild(this._container);
  var g = new PIXI.Graphics();
  g.lineStyle(3, 0xffcc66, 0.95); g.drawCircle(0, 0, 26);
  this._container.addChild(g); this._ring = g;
  var name = new PIXI.Text('', {fontFamily:'GameFont', fontSize:18, fill:'#ffffff', fontWeight:'bold'});
  name.anchor.set(0.5); name.y = -40;
  this._container.addChild(name); this._name = name;
  this._enemies=[]; this._index=0; this._handlers={};
};
Window_NoQEnemySelect.prototype.start = function(){
  this._enemies = $gameTroop.aliveMembers();
  if (this._enemies.length===0){ SoundManager.playBuzzer(); return; }
  this._index = Math.max(0, Math.min(this._index, this._enemies.length-1));
  this.visible=true; this.active=true;
  this._container.visible=true; this._container.alpha=0;
  this._refreshPos(true);
};
Window_NoQEnemySelect.prototype.end = function(){
  this.visible=false; this.active=false;
  this._container.visible=false; this._container.alpha=0;
};
Window_NoQEnemySelect.prototype.currentEnemy = function(){ return this._enemies[this._index]; };
Window_NoQEnemySelect.prototype._refreshPos = function(emit){
  var e = this.currentEnemy(); if (!e) return;
  var sp = findEnemySprite(e, SceneManager._scene);
  if (sp && sp.worldTransform){
    this._container.x = sp.worldTransform.tx;
    this._container.y = sp.worldTransform.ty - 10;
  }
  this._name.text = e.name();
  if (emit && this._handlers && this._handlers.change) this._handlers.change(e);
};
Window_NoQEnemySelect.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  if (!this.visible) return;
  if (this._container.alpha < 1) this._container.alpha = Math.min(1, this._container.alpha + 0.15);
  this._refreshPos(false);
  if (!this.active) return;

  var changed=false;
  if (Input.isTriggered('right')){ this._index = (this._index+1)%this._enemies.length; changed=true; }
  if (Input.isTriggered('left')) { this._index = (this._index+this._enemies.length-1)%this._enemies.length; changed=true; }
  if (changed){ this._refreshPos(true); SoundManager.playCursor(); }
  if (Input.isTriggered('ok'))     this._onOk();
  if (Input.isTriggered('cancel')) this._onCancel();
};
Window_NoQEnemySelect.prototype.setHandlers = function(h){ this._handlers=h||{}; };
Window_NoQEnemySelect.prototype._onOk = function(){
  var e=this.currentEnemy(); if (!e){ SoundManager.playBuzzer(); return; }
  if (this._handlers && this._handlers.ok) this._handlers.ok(e);
};
Window_NoQEnemySelect.prototype._onCancel = function(){ if (this._handlers && this._handlers.cancel) this._handlers.cancel(); };

function Window_NoQAllySelect(){ this.initialize.apply(this, arguments); }
Window_NoQAllySelect.prototype = Object.create(Window_Base.prototype);
Window_NoQAllySelect.prototype.constructor = Window_NoQAllySelect;
Window_NoQAllySelect.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, Graphics.width, Graphics.height);
  this.opacity = this.backOpacity = this.contentsOpacity = 0;
  this.visible=false; this.active=false;
  this._container=new PIXI.Container(); this._container.visible=false; this._container.alpha=0; this.addChild(this._container);
  var g=new PIXI.Graphics(); g.lineStyle(3, 0x66ccff, 0.95); g.drawCircle(0,0,26); this._container.addChild(g);
  this._ring=g;
  var t=new PIXI.Text('',{fontFamily:'GameFont',fontSize:18,fill:'#ffffff',fontWeight:'bold'}); t.anchor.set(0.5); t.y=-40; this._container.addChild(t); this._name=t;
  this._mode='alive'; this._allies=[]; this._index=0; this._handlers={};
};
Window_NoQAllySelect.prototype.start = function(mode){
  this._mode=mode||'alive';
  var src = this._mode==='dead' ? $gameParty.deadMembers : $gameParty.aliveMembers;
  try{ this._allies = src.call($gameParty).slice(); }catch(e){ this._allies = $gameParty.members().slice(); }
  if (this._allies.length===0){ SoundManager.playBuzzer(); return; }
  this._index = Math.max(0, Math.min(this._index, this._allies.length-1));
  this.visible=true; this.active=true; this._container.visible=true; this._container.alpha=0;
  this._refreshPos(true);
};
Window_NoQAllySelect.prototype.end = function(){ this.visible=false; this.active=false; this._container.visible=false; this._container.alpha=0; };
Window_NoQAllySelect.prototype.currentAlly = function(){ return this._allies[this._index]; };
Window_NoQAllySelect.prototype._refreshPos = function(emit){
  var a=this.currentAlly(); if (!a) return;
  var sp = findActorSprite(a, SceneManager._scene);
  if (sp && sp.worldTransform){ this._container.x=sp.worldTransform.tx; this._container.y=sp.worldTransform.ty-10; }
  this._name.text = a.name();
  if (emit && this._handlers && this._handlers.change) this._handlers.change(a);
};
Window_NoQAllySelect.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  if (!this.visible) return;
  if (this._container.alpha < 1) this._container.alpha = Math.min(1, this._container.alpha + 0.15);
  this._refreshPos(false);
  if (!this.active) return;
  var changed=false;
  if (Input.isTriggered('right')){ this._index=(this._index+1)%this._allies.length; changed=true; }
  if (Input.isTriggered('left')) { this._index=(this._index+this._allies.length-1)%this._allies.length; changed=true; }
  if (changed){ this._refreshPos(true); SoundManager.playCursor(); }
  if (Input.isTriggered('ok'))     this._onOk();
  if (Input.isTriggered('cancel')) this._onCancel();
};
Window_NoQAllySelect.prototype.setHandlers=function(h){ this._handlers=h||{}; };
Window_NoQAllySelect.prototype._onOk=function(){ var a=this.currentAlly(); if (!a){ SoundManager.playBuzzer(); return; } if (this._handlers&&this._handlers.ok) this._handlers.ok(a); };
Window_NoQAllySelect.prototype._onCancel=function(){ if (this._handlers&&this._handlers.cancel) this._handlers.cancel(); };

/* =============== Scene_Battle glue =============== */
var _createAll = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _createAll.call(this);

  // bottom styled windows
  this._noqHelpMini   = new Window_NoQHelpMini(2);
  this._noqTargetMini = new Window_NoQTargetMini();
  this.addWindow(this._noqHelpMini);
  this.addWindow(this._noqTargetMini);

  // selectors
  this._noqEnemySel = new Window_NoQEnemySelect();
  this._noqAllySel  = new Window_NoQAllySelect();
  this.addWindow(this._noqEnemySel);
  this.addWindow(this._noqAllySel);

  // mini list
  this._noqMiniList = new Window_NoQList();
  this.addWindow(this._noqMiniList);
  this._noqMiniList.setHelpWindow(this._noqHelpMini);

  var self = this;

  // enemy selector handlers
  this._noqEnemySel.setHandlers({
    change: function(enemy){
      self._noqTargetMini.setTarget(enemy, 'enemy');
      self._noqTargetMini.repositionOverBF(self);
      self._noqTargetMini.show();
    },
    ok: function(enemy){
      var act = BattleManager.inputtingAction();
      if (!act){ var a=BattleManager.actor(); if (a) act = a.action(a._actionInputIndex||0); }
      if (act && typeof act.setEnemyTarget === 'function') act.setEnemyTarget(enemy.index());
      else if (act && typeof act.setTarget === 'function') act.setTarget(enemy.index());
      self._noqEnemySel.end();
      self._noqTargetMini.hide();
      BattleManager.selectNextCommand();
    },
    cancel: function(){
      self._noqEnemySel.end(); self._noqTargetMini.hide();
      reopenRadial(self);
    }
  });

  // ally selector handlers
  this._noqAllySel.setHandlers({
    change: function(ally){
      self._noqTargetMini.setTarget(ally, 'ally');
      self._noqTargetMini.repositionOverBF(self);
      self._noqTargetMini.show();
    },
    ok: function(ally){
      var act = BattleManager.inputtingAction();
      if (!act){ var a=BattleManager.actor(); if (a) act=a.action(a._actionInputIndex||0); }
      var idx = $gameParty.members().indexOf(ally); if (idx<0) idx = ally.index ? ally.index() : 0;
      if (act && typeof act.setActorTarget === 'function') act.setActorTarget(idx);
      else if (act){ act._targetIndex = idx; }
      self._noqAllySel.end(); self._noqTargetMini.hide();
      BattleManager.selectNextCommand();
    },
    cancel: function(){
      self._noqAllySel.end(); self._noqTargetMini.hide();
      reopenRadial(self);
    }
  });

  // mini list handlers
  this._noqMiniList.setHandlers({
    ok: function(entry){
      if (!entry){ SoundManager.playBuzzer(); return; }
      var actor = BattleManager.actor(); if (!actor){ SoundManager.playBuzzer(); return; }
      var act = BattleManager.inputtingAction(); if (!act) act = actor.action(actor._actionInputIndex||0);
      var probe = new Game_Action(actor);
      if (entry.__kind === 'skill'){ probe.setSkill(entry.id); act.setSkill(entry.id); self._noqMiniList.setKind('skill'); }
      else if (entry.__kind === 'item'){ probe.setItem(entry.id); act.setItem(entry.id); self._noqMiniList.setKind('item'); }

      var needs = probe.needsSelection && probe.needsSelection();
      var foes  = probe.isForOpponent && probe.isForOpponent();
      var friends = probe.isForFriend && probe.isForFriend();
      var forUser = probe.isForUser && probe.isForUser();
      var forAll  = probe.isForAll && probe.isForAll();
      var deadFriend = probe.isForDeadFriend && probe.isForDeadFriend();

      self._noqMiniList.end(); // close list (help hides automatically)

      if (needs && foes){
        self.noqOpenEnemySelector();
      } else if (needs && friends && !forUser && !forAll){
        self.noqOpenAllySelector(deadFriend ? 'dead' : 'alive');
      } else {
        BattleManager.selectNextCommand();
      }
    },
    cancel: function(){
      self._noqMiniList.end();
      reopenRadial(self);
    }
  });
};

Scene_Battle.prototype._noqRadialCenter = function(){
  var r = this._noqCircularCmd;
  if (r && r._container) return {x: r._container.x, y: r._container.y};
  return {x: Graphics.width/2, y: Graphics.height/2};
};

Scene_Battle.prototype.noqOpenEnemySelector = function(){
  hardHideRadial(this);
  this._noqTargetMini.repositionOverBF(this);
  this._noqTargetMini.show();
  this._noqEnemySel.start();
  Input.clear();
};
Scene_Battle.prototype.noqOpenAllySelector = function(mode){
  hardHideRadial(this);
  this._noqTargetMini.repositionOverBF(this);
  this._noqTargetMini.show();
  this._noqAllySel.start(mode||'alive');
  Input.clear();
};

Scene_Battle.prototype.noqOpenSkillList = function(stypeIds){
  hardHideRadial(this);
  var a = BattleManager.actor(); if (!a) return;
  var allow = {}; toArr(stypeIds).forEach(function(id){ allow[id]=true; });
  var list = a.skills().filter(function(s){ return allow[s.stypeId] && a.canUse(s); });
  for (var i=0;i<list.length;i++){ list[i].__kind = 'skill'; }
  var c = this._noqRadialCenter();
  this._noqMiniList.setActorForCosts(a);
  this._noqMiniList.start(list, c.x, c.y, 'skill');
  this._noqHelpMini.repositionOverBF(this);
  this._noqHelpMini.show();
  Input.clear();
};

Scene_Battle.prototype.noqOpenItemList = function(){
  hardHideRadial(this);
  var a = BattleManager.actor(); if (!a) return;
  var list = $gameParty.items().filter(function(it){ return $gameParty.numItems(it) > 0 && a.canUse(it); });
  for (var i=0;i<list.length;i++){ list[i].__kind = 'item'; }
  var c = this._noqRadialCenter();
  this._noqMiniList.setActorForCosts(a);
  this._noqMiniList.start(list, c.x, c.y, 'item');
  this._noqHelpMini.repositionOverBF(this);
  this._noqHelpMini.show();
  Input.clear();
};

/* keep radial hidden while submenus are active & keep bottom windows anchored */
var _SB_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update.call(this);
  var busy = (this._noqEnemySel && this._noqEnemySel.active) ||
             (this._noqAllySel && this._noqAllySel.active) ||
             (this._noqMiniList && this._noqMiniList.active);
  if (busy) hardHideRadial(this);

  if (this._noqHelpMini && this._noqHelpMini.visible) this._noqHelpMini.repositionOverBF(this);
  if (this._noqTargetMini && this._noqTargetMini.visible) this._noqTargetMini.repositionOverBF(this);
};

/* =============== Bind circular wedges (Defense => S.Type 4) =============== */
var _createAll2 = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _createAll2.call(this);
  var self = this, w = this._noqCircularCmd;
  if (!w) return;
  w.setHandler('attack', function(){
    var act = BattleManager.inputtingAction(); if (act && act.setAttack) act.setAttack();
    self.noqOpenEnemySelector();
  });
  w.setHandler('defense', function(){ self.noqOpenSkillList(STYPE_GUARD); });
  w.setHandler('verse', function(){ self.noqOpenSkillList(STYPE_VERSE); });
  w.setHandler('techniques', function(){ self.noqOpenSkillList(STYPE_TECHS); });
  w.setHandler('item', function(){ self.noqOpenItemList(); });
  w.setHandler('cancel', function(){ reopenRadial(self); });
};

})();


/* --- PATCH: bring Help/Target to front + keep anchored --- */
(function(){
  // Utility: move a window to the top of the WindowLayer
  function bringToFront(scene, win){
    if (!scene || !scene._windowLayer || !win || win.parent !== scene._windowLayer) return;
    var wl = scene._windowLayer;
    wl.removeChild(win);
    wl.addChild(win); // now last = top-most
  }

  // After all windows exist, raise ours above BF+
  var _SB_createAll = Scene_Battle.prototype.createAllWindows;
  Scene_Battle.prototype.createAllWindows = function(){
    _SB_createAll.call(this);

    // If your wiring added them, they exist here:
    if (this._noqHelpMini)   bringToFront(this, this._noqHelpMini);
    if (this._noqTargetMini) bringToFront(this, this._noqTargetMini);
  };

  // Also do a one-time raise after BF+ is created (in case BF+ loads after us)
  var _SB_start = Scene_Battle.prototype.start;
  Scene_Battle.prototype.start = function(){
    _SB_start.call(this);
    // do it on the next few frames to be extra safe
    this._noqRaiseCountdown = 6;
  };

  var _SB_update = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function(){
    _SB_update.call(this);

    if (this._noqRaiseCountdown && --this._noqRaiseCountdown >= 0){
      if (this._noqHelpMini)   bringToFront(this, this._noqHelpMini);
      if (this._noqTargetMini) bringToFront(this, this._noqTargetMini);
    }

    // Keep them anchored just above BF+ if visible
    if (this._noqHelpMini && this._noqHelpMini.visible) {
      this._noqHelpMini.repositionOverBF(this);
    }
    if (this._noqTargetMini && this._noqTargetMini.visible) {
      this._noqTargetMini.repositionOverBF(this);
    }
  };
})();