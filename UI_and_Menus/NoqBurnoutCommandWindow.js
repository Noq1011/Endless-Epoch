/*:
 * @target MV
 * @plugindesc (MV, ES5) Circular Command v20 — Fixed Targeting & Handler Flow
 * @author Noq + Tyson (Fixed by Claude)
 */

(function(){
'use strict';

var UI = typeof EX_UI !== 'undefined' ? EX_UI : { scaleX: function(){ return 1; }, scaleY: function(){ return 1; } };
function scaled(val) { return val * UI.scaleX(); }

window._Noq_PassiveMouseX = 0;
window._Noq_PassiveMouseY = 0;
document.addEventListener('mousemove', function(event) {
  if (Graphics && Graphics.pageToCanvasX) {
    window._Noq_PassiveMouseX = Graphics.pageToCanvasX(event.pageX);
    window._Noq_PassiveMouseY = Graphics.pageToCanvasY(event.pageY);
  }
});

var RADIAL_CFG = {
  CENTER_X_OFFSET : -140, CENTER_Y_OFFSET : -30,
  RADIUS : 80,
  SATELLITE_RADIUS: 65, // Smaller than main orb
  SATELLITE_X_OFFSET: 180 
};

function lerp(a,b,t){ return a + (b-a)*t; }

/* ---------------- Common Orb Logic ---------------- */
function setupLavaVisuals(target, radius, container) {
    var mask = new PIXI.Graphics();
    mask.beginFill(0xffffff); mask.drawCircle(0, 0, radius); mask.endFill();
    container.addChild(mask);
    container.mask = mask;

    var bg = new PIXI.Graphics();
    bg.beginFill(0x020210); bg.drawCircle(0, 0, radius); bg.endFill();
    container.addChild(bg);

    var breathBmp = new Bitmap(radius * 2, radius * 2);
    var bCtx = breathBmp._context;
    var bGrad = bCtx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    bGrad.addColorStop(0, 'rgba(120, 40, 255, 0.9)'); bGrad.addColorStop(1, 'rgba(80, 0, 200, 0)');
    bCtx.fillStyle = bGrad; bCtx.beginPath(); bCtx.arc(radius, radius, radius, 0, Math.PI*2); bCtx.fill();
    target._breathingCore = new Sprite(breathBmp);
    target._breathingCore.anchor.set(0.5); target._breathingCore.blendMode = 1; target._breathingCore.alpha = 0;
    container.addChild(target._breathingCore);

    target._lavaGroup = new PIXI.Container();
    container.addChild(target._lavaGroup);

    target._orbs = [];
    var orbConfigs = [
        { type: 'hp', c1: '#00ffee', c2: 'rgba(0,100,150,0)', startX: 20, startY: 10 },    
        { type: 'mp', c1: '#44aaff', c2: 'rgba(0,30,200,0)', startX: -15, startY: -15 },   
        { type: 'tp', c1: '#ffaa44', c2: 'rgba(150,0,255,0)', startX: -5, startY: 20 }   
    ];
    for (var i = 0; i < 3; i++) {
        var cfg = orbConfigs[i];
        var orbBmp = new Bitmap(radius*2, radius*2);
        var ctx = orbBmp._context;
        var grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius*0.8);
        grad.addColorStop(0, cfg.c1); grad.addColorStop(1, cfg.c2);
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(radius, radius, radius, 0, Math.PI*2); ctx.fill();
        var sprite = new Sprite(orbBmp);
        sprite.anchor.set(0.5); sprite.x = scaled(cfg.startX); sprite.y = scaled(cfg.startY);
        sprite.blendMode = 1; 
        target._lavaGroup.addChild(sprite);
        target._orbs.push({ sprite: sprite, type: cfg.type, baseX: sprite.x, baseY: sprite.y });
    }

    var border = new PIXI.Graphics();
    border.lineStyle(2, 0xffffff, 0.25);
    border.drawCircle(0, 0, radius);
    target.addChild(border); 
    target._glassBorder = border;
}

function updateLavaAnimation(target, actorId) {
    var actor = $gameActors.actor(actorId);
    if (!actor) return;
    var hpRate = actor.hp / actor.mhp;
    var mpRate = actor.mmp > 0 ? (actor.mp / actor.mmp) : 0;
    var burnout = (actor.tp || 0) / 100; 
    var time = Date.now();
    if (target._glassBorder) target._glassBorder.alpha = 0.15 + (Math.sin(time/1000) * 0.1);
    if (burnout > 0) {
        var breathSpeed = time / (800 - (burnout * 500)); 
        var pulse = (Math.sin(breathSpeed) + 1) / 2;
        target._breathingCore.alpha = burnout * 0.7 * pulse;
        target._breathingCore.scale.x = target._breathingCore.scale.y = 0.2 + (pulse * (0.5 + burnout * 0.8));
    } else { target._breathingCore.alpha = 0; }
    target._lavaGroup.rotation -= (0.01 + (burnout * 0.03));
    for (var i = 0; i < target._orbs.length; i++) {
        var orb = target._orbs[i];
        var urgencyRate = (orb.type === 'hp') ? 1-hpRate : (orb.type==='mp' ? 1-mpRate : burnout);
        var offset = time / (700 - (urgencyRate * 450)); 
        var wobbleDist = 5 + (20 * urgencyRate);
        orb.sprite.x = orb.baseX + Math.sin(offset + i) * wobbleDist;
        orb.sprite.y = orb.baseY + Math.cos(offset + i) * wobbleDist;
        orb.sprite.alpha = 0.4 + (0.6 * urgencyRate);
    }
}

/* ---------------- Window_CircularCommand ---------------- */
function Window_CircularCommand(){ this.initialize.apply(this, arguments); }
window.Window_CircularCommand = Window_CircularCommand;
Window_CircularCommand.prototype = Object.create(Window_Base.prototype);
Window_CircularCommand.prototype.constructor = Window_CircularCommand;

Window_CircularCommand.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, Graphics.boxWidth, Graphics.boxHeight);
  this.opacity = 0; this.visible = false;
  this._list = [{name:"ATTACK",symbol:"attack"},{name:"DEFENSE",symbol:"defense"},{name:"TECHS",symbol:"techniques"},{name:"ITEMS",symbol:"item"},{name:"VERSE",symbol:"verse"}];
  this._handlers = {}; this._activeIndex = 0; this._currentActorId = 0; this._spinPhase = 0;
  this._container = new PIXI.Container(); 
  this._container.alpha = 0; 
  this.addChild(this._container);
  setupLavaVisuals(this, scaled(RADIAL_CFG.RADIUS), this._container);
  this._createWrappedLabels();
};

