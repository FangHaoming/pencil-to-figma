import assert from 'node:assert/strict';
import test from 'node:test';

import { parseFigmaSelectionLink } from '../src/shared/figma-link.ts';

test('parseFigmaSelectionLink parses figma design selection link', () => {
  const result = parseFigmaSelectionLink(
    'https://www.figma.com/design/abc123/Test-File?node-id=12-34&t=xyz'
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.fileKey, 'abc123');
  assert.equal(result.value.nodeId, '12:34');
  assert.equal(result.value.originalNodeId, '12-34');
});

test('parseFigmaSelectionLink parses file selection link and page id', () => {
  const result = parseFigmaSelectionLink(
    'https://www.figma.com/file/fileKey123/File?node-id=1-2&page-id=9-9'
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.fileKey, 'fileKey123');
  assert.equal(result.value.nodeId, '1:2');
  assert.equal(result.value.pageId, '9:9');
});

test('parseFigmaSelectionLink parses branch links using branch key as file key', () => {
  const result = parseFigmaSelectionLink(
    'https://www.figma.com/design/baseKey/branch/branchKey/File?node-id=3-4'
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.fileKey, 'branchKey');
  assert.equal(result.value.nodeId, '3:4');
});

test('parseFigmaSelectionLink rejects non figma urls', () => {
  const result = parseFigmaSelectionLink('https://example.com/design/abc?node-id=1-2');

  assert.deepEqual(result, { ok: false, error: 'Invalid Figma selection link' });
});

test('parseFigmaSelectionLink requires node-id', () => {
  const result = parseFigmaSelectionLink('https://www.figma.com/design/abc123/Test-File');

  assert.deepEqual(result, { ok: false, error: 'Missing node-id in Figma link' });
});
