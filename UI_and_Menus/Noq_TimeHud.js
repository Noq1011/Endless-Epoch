/*:
 * @plugindesc v1.0 Endless Epoch Time HUD (Sliding Hours & Weekdays)
 * @author Tyson (Noq)
 */

(function() {
    // ------------------------------------------------------------------------
    // 1. WEEKDAY NAMING SYSTEM
    // Replace these 7 names with the actual days from your world lore!
    // ------------------------------------------------------------------------
    var WEEKDAYS = [
        "Sunsday",     // Day 1
        "Moonsday",    // Day 2
        "Tiersday",    // Day 3
        "Windsday",    // Day 4
        "Thundersday", // Day 5
        "Firesday",    // Day 6
        "Starsday"     // Day 7
    ];

    // ------------------------------------------------------------------------
    // 2. THE HUD SPRITE
    // ------------------------------------------------------------------------
    function Sprite_TimeHUD() {
        this.initialize.apply(this, arguments);
    }
    Sprite_TimeHUD.prototype = Object.create(Sprite.prototype);
    Sprite_TimeHUD.prototype.constructor = Sprite_TimeHUD;

    Sprite_TimeHUD.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this);
        this.bitmap = new Bitmap(400, 80);
        this.x = (Graphics.boxWidth - 400) / 2; // Centers it perfectly
        this.y = 16; 
        this.z = 100; 
        this._lastMinute = -1;
        this._lastDay = -1;
        this.opacity = 255;
    };

    Sprite_TimeHUD.prototype.update = function() {
        Sprite.prototype.update.call(this);
        
        // Auto-hide during message boxes or battles/menus
        var isMap = SceneManager._scene instanceof Scene_Map;
        var isMessage = $gameMessage.isBusy();
		var isHiddenMap = $dataMap && $dataMap.note && /<NoTimeHUD>/i.test($dataMap.note);
        
        if (!isMap || isMessage || isHiddenMap) {
            this.opacity -= 15;
        } else {
            this.opacity += 15;
        }

        // Only redraw the canvas if visible and the Core is loaded
        if (this.opacity > 0 && typeof DayNight !== "undefined") {
            this.refreshIfNeeded();
        }
    };

    Sprite_TimeHUD.prototype.refreshIfNeeded = function() {
        var m = Math.floor(DayNight.minute());
        var d = Math.floor(DayNight.day());
        
        // Redraw every minute so the hour numbers smoothly slide!
        if (this._lastMinute !== m || this._lastDay !== d) {
            this._lastMinute = m;
            this._lastDay = d;
            this.redraw();
        }
    };

    Sprite_TimeHUD.prototype.redraw = function() {
        var h = Math.floor(DayNight.hour());
        var d = Math.floor(DayNight.day());
        var m = Math.floor(DayNight.minute());
        
        // Calculate progress of the current hour to slide the numbers (0.0 to 1.0)
        var progress = m / 60.0;
        
        // Map the current day to your lore calendar
        var weekdayIndex = (d - 1) % WEEKDAYS.length;
        var weekday = WEEKDAYS[weekdayIndex];

        this.bitmap.clear();
        var ctx = this.bitmap._context;

        // --- A. DRAW THE CURVED LINE ---
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(40, 50);
        ctx.quadraticCurveTo(200, 70, 360, 50); // Dips gracefully in the center
        ctx.stroke();
        ctx.restore();

        // --- B. DRAW THE SLIDING HOURS ---
        // Draws the hour before, current hour, and hour after
        for (var offset = -2; offset <= 2; offset++) {
            var displayHour = (h + offset) % 24;
            if (displayHour < 0) displayHour += 24;
            
            // X position physically shifts left as minutes pass
            var xPos = 200 + (offset * 60) - (progress * 60);
            
            // Alpha gracefully fades out the further the number gets from the center
            var alpha = 1.0 - (Math.abs(xPos - 200) / 90);
            if (alpha < 0) alpha = 0;
            
            if (alpha > 0) {
                this.bitmap.fontSize = (offset === 0) ? 22 : 18; 
                this.bitmap.textColor = "rgba(255, 215, 0, " + alpha + ")"; // Fading Gold
                this.bitmap.drawText(displayHour.toString(), xPos - 20, 38, 40, 24, 'center');
            }
        }

        // --- C. DRAW THE CENTER RING (O) ---
        ctx.save();
        ctx.strokeStyle = "rgba(255, 215, 0, 0.9)"; // Bright Gold Ring
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(200, 50, 18, 0, Math.PI * 2);
        ctx.stroke();
        
        // Fill a very faint black inside the ring to pop the active text
        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fill();
        ctx.restore();

        // --- D. DRAW WEEKDAY AND DAY ---
        this.bitmap.fontSize = 20;
        this.bitmap.textColor = "#FFFFFF";
        var dateText = weekday + " - Day " + d;
        this.bitmap.drawText(dateText, 0, 0, 400, 24, 'center');
    };

    // ------------------------------------------------------------------------
    // 3. INJECT INTO SCENE_MAP
    // ------------------------------------------------------------------------
    var _Scene_Map_createDisplayObjects = Scene_Map.prototype.createDisplayObjects;
    Scene_Map.prototype.createDisplayObjects = function() {
        _Scene_Map_createDisplayObjects.call(this);
        this._timeHUD = new Sprite_TimeHUD();
        // Attaches exactly below the window layer, but above map sprites
        this.addChild(this._timeHUD); 
    };

})();