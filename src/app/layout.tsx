import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/AuthContext";

// Fontes empacotadas no app (via npm, @fontsource-variable), não baixadas
// do Google em tempo de build: o build do Next 16.3 quebrava de forma
// intermitente ao processar a URL da fonte do Google, e servir do próprio
// domínio combina com a CSP (font-src 'self') e não expõe o visitante ao
// Google. Mesmas famílias da identidade: Sora (títulos) e Inter (texto).
const sora = localFont({
  src: "../../node_modules/@fontsource-variable/sora/files/sora-latin-wght-normal.woff2",
  variable: "--font-sora",
  weight: "100 800",
  display: "swap",
});

const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZXP Finance",
  description: "Controle financeiro pessoal — ZXP Solutions",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ZXP Finance",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // sem maximumScale: travar o zoom impede quem precisa ampliar a tela
  // (auditoria U03, zoom 200%). O zoom automático do iOS em campo já é
  // evitado com fonte de 16px nos campos (globals.css, .campo).
  viewportFit: "cover",
  themeColor: "#10100E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${sora.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
