-- Language for notifications (English / Hindi / Gujarati). Safe to run more than once.
alter table profiles add column if not exists language text not null default 'en';
alter table profiles drop constraint if exists profiles_language_check;
alter table profiles add constraint profiles_language_check check (language in ('en','hi','gu'));
grant update (language) on profiles to authenticated;
