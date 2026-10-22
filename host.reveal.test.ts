import { test, expect, vi } from 'vitest';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { experimental_createHostEntryHarness } from '@get-bb/plugin-sdk/testing/host';
const opened = vi.hoisted(() => [] as string[][]);
vi.mock('node:child_process', async original => {
  const actual = await original<typeof import('node:child_process')>();
  return { ...actual, execFile: (...args: any[]) => {
    if (args[0] !== '/usr/bin/open') return (actual.execFile as any)(...args);
    opened.push(args[1]);
    args[3](null, '', '');
    return {};
  } };
});
import hostEntry from './host';

test.skipIf(process.platform !== 'darwin')('Finder receives a confined path on the configured host; traversal and escaping symlinks never open', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vault-reveal-'));
  const harness = experimental_createHostEntryHarness(hostEntry);
  const config = { vaultRoot: root, hostId: 'configured-host', driveFolderId: '', driveAccount: '' };
  try {
    await writeFile(join(root, 'test document.md'), '# Test');
    await symlink(tmpdir(), join(root, 'escape'));
    expect(await harness.experimental_call('reveal', { path: 'test document.md', config })).toEqual({ revealed: true });
    expect(opened).toHaveLength(1);
    expect(opened[0]?.[0]).toBe('-R');
    expect(opened[0]?.[1]).toMatch(/vault-reveal-[^/]+\/test document.md$/);
    await expect(harness.experimental_call('reveal', { path: '../outside', config })).rejects.toThrow();
    await expect(harness.experimental_call('reveal', { path: 'escape', config })).rejects.toThrow();
    expect(opened).toHaveLength(1);
  } finally { await harness.experimental_dispose(); await rm(root, { recursive: true, force: true }); }
}, 20000);
