import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Clear loading fallback and render app
const rootElement = document.getElementById("root")!;
rootElement.innerHTML = '';

createRoot(rootElement).render(<App />);
