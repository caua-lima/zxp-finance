import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
        <svg width="126" height="126" viewBox="0 0 200 200">
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
    { ...size }
  );
}
