"use client";

import { useId } from "react";
import { SORT_OPTIONS, type SortKey, type StatusFilter } from "@/domain/requestView";
import { REQUEST_STATUSES, STATUS_LABEL, type RequestStatusValue } from "@/domain/stateMachine";

/**
 * Tarjetas de resumen por estado que además funcionan como filtro: al pulsar una se muestran
 * solo las solicitudes de ese estado y al pulsarla otra vez se quita el filtro.
 */
export function StatusKpiCards({
  counts,
  active,
  onSelect,
}: {
  counts: Record<RequestStatusValue, number>;
  active: StatusFilter;
  onSelect: (status: StatusFilter) => void;
}) {
  return (
    <>
      {REQUEST_STATUSES.map((s) => {
        const pressed = active === s;
        return (
          <button
            key={s}
            type="button"
            className={`card kpi kpi-${s.toLowerCase()}`}
            aria-pressed={pressed}
            title={pressed ? "Pulsa para quitar el filtro" : "Pulsa para filtrar por este estado"}
            onClick={() => onSelect(pressed ? "TODAS" : s)}
          >
            <span className="label">{STATUS_LABEL[s]}</span>
            <strong className="big">{counts[s]}</strong>
          </button>
        );
      })}
    </>
  );
}

export interface RequestToolbarProps {
  status: StatusFilter;
  query: string;
  sort: SortKey;
  shown: number;
  total: number;
  urgentOnly: boolean;
  urgentCount: number;
  filtersActive: boolean;
  onStatus: (status: StatusFilter) => void;
  onQuery: (query: string) => void;
  onSort: (sort: SortKey) => void;
  onUrgentOnly: (urgentOnly: boolean) => void;
  onClear: () => void;
}

/** Buscador, selector de estado y selector de orden de la lista de solicitudes. */
export function RequestToolbar(props: RequestToolbarProps) {
  const id = useId();
  const { status, query, sort, shown, total, urgentOnly, urgentCount, filtersActive } = props;
  return (
    <>
      <div className="toolbar" role="search">
        <div className="field grow">
          <label className="label" htmlFor={`${id}-q`}>
            Buscar
          </label>
          <input
            id={`${id}-q`}
            type="search"
            value={query}
            placeholder="Nombre, documento o ID"
            autoComplete="off"
            onChange={(e) => props.onQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-status`}>
            Estado
          </label>
          <select id={`${id}-status`} value={status} onChange={(e) => props.onStatus(e.target.value as StatusFilter)}>
            <option value="TODAS">Todos</option>
            {REQUEST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-sort`}>
            Ordenar por
          </label>
          <select id={`${id}-sort`} value={sort} onChange={(e) => props.onSort(e.target.value as SortKey)}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="toggle"
          aria-pressed={urgentOnly}
          title="Mostrar solo las solicitudes marcadas como urgentes"
          onClick={() => props.onUrgentOnly(!urgentOnly)}
        >
          Solo urgentes <span className="count">{urgentCount}</span>
        </button>
        {filtersActive && (
          <button type="button" onClick={props.onClear}>
            Limpiar filtros
          </button>
        )}
      </div>
      <p className="muted results-count" aria-live="polite">
        Mostrando {shown} de {total} {total === 1 ? "solicitud" : "solicitudes"}
      </p>
    </>
  );
}
