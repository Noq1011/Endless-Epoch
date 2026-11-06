/*:
 * @plugindesc v1.0 Advanced Merchant & Favor System - Dynamic stock, tiered pricing, and ephemeral quests.
 * @author Tyson
 *
 * @param MerchantPinId
 * @text Merchant Pin Item ID
 * @desc The database ID for the Merchant Alliance Pin (stacks 25% discount).
 * @type item
 * @default 0
 *
 * @param HolyOrderPool
 * @text Holy Order Item Pool
 * @desc List of Item IDs this faction can request. (Variable 65)
 * @type item[]
 * @default []
 *
 * @param MerchantAlliancePool
 * @text Merchant Alliance Item Pool
 * @desc List of Item IDs this faction can request. (Variable 66)
 * @type item[]
 * @default []
 *
 * @param GrioPool
 * @text Grio Item Pool
 * @desc List of Item IDs this faction can request. (Variable 68)
 * @type item[]
 * @default []
 *
 * @param MesruneinPool
 * @text Mesrunein Item Pool
 * @desc List of Item IDs this faction can request. (Variable 69)
 * @type item[]
 * @default []
 *
 * @help
 * ============================================================================
 * ■ NOQ ADVANCED MERCHANT & FAVOR SYSTEM - REFERENCE GUIDE
 * ============================================================================
 * This plugin replaces static shops with dynamic, event-driven merchants. It 
 * handles limited inventories, tiered pricing based on faction favor, and 
 * generates dynamic fetch quests that tie into your existing systems.
 *
 * ----------------------------------------------------------------------------
 * 1. EVENT NOTETAGS (Required for Merchants)
 * ----------------------------------------------------------------------------
 * Place these in the "Note" box of the merchant's event page:
 *
 * <Faction: X> 
 *   Assigns the merchant to a specific favor variable.
 *   (65 = Holy Order, 66 = Merchant Alliance, 68 = Grio, 69 = Mesrunein)
 *
 * <NameLabel: Name>
 *   The display name of the merchant used for generated quest logs.
 *   Example: <NameLabel: Thrummer>
 *
 * <MaxRarity: X>
 *   The highest rarity item this merchant can request in a favor quest.
 *   (1 = Common, 2 = Uncommon, 3 = Rare, 4 = Mythic)
 *
 * <Stock: X>
 *   The merchant's starting inventory. Uses I for Item, W for Weapon, 
 *   A for Armor, followed by ID:Amount. Separate with commas.
 *   Example: <Stock: I10:5, W2:1, A5:2> (5 of Item 10, 1 Weapon 2, 2 Armor 5)
 *
 * <RestockDays: X>
 *   How many in-game days must pass before the stock refills to max.
 *   Example: <RestockDays: 3>
 *
 * FULL EXAMPLE:
 * <Faction: 66>
 * <NameLabel: Thrummer>
 * <MaxRarity: 2>
 * <Stock: I1:10, I2:5, W5:1>
 * <RestockDays: 3>
 *
 * ----------------------------------------------------------------------------
 * 2. PLUGIN COMMANDS
 * ----------------------------------------------------------------------------
 * Use this Plugin Command inside the merchant's event contents:
 *
 * Merchant Interact
 *   This single command handles everything. If the player has an active quest 
 *   for this specific NPC, it opens the "Deliver Items" dialogue choices. 
 *   If not, it simply opens the shop directly.
 *
 * Merchant OpenEvent
 *   Forces the shop menu to open bypassing any quest checks. (Useful if you 
 *   want to write your own custom dialogue choices).
 *
 * ----------------------------------------------------------------------------
 * 3. PRICING & FAVOR TIERS
 * ----------------------------------------------------------------------------
 * Prices dynamically scale based on the specific faction's variable:
 *   • Favor >= 80: 20% Discount
 *   • Favor >= 50: 10% Discount
 *   • Favor < 20:  15% Markup (Penalty)
 *
 * Pin Stack: If a player shops at the Merchant Alliance (Faction 66) and 
 * possesses the item defined in "Merchant Pin Item ID", an additional 25% 
 * discount is stacked. Maximum discount is hard-capped at 90% off.
 *
 * ----------------------------------------------------------------------------
 * 4. SYSTEM INTEGRATIONS
 * ----------------------------------------------------------------------------
 * • Day/Night Core: Restocks and Quest Expirations are tracked natively using 
 *   your DayNight.day() clock[cite: 4].
 * • Quest System: Generated favor quests are injected directly into your 
 *   Quest.Database and will track progress via your HUD[cite: 3]. Once complete 
 *   or failed, they are silently deleted to keep save files clean.
 * • Musical Victory: The script utilizes your getRarityRank() method to 
 *   calculate gold/favor rewards based on requested item tiers[cite: 2].
 * ============================================================================
 */

