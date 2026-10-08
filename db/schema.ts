import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const contributions = sqliteTable('community_contributions', {
  id: text('id').primaryKey(),
  address: text('address').notNull().unique(),
  firstAt: integer('first_at').notNull(),
  txHash: text('tx_hash').notNull(),
  network: text('network').notNull(),
  partial: integer('partial').notNull(),
  message: text('message').notNull(),
  visible: integer('visible').notNull().default(1),
  topic: text('topic').notNull(),
  editHash: text('edit_hash').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, t => [index('community_created_idx').on(t.createdAt)]);
export const limits = sqliteTable('community_limits', {
  key: text('key').primaryKey(),
  window: integer('window').notNull(),
  attempts: integer('attempts').notNull(),
});
export const evidence = sqliteTable('evidence_submissions', {
 id:text('id').primaryKey(),sourceUrl:text('source_url').notNull(),eventDate:text('event_date').notNull(),title:text('title').notNull(),summary:text('summary').notNull(),topic:text('topic').notNull(),status:text('status').notNull().default('pending'),submittedAt:integer('submitted_at').notNull(),publishedAt:integer('published_at'),reviewNote:text('review_note').notNull().default(''),category:text('category').notNull().default('context'),questionId:text('question_id')
},t=>[index('evidence_status_idx').on(t.status,t.submittedAt)]);
export const questionSignals = sqliteTable('question_signals', {
 key:text('key').primaryKey(),questionId:text('question_id').notNull(),createdAt:integer('created_at').notNull()
},t=>[index('question_signal_idx').on(t.questionId)]);
export const reports = sqliteTable('community_reports', {
 key:text('key').primaryKey(),entryId:text('entry_id').notNull(),reason:text('reason').notNull(),createdAt:integer('created_at').notNull()
},t=>[index('report_entry_idx').on(t.entryId)]);
export const voices = sqliteTable('community_voices', {
 id:text('id').primaryKey(),message:text('message').notNull(),topic:text('topic').notNull(),editHash:text('edit_hash').notNull().unique(),createdAt:integer('created_at').notNull(),updatedAt:integer('updated_at').notNull(),visible:integer('visible').notNull().default(1)
},t=>[index('voice_created_idx').on(t.createdAt)]);
export const voiceReactions = sqliteTable('voice_reactions', {
 key:text('key').primaryKey(),entryId:text('entry_id').notNull().references(()=>voices.id,{onDelete:'cascade'}),kind:text('kind').notNull(),createdAt:integer('created_at').notNull()
},t=>[index('voice_reaction_idx').on(t.entryId,t.kind)]);
