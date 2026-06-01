-- Refresh provisional World Cup draft prices after the path-aware calibration pass.
-- Keep this separate from the initial seed migration so already-migrated databases update.

update public.teams as existing
set cost = incoming.cost
from (values
  ('Mexico', 11), ('South Africa', 4), ('Korea Republic', 7), ('Czechia', 7),
  ('Canada', 9), ('Bosnia and Herzegovina', 6), ('Qatar', 4), ('Switzerland', 10),
  ('Brazil', 16), ('Morocco', 8), ('Haiti', 4), ('Scotland', 6),
  ('USA', 8), ('Paraguay', 8), ('Australia', 7), ('Türkiye', 9),
  ('Germany', 13), ('Curaçao', 4), ('Côte d''Ivoire', 6), ('Ecuador', 9),
  ('Netherlands', 14), ('Japan', 8), ('Sweden', 6), ('Tunisia', 5),
  ('Belgium', 10), ('Egypt', 6), ('IR Iran', 7), ('New Zealand', 6),
  ('Spain', 24), ('Cabo Verde', 5), ('Saudi Arabia', 4), ('Uruguay', 8),
  ('France', 21), ('Senegal', 8), ('Iraq', 4), ('Norway', 10),
  ('Argentina', 19), ('Algeria', 6), ('Austria', 7), ('Jordan', 6),
  ('Portugal', 13), ('Colombia', 11), ('Uzbekistan', 6), ('Congo DR', 5),
  ('England', 14), ('Croatia', 10), ('Ghana', 4), ('Panama', 6)
) as incoming(name, cost)
where existing.competition_slug = 'world-cup'
  and existing.name = incoming.name;
