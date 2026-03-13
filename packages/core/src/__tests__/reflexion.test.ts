import { describe, it, expect } from "vitest";
import { ReflexionMemory } from "../skills/reflexion.js";
import type { ReflectionEntry } from "../types/index.js";

function makeEntry(overrides: Partial<ReflectionEntry> = {}): ReflectionEntry {
  return {
    attemptNumber: 1,
    taskDescription: "Analyze NVDA",
    outputSummary: "Draft report...",
    score: 5,
    reflection: "Needs more data",
    actionItems: ["Add revenue figures", "Include competitor comparison"],
    timestamp: "2025-01-15T10:00:00Z",
    ...overrides,
  };
}

describe("ReflexionMemory", () => {
  it("returns default message when empty", () => {
    const memory = new ReflexionMemory();
    expect(memory.formatForPrompt()).toBe(
      "No previous reflections. This is the first attempt."
    );
  });

  it("formats single entry correctly", () => {
    const memory = new ReflexionMemory();
    memory.add(makeEntry({ attemptNumber: 1, score: 6 }));

    const result = memory.formatForPrompt();
    expect(result).toContain("Attempt #1");
    expect(result).toContain("Score: 6/10");
    expect(result).toContain("Needs more data");
    expect(result).toContain("Add revenue figures");
  });

  it("formats multiple entries", () => {
    const memory = new ReflexionMemory();
    memory.add(makeEntry({ attemptNumber: 1, score: 4 }));
    memory.add(makeEntry({ attemptNumber: 2, score: 7 }));

    const result = memory.formatForPrompt();
    expect(result).toContain("Attempt #1");
    expect(result).toContain("Attempt #2");
    expect(result).toContain("Score: 4/10");
    expect(result).toContain("Score: 7/10");
  });

  it("getBestScore returns highest score", () => {
    const memory = new ReflexionMemory();
    memory.add(makeEntry({ score: 4 }));
    memory.add(makeEntry({ score: 8 }));
    memory.add(makeEntry({ score: 6 }));

    expect(memory.getBestScore()).toBe(8);
  });

  it("getBestScore returns 0 when empty", () => {
    const memory = new ReflexionMemory();
    expect(memory.getBestScore()).toBe(0);
  });

  it("evicts oldest entry when exceeding maxReflections", () => {
    const memory = new ReflexionMemory(3);

    memory.add(makeEntry({ attemptNumber: 1, score: 3 }));
    memory.add(makeEntry({ attemptNumber: 2, score: 5 }));
    memory.add(makeEntry({ attemptNumber: 3, score: 7 }));
    memory.add(makeEntry({ attemptNumber: 4, score: 9 }));

    const result = memory.formatForPrompt();
    // Attempt #1 should be evicted
    expect(result).not.toContain("Attempt #1");
    expect(result).toContain("Attempt #2");
    expect(result).toContain("Attempt #4");
    expect(memory.getBestScore()).toBe(9);
  });

  it("uses default maxReflections of 10", () => {
    const memory = new ReflexionMemory();
    for (let i = 1; i <= 12; i++) {
      memory.add(makeEntry({ attemptNumber: i, score: i }));
    }
    // First 2 should be evicted
    const result = memory.formatForPrompt();
    expect(result).not.toMatch(/Attempt #1 \(/);
    expect(result).not.toMatch(/Attempt #2 \(/);
    expect(result).toContain("Attempt #3");
    expect(result).toContain("Attempt #12");
  });
});
