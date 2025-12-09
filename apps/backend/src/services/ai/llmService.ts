/**
 * LLM Service - Gemini-Powered AI Agent and Copilot
 * 
 * Uses Google's Gemini model for:
 * 1. AI Agent - Intelligent customer responses (text chat & voice)
 * 2. AI Copilot - Dynamic real-time suggestions for human reps
 * 
 * Specialized for utility company customer service.
 */

import { GoogleGenerativeAI, GenerativeModel, Content } from "@google/generative-ai";
import { env, hasGeminiConfig } from "../../config/env.js";
import { smartSearch, type RelevantArticle } from "../copilot/ragService.js";
import type { TranscriptEntry, CopilotSuggestion } from "shared-types";

// Singleton Gemini client
let genAI: GoogleGenerativeAI | null = null;
let agentModel: GenerativeModel | null = null;
let copilotModel: GenerativeModel | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!hasGeminiConfig()) {
    throw new Error("Gemini is not configured. Set GEMINI_API_KEY in environment.");
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY!);
  }
  return genAI;
}

function getAgentModel(): GenerativeModel {
  if (!agentModel) {
    const client = getGeminiClient();
    agentModel = client.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: AGENT_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
        topP: 0.9,
      },
    });
  }
  return agentModel;
}

function getCopilotModel(): GenerativeModel {
  if (!copilotModel) {
    const client = getGeminiClient();
    copilotModel = client.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: COPILOT_SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 300,
        topP: 0.85,
      },
    });
  }
  return copilotModel;
}

// ===========================================
// System Prompts
// ===========================================

const AGENT_SYSTEM_PROMPT = `You are a friendly AI customer service assistant for a utility company (electricity and gas). Your name is "Utility Assistant".

SPECIALIZATION: Utility Customer Support
- Billing questions and bill explanations
- Payment options and arrangements
- Power outages and service interruptions
- Starting, stopping, or transferring service
- Meter questions and smart meters
- Energy efficiency and rebate programs
- Payment assistance programs (LIHEAP, hardship funds)

KEY POLICIES:
- Bills due 21 days after statement. Late fee: $10 or 1.5%.
- Payment methods: Online (free), Auto-pay ($2/mo discount), Phone ($2.50), Mail.
- New service: $35 standard, $75 same-day. Requires ID + SSN or $200 deposit.
- Reconnection: Pay balance + $50 fee ($100 same-day).
- Payment plans: 3-12 months. Must stay current on new charges.

EMERGENCY PROTOCOL (GAS):
If customer mentions gas smell, leak, rotten egg odor:
1. IMMEDIATELY tell them to leave the building
2. Do NOT operate any electrical switches
3. Call 911 and 1-800-GAS-LEAK from outside
4. This is the HIGHEST PRIORITY - address it before anything else

RESPONSE STYLE:
- Be concise: 2-3 sentences for simple questions
- Use bullet points for lists or options
- Be empathetic and solution-focused
- If you can't help, offer to connect to a human representative
- Don't make up information - say "I'd need to verify that" if unsure

LIMITATIONS:
- Cannot access actual customer accounts
- Cannot process real payments
- Cannot dispatch technicians
- Cannot promise credits over $25 without supervisor`;

const COPILOT_SYSTEM_PROMPT = `You are an AI copilot assisting a human customer service representative at a utility company. Provide brief, actionable insights.

YOUR ROLE:
- Analyze the conversation and provide helpful context
- Suggest relevant responses or actions
- Alert to important issues (frustration, emergencies)
- Include relevant policy snippets when useful

OUTPUT FORMAT - Always respond with this JSON structure:
{
  "insight": "Brief 1-2 sentence summary of what's happening",
  "suggestion": "What the rep should consider doing (1-2 sentences)",
  "snippet": "Relevant policy or info snippet if applicable (optional, 1-2 sentences max)",
  "priority": "low|medium|high|critical",
  "type": "info|action|warning"
}

PRIORITY LEVELS:
- critical: Gas emergency, safety issue
- high: Frustrated customer, billing dispute, disconnection
- medium: Payment arrangement, high bill concern
- low: General inquiry, routine request

ONLY PROVIDE NEW INSIGHTS when:
- Customer reveals new information
- Sentiment changes significantly  
- A new topic/intent is detected
- Action is needed from the rep

Keep snippets VERY brief - just the essential policy point, not full explanations.`;

