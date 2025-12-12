/*:
 * @target MV
 * @plugindesc (MV, ES5) Burnout Gauges — Canvas-only bars (no RT), no flicker, MP drain preview, BO throttled
 * @author Noq
 * @help
 * Load BELOW: YEP_CoreEngine, YEP_BattleEngineCore, YEP_X_BattleSysATB,
 *             NoqBurnoutBattleSystemV2, NoqBurnoutBattleLogic.
 *
 * This plugin draws a top-center strip of HP / EN (MP) / BO (TP) for each actor.
 * It uses a single Bitmap per bar and only redraws when the filled width changes.
 */

(function(){
'use strict';

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function tpLimitOf(b){try{if(b&&b.tpLimit)return b.tpLimit();}catch(e){}return 100;}
function burnoutRateOf(b){
  try{ if(b && b.burnoutRate) return b.burnoutRate(); }catch(e){}
  var lim=tpLimitOf(b); return lim>0?clamp((b.tp||0)/lim,0,1):0;
}
function isChanting(b){ try{ if (b&&b.isATBCharging&&b.isATBCharging()) return true; }catch(e){} return !!(b&&b._noqReserve); }

var FX={
  gaugeW: 140,
  gaugeH: 10,
  padY: 6,
  blockGap: 24,
  topMargin: 16,
  fauxPortraitW: 48, gap: 8,

  hp1:'#ff6b6b', hp2:'#b81e1e',
  mp1:'#7dafff', mp2:'#2d56c9',
  tp1:'#ffd86a', tp2:'#ff6b3d',
  back:'#222222', backAlpha:180, border:'#000000', borderAlpha:50,

  lerp:0.15,
  lowHp:0.30, hiBo:0.85
};

function drawBar(bmp, w, h, back, backA, c1, c2, fillPx){
  bmp.clear();
  // back
  bmp.paintOpacity = backA;  // 0..255
  bmp.fillRect(0,0,w,h, back);
  bmp.paintOpacity = 255;

  // border (light)
  bmp.paintOpacity = 255;
  bmp.textColor = '#000000'; // not used; keep defaults
  // subtle rounded edges look with two strips
  bmp.fillRect(0,0,w,1,'#000000');
  bmp.fillRect(0,h-1,w,1,'#000000');
  // gradient fill (left->right) only in fillPx
  if (fillPx > 0){
    bmp.gradientFillRect(0,0, fillPx,h, c1,c2, true);
  }
}

function Sprite_GaugeCanvas(){ this.initialize.apply(this, arguments); }
Sprite_GaugeCanvas.prototype = Object.create(Sprite.prototype);
Sprite_GaugeCanvas.prototype.constructor = Sprite_GaugeCanvas;
Sprite_GaugeCanvas.prototype.initialize = function(w,h,c1,c2){
  Sprite.prototype.initialize.call(this);
  this._w=w; this._h=h; this._c1=c1; this._c2=c2;
  this.bitmap = new Bitmap(w,h);
  this._back = FX.back; this._backA = FX.backAlpha;
  this._lastPx = -1;
  drawBar(this.bitmap, this._w, this._h, this._back, this._backA, this._c1, this._c2, 0);
};
Sprite_GaugeCanvas.prototype.setRate = function(r){
  r = clamp(r,0,1);
  // quantize to pixel width to avoid shimmer
  var px = Math.floor(this._w * r + 0.5);
  if (px === this._lastPx) return;
  this._lastPx = px;
  drawBar(this.bitmap, this._w, this._h, this._back, this._backA, this._c1, this._c2, px);
};

function Sprite_NoQGBlock(){ this.initialize.apply(this, arguments); }
Sprite_NoQGBlock.prototype = Object.create(PIXI.Container.prototype);
Sprite_NoQGBlock.prototype.constructor = Sprite_NoQGBlock;
Sprite_NoQGBlock.prototype.initialize = function(actor, index){
  PIXI.Container.call(this);
  this._actor = actor; this._index = index;

  this._gHP = new Sprite_GaugeCanvas(FX.gaugeW,FX.gaugeH, FX.hp1,FX.hp2);
  this._gMP = new Sprite_GaugeCanvas(FX.gaugeW,FX.gaugeH, FX.mp1,FX.mp2);
  this._gTP = new Sprite_GaugeCanvas(FX.gaugeW,FX.gaugeH, FX.tp1,FX.tp2);
  this.addChild(this._gHP); this.addChild(this._gMP); this.addChild(this._gTP);

  this._vhp=actor.hp; this._vmp=actor.mp; this._vtp=actor.tp;
  this._tpFrame=0;
};
Sprite_NoQGBlock.prototype.setBlockPosition = function(x,y){
  var gx = x + FX.fauxPortraitW + FX.gap;
  var gy = y;
  this._gHP.x=gx; this._gHP.y=gy;
  this._gMP.x=gx; this._gMP.y=gy+(FX.gaugeH+FX.padY);
  this._gTP.x=gx; this._gTP.y=gy+(FX.gaugeH+FX.padY)*2;
};
Sprite_NoQGBlock.prototype.update = function(){
  var a=this._actor; if(!a) return;
  // value smoothing
  this._vhp = lerp(this._vhp, a.hp, FX.lerp);
  this._vmp = lerp(this._vmp, a.mp, FX.lerp);
  this._vtp = lerp(this._vtp, a.tp, FX.lerp);

  // base rates
  var hpr = clamp(this._vhp / Math.max(1,a.mhp), 0, 1);
  var mpr = clamp(this._vmp / Math.max(1,a.mmp), 0, 1);

  // gradual drain preview (reservation)
  if (a._noqReserve && a._noqReserve.mode === 'gradual') {
    var r=a._noqReserve, tot=Math.max(1, r.cost||0), spent=Math.max(0, r.spent||0);
    var frac = spent / tot; // 0..1 of the skill cost
    // visualize as small subtraction; scale from cost to fraction of bar
    mpr = clamp(mpr - frac * 0.25, 0, 1);
  }

  // BO rate with quantization + throttle
  this._tpFrame = (this._tpFrame+1)%3;
  var boRaw = burnoutRateOf(a);
  var boQuant = Math.round(boRaw * 256) / 256; // 1/256th
  if (this._tpFrame===0) this._gTP.setRate(boQuant);

  // HP/MP redraw every frame (pixel-quantized internally)
  this._gHP.setRate(hpr);
  this._gMP.setRate(mpr);

  // subtle pulse for low HP / high BO
  var pulse = (hpr < FX.lowHp) || (boRaw > FX.hiBo);
  var s = 1.0;
  if (pulse){ var t = Graphics.frameCount/60*8.0; s = 1.0 + Math.sin(t)*0.06; }
  this._gHP.scale.y = s;
  this._gTP.scale.y = s;
};

/* ---------- Scene glue ---------- */
var _SB_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _SB_createAllWindows.call(this);
  this._noqGaugeRoot = new PIXI.Container();
  this.addChild(this._noqGaugeRoot);

  var mem=$gameParty.battleMembers();
  this._noqBlocks=[];
  for (var i=0;i<mem.length;i++){
    var b=new Sprite_NoQGBlock(mem[i], i);
    this._noqBlocks.push(b);
    this._noqGaugeRoot.addChild(b);
  }
  this._noqLayoutGauges();
};
Scene_Battle.prototype._noqLayoutGauges = function(){
  var n=this._noqBlocks.length; if(!n) return;
  var blockW = FX.fauxPortraitW + FX.gap + FX.gaugeW;
  var totalW = blockW*n + FX.blockGap*(n-1);
  var startX = Math.floor((Graphics.width-totalW)/2);
  var y = FX.topMargin;
  for (var i=0;i<n;i++){
    var x = startX + i*(blockW+FX.blockGap);
    this._noqBlocks[i].setBlockPosition(x,y);
  }
};
var _SB_startFadeIn = Scene_Battle.prototype.startFadeIn;
Scene_Battle.prototype.startFadeIn = function(speed, white){
  _SB_startFadeIn.call(this, speed, white);
  if (this._noqLayoutGauges) this._noqLayoutGauges();
};
var _SB_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update.call(this);
  if (this._noqBlocks) for (var i=0;i<this._noqBlocks.length;i++) this._noqBlocks[i].update();
};

})();
