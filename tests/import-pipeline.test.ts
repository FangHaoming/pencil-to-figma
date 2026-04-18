import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzePenFile,
  convertPenToFigmaFormat
} from '../src/plugin/import/pipeline.ts';
import type { PenDocument } from '../src/shared/pen.ts';

test('analyzePenFile counts elements, instances, images and auto-layout frames', () => {
  const penData: PenDocument = {
    version: '2.7',
    variables: {
      colorPrimary: '#3366ff'
    },
    children: [
      {
        type: 'frame',
        name: 'Card',
        layout: 'horizontal',
        reusable: true,
        children: [
          {
            type: 'text',
            content: 'Title'
          },
          {
            type: 'frame',
            name: 'Image Holder',
            fill: {
              type: 'image',
              url: './hero.png',
              mode: 'fill'
            }
          },
          {
            type: 'ref',
            ref: 'card-component'
          }
        ]
      }
    ]
  };

  const analysis = analyzePenFile(penData);

  assert.equal(analysis.totalElements, 4);
  assert.equal(analysis.components, 1);
  assert.equal(analysis.instances, 1);
  assert.equal(analysis.images, 1);
  assert.equal(analysis.textNodes, 1);
  assert.equal(analysis.autoLayoutFrames, 1);
  assert.equal(analysis.variables, 1);
});

test('convertPenToFigmaFormat normalizes frame layout defaults and dimensions', () => {
  const penData: PenDocument = {
    version: '2.7',
    children: [
      {
        type: 'frame',
        name: 'Toolbar',
        justifyContent: 'center',
        gap: 12,
        children: [
          {
            type: 'text',
            content: 'Action',
            fontWeight: 600
          }
        ]
      }
    ]
  };

  const converted = convertPenToFigmaFormat(penData);
  const frame = converted.children[0];
  const text = frame?.children?.[0];

  assert.equal(frame?.layout, 'horizontal');
  assert.equal(frame?.justifyContent, 'center');
  assert.equal(frame?.alignItems, 'start');
  assert.equal(frame?.width, 'hug_contents');
  assert.equal(frame?.height, 'hug_contents');
  assert.equal(text?.fontWeight, '600');
});

test('convertPenToFigmaFormat normalizes padding and stroke thickness objects', () => {
  const penData: PenDocument = {
    version: '2.7',
    children: [
      {
        type: 'frame',
        name: 'Container',
        layout: 'vertical',
        padding: 16,
        stroke: {
          thickness: {
            top: 1,
            right: 4,
            bottom: 2,
            left: 3
          },
          fill: '#000000'
        }
      }
    ]
  };

  const converted = convertPenToFigmaFormat(penData);
  const frame = converted.children[0];

  assert.deepEqual(frame?.padding, [16]);
  assert.equal(frame?.stroke?.thickness, 4);
});
