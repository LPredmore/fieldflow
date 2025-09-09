export type UserRole = 'business_admin' | 'contractor';

export const getRoleDisplayName = (role: UserRole): string => {
  switch (role) {
    case 'business_admin':
      return 'Business Admin';
    case 'contractor':
      return 'Contractor';
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

export const canViewAllData = (role: UserRole | null): boolean => {
  return role === 'business_admin';
};