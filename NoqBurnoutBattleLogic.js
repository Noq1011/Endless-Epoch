/*:
 * @plugindesc Unified Burnout-TP System (TP = Burnout Gauge) for Actors & Enemies — handles TP changes, regeneration, and Burnout triggers. Living Weapon logic removed.
 * @author Tyson
 *
 * Works with:
 * <TpLimit:x>, <TpRegen:x>, <BurnChangeUser:x>, <BurnChangeTarget:y>, <BurnBonusTurns:z>
 */

var UnifiedBurnout = UnifiedBurnout || {};

(function() {
    'use strict';

    // ===============================
    // 1️⃣ Database Note Parsing
    // ===============================
    var _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;

        this.processTpLimitNotetags($dataActors);
        this.processTpLimitNotetags($dataEnemies);
        this.processTpLimitNotetags($dataClasses);
        this.processTpLimitNotetags($dataStates);
        this.processTpLimitNotetags($dataWeapons);
        this.processTpLimitNotetags($dataArmors);
        this.processTpLimitNotetags($dataSkills);

        this.processTpRegenNotetags($dataActors);
        this.processTpRegenNotetags($dataEnemies);
        this.processTpRegenNotetags($dataClasses);
        this.processTpRegenNotetags($dataStates);
        this.processTpRegenNotetags($dataWeapons);
        this.processTpRegenNotetags($dataArmors);
        this.processTpRegenNotetags($dataSkills);

        return true;
    };

    DataManager.processTpLimitNotetags = function(group) {
        var re = /<TpLimit:(-?\d+)>/i;
        for (var i = 1; i < group.length; i++) {
            var obj = group[i]; if (!obj) continue;
            obj.tpLimit = 0;
            var match = obj.note.match(re);
            if (match) obj.tpLimit = Number(match[1]);
        }
    };

    DataManager.processTpRegenNotetags = function(group) {
        var re = /<TpRegen:(-?\d+)>/i;
        for (var i = 1; i < group.length; i++) {
            var obj = group[i]; if (!obj) continue;
            obj.tpRegen = 0;
            var match = obj.note.match(re);
            if (match) obj.tpRegen = Number(match[1]);
        }
    };

    // ===============================
    // 2️⃣ TP/Burnout Logic
    // ===============================
    Game_BattlerBase.prototype.tpLimit = function() {
        var limit = 0;

        if (this.isActor()) {
            var actorData = $dataActors[this.actorId()];
            var classData = $dataClasses[this._classId];
            if (actorData) limit += actorData.tpLimit || 0;
            if (classData) limit += classData.tpLimit || 0;
            this.equips().forEach(function(eq) {
                if (eq) limit += eq.tpLimit || 0;
            });
        } else if (this.isEnemy()) {
            var enemyData = $dataEnemies[this.enemyId()];
            limit += enemyData ? (enemyData.tpLimit || 100) : 100;
        }

        this.states().forEach(function(st) {
            if (st) limit += st.tpLimit || 0;
        });
        return Math.max(1, limit);
    };

    var _Game_BattlerBase_setTp = Game_BattlerBase.prototype.setTp;
    Game_BattlerBase.prototype.setTp = function(tp) {
        _Game_BattlerBase_setTp.call(this, Math.min(Math.max(tp, 0), this.tpLimit()));
    };

    Game_BattlerBase.prototype.tpRegenTotal = function() {
        var total = 0;
        if (this.isActor()) {
            var actorData = $dataActors[this.actorId()];
            var classData = $dataClasses[this._classId];
            if (actorData) total += actorData.tpRegen || 0;
            if (classData) total += classData.tpRegen || 0;
            this.equips().forEach(function(eq) {
                if (eq) total += eq.tpRegen || 0;
            });
        } else if (this.isEnemy()) {
            var enemyData = $dataEnemies[this.enemyId()];
            if (enemyData) total += enemyData.tpRegen || 0;
        }
        this.states().forEach(function(st) {
            if (st) total += st.tpRegen || 0;
        });
        return total;
    };

    // ===============================
    // 3️⃣ Regen Tick
    // ===============================
    var _Game_Battler_regenerateAll = Game_Battler.prototype.regenerateAll;
    Game_Battler.prototype.regenerateAll = function() {
        _Game_Battler_regenerateAll.call(this);
        this.regenerateTpNoteTag();
    };

    Game_Battler.prototype.regenerateTpNoteTag = function() {
        var value = this.tpRegenTotal();
        if (value !== 0) {
            var newTp = this.tp + value;
            this.setTp(newTp);
        }
    };

})();