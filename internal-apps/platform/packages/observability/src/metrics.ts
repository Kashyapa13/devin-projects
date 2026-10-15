export interface Labels {
  [name: string]: string;
}

export interface Counter {
  inc(value?: number, labels?: Labels): void;
}

export interface Gauge {
  set(value: number, labels?: Labels): void;
}

export interface Histogram {
  observe(value: number, labels?: Labels): void;
}

export interface MetricsRegistry {
  counter(name: string, help?: string): Counter;
  gauge(name: string, help?: string): Gauge;
  histogram(name: string, help?: string): Histogram;
  /** Prometheus text exposition format. */
  render(): string;
}

type MetricKind = "counter" | "gauge" | "histogram";

interface Metric {
  kind: MetricKind;
  name: string;
  help: string;
  series: Map<string, { labels: Labels; value: number; observations: number[] }>;
}

function labelKey(labels: Labels | undefined): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v.replace(/"/g, '\\"')}"`)
    .join(",");
}

/**
 * Namespaced in-process metrics registry. Every metric name is forced
 * into `<namespace>_<name>` so apps can't collide on shared metric keys.
 * `render()` emits Prometheus text exposition — scrape-compatible.
 */
export function metricsRegistry(namespace: string): MetricsRegistry {
  if (!/^[a-z][a-z0-9_]*$/.test(namespace)) {
    throw new Error(`metricsRegistry: bad namespace "${namespace}"`);
  }
  const metrics = new Map<string, Metric>();

  function metric(kind: MetricKind, name: string, help = ""): Metric {
    const full = `${namespace}_${name}`;
    if (!/^[a-zA-Z_:][a-zA-Z0-9_:]*$/.test(full)) {
      throw new Error(`metricsRegistry: bad metric name "${full}"`);
    }
    let m = metrics.get(full);
    if (!m) {
      m = { kind, name: full, help, series: new Map() };
      metrics.set(full, m);
    } else if (m.kind !== kind) {
      throw new Error(`metricsRegistry: ${full} redefined as ${kind}`);
    }
    return m;
  }

  function series(m: Metric, labels?: Labels) {
    const key = labelKey(labels);
    let s = m.series.get(key);
    if (!s) {
      s = { labels: labels ?? {}, value: 0, observations: [] };
      m.series.set(key, s);
    }
    return s;
  }

  return {
    counter(name, help = "") {
      const m = metric("counter", name, help);
      return {
        inc(value = 1, labels?: Labels) {
          if (value < 0) throw new Error("counter.inc: negative value");
          series(m, labels).value += value;
        },
      };
    },
    gauge(name, help = "") {
      const m = metric("gauge", name, help);
      return {
        set(value: number, labels?: Labels) {
          series(m, labels).value = value;
        },
      };
    },
    histogram(name, help = "") {
      const m = metric("histogram", name, help);
      return {
        observe(value: number, labels?: Labels) {
          series(m, labels).observations.push(value);
        },
      };
    },
    render() {
      const lines: string[] = [];
      for (const m of metrics.values()) {
        if (m.help) lines.push(`# HELP ${m.name} ${m.help}`);
        const type = m.kind === "histogram" ? "histogram" : m.kind;
        lines.push(`# TYPE ${m.name} ${type}`);
        for (const [key, s] of m.series) {
          const lbl = key ? `{${key}}` : "";
          if (m.kind === "histogram") {
            lines.push(`${m.name}_count${lbl} ${s.observations.length}`);
            const sum = s.observations.reduce((a, b) => a + b, 0);
            lines.push(`${m.name}_sum${lbl} ${sum}`);
          } else {
            lines.push(`${m.name}${lbl} ${s.value}`);
          }
        }
      }
      return lines.join("\n") + "\n";
    },
  };
}
