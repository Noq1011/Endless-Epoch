/*:
 * @plugindesc v3.4 Note-tag Lights — true additive glow, fixed CycleLight night boost, proper layering (ambient BELOW lights), safe day/night probe, page-change refresh.
 * @author Noq
 * @help
 * Note tags on events:
 *   <Light: SIZE, COLOR>
 *   <CycleLight: SIZE, COLOR>     # brightness follows day/night (brighter at night)
 *   (COLOR can be rgba(...) or hex like #C6DEFF)
 *
 * Examples:
 *   <Light: 180, rgba(255,200,120,0.70)>      # torch
 *   <CycleLight: 160, rgba(150,200,255,0.90)> # soul/orb that blooms at night
 *   <Light: 28, #C6DEFF>                      # tiny blue flame (auto-smoothed)
 *
 * Script API (same as v3.3):
 *   NoteLights.setDayMultiplier(v)    // default 0.30  (daytime light strength)
 *   NoteLights.setNightMultiplier(v)  // default 1.00  (nighttime light strength)
 *   NoteLights.setTransitionSpeed(v)  // default 0.02  (0.005–0.05 smoother→snappier)
 *   NoteLights.setAmbientStrength(v)  // default 0.50  (0..1 how dark nights feel)
 *   NoteLights.setTwilightShift(v)    // default 0.00  (-0.5..0.5 shifts sunset/sunrise)
 *
 * Plugin Commands:
 *   NoteLights Refresh     # Rescan events & rebuild light sprites now
 */

var NoteLights = NoteLights || {};

