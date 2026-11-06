/*:
 * @plugindesc v1.0 Core logic for Party Bag and Actor Equipment Weight.
 * @author Noq
 *
 * @param ---Party Bag---
 * 
 * @param Base Party Capacity
 * @desc Base weight the party can carry before stats.
 * @default 50.0
 *
 * @param Party STR Multiplier
 * @desc How much 1 point of STR adds to the party capacity.
 * @default 2.0
 *
 * @param Party Overweight State
 * @desc The State ID applied to the party when carrying too much.
 * @default 10
 *
 * @param ---Actor Equip Load---
 * 
 * @param Base Actor Capacity
 * @desc Base equip weight an actor can handle before stats.
 * @default 10.0
 *
 * @param Actor STR Multiplier
 * @desc How much 1 point of STR adds to personal equip capacity.
 * @default 1.0
 *
 * @param Actor ENG Multiplier
 * @desc How much 1 point of ENG (Mana/MP) adds to equip capacity.
 * @default 0.5
 *
 * @param Actor Overburdened State
 * @desc The State ID applied when personal equip load is exceeded.
 * @default 11
 *
 * @help
 * ============================================================================
 * Notetags
 * ============================================================================
 * 
 * <Weight: x>
 * Assigns a weight of x to the Item, Weapon, or Armor. 
 * Example: <Weight: 4.5>
 * Note: Key Items automatically default to 0 weight unless specified.
 */

var Imported = Imported || {};
Imported.Noq_InventoryWeight = true;

var Noq = Noq || {};
Noq.Weight = Noq.Weight || {};

Noq.Parameters = PluginManager.parameters('Noq_InventoryWeight');

// Parsed Parameters
Noq.Weight.BasePartyCap = Number(Noq.Parameters['Base Party Capacity'] || 50.0);
Noq.Weight.PartyStrMult = Number(Noq.Parameters['Party STR Multiplier'] || 2.0);
Noq.Weight.PartyStateId = Number(Noq.Parameters['Party Overweight State'] || 10);

Noq.Weight.BaseActorCap = Number(Noq.Parameters['Base Actor Capacity'] || 10.0);
Noq.Weight.ActorStrMult = Number(Noq.Parameters['Actor STR Multiplier'] || 1.0);
Noq.Weight.ActorEngMult = Number(Noq.Parameters['Actor ENG Multiplier'] || 0.5);
Noq.Weight.ActorStateId = Number(Noq.Parameters['Actor Overburdened State'] || 11);

// ============================================================================
// Database Loading & Notetag Parsing
// ============================================================================
Noq.Weight.DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
DataManager.isDatabaseLoaded = function() {
    if (!Noq.Weight.DataManager_isDatabaseLoaded.call(this)) return false;
    if (!Noq.Weight._loaded) {
        this.processWeightNotetags($dataItems);
        this.processWeightNotetags($dataWeapons);
        this.processWeightNotetags($dataArmors);
        Noq.Weight._loaded = true;
    }
    return true;
};

DataManager.processWeightNotetags = function(group) {
    var note1 = /<WEIGHT:[ ](\d+(?:\.\d+)?)>/i;
    for (var n = 1; n < group.length; n++) {
        var obj = group[n];
        var notedata = obj.note.split(/[\r\n]+/);
        
        // Default weight: 0 for Key Items (itypeId 2), 1 for everything else
        obj.weight = (obj.itypeId === 2) ? 0.0 : 1.0; 

        for (var i = 0; i < notedata.length; i++) {
            var line = notedata[i];
            if (line.match(note1)) {
                obj.weight = Number(RegExp.$1);
            }
        }
    }
};

// ============================================================================
// Party Weight Logic
// ============================================================================
Game_Party.prototype.maxWeightCapacity = function() {
    var capacity = Noq.Weight.BasePartyCap;
    // Only active battle members contribute to the bag
    this.battleMembers().forEach(function(actor) {
        capacity += (actor.param(2) * Noq.Weight.PartyStrMult); // param(2) is ATK/STR
    });
    return capacity;
};

Game_Party.prototype.currentInventoryWeight = function() {
    var totalWeight = 0;
    var allItems = this.allItems(); // Gets items, weapons, and armors
    for (var i = 0; i < allItems.length; i++) {
        var item = allItems[i];
        if (item) {
            totalWeight += (item.weight * this.numItems(item));
        }
    }
    return totalWeight;
};

Game_Party.prototype.isOverweight = function() {
    return this.currentInventoryWeight() > this.maxWeightCapacity();
};

// Intercept item gaining logic to prevent picking up non-key items if overweight
var _Noq_Game_Party_hasMaxItems = Game_Party.prototype.hasMaxItems;
Game_Party.prototype.hasMaxItems = function(item) {
    if (this.isOverweight() && item.weight > 0) {
        return true; // Treats the inventory as "full" for this item
    }
    return _Noq_Game_Party_hasMaxItems.call(this, item);
};

