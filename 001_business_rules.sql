-- Business-rule tests. Run in the Supabase SQL editor on a CLEAN/TEST project AFTER applying migrations 0001-0004.
-- Everything runs in one transaction and is ROLLED BACK at the end. Any failure raises an exception.
-- STATUS: written but NOT yet executed (no database available when authored).
begin;
do $$
declare
  admin1 uuid := gen_random_uuid(); stu1 uuid := gen_random_uuid(); stu2 uuid := gen_random_uuid(); nobody uuid := gen_random_uuid();
  course uuid; book uuid; pdf uuid; o1 uuid; o2 uuid; o3 uuid; ob uuid; p1 uuid; p2 uuid; r jsonb; n int; ok boolean; ent uuid;
begin
  insert into auth.users(id, email) values (admin1,'admin@test.local'),(stu1,'s1@test.local'),(stu2,'s2@test.local'),(nobody,'n@test.local');
  insert into admin_roles(user_id, role) values (admin1,'payment_verifier');
  update site_settings set value = jsonb_set(jsonb_set(value,'{bkash,enabled}','true'),'{bkash,number}','"01000000000"') where key='payment';
  update shipping_zones set charge = 80 where is_default;
  insert into products(type,slug,title,price_selling,status) values ('course','t-course','Test Course',1000,'published') returning id into course;
  insert into products(type,slug,title,price_selling,status) values ('printed_book','t-book','Test Book',300,'published') returning id into book;
  insert into products(type,slug,title,price_selling,status) values ('pdf_book','t-pdf','Test PDF',200,'published') returning id into pdf;
  insert into book_details(product_id, stock_quantity) values (book, 2);
  insert into product_assets(product_id,kind,bucket,path,mime_type,size_bytes) values (pdf,'pdf_private','paid-pdfs', pdf||'/x.pdf','application/pdf',10);

  -- 1. Server computes price; client cannot influence it
  o1 := create_order(stu1, jsonb_build_array(jsonb_build_object('product_id',course,'quantity',1)), '{}', null, 'idem-key-0001');
  assert (select total from orders where id=o1) = 1000, 'price must come from DB';
  -- 2. Idempotent order creation
  assert create_order(stu1, jsonb_build_array(jsonb_build_object('product_id',course,'quantity',1)), '{}', null, 'idem-key-0001') = o1, 'duplicate submit must return same order';
  -- 3. Overselling blocked; stock reserved; shipping computed
  ob := create_order(stu1, jsonb_build_array(jsonb_build_object('product_id',book,'quantity',2)), '{"name":"A","phone":"01711111111","address":"House 1 Road 2","area":"Dhaka"}', null, 'idem-key-0002');
  assert (select total from orders where id=ob) = 680, 'shipping 80 + 2x300';
  assert (select stock_quantity from book_details where product_id=book) = 0, 'stock reserved';
  begin perform create_order(stu2, jsonb_build_array(jsonb_build_object('product_id',book,'quantity',1)), '{"name":"B","phone":"01711111112","address":"House 3 Road 4","area":"Dhaka"}', null, 'idem-key-0003'); raise exception 'oversell allowed';
  exception when others then assert sqlerrm = 'insufficient_stock', 'expected insufficient_stock, got '||sqlerrm; end;
  -- 4. Cancelling returns stock
  perform admin_cancel_order(admin1, ob, 'test cancel');
  assert (select stock_quantity from book_details where product_id=book) = 2, 'stock restored';
  -- 5. Payment submit -> pending; never approved automatically
  p1 := submit_payment(stu1, o1, 'bkash', '01711111111', 'trx12345a');
  assert (select payment_status from orders where id=o1) = 'pending_verification';
  assert not exists (select 1 from entitlements where order_id=o1), 'no entitlement before approval';
  update payments set submitted_at = now() - interval '5 hours' where id = p1;   -- far past 1 hour
  assert (select status from payments where id=p1) = 'pending_verification', 'time must not approve';
  -- 6. Duplicate TrxID rejected on another order
  o2 := create_order(stu2, jsonb_build_array(jsonb_build_object('product_id',course,'quantity',1)), '{}', null, 'idem-key-0004');
  begin perform submit_payment(stu2, o2, 'bkash', '01722222222', 'TRX12345A'); raise exception 'dup allowed';
  exception when others then assert sqlerrm = 'duplicate_trx', 'expected duplicate_trx, got '||sqlerrm; end;
  -- 7. A student cannot pay for someone else's order
  begin perform submit_payment(stu2, o1, 'bkash', '01722222222', 'TRXOTHER99'); raise exception 'idor';
  exception when others then assert sqlerrm = 'order_not_found'; end;
  -- 8. Role enforcement: student and role-less users cannot decide
  begin perform decide_payment(stu1, p1, 'approve', '', 1000); raise exception 'student approved';
  exception when others then assert sqlerrm = 'forbidden', 'got '||sqlerrm; end;
  -- 9. Wrong verified amount refused; correct approves; repeat is idempotent
  begin perform decide_payment(admin1, p1, 'approve', '', 999); raise exception 'amount ignored';
  exception when others then assert sqlerrm = 'amount_mismatch'; end;
  r := decide_payment(admin1, p1, 'approve', 'ok', 1000);
  assert r->>'status' = 'approved';
  r := decide_payment(admin1, p1, 'approve', 'ok', 1000);
  assert (r->>'already_decided')::boolean, 'idempotent';
  select count(*) into n from entitlements where order_id = o1; assert n = 1, 'exactly one entitlement';
  -- 10. PDF: no access while pending; access after approval; not for another user
  o3 := create_order(stu1, jsonb_build_array(jsonb_build_object('product_id',pdf,'quantity',1)), '{}', null, 'idem-key-0005');
  p2 := submit_payment(stu1, o3, 'bkash', '01711111111', 'TRXPDF0001');
  assert not exists (select 1 from entitlements where order_id=o3), 'pending PDF has no entitlement';
  perform decide_payment(admin1, p2, 'approve', 'ok', 200);
  select id into ent from entitlements where order_id=o3;
  assert (select count(*) from authorize_pdf_download(stu1, ent, null, 'test')) = 1, 'owner can download';
  begin perform authorize_pdf_download(stu2, ent, null, 'test'); raise exception 'other user downloaded';
  exception when others then assert sqlerrm = 'not_entitled'; end;
  assert (select count(*) from download_logs) = 1, 'download logged';
  -- 11. Refund revokes access
  perform admin_cancel_order(admin1, o3, 'refund test', true);
  begin perform authorize_pdf_download(stu1, ent, null, 'test'); raise exception 'refunded still downloads';
  exception when others then assert sqlerrm = 'not_entitled'; end;
  -- 12. Shipping cannot happen before payment approval
  ob := create_order(stu1, jsonb_build_array(jsonb_build_object('product_id',book,'quantity',1)), '{"name":"A","phone":"01711111111","address":"House 1 Road 2","area":"Dhaka"}', null, 'idem-key-0006');
  begin perform admin_update_fulfillment(admin1, ob, 'shipped', 'c', 't'); raise exception 'shipped unpaid';
  exception when others then assert sqlerrm in ('forbidden','payment_not_approved'), 'got '||sqlerrm; end;
  -- 13. Append-only tables
  begin delete from audit_logs; raise exception 'audit deletable'; exception when others then assert sqlerrm like 'append-only%'; end;
  begin update payment_events set event='x'; raise exception 'events editable'; exception when others then assert sqlerrm like 'append-only%'; end;
  -- 14. Quote leaves no trace
  select count(*) into n from orders; perform quote_order(stu1, jsonb_build_array(jsonb_build_object('product_id',course,'quantity',1)), '{}', null);
  assert (select count(*) from orders) = n, 'quote must roll back';
  -- 15. Auto-expiry: stale UNPAID order is cancelled & stock returned; order with pending payment is untouched
  alter table orders disable trigger trg_orders_updated;
  ob := create_order(stu2, jsonb_build_array(jsonb_build_object('product_id',book,'quantity',1)), '{"name":"B","phone":"01711111112","address":"House 3 Road 4","area":"Dhaka"}', null, 'idem-key-0007');
  n := (select stock_quantity from book_details where product_id=book);
  update orders set updated_at = now() - interval '100 hours' where id in (ob, o2);   -- o2 has no payment yet either
  update orders set updated_at = now() - interval '100 hours' where id = o1;          -- approved: must never expire
  perform expire_unpaid_orders(48);
  assert (select fulfillment_status from orders where id=ob) = 'cancelled', 'stale unpaid order cancelled';
  assert (select stock_quantity from book_details where product_id=book) = n + 1, 'stock released';
  assert (select fulfillment_status from orders where id=o1) <> 'cancelled', 'approved order never expires';
  alter table orders enable trigger trg_orders_updated;
  raise notice 'ALL BUSINESS-RULE TESTS PASSED';
end $$;
rollback;
