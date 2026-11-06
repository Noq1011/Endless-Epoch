/*:
 * @target MV
 * @plugindesc Noq Skill List UI — clean tier badge, EN cost, progress bar for menu skill list
 * @author Noq
 * @help
 * Load BELOW NoqSkillEvolution.js.
 *
 * Replaces section 4 (THE UI GAUGE) from NoqSkillEvolution.js.
 * Delete or comment out the drawSkillEvoGauge and drawItem override
 * in that file to avoid conflicts.
 *
 * Each skill row shows:
 *   [icon] Skill Name      [T2 ●●○]  [EN 45]
 *   ████████░░░░░░░░░░░░░░░  (progress bar, bottom of row)
 *
 * Skill types without evolution data show just name + EN cost cleanly.
 */

(function(){
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (ES5, safe to call before battle starts)
// ─────────────────────────────────────────────────────────────────────────────

function getSkillLevel(actor, skillId){
  if (!actor || !actor._skillUsage) return 1;
  var u = actor._skillUsage[skillId];
  return u ? Math.max(1, u.level||1) : 1;
}

// Returns { level, maxLevel, atMax, progress, total } or null
function getSkillProgress(actor, skill){
  if (!skill || !skill._evolutionData || !skill._evolutionData.length) return null;
  var evo      = skill._evolutionData;
  var maxLevel = evo.length + 1;
  var usage    = (actor && actor._skillUsage) ? actor._skillUsage[skill.id] : null;
  var count    = usage ? (usage.count||0) : 0;
  var level    = usage ? Math.max(1, usage.level||1) : 1;

  if (level >= maxLevel) return { level:level, maxLevel:maxLevel, atMax:true, progress:1, total:1 };

  var prevThresh = 0;
  var nextThresh = evo[0].uses;
  for (var i = 0; i < evo.length; i++){
    if (count >= evo[i].uses){
      prevThresh = evo[i].uses;
      nextThresh  = (i+1 < evo.length) ? evo[i+1].uses : evo[i].uses;
    }
  }
  return {
    level    : level,
    maxLevel : maxLevel,
    atMax    : false,
    progress : Math.max(0, count - prevThresh),
    total    : Math.max(1, nextThresh - prevThresh)
  };
}

// EN cost with all modifiers (burnout tier scaling + evolution cost reductions).
// Mirrors the battle description panel logic exactly.
function getEN(actor, skill){
  if (!actor || !skill) return Math.round((skill && (skill.mpCost||skill.mp)) || 0);
  var cost = 0, saved = null, cleared = false;
  try{
    if (actor._noqReserve != null){ saved = actor._noqReserve; actor._noqReserve = null; cleared = true; }
    if (typeof actor.skillMpCost === 'function'){
      var raw = actor.skillMpCost(skill);
      cost = Math.round(isFinite(raw) ? raw : (skill.mpCost||skill.mp||0));
    } else {
      cost = Math.round(skill.mpCost||skill.mp||0);
    }
  }catch(e){
    cost = Math.round(skill.mpCost||skill.mp||0);
  }finally{
    if (cleared) actor._noqReserve = saved;
  }
  return cost;
}

// ─────────────────────────────────────────────────────────────────────────────
// Window_SkillList.prototype.drawItem — full replacement
// ─────────────────────────────────────────────────────────────────────────────
Window_SkillList.prototype.drawItem = function(index){
  var skill = this._data[index];
  if (!skill) return;

  var rect   = this.itemRect(index);
  var actor  = this._actor;
  var hasEvo = !!(skill._evolutionData && skill._evolutionData.length);

  this.changePaintOpacity(this.isEnabled(skill));
  this.resetFontSettings();

  var pad     = this.textPadding();
  var iconSz  = Window_Base._iconWidth;  // 32
  var iconGap = 4;
  var nameX   = rect.x + pad + iconSz + iconGap;
  var barH    = hasEvo ? 4 : 0;  // thin progress strip at bottom of row
  var rowMidY = rect.y + Math.floor((rect.height - barH) / 2);

  // ── Icon ────────────────────────────────────────────────────────────────
  this.drawIcon(skill.iconIndex, rect.x + pad, rowMidY - Math.floor(iconSz/2));

  // ── Tier badge (right-aligned, before EN cost) ───────────────────────────
  var tierW = 0;
  if (hasEvo){
    var level    = getSkillLevel(actor, skill.id);
    var maxLevel = skill._evolutionData.length + 1;

    // Dots: ● per unlocked tier, ○ per remaining
    var dotStr = '';
    for (var d = 0; d < skill._evolutionData.length; d++)
      dotStr += (d < level-1) ? '\u25CF' : '\u25CB'; // ● ○

    var tLabel  = 'T' + level + (level >= maxLevel ? '\u2605' : '');
    var fontSize = this.contents.fontSize;

    // Measure badge width
    this.contents.fontSize = 12;
    var dotW   = this.textWidth(dotStr);
    var tLW    = this.textWidth(tLabel);
    tierW = tLW + dotW + 8; // 8px gap between label and dots

    var badgeX = rect.x + rect.width - pad - tierW;

    // Tier number label
    this.changeTextColor(level > 1 ? '#ffd97a' : '#666666');
    this.drawText(tLabel, badgeX, rowMidY - 8, tLW);

    // Dots
    var dotX = badgeX + tLW + 4;
    for (var dd = 0; dd < skill._evolutionData.length; dd++){
      this.changeTextColor(dd < level-1 ? '#ffd97a' : '#444444');
      this.drawText(dd < level-1 ? '\u25CF' : '\u25CB', dotX + dd*11, rowMidY - 8, 12);
    }

    this.contents.fontSize = fontSize; // restore
  }

  // ── EN cost ─────────────────────────────────────────────────────────────
  var en    = getEN(actor, skill);
  var enStr = 'EN ' + en;
  this.contents.fontSize = 13;
  var enW = this.textWidth(enStr) + 6;
  var enX = rect.x + rect.width - pad - tierW - enW;

  // Color EN by affordability + burnout pressure
  var canAfford = actor ? actor.mp >= en : true;
  this.changeTextColor(canAfford ? '#4fc3f7' : '#cc4444');
  this.drawText(enStr, enX, rowMidY - 8, enW);
  this.resetFontSettings();

  // ── Skill name ──────────────────────────────────────────────────────────
  var nameW = enX - nameX - 8;
  this.resetTextColor();
  this.drawText(skill.name||'', nameX, rowMidY - 8, nameW);

  // ── Progress bar (thin strip at bottom of row) ───────────────────────────
  if (hasEvo){
    var prog  = getSkillProgress(actor, skill);
    if (prog){
      var barY  = rect.y + rect.height - barH - 1;
      var barX  = rect.x + pad;
      var barW  = rect.width - pad*2;
      // Track
      this.contents.fillRect(barX, barY, barW, barH, 'rgba(255,255,255,0.08)');
      // Fill
      var fillW = prog.atMax ? barW : Math.floor(barW * (prog.progress / prog.total));
      var fillC = prog.atMax ? '#ffd97a' : 'rgba(255,217,122,0.65)';
      if (fillW > 0) this.contents.fillRect(barX, barY, fillW, barH, fillC);
    }
  }

  this.resetTextColor();
  this.changePaintOpacity(true);
};

// ─────────────────────────────────────────────────────────────────────────────
// Adjust row height so the progress bar strip has room without cramping text.
// Standard lineHeight is ~36; we add 6px to give the bar its own lane.
// Only applies when the skill list is in a scene that isnds us a skill type
// that has evolution data (menu Scene_Skill). Battle mini-list is unaffected
// because Window_NoQList is a separate class.
// ─────────────────────────────────────────────────────────────────────────────
var _WS_lineHeight_orig = Window_SkillList.prototype.lineHeight;
Window_SkillList.prototype.lineHeight = function(){
  // Only add extra height if any skills in the current list have evo data
  if (this._data){
    for (var i = 0; i < this._data.length; i++){
      var s = this._data[i];
      if (s && s._evolutionData && s._evolutionData.length) return _WS_lineHeight_orig.call(this) + 6;
    }
  }
  return _WS_lineHeight_orig.call(this);
};

// Force a full refresh whenever the actor changes (e.g. cycling actors in menu)
var _WS_setActor_orig = Window_SkillList.prototype.setActor;
Window_SkillList.prototype.setActor = function(actor){
  _WS_setActor_orig.call(this, actor);
  this.refresh();
};

})();
