/*:
 * @plugindesc v3.1 Noq Chronicle Quest System
 * @author You / Gemini
 *
 * @param QuestList
 * @text Quest Database
 * @type struct<Quest>[]
 * @default []
 *
 * @help
 * ============================================================================
 * ■ NOQ CHRONICLE QUEST SYSTEM - REFERENCE GUIDE
 * ============================================================================
 * * --- SCRIPT CALLS (Event Commands -> Page 3 -> Script) ---
 * * 1. START OR CHANGE STAGE:
 * Quest.setStage("quest_id", stage_number);
 * Example: Quest.setStage("forest_herbs", 1);
 *
 * 2. ADD PROGRESS (With Stage Safeguard):
 * Quest.addProgress("quest_id", required_stage, objective_index, count);
 * Example: Quest.addProgress("forest_herbs", 1, 0, 1);
 * (This will only count if the player is currently on stage 1)
 *
 * 3. COMPLETE QUEST MANUALLY:
 * Quest.complete("quest_id");
 *
 * 4. CHANGE HUD TRACKING:
 * Quest.track("quest_id");
 *
 * --- CONDITIONAL BRANCHES (Script Checks) ---
 * * Use these in Conditional Branch -> Page 4 -> Script:
 *
 * • Is the player currently ON a specific stage?
 * $gameSystem._questProgress['quest_id'] === 3
 *
 * • Has the player COMPLETED a specific stage?
 * $gameSystem._questProgress['quest_id'] > 3
 *
 * • Is the player AT LEAST on this stage?
 * $gameSystem._questProgress['quest_id'] >= 2
 *
 * • Is the quest COMPLETELY finished?
 * $gameSystem._questStatus['quest_id'] === 'completed'
 *
 * • Is the quest currently ACTIVE?
 * $gameSystem._questStatus['quest_id'] === 'active'
 *
 * --- NPC QUEST MARKERS ---
 * * Place these in Event Note tags OR as a Comment on an event page:
 *
 * • Standard Stage Marker:
 * <QuestMarker: quest_id, stage_number>
 *
 * • Objective Specific Marker (Hides when objective index is done):
 * <QuestMarker: quest_id, stage_number, objective_index>
 *
 * • Yellow Marker: Shows if the quest is currently tracked in HUD.
 * • White Marker: Shows if the quest is active but not tracked.
 * • Question Mark: Shows if a comment contains "Quest.setStage" for 
 * Stage 1 and the quest hasn't started yet.
 *
 * --- DATABASE SETUP TIPS ---
 * * • ID: Use simple strings like "main_01" or "kill_wolves". No spaces.
 * • OBJECTIVE INDEX: In script calls, the first objective is 0, the second is 1.
 * • CATEGORIES: main quest, side quests, companion quests.
 * ============================================================================
 */

/*~struct~Quest:
 * @param id
 * @param title
 * @param category
 * @type select
 * @option main quest
 * @option side quests
 * @option companion quests
 * @default main quest
 * @param stages
 * @type struct<Stage>[]
 * @default []
 */

/*~struct~Stage:
 * @param objectives
 * @type struct<Objective>[]
 * @default []
 * @param log
 * @type note
 */

/*~struct~Objective:
 * @param text
 * @param max
 * @type number
 * @default 1
 * @param item
 * @type item
 * @default 0
 * @param enemies
 * @type string
 * @param variableId
 * @text Tracked Variable ID
 * @desc The Database Variable to track for this objective. Leave 0 if not used.
 * @type variable
 * @default 0
 */

var Quest = Quest || {};
window.Quest = Quest;

