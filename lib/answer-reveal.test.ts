import { describe, expect, it } from "vitest";
import { answerRevealDelay } from "./answer-reveal";

describe("verified answer pacing", () => {
  it("starts immediately and reveals words in small groups", () => {
    expect(answerRevealDelay(0, 30)).toBe(0);
    expect(answerRevealDelay(2, 30)).toBe(0);
    expect(answerRevealDelay(3, 30)).toBe(70);
  });

  it("accelerates long answers to keep the animation within six seconds", () => {
    expect(answerRevealDelay(2999, 3000)).toBeLessThan(6000);
    expect(answerRevealDelay(3, 3000)).toBeLessThan(answerRevealDelay(3, 30));
    expect(answerRevealDelay(0, 0)).toBe(0);
  });
});