// ============================================================================
// Actor Equipment Weight Logic
// ============================================================================
Game_Actor.prototype.maxEquipCapacity = function() {
    var capacity = Noq.Weight.BaseActorCap;
    capacity += (this.param(2) * Noq.Weight.ActorStrMult); // STR
    capacity += (this.param(1) * Noq.Weight.ActorEngMult); // ENG / MP
    return capacity;
};

Game_Actor.prototype.currentEquipWeight = function() {
    var totalWeight = 0;
    var equips = this.equips();
    for (var i = 0; i < equips.length; i++) {
        var item = equips[i];
        if (item) {
            totalWeight += item.weight;
        }
    }
    return totalWeight;
};

Game_Actor.prototype.isOverburdened = function() {
    return this.currentEquipWeight() > this.maxEquipCapacity();
};

// Prevent equipping an item if it pushes the actor over their limit
var _Noq_Game_Actor_canEquip = Game_Actor.prototype.canEquip;
Game_Actor.prototype.canEquip = function(item) {
    if (!item) return _Noq_Game_Actor_canEquip.call(this, item);
    
    // Check if adding this item (and ignoring the weight of whatever is currently in that slot) exceeds capacity
    // For V1.0, we do a strict check: if current + new item > max, deny it. 
    // (A more advanced check in V1.1 will subtract the weight of the currently equipped item being replaced).
    
    if (this.currentEquipWeight() + item.weight > this.maxEquipCapacity()) {
        return false; 
    }
    return _Noq_Game_Actor_canEquip.call(this, item);
	
};

// ============================================================================
// VERSION 2.0 UI: Party Bag Help Window Injection (Yanfly Item Core Safe)
// ============================================================================

function Window_PartyWeight() { this.initialize.apply(this, arguments); }
Window_PartyWeight.prototype = Object.create(Window_Base.prototype);
Window_PartyWeight.prototype.constructor = Window_PartyWeight;

Window_PartyWeight.prototype.initialize = function(x, y, w, h) {
    Window_Base.prototype.initialize.call(this, x, y, w, h);
    this.opacity = 0; // Makes the background transparent to blend with Help Window
    this.refresh();
};

Window_PartyWeight.prototype.refresh = function() {
    this.contents.clear();
    var current = $gameParty.currentInventoryWeight();
    var max = $gameParty.maxWeightCapacity();
    var w = this.contentsWidth();
    
    // Title Line (Aligned Right)
    this.changeTextColor(this.systemColor());
    this.drawText("Bag:", 0, 0, w, 'right');
    
    // Value Line (Stacked below, Aligned Right)
    if (current > max) {
        this.changeTextColor(this.powerDownColor());
    } else if (current > max * 0.85) {
        this.changeTextColor(this.crisisColor());
    } else {
        this.resetTextColor();
    }
    
    var valText = current.toFixed(1) + " / " + max.toFixed(1);
    this.drawText(valText, 0, this.lineHeight(), w, 'right');
    this.resetTextColor();
};

// Inject safely without altering Yanfly's Category Window math
var _Noq_Scene_Item_create = Scene_Item.prototype.create;
Scene_Item.prototype.create = function() {
    _Noq_Scene_Item_create.call(this);
    this.createPartyWeightWindow();
};

Scene_Item.prototype.createPartyWeightWindow = function() {
    var ww = 200; // Width of our carved-out space
    var wh = this._helpWindow.height;
    var wx = Graphics.boxWidth - ww; 
    var wy = this._helpWindow.y;
    
    this._partyWeightWindow = new Window_PartyWeight(wx, wy, ww, wh);
    this.addWindow(this._partyWeightWindow);
};

// Refresh weight when an item is consumed or tossed
var _Noq_Scene_Item_useItem = Scene_Item.prototype.useItem;
Scene_Item.prototype.useItem = function() {
    _Noq_Scene_Item_useItem.call(this);
    this._partyWeightWindow.refresh();
};

// ============================================================================
// VERSION 2.1 UI: Materials Tab (YEP_ItemCore Safe)
// ============================================================================

// 1. Parse the <Material> Notetag
var _Noq_DataManager_isDatabaseLoaded_Materials = DataManager.isDatabaseLoaded;
DataManager.isDatabaseLoaded = function() {
    if (!_Noq_DataManager_isDatabaseLoaded_Materials.call(this)) return false;
    if (!Noq.Weight._materialsLoaded) {
        this.processMaterialNotetags($dataItems);
        Noq.Weight._materialsLoaded = true;
    }
    return true;
};

