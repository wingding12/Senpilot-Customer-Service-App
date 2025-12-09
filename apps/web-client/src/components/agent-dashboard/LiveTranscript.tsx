import { useEffect, useRef } from 'react';
import type { TranscriptEntry } from 'shared-types';
import styles from './LiveTranscript.module.css';

interface LiveTranscriptProps {
  entries: TranscriptEntry[];
}

export default function LiveTranscript({ entries }: LiveTranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries]);

  const getSpeakerLabel = (speaker: string) => {
    switch (speaker) {
      case 'AI': return 'AI Agent';
      case 'HUMAN': return 'You';
      case 'CUSTOMER': return 'Customer';
      default: return speaker;
    }
  };

  const getSpeakerClass = (speaker: string) => {
    switch (speaker) {
      case 'AI': return styles.ai;
      case 'HUMAN': return styles.human;
      case 'CUSTOMER': return styles.customer;
      default: return '';
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit',
      hour12: false 
    });
  };

  if (entries.length === 0) {
    return (
      <div className={styles.container} ref={containerRef}>
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>💬</span>
          <p>Transcript will appear here when the call starts</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.entries}>
        {entries.map((entry, index) => (
          <div 
            key={index} 
            className={`${styles.entry} ${getSpeakerClass(entry.speaker)}`}
          >
            <div className={styles.entryHeader}>
              <span className={styles.speaker}>{getSpeakerLabel(entry.speaker)}</span>
              <span className={styles.time}>{formatTime(entry.timestamp)}</span>
            </div>
            <p className={styles.text}>{entry.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

