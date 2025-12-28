-- SORTEBEM - Migration 002: Backend Completo com Gateways e Configurações Dinâmicas

-- Adicionar colunas nas tabelas existentes
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS transaction_code TEXT UNIQUE;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS gateway TEXT DEFAULT 'asaas';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS gateway_transaction_id TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS gateway_response JSONB;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS refund_reason TEXT;

ALTER TABLE rounds ADD COLUMN IF NOT EXISTS selling_ends_at TIMESTAMPTZ;
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS is_selling BOOLEAN DEFAULT false;

ALTER TABLE winners ADD COLUMN IF NOT EXISTS establishment_name TEXT;

ALTER TABLE establishments ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE managers ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

ALTER TABLE charities ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE charities ADD COLUMN IF NOT EXISTS instagram TEXT;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_purchases_transaction_code ON purchases(transaction_code);
CREATE INDEX IF NOT EXISTS idx_purchases_gateway_transaction_id ON purchases(gateway_transaction_id);
CREATE INDEX IF NOT EXISTS idx_rounds_is_selling ON rounds(is_selling);
CREATE INDEX IF NOT EXISTS idx_rounds_selling_ends_at ON rounds(selling_ends_at);

-- Inserir configurações do sistema
INSERT INTO settings (key, value) VALUES
-- Gateway de Pagamento
('gateway_config', '{
  "default_pix_gateway": "asaas",
  "default_card_gateway": "pagseguro",
  "asaas": {
    "enabled": false,
    "environment": "sandbox",
    "api_key": "",
    "pix_key": "",
    "webhook_token": ""
  },
  "pagseguro": {
    "enabled": false,
    "environment": "sandbox",
    "token": "",
    "webhook_token": ""
  }
}'::jsonb),

-- WhatsApp
('whatsapp_config', '{
  "enabled": false,
  "api_url": "https://meuwhatsapp-meuwhatsapp.ax5glv.easypanel.host",
  "api_key": "",
  "sender_number": "",
  "message_template": "🎟️ Suas cartelas SORTEBEM!\\n\\nOlá! Aqui estão suas cartelas para o próximo sorteio:\\n{CÓDIGOS_DAS_CARTELAS}\\n\\n🎯 Acesse: sortebem.com.br/c/{CÓDIGO}\\n\\nBoa sorte! 🍀"
}'::jsonb),

-- Rodada
('round_config', '{
  "regular": {
    "duration_minutes": 10,
    "selling_minutes": 7,
    "closed_minutes": 3,
    "card_price": 5.00
  },
  "special": {
    "duration_minutes": 60,
    "selling_minutes": 57,
    "closed_minutes": 3,
    "card_price": 10.00
  },
  "pix_expiration_minutes": 2,
  "max_cards_per_round": 10000,
  "max_cards_per_purchase": 99
}'::jsonb),

-- Sorteio
('draw_config', '{
  "number_min": 1,
  "number_max": 75,
  "draw_interval_seconds": 5,
  "winning_patterns": ["line_horizontal", "line_vertical", "diagonal", "full_card"],
  "multiple_patterns": false,
  "tiebreaker_method": "pedra",
  "tiebreaker_number_min": 1,
  "tiebreaker_number_max": 99,
  "show_tiebreaker_publicly": true,
  "tiebreaker_animation": true,
  "tie_window_ms": 5000
}'::jsonb),

-- Splits/Divisão
('split_config', '{
  "prize_pool_percent": 40,
  "charity_percent": 20,
  "platform_percent": 30,
  "commission_percent": 10,
  "establishment_commission_percent": 7,
  "manager_commission_percent": 3
}'::jsonb),

-- Aparência da Cartela
('card_appearance', '{
  "font_family": "Poppins",
  "number_font_size": 24,
  "code_font_size": 14,
  "background_color": "#ffffff",
  "number_color": "#1a1a1a",
  "marked_background_color": "#f97316",
  "marked_number_color": "#ffffff",
  "animations_enabled": true
}'::jsonb),

-- Modo TV
('tv_config', '{
  "font_family": "Poppins",
  "number_font_size": 72,
  "background_color": "#1a1a1a",
  "number_color": "#f97316",
  "show_winners_history": true,
  "winners_history_count": 5,
  "winner_display_seconds": 10,
  "auto_rotate": true,
  "show_charity": true,
  "show_establishment_name": true
}'::jsonb),

-- Voz IA (para futuro)
('voice_config', '{
  "enabled": false,
  "voice_type": "female",
  "speed": 1.0,
  "announce_numbers": true,
  "announce_winners": true
}'::jsonb),

-- POS
('pos_config', '{
  "enabled": true,
  "print_qrcode": true,
  "compact_mode": false,
  "receipt_template": "----------------------------------------\\n        SORTEBEM\\n     Sorteio Beneficente\\n----------------------------------------\\n\\nData: {DATA}\\nHora: {HORA}\\nRodada: #{RODADA}\\n\\n----------------------------------------\\nCARTELA(S):\\n{CARTELAS}\\n----------------------------------------\\n\\nValor Total: R$ {VALOR}\\n\\nAcesse: sortebem.com.br/c/{CODIGO}\\n\\n{QR_CODE}\\n\\nGuarde este comprovante!\\nEle é necessário para resgatar\\nseu prêmio em caso de vitória.\\n\\n----------------------------------------\\n         BOA SORTE! 🍀\\n----------------------------------------"
}'::jsonb)

ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
