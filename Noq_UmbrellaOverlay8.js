/*:
 * @target MV
 * @plugindesc (MV ES5) Umbrella Overlay 8-way — note/comment-tagged NPCs spawn an umbrella overlay in rain/storm (optional snow). 1x8 sheet. Ties to scheduler if desired.
 * @author Noq
 *
 * @param Default Sheet
 * @type file
 * @dir img/system/
 * @default Umbrella8_sheet
 *
 * @param Show In Snow
 * @type boolean
 * @default true
 *
 * @param Master Switch ID
 * @type number
 * @default 0
 * @desc If > 0, overlay only runs when this game switch is ON.
 *
 * @param Default Offset X
 * @type number
 * @default 0
 *
 * @param Default Offset Y
 * @type number
 * @default -26
 *
 * @param Default Scale
 * @type number
 * @decimals 2
 * @default 1.00
 *
 * @param Tick Throttle
 * @type number
 * @default 6
 * @desc Update cadence in frames (higher = cheaper).
 *
 * @param Enable Via Comment
 * @type boolean
 * @default true
 * @desc If true, <Umbrella> on page comments also works (not just event note).
 *
 * @param Tie To Schedule
 * @type boolean
 * @default true
 * @desc If true and event has ActiveHours, show only while active.
 */

var NoqUmbrella8 = NoqUmbrella8 || {};
(function(){
  "use strict";
  var PLUGIN_NAME = "Noq_UmbrellaOverlay8";
  var P = PluginManager.parameters(PLUGIN_NAME);
  var DEF_SHEET = String(P["Default Sheet"]||"Umbrella8_sheet");
  var SHOW_SNOW = String(P["Show In Snow"]||"true").toLowerCase()==="true";
  var MASTER_SWITCH = Number(P["Master Switch ID"]||0)|0;
  var DEF_OX = Number(P["Default Offset X"]||0)|0;
  var DEF_OY = Number(P["Default Offset Y"]||-26)|0;
  var DEF_SCALE = Number(P["Default Scale"]||1);
  var TICK = Math.max(1, Number(P["Tick Throttle"]||6)|0);
  var VIA_COMMENT = String(P["Enable Via Comment"]||"true").toLowerCase()==="true";
  var TIE_SCHED = String(P["Tie To Schedule"]||"true").toLowerCase()==="true";

  var DEBUG = false;
  function dbg(){ if (DEBUG) console.log.apply(console, ["[Umbrella8]"].concat([].slice.call(arguments))); }

  // plugin command: Umbrella8 Debug on/off
  var _cmd = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(command, args){
    _cmd.call(this, command, args);
    if ((command||"").toLowerCase() === "umbrella8"){
      var sub = (args[0]||"").toLowerCase();
      if (sub === "debug"){
        DEBUG = /on|true|1/i.test(args[1]||"");
        console.log("[Umbrella8] Debug =", DEBUG);
      }
    }
  };

  // weather helpers — NoqWeatherCore → RegionFX → MV
  function weatherInfo(){
    // 1) NoqWeatherCore persistent state
    if ($gameSystem && $gameSystem._persistentWeather) {
      try {
        var a = $gameSystem._persistentWeather.active || {};
        if (a.storm) return { type:"storm", power: a.rain|0 || 9 };
        if (a.rain)  return { type:"rain" , power: a.rain|0 };
        if (a.snow)  return { type:"snow" , power: a.snow|0 || 9 };
        if (a.fog)   return { type:"fog"  , power: a.fog|0  };
        return { type:"none", power:0 };
      } catch(e){}
    }
    // 2) RegionFX relay
    if (window.RegionFX && RegionFX._weatherType){
      return { type: RegionFX._weatherType||"none", power: RegionFX._weatherPower|0 };
    }
    // 3) MV default
    if (window.$gameScreen){
      return { type: $gameScreen._weatherType||"none", power: ($gameScreen._weatherPower|0)||0 };
    }
    return { type:"none", power:0 };
  }
  function isWetFor(cfg){
    var w = weatherInfo();
    var ok = (w.type === "rain" || w.type === "storm" || (cfg && cfg.snow && w.type === "snow"));
    return ok && w.power > 0;
  }

  // Hook NoqWeatherCore updates to nudge a refresh (optional, cheap)
  if (window.WeatherSystem && !WeatherSystem._umb8Patched) {
    (function(){
      var _set = WeatherSystem.setWeather;
      WeatherSystem.setWeather = function(type, power){
        var r = _set ? _set.apply(this, arguments) : undefined;
        try{
          if (SceneManager._scene && SceneManager._scene._spriteset) {
            var list = SceneManager._scene._spriteset._characterSprites || [];
            for (var i=0;i<list.length;i++){ if (list[i] && list[i].update) list[i].update(); }
          }
        }catch(e){}
        return r;
      };
      WeatherSystem._umb8Patched = true;
    })();
  }

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

  function parseUmbrellaNote(note){
    // Accept <Umbrella> or <Umbrella: key:val|key:val>
    var m = /<Umbrella(?::([^>]*))?>/i.exec(String(note||""));
    if (!m) return null;
    var cfg = { sheet: DEF_SHEET, ox: DEF_OX, oy: DEF_OY, scale: DEF_SCALE, snow: SHOW_SNOW ? 1 : 0 };
    if (m[1]){
      var parts = m[1].split("|");
      for (var i=0;i<parts.length;i++){
        var seg = parts[i].trim();
        if (!seg) continue;
        var kv = seg.split(":");
        var k = (kv[0]||"").trim().toLowerCase();
        var v = (kv[1]||"").trim();
        if (k === "sheet") cfg.sheet = v;
        else if (k === "ox") cfg.ox = Number(v)||0;
        else if (k === "oy") cfg.oy = Number(v)||0;
        else if (k === "scale") cfg.scale = Number(v)||1.0;
        else if (k === "snow") cfg.snow = /1|true|on/i.test(v) ? 1 : 0;
      }
    }
    return cfg;
  }

  // tag capture on page change
  var _GE_setupPage = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function(){
    _GE_setupPage.call(this);
    var ev = this.event(); var page = this.page();
    var text = String(ev && ev.note || "");
    if (VIA_COMMENT) text += " " + getPageCommentText(page);
    this._umb8_cfg = parseUmbrellaNote(text);
    // convenience: tie to schedule only when asked
    this._umb8_tieSched = TIE_SCHED && /<UmbrellaOnWhenActive>/i.test(text);
  };

  // Sprite_Character overlay
  var _SC_init = Sprite_Character.prototype.initialize;
  Sprite_Character.prototype.initialize = function(ch){
    _SC_init.call(this, ch);
    this._umb8 = null;
    this._umb8Next = 0;
  };

  var _SC_update = Sprite_Character.prototype.update;
  Sprite_Character.prototype.update = function(){
    _SC_update.call(this);

    var ev = (this._character instanceof Game_Event) ? this._character : null;
    if (!ev) return;

    // no tag ⇒ nothing
    if (!ev._umb8_cfg){
      if (this._umb8 && this._umb8.spr) this._umb8.spr.visible = false;
      return;
    }

    // master switch
    if (MASTER_SWITCH > 0 && !$gameSwitches.value(MASTER_SWITCH)){
      if (this._umb8 && this._umb8.spr) this._umb8.spr.visible = false;
      return;
    }

    // throttle
    if (Graphics.frameCount < this._umb8Next) return;
    this._umb8Next = Graphics.frameCount + TICK;

    // scheduler tie (only when <UmbrellaOnWhenActive> used)
    if (ev._umb8_tieSched && ev._sched && ev._schedActive === false){
      if (this._umb8 && this._umb8.spr) this._umb8.spr.visible = false;
      return;
    }

    var wet = isWetFor(ev._umb8_cfg);
    if (this._character.isTransparent() || !wet){
      if (this._umb8 && this._umb8.spr) this._umb8.spr.visible = false;
      return;
    }

    // ensure sprite exists & sheet loaded
    if (!this._umb8) this._umb8 = { spr:null, sheetName:"", frameW:0, frameH:0, lastDir:-999, cfg:null };
    var cfg = this._umb8.cfg = this._umb8.cfg || ev._umb8_cfg;
    var needNewSheet = (!this._umb8.spr) || (this._umb8.sheetName !== cfg.sheet);

    if (needNewSheet){
      if (this._umb8.spr){ this.removeChild(this._umb8.spr); this._umb8.spr = null; }
      var spr = new Sprite(ImageManager.loadSystem(cfg.sheet));
      spr.anchor.x = 0.5;
      spr.anchor.y = 1.0;
      spr.scale.x = spr.scale.y = cfg.scale || 1.0;
      this.addChild(spr);
      this._umb8.spr = spr;
      this._umb8.sheetName = cfg.sheet;
      this._umb8.frameW = 0;
      this._umb8.frameH = 0;
      var self = this;
      spr.bitmap.addLoadListener(function(){
        var fw = Math.floor(spr.bitmap.width / 8);
        var fh = spr.bitmap.height;
        self._umb8.frameW = fw; self._umb8.frameH = fh;
        spr.setFrame(0,0,fw,fh);
      });
    }

    var spr2 = this._umb8.spr;
    if (!spr2 || !spr2.bitmap || spr2.bitmap.width === 0){ return; } // wait for load

    // Direction mapping (cardinal + rough diagonals)
    var d = this._character.direction(); // 2,4,6,8
    var idx;
    var vx = this._character._x - this._character._realX;
    var vy = this._character._y - this._character._realY;
    if (vx || vy){
      if (Math.abs(vx) > 0 && Math.abs(vy) > 0){
        if (vy < 0 && vx > 0) idx = 1;      // NE
        else if (vy > 0 && vx > 0) idx = 3; // SE
        else if (vy > 0 && vx < 0) idx = 5; // SW
        else if (vy < 0 && vx < 0) idx = 7; // NW
      }
    }
    if (idx === undefined){
      if (d === 8) idx = 0;   // N
      else if (d === 6) idx = 2; // E
      else if (d === 2) idx = 4; // S
      else if (d === 4) idx = 6; // W
      else idx = 4;
    }

    if (this._umb8.lastDir !== idx){
      var fw = this._umb8.frameW, fh = this._umb8.frameH;
      spr2.setFrame(idx*fw, 0, fw, fh);
      this._umb8.lastDir = idx;
    }

    // place above head using patternHeight (guard fallback 48)
    var ph = (typeof this.patternHeight === "function") ? this.patternHeight() : 48;
    var headY = -ph + 8;
    spr2.x = Math.round(cfg.ox || 0);
    spr2.y = Math.round((cfg.oy || 0) + headY);
    spr2.visible = true;
  };

  console.log("[UmbrellaOverlay8] Loaded — 8-way overlay, rain/storm/snow, sched-aware.");
})();
