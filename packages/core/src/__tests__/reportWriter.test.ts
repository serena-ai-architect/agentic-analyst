import { describe, it, expect } from "vitest";
import { fixReportDate } from "../agents/reportWriter.js";

describe("fixReportDate", () => {
  const today = new Date().toISOString().split("T")[0];

  it("replaces Report Date with today's date (bold colon inside)", () => {
    const report = `# Investment Report\n**Report Date:** 2025-01-01\n\nContent.`;
    const result = fixReportDate(report);
    expect(result).toContain(`**Report Date:** ${today}`);
    expect(result).not.toContain("2025-01-01");
  });

  it("replaces Report Date with colon outside bold", () => {
    const report = `**Report Date**: January 15, 2025`;
    const result = fixReportDate(report);
    expect(result).toContain(today);
    expect(result).not.toContain("January 15, 2025");
  });

  it("leaves report unchanged when no Report Date line", () => {
    const report = `# Investment Report\n\nNo date line here.`;
    const result = fixReportDate(report);
    expect(result).toBe(report);
  });

  it("only replaces the first occurrence", () => {
    const report = [
      "**Report Date:** 2025-01-01",
      "Some content",
      "**Report Date:** 2025-02-01",
    ].join("\n");

    const result = fixReportDate(report);
    // First should be replaced
    expect(result).toContain(`**Report Date:** ${today}`);
  });

  it("handles various date formats after Report Date", () => {
    const formats = [
      "**Report Date:** 2025-01-15",
      "**Report Date:** January 15, 2025",
      "**Report Date:** 01/15/2025",
      "**Report Date:** 15 Jan 2025",
    ];

    for (const line of formats) {
      const result = fixReportDate(line);
      expect(result).toContain(today);
    }
  });
});
