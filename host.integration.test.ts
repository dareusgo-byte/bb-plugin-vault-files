import { test, expect } from 'vitest';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import hostEntry from './host';

// Optional live smoke test. Personal settings are supplied only by the caller,
// never embedded in the source, output, package or release artifacts.
const vaultRoot = process.env.VAULT_FILES_TEST_ROOT;
test.skipIf(!vaultRoot)('host bridge reads a caller-configured vault and confines paths', async () => {
  const harness = experimental_createHostEntryHarness(hostEntry);
  const config = { vaultRoot: vaultRoot!, hostId: 'host-smoke', driveFolderId: process.env.VAULT_FILES_TEST_DRIVE_FOLDER || '', driveAccount: process.env.VAULT_FILES_TEST_ACCOUNT || '' };
  try {
    const root = await harness.experimental_call('resolve', { path: '', config });
    expect(root.isDirectory).toBe(true);
    expect(root.hostId).toBe('host-smoke');
    const listing = await harness.experimental_call('list', { path: '', config });
    expect(listing.files.length).toBeGreaterThan(0);
    if (config.driveFolderId) expect(root.driveStatus).toBe('found');
    await expect(harness.experimental_call('resolve', { path: '../outside', config })).rejects.toThrow();
  } finally { await harness.experimental_dispose(); }
});
