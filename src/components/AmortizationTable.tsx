import { buildAmortizationSchedule } from "@/domain/amortization";
import { formatUSD } from "@/domain/money";
import { MONTHLY_INTEREST_RATE } from "@/domain/rules";

export function AmortizationTable({ principalCents, termMonths }: { principalCents: number; termMonths: number }) {
  const schedule = buildAmortizationSchedule(principalCents, termMonths);
  if (schedule.rows.length === 0) return null;
  return (
    <section className="card amort" aria-label="Simulación financiera">
      <h3>Simulación financiera</h3>
      <div className="summary">
        <div>
          <span className="label">Capital</span>
          <strong>{formatUSD(principalCents)}</strong>
        </div>
        <div>
          <span className="label">Interés fijo mensual</span>
          <strong>{(MONTHLY_INTEREST_RATE * 100).toFixed(1)}%</strong>
        </div>
        <div>
          <span className="label">Cuota mensual estimada</span>
          <strong className="accent">{formatUSD(schedule.monthlyPaymentCents)}</strong>
        </div>
        <div>
          <span className="label">Total intereses</span>
          <strong>{formatUSD(schedule.totalInterestCents)}</strong>
        </div>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Mes</th>
              <th>Cuota</th>
              <th>Interés</th>
              <th>Capital</th>
              <th>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {schedule.rows.map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td>{formatUSD(r.paymentCents)}</td>
                <td>{formatUSD(r.interestCents)}</td>
                <td>{formatUSD(r.principalCents)}</td>
                <td>{formatUSD(r.balanceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
