import { describe, test, expect } from "bun:test";
import { parseStatusNoteUrl } from "./parseStatusNoteUrl";

describe("parseStatusNoteUrl", () => {
  test("parses status and note with no URL (user's failure case)", () => {
    const input = `NO MISSING CONTEXT\n\nThe post accurately states that North Carolina experienced flooding again, which is confirmed by the search results showing multiple flooding events in July 2025 from Tropical Storm Chantal and subsequent severe thunderstorms. While the post includes a vague conspiratorial implication with \"we ALLLLLL know why,\" this appears to be opinion/speculation rather than a factual claim that can be fact-checked. The core factual assertion about repeated flooding in North Carolina is correct.`;
    const { status, note, url } = parseStatusNoteUrl(input);
    expect(status).toBe("NO MISSING CONTEXT");
    expect(
      note.startsWith(
        "The post accurately states that North Carolina experienced flooding again"
      )
    ).toBe(true);
    expect(url).toBe("");
  });

  test("parses status, note, and url", () => {
    const input = `CORRECTION WITH TRUSTWORTHY CITATION\n\nThe post misstates the cause of the flooding. According to the National Weather Service, the flooding was due to Tropical Storm Chantal.\nhttps://weather.gov/flooding-nc-2025`;
    const { status, note, url } = parseStatusNoteUrl(input);
    expect(status).toBe("CORRECTION WITH TRUSTWORTHY CITATION");
    expect(
      note.startsWith("The post misstates the cause of the flooding.")
    ).toBe(true);
    expect(url).toBe("https://weather.gov/flooding-nc-2025");
  });
});
