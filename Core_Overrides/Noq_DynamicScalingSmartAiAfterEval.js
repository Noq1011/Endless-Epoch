/*:
 * @plugindesc v3.0 — Lore-Friendly Enemy Verse + Additive Scaling + Difficulty System 
 * @author Tyson
 *
 * @help
 * Features:
 * • Random Verse selection per enemy with element-based recolor & pulsing
 * • Hardcoded Verse elemental weaknesses (2x damage rate from opposing elements)
 * • Dynamic stat scaling (Level-based + Additive Gear Mirroring)
 * • Native Options Menu Difficulty setting (Easy, Normal, Hard)
 * • Difficulty-specific notetag overrides (<easy>, <normal>, <hard>)
 * • Stat distribution bias tags for specialized enemy roles
 * • Verse-aware skill gating (via meetsSkillConditions)
 * • YEP_BattleAICore native integration
 *
 * Enemy Notetags (Verse & Styling):
 * <Verse: Embern>          # Assigns a Verse type to the enemy
 * <VerseColor: #FFD700>   # Overrides VerseColorTable hex
 * <VersePulse>            # Softly pulses Verse color
 *
 * Enemy Notetags (Base Scaling):
 * <BaseLevel: 10>         # Baseline anchor for scaling math
 * <ScaleToPlayer: 1.2>    # Scaling multiplier relative to party average
 * <FixedLevel: 25>        # Forces scaling calculation to ignore party level
 *
 * Enemy Notetags (Difficulty Overrides):
 * <easy: 0.8>             # Multiplier override for Easy difficulty
 * <normal: fixed_10>      # Fixed level override for Normal difficulty
 * <hard: base_10>         # Base level anchor override for Hard difficulty
 * (Supports raw numbers like 1.2, fixed level like fixed_X, or base anchor like base_X)
 *
 * Enemy Notetags (Stat Distribution Roles - 30% Boost):
 * <verseStat>             # Boosts Magic Attack (MAT), Magic Defense (MDF), Luck (LUK)
 * <defenseStat>           # Boosts Max HP (MHP), Defense (DEF)
 * <attackStat>            # Boosts Attack (ATK), Max MP/Energy (MMP)
 * <speedStat>             # Boosts Agility (AGI)
 *
 * Skill Notetags:
 * <Verse: Embern>         # Gates skill usage to matching Verse
 * <Universal>             # Usable by all Verse types
 * <Scan>                  # Reveals target stats in status UI and unlocks Codex Bestiary
 */

