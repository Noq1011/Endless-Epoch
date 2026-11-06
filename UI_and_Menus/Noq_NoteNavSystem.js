/*:
 * @plugindesc v1.5 Endless Epoch - Musical Resonance Guide & Navigation
 * @author You / Gemini
 *
 * @param Guide Key Code
 * @desc Virtual key code for the Guide Button (Default: 86 = 'V' key, to avoid 'C' HUD conflict)
 * @default 86
 *
 * @param Burnout Gain Speed
 * @desc Amount of Burnout (TP) gained per frame while holding the guide key.
 * @default 0.4
 *
 * @param Burnout State ID
 * @desc The State ID applied when Burnout reaches 100% (Matches lockpicking state ID).
 * @default 17
 *
 * @param Note Icon Index
 * @desc The icon index in IconSet.png used for the musical note sprite.
 * @default 192
 *
 * @param Guide SE
 * @desc Sound effect played when spawning a resonance note.
 * @default Bell1
 *
 * @help
 * ============================================================================
 * ■ ENDLESS EPOCH - MUSICAL RESONANCE GUIDE (v1.5)
 * ============================================================================
 * 
 * SCRIPT CALLS & PLUGIN COMMANDS:
 * ----------------------------------------------------------------------------
 * Plugin Command:
 *   SetAttunement X         # Sets active frequency (0 = Quests, 1 = Chests,
 *                           # 2 = Elites, 3 = Lore/Secrets)
 *
 * Script Calls:
 *   $gameSystem.setAttunement(frequencyId);
 *   $gameSystem.getAttunement();
 *
 * FREQUENCY MODES:
 * ----------------------------------------------------------------------------
 * • Frequency 0 (Quest Target): Auto-hooks into NoqChronicleQuestSystem.
 *   Finds current tracked quest target events on the current map or across maps.
 * • Frequency 1 (Treasure): Auto-scans map events containing Gold/Items/Gear.
 * • Frequency 2 (Elites): Auto-scans map events with Battle Processing.
 * • Frequency 3 (Lore): Auto-scans inspectable text events with no transfers/loot.
 *
 * MAP GRAPH AUTO-SCAN:
 * ----------------------------------------------------------------------------
 * Inter-map connections are scanned automatically whenever a map loads by
 * analyzing event Transfer commands (Code 201). No manual setup required.
 * ============================================================================
 */

