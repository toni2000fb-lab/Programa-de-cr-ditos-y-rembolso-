"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMoney } from "@/domain/money";
import { apiFetch, errorMessage } from "./api";
import { BureauCell, StatusBadge } from "./StatusBadge";
import type { RequestDTO } from "./types";

export function usePolledRequests(refreshKey: number) {
  const [requests, setRequests] = useState<RequestDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ requests: RequestDTO[] }>("/api/requests");
      setRequests(data.requests);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  // Sondeo: más frecuente mientras haya consultas de buró en curso.
  const busy = requests?.some((r) => r.bureauStatus === "CONSULTANDO" || r.bureauStatus === "NO_CONSULTADO") ?? false;
  useEffect(() => {
    const t = setInterval(() => void load(), busy ? 2000 : 8000);
    return () => clearInterval(t);
  }, [busy, load]);

  return { requests, error, reload: load };
}

export function MyRequests({ refreshKey }: { refreshKey: number }) {
  const { requests, error } = usePolledRequests(refreshKey);
  return (
    <section className="card">
      <h2>Mis solicitudes</h2>
      {error && <p className="alert error">{error}</p>}
      {requests === null ? (
        <p className="muted">Cargando…</p>
      ) : requests.length === 0 ? (
        <p className="muted">Aún no tienes solicitudes.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Solicitante</th>
                <th>Documento</th>
                <th>Monto</th>
                <th>Plazo</th>
                <th>Buró</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.createdAt).toLocaleString("es")}</td>
                  <td>{r.applicantName}</td>
                  <td>{r.documentId}</td>
                  <td>{formatMoney(r.amountCents)}</td>
                  <td>{r.termMonths} m</td>
                  <td>
                    <BureauCell status={r.bureauStatus} score={r.bureauScore} error={r.bureauError} attempts={r.bureauAttempts} />
                  </td>
                  <td>
                    <StatusBadge status={r.status} />
                    {r.rejectionReason && <div className="reason">Motivo: {r.rejectionReason}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