var Noq = Noq || {};
Noq.Merchant = Noq.Merchant || {};

(function() {
    'use strict';

    // -------------------------
    // 1. Parameter Parsing
    // -------------------------
    var parameters = PluginManager.parameters('NoqMerchantUpgrade');
    
    Noq.Merchant.pinId = Number(parameters['MerchantPinId'] || 0);
    
    Noq.Merchant.pools = {
        65: JSON.parse(parameters['HolyOrderPool'] || '[]').map(Number),
        66: JSON.parse(parameters['MerchantAlliancePool'] || '[]').map(Number),
        68: JSON.parse(parameters['GrioPool'] || '[]').map(Number),
        69: JSON.parse(parameters['MesruneinPool'] || '[]').map(Number)
    };

    // -------------------------
    // 2. System Data Initialization
    // -------------------------
    var _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        
        // Tracks limited item quantities: _merchantStock[mapId][eventId] = { itemType_itemId: stockCount }
        this._merchantStock = {}; 
        
        // Tracks active favor quests by faction variable ID to enforce the 1-per-faction limit
        this._activeFavorQuests = {
            65: null, // Holy Order
            66: null, // Merchant Alliance
            68: null, // Grio
            69: null  // Children of Mesrunein
        };
        
        // Tracks the buyback inventory for the Merchant Alliance
        this._buybackInventory = []; 
    };

	// -------------------------
    // 3. Event Parsing & Setup
    // -------------------------
    
    // Helper to parse the Stock string like "I10:5, W5:2, A3:1"
    function parseStockTag(stockStr) {
        var items = [];
        var parts = stockStr.split(',');
        for (var i = 0; i < parts.length; i++) {
            var match = parts[i].trim().match(/([IWA])(\d+):(\d+)/i);
            if (match) {
                var type = match[1].toUpperCase(); // I, W, or A
                var id = parseInt(match[2], 10);
                var maxStock = parseInt(match[3], 10);
                items.push({ type: type, id: id, maxStock: maxStock });
            }
        }
        return items;
    }

    Noq.Merchant.setupEventShop = function(eventId) {
        var event = $gameMap.event(eventId);
        if (!event) return;
        
        var note = event.event().note || "";
        var comment = "";
        
        // Extract comments from the currently active event page
        var list = event.list();
        if (list) {
            for (var c = 0; c < list.length; c++) {
                var cmd = list[c];
                // 108: Comment, 408: Comment Line 2+, 355/655: Script calls (for flexibility)
                if (cmd.code === 108 || cmd.code === 408 || cmd.code === 355 || cmd.code === 655) {
                    comment += cmd.parameters[0] + "\n";
                }
            }
        }
        
        // Combine notes and comments so both can be used interchangeably
        var combinedNotes = note + "\n" + comment;

        // Parse Notetags from the combined string
        var factionMatch = combinedNotes.match(/<Faction:\s*(\d+)>/i);
        var rarityMatch  = combinedNotes.match(/<MaxRarity:\s*(\d+)>/i);
        var nameMatch    = combinedNotes.match(/<NameLabel:\s*(.+)>/i);
        var stockMatch   = combinedNotes.match(/<Stock:\s*(.+)>/i);
        var restockMatch = combinedNotes.match(/<RestockDays:\s*(\d+)>/i);

        var factionId   = factionMatch ? parseInt(factionMatch[1], 10) : 0;
        var maxRarity   = rarityMatch ? parseInt(rarityMatch[1], 10) : 1;
        var nameLabel   = nameMatch ? nameMatch[1].trim() : "Merchant";
        var restockDays = restockMatch ? parseInt(restockMatch[1], 10) : 3;
        var stockList   = stockMatch ? parseStockTag(stockMatch[1]) : [];

        var mapId = $gameMap.mapId();
        
        // Initialize map stock object if missing
        if (!$gameSystem._merchantStock[mapId]) {
            $gameSystem._merchantStock[mapId] = {};
        }

        // Safely pull the current day from your DayNight system
        var currentDay = 1;
        if (typeof DayNight !== 'undefined' && typeof DayNight.day === 'function') {
            currentDay = DayNight.day();
        }

        // Check if we need to initialize or restock this specific event
        var shopData = $gameSystem._merchantStock[mapId][eventId];
        if (!shopData || (currentDay - shopData.lastRestockDay >= restockDays)) {
            // Rebuild stock back to max
            shopData = {
                lastRestockDay: currentDay,
                inventory: {}
            };
            for (var i = 0; i < stockList.length; i++) {
                var item = stockList[i];
                var key = item.type + item.id;
                shopData.inventory[key] = item.maxStock;
            }
            $gameSystem._merchantStock[mapId][eventId] = shopData;
        }

        // Store active shop data globally for the UI and pricing math to read
        Noq.Merchant.activeShop = {
            mapId: mapId,
            eventId: eventId,
            factionId: factionId,
            maxRarity: maxRarity,
            nameLabel: nameLabel,
            stockList: stockList,
            currentStock: shopData.inventory
        };
    };

    // -------------------------
    // 4. Plugin Command Intercept
    // -------------------------
    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        
        if (command === "Merchant") {
            var sub = args[0];
            if (sub === "OpenEvent") {
                // Determine the event calling this command
                var eventId = this._eventId;
                Noq.Merchant.setupEventShop(eventId);
                
                var activeShop = Noq.Merchant.activeShop;
                
                // Build the goods array for MV's native Scene_Shop
                // Format: [type (0=item, 1=weapon, 2=armor), id, price_override_flag, price]
                var goods = [];
                for (var i = 0; i < activeShop.stockList.length; i++) {
                    var defaultItem = activeShop.stockList[i];
                    var typeNum = 0;
                    if (defaultItem.type === 'W') typeNum = 1;
                    if (defaultItem.type === 'A') typeNum = 2;
                    goods.push([typeNum, defaultItem.id, 0, 0]);
                }
                
                // Only Merchant Alliance (faction 66) allows selling items back to them
                var purchaseOnly = (activeShop.factionId !== 66);
                
                SceneManager.push(Scene_Shop);
                SceneManager.prepareNextScene(goods, purchaseOnly);
            }
        }
    };

