import type { PayloadRequest } from 'payload'

import { hasSuperAdminRole } from './roles'

export const superAdminOnly = ({ req }: { req: PayloadRequest }): boolean => {
  return hasSuperAdminRole(req.user)
}
