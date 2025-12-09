import type { CallState } from '../../hooks/useCallState';
import styles from './ActiveCallBanner.module.css';

interface ActiveCallBannerProps {
  callState: CallState;
}

export default function ActiveCallBanner({ callState }: ActiveCallBannerProps) {
  const { status, mode, callId, switchCount, startTime } = callState;
  
  const isActive = status === 'active';
  const isAI = mode === 'AI_AGENT';
  
  // Calculate duration
  const getDuration = () => {
    if (!startTime) return '00:00';
    const seconds = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (status === 'idle') {
    return (
      <div className={`${styles.banner} ${styles.idle}`}>
        <div className={styles.statusIcon}>◇</div>
        <div className={styles.content}>
          <span className={styles.title}>No Active Call</span>
          <span className={styles.subtitle}>Waiting for incoming call...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.banner} ${isAI ? styles.ai : styles.human}`}>
      <div className={styles.statusIcon}>
        {isAI ? '🤖' : '👤'}
      </div>
      
      <div className={styles.content}>
        <span className={styles.title}>
          {isAI ? 'AI Agent Active' : 'You Are Live'}
        </span>
        <span className={styles.subtitle}>
          {callId ? `Call: ${callId.slice(0, 12)}...` : 'Processing...'}
        </span>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{getDuration()}</span>
          <span className={styles.statLabel}>Duration</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{switchCount}</span>
          <span className={styles.statLabel}>Switches</span>
        </div>
      </div>

      {isActive && (
        <div className={styles.liveIndicator}>
          <span className={styles.liveDot} />
          LIVE
        </div>
      )}
    </div>
  );
}

