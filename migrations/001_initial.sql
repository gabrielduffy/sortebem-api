-- SORTEBEM - Initial Database Schema

-- Settings (configurações do sistema)
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Charities (instituições beneficentes)
CREATE TABLE IF NOT EXISTS charities (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  pix_key TEXT,
  is_active BOOLEAN DEFAULT true,
  total_received DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Charity Monthly (instituição do mês)
CREATE TABLE IF NOT EXISTS charity_monthly (
  id SERIAL PRIMARY KEY,
  charity_id INT REFERENCES charities(id),
  month INT NOT NULL CHECK (month >= 1 AND month <= 12),
  year INT NOT NULL,
  amount_received DECIMAL(12,2) DEFAULT 0,
  UNIQUE(month, year)
);

-- Managers (gerentes)
CREATE TABLE IF NOT EXISTS managers (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) UNIQUE,
  code TEXT UNIQUE NOT NULL,
  cpf TEXT UNIQUE,
  commission_rate DECIMAL(5,2) DEFAULT 3.00,
  total_commission DECIMAL(12,2) DEFAULT 0,
  kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'approved', 'rejected')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Establishments (estabelecimentos)
CREATE TABLE IF NOT EXISTS establishments (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) UNIQUE,
  manager_id INT REFERENCES managers(id) NULL,
  name TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  code TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  commission_rate DECIMAL(5,2) DEFAULT 7.00,
  total_sales DECIMAL(12,2) DEFAULT 0,
  total_commission DECIMAL(12,2) DEFAULT 0,
  kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'approved', 'rejected')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- POS Terminals (maquininhas)
CREATE TABLE IF NOT EXISTS pos_terminals (
  id SERIAL PRIMARY KEY,
  establishment_id INT REFERENCES establishments(id),
  terminal_id TEXT UNIQUE NOT NULL,
  api_key_hash TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT true,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rounds (rodadas)
CREATE TABLE IF NOT EXISTS rounds (
  id SERIAL PRIMARY KEY,
  number INT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('regular', 'special')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'selling', 'drawing', 'finished', 'cancelled')),
  card_price DECIMAL(10,2) NOT NULL,
  max_cards INT NOT NULL DEFAULT 10000,
  cards_sold INT DEFAULT 0,
  prize_pool DECIMAL(12,2) DEFAULT 0,
  charity_amount DECIMAL(12,2) DEFAULT 0,
  platform_amount DECIMAL(12,2) DEFAULT 0,
  commission_amount DECIMAL(12,2) DEFAULT 0,
  drawn_numbers INT[] DEFAULT '{}',
  winning_pattern TEXT,
  tiebreaker_number INT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  drawing_started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Purchases (compras)
CREATE TABLE IF NOT EXISTS purchases (
  id SERIAL PRIMARY KEY,
  round_id INT REFERENCES rounds(id),
  establishment_id INT REFERENCES establishments(id) NULL,
  terminal_id INT REFERENCES pos_terminals(id) NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'credit_card', 'debit_card')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'expired', 'cancelled', 'refunded')),
  pix_code TEXT,
  pix_qrcode TEXT,
  pix_expiration TIMESTAMPTZ,
  pix_transaction_id TEXT,
  card_transaction_id TEXT,
  card_brand TEXT,
  card_last_digits TEXT,
  customer_whatsapp TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cards (cartelas)
CREATE TABLE IF NOT EXISTS cards (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  round_id INT REFERENCES rounds(id),
  purchase_id INT REFERENCES purchases(id),
  numbers INT[] NOT NULL,
  is_winner BOOLEAN DEFAULT false,
  prize_amount DECIMAL(12,2),
  declared_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Draws (sorteios - números sorteados)
CREATE TABLE IF NOT EXISTS draws (
  id SERIAL PRIMARY KEY,
  round_id INT REFERENCES rounds(id),
  number INT NOT NULL,
  position INT NOT NULL,
  drawn_at TIMESTAMPTZ DEFAULT NOW()
);

-- Winners (vencedores)
CREATE TABLE IF NOT EXISTS winners (
  id SERIAL PRIMARY KEY,
  round_id INT REFERENCES rounds(id),
  card_id INT REFERENCES cards(id),
  prize_amount DECIMAL(12,2) NOT NULL,
  pattern_matched TEXT NOT NULL,
  tiebreaker_used BOOLEAN DEFAULT false,
  tiebreaker_number INT,
  tiebreaker_difference INT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'paid', 'expired')),
  claimed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  pix_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commissions (comissões)
CREATE TABLE IF NOT EXISTS commissions (
  id SERIAL PRIMARY KEY,
  purchase_id INT REFERENCES purchases(id),
  establishment_id INT REFERENCES establishments(id) NULL,
  manager_id INT REFERENCES managers(id) NULL,
  type TEXT NOT NULL CHECK (type IN ('establishment', 'manager')),
  amount DECIMAL(10,2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Withdrawals (saques)
CREATE TABLE IF NOT EXISTS withdrawals (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  amount DECIMAL(12,2) NOT NULL,
  pix_key TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp Config (configuração WhatsApp)
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id SERIAL PRIMARY KEY,
  api_url TEXT,
  api_key TEXT,
  sender_number TEXT,
  message_template TEXT,
  is_active BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WhatsApp Logs (logs de envio)
CREATE TABLE IF NOT EXISTS whatsapp_logs (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  card_codes TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'delivered', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Logs (logs de auditoria)
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INT,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_rounds_status ON rounds(status);
CREATE INDEX IF NOT EXISTS idx_rounds_starts_at ON rounds(starts_at);
CREATE INDEX IF NOT EXISTS idx_cards_round_id ON cards(round_id);
CREATE INDEX IF NOT EXISTS idx_cards_code ON cards(code);
CREATE INDEX IF NOT EXISTS idx_purchases_round_id ON purchases(round_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_draws_round_id ON draws(round_id);
CREATE INDEX IF NOT EXISTS idx_winners_round_id ON winners(round_id);
CREATE INDEX IF NOT EXISTS idx_commissions_establishment_id ON commissions(establishment_id);
CREATE INDEX IF NOT EXISTS idx_commissions_manager_id ON commissions(manager_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity, entity_id);

-- Inserir configurações iniciais
INSERT INTO settings (key, value) VALUES
  ('card_price_regular', '5.00'::jsonb),
  ('card_price_special', '10.00'::jsonb),
  ('round_duration_regular', '10'::jsonb),
  ('round_duration_special', '60'::jsonb),
  ('max_cards_per_round', '10000'::jsonb),
  ('number_min', '1'::jsonb),
  ('number_max', '75'::jsonb),
  ('prize_pool_percent', '40'::jsonb),
  ('charity_percent', '20'::jsonb),
  ('platform_percent', '30'::jsonb),
  ('commission_percent', '10'::jsonb),
  ('establishment_commission', '7'::jsonb),
  ('manager_commission', '3'::jsonb),
  ('winning_patterns', '["line_horizontal", "line_vertical", "diagonal", "full_card"]'::jsonb),
  ('tiebreaker_method', '"pedra"'::jsonb)
ON CONFLICT (key) DO NOTHING;
