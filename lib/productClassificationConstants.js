// /* Product Classification Constants
   
//    Shared constants for product classification system.
//    Can be imported by both client and server components. */

// // Valid classification types
// export const CLASSIFICATION_TYPES = {
//   BY_WEAVE: 'byWeave',
//   BY_FABRIC: 'byFabric',
//   BY_CRAFT: 'byCraft',
//   BY_OCCASION: 'byOccasion',
//   BY_COLOUR: 'byColour',
// };

// // Human-readable labels for classification types
// export const CLASSIFICATION_TYPE_LABELS = {
//   [CLASSIFICATION_TYPES.BY_WEAVE]: 'By Weave',
//   [CLASSIFICATION_TYPES.BY_FABRIC]: 'By Fabric',
//   [CLASSIFICATION_TYPES.BY_CRAFT]: 'By Craft',
//   [CLASSIFICATION_TYPES.BY_OCCASION]: 'By Occasion',
//   [CLASSIFICATION_TYPES.BY_COLOUR]: 'By Colour',
// };

// // Product type to applicable classification types mapping
// export const PRODUCT_TYPE_CLASSIFICATIONS = {
//   SAREES: [
//     CLASSIFICATION_TYPES.BY_WEAVE,
//     CLASSIFICATION_TYPES.BY_FABRIC,
//     CLASSIFICATION_TYPES.BY_CRAFT,
//     CLASSIFICATION_TYPES.BY_OCCASION,
//   ],
//   FABRICS: [
//     CLASSIFICATION_TYPES.BY_FABRIC,
//     CLASSIFICATION_TYPES.BY_COLOUR,
//   ],
//   'PLAIN FABRICS': [
//     CLASSIFICATION_TYPES.BY_FABRIC,
//     CLASSIFICATION_TYPES.BY_COLOUR,
//   ],
//   DUPATTA: [
//     CLASSIFICATION_TYPES.BY_FABRIC,
//     CLASSIFICATION_TYPES.BY_COLOUR,
//   ],
// };

// // Product type options for dropdowns
// export const PRODUCT_TYPES = [
//   { value: '', label: 'Not Specified' },
//   { value: 'SAREES', label: 'Sarees' },
//   { value: 'FABRICS', label: 'Fabrics' },
//   { value: 'PLAIN FABRICS', label: 'Plain Fabrics' },
//   { value: 'DUPATTA', label: 'Dupatta' },
//   { value: 'OTHER', label: 'Other' },
// ];

// export const LABEL_FIELD = 'name';













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

export const DUPATTA_FABRIC_OPTIONS = [
  'Chanderi Dupatta',
  'Gadwal Silk Dupatta',
  'Georgette Dupatta',
  'Kanchipuram Silk Dupatta',
  'Organza Dupatta',
  'Paithani Silk Dupatta',
  'Patola Silk Dupatta',
  'Tussar Silk Dupatta',
];

export const FABRIC_CLASSIFICATION_OPTIONS = {
  byFabric: [
    'Banarasi Silk Fabric',
    'Chanderi Fabric',
    'Cotton Fabric',
    'Georgette Fabric',
    'Kanchipuram Silk Fabric',
    'Linen Fabric',
    'Mysore Silk Fabric',
    'Organza Fabric',
    'Patola Silk Fabric',
    'Paithani Silk Fabric',
    'Tussar Silk Fabric',
  ],
  byColour: [
    'Beige',
    'Black',
    'Gold',
    'Ivory',
    'Lavender',
    'Maroon',
    'Mustard',
    'Orange',
    'Pink',
    'Purple',
    'Royal Blue',
    'Teal',
  ],
};

export const PLAIN_FABRIC_CLASSIFICATION_OPTIONS = {
  byFabric: [
    'Plain Chanderi',
    'Plain Cotton',
    'Plain Gadwal Silk',
    'Plain Kanchipuram Silk',
    'Plain Linen',
    'Plain Mysore Silk',
    'Plain Patola Silk',
    'Plain Tussar Silk',
  ],
  byColour: [
    'Beige',
    'Black',
    'Bottle Green',
    'Emerald Green',
    'Gold',
    'Ivory',
    'Lavender',
    'Maroon',
    'Orange',
    'Pink',
    'Red',
    'Teal',
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
