# Gate G0 — Setup

| Check | Result | Evidence |
|---|---|---|
| State file exists | pass | `.build-my-app/state.json` |
| Git repo exists | pass | `git init` (no commits yet) |
| `tools/` runs | pass | `spec_lint.py`: 0 IDs, 0 errors, 0 warnings |
| Profile recorded | pass | reused from image-annotator (personal/portfolio, experienced, no budget) |
| Autonomy recorded | pass | balanced |

Environment: git 2.54, node 24.19, pnpm 11.25, python 3.14.7; no ffmpeg (not needed for a browser tool).
Mode: greenfield. Reference sibling: ../../developer-tools/image-annotator.
