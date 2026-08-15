import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ZXP Finance",
    short_name: "ZXP Finance",
    description: "Controle financeiro pessoal — ZXP Solutions",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#10100E",
    theme_color: "#10100E",
    icons: [
      { src: "/api/icon?size=192", sizes: "192x192", type: "image/png" },
      { src: "/api/icon?size=512", sizes: "512x512", type: "image/png" },
      {
        src: "/api/icon?size=512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
