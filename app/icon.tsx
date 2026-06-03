import { ImageResponse } from "next/og";

// Tells Next.js this is the app icon and how to serve it.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// The default export is a function that generates the image for the app icon.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          background: "linear-gradient(135deg, #7c3aed 0%, #ec4899 50%, #f59e0b 100%)",
          color: "#ffffff",
          fontSize: 42,
          fontWeight: 700,
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
        }}
      >
        S
      </div>
    ),
    { ...size },
  );
}
