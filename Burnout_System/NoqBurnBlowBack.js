/*:
 * @target MV
 * @plugindesc UBS Blowback v5 — Enhanced with debugging and failsafes
 * @author Noq (Enhanced by Assistant)
 * @help Load AFTER your NoqUnifiedBurnoutSystem.js.
 * 
 * CHANGELOG v5:
 * - Added extensive debug logging
 * - Added validation checks to prevent silent failures
 * - Enhanced overflow detection
 * - Better sprite handling
 */

(function(){
'use strict';

// Access the global UBS settings from your main script
var UBS = window.UBS || {};
var CFG = {
  STATE_ID: UBS.DEFAULT_BURNOUT_STATE_ID || 17, 
  ANIM_ID: 123,           // The explosion animation ID
  FLASH_FRAMES: 15,       // Quick white flash before the explosion
  HP_RATE: 0.15,          // Baseline: 20% of User's Max HP
  SKILL_RATIO: 0.50,      // Baseline: 50% of intended skill damage
  FALLBACK_WAIT: 120,      // Frames to wait for animation if sprite not found
  DEBUG: true             // Set to false to disable debug messages
};

function log(msg) {
    if (CFG.DEBUG) console.log("[UBS Blowback]", msg);
}

/* ============================================================
 * 1) INTERCEPT OVERFLOW
 * Hooks into the TP gain to trigger the blowback immediately.
 * ========================================================== */
var _gainTp = Game_Battler.prototype.gainTp;
Game_Battler.prototype.gainTp = function(v) {
    // Only check during an active UBS charge for a Verse/Energy skill
    if (v > 0) {
        var lim = (typeof this.tpLimit === 'function') ? this.tpLimit() : 100;
        var now = this.tp || 0;

        log("TP Gain: " + this.name() + " gaining " + v + " TP (current: " + now + "/" + lim + ")");
        
        // Check if we're in charging state
        if (!this._ubc_lockActive) {
            log("  -> NOT in charging state (_ubc_lockActive is false)");
        }
        if (!this._ubc_charge) {
            log("  -> NO charge skill set (_ubc_charge is null)");
        }

        // Detect overflow
        if (now < lim && (now + v) >= lim) {
            log("  -> OVERFLOW DETECTED!");
            
            if (this._ubc_lockActive && this._ubc_charge) {
                // Calculate how much we "over-charged" as a ratio
                var overflowAbs = (now + v) - lim;
                var overflowRate = overflowAbs / Math.max(1, lim);

                log("  -> Overflow: " + overflowAbs + " (" + (overflowRate * 100).toFixed(1) + "%)");
                log("  -> Triggering Blowback!");

                // Trigger the Blowback sequence immediately
                BattleManager._ubcStartImmediateBlowback(this, overflowRate);
                
                // Clamp current gain so we don't exceed the limit before the state hits
                v = lim - now;
            } else {
                log("  -> OVERFLOW BUT NO BLOWBACK (missing charge flags)");
                log("     _ubc_lockActive: " + this._ubc_lockActive);
                log("     _ubc_charge: " + this._ubc_charge);
            }
        }
    }
    _gainTp.call(this, v);
};

/* ============================================================
 * 2) THE BLOWBACK SEQUENCE (BattleManager Job)
 * Manages the "Job" that pauses the battle to show visuals.
 * ========================================================== */
BattleManager._ubcJob = null;

BattleManager._ubcStartImmediateBlowback = function(user, overflowRate) {
    var skill = $dataSkills[user._ubc_lockedSkillId];
    if (!skill) {
        log("ERROR: No skill found for ID " + user._ubc_lockedSkillId);
        return;
    }

    log("=== STARTING BLOWBACK ===");
    log("User: " + user.name());
    log("Skill: " + skill.name);
    log("Overflow: " + (overflowRate * 100).toFixed(1) + "%");

    // 1. Calculate Damage (Integer)
    var dmg = this._calculateBlowbackDmg(user, skill, overflowRate);
    log("Calculated Damage: " + dmg);

    // 2. Stop the Action Immediately
    this._interruptBattler(user);

    // 3. Queue the Visual Job
    this._ubcJob = {
        user: user,
        dmg: Math.max(1, Math.floor(dmg)),
        phase: 'flash',
        timer: CFG.FLASH_FRAMES,
        started: false
    };
    
    log("Job queued - entering flash phase");
};

BattleManager._calculateBlowbackDmg = function(user, skill, overflow) {
    var baseByHp = user.mhp * CFG.HP_RATE;
    var baseBySk = 0;
    
    try {
        var act = new Game_Action(user);
        act.setSkill(skill.id);
        // Estimate damage against the first available opponent
        var target = user.opponentsUnit().aliveMembers()[0] || user;
        baseBySk = act.makeDamageValue(target, false) * CFG.SKILL_RATIO;
    } catch(e) { 
        log("Skill damage calculation failed: " + e);
        baseBySk = 0;
    }

    var finalBase = Math.max(baseByHp, baseBySk);
    var finalDmg = finalBase * (1 + Math.min(overflow, 2.0));
    
    log("Damage Calc: HP-based=" + baseByHp + ", Skill-based=" + baseBySk + ", Final=" + finalDmg);
    
    return finalDmg;
};

BattleManager._interruptBattler = function(user) {
    log("Interrupting battler: " + user.name());
    try {
        user.clearActions();
        if (user.clearCasting) user.clearCasting(); // YEP Battle Engine compatibility
        user.requestMotion('damage');
        user.requestMotionRefresh();
        
        // Clean up UBS variables so it stops charging
        user._ubc_lockActive = false;
        user._ubc_charge = null;
        user._ubc_pendingBlowback = null;
        
        log("Battler interrupted successfully");
    } catch(e) {
        log("ERROR during interrupt: " + e);
    }
};

// Hook into the BattleManager update to run our custom sequence
var _BM_update = BattleManager.update;
BattleManager.update = function() {
    if (this._ubcJob && this._runUbcBlowbackJob()) return; // Pause battle if job is active
    _BM_update.call(this);
};

BattleManager._runUbcBlowbackJob = function() {
    var J = this._ubcJob;
    if (!J) return false;
    var b = J.user;

    switch(J.phase) {
        case 'flash':
            if (!J.started) {
                log("Flash phase started");
                b.requestEffect('whiten');
                J.started = true;
            }
            if (--J.timer <= 0) {
                log("Flash phase complete");
                J.phase = 'anim';
                J.started = false;
                J.timer = CFG.FALLBACK_WAIT;
            }
            return true;

        case 'anim':
            if (!J.started) {
                log("Animation phase started (ID: " + CFG.ANIM_ID + ")");
                b.startAnimation(CFG.ANIM_ID, false, 0);
                J.started = true;
            }
            // Wait for animation to finish
            var sp = this._findBattlerSprite(b);
            if (sp && sp.isAnimationPlaying()) return true;
            if (--J.timer > 0 && !sp) return true; // Fallback if no sprite

            log("Animation phase complete");
            J.phase = 'damage';
            J.started = false;
            return true;

        case 'damage':
            log("Applying damage: " + J.dmg);
            this._applyBlowbackDamage(b, J.dmg);
            J.phase = 'done';
            return true;

        case 'done':
            log("Blowback sequence complete");
            this._ubcJob = null;
            return false;
    }
};

BattleManager._applyBlowbackDamage = function(battler, amount) {
    battler.clearResult();
    battler.gainHp(-amount);
    battler.startDamagePopup();
    if (battler.isDead()) battler.performCollapse();
    log("Applied " + amount + " damage to " + battler.name() + " (HP: " + battler.hp + "/" + battler.mhp + ")");
};

BattleManager._findBattlerSprite = function(battler) {
    if (!this._spriteset) return null;
    var dict = (this._spriteset._actorSprites || []).concat(this._spriteset._enemySprites || []);
    for (var i = 0; i < dict.length; i++) {
        if (dict[i] && dict[i]._battler === battler) return dict[i];
    }
    return null;
};

log("Loaded v5 - Enhanced Edition");

})();