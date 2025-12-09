/**
 * RAG (Retrieval-Augmented Generation) Service
 *
 * Uses pgvector for semantic search on knowledge base articles.
 * Powered by OpenAI embeddings for vector similarity.
 */

import OpenAI from "openai";
import { prisma } from "database";
import { env, hasOpenAIConfig } from "../../config/env.js";

// Singleton OpenAI client
let openaiClient: OpenAI | null = null;

/**
 * Get the OpenAI client instance
 */
function getOpenAIClient(): OpenAI {
  if (!hasOpenAIConfig()) {
    throw new Error(
      "OpenAI is not configured. Set OPENAI_API_KEY in environment."
    );
  }

  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: env.OPENAI_API_KEY!,
    });
  }

  return openaiClient;
}

/**
 * Knowledge article with relevance score
 */
export interface RelevantArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  similarity: number;
}

/**
 * Generate embedding for a text query
 *
 * @param text - Text to embed
 * @returns 1536-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient();

  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return response.data[0].embedding;
}

/**
 * Search knowledge base for relevant articles
 *
 * Uses pgvector cosine similarity to find matching articles.
 *
 * @param query - Search query (e.g., "how do I return an order?")
 * @param limit - Maximum number of results (default 3)
 * @param threshold - Minimum similarity score (default 0.7)
 * @returns Array of relevant articles with similarity scores
 */
export async function searchKnowledgeBase(
  query: string,
  limit = 3,
  threshold = 0.5
): Promise<RelevantArticle[]> {
  try {
    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(query);

    // Convert to pgvector format
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    // Perform cosine similarity search using raw SQL
    // pgvector <=> returns cosine distance in [0, 2]
    // Convert to similarity and clamp to [0, 1] for confidence scores
    // Formula: 1 - distance gives [-1, 1], then clamp negatives to 0
    const results = await prisma.$queryRaw<
      Array<{
        id: string;
        title: string;
        content: string;
        category: string;
        similarity: number;
      }>
    >`
      SELECT 
        id,
        title,
        content,
        category,
        GREATEST(0, LEAST(1, 1 - (embedding <=> ${embeddingStr}::vector))) as similarity
      FROM knowledge_articles
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT ${limit}
    `;

    // Filter by threshold and return
    return results
      .filter((r) => r.similarity >= threshold)
      .map((r) => ({
        id: r.id,
        title: r.title,
        content: r.content,
        category: r.category,
        similarity: Number(r.similarity),
      }));
  } catch (error) {
    console.error("❌ RAG search error:", error);
    return [];
  }
}

/**
 * Search knowledge base without embeddings (fallback)
 *
 * Uses simple text search when embeddings aren't available.
 *
 * @param query - Search query
 * @param limit - Maximum number of results
 * @returns Array of matching articles
 */
export async function searchKnowledgeBaseText(
  query: string,
  limit = 3
): Promise<RelevantArticle[]> {
  try {
    // Simple case-insensitive search
    const keywords = query.toLowerCase().split(" ").filter(Boolean);

    const articles = await prisma.knowledgeArticle.findMany({
      where: {
        OR: keywords.map((keyword) => ({
          OR: [
            { title: { contains: keyword, mode: "insensitive" as const } },
            { content: { contains: keyword, mode: "insensitive" as const } },
            { category: { contains: keyword, mode: "insensitive" as const } },
          ],
        })),
      },
      take: limit,
    });

    return articles.map((a) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      similarity: 0.5, // Default score for text search
    }));
  } catch (error) {
    console.error("❌ Text search error:", error);
    return [];
  }
}

/**
 * Smart search - uses vector search if available, falls back to text
 *
 * @param query - Search query
 * @param limit - Maximum number of results
 * @returns Array of relevant articles
 */
export async function smartSearch(
  query: string,
  limit = 3
): Promise<RelevantArticle[]> {
  // Try vector search first if OpenAI is configured
  if (hasOpenAIConfig()) {
    const results = await searchKnowledgeBase(query, limit);
    if (results.length > 0) {
      return results;
    }
  }

  // Fall back to text search
  return searchKnowledgeBaseText(query, limit);
}

/**
 * Get article by ID
 *
 * @param id - Article ID
 * @returns Article or null
 */
export async function getArticleById(
  id: string
): Promise<RelevantArticle | null> {
  try {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id },
    });

    if (!article) return null;

    return {
      id: article.id,
      title: article.title,
      content: article.content,
      category: article.category,
      similarity: 1.0,
    };
  } catch (error) {
    console.error("❌ Get article error:", error);
    return null;
  }
}

/**
 * Update article embedding
 *
 * Call this when adding/updating knowledge base articles.
 *
 * @param articleId - Article ID to update
 */
export async function updateArticleEmbedding(articleId: string): Promise<void> {
  if (!hasOpenAIConfig()) {
    console.warn("⚠️ OpenAI not configured, skipping embedding update");
    return;
  }

  try {
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
    });

    if (!article) {
      throw new Error(`Article not found: ${articleId}`);
    }

    // Generate embedding from title + content
    const textToEmbed = `${article.title}\n\n${article.content}`;
    const embedding = await generateEmbedding(textToEmbed);

    // Update using raw SQL (Prisma doesn't support vector type directly)
    const embeddingStr = `[${embedding.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE knowledge_articles
      SET embedding = ${embeddingStr}::vector
      WHERE id = ${articleId}
    `;

    console.log(`✅ Updated embedding for article: ${article.title}`);
  } catch (error) {
    console.error("❌ Update embedding error:", error);
    throw error;
  }
}

/**
 * Bulk update all article embeddings
 *
 * Useful for initial setup or re-indexing.
 */
export async function updateAllEmbeddings(): Promise<void> {
  if (!hasOpenAIConfig()) {
    console.warn("⚠️ OpenAI not configured, cannot update embeddings");
    return;
  }

  const articles = await prisma.knowledgeArticle.findMany();
  console.log(`📚 Updating embeddings for ${articles.length} articles...`);

  for (const article of articles) {
    try {
      await updateArticleEmbedding(article.id);
      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`Failed to update embedding for ${article.id}:`, error);
    }
  }

  console.log("✅ All embeddings updated");
}

// Re-export config check
export { hasOpenAIConfig };

