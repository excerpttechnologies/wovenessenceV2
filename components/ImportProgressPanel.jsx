function count(value) {
  return Number(value || 0).toLocaleString();
}

export default function ImportProgressPanel({ progress }) {
  if (!progress) return null;

  const total = Number(progress.total || 0);
  const done = Number(progress.done || 0);
  const measuredPercentage = progress.completed
    ? 100
    : total > 0
      ? Math.min(99, Math.floor((Math.min(done, total) / total) * 100))
      : 0;
  const percentage = progress.status === 'failed' ? Math.min(99, measuredPercentage) : measuredPercentage;
  const failed = progress.failed === undefined ? null : Number(progress.failed || 0);
  const statusTone = progress.status === 'failed'
    ? 'border-[#f3b4b4] bg-[#fdecec] text-danger'
    : progress.status === 'completed' && failed > 0
      ? 'border-[#e7c96b] bg-[#fff8e6] text-[#8a5a00]'
      : progress.status === 'completed'
        ? 'border-[#b8dfc7] bg-okgreenbg text-okgreen'
        : 'border-line bg-[#f7f9fc] text-ink';

  return (
    <section
      className={`rounded-lg border px-3 py-3 ${statusTone}`}
      aria-live="polite"
      aria-label="Excel import progress"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[13px] font-bold">Excel Import Progress</div>
          <div className="mt-1 text-[12px]">{progress.message || 'Preparing import'}</div>
        </div>
        <div className="text-[22px] font-bold leading-none">{percentage}%</div>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded bg-[#e3e8f0]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        aria-valuetext={`${percentage}%`}
      >
        <div className="h-full rounded bg-brand transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      {total > 0 && (
        <div className="mt-1 text-[12px]">
          {count(done)} of {count(total)} {progress.unit || 'rows'} processed
        </div>
      )}
      {(progress.success !== undefined || progress.skipped !== undefined || progress.failed !== undefined) && (
        <div className="mt-1 text-[12px]">
          {progress.success !== undefined && <>{count(progress.success)} successful</>}
          {progress.success !== undefined && (progress.skipped !== undefined || progress.failed !== undefined) && ' · '}
          {progress.skipped !== undefined && <>{count(progress.skipped)} skipped</>}
          {progress.skipped !== undefined && progress.failed !== undefined && ' · '}
          {progress.failed !== undefined && <>{count(progress.failed)} failed</>}
        </div>
      )}
    </section>
  );
}
