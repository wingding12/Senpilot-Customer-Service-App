import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().url(),
  
  // Redis
  REDIS_URL: z.string().url(),
  
  // Server
  PORT: z.string().transform(Number).default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // Telnyx
  TELNYX_API_KEY: z.string().min(1),
  TELNYX_PUBLIC_KEY: z.string().min(1),
  TELNYX_CONNECTION_ID: z.string().min(1),
  TELNYX_PHONE_NUMBER: z.string().min(1),
  
  // Retell AI
  RETELL_API_KEY: z.string().min(1),
  RETELL_AGENT_ID: z.string().min(1),
  
  // AssemblyAI
  ASSEMBLYAI_API_KEY: z.string().min(1),
  
  // OpenAI
  OPENAI_API_KEY: z.string().min(1),
  
  // Frontend
  FRONTEND_URL: z.string().url(),
  
  // Webhooks
  WEBHOOK_BASE_URL: z.string().url(),
});

function validateEnv() {
  const parsed = envSchema.safeParse(process.env);
  
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }
  
  return parsed.data;
}

export const env = validateEnv();
export type Env = z.infer<typeof envSchema>;