(function() {

  // --------------------------------------------------------------
  // CONFIG (colors + pulse)
  // --------------------------------------------------------------
  var VerseColorTable = {
    Voltrend: "#9EE5FF", // Lightning
    Embern: "#FF5C33",   // Fire
    Mertide: "#33A8FF",  // Water
    Terranai: "#D4A96A", // Earth
    Caelir: "#7AFFA2",   // Air
    Umbrel: "#A55CFF",   // Dark
    Solien: "#FFF1B0",   // Light
    Ice: "#AEE8FF",
    
    // --- ADD FUTURE VERSES BELOW ---
    // Twilight:  "#AABBCC",  // (Replace hex with your desired color)
    // Aether:    "#DDEEFF",
    // Geofluxer: "#FFDDAA"
  };

  var PULSE_SPEED = 0.03;
  var PULSE_INTENSITY = 0.25;
  var DEBUG_VERSE = true;

  // --------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------
  function getInstantBurnValue(skill) {
    if (!skill || !skill.note) return 0;
    var m = skill.note.match(/<\s*InstantBurnChange\s*:\s*([+-]?\d+)\s*>/i);
    return m ? Number(m[1]) : 0;
  }
  function parseVerses(note) {
    var out = [];
    var lines = (note || "").split(/[\r\n]+/);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/<Verse:\s*(.+)>/i);
      if (m) out.push(m[1].trim());
    }
    return out;
  }
  function parseColor(note) {
    var m = (note || "").match(/<VerseColor:\s*(#[0-9A-F]{6})>/i);
    return m ? m[1] : null;
  }
  function hasPulse(note) { return /<VersePulse>/i.test(note || ""); }

  // --------------------------------------------------------------
  // ENEMY SETUP (Scaling + Verse select)
  // --------------------------------------------------------------
var _setup = Game_Enemy.prototype.setup;
Game_Enemy.prototype.setup = function(id, x, y) {
    _setup.call(this, id, x, y);
    
    this.applyScaling();
    this.pickVerse();
    this.applyResonanceScaling();
    
    // CRITICAL: Force HP/MP to recalculate with scaled stats
    this._hp = this.mhp;
    this._mp = this.mmp;
    
    // Force a refresh if available
    if (this.refresh) this.refresh();
    
   /* if (DEBUG_VERSE) {
        console.log("[ScalingDebug]", this.name(), "MHP:", this.mhp, "vs Base:", this.enemy().params[0]);
    }*/
};

  Game_Enemy.prototype.pickVerse = function(){
    var note = this.enemy().note;
    var tags = parseVerses(note);
    this._verseChoice = tags.length>0 ? tags[Math.floor(Math.random()*tags.length)] : null;
    
    // Case-insensitive lookup for color table
    if (this._verseChoice) {
      var capitalizedChoice = Object.keys(VerseColorTable).find(key => key.toLowerCase() === this._verseChoice.toLowerCase());
      this._verseColor  = parseColor(note) || (capitalizedChoice ? VerseColorTable[capitalizedChoice] : null);
    } else {
      this._verseColor = parseColor(note);
    }

    this._versePulse  = hasPulse(note);
    if (DEBUG_VERSE && this._verseChoice) //console.log("Enemy Verse:",this.name(),"→",this._verseChoice);

    this._verseAIPattern = this.buildVersePattern();
  };

  // ===================================================================
  // Verse AI v3.0 — integrates Unified Burnout System logic directly
  // ===================================================================
  Game_Enemy.prototype.buildVersePattern = function() {
	  
	      if (this._verseAIPatternCache) return this._verseAIPatternCache;
    
    var pattern = [];
    var verse = this._verseChoice;
    var actions = this.enemy().actions || [];

    var selfBurn = this.burnoutRate ? this.burnoutRate() : (this.tpRate ? this.tpRate() : 0);
    var selfFracture = this.burnoutFractureStage ? this.burnoutFractureStage() : 0;
    var selfResist = this.isBurnoutImmune ? this.isBurnoutImmune() :
                     (this.isStateResist && this.isStateResist($dataStates.findIndex(s => s && s.meta && s.meta.BurnoutResist)));

    var SAFE_ZONE = 0.35;     // <35% burnout = stable
    var CAUTION_ZONE = 0.7;   // 35–70% = moderate stress
    var DANGER_ZONE = 0.9;    // >90% = near fracture

    for (var i = 0; i < actions.length; ++i) {
      var a = actions[i];
      var skill = $dataSkills[a.skillId];
      if (!skill) continue;
      var note  = skill.note || "";
      var ok = /<Universal>/i.test(note);
      if (!ok && verse) {
        var m = note.match(/<Verse:\s*(.+)>/i);
        if (m && m[1].trim().toLowerCase() === verse.toLowerCase()) ok = true;
      }
      if (!ok) continue;

      var baseWeight = Math.max(1, a.rating || 3);
      var instantBurn = getInstantBurnValue(skill);

      // Burnout self-awareness
      if (!selfResist) {
        if (selfBurn >= DANGER_ZONE) baseWeight = Math.max(1, baseWeight - 2);
        else if (selfBurn >= CAUTION_ZONE) baseWeight -= 1;
        else if (selfBurn <= SAFE_ZONE) baseWeight += 1;
      }

      // fracture penalty
      if (selfFracture >= 2 && !selfResist) baseWeight = Math.max(1, baseWeight - 2);

      // check target gauges
      var party = $gameParty.aliveMembers();
      var avgHP = 0, avgMP = 0, avgBurn = 0;
      for (var j = 0; j < party.length; j++) {
        var t = party[j];
        avgHP += t.hpRate();
        avgMP += (t.mpRate ? t.mpRate() : 1);
        avgBurn += (t.burnoutRate ? t.burnoutRate() : (t.tpRate ? t.tpRate() : 0));
      }
      if (party.length > 0) {
        avgHP /= party.length;
        avgMP /= party.length;
        avgBurn /= party.length;
      }

      var dmgType = (skill.damage ? skill.damage.type : 0);
      var targetLine = "Random";

      // Heuristic target adjustments
      if (dmgType === 3) targetLine = "Lowest HP%";
      else if (dmgType === 1) targetLine = "Highest HP%";

      // Aggression tuning
      if (avgHP < 0.4 && dmgType === 1) baseWeight += 2; 
      if (avgMP > 0.7 && dmgType === 1) baseWeight += 1; 
      if (avgBurn > 0.7 && dmgType === 1) baseWeight += 2; 
      if (avgBurn < 0.3 && dmgType === 3) baseWeight += 1; 

      // buffs/debuffs self-use awareness
      for (var e = 0; e < skill.effects.length; e++) {
        var eff = skill.effects[e];
        if (eff.code === 21 || eff.code === 22 || eff.code === 23) {
          targetLine = "Self";
          if (selfBurn > CAUTION_ZONE) baseWeight += 2;
        }
      }

      baseWeight *= this.verseAggressionMultiplier ? this.verseAggressionMultiplier(verse) : 1.0;

      for (var r = 0; r < Math.max(1, baseWeight); r++) {
        pattern.push("Always: SKILL " + skill.id + ", " + targetLine);
      }

      // Instant Burn Awareness
      if (instantBurn !== 0) {
        if (instantBurn > 0) {
          if (selfBurn >= DANGER_ZONE) baseWeight -= 3; 
          else if (selfBurn >= CAUTION_ZONE) baseWeight -= 1;
        } else if (instantBurn < 0) {
          if (selfBurn >= CAUTION_ZONE) baseWeight += 2; 
          else if (selfBurn <= SAFE_ZONE) baseWeight -= 1; 
        }
        if (instantBurn > 0 && avgBurn > 0.7) baseWeight += 2; 
        if (instantBurn < 0 && avgBurn > 0.7) baseWeight -= 2; 
      } 
    }

    // fallback
    var atkId = this.attackSkillId();
    if (atkId) pattern.push("Always: SKILL " + atkId + ", Random");
	
	this._verseAIPatternCache = pattern;

    if (DEBUG_VERSE) {
      console.log("[VerseAI] Burnout-aware pattern for", this.name(),
        "burnout:", Math.round(selfBurn * 100) + "% fracture:", selfFracture,
        "→", pattern);
    }
    return pattern;
  };

// --------------------------------------------------------------
// DYNAMIC SCALING w/ DIFFICULTY TAGS & ADDITIVE GEAR MIRRORING
// --------------------------------------------------------------
Game_Enemy.prototype.applyScaling = function(){
    var note = this.enemy().note || "";
    var members = $gameParty.aliveMembers();
    if (members.length === 0) members = $gameParty.members(); 

    if (members.length === 0) {
        this._scaledStats = {};
        for(var i=0; i<8; i++) this._scaledStats[i] = this.enemy().params[i];
        return;
    }
    
    var maxLvl = Math.max.apply(null, members.map(function(actor) { return actor.level; }));
    var minLvl = Math.min.apply(null, members.map(function(actor) { return actor.level; }));
    var avgLvl = (maxLvl + minLvl) / 2;

    // 1. Establish Default Fallbacks (used if no difficulty-specific tag is found)
    var baseMatch = note.match(/<BaseLevel:\s*(\d+)>/i);
    var fixMatch  = note.match(/<FixedLevel:\s*(\d+)>/i);
    var scaleMatch= note.match(/<ScaleToPlayer:\s*(\d+(\.\d+)?)>/i);
    
    var baseLevel = baseMatch ? Number(baseMatch[1]) : 10;
    var fixedLevel = fixMatch ? Number(fixMatch[1]) : null;
    var scaleMult = scaleMatch ? Number(scaleMatch[1]) : 1.0;

    // 2. Read the Current Difficulty Setting (Or Bounty Override)
    var diffLabel = "";
    var gearDifficultyMod = 1.0;
    
    // Check if a Bounty Rank is currently active in your scaling variable
    var bountyRank = $gameVariables.value(77); 
    
    if (bountyRank > 0) {
        // Force the difficulty label based on the bounty rank (1 to 5)
        var labels = ["", "very easy", "easy", "normal", "hard", "very hard"];
        var gearMods = [1.0, 0.5, 0.7, 1.0, 1.3, 1.6]; // Adjust these gear borrow multipliers as needed
        
        diffLabel = labels[bountyRank];
        gearDifficultyMod = gearMods[bountyRank];
    } else {
        // Standard Config Settings for normal battles
        var diffLevel = ConfigManager.difficultyLevel !== undefined ? ConfigManager.difficultyLevel : 1;
        diffLabel = diffLevel === 0 ? "easy" : (diffLevel === 1 ? "normal" : "hard");
        gearDifficultyMod = diffLevel === 0 ? 0.7 : (diffLevel === 1 ? 1.0 : 1.3);
    }

    // 3. Search for Difficulty Overrides using the determined diffLabel
    var regex = new RegExp("<" + diffLabel + ":\\s*([^>]+)>", "i");
    var diffMatch = note.match(regex);

    if (diffMatch) {
        var diffValue = diffMatch[1].trim().toLowerCase();
        
        if (diffValue.includes("fixed_")) {
            fixedLevel = Number(diffValue.replace("fixed_", ""));
        } else if (diffValue.includes("base_")) {
            baseLevel = Number(diffValue.replace("base_", ""));
        } else {
            scaleMult = Number(diffValue); // e.g., 0.8, 1.0, 1.3
        }
    }

    // 4. Calculate Final Multiplier
    var levelToUse = (fixedLevel !== null) ? fixedLevel : avgLvl;
    this._scaleMultiplier = scaleMult * (levelToUse / baseLevel);
    
    // --- BOUNTY RANK INJECTION ---
    var bountyMod = $gameVariables.value(77); 
    if (bountyMod > 0) {
        this._scaleMultiplier *= (bountyMod / 100);
    }
    
    // 5. --- ADDITIVE GEAR MIRRORING ---
    var gearWeights = [
        0.4, 0.3, 0.6, 0.4, 0.6, 0.4, 0.5, 0.3
    ];

    var partyFlatGearBonus = [];
    for(var i = 0; i < 8; i++) {
        var totalBonus = 0;
        for(var m = 0; m < members.length; m++) {
            totalBonus += Math.max(0, members[m].param(i) - members[m].paramBase(i));
        }
        var avgBonus = totalBonus / members.length;
        // Apply the base weight AND the difficulty modifier!
        partyFlatGearBonus[i] = avgBonus * gearWeights[i] * gearDifficultyMod;
    }

    // 6. Final Stat Construction
    var isVerseStat   = /<verseStat>/i.test(note);
    var isDefenseStat = /<defenseStat>/i.test(note);
    var isAttackStat  = /<attackStat>/i.test(note);
    var isSpeedStat   = /<speedStat>/i.test(note);

    this._scaledStats = {};
    for(var i=0; i<8; i++){
        var baseParam = this.enemy().params[i];
        var scaledBase = baseParam * this._scaleMultiplier;
        var finalValue = scaledBase + partyFlatGearBonus[i];

        if (isVerseStat && (i === 4 || i === 5 || i === 7)) finalValue *= 1.3;
        if (isDefenseStat && (i === 0 || i === 3)) finalValue *= 1.3;
        if (isAttackStat && (i === 2 || i === 1)) finalValue *= 1.3;
        if (isSpeedStat && (i === 6)) finalValue *= 1.3;

        this._scaledStats[i] = Math.round(finalValue);
    }
    
    this._hp = this.mhp;
    this._mp = this.mmp;
};

  // Scale Experience
  var _GE_exp = Game_Enemy.prototype.exp;
  Game_Enemy.prototype.exp = function() {
    var baseExp = _GE_exp.call(this);
    var mult = this._scaleMultiplier || 1; 
    return Math.round(baseExp * mult); 
  };

  // Scale Gold
  var _GE_gold = Game_Enemy.prototype.gold;
  Game_Enemy.prototype.gold = function() {
    var baseGold = _GE_gold.call(this);
    var mult = this._scaleMultiplier || 1;
    return Math.round(baseGold * mult);
  };

// --------------------------------------------------------------
  // HARDCODED VERSE WEAKNESSES
  // Map your Verse Names to the Element ID that they are weak to.
  // --------------------------------------------------------------
  var VerseWeaknessTable = {
      Embern: 2,    // Example: Embern is weak to Element 3 (Mertide/Water)
      Mertide: 1,   // Mertide is weak to Element 4 (Voltrend/Lightning)
      Voltrend: 5,  // etc.
      Terranai: 3,
      Caelir: 5,
      Umbrel: 4,
      Solien: 9
  };

  var _Game_Enemy_elementRate = Game_Enemy.prototype.elementRate;
  Game_Enemy.prototype.elementRate = function(elementId) {
      var rate = _Game_Enemy_elementRate.call(this, elementId);
      // If the enemy's verse is weak to the incoming element, multiply damage by 2!
      if (this._verseChoice && VerseWeaknessTable[this._verseChoice] === elementId) {
          rate *= 2.0; 
      }
      return rate;
  };

  // --------------------------------------------------------------
  // CRITICAL FIX: Overwrite paramBase, NOT param, so buffs work!
  // --------------------------------------------------------------
  var _paramBase = Game_Enemy.prototype.paramBase;
  Game_Enemy.prototype.paramBase = function(id){
    return this._scaledStats && this._scaledStats[id] !== undefined ?
      this._scaledStats[id] : _paramBase.call(this, id);
  };

  // --------------------------------------------------------------
  // VERSE GATE (allow Attack + Universal + matching Verse)
  // --------------------------------------------------------------
  var _GE_meets = Game_Enemy.prototype.meetsSkillConditions;
  Game_Enemy.prototype.meetsSkillConditions = function(skill) {
    if (!_GE_meets.call(this, skill)) return false;
    if (skill && skill.id === this.attackSkillId()) return true;
    if (!this._verseChoice) return true;
    if (/<Universal>/i.test((skill.note||""))) return true;

    var m = (skill.note||"").match(/<Verse:\s*(.+)>/i);
    if (!m) return false;
    return m[1].trim().toLowerCase() === this._verseChoice.toLowerCase();
  };

  // --------------------------------------------------------------
  // YEP-NATIVE VERSE AI 
  // --------------------------------------------------------------
  if (Imported && Imported.YEP_BattleAICore) {
    var _YEP_setAIPattern = Game_Enemy.prototype.setAIPattern;
    Game_Enemy.prototype.setAIPattern = function() {
      if (this._verseAIPattern && this._verseAIPattern.length) {
        Game_Battler.prototype.setAIPattern.call(this);
        if (this.numActions() <= 0) return;
        if (typeof AIManager !== 'undefined') {
          AIManager.setBattler(this);
          for (var i = 0; i < this._verseAIPattern.length; ++i) {
            if (Math.random() > this.aiLevel()) continue;
            var line = this._verseAIPattern[i];
            if (AIManager.isDecidedActionAI(line)) {
              if (DEBUG_VERSE && this._actions && this._actions[0] && this._actions[0].item()) {
                console.log("[VerseAI] Decided via Verse pattern:", this.name(), "→", this._actions[0].item().name);
              }
              return; 
            }
          }
        }
        _YEP_setAIPattern.call(this);
        return;
      }
      _YEP_setAIPattern.call(this);
    };
  }

  // --------------------------------------------------------------
  // DEBUG NAME
  // --------------------------------------------------------------
  var _name = Game_Enemy.prototype.name;
  Game_Enemy.prototype.name=function(){
    var n=_name.call(this);
    if(this._verseChoice)n+=" ("+this._verseChoice+")";
    return n;
  };

  // --------------------------------------------------------------
  // SPRITE RECOLOR + PULSE
  // --------------------------------------------------------------
  var _sprUpdate=Sprite_Enemy.prototype.update;
  Sprite_Enemy.prototype.update=function(){
    _sprUpdate.call(this);this.updateVersePulse();
  };
  var _sprBitmap=Sprite_Enemy.prototype.updateBitmap;
  Sprite_Enemy.prototype.updateBitmap=function(){
    _sprBitmap.call(this);
    if(this._enemy&&this._enemy._verseColor){
      this._baseVerseColor=this._enemy._verseColor;
      this._pulseEnabled=this._enemy._versePulse;
      this._pulseFrame=0;
      var self=this;
      this.bitmap.addLoadListener(function(){self.applyVerseColor(self._baseVerseColor);});
    }
  };
  Sprite_Enemy.prototype.applyVerseColor=function(hex){
    if(!hex||!this.bitmap||!this.bitmap.isReady())return;
    var c=parseInt(hex.replace('#',''),16);
    var r=(c>>16)&255,g=(c>>8)&255,b=c&255;
    this._baseTone=[(r-128)*0.5,(g-128)*0.5,(b-128)*0.5,0];
    this.setColorTone(this._baseTone);
  };
  Sprite_Enemy.prototype.updateVersePulse=function(){
    if(!this._pulseEnabled||!this._baseTone)return;
    this._pulseFrame+=PULSE_SPEED;
    var f=(Math.sin(this._pulseFrame)*0.5+0.5)*PULSE_INTENSITY;
    this.setColorTone([
      this._baseTone[0]*f,
      this._baseTone[1]*f,
      this._baseTone[2]*f,
      0
    ]);
  };

// ============================================================================
// NOQ VERSE RESONANCE & DYNAMIC SCALING INTEGRATION
// ============================================================================
var _Game_Enemy_setup_resonanceBridge = Game_Enemy.prototype.setup;

Game_Enemy.prototype.applyResonanceScaling = function() {
    var aliveMembers = $gameParty.aliveMembers();
    if (aliveMembers.length === 0 || !this._scaledStats) return;
    
    // 1. Calculate the Party's Average Resonance (Param 7 / LUK)
    var totalResonance = 0;
    for (var i = 0; i < aliveMembers.length; i++) {
        // We get the full stat, including equipment and spent Sparks
        totalResonance += aliveMembers[i].param(7); 
    }
    var avgResonance = totalResonance / aliveMembers.length;

    // 2. Fetch the enemy's scale multiplier (from your <ScaleToPlayer: X> tag)
    var scaleMultiplier = Number(this.enemy().meta.ScaleToPlayer) || 1.0;

    // 3. Scale the Enemy's Resonance to challenge the player
    // This ensures enemies also get Resonance points dynamically
    this._scaledStats[7] = Math.round(avgResonance * scaleMultiplier);

    // 4. LORE INTEGRATION: High Party Resonance empowers enemy Verses!
    // For every 10 points of Resonance the party has, enemy Verse (MAT) and 
    // Verse Shield (MDF) gain a 1.5% power boost. 
    // (Adjust the 0.0015 to change how harsh the scaling is)
    var volatilityBoost = 1.0 + (avgResonance * 0.0015); 
    
    this._scaledStats[4] = Math.round(this._scaledStats[4] * volatilityBoost); // MAT (Verse)
    this._scaledStats[5] = Math.round(this._scaledStats[5] * volatilityBoost); // MDF (Verse Shield)
};



})();

