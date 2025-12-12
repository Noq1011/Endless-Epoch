/*:
 * @plugindesc (MV) Noq Generate Anim Templates v1.0 — Adds ~250 GUI-editable animation templates + helpers for YEP Action Sequences.
 * @author Noq
 *
 * @help
 * - Creates ~250 named templates in $dataAnimations at load (first time).
 * - Uses simple 1–3 cel patterns, vivid flashes, and default RTP SEs.
 * - Fully tweakable in the Animations editor (rename, move, resize, re-sheet).
 * - Safe: appends after your existing animations; won’t overwrite.
 *
 * Params let you map categories to your sprite sheets in /img/animations/.
 *
 * USAGE (with YEP Action Sequences):
 *   SCRIPT: var id = NoqAnim.id("TPL Fire • Burst 07"); a.startAnimation(id);
 * or simpler if you know the number after load:
 *   ACTION ANIMATION: target, <that id>
 *
 * You can print the generated name→id table:
 *   SCRIPT: console.table(NoqAnim.nameToId)
 *
 * @param EnableGeneration
 * @type boolean
 * @text Enable Generation
 * @desc Turn off after you’re done generating the pack to avoid re-making.
 * @default true
 *
 * @param PerCategoryCount
 * @type number
 * @min 1
 * @max 50
 * @text Templates per Category
 * @default 25
 *
 * @param Sheet_Fire
 * @type file
 * @dir img/animations
 * @text Sheet: Fire
 * @desc Animation sheet used for Fire templates (fallback to "Explosion2").
 * @default
 *
 * @param Sheet_Ice
 * @type file
 * @dir img/animations
 * @text Sheet: Ice
 * @desc Fallback "Ice1".
 * @default
 *
 * @param Sheet_Thunder
 * @type file
 * @dir img/animations
 * @text Sheet: Thunder
 * @desc Fallback "Thunder2".
 * @default
 *
 * @param Sheet_Water
 * @type file
 * @dir img/animations
 * @text Sheet: Water
 * @desc Fallback "Water1".
 * @default
 *
 * @param Sheet_Wind
 * @type file
 * @dir img/animations
 * @text Sheet: Wind
 * @desc Fallback "Wind1".
 * @default
 *
 * @param Sheet_Earth
 * @type file
 * @dir img/animations
 * @text Sheet: Earth
 * @desc Fallback "Earth1".
 * @default
 *
 * @param Sheet_Slash
 * @type file
 * @dir img/animations
 * @text Sheet: Slash
 * @desc Fallback "Slash1".
 * @default
 *
 * @param Sheet_Arcane
 * @type file
 * @dir img/animations
 * @text Sheet: Arcane
 * @desc Fallback "Darkness1".
 * @default
 *
 * @param Sheet_Light
 * @type file
 * @dir img/animations
 * @text Sheet: Light
 * @desc Fallback "Light1".
 * @default
 *
 * @param Sheet_Shadow
 * @type file
 * @dir img/animations
 * @text Sheet: Shadow
 * @desc Fallback "Darkness2".
 * @default
 */

