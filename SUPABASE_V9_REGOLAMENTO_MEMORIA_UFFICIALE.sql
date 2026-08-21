-- V9 - REGOLAMENTO: MEMORIA UFFICIALE DELLE RISPOSTE ADMIN
-- Eseguire UNA VOLTA in Supabase SQL Editor.
-- Non cancella domande o risposte esistenti.

begin;

create extension if not exists pg_trgm;

alter table public.regulation_questions
  add column if not exists added_as_clarification boolean not null default false;

alter table public.regulation_questions
  add column if not exists admin_answer text;

alter table public.regulation_questions
  add column if not exists answered_at timestamptz;

-- Trova una risposta ufficiale già pubblicata per una domanda sufficientemente simile.
-- Soglia volutamente prudente: evita di usare una risposta admin per un argomento diverso.
create or replace function public.regulation_find_official_answer(p_question text)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  r record;
  q text := lower(trim(coalesce(p_question,'')));
begin
  if q='' then
    return jsonb_build_object('found',false);
  end if;

  select
    id,
    question,
    admin_answer,
    article_refs,
    greatest(
      similarity(lower(question),q),
      word_similarity(lower(question),q)
    ) as score
  into r
  from public.regulation_questions
  where added_as_clarification=true
    and admin_answer is not null
    and trim(admin_answer)<>''
    and status in ('closed','answered')
  order by greatest(
      similarity(lower(question),q),
      word_similarity(lower(question),q)
    ) desc,
    coalesce(answered_at,created_at) desc
  limit 1;

  if r.id is null or coalesce(r.score,0) < 0.58 then
    return jsonb_build_object('found',false);
  end if;

  return jsonb_build_object(
    'found',true,
    'answer',r.admin_answer,
    'source_question',r.question,
    'article_refs',coalesce(r.article_refs,'[]'::jsonb),
    'score',r.score
  );
end;
$$;

grant execute on function public.regulation_find_official_answer(text) to authenticated;

commit;
notify pgrst,'reload schema';
