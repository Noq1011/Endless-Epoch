/*:
 * @target MV
 * @plugindesc (MV, ES5) Circular Command v7 — Left-of-head anchor, state aura, opaque mini list, Techniques(2&3), center Party ring, burnout smoke ping.
 * @author Noq + Tyson
 */

(function(){
'use strict';

/* ================= GLOBAL CFG ================= */
var RADIAL_CFG = {
  // ring anchor relative to battler head
  CENTER_X_OFFSET : -120,         // negative = left of head
  CENTER_Y_OFFSET : -90,

  // ring visuals
  SCALE      : 0.5,
  RADIUS     : 85,
  LINE_COLOR : 0xffffff,
  LINE_ALPHA : 0.25,
  LINE_THICK : 2,
  BG_COLOR   : 0x000000,
  BG_ALPHA   : 0.35,

  // pulsing aura per state (ID -> color)
  STATE_AURA_COLORS : (function(){
    var m = {};
    var BO = (window.UBS && UBS.DEFAULT_BURNOUT_STATE_ID) || 17;
    m[BO] = 0xff6a00; // burnout orange
    // add more here, e.g.: m[POISON_ID] = 0x9c27b0;
    return m;
  })(),
  AURA_PULSE_SPEED : 0.15,
  AURA_THICK       : 6,

  // mini list
  LIST_X_OFFSET : -340,    // list left of the ring/actor head
  LIST_Y_OFFSET : -10,
  LIST_BG_OPACITY : 0.90,
  LIST_ROW_H : 36,

  // stype wiring
  STYPE_VERSE  : [1],
  STYPE_TECHS  : [2,3],
  STYPE_DEFEND : [4],

  // burnout smoke “ping” (optional)
  SMOKE_ANIM_ID  : 154,
  SMOKE_INTERVAL : 180
};

function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }

/* ---------------- Window_CircularCommand ---------------- */
function Window_CircularCommand(){ this.initialize.apply(this, arguments); }
Window_CircularCommand.prototype = Object.create(Window_Base.prototype);
Window_CircularCommand.prototype.constructor = Window_CircularCommand;

Window_CircularCommand.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, Graphics.width, Graphics.height);
  this.opacity = 0; this.backOpacity = 0; this.contentsOpacity = 0;
  this.visible = false;

  this._list = [];
  this._handlers = {};
  this.makeCommandList();

  this._angle = -Math.PI/2;
  this._targetAngle = 0;
  this._spinPhase = 0;     // 0 idle, 1 opening, 2 closing
  this._activeIndex = 0;
  this._hoveredIndex = -1;
  this._snapBack = false;
  this._currentActorId = 0;

  this._container = new PIXI.Container();
  this._container.alpha = 0;
  this._container.visible = false;
  this.addChild(this._container);

  this._createRing();
  this._createLabels();
};

Window_CircularCommand.prototype.standardPadding = function(){ return 0; };

Window_CircularCommand.prototype.addCommand = function(name, symbol){
  this._list.push({ name:name, symbol:symbol });
};
Window_CircularCommand.prototype.setHandler = function(symbol, method){
  this._handlers[symbol] = method;
};
Window_CircularCommand.prototype.callHandler = function(symbol){
  var h = this._handlers[symbol];
  if (h) h(); else SoundManager.playBuzzer();
};

Window_CircularCommand.prototype.makeCommandList = function(){
  this.addCommand("Attack","attack");
  this.addCommand("Defense","defense");
  this.addCommand("Techniques","techniques");
  this.addCommand("Items","item");
  this.addCommand("Verse Arts","verse");
};

Window_CircularCommand.prototype._createRing = function(){
  // aura behind ring
  this._aura = new PIXI.Graphics();
  this._container.addChild(this._aura);

  var g = new PIXI.Graphics();
  g.lineStyle(RADIAL_CFG.LINE_THICK, RADIAL_CFG.LINE_COLOR, RADIAL_CFG.LINE_ALPHA);
  g.beginFill(RADIAL_CFG.BG_COLOR, RADIAL_CFG.BG_ALPHA);
  g.drawCircle(0, 0, RADIAL_CFG.RADIUS * RADIAL_CFG.SCALE);
  g.endFill();
  var blur = new PIXI.filters.BlurFilter();
  blur.blur = 6;
  g.filters = [blur];
  this._ring = g;
  this._container.addChild(g);
};

