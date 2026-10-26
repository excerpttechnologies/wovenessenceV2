'use client';

import styles from './dashboard.module.css';
import { Glyph } from './ui';

export default function KeyTakeaway({ text }) {
  return (
    <section className={styles.takeaway} aria-label="Key takeaway">
      <span className={styles.takeawayMark} aria-hidden="true">“</span>
      <div className={styles.takeawayBody}>
        <span className={styles.takeawayEyebrow}>
          <Glyph name="sparkle" size={13} /> Key takeaway
        </span>
        <p>{text || 'No takeaway is available for this selection.'}</p>
      </div>
      <span className={styles.takeawaySide}>Derived from the same filtered figures as every panel</span>
    </section>
  );
}