Window_CircularCommand.prototype._createWrappedLabels = function() {
    this._labelContainers = [];
    for (var i = 0; i < this._list.length; i++) {
        var cont = new PIXI.Container();
        var name = this._list[i].name;
        if (i === 0) { this._buildArcText(cont, name, 0); } 
        else if (i === 1) { this._buildArcText(cont, name, 1); cont.rotation = -Math.PI/2; } 
        else if (i === 2) { this._buildArcText(cont, name, 1); } 
        else if (i === 3) { this._buildArcText(cont, name, 1); cont.rotation = Math.PI/2; } 
        else if (i === 4) { this._buildArcText(cont, name, -1); }
        this._labelContainers.push(cont); this.addChild(cont);
    }
};

Window_CircularCommand.prototype._buildArcText = function(container, text, curveDir) {
    var chars = text.split("");
    var fontSize = Math.round(18 * UI.scaleX());
    for (var i = 0; i < chars.length; i++) {
        var t = new PIXI.Text(chars[i], {fontFamily: "GameFont", fontSize: fontSize, fontStyle: 'italic', fontWeight: '900', fill: "#ccffff", stroke: '#002244', strokeThickness: 3});
        t.anchor.set(0.5); var relPos = (i - (chars.length - 1) / 2); t.x = relPos * (fontSize * 0.7);
        if (curveDir !== 0) { var arc = relPos * 0.22; t.y = Math.pow(arc, 2) * 22 * curveDir; t.rotation = arc * curveDir; }
        container.addChild(t);
    }
};

Window_CircularCommand.prototype.update = function() {
    Window_Base.prototype.update.call(this);
    if (!this.visible) return;
    if (this._spinPhase === 1) this._container.alpha = Math.min(1, this._container.alpha + 0.1);
    else if (this._spinPhase === 2) { 
        this._container.alpha = Math.max(0, this._container.alpha - 0.1); 
        if (this._container.alpha <= 0) { 
            this.visible = false;
            this._spinPhase = 0;
        }
    }
    this._updatePosition();
    updateLavaAnimation(this, this._currentActorId);
    this._updateLabelLayout();
    if (this.active) this._handleInput();
};

