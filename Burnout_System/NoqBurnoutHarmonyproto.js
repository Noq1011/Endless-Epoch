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
    const HARMONY_WINDOW = 1800; // frames before combo expires per target
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
    // BattleFeed Helper
    // -------------------------
    function pushToFeed(msg, kind) {
        if (typeof BattleFeedPush === "function") {
            BattleFeedPush({ text: msg, kind: kind || "harmony" });
        } else {
            console.log("[Feed Fallback]", msg);
        }
    }

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
    
    var skill = this.item();
    var user = this.subject();
    
    console.log("=========================================");
    console.log(`[Harmony Debug] ACTION START: ${user ? user.name() : 'Unknown'} used ${(skill ? skill.name : 'Unknown')} on ${target ? target.name() : 'Unknown'}`);
    
    // Safety checks with strict logging
    if (!skill) { console.log("   -> ABORT: No skill data."); return; }
    if (!user || !user.isActor()) { console.log("   -> ABORT: User is an Enemy, not an Actor."); return; }
    if (!target.result().isHit()) { console.log("   -> ABORT: Attack missed or was evaded."); return; }
    if (skill.meta && skill.meta["harmony_bypass"]) { console.log("   -> ABORT: Skill has <harmony_bypass> tag."); return; }

    var breakTag = typeof COMBO_BREAK_TAG !== 'undefined' ? COMBO_BREAK_TAG : "HarmonyBreak";
    var isBasicAttack = (skill.id === user.attackSkillId());
    var isBreak = (skill.meta && skill.meta[breakTag]) || isBasicAttack;

    target._harmonyQueue = target._harmonyQueue || [];

    if (isBreak) {
        console.log(`   -> CHAIN BREAK: ${skill.name} is a basic attack or has break tag.`);
        if (target._harmonyQueue.length > 0) {
            target._harmonyQueue = [];
            AudioManager.playSe({ name: 'Earth4', volume: 80, pitch: 60, pan: 0 });
            console.log("   -> Queue wiped.");
        }
        console.log("=========================================");
        return; 
    }

    // Push note to queue
    target._harmonyQueue.push({ id: skill.id, wildcard: false });
    console.log(`   -> SUCCESS: Pushed Skill ID [${skill.id}] into target's queue.`);
    console.log(`   -> Current Queue on ${target.name()}: [${target._harmonyQueue.map(e => e.id).join(', ')}]`);

    var comboLength = target._harmonyQueue.length;
    var finalPitch = Math.min(100 + (comboLength - 1) * 12, 150); 
    AudioManager.playSe({ name: 'Chime2', volume: 90, pitch: finalPitch, pan: 0 });

    // Move to checking Phase
    if (typeof Harmonization.checkTargetCombo === 'function') {
        console.log("   -> Triggering Harmonization.checkTargetCombo...");
        Harmonization.checkTargetCombo(user, target);
    } else {
        console.log("   -> FATAL ERROR: Harmonization.checkTargetCombo is missing or not a function!");
    }
    console.log("=========================================");
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
    console.log("[Harmony Debug] COMBO CHECKER STARTED...");
    
    if (!target._harmonyQueue || target._harmonyQueue.length === 0) {
        console.log("   -> Checker Abort: Target queue is empty.");
        return;
    }

    if (!Harmonization.Table || Harmonization.Table.length === 0) {
        console.log("   -> FATAL ERROR: Harmonization.Table is missing, empty, or undefined!");
        return;
    }

    const ids = target._harmonyQueue.map(e => e.id);
    let comboFound = false;

    Harmonization.Table.forEach(entry => {
        const seq = entry.sequence;
        if (ids.length < seq.length) return; // Sequence requires more notes than we have

        const recent = ids.slice(-seq.length);
        const match = recent.every((id, i) => id === seq[i]);
        
        console.log(`   -> Comparing Recent Hits [${recent.join(', ')}] against Table Rule [${seq.join(', ')}]... Match: ${match}`);

        if (!match) return;

        // MATCH FOUND!
        comboFound = true;
        console.log(`   -> *** PERFECT MATCH FOUND! Resolving as type: ${entry.type} ***`);

        if (entry.type === 'state') {
            target.addState(entry.result);
            console.log(`   -> Applied State ID: ${entry.result}`);
            if (typeof pushToFeed === 'function') {
                pushToFeed(`${user.name()} and allies harmonized on ${target.name()} — ${$dataStates[entry.result].name} applied!`, 'state');
            }
            AudioManager.playSe({ name: 'Heal6', volume: 90, pitch: 120, pan: 0 });
        } 
        else if (entry.type === 'skill') {
            const skill = $dataSkills[entry.result];
            console.log(`   -> Unleashing Finisher Skill ID: ${skill.id} (${skill.name})`);
            const action = new Game_Action(user);
            action.setSkill(skill.id);
            
            if (typeof BattleManager.queueVerseAction === 'function') {
                BattleManager.queueVerseAction(action, [target]);
            } else {
                console.log("   -> ERROR: BattleManager.queueVerseAction is not defined!");
            }
            
            if (typeof pushToFeed === 'function') {
                pushToFeed(`${user.name()} unleashed ${skill.name} on ${target.name()}!`, 'verse');
            }
            
            AudioManager.playSe({ name: 'Saint9', volume: 100, pitch: 100, pan: 0 });
            AudioManager.playMe({ name: 'Musical1', volume: 80, pitch: 110, pan: 0 }); 
        }

        // Reset queue after harmonization completes
        target._harmonyQueue = [];
        console.log("   -> Target queue reset to zero after successful harmony.");
    });

    if (!comboFound) {
        console.log("   -> No matches found for current sequence. Waiting for next note.");
    }
};
	
	// -------------------------
    // AI Helper Bridge
    // -------------------------
	Harmonization.getComboPotential = function(skillId, target) {
        if (!target) return 0;
        
        // 1. Get the current history on the target
        let virtualQueue = (target._harmonyQueue || []).map(e => e.id);

        // 2. FUTURE SIGHT: Look at the VerseTrigger queue. 
        // If there's a trigger aimed at this target that hasn't landed yet, 
        // add it to our "Virtual Queue" so the AI can follow up on it!
        if (BattleManager._ubc_vtQueue) {
            BattleManager._ubc_vtQueue.forEach(function(queued) {
                if (queued.targets.contains(target)) {
                    virtualQueue.push(queued.action.item().id);
                }
            });
        }

        if (virtualQueue.length === 0) return 0;

        let potential = 0;
        this.Table.forEach(entry => {
            const seq = entry.sequence;
            // Check if our skill follows the (Current + Incoming) chain
            if (virtualQueue.every((id, i) => id === seq[i]) && seq[virtualQueue.length] === skillId) {
                potential = 1200; // High priority follow-up
                if (virtualQueue.length + 1 === seq.length) potential += 500; 
            }
        });
        return potential;
    };

})();