// -------------------------
    // 5. Pricing Math & Discounts
    // -------------------------
    
    // Helper to calculate the current price multiplier
    Noq.Merchant.getMultiplier = function() {
        if (!this.activeShop) return 1.0;
        
        var factionId = this.activeShop.factionId;
        if (!factionId) return 1.0;
        
        var favor = $gameVariables.value(factionId) || 0;
        var mult = 1.0;
        
        // Tiered Pricing based on Favor Points
        if (favor >= 80) {
            mult = 0.80; // 20% discount
        } else if (favor >= 50) {
            mult = 0.90; // 10% discount
        } else if (favor < 20) {
            mult = 1.15; // 15% markup
        }
        
        // Merchant Pin check (Faction 66 only)
        if (factionId === 66 && Noq.Merchant.pinId > 0) {
            if ($gameParty.hasItem($dataItems[Noq.Merchant.pinId])) {
                mult -= 0.25; // Stack an extra 25% off
            }
        }
        
        // Hard cap the maximum discount at 10% of the base price so items are never free or negative
        return Math.max(0.10, mult);
    };

    // Alias the native price calculation to apply our multiplier
    var _Window_ShopBuy_price = Window_ShopBuy.prototype.price;
    Window_ShopBuy.prototype.price = function(item) {
        var basePrice = _Window_ShopBuy_price.call(this, item);
        var mult = Noq.Merchant.getMultiplier();
        return Math.floor(basePrice * mult);
    };

    // -------------------------
    // 6. Stock UI & Enforcement
    // -------------------------
    
    // Helper to fetch the remaining stock of a specific item
    Noq.Merchant.getItemStock = function(item) {
        if (!this.activeShop || !item) return 99; // Fallback for standard/non-custom shops
        
        var type = DataManager.isItem(item) ? 'I' : DataManager.isWeapon(item) ? 'W' : 'A';
        var key = type + item.id;
        
        var currentStock = this.activeShop.currentStock[key];
        return (currentStock !== undefined) ? currentStock : 99;
    };

    // Intercept item enabling to gray out items when stock hits 0
    var _Window_ShopBuy_isEnabled = Window_ShopBuy.prototype.isEnabled;
    Window_ShopBuy.prototype.isEnabled = function(item) {
        var isEnabled = _Window_ShopBuy_isEnabled.call(this, item);
        if (Noq.Merchant.activeShop) {
            var stock = Noq.Merchant.getItemStock(item);
            return isEnabled && stock > 0;
        }
        return isEnabled;
    };

    // Intercept the draw function to visually display the remaining stock in the menu
    var _Window_ShopBuy_drawItem = Window_ShopBuy.prototype.drawItem;
    Window_ShopBuy.prototype.drawItem = function(index) {
        var item = this._data[index];
        var rect = this.itemRect(index);
        var priceWidth = 96;
        rect.width -= this.textPadding();
        
        this.changePaintOpacity(this.isEnabled(item));
        this.drawItemName(item, rect.x, rect.y, rect.width - priceWidth);
        
        // Draw the stock count right next to the price
        if (Noq.Merchant.activeShop) {
            var stock = Noq.Merchant.getItemStock(item);
            this.contents.fontSize = 18;
            this.changeTextColor(this.systemColor());
            this.drawText("x" + stock, rect.x + rect.width - priceWidth - 40, rect.y, 40, 'right');
            this.resetTextColor();
            this.contents.fontSize = this.standardFontSize();
        }
        
        this.drawText(this.price(item), rect.x + rect.width - priceWidth, rect.y, priceWidth, 'right');
        this.changePaintOpacity(true);
    };

    // Deduct stock natively when the player confirms a purchase
    var _Scene_Shop_doBuy = Scene_Shop.prototype.doBuy;
    Scene_Shop.prototype.doBuy = function(number) {
        _Scene_Shop_doBuy.call(this, number); // Let the engine take the gold and give the item
        
        if (Noq.Merchant.activeShop) {
            var item = this._item;
            var type = DataManager.isItem(item) ? 'I' : DataManager.isWeapon(item) ? 'W' : 'A';
            var key = type + item.id;
            
            // Deduct from temporary shop data
            Noq.Merchant.activeShop.currentStock[key] -= number;
            
            // Save immediately to persistent system data
            var mapId = Noq.Merchant.activeShop.mapId;
            var eventId = Noq.Merchant.activeShop.eventId;
            $gameSystem._merchantStock[mapId][eventId].inventory[key] = Noq.Merchant.activeShop.currentStock[key];
        }
    };

