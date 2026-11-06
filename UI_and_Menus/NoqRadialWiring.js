/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq Radial Wiring v4 — Fixed .end() and Attack Logic
 * @author Noq
 */
(function(){
'use strict';

/* ================= CONFIG ================= */
var STYPE_VERSE   = 1;        
var STYPE_TECHS   = [2,3];    
var STYPE_GUARD   = 4;        
var LIST_ROWS     = 6;
var LIST_WIDTH    = 240;
var LIST_ROW_H    = 30;
var FONT_SIZE     = 16;
var SHOW_ICONS    = false;    
var ENEMY_HP_VISIBLE = false; 
var HELP_MARGIN   = 6;        
var SCROLL_CHAR_TRIGGER = 14; 
var SCROLL_SPEED  = 1;        
var SCROLL_PAUSE  = 24;       

/* =============== helpers =============== */
function toArr(x){ return Array.isArray(x) ? x : [x]; }

function findActorSprite(actor, sc){
  var set = sc._spriteset;
  var list = set && (set._actorSprites || (set.battlerSprites && set.battlerSprites()) || []);
  for (var i=0; i<list.length; i++) if (list[i] && list[i]._battler === actor) return list[i];
  return null;
}

function findEnemySprite(enemy, sc){
  var set = sc._spriteset, L = set && set._enemySprites || [];
  for (var i=0; i<L.length; i++) if (L[i] && L[i]._battler === enemy) return L[i];
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
  this._handlers = {}; 
  this._scrollOffset = 0;
  this._scrollPause = 0;
};

Window_NoQList.prototype.setHandler = function(symbol, method) { this._handlers[symbol] = method; };
Window_NoQList.prototype.setHelpWindow = function(win){ this._helpWindow = win; };
Window_NoQList.prototype.setActorForCosts = function(actor){ this._actorForCosts = actor||null; };

Window_NoQList.prototype.start = function(items, anchorX, anchorY, kind){
  this._items = items || []; this._index = 0; this._topRow = 0;
  this._kind  = kind || 'skill';
  this.x = Math.round(anchorX - this.width/2);
  this.y = Math.round(anchorY - this.height/2);
  this.visible = true; this.active = true;
  this._inputDelay = 12; // Increased buffer to prevent double-clicks
  this.refresh(); this._syncHelp();
};

Window_NoQList.prototype.end = function(){
  this.visible = false; this.active = false;
  if (this._helpWindow) this._helpWindow.hide();
};

Window_NoQList.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  if (!this.visible || !this.active) return;
  if (this._inputDelay > 0) { this._inputDelay--; return; }

  // Cancel logic
  if (TouchInput.isCancelled() || Input.isTriggered('cancel')){ 
      TouchInput.clear(); // Consume input
      if (this._handlers.cancel) this._handlers.cancel(); 
      return; 
  }

  // Mouse / Touch Selection
  var mx = window._Noq_PassiveMouseX || TouchInput.x;
  var my = window._Noq_PassiveMouseY || TouchInput.y;
  var lx = mx - this.x - this.standardPadding();
  var ly = my - this.y - this.standardPadding();

  if (lx >= 0 && ly >= 0 && lx < this.width && ly < this.height) {
    var hoveredIndex = Math.floor((ly - 6) / this._rowH) + this._topRow;
    if (hoveredIndex >= 0 && hoveredIndex < this._items.length) {
      if (this._index !== hoveredIndex) {
        this._index = hoveredIndex;
        this.refresh();
        SoundManager.playCursor();
        this._syncHelp();
		this._emitDescUpdate();
      }
      if (TouchInput.isTriggered()) {
        TouchInput.clear(); // PREVENTS INPUT BLEED
        if (this._handlers.ok) this._handlers.ok(this._items[this._index]);
        return;
      }
    }
  }

  // Keyboard Selection
  var old = this._index;
  if (Input.isRepeated('down')) this._index = Math.min(this._items.length-1, this._index+1);
  if (Input.isRepeated('up'))   this._index = Math.max(0, this._index-1);

  if (this._index !== old){
    var maxRow = this._topRow + LIST_ROWS - 1;
    if (this._index < this._topRow) this._topRow = this._index;
    if (this._index > maxRow) this._topRow = this._index - (LIST_ROWS - 1);
    this.refresh();
    SoundManager.playCursor();
    this._syncHelp();
  }
  
  if (Input.isTriggered('ok')) { 
    if (this._handlers.ok) this._handlers.ok(this._items[this._index]); 
  }
};

Window_NoQList.prototype._emitDescUpdate = function(){
  var scene = SceneManager._scene;
  if (!scene || !scene._noqDescPanel) return;

  var actor = BattleManager.actor && BattleManager.actor();
  var item = this._items && this._items[this._index];

  if (item){
    // DEFENSIVE CHECK: Only execute if setItem is actually a valid function
    if (typeof scene._noqDescPanel.setItem === 'function') {
      scene._noqDescPanel.setItem(item, actor);
    } 
    // Fallback: If it's a standard Window_Help, it might just need setText
    else if (typeof scene._noqDescPanel.setText === 'function') {
      scene._noqDescPanel.setText(item.description || '');
    }
  }
};

Window_NoQList.prototype.refresh = function(){
  this.contents.clear();
  var ctx = this.contents._context;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.90)';
  ctx.fillRect(0, 0, this.contents.width, this.contents.height);
  ctx.restore();
  this.contents._setDirty();
  for (var r=0; r<LIST_ROWS; r++){
    var i = this._topRow + r; if (i >= this._items.length) break;
    var it = this._items[i];
    var y  = 6 + r*this._rowH;
    if (i === this._index){
      ctx.save(); ctx.fillStyle = 'rgba(255,204,102,0.25)';
      ctx.fillRect(0, y-2, this.width, this._rowH);
      ctx.restore();
    }
    this.resetTextColor();
    this.drawText(it.name, 8, y, this.width - 100);
  }
};

