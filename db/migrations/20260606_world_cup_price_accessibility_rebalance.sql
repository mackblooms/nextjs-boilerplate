-- Lower selected World Cup draft prices to make larger rosters more viable.
-- Value teams intentionally stay above 10 so they do not inherit the Breakout Bonus.

update public.teams as existing
set cost = incoming.cost
from (values
  ('Mexico', 17), ('South Africa', 8), ('Korea Republic', 13), ('Czechia', 13),
  ('Canada', 17), ('Bosnia and Herzegovina', 11), ('Qatar', 5), ('Switzerland', 17),
  ('Brazil', 20), ('Morocco', 13), ('Haiti', 8), ('Scotland', 11),
  ('USA', 13), ('Paraguay', 13), ('Australia', 13), ('Türkiye', 17),
  ('Germany', 20), ('Curaçao', 8), ('Côte d''Ivoire', 11), ('Ecuador', 17),
  ('Netherlands', 20), ('Japan', 13), ('Sweden', 11), ('Tunisia', 8),
  ('Belgium', 17), ('Egypt', 11), ('IR Iran', 13), ('New Zealand', 11),
  ('Spain', 24), ('Cabo Verde', 8), ('Saudi Arabia', 8), ('Uruguay', 13),
  ('France', 22), ('Senegal', 13), ('Iraq', 5), ('Norway', 17),
  ('Argentina', 22), ('Algeria', 11), ('Austria', 13), ('Jordan', 11),
  ('Portugal', 20), ('Colombia', 17), ('Uzbekistan', 11), ('Congo DR', 8),
  ('England', 20), ('Croatia', 17), ('Ghana', 5), ('Panama', 11)
) as incoming(name, cost)
where existing.competition_slug = 'world-cup'
  and existing.name = incoming.name;