Window_CircularCommand.prototype._updateLabelLayout = function() {
    var R = scaled(RADIAL_CFG.RADIUS + 15);
    var layout = [{x:0,y:0,s:1.3},{x:-R,y:0,s:0.9},{x:0,y:-R,s:0.9},{x:R,y:0,s:0.9},{x:0,y:R,s:0.9}];
    for (var i = 0; i < this._labelContainers.length; i++) {
        var cont = this._labelContainers[i]; var dest = layout[i];
        cont.x = this._container.x + dest.x; cont.y = this._container.y + dest.y;
        var targetScale = (i === this._activeIndex) ? dest.s * 1.3 : dest.s;
        cont.scale.x = cont.scale.y = lerp(cont.scale.x, targetScale, 0.2);
        var isSel = (i === this._activeIndex); var mainCol = isSel ? "#ffff44" : "#ccffff";
        cont.children.forEach(function(char){ char.style.fill = mainCol; char.alpha = isSel ? 1.0 : 0.7; });
    }
};

Window_CircularCommand.prototype._updatePosition = function(){
  if (this._battlerSprite){
    var p = this._battlerSprite.getGlobalPosition ? this._battlerSprite.getGlobalPosition() : {x: this._battlerSprite.x, y: this._battlerSprite.y};
    this._container.x = p.x + scaled(RADIAL_CFG.CENTER_X_OFFSET);
    this._container.y = p.y + scaled(RADIAL_CFG.CENTER_Y_OFFSET);
    if (this._glassBorder) { this._glassBorder.x = this._container.x; this._glassBorder.y = this._container.y; }
  }
};

Window_CircularCommand.prototype.setHandler = function(sym, method){ this._handlers[sym] = method; };
Window_CircularCommand.prototype.callHandler = function(sym){ if(this._handlers[sym]) this._handlers[sym](); };
Window_CircularCommand.prototype.activate = function() { 
    Window_Base.prototype.activate.call(this);
    this.active = true;
};
Window_CircularCommand.prototype.deactivate = function() {
    Window_Base.prototype.deactivate.call(this);
    this.active = false;
};
Window_CircularCommand.prototype.startOpen = function(sp, id){ 
    this._battlerSprite = sp; this._currentActorId = id; this.visible = true; this._spinPhase = 1; this.activate(); 
};
Window_CircularCommand.prototype.startClose = function(){ this._spinPhase = 2; this.deactivate(); };

Window_CircularCommand.prototype._handleInput = function(){
  var mx = window._Noq_PassiveMouseX; var my = window._Noq_PassiveMouseY; var hoveredIdx = -1;
  for (var i = 0; i < this._labelContainers.length; i++){
    var lbl = this._labelContainers[i]; var dx = mx - lbl.x; var dy = my - lbl.y;
    var hitRadius = (i === 0) ? scaled(45) : scaled(35); if (dx*dx + dy*dy <= hitRadius*hitRadius) { hoveredIdx = i; break; }
  }
  if (hoveredIdx !== -1 && hoveredIdx !== this._hoveredIndex) SoundManager.playCursor();
  if (hoveredIdx !== -1) this._activeIndex = hoveredIdx; this._hoveredIndex = hoveredIdx;
  if (Input.isTriggered('ok') || (TouchInput.isTriggered() && hoveredIdx !== -1)){ SoundManager.playOk(); this.callHandler(this._list[this._activeIndex].symbol); }
  if (Input.isTriggered('cancel') || TouchInput.isCancelled()) { SoundManager.playCancel(); this.callHandler('cancel'); }
};

/* ---------------- Window_CircularList (Satellite Orb) ---------------- */
function Window_CircularList(){ this.initialize.apply(this, arguments); }
window.Window_CircularList = Window_CircularList;
Window_CircularList.prototype = Object.create(Window_Selectable.prototype);
Window_CircularList.prototype.constructor = Window_CircularList;

Window_CircularList.prototype.initialize = function(x, y, w, h) {
    Window_Selectable.prototype.initialize.call(this, 0, 0, Graphics.boxWidth, Graphics.boxHeight);
    this.opacity = 0; this.contentsOpacity = 0; this.visible = false;
    this._container = new PIXI.Container(); this._container.alpha = 0; this.addChild(this._container);
    setupLavaVisuals(this, scaled(RADIAL_CFG.SATELLITE_RADIUS), this._container);
    this._textContainer = new PIXI.Container(); this.addChild(this._textContainer);
};

