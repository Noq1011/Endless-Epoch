/*:
 * @plugindesc Prototype Harmonization Manager — tracks cross-actor verse chains and triggers harmonized results (skill/state) by skill IDs. Debug-friendly.
 * @author Tyson (prototype)
 */
var Harmonization = Harmonization || {};

(function() {
    'use strict';

    // ---------- CONFIG ----------
    Harmonization.DEBUG = true;            // set false to reduce logs
    const HARMONY_WINDOW = 600;            // frames allowed between earliest and latest casts in sequence (adjust)
    const CLEAR_ON_MATCH = true;           // whether to remove used sequence items when matched
    // Table entries (skill ID sequences -> result)
    // result.type: 'state' applies a stateId to the actor who completed the sequence (2-verse states)
    // result.type: 'skill' queues a skill id via BattleManager.queueVerseAction
    Harmonization.Table = [
        // Example: skill IDs 51 + 16 -> apply state 21 (2-verse)
        { sequence: [51, 16], result: { type: 'state', id: 25 }, name: "Stream+Spark -> Steam State" },

        // Example 3-skill combo: 51, 16, 34 -> queue skill 200
        { sequence: [51, 16, 53], result: { type: 'skill', id: 188 }, name: "Stream,Spark,Other -> ConsumeX" },

        // Add more entries for testing
        // { sequence: [SK1, SK2], result: {type:'state', id: STATEID}, name: '...'},
        // { sequence: [SK1, SK2, SK3], result: {type:'skill', id: SKILLID}, name: '...'},
    ];

    // ---------- STATE ----------
    Harmonization._queue = []; // entries: { actorId, skillId, frame, isTrigger:boolean }
    Harmonization._maxQueueSize = 32;

    // ---------- UTIL ----------
    Harmonization.now = function() {
        return Graphics ? Graphics.frameCount : (Date.now() / 16) | 0;
    };

    Harmonization.log = function(...args) {
        if (Harmonization.DEBUG) console.log('[Harmonization]', ...args);
    };

    Harmonization.showQueue = function() {
        return Harmonization._queue.slice();
    };

    // Push a cast into the queue (actor is a Game_Battler)
    Harmonization.recordCast = function(actor, skillId, isTrigger=false) {
        try {
            if (!actor || !skillId) return;
            const entry = {
                actorId: actor.isActor ? (actor.isActor() ? actor.actorId() : null) : null,
                enemyId: actor.isEnemy ? (actor.isEnemy() ? actor.enemyId() : null) : null,
                skillId: skillId,
                frame: Harmonization.now(),
                isTrigger: !!isTrigger,
                actorRef: actor // keep a reference for convenience (may not persist across saves; prototype only)
            };
            // push
            Harmonization._queue.push(entry);
            // clamp length
            if (Harmonization._queue.length > Harmonization._maxQueueSize) Harmonization._queue.shift();
            Harmonization.log('Queued cast:', entry.skillId, 'by', actor.name ? actor.name() : '(unknown)', 'frame', entry.frame, 'trigger?', entry.isTrigger);

            // Immediately check for combos
            Harmonization.checkCombos();
        } catch (e) {
            console.error('[Harmonization] recordCast error', e);
        }
    };

    // Exposed helper for VerseTrigger to report triggered verses
    Harmonization.pushVerseTrigger = function(skillId, subject) {
        if (!subject) return;
        Harmonization.recordCast(subject, skillId, true);
    };

    // Main combo check
    Harmonization.checkCombos = function() {
        const now = Harmonization.now();
        // prune old entries (older than HARMONY_WINDOW from now)
        Harmonization._queue = Harmonization._queue.filter(e => (now - e.frame) <= HARMONY_WINDOW);

        if (Harmonization._queue.length === 0) {
            return;
        }

        // For debugging: show numeric queue
        Harmonization.log('Actor queue:', Harmonization._queue.map(q => `${q.skillId}${q.isTrigger? '*':''}@${q.frame}`));

        // Check each table entry (prioritize longer sequences first so 3+ matches before 2)
        const sortedTable = Harmonization.Table.slice().sort((a,b) => b.sequence.length - a.sequence.length);

        for (let entry of sortedTable) {
            const seqLen = entry.sequence.length;
            if (Harmonization._queue.length < seqLen) continue;

            // We'll search the queue for last seqLen contiguous entries (order matters and must be last N casts, across actors)
            const recent = Harmonization._queue.slice(-seqLen);
            let match = true;
            for (let i=0;i<seqLen;i++){
                if (recent[i].skillId !== entry.sequence[i]) { match = false; break; }
            }

            if (!match) continue;

            // We have a match!
            Harmonization.log('Matched combo:', entry.name || entry.sequence.join(','), '->', entry.result);

            // determine actor who completed the sequence (last entry)
            const lastEntry = recent[recent.length-1];
            const actorRef = lastEntry.actorRef; // may be undefined across loads; prototype only
            // Handle result types
            if (entry.result.type === 'state') {
                const stateId = entry.result.id;
                if (actorRef && typeof actorRef.addState === 'function') {
                    actorRef.addState(stateId);
                    $gameMessage.add(`${actorRef.name()} is infused by harmonization! (State ${stateId})`);
                    Harmonization.log(`Applied state ${stateId} to ${actorRef.name()}`);
                } else {
                    Harmonization.log('State match but actor reference missing; cannot apply state automatically.');
                }
            } else if (entry.result.type === 'skill') {
                const skillId = entry.result.id;
                const skill = $dataSkills[skillId];
                if (!skill) {
                    console.warn('[Harmonization] Combo configured to trigger non-existent skill id', skillId);
                } else {
                    // create action using actorRef if available, otherwise attempt to find an actor object for subject
                    let subject = actorRef;
                    if (!subject || typeof subject.isActor !== 'function') {
                        // fallback: try find a party member that is alive
                        subject = $gameParty.aliveMembers()[0] || $gameParty.members()[0] || actorRef;
                    }
                    // make sure we have a valid subject that can perform actions
                    if (subject && typeof subject.isActor === 'function') {
                        const action = new Game_Action(subject);
                        action.setSkill(skillId);
                        const targets = Harmonization.getTargetsForSkill(subject, skill);
                        // Use the verse queue if it exists; otherwise apply immediately as a fallback
                        if (BattleManager && typeof BattleManager.queueVerseAction === 'function') {
                            BattleManager.queueVerseAction(action, targets);
                            Harmonization.log('Queued harmonized skill via verse queue:', skill.name, 'targets:', targets.map(t=>t.name()));
                        } else {
                            // fallback: apply immediately to each target
                            targets.forEach(t => { action.apply(t); });
                            Harmonization.log('Applied harmonized skill immediately (fallback):', skill.name);
                        }
                        $gameMessage.add(`${subject.name()} unleashed a Harmonized Verse: ${skill.name}!`);
                    } else {
                        Harmonization.log('Could not find valid subject for combo skill. Subject missing.');
                    }
                }
            } else {
                Harmonization.log('Unknown entry.result.type:', entry.result.type);
            }

            // Remove used entries if requested
            if (CLEAR_ON_MATCH) {
                Harmonization._queue.splice(-seqLen, seqLen);
                Harmonization.log('Cleared last', seqLen, 'entries from harmony queue.');
            }

            // Stop after first match (prioritize longest matches)
            break;
        }
    };

    // Determines targets from skill scope (simple prototype)
    Harmonization.getTargetsForSkill = function(subject, skill) {
        if (!skill) return [subject];
        switch (skill.scope) {
            case 1: // one enemy
                return $gameTroop.aliveMembers().length ? [$gameTroop.aliveMembers()[0]] : [];
            case 2: // all enemies
                return $gameTroop.aliveMembers();
            case 3: // one ally
                return $gameParty.aliveMembers().length ? [$gameParty.aliveMembers()[0]] : [];
            case 4: // all allies
                return $gameParty.aliveMembers();
            case 7: // self
                return [subject];
            default:
                return [subject];
        }
    };

    // Hook Game_Action.apply (record casts)
    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);

        try {
            const user = this.subject();
            const skill = this.item();
            if (!skill || !skill.id) return;
            // record cast for harmonization (actors and enemies)
            Harmonization.recordCast(user, skill.id, false);
        } catch (e) {
            console.error('[Harmonization] Error in hooked Game_Action.apply', e);
        }
    };

    // Expose small helpers
    Harmonization.clearQueue = function(){ Harmonization._queue = []; Harmonization.log('Queue cleared'); };
    Harmonization.dumpTable = function(){ return Harmonization.Table.slice(); };

    Harmonization.log('Harmonization prototype loaded. DEBUG=', Harmonization.DEBUG);

})();