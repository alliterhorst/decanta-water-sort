import type { Lang } from '../types';
import { ptBR } from './pt-BR';
import { en } from './en';
import { es } from './es';

export const LOCALES: Record<Lang, typeof ptBR> = { 'pt-BR': ptBR, en, es };
