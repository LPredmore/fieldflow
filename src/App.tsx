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
import { lazy, Suspense } from "react";

// Lazy load pages to reduce initial bundle size
const Index = lazy(() => import("./pages/Index"));
const Jobs = lazy(() => import("./pages/Jobs"));
const Customers = lazy(() => import("./pages/Customers"));
const Services = lazy(() => import("./pages/Services"));
const Invoices = lazy(() => import("./pages/Invoices"));
const Quotes = lazy(() => import("./pages/Quotes"));
const Settings = lazy(() => import("./pages/Settings"));
const Profile = lazy(() => import("./pages/Profile"));
const Auth = lazy(() => import("./pages/Auth"));
const PublicQuote = lazy(() => import("./pages/PublicQuote"));
const PublicInvoice = lazy(() => import("./pages/PublicInvoice"));
const Calendar = lazy(() => import("./pages/Calendar"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageLoadingFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrandColorProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageLoadingFallback />}>
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
          </Suspense>
        </BrowserRouter>
        </TooltipProvider>
      </BrandColorProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
