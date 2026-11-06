/*:
 * @target MV
 * @plugindesc (MV, ES5) Circular Command + Full Mouse/Keyboard Support
 * @author Noq + Tyson (Fixed by Claude)
 */

(function(){
'use strict';

// --- CONFIGURATION (Adjust IDs here) ---
var TECH_TYPE_IDS = [2, 3]; // IDs of your Tech skill types
var VERSE_TYPE_ID = 1;      // ID of your Verse skill types
var DEFENSE_TYPE_IDS = 4; // ID of Defensive skill types

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
  SATELLITE_RADIUS: 65, 
  SATELLITE_X_OFFSET: 180 
};

function lerp(a,b,t){ return a + (b-a)*t; }

/* ---------------- Common Orb Logic ---------------- */

// Reticles use this (highly glassy)
function createGlassyOrb(radius, color1, color2) {
    var bmp = new Bitmap(radius * 2, radius * 2);
    var ctx = bmp._context;
    
    var grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius * 0.9);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(radius, radius, radius * 0.9, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(radius * 0.6, radius * 0.5, radius * 0.25, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(radius, radius, radius * 0.85, 0, Math.PI * 2);
    ctx.stroke();

    var sprite = new Sprite(bmp);
    sprite.anchor.set(0.5);
    return sprite;
}

function setupLavaVisuals(target, radius, container) {
    target._radius = radius; // Store for the orbit animation

    var mask = new PIXI.Graphics();
    mask.beginFill(0xffffff); mask.drawCircle(0, 0, radius); mask.endFill();
    container.addChild(mask);
    container.mask = mask;

    var bg = new PIXI.Graphics();
    bg.beginFill(0x020210); bg.drawCircle(0, 0, radius); bg.endFill();
    container.addChild(bg);

    // --- NEW: STAR LAYER ---
    target._starGroup = new PIXI.Container();
    container.addChild(target._starGroup);
    target._stars = [];
    for (var s = 0; s < 45; s++) { // Creates 45 stars
        var star = new PIXI.Graphics();
        var size = Math.random() < 0.5 ? 1 : 2; // 1 or 2 pixels
        star.beginFill(0xffffff, Math.random() * 0.5 + 0.3); // Varied brightness
        star.drawRect(0, 0, size, size);
        star.endFill();
        
        star.x = (Math.random() - 0.5) * radius * 2;
        star.y = (Math.random() - 0.5) * radius * 2;
        star._speed = (Math.random() * 0.4) + 0.1; // Varied horizontal speed
        target._starGroup.addChild(star);
        target._stars.push(star);
    }

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
    border.lineStyle(4, 0xffffff, 0.6);
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
        var wobbleDist = 8 + (20 * urgencyRate);
        orb.sprite.x = orb.baseX + Math.sin(offset + i) * wobbleDist;
        orb.sprite.y = orb.baseY + Math.cos(offset + i) * wobbleDist;
        orb.sprite.alpha = 0.4 + (0.6 * urgencyRate);
    }

    // --- NEW: STAR ORBIT ---
    if (target._stars && target._radius) {
        for (var j = 0; j < target._stars.length; j++) {
            var star = target._stars[j];
            star.x += star._speed;
            
            // Wrap around globe
            if (star.x > target._radius) {
                star.x = -target._radius;
                star.y = (Math.random() - 0.5) * target._radius * 2; // Randomize new height
            }
        }
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
    
    if (this._spinPhase === 1) {
        this._container.alpha = Math.min(1, this._container.alpha + 0.1);
    } else if (this._spinPhase === 2) { 
        this._container.alpha = Math.max(0, this._container.alpha - 0.1); 
        if (this._container.alpha <= 0) { 
            this.visible = false; 
            this._spinPhase = 0; 
        }
    }
    
    if (!this.visible) return;
    
    this._updatePosition();
    updateLavaAnimation(this, this._currentActorId);
    this._updateLabelLayout();
    
    if (this.active) {
        this._handleInput();
    }
};

Window_CircularCommand.prototype._updateLabelLayout = function() {
    var R = scaled(RADIAL_CFG.RADIUS + 15);
    var layout = [{x:0,y:0,s:1.3},{x:-R,y:0,s:0.9},{x:0,y:-R,s:0.9},{x:R,y:0,s:0.9},{x:0,y:R,s:0.9}];
    
    // Check if the actor is burned out (State 17) or Verse is sealed
    var actor = $gameActors.actor(this._currentActorId);
    var isVerseSealed = actor ? (actor.isStateAffected(17) || actor.isSkillTypeSealed(VERSE_TYPE_ID)) : false;

    for (var i = 0; i < this._labelContainers.length; i++) {
        var cont = this._labelContainers[i]; var dest = layout[i];
        cont.x = this._container.x + dest.x; cont.y = this._container.y + dest.y;
        var targetScale = (i === this._activeIndex) ? dest.s * 1.3 : dest.s;
        cont.scale.x = cont.scale.y = lerp(cont.scale.x, targetScale, 0.2);
        
        var isSel = (i === this._activeIndex); 
        var mainCol = isSel ? "#ffff44" : "#ccffff";
        var alphaBase = isSel ? 1.0 : 0.7;

        // Apply visual lock to Verse
        if (this._list[i].symbol === 'verse' && isVerseSealed) {
            mainCol = "#777777"; // Greyed out color
            alphaBase = isSel ? 0.7 : 0.4;
        }

        cont.children.forEach(function(char){ char.style.fill = mainCol; char.alpha = alphaBase; });
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
Window_CircularCommand.prototype.activate = function() { Window_Base.prototype.activate.call(this); this.active = true; };
Window_CircularCommand.prototype.deactivate = function() { Window_Base.prototype.deactivate.call(this); this.active = false; };
Window_CircularCommand.prototype.startOpen = function(sp, id){ this._battlerSprite = sp; this._currentActorId = id; this.visible = true; this._spinPhase = 1; this.activate(); };
Window_CircularCommand.prototype.startClose = function(){ this._spinPhase = 2; this.deactivate(); };

Window_CircularCommand.prototype._handleInput = function(){
    if (!this.visible || !this.active) return;

    var scene = SceneManager._scene;
    if (scene._circularSkillWindow && scene._circularSkillWindow.active) return;
    if (scene._circularItemWindow && scene._circularItemWindow.active) return;

    var lastIndex = this._activeIndex;

    // --- RADIAL KEYBOARD NAVIGATION ---
    if (Input.isRepeated('left')) {
        if (this._activeIndex === 0) this._activeIndex = 1;
        else if (this._activeIndex === 3) this._activeIndex = 0;
    } else if (Input.isRepeated('up')) {
        if (this._activeIndex === 0) this._activeIndex = 2;
        else if (this._activeIndex === 4) this._activeIndex = 0;
    } else if (Input.isRepeated('right')) {
        if (this._activeIndex === 0) this._activeIndex = 3;
        else if (this._activeIndex === 1) this._activeIndex = 0;
    } else if (Input.isRepeated('down')) {
        if (this._activeIndex === 0) this._activeIndex = 4;
        else if (this._activeIndex === 2) this._activeIndex = 0;
    }

    // MOUSE HOVER
    var mx = window._Noq_PassiveMouseX; 
    var my = window._Noq_PassiveMouseY; 
    var hoveredIdx = -1;
    
    for (var i = 0; i < this._labelContainers.length; i++){
        var lbl = this._labelContainers[i]; 
        var dx = mx - lbl.x; 
        var dy = my - lbl.y;
        var hitRadius = (i === 0) ? scaled(45) : scaled(35); 
        if (dx*dx + dy*dy <= hitRadius*hitRadius) { 
            hoveredIdx = i; 
            break; 
        }
    }

    if (hoveredIdx !== -1) {
        if (hoveredIdx !== this._activeIndex) {
            this._activeIndex = hoveredIdx;
            if (lastIndex !== this._activeIndex) SoundManager.playCursor();
        }
    } else if (lastIndex !== this._activeIndex) {
        SoundManager.playCursor();
    }

    // OK TRIGGER
    if (Input.isTriggered('ok') || (TouchInput.isTriggered() && hoveredIdx !== -1)){ 
        var symbol = this._list[this._activeIndex].symbol;
        var actor = $gameActors.actor(this._currentActorId);
        
        // Block Verse selection if Burnout State 17 is active or trait is sealed
        if (symbol === 'verse' && actor && (actor.isStateAffected(17) || actor.isSkillTypeSealed(VERSE_TYPE_ID))) {
            SoundManager.playBuzzer();
            return;
        }

        SoundManager.playOk(); 
        this.callHandler(symbol); 
    }
    
    // CANCEL
    if (Input.isTriggered('cancel') || TouchInput.isCancelled()) { 
        SoundManager.playCancel(); 
        this.callHandler('cancel'); 
    }
};

/* ---------------- Window_CircularList (Satellite Orb) ---------------- */
function Window_CircularList(){ this.initialize.apply(this, arguments); }
window.Window_CircularList = Window_CircularList;
Window_CircularList.prototype = Object.create(Window_Selectable.prototype);
Window_CircularList.prototype.constructor = Window_CircularList;

// Disable cursor sprite
Window_CircularList.prototype.refreshCursor = function() {};
Window_CircularList.prototype.updateCursor = function() {
    this.setCursorRect(0, 0, 0, 0);
};

Window_CircularList.prototype.initialize = function(x, y, w, h) {
    Window_Selectable.prototype.initialize.call(this, 0, 0, Graphics.boxWidth, Graphics.boxHeight);
    
    if (this._cursorSprite) this._cursorSprite.visible = false;
    
    this.opacity = 0; 
    this.contentsOpacity = 0; 
    this.visible = false;
    this._container = new PIXI.Container(); 
    this._container.alpha = 0; 
    this.addChild(this._container);
    setupLavaVisuals(this, scaled(RADIAL_CFG.SATELLITE_RADIUS), this._container);
    this._textContainer = new PIXI.Container(); 
    this.addChild(this._textContainer);
};

Window_CircularList.prototype.item = function() { return this._data && this._data[this.index()] ? this._data[this.index()] : null; };
Window_CircularList.prototype.setActor = function(actor) { this._actor = actor; this.refresh(); };
Window_CircularList.prototype.maxItems = function() { return this._data ? this._data.length : 0; };

Window_CircularList.prototype.refresh = function() {
    this._data = this.makeItemList ? this.makeItemList() : [];
    this._textContainer.removeChildren(); this._labels = [];
    var fontSize = Math.round(15 * UI.scaleX());
    for (var i = 0; i < this._data.length; i++) {
        var item = this._data[i];
        var txt = new PIXI.Text(item ? item.name.toUpperCase() : "", {fontFamily: "GameFont", fontSize: fontSize, fill: "#ccffff", stroke: '#002244', strokeThickness: 3});
        txt.anchor.set(0.5); txt.alpha = 0; this._textContainer.addChild(txt); this._labels.push(txt);
    }
};

Window_CircularList.prototype.update = function() {
    Window_Selectable.prototype.update.call(this);
    
    if (this.active) { 
        this.visible = true; 
        this._container.alpha = Math.min(1, this._container.alpha + 0.1);
        this._handleInput(); // Process input
    } else { 
        this._container.alpha = Math.max(0, this._container.alpha - 0.1); 
        if (this._container.alpha <= 0) this.visible = false; 
    }
    
    if (this.visible) { 
        this._updateSatellitePosition(); 
        updateLavaAnimation(this, this._actor ? this._actor.actorId() : 0); 
        this._updateListVisuals(); 
    }
};

// --- SHIELD FROM NATIVE ENGINE INTERFERENCE ---
Window_CircularList.prototype.processCursorMove = function() {};
Window_CircularList.prototype.processHandling = function() {};
Window_CircularList.prototype.processTouch = function() {};
Window_CircularList.prototype.processWheel = function() {};

Window_CircularList.prototype._handleInput = function() {
    if (!this.active) return;
    var lastIndex = this.index();

    // RESTORED KEYBOARD NAVIGATION
    if (Input.isRepeated('down')) {
        this.select((this.index() + 1) % this.maxItems());
    }
    if (Input.isRepeated('up')) {
        this.select((this.index() - 1 + this.maxItems()) % this.maxItems());
    }

    // RESTORED MOUSE WHEEL
    if (TouchInput.wheelY >= 20) {
        this.select((this.index() + 1) % this.maxItems());
    }
    if (TouchInput.wheelY <= -20) {
        this.select((this.index() - 1 + this.maxItems()) % this.maxItems());
    }

    // MOUSE CLICK
    if (TouchInput.isTriggered()) {
        var mx = window._Noq_PassiveMouseX;
        var my = window._Noq_PassiveMouseY;
        var dx = mx - this._container.x;
        var dy = my - this._container.y;
        var rad = scaled(RADIAL_CFG.SATELLITE_RADIUS);
        if (dx*dx + dy*dy <= rad*rad) {
            TouchInput.clear(); // Keep the targeting fix!
            this.processOk();
            return;
        } else {
            if (my < this._container.y - 20) {
                this.select((this.index() - 1 + this.maxItems()) % this.maxItems());
            } else if (my > this._container.y + 20) {
                this.select((this.index() + 1) % this.maxItems());
            }
        }
    }

    if (lastIndex !== this.index()) {
        SoundManager.playCursor();
        this._emitDescUpdate();
    }

    // OK and CANCEL
    if (Input.isTriggered('ok')) {
        this.processOk();
    }
    if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        this.processCancel();
    }
};

Window_CircularList.prototype._emitDescUpdate = function(){
  var scene = SceneManager._scene;
  var item = this.item();
  if (!scene || !scene._noqDescPanel || !item) return;
  
  if (typeof scene._noqDescPanel.setItem === 'function') {
      scene._noqDescPanel.setItem(item, BattleManager.actor());
  } else if (typeof scene._noqDescPanel.setText === 'function') {
      scene._noqDescPanel.setText(item.description || '');
  }
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
        var label = this._labels[i]; 
        var diff = i - this.index();
        var item = this._data[i];
        
        // Evaluate if the actor has the MP/TP/State to cast this
        var isUsable = (item && this._actor) ? this._actor.canUse(item) : true;
        
        label.x = this._container.x; 
        var targetY = this._container.y + (diff * spacing);
        label.y = lerp(label.y || targetY, targetY, 0.2);
        var dist = Math.abs(diff);
        
        // Calculate base alpha, then halve it if the skill is unusable
        var baseAlpha = Math.max(0, 1.0 - (dist * 0.4)) * this._container.alpha;
        label.alpha = isUsable ? baseAlpha : baseAlpha * 0.4;
        
        label.scale.x = label.scale.y = lerp(label.scale.x, (dist === 0 ? 1.1 : 0.7), 0.2);
        
        // Apply the minimalistic grey-out color for unusable skills
        if (!isUsable) {
            label.style.fill = "#777777"; 
        } else {
            label.style.fill = (dist === 0) ? "#ffff44" : "#ccffff";
        }
    }
};

// Overrides native selectable check to enforce MP/TP costs on the radial menu
Window_CircularList.prototype.isCurrentItemEnabled = function() {
    var item = this.item();
    if (!item || !this._actor) return false;
    return this._actor.canUse(item);
};

var _Window_CircularList_activate = Window_CircularList.prototype.activate;
Window_CircularList.prototype.activate = function() {
    _Window_CircularList_activate.call(this);
    // Clear input buffer to prevent carryover from command window
    Input.clear();
    TouchInput.clear();
};

// Disable cursor for all custom windows
var _Noq_Window_UpdateCursor = Window_Selectable.prototype._updateCursor;
Window_Selectable.prototype._updateCursor = function() {
    if (this instanceof Window_CircularList || 
        this instanceof Window_CircularCommand || 
        this instanceof Window_NoQEnemySelect || 
        this instanceof Window_NoQAllySelect) {
        if (this._cursorSprite) this._cursorSprite.visible = false;
        this.setCursorRect(0, 0, 0, 0); 
        return; 
    }
    _Noq_Window_UpdateCursor.call(this);
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
  
  this._noqEnemySel = new Window_NoQEnemySelect();
  this._noqAllySel = new Window_NoQAllySelect();
  this.addWindow(this._noqEnemySel);
  this.addWindow(this._noqAllySel);
  
  this._noqCircularCmd = new Window_CircularCommand();
  this.addWindow(this._noqCircularCmd);

  this._circularSkillWindow = new Window_BattleSkillCircular();
  this.addWindow(this._circularSkillWindow);

  this._circularItemWindow = new Window_BattleItemCircular();
  this.addWindow(this._circularItemWindow);

  var self = this;
  
 // ========== ENEMY RETICLE HANDLERS ==========
  if (this._noqEnemySel) {
    this._noqEnemySel.setHandler('cancel', function() {
      self._noqEnemySel.end(); 
      if (self._noqTargetMini) self._noqTargetMini.hide(); 
      reopenRadial(self);
    });
    
    this._noqEnemySel.setHandler('ok', function() {
        var enemy = self._noqEnemySel.enemy();
        if (enemy) {
            var act = BattleManager.inputtingAction();
            if (act) { 
                act.setTarget(enemy.index());
                act._isTargetingAlly = false; 
            }
            self._noqEnemySel.end(); 
            if (self._noqTargetMini) self._noqTargetMini.hide();
            BattleManager.selectNextCommand();
        } else {
            self._noqEnemySel.activate();
        }
    });
  }
 
  // ========== ALLY RETICLE HANDLERS ==========
  if (this._noqAllySel) {
    this._noqAllySel.setHandler('cancel', function() {
      self._noqAllySel.end(); 
      if (self._noqTargetMini) self._noqTargetMini.hide();
      reopenRadial(self);
    });
 
    this._noqAllySel.setHandler('ok', function() {
        var actor = self._noqAllySel.actor();
        if (actor) {
            var act = BattleManager.inputtingAction();
            if (act) {
                act.setTarget(self._noqAllySel.index());
                act._isTargetingAlly = true; 
            }
            self._noqAllySel.end(); 
            if (self._noqTargetMini) self._noqTargetMini.hide();
            BattleManager.selectNextCommand();
        } else {
            self._noqAllySel.activate();
        }
    });
  }
 
  // ========== COMMAND HANDLERS ==========
  this._noqCircularCmd.setHandler('attack', function(){ 
      BattleManager.inputtingAction().setAttack();
      self.onSelectAction();
  });
  
  this._noqCircularCmd.setHandler('techniques', function(){ 
      self._circularSkillWindow.setActor(BattleManager.actor());
      self._circularSkillWindow.setStypeId(TECH_TYPE_IDS);
      self._circularSkillWindow.activate();
      self._noqCircularCmd.deactivate();
  });
  
  this._noqCircularCmd.setHandler('verse', function(){ 
      self._circularSkillWindow.setActor(BattleManager.actor());
      self._circularSkillWindow.setStypeId(VERSE_TYPE_ID);
      self._circularSkillWindow.activate();
      self._noqCircularCmd.deactivate();
  });
  
  this._noqCircularCmd.setHandler('defense', function(){ 
      self._circularSkillWindow.setActor(BattleManager.actor());
      self._circularSkillWindow.setStypeId(DEFENSE_TYPE_IDS);
      self._circularSkillWindow.activate();
      self._noqCircularCmd.deactivate();
  });
  
  this._noqCircularCmd.setHandler('item', function(){ 
      self._circularItemWindow.setActor(BattleManager.actor());
      self._circularItemWindow.activate();
      self._noqCircularCmd.deactivate();
  });
 
  // ========== SKILL/ITEM WINDOW HANDLERS ==========
  this._circularSkillWindow.setHandler('ok', function(){ self.onSkillOk(); });
  this._circularSkillWindow.setHandler('cancel', function(){ 
      self._circularSkillWindow.deactivate();
      self._noqCircularCmd.activate(); 
  });
  
  this._circularItemWindow.setHandler('ok', function(){ self.onItemOk(); });
  this._circularItemWindow.setHandler('cancel', function(){ 
      self._circularItemWindow.deactivate();
      self._noqCircularCmd.activate(); 
  });
};

Scene_Battle.prototype.startActorCommandSelection = function(){
  var actor = BattleManager.actor(); if (!actor) return;
  var sp = null; var sprites = this._spriteset._actorSprites;
  for (var i=0; i<sprites.length; i++) { if (sprites[i]._battler === actor) sp = sprites[i]; }
  this._noqCircularCmd.startOpen(sp, actor.actorId());
};

var _changeInput = Scene_Battle.prototype.changeInputWindow;
Scene_Battle.prototype.changeInputWindow = function(){
  _changeInput.call(this); 
  if (!BattleManager.actor()) {
      this._noqCircularCmd.startClose();
      if (this._circularSkillWindow) this._circularSkillWindow.deactivate();
      if (this._circularItemWindow) this._circularItemWindow.deactivate();
  }
};

Scene_Battle.prototype.selectPreviousCommand = function() {
    this._noqCircularCmd.visible = true;
    this._noqCircularCmd.active = true;
    this._noqCircularCmd.activate();
    if (BattleManager.actorIndex() > 0) {
        BattleManager.selectPreviousCommand();
        this.changeInputWindow();
    }
};

Scene_Battle.prototype.onSkillOk = function() {
    var skill = this._circularSkillWindow.item();
    if (skill) {
        BattleManager.inputtingAction().setSkill(skill.id);
        this.onSelectAction(); 
    }
};

Scene_Battle.prototype.onItemOk = function() {
    var item = this._circularItemWindow.item();
    if (item) {
        BattleManager.inputtingAction().setItem(item.id);
        this.onSelectAction();
    }
};

Scene_Battle.prototype.onSelectAction = function() {
    var action = BattleManager.inputtingAction();
    
    // Hide command window
    this._noqCircularCmd.visible = false;
    this._noqCircularCmd.active = false;
    
    // Hide skill/item windows
    if (this._circularSkillWindow) {
        this._circularSkillWindow.visible = false;
        this._circularSkillWindow.active = false;
    }
    
    if (this._circularItemWindow) {
        this._circularItemWindow.visible = false;
        this._circularItemWindow.active = false;
    }
 
    // Route to appropriate target selector
    if (!action.needsSelection()) {
        BattleManager.selectNextCommand();
    } else if (action.isForOpponent()) {
        if (this._noqEnemySel) {
            this._noqEnemySel.start(); 
            this._noqEnemySel.activate();
        }
    } else {
        if (this._noqAllySel) {
            this._noqAllySel.start();
            this._noqAllySel.activate();
        }
    }
};

/* -------------------- Targeting Reticle Logic -------------------- */

// --- ENEMY SELECTOR ---
function Window_NoQEnemySelect() { this.initialize.apply(this, arguments); }
Window_NoQEnemySelect.prototype = Object.create(Window_Selectable.prototype);
Window_NoQEnemySelect.prototype.constructor = Window_NoQEnemySelect;

// Disable cursor display
Window_NoQEnemySelect.prototype.refreshCursor = function() {};

// Flat list navigation
Window_NoQEnemySelect.prototype.cursorDown = function(wrap) { this.select((this.index() + 1) % this.maxItems()); };
Window_NoQEnemySelect.prototype.cursorUp = function(wrap) { this.select((this.index() - 1 + this.maxItems()) % this.maxItems()); };
Window_NoQEnemySelect.prototype.cursorRight = function(wrap) { this.cursorDown(wrap); };
Window_NoQEnemySelect.prototype.cursorLeft = function(wrap) { this.cursorUp(wrap); };

Window_NoQEnemySelect.prototype.initialize = function() {
    Window_Selectable.prototype.initialize.call(this, 0, 0, Graphics.boxWidth, Graphics.boxHeight);
    this.opacity = 0;
    this.active = false;
    this.visible = false;
    this._sprites = [];
};

Window_NoQEnemySelect.prototype.maxItems = function() { return $gameTroop.aliveMembers().length; };
Window_NoQEnemySelect.prototype.enemy = function() { return $gameTroop.aliveMembers()[this.index()]; };

Window_NoQEnemySelect.prototype.start = function() {
    this.refresh();
    this.select(0);
    this.active = true;
    this.visible = true;
    this._notifyStatusChange();
};

Window_NoQEnemySelect.prototype.end = function() {
    this.active = false;
    this.visible = false;
    this._notifyStatusChange();
};

Window_NoQEnemySelect.prototype._notifyStatusChange = function() {
    // Notify enemy status panel to update
    if (window.NoqEnemyStatusPanel) {
        window.NoqEnemyStatusPanel.setEnemy(this.active ? this.enemy() : null);
    }
};

Window_NoQEnemySelect.prototype.select = function(index) {
    Window_Selectable.prototype.select.call(this, index);
    this._notifyStatusChange();
};

Window_NoQEnemySelect.prototype.update = function() {
    Window_Selectable.prototype.update.call(this);
    if (!this.active) return;
    
    this._handleInput();
    
    var enemies = $gameTroop.aliveMembers();
    for (var i = 0; i < enemies.length; i++) {
        var sprite = this._sprites[i];
        if (!sprite) continue;
        var enemy = enemies[i];
        
        var battlerSprite = SceneManager._scene._spriteset._enemySprites.find(function(s) {
            return s._battler === enemy;
        });
        
        if (battlerSprite) {
            sprite.x = battlerSprite.x;
            sprite.y = battlerSprite.y - (battlerSprite.height / 2);
            sprite.rotation += 0.04;
            
            var isSelected = (this.index() === i);
            sprite.scale.x = sprite.scale.y = isSelected ? 1.2 : 0.8;
            sprite.alpha = isSelected ? 1.0 : 0.4;
        }
    }
};

// --- SHIELD FROM NATIVE ENGINE INTERFERENCE ---
Window_NoQEnemySelect.prototype.processCursorMove = function() {};
Window_NoQEnemySelect.prototype.processHandling = function() {};

Window_NoQEnemySelect.prototype._handleInput = function() {
    if (!this.active) return;
 
    var lastIndex = this.index();
    
    var action = BattleManager.inputtingAction();
    if (action && action.item() && action.item().meta.target_both) {
        if (Input.isTriggered('tab')) { 
            SoundManager.playCursor();
            this.end();
            SceneManager._scene._noqAllySel.start();
            SceneManager._scene._noqAllySel.activate();
            Input.clear(); 
            return;
        }
    }
 
    // KEYBOARD NAVIGATION
    if (Input.isRepeated('right') || Input.isRepeated('down')) {
        this.select((this.index() + 1) % this.maxItems());
    }
    if (Input.isRepeated('left') || Input.isRepeated('up')) {
        this.select((this.index() - 1 + this.maxItems()) % this.maxItems());
    }
    
    // MOUSE CLICK - Two-click system
    if (TouchInput.isTriggered()) {
        
        // Cross-Click to Ally 
        if (action && action.item() && action.item().meta.target_both) {
            var allActors = $gameParty.battleMembers();
            for (var a = 0; a < allActors.length; a++) {
                var aSp = SceneManager._scene._spriteset._actorSprites.find(function(s) { return s._battler === allActors[a]; });
                if (aSp && this.isTouchedChild(aSp)) {
                    SoundManager.playCursor();
                    this.end();
                    var allyWin = SceneManager._scene._noqAllySel;
                    allyWin.start(); allyWin.activate(); allyWin.select(a);
                    TouchInput.clear(); 
                    return;
                }
            }
        }

        // Normal Enemy Click
        var enemies = $gameTroop.aliveMembers();
        for (var i = 0; i < enemies.length; i++) {
            var enemy = enemies[i];
            var sprite = SceneManager._scene._spriteset._enemySprites.find(function(s) {
                return s._battler === enemy;
            });
            
            if (sprite && this.isTouchedChild(sprite)) {
                if (this.index() === i) {
                    this.processOk();
                } else {
                    this.select(i);
                }
                return;
            }
        }
    }
 
    if (lastIndex !== this.index()) {
        SoundManager.playCursor();
    }
 
    if (Input.isTriggered('ok')) {
        if (this.enemy()) {
            this.processOk();
        }
    }
    if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        this.processCancel();
    }
};

Window_NoQEnemySelect.prototype.isTouchedChild = function(sprite) {
    var x = TouchInput.x;
    var y = TouchInput.y;
    return (x >= sprite.x - sprite.width/2 && x <= sprite.x + sprite.width/2 &&
            y >= sprite.y - sprite.height && y <= sprite.y);
};

Window_NoQEnemySelect.prototype.refresh = function() {
    if (this._sprites) {
        this._sprites.forEach(function(s) { this.removeChild(s); }.bind(this));
    }
    this._sprites = [];
    var enemies = $gameTroop.aliveMembers();
    for (var i = 0; i < enemies.length; i++) {
        var container = new PIXI.Container();
        for (var j = 0; j < 3; j++) {
            var orb = createGlassyOrb(10, '#ff4444', 'rgba(200, 0, 0, 0.1)');
            var angle = (Math.PI * 2 / 3) * j;
            orb.x = Math.cos(angle) * 35;
            orb.y = Math.sin(angle) * 35;
            container.addChild(orb);
        }
        this.addChild(container);
        this._sprites.push(container);
    }
};

Window_NoQEnemySelect.prototype.processOk = function() {
    if (this.enemy()) {
        this.callOkHandler();
    }
};

Window_NoQEnemySelect.prototype.processCancel = function() {
    this.callCancelHandler();
};

// --- ALLY SELECTOR ---
function Window_NoQAllySelect() { this.initialize.apply(this, arguments); }
Window_NoQAllySelect.prototype = Object.create(Window_NoQEnemySelect.prototype);
Window_NoQAllySelect.prototype.constructor = Window_NoQAllySelect;
 
// CRITICAL: Use maxItems (not itemMax)
Window_NoQAllySelect.prototype.maxItems = function() { 
    return $gameParty.battleMembers().length; 
};
 
// Return the selected actor from battle members
Window_NoQAllySelect.prototype.actor = function() { 
    return $gameParty.battleMembers()[this.index()]; 
};
 
// This is used by the enemy status panel
Window_NoQAllySelect.prototype.enemy = function() { 
    return this.actor(); 
};
 
// Cursor navigation (inherited but keeping explicit)
Window_NoQAllySelect.prototype.cursorDown = Window_NoQEnemySelect.prototype.cursorDown;
Window_NoQAllySelect.prototype.cursorUp = Window_NoQEnemySelect.prototype.cursorUp;
Window_NoQAllySelect.prototype.cursorRight = Window_NoQEnemySelect.prototype.cursorRight;
Window_NoQAllySelect.prototype.cursorLeft = Window_NoQEnemySelect.prototype.cursorLeft;
 
// Process methods
Window_NoQAllySelect.prototype.processOk = function() {
    if (this.actor()) {
        this.callOkHandler();
    }
};
 
Window_NoQAllySelect.prototype.processCancel = function() {
    this.callCancelHandler();
};
 
// Refresh sprites
Window_NoQAllySelect.prototype.refresh = function() {
    if (this._sprites) {
        this._sprites.forEach(function(s) { this.removeChild(s); }.bind(this));
    }
    this._sprites = [];
    var actors = $gameParty.battleMembers();
    for (var i = 0; i < actors.length; i++) {
        var container = new PIXI.Container();
        for (var j = 0; j < 3; j++) {
            var orb = createGlassyOrb(10, '#44ff44', 'rgba(0, 200, 0, 0.1)');
            var angle = (Math.PI * 2 / 3) * j;
            orb.x = Math.cos(angle) * 35;
            orb.y = Math.sin(angle) * 35;
            container.addChild(orb);
        }
        this.addChild(container);
        this._sprites.push(container);
    }
};
 
// Update sprites
Window_NoQAllySelect.prototype.update = function() {
    Window_Selectable.prototype.update.call(this);
    if (!this.active) return;
    
    this._handleInput();
    
    var actors = $gameParty.battleMembers();
    for (var i = 0; i < actors.length; i++) {
        var sprite = this._sprites[i];
        if (!sprite) continue;
        var actor = actors[i];
        var battlerSprite = SceneManager._scene._spriteset._actorSprites.find(function(s) {
            return s._battler === actor;
        });
        
        if (battlerSprite) {
            sprite.x = battlerSprite.x;
            sprite.y = battlerSprite.y - (battlerSprite.height / 2);
            sprite.rotation += 0.04;
            var isSelected = (this.index() === i);
            sprite.scale.x = sprite.scale.y = isSelected ? 1.2 : 0.8;
            sprite.alpha = isSelected ? 1.0 : 0.4;
        }
    }
};
 
// Input handling
Window_NoQAllySelect.prototype._handleInput = function() {
    if (!this.active) return;
 
    var lastIndex = this.index();
    
    var action = BattleManager.inputtingAction();
    if (action && action.item() && action.item().meta.target_both) {
        if (Input.isTriggered('tab')) { 
            SoundManager.playCursor();
            this.end();
            SceneManager._scene._noqEnemySel.start();
            SceneManager._scene._noqEnemySel.activate();
            Input.clear(); 
            return;
        }
    }
 
    // KEYBOARD NAVIGATION
    if (Input.isRepeated('right') || Input.isRepeated('down')) {
        this.select((this.index() + 1) % this.maxItems());
    }
    if (Input.isRepeated('left') || Input.isRepeated('up')) {
        this.select((this.index() - 1 + this.maxItems()) % this.maxItems());
    }
    
    // MOUSE CLICK - Two-click system
    if (TouchInput.isTriggered()) {

        // Cross-Click to Enemy 
        if (action && action.item() && action.item().meta.target_both) {
            var allEnemies = $gameTroop.aliveMembers();
            for (var e = 0; e < allEnemies.length; e++) {
                var eSp = SceneManager._scene._spriteset._enemySprites.find(function(s) { return s._battler === allEnemies[e]; });
                if (eSp && this.isTouchedChild(eSp)) {
                    SoundManager.playCursor();
                    this.end();
                    var enemyWin = SceneManager._scene._noqEnemySel;
                    enemyWin.start(); enemyWin.activate(); enemyWin.select(e);
                    TouchInput.clear(); 
                    return;
                }
            }
        }

        // Normal Ally Click
        var actors = $gameParty.battleMembers();
        for (var i = 0; i < actors.length; i++) {
            var actor = actors[i];
            var sprite = SceneManager._scene._spriteset._actorSprites.find(function(s) {
                return s._battler === actor;
            });
            
            if (sprite && this.isTouchedChild(sprite)) {
                if (this.index() === i) {
                    this.processOk();
                } else {
                    this.select(i);
                }
                return;
            }
        }
    }
 
    if (lastIndex !== this.index()) {
        SoundManager.playCursor();
    }
 
    if (Input.isTriggered('ok')) {
        if (this.actor()) {
            this.processOk();
        }
    }
    if (Input.isTriggered('cancel') || TouchInput.isCancelled()) {
        this.processCancel();
    }
};

function reopenRadial(scene) {
    scene._noqCircularCmd.visible = true;
    scene._noqCircularCmd.active = true;
    scene._noqCircularCmd.activate();
}

/* -------------------- Custom Target Engine Override -------------------- */
var _Noq_Game_Action_makeTargets = Game_Action.prototype.makeTargets;
Game_Action.prototype.makeTargets = function() {
    if (this.item() && this.item().meta.target_both && this._isTargetingAlly !== undefined) {
        var index = this._targetIndex;
        var target;
        
        if (this._isTargetingAlly) {
            target = $gameParty.battleMembers()[index];
        } else {
            target = $gameTroop.aliveMembers()[index];
        }
        
        if (target) return [target];
    }
    return _Noq_Game_Action_makeTargets.call(this);
};

})();