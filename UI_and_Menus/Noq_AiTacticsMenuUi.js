// =============================================================================
// NATIVE TACTICS MENU - UNIFIED WINDOW (Variables 150 & 160)
// =============================================================================

// --- 1. RESTORED: Inject into Main Menu ---
var _Window_MenuCommand_addOriginalCommands = Window_MenuCommand.prototype.addOriginalCommands;
Window_MenuCommand.prototype.addOriginalCommands = function() {
    _Window_MenuCommand_addOriginalCommands.call(this);
    this.addCommand("Tactics", "tactics", true);
};

var _Scene_Menu_createCommandWindow = Scene_Menu.prototype.createCommandWindow;
Scene_Menu.prototype.createCommandWindow = function() {
    _Scene_Menu_createCommandWindow.call(this);
    this._commandWindow.setHandler('tactics', this.commandPersonal.bind(this));
};

var _Scene_Menu_onPersonalOk = Scene_Menu.prototype.onPersonalOk;
Scene_Menu.prototype.onPersonalOk = function() {
    _Scene_Menu_onPersonalOk.call(this);
    if (this._commandWindow.currentSymbol() === 'tactics') {
        SceneManager.push(Scene_Tactics); 
    }
};

// --- 2. The Unified Window (Modes + Items + Skills) ---
function Window_TacticsUnified() { this.initialize.apply(this, arguments); }
Window_TacticsUnified.prototype = Object.create(Window_Command.prototype);
Window_TacticsUnified.prototype.constructor = Window_TacticsUnified;

Window_TacticsUnified.prototype.initialize = function(x, y, w, h) {
    this._windowWidth = w;
    this._windowHeight = h;
    this._actor = null;
    Window_Command.prototype.initialize.call(this, x, y);
};

Window_TacticsUnified.prototype.windowWidth = function() { return this._windowWidth; };
Window_TacticsUnified.prototype.windowHeight = function() { return this._windowHeight; };

Window_TacticsUnified.prototype.setActor = function(actor) {
    if (this._actor !== actor) {
        this._actor = actor;
        this.refresh();
        this.select(1); // Select the first actual command, skipping the header
        this.updateHelp();
    }
};

Window_TacticsUnified.prototype.makeCommandList = function() {
    if (!this._actor) return; 

    // 1. Add the Behavior Modes (Variable 150)
    this.addCommand("--- Behavior Tactics ---", "header", false);
    this.addCommand("Default (Lore)", "mode", true, 0);
    this.addCommand("Conserve Energy", "mode", true, 1);
    this.addCommand("Go All Out", "mode", true, 2);
    this.addCommand("Support Focus", "mode", true, 3);
    this.addCommand("Item Specialist", "mode", true, 4);

    // 2. Add the Item Tactics (Variable 160)
    this.addCommand("--- Item Tactics ---", "header", false);
    this.addCommand("All Items", "itemMode", true, 0);
    this.addCommand("HP / Revive Only", "itemMode", true, 1);
    this.addCommand("MP / Energy Only", "itemMode", true, 2);
    this.addCommand("Utility Only", "itemMode", true, 3);
    this.addCommand("Do Not Use Items", "itemMode", true, 4);

    // 3. Add a visual separator for skills
    this.addCommand("--- AI Skill Toggles ---", "header", false);

    // 4. Add the Actor's Skills (Ignoring passives/hidden skills)
    var skills = this._actor.skills().filter(function(s) {
        return s && s.stypeId > 0 && !s.meta.Passive && !s.meta.NoAI;
    });

    for (var i = 0; i < skills.length; i++) {
        this.addCommand(skills[i].name, "skill", true, skills[i].id); 
    }
};

Window_TacticsUnified.prototype.drawItem = function(index) {
    var rect = this.itemRectForText(index);
    var symbol = this.commandSymbol(index);
    var ext = this._list[index].ext;
    var name = this.commandName(index);

    this.resetTextColor();
    this.changePaintOpacity(this.isCommandEnabled(index));

    if (symbol === 'mode') {
        var modeVarId = 150 + this._actor.actorId();
        if ($gameVariables.value(modeVarId) === ext) {
            this.changeTextColor(this.systemColor());
            this.drawText("★ " + name, rect.x, rect.y, rect.width);
        } else {
            this.drawText(name, rect.x, rect.y, rect.width);
        }
    } else if (symbol === 'itemMode') {
        var itemModeVarId = 160 + this._actor.actorId();
        if ($gameVariables.value(itemModeVarId) === ext) {
            this.changeTextColor(this.systemColor());
            this.drawText("★ " + name, rect.x, rect.y, rect.width);
        } else {
            this.drawText(name, rect.x, rect.y, rect.width);
        }
    } else if (symbol === 'header') {
        this.changeTextColor(this.systemColor());
        this.drawText(name, rect.x, rect.y, rect.width, 'center');
    } else if (symbol === 'skill') {
        this._actor._disabledAISkills = this._actor._disabledAISkills || [];
        var isDisabled = this._actor._disabledAISkills.contains(ext);

        // Dim the text if disabled
        this.changePaintOpacity(!isDisabled);
        this.drawText(name, rect.x, rect.y, rect.width - 80);

        // Draw [ON] (Green-ish) or [OFF] (Red-ish)
        var status = isDisabled ? "[OFF]" : "[ON]";
        this.changeTextColor(isDisabled ? this.textColor(10) : this.textColor(3)); 
        this.drawText(status, rect.x + rect.width - 70, rect.y, 70, 'right');
    }
};