(function() {
  "use strict";
  console.log("NoteLights v3.4 loaded");

  // ===== Config (tweak via API at runtime) =====
  var DAY_MULT         = 0.30;
  var NIGHT_MULT       = 1.00;
  var TRANSITION_SPEED = 0.02;
  var AMBIENT_STRENGTH = 0.50; // 0..1 scales how dark midnight is
  var TWILIGHT_SHIFT   = 0.00; // shifts the day-night curve: positive = later sunset

  // ===== API =====
  NoteLights.setDayMultiplier    = function(v){ DAY_MULT = Number(v || 0); };
  NoteLights.setNightMultiplier  = function(v){ NIGHT_MULT = Number(v || 0); };
  NoteLights.setTransitionSpeed  = function(v){ TRANSITION_SPEED = Math.max(0.001, Number(v || 0.02)); };
  NoteLights.setAmbientStrength  = function(v){ AMBIENT_STRENGTH = Math.max(0, Math.min(1, Number(v || 0.5))); };
  NoteLights.setTwilightShift    = function(v){ TWILIGHT_SHIFT = Math.max(-0.5, Math.min(0.5, Number(v || 0))); };
  NoteLights.requestRebuild      = function(){ NoteLights._needsRebuild = true; };

  // 1.0 at noon, 0.0 at midnight — robust probes across cores/overlays.
  function dayNightBrightness() {
    // Preferred: If your tint core exposes a live overlay alpha, invert it
    try {
      if (window.DayNightTint && DayNightTint._savedColor) {
        var a = Math.max(0, Math.min(160, DayNightTint._savedColor.a || 0));
        // a=0 => bright day; a=160 => deep night
        return 1 - (a / 160);
      }
    } catch (e) {}

    // Fallback: DayNight core hour/minute if present
    try {
      if (typeof DayNight !== "undefined" && DayNight.hour && DayNight.minute) {
        var h = DayNight.hour() + DayNight.minute() / 60;
        var t = ((h % 24) / 24 + TWILIGHT_SHIFT + 1) % 1; // shift & wrap
        return (Math.cos((t - 0.5) * Math.PI * 2) + 1) / 2;
      }
    } catch (e2) {}

    // Last resort: assume day
    return 1.0;
  }

  // =============================
  // Light Sprite
  // =============================
  function NoteLightSprite(event, size, color, cycle) {
    this.initialize(event, size, color, cycle);
  }
  NoteLightSprite.prototype = Object.create(Sprite.prototype);
  NoteLightSprite.prototype.constructor = NoteLightSprite;

  // Convert #RRGGBB to rgba(r,g,b,a); if already rgba, adjust alpha when needed.
  function toRgbaWithAlpha(color, a) {
    if (!color) return "rgba(255,255,200," + a + ")";
    if (color.slice(0,4).toLowerCase() === "rgba") {
      return color.replace(/rgba?\(([^)]+)\)/, function(_, inner){
        var p = inner.split(",").map(function(s){ return s.trim(); });
        var r = p[0], g = p[1], b = p[2];
        var alpha = (p[3] != null ? parseFloat(p[3]) : 1) * a;
        return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
      });
    } else if (color[0] === "#") {
      var hex = color.replace("#","");
      var n = parseInt(hex,16);
      var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }
    // fallback: pass-through (named CSS colors); alpha applied by overlay, not here
    return color;
  }

  NoteLightSprite.prototype.initialize = function(event, size, color, cycle) {
    Sprite.prototype.initialize.call(this);
    this._event = event;
    this._size = Math.max(24, Number(size || 128)); // 24px min for stable gradients
    this._baseColor = String(color || "rgba(255,255,200,0.8)");
    this._cycle = !!cycle;
    this._targetAlpha = 1.0;
    this._currentAlpha = 1.0;
    this.anchor.set(0.5, 0.5);
    this.blendMode = PIXI.BLEND_MODES.ADD; // additive glow
    this.createLightBitmap();
  };

  NoteLightSprite.prototype.createLightBitmap = function() {
    this.bitmap = new Bitmap(this._size, this._size);
    var ctx = this.bitmap.context;
    var cx = this._size / 2;

    // Auto-smoothing for small lights (prevents “ringing”)
    var small = this._size < 40;
    var coreA = small ? 0.55 : 0.80;        // center alpha
    var midA  = small ? 0.40 : 0.55;        // middle ring alpha
    var r0    = small ? 0.10 : 0.05;        // inner radius
    var r1    = 0.50;                        // outer radius

    var cCore = toRgbaWithAlpha(this._baseColor, coreA);
    var cMid  = toRgbaWithAlpha(this._baseColor, midA);

    var grd = ctx.createRadialGradient(cx, cx, this._size * r0, cx, cx, this._size * r1);
    grd.addColorStop(0.00, cCore);
    grd.addColorStop(0.25, cCore);
    grd.addColorStop(0.45, cMid);
    grd.addColorStop(1.00, "rgba(0,0,0,0)");

    ctx.clearRect(0, 0, this._size, this._size);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, this._size, this._size);
    this.bitmap._baseTexture.update();
  };

  NoteLightSprite.prototype.update = function() {
    Sprite.prototype.update.call(this);
    if (!this._event) return;

    // Follow event
    this.x = this._event.screenX();
    this.y = this._event.screenY() - 24;

    // Off-screen culling (simple)
    var pad = 96;
    var on = this.x > -pad && this.x < Graphics.width + pad &&
             this.y > -pad && this.y < Graphics.height + pad;
    this.visible = on;
    if (!on) return;

    // Cycle behavior — **brighter at night** (inverted curve, clamps by multipliers)
    var noonBright = dayNightBrightness(); // 1 at noon, 0 at midnight
    if (this._cycle) {
      var nightFactor = 1.0 - noonBright;    // 1 at midnight, 0 at noon
      this._targetAlpha = DAY_MULT + (NIGHT_MULT - DAY_MULT) * nightFactor;
    } else {
      // Non-cycling lights—use NIGHT_MULT for a steady glow that still respects transitions a bit
      this._targetAlpha = DAY_MULT + (NIGHT_MULT - DAY_MULT) * (1.0 - noonBright) * 0.25;
    }

    // Smoothly approach target
    this._currentAlpha += (this._targetAlpha - this._currentAlpha) * TRANSITION_SPEED;
    this.opacity = Math.floor(this._currentAlpha * 255);
  };

  // =============================
  // Spriteset_Map Hooks
  // =============================
  var _Spriteset_Map_createLowerLayer = Spriteset_Map.prototype.createLowerLayer;
  Spriteset_Map.prototype.createLowerLayer = function() {
    _Spriteset_Map_createLowerLayer.call(this);
    this.createNoteLightRoot();
  };

  // Root container that holds (ambient below) + (lights above)
  Spriteset_Map.prototype.createNoteLightRoot = function() {
    // Destroy old if re-entering map
    if (this._noteLightRoot && this._noteLightRoot.parent) {
      this._noteLightRoot.parent.removeChild(this._noteLightRoot);
    }
    this._noteLightRoot = new Sprite();
    this.addChild(this._noteLightRoot);

    // --- Ambient BELOW lights ---
    this._ambientOverlay = new ScreenSprite();
    this._ambientOverlay.setColor(0, 0, 0);
    this._noteLightRoot.addChild(this._ambientOverlay);

    // --- Lights ABOVE ambient ---
    this._noteLightLayer = new Sprite();
    this._noteLightRoot.addChild(this._noteLightLayer);

    this._noteLights = [];
    this.createNoteLights();
  };

  // Build light sprites from event note-tags
  Spriteset_Map.prototype.createNoteLights = function() {
    // clear any existing
    for (var i = 0; i < this._noteLights.length; i++) {
      var s = this._noteLights[i];
      if (s && s.parent) s.parent.removeChild(s);
    }
    this._noteLights = [];

    $gameMap.events().forEach(function(ev) {
      if (!ev.event) return;
      var note = ev.event().note || "";

      var m1 = /<Light:\s*(\d+)\s*,\s*([^>]+)>/i.exec(note);
      if (m1) {
        var s1 = new NoteLightSprite(ev, Number(m1[1]), m1[2].trim(), false);
        this._noteLightLayer.addChild(s1);
        this._noteLights.push(s1);
      }
      var m2 = /<CycleLight:\s*(\d+)\s*,\s*([^>]+)>/i.exec(note);
      if (m2) {
        var s2 = new NoteLightSprite(ev, Number(m2[1]), m2[2].trim(), true);
        this._noteLightLayer.addChild(s2);
        this._noteLights.push(s2);
      }
    }, this);
  };

  // Rebuild trigger (page changes etc.)
  var _Game_Event_setupPage = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function(){
    _Game_Event_setupPage.call(this);
    NoteLights.requestRebuild();
  };

  // Plugin command: refresh
  var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
  Game_Interpreter.prototype.pluginCommand = function(command, args) {
    _Game_Interpreter_pluginCommand.call(this, command, args);
    if ((command||"").toLowerCase() === "notelights" && (args[0]||"").toLowerCase() === "refresh") {
      NoteLights.requestRebuild();
    }
  };

  var _Spriteset_Map_update = Spriteset_Map.prototype.update;
  Spriteset_Map.prototype.update = function() {
    _Spriteset_Map_update.call(this);

    // Ambient dim (darker at night): 0 at noon, AMBIENT_STRENGTH at midnight
    var noonBright = dayNightBrightness();                // 1 at noon, 0 at midnight
    var nightPortion = 1.0 - noonBright;                  // 0 day → 1 night
    var ambient = AMBIENT_STRENGTH * nightPortion;        // scale by strength
    this._ambientOverlay.opacity = Math.round(ambient * 160);

    // If any event pages changed / or plugin command requested rebuild
    if (NoteLights._needsRebuild) {
      NoteLights._needsRebuild = false;
      this.createNoteLights();
    }
  };

})();