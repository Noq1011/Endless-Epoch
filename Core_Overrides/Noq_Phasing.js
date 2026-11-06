/*:
 * @plugindesc Custom Collision Override for patrolling events.
 * @author Tyson (Noq)
 *
 * @help
 * Place the tag <Phasing> inside the Note box of an Event.
 * This event will now walk straight through other NPCs and walls 
 * without losing its step timing, but the player can still interact 
 * with it normally.
 */

(function() {

    // 1. Bypass NPC / Event Collision
    var alias_Game_Event_isCollidedWithEvents = Game_Event.prototype.isCollidedWithEvents;
    Game_Event.prototype.isCollidedWithEvents = function(x, y) {
        if (this.event().note.match(/<Phasing>/i)) {
            return false; // Ignores all other events in the way
        }
        return alias_Game_Event_isCollidedWithEvents.call(this, x, y);
    };

    // 2. Bypass Wall / Environment Collision
    var alias_Game_Event_isMapPassable = Game_Event.prototype.isMapPassable;
    Game_Event.prototype.isMapPassable = function(x, y, d) {
        if (this.event().note.match(/<Phasing>/i)) {
            return true; // Ignores unpassable map tiles
        }
        return alias_Game_Event_isMapPassable.call(this, x, y, d);
    };

})();