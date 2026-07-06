import type { Dictionary } from '../types';

/** Brazilian Portuguese — the game's original language. Every string here is an EXACT copy of the
 *  text that was previously hardcoded in the code before internationalization; nothing was reworded. */
export const ptBR: Dictionary = {
  common: {
    cancelar: 'Cancelar',
    fechar: 'Fechar',
    menu: 'Menu',
    reiniciar: 'Reiniciar',
    moedas: (n) => `${n} ${n === 1 ? 'moeda' : 'moedas'}`,
    jogadas: (n) => `${n} ${n === 1 ? 'jogada' : 'jogadas'}`,
    dicas: (n) => `${n} ${n === 1 ? 'dica' : 'dicas'}`,
    telaCheia: 'Tela cheia',
    sairDaTelaCheia: 'Sair da tela cheia',
  },

  menu: {
    appTitle: 'Decanta',
    appSubtitle: 'Water Sort',
    continuar: 'Continuar',
    jornada: 'Jornada',
    diario: 'Diário',
    novoDesafioDisponivel: 'Novo desafio disponível',
    completo: 'completo',
    batalhaDeChefao: 'Batalha de Chefão',
    fase: (n) => `Fase ${n}`,
    emAndamento: 'em andamento',
    lojinha: 'Lojinha',
    som: 'Som',
    musicaEEfeitos: 'Música & efeitos',
    ajustes: 'Ajustes',
    qualidadeGrafica: 'Qualidade gráfica',
    modalVitoriaDesativado: 'Modal de vitória desativado',
    reativar: 'reativar',
  },

  hud: {
    chefao: 'Chefão',
    chefaoTag: '⚔ Chefão',
    diario: 'Diário',
    fase: (n) => `Fase ${n}`,
    otimo: (n) => `ótimo: ${n}`,
    otimoInline: (n) => `ótimo ${n}`,
    voltar: (n) => (n < 0 ? 'Voltar' : `Voltar${n > 0 ? ` (${n})` : ''}`),
    dica: (n) => (n < 0 ? 'Dica' : `Dica${n > 0 ? ` (${n})` : ''}`),
    dicaCalculando: 'Dica…',
    maisTubo: (n) => (n < 0 ? '+Tubo' : `+Tubo${n > 0 ? ` (${n})` : ''}`),
    pular: 'Pular →',
    pularFase: 'Pular fase →',
    proxima: 'Próxima →',
    repetir: 'Repetir',
    naoMostrarNovamente: 'Não mostrar novamente',
    semMovimentosDisponiveis: 'Sem movimentos disponíveis',
    semMovimentosAdicioneTubo: 'Sem movimentos — adicione um tubo',
    semMovimentosReinicieOuDesfaca: 'Sem movimentos — reinicie ou desfaça',
    semMovimentosReinicieAFase: 'Sem movimentos — reinicie a fase',
    semMovimentosTitulo: 'Sem movimentos!',
    naoHaMaisJogadas: 'Não há mais jogadas possíveis.',
    decantado: 'Decantado!',
    chefaoDerrotado: '⚔ Chefão Derrotado!',
    preparandoBatalha: 'Preparando batalha…',
    preparandoFase: 'Preparando fase…',
    erroPreparandoFase: 'Não foi possível preparar a fase. Tente novamente.',
  },

  shop: {
    title: 'Lojinha',
    fundos: 'Fundos',
    corDoTubo: 'Cor do tubo',
    formatoDoTubo: 'Formato do tubo',
    emUso: 'Em uso',
    equipar: 'Equipar',
    gratis: 'Grátis',
    visualizando: 'Visualizando…',
    comprarPor: (price) => `Comprar por ★ ${price} moedas`,
    saldoInsuficiente: (price) => `★ ${price} moedas — saldo insuficiente`,
  },

  ajustes: {
    title: 'Ajustes',
    qualidade: 'Qualidade',
    auto: 'Auto',
    alta: 'Alta',
    baixa: 'Baixa',
    detecta: 'Detecta',
    maisDetalhes: 'Mais detalhes',
    maisFluido: 'Mais fluido',
    idioma: 'Idioma',
    zonaDePerigo: 'Zona de perigo',
    apagarTodosOsDados: 'Apagar todos os dados',
    apagando: 'Apagando…',
    simApagarTudo: 'Sim, apagar tudo',
    apagarConfirmTitle: 'Apagar todos os dados?',
    apagarConfirmBody:
      'Isso apaga o progresso da jornada, moedas, itens da lojinha, preferências e o desafio ' +
      'diário — tudo. Não tem como desfazer. O jogo recarrega do zero, como se você nunca ' +
      'tivesse aberto ele antes.',
  },

  sound: {
    title: 'Som',
    musica: 'Música',
    trilhaSonoraDeFundo: 'Trilha sonora de fundo',
    faixaDeMusica: 'Faixa de música',
    dinamico: 'Dinâmico',
    mudaComADificuldadeDaFase: 'Muda com a dificuldade da fase',
    efeitos: 'Efeitos',
    sonsDeDespejoEInterface: 'Sons de despejo e interface',
    efeitoSonoroDaAgua: 'Efeito sonoro da água',
  },

  bossIntro: {
    tierN: (n) => `⚔ Chefão · Tier ${n}`,
    recuar: 'Recuar',
    enfrentar: 'Enfrentar!',
  },

  modeSelector: {
    jornada: 'Jornada',
    escolhaOModo: 'Escolha o modo',
    semDesfazerSemTuboDicas: (n) => `Sem desfazer · Sem +tubo · ${n} ${n === 1 ? 'dica' : 'dicas'}`,
  },

  wildTutorial: {
    coringa: 'Coringa',
    entendi: 'Entendi',
    intro: 'Esta cor especial combina com qualquer outra.',
    podeReceber: 'Pode receber qualquer cor,',
    e: 'e',
    qualquerCorPode: 'qualquer cor pode ser movida para um tubo com coringa.',
  },

  modes: {
    zen: {
      name: 'Zen',
      tagline: 'Ritmo suave, sem pressa',
      description: 'Fases mais calmas com menos cores. Ajuda ilimitada, sem punição.',
    },
    balanced: {
      name: 'Equilibrado',
      tagline: 'Desafio progressivo',
      description: 'Mistura de fases fáceis e difíceis. Mecânicas especiais surgem aos poucos.',
    },
    extreme: {
      name: 'Extremo',
      tagline: 'Uma jogada errada e acabou',
      description: 'Mais cores, menos espaço vazio. Sem voltar atrás, sem tubo extra. Apenas 3 dicas.',
    },
  },

  boss: {
    engarrafador: {
      name: 'O Engarrafador',
      title: 'Mestre do Caos Líquido',
      lore:
        'Um artesão obcecado que passou décadas tentando engarrafar cores perfeitas. ' +
        'Nunca conseguiu — e não quer que você consiga. ' +
        'A cada momento de descuido, troca o conteúdo de dois tubos ao acaso.',
      ability: '💧 Dilúvio · A cada 5 jogadas, dois tubos trocam de lugar o líquido do topo',
    },
    alquimista: {
      name: 'A Alquimista',
      title: 'Senhora das Metamorfoses',
      lore:
        'Mestre de transformações impossíveis. ' +
        'Seus líquidos não ficam quietos; a cada descuido, dois tubos trocam de lugar ' +
        'como se a própria química se recusasse a ser domada.',
      ability: '🧪 Duplo Dilúvio · A cada 4 jogadas, dois tubos trocam de lugar o líquido do topo',
    },
    oceano: {
      name: 'O Oceano',
      title: 'Força da Natureza',
      lore:
        'Não é um ser — é uma força primordial. ' +
        'Não cansa, não sente, não para. ' +
        'Cada três jogadas traz uma nova maré que troca o conteúdo de dois tubos.',
      ability: '🌊 Maré Tripla · A cada 3 jogadas, dois tubos trocam de lugar o líquido do topo',
    },
  },

  economy: {
    bg: {
      noite: 'Noite de bancada',
      oceano: 'Fundo do mar',
      aurora: 'Aurora',
      lavanda: 'Lavanda',
      sunset: 'Pôr do sol',
      carvao: 'Carvão',
    },
    tube: {
      cristal: 'Cristal',
      ambar: 'Âmbar',
      esmeralda: 'Esmeralda',
      rose: 'Rosé',
      ouro: 'Ouro velho',
    },
    shape: {
      classica: 'Clássica',
      proveta: 'Proveta',
      farmacia: 'Boticário',
      erlenmeyer: 'Erlenmeyer',
      balao: 'Balão',
    },
  },

  levels: {
    facil: 'Fácil',
    medio: 'Médio',
    dificil: 'Difícil',
  },

  sfx: {
    'copo-agua': 'Água no copo',
    'copo-vidro': 'Copo de vidro',
    'copo-curto': 'Despejo curto',
    'copo-agua-rapido': 'Despejo rápido',
    'copo-agua-lento': 'Copo enchendo devagar',
    'jarra-vidro': 'Jarra no vidro',
    'torneira-copo': 'Torneira enchendo',
    'copo-cheio': 'Copo se enchendo',
    'garrafa-enchendo': 'Garrafa enchendo',
  },

  v2: {
    jogar: 'Jogar',
    pularTelaVitoria: 'Pular tela de vitória',
    imersaoTitulo: 'Jogar em tela cheia?',
    imersaoCorpo: 'Mais espaço para os tubos. Você pode voltar quando quiser.',
    imersaoJogar: 'Jogar em tela cheia',
    imersaoAgoraNao: 'Agora não',
    imersaoIosTitulo: 'Jogue em tela cheia',
    imersaoIosCorpo: 'Toque em Compartilhar e escolha “Adicionar à Tela de Início”. O jogo abre em tela cheia pelo ícone.',
  },
};
