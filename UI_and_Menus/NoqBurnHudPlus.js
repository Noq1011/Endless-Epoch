/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq Battle HUD — Bottom-Center HUD (EX_UI Scaling Compatible)
 * @author Noq
 * @help
 * Actor note tags (img/battlefaces/):
 * <BattleFace: File>
 * <BattleFaceLowHP: FileLow>
 * <BattleFaceBurnout: FileBurn>
 *
 * Load below YEP_* and your Burnout System. 
 * REQUIRES: Exiled Genesis UI Helper Layer (EX_UI)
 */

(function(){
"use strict";

// Use your EX_UI helper or a safe fallback
var UI = typeof EX_UI !== 'undefined' ? EX_UI : {
  scale: function(v){ return v; },
  scaleX: function(){ return 1; },
  centerX: function(){ return Graphics.boxWidth / 2; }
};

var HUD = {
  BOTTOM_OFFSET     : 140,    // NEW: Offset from the bottom of the screen
  PORTRAIT_SPACING  : 312,    
  CENTER_OFFSET     : 0,
  PORTRAIT_SIZE     : 64,     
  PORTRAIT_SCALE    : 2.00,   
  PORTRAIT_BLEED    : 10,     
  GAUGE_WIDTH       : 164,    
  GAUGE_HEIGHT      : 18,     
  GAUGE_SPACING_Y   : 6,      
  GAUGE_OFFSET_X    : 64,     
  GAUGE_OFFSET_Y    : -46,    
  BORDER_ALPHA      : 0.70,
  BORDER_RADIUS     : 7,      
  BORDER_THIN       : 1.5,    
  ATB_COLOR         : 0x9cff88,
  CHARGE_COLOR      : 0xffcc66,
  GRAD_HP           : ["#00ff88", "#00c853"],
  GRAD_MP           : ["#4fc3f7", "#2979ff"],
  GRAD_BO           : ["#ff9e00", "#ff3d00"],
  PULSE_SPEED       : 0.25,
  PULSE_MIN         : 0.75,
  PULSE_MAX         : 1.0,
  RING_SEGMENTS     : 72,
  RING_OUTER_GAP    : 12,     
  RING_THICKNESS    : 5,      
  FRACTURE_LINES    : 32,
  FRACTURE_ALPHA_MAX: 0.9,
  FRACTURE_SMOOTH   : 0.12,
  DEFRACTURE_SMOOTH : 0.08,
  SHAKE_DECAY       : 0.80,
  SHAKE_HP          : 2,
  SHAKE_MP          : 1,
  SHAKE_BO          : 1,
  NOTE_ENABLED      : true,
  NOTE_CHAR         : "♪",
  NOTE_BOB_PIX      : 6,
  NOTE_SPEED        : 0.15,
  NOTE_OFFSET_X     : -10,
  NOTE_OFFSET_Y     : -16,    
  TEXT_COLOR        : "#ffffff",  
  TEXT_STROKE       : "#000000",
  TEXT_STROKE_THICK : 3,
  TEXT_SIZE         : 14,         
  TEXT_Y_OFF        : 1,
  BO_PULSE_THRESH   : 0.75,
  BO_PULSE_SPEED    : 0.18,
  BO_PULSE_MIN      : 0.65,
  BO_PULSE_MAX      : 1.00
};

// --- Helpers ---
function tpLimit(b){ try{ return b.tpLimit ? Math.max(1, b.tpLimit()) : 100; }catch(e){ return 100; } }
function tpRate(b){ try{ return Math.max(0, Math.min(1, (b.tp||0)/tpLimit(b))); }catch(e){ return 0; } }
function atbRate(b){ return (b.atbRate && b.atbRate()) || 0; }
function chargeRate(b){ return (b.atbChargeRate && b.atbChargeRate()) || 0; }
function isCharging(b){ return (typeof b.isATBCharging === 'function') ? b.isATBCharging() : false; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function lerp(a,b,t){ return a + (b-a)*t; }

// Renamed class to reflect the bottom positioning
function Window_BottomCenterHUD(){
  this.initialize.apply(this, arguments);
}
Window_BottomCenterHUD.prototype = Object.create(Window_Base.prototype);
Window_BottomCenterHUD.prototype.constructor = Window_BottomCenterHUD;

Window_BottomCenterHUD.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, Graphics.boxWidth, Graphics.boxHeight);
  this.opacity = 0;
  this._actorEntries = [];
  this.createActorEntries();
};

Window_BottomCenterHUD.prototype.createActorEntries = function(){
  var actors = $gameParty.battleMembers();
  this._actorEntries = [];
  
  for (var i=0; i<actors.length; i++){
    var a = actors[i];
    var cont = new PIXI.Container();
    this.addChild(cont);

    // 1. Portrait Setup
    var faceName = this._faceFor(a);
    var bmp = ImageManager.loadBitmap("img/battlefaces/", faceName);
    var spr = new Sprite(bmp);
    spr.anchor.set(0.5, 0.5); // Center the portrait
    spr.scale.set(HUD.PORTRAIT_SCALE);
    spr.y = 0; // Portrait sits at the top of the container

    var mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawCircle(0,0,(HUD.PORTRAIT_SIZE/2)+HUD.PORTRAIT_BLEED);
    mask.endFill();
    spr.mask = mask;

    // 2. Gauges Setup
    var ring = new PIXI.Graphics();
    var gauges = new PIXI.Container();
    var bars = this._buildGauges();
    var frac = this._makeFractureOverlay(HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT, HUD.FRACTURE_LINES);

    // POSITIONING THE GAUGES:
    // We shift the gauges down by the portrait radius + padding
    var portraitRadius = (HUD.PORTRAIT_SIZE * HUD.PORTRAIT_SCALE) / 2;
    gauges.y = portraitRadius - 10; // 20px gap between portrait and gauges
    
    // Center the gauges horizontally
    gauges.x = -HUD.GAUGE_WIDTH / 2; 

    // 3. Add to container in order (Portrait on top layer, Gauges below)
    cont.addChild(spr);
    cont.addChild(mask);
    cont.addChild(ring);
    cont.addChild(gauges);
    
    bars.root.x = 0; // Relative to gauges container
    bars.root.y = 0;
    gauges.addChild(bars.root);
    bars.bo.upper.addChild(frac);

    this._actorEntries.push({
      actor: a, container: cont, sprite: spr, ring: ring, bars: bars, fracture: frac,
      shakeX: 0, shakeY: 0, prevHp: a.hp, prevMp: a.mp, prevTp: a.tp,
      lastAtb: -1, lastChrg: -1, lastIsChrg: false, fractureAlpha: 0
    });
  }
};

/* -- Layout horizontally across bottom center -- */
Window_BottomCenterHUD.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  if (this._actorEntries.length > 0) {
    this._updateLayout();
    this._updateVisuals();
  }
};

