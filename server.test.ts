import { test, expect } from 'vitest';
import { createFakePluginHost, makePluginAgentConfigurationContext } from '@get-bb/plugin-sdk/testing';
import plugin, { FILE_INSTRUCTIONS, folderId } from './server';

const settings = { vaultRoot: '/example/vault', hostId: 'host-demo', driveFolderUrl: 'https://drive.google.com/drive/folders/demo-root-12345', driveAccount: 'person@example.com' };
const file = { hostId: 'host-demo', path: 'file.md', absolutePath: '/example/vault/file.md', name: 'file.md', isDirectory: false, size: 1, modifiedAt: '2026-10-21', driveUrl: null, driveStatus: 'pending', account: 'person@example.com' };

test('every provider and side chat receives configured instructions and lookup tool', async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: 'vault-files', settings, agentSkillIds: ['vault-files'] });
  await plugin(bb);
  try {
    for (const id of ['codex','claude-code','gemini','pi','custom']) {
      for (const origin of [{ kind: null, pluginId: null }, { kind: 'fork' as const, pluginId: 'side-chat' }]) {
        const config = await harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext({ provider: { id }, origin }));
        expect(config.instructions).toContain(FILE_INSTRUCTIONS);
        expect(config.instructions).toContain('/example/vault');
        expect(config.tools.some(t => t.name === 'vault_file_link')).toBe(true);
      }
    }
    await harness.behavior.setSettings({ vaultRoot: '/second/vault' });
    const config = await harness.behavior.resolveAgentConfiguration(makePluginAgentConfigurationContext());
    expect(config.instructions).toContain('/second/vault');
    expect(config.instructions).not.toContain('/example/vault');
  } finally { await harness.lifecycle.dispose(); }
});

test('RPC uses the configured host and passes configuration only to that host', async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: 'vault-files', settings, agentSkillIds: ['vault-files'], experimental_callHostRpc: async () => file });
  await plugin(bb);
  try {
    expect(await harness.behavior.callRpc('resolve', { path: 'file.md' })).toEqual(file);
    expect(harness.experimental_hostRpcCalls[0]?.hostId).toBe('host-demo');
    expect(harness.experimental_hostRpcCalls[0]?.input).toMatchObject({ config: { vaultRoot: '/example/vault', driveFolderId: 'demo-root-12345' } });
  } finally { await harness.lifecycle.dispose(); }
});

test('an unconfigured installation does not read an arbitrary default folder', async () => {
  const { bb, harness } = createFakePluginHost({ pluginId: 'vault-files', agentSkillIds: ['vault-files'] });
  await plugin(bb);
  try {
    await expect(harness.behavior.callRpc('resolve', { path: '/etc/passwd' })).rejects.toThrow('укажите путь');
    expect(harness.experimental_hostRpcCalls).toHaveLength(0);
  } finally { await harness.lifecycle.dispose(); }
});

test('Drive links accept only folder IDs or HTTPS Drive folder URLs', () => {
  expect(folderId(settings.driveFolderUrl)).toBe('demo-root-12345');
  expect(folderId('')).toBe('');
  expect(folderId('demo-root-12345')).toBe('demo-root-12345');
  for (const value of ['http://drive.google.com/drive/folders/demo-root-12345','https://drive.google.com.evil.test/drive/folders/demo-root-12345','https://example.com/drive/folders/demo-root-12345']) expect(() => folderId(value)).toThrow();
});
