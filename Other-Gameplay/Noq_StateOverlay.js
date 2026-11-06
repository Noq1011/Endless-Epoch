/*:
 * @target MV
 * @plugindesc (MV ES5) State Overlay System (Ice, Auto-Resize, Multi-layer, Mechanics)
 * @author Noq (Upgraded by Gemini)
 *
 * @help
 * Requires images in img/system:
 * - Overlay_Ice.png (Base shell)
 * - Overlay_Ice_Particles.png (Floating particles - optional)
 * - Overlay_Ice_Mist.png (Breath mist - optional)
 */

(function(){
'use strict';

// ===============================
// Configuration
// ===============================
var CONFIG = {
    frozenStateId: 10,     // ID of your "Frozen" state in the database
    fireElementId: 2,      // ID of Fire element (melts ice instantly)
    physElementId: 1,      // ID of Physical element (shatters ice for bonus dmg)
    shatterMultiplier: 1.5 // Damage multiplier when shattering the ice
};

// ===============================
// Parse notetag
// ===============================
function getOverlayTag(state){
    if (!state || !state.meta) return null;
    return state.meta.Overlay || null;
}

// ===============================
// Extend Sprite_Battler (Visuals)
// ===============================
var _initMembers = Sprite_Battler.prototype.initMembers;
Sprite_Battler.prototype.initMembers = function(){
    _initMembers.call(this);
    this._noqOverlayContainer = null;
    this._noqOverlayName = null;
};

var _update = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function(){
    _update.call(this);
    this.updateStateOverlay();
};

Sprite_Battler.prototype.updateStateOverlay = function(){
    if (!this._battler) return;

    var states = this._battler.states();
    var overlayName = null;

    // Find first state with overlay
    for (var i = 0; i < states.length; i++){
        var tag = getOverlayTag(states[i]);
        if (tag){
            overlayName = tag;
            break;
        }
    }

    // If overlay changed → refresh sprite
    if (this._noqOverlayName !== overlayName){
        this._noqOverlayName = overlayName;
        this.refreshOverlay();
    }

    // Animate if exists
    if (this._noqOverlayContainer){
        this.animateOverlay();
    }
};

// ===============================
// Create/remove overlay (Multi-layer)
// ===============================
Sprite_Battler.prototype.refreshOverlay = function(){
    // Remove old container
    if (this._noqOverlayContainer){
        this.removeChild(this._noqOverlayContainer);
        this._noqOverlayContainer = null;
    }

    if (!this._noqOverlayName) return;

    // Create main container
    this._noqOverlayContainer = new Sprite(); 
    this._noqOverlayContainer.x = 0;
    this._noqOverlayContainer.y = -this.height / 2; // Center vertically on battler
    
    // 1. Base Shell
    var shell = new Sprite();
    shell.bitmap = ImageManager.loadSystem('Overlay_' + this._noqOverlayName);
    shell.anchor.x = 0.5;
    shell.anchor.y = 0.5;
    this._noqOverlayContainer.addChild(shell);
    this._noqOverlayContainer._shell = shell;

    // 2. Particles (Additive Blending)
    var parts = new Sprite();
    parts.bitmap = ImageManager.loadSystem('Overlay_' + this._noqOverlayName + '_Particles');
    parts.anchor.x = 0.5;
    parts.anchor.y = 0.5;
    parts.blendMode = 1; // ADD
    this._noqOverlayContainer.addChild(parts);
    this._noqOverlayContainer._parts = parts;

    // 3. Mist (Screen Blending)
    var mist = new Sprite();
    mist.bitmap = ImageManager.loadSystem('Overlay_' + this._noqOverlayName + '_Mist');
    mist.anchor.x = 0.5;
    mist.anchor.y = 0.5;
    mist.blendMode = 3; // SCREEN
    this._noqOverlayContainer.addChild(mist);
    this._noqOverlayContainer._mist = mist;

    this.addChild(this._noqOverlayContainer);
    this.startOverlayPopIn();
};

Sprite_Battler.prototype.startOverlayPopIn = function(){
    var c = this._noqOverlayContainer;
    if (!c) return;
    c._noqAnimFrame = 0;
    c._baseScale = null; // Reset scale calculation
};

// ===============================
// Animate & Auto-Resize
// ===============================
Sprite_Battler.prototype.animateOverlay = function(){
    var c = this._noqOverlayContainer;
    if (!c) return;

    var shell = c._shell;
    var parts = c._parts;
    var mist = c._mist;

    // --- AUTO-RESIZE CALCULATION ---
    // Wait until both the battler bitmap and overlay bitmap are fully loaded
    if (!c._baseScale && shell.bitmap && shell.bitmap.isReady() && this.bitmap && this.bitmap.isReady()) {
        var targetWidth = this._mainSprite ? this._mainSprite.width : this.width;
        var targetHeight = this._mainSprite ? this._mainSprite.height : this.height;
        
        if (targetWidth > 0 && shell.bitmap.width > 0) {
            var scaleX = targetWidth / shell.bitmap.width;
            var scaleY = targetHeight / shell.bitmap.height;
            // Use the larger scale to ensure it covers the sprite, plus 20% padding
            c._baseScale = Math.max(scaleX, scaleY) * 1.2; 
        }
    }

    var baseScale = c._baseScale || 1;
    var f = c._noqAnimFrame || 0;
    var currentScale = baseScale;

    // --- POP-IN ANIMATION ---
    if (f < 15){
        var t = f / 15;
        if (t < 0.7){
            currentScale = baseScale * (t * 1.6); // grow fast
        } else {
            currentScale = baseScale * (1.1 - (t - 0.7) * 0.33); // settle
        }
        c.scale.x = currentScale;
        c.scale.y = currentScale;
        c.opacity = 255 * t;
        c._noqAnimFrame++;
        return;
    }

    // --- IDLE ANIMATIONS ---
    c.scale.x = baseScale;
    c.scale.y = baseScale;

    // Shimmer the base shell
    shell.opacity = 160 + Math.sin(Graphics.frameCount / 10) * 20;

    // Float particles upwards
    if (parts.bitmap.isReady()) {
        parts.y -= 0.5;
        parts.opacity = 150 + Math.sin(Graphics.frameCount / 5) * 50;
        if (parts.y < -50) parts.y = 50; // loop particles
    }

    // Gently pulse/rotate mist
    if (mist.bitmap.isReady()) {
        mist.rotation += 0.005;
        mist.scale.x = 1.0 + Math.sin(Graphics.frameCount / 20) * 0.1;
        mist.scale.y = 1.0 + Math.cos(Graphics.frameCount / 20) * 0.1;
    }
};

// ===============================
// Freeze Behavior: Stop Motion
// ===============================
var _Sprite_Actor_updateMotion = Sprite_Actor.prototype.updateMotion;
Sprite_Actor.prototype.updateMotion = function() {
    // If the actor is frozen, skip updating their animation frames
    if (this._actor && this._actor.isStateAffected(CONFIG.frozenStateId)) {
        return; 
    }
    _Sprite_Actor_updateMotion.call(this);
};

// ===============================
// Mechanics: Melt and Shatter
// ===============================
var _Game_Action_executeDamage = Game_Action.prototype.executeDamage;
Game_Action.prototype.executeDamage = function(target, value) {
    if (target.isStateAffected(CONFIG.frozenStateId) && value > 0) {
        var elementId = this.item().damage.elementId;

        // Melt logic (Fire element)
        if (elementId === CONFIG.fireElementId) {
            target.removeState(CONFIG.frozenStateId);
            // Optional: You could reduce the fire damage here if you want 
            // the ice to act as a "shield" absorbing the hit.
        } 
        // Shatter logic (Physical element)
        else if (elementId === CONFIG.physElementId) {
            value = Math.floor(value * CONFIG.shatterMultiplier); // Bonus damage
            target.removeState(CONFIG.frozenStateId);
            // Play a shatter sound effect here if desired:
            // AudioManager.playSe({name: 'Ice1', volume: 90, pitch: 120, pan: 0});
        }
    }
    
    _Game_Action_executeDamage.call(this, target, value);
};

})();