/*:
 * @plugindesc v2.4 Chatter Queue, Priority, and Event Manager Logic
 * @author You + Claude + Gemini
 *
 * @help
 * ============================================================================
 * SCRIPT CALL (MANAGER EVENTS)
 * ============================================================================
 * You can "throw" chatter to any event on the map from a single manager event.
 * Because of the new Queue System, you can stack these script calls back-to-back
 * and they will play perfectly in sequence!
 *
 * OverworldChatter.show({
 * eventId: 186,
 * text: "This district is under Order jurisdiction.",
 * priority: 1
 * });
 * * ============================================================================
 * AUTO-CHATTER SETUP (COMMENT BOXES)
 * ============================================================================
 * <Chatter>
 * text: Halt!
 * duration: 180
 * cooldown: 120
 * priority: 2
 * faceName: People3
 * faceIndex: 7
 * speakerName: Censer
 * proximityMode: appear
 * proximityDistance: 3
 * offsetX: 0
 * offsetY: 0
 * </Chatter>
 *
 * - priority: Lower numbers = higher priority. If multiple NPCs are triggered
 * at the exact same time, Priority 1 plays before Priority 2. (Default is 10)
 */

var OverworldChatter = OverworldChatter || {};

(function() {
    'use strict';

    OverworldChatter._data = [];
    OverworldChatter._queue = []; // NEW: Global Traffic Controller
    var _dummyWindow = null;

    // --- API ---
    // Checks if the event is currently talking OR waiting in line to talk
    OverworldChatter.isActive = function(eventId) {
        return this._data.some(d => d.eventId === eventId) || 
               this._queue.some(d => d.eventId === eventId);
    };

OverworldChatter.show = function(opts) {
    var eventId = (opts.eventId !== undefined) ? opts.eventId : 0;
    var text = opts.text || "";

    // Fix 1: Prevent duplicate — same event + same text already active or queued
    var isDupe = this._data.some(function(d) { return d.eventId === eventId && d.text === text; }) ||
                 this._queue.some(function(d) { return d.eventId === eventId && d.text === text; });
    if (isDupe) return;

    var data = {
        fadeState: "in",
        eventId: eventId,
        text: text,
        duration: (opts.duration !== undefined) ? opts.duration : 120,
        priority: (opts.priority !== undefined) ? opts.priority : 10,
        faceName: opts.faceName || "",
        faceIndex: opts.faceIndex || 0,
        speakerName: opts.speakerName || "",
        proximityMode: opts.proximityMode || null,
        proximityDistance: (opts.proximityDistance !== undefined) ? opts.proximityDistance : 2,
        offsetX: opts.offsetX || 0,
        offsetY: opts.offsetY || 0,
        timer: 0,
        sprite: null
    };

    this._queue.push(data);
    this._queue.sort(function(a, b) { return a.priority - b.priority; });

    // Fix 2: Set chatting flag on target event so cooldown fires even for script-call driven chatter
    if (eventId > 0 && $gameMap) {
        var ev = $gameMap.event(eventId);
        if (ev && ev._chatterData !== undefined) {
            ev._isCurrentlyChatting = true;
        }
    }
};

    OverworldChatter.clear = function(eventId) {
        this._data = this._data.filter(function(d) {
            if (d.eventId === eventId && d.sprite && d.sprite.parent) {
                d.sprite.parent.removeChild(d.sprite);
            }
            return d.eventId !== eventId;
        });
        this._queue = this._queue.filter(d => d.eventId !== eventId);
    };

    OverworldChatter.clearAll = function() {
        this._data.forEach(function(d) {
            if (d.sprite && d.sprite.parent) d.sprite.parent.removeChild(d.sprite);
        });
        this._data = [];
        this._queue = [];
    };

    // --- EVENT HOOKS ---
    var _Game_Event_setupPage = Game_Event.prototype.setupPage;
    Game_Event.prototype.setupPage = function() {
        _Game_Event_setupPage.call(this);
        this._chatterData = null;
        this._chatterCooldown = 0;
        this._isCurrentlyChatting = false; 
        
        if (!this.page()) return;
        var list = this.list();
        if (!list) return;
        
        var commentStr = "";
        var inChatter = false;
        for (var i = 0; i < list.length; i++) {
            if (list[i].code === 108 || list[i].code === 408) {
                var line = list[i].parameters[0];
                if (line.match(/<Chatter>/i)) inChatter = true;
                else if (line.match(/<\/Chatter>/i)) { inChatter = false; break; }
                else if (inChatter) commentStr += line + "\n";
            }
        }
        if (commentStr) this._chatterData = this.parseChatterComment(commentStr);
    };

    Game_Event.prototype.parseChatterComment = function(commentStr) {
        var data = {};
        commentStr.split('\n').forEach(line => {
            var match = line.trim().match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
            if (match) {
                var val = match[2].trim();
                data[match[1]] = isNaN(val) || val === '' ? val : Number(val);
            }
        });
        return data;
    };

    var _Game_Event_update = Game_Event.prototype.update;
    Game_Event.prototype.update = function() {
        _Game_Event_update.call(this);
        if (!this._chatterData || $gameMap.isEventRunning()) return;

        if (this._chatterCooldown > 0) {
            this._chatterCooldown--;
            return;
        }

        var active = OverworldChatter.isActive(this.eventId());
        
        if (this._isCurrentlyChatting && !active) {
            this._isCurrentlyChatting = false;
            this._chatterCooldown = this._chatterData.cooldown || 180; 
            return;
        }

        if (!active) {
            var dx = Math.abs($gamePlayer.x - this.x);
            var dy = Math.abs($gamePlayer.y - this.y);
            var dist = dx + dy;
            var mode = this._chatterData.proximityMode || "appear";
            var pDist = this._chatterData.proximityDistance || 3;

            if ((mode === "appear" && dist <= pDist) || (mode === "cancel" && dist > pDist)) {
                this._chatterData.eventId = this.eventId();
                OverworldChatter.show(this._chatterData);
                this._isCurrentlyChatting = true;
            }
        }
    };

    // --- SCENE MAP ENGINE ---
    const _Scene_Map_update = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _Scene_Map_update.call(this);
        if (!_dummyWindow && SceneManager._scene instanceof Scene_Map) {
            _dummyWindow = new Window_Base(new Rectangle(0, 0, Graphics.boxWidth, Graphics.boxHeight));
        }
        this.updateOverworldChatter();
    };

    Scene_Map.prototype.updateOverworldChatter = function() {
        // NEW: Pull the next message from the queue ONLY if the screen is clear
        if (OverworldChatter._data.length === 0 && OverworldChatter._queue.length > 0) {
            OverworldChatter._data.push(OverworldChatter._queue.shift());
        }

        for (let i = OverworldChatter._data.length - 1; i >= 0; i--) {
            const d = OverworldChatter._data[i];
            const char = (d.eventId === 0) ? $gamePlayer : $gameMap.event(d.eventId);
            if (!char) { this.removeChatter(i); continue; }

            if (!d.sprite) {
                d.sprite = createBubbleSprite(d);
                this.addChild(d.sprite);
            }

            d.sprite.x = char.screenX() + d.offsetX;
            d.sprite.y = char.screenY() - 60 + d.offsetY + (Math.sin(Graphics.frameCount / 20) * 3);

            if (d.fadeState === "in") {
                d.sprite.opacity += 15;
                if (d.sprite.opacity >= 255) d.fadeState = "hold";
            } else if (d.fadeState === "hold") {
                d.timer++;
                if (d.timer >= d.duration) d.fadeState = "out";
            } else if (d.fadeState === "out") {
                d.sprite.opacity -= 15;
                if (d.sprite.opacity <= 0) this.removeChatter(i);
            }
        }
    };

    Scene_Map.prototype.removeChatter = function(index) {
        const d = OverworldChatter._data[index];
        if (d.sprite && d.sprite.parent) d.sprite.parent.removeChild(d.sprite);
        OverworldChatter._data.splice(index, 1);
    };

    // --- RENDERER ---
    function createBubbleSprite(d) {
        const faceW = 144, faceH = 144, faceScale = 0.5;
        const scaledW = faceW * faceScale, scaledH = faceH * faceScale;

        const tempBmp = new Bitmap(Graphics.boxWidth, 100);
        _dummyWindow.contents = tempBmp;
        _dummyWindow.resetFontSettings();
        _dummyWindow.contents.fontSize = 20;
        const textWidth = _dummyWindow.drawTextEx(d.text, 0, 0);
        const nameWidth = d.speakerName ? _dummyWindow.textWidth(d.speakerName) : 0;
        
        let width = Math.max(textWidth, nameWidth) + 28;
        if (d.faceName) width += scaledW + 10;
        width = Math.max(width, 150);
        let height = (d.speakerName ? 56 : 34) + 16;
        if (d.faceName) height = Math.max(height, scaledH + 16);

        const sprite = new Sprite(new Bitmap(width, height));
        sprite.anchor.set(0.5, 1);
        sprite.opacity = 0;

        const bmp = sprite.bitmap;
        bmp.fillRect(0, 0, width, height, 'rgba(0, 0, 20, 0.85)');
        bmp.fillRect(0, 0, width, 2, 'rgba(255, 215, 0, 0.8)');
        bmp.fillRect(0, height - 2, width, 2, 'rgba(255, 215, 0, 0.8)');

        let textX = 14;
        if (d.faceName) {
            const fImg = ImageManager.loadFace(d.faceName);
            fImg.addLoadListener(() => {
                const sx = (d.faceIndex % 4) * faceW;
                const sy = Math.floor(d.faceIndex / 4) * faceH;
                bmp.blt(fImg, sx, sy, faceW, faceH, 8, 8, scaledW, scaledH);
            });
            textX += scaledW + 10;
        }

        let textY = 10;
        if (d.speakerName) {
            bmp.textColor = "#FFD700";
            bmp.fontBold = true;
            bmp.drawText(d.speakerName, textX, 6, width - textX, 24);
            textY = 32;
        }

        _dummyWindow.contents = bmp;
        _dummyWindow.resetFontSettings();
        _dummyWindow.contents.fontSize = 20;
        _dummyWindow.drawTextEx(d.text, textX, textY);

        return sprite;
    }

})();