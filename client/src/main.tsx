import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { BrandProvider } from "@/lib/brand-context";
import { ToastProvider } from "@/lib/toast-context";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <BrandProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrandProvider>
    </BrowserRouter>
  </React.StrictMode>
);
