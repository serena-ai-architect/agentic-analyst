/**
 * Reflexion: Self-Improving Agent Pattern
 * =========================================
 * TypeScript implementation of Reflexion (Shinn et al., 2023).
 *
 * Pattern:
 *   Execute → Evaluate (structured rubric) → Reflect (root cause) →
 *   Store lessons → Retry with accumulated wisdom
 */

import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createLLM } from "../config.js";
import type { ReflectionEntry } from "../types/index.js";

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
          `Action Items:\n${r.actionItems.map((a) => `  • ${a}`).join("\n")}`
      )
      .join("\n\n");
  }

  getBestScore(): number {
    return this.reflections.length > 0
      ? Math.max(...this.reflections.map((r) => r.score))
      : 0;
  }
}

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
    // Step 1: Evaluate with structured rubric
    const evalResult = await this.llm.invoke([
      new SystemMessage(EVALUATOR_PROMPT),
      new HumanMessage(
        `Task: ${task}\n\n` +
          `Output to evaluate:\n${output.slice(0, 4000)}\n\n` +
          `Previous reflections:\n${this.memory.formatForPrompt()}\n\n` +
          `Evaluate with the structured rubric.`
      ),
    ]);

    const evaluation = typeof evalResult.content === 'string' ? evalResult.content : String(evalResult.content);
    const score = extractScore(evaluation);

    // Step 2: Generate reflection
    const reflectResult = await this.llm.invoke([
      new SystemMessage(REFLECTOR_PROMPT),
      new HumanMessage(
        `Task: ${task}\n\nOutput:\n${output.slice(0, 3000)}\n\n` +
          `Evaluation:\n${evaluation}\n\nScore: ${score}/10\n\n` +
          `Generate a structured reflection with specific action items.`
      ),
    ]);

    const reflection = typeof reflectResult.content === 'string' ? reflectResult.content : String(reflectResult.content);
    const actionItems = extractActionItems(reflection);

    // Step 3: Store in memory
    this.memory.add({
      attemptNumber,
      taskDescription: task.slice(0, 200),
      outputSummary: output.slice(0, 300),
      score,
      reflection,
      actionItems,
      timestamp: new Date().toISOString(),
    });

    return {
      score,
      evaluation,
      reflection,
      actionItems,
      shouldRetry: score < 7.0 && attemptNumber < 3,
      pastReflections: this.memory.formatForPrompt(),
    };
  }

  getImprovementContext(): string {
    return this.memory.formatForPrompt();
  }
}

// ── Helpers ──────────────────────────────────────────────────

function extractScore(text: string): number {
  const patterns = [/OVERALL[:\s]+(\d+\.?\d*)/i, /Score[:\s]+(\d+\.?\d*)/i, /(\d+\.?\d*)\s*\/\s*10/];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Math.min(10, Math.max(1, parseFloat(match[1])));
  }
  return 5.0;
}

function extractActionItems(text: string): string[] {
  const items: string[] = [];
  const patterns = [/[•\-*]\s*(.+?)(?:\n|$)/g, /\d+\.\s*(.+?)(?:\n|$)/g];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const item = match[1].trim();
      if (item.length > 10 && !items.includes(item)) {
        items.push(item);
      }
    }
  }
  return items.slice(0, 5);
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

Format:
COMPLETENESS: [score]/2 - [reason]
DATA_QUALITY: [score]/2 - [reason]
ANALYTICAL_DEPTH: [score]/2 - [reason]
ACTIONABILITY: [score]/2 - [reason]
WRITING_QUALITY: [score]/2 - [reason]
OVERALL: [total]/10`;

const REFLECTOR_PROMPT = `You are a meta-cognitive reflection specialist.

Analyze WHY the output scored as it did. Generate SPECIFIC action items.

BAD:  "Add more financial data"
GOOD: "Include Q1-Q4 2024 quarterly revenue with YoY growth %"

Format:
ROOT CAUSE ANALYSIS: [1-2 root causes]
WHAT WORKED WELL: [preserve this]
ACTION ITEMS FOR NEXT ATTEMPT:
• [specific improvement 1]
• [specific improvement 2]
• [specific improvement 3]
PRIORITY: [highest impact item]`;
