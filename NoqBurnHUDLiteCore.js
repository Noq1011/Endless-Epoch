/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq HUD Core-Lite — reliable EN popup (burnout-scaled), optional YEP icon disable, unified offsets
 * @author Noq
 * @help
 * Load order: BELOW YEP_* and BELOW your BurnoutLogic/System and HUDV2.
 *
 * What it does:
 *  - Owns a new EN popup that always shows actor.skillMpCost(skill) with live burnout.
 *  - Suppresses any legacy EN popup to avoid duplicates/flicker.
 *  - Refresh events only: skill window refresh, cursor move, and TP change for the window’s actor.
 *  - Optional: disable YEP_SkillCore name icons in skill rows.
 *  - Centralizes a few offsets/style settings.
 *
 * Payment/reservation logic is untouched; display temporarily ignores reservation ONLY to show real cost.
 */

(function(){
'use strict';

/* =============================
   0) Settings (tweak here)
   ============================= */
var LITE = {
  // Popup visuals
  fontSize: 20,
  padding: 6,
  corner: 8,
  fadeSpeed: 0.15,  // 0..1 per frame
  // Position (relative to skill window)
  offsetYAbove: 6,  // distance above skill window
  // Skill window optional offsets (null keeps existing)
  skillWinOffsetX: null,
  skillWinOffsetY: null,
  // Disable YEP_SkillCore name icons in skill list?
  disableYEPNameIcons: true
};

/* =============================
   1) Optional: suppress YEP skill name icons
   ============================= */
if (LITE.disableYEPNameIcons && typeof Window_SkillList !== 'undefined') {
  var _WSL_drawItemName = Window_SkillList.prototype.drawItemName;
  Window_SkillList.prototype.drawItemName = function(item, x, y, width){
    if (!item) return;
    width = width || 312;
    this.resetTextColor();
    this.drawText(item.name, x, y, width); // name only, no icon
  };
}

/* =============================
   2) Optional: centralize skill window offset
   ============================= */
if (typeof Scene_Battle !== 'undefined') {
  var _SB_createSkillWindow = Scene_Battle.prototype.createSkillWindow;
  Scene_Battle.prototype.createSkillWindow = function(){
    _SB_createSkillWindow.call(this);
    var w = this._skillWindow;
    if (!w) return;
    if (LITE.skillWinOffsetX != null) w.x += LITE.skillWinOffsetX|0;
    if (LITE.skillWinOffsetY != null) w.y += LITE.skillWinOffsetY|0;
  };
}

/* =============================
   3) New EN popup (owned by Core-Lite)
   ============================= */
function Sprite_EnPopupLite(){
  this.initialize.apply(this, arguments);
}
Sprite_EnPopupLite.prototype = Object.create(PIXI.Container.prototype);
Sprite_EnPopupLite.prototype.constructor = Sprite_EnPopupLite;

Sprite_EnPopupLite.prototype.initialize = function(){
  PIXI.Container.call(this);
  this._bg = new PIXI.Graphics();
  this._label = new PIXI.Text("", {
    fontFamily: "GameFont",
    fontSize: LITE.fontSize,
    fontWeight: "bold",
    fill: "#000000",
    align: "center"
  });
  this._label.anchor.set(0.5);
  this.addChild(this._bg);
  this.addChild(this._label);
  this.alpha = 0;
  this._targetAlpha = 0;
  this._lastKey = "";  // actorId|skillId|cost
};

Sprite_EnPopupLite.prototype.setVisible = function(v){
  this._targetAlpha = v ? 1 : 0;
};

Sprite_EnPopupLite.prototype.update = function(){
  // simple fade toward target
  if (this.alpha < this._targetAlpha)
    this.alpha = Math.min(1, this.alpha + LITE.fadeSpeed);
  else if (this.alpha > this._targetAlpha)
    this.alpha = Math.max(0, this.alpha - LITE.fadeSpeed);
};

Sprite_EnPopupLite.prototype.drawText = function(txt){
  if (this._label.text === txt) return;
  this._label.text = txt;

  var pad = LITE.padding;
  var tw = Math.ceil(this._label.width);
  var th = Math.ceil(this._label.height);
  var w  = tw + pad*2;
  var h  = th + pad*2;

  this._bg.clear();
  this._bg.beginFill(0xffffff, 1.0);
  this._bg.drawRoundedRect(-w/2, -h/2, w, h, LITE.corner);
  this._bg.endFill();
  this._bg.lineStyle(2, 0x000000, 0.10);
  this._bg.drawRoundedRect(-w/2, -h/2, w, h, LITE.corner);
};

/* =============================
   4) Scene glue: create & own the Lite popup,
      and suppress legacy popup if present
   ============================= */
var _SB_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _SB_createAllWindows.call(this);

  // 4.1 suppress any legacy EN popup from your HUD
  if (this._noqEnPopup) {
    this._noqEnPopup.visible = false;
    this._noqEnPopup.alpha = 0;
  }

  // 4.2 create the Lite popup we control
  this._noqEnPopupLite = new Sprite_EnPopupLite();
  this.addChild(this._noqEnPopupLite);
};

var _SB_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update.call(this);
  if (this._noqEnPopupLite) this._noqEnPopupLite.update();
};

