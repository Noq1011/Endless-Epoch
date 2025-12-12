/*:
 * @plugindesc (MV ES5) NoqBattleChatterPlus v2.0 — timing-safe, queued chatter with sprite auto-bind. UBS/Verse/Harmony aware. Keeps your notetags. 
 * @author Noq
 *
 * @help
 * ────────────────────────────────────────────
 * NOTE TAGS (Actors / Enemies)
 *  <chatter:SKILL_ID,Message 1,Message 2>
 *  <chatterState:STATE_ID,Message A,Message B>
 *  <chatterReady: I'm ready!,All set!>
 *  <chatterLowHp: I'm hurt!,Need help!>
 *  <chatterDeath: Tell the others...>
 *  <chatterBurnout: I'm overheating!>
 *  <chatterHarmony: Keep the rhythm!>
 *  <chatterBattleStart: Let's do this!>
 *
 * NOTE TAGS (Skills / States)
 *  <chatter: Spark!,Electrocharge!>
 *  <chatterState: You're burning!,On fire!>
 *  (Optional) <chatterOnCrit: ...>  <chatterOnHit: ...>
 *
 * PRIORITIES (higher wins if same frame; queued otherwise)
 * 100 Low HP
 *  95 Death
 *  90 Burnout
 *  85 Harmony
 *  75 Crit
 *  70 State Applied
 *  60 Skill/Item Use
 *  50 ATB Ready
 *  40 Battle Start
 *
 * DEFAULTS
 *  Cooldown between bubbles per battler: 60f
 *  Bubble duration: 60f. Queue ensures nothing is lost.
 *
 * PLUGIN COMMANDS
 *  Chatter on/off
 *  ChatterCooldown <frames>     # e.g. 60
 *  ChatterTest <actorId|enemyId> "<text>"  # quick test
 *  ChatterNow "<text>"          # pushes to current subject (if any)
 *  ChatterQueue on/off          # mirror to Battle Feed if bubble can’t show
 *
 * INTEGRATION
 *  • UBS: announces Burnout (DEFAULT_BURNOUT_STATE_ID)
 *  • VerseTrigger/Harmony: listens to window.NoqHarmonyTrigger = {battler:..., type:"unleash|harmonize|..."}
 *  • VerseTriggerLog is ignored for AUTO/SIMPLE lines (your BF handles filtering)
 *  • Falls back to:
 *      - window.NoqStateMsgPush(text,color) or window.StateMsgPush(text,color)
 *      - window.BattleFeedPush({text, kind:"vanilla"})
 *
 * This plugin is ES5 and safe with custom command UIs & ATB.
 */

