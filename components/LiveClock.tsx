"use client";

import { useEffect, useState } from "react";

export function LiveClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="text-arena-matrix/90">
      {t.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}
    </span>
  );
}
