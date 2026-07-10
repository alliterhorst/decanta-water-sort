/**
 * Shape of ONE language dictionary. Each locale (pt-BR.ts, en.ts, es.ts) implements this entire
 * interface — if a language forgets a key, or uses the wrong type on an interpolation/plural
 * function, `tsc` raises a compile error. This is intentional: we prefer to break the build
 * rather than ship a "broken" language that silently falls back to another one.
 *
 * Strings with an embedded number (level, coin/hint/move counts, etc.) are functions — each
 * locale decides its own plural rule (pt/en/es are all simple singular-vs-plural, with no
 * special cases like Russian/Polish).
 */
export interface Dictionary {
  common: {
    cancelar: string;
    fechar: string;
    menu: string;
    reiniciar: string;
    moedas: (n: number) => string;
    jogadas: (n: number) => string;
    dicas: (n: number) => string;
    telaCheia: string;
    sairDaTelaCheia: string;
  };

  menu: {
    appTitle: string;
    appSubtitle: string;
    continuar: string;
    jornada: string;
    diario: string;
    novoDesafioDisponivel: string;
    completo: string;
    batalhaDeChefao: string;
    fase: (n: number) => string;
    emAndamento: string;
    lojinha: string;
    som: string;
    musicaEEfeitos: string;
    ajustes: string;
    qualidadeGrafica: string;
    modalVitoriaDesativado: string;
    reativar: string;
  };

  hud: {
    chefao: string;
    chefaoTag: string;
    diario: string;
    fase: (n: number) => string;
    otimo: (n: number) => string;
    otimoInline: (n: number) => string;
    voltar: (n: number) => string;
    dica: (n: number) => string;
    dicaCalculando: string;
    maisTubo: (n: number) => string;
    pular: string;
    pularFase: string;
    proxima: string;
    repetir: string;
    naoMostrarNovamente: string;
    semMovimentosDisponiveis: string;
    semMovimentosAdicioneTubo: string;
    semMovimentosReinicieOuDesfaca: string;
    semMovimentosReinicieAFase: string;
    semMovimentosTitulo: string;
    naoHaMaisJogadas: string;
    decantado: string;
    chefaoDerrotado: string;
    preparandoBatalha: string;
    preparandoFase: string;
    erroPreparandoFase: string;
    carregandoLento: string;
    tentarNovamente: string;
  };

  shop: {
    title: string;
    fundos: string;
    corDoTubo: string;
    formatoDoTubo: string;
    emUso: string;
    equipar: string;
    gratis: string;
    visualizando: string;
    comprarPor: (price: number) => string;
    saldoInsuficiente: (price: number) => string;
  };

  ajustes: {
    title: string;
    qualidade: string;
    auto: string;
    alta: string;
    baixa: string;
    detecta: string;
    maisDetalhes: string;
    maisFluido: string;
    idioma: string;
    zonaDePerigo: string;
    apagarTodosOsDados: string;
    apagando: string;
    simApagarTudo: string;
    apagarConfirmTitle: string;
    apagarConfirmBody: string;
  };

  sound: {
    title: string;
    musica: string;
    trilhaSonoraDeFundo: string;
    faixaDeMusica: string;
    dinamico: string;
    mudaComADificuldadeDaFase: string;
    efeitos: string;
    sonsDeDespejoEInterface: string;
    efeitoSonoroDaAgua: string;
  };

  bossIntro: {
    tierN: (n: number) => string;
    recuar: string;
    enfrentar: string;
  };

  modeSelector: {
    jornada: string;
    escolhaOModo: string;
    semDesfazerSemTuboDicas: (n: number) => string;
  };

  wildTutorial: {
    coringa: string;
    entendi: string;
    intro: string;
    podeReceber: string;
    e: string;
    qualquerCorPode: string;
  };

  updateReady: {
    tituloDisponivel: string; // variant 'available' — an update is ready to install
    tituloNovidades: string;  // variant 'whatsNew' — already applied in the background, informational
    /** What changed, as SHORT sale-y lines (emoji included) — update on every release worth
     *  announcing. Keep it to 3-4 items, one line each; the modal renders them as a list. */
    notas: string[];
    depois: string;
    instalarAgora: string;
    ok: string;
  };

  modes: {
    zen: { name: string; tagline: string; description: string };
    balanced: { name: string; tagline: string; description: string };
    extreme: { name: string; tagline: string; description: string };
  };

  boss: {
    engarrafador: { name: string; title: string; lore: string; ability: string };
    alquimista: { name: string; title: string; lore: string; ability: string };
    oceano: { name: string; title: string; lore: string; ability: string };
  };

  economy: {
    bg: {
      noite: string;
      oceano: string;
      aurora: string;
      lavanda: string;
      sunset: string;
      carvao: string;
    };
    tube: {
      cristal: string;
      ambar: string;
      esmeralda: string;
      rose: string;
      ouro: string;
    };
    shape: {
      classica: string;
      proveta: string;
      farmacia: string;
      erlenmeyer: string;
      balao: string;
    };
  };

  levels: {
    facil: string;
    medio: string;
    dificil: string;
  };

  sfx: {
    'copo-agua': string;
    'copo-vidro': string;
    'copo-curto': string;
    'copo-agua-rapido': string;
    'copo-agua-lento': string;
    'jarra-vidro': string;
    'torneira-copo': string;
    'copo-cheio': string;
    'garrafa-enchendo': string;
  };

  v2: {
    jogar: string;              // primary menu action when there is NO saved session
    pularTelaVitoria: string;  // toggle in Settings
    // Immersion prompt on the first "Play" on mobile
    imersaoTitulo: string;
    imersaoCorpo: string;
    imersaoJogar: string;
    imersaoAgoraNao: string;
    imersaoIosTitulo: string;
    imersaoIosCorpo: string;
  };
}

/** Supported languages. 'pt-BR' is the "home" language — the fallback when the browser matches none. */
export type Lang = 'pt-BR' | 'en' | 'es';

export const DEFAULT_LANG: Lang = 'pt-BR';

/** Name of each language in ITS OWN tongue (never translated) — the standard language-selector
 *  convention, so someone who can't read the currently active language can still recognize theirs
 *  in the list. */
export const LANG_NAMES: Record<Lang, string> = {
  'pt-BR': 'Português',
  en: 'English',
  es: 'Español',
};

export const LANG_FLAGS: Record<Lang, string> = {
  'pt-BR': '🇧🇷',
  en: '🇺🇸',
  es: '🇪🇸',
};
