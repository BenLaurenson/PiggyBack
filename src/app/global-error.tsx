"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          backgroundColor: "#fafafa",
          margin: 0,
          padding: "1rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "400px" }}>
          <div
            style={{
              width: "120px",
              height: "120px",
              borderRadius: "50%",
              backgroundColor: "#FFE4E1",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 1.5rem",
              fontSize: "64px",
              lineHeight: 1,
            }}
          >
            💥
          </div>
          <h1
            style={{
              fontSize: "1.5rem",
              fontWeight: 700,
              color: "#1a1a2e",
              marginBottom: "0.5rem",
            }}
          >
            Something went very wrong
          </h1>
          <p
            style={{
              fontSize: "0.95rem",
              color: "#6b7280",
              marginBottom: "2rem",
              lineHeight: 1.6,
            }}
          >
            We encountered a critical error. Please try refreshing the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#FCA5A5",
              color: "white",
              borderRadius: "0.75rem",
              border: "none",
              fontWeight: 700,
              fontSize: "0.95rem",
              cursor: "pointer",
              boxShadow: "0 4px 12px rgba(252, 165, 165, 0.4)",
              transition: "transform 0.2s, box-shadow 0.2s",
            }}
          >
            Refresh Page
          </button>
        </div>
      </body>
    </html>
  );
}
