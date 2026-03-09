-- Store encrypted pool passwords for commissioner/admin display.
-- Existing pools remain null until their password is rotated.
alter table public.pools
  add column if not exists join_password_ciphertext text;
