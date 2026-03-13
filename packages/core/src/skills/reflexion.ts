/**
 * Reflexion: Self-Improving Agent Pattern
 * =========================================
 * TypeScript implementation of Reflexion (Shinn et al., 2023).
 *
 * Architecture upgrade: replaced regex-based score extraction with
 * LLM structured output (Zod schema). Scores are now guaranteed to be
 * valid numbers, and action items are properly typed arrays.
 *
 * Pattern:
 *   Execute → Evaluate (structured output) → Reflect (structured output) →
 *   Store lessons → Retry with accumulated wisdom
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config.js";
import { z } from "zod";
import type { ReflectionEntry } from "../types/index.js";

// ── Structured Output Schemas ───────────────────────────────

const EvaluationSchema = z.object({
  completeness: z.number().min(0).max(2).describe("Score for all sections present with substance"),
  dataQuality: z.number().min(0).max(2).describe("Score for specific, current, sourced numbers"),
  analyticalDepth: z.number().min(0).max(2).describe("Score for beyond-surface, multi-perspective analysis"),
  actionability: z.number().min(0).max(2).describe("Score for clear recommendation and price targets"),
  writingQuality: z.number().min(0).max(2).describe("Score for professional tone and logical flow"),
  overall: z.number().min(1).max(10).describe("Total score summing all dimensions"),
  reasoning: z.string().describe("Brief explanation of the scoring"),
});

const ReflectionSchema = z.object({
  rootCauses: z.array(z.string()).max(3).describe("1-2 root causes of the score"),
  whatWorkedWell: z.string().describe("What to preserve from the current output"),
  actionItems: z.array(z.string()).max(5).describe("Specific, actionable improvements for next attempt"),
  priority: z.string().describe("Single highest-impact item to address first"),
  shouldRetry: z.boolean().describe("Whether the output should be regenerated"),
});

// ── Reflexion Memory ────────────────────────────────────────

export class ReflexionMemory {
  private reflections: ReflectionEntry[] = [];
  private maxReflections: number;

  constructor(maxReflections = 10) {
    this.maxReflections = maxReflections;
  }

  add(entry: ReflectionEntry): void {
    this.reflections.push(entry);
    if (this.reflections.length > this.maxReflections) {
      this.reflections.shift();
    }
  }

  formatForPrompt(): string {
    if (this.reflections.length === 0) {
      return "No previous reflections. This is the first attempt.";
    }

    return this.reflections
      .map(
        (r) =>
          `--- Attempt #${r.attemptNumber} (Score: ${r.score}/10) ---\n` +
          `Reflection: ${r.reflection}\n` +
          `Action Items:\n${r.actionItems.map((a) => `  - ${a}`).join("\n")}`
      )
      .join("\n\n");
  }

  getBestScore(): number {
    return this.reflections.length > 0
      ? Math.max(...this.reflections.map((r) => r.score))
      : 0;
  }
}

// ── Reflexion Engine ────────────────────────────────────────

export class ReflexionEngine {
  private llm: ReturnType<typeof createLLM>;
  private memory: ReflexionMemory;

  constructor(model = "deepseek-chat") {
    this.llm = createLLM({ model, temperature: 0 });
    this.memory = new ReflexionMemory();
  }

  async evaluateAndReflect(
    task: string,
    output: string,
    attemptNumber = 1
  ): Promise<{
    score: number;
    evaluation: string;
    reflection: string;
    actionItems: string[];
    shouldRetry: boolean;
    pastReflections: string;
  }> {
    // Step 1: Evaluate with structured output (no regex needed)
    const evaluatorLLM = (this.llm as any).withStructuredOutput(EvaluationSchema);

    let evaluation: z.infer<typeof EvaluationSchema>;
    try {
      evaluation = await evaluatorLLM.invoke([
        new SystemMessage(EVALUATOR_PROMPT),
        new HumanMessage(
          `Task: ${task}\n\n` +
            `Output to evaluate:\n${output.slice(0, 4000)}\n\n` +
            `Previous reflections:\n${this.memory.formatForPrompt()}\n\n` +
            `Evaluate with the structured rubric.`
        ),
      ]);
    } catch {
      // Structured output parsing failed — use safe defaults
      evaluation = {
        completeness: 1, dataQuality: 1, analyticalDepth: 1,
        actionability: 1, writingQuality: 1, overall: 5,
        reasoning: "Evaluation parsing failed, using default scores.",
      };
    }

    const score = Math.min(10, Math.max(1, evaluation.overall));

    // Step 2: Reflect with structured output
    const reflectorLLM = (this.llm as any).withStructuredOutput(ReflectionSchema);

    let reflection: z.infer<typeof ReflectionSchema>;
    try {
      reflection = await reflectorLLM.invoke([
        new SystemMessage(REFLECTOR_PROMPT),
        new HumanMessage(
          `Task: ${task}\n\nOutput:\n${output.slice(0, 3000)}\n\n` +
            `Evaluation:\n${JSON.stringify(evaluation)}\n\nScore: ${score}/10\n\n` +
            `Generate a structured reflection with specific action items.`
        ),
      ]);
    } catch {
      reflection = {
        rootCauses: ["Reflection parsing failed"],
        whatWorkedWell: "Unable to determine",
        actionItems: ["Retry with improved data"],
        priority: "Retry with improved data",
        shouldRetry: score < 7.0 && attemptNumber < 3,
      };
    }

    // Step 3: Store in memory
    const reflectionText = [
      `Root causes: ${reflection.rootCauses.join("; ")}`,
      `What worked: ${reflection.whatWorkedWell}`,
      `Priority: ${reflection.priority}`,
    ].join("\n");

    this.memory.add({
      attemptNumber,
      taskDescription: task.slice(0, 200),
      outputSummary: output.slice(0, 300),
      score,
      reflection: reflectionText,
      actionItems: reflection.actionItems,
      timestamp: new Date().toISOString(),
    });

    // Format evaluation as readable string for logs
    const evaluationText = [
      `COMPLETENESS: ${evaluation.completeness}/2`,
      `DATA_QUALITY: ${evaluation.dataQuality}/2`,
      `ANALYTICAL_DEPTH: ${evaluation.analyticalDepth}/2`,
      `ACTIONABILITY: ${evaluation.actionability}/2`,
      `WRITING_QUALITY: ${evaluation.writingQuality}/2`,
      `OVERALL: ${score}/10`,
      `Reasoning: ${evaluation.reasoning}`,
    ].join("\n");

    return {
      score,
      evaluation: evaluationText,
      reflection: reflectionText,
      actionItems: reflection.actionItems,
      shouldRetry: reflection.shouldRetry && attemptNumber < 3,
      pastReflections: this.memory.formatForPrompt(),
    };
  }

  getImprovementContext(): string {
    return this.memory.formatForPrompt();
  }
}

// ── Prompts ─────────────────────────────────────────────────

const EVALUATOR_PROMPT = `You are a rigorous quality evaluator for investment analysis reports.

Evaluate using this STRUCTURED RUBRIC:
1. COMPLETENESS (0-2): All sections present with substance?
2. DATA_QUALITY (0-2): Specific numbers, current, sourced?
3. ANALYTICAL_DEPTH (0-2): Beyond surface? Multiple perspectives?
4. ACTIONABILITY (0-2): Clear recommendation + price targets?
5. WRITING_QUALITY (0-2): Professional, logical flow?

If previous reflections exist, check if past issues were addressed.

The overall score should be the sum of all dimension scores (max 10).`;

const REFLECTOR_PROMPT = `You are a meta-cognitive reflection specialist.

Analyze WHY the output scored as it did. Generate SPECIFIC action items.

BAD action item:  "Add more financial data"
GOOD action item: "Include Q1-Q4 2024 quarterly revenue with YoY growth %"

Focus on the highest-impact improvements first.`;
