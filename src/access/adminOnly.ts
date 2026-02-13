import type { Access } from 'payload'

import { hasAdminRole } from './roles'

export const adminOnly: Access = ({ req: { user } }) => {
  return hasAdminRole(user)
}