Window_CircularCommand.prototype._createLabels = function(){
  this._labels = [];
  for (var i=0;i<this._list.length;i++){
    var cmd = this._list[i];
    var t = new PIXI.Text(cmd.name, {
      fontFamily:"GameFont",
      fontSize:18 * RADIAL_CFG.SCALE,
      fill:"#ffffff",
      fontWeight:"bold",
      align:"center"
    });
    t.anchor.set(0.5);
    t.interactive = true;
    t.buttonMode = true;
    (function(self, idx){
      t.on("pointerover", function(){ self._hoveredIndex = idx; });
      t.on("pointerout",  function(){ self._hoveredIndex = -1; });
      t.on("pointerdown", function(){ self._triggerCommand(idx); });
    })(this, i);
    this._labels.push(t);
    this._container.addChild(t);
  }
};

Window_CircularCommand.prototype.startOpen = function(battlerSprite, actorId){
  if (this.visible && this._container.visible && this._spinPhase !== 2 &&
      this._currentActorId === actorId) {
    this._battlerSprite = battlerSprite || this._battlerSprite;
    return;
  }
  this._currentActorId = actorId || 0;
  this._battlerSprite = battlerSprite || null;
  this.visible = true;
  this._container.visible = true;
  this._spinPhase = 1;
  this._angle = -Math.PI/2 - Math.PI;
  this._targetAngle = 0;
  this._activeIndex = 0;
  this._container.alpha = 0;
  this.activate();
};

Window_CircularCommand.prototype.startClose = function(){
  if (!this.visible || this._spinPhase === 2) return;
  this._spinPhase = 2;
  this._targetAngle = this._angle - Math.PI;
  this.deactivate();
};

Window_CircularCommand.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  this.opacity = 0; this.backOpacity = 0; this.contentsOpacity = 0;
  if (!this.visible) return;

  if (this._spinPhase === 1){
    this._angle = lerp(this._angle, this._targetAngle, 0.12);
    this._container.alpha = clamp((this._container.alpha || 0) + 0.12, 0, 1);
    if (Math.abs(this._angle - this._targetAngle) < 0.01){
      this._spinPhase = 0; this._container.alpha = 1;
    }
  } else if (this._spinPhase === 2){
    this._angle = lerp(this._angle, this._targetAngle, 0.12);
    this._container.alpha = clamp((this._container.alpha || 1) - 0.12, 0, 1);
    if (this._container.alpha <= 0){
      this._spinPhase = 0; this.visible = false;
      this._container.visible = false;
    }
  }

  this._updatePosition();
  this._updateLabels();
  this._updateAura();

  if (this.active && this._spinPhase === 0) this._handleInput();
};

Window_CircularCommand.prototype._updatePosition = function(){
  if (this._battlerSprite && this._battlerSprite.worldTransform){
    var p = this._battlerSprite.worldTransform;
    this._container.x = p.tx + RADIAL_CFG.CENTER_X_OFFSET * RADIAL_CFG.SCALE;
    this._container.y = p.ty + RADIAL_CFG.CENTER_Y_OFFSET * RADIAL_CFG.SCALE;
  } else {
    this._container.x = Graphics.width/2 + RADIAL_CFG.CENTER_X_OFFSET * RADIAL_CFG.SCALE;
    this._container.y = Graphics.height/2 + RADIAL_CFG.CENTER_Y_OFFSET * RADIAL_CFG.SCALE;
  }
};

Window_CircularCommand.prototype._updateLabels = function(){
  var R = RADIAL_CFG.RADIUS * RADIAL_CFG.SCALE;
  var layout = { 0:{x:0,y:0}, 1:{x:-R,y:0}, 2:{x:0,y:-R}, 3:{x:R,y:0}, 4:{x:0,y:R} };
  for (var i=0;i<this._labels.length;i++){
    var lbl = this._labels[i], p = layout[i];
    lbl.x = lerp(lbl.x||0, p.x, 0.25);
    lbl.y = lerp(lbl.y||0, p.y, 0.25);
    var color = "#ffffff";
    if (i === this._activeIndex) color = "#ffcc66";
    else if (i === this._hoveredIndex) color = "#ffeeaa";
    lbl.style.fill = color;
  }
};

