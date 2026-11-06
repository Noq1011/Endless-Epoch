# Endless Epoch: Custom RPG Engine Scripts

## Overview
This repository contains a suite of custom ES5 JavaScript plugins developed for **Endless Epoch**, an independent narrative role-playing game built on the RPG Maker MV engine. 

Rather than relying on default engine capabilities, these scripts override core RPG Maker MV functions to introduce complex custom mechanics, including a proprietary "Burnout" battle system, dynamic environmental states, and modular radial UI components.

## Core Systems Architecture

### 1. Unified Burnout System (UBS)
A custom combat mechanic that replaces standard MP/TP management with a dynamic risk/reward resource system.
* **Key Files:** `NoqUnifiedBurnoutSystem.js`, `NoqBurnoutBattleLogic.js`, `NoqBurnoutPersistentDrain.js`
* **Features:** Implements custom stat growth, battle sequence timing, and persistent resource drain mechanics that force players to balance power output against systemic fatigue.

### 2. Environmental & Immersion Engine
Scripts designed to override static map states with dynamic, time-based conditions across 240+ maps.
* **Key Files:** `NoqDayNightCore.js`, `NoqWeatherCore.js`, `Noq_NPCShadows.js`, `Noq_Footsteps.js`
* **Features:** Introduces environmental day/night cycles, dynamic weather overlays, programmatic NPC shadows, and terrain-based footstep audio processing.

### 3. Advanced UI & Heads-Up Display
Overrides default window drawing methods to create a custom, modern user interface.
* **Key Files:** `NoqRadialConfig.js`, `NoqBurnoutHUDPlus.js`, `NoqHideDefaultWindows.js`
* **Features:** Replaces standard combat and menu windows with active-time battle HUDs and radial selection menus for streamlined player inputs.

## Technologies Used
* **Language:** JavaScript (ES5/ES6)
* **Environment:** RPG Maker MV API (Pixi.js / NW.js)
* **Concepts:** Prototype overrides, game loop manipulation, state management, asynchronous event handling.
