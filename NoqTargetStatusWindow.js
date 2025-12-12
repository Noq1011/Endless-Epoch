/*: * @plugindesc (MV) NoqBurnoutHUD v1.9b — vivid gauges, anchored menus, fixed skill spacing, white EN popup, hidden ally target window (safe), bottom help, default icons only. * @author Noq * * @help * Requires YEP_X_BattleSysATB.js. * Place below all ATB/HUD-affecting plugins. */ (function() { "use strict"; //-------------------------------------------- // CONFIG //-------------------------------------------- var CMD_OFFSET_X = -160; var HELP_Y_OFFSET = -8; //-------------------------------------------- // Scene_Battle – fix freeze by keeping actorWindow active //-------------------------------------------- var _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows; Scene_Battle.prototype.createAllWindows = function() { _Scene_Battle_createAllWindows.call(this); // Make ally target window invisible but functional if (this._actorWindow) { this._actorWindow.visible = false; this._actorWindow.opacity = 0; this._actorWindow.contentsOpacity = 0; this._actorWindow.backOpacity = 0; // Do NOT deactivate or close it — logic still needs to run } // Move help window to bottom full width if (this._helpWindow) { this._helpWindow.x = 0; this._helpWindow.width = Graphics.boxWidth; this._helpWindow.y = Graphics.boxHeight - this._helpWindow.height + HELP_Y_OFFSET; } }; //-------------------------------------------- // Anchor logic //-------------------------------------------- function findSpriteForActor(actor) { try { var scene = SceneManager._scene; if (!scene || !scene._spriteset) return null; var sprites = scene._spriteset._actorSprites || []; for (var i = 0; i < sprites.length; i++) { var s = sprites[i]; if (!s) continue; if (s._actor && s._actor === actor) return s; if (typeof s.actor === "function" && s.actor() === actor) return s; } } catch (e) {} return null; } function anchorWindowToBattler(win, actor, offsetX) { try { if (!win || !actor) return; var scene = SceneManager._scene; if (!scene || !scene._spriteset) return; var sprite = findSpriteForActor(actor); if (!sprite) return; var sx = Math.floor(sprite.x + (scene._spriteset.x || 0)); var sy = Math.floor(sprite.y + (scene._spriteset.y || 0)); var desiredX = sx + (offsetX || CMD_OFFSET_X); var desiredY = sy - Math.floor(win.height / 2); if (desiredX + win.width > Graphics.width - 8) desiredX = sx - win.width - (offsetX || CMD_OFFSET_X); if (desiredY < 8) desiredY = 8; if (desiredY + win.height > Graphics.height - 8) desiredY = Graphics.height - win.height - 8; win.x = desiredX; win.y = desiredY; } catch (e) {} } //-------------------------------------------- // Compact Fight/Escape window anchored to battler //-------------------------------------------- var _Scene_Battle_createPartyCommandWindow = Scene_Battle.prototype.createPartyCommandWindow; Scene_Battle.prototype.createPartyCommandWindow = function() { _Scene_Battle_createPartyCommandWindow.call(this); var w = this._partyCommandWindow; if (!w) return; w.standardFontSize = function() { return 14; }; w.standardPadding = function() { return 8; }; w.lineHeight = function() { return this.standardFontSize() + 8; }; var _open = w.open; w.open = function() { try { this.width = 130; this.height = this.fittingHeight(4); if (this.refresh) this.refresh(); } catch (e) {} _open.call(this); var actor = BattleManager.actor(); if (actor) anchorWindowToBattler(this, actor, CMD_OFFSET_X); }; var _update = w.update; w.update = function() { _update.call(this); var actor = BattleManager.actor(); if (actor && (this.visible || (this.isOpen && this.isOpen()))) { anchorWindowToBattler(this, actor, CMD_OFFSET_X); } }; }; //-------------------------------------------- // Compact skill/item list spacing //-------------------------------------------- function fixListWindowLayout(win) { if (!win) return; win.standardFontSize = function() { return 16; }; win.standardPadding = function() { return 8; }; win.lineHeight = function() { return this.standardFontSize() + 10; }; } var _Scene_Battle_createSkillWindow = Scene_Battle.prototype.createSkillWindow; Scene_Battle.prototype.createSkillWindow = function() { _Scene_Battle_createSkillWindow.call(this); fixListWindowLayout(this._skillWindow); }; var _Scene_Battle_createItemWindow = Scene_Battle.prototype.createItemWindow; Scene_Battle.prototype.createItemWindow = function() { _Scene_Battle_createItemWindow.call(this); fixListWindowLayout(this._itemWindow); }; //-------------------------------------------- // Reposition EN popup //-------------------------------------------- var _Scene_Battle_update = Scene_Battle.prototype.update; Scene_Battle.prototype.update = function() { _Scene_Battle_update.call(this); var scene = this; if (scene._noqEnPopup && scene._skillWindow) { var sw = scene._skillWindow; if (sw.visible && sw.isOpen && sw.isOpen()) { var skill = sw._data && sw._data[sw.index()]; if (skill) { var en = Number(skill.mpCost || skill.mp || 0); var text = "EN: " + en; scene._noqEnPopup._label.text = text; var pad = 6; var w = scene._noqEnPopup._label.width + pad * 2; var h = scene._noqEnPopup._label.height + pad * 2; scene._noqEnPopup._bg.clear(); scene._noqEnPopup._bg.beginFill(0xffffff, 1.0); scene._noqEnPopup._bg.drawRoundedRect(-w / 2, -h / 2, w, h, 8); scene._noqEnPopup._bg.endFill(); scene._noqEnPopup._bg.lineStyle(2, 0x000000, 0.15); scene._noqEnPopup._bg.drawRoundedRect(-w / 2, -h / 2, w, h, 8); scene._noqEnPopup.x = sw.x + sw.width / 2; scene._noqEnPopup.y = sw.y + sw.height + 12; scene._noqEnPopup.visible = true; scene._noqEnPopup.alpha = 1; } } else { scene._noqEnPopup.visible = false; } } }; //-------------------------------------------- // Disable YEP skill icons, keep default icons only //-------------------------------------------- (function() { if (typeof Window_SkillList !== "undefined") { var _drawItem = Window_SkillList.prototype.drawItem; Window_SkillList.prototype.drawItem = function(index) { var skill = this._data[index]; if (!skill) return; var rect = this.itemRect(index); var iconX = rect.x + 2; var iconY = rect.y + (rect.height - Window_Base._iconHeight) / 2; // Draw default icon only this.drawIcon(skill.iconIndex, iconX, iconY); this.resetTextColor(); this.changePaintOpacity(this.isEnabled(skill)); this.drawText(skill.name, iconX + 34, rect.y, rect.width - 40, "left"); this.resetFontSettings(); }; } })(); })(); /*: * @plugindesc (MV) NoqBurnoutHUD v1.9c — same as v1.9b but with smaller skill icons (24 px) for a cleaner layout. * @author Noq */ (function() { "use strict"; // keep your entire HUD + command anchoring as-is (assumes v1.9b loaded above) //--- Replace skill list icon draw with scaled version if (typeof Window_SkillList !== "undefined") { // add scaled icon method Window_Base.prototype.drawIconScaled = function(iconIndex, x, y, size) { size = size || 24; var bitmap = ImageManager.loadSystem("IconSet"); var pw = Window_Base._iconWidth; var ph = Window_Base._iconHeight; var sx = iconIndex % 16 * pw; var sy = Math.floor(iconIndex / 16) * ph; this.contents.blt(bitmap, sx, sy, pw, ph, x, y, size, size); }; // replace skill draw Window_SkillList.prototype.drawItem = function(index) { var skill = this._data[index]; if (!skill) return; var rect = this.itemRect(index); // smaller default icon (24 px) var iconSize = 18; var iconX = rect.x + 2; var iconY = rect.y + (rect.height - iconSize) / 2; this.drawIconScaled(skill.iconIndex, iconX, iconY, iconSize); // text this.resetTextColor(); this.changePaintOpacity(this.isEnabled(skill)); this.drawText(skill.name, iconX + iconSize + 6, rect.y, rect.width - iconSize - 10, "left"); this.resetFontSettings(); }; } })();


/*:
 * @plugindesc (MV) NoqBurnoutHUD — Target Status Expansion + Harmony Integration v1.0
 * @author Noq
 * @requires YEP_BattleEngineCore
 *
 * @help
 * Adds richer information to the target window when selecting a skill target:
 *  • Hides Actor Command window while choosing a target.
 *  • Shows Buff/Debuff summary (colored text).
 *  • Shows State icons.
 *  • Shows current Harmony chain info (Skill + Verse).
 */

(function() {
  "use strict";

  //-----------------------------------------------------------------------------
  // Hide command window during target selection
  //-----------------------------------------------------------------------------
(function() {
  const _Scene_Battle_selectEnemySelection = Scene_Battle.prototype.selectEnemySelection;
  Scene_Battle.prototype.selectEnemySelection = function() {
    _Scene_Battle_selectEnemySelection.call(this);
    if (this._enemyWindow) {
      this._enemyWindow.refresh(); // Force re-render with our new drawItem
    }
  };
})();

  const _Scene_Battle_onEnemyOk = Scene_Battle.prototype.onEnemyOk;
  Scene_Battle.prototype.onEnemyOk = function() {
    if (this._actorCommandWindow) this._actorCommandWindow.show();
    _Scene_Battle_onEnemyOk.call(this);
  };

  const _Scene_Battle_onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
  Scene_Battle.prototype.onEnemyCancel = function() {
    if (this._actorCommandWindow) this._actorCommandWindow.show();
    _Scene_Battle_onEnemyCancel.call(this);
  };

  //-----------------------------------------------------------------------------
  // Extend Window_BattleEnemy to show rich info
  //-----------------------------------------------------------------------------
  const _Window_BattleEnemy_drawItem = Window_BattleEnemy.prototype.drawItem;
  Window_BattleEnemy.prototype.drawItem = function(index) {
    const enemy = this._enemies[index];
    if (!enemy) return;

    const rect = this.itemRectForText(index);
    this.resetTextColor();

    // 1. Enemy Name
    this.drawText(enemy.name(), rect.x, rect.y, rect.width);

    // 2. Buff/Debuff line
    const y2 = rect.y + this.lineHeight();
    const buffList = this.makeBuffSummary(enemy);
    this.drawTextEx(buffList, rect.x + 10, y2);

    // 3. State Icons
    const y3 = y2 + this.lineHeight();
    this.drawStateIcons(enemy, rect.x + 10, y3);

    // 4. Harmony Info (if active)
    const y4 = y3 + this.lineHeight();
    const harmonyText = this.makeHarmonyLine(enemy);
    if (harmonyText) {
      this.changeTextColor(this.textColor(14)); // cyan tone
      this.drawText(harmonyText, rect.x + 10, y4, rect.width);
    }

    // spacing between enemies
    this.contents.fontSize = 28;
  };

  //-----------------------------------------------------------------------------
  // Helper: Build Buff/Debuff summary line
  //-----------------------------------------------------------------------------
  Window_BattleEnemy.prototype.makeBuffSummary = function(enemy) {
    if (!enemy || !enemy.buffIcons) return "";

    const names = ["Verse","Atk","Def","M.Def","Agi","Resonance"];
    const params = [8,2,3,4,6,7]; // m.atk, atk, def, m.def, agi, luk
    let summary = "";

    for (let i = 0; i < params.length; i++) {
      const val = enemy._buffs[params[i]];
      if (val > 0) {
        this.changeTextColor(this.textColor(24)); // green
        summary += names[i] + "↑  ";
      } else if (val < 0) {
        this.changeTextColor(this.textColor(10)); // red
        summary += names[i] + "↓  ";
      }
    }

    // Burnout/HP/MP - shown as neutral text
    this.resetTextColor();
    summary += "HP/MP/Burnout";
    return summary;
  };

  //-----------------------------------------------------------------------------
  // Helper: Draw state icons inline
  //-----------------------------------------------------------------------------
  Window_BattleEnemy.prototype.drawStateIcons = function(enemy, x, y) {
    const icons = enemy.allIcons();
    if (!icons.length) return;
    const iconSize = Window_Base._iconWidth;
    for (let i = 0; i < icons.length; i++) {
      const ix = x + (i * (iconSize + 2));
      this.drawIcon(icons[i], ix, y);
    }
  };

  //-----------------------------------------------------------------------------
  // Helper: Harmony Info line
  //-----------------------------------------------------------------------------
  Window_BattleEnemy.prototype.makeHarmonyLine = function(enemy) {
    if (!enemy._harmonyQueue || enemy._harmonyQueue.length === 0) return "";
    const queue = enemy._harmonyQueue.slice(-3);
    const names = queue.map(e => {
      const skill = $dataSkills[e.id];
      return skill ? skill.name : "???";
    });
    return "Harmony: " + names.join(" + ");
  };

})();

/*:
 * @plugindesc (MV) Target Status Window Expansion — Force Override for YEP_BattleEngineCore
 * @author Noq
 */
(function() {
  "use strict";

  // --- Override Yanfly's Enemy Window Drawing ---
  Window_BattleEnemy.prototype.drawItem = function(index) {
    const enemy = this._enemies[index];
    if (!enemy) return;

    const rect = this.itemRectForText(index);
    this.contents.fontSize = 22;
    this.resetTextColor();

    // 1. Enemy Name
    this.drawText(enemy.name(), rect.x, rect.y, rect.width, "left");

    // 2. Buffs/Debuffs
    let y2 = rect.y + this.lineHeight();
    let buffText = this.makeBuffSummary(enemy);
    if (buffText && buffText.length > 0) {
      this.drawTextEx(buffText, rect.x + 8, y2);
      y2 += this.lineHeight();
    }

    // 3. State Icons
    this.drawStateIcons(enemy, rect.x + 8, y2);
    y2 += this.lineHeight() + 6;

    // 4. Harmony info line
    const harmonyLine = this.makeHarmonyLine(enemy);
    if (harmonyLine) {
      this.changeTextColor(this.textColor(14)); // cyan
      this.drawText(harmonyLine, rect.x + 8, y2, rect.width, "left");
      this.resetTextColor();
    }
  };

  // Buff summary helper (same logic as before)
  Window_BattleEnemy.prototype.makeBuffSummary = function(enemy) {
    const names = ["Verse","Atk","Def","M.Def","Agi","Resonance"];
    const params = [8,2,3,4,6,7]; // param ids
    let summary = "";

    for (let i = 0; i < params.length; i++) {
      const val = enemy._buffs[params[i]];
      if (val > 0) {
        this.changeTextColor(this.textColor(24)); // green
        summary += names[i] + "↑  ";
      } else if (val < 0) {
        this.changeTextColor(this.textColor(10)); // red
        summary += names[i] + "↓  ";
      }
    }

    this.resetTextColor();
    if (summary === "") summary = "\\c[0]No Buffs/Debuffs";
    return summary;
  };

  // Inline state icons (unchanged)
  Window_BattleEnemy.prototype.drawStateIcons = function(enemy, x, y) {
    const icons = enemy.allIcons();
    if (!icons.length) return;
    const iw = Window_Base._iconWidth;
    for (let i = 0; i < icons.length; i++) {
      this.drawIcon(icons[i], x + i * (iw + 2), y);
    }
  };

  // Harmony line from harmonization system
  Window_BattleEnemy.prototype.makeHarmonyLine = function(enemy) {
    if (!enemy._harmonyQueue || enemy._harmonyQueue.length === 0) return "";
    const queue = enemy._harmonyQueue.slice(-3);
    const names = queue.map(e => {
      const skill = $dataSkills[e.id];
      return skill ? skill.name : "???";
    });
    return "Harmony: " + names.join(" + ");
  };
})();
