'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './dashboard.module.css';
import { Glyph, StatusPill } from './ui';
import { percent } from './format';

const TONE = {
  positive: { tone: 'positive', icon: 'trend' },
  negative: { tone: 'warning', icon: 'warning' },
  neutral: { tone: 'neutral', icon: 'info' },
};

export default function InsightsPanel({ insights }) {
  const [selected, setSelected] = useState(null);
  const closeRef = useRef(null);
  const items = insights?.insights || [];
  const growing = insights?.growingCategories || [];

  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') setSelected(null); };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => closeRef.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [selected]);

  return (
    <>
      <div className={`${styles.card} ${styles.insightsCard}`}>
        <div className={styles.insightsHead}>
          <div>
            <span className={styles.insightsEyebrow}>
              <Glyph name="sparkle" size={14} /> AI insights
            </span>
            <h2 className={styles.insightsTitle}>What the records say</h2>
          </div>
          <StatusPill tone="gold" icon="info">Rule-based</StatusPill>
        </div>

        <p className={styles.providerNote}>{insights?.providerNote}</p>

        {items.length === 0 ? (
          <p className={styles.insightsEmpty}>No rule-based insight was supported by this selection.</p>
        ) : (
          <ul className={styles.insightList}>
            {items.map((item) => {
              const tone = TONE[item.tone] || TONE.neutral;
              return (
                <li key={item.id} className={styles.insightItem}>
                  <span className={`${styles.insightIcon} ${styles[`tone_${tone.tone}`] || ''}`}>
                    <Glyph name={tone.icon} size={15} />
                  </span>
                  <div className={styles.insightBody}>
                    <p className={styles.insightTitle}>{item.title}</p>
                    <p className={styles.insightSummary}>{item.summary}</p>
                    <button type="button" className={styles.insightLink} onClick={() => setSelected(item)}>
                      View details <Glyph name="arrowRight" size={13} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {growing.length ? (
          <div className={styles.growingStrip}>
            <span className={styles.growingLabel}>Growing categories</span>
            <div className={styles.growingChips}>
              {growing.slice(0, 4).map((row) => (
                <span key={row.key} className={styles.growingChip}>
                  {row.label} <b>{percent(row.growth, { signed: true })}</b>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <p className={styles.insightFootnote}>
          No AI provider is configured. These are deterministic rules over the filtered records; each detail
          shows its evidence and method.
        </p>
      </div>

      {selected ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onClick={(event) => { if (event.target === event.currentTarget) setSelected(null); }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="insight-title">
            <div className={styles.modalHead}>
              <span className={styles.modalKicker}>
                <Glyph name="sparkle" size={14} /> Rule-based insight
              </span>
              <button
                type="button"
                ref={closeRef}
                className={styles.modalClose}
                onClick={() => setSelected(null)}
                aria-label="Close insight"
              >
                <Glyph name="close" size={18} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <h3 id="insight-title" className={styles.modalTitle}>{selected.title}</h3>
              <p className={styles.modalSummary}>{selected.summary}</p>

              <h4 className={styles.modalLabel}>Evidence from the filtered data</h4>
              <ul className={styles.evidenceList}>
                {(selected.evidence || []).map((line, index) => (
                  <li key={index}><Glyph name="check" size={14} /> {line}</li>
                ))}
              </ul>

              <h4 className={styles.modalLabel}>How this was calculated</h4>
              <p className={styles.modalMethod}>{selected.method}</p>

              <p className={styles.modalNote}>
                Generated by a deterministic rule, not by a language model. No AI provider is configured
                in this deployment.
              </p>
            </div>
            <div className={styles.modalFoot}>
              <button type="button" className={styles.btnPrimary} onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
