"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";
import { formatMoney } from "@/lib/money";

ModuleRegistry.registerModules([AllCommunityModule]);

export type RevenueRow = {
  id: string;
  product: string;
  productId: string | null;
  amount_cents: number;
  refunded_amount_cents: number;
  currency: string;
  source: string;
  status: string;
  captured_at: string;
  paypal_capture_id: string;
};

export function TransactionsGrid({ rows, locale }: { rows: RevenueRow[]; locale: string }) {
  const columns = useMemo<ColDef<RevenueRow>[]>(() => [
    { field: "product", headerName: "Offer", minWidth: 160, flex: 1 },
    { field: "amount_cents", headerName: "Gross", width: 130, valueFormatter: ({ data }) => data ? formatMoney(data.amount_cents, data.currency, locale) : "" },
    { field: "refunded_amount_cents", headerName: "Refunded", width: 130, valueFormatter: ({ data }) => data ? formatMoney(data.refunded_amount_cents, data.currency, locale) : "" },
    { field: "status", headerName: "Status", width: 125 },
    { field: "source", headerName: "Environment", width: 150, valueFormatter: ({ value }) => value === "paypal_sandbox" ? "PayPal sandbox" : "Simulated" },
    { field: "captured_at", headerName: "Captured", width: 180, valueFormatter: ({ value }) => value ? new Date(value).toLocaleString() : "" },
    { field: "paypal_capture_id", headerName: "Capture reference", minWidth: 190, flex: 1 },
  ], [locale]);
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true }), []);

  return <div className="transaction-grid"><AgGridReact<RevenueRow> rowData={rows} columnDefs={columns} defaultColDef={defaultColDef} theme={themeQuartz.withParams({ accentColor: "#176849", fontFamily: "DM Sans, sans-serif", fontSize: 12 })} domLayout="autoHeight" /></div>;
}