import { describe, it, expect } from "vitest";
describe("gate proof", () => {
  it("deliberately red — proves the unit gate trips", () => {
    expect(true).toBe(false);
  });
});
