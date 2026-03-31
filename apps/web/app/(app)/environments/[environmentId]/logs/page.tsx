import { getWebhookLogs } from "@/lib/webhookLog/service";
import { WebhookLogsTable } from "./components/WebhookLogsTable";

export default async function LogsPage(props: { params: Promise<{ environmentId: string }> }) {
  const params = await props.params;
  const initialData = await getWebhookLogs(params.environmentId, { page: 1 });

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Logs de Webhooks</h1>
        <p className="mt-1 text-sm text-slate-500">
          Visualize todos os webhooks enviados e recebidos com detalhamento completo.
        </p>
      </div>
      <WebhookLogsTable environmentId={params.environmentId} initialData={initialData} />
    </div>
  );
}
