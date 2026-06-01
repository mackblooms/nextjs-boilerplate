-- Refresh provisional World Cup draft prices after the path-aware calibration pass.
-- Keep this separate from the initial seed migration so already-migrated databases update.

update public.teams as existing
set cost = incoming.cost
from (values
  ('Mexico', 17), ('South Africa', 10), ('Korea Republic', 14), ('Czechia', 14),
  ('Canada', 17), ('Bosnia and Herzegovina', 12), ('Qatar', 7), ('Switzerland', 17),
  ('Brazil', 20), ('Morocco', 14), ('Haiti', 10), ('Scotland', 12),
  ('USA', 14), ('Paraguay', 14), ('Australia', 14), ('Türkiye', 17),
  ('Germany', 20), ('Curaçao', 10), ('Côte d''Ivoire', 12), ('Ecuador', 17),
  ('Netherlands', 20), ('Japan', 14), ('Sweden', 12), ('Tunisia', 10),
  ('Belgium', 17), ('Egypt', 12), ('IR Iran', 14), ('New Zealand', 12),
  ('Spain', 24), ('Cabo Verde', 10), ('Saudi Arabia', 10), ('Uruguay', 14),
  ('France', 22), ('Senegal', 14), ('Iraq', 7), ('Norway', 17),
  ('Argentina', 22), ('Algeria', 12), ('Austria', 14), ('Jordan', 12),
  ('Portugal', 20), ('Colombia', 17), ('Uzbekistan', 12), ('Congo DR', 10),
  ('England', 20), ('Croatia', 17), ('Ghana', 7), ('Panama', 12)
) as incoming(name, cost)
where existing.competition_slug = 'world-cup'
  and existing.name = incoming.name;
