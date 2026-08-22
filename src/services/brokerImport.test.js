import { describe, it, expect } from "vitest";
import { importBrokerCsv, parseDeNum, parseTrCryptoPdf, parseTrSecuritiesPdf } from "./brokerImport";

describe("parseDeNum", () => {
  it("parses German-format thousands/decimal separators", () => {
    expect(parseDeNum("1.234,56")).toBeCloseTo(1234.56, 5);
  });
  it("strips currency symbols and whitespace", () => {
    expect(parseDeNum("€ 1.234,56")).toBeCloseTo(1234.56, 5);
    expect(parseDeNum("1.234,56 EUR")).toBeCloseTo(1234.56, 5);
  });
  it("returns 0 for garbage input", () => {
    expect(parseDeNum("n/a")).toBe(0);
    expect(parseDeNum(undefined)).toBe(0);
  });
});

describe("importBrokerCsv (Trade Republic)", () => {
  it("parses ticker, value, and holdings columns (German number format)", () => {
    const csv = 'Ticker,Name,Current Value,Quantity\nBTC,Bitcoin,1000,"0,01"\nAAPL,Apple,500,2';
    const result = importBrokerCsv(csv);
    expect(result.importedRows).toBe(2);
    const btc = result.assets.find(a => a.ticker === "BTC");
    expect(btc.current).toBe(1000);
    expect(btc.holdings).toBeCloseTo(0.01, 5);
  });
  it("dedupes rows with the same ticker", () => {
    const csv = "Ticker,Current Value\nBTC,100\nBTC,200";
    const result = importBrokerCsv(csv);
    expect(result.assets).toHaveLength(1);
  });
});

describe("parseTrCryptoPdf phantom-match regression", () => {
  it("does not create a SEI position from a German page footer", () => {
    // Regression test: "Seite 1 von 2" used to substring-match the "sei" crypto key.
    const lines = ["Kryptoauszug", "Seite 1 von 2", "Bitcoin", "0,1234", "EUR 4.500,00"];
    const assets = parseTrCryptoPdf(lines);
    expect(assets.find(a => a.ticker === "SEI")).toBeUndefined();
  });
  it("still matches a real whole-word coin name", () => {
    const lines = ["Kryptoauszug", "Bitcoin", "0,1234", "EUR 4.500,00"];
    const assets = parseTrCryptoPdf(lines);
    expect(assets.find(a => a.ticker === "BTC")).toBeTruthy();
  });
});

describe("parseTrSecuritiesPdf", () => {
  it("extracts ticker, name, holdings and value around an ISIN", () => {
    const lines = [
      "Vanguard FTSE All-World",
      "IE00BK5BQT80",
      "Stück 12,5",
      "Kurswert EUR 1.500,00",
    ];
    const assets = parseTrSecuritiesPdf(lines);
    expect(assets).toHaveLength(1);
    expect(assets[0].ticker).toBe("VWCE");
    expect(assets[0].holdings).toBeCloseTo(12.5, 5);
    expect(assets[0].current).toBeCloseTo(1500, 5);
    expect(assets[0]._isin).toBe("IE00BK5BQT80");
  });
});
