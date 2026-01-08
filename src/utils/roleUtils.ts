export type UserRole = 'business_admin' | 'contractor' | 'client';

export const getRoleDisplayName = (role: UserRole): string => {
  switch (role) {
    case 'business_admin':
      return 'Business Admin';
    case 'contractor':
      return 'Contractor';
    case 'client':
      return 'Client';
    default:
      return 'Unknown Role';
  }
};

export const canAccessSettings = (role: UserRole | null): boolean => {
  return role === 'business_admin';
};

export const canManageUsers = (role: UserRole | null): boolean => {
  return role === 'business_admin';
};

export const isClientRole = (role: UserRole | null): boolean => {
  return role === 'client';
};

