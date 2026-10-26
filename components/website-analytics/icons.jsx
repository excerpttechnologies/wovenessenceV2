'use client';

/* Line icons local to this screen. Kept here rather than borrowed from the
   sales dashboard so the two screens can evolve independently. */

const PATHS = {
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  trend: ['M3 17l6-6 4 4 7-8', 'M15 7h5v5'],
  users: ['M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1', 'M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z'],
  user: ['M12 12a4 4 0 100-8 4 4 0 000 8z', 'M5 21v-1a5 5 0 015-5h4a5 5 0 015 5v1'],
  bag: ['M4 8h16l-1 12H5L4 8z', 'M9 8V6a3 3 0 016 0v2'],
  cart: ['M3 4h2l2.5 11h10L20 7H6', 'M9 20a1 1 0 100-2 1 1 0 000 2z', 'M17 20a1 1 0 100-2 1 1 0 000 2z'],
  rupee: ['M7 4h10', 'M7 8h10', 'M7 12h5a4 4 0 000-8', 'M7 12l7 8'],
  percent: ['M19 5L5 19', 'M7.5 9a2.5 2.5 0 100-5 2.5 2.5 0 000 5z', 'M16.5 20a2.5 2.5 0 100-5 2.5 2.5 0 000 5z'],
  globe: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M3 12h18', 'M12 3c2.6 2.6 4 5.6 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.6-4-9s1.4-6.4 4-9z'],
  map: ['M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z', 'M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z'],
  monitor: ['M3 4h18v12H3z', 'M8 20h8', 'M12 16v4'],
  mobile: ['M7 3h10v18H7z', 'M11 18h2'],
  tablet: ['M5 3h14v18H5z', 'M11 18h2'],
  refresh: ['M20 12a8 8 0 10-2.3 5.7', 'M20 4v6h-6'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 20h16'],
  info: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 11v5', 'M12 8h.01'],
  warning: ['M12 3L2.5 20h19z', 'M12 9v5', 'M12 17h.01'],
  check: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M8 12l3 3 5-6'],
  lock: ['M6 10h12v10H6z', 'M9 10V7a3 3 0 016 0v3'],
  sparkle: ['M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5H5V6h5'],
  clock: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 7v5l3 2'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M18 13l-6 6-6-6'],
  search: ['M11 18a7 7 0 100-14 7 7 0 000 14z', 'M16 16l5 5'],
  box: ['M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z', 'M4 7.5l8 4.5 8-4.5', 'M12 12v9'],
};

export default function Glyph({ name, size = 18, className = '', strokeWidth = 1.8 }) {
  const paths = PATHS[name] || PATHS.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}
