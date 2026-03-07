import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import CreateTransaction from './pages/CreateTransaction';
import AdminDashboard from './pages/AdminDashboard';
import FAQ from './pages/FAQ';
import Terms from './pages/Terms';

function Router() {
  return (
    <Switch>
      <Route path={'/'} component={Home} />
      <Route path={'/dashboard'} component={Dashboard} />
      <Route path={'/profile'} component={Profile} />
      <Route path={'/create-transaction'} component={CreateTransaction} />
      <Route path={'/admin'} component={AdminDashboard} />
      <Route path={'/faq'} component={FAQ} />
      <Route path={'/terms'} component={Terms} />
      <Route path={'/404'} component={NotFound} />
      {/* TODO: Add products route */}
      {/* TODO: Add wallet routes */}
      {/* TODO: Add reviews routes */}
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
