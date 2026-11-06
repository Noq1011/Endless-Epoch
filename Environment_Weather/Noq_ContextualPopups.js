/*:
 * @target MV
 * @plugindesc (MV, ES5) Contextual Pop-ups with Orientation Checks (v1.2)
 * @author Noq
 *
 * @help
 * ============================================================================
 * EVENT NOTETAGS OR COMMENTS (Works in both!)
 * ============================================================================
 * <Context: Read>       - Displays "Read" when facing the event.
 * <ContextIcon: 82>     - Displays Icon #82 next to the text.
 * <ContextDist: 1>      - How many tiles away it triggers (Default: 1)
 */

(function() {
    'use strict';

    // ------------------------------------------------------------------------
    // SPRITE: Context Popup
    // ------------------------------------------------------------------------
    function Sprite_ContextPopup() {
        this.initialize.apply(this, arguments);
    }
    Sprite_ContextPopup.prototype = Object.create(Sprite.prototype);
    Sprite_ContextPopup.prototype.constructor = Sprite_ContextPopup;

    Sprite_ContextPopup.prototype.initialize = function(character) {
        Sprite.prototype.initialize.call(this);
        this._character = character;
        this.anchor.x = 0.5;
        this.anchor.y = 1.0;
        this.opacity = 0;
        this.z = 8; // Render above characters
        
        this._text = "";
        this._icon = 0;
        this._pageIndex = -1; // Track page changes for dynamic comments
        
        this.refreshContext();
    };

    Sprite_ContextPopup.prototype.refreshContext = function() {
        this.parseNotetags();
        if (this._text !== "") {
            this.createBitmap();
        } else {
            this.bitmap = new Bitmap(1, 1); // Clear visual if no text
        }
    };

    Sprite_ContextPopup.prototype.parseNotetags = function() {
        if (!this._character) return;

        var note = "";
        var comment = "";

        // 1. Grab base Event Notes
        if (this._character.event && this._character.event()) {
            note = this._character.event().note || "";
        }

        // 2. Grab Page-Specific Comments
        if (typeof this._character.list === 'function') {
            var list = this._character.list();
            if (list) {
                for (var i = 0; i < list.length; i++) {
                    var cmd = list[i];
                    if (cmd.code === 108 || cmd.code === 408) {
                        comment += cmd.parameters[0] + "\n";
                    }
                }
            }
        }

        var combinedText = note + "\n" + comment;

        var textMatch = combinedText.match(/<Context:\s*([^>]+)>/i);
        var iconMatch = combinedText.match(/<ContextIcon:\s*(\d+)>/i);
        var distMatch = combinedText.match(/<ContextDist:\s*(\d+)>/i);
        
        this._text = textMatch ? textMatch[1].trim() : "";
        this._icon = iconMatch ? Number(iconMatch[1]) : 0;
        this._triggerDist = distMatch ? Number(distMatch[1]) : 1;
    };

    Sprite_ContextPopup.prototype.createBitmap = function() {
        var h = 40;
        var fontSize = 20;

        // 1. Calculate Dynamic Width
        var dummyBitmap = new Bitmap(1, 1);
        dummyBitmap.fontSize = fontSize;
        var textWidth = dummyBitmap.measureTextWidth(this._text);
        
        var iconSpace = this._icon > 0 ? 36 : 0;
        var paddingX = 24; // 12px padding on left and right
        var w = Math.max(textWidth + iconSpace + paddingX, 40); // Ensures it doesn't get too small

        this.bitmap = new Bitmap(w, h);
        
        // 2. Draw Glassy Background (Custom Rounded Corners for MV compatibility)
        var ctx = this.bitmap.context;
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(30, 30, 40, 0.8)');
        grad.addColorStop(1, 'rgba(10, 10, 15, 0.5)');
        ctx.fillStyle = grad;
        
        var radius = 12; // How round the edges are
        ctx.beginPath();
        ctx.moveTo(radius, 0);
        ctx.lineTo(w - radius, 0);
        ctx.quadraticCurveTo(w, 0, w, radius);
        ctx.lineTo(w, h - radius);
        ctx.quadraticCurveTo(w, h, w - radius, h);
        ctx.lineTo(radius, h);
        ctx.quadraticCurveTo(0, h, 0, h - radius);
        ctx.lineTo(0, radius);
        ctx.quadraticCurveTo(0, 0, radius, 0);
        ctx.fill();

        // 3. Draw Icon and Text Centered
        this.bitmap.fontSize = fontSize;
        
        if (this._icon > 0) {
            var iconSet = ImageManager.loadSystem('IconSet');
            var pw = Window_Base._iconWidth || 32;
            var ph = Window_Base._iconHeight || 32;
            var sx = (this._icon % 16) * pw;
            var sy = Math.floor(this._icon / 16) * ph;
            
            // Draw Icon on the left
            this.bitmap.blt(iconSet, sx, sy, pw, ph, 8, (h - ph) / 2);
            
            // Draw Text shifted to the right
            this.bitmap.drawText(this._text, 40, 0, w - 48, h, 'center');
        } else {
            // Draw Text perfectly centered if no icon
            this.bitmap.drawText(this._text, 0, 0, w, h, 'center');
        }
    };

    Sprite_ContextPopup.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (!this._character) return;
        
        if (this._character instanceof Game_Event) {
            if (this._pageIndex !== this._character._pageIndex) {
                this._pageIndex = this._character._pageIndex;
                this.refreshContext();
            }
        }

        if (this._text === "") {
            this.opacity -= 15;
            return;
        }

        this.updatePosition();
        this.updateVisibility();
    };

    Sprite_ContextPopup.prototype.updatePosition = function() {
        var bob = Math.sin(Graphics.frameCount / 15) * 3;
        this.x = this._character.screenX();
        this.y = this._character.screenY() - 48 + bob; 
    };

    Sprite_ContextPopup.prototype.updateVisibility = function() {
        if ($gameMap.isEventRunning() || !$gameSystem.isContextEnabled()) {
            this.opacity -= 15;
            return;
        }

        var px = $gamePlayer.x;
        var py = $gamePlayer.y;
        var cx = this._character.x;
        var cy = this._character.y;
        var dist = Math.abs(px - cx) + Math.abs(py - cy);

        var isFacing = false;
        var dir = $gamePlayer.direction();
        if (dir === 2 && py < cy && px === cx) isFacing = true; // Down
        if (dir === 8 && py > cy && px === cx) isFacing = true; // Up
        if (dir === 4 && px > cx && py === cy) isFacing = true; // Left
        if (dir === 6 && px < cx && py === cy) isFacing = true; // Right
        
        if (dist <= this._triggerDist && isFacing) {
            this.opacity += 15;
        } else {
            this.opacity -= 15;
        }
    };

    // Inject Global Toggle
    var _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._contextPopupsEnabled = true;
    };
    Game_System.prototype.isContextEnabled = function() { return this._contextPopupsEnabled; };
    
    // Inject into Spriteset_Map
    var _Spriteset_Map_createCharacters = Spriteset_Map.prototype.createCharacters;
    Spriteset_Map.prototype.createCharacters = function() {
        _Spriteset_Map_createCharacters.call(this);
        for (var i = 0; i < this._characterSprites.length; i++) {
            var char = this._characterSprites[i]._character;
            if (char instanceof Game_Event) {
                var popup = new Sprite_ContextPopup(char);
                this._tilemap.addChild(popup);
            }
        }
    };
})();