export function Logo({ size = "sm" }: { size?: "sm" | "lg" }) {
  const iconBox = size === "lg" ? 40 : 26;
  const word = size === "lg" ? "text-2xl" : "text-base";
  const handle = size === "lg" ? "text-xs" : "text-[10px]";

  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={iconBox}
        height={iconBox}
        viewBox="0 0 200 200"
        className="shrink-0"
      >
        <polyline
          points="30,47 170,47 30,153 170,153"
          fill="none"
          strokeWidth={34}
          strokeLinejoin="miter"
          strokeLinecap="butt"
          stroke="var(--color-brand)"
        />
      </svg>
      <div className="leading-none">
        <p
          className={`font-heading font-extrabold tracking-tight text-brand ${word}`}
        >
          ZXP
        </p>
        <p
          className={`font-medium uppercase tracking-[0.18em] text-text ${handle}`}
        >
          Finance
        </p>
      </div>
    </div>
  );
}
