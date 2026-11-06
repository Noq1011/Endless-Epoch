/*:
 * @target MV
 * @plugindesc v1.1 Footsteps by Region/Terrain + WeatherSystem-aware wet levels (MV ES5; YEP Region-friendly)
 * @author Noq
 * @help
 * Assign step sounds per Region ID (and/or Terrain Tag). Integrates with
 * NoqWeatherCore v3.2 (WeatherSystem) to select wet variants automatically.
 * Falls back to MV's $gameScreen.weatherType() if WeatherSystem is absent.
 *
 * ───────────────
 * WHAT'S NEW IN v1.1
 * ───────────────
 * • WeatherSystem integration (uses $gameSystem._persistentWeather).
 * • Wet "level" (0–6) from rainPower with storm treated as max.
 * • Optional heavy-wet sounds via rule keys: wet2Walk / wet2Dash (>= threshold).
 * • YEP region-friendly: optional "Use Character.regionId()" toggle.
 * • New plugin commands: adapter, fogWet, charRegion, heavyAt.
 *
 * ───────────────
 * RULES (JSON)
 * ───────────────
 * Each rule can include: walk, dash, wetWalk, wetDash, wet2Walk, wet2Dash.
 * The "wet2" variants trigger when wet level >= "Wet Heavy Threshold".
 * All fields are optional; the system will fall back sensibly.
 *
 * Example rule:
 * {
 *   "regions":"2",
 *   "walk":{"name":"Step_Dirt","volume":80,"pitch":100},
 *   "dash":{"name":"Step_Dirt","volume":90,"pitch":110},
 *   "wetWalk":{"name":"Step_MudLight","volume":85,"pitch":98},
 *   "wetDash":{"name":"Step_MudLight","volume":92,"pitch":102},
 *   "wet2Walk":{"name":"Step_MudHeavy","volume":90,"pitch":95},
 *   "wet2Dash":{"name":"Step_MudHeavy","volume":95,"pitch":100}
 * }
 *
 * ───────────────
 * PLUGIN COMMANDS
 * ───────────────
 *   Footsteps on
 *   Footsteps off
 *   Footsteps followers on|off
 *   Footsteps reload
 *   Footsteps adapter auto|mv|noq          # weather adapter mode
 *   Footsteps fogWet on|off                # treat fog as "wet"
 *   Footsteps charRegion on|off            # use character.regionId()
 *   Footsteps heavyAt <n>                  # wet heavy threshold (default 4)
 *
 * Map note to disable: <NoFootsteps>
 *
 * @param Enabled By Default
 * @type boolean
 * @default true
 *
 * @param Use Followers
 * @type boolean
 * @default false
 *
 * @param Mute On Vehicles
 * @type boolean
 * @default true
 *
 * @param Priority
 * @type select
 * @option region
 * @option terrain
 * @default region
 *
 * @param Use Terrain Fallback
 * @type boolean
 * @default true
 *
 * @param Adapter Mode
 * @type select
 * @option auto
 * @option mv
 * @option noq
 * @desc auto = detect WeatherSystem; mv = force MV; noq = force NoqWeatherCore
 * @default auto
 *
 * @param Treat Fog As Wet
 * @type boolean
 * @default false
 *
 * @param Wet Heavy Threshold
 * @type number
 * @min 1
 * @max 6
 * @default 4
 *
 * @param Use Character.regionId()
 * @type boolean
 * @desc YEP-friendly: read region via player.regionId() instead of $gameMap.regionId(x,y)
 * @default true
 *
 * @param Global Volume %
 * @type number
 * @min 0
 * @max 200
 * @default 100
 *
 * @param Pitch Variance
 * @type number
 * @min 0
 * @max 50
 * @default 4
 *
 * @param Dash Volume +%
 * @type number
 * @min -100
 * @max 200
 * @default 10
 *
 * @param Dash Pitch +/-
 * @type number
 * @min -50
 * @max 50
 * @default 5
 *
 * @param Bush Muffle %
 * @type number
 * @min 0
 * @max 100
 * @default 60
 *
 * @param Default Walk SE
 * @type file
 * @dir audio/se/
 * @default
 *
 * @param Default Dash SE
 * @type file
 * @dir audio/se/
 * @default
 *
 * @param Default Wet Walk SE
 * @type file
 * @dir audio/se/
 * @default
 *
 * @param Default Wet Dash SE
 * @type file
 * @dir audio/se/
 * @default
 *
 * @param Rules (JSON)
 * @type note
 * @default []
 */
