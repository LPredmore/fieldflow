import { ReactNode } from 'react';
import Navigation from '@/components/Layout/Navigation';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      {/* Main Content */}
      <div className="lg:ml-64">
        {children}
      </div>
    </div>
  );
}