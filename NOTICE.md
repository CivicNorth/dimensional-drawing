# Notice

This fork builds on **dimensional-drawing** by Enes Ozturk
(https://github.com/enesozturk/dimensional-drawing), MIT License, Copyright (c) 2026 Enes Ozturk.
The upstream `LICENSE` file is kept unchanged at the repository root.

Added by Civic North, Copyright (c) 2026 Civic North, also under the MIT License:
- `kit/spec-kit.js`, `kit/spec-kit.css`: the upstream drawing kit from `skills/dimensional-drawing/examples/card-sheet.html`, ported and rescaled for 1080 x 1350 portrait slides, plus process parts (slot, stage, flow, gate, struck, tbd, formula, layers, keyPlan, frame, closeSheet).
- `tools/render.mjs`, `tools/check.mjs`, `tools/lib.mjs`: PDF and PNG rendering and deterministic checks.
- `FORK.md`, `package.json`.

Upstream files under `skills/` and `assets/`, and the upstream `README.md`, `LICENSE` and `.gitignore`, are not modified, so upstream changes merge cleanly.

Fonts are installed from npm, not committed:
- Arimo, SIL Open Font License 1.1 (@fontsource/arimo)
- JetBrains Mono, SIL Open Font License 1.1 (@fontsource/jetbrains-mono)
