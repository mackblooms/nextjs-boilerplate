-- Refresh provisional World Cup draft prices after the path-aware calibration pass.
-- Keep this separate from the initial seed migration so already-migrated databases update.

update public.teams as existing
set cost = incoming.cost
from (values
  ('Mexico', 10), ('South Africa', 4), ('Korea Republic', 6), ('Czechia', 6),
  ('Canada', 8), ('Bosnia and Herzegovina', 6), ('Qatar', 4), ('Switzerland', 9),
  ('Brazil', 17), ('Morocco', 7), ('Haiti', 4), ('Scotland', 6),
  ('USA', 7), ('Paraguay', 7), ('Australia', 6), ('Türkiye', 8),
  ('Germany', 13), ('Curaçao', 4), ('Côte d''Ivoire', 5), ('Ecuador', 8),
  ('Netherlands', 13), ('Japan', 7), ('Sweden', 5), ('Tunisia', 4),
  ('Belgium', 9), ('Egypt', 6), ('IR Iran', 6), ('New Zealand', 5),
  ('Spain', 24), ('Cabo Verde', 5), ('Saudi Arabia', 4), ('Uruguay', 7),
  ('France', 22), ('Senegal', 8), ('Iraq', 4), ('Norway', 9),
  ('Argentina', 20), ('Algeria', 5), ('Austria', 7), ('Jordan', 5),
  ('Portugal', 14), ('Colombia', 10), ('Uzbekistan', 6), ('Congo DR', 4),
  ('England', 15), ('Croatia', 9), ('Ghana', 4), ('Panama', 5)
) as incoming(name, cost)
where existing.competition_slug = 'world-cup'
  and existing.name = incoming.name;
