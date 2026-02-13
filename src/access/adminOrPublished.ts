import type { Access } from 'payload'

import { hasAdminRole } from './roles'

export const adminOrPublished: Access = ({ req: { user } }) => {
  if (hasAdminRole(user)) {
    return true
  }

  return {
    _status: {
      equals: 'published',
    },
  }
}
