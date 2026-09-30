-- AICS Padel Championship 2027 - V9.9.98
-- Portafoglio virtuale tessere con registro movimenti e compensazione automatica.

alter table public.tesseramento_requests
  add column if not exists gross_amount numeric(10,2),
  add column if not exists wallet_credit_used numeric(10,2) not null default 0;

update public.tesseramento_requests
set gross_amount = amount
where gross_amount is null;

alter table public.tesseramento_requests
  alter column gross_amount set not null;

create table if not exists public.team_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  amount numeric(10,2) not null check (amount <> 0),
  movement_type text not null check (movement_type in (
    'card_blocked_before_issue','card_already_generated',
    'request_usage','request_refund','manual_adjustment'
  )),
  player_id uuid references public.roster_requests(id) on delete set null,
  request_id uuid references public.tesseramento_requests(id) on delete set null,
  description text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists team_wallet_one_card_credit_per_player
  on public.team_wallet_transactions(player_id)
  where movement_type in ('card_blocked_before_issue','card_already_generated');

create unique index if not exists team_wallet_one_usage_per_request
  on public.team_wallet_transactions(request_id)
  where movement_type = 'request_usage';

create unique index if not exists team_wallet_one_refund_per_request
  on public.team_wallet_transactions(request_id)
  where movement_type = 'request_refund';

alter table public.team_wallet_transactions enable row level security;
revoke all on table public.team_wallet_transactions from anon, authenticated;

create or replace function public.admin_credit_team_wallet(
  p_team_id uuid,
  p_player_id uuid,
  p_outcome text
) returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_player public.roster_requests%rowtype;
  v_credit numeric(10,2);
  v_type text;
  v_balance numeric(10,2);
begin
  if not public.is_v9_admin() then raise exception 'Solo Admin.'; end if;

  select * into v_player from public.roster_requests
  where id=p_player_id and team_id=p_team_id;
  if v_player.id is null then raise exception 'Giocatore non trovato nella squadra.'; end if;

  if p_outcome='blocked_before_issue' then
    v_credit:=15; v_type:='card_blocked_before_issue';
  elsif p_outcome='already_generated' then
    v_credit:=10; v_type:='card_already_generated';
  else
    raise exception 'Esito tessera non valido.';
  end if;

  if not exists (
    select 1
    from public.tesseramento_request_players rp
    join public.tesseramento_requests q on q.id=rp.request_id
    where rp.player_id=p_player_id and q.team_id=p_team_id and q.status<>'cancelled'
      and (q.receipt_url is not null or q.status in ('admin_approved','submitted'))
  ) then
    raise exception 'Non risulta un pagamento acquisito per questa tessera.';
  end if;

  insert into public.team_wallet_transactions(
    team_id,amount,movement_type,player_id,description,created_by
  ) values (
    p_team_id,v_credit,v_type,p_player_id,
    case when p_outcome='blocked_before_issue'
      then 'Tessera bloccata prima della generazione: credito integrale.'
      else 'Tessera già generata: credito parziale.' end,
    auth.uid()
  );

  select coalesce(sum(amount),0) into v_balance
  from public.team_wallet_transactions where team_id=p_team_id;

  return jsonb_build_object('ok',true,'credit',v_credit,'balance',v_balance);
exception when unique_violation then
  raise exception 'Il credito per questo giocatore è già stato registrato.';
end;
$function$;

create or replace function public.admin_create_tesseramento_request(p_team_id uuid, p_player_ids uuid[], p_notes text default null, p_test_mode boolean default false)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_s public.tesseramento_settings%rowtype; v_id uuid; v_count int;
  v_gross numeric(10,2); v_balance numeric(10,2); v_used numeric(10,2); v_amount numeric(10,2); v_num text;
