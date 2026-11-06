/*:
 * @target MV
 * @plugindesc v1.4 Day/Night Auto-Pause+ — freeze time during messages/shops with per-event control. NEW: slow-motion mode for paused targets. (ES5)
 * @author Noq
 *
 * @help
 * When a message/choice/input is open, or while inside Scene_Shop:
 *   - DayNight clock/tint freezes via DayNightTint.freeze(true)
 *   - By default, ALL events freeze (movement + parallel) so they resume from the same step.
 *   - You can whitelist events per-page with <NoPause>, <NoPauseMove>, <NoPauseParallel>
 *   - NEW: choose Paused Movement Mode = "slowmo" to make frozen targets move slowly instead.
 *
 * Notetags / Page Comments (put on the ACTIVE page; works in event note OR top comments)
 *   <NoPause>            # Movement & parallel continue at full speed during pause
 *   <NoPauseMove>        # Movement continues; parallel is still controlled by policy
 *   <NoPauseParallel>    # Parallel continues; movement is still controlled by policy
 *
 * Policy toggle:
 *   - Default Freeze Policy = freezeAll           (freeze/slow everything unless whitelisted)
 *   - Default Freeze Policy = freezeOnlyTagged    (only pages tagged <Pause>/<PauseMove>/<PauseParallel> are affected)
 *     In this mode, add one of: <Pause>, <PauseMove>, <PauseParallel> on pages you want affected.
 *
 * Plugin Commands:
 *   DNPause on|off|toggle
 *
 * Place BELOW your DayNight Core and (optionally) EventNames Simple V5.
 *
 * @param Auto Pause During Messages
 * @type boolean
 * @default true
 *
 * @param Also Pause During Shops
 * @type boolean
 * @default true
 *
 * @param Default Freeze Policy
 * @type select
 * @option freezeAll
 * @option freezeOnlyTagged
 * @default freezeAll
 *
 * @param Paused Movement Mode
 * @type select
 * @option freeze
 * @option slowmo
 * @default freeze
 * @desc When paused, should affected events be fully frozen or move in slow motion?
 *
 * @param SlowMo Speed Multiplier
 * @type number
 * @decimals 2
 * @min 0.05
 * @max 1
 * @default 0.25
 * @desc 0.25 = 25% speed. Applied to affected events' per-frame movement distance.
 *
 * @param SlowMo Throttle Movement Start
 * @type boolean
 * @default true
 * @desc Also throttles how often self-movement starts (fewer new steps while paused).
 *
 * @param SlowMo Throttle Parallels
 * @type boolean
 * @default true
 * @desc Runs affected Parallel pages less frequently while paused.
 *
 * @param Pause EventNames Scheduler
 * @type boolean
 * @default true
 * @desc Skip EventNames V5 scheduler while paused (prevents <ActiveHours> flips mid-convo/shop).
 *
 * @param Fallback Pause Switch ID
 * @type number
 * @default 0
 *
 * @param Fallback Pause Variable ID
 * @type number
 * @default 0
 */

