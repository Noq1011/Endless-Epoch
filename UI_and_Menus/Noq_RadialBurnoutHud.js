/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq Battle HUD — Radial UI (EX_UI Scaling Compatible)
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

var UI = typeof EX_UI !== 'undefined' ? EX_UI : {
  scale: function(v){ return v; },
  scaleX: function(){ return 1; },
  centerX: function(){ return Graphics.boxWidth / 2; }
};

var HUD = {
  TOP_OFFSET        : 90,     
  PORTRAIT_SPACING  : 312,    
  CENTER_OFFSET     : -53,
  PORTRAIT_SIZE     : 92,     
  PORTRAIT_SCALE    : 2.00,   
  PORTRAIT_BLEED    : 10,     
  
  RING_ATB_RADIUS   : 60,  
  RING_STAT_THICK   : 4,

  // --- Colors ---
  GRAD_HP           : { c1: '#00ffee', c2: 'rgba(0,100,150,0.75)' }, 
  GRAD_MP           : { c1: '#44aaff', c2: 'rgba(0,30,200,0.75)' },
  GRAD_BO           : { c1: '#ffaa44', c2: 'rgba(150,0,255,0.75)' },
  ATB_COLOR         : 0x9cff88,
  CHARGE_COLOR      : 0xffcc66,
  
  // --- Thresholds & Shake ---
  BURNOUT_STATE_ID  : 15,   // <--- Change to your Burnout State ID!
  CRIT_HP_RATE      : 0.25,
  CRIT_MP_RATE      : 0.25,
  CRIT_BO_RATE      : 0.75,
  CRIT_HP_COLOR     : "#ff3333",
  CRIT_MP_COLOR     : "#ffaa00",
  CRIT_BO_COLOR     : "#ff3333",

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
  TEXT_STROKE_THICK : 3
};

// --- Helpers ---
function tpLimit(b){ try{ return b.tpLimit ? Math.max(1, b.tpLimit()) : 100; }catch(e){ return 100; } }
function tpRate(b){ try{ return Math.max(0, Math.min(1, (b.tp||0)/tpLimit(b))); }catch(e){ return 0; } }
function atbRate(b){ return (b.atbRate && b.atbRate()) || 0; }
function chargeRate(b){ return (b.atbChargeRate && b.atbChargeRate()) || 0; }
function isCharging(b){ return (typeof b.isATBCharging === 'function') ? b.isATBCharging() : false; }
function lerp(a,b,t){ return a + (b-a)*t; }

function Window_TopCenterHUD(){
  this.initialize.apply(this, arguments);
}
Window_TopCenterHUD.prototype = Object.create(Window_Base.prototype);
Window_TopCenterHUD.prototype.constructor = Window_TopCenterHUD;

Window_TopCenterHUD.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, Graphics.boxWidth, Graphics.boxHeight);
  this.opacity = 0;
  this._actorEntries = [];
  this.createActorEntries();
};

