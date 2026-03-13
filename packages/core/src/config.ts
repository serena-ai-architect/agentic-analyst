/**
 * Configuration & Model Settings
 * ================================
 * Centralized config with multi-provider model routing.
 *
 * Supports DeepSeek, OpenAI, and Anthropic models via a single createLLM()
 * function that auto-detects the provider from the model name:
 *   - "deepseek-*" → DeepSeek API
 *   - "gpt-*" / "o1*" / "o3*" → OpenAI API
 *   - "claude-*" → Anthropic API
 *
 * Set per-stage models via environment variables. Default: all deepseek-chat.
 */

import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";

export function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

export const LLMConfig = {
  planningModel:    process.env.PLANNING_MODEL    ?? "deepseek-chat",
  researchModel:    process.env.RESEARCH_MODEL    ?? "deepseek-chat",
  analysisModel:    process.env.ANALYSIS_MODEL    ?? "deepseek-chat",
  reportModel:      process.env.REPORT_MODEL      ?? "deepseek-chat",
  translationModel: process.env.TRANSLATION_MODEL ?? "deepseek-chat",
  evaluationModel:  process.env.EVALUATION_MODEL  ?? "deepseek-chat",
  temperature: 0.1,
} as const;

/**
 * Detect LLM provider from model name.
 */
function detectProvider(model: string): "deepseek" | "openai" | "anthropic" {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) return "openai";
  return "deepseek";
}

/**
 * Create an LLM instance with automatic provider routing.
 *
 * Returns ChatOpenAI or ChatAnthropic — both implement BaseChatModel,
 * so bindTools(), withStructuredOutput(), invoke() all work identically.
 * All 9 downstream call sites require zero changes.
 */
export function createLLM(opts: { model?: string; temperature?: number } = {}) {
  const model = opts.model ?? LLMConfig.analysisModel;
  const temperature = opts.temperature ?? LLMConfig.temperature;
  const provider = detectProvider(model);

  switch (provider) {
    case "anthropic":
      return new ChatAnthropic({
        model,
        temperature,
        anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
      });

    case "openai":
      return new ChatOpenAI({
        model,
        temperature,
        openAIApiKey: process.env.OPENAI_API_KEY ?? "",
      });

    case "deepseek":
    default:
      return new ChatOpenAI({
        model,
        temperature,
        configuration: {
          baseURL: DEEPSEEK_BASE_URL,
          apiKey: DEEPSEEK_API_KEY,
        },
      });
  }
}

/**
 * Vercel AI SDK provider configured for DeepSeek.
 * Used by streaming.ts
 */
export const deepseek = createOpenAI({
  baseURL: DEEPSEEK_BASE_URL,
  apiKey: DEEPSEEK_API_KEY,
});

export const WorkflowConfig = {
  maxIterations: 3,
  qualityThreshold: 7.0,
  humanReviewEnabled: false,
  streamingEnabled: true,
} as const;

/**
 * Agent role definitions — used when constructing prompts.
 * In Python/CrewAI these go into Agent() constructors.
 * In JS/LangChain we inject them into system prompts.
 */
export const AGENT_ROLES = {
  webResearcher: {
    role: "Senior Web Researcher",
    goal: "Find comprehensive, up-to-date information about the target company",
    backstory:
      "You are a meticulous researcher with 15 years of experience in " +
      "financial journalism. You excel at finding primary sources, " +
      "cross-referencing data, and separating signal from noise.",
  },
  dataCollector: {
    role: "Financial Data Collector",
    goal: "Gather quantitative financial data, metrics, and market statistics",
    backstory:
      "You are a quantitative analyst who specializes in extracting " +
      "structured financial data — revenue, growth rates, P/E ratios, margins.",
  },
  summarizer: {
    role: "Research Synthesizer",
    goal: "Synthesize raw research into structured intelligence briefs",
    backstory:
      "You are an intelligence analyst who transforms raw information into " +
      "actionable insights. You identify key themes and information gaps.",
  },
  financialAnalyst: {
    role: "Senior Financial Analyst",
    goal: "Provide deep financial analysis including valuation and growth assessment",
    backstory:
      "You are a CFA charterholder with 20 years on Wall Street. " +
      "You specialize in fundamental analysis and DCF modeling.",
  },
  marketAnalyst: {
    role: "Market & Competitive Analyst",
    goal: "Analyze market dynamics, competitive landscape, and industry trends",
    backstory:
      "You are a strategy consultant with deep expertise in Porter's Five Forces, " +
      "TAM/SAM/SOM analysis, and competitive moat identification.",
  },
  techAnalyst: {
    role: "Technology & Innovation Analyst",
    goal: "Evaluate technology stack, R&D pipeline, and innovation potential",
    backstory:
      "You are a former CTO turned tech analyst. You understand technology moats, " +
      "platform effects, and can assess whether tech investments will pay off.",
  },
  riskAnalyst: {
    role: "Risk Assessment Specialist",
    goal: "Identify and quantify all material risks facing the company",
    backstory:
      "You are a risk management professional who has seen multiple market cycles. " +
      "You identify regulatory, operational, and geopolitical risks others miss.",
  },
  complianceAnalyst: {
    role: "Regulatory & Compliance Analyst",
    goal: "Assess regulatory environment and compliance risks",
    backstory:
      "You are a former SEC examiner who understands the regulatory landscape. " +
      "You identify compliance risks and potential regulatory headwinds.",
  },
  knowledgeManager: {
    role: "Knowledge Base Manager",
    goal: "Organize and store analysis for institutional memory",
    backstory:
      "You ensure every analysis is properly categorized and stored in Notion " +
      "for future reference. Institutional knowledge compounds over time.",
  },
  distributionCoordinator: {
    role: "Report Distribution Coordinator",
    goal: "Ensure the right stakeholders receive the analysis at the right time",
    backstory:
      "You coordinate email distribution, meeting scheduling, " +
      "and follow-up reminders for investment reports.",
  },
} as const;

export type AgentRole = keyof typeof AGENT_ROLES;

// ═══════════════════════════════════════════════════════════════
// Watchlist — companies to analyze in batch mode
// ═══════════════════════════════════════════════════════════════

export const WATCHLIST = [
  // US stocks (美股)
  { name: "NVIDIA",  ticker: "NVDA",    exchange: "US" as const },
  { name: "Apple",   ticker: "AAPL",    exchange: "US" as const },
  { name: "Google",  ticker: "GOOGL",   exchange: "US" as const },
  { name: "Micron",  ticker: "MU",      exchange: "US" as const },
  { name: "AMD",     ticker: "AMD",     exchange: "US" as const },
  { name: "Amazon",  ticker: "AMZN",    exchange: "US" as const },
  { name: "Alibaba", ticker: "BABA",    exchange: "US" as const },
  // HK stocks (港股)
  { name: "Tencent", ticker: "0700.HK", exchange: "HK" as const },
  { name: "BYD",     ticker: "1211.HK", exchange: "HK" as const },
  { name: "Xiaomi",  ticker: "1810.HK", exchange: "HK" as const },
];
