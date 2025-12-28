import { customAlphabet } from 'nanoid';

/* =========================
   CODE GENERATORS
========================= */

// Alfabeto sem caracteres ambíguos (sem 0, O, I, l, 1)
const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const nanoid = customAlphabet(alphabet, 8);

/**
 * Gera código de cartela no formato SB-XXXXXXXX
 * @returns {string} Código único da cartela
 */
export function generateCardCode() {
  return `SB-${nanoid()}`;
}

/**
 * Gera código de gerente no formato MGR-XXXX
 * @returns {string} Código único do gerente
 */
export function generateManagerCode() {
  const shortId = customAlphabet(alphabet, 6);
  return `MGR-${shortId()}`;
}

/**
 * Gera código de estabelecimento no formato EST-XXXX
 * @returns {string} Código único do estabelecimento
 */
export function generateEstablishmentCode() {
  const shortId = customAlphabet(alphabet, 6);
  return `EST-${shortId()}`;
}

/**
 * Gera código de terminal POS no formato POS-XXXXXXXX
 * @returns {string} Código único do terminal
 */
export function generatePOSTerminalId() {
  return `POS-${nanoid()}`;
}

/**
 * Gera API Key para terminal POS (32 caracteres)
 * @returns {string} API key aleatória
 */
export function generatePOSApiKey() {
  const keyGen = customAlphabet(alphabet + 'abcdefghijkmnopqrstuvwxyz', 32);
  return keyGen();
}

/**
 * Gera slug amigável para URL a partir de um nome
 * @param {string} name - Nome do estabelecimento
 * @returns {string} Slug para URL
 */
export function generateSlug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^\w\s-]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/-+/g, '-') // Remove hífens duplicados
    .trim();
}

/**
 * Adiciona sufixo numérico ao slug se já existir
 * @param {string} baseSlug - Slug base
 * @param {number} counter - Contador
 * @returns {string} Slug com sufixo
 */
export function addSlugSuffix(baseSlug, counter) {
  return `${baseSlug}-${counter}`;
}
