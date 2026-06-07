-- Lower World Cup draft prices to make larger rosters more viable.
-- Longshot and Moonshot teams move to tiny-cost tiers while reduced bonuses prevent cheap-team arbitrage.

update public.teams as existing
set cost = incoming.cost
from (values
  ('Mexico', 16), ('South Africa', 5), ('Korea Republic', 10), ('Czechia', 10),
  ('Canada', 16), ('Bosnia and Herzegovina', 7), ('Qatar', 3), ('Switzerland', 16),
  ('Brazil', 20), ('Morocco', 10), ('Haiti', 5), ('Scotland', 7),
  ('USA', 10), ('Paraguay', 10), ('Australia', 10), ('Türkiye', 16),
  ('Germany', 20), ('Curaçao', 5), ('Côte d''Ivoire', 7), ('Ecuador', 16),
  ('Netherlands', 20), ('Japan', 10), ('Sweden', 7), ('Tunisia', 5),
  ('Belgium', 16), ('Egypt', 7), ('IR Iran', 10), ('New Zealand', 7),
  ('Spain', 24), ('Cabo Verde', 5), ('Saudi Arabia', 5), ('Uruguay', 10),
  ('France', 22), ('Senegal', 10), ('Iraq', 3), ('Norway', 16),
  ('Argentina', 22), ('Algeria', 7), ('Austria', 10), ('Jordan', 7),
  ('Portugal', 20), ('Colombia', 16), ('Uzbekistan', 7), ('Congo DR', 5),
  ('England', 20), ('Croatia', 16), ('Ghana', 3), ('Panama', 7)
) as incoming(name, cost)
where existing.competition_slug = 'world-cup'
  and existing.name = incoming.name;