Window_BottomCenterHUD.prototype._updateLayout = function(){
  var s = UI.scaleX(); 
  var midX = (Graphics.boxWidth / 2) + (HUD.CENTER_OFFSET * s);
  var spacing = HUD.PORTRAIT_SPACING * s;
  var startX = midX - ((this._actorEntries.length - 1) * spacing) / 2;

  for (var i=0; i<this._actorEntries.length; i++){
    var e = this._actorEntries[i];
    if (!e.container) continue; 

    e.baseX = startX + (i * spacing);
    // NEW: Dynamically calculate Y from the bottom of the screen
    e.baseY = Graphics.boxHeight - (HUD.BOTTOM_OFFSET * s);
    
    e.container.scale.set(s, s);
    e.container.x = Math.round(e.baseX + (e.shakeX * s));
    e.container.y = Math.round(e.baseY + (e.shakeY * s));
  }
};

/* -- Visual updates -- */
Window_BottomCenterHUD.prototype._updateVisuals = function(){
  for (var i=0; i<this._actorEntries.length; i++){
    var E = this._actorEntries[i], A = E.actor;
    this._updatePortrait(E, A);
    this._updateRingOptimized(E, A);
    this._updateGaugesOptimized(E, A);
    this._updateShake(E, A);
    this._updateChantNote(E, A);
  }
};

/* =========================
   == Portrait helpers    ==
   ========================= */
