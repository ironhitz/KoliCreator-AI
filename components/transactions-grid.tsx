"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef } from "ag-grid-community";

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

export function TransactionsGrid({ rows }: { rows: RevenueRow[] }) {
  const columns = useMemo<ColDef<RevenueRow>[]>(() => [
    { field: "product", headerName: "Offer", minWidth: 160, flex: 1 },
    { field: "amount_cents", headerName: "Gross", width: 130, valueFormatter: ({ data }) => data ? new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency }).format(data.amount_cents / 100) : "" },
    { field: "refunded_amount_cents", headerName: "Refunded", width: 130, valueFormatter: ({ data }) => data ? new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency }).format(data.refunded_amount_cents / 100) : "" },
    { field: "status", headerName: "Status", width: 125 },
    { field: "source", headerName: "Environment", width: 150, valueFormatter: ({ value }) => value === "paypal_sandbox" ? "PayPal sandbox" : "Simulated" },
    { field: "captured_at", headerName: "Captured", width: 180, valueFormatter: ({ value }) => value ? new Date(value).toLocaleString() : "" },
    { field: "paypal_capture_id", headerName: "Capture reference", minWidth: 190, flex: 1 },
  ], []);
  const defaultColDef = useMemo<ColDef>(() => ({ sortable: true, filter: true, resizable: true }), []);

  return <div className="transaction-grid"><AgGridReact<RevenueRow> rowData={rows} columnDefs={columns} defaultColDef={defaultColDef} theme={themeQuartz.withParams({ accentColor: "#176849", fontFamily: "DM Sans, sans-serif", fontSize: 12 })} pagination paginationPageSize={8} domLayout="autoHeight" /></div>;
}