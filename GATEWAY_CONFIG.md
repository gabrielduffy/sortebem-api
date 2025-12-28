# Configuração de Gateway de Pagamento

## 🔑 Variáveis de Ambiente

Configure a variável `NODE_ENV` no seu servidor:

```bash
# Desenvolvimento (usa PIX mock se gateway não configurado)
NODE_ENV=development

# Produção (requer gateway configurado)
NODE_ENV=production
```

## 📋 Modo Desenvolvimento

Quando `NODE_ENV` não é `production` E o gateway não está configurado:

- ✅ PIX é gerado automaticamente em modo MOCK
- ✅ Frontend pode testar compras sem configurar Asaas/PagSeguro
- ⚠️ Pagamentos não são reais
- ⚠️ Cartão de crédito sempre requer configuração real

### Exemplo de resposta PIX mock:

```json
{
  "ok": true,
  "data": {
    "id": "mock-purchase-id",
    "pix": {
      "code": "00020126580014br.gov.bcb.pix...",
      "qrcode": "data:image/png;base64,..."
    }
  }
}
```

## 🚀 Modo Produção

Para aceitar pagamentos reais, você precisa configurar pelo menos um gateway:

### Opção 1: Asaas (PIX)

1. Crie conta no [Asaas](https://www.asaas.com/)
2. Obtenha sua API Key em: Configurações > Integrações > API Key
3. Configure no banco de dados:

```sql
-- Inserir ou atualizar configuração do Asaas
INSERT INTO settings (key, value, updated_at)
VALUES (
  'gateway_config',
  '{
    "active_gateway": "asaas",
    "asaas": {
      "api_key": "SUA_API_KEY_AQUI",
      "sandbox": false
    }
  }'::jsonb,
  NOW()
)
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
```

### Opção 2: PagSeguro (PIX + Cartão)

1. Crie conta no [PagSeguro](https://pagseguro.uol.com.br/)
2. Obtenha seu token em: Integrações > Token de Produção
3. Configure no banco de dados:

```sql
-- Inserir ou atualizar configuração do PagSeguro
INSERT INTO settings (key, value, updated_at)
VALUES (
  'gateway_config',
  '{
    "active_gateway": "pagseguro",
    "pagseguro": {
      "token": "SEU_TOKEN_AQUI",
      "sandbox": false
    }
  }'::jsonb,
  NOW()
)
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
```

### Opção 3: Ambos (Asaas para PIX + PagSeguro para Cartão)

```sql
INSERT INTO settings (key, value, updated_at)
VALUES (
  'gateway_config',
  '{
    "active_gateway": "asaas",
    "asaas": {
      "api_key": "SUA_API_KEY_ASAAS",
      "sandbox": false
    },
    "pagseguro": {
      "token": "SEU_TOKEN_PAGSEGURO",
      "sandbox": false
    }
  }'::jsonb,
  NOW()
)
ON CONFLICT (key)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();
```

## 🧪 Ambiente Sandbox (Testes)

Para testar com gateways reais em sandbox:

```sql
-- Asaas Sandbox
INSERT INTO settings (key, value, updated_at)
VALUES (
  'gateway_config',
  '{
    "active_gateway": "asaas",
    "asaas": {
      "api_key": "SUA_API_KEY_SANDBOX",
      "sandbox": true
    }
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- PagSeguro Sandbox
INSERT INTO settings (key, value, updated_at)
VALUES (
  'gateway_config',
  '{
    "active_gateway": "pagseguro",
    "pagseguro": {
      "token": "SEU_TOKEN_SANDBOX",
      "sandbox": true
    }
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

## ✅ Testar Configuração

Use o endpoint de teste:

```bash
POST /settings/gateway/test
Content-Type: application/json
Authorization: Bearer {admin_token}

{
  "gateway": "asaas"  # ou "pagseguro"
}
```

Resposta de sucesso:
```json
{
  "ok": true,
  "data": {
    "gateway": "asaas",
    "configured": true,
    "connection": "ok"
  }
}
```

## 📊 Status da Configuração

Os logs mostrarão o status:

```
🔑 Status de configuração: {
  gatewayConfigured: true,
  isDevelopment: false,
  NODE_ENV: 'production'
}
```

## 🔴 Erros Comuns

### Erro: "Gateway de pagamento não configurado"

**Solução em desenvolvimento:**
- Sistema usa PIX mock automaticamente
- Nenhuma ação necessária para testar frontend

**Solução em produção:**
- Configure pelo menos um gateway (Asaas ou PagSeguro)
- Execute o SQL de configuração acima
- Reinicie o servidor

### Erro: "Configuração do Asaas não encontrada"

**Causa:** Campo `api_key` está vazio ou ausente

**Solução:**
```sql
UPDATE settings
SET value = jsonb_set(
  value,
  '{asaas,api_key}',
  '"SUA_API_KEY_AQUI"'
)
WHERE key = 'gateway_config';
```

### Erro: "Configuração do PagSeguro não encontrada"

**Causa:** Campo `token` está vazio ou ausente

**Solução:**
```sql
UPDATE settings
SET value = jsonb_set(
  value,
  '{pagseguro,token}',
  '"SEU_TOKEN_AQUI"'
)
WHERE key = 'gateway_config';
```

## 🎯 Roteamento de Pagamentos

O sistema roteia automaticamente:

- **PIX**: Usa gateway configurado em `active_gateway` (default: asaas)
- **Cartão de Crédito**: Sempre usa PagSeguro

Para alterar o gateway padrão de PIX:

```sql
UPDATE settings
SET value = jsonb_set(
  value,
  '{active_gateway}',
  '"pagseguro"'  -- ou "asaas"
)
WHERE key = 'gateway_config';
```

## 🔒 Segurança

⚠️ **IMPORTANTE:**

- Nunca commite API Keys ou Tokens no código
- Use sempre variáveis de ambiente ou banco de dados
- Em produção, use HTTPS para todas as requisições
- Mantenha suas credenciais seguras
- Rotacione tokens periodicamente

## 📞 Suporte

- **Asaas:** https://ajuda.asaas.com/
- **PagSeguro:** https://dev.pagseguro.uol.com.br/

---

Última atualização: 2025-12-28
