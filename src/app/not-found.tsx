import Link from "next/link";

export default function RootNotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        backgroundColor: "#fafafa",
        padding: "1rem",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "400px" }}>
        <div
          style={{
            width: "120px",
            height: "120px",
            borderRadius: "50%",
            backgroundColor: "#FFD6E0",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.5rem",
            fontSize: "64px",
            lineHeight: 1,
          }}
        >
          🐷
        </div>
        <h1
          style={{
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "#1a1a2e",
            marginBottom: "0.5rem",
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: "0.95rem",
            color: "#6b7280",
            marginBottom: "2rem",
            lineHeight: 1.6,
          }}
        >
          This page doesn&apos;t exist. If you&apos;re looking for your
          finances, head to your dashboard.
        </p>
        <Link
          href="/home"
          style={{
            display: "inline-block",
            padding: "0.75rem 1.5rem",
            backgroundColor: "#93C5FD",
            color: "white",
            borderRadius: "0.75rem",
            textDecoration: "none",
            fontWeight: 700,
            fontSize: "0.95rem",
            boxShadow: "0 4px 12px rgba(147, 197, 253, 0.4)",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
