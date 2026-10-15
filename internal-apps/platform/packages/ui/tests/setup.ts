import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React 19 act() environment + DOM cleanup between tests.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);
