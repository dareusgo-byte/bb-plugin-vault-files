import { useEffect, useState } from 'react';
import { definePluginApp, useRpc, useBbNavigate, experimental_FileLink as FileLink, UrlLink, Markdown, useSettings, experimental_copyToClipboard } from '@get-bb/plugin-sdk/app';
import type { PluginMessageDirectiveProps } from '@get-bb/plugin-sdk/app';
import type { rpcContract, VaultFile } from './contract';
import './app.css';
import { FileTypeIcon } from './file-icons';

function formatSize(size: number) { return size < 1024 ? `${size} Б` : size < 1048576 ? `${Math.round(size / 1024)} КБ` : `${(size / 1048576).toFixed(1)} МБ`; }
const statusText = { found: 'Ссылка на копию в Drive найдена', pending: 'Копия в Drive пока не найдена', ambiguous: 'В Drive несколько совпадений — ссылка не выбрана', unavailable: 'Индекс Google Drive сейчас недоступен', unconfigured: 'Google Drive не подключён' };

export function DriveActions({ url, account }: { url: string; account: string }) {
  const [result, setResult] = useState('');
  const [copying, setCopying] = useState(false);
  const copy = async () => {
    setCopying(true); setResult('');
    try { setResult(await experimental_copyToClipboard({ text: url }) ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку'); }
    catch { setResult('Не удалось скопировать ссылку'); }
    finally { setCopying(false); }
  };
  return <><span className="vf-drive-actions"><UrlLink className="vf-button" href={url} title={account ? `Открыть в аккаунте ${account}` : 'Открыть в Google Drive'}>Google Drive</UrlLink><button className="vf-button vf-copy" disabled={copying} onClick={copy} aria-label="Скопировать ссылку Google Drive" title="Скопировать ссылку Google Drive"><svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M12 4V3H3v9h1"/></svg></button></span>{result && <span className="vf-status" role="status">{result}</span>}</>;
}

export function FileCard({ file, onFolder, refresh }: { file: VaultFile; onFolder?: (path: string) => void; refresh?: () => void }) {
  const navigate = useBbNavigate();
  const settings = useSettings();
  const rpc = useRpc<typeof rpcContract>();
  const revealLabel = file.platform && file.platform !== 'darwin' ? 'Показать в папке' : 'Показать в Finder';
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState('');
  const reveal = async () => {
    setRevealing(true); setRevealError('');
    try { await rpc.call('reveal', { path: file.path }); }
    catch (e) { setRevealError(e instanceof Error ? e.message : 'Не удалось показать файл в папке'); }
    finally { setRevealing(false); }
  };
  const openFolder = () => onFolder ? onFolder(file.path) : navigate.openThreadPanel({ actionId: 'library', title: 'Файлы vault', params: { path: file.path } });
  return <article className="vf-card">
    <FileTypeIcon name={file.name} isDirectory={file.isDirectory} />
    <div className="vf-card-main">
      <div className="vf-name">{file.name}</div>
      <button className="vf-path vf-path-action" title={`${revealLabel} на компьютере с vault: ${file.absolutePath}`} onClick={reveal} disabled={revealing}><span className="vf-reveal-label">{revealing ? 'Открываю папку…' : revealLabel}</span><span className="vf-path-value">{file.path || 'Корень vault'}</span></button>
      {revealError && <div className="vf-status" role="alert">{revealError}</div>}
      {file.uploadStatus === 'stale' && <div className="vf-status">Локальный файл изменён после последней зарегистрированной выгрузки</div>}
      <div className="vf-meta">{file.isDirectory ? 'Папка' : formatSize(file.size)} · локальный файл</div>
      <div className="vf-actions">
        {file.isDirectory ? <button className="vf-button vf-primary" onClick={openFolder}>Открыть папку</button> :
          <FileLink className="vf-button vf-primary" target={{ kind: 'host', hostId: file.hostId, path: file.absolutePath }} onClick={event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !/\.(md|markdown|txt)$/i.test(file.name)) return;
            if (navigate.openThreadPanel({ actionId: 'document', title: file.name, params: { path: file.path } })) event.preventDefault();
          }}>Просмотреть</FileLink>}
        {file.driveUrl ? <DriveActions url={file.driveUrl} account={file.account} /> : <span className="vf-status">{settings.values?.uploadMode === 'ask' ? 'В настройках Vault Files выберите, создавать ли копии в Google Drive' : statusText[file.driveStatus]}</span>}
        {refresh && <button className="vf-icon-button" onClick={refresh} aria-label="Обновить ссылку Google Drive" title="Обновить">↻</button>}
      </div>
    </div>
  </article>;
}

