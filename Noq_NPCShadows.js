/*:
 * @target MV
 * @plugindesc (MV ES5) NPC Shadows — simple oval shadow under events tagged <Shadow>, reacts to Day/Night + rain, ties to scheduler; respects upper tiles (child of character). (ES5)
 * author Noq
 *
 * @param Texture
 * @type file
 * @dir img/system/
 * @default NoqShadow
 *
 * @param Default OX
 * @type number
 * @default 0
 *
 * @param Default OY
 * @type number
 * @default -66
 *
 * @param Default Scale
 * @type number
 * @decimals 2
 * @default 1.00
 *
 * @param Tie To Schedule
 * @type boolean
 * @default true
 *
 * @help
 * Tag on event note or page comments:
 *   <Shadow>                  # use defaults
 *   <Shadow: ox:0|oy:6|scale:1.0|soft:1>
 *
 * Sits as a child of the event's Sprite_Character at index 0, so it renders
 * under the NPC body and naturally respects upper tiles and other events.
 */

var NoqNPCShadows = NoqNPCShadows || {};
(function(){
  "use strict";
  var PN = "Noq_NPCShadows";
  var P = PluginManager.parameters(PN);
  var TEX = String(P["Texture"]||"NoqShadow");
  var DEF_OX = Number(P["Default OX"]||0)|0;
  var DEF_OY = Number(P["Default OY"]||-66)|0;
  var DEF_SCALE = Number(P["Default Scale"]||1.0);
  var TIE_SCHED = String(P["Tie To Schedule"]||"true").toLowerCase()==="true";

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

  var _GE_setup = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function(){
    _GE_setup.call(this);
    var ev=this.event(), page=this.page();
    var text = String(ev && ev.note || "") + " " + getPageCommentText(page);
    this._shadowEnabled = /<Shadow>/i.test(text);
    var m = /<Shadow:\s*([^>]+)>/i.exec(text);
    this._shadowCfg = { ox:DEF_OX, oy:DEF_OY, scale:DEF_SCALE, soft:1 };
    if (m){
      m[1].split("|").forEach(function(seg){
        seg = seg.trim(); if (!seg) return;
        var kv = seg.split(":"); var k=(kv[0]||"").trim().toLowerCase(); var v=(kv[1]||"").trim();
        if (k==="ox")    this._shadowCfg.ox = Number(v)||0;
        else if (k==="oy")    this._shadowCfg.oy = Number(v)||0;
        else if (k==="scale") this._shadowCfg.scale = Number(v)||1.0;
        else if (k==="soft")  this._shadowCfg.soft = /1|true|on/i.test(v)?1:0;
      }, this);
    }
  };

  function makeFallbackShadowBitmap(){
    var w=28,h=12,bm=new Bitmap(w,h);
    // soft oval
    for (var y=0;y<h;y++){
      var t=y/h;
      var alpha = 0.55*(1.0 - Math.abs(0.5 - t)*2); // darker mid
      bm.fillRect(0,y,w,1,"rgba(0,0,0,"+alpha.toFixed(3)+")");
    }
    return bm;
  }

  var _SC_init = Sprite_Character.prototype.initialize;
  Sprite_Character.prototype.initialize = function(ch){
    _SC_init.call(this, ch);
    this._noqShadow = null;
  };

  var _SC_update = Sprite_Character.prototype.update;
  Sprite_Character.prototype.update = function(){
    _SC_update.call(this);

    var ev = (this._character instanceof Game_Event) ? this._character : null;
    if (!ev) return;

    if (!ev._shadowEnabled){
      if (this._noqShadow) this._noqShadow.visible=false;
      return;
    }

    if (TIE_SCHED && ev._sched && ev._schedActive===false){
      if (this._noqShadow) this._noqShadow.visible=false;
      return;
    }

    if (!this._noqShadow){
      var tex = ImageManager.loadSystem(TEX);
      var spr = new Sprite(tex);
      spr.bitmap.addErrorListener && spr.bitmap.addErrorListener(function(){
        spr.bitmap = makeFallbackShadowBitmap();
      });
      spr.anchor.x = 0.5;
      spr.anchor.y = 0;
      // under the body within same character container
      this.addChildAt(spr, 0);
      this._noqShadow = spr;
    }

    var sc = ev._shadowCfg || {ox:0,oy:6,scale:1.0};
    var ph = (typeof this.patternHeight === "function") ? this.patternHeight() : 48;
    this._noqShadow.x = Math.round((sc.ox||0));
    this._noqShadow.y = Math.round((ph/2) + (sc.oy||6));
    this._noqShadow.scale.x = this._noqShadow.scale.y = sc.scale || 1.0;

    // alpha vs day/night + rain
    var alpha = 0.85;
    try {
      if (typeof DayNight!=="undefined" && DayNight.hour){
        var hr = DayNight.hour();
        alpha = (hr>=19 || hr<6) ? 0.45 : 0.85;
      }
    } catch(e){}
    try{
      var wt = weatherType();
      if (wt==="rain" || wt==="storm") alpha = Math.min(1.0, alpha + 0.10);
    }catch(e){}
    this._noqShadow.alpha = Math.max(0, Math.min(1, alpha));
    this._noqShadow.visible = true;
  };

  console.log("[NPCShadows] Loaded — oval shadow under events, day/night + rain aware.");
})();