var NoqBattleChatterV2 = NoqBattleChatterV2 || {};
(function(){
'use strict';

/* =========================
 * Config
 * ========================= */
var CFG = {
  enabled: true,
  cooldown: 60,          // frames between bubbles per battler
  duration: 60,          // bubble display time
  fontSize: 18,
  width: 220,
  height: 34,
  yOffset: 10,           // how far above sprite top
  bounce: 6,             // pixels
  mirrorToFeedIfNoSprite: true
};

/* =========================
 * Helpers
 * ========================= */
function asArrayCSV(text){
  if (!text) return null;
  text = String(text);
  if (text.charAt(0)==='"' && text.charAt(text.length-1)==='"') text = text.slice(1,-1);
  return text.split(',').map(function(s){return s.trim();}).filter(Boolean);
}
function parseIdList(note, key, id){
  if (!note) return null;
  var re = new RegExp("<\\s*"+key+"\\s*:\\s*"+id+"\\s*,\\s*([^>]+)>","i");
  var m = re.exec(note);
  return (m && m[1]) ? asArrayCSV(m[1]) : null;
}
function parseList(note, key){
  if (!note) return null;
  var re = new RegExp("<\\s*"+key+"\\s*:\\s*([^>]+)>","i");
  var m = re.exec(note);
  return (m && m[1]) ? asArrayCSV(m[1]) : null;
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
function callStateMsg(text, color){
  try{
    if (window.NoqStateMsgPush) return window.NoqStateMsgPush(String(text), color||"#ffffff");
    if (window.StateMsgPush)    return window.StateMsgPush(String(text), color||"#ffffff");
  }catch(e){}
}
function feedPush(objOrText){
  if (typeof window.BattleFeedPush === "function"){
    return window.BattleFeedPush(objOrText);
  }
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

/* =========================
 * Core queue + show API
 * ========================= */
Game_Battler.prototype._noqChatQueue = null;
Game_Battler.prototype._noqChatCooldown = 0;
Game_Battler.prototype._noqChatPriority = 0;

Game_Battler.prototype.noqEnqueueChatter = function(text, priority){
  if (!CFG.enabled || !text) return;
  if (!this._noqChatQueue) this._noqChatQueue = [];
  this._noqChatQueue.push({text:String(text), pr: priority||0});
};

Game_Battler.prototype.noqTryShowNextChatter = function(){
  if (!CFG.enabled) return;
  if (this._noqChatCooldown > 0) { this._noqChatCooldown--; return; }
  var q = this._noqChatQueue;
  if (!q || !q.length) return;

  // pick highest priority (stable)
  var bestIdx = 0, best = q[0];
  for (var i=1;i<q.length;i++){
    if (q[i].pr > best.pr) { bestIdx=i; best=q[i]; }
  }
  q.splice(bestIdx,1);

  // show bubble if we have/ can find a sprite
  var sprite = this._noqSprite || findSpriteForBattler(this);
  if (sprite && sprite.startNoqChatter){
    sprite.startNoqChatter(best.text);
  } else {
    // fallback routes
    callStateMsg(this.name()+": "+best.text, "#ffffff");
    if (CFG.mirrorToFeedIfNoSprite) feedPush({text:this.name()+": "+best.text, kind:"vanilla"});
  }
  this._noqChatCooldown = CFG.cooldown;
  this._noqChatPriority = 0;
};

var _GB_update = Game_Battler.prototype.update;
Game_Battler.prototype.update = function(){
  _GB_update.call(this);
  this.noqTryShowNextChatter();
};

/* =========================
 * Triggers (Battle start)
 * ========================= */
var _BM_startBattle = BattleManager.startBattle;
BattleManager.startBattle = function(){
  _BM_startBattle.call(this);
  // Delay until sprites exist (post-windows)
  setTimeout(function(){
    $gameParty.members().forEach(function(a){
      var m = pick(metaList(battlerData(a),'chatterBattleStart') || parseList(battlerData(a).note,'chatterBattleStart'));
      if (m) a.noqEnqueueChatter(m, 40);
    });
    $gameTroop.members().forEach(function(e){
      var m = pick(metaList(battlerData(e),'chatterBattleStart') || parseList(battlerData(e).note,'chatterBattleStart'));
      if (m) e.noqEnqueueChatter(m, 40);
    });
  }, 32);
};

/* =========================
 * ATB Ready (once per cycle)
 * ========================= */
Game_Battler.prototype._noqATBReadySpoken = false;
var _GB_onATBFull = Game_Battler.prototype.onATBFull;
Game_Battler.prototype.onATBFull = function(){
  if (_GB_onATBFull) _GB_onATBFull.call(this);
  if (!this._noqATBReadySpoken){
    var m = pick(metaList(battlerData(this),'chatterReady') || parseList(battlerData(this).note,'chatterReady'));
    if (m) this.noqEnqueueChatter(m, 50);
    this._noqATBReadySpoken = true;
  }
};
var _GB_onATBReset = Game_Battler.prototype.onATBReset;
Game_Battler.prototype.onATBReset = function(){
  if (_GB_onATBReset) _GB_onATBReset.call(this);
  this._noqATBReadySpoken = false;
};

/* =========================
 * Skill / Item chatter (on commit)
 * useItem fires at the correct, stable timing for custom UIs.
 * ========================= */
var _GB_useItem = Game_Battler.prototype.useItem;
Game_Battler.prototype.useItem = function(item){
  _GB_useItem.call(this, item);
  try{
    if (!item) return;
    var src = battlerData(this);
    var fromActorOrEnemy = parseIdList(src.note, 'chatter', item.id);
    var fromSkill = (DataManager.isSkill(item) ? (metaList(item,'chatter') || parseList(item.note,'chatter')) : null);
    var txt = pick(fromActorOrEnemy) || pick(fromSkill);
    if (!txt){
      // Optional extra: <chatterOnCrit> will be handled in apply (below)
      // Provide a light fallback so something speaks if you want:
      var FALLBACK = ["Here I go!","Take this!","Let's do this!"];
      txt = pick(FALLBACK);
    }
    if (txt) this.noqEnqueueChatter(txt, 60);
  }catch(e){}
};

/* =========================
 * Apply (crit + state applied)
 * ========================= */
var _GA_apply = Game_Action.prototype.apply;
Game_Action.prototype.apply = function(target){
  _GA_apply.call(this, target);
  try{
    var r = target.result(); if (!r) return;
    var it = this.item && this.item(); if (!it) return;
    var user = this.subject();

    // Crit line from item meta <chatterOnCrit: ...>
    if (r.critical){
      var critLine = pick(metaList(it,'chatterOnCrit') || parseList(it.note,'chatterOnCrit'));
      if (critLine) user.noqEnqueueChatter(critLine, 75);
    }

    // State applied lines
    var adds = r.addedStateObjects && r.addedStateObjects() || [];
    if (adds.length){
      var st = adds[0]; // first only to avoid spam
      var src = battlerData(user);
      var over = parseIdList(src.note, 'chatterState', st.id);
      var fromState = metaList(st,'chatterState') || parseList(st.note,'chatterState');
      var sTxt = pick(over) || pick(fromState);
      if (sTxt) user.noqEnqueueChatter(sTxt, 70);
    }
  }catch(e){}
};

/* =========================
 * Low HP / Burnout (UBS)
 * ========================= */
var LOW_HP = 0.50;
Game_Battler.prototype._noqLowHpFlag = false;

var _GB_regenAll = Game_Battler.prototype.regenerateAll;
Game_Battler.prototype.regenerateAll = function(){
  _GB_regenAll.call(this);

  var low = this.hpRate() <= LOW_HP;
  if (low && !this._noqLowHpFlag){
    var m = pick(metaList(battlerData(this),'chatterLowHp') || parseList(battlerData(this).note,'chatterLowHp'));
    if (m) this.noqEnqueueChatter(m, 100);
    this._noqLowHpFlag = true;
  } else if (!low){
    this._noqLowHpFlag = false;
  }
};

var _GB_addNewState = Game_Battler.prototype.addNewState;
Game_Battler.prototype.addNewState = function(stateId){
  _GB_addNewState.call(this, stateId);
  try{
    var UBS = window.UBS || {};
    if (UBS.DEFAULT_BURNOUT_STATE_ID && stateId === UBS.DEFAULT_BURNOUT_STATE_ID){
      var b = pick(metaList(battlerData(this),'chatterBurnout') || parseList(battlerData(this).note,'chatterBurnout')) || "I'm overheating!";
      this.noqEnqueueChatter(b, 90);
    }
  }catch(e){}
};

/* =========================
 * Harmony / Verse hooks
 * Expect external code to set: window.NoqHarmonyTrigger = {battler: <Game_Battler>, type: "harmonize|unleash|..."}
 * ========================= */
var _BM_update = BattleManager.update;
BattleManager.update = function(){
  _BM_update.call(this);
  try{
    if (window.NoqHarmonyTrigger && window.NoqHarmonyTrigger.battler){
      var b = window.NoqHarmonyTrigger.battler;
      var m = pick(metaList(battlerData(b),'chatterHarmony') || parseList(battlerData(b).note,'chatterHarmony')) || "Keep the rhythm!";
      b.noqEnqueueChatter(m, 85);
      window.NoqHarmonyTrigger = null;
    }
  }catch(e){}
};

/* =========================
 * Death chatter
 * ========================= */
var _GB_collapse = Game_Battler.prototype.performCollapse;
Game_Battler.prototype.performCollapse = function(){
  try{
    var d = pick(metaList(battlerData(this),'chatterDeath') || parseList(battlerData(this).note,'chatterDeath'));
    if (d) this.noqEnqueueChatter(d, 95);
  }catch(e){}
  _GB_collapse.call(this);
};

/* =========================
 * Sprite binding + bubble
 * ========================= */
var _SSB_createActors = Spriteset_Battle.prototype.createActors;
Spriteset_Battle.prototype.createActors = function(){
  _SSB_createActors.call(this);
  (this._actorSprites||[]).forEach(function(s){ if (s && s._battler) s._battler._noqSprite = s; });
};
var _SSB_createEnemies = Spriteset_Battle.prototype.createEnemies;
Spriteset_Battle.prototype.createEnemies = function(){
  _SSB_createEnemies.call(this);
  (this._enemySprites||[]).forEach(function(s){ if (s && s._battler) s._battler._noqSprite = s; });
};

// Extra safety: bind during the first ~2 seconds
var _SSB_update = Spriteset_Battle.prototype.update;
Spriteset_Battle.prototype.update = function(){
  _SSB_update.call(this);
  if (Graphics.frameCount < 120 && Graphics.frameCount % 5 === 0){
    var arr = (this._actorSprites||[]).concat(this._enemySprites||[]);
    for (var i=0;i<arr.length;i++){
      var s = arr[i];
      if (s && s._battler && !s._battler._noqSprite) s._battler._noqSprite = s;
    }
  }
};

// Bubble drawable (lightweight)
var _SB_init = Sprite_Battler.prototype.initialize;
Sprite_Battler.prototype.initialize = function(b){ _SB_init.call(this,b); this._noqChatT = 0; };

Sprite_Battler.prototype.startNoqChatter = function(text){
  this._noqChatText = String(text||"");
  this._noqChatT = CFG.duration;

  if (!this._noqChatSprite){
    var bmp = new Bitmap(CFG.width, CFG.height);
    bmp.fontSize = CFG.fontSize;
    var sp = new Sprite(bmp);
    sp.y = -this.height - CFG.yOffset;
    sp.anchor.x = 0.5; sp.anchor.y = 1.0;
    this._noqChatSprite = sp;
    this.addChild(sp);
  }
};

Sprite_Battler.prototype.updateNoqChatter = function(){
  var sp = this._noqChatSprite; if (!sp) return;
  var bmp = sp.bitmap; bmp.clear();

  // Simple background
  bmp.fillRect(0, 0, CFG.width, CFG.height, "rgba(0,0,0,0.35)");
  var e = (CFG.duration - this._noqChatT);
  var bob = Math.sin(e/10) * CFG.bounce;

  bmp.textColor = "#ffffff";
  bmp.outlineColor = "rgba(0,0,0,0.75)";
  bmp.outlineWidth = 3;
  bmp.drawText(this._noqChatText, 6, 4 + bob, CFG.width-12, CFG.height-8, "center");

  this._noqChatT--;
  if (this._noqChatT <= 0){
    this.removeChild(sp);
    bmp.clear(); this._noqChatSprite = null;
    this._noqChatText = "";
  }
};

var _SB_update = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function(){
  _SB_update.call(this);
  if (this._noqChatT > 0) this.updateNoqChatter();
};

/* =========================
 * Plugin Commands
 * ========================= */
var _GIp = Game_Interpreter.prototype.pluginCommand;
Game_Interpreter.prototype.pluginCommand = function(cmd, args){
  _GIp.call(this, cmd, args);
  cmd = (cmd||"").toLowerCase();

  if (cmd === "chatter"){
    NoqBattleChatterV2.enabled = CFG.enabled = (String(args[0]).toLowerCase()==="on");
  } else if (cmd === "chattercooldown"){
    if (args[0]) CFG.cooldown = Number(args[0]);
  } else if (cmd === "chatterqueue"){
    CFG.mirrorToFeedIfNoSprite = (String(args[0]).toLowerCase()==="on");
  } else if (cmd === "chattertest"){
    // ChatterTest <actorId|enemyId> "Hello!"
    var id = Number(args[0]||0);
    var text = args.slice(1).join(" ").replace(/^"(.*)"$/,'$1');
    if ($gameParty && id>0){
      var a = $gameActors.actor(id);
      if (a) a.noqEnqueueChatter(text, 60);
    } else if ($gameTroop && id<0){
      var eIndex = Math.abs(id)-1;
      var e = $gameTroop.members()[eIndex];
      if (e) e.noqEnqueueChatter(text, 60);
    }
  } else if (cmd === "chatternow"){
    var t = args.join(" ").replace(/^"(.*)"$/,'$1');
    var subj = BattleManager && BattleManager._subject;
    if (subj) subj.noqEnqueueChatter(t, 80);
  }
};

})();