import styles from './ConnectionStatus.module.css';

interface ConnectionStatusProps {
  isConnected: boolean;
}

export default function ConnectionStatus({ isConnected }: ConnectionStatusProps) {
  return (
    <div className={`${styles.status} ${isConnected ? styles.connected : styles.disconnected}`}>
      <span className={styles.indicator} />
      <span className={styles.label}>
        {isConnected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}

