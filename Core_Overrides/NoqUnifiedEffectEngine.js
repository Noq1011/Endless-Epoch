/*:
 * @plugindesc UEE v4.1 - Unified Effects Engine
 * @author Tyson
 *
 * @help
 * =========================================================================
 * UNIFIED EFFECTS ENGINE v4.1
 * =========================================================================
 * Place this plugin BELOW all Yanfly plugins in the Plugin Manager.
 *
 * =========================================================================
 * PARAM IDS (for Buff/Debuff tags)
 * =========================================================================
 *   0 = Max HP
 *   1 = Max MP
 *   2 = Attack
 *   3 = Defense
 *   4 = M.Attack
 *   5 = M.Defense
 *   6 = Agility
 *   7 = Luck
 *
 * =========================================================================
 * LOGIC PRESETS (Named behaviors defined in the script)
 * =========================================================================
 * Call a named preset from any skill notebox:
 *   <UEE Logic: PresetName>
 *
 * --- ShockExtend ---
 *   Checks for states [13, 25] on the target.
 *   If target is an Actor:  -3 turns (shortened)
 *   If target is an Enemy:  +5 turns (extended)
 *   Does nothing if neither state is present.
 *   Notebox: <UEE Logic: ShockExtend>
 *
 * --- CursedGrip ---
 *   Checks the target's DEF (param 3) buff/debuff status.
 *   If target has a DEF buff:   reduces duration by 2 turns.
 *   If target has a DEF debuff: extends duration by 2 turns.
 *   Does nothing if no buff or debuff is present.
 *   Notebox: <UEE Logic: CursedGrip>
 *
 * =========================================================================
 * EXTEND / DECREASE STATE DURATION
 * =========================================================================
 * Extends or decreases the duration of a state already on the target.
 * Does nothing if the target does not have the state.
 *
 * Syntax:
 *   <UEE Extend State: [stateId], [amount]>
 *
 * Examples:
 *   <UEE Extend State: 13, 5>    — extend state 13 by 5 turns
 *   <UEE Extend State: 13, -3>   — decrease state 13 by 3 turns
 *
 * =========================================================================
 * EXTEND / DECREASE BUFF DURATION
 * =========================================================================
 * Extends or decreases the duration of a buff already on the target.
 * Does nothing if the target does not have the buff.
 *
 * Syntax:
 *   <UEE Extend Buff: [paramId], [amount]>
 *
 * Examples:
 *   <UEE Extend Buff: 3, 2>      — extend DEF buff by 2 turns
 *   <UEE Extend Buff: 2, -2>     — decrease ATK buff by 2 turns
 *
 * =========================================================================
 * EXTEND / DECREASE DEBUFF DURATION
 * =========================================================================
 * Extends or decreases the duration of a debuff already on the target.
 * Does nothing if the target does not have the debuff.
 *
 * Syntax:
 *   <UEE Extend Debuff: [paramId], [amount]>
 *
 * Examples:
 *   <UEE Extend Debuff: 3, 2>    — extend DEF debuff by 2 turns
 *   <UEE Extend Debuff: 6, -1>   — decrease AGI debuff by 1 turn
 *
 * =========================================================================
 * SET STATE DURATION ON APPLICATION
 * =========================================================================
 * Forces a state's duration to a specific value or random range
 * at the moment it is applied.
 *
 * Syntax:
 *   <UEE State [stateId] Turns: [amount]>
 *   <UEE State [stateId] Turns: [min] to [max]>
 *
 * Examples:
 *   <UEE State 13 Turns: 5>      — always applies state 13 for 5 turns
 *   <UEE State 13 Turns: 3 to 7> — applies state 13 for 3–7 turns randomly
 *
 * =========================================================================
 * FLAT HP / MP REGEN
 * =========================================================================
 * Applies a flat HP or MP regen per turn tied to a state.
 * The skill must also have "Add State" in its Effects panel pointing
 * to the matching regen state.
 * Regen stops automatically when the state expires.
 *
 * Syntax:
 *   <UEE Regen HP: [amount]>
 *   <UEE Regen HP State: [stateId]>
 *
 *   <UEE Regen MP: [amount]>
 *   <UEE Regen MP State: [stateId]>
 *
 * Examples:
 *   <UEE Regen HP: 50>           — heals 50 HP per turn
 *   <UEE Regen HP State: 20>     — watches state 20 as the regen flag
 *
 *   <UEE Regen MP: 20>           — restores 20 MP per turn
 *   <UEE Regen MP State: 21>     — watches state 21 as the regen flag
 *
 * Note: Both tags are required for regen to work.
 *       The state ID in the notebox must match the state added
 *       in the skill's Effects panel.
 *
 * =========================================================================
 * CONSOLE LOGGING
 * =========================================================================
 * All UEE activity is logged with the [UEE] prefix.
 * Open the console with F8 during playtesting and filter by [UEE]
 * to see exactly what the engine is doing each action.
 *
 */

