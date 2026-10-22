import importlib.util
import os
import sys
from unittest.mock import patch
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('lookup', Path(__file__).with_name('drive_lookup.py'))
lookup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lookup)

class LookupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.original_root = lookup.ROOT
        self.addCleanup(lambda: setattr(lookup, 'ROOT', self.original_root))
        lookup.ROOT = Path(self.temp.name) / 'vault'
        lookup.ROOT.mkdir()
        lookup.DRIVE_ROOT_ID = 'drive-root-demo'
        lookup.INDEX_STATUS = 'unavailable'

    def test_confines_absolute_relative_and_symlink_paths(self):
        (lookup.ROOT / 'документ.md').write_text('текст', encoding='utf-8')
        self.assertEqual(lookup.checked_path('документ.md')[1], Path('документ.md'))
        for path in ['../outside', '/etc/hosts', '.git/config', 'a\x00b']:
            with self.assertRaises((ValueError, FileNotFoundError)):
                lookup.checked_path(path)
        outside = Path(self.temp.name) / 'outside.md'
        outside.write_text('private')
        try:
            (lookup.ROOT / 'escape.md').symlink_to(outside)
        except OSError:
            return  # Symlink creation can need a Windows privilege; other confinement checks ran.
        with self.assertRaises(ValueError):
            lookup.checked_path('escape.md')

    def test_windows_index_location_and_native_paths(self):
        with patch.object(lookup.sys, 'platform', 'win32'), patch.dict(os.environ, {'LOCALAPPDATA': self.temp.name}):
            self.assertEqual(lookup.index_base(), Path(self.temp.name) / 'Google/DriveFS')
        if os.name == 'nt':
            target = lookup.ROOT / 'план & отчёт.md'
            target.write_text('текст', encoding='utf-8')
            self.assertEqual(lookup.checked_path(str(target))[0], target.resolve())
            self.assertEqual(lookup.checked_path('план & отчёт.md')[0], target.resolve())
            for path in [r'..\outside', r'C:relative.md', str(target) + ':stream']:
                with self.assertRaises((ValueError, OSError)):
                    lookup.checked_path(path)

    def test_full_path_matching_and_ambiguity(self):
        db = sqlite3.connect(':memory:')
        self.addCleanup(db.close)
        db.executescript('CREATE TABLE items(stable_id INTEGER,id TEXT,is_folder INTEGER,local_title TEXT,trashed INTEGER DEFAULT 0,is_tombstone INTEGER DEFAULT 0); CREATE TABLE stable_parents(item_stable_id INTEGER,parent_stable_id INTEGER);')
        for row in [(1, lookup.DRIVE_ROOT_ID, 1, 'vault'), (2,'projects',1,'Projects'), (3,'archive',1,'Archive'), (4,'current-demo',1,'Demo'), (5,'archived-demo',1,'Demo'), (6,'file',0,'тест.md')]:
            db.execute('INSERT INTO items(stable_id,id,is_folder,local_title) VALUES(?,?,?,?)',row)
        db.executemany('INSERT INTO stable_parents VALUES(?,?)',[(2,1),(3,1),(4,2),(5,3),(6,4)])
        self.assertIn('current-demo',lookup.drive_match(db,Path('Projects/Demo'))[0])
        self.assertIn('archived-demo',lookup.drive_match(db,Path('Archive/Demo'))[0])
        self.assertEqual(lookup.drive_match(db,Path('Projects/absent.md')),(None,'pending'))
        db.execute("INSERT INTO items(stable_id,id,is_folder,local_title) VALUES(7,'second',0,'тест.md')")
        db.execute('INSERT INTO stable_parents VALUES(7,4)')
        self.assertEqual(lookup.drive_match(db,Path('Projects/Demo/тест.md')),(None,'ambiguous'))
        self.assertEqual(lookup.drive_match(None,Path('test')),(None,'unavailable'))

if __name__ == '__main__':
    unittest.main()