export function FileDirective({ attributes }: PluginMessageDirectiveProps) {
  const rpc = useRpc<typeof rpcContract>();
  const path = attributes.path;
  const [file, setFile] = useState<VaultFile | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setFile(null); setError('');
    if (typeof path !== 'string' || path.length > 4096) { setError('У карточки не указан корректный путь'); return; }
    rpc.call('resolve', { path }).then(f => { if (active) setFile(f); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Не удалось открыть файл'); });
    return () => { active = false; };
  }, [rpc, path, revision]);
  if (error) return <div className="vf-error" role="alert">{error}<button className="vf-button" onClick={() => setRevision(x => x + 1)}>Повторить</button></div>;
  return file ? <FileCard file={file} refresh={() => setRevision(x => x + 1)} /> : <div className="vf-loading">Проверяю файл…</div>;
}

export function Library({ initialPath = '' }: { initialPath?: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const [path, setPath] = useState(initialPath);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setPath(initialPath); }, [initialPath]);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setQuery('');
    rpc.call('list', { path }).then(result => { if (active) { setFiles(result.files); setTruncated(result.truncated); setLoading(false); } }).catch(e => { if (active) { setError(e instanceof Error ? e.message : 'Папка недоступна'); setLoading(false); } });
    return () => { active = false; };
  }, [rpc, path, revision]);
  const parts = path.split('/').filter(Boolean);
  const visible = files.filter(f => f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="vf-library">
    <div className="vf-library-top">
      <div className="vf-account">Vault <span>{files[0]?.account ? `· ${files[0].account}` : ""}</span></div>
      <nav className="vf-breadcrumbs" aria-label="Путь в vault"><button onClick={() => setPath('')}>Vault</button>{parts.map((part, i) => <span key={i}> / <button onClick={() => setPath(parts.slice(0, i + 1).join('/'))}>{part}</button></span>)}</nav>
      <div className="vf-search-row"><input aria-label="Найти в текущей папке" placeholder="Найти в этой папке…" value={query} onChange={e => setQuery(e.target.value)} /><button className="vf-button" onClick={() => setRevision(x => x + 1)} aria-label="Обновить папку">↻</button></div>
    </div>
    <div className="vf-file-list">
      {loading ? <div className="vf-loading">Открываю папку…</div> : error ? <div className="vf-error" role="alert">{error}</div> : visible.map(f => <FileCard key={f.path} file={f} onFolder={setPath} />)}
      {!loading && !error && !visible.length && <div className="vf-loading">{query ? 'Совпадений в этой папке нет' : 'Папка пуста'}</div>}
      {truncated && <p className="vf-status">Показаны первые 250 элементов. Откройте нужную подпапку.</p>}
    </div>
    <p className="vf-footnote">Файлы читаются с компьютера, где хранится vault. Кнопка Drive открывает существующую облачную копию; актуальность её содержимого здесь не проверяется.</p>
  </div>;
}

export function DocumentView({ path }: { path: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const [document, setDocument] = useState<{ file: VaultFile; content: string } | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setDocument(null); setError(''); setSource(false);
    rpc.call('read', { path }).then(d => { if (active) setDocument(d); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Документ недоступен'); });
    return () => { active = false; };
  }, [rpc, path, revision]);
  if (error) return <div className="vf-error" role="alert">{error}<button className="vf-button" onClick={() => setRevision(x => x + 1)}>Повторить</button></div>;
  if (!document) return <div className="vf-loading">Открываю документ…</div>;
  return <div className="vf-library">
    <div className="vf-document-toolbar"><button className="vf-button" aria-pressed={!source} onClick={() => setSource(false)}>Документ</button><button className="vf-button" aria-pressed={source} onClick={() => setSource(true)}>Исходник</button>{document.file.driveUrl && <DriveActions url={document.file.driveUrl} account={document.file.account} />}<button className="vf-button" onClick={() => setRevision(x => x + 1)} aria-label="Обновить документ">↻</button></div>
    <div className="vf-document-body">{source || /\.txt$/i.test(path) ? <pre>{document.content}</pre> : <Markdown content={document.content} />}</div>
  </div>;
}

function pathParam(params: unknown) { return params && typeof params === 'object' && 'path' in params && typeof params.path === 'string' ? params.path : ''; }
export default definePluginApp(app => {
  app.slots.threadPanelAction({ id: 'document', title: 'Просмотр документа', icon: 'FileText', layout: 'flush', component: ({ params }) => <DocumentView path={pathParam(params)} /> });
  app.slots.messageDirective({ id: 'vault-file', component: FileDirective });
  app.slots.threadPanelAction({ id: 'library', title: 'Файлы vault', icon: 'Files', layout: 'flush', component: ({ params }) => <Library initialPath={params && typeof params === 'object' && !Array.isArray(params) && typeof params.path === 'string' ? params.path : ''} /> });
  app.slots.navPanel({ id: 'library', title: 'Файлы vault', icon: 'Files', path: 'library', component: () => <Library /> });
  app.commands.register({ id: 'open-library', title: 'Файлы vault: открыть библиотеку', isAvailable: ctx => !!ctx.threadId, run: ({ openPanel }) => { openPanel({ actionId: 'library', title: 'Файлы vault' }); } });
});
