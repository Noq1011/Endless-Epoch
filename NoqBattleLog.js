/*:
 * @target MV
 * @plugindesc (MV ES5) Battle Feed Plus v1.3 — bottom-center color-coded feed + full history overlay. Filters <SIMPLE> / [AUTO]. Hooks UBS/Verse/Harmony.
 * @author Noq
 *
 * @help
 * Commands:
 *   BF+ on/off
 *   BF+Mode vanilla|compact|both
 *   BF+Size <width> <height> <visibleLines>    # default 580 80 5
 *   BF+Margin <bottomPx>                       # default 6
 *   BF+Font <size> <gap>                       # default 12 4
 *   BF+Bg <type 0|1|2> <backOpacity>           # 0=normal,1=dim,2=transparent
 *   BF+Dim <olderAlpha>                        # default 170
 *   BF+Zero on/off                             # show 0/miss lines (off)
 *   BF+OpenFull                                # open full scrollable history overlay
 *   BF+Test <any text...>
 *
 * Skill notetag to open the history without spending a turn:
 *   <OpenBattleLog>
 * (Additionally, a skill named "Battle Log" in S.Type 4 will be caught.)
 *
 * API:
 *   BattleFeedPush(textOrObj)
 *     - If an object, you can pass {text:"...", kind:"dmg|heal|crit|state|harmony|burnout|vanilla", color:"#rrggbb"}
 *
 * Integration hooks (optional, auto-detected if present):
 *   VerseTriggerLog(actor, skill, chance)   -> mirrored (tagged [AUTO] is filtered)
 *   UBS.DEFAULT_BURNOUT_STATE_ID            -> announces "X BURNED OUT!"
 *   Harmonization.*                         -> harmony/unleash messages mirrored
 *   NoqStateMsgPush(text, color) or StateMsgPush(text, color) -> relay important lines
 */

