/*:
 * @plugindesc v2.0 Menu clock integrated into gold window (DayNightCore sync)
 * @author Tyson
 */

(function() {
  console.log("DayNightUI_Fix v2.0 loaded");

  // --- Extend Window_Gold to include Day/Time ---
  var _Window_Gold_refresh = Window_Gold.prototype.refresh;
  Window_Gold.prototype.refresh = function() {
    _Window_Gold_refresh.call(this);
    if (typeof DayNight === "undefined") return;

    var x = this.textPadding();
    var y = 0;
    var w = this.contentsWidth();

    // Calculate values
    var h = Math.floor(DayNight.hour()) % 24;
    var m = Math.floor(DayNight.minute()) % 60;
    var d = DayNight.day();

    var hour = String(h).padStart(2, "0");
    var min  = String(m).padStart(2, "0");

    // Draw left side (Day/Time)
    this.resetTextColor();
    this.changeTextColor(this.systemColor());
    this.drawText("Day " + d, x, y, w / 2 - 6, "left");
    this.resetTextColor();
    this.drawText(hour + ":" + min, x, this.lineHeight(), w / 2 - 6, "left");
  };

  // --- Lift and expand gold window position ---
  var _Scene_Menu_createGoldWindow = Scene_Menu.prototype.createGoldWindow;
  Scene_Menu.prototype.createGoldWindow = function() {
    _Scene_Menu_createGoldWindow.call(this);
    if (this._goldWindow) {
      var gw = this._goldWindow;
      gw.width = 240;
      gw.height = gw.fittingHeight(2);
      gw.x = 0;
      gw.y = Graphics.boxHeight - gw.height - 2; // small lift from bottom edge
      gw.createContents();
      gw.refresh();
    }
  };

  // --- Update gold window regularly to reflect time ---
  var _Scene_Menu_update = Scene_Menu.prototype.update;
  Scene_Menu.prototype.update = function() {
    _Scene_Menu_update.call(this);
    if (this._goldWindow && this._goldWindow.refresh) this._goldWindow.refresh();
  };
})();
