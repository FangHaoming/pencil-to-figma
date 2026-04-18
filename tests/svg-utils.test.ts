import assert from 'node:assert/strict';
import test from 'node:test';

import {
  convertSvgPathToFigma,
  tokenizeSvgPath
} from '../src/plugin/utils/svg.ts';

test('tokenizeSvgPath parses commands, decimals and exponents', () => {
  const tokens = tokenizeSvgPath('M10.5,-20.25 L3e1 4.2e-1 z');

  assert.deepEqual(tokens, ['M', 10.5, -20.25, 'L', 30, 0.42, 'z']);
});

test('tokenizeSvgPath handles command-adjacent decimals from real bug cases', () => {
  const tokens = tokenizeSvgPath('M9.187 0l-2.81 6.376');

  assert.deepEqual(tokens, ['M', 9.187, 0, 'l', -2.81, 6.376]);
});

test('convertSvgPathToFigma converts relative line commands to absolute segments', () => {
  const result = convertSvgPathToFigma('M10 10 l5 0 l0 5 z');

  assert.equal(result, 'M 10 10 L 15 10 L 15 15 Z');
});

test('convertSvgPathToFigma converts horizontal, vertical and arc commands', () => {
  const result = convertSvgPathToFigma('M0 0 H10 V5 A 5 5 0 0 1 20 10');

  assert.equal(result, 'M 0 0 L 10 0 L 10 5 L 20 10');
});

test('convertSvgPathToFigma returns null for invalid path data', () => {
  assert.equal(convertSvgPathToFigma(undefined), null);
  assert.equal(convertSvgPathToFigma('L 10 10'), null);
});
