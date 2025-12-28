/* =========================
   VALIDATION HELPERS
========================= */

export function validate(schema) {
  return async (request, reply) => {
    try {
      const errors = [];

      // Validar campos obrigatórios
      if (schema.required) {
        for (const field of schema.required) {
          if (request.body[field] === undefined || request.body[field] === null || request.body[field] === '') {
            errors.push(`Campo '${field}' é obrigatório`);
          }
        }
      }

      // Validar tipos
      if (schema.fields) {
        for (const [field, rules] of Object.entries(schema.fields)) {
          const value = request.body[field];

          if (value !== undefined && value !== null) {
            // Validar tipo
            if (rules.type) {
              const actualType = Array.isArray(value) ? 'array' : typeof value;
              if (actualType !== rules.type) {
                errors.push(`Campo '${field}' deve ser do tipo ${rules.type}`);
              }
            }

            // Validar min/max para strings
            if (rules.type === 'string') {
              if (rules.min && value.length < rules.min) {
                errors.push(`Campo '${field}' deve ter no mínimo ${rules.min} caracteres`);
              }
              if (rules.max && value.length > rules.max) {
                errors.push(`Campo '${field}' deve ter no máximo ${rules.max} caracteres`);
              }
            }

            // Validar min/max para números
            if (rules.type === 'number') {
              if (rules.min !== undefined && value < rules.min) {
                errors.push(`Campo '${field}' deve ser no mínimo ${rules.min}`);
              }
              if (rules.max !== undefined && value > rules.max) {
                errors.push(`Campo '${field}' deve ser no máximo ${rules.max}`);
              }
            }

            // Validar enum
            if (rules.enum && !rules.enum.includes(value)) {
              errors.push(`Campo '${field}' deve ser um dos valores: ${rules.enum.join(', ')}`);
            }

            // Validar email
            if (rules.email) {
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              if (!emailRegex.test(value)) {
                errors.push(`Campo '${field}' deve ser um email válido`);
              }
            }

            // Validar telefone (WhatsApp)
            if (rules.phone) {
              const phoneRegex = /^\+?[1-9]\d{1,14}$/;
              if (!phoneRegex.test(value.replace(/\D/g, ''))) {
                errors.push(`Campo '${field}' deve ser um telefone válido`);
              }
            }

            // Validar CPF
            if (rules.cpf) {
              const cpf = value.replace(/\D/g, '');
              if (!isValidCPF(cpf)) {
                errors.push(`Campo '${field}' deve ser um CPF válido`);
              }
            }

            // Validar CNPJ
            if (rules.cnpj) {
              const cnpj = value.replace(/\D/g, '');
              if (!isValidCNPJ(cnpj)) {
                errors.push(`Campo '${field}' deve ser um CNPJ válido`);
              }
            }

            // Validação customizada
            if (rules.custom) {
              const customError = rules.custom(value, request.body);
              if (customError) {
                errors.push(customError);
              }
            }
          }
        }
      }

      if (errors.length > 0) {
        return reply.status(400).send({
          ok: false,
          error: 'Erro de validação',
          details: errors
        });
      }
    } catch (error) {
      console.error('Validation error:', error);
      return reply.status(500).send({
        ok: false,
        error: 'Erro ao validar dados'
      });
    }
  };
}

/* =========================
   CPF VALIDATION
========================= */
function isValidCPF(cpf) {
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let digit1 = 11 - (sum % 11);
  if (digit1 > 9) digit1 = 0;

  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  let digit2 = 11 - (sum % 11);
  if (digit2 > 9) digit2 = 0;

  return parseInt(cpf.charAt(9)) === digit1 && parseInt(cpf.charAt(10)) === digit2;
}

/* =========================
   CNPJ VALIDATION
========================= */
function isValidCNPJ(cnpj) {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  let size = cnpj.length - 2;
  let numbers = cnpj.substring(0, size);
  const digits = cnpj.substring(size);
  let sum = 0;
  let pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;

  size = size + 1;
  numbers = cnpj.substring(0, size);
  sum = 0;
  pos = size - 7;

  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }

  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(digits.charAt(1));
}

/* =========================
   COMMON SCHEMAS
========================= */
export const schemas = {
  login: {
    required: ['password'],
    fields: {
      email: { type: 'string', email: true },
      whatsapp: { type: 'string', phone: true },
      password: { type: 'string', min: 6 }
    }
  },

  createUser: {
    required: ['name', 'password', 'role'],
    fields: {
      name: { type: 'string', min: 2, max: 100 },
      email: { type: 'string', email: true },
      whatsapp: { type: 'string', phone: true },
      password: { type: 'string', min: 6 },
      role: { type: 'string', enum: ['admin', 'manager', 'establishment', 'user'] }
    }
  },

  createPurchase: {
    required: ['round_id', 'quantity', 'payment_method'],
    fields: {
      round_id: { type: 'number', min: 1 },
      quantity: { type: 'number', min: 1, max: 100 },
      payment_method: { type: 'string', enum: ['pix', 'credit_card', 'debit_card'] },
      customer_whatsapp: { type: 'string', phone: true }
    }
  }
};