(function(){
  'use strict';

  var PLUGIN = 'Noq_Footsteps';
  var P = PluginManager.parameters(PLUGIN);

  function bool(v,d){ if(v==null||v==='')return d; return String(v).toLowerCase()==='true'; }
  function num(v,d){ var n=Number(v); return isNaN(n)?d:n; }
  function str(v,d){ return (v==null)?d:String(v); }

  var CFG = {
    enabled:          bool(P['Enabled By Default'], true),
    followers:        bool(P['Use Followers'], false),
    muteVehicles:     bool(P['Mute On Vehicles'], true),
    priority:         str(P['Priority'], 'region'),
    useTerrainFB:     bool(P['Use Terrain Fallback'], true),

    adapterMode:      str(P['Adapter Mode'], 'auto'), // auto|mv|noq
    fogAsWet:         bool(P['Treat Fog As Wet'], false),
    wetHeavyThresh:   num(P['Wet Heavy Threshold'], 4),

    useCharRegion:    bool(P['Use Character.regionId()'], true),

    globalVolPct:     num(P['Global Volume %'], 100),
    pitchVar:         num(P['Pitch Variance'], 4),
    dashVolPctAdd:    num(P['Dash Volume +%'], 10),
    dashPitchAdd:     num(P['Dash Pitch +/-'], 5),
    bushMufflePct:    num(P['Bush Muffle %'], 60),

    defWalk:          str(P['Default Walk SE'],''),
    defDash:          str(P['Default Dash SE'],''),
    defWetWalk:       str(P['Default Wet Walk SE'],''),
    defWetDash:       str(P['Default Wet Dash SE'],''),
    rules:            []
  };

  // Parse Rules JSON
  (function parseRules() {
    var raw = P['Rules (JSON)'] || '[]';
    try {
      var arr = JSON.parse(raw);
      if (Array.isArray(arr)) CFG.rules = arr.map(function(r){
        r = r || {};
        function parseSet(s){ return s?String(s).split(',').map(function(n){return Number(n.trim())||0;}).filter(Boolean):[]; }
        return {
          regions:     parseSet(r.regions),
          terrainTags: parseSet(r.terrainTags),
          walk:   r.walk    || null,
          dash:   r.dash    || null,
          wetWalk:r.wetWalk || null,
          wetDash:r.wetDash || null,
          wet2Walk:r.wet2Walk|| null, // heavy wet
          wet2Dash:r.wet2Dash|| null  // heavy wet
        };
      });
    } catch(e) {
      console.error(PLUGIN+': Failed to parse Rules (JSON):', e);
      CFG.rules = [];
    }
  })();

  // Helpers
  function isMapDisabled() {
    var notes = $dataMap && $dataMap.note ? String($dataMap.note) : '';
    return /<NoFootsteps>/i.test(notes);
  }

  // Weather adapter
  function _hasNoqWeather() {
    return (typeof WeatherSystem !== 'undefined') &&
           $gameSystem && $gameSystem._persistentWeather;
  }

  // Returns {wet:boolean, level:0..6, source:'noq'|'mv'|'none'}
  function weatherState() {
    var mode = CFG.adapterMode;
    if (mode === 'auto') {
      if (_hasNoqWeather()) mode = 'noq';
      else mode = 'mv';
    }
    if (mode === 'noq' && _hasNoqWeather()) {
      var s = $gameSystem._persistentWeather;
      var level = (s.rainPower|0);
      var wet = (s.active && (s.active.rain || s.active.storm || (CFG.fogAsWet && s.active.fog)));
      if (s.active && s.active.storm) level = Math.max(level, 6);
      return { wet: !!wet, level: level, source: 'noq' };
    } else if (mode === 'mv') {
      var wt = ($gameScreen.weatherType && $gameScreen.weatherType()) || $gameScreen._weatherType || 'none';
      wt = String(wt||'none').toLowerCase();
      var lvl = (wt === 'storm') ? 6 : (wt === 'rain' ? 3 : (wt === 'snow' ? 2 : 0));
      var wet = (wt === 'rain' || wt === 'storm' || (CFG.fogAsWet && wt === 'snow')); // MV has 'snow' but no 'fog'
      return { wet: wet, level: lvl, source: 'mv' };
    }
    return { wet:false, level:0, source:'none' };
  }

  function pickRuleFor(x,y,ch) {
    var rid, tag;
    if (CFG.useCharRegion && ch && typeof ch.regionId === 'function') rid = ch.regionId();
    else rid = $gameMap.regionId(x, y) || 0;
    tag = $gameMap.terrainTag(x, y) || 0;

    function match(r) {
      var byRegion = r.regions && r.regions.length && r.regions.indexOf(rid) >= 0;
      var byTag    = r.terrainTags && r.terrainTags.length && r.terrainTags.indexOf(tag) >= 0;
      if (CFG.priority === 'region') {
        if (byRegion) return 'region';
        if (!byRegion && byTag && CFG.useTerrainFB) return 'terrain';
      } else {
        if (byTag) return 'terrain';
        if (!byTag && byRegion) return 'region';
      }
      return null;
    }

    for (var i=0;i<CFG.rules.length;i++){
      var r = CFG.rules[i];
      if (match(r)) return r;
    }
    return null;
  }

  function chooseSeSet(rule, dashing, wetInfo) {
    var wet = wetInfo.wet, lvl = wetInfo.level;
    if (rule) {
      if (wet) {
        // Heavy-wet first (>= threshold), else light-wet
        if (lvl >= CFG.wetHeavyThresh) {
          if (dashing && rule.wet2Dash && rule.wet2Dash.name) return rule.wet2Dash;
          if (!dashing && rule.wet2Walk && rule.wet2Walk.name) return rule.wet2Walk;
        }
        if (dashing && rule.wetDash && rule.wetDash.name) return rule.wetDash;
        if (!dashing && rule.wetWalk && rule.wetWalk.name) return rule.wetWalk;
      }
      if (dashing && rule.dash && rule.dash.name) return rule.dash;
      if (!dashing && rule.walk && rule.walk.name) return rule.walk;
    }
    // Fallbacks
    if (wet) {
      if (dashing && CFG.defWetDash) return {name:CFG.defWetDash, volume:90, pitch:100};
      if (!dashing && CFG.defWetWalk) return {name:CFG.defWetWalk, volume:90, pitch:100};
    }
    if (dashing && CFG.defDash) return {name:CFG.defDash, volume:90, pitch:100};
    if (!dashing && CFG.defWalk) return {name:CFG.defWalk, volume:90, pitch:100};
    return null;
  }

  function playStepForChar(ch) {
    if (!CFG.enabled) return;
    if (isMapDisabled()) return;
    if (!(ch instanceof Game_Player) && !(ch instanceof Game_Follower)) return;
    if (CFG.muteVehicles && ch instanceof Game_Player && $gamePlayer.isInVehicle()) return;

    var x = ch.x, y = ch.y;
    var wetInfo = weatherState();
    var dashing = (ch instanceof Game_Player) ? $gamePlayer.isDashing() : $gamePlayer.isDashing();

    var rule = pickRuleFor(x, y, ch);
    var se = chooseSeSet(rule, dashing, wetInfo);
    if (!se || !se.name) return;

    var vol = Number(se.volume || 90);
    var pit = Number(se.pitch  || 100);

    // Global volume %
    vol = Math.max(0, Math.round(vol * (CFG.globalVolPct/100)));

    // Dash shaping if not a dedicated dash variant
    var hasDedicatedDash = rule && ((wetInfo.wet && ((wetInfo.level>=CFG.wetHeavyThresh && rule.wet2Dash && rule.wet2Dash.name) || (rule.wetDash && rule.wetDash.name)))
                                  || (!wetInfo.wet && rule.dash && rule.dash.name));
    if (dashing && !hasDedicatedDash) {
      vol = Math.max(0, Math.round(vol * (1 + CFG.dashVolPctAdd/100)));
      pit = pit + CFG.dashPitchAdd;
    }

    // Bush muffle
    if (ch.isOnBush && ch.isOnBush()) {
      vol = Math.max(0, Math.round(vol * (CFG.bushMufflePct/100)));
    }

    // Pitch variance
    if (CFG.pitchVar > 0) {
      var delta = Math.floor(Math.random()*(CFG.pitchVar*2+1)) - CFG.pitchVar;
      pit = Math.max(50, Math.min(150, pit + delta));
    }

    AudioManager.playSe({name:se.name, volume:vol, pitch:pit, pan:0});
  }

  // Hooks
  var _GP_increaseSteps = Game_Player.prototype.increaseSteps;
  Game_Player.prototype.increaseSteps = function() {
    _GP_increaseSteps.call(this);
    playStepForChar(this);
  };

  var _GF_increaseSteps = Game_Follower.prototype.increaseSteps;
  Game_Follower.prototype.increaseSteps = function() {
    _GF_increaseSteps.call(this);
    if (CFG.followers) playStepForChar(this);
  };

  // Plugin Commands
  var _GI_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(cmd, args) {
    _GI_pluginCommand.call(this, cmd, args);
    if (String(cmd).toLowerCase() !== 'footsteps') return;

    var sub = (args[0]||'').toLowerCase();
    if (sub === 'on') {
      CFG.enabled = true;
    } else if (sub === 'off') {
      CFG.enabled = false;
    } else if (sub === 'followers') {
      CFG.followers = ((args[1]||'').toLowerCase()==='on');
    } else if (sub === 'reload') {
      var raw = P['Rules (JSON)'] || '[]';
      try { CFG.rules = JSON.parse(raw) || []; } catch(e){ console.error(PLUGIN+': reload failed:', e); }
    } else if (sub === 'adapter') {
      var m = (args[1]||'auto').toLowerCase();
      if (m==='auto'||m==='mv'||m==='noq') CFG.adapterMode = m;
    } else if (sub === 'fogwet') {
      CFG.fogAsWet = ((args[1]||'off').toLowerCase()==='on');
    } else if (sub === 'charregion') {
      CFG.useCharRegion = ((args[1]||'on').toLowerCase()==='on');
    } else if (sub === 'heavyat') {
      var n = Number(args[1]||4); if (!isNaN(n)) CFG.wetHeavyThresh = Math.max(1, Math.min(6, n|0));
    }
  };

})();


