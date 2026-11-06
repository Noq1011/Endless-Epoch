/*:
 * @plugindesc v1.2 Adventurer's Guild - Ranked & Region-Gated Radiant Bounties
 * @author Tyson
 *
 * @param BountyZones
 * @text Bounty Zones
 * @desc Define the regions where bounties can take place.
 * @type struct<Zone>[]
 * @default []
 *
 * @param RankVariableId
 * @text Enemy Scale Variable
 * @desc The Variable ID passed to your dynamic scaling script.
 * @type variable
 * @default 242
 *
 * @param TroopVariableId
 * @text Active Troop Variable
 * @desc The Variable ID used by your Sleeper Event to spawn the boss.
 * @type variable
 * @default 243
 *
 * @param PlayerRankVariableId
 * @text Player Guild Rank Variable
 * @desc Variable tracking the player's current Guild Rank (0=D, 1=C, 2=B, 3=A, 4=S).
 * @type variable
 * @default 244
 *
 * @param GuildScoreVariableId
 * @text Guild Score Variable
 * @desc Variable tracking the total points earned from bounties.
 * @type variable
 * @default 245
 */

/*~struct~Zone:
 * @param zoneName
 * @text Zone Name
 * @desc The exact display name for the region (e.g., Weybel).
 * @type text
 * @default Weybel
 * 
 * @param mapIds
 * @text Map IDs
 * @desc A comma-separated list of Map IDs in this zone.
 * @type text
 * @default 10,11,12
 * 
 * @param validTroops
 * @text Valid Troop IDs
 * @desc A comma-separated list of Troop IDs that can be hunted here.
 * @type text
 * @default 2,3,4
 */

window.Noq = window.Noq || {};
window.Noq.Guild = window.Noq.Guild || {};

