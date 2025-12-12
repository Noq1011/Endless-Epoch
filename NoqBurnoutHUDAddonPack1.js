/*:
 * @target MV
 * @plugindesc (MV) NoqBurnoutHUD v2.0 — ATB Enhanced: Target Info (in-window) + Harmony + Gradual/Select MP Reservation + Reserved-Cast Immunity
 * @author Noq
 * @help
 * Requires (load above this):
 *  - YEP_CoreEngine
 *  - YEP_BattleEngineCore
 *  - YEP_X_BattleSysATB
 *  - YEP_SkillCore (optional but supported)
 *  - Any YEP Element/Buffs/Damage cores
 *
 * Place this plugin BELOW all YEP plugins.
 *
 * Features:
 *  • Hides Actor Command while selecting a target.
 *  • Expands the enemy target window IN-WINDOW with:
 *      - Buff/Debuff summary (green ↑, red ↓)
 *      - State icons
 *      - Harmony chain (reads target._harmonyQueue: [{id, actorId, frame}, ...])
 *  • ATB casting (stypeId === 1):
 *      - Gradual MP drain tied to ATB charge (mode: Gradual)
 *      - OR Deduct full MP at selection (mode: Select)
 *      - Reserved-cast immunity: already-selected spell won’t fail for lack of MP
 *
 * Parameters let you choose reservation behavior and visual tweaks.
 *
 * @param ReservationMode
 * @text MP Reservation Mode
 * @type select
 * @option Gradual (drain during cast)
 * @value gradual
 * @option Select (deduct on selection)
 * @value select
 * @default gradual
 *
 * @param ShowTargetOverlay
 * @text Show In-Window Target Info
 * @type boolean
 * @on Show
 * @off Hide
 * @default true
 *
 * @param TargetOverlayFontSize
 * @text Target Overlay Font Size
 * @type number
 * @min 12
 * @max 28
 * @default 18
 *
 * @param HarmonyColorIndex
 * @text Harmony Text Color Index
 * @type number
 * @min 0
 * @max 31
 * @default 14
 *
 * @param BuffGreenColorIndex
 * @text Buff ↑ Color Index
 * @type number
 * @min 0
 * @max 31
 * @default 24
 *
 * @param DebuffRedColorIndex
 * @text Debuff ↓ Color Index
 * @type number
 * @min 0
 * @max 31
 * @default 10
 */

