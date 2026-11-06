/*:
 * @target MV
 * @plugindesc (MV, ES5) Dynamic Actor Quick Bar (Burnout & Verse Synergy) & Party HUD
 * @author Noq
 *
 * @param disableSwitch
 * @text Disable HUD Switch
 * @desc If this Switch is ON, the Quick Bar is hidden and disabled.
 * @default 20
 * 
 * @help
 * ============================================================================
 * QUICK ITEM SYSTEM (ACTOR-BOUND)
 * ============================================================================
 * 1. Add <QuickAccess> to the Note Box of any item.
 * 2. HOLD down 1, 2, 3, or 4 for 0.5s to assign an item to that Party Slot.
 * 3. TAP to use. The item assignment stays with the specific Actor!
 * 
 * ============================================================================
 * BURNOUT & VERSE SYNERGY NOTETAGS
 * ============================================================================
 * <BurnoutCost: X> 
 * Adds X Burnout instantly (or per second if a Sustain Switch is used).
 *
 * <SustainSwitch: X>
 * Toggles Switch X ON/OFF. While ON, Burnout is drained every 1 second.
 * Extinguishes automatically if the Actor overheats.
 *
 * <VerseEfficiency: X, Y>
 * Class IDs that are highly efficient (Halves cost, 1.5x effect).
 *
 * <VerseDeficiency: X, Y>
 * Class IDs that struggle (Doubles cost, 0.5x effect).
 */

