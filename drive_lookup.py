"""Read-only bridge to the existing Drive for Desktop index. Never writes files."""
import datetime
import json
import os
from pathlib import Path
import sqlite3
import sys
import unicodedata
from urllib.parse import quote

ROOT = None
ACCOUNT = ''
DRIVE_ROOT_ID = ''
HOST_ID = ''
INDEX_STATUS = 'unconfigured'


def configure(config):
    global ROOT, ACCOUNT, DRIVE_ROOT_ID, HOST_ID
    root = config.get('vaultRoot', '')
    if not root or not Path(root).expanduser().is_absolute():
        raise ValueError('Укажите абсолютный путь к vault в настройках плагина')
    ROOT = Path(root).expanduser().resolve(strict=True)
    if not ROOT.is_dir():
        raise ValueError('Путь к vault должен указывать на папку')
    ACCOUNT = config.get('driveAccount', '')
    DRIVE_ROOT_ID = config.get('driveFolderId', '')
    HOST_ID = config['hostId']


HIDDEN = {'.git', '.obsidian', '.agents', '.bb', '.claude', '.codex', '.codex-work', 'node_modules', '__pycache__'}

def checked_path(raw):
    if not isinstance(raw, str) or '\x00' in raw or ('\\' in raw and sys.platform != 'win32'):
        raise ValueError('Некорректный путь')
    value = Path(raw)
    if (sys.platform == 'win32' and value.drive and not value.is_absolute()):
        raise ValueError('Укажите полный путь с буквой диска')
    if '..' in value.parts:
        raise ValueError('Выход за пределы vault запрещён')
    full = value if value.is_absolute() else ROOT / value
    root = ROOT.resolve(strict=True)
    target = full.resolve(strict=True)
    try:
        rel = target.relative_to(root)
    except ValueError:
        raise ValueError('Файл находится вне vault')
    if sys.platform == 'win32' and any(':' in x for x in rel.parts):
        raise ValueError('Альтернативные потоки файлов не поддерживаются')
    if any(x.startswith('.') or x in HIDDEN for x in rel.parts):
        raise ValueError('Служебные файлы не показываются в библиотеке')
    return target, rel

def index_base():
    if sys.platform == 'win32':
        local = os.environ.get('LOCALAPPDATA')
        return (Path(local) if local else Path.home() / 'AppData/Local') / 'Google/DriveFS'
    return Path.home() / 'Library/Application Support/Google/DriveFS'


def open_index():
    global INDEX_STATUS
    if not DRIVE_ROOT_ID:
        INDEX_STATUS = 'unconfigured'
        return None
    base = index_base()
    matches = []
    had_index = False
    if base.is_dir():
        for account_dir in sorted(base.iterdir()):
            if not account_dir.name.isdigit():
                continue
            db = account_dir / 'metadata_sqlite_db'
            if not db.is_file():
                continue
            had_index = True
            connection = None
            try:
                connection = sqlite3.connect(db.as_uri() + '?mode=ro', uri=True, timeout=2)
                rows = connection.execute('SELECT stable_id FROM items WHERE id=? AND trashed=0 AND is_tombstone=0', (DRIVE_ROOT_ID,)).fetchall()
                if len(rows) == 1:
                    matches.append(connection)
                    connection = None
            except sqlite3.Error:
                pass
            finally:
                if connection is not None:
                    connection.close()
    if len(matches) == 1:
        INDEX_STATUS = 'found'
        return matches[0]
    for connection in matches:
        connection.close()
    INDEX_STATUS = 'ambiguous' if matches else ('pending' if had_index else 'unavailable')
    return None


def drive_match(connection, rel):
    if connection is None:
        return None, INDEX_STATUS
    try:
        rows = connection.execute('SELECT stable_id,id,is_folder FROM items WHERE id=? AND trashed=0 AND is_tombstone=0', (DRIVE_ROOT_ID,)).fetchall()
        for segment in rel.parts:
            next_rows = []
            for sid, _, _ in rows:
                # Normalize Unicode because macOS filenames may use NFD.
                children = connection.execute('SELECT i.stable_id,i.id,i.is_folder,i.local_title FROM items i JOIN stable_parents p ON p.item_stable_id=i.stable_id WHERE p.parent_stable_id=? AND i.trashed=0 AND i.is_tombstone=0', (sid,))
                next_rows.extend((s, i, f) for s, i, f, title in children if unicodedata.normalize('NFC', title or '') == unicodedata.normalize('NFC', segment))
            rows = list(dict.fromkeys(next_rows))
            if not rows:
                return None, 'pending'
        if len(rows) != 1:
            return None, 'ambiguous' if rows else 'pending'
        _, fid, folder = rows[0]
        route = 'drive/folders/' if folder else 'file/d/'
        suffix = '' if folder else '/view'
        return 'https://drive.google.com/' + route + quote(fid, safe='') + suffix + (('?authuser=' + quote(ACCOUNT, safe='')) if ACCOUNT else ''), 'found'
    except sqlite3.Error:
        return None, 'unavailable'

def describe(target, rel, connection):
    stat = target.stat()
    url, status = drive_match(connection, rel)
    return dict(platform=sys.platform if sys.platform in ('darwin', 'win32', 'linux') else 'linux', hostId=HOST_ID, path=rel.as_posix() if rel.parts else '', absolutePath=str(target), name=target.name, isDirectory=target.is_dir(), size=stat.st_size, modifiedAt=datetime.datetime.fromtimestamp(stat.st_mtime, datetime.timezone.utc).isoformat(), driveUrl=url, driveStatus=status, account=ACCOUNT)

def main():
    request = json.loads(sys.stdin.read(32768))
    configure(request['config'])
    target, rel = checked_path(request['path'])
    try:
        connection = open_index()
    except (sqlite3.Error, OSError, ValueError):
        connection = None
    try:
        if request['operation'] == 'resolve':
            result = describe(target, rel, connection)
        elif request['operation'] == 'read':
            if target.suffix.lower() not in ('.md', '.markdown', '.txt') or not target.is_file():
                raise ValueError('Этот режим предназначен для Markdown и текста')
            if target.stat().st_size > 2 * 1024 * 1024:
                raise ValueError('Документ больше 2 МБ — откройте его через стандартный просмотр BB')
            with target.open(encoding='utf-8-sig') as stream:
                content = stream.read(2 * 1024 * 1024 + 1)
            if len(content) > 2 * 1024 * 1024:
                raise ValueError('Документ больше 2 МБ')
            result = dict(file=describe(target, rel, connection), content=content)
        elif request['operation'] == 'list':
            if not target.is_dir():
                raise ValueError('Выберите папку')
            entries = []
            for item in target.iterdir():
                if item.name.startswith('.') or item.name in HIDDEN or item.is_symlink():
                    continue
                entries.append(item)
            entries.sort(key=lambda p: (not p.is_dir(), p.name.casefold()))
            files = []
            for item in entries[:250]:
                try:
                    safe_item, safe_rel = checked_path(str(item))
                    files.append(describe(safe_item, safe_rel, connection))
                except (OSError, ValueError):
                    continue
            result = dict(path=rel.as_posix() if rel.parts else '', files=files, truncated=len(entries) > 250)
        else:
            raise ValueError('Неизвестная операция')
        print(json.dumps(result, ensure_ascii=False))
    finally:
        if connection:
            connection.close()

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