/* =============================
   5) Single updater (no per-frame spam):
      - after skill window refresh
      - after cursor select
      - when TP changes on the window’s actor
   ============================= */
function _liteRefreshEn(){
  var scn = SceneManager._scene;
  if (!scn || !scn._skillWindow || !scn._noqEnPopupLite) return;

  var sw  = scn._skillWindow;
  var pop = scn._noqEnPopupLite;

  // if skill window isn’t open & visible, hide popup
  if (!sw.visible || !sw.isOpen || !sw.isOpen()){
    pop.setVisible(false);
    return;
  }

  // current actor & skill strictly from the skill window (avoid BattleManager lag)
  var actor = sw._actor || null;
  var idx   = sw.index();
  var skill = (idx >= 0 && sw._data) ? sw._data[idx] : null;

  if (!actor || !skill){
    pop.setVisible(false);
    return;
  }

  // compute true, burnout-scaled cost; ignore reservation ONLY for display
  var en = 0, savedReserve = actor._noqReserve;
  try {
    actor._noqReserve = null;
    if (typeof actor.skillMpCost === 'function') en = Math.round(actor.skillMpCost(skill));
    else en = Math.round(skill.mpCost || skill.mp || 0);
  } catch(e){
    en = Math.round(skill.mpCost || skill.mp || 0);
  } finally {
    actor._noqReserve = savedReserve;
  }

  // draw only if changed
  var key = (actor.actorId ? actor.actorId() : -1) + "|" + (skill.id||0) + "|" + en;
  if (pop._lastKey !== key){
    pop.drawText("EN: " + en);
    pop._lastKey = key;
  }

  // position above the skill window, centered
  pop.x = sw.x + Math.floor(sw.width/2);
  pop.y = sw.y - (pop.height + LITE.offsetYAbove);
  pop.setVisible(true);
  // also keep legacy popup hidden if it exists
  if (scn._noqEnPopup){ scn._noqEnPopup.visible = false; scn._noqEnPopup.alpha = 0; }
}

// microtask defer so we run after MV/YEP finish their own refresh work
function _deferLiteRefresh(){ setTimeout(_liteRefreshEn, 0); }

// hook skill list refresh
if (typeof Window_SkillList !== 'undefined') {
  var _WSL_refresh = Window_SkillList.prototype.refresh;
  Window_SkillList.prototype.refresh = function(){
    _WSL_refresh.call(this);
    _deferLiteRefresh();
  };

  var _WSL_select = Window_SkillList.prototype.select;
  Window_SkillList.prototype.select = function(index){
    _WSL_select.call(this, index);
    _deferLiteRefresh();
  };
}

// hook TP changes only for the actor whose skill window is open
if (typeof Game_Battler !== 'undefined') {
  var _GB_setTp = Game_Battler.prototype.setTp;
  Game_Battler.prototype.setTp = function(value){
    var prev = this.tp;
    _GB_setTp.call(this, value);
    if (Math.abs(this.tp - prev) >= 0.01) {
      var scn = SceneManager._scene;
      if (scn && scn._skillWindow && scn._skillWindow._actor === this) {
        _deferLiteRefresh();
      }
    }
  };
}

})();

