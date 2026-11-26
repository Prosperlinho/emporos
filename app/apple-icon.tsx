import { ImageResponse } from "next/og";

// Home-screen icon (iOS/Android), drawn from the same "Shelves" mark.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const bar = (width: number, color = "#fff") => ({ width, height: 24, borderRadius: 12, background: color });

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1d1d1f" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={bar(104)} />
          <div style={{ display: "flex", gap: 12 }}>
            <div style={bar(70)} />
            <div style={bar(22, "#8a9bb0")} />
          </div>
          <div style={bar(104)} />
        </div>
      </div>
    ),
    size,
  );
}
