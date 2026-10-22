import { dirname, win32 } from 'node:path';

export function pythonCommands(platform: NodeJS.Platform): { command: string; args: string[] }[] {
  return platform === 'win32'
    ? [{ command: 'py', args: ['-3'] }, { command: 'python', args: [] }, { command: 'python3', args: [] }]
    : [{ command: 'python3', args: [] }];
}
export function revealCommand(path: string, platform: NodeJS.Platform, windowsRoot = 'C:\\Windows') {
  if (platform === 'darwin') return { command: '/usr/bin/open', args: ['-R', path] };
  if (platform === 'win32') return { command: win32.join(windowsRoot, 'explorer.exe'), args: ['/select,', path] };
  if (platform === 'linux') return { command: 'xdg-open', args: [dirname(path)] };
  throw new Error('Показ файла в папке на этой системе пока не поддерживается.');
}