// ===================================================================
// Verse Temperament System — personality multipliers per Verse
// ===================================================================
Game_Enemy.prototype.verseAggressionMultiplier = function(verse) {
  if (!verse) return 1.0;
  switch (verse.toLowerCase()) {
    case "embern": // Fire
      return this.burnoutRate && this.burnoutRate() > 0.8 ? 1.4 : 1.2;
    case "mertide": // Water
      return this.burnoutRate && this.burnoutRate() > 0.6 ? 0.8 : 1.0;
    case "terranai": // Earth
      return 1.0;
    case "caelir": // Air/Wind
      var avgHP = 0;
      var allies = $gameParty.aliveMembers();
      for (var i = 0; i < allies.length; i++) avgHP += allies[i].hpRate();
      avgHP = allies.length ? avgHP / allies.length : 1.0;
      return avgHP < 0.5 ? 1.3 : 1.1;
    case "solien": // Light
      return 1.0 + (this.hpRate() < 0.5 ? 0.2 : 0);
    case "umbrel": // Dark/Shadow
      return 1.1 + (this.burnoutRate && this.burnoutRate() > 0.7 ? 0.3 : 0);
    case "ice": // Methodical 
      return 0.9;
    case "voltrend": // Lightning
      return Math.random() < 0.5 ? 1.5 : 0.8;
      
    // --- ADD FUTURE VERSES BELOW ---
    // case "twilight":
    //   return 1.0; // Add custom logic later
    // case "aether":
    //   return 1.0; // Add custom logic later
    // case "geofluxer":
    //   return 1.0; // Add custom logic later

    default:
      return 1.0;
  }
  
  //=============================================================================
// DIFFICULTY SETTINGS (ConfigManager & Window_Options)
//=============================================================================

ConfigManager.difficultyLevel = 1; // 0: Easy, 1: Normal, 2: Hard

const _ConfigManager_makeData = ConfigManager.makeData;
ConfigManager.makeData = function() {
    let config = _ConfigManager_makeData.call(this);
    config.difficultyLevel = this.difficultyLevel;
    return config;
};

const _ConfigManager_applyData = ConfigManager.applyData;
ConfigManager.applyData = function(config) {
    _ConfigManager_applyData.call(this, config);
    this.difficultyLevel = config['difficultyLevel'] !== undefined ? Number(config['difficultyLevel']) : 1;
};

// Add to the Options Menu
const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
Window_Options.prototype.addGeneralOptions = function() {
    _Window_Options_addGeneralOptions.call(this);
    this.addCommand("Difficulty", 'difficultyLevel');
};

// Format the text (0 = Easy, 1 = Normal, 2 = Hard)
const _Window_Options_statusText = Window_Options.prototype.statusText;
Window_Options.prototype.statusText = function(index) {
    const symbol = this.commandSymbol(index);
    if (symbol === 'difficultyLevel') {
        const value = this.getConfigValue(symbol);
        if (value === 0) return "Easy";
        if (value === 1) return "Normal";
        if (value === 2) return "Hard";
        return "Normal";
    } else {
        return _Window_Options_statusText.call(this, index);
    }
};

// Handle pressing "OK" or the Left/Right Arrows
const _Window_Options_processOk = Window_Options.prototype.processOk;
Window_Options.prototype.processOk = function() {
    const index = this.index();
    const symbol = this.commandSymbol(index);
    if (symbol === 'difficultyLevel') {
        let value = this.getConfigValue(symbol);
        value = (value + 1) % 3; // Cycles 0 -> 1 -> 2 -> 0
        this.changeValue(symbol, value);
    } else {
        _Window_Options_processOk.call(this);
    }
};

const _Window_Options_cursorRight = Window_Options.prototype.cursorRight;
Window_Options.prototype.cursorRight = function(wrap) {
    const index = this.index();
    const symbol = this.commandSymbol(index);
    if (symbol === 'difficultyLevel') {
        let value = this.getConfigValue(symbol);
        value = (value + 1) % 3;
        this.changeValue(symbol, value);
    } else {
        _Window_Options_cursorRight.call(this, wrap);
    }
};

const _Window_Options_cursorLeft = Window_Options.prototype.cursorLeft;
Window_Options.prototype.cursorLeft = function(wrap) {
    const index = this.index();
    const symbol = this.commandSymbol(index);
    if (symbol === 'difficultyLevel') {
        let value = this.getConfigValue(symbol);
        value = (value + 2) % 3; // Subtracts 1 and wraps around cleanly
        this.changeValue(symbol, value);
    } else {
        _Window_Options_cursorLeft.call(this, wrap);
    }
};

};

