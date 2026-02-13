import type { CollectionConfig } from 'payload'

export const ChatConversations: CollectionConfig = {
  slug: 'chat-conversations',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'language', 'updatedAt'],
  },
  access: {
    create: () => true, // Anyone can create a chat
    read: () => true, // Anyone can read (public chat)
    update: () => true, // Anyone can update (append messages)
    delete: ({ req: { user } }) => Boolean(user), // Only authenticated users can delete
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      admin: {
        description: 'Auto-generated from first user message',
      },
    },
    {
      name: 'chatId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        description: 'Unique chat ID generated client-side',
      },
    },
    {
      name: 'messages',
      type: 'json',
      required: true,
      defaultValue: [],
      admin: {
        description: 'Array of UIMessage objects from AI SDK',
      },
    },
    {
      name: 'language',
      type: 'select',
      options: [
        { label: 'English', value: 'en' },
        { label: 'Vietnamese', value: 'vi' },
      ],
      defaultValue: 'en',
    },
    {
      name: 'bookSlug',
      type: 'text',
      admin: {
        description: 'Associated handbook book slug for RAG context',
      },
    },
    {
      name: 'messageCount',
      type: 'number',
      defaultValue: 0,
      admin: {
        description: 'Number of messages in the conversation',
      },
    },
  ],
  timestamps: true,
}
