import assert from 'node:assert/strict';
import test from 'node:test';

import {
  base64ToUint8Array,
  detectImageMimeType,
  exportNodeToPngAsset,
  getImageDataFromCache,
  getImageFillSpec,
  makePostMessageSafe,
  mimeTypeToExtension,
  normalizeImagePath,
  sanitizeFileNamePart,
  shouldRasterizeNodeForImageTransform,
  uint8ArrayToBase64
} from '../src/plugin/utils/image.ts';
import type { ExportContext } from '../src/plugin/export/types.ts';

test('normalizeImagePath normalizes separators and leading markers', () => {
  assert.equal(normalizeImagePath('.\\assets\\hero.png'), 'assets/hero.png');
  assert.equal(normalizeImagePath('/images/icon.png'), 'images/icon.png');
});

test('getImageDataFromCache resolves normalized path, file name and data urls', () => {
  const cache = new Map<string, string>([
    ['assets/hero.png', 'normalized'],
    ['icon.png', 'filename']
  ]);

  assert.equal(getImageDataFromCache(cache, './assets/hero.png'), 'normalized');
  assert.equal(getImageDataFromCache(cache, '/foo/bar/icon.png'), 'filename');
  assert.equal(getImageDataFromCache(cache, 'data:image/png;base64,abc'), 'data:image/png;base64,abc');
  assert.equal(getImageDataFromCache(cache, 'missing.png'), null);
});

test('getImageFillSpec returns first image fill from arrays', () => {
  const result = getImageFillSpec([
    { type: 'color', color: '#ff0000' },
    { type: 'image', url: './hero.png', mode: 'fit' }
  ]);

  assert.deepEqual(result, {
    type: 'image',
    url: './hero.png',
    mode: 'fit'
  });
});

test('base64 helpers round-trip binary payloads', () => {
  const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
  const encoded = uint8ArrayToBase64(bytes);
  const decoded = base64ToUint8Array(encoded);

  assert.deepEqual(Array.from(decoded), Array.from(bytes));
});

test('detectImageMimeType and mimeTypeToExtension map common formats', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

  assert.equal(detectImageMimeType(png), 'image/png');
  assert.equal(detectImageMimeType(jpg), 'image/jpeg');
  assert.equal(detectImageMimeType(webp), 'image/webp');
  assert.equal(detectImageMimeType(svg), 'image/svg+xml');
  assert.equal(mimeTypeToExtension('image/jpeg'), 'jpg');
  assert.equal(mimeTypeToExtension('image/svg+xml'), 'svg');
  assert.equal(mimeTypeToExtension('image/webp'), 'webp');
  assert.equal(mimeTypeToExtension('image/unknown'), 'png');
});

test('sanitizeFileNamePart and makePostMessageSafe normalize unsafe values', () => {
  assert.equal(sanitizeFileNamePart(' Hero / Banner @2x '), 'Hero-Banner-2x');

  const safe = makePostMessageSafe({
    ok: true,
    infinite: Number.POSITIVE_INFINITY,
    skip: undefined,
    nested: [1, undefined, () => 'x', { label: 'done', bad: Symbol('x') }]
  });

  assert.deepEqual(safe, {
    ok: true,
    infinite: null,
    nested: [1, { label: 'done' }]
  });
});

test('exportNodeToPngAsset caches exported assets', async () => {
  let exportCalls = 0;
  const node = {
    id: 'node:1',
    name: 'Hero Section',
    type: 'FRAME',
    exportAsync: async () => {
      exportCalls += 1;
      return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
  };

  const exportContext: ExportContext = {
    assets: new Map(),
    inferredCornerRadiusByNodeId: new Map()
  };

  const first = await exportNodeToPngAsset(node as unknown as SceneNode & ExportMixin, exportContext);
  const second = await exportNodeToPngAsset(node as unknown as SceneNode & ExportMixin, exportContext);

  assert.ok(first);
  assert.equal(second, first);
  assert.equal(exportCalls, 1);
  assert.equal(first.fileName, 'Hero-Section-node-1.png');
  assert.match(first.dataUrl, /^data:image\/png;base64,/);
});

test('shouldRasterizeNodeForImageTransform rasterizes locked groups only when exportable', () => {
  const lockedGroup = {
    id: 'group:1',
    type: 'GROUP',
    name: 'Locked Group',
    locked: true,
    children: [],
    exportAsync: async () => new Uint8Array()
  };
  const nonExportableLockedGroup = {
    id: 'group:2',
    type: 'GROUP',
    name: 'Locked Group',
    locked: true,
    children: []
  };

  assert.equal(shouldRasterizeNodeForImageTransform(lockedGroup as unknown as SceneNode), true);
  assert.equal(shouldRasterizeNodeForImageTransform(nonExportableLockedGroup as unknown as SceneNode), false);
});
