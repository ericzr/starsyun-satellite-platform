import { ThemeProvider } from 'next-themes';
import { BrowserRouter, Routes, Route } from 'react-router';
import { Toaster } from './components/ui/sonner';
import { I18nProvider } from './i18n';
import { InquiryProvider } from './context/InquiryContext';
import { CartProvider } from './context/CartContext';
import { UserProvider } from './context/UserContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppHeader } from './components/AppHeader';
import { Home } from './pages/Home';
import { Explore } from './pages/Explore';
import { ProductDetail } from './pages/ProductDetail';
import { Inquiry } from './pages/Inquiry';
import { InquiryList } from './pages/InquiryList';
import { InquirySuccess } from './pages/InquirySuccess';
import { Admin } from './pages/Admin';
import { Cart } from './pages/Cart';
import { Checkout } from './pages/Checkout';
import { Orders } from './pages/Orders';
import { OrderDetail } from './pages/OrderDetail';
import { Login } from './pages/Login';
import { Profile } from './pages/Profile';

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <I18nProvider>
        <UserProvider>
          <InquiryProvider>
            <CartProvider>
              <BrowserRouter>
                <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
                  {/* Site-wide cosmic backdrop */}
                  <div className="pointer-events-none fixed inset-0 z-0 starfield twinkle" />
                  <div className="pointer-events-none fixed inset-0 z-0 galaxy-glow" />
                  <div className="pointer-events-none fixed inset-0 z-0 grid-backdrop opacity-40" />

                  <AppHeader />

                  <main className="relative z-10 min-h-0 flex-1 overflow-hidden">
                    <Routes>
                      <Route path="/" element={<Home />} />
                      <Route path="/explore" element={<Explore />} />
                      <Route path="/product/:id" element={<ProductDetail />} />
                      <Route path="/login" element={<Login />} />
                      <Route
                        path="/profile"
                        element={
                          <ProtectedRoute>
                            <Profile />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/inquiry"
                        element={
                          <ProtectedRoute>
                            <InquiryList />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/inquiry/new"
                        element={
                          <ProtectedRoute>
                            <Inquiry />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/inquiry/success"
                        element={
                          <ProtectedRoute>
                            <InquirySuccess />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/cart"
                        element={
                          <ProtectedRoute>
                            <Cart />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/checkout"
                        element={
                          <ProtectedRoute>
                            <Checkout />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/orders"
                        element={
                          <ProtectedRoute>
                            <Orders />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/orders/:id"
                        element={
                          <ProtectedRoute>
                            <OrderDetail />
                          </ProtectedRoute>
                        }
                      />
                      <Route
                        path="/admin"
                        element={
                          <ProtectedRoute requireAdmin>
                            <Admin />
                          </ProtectedRoute>
                        }
                      />
                    </Routes>
                  </main>
                </div>
                <Toaster position="top-center" />
              </BrowserRouter>
            </CartProvider>
          </InquiryProvider>
        </UserProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