(function(){
'use strict';

/* ---------- Defaults ---------- */
var CFG = {
  enabled: true,
  mode: "both",      // "vanilla" | "compact" | "both"
  w: 580, h: 120, lines: 4,
  marginB: 10,
  fontSize: 12, lineGap: 8,
  bgType: 1, backOpacity: 0,
  olderAlpha: 170,
  showZero: false
};

/* ---------- Colors ---------- */
var COL = {
  vanilla:  "#b6bcc6",
  dmg:      "#ff5858",
  heal:     "#2ecc71",
  crit:     "#ffd166",
  state:    "#a78bfa",
  harmony:  "#62a0ff",
  burnout:  "#ff6aa2"
};

/* ---------- Utilities ---------- */
function FEED(){ if (!window.$gameTemp) return []; if (!$gameTemp._bfplus) $gameTemp._bfplus = []; return $gameTemp._bfplus; }
function isFiltered(text){
  if (!text) return false;
  var t = String(text).toLowerCase();
  return t.indexOf("<simple>") >= 0 || t.indexOf("[auto]") >= 0;
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
  if (!obj.color){
    obj.color = COL[obj.kind] || COL.vanilla;
  }
  var a = FEED(); a.push(obj);
  var cap = Math.max(CFG.lines,4) * 12; while (a.length > cap) a.shift();
  var s = SceneManager._scene; if (s && s._bfPlusWin) s._bfPlusWin.refresh();
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
  } else if (c==="bf+bg"){
    if (a[0]) CFG.bgType=Number(a[0]); if (a[1]) CFG.backOpacity=Number(a[1]);
    var s3=SceneManager._scene; if (s3&&s3._bfPlusWin){ s3._bfPlusWin.setBackgroundType(CFG.bgType); s3._bfPlusWin.backOpacity=CFG.backOpacity; }
  } else if (c==="bf+dim"){
    if (a[0]) CFG.olderAlpha=Number(a[0]); var s4=SceneManager._scene; if (s4&&s4._bfPlusWin) s4._bfPlusWin.refresh();
  } else if (c==="bf+zero"){
    CFG.showZero = String(a[0]).toLowerCase()==="on";
  } else if (c==="bf+openfull"){
    var sb = SceneManager._scene; if (sb && sb.openBFHistory) sb.openBFHistory();
  } else if (c==="bf+test"){
    BattleFeedPush({text:a.join(" "), kind:"vanilla"});
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
  }catch(e){ console.error("[BF+ apply]", e); }
};

/* ---------- VerseTrigger hook (filtered) ---------- */
(function(){
  var old = window.VerseTriggerLog;
  window.VerseTriggerLog = function(actor, skill, chance){
    if (old) try{ old(actor,skill,chance); }catch(e){}
    try{
      if (!CFG.enabled) return;
      // Skip all explicit [AUTO] lines
      var txt = "[AUTO] "+(actor?actor.name():"?")+" → "+(skill?skill.name:"?");
      if (!isFiltered(txt)){
        // If you still want a whisper, comment out next return:
        return; // filtered out by request
      }
    }catch(e){}
  };
})();

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

/* NoqBFPlus – Harmony+Message hook (safe) v1.3.2 */
(function(){
  'use strict';

  // Use the prototype instead of $gameMessage instance (avoids null at boot)
  var _GM_add = Game_Message.prototype.add;

  // Helpers copied from BF+ (fallbacks if not present)
  var COL = (window.NoqBF_COLORS) || {
    vanilla:"#b6bcc6", dmg:"#ff5858", heal:"#2ecc71",
    crit:"#ffd166", state:"#a78bfa", harmony:"#62a0ff", burnout:"#ff6aa2"
  };
  function isFiltered(s){
    if (!s) return false;
    s = String(s).toLowerCase();
    return s.indexOf("<simple>")>=0 || s.indexOf("[auto]")>=0;
  }
  function relayToStateBox(text, hex){
    try{
      if (window.NoqStateMsgPush) return window.NoqStateMsgPush(String(text), hex||COL.vanilla);
      if (window.StateMsgPush)    return window.StateMsgPush(String(text), hex||COL.vanilla);
    }catch(e){}
  }
  function feedPush(obj){
    if (typeof window.BattleFeedPush === "function") return window.BattleFeedPush(obj);
  }

  Game_Message.prototype.add = function(text){
    try{
      if (SceneManager._scene instanceof Scene_Battle){
        var s = String(text||"");
        // Filter out SIMPLE/AUTO lines globally
        if (isFiltered(s)) return _GM_add.call(this, s);

        // Harmony heuristics (you can tighten these later if your proto exposes an API)
        if (/harmoni[sz]ed|unleash(ed)?|resonance/i.test(s)){
          feedPush({text:s, kind:"harmony"});
          relayToStateBox(s, COL.harmony);
          return _GM_add.call(this, s);
        }
      }
    }catch(e){ console.error("[BF+] message hook", e); }
    return _GM_add.call(this, text);
  };

})();
/* 2) If Harmonization exposes a notifier later, we'll hook it here too. */

/* ---------- Feed Window ---------- */
function Window_BFPlus(){ this.initialize.apply(this, arguments); }
Window_BFPlus.prototype = Object.create(Window_Base.prototype);
Window_BFPlus.prototype.constructor = Window_BFPlus;

Window_BFPlus.prototype.initialize = function(r){
  Window_Base.prototype.initialize.call(this,r.x,r.y,r.width,r.height);
  this.setBackgroundType(CFG.bgType);
  this.backOpacity = CFG.backOpacity;
  this.opacity = (CFG.bgType===0)?255:0;
  this.refresh();
};
Window_BFPlus.prototype.standardPadding = function(){ return 8; };
Window_BFPlus.prototype.lineHeight     = function(){ return CFG.fontSize + CFG.lineGap; };
Window_BFPlus.prototype.refresh = function(){
  if (!this.contents) return;
  this.contents.clear();
  var lines = FEED().slice(-CFG.lines);
  var lh = this.lineHeight();
  for (var i=0;i<lines.length;i++){
    var obj = lines[i];
    var text = (typeof obj==="object") ? obj.text : String(obj);
    var color = (obj && obj.color) ? obj.color : COL.vanilla;
    this.changeTextColor(color);
    this.contents.fontSize = CFG.fontSize;
    this.drawTextEx(text, this.textPadding(), i*lh);
  }
  this.resetTextColor();
};

/* ---------- Full History Overlay ---------- */
function Window_BFHistory(){ this.initialize.apply(this, arguments); }
Window_BFHistory.prototype = Object.create(Window_Selectable.prototype);
Window_BFHistory.prototype.constructor = Window_BFHistory;
Window_BFHistory.prototype.initialize = function(r){
  Window_Selectable.prototype.initialize.call(this, r.x, r.y, r.width, r.height);
  this._data = []; this.refresh(); this.activate();
  this.setBackgroundType(1); // dim
};
Window_BFHistory.prototype.maxItems = function(){ return this._data.length; };
Window_BFHistory.prototype.item = function(i){ return this._data[i]; };
Window_BFHistory.prototype.refresh = function(){
  this._data = FEED().slice(0); // full copy
  this.createContents();
  this.contents.fontSize = CFG.fontSize;
  var lh = CFG.fontSize + CFG.lineGap;
  for (var i=0;i<this._data.length;i++){
    var obj = this._data[i]; var txt = (obj&&obj.text)||String(obj||""); var col = (obj&&obj.color)||COL.vanilla;
    this.changeTextColor(col);
    this.drawTextEx(txt, this.textPadding(), i*lh);
  }
  this.resetTextColor();
};
Window_BFHistory.prototype.spacing = function(){ return 6; };
Window_BFHistory.prototype.lineHeight = function(){ return CFG.fontSize + CFG.lineGap; };

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
  var safe = ($gameTemp && $gameTemp.battleFrameInnerRect) ? $gameTemp.battleFrameInnerRect : new Rectangle(0,0,Graphics.width,Graphics.height);
  var w = Math.min(CFG.w, safe.width);
  var x = Math.floor(safe.x + (safe.width - w)/2);
  var y = Math.floor(safe.y + safe.height - CFG.h - CFG.marginB);
  return new Rectangle(x, y, w, CFG.h);
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

/* Open/close history overlay */
Scene_Battle.prototype.openBFHistory = function(){
  if (this._bfHistoryWindow){ this._bfHistoryWindow.refresh(); this._bfHistoryWindow.show(); this._bfHistoryWindow.activate(); return; }
  var r = new Rectangle(0, 0, Graphics.width, Graphics.height);
  this._bfHistoryWindow = new Window_BFHistory(r);
  this.addWindow(this._bfHistoryWindow);
  this._bfHistoryWindow.setHandler('cancel', this.closeBFHistory.bind(this));
  this._bfHistoryWindow.activate();
};
Scene_Battle.prototype.closeBFHistory = function(){
  if (this._bfHistoryWindow){ this._bfHistoryWindow.hide(); }
};

/* Intercept a Tactics skill to open log (no turn spent) */
var _onSkillOk = Scene_Battle.prototype.onSkillOk;
Scene_Battle.prototype.onSkillOk = function(){
  var skill = this._skillWindow && this._skillWindow.item();
  if (skill && (skill.meta && skill.meta.OpenBattleLog || (skill.stypeId===4 && /battle\s*log/i.test(skill.name)))){
    this.openBFHistory();
    this._skillWindow.activate(); // stay on skills
    return;
  }
  _onSkillOk.call(this);
};

/* ---------- Chatter binding reliability tweak ---------- */
var _SSB_update = Spriteset_Battle.prototype.update;
Spriteset_Battle.prototype.update = function(){
  _SSB_update.call(this);
  // first 120 frames of a battle, aggressively attach _noqSprite so chatter can find sprites
  if (Graphics.frameCount % 5 === 0 && Graphics.frameCount < 120){
    var arr = [].concat(this._actorSprites||[], this._enemySprites||[]);
    for (var i=0;i<arr.length;i++){
      var s = arr[i]; if (s && s._battler && !s._battler._noqSprite) s._battler._noqSprite = s;
    }
  }
};

})();