begin
  if not public.is_v9_admin() then raise exception 'Solo Admin.'; end if;
  if coalesce(array_length(p_player_ids,1),0)=0 then raise exception 'Seleziona almeno un giocatore.'; end if;
  select * into v_s from public.tesseramento_settings where id=1;
  select count(*) into v_count
  from public.player_registration_status s join public.roster_requests r on r.id=s.player_id
  where s.team_id=p_team_id and s.registration_status='da_tesserare'
    and r.status='approved' and s.player_id=any(p_player_ids);
  if v_count<>array_length(p_player_ids,1) then raise exception 'Uno o più giocatori non sono disponibili per questa richiesta.'; end if;

  perform pg_advisory_xact_lock(hashtext(p_team_id::text));
  select greatest(coalesce(sum(amount),0),0) into v_balance
  from public.team_wallet_transactions where team_id=p_team_id;
  v_gross:=v_count*v_s.fee_per_player;
  v_used:=least(v_gross,v_balance);
  v_amount:=v_gross-v_used;
  v_num:='TESS-'||to_char(now(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(p_team_id::text,'-',''),1,6));

  insert into public.tesseramento_requests(
    request_number,team_id,created_by,status,amount,gross_amount,wallet_credit_used,notes,test_mode
  ) values (v_num,p_team_id,auth.uid(),'payment_requested',v_amount,v_gross,v_used,p_notes,false)
  returning id into v_id;
  insert into public.tesseramento_request_players(request_id,player_id)
  select v_id,unnest(p_player_ids);
  if v_used>0 then
    insert into public.team_wallet_transactions(team_id,amount,movement_type,request_id,description,created_by)
    values(p_team_id,-v_used,'request_usage',v_id,'Credito applicato alla richiesta '||v_num,auth.uid());
  end if;
  return jsonb_build_object('request_id',v_id,'request_number',v_num,'player_count',v_count,
    'gross_amount',v_gross,'wallet_credit_used',v_used,'amount',v_amount,'wallet_balance',v_balance-v_used,'test_mode',false);
end;
$function$;

create or replace function public.admin_get_tesseramento_dashboard(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_s public.tesseramento_settings%rowtype; v_t public.teams%rowtype; v_out jsonb; v_balance numeric(10,2);
begin
 if not public.is_v9_admin() then raise exception 'Solo Admin.'; end if;
 select * into v_s from public.tesseramento_settings where id=1;
 select * into v_t from public.teams where id=p_team_id;
 if v_t.id is null then raise exception 'Squadra non trovata.'; end if;
 insert into public.player_registration_status(player_id,team_id,registration_status)
 select r.id,r.team_id,'da_tesserare' from public.roster_requests r
 where r.team_id=p_team_id and r.status='approved' on conflict(player_id) do nothing;
 select coalesce(sum(amount),0) into v_balance from public.team_wallet_transactions where team_id=p_team_id;
 select jsonb_build_object(
  'team',jsonb_build_object('id',v_t.id,'name',v_t.name,'series',v_t.series,'club_name',v_t.club_name,'captain_name',v_t.captain_name,'captain_email',v_t.captain_email),
  'settings',to_jsonb(v_s),'wallet_balance',v_balance,
  'wallet_transactions',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'amount',w.amount,'movement_type',w.movement_type,'description',w.description,'created_at',w.created_at,'player_name',concat_ws(' ',r.first_name,r.last_name),'request_number',q.request_number) order by w.created_at desc) from public.team_wallet_transactions w left join public.roster_requests r on r.id=w.player_id left join public.tesseramento_requests q on q.id=w.request_id where w.team_id=p_team_id),'[]'::jsonb),
  'players',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'first_name',r.first_name,'last_name',r.last_name,'email',r.email,'phone',r.phone,'birth_date',r.birth_date,'birth_place',r.birth_place,'residence_town',r.residence_town,'residence_province',r.residence_province,'registration_status',s.registration_status) order by r.last_name,r.first_name) from public.roster_requests r join public.player_registration_status s on s.player_id=r.id where r.team_id=p_team_id and r.status='approved'),'[]'::jsonb),
  'requests',coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'request_number',q.request_number,'status',q.status,'amount',q.amount,'gross_amount',q.gross_amount,'wallet_credit_used',q.wallet_credit_used,
    'receipt_url',q.receipt_url,'receipt_file_name',q.receipt_file_name,'csv_file_url',q.csv_file_url,'xlsx_file_url',q.xlsx_file_url,'pdf_file_url',q.pdf_file_url,
    'created_at',q.created_at,'test_mode',q.test_mode,'admin_approved_at',q.admin_approved_at,
    'player_count',(select count(*) from public.tesseramento_request_players rp where rp.request_id=q.id)
  ) order by q.created_at desc) from public.tesseramento_requests q where q.team_id=p_team_id),'[]'::jsonb)
 ) into v_out;
 return v_out;
end;
$function$;