/*:
 * @target MV
 * @plugindesc (MV, ES5) Standalone EN Popup — shows live burnout-scaled MP cost with default UI (no HUD required)
 * @author Noq
 * @help
 * Load order: BELOW YEP_* and BELOW your Burnout Logic/System. Keep your V2 HUD disabled.
 *
 * What it does:
 *  - Creates an "EN: ##" badge that tracks the skill window.
 *  - Reads actor.skillMpCost(skill) (burnout-scaled).
 *  - Updates on cursor move, skill list refresh, and TP changes for the open actor.
 *  - No per-frame spamming; no flicker.
 *
 * If you still run a reservation plugin that sets actor._noqReserve,
 * this popup ignores it for DISPLAY ONLY (payment logic remains untouched).
 */

(function(){
'use strict';

/* ---------- Settings ---------- */
var ENPOP = {
  fontSize: 20,
  padding: 6,
  corner: 8,
  fadeSpeed: 0.15,    // 0..1 per update()
  offsetYAbove: 6,    // distance above skill window
  ignoreReservationForDisplay: true // set false if you don't use reservation at all
};

/* ---------- Sprite ---------- */
function Sprite_EnPopupStandalone(){ this.initialize.apply(this, arguments); }
Sprite_EnPopupStandalone.prototype = Object.create(PIXI.Container.prototype);
Sprite_EnPopupStandalone.prototype.constructor = Sprite_EnPopupStandalone;

Sprite_EnPopupStandalone.prototype.initialize = function(){
  PIXI.Container.call(this);
  this._bg = new PIXI.Graphics();
  this._label = new PIXI.Text("", {
    fontFamily: "GameFont",
    fontSize: ENPOP.fontSize,
    fontWeight: "bold",
    fill: "#000000",
    align: "center"
  });
  this._label.anchor.set(0.5);
  this.addChild(this._bg);
  this.addChild(this._label);
  this.alpha = 0;
  this._targetAlpha = 0;
  this._lastKey = "";
};
Sprite_EnPopupStandalone.prototype.setVisible = function(v){
  this._targetAlpha = v ? 1 : 0;
};
Sprite_EnPopupStandalone.prototype.update = function(){
  if (this.alpha < this._targetAlpha) this.alpha = Math.min(1, this.alpha + ENPOP.fadeSpeed);
  else if (this.alpha > this._targetAlpha) this.alpha = Math.max(0, this.alpha - ENPOP.fadeSpeed);
};
Sprite_EnPopupStandalone.prototype.drawText = function(txt){
  if (this._label.text === txt) return;
  this._label.text = txt;
  var pad = ENPOP.padding;
  var tw = Math.ceil(this._label.width);
  var th = Math.ceil(this._label.height);
  var w  = tw + pad*2, h = th + pad*2;
  this._bg.clear();
  this._bg.beginFill(0xffffff, 1.0);
  this._bg.drawRoundedRect(-w/2, -h/2, w, h, ENPOP.corner);
  this._bg.endFill();
  this._bg.lineStyle(2, 0x000000, 0.10);
  this._bg.drawRoundedRect(-w/2, -h/2, w, h, ENPOP.corner);
};

/* ---------- Scene glue ---------- */
var _SB_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _SB_createAllWindows.call(this);
  // create popup once
  this._enPopupStandalone = new Sprite_EnPopupStandalone();
  this.addChild(this._enPopupStandalone);
};

var _SB_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update.call(this);
  if (this._enPopupStandalone) this._enPopupStandalone.update();
};

/* ---------- Refresh driver (deferred) ---------- */
function refreshENPopup(){
  var scn = SceneManager._scene;
  if (!scn || !scn._skillWindow || !scn._enPopupStandalone) return;

  var sw  = scn._skillWindow;
  var pop = scn._enPopupStandalone;

  // hide if window isn't open/visible/has selection
  if (!sw.visible || !sw.isOpen || !sw.isOpen()) { pop.setVisible(false); return; }
  var idx = sw.index();
  var skill = (idx >= 0 && sw._data) ? sw._data[idx] : null;
  var actor = sw._actor || null;
  if (!skill || !actor) { pop.setVisible(false); return; }

  // compute burnout-scaled cost (temporarily ignore reservation if present)
  var en = 0, saved = null, cleared = false;
  try {
    if (ENPOP.ignoreReservationForDisplay && actor._noqReserve != null) {
      saved = actor._noqReserve; actor._noqReserve = null; cleared = true;
    }
    if (typeof actor.skillMpCost === 'function') en = Math.round(actor.skillMpCost(skill));
    else en = Math.round(skill.mpCost || skill.mp || 0);
  } catch(e) {
    en = Math.round(skill.mpCost || skill.mp || 0);
  } finally {
    if (cleared) actor._noqReserve = saved;
  }

  var key = (actor.actorId ? actor.actorId() : -1) + "|" + (skill.id||0) + "|" + en;
  if (pop._lastKey !== key){
    pop.drawText("EN: " + en);
    pop._lastKey = key;
  }

  // position above skill window
  pop.x = sw.x + Math.floor(sw.width/2);
  pop.y = sw.y - (pop.height + ENPOP.offsetYAbove);
  pop.setVisible(true);
}

