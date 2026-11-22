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

const type = (label: RegExp, value: string) => fireEvent.change(field(label), { target: { value } });

/** Todo lo obligatorio salvo el tiempo en el trabajo y los documentos, que cada prueba decide. */
function fillClientData() {
  type(/Nombre del cliente/, "Ana Torres");
  type(/Documento de identidad/, "ABC12345");
  type(/Fecha de nacimiento/, "1990-05-10");
  type(/Teléfono del cliente/, "5555-1234");
  type(/Dirección de residencia/, "5a avenida 10-20, zona 1");
  type(/Empresa o negocio/, "Comercial Los Pinos");
  type(/Puesto u ocupación/, "Contador");
  type(/Tipo de ingreso/, "PLANILLA");
  type(/Ingreso mensual declarado/, "3000");
  type(/Otros ingresos mensuales/, "0");
  type(/Gastos mensuales/, "1200");
  type(/Cuotas mensuales de deudas actuales/, "0");
  type(/Monto solicitado/, "1000");
  type(/Destino del crédito/, "Reparar la casa");
  type(/Garantía que ofrece/, "Fiador");
  type(/Referencia 1: nombre/, "María López");
  type(/Referencia 1: teléfono/, "5555-0001");
  type(/Referencia 2: nombre/, "Carlos Pérez");
  type(/Referencia 2: teléfono/, "5555-0002");
}
const fillEverythingExceptTenure = fillClientData;

const DOCS = ["Copia del DPI", "Comprobante de domicilio", "Constancia laboral", "Boletas de pago o estados de cuenta"];
const doc = (name: string) => screen.getByRole("checkbox", { name }) as HTMLInputElement;
const tickAllDocuments = () => DOCS.forEach((d) => fireEvent.click(doc(d)));

/** Espera a que termine la verificación de historial, para que solo falte lo que la prueba quiere. */
const settled = () => waitFor(() => expect(screen.queryByText("Verificando historial…")).toBeNull(), { timeout: 3000 });

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
    tickAllDocuments();
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

describe("Formulario de solicitud: datos obligatorios del cliente", () => {
  it("muestra las secciones y los cuatro documentos como casillas sin marcar", () => {
    render(<RequestForm onCreated={() => undefined} />);
    for (const legend of ["Datos del cliente", "Trabajo e ingresos", "Crédito solicitado", "Referencias", "Documentos que entregó el cliente"]) {
      expect(screen.getByText(legend)).toBeTruthy();
    }
    for (const d of DOCS) expect(doc(d).checked).toBe(false);
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
    expect(submitButton().disabled).toBe(true);
  });

  it("con todo lleno pero sin marcar los documentos no se puede enviar y se avisa", async () => {
    render(<RequestForm onCreated={() => undefined} />);
    fillClientData();
    type(/Tiempo en su trabajo actual/, "TRES_ANIOS_O_MAS");
    await settled();
    expect(submitButton().disabled).toBe(true);

    fireEvent.submit(submitButton().closest("form")!);
    expect(screen.getByText("Marca los 4 documentos que entregó el cliente")).toBeTruthy();
    expect(posts).toHaveLength(0);

    // Con tres de cuatro todavía falta uno.
    DOCS.slice(0, 3).forEach((d) => fireEvent.click(doc(d)));
    expect(submitButton().disabled).toBe(true);
    fireEvent.click(doc(DOCS[3]!));
    await waitFor(() => expect(submitButton().disabled).toBe(false));
    expect(screen.queryByText("Marca los 4 documentos que entregó el cliente")).toBeNull();
  });

  it("al enviar manda todos los datos del cliente, con los importes en quetzales", async () => {
    render(<RequestForm onCreated={() => undefined} />);
    fillClientData();
    type(/Tiempo en su trabajo actual/, "DE_1_A_3_ANIOS");
    tickAllDocuments();
    await waitFor(() => expect(submitButton().disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(submitButton());

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      applicantName: "Ana Torres",
      documentId: "ABC12345",
      birthDate: "1990-05-10",
      phone: "5555-1234",
      address: "5a avenida 10-20, zona 1",
      employerName: "Comercial Los Pinos",
      jobTitle: "Contador",
      incomeType: "PLANILLA",
      employmentTenure: "DE_1_A_3_ANIOS",
      monthlyIncome: 3000,
      otherIncome: 0,
      monthlyExpenses: 1200,
      currentDebtPayment: 0,
      amount: 1000,
      termMonths: 12,
      purpose: "Reparar la casa",
      guarantee: "Fiador",
      reference1Name: "María López",
      reference1Phone: "5555-0001",
      reference2Name: "Carlos Pérez",
      reference2Phone: "5555-0002",
      receivedDocuments: ["COPIA_DPI", "COMPROBANTE_DOMICILIO", "CONSTANCIA_LABORAL", "COMPROBANTE_INGRESOS"],
    });
  });

  it("al enviar con éxito el formulario queda vacío, con las casillas sin marcar", async () => {
    render(<RequestForm onCreated={() => undefined} />);
    fillClientData();
    type(/Tiempo en su trabajo actual/, "TRES_ANIOS_O_MAS");
    tickAllDocuments();
    await waitFor(() => expect(submitButton().disabled).toBe(false), { timeout: 3000 });
    fireEvent.click(submitButton());
    await waitFor(() => expect(screen.getByText(/Solicitud registrada/)).toBeTruthy());
    expect((field(/Nombre del cliente/) as HTMLInputElement).value).toBe("");
    expect((field(/Dirección de residencia/) as HTMLInputElement).value).toBe("");
    for (const d of DOCS) expect(doc(d).checked).toBe(false);
  });

  it("muestra el error de cada campo al salir de él", () => {
    render(<RequestForm onCreated={() => undefined} />);
    const cases: [RegExp, string, string][] = [
      [/Fecha de nacimiento/, "2020-01-01", "El cliente debe ser mayor de 18 años"],
      [/Teléfono del cliente/, "555", "El teléfono del cliente debe tener 8 dígitos"],
      [/Dirección de residencia/, "", "Escribe la dirección"],
      [/Gastos mensuales/, "-5", "El valor de los gastos mensuales no puede ser negativo"],
      [/Otros ingresos mensuales/, "", "Indica otros ingresos con un número (escribe 0 si no tiene)"],
    ];
    for (const [label, value, message] of cases) {
      type(label, value);
      fireEvent.blur(field(label));
      expect(screen.getByText(message), message).toBeTruthy();
    }
  });

  it("avisa si la referencia 2 repite el teléfono de la referencia 1", () => {
    render(<RequestForm onCreated={() => undefined} />);
    type(/Referencia 1: teléfono/, "5555-0001");
    type(/Referencia 2: teléfono/, "5555 0001");
    fireEvent.blur(field(/Referencia 2: teléfono/));
    expect(screen.getByText("Las dos referencias deben tener teléfonos distintos")).toBeTruthy();
  });

  it("el tipo de ingreso ofrece las tres opciones sin ninguna preseleccionada", () => {
    render(<RequestForm onCreated={() => undefined} />);
    const select = field(/Tipo de ingreso/) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual([
      "Selecciona una opción",
      "Empleado en planilla",
      "Negocio propio",
      "Otro",
    ]);
  });
});