Window_BottomCenterHUD.prototype._actorNote = function(a){ return a.actor ? a.actor().note : ""; };
Window_BottomCenterHUD.prototype._faceFor = function(a){
  var m = this._actorNote(a).match(/<BattleFace\s*:\s*(.+?)>/i);
  return m ? m[1].trim() : "Blank";
};
Window_BottomCenterHUD.prototype._faceLowFor = function(a){
  var note = this._actorNote(a);
  var m = note.match(/<BattleFaceLowHP\s*:\s*(.+?)>/i);
  return (m && m[1]) ? m[1].trim() : this._faceFor(a);
};
Window_BottomCenterHUD.prototype._faceBurnFor = function(a){
  var note = this._actorNote(a);
  var m = note.match(/<BattleFaceBurnout\s*:\s*(.+?)>/i);
  return (m && m[1]) ? m[1].trim() : this._faceFor(a);
};

Window_BottomCenterHUD.prototype._updatePortrait = function(E, A){
  var face = this._faceFor(A);
  if (A.mhp > 0 && A.hp / A.mhp < 0.25) face = this._faceLowFor(A);
  else if (tpRate(A) >= 0.75) face = this._faceBurnFor(A);

  var wantUrl = "img/battlefaces/" + face;
  if (!E.sprite._noqUrl || E.sprite._noqUrl !== wantUrl){
    var bmp = ImageManager.loadBitmap("img/battlefaces/", face);
    bmp.smooth = false;
    E.sprite.bitmap = bmp;
    E.sprite._noqUrl = wantUrl;
  }
};

/* =========================
   == Ring (ATB/Charge)   ==
   ========================= */
Window_BottomCenterHUD.prototype._updateRingOptimized = function(E, A){
  // Disabled: ATB is now rendered directly under the battlefield sprites.
  if (E.ring) E.ring.clear();
};

/* =========================
   == Gauges + fracture    ==
   ========================= */
Window_BottomCenterHUD.prototype._buildGauges = function(){
  var root = new PIXI.Container();

  function mkGauge(gradA, gradB, labelMode){
    var lower = new PIXI.Container();
    var upper = new PIXI.Container();

    var bg = new PIXI.Graphics();
    bg.beginFill(0xffffff, 0.10);
    _roundedRect(bg, 0,0, HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT, HUD.BORDER_RADIUS);
    bg.endFill();
    var border = new PIXI.Graphics();
    border.lineStyle(HUD.BORDER_THIN, 0x000000, HUD.BORDER_ALPHA);
    _roundedRect(border, 0,0, HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT, HUD.BORDER_RADIUS);

    var fill = new Sprite(new Bitmap(HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT));
    fill.bitmap.gradientFillRect(0,0,HUD.GAUGE_WIDTH,HUD.GAUGE_HEIGHT,gradA,gradB,false);
    fill.scale.x = 1.0;
    
    var msk = new PIXI.Graphics();
    msk.beginFill(0xffffff);
    _roundedRect(msk, 0,0, HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT, HUD.BORDER_RADIUS);
    msk.endFill();
    fill.mask = msk;
    upper.addChild(msk);

    var txt = new PIXI.Text("", {
      fontFamily: "GameFont",
      fontSize: HUD.TEXT_SIZE,
      fill: HUD.TEXT_COLOR,
      fontWeight: "bold",
      stroke: HUD.TEXT_STROKE,
      strokeThickness: HUD.TEXT_STROKE_THICK
    });
    txt.anchor.set(0.5, 0.5);
    txt.x = HUD.GAUGE_WIDTH/2;
    txt.y = HUD.GAUGE_HEIGHT/2 + HUD.TEXT_Y_OFF;

    lower.addChild(bg);
    lower.addChild(border);
    upper.addChild(fill);
    upper.addChild(txt);

    return { lower: lower, upper: upper, fill: fill, text: txt, mask: msk, labelMode: labelMode||"value" };
  }

  var hp = mkGauge(HUD.GRAD_HP[0], HUD.GRAD_HP[1], "value");
  var mp = mkGauge(HUD.GRAD_MP[0], HUD.GRAD_MP[1], "value");
  var bo = mkGauge(HUD.GRAD_BO[0], HUD.GRAD_BO[1], "burnout"); 

  hp.lower.y = 0; hp.upper.y = 0;
  mp.lower.y = (HUD.GAUGE_HEIGHT + HUD.GAUGE_SPACING_Y);
  mp.upper.y = (HUD.GAUGE_HEIGHT + HUD.GAUGE_SPACING_Y);
  bo.lower.y = 2*(HUD.GAUGE_HEIGHT + HUD.GAUGE_SPACING_Y);
  bo.upper.y = 2*(HUD.GAUGE_HEIGHT + HUD.GAUGE_SPACING_Y);

  root.addChild(hp.lower); root.addChild(hp.upper);
  root.addChild(mp.lower); root.addChild(mp.upper);
  root.addChild(bo.lower); root.addChild(bo.upper);

  return { root: root, hp: hp, mp: mp, bo: bo };
};