// ===========================================
// Conversation Context
// ===========================================

interface ConversationContext {
  sessionId: string;
  transcript: TranscriptEntry[];
  lastAnalyzedIndex: number;
  detectedIntents: string[];
  customerSentiment: 'positive' | 'neutral' | 'negative' | 'frustrated';
  isEmergency: boolean;
  lastCopilotUpdate: number;
}

// Context cache
const contextCache = new Map<string, ConversationContext>();

function getContext(sessionId: string): ConversationContext {
  let context = contextCache.get(sessionId);
  if (!context) {
    context = {
      sessionId,
      transcript: [],
      lastAnalyzedIndex: 0,
      detectedIntents: [],
      customerSentiment: 'neutral',
      isEmergency: false,
      lastCopilotUpdate: 0,
    };
    contextCache.set(sessionId, context);
  }
  return context;
}

function updateContextFromTranscript(context: ConversationContext, transcript: TranscriptEntry[]): void {
  context.transcript = transcript;
  
  // Detect emergency
  const allText = transcript.map(t => t.text.toLowerCase()).join(" ");
  context.isEmergency = 
    allText.includes("gas leak") ||
    allText.includes("smell gas") ||
    allText.includes("rotten egg") ||
    allText.includes("gas smell");
  
  // Detect sentiment from recent customer messages
  const recentCustomer = transcript
    .filter(t => t.speaker === "CUSTOMER")
    .slice(-3)
    .map(t => t.text.toLowerCase())
    .join(" ");
  
  const frustratedWords = ["ridiculous", "unacceptable", "terrible", "furious", "angry", "worst", "sue"];
  const negativeWords = ["frustrated", "annoyed", "disappointed", "unhappy", "problem", "wrong"];
  
  if (frustratedWords.some(w => recentCustomer.includes(w))) {
    context.customerSentiment = 'frustrated';
  } else if (negativeWords.some(w => recentCustomer.includes(w))) {
    context.customerSentiment = 'negative';
  } else {
    context.customerSentiment = 'neutral';
  }
}

// ===========================================
// AI Agent - Customer-Facing Responses
// ===========================================

export interface AIAgentResponse {
  message: string;
  shouldEscalate: boolean;
  escalationReason?: string;
  confidence: number;
}

/**
 * Generate AI agent response using Gemini
 */
export async function generateAgentResponse(
  sessionId: string,
  transcript: TranscriptEntry[]
): Promise<AIAgentResponse> {
  const context = getContext(sessionId);
  updateContextFromTranscript(context, transcript);
  
  // Handle emergency immediately
  if (context.isEmergency) {
    return {
      message: "⚠️ **SAFETY ALERT**\n\nIf you smell gas:\n• Leave the building immediately\n• Don't turn on/off any switches\n• Call 911 from outside\n• Call our emergency line: 1-800-GAS-LEAK\n\nI'm connecting you with our emergency team right now.",
      shouldEscalate: true,
      escalationReason: "GAS_EMERGENCY",
      confidence: 1.0,
    };
  }
  
  // Check for human request
  const lastMessage = transcript[transcript.length - 1]?.text.toLowerCase() || "";
  if (
    lastMessage.includes("human") ||
    lastMessage.includes("representative") ||
    lastMessage.includes("real person") ||
    lastMessage.includes("speak to someone") ||
    lastMessage.includes("agent")
  ) {
    return {
      message: "Of course! Let me connect you with a customer service representative. They'll be with you in just a moment.",
      shouldEscalate: true,
      escalationReason: "CUSTOMER_REQUEST",
      confidence: 1.0,
    };
  }
  
  // Use Gemini if available
  if (hasGeminiConfig()) {
    try {
      return await generateGeminiAgentResponse(transcript);
    } catch (error) {
      console.error("Gemini agent error:", error);
    }
  }
  
  // Fallback response
  return {
    message: "Thank you for contacting us! I can help with billing, payments, outages, and service questions. What would you like help with?",
    shouldEscalate: false,
    confidence: 0.5,
  };
}

