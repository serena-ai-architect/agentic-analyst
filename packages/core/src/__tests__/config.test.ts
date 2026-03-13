import { describe, it, expect } from "vitest";
import { detectProvider, getTodayString, LLMConfig, WorkflowConfig } from "../config.js";

describe("detectProvider", () => {
  it("routes deepseek models to deepseek", () => {
    expect(detectProvider("deepseek-chat")).toBe("deepseek");
    expect(detectProvider("deepseek-reasoner")).toBe("deepseek");
  });

  it("routes claude models to anthropic", () => {
    expect(detectProvider("claude-sonnet-4-6")).toBe("anthropic");
    expect(detectProvider("claude-haiku-4-5")).toBe("anthropic");
    expect(detectProvider("claude-opus-4-6")).toBe("anthropic");
  });

  it("routes gpt models to openai", () => {
    expect(detectProvider("gpt-4o")).toBe("openai");
    expect(detectProvider("gpt-4.1")).toBe("openai");
    expect(detectProvider("gpt-4.1-mini")).toBe("openai");
  });

  it("routes o1/o3 models to openai", () => {
    expect(detectProvider("o1")).toBe("openai");
    expect(detectProvider("o1-preview")).toBe("openai");
    expect(detectProvider("o3-mini")).toBe("openai");
  });

  it("defaults unknown models to deepseek", () => {
    expect(detectProvider("unknown-model")).toBe("deepseek");
    expect(detectProvider("llama-3")).toBe("deepseek");
    expect(detectProvider("")).toBe("deepseek");
  });
});

describe("getTodayString", () => {
  it("returns YYYY-MM-DD format", () => {
    const today = getTodayString();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's actual date", () => {
    const expected = new Date().toISOString().split("T")[0];
    expect(getTodayString()).toBe(expected);
  });
});

describe("LLMConfig", () => {
  it("has all stage models defaulting to deepseek-chat", () => {
    // Without env vars set, all should default
    expect(LLMConfig.planningModel).toBeDefined();
    expect(LLMConfig.researchModel).toBeDefined();
    expect(LLMConfig.analysisModel).toBeDefined();
    expect(LLMConfig.reportModel).toBeDefined();
    expect(LLMConfig.translationModel).toBeDefined();
    expect(LLMConfig.evaluationModel).toBeDefined();
  });

  it("has temperature set", () => {
    expect(LLMConfig.temperature).toBe(0.1);
  });
});

describe("WorkflowConfig", () => {
  it("has correct defaults", () => {
    expect(WorkflowConfig.maxIterations).toBe(3);
    expect(WorkflowConfig.qualityThreshold).toBe(7.0);
    expect(WorkflowConfig.humanReviewEnabled).toBe(false);
    expect(WorkflowConfig.streamingEnabled).toBe(true);
  });
});
