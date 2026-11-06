/*:
 * @plugindesc EG Ambient Lighting & Stealth v2.6 (NoteLights Unified, Lantern & Verse Synergy)
 * @author Endless Epoch
 *
 * @help
 * ============================================================================
 * EG Ambient Lighting & Stealth v2.6
 * ============================================================================
 *
 * Script Calls:
 * $gameSystem.setIndoorMode(true);  // Ignores Day/Night, uses manual brightness
 * $gameSystem.setIndoorMode(false); // Resumes Day/Night cycle
 * $gameSystem.setAmbientBrightness(100); // Works when Indoor Mode is TRUE
 * 
 * ============================================================================
 * LIGHT TAG SUPPORT (Unified with NoqNoteLights v3.4)
 * ============================================================================
 * This script automatically detects ALL of the following event tags & page comments:
 *
 *   <amlight: 3>                        (3-tile pixel radius hole)
 *   <Light: 180, rgba(255,200,120,0.7)> (Parses pixel size & syncs bloom hole)
 *   <CycleLight: 160, #C6DEFF>          (Parses pixel size & syncs bloom hole)
 *
 * ============================================================================
 * REGION ID SETUP
 * ============================================================================
 * 70 = Lightest Shade (20% Opacity) - Light Stealth
 * 71 = Light Shade (40% Opacity)    - Light Stealth
 * 72 = Medium Shade (60% Opacity)   - Heavy Stealth
 * 73 = Dark Shade (80% Opacity)     - Heavy Stealth
 * 74 = Pitch Black (95% Opacity)    - Total Invisibility
 * 
 * 75 = Purple Miasma. A soft, radial purple shadow with 50% opacity.
 *      Ignores ambient light and grants Heavy Stealth.
 *
 * ============================================================================
 * PLAYER LANTERN
 * ============================================================================
 * Turn ON Switch 21 to activate the Player Lantern. 
 * While ON, it provides a 4-tile warm glow and forces Stealth Level to 3 
 * (Fully Visible). Radius dynamically scales with Verse Efficiency multipliers!
 * ============================================================================
 */