// -------------------------
    // 7. Dynamic Quest Injection
    // -------------------------
    
    // Tracks if the player actually bought/sold something to trigger the exit request
    Noq.Merchant.warmedUp = false;

    // Alias the transaction methods to flip the warmedUp flag
    var _Scene_Shop_doBuy_Quest = Scene_Shop.prototype.doBuy;
    Scene_Shop.prototype.doBuy = function(number) {
        _Scene_Shop_doBuy_Quest.call(this, number);
        Noq.Merchant.warmedUp = true;
    };
    
    var _Scene_Shop_doSell_Quest = Scene_Shop.prototype.doSell;
    Scene_Shop.prototype.doSell = function(number) {
        _Scene_Shop_doSell_Quest.call(this, number);
        Noq.Merchant.warmedUp = true;
    };

    Noq.Merchant.generateFavorQuest = function() {
        var shop = this.activeShop;
        if (!shop || !shop.factionId) return;
        
        var pool = Noq.Merchant.pools[shop.factionId];
        if (!pool || pool.length === 0) return;

        // Filter out items that are too rare for this specific merchant
        var validItems = pool.filter(function(id) {
            var item = $dataItems[id];
            var rarity = (typeof BattleManager !== 'undefined' && BattleManager.getRarityRank) ? BattleManager.getRarityRank(item) : 1;
            return rarity <= shop.maxRarity;
        });
        
        if (validItems.length === 0) validItems = pool; // Fallback just in case

        var numRequests = Math.floor(Math.random() * 3) + 1; // 1 to 3 items
        var objectives = [];
        var totalRarityWeight = 0;

        for (var i = 0; i < numRequests; i++) {
            var randomId = validItems[Math.floor(Math.random() * validItems.length)];
            var item = $dataItems[randomId];
            var rarity = (typeof BattleManager !== 'undefined' && BattleManager.getRarityRank) ? BattleManager.getRarityRank(item) : 1;
            var qty = Math.floor(Math.random() * 3) + 1; // 1 to 3 copies of the item

            objectives.push({
                text: "Deliver " + item.name,
                max: qty,
                item: randomId,
                enemies: []
            });
            totalRarityWeight += (rarity * qty);
        }

        var mapName = $dataMapInfos[$gameMap.mapId()] ? $dataMapInfos[$gameMap.mapId()].name : "Unknown Location";
        var npcName = shop.nameLabel;
        var questId = "favor_" + shop.factionId;

        // Inject the ephemeral quest into the Noq Chronicle Quest Database
        Quest.Database[questId] = {
            title: npcName + "'s Request",
            category: "side quests",
            stages: {
                1: {
                    log: "Return to " + npcName + " at the " + mapName + " with the requested supplies.",
                    objectives: objectives
                }
            },
            rewardWeight: totalRarityWeight,
            targetMapId: shop.mapId,
            targetEventId: shop.eventId,
            expirationDay: DayNight.day() + 2 // They have 2 days to complete it
        };

        // Activate it using your native system
        Quest.setStage(questId, 1);
        $gameSystem._activeFavorQuests[shop.factionId] = questId;
        Noq.Merchant.warmedUp = false; 
    };

