import { defineConfig } from 'vitest/config';

// O core (gerador/solver) é puro TS — não precisa dos plugins de UI.
// testTimeout alto porque a geração com restrições (alquimia/coringa) faz busca pesada;
// ver tarefa de otimização do gerador. NÃO é regressão: o projeto antigo levava ~55s nesses.
export default defineConfig({
  test: {
    testTimeout: 120000,
    hookTimeout: 120000,
  },
});
