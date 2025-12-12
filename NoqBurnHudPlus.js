/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq Battle HUD — top-center portraits + HP/MP/Burnout gauges (fracture), ATB/charge ring, chant note. Safe build.
 * @author Noq
 * @help
 * Actor note tags (img/battlefaces/):
 *   <BattleFace: File>
 *   <BattleFaceLowHP: FileLow>
 *   <BattleFaceBurnout: FileBurn>
 *
 * Load below YEP_* and your Burnout System. This HUD only reads data.
 */

(function(){
"use strict";

/* =========================
   == CONFIG (visuals)    ==
   ========================= */
var HUD = {
  // Layout & scaling
  TOP_OFFSET        : 64,     // vertical from top for portraits
  PORTRAIT_SPACING  : 182,    // space between actors
  CENTER_OFFSET     : -53,    // nudge center horizontally (+right / -left)
  PORTRAIT_SIZE     : 48,
  PORTRAIT_SCALE    : 1.00,
  PORTRAIT_BLEED    : 9,      // mask bleed (for ring overlap)

  // Gauges
  GAUGE_WIDTH       : 112,
  GAUGE_HEIGHT      : 12,
  GAUGE_SPACING_Y   : 6,
  GAUGE_OFFSET_X    : 40,
  GAUGE_OFFSET_Y    : -22,
  BORDER_ALPHA      : 0.65,
  BORDER_RADIUS     : 6,
  BORDER_THIN       : 1.2,

  // Colors
  ATB_COLOR         : 0x9cff88,
  CHARGE_COLOR      : 0xffcc66,
  GRAD_HP           : ["#00ff88", "#00c853"],
  GRAD_MP           : ["#4fc3f7", "#2979ff"],
  GRAD_BO           : ["#ff9e00", "#ff3d00"],

  // Portrait ring pulse
  PULSE_SPEED       : 0.25,   // radians/frame
  PULSE_MIN         : 0.8,    // alpha min
  PULSE_MAX         : 1.0,    // alpha max
  RING_SEGMENTS     : 64,     // higher = smoother ring (uses line segments)

  // Fracture overlay (burnout)
  FRACTURE_LINES    : 26,     // how many crack segments to draw
  FRACTURE_ALPHA_MAX: 0.9,    // max overlay opacity
  FRACTURE_SMOOTH   : 0.12,   // lerp speed for fracture opacity
  DEFRACTURE_SMOOTH : 0.08,   // slightly slower heal feel

  // Shake feedback (lighter; no drift)
  SHAKE_DECAY       : 0.80,
  SHAKE_HP          : 2,
  SHAKE_MP          : 1,
  SHAKE_BO          : 1,

  // Chant note (on portrait; battler-side icon can be added later)
  NOTE_ENABLED      : true,
  NOTE_CHAR         : "♪",
  NOTE_BOB_PIX      : 6,
  NOTE_SPEED        : 0.15,
  NOTE_OFFSET_X     : -18,
  NOTE_OFFSET_Y     : -42,

  // Value text
  TEXT_COLOR        : "#000000",
  TEXT_SIZE         : 18,
  TEXT_Y_OFF        : -1,

  // Burnout text pulsing ≥ 75%
  BO_PULSE_THRESH   : 0.75,
  BO_PULSE_SPEED    : 0.18,
  BO_PULSE_MIN      : 0.65,
  BO_PULSE_MAX      : 1.00,

  DEBUG             : false
};

/* =========================
   == Helpers              ==
   ========================= */
function tpLimit(b){ try{ return b.tpLimit ? Math.max(1, b.tpLimit()) : 100; }catch(e){ return 100; } }
function tpRate(b){ try{ return Math.max(0, Math.min(1, (b.tp||0)/tpLimit(b))); }catch(e){ return 0; } }
function atbRate(b){ return (b.atbRate && b.atbRate()) || 0; }
function chargeRate(b){ return (b.atbChargeRate && b.atbChargeRate()) || 0; }
function isCharging(b){ return (typeof b.isATBCharging === 'function') ? b.isATBCharging() : false; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function lerp(a,b,t){ return a + (b-a)*t; }
function log(){ if (HUD.DEBUG) console.log.apply(console, arguments); }

/* =========================
   == HUD Window          ==
   ========================= */
function Window_TopCenterHUD(){
  this.initialize.apply(this, arguments);
}
Window_TopCenterHUD.prototype = Object.create(Window_Base.prototype);
Window_TopCenterHUD.prototype.constructor = Window_TopCenterHUD;

Window_TopCenterHUD.prototype.initialize = function(){
  Window_Base.prototype.initialize.call(this, 0, 0, Graphics.width, Graphics.height);
  this.opacity = 0;
  this._actorEntries = [];
  this.createActorEntries();
};

Window_TopCenterHUD.prototype.createActorEntries = function(){
  var actors = $gameParty.battleMembers();
  this._actorEntries = [];

  for (var i=0; i<actors.length; i++){
    var a = actors[i];
    var cont = new PIXI.Container();
    this.addChild(cont);

    // Portrait sprite (masked circle)
    var faceName = this._faceFor(a);
    var bmp      = ImageManager.loadBitmap("img/battlefaces/", faceName);
    bmp.smooth   = false;
    var spr      = new Sprite(bmp);
    spr.anchor.set(0.5, 0.5);
    spr.scale.set(HUD.PORTRAIT_SCALE);
    if (spr.texture && spr.texture.baseTexture)
      spr.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

    var mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawCircle(0,0,(HUD.PORTRAIT_SIZE/2)+HUD.PORTRAIT_BLEED);
    mask.endFill();
    spr.mask = mask;

    // Ring (as segments instead of arc())
    var ring = new PIXI.Graphics();

    // Gauges container
    var gauges = new PIXI.Container();

    // Chant note (optional)
    var note = null;
    if (HUD.NOTE_ENABLED) {
      var txt = new PIXI.Text(HUD.NOTE_CHAR, {
        fontFamily: "GameFont",
        fontSize: 20,
        fill: HUD.TEXT_COLOR,
        fontWeight: "bold"
      });
      txt.anchor.set(0.5, 1);
      txt.alpha = 0.0;
      note = txt;
    }

    // Build three gauges (HP/MP/BO)
    var bars = this._buildGauges();

    // Fracture overlay for Burnout (pure Graphics; no render-to-texture)
    var frac = this._makeFractureOverlay(HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT, HUD.FRACTURE_LINES);

    cont.addChild(spr);
    cont.addChild(mask);
    cont.addChild(ring);
    cont.addChild(gauges);
    if (note) cont.addChild(note);

    // Position gauges under portrait
    bars.root.x = HUD.GAUGE_OFFSET_X;
    bars.root.y = HUD.GAUGE_OFFSET_Y;
    gauges.addChild(bars.root);

    // Burnout fracture sits above burnout fill
    bars.bo.upper.addChild(frac);

    this._actorEntries.push({
      actor: a,
      baseX: 0, baseY: 0,
      container: cont,
      sprite: spr,
      mask: mask,
      ring: ring,
      gauges: gauges,
      bars: bars,
      fracture: frac,
      fractureAlpha: 0.0,
      shakeX: 0, shakeY: 0,
      prevHp: a.hp, prevMp: a.mp, prevTp: a.tp,
      atbSm: 0, chSm: 0,
      note: note,
      noteTheta: 0,
      boPulseTheta: 0
    });
  }
};

/* -- Layout horizontally across top center -- */
Window_TopCenterHUD.prototype.update = function(){
  Window_Base.prototype.update.call(this);
  this._updateLayout();
  this._updateVisuals();
};

Window_TopCenterHUD.prototype._updateLayout = function(){
  var total = this._actorEntries.length;
  var midX  = Graphics.width / 2 + HUD.CENTER_OFFSET;
  var totalW = (total-1) * HUD.PORTRAIT_SPACING;
  var startX = midX - totalW/2;

  for (var i=0; i<total; i++){
    var e = this._actorEntries[i];
    e.baseX = startX + (i * HUD.PORTRAIT_SPACING);
    e.baseY = HUD.TOP_OFFSET;
    // apply current shake offset (non-drifting)
    e.container.x = Math.round(e.baseX + e.shakeX);
    e.container.y = Math.round(e.baseY + e.shakeY);
  }
};

/* -- Visual updates -- */
Window_TopCenterHUD.prototype._updateVisuals = function(){
  for (var i=0; i<this._actorEntries.length; i++){
    var E = this._actorEntries[i], A = E.actor;
    // swap portrait by state
    this._updatePortrait(E, A);
    // ring (ATB/charge)
    this._updateRing(E, A);
    // gauges + fracture + burnout text pulse
    this._updateGauges(E, A);
    // shake feedback (light, decays to zero)
    this._updateShake(E, A);
    // chant note bob
    this._updateChantNote(E, A);
  }
};

/* =========================
   == Portrait helpers    ==
   ========================= */
Window_TopCenterHUD.prototype._actorNote = function(a){
  var data = a.actor ? a.actor() : null;
  return data && data.note ? data.note : "";
};
Window_TopCenterHUD.prototype._faceFor = function(a){
  var note = this._actorNote(a);
  var m = note.match(/<BattleFace\s*:\s*(.+?)>/i);
  return (m && m[1]) ? m[1].trim() : "Blank";
};
Window_TopCenterHUD.prototype._faceLowFor = function(a){
  var note = this._actorNote(a);
  var m = note.match(/<BattleFaceLowHP\s*:\s*(.+?)>/i);
  return (m && m[1]) ? m[1].trim() : this._faceFor(a);
};
Window_TopCenterHUD.prototype._faceBurnFor = function(a){
  var note = this._actorNote(a);
  var m = note.match(/<BattleFaceBurnout\s*:\s*(.+?)>/i);
  return (m && m[1]) ? m[1].trim() : this._faceFor(a);
};

Window_TopCenterHUD.prototype._updatePortrait = function(E, A){
  var face = this._faceFor(A);
  if (A.mhp > 0 && A.hp / A.mhp < 0.25) face = this._faceLowFor(A);
  else if (tpRate(A) >= 0.75) face = this._faceBurnFor(A);

  // swap bitmap only when name would change (avoid thrash)
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
Window_TopCenterHUD.prototype._updateRing = function(E, A){
  var g = E.ring;
  g.clear();

  var atb    = atbRate(A);
  var charge = chargeRate(A);

  E.atbSm = lerp(E.atbSm, atb, 0.25);
  E.chSm  = lerp(E.chSm , charge, 0.25);

  var charging = isCharging(A);
  var col   = charging ? HUD.CHARGE_COLOR : HUD.ATB_COLOR;
  var rate  = charging ? (1 - E.chSm) : E.atbSm;
  rate = clamp(rate, 0, 1);

  // subtle pulse at full/charging
  var alpha = 0.9;
  if (charging || atb >= 0.999){
    var s = Math.sin(Graphics.frameCount * HUD.PULSE_SPEED);
    var k = HUD.PULSE_MIN + (HUD.PULSE_MAX - HUD.PULSE_MIN) * (0.5 + 0.5*s);
    alpha *= k;
  }

  // segmented ring (safe across MV PIXI versions)
  var r = (HUD.PORTRAIT_SIZE/2)+8;
  var segs = Math.max(6, Math.floor(HUD.RING_SEGMENTS * rate));
  g.lineStyle(3, col, alpha);
  for (var s2=0; s2<segs; s2++){
    var a1 = -Math.PI/2 + (s2/segs)*rate*Math.PI*2;
    var a2 = -Math.PI/2 + ((s2+1)/segs)*rate*Math.PI*2;
    g.moveTo(Math.cos(a1)*r, Math.sin(a1)*r);
    g.lineTo(Math.cos(a2)*r, Math.sin(a2)*r);
  }
};

/* =========================
   == Gauges + fracture    ==
   ========================= */
Window_TopCenterHUD.prototype._buildGauges = function(){
  var root = new PIXI.Container();

  function mkGauge(gradA, gradB, labelMode){
    var lower = new PIXI.Container();
    var upper = new PIXI.Container();

    // border + background (Graphics, not baked)
    var bg = new PIXI.Graphics();
    bg.beginFill(0xffffff, 0.10);
    _roundedRect(bg, 0,0, HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT, HUD.BORDER_RADIUS);
    bg.endFill();
    var border = new PIXI.Graphics();
    border.lineStyle(HUD.BORDER_THIN, 0x000000, HUD.BORDER_ALPHA);
    _roundedRect(border, 0,0, HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT, HUD.BORDER_RADIUS);

    // fill sprite (Bitmap gradient)
    var fill = new Sprite(new Bitmap(HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT));
    fill.bitmap.gradientFillRect(0,0,HUD.GAUGE_WIDTH,HUD.GAUGE_HEIGHT,gradA,gradB,false);
    fill.scale.x = 1.0;
    // clip fill to rounded shape via mask
    var msk = new PIXI.Graphics();
    msk.beginFill(0xffffff);
    _roundedRect(msk, 0,0, HUD.GAUGE_WIDTH, HUD.GAUGE_HEIGHT, HUD.BORDER_RADIUS);
    msk.endFill();
    fill.mask = msk;
    upper.addChild(msk);

    // text
    var txt = new PIXI.Text("", {
      fontFamily: "GameFont",
      fontSize: HUD.TEXT_SIZE,
      fill: HUD.TEXT_COLOR,
      fontWeight: "bold"
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
  var bo = mkGauge(HUD.GRAD_BO[0], HUD.GRAD_BO[1], "burnout"); // special label/pulse

  // stack vertically
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
  // simple rounded rect path that’s MV/PIXI-safe
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

Window_TopCenterHUD.prototype._updateGauges = function(E, A){
  // values
  var mhp = Math.max(1, A.mhp||1);
  var mmp = Math.max(0, A.mmp||0);
  var tpl = tpLimit(A);

  var hpv = clamp(A.hp, 0, mhp);
  var mpv = clamp(A.mp, 0, mmp);
  var tpv = clamp(A.tp, 0, tpl);

  var hpr = hpv / mhp;
  var mpr = (mmp>0) ? (mpv / mmp) : 0;
  var tpr = (tpl>0) ? (tpv / tpl) : 0;

  // fill scales (clip handled by mask)
  E.bars.hp.fill.scale.x = hpr;
  E.bars.mp.fill.scale.x = mpr;
  E.bars.bo.fill.scale.x = tpr;

  // HP/MP numbers; Burnout shows label only
  E.bars.hp.text.text = Math.round(hpv) + "/" + mhp;
  E.bars.mp.text.text = Math.round(mpv) + "/" + mmp;
  E.bars.bo.text.text = "Burnout";

  // Burnout text pulse when gauge high
  if (tpr >= HUD.BO_PULSE_THRESH){
    E.boPulseTheta += HUD.BO_PULSE_SPEED;
    var k = HUD.BO_PULSE_MIN + (HUD.BO_PULSE_MAX - HUD.BO_PULSE_MIN) * (0.5 + 0.5*Math.sin(E.boPulseTheta));
    E.bars.bo.text.alpha = k;
  } else {
    E.boPulseTheta = 0;
    E.bars.bo.text.alpha = 1.0;
  }

  // fracture opacity follows burnout (smooth defracture)
  var target = clamp(tpr, 0, 1) * HUD.FRACTURE_ALPHA_MAX;
  var smooth = (target < E.fractureAlpha) ? HUD.DEFRACTURE_SMOOTH : HUD.FRACTURE_SMOOTH;
  E.fractureAlpha = lerp(E.fractureAlpha, target, smooth);
  E.fracture.alpha = E.fractureAlpha;

  // clip fracture to fill width by syncing mask scale to fill scale
  // (fracture lives in bo.upper local space)
  E.fracture.mask.scale.x = E.bars.bo.fill.scale.x;
};

Window_TopCenterHUD.prototype._makeFractureOverlay = function(w,h,count){
  // Draw random crack lines into a Graphics kept live (no baking)
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
  // mask so cracks clip to rounded bar area
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
Window_TopCenterHUD.prototype._updateShake = function(E, A){
  var hpd = Math.max(0, Math.abs(A.hp - E.prevHp));
  var mpd = Math.max(0, Math.abs(A.mp - E.prevMp));
  var bod = Math.max(0, Math.abs(A.tp - E.prevTp));

  if (hpd>0) E.shakeX += (Math.random()<0.5 ? -1 : 1) * HUD.SHAKE_HP;
  if (mpd>0) E.shakeX += (Math.random()<0.5 ? -1 : 1) * HUD.SHAKE_MP;
  if (bod>0) E.shakeX += (Math.random()<0.5 ? -1 : 1) * HUD.SHAKE_BO;

  E.shakeY = E.shakeX * 0.25;

  // apply to container from base (no drift)
  E.container.x = Math.round(E.baseX + E.shakeX);
  E.container.y = Math.round(E.baseY + E.shakeY);

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

})();

