import { useState, useRef, useEffect } from 'react';
import styles from './ChatWindow.module.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function ChatWindow() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // TODO: Replace with actual API call
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage.content }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply || 'Sorry, I could not process that.',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      // Show error message
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Sorry, there was an error. Please try again.',
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.chatWindow}>
      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.welcome}>
            <span className={styles.welcomeIcon}>👋</span>
            <h3>Welcome!</h3>
            <p>How can we help you today?</p>
          </div>
        )}
        
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.message} ${styles[message.role]}`}
          >
            <div className={styles.messageContent}>{message.content}</div>
          </div>
        ))}
        
        {isLoading && (
          <div className={`${styles.message} ${styles.assistant}`}>
            <div className={styles.typing}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className={styles.inputForm}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className={styles.input}
          disabled={isLoading}
        />
        <button 
          type="submit" 
          className={styles.sendButton}
          disabled={!input.trim() || isLoading}
        >
          Send
        </button>
      </form>

      <div className={styles.hint}>
        Type <code>/human</code> to speak with a human representative
      </div>
    </div>
  );
}

