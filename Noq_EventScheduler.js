/*:
 * @target MV
 * @plugindesc (MV ES5) Event Scheduler v1.0 — Show/Hide events by time & weather via note-tags. Toggles a self switch or erases event.
 * @author Noq & ChatGPT
 *
 * @help
 * Tag on an event:
 *   <ActiveHours: 6-10, 16-20>          # 24h clock, commas = multiple ranges
 *   <ActiveSwitch: A>                    # default A (self-switch letter)
 *   <ActiveMode: switch>                 # switch | erase | opacity
 *   <ActiveWeather: any>                 # any | none | rain | storm | snow | fog (comma OK)
 *   <InactiveOpacity: 100>               # only if mode=opacity (0..255)
 *
 * Behavior:
 *  - mode=switch: turns SelfSwitch <letter> ON during active hours (OFF otherwise)
 *  - mode=erase: erases event (reappears on map reload) when inactive
 *  - mode=opacity: sets event opacity to InactiveOpacity when inactive
 *
 * Runs every N frames (param). Uses DayNight hour/minute if present.
 *
 * Plugin Commands:
 *   Schedule Refresh
 *   Schedule Enable
 *   Schedule Disable
 */

var NoqEventScheduler = NoqEventScheduler || {};
(function(){
  "use strict";

  var P = PluginManager.parameters("Noq_EventScheduler");
  var TICK = Math.max(10, Number(P["Update Frames"]||30)|0);
  var ENABLED = true;

  // --- helpers
  function parseRanges(s){
    var out=[], parts=String(s||"").split(",");
    for (var i=0;i<parts.length;i++){
      var seg=parts[i].trim(); if(!seg) continue;
      var mm=/^(\d{1,2})(?::(\d{1,2}))?\s*-\s*(\d{1,2})(?::(\d{1,2}))?$/.exec(seg);
      if (mm){
        var h1=Number(mm[1])|0, m1=Number(mm[2]||0)|0, h2=Number(mm[3])|0, m2=Number(mm[4]||0)|0;
        out.push({start:h1+m1/60, end:h2+m2/60});
      }
    }
    return out;
  }
  function nowHour(){
    try{
      if (typeof DayNight!=="undefined" && DayNight.hour && DayNight.minute){
        return DayNight.hour() + DayNight.minute()/60;
      }
    }catch(e){}
    // fallback: assume midday
    return 12;
  }
  function weatherType(){
    try{
      if ($gameSystem && $gameSystem._persistentWeather){
        var s=$gameSystem._persistentWeather;
        if (s.active.storm) return "storm";
        if (s.active.rain)  return "rain";
        if (s.active.snow)  return "snow";
        if (s.active.fog)   return "fog";
        return "none";
      }
    }catch(e){}
    if ($gameScreen) return $gameScreen._weatherType || "none";
    return "none";
  }
  function weatherOk(tag){
    if (!tag || tag==="") return true;
    var want = tag.toLowerCase().split(/[,\s]+/).filter(Boolean);
    if (want.indexOf("any")>=0) return true;
    var t = weatherType();
    if (t==="none") return want.indexOf("none")>=0;
    return want.indexOf(t)>=0;
  }

  // --- parse tags per page
  var _setupPage = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function(){
    _setupPage.call(this);
    var note = (this.event() && this.event().note) || "";
    var mHours = /<ActiveHours:\s*([^>]+)>/i.exec(note);
    var mSw    = /<ActiveSwitch:\s*([A-D])>/i.exec(note);
    var mMode  = /<ActiveMode:\s*(switch|erase|opacity)>/i.exec(note);
    var mWx    = /<ActiveWeather:\s*([^>]+)>/i.exec(note);
    var mOp    = /<InactiveOpacity:\s*(\d{1,3})>/i.exec(note);

    this._sched = {
      hours: mHours ? parseRanges(mHours[1]) : null,
      letter: mSw ? mSw[1].toUpperCase() : "A",
      mode: (mMode?mMode[1].toLowerCase():"switch"),
      weather: mWx ? mWx[1] : "",
      inactiveOpacity: mOp ? Math.max(0, Math.min(255, Number(mOp[1])|0)) : 100,
      _lastActive: null
    };
  };

  // --- engine
  var _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function(){
    _Scene_Map_start.call(this);
    NoqEventScheduler._next = 0;
  };

  var _Spriteset_Map_update = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function(){
    _Spriteset_Map_update.call(this);
    if (!ENABLED) return;
    if (Graphics.frameCount < (NoqEventScheduler._next||0)) return;
    NoqEventScheduler._next = Graphics.frameCount + TICK;

    var hour = nowHour();
    var wt = weatherType();

    $gameMap.events().forEach(function(ev){
      var sc = ev._sched;
      if (!sc || !sc.hours || sc.hours.length===0) return;

      // time check
      var active = false, h = hour;
      for (var i=0;i<sc.hours.length;i++){
        var r = sc.hours[i];
        // supports ranges that wrap past midnight (e.g. 22-2)
        if (r.start <= r.end) { active = active || (h >= r.start && h < r.end); }
        else { active = active || (h >= r.start || h < r.end); }
      }
      // weather check
      if (active) active = weatherOk(sc.weather);

      if (active === sc._lastActive) return; // no change
      sc._lastActive = active;

      if (sc.mode === "switch"){
        $gameSelfSwitches.setValue([$gameMap.mapId(), ev.eventId(), sc.letter], !!active);
      } else if (sc.mode === "erase"){
        if (!active) ev.erase(); else ev.refresh(); // appears after reload
      } else if (sc.mode === "opacity"){
        ev.setOpacity(active ? 255 : sc.inactiveOpacity);
      }
    });
  };

  // plugin commands
  var _pc = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(cmd, args){
    _pc.call(this, cmd, args);
    cmd = (cmd||"").toLowerCase();
    if (cmd === "schedule"){
      var sub = (args[0]||"").toLowerCase();
      if (sub==="refresh"){ NoqEventScheduler._next = 0; $gameMap.requestRefresh(); }
      if (sub==="enable"){ ENABLED = true; }
      if (sub==="disable"){ ENABLED = false; }
    }
  };
})();