(function() {

    // --- DATABASE PARSING ---
    const parameters = PluginManager.parameters('NoqChronicleQuestSystem');
    const rawQuestList = JSON.parse(parameters['QuestList'] || '[]');
    Quest.Database = {};

    rawQuestList.forEach(qStr => {
        const q = JSON.parse(qStr);
        if (!q.id) return;
        Quest.Database[q.id] = {
            title: q.title || "Untitled Quest",
            category: (q.category || "main quest").toLowerCase(),
            stages: {}
        };
        const rawStages = JSON.parse(q.stages || '[]');
        rawStages.forEach((sStr, index) => {
            const s = JSON.parse(sStr);
            const rawObjs = JSON.parse(s.objectives || '[]');
            Quest.Database[q.id].stages[index + 1] = {
                log: s.log ? JSON.parse(s.log) : "",
                objectives: rawObjs.map(oStr => {
                    const o = JSON.parse(oStr);
                    return {
                        text: o.text || "",
                        max: Number(o.max || 1),
                        item: Number(o.item || 0),
                        enemies: (o.enemies || "").split(',').map(id => Number(id.trim())).filter(id => id > 0),
						variableId: Number(o.variableId || 0)
                    };
                })
            };
        });
    });

    // --- SYSTEM DATA ---
    const _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this._questProgress = {};      
        this._questStatus = {};        
        this._questObjProgress = {};   
        this._trackedQuest = null;     
        this._collapsedCats = []; 
		this._expandedQuests = []; // NEW: Tracks dropdown state for multi-stage quests
    };

    // --- CORE LOGIC & AUTO-UPDATE ENGINE ---
    Quest.setStage = function(id, stage) {
        if (!Quest.Database[id]) return;
        const isNew = !$gameSystem._questStatus[id];
        $gameSystem._questProgress[id] = stage;
        $gameSystem._questStatus[id] = 'active';
        if (!$gameSystem._trackedQuest) $gameSystem._trackedQuest = id;
        
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene._questNotice.show(isNew ? "Quest Started" : "Quest Updated", Quest.Database[id].title);
        }
        
        // NEW: Check if this newly set stage was already completed out-of-order
        this.checkStageCompletion(id);
    };

    Quest.complete = function(id) {
        if (!Quest.Database[id]) return;
        $gameSystem._questStatus[id] = 'completed';
        
        if (SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene._questNotice.show("Quest Completed", Quest.Database[id].title);
        }

        // NEW: Auto-Fallback Tracking
        if ($gameSystem._trackedQuest === id) {
            // Find the first available active main quest
            const activeMain = Object.keys($gameSystem._questStatus).find(qId => 
                $gameSystem._questStatus[qId] === 'active' && Quest.Database[qId].category === 'main quest'
            );
            
            // If found, track it. If undefined (none exist), it safely defaults to null.
            $gameSystem._trackedQuest = activeMain || null;
        }
    };

    Quest.track = function(id) { $gameSystem._trackedQuest = id; };

    Quest.getProgress = function(id, objIndex) {
        const stage = $gameSystem._questProgress[id];
        if (!stage || !Quest.Database[id]) return 0;
        const data = Quest.Database[id].stages[stage];
        if (!data || !data.objectives[objIndex]) return 0;
        const obj = data.objectives[objIndex];
        if (obj.item > 0) return $gameParty.numItems($dataItems[obj.item]);
        if (!$gameSystem._questObjProgress[id] || !$gameSystem._questObjProgress[id][stage]) return 0;
        return $gameSystem._questObjProgress[id][stage][objIndex] || 0;
    };

    Quest.addProgress = function(id, requiredStage, objIndex, amount) {
        const currentStage = $gameSystem._questProgress[id];
        
        // SAFEGUARD: Only add progress if the player is currently on the required stage
        if (currentStage !== requiredStage) return; 
        
        if (!$gameSystem._questObjProgress[id]) $gameSystem._questObjProgress[id] = {};
        if (!$gameSystem._questObjProgress[id][currentStage]) $gameSystem._questObjProgress[id][currentStage] = {};
        
        const currentProgress = this.getProgress(id, objIndex);
        $gameSystem._questObjProgress[id][currentStage][objIndex] = currentProgress + amount;
        
        this.checkStageCompletion(id);
    };
	
	Quest.addFutureProgress = function(id, targetStage, objIndex, amount) {
        // SAFEGUARD: If the player is currently on this stage, let the normal 
        // combat hooks handle it to prevent double-counting.
        if ($gameSystem._questProgress[id] === targetStage) return; 
        
        // 1. Initialize data structures if they don't exist yet
        if (!$gameSystem._questObjProgress[id]) $gameSystem._questObjProgress[id] = {};
        if (!$gameSystem._questObjProgress[id][targetStage]) $gameSystem._questObjProgress[id][targetStage] = {};
        
        // 2. Read existing progress directly from the target stage
        const currentProgress = $gameSystem._questObjProgress[id][targetStage][objIndex] || 0;
        
        // 3. Apply the new amount silently in the background
        $gameSystem._questObjProgress[id][targetStage][objIndex] = currentProgress + amount;
        
        // 4. Trigger the UI Notice so the player knows they achieved something
        if (Quest.Database[id] && SceneManager._scene instanceof Scene_Map) {
            SceneManager._scene._questNotice.show("Quest Updated", Quest.Database[id].title);
        }
    };

    Quest.checkStageCompletion = function(id) {
        const stage = $gameSystem._questProgress[id];
        if (!stage || !Quest.Database[id]) return;
        const data = Quest.Database[id].stages[stage];
        if (!data) return;
        const allDone = data.objectives.every((obj, i) => this.getProgress(id, i) >= obj.max);
        if (allDone) {
            if (Quest.Database[id].stages[stage + 1]) this.setStage(id, stage + 1);
            else this.complete(id);
        }
    };

    // --- HUD & NOTICE WINDOWS ---
    function Window_QuestNotice() { this.initialize.apply(this, arguments); }
    Window_QuestNotice.prototype = Object.create(Window_Base.prototype);
    Window_QuestNotice.prototype.constructor = Window_QuestNotice;
    Window_QuestNotice.prototype.initialize = function() {
        Window_Base.prototype.initialize.call(this, 20, 20, 420, 120); 
        this.opacity = 0; this.contentsOpacity = 0; this._showCount = 0;
    };
    Window_QuestNotice.prototype.show = function(header, title) {
        this.contents.clear();
        this.contents.fillRect(0, 0, this.contentsWidth(), this.contentsHeight(), "rgba(0,0,0,0.7)");
        this.contents.fontSize = 18; this.changeTextColor(this.systemColor());
        this.drawText(header, 15, 5, this.contentsWidth() - 30);
        this.contents.fontSize = 24; this.resetTextColor();
        this.drawText(title, 15, 35, this.contentsWidth() - 30);
        this._showCount = 200;
    };
    Window_QuestNotice.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._showCount > 0) { this.contentsOpacity += 15; this._showCount--; }
        else { this.contentsOpacity -= 10; }
    };

