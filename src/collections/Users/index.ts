import type { CollectionBeforeChangeHook, CollectionConfig, PayloadRequest } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { hasSuperAdminRole } from '@/access/roles'
import { superAdminOnly } from '@/access/superAdminOnly'

const canCreateFirstUserOrSuperAdmin = async ({ req }: { req: PayloadRequest }) => {
  if (hasSuperAdminRole(req.user)) {
    return true
  }

  const users = await req.payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })

  return users.totalDocs === 0
}

const assignSuperAdminToFirstUser: CollectionBeforeChangeHook = async ({
  data,
  operation,
  req,
}) => {
  if (operation !== 'create') {
    return data
  }

  const users = await req.payload.find({
    collection: 'users',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req,
  })

  if (users.totalDocs > 0) {
    return data
  }

  return {
    ...(data || {}),
    roles: ['super-admin'],
  }
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: superAdminOnly,
    create: canCreateFirstUserOrSuperAdmin,
    delete: superAdminOnly,
    read: adminOnly,
    update: superAdminOnly,
  },
  admin: {
    defaultColumns: ['name', 'email', 'roles'],
    useAsTitle: 'name',
  },
  auth: true,
  hooks: {
    beforeChange: [assignSuperAdminToFirstUser],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: ['admin'],
      options: [
        {
          label: 'Super Admin',
          value: 'super-admin',
        },
        {
          label: 'Admin',
          value: 'admin',
        },
      ],
      required: true,
      saveToJWT: true,
      access: {
        create: superAdminOnly,
        update: superAdminOnly,
      },
    },
  ],
  timestamps: true,
}
