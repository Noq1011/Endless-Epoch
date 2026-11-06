/*:
 * @target MV
 * @plugindesc Activates "auto-run" events via a universal switch instead of autorun/self switches
 * @author Tyson
 *
 * Usage:
 * 1. Remove autorun/parallel triggers from events you want to auto-run.
 * 2. Set Trigger to "Conditional Branch: Switch 152 ON" (or just use the switch in the page condition).
 * 3. Add <StartAuto> in the event's note field.
 * 4. This plugin will turn ON Switch 152 after the map fully loads.
 */

(function() {
    const UNIVERSAL_SWITCH_ID = 152;

    const _Scene_Map_start = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _Scene_Map_start.call(this);

        // Delay until first frame to ensure all events are initialized
        setTimeout(() => {
            const events = $gameMap.events();
            if (!events) return;

            let hasStartAuto = false;
            for (let i = 0; i < events.length; i++) {
                const ev = events[i];
                if (!ev || !ev.event) continue;
                if (ev.event().note.includes("<StartAuto>")) {
                    hasStartAuto = true;
                }
            }

            if (hasStartAuto) {
                $gameSwitches.setValue(UNIVERSAL_SWITCH_ID, true);
            }
        }, 1);
    };
})();