// --- HUD WINDOW ---
    function Window_QuestHUD() { this.initialize.apply(this, arguments); }
    Window_QuestHUD.prototype = Object.create(Window_Base.prototype);
    Window_QuestHUD.prototype.constructor = Window_QuestHUD;
    
    Window_QuestHUD.prototype.initialize = function() {
        Window_Base.prototype.initialize.call(this, Graphics.boxWidth - 320, 20, 300, 80);
        this.opacity = 0; // Hides the default RPG Maker window frame
        this._userVisible = true; // Default toggle state
    };

    Window_QuestHUD.prototype.refresh = function() {
        this.contents.clear();
        const qId = $gameSystem._trackedQuest;
        if (!qId || $gameSystem._questStatus[qId] !== 'active') return;
        
        const stage = $gameSystem._questProgress[qId];
        const data = Quest.Database[qId].stages[stage];
        if (!data) return;

        // Resize if needed
        const neededHeight = 45 + (data.objectives.length * 28) + 36;
        if (this.height !== neededHeight) { 
            this.height = neededHeight; 
            this.createContents(); 
        }

        // Draw the background and text
        this.contents.fillRect(0, 0, this.contentsWidth(), this.contentsHeight(), "rgba(0,0,0,0.5)");
        this.contents.fontSize = 22; 
        this.changeTextColor(this.systemColor());
        this.drawText(Quest.Database[qId].title, 10, 5, this.contentsWidth() - 20);
        
        this.contents.fontSize = 16;
        data.objectives.forEach((obj, i) => {
            const pVal = Quest.getProgress(qId, i);
            this.changeTextColor(pVal >= obj.max ? "#888888" : "#FFFFFF");
            this.drawText("• " + obj.text + (obj.max > 1 ? ` (${pVal}/${obj.max})` : ""), 15, 38 + (i * 28), this.contentsWidth() - 30);
        });
    };

    Window_QuestHUD.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        
        const qId = $gameSystem._trackedQuest;
        const isActive = qId && $gameSystem._questStatus[qId] === 'active';

        // The Master Switch: If no active quest OR toggled off by user, hide it entirely
        if (!isActive || !this._userVisible) {
            this.visible = false;
        } else {
            // Otherwise, show it and refresh every 30 frames
            this.visible = true;
            if (Graphics.frameCount % 30 === 0) this.refresh();
        }
    };

    // --- MENU UI (CODEX) ---
    function Scene_Quest() { this.initialize.apply(this, arguments); }
    Scene_Quest.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_Quest.prototype.constructor = Scene_Quest;
    Scene_Quest.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this._detailsWindow = new Window_QuestDetails(320, 0, Graphics.boxWidth - 320, Graphics.boxHeight - 110);
        this.addWindow(this._detailsWindow);
        this._listWindow = new Window_QuestList(0, 0, 320, Graphics.boxHeight - 110);
        this._listWindow.setHandler('ok', this.onListOk.bind(this));
        this._listWindow.setHandler('cancel', this.popScene.bind(this));
        this._listWindow.setHelpWindow(this._detailsWindow);
        this.addWindow(this._listWindow);
        this._footerWindow = new Window_QuestFooter(0, Graphics.boxHeight - 110, Graphics.boxWidth, 110);
        this.addWindow(this._footerWindow);
    };

    Scene_Quest.prototype.onListOk = function() {
        const item = this._listWindow.item();
        if (!item) return;

        if (item.type === 'category') {
            // Toggle Category Folder
            const idx = $gameSystem._collapsedCats.indexOf(item.name);
            if (idx > -1) $gameSystem._collapsedCats.splice(idx, 1);
            else $gameSystem._collapsedCats.push(item.name);
            
        } else if (item.type === 'quest') {
            // Toggle Quest Stage History Dropdown
            if (item.hasHistory) {
                if (!$gameSystem._expandedQuests) $gameSystem._expandedQuests = [];
                const idx = $gameSystem._expandedQuests.indexOf(item.id);
                if (idx > -1) $gameSystem._expandedQuests.splice(idx, 1);
                else $gameSystem._expandedQuests.push(item.id);
            }
            // Only allow tracking if the quest is still active
            if (item.isActive) {
                $gameSystem._trackedQuest = item.id;
                this._footerWindow.refresh();
            } else {
                SoundManager.playCancel(); // Auditory feedback that tracking is locked
            }
        } 
        
        this._listWindow.activate(); 
        this._listWindow.refresh();
    };

    function Window_QuestList() { this.initialize.apply(this, arguments); }
    Window_QuestList.prototype = Object.create(Window_Selectable.prototype);
    Window_QuestList.prototype.constructor = Window_QuestList;
    Window_QuestList.prototype.initialize = function(x,y,w,h) {
        Window_Selectable.prototype.initialize.call(this,x,y,w,h);
        this.refresh(); this.select(0); this.activate();
    };
    Window_QuestList.prototype.maxItems = function() { return this._data ? this._data.length : 0; };
    Window_QuestList.prototype.item = function() { return (this._data && this.index() >= 0) ? this._data[this.index()] : null; };
    Window_QuestList.prototype.refresh = function() { this.makeItemList(); this.createContents(); this.drawAllItems(); };
    
    Window_QuestList.prototype.makeItemList = function() {
        this._data = [];
        if (!$gameSystem._expandedQuests) $gameSystem._expandedQuests = []; // Failsafe for older saves

        const cats = ["main quest", "side quests", "companion quests", "completed"];
        cats.forEach(cat => {
            const quests = Object.keys(Quest.Database).filter(id => 
                (cat === "completed" ? $gameSystem._questStatus[id] === 'completed' : 
                Quest.Database[id].category === cat && $gameSystem._questStatus[id] === 'active')
            );
            
            if (quests.length > 0) {
                const collapsedCat = $gameSystem._collapsedCats.includes(cat);
                this._data.push({type:'category', name:cat, collapsed: collapsedCat});
                
                if (!collapsedCat) {
                    quests.forEach(id => {
                        const currentStage = $gameSystem._questProgress[id] || 1;
                        const hasHistory = currentStage > 1;
                        const isExpanded = $gameSystem._expandedQuests.includes(id);
                        const isActive = $gameSystem._questStatus[id] === 'active';

                        // Main Quest Row (Always acts as the latest stage)
                        this._data.push({
                            type: 'quest', 
                            id: id, 
                            isActive: isActive,
                            hasHistory: hasHistory,
                            isExpanded: isExpanded
                        });

                        // Dropdown Nodes (Reverse Order)
                        if (hasHistory && isExpanded) {
                            for (let s = currentStage - 1; s >= 1; s--) {
                                this._data.push({
                                    type: 'stage',
                                    id: id,
                                    stageNum: s
                                });
                            }
                        }
                    });
                }
            }
        });
    };

    Window_QuestList.prototype.drawItem = function(index) {
        const item = this._data[index]; if (!item) return;
        const rect = this.itemRectForText(index);
        
        if (item.type === 'category') {
            this.changeTextColor(this.systemColor());
            this.drawText((item.collapsed ? "▶ " : "▼ ") + item.name.toUpperCase(), rect.x, rect.y, rect.width);
        } else if (item.type === 'quest') {
            this.changeTextColor((item.isActive && $gameSystem._trackedQuest === item.id) ? "#FFD700" : "#FFFFFF");
            let prefix = "  ";
            if (item.hasHistory) prefix = item.isExpanded ? "  ▼ " : "  ▶ ";
            this.drawText(prefix + Quest.Database[item.id].title, rect.x, rect.y, rect.width);
        } else if (item.type === 'stage') {
            this.changeTextColor("#888888"); // Grayed out node
            this.drawText("      Stage " + item.stageNum, rect.x, rect.y, rect.width);
        }
    };

    Window_QuestList.prototype.updateHelp = function() {
        const item = this.item();
        if (this._helpWindow && item) this._helpWindow.setItemData(item);
    };

    function Window_QuestDetails() { this.initialize.apply(this, arguments); }
    Window_QuestDetails.prototype = Object.create(Window_Base.prototype);
    Window_QuestDetails.prototype.constructor = Window_QuestDetails;
    
    Window_QuestDetails.prototype.setItemData = function(item) {
        if (!item || item.type === 'category') {
            this.contents.clear();
            this._currentItem = null;
            return;
        }
        // Prevent redrawing if hovering over the exact same item
        if (this._currentItem && this._currentItem.id === item.id && this._currentItem.type === item.type && this._currentItem.stageNum === item.stageNum) return;
        
        this._currentItem = item;
        this.refresh();
    };
    
    Window_QuestDetails.prototype.refresh = function() {
        this.contents.clear();
        if (!this._currentItem) return;
        
        const qId = this._currentItem.id;
        const data = Quest.Database[qId];
        if (!data) return;

        let stageNum = 1;
        let isPastStage = false;

        // Determine which data to pull based on what the player is highlighting
        if (this._currentItem.type === 'stage') {
            stageNum = this._currentItem.stageNum;
            isPastStage = true;
        } else {
            stageNum = $gameSystem._questProgress[qId] || 1;
            if (this._currentItem.isActive === false) isPastStage = true; // Completed quests are entirely past stages
        }

        const stage = data.stages[stageNum];
        
        this.contents.fontSize = 32; this.changeTextColor(this.systemColor());
        this.drawText(data.title, 10, 0, this.contentsWidth());
        this.contents.fillRect(10, 45, this.contentsWidth() - 20, 2, "rgba(255,255,255,0.3)");
        
        if (!stage) return;
        this.resetTextColor(); this.contents.fontSize = 20;
        this.drawTextEx(stage.log || "No log entry available.", 10, 60);
        
        let objY = 240; this.changeTextColor(this.systemColor());
        this.drawText(isPastStage ? "COMPLETED OBJECTIVES:" : "CURRENT OBJECTIVES:", 10, objY, this.contentsWidth());
        
        stage.objectives.forEach((obj, i) => {
            // If viewing history, force the visual progress to max
            let pVal = isPastStage ? obj.max : Quest.getProgress(qId, i);
            
            this.changeTextColor(pVal >= obj.max ? "#888888" : "#FFFFFF");
            this.drawText("- " + obj.text + (obj.max > 1 ? ` (${pVal}/${obj.max})` : ""), 25, objY + 40 + (i * 32), this.contentsWidth());
        });
    };

    function Window_QuestFooter() { this.initialize.apply(this, arguments); }
    Window_QuestFooter.prototype = Object.create(Window_Base.prototype);
    Window_QuestFooter.prototype.constructor = Window_QuestFooter;
    Window_QuestFooter.prototype.initialize = function(x,y,w,h) { Window_Base.prototype.initialize.call(this,x,y,w,h); this.refresh(); };
    Window_QuestFooter.prototype.refresh = function() {
        this.contents.clear();
        const qId = $gameSystem._trackedQuest;
        
        // Final sanity check to ensure the footer doesn't render a completed quest name
        const isValidTrack = qId && $gameSystem._questStatus[qId] === 'active';

        this.contents.fontSize = 14; this.changeTextColor(this.systemColor());
        this.drawText("CURRENTLY TRACKING:", 10, 0, 400);
        this.contents.fontSize = 26; this.changeTextColor(isValidTrack ? "#FFD700" : "#666666");
        this.drawText(isValidTrack ? Quest.Database[qId].title : "No Quest Selected", 10, 30, 600);
    };

    // --- YOUR PERFECT NPC MARKER LOGIC ---
    const _Sprite_Character_update = Sprite_Character.prototype.update;
    Sprite_Character.prototype.update = function() {
        _Sprite_Character_update.call(this);
        this.updateQuestMarker();
    };

