/**
 * Telnyx Voice Client
 *
 * This module provides:
 * 1. TeXML response builders for webhook responses
 * 2. Telnyx API client for programmatic call control (when configured)
 */

import { env, hasTelnyxConfig } from "../../config/env.js";

// TeXML response builders for call control
// TeXML is Telnyx's XML-based call control language (similar to TwiML)
export const TeXML = {
  /**
   * Answer the call and play a greeting with optional DTMF gathering
   */
  answerAndGreet(greeting: string, gatherDigits = false): string {
    const webhookUrl = env.WEBHOOK_BASE_URL || "http://localhost:3001";
    const gather = gatherDigits
      ? `
      <Gather action="${webhookUrl}/webhooks/telnyx/gather" method="POST" numDigits="1" timeout="5">
        <Say voice="alice">${escapeXml(greeting)}</Say>
      </Gather>`
      : `<Say voice="alice">${escapeXml(greeting)}</Say>`;

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${gather}
</Response>`;
  },

  /**
   * Say something to the caller
   */
  say(message: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(message)}</Say>
</Response>`;
  },

  /**
   * Transfer to a conference room
   */
  conference(
    roomName: string,
    options: {
      startOnEnter?: boolean;
      endOnExit?: boolean;
      muted?: boolean;
      beep?: boolean;
    } = {}
  ): string {
    const {
      startOnEnter = true,
      endOnExit = false,
      muted = false,
      beep = false,
    } = options;
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference startConferenceOnEnter="${startOnEnter}" endConferenceOnExit="${endOnExit}" muted="${muted}" beep="${beep}">${escapeXml(
      roomName
    )}</Conference>
  </Dial>
</Response>`;
  },

  /**
   * Put caller on hold with music
   */
  hold(musicUrl?: string): string {
    const music = musicUrl || "https://api.twilio.com/cowbell.mp3";
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${escapeXml(music)}</Play>
</Response>`;
  },

  /**
   * Hangup the call
   */
  hangup(message?: string): string {
    const say = message ? `<Say voice="alice">${escapeXml(message)}</Say>` : "";
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${say}
  <Hangup/>
</Response>`;
  },

  /**
   * Redirect to another URL
   */
  redirect(url: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>${escapeXml(url)}</Redirect>
</Response>`;
  },

  /**
   * Pause for specified seconds
   */
  pause(seconds: number): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="${seconds}"/>
</Response>`;
  },

  /**
   * Gather digits from the caller
   */
  gather(options: {
    action: string;
    numDigits?: number;
    timeout?: number;
    finishOnKey?: string;
    prompt?: string;
  }): string {
    const {
      action,
      numDigits = 1,
      timeout = 5,
      finishOnKey = "#",
      prompt,
    } = options;
    const say = prompt ? `<Say voice="alice">${escapeXml(prompt)}</Say>` : "";
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather action="${escapeXml(
    action
  )}" method="POST" numDigits="${numDigits}" timeout="${timeout}" finishOnKey="${finishOnKey}">
    ${say}
  </Gather>
</Response>`;
  },
};

// Helper to escape XML special characters
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

// ===========================================
// Telnyx API Client (for programmatic control)
// ===========================================

interface TelnyxApiOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: Record<string, unknown>;
}

/**
 * Make a request to the Telnyx API
 */
async function telnyxApiRequest<T>(options: TelnyxApiOptions): Promise<T> {
  if (!hasTelnyxConfig()) {
    throw new Error(
      "Telnyx is not configured. Set TELNYX_API_KEY in environment."
    );
  }

  const { method, path, body } = options;
  const url = `https://api.telnyx.com/v2${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.TELNYX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telnyx API error: ${response.status} ${error}`);
  }

  return response.json() as T;
}

// Call Control API functions

export async function answerCall(callControlId: string): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/calls/${callControlId}/actions/answer`,
  });
}

export async function hangupCall(callControlId: string): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/calls/${callControlId}/actions/hangup`,
  });
}

export async function transferCall(
  callControlId: string,
  to: string
): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/calls/${callControlId}/actions/transfer`,
    body: { to },
  });
}

export async function playAudio(
  callControlId: string,
  audioUrl: string
): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/calls/${callControlId}/actions/playback_start`,
    body: { audio_url: audioUrl },
  });
}

export async function speakText(
  callControlId: string,
  text: string,
  voice: "male" | "female" = "female"
): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/calls/${callControlId}/actions/speak`,
    body: {
      payload: text,
      voice,
      language: "en-US",
    },
  });
}

export async function gatherDigits(
  callControlId: string,
  options: {
    minDigits?: number;
    maxDigits?: number;
    timeoutMillis?: number;
    terminatingDigit?: string;
  } = {}
): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/calls/${callControlId}/actions/gather`,
    body: {
      minimum_digits: options.minDigits || 1,
      maximum_digits: options.maxDigits || 1,
      timeout_millis: options.timeoutMillis || 10000,
      terminating_digit: options.terminatingDigit || "#",
    },
  });
}

// Conference Control API functions

export async function joinConference(
  callControlId: string,
  conferenceId: string,
  options: { muted?: boolean; onHold?: boolean } = {}
): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/conferences/${conferenceId}/actions/join`,
    body: {
      call_control_id: callControlId,
      mute: options.muted,
      hold: options.onHold,
    },
  });
}

export async function muteParticipant(
  conferenceId: string,
  callControlId: string
): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/conferences/${conferenceId}/actions/mute`,
    body: { call_control_ids: [callControlId] },
  });
}

export async function unmuteParticipant(
  conferenceId: string,
  callControlId: string
): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/conferences/${conferenceId}/actions/unmute`,
    body: { call_control_ids: [callControlId] },
  });
}

export async function holdParticipant(
  conferenceId: string,
  callControlId: string
): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/conferences/${conferenceId}/actions/hold`,
    body: { call_control_ids: [callControlId] },
  });
}

export async function unholdParticipant(
  conferenceId: string,
  callControlId: string
): Promise<void> {
  await telnyxApiRequest({
    method: "POST",
    path: `/conferences/${conferenceId}/actions/unhold`,
    body: { call_control_ids: [callControlId] },
  });
}

// Utility to check if Telnyx is configured
export { hasTelnyxConfig };
