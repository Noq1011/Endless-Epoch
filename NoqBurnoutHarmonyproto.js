/*:
 * @plugindesc Harmonization System (Target-Specific) — each enemy/ally tracks its own combo window for harmonized verse combos.
 * @author Tyson
 *
 * @help
 * - When an actor hits a target, a combo window opens for that target.
 * - Subsequent compatible verses hitting the SAME target within that window continue the combo.
 * - Physical hits or tagged “break” skills can end the combo early.
 * - 2-verse combos apply a state; 3+ verse combos trigger harmonized skills.
 *
 * Future: Add tags like <HarmonyBreak>, <HarmonyExtend>, <HarmonyContinue>
 */

var Harmonization = Harmonization || {};

(function() {
    'use strict';

    // -------------------------
    // Config
    // -------------------------
    const HARMONY_WINDOW = 1500; // frames before combo expires per target
    const HARMONY_STATE_ID = 50; // 2-verse combo reward
    const COMBO_BREAK_TAG = "HarmonyBreak"; // future tag for breaking harmony
    const COMBO_EXTEND_TAG = "HarmonyExtend"; // for extending time
    const COMBO_CONTINUE_TAG = "HarmonyContinue"; // for alternate chain continuation

    // -------------------------
    // Harmonization Table
    // -------------------------
    Harmonization.Table = [
        { sequence: [51, 16], result: 25, type: 'state' }, // Stream + Spark → Apply State
        { sequence: [16, 51], result: 25, type: 'state' },
        { sequence: [51, 16, 9], result: 188, type: 'skill' } // Earth + Light + Water → Radiant Bloom
    ];

    // -------------------------
    // Extend Game_Battler
    // -------------------------
    const _Game_Battler_initMembers = Game_Battler.prototype.initMembers;
    Game_Battler.prototype.initMembers = function() {
        _Game_Battler_initMembers.call(this);
        this._harmonyQueue = []; // record of skill hits {id, actorId, frame}
        this._harmonyTimer = 0;
    };

    // -------------------------
    // Record skill applications
    // -------------------------
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);

        try {
            const user = this.subject();
            const skill = this.item();

            if (!user.isActor() || !skill) return;
            if (!target || !target.isAlive()) return;

            // If this skill "breaks" harmony, wipe target queue immediately
            if (skill.meta[COMBO_BREAK_TAG]) {
                target._harmonyQueue = [];
                console.log(`[Harmony] ${skill.name} broke harmony on ${target.name()}`);
                return;
            }

            // Push record of the cast onto the target's combo queue
            target._harmonyQueue.push({
                id: skill.id,
                actorId: user.actorId(),
                frame: Graphics.frameCount
            });

            target._harmonyTimer = Graphics.frameCount;

            Harmonization.cleanTargetQueue(target);
            Harmonization.checkTargetCombo(user, target);

            console.log(`[Harmony] ${user.name()} hit ${target.name()} with ${skill.name} (${skill.id})`);

        } catch (e) {
            console.error("[Harmonization] Error applying skill:", e);
        }
    };

    // -------------------------
    // Clean target queue (remove expired entries)
    // -------------------------
    Harmonization.cleanTargetQueue = function(target) {
        const now = Graphics.frameCount;
        target._harmonyQueue = target._harmonyQueue.filter(e => (now - e.frame) <= HARMONY_WINDOW);
    };

    // -------------------------
    // Check combos on this target
    // -------------------------
    Harmonization.checkTargetCombo = function(user, target) {
        if (!target._harmonyQueue || target._harmonyQueue.length === 0) return;

        const ids = target._harmonyQueue.map(e => e.id);
        Harmonization.Table.forEach(entry => {
            const seq = entry.sequence;
            if (ids.length < seq.length) return;

            const recent = ids.slice(-seq.length);
            const match = recent.every((id, i) => id === seq[i]);
            if (!match) return;

            console.log(`[Harmony] Combo detected on ${target.name()}: ${seq.join('+')}`);

            if (entry.type === 'state') {
                target.addState(entry.result);
                $gameMessage.add(`${user.name()} and allies harmonized on ${target.name()} — ${$dataStates[entry.result].name} applied!`);
            } 
            else if (entry.type === 'skill') {
                const skill = $dataSkills[entry.result];
                const action = new Game_Action(user);
                action.setSkill(skill.id);
                const targets = [target];
                BattleManager.queueVerseAction(action, targets);
                $gameMessage.add(`${user.name()} unleashed ${skill.name} on ${target.name()}!`);
            }

            // Reset queue after harmonization completes
            target._harmonyQueue = [];
        });
    };

})();