// run after MV/YEP finish their own refresh/layout this frame
function deferRefresh(){ setTimeout(refreshENPopup, 0); }

/* ---------- Hooks: refresh points (no per-frame spam) ---------- */
// 1) Skill window refresh
if (typeof Window_SkillList !== 'undefined') {
  var _WSL_refresh = Window_SkillList.prototype.refresh;
  Window_SkillList.prototype.refresh = function(){
    _WSL_refresh.call(this);
    deferRefresh();
  };
  // 2) Cursor selection change
  var _WSL_select = Window_SkillList.prototype.select;
  Window_SkillList.prototype.select = function(index){
    _WSL_select.call(this, index);
    deferRefresh();
  };
}

// 3) TP changes on the actor whose skill window is open
if (typeof Game_Battler !== 'undefined') {
  var _GB_setTp = Game_Battler.prototype.setTp;
  Game_Battler.prototype.setTp = function(value){
    var prev = this.tp;
    _GB_setTp.call(this, value);
    if (Math.abs(this.tp - prev) >= 0.01) {
      var scn = SceneManager._scene;
      if (scn && scn._skillWindow && scn._skillWindow._actor === this) deferRefresh();
    }
  };
}
if (Scene_Battle.prototype._noqHud2Lite === undefined)
  Scene_Battle.prototype._noqHud2Lite = null;

})();



