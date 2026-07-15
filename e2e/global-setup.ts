import fs from 'node:fs';

/** Fresh database for every E2E run. */
export default function globalSetup(): void {
  fs.rmSync('/tmp/canopy-e2e', { recursive: true, force: true });
  fs.mkdirSync('/tmp/canopy-e2e', { recursive: true });
}
