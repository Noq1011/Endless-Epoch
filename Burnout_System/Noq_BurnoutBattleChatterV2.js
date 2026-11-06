/*:
 * @plugindesc (MV ES5) NoqBattleChatterPlus v2.1 — Scaled Rounded Bubbles
 * @author Noq + Gemini
 */

var NoqBattleChatterV2 = NoqBattleChatterV2 || {};
(function(){
'use strict';

/* ---------- EX_UI Fallback & Helper ---------- */
var UI = typeof EX_UI !== 'undefined' ? EX_UI : {
  scaleX: function(){ return 1; },
  scaleY: function(){ return 1; }
};
function scaled(val) { return val * UI.scaleX(); }

/* =========================
 * Config
 * ========================= */
var CFG = {
  enabled: true,
  cooldown: 60,
  duration: 110, // Slightly longer for easier reading
  fontSize: 18,
  width: 260,
  height: 44,    // Increased for padding
  yOffset: 20,
  bounce: 4,     // Subtler bounce
  borderRadius: 12,
  mirrorToFeedIfNoSprite: true
};

/* =========================
 * Helpers (Internal)
 * ========================= */
function asArrayCSV(text){
  if (!text) return null;
  text = String(text);
  if (text.charAt(0)==='"' && text.charAt(text.length-1)==='"') text = text.slice(1,-1);
  return text.split(',').map(function(s){return s.trim();}).filter(Boolean);
}
function metaList(obj, key){
  return obj && obj.meta && obj.meta[key] ? asArrayCSV(obj.meta[key]) : null;
}
function pick(list){
  return list && list.length ? list[Math.floor(Math.random()*list.length)] : null;
}
function battlerData(b){
  return b.isActor() ? b.actor() : b.enemy();
}
function findSpriteForBattler(battler){
  var scene = SceneManager._scene;
  if (!scene || !(scene._spriteset)) return null;
  var ss = scene._spriteset;
  var pools = (ss._actorSprites||[]).concat(ss._enemySprites||[]);
  for (var i=0;i<pools.length;i++){
    var s = pools[i];
    if (s && s._battler === battler) return s;
  }
  return null;
}

// In your existing battle chatter plugin, replace the message display code with:
 
function showActorChatter(actorId, text) {
    var actor = $gameActors.actor(actorId);
    if (!actor) return;
    
    // Get actor's face data
    var faceName = actor.faceName();
    var faceIndex = actor.faceIndex();
    
    // Display via NoqMsg system
    NoqMsg.showBattleChatter(
        text,           // The chatter text
        faceName,       // Actor's face file
        faceIndex,      // Actor's face index
        true            // isActor = true (appears on right)
    );
}
 
function showEnemyChatter(enemy, text) {
    // Get enemy face (you might have this in enemy notes or database)
    var faceName = enemy.meta.faceName || 'Monster';
    var faceIndex = enemy.meta.faceIndex || 0;
    
    // Display via NoqMsg system
    NoqMsg.showBattleChatter(
        text,           // The chatter text
        faceName,       // Enemy's face file
        faceIndex,      // Enemy's face index
        false           // isActor = false (appears on left)
    );
}
 
// ============================================================================
// EXAMPLE 2: Critical Hit Reaction
// ============================================================================
 
// When a critical hit happens:
var _BattleManager_applyDamage = BattleManager.applyDamage;
BattleManager.applyDamage = function(target, damage) {
    _BattleManager_applyDamage.call(this, target, damage);
    
    if (damage.critical) {
        var subject = this._subject;
        
        if (subject.isActor()) {
            var chatterOptions = [
                "Critical hit!",
                "Take that!",
                "Bulls eye!",
                "Direct hit!"
            ];
            var text = chatterOptions[Math.floor(Math.random() * chatterOptions.length)];
            
            NoqMsg.showBattleChatter(
                text,
                subject.faceName(),
                subject.faceIndex(),
                true
            );
        }
    }
};
 
// ============================================================================
// EXAMPLE 3: Low HP Warning
// ============================================================================
 
// When actor HP drops below 25%:
var _Game_Actor_setHp = Game_Actor.prototype.setHp;
Game_Actor.prototype.setHp = function(hp) {
    var oldHp = this._hp;
    _Game_Actor_setHp.call(this, hp);
    
    var hpRate = this.hpRate();
    var oldRate = oldHp / this.mhp;
    
    // Crossed 25% threshold going down
    if ($gameParty.inBattle() && oldRate > 0.25 && hpRate <= 0.25) {
        var lowHpMessages = [
            "I'm in trouble!",
            "Need healing!",
            "Getting weak...",
            "Can't take much more!"
        ];
        var text = lowHpMessages[Math.floor(Math.random() * lowHpMessages.length)];
        
        NoqMsg.showBattleChatter(
            text,
            this.faceName(),
            this.faceIndex(),
            true
        );
    }
};
 
// ============================================================================
// EXAMPLE 4: Victory Celebration
// ============================================================================
 
// When battle ends in victory:
var _BattleManager_processVictory = BattleManager.processVictory;
BattleManager.processVictory = function() {
    _BattleManager_processVictory.call(this);
    
    // Get random alive party member
    var aliveMembers = $gameParty.aliveMembers();
    if (aliveMembers.length > 0) {
        var actor = aliveMembers[Math.floor(Math.random() * aliveMembers.length)];
        
        var victoryMessages = [
            "We did it!",
            "Victory!",
            "That wasn't so tough!",
            "Another one bites the dust!"
        ];
        var text = victoryMessages[Math.floor(Math.random() * victoryMessages.length)];
        
        NoqMsg.showBattleChatter(
            text,
            actor.faceName(),
            actor.faceIndex(),
            true
        );
    }
};
 
// ============================================================================
// EXAMPLE 5: Enemy Entry (Boss Intro)
// ============================================================================
 
// When a boss enters battle:
var _Scene_Battle_createEnemyWindow = Scene_Battle.prototype.createEnemyWindow;
Scene_Battle.prototype.createEnemyWindow = function() {
    _Scene_Battle_createEnemyWindow.call(this);
    
    // Check if any enemy has a boss flag
    $gameTroop.members().forEach(function(enemy) {
        if (enemy.enemy().meta.isBoss) {
            var bossIntro = enemy.enemy().meta.bossIntro || "You dare challenge me?";
            var faceName = enemy.enemy().meta.faceName || 'Evil';
            var faceIndex = enemy.enemy().meta.faceIndex || 0;
            
            NoqMsg.showBattleChatter(
                bossIntro,
                faceName,
                faceIndex,
                false  // Enemy, so left side
            );
        }
    });
};
 
// ============================================================================
// EXAMPLE 6: Skill-Specific Callouts
// ============================================================================
 
// When using a skill with custom chatter:
var _Game_Battler_useItem = Game_Battler.prototype.useItem;
Game_Battler.prototype.useItem = function(item) {
    _Game_Battler_useItem.call(this, item);
    
    if ($gameParty.inBattle() && item.meta.chatter && this.isActor()) {
        NoqMsg.showBattleChatter(
            item.meta.chatter,  // Set in skill notes: <chatter:Take this!>
            this.faceName(),
            this.faceIndex(),
            true
        );
    }
};
 
// Database setup example:
// In skill notes:
// <chatter:Fireball incoming!>
// <faceName:Actor1>
// <faceIndex:2>
 
// ============================================================================
// EXAMPLE 7: Mode Switching Based on Battle Type
// ============================================================================
 
// Auto-switch to appropriate mode:
var _BattleManager_setup = BattleManager.setup;
BattleManager.setup = function(troopId, canEscape, canLose) {
    _BattleManager_setup.call(this, troopId, canEscape, canLose);
    
    var troop = $dataTroops[troopId];
    
    // Check if this is a boss battle
    var isBoss = troop.members.some(function(member) {
        var enemy = $dataEnemies[member.enemyId];
        return enemy && enemy.meta.isBoss;
    });
    
    if (isBoss) {
        // Use side messages for boss battles
        $gameSystem._msgDisplayMode = 'sidemsg';
    } else {
        // Use battle log for regular battles
        $gameSystem._msgDisplayMode = 'battlelog';
    }
};
 
// Return to normal after battle
var _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
Scene_Battle.prototype.terminate = function() {
    _Scene_Battle_terminate.call(this);
    $gameSystem._msgDisplayMode = 'normal';
};
 
// ============================================================================
// EXAMPLE 8: Random Battle Chatter During Actions
// ============================================================================
 
// Actors sometimes comment during battle actions:
var _Game_Actor_performAction = Game_Actor.prototype.performAction;
Game_Actor.prototype.performAction = function(action) {
    _Game_Actor_performAction.call(this, action);
    
    // 30% chance to show chatter
    if (Math.random() < 0.3) {
        var messages = this.getBattleChatterMessages(action);
        if (messages.length > 0) {
            var text = messages[Math.floor(Math.random() * messages.length)];
            
            NoqMsg.showBattleChatter(
                text,
                this.faceName(),
                this.faceIndex(),
                true
            );
        }
    }
};
 
Game_Actor.prototype.getBattleChatterMessages = function(action) {
    if (action.isAttack()) {
        return ["Hyah!", "Take this!", "Here I come!", "Got you!"];
    } else if (action.isGuard()) {
        return ["Defending!", "Not today!", "Shield up!", "Bring it!"];
    } else if (action.isMagicSkill()) {
        return ["Casting...", "Magic time!", "Feel my power!", "Incantation!"];
    }
    return [];
};
 
// ============================================================================
// EXAMPLE 9: Party Member Support Comments
// ============================================================================
 
// When healing an ally:
var _Game_Action_executeHpDamage = Game_Action.prototype.executeHpDamage;
Game_Action.prototype.executeHpDamage = function(target, value) {
    _Game_Action_executeHpDamage.call(this, target, value);
    
    if (value < 0 && this.subject().isActor() && target.isActor()) {
        // Healed an ally
        var supportMessages = [
            "Hang in there!",
            "I've got you!",
            "You'll be fine!",
            "Healing!"
        ];
        var text = supportMessages[Math.floor(Math.random() * supportMessages.length)];
        
        NoqMsg.showBattleChatter(
            text,
            this.subject().faceName(),
            this.subject().faceIndex(),
            true
        );
    }
};
 
// ============================================================================
// EXAMPLE 10: Making It Work With Your Victory Results
// ============================================================================
 
// If you want to keep standard message boxes for victory results
// but use the chatter system during battle:
 
var _Scene_Battle_start = Scene_Battle.prototype.start;
Scene_Battle.prototype.start = function() {
    _Scene_Battle_start.call(this);
    // Switch to chatter mode when battle starts
    var interpreter = new Game_Interpreter();
    interpreter.pluginCommand('MsgMode', ['sidemsg']);
};
 
var _BattleManager_displayRewards = BattleManager.displayRewards;
BattleManager.displayRewards = function() {
    // Switch back to normal for victory display
    var interpreter = new Game_Interpreter();
    interpreter.pluginCommand('MsgMode', ['normal']);
    
    _BattleManager_displayRewards.call(this);
};

/* =========================
 * Sprite Logic (Scaled)
 * ========================= */
Sprite_Battler.prototype.startNoqChatter = function(text){
  this._noqChatText = String(text||'');
  this._noqChatT    = CFG.duration;

  var sW = scaled(CFG.width);
  var sH = scaled(CFG.height);

  if (!this._noqChatSprite){
    this._noqChatSprite = new Sprite(new Bitmap(sW, sH + scaled(20)));
    this._noqChatSprite.anchor.x = 0.5;
    this._noqChatSprite.anchor.y = 1.0;
    this.addChild(this._noqChatSprite);
  }

  var sp = this._noqChatSprite;
  // Anti-Mirror check for flipped sprites
  sp.scale.x = (this.scale.x < 0) ? -1 : 1;

  var b = sp.bitmap;
  b.clear();
  
  // Draw the rounded background
  var radius = scaled(CFG.borderRadius);
  b.drawNoqBubble(0, 0, sW, sH, radius, 'rgba(10,10,15,0.85)');
  
  // Draw the text
  b.fontSize     = Math.round(scaled(CFG.fontSize));
  b.textColor    = '#ffffff';
  b.outlineColor = 'rgba(0,0,0,0.8)';
  b.outlineWidth = 4;
  b.drawText(this._noqChatText, 0, 0, sW, sH, 'center');

  sp.visible = true;
  sp.opacity = 0; // Will fade in
  
  var ph = (this.bitmap && this.bitmap.height > 0) ? this.bitmap.height : 120;
  this._noqChatBaseY = -(ph * 0.8) - scaled(CFG.yOffset);
};

Sprite_Battler.prototype.updateNoqChatter = function(){
  var sp = this._noqChatSprite; if (!sp) return;

  // Hover animation
  var elapsed = CFG.duration - this._noqChatT;
  sp.y = this._noqChatBaseY + Math.sin(elapsed / 15) * scaled(CFG.bounce);

  // Fade In/Out
  if (this._noqChatT > CFG.duration - 10){
     sp.opacity += 25; // Quick fade in
  } else if (this._noqChatT <= 20){
    sp.opacity = Math.max(0, Math.floor((this._noqChatT / 20) * 255));
  } else {
     sp.opacity = 255;
  }

  this._noqChatT--;
  if (this._noqChatT <= 0) sp.visible = false;
};

var _SB_update = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function(){
  _SB_update.call(this);
  if (this._noqChatT > 0) this.updateNoqChatter();
};

/* =========================
 * Basic Logic Hooks (Same as before)
 * ========================= */
var _GB_useItem = Game_Battler.prototype.useItem;
Game_Battler.prototype.useItem = function(item){
  _GB_useItem.call(this, item);
  try {
    var src = battlerData(this);
    var txt = pick(metaList(item,'chatter') || metaList(src, 'chatter'));
    if (!txt) txt = pick(["Take this!", "Here I go!", "Strike!"]);
    this.noqEnqueueChatter(txt, 30);
  } catch(e) {}
};

var _GB_addState = Game_Battler.prototype.addState;
Game_Battler.prototype.addState = function(stateId){
  _GB_addState.call(this, stateId);
  var UBS_ID = (window.UBS && window.UBS.DEFAULT_BURNOUT_STATE_ID) || 17;
  if (stateId === UBS_ID) this.noqEnqueueChatter("I'm overheating!", 120);
};

})();