Window_NoQList.prototype._syncHelp = function(){
  if (!this._helpWindow) return;
  var it = this._items[this._index];
  this._helpWindow.setText(it ? (it.description || "") : "");
};

/* =============== Enemy Selector =============== */
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
  this._container.addChild(g);
  var name = new PIXI.Text('', {fontFamily:'GameFont', fontSize:18, fill:'#ffffff', fontWeight:'bold'});
  name.anchor.set(0.5); name.y = -40;
  this._container.addChild(name); this._name = name;
  this._enemies=[]; this._index=0; this._handlers={};
};

Window_NoQEnemySelect.prototype.setHandler = function(symbol, method) { this._handlers[symbol] = method; };

Window_NoQEnemySelect.prototype.start = function(){
  this._enemies = $gameTroop.aliveMembers();
  if (this._enemies.length === 0){ SoundManager.playBuzzer(); return; }
  this._index = 0;
  this.visible = true; this.active = true;
  this._container.visible = true; this._container.alpha = 0;
  this._inputDelay = 4;
  this._refreshPos(true);
};

// FIX: Added missing .end()
Window_NoQEnemySelect.prototype.end = function(){
  this.visible = false; this.active = false;
  this._container.visible = false; this._container.alpha = 0;
};

Window_NoQEnemySelect.prototype.currentEnemy = function(){ return this._enemies[this._index]; };

Window_NoQEnemySelect.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  if (!this.visible || !this.active) return;
  if (this._container.alpha < 1) this._container.alpha += 0.15;
  if (this._inputDelay > 0) { this._inputDelay--; return; }

  // --- KEYBOARD SUPPORT ---
  var oldIdx = this._index;
  if (Input.isRepeated('right') || Input.isRepeated('down')) {
      this._index = (this._index + 1) % this._enemies.length;
  }
  if (Input.isRepeated('left') || Input.isRepeated('up')) {
      this._index = (this._index - 1 + this._enemies.length) % this._enemies.length;
  }
  if (this._index !== oldIdx) {
      this._refreshPos(true);
      SoundManager.playCursor();
  }
  // ------------------------

  var mx = window._Noq_PassiveMouseX || TouchInput.x;
  var my = window._Noq_PassiveMouseY || TouchInput.y;
  var hoveredIdx = -1;
  for (var i = 0; i < this._enemies.length; i++) {
    var sp = findEnemySprite(this._enemies[i], SceneManager._scene);
    if (sp && sp.worldTransform) {
      var dx = mx - sp.worldTransform.tx;
      var dy = my - sp.worldTransform.ty;
      if (dx*dx + dy*dy <= 64*64) { hoveredIdx = i; break; }
    }
  }
  if (hoveredIdx !== -1 && hoveredIdx !== this._index) {
    this._index = hoveredIdx;
    this._refreshPos(true);
    SoundManager.playCursor();
  }
  if (TouchInput.isTriggered() && hoveredIdx !== -1) {
    if (this._handlers.ok) this._handlers.ok(this.currentEnemy());
  } else if (TouchInput.isCancelled() || Input.isTriggered('cancel')) {
    if (this._handlers.cancel) this._handlers.cancel();
  } else if (Input.isTriggered('ok')) {
    if (this._handlers.ok) this._handlers.ok(this.currentEnemy());
  }
};

