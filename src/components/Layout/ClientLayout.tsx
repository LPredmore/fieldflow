import { ReactNode } from 'react';
import { ClientNavigation } from './ClientNavigation';
import { BrandColorProvider } from '@/components/BrandColorProvider';

interface ClientLayoutProps {
  children: ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  return (
    <BrandColorProvider>
      <div className="min-h-screen bg-background">
        <ClientNavigation />
        <main className="lg:pl-64">
          <div className="min-h-screen">
            {children}
          </div>
        </main>
      </div>
    </BrandColorProvider>
  );
}
