import { useState, useEffect } from 'react';
import type { CopilotSuggestion } from 'shared-types';
import styles from './SidebarCopilot.module.css';

interface SidebarCopilotProps {
  suggestions: CopilotSuggestion[];
  sessionId?: string | null;
}

interface SearchResult {
  id: string;
  title: string;
  content: string;
  category: string;
  relevance: number;
}

export default function SidebarCopilot({ suggestions, sessionId }: SidebarCopilotProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [activeTab, setActiveTab] = useState<'suggestions' | 'alerts' | 'knowledge'>('suggestions');
  const [copilotStatus, setCopilotStatus] = useState<{ llmEnabled: boolean; llmProvider?: string } | null>(null);

  // Check copilot status on mount
  useEffect(() => {
    fetch('/api/copilot/status')
      .then(res => res.json())
      .then(data => setCopilotStatus(data))
      .catch(err => console.error('Failed to check copilot status:', err));
  }, []);

  // Separate alerts (critical items) from regular suggestions
  const alerts = suggestions.filter(s => 
    s.metadata?.priority === 'CRITICAL' ||
    s.title.toLowerCase().includes('emergency') ||
    s.title.toLowerCase().includes('frustrat') ||
    s.title.toLowerCase().includes('warning') ||
    s.type === 'ACTION' && s.confidenceScore >= 0.9
  );
  const regularSuggestions = suggestions.filter(s => !alerts.includes(s));

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch('/api/copilot/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, limit: 5 }),
      });
      
      if (!response.ok) throw new Error('Search failed');
      
      const data = await response.json();
      setSearchResults(data.results || []);
      setActiveTab('knowledge');
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  // Request suggestions for current session
  const refreshSuggestions = async () => {
    if (!sessionId) return;
    
    try {
      await fetch('/api/copilot/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, emit: true }),
      });
    } catch (error) {
      console.error('Failed to refresh suggestions:', error);
    }
  };

  return (
    <div className={styles.copilot}>
      {/* Header with tabs */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h2 className={styles.title}>
            AI Copilot
            {copilotStatus?.llmEnabled && (
              <span className={styles.llmBadge}>
                {copilotStatus.llmProvider === 'gemini' ? '✨ Gemini' : 'LLM'}
              </span>
            )}
          </h2>
          <button 
            className={styles.refreshBtn} 
            onClick={refreshSuggestions}
            title="Refresh suggestions"
            disabled={!sessionId}
          >
            🔄
          </button>
        </div>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'suggestions' ? styles.active : ''}`}
            onClick={() => setActiveTab('suggestions')}
          >
            <span className={styles.tabIcon}>✨</span>
            <span className={styles.tabLabel}>Suggestions</span>
            {regularSuggestions.length > 0 && (
              <span className={styles.tabBadge}>{regularSuggestions.length}</span>
            )}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'alerts' ? styles.active : ''}`}
            onClick={() => setActiveTab('alerts')}
          >
            <span className={styles.tabIcon}>⚠️</span>
            <span className={styles.tabLabel}>Alerts</span>
            {alerts.length > 0 && (
              <span className={`${styles.tabBadge} ${styles.alertBadge}`}>{alerts.length}</span>
            )}
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'knowledge' ? styles.active : ''}`}
            onClick={() => setActiveTab('knowledge')}
          >
            <span className={styles.tabIcon}>📚</span>
            <span className={styles.tabLabel}>KB</span>
          </button>
        </div>
      </header>

      {/* Search bar */}
      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search knowledge base..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className={styles.searchInput}
        />
        {searchQuery ? (
          <button className={styles.searchBtn} onClick={clearSearch} title="Clear">
            ✕
          </button>
        ) : (
          <button 
            className={styles.searchBtn} 
            onClick={handleSearch} 
            title="Search"
            disabled={isSearching}
          >
            {isSearching ? '...' : '🔍'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {isSearching && (
          <div className={styles.loading}>
            <span className={styles.spinner} />
            Searching...
          </div>
        )}

        {/* Alerts tab */}
        {activeTab === 'alerts' && (
          <div className={styles.alerts}>
            {alerts.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>✓</div>
                <p className={styles.emptyText}>No alerts at this time</p>
              </div>
            ) : (
              alerts.map((alert, index) => (
                <AlertCard key={index} suggestion={alert} />
              ))
            )}
          </div>
        )}

        {/* Suggestions tab */}
        {activeTab === 'suggestions' && (
          <div className={styles.suggestions}>
            {regularSuggestions.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>🎯</div>
                <p className={styles.emptyText}>
                  {sessionId 
                    ? 'Suggestions will appear based on the conversation'
                    : 'Select a conversation to see suggestions'}
                </p>
              </div>
            ) : (
              regularSuggestions.map((suggestion, index) => (
                <SuggestionCard key={index} suggestion={suggestion} />
              ))
            )}
          </div>
        )}

        {/* Knowledge base tab */}
        {activeTab === 'knowledge' && (
          <div className={styles.knowledge}>
            {searchResults.length > 0 ? (
              <>
                <div className={styles.sectionHeader}>
                  <span>Search Results ({searchResults.length})</span>
                  <button className={styles.clearBtn} onClick={clearSearch}>Clear</button>
                </div>
                {searchResults.map((result) => (
                  <KnowledgeCard key={result.id} article={result} />
                ))}
              </>
            ) : (
              <div className={styles.empty}>
                <div className={styles.emptyIcon}>📚</div>
                <p className={styles.emptyText}>
                  Search the knowledge base above
                </p>
                <div className={styles.quickSearches}>
                  <span className={styles.quickLabel}>Quick searches:</span>
                  <button onClick={() => { setSearchQuery('payment'); handleSearch(); }}>
                    Payments
                  </button>
                  <button onClick={() => { setSearchQuery('outage'); handleSearch(); }}>
                    Outages
                  </button>
                  <button onClick={() => { setSearchQuery('billing'); handleSearch(); }}>
                    Billing
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick actions footer */}
      <div className={styles.quickActions}>
        <button className={styles.quickAction} title="Common Responses">
          💬 Responses
        </button>
        <button className={styles.quickAction} title="Escalate to Supervisor">
          📤 Escalate
        </button>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: CopilotSuggestion }) {
  const isAction = suggestion.type === 'ACTION';
  const [isExpanded, setIsExpanded] = useState(false);
  
  const truncatedContent = suggestion.content.length > 150 && !isExpanded
    ? suggestion.content.substring(0, 150) + '...'
    : suggestion.content;

  return (
    <div className={`${styles.card} ${isAction ? styles.action : styles.info}`}>
      <div className={styles.cardHeader}>
        <span className={styles.cardType}>
          {isAction ? '⚡ Action' : '📋 Info'}
        </span>
        <span className={styles.confidence}>
          {Math.round(suggestion.confidenceScore * 100)}%
        </span>
      </div>
      <h3 className={styles.cardTitle}>{suggestion.title}</h3>
      <p className={styles.cardContent}>
        {truncatedContent}
      </p>
      {suggestion.content.length > 150 && (
        <button 
          className={styles.expandBtn}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? '▲ Show less' : '▼ Show more'}
        </button>
      )}
      {isAction && (
        <button className={styles.actionButton}>
          Use This Response
        </button>
      )}
    </div>
  );
}

function AlertCard({ suggestion }: { suggestion: CopilotSuggestion }) {
  const [dismissed, setDismissed] = useState(false);
  
  if (dismissed) return null;
  
  const isEmergency = suggestion.metadata?.priority === 'CRITICAL' || 
    suggestion.title.toLowerCase().includes('emergency');

  return (
    <div className={`${styles.alertCard} ${isEmergency ? styles.emergency : ''}`}>
      <div className={styles.alertIcon}>
        {isEmergency ? '🚨' : '⚠️'}
      </div>
      <div className={styles.alertContent}>
        <h3 className={styles.alertTitle}>{suggestion.title}</h3>
        <p className={styles.alertText}>{suggestion.content}</p>
      </div>
      <button 
        className={styles.dismissBtn} 
        onClick={() => setDismissed(true)}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

function KnowledgeCard({ article }: { article: SearchResult }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const truncatedContent = article.content.length > 200 && !isExpanded
    ? article.content.substring(0, 200) + '...'
    : article.content;

  return (
    <div className={styles.knowledgeCard}>
      <div className={styles.knowledgeHeader}>
        <span className={styles.category}>{article.category}</span>
        <span className={styles.relevance}>
          {Math.round(article.relevance * 100)}% match
        </span>
      </div>
      <h3 className={styles.knowledgeTitle}>{article.title}</h3>
      <p className={styles.knowledgeContent}>{truncatedContent}</p>
      {article.content.length > 200 && (
        <button 
          className={styles.expandBtn}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? '▲ Show less' : '▼ Read more'}
        </button>
      )}
    </div>
  );
}
