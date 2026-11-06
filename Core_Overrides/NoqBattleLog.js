/*:
 * @target MV
 * @plugindesc (MV ES5) Battle Feed Plus v1.5 — EX_UI Scaled, Fixed Scrolling, Global Word Wrap
 * @author Noq (Upgraded by Gemini)
 *
 * @help
 * ============================================================================
 * EX_UI COMPATIBILITY UPDATE:
 * ============================================================================
 * - Font sizes, line gaps, window dimensions, and margins now dynamically
 * multiply against EX_UI.scaleX() to remain perfectly proportioned without
 * blurring the window skin or text.
 * * Commands:
 * BF+ on/off
 * BF+Mode vanilla|compact|both
 * BF+Size <width> <height> <visibleLines>    # default 580 80 5
 * BF+Margin <bottomPx>                       # default 6
 * BF+Font <size> <gap>                       # default 14 6
 * BF+Bg <type 0|1|2> <backOpacity>           # 0=normal,1=dim,2=transparent
 * BF+Dim <olderAlpha>                        # default 170
 * BF+Zero on/off                             # show 0/miss lines (off)
 * BF+OpenFull                                # open full scrollable history overlay
 * BF+Test <any text...>
 *
 * Skill notetag to open the history without spending a turn:
 * <OpenBattleLog>
 */

