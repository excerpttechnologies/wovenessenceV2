import {
  LuTag,
  LuLayers,
  LuPalette,
  LuSparkles,
  LuScissors,
  LuShirt,
  LuGrid2X2,
  LuShapes,
  LuBookmark,
  LuFeather,
  LuRuler,
  LuStar,
  LuSlidersHorizontal,
  LuGem,
  LuSwatchBook,
  LuPackage,
} from 'react-icons/lu';

export const BUILT_IN_FILTER_DEFS = [
  {
    key: 'byWeave',
    slug: 'by-weave',
    name: 'By Weave',
    label: 'By Weave',
    icon: 'grid',
    href: '/admin/ecommerce/by-weave',
    isBuiltIn: true,
    isActive: true,
    ecommerceVisible: true,
    displayOrder: 0,
  },
  {
    key: 'byFabric',
    slug: 'by-fabric',
    name: 'By Fabric',
    label: 'By Fabric',
    icon: 'shirt',
    href: '/admin/ecommerce/by-fabric',
    isBuiltIn: true,
    isActive: true,
    ecommerceVisible: true,
    displayOrder: 1,
  },
  {
    key: 'byCraft',
    slug: 'by-craft',
    name: 'By Craft',
    label: 'By Craft',
    icon: 'scissors',
    href: '/admin/ecommerce/by-craft',
    isBuiltIn: true,
    isActive: true,
    ecommerceVisible: true,
    displayOrder: 2,
  },
  {
    key: 'byOccasion',
    slug: 'by-occasion',
    name: 'By Occasion',
    label: 'By Occasion',
    icon: 'sparkles',
    href: '/admin/ecommerce/by-occasion',
    isBuiltIn: true,
    isActive: true,
    ecommerceVisible: true,
    displayOrder: 3,
  },
  {
    key: 'byColour',
    slug: 'by-colour',
    name: 'By Colour',
    label: 'By Colour',
    icon: 'palette',
    href: '/admin/ecommerce/by-colour',
    isBuiltIn: true,
    isActive: true,
    ecommerceVisible: true,
    displayOrder: 4,
  },
];

export const BUILT_IN_FILTER_KEY_SET = new Set(BUILT_IN_FILTER_DEFS.map((f) => f.key));
export const BUILT_IN_FILTER_SLUG_SET = new Set(BUILT_IN_FILTER_DEFS.map((f) => f.slug));

export const FILTER_ICON_CHOICES = [
  { key: 'grid', label: 'Weave / Grid', Icon: LuGrid2X2 },
  { key: 'shirt', label: 'Fabric / Apparel', Icon: LuShirt },
  { key: 'scissors', label: 'Craft / Stitch', Icon: LuScissors },
  { key: 'sparkles', label: 'Occasion / Festive', Icon: LuSparkles },
  { key: 'palette', label: 'Colour / Palette', Icon: LuPalette },
  { key: 'layers', label: 'Material / Layers', Icon: LuLayers },
  { key: 'shapes', label: 'Pattern / Motif', Icon: LuShapes },
  { key: 'tag', label: 'Style / Tag', Icon: LuTag },
  { key: 'swatch', label: 'Design / Finish', Icon: LuSwatchBook },
  { key: 'feather', label: 'Texture / Drape', Icon: LuFeather },
  { key: 'ruler', label: 'Length / Dimension', Icon: LuRuler },
  { key: 'gem', label: 'Collection / Fine', Icon: LuGem },
  { key: 'star', label: 'Signature / Highlight', Icon: LuStar },
  { key: 'bookmark', label: 'Classic / Edition', Icon: LuBookmark },
  { key: 'package', label: 'Combo / Set', Icon: LuPackage },
  { key: 'sliders', label: 'Custom Filter', Icon: LuSlidersHorizontal },
];

const ICON_BY_KEY = Object.fromEntries(FILTER_ICON_CHOICES.map((entry) => [entry.key, entry.Icon]));
const DEFAULT_ICON_BY_FILTER = Object.fromEntries(BUILT_IN_FILTER_DEFS.map((f) => [f.key, f.icon]));

export function resolveFilterIconComponent(iconKey, filterKey = '') {
  const normalized = String(iconKey || '').trim();
  if (normalized && ICON_BY_KEY[normalized]) return ICON_BY_KEY[normalized];
  const fallbackKey = DEFAULT_ICON_BY_FILTER[String(filterKey || '').trim()] || 'tag';
  return ICON_BY_KEY[fallbackKey] || LuTag;
}
