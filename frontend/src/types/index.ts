export interface User {
  id: number
  username: string
  email: string
  full_name: string | null
  role: 'admin' | 'leader' | 'manager' | 'staff'
  is_active: boolean
  created_at: string
  // Staff context — populated by /auth/me
  staff_id: number | null
  department_id: number | null
}

// Role helpers
export const ROLE_LABELS: Record<string, string> = {
  admin:   'Admin',
  leader:  'Lãnh đạo',
  manager: 'Quản lý',
  staff:   'Nhân viên',
}

export function hasRole(user: User | null, ...roles: string[]): boolean {
  return !!user && roles.includes(user.role)
}

export function isAdminOrLeader(user: User | null): boolean {
  return hasRole(user, 'admin', 'leader')
}

export function isManagerOrAbove(user: User | null): boolean {
  return hasRole(user, 'admin', 'leader', 'manager')
}
