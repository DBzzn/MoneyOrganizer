import { inflateSync } from 'zlib';

interface PdfObject {
  id: number;
  body: string;
}

interface PdfTextChunk {
  page: number;
  x: number;
  y: number;
  text: string;
}

export interface PdfTextRow {
  page: number;
  y: number;
  line: number;
  text: string;
  elements: Array<{
    x: number;
    text: string;
  }>;
}

function parsePdfObjects(pdfText: string): PdfObject[] {
  const objects: PdfObject[] = [];
  const objectRegex = /(?:^|\n)(\d+)\s+\d+\s+obj\s*([\s\S]*?)\s*endobj/g;
  let match: RegExpExecArray | null;

  while ((match = objectRegex.exec(pdfText))) {
    objects.push({
      id: Number(match[1]),
      body: match[2],
    });
  }

  return objects;
}

function decodeStream(body: string): string | null {
  const streamMatch = body.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);

  if (!streamMatch) {
    return null;
  }

  const raw = Buffer.from(streamMatch[1], 'latin1');

  if (body.includes('/FlateDecode')) {
    return inflateSync(raw).toString('latin1');
  }

  return raw.toString('latin1');
}

function parseCmap(cmapText: string): Map<number, string> {
  const cmap = new Map<number, string>();
  const rangeRegex = /<([0-9A-Fa-f]{4})>\s+<([0-9A-Fa-f]{4})>\s+<([0-9A-Fa-f]{4})>/g;
  let rangeMatch: RegExpExecArray | null;

  while ((rangeMatch = rangeRegex.exec(cmapText))) {
    const from = parseInt(rangeMatch[1], 16);
    const to = parseInt(rangeMatch[2], 16);
    const destination = parseInt(rangeMatch[3], 16);

    for (let code = from; code <= to; code += 1) {
      cmap.set(code, String.fromCodePoint(destination + code - from));
    }
  }

  const charRegex = /<([0-9A-Fa-f]{4})>\s+<([0-9A-Fa-f]{4})>/g;
  let charMatch: RegExpExecArray | null;

  while ((charMatch = charRegex.exec(cmapText))) {
    const code = parseInt(charMatch[1], 16);

    if (!cmap.has(code)) {
      cmap.set(code, String.fromCodePoint(parseInt(charMatch[2], 16)));
    }
  }

  return cmap;
}

function unescapePdfString(value: string): string {
  return value.replace(/\\([0-7]{1,3}|[nrtbf()\\])/g, (_, escaped: string) => {
    if (/^[0-7]+$/.test(escaped)) {
      return String.fromCharCode(parseInt(escaped, 8));
    }

    const replacements: Record<string, string> = {
      n: '\n',
      r: '\r',
      t: '\t',
      b: '\b',
      f: '\f',
      '(': '(',
      ')': ')',
      '\\': '\\',
    };

    return replacements[escaped] ?? escaped;
  });
}

function decodeTextToken(token: string, cmap?: Map<number, string>): string {
  const bytes = token.startsWith('<')
    ? Buffer.from(token.slice(1, -1).replace(/\s+/g, ''), 'hex')
    : Buffer.from(unescapePdfString(token.slice(1, -1)), 'latin1');
  let text = '';

  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const code = bytes.readUInt16BE(index);
    text += cmap?.get(code) ?? String.fromCodePoint(code);
  }

  return text;
}

function parseResourceFontMap(
  resourcesBody: string,
  objectsById: Map<number, string>,
): Map<string, number> {
  const fontMap = new Map<string, number>();
  const fontDictionaryId = Number(
    resourcesBody.match(/\/Font\s+(\d+)\s+0\s+R/)?.[1],
  );

  if (!fontDictionaryId) {
    return fontMap;
  }

  const fontDictionary = objectsById.get(fontDictionaryId) ?? '';
  const fontRegex = /\/(F\d+)\s+(\d+)\s+0\s+R/g;
  let fontMatch: RegExpExecArray | null;

  while ((fontMatch = fontRegex.exec(fontDictionary))) {
    const fontBody = objectsById.get(Number(fontMatch[2])) ?? '';
    const toUnicodeId = Number(
      fontBody.match(/\/ToUnicode\s+(\d+)\s+0\s+R/)?.[1],
    );

    if (toUnicodeId) {
      fontMap.set(fontMatch[1], toUnicodeId);
    }
  }

  return fontMap;
}

