/**
 * Vercel AI SDK Streaming Server
 * ================================
 * This demonstrates the KEY JS ADVANTAGE over Python:
 * Production-ready streaming with minimal code.
 *
 * This file shows how the multi-agent system integrates with
 * a Next.js/Express backend for real-time streaming UI.
 *
 * In Python you'd need FastAPI + SSE + manual event formatting.
 * In JS, Vercel AI SDK handles all of this:
 *   - Token streaming
 *   - Tool call streaming
 *   - Structured data streaming
 *   - React hooks for frontend (useChat, useCompletion)
 *
 * Usage:
 *   // Next.js App Router (app/api/analyze/route.ts)
 *   import { analyzeCompany } from './streaming';
 *   export async function POST(req) { return analyzeCompany(req); }
 *
 *   // React Frontend
 *   const { messages } = useChat({ api: '/api/analyze' });
 */

import { streamText, generateText } from "ai";
import { deepseek } from "./config.js";

/**
 * Stream a company analysis using Vercel AI SDK.
 *
 * This is a simplified version that shows the streaming pattern.
 * In production, you'd integrate the full LangGraph workflow.
 */
export async function streamAnalysis(company: string) {
  const result = streamText({
    model: deepseek("deepseek-chat"),
    system:
      "You are a senior investment analyst. Provide comprehensive " +
      "analysis with specific data, numbers, and actionable insights.",
    prompt: `Generate a full investment analysis for ${company}. Include:
1. Executive Summary
2. Financial Analysis (with key metrics)
3. Market & Competitive Position
4. Risk Assessment
5. Investment Recommendation`,
    maxTokens: 4000,
  });

  return result;
}

/**
 * Stream with MCP tool integration via Vercel AI SDK.
 *
 * The AI SDK supports MCP servers natively — this is the
 * cleanest way to use MCP in production JS.
 */
export async function streamWithMCPTools(company: string) {
  const result = await generateText({
    model: deepseek("deepseek-chat"),
    system: "You are a research agent with access to business tools.",
    prompt: `Research ${company} and save findings to our knowledge base.`,
    tools: {
      // Vercel AI SDK tools (inline definition)
      saveToNotion: {
        description: "Save analysis to Notion knowledge base",
        parameters: {
          type: "object" as const,
          properties: {
            title: { type: "string" as const },
            content: { type: "string" as const },
          },
          required: ["title", "content"],
        },
        execute: async ({ title, content }: { title: string; content: string }) => {
          // In production: call Notion MCP server
          return { saved: true, url: `https://notion.so/${title}` };
        },
      },
    },
  });

  return result;
}

/**
 * Example: Next.js API route for streaming analysis
 *
 * // app/api/analyze/route.ts
 * import { streamAnalysis } from '@/lib/streaming';
 *
 * export async function POST(req: Request) {
 *   const { company } = await req.json();
 *   const result = await streamAnalysis(company);
 *   return result.toDataStreamResponse();
 * }
 *
 * // app/page.tsx (React client)
 * 'use client';
 * import { useChat } from 'ai/react';
 *
 * export default function AnalysisPage() {
 *   const { messages, input, handleSubmit, handleInputChange } = useChat({
 *     api: '/api/analyze',
 *   });
 *
 *   return (
 *     <div>
 *       {messages.map(m => (
 *         <div key={m.id} className={m.role === 'assistant' ? 'bg-gray-50' : ''}>
 *           {m.content}
 *         </div>
 *       ))}
 *       <form onSubmit={handleSubmit}>
 *         <input value={input} onChange={handleInputChange} />
 *         <button type="submit">Analyze</button>
 *       </form>
 *     </div>
 *   );
 * }
 */
