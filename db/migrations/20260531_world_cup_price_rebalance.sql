-- Refresh provisional World Cup draft prices after the path-aware calibration pass.
-- Keep this separate from the initial seed migration so already-migrated databases update.

update public.teams as existing
set cost = incoming.cost
from (values
  ('Mexico', 18), ('South Africa', 9), ('Korea Republic', 14), ('Czechia', 14),
  ('Canada', 16), ('Bosnia and Herzegovina', 13), ('Qatar', 7), ('Switzerland', 16),
  ('Brazil', 20), ('Morocco', 14), ('Haiti', 8), ('Scotland', 13),
  ('USA', 15), ('Paraguay', 14), ('Australia', 13), ('Türkiye', 16),
  ('Germany', 19), ('Curaçao', 8), ('Côte d''Ivoire', 12), ('Ecuador', 16),
  ('Netherlands', 19), ('Japan', 15), ('Sweden', 12), ('Tunisia', 10),
  ('Belgium', 16), ('Egypt', 13), ('IR Iran', 14), ('New Zealand', 12),
  ('Spain', 24), ('Cabo Verde', 10), ('Saudi Arabia', 9), ('Uruguay', 15),
  ('France', 23), ('Senegal', 15), ('Iraq', 4), ('Norway', 17),
  ('Argentina', 22), ('Algeria', 12), ('Austria', 14), ('Jordan', 12),
  ('Portugal', 19), ('Colombia', 17), ('Uzbekistan', 12), ('Congo DR', 9),
  ('England', 19), ('Croatia', 17), ('Ghana', 7), ('Panama', 12)
) as incoming(name, cost)
where existing.competition_slug = 'world-cup'
  and existing.name = incoming.name;
