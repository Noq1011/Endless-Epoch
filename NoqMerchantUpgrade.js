/*:
 * @plugindesc Advanced Merchant & Item Upgrade System (ES5) - Custom inventories, stock refresh, and upgrades
 * @author Tyson
 *
 * @help
 * Plugin Commands:
 *   Merchant Open <merchantId>     # Open shop for a specific merchant
 *   Merchant Upgrade <merchantId>  # Open upgrade menu for a merchant
 *   Merchant Refresh <merchantId>  # Force a stock refresh for a merchant
 */

(function() {

    // -------------------------
    // Data storage
    // -------------------------
    var merchants = {
        1: {
            name: "Ronan's Armory",
            gold: 1000,
            inventory: [
                {itemId: 10, type: "weapon", price: 500, stock: 3, defaultStock: 3},
                {itemId: 15, type: "armor", price: 250, stock: 5, defaultStock: 5}
            ],
            buyItems: [
                {itemId: 10, price: 400},
                {itemId: 15, price: 200}
            ],
            upgradeList: [
                {
                    baseItemId: 10,
                    resultItemId: 11,
                    requirements: [
                        {itemId: 5, quantity: 2},
                        {itemId: 6, quantity: 1}
                    ]
                }
            ],
            stockRefreshDays: 3,
            lastRestockDay: 0,
            sales: {}
        }
        // Add more merchants here
    };

    // -------------------------
    // Utility functions
    // -------------------------
    function getMerchant(merchantId) {
        return merchants[merchantId];
    }

    function playerHasMaterials(requirements) {
        for (var i = 0; i < requirements.length; i++) {
            var req = requirements[i];
            if ($gameParty.numItems($dataItems[req.itemId]) < req.quantity) {
                return false;
            }
        }
        return true;
    }

    function consumeMaterials(requirements) {
        for (var i = 0; i < requirements.length; i++) {
            var req = requirements[i];
            $gameParty.loseItem($dataItems[req.itemId], req.quantity);
        }
    }

    function refreshStock(merchantId) {
        var merchant = getMerchant(merchantId);
        for (var i = 0; i < merchant.inventory.length; i++) {
            var item = merchant.inventory[i];
            item.stock = item.defaultStock;
        }
        merchant.lastRestockDay = $gameVariables.value(1); // replace 1 with your day variable
    }

    function sellToMerchant(merchantId, itemId, quantity) {
        var merchant = getMerchant(merchantId);
        var buyData = null;
        for (var i = 0; i < merchant.buyItems.length; i++) {
            if (merchant.buyItems[i].itemId === itemId) {
                buyData = merchant.buyItems[i];
                break;
            }
        }
        if (!buyData) return;
        var totalPrice = buyData.price * quantity;
        if (merchant.gold >= totalPrice) {
            merchant.gold -= totalPrice;
            $gameParty.loseItem($dataItems[itemId], quantity);
            $gameParty.gainGold(totalPrice);
            merchant.sales[itemId] = (merchant.sales[itemId] || 0) + quantity;
        } else {
            $gameMessage.add(merchant.name + " cannot afford this!");
        }
    }

    function upgradeItem(merchantId, baseItemId) {
        var merchant = getMerchant(merchantId);
        var upgrade = null;
        for (var i = 0; i < merchant.upgradeList.length; i++) {
            if (merchant.upgradeList[i].baseItemId === baseItemId) {
                upgrade = merchant.upgradeList[i];
                break;
            }
        }
        if (!upgrade) {
            $gameMessage.add("This item cannot be upgraded here.");
            return;
        }
        if (playerHasMaterials(upgrade.requirements)) {
            consumeMaterials(upgrade.requirements);
            $gameParty.loseItem($dataWeapons[baseItemId], 1);
            $gameParty.gainItem($dataWeapons[upgrade.resultItemId], 1);
            $gameMessage.add("Item upgraded successfully!");
        } else {
            $gameMessage.add("Not enough materials to upgrade.");
        }
    }

    // -------------------------
    // Plugin command handling
    // -------------------------
    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (command === "Merchant") {
            var sub = args[0];
            var merchantId = parseInt(args[1]);
            if (sub === "Open") {
                var merchant = getMerchant(merchantId);
                SceneManager.push(Scene_Shop);
                SceneManager.prepareNextScene(merchant.inventory, merchant.buyItems, merchant.gold);
            } else if (sub === "Upgrade") {
                upgradeItem(merchantId, parseInt(args[2]));
            } else if (sub === "Refresh") {
                refreshStock(merchantId);
            }
        }
    };

})();