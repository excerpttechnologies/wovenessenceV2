/* Product Classification Constants
   
   Shared constants for product classification system.
   Can be imported by both client and server components. */

// Valid classification types
export const CLASSIFICATION_TYPES = {
  BY_WEAVE: 'byWeave',
  BY_FABRIC: 'byFabric',
  BY_CRAFT: 'byCraft',
  BY_OCCASION: 'byOccasion',
  BY_COLOUR: 'byColour',
};

// Human-readable labels for classification types
export const CLASSIFICATION_TYPE_LABELS = {
  [CLASSIFICATION_TYPES.BY_WEAVE]: 'By Weave',
  [CLASSIFICATION_TYPES.BY_FABRIC]: 'By Fabric',
  [CLASSIFICATION_TYPES.BY_CRAFT]: 'By Craft',
  [CLASSIFICATION_TYPES.BY_OCCASION]: 'By Occasion',
  [CLASSIFICATION_TYPES.BY_COLOUR]: 'By Colour',
};

// Product type to applicable classification types mapping
export const PRODUCT_TYPE_CLASSIFICATIONS = {
  SAREES: [
    CLASSIFICATION_TYPES.BY_WEAVE,
    CLASSIFICATION_TYPES.BY_FABRIC,
    CLASSIFICATION_TYPES.BY_CRAFT,
    CLASSIFICATION_TYPES.BY_OCCASION,
  ],
  FABRICS: [
    CLASSIFICATION_TYPES.BY_FABRIC,
    CLASSIFICATION_TYPES.BY_COLOUR,
  ],
  'PLAIN FABRICS': [
    CLASSIFICATION_TYPES.BY_FABRIC,
    CLASSIFICATION_TYPES.BY_COLOUR,
  ],
  DUPATTA: [
    CLASSIFICATION_TYPES.BY_FABRIC,
    CLASSIFICATION_TYPES.BY_COLOUR,
  ],
};

// Product type options for dropdowns
export const PRODUCT_TYPES = [
  { value: '', label: 'Not Specified' },
  { value: 'SAREES', label: 'Sarees' },
  { value: 'FABRICS', label: 'Fabrics' },
  { value: 'PLAIN FABRICS', label: 'Plain Fabrics' },
  { value: 'DUPATTA', label: 'Dupatta' },
  { value: 'OTHER', label: 'Other' },
];

export const LABEL_FIELD = 'name';
