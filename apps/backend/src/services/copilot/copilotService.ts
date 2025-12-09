/**
 * Copilot Service - Utility Company Edition
 *
 * Provides real-time AI assistance to customer service representatives
 * for utility-related inquiries including billing, outages, service changes,
 * and emergencies.
 */

import type { CopilotSuggestion, TranscriptEntry } from "shared-types";
import {
  detectIntent,
  analyzeSentiment,
  hasAssemblyAIConfig,
  type DetectedIntent,
} from "./assemblyaiClient.js";
import { smartSearch, type RelevantArticle } from "./ragService.js";
import { emitCopilotSuggestion } from "../../sockets/agentGateway.js";

/**
 * Utility-specific intent types
 */
type UtilityIntent =
  | "billing_inquiry"      // Questions about bills, charges, usage
  | "payment_issue"        // Payment problems, arrangements, assistance
  | "outage_report"        // Power outage, service interruption
  | "gas_emergency"        // Gas leak, smell, safety concern
  | "new_service"          // Start new service, account setup
  | "stop_service"         // Disconnect, stop service
  | "transfer_service"     // Moving, transfer to new address
  | "high_bill"            // Unexpectedly high bill
  | "meter_question"       // Meter reading, smart meter
  | "payment_arrangement"  // Payment plan, budget billing
  | "assistance_program"   // LIHEAP, low-income, hardship
  | "reconnection"         // Service restoration after disconnect
  | "energy_efficiency"    // Rebates, savings tips, audits
  | "complaint"            // Service complaint, escalation
  | "general_inquiry";     // Other questions

/**
 * Configuration for the copilot
 */
interface CopilotConfig {
  minConfidence: number;
  maxSuggestions: number;
  sentimentThreshold: number;
}

const DEFAULT_CONFIG: CopilotConfig = {
  minConfidence: 0.5,
  maxSuggestions: 3,
  sentimentThreshold: -0.3,
};

/**
 * Process transcript and generate utility-specific suggestions
 */
export async function processTranscript(
  callId: string,
  transcript: TranscriptEntry[],
  config: Partial<CopilotConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (transcript.length < 2) {
    return;
  }

  const formattedTranscript = transcript.map((t) => ({
    speaker: t.speaker,
    text: t.text,
  }));

  // Run analysis in parallel
  const [intent, sentiment] = await Promise.all([
    hasAssemblyAIConfig()
      ? detectIntent(formattedTranscript)
      : fallbackUtilityIntentDetection(formattedTranscript),
    hasAssemblyAIConfig()
      ? analyzeSentiment(formattedTranscript)
      : { overall: "neutral" as const, score: 0, customerFrustration: false },
  ]);

  // Generate utility-specific suggestions
  const suggestions = await generateUtilitySuggestions(
    callId,
    intent,
    formattedTranscript,
    cfg
  );

  // Emit suggestions
  for (const suggestion of suggestions.slice(0, cfg.maxSuggestions)) {
    emitCopilotSuggestion(callId, suggestion);
  }

  // Emergency detection - highest priority
  if (intent.intent === "gas_emergency") {
    emitCopilotSuggestion(callId, {
      type: "ACTION",
      title: "🚨 POTENTIAL GAS EMERGENCY",
      content:
        "Customer may be reporting a gas leak. Follow emergency protocol:\n" +
        "1. Ask if they smell gas or hear hissing\n" +
        "2. Instruct them to leave building immediately\n" +
        "3. Do NOT operate switches or create sparks\n" +
        "4. Transfer to emergency dispatch if confirmed",
      confidenceScore: 1.0,
      metadata: { priority: "CRITICAL", protocol: "GAS_EMERGENCY" },
    });
  }

  // Frustration detection
  if (sentiment.customerFrustration || sentiment.score < cfg.sentimentThreshold) {
    emitCopilotSuggestion(callId, {
      type: "ACTION",
      title: "⚠️ Customer Frustration Detected",
      content:
        "The customer seems frustrated. Consider:\n" +
        "• Acknowledge their frustration sincerely\n" +
        "• Apologize for any inconvenience\n" +
        "• Focus on solutions, not policies\n" +
        "• Offer to escalate if needed\n" +
        "• Consider goodwill credit ($25-50) if appropriate",
      confidenceScore: 0.9,
      metadata: {
        sentiment: sentiment.overall,
        sentimentScore: String(sentiment.score),
      },
    });
  }
}

