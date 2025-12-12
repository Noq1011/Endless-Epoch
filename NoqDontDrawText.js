/*:
 * @target MV
 * @plugindesc Radial Menu Patch — stop default list drawing & double input
 * @help Place BELOW your Circular Command plugin.
 */
(function() {
  'use strict';
  if (typeof Window_CircularCommand === 'undefined') return;

  // 1) Don't let Window_Command draw its vertical list at (0,0)
  Window_CircularCommand.prototype.refresh = function() {
    if (this.contents) this.contents.clear(); // no list text
  };
  Window_CircularCommand.prototype.drawItem = function(index) {};       // noop
  Window_CircularCommand.prototype.itemRect = function(index) {
    return new Rectangle(0, 0, 0, 0);
  };

  // 2) Disable built-in input/cursor handling from Window_Command
  Window_CircularCommand.prototype.processHandling   = function() {};
  Window_CircularCommand.prototype.processCursorMove = function() {};
  Window_CircularCommand.prototype.processOk         = function() {};
  Window_CircularCommand.prototype.processCancel     = function() {};

  // 3) Use Window_Base.update to avoid Window_Command's handlers entirely
  Window_CircularCommand.prototype.update = function() {
    Window_Base.prototype.update.call(this); // << important
    if (!this.visible) return;

    // simple easing (mirrors your CFG.SPIN_SPEED ~ 0.12)
    var spd = 0.12;

    // fade the PIXI container, not the window contents
    if (this._spinPhase === 1) {
      this._angle += (this._targetAngle - this._angle) * spd;
      this._container.alpha = Math.min(1, (this._container.alpha || 0) + 0.12);
      if (Math.abs(this._angle - this._targetAngle) < 0.01) {
        this._spinPhase = 0; this._container.alpha = 1;
      }
    } else if (this._spinPhase === 2) {
      this._angle += (this._targetAngle - this._angle) * spd;
      this._container.alpha = Math.max(0, (this._container.alpha || 1) - 0.12);
      if (this._container.alpha <= 0) { this._spinPhase = 0; this.visible = false; }
    }

    this._updatePosition();
    this._updateLabels();

    // keep your custom input handler
    if (this.active && this._spinPhase === 0) this._handleInput();
  };

  // 4) Make open/close drive the PIXI container alpha, not contentsOpacity
  var _open = Window_CircularCommand.prototype.startOpen;
  Window_CircularCommand.prototype.startOpen = function(battlerSprite) {
    this._battlerSprite = battlerSprite;
    this.visible = true;
    this._spinPhase = 1;
    this._angle = -Math.PI/2 - Math.PI;
    this._targetAngle = 0;
    this._activeIndex = 0;
    this._container.alpha = 0;
    this.activate();
  };

  var _close = Window_CircularCommand.prototype.startClose;
  Window_CircularCommand.prototype.startClose = function() {
    this._spinPhase = 2;
    this._targetAngle = this._angle - Math.PI;
    this.deactivate();
  };
})();