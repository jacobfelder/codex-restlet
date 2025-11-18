# codex-restlet workspace

This repository is set up as a lightweight Node.js playground to prototype mapping logic between incoming JSON payloads and SuiteQL query responses before wiring anything into NetSuite.

## Project layout

- `src/index.js` – entry point that loads sample payloads, registers mapping steps, and runs a comparison workflow.
- `src/mapping/workspace.js` – reusable `MappingWorkspace` helper for loading data, registering mapping transforms, and comparing structures.
- `src/logger.js` – minimal logger with console + file output (writes to `logs/mapping.log` by default).
- `data/` – seed JSON files for local experimentation; replace these with your real payload and SuiteQL responses as you iterate.
- `.vscode/launch.json` – VS Code launch configuration for one-click debugging.

## Getting started

1. Open the folder in VS Code.
2. Run **npm scripts** from the built-in terminal:
   - `npm run start` – executes `src/index.js` once using the sample data files.
   - `npm run dev` – runs in watch mode so changes to the source files reload automatically.
   - `npm run lint` – quick syntax check using Node's `--check` flag.
3. Adjust input paths without editing code by setting environment variables:
   - `PAYLOAD_PATH` – path to the incoming payload JSON file.
   - `SUITEQL_PATH` – path to the SuiteQL response JSON file.
   - `LOG_LEVEL` – one of `debug | info | warn | error` to control verbosity.
   - `LOG_FILE` – custom log file location if you don't want `logs/mapping.log`.

## Debugging in VS Code

The included `.vscode/launch.json` defines a "Debug mapping" configuration that:
- runs `src/index.js` with the workspace root as the working directory,
- exposes `PAYLOAD_PATH` and `SUITEQL_PATH` for quick overrides,
- stops on entry so you can immediately set breakpoints.

Open the Run and Debug sidebar, pick **Debug mapping**, and press **F5**. Logging will still write to `logs/mapping.log` while stepping through the code.

## Extending the mapping prototype

- Add or modify mapping steps in `src/index.js` (or create new modules) using `workspace.addMappingStep({ id, description, transform })`.
- Use `workspace.summarizeDifferences()` to quickly view which fields exist only in the payload, only in SuiteQL, or both.
- Swap in real-world payloads by dropping JSON samples into `data/` and updating `PAYLOAD_PATH` / `SUITEQL_PATH`.

When you're ready to move to a NetSuite restlet, you can lift the mapping logic from `src/mapping/workspace.js` into a SuiteScript module with minimal changes.
