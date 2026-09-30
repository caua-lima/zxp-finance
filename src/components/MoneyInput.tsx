"use client";

import { ChangeEvent, ClipboardEvent, useState } from "react";
import { valorColado } from "@/lib/valorColado";

function digitsToValor(digits: string): number {
  return parseInt(digits || "0", 10) / 100;
}

function digitsToTexto(digits: string): string {
  return digitsToValor(digits).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Campo de dinheiro. Digitando: máscara de centavos, igual app de banco
 * (digitar 1-5-5-0 dá R$ 15,50). Colando: o texto é lido como número de
 * verdade — colar "100" é R$ 100,00, não R$ 1,00 (auditoria U05).
 */
export function MoneyInput({
  value,
  onChange,
  placeholder = "R$ 0,00",
  className,
  id,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  autoFocus,
}: {
  value: number;
  onChange: (valor: number) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  autoFocus?: boolean;
}) {
  const [digits, setDigits] = useState(() => String(Math.round((value || 0) * 100)));
  const [ultimoValor, setUltimoValor] = useState(value);

  if (value !== ultimoValor && digitsToValor(digits) !== value) {
    setUltimoValor(value);
    setDigits(String(Math.round((value || 0) * 100)));
  }

  function aplicar(proximo: string) {
    setDigits(proximo);
    onChange(digitsToValor(proximo));
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const somenteDigitos = e.target.value.replace(/\D/g, "");
    aplicar(somenteDigitos.replace(/^0+(?=\d)/, "") || "0");
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const valor = valorColado(e.clipboardData.getData("text"));
    if (valor === null) return; // texto que não é dinheiro: comportamento normal
    e.preventDefault();
    aplicar(String(Math.round(valor * 100)));
  }

  return (
    <input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      autoFocus={autoFocus}
      value={digits === "0" ? "" : digitsToTexto(digits)}
      onChange={handleChange}
      onPaste={handlePaste}
      className={className}
    />
  );
}
