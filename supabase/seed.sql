-- ============================================================
-- Seed de DEV — 15 conversas + muitas mensagens (texto em massa via
-- generate_series) + os 6 tipos de mídia na 1ª conversa.
-- Rodar no SQL Editor. Reexecutável (limpa antes de inserir).
-- ============================================================

truncate table public.messages, public.conversations restart identity cascade;

-- ---------- 15 conversas ----------
insert into public.conversations
  (phone_number_id, display_phone_number, waba_id, wa_id, contact_name, unread_count)
values
  ('1077112375482910','554192926399','25551057654597020','554191480924','Israel Henrique', 0),
  ('1077112375482910','554192926399','25551057654597020','554198765432','Maria Souza', 2),
  ('1077112375482910','554192926399','25551057654597020','554191112222','João Pedro', 0),
  ('1077112375482910','554192926399','25551057654597020','554195556666','Loja Center', 1),
  ('1077112375482910','554192926399','25551057654597020','554192223344','Ana Clara', 0),
  ('1077112375482910','554192926399','25551057654597020','554193334455','Carlos Eduardo', 5),
  ('1077112375482910','554192926399','25551057654597020','554194445566','Fernanda Lima', 0),
  ('1077112375482910','554192926399','25551057654597020','554196667788','Roberto Alves', 0),
  ('1077112375482910','554192926399','25551057654597020','554197778899','Patrícia Gomes', 3),
  ('1077112375482910','554192926399','25551057654597020','554198889900','Lucas Martins', 0),
  ('1077112375482910','554192926399','25551057654597020','554199990011','Juliana Rocha', 0),
  ('1077112375482910','554192926399','25551057654597020','554190001122','Marcos Vinícius', 1),
  ('1077112375482910','554192926399','25551057654597020','554191230000','Beatriz Santos', 0),
  ('1077112375482910','554192926399','25551057654597020','554192340000','Suporte TI', 0),
  ('1077112375482910','554192926399','25551057654597020','554193450000','Financeiro', 7);

-- ---------- mensagens em massa (80 por conversa, texto) ----------
with conv as (
  select id, wa_id, display_phone_number, contact_name,
         row_number() over (order by wa_id) as rk
  from public.conversations
)
insert into public.messages
  (conversation_id, wa_message_id, direction, kind, from_wa_id, to_wa_id, body, status, wa_timestamp)
select
  conv.id,
  'seed-' || conv.wa_id || '-' || g,
  case when g % 2 = 0 then 'out' else 'in' end,
  'text',
  case when g % 2 = 0 then conv.display_phone_number else conv.wa_id end,
  case when g % 2 = 0 then conv.wa_id else null end,
  'Mensagem de exemplo #' || g || ' — ' || coalesce(conv.contact_name, conv.wa_id),
  case when g % 2 = 0 then 'read' else null end,
  now() - (conv.rk * interval '1 hour') - ((80 - g) * interval '3 minutes')
from conv
cross join generate_series(1, 80) as g;

-- ---------- 6 tipos de mídia na 1ª conversa (Israel), mais recentes ----------
with c as (
  select id from public.conversations where wa_id = '554191480924'
)
insert into public.messages
  (conversation_id, wa_message_id, direction, kind, from_wa_id, to_wa_id, body, caption, media_url, status, wa_timestamp)
select c.id, v.wa_message_id, v.direction, v.kind, v.from_wa_id, v.to_wa_id, v.body, v.caption, v.media_url, v.status, v.wa_timestamp
from c, (values
  ('seed-media-1','in', 'image',   '554191480924', null, null, 'Olha o produto 🍓', 'https://picsum.photos/id/1080/600/400', null, now() - interval '6 minutes'),
  ('seed-media-2','in', 'audio',   '554191480924', null, null, null, 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', null, now() - interval '5 minutes'),
  ('seed-media-3','in', 'video',   '554191480924', null, null, 'Demonstração 🎥', 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', null, now() - interval '4 minutes'),
  ('seed-media-4','out','document','554192926399', '554191480924', 'Catalogo-2026.pdf', null, 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', 'delivered', now() - interval '3 minutes'),
  ('seed-media-5','out','sticker', '554192926399', '554191480924', null, null, 'https://picsum.photos/id/237/200/200', 'read', now() - interval '2 minutes'),
  ('seed-media-6','in', 'image',   '554191480924', null, null, null, 'https://picsum.photos/id/1062/500/360', null, now() - interval '1 minute')
) as v(wa_message_id, direction, kind, from_wa_id, to_wa_id, body, caption, media_url, status, wa_timestamp);

-- ---------- atualiza resumo da lista a partir da última mensagem ----------
update public.conversations c set
  last_message_at = s.ts,
  last_message_preview = case s.kind
    when 'text'     then s.body
    when 'image'    then coalesce(s.caption, '📷 Foto')
    when 'audio'    then '🎤 Áudio'
    when 'video'    then coalesce(s.caption, '🎥 Vídeo')
    when 'document' then '📄 ' || coalesce(s.body, 'Documento')
    when 'sticker'  then 'Figurinha'
    else s.body
  end
from (
  select distinct on (conversation_id)
    conversation_id, wa_timestamp as ts, kind, body, caption
  from public.messages
  order by conversation_id, wa_timestamp desc
) s
where s.conversation_id = c.id;
