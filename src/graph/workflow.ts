/**
 * LangGraph.js Workflow Builder
 * ===============================
 * Constructs the state machine that orchestrates all crews, agents, and skills.
 *
 * This is the JS equivalent of Python's workflow.py and workflow_v2.py.
 *
 * Key LangGraph.js differences from Python:
 *   - Uses Annotation API instead of TypedDict
 *   - Conditional edges use string returns (same concept)
 *   - MemorySaver works identically
 *   - Streaming uses async iterators (very natural in JS)
 *
 * Graph:
 *   START → planning → notionContext → research → analysis →
 *   [risk or report] → report → reflexion → [retry or delivery] →
 *   delivery → finalize → END
 */

import { StateGraph, START, END, MemorySaver } from "@langchain/langgraph";
import { AgentStateAnnotation, type AgentState } from "../types/index.js";
import { WorkflowConfig } from "../config.js";
import {
  planningNode,
  notionContextNode,
  researchNode,
  analysisNode,
  riskNode,
  reportNode,
  reflexionNode,
  deliveryNode,
  finalizeNode,
} from "./nodes.js";

// ═══════════════════════════════════════════════════════════════
// Conditional Edge Functions
// ═══════════════════════════════════════════════════════════════

function shouldSkipRisk(state: AgentState): "risk" | "report" {
  return state.mode === "quick" ? "report" : "risk";
}

function routeAfterReflexion(state: AgentState): "report" | "delivery" {
  const score = state.qualityScore ?? 0;
  const iterations = state.iterationCount ?? 0;

  if (score >= WorkflowConfig.qualityThreshold) return "delivery";
  if (iterations < WorkflowConfig.maxIterations) return "report";
  return "delivery"; // Max iterations → ship it
}

// ═══════════════════════════════════════════════════════════════
// Build Workflow
// ═══════════════════════════════════════════════════════════════

export function buildWorkflow() {
  const graph = new StateGraph(AgentStateAnnotation)
    // ── Add Nodes ──────────────────────────────────────────
    .addNode("planning", planningNode)
    .addNode("notionContext", notionContextNode)
    .addNode("research", researchNode)
    .addNode("analysis", analysisNode)
    .addNode("risk", riskNode)
    .addNode("report", reportNode)
    .addNode("reflexion", reflexionNode)
    .addNode("delivery", deliveryNode)
    .addNode("finalize", finalizeNode)

    // ── Define Edges ───────────────────────────────────────
    .addEdge(START, "planning")
    .addEdge("planning", "notionContext")
    .addEdge("notionContext", "research")
    .addEdge("research", "analysis")

    // Analysis → Risk or Report (conditional on mode)
    .addConditionalEdges("analysis", shouldSkipRisk, {
      risk: "risk",
      report: "report",
    })
    .addEdge("risk", "report")

    // Report → Reflexion
    .addEdge("report", "reflexion")

    // Reflexion → Retry or Delivery
    .addConditionalEdges("reflexion", routeAfterReflexion, {
      report: "report",
      delivery: "delivery",
    })

    // Delivery → Finalize → END
    .addEdge("delivery", "finalize")
    .addEdge("finalize", END);

  // ── Compile with checkpointer ──────────────────────────
  const checkpointer = new MemorySaver();
  return graph.compile({ checkpointer });
}

// ═══════════════════════════════════════════════════════════════
// Run Workflow (with streaming)
// ═══════════════════════════════════════════════════════════════

export async function runWorkflow(params: {
  company: string;
  query?: string;
  mode?: "quick" | "full";
  stream?: boolean;
}): Promise<AgentState> {
  const { company, query, mode = "full", stream = true } = params;

  const workflow = buildWorkflow();

  const initialState: Partial<AgentState> = {
    company,
    query: query ?? `Comprehensive investment analysis of ${company}`,
    mode,
    researchData: {},
    researchSources: [],
    researchSummary: "",
    financialAnalysis: "",
    marketAnalysis: "",
    techAnalysis: "",
    riskAssessment: "",
    riskScore: 0,
    draftReport: "",
    finalReport: "",
    qualityScore: 0,
    qualityFeedback: "",
    humanFeedback: "",
    iterationCount: 0,
    errors: [],
    logs: [],
    currentPhase: "initialized",
  };

  const config = {
    configurable: {
      thread_id: `analysis-${company.toLowerCase().replace(/\s+/g, "-")}`,
    },
  };

  if (stream) {
    let finalState: AgentState | undefined;

    // LangGraph.js streaming — async iterator
    for await (const event of await workflow.stream(initialState, config)) {
      for (const [nodeName, nodeOutput] of Object.entries(event)) {
        const output = nodeOutput as Partial<AgentState>;
        const logs = output.logs ?? [];
        for (const log of logs) {
          console.log(`  ${log}`);
        }
        if (output.currentPhase) {
          console.log(`  📍 Phase: ${output.currentPhase}`);
        }
      }
      // Track latest state
      finalState = Object.values(event)[0] as AgentState;
    }

    return finalState!;
  } else {
    return (await workflow.invoke(initialState, config)) as AgentState;
  }
}