Window_TopCenterHUD.prototype._buildSatelliteGlobe = function(radius, color1, color2, labelTxt) {
    var container = new PIXI.Container();
    
    var glass = new PIXI.Graphics();
    glass.beginFill(0x020210, 0.8);
    glass.drawCircle(0, 0, radius);
    glass.endFill();
    
    var shine = new PIXI.Graphics();
    shine.beginFill(0xffffff, 0.25);
    shine.drawCircle(-radius * 0.3, -radius * 0.3, radius * 0.3);
    shine.endFill();

    var starGroup = new PIXI.Container();
    var starMask = new PIXI.Graphics();
    starMask.beginFill(0xffffff);
    starMask.drawCircle(0, 0, radius);
    starMask.endFill();
    starGroup.mask = starMask;

    var stars = [];
    for (var s = 0; s < 15; s++) { 
        var star = new PIXI.Graphics();
        var size = Math.random() < 0.5 ? 1 : 2;
        star.beginFill(0xffffff, Math.random() * 0.5 + 0.3);
        star.drawRect(0, 0, size, size);
        star.endFill();
        star.x = (Math.random() - 0.5) * radius * 2;
        star.y = (Math.random() - 0.5) * radius * 2;
        star._speed = (Math.random() * 0.4) + 0.1;
        starGroup.addChild(star);
        stars.push(star);
    }

    var lavaBmp = new Bitmap(radius * 2, radius * 2);
    var ctx = lavaBmp._context;
    var grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    grad.addColorStop(0, color1);
    grad.addColorStop(1, color2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(radius, radius, radius * 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    var lava = new Sprite(lavaBmp);
    lava.anchor.set(0.5);
    lava.blendMode = 1;
    
    // Internal Identifier (HP, EN, BO)
    var lbl = new PIXI.Text(labelTxt, {
        fontFamily: "GameFont", fontSize: 11, fill: "#ffffff",
        fontWeight: "bold", stroke: "#000000", strokeThickness: 3
    });
    lbl.anchor.set(0.5);
    lbl.y = 1; 

    // NEW: External Readout (Numbers / Status)
    var lblOuter = new PIXI.Text("", {
        fontFamily: "GameFont", fontSize: 13, fill: "#ffffff",
        fontWeight: "bold", stroke: "#000000", strokeThickness: 3
    });
    lblOuter.anchor.set(0, 0.5); // Left-aligned
    lblOuter.x = radius + 8;     // Pushed to the right of the globe

    var ringSize = (radius + 8) * 2;
    var ringBmp = new Bitmap(ringSize, ringSize);
    var ringSpr = new Sprite(ringBmp);
    ringSpr.anchor.set(0.5);

    var tail = new PIXI.Graphics();

    container.addChild(glass);
    container.addChild(starMask);
    container.addChild(starGroup);
    container.addChild(lava);
    container.addChild(shine);
    container.addChild(lbl); 
    container.addChild(ringSpr);
    container.addChild(tail);
    container.addChild(lblOuter); // Outer text added

    return { 
        root: container, lava: lava, ringBmp: ringBmp, ringSpr: ringSpr,
        tail: tail, radius: radius, ringSize: ringSize, theta: 0,
        portraitTheta: 0, stars: stars, lblOuter: lblOuter
    };
};

Window_TopCenterHUD.prototype.createActorEntries = function() {
    var actors = $gameParty.battleMembers();
    this._actorEntries = [];
    
    for (var i = 0; i < actors.length; i++) {
        var a = actors[i];
        var cont = new PIXI.Container();
        this.addChild(cont);

        var faceGroup = new PIXI.Container();
        var bmp = ImageManager.loadBitmap("img/battlefaces/", this._faceFor(a));
        var spr = new Sprite(bmp);
        spr.anchor.set(0.5);
        spr.scale.set(HUD.PORTRAIT_SCALE);
        
        var mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawCircle(0, 0, (HUD.PORTRAIT_SIZE/2) + HUD.PORTRAIT_BLEED);
        mask.endFill();
        faceGroup.addChild(spr);
        faceGroup.mask = mask;

        var shadow = new PIXI.Graphics();
        shadow.beginFill(0x000000, 0.55);
        shadow.drawCircle(4, 6, (HUD.PORTRAIT_SIZE/2) + HUD.PORTRAIT_BLEED); 
        shadow.endFill();

        var ring = new PIXI.Graphics(); 

        // Increased Radii
        var hpSat = this._buildSatelliteGlobe(19, HUD.GRAD_HP.c1, 'rgba(0,100,150,0)', "HP");
        var enSat = this._buildSatelliteGlobe(17, HUD.GRAD_MP.c1, 'rgba(0,30,200,0)', "EN");
        var boSat = this._buildSatelliteGlobe(17, HUD.GRAD_BO.c1, 'rgba(150,0,255,0)', "BO");

        // The ')' Arc shape wrapping the ATB ring
        hpSat.baseOffsetX = 75;   hpSat.baseOffsetY = -44;
        enSat.baseOffsetX = 85;   enSat.baseOffsetY = 0;
        boSat.baseOffsetX = 70;   boSat.baseOffsetY = 44;

        hpSat.portraitTheta = -Math.PI / 4;
        enSat.portraitTheta = 0;
        boSat.portraitTheta = Math.PI / 4;

        var note = null;
        if (HUD.NOTE_ENABLED) {
          note = new PIXI.Text(HUD.NOTE_CHAR, {
            fontFamily: "GameFont", fontSize: 20, fill: HUD.TEXT_COLOR,
            fontWeight: "bold", stroke: HUD.TEXT_STROKE, strokeThickness: HUD.TEXT_STROKE_THICK
          });
          note.anchor.set(0.5, 1);
          note.alpha = 0.0;
        }

        cont.addChild(shadow); 
        cont.addChild(faceGroup);
        cont.addChild(mask);
        cont.addChild(ring);
        cont.addChild(hpSat.root);
        cont.addChild(enSat.root);
        cont.addChild(boSat.root);
        if (note) cont.addChild(note);
        
        this._actorEntries.push({
            actor: a, container: cont, sprite: spr, ring: ring, note: note,
            hpSat: hpSat, enSat: enSat, boSat: boSat,
            prevHp: -1, prevMp: -1, prevTp: -1,
            lastAtb: -2, lastChrg: -2, lastIsChrg: false,
            shakeX: 0, shakeY: 0, noteTheta: 0 
        });
    }
};

Window_TopCenterHUD.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  if (this._actorEntries.length > 0) {
    this._updateLayout();
    this._updateVisuals();
  }
};

Window_TopCenterHUD.prototype._updateLayout = function(){
  var s = UI.scaleX(); 
  var midX = (Graphics.boxWidth / 2) + (HUD.CENTER_OFFSET * s);
  var spacing = HUD.PORTRAIT_SPACING * s;
  var startX = midX - ((this._actorEntries.length - 1) * spacing) / 2;

  for (var i=0; i<this._actorEntries.length; i++){
    var e = this._actorEntries[i];
    if (!e.container) continue; 

    e.baseX = startX + (i * spacing);
    e.baseY = HUD.TOP_OFFSET * s;
    
    e.container.scale.set(s, s);
    e.container.x = Math.round(e.baseX + (e.shakeX * s));
    e.container.y = Math.round(e.baseY + (e.shakeY * s));
  }
};

Window_TopCenterHUD.prototype._updateVisuals = function(){
  for (var i=0; i<this._actorEntries.length; i++){
    var E = this._actorEntries[i], A = E.actor;
    this._updatePortrait(E, A);
    this._updateRingOptimized(E, A);
    this._updateGaugesOptimized(E, A);
    this._updateShake(E, A);
    this._updateChantNote(E, A);
  }
};

Window_TopCenterHUD.prototype._actorNote = function(a){ return a.actor ? a.actor().note : ""; };
Window_TopCenterHUD.prototype._faceFor = function(a){
  var m = this._actorNote(a).match(/<BattleFace\s*:\s*(.+?)>/i);
  return m ? m[1].trim() : "Blank";
};
Window_TopCenterHUD.prototype._faceLowFor = function(a){
  var m = this._actorNote(a).match(/<BattleFaceLowHP\s*:\s*(.+?)>/i);
  return (m && m[1]) ? m[1].trim() : this._faceFor(a);
};
Window_TopCenterHUD.prototype._faceBurnFor = function(a){
  var m = this._actorNote(a).match(/<BattleFaceBurnout\s*:\s*(.+?)>/i);
  return (m && m[1]) ? m[1].trim() : this._faceFor(a);
};

Window_TopCenterHUD.prototype._updatePortrait = function(E, A){
  var face = this._faceFor(A);
  if (A.mhp > 0 && A.hp / A.mhp <= HUD.CRIT_HP_RATE) face = this._faceLowFor(A);
  else if (tpRate(A) >= HUD.CRIT_BO_RATE) face = this._faceBurnFor(A);

  var wantUrl = "img/battlefaces/" + face;
  if (!E.sprite._noqUrl || E.sprite._noqUrl !== wantUrl){
    var bmp = ImageManager.loadBitmap("img/battlefaces/", face);
    bmp.smooth = false;
    E.sprite.bitmap = bmp;
    E.sprite._noqUrl = wantUrl;
  }
};

Window_TopCenterHUD.prototype._updateRingOptimized = function(E, A){
    var atb = atbRate(A);
    var chrg = chargeRate(A);
    var isChrg = isCharging(A);

    if (Math.abs(E.lastAtb - atb) < 0.001 && Math.abs(E.lastChrg - chrg) < 0.001 && E.lastIsChrg === isChrg) return; 

    E.lastAtb = atb; E.lastChrg = chrg; E.lastIsChrg = isChrg;
    var g = E.ring;
    g.clear();

    var col = isChrg ? HUD.CHARGE_COLOR : HUD.ATB_COLOR;
    var rate = isChrg ? (1 - chrg) : atb;
    var r = HUD.RING_ATB_RADIUS;
    
    g.lineStyle(HUD.RING_STAT_THICK, col, 0.9);
    g.moveTo(0, -r);
    var endAngle = -Math.PI / 2 + (rate * Math.PI * 2);
    g.arc(0, 0, r, -Math.PI / 2, endAngle, false);
};

Window_TopCenterHUD.prototype._drawCanvasArc = function(sat, rate, colors) {
    var bmp = sat.ringBmp;
    var ctx = bmp._context;
    var r = sat.radius + 4; 
    var c = sat.ringSize / 2;

    ctx.clearRect(0, 0, sat.ringSize, sat.ringSize);
    if (rate <= 0) { bmp._setDirty(); return; }

    var grad = ctx.createLinearGradient(0, 0, 0, sat.ringSize);
    grad.addColorStop(0, colors.c1);
    grad.addColorStop(1, colors.c2);

    ctx.beginPath();
    ctx.arc(c, c, r, -Math.PI / 2, -Math.PI / 2 + (rate * Math.PI * 2));
    ctx.lineWidth = 4;
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.stroke();

    bmp._setDirty();
};

Window_TopCenterHUD.prototype._drawTailFade = function(g, radius, rate) {
    g.clear();
    if (rate > 0.02 && rate < 0.99) { 
        var endAngle = -Math.PI / 2 + (rate * Math.PI * 2);
        var thick = HUD.RING_STAT_THICK + 2;

        for (var i = 1; i <= 5; i++) {
            var startAngle = endAngle - (0.04 * i); 
            if (startAngle < -Math.PI / 2) startAngle = -Math.PI / 2;

            g.lineStyle(thick, 0x000000, 0.2); 
            g.moveTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
            g.arc(0, 0, radius, startAngle, endAngle, false);
        }
    }
};

Window_TopCenterHUD.prototype._updateGaugesOptimized = function(E, A) {
    var hpRate = A.hpRate(), mpRate = A.mpRate(), boRate = A.tp / 100;
    var isChrg = isCharging(A);
    var isDead = A.isDead();
    var isBOCrit = boRate >= HUD.CRIT_BO_RATE;
    var isBurnoutState = A.isStateAffected(HUD.BURNOUT_STATE_ID); 
    
    var time = Date.now();

    if (E.prevHp !== A.hp || E.prevMp !== A.mp || E.prevTp !== A.tp) {
        this._drawCanvasArc(E.hpSat, hpRate, HUD.GRAD_HP);
        this._drawCanvasArc(E.enSat, mpRate, HUD.GRAD_MP);
        this._drawCanvasArc(E.boSat, boRate, HUD.GRAD_BO);
        
        this._drawTailFade(E.hpSat.tail, E.hpSat.radius + 4, hpRate);
        this._drawTailFade(E.enSat.tail, E.enSat.radius + 4, mpRate);
        this._drawTailFade(E.boSat.tail, E.boSat.radius + 4, boRate);
        
        E.prevHp = A.hp; E.prevMp = A.mp; E.prevTp = A.tp;
    }

    var satellites = [
        { obj: E.hpSat, rate: 1 - hpRate, type: 'HP' }, 
        { obj: E.enSat, rate: 1 - mpRate, type: 'EN' }, 
        { obj: E.boSat, rate: boRate,     type: 'BO' }      
    ];

    satellites.forEach(function(sat) {
        var s = sat.obj;
        var urgency = sat.rate;
        var isOrbitingPortrait = false;

        // 1. Text Readouts
        if (sat.type === 'HP') {
            s.lblOuter.text = Math.round(A.hp) + " / " + A.mhp;
            s.lblOuter.style.fill = urgency >= (1 - HUD.CRIT_HP_RATE) ? HUD.CRIT_HP_COLOR : "#ffffff";
        } else if (sat.type === 'EN') {
            s.lblOuter.text = Math.round(A.mp) + " / " + A.mmp;
            s.lblOuter.style.fill = urgency >= (1 - HUD.CRIT_MP_RATE) ? HUD.CRIT_MP_COLOR : "#ffffff";
        } else if (sat.type === 'BO') {
            var boText = "Low";
            if (boRate >= HUD.CRIT_BO_RATE) boText = "CRITICAL";
            else if (boRate >= 0.4) boText = "High";
            s.lblOuter.text = boText;
            s.lblOuter.style.fill = isBOCrit ? HUD.CRIT_BO_COLOR : "#ffffff";
        }

        // 2. Update Internal Stars
        for (var j = 0; j < s.stars.length; j++) {
            var star = s.stars[j];
            star.x += star._speed;
            if (star.x > s.radius) {
                star.x = -s.radius;
                star.y = (Math.random() - 0.5) * s.radius * 2;
            }
        }

        // 3. Determine Coordinates
        var targetX, targetY;
        
        if (isDead) {
            isOrbitingPortrait = true;
        } else if (sat.type === 'BO' && isBurnoutState) {
            isOrbitingPortrait = true; 
        }

        if (isOrbitingPortrait) {
            s.portraitTheta += 0.02 + (urgency * 0.02);
            targetX = Math.cos(s.portraitTheta) * 75;
            targetY = Math.sin(s.portraitTheta) * 75;
        } else {
            targetX = s.baseOffsetX;
            targetY = s.baseOffsetY;
            if (isChrg) targetX -= 25; 
        }

        if (s.curX === undefined) s.curX = targetX;
        if (s.curY === undefined) s.curY = targetY;

        s.curX = lerp(s.curX, targetX, 0.15);
        s.curY = lerp(s.curY, targetY, 0.15);

        var finalX = s.curX;
        var finalY = s.curY;

        // 4. Critical Shake and Pulse
        if (sat.type === 'BO' && (isBOCrit || isBurnoutState) && !isDead) {
            finalX += (Math.random() - 0.5) * 4;
            finalY += (Math.random() - 0.5) * 4;
            
            var fastPulse = (Math.sin(time / 100) + 1) / 2;
            s.lava.alpha = 0.7 + (fastPulse * 0.3);
            s.lava.scale.set(1.0 + (fastPulse * 0.15));
        } else {
            var pulse = (Math.sin(time / 500) + 1) / 2;
            s.lava.alpha = 0.4 + (0.6 * urgency) + (pulse * 0.2);
            s.lava.scale.set(0.9 + (pulse * 0.1 * urgency));
        }

        s.root.x = finalX;
        s.root.y = finalY;
    });
};

/* =========================
   == Shake Feedback      ==
   ========================= */
Window_TopCenterHUD.prototype._updateShake = function(E, A){
  var hpd = Math.max(0, Math.abs(A.hp - E.prevHp));
  var mpd = Math.max(0, Math.abs(A.mp - E.prevMp));
  var bod = Math.max(0, Math.abs(A.tp - E.prevTp));

  if (hpd>0) E.shakeX += (Math.random()<0.5 ? -1 : 1) * HUD.SHAKE_HP;
  if (mpd>0) E.shakeX += (Math.random()<0.5 ? -1 : 1) * HUD.SHAKE_MP;
  if (bod>0) E.shakeX += (Math.random()<0.5 ? -1 : 1) * HUD.SHAKE_BO;

  // RESTORED/ADDED: Shake the UI slightly when chanting!
  if (isCharging(A)) {
      E.shakeX += (Math.random() - 0.5) * 2;
  }

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
Window_TopCenterHUD.prototype._updateChantNote = function(E, A){
  if (!E.note) return;
  var charging = isCharging(A);
  if (charging){
    E.noteTheta += HUD.NOTE_SPEED;
    var bob = Math.sin(E.noteTheta) * HUD.NOTE_BOB_PIX;
    
    E.note.x = HUD.NOTE_OFFSET_X;
    E.note.y = HUD.NOTE_OFFSET_Y + bob;
    E.note.alpha = lerp(E.note.alpha, 1.0, 0.25);
  } else {
    E.note.alpha = lerp(E.note.alpha, 0.0, 0.25);
  }
};

/* =========================
   == Scene glue          ==
   ========================= */
var _SB_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _SB_createAllWindows.call(this);
  this._noqTopHUD = new Window_TopCenterHUD();
  this.addChild(this._noqTopHUD);
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

})();