async function generateGeminiAgentResponse(transcript: TranscriptEntry[]): Promise<AIAgentResponse> {
  const model = getAgentModel();
  
  // Build conversation history
  const history: Content[] = transcript.slice(0, -1).map(entry => ({
    role: entry.speaker === "CUSTOMER" ? "user" : "model",
    parts: [{ text: entry.text }],
  }));
  
  // Get the last customer message
  const lastMessage = transcript[transcript.length - 1];
  if (!lastMessage || lastMessage.speaker !== "CUSTOMER") {
    return {
      message: "How can I help you today?",
      shouldEscalate: false,
      confidence: 0.6,
    };
  }
  
  // Search knowledge base for context
  const articles = await smartSearch(lastMessage.text, 2);
  let contextInfo = "";
  if (articles.length > 0) {
    contextInfo = `\n\nRelevant info from knowledge base:\n${articles.map(a => `- ${a.title}: ${a.content.substring(0, 150)}...`).join("\n")}`;
  }
  
  const chat = model.startChat({ history });
  const result = await chat.sendMessage(lastMessage.text + contextInfo);
  const responseText = result.response.text();
  
  // Check if response suggests escalation
  const shouldEscalate = 
    responseText.toLowerCase().includes("connect you with") ||
    responseText.toLowerCase().includes("transfer you") ||
    responseText.toLowerCase().includes("human representative");
  
  return {
    message: responseText,
    shouldEscalate,
    escalationReason: shouldEscalate ? "AI_SUGGESTED" : undefined,
    confidence: 0.9,
  };
}

// ===========================================
// AI Copilot - Agent-Facing Suggestions
// ===========================================

export interface CopilotAnalysis {
  suggestions: CopilotSuggestion[];
  contextSummary: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  recommendedAction?: string;
}

interface GeminiCopilotResponse {
  insight: string;
  suggestion: string;
  snippet?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'info' | 'action' | 'warning';
}

/**
 * Generate dynamic copilot analysis using Gemini
 * Only updates when new information is needed
 */
export async function generateCopilotAnalysis(
  sessionId: string,
  transcript: TranscriptEntry[]
): Promise<CopilotAnalysis> {
  const context = getContext(sessionId);
  updateContextFromTranscript(context, transcript);
  
  // Check if we need to update (new messages since last analysis)
  const needsUpdate = 
    transcript.length > context.lastAnalyzedIndex ||
    context.isEmergency ||
    context.customerSentiment === 'frustrated';
  
  if (!needsUpdate && context.lastCopilotUpdate > 0) {
    // No new info, return minimal response
    return {
      suggestions: [],
      contextSummary: `${transcript.length} messages | Sentiment: ${context.customerSentiment}`,
      priority: 'low',
    };
  }
  
  // Update tracking
  context.lastAnalyzedIndex = transcript.length;
  context.lastCopilotUpdate = Date.now();
  
  const suggestions: CopilotSuggestion[] = [];
  let priority: CopilotAnalysis['priority'] = 'low';
  
  // Emergency takes precedence
  if (context.isEmergency) {
    suggestions.push({
      type: "ACTION",
      title: "🚨 GAS EMERGENCY",
      content: "Customer reporting potential gas leak. Follow emergency protocol immediately.",
      confidenceScore: 1.0,
      metadata: { priority: "CRITICAL" },
    });
    return {
      suggestions,
      contextSummary: "EMERGENCY: Potential gas leak reported",
      priority: 'critical',
      recommendedAction: "Transfer to emergency dispatch immediately",
    };
  }
  
  // Use Gemini for dynamic analysis
  if (hasGeminiConfig() && transcript.length >= 2) {
    try {
      const geminiSuggestion = await generateGeminiCopilotSuggestion(transcript, context);
      if (geminiSuggestion) {
        priority = geminiSuggestion.priority;
        
        // Build suggestion with snippet
        let content = geminiSuggestion.insight;
        if (geminiSuggestion.suggestion) {
          content += `\n\n**Suggestion:** ${geminiSuggestion.suggestion}`;
        }
        if (geminiSuggestion.snippet) {
          content += `\n\n📋 *${geminiSuggestion.snippet}*`;
        }
        
        suggestions.push({
          type: geminiSuggestion.type === 'warning' ? "ACTION" : "INFO",
          title: getTitleForType(geminiSuggestion.type, geminiSuggestion.priority),
          content,
          confidenceScore: getPriorityScore(geminiSuggestion.priority),
          metadata: { 
            priority: geminiSuggestion.priority.toUpperCase(),
            source: "gemini",
          },
        });
      }
    } catch (error) {
      console.error("Gemini copilot error:", error);
    }
  }
  
  // Add frustration alert if detected
  if (context.customerSentiment === 'frustrated' && !suggestions.some(s => s.title.includes('Frustrated'))) {
    suggestions.push({
      type: "ACTION",
      title: "⚠️ Customer Frustrated",
      content: "Customer appears frustrated. Acknowledge their feelings, apologize sincerely, and focus on solutions.\n\n📋 *Goodwill credit up to $25 within rep authority.*",
      confidenceScore: 0.9,
      metadata: { priority: "HIGH" },
    });
    priority = 'high';
  }
  
  return {
    suggestions,
    contextSummary: `${transcript.length} msgs | ${context.customerSentiment} sentiment`,
    priority,
    recommendedAction: suggestions.length > 0 ? suggestions[0].content.split('\n')[0] : undefined,
  };
}

