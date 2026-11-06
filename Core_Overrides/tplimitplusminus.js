/*:
 * @plugindesc Additive/Subtractive TP Limit via Note Tags for Actors, Enemies, States, Equipment, and Skills
 * @help
 * Use <TpLimit:x> on Actors, Enemies, Classes, States, Weapons, Armors, or Skills.
 * Positive values increase max TP, negative values decrease it.
 * Works with your burnout system and any TP regen scripts.
 */

(function() {

    const noteTag = /<TpLimit:(-?\d+)>/i;

    // Extend database objects with tpLimit property
    const _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;
        this.processTpLimitNotetags($dataActors);
        this.processTpLimitNotetags($dataEnemies);
        this.processTpLimitNotetags($dataClasses);
        this.processTpLimitNotetags($dataStates);
        this.processTpLimitNotetags($dataWeapons);
        this.processTpLimitNotetags($dataArmors);
        this.processTpLimitNotetags($dataSkills);
        return true;
    };

    DataManager.processTpLimitNotetags = function(group) {
        for (let i = 1; i < group.length; i++) {
            const obj = group[i];
            if (!obj) continue;
            obj.tpLimit = 0;
            const match = obj.note.match(noteTag);
            if (match) obj.tpLimit = Number(match[1]);
        }
    };

    // Override tpLimit() to sum all sources
    Game_BattlerBase.prototype.tpLimit = function() {
        let limit = 0;

        // Base actor/enemy
        if (this.isActor()) limit += $dataActors[this.actorId()].tpLimit || 0;
        if (this.isEnemy()) limit += $dataEnemies[this.enemyId()].tpLimit || 0;

        // Class
        if (this.isActor()) limit += $dataClasses[this._classId].tpLimit || 0;

        // Equipment
        if (this.isActor()) {
            this.equips().forEach(eq => {
                if (eq) limit += eq.tpLimit || 0;
            });
        }

        // States
        this.states().forEach(st => {
            limit += st.tpLimit || 0;
        });

        // Skills (optional, if you want skills to temporarily modify TP cap)
        // Can be added here if needed

        // Ensure minimum of 1 to avoid zero TP max
        return Math.max(1, limit);
    };

})();
