import AiAssistantClient from '@/components/ai-assistant/AiAssistantClient';

export const metadata = {
  title: 'AI Business Assistant · Woven Essence ERP',
  description: 'Ask authorised business questions across sales, inventory, purchases, customers and the storefront.',
};

/* The workspace is a client component because it holds a conversation,
   streams answers and remembers history in this browser. All business data
   comes from /api/ai-assistant/chat, which enforces the session's permissions
   server-side - nothing here queries the database. */
export default function AiAssistantPage() {
  return (
    <div className="mx-auto w-full max-w-[1400px] py-1">
      <AiAssistantClient />
    </div>
  );
}
