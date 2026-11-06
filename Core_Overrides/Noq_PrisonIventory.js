/*:
 * @plugindesc v1.2 Endless Epoch - Prison Inventory Stash
 * @author Tyson (Noq)
 *
 * @help
 * ============================================================================
 * SCRIPT CALLS
 * ============================================================================
 * To strip the party of everything and stash it:
 * $gameParty.stashInventory();
 *
 * To give it all back (merges with anything they found in prison):
 * $gameParty.restoreInventory();
 */

(function() {

    // --- STASH INVENTORY ---
    Game_Party.prototype.stashInventory = function() {
        // 1. Unequip everyone first so their gear drops into active inventory
        $gameParty.members().forEach(function(actor) {
            actor.clearEquipments();
        });

        // 2. Ensure stash containers exist in $gameSystem (doesn't wipe existing ones)
        $gameSystem._prisonStashItems   = $gameSystem._prisonStashItems   || {};
        $gameSystem._prisonStashWeapons = $gameSystem._prisonStashWeapons || {};
        $gameSystem._prisonStashArmors  = $gameSystem._prisonStashArmors  || {};
        $gameSystem._prisonStashGold    = $gameSystem._prisonStashGold    || 0;

        // 3. Merge current items into the existing stash
        for (var id in this._items) {
            $gameSystem._prisonStashItems[id] = ($gameSystem._prisonStashItems[id] || 0) + this._items[id];
        }
        for (var id in this._weapons) {
            $gameSystem._prisonStashWeapons[id] = ($gameSystem._prisonStashWeapons[id] || 0) + this._weapons[id];
        }
        for (var id in this._armors) {
            $gameSystem._prisonStashArmors[id] = ($gameSystem._prisonStashArmors[id] || 0) + this._armors[id];
        }

        // 4. Add current gold to stashed gold
        $gameSystem._prisonStashGold += this._gold;

        // 5. Wipe active party inventory completely clean
        this._items = {};
        this._weapons = {};
        this._armors = {};
        this._gold = 0;

        // 6. Flip the stash switch ON
        $gameSwitches.setValue(158, true);
    };

    // --- RESTORE INVENTORY ---
    Game_Party.prototype.restoreInventory = function() {
        // Prevent errors if they accidentally trigger this without a stash
        if (!$gameSystem._prisonStashItems) return; 

        // 1. Give back Items
        for (var id in $gameSystem._prisonStashItems) {
            this.gainItem($dataItems[id], $gameSystem._prisonStashItems[id]);
        }
        // 2. Give back Weapons
        for (var id in $gameSystem._prisonStashWeapons) {
            this.gainItem($dataWeapons[id], $gameSystem._prisonStashWeapons[id]);
        }
        // 3. Give back Armors
        for (var id in $gameSystem._prisonStashArmors) {
            this.gainItem($dataArmors[id], $gameSystem._prisonStashArmors[id]);
        }
        // 4. Give back Gold
        this.gainGold($gameSystem._prisonStashGold || 0);

        // 5. Delete the stash to free up save data memory
        $gameSystem._prisonStashItems = null;
        $gameSystem._prisonStashWeapons = null;
        $gameSystem._prisonStashArmors = null;
        $gameSystem._prisonStashGold = null;

        // 6. Flip the stash switch OFF
        $gameSwitches.setValue(158, false);
    };

})();