(function() {
    'use strict';

    var LANTERN_SWITCH = 21; 
    var LANTERN_RADIUS = 4;  

    //=========================================================================
    // GAME SYSTEM
    //=========================================================================

    var _GameSystem_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _GameSystem_initialize.call(this);
        this._ambientBrightness = 255; 
        this._indoorMode = false;
    };

    Game_System.prototype.setIndoorMode = function(value) {
        this._indoorMode = !!value;
    };

    Game_System.prototype.isIndoorMode = function() {
        return this._indoorMode;
    };

    Game_System.prototype.setAmbientBrightness = function(value) {
        this._ambientBrightness = Math.max(0, Math.min(255, value));
    };

    Game_System.prototype.ambientBrightness = function() {
        return this._ambientBrightness !== undefined ? this._ambientBrightness : 255;
    };

    //=========================================================================
    // GAME EVENT
    //=========================================================================

    var _Game_Event_initialize = Game_Event.prototype.initialize;
    Game_Event.prototype.initialize = function(mapId, eventId) {
        _Game_Event_initialize.call(this, mapId, eventId);
        this._lightRadius = 0;
        this._lightPixelRadius = 0;
        this.setupEGLighting();
    };

    var _Game_Event_setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        _Game_Event_setupPage.call(this);
        this._lightRadius = 0;
        this._lightPixelRadius = 0;
        this.setupEGLighting();
    };

    Game_Event.prototype.setupEGLighting = function() {
        var note = "";
        if (this.event() && this.event().note) note += this.event().note + "\n";
        
        if (this.page() && this.list()) {
            this.list().forEach(function(cmd) {
                if (cmd.code === 108 || cmd.code === 408) {
                    note += cmd.parameters[0] + "\n";
                }
            });
        }

        var matchAm = note.match(/<amlight:\s*(\d+)>/i);
        var matchLight = note.match(/<Light:\s*(\d+)\s*,/i);
        var matchCycle = note.match(/<CycleLight:\s*(\d+)\s*,/i);

        if (matchAm) {
            var r = Number(matchAm[1]);
            this._lightRadius = r;
            this._lightPixelRadius = r * 48;
        } else if (matchLight) {
            var size1 = Number(matchLight[1]);
            this._lightPixelRadius = size1 / 2;
            this._lightRadius = Math.max(1, Math.ceil((size1 / 2) / 48));
        } else if (matchCycle) {
            var size2 = Number(matchCycle[1]);
            this._lightPixelRadius = size2 / 2;
            this._lightRadius = Math.max(1, Math.ceil((size2 / 2) / 48));
        }
    };

    //=========================================================================
    // STEALTH MECHANICS
    //=========================================================================

    Game_Player.prototype.visibilityLevel = function() {
        if ($gameSwitches.value(LANTERN_SWITCH)) return 3; 

        var px = this.x;
        var py = this.y;

        var events = $gameMap.events();
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (ev._lightPixelRadius > 0) {
                var dist = Math.abs(ev.x - px) + Math.abs(ev.y - py);
                if (dist <= ev._lightRadius) return 3; 
            }
        }

        var regionId = $gameMap.regionId(px, py);
        if (regionId === 74) return 0; 
        if (regionId === 73 || regionId === 72 || regionId === 75) return 1; 
        if (regionId === 71 || regionId === 70) return 2; 

        if (!$gameSystem.isIndoorMode() && typeof DayNight !== "undefined" && DayNight.isNight && DayNight.isNight()) {
            return 2; 
        }

        return 3; 
    };

    Game_CharacterBase.prototype.canSeePlayer = function(baseVisionRange) {
        var visLevel = $gamePlayer.visibilityLevel();
        if (visLevel === 0) return false; 

        var dx = $gamePlayer.x - this.x;
        var dy = $gamePlayer.y - this.y;
        var dist = Math.abs(dx) + Math.abs(dy);
        var actualRange = baseVisionRange;

        if (visLevel === 1) actualRange = Math.floor(baseVisionRange * 0.33);
        if (visLevel === 2) actualRange = Math.floor(baseVisionRange * 0.66);

        if (dist > actualRange) return false; 

        var dir = this.direction();
        if (dir === 2 && (dy < 0 || Math.abs(dx) > dy)) return false;
        if (dir === 4 && (dx > 0 || Math.abs(dy) > -dx)) return false;
        if (dir === 6 && (dx < 0 || Math.abs(dy) > dx)) return false;
        if (dir === 8 && (dy > 0 || Math.abs(dx) > -dy)) return false;

        return true;
    };

    var _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if (this._dayNightOverlay) this._dayNightOverlay.opacity = 0; 
    };

    var _Spriteset_Map_update = Spriteset_Map.prototype.update;
    Spriteset_Map.prototype.update = function() {
        _Spriteset_Map_update.call(this);
        if (this._ambientOverlay) this._ambientOverlay.opacity = 0;
    };

    //=========================================================================
    // LIGHT SPRITE RENDERING
    //=========================================================================

    function Sprite_EGAmbient() {
        this.initialize.apply(this, arguments);
    }
    Sprite_EGAmbient.prototype = Object.create(Sprite.prototype);
    Sprite_EGAmbient.prototype.constructor = Sprite_EGAmbient;

    Sprite_EGAmbient.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this);
        this.bitmap = new Bitmap(Graphics.width, Graphics.height);
        this.z = 8;
        this.blendMode = PIXI.BLEND_MODES.NORMAL;
        this._lastBrightness = -1;
        this._lastCameraX = -1;
        this._lastCameraY = -1;
        this._lastLanternState = false; 
    };

    Sprite_EGAmbient.prototype.update = function() {
        Sprite.prototype.update.call(this);
        
        var currentAlpha = -1;
        var useDayNight = (typeof DayNightTint !== "undefined" && DayNightTint._savedColor && !$gameSystem.isIndoorMode());
        
        if (useDayNight) {
            currentAlpha = DayNightTint._savedColor.a;
        } else {
            currentAlpha = $gameSystem.ambientBrightness();
        }

        var currentLantern = $gameSwitches.value(LANTERN_SWITCH);
        var needRefresh = false;
        
        if (this._lastBrightness !== currentAlpha) needRefresh = true;
        if (this._lastCameraX !== $gameMap.displayX()) needRefresh = true;
        if (this._lastCameraY !== $gameMap.displayY()) needRefresh = true;
        if (this._lastLanternState !== currentLantern) needRefresh = true;

        if (currentLantern) needRefresh = true;

        $gameMap.events().forEach(function(event) {
            if (event._lightPixelRadius && event._lightPixelRadius > 0) {
                if (event._lastLightScreenX !== event.screenX() || event._lastLightScreenY !== event.screenY()) {
                    needRefresh = true;
                    event._lastLightScreenX = event.screenX();
                    event._lastLightScreenY = event.screenY();
                }
            }
        });

        if (needRefresh) {
            this.refresh();
            this._lastBrightness = currentAlpha;
            this._lastCameraX = $gameMap.displayX();
            this._lastCameraY = $gameMap.displayY();
            this._lastLanternState = currentLantern;
        }
    };

    Sprite_EGAmbient.prototype.refresh = function() {
        var bitmap = this.bitmap;
        bitmap.clear();

        bitmap._context.globalCompositeOperation = 'source-over';

        var r = 0, g = 0, b = 0, a = 0;
        var useDayNight = (typeof DayNightTint !== "undefined" && DayNightTint._savedColor && !$gameSystem.isIndoorMode());
        
        if (useDayNight) {
            r = Math.floor(DayNightTint._savedColor.r);
            g = Math.floor(DayNightTint._savedColor.g);
            b = Math.floor(DayNightTint._savedColor.b);
            a = DayNightTint._savedColor.a / 255;
        } else {
            var brightness = $gameSystem.ambientBrightness();
            a = (255 - brightness) / 255;
        }

        if (a > 0) {
            bitmap.fillRect(0, 0, Graphics.width, Graphics.height, 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')');
        }

        this.drawRegionDarkness(bitmap);
        this.drawLights(bitmap);
    };

    Sprite_EGAmbient.prototype.drawRegionDarkness = function(bitmap) {
        var tileW = $gameMap.tileWidth();
        var tileH = $gameMap.tileHeight();
        var startX = Math.floor($gameMap.displayX());
        var startY = Math.floor($gameMap.displayY());
        var cols = Math.ceil(Graphics.width / tileW) + 2;
        var rows = Math.ceil(Graphics.height / tileH) + 2;
        var context = bitmap._context;

        for (var x = 0; x < cols; x++) {
            for (var y = 0; y < rows; y++) {
                var mapX = startX + x;
                var mapY = startY + y;
                var regionId = $gameMap.regionId(mapX, mapY);
                
                var screenX = Math.floor((mapX - $gameMap.displayX()) * tileW);
                var screenY = Math.floor((mapY - $gameMap.displayY()) * tileH);

                if (regionId >= 70 && regionId <= 74) {
                    var alpha = 0;
                    if (regionId === 70) alpha = 0.20;
                    if (regionId === 71) alpha = 0.40;
                    if (regionId === 72) alpha = 0.60;
                    if (regionId === 73) alpha = 0.80;
                    if (regionId === 74) alpha = 0.95;

                    bitmap.fillRect(screenX, screenY, tileW, tileH, 'rgba(0,0,0,' + alpha + ')');
                
                } else if (regionId === 75) {
                    var grad = context.createRadialGradient(
                        screenX + tileW / 2, screenY + tileH / 2, 0,
                        screenX + tileW / 2, screenY + tileH / 2, tileW / 1.2
                    );
                    grad.addColorStop(0, 'rgba(75, 0, 130, 0.5)'); 
                    grad.addColorStop(1, 'rgba(75, 0, 130, 0.0)'); 

                    context.fillStyle = grad;
                    context.fillRect(screenX, screenY, tileW, tileH);
                }
            }
        }
    };

    Sprite_EGAmbient.prototype.drawLights = function(bitmap) {
        var context = bitmap._context;
        
        context.globalCompositeOperation = 'destination-out';
        
        $gameMap.events().forEach(function(event) {
            if (event._lightPixelRadius && event._lightPixelRadius > 0) {
                var sx = event.screenX();
                var sy = event.event().name === "NoqLight" ? event.screenY() : event.screenY() - 24; 
                var size = event._lightPixelRadius;
                
                var grad = context.createRadialGradient(sx, sy, 0, sx, sy, size);
                grad.addColorStop(0, 'rgba(0,0,0,1)'); 
                grad.addColorStop(1, 'rgba(0,0,0,0)'); 
                
                context.fillStyle = grad;
                context.beginPath();
                context.arc(sx, sy, size, 0, Math.PI * 2);
                context.fill();
            }
        });

        // Player Lantern Integration with Verse Multiplier
        if ($gameSwitches.value(LANTERN_SWITCH)) {
            var px = $gamePlayer.screenX();
            var py = $gamePlayer.screenY() - 24; 
            var mult = typeof $gameSystem.fieldEffectMultiplier === 'function' ? $gameSystem.fieldEffectMultiplier() : 1.0;
            var pSize = (LANTERN_RADIUS * 48) * mult;
            
            var pGrad = context.createRadialGradient(px, py, 0, px, py, pSize);
            pGrad.addColorStop(0, 'rgba(0,0,0,1)'); 
            pGrad.addColorStop(1, 'rgba(0,0,0,0)'); 
            
            context.fillStyle = pGrad;
            context.beginPath();
            context.arc(px, py, pSize, 0, Math.PI * 2);
            context.fill();
        }

        if ($gameSwitches.value(LANTERN_SWITCH)) {
            context.globalCompositeOperation = 'lighter'; 
            
            var gx = $gamePlayer.screenX();
            var gy = $gamePlayer.screenY() - 24; 
            var gMult = typeof $gameSystem.fieldEffectMultiplier === 'function' ? $gameSystem.fieldEffectMultiplier() : 1.0;
            var gSize = (LANTERN_RADIUS * 48) * gMult;
            
            var glowGrad = context.createRadialGradient(gx, gy, 0, gx, gy, gSize);
            glowGrad.addColorStop(0, 'rgba(255, 180, 100, 0.4)'); 
            glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)'); 
            
            context.fillStyle = glowGrad;
            context.beginPath();
            context.arc(gx, gy, gSize, 0, Math.PI * 2);
            context.fill();
        }
        
        context.globalCompositeOperation = 'source-over';
        bitmap._setDirty();
    };

    var _Spriteset_Map_createUpperLayer = Spriteset_Map.prototype.createUpperLayer;
    Spriteset_Map.prototype.createUpperLayer = function() {
        _Spriteset_Map_createUpperLayer.call(this);
        this.createEGAmbientLayer();
    };

    Spriteset_Map.prototype.createEGAmbientLayer = function() {
        this._egAmbientLayer = new Sprite_EGAmbient();
        this.addChild(this._egAmbientLayer);
    };

})();