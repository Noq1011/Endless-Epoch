/*:
 * @plugindesc (MV) NoqBurnoutHUD v1.8 — vivid gradient gauges, soft rounded borders, anchored command/skill/item, white EN popup, hide TP cost/icons, portrait ring, pulse, rumble, chant FX. 
 * @author Noq
 *
 * @help
 * Requires: YEP_X_BattleSysATB.js
 * Load order: Place below ATB/HUD-affecting plugins.
 *
 * Keeps all of your v1.7 behavior, and adds:
 *  • Vivid static gradients for HP/MP/Burnout (no flow animation)
 *  • Soft black 1–2px rounded borders around each gauge
 *  • Actor Command + Skill + Item windows anchored in front of the acting battler
 *  • White EN popup above the skill window (shows MP cost only)
 *  • No TP cost in skill lists and no YEP SkillCore resource icons
 *  • Retains: ring pulse, fracture burnout gauge, rumble, chant FX, sharp portraits
 *
 * Notes (Actors):
 *   <BattleFace: File>
 *   <BattleFaceLowHP: FileLow>
 *   <BattleFaceBurnout: FileBurn>
 */

(function(){
"use strict";

/* =========================
   == CONFIG (visuals)    ==
   ========================= */
var PORTRAIT_SIZE     = 48;
var PORTRAIT_SCALE    = 1.00;
var PORTRAIT_BLEED    = 9;

var GAUGE_WIDTH       = 100;
var GAUGE_HEIGHT      = 12;
var GAUGE_SPACING_Y   = 6;
var GAUGE_OFFSET_X    = 40;
var GAUGE_OFFSET_Y    = -22;

var TOP_OFFSET        = 60;
var PORTRAIT_SPACING  = 182;
var CENTER_OFFSET     = -53;

var ATB_COLOR         = 0x9cff88;
var CHARGE_COLOR      = 0xffcc66;

var SHAKE_DECAY       = 0.85;
var SHAKE_STRENGTH_HP = 8;
var SHAKE_STRENGTH_MP = 3;
var SHAKE_STRENGTH_BO = 5;

var PULSE_SPEED       = 0.09;
var PULSE_MAG         = 0.35;

// Gauge gradients (static vivid)
var GRAD_HP  = ["#00ff88", "#00c853"]; // bright → deep green
var GRAD_MP  = ["#4fc3f7", "#2979ff"]; // sky → vivid blue
var GRAD_EN  = ["#ff9e00", "#ff3d00"]; // amber → hot orange-red

// Gauge border (soft)
var BORDER_ALPHA      = 0.65;   // overall opacity for stroke
var BORDER_RADIUS     = 6;      // rounded corners
var BORDER_THIN       = 1.2;    // thin border weight

// Anchoring offset from battler
var CMD_OFFSET_X      = -160;

// EN popup (white) above skill window
var ENPOP_FONT_SIZE   = 18;
var ENPOP_PADDING     = 6;
var ENPOP_FADE_SPEED  = 0.12;   // per-frame alpha step

/* =========================
   == HUD Window          ==
   ========================= */
function Window_TopRightDock(){
    this.initialize.apply(this, arguments);
}
Window_TopRightDock.prototype = Object.create(Window_Base.prototype);
Window_TopRightDock.prototype.constructor = Window_TopRightDock;

Window_TopRightDock.prototype.initialize = function(){
    Window_Base.prototype.initialize.call(this,0,0,Graphics.width,Graphics.height);
    this.opacity = 0;
    this._actorEntries = [];
    this.createActorEntries();
};

Window_TopRightDock.prototype.createActorEntries = function(){
    var actors = $gameParty.battleMembers();
    this._actorEntries = [];

    for (var i=0;i<actors.length;i++){
        var actor = actors[i];
        var cont = new PIXI.Container();
        this.addChild(cont);

        // portrait
        var portraitName = this.getPortraitName(actor);
        var bmp = ImageManager.loadBitmap("img/battlefaces/", portraitName);
        bmp.smooth = false; // crisp
        var spr = new Sprite(bmp);
        spr.anchor.x = spr.anchor.y = 0.5;
        spr.scale.set(PORTRAIT_SCALE);
        if (spr.texture && spr.texture.baseTexture)
            spr.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

        // circular mask (bleed into ring)
        var mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawCircle(0,0,(PORTRAIT_SIZE/2)+PORTRAIT_BLEED);
        mask.endFill();
        spr.mask = mask;

        // ring and gauges
        var ring   = new PIXI.Graphics();
        var gauges = new PIXI.Container();

        cont.addChild(spr);
        cont.addChild(mask);
        cont.addChild(ring);
        cont.addChild(gauges);

        this._actorEntries.push({
            actor: actor,
            container: cont,
            sprite: spr,
            mask: mask,
            ring: ring,
            gauges: gauges,
            _bars: null,
            _fractureGfx: null,
            _shake: null,
            _prevHp: actor.hp,
            _prevMp: actor.mp,
            _prevBo: actor.tp,
            _atbPrev: 0,
            _chargePrev: 0
        });
    }
};

/* === Portrait helpers === */
Window_TopRightDock.prototype.getPortraitName = function(actor){
    if (!actor) return "Blank";
    var note = actor.actor().note || "";
    var m = note.match(/<BattleFace\s*:\s*(.+?)>/i);
    return m && m[1] ? m[1].trim() : "Blank";
};
Window_TopRightDock.prototype.getPortraitLowHP = function(actor){
    var note = actor.actor().note || "";
    var m = note.match(/<BattleFaceLowHP\s*:\s*(.+?)>/i);
    return m && m[1] ? m[1].trim() : this.getPortraitName(actor);
};
Window_TopRightDock.prototype.getPortraitBurn = function(actor){
    var note = actor.actor().note || "";
    var m = note.match(/<BattleFaceBurnout\s*:\s*(.+?)>/i);
    return m && m[1] ? m[1].trim() : this.getPortraitName(actor);
};

/* === Update loop === */
Window_TopRightDock.prototype.update = function(){
    Window_Base.prototype.update.call(this);
    this.updateLayout();
    this.updateVisuals();
};

/* === Horizontal layout along top === */
Window_TopRightDock.prototype.updateLayout = function(){
    var total = this._actorEntries.length;
    var midX = Graphics.width/2 + CENTER_OFFSET;
    var totalWidth = (total-1)*PORTRAIT_SPACING;
    var startX = midX - totalWidth/2;

    for (var i=0;i<total;i++){
        var e = this._actorEntries[i];
        if (!e) continue;
        e.container.x = startX + (i * PORTRAIT_SPACING);
        e.container.y = TOP_OFFSET;
    }
};

/* === Visuals per frame === */
Window_TopRightDock.prototype.updateVisuals = function(){
    for (var i=0;i<this._actorEntries.length;i++){
        var e = this._actorEntries[i];
        var a = e.actor;
        if (!a) continue;

        // swap portrait by state
        var face = this.getPortraitName(a);
        if (a.hp/a.mhp < 0.25) face = this.getPortraitLowHP(a);
        else if (a.tp >= a.maxTp()/1.25) face = this.getPortraitBurn(a);
        e.sprite.bitmap = ImageManager.loadBitmap("img/battlefaces/", face);
        e.sprite.bitmap.smooth = false;

        this.updateRing(e);
        this.updateGauges(e);
        this.updateShake(e);
    }
};

/* === ATB/Charge ring (pulse, same behavior) === */
Window_TopRightDock.prototype.updateRing = function(entry){
    var a = entry.actor;
    var g = entry.ring;
    g.clear();

    var atb    = (a.atbRate && a.atbRate()) || 0;
    var charge = (a.atbChargeRate && a.atbChargeRate()) || 0;

    entry._atbPrev    += (atb    - entry._atbPrev)    * 0.25;
    entry._chargePrev += (charge - entry._chargePrev) * 0.25;

    var isCharging = a.isATBCharging && a.isATBCharging();
    var color = isCharging ? CHARGE_COLOR : ATB_COLOR;
    var rate  = isCharging ? (1 - entry._chargePrev) : entry._atbPrev;
    rate = Math.max(0, Math.min(rate, 1));

    var alpha = 0.9;
    if (isCharging || atb >= 0.999){
        var pulse = 0.8 + 0.2 * Math.sin(Graphics.frameCount * 0.25);
        alpha *= pulse;
    }

    g.lineStyle(3, color, alpha);
    try {
        g.arc(0, 0, (PORTRAIT_SIZE/2)+8, -Math.PI/2, -Math.PI/2 + rate * Math.PI * 2);
    } catch(e) {
        // segmented fallback
        var steps = Math.max(6, Math.floor(40 * rate));
        for (var s=0; s<steps; s++){
            var a1 = -Math.PI/2 + (s/steps)*rate*Math.PI*2;
            var a2 = -Math.PI/2 + ((s+1)/steps)*rate*Math.PI*2;
            g.moveTo(Math.cos(a1)*(PORTRAIT_SIZE/2+8), Math.sin(a1)*(PORTRAIT_SIZE/2+8));
            g.lineTo(Math.cos(a2)*(PORTRAIT_SIZE/2+8), Math.sin(a2)*(PORTRAIT_SIZE/2+8));
        }
    }
};

/* === Gauge helpers: build once, update scale X === */
function makeGradientSprite(w,h,c1,c2,vertical){
    var s = new Sprite(new Bitmap(w,h));
    s.bitmap.gradientFillRect(0,0,w,h,c1,c2,!!vertical);
    return s;
}
function makeSolidSprite(w,h,color,alpha){
    var g = new PIXI.Graphics();
    g.beginFill(color, alpha);
    g.drawRoundedRect(0,0,w,h,BORDER_RADIUS);
    g.endFill();
    var rt = PIXI.RenderTexture.create(w,h);
    Graphics._renderer.render(g, rt);
    return new PIXI.Sprite(rt);
}
function makeBorderSprite(w,h){
    var g = new PIXI.Graphics();
    g.lineStyle(BORDER_THIN, 0x000000, BORDER_ALPHA);
    g.drawRoundedRect(0,0,w,h,BORDER_RADIUS);
    var rt = PIXI.RenderTexture.create(w,h);
    Graphics._renderer.render(g, rt);
    return new PIXI.Sprite(rt);
}

Window_TopRightDock.prototype._ensureBars = function(entry){
    if (entry._bars) return;
    var g = entry.gauges;
    var w = GAUGE_WIDTH, h = GAUGE_HEIGHT;

    // fixed offset
    g.x = GAUGE_OFFSET_X;
    g.y = GAUGE_OFFSET_Y;

    entry._bars = {
        hp: {bg:null, fg:null, bd:null, txt:null, y:0},
        mp: {bg:null, fg:null, bd:null, txt:null, y:h+GAUGE_SPACING_Y},
        en: {bg:null, fg:null, bd:null, txt:null, y:(h+GAUGE_SPACING_Y)*2}
    };

    // Build rows once
    [["hp",GRAD_HP],["mp",GRAD_MP],["en",GRAD_EN]].forEach(function(pair){
        var key = pair[0], grad = pair[1];
        var row = entry._bars[key];

        // BG
        row.bg = makeSolidSprite(w,h,0x000000,0.65);
        row.bg.x = 0; row.bg.y = row.y; g.addChild(row.bg);

        // FG gradient
        row.fg = makeGradientSprite(w,h,grad[0],grad[1],false);
        row.fg.x = 0; row.fg.y = row.y;
        if (row.fg.anchor) row.fg.anchor.x = 0;
        row.fg.scale.x = 0.001; // visible minimum
        g.addChild(row.fg);

        // Border (soft, rounded)
        row.bd = makeBorderSprite(w,h);
        row.bd.x = 0; row.bd.y = row.y;
        g.addChild(row.bd);

        // Text
        row.txt = new PIXI.Text("", {
            fontFamily:"Arial", fontSize:12, fontWeight:"bold",
            fill:"#ffffff", stroke:"#000000", strokeThickness:2
        });
        row.txt.x = 4; row.txt.y = row.y-1;
        g.addChild(row.txt);
    });

    // fracture overlay for Burnout
    entry._fractureGfx = new PIXI.Graphics();
    entry._fractureGfx.y = entry._bars.en.y;
    g.addChild(entry._fractureGfx);
};

Window_TopRightDock.prototype.updateGauges = function(entry){
    this._ensureBars(entry);

    var a = entry.actor;
    var w = GAUGE_WIDTH;
    var h = GAUGE_HEIGHT;

    var hpRate = a.hpRate ? a.hpRate() : a.hp/a.mhp;
    var mpRate = a.mpRate ? a.mpRate() : a.mp/a.mmp;
    var tpRate = a.tpRate ? a.tpRate() : a.tp/a.maxTp();

    // Clamp & set scales
    var clamp = function(v){ return Math.max(0.001, Math.min(1, v||0)); };

    entry._bars.hp.fg.scale.x = clamp(hpRate);
    entry._bars.hp.txt.text   = Math.floor(a.hp)+"/"+a.mhp;

    entry._bars.mp.fg.scale.x = clamp(mpRate);
    entry._bars.mp.txt.text   = Math.floor(a.mp)+"/"+a.mmp;

    entry._bars.en.fg.scale.x = clamp(tpRate);
    entry._bars.en.txt.text   = "Burnout";

    // Fractures for Burnout (static cheap rebuild)
    var frac = entry._fractureGfx;
    frac.clear();
    if (tpRate > 0.75 && tpRate < 1.0){
        var cracks = Math.floor(5 + tpRate * 10);
        frac.lineStyle(1, 0xffb000, 0.9);
        for (var c=0;c<cracks;c++){
            var cx = Math.random() * w * tpRate;
            var cy = Math.random()*h;
            frac.moveTo(cx, cy);
            frac.lineTo(cx + (Math.random()*6-3), cy - (Math.random()*3));
        }
    } else if (tpRate >= 1.0){
        frac.lineStyle(2, 0xff0000, 1.0);
        for (var j=0;j<6;j++){
            var bx = Math.random() * w;
            var by = Math.random()*h;
            frac.moveTo(bx, by);
            frac.lineTo(bx + (Math.random()*10-5), by - (Math.random()*4));
        }
    }

    // rumble triggers
    if (a.hp !== entry._prevHp){ entry._shake = {p:SHAKE_STRENGTH_HP,dir:1}; entry._prevHp=a.hp; }
    else if (a.mp !== entry._prevMp){ entry._shake = {p:SHAKE_STRENGTH_MP,dir:1}; entry._prevMp=a.mp; }
    else if (a.tp !== entry._prevBo){ entry._prevBo=a.tp; } // burnout change only updates value, no shake
};

/* === Rumble === */
Window_TopRightDock.prototype.updateShake = function(entry){
    if (!entry._shake) return;
    var s = entry._shake;
    s.p *= SHAKE_DECAY;
    if (s.p < 0.3){ entry._shake=null; return; }
    var amp = s.p;
    entry.container.x += (Math.random()*2-1)*amp;
    entry.container.y += (Math.random()*1-0.5)*amp;
};

/* =========================
   == Add to Scene_Battle ==
   ========================= */
var _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function(){
    _Scene_Battle_createAllWindows.call(this);
    this._noqHud = new Window_TopRightDock();
    this.addChild(this._noqHud);
};

// Hide default bottom status while our HUD is present
var _Scene_Battle_createStatusWindow = Scene_Battle.prototype.createStatusWindow;
Scene_Battle.prototype.createStatusWindow = function(){
    _Scene_Battle_createStatusWindow.call(this);
    if (this._statusWindow){
        this._statusWindow.hide();
        this._statusWindow.visible = false;
        this._statusWindow.deactivate();
        this._statusWindow.openness = 0;
        this._statusWindow.height = 0;
    }
};

/* =========================
   == Anchor Command/Lists ==
   ========================= */
function findSpriteForActor(actor) {
    try {
        var scene = SceneManager._scene;
        if (!scene || !scene._spriteset) return null;
        var sprites = scene._spriteset._actorSprites || [];
        for (var i = 0; i < sprites.length; i++) {
            var s = sprites[i];
            if (!s) continue;
            if (s._actor && s._actor === actor) return s;
            if (typeof s.actor === "function" && s.actor() === actor) return s;
        }
    } catch (e) {}
    return null;
}
function anchorWindowToBattler(win, actor, offsetX) {
    try {
        if (!win || !actor) return;
        var scene = SceneManager._scene;
        if (!scene || !scene._spriteset) return;
        var sprite = findSpriteForActor(actor);
        if (!sprite) return;
        var spritesetX = scene._spriteset.x || 0;
        var spritesetY = scene._spriteset.y || 0;
        var spriteScreenX = Math.floor(sprite.x + spritesetX);
        var spriteScreenY = Math.floor(sprite.y + spritesetY);
        var desiredX = spriteScreenX + (typeof offsetX === "number" ? offsetX : CMD_OFFSET_X);
        var desiredY = spriteScreenY - Math.floor(win.height / 2);
        if (desiredX + win.width > Graphics.width - 8) {
            desiredX = spriteScreenX - win.width - (typeof offsetX === "number" ? offsetX : CMD_OFFSET_X);
        }
        if (desiredY < 8) desiredY = 8;
        if (desiredY + win.height > Graphics.height - 8) desiredY = Graphics.height - win.height - 8;
        win.x = Math.floor(desiredX);
        win.y = Math.floor(desiredY);
    } catch (e) {}
}

(function(){
    // Actor Command window: compact + anchored
    var _createACW = Scene_Battle.prototype.createActorCommandWindow;
    Scene_Battle.prototype.createActorCommandWindow = function(){
        _createACW.call(this);
        var w = this._actorCommandWindow;
        if (!w) return;

        w.standardFontSize = function(){ return 14; };
        w.standardPadding  = function(){ return 8;  };
        w.lineHeight       = function(){ return this.standardFontSize() + 8; };

        var _open = w.open;
        w.open = function(){
            try {
                this.width = 130;
                var rows = Math.min(4, this.maxItems ? Math.max(1, this.maxItems()) : 4);
                this.height = this.fittingHeight(rows);
                if (this.refresh) this.refresh();
            } catch (e) {}
            _open.call(this);
            if (this._actor) anchorWindowToBattler(this, this._actor, CMD_OFFSET_X);
        };

        var _update = w.update;
        w.update = function(){
            _update.call(this);
            if (this._actor && (this.visible || (this.isOpen && this.isOpen()))) {
                anchorWindowToBattler(this, this._actor, CMD_OFFSET_X);
            }
        };
    };

    // Skill & Item windows: open where command is; re-anchored each frame
    function placeAtCommand(win, scene){
        var cmd = scene._actorCommandWindow;
        if (cmd){
            win.x = cmd.x; win.y = cmd.y; win.width = cmd.width; win.height = cmd.height;
            if (win.refresh) win.refresh();
        } else {
            var actor = win._actor || (scene._actorCommandWindow && scene._actorCommandWindow._actor);
            if (actor) anchorWindowToBattler(win, actor, CMD_OFFSET_X);
        }
    }

    var _createAll = Scene_Battle.prototype.createAllWindows;
    Scene_Battle.prototype.createAllWindows = function(){
        _createAll.call(this);

        if (this._skillWindow){
            var sw = this._skillWindow;
            sw.standardFontSize = function(){ return 16; };
            sw.standardPadding  = function(){ return 8;  };
            sw.lineHeight       = function(){ return this.standardFontSize() + 8; };
            var _sopen = sw.open;
            sw.open = function(){
                _sopen.call(this);
                placeAtCommand(this, SceneManager._scene);
            };
            var _supdate = sw.update;
            sw.update = function(){
                _supdate.call(this);
                if (this.visible) placeAtCommand(this, SceneManager._scene);
            };
        }

        if (this._itemWindow){
            var iw = this._itemWindow;
            iw.standardFontSize = function(){ return 16; };
            iw.standardPadding  = function(){ return 8;  };
            iw.lineHeight       = function(){ return this.standardFontSize() + 8; };
            var _iopen = iw.open;
            iw.open = function(){
                _iopen.call(this);
                placeAtCommand(this, SceneManager._scene);
            };
            var _iupdate = iw.update;
            iw.update = function(){
                _iupdate.call(this);
                if (this.visible) placeAtCommand(this, SceneManager._scene);
            };
        }

        // EN popup (white badge)
        this._noqEnPopup = new Sprite_EnPopup();
        this.addChild(this._noqEnPopup);
    };

    // Keep EN popup updated
    var _sceneUpdate = Scene_Battle.prototype.update;
    Scene_Battle.prototype.update = function(){
        _sceneUpdate.call(this);
        if (this._noqEnPopup && this._skillWindow){
            this._noqEnPopup.updateForSkillWindow(this._skillWindow);
        }
    };
})();

/* =========================
   == EN Popup (white)    ==
   ========================= */
function Sprite_EnPopup(){
    this.initialize.apply(this, arguments);
}
Sprite_EnPopup.prototype = Object.create(PIXI.Container.prototype);
Sprite_EnPopup.prototype.constructor = Sprite_EnPopup;

Sprite_EnPopup.prototype.initialize = function(){
    PIXI.Container.call(this);
    this._bg = new PIXI.Graphics();
    this._label = new PIXI.Text("", {fontFamily:"Arial", fontSize:ENPOP_FONT_SIZE, fontWeight:"bold",
                                     fill:"#000000", align:"center"});
    this._label.anchor.set(0.5);
    this.addChild(this._bg);
    this.addChild(this._label);
    this.alpha = 0;
    this._targetAlpha = 0;
    this._lastSkillId = 0;
};

Sprite_EnPopup.prototype.setVisible = function(v){
    this._targetAlpha = v ? 1 : 0;
};

Sprite_EnPopup.prototype._currentSkill = function(sw){
    if (!sw || !sw._data) return null;
    var idx = sw.index();
    return idx >= 0 ? sw._data[idx] : null;
};

Sprite_EnPopup.prototype.updateForSkillWindow = function(sw){
    var skill = this._currentSkill(sw);
    var shouldShow = !!(sw && sw.visible && sw.isOpen && sw.isOpen() && skill);
    this.setVisible(shouldShow);

    // fade
    if (this.alpha < this._targetAlpha) this.alpha = Math.min(this._targetAlpha, this.alpha + ENPOP_FADE_SPEED);
    else if (this.alpha > this._targetAlpha) this.alpha = Math.max(this._targetAlpha, this.alpha - ENPOP_FADE_SPEED);

    if (!shouldShow) return;

    // EN (MP) only
    var en = 0;
    try { en = Number(skill.mpCost || skill.mp || 0); } catch (e) {}
    var text = "EN: " + en;
    if (this._lastSkillId !== (skill.id||0) || this._label.text !== text){
        this._label.text = text;
        this._lastSkillId = (skill.id||0);
        this._layout();
    }

    // position above skill window, centered
    var x = sw.x + Math.floor(sw.width/2);
    var y = sw.y - (this.height + 6);
    this.x = x;
    this.y = y;
};

Sprite_EnPopup.prototype._layout = function(){
    var pad = ENPOP_PADDING;
    var tw = Math.ceil(this._label.width);
    var th = Math.ceil(this._label.height);
    var w = tw + pad*2;
    var h = th + pad*2;

    this._bg.clear();
    this._bg.beginFill(0xffffff, 1.0); // WHITE badge
    this._bg.drawRoundedRect(-w/2, -h/2, w, h, 8);
    this._bg.endFill();

    // subtle outer stroke
    this._bg.lineStyle(2, 0x000000, 0.10);
    this._bg.drawRoundedRect(-w/2, -h/2, w, h, 8);
};

/* =========================
   == Skill costs (UI)    ==
   =========================
   Hide TP values & resource icons; draw MP only.
*/
(function(){
    // Draw ONLY MP using the window’s native MP routine (suppresses TP & icons).
    function drawSkillCost_NoTP_NoIcons(skill, x, y, w){
        if (this.drawMpCost) this.drawMpCost(skill, x, y, w); // MP only
        // Do NOT call drawTpCost, and do NOT draw any icons here.
    }
    function drawTpCostNoop(){ /* hide TP cost entirely */ }

    // Override on prototypes (Skill lists in menu/battle)
    if (typeof Window_SkillList !== "undefined"){
        Window_SkillList.prototype.drawSkillCost = drawSkillCost_NoTP_NoIcons;
        Window_SkillList.prototype.drawTpCost    = drawTpCostNoop;
    }
    if (typeof Window_BattleSkill !== "undefined"){
        Window_BattleSkill.prototype.drawSkillCost = drawSkillCost_NoTP_NoIcons;
        Window_BattleSkill.prototype.drawTpCost    = drawTpCostNoop;
    }

    // If YEP SkillCore tries to inject resource icons, this override prevents it by never calling icon draws.
    // We leave drawItemName intact so normal skill icons (next to names) still show.
})();

/* =========================
   == Chant FX (actors)   ==
   ========================= */
(function(){
var NOTE_SPAWN_RATE = 45;
var NOTE_LIFETIME   = 60;
var NOTE_COLOR      = "#9fff9f";

var _Sprite_Battler_update = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function(){
    _Sprite_Battler_update.call(this);
    if (this._battler && this._battler.isActor && this._battler.isActor()){
        this.updateChantFX();
    }
};

Sprite_Battler.prototype.updateChantFX = function(){
    if (!this._chantNotes) this._chantNotes = [];
    var actor = this._battler;
    if (!actor) return;

    var isCastingMagic = actor.isATBCharging && actor.isATBCharging() &&
                         actor._actions && actor._actions[0] &&
                         actor._actions[0].item && actor._actions[0].item() &&
                         actor._actions[0].item().stypeId === 1;

    if (isCastingMagic && Graphics.frameCount % NOTE_SPAWN_RATE === 0){
        var note = new PIXI.Text("♪",{
            fontFamily:"Arial",fontSize:16,fill:NOTE_COLOR,stroke:"#000",strokeThickness:3
        });
        note.anchor.set(0.5);
        note.x = (Math.random()*16)-8;
        note.y = -48 + (Math.random()*4-2);
        note.alpha = 0.9;
        note._vy = -0.3 - Math.random()*0.2;
        note._life = NOTE_LIFETIME;
        this.addChild(note);
        this._chantNotes.push(note);
    }

    for (var i=this._chantNotes.length-1;i>=0;i--){
        var n=this._chantNotes[i];
        n.y += n._vy;
        n.alpha -= 0.015;
        n.rotation += 0.02*Math.sin(Graphics.frameCount*0.1);
        n._life--;
        if (n._life<=0||n.alpha<=0){ this.removeChild(n); this._chantNotes.splice(i,1); }
    }
};
})();


/*:
 * @plugindesc (MV) NoqBurnoutHUD v1.9b — vivid gauges, anchored menus, fixed skill spacing, white EN popup, hidden ally target window (safe), bottom help, default icons only.
 * @author Noq
 *
 * @help
 * Requires YEP_X_BattleSysATB.js.
 * Place below all ATB/HUD-affecting plugins.
 */

(function() {
"use strict";

//--------------------------------------------
// CONFIG
//--------------------------------------------
var CMD_OFFSET_X = -160;
var HELP_Y_OFFSET = -8;

//--------------------------------------------
// Scene_Battle – fix freeze by keeping actorWindow active
//--------------------------------------------
var _Scene_Battle_createAllWindows = Scene_Battle.prototype.createAllWindows;
Scene_Battle.prototype.createAllWindows = function() {
  _Scene_Battle_createAllWindows.call(this);

  // Make ally target window invisible but functional
  if (this._actorWindow) {
    this._actorWindow.visible = false;
    this._actorWindow.opacity = 0;
    this._actorWindow.contentsOpacity = 0;
    this._actorWindow.backOpacity = 0;
    // Do NOT deactivate or close it — logic still needs to run
  }

  // Move help window to bottom full width
  if (this._helpWindow) {
    this._helpWindow.x = 0;
    this._helpWindow.width = Graphics.boxWidth;
    this._helpWindow.y = Graphics.boxHeight - this._helpWindow.height + HELP_Y_OFFSET;
  }
};

//--------------------------------------------
// Anchor logic
//--------------------------------------------
function findSpriteForActor(actor) {
  try {
    var scene = SceneManager._scene;
    if (!scene || !scene._spriteset) return null;
    var sprites = scene._spriteset._actorSprites || [];
    for (var i = 0; i < sprites.length; i++) {
      var s = sprites[i];
      if (!s) continue;
      if (s._actor && s._actor === actor) return s;
      if (typeof s.actor === "function" && s.actor() === actor) return s;
    }
  } catch (e) {}
  return null;
}

function anchorWindowToBattler(win, actor, offsetX) {
  try {
    if (!win || !actor) return;
    var scene = SceneManager._scene;
    if (!scene || !scene._spriteset) return;
    var sprite = findSpriteForActor(actor);
    if (!sprite) return;
    var sx = Math.floor(sprite.x + (scene._spriteset.x || 0));
    var sy = Math.floor(sprite.y + (scene._spriteset.y || 0));
    var desiredX = sx + (offsetX || CMD_OFFSET_X);
    var desiredY = sy - Math.floor(win.height / 2);
    if (desiredX + win.width > Graphics.width - 8)
      desiredX = sx - win.width - (offsetX || CMD_OFFSET_X);
    if (desiredY < 8) desiredY = 8;
    if (desiredY + win.height > Graphics.height - 8)
      desiredY = Graphics.height - win.height - 8;
    win.x = desiredX;
    win.y = desiredY;
  } catch (e) {}
}

//--------------------------------------------
// Compact Fight/Escape window anchored to battler
//--------------------------------------------
var _Scene_Battle_createPartyCommandWindow = Scene_Battle.prototype.createPartyCommandWindow;
Scene_Battle.prototype.createPartyCommandWindow = function() {
  _Scene_Battle_createPartyCommandWindow.call(this);
  var w = this._partyCommandWindow;
  if (!w) return;

  w.standardFontSize = function() { return 14; };
  w.standardPadding = function() { return 8; };
  w.lineHeight = function() { return this.standardFontSize() + 8; };

  var _open = w.open;
  w.open = function() {
    try {
      this.width = 130;
      this.height = this.fittingHeight(4);
      if (this.refresh) this.refresh();
    } catch (e) {}
    _open.call(this);
    var actor = BattleManager.actor();
    if (actor) anchorWindowToBattler(this, actor, CMD_OFFSET_X);
  };

  var _update = w.update;
  w.update = function() {
    _update.call(this);
    var actor = BattleManager.actor();
    if (actor && (this.visible || (this.isOpen && this.isOpen()))) {
      anchorWindowToBattler(this, actor, CMD_OFFSET_X);
    }
  };
};

//--------------------------------------------
// Compact skill/item list spacing
//--------------------------------------------
function fixListWindowLayout(win) {
  if (!win) return;
  win.standardFontSize = function() { return 16; };
  win.standardPadding = function() { return 8; };
  win.lineHeight = function() { return this.standardFontSize() + 10; };
}

var _Scene_Battle_createSkillWindow = Scene_Battle.prototype.createSkillWindow;
Scene_Battle.prototype.createSkillWindow = function() {
  _Scene_Battle_createSkillWindow.call(this);
  fixListWindowLayout(this._skillWindow);
};

var _Scene_Battle_createItemWindow = Scene_Battle.prototype.createItemWindow;
Scene_Battle.prototype.createItemWindow = function() {
  _Scene_Battle_createItemWindow.call(this);
  fixListWindowLayout(this._itemWindow);
};

//--------------------------------------------
// Reposition EN popup
//--------------------------------------------
var _Scene_Battle_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function() {
  _Scene_Battle_update.call(this);
  var scene = this;
  if (scene._noqEnPopup && scene._skillWindow) {
    var sw = scene._skillWindow;
    if (sw.visible && sw.isOpen && sw.isOpen()) {
      var skill = sw._data && sw._data[sw.index()];
      if (skill) {
        var en = Number(skill.mpCost || skill.mp || 0);
        var text = "EN: " + en;
        scene._noqEnPopup._label.text = text;
        var pad = 6;
        var w = scene._noqEnPopup._label.width + pad * 2;
        var h = scene._noqEnPopup._label.height + pad * 2;
        scene._noqEnPopup._bg.clear();
        scene._noqEnPopup._bg.beginFill(0xffffff, 1.0);
        scene._noqEnPopup._bg.drawRoundedRect(-w / 2, -h / 2, w, h, 8);
        scene._noqEnPopup._bg.endFill();
        scene._noqEnPopup._bg.lineStyle(2, 0x000000, 0.15);
        scene._noqEnPopup._bg.drawRoundedRect(-w / 2, -h / 2, w, h, 8);
        scene._noqEnPopup.x = sw.x + sw.width / 2;
        scene._noqEnPopup.y = sw.y + sw.height + 12;
        scene._noqEnPopup.visible = true;
        scene._noqEnPopup.alpha = 1;
      }
    } else {
      scene._noqEnPopup.visible = false;
    }
  }
};

//--------------------------------------------
// Disable YEP skill icons, keep default icons only
//--------------------------------------------
(function() {
  if (typeof Window_SkillList !== "undefined") {
    var _drawItem = Window_SkillList.prototype.drawItem;
    Window_SkillList.prototype.drawItem = function(index) {
      var skill = this._data[index];
      if (!skill) return;
      var rect = this.itemRect(index);
      var iconX = rect.x + 2;
      var iconY = rect.y + (rect.height - Window_Base._iconHeight) / 2;
      // Draw default icon only
      this.drawIcon(skill.iconIndex, iconX, iconY);
      this.resetTextColor();
      this.changePaintOpacity(this.isEnabled(skill));
      this.drawText(skill.name, iconX + 34, rect.y, rect.width - 40, "left");
      this.resetFontSettings();
    };
  }
})();
})();

/*:
 * @plugindesc (MV) NoqBurnoutHUD v1.9c — same as v1.9b but with smaller skill icons (24 px) for a cleaner layout.
 * @author Noq
 */

(function() {
"use strict";

// keep your entire HUD + command anchoring as-is (assumes v1.9b loaded above)

//--- Replace skill list icon draw with scaled version
if (typeof Window_SkillList !== "undefined") {

  // add scaled icon method
  Window_Base.prototype.drawIconScaled = function(iconIndex, x, y, size) {
    size = size || 24;
    var bitmap = ImageManager.loadSystem("IconSet");
    var pw = Window_Base._iconWidth;
    var ph = Window_Base._iconHeight;
    var sx = iconIndex % 16 * pw;
    var sy = Math.floor(iconIndex / 16) * ph;
    this.contents.blt(bitmap, sx, sy, pw, ph, x, y, size, size);
  };

  // replace skill draw
  Window_SkillList.prototype.drawItem = function(index) {
    var skill = this._data[index];
    if (!skill) return;
    var rect = this.itemRect(index);

    // smaller default icon (24 px)
    var iconSize = 18;
    var iconX = rect.x + 2;
    var iconY = rect.y + (rect.height - iconSize) / 2;
    this.drawIconScaled(skill.iconIndex, iconX, iconY, iconSize);

    // text
    this.resetTextColor();
    this.changePaintOpacity(this.isEnabled(skill));
    this.drawText(skill.name, iconX + iconSize + 6, rect.y, rect.width - iconSize - 10, "left");
    this.resetFontSettings();
  };
}

})();

/*:
 * @plugindesc (MV) Fix for disappearing skill cursor after cancel (NoqHUD compatibility)
 * @author Noq
 */
(function() {
"use strict";

const _Scene_Battle_commandSkill = Scene_Battle.prototype.commandSkill;
Scene_Battle.prototype.commandSkill = function() {
  _Scene_Battle_commandSkill.call(this);
  if (this._skillWindow) {
    this._skillWindow.activate();
    this._skillWindow.select(0);
  }
};

const _Scene_Battle_onSkillCancel = Scene_Battle.prototype.onSkillCancel;
Scene_Battle.prototype.onSkillCancel = function() {
  _Scene_Battle_onSkillCancel.call(this);
  if (this._actorCommandWindow) {
    this._actorCommandWindow.activate();
    this._actorCommandWindow.select(0);
  }
};
})();

/*:
 * @plugindesc (MV) Shrinks item icons in item window for NoqHUD layout.
 * @author Noq
 */
(function() {
"use strict";

if (typeof Window_ItemList !== "undefined") {
  Window_Base.prototype.drawIconScaled = function(iconIndex, x, y, size) {
    size = size || 18;
    const bitmap = ImageManager.loadSystem("IconSet");
    const pw = Window_Base._iconWidth;
    const ph = Window_Base._iconHeight;
    const sx = iconIndex % 16 * pw;
    const sy = Math.floor(iconIndex / 16) * ph;
    this.contents.blt(bitmap, sx, sy, pw, ph, x, y, size, size);
  };

  Window_ItemList.prototype.drawItem = function(index) {
    const item = this._data[index];
    if (!item) return;
    const rect = this.itemRect(index);
    const iconSize = 18;
    const iconX = rect.x + 2;
    const iconY = rect.y + (rect.height - iconSize) / 2;
    this.drawIconScaled(item.iconIndex, iconX, iconY, iconSize);
    this.resetTextColor();
    this.changePaintOpacity(this.isEnabled(item));
    this.drawText(item.name, iconX + iconSize + 6, rect.y, rect.width - iconSize - 8, "left");
    this.resetFontSettings();
  };
}
})();

/*:
 * @plugindesc (MV) NoqHUD Refinement Patch v1.2 — Forces 4 visible rows for Item window, fixes height resets.
 * @author Noq
 */

(function() {
"use strict";

/* --------------------------------------------------
 * 1. Skill cursor highlight covers full row
 * -------------------------------------------------- */
if (typeof Window_SkillList !== "undefined") {
  const _drawItemBackground = Window_SkillList.prototype.drawItemBackground;
  Window_SkillList.prototype.drawItemBackground = function(index) {
    const rect = this.itemRect(index);
    if (index === this.index()) {
      this.changePaintOpacity(0.15);
      this.contents.fillRect(rect.x, rect.y, rect.width, rect.height, "#ffffff");
      this.changePaintOpacity(1);
    } else if (_drawItemBackground) {
      _drawItemBackground.call(this, index);
    }
  };
}

/* --------------------------------------------------
 * 2. Force 3–4 visible rows in item window
 * -------------------------------------------------- */
if (typeof Scene_Battle !== "undefined") {
  const _Scene_Battle_createItemWindow = Scene_Battle.prototype.createItemWindow;
  Scene_Battle.prototype.createItemWindow = function() {
    _Scene_Battle_createItemWindow.call(this);
    const iw = this._itemWindow;
    if (!iw) return;

    // compact styling
    iw.standardFontSize = function() { return 14; };
    iw.standardPadding  = function() { return 8; };
    iw.lineHeight       = function() { return this.standardFontSize() + 6; };
    iw.opacity = 230;

    // one column only
    iw.maxCols = function() { return 1; };
    iw.numVisibleRows = function() { return 4; }; // 3 for shorter
    iw.height = iw.fittingHeight(4);
    iw.width = 150;

    // prevent YEP resizing
    iw._enforceHeight = function() {
      const target = this.fittingHeight(4);
      if (this.height !== target) {
        this.height = target;
        this.refresh();
      }
    };

    const _iw_update = iw.update;
    iw.update = function() {
      _iw_update.call(this);
      this._enforceHeight();
    };
  };
}

/* --------------------------------------------------
 * 3. Shrink item icons + readable text
 * -------------------------------------------------- */
if (typeof Window_ItemList !== "undefined") {
  Window_Base.prototype.drawIconScaled = function(iconIndex, x, y, size) {
    size = size || 18;
    const bitmap = ImageManager.loadSystem("IconSet");
    const pw = Window_Base._iconWidth;
    const ph = Window_Base._iconHeight;
    const sx = iconIndex % 16 * pw;
    const sy = Math.floor(iconIndex / 16) * ph;
    this.contents.blt(bitmap, sx, sy, pw, ph, x, y, size, size);
  };

  Window_ItemList.prototype.drawItem = function(index) {
    const item = this._data[index];
    if (!item) return;
    const rect = this.itemRect(index);
    const iconSize = 18;
    const iconX = rect.x + 4;
    const iconY = rect.y + (rect.height - iconSize) / 2;

    this.drawIconScaled(item.iconIndex, iconX, iconY, iconSize);

    this.resetTextColor();
    this.changePaintOpacity(this.isEnabled(item));
    this.contents.fontSize = 14;
    this.drawText(item.name, iconX + iconSize + 6, rect.y, rect.width - iconSize - 12, "left");
    this.resetFontSettings();
  };
}

})();

/*:
 * @plugindesc (MV) Final Fix — Forces Item Window to show 4 visible rows and stable height for NoqHUD.
 * @author Noq
 */

(function() {
"use strict";

const ROWS = 4;      // 👈 change to 3 if you want 3 visible items instead
const WIDTH = 150;
const ICON_SIZE = 18;
const FONT_SIZE = 14;
const PADDING = 8;

//-------------------------------------------
// Helper — enforce layout dynamically
//-------------------------------------------
function enforceItemWindowLayout(win) {
  if (!win) return;
  const targetHeight = win.fittingHeight(ROWS);

  // Fix core visual layout
  win.standardFontSize = function() { return FONT_SIZE; };
  win.standardPadding  = function() { return PADDING; };
  win.lineHeight       = function() { return this.standardFontSize() + 6; };
  win.opacity = 230;
  win.maxCols = function() { return 1; };
  win.numVisibleRows = function() { return ROWS; };
  win.width = WIDTH;

  // Apply every frame
  if (win.height !== targetHeight) {
    win.height = targetHeight;
    win.refresh();
  }
}

//-------------------------------------------
// Hook into Scene_Battle update to apply fix
//-------------------------------------------
const _Scene_Battle_update = Scene_Battle.prototype.update;
Scene_Battle.prototype.update = function() {
  _Scene_Battle_update.call(this);
  const iw = this._itemWindow;
  if (iw && iw.visible) enforceItemWindowLayout(iw);
};

//-------------------------------------------
// Draw smaller icons properly
//-------------------------------------------
if (typeof Window_ItemList !== "undefined") {
  Window_Base.prototype.drawIconScaled = function(iconIndex, x, y, size) {
    size = size || ICON_SIZE;
    const bitmap = ImageManager.loadSystem("IconSet");
    const pw = Window_Base._iconWidth;
    const ph = Window_Base._iconHeight;
    const sx = iconIndex % 16 * pw;
    const sy = Math.floor(iconIndex / 16) * ph;
    this.contents.blt(bitmap, sx, sy, pw, ph, x, y, size, size);
  };

  const _drawItem = Window_ItemList.prototype.drawItem;
  Window_ItemList.prototype.drawItem = function(index) {
    const item = this._data[index];
    if (!item) return;
    const rect = this.itemRect(index);
    const iconX = rect.x + 4;
    const iconY = rect.y + (rect.height - ICON_SIZE) / 2;
    this.drawIconScaled(item.iconIndex, iconX, iconY, ICON_SIZE);
    this.resetTextColor();
    this.changePaintOpacity(this.isEnabled(item));
    this.contents.fontSize = FONT_SIZE;
    this.drawText(item.name, iconX + ICON_SIZE + 6, rect.y, rect.width - ICON_SIZE - 12, "left");
    this.resetFontSettings();
  };
}

})();


/*:
 * @plugindesc (MV) NoqBurnoutHUD — Target Status Expansion + Harmony Integration v1.0
 * @author Noq
 * @requires YEP_BattleEngineCore
 *
 * @help
 * Adds richer information to the target window when selecting a skill target:
 *  • Hides Actor Command window while choosing a target.
 *  • Shows Buff/Debuff summary (colored text).
 *  • Shows State icons.
 *  • Shows current Harmony chain info (Skill + Verse).
 */

(function() {
  "use strict";

  //-----------------------------------------------------------------------------
  // Hide command window during target selection
  //-----------------------------------------------------------------------------
(function() {
  const _Scene_Battle_selectEnemySelection = Scene_Battle.prototype.selectEnemySelection;
  Scene_Battle.prototype.selectEnemySelection = function() {
    _Scene_Battle_selectEnemySelection.call(this);
    if (this._enemyWindow) {
      this._enemyWindow.refresh(); // Force re-render with our new drawItem
    }
  };
})();

  const _Scene_Battle_onEnemyOk = Scene_Battle.prototype.onEnemyOk;
  Scene_Battle.prototype.onEnemyOk = function() {
    if (this._actorCommandWindow) this._actorCommandWindow.show();
    _Scene_Battle_onEnemyOk.call(this);
  };

  const _Scene_Battle_onEnemyCancel = Scene_Battle.prototype.onEnemyCancel;
  Scene_Battle.prototype.onEnemyCancel = function() {
    if (this._actorCommandWindow) this._actorCommandWindow.show();
    _Scene_Battle_onEnemyCancel.call(this);
  };

  //-----------------------------------------------------------------------------
  // Extend Window_BattleEnemy to show rich info
  //-----------------------------------------------------------------------------
  const _Window_BattleEnemy_drawItem = Window_BattleEnemy.prototype.drawItem;
  Window_BattleEnemy.prototype.drawItem = function(index) {
    const enemy = this._enemies[index];
    if (!enemy) return;

    const rect = this.itemRectForText(index);
    this.resetTextColor();

    // 1. Enemy Name
    this.drawText(enemy.name(), rect.x, rect.y, rect.width);

    // 2. Buff/Debuff line
    const y2 = rect.y + this.lineHeight();
    const buffList = this.makeBuffSummary(enemy);
    this.drawTextEx(buffList, rect.x + 10, y2);

    // 3. State Icons
    const y3 = y2 + this.lineHeight();
    this.drawStateIcons(enemy, rect.x + 10, y3);

    // 4. Harmony Info (if active)
    const y4 = y3 + this.lineHeight();
    const harmonyText = this.makeHarmonyLine(enemy);
    if (harmonyText) {
      this.changeTextColor(this.textColor(14)); // cyan tone
      this.drawText(harmonyText, rect.x + 10, y4, rect.width);
    }

    // spacing between enemies
    this.contents.fontSize = 28;
  };

  //-----------------------------------------------------------------------------
  // Helper: Build Buff/Debuff summary line
  //-----------------------------------------------------------------------------
  Window_BattleEnemy.prototype.makeBuffSummary = function(enemy) {
    if (!enemy || !enemy.buffIcons) return "";

    const names = ["Verse","Atk","Def","M.Def","Agi","Resonance"];
    const params = [8,2,3,4,6,7]; // m.atk, atk, def, m.def, agi, luk
    let summary = "";

    for (let i = 0; i < params.length; i++) {
      const val = enemy._buffs[params[i]];
      if (val > 0) {
        this.changeTextColor(this.textColor(24)); // green
        summary += names[i] + "↑  ";
      } else if (val < 0) {
        this.changeTextColor(this.textColor(10)); // red
        summary += names[i] + "↓  ";
      }
    }

    // Burnout/HP/MP - shown as neutral text
    this.resetTextColor();
    summary += "HP/MP/Burnout";
    return summary;
  };

  //-----------------------------------------------------------------------------
  // Helper: Draw state icons inline
  //-----------------------------------------------------------------------------
  Window_BattleEnemy.prototype.drawStateIcons = function(enemy, x, y) {
    const icons = enemy.allIcons();
    if (!icons.length) return;
    const iconSize = Window_Base._iconWidth;
    for (let i = 0; i < icons.length; i++) {
      const ix = x + (i * (iconSize + 2));
      this.drawIcon(icons[i], ix, y);
    }
  };

  //-----------------------------------------------------------------------------
  // Helper: Harmony Info line
  //-----------------------------------------------------------------------------
  Window_BattleEnemy.prototype.makeHarmonyLine = function(enemy) {
    if (!enemy._harmonyQueue || enemy._harmonyQueue.length === 0) return "";
    const queue = enemy._harmonyQueue.slice(-3);
    const names = queue.map(e => {
      const skill = $dataSkills[e.id];
      return skill ? skill.name : "???";
    });
    return "Harmony: " + names.join(" + ");
  };

})();
})();






