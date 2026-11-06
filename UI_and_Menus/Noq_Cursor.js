/*:
 * @plugindesc Noq Gradient Cursor Overlay (Animated)
 * @author Noq
 */

(function() {

const _Window_update = Window.prototype.update;
Window.prototype.update = function() {
    _Window_update.call(this);

    if (!(this instanceof Window_Selectable)) return;
    if (!this.active) return;

    const cursor = this._windowCursorSprite;
    if (!cursor) return;

    // Create gradient overlay once
if (!this._gradientCursor) {
        this._gradientCursor = new Sprite(new Bitmap(1, 1));
        // Lowering to 130 makes it look like a lens flare/glow rather than solid paint
        this._gradientCursor.opacity = 130; 
        this._gradientCursor.blendMode = PIXI.BLEND_MODES.ADD;
        this.addChild(this._gradientCursor);
    }

    const g = this._gradientCursor;

    // Match cursor position/size
    g.x = cursor.x;
    g.y = cursor.y;
    g.width = cursor.width;
    g.height = cursor.height;

    // Rebuild gradient bitmap if size changed
    if (!g.bitmap || g.bitmap.width !== cursor.width || g.bitmap.height !== cursor.height) {
        g.bitmap = new Bitmap(cursor.width, cursor.height);
    }

// Slower timing for a more professional "drift"
    const t = Graphics.frameCount * 0.01;

    // Deep Sky Blue (Saturation 40%, Lightness 50%)
    const color1 = _hslToHex(215, 40, 50); 
    // Royal Indigo (Saturation 35%, Lightness 45%)
    const color2 = _hslToHex(245, 35, 45);

    g.bitmap.clear();
    g.bitmap.gradientFillRect(
        0, 0,
        g.bitmap.width,
        g.bitmap.height,
        color1,
        color2,
        false // horizontal gradient
    );
};

// --- HSL → HEX helper ---
function _hslToHex(h, s, l) {
    s /= 100;
    l /= 100;

    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = l - c / 2;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    // This converts the numbers to a standard CSS hex string like #4a6fa5
    const colorCode = (r << 16) | (g << 8) | b;
    return '#' + colorCode.toString(16).padStart(6, '0');
}

})();