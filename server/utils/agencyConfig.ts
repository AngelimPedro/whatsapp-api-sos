export interface AgencyInfo {
  nome: string
  descricao: string
  categorias: { nome: string; itens: string[] }[]
  horarioAtendimento: string
  contato: string
  valoresSobre: string
}

export const AGENCY_INFO: AgencyInfo = {
  nome: "SOSO Cordas",
  descricao: "Somos uma loja especializada em encordoamentos de alta qualidade e acessórios para diversos instrumentos musicais (como violão, guitarra, baixo, cavaquinho, violino, ukulele, sopro e percussão). Focamos em oferecer a melhor experiência para músicos, com variedade e entrega ágil.",
  categorias: [
    {
      nome: "Acessórios",
      itens: [
        "ACESSÓRIOS PARA PEDAIS", "AFINADORES", "ANTI-FEEDBACK", "CAPOTRASTES", 
        "CORREIAS", "DAMPER", "FERRAMENTAS", "FONTE ESTABILIZADORA", 
        "PORTA PALHETAS", "QUICK RELEASE", "SLIDES"
      ]
    },
    {
      nome: "Violão de Aço",
      itens: [
        "ENCORDOAMENTO VIOLÃO AÇO 0.9", "ENCORDOAMENTO VIOLÃO AÇO 0.10", 
        "ENCORDOAMENTO VIOLÃO AÇO 0.11", "ENCORDOAMENTO VIOLÃO AÇO 0.12", 
        "ENCORDOAMENTO VIOLÃO AÇO 0.13", "ENCORDOAMENTO VIOLÃO AÇO 0.14"
      ]
    },
    {
      nome: "Violão Nylon",
      itens: [
        "ENCORDOAMENTO VIOLÃO NYLON TENSÃO LEVE", "ENCORDOAMENTO VIOLÃO NYLON TENSÃO MÉDIA", 
        "ENCORDOAMENTO VIOLÃO NYLON TENSÃO ALTA", "ENCORDOAMENTO VIOLÃO NYLON TENSÃO EXTRA PESADA"
      ]
    },
    {
      nome: "Guitarra",
      itens: [
        "ENCORDOAMENTO GUITARRA 0.8 E 8.5", "ENCORDOAMENTO GUITARRA 0.9", 
        "ENCORDOAMENTO GUITARRA 0.10", "ENCORDOAMENTO GUITARRA 0.11", 
        "ENCORDOAMENTO GUITARRA 0.12", "ENCORDOAMENTO GUITARRA 0.13", 
        "ENCORDOAMENTO GUITARRA 7 CORDAS", "ENCORDOAMENTO GUITARRA 8 CORDAS"
      ]
    },
    {
      nome: "Baixo",
      itens: [
        "ENCORDOAMENTO BAIXO 4 CORDAS 0.40", "ENCORDOAMENTO BAIXO 4 CORDAS 0.45", "ENCORDOAMENTO BAIXO 4 CORDAS 0.50",
        "ENCORDOAMENTO BAIXO 5 CORDAS 0.40", "ENCORDOAMENTO BAIXO 5 CORDAS 0.45", "ENCORDOAMENTO BAIXO 5 CORDAS 0.50",
        "ENCORDOAMENTO BAIXO 6 CORDAS"
      ]
    },
    {
      nome: "Cavaquinho e Bandolim",
      itens: [
        "ENCORDOAMENTO CAVAQUINHO TENSÃO LEVE", "ENCORDOAMENTO CAVAQUINHO TENSÃO MÉDIA", "ENCORDOAMENTO CAVAQUINHO TENSÃO PESADA",
        "ENCORDOAMENTO BANDOLIM TENSÃO LEVE", "ENCORDOAMENTO BANDOLIM TENSÃO MÉDIA"
      ]
    },
    {
      nome: "Palhetas",
      itens: [
        "PALHETAS EXTRA LEVES (0.38MM OU MENOS)", "PALHETAS LEVES (0.40–0.60MM)", 
        "PALHETAS MÉDIAS (0.60–0.80MM)", "PALHETAS PESADAS (0.80–1.20MM)", 
        "PALHETAS EXTRA PESADAS (1.20MM OU MAIS)"
      ]
    },
    {
      nome: "Cabos e Áudio",
      itens: [
        "CABOS PARA INSTRUMENTOS", "CABOS PARA PEDAL", "CABOS PARA ÁUDIO",
        "FONES DE OUVIDO", "MICROFONE COM FIO", "PLUGS E ADAPTADORES"
      ]
    },
    {
      nome: "Capas/bags",
      itens: [
        "CAPAS PARA BAIXO", "CAPAS PARA BANJO", "CAPAS PARA BAQUETAS", 
        "CAPAS PARA CAVAQUINHO", "CAPAS PARA GUITARRA", "CAPAS PARA VIOLÃO"
      ]
    },
    {
      nome: "Limpeza e cuidados",
      itens: [
        "FLANELAS", "LIMPEZA DE CORDAS", "LIMPEZA DE ESCALAS", "LIMPEZA DE INSTRUMENTOS"
      ]
    },
    {
      nome: "Partes e Tarraxas",
      itens: [
        "ALAVANCA", "CANOA PARA JACK", "CAVALETES", "CHAVE SELETORA", "ESCUDO PROTETOR", "JACK", 
        "KNOBS", "MOLAS", "PARAFUSOS", "PESTANAS", "PINOS PARA VIOLÃO AÇO", "PLACA DE CONTROLE",
        "TARRAXAS PARA BAIXO", "TARRAXAS PARA GUITARRA", "TARRAXAS PARA VIOLÃO AÇO", "TARRAXAS PARA VIOLÃO NYLON"
      ]
    },
    {
      nome: "Percussão, Sopro e Outros",
      itens: [
        "ABAFADORES", "BAQUETAS 2B", "BAQUETAS 5A", "BAQUETAS 5B", "BAQUETAS 7A", 
        "PADS", "PANDEIRO", "PELE DE BATERIA", "FLAUTA DOCE", "ENCORDOAMENTO VIOLA DE ARCO",
        "ENCORDOAMENTO VIOLA CAIPIRA", "ENCORDOAMENTO VIOLINO", "ENCORDOAMENTO UKULELE SOPRANO", "ENCORDOAMENTO UKULELE TENOR"
      ]
    },
    {
      nome: "Suportes",
      itens: [
        "APOIO DE PÉ", "SUPORTE PARA DISPOSITIVOS MÓVEIS", "SUPORTE PARA INSTRUMENTOS", 
        "SUPORTE PARA MICROFONE", "SUPORTE PARA PARTITURA"
      ]
    }
  ],
  horarioAtendimento: "Segunda a Sexta-feira, das 09h às 18h. Sábado, das 09h às 13h.",
  contato: "contato@sosocordas.com.br / WhatsApp: +55 (41) 9133-8055",
  valoresSobre: "Oferecemos garantia de originalidade em todas as cordas e acessórios, preços justos e envio para todo o Brasil. Aceitamos Pix, Cartão de Crédito e Boleto."
}
