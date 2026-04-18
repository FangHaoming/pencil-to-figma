import assert from 'node:assert/strict';
import test from 'node:test';

import {
  convertToFigmaGradient,
  extractGradientFallbackColor,
  formatColorForLogging,
  parseColor
} from '../src/plugin/utils/color.ts';

test('extractGradientFallbackColor supports multiple stop property names', () => {
  assert.equal(
    extractGradientFallbackColor({
      gradientStops: [{ position: 0, color: '#ff0000' }]
    }),
    '#ff0000'
  );

  assert.equal(
    extractGradientFallbackColor({
      colors: [{ position: 0, color: '#00ff00' }]
    }),
    '#00ff00'
  );
});

test('extractGradientFallbackColor supports direct stop values', () => {
  assert.equal(
    extractGradientFallbackColor({
      stops: ['#ff0000', '#0000ff']
    }),
    '#ff0000'
  );
});

test('formatColorForLogging truncates long object payloads', () => {
  const message = formatColorForLogging({
    type: 'gradient',
    stops: Array.from({ length: 20 }, (_, index) => ({
      position: index / 19,
      color: '#ff0000'
    }))
  });

  assert.match(message, /\.\.\. \(truncated\)$/);
});

test('formatColorForLogging handles circular references', () => {
  const value: Record<string, unknown> = { type: 'color' };
  value.self = value;

  assert.equal(formatColorForLogging(value), '[object (unstringifiable)]');
});

test('parseColor returns null for disabled gradients', () => {
  const result = parseColor(
    {
      type: 'gradient',
      enabled: false,
      stops: [{ position: 0, color: '#ff0000' }]
    },
    {}
  );

  assert.equal(result, null);
});

test('convertToFigmaGradient converts gradient fills to Figma gradient paint', () => {
  const result = convertToFigmaGradient(
    {
      type: 'gradient',
      gradientType: 'linear',
      rotation: 90,
      stops: [
        { position: 0, color: '#ff0000' },
        { position: 1, color: '#0000ff' }
      ]
    },
    {}
  );

  assert.ok(result);
  assert.equal(result.type, 'GRADIENT_LINEAR');
  assert.equal(result.gradientStops.length, 2);
  assert.equal(result.gradientStops[0]?.position, 0);
  assert.equal(result.gradientStops[1]?.position, 1);
});

test('parseColor returns gradient paint for enabled gradients', () => {
  const result = parseColor(
    {
      type: 'gradient',
      gradientType: 'radial',
      stops: [
        { position: 0, color: '#ff0000' },
        { position: 1, color: '#0000ff' }
      ]
    },
    {}
  );

  assert.ok(result);
  assert.equal(result.type, 'GRADIENT_RADIAL');
});

test('parseColor includes context in invalid object warnings', () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  };

  try {
    const result = parseColor(
      {
        type: 'unknown',
        value: 'bad'
      },
      {},
      'headerBg'
    );

    assert.equal(result, null);
    assert.ok(warnings.some((message) => message.includes("for element 'headerBg'")));
  } finally {
    console.warn = originalWarn;
  }
});

test('parseColor resolves variables before parsing solid colors', () => {
  const result = parseColor('$brand-primary', {
    'brand-primary': '#3366ff'
  });

  assert.deepEqual(result, {
    type: 'SOLID',
    color: {
      r: 0x33 / 255,
      g: 0x66 / 255,
      b: 0xff / 255
    }
  });
});
