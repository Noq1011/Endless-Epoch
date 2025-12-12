/*:
 * @target MV
 * @plugindesc (MV ES5) Battle Circle Frame v1.1 — edge circles + music icons, top faded banner, bottom-left battle log, right-side help (with peek).
 * @author Noq + Tyson
 *
 * @help
 * Commands:
 *   BCFVisible on/off
 *   BCFColor #RRGGBB <alpha> <thick>
 *   BCFCircles <radius> <gap> <inset>
 *   BCFIcons <everyN> <scale> <idx1 idx2 ...>
 *   BCFTopBanner on/off <height> <alpha>
 *   BCFLog <width> <height> <lines>
 *   BCFPeek <pixels>          # how far circles/icons dip into the screen
 *   BCFRebuild
 */

(function(){
'use strict';

var CFG = {
  visible: true,
  color: 0xffffff,
  alpha: 0.55,
  thick: 6,
  radius: 24,
  gap: 56,
  inset: 18,
  peek: 10,                // <-- NEW
  iconEvery: 3,
  iconScale: 0.9,
  iconIndices: [187,188,189,190],
  bannerOn: true,
  bannerHeight: 84,
  bannerAlpha: 0.25,
  logW: 420,
  logH: 132,
  logLines: 6,
  gapBetweenLogAndHelp: 8,
  helpMinW: 160
};

function hexToInt(h){ if (h && h[0]==="#") h=h.slice(1); return parseInt(h||"ffffff",16); }

var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
Game_Interpreter.prototype.pluginCommand = function(cmd, args){
  _Game_Interpreter_pluginCommand.call(this, cmd, args);
  cmd = (cmd||"").toLowerCase();
  if (cmd==="bcfvisible"){ CFG.visible = String(args[0]).toLowerCase()==="on"; _bcfRefresh(); }
  else if (cmd==="bcfcolor"){
    if (args[0]) CFG.color = hexToInt(args[0]);
    if (args[1]) CFG.alpha = Number(args[1]);
    if (args[2]) CFG.thick = Number(args[2]);
    _bcfRebuild();
  } else if (cmd==="bcfcircles"){
    if (args[0]) CFG.radius = Number(args[0]);
    if (args[1]) CFG.gap = Number(args[1]);
    if (args[2]) CFG.inset = Number(args[2]);
    _bcfRebuild();
  } else if (cmd==="bcficons"){
    CFG.iconEvery = Number(args[0]||0);
    CFG.iconScale = Number(args[1]||1);
    var list = []; for (var i=2;i<args.length;i++) list.push(Number(args[i]));
    if (list.length>0) CFG.iconIndices = list;
    _bcfRebuild();
  } else if (cmd==="bcftopbanner"){
    CFG.bannerOn = String(args[0]).toLowerCase()==="on";
    if (args[1]) CFG.bannerHeight = Number(args[1]);
    if (args[2]) CFG.bannerAlpha = Number(args[2]);
    _bcfRebuild();
  } else if (cmd==="bcflog"){
    if (args[0]) CFG.logW = Number(args[0]);
    if (args[1]) CFG.logH = Number(args[1]);
    if (args[2]) CFG.logLines = Number(args[2]);
    _bcfLayoutWindows();
  } else if (cmd==="bcfpeek"){
    CFG.peek = Number(args[0]||10);
    _bcfRebuild();
  } else if (cmd==="bcfrebuild"){
    _bcfRebuild();
  }
};

function _bcfScene(){ return SceneManager._scene instanceof Scene_Battle ? SceneManager._scene : null; }
function _bcfRefresh(){ var s=_bcfScene(); if (s && s._bcfLayer) s._bcfLayer.visible = !!CFG.visible; }
function _bcfRebuild(){ var s=_bcfScene(); if (s && s.rebuildBCF) s.rebuildBCF(); }
function _bcfLayoutWindows(){ var s=_bcfScene(); if (s && s.layoutBCFWindows) s.layoutBCFWindows(); }

var _Scene_Battle_create = Scene_Battle.prototype.create;
Scene_Battle.prototype.create = function(){
  _Scene_Battle_create.call(this);
  this.createBCF();
};

Scene_Battle.prototype.createBCF = function(){
  this._bcfLayer = new Sprite();
  var idx = this.children.indexOf(this._windowLayer);
  this.addChildAt(this._bcfLayer, Math.max(0, idx)); // under windows
  this._bcfGfx = new PIXI.Graphics();
  this._bcfLayer.addChild(this._bcfGfx);
  this._bcfIconLayer = new Sprite();
  this._bcfLayer.addChild(this._bcfIconLayer);
  this.rebuildBCF();
  this.layoutBCFWindows();
  this._bcfLayer.visible = !!CFG.visible;
};

Scene_Battle.prototype.safeRectBCF = function(){
  var W=Graphics.width, H=Graphics.height, pad=Math.max(0, CFG.inset + CFG.thick*0.5);
  var rect = new Rectangle(pad, pad, W-pad*2, H-pad*2);
  $gameTemp.battleFrameInnerRect = rect;
  return rect;
};

Scene_Battle.prototype.rebuildBCF = function(){
  var g = this._bcfGfx; if (!g) return;
  var W = Graphics.width, H = Graphics.height;
  var rad=CFG.radius, gap=CFG.gap, col=CFG.color, a=CFG.alpha, th=CFG.thick, pk=Math.max(0,CFG.peek);
  g.clear();

  // top faded banner
  if (CFG.bannerOn){
    var r = this.safeRectBCF();
    g.beginFill(0x000000, CFG.bannerAlpha);
    g.drawRect(r.x, r.y, r.width, CFG.bannerHeight);
    g.endFill();
  } else {
    this.safeRectBCF();
  }

  // circle outlines with visible peek
  g.lineStyle(th, col, a);
  var x,y;

  // top (centers above screen by radius - peek)
  var yTop = -rad + pk;
  for (x=-gap; x<=W+gap; x+=gap) g.drawCircle(x, yTop, rad);

  // bottom
  var yBot = H + rad - pk;
  for (x=-gap; x<=W+gap; x+=gap) g.drawCircle(x, yBot, rad);

  // left
  var xL = -rad + pk;
  for (y=-gap; y<=H+gap; y+=gap) g.drawCircle(xL, y, rad);

  // right
  var xR = W + rad - pk;
  for (y=-gap; y<=H+gap; y+=gap) g.drawCircle(xR, y, rad);

  // rebuild icon sprites (placed INSIDE the edge by peek)
  this._bcfIconLayer.removeChildren();
  if (CFG.iconEvery>0 && CFG.iconIndices.length>0){
    var iconset = ImageManager.loadSystem('IconSet');
    var k=0, pos=[], margin = pk + 4;

    // top run
    for (x=0; x<=W; x+=gap){ if ((k++%CFG.iconEvery)===0) pos.push({x:x, y:margin}); }
    // right run
    k=0; for (y=gap*0.5; y<=H-gap*0.5; y+=gap){ if ((k++%CFG.iconEvery)===0) pos.push({x:W - margin, y:y}); }

    for (var p=0; p<pos.length; p++){
      var idx = CFG.iconIndices[p % CFG.iconIndices.length];
      var sp = new Sprite(iconset);
      setIconFrame(sp, idx);
      sp.anchor.x = 0.5; sp.anchor.y = 0.5;
      sp.x = pos[p].x; sp.y = pos[p].y;
      sp.scale.x = sp.scale.y = CFG.iconScale;
      this._bcfIconLayer.addChild(sp);
    }
  }
  this.layoutBCFWindows();
};

function setIconFrame(sprite, index){
  var pw=32, ph=32;
  var sx = (index % 16) * pw;
  var sy = Math.floor(index / 16) * ph;
  sprite.setFrame(sx, sy, pw, ph);
}

Scene_Battle.prototype.layoutBCFWindows = function(){
  var r = this.safeRectBCF();
  var log = this._logWindow;
  if (log){
    log.maxLines = function(){ return CFG.logLines; };
    log.setBackgroundType(2);
    log.opacity = 0;
    log.contentsOpacity = 255;
    log.move(r.x, r.y + r.height - CFG.logH, Math.min(CFG.logW, r.width), CFG.logH);
  }
  var help = this._helpWindow;
  if (help){
    help.setBackgroundType(2);
    help.opacity = 0;
    var x = r.x + Math.min(CFG.logW, r.width) + CFG.gapBetweenLogAndHelp;
    var w = Math.max(CFG.helpMinW, r.x + r.width - x);
    var h = help.height;
    help.move(x, r.y + r.height - h, w, h);
  }
};

var _Scene_Battle_onResize = Scene_Battle.prototype.onResize;
Scene_Battle.prototype.onResize = function(){
  _Scene_Battle_onResize.call(this);
  this.rebuildBCF();
};

var _Scene_Battle_start = Scene_Battle.prototype.start;
Scene_Battle.prototype.start = function(){
  _Scene_Battle_start.call(this);
  this.rebuildBCF();
};

})();