DataManager.processMaterialNotetags = function(group) {
    for (var n = 1; n < group.length; n++) {
        var obj = group[n];
        var notedata = obj.note.split(/[\r\n]+/);
        obj.isMaterial = false; // Default to false
        
        for (var i = 0; i < notedata.length; i++) {
            if (notedata[i].match(/<(?:MATERIAL|MATERIALS)>/i)) {
                obj.isMaterial = true;
            }
        }
    }
};

// 2. Inject "Materials" into the Command List
var _Noq_Window_ItemCategory_makeCommandList = Window_ItemCategory.prototype.makeCommandList;
Window_ItemCategory.prototype.makeCommandList = function() {
    _Noq_Window_ItemCategory_makeCommandList.call(this);
    
    // Find the 'Key Item' tab to insert Materials right before it
    var keyItemIndex = -1;
    for (var i = 0; i < this._list.length; i++) {
        if (this._list[i].symbol === 'keyItem') {
            keyItemIndex = i;
            break;
        }
    }
    
    var materialCmd = { name: "Materials", symbol: 'material', ext: null, enabled: true };
    
    // Splice it into the list, or push it to the end if Key Items are hidden
    if (keyItemIndex !== -1) {
        this._list.splice(keyItemIndex, 0, materialCmd);
    } else {
        this._list.push(materialCmd);
    }
};

// 3. Filter Items to their appropriate tabs
var _Noq_Window_ItemList_includes = Window_ItemList.prototype.includes;
Window_ItemList.prototype.includes = function(item) {
    // If the active tab is Materials
    if (this._category === 'material') {
        return DataManager.isItem(item) && item.itypeId === 1 && item.isMaterial;
    }
    
    // If the active tab is regular Items, filter OUT the materials
    if (this._category === 'item') {
        var included = _Noq_Window_ItemList_includes.call(this, item);
        if (included && item && item.isMaterial) {
            return false; 
        }
        return included;
    }
    
    // Default YEP/MV logic for Weapons, Armors, and Key Items
    return _Noq_Window_ItemList_includes.call(this, item);
};
// ============================================================================
// VERSION 2.2 UI: Advanced Filtering, Favorites, & Recent Memory
// ============================================================================

// 1. Parse the <Filter: Name> Notetag
var _Noq_DataManager_isDatabaseLoaded_Filter = DataManager.isDatabaseLoaded;
DataManager.isDatabaseLoaded = function() {
    if (!_Noq_DataManager_isDatabaseLoaded_Filter.call(this)) return false;
    if (!Noq.Weight._filtersLoaded) {
        this.processFilterNotetags($dataItems);
        this.processFilterNotetags($dataWeapons);
        this.processFilterNotetags($dataArmors);
        Noq.Weight._filtersLoaded = true;
    }
    return true;
};

DataManager.processFilterNotetags = function(group) {
    for (var n = 1; n < group.length; n++) {
        var obj = group[n];
        obj.customFilter = 'None';
        var notedata = obj.note.split(/[\r\n]+/);
        for (var i = 0; i < notedata.length; i++) {
            if (notedata[i].match(/<FILTER:[ ](.*)>/i)) {
                obj.customFilter = String(RegExp.$1).trim();
            }
        }
    }
};

// 2. Setup Party Variables for Memory
var _Noq_Game_Party_initialize = Game_Party.prototype.initialize;
Game_Party.prototype.initialize = function() {
    _Noq_Game_Party_initialize.call(this);
    this._favoriteItems = []; 
    this._recentItems = [];
};

Game_Party.prototype.makeItemKey = function(item) {
    if (DataManager.isItem(item)) return 'i' + item.id;
    if (DataManager.isWeapon(item)) return 'w' + item.id;
    if (DataManager.isArmor(item)) return 'a' + item.id;
    return null;
};

Game_Party.prototype.toggleFavorite = function(item) {
    var key = this.makeItemKey(item);
    if (!key) return;
    var index = this._favoriteItems.indexOf(key);
    if (index >= 0) {
        this._favoriteItems.splice(index, 1);
    } else {
        this._favoriteItems.push(key);
    }
};

// Track Recent Items (Capped at 30)
var _Noq_Game_Party_gainItem = Game_Party.prototype.gainItem;
Game_Party.prototype.gainItem = function(item, amount, includeEquip) {
    _Noq_Game_Party_gainItem.call(this, item, amount, includeEquip);
    if (item && amount > 0) {
        var key = this.makeItemKey(item);
        var index = this._recentItems.indexOf(key);
        if (index >= 0) this._recentItems.splice(index, 1);
        this._recentItems.unshift(key);
        if (this._recentItems.length > 30) this._recentItems.pop(); 
    }
};

