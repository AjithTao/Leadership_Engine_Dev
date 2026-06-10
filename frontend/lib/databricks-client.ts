/**
 * Databricks RAG Client
 * 
 * Calls Databricks Model Serving endpoint for RAG queries
 * Handles authentication, request formatting, and response parsing
 */

export interface Citation {
  title: string;
  url: string;
  confidence: number;
  source_type: "confluence" | "jira" | "unknown";
}

export interface RAGResponse {
  answer: string;
  citations: Citation[];
  context_used: number;
  timestamp?: string;
  model?: string;
  retrieval_status?: "success" | "no_docs_found" | "llm_error" | string;
  error?: string;
}

export interface RAGError {
  message: string;
  code?: string;
  timestamp?: string;
}

/**
 * Query the Databricks RAG endpoint
 * 
 * @param query - The user's question
 * @param options - Optional configuration
 * @returns RAG response with answer and citations
 * 
 * @example
 * const response = await queryRagEndpoint("What are best practices for delegation?");
 * console.log(response.answer);  // "Based on the documentation..."
 * console.log(response.citations);  // Array of sources
 */
export async function queryRagEndpoint(
  query: string,
  options?: {
    maxRetries?: number;
    timeoutMs?: number;
    numDocuments?: number;
  }
): Promise<RAGResponse> {
  const endpoint = process.env.NEXT_PUBLIC_BACKEND_URL;
  const token = process.env.NEXT_PUBLIC_DATABRICKS_TOKEN;

  // Validate configuration
  if (!endpoint || !token) {
    const error: RAGError = {
      message:
        "Databricks endpoint or token not configured. Check NEXT_PUBLIC_BACKEND_URL and NEXT_PUBLIC_DATABRICKS_TOKEN in .env.local",
      code: "CONFIG_ERROR",
    };
    console.error("❌", error.message);
    throw new Error(error.message);
  }

  const maxRetries = options?.maxRetries ?? 2;
  const timeoutMs = options?.timeoutMs ?? 30000;
  const numDocuments = options?.numDocuments ?? 5;

  // Validate query
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    throw new Error("Query cannot be empty");
  }

  // Build request payload
  const payload = {
    dataframe_records: [
      {
        query: trimmedQuery,
      },
    ],
  };

  // Build endpoint URL (remove /invocations if present in NEXT_PUBLIC_BACKEND_URL)
  let url = endpoint;
  if (!url.endsWith("/invocations")) {
    url = `${url.replace(/\/$/, "")}/invocations`;
  }

  let lastError: Error | null = null;

  // Retry logic
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[RAG] Attempt ${attempt}/${maxRetries}: Querying "${trimmedQuery.substring(0, 50)}..."`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check if response is OK
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP ${response.status}: ${response.statusText}\n${errorText}`
        );
      }

      // Parse response
      const data = await response.json();

      // Extract prediction from response
      // Databricks Model Serving returns { predictions: [{...}] } or direct array
      let result: any = null;

      if (data.predictions && Array.isArray(data.predictions)) {
        result = data.predictions[0];
      } else if (Array.isArray(data) && data.length > 0) {
        result = data[0];
      } else if (typeof data === "object") {
        result = data;
      }

      if (!result) {
        throw new Error("Invalid response format from RAG endpoint");
      }

      // Check for errors in result
      if (result.error) {
        throw new Error(result.error);
      }

      // Build response object
      const ragResponse: RAGResponse = {
        answer: result.answer || "No answer generated",
        citations: (result.citations || []).map((cite: any) => ({
          title: cite.title || "Unknown",
          url: cite.url || "",
          confidence: typeof cite.confidence === "number" ? cite.confidence : cite.score || 0,
          source_type: cite.source_type || "confluence",
        })),
        context_used: result.context_used || 0,
        timestamp: result.timestamp,
        model: result.model,
        retrieval_status: result.retrieval_status,
      };

      console.log("✅ RAG query successful:", {
        answerLength: ragResponse.answer.length,
        citationCount: ragResponse.citations.length,
        contextUsed: ragResponse.context_used,
      });

      return ragResponse;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on config errors
      if (lastError.message.includes("CONFIG_ERROR")) {
        throw lastError;
      }

      // Log retry attempt
      if (attempt < maxRetries) {
        console.warn(
          `⚠️ RAG attempt ${attempt} failed: ${lastError.message}. Retrying...`
        );
        // Exponential backoff: 1s, 2s, 4s...
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt - 1) * 1000));
      }
    }
  }

  // All retries exhausted
  const finalError = `RAG query failed after ${maxRetries} attempts: ${lastError?.message}`;
  console.error("❌", finalError);
  throw new Error(finalError);
}

/**
 * Check if RAG endpoint is available
 * 
 * @returns true if endpoint is accessible, false otherwise
 */
export async function checkRagEndpointHealth(): Promise<boolean> {
  const endpoint = process.env.NEXT_PUBLIC_BACKEND_URL;
  const token = process.env.NEXT_PUBLIC_DATABRICKS_TOKEN;

  if (!endpoint || !token) {
    console.warn("RAG endpoint not configured");
    return false;
  }

  try {
    // Try a simple query with a short timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataframe_records: [{ query: "test" }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    return response.ok;
  } catch (error) {
    console.warn("RAG health check failed:", error);
    return false;
  }
}

/**
 * Batch query multiple questions
 * 
 * @param queries - Array of questions
 * @returns Array of RAG responses
 */
export async function batchQueryRag(queries: string[]): Promise<RAGResponse[]> {
  const endpoint = process.env.NEXT_PUBLIC_BACKEND_URL;
  const token = process.env.NEXT_PUBLIC_DATABRICKS_TOKEN;

  if (!endpoint || !token) {
    throw new Error("Databricks endpoint or token not configured");
  }

  try {
    let url = endpoint;
    if (!url.endsWith("/invocations")) {
      url = `${url.replace(/\/$/, "")}/invocations`;
    }

    const payload = {
      dataframe_records: queries.map((query) => ({
        query: query.trim(),
      })),
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const predictions = data.predictions || data;

    return predictions.map((result: any) => ({
      answer: result.answer || "No answer generated",
      citations: (result.citations || []).map((cite: any) => ({
        title: cite.title || "Unknown",
        url: cite.url || "",
        confidence: typeof cite.confidence === "number" ? cite.confidence : 0,
        source_type: cite.source_type || "confluence",
      })),
      context_used: result.context_used || 0,
      timestamp: result.timestamp,
      model: result.model,
      retrieval_status: result.retrieval_status,
    }));
  } catch (error) {
    console.error("Batch RAG query failed:", error);
    throw error;
  }
}

/**
 * Format a RAG response for display in UI
 * 
 * @param response - RAG response object
 * @returns Formatted display string
 */
export function formatRagResponse(response: RAGResponse): string {
  let output = response.answer || "No answer generated";

  if (response.citations && response.citations.length > 0) {
    output += "\n\n**Sources:**\n";
    response.citations.forEach((cite, idx) => {
      const confidence = (cite.confidence * 100).toFixed(0);
      output += `${idx + 1}. [${cite.title}](${cite.url}) (${confidence}% confidence)\n`;
    });
  }

  return output;
}
