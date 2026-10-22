// @vitest-environment jsdom
import { test, expect, afterEach } from 'vitest';
import { cleanup, fireEvent } from '@testing-library/react';
import { loadPluginApp, renderSlot } from '@get-bb/plugin-sdk/testing/app';
import type { VaultFile } from './contract';
afterEach(cleanup);
const file: VaultFile = { hostId: 'host-demo', path: 'project/test.md', absolutePath: '/example/vault/project/test.md', name: 'test.md', isDirectory: false, size: 1024, modifiedAt: '2026-10-21', driveUrl: 'https://drive.google.com/file/d/test/view', driveStatus: 'found', account: 'person@example.com' };

test('card shows native preview and exact Drive link', async () => {
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.messageDirectives[0]!, { attributes: { path: file.path }, source: '', message: { id: 'm', threadId: 't', turnId: 'turn', projectId: 'p' }, openWorkspaceFile: null }, { rpc: { resolve: () => file } });
  await slot.findByText('test.md');
  expect((await slot.findByText('Google Drive')).getAttribute('href')).toBe(file.driveUrl);
  const preview = await slot.findByText('Просмотреть');
  expect(preview.tagName).toBe('A');
  fireEvent.click(preview);
  expect(slot.inspection.navigateCalls.some(c => c.method === 'openThreadPanel')).toBe(true);
  slot.lifecycle.unmount();
});

test('pending Drive record never produces a guessed link', async () => {
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.messageDirectives[0]!, { attributes: { path: file.path }, source: '', message: { id: 'm', threadId: 't', turnId: 'turn', projectId: 'p' }, openWorkspaceFile: null }, { rpc: { resolve: () => ({ ...file, driveStatus: 'pending', driveUrl: null }) } });
  await slot.findByText('Копия в Drive пока не найдена');
  expect(slot.queryByText('Google Drive')).toBeNull();
  slot.lifecycle.unmount();
});

test('Markdown opens rendered and can switch to exact source', async () => {
  const app = await loadPluginApp(() => import('./app'));
  const panel = app.threadPanelActions.find(p => p.id === 'document')!;
  const slot = renderSlot(panel, { threadId: 't', params: { path: file.path } }, { rpc: { read: () => ({ file, content: '# Документ\n\nТекст' }) } });
  expect((await slot.findByTestId('bb-markdown')).textContent).toBe('# Документ\n\nТекст');
  fireEvent.click(await slot.findByText('Исходник'));
  expect(slot.container.querySelector('pre')?.textContent).toBe('# Документ\n\nТекст');
  slot.lifecycle.unmount();
});

test.each([true, false])('copy reports actual clipboard outcome: %s', async success => {
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.messageDirectives[0]!, { attributes: { path: file.path }, source: '', message: { id: 'm', threadId: 't', turnId: 'turn', projectId: 'p' }, openWorkspaceFile: null }, { rpc: { resolve: () => file }, experimental_copyToClipboard: async () => success });
  fireEvent.click(await slot.findByRole('button', { name: 'Скопировать ссылку Google Drive' }));
  await slot.findByText(success ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку');
  expect(slot.inspection.experimental_clipboardWrites).toEqual([{ text: file.driveUrl }]);
  slot.lifecycle.unmount();
});

test.each([true, false])('Finder action sends only the relative path and surfaces errors: %s', async success => {
  const calls: unknown[] = [];
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.messageDirectives[0]!, { attributes: { path: file.path }, source: '', message: { id: 'm', threadId: 't', turnId: 'turn', projectId: 'p' }, openWorkspaceFile: null }, { rpc: { resolve: () => file, reveal: (input: unknown) => { calls.push(input); if (!success) throw new Error('Finder недоступен'); return { revealed: true }; } } });
  fireEvent.click(await slot.findByRole('button', { name: /Показать в Finder/ }));
  if (!success) await slot.findByRole('alert');
  expect(calls).toEqual([{ path: file.path }]);
  slot.lifecycle.unmount();
});

test('Windows card says Show in folder instead of Finder and both links have no arrows', async () => {
  const app = await loadPluginApp(() => import('./app'));
  const slot = renderSlot(app.messageDirectives[0]!, { attributes: { path: file.path }, source: '', message: { id: 'm', threadId: 't', turnId: 'turn', projectId: 'p' }, openWorkspaceFile: null }, { rpc: { resolve: () => ({ ...file, platform: 'win32', absolutePath: 'C:\\Vault\\project\\test.md' }) } });
  await slot.findByRole('button', { name: /Показать в папке/ });
  expect(slot.queryByRole('button', { name: /Finder/ })).toBeNull();
  expect((await slot.findByText('Google Drive')).textContent).toBe('Google Drive');
  expect(slot.container.textContent).not.toContain('↗');
  slot.lifecycle.unmount();
});
