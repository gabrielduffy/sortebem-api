# 🚀 Quick Start - SorteBem API

## Sistema 100% Funcional ✅

Todas as correções críticas foram implementadas e o sistema está operacional.

---

## 📦 O que foi corrigido

### 1. ✅ Rodadas criadas com status correto
- **Problema**: Rodadas eram criadas como 'scheduled' e is_selling=false
- **Solução**: Agora são criadas como 'selling' e is_selling=true
- **Arquivo**: `src/services/roundManager.js:52-62`

### 2. ✅ POST /purchases funcionando
- **Problema**: Erro 500 ao tentar criar usuário com colunas inexistentes
- **Solução**: Corrigido para usar coluna 'whatsapp' e gerar password_hash
- **Arquivo**: `src/routes/purchases.js:98-123`

### 3. ✅ Números de rodadas únicos
- **Problema**: Possível duplicação de números em race conditions
- **Solução**: Adicionado lock pessimista (FOR UPDATE)
- **Arquivo**: `src/services/roundManager.js:40-42`

### 4. ✅ Logs detalhados para debug
- **Adicionado**: 9 pontos de log no fluxo de compra
- **Arquivo**: `src/routes/purchases.js` (console.log 🔵 1-9)

### 5. ✅ Seed automático para desenvolvimento
- **Criado**: População automática de dados de teste
- **Arquivo**: `src/database/seed.js`
- **Credenciais padrão**:
  - Admin: admin@sortebem.com.br / admin123
  - Gerente: gerente@sortebem.com.br / gerente123
  - Estabelecimento: estabelecimento@sortebem.com.br / estab123

### 6. ✅ Lógica de criação automática de rodadas
- **Problema**: Criava rodadas em excesso por buscar apenas status 'scheduled'
- **Solução**: Agora verifica rodadas ativas (selling/drawing) e usa ends_at
- **Arquivo**: `src/services/roundManager.js:316-358`

---

## 🎯 Como o Sistema Funciona

### Ciclo de Vida das Rodadas

```
1. Cron Job (a cada 1 minuto)
   └─> checkAndCreateRounds()
       └─> Verifica se há rodadas ativas
           └─> Se não, cria nova rodada

2. Rodada Regular (10 min total)
   ├─> 0-7 min: SELLING (is_selling=true)
   ├─> 7-10 min: CLOSED (is_selling=false, aguardando sorteio)
   └─> 10+ min: DRAWING → FINISHED

3. Rodada Especial (15 min total)
   ├─> 0-10 min: SELLING
   ├─> 10-15 min: CLOSED
   └─> 15+ min: DRAWING → FINISHED
```

### Fluxo de Compra

```
POST /purchases
   ├─> 1. Validar dados (round_id, quantity, payment_method)
   ├─> 2. Verificar rodada (status='selling' AND is_selling=true)
   ├─> 3. Verificar disponibilidade de cartelas
   ├─> 4. Criar/buscar usuário (se email fornecido)
   ├─> 5. Criar registro de purchase
   ├─> 6. Gerar cartelas (generateCards)
   ├─> 7. Atualizar contador de vendas da rodada
   ├─> 8. Criar pagamento (PIX ou Cartão)
   └─> 9. Retornar dados do pagamento
```

---

## 🧪 Como Testar

### Opção 1: Script Automatizado (Recomendado)

```powershell
# Execute o script de testes
.\test-api.ps1
```

Este script testa:
- ✅ Health check (PostgreSQL + Redis)
- ✅ Listar rodadas disponíveis
- ✅ Criar compra com PIX
- ✅ Verificar status da compra
- ✅ Estatísticas públicas

### Opção 2: Testes Manuais

#### 1️⃣ Verificar Health
```powershell
Invoke-RestMethod -Uri "https://api.sortebem.com.br/health" -Method GET
```

**Resposta esperada**:
```json
{
  "ok": true,
  "postgres": true,
  "redis": true
}
```

#### 2️⃣ Listar Rodadas
```powershell
Invoke-RestMethod -Uri "https://api.sortebem.com.br/rounds" -Method GET
```

**Resposta esperada**:
```json
{
  "ok": true,
  "data": [
    {
      "id": 1,
      "number": 1,
      "type": "regular",
      "status": "selling",
      "is_selling": true,
      "card_price": "2.50",
      "max_cards": 10000,
      "cards_sold": 0,
      ...
    }
  ]
}
```

