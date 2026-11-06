/*:
 * @plugindesc v1.2 Endless Epoch - Resonance Lockpicking
 * @author Tyson (Noq)
 *
 * @param Key Item ID
 * @desc The database ID of the Resonance Key
 * @default 33
 *
 * @param Result Variable ID
 * @desc The Game Variable to store the result (0 = Fail/Cancel, 1 = Win)
 * @default 99
 *
 * @param Base Sweet Spot Size
 * @desc Percentage of the bar that is the sweet spot (e.g. 10 for 10%)
 * @default 10
 *
 * @param Charge SE
 * @desc The sound effect to play repeatedly while holding
 * @default Up4
 * 
 * @param Success SE
 * @desc The sound effect to play on passing a level
 * @default Key
 *
 * @param Fail SE
 * @desc The sound effect to play on failure or key break
 * @default Buzzer1
 *
 * @help
 * ============================================================================
 * COMMANDS & CALLS
 * ============================================================================
 * PLUGIN COMMAND:
 * Lockpick Start X
 * (Where X is the number of levels. Example: Lockpick Start 3)
 *
 * SCRIPT CALL (For Treasure Chests):
 * $gameSystem.replenishResonanceKey();
 */

(function() {

    var parameters = PluginManager.parameters('Noq_ResonanceLockpick');
    var KEY_ITEM_ID = Number(parameters['Key Item ID'] || 33);
    var RESULT_VAR_ID = Number(parameters['Result Variable ID'] || 99);
    var BASE_SWEET_SPOT = Number(parameters['Base Sweet Spot Size'] || 10);
    var SE_CHARGE = String(parameters['Charge SE'] || 'Up4');
    var SE_SUCCESS = String(parameters['Success SE'] || 'Key');
    var SE_FAIL = String(parameters['Fail SE'] || 'Buzzer1');

    // --- SYSTEM DATA ---
    var alias_Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        alias_Game_System_initialize.call(this);
        this._resonanceKeyHp = 100;
    };

    Game_System.prototype.replenishResonanceKey = function() {
        this._resonanceKeyHp = 100;
        if (!$gameParty.hasItem($dataItems[KEY_ITEM_ID])) {
            $gameParty.gainItem($dataItems[KEY_ITEM_ID], 1);
        }
    };

    // --- PLUGIN COMMAND ---
    var alias_Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        alias_Game_Interpreter_pluginCommand.call(this, command, args);
        if (command.toLowerCase() === 'lockpick') {
            if (args[0] && args[0].toLowerCase() === 'start') {
                
                $gameVariables.setValue(RESULT_VAR_ID, 0);

                if (!$gameParty.hasItem($dataItems[KEY_ITEM_ID])) {
                    $gameMessage.add("You need a Resonance Key to pick this lock.");
                    return; 
                }
                
                var levels = Number(args[1] || 1);
                SceneManager.push(Scene_Lockpick);
                SceneManager.prepareNextScene(levels);
                
                this._waitMode = 'scene';
            }
        }
    };

    // ========================================================================
    // SCENE: LOCKPICK
    // ========================================================================
    function Scene_Lockpick() {
        this.initialize.apply(this, arguments);
    }
    Scene_Lockpick.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Lockpick.prototype.constructor = Scene_Lockpick;

    Scene_Lockpick.prototype.prepare = function(levels) {
        this._maxLevels = levels;
    };

    Scene_Lockpick.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.createActorWindow();
        this.createMiniGameWindow();
    };

    Scene_Lockpick.prototype.createActorWindow = function() {
        this._actorWindow = new Window_LockpickActor();
        this._actorWindow.setHandler('ok', this.onActorOk.bind(this));
        this._actorWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._actorWindow);
    };

    Scene_Lockpick.prototype.createMiniGameWindow = function() {
        this._miniGameWindow = new Window_LockpickGame(this._maxLevels);
        this.addWindow(this._miniGameWindow);
        this._miniGameWindow.hide();
    };

    Scene_Lockpick.prototype.onActorOk = function() {
        var actor = this._actorWindow.actor();
        if (actor.isStateAffected(17)) {
            SoundManager.playBuzzer();
            this._actorWindow.activate();
            return;
        }
        this._actorWindow.hide();
        this._miniGameWindow.setActor(actor);
        this._miniGameWindow.show();
        this._miniGameWindow.activate();
    };

    // ========================================================================
    // WINDOW: ACTOR SELECT
    // ========================================================================
    function Window_LockpickActor() {
        this.initialize.apply(this, arguments);
    }
    Window_LockpickActor.prototype = Object.create(Window_Selectable.prototype);
    Window_LockpickActor.prototype.constructor = Window_LockpickActor;

    Window_LockpickActor.prototype.initialize = function() {
        var width = 600;
        var height = 400;
        var x = (Graphics.boxWidth - width) / 2;
        var y = (Graphics.boxHeight - height) / 2;
        Window_Selectable.prototype.initialize.call(this, x, y, width, height);
        this.refresh();
        this.activate();
        this.select(0);
    };

    Window_LockpickActor.prototype.maxItems = function() { return $gameParty.members().length; };
    Window_LockpickActor.prototype.actor = function() { return $gameParty.members()[this.index()]; };

    Window_LockpickActor.prototype.drawItem = function(index) {
        var actor = $gameParty.members()[index];
        var rect = this.itemRect(index);
        
        this.changePaintOpacity(!actor.isStateAffected(17));

        this.drawActorCharacter(actor, rect.x + 24, rect.y + 48);
        this.drawText(actor.name(), rect.x + 60, rect.y, 150);
        
        this.changeTextColor(this.systemColor());
        this.drawText("Resonance:", rect.x + 220, rect.y, 120);
        this.changeTextColor(this.normalColor());
        this.drawText(actor.luk, rect.x + 330, rect.y, 40);

        this.changeTextColor(this.systemColor());
        this.drawText("Burnout:", rect.x + 390, rect.y, 100);
        this.changeTextColor(this.normalColor());
        this.drawText(Math.floor(actor.tp) + "/" + actor.tpLimit(), rect.x + 480, rect.y, 80);

        this.changePaintOpacity(true);
    };

    // ========================================================================
    // WINDOW: MINI-GAME ENGINE
    // ========================================================================
    function Window_LockpickGame() {
        this.initialize.apply(this, arguments);
    }
    Window_LockpickGame.prototype = Object.create(Window_Base.prototype);
    Window_LockpickGame.prototype.constructor = Window_LockpickGame;

    Window_LockpickGame.prototype.initialize = function(maxLevels) {
        var width = 500;
        var height = 300;
        var x = (Graphics.boxWidth - width) / 2;
        var y = (Graphics.boxHeight - height) / 2;
        Window_Base.prototype.initialize.call(this, x, y, width, height);
        
        this._maxLevels = maxLevels;
        this._currentLevel = 1;
        this._actor = null;
        
        // NEW STATE SYSTEM
        this._state = 'idle'; 
        this._resultTimer = 0; // Replaces setTimeout

        this._gaugeValue = 0;
        this._pitch = 100;
        this._audioTick = 0;
    };

    Window_LockpickGame.prototype.setActor = function(actor) {
        this._actor = actor;
        this.setupLevel();
    };

    Window_LockpickGame.prototype.setupLevel = function() {
        // Prevents instant trigger if player is still holding Space from menu
        this._state = 'waiting_for_release'; 
        
        this._gaugeValue = 0;
        this._pitch = 100;
        
        this._fillSpeed = 1.0 + (this._currentLevel * 0.5); 
        
        var lukMod = (this._actor.luk * 0.05); 
        this._targetWidth = Math.min(40, BASE_SWEET_SPOT + lukMod); 
        this._targetStart = 20 + Math.random() * (80 - this._targetWidth - 20); 

        this.refresh();
    };

    Window_LockpickGame.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (!this._actor) return;

        // If we are showing a result screen, just tick down the timer and ignore inputs
        if (this._state.startsWith('result_')) {
            if (this._resultTimer > 0) {
                this._resultTimer--;
                if (this._resultTimer <= 0) this.executeResultAction();
            }
            return;
        }

        // Allow player to manually cancel (but not during a result pop-up)
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            SceneManager.pop();
            return;
        }

        // Check if Burnout limit reached mid-hold
        if (this._actor.isStateAffected(17)) {
            this.failLock("Burnout Limit Reached!", true); // true = force boot out
            return;
        }

        // Wait for player to let go of OK button before allowing game to start
        if (this._state === 'waiting_for_release') {
            if (!Input.isPressed('ok')) {
                this._state = 'idle';
            }
            return;
        }

        // Main Holding Logic
        if (Input.isPressed('ok')) {
            if (this._state === 'idle') this._state = 'holding';
            
            var burnoutGain = Math.max(0.1, 1.0 - (this._actor.luk * 0.01));
            this._actor.gainTp(burnoutGain);

            this._gaugeValue += this._fillSpeed;
            
            this._audioTick++;
            if (this._audioTick % 5 === 0) {
                AudioManager.playSe({ name: SE_CHARGE, volume: 80, pitch: this._pitch, pan: 0 });
                this._pitch = Math.min(250, this._pitch + 5);
            }

            if (this._gaugeValue >= 100) {
                this._gaugeValue = 100;
                this.checkRelease();
            }
            this.refresh();
            
        } else if (this._state === 'holding' && !Input.isPressed('ok')) {
            this.checkRelease();
        }
    };

    Window_LockpickGame.prototype.checkRelease = function() {
        var inSweetSpot = (this._gaugeValue >= this._targetStart && this._gaugeValue <= (this._targetStart + this._targetWidth));
        
        if (inSweetSpot) {
            AudioManager.playSe({ name: SE_SUCCESS, volume: 100, pitch: 100, pan: 0 });
            var keyDmg = Math.max(1, 5 - (this._actor.luk * 0.05));
            $gameSystem._resonanceKeyHp -= keyDmg;
            
            if (this._currentLevel >= this._maxLevels) {
                this.showResult("Unlocked!", 'result_win_all', 60); // 60 frames = 1 second
            } else {
                this.showResult("Level " + this._currentLevel + " Clear!", 'result_win_level', 60);
            }
        } else {
            // Missed! They get to retry instead of being booted out
            this.failLock("Missed Sequence!", false); 
        }
    };

    Window_LockpickGame.prototype.failLock = function(reason, forceBoot) {
        AudioManager.playSe({ name: SE_FAIL, volume: 100, pitch: 100, pan: 0 });
        $gameScreen.startShake(5, 5, 20); 
        
        var keyDmg = Math.max(10, 25 - (this._actor.luk * 0.1));
        $gameSystem._resonanceKeyHp -= keyDmg;

        if ($gameSystem._resonanceKeyHp <= 0) {
            $gameParty.loseItem($dataItems[KEY_ITEM_ID], 1);
            this.showResult("Key Shattered!", 'result_fail_boot', 90);
        } else if (forceBoot) {
            this.showResult(reason, 'result_fail_boot', 90);
        } else {
            this.showResult(reason + " Try again!", 'result_fail_retry', 60);
        }
    };

    Window_LockpickGame.prototype.showResult = function(text, nextState, durationFrames) {
        this._state = nextState;
        this._resultTimer = durationFrames;
        this.refresh(text);
    };

    Window_LockpickGame.prototype.executeResultAction = function() {
        switch(this._state) {
            case 'result_win_level':
                this._currentLevel++;
                this.setupLevel();
                break;
            case 'result_win_all':
                $gameVariables.setValue(RESULT_VAR_ID, 1);
                SceneManager.pop();
                break;
            case 'result_fail_retry':
                this.setupLevel(); // Reset gauge, let them try again
                break;
            case 'result_fail_boot':
                SceneManager.pop(); // Key broke or Burnout reached
                break;
        }
    };

    Window_LockpickGame.prototype.refresh = function(overrideText) {
        this.contents.clear();
        
        this.drawText("Lock Level: " + this._currentLevel + "/" + this._maxLevels, 0, 0, this.contentsWidth(), 'center');
        
        this.changeTextColor(this.systemColor());
        this.drawText("Key Integrity: ", 0, 40, 150);
        this.changeTextColor(this.normalColor());
        this.drawText(Math.floor($gameSystem._resonanceKeyHp) + "%", 150, 40, 100);

        this.changeTextColor(this.systemColor());
        this.drawText("Burnout: ", 250, 40, 100);
        this.changeTextColor(this.normalColor());
        this.drawText(Math.floor(this._actor.tp) + "/" + this._actor.tpLimit(), 350, 40, 100);

        var barY = 120;
        var barWidth = this.contentsWidth() - 40;
        
        this.contents.fillRect(20, barY, barWidth, 30, '#333333');
        
        var targetX = 20 + (barWidth * (this._targetStart / 100));
        var targetW = barWidth * (this._targetWidth / 100);
        this.contents.fillRect(targetX, barY, targetW, 30, '#00AAFF'); 

        var fillW = barWidth * (this._gaugeValue / 100);
        this.contents.fillRect(20, barY + 10, fillW, 10, '#FFFFFF'); 

        if (overrideText) {
            this.changeTextColor(this.systemColor());
            this.drawText(overrideText, 0, 200, this.contentsWidth(), 'center');
        } else {
            this.drawText("Hold [OK/Space] to build resonance.", 0, 200, this.contentsWidth(), 'center');
            this.drawText("Release in the blue zone!", 0, 230, this.contentsWidth(), 'center');
        }
    };

})();