// Force markers to refresh when an event page changes (e.g., when an enemy "dies")
    const _Game_Event_setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        _Game_Event_setupPage.call(this);
        // Find the sprite associated with this event and tell it to hide the marker
        if (SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset) {
            const sprites = SceneManager._scene._spriteset._characterSprites;
            const mySprite = sprites.find(s => s._character === this);
            if (mySprite && mySprite._markerSprite) {
                mySprite._markerSprite.visible = false; // Hide immediately, update will re-show if needed
            }
        }
    };
	
	// --- HUD TOGGLE CONTROL ("C" Key) ---
    // Map the physical "C" key (Keycode 67) to the engine
    Input.keyMapper[67] = 'hud_toggle';

    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        
        // Listen for our custom mapped "C" key
        if (Input.isTriggered('hud_toggle')) {
            if (this._questHUD) {
                this._questHUD._userVisible = !this._questHUD._userVisible;
                if (this._questHUD._userVisible) this._questHUD.refresh();
                SoundManager.playCursor();
            }
        }
    };

    Sprite_Character.prototype.updateQuestMarker = function() {
        if (!this._character || !(this._character instanceof Game_Event)) return;
        if (!this._character.page || !this._character.page()) return;

        const note = this._character.event().note || "";
        let comment = "";
        const list = this._character.list();
        if (list) {
            for (let i = 0; i < list.length; i++) {
                const cmd = list[i];
                if (cmd.code === 108 || cmd.code === 408 || cmd.code === 355 || cmd.code === 655) {
                    comment += cmd.parameters[0];
                }
            }
        }

        const tag = note.match(/<QuestMarker:\s*(\w+),\s*(\d+)(?:,\s*(\d+))?>/i) || comment.match(/<QuestMarker:\s*(\w+),\s*(\d+)(?:,\s*(\d+))?>/i);
        let isVisible = false;
        let markerBitmap = 'QuestMarker_White';

        if (tag) {
            const qId = tag[1], qStage = parseInt(tag[2]), objIndex = tag[3] !== undefined ? parseInt(tag[3]) : null;
            isVisible = ($gameSystem._questProgress[qId] === qStage) && ($gameSystem._questStatus[qId] === 'active');
            if (isVisible && objIndex !== null) {
                const data = Quest.Database[qId] ? Quest.Database[qId].stages[qStage] : null;
                if (data && data.objectives[objIndex]) {
                    const obj = data.objectives[objIndex];
                    const max = (typeof obj === 'object' && obj.max) ? obj.max : 1;
                    const pVal = Quest.getProgress(qId, objIndex);
                    if (pVal >= max) isVisible = false; 
                }
            }
            if (isVisible) markerBitmap = ($gameSystem._trackedQuest === qId) ? 'QuestMarker_Yellow' : 'QuestMarker_White';
        }

        if (!isVisible) {
            const giverMatch = comment.match(/Quest\.setStage\s*\(\s*["'](\w+)["']\s*,\s*1\s*\)/i);
            if (giverMatch) {
                const gId = giverMatch[1];
                if (!$gameSystem._questStatus[gId]) { isVisible = true; markerBitmap = 'QuestMarker_Question'; }
            }
        }

        if (isVisible) {
            if (!this._markerSprite) {
                this._markerSprite = new Sprite();
                this._markerSprite.anchor.x = this._markerSprite.anchor.y = 0.5;
                this._markerSprite.scale.x = this._markerSprite.scale.y = 0.5;
                this.addChild(this._markerSprite);
            }
            this._markerSprite.bitmap = ImageManager.loadSystem(markerBitmap);
            this._markerSprite.visible = true;
            this._markerSprite.y = -60 + (Math.sin(Graphics.frameCount * 0.1) * 3); 
        } else if (this._markerSprite) { this._markerSprite.visible = false; }
    };

    // --- ENGINE INTEGRATION HOOKS (RESTORED) ---
    const _Scene_Map_createAllWindows = Scene_Map.prototype.createAllWindows;
    Scene_Map.prototype.createAllWindows = function() {
        _Scene_Map_createAllWindows.call(this);
        this._questNotice = new Window_QuestNotice();
        this._questHUD = new Window_QuestHUD();
        this.addWindow(this._questNotice);
        this.addWindow(this._questHUD);
    };

    const _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
    Window_MenuCommand.prototype.addOriginalCommands = function() {
        _Window_MenuCommand_addOriginalCommands.call(this);
        this.addCommand("Quests", "quest", true);
    };

    const _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
    Scene_Menu.prototype.createCommandWindow = function() {
        _Scene_Menu_createCommandWindow.call(this);
        this._commandWindow.setHandler("quest", () => SceneManager.push(Scene_Quest));
    };

    const _Game_Enemy_die = Game_Enemy.prototype.die;
    Game_Enemy.prototype.die = function() {
        _Game_Enemy_die.call(this);
        const enemyId = this.enemyId();
        
        Object.keys($gameSystem._questStatus).forEach(qId => {
            if ($gameSystem._questStatus[qId] === 'active') {
                const stage = $gameSystem._questProgress[qId];
                const questData = Quest.Database[qId];
                
                if (questData && questData.stages[stage]) {
                    questData.stages[stage].objectives.forEach((obj, i) => {
                        // Ensure we are comparing numbers to numbers
                        const enemyList = Array.isArray(obj.enemies) ? obj.enemies.map(Number) : [];
                        
                        if (enemyList.includes(Number(enemyId))) {
                            Quest.addProgress(qId, stage, i, 1);
                        }
                    });
                }
            }
        });
    };

    const _Game_Party_gainItem = Game_Party.prototype.gainItem;
    Game_Party.prototype.gainItem = function(item, amount, includeEquip) {
        _Game_Party_gainItem.call(this, item, amount, includeEquip);
        Object.keys($gameSystem._questStatus).forEach(qId => {
            if ($gameSystem._questStatus[qId] === 'active') Quest.checkStageCompletion(qId);
        });
    };
	
	// --------------------------------------------------
    // NATIVE VARIABLE TRACKING HOOK
    // --------------------------------------------------
    var _Game_Variables_setValue_QuestHook = Game_Variables.prototype.setValue;
    Game_Variables.prototype.setValue = function(variableId, value) {
        var oldValue = this.value(variableId);
        _Game_Variables_setValue_QuestHook.call(this, variableId, value);
        
        // Only run if the value actually changed and the Quest system is initialized
        if (oldValue !== value && typeof Quest !== 'undefined' && $gameSystem && $gameSystem._questStatus) {
            
            // Loop through all currently active quests
            for (var questId in $gameSystem._questStatus) {
                if ($gameSystem._questStatus[questId] === 'active') {
                    
                    var currentStage = $gameSystem._questProgress[questId] || 1;
                    var questData = Quest.Database[questId];
                    
                    if (questData && questData.stages[currentStage]) {
                        var objectives = questData.stages[currentStage].objectives;
                        
                        for (var i = 0; i < objectives.length; i++) {
                            // Check if this specific objective tracks the changed variable
                            if (objectives[i].variableId === variableId) {
                                
            // Sync the game variable directly into the quest's internal tracker
if (!$gameSystem._questObjProgress[questId]) {
    $gameSystem._questObjProgress[questId] = {};
}
if (!$gameSystem._questObjProgress[questId][currentStage]) {
    $gameSystem._questObjProgress[questId][currentStage] = {};
}

// Correctly map the value to the specific stage and objective
$gameSystem._questObjProgress[questId][currentStage][i] = value;

// Force the system to check if this new variable value completes the quest stage
Quest.checkStageCompletion(questId);
                            }
                        }
                    }
                }
            }
        }
    };

})();