function _roundedRect(g, x, y, w, h, r){
  g.moveTo(x+r, y);
  g.lineTo(x+w-r, y);
  g.quadraticCurveTo(x+w, y, x+w, y+r);
  g.lineTo(x+w, y+h-r);
  g.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  g.lineTo(x+r, y+h);
  g.quadraticCurveTo(x, y+h, x, y+h-r);
  g.lineTo(x, y+r);
  g.quadraticCurveTo(x, y, x+r, y);
}

Window_BottomCenterHUD.prototype._updateGaugesOptimized = function(E, A){
  var hp = A.hp, mp = A.mp, tp = A.tp;
  if (E.prevHp !== hp || E.prevMp !== mp || E.prevTp !== tp) {
    E.bars.hp.fill.scale.x = hp / Math.max(1, A.mhp);
    E.bars.mp.fill.scale.x = A.mmp > 0 ? mp / A.mmp : 0;
    E.bars.bo.fill.scale.x = tp / tpLimit(A);
    E.bars.hp.text.text = Math.round(hp) + "/" + A.mhp;
    E.bars.mp.text.text = Math.round(mp) + "/" + A.mmp;
    E.bars.bo.text.text = "Burnout";
  }
  
  var tpr = tp / tpLimit(A);
  var target = clamp(tpr, 0, 1) * HUD.FRACTURE_ALPHA_MAX;
  E.fractureAlpha = lerp(E.fractureAlpha, target, 0.1);
  E.fracture.alpha = E.fractureAlpha;
  E.fracture.mask.scale.x = E.bars.bo.fill.scale.x;
};

Window_BottomCenterHUD.prototype._makeFractureOverlay = function(w,h,count){
  var g = new PIXI.Graphics();
  g.lineStyle(1.2, 0x000000, 0.35);
  for (var i=0;i<count;i++){
    var x = Math.random()*w;
    var y = Math.random()*h;
    var len = 6 + Math.random()*16;
    var ang = Math.random()*Math.PI*2;
    var x2 = x + Math.cos(ang)*len;
    var y2 = y + Math.sin(ang)*len;
    g.moveTo(x, y);
    g.lineTo(x2, y2);

    if (Math.random()<0.45){
      var ang2 = ang + (Math.random()<0.5 ? 1 : -1) * (0.6 + Math.random()*0.6);
      var len2 = len * (0.45 + Math.random()*0.35);
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang2)*len2, y + Math.sin(ang2)*len2);
    }
  }
  var m = new PIXI.Graphics();
  m.beginFill(0xffffff);
  _roundedRect(m, 0,0,w,h, HUD.BORDER_RADIUS);
  m.endFill();
  g.mask = m;
  g.addChild(m);
  g.alpha = 0.0;
  return g;
};

/* =========================
   == Shake Feedback      ==
   ========================= */
Window_BottomCenterHUD.prototype._updateShake = function(E, A){
  var hpd = Math.max(0, Math.abs(A.hp - E.prevHp));
  var mpd = Math.max(0, Math.abs(A.mp - E.prevMp));
  var bod = Math.max(0, Math.abs(A.tp - E.prevTp));

  if (hpd>0) E.shakeX += (Math.random()<0.5 ? -1 : 1) * HUD.SHAKE_HP;
  if (mpd>0) E.shakeX += (Math.random()<0.5 ? -1 : 1) * HUD.SHAKE_MP;
  if (bod>0) E.shakeX += (Math.random()<0.5 ? -1 : 1) * HUD.SHAKE_BO;

  E.shakeY = E.shakeX * 0.25;

  var s = (typeof EX_UI !== 'undefined') ? EX_UI.scaleX() : 1;
  E.container.x = Math.round(E.baseX + (E.shakeX * s));
  E.container.y = Math.round(E.baseY + (E.shakeY * s));

  E.shakeX *= HUD.SHAKE_DECAY;
  E.shakeY *= HUD.SHAKE_DECAY;

  E.prevHp = A.hp; E.prevMp = A.mp; E.prevTp = A.tp;
};

