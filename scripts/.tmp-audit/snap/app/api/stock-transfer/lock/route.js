import dbConnect from '@/lib/db';
import { handler, json } from '@/lib/apiError';
import { requireUser } from '@/lib/rbac';
import { lockHolder } from '@/lib/locks';

/* GET /api/stock-transfer/lock?business=&from=&to=

   Is this location PAIR currently busy, and with what.

   Only so the screen can warn before the operator has finished scanning -
   the lock itself is taken and enforced at submit, in lib/locks.js. Being
   told late is the failure this avoids; it is not a substitute for the lock.

   Answers about one pair only. There is deliberately no "list all locks"
   endpoint: knowing that C and D are busy is no business of the person
   working between A and B. */

export const GET = handler(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const holder = await lockHolder(sp.get('business'), sp.get('from'), sp.get('to'));

  return json({
    ok: true,
    busy: Boolean(holder),
    holder: holder ? {
      operation: holder.operation,
      refNo: holder.refNo,
      userName: holder.userName,
      since: holder.acquiredAt,
    } : null,
  });
});
