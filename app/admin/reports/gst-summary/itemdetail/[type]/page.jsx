'use client';
import { useParams } from 'next/navigation';
import GstSummaryDetailView from '../../GstSummaryDetailView';

export default function GstItemDetailPage() {
  const params = useParams();
  return <GstSummaryDetailView type={String(params.type || '').replace(/_/g, ' ')} kind="item" />;
}