(function() {

    var parameters = PluginManager.parameters('EE_MusicalGuide');
    var GUIDE_KEY_CODE = Number(parameters['Guide Key Code'] || 86);
    var BURNOUT_GAIN = Number(parameters['Burnout Gain Speed'] || 0.4);
    var BURNOUT_STATE_ID = Number(parameters['Burnout State ID'] || 17);
    var NOTE_ICON_INDEX = Number(parameters['Note Icon Index'] || 192);
    var SE_GUIDE = String(parameters['Guide SE'] || 'Bell1');

    // Map physical key code to Input mapper
    Input.keyMapper[GUIDE_KEY_CODE] = 'resonance_guide';

    // ========================================================================
    // GAME SYSTEM DATA & MAP GRAPH ENGINE
    // ========================================================================
    var _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._currentFrequency = 0; // 0 = Quests, 1 = Chests, 2 = Elites, 3 = Lore
        this._mapGraph = {};        // Dynamic graph: { mapId: [ { targetMapId, x, y }, ... ] }
    };

    Game_System.prototype.setAttunement = function(freq) {
        this._currentFrequency = Number(freq || 0);
    };

    Game_System.prototype.getAttunement = function() {
        return this._currentFrequency || 0;
    };

    Game_System.prototype.addMapConnection = function(fromMap, toMap, x, y) {
        if (!this._mapGraph[fromMap]) {
            this._mapGraph[fromMap] = [];
        }
        
        var connections = this._mapGraph[fromMap];
        for (var i = 0; i < connections.length; i++) {
            if (connections[i].targetMapId === toMap && connections[i].x === x && connections[i].y === y) {
                return; // Duplicate guard
            }
        }
        
        connections.push({ targetMapId: toMap, x: x, y: y });
    };

    /**
     * Auto-scans map events on load for player transfers (Code 201)
     */
    Game_System.prototype.scanMapTransfers = function() {
        var currentMapId = $gameMap.mapId();
        if (!this._mapGraph) this._mapGraph = {};
        if (!this._mapGraph[currentMapId]) this._mapGraph[currentMapId] = [];

        var events = $gameMap.events();
        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (!ev || !ev.page()) continue;

            var list = ev.page().list;
            if (!list) continue;

            for (var c = 0; c < list.length; c++) {
                var cmd = list[c];
                if (cmd.code === 201) { // Transfer Player
                    var targetMapId = cmd.parameters[1];
                    this.addMapConnection(currentMapId, targetMapId, ev.x, ev.y);
                }
            }
        }
    };

    /**
     * Breadth-First Search (BFS) graph pathfinding across multi-exit connected maps
     */
    Game_System.prototype.findMapPath = function(startMapId, targetMapId) {
        if (startMapId === targetMapId) return [startMapId];

        var queue = [[startMapId]];
        var visited = {};
        visited[startMapId] = true;

        while (queue.length > 0) {
            var path = queue.shift();
            var currentMap = path[path.length - 1];

            if (currentMap === targetMapId) {
                return path;
            }

            var neighbors = this._mapGraph[currentMap] || [];
            for (var i = 0; i < neighbors.length; i++) {
                var nextMap = neighbors[i].targetMapId;
                if (!visited[nextMap]) {
                    visited[nextMap] = true;
                    var newPath = path.slice();
                    newPath.push(nextMap);
                    queue.push(newPath);
                }
            }
        }
        return null;
    };

    // Auto-scan on map setup
    var _Game_Map_setup = Game_Map.prototype.setup;
    Game_Map.prototype.setup = function(mapId) {
        _Game_Map_setup.call(this, mapId);
        if ($gameSystem) {
            $gameSystem.scanMapTransfers();
        }
    };

    // ========================================================================
    // INTEGRATED FREQUENCY RESOLVER ENGINE
    // ========================================================================
    function FrequencyResolver() {}

    FrequencyResolver.getActiveTarget = function() {
        var freq = $gameSystem.getAttunement();

        switch (freq) {
            case 0:
                return this.getQuestTarget();
            case 1:
                return this.getNearestMapTarget(1);
            case 2:
                return this.getNearestMapTarget(2);
            case 3:
                return this.getNearestMapTarget(3);
            default:
                return null;
        }
    };

    /**
     * Cross-functionality hook for NoqChronicleQuestSystem.js
     */
// ============================================================================
// GLOBAL QUEST MARKER REGISTRY & DYNAMIC RESOLVER
// ============================================================================

var _Game_System_initialize_QuestRegistry = Game_System.prototype.initialize;
Game_System.prototype.initialize = function() {
    _Game_System_initialize_QuestRegistry.call(this);
    this._questMarkerRegistry = {}; // Format: { "questId_stage": { mapId: N, x: X, y: Y } }
};

/**
 * Scans and caches all quest markers on current map into global registry
 */
Game_System.prototype.registerMapQuestMarkers = function() {
    if (!this._questMarkerRegistry) this._questMarkerRegistry = {};
    var mapId = $gameMap.mapId();
    var events = $gameMap.events();

    for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (!ev || !ev.page()) continue;

        var note = ev.event().note || "";
        var comment = "";
        var list = ev.list();
        if (list) {
            for (var c = 0; c < list.length; c++) {
                if (list[c].code === 108 || list[c].code === 408) {
                    comment += list[c].parameters[0];
                }
            }
        }

        var tag = note.match(/<QuestMarker:\s*(\w+),\s*(\d+)(?:,\s*(\d+))?>/i) || 
                  comment.match(/<QuestMarker:\s*(\w+),\s*(\d+)(?:,\s*(\d+))?>/i);

        if (tag) {
            var qId = tag[1];
            var stage = Number(tag[2]);
            var key = qId + "_" + stage;
            this._questMarkerRegistry[key] = {
                mapId: mapId,
                x: ev.x,
                y: ev.y
            };
        }
    }
};

// Hook map setup to register quest markers alongside transfer exits
var _Game_Map_setup_QuestPatch = Game_Map.prototype.setup;
Game_Map.prototype.setup = function(mapId) {
    _Game_Map_setup_QuestPatch.call(this, mapId);
    if ($gameSystem) {
        $gameSystem.scanMapTransfers();
        $gameSystem.registerMapQuestMarkers();
    }
};

/**
 * Live Quest Target Resolver: Evaluates active tracked quest instantly
 */
