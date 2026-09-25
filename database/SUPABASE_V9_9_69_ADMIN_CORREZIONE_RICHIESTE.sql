-- PADEL ARENA MANAGER V9.9.69
-- Strumenti Admin sicuri per richieste di tesseramento non ancora incassate.

begin;

alter table public.tesseramento_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text;

create or replace function public.admin_cancel_tesseramento_request(
  p_request_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.tesseramento_requests%rowtype;
begin
  if not public.is_v9_admin() then
    raise exception 'Solo Admin.';
  end if;

  select * into v_request
  from public.tesseramento_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Richiesta non trovata.';
  end if;
  if v_request.status <> 'payment_requested' then
    raise exception 'Puoi annullare solo una richiesta ancora in attesa di pagamento.';
  end if;
  if v_request.receipt_url is not null or v_request.receipt_storage_path is not null then
    raise exception 'Su questa richiesta è già presente una ricevuta: usa Sostituisci ricevuta.';
  end if;
  if v_request.admin_approved_at is not null or v_request.sent_at is not null then
    raise exception 'La richiesta è già stata approvata o inviata e non può essere annullata.';
  end if;

  update public.tesseramento_requests
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancellation_reason = nullif(btrim(p_reason), '')
  where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'request_number', v_request.request_number,
    'status', 'cancelled'
  );
end;
$$;

create or replace function public.admin_reset_tesseramento_receipt(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.tesseramento_requests%rowtype;
begin
  if not public.is_v9_admin() then
    raise exception 'Solo Admin.';
  end if;

  select * into v_request
  from public.tesseramento_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Richiesta non trovata.';
  end if;
  if v_request.status <> 'receipt_uploaded' then
    raise exception 'Puoi sostituire solo una ricevuta caricata e non ancora approvata.';
  end if;
  if v_request.admin_approved_at is not null or v_request.sent_at is not null
     or v_request.csv_file_url is not null or v_request.xlsx_file_url is not null
     or v_request.pdf_file_url is not null then
    raise exception 'La pratica è già stata approvata o preparata e non può essere modificata.';
  end if;

  update public.tesseramento_requests
  set status = 'payment_requested',
      receipt_url = null,
      receipt_storage_path = null,
      receipt_file_name = null,
      submitted_at = null
  where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'request_number', v_request.request_number,
    'status', 'payment_requested',
    'storage_path', v_request.receipt_storage_path
  );
end;
$$;

revoke execute on function public.admin_cancel_tesseramento_request(uuid,text) from public, anon;
revoke execute on function public.admin_reset_tesseramento_receipt(uuid) from public, anon;
grant execute on function public.admin_cancel_tesseramento_request(uuid,text) to authenticated;
grant execute on function public.admin_reset_tesseramento_receipt(uuid) to authenticated;

drop policy if exists tesseramenti_receipt_admin_delete on storage.objects;
create policy tesseramenti_receipt_admin_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'team-documents'
  and split_part(name, '/', 1) = 'tesseramenti'
  and public.is_v9_admin()
);

commit;
