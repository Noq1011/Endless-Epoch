/*:
 * @target MV
 * @plugindesc (MV ES5) NPC & Player Shadows — dynamic shadow under events, player, & followers; reacts to Day/Night, rain, & ambient lighting.
 * @author Noq
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
 * @param Enable Player Shadow
 * @type boolean
 * @default true
 *
 * @param Enable Follower Shadows
 * @type boolean
 * @default true
 *
 * @help
 * Tag on event notes or page comments:
 *   <Shadow>                    # use defaults
 *   <Shadow: ox:0|oy:6|scale:1.0|soft:1>
 *
 * Player / Follower Note-tag:
 *   <Shadow>                    # forces shadow on player/followers if defaults are off
 *   <NoShadow>                  # hides shadow on a specific event/follower
 *
 * Sits as a child of the character's Sprite_Character at index 0, rendering
 * under the body and naturally respecting upper tiles. Dynamically softens 
 * based on your EG Ambient Lighting / DayNight brightness levels.
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
  var PLAYER_SHADOW = String(P["Enable Player Shadow"]||"true").toLowerCase()==="true";
  var FOLLOWER_SHADOW = String(P["Enable Follower Shadows"]||"true").toLowerCase()==="true";

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

  // --- Parse Events ---
  var _GE_setup = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function(){
    _GE_setup.call(this);
    var ev=this.event(), page=this.page();
    var text = String(ev && ev.note || "") + " " + getPageCommentText(page);
    
    if (/<NoShadow>/i.test(text)) {
      this._shadowEnabled = false;
      return;
    }
    
    this._shadowEnabled = /<Shadow>/i.test(text);
    var m = /<Shadow:\s*([^>]+)>/i.exec(text);
    this._shadowCfg = { ox:DEF_OX, oy:DEF_OY, scale:DEF_SCALE, soft:1 };
    if (m){
      this._shadowEnabled = true;
      m[1].split("|").forEach(function(seg){
        seg = seg.trim(); if (!seg) return;
        var kv = seg.split(":"); var k=(kv[0]||"").trim().toLowerCase(); var v=(kv[1]||"").trim();
        if (k==="ox")       this._shadowCfg.ox = Number(v)||0;
        else if (k==="oy")  this._shadowCfg.oy = Number(v)||0;
        else if (k==="scale") this._shadowCfg.scale = Number(v)||1.0;
        else if (k==="soft")  this._shadowCfg.soft = /1|true|on/i.test(v)?1:0;
      }, this);
    }
  };

  // --- Parse Player / Followers ---
  Game_Player.prototype.hasShadowConfig = function() {
    var note = $dataActors && $dataActors[$gameParty.leader() ? $gameParty.leader().actorId() : 1] ? $dataActors[$gameParty.leader().actorId()].note : "";
    if (/<NoShadow>/i.test(note)) return false;
    if (/<Shadow>/i.test(note)) return true;
    return PLAYER_SHADOW;
  };

  Game_Follower.prototype.hasShadowConfig = function() {
    var actor = this.actor();
    var note = (actor && $dataActors[actor.actorId()]) ? $dataActors[actor.actorId()].note : "";
    if (/<NoShadow>/i.test(note)) return false;
    if (/<Shadow>/i.test(note)) return true;
    return FOLLOWER_SHADOW;
  };

  function makeFallbackShadowBitmap(){
    var w=28,h=12,bm=new Bitmap(w,h);
    for (var y=0;y<h;y++){
      var t=y/h;
      var alpha = 0.55*(1.0 - Math.abs(0.5 - t)*2);
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

    var ch = this._character;
    if (!ch) return;

    var isEvent = (ch instanceof Game_Event);
    var isPlayer = (ch instanceof Game_Player);
    var isFollower = (ch instanceof Game_Follower);

    if (!isEvent && !isPlayer && !isFollower) return;

    // Determine if shadow should display
    var enabled = false;
    var cfg = { ox: DEF_OX, oy: DEF_OY, scale: DEF_SCALE };

    if (isEvent) {
      if (!ch._shadowEnabled) {
        if (this._noqShadow) this._noqShadow.visible = false;
        return;
      }
      if (TIE_SCHED && ch._sched && ch._schedActive === false) {
        if (this._noqShadow) this._noqShadow.visible = false;
        return;
      }
      enabled = true;
      if (ch._shadowCfg) cfg = ch._shadowCfg;
    } else if (isPlayer) {
      enabled = ch.hasShadowConfig();
    } else if (isFollower) {
      enabled = ch.hasShadowConfig() && ch.isVisible();
    }

    if (!enabled) {
      if (this._noqShadow) this._noqShadow.visible = false;
      return;
    }

    // Initialize shadow sprite if missing
    if (!this._noqShadow){
      var tex = ImageManager.loadSystem(TEX);
      var spr = new Sprite(tex);
      spr.bitmap.addErrorListener && spr.bitmap.addErrorListener(function(){
        spr.bitmap = makeFallbackShadowBitmap();
      });
      spr.anchor.x = 0.5;
      spr.anchor.y = 0;
      this.addChildAt(spr, 0);
      this._noqShadow = spr;
    }

    var ph = (typeof this.patternHeight === "function") ? this.patternHeight() : 48;
    this._noqShadow.x = Math.round((cfg.ox || 0));
    this._noqShadow.y = Math.round((ph / 2) + (cfg.oy || DEF_OY));
    this._noqShadow.scale.x = this._noqShadow.scale.y = cfg.scale || 1.0;

    // --- AMBIENT LIGHTING & DAY/NIGHT INTEGRATION ---
    var baseAlpha = 0.85;
    
    // 1. Read from Day/Night core or ambient brightness if available
    try {
      if (typeof DayNightTint !== "undefined" && DayNightTint._savedColor) {
        // Automatically lowers shadow intensity as ambient environment darkens or brightens
        var tintAlpha = DayNightTint._savedColor.a / 255;
        baseAlpha = Math.max(0.25, 0.85 - (tintAlpha * 0.4));
      } else if (typeof DayNight !== "undefined" && DayNight.hour){
        var hr = DayNight.hour();
        baseAlpha = (hr >= 19 || hr < 6) ? 0.45 : 0.85;
      }
    } catch(e){}

    // 2. Indoor Mode override check from your ambient lighting script
    try {
      if ($gameSystem && typeof $gameSystem.isIndoorMode === "function" && $gameSystem.isIndoorMode()) {
        var bright = $gameSystem.ambientBrightness ? $gameSystem.ambientBrightness() : 255;
        baseAlpha = 0.85 * (bright / 255);
      }
    } catch(e){}

    // 3. Weather adjustments
    try {
      var wt = weatherType();
      if (wt === "rain" || wt === "storm") baseAlpha = Math.min(1.0, baseAlpha + 0.10);
    } catch(e){}

    this._noqShadow.alpha = Math.max(0, Math.min(1, baseAlpha));
    this._noqShadow.visible = true;
  };

  console.log("[NPCShadows] v2.0 Loaded — Events, Player, and Followers supported with Ambient/Night reactivity.");
})();