async function generateGeminiCopilotSuggestion(
  transcript: TranscriptEntry[],
  context: ConversationContext
): Promise<GeminiCopilotResponse | null> {
  const model = getCopilotModel();
  
  // Get recent messages (last 4-6)
  const recentTranscript = transcript.slice(-6);
  const conversationText = recentTranscript
    .map(t => `${t.speaker}: ${t.text}`)
    .join("\n");
  
  // Search for relevant knowledge
  const lastCustomerMsg = [...transcript].reverse().find(t => t.speaker === "CUSTOMER")?.text || "";
  const articles = await smartSearch(lastCustomerMsg, 2);
  
  let kbContext = "";
  if (articles.length > 0) {
    kbContext = `\n\nRelevant policies:\n${articles.map(a => `- ${a.title}: ${a.content.substring(0, 100)}...`).join("\n")}`;
  }
  
  const prompt = `Analyze this utility customer service conversation and provide copilot assistance:

CONVERSATION:
${conversationText}

CONTEXT:
- Customer sentiment: ${context.customerSentiment}
- Message count: ${transcript.length}
${kbContext}

Respond with JSON only. Include a brief relevant policy snippet if it would help the rep.`;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as GeminiCopilotResponse;
      return parsed;
    }
  } catch (error) {
    console.error("Gemini copilot parse error:", error);
  }
  
  return null;
}

function getTitleForType(type: string, priority: string): string {
  if (priority === 'critical') return "🚨 Critical Alert";
  if (priority === 'high') return "⚠️ Important";
  if (type === 'warning') return "⚡ Action Needed";
  if (type === 'action') return "💡 Suggestion";
  return "📋 Info";
}

function getPriorityScore(priority: string): number {
  switch (priority) {
    case 'critical': return 1.0;
    case 'high': return 0.9;
    case 'medium': return 0.7;
    default: return 0.5;
  }
}

// ===========================================
// Context Management
// ===========================================

/**
 * Clear context for a session
 */
export function clearContext(sessionId: string): void {
  contextCache.delete(sessionId);
}

/**
 * Update context with new transcript
 */
export async function updateContext(
  sessionId: string,
  transcript: TranscriptEntry[]
): Promise<ConversationContext> {
  const context = getContext(sessionId);
  updateContextFromTranscript(context, transcript);
  return context;
}

/**
 * Check if LLM (Gemini) is available
 */
export function isLLMAvailable(): boolean {
  return hasGeminiConfig();
}
