import type { Dictionary } from '../types';

export const en: Dictionary = {
  common: {
    cancelar: 'Cancel',
    fechar: 'Close',
    menu: 'Menu',
    reiniciar: 'Restart',
    moedas: (n) => `${n} ${n === 1 ? 'coin' : 'coins'}`,
    jogadas: (n) => `${n} ${n === 1 ? 'move' : 'moves'}`,
    dicas: (n) => `${n} ${n === 1 ? 'hint' : 'hints'}`,
    telaCheia: 'Fullscreen',
    sairDaTelaCheia: 'Exit fullscreen',
  },

  menu: {
    appTitle: 'Decanta',
    appSubtitle: 'Water Sort',
    continuar: 'Continue',
    jornada: 'Journey',
    diario: 'Daily',
    novoDesafioDisponivel: 'New challenge available',
    completo: 'complete',
    batalhaDeChefao: 'Boss Battle',
    fase: (n) => `Level ${n}`,
    emAndamento: 'in progress',
    lojinha: 'Shop',
    som: 'Sound',
    musicaEEfeitos: 'Music & effects',
    ajustes: 'Settings',
    qualidadeGrafica: 'Graphics quality',
    modalVitoriaDesativado: 'Victory screen disabled',
    reativar: 're-enable',
  },

  hud: {
    chefao: 'Boss',
    chefaoTag: '⚔ Boss',
    diario: 'Daily',
    fase: (n) => `Level ${n}`,
    otimo: (n) => `best: ${n}`,
    otimoInline: (n) => `best ${n}`,
    voltar: (n) => (n < 0 ? 'Undo' : `Undo${n > 0 ? ` (${n})` : ''}`),
    dica: (n) => (n < 0 ? 'Hint' : `Hint${n > 0 ? ` (${n})` : ''}`),
    dicaCalculando: 'Hint…',
    maisTubo: (n) => (n < 0 ? '+Tube' : `+Tube${n > 0 ? ` (${n})` : ''}`),
    pular: 'Skip →',
    pularFase: 'Skip level →',
    proxima: 'Next →',
    repetir: 'Retry',
    naoMostrarNovamente: "Don't show again",
    semMovimentosDisponiveis: 'No moves available',
    semMovimentosAdicioneTubo: 'No moves — add a tube',
    semMovimentosReinicieOuDesfaca: 'No moves — restart or undo',
    semMovimentosReinicieAFase: 'No moves — restart the level',
    semMovimentosTitulo: 'No moves left!',
    naoHaMaisJogadas: 'There are no more possible moves.',
    decantado: 'Decanted!',
    chefaoDerrotado: '⚔ Boss Defeated!',
    preparandoBatalha: 'Preparing battle…',
    preparandoFase: 'Preparing level…',
    erroPreparandoFase: 'Could not prepare the level. Please try again.',
    carregandoLento: 'Taking longer than expected…',
    tentarNovamente: 'Try again',
  },

  shop: {
    title: 'Shop',
    fundos: 'Backgrounds',
    corDoTubo: 'Tube color',
    formatoDoTubo: 'Tube shape',
    emUso: 'In use',
    equipar: 'Equip',
    gratis: 'Free',
    visualizando: 'Previewing…',
    comprarPor: (price) => `Buy for ★ ${price} coins`,
    saldoInsuficiente: (price) => `★ ${price} coins — not enough coins`,
  },

  ajustes: {
    title: 'Settings',
    qualidade: 'Quality',
    auto: 'Auto',
    alta: 'High',
    baixa: 'Low',
    detecta: 'Detects',
    maisDetalhes: 'More detail',
    maisFluido: 'Smoother',
    idioma: 'Language',
    zonaDePerigo: 'Danger zone',
    apagarTodosOsDados: 'Delete all data',
    apagando: 'Deleting…',
    simApagarTudo: 'Yes, delete everything',
    apagarConfirmTitle: 'Delete all data?',
    apagarConfirmBody:
      "This deletes your journey progress, coins, shop items, preferences, and the daily " +
      "challenge — everything. It can't be undone. The game reloads from scratch, as if you'd " +
      "never opened it before.",
  },

  sound: {
    title: 'Sound',
    musica: 'Music',
    trilhaSonoraDeFundo: 'Background music',
    faixaDeMusica: 'Music track',
    dinamico: 'Dynamic',
    mudaComADificuldadeDaFase: 'Changes with level difficulty',
    efeitos: 'Effects',
    sonsDeDespejoEInterface: 'Pouring and interface sounds',
    efeitoSonoroDaAgua: 'Water sound effect',
  },

  bossIntro: {
    tierN: (n) => `⚔ Boss · Tier ${n}`,
    recuar: 'Retreat',
    enfrentar: 'Fight!',
  },

  modeSelector: {
    jornada: 'Journey',
    escolhaOModo: 'Choose a mode',
    semDesfazerSemTuboDicas: (n) => `No undo · No +tube · ${n} ${n === 1 ? 'hint' : 'hints'}`,
  },

  wildTutorial: {
    coringa: 'Wild',
    entendi: 'Got it',
    intro: 'This special color matches with any other.',
    podeReceber: 'It can receive any color,',
    e: 'and',
    qualquerCorPode: 'any color can be poured into a tube with a wild.',
  },

  modes: {
    zen: {
      name: 'Zen',
      tagline: 'Gentle pace, no rush',
      description: 'Calmer levels with fewer colors. Unlimited help, no penalty.',
    },
    balanced: {
      name: 'Balanced',
      tagline: 'Progressive challenge',
      description: 'A mix of easy and hard levels. Special mechanics appear gradually.',
    },
    extreme: {
      name: 'Extreme',
      tagline: "One wrong move and it's over",
      description: 'More colors, less empty space. No undo, no extra tube. Only 3 hints.',
    },
  },

  boss: {
    engarrafador: {
      name: 'The Bottler',
      title: 'Master of Liquid Chaos',
      lore:
        'An obsessive craftsman who spent decades trying to bottle perfect colors. ' +
        "He never succeeded — and doesn't want you to either. " +
        "Every moment you're not looking, he swaps the contents of two tubes at random.",
      ability: '💧 Deluge · Every 5 moves, two tubes swap their top liquid',
    },
    alquimista: {
      name: 'The Alchemist',
      title: 'Lady of Metamorphoses',
      lore:
        'Master of impossible transformations. ' +
        "Her liquids never sit still; every time you look away, two tubes swap places, " +
        'as if chemistry itself refused to be tamed.',
      ability: '🧪 Double Deluge · Every 4 moves, two tubes swap their top liquid',
    },
    oceano: {
      name: 'The Ocean',
      title: 'Force of Nature',
      lore:
        "It isn't a being — it's a primal force. " +
        "It doesn't tire, doesn't feel, doesn't stop. " +
        'Every three moves brings a new tide that swaps the contents of two tubes.',
      ability: '🌊 Triple Tide · Every 3 moves, two tubes swap their top liquid',
    },
  },

  economy: {
    bg: {
      noite: 'Workbench Night',
      oceano: 'Ocean Floor',
      aurora: 'Aurora',
      lavanda: 'Lavender',
      sunset: 'Sunset',
      carvao: 'Charcoal',
    },
    tube: {
      cristal: 'Crystal',
      ambar: 'Amber',
      esmeralda: 'Emerald',
      rose: 'Rosé',
      ouro: 'Old Gold',
    },
    shape: {
      classica: 'Classic',
      proveta: 'Test Tube',
      farmacia: 'Apothecary',
      erlenmeyer: 'Erlenmeyer',
      balao: 'Flask',
    },
  },

  levels: {
    facil: 'Easy',
    medio: 'Medium',
    dificil: 'Hard',
  },

  sfx: {
    'copo-agua': 'Water in glass',
    'copo-vidro': 'Glass cup',
    'copo-curto': 'Short pour',
    'copo-agua-rapido': 'Fast pour',
    'copo-agua-lento': 'Glass filling slowly',
    'jarra-vidro': 'Pitcher on glass',
    'torneira-copo': 'Faucet filling',
    'copo-cheio': 'Glass filling up',
    'garrafa-enchendo': 'Bottle filling',
  },

  v2: {
    jogar: 'Play',
    pularTelaVitoria: 'Skip victory screen',
    imersaoTitulo: 'Play fullscreen?',
    imersaoCorpo: 'More room for the tubes. You can exit whenever you want.',
    imersaoJogar: 'Play fullscreen',
    imersaoAgoraNao: 'Not now',
    imersaoIosTitulo: 'Play fullscreen',
    imersaoIosCorpo: 'Tap Share and choose “Add to Home Screen”. The game opens fullscreen from the icon.',
  },
};
