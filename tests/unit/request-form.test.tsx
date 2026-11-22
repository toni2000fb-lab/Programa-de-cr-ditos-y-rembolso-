// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RequestForm } from "@/components/RequestForm";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

const posts: unknown[] = [];

beforeEach(() => {
  posts.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        posts.push(JSON.parse(String(init.body)));
        return json({ request: {} });
      }
      return json({ eligible: true, reason: null }); // /api/requests/eligibility
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const field = (label: RegExp) => screen.getByLabelText(label);
const submitButton = () => screen.getByRole("button", { name: "Confirmar y enviar solicitud" }) as HTMLButtonElement;

function fillEverythingExceptTenure() {
  fireEvent.change(field(/Nombre del cliente/), { target: { value: "Ana Torres" } });
  fireEvent.change(field(/Documento de identidad/), { target: { value: "ABC12345" } });
  fireEvent.change(field(/Ingreso mensual declarado/), { target: { value: "3000" } });
  fireEvent.change(field(/Monto solicitado/), { target: { value: "1000" } });
}

describe("Formulario de solicitud: tiempo en el trabajo actual", () => {
  it("ofrece las tres opciones y una para elegir, sin ninguna preseleccionada", () => {
    render(<RequestForm onCreated={() => undefined} />);
    const select = field(/Tiempo en su trabajo actual/) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Selecciona una opción",
      "Menos de 1 año",
      "De 1 a menos de 3 años",
      "3 años o más",
    ]);
    expect(screen.getByText("Debe poder respaldarse con una constancia laboral.")).toBeTruthy();
  });

  it("no deja enviar sin elegirlo y muestra el aviso al salir del campo", async () => {
    render(<RequestForm onCreated={() => undefined} />);
    fillEverythingExceptTenure();
    // Se espera a que termine la verificación de historial para que lo único que falte sea la antigüedad.
    await waitFor(() => expect(screen.queryByText("Verificando historial…")).toBeNull(), { timeout: 3000 });
    expect(submitButton().disabled).toBe(true);

    fireEvent.blur(field(/Tiempo en su trabajo actual/));
    expect(screen.getByText("Indica cuánto tiempo lleva en su trabajo actual")).toBeTruthy();
  });

  it("al elegirlo permite enviar y manda la antigüedad al servidor", async () => {
    render(<RequestForm onCreated={() => undefined} />);
    fillEverythingExceptTenure();
    fireEvent.change(field(/Tiempo en su trabajo actual/), { target: { value: "TRES_ANIOS_O_MAS" } });

    await waitFor(() => expect(submitButton().disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(submitButton());

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({
      applicantName: "Ana Torres",
      documentId: "ABC12345",
      employmentTenure: "TRES_ANIOS_O_MAS",
      monthlyIncome: 3000,
      amount: 1000,
      termMonths: 12,
    });
  });
});
