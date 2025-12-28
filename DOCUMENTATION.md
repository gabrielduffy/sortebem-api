# SORTEBEM - Documentação Completa do Backend

> Plataforma de sorteios beneficentes estilo bingo online

## =Ú Índice

1. [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
2. [API Endpoints](#api-endpoints)
3. [Serviços](#serviços)
4. [Fluxos Principais](#fluxos-principais)
5. [Configurações](#configurações)
6. [Variáveis de Ambiente](#variáveis-de-ambiente)

---

## 1. Estrutura do Banco de Dados

### Tabela: `users`
**Descrição**: Usuários do sistema (admins, gerentes, estabelecimentos, usuários finais)

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| name | TEXT | NOT NULL | - | Nome completo |
| email | TEXT | NOT NULL | - | Email (único) |
| whatsapp | TEXT | NULL | - | WhatsApp |
| phone | TEXT | NULL | - | Telefone |
| cpf | TEXT | NULL | - | CPF |
| password_hash | TEXT | NOT NULL | - | Senha hasheada |
| role | TEXT | NOT NULL | - | Papel: admin, manager, establishment, user |
| is_active | BOOLEAN | NOT NULL | true | Ativo/inativo |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

---

### Tabela: `managers`
**Descrição**: Gerentes que supervisionam estabelecimentos

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| user_id | INT | NULL | - | FK ’ users.id (UNIQUE) |
| code | TEXT | NOT NULL | - | Código único (MGR-XXXX) |
| cpf | TEXT | NULL | - | CPF (único) |
| commission_rate | DECIMAL(5,2) | NOT NULL | 3.00 | Taxa de comissão (%) |
| total_commission | DECIMAL(12,2) | NOT NULL | 0 | Total de comissões |
| balance | DECIMAL(12,2) | NOT NULL | 0 | Saldo disponível |
| kyc_status | TEXT | NOT NULL | pending | Status KYC: pending, approved, rejected |
| is_active | BOOLEAN | NOT NULL | true | Ativo/inativo |
| referral_code | TEXT | NULL | - | Código de indicação |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `user_id` REFERENCES `users(id)`

---

### Tabela: `establishments`
**Descrição**: Estabelecimentos físicos onde terminais POS são instalados

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| user_id | INT | NULL | - | FK ’ users.id (UNIQUE) |
| manager_id | INT | NULL | - | FK ’ managers.id |
| name | TEXT | NOT NULL | - | Nome do estabelecimento |
| cnpj | TEXT | NULL | - | CNPJ (único) |
| phone | TEXT | NULL | - | Telefone |
| address | TEXT | NULL | - | Endereço |
| city | TEXT | NULL | - | Cidade |
| state | TEXT | NULL | - | Estado (UF) |
| code | TEXT | NOT NULL | - | Código único (EST-XXXX) |
| slug | TEXT | NOT NULL | - | Slug para URLs (único) |
| logo_url | TEXT | NULL | - | URL do logo |
| commission_rate | DECIMAL(5,2) | NOT NULL | 7.00 | Taxa de comissão (%) |
| balance | DECIMAL(12,2) | NOT NULL | 0 | Saldo disponível |
| total_sales | DECIMAL(12,2) | NOT NULL | 0 | Total de vendas |
| total_commission | DECIMAL(12,2) | NOT NULL | 0 | Total de comissões |
| kyc_status | TEXT | NOT NULL | pending | Status KYC |
| is_active | BOOLEAN | NOT NULL | true | Ativo/inativo |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `user_id` REFERENCES `users(id)`
- `manager_id` REFERENCES `managers(id)`

---

### Tabela: `charities`
**Descrição**: Instituições beneficentes que recebem doações

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| name | TEXT | NOT NULL | - | Nome da instituição |
| description | TEXT | NULL | - | Descrição |
| logo_url | TEXT | NULL | - | URL do logo |
| pix_key | TEXT | NULL | - | Chave PIX |
| website | TEXT | NULL | - | Website |
| instagram | TEXT | NULL | - | Instagram |
| is_active | BOOLEAN | NOT NULL | true | Ativo/inativo |
| total_received | DECIMAL(12,2) | NOT NULL | 0 | Total recebido |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

---

### Tabela: `charity_monthly`
**Descrição**: Instituição beneficente do mês

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| charity_id | INT | NOT NULL | - | FK ’ charities.id |
| month | INT | NOT NULL | - | Mês (1-12) |
| year | INT | NOT NULL | - | Ano |
| amount_received | DECIMAL(12,2) | NOT NULL | 0 | Valor recebido no mês |

**Chaves Estrangeiras**:
- `charity_id` REFERENCES `charities(id)`

**Constraints**:
- UNIQUE(`month`, `year`)

---

### Tabela: `pos_terminals`
**Descrição**: Terminais POS (maquininhas) dos estabelecimentos

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| establishment_id | INT | NOT NULL | - | FK ’ establishments.id |
| terminal_id | TEXT | NOT NULL | - | ID único do terminal (POS-XXXXXXXX) |
| api_key_hash | TEXT | NOT NULL | - | Hash da API key |
| name | TEXT | NULL | - | Nome/identificação |
| is_active | BOOLEAN | NOT NULL | true | Ativo/inativo |
| last_heartbeat | TIMESTAMPTZ | NULL | - | Último ping |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `establishment_id` REFERENCES `establishments(id)`

---

### Tabela: `rounds`
**Descrição**: Rodadas de sorteio

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| number | INT | NOT NULL | - | Número da rodada (único, sequencial) |
| type | TEXT | NOT NULL | - | Tipo: regular, special |
| status | TEXT | NOT NULL | scheduled | Status: scheduled, selling, drawing, finished, cancelled |
| card_price | DECIMAL(10,2) | NOT NULL | - | Preço da cartela |
| max_cards | INT | NOT NULL | 10000 | Máximo de cartelas |
| cards_sold | INT | NOT NULL | 0 | Cartelas vendidas |
| prize_pool | DECIMAL(12,2) | NOT NULL | 0 | Pote do prêmio (40%) |
| charity_amount | DECIMAL(12,2) | NOT NULL | 0 | Valor para caridade (20%) |
| platform_amount | DECIMAL(12,2) | NOT NULL | 0 | Valor da plataforma (30%) |
| commission_amount | DECIMAL(12,2) | NOT NULL | 0 | Comissões (10%) |
| drawn_numbers | INT[] | NOT NULL | {} | Números já sorteados |
| winning_pattern | TEXT | NULL | - | Padrão vencedor |
| tiebreaker_number | INT | NULL | - | Número da pedra (desempate) |
| starts_at | TIMESTAMPTZ | NOT NULL | - | Início da venda |
| selling_ends_at | TIMESTAMPTZ | NULL | - | Fim da venda (7 min após início) |
| ends_at | TIMESTAMPTZ | NOT NULL | - | Fim completo (10 min após início) |
| is_selling | BOOLEAN | NOT NULL | false | Se está em período de venda |
| drawing_started_at | TIMESTAMPTZ | NULL | - | Início do sorteio |
| finished_at | TIMESTAMPTZ | NULL | - | Data de finalização |
| establishment_id | INT | NULL | - | FK ’ establishments.id |
| manager_id | INT | NULL | - | FK ’ managers.id |
| charity_id | INT | NULL | - | FK ’ charities.id |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `establishment_id` REFERENCES `establishments(id)`
- `manager_id` REFERENCES `managers(id)`
- `charity_id` REFERENCES `charities(id)`

**Constraints**:
- CHECK(`type` IN ('regular', 'special'))
- CHECK(`status` IN ('scheduled', 'selling', 'drawing', 'finished', 'cancelled'))

---

### Tabela: `purchases`
**Descrição**: Compras de cartelas

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| round_id | INT | NOT NULL | - | FK ’ rounds.id |
| user_id | INT | NULL | - | FK ’ users.id (NULL para compras guest) |
| establishment_id | INT | NULL | - | FK ’ establishments.id |
| terminal_id | INT | NULL | - | FK ’ pos_terminals.id |
| quantity | INT | NOT NULL | - | Quantidade de cartelas |
| unit_price | DECIMAL(10,2) | NOT NULL | - | Preço unitário |
| total_amount | DECIMAL(10,2) | NOT NULL | - | Valor total |
| payment_method | TEXT | NOT NULL | - | Método: pix, credit_card, debit_card |
| payment_status | TEXT | NOT NULL | pending | Status: pending, paid, expired, cancelled, refunded |
| transaction_code | TEXT | NULL | - | Código da transação (TXN-XXXXXXXXXXXX) |
| gateway | TEXT | NULL | asaas | Gateway: asaas, pagseguro |
| gateway_transaction_id | TEXT | NULL | - | ID da transação no gateway |
| gateway_response | JSONB | NULL | - | Resposta completa do gateway |
| pix_code | TEXT | NULL | - | Código PIX copia e cola |
| pix_qrcode | TEXT | NULL | - | QR Code PIX (base64) |
| pix_expiration | TIMESTAMPTZ | NULL | - | Expiração do PIX (2 min) |
| pix_transaction_id | TEXT | NULL | - | ID da transação PIX (deprecated) |
| expires_at | TIMESTAMPTZ | NULL | - | Expiração geral |
| card_transaction_id | TEXT | NULL | - | ID da transação cartão |
| card_brand | TEXT | NULL | - | Bandeira do cartão |
| card_last_digits | TEXT | NULL | - | Últimos 4 dígitos |
| customer_whatsapp | TEXT | NULL | - | WhatsApp do cliente (deprecated) |
| customer_name | TEXT | NULL | - | Nome do cliente |
| customer_email | TEXT | NULL | - | Email do cliente |
| customer_phone | TEXT | NULL | - | Telefone do cliente |
| customer_cpf | TEXT | NULL | - | CPF do cliente |
| refunded_at | TIMESTAMPTZ | NULL | - | Data do reembolso |
| refund_reason | TEXT | NULL | - | Motivo do reembolso |
| paid_at | TIMESTAMPTZ | NULL | - | Data do pagamento |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `round_id` REFERENCES `rounds(id)`
- `user_id` REFERENCES `users(id)`
- `establishment_id` REFERENCES `establishments(id)`
- `terminal_id` REFERENCES `pos_terminals(id)`

**Constraints**:
- CHECK(`payment_method` IN ('pix', 'credit_card', 'debit_card'))
- CHECK(`payment_status` IN ('pending', 'paid', 'expired', 'cancelled', 'refunded'))

---

### Tabela: `cards`
**Descrição**: Cartelas de bingo geradas

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| code | TEXT | NOT NULL | - | Código único (SB-XXXXXXXX) |
| round_id | INT | NOT NULL | - | FK ’ rounds.id |
| purchase_id | INT | NULL | - | FK ’ purchases.id |
| user_id | INT | NULL | - | FK ’ users.id |
| numbers | INT[] | NOT NULL | - | 24 números da cartela (grid 5x5) |
| status | TEXT | NOT NULL | available | Status: available, sold |
| is_winner | BOOLEAN | NOT NULL | false | Se é vencedora |
| prize_amount | DECIMAL(12,2) | NULL | - | Valor do prêmio |
| declared_at | TIMESTAMPTZ | NULL | - | Data da declaração de vitória |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `round_id` REFERENCES `rounds(id)`
- `purchase_id` REFERENCES `purchases(id)`
- `user_id` REFERENCES `users(id)`

---

### Tabela: `draws`
**Descrição**: Números sorteados em cada rodada

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| round_id | INT | NOT NULL | - | FK ’ rounds.id |
| number | INT | NOT NULL | - | Número sorteado (1-75) |
| position | INT | NOT NULL | - | Posição no sorteio (1-75) |
| drawn_at | TIMESTAMPTZ | NOT NULL | NOW() | Data/hora do sorteio |

**Chaves Estrangeiras**:
- `round_id` REFERENCES `rounds(id)`

---

### Tabela: `winners`
**Descrição**: Vencedores de cada rodada

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| round_id | INT | NOT NULL | - | FK ’ rounds.id |
| card_id | INT | NOT NULL | - | FK ’ cards.id |
| card_code | TEXT | NULL | - | Código da cartela vencedora |
| prize_amount | DECIMAL(12,2) | NOT NULL | - | Valor do prêmio |
| pattern | TEXT | NULL | - | Padrão vencedor |
| pattern_matched | TEXT | NOT NULL | - | Padrão que combinou |
| tiebreaker_used | BOOLEAN | NOT NULL | false | Se usou desempate |
| tiebreaker_number | INT | NULL | - | Número do desempate |
| tiebreaker_difference | INT | NULL | - | Diferença no desempate |
| establishment_name | TEXT | NULL | - | Nome do estabelecimento |
| status | TEXT | NOT NULL | pending | Status: pending, claimed, paid, expired |
| pix_key | TEXT | NULL | - | Chave PIX para pagamento |
| claimed_at | TIMESTAMPTZ | NULL | - | Data da reivindicação |
| paid_at | TIMESTAMPTZ | NULL | - | Data do pagamento |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `round_id` REFERENCES `rounds(id)`
- `card_id` REFERENCES `cards(id)`

**Constraints**:
- CHECK(`status` IN ('pending', 'claimed', 'paid', 'expired'))

---

### Tabela: `commissions`
**Descrição**: Comissões de estabelecimentos e gerentes

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| purchase_id | INT | NOT NULL | - | FK ’ purchases.id |
| establishment_id | INT | NULL | - | FK ’ establishments.id |
| manager_id | INT | NULL | - | FK ’ managers.id |
| type | TEXT | NOT NULL | - | Tipo: establishment, manager |
| amount | DECIMAL(10,2) | NOT NULL | - | Valor da comissão |
| status | TEXT | NOT NULL | pending | Status: pending, paid |
| paid_at | TIMESTAMPTZ | NULL | - | Data do pagamento |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `purchase_id` REFERENCES `purchases(id)`
- `establishment_id` REFERENCES `establishments(id)`
- `manager_id` REFERENCES `managers(id)`

**Constraints**:
- CHECK(`type` IN ('establishment', 'manager'))
- CHECK(`status` IN ('pending', 'paid'))

---

### Tabela: `withdrawals`
**Descrição**: Solicitações de saque

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| user_id | INT | NOT NULL | - | FK ’ users.id |
| amount | DECIMAL(12,2) | NOT NULL | - | Valor do saque |
| pix_key | TEXT | NOT NULL | - | Chave PIX |
| status | TEXT | NOT NULL | pending | Status: pending, processing, paid, failed |
| processed_at | TIMESTAMPTZ | NULL | - | Data do processamento |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `user_id` REFERENCES `users(id)`

**Constraints**:
- CHECK(`status` IN ('pending', 'processing', 'paid', 'failed'))

---

### Tabela: `whatsapp_config`
**Descrição**: Configuração do WhatsApp (deprecated - usar settings)

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| api_url | TEXT | NULL | - | URL da API |
| api_key | TEXT | NULL | - | Chave da API |
| sender_number | TEXT | NULL | - | Número remetente |
| message_template | TEXT | NULL | - | Template da mensagem |
| is_active | BOOLEAN | NOT NULL | false | Ativo/inativo |
| updated_at | TIMESTAMPTZ | NOT NULL | NOW() | Última atualização |

---

### Tabela: `whatsapp_logs`
**Descrição**: Logs de envio de WhatsApp

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| phone | TEXT | NOT NULL | - | Telefone destino |
| card_codes | TEXT[] | NOT NULL | - | Códigos das cartelas |
| status | TEXT | NOT NULL | - | Status: sent, delivered, failed |
| error_message | TEXT | NULL | - | Mensagem de erro |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Constraints**:
- CHECK(`status` IN ('sent', 'delivered', 'failed'))

---

### Tabela: `audit_logs`
**Descrição**: Logs de auditoria do sistema

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| user_id | INT | NULL | - | FK ’ users.id |
| action | TEXT | NOT NULL | - | Ação: create, update, delete, etc |
| entity | TEXT | NOT NULL | - | Entidade afetada |
| entity_id | INT | NULL | - | ID da entidade |
| old_data | JSONB | NULL | - | Dados antigos |
| new_data | JSONB | NULL | - | Dados novos |
| ip_address | TEXT | NULL | - | IP do usuário |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |

**Chaves Estrangeiras**:
- `user_id` REFERENCES `users(id)`

---

### Tabela: `settings`
**Descrição**: Configurações dinâmicas do sistema (JSONB)

| Coluna | Tipo | Nullable | Default | Descrição |
|--------|------|----------|---------|-----------|
| id | SERIAL | NOT NULL | - | Chave primária |
| key | TEXT | NOT NULL | - | Chave (única) |
| value | JSONB | NOT NULL | - | Valor (JSON) |
| created_at | TIMESTAMPTZ | NOT NULL | NOW() | Data de criação |
| updated_at | TIMESTAMPTZ | NOT NULL | NOW() | Última atualização |

**Configurações Importantes**:
- `gateway_config`: Configuração dos gateways (Asaas, PagSeguro)
- `whatsapp_config`: Configuração do WhatsApp
- `round_config`: Configuração das rodadas
- `draw_config`: Configuração do sorteio
- `split_config`: Divisão de valores (40% prêmio, 20% caridade, 30% plataforma, 10% comissão)
- `card_appearance`: Aparência das cartelas
- `tv_config`: Configuração do modo TV
- `voice_config`: Configuração de voz (futuro)
- `pos_config`: Configuração dos terminais POS

---

## 2. API Endpoints

### 2.1 Autenticação

#### POST `/auth/register`
**Descrição**: Registrar novo usuário
**Autenticação**: Não
**Body**:
```json
{
  "name": "João Silva",
  "email": "joao@example.com",
  "whatsapp": "11999999999",
  "password": "senha123"
}
```
**Resposta**:
```json
{
  "success": true,
  "data": {
    "user": { "id": 1, "name": "João Silva", "email": "joao@example.com", "role": "user" },
    "token": "eyJhbGc..."
  }
}
```

#### POST `/auth/login`
**Descrição**: Login
**Autenticação**: Não
**Body**:
```json
{
  "email": "joao@example.com",
  "password": "senha123"
}
```
**Resposta**: (mesma do register)

---

### 2.2 Usuários (`/users`)

#### GET `/users`
**Descrição**: Listar todos os usuários
**Autenticação**: Admin
**Resposta**:
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "João Silva", "email": "joao@example.com", "role": "user", "is_active": true }
  ]
}
```

#### GET `/users/:id`
**Descrição**: Buscar usuário por ID
**Autenticação**: Admin

#### PUT `/users/:id`
**Descrição**: Atualizar usuário
**Autenticação**: Admin
**Body**:
```json
{
  "name": "João Silva Jr",
  "email": "joao.jr@example.com",
  "role": "manager",
  "is_active": true,
  "password": "novasenha" // opcional
}
```

#### DELETE `/users/:id`
**Descrição**: Desativar usuário (soft delete)
**Autenticação**: Admin

#### GET `/users/me`
**Descrição**: Buscar dados do usuário logado
**Autenticação**: Usuário

#### PUT `/users/me`
**Descrição**: Atualizar próprio perfil
**Autenticação**: Usuário

---

### 2.3 Gerentes (`/managers`)

#### GET `/managers`
**Descrição**: Listar gerentes
**Autenticação**: Admin

#### GET `/managers/:id`
**Descrição**: Buscar gerente por ID
**Autenticação**: Admin

#### POST `/managers`
**Descrição**: Criar gerente
**Autenticação**: Admin
**Body**:
```json
{
  "name": "Maria Santos",
  "email": "maria@example.com",
  "whatsapp": "11988888888",
  "password": "senha123",
  "cpf": "12345678901",
  "commission_rate": 3.00
}
```

#### GET `/managers/:id/establishments`
**Descrição**: Listar estabelecimentos de um gerente
**Autenticação**: Admin

#### PUT `/managers/:id/kyc`
**Descrição**: Atualizar status KYC
**Autenticação**: Admin
**Body**:
```json
{
  "kyc_status": "approved"
}
```

---

### 2.4 Estabelecimentos (`/establishments`)

#### GET `/establishments`
**Descrição**: Listar estabelecimentos
**Autenticação**: Admin

#### POST `/establishments`
**Descrição**: Criar estabelecimento
**Autenticação**: Admin
**Body**:
```json
{
  "name": "João Silva",
  "email": "joao@bar.com",
  "whatsapp": "11977777777",
  "password": "senha123",
  "establishment_name": "Bar do João",
  "cnpj": "12345678000190",
  "phone": "1133334444",
  "address": "Rua A, 123",
  "city": "São Paulo",
  "state": "SP",
  "manager_id": 1
}
```

#### GET `/establishments/by-slug/:slug`
**Descrição**: Buscar estabelecimento por slug (para modo TV)
**Autenticação**: Público

---

### 2.5 Instituições (`/charities`)

#### GET `/charities`
**Descrição**: Listar instituições
**Autenticação**: Admin

#### GET `/charities/active`
**Descrição**: Buscar instituição ativa do mês
**Autenticação**: Público

#### POST `/charities`
**Descrição**: Criar instituição
**Autenticação**: Admin
**Body**:
```json
{
  "name": "Instituto ABC",
  "description": "Ajuda crianças",
  "logo_url": "https://...",
  "pix_key": "12345678901"
}
```

#### PUT `/charities/:id`
**Descrição**: Atualizar instituição
**Autenticação**: Admin

#### POST `/charities/:id/activate`
**Descrição**: Ativar instituição para um mês específico
**Autenticação**: Admin
**Body**:
```json
{
  "month": 12,
  "year": 2025
}
```

---

### 2.6 Terminais POS (`/pos`)

#### POST `/pos/terminals`
**Descrição**: Criar terminal POS
**Autenticação**: Establishment
**Body**:
```json
{
  "establishment_id": 1,
  "name": "Terminal 1"
}
```
**Resposta**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "terminal_id": "POS-ABC12345",
    "api_key": "sk_live_xyz..." // retornado apenas na criação
  }
}
```

#### POST `/pos/auth`
**Descrição**: Autenticar terminal
**Autenticação**: Não
**Body**:
```json
{
  "terminal_id": "POS-ABC12345",
  "api_key": "sk_live_xyz..."
}
```

#### GET `/pos/round/current`
**Descrição**: Buscar rodada atual
**Autenticação**: POS

#### POST `/pos/sale`
**Descrição**: Criar venda no POS
**Autenticação**: POS
**Body**:
```json
{
  "round_id": 1,
  "quantity": 2,
  "payment_method": "credit_card"
}
```

---

### 2.7 Rodadas (`/rounds`)

#### GET `/rounds`
**Descrição**: Listar rodadas ativas e próximas
**Autenticação**: Público

#### GET `/rounds/current`
**Descrição**: Buscar rodada atual em venda
**Autenticação**: Público

#### GET `/rounds/live`
**Descrição**: Buscar rodada ao vivo (em sorteio)
**Autenticação**: Público

#### GET `/rounds/:id`
**Descrição**: Buscar rodada por ID
**Autenticação**: Público

#### GET `/rounds/:id/numbers`
**Descrição**: Buscar números sorteados
**Autenticação**: Público

#### GET `/rounds/:id/cards`
**Descrição**: Listar cartelas da rodada
**Autenticação**: Admin
**Query Params**: `page`, `limit`

#### GET `/rounds/history`
**Descrição**: Histórico de rodadas finalizadas
**Autenticação**: Público
**Query Params**: `page`, `limit`

#### POST `/rounds`
**Descrição**: Criar rodada manualmente
**Autenticação**: Admin
**Body**:
```json
{
  "type": "regular"
}
```

#### POST `/rounds/:id/start-drawing`
**Descrição**: Iniciar sorteio manualmente
**Autenticação**: Admin

#### POST `/rounds/:id/draw-number`
**Descrição**: Sortear próximo número
**Autenticação**: Admin

#### POST `/rounds/:id/finish`
**Descrição**: Finalizar rodada
**Autenticação**: Admin

#### POST `/rounds/:id/cancel`
**Descrição**: Cancelar rodada e reembolsar
**Autenticação**: Admin

---

### 2.8 Compras (`/purchases`)

#### POST `/purchases`
**Descrição**: Criar compra (PIX ou cartão)
**Autenticação**: Público
**Body (PIX)**:
```json
{
  "round_id": 1,
  "quantity": 2,
  "payment_method": "pix",
  "customer": {
    "name": "João Silva",
    "email": "joao@example.com",
    "phone": "11999999999",
    "cpf": "12345678901"
  }
}
```
**Body (Cartão)**:
```json
{
  "round_id": 1,
  "quantity": 2,
  "payment_method": "credit_card",
  "customer": { ... },
  "card_token": "encrypted_token_from_frontend",
  "installments": 3,
  "card_holder": {
    "name": "JOAO SILVA"
  }
}
```
**Resposta (PIX)**:
```json
{
  "success": true,
  "data": {
    "purchase_id": 123,
    "round_id": 1,
    "quantity": 2,
    "total_amount": 10.00,
    "payment_method": "pix",
    "payment_data": {
      "transactionCode": "TXN-ABC123456789",
      "gateway": "asaas",
      "pixCopyPaste": "00020126...",
      "pixQrCode": "data:image/png;base64,...",
      "expiresAt": "2025-12-28T18:15:00Z"
    },
    "cards": [
      { "code": "SB-ABC12345" },
      { "code": "SB-XYZ67890" }
    ]
  }
}
```

#### GET `/purchases/:id`
**Descrição**: Buscar compra por ID
**Autenticação**: Público

#### GET `/purchases/:id/status`
**Descrição**: Verificar status do pagamento
**Autenticação**: Público

#### GET `/purchases/:id/cards`
**Descrição**: Listar cartelas da compra
**Autenticação**: Público (apenas se pago)

#### POST `/purchases/:id/cancel`
**Descrição**: Cancelar compra pendente
**Autenticação**: Público

#### POST `/purchases/:id/refund`
**Descrição**: Reembolsar compra
**Autenticação**: Admin
**Body**:
```json
{
  "reason": "Erro no sistema"
}
```

#### POST `/purchases/webhook/:gateway`
**Descrição**: Receber webhook de pagamento
**Autenticação**: Não (validado por token)
**Params**: `gateway` = asaas | pagseguro

---

### 2.9 Cartelas (`/cards`)

#### GET `/cards/:code`
**Descrição**: Buscar cartela por código
**Autenticação**: Público

#### GET `/cards/:code/check`
**Descrição**: Verificar se cartela ganhou
**Autenticação**: Público

#### POST `/cards/:code/declare-victory`
**Descrição**: Declarar vitória
**Autenticação**: Público

---

### 2.10 Prêmios (`/prizes`)

#### GET `/prizes/check/:cardCode`
**Descrição**: Verificar se cartela tem prêmio
**Autenticação**: Público

#### POST `/prizes/claim`
**Descrição**: Reivindicar prêmio
**Autenticação**: Público
**Body**:
```json
{
  "card_code": "SB-ABC12345",
  "pix_key": "12345678901"
}
```

#### GET `/prizes/history`
**Descrição**: Histórico de prêmios
**Autenticação**: Admin

---

### 2.11 Saques (`/withdrawals`)

#### POST `/withdrawals`
**Descrição**: Solicitar saque
**Autenticação**: Usuário
**Body**:
```json
{
  "amount": 100.00,
  "pix_key": "12345678901"
}
```

#### GET `/withdrawals`
**Descrição**: Listar saques
**Autenticação**: Admin

#### PUT `/withdrawals/:id/process`
**Descrição**: Processar saque
**Autenticação**: Admin
**Body**:
```json
{
  "status": "paid"
}
```

---

### 2.12 Configurações (`/settings`)

#### GET `/settings`
**Descrição**: Listar todas as configurações
**Autenticação**: Admin

#### GET `/settings/public`
**Descrição**: Configurações públicas
**Autenticação**: Público

#### GET `/settings/:key`
**Descrição**: Buscar configuração por chave
**Autenticação**: Admin

#### PUT `/settings/:key`
**Descrição**: Atualizar configuração
**Autenticação**: Admin
**Body**:
```json
{
  "value": { ... }
}
```

#### PUT `/settings`
**Descrição**: Atualizar múltiplas configurações
**Autenticação**: Admin
**Body**:
```json
{
  "gateway_config": { ... },
  "round_config": { ... }
}
```

#### POST `/settings/gateway/test`
**Descrição**: Testar gateway de pagamento
**Autenticação**: Admin
**Body**:
```json
{
  "gateway": "asaas"
}
```

---

### 2.13 WhatsApp (`/whatsapp`)

#### GET `/whatsapp/config`
**Descrição**: Buscar configuração
**Autenticação**: Admin

#### PUT `/whatsapp/config`
**Descrição**: Atualizar configuração
**Autenticação**: Admin

#### POST `/whatsapp/test`
**Descrição**: Testar envio
**Autenticação**: Admin
**Body**:
```json
{
  "phone": "11999999999"
}
```

#### GET `/whatsapp/logs`
**Descrição**: Listar logs
**Autenticação**: Admin

---

### 2.14 Estatísticas (`/stats`)

#### GET `/stats/admin`
**Descrição**: Estatísticas gerais
**Autenticação**: Admin

#### GET `/stats/tv`
**Descrição**: Dados para modo TV
**Autenticação**: Público
**Resposta**:
```json
{
  "success": true,
  "data": {
    "current_round": { ... },
    "drawn_numbers": [12, 45, 67, ...],
    "recent_winners": [ ... ],
    "total_charity": 1234.56
  }
}
```

#### GET `/stats/round/:id`
**Descrição**: Estatísticas de uma rodada
**Autenticação**: Público

#### GET `/stats/dashboard`
**Descrição**: Dashboard completo
**Autenticação**: Admin

---

### 2.15 Logs (`/logs`)

#### GET `/logs`
**Descrição**: Listar logs de auditoria
**Autenticação**: Admin
**Query Params**: `page`, `limit`, `entity`, `action`, `user_id`

---

## 3. Serviços

### 3.1 asaasService.js
**Descrição**: Integração com gateway Asaas (PIX)

#### Funções Exportadas:

**`createPixCharge(params)`**
- Cria cobrança PIX no Asaas
- Params: `{ customer, value, description, expirationMinutes }`
- Retorna: `{ id, status, value, pixCopyPaste, pixQrCode, expiresAt }`

**`checkPaymentStatus(chargeId)`**
- Verifica status do pagamento
- Retorna: `{ id, status, value, confirmedDate }`

**`refundPayment(chargeId, value, description)`**
- Reembolsa pagamento
- Retorna: `{ id, status, value, refundedDate }`

**`getOrCreateCustomer(customerData)`**
- Busca ou cria cliente no Asaas
- Params: `{ cpfCnpj, name, email, phone }`
- Retorna: ID do cliente

**`handleWebhook(webhookData)`**
- Processa webhook do Asaas
- Retorna: dados processados

**`testAsaasConfig()`**
- Testa configuração
- Retorna: boolean

---

### 3.2 pagseguroService.js
**Descrição**: Integração com PagSeguro (PIX e Cartão)

#### Funções Exportadas:

**`createPixCharge(params)`**
- Cria cobrança PIX
- Similar ao Asaas

**`createCreditCardCharge(params)`**
- Cria cobrança com cartão
- Params: `{ customer, value, description, cardToken, installments, holder }`
- Retorna: `{ id, status, value, installments }`

**`checkPaymentStatus(orderId)`**
- Verifica status

**`refundPayment(chargeId, value)`**
- Reembolsa

**`calculateInstallments(amount, maxInstallments)`**
- Calcula parcelas disponíveis
- Retorna: array de opções de parcelamento

**`handleWebhook(webhookData)`**
- Processa webhook

**`testPagSeguroConfig()`**
- Testa configuração

---

### 3.3 paymentService.js
**Descrição**: Orquestrador unificado de pagamentos

#### Funções Exportadas:

**`createPixPayment(params)`**
- Cria pagamento PIX (roteia para gateway correto)
- Params: `{ purchase, customer }`
- Retorna: dados do pagamento

**`createCreditCardPayment(params)`**
- Cria pagamento com cartão
- Params: `{ purchase, customer, cardToken, installments, holder }`

**`checkPaymentStatus(purchaseId)`**
- Verifica status de uma compra
- Atualiza automaticamente no banco

**`refundPayment(purchaseId, reason)`**
- Reembolsa compra
- Libera cartelas

**`handlePaymentWebhook(gateway, webhookData)`**
- Processa webhooks
- Atualiza status automaticamente
- Dispara processamento pós-pagamento

---

### 3.4 whatsappService.js
**Descrição**: Envio de mensagens WhatsApp

#### Funções Exportadas:

**`sendPurchaseCards(purchaseId)`**
- Envia cartelas de uma compra
- Busca dados automaticamente
- Retorna: resultado do envio

**`sendCardsViaWhatsApp(phone, cardCodes, roundInfo)`**
- Envia cartelas para um número
- Usa template configurável

**`sendWinnerNotification(phone, cardCode, prizeAmount)`**
- Notifica vencedor

**`testWhatsAppConfig(testPhone)`**
- Testa configuração

---

### 3.5 roundManager.js
**Descrição**: Gerenciamento de rodadas

#### Funções Exportadas:

**`createNextRound(type)`**
- Cria próxima rodada
- Type: 'regular' | 'special'
- Calcula timing automático (7min venda + 3min fechado)

**`startRoundSelling(roundId)`**
- Inicia venda (is_selling = true)

**`closeRoundSelling(roundId)`**
- Fecha venda (is_selling = false)

**`startRoundDrawing(roundId)`**
- Inicia sorteio

**`drawNextNumber(roundId)`**
- Sorteia próximo número
- Publica no Redis

**`finishRound(roundId)`**
- Finaliza rodada

**`cancelRound(roundId)`**
- Cancela e reembolsa

**`checkAndCreateRounds()`**
- Verifica e cria rodadas automaticamente

**`updateRoundsStatus()`**
- Atualiza status baseado no horário
- Usado pelo cron

---

### 3.6 cardGenerator.js
**Descrição**: Geração de cartelas

#### Funções Exportadas:

**`generateCard(roundId, purchaseId)`**
- Gera uma cartela
- Grid 5x5 com números únicos
- Retorna: `{ id, code, numbers, grid }`

**`generateCards(roundId, purchaseId, userId, quantity, client)`**
- Gera múltiplas cartelas
- Retorna: array de cartelas

**`getCardByCode(code)`**
- Busca cartela por código
- Retorna com grid formatado

**`convertToGrid(numbers)`**
- Converte array em grid 5x5
- Retorna: `{ S: [...], O: [...], R: [...], T: [...], E: [...] }`

---

### 3.7 winChecker.js
**Descrição**: Verificação de vitórias

#### Funções Exportadas:

**`checkWin(cardNumbers, drawnNumbers, patterns)`**
- Verifica se cartela ganhou
- Params: números da cartela, números sorteados, padrões ativos
- Retorna: `{ won: boolean, pattern: string }`

---

## 4. Fluxos Principais

### 4.1 Fluxo: Criar Gerente

```
1. Admin chama POST /managers
   “
2. Sistema cria user (role='manager')
   “
3. Sistema gera código único (MGR-XXXX)
   “
4. Sistema cria manager vinculado ao user
   “
5. Retorna dados completos
```

**Tabelas Afetadas**: `users`, `managers`

---

### 4.2 Fluxo: Criar Estabelecimento

```
1. Admin chama POST /establishments
   “
2. Sistema cria user (role='establishment')
   “
3. Sistema gera código (EST-XXXX) e slug
   “
4. Sistema cria establishment vinculado ao user e manager
   “
5. Retorna dados completos
```

**Tabelas Afetadas**: `users`, `establishments`

---

### 4.3 Fluxo: Compra PIX

```
1. Cliente chama POST /purchases (payment_method='pix')
   “
2. Sistema verifica rodada (status='selling' AND is_selling=true)
   “
3. Sistema cria/busca user (se tiver email)
   “
4. Sistema cria purchase (status='pending')
   “
5. Sistema gera cartelas
   “
6. Sistema atualiza contador de vendas
   “
7. Sistema chama paymentService.createPixPayment()
   “
8. paymentService escolhe gateway (default: Asaas)
   “
9. asaasService.createPixCharge()
   “
10. Asaas retorna PIX (QR Code + copia-cola)
   “
11. Sistema atualiza purchase com dados do PIX
   “
12. Retorna QR Code para cliente
   “
13. Cliente paga PIX
   “
14. Asaas envia webhook ’ POST /purchases/webhook/asaas
   “
15. paymentService.handlePaymentWebhook()
   “
16. Sistema atualiza purchase (status='paid')
   “
17. Sistema chama processSuccessfulPayment()
   “
18. Sistema calcula split:
    - 40% prêmio
    - 20% caridade
    - 30% plataforma
    - 10% comissões (7% estabelecimento + 3% gerente)
   “
19. Sistema atualiza saldos
   “
20. Sistema marca cartelas como vendidas
   “
21. Sistema envia cartelas por WhatsApp
```

**Tabelas Afetadas**: `users`, `purchases`, `cards`, `rounds`, `establishments`, `managers`, `charities`

---

### 4.4 Fluxo: Compra Cartão de Crédito

```
1. Frontend tokeniza cartão com PagSeguro.js
   “
2. Cliente chama POST /purchases (payment_method='credit_card', card_token=...)
   “
3. Sistema cria purchase
   “
4. Sistema gera cartelas
   “
5. paymentService.createCreditCardPayment()
   “
6. pagseguroService.createCreditCardCharge()
   “
7. PagSeguro processa (instantâneo)
   “
8. Se aprovado ’ processSuccessfulPayment()
   “
9. Envia cartelas por WhatsApp
```

---

### 4.5 Fluxo: Sorteio

```
1. Cron job executa updateRoundsStatus() a cada 1 minuto
   “
2. Sistema verifica:
   - Se starts_at <= NOW ’ status='selling', is_selling=true
   - Se selling_ends_at <= NOW ’ is_selling=false
   - Se ends_at <= NOW ’ status='drawing'
   “
3. Admin ou cron chama drawNextNumber(roundId)
   “
4. Sistema sorteia número aleatório (1-75) não sorteado
   “
5. Sistema registra em draws
   “
6. Sistema atualiza rounds.drawn_numbers
   “
7. Sistema publica no Redis
   “
8. Frontend recebe via WebSocket/SSE
   “
9. Usuário com cartela vencedora chama POST /cards/:code/declare-victory
   “
10. Sistema verifica padrão vencedor
   “
11. Sistema marca cartela como vencedora
   “
12. Sistema registra em winners
   “
13. Sistema finaliza rodada
   “
14. Sistema envia notificação de vitória por WhatsApp
```

**Tabelas Afetadas**: `rounds`, `draws`, `cards`, `winners`

---

### 4.6 Fluxo: Ciclo Completo de uma Rodada

```
T=0min: Rodada criada (status='scheduled')
   “
T=0min: Cron muda para status='selling', is_selling=true
   “
T=0-7min: Vendas abertas
   “
T=7min: Cron muda is_selling=false (3 min de espera)
   “
T=10min: Cron muda para status='drawing'
   “
T=10min+: Sorteio automático (1 número a cada 10s)
   “
Alguém ganha OU 75 números sorteados
   “
Rodada finalizada (status='finished')
```

---

## 5. Configurações

### 5.1 Configurações do Sistema (tabela `settings`)

#### `gateway_config`
```json
{
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
}
```

#### `whatsapp_config`
```json
{
  "enabled": false,
  "api_url": "https://...",
  "api_key": "",
  "sender_number": "",
  "message_template": "..."
}
```

#### `round_config`
```json
{
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
}
```

#### `split_config`
```json
{
  "prize_pool_percent": 40,
  "charity_percent": 20,
  "platform_percent": 30,
  "commission_percent": 10,
  "establishment_commission_percent": 7,
  "manager_commission_percent": 3
}
```

#### `draw_config`
```json
{
  "number_min": 1,
  "number_max": 75,
  "draw_interval_seconds": 5,
  "winning_patterns": ["line_horizontal", "line_vertical", "diagonal", "full_card"],
  "tiebreaker_method": "pedra"
}
```

---

## 6. Variáveis de Ambiente

### Obrigatórias

```bash
# Banco de Dados
DATABASE_URL=postgresql://user:password@localhost:5432/sortebem

# JWT
JWT_SECRET=seu_secret_super_secreto

# Servidor
PORT=3000
NODE_ENV=production
```

### Opcionais

```bash
# Redis (para pub/sub)
REDIS_URL=redis://localhost:6379

# CORS
CORS_ORIGIN=https://sortebem.com.br

# Asaas (configurar via /settings)
# PagSeguro (configurar via /settings)
# WhatsApp (configurar via /settings)
```

---

## 7. Cron Jobs

### Executados Automaticamente

| Intervalo | Função | Descrição |
|-----------|--------|-----------|
| 1 minuto | `updateRoundsStatus()` | Atualiza status das rodadas |
| 1 minuto | `checkAndCreateRounds()` | Cria rodadas se necessário |
| 30 segundos | `checkPendingPayments()` | Verifica pagamentos pendentes |
| 2 minutos | `expireOldPurchases()` | Expira PIX não pagos |
| 10 segundos | `autoDrawNumbers()` | Sorteia números automaticamente |
| Diária 2AM | `cleanupOldData()` | Limpa logs antigos |

---

## 8. Códigos e Formatos

### Códigos Gerados

- **Cartelas**: `SB-XXXXXXXX` (8 caracteres alfanuméricos)
- **Transações**: `TXN-XXXXXXXXXXXX` (12 caracteres alfanuméricos)
- **Gerentes**: `MGR-XXXX` (4 caracteres alfanuméricos)
- **Estabelecimentos**: `EST-XXXX` (4 caracteres alfanuméricos)
- **Terminais POS**: `POS-XXXXXXXX` (8 caracteres alfanuméricos)

### Alfabeto usado: `123456789ABCDEFGHJKLMNPQRSTUVWXYZ` (sem 0, O, I)

---

## 9. Segurança

### Autenticação

- **JWT** em header `Authorization: Bearer <token>`
- Roles: `admin`, `manager`, `establishment`, `user`

### Middlewares

- `authRequired`: Usuário logado
- `authAdmin`: Apenas admin
- `authEstablishment`: Establishment ou admin
- `authManager`: Manager ou admin
- `authPOS`: Terminal POS autenticado

### Auditoria

Todas as ações importantes são logadas em `audit_logs`:
- user_id
- action (create, update, delete)
- entity
- old_data / new_data (JSONB)
- ip_address

---

## 10. Performance

### Índices Criados

```sql
-- Rounds
idx_rounds_status ON rounds(status)
idx_rounds_starts_at ON rounds(starts_at)
idx_rounds_is_selling ON rounds(is_selling)
idx_rounds_selling_ends_at ON rounds(selling_ends_at)

-- Cards
idx_cards_round_id ON cards(round_id)
idx_cards_code ON cards(code)

-- Purchases
idx_purchases_round_id ON purchases(round_id)
idx_purchases_status ON purchases(payment_status)
idx_purchases_transaction_code ON purchases(transaction_code)
idx_purchases_gateway_transaction_id ON purchases(gateway_transaction_id)

-- Draws
idx_draws_round_id ON draws(round_id)

-- Winners
idx_winners_round_id ON winners(round_id)

-- Commissions
idx_commissions_establishment_id ON commissions(establishment_id)
idx_commissions_manager_id ON commissions(manager_id)

-- Audit
idx_audit_logs_user_id ON audit_logs(user_id)
idx_audit_logs_entity ON audit_logs(entity, entity_id)
```

---

## 11. Observações Importantes

### LEFT JOIN vs JOIN

**Todas as queries usam LEFT JOIN** para evitar erros quando:
- Manager sem user_id
- Establishment sem user_id
- Purchase sem user_id (compras guest)
- Cards sem purchase_id
- Etc.

### COALESCE

Usado para garantir valores default:
```sql
COALESCE(u.name, p.customer_name, '') as name
COALESCE(u.email, p.customer_email, '') as email
```

### Transações

Operações críticas usam transações:
- Criar gerente (user + manager)
- Criar estabelecimento (user + establishment)
- Processar pagamento (purchase + cards + saldos)
- Cancelar rodada (rounds + purchases)

---

## 12. Frontend Integration

### Tokenização de Cartão (PagSeguro)

```javascript
// No frontend
const card = PagSeguro.encryptCard({
  publicKey: 'SUA_PUBLIC_KEY',
  holder: cardHolder,
  number: cardNumber,
  expMonth: expMonth,
  expYear: expYear,
  securityCode: cvv
});

// Enviar card.encryptedCard para backend
fetch('/purchases', {
  method: 'POST',
  body: JSON.stringify({
    ...purchaseData,
    card_token: card.encryptedCard
  })
});
```

### WebSocket/SSE para Sorteio

```javascript
// Conectar ao Redis pub/sub via WebSocket
const ws = new WebSocket('ws://api.sortebem.com.br/live');

ws.on('message', (data) => {
  const { event, number, position } = JSON.parse(data);

  if (event === 'number_drawn') {
    // Atualizar UI com novo número
  }
});
```

---

## 13. Deployment

### Passos

1. **Configurar PostgreSQL**
2. **Executar migrations**:
   ```bash
   psql $DATABASE_URL < migrations/001_initial.sql
   psql $DATABASE_URL < migrations/002_complete_backend.sql
   ```
3. **Instalar dependências**:
   ```bash
   npm install
   ```
4. **Configurar variáveis de ambiente**
5. **Configurar gateways via `/settings`**
6. **Configurar WhatsApp via `/settings`**
7. **Criar usuário admin**
8. **Iniciar servidor**:
   ```bash
   npm start
   ```
9. **Configurar webhooks nos gateways**:
   - Asaas: `https://api.sortebem.com.br/purchases/webhook/asaas`
   - PagSeguro: `https://api.sortebem.com.br/purchases/webhook/pagseguro`

---

**Última atualização**: 2025-12-28
**Versão do Backend**: 2.0.0
