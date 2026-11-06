/*:
 * @target MV
 * @plugindesc Noq Enemy Status Panel - Shows enemy info in battle UI during targeting
 * @author Noq (created by Claude)
 * @help Load AFTER NoqCircularCommand and BEFORE NoqBattleDesc
 * 
 * Displays enemy HP, buffs, debuffs, states, and harmony status
 * in the battle UI box when selecting enemy targets.
 */

(function(){
'use strict';

// Global reference for the enemy selector to notify
window.NoqEnemyStatusPanel = {
    _currentEnemy: null,
    setEnemy: function(enemy) {
        this._currentEnemy = enemy;
    },
    getEnemy: function() {
        return this._currentEnemy;
    }
};

/* -------------------- Window_NoQEnemyStatus -------------------- */
function Window_NoQEnemyStatus(rect){
  this.initialize.apply(this, arguments);
}
Window_NoQEnemyStatus.prototype = Object.create(Window_Base.prototype);
Window_NoQEnemyStatus.prototype.constructor = Window_NoQEnemyStatus;
Window_NoQEnemyStatus.prototype.standardPadding = function(){ return 8; };
Window_NoQEnemyStatus.prototype.lineHeight = function(){ return 20; };

Window_NoQEnemyStatus.prototype.initialize = function(rect){
  Window_Base.prototype.initialize.call(this, rect.x, rect.y, rect.width, rect.height);
  this.opacity = 0; 
  this.backOpacity = 0; 
  this.contentsOpacity = 255;
  this.visible = false;
  this._sig = '';
};

Window_NoQEnemyStatus.prototype.syncRect = function(r){
  if (this.x===r.x && this.y===r.y && this.width===r.width && this.height===r.height) return;
  this.move(r.x, r.y, r.width, r.height);
  this.createContents();
  this._sig = '';
};

Window_NoQEnemyStatus.prototype._getEnemy = function(){
  return window.NoqEnemyStatusPanel.getEnemy();
};

Window_NoQEnemyStatus.prototype._makeSig = function(enemy){
  if (!enemy) return '';
  // Include HP, states, and buffs in signature for auto-refresh
  var hpStr = enemy.hp + '/' + enemy.mhp;
  var stateStr = enemy._states.join(',');
  var buffStr = enemy._buffs.join(',');
  return enemy.index() + ':' + hpStr + ':' + stateStr + ':' + buffStr;
};

Window_NoQEnemyStatus.prototype.refresh = function(){
  if (!this.contents) return;
  var enemy = this._getEnemy();
  var sig = this._makeSig(enemy);
  if (sig === this._sig) return;
  this._sig = sig;

  this.contents.clear();
  if (!enemy) return;

  // Dark background
  try{
    var ctx = this.contents._context;
    ctx.save(); 
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0,0,this.contents.width,this.contents.height);
    ctx.restore(); 
    this.contents._setDirty();
  }catch(e){}

  var cw  = this.contentsWidth();
  var pad = this.textPadding();
  var lh  = this.lineHeight();
  var x   = pad;
  var y   = 4;

  // ── Enemy Name ──────────────────────────────────────────────────
  this.contents.fontSize = 16;
  this.contents.fontBold = true;
  this.changeTextColor('#ff6666');
  this.drawText(enemy.name(), x, y, cw - pad*2);
  this.contents.fontBold = false;
  y += lh + 2;

  // ── HP Bar ──────────────────────────────────────────────────────
  this.contents.fontSize = 13;
  var hpRate = enemy.hp / enemy.mhp;
  var barW = cw - pad*2 - 60;
  var barH = 8;
  var barX = x + 30;
  
  this.changeTextColor('#aaaaaa');
  this.drawText('HP', x, y, 28);
  
  // HP bar background
  this.contents.fillRect(barX, y + 4, barW, barH, 'rgba(255,255,255,0.15)');
  
  // HP bar fill (color changes based on HP)
  var hpColor = '#2ecc71'; // Green
  if (hpRate < 0.25) hpColor = '#e74c3c'; // Red
  else if (hpRate < 0.5) hpColor = '#f39c12'; // Orange
  
  this.contents.fillRect(barX, y + 4, Math.floor(barW * hpRate), barH, hpColor);
  
  // HP text
  this.changeTextColor('#ffffff');
  this.drawText(enemy.hp + '/' + enemy.mhp, barX + barW + 4, y, 55, 'right');
  y += lh + 4;

  // ── Separator ──────────────────────────────────────────────────
  this.contents.fillRect(x, y, cw - pad*2, 1, 'rgba(255,255,255,0.15)');
  y += 6;

  // ── Buffs/Debuffs ──────────────────────────────────────────────
  var hasBuffs = false;
  for (var i = 0; i < enemy._buffs.length; i++) {
    if (enemy._buffs[i] !== 0) {
      hasBuffs = true;
      break;
    }
  }

  if (hasBuffs) {
    this.contents.fontSize = 12;
    this.changeTextColor('#888888');
    this.drawText('STAT CHANGES', x, y, cw - pad*2);
    y += 16;

    var buffNames = ['ATK', 'DEF', 'MAG', 'MDF', 'AGI', 'LUK'];
    var buffX = x;
    for (var b = 0; b < enemy._buffs.length; b++) {
      if (enemy._buffs[b] !== 0) {
        var buffVal = enemy._buffs[b];
        var buffColor = buffVal > 0 ? '#4fc3f7' : '#ff9e00';
        var buffText = buffNames[b] + ' ' + (buffVal > 0 ? '+' : '') + buffVal;
        
        this.changeTextColor(buffColor);
        this.drawText(buffText, buffX, y, 60);
        buffX += 65;
        
        if (buffX + 60 > cw - pad) {
          buffX = x;
          y += 16;
        }
      }
    }
    if (buffX !== x) y += 16;
    y += 2;
  }

  // ── States ──────────────────────────────────────────────────────
  var states = enemy.states().filter(function(s) {
    return s.id !== enemy.deathStateId();
  });

  if (states.length > 0) {
    this.contents.fontSize = 12;
    this.changeTextColor('#888888');
    this.drawText('STATUS EFFECTS', x, y, cw - pad*2);
    y += 16;

    for (var s = 0; s < states.length && y + lh < this.contentsHeight(); s++) {
      var state = states[s];
      
      // Draw state icon if available
      if (state.iconIndex > 0) {
        this.drawIcon(state.iconIndex, x, y - 2);
      }
      
      // Draw state name
      this.resetTextColor();
      this.drawText(state.name, x + 36, y, cw - pad*2 - 36);
      y += 18;
    }
    y += 2;
  }

  // ── Harmony (if present) ────────────────────────────────────────
  // Check if enemy has harmony active (customize based on your system)
  if (enemy._harmonyActive || (enemy._states && this._hasHarmonyState(enemy))) {
    this.contents.fontSize = 12;
    this.changeTextColor('#ffd97a');
    this.drawText('\u2605 HARMONY ACTIVE', x, y, cw - pad*2);
    y += 16;
  }

  this.resetTextColor();
  this.contents.fontSize = this.standardFontSize();
};

// Helper to check for harmony states (customize based on your game)
Window_NoQEnemyStatus.prototype._hasHarmonyState = function(enemy) {
  // Example: Check for states with "harmony" in the name
  var states = enemy.states();
  for (var i = 0; i < states.length; i++) {
    if (states[i].name.toLowerCase().indexOf('harmony') >= 0) {
      return true;
    }
  }
  return false;
};

/* -------------------- Scene_Battle Integration -------------------- */

var _SB_start_enemyStatus = Scene_Battle.prototype.start;
Scene_Battle.prototype.start = function(){
  _SB_start_enemyStatus.call(this);
  
  // Create enemy status panel using same rect as description panel
  if (this._bfPlusWin && !this._noqEnemyStatusPanel){
    var r = this.bfPlusRect
      ? this.bfPlusRect()
      : new Rectangle(0, Graphics.height-120, Graphics.width, 120);
    this._noqEnemyStatusPanel = new Window_NoQEnemyStatus(r);
    this.addWindow(this._noqEnemyStatusPanel);
  }
};

var _SB_update_enemyStatus = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function(){
  _SB_update_enemyStatus.call(this);

  var enemySelActive = this._noqEnemySel && this._noqEnemySel.active;
  var panel = this._noqEnemyStatusPanel;

  if (!panel) return;

  // Enemy selection active - show enemy status
  if (enemySelActive) {
    if (this.bfPlusRect) panel.syncRect(this.bfPlusRect());
    panel.refresh();
    panel.visible = true;
    
    // Hide other panels
    if (this._bfPlusWin) this._bfPlusWin.visible = false;
    if (this._noqDescPanel) this._noqDescPanel.visible = false;
    if (this._noqHelpMini) this._noqHelpMini.hide();
  } else {
    // Enemy selection not active - hide enemy status
    panel.visible = false;
  }
};

})();
