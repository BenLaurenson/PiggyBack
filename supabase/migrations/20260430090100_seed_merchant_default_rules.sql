-- Phase 1 #48: Seed curated merchant default rules.
--
-- Backfills the global `merchant_default_rules` table with common
-- Australian merchants and their default category. Source = 'curated'.
-- ON CONFLICT DO NOTHING so re-running is safe.
--
-- parent_category_id values map to the canonical top-level groups:
--   home, good-life, personal, transport (others as needed).

INSERT INTO public.merchant_default_rules
  (merchant_pattern, category_id, parent_category_id, source, notes)
VALUES
  -- Groceries / supermarkets
  ('Woolworths',                 'groceries', 'home',      'curated', 'Major supermarket'),
  ('Coles',                      'groceries', 'home',      'curated', 'Major supermarket'),
  ('ALDI',                       'groceries', 'home',      'curated', 'Discount supermarket'),
  ('IGA',                        'groceries', 'home',      'curated', 'Independent grocer'),
  ('Foodworks',                  'groceries', 'home',      'curated', null),
  ('Harris Farm',                'groceries', 'home',      'curated', null),
  ('Costco',                     'groceries', 'home',      'curated', null),
  ('Drakes',                     'groceries', 'home',      'curated', null),
  ('Spudshed',                   'groceries', 'home',      'curated', null),
  ('Romeo''s',                   'groceries', 'home',      'curated', null),

  -- Bottle shops / booze
  ('Dan Murphy''s',              'booze',     'good-life', 'curated', null),
  ('BWS',                        'booze',     'good-life', 'curated', null),
  ('Liquorland',                 'booze',     'good-life', 'curated', null),
  ('First Choice Liquor',        'booze',     'good-life', 'curated', null),
  ('Vintage Cellars',            'booze',     'good-life', 'curated', null),

  -- Fast food / takeaway
  ('McDonald''s',                'takeaway',  'good-life', 'curated', null),
  ('KFC',                        'takeaway',  'good-life', 'curated', null),
  ('Hungry Jack''s',             'takeaway',  'good-life', 'curated', null),
  ('Domino''s',                  'takeaway',  'good-life', 'curated', null),
  ('Pizza Hut',                  'takeaway',  'good-life', 'curated', null),
  ('Subway',                     'takeaway',  'good-life', 'curated', null),
  ('Guzman y Gomez',             'takeaway',  'good-life', 'curated', null),
  ('Mad Mex',                    'takeaway',  'good-life', 'curated', null),
  ('Boost Juice',                'takeaway',  'good-life', 'curated', null),
  ('Grill''d',                   'takeaway',  'good-life', 'curated', null),
  ('Nando''s',                   'takeaway',  'good-life', 'curated', null),
  ('Oporto',                     'takeaway',  'good-life', 'curated', null),
  ('Red Rooster',                'takeaway',  'good-life', 'curated', null),
  ('Schnitz',                    'takeaway',  'good-life', 'curated', null),
  ('Sushi Hub',                  'takeaway',  'good-life', 'curated', null),
  ('Sushi Sushi',                'takeaway',  'good-life', 'curated', null),
  ('Roll''d',                    'takeaway',  'good-life', 'curated', null),
  ('Zambrero',                   'takeaway',  'good-life', 'curated', null),
  ('Crust Pizza',                'takeaway',  'good-life', 'curated', null),
  ('Pizza Capers',               'takeaway',  'good-life', 'curated', null),
  ('Eagle Boys',                 'takeaway',  'good-life', 'curated', null),
  ('Uber Eats',                  'takeaway',  'good-life', 'curated', null),
  ('Menulog',                    'takeaway',  'good-life', 'curated', null),
  ('Deliveroo',                  'takeaway',  'good-life', 'curated', null),
  ('DoorDash',                   'takeaway',  'good-life', 'curated', null),

  -- Cafes / restaurants
  ('Starbucks',                  'restaurants-and-cafes', 'good-life', 'curated', null),
  ('Gloria Jean''s',             'restaurants-and-cafes', 'good-life', 'curated', null),
  ('The Coffee Club',            'restaurants-and-cafes', 'good-life', 'curated', null),
  ('Muffin Break',               'restaurants-and-cafes', 'good-life', 'curated', null),
  ('Michel''s Patisserie',       'restaurants-and-cafes', 'good-life', 'curated', null),
  ('Donut King',                 'restaurants-and-cafes', 'good-life', 'curated', null),
  ('Krispy Kreme',               'restaurants-and-cafes', 'good-life', 'curated', null),

  -- Fuel
  ('BP',                         'fuel',      'transport', 'curated', null),
  ('Shell',                      'fuel',      'transport', 'curated', null),
  ('Caltex',                     'fuel',      'transport', 'curated', null),
  ('Ampol',                      'fuel',      'transport', 'curated', null),
  ('7-Eleven',                   'fuel',      'transport', 'curated', null),
  ('United Petroleum',           'fuel',      'transport', 'curated', null),
  ('Mobil',                      'fuel',      'transport', 'curated', null),
  ('Liberty Petroleum',          'fuel',      'transport', 'curated', null),
  ('Puma Energy',                'fuel',      'transport', 'curated', null),
  ('OTR',                        'fuel',      'transport', 'curated', null),

  -- Public Transport / tolls
  ('Opal Travel',                'public-transport',     'transport', 'curated', null),
  ('Translink',                  'public-transport',     'transport', 'curated', null),
  ('Myki',                       'public-transport',     'transport', 'curated', null),
  ('Transperth',                 'public-transport',     'transport', 'curated', null),
  ('Metro Tasmania',             'public-transport',     'transport', 'curated', null),
  ('Linkt',                      'toll-roads',           'transport', 'curated', null),
  ('E-Toll',                     'toll-roads',           'transport', 'curated', null),
  ('Transurban',                 'toll-roads',           'transport', 'curated', null),
  ('CityLink',                   'toll-roads',           'transport', 'curated', null),

  -- Rideshare / taxis
  ('Uber',                       'taxis-and-share-cars', 'transport', 'curated', null),
  ('DiDi',                       'taxis-and-share-cars', 'transport', 'curated', null),
  ('Ola',                        'taxis-and-share-cars', 'transport', 'curated', null),
  ('Bolt',                       'taxis-and-share-cars', 'transport', 'curated', null),
  ('GoCatch',                    'taxis-and-share-cars', 'transport', 'curated', null),
  ('13CABS',                     'taxis-and-share-cars', 'transport', 'curated', null),
  ('GoGet',                      'taxis-and-share-cars', 'transport', 'curated', null),
  ('Car Next Door',              'taxis-and-share-cars', 'transport', 'curated', null),

  -- Streaming / TV / music
  ('Netflix',                    'tv-and-music', 'good-life', 'curated', null),
  ('Stan',                       'tv-and-music', 'good-life', 'curated', null),
  ('Binge',                      'tv-and-music', 'good-life', 'curated', null),
  ('Foxtel',                     'tv-and-music', 'good-life', 'curated', null),
  ('Kayo Sports',                'tv-and-music', 'good-life', 'curated', null),
  ('Disney+',                    'tv-and-music', 'good-life', 'curated', null),
  ('Disney Plus',                'tv-and-music', 'good-life', 'curated', null),
  ('Paramount+',                 'tv-and-music', 'good-life', 'curated', null),
  ('Apple TV',                   'tv-and-music', 'good-life', 'curated', null),
  ('Amazon Prime Video',         'tv-and-music', 'good-life', 'curated', null),
  ('Spotify',                    'tv-and-music', 'good-life', 'curated', null),
  ('Apple Music',                'tv-and-music', 'good-life', 'curated', null),
  ('YouTube Premium',            'tv-and-music', 'good-life', 'curated', null),
  ('YouTube Music',              'tv-and-music', 'good-life', 'curated', null),
  ('Tidal',                      'tv-and-music', 'good-life', 'curated', null),

  -- Software / games
  ('Steam',                      'games-and-software', 'good-life', 'curated', null),
  ('Epic Games',                 'games-and-software', 'good-life', 'curated', null),
  ('Nintendo eShop',             'games-and-software', 'good-life', 'curated', null),
  ('PlayStation Store',          'games-and-software', 'good-life', 'curated', null),
  ('Xbox',                       'games-and-software', 'good-life', 'curated', null),
  ('Microsoft Store',            'games-and-software', 'good-life', 'curated', null),
  ('App Store',                  'games-and-software', 'good-life', 'curated', null),
  ('Google Play',                'games-and-software', 'good-life', 'curated', null),
  ('Adobe',                      'games-and-software', 'good-life', 'curated', null),
  ('Notion',                     'games-and-software', 'good-life', 'curated', null),
  ('Figma',                      'games-and-software', 'good-life', 'curated', null),
  ('Dropbox',                    'games-and-software', 'good-life', 'curated', null),
  ('1Password',                  'games-and-software', 'good-life', 'curated', null),
  ('OpenAI',                     'games-and-software', 'good-life', 'curated', null),
  ('Anthropic',                  'games-and-software', 'good-life', 'curated', null),
  ('GitHub',                     'games-and-software', 'good-life', 'curated', null),

  -- Mobile / Internet / Telco
  ('Telstra',                    'mobile-phone', 'personal', 'curated', null),
  ('Optus',                      'mobile-phone', 'personal', 'curated', null),
  ('Vodafone',                   'mobile-phone', 'personal', 'curated', null),
  ('TPG',                        'internet',     'home',     'curated', null),
  ('Aussie Broadband',           'internet',     'home',     'curated', null),
  ('iiNet',                      'internet',     'home',     'curated', null),
  ('Belong',                     'internet',     'home',     'curated', null),
  ('Superloop',                  'internet',     'home',     'curated', null),
  ('Dodo',                       'internet',     'home',     'curated', null),

  -- Utilities
  ('AGL',                        'utilities', 'home', 'curated', null),
  ('Origin Energy',              'utilities', 'home', 'curated', null),
  ('EnergyAustralia',            'utilities', 'home', 'curated', null),
  ('Red Energy',                 'utilities', 'home', 'curated', null),
  ('Alinta Energy',              'utilities', 'home', 'curated', null),
  ('Powershop',                  'utilities', 'home', 'curated', null),
  ('Synergy',                    'utilities', 'home', 'curated', null),
  ('Ergon Energy',               'utilities', 'home', 'curated', null),
  ('Sydney Water',               'utilities', 'home', 'curated', null),
  ('Yarra Valley Water',         'utilities', 'home', 'curated', null),

  -- Homeware / hardware
  ('Bunnings',                   'homeware-and-appliances', 'home',     'curated', null),
  ('IKEA',                       'homeware-and-appliances', 'home',     'curated', null),
  ('Kmart',                      'homeware-and-appliances', 'home',     'curated', null),
  ('Target',                     'homeware-and-appliances', 'home',     'curated', null),
  ('Big W',                      'homeware-and-appliances', 'home',     'curated', null),
  ('Harvey Norman',              'homeware-and-appliances', 'home',     'curated', null),
  ('JB Hi-Fi',                   'technology',              'personal', 'curated', null),
  ('Officeworks',                'technology',              'personal', 'curated', null),
  ('The Good Guys',              'homeware-and-appliances', 'home',     'curated', null),
  ('Spotlight',                  'homeware-and-appliances', 'home',     'curated', null),
  ('Adairs',                     'homeware-and-appliances', 'home',     'curated', null),
  ('Pillow Talk',                'homeware-and-appliances', 'home',     'curated', null),

  -- Clothing
  ('Cotton On',                  'clothing-and-accessories', 'personal', 'curated', null),
  ('H&M',                        'clothing-and-accessories', 'personal', 'curated', null),
  ('Zara',                       'clothing-and-accessories', 'personal', 'curated', null),
  ('Uniqlo',                     'clothing-and-accessories', 'personal', 'curated', null),
  ('Lululemon',                  'clothing-and-accessories', 'personal', 'curated', null),
  ('Country Road',               'clothing-and-accessories', 'personal', 'curated', null),
  ('Witchery',                   'clothing-and-accessories', 'personal', 'curated', null),
  ('Sportsgirl',                 'clothing-and-accessories', 'personal', 'curated', null),
  ('Glassons',                   'clothing-and-accessories', 'personal', 'curated', null),
  ('Universal Store',            'clothing-and-accessories', 'personal', 'curated', null),
  ('JD Sports',                  'clothing-and-accessories', 'personal', 'curated', null),
  ('Rebel Sport',                'clothing-and-accessories', 'personal', 'curated', null),
  ('The Iconic',                 'clothing-and-accessories', 'personal', 'curated', null),
  ('ASOS',                       'clothing-and-accessories', 'personal', 'curated', null),

  -- Personal care
  ('Chemist Warehouse',          'health-and-medical',       'personal', 'curated', null),
  ('Priceline',                  'health-and-medical',       'personal', 'curated', null),
  ('TerryWhite Chemmart',        'health-and-medical',       'personal', 'curated', null),
  ('Mecca',                      'hair-and-beauty',          'personal', 'curated', null),
  ('Sephora',                    'hair-and-beauty',          'personal', 'curated', null),

  -- Fitness
  ('Anytime Fitness',            'fitness-and-wellbeing',    'personal', 'curated', null),
  ('Goodlife Health Clubs',      'fitness-and-wellbeing',    'personal', 'curated', null),
  ('Fitness First',              'fitness-and-wellbeing',    'personal', 'curated', null),
  ('Snap Fitness',               'fitness-and-wellbeing',    'personal', 'curated', null),
  ('F45',                        'fitness-and-wellbeing',    'personal', 'curated', null),

  -- Pubs and bars
  ('Crown',                      'pubs-and-bars',            'good-life', 'curated', null),

  -- Travel / holidays
  ('Qantas',                     'holidays-and-travel',      'good-life', 'curated', null),
  ('Jetstar',                    'holidays-and-travel',      'good-life', 'curated', null),
  ('Virgin Australia',           'holidays-and-travel',      'good-life', 'curated', null),
  ('Rex Airlines',               'holidays-and-travel',      'good-life', 'curated', null),
  ('Webjet',                     'holidays-and-travel',      'good-life', 'curated', null),
  ('Booking.com',                'holidays-and-travel',      'good-life', 'curated', null),
  ('Airbnb',                     'holidays-and-travel',      'good-life', 'curated', null),
  ('Expedia',                    'holidays-and-travel',      'good-life', 'curated', null),
  ('Flight Centre',              'holidays-and-travel',      'good-life', 'curated', null),
  ('Trivago',                    'holidays-and-travel',      'good-life', 'curated', null),

  -- Events / hobbies
  ('Ticketek',                   'events-and-gigs',          'good-life', 'curated', null),
  ('Ticketmaster',               'events-and-gigs',          'good-life', 'curated', null),
  ('Moshtix',                    'events-and-gigs',          'good-life', 'curated', null),
  ('Eventbrite',                 'events-and-gigs',          'good-life', 'curated', null),
  ('Hoyts',                      'events-and-gigs',          'good-life', 'curated', null),
  ('Event Cinemas',              'events-and-gigs',          'good-life', 'curated', null),
  ('Village Cinemas',            'events-and-gigs',          'good-life', 'curated', null),

  -- Pets
  ('Petbarn',                    'pets', 'home', 'curated', null),
  ('PETstock',                   'pets', 'home', 'curated', null),
  ('Pet Circle',                 'pets', 'home', 'curated', null),
  ('Greencross Vets',            'pets', 'home', 'curated', null),

  -- News / books
  ('News Corp',                  'news-magazines-and-books', 'personal', 'curated', null),
  ('Audible',                    'news-magazines-and-books', 'personal', 'curated', null),
  ('Kindle',                     'news-magazines-and-books', 'personal', 'curated', null),
  ('Dymocks',                    'news-magazines-and-books', 'personal', 'curated', null),
  ('Booktopia',                  'news-magazines-and-books', 'personal', 'curated', null),
  ('QBD Books',                  'news-magazines-and-books', 'personal', 'curated', null),

  -- Investments
  ('Pearler',                    'investments',              null,       'curated', null),
  ('Vanguard',                   'investments',              null,       'curated', null),
  ('Spaceship',                  'investments',              null,       'curated', null),
  ('Stake',                      'investments',              null,       'curated', null),
  ('Selfwealth',                 'investments',              null,       'curated', null),
  ('CommSec',                    'investments',              null,       'curated', null),
  ('Raiz',                       'investments',              null,       'curated', null),

  -- Charity / gifts
  ('Red Cross',                  'gifts-and-charity',        'personal', 'curated', null),
  ('World Vision',               'gifts-and-charity',        'personal', 'curated', null),
  ('UNICEF',                     'gifts-and-charity',        'personal', 'curated', null),
  ('Salvation Army',             'gifts-and-charity',        'personal', 'curated', null),

  -- Children / family
  ('Big W Kids',                 'family',                   'personal', 'curated', null),
  ('Toys R Us',                  'family',                   'personal', 'curated', null),
  ('Smiggle',                    'family',                   'personal', 'curated', null),

  -- Life admin
  ('Australia Post',             'life-admin',               'personal', 'curated', null),
  ('Australian Taxation Office', 'life-admin',               'personal', 'curated', null),
  ('Centrelink',                 'life-admin',               'personal', 'curated', null),
  ('Medicare',                   'health-and-medical',       'personal', 'curated', null),
  ('Service NSW',                'life-admin',               'personal', 'curated', null),
  ('VicRoads',                   'life-admin',               'personal', 'curated', null),
  ('Transport for NSW',          'public-transport',         'transport', 'curated', null)

ON CONFLICT (merchant_pattern) DO NOTHING;