FrequencyResolver.getQuestTarget = function() {
    var qId = $gameSystem._trackedQuest;
    if (!qId || $gameSystem._questStatus[qId] !== 'active') return null;

    var currentStage = $gameSystem._questProgress[qId] || 1;
    var events = $gameMap.events();

    // 1. Live scan current map first
    for (var i = 0; i < events.length; i++) {
        var ev = events[i];
        if (!ev || !ev.page()) continue;

        var note = ev.event().note || "";
        var comment = "";
        var list = ev.list();
        if (list) {
            for (var c = 0; c < list.length; c++) {
                if (list[c].code === 108 || list[c].code === 408) {
                    comment += list[c].parameters[0];
                }
            }
        }

        var tag = note.match(/<QuestMarker:\s*(\w+),\s*(\d+)(?:,\s*(\d+))?>/i) || 
                  comment.match(/<QuestMarker:\s*(\w+),\s*(\d+)(?:,\s*(\d+))?>/i);

        if (tag && tag[1] === qId && Number(tag[2]) === currentStage) {
            var objIdx = tag[3] !== undefined ? Number(tag[3]) : null;
            var isDone = false;

            if (objIdx !== null && typeof Quest !== 'undefined') {
                var pVal = Quest.getProgress(qId, objIdx);
                var questData = Quest.Database[qId];
                if (questData && questData.stages[currentStage] && questData.stages[currentStage].objectives[objIdx]) {
                    var maxVal = questData.stages[currentStage].objectives[objIdx].max || 1;
                    if (pVal >= maxVal) isDone = true;
                }
            }

            if (!isDone) {
                return { mapId: $gameMap.mapId(), x: ev.x, y: ev.y };
            }
        }
    }

    // 2. Look up global registry if target event is on another map
    var registryKey = qId + "_" + currentStage;
    if ($gameSystem._questMarkerRegistry && $gameSystem._questMarkerRegistry[registryKey]) {
        return $gameSystem._questMarkerRegistry[registryKey];
    }

    // 3. Fallback: Check custom objective map variables (Variables 10 = MapID, 11 = X, 12 = Y)
    if ($gameVariables.value(10) > 0) {
        return {
            mapId: $gameVariables.value(10),
            x: $gameVariables.value(11),
            y: $gameVariables.value(12)
        };
    }

    return null;
};

    /**
     * Dynamic Scanner for Chests (1), Elites (2), and Lore (3)
     */
    FrequencyResolver.getNearestMapTarget = function(freqId) {
        var events = $gameMap.events();
        var nearest = null;
        var minDist = 9999;
        var pX = $gamePlayer.x;
        var pY = $gamePlayer.y;

        for (var i = 0; i < events.length; i++) {
            var ev = events[i];
            if (!ev || !ev.page()) continue;

            var eventId = ev.eventId();
            var mapId = $gameMap.mapId();

            // Ignore completed events (Self Switch A is ON)
            if ($gameSelfSwitches.value([mapId, eventId, 'A'])) continue;

            var note = ev.event().note || "";
            if (note.indexOf('<IgnoreGuide>') !== -1) continue;

            var list = ev.page().list;
            if (!list) continue;

            var matches = false;
            var hasLoot = false;
            var hasBattle = false;
            var hasText = false;
            var hasTransfer = false;

            for (var c = 0; c < list.length; c++) {
                var code = list[c].code;
                if (code === 125 || code === 126 || code === 127 || code === 128) hasLoot = true;
                if (code === 301) hasBattle = true;
                if (code === 101) hasText = true;
                if (code === 201) hasTransfer = true;
            }

            if (note.indexOf('<Freq:' + freqId + '>') !== -1) {
                matches = true;
            } else if (freqId === 1 && (hasLoot || this.isChestGraphic(ev.page()))) {
                matches = true;
            } else if (freqId === 2 && hasBattle) {
                matches = true;
            } else if (freqId === 3 && (hasText && !hasLoot && !hasBattle && !hasTransfer)) {
                matches = true;
            }

            if (matches) {
                var dist = Math.abs(ev.x - pX) + Math.abs(ev.y - pY);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = { mapId: mapId, x: ev.x, y: ev.y };
                }
            }
        }

        return nearest;
    };

    FrequencyResolver.isChestGraphic = function(page) {
        if (!page || !page.image) return false;
        var name = page.image.characterName.toLowerCase();
        return name.indexOf('chest') !== -1 || name.indexOf('package') !== -1;
    };

    // ========================================================================
    // MUSICAL NOTE SPRITE
    // ========================================================================
    function Sprite_ResonanceNote() {
        this.initialize.apply(this, arguments);
    }
    Sprite_ResonanceNote.prototype = Object.create(Sprite.prototype);
    Sprite_ResonanceNote.prototype.constructor = Sprite_ResonanceNote;

    Sprite_ResonanceNote.prototype.initialize = function(targetTileX, targetTileY) {
        Sprite.prototype.initialize.call(this);
        this.bitmap = ImageManager.loadSystem('IconSet');
        
        var iconIndex = NOTE_ICON_INDEX;
        var pw = Window_Base._iconWidth || 32;
        var ph = Window_Base._iconHeight || 32;
        var sx = (iconIndex % 16) * pw;
        var sy = Math.floor(iconIndex / 16) * ph;
        this.setFrame(sx, sy, pw, ph);

        this.anchor.x = 0.5;
        this.anchor.y = 0.5;

        this.x = $gamePlayer.screenX();
        this.y = $gamePlayer.screenY() - 24;

        this._targetX = targetTileX;
        this._targetY = targetTileY;
        this._life = 80;
        this._speed = 4.0;
    };

    Sprite_ResonanceNote.prototype.update = function() {
        Sprite.prototype.update.call(this);

        var targetScreenX = $gameMap.adjustX(this._targetX) * $gameMap.tileWidth() + ($gameMap.tileWidth() / 2);
        var targetScreenY = $gameMap.adjustY(this._targetY) * $gameMap.tileHeight() + ($gameMap.tileHeight() / 2);

        var dx = targetScreenX - this.x;
        var dy = targetScreenY - this.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 6) {
            this.x += (dx / dist) * this._speed;
            this.y += (dy / dist) * this._speed;
        }

        this._life--;
        this.opacity = (this._life / 80) * 255;

        if (this._life <= 0 && this.parent) {
            this.parent.removeChild(this);
        }
    };

    // ========================================================================
    // SCENE MAP INPUT & BURNOUT UNIFORMITY HOOKS
    // ========================================================================
    var _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        this.updateResonanceGuideInput();
    };

    Scene_Map.prototype.updateResonanceGuideInput = function() {
        var leader = $gameParty.leader();
        if (!leader) return;

        // Burnout Lockout Check (State 17 Uniformity)
        var isBurnedOut = leader.isStateAffected(BURNOUT_STATE_ID);

        if (Input.isPressed('resonance_guide')) {
            if (isBurnedOut) {
                if (Graphics.frameCount % 30 === 0) {
                    SoundManager.playBuzzer();
                }
                return;
            }

            // Build Burnout (TP) on active leader while holding
            leader.gainTp(BURNOUT_GAIN);

            // Check if holding maxed out TP / caused Burnout state
            if (leader.tp >= leader.tpLimit()) {
                leader.addState(BURNOUT_STATE_ID);
                SoundManager.playBuzzer();
                $gameMessage.add(leader.name() + "'s ears ring with intense acoustic burnout!");
                return;
            }

            // Spawn note every 24 frames while held
            if (Graphics.frameCount % 24 === 0) {
                this.triggerResonancePulse();
            }
        }
    };

    Scene_Map.prototype.triggerResonancePulse = function() {
        var target = FrequencyResolver.getActiveTarget();
        if (!target) return;

        var immediateX = target.x;
        var immediateY = target.y;

        // Pathfind across inter-map transfer graph if destination is on another map
        if (target.mapId !== $gameMap.mapId()) {
            var route = $gameSystem.findMapPath($gameMap.mapId(), target.mapId);
            if (route && route.length > 1) {
                var nextMapId = route[1];
                var connections = $gameSystem._mapGraph[$gameMap.mapId()] || [];
                var foundExit = false;

                for (var i = 0; i < connections.length; i++) {
                    if (connections[i].targetMapId === nextMapId) {
                        immediateX = connections[i].x;
                        immediateY = connections[i].y;
                        foundExit = true;
                        break;
                    }
                }
                if (!foundExit) return;
            } else {
                return; // Unreachable map
            }
        }

        var noteSprite = new Sprite_ResonanceNote(immediateX, immediateY);
        this._spriteset.addChild(noteSprite);

        var pitchMod = 100 + ($gameSystem.getAttunement() * 12);
        AudioManager.playSe({ name: SE_GUIDE, volume: 50, pitch: pitchMod, pan: 0 });
    };

    // ========================================================================
    // PLUGIN COMMAND HANDLER
    // ========================================================================
    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);

        if (command.toLowerCase() === 'setattunement') {
            $gameSystem.setAttunement(args[0]);
        }
    };

})();