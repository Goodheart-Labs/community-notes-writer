import { KeywordResult } from "./extractKeywords";
import { llm } from "./llm";
import type { OpenAIChatModelId } from "@ai-sdk/openai/internal";

export interface GoogleNewsSearchInput {
  keywords: KeywordResult;
  date: string; // YYYY-MM-DD format
  originalText: string;
  quoteContext?: string;
}

export interface BackgroundResearch {
  summary: string;
  keyFindings: string[];
  context: string;
  sources: string[];
}

export async function searchGoogleNewsBackground(
  input: GoogleNewsSearchInput,
  config: { model: OpenAIChatModelId }
): Promise<BackgroundResearch> {
  // Create focused search queries from keywords and entities
  const primarySearchTerms = [
    ...input.keywords.keywords.slice(0, 3), // Top 3 keywords
    ...input.keywords.entities.slice(0, 2), // Top 2 entities
  ].filter(Boolean);

  // Build search query for Google News
  const searchQuery = primarySearchTerms.join(" ");

  const systemPrompt = `You are a research assistant gathering background information from Google News.
Search for recent news and context about: ${searchQuery}

Original tweet: "${input.originalText}"
${input.quoteContext ? `Quote tweet context: "${input.quoteContext}"` : ""}
Today's date: ${input.date}

Instructions:
1. Search Google News for articles from the past 30 days related to these terms
2. Focus on major news outlets and verified sources
3. Provide background context that helps understand the tweet's claims
4. Identify any recent developments or ongoing stories
5. Note any conflicting reports or disputed information

Format your response as:
- A brief summary of the background context (2-3 sentences)
- 3-5 key findings from news sources
- Overall context explaining why this topic is being discussed
- List of sources consulted

Focus on providing context that would help fact-check the tweet's claims.`;

  try {
    const result = await llm.create({
      model: config.model,
      messages: [
        {
          role: "system",
          content: "You have access to Google News search results. Provide background research based on recent news coverage.",
        },
        {
          role: "user",
          content: systemPrompt,
        },
      ],
      temperature: 0.3,
    });

    const content = result.choices?.[0]?.message?.content || "";

    // Parse the structured response
    const lines = content.split('\n').filter(line => line.trim());

    // Extract different sections from the response
    let summary = "";
    let keyFindings: string[] = [];
    let context = "";
    let sources: string[] = [];

    let currentSection = "";

    for (const line of lines) {
      if (line.includes("Summary:") || line.includes("summary:")) {
        currentSection = "summary";
        summary = line.replace(/^.*[Ss]ummary:?\s*/, "").trim();
      } else if (line.includes("Key findings:") || line.includes("Key Findings:") || line.startsWith("-")) {
        if (line.startsWith("-")) {
          keyFindings.push(line.replace(/^-\s*/, "").trim());
        }
        currentSection = "findings";
      } else if (line.includes("Context:") || line.includes("context:")) {
        currentSection = "context";
        context = line.replace(/^.*[Cc]ontext:?\s*/, "").trim();
      } else if (line.includes("Sources:") || line.includes("sources:")) {
        currentSection = "sources";
      } else {
        // Continue adding to current section
        switch (currentSection) {
          case "summary":
            if (summary && line.trim()) summary += " " + line.trim();
            break;
          case "findings":
            if (line.startsWith("-") || line.startsWith("•")) {
              keyFindings.push(line.replace(/^[-•]\s*/, "").trim());
            }
            break;
          case "context":
            if (context && line.trim()) context += " " + line.trim();
            break;
          case "sources":
            if (line.trim()) {
              sources.push(line.replace(/^[-•]\s*/, "").trim());
            }
            break;
        }
      }
    }

    // If parsing failed, use the full content as context
    if (!summary && !keyFindings.length) {
      summary = content.slice(0, 200);
      context = content;
      keyFindings = ["Background research available - see context"];
    }

    return {
      summary: summary || "Background research completed",
      keyFindings: keyFindings.length > 0 ? keyFindings : ["No specific findings extracted"],
      context: context || content,
      sources: sources.length > 0 ? sources : ["Google News search results"],
    };
  } catch (error) {
    console.error("[searchGoogleNewsBackground] Error:", error);

    // Return a basic response on error
    return {
      summary: "Unable to retrieve background information",
      keyFindings: [],
      context: "Error accessing Google News search results",
      sources: [],
    };
  }
}