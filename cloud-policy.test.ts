import { test, expect } from 'vitest';
import { createFakePluginHost } from '@get-bb/plugin-sdk/testing';
import plugin from './server';
import { canonicalDriveUrl } from './cloud-policy';

const settings = { vaultRoot: '/example/vault', hostId: 'host-demo', driveFolderUrl: '', driveAccount: 'person@example.com' };
const file = { hostId: 'host-demo', path: 'plan.md', absolutePath: '/example/vault/plan.md', name: 'plan.md', isDirectory: false, size: 1, modifiedAt: '2026-10-22', driveUrl: null, driveStatus: 'unconfigured', account: 'person@example.com' };
const sha256 = 'a'.repeat(64);
function result(value: unknown) { return typeof value === 'string' ? JSON.parse(value) : value; }

test.each(['ask','never'])('no upload is requested before consent: %s', async mode => {
  const { bb, harness } = createFakePluginHost({ pluginId: 'vault-files', settings: { ...settings, uploadMode: mode }, experimental_callHostRpc: async () => file });
  await plugin(bb);
  try {
    const plan = result(await harness.behavior.callAgentTool('vault_file_link', { path: file.path }));
    expect(plan.uploadRequired).not.toBe(true);
    expect(plan.requiresDriveChoice).toBe(mode === 'ask');
    await expect(harness.behavior.callAgentTool('vault_file_uploaded', { path: file.path, sha256, driveUrl: 'https://drive.google.com/file/d/uploaded/view', account: settings.driveAccount })).rejects.toThrow('разрешите');
  } finally { await harness.lifecycle.dispose(); }
});

test('opt-in requests a real upload, remembers its receipt, and updates the same copy after changes', async () => {
  let hash = sha256;
  const { bb, harness } = createFakePluginHost({ pluginId: 'vault-files', settings: { ...settings, uploadMode: 'always' }, experimental_callHostRpc: async request => request.method === 'fingerprint' ? { file, sha256: hash } : file });
  await plugin(bb);
  try {
    const plan = result(await harness.behavior.callAgentTool('vault_file_link', { path: file.path }));
    expect(plan.uploadRequired).toBe(true);
    expect(plan.directive).toBeUndefined();
    expect(plan.sha256).toBe(sha256);
    const receipt = { path: file.path, sha256, driveUrl: 'https://drive.google.com/file/d/uploaded/view', account: settings.driveAccount };
    await expect(harness.behavior.callAgentTool('vault_file_uploaded', { ...receipt, account: 'other@example.com' })).rejects.toThrow('Аккаунт');
    await expect(harness.behavior.callAgentTool('vault_file_uploaded', { ...receipt, sha256: 'b'.repeat(64) })).rejects.toThrow('изменился');
    await harness.behavior.callAgentTool('vault_file_uploaded', receipt);
    const unchanged = result(await harness.behavior.callAgentTool('vault_file_link', { path: file.path }));
    expect(unchanged.uploadRequired).toBe(false);
    expect(unchanged.driveUrl).toContain('/uploaded/view');
    hash = 'c'.repeat(64);
    const changed = result(await harness.behavior.callAgentTool('vault_file_link', { path: file.path }));
    expect(changed.uploadRequired).toBe(true);
    expect(changed.existingDriveUrl).toBe(unchanged.driveUrl);
  } finally { await harness.lifecycle.dispose(); }
});

test('receipt URL cannot point to another host, embed credentials or create public sharing', () => {
  for (const url of ['https://drive.google.com.evil.test/file/d/x/view','https://user@drive.google.com/file/d/x/view','http://drive.google.com/file/d/x/view','https://docs.google.com/document/d/x/edit']) expect(() => canonicalDriveUrl(url, settings.driveAccount)).toThrow();
  expect(canonicalDriveUrl('https://drive.google.com/file/d/x/view?usp=sharing',settings.driveAccount)).toBe('https://drive.google.com/file/d/x/view?authuser=person%40example.com');
});