#### 3️⃣ Criar Compra PIX
```powershell
$body = @{
    round_id = 1  # Use ID do passo anterior
    quantity = 2
    payment_method = "pix"
    customer = @{
        name = "João Silva"
        email = "joao@example.com"
        phone = "11999999999"
    }
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "https://api.sortebem.com.br/purchases" `
    -Method POST `
    -ContentType "application/json" `
    -Body $body
```

**Resposta esperada**:
```json
{
  "ok": true,
  "data": {
    "id": 1,
    "purchase_id": 1,
    "round_id": 1,
    "round_number": 1,
    "quantity": 2,
    "total_amount": "5.00",
    "payment_method": "pix",
    "pix": {
      "code": "00020126580014br.gov.bcb.pix...",
      "qrcode": "data:image/png;base64,..."
    },
    "cards": [
      { "code": "ABC123" },
      { "code": "ABC124" }
    ]
  }
}
```

#### 4️⃣ Verificar Status da Compra
```powershell
Invoke-RestMethod -Uri "https://api.sortebem.com.br/purchases/1" -Method GET
```

#### 5️⃣ Ver Cartelas (após pagamento)
```powershell
Invoke-RestMethod -Uri "https://api.sortebem.com.br/purchases/1/cards" -Method GET
```

---

## ⚠️ Possíveis Erros e Soluções

### "Rodada não disponível para venda"
**Causas**:
- Rodada não existe
- Rodada não está em status='selling'
- Rodada está com is_selling=false (período de espera)

**Solução**:
1. Execute `GET /rounds` para ver rodadas disponíveis
2. Use um round_id de uma rodada com `status: "selling"` e `is_selling: true`
3. Se não houver rodadas, aguarde 1 minuto (cron cria automaticamente)

### "Gateway de pagamento não configurado"
**Causa**: Ambiente de produção sem credenciais de gateway

**Solução**:
- Em desenvolvimento: O sistema usa mock automático (não precisa configurar)
- Em produção: Configure credenciais em `/settings` (ver `docs/PAYMENT_GATEWAY_SETUP.md`)

### "Apenas X cartela(s) disponível(is)"
**Causa**: Quantidade solicitada excede disponibilidade da rodada

**Solução**:
- Reduza a quantidade
- Aguarde próxima rodada

---

## 🔧 Configuração para Produção

### 1. Variáveis de Ambiente
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379
JWT_SECRET=seu-secret-seguro-aqui
BOOTSTRAP_KEY=chave-bootstrap-segura
```

### 2. Gateway de Pagamento
Configure via endpoint `/settings` ou diretamente no banco:

```json
{
  "active_gateway": "asaas",
  "asaas": {
    "api_key": "sua-api-key",
    "sandbox": false
  }
}
```

### 3. WhatsApp (Opcional)
Para envio automático de cartelas:

```json
{
  "enabled": true,
  "instance_id": "seu-instance-id",
  "api_token": "seu-token"
}
```

---

## 📊 Monitoramento

### Logs do Sistema
```bash
# Ver logs em tempo real
docker logs -f sortebem-api

# Buscar logs específicos
docker logs sortebem-api | grep "🔵"  # Logs de compra
docker logs sortebem-api | grep "✓"   # Operações bem-sucedidas
docker logs sortebem-api | grep "❌"  # Erros
```

### Endpoints de Monitoramento

```powershell
# Health check
Invoke-RestMethod -Uri "https://api.sortebem.com.br/health"

# Estatísticas públicas
Invoke-RestMethod -Uri "https://api.sortebem.com.br/stats/tv"

# Rodadas ativas
Invoke-RestMethod -Uri "https://api.sortebem.com.br/rounds"
```

---

## 📚 Arquivos Importantes

- `FIXES_COMPLETED.md` - Lista completa de todas as correções
- `docs/PAYMENT_GATEWAY_SETUP.md` - Guia de configuração de pagamentos
- `test-api.ps1` - Script de testes automatizados
- `src/routes/purchases.js` - Endpoint de compras (com logs detalhados)
- `src/services/roundManager.js` - Gerenciamento de rodadas
- `src/database/seed.js` - Dados iniciais para desenvolvimento

---

## 🎉 Status Atual

✅ **Sistema 100% Operacional**

- Backend API funcionando corretamente
- Criação automática de rodadas
- Endpoint de compras funcionando
- Geração de cartelas funcionando
- PIX mock para desenvolvimento
- Logs detalhados para debug
- Dados de seed automáticos

**Pronto para testes e desenvolvimento!**

Para mais detalhes, consulte `FIXES_COMPLETED.md`.
