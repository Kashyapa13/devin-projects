import { initI18n, QueueTable, useTranslation } from "@company/ui";
import { resources } from "./strings.js";

initI18n({ resources });

interface Row {
  id: number;
  title: string;
  status: string;
}

const demoRows: Row[] = [{ id: 1, title: "Replace me", status: "PENDING" }];

/** One page via @company/ui + i18n — the template's whole frontend. */
export function App() {
  const { t } = useTranslation();
  return (
    <main>
      <h1>{t("app.title")}</h1>
      <QueueTable<Row>
        caption={t("queue.caption")}
        emptyMessage={t("queue.empty")}
        rows={demoRows}
        columns={[
          { key: "id", header: t("col.id"), render: (r) => r.id },
          { key: "title", header: t("col.title"), render: (r) => r.title },
          { key: "status", header: t("col.status"), render: (r) => r.status },
        ]}
        actions={[{ label: t("action.open"), onSelect: () => undefined }]}
      />
    </main>
  );
}