Window_CircularCommand.prototype._updateAura = function(){
  if (!this._aura) return;
  var actor = this._currentActorId ? $gameActors.actor(this._currentActorId) : null;
  var color = null;
  if (actor && actor.isStateAffected){
    for (var sid in RADIAL_CFG.STATE_AURA_COLORS){
      if (actor.isStateAffected(Number(sid))){ color = RADIAL_CFG.STATE_AURA_COLORS[sid]; break; }
    }
  }
  this._aura.clear();
  if (color){
    var t = Graphics.frameCount * RADIAL_CFG.AURA_PULSE_SPEED;
    var a = 0.35 + 0.25 * (0.5 + 0.5*Math.sin(t));
    var RR = RADIAL_CFG.RADIUS * RADIAL_CFG.SCALE + 6;
    this._aura.lineStyle(RADIAL_CFG.AURA_THICK, color, a);
    this._aura.drawCircle(0,0,RR);
  }
};

Window_CircularCommand.prototype._handleInput = function(){
  var wasIndex = this._activeIndex;
  if (Input.isPressed('up'))         this._activeIndex = 2;
  else if (Input.isPressed('down'))  this._activeIndex = 4;
  else if (Input.isPressed('left'))  this._activeIndex = 1;
  else if (Input.isPressed('right')) this._activeIndex = 3;
  else if (!this._snapBack && wasIndex !== 0){ this._snapBack = true; this._snapProgress = 1.0; }

  if (Input.isTriggered('ok'))     this._triggerCommand(this._activeIndex);
  if (Input.isTriggered('cancel')) this.callHandler('cancel');

  if (this._snapBack){
    this._snapProgress = Math.max(0, this._snapProgress - 0.2);
    if (this._snapProgress <= 0){ this._snapBack = false; this._activeIndex = 0; }
  }
};

Window_CircularCommand.prototype._triggerCommand = function(i){
  var sym = (this._list[i] && this._list[i].symbol) || "";
  this.callHandler(sym);
};

/* -------------------- Scene_Battle glue -------------------- */
function findActorSprite(actor){
  var sc = SceneManager._scene;
  if (!sc || !sc._spriteset) return null;
  var list = sc._spriteset._actorSprites ||
             (sc._spriteset.battlerSprites && sc._spriteset.battlerSprites()) || [];
  for (var i=0;i<list.length;i++){
    if (list[i] && list[i]._battler === actor) return list[i];
  }
  return null;
}

