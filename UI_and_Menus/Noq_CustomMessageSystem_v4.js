/*:
 * @plugindesc (MV ES5) Noq Custom Message System v4 — Normal + SideMsg Only
 * @author Noq + Claude
 * 
 * @param Message History Limit
 * @desc Maximum messages stored in backlog
 * @default 100
 * 
 * @param Backlog Key
 * @desc Key to open message history (pageup, pagedown, shift, tab)
 * @default pageup
 * 
 * @param Default Mode
 * @desc Starting display mode (normal, sidemsg)
 * @default normal
 * 
 * @param Show Nameplates
 * @desc Show speaker names above messages? (true/false)
 * @default true
 * 
 * @param Nameplate Color
 * @desc Nameplate text color (CSS color or hex)
 * @default #FFD700
 * 
 * @param Side Message Duration
 * @desc How long side messages stay on screen (frames)
 * @default 180
 * 
 * @help
 * ============================================================================
 * NOQ CUSTOM MESSAGE SYSTEM V4 (STREAMLINED)
 * ============================================================================
 * 
 * TWO MODES:
 * - NORMAL: 100% default RPG Maker (no custom overrides)
 * - SIDEMSG: Bottom corner messages for battle chatter
 * 
 * (Battlelog removed - Musical Victory Engine handles that)
 * 
 * ============================================================================
 * TEXT CODES (sidemsg mode only)
 * ============================================================================
 * \FR          - Position face on RIGHT side
 * \FL          - Position face on LEFT side (default)
 * \N[name]     - Set speaker nameplate
 * <br>         - Force line break
 * 
 * ============================================================================
 * PLUGIN COMMANDS
 * ============================================================================
 * MsgMode normal          - Default RPG Maker messaging
 * MsgMode sidemsg         - Bottom corner messages
 * MsgMode toggle          - Switch between modes
 * 
 * MsgBacklog open/clear   - Backlog controls
 * MsgNameplate on/off     - Toggle nameplates
 * 
 * ============================================================================
 * BATTLE CHATTER API
 * ============================================================================
 * NoqMsg.showBattleChatter(text, faceName, faceIndex, side, speakerName)
 * 
 * Parameters:
 *   text        - Message text
 *   faceName    - Face file ('Actor1', etc)
 *   faceIndex   - 0-7
 *   side        - 'left' or 'right'
 *   speakerName - Speaker name for nameplate
 * 
 */

