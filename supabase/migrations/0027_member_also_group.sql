alter table public.members add column if not exists also_group boolean not null default false;
comment on column public.members.also_group is 'PT clients are hidden from group class lists unless this is true (PT + group members).';
