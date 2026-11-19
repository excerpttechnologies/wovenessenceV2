import DayEndReportDetailView from './DayEndReportDetailView';

export default async function DayEndReportDetailsPage({ searchParams }) {
  const params = await searchParams;
  return (
    <DayEndReportDetailView
      businessId={String(params?.businessId || '')}
      locationId={String(params?.locationId || '')}
      date={String(params?.date || '')}
      finYear={String(params?.finYear || '')}
    />
  );
}
