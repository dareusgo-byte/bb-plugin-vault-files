import { defineCli, cliCommand, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { uploadReceiptSchema, canonicalDriveUrl, uploadKey, UPLOAD_INSTRUCTIONS, type UploadRecord } from './cloud-policy';
import { hostContract, rpcContract, pathInput, type BridgeConfig, type VaultFile } from './contract';

export const FILE_INSTRUCTIONS = 'Когда передаёшь основной пользовательский файл настроенного vault, вызови vault_file_link или bb vault-files resolve для точного пути. Покажи возвращённую директиву ::vault-file{path="путь/от/корня/vault"} отдельной строкой. Не добавляй дублирующие ссылки под карточкой: кнопки просмотра и Google Drive уже есть в ней. Для файлов вне vault или при недоступной карточке используй обычную локальную ссылку. Не угадывай Drive URL. При существующей синхронизации не создавай дубль; создание новой копии разрешено только при uploadMode=always по правилам выгрузки. Найденная запись Drive подтверждает адрес копии, а не синхронизацию последней правки. Правило относится ко всем проектам и провайдерам, включая боковые чаты.';

export function folderId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^[A-Za-z0-9_-]{10,256}$/.test(trimmed)) return trimmed;
  let url: URL;
  try { url = new URL(trimmed); } catch { throw new Error('Укажите ссылку на папку Google Drive'); }
  const match = url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,256})(?:\/|$)/);
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || !match) throw new Error('Нужна ссылка https://drive.google.com/drive/folders/...');
  return match[1]!;
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    uploadMode: { type: 'select', label: 'Создавать копию в Google Drive, если её нет?', options: ['ask', 'always', 'never'], experimental_optionLabels: { ask: 'Выбрать при настройке', always: 'Да, всегда выгружать через подключённый Google Drive агента', never: 'Нет, только локальные файлы и существующая синхронизация' }, default: 'ask' },
    vaultRoot: { type: 'string', label: 'Путь к папке vault', default: '', experimental_schema: z.string().max(4096) },
    driveFolderUrl: { type: 'string', label: 'Ссылка на эту папку в Google Drive (необязательно)', default: '', experimental_schema: z.string().max(2048).refine(v => { try { folderId(v); return true; } catch { return false; } }, 'Укажите ссылку на папку Google Drive') },
    driveAccount: { type: 'string', label: 'Аккаунт Google Drive (необязательно)', default: '', experimental_schema: z.string().max(320) },
    hostId: { type: 'string', label: 'Компьютер BB: оставьте пустым для основного компьютера', default: '', experimental_schema: z.string().max(256) },
  });
  let current = await settings.get();
  settings.onChange(next => { current = next; });
  const host = bb.hosts.experimental_client({ contract: hostContract });
  async function configuration(): Promise<BridgeConfig> {
    const values = await settings.get();
    if (!values.vaultRoot.trim()) throw new Error('Откройте настройки «Vault Files» и укажите путь к папке vault.');
    const hostId = values.hostId || (await bb.sdk.system.config()).primaryHostId;
    if (!hostId) throw new Error('Основной компьютер BB недоступен. Выберите подключённый компьютер в настройках.');
    return { vaultRoot: values.vaultRoot.trim(), hostId, driveFolderId: folderId(values.driveFolderUrl), driveAccount: values.driveAccount.trim() };
  }
  async function uploadedFile(file: VaultFile, config: BridgeConfig): Promise<VaultFile> {
    const record = await bb.storage.kv.get<UploadRecord>(uploadKey(config.hostId, config.vaultRoot, file.path));
    if (!record || (config.driveAccount && record.account.toLowerCase() !== config.driveAccount.toLowerCase())) return file;
    return { ...file, driveUrl: record.driveUrl, driveStatus: 'found', account: record.account, driveSource: 'agent-upload', uploadStatus: record.modifiedAt === file.modifiedAt && record.size === file.size ? 'current' : 'stale' };
  }
  const resolve = async (path: string) => { const config = await configuration(); return uploadedFile(await host.call('resolve', { path, config }, { hostId: config.hostId }), config); };
  const list = async (path: string) => { const config = await configuration(); const result = await host.call('list', { path, config }, { hostId: config.hostId }); return { ...result, files: await Promise.all(result.files.map(file => uploadedFile(file, config))) }; };
  const read = async (path: string) => { const config = await configuration(); const result = await host.call('read', { path, config }, { hostId: config.hostId }); return { ...result, file: await uploadedFile(result.file, config) }; };
  const reveal = async (path: string) => { const config = await configuration(); return host.call('reveal', { path, config }, { hostId: config.hostId }); };
  bb.rpc.register(rpcContract, { reveal: ({ path }) => reveal(path), read: ({ path }) => read(path), resolve: ({ path }) => resolve(path), list: ({ path }) => list(path) });
  bb.agents.configure(() => ({ tools: ['vault_file_link', 'vault_file_uploaded'], skills: ['vault-files'], instructions: current.vaultRoot.trim() ? `${FILE_INSTRUCTIONS}\n${UPLOAD_INSTRUCTIONS}\nРежим выгрузки: ${current.uploadMode}.\nНастроенный vault: ${current.vaultRoot.trim()}` : 'Плагин Vault Files установлен, но папка ещё не выбрана. Настройте его по просьбе пользователя через настройки плагина или bb vault-files setup; до этого не обещайте карточки файлов.' }));
  async function prepareFile(path: string) {
      const file = await resolve(path);
      const directive = `::vault-file{path=${JSON.stringify(file.path)}}`;
      const mode = (await settings.get()).uploadMode;
      if (file.isDirectory || mode !== 'always' || (file.driveUrl && file.driveSource !== 'agent-upload')) return JSON.stringify({ ...file, directive, requiresDriveChoice: !file.driveUrl && mode === 'ask', note: !file.driveUrl && mode === 'ask' ? 'Откройте настройки Vault Files и выберите, создавать ли файлы в подключённом Google Drive.' : 'Запись Drive подтверждает адрес копии, но не синхронизацию последнего содержимого.' });
      const config = await configuration();
      const fingerprint = await host.call('fingerprint', { path, config }, { hostId: config.hostId, timeoutMs: 120000 });
      const record = await bb.storage.kv.get<UploadRecord>(uploadKey(config.hostId, config.vaultRoot, file.path));
      if (record && record.sha256 === fingerprint.sha256 && record.driveUrl === file.driveUrl) return JSON.stringify({ ...file, directive, uploadRequired: false });
      return JSON.stringify({ ...file, uploadRequired: true, sha256: fingerprint.sha256, expectedAccount: config.driveAccount || null, existingDriveUrl: file.driveUrl, localFallbackDirective: directive, instruction: UPLOAD_INSTRUCTIONS });
  }
  bb.agents.registerTool({
    name: 'vault_file_link', description: 'Проверить файл настроенного vault и получить карточку или план загрузки через подключённый Google Drive. Сам инструмент ничего не загружает.', parameters: pathInput,
    presentation: { label: { pending: 'Проверяю файл и ссылку Google Drive', completed: 'Файл и ссылка Google Drive проверены' } },
    async execute({ path }) { return prepareFile(path); },
  });
  bb.agents.registerTool({
    name: 'vault_file_uploaded', description: 'Зарегистрировать точный ответ успешной загрузки Google Drive и получить карточку. Вызывать только после upload_file/update_file; не создаёт облачный файл сам.', parameters: uploadReceiptSchema,
    async execute(input) {
      const values = await settings.get();
      if (values.uploadMode !== 'always') throw new Error('Сначала разрешите выгрузку в настройках Vault Files.');
      const config = await configuration();
      if (config.driveAccount && config.driveAccount.toLowerCase() !== input.account.toLowerCase()) throw new Error('Аккаунт загрузки не совпадает с выбранным в настройках.');
      const result = await host.call('fingerprint', { path: input.path, config }, { hostId: config.hostId, timeoutMs: 120000 });
      if (result.sha256 !== input.sha256) throw new Error('Файл изменился после подготовки загрузки. Повторите загрузку актуального файла.');
      const driveUrl = canonicalDriveUrl(input.driveUrl, input.account);
      const record: UploadRecord = { driveUrl, account: input.account, sha256: result.sha256, modifiedAt: result.file.modifiedAt, size: result.file.size };
      await bb.storage.kv.set(uploadKey(config.hostId, config.vaultRoot, result.file.path), record);
      return JSON.stringify({ ...result.file, driveUrl, driveStatus: 'found', driveSource: 'agent-upload', directive: `::vault-file{path=${JSON.stringify(result.file.path)}}`, note: 'Ссылка зарегистрирована по ответу инструмента Google Drive; доступ к файлу не изменён.' });
    },
  });

  bb.cli.register(defineCli({ name: 'vault-files', summary: 'Библиотека vault, карточки файлов и ссылки Google Drive', commands: {
    setup: cliCommand({ summary: 'Настроить свою папку vault', options: {
      root: { type: 'string', required: true, description: 'Абсолютный путь к vault на компьютере BB' },
      'drive-folder': { type: 'string', description: 'Ссылка на ту же папку в Google Drive' },
      account: { type: 'string', description: 'Аккаунт Google Drive для открытия ссылки' },
      host: { type: 'string', description: 'Компьютер BB; по умолчанию основной' },
      json: { type: 'boolean', description: 'Вывести JSON' },
    }, async run(input) {
      const config: BridgeConfig = { vaultRoot: input.options.root, driveFolderId: folderId(input.options['drive-folder'] || ''), driveAccount: input.options.account || '', hostId: input.options.host || (await bb.sdk.system.config()).primaryHostId || '' };
      if (!config.hostId) throw new Error('Выберите подключённый компьютер BB');
      await host.call('list', { path: '', config }, { hostId: config.hostId });
      await settings.experimental_set({ vaultRoot: config.vaultRoot, driveFolderUrl: input.options['drive-folder'] || '', driveAccount: config.driveAccount, hostId: input.options.host || '' });
      return { exitCode: 0, stdout: input.options.json ? JSON.stringify({ configured: true }) : 'Vault настроен. Откройте библиотеку Vault Files.' };
    } }),
    prepare: cliCommand({ summary: 'Prepare a card or an authorized upload plan', positionals: [{ name: 'path', required: true, description: 'Vault-relative file path' }], options: { json: { type: 'boolean', description: 'Output JSON' } }, async run(input) { return { exitCode: 0, stdout: await prepareFile(input.positionals.path) }; } }),
    resolve: cliCommand({ summary: 'Найти файл и точную ссылку Drive', positionals: [{ name: 'path', required: true, description: 'Путь от корня vault или абсолютный путь на выбранном компьютере' }], options: { json: { type: 'boolean', description: 'Вывести JSON' } }, async run(input) {
      const file = await resolve(input.positionals.path); const result = { ...file, directive: `::vault-file{path=${JSON.stringify(file.path)}}` };
      return { exitCode: 0, stdout: input.options.json ? JSON.stringify(result) : `${file.name}\n${result.directive}\nDrive: ${file.driveUrl || file.driveStatus}` };
    } }),
    list: cliCommand({ summary: 'Показать до 250 элементов папки vault', positionals: [{ name: 'path', description: 'Путь от корня; по умолчанию корень' }], options: { json: { type: 'boolean', description: 'Вывести JSON' } }, async run(input) {
      const result = await list(input.positionals.path || ''); return { exitCode: 0, stdout: input.options.json ? JSON.stringify(result) : result.files.map(f => `${f.isDirectory ? '📁' : '📄'} ${f.path}`).join('\n') };
    } }),
  } }));
}