(function(){
'use strict';

/* ---------- Input Mapping ---------- */
Input.keyMapper[73] = 'bf_l_key'; // Maps the "C" key

/* ---------- EX_UI Fallback ---------- */
var UI = typeof EX_UI !== 'undefined' ? EX_UI : {
  scaleX: function(){ return 1; },
  scaleY: function(){ return 1; }
};

// Scaling Helpers
function scaled(val) { return Math.round(val * UI.scaleX()); }
function scaledFontSize() { return Math.max(1, Math.round(CFG.fontSize * UI.scaleX())); }
function scaledLineGap() { return Math.round(CFG.lineGap * UI.scaleX()); }

/* ---------- Defaults ---------- */
var CFG = {
  enabled: true,
  mode: "both",      
  w: 680, h: 160, lines: 5,
  marginB: 10,
  fontSize: 14, lineGap: 6,
  bgType: 1, backOpacity: 0,
  olderAlpha: 170,
  showZero: false
};

/* ---------- Colors ---------- */
var COL = {
  vanilla:  "#b6bcc6", 
  dmg:      "#b6bcc6", 
  heal:     "#2ecc71", 
  crit:     "#f1c40f", 
  state:    "#ffffff", 
  harmony:  "#2ecc71", 
  verse:    "#f1c40f", 
  burnout:  "#ff4d4d", 
  afterEval:"#ffffff"  
};

/* ---------- Utilities ---------- */
function FEED(){ if (!window.$gameTemp) return []; if (!$gameTemp._bfplus) $gameTemp._bfplus = []; return $gameTemp._bfplus; }

function isFiltered(text){
  if (!text) return false;
  var t = String(text).toLowerCase();
  return t.indexOf("<simple>") >= 0 || 
         t.indexOf("[auto]") >= 0 || 
         t.indexOf("[chatter]") >= 0 || 
         t.indexOf("<skip log>") >= 0;
}

function relayToStateBox(text, hex){
  try{
    if (window.NoqStateMsgPush) return window.NoqStateMsgPush(String(text), hex||COL.vanilla);
    if (window.StateMsgPush)    return window.StateMsgPush(String(text), hex||COL.vanilla);
  }catch(e){}
}

/* Public API */
window.BattleFeedPush = function(x){
  var obj = (typeof x === "object") ? x : { text: String(x||""), kind:"vanilla" };
  if (!obj.color) obj.color = COL[obj.kind] || COL.vanilla;
  var a = FEED(); a.push(obj);
  var cap = 150; 
  while (a.length > cap) a.shift();
  var s = SceneManager._scene; if (s && s._bfPlusWin) s._bfPlusWin.refresh();
};

/* Word Wrap Algorithm */
window.BF_WrapLines = function(win, rawData, maxWidth) {
    var wrapped = [];
    win.contents.fontSize = scaledFontSize(); // Ensure width is measured correctly for scaled text

    for (var i=0; i<rawData.length; i++){
        var obj = rawData[i]; 
        var txt = (obj&&obj.text) || String(obj||""); 
        var col = (obj&&obj.color) || COL.vanilla;
        
        var words = txt.split(' ');
        var currentLine = '';
        
        for (var w=0; w<words.length; w++){
            var test = currentLine + (currentLine ? ' ' : '') + words[w];
            var clean = test.replace(/\\C\[\d+\]/gi, '').replace(/\\I\[\d+\]/gi, '   ');
            
            if (win.contents.measureTextWidth(clean) > maxWidth && currentLine !== '') {
                wrapped.push({ text: currentLine, color: col, isLast: false });
                currentLine = words[w];
            } else {
                currentLine = test;
            }
        }
        if (currentLine !== '') {
            wrapped.push({ text: currentLine, color: col, isLast: true });
        }
    }
    return wrapped;
};

/* ---------- Plugin Commands ---------- */
var _cmd = Game_Interpreter.prototype.pluginCommand;
Game_Interpreter.prototype.pluginCommand = function(c,a){
  _cmd.call(this,c,a); c=(c||"").toLowerCase();
  if (c==="bf+"){
    CFG.enabled = String(a[0]).toLowerCase()==="on";
    var s=SceneManager._scene; if (s&&s._bfPlusWin) s._bfPlusWin.visible=CFG.enabled;
  } else if (c==="bf+mode"){
    if (a[0]) CFG.mode = String(a[0]).toLowerCase();
  } else if (c==="bf+size"){
    if (a[0]) CFG.w=Number(a[0]); if (a[1]) CFG.h=Number(a[1]); if (a[2]) CFG.lines=Number(a[2]);
    _relayout();
  } else if (c==="bf+margin"){
    if (a[0]) CFG.marginB=Number(a[0]); _relayout();
  } else if (c==="bf+font"){
    if (a[0]) CFG.fontSize=Number(a[0]); if (a[1]) CFG.lineGap=Number(a[1]);
    var s2=SceneManager._scene; if (s2&&s2._bfPlusWin) s2._bfPlusWin.refresh();
  } else if (c==="bf+openfull"){
    var sb = SceneManager._scene; if (sb && sb.openBFHistory) sb.openBFHistory();
  } else if (c==="bf+bg"){
    // Added missing Bg command logic
    if (a[0]) CFG.bgType=Number(a[0]); if (a[1]) CFG.backOpacity=Number(a[1]);
    var s3=SceneManager._scene; if (s3&&s3._bfPlusWin) {
        s3._bfPlusWin.setBackgroundType(CFG.bgType);
        s3._bfPlusWin.backOpacity = CFG.backOpacity;
    }
  } else if (c==="bf+dim"){
    // Added missing Dim command logic
    if (a[0]) CFG.olderAlpha=Number(a[0]);
  } else if (c==="bf+zero"){
    // Added missing Zero command logic
    CFG.showZero = String(a[0]).toLowerCase()==="on";
  } else if (c==="bf+test"){
    // Added missing Test command logic
    var text = a.join(" ");
    if (typeof window.BattleFeedPush === "function") window.BattleFeedPush({text:text, kind:"vanilla"});
  }
};
function _relayout(){ var s=SceneManager._scene; if (s&&s.layoutBFPlus) s.layoutBFPlus(); }

/* ---------- Mirror vanilla log (filtered) ---------- */
var _addText = Window_BattleLog.prototype.addText;
Window_BattleLog.prototype.addText = function(text){
  if (CFG.enabled && (CFG.mode==="vanilla" || CFG.mode==="both") && text && text.trim() && !isFiltered(text)){
    BattleFeedPush({text:text, kind:"vanilla"});
  }
  _addText.call(this,text);
};

/* ---------- Compact result lines (colored) ---------- */
var _apply = Game_Action.prototype.apply;
Game_Action.prototype.apply = function(target){
  _apply.call(this,target);
  try{
    if (!CFG.enabled || (CFG.mode==="vanilla")) return;
    var r = target.result(); if (!r) return;
    var user = this.subject(); var it = this.item && this.item(); if (!user || !it) return;

    var obj = null, crit = r.critical ? " (CRIT)" : "";
    if (r.hpDamage > 0){
      obj = { text: user.name()+" → "+target.name()+" : "+it.name+" -"+r.hpDamage+crit, kind:(r.critical?"crit":"dmg") };
    } else if (r.hpDamage < 0){
      obj = { text: user.name()+" → "+target.name()+" : "+it.name+" +"+(-r.hpDamage)+" HP", kind:"heal" };
    } else if (r.missed || r.evaded){
      if (CFG.showZero) obj = { text: user.name()+" → "+target.name()+" : "+it.name+" missed", kind:"vanilla" };
    }
    if (!obj){
      var adds = r.addedStateObjects && r.addedStateObjects() || [];
      if (adds.length){
        obj = { text: user.name()+" → "+target.name()+" : "+(adds[0].name||"State"), kind:"state" };
      } else if (CFG.showZero){
        obj = { text: user.name()+" → "+target.name()+" : "+(it.name||"") +" 0", kind:"vanilla" };
      }
    }
    if (obj && !isFiltered(obj.text)){
      BattleFeedPush(obj);
      if (obj.kind==="state" || obj.kind==="crit" || obj.kind==="dmg") relayToStateBox(obj.text, obj.color);
    }
  }catch(e){}
};

/* ---------- Burnout announce (UBS) ---------- */
var _addNewState = Game_Battler.prototype.addNewState;
Game_Battler.prototype.addNewState = function(id){
  _addNewState.call(this,id);
  try{
    var UBS = window.UBS || {};
    if (CFG.enabled && UBS.DEFAULT_BURNOUT_STATE_ID && id===UBS.DEFAULT_BURNOUT_STATE_ID){
      var t = this.name()+" BURNED OUT!";
      BattleFeedPush({text:t, kind:"burnout"});
      relayToStateBox(t, COL.burnout);
    }
  }catch(e){}
};

/* ---------- Catch-All Message Hook (Harmonization / AfterEval) ---------- */
(function(){
  var _GM_add = Game_Message.prototype.add;
  Game_Message.prototype.add = function(text){
    try{
      if (SceneManager._scene instanceof Scene_Battle){
        var s = String(text||"");
        if (isFiltered(s)) return _GM_add.call(this, s);

        var kind = "afterEval"; 
        if (/harmoni[sz]ed/i.test(s)) kind = "harmony";
        else if (/unleash(ed)?/i.test(s)) kind = "verse";  
        
        if (typeof window.BattleFeedPush === "function") {
            window.BattleFeedPush({text:s, kind:kind});
            relayToStateBox(s, COL[kind] || COL.afterEval);
            return; // <--- FIX: This stops the native MV message window from rendering!
        }
      }
    }catch(e){ console.error("[BF+] message hook", e); }
    return _GM_add.call(this, text);
  };
})();

/* ---------- Feed Window (Mini Log) ---------- */
function Window_BFPlus(){ this.initialize.apply(this, arguments); }
Window_BFPlus.prototype = Object.create(Window_Base.prototype);
Window_BFPlus.prototype.constructor = Window_BFPlus;

Window_BFPlus.prototype.initialize = function(r){
  // FIX 3: Force the Y position to the top (0 = absolute top)
  // If you want a slight margin, change 0 to something like 10 or 15.
  r.y = 0; 
  
  Window_Base.prototype.initialize.call(this,r.x,r.y,r.width,r.height);
  this.setBackgroundType(CFG.bgType);
  this.backOpacity = CFG.backOpacity;
  this.opacity = (CFG.bgType===0)?255:0;
  this.refresh();
};

Window_BFPlus.prototype.update = function() {
  Window_Base.prototype.update.call(this);
  if (this.visible && TouchInput.isTriggered()) {
      var x = this.canvasToLocalX(TouchInput.x);
      var y = this.canvasToLocalY(TouchInput.y);
      if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
          var s = SceneManager._scene;
          if (s && s.openBFHistory) { SoundManager.playOk(); s.openBFHistory(); }
      }
  }
};

Window_BFPlus.prototype.standardPadding = function(){ return 8; };
Window_BFPlus.prototype.lineHeight = function(){ return scaledFontSize() + scaledLineGap() + 6; };
Window_BFPlus.prototype.calcTextHeight = function(textState, all) { return this.lineHeight(); }; 

Window_BFPlus.prototype.refresh = function(){
  if (!this.contents) return;
  this.contents.clear();
  
  var maxWidth = this.contentsWidth() - this.textPadding() * 2;
  var wrappedData = window.BF_WrapLines(this, FEED(), maxWidth);
  var lines = wrappedData.slice(-CFG.lines);
  var lh = this.lineHeight();
  
  for (var i=0; i<lines.length; i++){
    var item = lines[i];
    this.changeTextColor(item.color);
    this.contents.fontSize = scaledFontSize();
    this.drawTextEx(item.text, this.textPadding(), i*lh);
    
    // Draw Separator
    if (item.isLast && i < lines.length - 1) {
        this.contents.paintOpacity = 60;
        this.contents.fillRect(this.textPadding(), (i * lh) + lh - 2, maxWidth, 1, '#ffffff');
        this.contents.paintOpacity = 255;
    }
  }
  this.resetTextColor();
};

/* ---------- Full History Overlay (Scrollable + Word Wrap) ---------- */
function Window_BFHistory(){ this.initialize.apply(this, arguments); }
Window_BFHistory.prototype = Object.create(Window_Selectable.prototype);
Window_BFHistory.prototype.constructor = Window_BFHistory;
Window_BFHistory.prototype.initialize = function(r){
  Window_Selectable.prototype.initialize.call(this, r.x, r.y, r.width, r.height);
  this._data = []; 
  this.setBackgroundType(1); 
  this.refresh(); 
  this.activate();
};

Window_BFHistory.prototype.maxItems = function(){ return this._data ? this._data.length : 0; };
Window_BFHistory.prototype.item = function(i){ return this._data[i]; };
Window_BFHistory.prototype.spacing = function(){ return 0; };
Window_BFHistory.prototype.lineHeight = function(){ return scaledFontSize() + scaledLineGap() + 6; };
Window_BFHistory.prototype.calcTextHeight = function(textState, all) { return this.lineHeight(); }; 

Window_BFHistory.prototype.refresh = function(){
  var rawData = FEED().slice(0);
  var maxWidth = this.contentsWidth() - this.textPadding() * 2;
  this._data = window.BF_WrapLines(this, rawData, maxWidth);

  var totalH = Math.max(this.height, this._data.length * this.lineHeight());
  if (!this.contents || this.contents.height < totalH){
    this.contents = new Bitmap(this.contentsWidth(), totalH);
    this.resetFontSettings();
  }

  this.contents.clear();
  for (var i = 0; i < this._data.length; i++) this.drawItem(i);

  if (this._data.length > 0) this.select(this._data.length - 1);
};

Window_BFHistory.prototype.scrollToBottom = function(){
  if (this._data && this._data.length > 0)
    this.select(this._data.length - 1);
};

Window_BFHistory.prototype.drawItem = function(index) {
  var item = this._data[index];
  if (!item) return;
  var rect = this.itemRectForText(index);
  
  this.contents.fontSize = scaledFontSize();
  this.changeTextColor(item.color);
  this.drawTextEx(item.text, rect.x, rect.y);
  
  if (item.isLast) {
      this.contents.paintOpacity = 60;
      this.contents.fillRect(rect.x, rect.y + rect.height - 2, rect.width, 1, '#ffffff');
      this.contents.paintOpacity = 255;
  }
};

var _WBH_update = Window_BFHistory.prototype.update;
Window_BFHistory.prototype.update = function(){
  Window_Selectable.prototype.update.call(this);
  if (!this.active || !this.isOpen()) return;

  var wheel = TouchInput._wheelY || 0;
  if (wheel !== 0){
    var dir      = wheel > 0 ? 3 : -3;   
    var newIndex = Math.max(0, Math.min((this._data ? this._data.length - 1 : 0), this._index + dir));
    if (newIndex !== this._index){
      this.select(newIndex);
      SoundManager.playCursor();
    }
    TouchInput._wheelY = 0;
  }
};

/* ---------- Scene_Battle integration ---------- */
var _createAll = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
  _createAll.call(this);
  this.createBFPlusWindow();
  this.layoutBFPlus();
};

