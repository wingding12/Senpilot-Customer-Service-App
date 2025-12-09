import { useState } from 'react';
import styles from './CallButton.module.css';

type CallStatus = 'idle' | 'connecting' | 'active' | 'ended';

export default function CallButton() {
  const [status, setStatus] = useState<CallStatus>('idle');

  const handleCall = async () => {
    if (status === 'idle') {
      setStatus('connecting');
      
      // TODO: Implement actual Telnyx WebRTC call
      // For now, simulate connection
      setTimeout(() => {
        setStatus('active');
      }, 2000);
    } else if (status === 'active') {
      setStatus('ended');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.visualization}>
        <div className={`${styles.rings} ${status === 'active' ? styles.active : ''}`}>
          <span></span>
          <span></span>
          <span></span>
        </div>
        
        <button 
          className={`${styles.callButton} ${styles[status]}`}
          onClick={handleCall}
          disabled={status === 'connecting' || status === 'ended'}
        >
          {status === 'idle' && '📞'}
          {status === 'connecting' && '⏳'}
          {status === 'active' && '📴'}
          {status === 'ended' && '✓'}
        </button>
      </div>

      <div className={styles.statusText}>
        {status === 'idle' && 'Tap to start voice call'}
        {status === 'connecting' && 'Connecting to agent...'}
        {status === 'active' && 'Call in progress - Tap to end'}
        {status === 'ended' && 'Call ended'}
      </div>

      {status === 'active' && (
        <div className={styles.controls}>
          <button className={styles.controlButton}>
            🔇 Mute
          </button>
          <button className={styles.controlButton}>
            🔊 Speaker
          </button>
          <button className={styles.controlButton}>
            👤 Human
          </button>
        </div>
      )}

      <div className={styles.hint}>
        Press <kbd>0</kbd> during the call to speak with a human
      </div>
    </div>
  );
}

