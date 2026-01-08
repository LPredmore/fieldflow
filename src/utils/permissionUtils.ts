export interface UserPermissions {
  send_quotes: boolean;
  access_services: boolean;
  access_invoicing: boolean;
  supervisor: boolean;
}

export const hasPermission = (permissions: UserPermissions | null, permissionName: keyof UserPermissions): boolean => {
  if (!permissions) return false;
  return permissions[permissionName] === true;
};

export const canSendQuotes = (permissions: UserPermissions | null): boolean => {
  return hasPermission(permissions, 'send_quotes');
};

export const canAccessServices = (permissions: UserPermissions | null): boolean => {
  return hasPermission(permissions, 'access_services');
};

export const canAccessInvoicing = (permissions: UserPermissions | null): boolean => {
  return hasPermission(permissions, 'access_invoicing');
};

export const canSupervise = (permissions: UserPermissions | null): boolean => {
  return hasPermission(permissions, 'supervisor');
};

// Default permissions for fallback scenarios
export const getDefaultPermissions = (role: 'business_admin' | 'contractor' | 'client' | null): UserPermissions => {
  if (role === 'business_admin') {
    return {
      send_quotes: true,
      access_services: true,
      access_invoicing: true,
      supervisor: true,
    };
  }
  
  // Contractors and clients get no permissions by default
  return {
    send_quotes: false,
    access_services: false,
    access_invoicing: false,
    supervisor: false,
  };
};