Scene_Battle.prototype.createBFPlusWindow = function(){
  var r = this.bfPlusRect();
  this._bfPlusWin = new Window_BFPlus(r);
  this._bfPlusWin.visible = CFG.enabled;
  this.addWindow(this._bfPlusWin);
};

Scene_Battle.prototype.bfPlusRect = function(){
  // Scale the config dimensions dynamically based on screen resolution
  var sW = scaled(CFG.w);
  var sH = scaled(CFG.h);
  var sM = scaled(CFG.marginB);
  
  var w = Math.min(sW, Graphics.boxWidth);
  var x = Math.floor((Graphics.boxWidth - w) / 2);
  var y = 5; // Forced to the top
  
  return new Rectangle(x, y, w, sH);
};

Scene_Battle.prototype.layoutBFPlus = function(){
  if (!this._bfPlusWin) return;
  var r = this.bfPlusRect();
  this._bfPlusWin.move(r.x, r.y, r.width, r.height);
  this._bfPlusWin.refresh();
};

var _start = Scene_Battle.prototype.start;
Scene_Battle.prototype.start = function(){
  FEED().length = 0;
  _start.call(this);
  if (this._bfPlusWin) this._bfPlusWin.refresh();
};

var _resize = Scene_Battle.prototype.onResize;
Scene_Battle.prototype.onResize = function(){ _resize.call(this); this.layoutBFPlus(); };

