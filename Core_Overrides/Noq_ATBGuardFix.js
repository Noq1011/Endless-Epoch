/*:
 * @plugindesc v1.0 Endless Epoch - ATB Guard Fix
 * @author Tyson (Noq)
 *
 * @help
 * Removes the Guard state exactly when a character's ATB gauge 
 * fills and their next turn is ready.
 */

(function() {
    
    // CHANGE THIS NUMBER if your Guard state is not State #2 in your database
    var GUARD_STATE_ID = 2; 

    // Alias the core function that runs when a battler's turn is ready
    var alias_Game_Battler_makeActions = Game_Battler.prototype.makeActions;
    
    Game_Battler.prototype.makeActions = function() {
        // Run the original code to generate their turn actions
        alias_Game_Battler_makeActions.call(this);
        
        // Strip the Guard state immediately so they are vulnerable while choosing/acting
        this.removeState(GUARD_STATE_ID);
    };

})();