(function() {
    'use strict';

    var disableSwitch = Number(PluginManager.parameters('Noq_ExplorationHUD')['disableSwitch'] || 20);

    Input.keyMapper[49] = 'quick1'; 
    Input.keyMapper[50] = 'quick2'; 
    Input.keyMapper[51] = 'quick3'; 
    Input.keyMapper[52] = 'quick4'; 
    Input.keyMapper[83] = 'statusHud';

    // ------------------------------------------------------------------------
    // ACTOR DATA INJECTION
    // ------------------------------------------------------------------------
    var _Game_Actor_initMembers = Game_Actor.prototype.initMembers;
    Game_Actor.prototype.initMembers = function() {
        _Game_Actor_initMembers.call(this);
        this._quickItemId = 0;
    };

    // ------------------------------------------------------------------------
    // GLOBAL SYSTEM TRACKING (For Sustained Items & Lighting Sync)
    // ------------------------------------------------------------------------
    var _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._activeFieldActorId = 0;
        this._activeFieldItemId = 0;
        this._fieldEffectMultiplier = 1.0;
    };

    Game_System.prototype.fieldEffectMultiplier = function() {
        return this._fieldEffectMultiplier || 1.0;
    };

    // ------------------------------------------------------------------------
    // SPRITE: Quick Item Bar
    // ------------------------------------------------------------------------
    function Sprite_QuickBar() {
        this.initialize.apply(this, arguments);
    }
    Sprite_QuickBar.prototype = Object.create(Sprite.prototype);
    Sprite_QuickBar.prototype.constructor = Sprite_QuickBar;

Sprite_QuickBar.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this);
        this.anchor.x = 0; // Set to 0 to align with the left edge of the screen
        this.anchor.y = 1.0;
        this.x = 0; // Explicitly set to 0 so the bitmap spans the full screen width
        this.y = Graphics.boxHeight - 10;
        this.opacity = 0;
        this._holdTimers = [0, 0, 0, 0]; 
        this._lastRoster = [];
        this._lastItems = [];
        this._burnoutTick = 0;
        this.createBitmap();
    };

    Sprite_QuickBar.prototype.createBitmap = function() {
        this.bitmap = new Bitmap(Graphics.boxWidth, 60);
    };

    Sprite_QuickBar.prototype.refresh = function() {
        this.bitmap.clear();
        var members = $gameParty.battleMembers();
        var numSlots = members.length;
        if (numSlots === 0) return;

        var slotWidth = 40;
        var padding = 15;
        var totalWidth = (numSlots * slotWidth) + ((numSlots - 1) * padding);
        var startX = (Graphics.boxWidth / 2) - (totalWidth / 2);

        var ctx = this.bitmap.context;
        var iconSet = ImageManager.loadSystem('IconSet');

        for (var i = 0; i < numSlots; i++) {
            var actor = members[i];
            var itemId = actor._quickItemId || 0;
            this._lastRoster[i] = actor.actorId();
            this._lastItems[i] = itemId;
            
            var slotX = startX + (i * (slotWidth + padding));
            var slotY = 10;
            
            // 1. Draw Glassy Background
            var grad = ctx.createLinearGradient(0, slotY, 0, slotY + 40);
            grad.addColorStop(0, 'rgba(30, 30, 40, 0.8)');
            grad.addColorStop(1, 'rgba(10, 10, 15, 0.5)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(slotX, slotY, 40, 40, 8);
            else ctx.rect(slotX, slotY, 40, 40);
            ctx.fill();

            // 2. Draw Mini Face Graphic (Faded to background)
            if (actor.faceName()) {
                var bmp = ImageManager.loadFace(actor.faceName());
                if (!bmp.isReady()) {
                    bmp.addLoadListener(this.refresh.bind(this));
                } else {
                    var sw = Window_Base._faceWidth;
                    var sh = Window_Base._faceHeight;
                    var sx = actor.faceIndex() % 4 * sw;
                    var sy = Math.floor(actor.faceIndex() / 4) * sh;
                    ctx.globalAlpha = 0.4; // Fade face
                    this.bitmap.blt(bmp, sx, sy, sw, sh, slotX + 2, slotY + 2, 36, 36);
                    ctx.globalAlpha = 1.0;
                }
            }

            // 3. Draw Slot Number
            this.bitmap.fontSize = 14;
            this.bitmap.drawText((i+1).toString(), slotX + 4, slotY - 14, 40, 40, 'left');

            // 4. Draw Item Icon
            if (itemId > 0) {
                var item = $dataItems[itemId];
                if ($gameParty.hasItem(item)) {
                    var pw = Window_Base._iconWidth || 32;
                    var ph = Window_Base._iconHeight || 32;
                    var isx = (item.iconIndex % 16) * pw;
                    var isy = Math.floor(item.iconIndex / 16) * ph;
                    this.bitmap.blt(iconSet, isx, isy, pw, ph, slotX + 4, slotY + 4);
                } else {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.fillRect(slotX, slotY, 40, 40);
                }
            }
        }
    };

    Sprite_QuickBar.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (!$gameParty) return;

        var members = $gameParty.battleMembers();
        var needsRefresh = false;

        if (this._lastRoster.length !== members.length) needsRefresh = true;
        for (var i = 0; i < members.length; i++) {
            if (this._lastRoster[i] !== members[i].actorId()) needsRefresh = true;
            if (this._lastItems[i] !== members[i]._quickItemId) needsRefresh = true;
        }

        if (needsRefresh) this.refresh();
        this.updateBurnoutSustain();

        if ($gameMap.isEventRunning() || $gameSwitches.value(disableSwitch)) {
            this.opacity -= 15;
            this._holdTimers = [0, 0, 0, 0];
        } else {
            this.opacity += 15;
            this.handleInput();
        }
    };

    Sprite_QuickBar.prototype.handleInput = function() {
        var members = $gameParty.battleMembers();
        for (var i = 0; i < members.length; i++) {
            var key = 'quick' + (i+1);
            if (Input.isPressed(key)) {
                this._holdTimers[i]++;
                if (this._holdTimers[i] === 30) {
                    SoundManager.playOk();
                    SceneManager.push(Scene_QuickAssign);
                    SceneManager._nextScene.prepare(i, members[i]);
                    this._holdTimers[i] = 0; 
                }
            } else {
                if (this._holdTimers[i] > 0 && this._holdTimers[i] < 30) {
                    this.executeQuickItem(members[i]);
                }
                this._holdTimers[i] = 0;
            }
        }
    };

    Sprite_QuickBar.prototype.getVerseMultipliers = function(actor, item) {
        var note = item.note || "";
        var effMatch = note.match(/<VerseEfficiency:\s*([\d,\s]+)>/i);
        var defMatch = note.match(/<VerseDeficiency:\s*([\d,\s]+)>/i);
        var mult = { cost: 1.0, effect: 1.0 };
        var classId = actor._classId;

        if (effMatch) {
            var effArr = effMatch[1].split(',').map(Number);
            if (effArr.indexOf(classId) >= 0) {
                mult.cost = 0.5; mult.effect = 1.5;
            }
        }
        if (defMatch) {
            var defArr = defMatch[1].split(',').map(Number);
            if (defArr.indexOf(classId) >= 0) {
                mult.cost = 2.0; mult.effect = 0.5;
            }
        }
        return mult;
    };

    Sprite_QuickBar.prototype.executeQuickItem = function(actor) {
        var itemId = actor._quickItemId || 0;
        if (itemId === 0) { SoundManager.playBuzzer(); return; }
        
        var item = $dataItems[itemId];
        if (!$gameParty.hasItem(item)) { SoundManager.playBuzzer(); return; }
        
        // Prevent usage if overheated
        if (actor.isStateAffected(17) || (actor.tpLimit && actor.tp >= actor.tpLimit())) {
            SoundManager.playBuzzer(); return;
        }

        var note = item.note || "";
        var sustainMatch = note.match(/<SustainSwitch:\s*(\d+)>/i);
        var costMatch = note.match(/<BurnoutCost:\s*(\d+)>/i);
        var baseCost = costMatch ? Number(costMatch[1]) : 0;
        
        var verseMult = this.getVerseMultipliers(actor, item);
        var finalCost = Math.ceil(baseCost * verseMult.cost);

        if (sustainMatch) {
            // TOGGLE SUSTAIN ITEM
            var switchId = Number(sustainMatch[1]);
            var currentState = $gameSwitches.value(switchId);
            
            if (!currentState) {
                // Turning ON
                SoundManager.playUseItem();
                $gameSwitches.setValue(switchId, true);
                $gameSystem._activeFieldActorId = actor.actorId();
                $gameSystem._activeFieldItemId = itemId;
                $gameSystem._fieldEffectMultiplier = verseMult.effect;
                // Run CE if attached
                var ce = item.effects.filter(function(e) { return e.code === 44; });
                if (ce.length > 0) $gameTemp.reserveCommonEvent(ce[0].dataId);
            } else {
                // Turning OFF
                SoundManager.playCancel();
                $gameSwitches.setValue(switchId, false);
                $gameSystem._activeFieldActorId = 0;
                $gameSystem._activeFieldItemId = 0;
                $gameSystem._fieldEffectMultiplier = 1.0;
                var ceOff = item.effects.filter(function(e) { return e.code === 44; });
                if (ceOff.length > 0) $gameTemp.reserveCommonEvent(ceOff[0].dataId);
            }
        } else {
            // SINGLE FIRE ITEM
            SoundManager.playUseItem();
            actor.gainTp(finalCost);
            var ceSing = item.effects.filter(function(e) { return e.code === 44; });
            if (ceSing.length > 0) $gameTemp.reserveCommonEvent(ceSing[0].dataId);
            if (item.consumable) $gameParty.consumeItem(item);
        }
    };

    Sprite_QuickBar.prototype.updateBurnoutSustain = function() {
        if ($gameSystem._activeFieldItemId === 0) return;
        
        var item = $dataItems[$gameSystem._activeFieldItemId];
        var sustainMatch = item.note.match(/<SustainSwitch:\s*(\d+)>/i);
        if (!sustainMatch) return;

        var switchId = Number(sustainMatch[1]);
        if (!$gameSwitches.value(switchId)) {
            // Switch was turned off elsewhere
            $gameSystem._activeFieldItemId = 0;
            return;
        }

        this._burnoutTick++;
        if (this._burnoutTick >= 60) {
            this._burnoutTick = 0;
            var actor = $gameActors.actor($gameSystem._activeFieldActorId);
            
            if (actor) {
                var costMatch = item.note.match(/<BurnoutCost:\s*(\d+)>/i);
                var baseCost = costMatch ? Number(costMatch[1]) : 0;
                var verseMult = this.getVerseMultipliers(actor, item);
                var finalCost = Math.ceil(baseCost * verseMult.cost);
                
                actor.gainTp(finalCost);

                // Check Overheat (State 17 or max TP)
                var maxTp = actor.tpLimit ? actor.tpLimit() : 100;
                if (actor.isStateAffected(17) || actor.tp >= maxTp) {
                    $gameSwitches.setValue(switchId, false);
                    $gameSystem._activeFieldItemId = 0;
                    $gameSystem._fieldEffectMultiplier = 1.0;
                    SoundManager.playBuzzer(); // Audible overheat failure
                }
            }
        }
    };

    // ========================================================================
    // SCENE: Quick Assign Menu
    // ========================================================================
    function Scene_QuickAssign() {
        this.initialize.apply(this, arguments);
    }
    Scene_QuickAssign.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_QuickAssign.prototype.constructor = Scene_QuickAssign;

    Scene_QuickAssign.prototype.prepare = function(slotIndex, actor) {
        this._slotIndex = slotIndex;
        this._actor = actor;
    };

    Scene_QuickAssign.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createHelpWindow();
        this.createItemWindow();
        this._helpWindow.setText("Assign item to " + this._actor.name() + " (Slot " + (this._slotIndex + 1) + ")");
    };

    Scene_QuickAssign.prototype.createItemWindow = function() {
        var wy = this._helpWindow.y + this._helpWindow.height;
        var wh = Graphics.boxHeight - wy;
        this._itemWindow = new Window_QuickAssign(0, wy, Graphics.boxWidth, wh);
        this._itemWindow.setHelpWindow(this._helpWindow);
        this._itemWindow.setHandler('ok',     this.onItemOk.bind(this));
        this._itemWindow.setHandler('cancel', this.popScene.bind(this));
        this.addChild(this._itemWindow);
        this._itemWindow.activate();
        this._itemWindow.select(0);
    };

    Scene_QuickAssign.prototype.onItemOk = function() {
        var item = this._itemWindow.item();
        if (item) {
            this._actor._quickItemId = item.id;
        } else {
            this._actor._quickItemId = 0;
        }
        SoundManager.playEquip();
        this.popScene();
    };

    // ========================================================================
    // WINDOW: Quick Assign List
    // ========================================================================
    function Window_QuickAssign() {
        this.initialize.apply(this, arguments);
    }
    Window_QuickAssign.prototype = Object.create(Window_ItemList.prototype);
    Window_QuickAssign.prototype.constructor = Window_QuickAssign;

    Window_QuickAssign.prototype.includes = function(item) {
        if (!item) return false;
        return DataManager.isItem(item) && item.note.match(/<QuickAccess>/i);
    };

    Window_QuickAssign.prototype.makeItemList = function() {
        this._data = $gameParty.items().filter(function(item) {
            return this.includes(item);
        }, this);
        this._data.unshift(null); // Add "- Clear Slot -" option
    };

    Window_QuickAssign.prototype.isEnabled = function(item) { return true; };

    Window_QuickAssign.prototype.drawItem = function(index) {
        var item = this._data[index];
        var rect = this.itemRect(index);
        rect.width -= this.textPadding();
        if (item) {
            Window_ItemList.prototype.drawItem.call(this, index);
        } else {
            this.drawText("- Clear Slot -", rect.x, rect.y, rect.width, 'center');
        }
    };

    // ========================================================================
    // SPRITE: Party Status HUD
    // ========================================================================
    function Sprite_PartyHUD() {
        this.initialize.apply(this, arguments);
    }
    Sprite_PartyHUD.prototype = Object.create(Sprite.prototype);
    Sprite_PartyHUD.prototype.constructor = Sprite_PartyHUD;

    Sprite_PartyHUD.prototype.initialize = function() {
        Sprite.prototype.initialize.call(this);
        this.x = Graphics.boxWidth - 220; 
        this.y = (Graphics.boxHeight / 2) - 100; 
        this.opacity = 0;
        this._showTimer = 0;
        this._isToggledOn = false;
        this._lastStats = [];
        this.createBitmap();
    };

    Sprite_PartyHUD.prototype.createBitmap = function() {
        this.bitmap = new Bitmap(200, 300);
    };

    Sprite_PartyHUD.prototype.refresh = function() {
        this.bitmap.clear();
        var members = $gameParty.battleMembers();
        var ctx = this.bitmap.context;

        var h = members.length * 60 + 20;
        var grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(30, 30, 40, 0.8)');
        grad.addColorStop(1, 'rgba(10, 10, 15, 0.5)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(0, 0, 200, h, 8);
        else ctx.rect(0, 0, 200, h);
        ctx.fill();

        for (var i = 0; i < members.length; i++) {
            var actor = members[i];
            var y = 10 + (i * 60);

            this.bitmap.fontSize = 18;
            if (actor.isStateAffected(17)) this.bitmap.textColor = '#ffaa00'; // Orange if burnt out
            this.bitmap.drawText(actor.name(), 10, y, 180, 24, 'left');
            this.bitmap.textColor = '#ffffff';

            var hpRate = actor.hp / actor.mhp;
            ctx.fillStyle = '#333333';
            ctx.fillRect(10, y + 26, 180, 6);
            ctx.fillStyle = '#ff4444'; 
            ctx.fillRect(10, y + 26, 180 * hpRate, 6);

            var mpRate = actor.mp / actor.mmp;
            ctx.fillStyle = '#333333';
            ctx.fillRect(10, y + 36, 85, 6);
            ctx.fillStyle = '#4488ff'; 
            ctx.fillRect(10, y + 36, 85 * mpRate, 6);

            var limit = actor.tpLimit ? actor.tpLimit() : 100;
            var tpRate = (actor.tp || 0) / limit;
            ctx.fillStyle = '#333333';
            ctx.fillRect(105, y + 36, 85, 6);
            ctx.fillStyle = actor.isStateAffected(17) ? '#ff0000' : '#ffaa00'; 
            ctx.fillRect(105, y + 36, 85 * tpRate, 6);
        }
    };

    Sprite_PartyHUD.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (!$gameParty) return;

        this.checkStatChanges();

        if (Input.isTriggered('statusHud')) {
            this._isToggledOn = !this._isToggledOn;
            if (this._isToggledOn) {
                this.refresh();
                SoundManager.playCursor();
            }
        }

        if ($gameMap.isEventRunning() || $gameSwitches.value(disableSwitch)) {
            this.opacity -= 15;
        } else if (this._isToggledOn || this._showTimer > 0) {
            this.opacity += 15;
            if (this._showTimer > 0) this._showTimer--;
        } else {
            this.opacity -= 15;
        }
    };

    Sprite_PartyHUD.prototype.checkStatChanges = function() {
        var members = $gameParty.battleMembers();
        var needsRefresh = false;
        var tookDamage = false;

        for (var i = 0; i < members.length; i++) {
            var a = members[i];
            if (!this._lastStats[i]) this._lastStats[i] = {hp: a.hp, mp: a.mp, tp: a.tp};

            if (this._lastStats[i].hp !== a.hp || this._lastStats[i].mp !== a.mp || this._lastStats[i].tp !== a.tp) {
                needsRefresh = true;
                tookDamage = true;
                this._lastStats[i] = {hp: a.hp, mp: a.mp, tp: a.tp};
            }
        }

        if (needsRefresh) {
            this.refresh();
            if (tookDamage && !this._isToggledOn) this._showTimer = 180;
        }
    };

    // Inject into Spriteset_Map
    var _Spriteset_Map_createUpperLayer = Spriteset_Map.prototype.createUpperLayer;
    Spriteset_Map.prototype.createUpperLayer = function() {
        _Spriteset_Map_createUpperLayer.call(this);
        this._quickBar = new Sprite_QuickBar();
        this._partyHud = new Sprite_PartyHUD();
        this.addChild(this._quickBar);
        this.addChild(this._partyHud);
    };

})();