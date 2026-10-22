import { test, expect } from 'vitest';
import { fileType } from './file-icons';

test('classification uses the actual extension, including mixed case and extensionless names', () => {
  expect(fileType('report.PdF').kind).toBe('pdf');
  expect(fileType('data.csv').kind).toBe('spreadsheet');
  expect(fileType('photo.heic').kind).toBe('image');
  expect(fileType('index.html').kind).toBe('code');
  expect(fileType('movie.mkv').kind).toBe('video');
  expect(fileType('report.pdf.backup').kind).toBe('unknown');
  expect(fileType('README').kind).toBe('unknown');
  expect(fileType('.gitignore').kind).toBe('unknown');
});