// The Exit Intercept
    var _Scene_Shop_popScene = Scene_Shop.prototype.popScene;
    Scene_Shop.prototype.popScene = function() {
        _Scene_Shop_popScene.call(this);
        
        var shop = Noq.Merchant.activeShop;
        if (shop && Noq.Merchant.warmedUp) {
            // Check if faction slot is empty
            if (!$gameSystem._activeFavorQuests[shop.factionId]) {
                // Pass a flag to the map scene instead of crashing Yanfly
                $gameTemp._pendingMerchantFavor = shop;
            }
        }
        Noq.Merchant.warmedUp = false;
    };

    // -------------------------
    // 8. Turn-In & Interactions
    // -------------------------
    
    Noq.Merchant.attemptTurnIn = function(questId) {
        var data = Quest.Database[questId];
        if (!data) return;
        
        var stage = data.stages[1];
        var hasAll = true;
        
        // Validate inventory
        for (var i = 0; i < stage.objectives.length; i++) {
            var obj = stage.objectives[i];
            if ($gameParty.numItems($dataItems[obj.item]) < obj.max) {
                hasAll = false; break;
            }
        }
        
        if (!hasAll) {
            $gameMessage.add("Looks like you're still missing a few things. No rush!");
        } else {
            // Take items
            for (var j = 0; j < stage.objectives.length; j++) {
                var o = stage.objectives[j];
                $gameParty.loseItem($dataItems[o.item], o.max);
            }
            
            var favorBonus = data.rewardWeight * 2;
            var goldBonus = data.rewardWeight * 150; 
            var faction = Noq.Merchant.activeShop.factionId;
            
            $gameVariables.setValue(faction, $gameVariables.value(faction) + favorBonus);
            $gameParty.gainGold(goldBonus);
            
            AudioManager.playSe({ name: 'Chime2', volume: 90, pitch: 100, pan: 0 });
            $gameMessage.add("Thanks for the help! I've added a bonus to your standing with us.");
            
            // Clean up to prevent bloat
            delete Quest.Database[questId];
            delete $gameSystem._questStatus[questId];
            delete $gameSystem._questProgress[questId];
            $gameSystem._activeFavorQuests[faction] = null;
        }
    };

    // Extension of your Plugin Commands from Block 2
    var _Game_Interpreter_pluginCommand2 = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand2.call(this, command, args);
        
        if (command === "Merchant" && args[0] === "Interact") {
            var eventId = this._eventId;
            Noq.Merchant.setupEventShop(eventId);
            var shop = Noq.Merchant.activeShop;
            if (!shop) return;
            
            var questId = "favor_" + shop.factionId;
            var activeQ = $gameSystem._activeFavorQuests[shop.factionId];
            var isTarget = (activeQ === questId && Quest.Database[questId] && Quest.Database[questId].targetEventId === eventId && Quest.Database[questId].targetMapId === $gameMap.mapId());

            if (isTarget) {
                $gameMessage.add("Welcome back! Did you manage to track down those supplies I asked for?");
                $gameMessage.setChoices(["Browse Wares", "Deliver Items", "Not Right Now"], 0, 2);
                $gameMessage.setChoiceCallback(function(n) {
                    if (n === 0) {
                        var interpreter = new Game_Interpreter();
                        interpreter.pluginCommand("Merchant", ["OpenEvent", eventId]);
                    } else if (n === 1) {
                        Noq.Merchant.attemptTurnIn(questId);
                    }
                });
            } else {
                // Open natively if they don't have a quest to turn in
                this.pluginCommand("Merchant", ["OpenEvent", eventId]);
            }
        }
    };

    // -------------------------
    // 9. Day/Night Expiration Hook
    // -------------------------
    
