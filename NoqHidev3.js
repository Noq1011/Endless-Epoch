/*:
 * @target MV
 * @plugindesc (MV) WindowLayer Skip-Render — tag windows with __skipRender=true to prevent drawing while keeping logic alive.
 * @author Noq
 */
(function(){
'use strict';

function withHiddenChildren(layer, fn){
  const touched = [];
  for (let i=0; i<layer.children.length; i++){
    const w = layer.children[i];
    if (w && w.__skipRender && w.visible){
      touched.push(w);
      w.__prevVisible = w.visible;
      w.visible = false;        // hide just for this render pass
    }
  }
  try { fn(); } finally {
    for (let i=0; i<touched.length; i++){
      const w = touched[i];
      w.visible = w.__prevVisible;
    }
  }
}

const _renderWebGL   = WindowLayer.prototype._renderWebGL;
WindowLayer.prototype._renderWebGL = function(renderer){
  withHiddenChildren(this, ()=> _renderWebGL.call(this, renderer));
};

const _renderCanvas  = WindowLayer.prototype._renderCanvas;
WindowLayer.prototype._renderCanvas = function(renderer){
  withHiddenChildren(this, ()=> _renderCanvas.call(this, renderer));
};

})();

