import { screenDenial, SCREENS } from '@/lib/screenPermission';

/* Permission helper for multi-scheme management: allowed if the user has
   access via either Loyalty Point Settings OR Contact Types (where schemes
   are also managed). Refused only when both screens withhold the action. */
export async function loyaltySchemeDenial({ session, action, businessId }) {
  const lpDenied = await screenDenial({
    session,
    screen: SCREENS.LOYALTY_POINT,
    label: 'loyalty point settings',
    action,
    businessId,
  });
  if (!lpDenied) return null;

  const ctDenied = await screenDenial({
    session,
    screen: SCREENS.CONTACT_TYPE,
    label: 'contact types',
    action,
    businessId,
  });
  if (!ctDenied) return null;

  return lpDenied;
}