/**
 * Generate utility-specific suggestions based on detected intent
 */
async function generateUtilitySuggestions(
  callId: string,
  intent: DetectedIntent,
  transcript: Array<{ speaker: string; text: string }>,
  config: CopilotConfig
): Promise<CopilotSuggestion[]> {
  const suggestions: CopilotSuggestion[] = [];

  if (intent.confidence < config.minConfidence) {
    return suggestions;
  }

  const lastCustomerMessage = [...transcript]
    .reverse()
    .find((t) => t.speaker === "CUSTOMER");

  const searchQuery = getUtilitySearchQuery(intent, lastCustomerMessage?.text);
  const articles = searchQuery ? await smartSearch(searchQuery) : [];

  switch (intent.intent as UtilityIntent) {
    case "billing_inquiry":
      suggestions.push(createBillingInquirySuggestion(intent.entities, articles));
      break;

    case "payment_issue":
      suggestions.push(createPaymentIssueSuggestion(articles));
      break;

    case "outage_report":
      suggestions.push(createOutageSuggestion(intent.entities, articles));
      break;

    case "gas_emergency":
      // Handled above with priority
      break;

    case "new_service":
      suggestions.push(createNewServiceSuggestion(articles));
      break;

    case "stop_service":
    case "transfer_service":
      suggestions.push(createServiceChangeSuggestion(intent.intent, articles));
      break;

    case "high_bill":
      suggestions.push(createHighBillSuggestion(articles));
      break;

    case "meter_question":
      suggestions.push(createMeterSuggestion(articles));
      break;

    case "payment_arrangement":
      suggestions.push(createPaymentArrangementSuggestion(articles));
      break;

    case "assistance_program":
      suggestions.push(createAssistanceSuggestion(articles));
      break;

    case "reconnection":
      suggestions.push(createReconnectionSuggestion(articles));
      break;

    case "energy_efficiency":
      suggestions.push(createEfficiencySuggestion(articles));
      break;

    case "complaint":
      suggestions.push(createComplaintSuggestion(articles));
      break;

    default:
      if (articles.length > 0) {
        suggestions.push(createArticleSuggestion(articles));
      }
  }

  if (intent.suggestedAction) {
    suggestions.push({
      type: "ACTION",
      title: "💡 Suggested Action",
      content: intent.suggestedAction,
      confidenceScore: intent.confidence,
    });
  }

  return suggestions;
}

/**
 * Get search query based on utility intent
 */
function getUtilitySearchQuery(intent: DetectedIntent, lastMessage?: string): string {
  const queryMap: Record<string, string> = {
    billing_inquiry: "understanding utility bill charges",
    payment_issue: "payment options due date",
    outage_report: "power outage report restoration",
    gas_emergency: "gas leak emergency procedures",
    new_service: "starting new service connection",
    stop_service: "stopping service disconnection",
    transfer_service: "transferring moving service",
    high_bill: "high bill investigation usage",
    meter_question: "smart meter reading",
    payment_arrangement: "payment arrangement plan",
    assistance_program: "payment assistance LIHEAP low income",
    reconnection: "reconnection restore service",
    energy_efficiency: "energy efficiency rebates programs",
    complaint: "complaint resolution escalation",
  };

  return queryMap[intent.intent] || lastMessage || "";
}

// ===========================================
// Utility-Specific Suggestion Creators
// ===========================================

