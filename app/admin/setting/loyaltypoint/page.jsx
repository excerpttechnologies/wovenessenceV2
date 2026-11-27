'use client';
import ListView from '@/components/ListView';
import Icon from '@/components/Icon';
import { FIELDS } from './fields';

/* Loyalty Point Schemes (/admin/setting/loyaltypoint) -
   Manage multiple loyalty point schemes per business; Contact Types then
   pick from these schemes in their "Loyalty Points Applicable" dropdown. */

function fmtDate(ymd) {
  if (!ymd) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  if (!m) return String(ymd);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const CONFIG = {
  title: 'Loyalty Point',
  basePath: '/admin/setting/',
  slugPath: 'loyaltypoint',
  endpoint: '/api/loyalty-point',
  pager: 'numbered',
  sortable: true,
  scope: ['business'],
  addTitle: 'Add Loyalty Scheme',
  formMode: 'modal',
  columns: [
    { k: 'loyaltyPointName', t: 'Scheme Name' },
    {
      k: 'active',
      t: 'Active',
      render: (r) => {
        const isYes = String(r.active || '').toLowerCase() === 'yes';
        return (
          <span className={'pill inline-flex items-center gap-1 ' + (isYes ? 'pill-green' : 'pill-red')}>
            <Icon name={isYes ? 'checkCircle' : 'x'} size={12} stroke={2.2} />
            {isYes ? 'Active' : 'Inactive'}
          </span>
        );
      },
    },
    {
      k: 'loyaltyPointsApplicable',
      t: 'Loyalty Applicable',
      render: (r) => {
        const isYes = String(r.loyaltyPointsApplicable || '').toLowerCase() !== 'no';
        return (
          <span className={'pill inline-flex items-center gap-1 ' + (isYes ? 'pill-green' : 'pill-grey')}>
            {isYes ? 'YES' : 'NO'}
          </span>
        );
      },
    },
    { k: 'pointsToInr', t: '1 Pt = INR' },
    { k: 'purchaseAmountForOnePoint', t: 'Purchase Amt / 1 Pt' },
    {
      k: 'fromDate',
      t: 'From Date',
      value: (r) => (r.fromDate ? fmtDate(r.fromDate) : '—'),
      render: (r) => fmtDate(r.fromDate),
    },
    {
      k: 'toDate',
      t: 'To Date',
      value: (r) => (r.toDate ? fmtDate(r.toDate) : '—'),
      render: (r) => fmtDate(r.toDate),
    },
    {
      k: 'pointsExpireAfter',
      t: 'Expires After',
      value: (r) => (r.pointsExpireAfter ? `${r.pointsExpireAfter} Months` : '—'),
      render: (r) => (r.pointsExpireAfter ? `${r.pointsExpireAfter} Months` : '—'),
    },
    { k: 'otpRequired', t: 'OTP Required' },
    {
      k: 'redeemTiming',
      t: 'Redeem Points',
      value: (r) => (String(r.redeemTiming || '').toLowerCase() === 'instant' ? 'Redeem Instantly (Same Day)' : 'Redeem From Next Day'),
      render: (r) => (String(r.redeemTiming || '').toLowerCase() === 'instant' ? 'Redeem Instantly (Same Day)' : 'Redeem From Next Day'),
    },
  ],
  fields: FIELDS,
};

export default function LoyaltypointPage() {
  return <ListView cfg={CONFIG} />;
}