Window_CircularList.prototype.item = function() { return this._data && this._data[this.index()] ? this._data[this.index()] : null; };
Window_CircularList.prototype.setActor = function(actor) { this._actor = actor; this.refresh(); };
Window_CircularList.prototype.maxItems = function() { return this._data ? this._data.length : 0; };
Window_CircularList.prototype.refresh = function() {
    this._data = this.makeItemList ? this.makeItemList() : [];
    this._textContainer.removeChildren(); this._labels = [];
    var fontSize = Math.round(18 * UI.scaleX());
    for (var i = 0; i < this._data.length; i++) {
        var item = this._data[i];
        var txt = new PIXI.Text(item ? item.name.toUpperCase() : "", {fontFamily: "GameFont", fontSize: fontSize, fill: "#ccffff", stroke: '#002244', strokeThickness: 3});
        txt.anchor.set(0.5); txt.alpha = 0; this._textContainer.addChild(txt); this._labels.push(txt);
    }
};

Window_CircularList.prototype.update = function() {
    Window_Selectable.prototype.update.call(this);
    if (this.active) { this.visible = true; this._container.alpha = Math.min(1, this._container.alpha + 0.1); } 
    else { this._container.alpha = Math.max(0, this._container.alpha - 0.1); if (this._container.alpha <= 0) this.visible = false; }
    if (this.visible) { this._updateSatellitePosition(); updateLavaAnimation(this, this._actor ? this._actor.actorId() : 0); this._updateListVisuals(); }
};

Window_CircularList.prototype._updateSatellitePosition = function() {
    var parent = SceneManager._scene._noqCircularCmd._container;
    if (!parent) return;
    this._container.x = parent.x + scaled(RADIAL_CFG.SATELLITE_X_OFFSET);
    this._container.y = parent.y;
    if (this._glassBorder) { this._glassBorder.x = this._container.x; this._glassBorder.y = this._container.y; }
};

Window_CircularList.prototype._updateListVisuals = function() {
    var spacing = 35;
    for (var i = 0; i < this._labels.length; i++) {
        var label = this._labels[i]; var diff = i - this.index();
        label.x = this._container.x; var targetY = this._container.y + (diff * spacing);
        label.y = lerp(label.y || targetY, targetY, 0.2);
        var dist = Math.abs(diff);
        label.alpha = Math.max(0, 1.0 - (dist * 0.4)) * this._container.alpha;
        label.scale.x = label.scale.y = lerp(label.scale.x, (dist === 0 ? 1.1 : 0.7), 0.2);
        label.style.fill = (dist === 0) ? "#ffff44" : "#ccffff";
    }
};

// --- SKILL WINDOW ---
function Window_BattleSkillCircular() { this.initialize.apply(this, arguments); }
window.Window_BattleSkillCircular = Window_BattleSkillCircular;
Window_BattleSkillCircular.prototype = Object.create(Window_CircularList.prototype);
Window_BattleSkillCircular.prototype.constructor = Window_BattleSkillCircular;
Window_BattleSkillCircular.prototype.setStypeId = function(stypeId) { 
    this._stypeId = stypeId; 
    this.refresh(); 
    this.select(0); 
};
Window_BattleSkillCircular.prototype.makeItemList = function() {
    if (!this._actor) return [];
    var stype = this._stypeId;
    return this._actor.skills().filter(function(s) {
        if (Array.isArray(stype)) return stype.indexOf(s.stypeId) !== -1;
        return s.stypeId === stype;
    });
};

// --- ITEM WINDOW ---
function Window_BattleItemCircular() { this.initialize.apply(this, arguments); }
window.Window_BattleItemCircular = Window_BattleItemCircular;
Window_BattleItemCircular.prototype = Object.create(Window_CircularList.prototype);
Window_BattleItemCircular.prototype.constructor = Window_BattleItemCircular;
Window_BattleItemCircular.prototype.makeItemList = function() { return $gameParty.allItems().filter(function(i){ return i.itypeId === 1; }); };

/* -------------------- Scene_Battle -------------------- */
var _createAll = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _createAll.call(this);
  this._noqCircularCmd = new Window_CircularCommand();
  this.addWindow(this._noqCircularCmd);

  this._skillWindow = new Window_BattleSkillCircular();
  this.addWindow(this._skillWindow);

  this._itemWindow = new Window_BattleItemCircular();
  this.addWindow(this._itemWindow);
};

Scene_Battle.prototype.startActorCommandSelection = function(){
  var actor = BattleManager.actor(); if (!actor) return;
  var sp = null; var sprites = this._spriteset._actorSprites;
  for (var i=0; i<sprites.length; i++) { if (sprites[i]._battler === actor) sp = sprites[i]; }
  this._noqCircularCmd.startOpen(sp, actor.actorId());
};

var _changeInput = Scene_Battle.prototype.changeInputWindow;
Scene_Battle.prototype.changeInputWindow = function(){
  _changeInput.call(this); if (!BattleManager.actor()) this._noqCircularCmd.startClose();
};

})();
