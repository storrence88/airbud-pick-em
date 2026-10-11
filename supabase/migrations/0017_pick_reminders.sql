-- Pick reminders: a few hours before each game day's first kickoff, anyone
-- with open picks that day gets a nudge by email or a Discord DM from the
-- league's bot. Safe to run more than once. Run after 0016 in the Supabase
-- SQL editor (or `supabase db push`).

-- How each player wants to be reminded. Email works for everyone; Discord
-- DMs need a Discord sign-in and the league's bot to send them.
alter table profiles
  add column if not exists reminder_channel text not null default 'email';

alter table profiles drop constraint if exists reminder_channel_choice;
alter table profiles
  add constraint reminder_channel_choice
  check (reminder_channel in ('email', 'discord', 'off'));

-- One email per player per game day (the US Eastern date, like 2026-10-11),
-- however many leagues they're in or how often the job runs. The job claims
-- a row before sending and gives it back if the send fails. Server only: RLS
-- on with no policies, so only the secret key can read or write it.
create table if not exists reminder_log (
  user_id uuid not null references profiles (id) on delete cascade,
  slate text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, slate)
);

alter table reminder_log enable row level security;
