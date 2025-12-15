import Redis from 'ioredis';
import { env } from '../../config/env.js';
import type { CallSession } from 'shared-types';

let redis: Redis | null = null;
let isConnecting = false;
let useInMemory = false;

// In-memory fallback store
const inMemoryStore = new Map<string, { data: string; expiry: number }>();

export async function connectRedis(): Promise<Redis | null> {
  if (useInMemory) {
    return null;
  }

  if (redis && redis.status === 'ready') {
    return redis;
  }

  if (isConnecting) {
    // Wait for existing connection attempt
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (useInMemory) {
          clearInterval(checkInterval);
          resolve(null);
        } else if (redis && redis.status === 'ready') {
          clearInterval(checkInterval);
          resolve(redis);
        }
      }, 100);
    });
  }

  isConnecting = true;

  return new Promise((resolve) => {
    const client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times) {
        if (times > 2) {
          // Give up after 2 retries, use in-memory
          return null;
        }
        return Math.min(times * 50, 500);
      },
      connectTimeout: 3000,
    });

    const timeout = setTimeout(() => {
      if (!redis) {
        console.log('⚠️  Redis connection timeout - using in-memory storage');
        useInMemory = true;
        isConnecting = false;
        client.disconnect();
        resolve(null);
      }
    }, 3000);

    client.on('connect', () => {
      console.log('✅ Connected to Redis');
    });

    client.on('ready', () => {
      clearTimeout(timeout);
      redis = client;
      isConnecting = false;
      resolve(client);
    });

    client.on('error', (err) => {
      if (!redis && !useInMemory) {
        console.log('⚠️  Redis unavailable - using in-memory storage');
        console.log('   (Start Redis with: docker-compose up -d)');
        useInMemory = true;
        isConnecting = false;
        clearTimeout(timeout);
        client.disconnect();
        resolve(null);
      }
    });
  });
}

/**
 * Get Redis client, auto-connecting if needed
 * Returns null if using in-memory fallback
 */
export async function getRedisAsync(): Promise<Redis | null> {
  if (useInMemory) {
    return null;
  }
  if (redis && redis.status === 'ready') {
    return redis;
  }
  return connectRedis();
}

/**
 * Check if using in-memory storage
 */
export function isUsingInMemory(): boolean {
  return useInMemory;
}

/**
 * Get Redis client synchronously (throws if not connected)
 * @deprecated Use getRedisAsync() instead
 */
export function getRedis(): Redis {
  if (!redis || redis.status !== 'ready') {
    throw new Error('Redis not connected. Call connectRedis() first.');
  }
  return redis;
}

// Session management functions
const SESSION_PREFIX = 'session:';
const SESSION_TTL = 60 * 60 * 2; // 2 hours

// Helper to clean expired in-memory entries
function cleanExpired(): void {
  const now = Date.now();
  for (const [key, value] of inMemoryStore.entries()) {
    if (value.expiry < now) {
      inMemoryStore.delete(key);
    }
  }
}

export async function createSession(callId: string, session: CallSession): Promise<void> {
  const key = `${SESSION_PREFIX}${callId}`;
  const data = JSON.stringify(session);

  if (useInMemory) {
    inMemoryStore.set(key, {
      data,
      expiry: Date.now() + SESSION_TTL * 1000,
    });
    return;
  }

  const client = await getRedisAsync();
  if (client) {
    await client.setex(key, SESSION_TTL, data);
  } else {
    // Fallback to in-memory
    inMemoryStore.set(key, {
      data,
      expiry: Date.now() + SESSION_TTL * 1000,
    });
  }
}

export async function getSession(callId: string): Promise<CallSession | null> {
  const key = `${SESSION_PREFIX}${callId}`;

  try {
    if (useInMemory) {
      cleanExpired();
      const entry = inMemoryStore.get(key);
      if (entry && entry.expiry > Date.now()) {
        return JSON.parse(entry.data);
      }
      return null;
    }

    const client = await getRedisAsync();
    if (client) {
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } else {
      // Fallback to in-memory
      const entry = inMemoryStore.get(key);
      if (entry && entry.expiry > Date.now()) {
        return JSON.parse(entry.data);
      }
      return null;
    }
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
}

export async function updateSession(
  callId: string, 
  updates: Partial<CallSession>
): Promise<CallSession | null> {
  const current = await getSession(callId);
  if (!current) return null;
  
  const updated = { ...current, ...updates };
  await createSession(callId, updated);
  return updated;
}

export async function deleteSession(callId: string): Promise<void> {
  const key = `${SESSION_PREFIX}${callId}`;

  if (useInMemory) {
    inMemoryStore.delete(key);
    return;
  }

  const client = await getRedisAsync();
  if (client) {
    await client.del(key);
  } else {
    inMemoryStore.delete(key);
  }
}

export async function appendTranscript(
  callId: string, 
  speaker: 'AI' | 'HUMAN' | 'CUSTOMER',
  text: string,
  timestamp?: number
): Promise<void> {
  const session = await getSession(callId);
  if (!session) return;
  
  const entry = { speaker, text, timestamp: timestamp ?? Date.now() };
  session.transcript.push(entry);
  await createSession(callId, session);
}