function createBillingInquirySuggestion(
  entities: Record<string, string>,
  articles: RelevantArticle[]
): CopilotSuggestion {
  const accountNumber = entities.account_number;
  const article = articles.find((a) => a.category === "BILLING");

  let content = "Customer is asking about their bill.\n\n";
  content += "**Verification Steps:**\n";
  content += "1. Verify account with name, address, or last 4 of SSN\n";
  content += "2. Pull up account in billing system\n";
  content += "3. Review current charges and usage\n\n";
  
  if (article) {
    content += `**Reference:** ${article.content.substring(0, 300)}...`;
  }

  return {
    type: "INFO",
    title: "💵 Billing Inquiry",
    content,
    confidenceScore: 0.85,
    metadata: accountNumber ? { accountNumber } : undefined,
  };
}

function createPaymentIssueSuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  const article = articles.find((a) => a.category === "PAYMENTS");

  let content = "Customer has a payment-related question.\n\n";
  content += "**Payment Options:**\n";
  content += "• Online/App: No fee, instant\n";
  content += "• Auto-Pay: $2/month discount\n";
  content += "• Phone: $2.50 fee\n";
  content += "• Mail: Allow 5-7 days\n\n";
  
  if (article) {
    content += `**Policy:** ${article.content.substring(0, 200)}...`;
  }

  return {
    type: "INFO",
    title: "💳 Payment Question",
    content,
    confidenceScore: 0.85,
  };
}

function createOutageSuggestion(
  entities: Record<string, string>,
  articles: RelevantArticle[]
): CopilotSuggestion {
  const address = entities.address;
  const article = articles.find((a) => a.category === "OUTAGES");

  let content = "**Customer reporting outage.**\n\n";
  content += "**Quick Checks:**\n";
  content += "1. Check outage map for known outages in area\n";
  content += "2. Ask if neighbors are also affected\n";
  content += "3. Verify breaker/fuse box checked\n\n";
  content += "**If Individual Outage:** May need service call ($75+ if customer-side issue)\n\n";
  content += "**If Area Outage:** Provide estimated restoration time from system\n\n";
  
  if (article) {
    content += `**Info:** ${article.content.substring(0, 200)}...`;
  }

  return {
    type: "ACTION",
    title: "⚡ Power Outage Report",
    content,
    confidenceScore: 0.9,
    metadata: address ? { address } : undefined,
  };
}

function createNewServiceSuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  const article = articles.find((a) => a.category === "NEW_SERVICE");

  let content = "Customer wants to start new service.\n\n";
  content += "**Required Information:**\n";
  content += "• Full name and contact info\n";
  content += "• Service address and move-in date\n";
  content += "• SSN (credit check) OR $200 deposit\n";
  content += "• Government-issued ID\n\n";
  content += "**Fees:**\n";
  content += "• Standard connection: $35\n";
  content += "• Same-day: $75\n";
  content += "• New meter install: $150-300\n\n";
  
  if (article) {
    content += `**Process:** ${article.content.substring(0, 200)}...`;
  }

  return {
    type: "INFO",
    title: "🏠 New Service Request",
    content,
    confidenceScore: 0.85,
  };
}

function createServiceChangeSuggestion(
  type: string,
  articles: RelevantArticle[]
): CopilotSuggestion {
  const isTransfer = type === "transfer_service";
  const article = articles.find((a) => a.category === "TRANSFER_SERVICE");

  let content = isTransfer
    ? "Customer is moving and wants to transfer service.\n\n"
    : "Customer wants to stop service.\n\n";
  
  content += "**Required Information:**\n";
  content += "• Current account number\n";
  content += `• ${isTransfer ? "Move-out and move-in dates" : "Service end date"}\n`;
  content += "• Forwarding address for final bill\n";
  content += isTransfer ? "• New service address\n\n" : "\n";
  content += "**Timeline:** 3-5 business days notice preferred\n";
  content += "**Final Bill:** Sent within 7 days, deposits applied\n";

  return {
    type: "INFO",
    title: isTransfer ? "🚚 Service Transfer" : "🛑 Stop Service",
    content,
    confidenceScore: 0.85,
  };
}

function createHighBillSuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  const article = articles.find((a) => a.category === "HIGH_BILL");

  let content = "Customer concerned about high bill.\n\n";
  content += "**Common Causes:**\n";
  content += "• Seasonal changes (AC in summer, heating in winter)\n";
  content += "• Rate adjustments\n";
  content += "• New appliances or more occupants\n";
  content += "• Estimated vs actual read correction\n";
  content += "• Equipment malfunction (HVAC, water heater)\n\n";
  content += "**Actions Available:**\n";
  content += "• Compare to same month last year\n";
  content += "• Free meter test request\n";
  content += "• Free home energy audit scheduling\n";
  content += "• Review rate plan options\n";
  
  if (article) {
    content += `\n\n**Details:** ${article.content.substring(0, 200)}...`;
  }

  return {
    type: "ACTION",
    title: "📈 High Bill Concern",
    content,
    confidenceScore: 0.9,
  };
}

function createMeterSuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  const article = articles.find((a) => a.category === "METERS");

  let content = "Customer has a meter question.\n\n";
  content += "**Smart Meter Info:**\n";
  content += "• Automatic daily readings\n";
  content += "• Usage visible in online account\n";
  content += "• Set high-usage alerts available\n\n";
  content += "**Common Questions:**\n";
  content += "• Safety: RF emissions far below FCC limits\n";
  content += "• Opt-out: $75 fee + $25/mo manual read fee\n";
  content += "• Testing: Free meter accuracy test available\n";

  return {
    type: "INFO",
    title: "📊 Meter Question",
    content,
    confidenceScore: 0.8,
  };
}

function createPaymentArrangementSuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  let content = "Customer needs payment arrangement.\n\n";
  content += "**Options:**\n";
  content += "• **Payment Plan:** Spread balance over 3-12 months\n";
  content += "• **Budget Billing:** Equal monthly payments\n";
  content += "• **Extension:** Up to 10 days for one-time hardship\n\n";
  content += "**Requirements:**\n";
  content += "• Current on new charges while paying arrangement\n";
  content += "• Automatic payments recommended\n";
  content += "• Defaulting voids arrangement\n\n";
  content += "**Note:** Check if customer qualifies for assistance programs.";

  return {
    type: "ACTION",
    title: "📅 Payment Arrangement",
    content,
    confidenceScore: 0.9,
  };
}

function createAssistanceSuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  const article = articles.find((a) => a.category === "ASSISTANCE");

  let content = "Customer may need assistance.\n\n";
  content += "**Available Programs:**\n";
  content += "• **LIHEAP:** Federal assistance, apply through Community Action\n";
  content += "• **Medical Baseline:** Extra low-rate energy for medical equipment\n";
  content += "• **Senior Discount:** 15% off base charge for 65+\n";
  content += "• **Hardship Fund:** One-time up to $300 forgiveness\n";
  content += "• **Winter Protection:** No disconnects Nov-Mar\n\n";
  content += "**Helpline:** 1-800-555-HELP for all assistance inquiries";

  return {
    type: "INFO",
    title: "🤝 Assistance Programs",
    content,
    confidenceScore: 0.9,
  };
}

function createReconnectionSuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  let content = "Customer needs service reconnected.\n\n";
  content += "**Requirements:**\n";
  content += "• Pay past-due balance OR enter payment arrangement\n";
  content += "• Reconnection fee: $50 (same-day $100)\n";
  content += "• Security deposit may be required (2x avg bill)\n\n";
  content += "**Timeline:**\n";
  content += "• Same day if paid by 3 PM\n";
  content += "• Otherwise within 24 hours\n\n";
  content += "**After Hours:** Emergency medical situations may qualify for temporary restoration.";

  return {
    type: "ACTION",
    title: "🔌 Reconnection Request",
    content,
    confidenceScore: 0.9,
  };
}

function createEfficiencySuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  const article = articles.find((a) => a.category === "EFFICIENCY");

  let content = "Customer interested in energy efficiency.\n\n";
  content += "**Popular Rebates:**\n";
  content += "• Smart thermostat: $50\n";
  content += "• ENERGY STAR appliances: $50-400\n";
  content += "• Heat pump: $500-800\n";
  content += "• Free LED bulb kit (up to 20)\n\n";
  content += "**Free Services:**\n";
  content += "• Home energy audit ($200 value)\n";
  content += "• Usage analysis and recommendations\n\n";
  content += "**Tip:** Low-income customers may qualify for free weatherization.";

  return {
    type: "INFO",
    title: "💡 Energy Efficiency",
    content,
    confidenceScore: 0.85,
  };
}

function createComplaintSuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  let content = "Customer is expressing a complaint.\n\n";
  content += "**Response Protocol:**\n";
  content += "1. Listen actively without interrupting\n";
  content += "2. Apologize sincerely for their experience\n";
  content += "3. Take ownership: \"I will help resolve this\"\n";
  content += "4. Offer concrete solution or timeline\n";
  content += "5. Follow up if promised\n\n";
  content += "**Escalation:**\n";
  content += "• Supervisor available for immediate escalation\n";
  content += "• Goodwill credits ($25-50) within rep authority\n";
  content += "• Formal complaint process available if requested";

  return {
    type: "ACTION",
    title: "⚠️ Customer Complaint",
    content,
    confidenceScore: 0.9,
  };
}

function createArticleSuggestion(
  articles: RelevantArticle[]
): CopilotSuggestion {
  const topArticle = articles[0];

  return {
    type: "INFO",
    title: `📚 ${topArticle.title}`,
    content: topArticle.content,
    confidenceScore: topArticle.similarity,
    metadata: {
      articleId: topArticle.id,
      category: topArticle.category,
    },
  };
}

/**
 * Fallback intent detection for utility-specific keywords
 */
