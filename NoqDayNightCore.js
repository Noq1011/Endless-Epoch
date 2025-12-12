/*:
 * @plugindesc v1.6b Day/Night Core + Gradient Tint + Weather Blending + Pause-Safe [ES5 MV]
 * @author Tyson
 *
 * @param Minutes Per Day
 * @text Minutes Per Day
 * @default 1440
 * @type number
 *
 * @param Start Hour
 * @text Start Hour
 * @default 8
 * @type number
 */

var DayNight = DayNight || {};
var DayNightTint = DayNightTint || {};

// --- Prevent undefined global errors if weather not loaded yet ---
if (typeof RainDropManagerGlobal === "undefined") var RainDropManagerGlobal = null;
if (typeof FogManagerGlobal === "undefined") var FogManagerGlobal = null;

(function() {
  var params = PluginManager.parameters('DayNightCore');
  var minutesPerDay = Number(params['Minutes Per Day'] || 1440);
  var startHour = Number(params['Start Hour'] || 8);
  var framesPerMinute = Math.max(1, Math.floor((minutesPerDay * 60) / (24 * 60)));
  var clock = { minutes: 0, hours: startHour, days: 1, frameCounter: 0 };

  // --------------------- CLOCK SYSTEM ---------------------
// --- Clock Update ---
var _Game_Map_update = Game_Map.prototype.update;
Game_Map.prototype.update = function(sceneActive) {
  _Game_Map_update.call(this, sceneActive);

  // ⏸ Stop advancing time if frozen
  if (DayNight._frozen) return;

  clock.frameCounter++;
  if (clock.frameCounter >= framesPerMinute) {
    clock.frameCounter = 0;
    clock.minutes++;
    if (clock.minutes >= 60) { clock.minutes = 0; clock.hours++; }
    if (clock.hours >= 24) { clock.hours = 0; clock.days++; }
  }
};

// --- Freeze API ---
DayNightTint.freeze = function(bool){
  DayNightTint._frozen = !!bool;
  DayNight._frozen = !!bool;   // also stop the in-game clock
};
DayNightTint.isFrozen = function(){ return !!DayNightTint._frozen; };

  DayNight.hour = function(h){ if(h!==undefined)clock.hours=Math.floor(h)%24; return clock.hours; };
  DayNight.minute=function(m){ if(m!==undefined)clock.minutes=Math.floor(m)%60; return clock.minutes; };
  DayNight.day=function(d){ if(d!==undefined)clock.days=Math.max(1,Math.floor(d)); return clock.days; };
  DayNight.advance=function(mins){ mins=Math.floor(mins);
    clock.minutes+=mins;
    while(clock.minutes>=60){clock.minutes-=60;clock.hours++;}
    while(clock.hours>=24){clock.hours-=24;clock.days++;}
  };
  DayNight.isDay=function(){var h=clock.hours+clock.minutes/60;return h>=6&&h<18;};
  DayNight.isNight=function(){var h=clock.hours+clock.minutes/60;return(h>=18&&h<=23.999)||h<6;};

  // --------------------- TINT OVERLAY ---------------------
  var TRANSITION_SPEED=0.02;
  DayNightTint._overrideAlpha=null;
  DayNightTint._overrideColor=null;
  DayNightTint._savedColor=null;

  var COLORS={
    day:{r:0,g:0,b:0,a:0},
    sunset:{r:64,g:32,b:0,a:64},
    night:{r:0,g:0,b:64,a:128},
    dawn:{r:32,g:32,b:64,a:64}
  };

  // ---- Scene_Map setup ----
  var _Scene_Map_createDisplayObjects=Scene_Map.prototype.createDisplayObjects;
  Scene_Map.prototype.createDisplayObjects=function(){
    _Scene_Map_createDisplayObjects.call(this);
    if(!this._dayNightOverlay){
      this._dayNightOverlay=new ScreenOverlaySprite();
      this.addChild(this._dayNightOverlay);
    }
  };

  var _Scene_Map_update=Scene_Map.prototype.update;
  Scene_Map.prototype.update=function(){
    _Scene_Map_update.call(this);
    if(this._dayNightOverlay)this._dayNightOverlay.updateTint();
  };

  // ---- Overlay Sprite ----
  function ScreenOverlaySprite(){this.initialize.apply(this,arguments);}
  ScreenOverlaySprite.prototype=Object.create(Sprite.prototype);
  ScreenOverlaySprite.prototype.constructor=ScreenOverlaySprite;

  ScreenOverlaySprite.prototype.initialize=function(){
    Sprite.prototype.initialize.call(this);
    this.bitmap=new Bitmap(Graphics.width,Graphics.height);
    this.bitmap.fillAll('black');
    this.opacity=0;
    this._target={r:0,g:0,b:0,a:0};
    this._current={r:0,g:0,b:0,a:0};
    if(DayNightTint._savedColor) this._current=JSON.parse(JSON.stringify(DayNightTint._savedColor));
  };

  ScreenOverlaySprite.prototype.updateTint=function(){
    var mapData=$dataMap;if(!mapData)return;
    if(mapData.note&&/<NoDayNight>/i.test(mapData.note)){this.opacity=0;return;}
    if(mapData.note&&/<FixedTint:\d+,\d+,\d+,\d+>/i.test(mapData.note)){
      var m=/<FixedTint:(\d+),(\d+),(\d+),(\d+)>/i.exec(mapData.note);
      this._target={r:+m[1],g:+m[2],b:+m[3],a:+m[4]};
    }else{this._target=this._computeTintFromTime();}

    if(DayNightTint._overrideColor)this._target=DayNightTint._overrideColor;
    if(DayNightTint._overrideAlpha!==null)this._target.a=DayNightTint._overrideAlpha;

    this._current.r+=(this._target.r-this._current.r)*TRANSITION_SPEED;
    this._current.g+=(this._target.g-this._current.g)*TRANSITION_SPEED;
    this._current.b+=(this._target.b-this._current.b)*TRANSITION_SPEED;
    this._current.a+=(this._target.a-this._current.a)*TRANSITION_SPEED;

    this.bitmap.clear();
    this.bitmap.fillAll('rgb('+Math.floor(this._current.r)+','+Math.floor(this._current.g)+','+Math.floor(this._current.b)+')');
    this.opacity=this._current.a;

    // Save last tint for persistence
    DayNightTint._savedColor=JSON.parse(JSON.stringify(this._current));
  };

  ScreenOverlaySprite.prototype._computeTintFromTime=function(){
    var h=DayNight.hour()+DayNight.minute()/60;
    var c=COLORS.day;
    if(h>=4&&h<6){var t=(h-4)/2;c=blendColors(COLORS.night,COLORS.dawn,t);}
    else if(h>=6&&h<16){c=COLORS.day;}
    else if(h>=16&&h<18){var t2=(h-16)/2;c=blendColors(COLORS.sunset,COLORS.night,t2);}
    else if(h>=18&&h<22){var t3=(h-18)/4;c=blendColors(COLORS.night,COLORS.night,t3);}
    else if(h>=22||h<4){c=COLORS.night;}

    // ---- Safe Weather blending ----
    var rainPower=0,fogPower=0;
    try {
      if(typeof WeatherSystem!=="undefined"){
        if(RainDropManagerGlobal && RainDropManagerGlobal._currentOpacity)
          rainPower=RainDropManagerGlobal._currentOpacity/200;
        if(FogManagerGlobal && FogManagerGlobal._currentOpacity)
          fogPower=FogManagerGlobal._currentOpacity/150;
      }
    } catch(e){ rainPower=0; fogPower=0; }

    var weatherFactor=Math.min(1,(rainPower+fogPower)/2);
    if(rainPower>0){
      c=blendColors(c,{r:32,g:32,b:48,a:c.a+32*weatherFactor},weatherFactor);
    }
    if(fogPower>0){
      c=blendColors(c,{r:96,g:96,b:96,a:c.a+32*weatherFactor},weatherFactor);
    }
    return c;
  };

  function blendColors(c1,c2,t){
    var mix=function(a,b){return a+(b-a)*t;};
    return{r:mix(c1.r,c2.r),g:mix(c1.g,c2.g),b:mix(c1.b,c2.b),a:mix(c1.a,c2.a)};
  }

  DayNightTint.setTint=function(r,g,b,a){DayNightTint._overrideColor={r:r,g:g,b:b,a:a};};
  DayNightTint.clearTintOverride=function(){DayNightTint._overrideColor=null;DayNightTint._overrideAlpha=null;};

})();
// Reusable time helper (24h, midnight wrap OK)
window.NoqTime = window.NoqTime || (function(){
  function hm(){
    var h=null, m=null;
    // ✅ Use your core's accessors
    if (typeof DayNight !== "undefined") {
      if (typeof DayNight.hour   === "function") h = DayNight.hour();
      if (typeof DayNight.minute === "function") m = DayNight.minute();
    }
    // Fallbacks (optional)
    if (h==null && typeof DayNightTint !== "undefined") {
      if (typeof DayNightTint.getHour   === "function")  h = DayNightTint.getHour();
      if (typeof DayNightTint.getMinute === "function")  m = DayNightTint.getMinute();
      if (h==null && typeof DayNightTint.hour   === "number") h = DayNightTint.hour;
      if (m==null && typeof DayNightTint.minute === "number") m = DayNightTint.minute;
    }
    // If you store time in variables, uncomment and set IDs:
    // if (h==null) h = $gameVariables.value(101)|0;
    // if (m==null) m = $gameVariables.value(102)|0;

    if (h==null) h = 0;
    if (m==null) m = 0;
    return { h:(h|0), m:(m|0) };
  }
  function mins(h,m){ return (h|0)*60 + (m|0); }
  function parse(s){ s=String(s||"0:00").trim(); var a=s.split(":"); return {h:a[0]|0, m:a[1]|0}; }
  function between(start,end){
    var now = hm(), S=parse(start), E=parse(end);
    var n = mins(now.h,now.m), s = mins(S.h,S.m), e = mins(E.h,E.m);
    // Inclusive start, exclusive end; wraps midnight automatically
    return (s<=e) ? (n>=s && n<e) : (n>=s || n<e);
  }
  function outside(start,end){ return !between(start,end); }
  return { between: between, outside: outside };
})();