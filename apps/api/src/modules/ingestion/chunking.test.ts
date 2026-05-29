import { describe, expect, it } from "vitest";
import { chunkText } from "./chunking.js";

describe("chunkText", () => {
  it("splits long text with overlap", () => {
    const text = "a".repeat(50);
    const chunks = chunkText(text, 20, 5);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.text.length).toBeLessThanOrEqual(20);
  });
});
