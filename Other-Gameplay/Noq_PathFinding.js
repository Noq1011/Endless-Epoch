/*:
 * @plugindesc NoQ Pathfinding V4.2 - Optimized & Debugged
 * @author Cleaned & Fixed Version
 */

(function() {

// ===============================
// CONFIG
// ===============================
const MAX_NODES_PER_FRAME = 2000;
const STUCK_TIME = 60;
const TELEPORT_TIME = 600;
const INSTANT_PATH_DISTANCE = 15; // Paths shorter than this solve immediately

// ===============================
// GLOBAL SYSTEM STATE
// ===============================
window.Noq = window.Noq || {};
Noq.jobs = [];
Noq.nodesThisFrame = 0;

// ===============================
// FRAME PROCESSOR
// ===============================
const _Scene_Map_update = Scene_Map.prototype.update;
Scene_Map.prototype.update = function() {
    Noq.nodesThisFrame = 0;
    Noq.process();
    _Scene_Map_update.call(this);
};

Noq.process = function() {
    for (let i = 0; i < Noq.jobs.length; i++) {
        if (Noq.nodesThisFrame >= MAX_NODES_PER_FRAME) break;

        let job = Noq.jobs[i];
        job.step();

        if (job.done) {
            job.apply();
            Noq.jobs.splice(i, 1);
            i--;
        }
    }
};

// ===============================
// HEAP (FAST OPEN LIST)
// ===============================
class Heap {
    constructor() { this.a = []; }
    
    push(n) {
        this.a.push(n);
        this.up(this.a.length - 1);
    }
    
    pop() {
        if (this.a.length === 0) return null;
        let top = this.a[0];
        let end = this.a.pop();
        if (this.a.length > 0) {
            this.a[0] = end;
            this.down(0);
        }
        return top;
    }
    
    up(i) {
        let e = this.a[i];
        while (i > 0) {
            let p = (i - 1) >> 1;
            if (this.a[p].f <= e.f) break;
            this.a[i] = this.a[p];
            i = p;
        }
        this.a[i] = e;
    }
    
    down(i) {
        let len = this.a.length;
        let e = this.a[i];
        while (true) {
            let l = i * 2 + 1;
            let r = l + 1;
            let s = null;
            if (l < len && this.a[l].f < e.f) s = l;
            if (r < len && this.a[r].f < (s === null ? e.f : this.a[l].f)) s = r;
            if (s === null) break;
            this.a[i] = this.a[s];
            i = s;
        }
        this.a[i] = e;
    }
    
    size() { return this.a.length; }
    isEmpty() { return this.a.length === 0; }
}

// ===============================
// PATH JOB (A*)
// ===============================
class PathJob {
    constructor(event, sx, sy, tx, ty) {
        this.event = event;
        this.tx = tx;
        this.ty = ty;
        this.w = $gameMap.width();
        this.h = $gameMap.height();
        this.open = new Heap();
        this.closed = new Int32Array(this.w * this.h);
        this.done = false;
        this.path = null;
        this.totalProcessed = 0;
        
        // Start node
        this.open.push(this.node(sx, sy, 0, this.heuristic(sx, sy), null));
    }

    node(x, y, g, h, parent) { 
        return { x, y, g, h, f: g + h, parent }; 
    }

    heuristic(x, y) {
        // Manhattan distance with slight weight to prefer direct paths
        const dist = Math.abs(x - this.tx) + Math.abs(y - this.ty);
        return dist * 10;
    }

    canTraverse(x, y, d, nx, ny) {
        // 1. Bounds check
        if (!$gameMap.isValid(nx, ny)) return false;

        // 2. Basic passability (both exit current tile and enter next tile)
        if (!$gameMap.isPassable(x, y, d)) return false;
        if (!$gameMap.isPassable(nx, ny, 10 - d)) return false;

        // 3. Region restrictions
        const rTarget = $gameMap.regionId(nx, ny);
        if (rTarget === 7 || rTarget === 8) return false;

        // 4. Z-level/bridge logic (only active if using regions 10/11)
        const rCurrent = $gameMap.regionId(x, y);
        if (rCurrent === 10 && rTarget === 11) return false;
        if (rCurrent === 11 && rTarget === 10) return false;

        return true;
    }

    cost(x, y) {
        const r = $gameMap.regionId(x, y);
        const role = this.event._role || "civilian";

        // Region-based costs
        if (r === 50) return 1;   // highway
        if (r === 49) return 6;   // grass
        if (r === 48) return 2;   // dirt road
        if (r === 47) return 6;   // rough terrain
        if (r === 46) return 10;  // avoid zone
        
        if (r === 45) {
            return (role === "guard") ? 1 : 8;
        }
        
        // Check for events at this location (soft avoidance)
        if ($gameMap.eventsXy(x, y).length > 0) {
            return 15; // Higher cost but not impassable
        }
        
        return 10; // default
    }

    step() {
        // Safety valve
        if (this.open.isEmpty() || this.totalProcessed > 30000) {
            this.done = true;
            return;
        }

        Noq.nodesThisFrame++;
        this.totalProcessed++;
        
        let cur = this.open.pop();
        if (!cur) {
            this.done = true;
            return;
        }
        
        let key = cur.y * this.w + cur.x;
        if (this.closed[key] === 1) return;
        this.closed[key] = 1;

        // Goal reached
        if (cur.x === this.tx && cur.y === this.ty) {
            this.done = true;
            this.path = this.buildPath(cur);
            return;
        }

        // Expand neighbors
        const dirs = [2, 4, 6, 8];
        for (let i = 0; i < 4; i++) {
            let d = dirs[i];
            let nx = $gameMap.roundXWithDirection(cur.x, d);
            let ny = $gameMap.roundYWithDirection(cur.y, d);

            if (!this.canTraverse(cur.x, cur.y, d, nx, ny)) continue;

            let nKey = ny * this.w + nx;
            if (this.closed[nKey] === 1) continue;

            let g = cur.g + this.cost(nx, ny);
            let h = this.heuristic(nx, ny);
            this.open.push(this.node(nx, ny, g, h, cur));
        }
    }

    buildPath(node) {
        let path = [];
        while (node && node.parent) {
            path.unshift({ x: node.x, y: node.y });
            node = node.parent;
        }
        return path;
    }

    apply() {
        if (!this.path || this.path.length === 0) {
            // Path failed - log for debugging
            console.warn("[NoQ] Event " + this.event.eventId() + 
                " failed to find path to (" + this.tx + "," + this.ty + ")");
            this.event.noqClear();
            return;
        }
        
        this.event._noqPath = this.path;
        this.event._noqIndex = 0;
        this.event._noqStuck = 0;
    }
}

// ===============================
// MOVEMENT LOGIC
// ===============================
const _GE_update = Game_Event.prototype.update;
Game_Event.prototype.update = function() {
    _GE_update.call(this);
    if (this._noqPath) this.noqMove();
};

Game_Event.prototype.noqMove = function() {
    // PAUSE CHECK - must be first!
    if (this._noqPaused) return;
    
    if (!this._noqPath) return;

    // Reached end of path
    if (this._noqIndex >= this._noqPath.length) {
        this.noqClear();
        return;
    }

    // Wait for current movement to complete
    if (this.isMoving()) return;

    let target = this._noqPath[this._noqIndex];
    let dx = target.x - this.x;
    let dy = target.y - this.y;

    // Already at this waypoint (can happen if bumped)
    if (dx === 0 && dy === 0) {
        this._noqIndex++;
        return;
    }

    // Too far from waypoint - recalculate direction
    let d = 0;
    if (Math.abs(dx) + Math.abs(dy) > 1) {
        d = this.findDirectionTo(target.x, target.y);
    } else {
        // Adjacent - direct movement
        if (dx === 1) d = 6;
        else if (dx === -1) d = 4;
        else if (dy === 1) d = 2;
        else if (dy === -1) d = 8;
    }

    // Try to move
    if (d > 0 && this.canPass(this.x, this.y, d)) {
        this.moveStraight(d);
        this._noqIndex++;
        this._noqStuck = 0;
    } else {
        this._noqStuck = (this._noqStuck || 0) + 1;
    }

    // TIER 1: Ghost mode (phase through obstacles)
    if (this._noqStuck > STUCK_TIME && !this._noqGhosting) {
        this._noqGhosting = true;
        this.setThrough(true);
        let baseOpacity = this._noqBaseOpacity !== undefined ? this._noqBaseOpacity : 255;
        this.setOpacity(Math.min(140, Math.round(baseOpacity)));
    }

    // TIER 2: Teleport to destination
    if (this._noqStuck > TELEPORT_TIME) {
        let destination = this._noqPath[this._noqPath.length - 1];
        if (destination) {
            this.setPosition(destination.x, destination.y);
        }
        this.noqClear();
        return;
    }

    // Ghost recovery (return to solid when clear)
    if (this._noqGhosting) {
        const occupied = $gameMap.eventsXy(this.x, this.y).some(e => e !== this) || 
                        ($gamePlayer.x === this.x && $gamePlayer.y === this.y);
        
        if (!occupied) {
            let nextWaypoint = this._noqPath[this._noqIndex];
            if (nextWaypoint) {
                let testDir = this.findDirectionTo(nextWaypoint.x, nextWaypoint.y);
                this.setThrough(false);
                
                if (!this.canPass(this.x, this.y, testDir)) {
                    // Still blocked, stay ghost
                    this.setThrough(true);
                } else {
                    // Clear - solidify
                    this._noqGhosting = false;
                    let baseOpacity = this._noqBaseOpacity !== undefined ? this._noqBaseOpacity : 255;
                    this.setOpacity(Math.round(baseOpacity));
                }
            } else {
                // End of path
                this.noqClear();
            }
        }
    }
};

Game_Event.prototype.noqClear = function() {
    this._noqPath = null;
    this._noqIndex = 0;
    this._noqStuck = 0;
    this._noqGhosting = false;
    this._noqPaused = false;
    this._noqTargetX = undefined;
    this._noqTargetY = undefined;
    this._noqSavedTarget = null;
    this.setThrough(false);
    let baseOpacity = this._noqBaseOpacity !== undefined ? this._noqBaseOpacity : 255;
    this.setOpacity(Math.round(baseOpacity));
};

// ===============================
// GLOBAL API
// ===============================
Noq.path = function(id, x, y) {
    let ev = $gameMap.event(id > 0 ? id : 0);
    if (!ev) {
        console.warn("[NoQ] Invalid event ID:", id);
        return;
    }

    // Anti-spam: already walking to this exact spot
    if (ev._noqPath && ev._noqTargetX === x && ev._noqTargetY === y) {
        return;
    }

    // Anti-spam: already calculating path to this exact spot
    let existingJob = Noq.jobs.find(j => j.event === ev);
    if (existingJob && existingJob.tx === x && existingJob.ty === y) {
        return;
    }

    // Clear any jobs for this event going to different destinations
    Noq.jobs = Noq.jobs.filter(j => j.event !== ev);

    // Lock target
    ev._noqTargetX = x;
    ev._noqTargetY = y;

    // Create path job
    const dist = Math.abs(ev.x - x) + Math.abs(ev.y - y);
    const job = new PathJob(ev, ev.x, ev.y, x, y);
    
    if (dist < INSTANT_PATH_DISTANCE) {
        // Short path - solve immediately
        while (!job.done) { 
            job.step(); 
        }
        job.apply();
    } else {
        // Long path - queue for background processing
        Noq.jobs.push(job);
    }
};

Noq.stop = function(id) {
    let ev = $gameMap.event(id > 0 ? id : 0);
    if (!ev) return;
    
    // Remove from queue
    Noq.jobs = Noq.jobs.filter(j => j.event !== ev);
    
    // Clear movement
    ev.noqClear();
};

Noq.repath = function(id, x, y) {
    let ev = $gameMap.event(id > 0 ? id : 0);
    if (!ev) return;
    
    // Force recalculation by clearing anti-spam lock
    ev._noqTargetX = undefined;
    ev._noqTargetY = undefined;
    
    Noq.path(id, x, y);
};

Noq.pause = function(id) {
    let ev = $gameMap.event(id > 0 ? id : 0);
    if (!ev) return;
    
    // Save current destination
    if (ev._noqTargetX !== undefined && ev._noqTargetY !== undefined) {
        ev._noqSavedTarget = {
            x: ev._noqTargetX,
            y: ev._noqTargetY
        };
    }
    
    // Set pause flag
    ev._noqPaused = true;
    
    // CRITICAL: Force the move route to stop processing
    if (ev._moveRoute) {
        ev._moveRouteWasPaused = true;
        ev._waitCount = 999999; // Freeze the move route
    }
};

Noq.resume = function(id) {
    let ev = $gameMap.event(id > 0 ? id : 0);
    if (!ev) return;
    
    // Clear pause flag
    ev._noqPaused = false;
    
    // CRITICAL: Unfreeze the move route
    if (ev._moveRouteWasPaused) {
        ev._waitCount = 0;
        ev._moveRouteWasPaused = false;
    }
    
    // Resume to saved destination if it exists
    if (ev._noqSavedTarget) {
        Noq.path(id, ev._noqSavedTarget.x, ev._noqSavedTarget.y);
        ev._noqSavedTarget = null;
    }
};

// Debug helper
Noq.debug = function() {
    console.log("[NoQ] Active jobs:", Noq.jobs.length);
    console.log("[NoQ] Nodes this frame:", Noq.nodesThisFrame);
    Noq.jobs.forEach((job, i) => {
        console.log("  Job", i, "- Event", job.event.eventId(), 
            "to (" + job.tx + "," + job.ty + ") - Processed:", job.totalProcessed);
    });
    
    // Show paused events
    $gameMap.events().forEach(ev => {
        if (ev._noqPaused) {
            let saved = ev._noqSavedTarget ? 
                " (will resume to " + ev._noqSavedTarget.x + "," + ev._noqSavedTarget.y + ")" : "";
            console.log("  Event", ev.eventId(), "is PAUSED" + saved);
        }
    });
};

})();
