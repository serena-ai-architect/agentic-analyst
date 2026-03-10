/**
 * Type Definitions
 * =================
 * Shared types for the entire multi-agent system.
 * TypeScript's type system is a key advantage over Python —
 * it catches agent state mismatches at compile time.
 */

import { Annotation } from "@langchain/langgraph";

// ═══════════════════════════════════════════════════════════════
// LangGraph State (using Annotation API)
// ═══════════════════════════════════════════════════════════════

/**
 * LangGraph.js uses the Annotation API for state definition.
 * This is equivalent to Python's TypedDict + Annotated reducers.
 *
 * The `reducer` field defines how values merge when multiple
 * nodes write to the same key:
 *   - undefined (default): last-write-wins
 *   - (a, b) => [...a, ...b]: append-only list
 */
export const AgentStateAnnotation = Annotation.Root({
  // ── Input ─────────────────────────────────────────────
  company: Annotation<string>,
  query: Annotation<string>,
  mode: Annotation<"quick" | "full">,

  // ── Dynamic Planning ──────────────────────────────────
  executionPlan: Annotation<string>,
  historicalContext: Annotation<string>,

  // ── Research Phase ────────────────────────────────────
  researchData: Annotation<Record<string, unknown>>,
  researchSources: Annotation<string[]>({
    reducer: (a, b) => [...(a ?? []), ...b],
    default: () => [],
  }),
  researchSummary: Annotation<string>,

  // ── Analysis Phase ────────────────────────────────────
  financialAnalysis: Annotation<string>,
  marketAnalysis: Annotation<string>,
  techAnalysis: Annotation<string>,

  // ── Risk Phase ────────────────────────────────────────
  riskAssessment: Annotation<string>,
  riskScore: Annotation<number>,

  // ── Report Phase ──────────────────────────────────────
  draftReport: Annotation<string>,
  finalReport: Annotation<string>,

  // ── Reflexion ─────────────────────────────────────────
  reflexionMemory: Annotation<string>,

  // ── Process Reward ────────────────────────────────────
  stepEvaluations: Annotation<string[]>({
    reducer: (a, b) => [...(a ?? []), ...b],
    default: () => [],
  }),

  // ── Delivery (MCP) ───────────────────────────────────
  deliveryStatus: Annotation<string>,

  // ── Quality & Control ─────────────────────────────────
  qualityScore: Annotation<number>,
  qualityFeedback: Annotation<string>,
  humanFeedback: Annotation<string>,
  iterationCount: Annotation<number>,

  // ── Metadata ──────────────────────────────────────────
  errors: Annotation<string[]>({
    reducer: (a, b) => [...(a ?? []), ...b],
    default: () => [],
  }),
  logs: Annotation<string[]>({
    reducer: (a, b) => [...(a ?? []), ...b],
    default: () => [],
  }),
  currentPhase: Annotation<string>,
});

/** Inferred type from the annotation — use this everywhere. */
export type AgentState = typeof AgentStateAnnotation.State;

// ═══════════════════════════════════════════════════════════════
// Domain Types
// ═══════════════════════════════════════════════════════════════

export interface StepEvaluation {
  stepName: string;
  score: number;
  dimensions: Record<string, number>;
  issues: string[];
  isBlocking: boolean;
  recommendation: "proceed" | "retry" | "skip_downstream" | "abort";
  details: string;
}

export interface ReflectionEntry {
  attemptNumber: number;
  taskDescription: string;
  outputSummary: string;
  score: number;
  reflection: string;
  actionItems: string[];
  timestamp: string;
}

export interface PlannedTask {
  type: TaskType;
  description: string;
  priority: "critical" | "high" | "medium" | "low" | "skip";
  reasoning: string;
  status: "pending" | "running" | "completed" | "skipped";
}

export type TaskType =
  | "research"
  | "financial_analysis"
  | "market_analysis"
  | "tech_analysis"
  | "risk_assessment"
  | "competitor_deep_dive"
  | "regulatory_analysis"
  | "report_generation"
  | "delivery";

export interface LLMCallRecord {
  agentName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  phase: string;
  success: boolean;
  timestamp: string;
}

export interface CostReport {
  totalCost: number;
  totalTokens: number;
  totalCalls: number;
  byAgent: Record<string, { cost: number; calls: number }>;
  byPhase: Record<string, number>;
  optimizations: string[];
}
