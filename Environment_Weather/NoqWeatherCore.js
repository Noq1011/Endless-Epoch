//=============================================================================
// NoqWeatherCore v3.4.1 — Rain + Fog + Clouds + Wind + Persistence + <NoWeather>
//  - ES5 MV compatible
//  - FIXED: Removed broken camera-delta compensation that caused parallax slowdown
//  - FIXED: Rain now properly screen-space (moves independently of camera)
//  - FIXED: Wind-based spawn offset now scales correctly
//  - Instant screen-fill on spawn (no more "wipe" after menu/transfer)
//  - Overcast/Cloud overlays (Picture ID 98)
//  - Wind power (Slants rain, accelerates clouds)
//  - Preserved original API hooks for DayNight and RegionFX
//=============================================================================

var WeatherSystem = WeatherSystem || {};
if (typeof RainDropManagerGlobal === "undefined") var RainDropManagerGlobal = null;
if (typeof FogManagerGlobal === "undefined") var FogManagerGlobal = null;
if (typeof CloudManagerGlobal === "undefined") var CloudManagerGlobal = null;

(function() {
  // -----------------------
  // Config — tweak as needed
  // -----------------------
  var RAIN_DENSITY      = 100;
  var RAIN_SPEED_MIN    = 8;  // Increased slightly to offset camera fixes
  var RAIN_SPEED_MAX    = 15;
  var RAIN_ANGLE_DEG    = 85;     // Slightly angled by default
  var RAIN_OPACITY_MAX  = 210;
  var RAIN_TOTAL_FRAMES = 12;
  var RAD_ANGLE         = RAIN_ANGLE_DEG * Math.PI / 180;

  var FOG_PICTURE_ID    = 99;
  var FOG_FILENAME      = "Overlay1"; 
  var FOG_OPACITY_MAX   = 150;
  var FOG_SCALE_X       = 300;
  var FOG_SCALE_Y       = 275;
  var FOG_DRIFT_DIST    = 48;
  var FOG_DRIFT_DUR     = 600; 

  // NEW: Clouds Config
  var CLOUD_PICTURE_ID  = 98;
  var CLOUD_FILENAME    = "Clouds_Overlay"; // /img/pictures/Clouds_Overlay.png
  var CLOUD_OPACITY_MAX = 180;
  var CLOUD_SCALE_X     = 300;
  var CLOUD_SCALE_Y     = 300;

  // Audio (MV default folders)
  var BGS_RAIN_LIGHT    = "Rain_Light";  
  var BGS_RAIN_HEAVY    = "Rain_Heavy";  
  var BGS_WIND_STORM    = "Wind_Storm";  
  var SE_THUNDER_LIST   = ["Thunder1","Thunder2"]; 

  // Volumes (0–100)
  var VOL_RAIN_LOOP_MIN = 40;  
  var VOL_RAIN_LOOP_MAX = 80;  
  var VOL_WIND_LOOP     = 70;  
  var VOL_THUNDER_SE    = 90;  

  // Storm rules
  var STORM_AUTO_THRESHOLD = 4;           
  var THUNDER_MIN_FRAMES   = 240;         
  var THUNDER_MAX_FRAMES   = 540;         
  var THUNDER_FLASH_COLOR  = [255,255,255,160]; 
  var THUNDER_FLASH_DUR    = 24;          
  var THUNDER_SE_DELAY_MIN = 6;           
  var THUNDER_SE_DELAY_MAX = 18;          

  var AUTO_REFRESH_SEC     = 120;           
  var BGS_REISSUE_COOLDOWN = 120;         
  var VOLUME_DELTA_THRESH  = 6;           

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
        cloudPower: 0, // NEW
        windPower: 0,  // NEW
        stormActive: false,
        active: { rain:false, fog:false, cloud:false, storm:false },
        _loopKind: null,     
        _returnSlot: null,   
        _thunderTimer: 0,
        _bgsCooldown: 0,     
        _lastLoopVolume: 0   
      };
    }
    // Safety net for old saves loading the new version
    if ($gameSystem._persistentWeather.cloudPower === undefined) {
        $gameSystem._persistentWeather.cloudPower = 0;
        $gameSystem._persistentWeather.windPower = 0;
        $gameSystem._persistentWeather.active.cloud = false;
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

  function updateAmbienceLoops(instant) {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;

    if (s._bgsCooldown > 0) s._bgsCooldown--;

    if (!s.active.rain && !s.active.storm && s.windPower === 0) {
      if (s._loopKind) {
        fadeOutBgs(instant?10:30);
        dbg("[Weather] BGS faded out (no weather)");
        s._loopKind = null;
      }
      return;
    }

    var wantKind = null, wantName = null, wantVol = 0;
    if (s.active.storm || s.windPower > 3) {
      wantKind = "storm"; wantName = BGS_WIND_STORM; wantVol = VOL_WIND_LOOP + (s.windPower * 2);
    } else if (s.rainPower >= 4) {
      wantKind = "heavy"; wantName = BGS_RAIN_HEAVY;
      wantVol = VOL_RAIN_LOOP_MIN + ((VOL_RAIN_LOOP_MAX - VOL_RAIN_LOOP_MIN) * (s.rainPower/6));
    } else if (s.active.rain) {
      wantKind = "light"; wantName = BGS_RAIN_LIGHT;
      wantVol = VOL_RAIN_LOOP_MIN + ((VOL_RAIN_LOOP_MAX - VOL_RAIN_LOOP_MIN) * (s.rainPower/6));
    }

    if (wantKind !== s._loopKind) {
      playBgs(wantName, wantVol);
      s._loopKind = wantKind;
      s._lastLoopVolume = wantVol;
      s._bgsCooldown = BGS_REISSUE_COOLDOWN;
      dbg("[Weather] BGS start:", wantKind, "vol:", wantVol);
    } else if (wantKind && s._bgsCooldown <= 0) {
      if (Math.abs((s._lastLoopVolume||0) - wantVol) >= VOLUME_DELTA_THRESH) {
        playBgs(wantName, wantVol);
        s._lastLoopVolume = wantVol;
        s._bgsCooldown = BGS_REISSUE_COOLDOWN;
        dbg("[Weather] BGS adjust:", wantKind, "vol:", wantVol);
      }
    }
  }

  function resetThunderTimer() {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;
    s._thunderTimer = THUNDER_MIN_FRAMES + Math.floor(Math.random()*(THUNDER_MAX_FRAMES-THUNDER_MIN_FRAMES+1));
    dbg("[Weather] Thunder timer reset:", s._thunderTimer, "frames");
  }
  function tickThunder() {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;

    if ((typeof DayNight !== "undefined" && DayNight._frozen) || isNoWeatherMap()) return;

    if (s.active.storm) {
      if (s._thunderTimer <= 0) {
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
  // RainDrop Sprite (FIXED)
  // -----------------------
  function RainDropSprite(bitmap, frameWidth, frameHeight, frameCount, initialSpawn) {
    Sprite.call(this, bitmap);
    this._frameWidth = frameWidth;
    this._frameHeight = frameHeight;
    this._frameCountTotal = frameCount || RAIN_TOTAL_FRAMES;
    this._frameIndex = Math.floor(Math.random() * this._frameCountTotal);
    this._frameCounter = 0;
    this._baseSpeed = RAIN_SPEED_MIN + Math.random() * (RAIN_SPEED_MAX - RAIN_SPEED_MIN);
    
    // Start invisible, manager will fade in
    this.opacity = 0;
    
    // Instant Scatter Spawn to prevent wipe effect
    if (initialSpawn) {
        this.x = Math.random() * (Graphics.width + 200) - 100;
        this.y = Math.random() * (Graphics.height + 200) - 100;
    } else {
        this.resetPosition(0);
    }
    
    this.updateFrame();
  }
  RainDropSprite.prototype = Object.create(Sprite.prototype);
  RainDropSprite.prototype.constructor = RainDropSprite;

  // BUGFIX: Improved spawn logic that properly accounts for wind
  RainDropSprite.prototype.resetPosition = function(windVelocity) {
    // Calculate spawn offset based on actual wind strength
    // More wind = spawn further left to prevent pop-in on right side
    var baseOffset = 100;
    var windOffset = Math.abs(windVelocity || 0) * 15; // Scale offset by wind velocity
    var totalOffset = baseOffset + windOffset;
    
    // Spawn wider area with dynamic offset
    this.x = (Math.random() * (Graphics.width + 400)) - totalOffset;
    this.y = (Math.random() * -100) - 50;
  };
  
  RainDropSprite.prototype.update = function(camDx, camDy, windPower) {
    var dt = (Graphics._deltaTime ? Graphics._deltaTime * 60 : 1);
    
    // Calculate wind velocity correctly 
    var windVelocity = (windPower || 0) * 3;
    var vx = (Math.cos(RAD_ANGLE) * this._baseSpeed) + windVelocity;
    var vy = Math.sin(RAD_ANGLE) * this._baseSpeed;

    // CRITICAL: Weather is screen-space, NOT world-space
    // Do NOT subtract camera delta - that causes parallax slowdown
    this.x += vx * dt;
    this.y += vy * dt;

    this._frameCounter += dt;
    if (this._frameCounter >= 6) {
      this._frameCounter = 0;
      this._frameIndex = (this._frameIndex + 1) % this._frameCountTotal;
      this.updateFrame();
    }
    
    // Improved boundary checking with wind compensation
    var rightBound = Graphics.width + 100 + (windVelocity * 5);
    if (this.y > Graphics.height + 50 || this.x < -300 || this.x > rightBound) {
      this.resetPosition(windVelocity);
    }
  };
  
  RainDropSprite.prototype.updateFrame = function() {
    this.setFrame(this._frameWidth * this._frameIndex, 0, this._frameWidth, this._frameHeight);
  };

  // -----------------------
  // Rain Manager (UPDATED)
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
        // Pass true for instant scatter spawn
        var drop = new RainDropSprite(loadedBitmap, frameWidth, frameHeight, RAIN_TOTAL_FRAMES, true);
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
  RainDropManager.prototype.update = function(windPower) {
    if (!this._active) return;
    if (typeof DayNight !== "undefined" && DayNight._frozen) return;

    // Update all raindrops (screen-space, no camera compensation needed)
    for (var i = 0; i < this._raindrops.length; i++) {
      this._raindrops[i].update(0, 0, windPower);
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
  // Cloud Manager (NEW)
  // -----------------------
  function CloudManager() {
    this._currentOpacity = 0;
    this._targetOpacity  = 0;
    this._fadeStep       = 0;
    this._driftX         = 0;
    showCloudOverlay();
  }
  CloudManager.prototype.setPower = function(power, instant) {
    var clamped = Math.max(0, Math.min(6, power || 0));
    var target = CLOUD_OPACITY_MAX * (clamped / 6);
    if (instant) {
      this._currentOpacity = target; this._targetOpacity = target; this._fadeStep = 0;
    } else {
      this._targetOpacity = target;
      this._fadeStep = (this._targetOpacity - this._currentOpacity) / 30;
    }
  };
  CloudManager.prototype.update = function(windPower) {
    if (typeof DayNight !== "undefined" && DayNight._frozen) return;
    var pic = $gameScreen.picture(CLOUD_PICTURE_ID);
    if (!pic) return;

    if (Math.abs(this._currentOpacity - this._targetOpacity) > 1) {
      this._currentOpacity += this._fadeStep;
    }

    // Clouds drift continuously. Wind makes them go faster.
    var speed = 0.5 + ((windPower || 0) * 0.4);
    this._driftX -= speed;
    
    // Seamless wrapping depends on image size, arbitrary large bounds to prevent snapping visually 
    if (this._driftX < -(Graphics.width * 2)) this._driftX += Graphics.width * 4; 

    var centerX = (Graphics.width / 2) + this._driftX;
    var centerY = Graphics.height / 2;

    $gameScreen.movePicture(
      CLOUD_PICTURE_ID, 1,
      centerX, centerY,
      CLOUD_SCALE_X, CLOUD_SCALE_Y,
      this._currentOpacity, 0, 1
    );
  };

  function showCloudOverlay() {
    if (!$gameScreen.picture(CLOUD_PICTURE_ID)) {
      var centerX = Graphics.width / 2;
      var centerY = Graphics.height / 2;
      $gameScreen.showPicture(CLOUD_PICTURE_ID, CLOUD_FILENAME, 1, centerX, centerY, CLOUD_SCALE_X, CLOUD_SCALE_Y, 0, 0);
    }
  }
  function hideCloudOverlay() {
    if ($gameScreen.picture(CLOUD_PICTURE_ID)) { $gameScreen.erasePicture(CLOUD_PICTURE_ID); }
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

    this._cloudManager = new CloudManager();
    CloudManagerGlobal = this._cloudManager;

    WeatherSystem._applyPersistentState(true);
  };

  var _Scene_Map_update = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function() {
    _Scene_Map_update.call(this);

    ensureWeatherMemory();
    var windPower = $gameSystem._persistentWeather.windPower || 0;

    if (this._rainDropManager) this._rainDropManager.update(windPower);
    if (this._fogManager) this._fogManager.update();
    if (this._cloudManager) this._cloudManager.update(windPower);

    tickThunder();

    if (!this._weatherUpdateCounter) this._weatherUpdateCounter = 0;
    this._weatherUpdateCounter++;
    if (this._weatherUpdateCounter >= 60 * AUTO_REFRESH_SEC) {
      this._weatherUpdateCounter = 0;
      if (!isNoWeatherMap()) $gameMap.refreshWeatherForTime();
    }
  };

  // -----------------------
  // Weather control API (UPDATED)
  // -----------------------
  Scene_Map.prototype.changeWeatherType = function(type, power) {
    ensureWeatherMemory();
    if (!this._rainDropManager || !this._fogManager || !this._cloudManager) return;

    // Normalize inputs (Now looks for 'cloud', 'overcast', and 'wind')
    var cfg = { rain:0, fog:0, cloud:0, wind:0, storm:null, instant:false };
    if (typeof type === "string") {
      var t = type.toLowerCase();
      if (t.indexOf("rain") >= 0) cfg.rain = (power || 0);
      if (t.indexOf("fog")  >= 0) cfg.fog  = (power || 0);
      if (t.indexOf("cloud") >= 0 || t.indexOf("overcast") >= 0) cfg.cloud = (power || 0);
      if (t.indexOf("wind") >= 0) cfg.wind = (power || 0);
      if (t.indexOf("storm")>= 0) cfg.storm = true;
      if (t === "none") { cfg.rain = 0; cfg.fog = 0; cfg.cloud = 0; cfg.wind = 0; cfg.storm = false; }
    } else if (type && typeof type === "object") {
      cfg.rain    = Math.max(0, type.rain || 0);
      cfg.fog     = Math.max(0, type.fog  || 0);
      cfg.cloud   = Math.max(0, type.cloud || 0);
      cfg.wind    = Math.max(0, type.wind || 0);
      cfg.storm   = (typeof type.storm === "boolean") ? type.storm : null;
      cfg.instant = !!type.instant;
    }

    if (isNoWeatherMap()) {
      stashReturnSlotIfNeeded();
      this._rainDropManager.setPower(0, cfg.instant);
      this._fogManager.setPower(0, cfg.instant);
      this._cloudManager.setPower(0, cfg.instant);
      updatePersistent(0,0,0,0,false,false,false,false);
      hideFogOverlay();
      hideCloudOverlay();
      updateAmbienceLoops(cfg.instant); 
      dbg("[Weather] <NoWeather> → fade all, stashed return");
      return;
    }

    if (cfg.storm === null) cfg.storm = (cfg.rain >= STORM_AUTO_THRESHOLD);

    this._rainDropManager.setPower(cfg.rain, cfg.instant);
    this._fogManager.setPower(cfg.fog, cfg.instant);
    this._cloudManager.setPower(cfg.cloud, cfg.instant);
    
    if (cfg.fog > 0) showFogOverlay(); else hideFogOverlay();
    if (cfg.cloud > 0) showCloudOverlay(); else hideCloudOverlay();

    updatePersistent(cfg.rain, cfg.fog, cfg.cloud, cfg.wind, cfg.rain>0, cfg.fog>0, cfg.cloud>0, !!cfg.storm);

    if (!!cfg.storm) resetThunderTimer();
    updateAmbienceLoops(cfg.instant);

    $gameSystem._persistentWeather._returnSlot = null;

    dbg("[Weather] change →", JSON.stringify({
      rain: cfg.rain, fog: cfg.fog, cloud: cfg.cloud, wind: cfg.wind, storm: !!cfg.storm, instant: !!cfg.instant
    }));
  };

  function stashReturnSlotIfNeeded() {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;
    if (!s._returnSlot) {
      s._returnSlot = {
        rainPower: s.rainPower,
        fogPower:  s.fogPower,
        cloudPower: s.cloudPower,
        windPower: s.windPower,
        stormActive: s.stormActive,
        active: { rain: s.active.rain, fog: s.active.fog, cloud: s.active.cloud, storm: s.active.storm },
        _loopKind: s._loopKind,
        _lastLoopVolume: s._lastLoopVolume
      };
    }
  }

  // Expanded parameter list while keeping the function internal
  function updatePersistent(rainPower, fogPower, cloudPower, windPower, rainActive, fogActive, cloudActive, stormActive) {
    ensureWeatherMemory();
    var s = $gameSystem._persistentWeather;
    s.rainPower   = rainPower|0;
    s.fogPower    = fogPower|0;
    s.cloudPower  = cloudPower|0;
    s.windPower   = windPower|0;
    s.stormActive = !!stormActive;
    s.active.rain = !!rainActive;
    s.active.fog  = !!fogActive;
    s.active.cloud = !!cloudActive;
    s.active.storm= !!stormActive;
  }

  // -----------------------
  // Dynamic weather based on Day/Night
  // -----------------------
  Game_Map.prototype.refreshWeatherForTime = function() {
    if (isNoWeatherMap()) return;

    var hour = (typeof DayNight !== "undefined") ? DayNight.hour() : 12;

    var wantFog=false, wantRain=false, wantStorm=false, wantCloud=false;
    var fogPower=0, rainPower=0, cloudPower=0;

    if ((hour >= 5 && hour < 9) || hour >= 22 || hour < 5) {
      if (Math.random() < 0.2) { wantFog = true; fogPower = 2; }
    }
    if (hour >= 9 && hour < 18) {
      if (Math.random() < 0.2) {
        wantRain = true;
        rainPower = (Math.random() < 0.3) ? 5 : 3;
      } else if (Math.random() < 0.3) {
        wantCloud = true;
        cloudPower = 4;
      }
    }

    if (wantRain && rainPower >= STORM_AUTO_THRESHOLD) wantStorm = true;

    if (!wantFog && !wantRain && !wantCloud) {
      if (SceneManager._scene && SceneManager._scene.changeWeatherType)
        SceneManager._scene.changeWeatherType("none", 0);
    } else {
      if (SceneManager._scene && SceneManager._scene.changeWeatherType)
        SceneManager._scene.changeWeatherType({ rain:(wantRain?rainPower:0), fog:(wantFog?fogPower:0), cloud:(wantCloud?cloudPower:0), storm:wantStorm });
    }
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
        if (SceneManager._scene._cloudManager)    SceneManager._scene._cloudManager.setPower(0, instant);
      }
      hideFogOverlay();
      hideCloudOverlay();
      updatePersistent(0,0,0,0,false,false,false,false);
      updateAmbienceLoops(instant); 
      return;
    }

    var restore = s._returnSlot ? s._returnSlot : s;
    if (SceneManager._scene) {
      if (SceneManager._scene._rainDropManager)
        SceneManager._scene._rainDropManager.setPower(restore.rainPower, instant);
      if (SceneManager._scene._fogManager)
        SceneManager._scene._fogManager.setPower(restore.fogPower, instant);
      if (SceneManager._scene._cloudManager)
        SceneManager._scene._cloudManager.setPower(restore.cloudPower, instant);
        
      if ((restore.fogPower|0) > 0) showFogOverlay(); else hideFogOverlay();
      if ((restore.cloudPower|0) > 0) showCloudOverlay(); else hideCloudOverlay();
    }

    updatePersistent(restore.rainPower, restore.fogPower, restore.cloudPower, restore.windPower, restore.rainPower>0, restore.fogPower>0, restore.cloudPower>0, !!restore.stormActive);
    $gameSystem._persistentWeather._loopKind = restore._loopKind || null;
    $gameSystem._persistentWeather._lastLoopVolume = restore._lastLoopVolume || 0;

    updateAmbienceLoops(instant);
    if (s.active.storm) resetThunderTimer();

    s._returnSlot = null; 
  };

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
  var DAMPEN_FACTOR = 0.4;     
  var DAMPEN_FADE   = 60;      
  WeatherSystem._indoorDampen  = false;
  var _fadeStep = 0;
  var _targetVol = 0;

  var _oldApply = WeatherSystem._applyPersistentState;
  WeatherSystem._applyPersistentState = function(instant) {
    _oldApply.call(this, instant);
    WeatherSystem._indoorDampen = isNoWeatherMap();
    if (WeatherSystem._indoorDampen) _applyIndoorFade(DAMPEN_FACTOR, instant);
    else _applyIndoorFade(1.0, instant);
  };

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

  function playBgsForKind(kind, vol) {
    if (kind === "storm")      playBgs(BGS_WIND_STORM, vol);
    else if (kind === "heavy") playBgs(BGS_RAIN_HEAVY, vol);
    else if (kind === "light") playBgs(BGS_RAIN_LIGHT, vol);
  }

  var _Scene_Map_update_indoor = Scene_Map.prototype.update;
  Scene_Map.prototype.update = function() {
    _Scene_Map_update_indoor.call(this);
    var s = $gameSystem._persistentWeather;
    if (!s || !s._loopKind) return;
    if (Math.abs((s._currentVol||0) - _targetVol) > 1) {
      s._currentVol += _fadeStep;
      playBgsForKind(s._loopKind, s._currentVol);
    }
  };
})();

})();
