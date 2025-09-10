import { useSettings } from '@/hooks/useSettings';

export default function PageHeader() {
  const { settings } = useSettings();

  return (
    <div className="border-b border-border bg-surface/50 backdrop-blur-sm shadow-material-sm mb-6">
      <div className="flex items-center gap-4 p-4">
        {settings?.logo_url && (
          <img 
            src={settings.logo_url} 
            alt="Business Logo" 
            className="h-10 w-10 object-contain"
          />
        )}
        <div>
          <h1 className="text-xl font-bold text-primary">
            {settings?.business_name || 'FieldFlow'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Field Service Management Platform
          </p>
        </div>
      </div>
    </div>
  );
}