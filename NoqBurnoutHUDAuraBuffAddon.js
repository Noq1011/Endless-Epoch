/*:
 * @plugindesc (MV) NoqBurnoutHUD – Buff/Debuff Panel + Aura FX add-on (v2.0a)
 * @author Noq
 * @help
 * Drop this BELOW your existing NoqBurnoutHUD. 
 * Adds:
 *  • Left-of-portrait Buff/Debuff panel (one icon each, cycles up to 4, fades when idle)
 *  • Green/Red Aura behind battler when they gain/lose a buff/debuff (~3s pulse)
 * Uses default IconSet. State icons remain unchanged in their original places.
 */
(function(){
"use strict";

/* =========================
   CONFIG
   ========================= */
var PANEL_ICON_SIZE     = 20;    // px (scaled from 32px IconSet)
var PANEL_BG_ALPHA      = 0.35;  // backdrop visibility for readability
var PANEL_CYCLE_FRAMES  = 48;    // frames per icon (≈0.8s @60fps)
var PANEL_MAX_EACH      = 4;     // max buff + max debuff in cycle
var PANEL_FADE_SPEED    = 0.08;  // alpha step per frame when showing/hiding
var PANEL_OFFSET_X      = -42;   // relative to portrait center (left side)
var PANEL_OFFSET_Y      = -2;    // small vertical alignment nudge

var AURA_LIFETIME       = 180;   // ~3 seconds @60fps
var AURA_COLOR_BUFF     = 0x00ff66;
var AURA_COLOR_DEBUFF   = 0xff3333;
var AURA_ALPHA_START    = 0.35;
var AURA_RADIUS         = 40;

/* =========================
   UTILITIES
   ========================= */
function findSpriteset(){ return SceneManager._scene && SceneManager._scene._spriteset; }

function findSpriteForBattler(battler){
    var ss = findSpriteset(); if (!ss) return null;
    var arr = battler.isActor() ? (ss._actorSprites||[]) : (ss._enemySprites||[]);
    for (var i=0;i<arr.length;i++){
        var s = arr[i];
        if (!s) continue;
        if (s._battler === battler) return s;
        if (typeof s.battler === "function" && s.battler() === battler) return s;
    }
    return null;
}

function clamp01(x){ return x<0?0:(x>1?1:x); }

function uniquePush(arr, val){
    if (arr.indexOf(val) < 0) arr.push(val);
}

/* =========================
   ICON SPRITES (from IconSet)
   ========================= */
function makeIconSprite(iconIndex, size){
    size = size || PANEL_ICON_SIZE;
    var bmp = ImageManager.loadSystem("IconSet");
    var spr = new Sprite(bmp);
    var pw = Window_Base._iconWidth || 32;
    var ph = Window_Base._iconHeight|| 32;
    var cols = Math.max(1, Math.floor(bmp.width / pw));
    var sx = (iconIndex % cols) * pw;
    var sy = Math.floor(iconIndex / cols) * ph;
    spr.setFrame(sx, sy, pw, ph);
    var s = size / pw;
    spr.scale.set(s,s);
    spr.anchor.set(0.5,0.5);
    return spr;
}

/* =========================
   BUFF/DEBUFF PANEL (HUD)
   ========================= */
function entriesArrayFromDock(dock){
    // Compatible with your older/newer Noq HUD builds
    return dock._actorEntries || dock._actorContainers || [];
}

function ensurePanel(entry){
    if (entry._noqBuffPanel) return;
    var cont = new PIXI.Container();
    entry.container.addChild(cont);

    // subtle bg squares for readability
    var bgBuff = new PIXI.Graphics();
    bgBuff.beginFill(0x000000, PANEL_BG_ALPHA);
    bgBuff.drawRoundedRect(-PANEL_ICON_SIZE/2-2, -PANEL_ICON_SIZE/2-2, PANEL_ICON_SIZE+4, PANEL_ICON_SIZE+4, 4);
    bgBuff.endFill();

    var bgDeb = new PIXI.Graphics();
    bgDeb.beginFill(0x000000, PANEL_BG_ALPHA);
    bgDeb.drawRoundedRect(-PANEL_ICON_SIZE/2-2, -PANEL_ICON_SIZE/2-2, PANEL_ICON_SIZE+4, PANEL_ICON_SIZE+4, 4);
    bgDeb.endFill();

    var sprBuff = makeIconSprite(0, PANEL_ICON_SIZE); sprBuff.visible = false; sprBuff.alpha = 0;
    var sprDeb  = makeIconSprite(0, PANEL_ICON_SIZE); sprDeb.visible  = false; sprDeb.alpha  = 0;

    // Layout: [Debuff] [Buff] (both left of portrait center)
    // Center this panel to the left; give small gap between boxes
    var gap = PANEL_ICON_SIZE + 8;
    var group = new PIXI.Container();
    group.addChild(bgDeb);  group.addChild(sprDeb);
    var g2 = new PIXI.Container();
    g2.addChild(bgBuff); g2.addChild(sprBuff);

    group.x = -gap/2; group.y = 0;
    g2.x    =  gap/2; g2.y    = 0;

    cont.addChild(group);
    cont.addChild(g2);

    cont.x = - ( ( (entry.sprite && entry.sprite.width) ? entry.sprite.width : 0 )/2 ) + PANEL_OFFSET_X;
    cont.y = PANEL_OFFSET_Y;

    entry._noqBuffPanel = {
        root: cont,
        bgBuff: g2, bgDeb: group,
        sprBuff: sprBuff,
        sprDeb:  sprDeb,
        buffList: [],
        debList:  [],
        buffIdx: 0,
        debIdx:  0,
        cycle: 0,
        alphaTarget: 0
    };
}

// Collect param buff/debuff icons directly from the battler’s _buffs
function collectBuffDebuffIcons(actor){
    var buffs = [];
    var debuffs = [];
    try{
        var arr = actor._buffs || [];
        for (var p=0; p<arr.length; p++){
            var lv = arr[p]||0;
            if (lv>0){
                var ic = actor.buffIconIndex(p, lv);
                if (ic>0) uniquePush(buffs, ic);
            }else if(lv<0){
                var ic2 = actor.buffIconIndex(p, lv);
                if (ic2>0) uniquePush(debuffs, ic2);
            }
        }
    }catch(e){}
    // hard limit
    if (buffs.length > PANEL_MAX_EACH) buffs = buffs.slice(0, PANEL_MAX_EACH);
    if (debuffs.length > PANEL_MAX_EACH) debuffs = debuffs.slice(0, PANEL_MAX_EACH);
    return {buffs:buffs, debuffs:debuffs};
}

function updatePanelForEntry(entry){
    if (!entry || !entry.actor) return;
    ensurePanel(entry);
    var p = entry._noqBuffPanel;
    var a = entry.actor;

    // Refresh lists every cycle (and also if counts changed)
    if (p.cycle % PANEL_CYCLE_FRAMES === 0){
        var lists = collectBuffDebuffIcons(a);
        p.buffList = lists.buffs;
        p.debList  = lists.debuffs;
        if (p.buffIdx >= p.buffList.length) p.buffIdx = 0;
        if (p.debIdx  >= p.debList.length)  p.debIdx  = 0;
    }
    p.cycle++;

    var hasAny = (p.buffList.length>0 || p.debList.length>0);
    p.alphaTarget = hasAny ? 1 : 0;

    // Fade in/out whole panel smoothly
    var cur = p.root.alpha || 0;
    if (Math.abs(cur - p.alphaTarget) > 0.01){
        p.root.alpha = cur + (p.alphaTarget>cur ? PANEL_FADE_SPEED : -PANEL_FADE_SPEED);
        if ((p.alphaTarget>cur && p.root.alpha>1) || (p.alphaTarget<cur && p.root.alpha<0)) p.root.alpha = p.alphaTarget;
    }

    // Every PANEL_CYCLE_FRAMES, advance the icons
    if (p.cycle % PANEL_CYCLE_FRAMES === 1){
        // BUFF
        if (p.buffList.length > 0){
            var ic = p.buffList[p.buffIdx];
            p.sprBuff.setFrame(0,0,0,0); // avoid stale
            var pw = Window_Base._iconWidth || 32, ph = Window_Base._iconHeight|| 32;
            var set = ImageManager.loadSystem('IconSet');
            var cols = Math.max(1, Math.floor(set.width / pw));
            var sx = (ic % cols) * pw;
            var sy = Math.floor(ic / cols) * ph;
            p.sprBuff.setTexture(set);
            p.sprBuff.setFrame(sx, sy, pw, ph);
            p.sprBuff.visible = true; p.sprBuff.alpha = 0;
            p.buffIdx = (p.buffIdx + 1) % p.buffList.length;
        }else{
            p.sprBuff.visible = false;
        }
        // DEBUFF
        if (p.debList.length > 0){
            var ic2 = p.debList[p.debIdx];
            var pw2 = Window_Base._iconWidth || 32, ph2 = Window_Base._iconHeight|| 32;
            var set2 = ImageManager.loadSystem('IconSet');
            var cols2 = Math.max(1, Math.floor(set2.width / pw2));
            var sx2 = (ic2 % cols2) * pw2;
            var sy2 = Math.floor(ic2 / cols2) * ph2;
            p.sprDeb.setTexture(set2);
            p.sprDeb.setFrame(sx2, sy2, pw2, ph2);
            p.sprDeb.visible = true; p.sprDeb.alpha = 0;
            p.debIdx = (p.debIdx + 1) % p.debList.length;
        }else{
            p.sprDeb.visible = false;
        }
    }

    // Per-frame small fade on current icons (if visible)
    if (p.sprBuff.visible) p.sprBuff.alpha = clamp01(p.sprBuff.alpha + 0.12);
    if (p.sprDeb.visible)  p.sprDeb.alpha  = clamp01(p.sprDeb.alpha  + 0.12);

    // Keep panel positioned left of portrait
    try{
        p.root.x = - ( ( (entry.sprite && entry.sprite.width) ? entry.sprite.width : 0 )/2 ) + PANEL_OFFSET_X;
        p.root.y = PANEL_OFFSET_Y;
    }catch(e){}
}

// --- Safe hook: wait until Window_TopRightDock is actually defined ---
(function waitForDock(){
    if (typeof Window_TopRightDock === "undefined") {
        return setTimeout(waitForDock, 50); // retry until loaded
    }
    var _Noq_TopDock_updateVisuals = Window_TopRightDock.prototype.updateVisuals;
    Window_TopRightDock.prototype.updateVisuals = function(){
        if (_Noq_TopDock_updateVisuals) _Noq_TopDock_updateVisuals.call(this);
        var list = entriesArrayFromDock(this);
        for (var i=0;i<list.length;i++){
            var e = list[i];
            if (!e || !e.actor) continue;
            updatePanelForEntry(e);
        }
    };
})();

/* =========================
   AURA FX (Battler Sprite)
   ========================= */
function spawnAuraFor(battler, isBuff){
    var spr = findSpriteForBattler(battler);
    if (!spr) return;

    if (!spr._noqAuras) spr._noqAuras = [];

    var g = new PIXI.Graphics();
    g.beginFill(isBuff?AURA_COLOR_BUFF:AURA_COLOR_DEBUFF, AURA_ALPHA_START);
    g.drawCircle(0, 0, AURA_RADIUS);
    g.endFill();
    g.alpha = AURA_ALPHA_START;
    g._life = AURA_LIFETIME;
    g._t = 0;

    // place behind the battler body
    try{
        spr.addChildAt(g, 0);
    }catch(_){
        spr.addChild(g);
    }

    spr._noqAuras.push(g);
}

// update auras per frame
var _Sprite_Battler_update = Sprite_Battler.prototype.update;
Sprite_Battler.prototype.update = function(){
    _Sprite_Battler_update.call(this);
    if (!this._noqAuras || !this._noqAuras.length) return;
    for (var i=this._noqAuras.length-1; i>=0; i--){
        var a = this._noqAuras[i];
        a._t++;
        // soft pulse & fade out
        var prog = a._t / AURA_LIFETIME;
        a.alpha = AURA_ALPHA_START * (1.0 - prog);
        var pulse = 1.0 + 0.06*Math.sin(a._t*0.3);
        a.scale.set(pulse, pulse);
        if (a._t >= AURA_LIFETIME){
            if (a.parent) a.parent.removeChild(a);
            this._noqAuras.splice(i,1);
        }
    }
};

// hook buff changes to trigger aura
function patchBuffHooks(){
    var GB = Game_Battler.prototype;

    var _addBuff    = GB.addBuff;
    var _addDebuff  = GB.addDebuff;
    var _removeBuff = GB.removeBuff;
    var _eraseBuff  = GB.eraseBuff;

    GB.addBuff = function(paramId, turns){
        var before = this._buffs[paramId] || 0;
        _addBuff.call(this, paramId, turns);
        if (this._buffs[paramId] > before) spawnAuraFor(this, true);
    };

    GB.addDebuff = function(paramId, turns){
        var before = this._buffs[paramId] || 0;
        _addDebuff.call(this, paramId, turns);
        if (this._buffs[paramId] < before) spawnAuraFor(this, false);
    };

    GB.removeBuff = function(paramId){
        var before = this._buffs[paramId] || 0;
        _removeBuff.call(this, paramId);
        if (before > 0 && this._buffs[paramId] <= 0) spawnAuraFor(this, false);
    };

    GB.eraseBuff = function(paramId){
        var before = this._buffs[paramId] || 0;
        _eraseBuff.call(this, paramId);
        if (before !== 0) spawnAuraFor(this, false);
    };
}

/* =========================
   CLEANUP ON BATTLE END
   ========================= */
var _Scene_Battle_terminate = Scene_Battle.prototype.terminate;
Scene_Battle.prototype.terminate = function(){
    try{
        var ss = findSpriteset();
        if (ss){
            var all = []
                .concat(ss._actorSprites||[])
                .concat(ss._enemySprites||[]);
            for (var i=0;i<all.length;i++){
                var s = all[i];
                if (!s) continue;
                if (s._noqAuras){
                    for (var j=0;j<s._noqAuras.length;j++){
                        var a = s._noqAuras[j];
                        if (a && a.parent) a.parent.removeChild(a);
                    }
                    s._noqAuras.length = 0;
                }
            }
        }
    }catch(_){}
    _Scene_Battle_terminate.call(this);
};

})();