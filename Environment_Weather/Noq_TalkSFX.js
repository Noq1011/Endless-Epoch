/*:
 * @target MV
 * @plugindesc v1.0 Talk SFX — character bleeps while text draws + end-of-line/page chime. ES5, YEP-compatible.
 * @author Noq
 *
 * @help
 * Plays a short SE as characters print in the message window, classic retro style.
 * Also plays an optional "end" SE when the message hits a pause (end of page) or
 * when the message terminates without a pause.
 *
 * ── Control Codes (inside Show Text) ───────────────────────────────────────────
 *   \VO[name,pitch,volume,interval,pitchVar]
 *       Example: \VO[Cursor2,110,60,2,10]
 *       Sets a temporary voice just for the current message window.
 *
 *   \VOR
 *       Resets voice to the global/default settings for the current window.
 *
 *   \ENDSE[name,pitch,volume]
 *       Sets the "end-of-text" SE for the current window.
 *       Example: \ENDSE[Decision2,100,80]
 *
 * (You can still use normal SE control anywhere via \SE[...] if you want)
 *
 * ── Plugin Commands (RPG Maker MV) ─────────────────────────────────────────────
 *   TalkSFX on
 *   TalkSFX off
 *
 *   TalkSFX set <name> <pitch> <volume> <interval> <pitchVar>
 *       e.g. TalkSFX set Cursor2 110 60 2 10
 *
 *   TalkSFX end <name> <pitch> <volume>
 *       e.g. TalkSFX end Decision2 100 80
 *
 *   TalkSFX lettersOnly on|off
 *   TalkSFX skipSpaces on|off
 *   TalkSFX muteWhenFast on|off
 *   TalkSFX pageEnd on|off        # play end SE when page pauses (default on)
 *   TalkSFX termEnd on|off        # play end SE when message autocloses (default off)
 *
 * ── Notes ─────────────────────────────────────────────────────────────────────
 * • Only the message window bleeps (not menus/choices).
 * • Compatible with YEP_MessageCore (aliases only).
 * • Keep SEs short; use Interval > 1 for busier text.
 *
 * ── Defaults can be changed in Plugin Params below. ────────────────────────────
 *
 * @param Enabled By Default
 * @type boolean
 * @default true
 *
 * @param Default SE Name
 * @type file
 * @dir audio/se/
 * @default Cursor2
 *
 * @param Default SE Volume
 * @type number
 * @min 0
 * @max 100
 * @default 60
 *
 * @param Default SE Pitch
 * @type number
 * @min 50
 * @max 150
 * @default 105
 *
 * @param Interval (chars)
 * @type number
 * @min 1
 * @max 12
 * @default 2
 *
 * @param Pitch Variance
 * @type number
 * @min 0
 * @max 50
 * @default 10
 *
 * @param Letters Only
 * @type boolean
 * @default true
 *
 * @param Skip Spaces
 * @type boolean
 * @default true
 *
 * @param Mute When Fast
 * @type boolean
 * @default true
 *
 * @param End SE Name
 * @type file
 * @dir audio/se/
 * @default Decision2
 *
 * @param End SE Volume
 * @type number
 * @min 0
 * @max 100
 * @default 80
 *
 * @param End SE Pitch
 * @type number
 * @min 50
 * @max 150
 * @default 100
 *
 * @param Beep On Page Pause
 * @type boolean
 * @default true
 *
 * @param Beep On Terminate
 * @type boolean
 * @default false
 */
