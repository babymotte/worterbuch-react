import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { Worterbuch } from "../../dist/index";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Worterbuch
      config={{
        backendHost: "localhost",
        backendPath: "/ws",
        backendScheme: "ws",
        backendPort: 8080,
      }}
      automaticReconnect
      clientName="worterbuch-react demo"
    >
      <App />
    </Worterbuch>
  </React.StrictMode>
);