var UEE = UEE || {};
UEE.Logic = UEE.Logic || {};
UEE.RegenData = UEE.RegenData || {};

(function() {
    'use strict';

    console.log("UEE v4.1: Engine Initializing...");

    // =========================================================================
    // 1. LOGIC PRESETS
    // =========================================================================

    UEE.Logic["ShockExtend"] = function(target) {
        const SHOCK_IDS = [13, 25];
        let adjust = target.isActor() ? -3 : 5;
        let found = false;

        SHOCK_IDS.forEach(function(id) {
            if (target.isStateAffected(id)) {
                target._stateTurns[id] = Math.max(1, (target._stateTurns[id] || 0) + adjust);
                found = true;
            }
        });

        if (found) {
            return "Shock duration " + (adjust > 0 ? "extended" : "shortened") + " by " + Math.abs(adjust);
        }
        return null;
    };

    UEE.Logic["CursedGrip"] = function(target) {
    const action = BattleManager._action;
    if (!action || !action.item()) return null;

    const skillId = action.item().id;
    const subject = action.subject();
    const usage = subject.isActor() ? subject._skillUsage[skillId] : null;
    const level = usage ? usage.level : 1;

    // Level config
    const DRAIN_MIN = level >= 3 ? 3 : 3;
    const DRAIN_MAX = level >= 3 ? 5 : 3;
    const DRAIN_TARGETS = level >= 3 ? 3 : 1;

    // Step 1: Find debuff recipient — target must already have a debuff
    let debuffParam = -1;
    for (let i = 0; i < 8; i++) {
        if (target.isDebuffAffected(i)) { debuffParam = i; break; }
    }
    if (debuffParam === -1) return null; // No debuff to feed, do nothing

    // Step 2: Scan enemy party for buff victims
    const opponents = subject.isActor() ?
        $gameTroop.aliveMembers() :
        $gameParty.aliveMembers();

    // Build list of all active buffs across all opponents
    let candidates = [];
    opponents.forEach(function(member) {
        for (let i = 0; i < 8; i++) {
            if (member.isBuffAffected(i)) {
                candidates.push({
                    member: member,
                    paramId: i,
                    turns: member._buffTurns[i] || 0
                });
            }
        }
    });

    if (candidates.length === 0) return null;

    // Step 3: Sort by priority
    // Priority: closest to drain amount first, then longest duration, then highest param
    const drainAmount = Math.floor(Math.random() * (DRAIN_MAX - DRAIN_MIN + 1)) + DRAIN_MIN;

    candidates.sort(function(a, b) {
        const aDiff = Math.abs(a.turns - drainAmount);
        const bDiff = Math.abs(b.turns - drainAmount);
        if (aDiff !== bDiff) return aDiff - bDiff; // Closest to drain amount
        if (b.turns !== a.turns) return b.turns - a.turns; // Longest duration
        return b.paramId - a.paramId; // Highest param ID
    });

    // Step 4: Drain up to DRAIN_TARGETS buffs
    const chosen = candidates.slice(0, DRAIN_TARGETS);
    let totalDrained = 0;

    chosen.forEach(function(c) {
        const actual = Math.min(c.turns, drainAmount);
        c.member._buffTurns[c.paramId] = Math.max(0, c.turns - actual);
        totalDrained += actual;
        UEE.log(c.member.name() + " loses " + actual + " turns from buff " + c.paramId);
    });

    // Step 5: Transfer drained turns to debuff on target
    if (totalDrained > 0) {
        target._buffTurns[debuffParam] = (target._buffTurns[debuffParam] || 0) + totalDrained;
        UEE.log(target.name() + " debuff " + debuffParam + " extended by " + totalDrained + " turns.");
        return "Drained " + totalDrained + " turns from " + chosen.length + " buff(s) (Tier " + level + ")";
    }

    return null;
};
	
	UEE.Logic["LingeringLight"] = function(target) {
    const action = BattleManager._action;
    if (!action || !action.item()) return null;

    const skillId = action.item().id;
    const subject = action.subject();
    const usage = subject.isActor() ? subject._skillUsage[skillId] : null;
    const level = usage ? usage.level : 1;

    // How many buffs to extend per level
    const MAX_BUFFS = { 1: 1, 2: 2, 3: 4 };
    const maxExtend = MAX_BUFFS[level] || 1;

    // Find all active buffs on target
    let activeBuffs = [];
    for (let i = 0; i < 8; i++) {
        if (target.isBuffAffected(i)) activeBuffs.push(i);
    }

    if (activeBuffs.length === 0) return null;

    // Shuffle and pick up to maxExtend
    activeBuffs.sort(() => Math.random() - 0.5);
    const chosen = activeBuffs.slice(0, maxExtend);

    chosen.forEach(function(paramId) {
        target._buffTurns[paramId] = Math.max(1, (target._buffTurns[paramId] || 0) + 2);
    });

    return "Extended " + chosen.length + " buff(s) by 2 turns (Tier " + level + ")";
};

    // =========================================================================
    // 2. CORE PROCESSOR
    // =========================================================================

    UEE.processEffect = function(target, id, type) {
        const action = BattleManager._action;
        if (!action || !action.item()) return;
        const item = action.item();
        const note = item.note;
        const typeKey = type.charAt(0).toUpperCase() + type.slice(1);

        // ID-Specific Logic: <UEE State 13 Logic: Name>
        const logicRegex = new RegExp("<UEE " + typeKey + " " + id + " Logic:\\s*(\\w+)>", "i");
        const logicMatch = note.match(logicRegex);
        if (logicMatch && UEE.Logic[logicMatch[1]]) {
            let msg = UEE.Logic[logicMatch[1]](target, id, type);
            if (msg) UEE.log(target.name() + ": " + msg);
        }

        // Standard Set: <UEE State 13 Turns: 5 to 10>
        const setRegex = new RegExp("<UEE " + typeKey + " " + id + " Turns:\\s*(\\d+)(?:\\s*to\\s*(\\d+))?>", "i");
        const setMatch = note.match(setRegex);
        if (setMatch) {
            let min = parseInt(setMatch[1]);
            let max = setMatch[2] ? parseInt(setMatch[2]) : min;
            let roll = Math.floor(Math.random() * (max - min + 1)) + min;
            if (type === 'state') target._stateTurns[id] = roll;
            else target._buffTurns[id] = roll;
            UEE.log(target.name() + " " + typeKey + " " + id + " set to " + roll + " turns.");
        }
    };

    UEE.processGlobalLogic = function(target) {
        const action = BattleManager._action;
        if (!action || !action.item()) return;
        const item = action.item();
        const note = item.note;

        // Named preset
        const globalRegex = /<UEE Logic:\s*(\w+)>/i;
        const match = note.match(globalRegex);
        if (match && UEE.Logic[match[1]]) {
            let msg = UEE.Logic[match[1]](target);
            if (msg) UEE.log(target.name() + ": " + msg);
        }

        // Extend State
        const extStateRegex = /<UEE Extend State:\s*(\d+),\s*(-?\d+)>/gi;
        let extStateMatch;
        while ((extStateMatch = extStateRegex.exec(note)) !== null) {
            let stateId = parseInt(extStateMatch[1]);
            let amount  = parseInt(extStateMatch[2]);
            if (target.isStateAffected(stateId)) {
                target._stateTurns[stateId] = Math.max(1, (target._stateTurns[stateId] || 0) + amount);
                UEE.log(target.name() + " State " + stateId + " duration " + (amount >= 0 ? "+" : "") + amount);
            }
        }

        // Extend Buff
        const extBuffRegex = /<UEE Extend Buff:\s*(\d+),\s*(-?\d+)>/gi;
        let extBuffMatch;
        while ((extBuffMatch = extBuffRegex.exec(note)) !== null) {
            let paramId = parseInt(extBuffMatch[1]);
            let amount  = parseInt(extBuffMatch[2]);
            if (target.isBuffAffected(paramId)) {
                target._buffTurns[paramId] = Math.max(1, (target._buffTurns[paramId] || 0) + amount);
                UEE.log(target.name() + " Buff " + paramId + " duration " + (amount >= 0 ? "+" : "") + amount);
            }
        }

        // Extend Debuff
        const extDebuffRegex = /<UEE Extend Debuff:\s*(\d+),\s*(-?\d+)>/gi;
        let extDebuffMatch;
        while ((extDebuffMatch = extDebuffRegex.exec(note)) !== null) {
            let paramId = parseInt(extDebuffMatch[1]);
            let amount  = parseInt(extDebuffMatch[2]);
            if (target.isDebuffAffected(paramId)) {
                target._buffTurns[paramId] = Math.max(1, (target._buffTurns[paramId] || 0) + amount);
                UEE.log(target.name() + " Debuff " + paramId + " duration " + (amount >= 0 ? "+" : "") + amount);
            }
        }

        // Regen HP
        const regenHPMatch = note.match(/<UEE Regen HP:\s*(\d+)>/i);
        const regenMPMatch = note.match(/<UEE Regen MP:\s*(\d+)>/i);
        const key = UEE.getBattlerKey(target);

        if (regenHPMatch) {
            UEE.RegenData[key] = UEE.RegenData[key] || {};
            UEE.RegenData[key].hp = parseInt(regenHPMatch[1]);
            UEE.RegenData[key].hpStateId = UEE.getRegenStateId(note, 'HP');
            UEE.log(target.name() + " HP Regen set to " + UEE.RegenData[key].hp + " per turn.");
        }

        // Regen MP
        if (regenMPMatch) {
            UEE.RegenData[key] = UEE.RegenData[key] || {};
            UEE.RegenData[key].mp = parseInt(regenMPMatch[1]);
            UEE.RegenData[key].mpStateId = UEE.getRegenStateId(note, 'MP');
            UEE.log(target.name() + " MP Regen set to " + UEE.RegenData[key].mp + " per turn.");
        }
    };

    UEE.getRegenStateId = function(note, type) {
        const regex = new RegExp("<UEE Regen " + type + " State:\\s*(\\d+)>", "i");
        const match = note.match(regex);
        return match ? parseInt(match[1]) : null;
    };

    UEE.getBattlerKey = function(battler) {
        if (battler.isActor()) return "actor_" + battler.actorId();
        return "enemy_" + battler.index();
    };

    // =========================================================================
    // 3. REGEN TICK
    // =========================================================================

    const _Game_Battler_regenerateAll = Game_Battler.prototype.regenerateAll;
    Game_Battler.prototype.regenerateAll = function() {
        _Game_Battler_regenerateAll.call(this);

        const key = UEE.getBattlerKey(this);
        const data = UEE.RegenData[key];
        if (!data) return;

        if (data.hp && data.hpStateId) {
            if (this.isStateAffected(data.hpStateId)) {
                this.gainHp(data.hp);
                UEE.log(this.name() + " regenerates " + data.hp + " HP.");
            } else {
                data.hp = null;
                data.hpStateId = null;
                UEE.log(this.name() + " HP Regen expired, cleaning up.");
            }
        }

        if (data.mp && data.mpStateId) {
            if (this.isStateAffected(data.mpStateId)) {
                this.gainMp(data.mp);
                UEE.log(this.name() + " regenerates " + data.mp + " MP.");
            } else {
                data.mp = null;
                data.mpStateId = null;
                UEE.log(this.name() + " MP Regen expired, cleaning up.");
            }
        }
    };

    // =========================================================================
    // 4. ENGINE HOOKS
    // =========================================================================

    const _Game_Action_apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        if (target.result().isHit()) {
            UEE.processGlobalLogic(target);
        }
    };

    const _Game_Battler_addState = Game_Battler.prototype.addState;
    Game_Battler.prototype.addState = function(stateId) {
        _Game_Battler_addState.call(this, stateId);
        UEE.processEffect(this, stateId, 'state');
    };

    const _Game_Battler_addBuff = Game_Battler.prototype.addBuff;
    Game_Battler.prototype.addBuff = function(paramId, turns) {
        _Game_Battler_addBuff.call(this, paramId, turns);
        UEE.processEffect(this, paramId, 'buff');
    };

    UEE.log = function(msg) {
        console.log("[UEE] " + msg);
        if (typeof BattleFeedPush === "function") {
            BattleFeedPush({ text: msg, kind: "state" });
        }
    };

    console.log("UEE v4.1: Full System Online.");
	
	// =========================================================================
    // 5. AI TACTICAL BRIDGE (Robust Global Export)
    // =========================================================================
    // Use window.UEE to ensure it is globally accessible across all scripts
    window.UEE = window.UEE || {};
    UEE.AI = UEE.AI || {}; 

    UEE.AI.isTriggerDue = function(actor) {
        if (!actor || !actor.isActor()) return false;
        var interval = (window.UBS && UBS.VERSE_TRIGGER_INTERVAL_TURNS) || 2;
        var counter = actor._ubc_turnCounter || 0;
        return (counter % interval === 0);
    };

    UEE.AI.getPotentialTriggers = function(actor) {
        var potential = [];
        if (!actor || !actor.equips) return potential;
        
        var equips = actor.equips();
        for (var i = 0; i < equips.length; i++) {
            var eq = equips[i];
            if (!eq || !eq.note) continue;
            var re = /<\s*VerseTrigger\s*:\s*([^,>]+)\s*,\s*([\d.]+)\s*>/gi;
            var m;
            while ((m = re.exec(eq.note)) !== null) {
                var skillName = m[1].trim();
                var skill = null;
                // Using a standard loop for maximum MV compatibility
                for (var s = 1; s < $dataSkills.length; s++) {
                    if ($dataSkills[s] && $dataSkills[s].name === skillName) {
                        skill = $dataSkills[s];
                        break;
                    }
                }
                if (skill) potential.push({ skill: skill, chance: parseFloat(m[2]) });
            }
        }
        return potential;
    };
	
        // --- 1. Elemental Awareness ---
        // Returns a score multiplier based on target's elemental resistances
        UEE.AI.getElementMatch = function(skill, target) {
			if (!skill || !target || skill.damage.elementId < 0) return 1.0;
			var rate = target.elementRate(skill.damage.elementId);
			if (rate > 1.0) return 2.0; 
			if (rate === 0) return -10.0; 
			if (rate < 1.0) return 0.5; 
			return 1.0;
		};

        // --- 2. Ailment Evaluation ---
        // Checks how "Badly" a target is currently debuffed
       UEE.AI.getAilmentScore = function(target) {
			if (!target) return 0;
				var score = 0;
				var states = target.states();
				states.forEach(function(state) {
			if (state.meta.StateValue) score += Number(state.meta.StateValue);
            else if (state.id >= 4 && state.id <= 25) score -= 200;
			});
				return score;
		};

        // --- 3. Cleanse Utility ---
        // Determines if a skill (like Aquaphor) is valuable right now
	UEE.AI.getAilmentScore = function(target) {
        if (!target) return 0;
        var score = 0;
        var states = target.states();
        states.forEach(function(state) {
            if (state.meta.StateValue) score += Number(state.meta.StateValue);
            else if (state.id >= 4 && state.id <= 25) score -= 200;
        });
        return score;
    };
	
	// --- 6. Risk Profile Scanner ---
    // Returns true if the actor is a "Risk Taker" (Malin/Kai)
    UEE.AI.isRiskTaker = function(actor) {
        if (!actor || !actor.isActor()) return false;
        // Malin (3) and Kai (1) are lore-coded to benefit from high heat
        return (actor.actorId() === 1 || actor.actorId() === 3 || actor.meta.RiskTaker);
    };

    // --- 7. Tier Reward Check ---
    // Returns a score based on whether the current tier provides beneficial states
    UEE.AI.getTierSynergy = function(actor) {
        if (!actor || !actor.isActor()) return 0;
        var rate = actor.burnoutRate();
        var bonus = 0;
        
        // If Malin is in Tier 3 (66%+), she gets her glass cannon buffs
        if (actor.actorId() === 2 && rate >= 0.66) bonus += 600;
        // If Kai is in Tier 2 (33%+), he starts getting aggressive
        if (actor.actorId() === 1 && rate >= 0.33) bonus += 300;
        
        return bonus;
    };
	
	// Check if the target actually has the state needed for a cleanse item
    UEE.AI.needsCleanse = function(item, target) {
        if (!item.meta.cleanse || !target) return false;
        var stateId = parseInt(item.meta.cleanse);
        return target.isStateAffected(stateId);
    };

    // Check if the item is restricted to specialists
    UEE.AI.isSpecialistOnly = function(item, actor) {
        if (!item.meta.ItemSpecialistOnly) return false;
        // Only Malin (ID 2) or someone with the trait is a specialist
        return (actor.actorId() !== 2 && !actor.meta.ItemSpecialist);
    };
	
	//=============================================================================
// Visual Levitation Effect
//=============================================================================
const _Sprite_Battler_updatePosition = Sprite_Battler.prototype.updatePosition;
Sprite_Battler.prototype.updatePosition = function() {
    _Sprite_Battler_updatePosition.call(this);
    
    // If the battler has the Levitate flag...
    if (this._battler && this._battler._isLevitating) {
        // Shift them up 30 pixels, plus a smooth 10-pixel bobbing animation
        const floatHeight = -30 + Math.sin(Graphics.frameCount / 15) * 10;
        this.y += floatHeight;
    }
};
	
	//=============================================================================
// Battle Weather Visuals & Persistent Field Detection
//=============================================================================

// 1. Create the Weather Managers in Battle
const _Scene_Battle_createSpriteset = Scene_Battle.prototype.createSpriteset;
Scene_Battle.prototype.createSpriteset = function() {
    _Scene_Battle_createSpriteset.call(this);
    
    // Instantiate the global managers from NoqWeatherCore[cite: 3]
    this._rainDropManager = new RainDropManager();
    RainDropManagerGlobal = this._rainDropManager;

    this._fogManager = new FogManager();
    FogManagerGlobal = this._fogManager;

    this._cloudManager = new CloudManager();
    CloudManagerGlobal = this._cloudManager;

    // Instantly apply whatever weather is currently on the map[cite: 3]
    WeatherSystem._applyPersistentState(true); 
};

// 2. Update the Weather Frames in Battle
const _Scene_Battle_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function() {
    _Scene_Battle_update.call(this);
    
    // Pull the active wind power from the persistent memory[cite: 3]
    const windPower = $gameSystem._persistentWeather ? ($gameSystem._persistentWeather.windPower || 0) : 0;
    
    if (this._rainDropManager) this._rainDropManager.update(windPower);
    if (this._fogManager) this._fogManager.update();
    if (this._cloudManager) this._cloudManager.update(windPower);
};

//=============================================================================
// Global Battle Field Engine (Yanfly ATB Integration)
//=============================================================================

const _BattleManager_setup = BattleManager.setup;
BattleManager.setup = function(troopId, canEscape, canLose) {
    _BattleManager_setup.call(this, troopId, canEscape, canLose);
    this._activeField = null;
    this._fieldTicks = 0;
    this._fieldFaction = null; // Tracks if 'actor' or 'enemy' cast the field

    // AUTO-DETECT: If it is already raining on the map, start the battle with Rain Field!
    if ($gameSystem._persistentWeather && $gameSystem._persistentWeather.active.rain) {
        this._activeField = 'Rain';
        this._fieldTicks = 999999; // Lasts indefinitely until the map weather stops
    }
};

// API to Call from your Skills
BattleManager.setField = function(type, ticks, faction) {
    this._activeField = type;
    this._fieldTicks = ticks;
    this._fieldFaction = faction;

    // Hook directly into NoqWeatherCore's visual engine[cite: 3]
    if (type === 'WindStorm') WeatherSystem.change({ wind: 4, cloud: 3, instant: false });
    if (type === 'Tornado') WeatherSystem.change({ wind: 6, storm: true, instant: false });
    if (type === 'Rain') WeatherSystem.change({ rain: 4, cloud: 4, instant: false });
    if (type === 'Tailwind') WeatherSystem.change({ wind: 3, instant: false });
};

// The Tick Countdown Hook
const _BattleManager_updateATBPhase = BattleManager.updateATBPhase;
BattleManager.updateATBPhase = function() {
    _BattleManager_updateATBPhase.call(this);
    
    // Only count down ticks when time is actually flowing
    if (this._activeField && this._fieldTicks > 0 && !this.isATBPaused()) {
        this._fieldTicks--;
        
        // Trigger periodic storm damage every 100 ticks
        if (this._fieldTicks % 100 === 0) {
            this.triggerFieldEffects();
        }
        
        if (this._fieldTicks <= 0) {
            this._activeField = null;
            // Clear visual weather when the skill wears off[cite: 3]
            WeatherSystem.change('none', 0); 
            if ($gameParty.inBattle()) $gameMessage.add("The weather has cleared.");
        }
    }
};

BattleManager.triggerFieldEffects = function() {
    let targets = [];
    let tickDamage = 0;

    // Both storms target the faction that DID NOT cast it
    if (this._activeField === 'Tornado' || this._activeField === 'WindStorm') {
        targets = this._fieldFaction === 'actor' ? $gameTroop.aliveMembers() : $gameParty.aliveMembers();
    }

    // Set damage scaling
    if (this._activeField === 'WindStorm') {
        tickDamage = Math.floor(this._fieldPower * 0.8); // Moderate damage
    } else if (this._activeField === 'Tornado') {
        tickDamage = Math.floor(this._fieldPower * 2.0); // Devastating endgame damage
    }

    // Apply the damage to the targets
    if (targets.length > 0 && tickDamage > 0) {
        targets.forEach(target => {
            // Add a little 10% variance to the storm damage
            let variance = Math.floor(tickDamage * 0.10);
            let finalDmg = tickDamage + (Math.randomInt(variance * 2 + 1) - variance);
            
            target.gainHp(-finalDmg);
            target.startDamagePopup();
            
            // Optional: Play a wind animation hit on them
            target.startAnimation(49); 
            
            if (target.isDead()) target.performCollapse();
        });
    }
	
	// --- RESTORATIVE RAIN ---
    if (this._activeField === 'Rain' && this._restorativeRainLevel > 0) {
        // 1. Heal the Party
        $gameParty.aliveMembers().forEach(member => {
            let healAmt = Math.floor(member.mhp * 0.08); // Heals 8% Max HP per 100 ticks
            member.gainHp(healAmt);
            member.startDamagePopup();
        });

        // 2. Late Game Upgrade (Level 3+): Burn Corrupted Enemies
        if (this._restorativeRainLevel >= 3) {
            $gameTroop.aliveMembers().forEach(enemy => {
                if (enemy.enemy().meta.Corrupted) {
                    enemy.gainHp(-800); // Devastating holy water damage
                    enemy.startDamagePopup();
                    if (enemy.isDead()) enemy.performCollapse();
                }
            });
        }
    }
};

// --- TAILWIND: ATB Speed Modification ---
const _Game_Battler_atbSpeed = Game_Battler.prototype.atbSpeed;
Game_Battler.prototype.atbSpeed = function() {
    let speed = _Game_Battler_atbSpeed.call(this);
    
    if (BattleManager._activeField === 'Tailwind') {
        const isCasterFaction = (this.isActor() && BattleManager._fieldFaction === 'actor') || 
                                (this.isEnemy() && BattleManager._fieldFaction === 'enemy');
        if (isCasterFaction) {
            speed *= 1.30; // 30% Faster
        } else {
            speed *= 0.70; // 30% Slower
        }
    }
    return speed;
};

// --- UPDATE FIELD API TO ACCEPT CASTER POWER ---
BattleManager.setField = function(type, ticks, faction, power) {
    this._activeField = type;
    this._fieldTicks = ticks;
    this._fieldFaction = faction;
    this._fieldPower = power || 0; // Saves the caster's MAT to scale the tick damage!

    if (type === 'WindStorm') WeatherSystem.change({ wind: 4, cloud: 3, instant: false });
    if (type === 'Tornado') WeatherSystem.change({ wind: 6, storm: true, instant: false });
    if (type === 'Tailwind') WeatherSystem.change({ wind: 3, instant: false });
};

// --- WIND STORM: Physical Accuracy Penalty ---
const _Game_BattlerBase_hit = Game_BattlerBase.prototype.hit;
Game_BattlerBase.prototype.hit = function() {
    let hit = _Game_BattlerBase_hit.call(this);
    if (BattleManager._activeField === 'WindStorm') {
        hit -= 0.15; // Flat -15% accuracy to all physical attacks globally
    }
    return hit;
};

// --- WIND STORM & TORNADO: Magic Reflection Chance ---
const _Game_BattlerBase_mrf = Game_BattlerBase.prototype.mrf;
Game_BattlerBase.prototype.mrf = function() {
    let mrf = _Game_BattlerBase_mrf.call(this);
    
    if (BattleManager._activeField === 'WindStorm') {
        mrf += 0.10; // 10% chance for a rogue gust to reflect magic
    } else if (BattleManager._activeField === 'Tornado') {
        mrf += 0.75; // 75% chance to reflect. Forces physical attacks or waiting!
    }
    return mrf;
};


// --- RAIN DANCE: Elemental Resistance Modification ---
const _Game_BattlerBase_elementRate = Game_BattlerBase.prototype.elementRate;
Game_BattlerBase.prototype.elementRate = function(elementId) {
    let rate = _Game_BattlerBase_elementRate.call(this, elementId);
    
    if (BattleManager._activeField === 'Rain') {
        // Replace these IDs with your actual Element IDs!
        const EMBERN_ID = 3;
        const MERTIDE_ID = 4;
        const VOLTREND_ID = 5;

        if (elementId === EMBERN_ID) rate *= 0.50; // Embern does half damage in rain
        if (elementId === MERTIDE_ID || elementId === VOLTREND_ID) rate *= 1.25; // Water/Elec do 25% more damage
    }
    return rate;
};
	
})();