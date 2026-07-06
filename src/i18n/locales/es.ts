import type { Dictionary } from '../types';

export const es: Dictionary = {
  common: {
    cancelar: 'Cancelar',
    fechar: 'Cerrar',
    menu: 'Menú',
    reiniciar: 'Reiniciar',
    moedas: (n) => `${n} ${n === 1 ? 'moneda' : 'monedas'}`,
    jogadas: (n) => `${n} ${n === 1 ? 'movimiento' : 'movimientos'}`,
    dicas: (n) => `${n} ${n === 1 ? 'pista' : 'pistas'}`,
    telaCheia: 'Pantalla completa',
    sairDaTelaCheia: 'Salir de pantalla completa',
  },

  menu: {
    appTitle: 'Decanta',
    appSubtitle: 'Water Sort',
    continuar: 'Continuar',
    jornada: 'Jornada',
    diario: 'Diario',
    novoDesafioDisponivel: 'Nuevo desafío disponible',
    completo: 'completo',
    batalhaDeChefao: 'Batalla de Jefe',
    fase: (n) => `Nivel ${n}`,
    emAndamento: 'en curso',
    lojinha: 'Tienda',
    som: 'Sonido',
    musicaEEfeitos: 'Música y efectos',
    ajustes: 'Ajustes',
    qualidadeGrafica: 'Calidad gráfica',
    modalVitoriaDesativado: 'Pantalla de victoria desactivada',
    reativar: 'reactivar',
  },

  hud: {
    chefao: 'Jefe',
    chefaoTag: '⚔ Jefe',
    diario: 'Diario',
    fase: (n) => `Nivel ${n}`,
    otimo: (n) => `óptimo: ${n}`,
    otimoInline: (n) => `óptimo ${n}`,
    voltar: (n) => (n < 0 ? 'Deshacer' : `Deshacer${n > 0 ? ` (${n})` : ''}`),
    dica: (n) => (n < 0 ? 'Pista' : `Pista${n > 0 ? ` (${n})` : ''}`),
    dicaCalculando: 'Pista…',
    maisTubo: (n) => (n < 0 ? '+Tubo' : `+Tubo${n > 0 ? ` (${n})` : ''}`),
    pular: 'Saltar →',
    pularFase: 'Saltar nivel →',
    proxima: 'Siguiente →',
    repetir: 'Repetir',
    naoMostrarNovamente: 'No mostrar de nuevo',
    semMovimentosDisponiveis: 'Sin movimientos disponibles',
    semMovimentosAdicioneTubo: 'Sin movimientos — agrega un tubo',
    semMovimentosReinicieOuDesfaca: 'Sin movimientos — reinicia o deshaz',
    semMovimentosReinicieAFase: 'Sin movimientos — reinicia el nivel',
    semMovimentosTitulo: '¡Sin movimientos!',
    naoHaMaisJogadas: 'No hay más movimientos posibles.',
    decantado: '¡Decantado!',
    chefaoDerrotado: '⚔ ¡Jefe Derrotado!',
    preparandoBatalha: 'Preparando batalla…',
    preparandoFase: 'Preparando nivel…',
  },

  shop: {
    title: 'Tienda',
    fundos: 'Fondos',
    estilosDeTubo: 'Estilos de tubo',
    emUso: 'En uso',
    equipar: 'Equipar',
    gratis: 'Gratis',
    visualizando: 'Visualizando…',
    comprarPor: (price) => `Comprar por ★ ${price} monedas`,
    saldoInsuficiente: (price) => `★ ${price} monedas — saldo insuficiente`,
  },

  ajustes: {
    title: 'Ajustes',
    qualidade: 'Calidad',
    auto: 'Auto',
    alta: 'Alta',
    baixa: 'Baja',
    detecta: 'Detecta',
    maisDetalhes: 'Más detalle',
    maisFluido: 'Más fluido',
    idioma: 'Idioma',
    zonaDePerigo: 'Zona de peligro',
    apagarTodosOsDados: 'Borrar todos los datos',
    apagando: 'Borrando…',
    simApagarTudo: 'Sí, borrar todo',
    apagarConfirmTitle: '¿Borrar todos los datos?',
    apagarConfirmBody:
      'Esto borra el progreso de la Jornada, las monedas, los artículos de la tienda, las ' +
      'preferencias y el desafío diario — todo. No se puede deshacer. El juego se reiniciará ' +
      'desde cero, como si nunca lo hubieras abierto antes.',
  },

  sound: {
    title: 'Sonido',
    musica: 'Música',
    trilhaSonoraDeFundo: 'Música de fondo',
    faixaDeMusica: 'Pista de música',
    dinamico: 'Dinámico',
    mudaComADificuldadeDaFase: 'Cambia con la dificultad del nivel',
    efeitos: 'Efectos',
    sonsDeDespejoEInterface: 'Sonidos de vertido e interfaz',
    efeitoSonoroDaAgua: 'Efecto de sonido del agua',
  },

  bossIntro: {
    tierN: (n) => `⚔ Jefe · Rango ${n}`,
    recuar: 'Retirarse',
    enfrentar: '¡Enfrentar!',
  },

  modeSelector: {
    jornada: 'Jornada',
    escolhaOModo: 'Elige un modo',
    semDesfazerSemTuboDicas: (n) => `Sin deshacer · Sin +tubo · ${n} ${n === 1 ? 'pista' : 'pistas'}`,
  },

  wildTutorial: {
    coringa: 'Comodín',
    entendi: 'Entendido',
    intro: 'Este color especial combina con cualquier otro.',
    podeReceber: 'Puede recibir cualquier color,',
    e: 'y',
    qualquerCorPode: 'cualquier color puede verterse en un tubo con comodín.',
  },

  modes: {
    zen: {
      name: 'Zen',
      tagline: 'Ritmo suave, sin prisa',
      description: 'Niveles más tranquilos con menos colores. Ayuda ilimitada, sin penalización.',
    },
    balanced: {
      name: 'Equilibrado',
      tagline: 'Desafío progresivo',
      description: 'Una mezcla de niveles fáciles y difíciles. Las mecánicas especiales aparecen poco a poco.',
    },
    extreme: {
      name: 'Extremo',
      tagline: 'Un movimiento en falso y se acabó',
      description: 'Más colores, menos espacio vacío. Sin deshacer, sin tubo extra. Solo 3 pistas.',
    },
  },

  boss: {
    engarrafador: {
      name: 'El Embotellador',
      title: 'Maestro del Caos Líquido',
      lore:
        'Un artesano obsesivo que pasó décadas intentando embotellar colores perfectos. ' +
        'Nunca lo logró — y no quiere que tú lo logres tampoco. ' +
        'Cada momento de descuido, intercambia el contenido de dos tubos al azar.',
      ability: '💧 Diluvio · Cada 5 movimientos, dos tubos intercambian el líquido de arriba',
    },
    alquimista: {
      name: 'La Alquimista',
      title: 'Señora de las Metamorfosis',
      lore:
        'Maestra de transformaciones imposibles. ' +
        'Sus líquidos nunca se quedan quietos; cada vez que te descuidas, dos tubos ' +
        'intercambian de lugar, como si la propia química se negara a ser domada.',
      ability: '🧪 Doble Diluvio · Cada 4 movimientos, dos tubos intercambian el líquido de arriba',
    },
    oceano: {
      name: 'El Océano',
      title: 'Fuerza de la Naturaleza',
      lore:
        'No es un ser — es una fuerza primordial. ' +
        'No se cansa, no siente, no se detiene. ' +
        'Cada tres movimientos trae una nueva marea que intercambia el contenido de dos tubos.',
      ability: '🌊 Marea Triple · Cada 3 movimientos, dos tubos intercambian el líquido de arriba',
    },
  },

  economy: {
    bg: {
      noite: 'Noche de taller',
      oceano: 'Fondo del mar',
      aurora: 'Aurora',
      lavanda: 'Lavanda',
      sunset: 'Atardecer',
      carvao: 'Carbón',
    },
    tube: {
      cristal: 'Cristal',
      ambar: 'Ámbar',
      esmeralda: 'Esmeralda',
      rose: 'Rosé',
      ouro: 'Oro viejo',
    },
  },

  levels: {
    facil: 'Fácil',
    medio: 'Medio',
    dificil: 'Difícil',
  },

  sfx: {
    'copo-agua': 'Agua en el vaso',
    'copo-vidro': 'Vaso de vidrio',
    'copo-curto': 'Vertido corto',
    'copo-agua-rapido': 'Vertido rápido',
    'copo-agua-lento': 'Vaso llenándose despacio',
    'jarra-vidro': 'Jarra en vidrio',
    'torneira-copo': 'Grifo llenando',
    'copo-cheio': 'Vaso llenándose',
    'garrafa-enchendo': 'Botella llenándose',
  },

  v2: {
    jogar: 'Jugar',
    pularTelaVitoria: 'Saltar pantalla de victoria',
    imersaoTitulo: '¿Jugar en pantalla completa?',
    imersaoCorpo: 'Más espacio para los tubos. Puedes salir cuando quieras.',
    imersaoJogar: 'Pantalla completa',
    imersaoAgoraNao: 'Ahora no',
    imersaoIosTitulo: 'Juega en pantalla completa',
    imersaoIosCorpo: 'Toca Compartir y elige “Añadir a pantalla de inicio”. El juego se abre en pantalla completa desde el icono.',
  },
};
