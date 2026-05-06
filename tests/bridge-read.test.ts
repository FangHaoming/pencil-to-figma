import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { downloadNodeImage } from '../src/plugin/bridge-read.ts';

const originalFigmaDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'figma');

function setMockFigma(node: unknown): void {
  Object.defineProperty(globalThis, 'figma', {
    value: {
      fileKey: 'file-key',
      getNodeById: () => node
    },
    configurable: true
  });
}

after(() => {
  if (originalFigmaDescriptor) {
    Object.defineProperty(globalThis, 'figma', originalFigmaDescriptor);
    return;
  }

  delete (globalThis as Partial<typeof globalThis>).figma;
});

test('downloadNodeImage exports locked groups as a single node PNG', async () => {
  const lockedGroup = {
    id: 'locked:group',
    type: 'GROUP',
    name: 'Locked Group',
    locked: true,
    children: [
      {
        id: 'child:image',
        type: 'RECTANGLE',
        name: 'Nested Image',
        fills: [{ type: 'IMAGE', visible: true, imageHash: 'nested-image', scaleMode: 'FILL' }]
      }
    ],
    exportAsync: async () => new Uint8Array([1, 2, 3, 4])
  };

  setMockFigma(lockedGroup);

  const result = await downloadNodeImage('locked:group');

  assert.equal(result.source, 'node-export');
  assert.equal(result.nodeId, 'locked:group');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.filename, 'Locked-Group-locked-group.png');
  assert.match(result.data, /^data:image\/png;base64,/);
});
