(function() {

  // Move a single event one step toward the nearest tile with a given Region ID
  $gameMap.moveEventToRegion = function(eventId, regionId) {
    var ev = $gameMap.event(eventId);
    if (!ev) return;

    var map = $gameMap;
    var targetTile = null;
    var closestDist = Infinity;

    for (var y = 0; y < map.height(); y++) {
      for (var x = 0; x < map.width(); x++) {
        if (map.regionId(x, y) === regionId) {
          var d = Math.abs(ev.x - x) + Math.abs(ev.y - y);
          if (d < closestDist) {
            closestDist = d;
            targetTile = { x: x, y: y };
          }
        }
      }
    }

    if (!targetTile) return;

    // Check if already at shelter
    if (ev.x === targetTile.x && ev.y === targetTile.y) {
      ev._atShelter = true;
      return;
    } else {
      ev._atShelter = false;
    }

    // Move one step toward the target
    var dx = targetTile.x - ev.x;
    var dy = targetTile.y - ev.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      ev.moveStraight(dx > 0 ? 6 : 4); // Right or Left
    } else if (dy !== 0) {
      ev.moveStraight(dy > 0 ? 2 : 8); // Down or Up
    }
  };

  // Make all NPCs seek shelter during rain/storm
  $gameMap.npcsSeekShelter = function(regionId) {
    if (!$gameSystem._persistentWeather) return;
    var weather = $gameSystem._persistentWeather.type;
    if (!["rain", "storm"].includes(weather)) return;

    $gameMap.events().forEach(function(ev) {
      if (!ev || ev === $gamePlayer) return; // skip player
      if (ev.isThrough()) return;           // skip pass-through events

      $gameMap.moveEventToRegion(ev.eventId(), regionId);
      // Optional: play “wet” animation when moving, use a custom animation ID
      // if (!ev._atShelter) ev.requestAnimation(10);
    });
  };

})();