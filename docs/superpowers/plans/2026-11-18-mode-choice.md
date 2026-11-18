# Одно изделие или проект -- Implementation Plan

> Executed inline (the owner's choice for the project plan: «Сам, подряд»). Spec: docs/superpowers/specs/2026-11-18-mode-choice-design.md

**Goal:** a full-page choice «Одно изделие» / «Проект» when the calculator opens on its own; links skip it.

## Tasks

1. **Mode and the choice screen** (`sayanmramor-calculator.html`, `tests/mode-choice.test.js`): `#modeChoice` with
   two cards, `calcMode`, `setCalcMode(mode)`, `showModeChoice()`; bootstrap: pv=2 → project, pv=1 / ?product= /
   ?stone= → single, else the choice; «Продолжить проект: N изделий» + «начать новый» when a stored project has 2+.
   Tests: markup ids, bootstrap branches, the stored project restored only from the choice.
2. **Single mode** : `projectAddBtn` hidden unless project; `storeProject` only in project mode; the Result's button
   «Сделать проектом» in single mode (confirm replacing a stored project of 2+) / «+ Добавить изделие» in project;
   h1 by mode. Tests: the guards and texts.
3. **Back to the choice**: «Сменить режим» above the product grid; history.pushState on a choice, popstate shows the
   choice; «Одно изделие» from the choice starts from a clean form (resetFormToInitial, project = null).
   Tests: the handler and the link. Then the browser: desktop and 375 px, every way in (plain, ?product=, pv=1,
   pv=2, a stored project), «Сделать проектом», «Назад».
