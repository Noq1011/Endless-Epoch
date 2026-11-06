/*:
 * @plugindesc v2.2 Verse Platform System (Hover Passability + Player Lock + Anti-Desync)
 * @author You
 *
 * @help
 * =========================
 * NOTE TAGS
 * =========================
 *
 * <VersePlatform:direction,distance,speed>
 * <ReversiblePlatform>
 * <PlatformWait:frames>
 * <VerseType:type>
 *
 * direction = up, down, left, right
 * distance  = tiles to travel
 * speed     = pixels per frame (1–6 recommended)
 *
 * Example:
 * <VersePlatform:down,5,1.5>
 * <ReversiblePlatform>
 * <PlatformWait:60>
 * <VerseType:fire>
 */

(function() {

  function parseNote(note, startX, startY) {
    const main = /<VersePlatform:(\w+),(\d+),([\d.]+)>/i.exec(note);
    if (!main) return null;

    const dir = main[1];
    const distance = Number(main[2]);
    const speed = Number(main[3]);

    const waitMatch = /<PlatformWait:(\d+)>/i.exec(note);
    const verseMatch = /<VerseType:(\w+)>/i.exec(note);

    let dx = 0, dy = 0;
    switch (dir) {
      case "down": dy = 1; break;
      case "up": dy = -1; break;
      case "right": dx = 1; break;
      case "left": dx = -1; break;
    }

    return {
      dx,
      dy,
      speed,
      distancePx: distance * $gameMap.tileWidth(),
      traveled: 0,
      forward: true,
      wait: waitMatch ? Number(waitMatch[1]) : 0,
      waitTimer: 0,
      reversible: /<ReversiblePlatform>/i.test(note),
      verseType: verseMatch ? verseMatch[1].toLowerCase() : null,
      startX: startX * $gameMap.tileWidth(),
      startY: startY * $gameMap.tileHeight()
    };
  }

  const _setup = Game_Event.prototype.setupPage;
  Game_Event.prototype.setupPage = function() {
    _setup.call(this);
    this._versePlat = parseNote(this.event().note, this.x, this.y);

    if (this._versePlat) {
      this._realX = this.x;
      this._realY = this.y;
      this.setThrough(true);
    }
  };

  const _update = Game_Event.prototype.update;
  Game_Event.prototype.update = function() {
    _update.call(this);

    const p = this._versePlat;
    if (!p) return;

    if (p.verseType) {
      if (!$gamePlayer._verseType || $gamePlayer._verseType !== p.verseType) return;
    }

    if (p.waitTimer > 0) {
      p.waitTimer--;
      return;
    }

    let px_dx = p.dx * p.speed;
    let px_dy = p.dy * p.speed;

    if (!p.forward) {
      px_dx *= -1;
      px_dy *= -1;
    }

    // CLAMP OVERSHOOT: Prevents platform from drifting off the exact grid
    let stepDist = Math.abs(px_dx) + Math.abs(px_dy);
    if (p.traveled + stepDist > p.distancePx) {
      let correction = (p.traveled + stepDist) - p.distancePx;
      let ratio = (stepDist - correction) / stepDist;
      px_dx *= ratio;
      px_dy *= ratio;
      stepDist = Math.abs(px_dx) + Math.abs(px_dy);
    }

    const prevX = this._realX;
    const prevY = this._realY;

    const moveX = px_dx / $gameMap.tileWidth();
    const moveY = px_dy / $gameMap.tileHeight();

    this._realX += moveX;
    this._realY += moveY;

    this._x = Math.round(this._realX);
    this._y = Math.round(this._realY);

    // CARRY PLAYER
    const px = $gamePlayer._realX;
    const py = $gamePlayer._realY;

    if (Math.abs(px - prevX) <= 0.6 && Math.abs(py - prevY) <= 0.6) {
      $gamePlayer._realX += moveX;
      $gamePlayer._realY += moveY;
      $gamePlayer._x = Math.round($gamePlayer._realX);
      $gamePlayer._y = Math.round($gamePlayer._realY);
    }

    // CARRY OTHER EVENTS
    $gameMap.events().forEach(e => {
      if (e === this) return;

      if (Math.abs(e._realX - prevX) <= 0.6 && Math.abs(e._realY - prevY) <= 0.6) {
        e._realX += moveX;
        e._realY += moveY;
        e._x = Math.round(e._realX);
        e._y = Math.round(e._realY);
      }
    });

    p.traveled += stepDist;

    if (p.traveled >= p.distancePx) {
      p.waitTimer = p.wait;

      if (p.reversible) {
        p.forward = !p.forward;
        p.traveled = 0;
      } else {
        this._versePlat = null;
      }
    }
  };

  // =========================================================================
  // RIDING LOGIC: Determine if a character is on a moving platform
  // =========================================================================
  Game_CharacterBase.prototype.isOnMovingPlatform = function() {
    return $gameMap.events().some(e => {
      if (e === this) return false;
      if (!e._versePlat) return false;
      if (e._versePlat.waitTimer > 0) return false; // Only lock if actively moving
      
      if (this === $gamePlayer && e._versePlat.verseType) {
        if (!this._verseType || this._verseType !== e._versePlat.verseType) return false;
      }
      
      return Math.abs(e._realX - this._realX) <= 0.6 && Math.abs(e._realY - this._realY) <= 0.6;
    });
  };

  // 1. Prevent the engine from pulling the player off the platform to snap to the grid
  const _Game_CharacterBase_updateMove = Game_CharacterBase.prototype.updateMove;
  Game_CharacterBase.prototype.updateMove = function() {
    if (this.isOnMovingPlatform()) return; 
    _Game_CharacterBase_updateMove.call(this);
  };

  // 2. Lock player directional input while being carried
  const _Game_Player_canMove = Game_Player.prototype.canMove;
  Game_Player.prototype.canMove = function() {
    if (this.isOnMovingPlatform()) return false;
    return _Game_Player_canMove.call(this);
  };

  // =========================================================================
  // PASSABILITY OVERRIDE
  // =========================================================================
  const _Game_CharacterBase_isMapPassable = Game_CharacterBase.prototype.isMapPassable;
  Game_CharacterBase.prototype.isMapPassable = function(x, y, d) {
    const x2 = $gameMap.roundXWithDirection(x, d);
    const y2 = $gameMap.roundYWithDirection(y, d);

    const isPlatformAt = (checkX, checkY) => {
      return $gameMap.events().some(e => {
        if (!e._versePlat) return false;
        if (this === $gamePlayer && e._versePlat.verseType) {
          if (!$gamePlayer._verseType || $gamePlayer._verseType !== e._versePlat.verseType) return false;
        }
        return Math.abs(e._realX - checkX) <= 0.6 && Math.abs(e._realY - checkY) <= 0.6;
      });
    };

    if (isPlatformAt(x2, y2)) return true;

    if (isPlatformAt(x, y)) {
      const d2 = this.reverseDir(d);
      return $gameMap.isPassable(x2, y2, d2); 
    }

    return _Game_CharacterBase_isMapPassable.call(this, x, y, d);
  };

})();