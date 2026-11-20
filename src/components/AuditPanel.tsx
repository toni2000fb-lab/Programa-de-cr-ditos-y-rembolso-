"use client";

import { useEffect, useState } from "react";
import { STATUS_LABEL } from "@/domain/stateMachine";
import { apiFetch, errorMessage } from "./api";
import type { AuditView } from "./types";

type Conn = "connecting" | "live" | "reconnecting";

export function AuditPanel() {
  const [entries, setEntries] = useState<AuditView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conn, setConn] = useState<Conn>("connecting");
  const [fresh, setFresh] = useState<Set<number>>(new Set());

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    apiFetch<{ entries: AuditView[] }>("/api/audit")
      .then(({ entries: initial }) => {
        if (cancelled) return;
        setEntries(initial);
        const lastId = initial[0]?.id ?? 0;
        source = new EventSource(`/api/audit/stream?after=${lastId}`);
        source.onopen = () => setConn("live");
        source.onerror = () => setConn("reconnecting");
        source.addEventListener("audit", (ev) => {
          const entry = JSON.parse((ev as MessageEvent<string>).data) as AuditView;
          setEntries((prev) => (prev?.some((p) => p.id === entry.id) ? prev : [entry, ...(prev ?? [])]));
          setFresh((f) => new Set(f).add(entry.id));
        });
      })
      .catch((e) => setError(errorMessage(e)));

    return () => {
      cancelled = true;
      source?.close();
    };
  }, []);

  return (
    <section className="card">
      <div className="row between">
        <h2>Registro de auditoría</h2>
        <span className={`live live-${conn}`}>
          {conn === "live" ? "● En vivo" : conn === "connecting" ? "Conectando…" : "Reconectando…"}
        </span>
      </div>
      {error && <p className="alert error">{error}</p>}
      {entries === null ? (
        <p className="muted">Cargando…</p>
      ) : entries.length === 0 ? (
        <p className="muted">Sin movimientos todavía.</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Marca de tiempo (ISO 8601)</th>
                <th>Solicitud</th>
                <th>Usuario / rol</th>
                <th>Estado anterior</th>
                <th>Estado nuevo</th>
                <th>Comentario</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={fresh.has(e.id) ? "fresh" : undefined}>
                  <td>{e.id}</td>
                  <td className="mono">{e.timestamp}</td>
                  <td>
                    <span className="mono" title={e.requestId}>
                      {e.requestId.slice(0, 8)}
                    </span>{" "}
                    <span className="muted">{e.applicantName}</span>
                  </td>
                  <td>
                    {e.actorName} <span className="muted">({e.actorRole})</span>
                  </td>
                  <td>{e.fromStatus ? STATUS_LABEL[e.fromStatus] : "—"}</td>
                  <td>{STATUS_LABEL[e.toStatus]}</td>
                  <td>{e.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
