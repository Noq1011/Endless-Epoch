/*:
 * @plugindesc Adds simple <i>...</i> and <b>...</b> inline tags for italics / bold in message text (RPG Maker MV).
 * @author You
 *
 * Usage:
 *   <i>italic text</i>
 *   <b>bold text</b>
 *
 * This plugin converts tags to internal escape codes and toggles Bitmap font flags.
 */
(function() {
  'use strict';

  // --- convert tags (<i>, </i>, <b>, </b>) into custom escape sequences ---
  const _Window_Base_convertEscapeCharacters = Window_Base.prototype.convertEscapeCharacters;
  Window_Base.prototype.convertEscapeCharacters = function(text) {
    text = _Window_Base_convertEscapeCharacters.call(this, text);
    if (text) {
      // convert open/close tags to single-character escape codes
      text = text.replace(/<i>/gi, '\x1bI');     // toggle italic
      text = text.replace(/<\/i>/gi, '\x1bI');   // toggle italic (same code toggles off)
      text = text.replace(/<b>/gi, '\x1bB');     // toggle bold
      text = text.replace(/<\/b>/gi, '\x1bB');   // toggle bold
    }
    return text;
  };

  // --- make sure resetFontSettings respects our toggle flags ---
  const _Window_Base_resetFontSettings = Window_Base.prototype.resetFontSettings;
  Window_Base.prototype.resetFontSettings = function() {
    _Window_Base_resetFontSettings.call(this);
    // Ensure bitmap fields exist; some setups may not set them yet
    if (this.contents) {
      // Use our flags stored on the window (safer than attaching to Bitmap)
      this.contents.fontItalic = !!this._inlineFontItalic;
      this.contents.fontBold = !!this._inlineFontBold;
    }
  };

  // --- processEscapeCharacter: handle our I and B codes ---
  const _Window_Base_processEscapeCharacter = Window_Base.prototype.processEscapeCharacter;
  Window_Base.prototype.processEscapeCharacter = function(code, textState) {
    // custom toggles
    if (code === 'I') {
      // toggle italic flag for this window
      this._inlineFontItalic = !this._inlineFontItalic;
      // reset font settings so the next drawn substring uses the updated flags
      this.resetFontSettings();
      return;
    }
    if (code === 'B') {
      // toggle bold flag
      this._inlineFontBold = !this._inlineFontBold;
      this.resetFontSettings();
      return;
    }
    // otherwise call original handler (keeps compatibility)
    _Window_Base_processEscapeCharacter.call(this, code, textState);
  };

  // Initialize flags when a window is created (safe default)
  const _Window_Base_initialize = Window_Base.prototype.initialize;
  Window_Base.prototype.initialize = function() {
    _Window_Base_initialize.call(this);
    this._inlineFontItalic = false;
    this._inlineFontBold = false;
  };

})();
