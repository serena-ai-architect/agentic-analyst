import { describe, it, expect } from "vitest";
import { guessTickerFromCompany, appendLiveDataSection } from "../graph/nodes.js";

describe("guessTickerFromCompany", () => {
  it("maps English company names (case-insensitive)", () => {
    expect(guessTickerFromCompany("NVIDIA")).toBe("NVDA");
    expect(guessTickerFromCompany("nvidia")).toBe("NVDA");
    expect(guessTickerFromCompany("Nvidia")).toBe("NVDA");
    expect(guessTickerFromCompany("apple")).toBe("AAPL");
    expect(guessTickerFromCompany("Google")).toBe("GOOGL");
  });

  it("maps Chinese company names", () => {
    expect(guessTickerFromCompany("英伟达")).toBe("NVDA");
    expect(guessTickerFromCompany("苹果")).toBe("AAPL");
    expect(guessTickerFromCompany("腾讯")).toBe("0700.HK");
    expect(guessTickerFromCompany("比亚迪")).toBe("1211.HK");
    expect(guessTickerFromCompany("贵州茅台")).toBe("600519.SS");
  });

  it("matches partial company names", () => {
    expect(guessTickerFromCompany("Apple Inc")).toBe("AAPL");
    expect(guessTickerFromCompany("nvidia corporation")).toBe("NVDA");
  });

  it("recognizes raw tickers (1-5 uppercase letters)", () => {
    expect(guessTickerFromCompany("AAPL")).toBe("AAPL");
    expect(guessTickerFromCompany("MSFT")).toBe("MSFT");
    expect(guessTickerFromCompany("MU")).toBe("MU");
  });

  it("returns null for unknown companies", () => {
    expect(guessTickerFromCompany("Unknown Corp")).toBeNull();
    expect(guessTickerFromCompany("random text")).toBeNull();
  });

  it("handles HK stocks", () => {
    expect(guessTickerFromCompany("tencent")).toBe("0700.HK");
    expect(guessTickerFromCompany("xiaomi")).toBe("1810.HK");
    expect(guessTickerFromCompany("byd")).toBe("1211.HK");
  });
});

describe("appendLiveDataSection", () => {
  const validLiveData = JSON.stringify({
    Company: "NVIDIA Corp",
    "Current Price": "125.50",
    "Market Cap": "3.1T",
    "P/E Ratio (TTM)": "65.2",
    "Forward P/E": "35.1",
    "EPS (TTM)": "1.93",
    "Revenue (TTM)": "79.8B",
    "Gross Margin": "75.0%",
    "Profit Margin": "55.0%",
    ROE: "115.0%",
    "52-Week High": "150.00",
    "52-Week Low": "60.00",
    Beta: "1.65",
    "Dividend Yield": "0.03%",
    "Data Timestamp": "2025-01-15T10:00:00Z",
  });

  it("appends live data section to report", () => {
    const report = "# Investment Report\n\nSome content here.";
    const result = appendLiveDataSection(report, validLiveData);

    expect(result).toContain("Live Market Data (Verified)");
    expect(result).toContain("NVIDIA Corp");
    expect(result).toContain("$125.50");
    expect(result).toContain("$3.1T");
    expect(result).toContain("65.2");
  });

  it("does not duplicate live data section", () => {
    const report = "# Report\n\n## Live Market Data (Verified)\n\nExisting data.";
    const result = appendLiveDataSection(report, validLiveData);
    expect(result).toBe(report);
  });

  it("returns original report on invalid JSON", () => {
    const report = "# Report\n\nContent.";
    const result = appendLiveDataSection(report, "not valid json");
    expect(result).toBe(report);
  });

  it("shows N/A for missing fields", () => {
    const partialData = JSON.stringify({ Company: "Test" });
    const report = "# Report";
    const result = appendLiveDataSection(report, partialData);

    expect(result).toContain("N/A");
    expect(result).toContain("Test");
  });

  it("formats the markdown table correctly", () => {
    const report = "# Report";
    const result = appendLiveDataSection(report, validLiveData);

    expect(result).toContain("| Metric | Value |");
    expect(result).toContain("| :--- | :--- |");
    expect(result).toContain("| **Company** |");
    expect(result).toContain("| **Current Price** |");
  });
});