// 3. Inject Filter Logic into the Item List
var _Noq_Window_ItemList_initialize = Window_ItemList.prototype.initialize;
Window_ItemList.prototype.initialize = function(x, y, width, height) {
    _Noq_Window_ItemList_initialize.call(this, x, y, width, height);
    // You can add or remove custom filter names from this array:
    this._filterModes = ['All', 'Alphabetical', 'Recent', 'Favorites', 'Potion', 'Battle', 'Book', 'Field'];
    this._currentFilterIndex = 0;
};

var _Noq_Window_ItemList_update = Window_ItemList.prototype.update;
Window_ItemList.prototype.update = function() {
    _Noq_Window_ItemList_update.call(this);
    
    // Only apply inputs if we are actually in the Item Menu
    if (this.active && SceneManager._scene instanceof Scene_Item) {
        
        // Cycle Filter (Shift Key)
        if (Input.isTriggered('shift')) {
            SoundManager.playCursor();
            this._currentFilterIndex = (this._currentFilterIndex + 1) % this._filterModes.length;
            this.refresh();
            if (SceneManager._scene._partyWeightWindow) SceneManager._scene._partyWeightWindow.refresh();
        }
        
        // Toggle Favorite (Ctrl / Alt Key)
        if (Input.isTriggered('control') && this.item()) {
            SoundManager.playEquip();
            $gameParty.toggleFavorite(this.item());
            this.refresh();
        }
    }
};

var _Noq_Window_ItemList_makeItemList = Window_ItemList.prototype.makeItemList;
Window_ItemList.prototype.makeItemList = function() {
    _Noq_Window_ItemList_makeItemList.call(this);
    
    if (!(SceneManager._scene instanceof Scene_Item)) return;

    var mode = this._filterModes[this._currentFilterIndex];
    
    if (mode === 'Alphabetical') {
        this._data.sort(function(a, b) { return a.name.localeCompare(b.name); });
    } else if (mode === 'Favorites') {
        this._data = this._data.filter(function(item) { return $gameParty._favoriteItems.contains($gameParty.makeItemKey(item)); });
    } else if (mode === 'Recent') {
        var recentData = [];
        for (var i = 0; i < $gameParty._recentItems.length; i++) {
            var key = $gameParty._recentItems[i];
            var found = this._data.filter(function(item) { return $gameParty.makeItemKey(item) === key; })[0];
            if (found) recentData.push(found);
        }
        this._data = recentData;
    } else if (mode !== 'All') {
        this._data = this._data.filter(function(item) { return item.customFilter.toLowerCase() === mode.toLowerCase(); });
    }
};

// Draw a Star next to Favorites
var _Noq_Window_ItemList_drawItemName = Window_ItemList.prototype.drawItemName;
Window_ItemList.prototype.drawItemName = function(item, x, y, width) {
    if (item && SceneManager._scene instanceof Scene_Item) {
        var isFav = $gameParty._favoriteItems.contains($gameParty.makeItemKey(item));
        var text = isFav ? "★ " + item.name : item.name;
        var iconBoxWidth = Window_Base._iconWidth + 4;
        this.resetTextColor();
        this.drawIcon(item.iconIndex, x + 2, y + 2);
        if (isFav) this.changeTextColor(this.powerUpColor());
        this.drawText(text, x + iconBoxWidth, y, width - iconBoxWidth);
        this.resetTextColor();
    } else {
        _Noq_Window_ItemList_drawItemName.call(this, item, x, y, width);
    }
};

// 4. Update the UI Window to show the active Filter
Window_PartyWeight.prototype.refresh = function() {
    this.contents.clear();
    var current = $gameParty.currentInventoryWeight();
    var max = $gameParty.maxWeightCapacity();
    var w = this.contentsWidth();
    
    var filterText = 'All';
    if (SceneManager._scene && SceneManager._scene._itemWindow) {
        var win = SceneManager._scene._itemWindow;
        filterText = win._filterModes[win._currentFilterIndex];
    }
    
    // Top Line: Filter State
    this.changeTextColor(this.systemColor());
    this.drawText("Filter:", 0, 0, 80);
    this.resetTextColor();
    this.drawText(filterText, 0, 0, w, 'right');
    
    // Bottom Line: Bag Weight
    this.changeTextColor(this.systemColor());
    this.drawText("Bag:", 0, this.lineHeight(), 80);
    
    if (current > max) {
        this.changeTextColor(this.powerDownColor());
    } else if (current > max * 0.85) {
        this.changeTextColor(this.crisisColor());
    } else {
        this.resetTextColor();
    }
    
    var valText = current.toFixed(1) + " / " + max.toFixed(1);
    this.drawText(valText, 0, this.lineHeight(), w, 'right');
    this.resetTextColor();
};
