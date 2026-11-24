-- Seed suppliers for the live directory.
--
-- Replace every placeholder below with a real or friendly supplier who has agreed to take
-- part and given you their cNGN payout wallet in person or on a call. Leave wallet_address
-- empty until you have verified it: the agent will not pay a supplier without a wallet.
-- Set verified = true only after you have checked the business and the wallet.
--
-- These rows have no owner_id, so they are managed here (service role / SQL editor).
-- Suppliers who sign up through /supplier own and edit their own rows.

insert into public.suppliers (id, name, location, wallet_address, currency, verified, contact) values
  ('00000000-0000-4000-8000-000000000001', 'REPLACE: Supplier 1 name', 'Lagos', '', 'cNGN', false, 'REPLACE: phone or email'),
  ('00000000-0000-4000-8000-000000000002', 'REPLACE: Supplier 2 name', 'Lagos', '', 'cNGN', false, 'REPLACE: phone or email'),
  ('00000000-0000-4000-8000-000000000003', 'REPLACE: Supplier 3 name', 'Abuja', '', 'cNGN', false, 'REPLACE: phone or email')
on conflict (id) do nothing;

insert into public.products (supplier_id, name, unit, unit_price, delivery_fee, stock, delivery_days, delivery_areas) values
  ('00000000-0000-4000-8000-000000000001', 'Parboiled rice 50kg bag', '50kg bag', '0', '0', 0, 3, '{Lagos}'),
  ('00000000-0000-4000-8000-000000000002', 'Groundnut oil 25 litre jerrycan', '25L jerrycan', '0', '0', 0, 2, '{Lagos}'),
  ('00000000-0000-4000-8000-000000000003', 'Instant noodles carton (40 packs)', 'carton', '0', '0', 0, 4, '{Abuja}')
on conflict do nothing;

-- Once verified:
-- update public.suppliers set wallet_address = '0x…', verified = true where id = '00000000-0000-4000-8000-000000000001';
-- update public.products set unit_price = '36500', delivery_fee = '15000', stock = 120 where supplier_id = '00000000-0000-4000-8000-000000000001';
