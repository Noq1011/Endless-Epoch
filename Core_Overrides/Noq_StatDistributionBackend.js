/*:
 * @plugindesc v1.0 Backend for Endless Epoch Custom Stat Distribution
 * @author Tyson
 *
 * @help
 * Actor Notetags:
 * <StatCaps>
 * mhp: 5000
 * mmp: 1000
 * atk: 150
 * def: 120
 * mat: 200
 * mdf: 180
 * agi: 80
 * luk: 150
 * </StatCaps>
 */

(function() {
    // 1. Initialize Variables for New Actors
    var _Game_Actor_setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _Game_Actor_setup.call(this, actorId);
        this._unspentStatPoints = 0;
        // 0:MHP, 1:MMP, 2:ATK, 3:DEF, 4:MAT, 5:MDF, 6:AGI, 7:LUK
        this._allocatedStats = [0, 0, 0, 0, 0, 0, 0, 0]; 
    };

    // 2. Grant Points on Level Up
    var _Game_Actor_levelUp = Game_Actor.prototype.levelUp;
    Game_Actor.prototype.levelUp = function() {
        _Game_Actor_levelUp.call(this);
        
        // 5 points every level. If it's a multiple of 5, give 10 instead.
        if (this._level % 5 === 0) {
            this._unspentStatPoints += 10;
        } else {
            this._unspentStatPoints += 5;
        }
    };

    // 3. Add Allocated Points to Base Stats
    var _Game_Actor_paramBase = Game_Actor.prototype.paramBase;
    Game_Actor.prototype.paramBase = function(paramId) {
        var base = _Game_Actor_paramBase.call(this, paramId);
        var allocated = this._allocatedStats ? this._allocatedStats[paramId] : 0;
        return base + allocated;
    };

    // 4. Parse Actor Notetags for Stat Caps
    Game_Actor.prototype.getStatCap = function(paramId) {
        var actor = this.actor();
        if (actor.meta.StatCaps) {
            // Default fallbacks if not defined
            var caps = [9999, 9999, 255, 255, 255, 255, 255, 255]; 
            var notes = actor.note.split(/[\r\n]+/);
            var inTag = false;
            for (var i = 0; i < notes.length; i++) {
                if (notes[i].match(/<StatCaps>/i)) { inTag = true; continue; }
                if (notes[i].match(/<\/StatCaps>/i)) { inTag = false; break; }
                if (inTag) {
                    var match = notes[i].match(/(mhp|mmp|atk|def|mat|mdf|agi|luk):\s*(\d+)/i);
                    if (match) {
                        var stat = match[1].toLowerCase();
                        var val = Number(match[2]);
                        if (stat === 'mhp') caps[0] = val;
                        if (stat === 'mmp') caps[1] = val;
                        if (stat === 'atk') caps[2] = val;
                        if (stat === 'def') caps[3] = val;
                        if (stat === 'mat') caps[4] = val;
                        if (stat === 'mdf') caps[5] = val;
                        if (stat === 'agi') caps[6] = val;
                        if (stat === 'luk') caps[7] = val; // Resonance
                    }
                }
            }
            return caps[paramId];
        }
        // Absolute maximums if no notetag is present
        return paramId === 0 || paramId === 1 ? 9999 : 255; 
    };

    // 5. Helper function to check if player CAN upgrade a stat
    Game_Actor.prototype.canUpgradeStat = function(paramId) {
        var currentBase = this.paramBase(paramId); // Includes allocated points
        var cap = this.getStatCap(paramId);
        return currentBase < cap && this._unspentStatPoints > 0;
    };

})();