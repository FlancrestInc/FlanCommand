# FlanCommand Retro Theme Implementation Plan

> **For Hermes:** Implement this plan task-by-task and verify the live browser surface.

**Goal:** Replace the current Night Ops/Paper/Command Blue themes with joyful XP.css-inspired Windows XP and Windows 98 modes, including persisted classic chat wallpapers.

**Architecture:** Keep the existing static-shell architecture and session/drawer behavior. Replace the theme enum with `xp`/`win98`, add a small persisted `chatBackground` setting, and use one shared retro CSS layer with mode-specific variables and control chrome. Wallpaper choice is applied as a data attribute on the document and rendered behind the chat content with readable overlay treatment.

**Tech Stack:** TypeScript API settings normalization, vanilla module JavaScript, CSS, Playwright, Vitest.

---

### Task 1: Extend the settings contract

Files: `apps/api/src/settings.ts`, `apps/api/src/settings.test.ts`.

Add `SettingsTheme = "xp" | "win98"`, `ChatBackground = "bliss" | "clouds" | "autumn" | "3d-pipes" | "azul" | "none"`, defaults of `xp` and `bliss`, and normalize invalid values back to the base settings. Update unit expectations and add coverage for both modes/backgrounds.

### Task 2: Add the wallpaper/theme controls

Files: `apps/web/public/index.html`, `apps/web/public/app.js`.

Replace legacy theme options with Windows XP and Windows 98. Add a chat wallpaper select with named classic choices. Load/save the new setting and apply `data-theme` plus `data-chat-background` to `<html>`. Keep the compact activity setting and all existing settings behavior unchanged.

### Task 3: Replace the visual system

File: `apps/web/public/styles.css`.

Remove the dark/light/classic variable overrides and append a retro shell layer that uses XP.css-style beveled borders, gradient title bars, system font stacks, compact controls, window chrome, pressed/hover states, and mode-specific XP/98 palettes. Add local CSS-generated wallpaper presets (no remote runtime dependency), including Bliss-like hills, Clouds, Autumn, 3D Pipes, Azul, and None. Keep readable contrast and preserve the existing layout/drawer responsiveness.

### Task 4: Verify behavior in tests

Files: `tests/e2e/navigation.spec.ts`, optionally `apps/web/src/command-center.test.ts` if a pure helper is extracted.

Update the persisted theme test to XP/98 and add a browser test that saves Windows 98 plus a wallpaper, confirms both document data attributes, reloads, and confirms persistence. Add assertions that old theme options are absent and the settings controls remain usable on phone width.

### Task 5: Run the quality loop

Run targeted settings/API and browser tests, then the full relevant web test suite. Start the dev server using the repository's existing test command if needed, inspect desktop and phone screenshots/snapshots, and fix any overflow/contrast/regression found. Confirm service-worker cache version is bumped because the shell assets changed.
