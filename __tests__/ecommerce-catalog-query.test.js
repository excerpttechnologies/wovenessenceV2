/* Storefront catalog query tests.

   Run with: node --test __tests__/ecommerce-catalog-query.test.js

   Covers the three documented filter parameter forms, their combination,
   group validation (availability, ObjectId, single selection) and the
   Mongo match built from the selections. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  parseFilterSelections,
  selectionError,
  buildSelectionMatch,
} from '../lib/ecommerceFilterConfig.js';

const A = '6712a3b4c5d6e7f8091a2b3c';
const B = '6712a3b4c5d6e7f8091a2b3d';
const C = '6712a3b4c5d6e7f8091a2b3e';

const filters = [
  { key: 'byFabric', label: 'Fabric', displayLabel: 'Fabric', selectionMode: 'multiple' },
  { key: 'byWeave', label: 'Weave', displayLabel: 'Weave', selectionMode: 'single' },
];

describe('parseFilterSelections', () => {
  it('reads the repeatable filter form', () => {
    const params = new URLSearchParams(`filter=byFabric:${A},${B}&filter=byWeave:${C}`);
    const { selections, errors } = parseFilterSelections(params);
    assert.deepStrictEqual(errors, []);
    assert.deepStrictEqual(selections, { byFabric: [A, B], byWeave: [C] });
  });

  it('reads the filters shorthand form', () => {
    const params = new URLSearchParams(`filters=byFabric:${A}|${B};byWeave:${C}`);
    const { selections } = parseFilterSelections(params);
    assert.deepStrictEqual(selections, { byFabric: [A, B], byWeave: [C] });
  });

  it('reads plain classification query params', () => {
    const params = new URLSearchParams(`byFabric=${A},${B}`);
    const { selections } = parseFilterSelections(params);
    assert.deepStrictEqual(selections, { byFabric: [A, B] });
  });

  it('merges and de-duplicates every parameter form', () => {
    const params = new URLSearchParams(
      `filter=byFabric:${A}&filters=byFabric:${A}|${B}&byFabric=${B},${C}`,
    );
    const { selections } = parseFilterSelections(params);
    assert.deepStrictEqual(selections, { byFabric: [B, C, A] });
  });

  it('rejects a filter key the ERP does not support', () => {
    const params = new URLSearchParams(`filter=byMotif:${A}`);
    const { errors } = parseFilterSelections(params);
    assert.deepStrictEqual(errors, ['Filter "byMotif" is not available for this group.']);
  });

  it('rejects a malformed filter entry', () => {
    const params = new URLSearchParams(`filter=${A}`);
    const { errors } = parseFilterSelections(params);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /filter=byFabric/);
  });
});

describe('selectionError', () => {
  it('rejects a filter that is not configured for the group', () => {
    const error = selectionError({ byOccasion: [A] }, filters);
    assert.strictEqual(error, 'Filter "byOccasion" is not available for this group.');
  });

  it('rejects more than one value when the filter is single-select', () => {
    const error = selectionError({ byWeave: [A, B] }, filters);
    assert.strictEqual(error, 'Filter "Weave" accepts only one value.');
  });
});

describe('buildSelectionMatch', () => {
  it('builds an $in per filter so values are OR-ed and filters AND-ed', () => {
    const match = buildSelectionMatch({ byFabric: [A, B], byWeave: [C] });
    assert.deepStrictEqual(Object.keys(match).sort(), ['byFabric', 'byWeave']);
    assert.strictEqual(match.byFabric.$in.length, 2);
    assert.strictEqual(match.byWeave.$in.length, 1);
    assert.strictEqual(String(match.byFabric.$in[0]), A);
  });
});