/* =========================
   == Chant Note Bob      ==
   ========================= */
Window_BottomCenterHUD.prototype._updateChantNote = function(E, A){
  if (!HUD.NOTE_ENABLED || !E.note) return;
  var charging = isCharging(A);

  if (charging){
    E.noteTheta += HUD.NOTE_SPEED;
    var bob = Math.sin(E.noteTheta) * HUD.NOTE_BOB_PIX;
    E.note.x = HUD.NOTE_OFFSET_X;
    E.note.y = -(HUD.PORTRAIT_SIZE/2) + HUD.NOTE_OFFSET_Y + bob;
    E.note.alpha = lerp(E.note.alpha, 1.0, 0.15);
  } else {
    E.note.alpha = lerp(E.note.alpha, 0.0, 0.20);
    E.noteTheta = 0;
  }
};

/* =========================
   == On-Sprite Chanting  ==
   ========================= */
Sprite_Battler.prototype.createChantingLabel = function() {
    this._chantingSprite = new Sprite(new Bitmap(32, 32));
    this._chantingSprite.anchor.x = 0.5;
    this._chantingSprite.anchor.y = 1.0;
    this._chantingSprite.y = -70; // Hover above the head
    this._chantingSprite.z = 20; 
    this.addChild(this._chantingSprite);
    this._lastChargeIcon = -1; // Track icon to avoid redrawing every frame
};

Sprite_Battler.prototype.updateChantingLabel = function() {
    if (!this._battler) return;

    // FIX: Lazy Initialization - Creates the sprite on the fly if Yanfly skipped it
    if (!this._chantingSprite) {
        this.createChantingLabel();
    }
    
    // Check if they are currently charging an action
    var charging = (typeof this._battler.isATBCharging === 'function') && this._battler.isATBCharging();
    
    if (!charging) {
        this._chantingSprite.visible = false;
        this._lastChargeIcon = -1;
        return;
    }

    this._chantingSprite.visible = true;
    
    // Determine the icon based on the current action
    var action = this._battler.currentAction();
    var iconId = 79; // Default to Note (Magic)

    if (action && action.item()) {
        var item = action.item();
        if (DataManager.isItem(item)) {
            iconId = 176; // Item Icon
        } else if (DataManager.isSkill(item)) {
            if (item.stypeId === 4 || item.id === 2) {
                iconId = 81; // Shield Icon (Guard / Defense Type)
            } else if (item.stypeId === 2 || item.stypeId === 3 || item.id === 1) {
                iconId = 76; // Sword Icon (Attack / Techs)
            } else {
                iconId = 79; // Musical Note (Verses/Spells)
            }
        }
    }

    // Only draw to the bitmap if the icon has changed
    if (this._lastChargeIcon !== iconId) {
        this._lastChargeIcon = iconId;
        this._chantingSprite.bitmap.clear();
        var iconset = ImageManager.loadSystem('IconSet');
        // Cut out the 32x32 icon from the IconSet and paste it
        this._chantingSprite.bitmap.blt(iconset, iconId % 16 * 32, Math.floor(iconId / 16) * 32, 32, 32, 0, 0);
    }
    
    // Apply a smooth hovering bob effect
    this._chantingSprite.y = -70 + Math.sin(Graphics.frameCount * 0.15) * 6;
};

/* =========================
   == Scene glue          ==
   ========================= */
var _SB_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _SB_createAllWindows.call(this);
  this._noqBottomHUD = new Window_BottomCenterHUD(); // Updated variable name
  this.addChild(this._noqBottomHUD);
};

/* =========================
   == Enemy Chant Notes   ==
   ========================= */
var _SE_init = Sprite_Enemy.prototype.initialize;
Sprite_Enemy.prototype.initialize = function(battler){
  _SE_init.call(this, battler);
  this._noqChantNote = null;
  this._noqNoteTheta = 0;
};

