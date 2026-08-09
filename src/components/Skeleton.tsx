export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface-2 ${className}`} />;
}

/** Skeleton dos 4 KPIs + central de atenção da Home. */
export function SkeletonHome() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Carregando resumo financeiro">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-16" />
      <Skeleton className="h-40" />
      <div className="grid lg:grid-cols-2 gap-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}

/** Skeleton de lista genérico — linhas tipo item de checklist/agenda. */
export function SkeletonLista({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Carregando lista">
      {Array.from({ length: linhas }).map((_, i) => (
        <Skeleton key={i} className="h-14" />
      ))}
    </div>
  );
}
