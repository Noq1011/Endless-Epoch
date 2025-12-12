// Completely disable gainSilentTp so no TP increases happen silently
Game_Battler.prototype.gainSilentTp = function(value) {
    console.log("%cBlocked gainSilentTp:", "color: red; font-weight: bold;", {
        battler: this.name(),
        attemptedGain: value,
        stack: new Error().stack
    });
    // Do nothing — prevents silent TP changes
};