(function() {
    'use strict';

    // -------------------------
    // 1. Setup & Parameters
    // -------------------------
    var parameters = PluginManager.parameters('Noq_AdventurersGuild');
    Noq.Guild.rankVarId = Number(parameters['RankVariableId'] || 242);
    Noq.Guild.troopVarId = Number(parameters['TroopVariableId'] || 243);
    Noq.Guild.playerRankVarId = Number(parameters['PlayerRankVariableId'] || 244);
    Noq.Guild.scoreVarId = Number(parameters['GuildScoreVariableId'] || 245);
    
    Noq.Guild.zones = [];
    
    try {
        var rawZones = JSON.parse(parameters['BountyZones'] || '[]');
        for (var i = 0; i < rawZones.length; i++) {
            var z = JSON.parse(rawZones[i]);
            Noq.Guild.zones.push({
                name: z.zoneName.trim(),
                maps: z.mapIds.split(',').map(Number),
                troops: z.validTroops.split(',').map(Number)
            });
        }
    } catch (e) {
        console.error("Noq_AdventurersGuild: Error parsing Bounty Zones.", e);
    }

    var _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._activeBounty = null; 
    };

    // -------------------------
    // 2. Generation Logic (Region Gated & Rank Capped)
    // -------------------------
    
    // Pass an array of strings to restrict the board, e.g., ["Weybel", "Evergreen Forest"]
    Noq.Guild.generateBounty = function(allowedZones) {
        if ($gameSystem._activeBounty) {
            $gameMessage.add("You already have an active bounty. Finish it first!");
            return;
        }

        // 1. Region Filtering
        var validZones = [];
        if (allowedZones && allowedZones.length > 0) {
            for (var i = 0; i < Noq.Guild.zones.length; i++) {
                if (allowedZones.indexOf(Noq.Guild.zones[i].name) !== -1) {
                    validZones.push(Noq.Guild.zones[i]);
                }
            }
        } else {
            validZones = Noq.Guild.zones; // Fallback to all zones if left blank
        }

        if (validZones.length === 0) {
            $gameMessage.add("No bounties available for this region right now.");
            return;
        }

        // 2. Pick random zone and troop
        var zone = validZones[Math.floor(Math.random() * validZones.length)];
        var troopId = zone.troops[Math.floor(Math.random() * zone.troops.length)];
        var troopData = $dataTroops[troopId];
        
        if (!troopData) return;

        var enemyIds = [];
        for (var i = 0; i < troopData.members.length; i++) {
            var eId = troopData.members[i].enemyId;
            if (enemyIds.indexOf(eId) === -1) enemyIds.push(eId);
        }

        // 3. Player Rank Capping (0=D, 1=C, 2=B, 3=A, 4=S)
        var playerRank = $gameVariables.value(Noq.Guild.playerRankVarId);
        
        // Randomly assign a difficulty based on what the player is qualified for
        // e.g., A Rank 2 (B-Rank) player can roll a D, C, or B rank bounty.
        var rankInt = Math.floor(Math.random() * (playerRank + 1)); 
        
        var rankTitles = ["D", "C", "B", "A", "S"];
        var rankMods = [1, 2, 3, 4, 5]; // Passed directly to Variable 77 for Dynamic Scaling
        
        $gameVariables.setValue(Noq.Guild.troopVarId, troopId);
        $gameVariables.setValue(Noq.Guild.rankVarId, rankMods[rankInt]);
        $gameSystem._activeBountyZoneMaps = zone.maps;

        // 4. Inject Quest
        var questId = "bounty_active";
        Quest.Database[questId] = {
            title: "Rank " + rankTitles[rankInt] + " Bounty: " + zone.name,
            category: "side quests",
            stages: {
                1: {
                    log: "Hunt down the target in the " + zone.name + " region.",
                    objectives: [{
                        text: "Defeat the designated target",
                        max: 1,
                        item: 0,
                        enemies: enemyIds 
                    }]
                }
            },
            rewardMult: rankMods[rankInt]
        };

        Quest.setStage(questId, 1);
        $gameSystem._activeBounty = questId;
        
        AudioManager.playSe({ name: 'Skill1', volume: 90, pitch: 100, pan: 0 });
        $gameMessage.add("Rank " + rankTitles[rankInt] + " Bounty accepted! Head to the " + zone.name + ".");
    };

    // -------------------------
    // 3. Guildmaster Promotions
    // -------------------------
    Noq.Guild.promote = function() {
        var currentRank = $gameVariables.value(Noq.Guild.playerRankVarId);
        var rankTitles = ["Bronze (D)", "Silver (C)", "Gold (B)", "Platinum (A)", "Mythic (S)"];
        
        if (currentRank >= 4) {
            $gameMessage.add("You have already reached the highest echelon of the Guild.");
            return;
        }

        var newRank = currentRank + 1;
        $gameVariables.setValue(Noq.Guild.playerRankVarId, newRank);
        
        AudioManager.playMe({ name: 'Victory1', volume: 90, pitch: 100, pan: 0 });
        $gameMessage.add("Congratulations! You have been officially promoted to " + rankTitles[newRank] + " Rank.");
        $gameMessage.add("You are now authorized to accept higher tier bounties.");
    };

    // -------------------------
    // 4. Turn-In & Cleanup
    // -------------------------
    Noq.Guild.attemptTurnIn = function() {
        var questId = $gameSystem._activeBounty;
        
        if (!questId || !Quest.Database[questId]) {
            $gameMessage.add("You don't have any active bounties right now. Check the board!");
            return;
        }

        var data = Quest.Database[questId];
        var currentProgress = Quest.getProgress(questId, 0); 
        var requiredKills = data.stages[1].objectives[0].max;

        if (currentProgress < requiredKills) {
            $gameMessage.add("The target is still at large. Check the designated zone.");
        } else {
            // Reward Math
            var baseGold = 500;
            var payout = baseGold * data.rewardMult; 
            
            // Point Math (Index matches data.rewardMult: 1=D, 2=C, 3=B, 4=A, 5=S)
            var pointRewards = [0, 50, 150, 300, 500, 800];
            var earnedPoints = pointRewards[data.rewardMult] || 0;
            var currentScore = $gameVariables.value(Noq.Guild.scoreVarId);
            var newScore = currentScore + earnedPoints;

            // Apply Rewards
            $gameParty.gainGold(payout);
            $gameVariables.setValue(Noq.Guild.scoreVarId, newScore);

            AudioManager.playSe({ name: 'Chime2', volume: 90, pitch: 100, pan: 0 });
            $gameMessage.add("Excellent work. Here is your reward: " + payout + "G.");
            $gameMessage.add("You earned " + earnedPoints + " Guild Points! (Total: " + newScore + ")");

            // Cleanup
            delete Quest.Database[questId];
            delete $gameSystem._questStatus[questId];
            delete $gameSystem._questProgress[questId];
            if ($gameSystem._questObjProgress[questId]) {
                delete $gameSystem._questObjProgress[questId];
            }
            
            $gameSystem._activeBounty = null;
            $gameSystem._activeBountyZoneMaps = null;
            $gameVariables.setValue(Noq.Guild.rankVarId, 0); 
        }
    };

})();