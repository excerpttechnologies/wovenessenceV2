import mongoose from 'mongoose';
import { buildContactSchema, COLLECTION_BY_KIND, LABEL_FIELD } from './contactSchema.js';

/* Agents - their own collection, `agent`.

   Moved out of the shared `contact` collection with their original _id
   (scripts/migrateContactsToSeparateCollections.mjs), so every agentId on a
   GRC, a purchase invoice or a supplier - and every salesPersonId, which the
   sales screens pick from the agent list - still resolves here. */

export { LABEL_FIELD };

const AgentSchema = buildContactSchema({ kind: 'Agent' });

export const AGENT_COLLECTION = COLLECTION_BY_KIND.Agent;

export default mongoose.models.agent ||
  mongoose.model('agent', AgentSchema, AGENT_COLLECTION);
