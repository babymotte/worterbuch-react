import { useSubscribe } from "./wb";
import React from "react";

export default function Value({ wbkey }) {
  const val = useSubscribe(wbkey);
  return (
    <div style={{ padding: "5px" }}>
      {wbkey}: {val}
    </div>
  );
}
