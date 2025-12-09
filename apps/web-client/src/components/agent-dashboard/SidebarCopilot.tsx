import type { CopilotSuggestion } from 'shared-types';
import styles from './SidebarCopilot.module.css';

interface SidebarCopilotProps {
  suggestions: CopilotSuggestion[];
}

export default function SidebarCopilot({ suggestions }: SidebarCopilotProps) {
  return (
    <div className={styles.copilot}>
      <header className={styles.header}>
        <h2 className={styles.title}>
          <span className={styles.icon}>✨</span>
          Copilot
        </h2>
        <span className={styles.count}>{suggestions.length}</span>
      </header>

      <div className={styles.content}>
        {suggestions.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>🎯</div>
            <p className={styles.emptyText}>
              Suggestions will appear here based on the conversation
            </p>
          </div>
        ) : (
          <div className={styles.suggestions}>
            {suggestions.map((suggestion, index) => (
              <SuggestionCard key={index} suggestion={suggestion} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: CopilotSuggestion }) {
  const isAction = suggestion.type === 'ACTION';
  
  return (
    <div className={`${styles.card} ${isAction ? styles.action : styles.info}`}>
      <div className={styles.cardHeader}>
        <span className={styles.cardType}>
          {isAction ? '⚡ Action' : 'ℹ️ Info'}
        </span>
        <span className={styles.confidence}>
          {Math.round(suggestion.confidenceScore * 100)}%
        </span>
      </div>
      <h3 className={styles.cardTitle}>{suggestion.title}</h3>
      <p className={styles.cardContent}>{suggestion.content}</p>
      {isAction && (
        <button className={styles.actionButton}>
          Apply Suggestion
        </button>
      )}
    </div>
  );
}