function fallbackUtilityIntentDetection(
  transcript: Array<{ speaker: string; text: string }>
): DetectedIntent {
  const lastCustomerMessage = [...transcript]
    .reverse()
    .find((t) => t.speaker === "CUSTOMER")?.text?.toLowerCase() || "";

  // Gas emergency - highest priority
  if (
    lastCustomerMessage.includes("gas leak") ||
    lastCustomerMessage.includes("smell gas") ||
    lastCustomerMessage.includes("gas smell") ||
    lastCustomerMessage.includes("rotten egg")
  ) {
    return { intent: "gas_emergency", confidence: 0.95, entities: {} };
  }

  // Power outage
  if (
    lastCustomerMessage.includes("power out") ||
    lastCustomerMessage.includes("no power") ||
    lastCustomerMessage.includes("outage") ||
    lastCustomerMessage.includes("lights out") ||
    lastCustomerMessage.includes("electricity out")
  ) {
    return { intent: "outage_report", confidence: 0.85, entities: {} };
  }

  // High bill
  if (
    lastCustomerMessage.includes("high bill") ||
    lastCustomerMessage.includes("bill too high") ||
    lastCustomerMessage.includes("expensive") ||
    lastCustomerMessage.includes("bill went up") ||
    lastCustomerMessage.includes("usage spike")
  ) {
    return { intent: "high_bill", confidence: 0.8, entities: {} };
  }

  // Payment issues
  if (
    lastCustomerMessage.includes("can't pay") ||
    lastCustomerMessage.includes("payment plan") ||
    lastCustomerMessage.includes("payment arrangement") ||
    lastCustomerMessage.includes("extend") ||
    lastCustomerMessage.includes("behind on")
  ) {
    return { intent: "payment_arrangement", confidence: 0.8, entities: {} };
  }

  // Assistance
  if (
    lastCustomerMessage.includes("assistance") ||
    lastCustomerMessage.includes("help paying") ||
    lastCustomerMessage.includes("low income") ||
    lastCustomerMessage.includes("liheap") ||
    lastCustomerMessage.includes("hardship")
  ) {
    return { intent: "assistance_program", confidence: 0.8, entities: {} };
  }

  // Disconnection/Reconnection
  if (
    lastCustomerMessage.includes("disconnected") ||
    lastCustomerMessage.includes("turn back on") ||
    lastCustomerMessage.includes("reconnect") ||
    lastCustomerMessage.includes("service off")
  ) {
    return { intent: "reconnection", confidence: 0.85, entities: {} };
  }

  // New service
  if (
    lastCustomerMessage.includes("new service") ||
    lastCustomerMessage.includes("start service") ||
    lastCustomerMessage.includes("new account") ||
    lastCustomerMessage.includes("moving in")
  ) {
    return { intent: "new_service", confidence: 0.8, entities: {} };
  }

  // Transfer/Stop
  if (
    lastCustomerMessage.includes("moving") ||
    lastCustomerMessage.includes("transfer") ||
    lastCustomerMessage.includes("new address")
  ) {
    return { intent: "transfer_service", confidence: 0.75, entities: {} };
  }

  if (
    lastCustomerMessage.includes("stop service") ||
    lastCustomerMessage.includes("cancel service") ||
    lastCustomerMessage.includes("disconnect")
  ) {
    return { intent: "stop_service", confidence: 0.75, entities: {} };
  }

  // Billing general
  if (
    lastCustomerMessage.includes("bill") ||
    lastCustomerMessage.includes("charge") ||
    lastCustomerMessage.includes("statement")
  ) {
    return { intent: "billing_inquiry", confidence: 0.7, entities: {} };
  }

  // Payment general
  if (
    lastCustomerMessage.includes("pay") ||
    lastCustomerMessage.includes("payment") ||
    lastCustomerMessage.includes("due date")
  ) {
    return { intent: "payment_issue", confidence: 0.7, entities: {} };
  }

  // Meter
  if (
    lastCustomerMessage.includes("meter") ||
    lastCustomerMessage.includes("reading") ||
    lastCustomerMessage.includes("smart meter")
  ) {
    return { intent: "meter_question", confidence: 0.7, entities: {} };
  }

  // Energy efficiency
  if (
    lastCustomerMessage.includes("rebate") ||
    lastCustomerMessage.includes("save energy") ||
    lastCustomerMessage.includes("efficiency") ||
    lastCustomerMessage.includes("audit")
  ) {
    return { intent: "energy_efficiency", confidence: 0.7, entities: {} };
  }

  // Complaint indicators
  if (
    lastCustomerMessage.includes("angry") ||
    lastCustomerMessage.includes("frustrated") ||
    lastCustomerMessage.includes("terrible") ||
    lastCustomerMessage.includes("ridiculous") ||
    lastCustomerMessage.includes("unacceptable") ||
    lastCustomerMessage.includes("complaint")
  ) {
    return { intent: "complaint", confidence: 0.75, entities: {} };
  }

  return { intent: "general_inquiry", confidence: 0.5, entities: {} };
}

/**
 * Manually trigger a suggestion search
 */
export async function triggerSuggestion(
  callId: string,
  query: string
): Promise<void> {
  const articles = await smartSearch(query);

  if (articles.length > 0) {
    emitCopilotSuggestion(callId, createArticleSuggestion(articles));
  } else {
    emitCopilotSuggestion(callId, {
      type: "INFO",
      title: "🔍 No Results Found",
      content: `No knowledge base articles found for: "${query}"`,
      confidenceScore: 0,
    });
  }
}
