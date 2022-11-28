import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Worterbuch } from "./wb";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Worterbuch address={"ws://worterbuch/ws"}>
      <App />
    </Worterbuch>
  </React.StrictMode>
);
