import React, { createContext, useContext, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import './i18n';

import { useAuth } from './hooks/useAuth';
import { initializeSync } from './lib/syncEngine';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import StockInPage from './pages/StockInPage';
import StockOutPage from './pages/StockOutPage';
import ProductFormPage from './pages/ProductFormPage';
import SearchPage from './pages/SearchPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';

import BottomNav from './components/BottomNav';
import SyncStatusBar from './components/SyncStatusBar';

export const AuthContext = createContext(null);

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }) {
  const auth = useAuth();

  useEffect(() => {
    if (auth.user) {
      const cleanup = initializeSync();
      return () => { if (typeof cleanup === 'function') cleanup(); };
    }
  }, [auth.user]);

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
}

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-base-100 p-4">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="mt-4 text-base font-medium text-base-content/70">Loading StockEasy...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-base-200 text-base-content pb-20">
      <SyncStatusBar />
      <main className="flex-1 w-full max-w-md mx-auto p-4 sm:max-w-lg md:max-w-xl">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}

function PublicRoute({ children }) {
  const { user, loading } = useAuthContext();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-base-100 p-4">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Route */}
          <Route
            path="/login"
            element={
              <PublicRoute>
                <LoginPage />
              </PublicRoute>
            }
          />

          {/* Protected Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock-in"
            element={
              <ProtectedRoute>
                <StockInPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/stock-out"
            element={
              <ProtectedRoute>
                <StockOutPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/product/new"
            element={
              <ProtectedRoute>
                <ProductFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/product/new/:barcode"
            element={
              <ProtectedRoute>
                <ProductFormPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/search"
            element={
              <ProtectedRoute>
                <SearchPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reports"
            element={
              <ProtectedRoute>
                <ReportsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />

          {/* Catch-all fallback route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {/* Global Toast Notifications */}
        <Toaster
          position="top-center"
          reverseOrder={false}
          toastOptions={{
            duration: 3500,
            style: {
              background: '#1f2937',
              color: '#ffffff',
              fontSize: '15px',
              padding: '12px 16px',
              borderRadius: '12px',
              minHeight: '48px',
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