(function() {
  'use strict';

  var PLUGIN_NAME = 'Noq_TalkSFX';

  // -----------------------------
  // Params → Config (Game_System)
  // -----------------------------
  var params = PluginManager.parameters(PLUGIN_NAME);

  function bool(p, d) {
    if (p == null || p === '') return d;
    return String(p).toLowerCase() === 'true';
  }
  function num(p, d) {
    var n = Number(p);
    return isNaN(n) ? d : n;
  }
  function str(p, d) {
    return (p == null) ? d : String(p);
  }

  var DefaultConfig = {
    enabled:               bool(params['Enabled By Default'], true),
    voice: {
      name:                str(params['Default SE Name'], 'Cursor2'),
      volume:              num(params['Default SE Volume'], 60),
      pitch:               num(params['Default SE Pitch'], 105),
      pan:                 0,
      interval:            num(params['Interval (chars)'], 2),
      pitchVar:            num(params['Pitch Variance'], 10)
    },
    lettersOnly:           bool(params['Letters Only'], true),
    skipSpaces:            bool(params['Skip Spaces'], true),
    muteWhenFast:          bool(params['Mute When Fast'], true),
    endSe: {
      name:                str(params['End SE Name'], 'Decision2'),
      volume:              num(params['End SE Volume'], 80),
      pitch:               num(params['End SE Pitch'], 100),
      pan:                 0
    },
    endOnPagePause:        bool(params['Beep On Page Pause'], true),
    endOnTerminate:        bool(params['Beep On Terminate'], false)
  };

  // Clone helper
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }

  // Extend Game_System to store global config (saves with game)
  var _Game_System_initialize = Game_System.prototype.initialize;
  Game_System.prototype.initialize = function() {
    _Game_System_initialize.call(this);
    if (!this._noqTalkSfx) this._noqTalkSfx = deepClone(DefaultConfig);
  };
  Game_System.prototype.noqTalkSfx = function() {
    if (!this._noqTalkSfx) this._noqTalkSfx = deepClone(DefaultConfig);
    return this._noqTalkSfx;
  };

  // -----------------------------
  // Plugin Commands (MV)
  // -----------------------------
  var _GI_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(cmd, args) {
    _GI_pluginCommand.call(this, cmd, args);
    if (String(cmd).toLowerCase() !== 'talksfx') return;

    var cfg = $gameSystem.noqTalkSfx();
    var sub = (args[0] || '').toLowerCase();

    if (sub === 'on') {
      cfg.enabled = true;
    } else if (sub === 'off') {
      cfg.enabled = false;
    } else if (sub === 'set') {
      // name pitch volume interval pitchVar
      if (args.length >= 6) {
        cfg.voice.name     = args[1];
        cfg.voice.pitch    = Number(args[2]) || cfg.voice.pitch;
        cfg.voice.volume   = Number(args[3]) || cfg.voice.volume;
        cfg.voice.interval = Math.max(1, Number(args[4]) || cfg.voice.interval);
        cfg.voice.pitchVar = Math.max(0, Number(args[5]) || cfg.voice.pitchVar);
      }
    } else if (sub === 'end') {
      // name pitch volume
      if (args.length >= 4) {
        cfg.endSe.name   = args[1];
        cfg.endSe.pitch  = Number(args[2]) || cfg.endSe.pitch;
        cfg.endSe.volume = Number(args[3]) || cfg.endSe.volume;
      }
    } else if (sub === 'lettersonly') {
      cfg.lettersOnly = (args[1] || '').toLowerCase() === 'on';
    } else if (sub === 'skipspaces') {
      cfg.skipSpaces = (args[1] || '').toLowerCase() === 'on';
    } else if (sub === 'mutewhenfast') {
      cfg.muteWhenFast = (args[1] || '').toLowerCase() === 'on';
    } else if (sub === 'pageend') {
      cfg.endOnPagePause = (args[1] || '').toLowerCase() === 'on';
    } else if (sub === 'termend') {
      cfg.endOnTerminate = (args[1] || '').toLowerCase() === 'on';
    }
  };

  // ----------------------------------------
  // Window_Message: per-window runtime state
  // ----------------------------------------
  var _WM_initialize = Window_Message.prototype.initialize;
  Window_Message.prototype.initialize = function() {
    _WM_initialize.call(this);
    this._noqTalkCfg = deepClone($gameSystem.noqTalkSfx());
    this._noqCharCounter = 0;
    this._noqFrameStamp = -9999;  // prevent same-frame double end SE
  };

  // Reset per message start (so \VO affects only this one if used)
  var _WM_startMessage = Window_Message.prototype.startMessage;
  Window_Message.prototype.startMessage = function() {
    // refresh base from system each new message (unless overridden by \VO)
    this._noqTalkCfg = deepClone($gameSystem.noqTalkSfx());
    this._noqCharCounter = 0;
    _WM_startMessage.call(this);
  };

  // Utility: parse array inside control code [..]
  function _parseList(raw, min, max) {
    var s = String(raw || '');
    var inside = s.replace(/^\s*\[/, '').replace(/\]\s*$/, '');
    var parts = inside.split(',').map(function(t){return t.trim();});
    if (min != null && parts.length < min) return null;
    if (max != null && parts.length > max) parts = parts.slice(0, max);
    return parts;
  }

  // Handle \VO and \ENDSE control codes
  var _WM_processEscapeCharacter = Window_Message.prototype.processEscapeCharacter;
  Window_Message.prototype.processEscapeCharacter = function(code, textState) {
    if (code === 'VO') {
      // [name,pitch,volume,interval,pitchVar]
      var list = _parseList(this.obtainEscapeParamString(textState), 1, 5);
      if (list) {
        if (!this._noqTalkCfg) this._noqTalkCfg = deepClone($gameSystem.noqTalkSfx());
        this._noqTalkCfg.voice.name     = list[0] || this._noqTalkCfg.voice.name;
        if (list.length >= 2) this._noqTalkCfg.voice.pitch    = Number(list[1]) || this._noqTalkCfg.voice.pitch;
        if (list.length >= 3) this._noqTalkCfg.voice.volume   = Number(list[2]) || this._noqTalkCfg.voice.volume;
        if (list.length >= 4) this._noqTalkCfg.voice.interval = Math.max(1, Number(list[3]) || this._noqTalkCfg.voice.interval);
        if (list.length >= 5) this._noqTalkCfg.voice.pitchVar = Math.max(0, Number(list[4]) || this._noqTalkCfg.voice.pitchVar);
      }
      return;
    } else if (code === 'VOR') {
      // reset to system config
      this._noqTalkCfg = deepClone($gameSystem.noqTalkSfx());
      return;
    } else if (code === 'ENDSE') {
      // [name,pitch,volume]
      var list2 = _parseList(this.obtainEscapeParamString(textState), 1, 3);
      if (list2) {
        this._noqTalkCfg.endSe.name   = list2[0] || this._noqTalkCfg.endSe.name;
        if (list2.length >= 2) this._noqTalkCfg.endSe.pitch  = Number(list2[1]) || this._noqTalkCfg.endSe.pitch;
        if (list2.length >= 3) this._noqTalkCfg.endSe.volume = Number(list2[2]) || this._noqTalkCfg.endSe.volume;
      }
      return;
    }
    _WM_processEscapeCharacter.call(this, code, textState);
  };

  // Helper to get raw [ ... ] after a code, respecting commas/spaces
  Window_Base.prototype.obtainEscapeParamString = function(textState) {
    var regExp = /^\[([^\]]*)\]/;
    var arr = regExp.exec(textState.text.slice(textState.index));
    if (arr) {
      textState.index += arr[0].length;
      return arr[0]; // includes brackets
    } else {
      return '[]';
    }
  };

  // Play per-character bleep by aliasing Window_Base.processNormalCharacter,
  // but only when running inside a Window_Message instance.
  var _WB_processNormalCharacter = Window_Base.prototype.processNormalCharacter;
  Window_Base.prototype.processNormalCharacter = function(textState) {
    // Capture current index to read the char AFTER the base method advances
    var oldIndex = textState.index;
    _WB_processNormalCharacter.call(this, textState);

    if (!(this instanceof Window_Message)) return;

    var cfg = this._noqTalkCfg || $gameSystem.noqTalkSfx();
    if (!cfg.enabled) return;
    if (cfg.muteWhenFast && this._showFast) return;

    var c = textState.text[oldIndex]; // the character just processed
    if (!c) return;

    if (cfg.skipSpaces && c === ' ') return;
    if (cfg.lettersOnly && !/[A-Za-z0-9À-ž]/.test(c)) return;

    this._noqCharCounter = (this._noqCharCounter || 0) + 1;
    if ((this._noqCharCounter % Math.max(1, cfg.voice.interval)) !== 0) return;

    var se = {
      name: cfg.voice.name || '',
      volume: cfg.voice.volume || 90,
      pitch: (cfg.voice.pitch || 100),
      pan: 0
    };
    if (cfg.voice.pitchVar > 0) {
      var delta = Math.floor(Math.random() * (cfg.voice.pitchVar * 2 + 1)) - cfg.voice.pitchVar;
      se.pitch = Math.max(50, Math.min(150, se.pitch + delta));
    }
    if (se.name) AudioManager.playSe(se);
  };

  // End chime on page pause (classic Zelda-style) &/or on terminate
  var _WM_startPause = Window_Message.prototype.startPause;
  Window_Message.prototype.startPause = function() {
    _WM_startPause.call(this);
    var cfg = this._noqTalkCfg || $gameSystem.noqTalkSfx();
    if (cfg.endOnPagePause) this._noqPlayEndOncePerFrame();
  };

  var _WM_startInput = Window_Message.prototype.startInput;
  Window_Message.prototype.startInput = function() {
    // If choices/number input interrupts right at end, you may or may not want a chime.
    // We'll treat it like a page pause and respect endOnPagePause.
    var cfg = this._noqTalkCfg || $gameSystem.noqTalkSfx();
    if (cfg.endOnPagePause) this._noqPlayEndOncePerFrame();
    return _WM_startInput.call(this);
  };

  var _WM_terminateMessage = Window_Message.prototype.terminateMessage;
  Window_Message.prototype.terminateMessage = function() {
    var cfg = this._noqTalkCfg || $gameSystem.noqTalkSfx();
    if (cfg.endOnTerminate) this._noqPlayEndOncePerFrame();
    _WM_terminateMessage.call(this);
  };

  Window_Message.prototype._noqPlayEndOncePerFrame = function() {
    if (this._noqFrameStamp === Graphics.frameCount) return;
    this._noqFrameStamp = Graphics.frameCount;
    var cfg = this._noqTalkCfg || $gameSystem.noqTalkSfx();
    var se = cfg.endSe || {};
    if (se.name) {
      AudioManager.playSe({
        name: se.name,
        volume: se.volume || 90,
        pitch: se.pitch || 100,
        pan: 0
      });
    }
  };

})();
/* ==== Noq_TalkSFX v1.2 end-chime patch (paste below original plugin) ==== */
(function() {
  'use strict';

  // Track per-message chime state
  var _WM_startMessage_v12 = Window_Message.prototype.startMessage;
  Window_Message.prototype.startMessage = function() {
    this._noqHadMessage = true;
    this._noqChimedThisMsg = false;
    _WM_startMessage_v12.call(this);
  };

  // Intercept ONLY the \! escape code (true end-of-page pause)
  var _WM_processEscapeCharacter_v12 = Window_Message.prototype.processEscapeCharacter;
  Window_Message.prototype.processEscapeCharacter = function(code, textState) {
    if (code === '!') {
      // run default behavior (sets pause, shows pause sign, etc.)
      _WM_processEscapeCharacter_v12.call(this, code, textState);

      var cfg = (this._noqTalkCfg || ($gameSystem.noqTalkSfx && $gameSystem.noqTalkSfx())) || null;
      if (cfg && cfg.endOnPagePause && !this._noqChimedThisMsg &&
          this.visible && this.openness === 255) {
        this._noqChimedThisMsg = true;
        var se = cfg.endSe || {};
        if (se.name) AudioManager.playSe({
          name: se.name, volume: se.volume || 90, pitch: se.pitch || 100, pan: 0
        });
      }
      return; // already handled
    }
    _WM_processEscapeCharacter_v12.call(this, code, textState);
  };

  // Neutralize older hooks that could spam end SE
  Window_Message.prototype._noqPlayEndOncePerFrame = function(){ /* disabled by v1.2 */ };
  var _WM_startPause_v12 = Window_Message.prototype.startPause;
  Window_Message.prototype.startPause = function() { _WM_startPause_v12.call(this); };
  var _WM_startInput_v12 = Window_Message.prototype.startInput;
  Window_Message.prototype.startInput = function() { return _WM_startInput_v12.call(this); };

  // Terminate fallback: only chime if enabled AND we never chimed for this message
  var _WM_terminateMessage_v12 = Window_Message.prototype.terminateMessage;
  Window_Message.prototype.terminateMessage = function() {
    var cfg = (this._noqTalkCfg || ($gameSystem.noqTalkSfx && $gameSystem.noqTalkSfx())) || null;
    if (cfg && cfg.endOnTerminate && !this._noqChimedThisMsg && this._noqHadMessage) {
      var se = cfg.endSe || {};
      if (se.name) AudioManager.playSe({
        name: se.name, volume: se.volume || 90, pitch: se.pitch || 100, pan: 0
      });
    }
    this._noqHadMessage = false;
    this._noqChimedThisMsg = false;
    _WM_terminateMessage_v12.call(this);
  };

  // Light cleanup: if something ever floods SE buffers by name, keep at most 2 copies
  var _Scene_Map_updateMain_v12 = Scene_Map.prototype.updateMain;
  Scene_Map.prototype.updateMain = function() {
    _Scene_Map_updateMain_v12.call(this);
    if (!$gameMessage.isBusy() && AudioManager._seBuffers) {
      var countByName = {};
      for (var i = AudioManager._seBuffers.length - 1; i >= 0; i--) {
        var b = AudioManager._seBuffers[i];
        if (!b || !b._se) continue;
        var nm = b._se.name;
        countByName[nm] = (countByName[nm] || 0) + 1;
        if (countByName[nm] > 2) { try { b.stop(); } catch(e) {} }
      }
    }
  };
})();

