/*:
 * @plugindesc v1.4 - Enemies pick ONE Verse, use matching skills, recolor by Verse (with pulse and fallback AI). 
 * @author Tyson
 */

(() => {

  const VerseColorTable = {
    Lightning: "#9EE5FF",
    Fire: "#FF5C33",
    Water: "#33A8FF",
    Earth: "#D4A96A",
    Wind: "#7AFFA2",
    Air: "#7AFFA2",       // alias for Wind
    Shadow: "#A55CFF",
    Light: "#FFF1B0",
    Ice: "#AEE8FF",
  };

  const PULSE_SPEED = 0.03;
  const PULSE_INTENSITY = 0.25;

  function parseVerses(note) {
    const verses = [];
    const notedata = note.split(/[\r\n]+/);
    for (const line of notedata) {
      const match = line.match(/<Verse:\s*(.+)>/i);
      if (match) verses.push(match[1].trim());
    }
    return verses;
  }

  function parseVerseColor(note) {
    const match = note.match(/<VerseColor:\s*(#[0-9A-F]{6})>/i);
    return match ? match[1] : null;
  }

  function hasVersePulse(note) {
    return /<VersePulse>/i.test(note);
  }

  // --------------------------------------------------------------
  // Enemy setup
  // --------------------------------------------------------------
  const _Game_Enemy_setup = Game_Enemy.prototype.setup;
  Game_Enemy.prototype.setup = function(enemyId, x, y) {
    _Game_Enemy_setup.call(this, enemyId, x, y);

    const tags = parseVerses(this.enemy().note);
    if (tags.length > 0) {
      const pick = Math.floor(Math.random() * tags.length);
      this._verseChoice = tags[pick];
    } else {
      this._verseChoice = null;
    }

    const override = parseVerseColor(this.enemy().note);
    this._verseColor = override || (this._verseChoice ? VerseColorTable[this._verseChoice] : null);
    this._versePulse = hasVersePulse(this.enemy().note);
  };

  // --------------------------------------------------------------
  // Restrict skills by Verse, with fallback
  // --------------------------------------------------------------
  const _Game_Enemy_meetsSkillConditions = Game_Enemy.prototype.meetsSkillConditions;
  Game_Enemy.prototype.meetsSkillConditions = function(skill) {
    if (!_Game_Enemy_meetsSkillConditions.call(this, skill)) return false;
    if (!this._verseChoice) return true;
    if (/<Universal>/i.test(skill.note)) return true;

    const skillVerses = parseVerses(skill.note);
    if (skillVerses.length === 0) return false;
    return skillVerses.includes(this._verseChoice);
  };

  // Ensure fallback so enemies always have at least Attack
  const _Game_Enemy_selectAllActions = Game_Enemy.prototype.selectAllActions;
  Game_Enemy.prototype.selectAllActions = function(actionList, ratingZero) {
    _Game_Enemy_selectAllActions.call(this, actionList, ratingZero);
    // if no action chosen, fallback to Attack
    if (this.actions().every(a => !a.item())) {
      const attack = $dataSkills[this.attackSkillId()];
      this.forceAction(attack.id, this.randomTarget());
    }
  };

  const _Game_Enemy_name = Game_Enemy.prototype.name;
  Game_Enemy.prototype.name = function() {
    let n = _Game_Enemy_name.call(this);
    if (this._verseChoice) n += ` (${this._verseChoice})`;
    return n;
  };

  // --------------------------------------------------------------
  // Sprite recolor and pulse
  // --------------------------------------------------------------
  const _Sprite_Enemy_update = Sprite_Enemy.prototype.update;
  Sprite_Enemy.prototype.update = function() {
    _Sprite_Enemy_update.call(this);
    this.updateVersePulse();
  };

  const _Sprite_Enemy_updateBitmap = Sprite_Enemy.prototype.updateBitmap;
  Sprite_Enemy.prototype.updateBitmap = function() {
    _Sprite_Enemy_updateBitmap.call(this);
    if (this._enemy && this._enemy._verseColor) {
      this._baseVerseColor = this._enemy._verseColor;
      this._pulseEnabled = this._enemy._versePulse;
      this._pulseFrame = 0;

      // wait for bitmap to load before applying tint
      this.bitmap.addLoadListener(() => {
        this.applyVerseColor(this._baseVerseColor);
      });
    }
  };

  Sprite_Enemy.prototype.applyVerseColor = function(hex) {
    if (!hex || !this.bitmap || !this.bitmap.isReady()) return;
    const bigint = parseInt(hex.replace('#', ''), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;

    this._baseTone = [
      (r - 128) * 0.5,
      (g - 128) * 0.5,
      (b - 128) * 0.5,
      0
    ];
    this.setColorTone(this._baseTone);
  };

  Sprite_Enemy.prototype.updateVersePulse = function() {
    if (!this._pulseEnabled || !this._baseTone) return;
    this._pulseFrame += PULSE_SPEED;
    const factor = (Math.sin(this._pulseFrame) * 0.5 + 0.5) * PULSE_INTENSITY;
    const tone = [
      this._baseTone[0] * factor,
      this._baseTone[1] * factor,
      this._baseTone[2] * factor,
      0
    ];
    this.setColorTone(tone);
  };

})();