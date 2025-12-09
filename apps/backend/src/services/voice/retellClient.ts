/**
 * Retell AI Voice Client
 *
 * Retell provides a complete voice AI solution:
 * - Speech-to-Text (STT)
 * - Language Model (LLM) processing
 * - Text-to-Speech (TTS)
 *
 * All in a single low-latency WebSocket connection.
 */

import Retell from "retell-sdk";
import { env, hasRetellConfig } from "../../config/env.js";

// Singleton Retell client
let retellClient: Retell | null = null;

/**
 * Get the Retell client instance
 * Creates a singleton to reuse across requests
 */
export function getRetellClient(): Retell {
  if (!hasRetellConfig()) {
    throw new Error(
      "Retell is not configured. Set RETELL_API_KEY and RETELL_AGENT_ID in environment."
    );
  }

  if (!retellClient) {
    retellClient = new Retell({
      apiKey: env.RETELL_API_KEY!,
    });
  }

  return retellClient;
}

/**
 * Register a phone call with Retell
 * This creates a Retell call that can handle the conversation
 *
 * @param fromNumber - The caller's phone number
 * @param toNumber - Your Telnyx phone number
 * @param metadata - Optional metadata to pass to the agent
 * @returns The Retell call object with call_id
 */
export async function registerPhoneCall(
  fromNumber: string,
  toNumber: string,
  metadata?: Record<string, string>
): Promise<{
  call_id: string;
  agent_id: string;
}> {
  const client = getRetellClient();

  const response = await client.call.registerPhoneCall({
    agent_id: env.RETELL_AGENT_ID!,
    from_number: fromNumber,
    to_number: toNumber,
    metadata,
  });

  console.log(`📞 Retell call registered: ${response.call_id}`);

  return {
    call_id: response.call_id,
    agent_id: response.agent_id,
  };
}

/**
 * Create a web call (for browser-based calling)
 * Returns a call_id that can be used with Retell's WebRTC SDK
 *
 * @param metadata - Optional metadata to pass to the agent
 * @returns The Retell call object
 */
export async function createWebCall(
  metadata?: Record<string, string>
): Promise<{
  call_id: string;
  agent_id: string;
  access_token: string;
}> {
  const client = getRetellClient();

  const response = await client.call.createWebCall({
    agent_id: env.RETELL_AGENT_ID!,
    metadata,
  });

  console.log(`🌐 Retell web call created: ${response.call_id}`);

  return {
    call_id: response.call_id,
    agent_id: response.agent_id,
    access_token: response.access_token,
  };
}

/**
 * Get call details from Retell
 *
 * @param callId - The Retell call ID
 * @returns Call details including transcript
 */
export async function getCallDetails(callId: string): Promise<{
  call_id: string;
  agent_id: string;
  call_status: string;
  start_timestamp?: number;
  end_timestamp?: number;
  transcript?: string;
  recording_url?: string;
  disconnection_reason?: string;
}> {
  const client = getRetellClient();
  const response = await client.call.retrieve(callId);

  return {
    call_id: response.call_id,
    agent_id: response.agent_id,
    call_status: response.call_status,
    start_timestamp: response.start_timestamp,
    end_timestamp: response.end_timestamp,
    transcript: response.transcript,
    recording_url: response.recording_url,
    disconnection_reason: response.disconnection_reason,
  };
}

/**
 * End a Retell call programmatically
 *
 * @param callId - The Retell call ID to end
 */
export async function endCall(callId: string): Promise<void> {
  const client = getRetellClient();
  await client.call.delete(callId);
  console.log(`📞 Retell call ended: ${callId}`);
}

/**
 * List recent calls (useful for debugging)
 *
 * @param limit - Number of calls to retrieve (default 10)
 * @returns Array of call summaries
 */
export async function listRecentCalls(limit = 10): Promise<
  Array<{
    call_id: string;
    agent_id: string;
    call_status: string;
    start_timestamp?: number;
  }>
> {
  const client = getRetellClient();
  const response = await client.call.list({ limit });

  return response.map((call) => ({
    call_id: call.call_id,
    agent_id: call.agent_id,
    call_status: call.call_status,
    start_timestamp: call.start_timestamp,
  }));
}

/**
 * Verify a Retell webhook signature
 * Use this to ensure webhook requests are from Retell
 *
 * @param payload - The raw request body as string
 * @param signature - The X-Retell-Signature header
 * @param apiKey - Your Retell API key
 * @returns true if signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  apiKey: string
): boolean {
  // Retell uses HMAC-SHA256 for webhook signatures
  const crypto = require("crypto");
  const expectedSignature = crypto
    .createHmac("sha256", apiKey)
    .update(payload)
    .digest("hex");

  return signature === expectedSignature;
}

// Re-export config check
export { hasRetellConfig };
