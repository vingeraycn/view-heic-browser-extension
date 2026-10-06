# Chrome browser regression

This procedure validates the installed extension in a real Chrome profile. The helper below checks local artifacts and report completeness; it is **not an automated end-to-end runner**. Source assertions and synthetic DOM tests cannot substitute for these browser cases.

## Prepare

1. Use the existing user-approved Chrome profile. Record Chrome version, profile, existing View HEIC IDs, enabled state, source, and site access. Do not create a profile or enable broader permissions as a shortcut.
2. Run `pnpm install --frozen-lockfile`, `pnpm compile`, `pnpm build`, and all existing `verify:*` scripts. Run `pnpm zip` when verifying distribution output. There is currently no lint script.
3. Run `node scripts/check-browser-regression.mjs preflight > /tmp/view-heic-preflight.json`. Record its commit, dirty state, manifest hash, and fixture hash with the run. Review any permission changes against the previously installed extension before loading it.
4. Load `.output/chrome-mv3` through Chrome's **Load unpacked** directory chooser. Verify its absolute source directory, version, enabled state, and absence of install errors. Disable any other View HEIC instance for attribution, preserving its original state for restoration. Reload all test pages after installation.
5. Use the public tracked `docs/samples/heic-still.heic` fixture for the converter and composer cases. `docs/samples/README.md` documents sample provenance. If an expected `public/for-test` directory is absent, report that fact. With permission, copy this public fixture to a uniquely named Downloads directory for Finder operations and verify the copied SHA-256. Never select unrelated private photos.

## Matrix

Official demo: <https://vingeraycn.github.io/view-heic-browser-extension/>. Scroll to the four bottom sample cards.

| ID | Real action | Required observation |
| --- | --- | --- |
| D1 | View Standard HEIC (`heic-still.heic`) | Converted image renders |
| D2 | View HEIF Sequence (`msf1-sequence.heic`) | First-frame preview renders |
| D3 | View HEIX Compatible (`heix-compatible.heic`) | Converted image renders |
| D4 | View Broken File (`corrupted.heic`) | Graceful failure, no retry loop or page breakage; success toast is not expected |
| P1 | Open extension popup, click through to independent converter, select fixture through native picker | Converted image/result shown by the converter |
| C1 | Drag fixture from Downloads in Finder into a fresh ChatGPT web composer | Composer acceptance criteria below |
| C2 | Click ChatGPT upload control and choose fixture with native picker | Composer acceptance criteria below |
| C3 | Select fixture in Finder, Cmd+C, focus ChatGPT composer, Cmd+V | Composer acceptance criteria below |
| G1 | Drag fixture from Downloads in Finder into a fresh Gemini web composer | Composer acceptance criteria below |
| G2 | Click Gemini upload control and choose fixture with native picker | Composer acceptance criteria below |
| G3 | Select fixture in Finder, Cmd+C, focus Gemini composer, Cmd+V | Composer acceptance criteria below |

For each C/G case, observe **Converting to JPG** and **Converted to JPG**, one real JPEG attachment, and no site error or conversion loop. Capture attachment filename/type evidence from the UI, not just the extension toast. Remove the attachment and confirm an empty composer before the next case. **Do not send a message or invoke a model.** Missing any required observation means the case cannot be marked passed. If attribution is uncertain, compare with the extension disabled and reload, then restore the candidate and repeat.

## UI automation and evidence

Use the supported computer-use interface to operate the existing Chrome, Finder, and native dialogs. Re-read accessibility state after actions. Derive drag coordinates from current screenshots. OS file drag and Finder file-copy/paste are distinct paths; programmatic file-input assignment, text-path paste, synthetic paste/drop events, or mock pages do not cover them. If the available tool cannot perform a path, report it as blocked.

For a directory chooser failure, confirm the title says "Select the extension directory", navigate to the parent directory, select the folder containing `manifest.json`, and inspect the Select button. A normal cancel/reopen or supported tool-session reconnect is reasonable. Preserve a screenshot and accessibility excerpt if it stays disabled. Do not force-enable controls, change Chrome security settings, or install through a debugging backdoor. Distinguish a technical failure from an explicit security denial.

Keep run evidence outside the repository unless sanitized and explicitly intended for publication. Include install state, timestamps, candidate identity, fixture hash, each observation, relevant screenshots/accessibility logs, and final browser state. Avoid capturing private conversation content. Restore temporary extension enablement changes; leave the candidate installed only as authorized and record its state.

Validate a JSON report with `node scripts/check-browser-regression.mjs report /path/to/report.json`. Exit 0 means all 11 rows are recorded as passing; exit 2 means a structurally valid report still has failures or blocked cases. Validation checks completeness and referenced files, not the truth of screenshots or UI observations.

Report fields: `commit` (40 hex), `fixtureSha256` (64 hex), `profile` (nonempty string), `candidateInstalled` (boolean), and `cases` (exactly the 11 IDs above). Each case needs `id`, `status` (`pass`, `fail`, or `blocked`), `observation`, and `evidence` (nonempty array of file paths relative to the report). Passing C/G cases additionally require observed booleans `convertingToast`, `convertedToast`, `jpegAttachment`, `noSiteError`, and `attachmentRemoved`. Never change these flags merely to satisfy the validator.
