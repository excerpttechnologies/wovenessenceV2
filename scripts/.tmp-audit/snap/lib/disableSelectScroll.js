/* Stops the mouse wheel from changing a focused <select>'s value.

   Most browsers let a wheel scroll over a focused/hovered <select> step its
   selected <option>, the same way a number input's spinner reacts to
   scroll. A user scrolling PAST a dropdown on the way to the rest of the
   page - Vendor Name, Purchase Group, Business Location, Financial Year,
   any status filter - silently changes what is selected, with no visible
   dropdown ever having opened.

   One listener, attached once at the admin app root, blurs whichever
   <select> a wheel event lands on. An unfocused <select> does not respond
   to wheel scroll, so this stops the browser before it acts - there is
   nothing to preventDefault, which a passive listener could not do anyway.

   Native <select> only. The app's custom pickers (RefField/MultiSelect,
   checkref) are plain divs with no such browser behavior to begin with, and
   their open option lists are MEANT to scroll - see the note where this is
   called. */
export function disableSelectScroll() {
  const handler = (e) => {
    if (e.target instanceof HTMLSelectElement) e.target.blur();
  };
  document.addEventListener('wheel', handler, { passive: true });
  return () => document.removeEventListener('wheel', handler);
}