Window_NoQEnemySelect.prototype._refreshPos = function(emit){
  var e = this.currentEnemy(); if (!e) return;
  var sp = findEnemySprite(e, SceneManager._scene);
  if (sp && sp.worldTransform){
    this._container.x = sp.worldTransform.tx;
    this._container.y = sp.worldTransform.ty - 10;
  }
  this._name.text = e.name();
  if (emit && this._handlers.change) this._handlers.change(e);
};

/* =============== Ally Selector =============== */
function Window_NoQAllySelect(){ this.initialize.apply(this, arguments); }
Window_NoQAllySelect.prototype = Object.create(Window_Base.prototype);
Window_NoQAllySelect.prototype.constructor = Window_NoQAllySelect;

Window_NoQAllySelect.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, Graphics.width, Graphics.height);
  this.opacity = this.backOpacity = this.contentsOpacity = 0;
  this.visible=false; this.active=false;
  this._container=new PIXI.Container(); this._container.visible=false; this._container.alpha=0; this.addChild(this._container);
  var g=new PIXI.Graphics(); g.lineStyle(3, 0x66ccff, 0.95); g.drawCircle(0,0,26); this._container.addChild(g);
  var t=new PIXI.Text('',{fontFamily:'GameFont',fontSize:18,fill:'#ffffff',fontWeight:'bold'}); t.anchor.set(0.5); t.y=-40; this._container.addChild(t); this._name=t;
  this._allies=[]; this._index=0; this._handlers={};
};

Window_NoQAllySelect.prototype.setHandler = function(symbol, method) { this._handlers[symbol] = method; };

Window_NoQAllySelect.prototype.start = function(mode){
  var src = (mode === 'dead') ? $gameParty.deadMembers : $gameParty.aliveMembers;
  this._allies = src.call($gameParty);
  if (this._allies.length === 0){ SoundManager.playBuzzer(); return; }
  this._index = 0;
  this.visible = true; this.active = true;
  this._container.visible = true; this._container.alpha = 0;
  this._inputDelay = 4;
  this._refreshPos(true);
};

// FIX: Added missing .end()
Window_NoQAllySelect.prototype.end = function(){
  this.visible = false; this.active = false;
  this._container.visible = false; this._container.alpha = 0;
};

Window_NoQAllySelect.prototype.currentAlly = function(){ return this._allies[this._index]; };

Window_NoQAllySelect.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  if (!this.visible || !this.active) return;
  if (this._container.alpha < 1) this._container.alpha += 0.15;
  if (this._inputDelay > 0) { this._inputDelay--; return; }

  // --- KEYBOARD SUPPORT ---
  var oldIdx = this._index;
  if (Input.isRepeated('right') || Input.isRepeated('down')) {
      this._index = (this._index + 1) % this._allies.length;
  }
  if (Input.isRepeated('left') || Input.isRepeated('up')) {
      this._index = (this._index - 1 + this._allies.length) % this._allies.length;
  }
  if (this._index !== oldIdx) {
      this._refreshPos(true);
      SoundManager.playCursor();
  }
  // ------------------------

  var mx = window._Noq_PassiveMouseX || TouchInput.x;
  var my = window._Noq_PassiveMouseY || TouchInput.y;
  var hoveredIdx = -1;
  for (var i = 0; i < this._allies.length; i++){
    var sp = findActorSprite(this._allies[i], SceneManager._scene);
    if (sp && sp.worldTransform){
      var dx = mx - sp.worldTransform.tx;
      var dy = my - sp.worldTransform.ty;
      if (dx*dx + dy*dy <= 64*64){ hoveredIdx = i; break; }
    }
  }
  if (hoveredIdx !== -1 && hoveredIdx !== this._index){
    this._index = hoveredIdx;
    this._refreshPos(true);
    SoundManager.playCursor();
  }
  if (TouchInput.isTriggered() && hoveredIdx !== -1){
    if (this._handlers.ok) this._handlers.ok(this.currentAlly());
  } else if (TouchInput.isCancelled() || Input.isTriggered('cancel')){
    if (this._handlers.cancel) this._handlers.cancel();
  } else if (Input.isTriggered('ok')){
    if (this._handlers.ok) this._handlers.ok(this.currentAlly());
  }
};

