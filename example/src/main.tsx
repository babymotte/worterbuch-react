import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { Worterbuch } from "../../dist/index";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Worterbuch
      config={{
        backendAddress: [["localhost", 8080]],
        backendPath: "/ws",
        backendScheme: "ws",
      }}
      automaticReconnect
      clientName="worterbuch-react demo"
    >
      <App />
    </Worterbuch>
  </React.StrictMode>
);
