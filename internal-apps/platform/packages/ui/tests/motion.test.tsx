import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { SPRINGS, CROSSFADE } from "../src/motion/springs.js";
import { isMotionFrozen } from "../src/motion/MotionProvider.js";
import { swipeDecision, staggerChild } from "../src/motion/primitives.js";
import { MotionProvider } from "../src/motion/MotionProvider.js";
import { Reveal, StatusSpring, CountUp } from "../src/motion/primitives.js";

describe("spring presets (ADR-0014 — springs not easings)", () => {
  it("are stiffness/damping springs and nothing else", () => {
    for (const s of Object.values(SPRINGS)) {
      expect(s.type).toBe("spring");
      expect(s.stiffness).toBeGreaterThan(0);
      expect(s.damping).toBeGreaterThan(0);
    }
    expect(CROSSFADE.type).toBe("tween"); // reduced path, not a spring
  });
  it("names the three presets the spec fixes", () => {
    expect(Object.keys(SPRINGS).sort()).toEqual([
      "gentleSettle",
      "overshootSettle",
      "snappyUI",
    ]);
  });
});

describe("test-mode freeze + reduced path", () => {
  it("frozen flag comes from ?motion=frozen or localStorage", () => {
    localStorage.setItem("motion-frozen", "1");
    expect(isMotionFrozen()).toBe(true);
    localStorage.removeItem("motion-frozen");
    expect(isMotionFrozen()).toBe(false);
  });
  it("provider + primitives render in both modes without crashing", () => {
    for (const flag of ["0", "1"]) {
      localStorage.setItem("motion-frozen", flag);
      const { container, unmount } = render(
        <MotionProvider>
          <Reveal>
            <StatusSpring color="#15803d">done</StatusSpring>
            <CountUp value={5432} />
          </Reveal>
        </MotionProvider>,
      );
      expect(container.textContent).toContain("done");
      unmount();
    }
    localStorage.removeItem("motion-frozen");
  });
});

describe("swipe settle law — never half-commits", () => {
  it("commits only past threshold, else settles back", () => {
    expect(swipeDecision(97, 96)).toBe("commit-right");
    expect(swipeDecision(-96, 96)).toBe("commit-left");
    expect(swipeDecision(95.9, 96)).toBe("settle-back");
    expect(swipeDecision(0, 96)).toBe("settle-back");
  });
});

describe("stagger draw-in variants", () => {
  it("reduced mode removes the rise (opacity only)", () => {
    expect(staggerChild(false).hidden).toMatchObject({ y: 8 });
    expect(staggerChild(true).hidden).toEqual({ opacity: 0 });
    expect((staggerChild(true).show as { y: number }).y).toBe(0);
  });
});
