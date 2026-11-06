/*:
 * @target MV
 * @plugindesc v5.4 Event Names + Scheduler. Synced with NoQ Pathfinding.
 * @author Noq / Gemini
 *
 * @param Font Size
 * @type number
 * @default 18
 *
 * @param Default Name X Offset
 * @type number
 * @default 0
 *
 * @param Default Name Y Offset
 * @type number
 * @default -36
 *
 * @param Arrow Enabled By Default
 * @type boolean
 * @default false
 *
 * @param Arrow Color
 * @type string
 * @default #FFFFFF
 *
 * @param Arrow Width
 * @type number
 * @default 12
 *
 * @param Arrow Height
 * @type number
 * @default 10
 *
 * @param Arrow Bob Pixels
 * @type number
 * @default 6
 *
 * @param Arrow Bob Speed
 * @type number
 * @decimals 3
 * @default 0.08
 *
 * @param Pulse Scale (+/-)
 * @type number
 * @decimals 3
 * @default 0.12
 *
 * @param Update Throttle (frames)
 * @type number
 * @default 1
 *
 * @param Scheduler Tick (frames)
 * @type number
 * @default 30
 *
 * @param Fade Speed (opacity/frame)
 * @type number
 * @decimals 2
 * @default 12
 */

var NoqEventNamesSimpleV5 = NoqEventNamesSimpleV5 || {};
(function(){
  "use strict";

  var PN = "Noq_EventNamesSimpleV5"; // Use your actual plugin filename if params fail
  var P = PluginManager.parameters(PN);
  function num(v,d){v=Number(v);return isNaN(v)?d:v;}
  function bool(v,d){if(v==null)return !!d; return String(v).toLowerCase()==="true";}

  var FONT_SIZE   = num(P["Font Size"],18);
  var NAME_OX     = num(P["Default Name X Offset"],0)|0;
  var NAME_OY     = num(P["Default Name Y Offset"],-36)|0;
  var ARROW_DEF   = bool(P["Arrow Enabled By Default"], false);
  var ARROW_COLOR = String(P["Arrow Color"]||"#FFFFFF");
  var ARROW_W     = num(P["Arrow Width"],12)|0;
  var ARROW_H     = num(P["Arrow Height"],10)|0;
  var ARROW_BOB   = num(P["Arrow Bob Pixels"],6)|0;
  var ARROW_SPEED = num(P["Arrow Bob Speed"],0.08);
  var PULSE_AMP   = num(P["Pulse Scale (+/-)"],0.12);
  var TICK        = Math.max(1, num(P["Update Throttle (frames)"],1)|0);
  var SCHED_TICK  = Math.max(10, num(P["Scheduler Tick (frames)"],30)|0);
  var FADE_SPEED  = Math.max(0.5, num(P["Fade Speed (opacity/frame)"],12));

  var DEBUG=false; function dbg(){ if(DEBUG) console.log.apply(console, ["[EventNamesV5]"].concat([].slice.call(arguments))); }

  // ---------- Weather + DayNight helpers ----------
  function weatherType(){
    try{
      if ($gameSystem && $gameSystem._persistentWeather){
        var a=$gameSystem._persistentWeather.active||{};
        if (a.storm) return "storm";
        if (a.rain)  return "rain";
        if (a.snow)  return "snow";
        if (a.fog)   return "fog";
        return "none";
      }
    }catch(e){}
    if (window.RegionFX && RegionFX._weatherType) return RegionFX._weatherType||"none";
    if ($gameScreen) return $gameScreen._weatherType||"none";
    return "none";
  }
  function nowHour(){
    try{
      if (typeof DayNight!=="undefined" && DayNight.hour && DayNight.minute){
        return DayNight.hour() + DayNight.minute()/60;
      }
    }catch(e){}
    return 12;
  }

  // ---------- parse helpers ----------
  function getPageCommentText(page){
    var out=""; var list = page && page.list || [];
    for (var i=0;i<list.length;i++){
      var c=list[i];
      if (c && (c.code===108 || c.code===408) && c.parameters && c.parameters.length){
        out += " " + c.parameters.join(" ");
      }
    }
    return out;
  }

  function parseArrowNote(note){
    if (/<ArrowAbove>/i.test(note)) return {on:true, dir:"down"};
    var m = /<Arrow:\s*([^>]+)>/i.exec(note);
    if (!m) return null;
    var cfg = {on:true, color:ARROW_COLOR, w:ARROW_W, h:ARROW_H, bob:ARROW_BOB, speed:ARROW_SPEED, ox:0, oy:-56, dir:"down"};
    var parts = m[1].split("|");
    for (var i=0;i<parts.length;i++){
      var seg=parts[i].trim(); if(!seg) continue;
      var kv=seg.split(":"); var k=(kv[0]||"").trim().toLowerCase(); var v=(kv[1]||"").trim();
      if (k==="on") cfg.on = /on|true|1/i.test(v);
      else if (k==="dir") cfg.dir = (v.toLowerCase()==="up"?"up":"down");
      else if (k==="color") cfg.color = v;
      else if (k==="w") cfg.w = Math.max(4, num(v, cfg.w)|0);
      else if (k==="h") cfg.h = Math.max(4, num(v, cfg.h)|0);
      else if (k==="bob") cfg.bob = Math.max(0, num(v, cfg.bob)|0);
      else if (k==="speed") cfg.speed = Math.max(0.001, num(v, cfg.speed));
      else if (k==="ox") cfg.ox = num(v, 0)|0;
      else if (k==="oy") cfg.oy = num(v, -56)|0;
    }
    return cfg;
  }
  function parseRanges(s){
    var out=[], parts=String(s||"").split(",");
    for (var i=0;i<parts.length;i++){
      var seg=parts[i].trim(); if(!seg) continue;
      var mm=/^(\d{1,2})(?::(\d{1,2}))?\s*-\s*(\d{1,2})(?::(\d{1,2}))?$/.exec(seg);
      if (mm){
        var h1=num(mm[1],0)|0, m1=num(mm[2]||0,0)|0, h2=num(mm[3],0)|0, m2=num(mm[4]||0,0)|0;
        out.push({start:h1+m1/60, end:h2+m2/60});
      }
    }
    return out;
  }
  function weatherOk(tag){
    if (!tag || tag==="") return true;
    var want = tag.toLowerCase().split(/[,\s]+/).filter(function(s){return !!s;});
    if (want.indexOf("any")>=0) return true;
    var t = weatherType();
    if (t==="none") return want.indexOf("none")>=0;
    return want.indexOf(t)>=0;
  }

  // ---------- Game_Event state ----------
  var _GE_init = Game_Event.prototype.initMembers;
  Game_Event.prototype.initMembers = function(){
    _GE_init.call(this);
    this._nameLabel = null;
    this._showAfterTalk = false;
    this._talkedTo = false;
    this._nameOffsetX = NAME_OX;
    this._nameOffsetY = NAME_OY;
    this._arrowCfg = ARROW_DEF ? {on:true,color:ARROW_COLOR,w:ARROW_W,h:ARROW_H,bob:ARROW_BOB,speed:ARROW_SPEED,ox:0,oy:-56,dir:"down"} : {on:false};
    this._hasNew = false;     
    this._pulseWhenNew = false;
    this._newFlagLetter = null;
	this._role = "civilian"; // DEFAULT HERE FIRST (CRITICAL)

    // scheduler sync variables
    this._sched = null;
    this._schedActive = true;     
    this._fadeTarget = null;      
    this._noqBaseOpacity = undefined; // Pathfinding Sync
  };

  var _GE_setup = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function(){
    _GE_setup.call(this);
    var ev = this.event(); var page = this.page();
    if (!ev || !page) return;

    var notes = String(ev.note||"") + " " + getPageCommentText(page);

    var mName = /<NameLabel:\s*(.+?)>/i.exec(notes);
    this._nameLabel = mName ? mName[1] : this._nameLabel;
    this._showAfterTalk = /<ShowNameAfterTalk>/i.test(notes);
	
	// Role Matching for Noq_PathFinding
	var roleMatch = /<Role:\s*(\w+)>/i.exec(notes);
	this._role = roleMatch ? roleMatch[1].toLowerCase() : "civilian";
    
	console.log("[ROLE SET]", this.eventId(), this._role);
	
	var nOx = /<NameOffsetX:\s*(-?\d+)>/i.exec(notes);
    var nOy = /<NameOffsetY:\s*(-?\d+)>/i.exec(notes);
    this._nameOffsetX = nOx ? (num(nOx[1], NAME_OX)|0) : NAME_OX;
    this._nameOffsetY = nOy ? (num(nOy[1], NAME_OY)|0) : NAME_OY;

    var arr = parseArrowNote(notes);
    if (arr) this._arrowCfg = arr;
    else if (/<ArrowAbove>/i.test(notes)) this._arrowCfg = {on:true, color:ARROW_COLOR,w:ARROW_W,h:ARROW_H,bob:ARROW_BOB,speed:ARROW_SPEED,ox:0,oy:-56,dir:"down"};

    this._pulseWhenNew = /<PulseWhenNew>/i.test(notes);
    var nf = /<NewFlag:\s*([A-D])>/i.exec(notes);
    this._newFlagLetter = nf ? nf[1].toUpperCase() : null;

    var h = /<ActiveHours:\s*([^>]+)>/i.exec(notes);
    var mode = /<ActiveMode:\s*(fade|switch|erase|opacity)>/i.exec(notes);
    var sw = /<ActiveSwitch:\s*([A-D])>/i.exec(notes);
    var wx = /<ActiveWeather:\s*([^>]+)>/i.exec(notes);
    var op = /<InactiveOpacity:\s*(\d{1,3})>/i.exec(notes);
    var noFade = /<ActiveExcludeFade>/i.test(notes);

    this._sched = h ? {
      hours: parseRanges(h[1]),
      mode: mode ? mode[1].toLowerCase() : "fade",
      letter: sw ? sw[1].toUpperCase() : "A",
      weather: wx ? wx[1] : "",
      inactiveOpacity: op ? Math.max(0, Math.min(255, num(op[1],100)|0)) : 100,
      excludeFade: !!noFade,
      _lastActive: null
    } : null;
  };

  // API
  Game_Event.prototype.setNameLabel = function(t){ this._nameLabel = String(t||""); };
  Game_Event.prototype.clearNameLabel = function(){ this._nameLabel = null; };
  Game_Event.prototype.enableArrow = function(v){ this._arrowCfg = this._arrowCfg||{dir:"down"}; this._arrowCfg.on = !!v; };
  Game_Event.prototype.markNew = function(){ this._hasNew = true; };
  Game_Event.prototype.clearNew = function(){ this._hasNew = false; };
  Game_Event.prototype.setTalkedTo = function(){ this._talkedTo = true; };

  // ---------- Sprite logic ----------
  function Sprite_EventName(){ this.initialize.apply(this, arguments); }
  Sprite_EventName.prototype = Object.create(Sprite.prototype);
  Sprite_EventName.prototype.constructor = Sprite_EventName;

  Sprite_EventName.prototype.initialize = function(ev){
    Sprite.prototype.initialize.call(this);
    this._event = ev;
    this._fontSize = FONT_SIZE;
    this._text = new Sprite(new Bitmap(1,1));
    this._text.anchor.x = 0.5; this._text.anchor.y = 1.0;
    this._arrow = null;
    this._tPulse = Math.random()*Math.PI*2;
    this._tArrow = Math.random()*Math.PI*2;
    this._next = 0;
    this._arrowCacheKey = "";
    this.addChild(this._text);
  };

  function ensureTextBitmap(sp, w, h){
    var bm=sp._text.bitmap;
    if (!bm || bm.width<w || bm.height<h){ sp._text.bitmap = new Bitmap(w,h); }
    else sp._text.bitmap.clear();
    sp._text.bitmap.fontSize=sp._fontSize;
  }

  function hex2rgba(hex){
    hex = String(hex||"#FFFFFF").replace("#","");
    var n=parseInt(hex,16); if(isNaN(n)) return "rgba(255,255,255,1)";
    var r=(n>>16)&255,g=(n>>8)&255,b=n&255;
    return "rgba("+r+","+g+","+b+",1)";
  }

  Sprite_EventName.prototype._ensureArrow = function(cfg){
    if (this._arrow) return;
    this._arrow = new Sprite(new Bitmap(Math.max(4,cfg.w||ARROW_W), Math.max(4,cfg.h||ARROW_H)));
    this._arrow.anchor.x = 0.5; this._arrow.anchor.y = 0;
    this.addChild(this._arrow);
  };

  Sprite_EventName.prototype._drawArrowCached = function(cfg){
    if (!this._arrow) return;
    var key = String(cfg.color||"#FFFFFF")+"|"+(cfg.w||0)+"|"+(cfg.h||0)+"|"+(cfg.dir||"down");
    if (key === this._arrowCacheKey) return;
    this._arrowCacheKey = key;

    var w = Math.max(4, cfg.w|0), h = Math.max(4, cfg.h|0);
    if (this._arrow.bitmap.width !== w || this._arrow.bitmap.height !== h){
      this._arrow.bitmap = new Bitmap(w,h);
    } else {
      this._arrow.bitmap.clear();
    }
    var bm = this._arrow.bitmap;
    var ctx = bm.context;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = hex2rgba(cfg.color||ARROW_COLOR);
    ctx.beginPath();
    if ((cfg.dir||"down")==="down"){
      ctx.moveTo(w/2, h); ctx.lineTo(0, 0); ctx.lineTo(w, 0);
    } else {
      ctx.moveTo(w/2, 0); ctx.lineTo(0, h); ctx.lineTo(w, h);
    }
    ctx.closePath(); ctx.fill();
    bm._baseTexture.update();
  };

  Sprite_EventName.prototype.update = function(){
    Sprite.prototype.update.call(this);
    var ev = this._event; if (!ev || ev._erased){ this.visible=false; return; }
    this.visible=true;

    if (Graphics.frameCount < this._next) return;
    this._next = Graphics.frameCount + TICK;

    if (ev._sched && ev._schedActive === false){
      this._text.visible = false;
      if (this._arrow) this._arrow.visible = false;
      return;
    }

    var px = ev.screenX();
    var py = ev.screenY();
    var showText = !(ev._showAfterTalk && !ev._talkedTo) && !!ev._nameLabel;

    if (showText){
      var txt = String(ev._nameLabel).toUpperCase();
      var w = Math.max(120, Math.floor(txt.length*(this._fontSize*0.62))+20);
      var h = this._fontSize + 8;
      ensureTextBitmap(this, w, h);
      var bm=this._text.bitmap;
      bm.clear(); bm.drawText(txt,0,0,w,h,"center");

      var pulse = !!(ev._pulseWhenNew && (ev._hasNew || (ev._newFlagLetter && $gameSelfSwitches.value([$gameMap.mapId(), ev.eventId(), ev._newFlagLetter]))));
      if (pulse){
        this._tPulse += 0.12;
        var s = 1.0 + Math.sin(this._tPulse)*PULSE_AMP;
        this._text.scale.x = this._text.scale.y = s;
      } else {
        this._text.scale.x = this._text.scale.y = 1.0;
      }
      this._text.x = Math.round(px + (ev._nameOffsetX||0));
      this._text.y = Math.round(py + (ev._nameOffsetY||NAME_OY));
      this._text.visible = true;
    } else {
      if (this._text.bitmap) this._text.bitmap.clear();
      this._text.visible=false;
      this._text.scale.x = this._text.scale.y = 1.0;
    }

    var cfg = ev._arrowCfg || {};
    if (cfg.on){
      this._ensureArrow(cfg);
      if (this._arrow && this._arrow.bitmap){
        this._drawArrowCached(cfg);
        this._tArrow += (cfg.speed||ARROW_SPEED);
        var bob = Math.sin(this._tArrow) * (cfg.bob!=null?cfg.bob:ARROW_BOB);
        var ax = Math.round(px + (cfg.ox||0));
        var ayBase;
        if (this._text && this._text.visible) {
          ayBase = this._text.y - (this._text.bitmap ? this._text.bitmap.height : 0) - 6;
        } else {
          ayBase = py + (cfg.oy!=null?cfg.oy:-56);
        }
        this._arrow.x = ax;
        this._arrow.y = Math.round(ayBase + bob);
        this._arrow.visible = true;
      }
    } else if (this._arrow){
      this._arrow.visible=false;
    }
  };

  // ---------- Spriteset glue ----------
  var _SSM_init = Spriteset_Map.prototype.initialize;
  Spriteset_Map.prototype.initialize = function(){
    _SSM_init.call(this);
    this._nameLayer = null;
    this._nameSprites = [];
  };

  function ensNameInfra(spr){
    if (!spr._baseSprite) return false;
    if (!spr._nameLayer){
      spr._nameLayer = new Sprite();
      spr._baseSprite.addChild(spr._nameLayer);
    }
    if (!spr._nameSprites) spr._nameSprites = [];
    return true;
  }

  var _SSM_createLower = Spriteset_Map.prototype.createLowerLayer;
  Spriteset_Map.prototype.createLowerLayer = function(){
    _SSM_createLower.call(this);
    ensNameInfra(this);
  };

  var _SSM_createChars = Spriteset_Map.prototype.createCharacters;
  Spriteset_Map.prototype.createCharacters = function(){
    _SSM_createChars.call(this);
    if (!ensNameInfra(this)){ this._namesDeferred = true; }
    else this._rebuildEventNames();
  };

  Spriteset_Map.prototype._rebuildEventNames = function(){
    if (!ensNameInfra(this)) return;
    var list = this._nameSprites || [];
    for (var i=0;i<list.length;i++){
      var sp = list[i]; if (sp && sp.parent) sp.parent.removeChild(sp);
    }
    this._nameSprites = [];

    var evs = ($gameMap && $gameMap.events) ? $gameMap.events() : [];
    for (var j=0;j<evs.length;j++){
      var ev = evs[j]; if (!ev) continue;
      var needs = !!(ev._nameLabel || (ev._arrowCfg && ev._arrowCfg.on));
      if (!needs) continue;
      var sp2 = new Sprite_EventName(ev);
      this._nameLayer.addChild(sp2);
      this._nameSprites.push(sp2);
    }
  };

  var _SSM_update = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function(){
    _SSM_update.call(this);

    if (this._namesDeferred && ensNameInfra(this)){
      this._namesDeferred = false;
      this._rebuildEventNames();
    }

    var list = this._nameSprites || [];
    for (var i=0;i<list.length;i++){
      var s=list[i]; if (s && s.update) s.update();
    }

    if (!NoqEventNamesSimpleV5._nextSched || Graphics.frameCount >= NoqEventNamesSimpleV5._nextSched){
      NoqEventNamesSimpleV5._nextSched = Graphics.frameCount + SCHED_TICK;
      this._runSchedulerPass();
    }
  };

  Spriteset_Map.prototype._runSchedulerPass = function(){
    var hour = nowHour();
    var evs = ($gameMap && $gameMap.events) ? $gameMap.events() : [];
    for (var i=0;i<evs.length;i++){
      var ev = evs[i]; if (!ev) continue;
      var sc = ev._sched;
      if (!sc || !sc.hours || sc.hours.length===0) { ev._schedActive = true; continue; }

      var h = hour, active=false;
      for (var k=0;k<sc.hours.length;k++){
        var r=sc.hours[k];
        if (r.start <= r.end){ active = active || (h>=r.start && h<r.end); }
        else { active = active || (h>=r.start || h<r.end); }
      }
      if (active) active = weatherOk(sc.weather);

      if (active === sc._lastActive){
        ev._schedActive = active;
        continue;
      }
      sc._lastActive = active;
      ev._schedActive = active;

      if (sc.mode==="switch"){
        $gameSelfSwitches.setValue([$gameMap.mapId(), ev.eventId(), sc.letter], !!active);
      } else if (sc.mode==="erase"){
        if (!active) ev.erase(); else ev.refresh();
      } else if (sc.mode==="opacity"){
        ev._noqBaseOpacity = active ? 255 : sc.inactiveOpacity;
        if (!ev._noqGhosting) ev.setOpacity(ev._noqBaseOpacity);
      } else { // fade (default)
        if (sc.excludeFade){ 
            ev._noqBaseOpacity = active ? 255 : 0;
            if (!ev._noqGhosting) ev.setOpacity(ev._noqBaseOpacity);
        } else {
            ev._fadeTarget = active ? 255 : 0;
        }
      }
    }
  };

  // FADE TWEEN: Moved to main update loop so it works on stationary NPCs
  var _GE_update_fade = Game_Event.prototype.update;
  Game_Event.prototype.update = function() {
      _GE_update_fade.call(this);
      
      if (this._fadeTarget != null) {
          var cur = this._noqBaseOpacity !== undefined ? this._noqBaseOpacity : this.opacity();
          if (cur !== this._fadeTarget) {
              var next = cur + (this._fadeTarget > cur ? FADE_SPEED : -FADE_SPEED);
              if ((this._fadeTarget > cur && next > this._fadeTarget) || 
                  (this._fadeTarget < cur && next < this._fadeTarget)) {
                  next = this._fadeTarget;
              }
              this._noqBaseOpacity = next; // Pathfinding can read this
              if (!this._noqGhosting) {
                  this.setOpacity(Math.max(0, Math.min(255, Math.round(next))));
              }
          }
      }
  };

  var _GE_setupPg2 = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function(){
    _GE_setupPg2.call(this);
    var sc = SceneManager._scene, sp = sc && sc._spriteset;
    if (sp && sp._rebuildEventNames) sp._rebuildEventNames();
  };

  var _GE_start = Game_Event.prototype.start;
  Game_Event.prototype.start = function(){
    NoqEventNamesSimpleV5._talkCandidateId = this.eventId();
    _GE_start.call(this);
  };

  var _GI_cmd101 = Game_Interpreter.prototype.command101;
  Game_Interpreter.prototype.command101 = function(){
    NoqEventNamesSimpleV5._lastTalkEventId = (this._eventId>0) ? this._eventId : (NoqEventNamesSimpleV5._talkCandidateId||0);
    return _GI_cmd101.call(this);
  };

  var _WM_term = Window_Message.prototype.terminateMessage;
  Window_Message.prototype.terminateMessage = function(){
    _WM_term.call(this);
    var id = NoqEventNamesSimpleV5._lastTalkEventId || NoqEventNamesSimpleV5._talkCandidateId;
    if (id>0 && $gameMap && $gameMap.event(id)){
      var ev = $gameMap.event(id);
      ev._talkedTo = true;
      var sc = SceneManager._scene, sp = sc && sc._spriteset;
      if (sp && sp._rebuildEventNames) sp._rebuildEventNames();
    }
    NoqEventNamesSimpleV5._lastTalkEventId = 0;
    NoqEventNamesSimpleV5._talkCandidateId = 0;
  };

  var _PC = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(cmd,args){
    _PC.call(this,cmd,args);
    cmd = String(cmd||"").toLowerCase();
    if (cmd==="eventnames"){
      var sub = String(args[0]||"").toLowerCase();
      if (sub==="debug"){ DEBUG = /on|true|1/i.test(args[1]||""); console.log("[EventNamesV5] Debug =", DEBUG); }
      else if (sub==="refresh"){
        var sc=SceneManager._scene, sp=sc && sc._spriteset;
        if (sp && sp._rebuildEventNames) sp._rebuildEventNames();
      }
      else if (sub==="new"){
        var id = Number(args[1]||0)|0; var on = /on|true|1/i.test(args[2]||"");
        var ev = $gameMap.event(id); if (ev){ ev._hasNew = on; }
      }
    }
  };

  console.log("[EventNamesSimple v5.4] Synced with NoQ Pathfinding.");
})();