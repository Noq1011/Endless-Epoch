/*:
 * @target MV
 * @plugindesc (MV) Auto-Gray Exhausted Choices (Yanfly Compatible)
 * @author Endless Epoch (Noq)
 *
 * @help
 * ============================================================================
 * EXHAUSTIBLE CHOICES SYSTEM (v1.2 - Yanfly Safe)
 * ============================================================================
 * This script safely aliases drawing methods so Yanfly Message Core
 * doesn't crash or freeze the game. It also automatically strips text codes 
 * (like \c[4] or \i[12]) before saving the choice to memory.
 *
 * * HOW TO USE IN EVENTS:
 * Put this in a Script Call at the top of your Event (before the Loop):
 * * $gameSystem.clearExhaustedChoices();
 * * IMPORTANT: ALWAYS INCLUDE A "LEAVE" OR "NEVERMIND" CHOICE!
 * If all choices become grayed out and there is no active cancel option, 
 * the player will be permanently stuck (softlocked).
 * */

(function() {
    "use strict";

    // 1. Initialize the array in Game_System so it can persist or be cleared
    var _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._exhaustedChoices = [];
    };

    Game_System.prototype.clearExhaustedChoices = function() {
        this._exhaustedChoices = [];
    };

    // Strip text codes (Yanfly formats included) for clean memory storage
    Game_System.prototype.stripTextCodesForMemory = function(text) {
        if (!text) return "";
        // Removes standard \V[1], \C[2], \I[3], as well as \G, \> etc.
        return text.replace(/\\[A-Za-z]+\[.*?\]/gi, '').replace(/\\[A-Za-z]+/gi, '').trim();
    };

    Game_System.prototype.addExhaustedChoice = function(text) {
        if (!this._exhaustedChoices) this._exhaustedChoices = [];
        var cleanText = this.stripTextCodesForMemory(text);
        if (!this._exhaustedChoices.includes(cleanText)) {
            this._exhaustedChoices.push(cleanText);
        }
    };

    Game_System.prototype.isChoiceExhausted = function(text) {
        if (!this._exhaustedChoices) return false;
        var cleanText = this.stripTextCodesForMemory(text);
        return this._exhaustedChoices.includes(cleanText);
    };

    // 2. Modify the window that draws the choices
    var _Window_ChoiceList_makeCommandList = Window_ChoiceList.prototype.makeCommandList;
    Window_ChoiceList.prototype.makeCommandList = function() {
        _Window_ChoiceList_makeCommandList.call(this);
        
        for (var i = 0; i < this._list.length; i++) {
            var commandName = this._list[i].name;
            if ($gameSystem.isChoiceExhausted(commandName)) {
                this._list[i].enabled = false;
            }
        }
    };

    // 3. Hook into the selection to register the choice as exhausted
    var _Window_ChoiceList_callOkHandler = Window_ChoiceList.prototype.callOkHandler;
    Window_ChoiceList.prototype.callOkHandler = function() {
        var commandName = this.commandName(this.index());
        $gameSystem.addExhaustedChoice(commandName);
        _Window_ChoiceList_callOkHandler.call(this);
    };

    // 4. Safely Handle Opacity for Yanfly Message Core
    var _Window_ChoiceList_drawItem = Window_ChoiceList.prototype.drawItem;
    Window_ChoiceList.prototype.drawItem = function(index) {
        var isEnabled = this.isCommandEnabled(index);
        
        // Let the engine know we want to drop opacity for disabled items
        this.changePaintOpacity(isEnabled);
        
        // SAFELY call Yanfly's original draw logic instead of overwriting it
        _Window_ChoiceList_drawItem.call(this, index);
        
        // Immediately reset opacity so it doesn't bleed into your Custom Side Messages
        this.changePaintOpacity(true); 
    };

})();