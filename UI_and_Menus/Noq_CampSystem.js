/*:
 * @plugindesc v1.0 Endless Epoch Camp System UI
 * @author Tyson (Noq)
 *
 * @help
 * ============================================================================
 * MAP NOTETAGS
 * ============================================================================
 * <CampCapable>
 * Put this in the Note box of any map where the player is allowed to camp.
 *
 * ============================================================================
 * SCRIPT CALLS (For your Common Event)
 * ============================================================================
 * Noq.canCamp()
 * Returns true if the map has the <CampCapable> tag.
 *
 * SceneManager.push(Scene_Camp);
 * Opens the Camp Menu UI.
 */

var Noq = Noq || {};

// Check if the current map allows camping
Noq.canCamp = function() {
    if (!$dataMap || !$dataMap.note) return false;
    return !!$dataMap.meta.CampCapable || $dataMap.note.match(/<CampCapable>/i);
};

// ============================================================================
// SCENE: CAMP MENU
// ============================================================================
function Scene_Camp() {
    this.initialize.apply(this, arguments);
}
Scene_Camp.prototype = Object.create(Scene_MenuBase.prototype);
Scene_Camp.prototype.constructor = Scene_Camp;

Scene_Camp.prototype.create = function() {
    Scene_MenuBase.prototype.create.call(this);
    this.createCommandWindow();
};

Scene_Camp.prototype.createCommandWindow = function() {
    this._commandWindow = new Window_CampCommand(0, 0);
    // Center the window on screen
    this._commandWindow.x = (Graphics.boxWidth - this._commandWindow.width) / 2;
    this._commandWindow.y = (Graphics.boxHeight - this._commandWindow.height) / 2;
    
    // Bind Handlers
    this._commandWindow.setHandler('rest',    this.commandRest.bind(this));
    this._commandWindow.setHandler('eat',     this.commandEat.bind(this));
    this._commandWindow.setHandler('talk',    this.commandTalk.bind(this));
    this._commandWindow.setHandler('level',   this.commandLevel.bind(this));
    this._commandWindow.setHandler('leave',   this.commandLeave.bind(this));
    this._commandWindow.setHandler('cancel',  this.commandLeave.bind(this));
    
    this.addWindow(this._commandWindow);
};

// --- Command Logic ---

Scene_Camp.prototype.commandRest = function() {
    // Recover all HP/MP
    $gameParty.members().forEach(function(actor) {
        actor.recoverAll();
    });
    SoundManager.playRecovery();
    this._commandWindow.activate(); // Keep menu open, or call popScene() to close
};

Scene_Camp.prototype.commandEat = function() {
    // Opens the standard Item Menu so players can use food
    SceneManager.push(Scene_Item);
};

Scene_Camp.prototype.commandTalk = function() {
    // Close the menu and trigger a specific Common Event for dialogue
    this.popScene();
    $gameTemp.reserveCommonEvent(49); // CHANGE '10' TO YOUR CHATTER COMMON EVENT ID
};

Scene_Camp.prototype.commandLevel = function() {
    // Calls your existing Stat Distribution Scene!
    if (typeof Scene_StatDistribution !== 'undefined') {
        SceneManager.push(Scene_StatDistribution);
    } else {
        SoundManager.playBuzzer();
        this._commandWindow.activate();
    }
};

Scene_Camp.prototype.commandLeave = function() {
    // Close the menu to allow the player to walk around the camp map, 
    // or trigger a common event to pack up and leave.
    this.popScene();
};

// ============================================================================
// WINDOW: CAMP COMMANDS
// ============================================================================
function Window_CampCommand() {
    this.initialize.apply(this, arguments);
}
Window_CampCommand.prototype = Object.create(Window_Command.prototype);
Window_CampCommand.prototype.constructor = Window_CampCommand;

Window_CampCommand.prototype.initialize = function(x, y) {
    Window_Command.prototype.initialize.call(this, x, y);
};

Window_CampCommand.prototype.windowWidth = function() {
    return 300;
};

Window_CampCommand.prototype.makeCommandList = function() {
    this.addCommand("Rest & Recover", 'rest');
    this.addCommand("Eat Provisions", 'eat');
    this.addCommand("Talk to Party",  'talk');
    this.addCommand("Spend Beats",    'level'); // Your stat distribution
    this.addCommand("Leave Camp",     'leave');
};