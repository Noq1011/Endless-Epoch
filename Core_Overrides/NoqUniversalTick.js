/*:
 * @plugindesc Noq Universal Tick / Turn Plugin — HP/MP/TP regen per ATB turn, supports all battler sources with custom intervals.
 * @author Noq
 *
 * @help
 * Add meta tags to actors, enemies, states, skills, weapons, or armors:
 * <hpregen: 5>      // flat HP per tick
 * <hpregen: 5%>     // % of max HP per tick
 * <mpregen: -3>     // negative MP per tick
 * <mpregen: 5%>     // % of max MP per tick
 * <tpregen: -5>     // negative TP per tick
 * <tpregen: 5%>     // % of max TP per tick
 * <tickInterval: 20> // how many ATB ticks to wait before applying this source's regen
 */

var NoqBurnoutTickTurns = NoqBurnoutTickTurns || {};

(function() {
    'use strict';

    // -------------------------
    // Hook into YEP ATB turns
    // -------------------------
    var _Game_Battler_onTurnEnd = Game_Battler.prototype.onTurnEnd;
    Game_Battler.prototype.onTurnEnd = function() {
        _Game_Battler_onTurnEnd.call(this);
        this.tickRegen();
    };

    // -------------------------
    // Tick regen per ATB turn
    // -------------------------
    Game_Battler.prototype.tickRegen = function() {
        if (!this.isAlive()) return;

        var sources = [];
        if (this.isActor()) {
            sources = sources.concat([this.actor(), this.currentClass()]);
            sources = sources.concat(this.weapons());
            sources = sources.concat(this.armors());
        } else if (this.isEnemy()) {
            sources.push(this.enemy());
        }
        sources = sources.concat(this.states());
        sources = sources.concat(this.skills());
        sources = sources.filter(s => !!s);

        sources.forEach(source => {
            // Initialize per-source counter
            if (!this._tickCounters) this._tickCounters = new Map();
            if (!this._tickCounters.has(source)) this._tickCounters.set(source, 0);

            var counter = this._tickCounters.get(source);
            var interval = 3;
            if (source.meta && source.meta.tickInterval) {
                interval = Math.max(1, parseInt(source.meta.tickInterval));
            }

            counter++;
            if (counter >= interval) {
                counter = 0; // reset
                this.applyRegenMeta(source);
            }

            this._tickCounters.set(source, counter);
        });
    };

    // -------------------------
    // Apply regen/damage based on meta tags
    // -------------------------
    Game_Battler.prototype.applyRegenMeta = function(source) {
        var tags = ['hpregen', 'mpregen', 'tpregen'];
        var self = this;

        tags.forEach(function(tag) {
            if (!source.meta || !source.meta[tag]) return;

            var val = source.meta[tag].toString();
            var amount = 0;

            if (val.endsWith('%')) {
                var percent = parseFloat(val) / 100;
                switch(tag) {
                    case 'hpregen': amount = Math.floor(self.mhp * percent); break;
                    case 'mpregen': amount = Math.floor(self.mmp * percent); break;
                    case 'tpregen': amount = Math.floor(self.tpMax() * percent); break;
                }
            } else {
                amount = parseFloat(val);
            }

            if (amount === 0) return; // skip zero changes

            // Apply & show popup
            switch(tag) {
                case 'hpregen': 
                    self.gainHp(amount); 
                    if (amount !== 0) self.startDamagePopup(); 
                    break;
                case 'mpregen': 
                    self.gainMp(amount); 
                    if (amount !== 0) self.startDamagePopup(); 
                    break;
                case 'tpregen': 
                    self.gainTp(amount); 
                    if (amount !== 0 && self.startDamagePopup) self.startDamagePopup(); 
                    break;
            }

            console.log(`[NoqBurnoutTickTurns] ${self.name()} ${tag} changed by ${amount} from ${source.name || 'unknown source'}`);
        });
    };

})();