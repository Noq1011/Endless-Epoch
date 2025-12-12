
/*:
 * @target MV
 * @plugindesc (MV, ES5) Noq Command Radial Auras — pulse/halo around the circular command window based on actor states.
 * @author Noq
 * @help
 *  - Independent of UBS & command code. Only reads the current actor’s states.
 *  - Draws a PIXI ring on top of the radial container when configured states are active.
 *  - Default: burnout aura for UBS.DEFAULT_BURNOUT_STATE_ID (or 17).
 *
 *  API:
 *    NoqCmdAuras.define(stateId, { color, alpha, pulse, thick, margin, autoRadius, radius,
 *                                  pulseMin, pulseMax, pulseSpeed, prio })
 *    NoqCmdAuras.clear(stateId?) // clear one or all
 *
 *  Notes:
 *    - If autoRadius=true (default), the ring radius matches your radial’s circle size,
 *      with an extra margin (default 8px). You can force a fixed radius with `radius`.
 *    - Highest `prio` wins if multiple matching states are active.
 */

(function(){
'use strict';

/* =============== Public API =============== */
var A = window.NoqCmdAuras || (window.NoqCmdAuras = {});
A.map = A.map || Object.create(null);

/** Define/override an aura for a state ID. */
A.define = function(stateId, opts){
  if (!stateId) return;
  var o = Object.assign({
    color: 0xff7a22,     // ring color
    alpha: 1.0,          // used when pulse=false
    pulse: true,         // pulsing alpha?
    thick: 4,            // line thickness
    margin: 8,           // extra radius beyond radial ring
    autoRadius: true,    // try to match the radial's ring size
    radius: 56,          // used if autoRadius=false
    pulseMin: 0.70,
    pulseMax: 1.00,
    pulseSpeed: 0.18,
    prio: 0
  }, opts||{});
  A.map[stateId|0] = o;
};

/** Clear one state’s aura, or all. */
A.clear = function(stateId){
  if (stateId == null) { A.map = Object.create(null); return; }
  delete A.map[stateId|0];
};

/* Default burnout aura (uses UBS.DEFAULT_BURNOUT_STATE_ID if present) */
var BO_ID = (window.UBS && UBS.DEFAULT_BURNOUT_STATE_ID) || 17;
if (!A.map[BO_ID]){
  A.define(BO_ID, { prio: 10, color: 0xff7a22, thick: 4, pulseMin: 0.70, pulseMax: 1.00, pulseSpeed: 0.18 });
}

/* =============== Internals =============== */
function currentActor(){
  return (window.BattleManager && BattleManager.actor && BattleManager.actor()) || null;
}

function pickAuraFor(battler){
  if (!battler || !battler.states) return null;
  var sts = battler.states(); if (!sts || !sts.length) return null;
  var best=null, bestId=0, pr=-1;
  for (var i=0;i<sts.length;i++){
    var id = sts[i] && sts[i].id; if (!id) continue;
    var def = A.map[id|0]; if (!def) continue;
    var p = def.prio||0;
    if (p > pr){ pr = p; best = def; bestId = id; }
  }
  return best ? { id: bestId, def: best } : null;
}

function ensureOverlay(rad){
  if (!rad || !rad._container) return null;
  if (rad._noqCmdAura) return rad._noqCmdAura;
  var g = new PIXI.Graphics();
  g.visible = false;
  g.alpha = 0;
  g.blendMode = PIXI.BLEND_MODES.ADD;
  // put on top of ring/labels
  rad._container.addChild(g);
  rad._noqCmdAura = g;
  rad._noqCmdAuraStateId = 0;
  rad._noqCmdAuraTheta = 0;
  rad._noqCmdAuraDef = null;
  return g;
}

function computeBaseRadius(rad, def){
  // Try to infer from radial._ring bounds; fallback to def.radius.
  if (def && def.autoRadius !== false && rad && rad._ring && typeof rad._ring.getBounds === 'function'){
    try{
      var b = rad._ring.getBounds(); // world bounds
      var r = Math.max(b.width, b.height) * 0.5; // world-space radius
      // Since we draw inside the same container, world/local scales match here.
      return Math.max(8, Math.round(r + (def.margin||0)));
    }catch(e){}
  }
  return def ? (def.radius|0) || 56 : 56;
}

function redraw(rad, def){
  var g = ensureOverlay(rad); if (!g) return;
  g.clear();
  var r = computeBaseRadius(rad, def);
  var thick = (def.thick|0)||1, col = def.color|0;
  g.lineStyle(thick, col, 1);
  // Segmented circle (PIXI arc is fine, but segments are extra safe)
  var segs = 72;
  for (var i=0;i<segs;i++){
    var a1 = (i/segs)*Math.PI*2, a2 = ((i+1)/segs)*Math.PI*2;
    g.moveTo(Math.cos(a1)*r, Math.sin(a1)*r);
    g.lineTo(Math.cos(a2)*r, Math.sin(a2)*r);
  }
  g.visible = true;
}

/* Hook Scene_Battle.update to drive aura (lightweight) */
if (window.Scene_Battle){
  var _SB_update = Scene_Battle.prototype.update;
  Scene_Battle.prototype.update = function(){
    _SB_update.call(this);

    var rad = this._noqCircularCmd;
    if (!rad || !rad._container) return;

    var aura = ensureOverlay(rad);
    // Show only when the radial is actually visible
    var radialVisible = !!(rad.visible && rad._container.visible && rad._container.alpha > 0.01);

    var act = currentActor();
    var pick = radialVisible ? pickAuraFor(act) : null;

    if (!pick){
      // fade out if present
      if (aura && aura.visible){
        aura.alpha = Math.max(0, aura.alpha - 0.12);
        if (aura.alpha <= 0) aura.visible = false;
      }
      rad._noqCmdAuraStateId = 0; rad._noqCmdAuraDef = null;
      return;
    }

    // If state changed or first time, redraw
    if (rad._noqCmdAuraStateId !== pick.id){
      rad._noqCmdAuraStateId = pick.id;
      rad._noqCmdAuraTheta = 0;
      rad._noqCmdAuraDef = pick.def;
      redraw(rad, pick.def);
      aura.alpha = 0; // fade in
      aura.visible = true;
    }

    // Animate
    var def = rad._noqCmdAuraDef || pick.def;
    if (!def) return;

    if (def.pulse){
      rad._noqCmdAuraTheta += (def.pulseSpeed || 0.15);
      var kMin = (def.pulseMin != null ? def.pulseMin : 0.65);
      var kMax = (def.pulseMax != null ? def.pulseMax : 1.00);
      var k = kMin + (kMax - kMin) * (0.5 + 0.5*Math.sin(rad._noqCmdAuraTheta));
      aura.alpha = k;
      aura.visible = true;
    } else {
      var target = (def.alpha != null ? def.alpha : 1.0);
      aura.alpha += (target - aura.alpha) * 0.2;
      aura.visible = true;
    }
  };
}

/* ===== Quick examples you can call from the console ===== */
// NoqCmdAuras.define(4, { color: 0x3bd675, prio: 1 });   // Poison ring
// NoqCmdAuras.define(5, { color: 0xffe066, pulse:false, alpha:0.9, prio: 5 }); // Stun solid

})();

})();