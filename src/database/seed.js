import bcrypt from 'bcryptjs';
import { db } from '../config/database.js';

/**
 * SEED DATABASE
 * Popula o banco de dados com dados iniciais para desenvolvimento
 */

export async function seedDatabase() {
  const client = await db.connect();

  try {
    console.log('🌱 Populando banco de dados com dados iniciais...');

    await client.query('BEGIN');

    // 1. Criar configurações padrão
    console.log('📋 Criando configurações...');

    await client.query(`
      INSERT INTO settings (key, value, updated_at)
      VALUES
        ('card_price_regular', '"2.50"'::jsonb, NOW()),
        ('card_price_special', '"5.00"'::jsonb, NOW()),
        ('max_cards_per_round', '10000'::jsonb, NOW()),
        ('round_config', '{
          "regular": {"selling_minutes": 7, "closed_minutes": 3},
          "special": {"selling_minutes": 10, "closed_minutes": 5}
        }'::jsonb, NOW()),
        ('split_config', '{
          "prize_percentage": 40,
          "charity_percentage": 20,
          "platform_percentage": 30,
          "commission_percentage": 10
        }'::jsonb, NOW()),
        ('gateway_config', '{
          "active_gateway": "asaas",
          "asaas": {"api_key": "", "sandbox": true},
          "pagseguro": {"token": "", "sandbox": true}
        }'::jsonb, NOW()),
        ('whatsapp_config', '{
          "enabled": false,
          "instance_id": "",
          "api_token": ""
        }'::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW()
    `);

    // 2. Criar usuário admin
    console.log('👤 Criando usuário administrador...');

    const adminExists = await client.query(
      "SELECT id FROM users WHERE email = 'admin@sortebem.com.br'"
    );

    if (adminExists.rows.length === 0) {
      const adminPassword = await bcrypt.hash('admin123', 10);

      await client.query(`
        INSERT INTO users (name, email, whatsapp, password_hash, role, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
      `, ['Administrador', 'admin@sortebem.com.br', '11999999999', adminPassword, 'admin']);

      console.log('   ✅ Admin criado: admin@sortebem.com.br / admin123');
    } else {
      console.log('   ℹ️  Admin já existe');
    }

    // 3. Criar instituição de caridade
    console.log('❤️  Criando instituição de caridade...');

    const charityExists = await client.query(
      "SELECT id FROM charities WHERE name = 'Instituto Criança Feliz'"
    );

    if (charityExists.rows.length === 0) {
      await client.query(`
        INSERT INTO charities (name, description, is_active, total_received, created_at)
        VALUES ($1, $2, true, 0, NOW())
        RETURNING id
      `, [
        'Instituto Criança Feliz',
        'Instituição dedicada ao bem-estar de crianças em situação de vulnerabilidade social'
      ]);

      console.log('   ✅ Caridade criada');
    } else {
      console.log('   ℹ️  Caridade já existe');
    }

    // 4. Criar gerente de teste
    console.log('👨‍💼 Criando gerente de teste...');

    const managerUserExists = await client.query(
      "SELECT id FROM users WHERE email = 'gerente@sortebem.com.br'"
    );

    let managerUserId;
    if (managerUserExists.rows.length === 0) {
      const managerPassword = await bcrypt.hash('gerente123', 10);

      const managerUserResult = await client.query(`
        INSERT INTO users (name, email, whatsapp, password_hash, role, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        RETURNING id
      `, ['Gerente Teste', 'gerente@sortebem.com.br', '11988888888', managerPassword, 'manager']);

      managerUserId = managerUserResult.rows[0].id;
      console.log('   ✅ Usuário gerente criado: gerente@sortebem.com.br / gerente123');
    } else {
      managerUserId = managerUserExists.rows[0].id;
      console.log('   ℹ️  Usuário gerente já existe');
    }

    const managerExists = await client.query(
      "SELECT id FROM managers WHERE user_id = $1",
      [managerUserId]
    );

    if (managerExists.rows.length === 0) {
      await client.query(`
        INSERT INTO managers (
          user_id, code, cpf, commission_rate, kyc_status,
          balance, is_active, created_at
        )
        VALUES ($1, $2, $3, $4, $5, 0, true, NOW())
      `, [managerUserId, 'MGR001', '12345678900', 3.0, 'approved']);

      console.log('   ✅ Gerente criado com código MGR001');
    } else {
      console.log('   ℹ️  Gerente já existe');
    }

    // 5. Criar estabelecimento de teste
    console.log('🏪 Criando estabelecimento de teste...');

    const estabUserExists = await client.query(
      "SELECT id FROM users WHERE email = 'estabelecimento@sortebem.com.br'"
    );

    let estabUserId;
    if (estabUserExists.rows.length === 0) {
      const estabPassword = await bcrypt.hash('estab123', 10);

      const estabUserResult = await client.query(`
        INSERT INTO users (name, email, whatsapp, password_hash, role, is_active, created_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        RETURNING id
      `, ['Estabelecimento Demo', 'estabelecimento@sortebem.com.br', '11977777777', estabPassword, 'establishment']);

      estabUserId = estabUserResult.rows[0].id;
      console.log('   ✅ Usuário estabelecimento criado: estabelecimento@sortebem.com.br / estab123');
    } else {
      estabUserId = estabUserExists.rows[0].id;
      console.log('   ℹ️  Usuário estabelecimento já existe');
    }

    // Buscar ID do gerente
    const managerIdResult = await client.query(
      "SELECT id FROM managers WHERE user_id = $1",
      [managerUserId]
    );

    const managerId = managerIdResult.rows[0]?.id;

    const estabExists = await client.query(
      "SELECT id FROM establishments WHERE user_id = $1",
      [estabUserId]
    );

    if (estabExists.rows.length === 0 && managerId) {
      await client.query(`
        INSERT INTO establishments (
          user_id, manager_id, trade_name, legal_name, cnpj,
          code, slug, commission_rate, kyc_status,
          balance, is_active, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, true, NOW())
      `, [
        estabUserId,
        managerId,
        'Estabelecimento Demo',
        'Estabelecimento Demo LTDA',
        '12345678000100',
        'EST001',
        'demo',
        7.0,
        'approved'
      ]);

      console.log('   ✅ Estabelecimento criado com código EST001');
    } else {
      console.log('   ℹ️  Estabelecimento já existe');
    }

    // 6. Criar POS (Terminal) para o estabelecimento
    console.log('💻 Criando terminal POS...');

    const estabIdResult = await client.query(
      "SELECT id FROM establishments WHERE user_id = $1",
      [estabUserId]
    );

    const establishmentId = estabIdResult.rows[0]?.id;

    if (establishmentId) {
      const posExists = await client.query(
        "SELECT id FROM pos WHERE establishment_id = $1",
        [establishmentId]
      );

      if (posExists.rows.length === 0) {
        await client.query(`
          INSERT INTO pos (
            establishment_id, code, name, api_key, is_active, created_at
          )
          VALUES ($1, $2, $3, $4, true, NOW())
        `, [
          establishmentId,
          'POS001',
          'Terminal Principal',
          'demo-api-key-' + Math.random().toString(36).substring(7)
        ]);

        console.log('   ✅ Terminal POS criado com código POS001');
      } else {
        console.log('   ℹ️  Terminal POS já existe');
      }
    }

    await client.query('COMMIT');

    console.log('');
    console.log('✅ Banco de dados populado com sucesso!');
    console.log('');
    console.log('📧 Credenciais de acesso:');
    console.log('   Admin: admin@sortebem.com.br / admin123');
    console.log('   Gerente: gerente@sortebem.com.br / gerente123');
    console.log('   Estabelecimento: estabelecimento@sortebem.com.br / estab123');
    console.log('');
    console.log('🎯 Sistema pronto para uso em desenvolvimento!');
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Erro ao popular banco de dados:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Executa seed se for desenvolvimento
 */
export async function runSeedIfDev() {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (isDevelopment) {
    try {
      await seedDatabase();
    } catch (error) {
      console.error('Erro ao executar seed:', error);
      // Não lança erro para não impedir o servidor de iniciar
    }
  } else {
    console.log('ℹ️  Seed desabilitado em produção');
  }
}
