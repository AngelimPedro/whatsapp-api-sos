# Webhooks da Meta Cloud API (WhatsApp)

> **Provedor: Datafy API.** A integração não fala direto com a Meta — passa pela
> **Datafy API**, uma camada/BSP que expõe a API Oficial do WhatsApp (semelhante ao
> Twilio). Consequências práticas:
> - Autenticação usa **apenas o token do número** (`DATAFY_NUMBER_TOKEN`), que
>   equivale ao "WhatsApp token". Não há access token da Meta separado.
> - **Não há verify token** — o handshake de verificação do webhook fica por conta
>   da Datafy, então não precisamos implementá-lo.
> - O **formato dos payloads** abaixo é o mesmo da Meta Cloud API (a Datafy repassa).

Referência dos payloads que a Meta envia e como mapeamos para as tabelas
`conversations` / `messages`. Todo payload chega em:

```
entry[].changes[].value
```

Campos comuns em `value`:

| Campo | Exemplo | Vai para |
|-------|---------|----------|
| `metadata.phone_number_id` | `1077112375482910` | `conversations.phone_number_id` (inbox) |
| `metadata.display_phone_number` | `554192926399` | `conversations.display_phone_number` |
| `entry[].id` | `25551057654597020` | `conversations.waba_id` |
| `contacts[].wa_id` | `554191480924` | `conversations.wa_id` |
| `contacts[].profile.name` | `Israel Henrique` | `conversations.contact_name` |
| `contacts[].user_id` | `BR.890138094098261` | `conversations.contact_user_id` |

O `changes[].field` indica o tipo de evento:

| `field` | Conteúdo | Significado |
|---------|----------|-------------|
| `messages` | `value.messages[]` | mensagem **recebida** do contato (`direction: in`) |
| `messages` | `value.statuses[]` | **status** de entrega de mensagem enviada |
| `smb_message_echoes` | `value.message_echoes[]` | mensagem **enviada** pelo app Business conectado (`direction: out`) |

---

## 1. Mensagem recebida — texto

`field: messages` · `value.messages[]`

```jsonc
{
  "from": "554191480924",            // -> messages.from_wa_id
  "id": "wamid.HBgMNTU0MTk...",      // -> messages.wa_message_id
  "timestamp": "1782081201",         // unix (s) -> messages.wa_timestamp
  "type": "text",                    // -> messages.kind
  "text": { "body": "ola, tudo bem" } // -> messages.body
}
```

## 2. Mensagem recebida — áudio

```jsonc
{
  "from": "554191480924",
  "id": "wamid...",
  "timestamp": "1782081254",
  "type": "audio",
  "audio": {
    "mime_type": "audio/ogg; codecs=opus", // -> messages.media_mime
    "sha256": "nOGRGsuFj3...",              // -> messages.media_sha256
    "id": "965433013130588",               // -> messages.media_id  (resolver URL!)
    "url": "https://lookaside.fbsbx.com/...", // ⚠️ expira + exige token (não usar direto)
    "voice": true                          // -> messages.is_voice
  }
}
```

## 3. Mensagem recebida — imagem

```jsonc
{
  "type": "image",
  "image": {
    "mime_type": "image/jpeg",
    "sha256": "r453QMUI...",
    "id": "1677559043296418",  // -> messages.media_id
    "url": "https://lookaside.fbsbx.com/..." // ⚠️ idem áudio
  }
}
```

> Vídeo, documento e sticker seguem o mesmo formato (`type` + objeto homônimo com
> `id`/`url`/`mime_type`; documento traz também `filename`).

## 4. Mensagem enviada pelo app Business (echo)

`field: smb_message_echoes` · `value.message_echoes[]` → `direction: out`

```jsonc
{
  "from": "554192926399",   // nosso número
  "to": "554191480924",     // -> messages.to_wa_id (contato)
  "id": "wamid...",
  "timestamp": "1782081400",
  "type": "text",
  "text": { "body": "Aasdd" }
}
```

## 5. Status de entrega

`field: messages` · `value.statuses[]` → atualiza a mensagem existente

```jsonc
{
  "id": "wamid...",          // casa com messages.wa_message_id
  "status": "sent",          // sent | delivered | read  -> messages.status
  "timestamp": "1782081458",
  "recipient_id": "554191480924"
}
```

Chegam em sequência: `sent` → `delivered` → `read`.

---

## ⚠️ Mídia: como obter a URL pública (renderizar)

A `url` que vem no webhook (`lookaside.fbsbx.com`) **expira** e exige o token de
acesso no header — **não dá pra usar direto no `<img>`/`<audio>`**. Fluxo correto:

1. Guardar o `media_id` (`audio.id` / `image.id` / ...).
2. Resolver via Graph API com o `media_id`:
   ```
   GET https://graph.facebook.com/v21.0/{media_id}
   Authorization: Bearer {WHATSAPP_TOKEN}
   → retorna { "url": "...", "mime_type": "...", ... }
   ```
3. Baixar o binário dessa `url` (também com `Authorization: Bearer`).
4. **Re-hospedar** (ex.: Supabase Storage) e salvar o link público em
   `messages.media_url` — esse sim é renderizável e estável.

> Por isso o schema separa `media_id` (sempre) de `media_url` (preenchido após resolver).
> Endpoint próprio sugerido (fase 6): `GET /api/media/:id` que faz 1→3 e devolve/persiste a URL.
