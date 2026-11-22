"use client";

import { useState } from "react";
import { RequestForm } from "./RequestForm";
import { MyRequests } from "./MyRequests";

export function AsesorPanel() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="stack">
      <RequestForm onCreated={() => setRefreshKey((k) => k + 1)} />
      <MyRequests refreshKey={refreshKey} />
    </div>
  );
}
