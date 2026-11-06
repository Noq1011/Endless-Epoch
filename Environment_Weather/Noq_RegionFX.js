/*:
 * @target MV
 * @plugindesc (MV ES5) RegionFX v1.5 — Region-driven puddles, snow, waterfalls & lakes with FULL NoqWeatherCore integration + debug mode
 * @author Noq & ChatGPT
 *
 * @help
 * Paint Region IDs where puddles, snow, waterfalls, and lakes should appear.
 * Effects fade in/out with weather. Works with NoqWeatherCore v3.x
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
 *   RegionFX Test            # Force show all effects for testing
 *
 * ---------------------------------------------------------------------
 * PARAMETERS
 * ---------------------------------------------------------------------
 * @param Puddle Regions
 * @type string
 * @default 61
 *
 * @param Snow Regions
 * @type string
 * @default 62
 *
 * @param Waterfall Regions
 * @type string
 * @default 63
 *
 * @param Lake Regions
 * @type string
 * @default 64
 *
 * @param Use Default MV Weather
 * @type boolean
 * @default false
 * @desc Set to FALSE when using NoqWeatherCore
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
 * @default true
 * @desc Enable to see what's happening in console (F8)
 */

var RegionFX = window.RegionFX || {};
window.RegionFX = RegionFX;

