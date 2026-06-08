-- Track which saved draft each pool entry was submitted from.
-- Enables cascading entry removal when a draft is deleted from the library.

alter table public.entries
  add column if not exists saved_draft_id uuid references public.saved_drafts(id) on delete set null;

create index if not exists entries_saved_draft_id_idx
  on public.entries (saved_draft_id);
