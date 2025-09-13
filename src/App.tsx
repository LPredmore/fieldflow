import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminProtectedRoute } from "@/components/AdminProtectedRoute";
import { PermissionProtectedRoute } from "@/components/PermissionProtectedRoute";
import { BrandColorProvider } from "@/components/BrandColorProvider";
import { Layout } from "@/components/Layout/Layout";
import Index from "./pages/Index";
import Jobs from "./pages/Jobs";
import Customers from "./pages/Customers";
import Services from "./pages/Services";
import Invoices from "./pages/Invoices";
import Quotes from "./pages/Quotes";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Auth from "./pages/Auth";
import PublicQuote from "./pages/PublicQuote";
import PublicInvoice from "./pages/PublicInvoice";
import Calendar from "./pages/Calendar";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrandColorProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
          <Route path="/public-quote/:token" element={<PublicQuote />} />
          <Route path="/public-invoice/:token" element={<PublicInvoice />} />
            <Route path="/" element={<ProtectedRoute><Layout><Index /></Layout></ProtectedRoute>} />
            <Route path="/jobs" element={<ProtectedRoute><Layout><Jobs /></Layout></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute><Layout><Customers /></Layout></ProtectedRoute>} />
            <Route path="/services" element={
              <ProtectedRoute>
                <Layout>
                  <PermissionProtectedRoute 
                    requiredPermission="access_services"
                    fallbackMessage="You need Services permission to access this page."
                  >
                    <Services />
                  </PermissionProtectedRoute>
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/invoices" element={
              <ProtectedRoute>
                <Layout>
                  <PermissionProtectedRoute 
                    requiredPermission="access_invoicing"
                    fallbackMessage="You need Invoicing permission to access this page."
                  >
                    <Invoices />
                  </PermissionProtectedRoute>
                </Layout>
              </ProtectedRoute>
            } />
            <Route path="/quotes" element={<ProtectedRoute><Layout><Quotes /></Layout></ProtectedRoute>} />
            <Route path="/calendar" element={<ProtectedRoute><Layout><Calendar /></Layout></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Layout><Profile /></Layout></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Layout><AdminProtectedRoute><Settings /></AdminProtectedRoute></Layout></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
        </TooltipProvider>
      </BrandColorProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