var _createAll = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _createAll.call(this);

  // disable vanilla party command
  if (this._partyCommandWindow){
    var pw = this._partyCommandWindow;
    pw.deactivate(); pw.hide(); pw.close();
    pw.open = function(){}; pw.activate = function(){};
    pw.processHandling = pw.processOk = pw.processCancel = pw.processCursorMove = function(){};
  }

  // inert actor command to keep cores happy
  function Window_NullActorCommand(){ this.initialize.apply(this, arguments); }
  Window_NullActorCommand.prototype = Object.create(Window_ActorCommand.prototype);
  Window_NullActorCommand.prototype.constructor = Window_NullActorCommand;
  Window_NullActorCommand.prototype.initialize = function(){
    Window_ActorCommand.prototype.initialize.call(this);
    this.hide(); this.deactivate(); this.openness = 0;
  };
  Window_NullActorCommand.prototype.refresh = function(){ if (this.contents) this.contents.clear(); };
  Window_NullActorCommand.prototype.drawItem = function(){};
  Window_NullActorCommand.prototype.processHandling = function(){};
  Window_NullActorCommand.prototype.makeCommandList = function(){ this.clearCommandList(); };
  Window_NullActorCommand.prototype.setup = function(){ this.hide(); this.deactivate(); this.openness = 0; };

  this._actorCommandWindow = new Window_NullActorCommand();
  this.addWindow(this._actorCommandWindow);

  // radial
  this._noqCircularCmd = new Window_CircularCommand();
  this.addWindow(this._noqCircularCmd);

  // party ring (center-screen)
  this._noqPartyRing = new Window_NoQPartyRing();
  this.addWindow(this._noqPartyRing);

  var self = this;
  var w = this._noqCircularCmd;

  // base handlers
  w.setHandler('attack', this.commandAttack.bind(this));
  w.setHandler('item',   function(){ if (self.noqOpenItemList) self.noqOpenItemList(); else self.commandItem(); });

  // Verse = stype 1
  w.setHandler('verse', function(){
    if (self.noqOpenSkillList) self.noqOpenSkillList(RADIAL_CFG.STYPE_VERSE);
    else self.commandSkill(1);
  });

  // Techniques = stype 2 & 3
  w.setHandler('techniques', function(){
    if (self.noqOpenSkillList) self.noqOpenSkillList(RADIAL_CFG.STYPE_TECHS);
    else if (self.commandTechniques) self.commandTechniques(); else self.commandSkill(2);
  });

  // Defense (list stype 4) or fallback to guard
  w.setHandler('defense', function(){
    if (self.noqOpenSkillList) self.noqOpenSkillList(RADIAL_CFG.STYPE_DEFEND);
    else if (self.commandGuard) self.commandGuard(); else self.commandDefense();
  });

  // Cancel → Party Ring (center)
  w.setHandler('cancel', function(){
    self._noqPartyRing.startOpenCenter();
    Input.clear();
  });

  // Party ring handlers
  this._noqPartyRing.setHandlers({
    fight:  function(){ self._noqPartyRing.startClose();
      var a = BattleManager.actor && BattleManager.actor();
      if (a && self._noqCircularCmd) self._noqCircularCmd.startOpen(findActorSprite(a), a.actorId());
    },
    escape: function(){ self._noqPartyRing.startClose(); if (self.commandEscape) self.commandEscape(); else BattleManager.processEscape(); },
    cancel: function(){ self._noqPartyRing.startClose();
      var a = BattleManager.actor && BattleManager.actor();
      if (a && self._noqCircularCmd) self._noqCircularCmd.startOpen(findActorSprite(a), a.actorId());
    }
  });
};

Scene_Battle.prototype.startActorCommandSelection = function(){
  var actor = BattleManager.actor();
  if (!actor) return;
  this._statusWindow.select(actor.index());
  this._statusWindow.show();
  this._statusWindow.activate();
  var sp = findActorSprite(actor);
  if (this._noqCircularCmd) this._noqCircularCmd.startOpen(sp, actor.actorId());
};

/* Keep-open / close guards */
(function(){
  function openForActorIfNeeded(scene){
    var rad = scene._noqCircularCmd, actor = BattleManager.actor && BattleManager.actor();
    if (!rad || !actor) return;
    if (!rad.visible || rad._currentActorId !== actor.actorId()){
      rad.startOpen(findActorSprite(actor), actor.actorId());
    }
  }
  function closeIfOpen(scene){
    var rad = scene._noqCircularCmd;
    if (rad) rad.startClose();
  }

  var _changeInputWindow = Scene_Battle.prototype.changeInputWindow;
  Scene_Battle.prototype.changeInputWindow = function(){
    if (_changeInputWindow) _changeInputWindow.call(this);
    if (BattleManager.actor()) openForActorIfNeeded(this);
    else                       closeIfOpen(this);
  };

  var _BM_next = BattleManager.selectNextCommand;
  BattleManager.selectNextCommand = function(){
    var r = _BM_next.call(this);
    var sc = SceneManager._scene;
    if (sc && this.actor()) openForActorIfNeeded(sc);
    return r;
  };
  var _BM_prev = BattleManager.selectPreviousCommand;
  BattleManager.selectPreviousCommand = function(){
    var r = _BM_prev.call(this);
    var sc = SceneManager._scene;
    if (sc && this.actor()) openForActorIfNeeded(sc);
    else if (sc)            closeIfOpen(sc);
    return r;
  };

  var _SB_update = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function(){
    _SB_update.call(this);

    // burnout smoke ping on actors with burnout state
    var BO = (window.UBS && UBS.DEFAULT_BURNOUT_STATE_ID) || 17;
    var actors = $gameParty.members();
    for (var i=0;i<actors.length;i++){
      var b = actors[i]; if (!b) continue;
      if (!b._noqSmokeTick) b._noqSmokeTick = 0;
      if (b.isStateAffected && b.isStateAffected(BO)){
        b._noqSmokeTick++;
        if (b._noqSmokeTick >= RADIAL_CFG.SMOKE_INTERVAL){
          b._noqSmokeTick = 0;
          try { b.startAnimation(RADIAL_CFG.SMOKE_ANIM_ID, false, 0); } catch(e){}
        }
      } else {
        b._noqSmokeTick = 0;
      }
    }
  };
})();

