import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * CSP começa em Report-Only (auditoria S09): o navegador avisa o que
 * bloquearia, sem bloquear. Depois de rodar um tempo sem violação real no
 * console, trocar a chave pra "Content-Security-Policy" e ela passa a valer.
 *
 * O Firebase (Auth + Firestore) conversa com *.googleapis.com; o app não
 * carrega script de terceiros. 'unsafe-inline' em script é o que o próprio
 * guia do Next recomenda sem nonce (ver docs/content-security-policy).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy-Report-Only", value: csp },
          // frame-ancestors em Report-Only não protege; este sim bloqueia
          // o app de ser embutido em iframe (clickjacking) desde já
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // microfone liberado só pro próprio app: o registro por voz usa
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