/* Noq Radial — Icons + EN costs + Defense list + Party ring */
(function(){
  'use strict';

  /* ================= CONFIG ================= */
  // DB Skill Type IDs
  var STYPE_VERSE  = (typeof window.STYPE_VERSE  !== 'undefined') ? window.STYPE_VERSE  : 1;
  var STYPE_TECHS  = (typeof window.STYPE_TECHS  !== 'undefined') ? window.STYPE_TECHS  : [2,5];
  var STYPE_DEFEND = 4; // <- Defend skills live here

  // List visuals
  var LIST_ROW_H = (typeof window.LIST_ROW_H !== 'undefined') ? window.LIST_ROW_H : 36; // taller to fit icon
  var LIST_ICON_YOFF = 2;

  /* ================= Helpers ================= */
  function toArr(x){ return Array.isArray(x) ? x : [x]; }
  function findActorSprite(actor, sc){
    var set = sc._spriteset;
    var list = set && (set._actorSprites ||
              (set.battlerSprites && set.battlerSprites()) || []);
    for (var i=0;i<list.length;i++){
      if (list[i] && list[i]._battler === actor) return list[i];
    }
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
  function skillEnCost(actor, skill){
    // Compute burnout-scaled MP/EN cost, ignoring reservation display flags if present
    if (!actor || !skill) return 0;
    var saved = null, cleared = false, cost = 0;
    try{
      if (actor._noqReserve != null){ saved = actor._noqReserve; actor._noqReserve = null; cleared = true; }
      if (typeof actor.skillMpCost === 'function'){ cost = Math.round(actor.skillMpCost(skill)); }
      else cost = Math.round(skill.mpCost || skill.mp || 0);
    } catch(e){ cost = Math.round(skill.mpCost || skill.mp || 0); }
    finally{ if (cleared) actor._noqReserve = saved; }
    return cost;
  }
  function dbName(obj){
    if (!obj) return '';
    try {
      if (typeof obj.name === 'string') return obj.name;
      if (typeof obj.name === 'function') return obj.name();
      if (obj.item && typeof obj.item === 'function')  return obj.item().name || '';
      if (obj.skill && typeof obj.skill === 'function') return obj.skill().name || '';
      if (obj.data && obj.data.name) return obj.data.name;
      if (obj._name) return obj._name;
    } catch(e){}
    return String(obj.name || '');
  }

  /* ================= Mini list: draw icon + EN cost ================= */
  if (typeof Window_NoQList !== 'undefined'){
    // add context for drawing (what kind of list + actor for costs)
    Window_NoQList.prototype.setContext = function(kind, actor){
      this._kind = kind;         // 'skill' | 'item'
      this._actorForCosts = actor||null;
    };

    Window_NoQList.prototype.refresh = function(){
      this.contents.clear();
      var rowH = LIST_ROW_H, lineH = rowH;
      this.contents.fontSize = (typeof FONT_SIZE !== 'undefined') ? FONT_SIZE : 18;

      for (var r=0;r<this.maxRows();r++){
        var i = this._topRow + r; if (i >= this._items.length) break;
        var it = this._items[i];
        var y  = 6 + r*rowH;

        // highlight selection
        if (i === this._index){
          var ctx = this.contents._context;
          ctx.save(); ctx.fillStyle = 'rgba(255,204,102,0.25)';
          ctx.fillRect(0, y-4, this.width, rowH);
          ctx.restore(); this.contents._setDirty();
        }

        // icon
        var iconIndex = (it && it.iconIndex) ? it.iconIndex : 0;
        this.drawIcon(iconIndex, 4, y - LIST_ICON_YOFF);

        // name
        var nameX = 4 + 32 + 6;
        this.resetTextColor();
        this.drawText(dbName(it), nameX, y, this.width - nameX - 70);

        // right-side info
        if (this._kind === 'skill'){
          var en = skillEnCost(this._actorForCosts, it);
          this.changeTextColor('#ffffff');
          this.drawText('EN ' + en, this.width - 68, y, 64, 'right');
        } else if (this._kind === 'item'){
          var n = ($gameParty && $gameParty.numItems) ? $gameParty.numItems(it) : 0;
          this.changeTextColor('#ffffff');
          this.drawText('x' + n, this.width - 48, y, 44, 'right');
        }
      }
    };
  }

  /* ================= Openers now set list context ================= */
  if (Scene_Battle){
    var _openSkillList = Scene_Battle.prototype.noqOpenSkillList;
    Scene_Battle.prototype.noqOpenSkillList = function(stypeIds){
      hardHideRadial(this);
      var a = BattleManager.actor(); if (!a) return;

      var allow = {}; toArr(stypeIds).forEach(function(id){ allow[id]=true; });
      var list = a.skills().filter(function(s){ return allow[s.stypeId] && a.canUse(s); });
      // If nothing to show, beep and return to ring
      if (!list.length){ SoundManager.playBuzzer(); reopenRadial(this); return; }
      for (var i=0;i<list.length;i++){ list[i].__kind = 'skill'; }

      var c = this._noqRadialCenter ? this._noqRadialCenter() : {x:Graphics.width/2,y:Graphics.height/2};
      this._noqMiniList.setContext('skill', a);
      this._noqMiniList.start(list, c.x, c.y);
      Input.clear();
    };

    var _openItemList = Scene_Battle.prototype.noqOpenItemList;
    Scene_Battle.prototype.noqOpenItemList = function(){
      hardHideRadial(this);
      var a = BattleManager.actor(); if (!a) return;

      var list = $gameParty.items().filter(function(it){ return $gameParty.numItems(it) > 0 && a.canUse(it); });
      if (!list.length){ SoundManager.playBuzzer(); reopenRadial(this); return; }
      for (var i=0;i<list.length;i++){ list[i].__kind = 'item'; }

      var c = this._noqRadialCenter ? this._noqRadialCenter() : {x:Graphics.width/2,y:Graphics.height/2};
      this._noqMiniList.setContext('item', a);
      this._noqMiniList.start(list, c.x, c.y);
      Input.clear();
    };
  }

  /* ================= Defense wedge opens STYPE_DEFEND list ================= */
  if (Scene_Battle){
    // rebind defense handler late so it wins
    var _createAllRebind = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function(){
      _createAllRebind.call(this);
      var self = this, w = this._noqCircularCmd;
      if (!w) return;

      w.setHandler('defense', function(){
        // open the custom skill list for defensive stype
        if (self.noqOpenSkillList) self.noqOpenSkillList([STYPE_DEFEND]);
      });
    };
  }

  /* ================= Party ring (Fight / Escape) on Cancel ================= */
  // Small, simple ring that appears by the actor. OK on "Fight" returns to actor ring; "Escape" calls default escape.
  function Window_NoQPartyRing(){ this.initialize.apply(this, arguments); }
  Window_NoQPartyRing.prototype = Object.create(Window_Base.prototype);
  Window_NoQPartyRing.prototype.constructor = Window_NoQPartyRing;
  Window_NoQPartyRing.prototype.initialize = function(){
    Window_Base.prototype.initialize.call(this, 0, 0, Graphics.width, Graphics.height);
    this.opacity = 0; this.backOpacity = 0; this.contentsOpacity = 0;
    this.visible = false; this.active = false;
    this._container = new PIXI.Container();
    this._container.visible = false; this._container.alpha = 0;
    this.addChild(this._container);

    var R = 90;
    var g = new PIXI.Graphics();
    g.lineStyle(2, 0xffffff, 0.25);
    g.beginFill(0x000000, 0.35); g.drawCircle(0,0,R); g.endFill();
    this._container.addChild(g);

    this._labels = {};
    var mk = (name,y)=>{ var t = new PIXI.Text(name,{fontFamily:'GameFont',fontSize:20,fill:'#ffffff',fontWeight:'bold'}); t.anchor.set(0.5); t.y=y; this._container.addChild(t); return t; };
    this._labels.fight  = mk('Fight',  0);
    this._labels.escape = mk('Escape',  R-24);
    this._focus = 'fight';
  };
  Window_NoQPartyRing.prototype.startOpen = function(anchorSprite){
    this.visible = true; this.active = true;
    this._container.visible = true; this._container.alpha = 0;
    var x = Graphics.width/2, y = Graphics.height/2;
    if (anchorSprite && anchorSprite.worldTransform){ x = anchorSprite.worldTransform.tx; y = anchorSprite.worldTransform.ty - 70; }
    this._container.x = x; this._container.y = y;
    this._focus = 'fight';
  };
  Window_NoQPartyRing.prototype.startClose = function(){
    this.active = false; this.visible = false; this._container.visible = false; this._container.alpha = 0;
  };
  Window_NoQPartyRing.prototype.setHandlers = function(h){ this._handlers = h||{}; };
  Window_NoQPartyRing.prototype.update = function(){
    Window_Base.prototype.update.call(this);
    if (!this.visible) return;
    if (this._container.alpha < 1) this._container.alpha = Math.min(1, this._container.alpha + 0.15);

    if (!this.active) return;
    if (Input.isTriggered('down')) this._focus = 'escape';
    if (Input.isTriggered('up'))   this._focus = 'fight';
    if (Input.isTriggered('ok'))   { SoundManager.playOk(); this._activate(); }
    if (Input.isTriggered('cancel')){ SoundManager.playCancel(); this._cancel(); }

    for (var k in this._labels){ this._labels[k].style.fill = (k===this._focus ? '#ffcc66' : '#ffffff'); }
  };
  Window_NoQPartyRing.prototype._activate = function(){
    var H=this._handlers||{}; var fn = H[this._focus]; if (fn) fn(); else SoundManager.playBuzzer();
  };
  Window_NoQPartyRing.prototype._cancel = function(){
    var H=this._handlers||{}; var fn = H.cancel; if (fn) fn(); else SoundManager.playCancel();
  };

  // install party ring and wire cancel on the actor ring to open it
  if (Scene_Battle){
    var _createAllParty = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function(){
      _createAllParty.call(this);

      this._noqPartyRing = new Window_NoQPartyRing();
      this.addWindow(this._noqPartyRing);

      var self = this;
      this._noqPartyRing.setHandlers({
        fight: function(){ self._noqPartyRing.startClose(); reopenRadial(self); },
        escape:function(){ self._noqPartyRing.startClose(); if (self.commandEscape) self.commandEscape(); else BattleManager.processEscape(); },
        cancel:function(){ self._noqPartyRing.startClose(); reopenRadial(self); }
      });

      // Rebind radial cancel to open party ring
      var w = this._noqCircularCmd;
      if (w){
        w.setHandler('cancel', function(){
          var a = BattleManager.actor && BattleManager.actor();
          var sp = a ? findActorSprite(a, self) : null;
          self._noqPartyRing.startOpen(sp);
          Input.clear();
        });
      }
    };
  }

})();