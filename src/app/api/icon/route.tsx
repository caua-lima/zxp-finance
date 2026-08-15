import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const tamanho = Number(req.nextUrl.searchParams.get("size")) || 512;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#10100E",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg
          width={tamanho * 0.7}
          height={tamanho * 0.7}
          viewBox="0 0 200 200"
        >
          <path
            d="M30,47 L170,47 L30,153 L170,153"
            stroke="#F4B942"
            strokeWidth={34}
            strokeLinejoin="miter"
            strokeLinecap="butt"
            fill="none"
          />
        </svg>
      </div>
    ),
    { width: tamanho, height: tamanho }
  );
}
