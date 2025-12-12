/*:
 * @plugindesc v1.1 - Hide skill/item icons in lists; draw small, right-justified MP/TP numbers. ES5 MV compatible.
 * @author ChatGPT
 *
 * Place this plugin after YEP_SkillCore and your Top-Right Dock plugin.
 * Removes icons from skill & item lists and draws numeric MP/TP costs right-aligned.
 */

(function() {
    "use strict";

    // === Config ===
    var COST_FONT_SIZE = 16;   // numeric MP/TP font size
    var RIGHT_PADDING = 6;     // px padding from right edge
    // ==============

    // Restore any instrumentation that might still be installed (avoid spam)
    try {
        if (window._trd_orig_drawIcon) {
            Window_Base.prototype.drawIcon = window._trd_orig_drawIcon;
            delete window._trd_orig_drawIcon;
        }
        if (window._trd_orig_drawItemName) {
            Window_Base.prototype.drawItemName = window._trd_orig_drawItemName;
            delete window._trd_orig_drawItemName;
        }
    } catch (e) { /* ignore */ }

    // Safe call helper
    function safeCall(orig, ctx, args) {
        try {
            if (orig) return orig.apply(ctx, args || []);
        } catch (e) {
            // don't break battle flow
            try { console.error(e); } catch (e2) {}
        }
        return null;
    }

    // Right-justify text inside the provided width (uses window.drawText with "right")
    function drawRightNumber(win, value, x, y, width) {
        if (!win || !win.contents) return;
        var oldSize = win.contents.fontSize;
        try {
            win.contents.fontSize = COST_FONT_SIZE;
            win.resetTextColor();
            win.drawText(String(value), x, y, width - RIGHT_PADDING, "right");
        } catch (e) {
            // fallback: try default drawText size
            try {
                win.contents.fontSize = oldSize;
                win.drawText(String(value), x, y, width - RIGHT_PADDING, "right");
            } catch (e2) {}
        } finally {
            win.contents.fontSize = oldSize;
            if (typeof win.resetFontSettings === "function") win.resetFontSettings();
        }
    }

    // Utility: draw MP number if cost > 0 (no icons)
    function drawMpNumber(win, skill, x, y, width) {
        try {
            if (!skill) return;
            var mp = Number(skill.mpCost || skill.mp || 0);
            if (!mp || mp <= 0) return;
            // attempt to set MP color (if provided by window)
            try {
                if (typeof win.mpCostColor === "function") win.changeTextColor(win.mpCostColor());
            } catch (e) {}
            drawRightNumber(win, mp, x, y, width);
            try { win.resetTextColor(); } catch (e) {}
        } catch (e) {
            // nothing
        }
    }

    // Utility: draw TP number if cost > 0 (no icons)
    function drawTpNumber(win, skill, x, y, width) {
        try {
            if (!skill) return;
            var tp = Number(skill.tpCost || skill.tp || 0);
            if (!tp || tp <= 0) return;
            try {
                if (typeof win.tpCostColor === "function") win.changeTextColor(win.tpCostColor());
            } catch (e) {}
            drawRightNumber(win, tp, x, y, width);
            try { win.resetTextColor(); } catch (e) {}
        } catch (e) {
            // nothing
        }
    }

    // A direct replacement for drawSkillCost that will not draw icons and will show numeric mp/tp right-justified.
    function drawSkillCostNoIcons(skill, x, y, width) {
        // prefer drawing MP first (matching YEP's typical layout), then TP if present
        drawMpNumber(this, skill, x, y, width);
        drawTpNumber(this, skill, x, y, width);
    }

    // Replacement for drawMpCost (defensive)
    function drawMpCostNoIcons(skill, x, y, width) {
        drawMpNumber(this, skill, x, y, width);
    }

    // Replacement for drawTpCost (defensive)
    function drawTpCostNoIcons(skill, x, y, width) {
        drawTpNumber(this, skill, x, y, width);
    }

    // Replacement for Window_ItemList.drawItem: don't draw icons, only name
    function drawItemNoIcon(index) {
        try {
            var item = this._data && this._data[index];
            if (!item) return;
            var rect = (typeof this.itemRectForText === "function") ? this.itemRectForText(index) : this.itemRect(index);
            this.resetTextColor();
            this.changePaintOpacity(this.isEnabled(item));
            this.drawText(item.name, rect.x + 6, rect.y, rect.width - 12, "left");
            this.changePaintOpacity(true);
        } catch (e) {
            return safeCall(_orig_Window_ItemList_drawItem, this, arguments);
        }
    }

    // Save originals (cover both Window_SkillList and Window_BattleSkill if present)
    var _orig_WinSkill_drawSkillCost = (typeof Window_SkillList !== "undefined" && Window_SkillList.prototype.drawSkillCost) ? Window_SkillList.prototype.drawSkillCost : null;
    var _orig_WinSkill_drawMpCost = (typeof Window_SkillList !== "undefined" && Window_SkillList.prototype.drawMpCost) ? Window_SkillList.prototype.drawMpCost : null;
    var _orig_WinSkill_drawTpCost = (typeof Window_SkillList !== "undefined" && Window_SkillList.prototype.drawTpCost) ? Window_SkillList.prototype.drawTpCost : null;

    var _orig_WinBattle_drawSkillCost = (typeof Window_BattleSkill !== "undefined" && Window_BattleSkill.prototype.drawSkillCost) ? Window_BattleSkill.prototype.drawSkillCost : null;
    var _orig_WinBattle_drawMpCost = (typeof Window_BattleSkill !== "undefined" && Window_BattleSkill.prototype.drawMpCost) ? Window_BattleSkill.prototype.drawMpCost : null;
    var _orig_WinBattle_drawTpCost = (typeof Window_BattleSkill !== "undefined" && Window_BattleSkill.prototype.drawTpCost) ? Window_BattleSkill.prototype.drawTpCost : null;

    var _orig_Window_ItemList_drawItem = (typeof Window_ItemList !== "undefined" && Window_ItemList.prototype.drawItem) ? Window_ItemList.prototype.drawItem : null;

    // Apply prototype-level patches for possible classes
    try {
        if (typeof Window_SkillList !== "undefined" && Window_SkillList.prototype) {
            Window_SkillList.prototype.drawSkillCost = drawSkillCostNoIcons;
            Window_SkillList.prototype.drawMpCost   = drawMpCostNoIcons;
            Window_SkillList.prototype.drawTpCost   = drawTpCostNoIcons;
        }
    } catch (e) { /* ignore */ }

    try {
        if (typeof Window_BattleSkill !== "undefined" && Window_BattleSkill.prototype) {
            Window_BattleSkill.prototype.drawSkillCost = drawSkillCostNoIcons;
            Window_BattleSkill.prototype.drawMpCost   = drawMpCostNoIcons;
            Window_BattleSkill.prototype.drawTpCost   = drawTpCostNoIcons;
        }
    } catch (e) { /* ignore */ }

    try {
        if (typeof Window_ItemList !== "undefined" && Window_ItemList.prototype) {
            Window_ItemList.prototype.drawItem = drawItemNoIcon;
        }
    } catch (e) { /* ignore */ }

    // Patch any existing instances on the current Scene_Battle (defensive)
    function patchSceneInstances(scene) {
        try {
            if (!scene) scene = SceneManager._scene;
            if (!scene) return;
            if (scene._skillWindow) {
                scene._skillWindow.drawSkillCost = drawSkillCostNoIcons;
                scene._skillWindow.drawMpCost   = drawMpCostNoIcons;
                scene._skillWindow.drawTpCost   = drawTpCostNoIcons;
            }
            if (scene._itemWindow) {
                scene._itemWindow.drawItem = drawItemNoIcon;
            }
        } catch (e) {}
    }

    // Hook Scene_Battle.createAllWindows to (re)apply patches after windows are created
    var _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function() {
        _Scene_Battle_createAllWindows.call(this);
        try {
            // reapply prototypes (in case YEP overwrote them after this plugin loaded)
            if (typeof Window_SkillList !== "undefined" && Window_SkillList.prototype) {
                Window_SkillList.prototype.drawSkillCost = drawSkillCostNoIcons;
                Window_SkillList.prototype.drawMpCost   = drawMpCostNoIcons;
                Window_SkillList.prototype.drawTpCost   = drawTpCostNoIcons;
            }
            if (typeof Window_BattleSkill !== "undefined" && Window_BattleSkill.prototype) {
                Window_BattleSkill.prototype.drawSkillCost = drawSkillCostNoIcons;
                Window_BattleSkill.prototype.drawMpCost   = drawMpCostNoIcons;
                Window_BattleSkill.prototype.drawTpCost   = drawTpCostNoIcons;
            }
            if (typeof Window_ItemList !== "undefined" && Window_ItemList.prototype) {
                Window_ItemList.prototype.drawItem = drawItemNoIcon;
            }
        } catch (e) {}
        // patch instances
        patchSceneInstances(this);
    };

    // Also patch now (if battle already running)
    try { patchSceneInstances(SceneManager._scene); } catch (e) {}

    // Reapply each frame while in Scene_Battle to resist other plugins changing behavior
    var _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        _Scene_Battle_update.call(this);
        try {
            if (SceneManager._scene && SceneManager._scene instanceof Scene_Battle) {
                // defensive re-apply
                try {
                    if (typeof Window_SkillList !== "undefined" && Window_SkillList.prototype) {
                        Window_SkillList.prototype.drawSkillCost = drawSkillCostNoIcons;
                        Window_SkillList.prototype.drawMpCost   = drawMpCostNoIcons;
                        Window_SkillList.prototype.drawTpCost   = drawTpCostNoIcons;
                    }
                    if (typeof Window_BattleSkill !== "undefined" && Window_BattleSkill.prototype) {
                        Window_BattleSkill.prototype.drawSkillCost = drawSkillCostNoIcons;
                        Window_BattleSkill.prototype.drawMpCost   = drawMpCostNoIcons;
                        Window_BattleSkill.prototype.drawTpCost   = drawTpCostNoIcons;
                    }
                    if (typeof Window_ItemList !== "undefined" && Window_ItemList.prototype) {
                        Window_ItemList.prototype.drawItem = drawItemNoIcon;
                    }
                } catch (e) {}
                patchSceneInstances(SceneManager._scene);
            }
        } catch (e) {}
    };

    // === Restore helper for debugging ===
    window.TRD_restoreSkillCostAndItemDraw = function() {
        try {
            if (_orig_WinSkill_drawSkillCost && typeof Window_SkillList !== "undefined") Window_SkillList.prototype.drawSkillCost = _orig_WinSkill_drawSkillCost;
            if (_orig_WinSkill_drawMpCost   && typeof Window_SkillList !== "undefined") Window_SkillList.prototype.drawMpCost   = _orig_WinSkill_drawMpCost;
            if (_orig_WinSkill_drawTpCost   && typeof Window_SkillList !== "undefined") Window_SkillList.prototype.drawTpCost   = _orig_WinSkill_drawTpCost;

            if (_orig_WinBattle_drawSkillCost && typeof Window_BattleSkill !== "undefined") Window_BattleSkill.prototype.drawSkillCost = _orig_WinBattle_drawSkillCost;
            if (_orig_WinBattle_drawMpCost   && typeof Window_BattleSkill !== "undefined") Window_BattleSkill.prototype.drawMpCost   = _orig_WinBattle_drawMpCost;
            if (_orig_WinBattle_drawTpCost   && typeof Window_BattleSkill !== "undefined") Window_BattleSkill.prototype.drawTpCost   = _orig_WinBattle_drawTpCost;

            if (_orig_Window_ItemList_drawItem && typeof Window_ItemList !== "undefined") Window_ItemList.prototype.drawItem = _orig_Window_ItemList_drawItem;

            patchSceneInstances(SceneManager._scene);
            console.log("TRD: Restored originals for skill/item cost/item draw methods.");
        } catch (e) {
            console.error(e);
        }
    };

    console.log("TRD: Installed skill/item icon removal + right-justified numeric cost patch.");
})();
