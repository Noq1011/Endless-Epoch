/*:
 * @plugindesc Borderless, Gradient-based UI for a modern look.
 * @author Gemini
 * * @help This plugin removes window borders and applies a vertical 
 * gradient to window backgrounds to create a "pop" effect.
 */

(function() {

    // 1. Remove the Border (Frame)
    // We override the internal _refreshFrame method to do nothing.
    Window_Base.prototype._refreshFrame = function() {
        // No code here = No border drawn
    };

    // 2. Customize the Background
    // We override _refreshBack to draw a custom gradient instead of the windowskin.
    Window_Base.prototype._refreshBack = function() {
        const w = this._width;
        const h = this._height;
        const m = 4; // Margin to prevent clipping
        
        this._windowBackSprite.bitmap = new Bitmap(w, h);
        const canv = this._windowBackSprite.bitmap.canvas;
        const ctx = canv.getContext('2d');

        // Create Gradient (Top to Bottom)
        // Adjust these colors to match your theme!
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, 'rgba(40, 40, 60, 0.9)');  // Lighter top
        gradient.addColorStop(1, 'rgba(10, 10, 20, 0.95)'); // Darker bottom
        
        ctx.save();
        ctx.fillStyle = gradient;
        
        // Draw the main body
        ctx.fillRect(0, 0, w, h);

        // 3. Add a "Light Bevel" (Top Highlight)
        // This creates a thin 1px line at the top to make it "pop"
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(0, 0, w, 2); 
        
        ctx.restore();
        this._windowBackSprite.setFrame(0, 0, w, h);
    };

})();