var _Game_Event_list = Game_Event.prototype.list;
Game_Event.prototype.list = function() {
    if (!this.page()) return [];
    return _Game_Event_list.call(this);
};