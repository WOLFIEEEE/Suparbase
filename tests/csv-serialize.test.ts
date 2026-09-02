import { describe, expect, it } from "vitest";
import { csvHeaderLine, csvLineFromValues } from "@/lib/csv/serialize";

describe("CSV serialization", () => {
  it("uses RFC 4180 escaping", () => {
    expect(csvHeaderLine(["plain", 'quote"header'])).toBe('plain,"quote""header"\r\n');
    expect(csvLineFromValues(["hello, world", "line\nbreak", null])).toBe(
      '"hello, world","line\nbreak",\r\n',
    );
  });

  it.each(["=2+2", "+cmd", "-SUM(A1:A2)", "@IMPORTXML()", "  =HYPERLINK()", "\t+cmd"])(
    "neutralizes formula-like string cells: %s",
    (value) => {
      expect(csvLineFromValues([value])).toBe(`'${value}\r\n`);
    },
  );

  it("keeps typed negative numbers numeric", () => {
    expect(csvLineFromValues([-42, 3.5, false])).toBe("-42,3.5,false\r\n");
  });

  it("neutralizes untrusted column names", () => {
    expect(csvHeaderLine(["=malicious"])).toBe("'=malicious\r\n");
  });
});
