/*:
 * @target MV
 * @plugindesc UBS Blowback v3 — replace cast with blowback if burnout tripped; integer damage; immediate visuals; overflow bonus.
 * @author Noq
 * @help Load AFTER your Unified Burnout System.
 */
(function(){
'use strict';

var UBS = window.UBS || (window.UBS = {});
var CFG = {
  STATE_ID: UBS.DEFAULT_BURNOUT_STATE_ID || 17, // same as UBS
  ANIM_ID: 153,           // explode animation
  FLASH_FRAMES: 18,       // quick flash before anim
  FALLBACK_ANIM_WAIT: 48, // frames to wait if sprite API missing
  HP_RATE: 0.20,          // 20% MaxHP baseline
  SKILL_RATIO: 0.50       // 50% of estimated skill damage baseline
};

/* -----------------------------
 * Utility
 * ---------------------------*/
function tpLimit(b){ try{ return b.tpLimit ? Math.max(1, b.tpLimit()) : 100; }catch(e){ return 100; } }
function clamp(n,a,b){ return Math.max(a, Math.min(b, n)); }
function i(n){ return (n|0); }

/* ============================================================
 * 1) Capture OVERFLOW exactly when TP would cross the limit.
 *    We clamp v to just reach the cap, and remember skill+overflow%.
 * ========================================================== */
var _gainTp = Game_Battler.prototype.gainTp;
Game_Battler.prototype.gainTp = function(v){
  if (v > 0 && this._ubc_lockActive && this._ubc_charge && this._ubc_lockedSkillId){
    var lim   = tpLimit(this);
    var now   = this.tp || 0;
    var cross = now < lim && (now + v) > lim;
    if (cross){
      // how far past the limit that tick would have carried us
      var overflowAbs  = (now + v) - lim;
      var overflowRate = Math.max(0, overflowAbs / Math.max(1, lim)); // e.g. 0.15

      // Flag to replace cast later (at useItem)
      this._ubc_pendingBlowback = {
        skillId: this._ubc_lockedSkillId,
        overflowRate: overflowRate
      };

      // only add up to the cap this tick
      v = lim - now;
    }
  }
  _gainTp.call(this, v);
};

/* ============================================================
 * 2) Replace cast with Blowback right at useItem().
 *    This makes it look immediate (no “next turn” delay).
 * ========================================================== */
var _useItem = Game_Battler.prototype.useItem;
Game_Battler.prototype.useItem = function(item){
  if (this._ubc_pendingBlowback && item && item.id === this._ubc_pendingBlowback.skillId){
    BattleManager._ubcStartImmediateBlowback(this, item, this._ubc_pendingBlowback.overflowRate || 0);
    // consume & clear; do not cast original skill
    this._ubc_pendingBlowback = null;
    return;
  }
  _useItem.call(this, item);
};

/* ============================================================
 * 3) BattleManager job: pause battle, end chant pose, flash,
 *    play animation, apply integer damage popup, resume.
 * ========================================================== */
BattleManager._ubcJob = null;

BattleManager._ubcStartImmediateBlowback = function(user, skill, overflowRate){
  // Snap out of chant NOW (looks immediate)
  try {
    if (user.clearCasting) user.clearCasting();          // YEP casting helper if present
    if (user.requestMotion) user.requestMotion('damage');
    if (user.requestMotionRefresh) user.requestMotionRefresh();
  } catch(e){}

  // Make sure UBS won't continue charging this skill
  user._ubc_lockActive      = false;
  user._ubc_lockedSkillId   = null;
  user._ubc_lockedMpCost    = null;
  user._ubc_charge          = null;
  user._ubc_paidMpForLocked = false;

  // Compute base damage (integer, never minuscule)
  var baseByHp = Math.floor(user.mhp * CFG.HP_RATE);
  var baseBySk = 0;
  try {
    var act = new Game_Action(user);
    act.setSkill(skill.id);
    // pick a legit target to estimate skill output; fallback to self
    var oppUnit = user.opponentsUnit && user.opponentsUnit();
    var opp = (oppUnit && oppUnit.aliveMembers && oppUnit.aliveMembers()[0]) || user;
    var raw = Math.max(0, act.makeDamageValue(opp, false)); // estimate
    baseBySk = Math.floor(raw * CFG.SKILL_RATIO);
  } catch(e){ baseBySk = 0; }

  var base = Math.max(baseByHp, baseBySk);
  // overflowRate adds extra multiplier; clamp to sane bounds
  var scaled = Math.max(1, Math.round(base * (1 + clamp(overflowRate, 0, 3))));

  // Build the “job” that will run inside BattleManager.update()
  this._ubcJob = {
    user: user,
    dmg: scaled,
    phase: 'flash',
    wait: CFG.FLASH_FRAMES,
    started: false,
    animWait: 0
  };
};

BattleManager._ubcFindSprite = function(b){
  try{
    var ss = this._spriteset;
    if (!ss) return null;
    var list = [];
    if (ss.battlerSprites) list = ss.battlerSprites();
    else if (ss._battleField && ss._battleField.children)
      list = ss._battleField.children.filter(function(c){ return c._battler; });
    for (var i=0;i<list.length;i++) if (list[i]._battler === b) return list[i];
  }catch(e){}
  return null;
};

var _BM_update = BattleManager.update;
BattleManager.update = function(){
  if (this._ubcJob && this._ubcRunJob()) return; // keep battle paused
  _BM_update.call(this);
};

BattleManager._ubcRunJob = function(){
  var J = this._ubcJob;
  if (!J) return false;
  var b = J.user;
  if (!b || b.isDead()){ this._ubcJob = null; return false; }

  switch(J.phase){
    case 'flash':
      if (!J.started){
        try { b.requestEffect && b.requestEffect('whiten'); } catch(e){}
        try { b.requestMotion && b.requestMotion('damage'); } catch(e){}
        try { b.requestMotionRefresh && b.requestMotionRefresh(); } catch(e){}
        J.started = true;
      }
      if (--J.wait <= 0){ J.phase = 'anim'; J.started = false; }
      return true;

    case 'anim':
      if (!J.started){
        b.startAnimation(CFG.ANIM_ID, false, 0);
        J.started = true;
        J.animWait = CFG.FALLBACK_ANIM_WAIT;
      }
      var sp = this._ubcFindSprite(b);
      if (sp && typeof sp.isAnimationPlaying === 'function'){
        if (sp.isAnimationPlaying()) return true;
      } else if (--J.animWait > 0) return true;

      J.phase = 'damage'; J.started = false;
      return true;

    case 'damage': {
      var dmg = Math.max(1, i(J.dmg));
      // Set result first, then apply and popup — forces integer popup
      b.clearResult && b.clearResult();
      b._result = b._result || new Game_ActionResult();
      b._result.used       = true;
      b._result.success    = true;
      b._result.hpAffected = true;
      b._result.hpDamage   = dmg;

      b.gainHp(-dmg);
      try { b.startDamagePopup(); } catch(e){}
      try { b.clearResult && b.clearResult(); } catch(e){}

      // Action is finished; do not re-run the skill
      try { b.clearActions && b.clearActions(); } catch(e){}

      J.phase = 'done';
      return true;
    }

    case 'done':
      this._ubcJob = null;
      return false;
  }
  return false;
};

})();