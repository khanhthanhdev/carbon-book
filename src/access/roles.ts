type UserWithRoles = {
  roles?: (string | null)[] | null
} | null

const hasRole = (user: UserWithRoles, role: 'admin' | 'super-admin'): boolean => {
  const roles = user?.roles

  if (!Array.isArray(roles)) return false

  return roles.includes(role)
}

export const hasAdminRole = (user: UserWithRoles): boolean => {
  return hasRole(user, 'admin') || hasRole(user, 'super-admin')
}

export const hasSuperAdminRole = (user: UserWithRoles): boolean => {
  return hasRole(user, 'super-admin')
}
