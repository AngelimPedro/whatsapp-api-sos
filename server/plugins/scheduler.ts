import { useSupabaseServer } from '../utils/supabaseServer'
import { sendTextMessage } from '../utils/datafySend'
import { publishNewMessage } from '../utils/pusherServer'

export default defineNitroPlugin((nitroApp) => {
  // Executa a cada 60 segundos
  const INTERVAL_MS = 60000 

  setInterval(async () => {
    try {
      const supabase = useSupabaseServer()
      
      // Busca conversas no status 'bot' que não tiveram atividade recente
      // nos últimos 15 minutos (900000 ms)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000)
      
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('status', 'bot')
        .lt('last_message_at', fifteenMinutesAgo.toISOString())

      if (error) {
        console.error('[scheduler] erro ao buscar conversas inativas:', error.message)
        return
      }

      if (!conversations || conversations.length === 0) {
        return
      }

      console.log(`[scheduler] analisando ${conversations.length} conversas inativas no bot...`)

      for (const conv of conversations) {
        // Busca a última mensagem da conversa para verificar se foi enviada por nós
        const { data: lastMessages, error: msgError } = await supabase
          .from('messages')
          .select('direction, created_at')
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)

        if (msgError) {
          console.error(`[scheduler] erro ao buscar última mensagem da conversa ${conv.id}:`, msgError.message)
          continue
        }

        const lastMsg = lastMessages?.[0]
        // Só cobramos inatividade se a última mensagem foi enviada por nós (aguardando cliente)
        if (!lastMsg || lastMsg.direction !== 'out') {
          continue
        }

        if (!conv.reminder_sent) {
          // ==========================================
          // CASO A: Enviar lembrete de 15 min
          // ==========================================
          const reminderText = "Olá, ainda está por aí?"
          console.log(`[scheduler] enviando lembrete de inatividade para a conversa ${conv.id} (${conv.wa_id})`)

          let wamid: string | null = null
          try {
            wamid = await sendTextMessage(conv.phone_number_id, conv.wa_id, reminderText)
          } catch (sendErr) {
            console.error(`[scheduler] falha ao enviar WhatsApp para ${conv.wa_id}:`, sendErr)
          }

          // Salva mensagem do lembrete no banco
          const { data: insertedMsg, error: insertErr } = await supabase
            .from('messages')
            .insert({
              conversation_id: conv.id,
              wa_message_id: wamid || `sched-rem-${Date.now()}`,
              direction: 'out',
              kind: 'text',
              body: reminderText,
              status: wamid ? 'sent' : null,
              wa_timestamp: new Date().toISOString()
            })
            .select('*')
            .single()

          if (insertErr) {
            console.error('[scheduler] erro ao inserir mensagem de lembrete:', insertErr.message)
            continue
          }

          // Atualiza a conversa
          const { data: updatedConv, error: updateErr } = await supabase
            .from('conversations')
            .update({
              reminder_sent: true,
              last_message_preview: reminderText,
              last_message_at: new Date().toISOString()
            })
            .eq('id', conv.id)
            .select('*')
            .single()

          if (updateErr) {
            console.error('[scheduler] erro ao atualizar conversa com lembrete:', updateErr.message)
            continue
          }

          // Notifica o front via Pusher
          if (updatedConv && insertedMsg) {
            await publishNewMessage(updatedConv, insertedMsg)
          }

        } else {
          // ==========================================
          // CASO B: Desqualificar após mais 15 min
          // ==========================================
          const closeText = "Atendimento encerrado por inatividade."
          console.log(`[scheduler] desqualificando conversa ${conv.id} por inatividade continuada`)

          // Salva a mensagem de encerramento
          const { data: insertedMsg, error: insertErr } = await supabase
            .from('messages')
            .insert({
              conversation_id: conv.id,
              wa_message_id: `sched-close-${Date.now()}`,
              direction: 'out',
              kind: 'text',
              body: closeText,
              wa_timestamp: new Date().toISOString()
            })
            .select('*')
            .single()

          if (insertErr) {
            console.error('[scheduler] erro ao inserir mensagem de encerramento:', insertErr.message)
            continue
          }

          // Atualiza o status da conversa para 'desqualificado'
          const { data: updatedConv, error: updateErr } = await supabase
            .from('conversations')
            .update({
              status: 'desqualificado',
              reminder_sent: false,
              last_message_preview: closeText,
              last_message_at: new Date().toISOString()
            })
            .eq('id', conv.id)
            .select('*')
            .single()

          if (updateErr) {
            console.error('[scheduler] erro ao atualizar status para desqualificado:', updateErr.message)
            continue
          }

          // Notifica o front via Pusher
          if (updatedConv && insertedMsg) {
            await publishNewMessage(updatedConv, insertedMsg)
          }
        }
      }
    } catch (err) {
      console.error('[scheduler] erro crítico no loop do agendador:', err)
    }
  }, INTERVAL_MS)
})
