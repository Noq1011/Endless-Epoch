/* Debug helper — add to your plugin's top */
(function(){
  console.log("[LivingWeapons] plugin initialising...");
  // Provide an inspector callable from F8
  window._vw_pluginStatus = function() {
    try {
      console.log("[LivingWeapons] status: OK");
      console.log("Plugin list (first 60):", PluginManager._scripts.slice(0,60));
      return true;
    } catch (e) {
      console.error("[LivingWeapons] status failed", e);
      return false;
    }
  };
})();
/*:
 * @plugindesc Living Weapons & Cursed/Holy Items Framework (TP, whispers, verse triggers, Day/Night aware)
 * @author Tyson
 *
 * @help
 * ----------------------------------------------------------------
 * NOTE TAGS USED BY THIS PLUGIN
 * ----------------------------------------------------------------
 *
 * 1) Whisper tags (custom per-item behavior)
 *    Format: <TagName: whisper>
 *    - When an equip's note contains this exact tag, the plugin
 *      looks for TagName in the WhisperItems map and runs the
 *      associated function each turn to produce whisper messages.
 *    Examples:
 *      <SubverserGloves: whisper>
 *      <EclipseSword: whisper>
 *
 *    Implementation details:
 *      - WhisperItems keys must match the tag string before ": whisper".
 *        Example key used in code: "SubverserGloves: whisper"
 *      - Whisper functions are called with (actor, enemy) and should
 *        return a string to be added via $gameMessage.add(...)
 *
 * 2) TP drain / gain tags
 *    Cursed:
 *      Format: <Cursed: tp+X>
 *      Effect: actor.gainTp(Number(X) * TP_TICK_INTERVAL) each turn
 *      Example: <Cursed: tp+5>
 *
 *    Blessed:
 *      Format: <Blessed: tp-X>
 *      Effect: actor.gainTp(-Number(X) * TP_TICK_INTERVAL) each turn
 *      Example: <Blessed: tp-3>
 *
 *    Note: These are applied per-turn on BattleManager.startTurn. The
 *    variable TP_TICK_INTERVAL (top of script) scales the tick amount.
 *
 * 3) Random Verse Trigger
 *    Format: <VerseTrigger: Skill Name, chance>
 *      - Skill Name must exactly match an entry in $dataSkills[].name
 *      - chance is a decimal compared with Math.random() (e.g. 0.05)
 *    Example:
 *      <VerseTrigger: Minor Verse, 0.05>
 *      (5% chance per turn to auto-use the skill "Minor Verse")
 *
 * ----------------------------------------------------------------
 * HOW TO ADD NEW WHISPERS
 * ----------------------------------------------------------------
 * - Add a key/value pair to the WhisperItems object in the plugin.
 *   Key should be the tag name used inside angle brackets.
 *   Example:
 *     "MyFancyBlade: whisper": function(actor, enemy) {
 *         if (enemy.enemyId() === 10) return "It hisses: 'This one bleeds easy.'";
 *         return null;
 *     }
 * - Place <MyFancyBlade: whisper> in the equipment's Note box.
 *
 * ----------------------------------------------------------------
 * NOTES & TROUBLESHOOTING
 * ----------------------------------------------------------------
 * - Place tags in the equipment's Note field (not the item description).
 * - VerseTrigger's chance is compared with Math.random(), so use 0.0–1.0.
 * - Whisper tags are exact: be careful with spacing/capitalization.
 * - TP_TICK_INTERVAL controls how many ticks per turn are applied.
 *
 */

(() => {

  const TP_TICK_INTERVAL = 1;

  const WhisperItems = {
    "SubverserGloves: whisper": (actor, enemy) => { ... },
    "EclipseSword: whisper": (actor, enemy) => { ... }
  };

  const _BattleManager_startTurn = BattleManager.startTurn;
  BattleManager.startTurn = function() {
    _BattleManager_startTurn.call(this);

    $gameParty.members().forEach(actor => {
      actor.equips().forEach(equip => {
        if (!equip || !equip.note) return;

        // WHISPERS
        for (const tag in WhisperItems) {
          if (new RegExp(`<${tag}>`, 'i').test(equip.note)) {
            $gameTroop.members().forEach(enemy => {
              const msg = WhisperItems[tag](actor, enemy);
              if (msg) $gameMessage.add(msg);
            });
          }
        }

        // TP GAIN/LOSS
        let cursed = /<Cursed:\s*tp\+(\d+)>/i.exec(equip.note);
        if (cursed) actor.gainTp(Number(cursed[1]) * TP_TICK_INTERVAL);
        let blessed = /<Blessed:\s*tp-(\d+)>/i.exec(equip.note);
        if (blessed) actor.gainTp(-Number(blessed[1]) * TP_TICK_INTERVAL);

        // VERSE TRIGGERS
        const re = /<\s*(versetrigger|versetriggerid)\s*:\s*([^,>]+)\s*,\s*([\d.]+)\s*>/gi;
        let m;
        while ((m = re.exec(equip.note)) !== null) {
          const tagType = m[1].toLowerCase();
          const arg = m[2].trim();
          const chance = parseFloat(m[3]) || 0;
          let skill = tagType === 'versetriggerid' ? $dataSkills[Number(arg)] : $dataSkills.find(s => s && s.name === arg);

          if (!skill) {
            console.warn(`[VerseTrigger] Skill not found: ${m[0]}`);
            continue;
          }

          if (Math.random() < chance) {
            const action = new Game_Action(actor);
            action.setSkill(skill.id);
            const targets = skill.scope >= 1 && skill.scope <= 4 ? $gameTroop.aliveMembers() : [actor];

            targets.forEach(t => {
              action.apply(t);
              if (skill.animationId > 0) t.requestAnimation(skill.animationId);
              $gameMessage.add(`${equip.name()} sings its verse: ${skill.name}!`);
              console.log(`[VerseTrigger] applied ${skill.name} -> ${t.name()}`);
            });
          }
        }

      }); // end equips.forEach
    }); // end members.forEach
  }; // end BattleManager.startTurn

})(); // end plugin


