/*:
 * @plugindesc (MV) Top-Right Battle HUD — flicker-free, synced with YEP ATB (stable pass).
 * @author ChatGPT
 *
 * @help
 * Place portraits in img/battlefaces/ (name without extension).
 * Requires YEP_X_BattleSysATB.js.
 */

(function() {
"use strict";

// ===== CONFIG =====
var PORTRAIT_SIZE = 48;
var RIGHT_PADDING = 40;
var START_Y = 40;
var LINE_HEIGHT = 80;
var GAUGE_WIDTH = 100;
var ICON_SCALE = 0.75;

// ===== Window_TopRightDock =====
function Window_TopRightDock() { this.initialize.apply(this, arguments); }
Window_TopRightDock.prototype = Object.create(Window_Base.prototype);
Window_TopRightDock.prototype.constructor = Window_TopRightDock;

Window_TopRightDock.prototype.initialize = function() {
    var w = Graphics.width, h = Graphics.height;
    Window_Base.prototype.initialize.call(this, 0, 0, w, h);
    this.opacity = 0;
    this._actorContainers = [];
    this.createActorContainers();
};

// -------------------------------
Window_TopRightDock.prototype.createActorContainers = function() {
    var actors = $gameParty.battleMembers();
    var startX = Graphics.width - RIGHT_PADDING;

    for (var i = 0; i < this._actorContainers.length; i++) {
        var old = this._actorContainers[i];
        if (old && old.container && old.container.parent) {
            this.removeChild(old.container);
        }
    }
    this._actorContainers = [];

    for (var j = 0; j < actors.length; j++) {
        var actor = actors[j];
        var y = START_Y + j * LINE_HEIGHT;
        var cont = new PIXI.Container();
        cont.x = startX;
        cont.y = y;
        this.addChild(cont);

        var bmp = ImageManager.loadBitmap("img/battlefaces/", this.getPortraitName(actor));
        var spr = new Sprite(bmp);
        spr.x = -PORTRAIT_SIZE / 2;
        spr.y = -PORTRAIT_SIZE / 2;
        spr.scale.x = spr.scale.y = PORTRAIT_SIZE / (bmp.width || PORTRAIT_SIZE);
        var mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawCircle(0, 0, PORTRAIT_SIZE / 2);
        mask.endFill();
        spr.mask = mask;

        var frame = new PIXI.Graphics();
        frame.lineStyle(3, 0xdfd7c8, 1);
        frame.drawCircle(0, 0, PORTRAIT_SIZE / 2 + 4);

        cont.addChild(spr);
        cont.addChild(mask);
        cont.addChild(frame);

        var gCont = new PIXI.Container();
        gCont.x = -PORTRAIT_SIZE / 2 - GAUGE_WIDTH - 8;
        gCont.y = -30;
        cont.addChild(gCont);

        var atbOuter = new PIXI.Graphics();
        var atbInner = new PIXI.Graphics();
        cont.addChild(atbOuter);
        cont.addChild(atbInner);

        this._actorContainers.push({
            actor: actor,
            container: cont,
            sprite: spr,
            _gaugeContainer: gCont,
            _atbOuter: atbOuter,
            _atbInner: atbInner,
            _atbDisplay: 0,
            _chargeDisplay: 0,
            _frameStamp: 0,
            _pulseOffset: Math.random() * Math.PI * 2,
            _pulseSpeed: 0.08,
            _pulseMagnitude: 0.3
        });
    }
};

// -------------------------------
Window_TopRightDock.prototype.getPortraitName = function(actor) {
    var notes = actor.actor().note || "";
    var m = notes.match(/<BattleFace\s*:\s*(.+?)>/i);
    return m ? m[1].trim() : "Blank";
};

// -------------------------------
Window_TopRightDock.prototype.updateVisualsPerFrame = function() {
    if (!this._actorContainers) return;
    for (var i = 0; i < this._actorContainers.length; i++) {
        var e = this._actorContainers[i], actor = e.actor;
        if (!actor) continue;

        this._updateGauges(e);
        this._updateArcs(e);
    }
};

// -------------------------------
Window_TopRightDock.prototype._updateGauges = function(entry) {
    var g = entry._gaugeContainer, actor = entry.actor;
    g.removeChildren();
    var w = GAUGE_WIDTH, h = 12;
    var hpRate = actor.hpRate ? actor.hpRate() : actor.hp / actor.mhp;
    var mpRate = actor.mpRate ? actor.mpRate() : actor.mp / actor.mmp;
    var boRate = actor.tpRate ? actor.tpRate() : 0;

    var makeGauge = function(y, rate, color) {
        var bg = new PIXI.Graphics();
        bg.beginFill(0x101214, 0.85);
        bg.drawRoundedRect(0, y, w, h, 6);
        bg.endFill();
        var fg = new PIXI.Graphics();
        fg.beginFill(color, 1);
        fg.drawRoundedRect(0, y, Math.max(1, Math.floor(w * rate)), h, 6);
        fg.endFill();
        g.addChild(bg);
        g.addChild(fg);
    };
    makeGauge(0, hpRate, 0x3bd07b);
    makeGauge(h + 6, mpRate, 0x3399ff);
    makeGauge((h + 6) * 2, boRate, 0xff7a00);
};

// -------------------------------
Window_TopRightDock.prototype._updateArcs = function(entry) {
    var actor = entry.actor, size = PORTRAIT_SIZE;
    var outer = entry._atbOuter, inner = entry._atbInner;

    // sample once every few frames
    if (Graphics.frameCount % 3 === 0) {
        entry._atbTarget = actor.atbRate ? actor.atbRate() : 0;
        entry._chargeTarget = actor.atbChargeRate ? actor.atbChargeRate() : 0;
    }

    // smooth interpolation
    entry._atbDisplay += (entry._atbTarget - entry._atbDisplay) * 0.2;
    entry._chargeDisplay += (entry._chargeTarget - entry._chargeDisplay) * 0.15;

    var atb = entry._atbDisplay, chg = entry._chargeDisplay;
    outer.clear(); inner.clear();

    // outer ATB ring
    if (atb > 0.001) {
        outer.lineStyle(3, 0x9cff88, 1.0);
        outer.arc(0, 0, size / 2 + 8, -Math.PI / 2, -Math.PI / 2 + atb * Math.PI * 2);
    }

    // inner charge ring (fixed opacity)
    if (chg > 0.001) {
        var color = chg >= 0.995 ? 0xffff88 : 0xffcc66;
        inner.beginFill(color, 0.6);
        inner.moveTo(0, 0);
        inner.arc(0, 0, size / 2 + 3, -Math.PI / 2, -Math.PI / 2 + chg * Math.PI * 2);
        inner.lineTo(0, 0);
        inner.endFill();
    }
};

// -------------------------------
var _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function() {
    _Scene_Battle_createAllWindows.call(this);
    this._topRightDock = new Window_TopRightDock();
    this.addChild(this._topRightDock);
};

var _Scene_Battle_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function() {
    _Scene_Battle_update.call(this);
    if (this._topRightDock) {
        this._topRightDock.updateVisualsPerFrame();
    }
};

})();