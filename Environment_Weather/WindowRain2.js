/*:
 * @plugindesc v1.0 - Map-fixed rain zones (tile-anchored), works on transfers. ES5 MV-compatible.
 * @author ChatGPT
 *
 * @help
 * Define rain zones using the plugin parameter "Zones" as a JSON array.
 *
 * Example parameter value:
 * [
 *   {
 *     "mapId": 1,
 *     "areas": [{"x":6,"y":5,"w":2,"h":2}],
 *     "density": 60,
 *     "speed": 4,
 *     "angle": 80,
 *     "length": 14,
 *     "thickness": 2,
 *     "color": "#66ccff",
 *     "opacity": 0.75
 *   }
 * ]
 *
 * Fields:
 *  - mapId: (number) Map ID the zone applies to
 *  - areas: array of rectangles in tile coords {x,y,w,h}
 *  - density: approx number of drops per area (higher = more drops)
 *  - speed: vertical speed multiplier
 *  - angle: direction in degrees (90 = down)
 *  - length: pixel length of droplet streak
 *  - thickness: pixel thickness of droplet
 *  - color: hex string color
 *  - opacity: 0..1
 *
 * You can add multiple zones for same map. The plugin automatically
 * creates/destroys the rain container on map load/transfer and updates
 * the container position as the map scrolls so the rain stays anchored.
 *
 * For quick tests, hardcode zones in the Plugin Manager parameter "Zones"
 * or edit the source below where the DEFAULT_ZONES variable is defined.
 *
 * ©
 */

