import { experimental_defineHostEntry } from '@get-bb/plugin-sdk';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { hostContract, fileSchema, listingSchema, documentSchema, type BridgeConfig } from './contract';
import lookupScript from './lookup-script';
import { pythonCommands, revealCommand } from './platform';

async function run(operation: 'resolve' | 'list' | 'read', path: string, config: BridgeConfig, signal: AbortSignal) {
  for (const candidate of pythonCommands(process.platform)) {
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const child = execFile(candidate.command, [...candidate.args, '-c', lookupScript], {
          signal, timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
          env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        }, (error, stdout, stderr) => {
          if (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') reject(error);
            else reject(new Error(stderr.trim() || 'Не удалось прочитать файл vault'));
            return;
          }
          try { resolve(JSON.parse(stdout)); } catch { reject(new Error('Некорректный ответ локального индекса')); }
        });
        child.stdin?.on('error', () => {}); // A missing interpreter can close stdin before the request is written.
        child.stdin?.end(JSON.stringify({ operation, path, config }));
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Нужен Python 3 на компьютере с vault. В Windows установите Python с python.org и включите launcher py или добавление в PATH.');
}

export default experimental_defineHostEntry({ contract: hostContract, handlers: {
  fingerprint: async ({ path, config }, ctx) => {
    const file = fileSchema.parse(await run('resolve', path, config, ctx.signal));
    if (file.isDirectory) throw new Error('В Google Drive выгружаются отдельные файлы, не весь vault.');
    const before = await stat(file.absolutePath);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(file.absolutePath, { signal: ctx.signal })) hash.update(chunk);
    const after = await stat(file.absolutePath);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Файл изменился во время проверки. Повторите выдачу.');
    return { file, sha256: hash.digest('hex') };
  },
  reveal: async ({ path, config }, ctx) => {
    // Resolve on the configured host: existing path, root confinement and symlink checks.
    const file = fileSchema.parse(await run('resolve', path, config, ctx.signal));
    const command = revealCommand(file.absolutePath, process.platform, process.env.SystemRoot);
    await new Promise<void>((resolve, reject) => {
      execFile(command.command, command.args, { signal: ctx.signal, timeout: 10000, windowsHide: true }, error => {
        if (error) reject(new Error('Не удалось показать файл в папке на компьютере с vault.'));
        else resolve();
      });
    });
    return { revealed: true as const };
  },
  read: async ({ path, config }, ctx) => documentSchema.parse(await run('read', path, config, ctx.signal)),
  resolve: async ({ path, config }, ctx) => fileSchema.parse(await run('resolve', path, config, ctx.signal)),
  list: async ({ path, config }, ctx) => listingSchema.parse(await run('list', path, config, ctx.signal)),
} });
