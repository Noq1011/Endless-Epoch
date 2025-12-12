/*:
 * @target MV
 * @plugindesc (MV ES5) RegionFX v1.3 — Region-driven puddles, snow, waterfalls & lakes that react to weather. Hooks NoqWeatherCore v3.x & (optional) MV weather.
 * @author Noq & ChatGPT
 *
 * @help
 * Paint Region IDs where puddles, snow, waterfalls, and lakes should appear.
 * Effects fade in/out with weather. Works with NoqWeatherCore (auto-hook) or
 * with MV's $gameScreen weather (if enabled in params).
 *
 * Map Note Tags:
 *   <NoRegionFX>            # disable entirely on this map
 *   <RegionFX:UnderOnly>    # force all effects under characters
 *
 * Plugin Commands:
 *   RegionFX Refresh
 *   RegionFX Enable
 *   RegionFX Disable
 *   RegionFX Force <type> <power>   # e.g. RegionFX Force rain 7
 *   RegionFX Debug on|off
 *
 * Place textures in img/system/:
 *   RegionFX_Puddle.png, RegionFX_Snow.png, RegionFX_Water.png, RegionFX_Waterfall.png
 * (If missing, simple generated placeholders are used.)
 *
 * ---------------------------------------------------------------------
 * PARAMETERS
 * ---------------------------------------------------------------------
 * @param Puddle Regions
 * @type string
 * @default 61
 * @desc CSV Region IDs for puddles during rain/storm.
 *
 * @param Snow Regions
 * @type string
 * @default 62
 * @desc CSV Region IDs for snow during snow weather.
 *
 * @param Waterfall Regions
 * @type string
 * @default 63
 * @desc CSV Region IDs for waterfall strips (edge-filtered).
 *
 * @param Lake Regions
 * @type string
 * @default 64
 * @desc CSV Region IDs for water/lake tiles.
 *
 * @param Use Default MV Weather
 * @type boolean
 * @default true
 * @desc If false, RegionFX ignores MV weather and clears it to avoid stacking.
 *
 * @param Lakes Always On
 * @type boolean
 * @default true
 *
 * @param Waterfalls Always On
 * @type boolean
 * @default true
 *
 * @param Puddle Density
 * @type number
 * @decimals 2
 * @default 1.00
 *
 * @param Snow Density
 * @type number
 * @decimals 2
 * @default 0.30
 *
 * @param Lake Density
 * @type number
 * @decimals 2
 * @default 1.00
 *
 * @param Waterfall Density
 * @type number
 * @decimals 2
 * @default 0.60
 *
 * @param Max Puddles
 * @type number
 * @default 200
 *
 * @param Max Snow
 * @type number
 * @default 140
 *
 * @param Max Lakes
 * @type number
 * @default 500
 *
 * @param Max Waterfalls
 * @type number
 * @default 60
 *
 * @param Draw Puddles Over Characters
 * @type boolean
 * @default false
 *
 * @param Draw Snow Over Characters
 * @type boolean
 * @default false
 *
 * @param Draw Lakes Over Characters
 * @type boolean
 * @default false
 *
 * @param Draw Waterfalls Over Characters
 * @type boolean
 * @default true
 *
 * @param Puddle Texture
 * @type file
 * @dir img/system/
 * @default RegionFX_Puddle
 *
 * @param Snow Texture
 * @type file
 * @dir img/system/
 * @default RegionFX_Snow
 *
 * @param Lake Texture
 * @type file
 * @dir img/system/
 * @default RegionFX_Water
 *
 * @param Waterfall Texture
 * @type file
 * @dir img/system/
 * @default RegionFX_Waterfall
 *
 * @param Debug Logs
 * @type boolean
 * @default false
 */

var RegionFX = window.RegionFX || {};
window.RegionFX = RegionFX;

