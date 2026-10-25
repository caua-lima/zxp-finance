"use client";

export interface ValorFormaPagamento {
  pagoCom: "conta" | "credito";
  cartao: string;
}

/**
 * "Saiu da conta" (Pix, débito, dinheiro) ou "Cartão de crédito". No
 * crédito o valor não sai do saldo agora — sai quando a fatura for paga.
 */
export function FormaPagamento({
  id,
  valor,
  cartoes,
  onChange,
}: {
  id: string;
  valor: ValorFormaPagamento;
  cartoes: string[];
  onChange: (v: ValorFormaPagamento) => void;
}) {
  const opcao = (pagoCom: ValorFormaPagamento["pagoCom"], rotulo: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={valor.pagoCom === pagoCom}
      onClick={() =>
        onChange({ pagoCom, cartao: pagoCom === "credito" ? valor.cartao || cartoes[0] || "" : "" })
      }
      className={`min-h-[40px] rounded-xl border text-xs font-medium transition-colors ${
        valor.pagoCom === pagoCom
          ? "border-brand bg-brand-soft text-brand"
          : "border-line text-text-faint active:bg-surface-2"
      }`}
    >
      {rotulo}
    </button>
  );

  return (
    <div>
      <p id={`${id}-rotulo`} className="rotulo">
        Como pagou
      </p>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`} className="grid grid-cols-2 gap-1.5">
        {opcao("conta", "Saiu da conta")}
        {opcao("credito", "Cartão de crédito")}
      </div>
      {valor.pagoCom === "credito" && (
        <>
          {cartoes.length > 0 && (
            <select
              aria-label="Qual cartão"
              value={valor.cartao}
              onChange={(e) => onChange({ ...valor, cartao: e.target.value })}
              className="campo mt-1.5"
            >
              {cartoes.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-text-muted">
            Não sai do saldo agora: sai quando você pagar a fatura.
          </p>
        </>
      )}
    </div>
  );
}
