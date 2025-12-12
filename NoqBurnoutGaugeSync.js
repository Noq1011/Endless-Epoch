/*:
 * @target MV
 * @plugindesc (MV) Burnout ↔ Gauge Sync Bridge — feeds live UBS burnout + MP drain values to Canvas HUD
 * @author Noq
 * @help
 * Load BELOW: NoqBurnoutBattleSystemV2.js and Noq_BurnoutGauges_CanvasOnly.js
 */

(function(){
"use strict";

/* ------------------------------------------------------------
 * Hook UBS update to expose final burnout + drain to HUD
 * ------------------------------------------------------------ */

if (!window.UBS) window.UBS = {};

// expose a clean per-actor snapshot each frame
UBS._actorGaugeState = UBS._actorGaugeState || {};

// --- Patch Game_BattlerBase.refresh and UBS tick ---
var _Game_Battler_refresh = Game_Battler.prototype.refresh;
Game_Battler.prototype.refresh = function(){
  _Game_Battler_refresh.call(this);
  if (this.isActor && this.isActor()) {
    this._syncUBSState();
  }
};

Game_Battler.prototype._syncUBSState = function(){
  try {
    const id = this.actorId ? this.actorId() : (this._actorId || 0);
    const rate = (typeof this.burnoutRate === "function") ? this.burnoutRate() : (this.tp / (this.tpLimit ? this.tpLimit() : 100));
    const reserve = this._noqReserve || null;
    UBS._actorGaugeState[id] = {
      burnoutRate: rate,
      reserveSpent: reserve ? reserve.spent || 0 : 0,
      reserveCost: reserve ? reserve.cost || 0 : 0,
      reserveMode: reserve ? reserve.mode || "" : ""
    };
  } catch(e){}
};

// --- patch UBS tick update if present ---
if (typeof UBS.update === "function") {
  const _ubsupd = UBS.update;
  UBS.update = function(){
    _ubsupd.apply(this, arguments);
    try {
      const members = $gameParty.members();
      for (let i=0;i<members.length;i++) {
        const a = members[i];
        if (a && a._syncUBSState) a._syncUBSState();
      }
    } catch(e){}
  };
}

/* ------------------------------------------------------------
 * Hook the gauge HUD reader side
 * ------------------------------------------------------------ */
if (typeof burnoutRateOf === "function") {
  // wrap burnoutRateOf so it uses the synced UBS state
  const _oldBurnoutRateOf = burnoutRateOf;
  window.burnoutRateOf = function(b){
    try {
      const id = b && b.actorId ? b.actorId() : 0;
      const s = UBS._actorGaugeState[id];
      if (s && typeof s.burnoutRate === "number") return s.burnoutRate;
    } catch(e){}
    return _oldBurnoutRateOf(b);
  };
}

if (typeof Sprite_NoQGBlock !== "undefined") {
  // inject MP drain overlay based on UBS._actorGaugeState
  const _upd = Sprite_NoQGBlock.prototype.update;
  Sprite_NoQGBlock.prototype.update = function(){
    _upd.call(this);
    const a = this._actor;
    if (!a) return;
    const id = a.actorId ? a.actorId() : 0;
    const s = UBS._actorGaugeState[id];
    if (s && s.reserveMode === "gradual" && s.reserveCost > 0) {
      const frac = s.reserveSpent / s.reserveCost;
      const mpr = clamp(this._vmp / Math.max(1,a.mmp), 0, 1);
      this._gMP.setRate(clamp(mpr - frac * 0.25, 0, 1));
    }
  };
}

})();