(function() {
  'use strict';

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
    useDefaultWeather: bool(params['Use Default MV Weather'], false),
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
    debug: bool(params['Debug Logs'], true)
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
  RegionFX._bitmapsLoaded = false;
  RegionFX._testMode = false;

  log('='.repeat(60));
  log('RegionFX v1.5 Initialized');
  log('Config:', CFG);
  log('='.repeat(60));

  // ---------- placeholders & bitmaps ----------
  function makePuddleBitmap(){ var w=44,h=22,bm=new Bitmap(w,h); bm.fillAll('rgba(0,0,0,0)'); bm.gradientFillRect(0,0,w,h,'rgba(80,140,200,0.25)','rgba(120,200,255,0.10)',true); bm.gradientFillRect(4,4,w-8,h-8,'rgba(120,200,255,0.10)','rgba(20,60,120,0.00)',true); return bm; }
  function makeSnowBitmap(){ var s=32,bm=new Bitmap(s,s); bm.fillAll('rgba(255,255,255,0)'); bm.gradientFillRect(0,0,s,s,'rgba(255,255,255,0.85)','rgba(255,255,255,0.35)',true); return bm; }
  function makeLakeBitmap(){ var w=48,h=48,bm=new Bitmap(w,h); bm.fillAll('#2a6fb8'); bm.gradientFillRect(0,0,w,h,'rgba(0,80,160,0.9)','rgba(0,120,220,0.9)',false); return bm; }
  function makeWaterfallBitmap(){ var w=48,h=96,bm=new Bitmap(w,h); bm.fillAll('rgba(0,0,0,0)'); for(var y=0;y<h;y+=4) bm.fillRect(0,y,w,2,'rgba(120,200,255,0.55)'); return bm; }
  
  function fallbackBitmapFor(kind){
    if (kind==='puddle') return makePuddleBitmap();
    if (kind==='snow')   return makeSnowBitmap();
    if (kind==='lake')   return makeLakeBitmap();
    return makeWaterfallBitmap();
  }

  function loadSystemBitmap(name, fb){ 
    var bmp = ImageManager.loadSystem(name); 
    var fallbackBm = fb && fb();
    var loaded = false;
    
    bmp.addLoadListener(function(){
      if (!loaded) {
        loaded = true;
        log('✓ Loaded texture:', name, bmp.width + 'x' + bmp.height);
      }
    });
    
    if (bmp.addErrorListener) {
      bmp.addErrorListener(function(){ 
        if (fallbackBm && !loaded) {
          log('✗ Failed to load', name, '- using fallback');
          bmp._image = fallbackBm._image;
          bmp._baseTexture = fallbackBm._baseTexture;
          bmp.width = fallbackBm.width;
          bmp.height = fallbackBm.height;
          bmp._loadingState = 'loaded';
          loaded = true;
        }
      });
    }
    
    // Immediate fallback if file doesn't exist
    setTimeout(function(){
      if (!loaded && !bmp.isReady()) {
        if (fallbackBm) {
          log('⚠ Timeout loading', name, '- using fallback immediately');
          bmp._image = fallbackBm._image;
          bmp._baseTexture = fallbackBm._baseTexture;
          bmp.width = fallbackBm.width;
          bmp.height = fallbackBm.height;
          bmp._loadingState = 'loaded';
          loaded = true;
        }
      }
    }, 100);
    
    return bmp; 
  }

  RegionFX._bm = {
    puddle: loadSystemBitmap(CFG.texPuddle, makePuddleBitmap),
    snow:   loadSystemBitmap(CFG.texSnow,   makeSnowBitmap),
    lake:   loadSystemBitmap(CFG.texLake,   makeLakeBitmap),
    fall:   loadSystemBitmap(CFG.texWaterfall, makeWaterfallBitmap)
  };

  // Check if all bitmaps are ready
  RegionFX._checkBitmapsReady = function(){
    if (this._bitmapsLoaded) return true;
    
    var ready = this._bm.puddle.isReady() && this._bm.snow.isReady() && 
                this._bm.lake.isReady() && this._bm.fall.isReady();
    
    if (ready && !this._bitmapsLoaded) {
      this._bitmapsLoaded = true;
      log('✓ All textures ready!');
      log('  Puddle:', this._bm.puddle.width + 'x' + this._bm.puddle.height);
      log('  Snow:', this._bm.snow.width + 'x' + this._bm.snow.height);
      log('  Lake:', this._bm.lake.width + 'x' + this._bm.lake.height);
      log('  Waterfall:', this._bm.fall.width + 'x' + this._bm.fall.height);
    }
    
    return ready;
  };

  // ---------- weather ----------
  RegionFX.getWeatherInfo = function(){
    var type = 'none';
    var power = 0;
    
    // Primary: NoqWeatherCore persistent state
    if ($gameSystem && $gameSystem._persistentWeather) {
      var pw = $gameSystem._persistentWeather;
      
      if (pw.active) {
        if (pw.active.storm || pw.stormActive) {
          type = 'storm';
          power = pw.rainPower || 5;
        } else if (pw.active.rain && pw.rainPower > 0) {
          type = 'rain';
          power = pw.rainPower;
        } else if (pw.active.fog && pw.fogPower > 0) {
          type = 'fog';
          power = pw.fogPower;
        }
      }
    }
    
    // Fallback to internal state (for Force command)
    if (type === 'none' && this._weatherType && this._weatherType !== 'none') {
      type = this._weatherType;
      power = this._weatherPower;
    }
    
    // Last resort: MV default weather (if enabled)
    if (type === 'none' && CFG.useDefaultWeather && $gameScreen) {
      var t = $gameScreen._weatherType;
      var p = $gameScreen._weatherPower || 0;
      if (t && t !== 'none') {
        type = t;
        power = p;
      }
    }
    
    return {type: type, power: power|0};
  };

  RegionFX.onWeatherChanged = function(type, power){
    log('→ Weather changed:', type, power);
    this._weatherType = type || 'none';
    this._weatherPower = power|0;
    this._lastWeatherHash = '';
    
    if (!CFG.useDefaultWeather && $gameScreen) {
      $gameScreen.changeWeather('none',0,0);
    }
    
    this._applyWeatherVisibility();
  };

  RegionFX._tryHookWeather = function(){
    if (this._hooked) return;
    
    // Hook NoqWeatherCore's Scene_Map.changeWeatherType
    if (Scene_Map.prototype.changeWeatherType && !Scene_Map.prototype._regionFxHooked) {
      var _orig = Scene_Map.prototype.changeWeatherType;
      
      Scene_Map.prototype.changeWeatherType = function(config, power) {
        var result = _orig.apply(this, arguments);
        
        // Notify RegionFX
        setTimeout(function(){
          if (RegionFX && $gameSystem && $gameSystem._persistentWeather) {
            var pw = $gameSystem._persistentWeather;
            var type = 'none', pow = 0;
            
            if (pw.active) {
              if (pw.active.storm || pw.stormActive) {
                type = 'storm';
                pow = pw.rainPower || 5;
              } else if (pw.active.rain) {
                type = 'rain';
                pow = pw.rainPower || 0;
              }
            }
            
            log('↻ Weather hook triggered:', type, pow);
            RegionFX.onWeatherChanged(type, pow);
          }
        }, 10);
        
        return result;
      };
      
      Scene_Map.prototype._regionFxHooked = true;
      this._hooked = true;
      log('✓ Hooked into NoqWeatherCore (Scene_Map.changeWeatherType)');
    }
  };

  // ---------- scene/spriteset ----------
  RegionFX._ensureContainers = function () {
    var sc = SceneManager._scene, spr = sc && sc._spriteset;
    if (!spr || !spr._tilemap || !spr._baseSprite) {
      log('⚠ Cannot create containers - scene not ready');
      return false;
    }

    // UNDER: child of tilemap, before characters
    if (!spr._regionFxUnder){
      spr._regionFxUnder = new Sprite();
      spr._regionFxUnder.name = 'RegionFX_Under';
      
      var idx = spr._tilemap.children.indexOf(spr._characters);
      if (idx < 0) idx = spr._tilemap.children.length;
      spr._tilemap.addChildAt(spr._regionFxUnder, idx);
      
      log('✓ Created UNDER container at index', idx);
    }

    // OVER: child of baseSprite (screen-space)
    if (!spr._regionFxOver){
      spr._regionFxOver = new Sprite();
      spr._regionFxOver.name = 'RegionFX_Over';
      spr._baseSprite.addChild(spr._regionFxOver);
      
      log('✓ Created OVER container');
    }

    this._containers.under = spr._regionFxUnder;
    this._containers.over  = spr._regionFxOver;
    return true;
  };

  // Keep ALL effect layers locked to map tiles by countering tilemap origin
  RegionFX._syncContainers = function(){
    var sc = SceneManager._scene, spr = sc && sc._spriteset;
    if (!spr || !spr._tilemap) return;
    
    var tm = spr._tilemap;
    var ox = tm.origin ? tm.origin.x : Math.round($gameMap.displayX() * $gameMap.tileWidth());
    var oy = tm.origin ? tm.origin.y : Math.round($gameMap.displayY() * $gameMap.tileHeight());

    // Both containers need offset because sprites are positioned in WORLD coordinates
    if (this._containers.over) {
        this._containers.over.x = -ox;
        this._containers.over.y = -oy;
    }
    if (this._containers.under) {
        this._containers.under.x = -ox;
        this._containers.under.y = -oy;
    }
  };

  var _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
  Spriteset_Map.prototype.createLowerLayer = function(){
    _Spriteset_Map_createLowerLayer.call(this);
    if (RegionFX._ensureContainers()) {
      log('→ Triggering refresh from createLowerLayer');
      RegionFX.refreshForCurrentMap();
    }
  };

  var _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function(){
    _Scene_Map_start.call(this);
    RegionFX._tryHookWeather();
    RegionFX._ensureContainers();
    log('→ Scene_Map started');
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
      
      if (sub==='refresh') {
        log('→ Plugin Command: Refresh');
        RegionFX.refreshForCurrentMap();
      }
      else if (sub==='enable') {
        log('→ Plugin Command: Enable');
        RegionFX.enabled = true;
      }
      else if (sub==='disable') {
        log('→ Plugin Command: Disable');
        RegionFX.enabled = false;
      }
      else if (sub==='force') {
        var t = String(args[1]||'none');
        var p = Number(args[2]||0)|0;
        log('→ Plugin Command: Force', t, p);
        RegionFX.onWeatherChanged(t, p);
      }
      else if (sub==='debug') {
        CFG.debug = /on|true|1/i.test(args[1]||'');
        log('→ Plugin Command: Debug', CFG.debug ? 'ON' : 'OFF');
      }
      else if (sub==='test') {
        log('→ Plugin Command: TEST MODE');
        RegionFX._testMode = true;
        RegionFX.refreshForCurrentMap();
        setTimeout(function(){
          RegionFX._applyWeatherVisibility(true);
          log('✓ Test mode activated - all effects should be visible');
        }, 100);
      }
    }
  };

  // ---------- build/scan ----------
  RegionFX._mapDisabled = function(){ 
    var n=$dataMap&&$dataMap.note?String($dataMap.note):''; 
    var disabled = /<NoRegionFX>/i.test(n);
    if (disabled) log('⚠ Map has <NoRegionFX> tag');
    return disabled;
  };
  
  RegionFX._underOnly  = function(){ 
    var n=$dataMap&&$dataMap.note?String($dataMap.note):''; 
    return /<RegionFX:UnderOnly>/i.test(n); 
  };

  RegionFX._clearVisuals = function(){
    if (this._containers.under) this._containers.under.removeChildren();
    if (this._containers.over)  this._containers.over.removeChildren();
    this._active.puddles.length = 0;
    this._active.snows.length = 0;
    this._active.lakes.length = 0;
    this._active.falls.length = 0;
    log('✓ Cleared all visuals');
  };
  
  RegionFX._resetTiles = function(){
    this._regionTiles.puddle.length = 0;
    this._regionTiles.snow.length = 0;
    this._regionTiles.lake.length = 0;
    this._regionTiles.fall.length = 0;
  };

  RegionFX.refreshForCurrentMap = function(){
    if (!$gameMap || !$gameMap.mapId()) {
      log('⚠ No map loaded');
      return;
    }
    
    log('='.repeat(60));
    log('REFRESH for Map', $gameMap.mapId());
    log('='.repeat(60));
    
    this._resetTiles();
    
    if (this._mapDisabled()) { 
      this._clearVisuals(); 
      return; 
    }
    
    this._scanRegions();
    log('→ Scanned regions:', this._regionTiles.puddle.length, 'puddles,',
        this._regionTiles.snow.length, 'snow,',
        this._regionTiles.lake.length, 'lakes,',
        this._regionTiles.fall.length, 'waterfalls');
    
    this._needBuild = true;
    
    if (this._ensureContainers() && this._checkBitmapsReady()){ 
      log('→ Building now...');
      this._buildNow(); 
      this._needBuild=false; 
    } else {
      log('⚠ Waiting for containers or bitmaps...');
    }
    
    log('='.repeat(60));
  };

  RegionFX._buildNow = function(){
    log('→ Building sprites...');
    this._clearVisuals();
    this._rebuildSprites();
    this._applyWeatherVisibility(true);
    log('✓ Build complete:', this._summary());
  };

  RegionFX._scanRegions = function(){
    var w=$gameMap.width(), h=$gameMap.height(), x,y,id;
    var pr=CFG.puddleRegions, sr=CFG.snowRegions, lr=CFG.lakeRegions, fr=CFG.waterfallRegions;
    
    log('→ Scanning', w + 'x' + h, 'map for regions:', 
        'puddles=', pr, 'snow=', sr, 'lakes=', lr, 'waterfalls=', fr);
    
    for (y=0;y<h;y++) {
      for (x=0;x<w;x++){
        id = $gameMap.regionId(x,y);
        if (id>0){
          if (pr.indexOf(id)>=0) this._regionTiles.puddle.push({x:x,y:y});
          if (sr.indexOf(id)>=0) this._regionTiles.snow.push({x:x,y:y});
          if (lr.indexOf(id)>=0) this._regionTiles.lake.push({x:x,y:y});
          if (fr.indexOf(id)>=0) this._regionTiles.fall.push({x:x,y:y});
        }
      }
    }
  };

  RegionFX._pickSome = function(list, density, max){
    var out=[], rng=Math.random;
    for (var i=0;i<list.length;i++) if (rng()<density) out.push(list[i]);
    if (out.length>max) out.length = max;
    return out;
  };

  RegionFX._looksLikeDrop = function(x,y){
    var below = $gameMap.regionId(x, y+1);
    var above = $gameMap.regionId(x, y-1);
    function isLake(id){ return CFG.lakeRegions.indexOf(id) >= 0; }
    return isLake(below) && !isLake(above);
  };

  // ---------- spawn/animate ----------
  RegionFX._calculateScale = function(kind, bitmap){
    if (!$gameMap || !bitmap || !bitmap.width || !bitmap.height) return {x:1, y:1};
    
    var tw = $gameMap.tileWidth();
    var th = $gameMap.tileHeight();
    var bw = bitmap.width;
    var bh = bitmap.height;
    
    var scaleX, scaleY;
    
    if (kind === 'puddle') {
      scaleX = (tw * 0.9) / bw;
      scaleY = (th * 0.5) / bh;
    } else if (kind === 'snow') {
      scaleX = (tw * 0.7) / bw;
      scaleY = (th * 0.7) / bh;
    } else if (kind === 'lake') {
      scaleX = tw / bw;
      scaleY = th / bh;
    } else if (kind === 'fall') {
      scaleX = tw / bw;
      scaleY = (th * 2.0) / bh;
    } else {
      scaleX = tw / bw;
      scaleY = th / bh;
    }
    
    return {x: scaleX, y: scaleY};
  };

  RegionFX._makeSprite = function(kind){
    var s = new Sprite(); 
    s._kind = kind;
    s.bitmap = (kind==='puddle')?this._bm.puddle:(kind==='snow')?this._bm.snow:(kind==='lake')?this._bm.lake:this._bm.fall;
    
    if (!s.bitmap || !s.bitmap.width) {
      s.bitmap = fallbackBitmapFor(kind);
      log('⚠ Using fallback for', kind);
    }
    
    s.anchor.x = 0.5; 
    s.anchor.y = 0.5; 
    s.alpha = 0;
    s._t = Math.random()*Math.PI*2; 
    s._speed = 0.01+Math.random()*0.02;
    
    var baseScale = this._calculateScale(kind, s.bitmap);
    s._baseScaleX = baseScale.x * (0.9 + Math.random()*0.3);
    s._baseScaleY = baseScale.y * (0.9 + Math.random()*0.3);
    s.scale.x = s._baseScaleX;
    s.scale.y = s._baseScaleY;
    
    if (kind==='puddle') s.blendMode = PIXI.BLEND_MODES.NORMAL; // <-- Changed to NORMAL
    if (kind==='lake')   s.blendMode = PIXI.BLEND_MODES.NORMAL;
    if (kind==='fall')   s.blendMode = PIXI.BLEND_MODES.SCREEN;
    
    return s;
  };

  RegionFX._spawnAt = function(kind, tx, ty, toOver){
    var s=this._makeSprite(kind), tw=$gameMap.tileWidth(), th=$gameMap.tileHeight();
    s.x = tx*tw + tw/2; 
    s.y = ty*th + th/2;
    
    var underOnly = this._underOnly();
    var parent = (toOver && !underOnly) ? this._containers.over : this._containers.under;
    parent.addChild(s);
    
    (kind==='puddle'?this._active.puddles:(kind==='snow'?this._active.snows:(kind==='lake'?this._active.lakes:this._active.falls))).push(s);
  };

  RegionFX._rebuildSprites = function(){
    log('→ Spawning sprites...');
    
    var puddleTiles = this._pickSome(this._regionTiles.puddle, CFG.densPuddle, CFG.maxPuddles);
    for (var i=0;i<puddleTiles.length;i++) this._spawnAt('puddle', puddleTiles[i].x, puddleTiles[i].y, CFG.overPuddles);
    log('  Puddles:', this._active.puddles.length);

    var snowTiles = this._pickSome(this._regionTiles.snow, CFG.densSnow, CFG.maxSnow);
    for (var j=0;j<snowTiles.length;j++) this._spawnAt('snow', snowTiles[j].x, snowTiles[j].y, CFG.overSnow);
    log('  Snow:', this._active.snows.length);

    if (CFG.lakesAlwaysOn || CFG.densLake>0){
      var lakeTiles = this._pickSome(this._regionTiles.lake, CFG.densLake, CFG.maxLakes);
      for (var k=0;k<lakeTiles.length;k++) this._spawnAt('lake', lakeTiles[k].x, lakeTiles[k].y, CFG.overLakes);
      log('  Lakes:', this._active.lakes.length);
    }

    if (CFG.waterfallsAlwaysOn || CFG.densWaterfall>0){
      var raw = this._pickSome(this._regionTiles.fall, CFG.densWaterfall, CFG.maxWaterfalls);
      var fallTiles = [];
      for (var m=0;m<raw.length;m++) {
        if (this._looksLikeDrop(raw[m].x, raw[m].y)) fallTiles.push(raw[m]);
      }
      for (var n=0;n<fallTiles.length;n++) this._spawnAt('fall', fallTiles[n].x, fallTiles[n].y, CFG.overWaterfalls);
      log('  Waterfalls:', this._active.falls.length);
    }
  };

  RegionFX._applyWeatherVisibility = function(initial){
    var wi=this.getWeatherInfo(), type=wi.type, pow=wi.power|0;
    
    // Test mode: show everything
    if (this._testMode) {
      type = 'storm';
      pow = 9;
    }
    
	// Boosted the base visibility from 0.25 to 0.40, and the max cap to 1.0 (100%)
    var puddleTarget = (type==='rain'||type==='storm') ? Math.min(1.0, 0.40 + pow*0.10) : 0.0;
    var snowTarget   = (type==='snow') ? Math.min(0.95, 0.30 + pow*0.07) : 0.0;
    var lakeTarget = 0.95;
    var fallAlpha = (CFG.waterfallsAlwaysOn || type!=='none') ? 0.90 : 0.0;

    log('→ Applying weather visibility:', type, pow);
    log('  Puddles:', puddleTarget.toFixed(2), 'Snow:', snowTarget.toFixed(2), 
        'Lakes:', lakeTarget.toFixed(2), 'Waterfalls:', fallAlpha.toFixed(2));

    for (var i=0;i<this._active.puddles.length;i++){ 
      var s=this._active.puddles[i]; 
      s._targetAlpha=puddleTarget; 
      if(initial) s.alpha=s._targetAlpha; 
    }
    
    for (var j=0;j<this._active.snows.length;j++){ 
      var s2=this._active.snows[j]; 
      s2._targetAlpha=snowTarget; 
      if(initial) s2.alpha=s2._targetAlpha; 
    }
    
    for (var k=0;k<this._active.lakes.length;k++){ 
      var lk=this._active.lakes[k]; 
      lk._targetAlpha=lakeTarget; 
      if(initial) lk.alpha=lk._targetAlpha; 
    }
    
    for (var m=0;m<this._active.falls.length;m++){ 
      var f=this._active.falls[m]; 
      f._targetAlpha=fallAlpha; 
      if(initial) f.alpha=f._targetAlpha; 
    }
  };

  RegionFX._summary = function(){
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

RegionFX.update = function(){
    if (!this.enabled) return;

    // Build if needed
    if (this._needBuild && this._ensureContainers() && this._checkBitmapsReady()){ 
      log('→ Late build triggered');
      this._buildNow(); 
      this._needBuild=false; 
    }

    // Sync BOTH containers to map scroll (FIXED FUNCTION CALL)
    this._syncContainers();

    // Check weather changes
    var wi=this.getWeatherInfo(), h=wi.type+':'+wi.power;
    if (h!==this._lastWeatherHash){ 
      this._lastWeatherHash=h; 
      log('↻ Weather state:', wi.type, wi.power);
      this._applyWeatherVisibility(false);
    }

    // Animate
    var i,s;
    for (i=0;i<this._active.puddles.length;i++){ 
      s=this._active.puddles[i]; 
      s._t+=s._speed; 
      s.scale.x=s._baseScaleX*(1.00+Math.sin(s._t)*0.02); 
      s.scale.y=s._baseScaleY*(1.00+Math.cos(s._t)*0.02); 
      s.alpha += (s._targetAlpha - s.alpha)*0.05; 
    }
    for (i=0;i<this._active.snows.length;i++){ 
      s=this._active.snows[i]; 
      s._t+=s._speed*0.5; 
      s.alpha += (s._targetAlpha - s.alpha)*0.05; 
      s.y += Math.sin(s._t)*0.1; 
    }
    for (i=0;i<this._active.lakes.length;i++){ 
      s=this._active.lakes[i]; 
      s._t+=0.02; 
      s.alpha += (s._targetAlpha - s.alpha)*0.04; 
      s.x += Math.sin(s._t + i*0.1)*0.05; 
    }
    for (i=0;i<this._active.falls.length;i++){ 
      s=this._active.falls[i]; 
      s._t+=0.25 + (this._weatherType==='storm'?0.35:0.15); 
      s.alpha += (s._targetAlpha - s.alpha)*0.06; 
      s.y += Math.sin(s._t + i*0.2)*0.1; 
    }
  };

})();