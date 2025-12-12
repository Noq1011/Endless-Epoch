//=============================================================================
// NoqWeatherCore v3.2 — Rain + Fog + Storms (SFX/Ambience) + Persistence + <NoWeather> + Debug
//  - ES5 MV compatible
//  - Respects <NoWeather> and restores previous weather after exit
//  - Persists rain, fog, storm across menus/map transfers
//  - Coexists with DayNight + Tint Freeze (no crashes if not present)
//  - Delta-time raindrop motion (no "slow when moving up")
//  - Thunder flashes interact with map via screen flash (plays nicely with tint)
//  - Optional map note <WeatherDebug> to print useful logs
//=============================================================================

var WeatherSystem = WeatherSystem || {};
if (typeof RainDropManagerGlobal === "undefined") var RainDropManagerGlobal = null;
if (typeof FogManagerGlobal === "undefined") var FogManagerGlobal = null;

(function() {
  // -----------------------
  // Config — tweak as needed
  // -----------------------
  var RAIN_DENSITY      = 50;
  var RAIN_SPEED_MIN    = 2;
  var RAIN_SPEED_MAX    = 5;
  var RAIN_ANGLE_DEG    = 90;     // 90 = straight down
  var RAIN_OPACITY_MAX  = 200;
  var RAIN_TOTAL_FRAMES = 12;
  var RAD_ANGLE         = RAIN_ANGLE_DEG * Math.PI / 180;

  var FOG_PICTURE_ID    = 99;
  var FOG_FILENAME      = "Overlay1"; // /img/pictures/Overlay1.png
  var FOG_OPACITY_MAX   = 150;
  var FOG_SCALE_X       = 300;
  var FOG_SCALE_Y       = 275;
  var FOG_DRIFT_DIST    = 48;
  var FOG_DRIFT_DUR     = 600; // frames

  // Audio (MV default folders)
  var BGS_RAIN_LIGHT    = "Rain_Light";  // /audio/bgs/
  var BGS_RAIN_HEAVY    = "Rain_Heavy";  // /audio/bgs/
  var BGS_WIND_STORM    = "Wind_Storm";  // /audio/bgs/
  var SE_THUNDER_LIST   = ["Thunder1","Thunder2"]; // /audio/se/

  // Volumes (0–100)
  var VOL_RAIN_LOOP_MIN = 40;  // at rainPower=1
  var VOL_RAIN_LOOP_MAX = 80;  // at rainPower=6
  var VOL_WIND_LOOP     = 70;  // storm ambience base
  var VOL_THUNDER_SE    = 90;  // thunder crack

  // Storm rules
  var STORM_AUTO_THRESHOLD = 4;           // auto-storm when rain >= this (if not specified)
  var THUNDER_MIN_FRAMES   = 240;         // 4 seconds @ 60fps
  var THUNDER_MAX_FRAMES   = 540;         // 9 seconds @ 60fps
  var THUNDER_FLASH_COLOR  = [255,255,255,160]; // white flash blends with tint
  var THUNDER_FLASH_DUR    = 24;          // flash frames
  var THUNDER_SE_DELAY_MIN = 6;           // delay after flash before SE (frames)
  var THUNDER_SE_DELAY_MAX = 18;          // slightly randomized delay

  var AUTO_REFRESH_SEC     = 120;           // random weather check cadence on normal maps
  var BGS_REISSUE_COOLDOWN = 120;         // frames between BGS reissues for volume adjust
  var VOLUME_DELTA_THRESH  = 6;           // reissue only if volume change exceeds this

  // -----------------------
  // Helpers
  // -----------------------
  function clamp(v,min,max){ return v<min?min:(v>max?max:v); }
  function isNoWeatherMap() {
    var map = $dataMap; if (!map) return false;
    var note = map.note || "";
    return /<\s*NoWeather\s*>/i.test(note);
  }
  function isDebugMap() {
    var map = $dataMap; if (!map) return false;
    var note = map.note || "";
    return /<\s*WeatherDebug\s*>/i.test(note);
  }
  function dbg() {
    if (!isDebugMap()) return;
    if (console && console.log) console.log.apply(console, arguments);
  }

  // -----------------------
  // Persistent State
  // -----------------------
  function ensureWeatherMemory() {
    if (!$gameSystem._persistentWeather) {
      $gameSystem._persistentWeather = {
        rainPower: 0,
        fogPower:  0,
        stormActive: false,
        active: { rain:false, fog:false, storm:false },
        _loopKind: null,     // "light"|"heavy"|"storm"|null
        _returnSlot: null,   // stash for <NoWeather> areas
        _thunderTimer: 0,
        _bgsCooldown: 0,     // throttle re-issue
        _lastLoopVolume: 0   // last played BGS volume (for delta checks)
      };
    }
  }

  // -----------------------
  // Audio helpers
  // -----------------------
  function playBgs(name, volume) {
    if (!name) return;
    AudioManager.playBgs({name: name, volume: clamp(Math.round(volume),0,100), pitch:100, pan:0});
  }
  function fadeOutBgs(duration) { AudioManager.fadeOutBgs(duration || 30); }
  function stopBgs() { AudioManager.stopBgs(); }
  function playThunderSE() {
    if (!SE_THUNDER_LIST.length) return;
    var which = SE_THUNDER_LIST[Math.floor(Math.random()*SE_THUNDER_LIST.length)];
    AudioManager.playSe({name: which, volume: VOL_THUNDER_SE, pitch:100, pan:0});
  }

  // Decide & play correct ambience loop based on powers/storm
  function updateAmbienceLoops(instant) {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;

    // cooldown tick
    if (s._bgsCooldown > 0) s._bgsCooldown--;

    // If no weather at all, fade/stop loops we own
    if (!s.active.rain && !s.active.storm) {
      if (s._loopKind) {
        fadeOutBgs(instant?10:30);
        dbg("[Weather] BGS faded out (no weather)");
        s._loopKind = null;
      }
      return;
    }

    // Choose loop
    var wantKind = null, wantName = null, wantVol = 0;
    if (s.active.storm) {
      wantKind = "storm"; wantName = BGS_WIND_STORM; wantVol = VOL_WIND_LOOP;
    } else if (s.rainPower >= 4) {
      wantKind = "heavy"; wantName = BGS_RAIN_HEAVY;
      wantVol = VOL_RAIN_LOOP_MIN + ((VOL_RAIN_LOOP_MAX - VOL_RAIN_LOOP_MIN) * (s.rainPower/6));
    } else if (s.active.rain) {
      wantKind = "light"; wantName = BGS_RAIN_LIGHT;
      wantVol = VOL_RAIN_LOOP_MIN + ((VOL_RAIN_LOOP_MAX - VOL_RAIN_LOOP_MIN) * (s.rainPower/6));
    }

    // Start or switch loop
    if (wantKind !== s._loopKind) {
      playBgs(wantName, wantVol);
      s._loopKind = wantKind;
      s._lastLoopVolume = wantVol;
      s._bgsCooldown = BGS_REISSUE_COOLDOWN;
      dbg("[Weather] BGS start:", wantKind, "vol:", wantVol);
    } else if (wantKind && s._bgsCooldown <= 0) {
      // Adjust volume only if significant change to avoid restart pops
      if (Math.abs((s._lastLoopVolume||0) - wantVol) >= VOLUME_DELTA_THRESH) {
        playBgs(wantName, wantVol);
        s._lastLoopVolume = wantVol;
        s._bgsCooldown = BGS_REISSUE_COOLDOWN;
        dbg("[Weather] BGS adjust:", wantKind, "vol:", wantVol);
      }
    } else {
      // no change / cooling down
    }
  }

  // Thunder scheduler
  function resetThunderTimer() {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;
    s._thunderTimer = THUNDER_MIN_FRAMES + Math.floor(Math.random()*(THUNDER_MAX_FRAMES-THUNDER_MIN_FRAMES+1));
    dbg("[Weather] Thunder timer reset:", s._thunderTimer, "frames");
  }
  function tickThunder() {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;

    // Freeze-aware + NoWeather safe
    if ((typeof DayNight !== "undefined" && DayNight._frozen) || isNoWeatherMap()) return;

    if (s.active.storm) {
      if (s._thunderTimer <= 0) {
        // trigger thunder flash, then delayed SE
        if ($gameScreen && $gameScreen.startFlash) {
          $gameScreen.startFlash(THUNDER_FLASH_COLOR, THUNDER_FLASH_DUR);
        }
        var delay = THUNDER_SE_DELAY_MIN + Math.floor(Math.random()*(THUNDER_SE_DELAY_MAX-THUNDER_SE_DELAY_MIN+1));
        setTimeout(function(){ playThunderSE(); dbg("⚡ Thunder Triggered"); }, Math.floor(1000 * (delay / 60)));
        resetThunderTimer();
      } else {
        s._thunderTimer--;
      }
    }
  }

  // -----------------------
  // RainDrop Sprite
  // -----------------------
  function RainDropSprite(bitmap, frameWidth, frameHeight, frameCount) {
    Sprite.call(this, bitmap);
    this._frameWidth = frameWidth;
    this._frameHeight = frameHeight;
    this._frameCountTotal = frameCount || RAIN_TOTAL_FRAMES;
    this._frameIndex = Math.floor(Math.random() * this._frameCountTotal);
    this._frameCounter = 0;
    this._baseSpeed = RAIN_SPEED_MIN + Math.random() * (RAIN_SPEED_MAX - RAIN_SPEED_MIN);
    this._vx = Math.cos(RAD_ANGLE) * this._baseSpeed;
    this._vy = Math.sin(RAD_ANGLE) * this._baseSpeed;
    this.opacity = 0;
    this.resetPosition();
    this.updateFrame();
  }
  RainDropSprite.prototype = Object.create(Sprite.prototype);
  RainDropSprite.prototype.constructor = RainDropSprite;

  RainDropSprite.prototype.resetPosition = function() {
    this.x = Math.random() * Graphics.width;
    this.y = Math.random() * -Graphics.height;
  };
  RainDropSprite.prototype.update = function() {
    var dt = (Graphics._deltaTime ? Graphics._deltaTime * 60 : 1);
    this.x += this._vx * dt;
    this.y += this._vy * dt;

    this._frameCounter += dt;
    if (this._frameCounter >= 6) {
      this._frameCounter = 0;
      this._frameIndex = (this._frameIndex + 1) % this._frameCountTotal;
      this.updateFrame();
    }
    if (this.y > Graphics.height + 20 || this.x < -20 || this.x > Graphics.width + 20) {
      this.resetPosition();
    }
  };
  RainDropSprite.prototype.updateFrame = function() {
    this.setFrame(this._frameWidth * this._frameIndex, 0, this._frameWidth, this._frameHeight);
  };

  // -----------------------
  // Rain Manager
  // -----------------------
  function RainDropManager() { this.initialize(); }
  RainDropManager.prototype.initialize = function() {
    this._active = false;
    this._container = new Sprite();
    this._raindrops = [];
    this._currentOpacity = 0;
    this._targetOpacity = 0;
    this._fadeStep = 0;
  };
  RainDropManager.prototype.start = function() {
    if (this._active) return;
    this._active = true;
    var bitmap = ImageManager.loadSystem("Raindrop");
    var self = this;
    bitmap.addLoadListener(function(loadedBitmap) {
      var frameWidth  = Math.floor(loadedBitmap.width / RAIN_TOTAL_FRAMES);
      var frameHeight = loadedBitmap.height;
      self._raindrops = [];
      self._container.removeChildren();
      for (var i = 0; i < RAIN_DENSITY; i++) {
        var drop = new RainDropSprite(loadedBitmap, frameWidth, frameHeight, RAIN_TOTAL_FRAMES);
        self._container.addChild(drop);
        self._raindrops.push(drop);
      }
      if (SceneManager._scene && SceneManager._scene.children.indexOf(self._container) < 0) {
        SceneManager._scene.addChild(self._container);
      }
    });
  };
  RainDropManager.prototype.stop = function() { this._targetOpacity = 0; };
  RainDropManager.prototype.setPower = function(power, instant) {
    this.start();
    var clamped = Math.max(0, Math.min(6, power || 0));
    var target = RAIN_OPACITY_MAX * (clamped / 6);
    if (instant) {
      this._currentOpacity = target; this._targetOpacity = target; this._fadeStep = 0;
    } else {
      this._targetOpacity = target; this._fadeStep = (this._targetOpacity - this._currentOpacity) / 60;
    }
  };
  RainDropManager.prototype.update = function() {
    if (!this._active) return;
    if (typeof DayNight !== "undefined" && DayNight._frozen) return;
    for (var i = 0; i < this._raindrops.length; i++) {
      this._raindrops[i].update();
      this._raindrops[i].opacity = this._currentOpacity;
    }
    if (Math.abs(this._currentOpacity - this._targetOpacity) > 1) {
      this._currentOpacity += this._fadeStep;
    }
  };

  // -----------------------
  // Fog Manager
  // -----------------------
  function FogManager() {
    this._currentOpacity = 0;
    this._targetOpacity  = 0;
    this._fadeStep       = 0;
    showFogOverlay();
  }
  FogManager.prototype.setPower = function(power, instant) {
    var clamped = Math.max(0, Math.min(6, power || 0));
    var target = FOG_OPACITY_MAX * (clamped / 6);
    if (instant) {
      this._currentOpacity = target; this._targetOpacity = target; this._fadeStep = 0;
    } else {
      this._targetOpacity = target;
      // Faster fade (was /60) → smoother visibility without “forever wait”
      this._fadeStep = (this._targetOpacity - this._currentOpacity) / 30;
    }
  };
  FogManager.prototype.update = function() {
    if (typeof DayNight !== "undefined" && DayNight._frozen) return;
    var pic = $gameScreen.picture(FOG_PICTURE_ID);
    if (!pic) return;

    if (Math.abs(this._currentOpacity - this._targetOpacity) > 1) {
      this._currentOpacity += this._fadeStep;
    }

    var centerX = Graphics.width / 2;
    var centerY = Graphics.height / 2;
    var drift   = FOG_DRIFT_DIST * Math.sin(Graphics.frameCount / FOG_DRIFT_DUR * Math.PI * 2);

    $gameScreen.movePicture(
      FOG_PICTURE_ID, 1,
      centerX + drift, centerY + drift,
      FOG_SCALE_X, FOG_SCALE_Y,
      this._currentOpacity, 0, 1
    );
  };

  function showFogOverlay() {
    if (!$gameScreen.picture(FOG_PICTURE_ID)) {
      var centerX = Graphics.width / 2;
      var centerY = Graphics.height / 2;
      $gameScreen.showPicture(FOG_PICTURE_ID, FOG_FILENAME, 1, centerX, centerY, FOG_SCALE_X, FOG_SCALE_Y, 0, 0);
    }
  }
  function hideFogOverlay() {
    if ($gameScreen.picture(FOG_PICTURE_ID)) { $gameScreen.erasePicture(FOG_PICTURE_ID); }
  }

  // -----------------------
  // Scene_Map integration
  // -----------------------
  var _Scene_Map_createSpriteset = Scene_Map.prototype.createSpriteset;
  Scene_Map.prototype.createSpriteset = function() {
    _Scene_Map_createSpriteset.call(this);

    this._rainDropManager = new RainDropManager();
    RainDropManagerGlobal = this._rainDropManager;

    this._fogManager = new FogManager();
    FogManagerGlobal = this._fogManager;

    WeatherSystem._applyPersistentState(true);
  };

  var _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function() {
    _Scene_Map_update.call(this);

    if (this._rainDropManager) this._rainDropManager.update();
    if (this._fogManager) this._fogManager.update();

    // Thunder scheduler
    tickThunder();

    // Auto refresh (skip on <NoWeather>)
    if (!this._weatherUpdateCounter) this._weatherUpdateCounter = 0;
    this._weatherUpdateCounter++;
    if (this._weatherUpdateCounter >= 60 * AUTO_REFRESH_SEC) {
      this._weatherUpdateCounter = 0;
      if (!isNoWeatherMap()) $gameMap.refreshWeatherForTime();
    }
  };

  // -----------------------
  // Weather control API
  // -----------------------
  // Accepts:
  //   changeWeatherType("rain", 3)
  //   changeWeatherType("stormrain", 5)
  //   changeWeatherType("fograin", 4)
  //   changeWeatherType("none", 0)
  //   changeWeatherType({ rain:3, fog:2, storm:true, instant:true })
  Scene_Map.prototype.changeWeatherType = function(type, power) {
    ensureWeatherMemory();
    if (!this._rainDropManager || !this._fogManager) return;

    // Normalize inputs
    var cfg = { rain:0, fog:0, storm:null, instant:false };
    if (typeof type === "string") {
      var t = type.toLowerCase();
      if (t.indexOf("rain") >= 0) cfg.rain = (power || 0);
      if (t.indexOf("fog")  >= 0) cfg.fog  = (power || 0);
      if (t.indexOf("storm")>= 0) cfg.storm = true;
      if (t === "none") { cfg.rain = 0; cfg.fog = 0; cfg.storm = false; }
    } else if (type && typeof type === "object") {
      cfg.rain    = Math.max(0, type.rain || 0);
      cfg.fog     = Math.max(0, type.fog  || 0);
      cfg.storm   = (typeof type.storm === "boolean") ? type.storm : null;
      cfg.instant = !!type.instant;
    }

    // If this map forbids weather, fade out but remember desired state to return
    if (isNoWeatherMap()) {
      stashReturnSlotIfNeeded();
      this._rainDropManager.setPower(0, cfg.instant);
      this._fogManager.setPower(0, cfg.instant);
      updatePersistent(0,0,false,false,false);
      hideFogOverlay();
      updateAmbienceLoops(cfg.instant); // will fade out
      dbg("[Weather] <NoWeather> → fade all, stashed return");
      return;
    }

    // Auto storm if not specified: storm when rain >= threshold
    if (cfg.storm === null) cfg.storm = (cfg.rain >= STORM_AUTO_THRESHOLD);

    // Apply to managers
    this._rainDropManager.setPower(cfg.rain, cfg.instant);
    this._fogManager.setPower(cfg.fog, cfg.instant);
    if (cfg.fog > 0) showFogOverlay(); else hideFogOverlay();

    updatePersistent(cfg.rain, cfg.fog, cfg.rain>0, cfg.fog>0, !!cfg.storm);

    // Seed thunder if storming; update ambience choice/volume
    if (!!cfg.storm) resetThunderTimer();
    updateAmbienceLoops(cfg.instant);

    // Clear stale return slot if any
    $gameSystem._persistentWeather._returnSlot = null;

    dbg("[Weather] change →", JSON.stringify({
      rain: cfg.rain, fog: cfg.fog, storm: !!cfg.storm, instant: !!cfg.instant
    }));
  };

  function stashReturnSlotIfNeeded() {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;
    if (!s._returnSlot) {
      s._returnSlot = {
        rainPower: s.rainPower,
        fogPower:  s.fogPower,
        stormActive: s.stormActive,
        active: { rain: s.active.rain, fog: s.active.fog, storm: s.active.storm },
        _loopKind: s._loopKind,
        _lastLoopVolume: s._lastLoopVolume
      };
    }
  }

  function updatePersistent(rainPower, fogPower, rainActive, fogActive, stormActive) {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;
    s.rainPower     = rainPower|0;
    s.fogPower      = fogPower|0;
    s.stormActive   = !!stormActive;
    s.active.rain   = !!rainActive;
    s.active.fog    = !!fogActive;
    s.active.storm  = !!stormActive;
  }

  // -----------------------
  // Dynamic weather based on Day/Night (storm-aware)
  // -----------------------
  Game_Map.prototype.refreshWeatherForTime = function() {
    if (isNoWeatherMap()) return;

    var hour = (typeof DayNight !== "undefined") ? DayNight.hour() : 12;

    var wantFog=false, wantRain=false, wantStorm=false;
    var fogPower=0, rainPower=0;

    if ((hour >= 5 && hour < 9) || hour >= 22 || hour < 5) {
      if (Math.random() < 0.2) { wantFog = true; fogPower = 2; }
    }
    if (hour >= 9 && hour < 18) {
      if (Math.random() < 0.2) {
        wantRain = true;
        // sometimes storms by day
        rainPower = (Math.random() < 0.3) ? 5 : 3;
      }
    }

    if (wantRain && rainPower >= STORM_AUTO_THRESHOLD) wantStorm = true;

    if (!wantFog && !wantRain) {
      if (SceneManager._scene && SceneManager._scene.changeWeatherType)
        SceneManager._scene.changeWeatherType("none", 0);
    } else {
      if (SceneManager._scene && SceneManager._scene.changeWeatherType)
        SceneManager._scene.changeWeatherType({ rain:(wantRain?rainPower:0), fog:(wantFog?fogPower:0), storm:wantStorm });
    }
    dbg("[Weather] refreshTime →", JSON.stringify({hour:hour, wantRain:wantRain, rainPower:rainPower, wantFog:wantFog, fogPower:fogPower, wantStorm:wantStorm}));
  };

  // -----------------------
  // Apply persistent on map/scene setup
  // -----------------------
  WeatherSystem._applyPersistentState = function(instant) {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;

    if (isNoWeatherMap()) {
      stashReturnSlotIfNeeded();
      if (SceneManager._scene) {
        if (SceneManager._scene._rainDropManager) SceneManager._scene._rainDropManager.setPower(0, instant);
        if (SceneManager._scene._fogManager)      SceneManager._scene._fogManager.setPower(0, instant);
      }
      hideFogOverlay();
      updatePersistent(0,0,false,false,false);
      updateAmbienceLoops(instant); // fade out
      dbg("[Weather] applyPersistent → <NoWeather> fade");
      return;
    }

    // Restore from returnSlot if coming out of NoWeather, else normal state
    var restore = s._returnSlot ? s._returnSlot : s;
    if (SceneManager._scene) {
      if (SceneManager._scene._rainDropManager)
        SceneManager._scene._rainDropManager.setPower(restore.rainPower, instant);
      if (SceneManager._scene._fogManager)
        SceneManager._scene._fogManager.setPower(restore.fogPower, instant);
      if ((restore.fogPower|0) > 0) showFogOverlay(); else hideFogOverlay();
    }

    updatePersistent(restore.rainPower, restore.fogPower, restore.rainPower>0, restore.fogPower>0, !!restore.stormActive);
    $gameSystem._persistentWeather._loopKind = restore._loopKind || null;
    $gameSystem._persistentWeather._lastLoopVolume = restore._lastLoopVolume || 0;

    // Re-apply ambience and thunder schedule
    updateAmbienceLoops(instant);
    if (s.active.storm) resetThunderTimer();

    s._returnSlot = null; // clear after restoration
    dbg("[Weather] applyPersistent →", JSON.stringify({
      rain:s.rainPower, fog:s.fogPower, storm:s.stormActive, loop:s._loopKind
    }));
  };

  // Hook map setup so transfers apply rules immediately
  var _Game_Map_setup = Game_Map.prototype.setup;
  Game_Map.prototype.setup = function(mapId) {
    _Game_Map_setup.call(this, mapId);
    setTimeout(function(){ WeatherSystem._applyPersistentState(true); }, 0);
  };

  // -----------------------
  // Safe helper for events / console
  // -----------------------
  WeatherSystem.change = function(config, power) {
    if (SceneManager._scene && SceneManager._scene.changeWeatherType) {
      SceneManager._scene.changeWeatherType(config, power);
    } else {
      setTimeout(function() {
        if (SceneManager._scene && SceneManager._scene.changeWeatherType) {
          SceneManager._scene.changeWeatherType(config, power);
        }
      }, 100);
    }
  };

//=============================================================================
// NoqUnifiedWeatherSystem v3.3 – Indoor Dampening for <NoWeather> Maps
//=============================================================================
(function() {
  var DAMPEN_FACTOR = 0.4;     // 0.0-1.0 indoor volume multiplier
  var DAMPEN_FADE   = 60;      // frames to fade between volumes
  WeatherSystem._indoorDampen  = false;
  var _fadeStep = 0;
  var _targetVol = 0;

  // --- override applyPersistentState to mark indoor status ---
  var _oldApply = WeatherSystem._applyPersistentState;
  WeatherSystem._applyPersistentState = function(instant) {
    _oldApply.call(this, instant);
    WeatherSystem._indoorDampen = isNoWeatherMap();
    if (WeatherSystem._indoorDampen) _applyIndoorFade(DAMPEN_FACTOR, instant);
    else _applyIndoorFade(1.0, instant);
  };

  // --- fade logic ---
  function _applyIndoorFade(mult, instant) {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;
    if (!s._loopKind) return;
    var baseVol = (s._lastLoopVolume || 60);
    _targetVol = baseVol * mult;
    if (instant) {
      playBgsForKind(s._loopKind, _targetVol);
    } else {
      _fadeStep = (_targetVol - (s._currentVol||baseVol)) / DAMPEN_FADE;
      s._currentVol = baseVol;
    }
  }

  // --- helper: replay BGS for loopKind at given volume ---
  function playBgsForKind(kind, vol) {
    if (kind === "storm")      playBgs(BGS_WIND_STORM, vol);
    else if (kind === "heavy") playBgs(BGS_RAIN_HEAVY, vol);
    else if (kind === "light") playBgs(BGS_RAIN_LIGHT, vol);
  }

  // --- integrate fade updater into Scene_Map.update ---
  var _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function() {
    _Scene_Map_update.call(this);
    var s = $gameSystem._persistentWeather;
    if (!s || !s._loopKind) return;
    if (Math.abs((s._currentVol||0) - _targetVol) > 1) {
      s._currentVol += _fadeStep;
      playBgsForKind(s._loopKind, s._currentVol);
    }
  };
})();

})();

