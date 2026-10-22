import { test, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
import hostEntry from './host';

test('fingerprinting reads the exact Unicode file through the platform interpreter and confines its path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vault-hash-'));
  const harness = experimental_createHostEntryHarness(hostEntry);
  const config = { vaultRoot: root, hostId: 'configured-host', driveFolderId: '', driveAccount: '' };
  try {
    const content = '# План\n\nТочный исходный файл';
    await writeFile(join(root, 'план & отчёт.md'), content);
    const result = await harness.experimental_call('fingerprint', { path: 'план & отчёт.md', config });
    expect(result.sha256).toBe(createHash('sha256').update(content).digest('hex'));
    expect(result.file.platform).toBe(process.platform);
    await expect(harness.experimental_call('fingerprint', { path: '../outside', config })).rejects.toThrow();
  } finally { await harness.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
}, 20000);