Window_NoQAllySelect.prototype._refreshPos = function(emit){
  var a = this.currentAlly(); if (!a) return;
  var sp = findActorSprite(a, SceneManager._scene);
  if (sp && sp.worldTransform){ this._container.x=sp.worldTransform.tx; this._container.y=sp.worldTransform.ty-10; }
  this._name.text = a.name();
  if (emit && this._handlers.change) this._handlers.change(a);
};

/* =============== Help & Target Mini =============== */
function Window_NoQHelpMini(){ this.initialize.apply(this, arguments); }
Window_NoQHelpMini.prototype = Object.create(Window_Base.prototype);
Window_NoQHelpMini.prototype.constructor = Window_NoQHelpMini;
Window_NoQHelpMini.prototype.initialize = function(lines){
    Window_Base.prototype.initialize.call(this, 0, 0, 400, (lines||2)*32+16);
    this.opacity = 0; this._text = ''; this.hide();
};
Window_NoQHelpMini.prototype.setText = function(text){ this._text = text; this.refresh(); };
Window_NoQHelpMini.prototype.refresh = function(){ 
    this.contents.clear(); 
    var ctx = this.contents._context;
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,this.width,this.height);
    this.drawTextEx(this._text, 8, 0); 
};
Window_NoQHelpMini.prototype.repositionOverBF = function(scene){
    this.x = (Graphics.width - this.width)/2;
    this.y = Graphics.height - 180;
};

function Window_NoQTargetMini(){ this.initialize.apply(this, arguments); }
Window_NoQTargetMini.prototype = Object.create(Window_Base.prototype);
Window_NoQTargetMini.prototype.constructor = Window_NoQTargetMini;
Window_NoQTargetMini.prototype.initialize = function(){
    Window_Base.prototype.initialize.call(this, 0, 0, 400, 100);
    this.opacity = 0; this.hide();
};
Window_NoQTargetMini.prototype.setTarget = function(b, k){ this._battler = b; this.refresh(); };
Window_NoQTargetMini.prototype.refresh = function(){
    this.contents.clear();
    if (!this._battler) return;
    var ctx = this.contents._context;
    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,this.width,this.height);
    this.drawText(this._battler.name(), 8, 0);
    this.drawText("HP: " + this._battler.hp + "/" + this._battler.mhp, 8, 32);
};
Window_NoQTargetMini.prototype.repositionOverBF = function(scene){
    this.x = (Graphics.width - this.width)/2;
    this.y = Graphics.height - 180;
};

/* =============== Scene_Battle Glue =============== */
var _SB_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _SB_createAllWindows.call(this);

  this._noqHelpMini    = new Window_NoQHelpMini(2);
  this._noqTargetMini  = new Window_NoQTargetMini();
  this._noqEnemySel    = new Window_NoQEnemySelect();
  this._noqAllySel     = new Window_NoQAllySelect();
  this._noqMiniList    = new Window_NoQList();
  
  this.addWindow(this._noqHelpMini);
  this.addWindow(this._noqTargetMini);
  this.addWindow(this._noqEnemySel);
  this.addWindow(this._noqAllySel);
  this.addWindow(this._noqMiniList);

  this._noqMiniList.setHelpWindow(this._noqHelpMini);
  var self = this;

  // Enemy Handlers
  this._noqEnemySel.setHandler('change', function(e) {
    self._noqTargetMini.setTarget(e, 'enemy');
    self._noqTargetMini.repositionOverBF(self);
    self._noqTargetMini.show();
  });
  this._noqEnemySel.setHandler('ok', function(e) {
    var act = BattleManager.inputtingAction();
    if (act) act.setTarget(e.index());
    self._noqEnemySel.end(); self._noqTargetMini.hide();
    BattleManager.selectNextCommand();
  });
  this._noqEnemySel.setHandler('cancel', function() {
    self._noqEnemySel.end(); self._noqTargetMini.hide();
    reopenRadial(self);
  });

  // Ally Handlers
  this._noqAllySel.setHandler('change', function(a) {
    self._noqTargetMini.setTarget(a, 'ally');
    self._noqTargetMini.repositionOverBF(self);
    self._noqTargetMini.show();
  });
  this._noqAllySel.setHandler('ok', function(a) {
    var act = BattleManager.inputtingAction();
    if (act) act.setTarget(a.index());
    self._noqAllySel.end(); self._noqTargetMini.hide();
    BattleManager.selectNextCommand();
  });
  this._noqAllySel.setHandler('cancel', function() {
    self._noqAllySel.end(); self._noqTargetMini.hide();
    reopenRadial(self);
  });