/* ==== Noq_TalkSFX v1.3 — page-arrow chime (safe) ==== */
(function() {
  'use strict';

  // Reset per message
  var _WM_startMessage_v13 = Window_Message.prototype.startMessage;
  Window_Message.prototype.startMessage = function() {
    this._noqChimedThisMsg = false;
    this._noqEndChimeStamp = -1;
    _WM_startMessage_v13.call(this);
  };

  // Chime when the pause arrow is shown (i.e., end of page)
  var _WM_startPause_v13 = Window_Message.prototype.startPause;
  Window_Message.prototype.startPause = function() {
    _WM_startPause_v13.call(this);

    var cfg = (this._noqTalkCfg || ($gameSystem.noqTalkSfx && $gameSystem.noqTalkSfx())) || null;
    if (!cfg || !cfg.endOnPagePause) return;          // respect plugin param
    if (this._noqChimedThisMsg) return;               // one-shot per page
    if (!this.visible || this.openness < 255) return; // only when the window is actually open
    if (!$gameMessage || !$gameMessage.isBusy()) return;

    // De-dupe same-frame calls (just in case)
    if (this._noqEndChimeStamp === Graphics.frameCount) return;
    this._noqEndChimeStamp = Graphics.frameCount;
    this._noqChimedThisMsg = true;

    var se = cfg.endSe || {};
    if (se.name) AudioManager.playSe({
      name: se.name,
      volume: se.volume || 90,
      pitch:  se.pitch  || 100,
      pan: 0
    });
  };
})();