(function() {
"use strict";

var Param = PluginManager.parameters("Noq_GenerateAnimTemplates") || {};
var ENABLE = String(Param.EnableGeneration || "true") === "true";
var PER_CAT = Math.max(1, Number(Param.PerCategoryCount||25));

var SHEETS = {
  Fire:    Param.Sheet_Fire    || "Explosion2",
  Ice:     Param.Sheet_Ice     || "Ice1",
  Thunder: Param.Sheet_Thunder || "Thunder2",
  Water:   Param.Sheet_Water   || "Water1",
  Wind:    Param.Sheet_Wind    || "Wind1",
  Earth:   Param.Sheet_Earth   || "Earth1",
  Slash:   Param.Sheet_Slash   || "Slash1",
  Arcane:  Param.Sheet_Arcane  || "Darkness1",
  Light:   Param.Sheet_Light   || "Light1",
  Shadow:  Param.Sheet_Shadow  || "Darkness2"
};

var CATEGORIES = [
  // name, sheetKey, sePool, flashColor
  ["Fire",    "Fire",    ["Fire1","Explosion2","Fire2"],    [255,120, 20,160]],
  ["Ice",     "Ice",     ["Ice1","Ice2","Ice3"],            [140,220,255,160]],
  ["Thunder", "Thunder", ["Thunder2","Thunder3"],           [255,240, 20,160]],
  ["Water",   "Water",   ["Water1","Water2"],               [ 40,180,255,140]],
  ["Wind",    "Wind",    ["Wind1","Wind2"],                 [160,255,180,140]],
  ["Earth",   "Earth",   ["Earth1","Earth2"],               [160,120, 80,160]],
  ["Slash",   "Slash",   ["Slash1","Slash2"],               [255,255,255,120]],
  ["Arcane",  "Arcane",  ["Darkness1","Darkness2"],         [200, 80,255,160]],
  ["Light",   "Light",   ["Saint1","Light1"],               [255,255,255,200]],
  ["Shadow",  "Shadow",  ["Darkness1","Darkness2"],         [ 40,  0, 60,180]]
];

window.NoqAnim = window.NoqAnim || {
  nameToId:{},
  id: function(name){ return this.nameToId[name] || 0; }
};

function makeBaseAnimObject() {
  // Matches MV’s Animations schema
  return {
    id: 0,
    name: "",
    animation1Hue: 0,
    animation1Name: "",
    animation2Hue: 0,
    animation2Name: "",
    position: 1, // 0 head, 1 center, 2 feet, 3 screen
    frameMax: 30,
    frames: [],     // array of arrays (per frame) of cel objects
    timings: []     // array of {frame, se, flashScope, flashColor, flashDuration}
  };
}

// simple cel maker (1 tile at grid pos)
function cel(x, y, pattern, zoom, rotation, mirror, opacity, blendMode) {
  return {
    // Each cel:
    //  pattern: index into sheet (0..max), mv editor will show it
    pattern: pattern, 
    // coordinates (-100..100 roughly centered)
    x: x, y: y,
    zoom: zoom || 100, // %
    rotation: rotation || 0,
    mirror: !!mirror,
    opacity: (opacity==null? 255 : opacity),
    blendMode: blendMode||0
  };
}

function pushFrames(anim, set) {
  // set: array of frame arrays
  for (var i=0;i<set.length;i++) {
    anim.frames.push(set[i]);
  }
}

function timing(frame, seName, flashColor, flashScope, flashDuration) {
  return {
    frame: frame,
    se: seName ? {name: seName, pan:0, pitch:100, volume:90} : {name:"",pan:0,pitch:100,volume:90},
    flashScope: (flashScope==null? 1 : flashScope), // 0=None,1=Target,2=Screen,3=Hide target
    flashColor: flashColor || [255,255,255,160],
    flashDuration: flashDuration==null? 12 : flashDuration
  };
}

function buildPatternTriplet(patternBase, spread, zoomBase) {
  // three cels around center with slight offsets
  var dx = spread||12;
  var z  = zoomBase||100;
  return [
    cel( 0, 0, patternBase,   z,   0, false, 255, 0),
    cel(-dx, 6, patternBase+1, z,  10, false, 225, 0),
    cel( dx,-6, patternBase+2, z, -10, false, 225, 0),
  ];
}

function quickFrames(patternStart, frames, zoom, spread) {
  // returns an array of frame arrays length=frames
  var arr = [];
  for (var f=0; f<frames; f++) {
    var p = patternStart + (f % 4); // cycle patterns a bit
    arr.push(buildPatternTriplet(p, spread, zoom));
  }
  return arr;
}

function buildTemplate(name, sheetName, color, sePool) {
  var A = makeBaseAnimObject();
  A.name = name;
  A.animation1Name = sheetName; // MV editor: upper sheet
  A.animation2Name = "";        // lower sheet (unused)
  A.position = 1;               // center on target
  A.frameMax = 28 + Math.floor(Math.random()*6);

  // Frames: quick layered motion
  var part1 = quickFrames(0, 8,  80, 10);
  var part2 = quickFrames(4, 8, 100, 12);
  var part3 = quickFrames(8, 8, 120, 14);
  pushFrames(A, part1.concat(part2).concat(part3));

  // Timings (SFX + flashes)
  var pick = function(pool){ return pool[(Math.random()*pool.length)|0]; };
  A.timings.push(timing(6,  pick(sePool), color, 1, 10));
  A.timings.push(timing(14, pick(sePool), color, 1, 12));
  A.timings.push(timing(20, pick(sePool), [color[0],color[1],color[2], 90], 2, 10));

  return A;
}

function generatePack() {
  if (!ENABLE) return;
  if (!$dataAnimations || !$dataAnimations.length) return;

  // Avoid duplicating if already generated during this session
  if (NoqAnim._generated) return;
  NoqAnim._generated = true;

  var baseCount = $dataAnimations.length;
  // Ensure null at index 0 for MV
  if (!$dataAnimations[0]) $dataAnimations[0] = null;

  var countPer = PER_CAT;
  var created = 0;

  for (var ci=0; ci<CATEGORIES.length; ci++) {
    var cat = CATEGORIES[ci];
    var catName = cat[0], sheetKey = cat[1], sePool = cat[2], flash = cat[3];
    var sheet = SHEETS[sheetKey];

    for (var n=1; n<=countPer; n++) {
      var name = "TPL " + catName + " • " + (
        (catName==="Slash") ? "Arc " :
        (catName==="Thunder") ? "Bolt " :
        (catName==="Earth") ? "Burst " :
        (catName==="Wind") ? "Gust " :
        (catName==="Water") ? "Wave " :
        (catName==="Light") ? "Ray " :
        (catName==="Shadow") ? "Veil " :
        (catName==="Arcane") ? "Sigil " :
        (catName==="Ice") ? "Spike " : "Burst "
      ) + (n<10?("0"+n):n);

      var anim = buildTemplate(name, sheet, flash, sePool);
      anim.id = $dataAnimations.length;
      $dataAnimations.push(anim);
      NoqAnim.nameToId[name] = anim.id;
      created++;
    }
  }

  console.log("Noq_AnimTemplates: created "+created+" templates.");
  // Helpful preview:
  try { console.table(NoqAnim.nameToId); } catch(e){}
}

// Hook after database load
var _DataManager_onLoad = DataManager.onLoad;
DataManager.onLoad = function(object) {
  _DataManager_onLoad.call(this, object);
  if (object === $dataAnimations) {
    generatePack();
  }
};

})();