/* -------------------- Mini list (opaque BG + EN costs) -------------------- */
if (typeof Window_NoQList !== 'undefined'){
  var P = Window_NoQList.prototype;

  P.setContext = function(kind, actor){ this._kind = kind; this._actorForCosts = actor||null; };

  function skillEnCost(actor, skill){
    if (!actor || !skill) return 0;
    var saved = null, cleared = false, cost = 0;
    try{
      if (actor._noqReserve != null){ saved = actor._noqReserve; actor._noqReserve = null; cleared = true; }
      cost = Math.round(typeof actor.skillMpCost==='function' ? actor.skillMpCost(skill)
                                                              : (skill.mpCost||skill.mp||0));
    } catch(e){ cost = Math.round(skill.mpCost||skill.mp||0); }
    finally { if (cleared) actor._noqReserve = saved; }
    return cost;
  }
  function dbName(obj){
    if (!obj) return '';
    try { if (typeof obj.name === 'string') return obj.name; if (typeof obj.name === 'function') return obj.name(); }catch(e){}
    return String(obj.name || '');
  }

  var _refresh = P.refresh;
  P.refresh = function(){
    if (!this.contents) return;
    this.contents.clear();

    // OPAQUE background panel
    try{
      var ctx = this.contents._context;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,' + RADIAL_CFG.LIST_BG_OPACITY + ')';
      ctx.fillRect(0, 0, this.contents.width, this.contents.height);
      ctx.restore();
      this.contents._setDirty();
    }catch(e){}

    this.contents.fontSize = (typeof window.FONT_SIZE !== 'undefined') ? window.FONT_SIZE : 18;
    var rowH = RADIAL_CFG.LIST_ROW_H;
    var actor = this._actorForCosts || (BattleManager.actor && BattleManager.actor());
    var kind  = this._kind || 'skill';
    var top   = this._topRow||0, idx=this._index||0;

    for (var r=0; r<this.maxRows(); r++){
      var i = top + r; if (!this._items || i >= this._items.length) break;
      var it = this._items[i]; var y = 6 + r*rowH;

      // selection highlight
      if (i===idx){
        try{
          var c2=this.contents._context;
          c2.save(); c2.fillStyle='rgba(255,204,102,0.25)';
          c2.fillRect(0,y-4,this.width,rowH); c2.restore(); this.contents._setDirty();
        }catch(e){}
      }

      // icon + name
      var icon=(it && it.iconIndex)|0;
      if (icon>0) this.drawIcon(icon, 4, y-2);
      var nameX = 4 + 32 + 6;
      this.resetTextColor();
      this.drawText(dbName(it), nameX, y, this.width - nameX - 74);

      // right-side info
      if (kind==='skill'){
        var en = skillEnCost(actor, it);
        this.changeTextColor('#ffffff');
        this.drawText('EN ' + en, this.width - 70, y, 66, 'right');
      } else {
        var n = ($gameParty && $gameParty.numItems) ? $gameParty.numItems(it) : 0;
        this.changeTextColor('#ffffff');
        this.drawText('x' + n, this.width - 48, y, 44, 'right');
      }
    }
  };
}