var _Game_Map_update_Merchant = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        _Game_Map_update_Merchant.call(this, sceneActive);
        
        // NEW: Safe dialogue trigger on the map scene
        if (sceneActive && $gameTemp && $gameTemp._pendingMerchantFavor && !$gameMessage.isBusy()) {
            var shop = $gameTemp._pendingMerchantFavor;
            $gameTemp._pendingMerchantFavor = null;
            
            $gameMessage.add("Wait, before you head out... I'm actually running low on a few things. Could you do me a favor?");
            $gameMessage.setChoices(["Accept Request", "Not Right Now"], 0, 1);
            $gameMessage.setChoiceCallback(function(n) {
                if (n === 0) {
                    Noq.Merchant.activeShop = shop;
                    Noq.Merchant.generateFavorQuest();
                }
            });
        }

        if (typeof DayNight === 'undefined' || typeof DayNight.day !== 'function') return;
        
        // Cache the day to prevent running heavy checks every frame
        if (!$gameSystem._lastCheckedDay) $gameSystem._lastCheckedDay = DayNight.day();
        
        if ($gameSystem._lastCheckedDay !== DayNight.day()) {
            $gameSystem._lastCheckedDay = DayNight.day();
            Noq.Merchant.checkQuestExpirations();
        }
    };

    Noq.Merchant.checkQuestExpirations = function() {
        var currentDay = DayNight.day();
        var factions = [65, 66, 68, 69];
        
        for (var i = 0; i < factions.length; i++) {
            var faction = factions[i];
            var questId = $gameSystem._activeFavorQuests[faction];
            
            if (questId && Quest.Database[questId]) {
                if (currentDay > Quest.Database[questId].expirationDay) {
                    // Trigger your native HUD Failure
                    if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._questNotice) {
                        SceneManager._scene._questNotice.show("Quest Failed", Quest.Database[questId].title);
                    }
                    
                    // Deduct 5 favor for failing
                    $gameVariables.setValue(faction, Math.max(0, $gameVariables.value(faction) - 5));
                    
                    // Silent Cleanup
                    delete Quest.Database[questId];
                    delete $gameSystem._questStatus[questId];
                    delete $gameSystem._questProgress[questId];
                    $gameSystem._activeFavorQuests[faction] = null;
                }
            }
        }
    };


})();