var _SE_update = Sprite_Enemy.prototype.update;
Sprite_Enemy.prototype.update = function(){
  _SE_update.call(this);
  if (!HUD.NOTE_ENABLED) return;
  var b = this._battler;
  if (!b) return;

  if (!this._noqChantNote){
    var t = new PIXI.Text(HUD.NOTE_CHAR, {
      fontFamily : "GameFont",
      fontSize   : 22,
      fill       : "#ffcc66",   
      fontWeight : "bold",
      stroke     : "#000000",
      strokeThickness : 3
    });
    t.anchor.set(0.5, 1);
    t.alpha = 0;
    
    if (typeof EX_UI !== 'undefined') {
        var s = EX_UI.scaleX();
        t.scale.set(s, s);
    }

    this.addChild(t);
    this._noqChantNote = t;
  }

  var note     = this._noqChantNote;
  var charging = (typeof b.isATBCharging === 'function') && b.isATBCharging();

  if (charging){
    this._noqNoteTheta += HUD.NOTE_SPEED;
    var bob = Math.sin(this._noqNoteTheta) * HUD.NOTE_BOB_PIX;
    note.x = 0;
    note.y = -(this.bitmap ? this.bitmap.height * 0.5 : 48) - 12 + bob;
    note.alpha = lerp(note.alpha, 1.0, 0.15);
  } else {
    note.alpha = lerp(note.alpha, 0.0, 0.20);
    this._noqNoteTheta = 0;
  }
};

/* =========================================================
   == NEW: On-Sprite ATB / Charge Gauges (Actors & Enemies) ==
   ========================================================= */
var _Sprite_Battler_update = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function() {
    _Sprite_Battler_update.call(this);
    this.updateChantingLabel(); // Calls the chanting function above
    if (this._battler) {
        this._updateNoqAtbGauge();
    }
};

Sprite_Battler.prototype._updateNoqAtbGauge = function() {
    // 1. Create the gauge graphics on the fly if they don't exist yet
    if (!this._noqAtbContainer) {
        this._noqAtbContainer = new PIXI.Container();
        // Position it just below the battler's feet (Y origin is at the bottom)
        this._noqAtbContainer.y = 8; 
        
        // Background track (Dark, semi-transparent)
        this._noqAtbBg = new PIXI.Graphics();
        this._noqAtbBg.beginFill(0x000000, 0.65);
        this._noqAtbBg.drawRect(-25, 0, 50, 5); 
        this._noqAtbBg.endFill();
        
        // The fill bar
        this._noqAtbFill = new PIXI.Graphics();
        
        this._noqAtbContainer.addChild(this._noqAtbBg);
        this._noqAtbContainer.addChild(this._noqAtbFill);
        
        // Add it to the main sprite
        this.addChild(this._noqAtbContainer);
    }

    // 2. Hide it if the battler is dead, hidden, or transitioning
    if (!this._battler.isAlive() || this._battler.isHidden() || !this.visible) {
        this._noqAtbContainer.visible = false;
        return;
    }
    
    this._noqAtbContainer.visible = true;

    // 3. Fetch current ATB math using your existing helpers
    var atb = atbRate(this._battler);
    var chrg = chargeRate(this._battler);
    var isChrg = isCharging(this._battler);

    var rate = isChrg ? (1 - chrg) : atb;
    var color = isChrg ? HUD.CHARGE_COLOR : HUD.ATB_COLOR;

    // 4. Draw the fill bar dynamically
    this._noqAtbFill.clear();
    if (rate > 0) {
        // We set initial alpha to 1.0, then change it if it is flashing
        this._noqAtbFill.alpha = 1.0; 
        this._noqAtbFill.beginFill(color, 0.95);
        this._noqAtbFill.drawRect(-25, 0, 50 * clamp(rate, 0, 1), 5);
        this._noqAtbFill.endFill();

        // NEW: The 100% ATB Flash Glow
        if (rate >= 1 && !isChrg) {
            // Oscillates alpha between roughly 0.4 and 1.0 using the global frame count
            var pulseValue = 0.7 + (Math.sin(Graphics.frameCount * 0.25) * 0.3);
            this._noqAtbFill.alpha = pulseValue;
        }
    }
};

})();