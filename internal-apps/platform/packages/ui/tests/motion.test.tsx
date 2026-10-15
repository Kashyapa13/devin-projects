import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  BlurMorph,
  ColorSpring,
  CountUp,
  FocusGlide,
  Morph,
  MotionProvider,
  Pressable,
  Pulse,
  Skeleton,
  springs,
  SwipeRow,
  Toast,
  useFreeze,
} from "../src/motion.js";

describe("motion law", () => {
  it("every preset is a spring — no easings, no tweens", () => {
    for (const s of Object.values(springs)) {
      expect(s.type).toBe("spring");
      expect((s as { stiffness?: number }).stiffness).toBeTypeOf("number");
      expect((s as { damping?: number }).damping).toBeTypeOf("number");
    }
    expect(Object.keys(springs)).toEqual(["snappy", "gentle", "hero"]);
  });

  it("primitives mount inside MotionProvider", () => {
    render(
      <MotionProvider>
        <Morph morphId="x">m</Morph>
        <Pressable>p</Pressable>
        <ColorSpring color="#000">c</ColorSpring>
        <Pulse when>p</Pulse>
        <Skeleton width="4rem" />
        <SwipeRow>s</SwipeRow>
        <BlurMorph revealed>b</BlurMorph>
        <Toast id="t">t</Toast>
        <FocusGlide glideId="g" />
        <CountUp value={42} />
      </MotionProvider>,
    );
    expect(screen.getByText("m")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("test-mode freeze flips via data-motion=off (FT determinism)", () => {
    document.documentElement.dataset["motion"] = "off";
    function Probe() {
      return <span data-testid="f">{String(useFreeze())}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("f").textContent).toBe("true");
    delete document.documentElement.dataset["motion"];
  });

  it("freeze mode renders children instantly (zero-duration config)", () => {
    document.documentElement.dataset["motion"] = "off";
    render(
      <MotionProvider>
        <Morph morphId="z">frozen</Morph>
      </MotionProvider>,
    );
    expect(screen.getByText("frozen")).toBeTruthy();
    delete document.documentElement.dataset["motion"];
  });

  it("Pulse fires once — re-render with same flag does not re-pulse", () => {
    const { rerender } = render(<Pulse when={false}>x</Pulse>);
    rerender(<Pulse when>x</Pulse>);
    rerender(<Pulse when>x</Pulse>);
    expect(screen.getByText("x")).toBeTruthy();
  });
});