function groupChunksIntoRows(chunks: PdfTextChunk[]): PdfTextRow[] {
  const rows: PdfTextRow[] = [];
  const yTolerance = 2.4;

  for (const chunk of chunks) {
    const row = rows.find(
      (entry) =>
        entry.page === chunk.page && Math.abs(entry.y - chunk.y) <= yTolerance,
    );

    if (row) {
      row.elements.push({ x: chunk.x, text: chunk.text });
      row.y = Math.max(row.y, chunk.y);
    } else {
      rows.push({
        page: chunk.page,
        y: chunk.y,
        line: 0,
        text: '',
        elements: [{ x: chunk.x, text: chunk.text }],
      });
    }
  }

  rows.sort((left, right) => left.page - right.page || right.y - left.y);

  return rows.map((row, index) => {
    const elements = row.elements.sort((left, right) => left.x - right.x);

    return {
      ...row,
      line: index + 1,
      text: elements.map((element) => element.text).join(' ').replace(/\s+/g, ' ').trim(),
      elements,
    };
  });
}

export class PdfTextExtractor {
  extractRows(buffer: Buffer): PdfTextRow[] {
    const pdfText = buffer.toString('latin1');
    const objects = parsePdfObjects(pdfText);
    const objectsById = new Map(objects.map((object) => [object.id, object.body]));
    const decodedStreams = new Map<number, string | null>();

    const getDecodedStream = (objectId: number) => {
      if (!decodedStreams.has(objectId)) {
        decodedStreams.set(
          objectId,
          decodeStream(objectsById.get(objectId) ?? ''),
        );
      }

      return decodedStreams.get(objectId) ?? null;
    };

    const cmaps = new Map<number, Map<number, string>>();

    for (const object of objects) {
      const decoded = getDecodedStream(object.id);

      if (decoded?.includes('begincmap')) {
        cmaps.set(object.id, parseCmap(decoded));
      }
    }

    const pages = objects.filter((object) => /\/Type\s+\/Page\b/.test(object.body));
    const chunks: PdfTextChunk[] = [];

    pages.forEach((page, pageIndex) => {
      const contentId = Number(page.body.match(/\/Contents\s+(\d+)\s+0\s+R/)?.[1]);
      const resourcesId = Number(page.body.match(/\/Resources\s+(\d+)\s+0\s+R/)?.[1]);

      if (!contentId || !resourcesId) {
        return;
      }

      const content = getDecodedStream(contentId);
      const fontMap = parseResourceFontMap(
        objectsById.get(resourcesId) ?? '',
        objectsById,
      );

      if (!content) {
        return;
      }

      let currentFont: string | null = null;
      let x = 0;
      let y = 0;
      const tokenRegex =
        /\/(F\d+)\s+[\d.]+\s+Tf|[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s+Tm|(\((?:\\.|[^\\)])*\)|<[^>]+>)\s*Tj/g;
      let tokenMatch: RegExpExecArray | null;

      while ((tokenMatch = tokenRegex.exec(content))) {
        if (tokenMatch[1]) {
          currentFont = tokenMatch[1];
          continue;
        }

        if (tokenMatch[2] && tokenMatch[3]) {
          x = Number(tokenMatch[2]);
          y = Number(tokenMatch[3]);
          continue;
        }

        if (tokenMatch[4]) {
          const cmapId = currentFont ? fontMap.get(currentFont) : undefined;
          const text = decodeTextToken(
            tokenMatch[4],
            cmapId ? cmaps.get(cmapId) : undefined,
          ).trim();

          if (text) {
            chunks.push({
              page: pageIndex + 1,
              x,
              y,
              text,
            });
          }
        }
      }
    });

    return groupChunksIntoRows(chunks);
  }
}
