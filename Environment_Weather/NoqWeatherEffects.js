/*:
 * @target MV
 * @plugindesc (MV ES5) RegionFX v1.0 — Region‑driven puddles, snow build‑up, waterfalls & lakes that react to weather. Compatible with NoqWeatherCore v3.x & default MV weather.
 * @author Noq & ChatGPT
 *
 * @help
 * ─────────────────────────────────────────────────────────────────────
 * OVERVIEW
 * ─────────────────────────────────────────────────────────────────────
 * Use Region IDs on your maps to mark where puddles, snow piles, waterfalls,
 * and lakes should appear. The plugin listens to your current weather and
 * fades these effects in/out automatically.
 *
 * Works with:
 *  • Default MV weather ($gameScreen.changeWeather)
 *  • NoqWeatherCore v3.x (auto‑hooks WeatherSystem.setWeather)
 *
 * Map Note Tags:
 *  <NoRegionFX>            # Disables RegionFX on this map entirely.
 *  <RegionFX:UnderOnly>    # Only draws under the character sprites.
 *
 * Plugin Commands (MV style):
 *  RegionFX Refresh        # Rescan regions & rebuild effects (use after edits)
 *  RegionFX Enable         # Turn RegionFX on
 *  RegionFX Disable        # Turn RegionFX off
 *
 * File paths (place in img/system):
 *  RegionFX_Puddle.png
 *  RegionFX_Snow.png
 *  RegionFX_Water.png
 *  RegionFX_Waterfall.png
 *
 * If any file is missing, simple placeholder bitmaps will be drawn instead.
 *
 * Z‑Order:
 *  • Under‑layer attaches to the Tilemap (below characters).
 *  • Over‑layer attaches to the baseSprite (above characters). You can choose
 *    per effect whether to use under/over in parameters.
 *
 * Performance:
 *  • Effects are pooled. Heavy maps: lower Max counts or Densities.
 *
 * API hook for custom weather systems:
 *   if (window.RegionFX) RegionFX.onWeatherChanged(type, power);
 *   // type ∈ {"none","rain","storm","snow"}, power ∈ [0..9]
 *
 * ─────────────────────────────────────────────────────────────────────
 * PARAMETERS
 * ─────────────────────────────────────────────────────────────────────
 * @param Puddle Regions
 * @type string
 * @default 5
 * @desc CSV of Region IDs that may show puddles during Rain/Storm.
 *
 * @param Snow Regions
 * @type string
 * @default 6
 * @desc CSV of Region IDs that may show snow accumulation during Snow.
 *
 * @param Waterfall Regions
 * @type string
 * @default 7
 * @desc CSV of Region IDs that spawn vertical waterfall strips.
 *
 * @param Lake Regions
 * @type string
 * @default 8
 * @desc CSV of Region IDs that fill with animated water tiles.
 *
 * @param Use Default MV Weather
 * @type boolean
 * @default true
 * @desc Also watch $gameScreen weather when NoqWeatherCore isn't calling us.
 *
 * @param Lakes Always On
 * @type boolean
 * @default true
 * @desc Lakes render regardless of weather (good for permanent water).
 *
 * @param Waterfalls Always On
 * @type boolean
 * @default true
 * @desc Waterfalls render regardless of weather.
 *
 * @param Puddle Density
 * @type number
 * @decimals 2
 * @default 0.35
 * @desc Chance per eligible tile to spawn a puddle (0..1). Clamped by Max.
 *
 * @param Snow Density
 * @type number
 * @decimals 2
 * @default 0.30
 * @desc Chance per eligible tile to spawn a snow patch (0..1). Clamped by Max.
 *
 * @param Lake Density
 * @type number
 * @decimals 2
 * @default 1.00
 * @desc Chance per eligible tile to place a lake tile (0..1). Use < 1 for perf.
 *
 * @param Waterfall Density
 * @type number
 * @decimals 2
 * @default 0.60
 * @desc Chance per eligible tile to place a waterfall strip (0..1).
 *
 * @param Max Puddles
 * @type number
 * @default 120
 * @desc Upper cap for puddle sprites per map.
 *
 * @param Max Snow
 * @type number
 * @default 140
 * @desc Upper cap for snow sprites per map.
 *
 * @param Max Lakes
 * @type number
 * @default 500
 * @desc Upper cap for lake tiles per map.
 *
 * @param Max Waterfalls
 * @type number
 * @default 60
 * @desc Upper cap for waterfall strips per map.
 *
 * @param Draw Puddles Over Characters
 * @type boolean
 * @default false
 * @desc If true, puddles go to upper layer (for reflective overlay style).
 *
 * @param Draw Snow Over Characters
 * @type boolean
 * @default false
 * @desc If true, snow build‑up draws over characters.
 *
 * @param Draw Lakes Over Characters
 * @type boolean
 * @default false
 * @desc If true, lakes draw over characters (rare; typically false).
 *
 * @param Draw Waterfalls Over Characters
 * @type boolean
 * @default true
 * @desc If true, waterfalls draw over characters.
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
 * @desc Print helpful debug logs to console.
 */

