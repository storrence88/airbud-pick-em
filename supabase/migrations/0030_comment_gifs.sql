-- GIFs in game comments: a comment can carry one GIPHY GIF, with or without
-- text. Only the GIPHY id is stored (the app builds the image link from it),
-- plus its size so the comment doesn't jump while the GIF loads.
-- Safe to run more than once. Run after 0029 in the Supabase SQL editor.

alter table comments add column if not exists gif_id text;
alter table comments add column if not exists gif_width int;
alter table comments add column if not exists gif_height int;

alter table comments drop constraint if exists comments_gif_id_check;
alter table comments add constraint comments_gif_id_check
  check (gif_id is null or gif_id ~ '^[A-Za-z0-9]{1,64}$');

-- Text is optional when there's a GIF.
alter table comments drop constraint if exists comments_body_check;
alter table comments add constraint comments_body_check
  check (char_length(body) <= 500 and (char_length(body) >= 1 or gif_id is not null));
