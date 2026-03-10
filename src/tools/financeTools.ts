/**
 * Financial Data Tools
 * =====================
 * Real financial data via yahoo-finance2 (native JS library).
 * Zod schemas provide type-safe input validation.
 */

import { tool } from "@langchain/core/tools";
import { z } from "zod";

function formatNumber(num: number | null | undefined): string {
  if (num == null) return "N/A";
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

export const getStockInfo = tool(
  async ({ ticker }): Promise<string> => {
    try {
      // Dynamic import to handle optional dependency gracefully
      const yahooFinance = await import("yahoo-finance2").then((m) => m.default);
      const quote = await yahooFinance.quote(ticker);

      const metrics = {
        Company: quote.longName ?? quote.shortName ?? ticker,
        Sector: (quote as any).sector ?? "N/A",
        "Market Cap": formatNumber(quote.marketCap),
        "Current Price": `$${quote.regularMarketPrice ?? "N/A"}`,
        "52-Week High": `$${quote.fiftyTwoWeekHigh ?? "N/A"}`,
        "52-Week Low": `$${quote.fiftyTwoWeekLow ?? "N/A"}`,
        "P/E Ratio (TTM)": quote.trailingPE?.toFixed(2) ?? "N/A",
        "Forward P/E": quote.forwardPE?.toFixed(2) ?? "N/A",
        "EPS (TTM)": quote.epsTrailingTwelveMonths?.toFixed(2) ?? "N/A",
        "Dividend Yield": quote.dividendYield
          ? `${(quote.dividendYield * 100).toFixed(2)}%`
          : "N/A",
        "Analyst Target": `$${quote.targetMeanPrice ?? "N/A"}`,
        "50-Day Avg": `$${quote.fiftyDayAverage?.toFixed(2) ?? "N/A"}`,
        "200-Day Avg": `$${quote.twoHundredDayAverage?.toFixed(2) ?? "N/A"}`,
      };

      return JSON.stringify(metrics, null, 2);
    } catch (error) {
      return `Error fetching stock data for ${ticker}: ${String(error)}`;
    }
  },
  {
    name: "get_stock_info",
    description:
      "Get comprehensive stock information including price, market cap, " +
      "P/E ratio, and other key financial metrics.",
    schema: z.object({
      ticker: z
        .string()
        .describe("Stock ticker symbol (e.g., 'NVDA', 'AAPL')"),
    }),
  }
);

export const getFinancialHistory = tool(
  async ({ ticker, period }): Promise<string> => {
    try {
      const yahooFinance = await import("yahoo-finance2").then((m) => m.default);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(startDate.getFullYear() - (period === "5y" ? 5 : 2));

      const history = await yahooFinance.historical(ticker, {
        period1: startDate.toISOString().split("T")[0],
        period2: endDate.toISOString().split("T")[0],
        interval: "1mo",
      });

      const recent = history.slice(-12).map((h) => ({
        date: h.date.toISOString().split("T")[0],
        close: `$${h.close?.toFixed(2)}`,
        volume: h.volume?.toLocaleString(),
      }));

      return JSON.stringify({ monthlyHistory: recent }, null, 2);
    } catch (error) {
      return `Error fetching history for ${ticker}: ${String(error)}`;
    }
  },
  {
    name: "get_financial_history",
    description: "Get historical price data for a stock.",
    schema: z.object({
      ticker: z.string().describe("Stock ticker symbol"),
      period: z
        .enum(["2y", "5y"])
        .optional()
        .default("2y")
        .describe("Time period"),
    }),
  }
);

export function getFinanceTools() {
  return [getStockInfo, getFinancialHistory];
}
