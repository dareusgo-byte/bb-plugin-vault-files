import type { ReactNode } from 'react';

// Original artwork. One folded-page silhouette and semantic glyphs on a 48 × 60 grid.
export const fileKinds = {
  markdown: { extensions: 'MD MARKDOWN', fill: '#facc15', ink: '#422006', label: 'MD' },
  document: { extensions: 'DOC DOCX ODT RTF PAGES', fill: '#2563eb', ink: '#ffffff', label: 'DOC' },
  spreadsheet: { extensions: 'XLS XLSX XLSM XLSB CSV TSV ODS NUMBERS', fill: '#15803d', ink: '#ffffff', label: 'XLS' },
  pdf: { extensions: 'PDF', fill: '#dc2626', ink: '#ffffff', label: 'PDF' },
  presentation: { extensions: 'PPT PPTX PPS PPSX POT POTX ODP KEY', fill: '#ea580c', ink: '#ffffff', label: 'PPT' },
  image: { extensions: 'JPG JPEG PNG GIF WEBP BMP TIF TIFF SVG ICO HEIC HEIF AVIF JXL DNG RAW PSD AI EPS', fill: '#7dd3fc', ink: '#0c4a6e', label: 'IMG' },
  video: { extensions: 'MP4 MOV M4V AVI MKV WEBM MPEG MPG OGV WMV FLV 3GP MTS M2TS VOB MXF', fill: '#c4b5fd', ink: '#4c1d95', label: 'VID' },
  code: { extensions: 'HTML HTM CSS SCSS SASS LESS JS JSX MJS CJS TS TSX JSON JSONC YAML YML TOML XML XSL XSLT SQL PY PYI IPYNB SH BASH ZSH FISH PS1 BAT CMD C H CPP HPP CC CS JAVA KT KTS SWIFT M MM GO RS RB PHP R LUA PL DART VUE SVELTE ASTRO GRAPHQL GQL WASM WAT INI CONF CONFIG', fill: '#00b8ff', ink: '#002d47', label: '</>' },
  unknown: { extensions: '', fill: '#d1d5db', ink: '#374151', label: 'FILE' },
};
export type FileKind = keyof typeof fileKinds;
export function fileType(name: string): { kind: FileKind; extension: string } {
  const dot = name.lastIndexOf('.');
  const extension = dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toUpperCase() : '';
  const kind = (Object.keys(fileKinds) as FileKind[]).find(key => fileKinds[key].extensions.split(' ').includes(extension) && extension) || 'unknown';
  return { kind, extension };
}
const glyphs: Record<FileKind, ReactNode> = {
  markdown: <path d="M11 33V23l5 6 5-6v10m7-10v10m-4-4 4 4 4-4" />,
  document: <path d="M12 24h20M12 29h20M12 34h13" />,
  spreadsheet: <><rect x="11" y="22" width="24" height="15" rx="2"/><path d="M19 22v15M27 22v15M11 27h24M11 32h24"/></>,
  pdf: <path d="M12 24h22M12 30h9M12 36h6m9-7h7v12l-3.5-2-3.5 2Z" />,
  presentation: <><rect x="11" y="22" width="24" height="14" rx="2"/><path d="M23 36v4m-5 0h10M16 32v-3m6 3v-6m6 6v-8"/></>,
  image: <><rect x="11" y="22" width="24" height="17" rx="2"/><circle cx="28" cy="27" r="2"/><path d="m12 36 7-7 7 8 4-4 4 4"/></>,
  video: <><rect x="10" y="22" width="26" height="17" rx="3"/><path d="m21 27 7 4-7 4Z"/><path d="M14 23v15m18-15v15" opacity=".5"/></>,
  code: <path d="m17 25-6 6 6 6m13-12 6 6-6 6m-4-14-5 16" />,
  unknown: <><path d="M13 25h18M13 31h18M13 37h10" opacity=".65"/></>,
};
export function FileTypeIcon({ name, isDirectory = false }: { name: string; isDirectory?: boolean }) {
  const { kind, extension } = fileType(name);
  const { fill, ink, label } = fileKinds[kind];
  if (isDirectory) return <svg className="vf-file-icon" viewBox="0 0 48 60" aria-hidden="true"><path d="M4 17a4 4 0 0 1 4-4h10l5 5h17a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" fill="#eab308"/><path d="M4 25a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v21a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" fill="#facc15"/><path d="M12 29h15" stroke="#854d0e" strokeWidth="2" strokeLinecap="round" opacity=".5"/></svg>;
  const text = extension && /^[A-Z0-9]{1,4}$/.test(extension) ? extension : label;
  return <svg className="vf-file-icon" data-kind={kind} viewBox="0 0 48 60" aria-hidden="true">
    <path d="M10 2h20l14 14v36a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6Z" fill={fill}/>
    <path d="M30 2v10a4 4 0 0 0 4 4h10Z" fill={ink} opacity=".18"/>
    <g fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{glyphs[kind]}</g>
    <text x="24" y="50" textAnchor="middle" fill={ink} fontFamily="system-ui,sans-serif" fontSize={text.length > 3 ? '8' : '9'} fontWeight="750" letterSpacing=".5">{text}</text>
  </svg>;
}