/* ==== Noq_TalkSFX v1.4 freeze-guard (paste under TalkSFX) ==== */
(function() {
  'use strict';

  // --- tiny cache/prewarm for SE buffers (MV-safe) ---
  function _prewarmSe(name) {
    if (!name) return;
    try {
      var key = 'se:' + name;
      AudioManager._staticBuffers = AudioManager._staticBuffers || {};
      if (!AudioManager._staticBuffers[key]) {
        AudioManager._staticBuffers[key] = AudioManager.createBuffer('se', name);
      }
    } catch(e) { /* ignore */ }
  }

  // Async, non-blocking SE play (next tick)
  function _safePlaySe(se) {
    if (!se || !se.name) return;
    var payload = {
      name: se.name,
      volume: se.volume || 90,
      pitch:  se.pitch  || 100,
      pan:    se.pan    || 0
    };
    // schedule off the render tick to avoid single-frame stalls
    setTimeout(function(){ try { AudioManager.playSe(payload); } catch(e) {} }, 0);
  }

  // Prewarm current defaults whenever a Window_Message is (re)initialized
  var _WM_initialize_v14 = Window_Message.prototype.initialize;
  Window_Message.prototype.initialize = function() {
    _WM_initialize_v14.call(this);
    var cfg = ($gameSystem && $gameSystem.noqTalkSfx) ? $gameSystem.noqTalkSfx() : null;
    if (cfg) {
      _prewarmSe(cfg.voice && cfg.voice.name);
      _prewarmSe(cfg.endSe && cfg.endSe.name);
    }
  };

  // Also prewarm at the start of each message, in case \VO/\ENDSE changed them
  var _WM_startMessage_v14 = Window_Message.prototype.startMessage;
  Window_Message.prototype.startMessage = function() {
    _WM_startMessage_v14.call(this);
    var cfg = (this._noqTalkCfg || ($gameSystem && $gameSystem.noqTalkSfx && $gameSystem.noqTalkSfx())) || null;
    if (cfg) {
      _prewarmSe(cfg.voice && cfg.voice.name);
      _prewarmSe(cfg.endSe && cfg.endSe.name);
    }
  };

  // Replace end chime callsites with async play
  var _WM_startPause_v14 = Window_Message.prototype.startPause;
  Window_Message.prototype.startPause = function() {
    _WM_startPause_v14.call(this);
    var cfg = (this._noqTalkCfg || ($gameSystem && $gameSystem.noqTalkSfx && $gameSystem.noqTalkSfx())) || null;
    if (!cfg || !cfg.endOnPagePause) return;
    if (!this.visible || this.openness < 255) return;
    if (!$gameMessage || !$gameMessage.isBusy()) return;

    this._noqEndChimeStamp = this._noqEndChimeStamp || -1;
    if (this._noqEndChimeStamp === Graphics.frameCount) return;
    this._noqEndChimeStamp = Graphics.frameCount;

    var se = cfg.endSe || {};
    _prewarmSe(se.name);
    _safePlaySe(se);
  };

  // If you enabled "Beep On Terminate", make that async too
  var _WM_terminateMessage_v14 = Window_Message.prototype.terminateMessage;
  Window_Message.prototype.terminateMessage = function() {
    var cfg = (this._noqTalkCfg || ($gameSystem && $gameSystem.noqTalkSfx && $gameSystem.noqTalkSfx())) || null;
    if (cfg && cfg.endOnTerminate) {
      var se = cfg.endSe || {};
      _prewarmSe(se.name);
      _safePlaySe(se);
    }
    _WM_terminateMessage_v14.call(this);
  };

  // Make per-character bleeps async without changing your intervals/filters
  var _WB_processNormalCharacter_v14 = Window_Base.prototype.processNormalCharacter;
  Window_Base.prototype.processNormalCharacter = function(textState) {
    var oldIndex = textState.index;
    _WB_processNormalCharacter_v14.call(this, textState);

    if (!(this instanceof Window_Message)) return;
    var cfg = this._noqTalkCfg || ($gameSystem && $gameSystem.noqTalkSfx && $gameSystem.noqTalkSfx());
    if (!cfg || !cfg.enabled) return;
    if (cfg.muteWhenFast && this._showFast) return;
    if (!this.visible || this.openness < 255) return;

    var c = textState.text[oldIndex];
    if (!c) return;
    if (cfg.skipSpaces && c === ' ') return;
    if (cfg.lettersOnly && !/[A-Za-z0-9À-ž]/.test(c)) return;

    this._noqCharCounter = (this._noqCharCounter || 0) + 1;
    if ((this._noqCharCounter % Math.max(1, cfg.voice.interval)) !== 0) return;

    var pitch = (cfg.voice.pitch || 100);
    if (cfg.voice.pitchVar > 0) {
      var d = Math.floor(Math.random()*(cfg.voice.pitchVar*2 + 1)) - cfg.voice.pitchVar;
      pitch = Math.max(50, Math.min(150, pitch + d));
    }
    var se = { name: cfg.voice.name || '', volume: cfg.voice.volume || 90, pitch: pitch, pan:0 };
    _prewarmSe(se.name);
    _safePlaySe(se);
  };

})();