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
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import SelectUserType from './pages/SelectUserType';
import AdminDashboard from './pages/AdminDashboard';
import FAQ from './pages/FAQ';
import Terms from './pages/Terms';
import WalletManagement from './pages/WalletManagement';
import Messaging from './pages/Messaging';
import IdentityVerification from './pages/IdentityVerification';
import AdvancedPayment from './pages/AdvancedPayment';

function Router() {
  return (
    <Switch>
      <Route path={'/'} component={Home} />
      <Route path={'/dashboard'} component={Dashboard} />
      <Route path={'/profile'} component={Profile} />
      <Route path={'/create-transaction'} component={CreateTransaction} />
      <Route path={'/products'} component={Products} />
      <Route path={'/product/:type/:id'} component={ProductDetail} />
      <Route path={'/select-user-type'} component={SelectUserType} />
      <Route path={'/admin'} component={AdminDashboard} />
      <Route path={'/faq'} component={FAQ} />
      <Route path={'/messaging'} component={Messaging} />
      <Route path={'/verify'} component={IdentityVerification} />
           <Route path={"/"} component={Home} />
      <Route path={"/wallet"} component={WalletManagement} />
      <Route path={"/payment"} component={AdvancedPayment} />
      <Route path={"/404"} component={NotFound} />
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
