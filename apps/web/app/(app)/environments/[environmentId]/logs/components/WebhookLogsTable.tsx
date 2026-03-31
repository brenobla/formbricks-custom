"use client";

import { ArrowDownLeft, ArrowUpRight, CheckCircle2, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getWebhookLogsAction } from "../actions";

interface WebhookLog {
  id: string;
  createdAt: string | Date;
  direction: string;
  source: string;
  url: string;
  event: string | null;
  responseStatus: number | null;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
  requestBody: any;
  responseBody: any;
}

interface Props {
  environmentId: string;
  initialData: {
    data: WebhookLog[];
    total: number;
    page: number;
    totalPages: number;
  };
}

export function WebhookLogsTable({ environmentId, initialData }: Props) {
  const [logs, setLogs] = useState(initialData.data);
  const [total, setTotal] = useState(initialData.total);
  const [page, setPage] = useState(initialData.page);
  const [totalPages, setTotalPages] = useState(initialData.totalPages);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filters
  const [direction, setDirection] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [successFilter, setSuccessFilter] = useState<string>("");

  const fetchLogs = async (p: number) => {
    setLoading(true);
    try {
      const filters: any = { page: p };
      if (direction) filters.direction = direction;
      if (source) filters.source = source;
      if (successFilter === "true") filters.success = true;
      if (successFilter === "false") filters.success = false;

      const result = await getWebhookLogsAction(environmentId, filters);
      setLogs(result.data as unknown as WebhookLog[]);
      setTotal(result.total);
      setPage(result.page);
      setTotalPages(result.totalPages);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs(1);
  }, [direction, source, successFilter]);

  const formatDate = (dateStr: string | Date) => {
    return new Date(dateStr).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={direction}
          onChange={(e) => setDirection(e.target.value)}>
          <option value="">Todos</option>
          <option value="outgoing">Enviados</option>
          <option value="incoming">Recebidos</option>
        </select>

        <select
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={source}
          onChange={(e) => setSource(e.target.value)}>
          <option value="">Todas origens</option>
          <option value="pipeline">Pipeline</option>
          <option value="datacrazy">DataCrazy</option>
          <option value="cally">Cally</option>
          <option value="firepay">FirePay</option>
        </select>

        <select
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
          value={successFilter}
          onChange={(e) => setSuccessFilter(e.target.value)}>
          <option value="">Todos status</option>
          <option value="true">Sucesso</option>
          <option value="false">Erro</option>
        </select>

        <button
          onClick={() => fetchLogs(page)}
          className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700 hover:bg-slate-200">
          Atualizar
        </button>

        <span className="flex items-center text-sm text-slate-500">{total} registros</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-8 px-3 py-3"></th>
              <th className="px-3 py-3">Data/Hora</th>
              <th className="px-3 py-3">Direção</th>
              <th className="px-3 py-3">Origem</th>
              <th className="px-3 py-3">Evento</th>
              <th className="px-3 py-3">URL</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Duração</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  Carregando...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  Nenhum log encontrado
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <>
                  <tr
                    key={log.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                    <td className="px-3 py-3">
                      {expandedId === log.id ? (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400" />
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      {log.direction === "outgoing" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                          <ArrowUpRight className="h-3 w-3" /> Enviado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                          <ArrowDownLeft className="h-3 w-3" /> Recebido
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-medium text-slate-700">{log.source}</td>
                    <td className="px-3 py-3 text-slate-600">{log.event || "-"}</td>
                    <td className="max-w-[200px] truncate px-3 py-3 text-slate-500" title={log.url}>
                      {log.url}
                    </td>
                    <td className="px-3 py-3">
                      {log.success ? (
                        <span className="inline-flex items-center gap-1 text-green-600">
                          <CheckCircle2 className="h-4 w-4" />
                          {log.responseStatus || "OK"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <XCircle className="h-4 w-4" />
                          {log.responseStatus || "Erro"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {log.durationMs ? `${log.durationMs}ms` : "-"}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`${log.id}-detail`}>
                      <td colSpan={8} className="bg-slate-50 px-6 py-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">
                              Request Body
                            </h4>
                            <pre className="max-h-60 overflow-auto rounded bg-slate-900 p-3 text-xs text-green-400">
                              {JSON.stringify(log.requestBody, null, 2) || "null"}
                            </pre>
                          </div>
                          <div>
                            <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">
                              Response Body
                            </h4>
                            <pre className="max-h-60 overflow-auto rounded bg-slate-900 p-3 text-xs text-green-400">
                              {JSON.stringify(log.responseBody, null, 2) || "null"}
                            </pre>
                            {log.errorMessage && (
                              <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                                <strong>Erro:</strong> {log.errorMessage}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => fetchLogs(page - 1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => fetchLogs(page + 1)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50">
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