var _Scene_Battle_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function() {
  _Scene_Battle_update.call(this);
  if (Input.isTriggered('bf_l_key')) {
      if (this._bfHistoryWindow && this._bfHistoryWindow.visible) {
          SoundManager.playCancel();
          this.closeBFHistory();
      } else {
          SoundManager.playOk();
          this.openBFHistory();
      }
  }
};

Scene_Battle.prototype.openBFHistory = function(){
  if (this._bfHistoryWindow){ 
    this._bfHistoryWindow.refresh(); 
    this._bfHistoryWindow.scrollToBottom(); 
    this._bfHistoryWindow.show(); 
    this._bfHistoryWindow.activate(); 
    return; 
  }
  // Percentages map perfectly to EX_UI scaling natively
  var w = Graphics.boxWidth * 0.85;
  var h = Graphics.boxHeight * 0.75;
  var x = (Graphics.boxWidth - w) / 2;
  var y = (Graphics.boxHeight - h) / 2;
  
  this._bfHistoryWindow = new Window_BFHistory(new Rectangle(x, y, w, h));
  this.addWindow(this._bfHistoryWindow);
  this._bfHistoryWindow.setHandler('cancel', this.closeBFHistory.bind(this));
  this._bfHistoryWindow.scrollToBottom(); 
  this._bfHistoryWindow.activate();
};

Scene_Battle.prototype.closeBFHistory = function(){
  if (this._bfHistoryWindow){ 
    this._bfHistoryWindow.hide(); 
    this._bfHistoryWindow.deactivate();
  }
};

var _onSkillOk = Scene_Battle.prototype.onSkillOk;
Scene_Battle.prototype.onSkillOk = function(){
  var skill = this._skillWindow && this._skillWindow.item();
  if (skill && (skill.meta && skill.meta.OpenBattleLog || (skill.stypeId===4 && /battle\s*log/i.test(skill.name)))){
    this.openBFHistory();
    this._skillWindow.activate(); 
    return;
  }
  _onSkillOk.call(this);
};

})();