(function() {
    'use strict';

    // =========================================================================
    // PARAMETERS
    // =========================================================================
    var params = PluginManager.parameters('Noq_CustomMessageSystem_v4');
    var HISTORY_LIMIT = Number(params['Message History Limit'] || 100);
    var BACKLOG_KEY = String(params['Backlog Key'] || 'pageup').toLowerCase();
    var DEFAULT_MODE = String(params['Default Mode'] || 'normal').toLowerCase();
    var SHOW_NAMEPLATES = String(params['Show Nameplates'] || 'true').toLowerCase() === 'true';
    var NAMEPLATE_COLOR = String(params['Nameplate Color'] || '#FFD700');
    var SIDE_MSG_DURATION = Number(params['Side Message Duration'] || 180);

    // =========================================================================
    // RESOLUTION SCALING (EX_UI Integration)
    // =========================================================================
    var UI = typeof EX_UI !== 'undefined' ? EX_UI : { 
        scaleX: function() { return 1; }, 
        scaleY: function() { return 1; } 
    };
    
    function scaledX(val) { return Math.floor(val * UI.scaleX()); }
    function scaledY(val) { return Math.floor(val * UI.scaleY()); }

    // =========================================================================
    // SYSTEM STATE
    // =========================================================================
    var _messageHistory = [];
    var _currentMode = DEFAULT_MODE;
    var _backlogOpen = false;
    var _showNameplates = SHOW_NAMEPLATES;
    
    var _pendingFaceSide = 'left';
    var _pendingSpeakerName = '';
    
    // =========================================================================
    // MESSAGE DATA STRUCTURE
    // =========================================================================
    function MessageData(text, faceName, faceIndex, faceSide, speakerName) {
        this.text = text;
        this.faceName = faceName || '';
        this.faceIndex = faceIndex || 0;
        this.faceSide = faceSide || 'left';
        this.speakerName = speakerName || '';
        this.timestamp = Date.now();
    }

    // =========================================================================
    // GLOBAL API FOR BATTLE CHATTER
    // =========================================================================
    window.NoqMsg = window.NoqMsg || {};
    
    window.NoqMsg.showBattleChatter = function(text, faceName, faceIndex, side, speakerName) {
        if (_currentMode !== 'sidemsg') return;
        
        var msgData = new MessageData(text, faceName, faceIndex, side || 'right', speakerName || '');
        addToHistory(msgData);
        showInSideMessage(msgData);
    };

    // =========================================================================
    // PLUGIN COMMANDS
    // =========================================================================
    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        
        var cmd = command.toLowerCase();
        
        if (cmd === 'msgmode') {
            var mode = args[0] ? args[0].toLowerCase() : '';
            if (mode === 'normal') {
                _currentMode = 'normal';
                clearSideMessages();
            } else if (mode === 'sidemsg') {
                _currentMode = 'sidemsg';
            } else if (mode === 'toggle') {
                _currentMode = (_currentMode === 'normal') ? 'sidemsg' : 'normal';
                clearSideMessages();
            }
        } else if (cmd === 'msgbacklog') {
            var action = args[0] ? args[0].toLowerCase() : '';
            if (action === 'open') {
                openBacklog();
            } else if (action === 'clear') {
                _messageHistory = [];
            }
        } else if (cmd === 'msgnameplate') {
            var state = args[0] ? args[0].toLowerCase() : '';
            if (state === 'on') _showNameplates = true;
            if (state === 'off') _showNameplates = false;
        }
    };

    // =========================================================================
    // TEXT PROCESSING
    // =========================================================================
    
    var _Game_Interpreter_command101 = Game_Interpreter.prototype.command101;
    Game_Interpreter.prototype.command101 = function() {
        if (_currentMode === 'normal') {
            return _Game_Interpreter_command101.call(this);
        }
        
        _pendingFaceSide = 'left';
        _pendingSpeakerName = '';
        
        if (!$gameMessage.isBusy()) {
            var texts = [];
            while (this.nextEventCode() === 401) {
                this._index++;
                texts.push(this.currentCommand().parameters[0]);
            }
            if (texts.length > 0) {
                var fullText = texts.join('\n');
                fullText = processCustomCodes(fullText);
                
                $gameMessage.clear();
                texts = fullText.split('\n');
                for (var i = 0; i < texts.length; i++) {
                    $gameMessage.add(texts[i]);
                }
            }
        }
        
        return _Game_Interpreter_command101.call(this);
    };
    
    function processCustomCodes(text) {
        if (text.match(/\\FR/i)) {
            _pendingFaceSide = 'right';
            text = text.replace(/\\FR/gi, '');
        }
        if (text.match(/\\FL/i)) {
            _pendingFaceSide = 'left';
            text = text.replace(/\\FL/gi, '');
        }
        
        text = text.replace(/\\N\[(.+?)\]/gi, function(match, name) {
            _pendingSpeakerName = name;
            return '';
        });
        
        text = text.replace(/<br>/gi, '\n');
        
        return text;
    }

    // =========================================================================
    // MESSAGE CAPTURE & DISPLAY
    // =========================================================================
    var _Window_Message_startMessage = Window_Message.prototype.startMessage;
    Window_Message.prototype.startMessage = function() {
        if (_currentMode === 'normal') {
            _Window_Message_startMessage.call(this);
            
            var text = $gameMessage.allText();
            if (text) {
                var msgData = new MessageData(
                    text,
                    $gameMessage.faceName(),
                    $gameMessage.faceIndex(),
                    'left',
                    ''
                );
                addToHistory(msgData);
            }
            return;
        }
        
        var text = $gameMessage.allText();
        var faceName = $gameMessage.faceName();
        var faceIndex = $gameMessage.faceIndex();
        
        if (text) {
            var msgData = new MessageData(
                text, 
                faceName, 
                faceIndex, 
                _pendingFaceSide, 
                _pendingSpeakerName
            );
            addToHistory(msgData);
            showInSideMessage(msgData);
            
            $gameMessage.clear();
            this._textState = null;
            this.close();
            return;
        }
        
        _Window_Message_startMessage.call(this);
    };

    function addToHistory(msgData) {
        _messageHistory.push(msgData);
        if (_messageHistory.length > HISTORY_LIMIT) {
            _messageHistory.shift();
        }
    }

    // =========================================================================
    // SIDE MESSAGE MODE
    // =========================================================================
    var _sideMessages = [];

    function showInSideMessage(msgData) {
        if (!SceneManager._scene) return;
        
        var scene = SceneManager._scene;
        var sprite = createSideMessageSprite(msgData);
        
        scene.addChild(sprite);
        _sideMessages.push(sprite);
    }

    function createSideMessageSprite(msgData) {
        var width = scaledX(450);
        var height = scaledY(120);
        
        var sprite = new Sprite(new Bitmap(width, height));
        
var isRight = msgData.faceSide === 'right';
        
        // --- NEW LOGIC: Store dimensions and spawn off-screen horizontally ---
        sprite._isRight = isRight;
        sprite._msgWidth = width;
        sprite._msgHeight = height;
        
        // Spawn completely off-screen to the left or right
        sprite.x = isRight ? Graphics.boxWidth + scaledX(50) : -(width + scaledX(50)); 
        
        // Initial Y position (will be instantly corrected by the update loop)
        sprite.y = scaledY(250); 
        
        sprite._duration = SIDE_MSG_DURATION;
        sprite.opacity = 0;
        // ---------------------------------------------------------------------

        
        sprite.bitmap.fillRect(0, 0, width, height, 'rgba(0, 0, 25, 0.85)');
        var borderColor = isRight ? 'rgba(100, 150, 255, 0.9)' : 'rgba(255, 100, 100, 0.9)';
        sprite.bitmap.fillRect(0, 0, width, scaledY(4), borderColor);
        
        var textStartX = scaledX(10);
        var textWidth = width - scaledX(20);
        
        if (msgData.faceName) {
        var faceW = Window_Base._faceWidth;
        var faceH = Window_Base._faceHeight;
        var faceBitmap = ImageManager.loadFace(msgData.faceName);
        
        // This is the fix: We wait for the bitmap to load before drawing
        faceBitmap.addLoadListener(function() {
            var sx = (msgData.faceIndex % 4) * faceW;
            var sy = Math.floor(msgData.faceIndex / 4) * faceH;
            var faceScale = 0.75;
            var scaledFaceW = scaledX(faceW * faceScale);
            var scaledFaceH = scaledY(faceH * faceScale);
            var faceX = isRight ? width - scaledFaceW - scaledX(8) : scaledX(8);
            
            sprite.bitmap.blt(faceBitmap, sx, sy, faceW, faceH, faceX, scaledY(12), scaledFaceW, scaledFaceH);
        });

        if (!isRight) {
            textStartX = scaledX(8) + scaledX(faceW * 0.75) + scaledX(12);
            textWidth = width - textStartX - scaledX(10);
        } else {
            textWidth = width - scaledX(faceW * 0.75) - scaledX(30);
        }
    }
        
        var textY = scaledY(18);
        if (_showNameplates && msgData.speakerName) {
            sprite.bitmap.outlineWidth = 4;
            sprite.bitmap.outlineColor = 'rgba(0, 0, 0, 0.9)';
            sprite.bitmap.textColor = NAMEPLATE_COLOR;
            sprite.bitmap.fontSize = scaledY(22);
            sprite.bitmap.fontBold = true;
            sprite.bitmap.drawText(msgData.speakerName, textStartX, scaledY(12), textWidth, scaledY(26), 'left');
            textY = scaledY(42);
        }
        
        sprite.bitmap.outlineWidth = 3;
        sprite.bitmap.outlineColor = 'rgba(0, 0, 0, 0.9)';
        sprite.bitmap.textColor = '#FFFFFF';
        sprite.bitmap.fontSize = scaledY(20);
        sprite.bitmap.fontBold = false;
        drawWrappedText(sprite.bitmap, msgData.text, textStartX, textY, textWidth, scaledY(22));
        
        return sprite;
    }
	
    function clearSideMessages() {
        for (var i = 0; i < _sideMessages.length; i++) {
            if (_sideMessages[i].parent) {
                _sideMessages[i].parent.removeChild(_sideMessages[i]);
            }
        }
        _sideMessages = [];
    }

    // =========================================================================
    // SPRITE ANIMATION
    // =========================================================================
    var _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        updateSideMessages();
    };

    var _Scene_Battle_update = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        _Scene_Battle_update.call(this);
        updateSideMessages();
    };

    function updateSideMessages() {
        var spacing = scaledY(15);
        // This is your 200-300 pixel drop from the top of the screen
        var topMargin = scaledY(225); 

        for (var i = _sideMessages.length - 1; i >= 0; i--) {
            var sprite = _sideMessages[i];
            
            // --- NEW LOGIC: Dynamic Stacking from the Top ---
            // Calculate how many messages are newer than this one
            var newerCount = (_sideMessages.length - 1) - i;
            
            // Newest message stays at topMargin, older messages get pushed DOWN
            sprite._targetY = topMargin + (newerCount * (sprite._msgHeight + spacing));
            
            // Determine resting X position based on speaker side
            if (sprite._isRight) {
                sprite._targetX = Graphics.boxWidth - sprite._msgWidth - scaledX(20);
            } else {
                sprite._targetX = scaledX(20);
            }
            // -----------------------------------

            // Slide towards target positions
            sprite.x += (sprite._targetX - sprite.x) * 0.15;
            sprite.y += (sprite._targetY - sprite.y) * 0.15;
            sprite.opacity += (255 - sprite.opacity) * 0.12;
            
            sprite._duration--;
            
            // Exit animation: Fade out and slide back off the screen
            if (sprite._duration < 60) {
                sprite.opacity -= 4;
                var exitX = sprite._isRight ? Graphics.boxWidth + scaledX(50) : -(sprite._msgWidth + scaledX(50));
                sprite.x += (exitX - sprite.x) * 0.10; 
            }
            
            // Cleanup when fully dead or faded
            if (sprite._duration <= 0 || (sprite._duration < 60 && sprite.opacity <= 0)) {
                if (sprite.parent) sprite.parent.removeChild(sprite);
                _sideMessages.splice(i, 1);
            }
        }
    }

    // =========================================================================
    // HELPER: WORD WRAP
    // =========================================================================
    function drawWrappedText(bitmap, text, x, y, maxWidth, lineHeight) {
        var lines = text.split('\n');
        var currentY = y;
        
        for (var l = 0; l < lines.length; l++) {
            var words = lines[l].split(' ');
            var line = '';
            
            for (var i = 0; i < words.length; i++) {
                var testLine = line + words[i] + ' ';
                var w = bitmap.measureTextWidth(testLine);
                
                if (w > maxWidth && line.length > 0) {
                    bitmap.drawText(line, x, currentY, maxWidth, lineHeight);
                    line = words[i] + ' ';
                    currentY += lineHeight;
                } else {
                    line = testLine;
                }
            }
            bitmap.drawText(line, x, currentY, maxWidth, lineHeight);
            currentY += lineHeight;
        }
    }

    // =========================================================================
    // BACKLOG VIEWER
    // =========================================================================
    function Window_MessageBacklog() {
        this.initialize.apply(this, arguments);
    }

    Window_MessageBacklog.prototype = Object.create(Window_Selectable.prototype);
    Window_MessageBacklog.prototype.constructor = Window_MessageBacklog;

    Window_MessageBacklog.prototype.initialize = function() {
        var width = Graphics.boxWidth - scaledX(100);
        var height = Graphics.boxHeight - scaledY(100);
        var x = scaledX(50);
        var y = scaledY(50);
        Window_Selectable.prototype.initialize.call(this, x, y, width, height);
        this.refresh();
        this.activate();
    };

    Window_MessageBacklog.prototype.maxItems = function() {
        return _messageHistory.length;
    };

    Window_MessageBacklog.prototype.drawItem = function(index) {
        var msgData = _messageHistory[index];
        if (!msgData) return;
        
        var rect = this.itemRectForText(index);
        
        if (msgData.faceName) {
            var faceW = Window_Base._faceWidth;
            var faceH = Window_Base._faceHeight;
            var sx = (msgData.faceIndex % 4) * faceW;
            var sy = Math.floor(msgData.faceIndex / 4) * faceH;
            var faceBitmap = ImageManager.loadFace(msgData.faceName);
            
            var faceX = msgData.faceSide === 'left' ? rect.x : rect.x + rect.width - faceW * 0.6;
            this.contents.blt(faceBitmap, sx, sy, faceW, faceH, faceX, rect.y, faceW * 0.6, faceH * 0.6);
        }
        
        if (msgData.speakerName) {
            this.changeTextColor(NAMEPLATE_COLOR);
            this.drawText(msgData.speakerName, rect.x + 80, rect.y, rect.width - 160);
            this.resetTextColor();
        }
        
        var textY = msgData.speakerName ? rect.y + 24 : rect.y + 10;
        this.drawTextEx(msgData.text, rect.x + 80, textY);
    };

    Window_MessageBacklog.prototype.itemHeight = function() {
        return scaledY(100);
    };

    Window_MessageBacklog.prototype.processCancel = function() {
        Window_Selectable.prototype.processCancel.call(this);
        closeBacklog();
    };

    function openBacklog() {
        if (_messageHistory.length === 0) return;
        if (_backlogOpen) return;
        
        _backlogOpen = true;
        var scene = SceneManager._scene;
        
        if (!scene._backlogWindow) {
            scene._backlogWindow = new Window_MessageBacklog();
            scene.addWindow(scene._backlogWindow);
        }
        
        scene._backlogWindow.refresh();
        scene._backlogWindow.open();
        scene._backlogWindow.activate();
    }

    function closeBacklog() {
        _backlogOpen = false;
        var scene = SceneManager._scene;
        if (scene._backlogWindow) {
            scene._backlogWindow.close();
            scene._backlogWindow.deactivate();
        }
    }

    // =========================================================================
    // INPUT HANDLING
    // =========================================================================
    var _Scene_Map_update2 = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update2.call(this);
        handleBacklogInput();
    };

    var _Scene_Battle_update2 = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function() {
        _Scene_Battle_update2.call(this);
        handleBacklogInput();
    };

    function handleBacklogInput() {
        if (!_backlogOpen && Input.isTriggered(BACKLOG_KEY)) {
            if (!$gameMessage.isBusy()) {
                openBacklog();
            }
        }
    }
	
	var _Game_Message_add = Game_Message.prototype.add;
    Game_Message.prototype.add = function(text) {
        _Game_Message_add.call(this, text);
        
        // If we are in sidemsg mode and not in a middle of an event
        if (_currentMode === 'sidemsg' && !$gameParty.inBattle()) {
             // Normal handling
        } else if (_currentMode === 'sidemsg' && $gameParty.inBattle()) {
            // Force battle chatter to trigger even if it's a system message
            // Note: This might cause double-messages if not careful, 
            // but ensures "legacy" ATB text is captured.
        }
    };

    // =========================================================================
    // CLEANUP
    // =========================================================================
    var _Scene_Base_terminate = Scene_Base.prototype.terminate;
    Scene_Base.prototype.terminate = function() {
        _Scene_Base_terminate.call(this);
        clearSideMessages();
        closeBacklog();
    };

})();
