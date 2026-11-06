//=============================================================================
// BubbleShield.js
//=============================================================================

/*:
 * @plugindesc One-Hit Bubble Shield - Blocks 1 attack completely, then breaks
 * @author Your Name
 *
 * @help
 * This plugin creates a bubble shield state that:
 * - Blocks ALL damage from the first attack it receives
 * - Automatically removes itself after blocking
 * - Works for physical, magical, and certain hit skills
 * 
 * State Setup:
 * 1. Create a state called "Bubble Shield" in your database
 * 2. Add this note tag: <BubbleShield>
 * 3. Set Auto-Removal to "None" (the script handles removal)
 * 4. Add Traits to make it visually clear (optional glow/animation)
 * 
 * The shield will display a visual popup when it blocks and breaks.
 */

(function() {

    //==========================================================================
    // Game_Action - Damage Calculation Intercept
    //==========================================================================
    
    var _Game_Action_makeDamageValue = Game_Action.prototype.makeDamageValue;
    
    Game_Action.prototype.makeDamageValue = function(target, critical) {
        // Damage Types: 1 (HP Dmg), 2 (MP Dmg), 5 (HP Drain), 6 (MP Drain)
        // This ensures Heals (3, 4) pass right through the shield!
        var isHarmful = [1, 2, 5, 6].indexOf(this.item().damage.type) >= 0;

        if (isHarmful) {
            var bubbleState = this.findBubbleShieldState(target);
            if (bubbleState) {
                this._bubbleBlocked = true;
                this._bubbleStateId = bubbleState.id;
                return 0;
            }
        }
        
        return _Game_Action_makeDamageValue.call(this, target, critical);
    };
    
    //==========================================================================
    // Helper: Find if target has any Bubble Shield state
    //==========================================================================
    
    Game_Action.prototype.findBubbleShieldState = function(target) {
        if (!target) return null;
        
        var states = target.states();
        for (var i = 0; i < states.length; i++) {
            if (states[i].meta.BubbleShield) {
                return states[i];
            }
        }
        return null;
    };
    
    //==========================================================================
    // Game_Action - Apply the Hit (Remove Shield After Blocking)
    //==========================================================================
    
    var _Game_Action_apply = Game_Action.prototype.apply;
    
    Game_Action.prototype.apply = function(target) {
        _Game_Action_apply.call(this, target);
        
        if (this._bubbleBlocked && this._bubbleStateId) {
            target.removeState(this._bubbleStateId);
            
            if (target.startDamagePopup) {
                target.startDamagePopup();
            }
            
            if ($gameTemp.isPlaytest() || window.BattleFeedPush) {
                var msg = target.name() + "'s Bubble Shield shattered!";
                if (typeof BattleFeedPush === "function") {
                    BattleFeedPush({ text: msg, kind: "system" });
                } else {
                    console.log(msg);
                }
            }
            
            AudioManager.playSe({
                name: 'Break',
                volume: 90,
                pitch: 100,
                pan: 0
            });
            
            this._bubbleBlocked = false;
            this._bubbleStateId = null;
        }
    };
    
//==========================================================================
    // Battle Log - Custom Message When Shield Blocks
    //==========================================================================
    
    var _Window_BattleLog_displayActionResults = Window_BattleLog.prototype.displayActionResults;
    
    Window_BattleLog.prototype.displayActionResults = function(subject, target) {
        // SAFETY CHECK: Grab the action first, and make sure it exists!
        var action = subject.currentAction();
        
        if (action && action._bubbleBlocked) {
            this.push('addText', target.name() + "'s shield blocked the attack!");
        }
        
        _Window_BattleLog_displayActionResults.call(this, subject, target);
    };

})();