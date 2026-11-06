/*:
 * @target MV
 * @plugindesc Noq Target Status Panel - Shows enemy/ally info during targeting
 * @author Noq (created by Claude)
 * @help Load AFTER NoqCircularCommand and BEFORE NoqBattleUIinfoWindow
 * 
 * Displays HP, buffs, debuffs, states, and harmony status
 * for both enemies and allies during target selection.
 */

(function(){
'use strict';

// Global reference for the selectors to notify
window.NoqTargetStatusPanel = {
    _currentTarget: null,
    _isEnemy: false,
    setTarget: function(target, isEnemy) {
        this._currentTarget = target;
        this._isEnemy = isEnemy;
    },
    getTarget: function() {
        return this._currentTarget;
    },
    isEnemy: function() {
        return this._isEnemy;
    }
};

/* -------------------- Window_NoQTargetStatus -------------------- */
function Window_NoQTargetStatus(rect){
  this.initialize.apply(this, arguments);
}
Window_NoQTargetStatus.prototype = Object.create(Window_Base.prototype);
Window_NoQTargetStatus.prototype.constructor = Window_NoQTargetStatus;
Window_NoQTargetStatus.prototype.standardPadding = function(){ return 8; };
Window_NoQTargetStatus.prototype.lineHeight = function(){ return 20; };

Window_NoQTargetStatus.prototype.initialize = function(rect){
  Window_Base.prototype.initialize.call(this, rect.x, rect.y, rect.width, rect.height);
  this.opacity = 0; 
  this.backOpacity = 0; 
  this.contentsOpacity = 255;
  this.visible = false;
  this._sig = '';
};

Window_NoQTargetStatus.prototype.syncRect = function(r){
  if (this.x===r.x && this.y===r.y && this.width===r.width && this.height===r.height) return;
  this.move(r.x, r.y, r.width, r.height);
  this.createContents();
  this._sig = '';
};

Window_NoQTargetStatus.prototype._getTarget = function(){
  return window.NoqTargetStatusPanel.getTarget();
};

Window_NoQTargetStatus.prototype._isEnemy = function(){
  return window.NoqTargetStatusPanel.isEnemy();
};

Window_NoQTargetStatus.prototype._makeSig = function(target){
  if (!target) return '';
  // Include HP, states, and buffs in signature for auto-refresh
  var hpStr = target.hp + '/' + target.mhp;
  var mpStr = target.mp + '/' + target.mmp;
  var stateStr = target._states.join(',');
  var buffStr = target._buffs.join(',');
  var index = target.index ? target.index() : (target.actorId ? target.actorId() : 0);
  return index + ':' + hpStr + ':' + mpStr + ':' + stateStr + ':' + buffStr;
};

Window_NoQTargetStatus.prototype.refresh = function(){
  if (!this.contents) return;
  var target = this._getTarget();
  var sig = this._makeSig(target);
  if (sig === this._sig) return;
  this._sig = sig;

  this.contents.clear();
  if (!target) return;

  var isEnemy = this._isEnemy();
  // Allies are always "scanned", enemies must be hit by the <Scan> skill
  var isScanned = !isEnemy || target._isScanned; 

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

  // ── Target Name ──────────────────────────────────────────────────
  this.contents.fontSize = 16;
  this.contents.fontBold = true;
  this.changeTextColor(isEnemy ? '#ff6666' : '#66ff66');
  // Append Verse to the name if scanned
  var nameText = target.name();
  if (isEnemy && isScanned && target._verseChoice) nameText += " (" + target._verseChoice + ")";
  this.drawText(nameText, x, y, cw - pad*2);
  this.contents.fontBold = false;
  y += lh + 2;

	// ── HP Bar ──────────────────────────────────────────────────────
  this.contents.fontSize = 13;
  var hpRate = target.hp / target.mhp;
  
  var textW = 75; // Increased width so large numbers fit comfortably
  var textX = cw - pad - textW; // Anchored directly to the right padding
  var barX = x + 28; // Placed right after the "HP" label
  var barW = textX - barX - 6; // Dynamically calculated gap between label and text
  var barH = 8;
  
  this.changeTextColor('#aaaaaa');
  this.drawText('HP', x, y, 28);
  
  // Bar background & fill
  this.contents.fillRect(barX, y + 4, barW, barH, 'rgba(255,255,255,0.15)');
  var hpColor = hpRate < 0.25 ? '#e74c3c' : (hpRate < 0.5 ? '#f39c12' : '#2ecc71');
  this.contents.fillRect(barX, y + 4, Math.floor(barW * hpRate), barH, hpColor);
  
  // Right-aligned HP Text
  this.changeTextColor('#ffffff');
  var hpText = isScanned ? (target.hp + '/' + target.mhp) : "??? / ???";
  this.drawText(hpText, textX, y, textW, 'right');
  y += lh;

  // ── MP Bar ──────────────────────────────────────────
  if (target.mmp > 0) {
    var mpRate = target.mp / target.mmp;
    
    this.changeTextColor('#aaaaaa');
    this.drawText('EN', x, y, 28);
    
    // Bar background & fill
    this.contents.fillRect(barX, y + 4, barW, barH, 'rgba(255,255,255,0.15)');
    this.contents.fillRect(barX, y + 4, Math.floor(barW * mpRate), barH, '#4fc3f7');
    
    // Right-aligned MP Text
    this.changeTextColor('#ffffff');
    var mpText = isScanned ? (target.mp + '/' + target.mmp) : "??? / ???";
    this.drawText(mpText, textX, y, textW, 'right');
    y += lh;
  }

  // ── Separator ──────────────────────────────────────────────────
  this.contents.fillRect(x, y, cw - pad*2, 1, 'rgba(255,255,255,0.15)');
  y += 6;
  
  // ── AI Intent Broadcast ──────────────────────────────────────────
  var targetIndex = target.index();
  var isEnemyTarget = isEnemy;
  var intentText = "";

  $gameParty.battleMembers().forEach(function(member) {
      if (member._aiTarget && member._aiTarget === target && member._aiSkillName) {
          intentText = member.name().toUpperCase() + " IS Preparing " + member._aiSkillName;
      }
  });

  if (intentText !== "") {
      this.contents.fontSize = 14;
      this.contents.fontItalic = true;
      this.changeTextColor('#ffcc00'); 
      this.drawText(intentText, x, y, cw - pad*2, 'center');
      y += lh;
  }
  this.contents.fontItalic = false;

	// ── Split Layout: Left (Stats) / Right (States) ──────────────────
  var leftHalfWidth = (cw - pad*2) * 0.45; // 45% of width for stats
  var rightHalfX = x + leftHalfWidth + 30; // Push states to the right side
  var splitY = y; // Anchor Y coordinate for both columns

  if (isScanned) {
      this.contents.fontSize = 12;
      
      var statLabels = ["ATK", "DEF", "MAT", "MDF", "AGI", "LUK"];
      var statIds = [2, 3, 4, 5, 6, 7];
      
      var colWidth = leftHalfWidth / 2;
      var statY = splitY;
      
      for (var i = 0; i < 6; i++) {
          var statCol = i % 2;
          var drawX = x + (statCol * colWidth);
          var paramId = statIds[i];
          var currentStat = target.param(paramId);  
          
          // Isolate In-Battle Multipliers (Buffs + Active States)
          var battleMultiplier = target.paramBuffRate(paramId);
          var activeStates = target.states();
          for (var s = 0; s < activeStates.length; s++) {
              var traits = activeStates[s].traits;
              for (var t = 0; t < traits.length; t++) {
                  if (traits[t].code === 21 && traits[t].dataId === paramId) { 
                      battleMultiplier *= traits[t].value; // 21 is the MV code for Param Rate
                  }
              }
          }

          // Draw Label
          this.changeTextColor('#888888');
          this.drawText(statLabels[i] + ":", drawX, statY, 30);
          
          // Determine Color based strictly on battle multiplier
          if (battleMultiplier > 1.01) {
              this.changeTextColor('#66ff66'); // Buffed (Green)
          } else if (battleMultiplier < 0.99) {
              this.changeTextColor('#ff6666'); // Debuffed (Red)
          } else {
              this.changeTextColor('#ffffff'); // Normal (White)
          }
          
          this.drawText(currentStat, drawX + 35, statY, 40);
          
          if (statCol === 1) statY += 16;
      }
      y = statY; // Save the bottom of the stat block
  } else {
      this.contents.fontSize = 12;
      this.changeTextColor('#888888');
      this.drawText('STATS UNKNOWN - SCAN REQUIRED', x, splitY + 16, leftHalfWidth, 'center');
      y = splitY + 48; 
  }

  // ── States (Drawn on the Right Side) ────────────────────────────
  var stateY = splitY;
  var states = target.states().filter(function(s) {
      return s.id !== target.deathStateId();
  });

  if (states.length > 0) {
      this.contents.fontSize = 12;
      this.changeTextColor('#888888');
      this.drawText('STATUS EFFECTS', rightHalfX, stateY, cw - rightHalfX);
      stateY += 16;
      
      for (var s = 0; s < states.length && stateY + lh < this.contentsHeight(); s++) {
          var state = states[s];
          if (state.iconIndex > 0) this.drawIcon(state.iconIndex, rightHalfX, stateY - 2);
          this.resetTextColor();
          this.drawText(state.name, rightHalfX + 36, stateY, (cw - rightHalfX) - 36);
          stateY += 18;
      }
  } else {
      this.contents.fontSize = 12;
      this.changeTextColor('#555555');
      this.drawText('NO EFFECTS', rightHalfX, stateY + 16, cw - rightHalfX);
      stateY += 32;
  }

  // Push main Y coordinate past whichever column was taller
  y = Math.max(y, stateY) + 8;

  // ── Harmony (if present) ────────────────────────────────────────
  if (target._harmonyActive || this._hasHarmonyState(target)) {
    this.contents.fontSize = 12;
    this.changeTextColor('#ffd97a');
    this.drawText('\u2605 HARMONY ACTIVE', x, y, cw - pad*2);
    y += 16;
  }

  // ── Class (for allies) ──────────────────────────────────────────
  if (!isEnemy && target.currentClass) {
    this.contents.fontSize = 11;
    this.changeTextColor('#888888');
    this.drawText(target.currentClass().name, x, y, cw - pad*2, 'right');
  }

  this.resetTextColor();
  this.contents.fontSize = this.standardFontSize();
};

// Helper to check for harmony states (customize based on your game)
Window_NoQTargetStatus.prototype._hasHarmonyState = function(target) {
    if (!target || typeof target.states !== 'function') return false;
    var states = target.states();
    for (var i = 0; i < states.length; i++) {
        if (states[i] && states[i].name.toLowerCase().indexOf('harmony') >= 0) {
            return true;
        }
    }
    return false;
};

/* -------------------- Scene_Battle Integration -------------------- */

// 1. Setup the Panel on Battle Start
var _SB_start_targetStatus = Scene_Battle.prototype.start;
Scene_Battle.prototype.start = function() {
    _SB_start_targetStatus.call(this);
    if (!this._noqTargetStatusPanel) {
        var r = this.bfPlusRect ? this.bfPlusRect() : new Rectangle(0, Graphics.height - 120, Graphics.width, 120);
        this._noqTargetStatusPanel = new Window_NoQTargetStatus(r);
        this.addWindow(this._noqTargetStatusPanel);
    }
};

// 2. The Logic to find the Target (The "Hunter" Logic)
Scene_Battle.prototype.update_noqTargetStatusLogic = function() {
    var panel = this._noqTargetStatusPanel;
    if (!panel) return;

    // Search for the active selector window
    var activeSelector = null;
    if (this._noqEnemySel && this._noqEnemySel.active) activeSelector = this._noqEnemySel;
    if (this._noqAllySel && this._noqAllySel.active) activeSelector = this._noqAllySel;

    if (activeSelector) {
        var isEnemy = (activeSelector === this._noqEnemySel);
        // Use .actor() for allies, .enemy() for enemies
        var target = isEnemy ? activeSelector.enemy() : activeSelector.actor();
        
        if (target) {
            window.NoqTargetStatusPanel.setTarget(target, isEnemy);
            panel.visible = true;
            if (this.bfPlusRect) panel.syncRect(this.bfPlusRect());
            panel.refresh();
            
            // Hide competing UI elements
            if (this._bfPlusWin) this._bfPlusWin.visible = false;
            if (this._noqDescPanel) this._noqDescPanel.visible = false;
            return; 
        }
    }

    // If nothing is active, hide everything
    panel.visible = false;
    window.NoqTargetStatusPanel.setTarget(null, false);
};

// 3. Hook into the main Update loop
var _SB_update_targetStatus = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function() {
    _SB_update_targetStatus.call(this);
    this.update_noqTargetStatusLogic();
};

})();
