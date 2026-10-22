import { createHash } from 'node:crypto';
import { z } from 'zod';

export const uploadReceiptSchema = z.object({
  path: z.string().max(4096), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  driveUrl: z.string().max(2048), account: z.email().max(320),
}).strict();
export function canonicalDriveUrl(value: string, account: string) {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Нужна точная ссылка из результата загрузки Google Drive.'); }
  const match = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)\/view\/?$/);
  if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.username || url.password || url.port || !match) throw new Error('Нужна ссылка https://drive.google.com/file/d/ID/view на загруженный исходный файл.');
  return `https://drive.google.com/file/d/${match[1]}/view?authuser=${encodeURIComponent(account)}`;
}
export function uploadKey(hostId: string, root: string, path: string) {
  return 'upload:' + createHash('sha256').update(JSON.stringify([hostId, root, path])).digest('hex');
}
export type UploadRecord = { driveUrl: string; account: string; sha256: string; modifiedAt: string; size: number };
export const UPLOAD_INSTRUCTIONS = 'При каждом основном результате сначала вызови vault_file_link. Если uploadRequired=true, используй подключённый Google Drive и загрузи точный исходный файл без конвертации в аккаунт expectedAccount (если указан); существующую копию из existingDriveUrl обнови через update_file, новую создай через upload_file. Не меняй доступ и не делай файл публичным. После успешного ответа Google передай точные path, sha256, driveUrl и account в vault_file_uploaded и покажи только возвращённую карточку. sha256 бери из плана, не придумывай. При ошибке или отсутствии инструмента Google Drive сообщи об этом и покажи localFallbackDirective, не утверждай, что файл загружен. Режим ask требует выбора в настройках Vault Files, а never запрещает создавать облачные копии. Просмотр карточки и список файлов сами ничего не загружают.';