(function() {
  'use strict';

  // --- robust pluginName detection (works if file is renamed)
  var pluginName = (function(){
    var src = document.currentScript && document.currentScript.src || '';
    var m = src.match(/plugins\/([^\/]+)\.js$/i);
    return m ? decodeURIComponent(m[1]) : 'Noq_RegionFX';
  })();
  var params = PluginManager.parameters(pluginName);

  // ---------- utils ----------
  function csvToIds(s){ s=String(s||''); if(!s.trim()) return []; return s.split(/[,\s]+/).map(function(n){return Number(n)||0;}).filter(function(n){return n>0;}); }
  function bool(v,d){ if(v===undefined) return !!d; return String(v).toLowerCase()==='true'; }
  function num(v,d){ v=Number(v); return isNaN(v)?d:v; }
  function log(){ if(CFG.debug) console.log.apply(console, ['[RegionFX]'].concat([].slice.call(arguments))); }

  var CFG = {
    puddleRegions: csvToIds(params['Puddle Regions']),
    snowRegions: csvToIds(params['Snow Regions']),
    waterfallRegions: csvToIds(params['Waterfall Regions']),
    lakeRegions: csvToIds(params['Lake Regions']),
    useDefaultWeather: bool(params['Use Default MV Weather'], true),
    lakesAlwaysOn: bool(params['Lakes Always On'], true),
    waterfallsAlwaysOn: bool(params['Waterfalls Always On'], true),
    densPuddle: num(params['Puddle Density'], 1.00),
    densSnow: num(params['Snow Density'], 0.30),
    densLake: num(params['Lake Density'], 1.00),
    densWaterfall: num(params['Waterfall Density'], 0.60),
    maxPuddles: num(params['Max Puddles'], 200),
    maxSnow: num(params['Max Snow'], 140),
    maxLakes: num(params['Max Lakes'], 500),
    maxWaterfalls: num(params['Max Waterfalls'], 60),
    overPuddles: bool(params['Draw Puddles Over Characters'], false),
    overSnow: bool(params['Draw Snow Over Characters'], false),
    overLakes: bool(params['Draw Lakes Over Characters'], false),
    overWaterfalls: bool(params['Draw Waterfalls Over Characters'], true),
    texPuddle: String(params['Puddle Texture']||'RegionFX_Puddle'),
    texSnow: String(params['Snow Texture']||'RegionFX_Snow'),
    texLake: String(params['Lake Texture']||'RegionFX_Water'),
    texWaterfall: String(params['Waterfall Texture']||'RegionFX_Waterfall'),
    debug: bool(params['Debug Logs'], false)
  };

  // ---------- public state ----------
  RegionFX.enabled = true;
  RegionFX._weatherType = 'none';
  RegionFX._weatherPower = 0;
  RegionFX._lastWeatherHash = '';
  RegionFX._needBuild = false;
  RegionFX._active = { puddles:[], snows:[], lakes:[], falls:[] };
  RegionFX._containers = { under:null, over:null };
  RegionFX._regionTiles = { puddle:[], snow:[], lake:[], fall:[] };

  // ---------- placeholders & bitmaps ----------
  function makePuddleBitmap(){ var w=44,h=22,bm=new Bitmap(w,h); bm.fillAll('rgba(0,0,0,0)'); bm.gradientFillRect(0,0,w,h,'rgba(80,140,200,0.25)','rgba(120,200,255,0.10)',true); bm.gradientFillRect(4,4,w-8,h-8,'rgba(120,200,255,0.10)','rgba(20,60,120,0.00)',true); return bm; }
  function makeSnowBitmap(){ var s=32,bm=new Bitmap(s,s); bm.fillAll('rgba(255,255,255,0)'); bm.gradientFillRect(0,0,s,s,'rgba(255,255,255,0.85)','rgba(255,255,255,0.35)',true); return bm; }
  function makeLakeBitmap(){ var w=48,h=48,bm=new Bitmap(w,h); bm.fillAll('#2a6fb8'); bm.gradientFillRect(0,0,w,h,'rgba(0,80,160,0.9)','rgba(0,120,220,0.9)',false); return bm; }
  function makeWaterfallBitmap(){ var w=48,h=96,bm=new Bitmap(w,h); bm.fillAll('rgba(0,0,0,0)'); for(var y=0;y<h;y+=4) bm.fillRect(0,y,w,2,'rgba(120,200,255,0.55)'); return bm; }
  function loadSystemBitmap(name, fb){ var bmp = ImageManager.loadSystem(name); bmp.addErrorListener && bmp.addErrorListener(function(){ var alt = fb&&fb(); if(alt) Object.assign(bmp, alt); }); return bmp; }

  RegionFX._bm = {
    puddle: loadSystemBitmap(CFG.texPuddle, makePuddleBitmap),
    snow:   loadSystemBitmap(CFG.texSnow,   makeSnowBitmap),
    lake:   loadSystemBitmap(CFG.texLake,   makeLakeBitmap),
    fall:   loadSystemBitmap(CFG.texWaterfall, makeWaterfallBitmap)
  };

  // ---------- weather ----------
  RegionFX.getWeatherInfo = function(){
    var type=this._weatherType, power=this._weatherPower;
    if (CFG.useDefaultWeather && $gameScreen){
      var t=$gameScreen._weatherType, p=$gameScreen._weatherPower||0;
      if (t){ type=t; power=p; }
    }
    return {type:type||'none', power:power|0};
  };

  RegionFX.onWeatherChanged = function(type, power){
    this._weatherType = type || 'none';
    this._weatherPower = power|0;
    this._lastWeatherHash = '';
    if (!CFG.useDefaultWeather && $gameScreen) $gameScreen.changeWeather('none',0,0);
    this._applyWeatherVisibility();
    log('WeatherChanged →', this._weatherType, this._weatherPower);
  };

  RegionFX._tryHookWeather = function(){
    if (this._hooked) return;
    if (window.WeatherSystem && !WeatherSystem._regionFxPatched){
      var _set = WeatherSystem.setWeather;
      WeatherSystem.setWeather = function(type, power){
        var r = _set ? _set.apply(this, arguments) : undefined;
        if (window.RegionFX) RegionFX.onWeatherChanged(type, power);
        return r;
      };
      WeatherSystem._regionFxPatched = true;
      this._hooked = true;
      log('Hooked WeatherSystem.setWeather');
    }
  };

  // ---------- scene/spriteset ----------
  RegionFX._ensureContainers = function () {
    var sc = SceneManager._scene, spr = sc && sc._spriteset;
    if (!spr || !spr._tilemap || !spr._baseSprite) return false;

    // UNDER: child of tilemap, placed just below characters
    if (!spr._regionFxUnder){
      spr._regionFxUnder = new Sprite();
      var idx = spr._tilemap.children.indexOf(spr._characters);
      if (idx < 0) idx = spr._tilemap.children.length;
      spr._tilemap.addChildAt(spr._regionFxUnder, idx);
    }

    // OVER: child of baseSprite (screen-space), we manually offset each frame
    if (!spr._regionFxOver){
      spr._regionFxOver = new Sprite();
      spr._baseSprite.addChild(spr._regionFxOver);
    }

    this._containers.under = spr._regionFxUnder;
    this._containers.over  = spr._regionFxOver;
    return true;
  };

  // keep the OVER layer locked to map tiles by countering tilemap origin
  RegionFX._syncOverLayer = function(){
    var sc = SceneManager._scene, spr = sc && sc._spriteset;
    if (!spr || !spr._tilemap || !this._containers.over) return;
    var tm = spr._tilemap, over = this._containers.over;
    over.x = -Math.round(tm.origin.x);
    over.y = -Math.round(tm.origin.y);
  };

  var _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
  Spriteset_Map.prototype.createLowerLayer = function(){
    _Spriteset_Map_createLowerLayer.call(this);
    if (RegionFX._ensureContainers()) RegionFX.refreshForCurrentMap();
  };

  var _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function(){
    _Scene_Map_start.call(this);
    RegionFX._tryHookWeather();
    RegionFX._ensureContainers();
    RegionFX.refreshForCurrentMap();
  };

  var _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function(){
    _Scene_Map_update.call(this);
    RegionFX._tryHookWeather();
    RegionFX._ensureContainers();
    if (RegionFX.enabled) RegionFX.update();
  };

  // ---------- plugin commands ----------
  var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(command, args){
    _Game_Interpreter_pluginCommand.call(this, command, args);
    if ((command||'').toLowerCase()==='regionfx'){
      var sub = (args[0]||'').toLowerCase();
      if (sub==='refresh') RegionFX.refreshForCurrentMap();
      else if (sub==='enable') RegionFX.enabled = true;
      else if (sub==='disable') RegionFX.enabled = false;
      else if (sub==='force') RegionFX.onWeatherChanged(String(args[1]||'none'), Number(args[2]||0)|0);
      else if (sub==='debug') CFG.debug = /on|true|1/i.test(args[1]||'');
    }
  };

  // ---------- build/scan ----------
  RegionFX._mapDisabled = function(){ var n=$dataMap&&$dataMap.note?String($dataMap.note):''; return /<NoRegionFX>/i.test(n); };
  RegionFX._underOnly  = function(){ var n=$dataMap&&$dataMap.note?String($dataMap.note):''; return /<RegionFX:UnderOnly>/i.test(n); };

  RegionFX._clearVisuals = function(){
    if (this._containers.under) this._containers.under.removeChildren();
    if (this._containers.over)  this._containers.over.removeChildren();
    this._active.puddles.length = this._active.snows.length = this._active.lakes.length = this._active.falls.length = 0;
  };
  RegionFX._resetTiles = function(){
    this._regionTiles.puddle.length = this._regionTiles.snow.length = this._regionTiles.lake.length = this._regionTiles.fall.length = 0;
  };

  RegionFX.refreshForCurrentMap = function(){
    if (!$gameMap || !$gameMap.mapId()) return;
    this._resetTiles();
    if (this._mapDisabled()) { this._clearVisuals(); return; }
    this._scanRegions();
    this._needBuild = true;
    if (this._ensureContainers()){ this._buildNow(); this._needBuild=false; }
    log('Built RegionFX on map', $gameMap.mapId(), this._summary());
  };

  RegionFX._buildNow = function(){
    this._clearVisuals();
    this._rebuildSprites();
    this._applyWeatherVisibility(true);
  };

  RegionFX._scanRegions = function(){
    var w=$gameMap.width(), h=$gameMap.height(), x,y,id;
    var pr=CFG.puddleRegions, sr=CFG.snowRegions, lr=CFG.lakeRegions, fr=CFG.waterfallRegions;
    for (y=0;y<h;y++) for (x=0;x<w;x++){
      id = $gameMap.regionId(x,y);
      if (id>0){
        if (pr.indexOf(id)>=0) this._regionTiles.puddle.push({x:x,y:y});
        if (sr.indexOf(id)>=0) this._regionTiles.snow.push({x:x,y:y});
        if (lr.indexOf(id)>=0) this._regionTiles.lake.push({x:x,y:y});
        if (fr.indexOf(id)>=0) this._regionTiles.fall.push({x:x,y:y});
      }
    }
  };

  RegionFX._pickSome = function(list, density, max){
    var out=[], rng=Math.random;
    for (var i=0;i<list.length;i++) if (rng()<density) out.push(list[i]);
    if (out.length>max) out.length = max;
    return out;
  };

  // Only place a waterfall if the tile BELOW is a lake region and the tile ABOVE is not
  RegionFX._looksLikeDrop = function(x,y){
    var below = $gameMap.regionId(x, y+1);
    var above = $gameMap.regionId(x, y-1);
    function isLake(id){ return CFG.lakeRegions.indexOf(id) >= 0; }
    return isLake(below) && !isLake(above);
  };

  // ---------- spawn/animate ----------
  function fallbackBitmapFor(kind){
    if (kind==='puddle') return makePuddleBitmap();
    if (kind==='snow')   return makeSnowBitmap();
    if (kind==='lake')   return makeLakeBitmap();
    return makeWaterfallBitmap();
  }

  RegionFX._makeSprite = function(kind){
    var s = new Sprite(); s._kind = kind;
    s.bitmap = (kind==='puddle')?this._bm.puddle:(kind==='snow')?this._bm.snow:(kind==='lake')?this._bm.lake:this._bm.fall;
    // if texture missing & no error listener, guard with fallback
    if (!s.bitmap || !s.bitmap.width) s.bitmap = fallbackBitmapFor(kind);
    s.anchor.x = 0.5; s.anchor.y = 0.5; s.alpha = 0;
    s._t = Math.random()*Math.PI*2; s._speed = 0.01+Math.random()*0.02;
    s._baseScale = 0.9 + Math.random()*0.3; s.scale.x = s.scale.y = s._baseScale;
    if (kind==='puddle') s.blendMode = PIXI.BLEND_MODES.SCREEN;
    if (kind==='lake')   s.blendMode = PIXI.BLEND_MODES.NORMAL;
    if (kind==='fall')   s.blendMode = PIXI.BLEND_MODES.SCREEN;
    return s;
  };

  RegionFX._spawnAt = function(kind, tx, ty, toOver){
    var s=this._makeSprite(kind), tw=$gameMap.tileWidth(), th=$gameMap.tileHeight();
    s.x = tx*tw + tw/2; s.y = ty*th + th/2;
    if (kind==='fall'){ s.scale.x*=1.0; s.scale.y*=2.0; }
    var underOnly = this._underOnly();
    var parent = (toOver && !underOnly) ? this._containers.over : this._containers.under;
    parent.addChild(s);
    (kind==='puddle'?this._active.puddles:(kind==='snow'?this._active.snows:(kind==='lake'?this._active.lakes:this._active.falls))).push(s);
  };

  RegionFX._rebuildSprites = function(){
    var puddleTiles = this._pickSome(this._regionTiles.puddle, CFG.densPuddle, CFG.maxPuddles);
    for (var i=0;i<puddleTiles.length;i++) this._spawnAt('puddle', puddleTiles[i].x, puddleTiles[i].y, CFG.overPuddles);

    var snowTiles = this._pickSome(this._regionTiles.snow, CFG.densSnow, CFG.maxSnow);
    for (var j=0;j<snowTiles.length;j++) this._spawnAt('snow', snowTiles[j].x, snowTiles[j].y, CFG.overSnow);

    if (CFG.lakesAlwaysOn || CFG.densLake>0){
      var lakeTiles = this._pickSome(this._regionTiles.lake, CFG.densLake, CFG.maxLakes);
      for (var k=0;k<lakeTiles.length;k++) this._spawnAt('lake', lakeTiles[k].x, lakeTiles[k].y, CFG.overLakes);
    }

    if (CFG.waterfallsAlwaysOn || CFG.densWaterfall>0){
      var raw = this._pickSome(this._regionTiles.fall, CFG.densWaterfall, CFG.maxWaterfalls);
      var fallTiles = []; for (var m=0;m<raw.length;m++) if (this._looksLikeDrop(raw[m].x, raw[m].y)) fallTiles.push(raw[m]);
      for (var n=0;n<fallTiles.length;n++) this._spawnAt('fall', fallTiles[n].x, fallTiles[n].y, CFG.overWaterfalls);
    }
  };

  RegionFX._applyWeatherVisibility = function(initial){
    var wi=this.getWeatherInfo(), type=wi.type, pow=wi.power|0;
    var puddleTarget = (type==='rain'||type==='storm') ? Math.min(0.85, 0.25 + pow*0.08) : 0.0;
    var snowTarget   = (type==='snow') ? Math.min(0.95, 0.30 + pow*0.07) : 0.0;

    for (var i=0;i<this._active.puddles.length;i++){ var s=this._active.puddles[i]; s._targetAlpha=puddleTarget; if(initial) s.alpha=s._targetAlpha; }
    for (var j=0;j<this._active.snows.length;j++){ var s2=this._active.snows[j]; s2._targetAlpha=snowTarget; if(initial) s2.alpha=s2._targetAlpha; }
    for (var k=0;k<this._active.lakes.length;k++){ var lk=this._active.lakes[k]; lk._targetAlpha=0.95; if(initial) lk.alpha=lk._targetAlpha; }
    var fallAlpha = (CFG.waterfallsAlwaysOn || type!=='none') ? 0.90 : 0.0;
    for (var m=0;m<this._active.falls.length;m++){ var f=this._active.falls[m]; f._targetAlpha=fallAlpha; if(initial) f.alpha=f._targetAlpha; }
  };

  RegionFX._summary = function(){
    return {
      puddleTiles:this._regionTiles.puddle.length,
      snowTiles:this._regionTiles.snow.length,
      lakeTiles:this._regionTiles.lake.length,
      fallTiles:this._regionTiles.fall.length,
      spawned:{ puddles:this._active.puddles.length, snows:this._active.snows.length, lakes:this._active.lakes.length, falls:this._active.falls.length }
    };
  };

  RegionFX.update = function(){
    if (!this.enabled) return;

    // build if we scanned before containers existed
    if (this._needBuild && this._ensureContainers()){ this._buildNow(); this._needBuild=false; }

    // lock over-layer to map scroll
    this._syncOverLayer();

    // react to weather changes
    var wi=this.getWeatherInfo(), h=wi.type+':'+wi.power;
    if (h!==this._lastWeatherHash){ this._lastWeatherHash=h; this._applyWeatherVisibility(false); }

    // animate
    var i,s;
    for (i=0;i<this._active.puddles.length;i++){ s=this._active.puddles[i]; s._t+=s._speed; s.scale.x=s._baseScale*(1.00+Math.sin(s._t)*0.02); s.scale.y=s._baseScale*(1.00+Math.cos(s._t)*0.02); s.alpha += (s._targetAlpha - s.alpha)*0.05; }
    for (i=0;i<this._active.snows.length;i++){ s=this._active.snows[i]; s._t+=s._speed*0.5; s.alpha += (s._targetAlpha - s.alpha)*0.05; s.y += Math.sin(s._t)*0.1; }
    for (i=0;i<this._active.lakes.length;i++){ s=this._active.lakes[i]; s._t+=0.02; s.alpha += (s._targetAlpha - s.alpha)*0.04; s.x += Math.sin(s._t + i*0.1)*0.05; }
    for (i=0;i<this._active.falls.length;i++){ s=this._active.falls[i]; s._t+=0.25 + (this._weatherType==='storm'?0.35:0.15); s.alpha += (s._targetAlpha - s.alpha)*0.06; s.y += Math.sin(s._t + i*0.2)*0.1; }
  };

})();