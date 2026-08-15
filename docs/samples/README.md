# HEIC/HEIF Compatibility Samples

These files are used to verify HEIF file-type detection and browser conversion behavior.

| File | Expected brand coverage | Source | Notes |
| --- | --- | --- | --- |
| `heic-still.heic` | major `heic` | Existing project fixture | Standard HEVC still image. |
| `mif1-still.heic` | major `mif1`, compatible `heic` | Existing project fixture | HEIF still-image container. |
| `msf1-sequence.heic` | major `msf1`, compatible `hevc` | Existing project fixture | HEIF image sequence. |
| `heix-compatible.heic` | compatible `heix` | Nokia HEIF conformance `C045.heic` | Range-extension still-image coverage. |
| `hevx-compatible-sequence.heic` | compatible `hevx` | Nokia HEIF conformance `C048.heic` | Range-extension sequence coverage. |
| `heis-multilayer.heic` | major `heis` | Nokia HEIF conformance `multilayer001.heic` | Multilayer HEVC still-image coverage. |
| `corrupted.heic` | invalid | Existing project sample | Graceful invalid-input handling. |

Known gaps:

- `heim`: no small, clearly redistributable public sample has been added yet.
- Major-brand `hevc` and `hevx`: current public samples cover these as compatible brands inside sequence files, not as major brands.
- Conversion success depends on the decoder bundled by `heic-to/csp`; this matrix verifies detection coverage, not every possible HEIF codec.