/* -------------------- List openers (anchored) -------------------- */
if (Scene_Battle){
  function miniListAnchor(scene, actor){
    var sp = findActorSprite(actor, scene);
    var x = Graphics.width/2 + RADIAL_CFG.CENTER_X_OFFSET * RADIAL_CFG.SCALE;
    var y = Graphics.height/2 + RADIAL_CFG.CENTER_Y_OFFSET * RADIAL_CFG.SCALE;
    if (sp && sp.worldTransform){
      x = sp.worldTransform.tx + RADIAL_CFG.LIST_X_OFFSET;
      y = sp.worldTransform.ty + RADIAL_CFG.LIST_Y_OFFSET;
    }
    return {x:x, y:y};
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
  function toArr(x){ return Array.isArray(x) ? x : [x]; }

  Scene_Battle.prototype.noqOpenSkillList = function(stypeIds){
    hardHideRadial(this);
    var a = BattleManager.actor(); if (!a) return;

    var allow = {}; toArr(stypeIds).forEach(function(id){ allow[id]=true; });
    var list = a.skills().filter(function(s){ return allow[s.stypeId] && a.canUse(s); });
    if (!list.length){ SoundManager.playBuzzer(); reopenRadial(this); return; }
    for (var i=0;i<list.length;i++){ list[i].__kind = 'skill'; }

    if (this._noqMiniList && this._noqMiniList.setContext){
      this._noqMiniList.setContext('skill', a);
      var c = miniListAnchor(this, a);
      this._noqMiniList.start(list, c.x, c.y);
      Input.clear();
    } else {
      this.commandSkill((toArr(stypeIds)[0]) || 1); // fallback
    }
  };

  Scene_Battle.prototype.noqOpenItemList = function(){
    hardHideRadial(this);
    var a = BattleManager.actor(); if (!a) return;

    var list = $gameParty.items().filter(function(it){ return $gameParty.numItems(it) > 0 && a.canUse(it); });
    if (!list.length){ SoundManager.playBuzzer(); reopenRadial(this); return; }
    for (var i=0;i<list.length;i++){ list[i].__kind = 'item'; }

    if (this._noqMiniList && this._noqMiniList.setContext){
      this._noqMiniList.setContext('item', a);
      var c = miniListAnchor(this, a);
      this._noqMiniList.start(list, c.x, c.y);
      Input.clear();
    } else {
      this.commandItem(); // fallback
    }
  };
}

/* -------------------- Party Ring -------------------- */
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

  var R = 100;
  var g = new PIXI.Graphics();
  g.lineStyle(2, 0xffffff, 0.25);
  g.beginFill(0x000000, 0.35); g.drawCircle(0,0,R); g.endFill();
  this._container.addChild(g);

  this._labels = {};
  var mk = (name,y)=>{ var t=new PIXI.Text(name,{fontFamily:'GameFont',fontSize:22,fill:'#ffffff',fontWeight:'bold'}); t.anchor.set(0.5); t.y=y; this._container.addChild(t); return t; };
  this._labels.fight  = mk('Fight',   -6);
  this._labels.escape = mk('Escape',   R-26);
  this._focus = 'fight';
};
Window_NoQPartyRing.prototype.setHandlers = function(h){ this._handlers=h||{}; };
Window_NoQPartyRing.prototype.startOpenCenter = function(){
  this.visible=true; this.active=true;
  this._container.visible=true; this._container.alpha=0;
  this._container.x = Graphics.width/2;
  this._container.y = Graphics.height/2;
  this._focus = 'fight';
};
Window_NoQPartyRing.prototype.startClose = function(){
  this.active=false; this.visible=false; this._container.visible=false; this._container.alpha=0;
};
Window_NoQPartyRing.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  if (!this.visible) return;
  if (this._container.alpha < 1) this._container.alpha = Math.min(1, this._container.alpha + 0.15);
  if (!this.active) return;

  if (Input.isTriggered('down')) this._focus = 'escape';
  if (Input.isTriggered('up'))   this._focus = 'fight';
  if (Input.isTriggered('ok'))   { SoundManager.playOk(); var f=this._handlers[this._focus]; if (f) f(); }
  if (Input.isTriggered('cancel')){ SoundManager.playCancel(); var c=this._handlers.cancel; if (c) c(); }

  for (var k in this._labels){ this._labels[k].style.fill = (k===this._focus ? '#ffcc66' : '#ffffff'); }
};

})();