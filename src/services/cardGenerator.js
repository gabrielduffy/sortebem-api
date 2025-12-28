import { db } from '../config/database.js';
import { generateCardCode } from '../utils/codeGenerator.js';

/* =========================
   CARD GENERATOR
========================= */

/**
 * Gera números aleatórios únicos dentro de um range
 * @param {number} min - Valor mínimo
 * @param {number} max - Valor máximo
 * @param {number} count - Quantidade de números
 * @returns {number[]} Array de números únicos
 */
function generateUniqueNumbers(min, max, count) {
  const numbers = [];
  const available = [];

  for (let i = min; i <= max; i++) {
    available.push(i);
  }

  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * available.length);
    numbers.push(available[randomIndex]);
    available.splice(randomIndex, 1);
  }

  return numbers.sort((a, b) => a - b);
}

/**
 * Gera uma cartela de bingo SORTEBEM (5x5)
 * Grid: S(1-15), O(16-30), R(31-45), T(46-60), E(61-75)
 * Centro (posição 12) é livre (coração)
 *
 * @param {number} roundId - ID da rodada
 * @param {number} purchaseId - ID da compra
 * @returns {Promise<Object>} Cartela criada
 */
export async function generateCard(roundId, purchaseId) {
  try {
    // Gerar números para cada coluna
    const columnS = generateUniqueNumbers(1, 15, 5);    // 5 números
    const columnO = generateUniqueNumbers(16, 30, 5);   // 5 números
    const columnR = generateUniqueNumbers(31, 45, 4);   // 4 números (centro livre)
    const columnT = generateUniqueNumbers(46, 60, 5);   // 5 números
    const columnE = generateUniqueNumbers(61, 75, 5);   // 5 números

    // Montar grid 5x5 (total 24 números, posição 12 é livre)
    const numbers = [
      columnS[0], columnO[0], columnR[0], columnT[0], columnE[0],  // Linha 1
      columnS[1], columnO[1], columnR[1], columnT[1], columnE[1],  // Linha 2
      columnS[2], columnO[2], /* LIVRE */ columnT[2], columnE[2],  // Linha 3 (centro livre)
      columnS[3], columnO[3], columnR[2], columnT[3], columnE[3],  // Linha 4
      columnS[4], columnO[4], columnR[3], columnT[4], columnE[4]   // Linha 5
    ];

    // Gerar código único
    let code;
    let codeExists = true;

    while (codeExists) {
      code = generateCardCode();
      const check = await db.query('SELECT id FROM cards WHERE code = $1', [code]);
      codeExists = check.rows.length > 0;
    }

    // Inserir cartela no banco
    const result = await db.query(
      `INSERT INTO cards (code, round_id, purchase_id, numbers)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [code, roundId, purchaseId, numbers]
    );

    const card = result.rows[0];

    return {
      id: card.id,
      code: card.code,
      numbers: card.numbers,
      grid: convertToGrid(card.numbers)
    };
  } catch (error) {
    console.error('Error generating card:', error);
    throw error;
  }
}

/**
 * Gera múltiplas cartelas para uma compra
 * @param {number} roundId - ID da rodada
 * @param {number} purchaseId - ID da compra
 * @param {number} quantity - Quantidade de cartelas
 * @returns {Promise<Object[]>} Array de cartelas
 */
export async function generateCards(roundId, purchaseId, quantity) {
  const cards = [];

  for (let i = 0; i < quantity; i++) {
    const card = await generateCard(roundId, purchaseId);
    cards.push(card);
  }

  return cards;
}

/**
 * Converte array de números em grid 5x5
 * @param {number[]} numbers - Array com 24 números
 * @returns {Object} Grid estruturado
 */
export function convertToGrid(numbers) {
  return {
    S: [numbers[0], numbers[5], numbers[10], numbers[14], numbers[19]],
    O: [numbers[1], numbers[6], numbers[11], numbers[15], numbers[20]],
    R: [numbers[2], numbers[7], 'FREE', numbers[16], numbers[21]],
    T: [numbers[3], numbers[8], numbers[12], numbers[17], numbers[22]],
    E: [numbers[4], numbers[9], numbers[13], numbers[18], numbers[23]]
  };
}

/**
 * Converte grid em array de posições
 * @param {Object} grid - Grid estruturado
 * @returns {number[]} Array de números
 */
export function convertToArray(grid) {
  return [
    grid.S[0], grid.O[0], grid.R[0], grid.T[0], grid.E[0],
    grid.S[1], grid.O[1], grid.R[1], grid.T[1], grid.E[1],
    grid.S[2], grid.O[2], /* FREE */ grid.T[2], grid.E[2],
    grid.S[3], grid.O[3], grid.R[2], grid.T[3], grid.E[3],
    grid.S[4], grid.O[4], grid.R[3], grid.T[4], grid.E[4]
  ];
}

/**
 * Busca cartela pelo código
 * @param {string} code - Código da cartela
 * @returns {Promise<Object|null>} Cartela encontrada
 */
export async function getCardByCode(code) {
  try {
    const result = await db.query(
      `SELECT c.*, p.payment_status, r.status as round_status
       FROM cards c
       LEFT JOIN purchases p ON c.purchase_id = p.id
       LEFT JOIN rounds r ON c.round_id = r.id
       WHERE c.code = $1`,
      [code]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const card = result.rows[0];

    return {
      ...card,
      grid: convertToGrid(card.numbers)
    };
  } catch (error) {
    console.error('Error getting card:', error);
    throw error;
  }
}
