import { describe, expect, it } from "vitest";
import { Category } from "../types.js";
import { isYahtzee, scoreCategory, sumOfDice } from "../scoring.js";

// counts[f] = number of dice showing face f+1.
describe("scoreCategory", () => {
  it("upper categories count only their own face", () => {
    expect(scoreCategory(Category.ACES, [3, 1, 0, 0, 1, 0])).toBe(3);
    expect(scoreCategory(Category.TWOS, [3, 1, 0, 0, 1, 0])).toBe(2);
    expect(scoreCategory(Category.SIXES, [0, 0, 0, 0, 0, 2])).toBe(12);
    expect(scoreCategory(Category.FOURS, [1, 1, 1, 0, 1, 1])).toBe(0);
  });

  it("three/four of a kind pay the full pip sum only when the count is met", () => {
    // three 3s + two 6s -> sum = 9 + 12 = 21
    expect(scoreCategory(Category.THREE_OF_A_KIND, [0, 0, 3, 0, 0, 2])).toBe(21);
    expect(scoreCategory(Category.THREE_OF_A_KIND, [1, 1, 1, 1, 1, 0])).toBe(0);
    // four 2s + one 6 -> sum = 8 + 6 = 14
    expect(scoreCategory(Category.FOUR_OF_A_KIND, [0, 4, 0, 0, 0, 1])).toBe(14);
    expect(scoreCategory(Category.FOUR_OF_A_KIND, [0, 0, 3, 0, 0, 2])).toBe(0);
  });

  it("full house needs a 3 and a 2", () => {
    expect(scoreCategory(Category.FULL_HOUSE, [0, 3, 0, 2, 0, 0])).toBe(25);
    expect(scoreCategory(Category.FULL_HOUSE, [0, 0, 5, 0, 0, 0])).toBe(0); // yahtzee, no joker
    expect(scoreCategory(Category.FULL_HOUSE, [2, 2, 1, 0, 0, 0])).toBe(0);
  });

  it("straights need a consecutive run of present faces", () => {
    expect(scoreCategory(Category.SMALL_STRAIGHT, [1, 1, 1, 1, 0, 0])).toBe(30);
    expect(scoreCategory(Category.SMALL_STRAIGHT, [1, 1, 1, 0, 0, 2])).toBe(0);
    expect(scoreCategory(Category.LARGE_STRAIGHT, [0, 1, 1, 1, 1, 1])).toBe(40);
    expect(scoreCategory(Category.LARGE_STRAIGHT, [1, 1, 1, 1, 0, 1])).toBe(0);
  });

  it("yahtzee and chance", () => {
    expect(scoreCategory(Category.YAHTZEE, [0, 0, 0, 0, 0, 5])).toBe(50);
    expect(scoreCategory(Category.YAHTZEE, [0, 0, 0, 0, 1, 4])).toBe(0);
    expect(scoreCategory(Category.CHANCE, [1, 1, 1, 1, 1, 0])).toBe(15);
  });

  it("joker wildcard only lifts full house / small / large straight", () => {
    const yahtzee = [5, 0, 0, 0, 0, 0]; // five 1s
    expect(scoreCategory(Category.FULL_HOUSE, yahtzee, true)).toBe(25);
    expect(scoreCategory(Category.SMALL_STRAIGHT, yahtzee, true)).toBe(30);
    expect(scoreCategory(Category.LARGE_STRAIGHT, yahtzee, true)).toBe(40);
    // upper / n-of-a-kind / yahtzee / chance are unaffected by the joker flag
    expect(scoreCategory(Category.ACES, yahtzee, true)).toBe(5);
    expect(scoreCategory(Category.THREE_OF_A_KIND, yahtzee, true)).toBe(5);
    expect(scoreCategory(Category.YAHTZEE, yahtzee, true)).toBe(50);
    // joker flag is inert unless the hand is actually a yahtzee
    expect(scoreCategory(Category.FULL_HOUSE, [0, 3, 0, 2, 0, 0], true)).toBe(25);
    expect(scoreCategory(Category.SMALL_STRAIGHT, [1, 1, 1, 0, 0, 2], true)).toBe(0);
  });
});

describe("helpers", () => {
  it("sumOfDice weights faces by value", () => {
    expect(sumOfDice([1, 1, 1, 1, 1, 0])).toBe(15);
    expect(sumOfDice([0, 0, 0, 0, 0, 5])).toBe(30);
  });

  it("isYahtzee detects five of a kind", () => {
    expect(isYahtzee([0, 0, 0, 5, 0, 0])).toBe(true);
    expect(isYahtzee([0, 0, 0, 4, 1, 0])).toBe(false);
  });
});
