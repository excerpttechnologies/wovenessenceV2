/* Ecommerce group + filter configuration tests.

   Run with: node --test __tests__/ecommerce-filter-config.test.js

   Covers the pure helpers that turn a `producttypes` document into the
   storefront group/filter configuration: slugs, normalisation, legacy
   `filters` arrays, ordering and visibility. */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import {
  slugify,
  normalizeGroupConfig,
  normalizeFilterConfig,
  resolveGroupFilters,
  storefrontFilters,
  groupVisibleOnStorefront,
} from '../lib/ecommerceFilterConfig.js';

describe('slugify', () => {
  it('builds a URL-safe slug from a display name', () => {
    assert.strictEqual(slugify('Plain  Fabrics & More'), 'plain-fabrics-more');
    assert.strictEqual(slugify('  Ready Made  '), 'ready-made');
  });
});

describe('normalizeGroupConfig', () => {
  it('falls back to the ERP label and a slug when nothing is stored yet', () => {
    const config = normalizeGroupConfig({}, { label: 'Sarees', value: 'SAREES' });
    assert.strictEqual(config.displayName, 'Sarees');
    assert.strictEqual(config.ecommerceSlug, 'sarees');
    assert.strictEqual(config.ecommerceVisible, true);
  });

  it('keeps the configured slug, description and visibility', () => {
    const config = normalizeGroupConfig({
      displayName: 'Kanchipuram Sarees',
      ecommerceSlug: 'kanchipuram-sarees',
      description: 'Handwoven',
      ecommerceVisible: false,
    }, { label: 'SAREES' });
    assert.deepStrictEqual(config, {
      displayName: 'Kanchipuram Sarees',
      ecommerceSlug: 'kanchipuram-sarees',
      description: 'Handwoven',
      ecommerceVisible: false,
    });
  });
});

describe('normalizeFilterConfig', () => {
  it('drops filter keys the ERP does not support', () => {
    const config = normalizeFilterConfig([
      { key: 'byFabric' },
      { key: 'byMotif' },
      { key: 'byWeave' },
    ]);
    assert.deepStrictEqual(config.map((entry) => entry.key), ['byFabric', 'byWeave']);
  });

  it('defaults active, visible, filterable and multiple selection', () => {
    const [entry] = normalizeFilterConfig([{ key: 'byColour' }]);
    assert.strictEqual(entry.isActive, true);
    assert.strictEqual(entry.isVisible, true);
    assert.strictEqual(entry.isFilterable, true);
    assert.strictEqual(entry.selectionMode, 'multiple');
    assert.strictEqual(entry.field, 'byColour');
  });

  it('accepts the keyed map shape used by the admin page', () => {
    const config = normalizeFilterConfig({
      byFabric: { displayLabel: 'Fabric', displayOrder: 1, isFilterable: false },
      byWeave: { displayLabel: 'Weave', displayOrder: 0 },
    });
    assert.deepStrictEqual(config.map((entry) => entry.key), ['byFabric', 'byWeave']);
    assert.strictEqual(config[0].displayLabel, 'Fabric');
    assert.strictEqual(config[0].isFilterable, false);
  });
});

describe('resolveGroupFilters', () => {
  it('reads legacy filters arrays with default configuration', () => {
    const filters = resolveGroupFilters({ filters: ['byWeave', 'byFabric'] });
    assert.deepStrictEqual(filters.map((entry) => entry.key), ['byWeave', 'byFabric']);
    assert.strictEqual(filters[0].isActive, true);
    assert.strictEqual(filters[0].selectionMode, 'multiple');
  });

  it('sorts filters by displayOrder regardless of storage order', () => {
    const filters = resolveGroupFilters({
      filterConfig: [
        { key: 'byColour', displayOrder: 2 },
        { key: 'byFabric', displayOrder: 0 },
        { key: 'byWeave', displayOrder: 1 },
      ],
    });
    assert.deepStrictEqual(filters.map((entry) => entry.key), ['byFabric', 'byWeave', 'byColour']);
  });
});

describe('storefrontFilters', () => {
  it('hides inactive filters from the storefront', () => {
    const filters = storefrontFilters({
      filters: ['byFabric'],
      filterConfig: [{ key: 'byFabric', isActive: false, isVisible: true, isFilterable: true }],
    });
    assert.deepStrictEqual(filters, []);
  });

  it('requires the filter to be filterable', () => {
    const filters = storefrontFilters({
      filters: ['byFabric', 'byWeave'],
      filterConfig: [
        { key: 'byFabric', isFilterable: false },
        { key: 'byWeave', isFilterable: true },
      ],
    });
    assert.deepStrictEqual(filters.map((entry) => entry.key), ['byWeave']);
  });
});

describe('groupVisibleOnStorefront', () => {
  it('requires an active and ecommerce-visible group', () => {
    assert.strictEqual(groupVisibleOnStorefront({ isActive: true, ecommerceVisible: true }), true);
    assert.strictEqual(groupVisibleOnStorefront({ isActive: false, ecommerceVisible: true }), false);
    assert.strictEqual(groupVisibleOnStorefront({ isActive: true, ecommerceVisible: false }), false);
  });
});