(function(){
    "use strict";

    // ---------- Config: fallback default zones (you can override via plugin params) ----------
    var DEFAULT_ZONES = []; // empty by default - configure via plugin params

    // ---------- Helpers ----------
    function parseJSONSafe(text, fallback) {
        try { return JSON.parse(String(text || "").trim() || "null") || fallback; } catch (e) { return fallback; }
    }
    function hexToInt(hex) {
        if (!hex) return 0xffffff;
        if (hex[0] === "#") hex = hex.slice(1);
        return parseInt(hex, 16) || 0xffffff;
    }
    function getTileSize() {
        try {
            if ($gameMap && typeof $gameMap.tileWidth === "function") return $gameMap.tileWidth();
            if ($gameMap && typeof $gameMap.tileWidth === "number") return $gameMap.tileWidth;
        } catch (e) {}
        return 48;
    }

    // ---------- Plugin parameters ----------
    var paramString = PluginManager.parameters && PluginManager.parameters('MapFixedRain') ?
                      PluginManager.parameters('MapFixedRain').Zones : null;
    var parsed = parseJSONSafe(paramString, null);
    var ZONES = parsed !== null ? parsed : DEFAULT_ZONES;

    // If user passed a single object rather than array, normalize
    if (ZONES && !Array.isArray(ZONES)) { ZONES = [ZONES]; }

    // ---------- Rain manager (per scene) ----------
    function RainZone(zoneDef) {
        // zoneDef: { mapId, areas:[{x,y,w,h}], density, speed, angle, length, thickness, color, opacity }
        this.mapId = Number(zoneDef.mapId || 0);
        this.areas = zoneDef.areas || [];
        this.density = Number(zoneDef.density || 60);
        this.speed = Number(zoneDef.speed || 3);
        this.angle = Number(zoneDef.angle || 90) * Math.PI / 180; // radians
        this.length = Number(zoneDef.length || 12);
        this.thickness = Number(zoneDef.thickness || 2);
        this.color = zoneDef.color || "#66ccff";
        this.opacity = (typeof zoneDef.opacity === "number") ? zoneDef.opacity : (zoneDef.opacity ? Number(zoneDef.opacity) : 0.8);
        // computed pixel rectangles (set later)
        this.pixelAreas = [];
        this._computed = false;
    }
    RainZone.prototype.computePixelAreas = function(tileW, tileH) {
        this.pixelAreas = [];
        for (var i = 0; i < this.areas.length; i++) {
            var a = this.areas[i];
            var px = (Number(a.x) || 0) * tileW;
            var py = (Number(a.y) || 0) * tileH;
            var pw = (Number(a.w) || 1) * tileW;
            var ph = (Number(a.h) || 1) * tileH;
            this.pixelAreas.push({x: px, y: py, w: pw, h: ph});
        }
        this._computed = true;
    };

    function Droplet(zone, areaIndex) {
        // zone: RainZone instance (reference)
        this.zone = zone;
        this.areaIndex = areaIndex || 0;
        this.sprite = new PIXI.Graphics();
        this.reset(true);
    }
    Droplet.prototype.reset = function(forceSpawnAtTop) {
        var area = this.zone.pixelAreas[this.areaIndex];
        if (!area) {
            this.sprite.visible = false; return;
        }
        var w = area.w, h = area.h;
        // spawn horizontally within area
        this.x = area.x + Math.random() * w;
        // spawn above or inside area (for respawn, put at random y inside top third)
        if (forceSpawnAtTop) {
            this.y = area.y + Math.random() * (h * 0.2);
        } else {
            this.y = area.y + Math.random() * h;
        }
        // velocity based on zone.speed and small random variance
        var base = this.zone.speed;
        this.vx = Math.cos(this.zone.angle) * base * (0.6 + Math.random() * 0.8);
        this.vy = Math.sin(this.zone.angle) * base * (0.6 + Math.random() * 0.8);
        this.alpha = this.zone.opacity;
        this.len = this.zone.length * (0.8 + Math.random() * 0.6);
        this.thickness = Math.max(1, Math.round(this.zone.thickness * (0.8 + Math.random()*0.6)));
        this.color = hexToInt(this.zone.color);
        this.sprite.visible = true;
        this.draw();
    };
    Droplet.prototype.draw = function() {
        var g = this.sprite;
        g.clear();
        g.beginFill(this.color, this.alpha);
        // draw simple rectangle streak rotated to angle
        // we'll draw a rectangle with pivot centered at 0,0 then set sprite.position
        // but PIXI.Graphics doesn't rotate pivot the same, so we'll just draw a thin rectangle and rotate the sprite.
        g.drawRect(0, 0, this.thickness, this.len);
        g.endFill();
        // set origin pivot so rotation makes it point downward from (0,0)
        g.pivot.x = this.thickness/2;
        g.pivot.y = 0;
        g.rotation = this.zone.angle; // radians
    };
    Droplet.prototype.update = function(dt, containerOffsetX, containerOffsetY) {
        // dt: delta in ms converted to multiplier (we'll keep simple)
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.sprite.x = this.x + containerOffsetX;
        this.sprite.y = this.y + containerOffsetY;
        // check out of area
        var area = this.zone.pixelAreas[this.areaIndex];
        if (!area) { this.sprite.visible = false; return; }
        // if droplet below bottom or outside horizontal range, respawn at top of area
        if (this.y > area.y + area.h + this.len || this.x < area.x - this.len || this.x > area.x + area.w + this.len) {
            this.reset(true);
            // place at top edge
            this.y = area.y - (Math.random() * 8);
            this.sprite.x = this.x + containerOffsetX;
            this.sprite.y = this.y + containerOffsetY;
        }
    };

    // Manager attached to Scene_Map
    function MapRainManager(scene) {
        this.scene = scene;
        this.container = null;
        this.zones = []; // RainZone instances for current map only
        this.droplets = [];
        this._lastUpdate = performance.now ? performance.now() : Date.now();
        this._active = false;
    }
    MapRainManager.prototype.init = function() {
        // create PIXI container and attach to spriteset (if available)
        try {
            var spriteset = this.scene._spriteset;
            if (!spriteset) return;
            if (!this.container) {
                this.container = new PIXI.Container();
                // put above tilemap but below picture layer - adding to spriteset is ok
                spriteset.addChild(this.container);
                this.container.z = 9999;
            }
            this.updateForCurrentMap();
            this._active = true;
        } catch (e) {
            // fail silently
            this._active = false;
        }
    };
    MapRainManager.prototype.destroy = function() {
        try {
            if (this.container && this.container.parent) this.container.parent.removeChild(this.container);
        } catch (e) {}
        this.container = null;
        this.zones = [];
        // destroy droplets
        for (var i = 0; i < this.droplets.length; i++) {
            try { this.droplets[i].sprite.clear(); } catch (e) {}
        }
        this.droplets = [];
        this._active = false;
    };
    MapRainManager.prototype.updateForCurrentMap = function() {
        // find matching zone definitions for this map
        var mapId = $gameMap ? $gameMap.mapId() : 0;
        var tileW = getTileSize();
        var tileH = tileW;
        // build zones from global ZONES param that match mapId
        this.zones = [];
        for (var i = 0; i < ZONES.length; i++) {
            var z = ZONES[i];
            if (!z) continue;
            if (Number(z.mapId) === Number(mapId)) {
                var rz = new RainZone(z);
                rz.computePixelAreas(tileW, tileH);
                this.zones.push(rz);
            }
        }
        // If no zones -> destroy droplets & hide container
        if (!this.container) return;
        if (this.zones.length === 0) {
            // clear children
            this.container.removeChildren();
            this.droplets = [];
            return;
        }
        // compute total droplet count (sum density per zone times number of areas)
        var total = 0;
        for (var zi = 0; zi < this.zones.length; zi++) {
            var rz2 = this.zones[zi];
            var areasCount = (rz2.pixelAreas && rz2.pixelAreas.length) ? rz2.pixelAreas.length : 1;
            total += Math.round(rz2.density || 60) * areasCount;
        }
        // clamp to reasonable limit
        total = Math.min(total, 600); // safety cap
        // create or reuse droplets up to 'total'
        var current = this.droplets.length;
        if (current < total) {
            for (var j = current; j < total; j++) {
                // map droplet to zone and area round-robin (simple)
                var zoneIndex = j % this.zones.length;
                var areaIndex = j % (this.zones[zoneIndex].pixelAreas.length || 1);
                var d = new Droplet(this.zones[zoneIndex], areaIndex);
                // position sprite initially; it will be updated in update()
                this.container.addChild(d.sprite);
                this.droplets.push(d);
            }
        } else if (current > total) {
            // remove extra
            for (var r = total; r < current; r++) {
                try {
                    var rem = this.droplets[r];
                    if (rem && rem.sprite && rem.sprite.parent) rem.sprite.parent.removeChild(rem.sprite);
                } catch (e) {}
            }
            this.droplets.length = total;
        }
        // Make sure droplets carry correct zone/area references (in case zones changed)
        for (var k = 0; k < this.droplets.length; k++) {
            var dd = this.droplets[k];
            var zoneIdx = k % this.zones.length;
            var areaIdx2 = k % (this.zones[zoneIdx].pixelAreas.length || 1);
            dd.zone = this.zones[zoneIdx];
            dd.areaIndex = areaIdx2;
            dd.reset(true);
        }
    };
    MapRainManager.prototype._updateContainerPosition = function() {
        // Put container at map origin offset so children positions are map-global pixels
        try {
            if (!this.container) return;
            var tileW = getTileSize();
            var tileH = tileW;
            if ($gameMap && typeof $gameMap.displayX === "function" && typeof $gameMap.displayY === "function") {
                var dx = $gameMap.displayX();
                var dy = $gameMap.displayY();
                // container.x relative to screen: negative map display offset
                this.container.x = -dx * tileW;
                this.container.y = -dy * tileH;
            } else {
                this.container.x = 0;
                this.container.y = 0;
            }
        } catch (e) {}
    };
    MapRainManager.prototype.update = function() {
        if (!this._active) return;
        var now = performance.now ? performance.now() : Date.now();
        var dtMs = Math.max(0, Math.min(50, now - this._lastUpdate));
        // a simple multiplier (so speed numbers make sense)
        var dt = dtMs / 16.666; // ~60fps baseline
        this._lastUpdate = now;

        if (!this.container) this.init();
        if (!this.container) return;

        // Update container position so droplets stay anchored relative to map scrolling
        this._updateContainerPosition();

        // Update droplets
        // containerOffset is already included in sprite.x/y via container global; we position droplets in world pixels,
        // but because container.x is negative display offset, we set sprite position to droplet.x + containerOffsetX,
        // however we already set sprite positions as absolute and then container offset applies automatically if we instead
        // place droplets inside container using local coords. For simplicity we'll set sprites' local coords (no extra offsets).
        var localOffsetX = 0;
        var localOffsetY = 0;
        // But we are drawing sprites as child of container, so droplet.sprite.x/y should be local coords (droplet.x - (displayX*tileW)).
        // To keep droplet.x as absolute map pixel, compute container offset:
        var tileW = getTileSize();
        var displayX = ($gameMap && typeof $gameMap.displayX === "function") ? $gameMap.displayX() : 0;
        var displayY = ($gameMap && typeof $gameMap.displayY === "function") ? $gameMap.displayY() : 0;
        var containerOffsetX = -displayX * tileW;
        var containerOffsetY = -displayY * tileW;

        for (var i = 0; i < this.droplets.length; i++) {
            try {
                this.droplets[i].update(dt, containerOffsetX, containerOffsetY);
            } catch (err) { /* ignore per-drop errors */ }
        }
    };

    // ---------- Hooks into Scene_Map ----------
    var _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _Scene_Map_createDisplayObjects.call(this);
        try {
            if (!this._mapRainManager) {
                this._mapRainManager = new MapRainManager(this);
                // initialize (will attach container to spriteset if available)
                this._mapRainManager.init();
            } else {
                // re-init on re-creation (safe)
                this._mapRainManager.init();
            }
        } catch (e) {}
    };

    var _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);
        try {
            if (!this._mapRainManager) {
                this._mapRainManager = new MapRainManager(this);
                this._mapRainManager.init();
            } else {
                this._mapRainManager.updateForCurrentMap();
            }
        } catch (e) {}
    };

    var _Scene_Map_terminate = Scene_Map.prototype.terminate;
    Scene_Map.prototype.terminate = function() {
        try {
            if (this._mapRainManager) {
                this._mapRainManager.destroy();
                this._mapRainManager = null;
            }
        } catch (e) {}
        _Scene_Map_terminate.call(this);
    };

    var _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        try {
            if (this._mapRainManager) this._mapRainManager.update();
        } catch (e) {}
    };

    // If user wants to add zones in code at runtime, expose a helper:
    window.MapFixedRain = window.MapFixedRain || {};
    window.MapFixedRain.addZone = function(zone) {
        if (!zone) return;
        ZONES.push(zone);
        // if in map scene, refresh manager
        try {
            var sc = SceneManager._scene;
            if (sc && sc._mapRainManager) sc._mapRainManager.updateForCurrentMap();
        } catch (e) {}
    };
    window.MapFixedRain.getZones = function() { return ZONES; };

    console.log("MapFixedRain loaded. Zones:", ZONES);

})(); 
