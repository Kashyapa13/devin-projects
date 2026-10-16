import { metrics, type Attributes } from "@opentelemetry/api";
import {
  metricsRegistry,
  type Counter,
  type Gauge,
  type Histogram,
  type Labels,
  type MetricsRegistry,
} from "@company/observability";

export interface ObservableGaugeOpts {
  /** Refresh cadence for the in-process (Prometheus /metrics) side. Default 15s. */
  intervalMs?: number;
  labels?: Labels;
  help?: string;
}

export interface DualRegistry extends MetricsRegistry {
  /**
   * Server-computed gauge: `fn` is re-evaluated on every OTLP collection
   * (real OTel observable gauge) and on an interval for the in-process
   * /metrics exposition. Probe failures drop that cycle's point — a
   * telemetry probe must never take the app down.
   */
  observableGauge(
    name: string,
    fn: () => number | Promise<number>,
    opts?: ObservableGaugeOpts,
  ): void;
  /**
   * Multi-series server-computed gauge (e.g. a per-status count): one
   * probe fills every label series each cycle — OTLP and /metrics both.
   */
  observableGaugeSeries(
    name: string,
    fn: () =>
      | Iterable<{ value: number; labels?: Labels }>
      | Promise<Iterable<{ value: number; labels?: Labels }>>,
    opts?: Omit<ObservableGaugeOpts, "labels">,
  ): void;
}

const attrs = (labels?: Labels): Attributes => ({ ...(labels ?? {}) });

/**
 * The fleet metric surface (ADR-0017): every instrument dual-writes to
 * the in-process Prometheus registry (so `/metrics` exposition keeps
 * working byte-for-byte) AND to an OTel instrument on the global meter
 * (which is a no-op until startOtel() runs — registries created before
 * the SDK get real instruments transparently once it does).
 *
 * Names and labels pass through UNCHANGED — dashboards and alert rules
 * wired to the constitutional names keep resolving.
 */
export function otelRegistry(namespace: string): DualRegistry {
  const inner = metricsRegistry(namespace);
  const meter = () => metrics.getMeter(`internal-apps/${namespace}`);
  const full = (name: string) => `${namespace}_${name}`;

  return {
    counter(name, help = ""): Counter {
      const c = inner.counter(name, help);
      const oc = meter().createCounter(full(name), { description: help });
      return {
        inc(value = 1, labels?: Labels) {
          c.inc(value, labels);
          oc.add(value, attrs(labels));
        },
      };
    },
    gauge(name, help = ""): Gauge {
      const g = inner.gauge(name, help);
      const og = meter().createGauge(full(name), { description: help });
      return {
        set(value: number, labels?: Labels) {
          g.set(value, labels);
          og.record(value, attrs(labels));
        },
      };
    },
    histogram(name, help = ""): Histogram {
      const h = inner.histogram(name, help);
      // no unit — the Prometheus exporter would append `_milliseconds`,
      // breaking the constitutional "same names" contract.
      const oh = meter().createHistogram(full(name), {
        description: help,
      });
      return {
        observe(value: number, labels?: Labels) {
          h.observe(value, labels);
          oh.record(value, attrs(labels));
        },
      };
    },
    observableGauge(name, fn, opts) {
      const g = inner.gauge(name, opts?.help ?? "");
      const og = meter().createObservableGauge(full(name));
      meter().addBatchObservableCallback(
        async (observer) => {
          try {
            observer.observe(og, await fn(), attrs(opts?.labels));
          } catch {
            // probe failed this cycle — emit nothing rather than a lie
          }
        },
        [og],
      );
      const tick = async () => {
        try {
          g.set(await fn(), opts?.labels);
        } catch {
          /* same contract as the OTLP side */
        }
      };
      void tick();
      const t = setInterval(() => void tick(), opts?.intervalMs ?? 15_000);
      t.unref?.();
    },
    observableGaugeSeries(name, fn, opts) {
      const g = inner.gauge(name, opts?.help ?? "");
      const og = meter().createObservableGauge(full(name));
      meter().addBatchObservableCallback(
        async (observer) => {
          try {
            for (const p of await fn()) {
              observer.observe(og, p.value, attrs(p.labels));
            }
          } catch {
            /* probe failed this cycle */
          }
        },
        [og],
      );
      const tick = async () => {
        try {
          for (const p of await fn()) g.set(p.value, p.labels);
        } catch {
          /* same contract */
        }
      };
      void tick();
      const t = setInterval(() => void tick(), opts?.intervalMs ?? 15_000);
      t.unref?.();
    },
    render(): string {
      return inner.render();
    },
  };
}
