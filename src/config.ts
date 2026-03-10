/**
 * Configuration & Model Settings
 * ================================
 * Centralized config for all agents, models, and runtime parameters.
 * Uses DeepSeek-V3 as the primary LLM provider (OpenAI-compatible API).
 */

import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { createOpenAI } from "@ai-sdk/openai";

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? "";

export const LLMConfig = {
  researchModel: process.env.RESEARCH_MODEL ?? "deepseek-chat",
  analysisModel: process.env.ANALYSIS_MODEL ?? "deepseek-chat",
  reportModel: process.env.REPORT_MODEL ?? "deepseek-chat",
  temperature: 0.1,
} as const;

/**
 * Create a ChatOpenAI instance configured for DeepSeek.
 * Used by LangChain-based agents (crews, skills, etc.)
 */
export function createLLM(opts: { model?: string; temperature?: number } = {}) {
  return new ChatOpenAI({
    model: opts.model ?? LLMConfig.analysisModel,
    temperature: opts.temperature ?? LLMConfig.temperature,
    configuration: {
      baseURL: DEEPSEEK_BASE_URL,
      apiKey: DEEPSEEK_API_KEY,
    },
  });
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