Window_TacticsUnified.prototype.updateHelp = function() {
    if (!this._helpWindow || !this._actor) return;
    var symbol = this.currentSymbol();
    var ext = this._list[this.index()] ? this._list[this.index()].ext : null;
    
    var header = "Tactics: " + this._actor.name() + "\n";
    var desc = "";
    
    if (symbol === 'mode') {
        var modeDescs = [
            "Acts according to their natural Verse temperament.",
            "Saves MP. Prefers Wait (15% MP) over Guard (10% MP).",
            "Maximum aggression. Ignores Burnout.",
            "Focuses on Healing/Buffs.",
            "Uses items to save MP/Burnout."
        ];
        desc = modeDescs[ext] || "";
    } else if (symbol === 'itemMode') {
        var itemModeDescs = [
            "Allows the AI to use any available item.",
            "Restricts the AI to only using Healing and Revival items.",
            "Restricts the AI to only using MP and Energy restoration items.",
            "Restricts the AI to offensive items, buffs, and status cleanses.",
            "Forbids the AI from using any items automatically."
        ];
        desc = itemModeDescs[ext] || "";
    } else if (symbol === 'skill') {
        desc = "Toggle whether the AI is allowed to use this skill in auto-battle.";
    }
    
    this._helpWindow.setText(header + desc);
};

// --- 3. The Scene Integration ---
function Scene_Tactics() { this.initialize.apply(this, arguments); }
Scene_Tactics.prototype = Object.create(Scene_MenuBase.prototype);
Scene_Tactics.prototype.constructor = Scene_Tactics;

Scene_Tactics.prototype.create = function() {
    Scene_MenuBase.prototype.create.call(this);
    this.createHelpWindow();
    
    var wy = this._helpWindow.height;
    var ww = 400; // Wide enough to hold Mode names and Skill Toggles
    var wh = Graphics.boxHeight - wy; // Extends to the bottom of the screen
    
    // Aligned to the left to leave the right side open for future portraits!
    this._unifiedWindow = new Window_TacticsUnified(0, wy, ww, wh);
    this._unifiedWindow.setHelpWindow(this._helpWindow);
    
    this._unifiedWindow.setHandler('ok',       this.onItemOk.bind(this));
    this._unifiedWindow.setHandler('cancel',   this.popScene.bind(this));
    this._unifiedWindow.setHandler('pagedown', this.nextActor.bind(this));
    this._unifiedWindow.setHandler('pageup',   this.previousActor.bind(this));
    
    this.addWindow(this._unifiedWindow);
    this.refreshActor();
};

Scene_Tactics.prototype.refreshActor = function() {
    this._unifiedWindow.setActor(this.actor());
};

Scene_Tactics.prototype.onActorChange = function() {
    this.refreshActor();
    this._unifiedWindow.activate();
};

Scene_Tactics.prototype.onItemOk = function() {
    var symbol = this._unifiedWindow.currentSymbol();
    var ext = this._unifiedWindow.currentExt();
    var actor = this.actor();
    
    if (symbol === 'mode') {
        $gameVariables.setValue(150 + actor.actorId(), ext);
        SoundManager.playEquip();
    } else if (symbol === 'itemMode') {
        $gameVariables.setValue(160 + actor.actorId(), ext);
        SoundManager.playEquip();
    } else if (symbol === 'skill') {
        actor._disabledAISkills = actor._disabledAISkills || [];
        if (actor._disabledAISkills.contains(ext)) {
            // Re-enable the skill
            var idx = actor._disabledAISkills.indexOf(ext);
            actor._disabledAISkills.splice(idx, 1);
        } else {
            // Disable the skill
            actor._disabledAISkills.push(ext);
        }
        SoundManager.playOk();
    }
    
    this._unifiedWindow.refresh();
    this._unifiedWindow.activate();
};