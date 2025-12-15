"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, Table2 } from "lucide-react";

interface ExportDialogProps {
  trigger?: React.ReactNode;
}

export function ExportDialog({ trigger }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"csv" | "markdown">("csv");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/export/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
      });

      if (!res.ok) throw new Error("Export failed");

      const text = await res.text();
      const mimeType = format === "csv" ? "text/csv" : "text/markdown";
      const safeBlob = new Blob([text], { type: mimeType });
      const filename =
        format === "csv"
          ? `piggyback-transactions-${new Date().toISOString().split("T")[0]}.csv`
          : `piggyback-report-${new Date().toISOString().split("T")[0]}.md`;

      const url = URL.createObjectURL(safeBlob);
      try {
        const a = Object.assign(document.createElement("a"), {
          href: url,
          download: filename,
        });
        a.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      setOpen(false);
    } catch {
      // Could add toast error here
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="max-w-sm"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        <DialogHeader>
          <DialogTitle
            className="font-[family-name:var(--font-nunito)]"
            style={{ color: "var(--text-primary)" }}
          >
            Export Transactions
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Format */}
          <div>
            <label
              className="text-xs font-semibold mb-2 block"
              style={{ color: "var(--text-secondary)" }}
            >
              Format
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setFormat("csv")}
                className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor:
                    format === "csv"
                      ? "var(--pastel-blue-light)"
                      : "var(--surface-secondary)",
                  color:
                    format === "csv"
                      ? "var(--pastel-blue-dark)"
                      : "var(--text-secondary)",
                  border:
                    format === "csv"
                      ? "2px solid var(--pastel-blue)"
                      : "2px solid transparent",
                }}
              >
                <Table2 className="h-4 w-4" />
                CSV
              </button>
              <button
                onClick={() => setFormat("markdown")}
                className="flex items-center gap-2 p-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  backgroundColor:
                    format === "markdown"
                      ? "var(--pastel-mint-light)"
                      : "var(--surface-secondary)",
                  color:
                    format === "markdown"
                      ? "var(--pastel-mint-dark)"
                      : "var(--text-secondary)",
                  border:
                    format === "markdown"
                      ? "2px solid var(--pastel-mint)"
                      : "2px solid transparent",
                }}
              >
                <FileText className="h-4 w-4" />
                Report
              </button>
            </div>
          </div>

          {/* Date Range */}
          <div>
            <label
              className="text-xs font-semibold mb-2 block"
              style={{ color: "var(--text-secondary)" }}
            >
              Date Range (optional)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="p-2 rounded-lg text-sm border"
                style={{
                  backgroundColor: "var(--surface-secondary)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
                placeholder="From"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="p-2 rounded-lg text-sm border"
                style={{
                  backgroundColor: "var(--surface-secondary)",
                  borderColor: "var(--border)",
                  color: "var(--text-primary)",
                }}
                placeholder="To"
              />
            </div>
          </div>

          {/* Download */}
          <Button
            onClick={handleExport}
            disabled={loading}
            className="w-full rounded-xl font-semibold"
            style={{
              backgroundColor: "var(--pastel-blue)",
              color: "white",
            }}
          >
            {loading ? "Exporting..." : "Download"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