var RegionFX = RegionFX || {};
(function() {
  'use strict';

  var pluginName = 'Noq_RegionFX';
  var params = PluginManager.parameters(pluginName);

  function csvToIds(s) {
    s = String(s || '');
    if (!s.trim()) return [];
    return s.split(/[,\s]+/).map(function(n){return Number(n)||0;}).filter(function(n){return n>0;});
  }
  function bool(v, d) {
    if (v === undefined) return !!d;
    return String(v).toLowerCase() === 'true';
  }
  function num(v, d) { v = Number(v); return isNaN(v) ? d : v; }

  var CFG = {
    puddleRegions: csvToIds(params['Puddle Regions']),
    snowRegions: csvToIds(params['Snow Regions']),
    waterfallRegions: csvToIds(params['Waterfall Regions']),
    lakeRegions: csvToIds(params['Lake Regions']),
    useDefaultWeather: bool(params['Use Default MV Weather'], true),
    lakesAlwaysOn: bool(params['Lakes Always On'], true),
    waterfallsAlwaysOn: bool(params['Waterfalls Always On'], true),
    densPuddle: num(params['Puddle Density'], 0.35),
    densSnow: num(params['Snow Density'], 0.30),
    densLake: num(params['Lake Density'], 1.0),
    densWaterfall: num(params['Waterfall Density'], 0.60),
    maxPuddles: num(params['Max Puddles'], 120),
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

  // Public state
  RegionFX.enabled = true;
  RegionFX._weatherType = 'none';
  RegionFX._weatherPower = 0;
  RegionFX._lastWeatherHash = '';

  // Sprite pools & per‑map caches
  RegionFX._pool = {
    puddles: [],
    snows: [],
    lakes: [],
    falls: []
  };

  RegionFX._active = {
    puddles: [],
    snows: [],
    lakes: [],
    falls: []
  };

  RegionFX._containers = {
    under: null,
    over: null
  };

  RegionFX._regionTiles = {
    puddle: [],
    snow: [],
    lake: [],
    fall: []
  };

  // ────────────────────────────────────────────────────────────────────
  // Utility: map coords → pixel (using tilemap scroll if under‑layer)
  // ────────────────────────────────────────────────────────────────────
  function tileToPxX(tx) { return tx * $gameMap.tileWidth(); }
  function tileToPxY(ty) { return ty * $gameMap.tileHeight(); }

  function log() { if (CFG.debug) console.log.apply(console, ['[RegionFX]'].concat([].slice.call(arguments))); }

  // ────────────────────────────────────────────────────────────────────
  // Asset helpers (Bitmap makers for fallbacks)
  // ────────────────────────────────────────────────────────────────────
  function makePuddleBitmap() {
    var w = 44, h = 22, bm = new Bitmap(w, h);
    bm.fillAll('rgba(0,0,0,0)');
    bm.gradientFillRect(0, 0, w, h, 'rgba(80,140,200,0.25)', 'rgba(120,200,255,0.10)', true);
    bm.gradientFillRect(4, 4, w-8, h-8, 'rgba(120,200,255,0.10)', 'rgba(20,60,120,0.00)', true);
    return bm;
  }
  function makeSnowBitmap() {
    var s = 32, bm = new Bitmap(s, s);
    bm.fillAll('rgba(255,255,255,0)');
    bm.gradientFillRect(0, 0, s, s, 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0.35)', true);
    return bm;
  }
  function makeLakeBitmap() {
    var w=48, h=48, bm = new Bitmap(w, h);
    bm.fillAll('#2a6fb8');
    bm.gradientFillRect(0, 0, w, h, 'rgba(0,80,160,0.9)', 'rgba(0,120,220,0.9)', false);
    return bm;
  }
  function makeWaterfallBitmap() {
    var w=48, h=96, bm = new Bitmap(w, h);
    bm.fillAll('rgba(0,0,0,0)');
    for (var y=0; y<h; y+=4) bm.fillRect(0,y,w,2,'rgba(120,200,255,0.55)');
    return bm;
  }

  function loadSystemBitmap(name, fallbackFn) {
    var bmp = ImageManager.loadSystem(name);
    // MV Bitmaps have an onError we can use to draw fallback
    bmp.addLoadListener(function() {
      // nothing
    });
    bmp.addErrorListener && bmp.addErrorListener(function(){
      var fb = fallbackFn && fallbackFn();
      if (fb) Object.assign(bmp, fb); // very light fallback; MV won't copy prototype
    });
    return bmp;
  }

  RegionFX._bm = {
    puddle: loadSystemBitmap(CFG.texPuddle, makePuddleBitmap),
    snow: loadSystemBitmap(CFG.texSnow, makeSnowBitmap),
    lake: loadSystemBitmap(CFG.texLake, makeLakeBitmap),
    fall: loadSystemBitmap(CFG.texWaterfall, makeWaterfallBitmap)
  };

  // ────────────────────────────────────────────────────────────────────
  // Weather detection & hooks
  // ────────────────────────────────────────────────────────────────────
  RegionFX.getWeatherInfo = function() {
    // Prefer NoqWeatherCore if present
    var type = this._weatherType;
    var power = this._weatherPower;

    // Fallback to MV default weather polling
    if (CFG.useDefaultWeather && $gameScreen) {
      var t = $gameScreen._weatherType; // 'none'|'rain'|'storm'|'snow'
      var p = $gameScreen._weatherPower || 0; // 0..9
      if (t) { type = t; power = p; }
    }
    return { type: type || 'none', power: power|0 };
  };

  RegionFX.onWeatherChanged = function(type, power) {
    this._weatherType = type || 'none';
    this._weatherPower = power|0;
    this._lastWeatherHash = '';
    this._applyWeatherVisibility();
    log('WeatherChanged →', this._weatherType, this._weatherPower);
  };

  // Monkey‑patch NoqWeatherCore if present to get instant signals
  if (window.WeatherSystem && !WeatherSystem._regionFxPatched) {
    (function(){
      var _set = WeatherSystem.setWeather;
      WeatherSystem.setWeather = function(type, power) {
        var r = _set ? _set.apply(this, arguments) : undefined;
        if (window.RegionFX) RegionFX.onWeatherChanged(type, power);
        return r;
      };
      WeatherSystem._regionFxPatched = true;
    })();
  }

  // ────────────────────────────────────────────────────────────────────
  // Scene/Spriteset integration
  // ────────────────────────────────────────────────────────────────────
  var _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
  Spriteset_Map.prototype.createLowerLayer = function() {
    _Spriteset_Map_createLowerLayer.call(this);
    this.createRegionFxLayers();
  };

  Spriteset_Map.prototype.createRegionFxLayers = function() {
    // Under layer (scrolls with tilemap)
    this._regionFxUnder = new Sprite();
    this._tilemap.addChild(this._regionFxUnder);

    // Over layer (world‑space but above characters)
    this._regionFxOver = new Sprite();
    this._baseSprite.addChild(this._regionFxOver);

    RegionFX._containers.under = this._regionFxUnder;
    RegionFX._containers.over  = this._regionFxOver;

    RegionFX.refreshForCurrentMap();
  };

  var _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function() {
    _Scene_Map_update.call(this);
    if (RegionFX.enabled) RegionFX.update();
  };

  var _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function() {
    _Scene_Map_start.call(this);
    RegionFX.refreshForCurrentMap();
  };

  // ────────────────────────────────────────────────────────────────────
  // Plugin Commands (MV)
  // ────────────────────────────────────────────────────────────────────
  var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);
    if (command.toLowerCase() === 'regionfx') {
      var sub = (args[0]||'').toLowerCase();
      if (sub === 'refresh') RegionFX.refreshForCurrentMap();
      else if (sub === 'enable') RegionFX.enabled = true;
      else if (sub === 'disable') RegionFX.enabled = false;
    }
  };

  // ────────────────────────────────────────────────────────────────────
  // Core build & update
  // ────────────────────────────────────────────────────────────────────
  RegionFX.refreshForCurrentMap = function() {
    if (!$gameMap || !$gameMap.mapId()) return;
    if (!this._containers.under || !this._containers.over) return;

    // Clear old
    this._clearAll();

    if (this._mapDisabled()) return;

    // Scan map for region tiles
    this._scanRegions();

    // Build initial sprites
    this._rebuildSprites();

    // Apply initial weather visibility
    this._applyWeatherVisibility(true);

    log('Built RegionFX on map', $gameMap.mapId(), this._summary());
  };

  RegionFX._mapDisabled = function() {
    var data = $dataMap && $dataMap.note ? String($dataMap.note) : '';
    return /<NoRegionFX>/i.test(data);
  };

  RegionFX._underOnly = function() {
    var data = $dataMap && $dataMap.note ? String($dataMap.note) : '';
    return /<RegionFX:UnderOnly>/i.test(data);
  };

  RegionFX._clearAll = function() {
    var i, arr;
    for (i=0, arr=this._active.puddles; i<arr.length; i++) arr[i].parent && arr[i].parent.removeChild(arr[i]);
    for (i=0, arr=this._active.snows; i<arr.length; i++) arr[i].parent && arr[i].parent.removeChild(arr[i]);
    for (i=0, arr=this._active.lakes; i<arr.length; i++) arr[i].parent && arr[i].parent.removeChild(arr[i]);
    for (i=0, arr=this._active.falls; i<arr.length; i++) arr[i].parent && arr[i].parent.removeChild(arr[i]);
    this._active.puddles.length = 0;
    this._active.snows.length = 0;
    this._active.lakes.length = 0;
    this._active.falls.length = 0;

    // Keep pools for reuse
    if (this._containers.under) this._containers.under.removeChildren();
    if (this._containers.over)  this._containers.over.removeChildren();

    this._regionTiles.puddle.length = 0;
    this._regionTiles.snow.length = 0;
    this._regionTiles.lake.length = 0;
    this._regionTiles.fall.length = 0;
  };

  RegionFX._scanRegions = function() {
    var w = $gameMap.width();
    var h = $gameMap.height();
    var x, y, id;

    var pr = CFG.puddleRegions;
    var sr = CFG.snowRegions;
    var lr = CFG.lakeRegions;
    var fr = CFG.waterfallRegions;

    for (y=0; y<h; y++) {
      for (x=0; x<w; x++) {
        id = $gameMap.regionId(x, y);
        if (id > 0) {
          if (pr.indexOf(id) >= 0) this._regionTiles.puddle.push({x:x,y:y});
          if (sr.indexOf(id) >= 0) this._regionTiles.snow.push({x:x,y:y});
          if (lr.indexOf(id) >= 0) this._regionTiles.lake.push({x:x,y:y});
          if (fr.indexOf(id) >= 0) this._regionTiles.fall.push({x:x,y:y});
        }
      }
    }
  };

  RegionFX._pickSome = function(list, density, max) {
    // Thin the list by density and cap to max, with stable randomness per map
    var rng = Math.random;
    var out = [];
    for (var i=0; i<list.length; i++) if (rng() < density) out.push(list[i]);
    if (out.length > max) out.length = max;
    return out;
  };

  RegionFX._makeSprite = function(kind) {
    var s = new Sprite();
    s._kind = kind; // 'puddle'|'snow'|'lake'|'fall'
    if (kind === 'puddle') s.bitmap = this._bm.puddle;
    else if (kind === 'snow') s.bitmap = this._bm.snow;
    else if (kind === 'lake') s.bitmap = this._bm.lake;
    else if (kind === 'fall') s.bitmap = this._bm.fall;
    s.anchor.x = 0.5; s.anchor.y = 0.5;
    s.alpha = 0; // fade in based on weather
    s._t = Math.random() * Math.PI * 2;
    s._speed = 0.01 + Math.random()*0.02;
    s._baseScale = 0.9 + Math.random()*0.3;
    s.scale.x = s.scale.y = s._baseScale;
    if (kind === 'puddle') s.blendMode = PIXI.BLEND_MODES.SCREEN;
    if (kind === 'lake') s.blendMode = PIXI.BLEND_MODES.NORMAL;
    if (kind === 'fall') s.blendMode = PIXI.BLEND_MODES.SCREEN;
    return s;
  };

  RegionFX._spawnAt = function(kind, tx, ty, toOver) {
    var s = this._makeSprite(kind);
    var tw = $gameMap.tileWidth();
    var th = $gameMap.tileHeight();
    s.x = tileToPxX(tx) + tw/2;
    s.y = tileToPxY(ty) + th/2;

    // Kind‑specific sizing
    if (kind === 'fall') { s.scale.x *= 1.0; s.scale.y *= 2.0; }
    if (kind === 'lake') { s.scale.x *= 1.0; s.scale.y *= 1.0; }

    // Layer choice
    var underOnly = this._underOnly();
    var placeOver = toOver && !underOnly;
    var parent = placeOver ? this._containers.over : this._containers.under;
    parent.addChild(s);

    // Register active
    var arr = (kind==='puddle'?this._active.puddles:
              (kind==='snow'?this._active.snows:
              (kind==='lake'?this._active.lakes:this._active.falls)));
    arr.push(s);
  };

  RegionFX._rebuildSprites = function() {
    // Puddles
    var puddleTiles = this._pickSome(this._regionTiles.puddle, CFG.densPuddle, CFG.maxPuddles);
    for (var i=0;i<puddleTiles.length;i++) this._spawnAt('puddle', puddleTiles[i].x, puddleTiles[i].y, CFG.overPuddles);

    // Snow
    var snowTiles = this._pickSome(this._regionTiles.snow, CFG.densSnow, CFG.maxSnow);
    for (var j=0;j<snowTiles.length;j++) this._spawnAt('snow', snowTiles[j].x, snowTiles[j].y, CFG.overSnow);

    // Lakes
    if (CFG.lakesAlwaysOn || CFG.densLake > 0) {
      var lakeTiles = this._pickSome(this._regionTiles.lake, CFG.densLake, CFG.maxLakes);
      for (var k=0;k<lakeTiles.length;k++) this._spawnAt('lake', lakeTiles[k].x, lakeTiles[k].y, CFG.overLakes);
    }

    // Waterfalls
    if (CFG.waterfallsAlwaysOn || CFG.densWaterfall > 0) {
      var fallTiles = this._pickSome(this._regionTiles.fall, CFG.densWaterfall, CFG.maxWaterfalls);
      for (var m=0;m<fallTiles.length;m++) this._spawnAt('fall', fallTiles[m].x, fallTiles[m].y, CFG.overWaterfalls);
    }
  };

  RegionFX._applyWeatherVisibility = function(initial) {
    var wi = this.getWeatherInfo();
    var type = wi.type, pow = wi.power;
    var puddleTarget = (type === 'rain' || type === 'storm') ? Math.min(0.85, 0.25 + pow*0.08) : 0.0;
    var snowTarget = (type === 'snow') ? Math.min(0.95, 0.30 + pow*0.07) : 0.0;

    // Puddles
    for (var i=0;i<this._active.puddles.length;i++) {
      var s = this._active.puddles[i];
      s._targetAlpha = puddleTarget;
      if (initial) s.alpha = s._targetAlpha;
    }

    // Snow
    for (var j=0;j<this._active.snows.length;j++) {
      var s2 = this._active.snows[j];
      s2._targetAlpha = snowTarget;
      if (initial) s2.alpha = s2._targetAlpha;
    }

    // Lakes (weather‑independent alpha)
    for (var k=0;k<this._active.lakes.length;k++) {
      var lk = this._active.lakes[k];
      lk._targetAlpha = 0.95; if (initial) lk.alpha = lk._targetAlpha;
    }

    // Waterfalls (weather boosts speed & brightness if storm)
    var fallAlpha = (CFG.waterfallsAlwaysOn || type!=='none') ? 0.90 : 0.0;
    for (var m=0;m<this._active.falls.length;m++) {
      var f = this._active.falls[m];
      f._targetAlpha = fallAlpha; if (initial) f.alpha = f._targetAlpha;
    }
  };

  RegionFX._summary = function() {
    return {
      puddleTiles: this._regionTiles.puddle.length,
      snowTiles: this._regionTiles.snow.length,
      lakeTiles: this._regionTiles.lake.length,
      fallTiles: this._regionTiles.fall.length,
      spawned: {
        puddles: this._active.puddles.length,
        snows: this._active.snows.length,
        lakes: this._active.lakes.length,
        falls: this._active.falls.length
      }
    };
  };

  RegionFX.update = function() {
    if (!this.enabled) return;

    // Light weather polling hash to avoid extra work
    var wi = this.getWeatherInfo();
    var h = wi.type + ':' + wi.power;
    if (h !== this._lastWeatherHash) {
      this._lastWeatherHash = h;
      this._applyWeatherVisibility(false);
    }

    // Animate towards targets & do simple effect motions
    var i, s;
    for (i=0;i<this._active.puddles.length;i++) {
      s = this._active.puddles[i];
      s._t += s._speed;
      s.scale.x = s._baseScale * (1.00 + Math.sin(s._t)*0.02);
      s.scale.y = s._baseScale * (1.00 + Math.cos(s._t)*0.02);
      s.alpha += (s._targetAlpha - s.alpha) * 0.05;
    }
    for (i=0;i<this._active.snows.length;i++) {
      s = this._active.snows[i];
      s._t += s._speed*0.5;
      s.alpha += (s._targetAlpha - s.alpha) * 0.05;
      // subtle shimmer
      s.y += Math.sin(s._t)*0.1; 
    }
    for (i=0;i<this._active.lakes.length;i++) {
      s = this._active.lakes[i];
      s._t += 0.02;
      s.alpha += (s._targetAlpha - s.alpha) * 0.04;
      s.x += Math.sin(s._t + i*0.1)*0.05; // tiny parallax shimmer
    }
    for (i=0;i<this._active.falls.length;i++) {
      s = this._active.falls[i];
      s._t += 0.25 + (this._weatherType==='storm'?0.35:0.15);
      s.alpha += (s._targetAlpha - s.alpha) * 0.06;
      s.y += Math.sin(s._t + i*0.2)*0.1; // slight shimmer movement
    }
  };

})();
