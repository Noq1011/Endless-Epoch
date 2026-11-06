/*:
 * @target MV
 * @plugindesc v1.1 Noq Static Quest Markers (Comment-Driven PNG Loader)
 * @author Noq + Gemini
 *
 * @help
 * ============================================================================
 * HOW TO USE
 * ============================================================================
 * Inside an Event, create a Comment on the page you want the marker to appear.
 * * Use this exact format:
 * <QuestMarker: QuestMarker_Yellow>
 * * Replace 'QuestMarker_Yellow' with the exact filename of your image 
 * located inside your project's img/system/ folder.
 * * The marker will float up and down above the event perpetually, 
 * regardless of where the player is facing. 
 * When the event changes to a page without this comment, the marker vanishes.
 */

(function() {
    'use strict';

    // -------------------------------------------------------------------------
    // 1. Parse Event Page Comments on Setup
    // -------------------------------------------------------------------------
    var _Game_Event_setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        _Game_Event_setupPage.call(this);
        
        // Reset marker image name when page changes
        this._noqStaticMarkerImage = null; 
        
        if (this.page()) {
            var list = this.list();
            for (var i = 0; i < list.length; i++) {
                if (list[i].code === 108 || list[i].code === 408) { // Comment commands
                    var comment = list[i].parameters[0];
                    // Matches alphanumeric, underscores, and dashes for filenames
                    var match = comment.match(/<QuestMarker:\s*([a-zA-Z0-9_-]+)>/i);
                    if (match) {
                        this._noqStaticMarkerImage = match[1];
                    }
                }
            }
        }
    };

    // -------------------------------------------------------------------------
    // 2. Draw and Animate the Marker on the Map
    // -------------------------------------------------------------------------
    var _Sprite_Character_update = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _Sprite_Character_update.call(this);
        this.updateNoqStaticMarker();
    };

    Sprite_Character.prototype.updateNoqStaticMarker = function() {
        // Only apply to Map Events
        if (!this._character || !(this._character instanceof Game_Event)) return;

        var imageName = this._character._noqStaticMarkerImage;

        if (imageName) {
            // Create the sprite if it doesn't exist yet
            if (!this._noqMarkerSprite) {
                this._noqMarkerSprite = new Sprite();
                this._noqMarkerSprite.anchor.x = 0.5;
                this._noqMarkerSprite.anchor.y = 1;
                this._noqMarkerSprite.z = 8; // Float above character/event
                this.addChild(this._noqMarkerSprite);
            }
            
            // Load the image from img/system/ if not already loaded or if it changed
            if (this._noqMarkerLoadedImg !== imageName) {
                this._noqMarkerSprite.bitmap = ImageManager.loadSystem(imageName);
                this._noqMarkerLoadedImg = imageName;
            }
            
            this._noqMarkerSprite.visible = true;
            
            // Gentle hovering animation using a sine wave
            var time = Graphics.frameCount;
            var floatY = Math.sin(time * 0.05) * 4; 
            
            // Determine height (fallback to 48 if it's an invisible/graphic-less event like a bookshelf)
            var eventHeight = this.patternHeight() > 0 ? this.patternHeight() : 48;
            
            this._noqMarkerSprite.x = 0;
            this._noqMarkerSprite.y = -eventHeight - 4 + floatY;
            
        } else {
            // Hide the sprite if the page has changed and has no comment
            if (this._noqMarkerSprite) {
                this._noqMarkerSprite.visible = false;
            }
        }
    };

})();