(function(){
"use strict";

/* ================================
   Parameters
   ================================ */
var NOQ = NOQ || {};
NOQ.Params = NOQ.Params || {};

var params = PluginManager.parameters(document.currentScript.src.split('/').pop().replace(/%20/g,' '));
function p(name, def){ var v = params && params[name]; return (v==null||v==="")? def : v; }

NOQ.Params.reservationMode   = String(p('ReservationMode','gradual')).toLowerCase(); // 'gradual' | 'select'
NOQ.Params.showTargetOverlay = p('ShowTargetOverlay','true') === 'true';
NOQ.Params.targetFontSize    = Number(p('TargetOverlayFontSize', 18) || 18);
NOQ.Params.colHarmony        = Number(p('HarmonyColorIndex', 14) || 14);
NOQ.Params.colBuffGreen      = Number(p('BuffGreenColorIndex', 24) || 24);
NOQ.Params.colDebuffRed      = Number(p('DebuffRedColorIndex', 10) || 10);

/* ================================
   Safety shims for ATB helpers
   ================================ */
function battlerIsCharging(b){
  try { return b && b.isATBCharging && b.isATBCharging(); } catch(e){ return false; }
}
function battlerChargeRate(b){
  try { var r = b && b.atbChargeRate && b.atbChargeRate(); return Math.max(0, Math.min(1, r||0)); }
  catch(e){ return 0; }
}

/* ================================
   1) Hide command window during target selection
   ================================ */
var _Scene_Battle_selectEnemySelection = Scene_Battle.prototype.selectEnemySelection;
Scene_Battle.prototype.selectEnemySelection = function(){
  _Scene_Battle_selectEnemySelection.call(this);
  if (this._actorCommandWindow) this._actorCommandWindow.hide();
};

var _Scene_Battle_onEnemyOk = Scene_Battle.prototype.onEnemyOk;
Scene_Battle.prototype.onEnemyOk = function(){
  if (this._actorCommandWindow) this._actorCommandWindow.show();
  _Scene_Battle_onEnemyOk.call(this);
};

var _Scene_Battle_onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
Scene_Battle.prototype.onEnemyCancel = function(){
  if (this._actorCommandWindow) this._actorCommandWindow.show();
  _Scene_Battle_onEnemyCancel.call(this);
};

/* ================================
   2) IN-WINDOW Target Status Overlay (Enemy)
   ================================ */
if (NOQ.Params.showTargetOverlay) {

  var _Window_BattleEnemy_update = Window_BattleEnemy.prototype.update;
  Window_BattleEnemy.prototype.update = function(){
    _Window_BattleEnemy_update.call(this);
    if (this.active && this._index >= 0 && this.visible) {
      this._noqDrawExtraInfo();
    }
  };

  Window_BattleEnemy.prototype._noqDrawExtraInfo = function(){
    var enemy = this._enemies[this._index];
    if (!enemy) return;

    // Base rect for current item
    var rect = this.itemRectForText ? this.itemRectForText(this._index) : new Rectangle(0,0,this.contents.width, this.lineHeight());
    var pad = 6;
    var y = rect.y + this.lineHeight() + pad;

    // Clear just the lower chunk so we don't flicker name/selection
    var clearY = y - pad;
    var clearH = this.contents.height - clearY;
    this.contents.clearRect(0, clearY, this.contents.width, clearH);

    // Font + color baseline
    var prevSize = this.contents.fontSize;
    this.contents.fontSize = NOQ.Params.targetFontSize;
    this.resetTextColor();

    // Buff/Debuff summary
    var summary = this._noqMakeBuffSummary(enemy);
    this.drawText(summary, rect.x + 6, y, rect.width);
    y += this.lineHeight();

    // State icons (inline)
    this._noqDrawStateIcons(enemy, rect.x + 6, y);
    y += Window_Base._iconHeight + 4;

    // Harmony line
    var harmony = this._noqMakeHarmonyLine(enemy);
    if (harmony) {
      this.changeTextColor(this.textColor(NOQ.Params.colHarmony));
      this.drawText(harmony, rect.x + 6, y, rect.width);
      this.resetTextColor();
    }

    // restore
    this.contents.fontSize = prevSize;
  };

  Window_BattleEnemy.prototype._noqMakeBuffSummary = function(enemy){
    var names  = ["Verse","Atk","Def","M.Def","Agi","Reson."];
    var params = [8,2,3,4,6,7]; // m.atk, atk, def, m.def, agi, luk
    var out = "";
    for (var i=0;i<params.length;i++){
      var v = enemy._buffs ? enemy._buffs[params[i]] : 0;
      if (v > 0) {
        this.changeTextColor(this.textColor(NOQ.Params.colBuffGreen));
        out += names[i]+"↑  ";
      } else if (v < 0) {
        this.changeTextColor(this.textColor(NOQ.Params.colDebuffRed));
        out += names[i]+"↓  ";
      }
    }
    this.resetTextColor();
    return out || "No Buffs/Debuffs";
  };

  Window_BattleEnemy.prototype._noqDrawStateIcons = function(enemy, x, y){
    var icons = enemy.allIcons ? enemy.allIcons() : [];
    if (!icons.length) return;
    var iw = Window_Base._iconWidth;
    for (var i=0;i<icons.length;i++){
      this.drawIcon(icons[i], x + i*(iw+2), y);
    }
  };

  Window_BattleEnemy.prototype._noqMakeHarmonyLine = function(enemy){
    if (!enemy._harmonyQueue || enemy._harmonyQueue.length === 0) return "";
    var q = enemy._harmonyQueue.slice(-3);
    var names = [];
    for (var i=0;i<q.length;i++){
      var s = $dataSkills[q[i].id];
      names.push(s ? s.name : "???");
    }
    return "Harmony: " + names.join(" + ");
  };
}

/* ================================
   3) MP Reservation + Gradual Drain for ATB casting (stypeId === 1)
   ================================
   Design:
   - Mode "select": deduct full MP instantly on selection; skip paying later.
   - Mode "gradual": do not deduct on selection; during ATB charge, drain proportionally;
                     at resolve, deduct any remainder (and allow negative clamp to 0), then clear.
   - In both modes: canPaySkillCost returns true for the reserved skill (cast immunity).
   ================================ */

// Helper: get current action's skill (safe)
function noqCurrentSkill(actor){
  try {
    var a = actor && actor.currentAction && actor.currentAction();
    var item = a && a.item && a.item();
    return item && DataManager.isSkill(item) ? item : null;
  } catch(e){ return null; }
}

// Mark reservation at skill selection
var _Scene_Battle_onSkillOk_NOQ = Scene_Battle.prototype.onSkillOk;
Scene_Battle.prototype.onSkillOk = function(){
  var skill = this._skillWindow && this._skillWindow.item ? this._skillWindow.item() : null;
  var actor = BattleManager.actor && BattleManager.actor();
  if (skill && actor && skill.stypeId === 1) {
    // Initialize reservation record
    actor._noqReserve = actor._noqReserve || {};
    actor._noqReserve.skillId = skill.id;
    actor._noqReserve.cost    = Number(skill.mpCost || skill.mp || 0);
    actor._noqReserve.spent   = 0;
    actor._noqReserve.mode    = NOQ.Params.reservationMode; // 'gradual'|'select'

    if (actor._noqReserve.mode === 'select') {
      // Pay immediately, and skip paying later
      var c = Math.max(0, actor._noqReserve.cost|0);
      if (c > 0) actor.gainMp(-c);
      actor._noqReserve.spent = c;
    }
  }
  _Scene_Battle_onSkillOk_NOQ.call(this);
};

// Optional: clear reservation on skill cancel (refund only in select mode)
var _Scene_Battle_onSkillCancel_NOQ = Scene_Battle.prototype.onSkillCancel;
Scene_Battle.prototype.onSkillCancel = function(){
  var actor = BattleManager.actor && BattleManager.actor();
  if (actor && actor._noqReserve && actor._noqReserve.skillId) {
    if (actor._noqReserve.mode === 'select' && actor._noqReserve.spent > 0) {
      actor.gainMp(actor._noqReserve.spent); // refund
    }
    actor._noqReserve = null;
  }
  _Scene_Battle_onSkillCancel_NOQ.call(this);
};

// Reserved-cast immunity
var _Game_BattlerBase_canPaySkillCost_NOQ = Game_BattlerBase.prototype.canPaySkillCost;
Game_BattlerBase.prototype.canPaySkillCost = function(skill){
  try {
    if (this._noqReserve && this._noqReserve.skillId === (skill && skill.id)) {
      return true; // already reserved, allow even if MP < cost later
    }
  } catch(e){}
  return _Game_BattlerBase_canPaySkillCost_NOQ.call(this, skill);
};

// Pay at resolve (skip for select-mode; complete remainder for gradual)
var _Game_Battler_paySkillCost_NOQ = Game_Battler.prototype.paySkillCost;
Game_Battler.prototype.paySkillCost = function(skill){
  if (this._noqReserve && this._noqReserve.skillId === (skill && skill.id)) {
    if (this._noqReserve.mode === 'gradual') {
      var cost = Math.max(0, this._noqReserve.cost|0);
      var spent = Math.max(0, this._noqReserve.spent|0);
      var rem = Math.max(0, cost - spent);
      if (rem > 0) this.gainMp(-rem); // finish any remainder
    }
    // clear reservation and fall through to base (which will also deduct cost) -> prevent double pay
    var saved = this._noqReserve;
    this._noqReserve = null;
    // Prevent double-charge: don't call base (we already handled payment in both modes)
    return;
  }
  _Game_Battler_paySkillCost_NOQ.call(this, skill);
};

// Gradual drain tick while ATB charging (stypeId 1)
var _Sprite_Battler_update_NOQ = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function(){
  _Sprite_Battler_update_NOQ.call(this);

  var b = this._battler;
  if (!b || !b.isActor || !b.isActor()) return;
  if (!b._noqReserve || b._noqReserve.mode !== 'gradual') return;

  // Only drain during active ATB charge, same skill
  var sk = noqCurrentSkill(b);
  if (!battlerIsCharging(b) || !sk || sk.id !== b._noqReserve.skillId || sk.stypeId !== 1) return;

  var cost = Math.max(0, b._noqReserve.cost|0);
  var rate = battlerChargeRate(b); // 0..1 of charge
  var desiredSpent = Math.floor(cost * rate);
  var delta = desiredSpent - Math.max(0, b._noqReserve.spent|0);
  if (delta > 0) {
    // Try to drain from MP; if not enough, still mark as spent (visual + immunity already granted)
    var drain = Math.min(delta, Math.max(0, b.mp));
    if (drain > 0) b.gainMp(-drain);
    // Count the full delta as spent so UI reflects charge progress, even if MP got drained by enemies
    b._noqReserve.spent += delta;
    if (b._noqReserve.spent > cost) b._noqReserve.spent = cost;
  }
};

// Clear reservation on action end (safety)
var _Game_Battler_onAllActionsEnd_NOQ = Game_Battler.prototype.onAllActionsEnd;
Game_Battler.prototype.onAllActionsEnd = function(){
  _Game_Battler_onAllActionsEnd_NOQ.call(this);
  if (this._noqReserve) this._noqReserve = null;
};

})();
