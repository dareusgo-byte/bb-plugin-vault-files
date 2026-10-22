import { test, expect } from 'vitest';
import { pythonCommands, revealCommand } from './platform';

test('Windows selects the exact Unicode filename as a separate argument, without a shell', () => {
  const path = 'C:\\Users\\Demo\\Мой vault\\план & отчёт.md';
  expect(revealCommand(path, 'win32', 'D:\\Windows')).toEqual({ command: 'D:\\Windows\\explorer.exe', args: ['/select,', path] });
  expect(pythonCommands('win32')[0]).toEqual({ command: 'py', args: ['-3'] });
  expect(pythonCommands('win32').map(c => c.command)).toEqual(['py','python','python3']);
});
test('macOS selects the file and Linux opens its parent directory', () => {
  expect(revealCommand('/vault/plan.md', 'darwin')).toEqual({ command: '/usr/bin/open', args: ['-R','/vault/plan.md'] });
  expect(revealCommand('/vault/plan.md', 'linux')).toEqual({ command: 'xdg-open', args: ['/vault'] });
});
