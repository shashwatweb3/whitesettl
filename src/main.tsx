import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { BrowserRouter } from "react-router-dom";
import { config } from "./network";
import App from "./App";
import "./styles.css";
createRoot(document.getElementById("root")!).render(<React.StrictMode><WagmiProvider config={config}><QueryClientProvider client={new QueryClient()}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></WagmiProvider></React.StrictMode>);
