import { describe, expect, it } from "vitest";

import { createCsv, neutralizeSpreadsheetCell } from "./csv";

describe("CSV export safety", () => {
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tformula", "\rformula"])(
    "neutralizes spreadsheet formula input %s",
    (value) => expect(neutralizeSpreadsheetCell(value)).toBe(`'${value}`),
  );

  it("quotes delimiters and emits a UTF-8 BOM", () => {
    expect(
      createCsv([
        ["Company", "a,b"],
        ['say "hello"', "USD"],
      ]),
    ).toBe('\uFEFF"Company","a,b"\r\n"say ""hello""","USD"\r\n');
  });
});
