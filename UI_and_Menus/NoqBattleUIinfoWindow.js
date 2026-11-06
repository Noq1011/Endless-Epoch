/*:
 * @target MV
 * @plugindesc Noq Battle UI — Description Panel v4 (Fixed for Circular Windows)
 * @author Noq (patched by Claude)
 * @help Load LAST, below all other Noq battle UI plugins.
 *
 * Description panel appears in the battle log slot when skill/item list is open.
 * C key log toggle is handled by NoqBattleLog.js as normal.
 * Battle log auto-hides during target selection and restores after.
 */

(function(){
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// changeInputWindow guard — prevents radial from reopening during sub-windows,
// which caused keyboard selections to snap back to index 0.
// ─────────────────────────────────────────────────────────────────────────────
var _ciw_orig = Scene_Battle.prototype.changeInputWindow;
Scene_Battle.prototype.changeInputWindow = function(){
  if ((this._circularSkillWindow && this._circularSkillWindow.active) ||
      (this._circularItemWindow && this._circularItemWindow.active) ||
      (this._noqEnemySel && this._noqEnemySel.active) ||
      (this._noqAllySel  && this._noqAllySel.active)) return;
  _ciw_orig.call(this);
};

// ─────────────────────────────────────────────────────────────────────────────
// Cost / evolution helpers
// ─────────────────────────────────────────────────────────────────────────────

// Live burnout multiplier from UBS.MP_Tiers + actor's current TP.
function getBurnoutMult(actor){
  if (!actor) return 1;
  var UBS   = window.UBS || {};
  var tiers = UBS.MP_Tiers || [];
  var limit = (typeof actor.tpLimit === 'function') ? Math.max(1, actor.tpLimit()) : 100;
  var br    = Math.max(0, Math.min(1, (actor.tp||0) / limit));
  var mult  = (tiers.length && tiers[0].mult != null) ? tiers[0].mult : 1;
  for (var i = 0; i < tiers.length; i++){
    if (br >= tiers[i].rate) mult = tiers[i].mult;
  }
  return mult;
}

// Full EN cost after all modifiers. Includes the _noqReserve guard used by
// the UBS charge system so the displayed value matches what the system pays.
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

// Total cost-X reduction from active evolution tier effects.
function getEvoCostReduction(actor, skill){
  if (!actor || !actor.getSkillEffects || !skill) return 0;
  try{
    var effects = actor.getSkillEffects(skill.id) || [];
    var total = 0;
    for (var i = 0; i < effects.length; i++){
      if (effects[i] && effects[i].indexOf('cost-') === 0)
        total += Number(effects[i].replace('cost-','')) || 0;
    }
    return total;
  }catch(e){ return 0; }
}

// Current tier level (1 = no tiers unlocked yet).
function getSkillLevel(actor, skillId){
  if (!actor || !actor._skillUsage) return 1;
  var u = actor._skillUsage[skillId];
  return u ? Math.max(1, u.level||1) : 1;
}

// Progress toward the next tier.
// Returns null when the skill has no evolution data.
// Returns { level, maxLevel, atMax, progress, total }
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

// Word-wrap: returns array of display strings fitting within maxWidth.
// Empty string entries represent blank paragraph-gap lines.
function wrapText(win, text, maxWidth){
  var lines = [];
  var paras = String(text||'').split('\n');
  for (var p = 0; p < paras.length; p++){
    var words = paras[p].split(' ');
    var line  = '';
    for (var w = 0; w < words.length; w++){
      if (!words[w]) continue;
      var test  = line + (line ? ' ' : '') + words[w];
      var clean = test.replace(/\\C\[\d+\]|\\I\[\d+\]/gi,'');
      if (line && win.textWidth(clean) > maxWidth){ lines.push(line); line = words[w]; }
      else { line = test; }
    }
    if (line) lines.push(line);
    if (p < paras.length-1) lines.push('');
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Window_NoQBattleDesc
// Pure live-state: reads from SceneManager._scene and BattleManager every frame.
// Signature includes the actor's burnout tier so the cost line redraws
// automatically when burnout changes mid-battle.
// ─────────────────────────────────────────────────────────────────────────────
function Window_NoQBattleDesc(rect){
  this.initialize.apply(this, arguments);
}
Window_NoQBattleDesc.prototype = Object.create(Window_Base.prototype);
Window_NoQBattleDesc.prototype.constructor = Window_NoQBattleDesc;
Window_NoQBattleDesc.prototype.standardPadding = function(){ return 8; };
Window_NoQBattleDesc.prototype.lineHeight      = function(){ return 19; };

Window_NoQBattleDesc.prototype.initialize = function(rect){
  Window_Base.prototype.initialize.call(this, rect.x, rect.y, rect.width, rect.height);
  this.opacity = 0; this.backOpacity = 0; this.contentsOpacity = 255;
  this.visible = false;
  this._sig = '';
};

Window_NoQBattleDesc.prototype.syncRect = function(r){
  if (this.x===r.x && this.y===r.y && this.width===r.width && this.height===r.height) return;
  this.move(r.x, r.y, r.width, r.height);
  this.createContents();
  this._sig = '';
};

Window_NoQBattleDesc.prototype._getList = function(){
  var s = SceneManager._scene;
  if (!s) return null;
  // Check skill window first, then item window
  if (s._circularSkillWindow && s._circularSkillWindow.visible) {
    return s._circularSkillWindow;
  }
  if (s._circularItemWindow && s._circularItemWindow.visible) {
    return s._circularItemWindow;
  }
  return null;
};

Window_NoQBattleDesc.prototype._getActor = function(){
  return BattleManager.actor && BattleManager.actor();
};

Window_NoQBattleDesc.prototype._getItem  = function(){
  var L = this._getList(); 
  if (!L) return null;
  if (typeof L.item === 'function') return L.item();
  return (L._data && L._index != null) ? L._data[L._index] : null;
};

// Signature: item + actor + live burnout multiplier (triggers redraw on tier change)
Window_NoQBattleDesc.prototype._makeSig = function(item, actor){
  if (!item) return '';
  var mult = actor ? getBurnoutMult(actor).toFixed(2) : '1';
  return item.id + ':' + (actor ? actor.actorId() : 0) + ':' + mult;
};

Window_NoQBattleDesc.prototype.refresh = function(){
  if (!this.contents) return;
  var item  = this._getItem();
  var actor = this._getActor();
  var sig   = this._makeSig(item, actor);
  if (sig === this._sig) return;
  this._sig = sig;

  this.contents.clear();
  if (!item) return;

  // Dark background
  try{
    var ctx = this.contents._context;
    ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0,0,this.contents.width,this.contents.height);
    ctx.restore(); this.contents._setDirty();
  }catch(e){}

  var isSkill = !!(item.stypeId != null && DataManager.isSkill(item));
  var cw  = this.contentsWidth();
  var pad = this.textPadding();
  var lh  = this.lineHeight();
  var x   = pad;
  var y   = 4;

  // ── Name + tier badge ──────────────────────────────────────────────────
  this.contents.fontSize = 15;
  this.contents.fontBold = true;

  if (isSkill && item._evolutionData && item._evolutionData.length){
    var level    = getSkillLevel(actor, item.id);
    var evoData  = item._evolutionData;
    var maxLevel = evoData.length + 1;

    // Tier dots right-aligned (● unlocked, ○ locked)
    var dotStr = '';
    for (var d = 0; d < evoData.length; d++) dotStr += (d < level-1) ? '\u25CF' : '\u25CB';
    var dotW   = this.textWidth(dotStr) + 4;

    var tLabel = 'T' + level + (level >= maxLevel ? '\u2605' : '');
    var tLW    = this.textWidth(tLabel) + 8;
    var rightW = tLW + dotW + 4;

    // Tier label
    this.contents.fontBold = false;
    this.contents.fontSize = 12;
    this.changeTextColor(level > 1 ? '#ffd97a' : '#666666');
    this.drawText(tLabel, cw - rightW, y + 3, tLW);

    // Dots
    for (var dd = 0; dd < evoData.length; dd++){
      this.changeTextColor(dd < level-1 ? '#ffd97a' : '#444444');
      this.drawText(dd < level-1 ? '\u25CF' : '\u25CB',
                    cw - dotW + (dd*11), y + 3, 12);
    }

    // Skill name
    this.contents.fontBold = true;
    this.contents.fontSize = 15;
    this.changeTextColor('#ffcc66');
    this.drawText(item.name||'', x, y, cw - rightW - 8 - pad);

  } else {
    this.changeTextColor(isSkill ? '#ffcc66' : '#ffffff');
    this.drawText(item.name||'', x, y, cw - pad*2);
  }

  this.contents.fontBold = false;
  y += lh + 2;

  // ── EN cost / quantity ─────────────────────────────────────────────────
  this.contents.fontSize = 13;

  if (isSkill){
    var en   = getEN(actor, item);
    var mult = actor ? getBurnoutMult(actor) : 1;
    var red  = getEvoCostReduction(actor, item);

    this.changeTextColor('#4fc3f7');
    this.drawText('EN ' + en, x, y, 68);

    var cx = x + 72;
    if (mult > 1){
      this.changeTextColor('#ff9e00');
      this.drawText('x' + mult.toFixed(2) + ' burnout', cx, y, 118);
      cx += 120;
    }
    if (red > 0){
      this.changeTextColor('#2ecc71');
      this.drawText('-' + red + ' evo', cx, y, 80);
    }
    if (mult <= 1 && red === 0){
      this.changeTextColor('#444444');
      this.drawText('base', cx, y, 50);
    }

  } else {
    var qty = ($gameParty && $gameParty.numItems) ? $gameParty.numItems(item) : 0;
    this.changeTextColor('#aaaaaa');
    this.drawText('x' + qty, x, y, cw - pad*2, 'right');
  }

  y += lh;

  // ── Separator ──────────────────────────────────────────────────────────
  this.contents.fillRect(x, y, cw - pad*2, 1, 'rgba(255,255,255,0.15)');
  y += 5;

  // ── Description (word-wrapped) ─────────────────────────────────────────
  var desc = item.description || '';
  if (desc){
    this.resetTextColor();
    this.contents.fontSize = 13;
    var maxW     = cw - pad*2;
    var hasBar   = isSkill && item._evolutionData && item._evolutionData.length;
    var maxDescY = this.contentsHeight() - (hasBar ? 26 : 0);
    var wrapped  = wrapText(this, desc, maxW);
    for (var li = 0; li < wrapped.length; li++){
      if (y + lh > maxDescY) break;
      if (wrapped[li] === ''){ y += Math.floor(lh * 0.5); continue; }
      this.drawText(wrapped[li], x, y, maxW);
      y += lh;
    }
  }

  // ── Progress bar ───────────────────────────────────────────────────────
  if (isSkill && item._evolutionData && item._evolutionData.length){
    var prog = getSkillProgress(actor, item);
    if (prog){
      var barH = 7;
      var barW = cw - pad*2;
      var barY = this.contentsHeight() - barH - 3;
      var labY = barY - 15;

      this.contents.fillRect(x, barY, barW, barH, 'rgba(255,255,255,0.10)');

      if (prog.atMax){
        this.contents.fillRect(x, barY, barW, barH, '#ffd97a');
        this.contents.fontSize = 11;
        this.changeTextColor('#ffd97a');
        this.drawText('Max Tier \u2605', x, labY, barW, 'center');
      } else {
        var fillW = Math.floor(barW * (prog.progress / prog.total));
        this.contents.fillRect(x, barY, fillW, barH, '#ffd97a');
        this.contents.fontSize = 11;
        this.changeTextColor('#888888');
        this.drawText(prog.progress + ' / ' + prog.total + ' uses', x, labY, barW - 72);
        this.changeTextColor('#ffd97a');
        this.drawText('\u2192 Tier ' + (prog.level+1), cw - 72 - pad, labY, 68, 'right');
      }
    }
  }

  this.resetTextColor();
  this.contents.fontSize = this.standardFontSize();
};

// ─────────────────────────────────────────────────────────────────────────────
// Scene hooks
// ─────────────────────────────────────────────────────────────────────────────

var _SB_start = Scene_Battle.prototype.start;
Scene_Battle.prototype.start = function(){
  _SB_start.call(this);
  if (this._bfPlusWin && !this._noqDescPanel){
    var r = this.bfPlusRect
      ? this.bfPlusRect()
      : new Rectangle(0, Graphics.height-120, Graphics.width, 120);
    this._noqDescPanel = new Window_NoQBattleDesc(r);
    this.addWindow(this._noqDescPanel);
  }
};

// Hide everything when opening targeting selectors
var _openEn = Scene_Battle.prototype.noqOpenEnemySelector;
if (_openEn) {
  Scene_Battle.prototype.noqOpenEnemySelector = function(){
    if (this._bfPlusWin)    this._bfPlusWin.visible   = false;
    if (this._noqDescPanel) this._noqDescPanel.visible = false;
    if (this._noqHelpMini)  this._noqHelpMini.hide();
    _openEn.call(this);
  };
}

var _openAl = Scene_Battle.prototype.noqOpenAllySelector;
if (_openAl) {
  Scene_Battle.prototype.noqOpenAllySelector = function(mode){
    if (this._bfPlusWin)    this._bfPlusWin.visible   = false;
    if (this._noqDescPanel) this._noqDescPanel.visible = false;
    if (this._noqHelpMini)  this._noqHelpMini.hide();
    _openAl.call(this, mode);
  };
}

var _SB_upd = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_upd.call(this);

  var selActive = (this._noqEnemySel && this._noqEnemySel.active) ||
                  (this._noqAllySel  && this._noqAllySel.active);
  
  // Check if either skill or item window is open
  var listOpen = (this._circularSkillWindow && this._circularSkillWindow.visible) ||
                 (this._circularItemWindow && this._circularItemWindow.visible);
  
  var panel = this._noqDescPanel;

  // Targeting active — don't show description panel
  if (selActive) {
    if (panel) panel.visible = false;
    return;
  }

  // Nothing open — restore battle log, hide description panel
  if (!listOpen){
    if (this._bfPlusWin) this._bfPlusWin.visible = true;
    if (panel)           panel.visible = false;
    return;
  }

  // Skill/item list is open — show description panel, hide battle log
  if (panel){
    if (this.bfPlusRect) panel.syncRect(this.bfPlusRect());
    panel.refresh();
    panel.visible = true;
    if (this._bfPlusWin)   this._bfPlusWin.visible = false;
    if (this._noqHelpMini) this._noqHelpMini.hide();
  }
};

})();