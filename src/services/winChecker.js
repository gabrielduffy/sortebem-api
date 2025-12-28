/* =========================
   WIN CHECKER SERVICE
========================= */

/**
 * Padrões de vitória disponíveis
 * Cada padrão é representado pelos índices do array de números
 * Lembre-se: posição 12 (centro) é sempre considerada marcada (FREE)
 */
const PATTERNS = {
  // Linhas horizontais
  line_horizontal: [
    [0, 1, 2, 3, 4],      // Linha 1
    [5, 6, 7, 8, 9],      // Linha 2
    [10, 11, 13, 14],     // Linha 3 (sem posição 12 - FREE)
    [15, 16, 17, 18, 19], // Linha 4
    [20, 21, 22, 23]      // Linha 5 (corrigido - 24 elementos no total)
  ],

  // Colunas verticais
  line_vertical: [
    [0, 5, 10, 15, 20],   // Coluna S
    [1, 6, 11, 16, 21],   // Coluna O
    [2, 7, 17, 22],       // Coluna R (sem posição 12 - FREE)
    [3, 8, 13, 18, 23],   // Coluna T
    [4, 9, 14, 19]        // Coluna E (corrigido - só 4 posições após a linha 3)
  ],

  // Diagonais
  diagonal: [
    [0, 6, 18],           // Diagonal \ (sem centro)
    [4, 8, 16]            // Diagonal / (sem centro)
  ],

  // Cartela cheia (todos os 24 números)
  full_card: [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
  ],

  // Formato X (diagonais completas)
  format_x: [
    [0, 6, 8, 4, 18, 16] // Ambas diagonais
  ],

  // Formato L
  format_l: [
    [0, 5, 10, 15, 20, 21, 22, 23], // L esquerdo
    [4, 9, 14, 19, 20, 21, 22, 23]  // L direito
  ],

  // Formato T
  format_t: [
    [0, 1, 2, 3, 4, 8, 13, 18, 23], // T superior
    [20, 21, 22, 23, 7, 2]          // T inferior
  ],

  // 4 Cantos
  four_corners: [
    [0, 4, 20, 23] // Nota: array tem 24 elementos (0-23)
  ]
};

/**
 * Verifica se a cartela ganhou com os números sorteados
 * @param {number[]} cardNumbers - Números da cartela (24 elementos)
 * @param {number[]} drawnNumbers - Números já sorteados
 * @param {string[]} activePatterns - Padrões ativos para esta rodada
 * @returns {Object} { won: boolean, pattern: string|null }
 */
export function checkWin(cardNumbers, drawnNumbers, activePatterns = ['line_horizontal', 'line_vertical', 'diagonal', 'full_card']) {
  const drawnSet = new Set(drawnNumbers);

  // Para cada padrão ativo
  for (const patternName of activePatterns) {
    const patternVariations = PATTERNS[patternName];

    if (!patternVariations) {
      console.warn(`Pattern ${patternName} not found`);
      continue;
    }

    // Para cada variação do padrão
    for (const positions of patternVariations) {
      // Verifica se todos os números nas posições foram sorteados
      const allMarked = positions.every(pos => {
        // Posição 12 é sempre marcada (FREE)
        if (pos === 12) return true;

        const cardNumber = cardNumbers[pos];
        return drawnSet.has(cardNumber);
      });

      if (allMarked) {
        return {
          won: true,
          pattern: patternName,
          variation: positions
        };
      }
    }
  }

  return {
    won: false,
    pattern: null
  };
}

/**
 * Verifica múltiplas cartelas de uma vez
 * @param {Object[]} cards - Array de cartelas {id, numbers}
 * @param {number[]} drawnNumbers - Números já sorteados
 * @param {string[]} activePatterns - Padrões ativos
 * @returns {Object[]} Array de cartelas vencedoras
 */
export function checkMultipleCards(cards, drawnNumbers, activePatterns) {
  const winners = [];

  for (const card of cards) {
    const result = checkWin(card.numbers, drawnNumbers, activePatterns);

    if (result.won) {
      winners.push({
        cardId: card.id,
        cardCode: card.code,
        pattern: result.pattern,
        variation: result.variation
      });
    }
  }

  return winners;
}

/**
 * Calcula proximidade para desempate tipo "pedra"
 * @param {number} cardNumber - Número que a cartela tem
 * @param {number} tiebreaker - Número da pedra
 * @returns {number} Diferença absoluta
 */
export function calculateTiebreakerDistance(cardNumber, tiebreaker) {
  return Math.abs(cardNumber - tiebreaker);
}

/**
 * Resolve empate usando o método "pedra"
 * @param {Object[]} winners - Cartelas vencedoras
 * @param {number} tiebreakerNumber - Número da pedra
 * @returns {Object} Vencedor final
 */
export function resolveTiebreakerPedra(winners, tiebreakerNumber) {
  let closestWinner = null;
  let smallestDistance = Infinity;

  for (const winner of winners) {
    // Para cada número da cartela, calcular distância
    const distances = winner.numbers.map(num =>
      calculateTiebreakerDistance(num, tiebreakerNumber)
    );

    // Pegar a menor distância
    const minDistance = Math.min(...distances);
    const closestNumber = winner.numbers[distances.indexOf(minDistance)];

    if (minDistance < smallestDistance) {
      smallestDistance = minDistance;
      closestWinner = {
        ...winner,
        tiebreaker_number: closestNumber,
        tiebreaker_difference: minDistance
      };
    }
  }

  return closestWinner;
}

/**
 * Resolve empate por divisão de prêmio
 * @param {Object[]} winners - Cartelas vencedoras
 * @param {number} totalPrize - Valor total do prêmio
 * @returns {Object[]} Winners com prêmio dividido
 */
export function resolveTiebreakerDivision(winners, totalPrize) {
  const prizePerWinner = totalPrize / winners.length;

  return winners.map(winner => ({
    ...winner,
    prize_amount: prizePerWinner,
    divided: true
  }));
}

/**
 * Obtém todos os padrões disponíveis
 * @returns {string[]} Lista de nomes de padrões
 */
export function getAvailablePatterns() {
  return Object.keys(PATTERNS);
}

/**
 * Valida se os padrões são válidos
 * @param {string[]} patterns - Padrões para validar
 * @returns {boolean} True se todos forem válidos
 */
export function validatePatterns(patterns) {
  return patterns.every(p => PATTERNS[p] !== undefined);
}
