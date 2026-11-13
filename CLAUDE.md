# Working on Motion

Motion is a free browser video editor with no watermark, in `~/motion`.

Before writing code, read these so you know the decisions already made:
- `docs/project-notes.md` (goals, decisions, what is tested and what is not, next steps)
- `docs/architecture.md` (how core, renderer, media and the editor fit together)
- `PRODUCT.md` and `DESIGN.md` (who it is for, and how it should look)

## How to work

1. **Build in small pieces.** Finish and verify one piece before starting the next.

2. **Prove each piece works by using it, not by reading the code.** Passing type checks and a successful build do not show that a feature works. An earlier review found four bugs in features that had been built and described as tested but never actually used (trim, reorder, playhead, Space key). For anything a user can click, drag or press:
   - Start the editor with `pnpm dev:editor` (http://localhost:5180) and do the action in a real browser.
   - Check the result by reading the app state (`window.__motion` in dev mode), not only by looking at a screenshot.
   - Do a full page reload before testing. Hot reload can leave stale code running and give false results.
   - Test drags as repeated moves, not one jump. Dragging calls the same edit many times, and that is where bugs have hidden.
   - If you need media, generate test clips with ffmpeg in the scratchpad folder.

3. **Put the logic in `packages/core` and test it there.** For every bug you find, first write a test that fails, then fix it, and keep the test. Add tests for new timeline behaviour as you build it.

4. **Before saying something is done**, run all four from the repo root and fix anything that fails:
   `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`

5. **Review your own work as if someone else wrote it.** Re-read every file you changed and look for: edge cases (empty timeline, first and last clip, playhead outside a clip, undo after the change), anything that only works on the first call, and anything you assumed but did not check. Fix what you find and test again.

6. **Fix the cause, not the symptom.** If a bug comes from the design, change the design. Do not add a special case to hide it.

7. **Stay inside the task.** Do not add features that weren't asked for. If you find an unrelated problem, report it and leave it alone.

## Things to protect

- Preview and export must keep using the same drawing code, so what you see is what you export. Never add a watermark or a paid tier.
- Port 5173 belongs to another project (eden). Never stop it. The editor uses 5180.
- Do not delete files or run git commands that change history without asking.

## When you finish

Report in plain, simple English:
- What you built.
- What you tested by hand, and exactly how.
- What you did NOT test. Be honest. Never write "tested" for something you only built.
- Any bugs you found and fixed.
- What is still missing or risky.

Then update `docs/project-notes.md` so it matches.