create or replace function public.captain_get_tesseramento_payment_requests(p_team_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_t public.teams%rowtype; v_s public.tesseramento_settings%rowtype; v_out jsonb; v_balance numeric(10,2);
begin
 if not public.is_team_captain(p_team_id) then raise exception 'Accesso non autorizzato.'; end if;
 select * into v_t from public.teams where id=p_team_id;
 select * into v_s from public.tesseramento_settings where id=1;
 select coalesce(sum(amount),0) into v_balance from public.team_wallet_transactions where team_id=p_team_id;
 select jsonb_build_object(
  'team',jsonb_build_object('id',v_t.id,'name',v_t.name,'club_name',v_t.club_name,'series',v_t.series),
  'settings',jsonb_build_object('iban',v_s.iban,'account_holder',v_s.account_holder,'fee_per_player',v_s.fee_per_player,'committee_email',v_s.committee_email,'cc_email',v_s.cc_email),
  'wallet_balance',v_balance,
  'requests',coalesce((select jsonb_agg(jsonb_build_object(
    'id',q.id,'request_number',q.request_number,'status',q.status,'amount',q.amount,'gross_amount',q.gross_amount,'wallet_credit_used',q.wallet_credit_used,'notes',q.notes,'receipt_url',q.receipt_url,'receipt_file_name',q.receipt_file_name,'created_at',q.created_at,'test_mode',q.test_mode,
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'first_name',r.first_name,'last_name',r.last_name,'email',r.email) order by r.last_name,r.first_name) from public.tesseramento_request_players rp join public.roster_requests r on r.id=rp.player_id where rp.request_id=q.id),'[]'::jsonb)
  ) order by q.created_at desc) from public.tesseramento_requests q where q.team_id=p_team_id and q.status in ('payment_requested','receipt_uploaded','admin_approved','submitted')),'[]'::jsonb)
 ) into v_out; return v_out;
end;
$function$;

create or replace function public.admin_mark_tesseramento_prepared(p_request_id uuid, p_csv_url text, p_xlsx_url text, p_pdf_url text)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_q public.tesseramento_requests%rowtype;
begin
 if not public.is_v9_admin() then raise exception 'Solo Admin.'; end if;
 select * into v_q from public.tesseramento_requests where id=p_request_id for update;
 if v_q.id is null then raise exception 'Richiesta non trovata.'; end if;
 if not (v_q.status='receipt_uploaded' or (v_q.status='payment_requested' and v_q.amount=0)) then raise exception 'La richiesta non è pronta per la verifica Admin.'; end if;
 if v_q.amount>0 and coalesce(v_q.receipt_url,'')='' then raise exception 'Ricevuta mancante.'; end if;
 update public.tesseramento_requests set status='admin_approved',admin_approved_at=now(),admin_approved_by=auth.uid(),csv_file_url=p_csv_url,xlsx_file_url=p_xlsx_url,pdf_file_url=p_pdf_url where id=p_request_id;
 return jsonb_build_object('ok',true,'request_id',p_request_id,'status','admin_approved','test_mode',v_q.test_mode);
end;
$function$;

create or replace function public.admin_cancel_tesseramento_request(p_request_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare v_request public.tesseramento_requests%rowtype;
begin
  if not public.is_v9_admin() then raise exception 'Solo Admin.'; end if;
  select * into v_request from public.tesseramento_requests where id=p_request_id for update;
  if v_request.id is null then raise exception 'Richiesta non trovata.'; end if;
  if v_request.status<>'payment_requested' then raise exception 'Puoi annullare solo una richiesta ancora in attesa di pagamento.'; end if;
  if v_request.receipt_url is not null or v_request.receipt_storage_path is not null then raise exception 'Su questa richiesta è già presente una ricevuta: usa Sostituisci ricevuta.'; end if;
  if v_request.admin_approved_at is not null or v_request.sent_at is not null then raise exception 'La richiesta è già stata approvata o inviata e non può essere annullata.'; end if;
  if v_request.wallet_credit_used>0 then
    insert into public.team_wallet_transactions(team_id,amount,movement_type,request_id,description,created_by)
    values(v_request.team_id,v_request.wallet_credit_used,'request_refund',v_request.id,'Riaccredito per annullamento richiesta '||v_request.request_number,auth.uid());
  end if;
  update public.tesseramento_requests set status='cancelled',cancelled_at=now(),cancelled_by=auth.uid(),cancellation_reason=nullif(btrim(p_reason),'') where id=p_request_id;
  return jsonb_build_object('ok',true,'request_id',p_request_id,'request_number',v_request.request_number,'status','cancelled','wallet_refund',v_request.wallet_credit_used);
end;
$function$;

grant execute on function public.admin_credit_team_wallet(uuid,uuid,text) to authenticated;
grant execute on function public.admin_create_tesseramento_request(uuid,uuid[],text,boolean) to authenticated;
grant execute on function public.admin_get_tesseramento_dashboard(uuid) to authenticated;
grant execute on function public.captain_get_tesseramento_payment_requests(uuid) to authenticated;
grant execute on function public.admin_mark_tesseramento_prepared(uuid,text,text,text) to authenticated;
grant execute on function public.admin_cancel_tesseramento_request(uuid,text) to authenticated;