var Noq = Noq || {};
(function(){
  "use strict";
  var PN = "Noq_DN_AutoPausePlus";
  var P = PluginManager.parameters(PN);
  function b(x,d){ return String(x==null?d:x).toLowerCase()==="true"; }

  var AUTO_MSG    = b(P["Auto Pause During Messages"], true);
  var PAUSE_SHOP  = b(P["Also Pause During Shops"], true);
  var POLICY      = String(P["Default Freeze Policy"] || "freezeAll");
  var STOP_ALL_BY_DEFAULT = (POLICY !== "freezeOnlyTagged");

  var MODE        = String(P["Paused Movement Mode"] || "freeze").toLowerCase(); // 'freeze' | 'slowmo'
  var SLOW_MULT   = Math.max(0.05, Math.min(1, Number(P["SlowMo Speed Multiplier"] || 0.25)));
  var SLOW_THR_MOV= b(P["SlowMo Throttle Movement Start"], true);
  var SLOW_THR_PAR= b(P["SlowMo Throttle Parallels"], true);

  var PAUSE_SCHED = b(P["Pause EventNames Scheduler"], true);
  var SW_ID       = Math.max(0, (Number(P["Fallback Pause Switch ID"]||0)|0));
  var VAR_ID      = Math.max(0, (Number(P["Fallback Pause Variable ID"]||0)|0));

  Noq.DNAutoPause = Noq.DNAutoPause || { _active:false, _forced:null, _savedVar:null };

  function dnFreeze(on){
    try{
      if (typeof DayNightTint!=="undefined" && DayNightTint.freeze) DayNightTint.freeze(!!on);
    }catch(e){}
    if (SW_ID>0 && $gameSwitches) $gameSwitches.setValue(SW_ID, !!on);
    if (VAR_ID>0 && $gameVariables){
      if (on){
        if (Noq.DNAutoPause._savedVar===null) Noq.DNAutoPause._savedVar = $gameVariables.value(VAR_ID);
        $gameVariables.setValue(VAR_ID, 0);
      } else {
        if (Noq.DNAutoPause._savedVar!==null){
          $gameVariables.setValue(VAR_ID, Noq.DNAutoPause._savedVar);
          Noq.DNAutoPause._savedVar = null;
        }
      }
    }
  }

  function isMessageBusy(){ try{ return $gameMessage && $gameMessage.isBusy(); }catch(e){ return false; } }
  function inShopScene(scene){ return PAUSE_SHOP && scene && typeof Scene_Shop!=="undefined" && (scene instanceof Scene_Shop); }
  function computeAutoActive(scene){ if (!AUTO_MSG && !PAUSE_SHOP) return false; return (AUTO_MSG && isMessageBusy()) || inShopScene(scene); }

  function setActive(on){
    on = !!on;
    if (Noq.DNAutoPause._active === on) return;
    Noq.DNAutoPause._active = on;
    dnFreeze(on);
  }
  Noq.DNAutoPause.isActive = function(){ return !!this._active; };

  var _Scene_Base_update = Scene_Base.prototype.update;
  Scene_Base.prototype.update = function(){
    _Scene_Base_update.call(this);
    var desired = (Noq.DNAutoPause._forced!==null) ? !!Noq.DNAutoPause._forced : computeAutoActive(this);
    setActive(desired);
  };

  var _PC = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(cmd, args){
    _PC.call(this, cmd, args);
    cmd = String(cmd||"").toLowerCase();
    if (cmd === "dnpause"){
      var sub = String(args[0]||"").toLowerCase();
      if (sub==="on") Noq.DNAutoPause._forced = true;
      else if (sub==="off") Noq.DNAutoPause._forced = false;
      else if (sub==="toggle") Noq.DNAutoPause._forced = !Noq.DNAutoPause._forced;
    }
  };

  // ──────────────────────────────────────────
  // Per-event tags from note + page comments.
  function readPageNotes(ev){
    var base = String(ev.event().note||"");
    var page = ev.page();
    if (!page || !page.list) return base;
    var s = base;
    for (var i=0;i<page.list.length;i++){
      var c = page.list[i];
      if (c && (c.code===108 || c.code===408) && c.parameters && c.parameters.length>0)
        s += " " + c.parameters.join(" ");
    }
    return s;
  }

  var _GE_setupPage = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function(){
    _GE_setupPage.call(this);
    var notes = readPageNotes(this).toLowerCase();
    // Base behavior flags: true = MOVES/EXECUTES during pause
    this._noPauseMove     = /<nopause\b>|<nopausemove\b>/.test(notes);
    this._noPauseParallel = /<nopause\b>|<nopauseparallel\b>/.test(notes);

    // Optional opt-in freezing mode: only pages explicitly tagged <Pause...> are affected
    if (!STOP_ALL_BY_DEFAULT){
      var willPause = /<pause\b>|<pausemove\b>/.test(notes);
      var willPausePar = /<pause\b>|<pauseparallel\b>/.test(notes);
      // Invert: by default 'noPause' = true; only explicit <Pause> disables it
      this._noPauseMove     = !willPause;
      this._noPauseParallel = !willPausePar;
    }

    // Reset slow counters (so routes never restart)
    this._noqSlowMoveTick = 0;
    this._noqSlowParTick  = 0;
  };

  function affectedMove(ev){
    // True when event SHOULD be affected by pause (i.e., not whitelisted for movement)
    return !ev._noPauseMove;
  }
  function affectedParallel(ev){
    return !ev._noPauseParallel;
  }

  // Slow-mo cadence helper
  function slowStepInterval(){
    // 0.25 -> 4, 0.5 -> 2, 1 -> 1, etc.
    return Math.max(1, Math.round(1 / SLOW_MULT));
  }

  // Freeze / throttle self-movement (start logic)
  var _GE_updateSelfMovement = Game_Event.prototype.updateSelfMovement;
  Game_Event.prototype.updateSelfMovement = function(){
    if (Noq.DNAutoPause.isActive() && affectedMove(this)){
      if (MODE === "freeze"){
        return; // fully frozen; route index preserved
      } else if (MODE === "slowmo" && SLOW_THR_MOV){
        this._noqSlowMoveTick = (this._noqSlowMoveTick|0) + 1;
        if ((this._noqSlowMoveTick % slowStepInterval()) !== 0) return;
      }
    } else {
      this._noqSlowMoveTick = 0; // reset when not pausing or not affected
    }
    _GE_updateSelfMovement.call(this);
  };

  // Slow movement distance per frame (visual "speed" scaling) — only for Game_Event
  var _GE_distancePerFrame = Game_Event.prototype.distancePerFrame;
  if (!_GE_distancePerFrame){ // MV defines it on CharacterBase; ensure safe call path
    _GE_distancePerFrame = function(){
      return Game_CharacterBase.prototype.distancePerFrame.call(this);
    };
  }
  Game_Event.prototype.distancePerFrame = function(){
    var d = Game_CharacterBase.prototype.distancePerFrame.call(this);
    if (Noq.DNAutoPause.isActive() && affectedMove(this) && MODE === "slowmo"){
      return d * SLOW_MULT; // smooth per-frame slowdown without altering route indices
    }
    return d;
  };

  // Freeze/throttle parallel processing
  var _GE_updateParallel = Game_Event.prototype.updateParallel;
  Game_Event.prototype.updateParallel = function(){
    if (Noq.DNAutoPause.isActive() && affectedParallel(this)){
      if (MODE === "freeze"){
        return; // interpreter stays intact; resumes later
      } else if (MODE === "slowmo" && SLOW_THR_PAR){
        this._noqSlowParTick = (this._noqSlowParTick|0) + 1;
        if ((this._noqSlowParTick % slowStepInterval()) !== 0) return;
      }
    } else {
      this._noqSlowParTick = 0;
    }
    _GE_updateParallel.call(this);
  };

  // Optional: Pause EventNames V5 scheduler during pause
  var _maybeWrap = function(){
    try{
      if (!PAUSE_SCHED) return;
      var proto = Spriteset_Map.prototype;
      if (proto && proto._runSchedulerPass && !proto._NoqWrappedScheduler){
        var _orig = proto._runSchedulerPass;
        proto._runSchedulerPass = function(){
          if (Noq.DNAutoPause.isActive()) return;
          _orig.call(this);
        };
        proto._NoqWrappedScheduler = true;
      }
    }catch(e){}
  };
  var _SM_create = Scene_Map.prototype.createDisplayObjects;
  Scene_Map.prototype.createDisplayObjects = function(){
    _SM_create.call(this);
    _maybeWrap();
  };

  // ──────────────────────────────────────────
  // OverworldChatter Integration
  //
  // AUTO_PAUSE_CHATTER = true  → all chatter bubbles freeze when DNPause is active
  // AUTO_PAUSE_CHATTER = false → only events tagged <FreezeChatter> freeze
  // HIDE_WHILE_FROZEN          → hide the bubble sprite during freeze (default: false)
  //
  // Notetag: <FreezeChatter>  (event note or page comment)
  //   Forces that event's chatter to freeze whenever Noq.DNAutoPause is active.
  //   Useful when AUTO_PAUSE_CHATTER is false and you want per-event control.
  // ──────────────────────────────────────────

  var AUTO_PAUSE_CHATTER = true;
  var HIDE_WHILE_FROZEN  = true;

  // Notetag: parse <FreezeChatter> on setupPage
  var _GE_setupPage_owc = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function(){
    _GE_setupPage_owc.call(this);
    this._freezeChatter = /<FreezeChatter\b>/i.test(readPageNotes(this));
  };

  // Hook updateOverworldChatter
  if (Scene_Map.prototype.updateOverworldChatter){
    var _updateOWC = Scene_Map.prototype.updateOverworldChatter;
    Scene_Map.prototype.updateOverworldChatter = function(){
      var isPaused = Noq.DNAutoPause.isActive();

      if (window.OverworldChatter){
        var list = OverworldChatter._data;
        for (var i = 0; i < list.length; i++){
          var d = list[i];
          if (!d) continue;

          var ev = (d.eventId > 0 && $gameMap) ? $gameMap.event(d.eventId) : null;
          var shouldFreeze = isPaused && (AUTO_PAUSE_CHATTER || (ev && ev._freezeChatter));

          if (shouldFreeze){
            // Pre-decrement so the +1 inside the original nets to zero
            if (d.fadeState === "hold") d.timer--;
            d._owcFrozen = true;
            if (HIDE_WHILE_FROZEN && d.sprite) d.sprite.visible = false;
          } else if (d._owcFrozen){
            // Just unpaused — restore sprite if it was hidden
            d._owcFrozen = false;
            if (HIDE_WHILE_FROZEN && d.sprite) d.sprite.visible = true;
          }
        }
      }

      _updateOWC.call(this);
    };
  }

})();