// Mini List Handlers
  this._noqMiniList.setHandler('ok', function(item) {
    var actor = BattleManager.actor();
    var act = BattleManager.inputtingAction();
    if (item.__kind === 'skill') act.setSkill(item.id); else act.setItem(item.id);
    
    // Clear input here to prevent the click from hitting the next menu
    TouchInput.clear(); 
    
    self._noqMiniList.end();
    if (act.needsSelection()) {
        if (act.isForOpponent()) {
            self.noqOpenEnemySelector();
        } else {
            // --- RESURRECTION FIX ---
            // In RPG Maker MV/MZ, scopes 9 (1 Dead Ally) and 10 (All Dead Allies)
            var isDeadScope = (item.scope === 9 || item.scope === 10);
            self.noqOpenAllySelector(isDeadScope ? 'dead' : 'alive');
        }
    } else {
        BattleManager.selectNextCommand();
    }
  });

  this._noqMiniList.setHandler('cancel', function() {
    TouchInput.clear(); // Add this
    self._noqMiniList.end();
    reopenRadial(self);
  });

  // Radial Menu Wedge Binding (Attack command fix)
  var w = this._noqCircularCmd;
  if (w) {
    w.setHandler('attack', function(){
      var act = BattleManager.inputtingAction(); 
      if (act) act.setAttack();
      self.noqOpenEnemySelector();
    });
    w.setHandler('defense', function(){ self.noqOpenSkillList(STYPE_GUARD); });
    w.setHandler('verse', function(){ self.noqOpenSkillList(STYPE_VERSE); });
    w.setHandler('techniques', function(){ self.noqOpenSkillList(STYPE_TECHS); });
    w.setHandler('item', function(){ self.noqOpenItemList(); });
    w.setHandler('cancel', function(){ reopenRadial(self); });
  }
};

Scene_Battle.prototype.noqOpenEnemySelector = function(){
  hardHideRadial(this);
  this._noqTargetMini.repositionOverBF(this);
  this._noqTargetMini.show();
  this._noqEnemySel.start();
};

Scene_Battle.prototype.noqOpenAllySelector = function(mode){
  hardHideRadial(this);
  this._noqTargetMini.repositionOverBF(this);
  this._noqTargetMini.show();
  this._noqAllySel.start(mode);
};

Scene_Battle.prototype.noqOpenSkillList = function(stypeIds){
  hardHideRadial(this);
  if (this._noqCircularCmd) {
      this._noqCircularCmd.active = false;
      this._noqCircularCmd.deactivate();
  }
  var a = BattleManager.actor(); if (!a) return;
  var allow = {}; toArr(stypeIds).forEach(function(id){ allow[id]=true; });
  var list = a.skills().filter(function(s){ return allow[s.stypeId] && a.canUse(s); });
  list.forEach(function(s){ s.__kind = 'skill'; });
  var r = this._noqCircularCmd;
  this._noqMiniList.start(list, r._container.x, r._container.y, 'skill');
  this._noqHelpMini.repositionOverBF(this);
  this._noqHelpMini.show();
};

Scene_Battle.prototype.noqOpenItemList = function(){
  hardHideRadial(this);
  var a = BattleManager.actor(); if (!a) return;
  var list = $gameParty.items().filter(function(it){ return $gameParty.numItems(it) > 0 && a.canUse(it); });
  list.forEach(function(i){ i.__kind = 'item'; });
  var r = this._noqCircularCmd;
  this._noqMiniList.start(list, r._container.x, r._container.y, 'item');
  this._noqHelpMini.repositionOverBF(this);
  this._noqHelpMini.show();
};
})();